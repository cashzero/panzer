import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec,TankSpec} from '../../../src/tanks/core/types';
import model from '../../../src/tanks/sherman/model.json';
import tank from '../../../src/tanks/sherman/tank.json';
const issues=validateTankDraft(tank as TankSpec,model as TankModelSpec,'sherman');
assert.equal(issues.filter(i=>i.severity==='error').length,0,JSON.stringify(issues));
type Bounds=Record<string,{min:number[],max:number[]}>;
const read=(name:string):Bounds=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url),'utf8'));
const before=read('before-bounds.json'),after=read('after-bounds.json');
const center=(b:Bounds,id:string,axis:number)=>(b[id].min[axis]+b[id].max[axis])/2;
const width=(b:Bounds,id:string,axis:number)=>b[id].max[axis]-b[id].min[axis];
// Pixels independently read from the downloaded Dyer drawing. Cameras remain
// fixed between captures; fitting is in the model, never in the image transform.
const landmarks:[string,number,(b:Bounds)=>number][]=[
 ['Side: hull nose',176,b=>618-b['rounded-differential-housing'].max[2]*150],
 ['Side: lower glacis junction',260,b=>618-b['m4-welded-upper-hull'].max[2]*150],
 ['Side: hull deck height',284,b=>582-b['m4-welded-upper-hull'].max[1]*150],
 ['Side: side plate bottom',390,b=>582-b['m4-welded-upper-hull'].min[1]*150],
 ['Side: hull rear',1050,b=>618-b['m4-welded-upper-hull'].min[2]*150],
 ['Side: turret front',470,b=>618-b['d50878-low-bustle-casting'].max[2]*150],
 ['Side: turret rear',783,b=>618-b['d50878-low-bustle-casting'].min[2]*150],
 ['Side: turret roof',168,b=>582-b['d50878-low-bustle-casting'].max[1]*150],
 ['Side: turret lower edge',277,b=>582-b['d50878-low-bustle-casting'].min[1]*150],
 ['Side: gun axis',239,b=>582-center(b,'75mm-m3-short-exposed-barrel',1)*150],
 ['Side: muzzle',171,b=>618-b['plain-75mm-muzzle'].max[2]*150],
 ['Side: sprocket center',222,b=>618-center(b,'left-drive-sprocket-hub',2)*150],
 ['Side: idler center',989,b=>618-center(b,'left-rear-idler-hub',2)*150],
 ['Side: front bogie',362,b=>618-center(b,'left-bogie-0-cast-housing',2)*150],
 ['Side: middle bogie',587,b=>618-center(b,'left-bogie-1-cast-housing',2)*150],
 ['Side: rear bogie',813,b=>618-center(b,'left-bogie-2-cast-housing',2)*150],
 ['Side: foremost road wheel',295,b=>618-center(b,'left-bogie-0-wheel-hub-1',2)*150],
 ['Side: rearmost road wheel',881,b=>618-center(b,'left-bogie-2-wheel-hub--1',2)*150],
 ['Side: road wheel height',527,b=>582-center(b,'left-bogie-0-wheel-hub-1',1)*150],
 ['Top: upper hull width',413,b=>width(b,'m4-welded-upper-hull',0)*151],
 ['Top: hatch center longitudinal',676,b=>626-center(b,'commander-split-hatch-ring',2)*151],
 ['Top: hatch center lateral',841,b=>907+center(b,'commander-split-hatch-ring',0)*151],
 ['Top: hatch diameter',134,b=>width(b,'commander-split-hatch-ring',0)*151],
 ['Front: upper hull width',407,b=>width(b,'m4-welded-upper-hull',0)*150],
 ['Front: turret width',311,b=>width(b,'d50878-low-bustle-casting',0)*150],
 ['Front: track outside span',393,b=>(b['right-continuous-track'].max[0]-b['left-continuous-track'].min[0])*150],
];
for(const [name,ref,f]of landmarks)assert.ok(Math.abs(f(after)-ref)<=12,`${name}: ${f(after)} vs ${ref}`);
assert.ok(Math.abs(width(after,'left-bogie-0-tire-1',1)-.508)<1e-5,'508 mm wheel diameter');
assert.ok(Math.abs(width(after,'left-bogie-0-tire-1',2)-.508)<1e-5,'Wheel must remain circular');
assert.ok(Math.abs(after['plain-75mm-muzzle'].max[2]-(tank.mounts.turretOffset[2]+tank.mounts.gunPivotOffset[2]+tank.mounts.muzzleDistance))<1e-5,'Muzzle spawn aligned to bore exit');
assert.ok(Math.abs(after['left-bogie-0-tire-1'].min[1]-.098)<1e-5,'Wheel contacts inner track ground run');
assert.ok(after['lower-hull-tub'].max[1]>=after['m4-welded-upper-hull'].min[1],'Hull sections must join');
const errors=(b:Bounds)=>landmarks.map(([,ref,f])=>Math.abs(f(b)-ref));
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const report='# Sherman rendered landmark verification\n\nFixed cameras; pixels in the 1200 × 1800 Dyer drawing. Acceptance tolerance: 12 px (~80 mm), for game-scale proportions.\n\n| Landmark | Reference | Before | After | Final error |\n|---|---:|---:|---:|---:|\n'+landmarks.map(([n,r,f])=>`| ${n} | ${r} | ${f(before).toFixed(2)} | ${f(after).toFixed(2)} | ${Math.abs(f(after)-r).toFixed(2)} |`).join('\n')+`\n\n${landmarks.length}/${landmarks.length} pass. Mean error: ${mean(errors(before)).toFixed(2)} → ${mean(errors(after)).toFixed(2)} px. Maximum final error: ${Math.max(...errors(after)).toFixed(2)} px.\n\nSchema, circular 508 mm wheels, wheel/track contact, hull section continuity and muzzle/spawn alignment pass.\n`;
fs.writeFileSync(new URL('./measurements.md',import.meta.url),report);console.log(report);
