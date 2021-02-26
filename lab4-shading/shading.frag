#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

///////////////////////////////////////////////////////////////////////////////
// Material
///////////////////////////////////////////////////////////////////////////////
uniform vec3 material_color;
uniform float material_reflectivity;
uniform float material_metalness;
uniform float material_fresnel;
uniform float material_shininess;
uniform float material_emission;

uniform int has_color_texture;
layout(binding = 0) uniform sampler2D colorMap;

///////////////////////////////////////////////////////////////////////////////
// Environment
///////////////////////////////////////////////////////////////////////////////
layout(binding = 6) uniform sampler2D environmentMap;
layout(binding = 7) uniform sampler2D irradianceMap;
layout(binding = 8) uniform sampler2D reflectionMap;
uniform float environment_multiplier;

///////////////////////////////////////////////////////////////////////////////
// Light source
///////////////////////////////////////////////////////////////////////////////
uniform vec3 point_light_color = vec3(1.0, 1.0, 1.0);
uniform float point_light_intensity_multiplier = 50.0;

///////////////////////////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////////////////////////
#define PI 3.14159265359

///////////////////////////////////////////////////////////////////////////////
// Input varyings from vertex shader
///////////////////////////////////////////////////////////////////////////////
in vec2 texCoord;
in vec3 viewSpaceNormal;
in vec3 viewSpacePosition;

///////////////////////////////////////////////////////////////////////////////
// Input uniform variables
///////////////////////////////////////////////////////////////////////////////
uniform mat4 viewInverse;
uniform vec3 viewSpaceLightPosition;

///////////////////////////////////////////////////////////////////////////////
// Output color
///////////////////////////////////////////////////////////////////////////////
layout(location = 0) out vec4 fragmentColor;


vec3 calculateDirectIllumiunation(vec3 wo, vec3 n, vec3 base_color)
{
	///////////////////////////////////////////////////////////////////////////
	// Task 1.2 - Calculate the radiance Li from the light, and the direction
	//            to the light. If the light is backfacing the triangle,
	//            return vec3(0);
	///////////////////////////////////////////////////////////////////////////
	vec3 wi = viewSpaceLightPosition - viewSpacePosition;
	float d = length(wi);
	wi = normalize(wi);
	vec3 li = point_light_intensity_multiplier * point_light_color * (1.0 / (d*d));
	
	///////////////////////////////////////////////////////////////////////////
	// Task 1.3 - Calculate the diffuse term and return that as the result
	///////////////////////////////////////////////////////////////////////////

	vec3 diffuse_term = vec3(0.0, 0.0, 0.0);
	float ndotWi = dot(n, wi);


	if(ndotWi > 0)
	{
		diffuse_term = material_color * (1.0/PI) * abs(ndotWi) * li;
	}

	///////////////////////////////////////////////////////////////////////////
	// Task 2 - Calculate the Torrance Sparrow BRDF and return the light
	//          reflected from that instead
	///////////////////////////////////////////////////////////////////////////
	vec3 wh = normalize(wi + wo);
	float ndotWh = dot(n, wh);
	float ndotWo = dot(n, wo);
	float wodotWh = dot(wo, wh);
    
	float fresnelWi = material_fresnel + (1 - material_fresnel) * pow((1 - dot(wh, wi)), 5);

	float s = material_shininess;
	float microDistFunc = ((s + 2.0)/ (2.0 * PI))  * pow(ndotWh, s);
	float shadowMaskFunc = min(1, min(2 * (ndotWh * ndotWo) / wodotWh, 2 * (ndotWh * ndotWi) / wodotWh));


	float denom = (4 * ndotWo * ndotWi);
	float brdf = fresnelWi * microDistFunc * shadowMaskFunc / (4 * ndotWo * ndotWi);
	if(denom <= 0.0 || ndotWi <= 0)
	{
		brdf = 0.0;
	}

	///////////////////////////////////////////////////////////////////////////
	// Task 3 - Make your shader respect the parameters of our material model.
	///////////////////////////////////////////////////////////////////////////
	vec3 dielectric_term = brdf * ndotWi * li + (1-fresnelWi) * diffuse_term;
	vec3 metal_term = brdf * material_color * ndotWi * li;
	float m = material_metalness;
	float r = material_reflectivity;

	vec3 microfacet_term = m * metal_term + (1 - m) * dielectric_term;
	

	//return diffuse_term;
	return r * microfacet_term + (1-r) * diffuse_term;
}

