// Verifies the T-34/76 model 1943 against landmarks read independently from the
// Bradford drawing, plus geometry and gameplay-value checks.
//   node docs/references/t34/capture.mjs after && npx tsx docs/references/t34/verify.ts
//   npx tsx docs/references/t34/verify.ts --landmarks [label]   (signed residuals only)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec, TankSpec} from '../../../src/tanks/core/types';
import modelJson from '../../../src/tanks/t34/model.json';
import tankJson from '../../../src/tanks/t34/tank.json';

const model = modelJson as unknown as TankModelSpec;
const tank = tankJson as unknown as TankSpec;

type Bounds = Record<string, {min: number[]; max: number[]}>;
interface Capture {bounds: Bounds; vertices: Record<string, number[][]>}
const read = (name: string): Capture => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));

const box = (b: Capture, id: string) => { const n = b.bounds[id]; assert.ok(n, `missing ${id}`); return n; };
const c = (b: Capture, id: string, axis: number) => (box(b, id).min[axis] + box(b, id).max[axis]) / 2;
const mx = (b: Capture, id: string, axis: number) => box(b, id).max[axis];
const mn = (b: Capture, id: string, axis: number) => box(b, id).min[axis];
const span = (b: Capture, id: string, axis: number) => mx(b, id, axis) - mn(b, id, axis);
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;
const verts = (b: Capture, id: string) => b.vertices[id];
// Vertex queries for the sloped hull and turret faces that an AABB cannot describe.
const hull = (b: Capture) => verts(b, 'sloped-upper-hull');
const roofY = (b: Capture) => Math.max(...hull(b).map(p => p[1]));
const lipY = (b: Capture) => Math.min(...hull(b).map(p => p[1]));
const roof = (b: Capture) => hull(b).filter(p => near(p[1], roofY(b)));
const lip = (b: Capture) => hull(b).filter(p => near(p[1], lipY(b)));
// Z where the glacis (front) or upper rear plate line crosses height y.
const slopeZ = (b: Capture, y: number, front: boolean) => {
  const pick = (ps: number[][]) => (front ? Math.max : Math.min)(...ps.map(p => p[2]));
  const [z0, y0, z1, y1] = [pick(lip(b)), lipY(b), pick(roof(b)), roofY(b)];
  return z0 + (y - y0) / (y1 - y0) * (z1 - z0);
};
const widthAt = (ps: number[][]) => Math.max(...ps.map(p => p[0])) - Math.min(...ps.map(p => p[0]));
const shell = (b: Capture) => verts(b, 'model-1943-hexagonal-turret');
const shellTop = (b: Capture) => { const y = Math.max(...shell(b).map(p => p[1])); return shell(b).filter(p => near(p[1], y)); };
const tub = (b: Capture) => verts(b, 'lower-hull-tub');
const belt = (b: Capture) => verts(b, 'left-continuous-track');
const topRun = (b: Capture) => Math.max(...belt(b).filter(p => Math.abs(p[2]) < 2.1).map(p => p[1]));

