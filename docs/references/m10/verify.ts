// Verifies the M10 model against landmarks read independently from the OnWar
// drawing, plus geometry, armour-coverage and gameplay-value checks.
//   node docs/references/m10/capture.mjs after && npx tsx docs/references/m10/verify.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec, TankSpec} from '../../../src/tanks/core/types';
import modelJson from '../../../src/tanks/m10/model.json';
import tankJson from '../../../src/tanks/m10/tank.json';

const model = modelJson as unknown as TankModelSpec;
const tank = tankJson as unknown as TankSpec;
const issues = validateTankDraft(tank, model, 'm10');
assert.equal(issues.filter(i => i.severity === 'error').length, 0, JSON.stringify(issues));

type Bounds = Record<string, {min: number[]; max: number[]}>;
interface Capture {bounds: Bounds; vertices: Record<string, number[][]>}
const read = (name: string): Capture => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const before = read('before-bounds.json'), after = read('after-bounds.json');

const c = (b: Capture, id: string, axis: number) => { const n = b.bounds[id]; assert.ok(n, `missing ${id}`); return (n.min[axis] + n.max[axis]) / 2; };
const mx = (b: Capture, id: string, axis: number) => b.bounds[id].max[axis];
const mn = (b: Capture, id: string, axis: number) => b.bounds[id].min[axis];
const span = (b: Capture, id: string, axis: number) => mx(b, id, axis) - mn(b, id, axis);
const verts = (b: Capture, id: string) => b.vertices[id];
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps;
// Vertex queries for sloped surfaces that an AABB cannot describe.
const hull = (b: Capture) => verts(b, 'm10-welded-upper-hull');
const roofY = (b: Capture) => Math.max(...hull(b).map(p => p[1]));
const roof = (b: Capture) => hull(b).filter(p => near(p[1], roofY(b)));
const widestX = (b: Capture) => Math.max(...hull(b).map(p => Math.abs(p[0])));
const widestY = (b: Capture) => Math.max(...hull(b).filter(p => near(Math.abs(p[0]), widestX(b))).map(p => p[1]));
const lipY = (b: Capture) => Math.min(...hull(b).filter(p => Math.abs(p[0]) > widestX(b) - 0.2).map(p => p[1]));
const shell = (b: Capture) => verts(b, 'm10-open-turret-shell');
const shellTopY = (b: Capture) => Math.max(...shell(b).map(p => p[1]));
const shellTop = (b: Capture) => shell(b).filter(p => near(p[1], shellTopY(b)));
const beak = (b: Capture) => shell(b).reduce((a, p) => (p[2] < a[2] ? p : a));

