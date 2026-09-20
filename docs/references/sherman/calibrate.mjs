// Reproducible migration. Inputs MUST be the original, uncalibrated JSON files.
// node calibrate.mjs <original-model.json> <original-tank.json> <output-directory>
import fs from 'node:fs';
import path from 'node:path';
const [mp,tp,out]=process.argv.slice(2);
if(!mp||!tp||!out)throw Error('Provide original model, original tank and output directory');
const m=JSON.parse(fs.readFileSync(mp)),t=JSON.parse(fs.readFileSync(tp));
const get=(s,id)=>m.slots[s].find(n=>n.id===id);
const mirror=n=>{if(n.position)n.position[0]*=-1;if(n.rotation){n.rotation[1]*=-1;n.rotation[2]*=-1;}if(n.children)n.children.forEach(mirror);};
// Keep the 75 mm muzzle at the hull nose while moving the turret back to its ring datum.
t.mounts.turretOffset=[0,1.9,0];t.mounts.gunPivotOffset=[0,.395,.90];t.mounts.muzzleDistance=2.05;
const barrel=get('gun','75mm-m3-short-exposed-barrel');barrel.height+=.495;barrel.position[2]+=.2475;
get('gun','plain-75mm-muzzle').position[2]+=.495;
for(const n of m.slots.gun)if(n.id.includes('port'))mirror(n);
for(const n of m.slots.hull){
  if(n.id.startsWith('bow-mg'))mirror(n);
  if(n.id.includes('cast-driver-hood'))n.scale=[.305,.155,.40];
  if(n.id.includes('hood-front')){n.position[2]-=.11;n.position[1]-=.03;n.size[1]=.17;}
  if(/small-crew-hatch|hatch-periscope|periscope-glass|hatch-hinge/.test(n.id)){n.position[2]+=.11;n.position[1]-=.025;}
}
// Second pass: upper side plates reach the fender datum seen in plan/front.
get('hull','m4-welded-upper-hull').depth=2.68;
get('hull','m4-welded-upper-hull').position[0]=-1.34;
const shell=get('turret','d50878-low-bustle-casting');
for(const v of shell.vertices){
  const rear=v[2]<0;
  if(rear)v[2]*=1.1/1.3;
  if(v[1]>=.58)v[1]+=.06;
  else if(rear)v[1]+=.075*Math.min(1,-v[2]/.5);
}
for(const n of m.slots.turret){
  if(/commander|m2-aa-machine-gun/.test(n.id)){mirror(n);n.position[1]+=.06;}
  if(n.id==='antenna-base'||n.id==='antenna-whip'){n.position[0]=.375;n.position[2]=-.92;n.position[1]+=.06;}
  if(n.id==='gunner-periscope'){n.position[0]=-.375;n.position[1]+=.06;}
  if(n.id==='turret-roof-ventilator')n.position[1]+=.06;
  if(n.id==='left-pistol-port'){mirror(n);n.position[2]=-.43;}
}
for(const n of m.slots.turret){
  if(n.id.startsWith('commander')){
    // Resize the hatch assembly about its center, keeping the roof height.
    n.position[0]=-.44+(n.position[0]+.4)*(.425/.335);
    n.position[2]=-.33+(n.position[2]+.48)*(.425/.335);
    if(n.radiusTop){n.radiusTop+=.09;n.radiusBottom+=.09;}
    if(n.id==='commander-hatch-split')n.size[2]=.77;
  }
  if(n.id==='m2-aa-machine-gun'){n.position[0]=-.44;n.position[2]=-.76;}
  if(n.id==='gunner-periscope')n.position[0]=-.53;
  if(n.id.startsWith('antenna-'))n.position[2]=-.97;
  if(n.id==='turret-roof-ventilator'){n.position[2]=.24;n.radiusTop=.175;n.radiusBottom=.175;}
}
// The drawing shows a shallow external stowage rack behind the low bustle,
// not a tall rectangular extension of the turret casting.
m.slots.turret=m.slots.turret.filter(n=>!['rear-bustle-access-panel','rear-bustle-latch'].includes(n.id));
const rack={id:'rear-bustle-stowage-rack',type:'group',position:[0,0,0],children:[]};
const bar=(id,size,position)=>rack.children.push({id,type:'box',size,position,materialRole:'steel'});
for(const side of [-1,1]){
  bar(`rack-side-${side}`,[.035,.035,.55],[side*.54,.105,-1.325]);
  bar(`rack-lower-side-${side}`,[.035,.035,.55],[side*.54,.015,-1.325]);
  bar(`rack-post-${side}`,[.035,.125,.035],[side*.54,.06,-1.58]);
}
bar('rack-rear-upper',[1.115,.035,.035],[0,.105,-1.58]);
bar('rack-rear-lower',[1.115,.035,.035],[0,.015,-1.58]);
m.slots.turret.push(rack);
// Third pass: the side overlay exposed an over-deep upper hull and a low ring.
// Raise the deck/ring while retaining the already-aligned gun axis and turret roof.
get('hull','m4-welded-upper-hull').shape.outline=[[-2.40,1.28],[-1.44,1.98],[-.20,1.98],[2.80,1.56],[2.87,1.28]];
for(const v of get('hull','lower-hull-tub').shape.outline)if(v[1]===1.1)v[1]=1.30;
get('hull','rounded-differential-housing').shape.outline=[[-2.44,.45],[-2.76,.56],[-2.92,.88],[-2.95,1.16],[-2.87,1.25],[-2.68,1.28],[-2.38,1.28]];
for(const n of m.slots.hull){
  if(n.id.startsWith('transmission-')){n.position[1]+=.18;n.position[2]-=.16;}
  if(n.id.includes('final-drive-bulge')){n.position[1]=.92;n.scale[1]=.36;}
  if(n.id==='radial-engine-rear-deck'){n.position[1]=1.715;n.rotation[0]=-Math.atan(.14);}
  if(n.id==='rear-deck-inlet'){n.position[1]=1.795;n.rotation[0]=-Math.atan(.14);}
  if(n.id==='inlet-grille-bars')n.position[1]=1.825;
  if(n.id.includes('deck-access-hinge'))n.position[1]=1.71;
  if(n.id.includes('fender-edge'))n.position[1]+=.07;
  if(n.id.includes('front-fender'))n.position[1]+=.07;
  if(n.id.includes('rear-mudflap'))n.position[1]+=.10;
}
t.mounts.turretOffset[1]=2.0;t.mounts.gunPivotOffset[1]=.295;
for(const v of shell.vertices)v[1]=Math.max(.04,v[1]-.10);
for(const n of m.slots.turret){
  if(n.id==='turret-race'||n.id===shell.id)continue;
  if(n.position)n.position[1]-=.10;
}
// 508 mm wheels stay circular; axle pitch and suspension arms are corrected independently.
for(const side of ['left','right']){
  const slot=side==='left'?'tracksLeft':'tracksRight';
  for(const n of m.slots[slot]){
    if(n.id.includes('vvss-bogie')){
      const i=Number(n.id.split('-').at(-1));n.position[2]=1.70-i*1.50;
      for(const c of n.children){
        if(/tire|wheel-disc|wheel-hub/.test(c.id)){c.position[2]*=.415/.32;c.position[1]+=.035;}
        if(c.id.includes('rocker')){c.position[2]*=.415/.32;c.position[1]+=.035;c.size[2]*=.415/.32;}
        if(c.id.includes('cast-housing')){c.position[1]=.745;c.size[1]=.37;}
        if(c.id.includes('spring-seat'))c.position[1]=.94;
        if(c.id.includes('volute'))c.position[1]=.59+(c.position[1]-.57)*1.2;
        if(c.id.includes('skid'))c.position[1]+=.035;
        if(c.id.includes('return-roller'))c.position[1]-=.07;
        if(c.id.includes('return-arm'))c.position[1]-=.035;
      }
    }
    if(n.id.includes('drive-sprocket')){n.position[2]+=.27;n.position[1]-=.04;}
  }
  const belt=get(slot,`${side}-continuous-track`);
  belt.shape.outline=[[-2.63,1.16],[-2.87,1.09],[-3.045,.88],[-3.055,.66],[-2.91,.43],[-2.17,-.005],[1.9,-.005],[2.65,.36],[2.85,.62],[2.87,.88],[2.7,1.11],[2.45,1.15]];
  belt.shape.holes=[[[-2.63,1.095],[-2.835,1.032],[-2.985,.857],[-2.990,.672],[-2.865,.48],[-2.155,.098],[1.885,.098],[2.607,.411],[2.787,.644],[2.806,.859],[2.657,1.057],[2.446,1.085]]];
  const shoes=get(slot,`${side}-batched-track-shoes`),loop=belt.shape.outline;
  const lengths=loop.map((p,i)=>Math.hypot(p[0]-loop[(i+1)%loop.length][0],p[1]-loop[(i+1)%loop.length][1]));
  const perimeter=lengths.reduce((a,b)=>a+b,0),count=79;
  shoes.vertices=[];shoes.faces=[];
  const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  for(let i=0;i<count;i++){
    let distance=(i+.5)*perimeter/count,k=0;
    while(distance>lengths[k]){distance-=lengths[k];k++;}
    const a=loop[k],b=loop[(k+1)%loop.length],du=(b[0]-a[0])/lengths[k],dy=(b[1]-a[1])/lengths[k];
    const u=a[0]+du*distance,y=a[1]+dy*distance,half=.042,thick=.014;
    const x=side==='left'?-1.1:1.1,base=shoes.vertices.length;
    for(const dx of [-.2105,.2105])for(const [along,normal] of [[-half,-thick],[half,-thick],[half,thick],[-half,thick]])
      shoes.vertices.push([x+dx,y+along*dy+normal*du,-(u+along*du-normal*dy)]);
    shoes.faces.push(...faces.map(f=>f.map(j=>base+j)));
  }
}
for(const p of t.armorModel.plates){
  if(p.parent==='hull'&&!p.isTrack){
    if(p.id.startsWith('hull-side'))p.position[0]=Math.sign(p.position[0])*1.34;
    if(p.halfExtents[0]===1.26)p.halfExtents[0]=1.34;
  }
  if(p.parent==='turret'){
    if(p.id==='turret-front')p.position[2]-=.10;
    if(p.id==='turret-bustle'){p.position[2]=-1.02;p.position[1]=.46;p.halfExtents[1]=.29;}
    if(p.id==='turret-roof'){p.position[1]+=.06;p.halfExtents[2]=.72;p.position[2]=-.14;}
    if(p.id.startsWith('turret-side')){p.position[2]=-.13;p.halfExtents[2]=.57;}
    if(p.id==='turret-roof')p.position[1]-=.10;
    else {p.position[1]-=.08;p.halfExtents[1]-=.02;}
    if(p.id==='turret-bustle'){p.position[1]=.395;p.halfExtents[1]=.355;}
  }
  if(p.isTrack){p.position=[p.position[0],.615,.0925];p.halfExtents[2]=2.9625;}
}
const armor=id=>t.armorModel.plates.find(p=>p.id===id);
const angle=Math.atan2(.7,.96),quarter=Math.hypot(.7,.96)/4;
for(const [id,f] of [['hull-upper-glacis-top',.25],['hull-upper-glacis-bottom',.75]])Object.assign(armor(id),{position:[0,1.98-.7*f,1.44+.96*f],halfExtents:[1.34,.035,quarter],rotation:[angle,0,0]});
Object.assign(armor('hull-lower-glacis'),{position:[0,.865,2.79],halfExtents:[.91,.415,.16]});
Object.assign(armor('hull-roof'),{position:[0,1.98,.82],halfExtents:[1.34,.025,.62]});
Object.assign(armor('hull-engine-deck'),{position:[0,1.77,-1.3],halfExtents:[1.34,.025,Math.hypot(3,.42)/2],rotation:[-Math.atan(.14),0,0]});
for(const side of ['left','right']){
  Object.assign(armor(`hull-side-${side}`),{position:[side==='left'?-1.34:1.34,1.63,.82],halfExtents:[.035,.35,.62]});
  Object.assign(armor(`hull-side-front-${side}`),{position:[side==='left'?-1.34:1.34,1.50,1.92],halfExtents:[.035,.13,.565],rotation:[angle,0,0]});
  // Short side OBBs follow the sloping engine deck within 35 mm, avoiding a
  // full-height invisible rectangular plate above the rear hull.
  for(let i=0;i<6;i++){
    const z=-.05-i*.5,top=1.98-(.2-z)*.14;
    t.armorModel.plates.push({id:`hull-engine-side-${side}-${i}`,name:`Engine Side ${side} ${i}`,zone:'hull',halfExtents:[.035,(top-1.28)/2,.25],position:[side==='left'?-1.34:1.34,(top+1.28)/2,z],rotation:[0,0,0],armorThickness:armor(`hull-side-${side}`).armorThickness,parent:'hull'});
  }
}
const round=(_k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v;
const lines=['{','  "schemaVersion": 1,','  "slots": {'];
Object.entries(m.slots).forEach(([s,ns],i)=>{lines.push(`    "${s}": [`);ns.forEach((n,j)=>lines.push('      '+JSON.stringify(n,round)+(j<ns.length-1?',':'')));lines.push('    ]'+(i<4?',':''));});lines.push('  }','}');
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'model.json'),lines.join('\n')+'\n');
t.mounts=JSON.parse(JSON.stringify(t.mounts,round));t.armorModel=JSON.parse(JSON.stringify(t.armorModel,round));
fs.writeFileSync(path.join(out,'tank.json'),JSON.stringify(t,null,2)+'\n');
