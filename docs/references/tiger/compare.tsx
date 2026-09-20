// Development-only visual measurement fixture. Uses the production tank renderer.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import * as THREE from 'three';
import {createParametricRenderer} from '../../../src/tanks/core/ParametricTankRenderer';
import type {TankModelSpec} from '../../../src/tanks/core/types';
import model from '../../../src/tanks/tiger/model.json';
import tank from '../../../src/tanks/tiger/tank.json';

const namedModel = structuredClone(model);
function nameNodes(nodes: any[]) {for(const n of nodes){n.name=n.id;if(n.children)nameNodes(n.children);if(n.child)nameNodes([n.child]);}}
Object.values(namedModel.slots).forEach(nameNodes);
const renderer = createParametricRenderer(namedModel as TankModelSpec);
const {HullComponent, TracksComponent, TurretComponent, GunComponent} = renderer;
const props = {color:'#668c9b', destroyed:false, destroyedColor:'#555'};
const trackMat = new THREE.MeshStandardMaterial({color:'#687b83', roughness:.9});
const mode = new URLSearchParams(location.search).get('mode') ?? 'overlay';
function Tank() {
  return <group><HullComponent {...props}/>
    <TracksComponent {...props} isLeft trackMat={trackMat}/>
    <TracksComponent {...props} isLeft={false} trackMat={trackMat}/>
    <group position={tank.mounts.turretOffset as [number,number,number]}>
      <TurretComponent {...props}/>
      <group position={tank.mounts.gunPivotOffset as [number,number,number]}><GunComponent {...props}/></group>
    </group>
  </group>;
}
// Each scanned view has its own uniform px/m scale; no anisotropic stretching.
const views = [
  {name:'side', left:0, top:0, width:1344, height:600, ppm:143, origin:[814,578], position:[20,0,0], up:[0,1,0]},
  {name:'top', left:0, top:600, width:1344, height:600, ppm:149, origin:[819,300], position:[0,20,0], up:[-1,0,0]},
  {name:'front', left:0, top:1200, width:672, height:648, ppm:149, origin:[391,594], position:[0,0,20], up:[0,1,0]},
  {name:'rear', left:672, top:1200, width:672, height:648, ppm:149, origin:[292,594], position:[0,0,-20], up:[0,1,0]},
];
createRoot(document.getElementById('root')!).render(<>
  {views.map(v=><div className="view" key={v.name} style={{left:v.left,top:v.top,width:v.width,height:v.height}}>
    <Canvas orthographic dpr={1} gl={{preserveDrawingBuffer:true,alpha:true,antialias:true}}
      onCreated={({camera,gl,scene})=>{
        const c=camera as THREE.OrthographicCamera;
        c.position.fromArray(v.position); c.up.fromArray(v.up); c.lookAt(0,0,0);
        c.left=-v.origin[0]/v.ppm; c.right=(v.width-v.origin[0])/v.ppm;
        c.top=v.origin[1]/v.ppm; c.bottom=-(v.height-v.origin[1])/v.ppm;
        c.near=.1;c.far=100;c.updateProjectionMatrix();gl.setClearColor(0xffffff,0);
        (window as any).tigerQA??={};
        (window as any).tigerQA[v.name]={measure:()=>{
          scene.updateMatrixWorld(true);
          const result: Record<string, {min:number[],max:number[]}>={};
          scene.traverse(o=>{if(o.name){const b=new THREE.Box3().setFromObject(o);result[o.name]={min:b.min.toArray(),max:b.max.toArray()};}});
          return result;
        }};
      }}>
      <ambientLight intensity={1.6}/><directionalLight position={[8,12,10]} intensity={2}/><Tank/>
    </Canvas>
  </div>)}
  {mode==='overlay'&&<img id="reference" src="./tiger-i-h1-four-view.png"/>}
</>);
