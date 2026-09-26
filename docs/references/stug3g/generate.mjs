// Reproducible StuG III Ausf. G model generator.
// Pass 0 is the first draft built from landmarks measured on the Doyle drawing
// published by OnWar; later passes apply the corrections found in the
// orthographic overlays, in order.
//   node docs/references/stug3g/generate.mjs [output-directory] [pass]
// The output directory defaults to src/tanks/stug3g. Both JSON files are overwritten.
import fs from 'node:fs';
import path from 'node:path';

const LATEST_PASS = 4;
const out = process.argv[2] ?? 'src/tanks/stug3g';
const PASS = Number(process.argv[3] ?? LATEST_PASS);
if (!Number.isInteger(PASS) || PASS < 0 || PASS > LATEST_PASS) throw Error(`Pass must be 0..${LATEST_PASS}`);

// ---------------------------------------------------------------------------
// Parameters (metres; +Z front, +Y up, +X vehicle left). Values come from the
// drawing at 152 px/m (side views), 156.4 px/m (plan) and 155 px/m (front,
// rear); see README.md for the registration.
// ---------------------------------------------------------------------------
const P = {
  hull: {
    // Pz.Kpfw. III chassis between the tracks: belly, nose and rear plate.
    half: 0.95, bellyY: 0.38, topY: 1.355,
    // Nose profile front to rear in (Z, Y): belly corner, lower nose, upper nose (80 mm), glacis end.
    nose: [[2.434, 0.38], [2.658, 0.89], [2.599, 1.22], [1.71, 1.355]],
    rearZ: -2.63,
    // Engine compartment behind the casemate.
    engine: {frontZ: -0.80, rearTopZ: -2.50, deckY: 1.72, half: 0.95},
    fender: {innerX: 0.95, outerX: 1.49, frontZ: 2.626, tipY: 1.30, rearZ: -2.72},
  },
  casemate: {
    roofY: 2.04, roofHalf: 0.955, roofFrontZ: 1.283, roofRearZ: -0.638,
    // Upper front plate from the roof down to the driver's plate, then the driver's plate to the hull top.
    kneeZ: 1.566, kneeY: 1.632, footZ: 1.61,
    rearFootY: 1.737, rearFootZ: -0.776,
    // Panniers over the tracks: sloped top from the roof edge down to the outer wall.
    panHalf: 1.51, panEdgeY: 1.80,
    // Side boxes continuing the panniers along the engine compartment.
    sideBox: {rearZ: -1.64, topY: 1.75},
  },
  track: {
    x: 1.27, width: 0.40, thickness: 0.09,
    wheelR: 0.257, wheelY: 0.349,
    stations: [1.447, 0.868, 0.283, -0.296, -0.875, -1.461],
    rollers: [1.316, 0.033, -1.026], rollerY: 0.97, rollerR: 0.155,
    sprocket: [2.253, 0.730], sprocketR: 0.44,
    idler: [-2.105, 0.809], idlerR: 0.37,
    shoePitch: 0.121,
  },
  skirts: {x: 1.56, bottomX: 1.56, topY: 1.921, bottomY: 0.638, joints: [2.056, 1.043, 0.023, -0.997, -2.010], frontTopY: 1.454},
  gun: {
    // Traversing mount on the hull (the "turret" slot) and the trunnions above it.
    mount: [-0.113, 1.36, 1.40], pivotY: 0.232,
    muzzle: 2.639, barrelStart: 0.80, barrelRootR: 0.068, barrelMuzzleR: 0.056,
    brakeLength: 0.37, brakeR: 0.125,
    // Saukopf sections, gun frame: [z, top, bottom, half width].
    saukopf: [[0.87, 0.092, -0.072, 0.11], [0.77, 0.151, -0.09, 0.15], [0.574, 0.22, -0.164, 0.22], [0.245, 0.29, -0.20, 0.28], [0.10, 0.375, -0.23, 0.305]],
  },
  detail: {
    cupola: {x: 0.62, z: -0.168, r: 0.30, height: 0.19},
    mgShield: {x: -0.55, z: 0.10},
    spareWheels: [[0.66, -2.00], [-0.66, -2.00]],
    muffler: 'cylinder',
    hangerFromY: null, // null: level hangers at the rail height
    frontFittings: false,
    shades: {},
  },
};

// Overlay corrections. Each pass documents what the previous capture showed.
if (PASS >= 1) {
  // Pass 1 (before.png, verify.ts --landmarks): the plan view puts the skirts
  // 36 px (0.23 m) wider, and the front view shows them splayed out at the top
  // (x=105/617 at y=1740, 127/590 at y=1960): hang them from 1.66 m at the rail
  // to 1.49 m at the lower edge.
  Object.assign(P.skirts, {x: 1.66, bottomX: 1.49});
  // The muffler is the wide box low on the rear plate (rear view 765..1062 x
  // 1822..1872, side view x 1095..1110), not a cylinder on the upper rear plate.
  P.detail.muffler = 'box';
}
if (PASS >= 2) {
  // Pass 2 (after-pass-1 obliques): the level hangers floated above the sloped
  // pannier tops. Run them as brackets from the pannier wall up to the rail.
  P.detail.hangerFromY = 1.74;
}
if (PASS >= 3) {
  // Pass 3 (front view read at 4x after review: "the front looks like it is
  // missing something"): the casemate front carries the bolted 30 mm appliqué
  // blocks either side of the Saukopf (x 208..287 and 392..505, y 1760..1812),
  // the driver's armoured visor housing with five bolts above it (x 410..492,
  // y 1776..1815), the barrel travel lock on the nose (front x 336..345, side
  // x 300..307 up to y 292), the Notek lamp, C-shaped lifting hooks at the
  // pannier corners (x 195 and 515, y 1780), a crowbar on the nose, the
  // coaxial MG port in the Saukopf (x 371, y 1726) and the dark bore of the brake.
  P.detail.frontFittings = true;
}
if (PASS >= 4) {
  // Pass 4 (tank select, front view, after review: "the whole front is one
  // colour"): every front face lights the same way, so plates, fittings and the
  // cast mantlet merged into one flat tan. Darken the parts that sit in shadow
  // or were fitted separately: the nose under the overhanging casemate and
  // fenders, the bolted appliqué and visor housing, and the cast Saukopf.
  P.detail.shades = {
    'stug-lower-hull': 0.72, 'nose-appliqué-plate': 0.8, 'left-brake-access-hatch': 0.84, 'right-brake-access-hatch': 0.84,
    'left-front-tow-bracket': 0.76, 'right-front-tow-bracket': 0.76, 'left-front-fender': 0.8, 'right-front-fender': 0.8,
    'left-track-fender': 0.8, 'right-track-fender': 0.8,
    'casemate-front-applique-left': 0.86, 'casemate-front-applique-right': 0.86, 'driver-visor-housing': 0.76,
    'saukopf-mantlet': 0.8, 'commander-cupola': 0.88, 'loader-mg-shield': 0.84,
  };
}

// ---------------------------------------------------------------------------
// Small vector and node helpers.
// ---------------------------------------------------------------------------
const HALF_PI = Math.PI / 2;
const sub = (a, b) => a.map((v, i) => v - b[i]);
const addv = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(...a);
const unit = a => mul(a, 1 / len(a));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const box = (id, size, position, materialRole = 'hullPrimary', rotation) =>
  ({id, type: 'box', size, position, ...(rotation ? {rotation} : {}), materialRole});
