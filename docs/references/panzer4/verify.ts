import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec,TankSpec} from '../../../src/tanks/core/types';
import model from '../../../src/tanks/panzer4/model.json';
import tank from '../../../src/tanks/panzer4/tank.json';
const issues=validateTankDraft(tank as TankSpec,model as TankModelSpec,'panzer4');
assert.equal(issues.filter(i=>i.severity==='error').length,0,JSON.stringify(issues));
type Bounds=Record<string,{min:number[],max:number[]}>;
const read=(name:string):Bounds=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url),'utf8'));
const before=read('before-bounds.json'),after=read('after-bounds.json');
const center=(b:Bounds,id:string,i:number)=>(b[id].min[i]+b[id].max[i])/2;
const width=(b:Bounds,id:string,i:number)=>b[id].max[i]-b[id].min[i];
// Native pixels independently read from the downloaded Bradford four-view drawing.
// Cameras remain fixed across every capture.
const landmarks:[string,number,(b:Bounds)=>number][]=[
 ['Side gun axis',275,b=>592-center(b,'tapered-kwk40-barrel',1)*155],
 ['Side muzzle exit',199,b=>815-b['muzzle-brake-baffle-2'].max[2]*155],
 ['Side turret roof',220,b=>592-b['ausf-h-faceted-turret'].max[1]*155],
 ['Side cupola center',929,b=>815-center(b,'commander-cupola',2)*155],
 ['Side cupola hatch top',179,b=>592-b['commander-hatch'].max[1]*155],
 ['Side turret skirt nose',673,b=>815-b['turret-schurzen-panel-0'].max[2]*155],
 ['Side turret skirt rear',1106,b=>815-b['turret-schurzen-panel-4'].min[2]*155],
 ['Side turret skirt bottom',320,b=>592-b['turret-schurzen-panel-4'].min[1]*155],
 ['Side hull roof',324,b=>592-b['ausf-h-stepped-superstructure'].max[1]*155],
 ['Side front mudflap nose',375,b=>815-b['left-front-mudflap'].max[2]*155],
 ['Side rear mudflap end',1290,b=>815-b['left-rear-mudflap'].min[2]*155],
 ['Side sprocket center',455,b=>815-center(b,'left-sprocket-hub',2)*155],
 ['Side idler center',1190,b=>815-center(b,'left-idler-hub',2)*155],
 ['Side idler height',502,b=>592-center(b,'left-idler-hub',1)*155],
 ...[546,623,700,777,854,931,1006,1084].map((px,i)=>[`Side road wheel ${i}`,px,(b:Bounds)=>815-center(b,`left-road-wheel-${i}`,2)*155] as [string,number,(b:Bounds)=>number]),
 ['Side road wheel diameter',73,b=>width(b,'left-road-wheel-0-inner-tire',1)*155],
 ['Side road wheel height',546,b=>592-center(b,'left-road-wheel-0',1)*155],
 ['Side skirt front',412,b=>815-b['left-schurzen-panel-0'].max[2]*155],
 ['Side skirt lower edge',515,b=>592-b['left-schurzen-panel-2'].min[1]*155],
 ['Plan cupola center',929,b=>815-center(b,'commander-cupola',2)*155],
 ['Plan cupola foot diameter',140,b=>width(b,'cupola-foot',0)*155],
 ['Front turret surround width',368,b=>(b['turret-schurzen-panel-7'].max[0]-b['turret-schurzen-panel-1'].min[0])*155],
 ['Front hull underside',1614,b=>1675-b['ausf-h-lower-hull'].min[1]*155],
 ['Front driver visor lateral',531,b=>478+center(b,'driver-visor-armor',0)*155],
 ['Front bow MG lateral',384,b=>478+center(b,'hull-mg-ball',0)*155],
];
for(const [name,ref,f]of landmarks)assert.ok(Math.abs(f(after)-ref)<=12,`${name}: ${f(after)} vs ${ref}`);
for(const side of ['left','right'])for(let i=0;i<8;i++){
 const id=`${side}-road-wheel-${i}-inner-tire`;
 assert.ok(Math.abs(width(after,id,1)-width(after,id,2))<1e-5,'Circular road wheels');
 assert.ok(Math.abs(after[id].min[1]-.06)<1e-5,'Wheel touches inner track ground run');
}
assert.ok(Math.abs(after['commander-hatch-handle'].max[1]-2.68)<1e-5,'Overall height excluding antenna');
assert.ok(Math.abs(after['muzzle-brake-baffle-2'].max[2]-(tank.mounts.turretOffset[2]+tank.mounts.gunPivotOffset[2]+tank.mounts.muzzleDistance))<1e-5,'Projectile spawn at brake exit');
assert.ok(after['ausf-h-lower-hull'].max[1]>=after['ausf-h-stepped-superstructure'].min[1],'Hull joins');
assert.ok(after['left-continuous-track-belt'].min[1]>=0,'Track above ground');
const original=JSON.parse(execFileSync('git',['show','baf3f68e2853e2addab1e4c53e16577e743dbcc3:src/tanks/panzer4/tank.json'],{encoding:'utf8'}));
for(const key of ['mobility','weapons','traverse','durability','meta'])assert.deepEqual(tank[key],original[key],`Preserved ${key}`);
for(const p of original.armorModel.plates)assert.equal(tank.armorModel.plates.find(x=>x.id===p.id)?.armorThickness,p.armorThickness);
// All four vertices of every sloped turret facet lie on its armor OBB plane.
const shell:any=model.slots.turret.find(n=>n.id==='ausf-h-faceted-turret');
const ids=['turret-front','turret-cheek-right','turret-side-right','turret-rear-cheek-right','turret-bustle','turret-rear-cheek-left','turret-side-left','turret-cheek-left'];
ids.forEach((id,i)=>{
 const p=tank.armorModel.plates.find(x=>x.id===id)!;
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation as [number,number,number])).invert();
 for(const j of [i,(i+1)%8])for(const top of [false,true]){
  const [x,z]=shell.params.plan[j],scale=top?shell.params.topScale:1;
  const v=new THREE.Vector3(x*scale,top?shell.params.topY:shell.params.bottomY,z*scale).sub(new THREE.Vector3(...p.position as [number,number,number])).applyQuaternion(q);
  assert.ok(Math.abs(v.z)<1e-5,`${id} facet alignment`);
  assert.ok(Math.abs(v.x)<=p.halfExtents[0]+1e-5&&Math.abs(v.y)<=p.halfExtents[1]+1e-5,`${id} coverage`);
 }
});
const errs=(b:Bounds)=>landmarks.map(([,ref,f])=>Math.abs(f(b)-ref));
// Sloped front armor endpoints must lie on the corresponding OBB plane.
const lower:any=model.slots.hull.find(n=>n.id==='ausf-h-lower-hull');
const upper:any=model.slots.hull.find(n=>n.id==='ausf-h-stepped-superstructure');
for(const [id,points]of [
 ['hull-front-plate',[upper.shape.outline[1],upper.shape.outline[2]]],
 ['hull-upper-glacis',[lower.shape.outline[0],lower.shape.outline[5]]],
 ['hull-lower-glacis',[lower.shape.outline[1],lower.shape.outline[0]]],
] as [string,number[][]][]){
 const p=tank.armorModel.plates.find(n=>n.id===id)!;
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation as [number,number,number])).invert();
 for(const [u,y]of points){const v=new THREE.Vector3(0,y,-u).sub(new THREE.Vector3(...p.position as [number,number,number])).applyQuaternion(q);assert.ok(Math.abs(v.z)<1e-5,`${id} slope`);}
}
assert.equal(model.slots.hull.filter(n=>/^(left|right)-schurzen-panel-/.test(n.id)).length,12,'Six hull skirts per side');
for(const p of tank.armorModel.plates)assert.ok([...p.position,...p.halfExtents,...p.rotation].every(Number.isFinite),'Finite armor geometry');
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
const report=`# Panzer IV measured landmarks\n\nFixed cameras, native Bradford drawing pixels; acceptance <=12 px. These are illustration-fit errors, not historical manufacturing tolerances.\n\nMean: ${mean(errs(before)).toFixed(2)} -> ${mean(errs(after)).toFixed(2)} px. Final maximum: ${Math.max(...errs(after)).toFixed(2)} px.\n\n| Landmark | Reference | Before | After | Final error |\n|---|---:|---:|---:|---:|\n`+landmarks.map(([n,r,f])=>`| ${n} | ${r} | ${f(before).toFixed(2)} | ${f(after).toFixed(2)} | ${Math.abs(f(after)-r).toFixed(2)} |`).join('\n')+'\n';
fs.writeFileSync(new URL('measurements.md',import.meta.url),report);
console.log(`${landmarks.length} landmarks: mean ${mean(errs(before)).toFixed(2)} -> ${mean(errs(after)).toFixed(2)} px; max ${Math.max(...errs(after)).toFixed(2)} px. Schema, geometry, facet OBBs and gameplay preservation passed.`);