// Drawing pixels (1200 x 1600 Bradford scan), 152 px/m in every view (views.ts).
const sx = (z: number) => 532 + z * 152, sy = (y: number) => 511 - y * 152;
const tx = (z: number) => 538 + z * 152, ty = (x: number) => 826 - x * 152;
const fx = (x: number) => 294 + x * 152, fy = (y: number) => 1546.5 - y * 152;
const rx = (x: number) => 851.5 - x * 152, ry = (y: number) => 1545 - y * 152;
type Landmark = [name: string, reference: number, measure: (b: Capture) => number];
const landmarks: Landmark[] = [
  ['Side: hull roof', 273.7, b => sy(roofY(b))],
  ['Side: glacis/roof junction', 781, b => sx(Math.max(...roof(b).map(p => p[2])))],
  ['Side: glacis at fender', 900, b => sx(slopeZ(b, 1.099, true))],
  ['Side: sponson lower edge', 340, b => sy(lipY(b))],
  ['Side: upper rear plate at Y 1.44', 179, b => sx(slopeZ(b, 1.441, false))],
  ['Side: upper rear plate at Y 1.09', 131, b => sx(slopeZ(b, 1.086, false))],
  ['Side: turret roof', 142.7, b => sy(Math.max(...shell(b).map(p => p[1])))],
  ['Side: turret lower edge', 249.5, b => sy(Math.min(...shell(b).map(p => p[1])))],
  ['Side: turret rear', 449, b => sx(Math.min(...shell(b).map(p => p[2])))],
  ['Side: turret roof front edge', 713, b => sx(Math.max(...shellTop(b).map(p => p[2])))],
  ['Side: turret casting front', 782, b => sx(Math.max(...shell(b).map(p => p[2])))],
  ['Side: mantlet front', 805, b => sx(mx(b, 'rounded-f34-mantlet', 2))],
  ['Side: gun sleeve front', 861, b => sx(mx(b, 'recoil-housing', 2))],
  ['Side: gun axis', 197.5, b => sy(c(b, 'f34-barrel', 1))],
  ['Side: muzzle', 1119, b => sx(mx(b, 'plain-muzzle-ring', 2))],
  ['Side: cupola centre', 617.5, b => sx(c(b, 'commander-cupola', 2))],
  ['Side: cupola diameter', 101, b => span(b, 'commander-cupola', 2) * 152],
  ['Side: cupola body top', 110, b => sy(mx(b, 'commander-cupola', 1))],
  ['Side: cupola hatch top', 95, b => sy(mx(b, 'commander-hatch', 1))],
  ['Side: idler centre Z', 962, b => sx(c(b, 'left-front-idler-hub', 2))],
  ['Side: idler centre Y', 411, b => sy(c(b, 'left-front-idler-hub', 1))],
  ['Side: idler diameter', 81, b => span(b, 'left-front-idler-rim', 1) * 152],
  ['Side: sprocket centre Z', 141, b => sx(c(b, 'left-rear-drive-sprocket-hub', 2))],
  ['Side: sprocket centre Y', 418, b => sy(c(b, 'left-rear-drive-sprocket-hub', 1))],
  ['Side: sprocket diameter', 93, b => span(b, 'left-rear-drive-sprocket-rim', 1) * 152],
  ['Side: front road wheel', 839, b => sx(c(b, 'left-road-wheel-0', 2))],
  ['Side: second road wheel', 696, b => sx(c(b, 'left-road-wheel-1', 2))],
  ['Side: middle road wheel', 537, b => sx(c(b, 'left-road-wheel-2', 2))],
  ['Side: fourth road wheel', 398, b => sx(c(b, 'left-road-wheel-3', 2))],
  ['Side: rear road wheel', 258, b => sx(c(b, 'left-road-wheel-4', 2))],
  ['Side: road wheel centre height', 441, b => sy(c(b, 'left-road-wheel-2', 1))],
  ['Side: road wheel diameter', 126, b => span(b, 'left-road-wheel-2', 1) * 152],
  ['Side: track top run', 371, b => sy(topRun(b))],
  ['Side: rear fuel drum', 254, b => sx(c(b, 'left-rear-fuel-drum', 2))],
  ['Side: forward fuel drum', 410, b => sx(c(b, 'left-forward-fuel-drum', 2))],
  ['Side: fuel drum height', 279, b => sy(c(b, 'left-rear-fuel-drum', 1))],
  ['Side: antenna', 790.5, b => sx(c(b, 'radio-antenna', 2))],
  ['Side: antenna top', 80, b => sy(mx(b, 'radio-antenna', 1))],
  ['Side: exhaust tip', 96, b => sx(mn(b, 'left-rear-exhaust', 2))],
  ['Top: fender outer span', 459, b => (mx(b, 'right-fender', 0) - mn(b, 'left-fender', 0)) * 152],
  ['Top: sponson width', 396, b => widthAt(lip(b)) * 152],
  ['Top: roof width', 275, b => widthAt(roof(b)) * 152],
  ['Top: glacis nose', 991, b => tx(Math.max(...tub(b).map(p => p[2])))],
  ['Top: turret rear', 458.5, b => tx(Math.min(...shell(b).map(p => p[2])))],
  ['Top: turret front', 785, b => tx(Math.max(...shell(b).map(p => p[2])))],
  ['Top: turret width', 292, b => widthAt(shell(b)) * 152],
  ['Top: cupola centre Z', 621.5, b => tx(c(b, 'commander-cupola', 2))],
  ['Top: cupola centre X', 780, b => ty(c(b, 'commander-cupola', 0))],
  ['Top: loader hatch Z', 626, b => tx(c(b, 'loader-hatch', 2))],
  ['Top: loader hatch X', 871, b => ty(c(b, 'loader-hatch', 0))],
  ['Top: periscopes Z', 697, b => tx(c(b, 'commander-periscope', 2))],
  ['Top: commander periscope X', 772, b => ty(c(b, 'commander-periscope', 0))],
  ['Top: loader periscope X', 877, b => ty(c(b, 'loader-periscope', 0))],
  ['Top: ventilator Z', 543.5, b => tx(c(b, 'rear-ventilator-dome', 2))],
  ['Top: driver hatch front', 907, b => tx(mx(b, 'driver-hatch', 2))],
  ['Top: hull MG Z', 893, b => tx(c(b, 'hull-mg-ball', 2))],
  ['Top: hull MG X', 905, b => ty(c(b, 'hull-mg-ball', 0))],
  ['Top: left fuel drum X', 634.5, b => ty(c(b, 'right-rear-fuel-drum', 0))],
  ['Top: right fuel drums X', 1018, b => ty(c(b, 'left-rear-fuel-drum', 0))],
  ['Top: muzzle', 1125, b => tx(mx(b, 'plain-muzzle-ring', 2))],
  ['Front: track outside span', 453, b => (mx(b, 'right-continuous-track', 0) - mn(b, 'left-continuous-track', 0)) * 152],
  ['Front: track width', 79, b => span(b, 'left-continuous-track', 0) * 152],
  ['Front: glacis top', 1309.5, b => fy(roofY(b))],
  ['Front: glacis top width', 286, b => widthAt(roof(b)) * 152],
  ['Front: nose', 1429, b => fy(tub(b).reduce((a, p) => (p[2] > a[2] ? p : a))[1])],
  ['Front: belly', 1490, b => fy(Math.min(...tub(b).map(p => p[1])))],
  ['Front: turret width', 298, b => widthAt(shell(b)) * 152],
  ['Front: turret roof', 1177, b => fy(Math.max(...shell(b).map(p => p[1])))],
  ['Front: gun axis', 1227.5, b => fy(c(b, 'f34-barrel', 1))],
  ['Front: mantlet width', 183, b => span(b, 'rounded-f34-mantlet', 0) * 152],
  ['Front: mantlet height', 97, b => span(b, 'rounded-f34-mantlet', 1) * 152],
  ['Front: hull MG X', 216, b => fx(c(b, 'hull-mg-ball', 0))],
  ['Front: hull MG Y', 1360, b => fy(c(b, 'hull-mg-ball', 1))],
  ['Front: driver hatch X', 328, b => fx(c(b, 'driver-hatch', 0))],
  ['Front: left headlight X', 479, b => fx(c(b, 'right-headlight-lens', 0))],
  ['Front: headlight Y', 1318.5, b => fy(c(b, 'right-headlight-lens', 1))],
  ['Front: antenna X', 95.5, b => fx(c(b, 'radio-antenna', 0))],
  ['Rear: rear plate top width', 275, b => widthAt(roof(b)) * 152],
  ['Rear: rear plate at sponson width', 399, b => widthAt(lip(b)) * 152],
  ['Rear: rear bend', 1409, b => ry(tub(b).reduce((a, p) => (p[2] < a[2] ? p : a))[1])],
  ['Rear: left exhaust X', 777.5, b => rx(c(b, 'right-rear-exhaust', 0))],
  ['Rear: right exhaust X', 924.5, b => rx(c(b, 'left-rear-exhaust', 0))],
  ['Rear: exhaust Y', 1376, b => ry(mn(b, 'left-rear-exhaust', 1))],
  ['Rear: turret width', 297, b => widthAt(shell(b)) * 152],
  ['Rear: turret roof', 1173, b => ry(Math.max(...shell(b).map(p => p[1])))],
];
// Reported only (see README): the plan and front views place the cupola 0.30 and
// 0.23 m left of the centreline and the model takes 0.28 m.
// The plan's hull rear line (x 95) is 0.1 m aft of where the side view's upper
// rear plate reaches the rear bend (Y 0.895 in the rear view); the side is used.
const informational: Landmark[] = [
  ['Front: cupola centre X', 328.5, b => fx(c(b, 'commander-cupola', 0))],
  ['Top: hull rear', 95, b => tx(Math.min(...tub(b).map(p => p[2])))],
];

