// Reproducible Panther Ausf. A model generator.
// Pass 0 is the first draft built from landmarks measured on the Doyle drawing
// published by OnWar; later passes apply the corrections found in the
// orthographic overlays, in order.
//   node docs/references/panther_a/generate.mjs [output-directory] [pass]
// The output directory defaults to src/tanks/panther_a. Both JSON files are overwritten.
import fs from 'node:fs';
import path from 'node:path';

const LATEST_PASS = 2;
const out = process.argv[2] ?? 'src/tanks/panther_a';
const PASS = Number(process.argv[3] ?? LATEST_PASS);
if (!Number.isInteger(PASS) || PASS < 0 || PASS > LATEST_PASS) throw Error(`Pass must be 0..${LATEST_PASS}`);

// ---------------------------------------------------------------------------
// Parameters (metres; +Z front, +Y up, +X vehicle left). Values come from the
// drawing at 155 px/m in every view; see README.md for the registration.
// ---------------------------------------------------------------------------
const P = {
  hull: {
    roofY: 1.906, roofHalf: 1.226, roofFrontZ: 2.013,
    // Upper glacis meets the lower glacis at the nose; the lower glacis runs at 55 degrees.
    noseZ: 3.29, noseY: 1.04, lowerGlacisDeg: 55,
    bellyY: 0.54, lowerHalf: 0.905,
    // Sloped superstructure sides end at the sponson edge above the skirts.
    sponsonY: 1.45, sponsonHalf: 1.60,
    // Rear plate: top edge at the deck, undercut 30 degrees towards the belly.
    rearTopZ: -3.219, rearDeg: 30,
    fender: {innerX: 0.97, outerX: 1.65, tipZ: 3.50, tipY: 0.88, kneeZ: 2.70, topY: 1.53, rearZ: 2.574},
  },
  track: {
    x: 1.32, width: 0.66, thickness: 0.087,
    wheelR: 0.43, wheelY: 0.519,
    // Road wheel stations front to rear; even indices carry the inner wheels.
    stations: [2.123, 1.568, 1.006, 0.465, -0.090, -0.652, -1.239, -1.787],
    sprocket: [2.903, 0.835], sprocketR: 0.397,
    idler: [-2.426, 0.765], idlerR: 0.263,
    shoePitch: 0.153,
  },
  skirts: {x: 1.70, topY: 1.47, bottomY: 0.95, joints: [2.955, 1.910, 0.987, 0.048, -0.913, -1.881, -2.819]},
  turret: {
    offset: [0, 1.906, -0.345],
    // Half rings (x >= 0) from the front corner rearwards: [x, z, y] in turret space.
    base: {y: -0.02, pts: [[1.048, 1.177], [1.19, -0.513], [0.74, -1.171]]},
    roof: {y: 0.762, pts: [[0.706, 0.964, 0.714], [0.79, -0.449], [0.60, -0.739]]},
    cupola: {x: 0.40, z: -0.32, ringY: 0.26},
  },
  gun: {
    pivot: [0, 0.404, 1.255],
    mantletR: 0.325, mantletHalf: 0.72, mantletBackZ: -0.10,
    muzzle: 4.425, barrelStart: 0.38, barrelRootR: 0.084, barrelMuzzleR: 0.068,
    brakeLength: 0.52, brakeR: 0.11,
  },
  detail: {
    headlamp: [1.12, 2.02, 1.893], // on the glacis top edge
    mgBarrel: 0.24, mgY: 1.67,
    fillerCaps: [[-0.2, -1.72], [0.2, -1.72]], // [x, z]
    exhausts: [[0.40, 0.045], [0.49, 0.065], [0.57, 0.045], [-0.36, 0.065]], // [x, radius]
    exhaustBottomY: 1.2, mufflerY: 1.10,
    smokeZ: 0.78,
    noseTow: 'shackles',
  },
};

