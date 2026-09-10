// Adapted from three-hex-tiling 0.1.5 (MIT). See three-hex-tiling.LICENSE.
// Three r183 decodes sRGB texture reads in hardware; keep data/normal reads linear.
#define rnd22(p) fract(sin((p) * mat2(127.1, 311.7, 269.5, 183.3)) * 43758.5453)

#define srgb2rgb(V) (V) 
#define rgb2srgb(V) (V)

#define C(I)  (srgb2rgb(textureGrad(samp, U / hexTilingPatchScale - rnd22(I), Gx, Gy)) - meanColor * float(hexTilingUseContrastCorrectedBlending))

uniform bool hexTilingUseContrastCorrectedBlending; 
uniform float hexTilingPatchScale;
uniform float hexTilingLookupSkipThreshold;
uniform float hexTilingTextureSampleCoefficientExponent;

vec4 textureNoTileNeyret(sampler2D samp, vec2 uv, vec2 uvDx, vec2 uvDy) {
    mat2 M0 = mat2(1, 0, .5, sqrt(3.) / 2.);
    mat2 M = inverse(M0);
    vec2 U = uv * hexTilingPatchScale / 8. * exp2(4. * 0.2 + 1.);
    vec2 V = M * U;
    vec2 I = floor(V);
    vec2 Gx = uvDx * 0.4352752816, Gy = uvDy * 0.4352752816;

    vec4 meanColor = hexTilingUseContrastCorrectedBlending ? srgb2rgb(texture(samp, U, 99.)) : vec4(0.);

    vec3 F = vec3(fract(V), 0), W;
    F.z = 1. - F.x - F.y;
    vec4 fragColor = vec4(0.);

    if (F.z > 0.) {
        W = vec3(F.z, F.y, F.x);
        W = pow(W, vec3(hexTilingTextureSampleCoefficientExponent));
        W = W / dot(W, vec3(1.));

        if (W.x > hexTilingLookupSkipThreshold) {
            fragColor += C(I) * W.x;
        }
        if (W.y > hexTilingLookupSkipThreshold) {
            fragColor += C(I + vec2(0, 1)) * W.y;
        }
        if (W.z > hexTilingLookupSkipThreshold) {
            fragColor += C(I + vec2(1, 0)) * W.z;
        }
    } else {
        W = vec3(-F.z, 1. - F.y, 1. - F.x);
        W = pow(W, vec3(hexTilingTextureSampleCoefficientExponent));
        W = W / dot(W, vec3(1.));

        if (W.x > hexTilingLookupSkipThreshold) {
            fragColor += C(I + 1.) * W.x;
        }
        if (W.y > hexTilingLookupSkipThreshold) {
            fragColor += C(I + vec2(1, 0)) * W.y;
        }
        if (W.z > hexTilingLookupSkipThreshold) {
            fragColor += C(I + vec2(0, 1)) * W.z;
        }
    }

    fragColor = hexTilingUseContrastCorrectedBlending ? meanColor + fragColor / length(W) : fragColor;

    fragColor = clamp(rgb2srgb(fragColor), 0., 1.);

    return fragColor;
}