import * as THREE from 'three';
import { SUN_DIRECTION } from './sunDirection';

/**
 * Aerial perspective in place of three's linear fog. Distance haze builds
 * exponentially from `fog.near` (so a treeline a few hundred metres out
 * already sits back in the air, not only the map edge), thins where the ray
 * climbs out of the low, dense air, and takes its colour from the view
 * direction: warm and bright looking toward the sun, cool blue-grey away from
 * it. Fog ending within AERIAL_MIN_FAR is a studio backdrop fade and stays
 * linear. `scene.fog` stays a plain `THREE.Fog`; its colour is the neutral haze the
 * tints scale, and near/far set where the haze starts and where it is nearly
 * opaque, so map mode and every consumer of the fog keep working.
 */

// Optical depth reached at `fog.far`: 1 - exp(-2.0) leaves about 14% of the
// surface showing there, so the haze never quite closes over the horizon skirt
// until several kilometres out.
const AERIAL_DEPTH = 2.0;
// Metres over which the haze density falls by 1/e with height.
const AERIAL_SCALE_HEIGHT = 250;
// Fog that ends closer than this is a studio backdrop fade, not air.
const AERIAL_MIN_FAR = 200;
// Multipliers on the fog colour, linear RGB.
const AERIAL_AWAY = new THREE.Vector3(0.84, 0.97, 1.15);
const AERIAL_TOWARD = new THREE.Vector3(1.14, 1.05, 0.9);

const glslVec3 = (v: THREE.Vector3) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

/**
 * Shared GLSL for any shader that fogs by hand. Needs the `viewMatrix` and
 * `cameraPosition` uniforms three declares for every non-raw shader.
 */
export const AERIAL_PERSPECTIVE_GLSL = /* glsl */ `
  const vec3 AERIAL_SUN = ${glslVec3(SUN_DIRECTION)};
  const vec3 AERIAL_AWAY = ${glslVec3(AERIAL_AWAY)};
  const vec3 AERIAL_TOWARD = ${glslVec3(AERIAL_TOWARD)};

  // View-space offset to world space: the transpose undoes the view rotation.
  vec3 aerialWorldOffset(vec3 viewPosition) {
    return (vec4(viewPosition, 0.0) * viewMatrix).xyz;
  }

  float aerialAmount(vec3 viewPosition, float hazeNear, float hazeFar) {
    float distance = length(viewPosition);
    float path = max(distance - hazeNear, 0.0);
    // Mean density along the ray under an exponential height profile.
    float rise = aerialWorldOffset(viewPosition).y / ${AERIAL_SCALE_HEIGHT.toFixed(1)};
    float along = abs(rise) > 1e-3 ? (1.0 - exp(-rise)) / rise : 1.0 - 0.5 * rise;
    float density = exp(-max(cameraPosition.y, 0.0) / ${AERIAL_SCALE_HEIGHT.toFixed(1)}) * along;
    return 1.0 - exp(-${AERIAL_DEPTH.toFixed(2)} * path * density / max(hazeFar - hazeNear, 1.0));
  }

  vec3 aerialInscatter(vec3 viewPosition, vec3 haze) {
    vec3 direction = normalize(aerialWorldOffset(viewPosition));
    float toward = dot(direction, AERIAL_SUN);
    // Broad day-side warmth plus a forward-scatter glow near the sun.
    float side = toward * 0.5 + 0.5;
    float glow = pow(max(toward, 0.0), 5.0);
    return haze * mix(AERIAL_AWAY, AERIAL_TOWARD, clamp(side * side * 0.6 + glow * 0.4, 0.0, 1.0));
  }
`;

let installed = false;

/** Swap three's fog chunks for aerial perspective. Call before any material compiles. */
export function installAerialPerspective() {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk as Record<string, string>;
  chunks.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogPosition;
#endif
`;
  chunks.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogPosition = mvPosition.xyz;
#endif
`;
  chunks.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogPosition;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
    ${AERIAL_PERSPECTIVE_GLSL}
  #endif
#endif
`;
  chunks.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #else
    // Studio backdrops fade over a few tens of metres into their backdrop
    // colour: they keep the plain linear fade.
    if ( fogFar < ${AERIAL_MIN_FAR.toFixed(1)} ) {
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
    } else {
      float fogFactor = aerialAmount( vFogPosition, fogNear, fogFar );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, aerialInscatter( vFogPosition, fogColor ), fogFactor );
    }
  #endif
#endif
`;
}
