import type { MeshStandardMaterial } from 'three';
import { masonryWeathering } from './surfaceWeathering';

/**
 * Procedural coursing for building materials that have no UVs: brickwork,
 * ashlar and rubble walls, clay tile, slate and thatch roofs.
 *
 * The frame comes from the world-space surface: u runs horizontally along the
 * surface, v up the wall or up the roof slope, so coursing stays level on
 * walls and runs across the slope on roofs. Each pattern fades to its average
 * colour before its courses shrink below a few pixels, so it never shimmers
 * at range.
 */

export type MasonryPattern = 'brick' | 'ashlar' | 'rubble' | 'tile' | 'slate' | 'thatch';

const PATTERN_ID: Record<MasonryPattern, number> = { brick: 1, ashlar: 2, rubble: 3, tile: 4, slate: 5, thatch: 6 };

const patternGlsl = /* glsl */ `
  varying vec3 vPatternNormal;
  float patternHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 patternHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  /** 1 while a period of the coordinate still spans a few pixels, 0 once it would alias. */
  float patternDetail(float coordinate, float period) {
    float footprint = length(vec2(dFdx(coordinate), dFdy(coordinate)));
    return 1.0 - smoothstep(0.18, 0.45, footprint / period);
  }
  /** Mortar joint weight for a running-bond cell grid of size (w, h), rows offset by half. */
  float bondJoint(vec2 uv, vec2 size, float joint, out vec2 cell) {
    float row = floor(uv.y / size.y);
    float shifted = uv.x / size.x + mod(row, 2.0) * 0.5;
    cell = vec2(floor(shifted), row);
    vec2 f = vec2(fract(shifted), fract(uv.y / size.y));
    float edge = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
    return 1.0 - smoothstep(joint * 0.5, joint, edge);
  }
`;

const patternFragment = /* glsl */ `
  {
    vec3 pn = normalize(vPatternNormal);
    vec3 pt = abs(pn.y) > 0.97 ? vec3(1.0, 0.0, 0.0) : normalize(cross(vec3(0.0, 1.0, 0.0), pn));
    vec3 pb = cross(pn, pt);
    vec2 puv = vec2(dot(vSurfacePosition, pt), dot(vSurfacePosition, pb));
    vec2 cell;
    vec3 base = diffuseColor.rgb;
    #if MASONRY_PATTERN == 1
      // Picard brick: 22 x 6.5 cm bricks, pale lime mortar, the odd overburnt brick.
      float detail = patternDetail(puv.y, 0.12);
      float joint = bondJoint(puv, vec2(0.235, 0.075), 0.012, cell);
      float tone = patternHash(cell);
      // Firing varies across a wall in patches, which still reads where single bricks do not.
      float batch = surfaceNoise(vec3(puv * vec2(0.9, 2.2), 5.1));
      vec3 wallTone = base * mix(vec3(0.86, 0.9, 0.92), vec3(1.08, 1.0, 0.94), batch);
      vec3 brick = wallTone * (0.84 + tone * 0.3) * mix(vec3(1.0), vec3(0.62, 0.55, 0.55), step(0.9, tone));
      vec3 mortar = vec3(0.4, 0.36, 0.31);
      diffuseColor.rgb = mix(mix(wallTone, mortar, 0.06), mix(brick, mortar, joint), detail);
    #elif MASONRY_PATTERN == 2
      // Dressed limestone ashlar in 32 cm courses with fine joints.
      float detail = patternDetail(puv.y, 0.32);
      float joint = bondJoint(puv, vec2(0.62, 0.32), 0.014, cell);
      float tone = patternHash(cell);
      diffuseColor.rgb = mix(base, mix(base * (0.9 + tone * 0.18), base * 0.72, joint), detail);
    #elif MASONRY_PATTERN == 3
      // Random rubble: irregular stones in a Voronoi cell pattern, darker mortar.
      float detail = patternDetail(puv.y, 0.25);
      vec2 g = puv / vec2(0.34, 0.22);
      vec2 gi = floor(g), gf = fract(g);
      float d1 = 8.0, d2 = 8.0;
      vec2 nearest = gi;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 o = vec2(i, j);
        vec2 r = o + patternHash2(gi + o) * 0.85 - gf;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; nearest = gi + o; } else if (d < d2) d2 = d;
      }
      float joint = 1.0 - smoothstep(0.02, 0.09, sqrt(d2) - sqrt(d1));
      float tone = patternHash(nearest);
      vec3 stone = base * (0.8 + tone * 0.38) * mix(vec3(1.0), vec3(1.05, 0.98, 0.88), step(0.7, tone));
      diffuseColor.rgb = mix(base, mix(stone, base * 0.55, joint), detail);
    #elif MASONRY_PATTERN == 4
      // Flat clay tiles in 24 cm courses: each course throws a shadow line on the one below.
      float detail = patternDetail(puv.y, 0.24);
      float joint = bondJoint(puv, vec2(0.19, 0.24), 0.01, cell);
      float course = fract(puv.y / 0.24);
      float tone = patternHash(cell);
      vec3 tile = base * (0.82 + tone * 0.32) * mix(vec3(1.0), vec3(0.8, 0.86, 0.7), step(0.88, tone));
      tile *= mix(0.62, 1.0, smoothstep(0.0, 0.22, course));
      diffuseColor.rgb = mix(base * 0.9, mix(tile, tile * 0.7, joint), detail);
    #elif MASONRY_PATTERN == 5
      // Welsh slate in 20 cm courses, staggered, with a sheen varying slate to slate.
      float detail = patternDetail(puv.y, 0.2);
      float joint = bondJoint(puv, vec2(0.3, 0.2), 0.008, cell);
      float course = fract(puv.y / 0.2);
      float tone = patternHash(cell);
      vec3 slate = base * (0.86 + tone * 0.26) * mix(0.7, 1.0, smoothstep(0.0, 0.16, course));
      diffuseColor.rgb = mix(base * 0.92, mix(slate, slate * 0.6, joint), detail);
    #elif MASONRY_PATTERN == 6
      // Thatch: reed ends combed down the slope, laid in courses, weathered in patches.
      float detail = patternDetail(puv.x, 0.06);
      float reeds = surfaceNoise(vec3(puv.x * 34.0, puv.y * 1.6, 3.7)) * 0.6 + surfaceNoise(vec3(puv.x * 90.0, puv.y * 3.0, 9.1)) * 0.4;
      float course = fract(puv.y / 0.34);
      float streak = mix(0.8, 1.12, reeds) * mix(0.8, 1.0, smoothstep(0.0, 0.3, course));
      float weathered = smoothstep(0.45, 0.8, surfaceNoise(vec3(puv * 0.35, 1.3)));
      vec3 thatch = mix(base, base * vec3(0.78, 0.8, 0.74), weathered) * mix(1.0, streak, detail);
      diffuseColor.rgb = thatch;
    #endif
  }
`;

/**
 * Masonry weathering plus the pattern's coursing. Each pattern compiles to its
 * own program; every material using a pattern shares it.
 */
export function createMasonryPattern(pattern: MasonryPattern): MeshStandardMaterial['onBeforeCompile'] {
  return (shader, renderer) => {
    masonryWeathering(shader, renderer);
    shader.vertexShader = 'varying vec3 vPatternNormal;\n' + shader.vertexShader.replace('#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nvPatternNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `#define MASONRY_PATTERN ${PATTERN_ID[pattern]}\n${patternGlsl}\nvoid main() {`)
      // Coursing sets the base tones; the weathering that follows sits on top.
      .replace('#include <color_fragment>', `#include <color_fragment>\n${patternFragment}`);
  };
}
