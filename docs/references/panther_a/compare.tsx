// Development-only visual measurement fixture. Uses the production tank renderer.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import * as THREE from 'three';
import {createParametricRenderer} from '../../../src/tanks/core/ParametricTankRenderer';
import type {ModelNode, TankModelSpec} from '../../../src/tanks/core/types';
import model from '../../../src/tanks/panther_a/model.json';
import tank from '../../../src/tanks/panther_a/tank.json';

const namedModel = structuredClone(model) as unknown as TankModelSpec;
function nameNodes(nodes: ModelNode[]) {
  for (const n of nodes) {
    n.name = n.id;
    if (n.type === 'group') nameNodes(n.children);
    if (n.type === 'repeat' || n.type === 'mirror') nameNodes([n.child]);
  }
}
Object.values(namedModel.slots).forEach(nameNodes);
const {HullComponent, TracksComponent, TurretComponent, GunComponent} = createParametricRenderer(namedModel);
const query = new URLSearchParams(location.search);
const mode = query.get('mode') ?? 'overlay';
const props = {color: mode === 'perspective' ? tank.appearance.baseColor : '#668c9b', destroyed: query.has('destroyed'), destroyedColor: '#555'};
const trackMat = new THREE.MeshStandardMaterial({color: '#687b83', roughness: 0.9});
const elevation = THREE.MathUtils.degToRad(Number(query.get('elevation') ?? 0));
const traverse = THREE.MathUtils.degToRad(Number(query.get('traverse') ?? 0));
const vec3 = (v: number[]) => v as [number, number, number];

function Tank() {
  return <group>
    <HullComponent {...props}/>
    <TracksComponent {...props} isLeft trackMat={trackMat}/>
    <TracksComponent {...props} isLeft={false} trackMat={trackMat}/>
    <group position={vec3(tank.mounts.turretOffset)} rotation={[0, traverse, 0]}>
      <TurretComponent {...props}/>
      <group position={vec3(tank.mounts.gunPivotOffset)} rotation={[-elevation, 0, 0]}><GunComponent {...props}/></group>
    </group>
  </group>;
}

interface View {name: string; left: number; top: number; width: number; height: number; ppm: number; origin: [number, number]; position: [number, number, number]; up: [number, number, number]}
// Cameras are fixed from the baseline onward. Origins are in panel pixels; all
// four views of the 1800 x 2100 Doyle drawing share 155 px/m (860 mm road
// wheels, 3.27 m over the tracks, 8.66 m gun forward to the rear plate).
const perspectiveFrom: [number, number, number] = query.has('rear') ? [-8, 6, -10] : query.has('top') ? [5, 12, -4] : [8, 6, 10];
const views: View[] = mode === 'perspective' ? [
  {name: 'perspective', left: 0, top: 0, width: 1200, height: 800, ppm: 110, origin: [600, 480], position: perspectiveFrom, up: [0, 1, 0]},
] : [
  {name: 'side', left: 0, top: 0, width: 1800, height: 730, ppm: 155, origin: [1046, 695.5], position: [20, 0, 0], up: [0, 1, 0]},
  {name: 'top', left: 0, top: 730, width: 1800, height: 620, ppm: 155, origin: [1037, 304.5], position: [0, 20, 0], up: [-1, 0, 0]},
  {name: 'front', left: 0, top: 1350, width: 950, height: 750, ppm: 155, origin: [545, 591], position: [0, 0, 20], up: [0, 1, 0]},
  {name: 'rear', left: 950, top: 1350, width: 850, height: 750, ppm: 155, origin: [411.5, 592], position: [0, 0, -20], up: [0, 1, 0]},
];

type Bounds = Record<string, {min: number[]; max: number[]}>;
interface Capture {bounds: Bounds; vertices: Record<string, number[][]>}
declare global { interface Window { pantherQA?: Record<string, {measure: () => Capture}> } }
// Sloped-plate landmarks (glacis/roof junction, turret corners) need vertices,
// not AABBs; export the world-space vertices of these rendered polyhedra.
const VERTEX_PARTS = ['panther-welded-hull', 'panther-turret-shell'];
function worldVertices(scene: THREE.Scene) {
  const out: Record<string, number[][]> = {};
  const v = new THREE.Vector3();
  for (const name of VERTEX_PARTS) {
    const unique = new Map<string, number[]>();
    scene.getObjectByName(name)?.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const p = v.toArray().map(x => Math.round(x * 1e6) / 1e6);
        unique.set(p.join(','), p);
      }
    });
    out[name] = [...unique.values()];
  }
  return out;
}

createRoot(document.getElementById('root')!).render(<>
  {views.map(v => <div className="view" key={v.name} style={{left: v.left, top: v.top, width: v.width, height: v.height}}>
    <Canvas orthographic dpr={1} gl={{preserveDrawingBuffer: true, alpha: true, antialias: true}}
      onCreated={({camera, gl, scene}) => {
        const c = camera as THREE.OrthographicCamera;
        c.position.fromArray(v.position); c.up.fromArray(v.up); c.lookAt(0, mode === 'perspective' ? 1.2 : 0, 0);
        c.left = -v.origin[0] / v.ppm; c.right = (v.width - v.origin[0]) / v.ppm;
        c.top = v.origin[1] / v.ppm; c.bottom = -(v.height - v.origin[1]) / v.ppm;
        c.near = 0.1; c.far = 100; c.updateProjectionMatrix(); gl.setClearColor(0xffffff, 0);
        window.pantherQA ??= {};
        window.pantherQA[v.name] = {measure: () => {
          scene.updateMatrixWorld(true);
          const bounds: Bounds = {};
          scene.traverse(o => { if (o.name) { const b = new THREE.Box3().setFromObject(o); bounds[o.name] = {min: b.min.toArray(), max: b.max.toArray()}; } });
          return {bounds, vertices: worldVertices(scene)};
        }};
      }}>
      <ambientLight intensity={1.6}/><directionalLight position={[8, 12, 10]} intensity={2}/><Tank/>
    </Canvas>
  </div>)}
  {mode === 'overlay' && <img id="reference" src="./panther_a-onwar.jpg" alt=""/>}
</>);
