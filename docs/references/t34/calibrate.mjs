// Reproducible migration. Inputs MUST be the original, uncalibrated JSON files
// (baseline commit beef116). Passes accumulate: pass N applies passes 1..N.
//   node calibrate.mjs <original-model.json> <original-tank.json> <output-directory> [pass]
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
const [mp, tp, out, passArg] = process.argv.slice(2);
if (!mp || !tp || !out) throw Error('Provide original model, original tank and output directory');
const LAST_PASS = 3;
const pass = Number(passArg ?? LAST_PASS);
const m = JSON.parse(fs.readFileSync(mp)), t = JSON.parse(fs.readFileSync(tp));
const r6 = v => Math.round(v * 1e6) / 1e6;
const v6 = a => a.map(r6);
const sides = [['left', -1], ['right', 1]];   // model ids: "left" parts sit at -X
const node = (slot, id) => { const n = m.slots[slot].find(q => q.id === id); if (!n) throw Error(`missing ${slot}/${id}`); return n; };
const plateOf = id => { const p = t.armorModel.plates.find(q => q.id === id); if (!p) throw Error(`missing plate ${id}`); return p; };
const thick = id => plateOf(id).armorThickness;
const mirrorX = n => { if (n.position) n.position[0] = -n.position[0]; if (n.rotation) { n.rotation[1] = -n.rotation[1]; n.rotation[2] = -n.rotation[2]; } };

// Drawing datums in metres (Bradford drawing, 152 px/m, see views.ts).
// Hull: side plates end at the sponson/fender line, 41° sloped sides, 30° glacis.
const ROOF_Y = 1.56, LIP_Y = 1.125, BELLY_Y = 0.372, NOSE_Y = 0.773, REAR_BEND_Y = 0.895;
const ROOF_HALF = 0.905, LIP_HALF = 1.29, TUB_HALF = 0.9;
const GLACIS_TOP_Z = 1.638, GLACIS_RUN = 1.702;          // dZ per metre of drop
const glacisZ = y => GLACIS_TOP_Z + (ROOF_Y - y) * GLACIS_RUN;
const REAR_TOP_Z = -2.216, REAR_RUN = 1 / 1.123;           // upper rear plate
const rearZ = y => REAR_TOP_Z - (ROOF_Y - y) * REAR_RUN;
const BELLY_FRONT_Z = 2.44, BELLY_REAR_Z = -2.5;
// Running gear: centres [Z, Y] and radii.
const WHEEL_Y = 0.465, WHEEL_R = 0.415, TRACK_T = 0.05;
const WHEEL_Z = [2.02, 1.079, 0.033, -0.882, -1.803];
const IDLER = {z: 2.829, y: 0.658, r: 0.267}, SPROCKET = {z: -2.572, y: 0.612, r: 0.306};
// Turret: ring centre at world Z 0.55; casting from Y 1.72 to 2.423.
const TURRET = [0, 1.66, 0.55], SHELL_BOTTOM = 0.06, SHELL_TOP = 0.763;
const turretLocal = ([x, y, z]) => [x, y - TURRET[1], z - TURRET[2]];

// Planar armour plates. Corners run p0→p1 along the lower edge and p3←p2 along
// the upper edge; thickness goes on local X (no 10 mm dead band on that axis),
// the outer face on the rendered surface. Trapezoids are split into strips.
function quadPlate(id, name, [p0, p1, p2, p3], armorThickness, parent, outward, {strips = 1, t: half = 0.035, zone = parent === 'turret' ? 'turret' : 'hull'} = {}) {
  const V = a => new THREE.Vector3(...a);
  const out = [];
  for (let i = 0; i < strips; i++) {
    const f0 = i / strips, f1 = (i + 1) / strips;
    const a = V(p0).lerp(V(p3), f0), b = V(p1).lerp(V(p2), f0), c = V(p1).lerp(V(p2), f1), d = V(p0).lerp(V(p3), f1);
    const across = b.clone().add(c).sub(a).sub(d).multiplyScalar(0.5), up = d.clone().add(c).sub(a).sub(b).multiplyScalar(0.5);
    const v = across.clone().normalize();
    const n = new THREE.Vector3().crossVectors(across, up).normalize();
    if (n.dot(V(outward)) < 0) n.negate();
    const u = new THREE.Vector3().crossVectors(n, v).normalize();
    const width = Math.max(a.distanceTo(b), d.distanceTo(c));
    const height = Math.abs(up.dot(u));
    const centre = a.clone().add(b).add(c).add(d).multiplyScalar(0.25).addScaledVector(n, -half);
    const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(n, v, u), 'XYZ');
    out.push({id: strips > 1 ? `${id}-${i}` : id, name: strips > 1 ? `${name} ${i}` : name, zone, halfExtents: v6([half, width / 2 + 0.005, height / 2 + 0.005]), position: v6(centre.toArray()), rotation: v6([e.x, e.y, e.z]), armorThickness, parent});
  }
  return out;
}

