import type { Color, MeshStandardMaterial } from 'three';

const noise = `
  varying vec3 vSurfacePosition;
  float surfaceHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float surfaceNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(surfaceHash(i), surfaceHash(i + vec3(1,0,0)), f.x),
      mix(surfaceHash(i + vec3(0,1,0)), surfaceHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(surfaceHash(i + vec3(0,0,1)), surfaceHash(i + vec3(1,0,1)), f.x),
      mix(surfaceHash(i + vec3(0,1,1)), surfaceHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

// Minimum strength of the sky reflection on armour paint. At 0.45 with a
// satin finish the tanks read as moulded plastic.
const ARMOR_SKY_REFLECTION = 0.2;
// Surface relief of the paint, in metres of height: a fine orange-peel and
// brush texture (features about 4 cm across) over a broader ripple in the
// steel beneath it (about 10 cm).
const PAINT_GRAIN_DEPTH = 0.0013;
const STEEL_RIPPLE_DEPTH = 0.005;

/**
 * Armour paint: a clean, flat-finish coat. Colour varies only broadly and
 * faintly across a plate; no chips, grit or speckle, which read as dirt on a
 * vehicle at every range. The rough look lives in the light instead: a fine
 * relief in the normal and a matching patchiness in the roughness break up
 * highlights the way brushed or sprayed field paint does, with no change to
 * the colour. The relief fades out as its features shrink below a pixel.
 * Object space, so it also works on armour polyhedra without UVs.
 */
export const armorWeathering: MeshStandardMaterial['onBeforeCompile'] = (shader) => {
  shader.vertexShader = 'varying vec3 vSurfacePosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nvSurfacePosition = position;');
  shader.fragmentShader = noise + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    float paintTone = surfaceNoise(vSurfacePosition * 1.6);
    diffuseColor.rgb *= 0.97 + paintTone * 0.06;
    // Metres of surface per pixel: fade detail before it aliases.
    float paintFootprint = length(fwidth(vSurfacePosition));
    float grainFade = 1.0 - smoothstep(0.02, 0.05, paintFootprint);
    float rippleFade = 1.0 - smoothstep(0.06, 0.15, paintFootprint);
    float paintGrain = surfaceNoise(vSurfacePosition * 24.0) * 0.6 + surfaceNoise(vSurfacePosition * 51.0 + 17.3) * 0.4;
    float steelRipple = surfaceNoise(vSurfacePosition * vec3(9.0, 6.0, 9.0) + 5.1);
    float paintHeight = paintGrain * ${PAINT_GRAIN_DEPTH} * grainFade + steelRipple * ${STEEL_RIPPLE_DEPTH} * rippleFade;
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
    #include <roughnessmap_fragment>
    roughnessFactor = clamp(roughnessFactor + (paintTone - 0.5) * 0.08 + (paintGrain - 0.5) * 0.14 * grainFade, 0.5, 1.0);
  `);
  // Bump from the screen-space derivative of the height, as three's bump map.
  shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
    #include <normal_fragment_maps>
    {
      vec3 paintDx = dFdx(-vViewPosition), paintDy = dFdy(-vViewPosition);
      vec3 paintR1 = cross(paintDy, normal), paintR2 = cross(normal, paintDx);
      float paintDet = dot(paintDx, paintR1);
      vec3 paintGrad = sign(paintDet) * (dFdx(paintHeight) * paintR1 + dFdy(paintHeight) * paintR2);
      normal = normalize(abs(paintDet) * normal - paintGrad);
    }
  `);
  // The battlefield keeps its shared sky light low so grass and walls do not
  // glow, which left armour reflecting almost nothing: every plate facing away
  // from the sun read as one flat shade. Armour reflects the sky at no less
  // than ARMOR_SKY_REFLECTION, so Fresnel still picks out plates seen edge-on.
  // The reflection is mostly desaturated so grey armour does not turn blue.
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `
    #include <lights_fragment_maps>
    #ifdef USE_ENVMAP
      radiance *= max(1.0, ${ARMOR_SKY_REFLECTION.toFixed(2)} / max(envMapIntensity, 1e-3));
      radiance = mix(vec3(dot(radiance, vec3(0.2126, 0.7152, 0.0722))), radiance, 0.3);
    #endif
  `);
};

export const masonryWeathering: MeshStandardMaterial['onBeforeCompile'] = (shader) => {
  shader.vertexShader = 'varying vec3 vSurfacePosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nvSurfacePosition = (modelMatrix * vec4(position, 1.0)).xyz;');
  shader.fragmentShader = noise + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    float weather = surfaceNoise(vSurfacePosition * vec3(1.8, 0.35, 1.8));
    float aggregate = surfaceNoise(vSurfacePosition * 35.0);
    diffuseColor.rgb *= 0.72 + weather * 0.36 + aggregate * 0.15;
  `);
};