// Overlay corrections. Each pass documents what the previous capture showed.
if (PASS >= 1) {
  // Pass 1 (before.png): the headlamp stands on a post at the front corner of
  // the glacis (side x=632, front 740/1657, plan 645/1225), not on the roof edge.
  P.detail.headlamp = [1.25, 1.81, 2.60];
  // The MG 34 barrel reaches well ahead of the ball mount in the side view.
  P.detail.mgBarrel = 0.42;
  // Engine deck caps: two pairs, read from the plan view (1370/1005, 1370/1063,
  // 1484/1002, 1484/1068), instead of one guessed pair.
  P.detail.fillerCaps = [[-0.19, -2.15], [0.18, -2.15], [-0.21, -2.88], [0.22, -2.88]];
  // Rear view: the left exhaust and its cooling pipes sit at x=1287/1308/1327,
  // the right exhaust at 1416; the mufflers hang at y=1720..1760.
  P.detail.exhausts = [[0.48, 0.04], [0.36, 0.06], [0.23, 0.04], [-0.35, 0.06]];
  P.detail.exhaustBottomY = 1.35; P.detail.mufflerY = 1.30;
  // Plan view: the smoke dischargers sit 0.16 m further forward on the turret sides.
  P.detail.smokeZ = 0.62;
  // Front view: no shackles on the nose; the lower hull sides run forward as tow brackets.
  P.detail.noseTow = 'brackets';
}
if (PASS >= 2) {
  // Pass 2 (verify.ts --landmarks after iteration-1, all within tolerance):
  // split the side/plan disagreement on the headlamp (side 632, plan 645).
  P.detail.headlamp[2] = 2.64;
  // The MG 34 sits at y=445 in the side view and 1682 in the front view.
  P.detail.mgY = 1.64;
  // Cupola AA ring 5 px low in the side view; skirts 6 px narrow in the plan.
  P.turret.cupola.ringY = 0.29;
  P.skirts.x = 1.72;
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


// ---------------------------------------------------------------------------
// Hull.
// ---------------------------------------------------------------------------
const H = P.hull;
const glacisRun = (H.noseZ - H.roofFrontZ) / (H.roofY - H.noseY); // dz per dy
const lowerRun = Math.tan(H.lowerGlacisDeg * Math.PI / 180);
const bellyFrontZ = H.noseZ - (H.noseY - H.bellyY) * lowerRun;
const rearRun = Math.tan(H.rearDeg * Math.PI / 180);
const glacisZ = y => H.roofFrontZ + (H.roofY - y) * glacisRun;
const lowerGlacisZ = y => bellyFrontZ + (y - H.bellyY) * lowerRun;
const hullFrontZ = y => (y >= H.noseY - 1e-9 ? glacisZ(y) : lowerGlacisZ(y));
const rearZ = y => H.rearTopZ + (H.roofY - y) * rearRun;
const sideSlope = (H.sponsonHalf - H.roofHalf) / (H.roofY - H.sponsonY); // dx per dy
const sideX = y => H.roofHalf + (H.roofY - y) * sideSlope;
const glacisNormal = unit([0, 1, glacisRun]);
// Undercut rear plate: its outward normal points rearwards and down.
const rearOut = unit([0, -rearRun, -1]);
// "left" in node and plate ids is -X, matching the tracksLeft slot used by every tank.
const sides = [['left', -1], ['right', 1]];
const yGlacis = z => H.roofY - (z - H.roofFrontZ) / glacisRun;
const yRear = z => H.roofY - (z - H.rearTopZ) / rearRun;

function hullShell() {
  // Cross-section (x, y), counter-clockwise seen from the front; the nose vertex
  // splits the front into the upper and lower glacis planes.
  const half = [
    [H.roofHalf, H.roofY], [H.sponsonHalf, H.sponsonY], [H.lowerHalf, H.sponsonY],
    [H.lowerHalf, H.noseY], [H.lowerHalf, H.bellyY],
  ];
  const section = [...half.map(([x, y]) => [-x, y]), ...half.slice().reverse().map(([x, y]) => [x, y])];
  const n = section.length;
  const m = new Mesh();
  const front = section.map(([x, y]) => m.vertex([x, y, hullFrontZ(y)]));
  const rear = section.map(([x, y]) => m.vertex([x, y, rearZ(y)]));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, [x0, y0] = section[i], [x1, y1] = section[j];
    if (Math.abs(x0 - x1) < 1e-9 && Math.abs(y0 - y1) < 1e-9) continue;
    m.quad(front[i], front[j], rear[j], rear[i], [y1 - y0, -(x1 - x0), 0]);
  }
  const upper = section.map((p, i) => (p[1] >= H.noseY - 1e-9 ? i : -1)).filter(i => i >= 0);
  // Upper indices run 0..3 and n-4..n-1; rotate so the polygon is contiguous.
  const upperRing = [...upper.filter(i => i >= n / 2), ...upper.filter(i => i < n / 2)];
  m.polygon(upperRing.map(i => front[i]), [0, 1, glacisRun]);
  const lower = [3, 4, n - 5, n - 4];
  m.polygon(lower.map(i => front[i]), [0, -1, lowerRun]);
  m.polygon(section.map((_, i) => rear[i]), rearOut);
  return m.node('panther-welded-hull');
}