// Track outline: convex hull of the wheels, idler and sprocket (the T-34 upper
// run rests on the road wheels), outer = radius + shoe, inner = radius.
function hull2(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function beltLoop(extra, samples = 24) {
  const pts = [];
  const add = (z, y, r) => { for (let i = 0; i < samples; i++) { const a = (i / samples) * Math.PI * 2; pts.push([z + Math.cos(a) * r, y + Math.sin(a) * r]); } };
  for (const z of WHEEL_Z) add(z, WHEEL_Y, WHEEL_R + extra);
  add(IDLER.z, IDLER.y, IDLER.r + extra); add(SPROCKET.z, SPROCKET.y, SPROCKET.r + extra);
  let loop = hull2(pts);
  // The hull bridges idler and sprocket above the road wheels; the upper run
  // instead rests on each wheel, so replace that span with the wheel-top arcs.
  const top = loop.map((a, i) => [i, a, loop[(i + 1) % loop.length]]).filter(([, a, b]) => a[1] > WHEEL_Y + 0.3 && b[1] > WHEEL_Y + 0.3)
    .reduce((best, s) => (Math.hypot(s[2][0] - s[1][0], s[2][1] - s[1][1]) > Math.hypot(best[2][0] - best[1][0], best[2][1] - best[1][1]) ? s : best));
  const arcs = [];
  for (const z of [...WHEEL_Z].sort((a, b) => b - a)) for (let i = 0; i <= 6; i++) { const a = Math.PI / 3 + (i / 6) * Math.PI / 3; arcs.push([z + Math.cos(a) * (WHEEL_R + extra), WHEEL_Y + Math.sin(a) * (WHEEL_R + extra)]); }
  loop = [...loop.slice(0, top[0] + 1), ...arcs, ...loop.slice(top[0] + 1)];
  // Drop near-collinear points on the straight runs.
  return loop.filter((q, i) => { const a = loop.at(i - 1), b = loop[(i + 1) % loop.length]; return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) > 1e-6; });
}
function shoes(loop, x0, x1, pitch = 0.172, length = 0.14, depth = 0.032) {
  const vertices = [], faces = [];
  const segs = loop.map((a, i) => { const b = loop[(i + 1) % loop.length]; return {a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1])}; });
  const total = segs.reduce((s, q) => s + q.len, 0), count = Math.round(total / pitch), step = total / count;
  const at = d => { for (const s of segs) { if (d <= s.len) { const f = d / s.len; return {p: [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f], dir: [(s.b[0] - s.a[0]) / s.len, (s.b[1] - s.a[1]) / s.len]}; } d -= s.len; } return at(0); };
  const pattern = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 5, 1], [0, 4, 5], [1, 6, 2], [1, 5, 6], [2, 7, 3], [2, 6, 7], [3, 4, 0], [3, 7, 4]];
  for (let k = 0; k < count; k++) {
    const {p, dir} = at(k * step + step / 2);
    // Loop is counter-clockwise in (Z, Y); outward normal is to the right of dir.
    const n = [dir[1], -dir[0]];
    const s0 = [p[0] - dir[0] * length / 2, p[1] - dir[1] * length / 2], s1 = [p[0] + dir[0] * length / 2, p[1] + dir[1] * length / 2];
    const inner = q => [q[0] - n[0] * depth, q[1] - n[1] * depth];
    const base = vertices.length;
    const i0 = inner(s0), i1 = inner(s1);
    vertices.push([x0, i0[1], i0[0]], [x1, i0[1], i0[0]], [x1, i1[1], i1[0]], [x0, i1[1], i1[0]], [x0, s0[1], s0[0]], [x1, s0[1], s0[0]], [x1, s1[1], s1[0]], [x0, s1[1], s1[0]]);
    for (const f of pattern) faces.push(f.map(i => base + i));
  }
  return {vertices: vertices.map(v6), faces};
}

