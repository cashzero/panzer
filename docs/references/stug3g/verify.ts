// Verifies the StuG III Ausf. G model against landmarks read independently from
// the Doyle drawing, plus geometry and gameplay-value checks.
//   node docs/references/stug3g/capture.mjs after && npx tsx docs/references/stug3g/verify.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec, TankSpec} from '../../../src/tanks/core/types';
import modelJson from '../../../src/tanks/stug3g/model.json';
import tankJson from '../../../src/tanks/stug3g/tank.json';

const model = modelJson as unknown as TankModelSpec;
const tank = tankJson as unknown as TankSpec;
const issues = validateTankDraft(tank, model, 'stug3g');
assert.equal(issues.filter(i => i.severity === 'error').length, 0, JSON.stringify(issues));

type Bounds = Record<string, {min: number[]; max: number[]}>;
interface Capture {bounds: Bounds; vertices: Record<string, number[][]>}
const read = (name: string): Capture => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const before = read('before-bounds.json'), after = read('after-bounds.json');

const c = (b: Capture, id: string, axis: number) => { const n = b.bounds[id]; assert.ok(n, `missing ${id}`); return (n.min[axis] + n.max[axis]) / 2; };
const mx = (b: Capture, id: string, axis: number) => b.bounds[id].max[axis];
const mn = (b: Capture, id: string, axis: number) => b.bounds[id].min[axis];
const span = (b: Capture, id: string, axis: number) => mx(b, id, axis) - mn(b, id, axis);
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps;
// Vertex queries for sloped surfaces that an AABB cannot describe.
const verts = (b: Capture, id: string) => b.vertices[id];
const casemate = (b: Capture) => verts(b, 'stug-casemate');
const lower = (b: Capture) => verts(b, 'stug-lower-hull');
const roofY = (b: Capture) => Math.max(...casemate(b).map(p => p[1]));
const roof = (b: Capture) => casemate(b).filter(p => near(p[1], roofY(b)));
const knee = (b: Capture) => casemate(b).filter(p => near(p[1], 1.632, 0.01));
const maxZ = (pts: number[][]) => Math.max(...pts.map(p => p[2]));
const minZ = (pts: number[][]) => Math.min(...pts.map(p => p[2]));

