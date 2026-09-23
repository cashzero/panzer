// Development-only fixture: the same tank drawn from the authored part tree
// (left) and from merged batches (right), under identical camera and lights.
//   /docs/perf/merge-qa.html?tank=<id>[&far][&destroyed]
// `far` moves the camera to 170 m with the third-person FOV so the merged side
// uses its far LOD. window.mergeQA.diff() compares the two canvases.
import React, {useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas, useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {getAllTankDefs, getTankDef} from '../../src/tanks/registry';

const query = new URLSearchParams(location.search);
const tankId = query.get('tank') ?? getAllTankDefs()[0].id;
const far = query.has('far');
const destroyed = query.has('destroyed');
const def = getTankDef(tankId);
const trackMat = new THREE.MeshStandardMaterial({color: '#b7b4a9', roughness: 0.84, metalness: 0.42});
const vec3 = (v: number[]) => v as [number, number, number];

function Tank({merged}: {merged: boolean}) {
  const {HullComponent, TracksComponent, TurretComponent, GunComponent} = def;
  const props = {color: def.color, destroyedColor: '#3a3632', destroyed, merged};
  return <group>
    <HullComponent {...props}/>
    <TracksComponent {...props} isLeft trackMat={trackMat}/>
    <TracksComponent {...props} isLeft={false} trackMat={trackMat}/>
    <group position={vec3(def.turretOffset)} rotation={[0, 0.5, 0]}>
      <TurretComponent {...props}/>
      <group position={vec3(def.gunPivotOffset)} rotation={[-0.08, 0, 0]}><GunComponent {...props}/></group>
    </group>
  </group>;
}

function Camera() {
  const {camera} = useThree();
  useLayoutEffect(() => {
    const direction = new THREE.Vector3(7, 4.5, 9).normalize();
    camera.position.copy(direction.multiplyScalar(far ? 170 : 11.5)).add(new THREE.Vector3(0, 1.2, 0));
    camera.lookAt(0, 1.2, 0);
  }, [camera]);
  return null;
}

function View({merged}: {merged: boolean}) {
  return <div style={{position: 'relative'}}>
    <div className="label">{tankId} {merged ? 'merged' : 'authored'}{far ? ' @170m' : ''}{destroyed ? ' destroyed' : ''}</div>
    <Canvas style={{width: 600, height: 450}} dpr={1} data-variant={merged ? 'merged' : 'authored'}
      camera={{fov: 60, near: 0.1, far: 1000}} gl={{antialias: true, preserveDrawingBuffer: true}}
      onCreated={({gl}) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; }}>
      <color attach="background" args={['#9aa6a8']}/>
      <hemisphereLight args={['#d8e6f0', '#55513a', 1.05]}/>
      <directionalLight position={[-6, 8, 5]} intensity={3.1} color="#fff0d7"/>
      <Camera/>
      <Tank merged={merged}/>
    </Canvas>
  </div>;
}

declare global { interface Window { mergeQA?: {diff: () => {meanAbs: number; changedPct: number}} } }
window.mergeQA = {
  diff() {
    const [a, b] = [...document.querySelectorAll('canvas')] as HTMLCanvasElement[];
    const read = (canvas: HTMLCanvasElement) => {
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const pa = read(a), pb = read(b);
    let sum = 0, changed = 0;
    for (let i = 0; i < pa.length; i += 4) {
      const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
      sum += d;
      if (d > 24) changed++;
    }
    const pixels = pa.length / 4;
    return {meanAbs: +(sum / pixels).toFixed(2), changedPct: +(changed / pixels * 100).toFixed(2)};
  },
};

createRoot(document.getElementById('root')!).render(<><View merged={false}/><View merged/></>);
