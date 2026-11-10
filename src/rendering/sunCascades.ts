import * as THREE from 'three';
import { SUN_DIRECTION } from './sunDirection';
import { CLOUD_FIELD_GLSL } from './cloudField';

/**
 * Sun shadows over the whole view, in cascades, plus drifting cloud shadows.
 *
 * One shadow map could cover only 100 m around the camera, so trees, houses
 * and tanks beyond it stood on the ground without a shadow. Here the view is
 * cut into depth slices, each with its own shadow map fitted round the slice:
 * centimetre texels under the player's tank, decimetres across the field, and
 * about two thirds of a metre out to the far treelines.
 *
 * Three.js lights carry one shadow map each, so every cascade is a
 * `DirectionalLight` that casts a shadow but has no colour, and the sun itself
 * is a light that casts none. The patched `lights_fragment_begin` chunk
 * gathers the cascades into one shadow term (the finest cascade that contains
 * the fragment, cross-faded into the next at its edge) and applies it to
 * every directional light without a shadow of its own. Colourless lights are
 * skipped, so they cost no shading. Scenes without cascade lights (the studio
 * previews, the editor) light exactly as before.
 *
 * No material needs setting up, which matters here: most battlefield
 * materials already rewrite their shaders in `onBeforeCompile`.
 *
 * The far cascades are redrawn every second and fourth frame. Their matrices
 * only change when they are redrawn, so a stale cascade is still correct for
 * everything that has not moved.
 *
 * Cloud shadows read the cloud field in `cloudField.ts`, which the sky draws
 * as the clouds themselves. The chunk has no uniform of its own, so the drift
 * distance travels in the first cascade's otherwise unused `shadow.radius`:
 * 0 or less switches the cloud shadows off (map mode).
 */

export interface SunCascade {
  light: THREE.DirectionalLight;
  target: THREE.Object3D;
  /** View depth where the slice ends, in metres at the 60 degree reference FOV. */
  far: number;
  /** Redraw every this many frames. */
  every: number;
  /** Frame offset, so the far cascades are not redrawn on the same frame. */
  phase: number;
}

const CASCADE_SIZE = 2048;
const CASCADE_PLAN = [
  { far: 26, every: 1, phase: 0 },
  { far: 115, every: 2, phase: 1 },
  { far: 560, every: 4, phase: 0 },
];
// Slices overlap by this share of the nearer one, so the cross-fade has
// both maps to read.
const CASCADE_OVERLAP = 0.12;
// How far toward the sun a caster can stand and still be drawn (m).
const CASTER_REACH = 160;
// A zoomed sight stretches the slices, but only this far: past it the far
// cascade would spread too thin to draw anything.
const MAX_ZOOM_STRETCH = 3;
const REFERENCE_HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(30));
// A cascade is refitted out of turn once its slice has moved this share of
// the cascade's radius from where it was fitted.
const REFIT_DRIFT = 0.1;
let installed = false;

/** Patch the light chunks. Call before any battlefield material compiles. */
export function installSunCascades() {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk as Record<string, string>;

  chunks.shadowmap_pars_fragment += /* glsl */ `
${CLOUD_FIELD_GLSL}
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS > 0
float sunCascadeSample( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowBias, vec3 coord ) {
	vec2 radius = 1.5 / shadowMapSize;
	float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
	coord.z += shadowBias;
	return (
		texture( shadowMap, vec3( coord.xy + vogelDiskSample( 0, 5, phi ) * radius, coord.z ) ) +
		texture( shadowMap, vec3( coord.xy + vogelDiskSample( 1, 5, phi ) * radius, coord.z ) ) +
		texture( shadowMap, vec3( coord.xy + vogelDiskSample( 2, 5, phi ) * radius, coord.z ) ) +
		texture( shadowMap, vec3( coord.xy + vogelDiskSample( 3, 5, phi ) * radius, coord.z ) ) +
		texture( shadowMap, vec3( coord.xy + vogelDiskSample( 4, 5, phi ) * radius, coord.z ) )
	) * 0.2;
}
#endif
`;

  const stock = /* glsl */ `	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];

		getDirectionalLightInfo( directionalLight, directLight );

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif

		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	}
	#pragma unroll_loop_end`;

  const cascaded = /* glsl */ `	DirectionalLight directionalLight;
	// Shadow gathered from the cascade lights: colourless shadow casters.
	float sunCascadeShadow = 1.0;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#if defined( SHADOWMAP_TYPE_PCF )
	{
		float cascadeOpen = 1.0;
		float cascadeSum = 0.0;
		float cloudDrift = 0.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {

			if ( directionalLights[ i ].color.r + directionalLights[ i ].color.g + directionalLights[ i ].color.b <= 0.0 ) {

				directionalLightShadow = directionalLightShadows[ i ];
				cloudDrift = max( cloudDrift, directionalLightShadow.shadowRadius );
				if ( receiveShadow && cascadeOpen > 0.002 ) {

					vec3 cascadeCoord = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
					vec2 cascadeEdge = abs( cascadeCoord.xy * 2.0 - 1.0 );
					float cascadeWeight = cascadeOpen * ( 1.0 - smoothstep( 0.84, 0.97, max( cascadeEdge.x, cascadeEdge.y ) ) ) * step( cascadeCoord.z, 1.0 );
					if ( cascadeWeight > 0.002 ) {

						cascadeSum += cascadeWeight * sunCascadeSample( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, cascadeCoord );
						cascadeOpen -= cascadeWeight;

					}

				}

			}

		}
		#pragma unroll_loop_end
		sunCascadeShadow = cascadeSum + cascadeOpen;
		if ( cloudDrift > 0.0 ) {

			vec3 sunCloudWorld = cameraPosition + ( vec4( geometryPosition, 0.0 ) * viewMatrix ).xyz;
			sunCascadeShadow *= sunCloudShade( sunCloudWorld.xz, cloudDrift );

		}
	}
	#endif
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];

		if ( directionalLight.color.r + directionalLight.color.g + directionalLight.color.b > 0.0 ) {

			getDirectionalLightInfo( directionalLight, directLight );

			#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
			directionalLightShadow = directionalLightShadows[ i ];
			directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
			#else
			directLight.color *= sunCascadeShadow;
			#endif

			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

		}

	}
	#pragma unroll_loop_end`;

  // The built module drops the source's blank lines; compare without them.
  const dense = (glsl: string) => glsl.replace(/\n\s*\n/g, '\n');
  const chunk = dense(chunks.lights_fragment_begin);
  if (!chunk.includes(dense(stock))) {
    // A Three.js upgrade changed the chunk: keep the stock lighting (one
    // unshadowed sun) rather than compile a half-patched shader.
    console.warn('sunCascades: lights_fragment_begin has changed; sun shadows are off.');
    return;
  }
  chunks.lights_fragment_begin = chunk.replace(dense(stock), cascaded);
}