// Drawing pixels (1200 x 2100 OnWar scan of the Doyle drawing).
// Side without skirts (vehicle left, +X): px = 700 - Z*152, py = 536 - Y*152.
// Side with skirts: px = 714.5 - Z*152, py = 971 - Y*152. Plan: px = 703.7 - Z*156.4,
// py = 1307.5 + X*156.4. Front: px = 356 + X*155, py = 2015.5 - Y*155.
// Rear: px = 909.5 - X*155, py = 2016 - Y*155.
const sx = (z: number) => 700 - z * 152, sy = (y: number) => 536 - y * 152;
const kx = (z: number) => 714.5 - z * 152, ky = (y: number) => 971 - y * 152;
const tx = (z: number) => 703.7 - z * 156.4, ty = (x: number) => 1307.5 + x * 156.4;
const fx = (x: number) => 356 + x * 155, fy = (y: number) => 2015.5 - y * 155;
const ry = (y: number) => 2016 - y * 155;
// Outer belt height at a given Z, read from the extrude outline ((-z, y) points).
const beltOutline = (() => { const n = model.slots.tracksRight.find(x => x.id === 'right-continuous-track'); assert.ok(n?.type === 'extrude'); return n.shape.outline; })();
const trackTopAt = (z: number) => Math.max(...beltOutline.filter(([nz]) => Math.abs(-nz - z) < 0.03).map(([, y]) => y));
type Landmark = [name: string, reference: number, measure: (b: Capture) => number];
const landmarks: Landmark[] = [
  ['Side: muzzle', 86, b => sx(mx(b, 'stuk40-muzzle-brake', 2))],
  ['Side: gun axis', 294, b => sy(c(b, 'stuk40-barrel', 1))],
  ['Side: Saukopf front', 355, b => sx(mx(b, 'saukopf-mantlet', 2))],
  ['Side: Saukopf top', 237, b => sy(mx(b, 'saukopf-mantlet', 1))],
  ['Side: casemate roof', 226, b => sy(roofY(b))],
  ['Side: roof front edge', 505, b => sx(maxZ(roof(b)))],
  ['Side: roof rear edge', 797, b => sx(minZ(roof(b)))],
  ['Side: driver plate top', 462, b => sx(maxZ(knee(b)))],
  ['Side: hull top (fender line)', 330, b => sy(Math.max(...lower(b).map(p => p[1])))],
  ['Side: hull rear', 1100, b => sx(minZ(lower(b)))],
  ['Side: engine deck', 272, b => sy(mx(b, 'stug-engine-compartment', 1))],
  ['Side: sprocket centre X', 357.5, b => sx(c(b, 'right-drive-sprocket-wheel-hub', 2))],
  ['Side: sprocket centre Y', 425, b => sy(c(b, 'right-drive-sprocket-wheel-hub', 1))],
  ['Side: idler centre X', 1020, b => sx(c(b, 'right-idler-wheel-hub', 2))],
  ['Side: idler centre Y', 413, b => sy(c(b, 'right-idler-wheel-hub', 1))],
  ['Side: first road wheel', 480, b => sx(c(b, 'right-road-wheel-0-hub', 2))],
  ['Side: fourth road wheel', 745, b => sx(c(b, 'right-road-wheel-3-hub', 2))],
  ['Side: last road wheel', 922, b => sx(c(b, 'right-road-wheel-5-hub', 2))],
  ['Side: road wheel centre height', 483, b => sy(c(b, 'right-road-wheel-2-hub', 1))],
  ['Side: road wheel top', 444, b => sy(mx(b, 'right-road-wheel-2-outer-tyre', 1))],
  ['Side: middle return roller', 695, b => sx(c(b, 'right-return-roller-wheel-1', 2))],
  ['Side: track front', 276, b => sx(mx(b, 'right-continuous-track', 2))],
  ['Side: track top over the middle return roller', 352, () => sy(trackTopAt(c(after, 'right-return-roller-wheel-1', 2)))],
  ['Skirts: front edge', 402, b => kx(mx(b, 'right-schurzen-panel-0', 2))],
  ['Skirts: first joint', 556, b => kx(mn(b, 'right-schurzen-panel-0', 2))],
  ['Skirts: second joint', 710.5, b => kx(mn(b, 'right-schurzen-panel-1', 2))],
  ['Skirts: rear edge', 1020, b => kx(mn(b, 'right-schurzen-panel-3', 2))],
  ['Skirts: top', 679, b => ky(mx(b, 'right-schurzen-panel-1', 1))],
  ['Skirts: bottom', 874, b => ky(mn(b, 'right-schurzen-panel-1', 1))],
  ['Plan: muzzle', 72, b => tx(mx(b, 'stuk40-muzzle-brake', 2))],
  ['Plan: gun axis (offset right)', 1288, b => ty(c(b, 'stuk40-barrel', 0))],
  ['Plan: fender front', 293, b => tx(mx(b, 'right-front-fender', 2))],
  ['Plan: cupola centre Z', 730, b => tx(c(b, 'commander-cupola', 2))],
  ['Plan: cupola centre X', 1405, b => ty(c(b, 'commander-cupola', 0))],
  ['Plan: skirt outer width', 525, b => (mx(b, 'right-schurzen-panel-2', 0) - mn(b, 'left-schurzen-panel-2', 0)) * 156.4],
  ['Front: skirt outer width (splayed top)', 512, b => (mx(b, 'right-schurzen-panel-2', 0) - mn(b, 'left-schurzen-panel-2', 0)) * 155],
  ['Front: track outside span', 457.5, b => (mx(b, 'right-continuous-track', 0) - mn(b, 'left-continuous-track', 0)) * 155],
  ['Front: track width', 65, b => span(b, 'right-continuous-track', 0) * 155],
  ['Front: roof width', 295, b => 2 * Math.max(...roof(b).map(p => Math.abs(p[0]))) * 155],
  ['Front: roof height', 1700, b => fy(roofY(b))],
  ['Front: lower hull width', 295, b => span(b, 'stug-lower-hull', 0) * 155],
  ['Front: belly', 1956, b => fy(Math.min(...lower(b).map(p => p[1])))],
  ['Front: gun bore X', 338.5, b => fx(c(b, 'stuk40-barrel', 0))],
  ['Front: gun bore Y', 1769, b => fy(c(b, 'stuk40-barrel', 1))],
  ['Front: Saukopf width', 95, b => span(b, 'saukopf-mantlet', 0) * 155],
  ['Rear: track outside span', 455, b => (mx(b, 'right-continuous-track', 0) - mn(b, 'left-continuous-track', 0)) * 155],
  ['Rear: lower hull width', 298, b => span(b, 'stug-lower-hull', 0) * 155],
  ['Rear: belly', 1958, b => ry(Math.min(...lower(b).map(p => p[1])))],
];
// No view disagrees beyond tolerance with the others; nothing is reported separately.
const informational: Landmark[] = [];
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
const tyre = after.bounds['right-road-wheel-2-outer-tyre'];
const tyreD = tyre.max[1] - tyre.min[1];
assert.ok(near(tyreD, 0.514, 1e-4), `514 mm road wheels (${tyreD})`);
assert.ok(near(tyre.max[2] - tyre.min[2], tyreD, 1e-4), 'Road wheels must stay circular');
const track = model.slots.tracksRight.find(n => n.id === 'right-continuous-track');
assert.ok(track?.type === 'extrude' && track.shape.holes?.length === 1, 'Track belt needs an inner loop');
const innerBottom = Math.min(...track.shape.holes![0].map(p => p[1]));
assert.ok(near(tyre.min[1], innerBottom, 1e-4), `Wheels rest on the inner track run (${tyre.min[1]} vs ${innerBottom})`);
for (const k of [0, 1, 2]) {
  const z = c(after, `right-return-roller-wheel-${k}`, 2);
  const innerTop = Math.max(...track.shape.holes![0].filter(([nz]) => Math.abs(-nz - z) < 1e-3).map(([, y]) => y));
  assert.ok(near(mx(after, `right-return-roller-wheel-${k}`, 1), innerTop, 1e-4), `Upper run rests on return roller ${k}`);
}
assert.ok(mx(after, 'right-continuous-track', 1) < Math.max(...lower(after).map(p => p[1])), 'Track stays under the fenders');
const muzzleZ = tank.mounts.turretOffset[2] + tank.mounts.gunPivotOffset[2] + tank.mounts.muzzleDistance;
assert.ok(near(mx(after, 'stuk40-muzzle-brake', 2), muzzleZ, 1e-4), 'Projectile spawn must match the muzzle exit');
// Casemate gun: limited traverse; the Saukopf stays clear of the hull front at full traverse.
assert.equal(tank.traverse.limitDeg, 10);
const cradle = after.bounds['stuk40-traverse-cradle'];
assert.ok(cradle.max[1] < roofY(after) && cradle.max[2] < maxZ(roof(after)) + 0.4, 'Traverse cradle stays inside the casemate');

