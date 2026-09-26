// Verifies the Panther Ausf. A model against landmarks read independently from
// the Doyle drawing, plus geometry and gameplay-value checks.
//   node docs/references/panther_a/capture.mjs after && npx tsx docs/references/panther_a/verify.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec, TankSpec} from '../../../src/tanks/core/types';
import modelJson from '../../../src/tanks/panther_a/model.json';
import tankJson from '../../../src/tanks/panther_a/tank.json';

const model = modelJson as unknown as TankModelSpec;
const tank = tankJson as unknown as TankSpec;
const issues = validateTankDraft(tank, model, 'panther_a');
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
const hull = (b: Capture) => b.vertices['panther-welded-hull'];
const roofY = (b: Capture) => Math.max(...hull(b).map(p => p[1]));
const roof = (b: Capture) => hull(b).filter(p => near(p[1], roofY(b)));
const lowerHalf = (b: Capture) => Math.min(...hull(b).map(p => Math.abs(p[0])));
const shell = (b: Capture) => b.vertices['panther-turret-shell'];
const shellTopY = (b: Capture) => Math.max(...shell(b).map(p => p[1]));
const shellBase = (b: Capture) => shell(b).filter(p => near(p[1], Math.min(...shell(b).map(q => q[1]))));
const shellTop = (b: Capture) => shell(b).filter(p => p[1] > shellTopY(b) - 0.06);
const minZ = (pts: number[][]) => Math.min(...pts.map(p => p[2]));
const maxZ = (pts: number[][]) => Math.max(...pts.map(p => p[2]));

