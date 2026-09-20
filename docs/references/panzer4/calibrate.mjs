// Inputs must be original JSON from baf3f68e; never reapply to calibrated files.
// node calibrate.mjs original-model.json original-tank.json output-directory [pass]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
const [mp,tp,out,pass='3']=process.argv.slice(2);
const m=JSON.parse(fs.readFileSync(mp)),t=JSON.parse(fs.readFileSync(tp));
const get=(s,id)=>m.slots[s].find(n=>n.id===id);
const armor=id=>t.armorModel.plates.find(p=>p.id===id);
const skirtArmor=new Map();
function mirror(n){if(n.position)n.position[0]*=-1;if(n.rotation){n.rotation[1]*=-1;n.rotation[2]*=-1;}if(n.step)n.step[0]*=-1;if(n.children)n.children.forEach(mirror);if(n.child)mirror(n.child);}
t.mounts.turretOffset=[0,1.72,-.22];t.mounts.gunPivotOffset=[0,.33,.97];
// Keep the reference gun axis at 2.05 m; move the muzzle to +3.97 m.
const extension=.205;t.mounts.muzzleDistance+=extension;
const barrel=get('gun','tapered-kwk40-barrel');barrel.height+=extension;barrel.position[2]+=extension/2;
for(const n of m.slots.gun){if(n.id.startsWith('muzzle-brake'))n.position[2]+=extension;if(n.id.startsWith('coaxial'))mirror(n);}
// Reflect asymmetric fittings only. Keep centered extrusions and side IDs intact.
for(const n of m.slots.hull)if(/driver-|hull-mg|antenna|fender-jack|jack-foot|shovel|rear-toolbox|exhaust|muffler/.test(n.id))mirror(n);
const upper=get('hull','ausf-h-stepped-superstructure');
for(const p of upper.shape.outline){if(p[1]>=1.2)p[1]+=.16;}
for(const p of get('hull','ausf-h-lower-hull').shape.outline)if(p[1]===.3)p[1]=.4;
for(const n of m.slots.hull){
 if(/driver-|hull-mg|crew-hatch|hatch-periscope|engine-|antenna/.test(n.id)&&n.position)n.position[1]+=.16;
 if(n.id==='radio-antenna'){n.height-=.6;n.position[1]-=.3;}
 if(/fender$|mudflap/.test(n.id))n.position[1]+=.10;
}
const shell=get('turret','ausf-h-faceted-turret');shell.params.topY=.68;
for(const n of m.slots.turret){
 if(n.id==='roof-ventilator'){n.position=[-.31,.697,.15];}
 if(/cupola|commander-hatch/.test(n.id)){
  n.position[0]*=.405/.325;n.position[2]=-.49+(n.position[2]+.49)*(.405/.325);
  if(n.id==='cupola-foot'){n.radiusTop=n.radiusBottom=.44;n.height=.05;n.position[1]=.705;}
  if(n.id==='commander-cupola'){n.radiusTop=n.radiusBottom=.405;n.height=.14;n.position[1]=.8;}
  if(n.id==='cupola-upper-rim'){n.radiusTop=n.radiusBottom=.415;n.height=.04;n.position[1]=.87;}
  if(n.id==='commander-hatch'){n.radiusTop=n.radiusBottom=.365;n.height=.04;n.position[1]=.915;}
  if(n.id==='commander-hatch-handle')n.position[1]=.9375;
  if(n.id.startsWith('cupola-vision'))n.position[1]=.80;
 }
 if(n.id.startsWith('turret-schurzen-panel')){n.position[1]=.335;n.size[1]=.575;}
 if(/skirt-door|schurzen-stay/.test(n.id))n.position[1]-=.12;
 if(/escape/.test(n.id))n.position[1]*=.68/.79;
 if(/stowage-bin/.test(n.id))n.position[1]-=.10;
}
// Six suspended plates per side, read from the side drawing. Local u=-world Z.
const skirtOutlines=[
 [[-2.59,1.21],[-2.16,1.62],[-2.16,.65],[-2.59,1.02]],
 [[-2.15,1.62],[-1.22,1.72],[-1.22,.5],[-2.15,.65]],
 [[-1.21,1.72],[-.30,1.74],[-.30,.5],[-1.21,.5]],
 [[-.29,1.74],[.62,1.74],[.62,.5],[-.29,.5]],
 [[.63,1.74],[1.60,1.68],[1.60,.5],[.63,.5]],
 [[1.61,1.68],[2.53,1.55],[2.53,.72],[1.61,.5]],
];
for(const side of ['left','right']){
 const x=side==='left'?-1.60:1.60;
 for(let i=0;i<6;i++){
  let n=get('hull',`${side}-schurzen-panel-${i}`);
  if(!n){n=structuredClone(get('hull',`${side}-schurzen-panel-4`));n.id=`${side}-schurzen-panel-${i}`;m.slots.hull.push(n);}
  n.shape.outline=skirtOutlines[i];
  const hanger=get('hull',`${side}-skirt-hanger-${i}`);
  if(hanger){hanger.position[2]=-(skirtOutlines[i][0][0]+skirtOutlines[i][1][0])/2;hanger.position[1]=(skirtOutlines[i][0][1]+skirtOutlines[i][1][1])/2-.05;}
 }
 const rail=get('hull',`${side}-schurzen-support-rail`);rail.position[1]=1.69;rail.size[2]=5.08;
 const stays=get('hull',`${side}-skirt-outriggers`);stays.position[1]=1.66;
 const slot=side==='left'?'tracksLeft':'tracksRight';
 for(const n of m.slots[slot]){
  if(n.id.includes('road-wheel')){
   const i=Number(n.id.split('-').at(-1));n.position[2]=1.735-i*.495;n.position[1]=.295;
   for(const c of n.children){if(c.radiusTop){c.radiusTop*=.235/.265;c.radiusBottom*=.235/.265;}}
  }
  if(/bogie|return-roller/.test(n.id)){
   const i=Number(n.id.split('-').at(-1));n.position[2]=1.4875-i*.99;
  }
 }
}
// Later passes refine the residuals after viewing the first overlay.
if(Number(pass)>=2){
 for(const n of m.slots.hull){
  if(/schurzen|skirt/.test(n.id))continue;
  if(n.type==='extrude'){for(const p of n.shape.outline)p[0]*=.91;}
  else if(!/fender$|mudflap/.test(n.id)){
   if(n.position)n.position[2]*=.91;
   if(n.size)n.size[2]*=.91;
   if(n.step)n.step[2]*=.91;
  }
  if(n.id.endsWith('front-mudflap'))n.position[2]-=.19;
  if(n.id.endsWith('fender')){n.size[2]-=.19;n.position[2]-=.095;n.size[0]=.40;n.position[0]=Math.sign(n.position[0])*1.24;}
  if(n.id.includes('mudflap')){n.size[0]=.40;n.position[0]=Math.sign(n.position[0])*1.24;}
  if(n.id.startsWith('driver-')){n.position[2]-=.23;n.position[1]-=.11;}
  if(n.id.startsWith('hull-mg')){n.position[2]-=.23;n.position[1]-=.07;}
 }
 upper.shape.outline[1]=[-1.76,1.27];upper.shape.outline[2]=[-1.70,1.72];
 get('turret','roof-ventilator').position[2]=.30;
 for(const n of m.slots.turret){
  if(/cupola|commander-hatch/.test(n.id))n.position[2]+=.05;
  if(n.id.startsWith('turret-schurzen-panel')){
   // Transform both segment endpoints, then reconstruct its rotated box.
   const half=(n.size[2]-.008)/2,angle=n.rotation[1];
   const a=[(n.position[0]-Math.sin(angle)*half)*.94,n.position[2]-Math.cos(angle)*half];
   const b=[(n.position[0]+Math.sin(angle)*half)*.94,n.position[2]+Math.cos(angle)*half];
   n.position[0]=(a[0]+b[0])/2;n.position[2]=(a[1]+b[1])/2;
   n.size[2]=Math.hypot(b[0]-a[0],b[1]-a[1])+.008;n.rotation[1]=Math.atan2(b[0]-a[0],b[1]-a[1]);
  }
  if(/skirt-door|schurzen-stay/.test(n.id))n.position[0]*=.94;
 }
 for(const side of ['left','right']){
  const slot=side==='left'?'tracksLeft':'tracksRight',belt=get(slot,`${side}-continuous-track-belt`);
  belt.shape.outline[5]=[-1.78,.014];belt.shape.outline[6]=[1.78,.014];
  belt.shape.holes[0][5]=[-1.77,.06];belt.shape.holes[0][6]=[1.77,.06];
  // Adjust rear wheel center without distorting its spokes or circular rims.
  for(const n of m.slots[slot])if(n.id.includes('-idler-')){n.position[2]-=.045;n.position[1]-=.055;}
  const shoes=get(slot,`${side}-batched-tread-shoes`),loop=belt.shape.outline;
  const lengths=loop.map((a,i)=>Math.hypot(a[0]-loop[(i+1)%loop.length][0],a[1]-loop[(i+1)%loop.length][1]));
  const perimeter=lengths.reduce((a,b)=>a+b,0),count=92;
  const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  shoes.vertices=[];shoes.faces=[];
  for(let i=0;i<count;i++){
   let d=(i+.5)*perimeter/count,k=0;while(d>lengths[k]){d-=lengths[k];k++;}
   const a=loop[k],b=loop[(k+1)%loop.length],du=(b[0]-a[0])/lengths[k],dy=(b[1]-a[1])/lengths[k];
   const u=a[0]+du*d,y=a[1]+dy*d,x=side==='left'?-1.18:1.18,base=shoes.vertices.length;
   for(const dx of [-.207,.207])for(const [along,normal]of[[-.032,-.014],[.032,-.014],[.032,.014],[-.032,.014]])shoes.vertices.push([x+dx,y+along*dy+normal*du,-(u+along*du-normal*dy)]);
   shoes.faces.push(...faces.map(f=>f.map(j=>base+j)));
  }
 }
}
if(Number(pass)>=3){
 for(const n of m.slots.hull){if(n.id.startsWith('driver-'))n.position[0]=.35;if(n.id.startsWith('hull-mg'))n.position[0]=-.61;}
 for(const n of m.slots.gun)if(n.id.startsWith('coaxial'))n.position[0]=-.34;
 for(const n of m.slots.turret)if(/cupola|commander-hatch/.test(n.id))n.position[2]-=.05;
 for(const i of [0,8]){
  const n=get('turret',`turret-schurzen-panel-${i}`),angle=n.rotation[1],half=n.size[2]/2,h=n.size[1]/2,thick=n.size[0];
  const sign=Math.sign(Math.cos(angle)),delta=.10/Math.abs(Math.cos(angle)),front=sign*half,back=-front;
  skirtArmor.set(i,{position:[n.position[0]+Math.sin(angle)*sign*delta/2,n.position[1],n.position[2]+Math.cos(angle)*sign*delta/2],halfExtents:[thick/2,h,half+delta/2],rotation:[0,angle,0]});
  const position=[n.position[0]+Math.cos(angle)*thick/2,n.position[1],n.position[2]-Math.sin(angle)*thick/2];
  const id=n.id;Object.keys(n).forEach(k=>delete n[k]);
  Object.assign(n,{id,type:'extrude',shape:{outline:[[back,-h],[front+sign*delta,-h],[front-sign*delta,h],[back,h]]},depth:thick,position,rotation:[0,angle-Math.PI/2,0],materialRole:'hullPrimary'});
 }
 get('hull','rear-tow-coupling').position=[0,.64,-2.54];
 get('hull','auxiliary-muffler').position[2]+=.08;
 for(const side of ['left','right']){
  const x=side==='left'?-1.57:1.57;
  const rail=get('hull',`${side}-schurzen-support-rail`);
  const children=skirtOutlines.map((pts,i)=>{
   const a=pts[0],b=pts[1],dz=-(b[0]-a[0]),dy=b[1]-a[1];
   return {id:`${side}-skirt-rail-${i}`,type:'box',size:[.04,.035,Math.hypot(dz,dy)],position:[x,(a[1]+b[1])/2-.025,-(a[0]+b[0])/2],rotation:[Math.atan2(-dy,dz),0,0],materialRole:'darkMetal'};
  });
  Object.keys(rail).forEach(k=>delete rail[k]);Object.assign(rail,{id:`${side}-schurzen-support-rail`,type:'group',children});
  const last=structuredClone(get('hull',`${side}-skirt-hanger-4`));last.id=`${side}-skirt-hanger-5`;last.position[2]=-2.07;last.position[1]=1.565;m.slots.hull.push(last);
  const front=get('hull',`${side}-front-mudflap`);front.position[1]=1.095;front.position[2]=2.72;front.rotation[0]=1.05;
  const rear=get('hull',`${side}-rear-mudflap`);rear.position[1]=1.095;rear.position[2]=-2.80;rear.size[2]=.64;rear.rotation[0]=-.59;
 }
}
// Sync original plate locations; exact facet and skirt fitting follows below.
for(const p of t.armorModel.plates){
 if(p.parent==='hull'&&!p.isTrack&&!p.id.startsWith('side-skirt')){
  if(/front-plate|roof|engine-deck/.test(p.id))p.position[1]+=.16;
 }
}
// Exact OBB planes for all eight turret facets.
const ids=['turret-front','turret-cheek-right','turret-side-right','turret-rear-cheek-right','turret-bustle','turret-rear-cheek-left','turret-side-left','turret-cheek-left'];
const {plan,bottomY,topY,topScale}=shell.params;
for(let i=0;i<plan.length;i++){
 const a=plan[i],b=plan[(i+1)%plan.length];
 const vs=[new THREE.Vector3(a[0],bottomY,a[1]),new THREE.Vector3(b[0],bottomY,b[1]),new THREE.Vector3(b[0]*topScale,topY,b[1]*topScale),new THREE.Vector3(a[0]*topScale,topY,a[1]*topScale)];
 const x=vs[1].clone().sub(vs[0]).normalize(),z=x.clone().cross(vs[3].clone().sub(vs[0])).normalize(),y=z.clone().cross(x).normalize();
 const c=vs.reduce((s,v)=>s.add(v),new THREE.Vector3()).multiplyScalar(.25);
 const half=[Math.max(...vs.map(v=>Math.abs(v.clone().sub(c).dot(x)))),Math.max(...vs.map(v=>Math.abs(v.clone().sub(c).dot(y)))),.025];
 const e=new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
 let p=armor(ids[i]);if(!p){p={id:ids[i],name:ids[i],zone:'turret',parent:'turret',armorThickness:30};t.armorModel.plates.push(p);}
 Object.assign(p,{position:c.toArray(),halfExtents:half,rotation:[e.x,e.y,e.z]});
}
Object.assign(armor('turret-roof'),{position:[0,.68,-.0166],halfExtents:[.7968,.025,.8466]});
for(let i=0;i<9;i++){
 const n=get('turret',`turret-schurzen-panel-${i}`),id=i===1?'turret-skirt-left':i===7?'turret-skirt-right':n.id;
 Object.assign(armor(id),skirtArmor.get(i)??{position:[...n.position],halfExtents:n.size.map(v=>v/2),rotation:[...n.rotation]});
}
for(const side of ['left','right'])for(let i=0;i<6;i++){
 const n=get('hull',`${side}-schurzen-panel-${i}`),pts=n.shape.outline;
 const minU=Math.min(...pts.map(p=>p[0])),maxU=Math.max(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1]));
 const id=i===0?`side-skirt-${side}`:`side-skirt-${side}-${i}`;
 let p=armor(id);if(!p){p={id,name:id,zone:'hull',parent:'hull',armorThickness:5};t.armorModel.plates.push(p);}
 Object.assign(p,{position:[side==='left'?-1.6:1.6,(minY+maxY)/2,-(minU+maxU)/2],halfExtents:[.009,(maxY-minY)/2,(maxU-minU)/2],rotation:[0,0,0]});
}
if(Number(pass)>=2){
 const lower=get('hull','ausf-h-lower-hull').shape.outline;
 const fit=(id,a,b,width)=>Object.assign(armor(id),{position:[0,(a[1]+b[1])/2,-(a[0]+b[0])/2],halfExtents:[width/2,Math.hypot(a[0]-b[0],a[1]-b[1])/2,.035],rotation:[Math.atan2(a[0]-b[0],b[1]-a[1]),0,0]});
 fit('hull-front-plate',upper.shape.outline[1],upper.shape.outline[2],2.4);
 fit('hull-upper-glacis',lower[0],lower[5],1.94);
 fit('hull-lower-glacis',lower[1],lower[0],1.94);
 Object.assign(armor('hull-roof'),{position:[0,1.72,.395],halfExtents:[1.2,.025,1.305]});
 Object.assign(armor('hull-engine-deck'),{position:[0,1.59,-1.8291],halfExtents:[1.2,.025,.7098]});
 Object.assign(armor('hull-rear'),{position:[0,1,-2.55],halfExtents:[1.2,.59,.04]});
 for(const side of ['left','right']){
  Object.assign(armor(`hull-side-${side}`),{position:[side==='left'?-1.18:1.18,1.40,.395],halfExtents:[.04,.32,1.305]});
  t.armorModel.plates.push({id:`hull-engine-side-${side}`,name:`Engine side ${side}`,zone:'hull',parent:'hull',armorThickness:30,position:[side==='left'?-1.18:1.18,1.335,-1.83],halfExtents:[.04,.255,.71],rotation:[0,0,0]});
  // Narrow lower tub and broad upper body have distinct side planes.
  for(const [part,loop,x,count]of [['lower',lower,.97,16],['upper-nose',upper.shape.outline,1.2,4]]){
   const start=part==='lower'?-2.6208:1.70,end=part==='lower'?2.639:2.3387,span=(end-start)/count;
   for(let i=0;i<count;i++){
    const z=start+(i+.5)*span,ys=[];
    loop.forEach((a,j)=>{const b=loop[(j+1)%loop.length];if(a[0]!==b[0]&&-z>=Math.min(a[0],b[0])&&-z<=Math.max(a[0],b[0]))ys.push(a[1]+(-z-a[0])/(b[0]-a[0])*(b[1]-a[1]));});
    const lo=Math.min(...ys),hi=Math.max(...ys);
    t.armorModel.plates.push({id:`hull-${part}-${side}-${i}`,name:`Hull ${part} ${side} ${i}`,zone:'hull',parent:'hull',armorThickness:30,position:[side==='left'?-x:x,(lo+hi)/2,z],halfExtents:[.025,(hi-lo)/2,span/2],rotation:[0,0,0]});
   }
  }
  Object.assign(armor(`track-${side}`),{position:[side==='left'?-1.18:1.18,.582,0],halfExtents:[.21,.582,2.804]});
 }
}
const round=v=>Array.isArray(v)?v.map(round):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,round(x)])):typeof v==='number'?Math.round(v*1e6)/1e6:v;
const clean=round(m);
fs.writeFileSync(path.join(out,'model.json'),'{\n  "schemaVersion": 1,\n  "slots": {\n'+Object.entries(clean.slots).map(([k,v])=>'    '+JSON.stringify(k)+': [\n'+v.map(n=>'      '+JSON.stringify(n)).join(',\n')+'\n    ]').join(',\n')+'\n  }\n}\n');
t.mounts=round(t.mounts);t.armorModel=round(t.armorModel);
fs.writeFileSync(path.join(out,'tank.json'),JSON.stringify(t,null,2).replace(/\[\s*(-?[\d.eE+]+),\s*(-?[\d.eE+]+),\s*(-?[\d.eE+]+)\s*\]/g,'[$1, $2, $3]')+'\n');
