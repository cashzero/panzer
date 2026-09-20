// One-time migration kept as a record of the measured corrections.
// Input is the pre-calibration model/spec, not the current checked-in model.
// Usage: node calibrate.mjs <original-model.json> <original-tank.json> <output-dir>
import fs from 'node:fs';
import path from 'node:path';
import {Vector3,Quaternion,Euler} from 'three';
const [modelPath,tankPath,out]=process.argv.slice(2);
if(!modelPath||!tankPath||!out) throw Error('Provide original model, original tank, output directory');
const m=JSON.parse(fs.readFileSync(modelPath)),t=JSON.parse(fs.readFileSync(tankPath));
const get=(slot,id)=>m.slots[slot].find(n=>n.id===id);
// Transform complete nodes in their parent frame, preserving local rotations.
const move=(n,d)=>n.position=(n.position??[0,0,0]).map((v,i)=>v+d[i]);
const mirrorX=n=>{
  if(n.position)n.position[0]*=-1;
  if(n.rotation){n.rotation[1]*=-1;n.rotation[2]*=-1;}
  if(n.vertices)n.vertices.forEach(v=>v[0]*=-1);
  if(n.faces)n.faces.forEach(f=>f.reverse());
  if(n.children)n.children.forEach(mirrorX);
  if(n.child)mirrorX(n.child);
};
for(const n of m.slots.hull){
  if(n.id==='lower-armored-hull-tub')continue;
  if(n.position?.[1]>1.4)move(n,[0,-.10,0]);
  if(/front-armored|driver-|hull-mg|crew-hatch|crew-periscope|hatch-handle|headlamp/.test(n.id))move(n,[0,0,-.45]);
  if(/driver-|hull-mg|shovel/.test(n.id))mirrorX(n);
}
Object.assign(get('hull','vertical-sided-upper-hull'),{size:[3.16,.47,5.11],position:[0,1.585,-.405]});
Object.assign(get('hull','front-transmission-deck'),{size:[2.1,.065,.98],position:[0,1.34,2.65],rotation:[.20,0,0]});
get('hull','lower-armored-hull-tub').shape.outline=[[-3.158,1.21],[-3.158,.86],[-2.93,.43],[2.87,.43],[3.158,1.03],[3.02,1.40],[-2.7,1.40]];
// Second overlay pass: mudguards, rear jack orientation and antenna datum.
for(const side of ['left','right']){
  get('hull',`${side}-front-mudguard`).position[2]=2.725;
  get('hull',`${side}-rear-mudguard`).position[2]=-2.86;
  const sign=side==='left'?-1:1;
  const start=new Vector3(sign*.18,1.96,-1.90),end=new Vector3(sign*1.22,1.84,-3.15);
  const direction=end.clone().sub(start);
  const rotation=new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.clone().normalize()));
  Object.assign(get('hull',`${side}-feifel-inlet-hose`),{position:start.add(end).multiplyScalar(.5).toArray(),height:direction.length(),rotation:[rotation.x,rotation.y,rotation.z]});
}
Object.assign(get('hull','rear-jack'),{size:[.5,.15,.16],position:[-1.22,.94,-3.21]});
Object.assign(get('hull','rear-jack-foot'),{size:[.05,.21,.22],position:[-1.48,.94,-3.21]});
get('hull','hull-antenna-base').position=[-1.38,1.88,-1.06];
Object.assign(get('hull','hull-radio-antenna'),{height:1.95,position:[-1.38,2.935,-1.06]});
// Match wheel centers without turning the 800 mm wheels into ellipses.
for(const slot of ['tracksLeft','tracksRight'])for(const n of m.slots[slot]){
  if(n.id.includes('road-wheel-axle')){const a=Number(n.id.split('-').at(-1));n.position[2]=1.85-a*.535;}
  else if(n.id.includes('sprocket'))move(n,[0,-.13,-.19]);
  else if(n.id.includes('idler'))move(n,[0,-.17,.16]);
  if(n.type==='extrude')for(const p of [n.shape.outline,...(n.shape.holes??[])])for(const v of p){v[0]*=.935;v[1]*=.94;}
  if(n.vertices)for(const v of n.vertices){v[2]*=.935;v[1]*=.94;}
}
t.mounts.turretOffset=[0,1.83,0];
t.mounts.gunPivotOffset=[0,.385,1.16];
t.mounts.muzzleDistance=4.11;
// 815 mm shell and 265 mm drum cupola, from the dimensioned turret profile.
for(const n of m.slots.turret){
  if(n.id==='rolled-horseshoe-turret-shell'){n.params.bottomY=.01;n.params.topY=.815;continue;}
  if(n.id==='turret-ring'){n.position[1]=-.005;n.height=.03;continue;}
  move(n,[0,-.04,0]);
  if(/cupola|commander/.test(n.id)){
    n.position[1]=.825+(n.position[1]-.825)*(.265/.285);
    if(n.height)n.height*=.265/.285;
    // The drum is 870 mm across in the survey, including its rim.
    n.position[0]=.56+( -n.position[0]-.52)*1.16;
    n.position[2]=-.56+(n.position[2]+.49)*1.16;
    if(n.radiusTop){n.radiusTop*=1.16;n.radiusBottom*=1.16;}
    if(n.rotation){n.rotation[1]*=-1;n.rotation[2]*=-1;}
  }else if(/loader|roof-ventilator|pistol|escape/.test(n.id))mirrorX(n);
}
// Plan-view shell length (2.319 m); preserve circular roof fittings.
const shell=get('turret','rolled-horseshoe-turret-shell');
shell.params.plan.forEach(p=>p[1]*=.935);
for(const n of m.slots.turret){
  if(n.position)n.position[2]*=.935;
  if(n.id==='turret-front-plate')n.position[2]=1.065;
  if(/cupola|commander/.test(n.id))n.position[2]+=.06;
}
Object.assign(get('turret','rear-stowage-bin'),{size:[1.51,.56,.46],position:[0,.44,-1.43]});
Object.assign(get('turret','rear-stowage-lid'),{size:[1.55,.035,.49],position:[0,.735,-1.43]});
for(const side of ['left','right'])get('turret',`stowage-latch-${side}`).position[2]=-1.677;
// Keep the mantlet on the revised trunnion and all barrel sections contiguous.
for(const n of m.slots.gun){
  if(n.id==='curved-wide-mantlet')continue;
  if(n.id==='kwk36-forward-barrel'){n.height+=.11;n.position[2]+=.055;}
  if(n.id.startsWith('muzzle-brake'))move(n,[0,0,.11]);
  if(n.id.includes('aperture'))mirrorX(n);
  if(n.id.startsWith('muzzle-brake-baffle')){
    // Side silhouette was too flat; retain the 88 mm bore hole unchanged.
    n.shape.outline.forEach(p=>p[1]*=1.4);
  }
  if(n.id==='muzzle-brake-top'||n.id==='muzzle-brake-bottom')n.position[1]*=1.4;
}
for(const p of t.armorModel.plates){
  if(p.parent==='turret'){
    p.position[1]-=.04;p.position[2]*=.935;
    p.halfExtents[2]*=.935;
    // Refit curved side OBBs to the compressed plan segments.
    if(p.id.includes('curved-rear')){
      const angle=p.rotation[1], oldHalf=p.halfExtents[2]/.935;
      p.rotation[1]=Math.atan2(Math.sin(angle),Math.cos(angle)*.935);
      p.halfExtents[2]=oldHalf*Math.hypot(Math.sin(angle),Math.cos(angle)*.935);
    }
  }
  if(p.parent==='hull'){
    if(p.position[1]>1.4)p.position[1]-=.10;
    if(p.id==='hull-front-plate')p.position[2]-=.45;
    if(p.id.startsWith('hull-side')){p.halfExtents[2]=2.555;p.position[2]=-.405;}
    if(p.id==='hull-roof'){p.halfExtents[2]=1.755;p.position[2]=.395;}
    if(p.isTrack){p.halfExtents[2]*=.935;p.halfExtents[1]*=.94;p.position[1]*=.94;p.position[2]*=.935;}
  }
}
// Match the transmission deck rather than leaving an upright floating hitbox.
Object.assign(t.armorModel.plates.find(p=>p.id==='hull-upper-glacis'),{position:[0,1.34,2.65],halfExtents:[1.04,.0325,.49],rotation:[.20,0,0]});
const round=(_k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v;
const lines=['{','  "schemaVersion": 1,','  "slots": {'];
Object.entries(m.slots).forEach(([s,ns],i)=>{lines.push(`    "${s}": [`);ns.forEach((n,j)=>lines.push('      '+JSON.stringify(n,round)+(j<ns.length-1?',':'')));lines.push('    ]'+(i<4?',':''));});
lines.push('  }','}');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'model.json'),lines.join('\n')+'\n');
t.mounts=JSON.parse(JSON.stringify(t.mounts,round));
t.armorModel=JSON.parse(JSON.stringify(t.armorModel,round));
fs.writeFileSync(path.join(out,'tank.json'),JSON.stringify(t,null,2).replace(/\[\s*[-\d][\d\s,.e+\-]*\]/g,s=>'['+JSON.parse(s).join(', ')+']')+'\n');
