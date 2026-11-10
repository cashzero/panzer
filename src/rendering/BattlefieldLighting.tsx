import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky as SkyMesh } from 'three/addons/objects/Sky.js';
import * as THREE from 'three';
import { installAerialPerspective } from './aerialPerspective';
import { SUN_COLOR, SUN_DIRECTION, SUN_INTENSITY } from './sunDirection';
import { createSunCascades, installSunCascades, setCloudDrift, updateSunCascades } from './sunCascades';
import { foliageWind } from './foliageCards';
import { CLOUD_ALTITUDE, CLOUD_DRIFT_SPEED, CLOUD_EDGE, CLOUD_FIELD_GLSL, CLOUD_SCALE } from './cloudField';

export { SUN_DIRECTION };

// Before any battlefield material compiles its fog and lights.
installAerialPerspective();
installSunCascades();

const SUN = SUN_DIRECTION;
// The land is exposed up from where the sky was tuned; the sky and the haze
// are scaled back by the same factor, so they keep their place on screen.
export const BATTLEFIELD_EXPOSURE = 1.36;
const SKY_EXPOSURE = 1.15 / BATTLEFIELD_EXPOSURE;
// Pale, slightly warm summer haze shared by the background and distance fog.
const HAZE = new THREE.Color('#b8bab0').multiplyScalar(SKY_EXPOSURE);

