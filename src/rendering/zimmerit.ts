import type { MeshStandardMaterial } from 'three';

/**
 * Zimmerit, the anti-magnetic paste German factories applied to vertical and
 * sloped armour from August/September 1943 to September 1944: about 6 mm of
 * paste combed or troweled into ridges.
 *
 * No texture and no extra geometry. A height field is evaluated in slot space
 * and its gradient is taken analytically along the plate's own tangent frame
 * (passed from the vertex shader), so the ridges shade as rounded crests with
 * real light and shadow. Screen-space derivative bump was tried first; it
 * quantised to 2x2 pixel blocks and read as cork rather than relief.
 *
 * - `ribbed` (pattern 1, the most common on Tiger I and Panzer IV): vertical
 *   columns about 12 cm wide, each combed separately, of horizontal ridges
 *   about 2.8 cm apart. Ridges wander and step at every column joint.
 * - `waffle` (pattern 6): 11 cm squares whose ridges alternate horizontal and
 *   vertical.
 *
 * Grooves take deep occlusion and the paste is matte; patches have broken
 * away to bare plate. The ridges fade to their average before they alias.
 * Needs the per-vertex `zimmeritMask` attribute (1 on coated plates) that
 * MergedSlot bakes; hinges, tools, fittings and side skirts are left bare.
 */

export type ZimmeritPattern = 'ribbed' | 'waffle';

const PATTERN_ID: Record<ZimmeritPattern, number> = { ribbed: 1, waffle: 2 };

/** Apply after armour weathering (it provides vSurfacePosition and surfaceNoise). */
export function zimmeritShader(pattern: ZimmeritPattern): MeshStandardMaterial['onBeforeCompile'] {
  return (shader) => {
    shader.vertexShader = `
      attribute float zimmeritMask;
      varying float vZimMask;
      varying vec3 vZimNormal;
      varying vec3 vZimTangentView;
      varying vec3 vZimBitangentView;
    ` + shader.vertexShader.replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      {
        vec3 zn = normalize(objectNormal);
        vec3 zt = normalize(cross(vec3(0.0, 1.0, 0.0), zn) + vec3(1e-4, 0.0, 0.0));
        vec3 zb = cross(zn, zt);
        vZimMask = zimmeritMask;
        vZimNormal = zn;
        vZimTangentView = normalize(normalMatrix * zt);
        vZimBitangentView = normalize(normalMatrix * zb);
      }
    `);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `
        #define ZIMMERIT_PATTERN ${PATTERN_ID[pattern]}
        varying float vZimMask;
        varying vec3 vZimNormal;
        varying vec3 vZimTangentView;
        varying vec3 vZimBitangentView;
        const float ZIM_TAU = 6.2831853;
        void main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Height (0..1) and its gradient along the plate tangent (u) and up the plate (v).
        float zimH = 0.5;
        vec2 zimGrad = vec2(0.0);
        float zimCoat = 0.0;
        {
          vec3 zn = normalize(vZimNormal);
          vec3 zt = normalize(cross(vec3(0.0, 1.0, 0.0), zn) + vec3(1e-4, 0.0, 0.0));
          vec3 zb = cross(zn, zt);
          float zu = dot(vSurfacePosition, zt);
          float zv = dot(vSurfacePosition, zb);
          float upright = 1.0 - smoothstep(0.6, 0.85, abs(zn.y));
          // Patches where the paste broke away, showing the plate beneath.
          float broken = smoothstep(0.76, 0.8, surfaceNoise(vSurfacePosition * 4.3 + 5.3));
          zimCoat = clamp(vZimMask, 0.0, 1.0) * upright * (1.0 - broken);
          #if ZIMMERIT_PATTERN == 1
            float colWidth = 0.12;
            float col = floor(zu / colWidth);
            float colHash = fract(sin(col * 91.3 + 7.1) * 43758.5453);
            float along = zv / 0.028 + colHash * 7.0;
            // Ridges wander with the comb: slow waves and a small tilt per column.
            along += sin(zu * 31.0 + col * 1.7) * 0.18 + (colHash - 0.5) * zu * 9.0;
            float dAlongDu = cos(zu * 31.0 + col * 1.7) * 31.0 * 0.18 + (colHash - 0.5) * 9.0;
            float dAlongDv = 1.0 / 0.028;
            float edge = abs(fract(zu / colWidth) - 0.5) * 2.0;
          #else
            float square = 0.11;
            vec2 cell = floor(vec2(zu, zv) / square);
            bool across = mod(cell.x + cell.y, 2.0) < 0.5;
            float along = (across ? zv : zu) / 0.02 + fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) * 5.0;
            float dAlongDu = across ? 0.0 : 1.0 / 0.02;
            float dAlongDv = across ? 1.0 / 0.02 : 0.0;
            vec2 local = abs(fract(vec2(zu, zv) / square) - 0.5) * 2.0;
            float edge = max(local.x, local.y);
          #endif
          // Fade the ridges before one period shrinks below about three pixels.
          float footprint = length(vec2(dFdx(along), dFdy(along)));
          float detail = 1.0 - smoothstep(0.3, 0.6, footprint);
          // Rounded crests, slightly flattened: height = 0.5 + 0.5 cos.
          float phase = ZIM_TAU * along;
          float ridge = 0.5 + 0.5 * cos(phase);
          float dRidge = -0.5 * sin(phase) * ZIM_TAU;
          // Joints between comb passes are shallow furrows.
          float joint = 1.0 - smoothstep(0.82, 0.97, edge);
          zimH = mix(0.5, ridge, detail) * joint;
          zimGrad = vec2(dAlongDu, dAlongDv) * dRidge * detail * joint;
          // Deep occlusion in the grooves, the joints darker still; matte paste.
          float cavity = mix(0.78, 1.0, zimH);
          diffuseColor.rgb *= mix(1.0, cavity * 1.04, zimCoat);
          diffuseColor.rgb *= mix(1.0, 0.94, broken * clamp(vZimMask, 0.0, 1.0) * upright);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.97, zimCoat);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Ridges 3 mm high: tilt the normal by the height gradient.
          const float ZIM_DEPTH = 0.003;
          vec3 tilt = (zimGrad.x * vZimTangentView + zimGrad.y * vZimBitangentView) * ZIM_DEPTH * zimCoat;
          normal = normalize(normal - tilt);
        }`);
  };
}