// Drawing pixels (1200 x 1800 OnWar scan). Side: px = 686 - Z*164, py = 629 - Y*164.
// Plan: px = 671 - Z*160, py = 960 + X*160. Front: px = 353 + X*164, py = 1760 - Y*164.
// Rear: px = 914 - X*164, py = 1760 - Y*164.
const sx = (z: number) => 686 - z * 164, sy = (y: number) => 629 - y * 164;
const tx = (z: number) => 671 - z * 160, fy = (y: number) => 1760 - y * 164;
type Landmark = [name: string, reference: number, measure: (b: Capture) => number];
const landmarks: Landmark[] = [
  ['Side: front fender tip', 191, b => sx(mx(b, 'left-front-fender-lip', 2))],
  ['Side: sponson front', 300, b => sx(Math.max(...hull(b).map(p => p[2])))],
  ['Side: glacis/roof junction', 414.7, b => sx(Math.max(...roof(b).map(p => p[2])))],
  ['Side: hull roof', 335, b => sy(roofY(b))],
  ['Side: sloped side lower edge', 417.5, b => sy(widestY(b))],
  ['Side: sponson lower edge', 448.5, b => sy(lipY(b))],
  ['Side: roof rear corner', 1123, b => sx(Math.min(...roof(b).map(p => p[2])))],
  ['Side: hull rear', 1168, b => sx(Math.min(...hull(b).map(p => p[2])))],
  ['Side: turret top front corner', 534, b => sx(Math.max(...shellTop(b).map(p => p[2])))],
  ['Side: turret top', 207.5, b => sy(shellTopY(b))],
  ['Side: turret lower edge', 320.5, b => sy(mn(b, 'm10-open-turret-shell', 1))],
  ['Side: counterweight top rear corner', 846, b => sx(Math.min(...shellTop(b).map(p => p[2])))],
  ['Side: counterweight beak', 897, b => sx(beak(b)[2])],
  ['Side: beak height', 267, b => sy(beak(b)[1])],
  ['Side: gun shield face', 420, b => sx(mx(b, 'm5-mount-gun-shield', 2))],
  ['Side: gun axis', 269.5, b => sy(c(b, '3in-m7-barrel', 1))],
  ['Side: muzzle', 48, b => sx(mx(b, '3in-m7-muzzle', 2))],
  ['Side: sprocket centre X', 265.5, b => sx(c(b, 'left-drive-sprocket-hub', 2))],
  ['Side: sprocket centre Y', 494, b => sy(c(b, 'left-drive-sprocket-hub', 1))],
  ['Side: idler centre X', 1078, b => sx(c(b, 'left-rear-idler-hub', 2))],
  ['Side: idler centre Y', 506, b => sy(c(b, 'left-rear-idler-hub', 1))],
  ['Side: front bogie', 413.75, b => sx(c(b, 'left-bogie-0-cast-housing', 2))],
  ['Side: middle bogie', 653.75, b => sx(c(b, 'left-bogie-1-cast-housing', 2))],
  ['Side: rear bogie', 893, b => sx(c(b, 'left-bogie-2-cast-housing', 2))],
  ['Side: foremost road wheel', 344, b => sx(c(b, 'left-bogie-0-wheel-hub-front', 2))],
  ['Side: rearmost road wheel', 963.5, b => sx(c(b, 'left-bogie-2-wheel-hub-rear', 2))],
  ['Side: road wheel centre height', 565, b => sy(c(b, 'left-bogie-1-wheel-hub-front', 1))],
  ['Side: track front', 202, b => sx(mx(b, 'left-continuous-track', 2))],
  ['Side: track rear', 1140, b => sx(mn(b, 'left-continuous-track', 2))],
  ['Plan: hull outer width', 492, b => span(b, 'm10-welded-upper-hull', 0) * 160],
  ['Plan: roof width', 361, b => 2 * Math.max(...roof(b).map(p => Math.abs(p[0]))) * 160],
  ['Plan: turret maximum width', 368, b => span(b, 'm10-open-turret-shell', 0) * 160],
  ['Plan: turret ring centre', 639.6, () => tx(tank.mounts.turretOffset[2])],
  ['Plan: counterweight apex', 877.4, b => tx(beak(b)[2])],
  ['Plan: gun shield face', 400, b => tx(mx(b, 'm5-mount-gun-shield', 2))],
  ['Plan: gun shield width', 190, b => span(b, 'm5-mount-gun-shield', 0) * 160],
  ['Plan: fender front', 185, b => tx(mx(b, 'left-front-fender-lip', 2))],
  ['Plan: roof front edge', 402, b => tx(Math.max(...roof(b).map(p => p[2])))],
  ['Plan: roof rear edge', 1091, b => tx(Math.min(...roof(b).map(p => p[2])))],
  ['Plan: hull rear', 1141, b => tx(Math.min(...hull(b).map(p => p[2])))],
  ['Plan: muzzle', 50, b => tx(mx(b, '3in-m7-muzzle', 2))],
  ['Front: hull maximum width', 496, b => span(b, 'm10-welded-upper-hull', 0) * 164],
  ['Front: track outside span', 413, b => (mx(b, 'right-continuous-track', 0) - mn(b, 'left-continuous-track', 0)) * 164],
  ['Front: turret lower width', 381, b => span(b, 'm10-open-turret-shell', 0) * 164],
  ['Front: turret top width', 298, b => 2 * Math.max(...shellTop(b).map(p => Math.abs(p[0]))) * 164],
  ['Front: gun shield width', 189, b => span(b, 'm5-mount-gun-shield', 0) * 164],
  ['Front: differential housing width', 258, b => span(b, 'm4a2-sharp-nose-differential-housing', 0) * 164],
  ['Front: gun axis', 1404, b => fy(c(b, '3in-m7-barrel', 1))],
  ['Front: roof front edge', 1467, b => fy(roofY(b))],
  ['Front: sloped side lower edge', 1547, b => fy(widestY(b))],
  ['Rear: track outside span', 411, b => (mx(b, 'right-continuous-track', 0) - mn(b, 'left-continuous-track', 0)) * 164],
  ['Rear: turret top width', 300, b => 2 * Math.max(...shellTop(b).map(p => Math.abs(p[0]))) * 164],
  ['Rear: turret lower width', 388, b => span(b, 'm10-open-turret-shell', 0) * 164],
];
// Documented cross-view conflict: front/rear place the turret top 0.10 m below
// the side view while the hull roof and gun axis agree. Reported, not accepted.
const informational: Landmark[] = [
  ['Front: turret top (conflicts with side view)', 1357, b => fy(shellTopY(b))],
  ['Rear: turret top (conflicts with side view)', 1364, b => fy(shellTopY(b))],
];
const TOLERANCE = 12;
const failures = landmarks.filter(([, ref, f]) => Math.abs(f(after) - ref) > TOLERANCE);
const errorsOf = (b: Capture) => landmarks.map(([, ref, f]) => Math.abs(f(b) - ref));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const row = ([n, r, f]: Landmark) => `| ${n} | ${r} | ${f(before).toFixed(2)} | ${f(after).toFixed(2)} | ${Math.abs(f(after) - r).toFixed(2)} |`;
if (process.argv.includes('--landmarks')) {
  // Iteration aid: signed residuals only, no report file and no other checks.
  for (const [n, r, f] of [...landmarks, ...informational]) console.log(`${(f(after) - r).toFixed(2).padStart(8)}  ${n}`);
  console.log(`mean ${mean(errorsOf(before)).toFixed(2)} -> ${mean(errorsOf(after)).toFixed(2)}, max ${Math.max(...errorsOf(after)).toFixed(2)}, failing ${failures.length}`);
  process.exit(0);
}