function hullDetails() {
  const nodes = [];
  const F = H.fender;
  // Front fenders: quarter-ellipse mudguards ahead of the sponsons.
  for (const [side, s] of sides) {
    const outline = [];
    const a = F.tipZ - F.kneeZ, b = F.topY - F.tipY;
    for (let k = 0; k <= 12; k++) {
      const t = k / 12 * Math.PI / 2;
      outline.push([F.kneeZ + a * Math.cos(t), F.tipY + b * Math.sin(t)]);
    }
    outline.push([F.rearZ, F.topY]);
    const inner = outline.slice().reverse().map(([z, y]) => {
      const t = Math.atan2((y - F.tipY) / b, (z - F.kneeZ) / a);
      return z <= F.kneeZ ? [z, y - 0.02] : [F.kneeZ + (a - 0.02) * Math.cos(t), F.tipY + (b - 0.02) * Math.sin(t)];
    });
    const width = F.outerX - F.innerX;
    nodes.push(extrude(`${side}-front-fender`, zyOutline([...outline, ...inner]), width, [s > 0 ? F.innerX : -F.outerX, 0, 0], ALONG_X));
  }
  // Glacis fittings: hull MG ball mount (vehicle right), driver's visor, headlamp.
  const onGlacis = (x, y, lift = 0) => addv([x, y, glacisZ(y)], mul(glacisNormal, lift));
  nodes.push(cyl('hull-mg-ball-mount-armour', 0.16, 0.16, 0.05, onGlacis(-0.54, P.detail.mgY, 0.0), eulerFromYAxis(glacisNormal), 'hullPrimary', 24));
  nodes.push(cyl('hull-mg-ball', 0.10, 0.10, 0.10, onGlacis(-0.54, P.detail.mgY, 0.05), eulerFromYAxis(glacisNormal), 'hullPrimary', 20));
  const mgLen = P.detail.mgBarrel;
  nodes.push(cyl('hull-mg-34-barrel-jacket', 0.022, 0.022, mgLen, addv(onGlacis(-0.54, P.detail.mgY, 0.10), [0, 0, mgLen / 2 - 0.02]), AXIS_Z, 'darkMetal', 10));
  nodes.push(box('driver-vision-visor', [0.42, 0.05, 0.16], onGlacis(0.48, 1.70, 0.025), 'hullPrimary', eulerFromYAxis(glacisNormal)));
  const [lx, ly, lz] = P.detail.headlamp, postFoot = yGlacis(lz);
  nodes.push(cyl('front-headlamp', 0.09, 0.09, 0.16, [lx, ly, lz], AXIS_Z, 'lamp', 16));
  nodes.push(cyl('front-headlamp-post', 0.02, 0.02, ly - 0.09 - postFoot + 0.02, [lx, (ly - 0.09 + postFoot) / 2, lz - 0.02], undefined, 'steel', 8));
  // Towing: shackles on the nose, or the lower hull side plates run forward as brackets.
  for (const [side, s] of sides) {
    if (P.detail.noseTow === 'shackles') nodes.push(box(`${side}-front-tow-shackle`, [0.08, 0.20, 0.18], [s * 0.62, H.noseY - 0.02, H.noseZ + 0.03], 'steel'));
    else nodes.push(box(`${side}-front-tow-bracket`, [0.04, 0.34, 0.36], [s * (H.lowerHalf - 0.02), 0.97, H.noseZ - 0.08], 'hullPrimary'));
  }
  // Roof: driver (left) and radio operator (right) hatches with periscopes.
  for (const [side, s] of sides) {
    nodes.push(cyl(`${side}-crew-hatch`, 0.30, 0.30, 0.04, [s * 0.62, H.roofY + 0.02, 1.27], undefined, 'hullPrimary', 32));
    nodes.push(box(`${side}-crew-hatch-hinge`, [0.08, 0.05, 0.22], [s * 0.95, H.roofY + 0.025, 1.27], 'steel'));
    nodes.push(box(`${side}-hatch-periscope`, [0.18, 0.08, 0.10], [s * 0.62, H.roofY + 0.04, 1.66], 'darkMetal'));
  }
  // Engine deck: armoured fan covers, radiator grilles, central access hatch.
  for (const [side, s] of sides) {
    nodes.push(cyl(`${side}-cooling-fan-cover`, 0.355, 0.355, 0.06, [s * 0.93, H.roofY + 0.03, -2.18], undefined, 'hullPrimary', 36));
    nodes.push(cyl(`${side}-cooling-fan-grille`, 0.28, 0.28, 0.02, [s * 0.93, H.roofY + 0.065, -2.18], undefined, 'grille', 36));
    for (const [end, z] of [['front', -1.47], ['rear', -2.955]]) {
      nodes.push(box(`${side}-radiator-grille-${end}`, [0.71, 0.03, 0.39], [s * 0.935, H.roofY + 0.015, z], 'grille'));
    }
  }
  nodes.push(box('engine-access-hatch', [0.78, 0.04, 1.13], [0, H.roofY + 0.02, -2.07]));
  P.detail.fillerCaps.forEach(([x, z], i) => nodes.push(cyl(`engine-filler-cap-${i}`, 0.12, 0.12, 0.04, [x, H.roofY + 0.06, z], undefined, 'hullPrimary', 20)));
  // Stowage on the superstructure sides: +X is the vehicle's left, the side in the drawing.
  const sideNormal = unit([H.roofY - H.sponsonY, H.sponsonHalf - H.roofHalf, 0]);
  const onSide = (s, y, z, lift) => addv([s * sideX(y), y, z], mul([s * sideNormal[0], sideNormal[1], 0], lift));
  const sideTilt = s => [0, 0, -s * Math.atan(sideSlope)];
  nodes.push(cyl('cleaning-rod-tube', 0.045, 0.045, 1.55, onSide(1, 1.68, 0.42, 0.05), AXIS_Z, 'accessory', 12));
  nodes.push(cyl('tow-cable', 0.018, 0.018, 3.3, onSide(1, 1.86, -1.50, 0.02), AXIS_Z, 'darkMetal', 8));
  nodes.push(box('spare-track-links', [0.10, 0.34, 0.40], onSide(1, 1.66, -2.28, 0.05), 'track', sideTilt(1)));
  nodes.push(box('jack-block', [0.12, 0.20, 0.28], onSide(1, 1.62, 1.55, 0.06), 'accessory', sideTilt(1)));
  nodes.push(box('tool-shovel', [0.03, 0.14, 1.05], onSide(-1, 1.70, 0.1, 0.02), 'accessory', sideTilt(-1)));
  nodes.push(box('tool-crowbar', [0.03, 0.03, 1.40], onSide(-1, 1.58, -1.0, 0.02), 'steel', sideTilt(-1)));
  // Antenna on the left rear deck.
  nodes.push(cyl('antenna-base', 0.05, 0.06, 0.10, [1.12, H.roofY + 0.05, -1.70], undefined, 'darkMetal', 12));
  nodes.push(cyl('antenna-whip', 0.006, 0.008, 1.60, [1.12, H.roofY + 0.90, -1.70], undefined, 'darkMetal', 8));
  // Rear plate: exhausts (left stack with two cooling pipes) run up the undercut
  // plate, then stowage bins and tow couplings.
  const rearTilt = [-Math.atan(rearRun), 0, 0];
  const onRear = (x, y, lift) => addv([x, y, rearZ(y)], mul(rearOut, lift));
  const pipeBottom = P.detail.exhaustBottomY, pipeLen = (2.0 - pipeBottom) * Math.hypot(1, rearRun);
  P.detail.exhausts.forEach(([x, r], i) => {
    nodes.push(cyl(`rear-exhaust-pipe-${i}`, r, r, pipeLen, onRear(x, (2.0 + pipeBottom) / 2, 0.12), rearTilt, 'darkMetal', 14));
    nodes.push(cyl(`rear-exhaust-pipe-${i}-cap`, r + 0.012, r + 0.012, 0.05, onRear(x, 2.0, 0.12), rearTilt, 'darkMetal', 14));
  });
  const [ex0, ex1, ex2, ex3] = P.detail.exhausts.map(([x]) => x), my = P.detail.mufflerY;
  nodes.push(box('rear-exhaust-muffler-left', [Math.abs(ex0 - ex2) + 0.12, 0.32, 0.12], onRear((ex0 + ex2) / 2, my, 0.10), 'darkMetal', rearTilt));
  nodes.push(box('rear-exhaust-muffler-right', [0.20, 0.32, 0.12], onRear(ex3, my, 0.10), 'darkMetal', rearTilt));
  void ex1;
  for (const [side, s] of sides) {
    nodes.push(box(`${side}-rear-stowage-bin`, [0.85, 0.55, 0.42], onRear(s * 1.155, 1.535, 0.21), 'hullPrimary', rearTilt));
    nodes.push(box(`${side}-rear-tow-shackle`, [0.08, 0.18, 0.16], onRear(s * 0.72, 0.72, 0.06), 'steel', rearTilt));
  }
  nodes.push(cyl('rear-inertia-starter-boss', 0.13, 0.13, 0.04, onRear(0, 0.98, 0.02), eulerFromYAxis(rearOut), 'hullPrimary', 20));
  return nodes;
}

