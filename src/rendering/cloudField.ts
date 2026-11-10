import * as THREE from 'three';

/**
 * One field of fair-weather cumulus, read twice: by the light chunk as the
 * shadow on the ground (`sunCascades.ts`) and by the sky as the clouds
 * themselves (`BattlefieldLighting.tsx`). The sky looks up the ground point
 * each piece of cloud shades, so when a shadow crosses the field there is a
 * cloud between that field and the sun, and the land darkens as the sun goes
 * in.
 *
 * The field is two octaves of value noise over world XZ, drifting with the
 * wind. The hash has no sine, so it gives the same pattern on every GPU.
 */

/** Size of the largest cloud features (m). */
export const CLOUD_SCALE = 640;
/** Drift speed (m/s). */
export const CLOUD_DRIFT_SPEED = 7;
/** Unit drift direction over world XZ. */
export const CLOUD_DRIFT = new THREE.Vector2(0.93, 0.37).normalize();
/** Height of the cloud deck above the ground (m). */
export const CLOUD_ALTITUDE = 1150;
/** Field values where cloud begins and where it is fully thick. */
export const CLOUD_EDGE = [0.53, 0.66] as const;
/** Share of direct sun the thickest cloud takes away on the ground. */
export const CLOUD_SHADE_DEPTH = 0.58;

/** GLSL: `sunCloudCover(worldXZ, driftMetres)` in [0, 1], and its noise. */
export const CLOUD_FIELD_GLSL = /* glsl */ `
float sunCloudHash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
float sunCloudNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( sunCloudHash( i ), sunCloudHash( i + vec2( 1.0, 0.0 ) ), f.x ),
		mix( sunCloudHash( i + vec2( 0.0, 1.0 ) ), sunCloudHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// Field coordinates of a ground position: one unit is one large cloud.
vec2 sunCloudPoint( vec2 world, float drift ) {
	return ( world - vec2( ${CLOUD_DRIFT.x.toFixed(4)}, ${CLOUD_DRIFT.y.toFixed(4)} ) * drift ) / ${CLOUD_SCALE.toFixed(1)} + vec2( 37.2, 11.7 );
}
float sunCloudField( vec2 p ) {
	return sunCloudNoise( p ) * 0.62 + sunCloudNoise( p * 2.7 + 17.3 ) * 0.38;
}
// Share of direct sun left on the ground at a world XZ position.
float sunCloudShade( vec2 world, float drift ) {
	float cover = sunCloudField( sunCloudPoint( world, drift ) );
	return 1.0 - ${CLOUD_SHADE_DEPTH.toFixed(2)} * smoothstep( ${CLOUD_EDGE[0].toFixed(3)}, ${CLOUD_EDGE[1].toFixed(3)}, cover );
}
`;