const cyl = (id, radiusTop, radiusBottom, height, position, rotation, materialRole = 'hullPrimary', radialSegments) =>
  ({id, type: 'cylinder', radiusTop, radiusBottom, height, position, ...(rotation ? {rotation} : {}), materialRole, ...(radialSegments ? {radialSegments} : {})});
const sphere = (id, position, scale, materialRole = 'hullPrimary') => ({id, type: 'sphere', radius: 1, position, scale, materialRole});
const group = (id, position, children) => ({id, type: 'group', position, children});
const extrude = (id, outline, depth, position, rotation, materialRole = 'hullPrimary', holes) =>
  ({id, type: 'extrude', shape: {outline, ...(holes ? {holes} : {})}, depth, position, ...(rotation ? {rotation} : {}), materialRole});
const circle = (r, n = 32, phase = 0) => Array.from({length: n}, (_, i) => {
  const a = phase + i * 2 * Math.PI / n;
  return [r * Math.cos(a), r * Math.sin(a)];
});
// Profile in world (Z, Y) turned into an extrude outline rotated by +90 deg about Y.
const zyOutline = pts => pts.map(([z, y]) => [-z, y]);
const ALONG_X = [0, HALF_PI, 0];
const AXIS_X = [0, 0, HALF_PI];
const AXIS_Z = [HALF_PI, 0, 0];

// Rotation that maps the local +Y axis onto `n` (unit), as Euler XYZ.
function eulerFromYAxis(n) {
  const y = unit(n);
  const ref = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const x = unit(cross(y, cross(ref, y)));
  const z = cross(x, y);
  return eulerFromBasis(x, y, z);
}
// Euler XYZ (three.js convention) from orthonormal basis columns.
function eulerFromBasis(x, y, z) {
  const m11 = x[0], m12 = y[0], m13 = z[0], m22 = y[1], m23 = z[1], m32 = y[2], m33 = z[2], m21 = x[1];
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-m23, m33), ry, Math.atan2(-m12, m11)];
  return [Math.atan2(m32, m22), ry, 0];
}

// Polyhedron builder: every triangle is oriented against a desired outward normal.
class Mesh {
  constructor() { this.vertices = []; this.faces = []; }
  vertex(p) { this.vertices.push(p); return this.vertices.length - 1; }
  tri(a, b, c, outward) {
    const [pa, pb, pc] = [a, b, c].map(i => this.vertices[i]);
    const n = cross(sub(pb, pa), sub(pc, pa));
    if (len(n) < 1e-10) return;
    this.faces.push(dot(n, outward) >= 0 ? [a, b, c] : [a, c, b]);
  }
  quad(a, b, c, d, outward) { this.tri(a, b, c, outward); this.tri(a, c, d, outward); }
  // Planar, possibly concave polygon (boundary order), triangulated by ear clipping.
  polygon(ids, outward) {
    const n = unit(outward);
    const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = unit(cross(ref, n)), v = cross(n, u);
    const pts = ids.map(i => [dot(this.vertices[i], u), dot(this.vertices[i], v)]);
    for (const [i, j, k] of earClip(pts)) this.tri(ids[i], ids[j], ids[k], outward);
  }
  node(id, materialRole = 'hullPrimary') {
    const round = v => Math.round(v * 1e6) / 1e6;
    return {id, type: 'polyhedron', vertices: this.vertices.map(p => p.map(round)), faces: this.faces, materialRole};
  }
}
function earClip(pts) {
  const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const sign = Math.sign(area);
  const idx = pts.map((_, i) => i), tris = [];
  const crossAt = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => {
    const d1 = crossAt(a, b, p) * sign, d2 = crossAt(b, c, p) * sign, d3 = crossAt(c, a, p) * sign;
    return d1 > 1e-12 && d2 > 1e-12 && d3 > 1e-12;
  };
  let guard = 0;
  while (idx.length > 3) {
    if (guard++ > 10000) throw Error('Ear clipping failed');
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const c = crossAt(pts[i0], pts[i1], pts[i2]) * sign;
      if (Math.abs(c) < 1e-12) { idx.splice(k, 1); clipped = true; break; }
      if (c < 0) continue;
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inside(pts[j], pts[i0], pts[i1], pts[i2]))) continue;
      tris.push([i0, i1, i2]); idx.splice(k, 1); clipped = true; break;
    }
    if (!clipped) throw Error('Ear clipping found no ear');
  }
  tris.push(idx);
  return tris;
}
function convexBox(mesh, corners) {
  // corners: 8 points; faces follow the usual cube order (0-3 one end, 4-7 other end).
  const ids = corners.map(p => mesh.vertex(p));
  const c = mul(corners.reduce(addv, [0, 0, 0]), 1 / 8);
  const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  for (const q of quads) {
    const center = mul(q.map(i => corners[i]).reduce(addv, [0, 0, 0]), 1 / 4);
    mesh.quad(...q.map(i => ids[i]), sub(center, c));
  }
}

function tangentAngle(A, B) {
  const D = sub(B.c, A.c), L = len(D), d = mul(D, 1 / L), R = [d[1], -d[0]];
  const sb = (A.r - B.r) / L, cb = Math.sqrt(1 - sb * sb);
  return Math.atan2(cb * R[1] + sb * d[1], cb * R[0] + sb * d[0]);
}
function arc(C, a0, a1, step = Math.PI / 18) {
  let sweep = a1 - a0;
  while (sweep < 0) sweep += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(sweep / step));
  return Array.from({length: n + 1}, (_, k) => [C.c[0] + C.r * Math.cos(a0 + sweep * k / n), C.c[1] + C.r * Math.sin(a0 + sweep * k / n)]);
}

// ---------------------------------------------------------------------------
// Hull: Pz.Kpfw. III lower hull, casemate with panniers, engine compartment.
// ---------------------------------------------------------------------------
const H = P.hull, C = P.casemate;
// "left" in node and plate ids is -X, matching the tracksLeft slot used by every tank.
const sides = [['left', -1], ['right', 1]];
const upperFrontRun = (C.kneeZ - C.roofFrontZ) / (C.roofY - C.kneeY); // dz per dy, upper front plate
const lowerFrontRun = (C.footZ - C.kneeZ) / (C.kneeY - H.topY);
const casemateFrontZ = y => (y >= C.kneeY - 1e-9 ? C.roofFrontZ + (C.roofY - y) * upperFrontRun : C.kneeZ + (C.kneeY - y) * lowerFrontRun);
const rearRun = (C.rearFootZ - C.roofRearZ) / (C.roofY - C.rearFootY); // negative: the rear plate leans back at the foot
const casemateRearZ = y => C.roofRearZ + (C.roofY - y) * rearRun;
const panSlope = (C.panHalf - C.roofHalf) / (C.roofY - C.panEdgeY); // dx per dy on the sloped pannier tops
// Outward normals of the planes z = z0 + (y0 - y) * run are (0, run, 1).
const upperFrontNormal = unit([0, upperFrontRun, 1]);
const lowerFrontNormal = unit([0, lowerFrontRun, 1]);
const rearNormal = unit([0, -rearRun, -1]);

