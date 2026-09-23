import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky as SkyMesh } from 'three/addons/objects/Sky.js';
import * as THREE from 'three';

// One direction drives the visible sun, reflections and direct shadows.
// About 35 degrees up: long enough shadows to model hulls and terrain relief.
const SUN = new THREE.Vector3(-0.62, 0.52, -0.48).normalize();
const SHADOW_SPAN = 100;
const SHADOW_SIZE = 4096;
// Pale, slightly warm summer haze shared by the background and distance fog.
const HAZE = '#b8bab0';

export function BattlefieldLighting({ mapMode }: { mapMode: boolean }) {
  const { gl, scene, camera } = useThree();
  const light = useRef<THREE.DirectionalLight>(null!);
  const target = useMemo(() => new THREE.Object3D(), []);
  const sky = useMemo(() => {
    const mesh = new SkyMesh();
    mesh.scale.setScalar(50000);
    const uniforms = mesh.material.uniforms;
    uniforms.sunPosition.value.copy(SUN);
    uniforms.turbidity.value = 10;
    uniforms.rayleigh.value = 2.2;
    uniforms.mieCoefficient.value = 0.01;
    uniforms.mieDirectionalG.value = 0.8;
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
    <fog attach="fog" args={[HAZE, mapMode ? 1800 : 120, mapMode ? 4800 : 1400]} />
    <primitive object={sky} />
    {/* Weak, neutral fill keeps shade readable without tinting grey armour blue. */}
    <hemisphereLight args={['#c7cbc6', '#4a4632', 0.7]} />
    <primitive object={target} />
    <directionalLight ref={light} target={target} position={[-143, 143, -110]}
      castShadow={!mapMode} color="#ffe2bd" intensity={3.3}
      shadow-mapSize={[SHADOW_SIZE, SHADOW_SIZE]}
      shadow-bias={-0.00008} shadow-normalBias={0.035}
      shadow-camera-near={1} shadow-camera-far={520}
      shadow-camera-left={-SHADOW_SPAN} shadow-camera-right={SHADOW_SPAN}
      shadow-camera-top={SHADOW_SPAN} shadow-camera-bottom={-SHADOW_SPAN} />
  </>;
}