export function BattlefieldLighting({ mapMode }: { mapMode: boolean }) {
  const { gl, scene, camera } = useThree();
  // The sun lights; the cascades only carry its shadow maps (see sunCascades.ts).
  const sun = useMemo(() => {
    const light = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    light.position.copy(SUN);
    return light;
  }, []);
  const cascades = useMemo(createSunCascades, []);
  const frame = useRef(0);
  const refit = useRef(true);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), []);
  // One fog for the battle: a new fog object makes every material look up its
  // program again. Map mode only pushes its range out of the way.
  const fog = useMemo(() => new THREE.Fog(HAZE, 100, 3000), []);
  useEffect(() => {
    // Zoomed out over a 4 km map the camera looks down from about 11 km: keep the haze off it.
    fog.near = mapMode ? 30000 : 100;
    fog.far = mapMode ? 60000 : 3000;
  }, [fog, mapMode]);
  const sky = useMemo(() => {
    const mesh = new SkyMesh();
    mesh.scale.setScalar(50000);
    // The analytic sun disc is about 760 in HDR. Through the bloom pass that
    // spread into a white veil over everything seen toward the sun, and at
    // gunner zoom it swallowed the whole view. A disc of about 60 still reads
    // as the sun and still blooms, without washing out the scene around it.
    mesh.material.fragmentShader = mesh.material.fragmentShader
      .replace('vSunE * 19000.0 * Fex', 'vSunE * 1500.0 * Fex')
      // The Mie glow around the sun runs to several times the brightness of
      // the open sky over a wide patch. Tone mapped, all of it clipped to flat
      // white, so the whole view toward the sun (and the gunner sight looking
      // that way) read as a blank sheet. Compress the sky, not the disc, onto
      // a soft shoulder that tops out below white: the glow keeps its warm
      // gradient and the haze its tint, and nothing reaches the bloom pass.
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `
        float skyLuma = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
        float skyKnee = 0.45;
        float skyRange = 0.3;
        if ( sundisk < 0.5 && skyLuma > skyKnee ) {
          float over = skyLuma - skyKnee;
          texColor *= ( skyKnee + over / ( 1.0 + over / skyRange ) ) / skyLuma;
        }
        // Cumulus on a flat deck, from the field the ground shadows read.
        if ( direction.y > 0.012 && cloudDrift > 0.0 ) {
          float cloudReach = ${CLOUD_ALTITUDE.toFixed(1)} / direction.y;
          vec2 cloudSunOffset = vSunDirection.xz * ( ${CLOUD_ALTITUDE.toFixed(1)} / max( vSunDirection.y, 0.1 ) );
          // The ground this piece of cloud shades.
          vec2 cloudGround = cameraPosition.xz + direction.xz * cloudReach - cloudSunOffset;
          vec2 cloudPoint = sunCloudPoint( cloudGround, cloudDrift );
          // Billows fade toward the horizon, where they would only shimmer.
          float cloudNear = smoothstep( 0.03, 0.22, direction.y );
          float cloudBillow = sunCloudNoise( cloudPoint * 6.3 + 3.1 ) * 0.5 + sunCloudNoise( cloudPoint * 14.1 + 9.2 ) * 0.32
            + sunCloudNoise( cloudPoint * 31.0 + 1.7 ) * 0.18;
          float cloudBase = sunCloudField( cloudPoint );
          float cloudAmount = smoothstep( ${CLOUD_EDGE[0].toFixed(3)}, ${CLOUD_EDGE[1].toFixed(3)}, cloudBase + ( cloudBillow - 0.5 ) * 0.22 * cloudNear );
          if ( cloudAmount > 0.0 ) {
            // Lit where the cloud thins out toward the sun, grey where more
            // cloud lies that way, and darkest under its thick middle. Seen
            // against the sun a cloud shows its shaded side.
            float cloudSunward = sunCloudField( cloudPoint + normalize( vSunDirection.xz ) * ${(120 / CLOUD_SCALE).toFixed(4)} );
            float cloudLit = 0.66 - ( cloudSunward - cloudBase ) * 7.0 - 0.34 * cloudAmount * cloudAmount
              + ( cloudBillow - 0.5 ) * 0.5 * cloudNear - cosTheta * 0.16;
            vec3 cloudColor = mix( vec3( 0.3, 0.34, 0.41 ), vec3( 0.97, 0.96, 0.93 ), smoothstep( 0.0, 1.0, cloudLit ) );
            // Thin edges near the sun glow with light scattered forward.
            cloudColor += vec3( 0.9, 0.8, 0.62 ) * pow( max( cosTheta, 0.0 ), 12.0 ) * ( 1.0 - cloudAmount ) * 0.6;
            // Distant cloud sinks into the haze.
            cloudColor = mix( texColor, cloudColor, exp( - cloudReach / 15000.0 ) );
            texColor = mix( texColor, cloudColor, cloudAmount * smoothstep( 0.015, 0.08, direction.y ) );
          }
        }
        gl_FragColor = vec4( texColor * ${SKY_EXPOSURE.toFixed(3)}, 1.0 );`)
      .replace('void main() {', `uniform float cloudDrift;
        ${CLOUD_FIELD_GLSL}
        void main() {`);
    const uniforms = mesh.material.uniforms;
    uniforms.sunPosition.value.copy(SUN);
    uniforms.turbidity.value = 10;
    uniforms.rayleigh.value = 2.2;
    uniforms.mieCoefficient.value = 0.01;
    // A little less forward scatter: the glow around the sun stays a halo, not half the sky.
    uniforms.mieDirectionalG.value = 0.74;
    // The addon's own flat cloud layer is off; the cloud field draws them.
    uniforms.cloudCoverage.value = 0;
    uniforms.cloudDrift = { value: 1 };
    return mesh;
  }, []);
  useEffect(() => {
    // Bake the analytic sky once. No remote HDRI request or per-frame cube capture.
    const environmentScene = new THREE.Scene();
    const environmentSky = sky.clone();
    environmentScene.add(environmentSky);
    const generator = new THREE.PMREMGenerator(gl);
    const environment = generator.fromScene(environmentScene, 0.04, 0.1, 100000);
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.1;
    generator.dispose();
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      environment.dispose();
    };
  }, [gl, scene, sky]);

  useEffect(() => () => {
    sky.geometry.dispose();
    sky.material.dispose();
  }, [sky]);
  useEffect(() => () => {
    sun.dispose();
    cascades.forEach(({ light }) => light.dispose());
  }, [sun, cascades]);

  useFrame(({ clock }) => {
    sky.position.copy(camera.position);
    foliageWind.value = reducedMotion.matches ? 0 : clock.elapsedTime;
    // The shadow maps are simply not redrawn in map mode: dropping the
    // cascade lights there would recompile every material both ways.
    if (mapMode) {
      setCloudDrift(cascades, 0);
      refit.current = true;
      return;
    }
    const drift = 1 + (reducedMotion.matches ? 0 : clock.elapsedTime * CLOUD_DRIFT_SPEED);
    setCloudDrift(cascades, drift);
    sky.material.uniforms.cloudDrift.value = drift;
    updateSunCascades(cascades, camera as THREE.PerspectiveCamera, frame.current++, refit.current);
    refit.current = false;
  });

  return <>
    <color attach="background" args={[HAZE]} />
    <primitive attach="fog" object={fog} />
    <primitive object={sky} />
    {/* Sky light from above, only faintly cool so grey armour does not turn
        blue, and sunlit ground bouncing warm light up into the shade. At 0.7
        with a dark ground colour, everything turned from the sun (hull sides,
        hedges, the far side of every crown) fell to black. */}
    <hemisphereLight args={['#c4ccd4', '#7a7052', 1.0]} />
    {cascades.map(({ light, target }) => (
      <group key={light.uuid}>
        <primitive object={target} />
        <primitive object={light} />
      </group>
    ))}
    <primitive object={sun} />
  </>;
}