// Schurzen: six 5 mm panels per side on a rail along the sponson edge.
function skirts() {
  const S = P.skirts, nodes = [];
  for (const [side, s] of sides) {
    nodes.push(box(`${side}-schurzen-rail`, [0.06, 0.04, S.joints[0] - S.joints[S.joints.length - 1]], [s * (S.x - 0.04), S.topY + 0.01, (S.joints[0] + S.joints[S.joints.length - 1]) / 2], 'steel'));
    for (let k = 0; k < S.joints.length - 1; k++) {
      const z0 = S.joints[k] - 0.006, z1 = S.joints[k + 1] + 0.006;
      nodes.push(box(`${side}-schurzen-panel-${k}`, [0.012, S.topY - S.bottomY, z0 - z1], [s * S.x, (S.topY + S.bottomY) / 2, (z0 + z1) / 2]));
      nodes.push(box(`${side}-schurzen-hanger-${k}`, [0.03, 0.06, 0.08], [s * (S.x - 0.02), S.topY - 0.06, (z0 + z1) / 2], 'steel'));
    }
  }
  return nodes;
}

function hullSlot() {
  return [hullShell(), ...hullDetails(), ...skirts()];
}

// ---------------------------------------------------------------------------
// Running gear: interleaved road wheels, front sprocket, rear idler.
// ---------------------------------------------------------------------------
const T = P.track;
const wheelTop = T.wheelY + T.wheelR;
// Common external tangent between circles A -> B (counter-clockwise loop in Z, Y).
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
// Belt path (counter-clockwise in Z, Y): bottom run under the wheels, round the
// sprocket, the upper run resting on the wheel tops, round the idler.
function beltLoop(offset) {
  const zs = T.stations, front = Math.max(...zs), rear = Math.min(...zs);
  const Wf = {c: [front, T.wheelY], r: T.wheelR + offset}, Wr = {c: [rear, T.wheelY], r: T.wheelR + offset};
  const S = {c: T.sprocket, r: T.sprocketR + offset}, I = {c: T.idler, r: T.idlerR + offset};
  const aFS = tangentAngle(Wf, S), aIR = tangentAngle(I, Wr);
  const pts = [
    ...arc(Wr, aIR, -HALF_PI).slice(0, -1),
    ...arc(Wf, -HALF_PI, aFS),
    ...arc(S, aFS, HALF_PI),
    [front, wheelTop + offset], [rear, wheelTop + offset],
    ...arc(I, HALF_PI, aIR),
  ];
  return pts.filter((p, i) => i === 0 || len(sub(p, pts[i - 1])) > 1e-4).filter((p, i, a) => i < a.length - 1 || len(sub(p, a[0])) > 1e-4);
}
const outerLoop = () => beltLoop(T.thickness);
const innerLoop = () => beltLoop(0);