/** The cascade lights, nearest first. Add each `light` and `target` to the scene. */
export function createSunCascades(): SunCascade[] {
  return CASCADE_PLAN.map(({ far, every, phase }) => {
    const light = new THREE.DirectionalLight(0x000000, 0);
    const target = new THREE.Object3D();
    light.target = target;
    light.castShadow = true;
    light.shadow.mapSize.set(CASCADE_SIZE, CASCADE_SIZE);
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    light.shadow.radius = 0;
    return { light, target, far, every, phase };
  });
}

const _forward = new THREE.Vector3();
const _center = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3().crossVectors(SUN_DIRECTION, new THREE.Vector3(0, 1, 0)).normalize();

/**
 * Fit the cascades due this frame round their slices of the view and mark
 * them for redrawing. `force` refits and redraws all of them at once.
 */
export function updateSunCascades(cascades: SunCascade[], camera: THREE.PerspectiveCamera, frame: number, force = false) {
  camera.getWorldDirection(_forward);
  _up.crossVectors(_right, SUN_DIRECTION).normalize();
  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const stretch = THREE.MathUtils.clamp(REFERENCE_HALF_FOV_TAN / halfFovTan, 1, MAX_ZOOM_STRETCH);
  // Tangent of the half angle to a frustum corner.
  const corner = halfFovTan * Math.hypot(1, camera.aspect);
  let near = 0;
  for (const cascade of cascades) {
    const far = cascade.far * stretch;
    const sliceNear = near;
    near = far * (1 - CASCADE_OVERLAP);

    // Smallest sphere round the slice: its size does not change as the
    // camera turns, so the texels hold still.
    const k2 = corner * corner;
    let depth: number, radius: number;
    if (k2 >= (far - sliceNear) / (far + sliceNear)) {
      depth = far;
      radius = far * corner;
    } else {
      depth = 0.5 * (far + sliceNear) * (1 + k2);
      radius = 0.5 * Math.sqrt((far - sliceNear) ** 2 + 2 * (far * far + sliceNear * sliceNear) * k2 + (far + sliceNear) ** 2 * k2 * k2);
    }
    // Step the size, so a zoom or a window resize changes it rarely.
    radius = Math.pow(1.15, Math.ceil(Math.log(radius * 1.04) / Math.log(1.15)));
    _center.copy(camera.position).addScaledVector(_forward, depth);

    // Off its turn, a cascade is still redrawn at once when the view has
    // swung or zoomed away from where it was fitted: a quick look round
    // would otherwise leave the leading edge of the screen without far
    // shadows for a few frames.
    const { light, target } = cascade;
    const fitted = light.shadow.camera.right;
    const moved = _center.distanceTo(target.position) > fitted * REFIT_DRIFT || Math.abs(radius - fitted) > 1e-3;
    if (!force && !moved && frame % cascade.every !== cascade.phase) continue;

    const texel = radius * 2 / CASCADE_SIZE;
    // Snap in light space to avoid crawling shadow texels while driving.
    const x = _center.dot(_right), y = _center.dot(_up);
    _center.addScaledVector(_right, Math.round(x / texel) * texel - x);
    _center.addScaledVector(_up, Math.round(y / texel) * texel - y);

    target.position.copy(_center);
    target.updateMatrixWorld();
    light.position.copy(_center).addScaledVector(SUN_DIRECTION, radius + CASTER_REACH);
    light.updateMatrixWorld();
    const shadowCamera = light.shadow.camera;
    shadowCamera.left = shadowCamera.bottom = -radius;
    shadowCamera.right = shadowCamera.top = radius;
    shadowCamera.near = 1;
    shadowCamera.far = radius * 2 + CASTER_REACH;
    shadowCamera.updateProjectionMatrix();
    // Biases in world units, scaled to this cascade's texel.
    light.shadow.bias = -Math.max(0.03, texel * 0.9) / (shadowCamera.far - shadowCamera.near);
    light.shadow.normalBias = Math.max(0.03, texel * 1.1);
    light.shadow.needsUpdate = true;
  }
}

/** Metres the cloud shadows have drifted; 0 switches them off. */
export function setCloudDrift(cascades: SunCascade[], metres: number) {
  if (cascades[0]) cascades[0].light.shadow.radius = metres;
}
