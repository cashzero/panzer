import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky as SkyMesh } from 'three/addons/objects/Sky.js';
import * as THREE from 'three';
import { installAerialPerspective } from './aerialPerspective';
import { SUN_DIRECTION } from './sunDirection';

export { SUN_DIRECTION };

// Before any battlefield material compiles its fog.
installAerialPerspective();

const SUN = SUN_DIRECTION;
const SHADOW_SPAN = 100;
const SHADOW_SIZE = 4096;
// Pale, slightly warm summer haze shared by the background and distance fog.
const HAZE = '#b8bab0';

export function BattlefieldLighting({ mapMode }: { mapMode: boolean }) {
  const { gl, scene, camera } = useThree();
  const light = useRef<THREE.DirectionalLight>(null!);
  const target = useMemo(() => new THREE.Object3D(), []);
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
        gl_FragColor = vec4( texColor, 1.0 );`);
    const uniforms = mesh.material.uniforms;
    uniforms.sunPosition.value.copy(SUN);
    uniforms.turbidity.value = 10;
    uniforms.rayleigh.value = 2.2;
    uniforms.mieCoefficient.value = 0.01;
    // A little less forward scatter: the glow around the sun stays a halo, not half the sky.
    uniforms.mieDirectionalG.value = 0.74;
    uniforms.cloudCoverage.value = 0.48;
    uniforms.cloudDensity.value = 0.7;
    uniforms.cloudScale.value = 0.00065;
    uniforms.cloudElevation.value = 0.25;
    return mesh;
  }, []);
  const scratch = useMemo(() => ({
    focus: new THREE.Vector3(), forward: new THREE.Vector3(),
    right: new THREE.Vector3().crossVectors(SUN, new THREE.Vector3(0, 1, 0)).normalize(),
    up: new THREE.Vector3(),
  }), []);

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

  useFrame(() => {
    sky.position.copy(camera.position);
    if (!light.current || mapMode) return;
    camera.getWorldDirection(scratch.forward);
    scratch.focus.copy(camera.position).addScaledVector(scratch.forward, 28);
    // Snap in light space to avoid crawling shadow texels while driving.
    scratch.up.crossVectors(scratch.right, SUN).normalize();
    const texel = SHADOW_SPAN * 2 / SHADOW_SIZE;
    const x = scratch.focus.dot(scratch.right);
    const y = scratch.focus.dot(scratch.up);
    scratch.focus.addScaledVector(scratch.right, Math.round(x / texel) * texel - x);
    scratch.focus.addScaledVector(scratch.up, Math.round(y / texel) * texel - y);
    target.position.copy(scratch.focus);
    target.updateMatrixWorld();
    light.current.position.copy(scratch.focus).addScaledVector(SUN, 230);
  });

  return <>
    <color attach="background" args={[HAZE]} />
    <primitive attach="fog" object={fog} />
    <primitive object={sky} />
    {/* Weak, neutral fill keeps shade readable without tinting grey armour blue. */}
    <hemisphereLight args={['#c7cbc6', '#4a4632', 0.7]} />
    <primitive object={target} />
    <directionalLight ref={light} target={target} position={[-143, 143, -110]}
      // Shadows stay on in map mode and the shadow map is simply not
      // redrawn: switching castShadow recompiled every material both ways.
      castShadow shadow-autoUpdate={!mapMode} color="#ffe2bd" intensity={3.3}
      shadow-mapSize={[SHADOW_SIZE, SHADOW_SIZE]}
      shadow-bias={-0.00008} shadow-normalBias={0.035}
      shadow-camera-near={1} shadow-camera-far={520}
      shadow-camera-left={-SHADOW_SPAN} shadow-camera-right={SHADOW_SPAN}
      shadow-camera-top={SHADOW_SPAN} shadow-camera-bottom={-SHADOW_SPAN} />
  </>;
}
