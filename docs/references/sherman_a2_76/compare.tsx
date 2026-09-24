// Development-only visual measurement fixture. Uses the production tank renderer.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import * as THREE from 'three';
import {createParametricRenderer} from '../../../src/tanks/core/ParametricTankRenderer';
import type {TankModelSpec} from '../../../src/tanks/core/types';
import model from '../../../src/tanks/sherman_a2_76/model.json';
import tank from '../../../src/tanks/sherman_a2_76/tank.json';
import {VERTEX_PARTS, VIEWS} from './views';

const namedModel = structuredClone(model);
function nameNodes(nodes: any[]) {for (const n of nodes) {n.name = n.id; if (n.children) nameNodes(n.children); if (n.child) nameNodes([n.child]);}}
Object.values(namedModel.slots).forEach(nameNodes);
const renderer = createParametricRenderer(namedModel as TankModelSpec);
const {HullComponent, TracksComponent, TurretComponent, GunComponent} = renderer;
const query = new URLSearchParams(location.search);
const mode = query.get('mode') ?? 'overlay';
const props = {color: mode === 'perspective' ? tank.appearance.baseColor : '#668c9b', destroyed: query.has('destroyed'), destroyedColor: '#555'};
const trackMat = new THREE.MeshStandardMaterial({color: '#687b83', roughness: .9});
const elevation = THREE.MathUtils.degToRad(Number(query.get('elevation') ?? 0));
const traverse = THREE.MathUtils.degToRad(Number(query.get('traverse') ?? 0));
function Tank() {
  return <group><HullComponent {...props}/>
    <TracksComponent {...props} isLeft trackMat={trackMat}/>
    <TracksComponent {...props} isLeft={false} trackMat={trackMat}/>
    <group position={tank.mounts.turretOffset as [number, number, number]} rotation={[0, traverse, 0]}>
      <TurretComponent {...props}/>
      <group position={tank.mounts.gunPivotOffset as [number, number, number]} rotation={[-elevation, 0, 0]}><GunComponent {...props}/></group>
    </group>
  </group>;
}
// Orthographic panels registered to the Dyer drawing (see views.ts). The
// "perspective" mode is an oblique orthographic camera, not a true perspective.
const views = mode === 'perspective' ? [
  {name: 'perspective', left: 0, top: 0, width: 1200, height: 800, ppm: 140, origin: [600, 520], position: query.has('rear') ? [-8, 6, -10] : [8, 6, 10], up: [0, 1, 0]},
] : VIEWS;
createRoot(document.getElementById('root')!).render(<>
  {views.map(v => <div className="view" key={v.name} style={{left: v.left, top: v.top, width: v.width, height: v.height}}>
    <Canvas orthographic dpr={1} gl={{preserveDrawingBuffer: true, alpha: true, antialias: true}}
      onCreated={({camera, gl, scene}) => {
        const c = camera as THREE.OrthographicCamera;
        c.position.fromArray(v.position); c.up.fromArray(v.up); c.lookAt(0, 0, 0);
        c.left = -v.origin[0] / v.ppm; c.right = (v.width - v.origin[0]) / v.ppm;
        c.top = v.origin[1] / v.ppm; c.bottom = -(v.height - v.origin[1]) / v.ppm;
        c.near = .1; c.far = 100; c.updateProjectionMatrix(); gl.setClearColor(0xffffff, 0);
        (window as any).m4a2QA ??= {};
        (window as any).m4a2QA[v.name] = {measure: () => {
          scene.updateMatrixWorld(true);
          const bounds: Record<string, {min: number[], max: number[]}> = {};
          const vertices: Record<string, number[][]> = {};
          scene.traverse(o => {
            if (!o.name) return;
            const b = new THREE.Box3().setFromObject(o); bounds[o.name] = {min: b.min.toArray(), max: b.max.toArray()};
            // World vertices of sloped shapes whose landmarks an AABB cannot describe.
            if (VERTEX_PARTS.includes(o.name)) {
              const points: number[][] = [];
              o.traverse(m => {const g = (m as THREE.Mesh).geometry; if (!g) return; const p = g.getAttribute('position'), q = new THREE.Vector3();
                for (let i = 0; i < p.count; i++) points.push(q.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).toArray().map(n => +n.toFixed(5)));});
              vertices[o.name] = points;
            }
          });
          return {bounds, vertices};
        }};
      }}>
      <ambientLight intensity={1.6}/><directionalLight position={[8, 12, 10]} intensity={2}/><Tank/>
    </Canvas>
  </div>)}
  {mode === 'overlay' && <img id="reference" src="./m4a2-76-dyer.jpg"/>}
</>);