// Armour coverage (rays through the production collision routine compared with
// the rendered surfaces, and gun traverse) lives in src/tanks/stug3g/armor.test.ts
// so it also runs in a fresh clone without these local capture artifacts.

// Gameplay data documented in README.md.
assert.deepEqual(tank.durability, {health: 230, trackHealth: 80, armorSummary: {front: 80, side: 30, rear: 50, turret: 80}});
assert.deepEqual(tank.traverse, {turretSpeed: 0.05, gunSpeed: 0.08, maxElevationDeg: 20, maxDepressionDeg: 6, limitDeg: 10});
assert.equal(tank.weapons.caliber, 75);
assert.equal(tank.mobility.trackWidth, 2.94);

const report = `# StuG III Ausf. G rendered landmark verification

Fixed cameras; pixels in the 1200 × 2100 OnWar scan of the Doyle drawing (152 px/m side views, 156.4 plan, 155 front/rear).
Acceptance tolerance: ${TOLERANCE} px (79 mm side), for game-scale proportions.
"Before" is generator pass 0, the first draft built from the same measurements.

| Landmark | Reference | Before | After | Final error |
|---|---:|---:|---:|---:|
${landmarks.map(row).join('\n')}

${landmarks.length - failures.length}/${landmarks.length} pass. Mean error: ${mean(errorsOf(before)).toFixed(2)} → ${mean(errorsOf(after)).toFixed(2)} px. Maximum final error: ${Math.max(...errorsOf(after)).toFixed(2)} px.

Reported but not accepted (cross-view conflict in the drawing, see README):

| Landmark | Reference | Before | After | Difference |
|---|---:|---:|---:|---:|
${informational.map(row).join('\n')}

Schema, circular 514 mm wheels, wheel/track contact on the road wheels and return rollers, track
under the fenders, muzzle/spawn alignment and the traverse cradle inside the casemate pass. Armour coverage is
checked separately by \`node --import tsx --test src/tanks/stug3g/armor.test.ts\`.
`;
fs.writeFileSync(new URL('./measurements.md', import.meta.url), report);
console.log(report);
if (failures.length) {
  console.error(`Landmarks outside ${TOLERANCE} px:\n${failures.map(([n, r, f]) => `  ${n}: ${f(after).toFixed(2)} vs ${r}`).join('\n')}`);
  process.exitCode = 1;
}
