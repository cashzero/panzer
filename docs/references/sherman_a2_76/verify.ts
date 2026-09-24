// Verifies the M4A2(76)W model against landmarks read independently from the
// Dyer drawing, plus geometry and gameplay-value checks.
//   node docs/references/sherman_a2_76/capture.mjs after && npx tsx docs/references/sherman_a2_76/verify.ts
//   npx tsx docs/references/sherman_a2_76/verify.ts --landmarks [label]   (signed residuals only)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTankDraft} from '../../../src/tank-editor/validation';
import type {TankModelSpec, TankSpec} from '../../../src/tanks/core/types';
import modelJson from '../../../src/tanks/sherman_a2_76/model.json';
import tankJson from '../../../src/tanks/sherman_a2_76/tank.json';

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
// Vertex queries for the sloped glacis and deck that an AABB cannot describe.
const hull = (b: Capture) => b.vertices['m4a2-large-hatch-welded-hull'];
const roofY = (b: Capture) => Math.max(...hull(b).map(p => p[1]));
const roofFrontZ = (b: Capture) => Math.max(...hull(b).filter(p => near(p[1], roofY(b))).map(p => p[2]));
const nose = (b: Capture) => hull(b).reduce((a, p) => (p[2] > a[2] || (near(p[2], a[2]) && p[1] > a[1]) ? p : a));
// Z of the upper glacis where it crosses the sponson lip (Y 1.333 in the drawing).
const glacisAt = (b: Capture, y: number) => { const n = nose(b), t = (y - n[1]) / (roofY(b) - n[1]); return n[2] + t * (roofFrontZ(b) - n[2]); };
const deckRear = (b: Capture) => { const top = hull(b).filter(p => p[1] > roofY(b) - 0.6); return top.reduce((a, p) => (p[2] < a[2] ? p : a)); };
const wheelZ = (b: Capture, bogie: number) => [1, -1].map(i => c(b, `left-bogie-${bogie}-tire-${i}`, 2));