// Lower hull: a cross-section extruded along Z with the nose profile at the front.
function lowerHull() {
  const m = new Mesh(), N = H.nose, h = H.half;
  // Profile in (Z, Y): nose points, then the hull top back to the rear plate and the belly.
  const profile = [...N, [H.rearZ, H.topY], [H.rearZ, H.bellyY]];
  const L = profile.map(([z, y]) => m.vertex([-h, y, z])), R = profile.map(([z, y]) => m.vertex([h, y, z]));
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, [z0, y0] = profile[i], [z1, y1] = profile[j];
    m.quad(L[i], L[j], R[j], R[i], [0, z1 - z0, -(y1 - y0)].map(v => -v));
  }
  m.polygon(L, [-1, 0, 0]);
  m.polygon(R, [1, 0, 0]);
  return m.node('stug-lower-hull');
}

// Casemate: cross-section with sloped pannier tops, cut by the two front plates and the rear plate.
function casemate() {
  const half = [[C.roofHalf, C.roofY], [C.panHalf, C.panEdgeY], [C.panHalf, C.kneeY], [C.panHalf, H.topY]];
  const section = [...half.map(([x, y]) => [-x, y]), ...half.slice().reverse().map(([x, y]) => [x, y])];
  const n = section.length;
  const m = new Mesh();
  const front = section.map(([x, y]) => m.vertex([x, y, casemateFrontZ(y)]));
  const rear = section.map(([x, y]) => m.vertex([x, y, casemateRearZ(y)]));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, [x0, y0] = section[i], [x1, y1] = section[j];
    m.quad(front[i], front[j], rear[j], rear[i], [y1 - y0, -(x1 - x0), 0]);
  }
  // Section runs counter-clockwise seen from the front (-X roof edge first, down the -X side).
  const upper = [2, 1, 0, n - 1, n - 2, n - 3];
  m.polygon(upper.map(i => front[i]), upperFrontNormal);
  m.polygon([3, 2, n - 3, n - 4].map(i => front[i]), lowerFrontNormal);
  m.polygon(section.map((_, i) => rear[i]), rearNormal);
  return m.node('stug-casemate');
}

function engineCompartment() {
  const E = H.engine, m = new Mesh();
  convexBox(m, [
    [-E.half, H.topY, E.frontZ], [E.half, H.topY, E.frontZ], [E.half, E.deckY, E.frontZ], [-E.half, E.deckY, E.frontZ],
    [-E.half, H.topY, H.rearZ], [E.half, H.topY, H.rearZ], [E.half, E.deckY, E.rearTopZ], [-E.half, E.deckY, E.rearTopZ],
  ]);
  return m.node('stug-engine-compartment');
}