// Geometry checks.
const tire = after.bounds['left-bogie-0-tire-front'];
const tireD = (tire.max[1] - tire.min[1]);
assert.ok(near(tireD, 0.508, 1e-4), `508 mm road wheels (${tireD})`);
assert.ok(near(tire.max[2] - tire.min[2], tireD, 1e-4), 'Road wheels must stay circular');
const track = model.slots.tracksLeft.find(n => n.id === 'left-continuous-track');
assert.ok(track?.type === 'extrude' && track.shape.holes?.length === 1, 'Track belt needs an inner loop');
const innerBottom = Math.min(...track.shape.holes![0].map(p => p[1]));
assert.ok(near(tire.min[1], innerBottom, 1e-4), `Wheels rest on the inner track run (${tire.min[1]} vs ${innerBottom})`);
const muzzleZ = tank.mounts.turretOffset[2] + tank.mounts.gunPivotOffset[2] + tank.mounts.muzzleDistance;
assert.ok(near(after.bounds['3in-m7-muzzle'].max[2], muzzleZ, 1e-4), 'Projectile spawn must match the muzzle exit');
assert.ok(after.bounds['m4a2-lower-hull-tub'].max[1] >= lipY(after) - 1e-6, 'Lower hull must meet the sponson floor');
assert.ok(mn(after, 'turret-race', 1) <= roofY(after) + 0.01, 'Turret race must sit on the hull roof');
assert.ok(mn(after, 'm10-open-turret-shell', 1) > roofY(after) + 0.05, 'Turret walls must clear the roof fittings');
// Any hull fitting inside the turret's swept radius must stay below its lower edge.
const ring = [tank.mounts.turretOffset[0], tank.mounts.turretOffset[2]];
const sweep = Math.max(...shell(after).map(p => Math.hypot(p[0] - ring[0], p[2] - ring[1])));
const hullIds = new Set<string>();
const collect = (nodes: TankModelSpec['slots']['hull']) => nodes.forEach(n => { hullIds.add(n.id); if (n.type === 'group') collect(n.children); if (n.type === 'repeat' || n.type === 'mirror') collect([n.child]); });
collect(model.slots.hull);
let swept = 0;
for (const id of hullIds) {
  const b = after.bounds[id];
  if (!b || id === 'm10-welded-upper-hull') continue;
  const dx = Math.max(b.min[0] - ring[0], 0, ring[0] - b.max[0]), dz = Math.max(b.min[2] - ring[1], 0, ring[1] - b.max[2]);
  if (Math.hypot(dx, dz) >= sweep) continue;
  swept++;
  assert.ok(b.max[1] < mn(after, 'm10-open-turret-shell', 1), `${id} (top ${b.max[1]}) must stay below the traversing turret`);
}
assert.ok(swept > 10, 'Turret sweep check must cover the roof fittings');
// Rear fittings may not stick out behind the track envelope in the side view.
for (const id of ['rear-exhaust-deflector', 'rear-tow-pintle', 'left-rear-tow-shackle', 'm4a2-lower-hull-tub'])
  assert.ok(mn(after, id, 2) >= mn(after, 'left-continuous-track', 2) - 0.02, `${id} must stay inside the track envelope`);