const TOLERANCE = 12;
const labelArg = process.argv[3] ?? 'after';
if (process.argv[2] === '--landmarks') {
  const b = read(`${labelArg}-bounds.json`);
  for (const [name, ref, f] of [...landmarks, ...informational]) { let d: number; try { d = f(b) - ref; } catch { console.log(`   ${name.padEnd(36)} missing`); continue; } console.log(`${Math.abs(d) > TOLERANCE ? '!!' : '  '} ${name.padEnd(36)} ${ref.toFixed(1).padStart(7)} ${f(b).toFixed(1).padStart(8)} ${d >= 0 ? '+' : ''}${d.toFixed(1)}`); }
  process.exit(0);
}

const issues = validateTankDraft(tank, model, 't34');
assert.equal(issues.filter(i => i.severity === 'error').length, 0, JSON.stringify(issues));
const before = read('before-bounds.json'), after = read('after-bounds.json');
// Parts added or renamed by the calibration have no baseline value.
const safe = (f: (b: Capture) => number, b: Capture) => { try { return f(b); } catch { return NaN; } };
const errorsOf = (b: Capture) => landmarks.map(([, r, f]) => Math.abs(safe(f, b) - r)).filter(Number.isFinite);
const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const failures = landmarks.filter(([, r, f]) => Math.abs(f(after) - r) > TOLERANCE);