vec3 calculateIndirectIllumination(vec3 wo, vec3 n, vec3 base_color)
{
	vec3 indirect_illum = vec3(0.f);
	///////////////////////////////////////////////////////////////////////////
	// Task 5 - Lookup the irradiance from the irradiance map and calculate
	//          the diffuse reflection
	///////////////////////////////////////////////////////////////////////////
	vec3 nws = vec3(viewInverse * vec4(n, 1.0));

	// Calculate the world-space direction from the camera to that position
	vec3 dir = normalize(nws);

	// Calculate the spherical coordinates of the direction
	float theta = acos(max(-1.0f, min(1.0f, dir.y)));
	float phi = atan(dir.z, dir.x);
	if(phi < 0.0f)
	{
		phi = phi + 2.0f * PI;
	}
	vec2 lookup = vec2(phi / (2.0 * PI), theta / PI);
	vec4 irradiance = environment_multiplier * texture(environmentMap, lookup);

	vec4 diffuse_term = vec4(material_color,1.0) * (1.0 / PI) * irradiance;
	///////////////////////////////////////////////////////////////////////////
	// Task 6 - Look up in the reflection map from the perfect specular
	//          direction and calculate the dielectric and metal terms.
	///////////////////////////////////////////////////////////////////////////
	vec3 wi = normalize(-reflect(wo,n));

	dir = normalize (vec3(viewInverse * vec4 (wi,0.0f)));

	theta = acos(max(-1.0f, min(1.0f, dir.y)));
	phi = atan(dir.z, dir.x);
	if(phi < 0.0f)
	{
		phi = phi + 2.0f * PI;
	}
	// Use these to lookup the color in the environment map
	lookup = vec2(phi / (2.0 * PI), theta / PI);

	float s = material_shininess;
	float roughness = sqrt(sqrt(2/(s+2)));
	
	vec3 Li = environment_multiplier * textureLod(reflectionMap, lookup, roughness * 7.0).xyz;

	vec3 wh = normalize(wi + wo);
    
	float fresnelWi = material_fresnel + (1 - material_fresnel) * pow((1 - dot(wh, wi)), 5);

	vec3 dielectric_term = fresnelWi * Li + (1 - fresnelWi) * vec3(diffuse_term);
	vec3 metal_term = fresnelWi * material_color * Li;

	float m = material_metalness;
	float r = material_reflectivity;

	vec3 microfacet_term = m * metal_term + (1 - m) * dielectric_term;
	
	return r * microfacet_term + (1 - r) * vec3(diffuse_term);
}


void main()
{
	///////////////////////////////////////////////////////////////////////////
	// Task 1.1 - Fill in the outgoing direction, wo, and the normal, n. Both
	//            shall be normalized vectors in view-space.
	///////////////////////////////////////////////////////////////////////////
	vec3 wo = normalize(vec3(0.0, 0.0, 0.0) - viewSpacePosition);
	vec3 n = normalize(viewSpaceNormal);

	vec3 base_color = material_color;
	if(has_color_texture == 1)
	{
		base_color *= texture(colorMap, texCoord).xyz;
	}

	vec3 direct_illumination_term = vec3(0.0);
	{ // Direct illumination
		direct_illumination_term = calculateDirectIllumiunation(wo, n, base_color);
	}

	vec3 indirect_illumination_term = vec3(0.0);
	{ // Indirect illumination
		indirect_illumination_term = calculateIndirectIllumination(wo, n, base_color);
	}

	///////////////////////////////////////////////////////////////////////////
	// Task 1.4 - Make glowy things glow!
	///////////////////////////////////////////////////////////////////////////
	vec3 emission_term = material_emission * material_color;

	vec3 final_color = direct_illumination_term + indirect_illumination_term + emission_term;

	// Check if we got invalid results in the operations
	if(any(isnan(final_color)))
	{
		final_color.xyz = vec3(1.f, 0.f, 1.f);
	}

	fragmentColor.xyz = final_color;
}