// Armour coverage (rays through the production collision routine compared with
// the rendered surfaces, open top, traverse) lives in src/tanks/m10/armor.test.ts
// so it also runs in a fresh clone without these local capture artifacts.

// Gameplay data documented in README.md.
assert.deepEqual(tank.durability, {health: 240, trackHealth: 150, armorSummary: {front: 38, side: 19, rear: 19, turret: 57}});
assert.deepEqual(tank.traverse, {turretSpeed: 0.078, gunSpeed: 0.1, maxElevationDeg: 30, maxDepressionDeg: 10});
assert.equal(tank.weapons.caliber, 76);
assert.deepEqual(tank.weapons.ammo.AP.historicalPenetration?.points.map(p => p.penetration), [109, 100, 88, 77]);
assert.equal(tank.mobility.trackWidth, 2.529);

const report = `# M10 GMC rendered landmark verification

Fixed cameras; pixels in the 1200 × 1800 OnWar drawing (164 px/m side/front/rear, 160 px/m plan).
Acceptance tolerance: ${TOLERANCE} px (73 mm side, 75 mm plan), for game-scale proportions.
"Before" is generator pass 0, the first draft built from the same measurements.

| Landmark | Reference | Before | After | Final error |
|---|---:|---:|---:|---:|
${landmarks.map(row).join('\n')}

${landmarks.length - failures.length}/${landmarks.length} pass. Mean error: ${mean(errorsOf(before)).toFixed(2)} → ${mean(errorsOf(after)).toFixed(2)} px. Maximum final error: ${Math.max(...errorsOf(after)).toFixed(2)} px.

Reported but not accepted (cross-view conflict in the drawing, see README):

| Landmark | Reference | Before | After | Difference |
|---|---:|---:|---:|---:|
${informational.map(row).join('\n')}

Schema, circular 508 mm wheels, wheel/track contact, hull joints, turret clearance, rear fittings
inside the track envelope and muzzle/spawn alignment pass. Armour coverage is checked separately
by \`node --import tsx --test --test-isolation=none src/tanks/m10/armor.test.ts\`.
`;
fs.writeFileSync(new URL('./measurements.md', import.meta.url), report);
console.log(report);
if (failures.length) {
  console.error(`Landmarks outside ${TOLERANCE} px:\n${failures.map(([n, r, f]) => `  ${n}: ${f(after).toFixed(2)} vs ${r}`).join('\n')}`);
  process.exitCode = 1;
}