function hullDetails() {
  const nodes = [];
  const F = H.fender;
  for (const [side, s] of sides) {
    const width = F.outerX - F.innerX, cx = s * (F.innerX + width / 2);
    nodes.push(box(`${side}-track-fender`, [width, 0.012, F.frontZ - 0.25 - F.rearZ], [cx, H.topY - 0.006, (F.frontZ - 0.25 + F.rearZ) / 2]));
    const dz = 0.25, dy = H.topY - F.tipY;
    nodes.push(box(`${side}-front-fender`, [width, 0.012, Math.hypot(dz, dy)], [cx, (H.topY + F.tipY) / 2 - 0.006, F.frontZ - dz / 2], 'hullPrimary', [Math.atan2(dy, dz), 0, 0]));
    // Side boxes continuing the panniers along the engine compartment.
    const SB = C.sideBox, z0 = casemateRearZ(SB.topY) + 0.02;
    nodes.push(box(`${side}-pannier-extension`, [C.panHalf - H.engine.half, SB.topY - H.topY, z0 - SB.rearZ], [s * (H.engine.half + C.panHalf) / 2, (SB.topY + H.topY) / 2, (z0 + SB.rearZ) / 2]));
  }
  // Nose: towing brackets and brake access hatches on the glacis.
  const [, [nz1, ny1], [nz2, ny2]] = H.nose;
  for (const [side, s] of sides) {
    nodes.push(box(`${side}-front-tow-bracket`, [0.06, 0.26, 0.24], [s * 0.72, 1.02, nz1 - 0.05], 'hullPrimary'));
    nodes.push(box(`${side}-brake-access-hatch`, [0.52, 0.03, 0.46], [s * 0.45, H.topY + 0.01, (nz2 + H.nose[3][0]) / 2 - 0.1]));
  }
  nodes.push(box('nose-appliqué-plate', [H.half * 2 - 0.02, (ny2 - ny1) * 0.9, 0.03], [0, (ny1 + ny2) / 2, (nz1 + nz2) / 2 + 0.03], 'hullPrimary', [Math.atan2(nz2 - nz1, ny2 - ny1), 0, 0]));
  // Driver's visor on the casemate front plate (vehicle left, +X).
  const plateTilt = [-Math.atan(lowerFrontRun), 0, 0];
  // Point on the driver's plate, lifted `lift` metres along its normal.
  const onFront = (x, y, lift) => addv([x, y, casemateFrontZ(y)], mul(lowerFrontNormal, lift));
  if (!P.detail.frontFittings) {
    nodes.push(box('driver-vision-visor', [0.34, 0.09, 0.05], [0.52, 1.50, casemateFrontZ(1.50) + 0.02], 'hullPrimary', plateTilt));
  } else {
    // Bolted 30 mm appliqué either side of the gun opening.
    const ym = (H.topY + C.kneeY) / 2, ph = (C.kneeY - H.topY) * Math.hypot(1, lowerFrontRun);
    for (const [tag, x0, x1] of [['left', 0.232, C.roofHalf], ['right', -C.roofHalf, -0.445]]) {
      nodes.push(box(`casemate-front-applique-${tag}`, [x1 - x0, ph, 0.03], onFront((x0 + x1) / 2, ym, 0.015), 'hullPrimary', plateTilt));
    }
    // Driver's armoured visor housing (vehicle left) with its slit and the bolt row above.
    const visorY = 1.43;
    nodes.push(box('driver-visor-housing', [0.53, 0.24, 0.07], onFront(0.61, visorY, 0.03 + 0.035), 'hullPrimary', plateTilt));
    nodes.push(box('driver-vision-visor-slit', [0.26, 0.03, 0.01], onFront(0.61, visorY - 0.01, 0.03 + 0.072), 'darkMetal', plateTilt));
    [0.303, 0.465, 0.606, 0.755, 0.910].forEach((x, i) => nodes.push(cyl(`casemate-front-bolt-${i}`, 0.022, 0.022, 0.025, onFront(x, 1.585, 0.03 + 0.012), eulerFromYAxis(lowerFrontNormal), 'steel', 10)));
    // Barrel travel lock on the nose, folded down under the gun.
    const lockZ = 2.62, lockTop = 1.50;
    nodes.push(box('gun-travel-lock-post', [0.06, lockTop - 1.12, 0.05], [-0.11, (lockTop + 1.12) / 2, lockZ], 'steel'));
    nodes.push(box('gun-travel-lock-clamp', [0.14, 0.06, 0.08], [-0.11, lockTop + 0.02, lockZ], 'steel'));
    // Notek blackout lamp and a crowbar stowed across the upper nose plate.
    nodes.push(box('notek-lamp', [0.09, 0.12, 0.08], [0.01, 1.16, 2.66], 'lamp'));
    const rodA = [-0.65, 1.10, 2.66], rodB = [-0.38, 1.29, 2.62], rod = sub(rodB, rodA);
    nodes.push(cyl('nose-crowbar', 0.014, 0.014, len(rod), mul(addv(rodA, rodB), 0.5), eulerFromYAxis(rod), 'steel', 8));
    // C-shaped lifting hooks at the pannier front corners.
    for (const [side, s] of sides) {
      const hookZ = casemateFrontZ(1.52) + 0.05;
      nodes.push(box(`${side}-lifting-hook-back`, [0.03, 0.10, 0.03], [s * 1.035, 1.52, hookZ], 'steel'));
      nodes.push(box(`${side}-lifting-hook-top`, [0.03, 0.03, 0.08], [s * 1.035, 1.56, hookZ + 0.04], 'steel'));
    }
  }
  // Roof: commander's cupola (left), loader's hatch and MG shield (right), periscopes.
  const cu = P.detail.cupola, roof = C.roofY;
  nodes.push(cyl('commander-cupola', cu.r, cu.r + 0.02, cu.height, [cu.x, roof + cu.height / 2, cu.z], undefined, 'hullPrimary', 28));
  nodes.push(cyl('commander-cupola-hatch', cu.r - 0.05, cu.r - 0.04, 0.04, [cu.x, roof + cu.height + 0.02, cu.z], undefined, 'hullPrimary', 24));
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + (k - 3) * (2 * Math.PI / 7);
    nodes.push(box(`cupola-periscope-${k}`, [0.10, 0.06, 0.05], [cu.x + (cu.r + 0.005) * Math.sin(a), roof + cu.height - 0.06, cu.z + (cu.r + 0.005) * Math.cos(a)], 'darkMetal', [0, a, 0]));
  }
  const M = P.detail.mgShield;
  nodes.push(box('loader-hatch', [0.60, 0.03, 0.52], [M.x, roof + 0.015, M.z - 0.35]));
  nodes.push(box('loader-mg-shield', [0.52, 0.28, 0.02], [M.x, roof + 0.18, M.z + 0.05], 'hullPrimary', [-0.15, 0, 0]));
  nodes.push(cyl('loader-mg-34-barrel', 0.018, 0.018, 0.62, [M.x, roof + 0.25, M.z + 0.30], AXIS_Z, 'darkMetal', 8));
  nodes.push(box('loader-mg-34-receiver', [0.08, 0.10, 0.36], [M.x, roof + 0.24, M.z - 0.08], 'darkMetal'));
  nodes.push(box('gunner-sight-periscope', [0.10, 0.16, 0.10], [0.20, roof + 0.08, 0.55], 'darkMetal'));
  nodes.push(box('roof-ventilator', [0.20, 0.06, 0.20], [-0.20, roof + 0.03, -0.35]));
  // Antenna at the rear of the casemate, vehicle right.
  nodes.push(cyl('antenna-base', 0.04, 0.05, 0.10, [-0.85, roof + 0.05, C.roofRearZ + 0.08], undefined, 'darkMetal', 12));
  nodes.push(cyl('antenna-whip', 0.006, 0.008, 1.40, [-0.85, roof + 0.80, C.roofRearZ + 0.08], undefined, 'darkMetal', 8));
  // Engine deck: hatches, air intakes, spare road wheels under the stowage rack.
  const E = H.engine;
  for (const [side, s] of sides) {
    nodes.push(box(`${side}-engine-deck-hatch`, [0.62, 0.03, 0.85], [s * 0.40, E.deckY + 0.015, -1.30]));
    nodes.push(box(`${side}-air-intake-grille`, [0.34, 0.03, 0.95], [s * (C.panHalf - 0.20), C.sideBox.topY + 0.015, -1.15], 'grille'));
  }
  P.detail.spareWheels.forEach(([x, z], i) => {
    nodes.push(cyl(`spare-road-wheel-${i}-tyre`, 0.257, 0.257, 0.09, [x, E.deckY + 0.05, z], undefined, 'trackRubber', 28));
    nodes.push(cyl(`spare-road-wheel-${i}-disc`, 0.21, 0.21, 0.10, [x, E.deckY + 0.05, z], undefined, 'steel', 24));
  });
  // Stowage rack over the rear deck: a light tube frame.
  const rackZ0 = -1.18, rackZ1 = -2.72, rackY0 = 2.02, rackY1 = 1.92, rh = 0.88;
  for (const [side, s] of sides) {
    nodes.push(box(`${side}-stowage-rack-rail`, [0.03, 0.03, rackZ0 - rackZ1], [s * rh, (rackY0 + rackY1) / 2, (rackZ0 + rackZ1) / 2], 'accessory', [Math.atan2(rackY0 - rackY1, rackZ0 - rackZ1), 0, 0]));
    for (const [end, z, y] of [['front', rackZ0, rackY0], ['rear', rackZ1, rackY1]]) {
      const foot = end === 'front' ? E.deckY : E.deckY - 0.12;
      nodes.push(box(`${side}-stowage-rack-post-${end}`, [0.03, y - foot, 0.03], [s * rh, (y + foot) / 2, z], 'accessory'));
    }
  }
  for (const [end, z, y] of [['front', rackZ0, rackY0], ['rear', rackZ1, rackY1]]) nodes.push(box(`stowage-rack-bar-${end}`, [rh * 2, 0.03, 0.03], [0, y, z], 'accessory'));
  // Rear: muffler across the upper rear plate, tow couplings, idler adjusters.
  if (P.detail.muffler === 'cylinder') nodes.push(cyl('rear-exhaust-muffler', 0.12, 0.12, 1.30, [0, 1.46, H.rearZ - 0.12], AXIS_X, 'darkMetal', 18));
  else nodes.push(box('rear-exhaust-muffler', [1.90, 0.32, 0.08], [0, 1.09, H.rearZ - 0.04], 'darkMetal'));
  for (const [side, s] of sides) {
    nodes.push(cyl(`${side}-exhaust-tailpipe`, 0.04, 0.04, 0.10, [s * 0.30, P.detail.muffler === 'box' ? 0.98 : 1.40, H.rearZ - (P.detail.muffler === 'box' ? 0.13 : 0.26)], AXIS_Z, 'darkMetal', 10));
    nodes.push(box(`${side}-rear-tow-bracket`, [0.06, 0.24, 0.18], [s * 0.72, 0.62, H.rearZ - 0.08], 'hullPrimary'));
  }
  return nodes;
}

// Schurzen: 5 mm plates hung from the panniers, first panel cut to the sloped front.
function skirts() {
  const S = P.skirts, nodes = [];
  const xAt = y => S.bottomX + (y - S.bottomY) / (S.topY - S.bottomY) * (S.x - S.bottomX);
  for (const [side, s] of sides) {
    for (let k = 0; k < S.joints.length - 1; k++) {
      const z0 = S.joints[k] - 0.005, z1 = S.joints[k + 1] + 0.005, t = 0.008;
      // Hexahedron per panel: the first one is cut lower at its leading edge.
      const top0 = k === 0 ? S.frontTopY : S.topY;
      const face = (z, y) => [[s * (xAt(y) - t / 2), y, z], [s * (xAt(y) + t / 2), y, z]];
      const [a0, a1] = face(z0, S.bottomY), [b0, b1] = face(z0, top0), [c0, c1] = face(z1, S.topY), [d0, d1] = face(z1, S.bottomY);
      const m = new Mesh();
      convexBox(m, [a0, b0, b1, a1, d0, c0, c1, d1]);
      nodes.push(m.node(`${side}-schurzen-panel-${k}`));
      const fromY = P.detail.hangerFromY, zm = (z0 + z1) / 2;
      if (fromY === null) {
        nodes.push(box(`${side}-schurzen-hanger-${k}`, [S.x - C.panHalf, 0.04, 0.05], [s * (S.x + C.panHalf) / 2, S.topY - 0.04, zm], 'steel'));
      } else {
        const a = [s * C.panHalf, fromY], b = [s * (S.x - 0.01), S.topY - 0.03], d = [b[0] - a[0], b[1] - a[1]];
        nodes.push(box(`${side}-schurzen-hanger-${k}`, [Math.hypot(...d), 0.03, 0.05], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, zm], 'steel', [0, 0, Math.atan2(d[1], d[0])]));
      }
    }
  }
  return nodes;
}

