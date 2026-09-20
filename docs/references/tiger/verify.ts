// Independent image landmarks measured from the downloaded scan, checked against
// world bounds collected from the actual production renderer by capture.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec,TankSpec} from '../../../src/tanks/core/types';
import model from '../../../src/tanks/tiger/model.json';
import tank from '../../../src/tanks/tiger/tank.json';
const issues=validateTankDraft(tank as TankSpec,model as TankModelSpec,'tiger');
assert.equal(issues.filter(i=>i.severity==='error').length,0,JSON.stringify(issues));
const b=JSON.parse(fs.readFileSync(new URL('./after-bounds.json',import.meta.url),'utf8'));
const center=(id:string,axis:number)=>(b[id].min[axis]+b[id].max[axis])/2;
const landmarks:[string,number,number][]=[
  ['Side: upper front',500,814-b['front-armored-plate'].max[2]*143],
  ['Side: hull deck',322,578-b['vertical-sided-upper-hull'].max[1]*143],
  ['Side: turret roof',205,578-b['rolled-horseshoe-turret-shell'].max[1]*143],
  ['Side: cupola top incl. handle',148,578-b['commander-hatch-handle'].max[1]*143],
  ['Side: gun axis',267,578-center('kwk36-forward-barrel',1)*143],
  ['Side: muzzle tip',58,814-b['muzzle-brake-baffle-2'].max[2]*143],
  ['Side: first road axle',550,814-center('left-road-wheel-axle-0',2)*143],
  ['Side: last road axle',1080,814-center('left-road-wheel-axle-7',2)*143],
  ['Side: sprocket axle',451,814-center('left-sprocket-rim',2)*143],
  ['Side: idler axle',1177,814-center('left-idler-rim',2)*143],
  ['Top: upper hull front',490,819-b['front-armored-plate'].max[2]*149],
  ['Top: turret front',655,819-b['rolled-horseshoe-turret-shell'].max[2]*149],
  ['Top: turret rear',1000,819-b['rolled-horseshoe-turret-shell'].min[2]*149],
  ['Top: turret width',345,(b['rolled-horseshoe-turret-shell'].max[0]-b['rolled-horseshoe-turret-shell'].min[0])*149],
  ['Front: outside track span',530,(b['right-continuous-track'].max[0]-b['left-continuous-track'].min[0])*149],
  ['Front: turret roof',1405,1794-b['rolled-horseshoe-turret-shell'].max[1]*149],
  ['Front: gun axis',1464,1794-center('kwk36-forward-barrel',1)*149],
  ['Front: cupola center',478,391+center('early-drum-cupola',0)*149],
];
// 12 scan pixels (~80 mm) accommodates line weight and inconsistent source
// elevations; it is a visual-proportion tolerance, not a machining tolerance.
for(const [name,ref,actual] of landmarks)assert.ok(Math.abs(ref-actual)<=12,`${name}: ${actual} vs ${ref}`);
assert.ok(Math.abs(b['muzzle-brake-baffle-2'].max[2]-(tank.mounts.turretOffset[2]+tank.mounts.gunPivotOffset[2]+tank.mounts.muzzleDistance))<1e-5,'Muzzle spawn must coincide with bore exit');
assert.ok(Math.abs((b['left-road-wheel-axle-0'].max[1]-b['left-road-wheel-axle-0'].min[1])-.8)<1e-5,'Road wheels remain circular, 800 mm diameter');
assert.ok(Math.abs((b['early-drum-cupola'].max[1]-b['early-drum-cupola'].min[1])-.265)<1e-5,'Cupola drum matches dimensioned survey');
const report='# Rendered landmark verification\n\nScan pixels; same fixed orthographic cameras used before and after. Maximum allowed error: 12 px.\n\n| Landmark | Reference | Rendered | Error |\n|---|---:|---:|---:|\n'+landmarks.map(([name,ref,actual])=>`| ${name} | ${ref} | ${actual.toFixed(2)} | ${Math.abs(ref-actual).toFixed(2)} |`).join('\n')+'\n\n18/18 landmarks pass. Schema, 800 mm road wheels, 265 mm cupola drum, and muzzle alignment pass.\n';
fs.writeFileSync(new URL('./measurements.md',import.meta.url),report);
console.log(report);