// Drawing pixels (1200 x 1800 Dyer scan), 150 px/m in every view (views.ts).
const sx = (z: number) => 668 - z * 150, sy = (y: number) => 577 - y * 150;
const tx = (z: number) => 659 - z * 150, ty = (x: number) => 880 + x * 150;
const fx = (x: number) => 316 + x * 150, fy = (y: number) => 1719 - y * 150;
const ry = (y: number) => 1720 - y * 150;
type Landmark = [name: string, reference: number, measure: (b: Capture) => number];
const landmarks: Landmark[] = [
  ['Side: track front', 213, b => sx(mx(b, 'left-continuous-track', 2))],
  ['Side: front fender tip', 228, b => sx(mx(b, 'left-front-fender', 2))],
  ['Side: glacis at sponson lip', 298, b => sx(glacisAt(b, 1.333))],
  ['Side: glacis/roof junction', 410, b => sx(roofFrontZ(b))],
  ['Side: hull roof', 266, b => sy(roofY(b))],
  ['Side: side plate lower edge', 373.5, b => sy(Math.min(...hull(b).filter(p => p[2] < 2.3).map(p => p[1])))],
  ['Side: deck rear corner Z', 1085, b => sx(deckRear(b)[2])],
  ['Side: deck rear corner Y', 332, b => sy(deckRear(b)[1])],
  ['Side: hull rear plate', 1105, b => sx(mn(b, 'm4a2-large-hatch-welded-hull', 2))],
  ['Side: turret roof', 148, b => sy(mx(b, 't23-single-cast-shell', 1))],
  ['Side: turret lower edge', 253, b => sy(mn(b, 't23-single-cast-shell', 1))],
  ['Side: bustle rear', 877, b => sx(mn(b, 't23-single-cast-shell', 2))],
  ['Side: rotor shield face', 484, b => sx(mx(b, 'm62-rounded-rotor-shield', 2))],
  ['Side: gun axis', 212, b => sy(c(b, 'm1-76mm-barrel', 1))],
  ['Side: muzzle', 31, b => sx(mx(b, '76mm-open-muzzle', 2))],
  ['Side: thread protector height', 24, b => span(b, 'thread-protector', 1) * 150],
  ['Side: cupola centre', 718, b => sx(c(b, 'commander-vision-cupola', 2))],
  ['Side: cupola top', 112, b => sy(mx(b, 'commander-hatch-crown', 1))],
  ['Side: sprocket centre Z', 272, b => sx(c(b, 'left-drive-sprocket-hub', 2))],
  ['Side: sprocket centre Y', 451, b => sy(c(b, 'left-drive-sprocket-hub', 1))],
  ['Side: idler centre Z', 1034.5, b => sx(c(b, 'left-rear-idler-hub', 2))],
  ['Side: idler centre Y', 461, b => sy(c(b, 'left-rear-idler-hub', 1))],
  ['Side: front bogie', 413, b => sx(c(b, 'left-bogie-0-cast-housing', 2))],
  ['Side: middle bogie', 638, b => sx(c(b, 'left-bogie-1-cast-housing', 2))],
  ['Side: rear bogie', 860, b => sx(c(b, 'left-bogie-2-cast-housing', 2))],
  ['Side: foremost road wheel', 345.5, b => sx(Math.max(...wheelZ(b, 0)))],
  ['Side: rearmost road wheel', 924.5, b => sx(Math.min(...wheelZ(b, 2)))],
  ['Side: road wheel centre height', 515, b => sy(c(b, 'left-bogie-0-tire-1', 1))],
  ['Top: hull front', 212, b => tx(mx(b, 'rounded-differential-housing', 2))],
  ['Top: upper hull width', 412, b => span(b, 'm4a2-large-hatch-welded-hull', 0) * 150],
  ['Top: turret front', 493.5, b => tx(mx(b, 't23-single-cast-shell', 2))],
  ['Top: bustle rear', 868.5, b => tx(mn(b, 't23-single-cast-shell', 2))],
  ['Top: muzzle', 23, b => tx(mx(b, '76mm-open-muzzle', 2))],
  ['Top: cupola centre Z', 706, b => tx(c(b, 'commander-vision-cupola', 2))],
  ['Top: cupola centre X', 809, b => ty(c(b, 'commander-vision-cupola', 0))],
  ['Top: loader hatch Z', 705, b => tx(c(b, 'loader-oval-hatch', 2))],
  ['Top: loader hatch X', 953, b => ty(c(b, 'loader-oval-hatch', 0))],
  ['Top: driver hatches Z', 452, b => tx(c(b, 'left-large-oval-hatch', 2))],
  ['Top: co-driver hatch X', 784, b => ty(Math.min(c(b, 'left-large-oval-hatch', 0), c(b, 'right-large-oval-hatch', 0)))],
  ['Top: driver hatch X', 970, b => ty(Math.max(c(b, 'left-large-oval-hatch', 0), c(b, 'right-large-oval-hatch', 0)))],
  ['Top: antenna Z', 814, b => tx(c(b, 'antenna-base', 2))],
  ['Top: antenna X', 803, b => ty(c(b, 'antenna-base', 0))],
  ['Front: track outside span', 395, b => (mx(b, 'right-continuous-track', 0) - mn(b, 'left-continuous-track', 0)) * 150],
  ['Front: upper hull width', 408, b => span(b, 'm4a2-large-hatch-welded-hull', 0) * 150],
  ['Front: turret width', 321, b => span(b, 't23-single-cast-shell', 0) * 150],
  ['Front: turret roof', 1289, b => fy(mx(b, 't23-single-cast-shell', 1))],
  ['Front: gun axis', 1354, b => fy(c(b, 'm1-76mm-barrel', 1))],
  ['Front: bow MG X', 234, b => fx(c(b, 'bow-mg-ball-mount', 0))],
  ['Front: bow MG Y', 1488, b => fy(c(b, 'bow-mg-ball-mount', 1))],
  ['Front: right headlight X', 169.5, b => fx(Math.min(c(b, 'left-headlamp-lens', 0), c(b, 'right-headlamp-lens', 0)))],
  ['Front: left headlight X', 457, b => fx(Math.max(c(b, 'left-headlamp-lens', 0), c(b, 'right-headlamp-lens', 0)))],
  ['Front: headlight Y', 1479.5, b => fy(c(b, 'left-headlamp-lens', 1))],
  ['Front: rotor shield width', 205, b => span(b, 'm62-rounded-rotor-shield', 0) * 150],
  ['Front: rotor shield height', 87, b => span(b, 'm62-rounded-rotor-shield', 1) * 150],
  ['Rear: upper hull width', 405, b => span(b, 'm4a2-large-hatch-welded-hull', 0) * 150],
  ['Rear: turret roof', 1293.5, b => ry(mx(b, 't23-single-cast-shell', 1))],
];

// Reported only: this drawing's track is drawn about 0.12 m thick, so its upper
// run and suspension sit 0.05-0.09 m higher than the calibrated M4 running gear
// (98 mm shoes) that this model shares. See README.
const informational: Landmark[] = [
  ['Side: track top run', 390, b => sy(mx(b, 'left-continuous-track', 1))],
];

const TOLERANCE = 12;
const labelArg = process.argv[3] ?? 'after';
if (process.argv[2] === '--landmarks') {
  const b = read(`${labelArg}-bounds.json`);
  for (const [name, ref, f] of [...landmarks, ...informational]) { const d = f(b) - ref; console.log(`${Math.abs(d) > TOLERANCE ? '!!' : '  '} ${name.padEnd(34)} ${ref.toFixed(1).padStart(7)} ${f(b).toFixed(1).padStart(8)} ${d >= 0 ? '+' : ''}${d.toFixed(1)}`); }
  process.exit(0);
}