if (pass >= 1) {
  // ---- Hull -------------------------------------------------------------
  const upper = node('hull', 'sloped-upper-hull');
  const lipFront = glacisZ(LIP_Y), lipRear = rearZ(LIP_Y);
  upper.vertices = [[-LIP_HALF, LIP_Y, lipRear], [LIP_HALF, LIP_Y, lipRear], [LIP_HALF, LIP_Y, lipFront], [-LIP_HALF, LIP_Y, lipFront],
    [-ROOF_HALF, ROOF_Y, REAR_TOP_Z], [ROOF_HALF, ROOF_Y, REAR_TOP_Z], [ROOF_HALF, ROOF_Y, GLACIS_TOP_Z], [-ROOF_HALF, ROOF_Y, GLACIS_TOP_Z]].map(v6);
  // Lower hull between the tracks: glacis continues to the nose, lower glacis
  // to the belly, lower rear plate from the rear bend. Outline x is -Z.
  const tub = node('hull', 'lower-hull-tub');
  tub.depth = 2 * TUB_HALF; tub.position = [-TUB_HALF, 0, 0];
  tub.shape.outline = [[-lipFront, LIP_Y], [-glacisZ(NOSE_Y), NOSE_Y], [-BELLY_FRONT_Z, BELLY_Y], [-BELLY_REAR_Z, BELLY_Y], [-rearZ(REAR_BEND_Y), REAR_BEND_Y], [-lipRear, LIP_Y]].map(v6);

  const glacisAngle = Math.atan(1 / GLACIS_RUN);        // above horizontal
  const glacisN = [0, Math.cos(glacisAngle), Math.sin(glacisAngle)];
  const onGlacis = (x, y, lift) => v6([x, y + glacisN[1] * lift, glacisZ(y) + glacisN[2] * lift]);
  // The T-34 driver sits on the left (+X), the bow gunner on the right (-X);
  // the old model had them swapped. Driver hatch: front view X -0.07…0.51.
  const hatchY = 1.30;
  Object.assign(node('hull', 'driver-hatch'), {size: [0.58, 0.045, 0.7], position: onGlacis(0.225, hatchY, 0.0225), rotation: [r6(glacisAngle), 0, 0]});
  for (const [s, k] of [['left', -1], ['right', 1]]) {
    const upSlope = [0, Math.sin(glacisAngle), -Math.cos(glacisAngle)];
    Object.assign(node('hull', `driver-hatch-visor-${s}`), {position: v6([0.225 + k * 0.15, hatchY + upSlope[1] * 0.2 + glacisN[1] * 0.05, glacisZ(hatchY) + upSlope[2] * 0.2 + glacisN[2] * 0.05]), rotation: [r6(glacisAngle), 0, 0]});
  }
  Object.assign(node('hull', 'hull-mg-ball'), {position: [-0.515, 1.227, r6(glacisZ(1.227) + 0.06)]});
  Object.assign(node('hull', 'hull-mg-barrel'), {height: 0.36, position: [-0.515, 1.227, r6(glacisZ(1.227) + 0.24)]});
  const mgIndex = m.slots.hull.findIndex(n => n.id === 'hull-mg-barrel');
  m.slots.hull.splice(mgIndex + 1, 0, {id: 'hull-mg-armoured-cover', type: 'box', size: [0.44, 0.05, 0.62], position: onGlacis(-0.515, 1.227, 0.02), rotation: [r6(glacisAngle), 0, 0], materialRole: 'hullPrimary'});

  // Engine deck and rear plate fittings (plan x 242–512).
  const deck = h => r6(ROOF_Y + h / 2);
  Object.assign(node('hull', 'engine-access-cover'), {size: [0.66, 0.034, 0.82], position: [0, deck(0.034), -0.95]});
  Object.assign(node('hull', 'engine-hatch-handle'), {position: [0, r6(ROOF_Y + 0.054), -1.05]});
  Object.assign(node('hull', 'rear-radiator-grille'), {size: [1.41, 0.036, 0.47], position: [0, deck(0.036), -1.71]});
  const ribs = node('hull', 'rear-grille-ribs');
  Object.assign(ribs, {count: 13, position: [-0.66, r6(ROOF_Y + 0.036 + 0.0125), -1.71], step: [0.11, 0, 0]});
  for (const [s, k] of sides) {
    Object.assign(node('hull', `${s}-engine-side-intake`), {size: [0.105, 0.035, 1.27], position: [k * 0.87, deck(0.035), -0.805]});
    Object.assign(node('hull', `${s}-side-intake-slats`), {count: 15, position: [k * 0.87, r6(ROOF_Y + 0.035 + 0.0125), -1.4], step: [0, 0, 0.085]});
    node('hull', `${s}-side-intake-slats`).child.size = [0.1, 0.025, 0.025];
  }
  m.slots.hull = m.slots.hull.filter(n => !['spare-track-carrier', 'left-fender-toolbox', 'toolbox-lid'].includes(n.id));
  const rearAngle = Math.atan(1 / REAR_RUN);            // above horizontal
  const rearN = [0, Math.cos(rearAngle), -Math.sin(rearAngle)], rearUp = [0, Math.sin(rearAngle), Math.cos(rearAngle)];
  const hatchC = [0, 1.316, rearZ(1.316)];
  Object.assign(node('hull', 'rear-service-hatch'), {position: v6([0, hatchC[1] + rearN[1] * 0.018, hatchC[2] + rearN[2] * 0.018]), rotation: [r6(-(Math.PI / 2 - rearAngle)), 0, 0]});
  Object.assign(node('hull', 'rear-service-hatch-hinge'), {position: v6([0, hatchC[1] + rearUp[1] * 0.26 + rearN[1] * 0.025, hatchC[2] + rearUp[2] * 0.26 + rearN[2] * 0.025]), rotation: [r6(-(Math.PI / 2 - rearAngle)), 0, 0]});

  for (const [s, k] of sides) {
    // Exhausts at X ±0.485 (rear view), armoured covers on the rear plate.
    Object.assign(node('hull', `${s}-exhaust-armored-collar`), {height: 0.3, position: [k * 0.485, 1.25, -2.6]});
    Object.assign(node('hull', `${s}-rear-exhaust`), {position: [k * 0.485, 1.19, -2.75]});
    const dir = [0, Math.cos(-2.12), Math.sin(-2.12)];
    node('hull', `${s}-exhaust-opening`).position = v6([k * 0.485, 1.19 + dir[1] * 0.16, -2.75 + dir[2] * 0.16]);
    // Fenders along the sponson lip (front view X 0.89–1.53).
    Object.assign(node('hull', `${s}-fender`), {size: [0.64, 0.038, 5.04], position: [k * 1.207, 1.106, -0.08]});
    Object.assign(node('hull', `${s}-front-mudguard`), {size: [0.64, 0.038, 0.8], position: [k * 1.207, 1.057, 2.83], rotation: [0.12, 0, 0]});
    Object.assign(node('hull', `${s}-rear-mudguard`), {size: [0.64, 0.038, 0.43], position: [k * 1.207, 1.01, -2.795], rotation: [-0.45, 0, 0]});
    Object.assign(node('hull', `${s}-front-tow-hook`), {position: [k * 0.5, 0.985, r6(glacisZ(0.985) + 0.06)]});
    node('hull', `${s}-rear-tow-hook`).position = [k * 0.76, 0.7, -2.74];
    // Hand rails on the sloped sides ahead of the fuel drums.
    Object.assign(node('hull', `${s}-hull-grab-rail`), {position: [k * 1.13, 1.33, 0.45]});
    Object.assign(node('hull', `${s}-grab-rail-post-front`), {size: [0.04, 0.025, 0.025], position: [k * 1.115, 1.33, 0.83]});
    Object.assign(node('hull', `${s}-grab-rail-post-rear`), {size: [0.04, 0.025, 0.025], position: [k * 1.115, 1.33, 0.07]});
  }
  // Headlights on both front corners (front view X -1.25 / +1.22, Y 1.50) on
  // brackets down to the fender; the old model had only one.
  const lamp = ['left-headlight-housing', 'left-headlight-lens', 'headlight-bracket'].map(id => node('hull', id));
  Object.assign(lamp[0], {position: [-1.2, 1.5, 1.78]});
  Object.assign(lamp[1], {position: [-1.2, 1.5, 1.858]});
  Object.assign(lamp[2], {size: [0.06, 0.29, 0.07], position: [-1.2, 1.27, 1.76]});
  lamp[2].id = 'left-headlight-bracket';
  const lampIndex = m.slots.hull.indexOf(lamp[2]);
  m.slots.hull.splice(lampIndex + 1, 0, ...lamp.map(n => { const c = structuredClone(n); c.id = c.id.replace('left-', 'right-'); mirrorX(c); return c; }));
  // Radio antenna on the hull's right front (side view x 790, front view x 95).
  const antennaParts = m.slots.turret.filter(n => ['turret-antenna-base', 'radio-antenna'].includes(n.id));
  m.slots.turret = m.slots.turret.filter(n => !antennaParts.includes(n));
  const [aBase, aWhip] = antennaParts;
  Object.assign(aBase, {id: 'hull-antenna-base', type: 'box', size: [0.1, 0.15, 0.1], position: [-1.25, 1.24, 1.70]});
  for (const k of ['radiusTop', 'radiusBottom', 'height', 'radialSegments']) delete aBase[k];
  Object.assign(aWhip, {height: r6(2.836 - 1.316), position: [-1.25, r6((2.836 + 1.316) / 2), 1.70]});
  m.slots.hull.splice(m.slots.hull.findIndex(n => n.id === 'right-headlight-bracket') + 1, 0, aBase, aWhip);
  // Fuel drums: one on the vehicle's left (+X), two on the right (-X).
  const drum = (from, to, z) => {
    for (const suffix of ['fuel-drum', 'drum-band-front', 'drum-band-rear', 'drum-cradle', 'drum-filler']) {
      const n = node('hull', `${from}-${suffix}`); n.id = `${to}-${suffix}`;
    }
  };
  drum('left-rear', 'tmp-rear', 0); drum('right-forward', 'left-forward', 0); drum('right-rear', 'right-rear', 0); drum('tmp-rear', 'left-rear', 0);
  for (const [prefix, x, z] of [['right-rear', 1.26, -1.855], ['left-rear', -1.26, -1.855], ['left-forward', -1.26, -0.793]]) {
    Object.assign(node('hull', `${prefix}-fuel-drum`), {radiusTop: 0.175, radiusBottom: 0.175, height: 0.97, position: [x, 1.526, z]});
    Object.assign(node('hull', `${prefix}-drum-band-front`), {radiusTop: 0.182, radiusBottom: 0.182, position: [x, 1.526, z + 0.33]});
    Object.assign(node('hull', `${prefix}-drum-band-rear`), {radiusTop: 0.182, radiusBottom: 0.182, position: [x, 1.526, z - 0.33]});
    Object.assign(node('hull', `${prefix}-drum-cradle`), {size: [0.3, 0.235, 0.7], position: [x, 1.2425, z]});
    node('hull', `${prefix}-drum-filler`).position = [x, 1.713, z + 0.19];
  }

  // ---- Running gear ----------------------------------------------------
  const outer = beltLoop(TRACK_T), inner = beltLoop(0);
  for (const [slot, s, k] of [['tracksLeft', 'left', -1], ['tracksRight', 'right', 1]]) {
    const nodes = m.slots[slot];
    const belt = nodes.find(n => n.id === `${s}-continuous-track`);
    belt.shape = {outline: outer.map(([z, y]) => v6([-z, y])), holes: [inner.map(([z, y]) => v6([-z, y])).reverse()]};
    WHEEL_Z.forEach((z, i) => { nodes.find(n => n.id === `${s}-road-wheel-${i}`).position = v6([k * 1.2, WHEEL_Y, z]); });
    for (const [prefix, c] of [['front-idler', IDLER], ['rear-drive-sprocket', SPROCKET]]) {
      const rim = nodes.find(n => n.id === `${s}-${prefix}-rim`), hub = nodes.find(n => n.id === `${s}-${prefix}-hub`);
      const [oz, oy] = [hub.position[2], hub.position[1]];
      const scale = c.r / Math.max(...rim.shape.outline.map(p => Math.hypot(...p)));
      rim.shape.outline = rim.shape.outline.map(p => v6(p.map(v => v * scale)));
      rim.shape.holes = rim.shape.holes.map(h => h.map(p => v6(p.map(v => v * scale))));
      rim.position = v6([rim.position[0], c.y, c.z]); hub.position = v6([hub.position[0], c.y, c.z]);
      for (const sp of nodes.filter(n => n.id.startsWith(`${s}-${prefix}-spoke-`))) {
        sp.position = v6([sp.position[0], c.y + (sp.position[1] - oy) * scale, c.z + (sp.position[2] - oz) * scale]);
        sp.size = v6([sp.size[0], sp.size[1] * scale, sp.size[2]]);
      }
    }
    const tread = nodes.find(n => n.id === `${s}-batched-tread-shoes`);
    Object.assign(tread, shoes(outer, r6(k * 1.2 - 0.286), r6(k * 1.2 + 0.286)));
  }

  // ---- Turret ----------------------------------------------------------
  t.mounts.turretOffset = TURRET;
  const bottom = [[0.55, 1.095], [0.961, 0.25], [0.87, -0.6], [0.57, -1.096]];
  const top = [[0.45, 0.641], [0.706, 0.15], [0.64, -0.45], [0.45, -0.793]];
  const ring = pts => [...pts, ...[...pts].reverse().map(([x, z]) => [-x, z])];   // +X front → rear, then -X rear → front
  const planB = ring(bottom), planT = ring(top);
  const turret = m.slots.turret.findIndex(n => n.id === 'model-1943-hexagonal-turret');
  // Same winding as the turret.faceted_bustle helper it replaces, which only
  // allowed one uniform top scale; this casting needs separate top and bottom plans.
  const area = planB.reduce((a, p, i) => { const q = planB[(i + 1) % planB.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (area > 0) throw Error('turret plan must run clockwise in (x, z)');
  const count = planB.length, faces = [];
  for (let i = 1; i < count - 1; i++) faces.push([0, i + 1, i], [count, count + i, count + i + 1]);
  for (let i = 0; i < count; i++) { const j = (i + 1) % count; faces.push([i, j, count + j], [i, count + j, count + i]); }
  m.slots.turret[turret] = {id: 'model-1943-hexagonal-turret', type: 'polyhedron', vertices: [...planB.map(([x, z]) => [x, SHELL_BOTTOM, z]), ...planT.map(([x, z]) => [x, SHELL_TOP, z])].map(v6), faces, materialRole: 'hullPrimary'};
  Object.assign(node('turret', 'turret-ring'), {height: 0.16, position: [0, -0.02, 0]});
  // Commander's cupola on the left (+X) of the roof, loader's hatch on the right.
  const cupola = [0.28, 0], oldCupola = [-0.39, -0.3], cupolaScale = 0.332 / 0.285;
  Object.assign(node('turret', 'commander-cupola-base'), {radiusTop: 0.34, radiusBottom: 0.34, position: [cupola[0], 0.7855, cupola[1]]});
  Object.assign(node('turret', 'commander-cupola'), {radiusTop: 0.332, radiusBottom: 0.332, position: [cupola[0], 0.893, cupola[1]]});
  Object.assign(node('turret', 'commander-hatch'), {radiusTop: 0.3, radiusBottom: 0.3, height: 0.06, position: [cupola[0], 1.008, cupola[1]]});
  node('turret', 'commander-hatch-handle').position = [cupola[0], 1.047, cupola[1]];
  for (const n of m.slots.turret.filter(q => q.id.startsWith('cupola-vision-'))) {
    const dx = -(n.position[0] - oldCupola[0]), dz = n.position[2] - oldCupola[1];
    n.position = v6([cupola[0] + dx * cupolaScale, 0.92, cupola[1] + dz * cupolaScale]);
    n.rotation = [0, r6(-n.rotation[1]), 0];
  }
  const loader = [-0.296, 0.03];
  node('turret', 'loader-hatch').position = [loader[0], 0.781, loader[1]];
  node('turret', 'loader-hatch-hinge').position = [loader[0], 0.817, loader[1] - 0.23];
  node('turret', 'loader-hatch-handle').position = [loader[0], 0.819, loader[1] + 0.02];
  Object.assign(node('turret', 'rear-ventilator-dome'), {position: [0, 0.8, -0.514]});
  Object.assign(node('turret', 'commander-periscope'), {position: [0.355, 0.833, 0.496]});
  Object.assign(node('turret', 'loader-periscope'), {position: [-0.355, 0.833, 0.496]});
  Object.assign(node('turret', 'periscope-window-left'), {position: [-0.355, 0.863, 0.556]});
  Object.assign(node('turret', 'periscope-window-right'), {position: [0.355, 0.863, 0.556]});
  for (const [s, k] of sides) {
    Object.assign(node('turret', `${s}-turret-handrail`), {size: [0.026, 0.026, 0.49], position: [k * 0.83, 0.465, -0.42]});
    node('turret', `${s}-handrail-front-stay`).position = [k * 0.8, 0.465, -0.19];
    node('turret', `${s}-handrail-rear-stay`).position = [k * 0.8, 0.465, -0.65];
    node('turret', `${s}-pistol-port`).position = [k * 0.83, 0.222, 0.378];
  }

  // ---- Gun: axis Y 2.062, mantlet front Z 1.796, sleeve to 2.164, muzzle 3.862.
  t.mounts.gunPivotOffset = [0, r6(2.062 - TURRET[1]), 0.85];
  const pivotZ = TURRET[2] + 0.85, local = z => r6(z - pivotZ);
  const mantlet = node('gun', 'rounded-f34-mantlet');
  mantlet.shape.outline = mantlet.shape.outline.map(([x, y]) => v6([x - 0.036, y]));
  Object.assign(mantlet, {depth: 1.2, position: [-0.6, 0, 0]});
  Object.assign(node('gun', 'recoil-housing'), {size: [0.61, 0.5, 0.427], position: [0, -0.09, local(1.9505)]});
  const rootEnd = local(2.164) + 0.19;
  Object.assign(node('gun', 'barrel-root'), {radiusTop: 0.075, radiusBottom: 0.075, height: 0.19, position: [0, 0, r6(local(2.164) + 0.095)]});
  const ringStart = local(3.809), muzzle = local(3.862);
  Object.assign(node('gun', 'f34-barrel'), {radiusTop: 0.047, radiusBottom: 0.066, height: r6(ringStart - rootEnd), position: [0, 0, r6((ringStart + rootEnd) / 2)]});
  Object.assign(node('gun', 'plain-muzzle-ring'), {radiusTop: 0.055, radiusBottom: 0.055, height: r6(muzzle - ringStart), position: [0, 0, r6((muzzle + ringStart) / 2)]});
  node('gun', 'muzzle-bore').position = [0, 0, r6(muzzle + 0.003)];
  t.mounts.muzzleDistance = r6(muzzle);
  // Coaxial DT on the right of the gun.
  node('gun', 'coaxial-dt-opening').position = [-0.2, -0.035, r6(local(2.164) + 0.005)];

  // ---- Armour ----------------------------------------------------------
  const T = id => thick(id);
  const hullPlates = [
    ...quadPlate('hull-upper-glacis', 'Hull Upper Glacis', [[-LIP_HALF, LIP_Y, lipFront], [LIP_HALF, LIP_Y, lipFront], [ROOF_HALF, ROOF_Y, GLACIS_TOP_Z], [-ROOF_HALF, ROOF_Y, GLACIS_TOP_Z]], T('hull-upper-glacis'), 'hull', [0, 1, 1], {strips: 3}),
    ...quadPlate('hull-glacis-nose', 'Hull Glacis Nose', [[-TUB_HALF, NOSE_Y, glacisZ(NOSE_Y)], [TUB_HALF, NOSE_Y, glacisZ(NOSE_Y)], [TUB_HALF, LIP_Y, lipFront], [-TUB_HALF, LIP_Y, lipFront]], T('hull-upper-glacis'), 'hull', [0, 1, 1]),
    ...quadPlate('hull-lower-glacis', 'Hull Lower Glacis', [[-TUB_HALF, BELLY_Y, BELLY_FRONT_Z], [TUB_HALF, BELLY_Y, BELLY_FRONT_Z], [TUB_HALF, NOSE_Y, glacisZ(NOSE_Y)], [-TUB_HALF, NOSE_Y, glacisZ(NOSE_Y)]], T('hull-lower-glacis'), 'hull', [0, -1, 1]),
    ...quadPlate('hull-rear', 'Hull Rear', [[-LIP_HALF, LIP_Y, lipRear], [LIP_HALF, LIP_Y, lipRear], [ROOF_HALF, ROOF_Y, REAR_TOP_Z], [-ROOF_HALF, ROOF_Y, REAR_TOP_Z]], T('hull-rear'), 'hull', [0, 1, -1], {strips: 2}),
    ...quadPlate('hull-rear-middle', 'Hull Rear Middle', [[-TUB_HALF, REAR_BEND_Y, rearZ(REAR_BEND_Y)], [TUB_HALF, REAR_BEND_Y, rearZ(REAR_BEND_Y)], [TUB_HALF, LIP_Y, lipRear], [-TUB_HALF, LIP_Y, lipRear]], T('hull-rear'), 'hull', [0, 1, -1]),
    ...quadPlate('hull-rear-lower', 'Hull Rear Lower', [[-TUB_HALF, BELLY_Y, BELLY_REAR_Z], [TUB_HALF, BELLY_Y, BELLY_REAR_Z], [TUB_HALF, REAR_BEND_Y, rearZ(REAR_BEND_Y)], [-TUB_HALF, REAR_BEND_Y, rearZ(REAR_BEND_Y)]], T('hull-rear'), 'hull', [0, -1, -1]),
    ...quadPlate('hull-roof', 'Hull Roof', [[-ROOF_HALF, ROOF_Y, -0.25], [ROOF_HALF, ROOF_Y, -0.25], [ROOF_HALF, ROOF_Y, GLACIS_TOP_Z], [-ROOF_HALF, ROOF_Y, GLACIS_TOP_Z]], T('hull-roof'), 'hull', [0, 1, 0]),
    ...quadPlate('hull-engine-deck', 'Hull Engine Deck', [[-ROOF_HALF, ROOF_Y, REAR_TOP_Z], [ROOF_HALF, ROOF_Y, REAR_TOP_Z], [ROOF_HALF, ROOF_Y, -0.25], [-ROOF_HALF, ROOF_Y, -0.25]], T('hull-engine-deck'), 'hull', [0, 1, 0]),
  ];
  for (const [s, k] of sides) {
    // Sloped sides: three height strips, each trimmed to the glacis and rear
    // plate at its mid height.
    for (let i = 0; i < 3; i++) {
      const y0 = LIP_Y + (ROOF_Y - LIP_Y) * i / 3, y1 = LIP_Y + (ROOF_Y - LIP_Y) * (i + 1) / 3, ym = (y0 + y1) / 2;
      const hx = y => LIP_HALF - (LIP_HALF - ROOF_HALF) * (y - LIP_Y) / (ROOF_Y - LIP_Y);
      const z0 = rearZ(ym), z1 = glacisZ(ym), X = side => k * side;
      hullPlates.push(...quadPlate(`hull-side-${s}-${i}`, `Hull Side ${s[0].toUpperCase()}${s.slice(1)} ${i}`, [[X(hx(y0)), y0, z1], [X(hx(y0)), y0, z0], [X(hx(y1)), y1, z0], [X(hx(y1)), y1, z1]], T('hull-side-left'), 'hull', [k, 1, 0]));
    }
    hullPlates.push(...quadPlate(`lower-hull-side-${s}`, `Lower Hull Side ${s[0].toUpperCase()}${s.slice(1)}`, [[k * TUB_HALF, BELLY_Y + 0.05, 2.9], [k * TUB_HALF, BELLY_Y + 0.05, -2.7], [k * TUB_HALF, LIP_Y, -2.7], [k * TUB_HALF, LIP_Y, 2.9]], T('lower-hull-side-left'), 'hull', [k, 0, 0]));
  }
  const trackPlate = s => ({...plateOf(`track-${s}`), halfExtents: [0.275, 0.4875, 3.037], position: [s === 'left' ? -1.2 : 1.2, 0.4875, 0.109]});
  // Turret faces of the casting (turret-local), matching the old plate ids.
  const tb = planB.map(([x, z]) => [x, SHELL_BOTTOM, z]), tt = planT.map(([x, z]) => [x, SHELL_TOP, z]);
  const face = (id, name, i, j, thickness, outward) => quadPlate(id, name, [tb[i], tb[j], tt[j], tt[i]], thickness, 'turret', outward, {strips: 4});
  const n2 = count / 2;   // indices: 0..3 +X front→rear, 4..7 -X rear→front
  const turretPlates = [
    ...face('turret-front', 'Turret Front', count - 1, 0, T('turret-front'), [0, 0.3, 1]),
    ...face('turret-cheek-right', 'Turret Cheek Right', 0, 1, T('turret-cheek-right'), [1, 0, 1]),
    ...face('turret-side-right', 'Turret Side Right', 1, 2, T('turret-side-right'), [1, 0, 0]),
    ...face('turret-rear-cheek-right', 'Turret Rear Cheek Right', 2, 3, T('turret-rear-cheek-right'), [1, 0, -1]),
    ...face('turret-rear', 'Turret Rear', 3, n2, T('turret-rear'), [0, 0, -1]),
    ...face('turret-rear-cheek-left', 'Turret Rear Cheek Left', n2, n2 + 1, T('turret-rear-cheek-left'), [-1, 0, -1]),
    ...face('turret-side-left', 'Turret Side Left', n2 + 1, n2 + 2, T('turret-side-left'), [-1, 0, 0]),
    ...face('turret-cheek-left', 'Turret Cheek Left', n2 + 2, n2 + 3, T('turret-cheek-left'), [-1, 0, 1]),
    {...plateOf('turret-roof'), halfExtents: [0.706, 0.025, 0.722], position: [0, r6(SHELL_TOP - 0.025), -0.076]},
  ];
  const gunPlates = [
    // The rounded mantlet front is covered by chords along its profile.
    ...(() => {
      const prof = [[-0.29, 0.156], [-0.22, 0.336], [0, 0.396], [0.23, 0.336], [0.29, 0.156]];
      return prof.slice(0, -1).flatMap(([y0, z0], i) => { const [y1, z1] = prof[i + 1];
        return quadPlate(i === 1 ? 'mantlet' : `mantlet-arc-${i}`, i === 1 ? 'Mantlet' : `Mantlet Arc ${i}`, [[-0.6, y0, z0], [0.6, y0, z0], [0.6, y1, z1], [-0.6, y1, z1]], T('mantlet'), 'gunGroup', [0, 0, 1], {zone: 'gun'}); });
    })(),
    {id: 'gun-sleeve', name: 'Gun Sleeve', zone: 'gun', halfExtents: [0.305, 0.25, 0.2135], position: [0, -0.09, local(1.9505)], rotation: [0, 0, 0], armorThickness: T('mantlet'), parent: 'gunGroup'},
  ];
  t.armorModel.plates = [...hullPlates, trackPlate('left'), trackPlate('right'), ...turretPlates, ...gunPlates].map(p => ({...p, halfExtents: v6(p.halfExtents), position: v6(p.position), rotation: v6(p.rotation)}));
}

if (pass >= 2) {
  const T = id => thick(id);
  const tidy = p => ({...p, halfExtents: v6(p.halfExtents), position: v6(p.position), rotation: v6(p.rotation)});
  // A single headlight, on the vehicle's left (+X); at the right front corner
  // the drawing has the antenna base and the drum end instead.
  m.slots.hull = m.slots.hull.filter(n => !['left-headlight-housing', 'left-headlight-lens', 'left-headlight-bracket'].includes(n.id));
  for (const id of ['right-headlight-housing', 'right-headlight-lens', 'right-headlight-bracket']) node('hull', id).position[2] = r6(node('hull', id).position[2] - 0.04);
  const rearAngle = Math.atan(1 / REAR_RUN), rearN = [Math.cos(rearAngle), -Math.sin(rearAngle)];
  const pipe = [Math.cos(-2.12), Math.sin(-2.12)];
  for (const [s, k] of sides) {
    // Front mudguards run level to Z 2.85, then turn down to Z 3.3 / Y 0.78.
    const dz = 0.45, dy = 1.106 - 0.78;
    Object.assign(node('hull', `${s}-fender`), {size: [0.64, 0.038, 5.45], position: [k * 1.207, 1.106, 0.125]});
    Object.assign(node('hull', `${s}-front-mudguard`), {size: [0.64, 0.038, r6(Math.hypot(dz, dy))], position: [k * 1.207, r6(1.106 - dy / 2), r6(2.85 + dz / 2)], rotation: [r6(Math.atan2(dy, dz)), 0, 0]});
    // Hand loops low on the sloped side (side view x 520–770, y 325–340).
    Object.assign(node('hull', `${s}-hull-grab-rail`), {size: [0.025, 0.025, 1.5], position: [k * 1.26, 1.18, 0.78]});
    node('hull', `${s}-grab-rail-post-front`).position = [k * 1.245, 1.18, 1.52];
    node('hull', `${s}-grab-rail-post-rear`).position = [k * 1.245, 1.18, 0.04];
    // Exhaust covers lie on the sloped rear plate; the pipe opens at Z -2.79, Y 1.15.
    const collar = node('hull', `${s}-exhaust-armored-collar`);
    for (const key of ['radiusTop', 'radiusBottom', 'height', 'radialSegments']) delete collar[key];
    Object.assign(collar, {type: 'box', size: [0.3, 0.12, 0.45], position: v6([k * 0.485, 1.24 + rearN[0] * 0.06, rearZ(1.24) + rearN[1] * 0.06]), rotation: [r6(rearAngle - Math.PI / 2), 0, 0]});
    Object.assign(node('hull', `${s}-rear-exhaust`), {height: 0.2, position: [k * 0.485, 1.2, -2.7]});
    node('hull', `${s}-exhaust-opening`).position = v6([k * 0.485, 1.2 + pipe[0] * 0.1, -2.7 + pipe[1] * 0.1]);
  }
  // Drum brackets are straps, not solid cradles.
  for (const n of m.slots.hull.filter(q => q.id.endsWith('-drum-cradle'))) n.size = [0.3, 0.235, 0.05];
  // Bow MG barrel reaches Z 2.70 (side view x 942).
  Object.assign(node('hull', 'hull-mg-barrel'), {height: 0.46, position: [-0.515, 1.227, r6(glacisZ(1.227) + 0.29)]});

  // Turret: the cast rear is rounded, not a straight chamfer; three extra rings
  // push the rear out 0.05–0.12 m (side view y 220, 180, 150). The pistol port
  // sits 0.05 m lower.
  const bottom = [[0.55, 1.095], [0.961, 0.25], [0.87, -0.6], [0.57, -1.096]];
  const top = [[0.45, 0.641], [0.706, 0.15], [0.64, -0.45], [0.45, -0.793]];
  const bulge = [[0.254, 0.053], [0.518, 0.118], [0.715, 0.092]];
  const lerp = (a, b, f) => a.map(([x, z], i) => [x + (b[i][0] - x) * f, z + (b[i][1] - z) * f]);
  const levels = [[SHELL_BOTTOM, bottom], ...bulge.map(([y, push]) => {
    const pts = lerp(bottom, top, (y - SHELL_BOTTOM) / (SHELL_TOP - SHELL_BOTTOM));
    // Rear corner and rear face move aft; the rear-cheek point half as much.
    return [y, pts.map(([x, z], i) => [x, z - push * [0, 0, 0.5, 1][i]])];
  }), [SHELL_TOP, top]];
  const ring = pts => [...pts, ...[...pts].reverse().map(([x, z]) => [-x, z])];
  const rings = levels.map(([y, pts]) => ring(pts).map(([x, z]) => [x, y, z]));
  const count = rings[0].length, faces = [], topBase = (rings.length - 1) * count;
  for (let i = 1; i < count - 1; i++) faces.push([0, i + 1, i], [topBase, topBase + i, topBase + i + 1]);
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < count; i++) {
    const j = (i + 1) % count, a = r * count, b = (r + 1) * count;
    faces.push([a + i, a + j, b + j], [a + i, b + j, b + i]);
  }
  const shell = node('turret', 'model-1943-hexagonal-turret');
  shell.vertices = rings.flat().map(v6); shell.faces = faces;
  for (const [s] of sides) node('turret', `${s}-pistol-port`).position[1] = 0.17;
  // Turret face armour now follows each ring band.
  const n2 = count / 2;
  const facesDef = [
    ['turret-front', 'Turret Front', count - 1, 0, [0, 0.3, 1]], ['turret-cheek-right', 'Turret Cheek Right', 0, 1, [1, 0, 1]],
    ['turret-side-right', 'Turret Side Right', 1, 2, [1, 0, 0]], ['turret-rear-cheek-right', 'Turret Rear Cheek Right', 2, 3, [1, 0, -1]],
    ['turret-rear', 'Turret Rear', 3, n2, [0, 0, -1]], ['turret-rear-cheek-left', 'Turret Rear Cheek Left', n2, n2 + 1, [-1, 0, -1]],
    ['turret-side-left', 'Turret Side Left', n2 + 1, n2 + 2, [-1, 0, 0]], ['turret-cheek-left', 'Turret Cheek Left', n2 + 2, n2 + 3, [-1, 0, 1]],
  ];
  const faceThickness = id => t.armorModel.plates.find(p => p.id === `${id}-0`).armorThickness;   // pass 1 strip
  const turretFaces = facesDef.flatMap(([id, name, i, j, outward]) => rings.slice(0, -1).flatMap((lo, r) =>
    quadPlate(`${id}-${r}`, `${name} ${r}`, [lo[i], lo[j], rings[r + 1][j], rings[r + 1][i]], faceThickness(id), 'turret', outward, {strips: r === 0 ? 2 : 1, t: r === rings.length - 2 ? 0.02 : 0.035})));   // thin top band keeps thickness on X
  // Rounder mantlet (side view top Y 2.24–2.29, front view height 0.64),
  // covered by chords along its profile.
  const mantlet = node('gun', 'rounded-f34-mantlet');
  const prof = [[-0.33, 0.1], [-0.28, 0.25], [-0.16, 0.355], [0, 0.396], [0.14, 0.36], [0.22, 0.27], [0.25, 0.14]];
  mantlet.shape.outline = [...prof.map(([y, z]) => [-z, y]), [0.034, 0.25], [0.034, -0.33]].map(v6);
  const mantletPlates = prof.slice(0, -1).flatMap(([y0, z0], i) => { const [y1, z1] = prof[i + 1];
    return quadPlate(i === 2 ? 'mantlet' : `mantlet-arc-${i}`, i === 2 ? 'Mantlet' : `Mantlet Arc ${i}`, [[-0.6, y0, z0], [0.6, y0, z0], [0.6, y1, z1], [-0.6, y1, z1]], T('mantlet'), 'gunGroup', [0, 0, 1], {zone: 'gun'}); });
  const keep = t.armorModel.plates.filter(p => p.parent === 'hull' || p.id === 'turret-roof');
  t.armorModel.plates = [...keep.filter(p => p.parent === 'hull'), ...turretFaces, plateOf('turret-roof'), ...mantletPlates, plateOf('gun-sleeve')].map(tidy);
}

if (pass >= 3) {
  // F-34 gun mount, re-measured from the drawing's side/front views and photos
  // of preserved vehicles (gun-local metres, gun axis at 0). The old mount was a
  // 1.2 m slab with a 0.61 m box in front, which read as one big block.
  const tidy = p => ({...p, halfExtents: v6(p.halfExtents), position: v6(p.position), rotation: v6(p.rotation)});
  // Mantlet: a horizontal half-cylinder, R 0.25 about (Z 0.145, Y -0.03),
  // sloping back into the turret face below Y -0.15, with domed ends (1.14 m
  // overall in the front view).
  // The mantlet stops at the casting's lower edge (local Y -0.342) instead of
  // hanging over the turret-ring gap.
  const R = 0.25, C = [0.145, -0.03], HALF = 0.5, BOTTOM = SHELL_BOTTOM + TURRET[1] - 2.062;
  const arcAt = step => { const pts = []; for (let a = 110; a >= -40; a -= step) pts.push([C[0] + R * Math.cos(a * Math.PI / 180), C[1] + R * Math.sin(a * Math.PI / 180)]); return pts; };
  const arc = arcAt(5);   // fine enough that the curve does not band
  const profile = [...arc, [0.22, -0.31], [0.2, BOTTOM], [0.03, BOTTOM], [0.03, arc[0][1]]];   // [Z, Y]
  Object.assign(node('gun', 'rounded-f34-mantlet'), {shape: {outline: profile.map(([z, y]) => v6([-z, y]))}, depth: 2 * HALF, position: [-HALF, 0, 0]});
  const capIndex = m.slots.gun.findIndex(n => n.id === 'rounded-f34-mantlet') + 1;
  m.slots.gun.splice(capIndex, 0, ...[-1, 1].map(k => ({id: `mantlet-end-cap-${k < 0 ? 'right' : 'left'}`, type: 'sphere', radius: 1, widthSegments: 24, heightSegments: 16, position: v6([k * HALF, C[1], C[0]]), scale: [0.07, R, R], materialRole: 'mantlet'})));   // shallow domes, not capsule ends
  // Armoured sleeve over the recoil cradle: 0.44 m wide, barrel near its top,
  // upper front chamfered down to the vertical lower face; bolted side flanges.
  const sleeve = node('gun', 'recoil-housing');
  for (const key of ['size']) delete sleeve[key];
  Object.assign(sleeve, {type: 'extrude', shape: {outline: [[0.337, 0.125], [0.6, 0.125], [0.758, -0.1], [0.758, -0.31], [0.337, -0.31]].map(([z, y]) => v6([-z, y]))}, depth: 0.44, position: [-0.22, 0, 0], rotation: [0, r6(Math.PI / 2), 0]});
  const fittings = [];
  for (const [s, k] of [['right', -1], ['left', 1]]) {
    fittings.push({id: `sleeve-flange-${s}`, type: 'box', size: [0.04, 0.3, 0.32], position: [k * 0.24, -0.16, 0.53], materialRole: 'mantlet'});
    fittings.push({id: `sleeve-top-bolt-${s}`, type: 'cylinder', radiusTop: 0.018, radiusBottom: 0.018, height: 0.02, radialSegments: 12, position: v6([k * 0.12, 0.135, 0.45]), materialRole: 'steel'});
    for (const y of [-0.13, -0.23]) for (const z of [0.42, 0.62]) fittings.push({id: `sleeve-bolt-${s}-${Math.round(-y * 100)}-${Math.round(z * 100)}`, type: 'cylinder', radiusTop: 0.018, radiusBottom: 0.018, height: 0.02, radialSegments: 12, position: v6([k * 0.27, y, z]), rotation: [0, 0, r6(Math.PI / 2)], materialRole: 'steel'});
  }
  m.slots.gun.splice(m.slots.gun.indexOf(sleeve) + 1, 0, ...fittings);
  // Barrel: r 0.067 tapering to 0.051, exit collar where it leaves the sleeve's
  // chamfer, muzzle band r 0.059 from Z 2.41 to the muzzle at 2.462.
  const muzzle = t.mounts.muzzleDistance;
  Object.assign(node('gun', 'barrel-root'), {id: 'barrel-exit-collar', radiusTop: 0.09, radiusBottom: 0.09, height: 0.08, position: [0, 0, 0.72]});
  Object.assign(node('gun', 'f34-barrel'), {radiusTop: 0.051, radiusBottom: 0.067, height: r6(2.41 - 0.76), position: [0, 0, r6((2.41 + 0.76) / 2)]});
  Object.assign(node('gun', 'plain-muzzle-ring'), {radiusTop: 0.059, radiusBottom: 0.059, height: r6(muzzle - 2.41), position: [0, 0, r6((muzzle + 2.41) / 2)]});
  // Coaxial DT on the mantlet face to the right of the sleeve.
  node('gun', 'coaxial-dt-opening').position = [-0.25, -0.04, 0.392];
  // Armour: chords along the mantlet arc (domed ends included in the width) and
  // a box for the sleeve.
  const prof = [...arcAt(15), [0.22, -0.31]];
  const mantletPlates = prof.slice(0, -1).flatMap(([z1, y1], i) => { const [z0, y0] = prof[i + 1];
    return quadPlate(i === 4 ? 'mantlet' : `mantlet-arc-${i}`, i === 4 ? 'Mantlet' : `Mantlet Arc ${i}`, [[-0.57, y0, z0], [0.57, y0, z0], [0.57, y1, z1], [-0.57, y1, z1]], thick('mantlet'), 'gunGroup', [0, 0, 1], {zone: 'gun'}); });
  // Sleeve: vertical lower front plus the chamfer the barrel exits through.
  const sleevePlate = {...plateOf('gun-sleeve'), halfExtents: [0.24, 0.105, 0.035], position: [0, -0.205, 0.723]};   // thickness on Z: the front face takes the hits
  const chamfer = quadPlate('gun-sleeve-chamfer', 'Gun Sleeve Chamfer', [[-0.24, -0.1, 0.758], [0.24, -0.1, 0.758], [0.24, 0.125, 0.6], [-0.24, 0.125, 0.6]], thick('gun-sleeve'), 'gunGroup', [0, 1, 1], {zone: 'gun'});
  t.armorModel.plates = [...t.armorModel.plates.filter(p => p.parent !== 'gunGroup'), ...mantletPlates, sleevePlate, ...chamfer].map(tidy);
}

fs.writeFileSync(path.join(out, 'model.json'), serializeModel(m));
fs.writeFileSync(path.join(out, 'tank.json'), `${JSON.stringify(t, null, 2)}\n`);
console.log(`Wrote pass ${Math.min(pass, LAST_PASS)} to ${out}`);

// One node per line, matching the other calibrated tanks.
function serializeModel(model) {
  const slots = Object.entries(model.slots).map(([k, nodes]) => `    "${k}": [\n${nodes.map(n => `      ${JSON.stringify(n)}`).join(',\n')}\n    ]`);
  return `{\n  "schemaVersion": ${model.schemaVersion},\n  "slots": {\n${slots.join(',\n')}\n  }\n}\n`;
}
