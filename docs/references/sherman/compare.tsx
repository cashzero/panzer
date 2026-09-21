// Development-only visual measurement fixture. Uses the production tank renderer.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Canvas} from '@react-three/fiber';
import * as THREE from 'three';
import {createParametricRenderer} from '../../../src/tanks/core/ParametricTankRenderer';
import type {TankModelSpec} from '../../../src/tanks/core/types';
import model from '../../../src/tanks/sherman/model.json';
import tank from '../../../src/tanks/sherman/tank.json';

const namedModel = structuredClone(model);
function nameNodes(nodes: any[]) {for(const n of nodes){n.name=n.id;if(n.children)nameNodes(n.children);if(n.child)nameNodes([n.child]);}}
Object.values(namedModel.slots).forEach(nameNodes);
const renderer = createParametricRenderer(namedModel as TankModelSpec);
const {HullComponent, TracksComponent, TurretComponent, GunComponent} = renderer;
const query = new URLSearchParams(location.search);
const mode = query.get('mode') ?? 'overlay';
const detail = query.get('detail');
const detailTarget: [number,number,number] = detail?.startsWith('ring') ? [0,2,-0.3] : [0,2.3,0.95];
const props = {color:mode==='perspective'?tank.appearance.baseColor:'#668c9b', destroyed:query.has('destroyed'), destroyedColor:'#555'};
const trackMat = new THREE.MeshStandardMaterial({color:'#687b83', roughness:.9});
const elevation = THREE.MathUtils.degToRad(Number(query.get('elevation')??0));
const traverse = THREE.MathUtils.degToRad(Number(query.get('traverse')??0));
function Tank() {
  return <group><HullComponent {...props}/>
    <TracksComponent {...props} isLeft trackMat={trackMat}/>
    <TracksComponent {...props} isLeft={false} trackMat={trackMat}/>
    <group position={tank.mounts.turretOffset as [number,number,number]} rotation={[0,traverse,0]}>
      <TurretComponent {...props}/>
      <group position={tank.mounts.gunPivotOffset as [number,number,number]} rotation={[-elevation,0,0]}><GunComponent {...props}/></group>
    </group>
  </group>;
}
// Fixed near-identical scales, registered to hull length and outside track span.
const views = detail ? [
  {name:'detail',left:0,top:0,width:1200,height:800,ppm:430,origin:[600,400],position:detail==='ring-side'?[15,2,-0.3]:detail==='ring-rear'?[-8,4,-10]:detail==='front'?[0,2.3,15]:detail==='side'?[15,2.3,0.95]:[8,5,10],up:[0,1,0]},
] : mode==='perspective' ? [
  {name:'perspective',left:0,top:0,width:1200,height:800,ppm:140,origin:[600,520],position:query.has('rear')?[-8,6,-10]:[8,6,10],up:[0,1,0]},
] : [
  {name:'side',left:0,top:0,width:1200,height:650,ppm:150,origin:[618,582],position:[20,0,0],up:[0,1,0]},
  {name:'top',left:0,top:650,width:1200,height:520,ppm:151,origin:[626,257],position:[0,20,0],up:[-1,0,0]},
  {name:'front',left:0,top:1170,width:620,height:630,ppm:150,origin:[376,566],position:[0,0,20],up:[0,1,0]},
  {name:'rear',left:620,top:1170,width:580,height:630,ppm:150,origin:[255,566],position:[0,0,-20],up:[0,1,0]},
];
createRoot(document.getElementById('root')!).render(<>
  {views.map(v=><div className="view" key={v.name} style={{left:v.left,top:v.top,width:v.width,height:v.height}}>
    <Canvas orthographic dpr={1} gl={{preserveDrawingBuffer:true,alpha:true,antialias:true}}
      onCreated={({camera,gl,scene})=>{
        const c=camera as THREE.OrthographicCamera;
        c.position.fromArray(v.position); c.up.fromArray(v.up); c.lookAt(...(detail?detailTarget:[0,0,0]) as [number,number,number]);
        c.left=-v.origin[0]/v.ppm; c.right=(v.width-v.origin[0])/v.ppm;
        c.top=v.origin[1]/v.ppm; c.bottom=-(v.height-v.origin[1])/v.ppm;
        c.near=.1;c.far=100;c.updateProjectionMatrix();gl.setClearColor(0xffffff,0);
        (window as any).shermanQA??={};
        (window as any).shermanQA[v.name]={measure:()=>{
          scene.updateMatrixWorld(true);
          const result: Record<string, {min:number[],max:number[]}>={};
          scene.traverse(o=>{if(o.name){const b=new THREE.Box3().setFromObject(o);result[o.name]={min:b.min.toArray(),max:b.max.toArray()};}});
          return result;
        }};
      }}>
      <ambientLight intensity={1.6}/><directionalLight position={[8,12,10]} intensity={2}/><Tank/>
    </Canvas>
  </div>)}
  {mode==='overlay'&&<img id="reference" src="./m4-dyer.jpg"/>}
</>);