function hullSlot() {
  return [lowerHull(), casemate(), engineCompartment(), ...hullDetails(), ...skirts()];
}

// ---------------------------------------------------------------------------
// Running gear: six paired road wheels, front sprocket, rear idler, three return rollers.
// ---------------------------------------------------------------------------
const T = P.track;
// Belt path (counter-clockwise in Z, Y): bottom run under the wheels, round the
// sprocket, the upper run over the return rollers, round the idler.
function beltLoop(offset) {
  const zs = T.stations, front = Math.max(...zs), rear = Math.min(...zs);
  const Wf = {c: [front, T.wheelY], r: T.wheelR + offset}, Wr = {c: [rear, T.wheelY], r: T.wheelR + offset};
  const S = {c: T.sprocket, r: T.sprocketR + offset}, I = {c: T.idler, r: T.idlerR + offset};
  const aFS = tangentAngle(Wf, S), aIR = tangentAngle(I, Wr);
  const rollers = T.rollers.slice().sort((a, b) => b - a).map(z => [z, T.rollerY + T.rollerR + offset]);
  const pts = [
    ...arc(Wr, aIR, -HALF_PI).slice(0, -1),
    ...arc(Wf, -HALF_PI, aFS),
    ...arc(S, aFS, HALF_PI),
    ...rollers,
    ...arc(I, HALF_PI, aIR),
  ];
  return pts.filter((p, i) => i === 0 || len(sub(p, pts[i - 1])) > 1e-4).filter((p, i, a) => i < a.length - 1 || len(sub(p, a[0])) > 1e-4);
}
const outerLoop = () => beltLoop(T.thickness);
const innerLoop = () => beltLoop(0);