// Geometry checks.
for (let i = 0; i < 5; i++) {
  const id = `left-road-wheel-${i}`;
  assert.ok(near(span(after, id, 1), 0.83, 2e-3) && near(span(after, id, 2), 0.83, 2e-3), `${id} must stay a circular 830 mm wheel`);
  assert.ok(near(mn(after, id, 1), 0.05, 2e-3), `${id} must rest on the inner ground run of the track`);
}
assert.ok(near(topRun(after) - 0.05, c(after, 'left-road-wheel-2', 1) + 0.415, 2e-3), 'Upper run rests on the road wheels');
assert.ok(mx(after, 'lower-hull-tub', 1) >= lipY(after) - 1e-3, 'Hull sections must join');
assert.ok(mx(after, 'lower-hull-tub', 0) < mn(after, 'right-continuous-track', 0), 'Lower hull stays between the tracks');
assert.ok(Math.min(...shell(after).map(p => p[1])) - roofY(after) < 0.2 && mn(after, 'turret-ring', 1) <= roofY(after) + 1e-3, 'Turret ring must sit on the hull roof');
const muzzleZ = tank.mounts.turretOffset[2] + tank.mounts.gunPivotOffset[2] + tank.mounts.muzzleDistance;
assert.ok(near(mx(after, 'plain-muzzle-ring', 2), muzzleZ, 1e-3), `Muzzle spawn ${muzzleZ} must match bore exit ${mx(after, 'plain-muzzle-ring', 2)}`);
// Driver and cupola on the vehicle's left (+X), bow MG and antenna on the right (-X).
assert.ok(c(after, 'driver-hatch', 0) > 0 && c(after, 'commander-cupola', 0) > 0 && c(after, 'hull-mg-ball', 0) < 0 && c(after, 'radio-antenna', 0) < 0, 'Crew fittings on the correct sides');

// Gameplay values are preserved from the baseline (commit beef116).
assert.deepEqual(tank.durability, {health: 270, trackHealth: 130, armorSummary: {front: 45, side: 45, rear: 40, turret: 52}});
assert.deepEqual(tank.traverse, {turretSpeed: 0.45, gunSpeed: 0.09, maxElevationDeg: 30, maxDepressionDeg: 5});
assert.equal(tank.weapons.caliber, 76);

const fmt = (v: number) => Number.isFinite(v) ? v.toFixed(2) : '—';
const row = ([n, r, f]: Landmark) => `| ${n} | ${r} | ${fmt(safe(f, before))} | ${f(after).toFixed(2)} | ${Math.abs(f(after) - r).toFixed(2)} |`;
const report = `# T-34/76 model 1943 rendered landmark verification

Fixed cameras; pixels in the 1200 × 1600 Bradford drawing, 152 px/m in every view.
Acceptance tolerance: ${TOLERANCE} px (79 mm), for game-scale proportions.

| Landmark | Reference | Before | After | Final error |
|---|---:|---:|---:|---:|
${landmarks.map(row).join('\n')}

${landmarks.length - failures.length}/${landmarks.length} pass. Mean error: ${mean(errorsOf(before)).toFixed(2)} → ${mean(errorsOf(after)).toFixed(2)} px. Maximum final error: ${Math.max(...errorsOf(after)).toFixed(2)} px.

Reported but not accepted (cross-view conflict in the drawing, see README):

| Landmark | Reference | Before | After | Difference |
|---|---:|---:|---:|---:|
${informational.map(row).join('\n')}

Schema, circular 830 mm wheels, wheel/track contact, upper run on the road wheels, hull joint and
width, turret ring seating, crew-fitting sides, muzzle/spawn alignment and unchanged gameplay values
pass. Armour coverage is checked by
\`node --import tsx --test --test-isolation=none src/tanks/t34/armor.test.ts\`.
`;
fs.writeFileSync(new URL('./measurements.md', import.meta.url), report);
console.log(report);
if (failures.length) {
  console.error(`Landmarks outside ${TOLERANCE} px:\n${failures.map(([n, r, f]) => `  ${n}: ${f(after).toFixed(2)} vs ${r}`).join('\n')}`);
  process.exitCode = 1;
}