function trackSide(side, s) {
  const cx = s * T.x, nodes = [];
  const outer = outerLoop(), inner = innerLoop();
  nodes.push(extrude(`${side}-continuous-track`, zyOutline(outer), T.width, [cx - T.width / 2, 0, 0], ALONG_X, 'track', [zyOutline(inner)]));
  // Interleaved wheels: outer stations straddle the guide horns at the track
  // edges, inner stations run just inside them.
  T.stations.forEach((z, k) => {
    const outerStation = k % 2 === 1;
    const offsets = outerStation ? [0.23, -0.23] : [0.10, -0.10];
    offsets.forEach((u, j) => {
      const x = cx + s * u, tag = `${side}-road-wheel-${k}-${j === 0 ? 'outer' : 'inner'}`;
      nodes.push(cyl(`${tag}-tyre`, T.wheelR, T.wheelR, 0.095, [x, T.wheelY, z], AXIS_X, 'trackRubber', 32));
      nodes.push(cyl(`${tag}-disc`, T.wheelR - 0.045, T.wheelR - 0.045, 0.105, [x, T.wheelY, z], AXIS_X, 'steel', 32));
      nodes.push(cyl(`${tag}-hub`, 0.10, 0.10, 0.13, [x, T.wheelY, z], AXIS_X, 'steel', 16));
    });
    if (outerStation) nodes.push(cyl(`${side}-road-wheel-${k}-hub-cap`, 0.06, 0.07, 0.06, [cx + s * 0.30, T.wheelY, z], AXIS_X, 'steel', 12));
  });
  // Drive sprocket (17 teeth, two rims) with final-drive housing.
  const [sz, sy] = T.sprocket;
  const teeth = Array.from({length: 34}, (_, i) => {
    const a = i * Math.PI / 17, r = i % 2 === 0 ? T.sprocketR + 0.03 : T.sprocketR - 0.03;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  for (const u of [0.17, -0.17]) nodes.push(extrude(`${side}-drive-sprocket-wheel-rim-${u > 0 ? 'outer' : 'inner'}`, teeth, 0.07, [cx + s * u - 0.035, sy, sz], ALONG_X, 'steel'));
  nodes.push(cyl(`${side}-drive-sprocket-wheel-disc`, T.sprocketR - 0.06, T.sprocketR - 0.06, 0.38, [cx, sy, sz], AXIS_X, 'steel', 32));
  nodes.push(cyl(`${side}-drive-sprocket-wheel-hub`, 0.13, 0.13, 0.46, [cx + s * 0.03, sy, sz], AXIS_X, 'steel', 20));
  nodes.push(cyl(`${side}-final-drive-housing`, 0.20, 0.20, 0.20, [s * 1.0, sy, sz], AXIS_X, 'hullPrimary', 20));
  // Rear idler: two spoked rims.
  const [iz, iy] = T.idler;
  for (const u of [0.17, -0.17]) nodes.push(extrude(`${side}-idler-wheel-rim-${u > 0 ? 'outer' : 'inner'}`, circle(T.idlerR, 32), 0.09, [cx + s * u - 0.045, iy, iz], ALONG_X, 'steel', [circle(T.idlerR - 0.05, 32)]));
  nodes.push(cyl(`${side}-idler-wheel-hub`, 0.09, 0.09, 0.44, [cx, iy, iz], AXIS_X, 'steel', 16));
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, rm = (T.idlerR - 0.05 + 0.09) / 2;
    nodes.push(box(`${side}-idler-wheel-spoke-${k}`, [0.40, 0.05, T.idlerR - 0.13], [cx, iy + rm * Math.cos(a), iz + rm * Math.sin(a)], 'steel', [a, 0, 0]));
  }
  nodes.push(cyl(`${side}-idler-crank-mount`, 0.10, 0.10, 0.12, [s * 0.95, iy, iz], AXIS_X, 'hullPrimary', 16));
  nodes.push(trackShoes(side, cx, outer));
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
// Turret: welded shell lofted between the base ring and the roof ring.
// ---------------------------------------------------------------------------
const TU = P.turret;
// Ring order: front +X, widest +X, rear +X, rear -X, widest -X, front -X.
function ringOf(level) {
  const pts = level.pts.map(([x, z, y]) => [x, y ?? level.y, z]);
  return [...pts, ...pts.slice().reverse().map(([x, y, z]) => [-x, y, z])];
}
function turretShell() {
  const rings = [TU.base, TU.roof].map(ringOf);
  const m = new Mesh();
  const [B, R] = rings.map(r => r.map(p => m.vertex(p)));
  const n = rings[0].length;
  const centroid = r => mul(r.reduce(addv, [0, 0, 0]), 1 / r.length);
  const c = centroid(rings[0]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, mid = mul(addv(rings[0][i], rings[0][j]), 0.5);
    m.quad(B[i], B[j], R[j], R[i], [mid[0] - c[0], 0, mid[2] - c[2]]);
  }
  m.polygon(R, [0, 1, 0]);
  m.polygon(B, [0, -1, 0]);
  return {node: m.node('panther-turret-shell'), rings};
}

function turretSlot() {
  const {node: shell} = turretShell();
  const roofY = TU.roof.y;
  const C = TU.cupola;
  const nodes = [
    cyl('turret-race-collar', 0.86, 0.86, 0.06, [0, 0.0, -0.05], undefined, 'darkMetal', 48),
    shell,
    // Cast commander's cupola with seven periscopes and the AA mount ring.
    cyl('commander-cupola', 0.33, 0.35, 0.21, [C.x, roofY + 0.10, C.z], undefined, 'hullPrimary', 32),
    cyl('commander-cupola-hatch', 0.25, 0.26, 0.05, [C.x, roofY + 0.23, C.z], undefined, 'hullPrimary', 28),
    extrude('cupola-ring-aa-rail', circle(0.40, 36), 0.025, [C.x, roofY + C.ringY, C.z], [HALF_PI, 0, 0], 'steel', [circle(0.37, 36)]),
  ];
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + (k - 3) * (2 * Math.PI / 7);
    nodes.push(box(`cupola-periscope-${k}`, [0.12, 0.07, 0.05], [C.x + 0.34 * Math.sin(a), roofY + 0.16, C.z + 0.34 * Math.cos(a)], 'darkMetal', [0, a, 0]));
  }
  for (let k = 0; k < 3; k++) {
    const a = k * 2 * Math.PI / 3;
    nodes.push(box(`cupola-ring-post-${k}`, [0.03, 0.08, 0.03], [C.x + 0.385 * Math.sin(a), roofY + C.ringY - 0.04, C.z + 0.385 * Math.cos(a)], 'steel'));
  }
  // Roof fittings: loader's ventilator hatch, periscope, lifting hooks.
  nodes.push(cyl('roof-ventilator-hatch', 0.24, 0.24, 0.04, [-0.38, roofY - 0.01, 0.58], undefined, 'hullPrimary', 28));
  nodes.push(box('loader-periscope', [0.16, 0.08, 0.10], [-0.30, roofY + 0.04, 0.20], 'darkMetal'));
  nodes.push(cyl('gunner-sight-cover', 0.10, 0.10, 0.06, [0.30, roofY, 0.80], undefined, 'hullPrimary', 16));
  for (const [side, s] of sides) {
    nodes.push(box(`${side}-turret-lifting-hook`, [0.04, 0.08, 0.10], [s * 0.62, roofY + 0.02, 0.10], 'steel'));
    // Three smoke dischargers per side at the front corners, angled out and forward.
    for (let k = 0; k < 3; k++) {
      nodes.push(cyl(`${side}-smoke-discharger-${k}`, 0.045, 0.045, 0.20, [s * (0.90 + 0.02 * k), 0.70 + 0.03 * k, P.detail.smokeZ + 0.10 - 0.10 * k], [0.6, 0, -s * 0.5], 'darkMetal', 12));
    }
  }
  // Rear escape hatch on the sloped rear plate (vehicle right of centre in the rear view).
  const [r2, r3] = [ringOf(TU.base)[2], ringOf(TU.roof)[2]];
  const hatchY = 0.43, t = (hatchY - r2[1]) / (r3[1] - r2[1]), hatchZ = r2[2] + (r3[2] - r2[2]) * t;
  const rearLean = Math.atan2(r3[2] - r2[2], r3[1] - r2[1]);
  nodes.push(cyl('turret-rear-escape-hatch', 0.26, 0.26, 0.04, [-0.26, hatchY, hatchZ - 0.015], [rearLean - HALF_PI, 0, 0], 'hullPrimary', 32));
  return nodes;
}

// ---------------------------------------------------------------------------
// Gun: rounded cast mantlet, 7.5 cm KwK 42 L/70 with double-baffle muzzle brake.
// ---------------------------------------------------------------------------
const G = P.gun;
function mantletOutline() {
  // (z, y) in the gun frame: front half-round on the trunnion axis, flat back.
  const pts = [];
  for (let k = 0; k <= 16; k++) {
    const a = -HALF_PI + k * Math.PI / 16;
    pts.push([G.mantletR * Math.cos(a), G.mantletR * Math.sin(a)]);
  }
  pts.push([G.mantletBackZ, G.mantletR], [G.mantletBackZ, -G.mantletR]);
  return pts;
}
function gunSlot() {
  const barrelLen = G.muzzle - G.brakeLength - G.barrelStart;
  const brakeZ = G.muzzle - G.brakeLength / 2;
  return [
    extrude('kwk42-rounded-mantlet', zyOutline(mantletOutline()), G.mantletHalf * 2, [-G.mantletHalf, 0, 0], ALONG_X, 'mantlet'),
    cyl('mantlet-barrel-sleeve', 0.10, 0.12, 0.16, [0, 0, G.mantletR + 0.06], AXIS_Z, 'mantlet', 24),
    cyl('kwk42-barrel', G.barrelMuzzleR, G.barrelRootR, barrelLen, [0, 0, G.barrelStart + barrelLen / 2], AXIS_Z, 'barrel', 24),
    cyl('kwk42-muzzle-brake', G.brakeR, G.brakeR, G.brakeLength, [0, 0, brakeZ], AXIS_Z, 'barrel', 20),
    box('kwk42-muzzle-brake-baffle-front', [0.30, 0.16, 0.10], [0, 0, G.muzzle - 0.08], 'barrel'),
    box('kwk42-muzzle-brake-baffle-rear', [0.30, 0.16, 0.10], [0, 0, G.muzzle - G.brakeLength + 0.10], 'barrel'),
    cyl('coax-mg-port', 0.03, 0.03, 0.03, [-0.52, 0.02, 0.21], AXIS_Z, 'grille', 12),
    cyl('gunner-sight-aperture', 0.028, 0.028, 0.03, [0.40, 0.05, 0.20], AXIS_Z, 'grille', 12),
    box('kwk42-breech-block', [0.40, 0.36, 0.60], [0, 0, G.mantletBackZ - 0.35], 'steel'),
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
  // Upper glacis: three strips across the sloped-side band, one between the lower hull sides.
  const gy = [H.roofY, H.roofY - (H.roofY - H.sponsonY) / 2, H.sponsonY];
  ['top', 'sponson'].forEach((part, k) => {
    const y0 = gy[k], y1 = gy[k + 1], x = sideX((y0 + y1) / 2);
    plate(`hull-upper-glacis-${part}`, `Upper Glacis (${part})`, 'hull', 'hull', quadX(-x, x, y0, glacisZ(y0), y1, glacisZ(y1)), 80, [0, 1, glacisRun]);
  });
  plate('hull-upper-glacis-nose', 'Upper Glacis (nose)', 'hull', 'hull', quadX(-H.lowerHalf, H.lowerHalf, H.sponsonY, glacisZ(H.sponsonY), H.noseY, H.noseZ), 80, [0, 1, glacisRun]);
  plate('hull-lower-glacis', 'Lower Glacis', 'hull', 'hull', quadX(-H.lowerHalf, H.lowerHalf, H.noseY, H.noseZ, H.bellyY, bellyFrontZ), 60, [0, -1, lowerRun]);
  // Sloped superstructure sides (40 mm at 40 degrees), split along Z where the
  // glacis and rear plate cut them diagonally.
  const zf = glacisZ(H.sponsonY), zr = rearZ(H.sponsonY);
  // Front segments are cut by the glacis (plate from the sponson edge up to the
  // glacis line), rear segments by the undercut rear plate (from it up to the roof).
  const segments = [
    ...[[zf, (zf + H.roofFrontZ) / 2], [(zf + H.roofFrontZ) / 2, H.roofFrontZ]].map(([z0, z1]) => [z0, z1, H.sponsonY, yGlacis((z0 + z1) / 2)]),
    ...[[H.roofFrontZ, 0.7], [0.7, -0.6], [-0.6, -1.9], [-1.9, zr]].map(([z0, z1]) => [z0, z1, H.sponsonY, H.roofY]),
    [zr, H.rearTopZ, yRear((zr + H.rearTopZ) / 2), H.roofY],
  ];
  for (const [side, s] of sides) {
    const nrm = [s * (H.roofY - H.sponsonY), H.sponsonHalf - H.roofHalf, 0];
    segments.forEach(([z0, z1, bottom, top], k) => plate(`hull-side-${side}-${k}`, `Upper Side ${side} ${k}`, 'hull', 'hull',
      [[s * sideX(top), top, z0], [s * sideX(top), top, z1], [s * sideX(bottom), bottom, z1], [s * sideX(bottom), bottom, z0]], 40, nrm));
    // Vertical lower hull side behind the tracks: full-height middle plus the
    // parts ahead of the lower glacis foot and behind the rear plate foot.
    const lower = [[bellyFrontZ, rearZ(H.bellyY), H.bellyY, H.sponsonY], [2.95, bellyFrontZ, 0.80, 1.30], [rearZ(H.bellyY), -2.70, H.bellyY, 1.0]];
    lower.forEach(([z0, z1, y0, y1], k) => plate(`hull-lower-side-${side}-${k}`, `Lower Side ${side} ${k}`, 'hull', 'hull',
      [[s * H.lowerHalf, y1, z0], [s * H.lowerHalf, y1, z1], [s * H.lowerHalf, y0, z1], [s * H.lowerHalf, y0, z0]], 40, [s, 0, 0]));
  }
  // Roof and engine deck (16 mm).
  plate('hull-roof', 'Hull Roof', 'hull', 'hull', quadX(-H.roofHalf, H.roofHalf, H.roofY, H.roofFrontZ, H.roofY, -1.2), 16, [0, 1, 0]);
  plate('hull-engine-deck', 'Engine Deck', 'hull', 'hull', quadX(-H.roofHalf, H.roofHalf, H.roofY, -1.2, H.roofY, H.rearTopZ), 16, [0, 1, 0]);
  // Rear plate (40 mm at 30 degrees): sponson band and lower hull.
  const ry = [H.roofY, H.sponsonY, H.bellyY];
  plate('hull-rear-upper', 'Upper Rear Plate', 'hull', 'hull', quadX(-sideX((ry[0] + ry[1]) / 2), sideX((ry[0] + ry[1]) / 2), ry[0], rearZ(ry[0]), ry[1], rearZ(ry[1])), 40, rearOut);
  plate('hull-rear-lower', 'Lower Rear Plate', 'hull', 'hull', quadX(-H.lowerHalf, H.lowerHalf, ry[1], rearZ(ry[1]), ry[2], rearZ(ry[2])), 40, rearOut);
  // Schurzen: 5 mm spaced plates, one per panel.
  const S = P.skirts;
  for (const [side, s] of sides) for (let k = 0; k < S.joints.length - 1; k++) {
    const z0 = S.joints[k], z1 = S.joints[k + 1], x = s * (S.x + 0.006);
    plate(`schurzen-${side}-${k}`, `Schurzen ${side} ${k + 1}`, 'hull', 'hull', [[x, S.topY, z0], [x, S.topY, z1], [x, S.bottomY, z1], [x, S.bottomY, z0]], 5, [s, 0, 0], 0.006, 0.004);
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
}

function turretArmor(rings) {
  const [B, R] = rings, n = B.length;
  // Ring edges: 0 front side +X, 1 rear side +X, 2 rear, 3 rear side -X, 4 front side -X, 5 front ("left" is -X).
  const edges = [['front-side-right', 45, 3], ['rear-side-right', 45, 2], ['rear', 45, 1], ['rear-side-left', 45, 2], ['front-side-left', 45, 3], ['front', 100, 2]];
  edges.forEach(([part, thickness, splits], i) => {
    const j = (i + 1) % n;
    for (let k = 0; k < splits; k++) {
      const t0 = k / splits, t1 = (k + 1) / splits;
      const q = [lerp(B[i], B[j], t0), lerp(B[i], B[j], t1), lerp(R[i], R[j], t1), lerp(R[i], R[j], t0)];
      const c = mul(q.reduce(addv, [0, 0, 0]), 1 / 4);
      plate(`turret-${part}-${k}`, `Turret ${part.replace(/-/g, ' ')} ${k + 1}/${splits}`, 'turret', 'turret', q, thickness, [c[0], 0, c[2]], 0.02, 0.015);
    }
  });
  // Roof (16 mm): front and rear halves of the roof ring.
  plate('turret-roof-front', 'Turret Roof Front', 'turret', 'turret', [R[5], R[0], lerp(R[0], R[1], 0.5), lerp(R[5], R[4], 0.5)], 16, [0, 1, 0], 0.02, 0.02);
  plate('turret-roof-rear', 'Turret Roof Rear', 'turret', 'turret', [lerp(R[5], R[4], 0.5), lerp(R[0], R[1], 0.5), R[2], R[3]], 16, [0, 1, 0], 0.02, 0.02);
  // Cast cupola (80 mm): eight slabs around it.
  const C = TU.cupola, y0 = TU.roof.y, y1 = TU.roof.y + 0.21, r = 0.335, half = r * Math.tan(Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, dir = [Math.sin(a), 0, Math.cos(a)], t = [dir[2], 0, -dir[0]];
    const cx = C.x + dir[0] * r, cz = C.z + dir[2] * r;
    const p = [cx - t[0] * half, cz - t[2] * half], q = [cx + t[0] * half, cz + t[2] * half];
    plate(`turret-cupola-${k}`, `Cupola ${k + 1}/8`, 'turret', 'turret', [[p[0], y1, p[1]], [q[0], y1, q[1]], [q[0], y0, q[1]], [p[0], y0, p[1]]], 80, dir, 0.02, 0.005);
  }
}

function gunArmor() {
  // Rounded mantlet (100 mm): chords of the half-round face.
  const outline = mantletOutline().slice(0, 17), segs = 6, h = G.mantletHalf;
  for (let k = 0; k < segs; k++) {
    const a = outline[Math.round(k * 16 / segs)], b = outline[Math.round((k + 1) * 16 / segs)];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    plate(`mantlet-${k}`, `Mantlet ${k + 1}`, 'gun', 'gunGroup', [[-h, a[1], a[0]], [h, a[1], a[0]], [h, b[1], b[0]], [-h, b[1], b[0]]], 100, [0, mid[1], mid[0]], 0.02, 0.01);
  }
}

// ---------------------------------------------------------------------------
// Assemble and write.
// ---------------------------------------------------------------------------
const turret = turretSlot();
const model = {
  schemaVersion: 1,
  slots: {
    hull: hullSlot(),
    tracksLeft: trackSide('left', -1),
    tracksRight: trackSide('right', 1),
    turret,
    gun: gunSlot(),
  },
};
hullArmor();
turretArmor([TU.base, TU.roof].map(ringOf));
gunArmor();

const tank = {
  schemaVersion: 1,
  id: 'panther_a',
  renderMode: 'parametric',
  catalog: {sortOrder: 8},
  meta: {
    displayName: 'Panther Ausf. A',
    description: 'The Wehrmacht\'s answer to the T-34. The long 7.5 cm KwK 42 L/70 hits harder than the Tiger\'s 88 at range, and the 80 mm glacis sloped at 55 degrees shrugs off most Allied guns from the front. Its 40 mm sides behind thin Schurzen are its weak spot. Ausf. A with the cast commander\'s cupola and hull MG ball mount.',
    nationality: 'Germany',
    year: 1943,
  },
  appearance: {
    baseColor: '#857853',
    camouflage: ['dunkelgelb', 'dreifarben', 'hinterhalt', 'wintertarnung'],
    zimmerit: 'ribbed',
  },
  durability: {health: 310, trackHealth: 110, armorSummary: {front: 80, side: 40, rear: 40, turret: 100}},
  mounts: {
    turretOffset: TU.offset,
    gunPivotOffset: G.pivot,
    muzzleDistance: G.muzzle,
    broadPhaseRadius: 5.8,
  },
  mobility: {
    horsepower: 700, weight: 44.8, maxSpeed: 12, maxReverseSpeed: 3, acceleration: 4.79, deceleration: 7.5,
    trackWidth: Math.round((2 * T.x + T.width) * 1000) / 1000, turnRateLimit: 0.42, rotationalInertia: 1.8,
  },
  traverse: {turretSpeed: 0.27, gunSpeed: 0.1, maxElevationDeg: 18, maxDepressionDeg: 8},
  weapons: {
    caliber: 75,
    reloadTime: 6000,
    ammo: {
      AP: {penetration: 138, velocity: 925, damage: 420, drop: 0.07, dispersion: 0.0012, historicalPenetration: {standard: 'RHA_30deg', points: [
        {distance: 100, penetration: 138}, {distance: 500, penetration: 124}, {distance: 1000, penetration: 111}, {distance: 1500, penetration: 99}, {distance: 2000, penetration: 89}]}},
      APC: {penetration: 194, velocity: 1120, damage: 300, drop: 0.05, dispersion: 0.0012, historicalPenetration: {standard: 'RHA_30deg', points: [
        {distance: 100, penetration: 194}, {distance: 500, penetration: 174}, {distance: 1000, penetration: 149}, {distance: 1500, penetration: 127}]}},
      HE: {penetration: 25, velocity: 700, damage: 480, drop: 0.2, dispersion: 0.0018},
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
