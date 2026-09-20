// Reproducible geometric migration; inputs must be the unmodified baseline.
// node calibrate.mjs original-model.json original-tank.json output-directory [pass]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
const [mp,tp,out,pass='2']=process.argv.slice(2);
const m=JSON.parse(fs.readFileSync(mp)),t=JSON.parse(fs.readFileSync(tp));
const get=(s,id)=>m.slots[s].find(n=>n.id===id);
function mirror(n){
 if(n.position)n.position[0]*=-1;
 if(n.rotation){n.rotation[1]*=-1;n.rotation[2]*=-1;}
 if(n.step)n.step[0]*=-1;
 if(n.children)n.children.forEach(mirror);
 if(n.child)mirror(n.child);
}
// Vehicle left is +X. Reflect only asymmetric fixtures, not extrusion axes.
for(const n of m.slots.hull)if(!['lower-hull','ausf-f-superstructure'].includes(n.id))mirror(n);
t.mounts.turretOffset[0]=.17;
t.mounts.gunPivotOffset=[.16,.25,.67];
m.slots.gun.forEach(mirror);
const shell=get('turret','ausf-f-faceted-turret');
shell.params.plan.forEach(p=>p[0]*=1.54/1.36);
shell.params.topY=.52;
shell.params.topScale=.72;
for(const n of m.slots.turret){
 if(n.id.includes('turret-side')){
  n.position[0]*=1.54/1.36;n.position[1]*=.52/.64;
 }
 if(n.id.startsWith('rear-vision'))n.position[1]*=.52/.64;
 if(n.id==='roof-ventilator'){mirror(n);n.position[1]-=.12;}
 if(/commander|hatch-handle|cupola-vision/.test(n.id)){
  n.position[0]=-.12+n.position[0]*(.34/.247);
  n.position[2]=-.08+(n.position[2]+.25)*(.34/.247);
  if(n.id==='commander-cupola-base'){n.radiusTop=n.radiusBottom=.36;n.height=.045;n.position[1]=.5425;}
  if(n.id==='commander-cupola'){n.radiusTop=n.radiusBottom=.34;n.height=.05;n.position[1]=.59;}
  if(n.id==='commander-hatch'){n.radiusTop=n.radiusBottom=.36;n.height=.035;n.position[1]=.6325;}
  if(n.id==='hatch-handle'){n.position[1]=.67;n.size[1]=.04;}
  if(n.id.startsWith('cupola-vision')){n.position[1]=.59;n.size[1]=.026;}
 }
}
// Armor follows the same independent turret/gun transformations.
for(const p of t.armorModel.plates){
 if(p.parent==='gunGroup'){p.position[0]*=-1;}
 if(p.parent==='turret'){
  p.position[0]*=1.54/1.36;p.position[1]*=.52/.64;
  p.halfExtents[1]*=.52/.64;
  if(/front|rear|roof/.test(p.id))p.halfExtents[0]*=1.54/1.36;
 }
}
// Additional measured corrections are applied in pass two.
if(Number(pass)>=2){
 const upper=get('hull','ausf-f-superstructure');
 upper.shape.outline[0][0]= -1.50;upper.shape.outline[1][0]= -1.43;
 for(const p of get('hull','lower-hull').shape.outline)if(p[1]===.26)p[1]=.34;
 for(const n of m.slots.hull)if(/driver-visor|driver-vision|dummy-visor/.test(n.id))n.position[2]+=.17;
 const barrel=get('gun','autocannon-barrel');barrel.height-=.10;barrel.position[2]-=.05;
 for(const id of ['autocannon-muzzle','muzzle-bore'])get('gun',id).position[2]-=.10;
 t.mounts.muzzleDistance-=.10;
 for(const n of m.slots.turret)if(n.id.startsWith('rear-vision'))n.position[2]+=.06;
 for(const slot of ['tracksLeft','tracksRight']){
  const idler=m.slots[slot].find(n=>n.id.endsWith('rear-idler'));
  idler.position[1]=.59;
  for(const n of idler.children){n.radiusTop*=.345/.31;n.radiusBottom*=.345/.31;}
  for(const n of m.slots[slot]){
   if(n.id.includes('road-wheel'))n.position[2]*=.62/.64;
   if(/suspension-arm|leaf-spring/.test(n.id)){
    const offset=n.id.includes('suspension')?.12:.07;
    n.position[2]=(n.position[2]-offset)*.62/.64+offset;
   }
  }
  const belt=m.slots[slot].find(n=>n.type==='extrude');
  for(const p of belt.shape.outline)if(p[1]===-.015)p[1]=.0135;
  const loop=belt.shape.outline,lengths=loop.map((a,i)=>Math.hypot(a[0]-loop[(i+1)%loop.length][0],a[1]-loop[(i+1)%loop.length][1]));
  const perimeter=lengths.reduce((a,b)=>a+b,0);
  const shoes=m.slots[slot].filter(n=>n.id.includes('-tread-'));
  shoes.forEach((n,i)=>{
   let d=i*perimeter/shoes.length,k=0;while(d>lengths[k]){d-=lengths[k];k++;}
   const a=loop[k],b=loop[(k+1)%loop.length],du=(b[0]-a[0])/lengths[k],dy=(b[1]-a[1])/lengths[k];
   n.position[1]=a[1]+dy*d;n.position[2]=-(a[0]+du*d);n.rotation[0]=Math.atan2(dy,du);
  });
 }
 const armor=id=>t.armorModel.plates.find(p=>p.id===id);
 Object.assign(armor('hull-front-plate'),{position:[0,1.205,1.465],halfExtents:[.84,Math.hypot(.47,.07)/2,.04],rotation:[-Math.atan2(.07,.47),0,0]});
 Object.assign(armor('hull-roof'),{position:[0,1.44,.39],halfExtents:[.84,.025,1.04]});
 Object.assign(armor('hull-lower-glacis'),{position:[0,.5,1.985],halfExtents:[.8,Math.hypot(.32,.37)/2,.04],rotation:[Math.atan2(.37,.32),0,0]});
 Object.assign(armor('hull-rear'),{position:[0,.75,-2.16],halfExtents:[.84,.41,.04]});
 for(const side of ['left','right']){
  const x=side==='left'?-.82:.82;
  Object.assign(armor(`hull-side-${side}`),{position:[x,.89,.39],halfExtents:[.04,.55,1.04]});
  // Sample short sections of the actual side silhouette; avoid an invisible
  // full-height box over the engine deck and ahead of the driver plate.
  for(const [region,start,end] of [['nose',1.43,2.17],['engine',-2.22,-.65]])for(let i=0;i<6;i++){
   const span=(end-start)/6,z=start+(i+.5)*span,ys=[];
   for(const id of ['lower-hull','ausf-f-superstructure']){
    const loop=get('hull',id).shape.outline;
    loop.forEach((a,j)=>{const b=loop[(j+1)%loop.length];if(a[0]!==b[0]&&-z>=Math.min(a[0],b[0])&&-z<=Math.max(a[0],b[0]))ys.push(a[1]+(-z-a[0])/(b[0]-a[0])*(b[1]-a[1]));});
   }
   const lo=Math.min(...ys),hi=Math.max(...ys);
   t.armorModel.plates.push({id:`hull-${region}-side-${side}-${i}`,name:`Hull ${region} side ${side} ${i}`,zone:'hull',parent:'hull',armorThickness:15,position:[x,(lo+hi)/2,z],halfExtents:[.04,(hi-lo)/2,span/2],rotation:[0,0,0]});
  }
 }
 for(const id of ['track-left','track-right'])Object.assign(armor(id),{position:[id.endsWith('left')?-.97:.97,.547,.03],halfExtents:[.15,.547,2.305]});
 // Fit each sloped turret facet, including previously uncovered rear corners.
 const ids=['turret-front','turret-cheek-right','turret-side-right','turret-rear-cheek-right','turret-rear','turret-rear-cheek-left','turret-side-left','turret-cheek-left'];
 const {plan,bottomY,topY,topScale}=shell.params;
 for(let i=0;i<plan.length;i++){
  const a=plan[i],b=plan[(i+1)%plan.length];
  const verts=[new THREE.Vector3(a[0],bottomY,a[1]),new THREE.Vector3(b[0],bottomY,b[1]),new THREE.Vector3(b[0]*topScale,topY,b[1]*topScale),new THREE.Vector3(a[0]*topScale,topY,a[1]*topScale)];
  const x=verts[1].clone().sub(verts[0]).normalize(),z=x.clone().cross(verts[3].clone().sub(verts[0])).normalize(),y=z.clone().cross(x).normalize();
  const center=verts.reduce((s,v)=>s.add(v),new THREE.Vector3()).multiplyScalar(.25);
  const half=[Math.max(...verts.map(v=>Math.abs(v.clone().sub(center).dot(x)))),Math.max(...verts.map(v=>Math.abs(v.clone().sub(center).dot(y)))),.025];
  const rotation=new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  let p=armor(ids[i]);if(!p){p={id:ids[i],name:ids[i],zone:'turret',parent:'turret',armorThickness:15};t.armorModel.plates.push(p);}
  Object.assign(p,{position:center.toArray(),halfExtents:half,rotation:[rotation.x,rotation.y,rotation.z]});
 }
 Object.assign(armor('turret-roof'),{position:[0,.52,-.0072],halfExtents:[.5544,.025,.5328]});
}
const round=(v)=>Array.isArray(v)?v.map(round):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,round(x)])):typeof v==='number'?Math.round(v*1e6)/1e6:v;
const clean=round(m);
fs.writeFileSync(path.join(out,'model.json'),'{\n  "schemaVersion": 1,\n  "slots": {\n'+Object.entries(clean.slots).map(([k,v])=>'    '+JSON.stringify(k)+': [\n'+v.map(n=>'      '+JSON.stringify(n)).join(',\n')+'\n    ]').join(',\n')+'\n  }\n}\n');
t.mounts=round(t.mounts);t.armorModel=round(t.armorModel);
fs.writeFileSync(path.join(out,'tank.json'),JSON.stringify(t,null,2).replace(/\[\s*(-?[\d.eE+]+),\s*(-?[\d.eE+]+),\s*(-?[\d.eE+]+)\s*\]/g,'[$1, $2, $3]')+'\n');
