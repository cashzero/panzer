import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec,TankSpec} from '../../../src/tanks/core/types';
import model from '../../../src/tanks/panzer2/model.json';
import tank from '../../../src/tanks/panzer2/tank.json';
const issues=validateTankDraft(tank as TankSpec,model as TankModelSpec,'panzer2');
assert.equal(issues.filter(i=>i.severity==='error').length,0,JSON.stringify(issues));
type Bounds=Record<string,{min:number[],max:number[]}>;
const read=(name:string):Bounds=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url),'utf8'));
const before=read('before-bounds.json'),after=read('after-bounds.json');
const center=(b:Bounds,id:string,i:number)=>(b[id].min[i]+b[id].max[i])/2;
const width=(b:Bounds,id:string,i:number)=>b[id].max[i]-b[id].min[i];
// Independently read drawing pixels in comparison-reference.png. Fixed cameras.
// F drawing: side/front/rear. C plan: shared turret footprint and lateral offset
// only; do not compare C hatches, front hull step, idler or roof height to F.
const landmarks:[string,number,(b:Bounds)=>number][]=[
 ['F side turret roof',110,b=>472-b['ausf-f-faceted-turret'].max[1]*183],
 ['F side turret bottom',200,b=>472-b['ausf-f-faceted-turret'].min[1]*183],
 ['F side gun axis',160,b=>472-center(b,'autocannon-barrel',1)*183],
 ['F side muzzle',171,b=>534-b['muzzle-bore'].max[2]*183],
 ['F side cupola center',500,b=>534-center(b,'commander-cupola',2)*183],
 ['F side cupola hatch top',92,b=>472-b['commander-hatch'].max[1]*183],
 ['F side sprocket center',182,b=>534-center(b,'left-front-sprocket',2)*183],
 ['F side idler center',885,b=>534-center(b,'left-rear-idler',2)*183],
 ['F side idler height',365,b=>472-center(b,'left-rear-idler',1)*183],
 ['F side idler diameter',126,b=>width(b,'left-rear-idler-rim',1)*183],
 ...[305,418,532,644,756].map((px,i)=>[`F side road wheel ${i}`,px,(b:Bounds)=>534-center(b,`left-road-wheel-${i}`,2)*183] as [string,number,(b:Bounds)=>number]),
 ['F front turret width',282,b=>width(b,'ausf-f-faceted-turret',0)*183],
 ['F front turret center',307,b=>278+center(b,'ausf-f-faceted-turret',0)*183],
 ['F front cupola center',284,b=>278+center(b,'commander-cupola',0)*183],
 ['F front cupola diameter',130,b=>width(b,'commander-hatch',0)*183],
 ['F front hull underside',1476,b=>1540-b['lower-hull'].min[1]*183],
 ['C plan turret lateral center',846,b=>806+center(b,'ausf-f-faceted-turret',0)*224],
 ['C plan turret front',350,b=>580-b['ausf-f-faceted-turret'].max[2]*224],
 ['C plan turret rear',678,b=>580-b['ausf-f-faceted-turret'].min[2]*224],
];
for(const [name,ref,f]of landmarks)assert.ok(Math.abs(f(after)-ref)<=12,`${name}: ${f(after)} vs ${ref}`);
for(const side of ['left','right'])for(let i=0;i<5;i++){
 const id=`${side}-road-wheel-${i}-rim`;
 assert.ok(Math.abs(width(after,id,1)-width(after,id,2))<1e-5,'Circular road wheels');
 assert.ok(Math.abs(after[id].min[1]-.05)<1e-5,'Wheel touches inner track ground run');
}
assert.ok(Math.abs(after['hatch-handle'].max[1]-2.15)<1e-5,'Overall height excluding antenna');
assert.ok(Math.abs(after['muzzle-bore'].max[2]-(tank.mounts.turretOffset[2]+tank.mounts.gunPivotOffset[2]+tank.mounts.muzzleDistance))<1e-5,'Projectile spawn at bore exit');
assert.ok(after['lower-hull'].max[1]>=after['ausf-f-superstructure'].min[1],'Hull joins');
assert.ok(after['left-continuous-track'].min[1]>=0,'Track above ground');
const original=JSON.parse(execFileSync('git',['show','baf3f68e2853e2addab1e4c53e16577e743dbcc3:src/tanks/panzer2/tank.json'],{encoding:'utf8'}));
for(const key of ['mobility','weapons','traverse','durability','visuals','meta'])assert.deepEqual(tank[key],original[key],`Preserved ${key}`);
for(const p of original.armorModel.plates)assert.equal(tank.armorModel.plates.find(x=>x.id===p.id)?.armorThickness,p.armorThickness);
// All four vertices of every sloped turret facet lie on its armor OBB plane.
const shell:any=model.slots.turret.find(n=>n.id==='ausf-f-faceted-turret');
const ids=['turret-front','turret-cheek-right','turret-side-right','turret-rear-cheek-right','turret-rear','turret-rear-cheek-left','turret-side-left','turret-cheek-left'];
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
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
const report=`# Panzer II measured landmarks\n\nFixed cameras, two-times displayed reference pixels; acceptance <=12 px (6 native pixels). These are illustration-fit errors, not historical manufacturing tolerances.\n\nMean: ${mean(errs(before)).toFixed(2)} -> ${mean(errs(after)).toFixed(2)} px. Final maximum: ${Math.max(...errs(after)).toFixed(2)} px.\n\n| Landmark | Reference | Before | After | Final error |\n|---|---:|---:|---:|---:|\n`+landmarks.map(([n,r,f])=>`| ${n} | ${r} | ${f(before).toFixed(2)} | ${f(after).toFixed(2)} | ${Math.abs(f(after)-r).toFixed(2)} |`).join('\n')+'\n';
fs.writeFileSync(new URL('measurements.md',import.meta.url),report);
console.log(`${landmarks.length} landmarks: mean ${mean(errs(before)).toFixed(2)} -> ${mean(errs(after)).toFixed(2)} px; max ${Math.max(...errs(after)).toFixed(2)} px. Schema, geometry, facet OBBs and gameplay preservation passed.`);