// Drawing pixels (1800 x 2100 OnWar scan of the Doyle drawing), 155 px/m in every view.
// Side (vehicle left, +X): px = 1046 - Z*155, py = 695.5 - Y*155. Plan: px = 1037 - Z*155,
// py = 1034.5 + X*155. Front: px = 545 + X*155, py = 1941 - Y*155. Rear: px = 1361.5 - X*155,
// py = 1942 - Y*155. The side view shows the vehicle's left (+X), "right" in node ids.
const sx = (z: number) => 1046 - z * 155, sy = (y: number) => 695.5 - y * 155;
const tx = (z: number) => 1037 - z * 155, ty = (x: number) => 1034.5 + x * 155;
const fx = (x: number) => 545 + x * 155, fy = (y: number) => 1941 - y * 155;
const rx = (x: number) => 1361.5 - x * 155, ry = (y: number) => 1942 - y * 155;
const PX = 155;
type Landmark = [name: string, reference: number, measure: (b: Capture) => number];
const landmarks: Landmark[] = [
  ['Side: muzzle', 219, b => sx(mx(b, 'kwk42-muzzle-brake', 2))],
  ['Side: gun axis', 337.5, b => sy(c(b, 'kwk42-barrel', 1))],
  ['Side: mantlet front', 855, b => sx(mx(b, 'kwk42-rounded-mantlet', 2))],
  ['Side: mantlet top', 285, b => sy(mx(b, 'kwk42-rounded-mantlet', 1))],
  ['Side: turret front, roof edge', 950, b => sx(maxZ(shellTop(b)))],
  ['Side: turret front, base', 924, b => sx(maxZ(shellBase(b)))],
  ['Side: turret roof', 282, b => sy(shellTopY(b))],
  ['Side: turret roof rear edge', 1210, b => sx(minZ(shellTop(b)))],
  ['Side: turret base rear', 1275, b => sx(minZ(shellBase(b)))],
  ['Side: cupola ring', 238.5, b => sy(c(b, 'cupola-ring-aa-rail', 1))],
  ['Side: hull roof', 400, b => sy(roofY(b))],
  ['Side: skirt front', 588, b => sx(mx(b, 'right-schurzen-panel-0', 2))],
  ['Side: skirt rear', 1483, b => sx(mn(b, 'right-schurzen-panel-5', 2))],
  ['Side: skirt top', 469, b => sy(mx(b, 'right-schurzen-panel-0', 1))],
  ['Side: skirt bottom', 548, b => sy(mn(b, 'right-schurzen-panel-0', 1))],
  ['Side: skirt joint 3', 1039, b => sx(mn(b, 'right-schurzen-panel-2', 2))],
  ['Side: sprocket centre X', 596, b => sx(c(b, 'right-drive-sprocket-wheel-hub', 2))],
  ['Side: sprocket centre Y', 566, b => sy(c(b, 'right-drive-sprocket-wheel-hub', 1))],
  ['Side: idler centre X', 1422, b => sx(c(b, 'right-idler-wheel-hub', 2))],
  ['Side: idler centre Y', 577, b => sy(c(b, 'right-idler-wheel-hub', 1))],
  ['Side: first road wheel', 717, b => sx(c(b, 'right-road-wheel-0-outer-hub', 2))],
  ['Side: second road wheel', 803, b => sx(c(b, 'right-road-wheel-1-outer-hub', 2))],
  ['Side: fifth road wheel', 1060, b => sx(c(b, 'right-road-wheel-4-outer-hub', 2))],
  ['Side: last road wheel', 1323, b => sx(c(b, 'right-road-wheel-7-outer-hub', 2))],
  ['Side: road wheel centre height', 614.5, b => sy(c(b, 'right-road-wheel-3-outer-hub', 1))],
  ['Side: road wheel top', 548, b => sy(mx(b, 'right-road-wheel-3-outer-tyre', 1))],
  ['Side: track front', 521, b => sx(mx(b, 'right-continuous-track', 2))],
  ['Side: track rear', 1476, b => sx(mn(b, 'right-continuous-track', 2))],
  ['Side: fender tip', 500, b => sx(mx(b, 'right-front-fender', 2))],
  ['Side: headlamp', 632, b => sx(c(b, 'front-headlamp', 2))],
  ['Side: antenna', 1310, b => sx(c(b, 'antenna-whip', 2))],
  ['Plan: hull nose', 527, b => tx(Math.max(...hull(b).map(p => p[2])))],
  ['Plan: roof front edge', 725, b => tx(maxZ(roof(b)))],
  ['Plan: roof rear edge', 1536, b => tx(minZ(roof(b)))],
  ['Plan: fender front', 495, b => tx(mx(b, 'right-front-fender', 2))],
  ['Plan: fender rear', 638, b => tx(mn(b, 'right-front-fender', 2))],
  ['Plan: turret base front', 908, b => tx(maxZ(shellBase(b)))],
  ['Plan: turret base rear', 1273, b => tx(minZ(shellBase(b)))],
  ['Plan: turret roof rear', 1205, b => tx(minZ(shellTop(b)))],
  ['Plan: turret maximum width', 369, b => span(b, 'panther-turret-shell', 0) * PX],
  ['Plan: cupola centre Z', 1140, b => tx(c(b, 'commander-cupola', 2))],
  ['Plan: cupola centre X', 1097.5, b => ty(c(b, 'commander-cupola', 0))],
  ['Plan: cooling fan', 1375, b => tx(c(b, 'right-cooling-fan-cover', 2))],
  ['Plan: skirt outer width', 535, b => (mx(b, 'right-schurzen-panel-2', 0) - mn(b, 'left-schurzen-panel-2', 0)) * PX],
  ['Plan: muzzle', 210, b => tx(mx(b, 'kwk42-muzzle-brake', 2))],
  ['Front: track outside span', 510, b => (mx(b, 'right-continuous-track', 0) - mn(b, 'left-continuous-track', 0)) * PX],
  ['Front: track width', 100, b => span(b, 'right-continuous-track', 0) * PX],
  ['Front: roof width', 380, b => 2 * Math.max(...roof(b).map(p => Math.abs(p[0]))) * PX],
  ['Front: lower hull width', 275, b => 2 * lowerHalf(b) * PX],
  ['Front: glacis top edge', 1643, b => fy(roofY(b))],
  ['Front: belly', 1855, b => fy(Math.min(...hull(b).map(p => p[1])))],
  ['Front: turret roof', 1528.5, b => fy(shellTopY(b))],
  ['Front: mantlet width', 223, b => span(b, 'kwk42-rounded-mantlet', 0) * PX],
  ['Front: mantlet bottom', 1632, b => fy(mn(b, 'kwk42-rounded-mantlet', 1))],
  ['Front: gun axis', 1585, b => fy(c(b, 'kwk42-barrel', 1))],
  ['Front: headlamp X', 737, b => fx(c(b, 'front-headlamp', 0))],
  ['Front: headlamp Y', 1657, b => fy(c(b, 'front-headlamp', 1))],
  ['Front: hull MG ball X', 461, b => fx(c(b, 'hull-mg-ball', 0))],
  ['Rear: lower hull width', 283, b => 2 * lowerHalf(b) * PX],
  ['Rear: escape hatch X', 1402, b => rx(c(b, 'turret-rear-escape-hatch', 0))],
  ['Rear: escape hatch Y', 1582, b => ry(c(b, 'turret-rear-escape-hatch', 1))],
  ['Rear: left exhaust', 1308, b => rx(c(b, 'rear-exhaust-pipe-1', 0))],
  ['Rear: right exhaust', 1416, b => rx(c(b, 'rear-exhaust-pipe-3', 0))],
  ['Rear: exhaust top', 1630, b => ry(mx(b, 'rear-exhaust-pipe-1-cap', 1))],
];
// Documented cross-view conflict: the front view places the sponson edge and
// skirt top about 0.07 m above the side view. Reported, not accepted.
const informational: Landmark[] = [
  ['Front: skirt top (conflicts with side view)', 1703, b => fy(mx(b, 'right-schurzen-panel-0', 1))],
  ['Rear: turret roof (rear view reads 6 px higher)', 1522.5, b => ry(shellTopY(b))],
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
const tyre = after.bounds['right-road-wheel-3-outer-tyre'];
const tyreD = tyre.max[1] - tyre.min[1];
assert.ok(near(tyreD, 0.86, 1e-4), `860 mm road wheels (${tyreD})`);
assert.ok(near(tyre.max[2] - tyre.min[2], tyreD, 1e-4), 'Road wheels must stay circular');
const track = model.slots.tracksRight.find(n => n.id === 'right-continuous-track');
assert.ok(track?.type === 'extrude' && track.shape.holes?.length === 1, 'Track belt needs an inner loop');
const innerBottom = Math.min(...track.shape.holes![0].map(p => p[1]));
assert.ok(near(tyre.min[1], innerBottom, 1e-4), `Wheels rest on the inner track run (${tyre.min[1]} vs ${innerBottom})`);
// Interleaved wheels must not intersect each other or the guide horns (|u| <= 0.03).
for (let k = 0; k < 7; k++) for (const a of ['outer', 'inner']) for (const bSide of ['outer', 'inner']) {
  const A = after.bounds[`right-road-wheel-${k}-${a}-tyre`], B = after.bounds[`right-road-wheel-${k + 1}-${bSide}-tyre`];
  const overlapX = Math.min(A.max[0], B.max[0]) - Math.max(A.min[0], B.min[0]);
  assert.ok(overlapX <= 1e-6 || Math.abs(c(after, `right-road-wheel-${k}-${a}-tyre`, 2) - c(after, `right-road-wheel-${k + 1}-${bSide}-tyre`, 2)) >= 0.86 - 1e-6,
    `Wheels ${k}/${a} and ${k + 1}/${bSide} intersect`);
}
for (const [k, id] of Object.keys(after.bounds).filter(id => /^right-road-wheel-\d-(outer|inner)-tyre$/.test(id)).entries()) {
  const u = [mn(after, id, 0), mx(after, id, 0)].map(x => x - 1.32);
  assert.ok(u[0] >= 0.03 - 1e-6 || u[1] <= -0.03 + 1e-6, `${id} (${k}) must clear the guide horns`);
}
const muzzleZ = tank.mounts.turretOffset[2] + tank.mounts.gunPivotOffset[2] + tank.mounts.muzzleDistance;
assert.ok(near(mx(after, 'kwk42-muzzle-brake', 2), muzzleZ, 1e-4), 'Projectile spawn must match the muzzle exit');
assert.ok(mn(after, 'panther-turret-shell', 1) <= roofY(after) + 1e-6, 'Turret must sit on the hull roof');
// Any hull fitting inside the turret's swept radius must stay below the turret base.
const ring = [tank.mounts.turretOffset[0], tank.mounts.turretOffset[2]];
const sweep = Math.max(...shell(after).map(p => Math.hypot(p[0] - ring[0], p[2] - ring[1])));
const hullIds = model.slots.hull.map(n => n.id).filter(id => id !== 'panther-welded-hull');
let swept = 0;
for (const id of hullIds) {
  const b = after.bounds[id];
  if (!b) continue;
  const dx = Math.max(b.min[0] - ring[0], 0, ring[0] - b.max[0]), dz = Math.max(b.min[2] - ring[1], 0, ring[1] - b.max[2]);
  if (Math.hypot(dx, dz) >= sweep || b.max[1] < roofY(after) - 0.05) continue;
  swept++;
  assert.ok(b.max[1] < roofY(after) + 0.1, `${id} (top ${b.max[1]}) must stay below the traversing turret overhang`);
}
assert.ok(swept > 3, 'Turret sweep check must cover the roof fittings');
// The gun clears the engine deck fittings when traversed over the rear (lowest point of the barrel).
const barrelLow = tank.mounts.turretOffset[1] + tank.mounts.gunPivotOffset[1] - 0.084;
for (const id of hullIds.filter(id => /exhaust|antenna-base|filler|fan|hatch/.test(id)))
  assert.ok(mx(after, id, 1) < barrelLow, `${id} must stay below the barrel at 0 deg elevation`);

// Armour coverage (rays through the production collision routine compared with
// the rendered surfaces, and traverse) lives in src/tanks/panther_a/armor.test.ts
// so it also runs in a fresh clone without these local capture artifacts.

// Gameplay data documented in README.md.
assert.deepEqual(tank.durability, {health: 310, trackHealth: 110, armorSummary: {front: 80, side: 40, rear: 40, turret: 100}});
assert.deepEqual(tank.traverse, {turretSpeed: 0.27, gunSpeed: 0.1, maxElevationDeg: 18, maxDepressionDeg: 8});
assert.equal(tank.weapons.caliber, 75);
assert.deepEqual(tank.weapons.ammo.AP.historicalPenetration?.points.map(p => p.penetration), [138, 124, 111, 99, 89]);
assert.deepEqual(tank.weapons.ammo.APC?.historicalPenetration?.points.map(p => p.penetration), [194, 174, 149, 127]);
assert.equal(tank.mobility.trackWidth, 3.3);

const report = `# Panther Ausf. A rendered landmark verification

Fixed cameras; pixels in the 1800 × 2100 OnWar scan of the Doyle drawing (155 px/m in all four views).
Acceptance tolerance: ${TOLERANCE} px (77 mm), for game-scale proportions.
"Before" is generator pass 0, the first draft built from the same measurements.

| Landmark | Reference | Before | After | Final error |
|---|---:|---:|---:|---:|
${landmarks.map(row).join('\n')}

${landmarks.length - failures.length}/${landmarks.length} pass. Mean error: ${mean(errorsOf(before)).toFixed(2)} → ${mean(errorsOf(after)).toFixed(2)} px. Maximum final error: ${Math.max(...errorsOf(after)).toFixed(2)} px.

Reported but not accepted (cross-view conflict in the drawing, see README):

| Landmark | Reference | Before | After | Difference |
|---|---:|---:|---:|---:|
${informational.map(row).join('\n')}

Schema, circular 860 mm wheels, wheel/track contact, interleaved wheel clearance, turret seating,
roof fittings under the turret and barrel, and muzzle/spawn alignment pass. Armour coverage is
checked separately by \`node --import tsx --test src/tanks/panther_a/armor.test.ts\`.
`;
fs.writeFileSync(new URL('./measurements.md', import.meta.url), report);
console.log(report);
if (failures.length) {
  console.error(`Landmarks outside ${TOLERANCE} px:\n${failures.map(([n, r, f]) => `  ${n}: ${f(after).toFixed(2)} vs ${r}`).join('\n')}`);
  process.exitCode = 1;
}