function trackSide(side, s) {
  const cx = s * T.x, nodes = [];
  nodes.push(extrude(`${side}-continuous-track`, zyOutline(outerLoop()), T.width, [cx - T.width / 2, 0, 0], ALONG_X, 'track', [zyOutline(innerLoop())]));
  // Paired rubber-tyred road wheels straddling the guide horns, on torsion arms.
  T.stations.forEach((z, k) => {
    for (const [tag, u] of [['outer', 0.105], ['inner', -0.105]]) {
      const x = cx + s * u;
      nodes.push(cyl(`${side}-road-wheel-${k}-${tag}-tyre`, T.wheelR, T.wheelR, 0.085, [x, T.wheelY, z], AXIS_X, 'trackRubber', 28));
      nodes.push(cyl(`${side}-road-wheel-${k}-${tag}-disc`, T.wheelR - 0.05, T.wheelR - 0.05, 0.095, [x, T.wheelY, z], AXIS_X, 'steel', 24));
    }
    nodes.push(cyl(`${side}-road-wheel-${k}-hub`, 0.07, 0.07, 0.30, [cx, T.wheelY, z], AXIS_X, 'steel', 14));
    const armFrom = [0, 0.62, z + 0.20], armTo = [0, T.wheelY, z], d = sub(armTo, armFrom);
    nodes.push(box(`${side}-road-wheel-${k}-torsion-arm`, [0.08, 0.07, len(d)], [s * (T.x - T.width / 2 - 0.05), (armFrom[1] + armTo[1]) / 2, (armFrom[2] + armTo[2]) / 2], 'hullPrimary', [Math.atan2(-d[1], d[2]), 0, 0]));
  });
  T.rollers.forEach((z, k) => {
    nodes.push(cyl(`${side}-return-roller-wheel-${k}`, T.rollerR, T.rollerR, 0.24, [cx, T.rollerY, z], AXIS_X, 'trackRubber', 20));
    nodes.push(cyl(`${side}-return-roller-wheel-${k}-hub`, 0.05, 0.05, 0.36, [cx - s * 0.05, T.rollerY, z], AXIS_X, 'steel', 12));
  });
  // Drive sprocket (21 teeth) and final-drive housing.
  const [sz, sy] = T.sprocket;
  const teeth = Array.from({length: 42}, (_, i) => {
    const a = i * Math.PI / 21, r = i % 2 === 0 ? T.sprocketR + 0.02 : T.sprocketR - 0.03;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  for (const u of [0.10, -0.10]) nodes.push(extrude(`${side}-drive-sprocket-wheel-rim-${u > 0 ? 'outer' : 'inner'}`, teeth, 0.05, [cx + s * u - 0.025, sy, sz], ALONG_X, 'steel'));
  nodes.push(cyl(`${side}-drive-sprocket-wheel-disc`, T.sprocketR - 0.05, T.sprocketR - 0.05, 0.24, [cx, sy, sz], AXIS_X, 'steel', 28));
  nodes.push(cyl(`${side}-drive-sprocket-wheel-hub`, 0.12, 0.12, 0.34, [cx + s * 0.03, sy, sz], AXIS_X, 'steel', 18));
  nodes.push(cyl(`${side}-final-drive-housing`, 0.16, 0.16, 0.14, [s * (H.half + 0.05), sy, sz], AXIS_X, 'hullPrimary', 18));
  // Rear idler: spoked wheel.
  const [iz, iy] = T.idler;
  for (const u of [0.10, -0.10]) nodes.push(extrude(`${side}-idler-wheel-rim-${u > 0 ? 'outer' : 'inner'}`, circle(T.idlerR, 32), 0.06, [cx + s * u - 0.03, iy, iz], ALONG_X, 'steel', [circle(T.idlerR - 0.05, 32)]));
  nodes.push(cyl(`${side}-idler-wheel-hub`, 0.08, 0.08, 0.30, [cx, iy, iz], AXIS_X, 'steel', 14));
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, rm = (T.idlerR - 0.05 + 0.08) / 2;
    nodes.push(box(`${side}-idler-wheel-spoke-${k}`, [0.26, 0.04, T.idlerR - 0.13], [cx, iy + rm * Math.cos(a), iz + rm * Math.sin(a)], 'steel', [a, 0, 0]));
  }
  nodes.push(trackShoes(side, cx, outerLoop()));
  return nodes;
}

// Batched cleats on the outer run plus inward guide horns.
function trackShoes(side, cx, loop) {
  const seg = loop.map((p, i) => len(sub(loop[(i + 1) % loop.length], p)));
  const perimeter = seg.reduce((a, b) => a + b, 0), count = Math.round(perimeter / T.shoePitch);
  const m = new Mesh();
  for (let i = 0; i < count; i++) {
    let d = (i + 0.5) * perimeter / count, k = 0;
    while (d > seg[k]) { d -= seg[k]; k++; }
    const a = loop[k], b = loop[(k + 1) % loop.length], t = mul(sub(b, a), 1 / seg[k]), inward = [-t[1], t[0]];
    const p = addv(a, mul(t, d));
    const at = (along, depth) => addv(p, addv(mul(t, along), mul(inward, depth)));
    const block = (halfAlong, d0, d1, x0, x1) => {
      const q = [at(-halfAlong, d0), at(halfAlong, d0), at(halfAlong, d1), at(-halfAlong, d1)];
      convexBox(m, [...q.map(([z, y]) => [x0, y, z]), ...q.map(([z, y]) => [x1, y, z])]);
    };
    block(0.05, -0.012, 0.02, cx - T.width / 2, cx + T.width / 2);
    block(0.04, T.thickness, T.thickness + 0.10, cx - 0.03, cx + 0.03);
  }
  return m.node(`${side}-batched-track-shoes`, 'track');
}

// ---------------------------------------------------------------------------
// Gun mount and 7.5 cm StuK 40 L/48 in the cast Saukopf mantlet.
// ---------------------------------------------------------------------------
const G = P.gun;
// The traversing mount sits inside the casemate; only its cradle is modelled.
function turretSlot() {
  return [box('stuk40-traverse-cradle', [0.36, 0.20, 0.50], [0, 0.10, -0.20], 'darkMetal')];
}
// Rounded section: flat bottom, straight sides, domed top.
function saukopfRing([z, top, bottom, hw]) {
  const pts = [[-hw, bottom], [hw, bottom], [hw, bottom + (top - bottom) * 0.45]];
  for (let k = 1; k < 8; k++) {
    const a = k * Math.PI / 8;
    pts.push([hw * Math.cos(a), bottom + (top - bottom) * 0.45 + (top - bottom) * 0.55 * Math.sin(a)]);
  }
  pts.push([-hw, bottom + (top - bottom) * 0.45]);
  return pts.map(([x, y]) => [x, y, z]);
}
function saukopf() {
  const rings = G.saukopf.map(saukopfRing), m = new Mesh();
  const ids = rings.map(r => r.map(p => m.vertex(p))), n = rings[0].length;
  for (let l = 0; l < rings.length - 1; l++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, mid = mul(addv(rings[l][i], rings[l][j]), 0.5), c = mul(rings[l].reduce(addv, [0, 0, 0]), 1 / n);
    m.quad(ids[l][i], ids[l][j], ids[l + 1][j], ids[l + 1][i], [mid[0] - c[0], mid[1] - c[1], 0]);
  }
  m.polygon(ids[0], [0, 0, 1]);
  m.polygon(ids[rings.length - 1], [0, 0, -1]);
  return {node: m.node('saukopf-mantlet', 'mantlet'), rings};
}
function gunSlot() {
  const barrelLen = G.muzzle - G.brakeLength - G.barrelStart;
  return [
    saukopf().node,
    cyl('stuk40-barrel', G.barrelMuzzleR, G.barrelRootR, barrelLen, [0, 0, G.barrelStart + barrelLen / 2], AXIS_Z, 'barrel', 20),
    cyl('stuk40-muzzle-brake', G.brakeR, G.brakeR * 0.8, G.brakeLength, [0, 0, G.muzzle - G.brakeLength / 2], AXIS_Z, 'barrel', 18),
    cyl('stuk40-muzzle-brake-baffle-front', G.brakeR + 0.01, G.brakeR + 0.01, 0.05, [0, 0, G.muzzle - 0.025], AXIS_Z, 'barrel', 18),
    cyl('stuk40-muzzle-brake-baffle-rear', G.brakeR + 0.01, G.brakeR + 0.01, 0.05, [0, 0, G.muzzle - G.brakeLength + 0.10], AXIS_Z, 'barrel', 18),
    box('stuk40-breech', [0.34, 0.30, 0.60], [0, 0, -0.25], 'steel'),
    ...(P.detail.frontFittings ? [
      cyl('saukopf-coax-mg-port', 0.032, 0.032, 0.10, [0.20, 0.24, 0.42], AXIS_Z, 'darkMetal', 12),
      cyl('stuk40-bore', 0.038, 0.038, 0.01, [0, 0, G.muzzle + 0.003], AXIS_Z, 'darkMetal', 16),
    ] : []),
  ];
}

// ---------------------------------------------------------------------------
// Armour plates (OBB hitboxes).
// ---------------------------------------------------------------------------
const plates = [];
// Fit an OBB to a planar quad; the outer face lies on the surface. The collision
// routine resolves the hit face by testing local X, then Y, then Z within 10 mm,
// so thickness goes on local X (no dead band along any plate edge); `pad` grows
// the plate in-plane so neighbouring plates overlap at seams. Skewed quads are
// fitted by their mean-edge rectangle.
function plate(id, name, zone, parent, corners, thickness, outwardHint, halfThick = 0.02, pad = 0.01) {
  const c = mul(corners.reduce(addv, [0, 0, 0]), 1 / corners.length);
  const round = x => Math.round(x * 1e6) / 1e6;
  const [p0, p1, p2, p3] = corners;
  const uVec = mul(addv(sub(p1, p0), sub(p2, p3)), 0.5), vVec = mul(addv(sub(p3, p0), sub(p2, p1)), 0.5);
  let n = unit(cross(uVec, vVec));
  if (dot(n, outwardHint) < 0) n = mul(n, -1);
  const u = unit(sub(uVec, mul(n, dot(uVec, n)))), v = cross(n, u);
  plates.push({id, name, zone,
    halfExtents: [halfThick, Math.abs(dot(uVec, u)) / 2 + pad, Math.abs(dot(vVec, v)) / 2 + pad].map(round),
    position: addv(c, mul(n, -halfThick)).map(round), rotation: eulerFromBasis(n, u, v).map(round), armorThickness: thickness, parent});
}
const quadX = (x0, x1, y0, z0, y1, z1) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]];