const issues = validateTankDraft(tank, model, 'sherman_a2_76');
assert.equal(issues.filter(i => i.severity === 'error').length, 0, JSON.stringify(issues));
const before = read('before-bounds.json'), after = read('after-bounds.json');
const errorsOf = (b: Capture) => landmarks.map(([, r, f]) => Math.abs(f(b) - r));
const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
const failures = landmarks.filter(([, r, f]) => Math.abs(f(after) - r) > TOLERANCE);

// Geometry checks.
for (const id of ['left-bogie-0-tire-1', 'left-bogie-2-tire--1']) {
  assert.ok(near(span(after, id, 1), 0.508, 1e-4) && near(span(after, id, 2), 0.508, 1e-4), `${id} must stay a circular 508 mm wheel`);
  assert.ok(near(mn(after, id, 1), 0.098, 1e-4), `${id} must rest on the inner ground run of the track`);
}
assert.ok(mx(after, 'lower-hull-tub', 1) >= mn(after, 'm4a2-large-hatch-welded-hull', 1), 'Hull sections must join');
assert.ok(mn(after, 't23-single-cast-shell', 1) <= roofY(after) + 0.1, 'Turret must sit on the hull roof');
const muzzleZ = tank.mounts.turretOffset[2] + tank.mounts.gunPivotOffset[2] + tank.mounts.muzzleDistance;
assert.ok(near(mx(after, '76mm-open-muzzle', 2), muzzleZ, 1e-3), `Muzzle spawn ${muzzleZ} must match bore exit ${mx(after, '76mm-open-muzzle', 2)}`);
// Crew positions: commander, bow gunner and antenna on the vehicle's right (-X).
assert.ok(c(after, 'commander-vision-cupola', 0) < 0 && c(after, 'bow-mg-ball-mount', 0) < 0 && c(after, 'antenna-base', 0) < 0, 'Right-side fittings must be on -X');

// Gameplay values are preserved from the baseline (commit 650af41).
assert.deepEqual(tank.durability, {health: 260, trackHealth: 150, armorSummary: {front: 100, side: 38, rear: 38, turret: 89}});
assert.deepEqual(tank.traverse, {turretSpeed: 0.42, gunSpeed: 0.1, maxElevationDeg: 25, maxDepressionDeg: 10});
assert.equal(tank.weapons.caliber, 76);
assert.equal(tank.weapons.reloadTime, 5000);
assert.deepEqual(tank.weapons.ammo.AP.historicalPenetration?.points.map(p => p.penetration), [109, 100, 88, 77]);
assert.deepEqual(tank.mobility, {horsepower: 410, weight: 33, maxSpeed: 12, maxReverseSpeed: 2, acceleration: 3.9037878787878784, deceleration: 9, trackWidth: 2.62, turnRateLimit: 0.52, rotationalInertia: 2.5});

const row = ([n, r, f]: Landmark) => `| ${n} | ${r} | ${f(before).toFixed(2)} | ${f(after).toFixed(2)} | ${Math.abs(f(after) - r).toFixed(2)} |`;
const report = `# M4A2(76)W rendered landmark verification

Fixed cameras; pixels in the 1200 × 1800 Dyer drawing, 150 px/m in every view.
Acceptance tolerance: ${TOLERANCE} px (80 mm), for game-scale proportions.

| Landmark | Reference | Before | After | Final error |
|---|---:|---:|---:|---:|
${landmarks.map(row).join('\n')}

${landmarks.length - failures.length}/${landmarks.length} pass. Mean error: ${mean(errorsOf(before)).toFixed(2)} → ${mean(errorsOf(after)).toFixed(2)} px. Maximum final error: ${Math.max(...errorsOf(after)).toFixed(2)} px.

Reported but not accepted (track drawn thicker than the shared M4 running gear, see README):

| Landmark | Reference | Before | After | Difference |
|---|---:|---:|---:|---:|
${informational.map(row).join('\n')}

Schema, circular 508 mm wheels, wheel/track contact, hull joint, turret seating, right-side crew
fittings, muzzle/spawn alignment and unchanged gameplay values pass. Armour coverage is checked by
\`node --import tsx --test --test-isolation=none src/tanks/sherman_a2_76/armor.test.ts\`.
`;
fs.writeFileSync(new URL('./measurements.md', import.meta.url), report);
console.log(report);
if (failures.length) {
  console.error(`Landmarks outside ${TOLERANCE} px:\n${failures.map(([n, r, f]) => `  ${n}: ${f(after).toFixed(2)} vs ${r}`).join('\n')}`);
  process.exitCode = 1;
}