const CAMOUFLAGE_PATTERNS = { blotches: 1, bands: 2, ambush: 3, whitewash: 4 } as const;
export type CamouflageShaderPattern = keyof typeof CAMOUFLAGE_PATTERNS;

/**
 * Armour weathering plus a procedural paint scheme over the base coat, in the
 * same object space (slot space for merged tanks, so paint follows the turret).
 * Colours are linear RGB. Needs a per-vertex `camoSeed` attribute.
 */
export function createCamouflageWeathering(pattern: CamouflageShaderPattern, colorA: Color, colorB: Color, groundWear = false): MeshStandardMaterial['onBeforeCompile'] {
  return (shader, renderer) => {
    armorWeathering(shader, renderer);
    shader.uniforms.camoColorA = { value: colorA };
    shader.uniforms.camoColorB = { value: colorB };
    shader.vertexShader = 'attribute float camoSeed;\nvarying float vCamoSeed;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvCamoSeed = camoSeed;');
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `
      #define CAMO_PATTERN ${CAMOUFLAGE_PATTERNS[pattern]}
      #define CAMO_GROUND_WEAR ${groundWear ? 1 : 0}
      uniform vec3 camoColorA, camoColorB;
      varying float vCamoSeed;
      float camoFbm(vec3 p) {
        return surfaceNoise(p) * 0.55 + surfaceNoise(p * 2.07 + 13.1) * 0.3 + surfaceNoise(p * 4.3 + 7.7) * 0.15;
      }
      // Soft sprayed edge a few centimetres wide.
      float camoEdge(float value, float threshold) { return smoothstep(threshold - 0.02, threshold + 0.02, value); }
      void main() {`);
    // Runs before the weathering block, so wear and grime sit on top of the paint.
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 camoP = vSurfacePosition + vCamoSeed * vec3(7.31, 3.17, 5.53);
        #if CAMO_PATTERN == 1
          // Large hard-edged patches of a second colour (1937-40 grey/brown).
          diffuseColor.rgb = mix(diffuseColor.rgb, camoColorA, camoEdge(camoFbm(camoP * 0.85), 0.56));
        #elif CAMO_PATTERN == 2 || CAMO_PATTERN == 3
          // Wavy, mostly vertical bands of olive and red-brown over Dunkelgelb.
          // Roughly 40% olive and 20% red-brown, bands about half a metre wide.
          vec3 bandP = camoP * vec3(1.2, 0.55, 1.2);
          bandP.xz += (surfaceNoise(camoP * 0.5) - 0.5) * 1.0;
          float olive = camoEdge(camoFbm(bandP), 0.53);
          float brown = camoEdge(camoFbm(bandP + vec3(31.7, 5.3, 17.9)), 0.55) * (1.0 - olive);
          vec3 base = diffuseColor.rgb;
          diffuseColor.rgb = mix(mix(base, camoColorA, olive), camoColorB, brown);
          #if CAMO_PATTERN == 3
            // Ambush dots: light dots on the dark bands, dark dots on the yellow.
            // Dots about 9 cm across on a 25 cm grid.
            vec3 cell = floor(camoP * 4.0);
            vec3 local = fract(camoP * 4.0) - 0.5 - (vec3(surfaceHash(cell), surfaceHash(cell + 3.1), surfaceHash(cell + 7.9)) - 0.5) * 0.25;
            float dotMask = (1.0 - smoothstep(0.16, 0.19, length(local))) * step(0.3, surfaceHash(cell + 11.3));
            float dark = clamp(olive + brown, 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(camoColorA, base, dark), dotMask);
          #endif
        #elif CAMO_PATTERN == 4
          // Near-complete whitewash. The base coat shows only where crews and
          // mud wore it off: heavy along the hull's lower edge (skirts, hull
          // bottom), fading upward, plus sparse small scuffs everywhere. Turret
          // and gun sit well clear of the mud: scuffs only.
          float lowWear = CAMO_GROUND_WEAR == 1 ? 1.0 - smoothstep(0.2, 0.8, vSurfacePosition.y) : 0.0;
          float streaks = camoFbm(camoP * vec3(3.2, 0.8, 3.2));
          float scuffs = camoFbm(camoP * 6.0);
          float worn = max(camoEdge(streaks, 0.74 - 0.24 * lowWear), camoEdge(scuffs, 0.76));
          vec3 grime = camoColorA * (0.86 + 0.14 * surfaceNoise(camoP * 9.0));
          diffuseColor.rgb = mix(grime, diffuseColor.rgb, worn * (0.55 + 0.45 * lowWear));
        #endif
      }`);
  };
}