function hullArmor() {
  const N = H.nose, h = H.half;
  // Nose: lower plate 50 mm, upper plate 50 + 30 mm bolted, short glacis.
  [['lower-nose', 'Lower Nose', 0, 1, 50], ['upper-nose', 'Upper Nose', 1, 2, 80], ['glacis', 'Hull Glacis', 2, 3, 25]].forEach(([id, name, a, b, t]) => {
    const [za, ya] = N[a], [zb, yb] = N[b];
    plate(`hull-${id}`, name, 'hull', 'hull', quadX(-h, h, ya, za, yb, zb), t, [0, zb - za, -(yb - ya)].map(v => -v));
  });
  // Casemate front: driver's plate (50 + 30 mm) and the sloped plate above it.
  // The pannier fronts outboard of the fighting compartment are 30 mm.
  const rf = [H.topY, C.kneeY, C.roofY];
  const lowerQuad = (x0, x1) => [[x0, rf[1], casemateFrontZ(rf[1])], [x1, rf[1], casemateFrontZ(rf[1])], [x1, rf[0], casemateFrontZ(rf[0])], [x0, rf[0], casemateFrontZ(rf[0])]];
  plate('casemate-front-lower', 'Casemate Front Plate', 'hull', 'hull', lowerQuad(-C.roofHalf, C.roofHalf), 80, lowerFrontNormal);
  const upperY = [C.roofY, C.panEdgeY, C.kneeY];
  plate('casemate-front-upper', 'Casemate Upper Front', 'hull', 'hull', quadX(-C.roofHalf, C.roofHalf, upperY[0], casemateFrontZ(upperY[0]), upperY[2], casemateFrontZ(upperY[2])), 50, upperFrontNormal);
  for (const [side, s] of sides) {
    plate(`pannier-front-lower-${side}`, `Pannier Front ${side}`, 'hull', 'hull', lowerQuad(s * C.roofHalf, s * C.panHalf), 30, lowerFrontNormal);
    plate(`pannier-front-upper-${side}`, `Pannier Upper Front ${side}`, 'hull', 'hull',
      [[s * C.roofHalf, C.panEdgeY, casemateFrontZ(C.panEdgeY)], [s * C.panHalf, C.panEdgeY, casemateFrontZ(C.panEdgeY)], [s * C.panHalf, C.kneeY, casemateFrontZ(C.kneeY)], [s * C.roofHalf, C.kneeY, casemateFrontZ(C.kneeY)]], 30, upperFrontNormal);
    // Pannier wall (30 mm), its sloped top (30 mm) and the side boxes further back.
    const zf = casemateFrontZ(C.panEdgeY), zr = casemateRearZ(C.panEdgeY);
    plate(`pannier-wall-${side}`, `Pannier Wall ${side}`, 'hull', 'hull', [[s * C.panHalf, C.panEdgeY, zf], [s * C.panHalf, C.panEdgeY, zr], [s * C.panHalf, H.topY, zr], [s * C.panHalf, H.topY, zf]], 30, [s, 0, 0]);
    plate(`pannier-wall-front-${side}`, `Pannier Wall Front ${side}`, 'hull', 'hull', [[s * C.panHalf, C.panEdgeY - 0.02, casemateFrontZ(C.panEdgeY - 0.02)], [s * C.panHalf, C.panEdgeY - 0.02, zf], [s * C.panHalf, H.topY, zf], [s * C.panHalf, H.topY, C.footZ]], 30, [s, 0, 0]);
    const topN = [s * (C.roofY - C.panEdgeY), C.panHalf - C.roofHalf, 0];
    plate(`pannier-top-${side}`, `Pannier Top ${side}`, 'hull', 'hull', [[s * C.roofHalf, C.roofY, casemateFrontZ(C.roofY)], [s * C.roofHalf, C.roofY, casemateRearZ(C.roofY)], [s * C.panHalf, C.panEdgeY, casemateRearZ(C.panEdgeY)], [s * C.panHalf, C.panEdgeY, casemateFrontZ(C.panEdgeY)]], 30, topN);
    const SB = C.sideBox, z0 = casemateRearZ(SB.topY) + 0.02;
    plate(`side-box-wall-${side}`, `Side Box Wall ${side}`, 'hull', 'hull', [[s * C.panHalf, SB.topY, z0], [s * C.panHalf, SB.topY, SB.rearZ], [s * C.panHalf, H.topY, SB.rearZ], [s * C.panHalf, H.topY, z0]], 30, [s, 0, 0]);
    // Engine compartment side behind the side boxes (30 mm).
    const E = H.engine;
    plate(`engine-side-${side}`, `Engine Side ${side}`, 'hull', 'hull', [[s * E.half, E.deckY, SB.rearZ + 0.05], [s * E.half, E.deckY, E.rearTopZ], [s * E.half, H.topY, H.rearZ], [s * E.half, H.topY, SB.rearZ + 0.05]], 30, [s, 0, 0]);
    // Lower hull side (30 mm) behind the tracks and skirts.
    plate(`hull-lower-side-${side}`, `Lower Hull Side ${side}`, 'hull', 'hull', [[s * h, H.topY, N[0][0]], [s * h, H.topY, H.rearZ], [s * h, H.bellyY, H.rearZ], [s * h, H.bellyY, N[0][0]]], 30, [s, 0, 0]);
  }
  // Roofs: casemate 17 mm, engine deck 16 mm.
  plate('casemate-roof', 'Casemate Roof', 'hull', 'hull', quadX(-C.roofHalf, C.roofHalf, C.roofY, C.roofFrontZ, C.roofY, C.roofRearZ), 17, [0, 1, 0]);
  const E = H.engine;
  plate('engine-deck', 'Engine Deck', 'hull', 'hull', quadX(-E.half, E.half, E.deckY, E.frontZ, E.deckY, E.rearTopZ), 16, [0, 1, 0]);
  // Casemate rear above the engine deck (30 mm), upper rear plate (30 mm), lower rear (50 mm).
  plate('casemate-rear', 'Casemate Rear', 'hull', 'hull', quadX(-C.roofHalf, C.roofHalf, C.roofY, casemateRearZ(C.roofY), E.deckY, casemateRearZ(E.deckY)), 30, rearNormal);
  plate('hull-rear-upper', 'Upper Rear Plate', 'hull', 'hull', quadX(-E.half, E.half, E.deckY, E.rearTopZ, H.topY, H.rearZ), 30, [0, 0.3, -1]);
  plate('hull-rear-lower', 'Lower Rear Plate', 'hull', 'hull', quadX(-h, h, H.topY, H.rearZ, H.bellyY, H.rearZ), 50, [0, 0, -1]);
  // Schurzen: 5 mm plates, one per panel.
  const S = P.skirts;
  for (const [side, s] of sides) for (let k = 0; k < S.joints.length - 1; k++) {
    const z0 = S.joints[k], z1 = S.joints[k + 1];
    const xAt = y => s * (S.bottomX + (y - S.bottomY) / (S.topY - S.bottomY) * (S.x - S.bottomX) + 0.004);
    // Upright rectangles only: a mean-edge fit of the sloped first panel would
    // skew its trailing edge and open a gap at the joint. The first panel steps
    // up its sloped leading edge in three rectangles.
    const rect = (id, name, za, zb, ya, yb) => plate(id, name, 'hull', 'hull', [[xAt(yb), yb, za], [xAt(yb), yb, zb], [xAt(ya), ya, zb], [xAt(ya), ya, za]], 5, [s, 0, 0], 0.004, 0.004);
    if (k > 0) rect(`schurzen-${side}-${k}`, `Schurzen ${side} ${k + 1}`, z0, z1, S.bottomY, S.topY);
    else {
      rect(`schurzen-${side}-0`, `Schurzen ${side} 1`, z0, z1, S.bottomY, S.frontTopY);
      const topAt = z => S.frontTopY + (z0 - z) / (z0 - z1) * (S.topY - S.frontTopY);
      for (let i = 0; i < 4; i++) {
        const za = z0 + (z1 - z0) * i / 4, zb = z0 + (z1 - z0) * (i + 1) / 4;
        rect(`schurzen-${side}-0-upper-${i}`, `Schurzen ${side} 1 upper ${i + 1}`, za, zb, S.frontTopY, topAt((za + zb) / 2));
      }
    }
  }
  // Tracks: 40 mm slabs on the outer belt face following the outline in steps.
  const outer = outerLoop();
  const zMax = Math.max(...outer.map(p => p[0])), zMin = Math.min(...outer.map(p => p[0]));
  const r6 = x => Math.round(x * 1e6) / 1e6;
  const yRange = z => {
    const ys = [];
    outer.forEach((a, i) => { const b = outer[(i + 1) % outer.length]; if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) ys.push(a[1] + (z - a[0]) / (b[0] - a[0]) * (b[1] - a[1])); });
    return [Math.min(...ys), Math.max(...ys)];
  };
  const firstWheel = Math.max(...T.stations), lastWheel = Math.min(...T.stations);
  const steps = (a, b) => { const n = Math.ceil((b - a) / 0.3 - 1e-9); return Array.from({length: n}, (_, i) => [a + (b - a) * i / n, a + (b - a) * (i + 1) / n]); };
  const pieces = [...steps(zMin, lastWheel), [lastWheel, firstWheel], ...steps(firstWheel, zMax)];
  for (const [side, s] of sides) pieces.forEach(([z0, z1], k) => {
    const [y0, y1] = z1 - z0 > 1 ? [0, Math.min(yRange(z0 + 0.05)[1], yRange(z1 - 0.05)[1])] : yRange((z0 + z1) / 2);
    plates.push({id: `track-${side}-${k}`, name: `${side[0].toUpperCase()}${side.slice(1)} Track ${k + 1}`, zone: 'track',
      halfExtents: [0.02, (y1 - y0) / 2, (z1 - z0) / 2].map(r6), position: [s * (T.x + T.width / 2 - 0.02), (y0 + y1) / 2, (z0 + z1) / 2].map(r6),
      rotation: [0, 0, 0], armorThickness: 20, isTrack: side, parent: 'hull'});
  });
  // Cast cupola (30 mm): eight slabs.
  const cu = P.detail.cupola, cy0 = C.roofY, cy1 = C.roofY + cu.height, r = cu.r, half = r * Math.tan(Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, dir = [Math.sin(a), 0, Math.cos(a)], t = [dir[2], 0, -dir[0]];
    const cx = cu.x + dir[0] * r, cz = cu.z + dir[2] * r;
    const p = [cx - t[0] * half, cz - t[2] * half], q = [cx + t[0] * half, cz + t[2] * half];
    plate(`cupola-${k}`, `Cupola ${k + 1}/8`, 'hull', 'hull', [[p[0], cy1, p[1]], [q[0], cy1, q[1]], [q[0], cy0, q[1]], [p[0], cy0, p[1]]], 30, dir, 0.02, 0.005);
  }
}

