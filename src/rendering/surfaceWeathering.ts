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

/** Object-space detail also works on armor polyhedra and roofs without UVs. */
export const armorWeathering: MeshStandardMaterial['onBeforeCompile'] = (shader) => {
  shader.vertexShader = 'varying vec3 vSurfacePosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nvSurfacePosition = position;');
  shader.fragmentShader = noise + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    float mottling = surfaceNoise(vSurfacePosition * 7.0);
    float grit = surfaceNoise(vSurfacePosition * 155.0);
    float wear = smoothstep(0.69, 0.88, surfaceNoise(vSurfacePosition * 42.0));
    diffuseColor.rgb *= 0.82 + mottling * 0.32;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.105, 0.084, 0.055), wear * 0.5);
    diffuseColor.rgb += (grit - 0.5) * 0.018;
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
    #include <roughnessmap_fragment>
    roughnessFactor = clamp(roughnessFactor + (mottling - 0.5) * 0.18 - wear * 0.18, 0.4, 1.0);
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
    #include <normal_fragment_maps>
    // Fine cast-steel relief in view space, with derivative filtering at distance.
    vec3 surfDx = dFdx(vViewPosition), surfDy = dFdy(vViewPosition);
    vec3 tangentX = cross(surfDy, normal), tangentY = cross(normal, surfDx);
    float determinant = dot(surfDx, tangentX);
    vec3 gradient = sign(determinant) * (dFdx(grit) * tangentX + dFdy(grit) * tangentY);
    normal = normalize(abs(determinant) * normal - 0.0009 * gradient);
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
export function createCamouflageWeathering(pattern: CamouflageShaderPattern, colorA: Color, colorB: Color): MeshStandardMaterial['onBeforeCompile'] {
  return (shader, renderer) => {
    armorWeathering(shader, renderer);
    shader.uniforms.camoColorA = { value: colorA };
    shader.uniforms.camoColorB = { value: colorB };
    shader.vertexShader = 'attribute float camoSeed;\nvarying float vCamoSeed;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvCamoSeed = camoSeed;');
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `
      #define CAMO_PATTERN ${CAMOUFLAGE_PATTERNS[pattern]}
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
          // Brushed whitewash worn through in vertical streaks, with grime.
          float wash = camoEdge(camoFbm(camoP * vec3(1.6, 0.3, 1.6)), 0.41);
          vec3 grime = camoColorA * (0.82 + 0.18 * surfaceNoise(camoP * 9.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, grime, wash);
        #endif
      }`);
  };
}

/** Leafy mottling for instanced hedges: dark hollows and lighter sunlit clumps in world space. */
export const foliageWeathering: MeshStandardMaterial['onBeforeCompile'] = (shader) => {
  shader.vertexShader = 'varying vec3 vSurfacePosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    #ifdef USE_INSTANCING
      vSurfacePosition = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
    #else
      vSurfacePosition = (modelMatrix * vec4(position, 1.0)).xyz;
    #endif`);
  shader.fragmentShader = noise + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    float clumps = surfaceNoise(vSurfacePosition * 2.3);
    float leaves = surfaceNoise(vSurfacePosition * 11.0);
    diffuseColor.rgb *= 0.62 + clumps * 0.45 + leaves * 0.22;
  `);
};