function gunArmor() {
  // Saukopf (80 mm cast): front face, then per section band the two sides,
  // the two upper shoulders of the dome and the bottom.
  const rings = G.saukopf.map(saukopfRing), n = rings[0].length;
  const [fz, ftop, fbottom, fhw] = G.saukopf[0];
  plate('saukopf-face', 'Saukopf Face', 'gun', 'gunGroup', [[-fhw, fbottom, fz], [fhw, fbottom, fz], [fhw, ftop, fz], [-fhw, ftop, fz]], 80, [0, 0, 1], 0.02, 0.005);
  // Ring indices: 0 bottom -X, 1 bottom +X, 2 side top +X, 3..9 dome (+X to -X), 10 side top -X.
  const apex = 6;
  for (let l = 0; l < rings.length - 1; l++) {
    const A = rings[l], B = rings[l + 1], faces = [
      ['side-pos', [A[1], A[2], B[2], B[1]], [1, 0, 0]],
      ['side-neg', [A[0], A[n - 1], B[n - 1], B[0]], [-1, 0, 0]],
      ['bottom', [A[0], A[1], B[1], B[0]], [0, -1, 0]],
      ['shoulder-pos', [A[2], A[apex], B[apex], B[2]], [1, 1, 0]],
      ['shoulder-neg', [A[n - 1], A[apex], B[apex], B[n - 1]], [-1, 1, 0]],
    ];
    for (const [part, q, hint] of faces) {
      const out = addv(hint, [0, 0, 0.3]);
      plate(`saukopf-${part}-${l}`, `Saukopf ${part.replace('-', ' ')} ${l + 1}`, 'gun', 'gunGroup', q, 80, out, 0.02, 0.01);
    }
  }
}

// ---------------------------------------------------------------------------
// Assemble and write.
// ---------------------------------------------------------------------------
const model = {
  schemaVersion: 1,
  slots: {
    hull: hullSlot(),
    tracksLeft: trackSide('left', -1),
    tracksRight: trackSide('right', 1),
    turret: turretSlot(),
    gun: gunSlot(),
  },
};
hullArmor();
gunArmor();
// Paint shading per part (pass 4 on).
for (const nodes of Object.values(model.slots)) for (const node of nodes) {
  const shade = P.detail.shades[node.id];
  if (shade !== undefined) node.shade = shade;
}

const tank = {
  schemaVersion: 1,
  id: 'stug3g',
  renderMode: 'parametric',
  catalog: {sortOrder: 9},
  meta: {
    displayName: 'StuG III Ausf. G',
    description: 'Turretless assault gun on the Panzer III chassis and the most numerous German armoured vehicle of the war. Its low casemate carries the same 7.5 cm L/48 gun as the Panzer IV behind 80 mm of front armour, but the gun traverses only 10 degrees each side: the whole vehicle must turn to engage. Late production with the cast Saukopf mantlet and Schurzen.',
    nationality: 'Germany',
    year: 1943,
  },
  appearance: {
    baseColor: '#857853',
    camouflage: ['dunkelgelb', 'dreifarben', 'hinterhalt', 'wintertarnung'],
    zimmerit: 'ribbed',
  },
  durability: {health: 230, trackHealth: 80, armorSummary: {front: 80, side: 30, rear: 50, turret: 80}},
  mounts: {
    turretOffset: G.mount,
    gunPivotOffset: [0, G.pivotY, 0],
    muzzleDistance: G.muzzle,
    broadPhaseRadius: 4.6,
  },
  mobility: {
    horsepower: 300, weight: 23.9, maxSpeed: 10, maxReverseSpeed: 3, acceleration: 4.55, deceleration: 9,
    trackWidth: Math.round((2 * T.x + T.width) * 1000) / 1000, turnRateLimit: 0.58, rotationalInertia: 3.1,
  },
  traverse: {turretSpeed: 0.05, gunSpeed: 0.08, maxElevationDeg: 20, maxDepressionDeg: 6, limitDeg: 10},
  weapons: {
    caliber: 75,
    reloadTime: 5000,
    ammo: {
      AP: {penetration: 99, velocity: 740, damage: 350, drop: 0.1, dispersion: 0.0018},
      APC: {penetration: 126, velocity: 930, damage: 250, drop: 0.08, dispersion: 0.0015},
      HE: {penetration: 25, velocity: 550, damage: 500, drop: 0.3, dispersion: 0.0025},
    },
  },
  armorModel: {plates},
};

const round = (_k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const lines = ['{', '  "schemaVersion": 1,', '  "slots": {'];
Object.entries(model.slots).forEach(([slot, nodes], i, all) => {
  lines.push(`    "${slot}": [`);
  nodes.forEach((node, j) => lines.push(`      ${JSON.stringify(node, round)}${j < nodes.length - 1 ? ',' : ''}`));
  lines.push(`    ]${i < all.length - 1 ? ',' : ''}`);
});
lines.push('  }', '}');
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'model.json'), `${lines.join('\n')}\n`);
fs.writeFileSync(path.join(out, 'tank.json'), `${JSON.stringify(tank, round, 2)}\n`);
console.log(`Pass ${PASS}: wrote ${path.join(out, 'model.json')} and tank.json (${plates.length} armour plates).`);
