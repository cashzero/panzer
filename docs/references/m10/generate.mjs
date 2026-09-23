// Reproducible M10 GMC model generator.
// Pass 0 is the first draft built from landmarks measured on the OnWar drawing;
// later passes apply the corrections found in the orthographic overlays, in order.
//   node docs/references/m10/generate.mjs [output-directory] [pass]
// The output directory defaults to src/tanks/m10. Both JSON files are overwritten.
import fs from 'node:fs';
import path from 'node:path';

const LATEST_PASS = 3;
const out = process.argv[2] ?? 'src/tanks/m10';
const PASS = Number(process.argv[3] ?? LATEST_PASS);
if (!Number.isInteger(PASS) || PASS < 0 || PASS > LATEST_PASS) throw Error(`Pass must be 0..${LATEST_PASS}`);

// ---------------------------------------------------------------------------
// Parameters (metres; +Z front, +Y up, +X vehicle left). Values come from the
// drawing at 164 px/m (side/front/rear) and 160 px/m (plan); see README.md.
// ---------------------------------------------------------------------------
const P = {
  hull: {
    roofY: 1.793, roofHalf: 1.125, roofFrontZ: 1.66, roofRearZ: -2.665,
    glacisTan: 0.6505, // rise/run of the 33 degree glacis
    sponsonFrontZ: 2.39,
    widestHalf: 1.525, widestY: 1.29, stripBottomY: 1.19,
    lipX: 1.40, lipY: 1.105, floorOuterX: 1.28, floorY: 1.20,
    tubHalf: 0.83, tubBottomY: 0.43, tubFrontZ: 2.40, tubRearBottomZ: -2.74, tubRearTopZ: -2.84,
    rearKinkZ: -2.939, rearBottomZ: -2.854,
    diffHalf: 0.785,
    diffProfile: [[2.38, 0.43], [2.72, 0.49], [2.90, 0.76], [2.93, 1.04], [2.86, 1.21], [2.70, 1.31], [2.38, 1.31]],
    fenderInnerX: 0.81, fenderTopY: 1.305, fenderKneeZ: 2.70, fenderTipZ: 3.024, fenderTipY: 1.08, fenderBottomY: 1.10,
  },
  track: {
    x: 1.054, width: 0.421, wheelR: 0.254, wheelY: 0.39, bottomThickness: 0.136, beltThickness: 0.125,
    bogieZ: [1.657, 0.196, -1.265], pairHalf: 0.424,
    sprocket: [2.564, 0.817], idler: [-2.39, 0.75], pulleyOuterR: 0.378,
    shoePitch: 0.152,
  },
  turret: {
    offset: [0, 1.80, 0.196],
    wall: 0.035,
    innerApexZ: -1.065,
    // Half rings (x >= 0) from front corner to rear apex: [x, z, y] in turret space.
    bottom: {y: 0.078, pts: [[0.57, 1.104], [0.714, 0.754], [1.165, -0.346], [1.165, -0.906]], apexZ: -1.416},
    knee: {y: 0.377, pts: [[0.56, 1.184], [0.717, 0.754], [1.12, -0.346], [1.12, -0.906]], apexZ: -1.483},
    top: {y: 0.77, pts: [[0.50, 1.184, 0.54], [0.46, 0.725], [0.925, -0.69], [0.90, -0.80]], apexZ: -1.172},
  },
  gun: {
    pivot: [0, 0.392, 1.184],
    shieldRear: {z: -0.13, half: 0.595, lo: -0.212, hi: 0.208},
    shieldFront: {z: 0.26, half: 0.27, lo: -0.186, hi: 0.148},
    muzzle: 2.51, barrelStart: 0.44, barrelRootR: 0.097, barrelMuzzleR: 0.061,
  },
  detail: {
    headlamp: {x: 0.90, y: 1.57, guardFrontZ: null},
    // [x, z, shape]; mirrored to both sides.
    fillerCaps: [[0.80, -1.28, 'flat'], [0.80, -1.56, 'flat']],
    travelLock: {z: -1.38, upright: false},
    cableRearBracket: false,
    rear: {deflectorDepth: 0.12, pintleDepth: 0.20, shackleDepth: 0.12},
  },
};

// Overlay corrections. Each pass documents what the previous capture showed.
if (PASS >= 1) {
  // Pass 1 (before.png): rear lower hull, exhaust deflector and tow fittings
  // stood proud of the track envelope in the side view, which the drawing hides.
  Object.assign(P.hull, {tubRearBottomZ: -2.70, tubRearTopZ: -2.76});
  Object.assign(P.detail.rear, {deflectorDepth: 0.05, pintleDepth: 0.10, shackleDepth: 0.08});
  // Counterweight beak sits at y=267, not at the 272 px V junction.
  P.turret.knee.y = 0.40;
  // Split the front/rear/plan disagreements on turret top width, shield width
  // and roof rear edge instead of fitting one view only.
  P.turret.top.pts[2][0] = 0.912; P.turret.top.pts[3][0] = 0.89;
  P.gun.shieldRear.half = 0.585;
  P.hull.roofRearZ = -2.65;
  // Plan/side details: headlamp guard reaches forward, three filler caps per
  // side (outer ones are the domes seen in profile), the travel lock is the
  // upright post at the rear deck and the tow cable has a rear clamp.
  P.detail.headlamp = {x: 0.86, y: 1.64, guardFrontZ: 2.33};
  P.detail.fillerCaps = [[0.706, -1.069, 'flat'], [0.706, -1.369, 'flat'], [0.975, -1.369, 'dome']];
  P.detail.travelLock = {z: -2.56, upright: true};
  P.detail.cableRearBracket = true;
}
if (PASS >= 2) {
  // Pass 2 (iteration-1 obliques + Hukou front photo): the M5 gun shield is a
  // tall frustum whose base spans almost the full turret height; the side-view
  // arc at x=460..480, y=230..330 is its rear edge, and the front view's
  // 1.15 x 0.60 m rectangle is its base. Only the flat face is 0.33 m tall.
  Object.assign(P.gun.shieldRear, {z: -0.08, lo: -0.372, hi: 0.248});
  P.gun.shieldFront.half = 0.33;
  // Cheek tops meet the shield at y=238 (2.38 m), not at the face top.
  P.turret.top.pts[0][2] = 0.57;
}
if (PASS >= 3) {
  // Pass 3 (verify.ts): fixes found by the geometry and armour checks.
  // The tow pintle still protruded 7 mm behind the track envelope.
  P.detail.rear.pintleDepth = 0.08;
  // Armour rays missed at side-plate seams: see plate() for the face-axis and
  // 15 mm seam-overlap change applied from this pass.
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
const sideSlope = (H.widestHalf - H.roofHalf) / (H.roofY - H.widestY); // dx per dy
const glacisBottomY = H.roofY - (H.sponsonFrontZ - H.roofFrontZ) * H.glacisTan;
const rearUpperSlope = (H.roofRearZ - H.rearKinkZ) / (H.roofY - H.widestY); // dz per dy
const rearLowerSlope = (H.rearBottomZ - H.rearKinkZ) / (H.widestY - H.lipY);
const hullFrontZ = y => (y >= glacisBottomY - 1e-9 ? H.roofFrontZ + (H.roofY - y) / H.glacisTan : H.sponsonFrontZ);
const hullRearZ = y => (y >= H.widestY - 1e-9 ? H.roofRearZ - (H.roofY - y) * rearUpperSlope : H.rearKinkZ + (H.widestY - y) * rearLowerSlope);
const glacisZ = y => H.roofFrontZ + (H.roofY - y) / H.glacisTan;
const rearPlateZ = y => H.roofRearZ - (H.roofY - y) * rearUpperSlope;
const sideX = y => H.roofHalf + (H.roofY - y) * sideSlope;

function upperHull() {
  // Cross-section, counter-clockwise when seen from the front (+X right, +Y up).
  const half = [
    [H.roofHalf, H.roofY], [sideX(glacisBottomY), glacisBottomY], [H.widestHalf, H.widestY],
    [H.widestHalf, H.stripBottomY], [H.lipX, H.lipY], [H.floorOuterX, H.floorY], [H.tubHalf, H.floorY],
  ];
  const section = [
    ...half.map(([x, y]) => [-x, y]),
    ...half.slice().reverse().map(([x, y]) => [x, y]),
  ];
  const m = new Mesh();
  const front = section.map(([x, y]) => m.vertex([x, y, hullFrontZ(y)]));
  const rear = section.map(([x, y]) => m.vertex([x, y, hullRearZ(y)]));
  const n = section.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, [x0, y0] = section[i], [x1, y1] = section[j];
    m.quad(front[i], front[j], rear[j], rear[i], [y1 - y0, -(x1 - x0), 0]);
  }
  const at = pred => section.map((p, i) => (pred(p) ? i : -1)).filter(i => i >= 0);
  // Section order starts at -X roof edge; the upper group wraps around index 0/n-1.
  const glacis = [n - 2, n - 1, 0, 1].filter(i => section[i][1] >= glacisBottomY - 1e-9);
  m.polygon(glacis.map(i => front[i]), [0, 1 / H.glacisTan, 1]);
  const lowerFront = [1, ...at(([, y]) => y < glacisBottomY - 1e-9), n - 2];
  m.polygon(lowerFront.map(i => front[i]), [0, 0, 1]);
  const rearUpper = [n - 3, n - 2, n - 1, 0, 1, 2];
  m.polygon(rearUpper.map(i => rear[i]), [0, rearUpperSlope, -1]);
  const rearLower = [2, ...at(([, y]) => y < H.widestY - 1e-9), n - 3];
  m.polygon(rearLower.map(i => rear[i]), [0, -rearLowerSlope, -1]);
  return m.node('m10-welded-upper-hull');
}

function hullDetails() {
  const nodes = [];
  const sides = [['left', -1], ['right', 1]];
  // Front fenders: side lip, flat top and sloped nose.
  for (const [side, s] of sides) {
    const outerX = H.widestHalf, width = outerX - H.fenderInnerX, cx = s * (H.fenderInnerX + width / 2);
    nodes.push(extrude(`${side}-front-fender-lip`, zyOutline([[H.sponsonFrontZ, H.fenderTopY], [H.fenderKneeZ, H.fenderTopY], [H.fenderTipZ, H.fenderTipY], [H.sponsonFrontZ, H.fenderBottomY]]),
      0.035, [s > 0 ? outerX - 0.035 : -outerX, 0, 0], ALONG_X));
    const topLen = H.fenderKneeZ - H.sponsonFrontZ;
    nodes.push(box(`${side}-front-fender-top`, [width, 0.025, topLen], [cx, H.fenderTopY - 0.0125, H.sponsonFrontZ + topLen / 2]));
    const dz = H.fenderTipZ - H.fenderKneeZ, dy = H.fenderTopY - H.fenderTipY, noseLen = Math.hypot(dz, dy);
    nodes.push(box(`${side}-front-fender-nose`, [width, 0.025, noseLen], [cx, (H.fenderTopY + H.fenderTipY) / 2 - 0.0125, (H.fenderKneeZ + H.fenderTipZ) / 2], 'hullPrimary', [Math.atan2(dy, dz), 0, 0]));
  }
  // Differential housing, bolted flange and final drives.
  nodes.push(extrude('m4a2-sharp-nose-differential-housing', zyOutline(H.diffProfile), H.diffHalf * 2, [-H.diffHalf, 0, 0], ALONG_X));
  nodes.push(box('differential-bolted-flange', [H.diffHalf * 2, 0.045, 0.09], [0, 1.30, 2.46]));
  nodes.push({id: 'differential-flange-bolts', type: 'repeat', count: 13, step: [0.12, 0, 0], position: [-0.72, 1.33, 2.46],
    child: cyl('differential-flange-bolt', 0.017, 0.017, 0.02, [0, 0, 0], undefined, 'steel', 8)});
  for (const [side, s] of sides) {
    nodes.push(sphere(`${side}-final-drive-housing`, [s * 0.80, 0.86, 2.58], [0.17, 0.33, 0.31]));
    nodes.push(box(`${side}-front-tow-shackle`, [0.10, 0.13, 0.12], [s * 0.42, 0.62, 2.86], 'steel'));
  }
  // Glacis fittings: headlamps with guards, appliqué bosses.
  const L = P.detail.headlamp;
  for (const [side, s] of sides) {
    const y = L.y, z = glacisZ(y) + 0.065, x = s * L.x;
    nodes.push(cyl(`${side}-headlamp-housing`, 0.085, 0.085, 0.14, [x, y, z], AXIS_Z));
    nodes.push(cyl(`${side}-headlamp-lens`, 0.064, 0.064, 0.012, [x, y, z + 0.072], AXIS_Z, 'lamp'));
    if (L.guardFrontZ === null) {
      nodes.push(box(`${side}-headlamp-guard-top`, [0.25, 0.02, 0.16], [x, y + 0.12, z + 0.01], 'steel'));
      for (const g of [-1, 1]) nodes.push(box(`${side}-headlamp-guard-${g > 0 ? 'outer' : 'inner'}`, [0.02, 0.19, 0.15], [x + g * s * 0.12, y + 0.03, z], 'steel'));
    } else {
      // Bent bar guard: two arms from the glacis, uprights in front of the lamp.
      const topY = y + 0.12, armZ0 = glacisZ(topY), bottomY = y - 0.28;
      for (const g of [-1, 1]) {
        const gx = x + g * 0.10, tag = g * s > 0 ? 'outer' : 'inner';
        nodes.push(box(`${side}-headlamp-guard-arm-${tag}`, [0.02, 0.02, L.guardFrontZ - armZ0], [gx, topY, (L.guardFrontZ + armZ0) / 2], 'steel'));
        nodes.push(box(`${side}-headlamp-guard-upright-${tag}`, [0.02, topY - bottomY, 0.02], [gx, (topY + bottomY) / 2, L.guardFrontZ], 'steel'));
        const footZ = glacisZ(bottomY);
        nodes.push(box(`${side}-headlamp-guard-foot-${tag}`, [0.02, 0.02, L.guardFrontZ - footZ + 0.02], [gx, bottomY, (L.guardFrontZ + footZ) / 2], 'steel'));
      }
      nodes.push(box(`${side}-headlamp-guard-top`, [0.22, 0.02, 0.02], [x, topY, L.guardFrontZ], 'steel'));
    }
  }
  const glacisNormal = unit([0, 1 / H.glacisTan, 1]);
  [[-0.57, 1.60], [-0.33, 1.68], [-0.12, 1.39], [0.12, 1.39], [0.33, 1.68], [0.57, 1.60]].forEach(([x, y], i) => {
    const p = addv([x, y, glacisZ(y)], mul(glacisNormal, 0.012));
    nodes.push(cyl(`glacis-applique-boss-${i}`, 0.042, 0.046, 0.035, p, eulerFromYAxis(glacisNormal), 'hullPrimary', 12));
  });
  // Driver and assistant driver hatches on the front roof.
  for (const [side, s] of sides) {
    nodes.push(cyl(`${side}-crew-hatch`, 0.19, 0.19, 0.035, [s * 0.72, H.roofY + 0.017, 1.42], undefined, 'hullPrimary', 32));
    nodes.push(box(`${side}-crew-hatch-hinge`, [0.07, 0.045, 0.26], [s * 0.93, H.roofY + 0.022, 1.42], 'steel'));
    nodes.push(box(`${side}-hatch-periscope`, [0.15, 0.05, 0.09], [s * 0.72, H.roofY + 0.025, 1.565]));
  }
  // Appliqué armour bosses on both sloped side plates (two rows, six columns).
  for (const [side, s] of sides) {
    const n = unit([s * (H.roofY - H.widestY), H.widestHalf - H.roofHalf, 0]);
    [1.73, 1.366].forEach((y, row) => [1.409, 0.524, -0.085, -0.909, -1.518, -2.372].forEach((z, col) => {
      const p = addv([s * sideX(y), y, z], mul(n, 0.012));
      nodes.push(cyl(`${side}-side-applique-boss-${row}-${col}`, 0.042, 0.046, 0.035, p, eulerFromYAxis(n), 'hullPrimary', 12));
    }));
  }
  // Engine deck: louvred inlet, filler caps, rear access plate, gun travel lock.
  nodes.push(box('engine-deck-inlet-grille', [1.10, 0.02, 0.80], [0, H.roofY + 0.01, -1.48], 'grille'));
  nodes.push({id: 'engine-deck-louvres', type: 'repeat', count: 12, step: [0.092, 0, 0], position: [-0.506, H.roofY + 0.028, -1.48],
    child: box('engine-deck-louvre', [0.026, 0.022, 0.78], [0, 0, 0])});
  for (const [side, s] of sides) P.detail.fillerCaps.forEach(([x, z, shape], i) => nodes.push(shape === 'dome'
    ? sphere(`${side}-filler-cap-${i}`, [s * x, H.roofY, z], [0.12, 0.075, 0.12])
    : cyl(`${side}-filler-cap-${i}`, 0.07, 0.07, 0.03, [s * x, H.roofY + 0.015, z], undefined, 'hullPrimary', 24)));
  nodes.push(box('rear-engine-access-plate', [1.75, 0.02, 0.62], [0, H.roofY + 0.01, -2.29]));
  const lock = P.detail.travelLock;
  if (lock.upright) {
    // Folding gun travel lock, raised: base plate and two uprights forming the cradle.
    nodes.push(box('gun-travel-lock-base', [0.32, 0.04, 0.12], [0, H.roofY + 0.04, lock.z], 'steel'));
    for (const s of [-1, 1]) nodes.push(box(`gun-travel-lock-upright-${s > 0 ? 'left' : 'right'}`, [0.05, 0.19, 0.06], [s * 0.12, H.roofY + 0.115, lock.z], 'steel'));
  } else {
    nodes.push(box('gun-travel-lock-base', [0.32, 0.05, 0.26], [0, H.roofY + 0.025, lock.z], 'steel'));
    for (const s of [-1, 1]) nodes.push(box(`gun-travel-lock-jaw-${s > 0 ? 'left' : 'right'}`, [0.05, 0.04, 0.18], [s * 0.10, H.roofY + 0.07, lock.z], 'steel'));
  }
  // Tow cable along the vehicle-right roof edge and the right-front antenna.
  nodes.push(cyl('tow-cable', 0.018, 0.018, 3.65, [-1.05, H.roofY + 0.018, -0.575], AXIS_Z, 'darkMetal', 8));
  for (const [end, z] of [['front', 1.25], ['rear', -2.40]]) nodes.push(box(`tow-cable-eye-${end}`, [0.05, 0.04, 0.12], [-1.05, H.roofY + 0.02, z], 'steel'));
  if (P.detail.cableRearBracket) nodes.push(box('tow-cable-rear-clamp', [0.10, 0.08, 0.30], [-1.05, H.roofY + 0.04, -1.82], 'steel'));
  const antennaY = H.roofY - (1.36 - H.roofHalf) / sideSlope;
  nodes.push(box('antenna-bracket', [0.09, 0.08, 0.11], [-1.36, antennaY + 0.02, 1.20], 'steel'));
  nodes.push(cyl('antenna-base', 0.045, 0.05, 0.08, [-1.36, antennaY + 0.1, 1.20], undefined, 'darkMetal', 12));
  const whipBottom = antennaY + 0.14, whipTop = 3.44;
  nodes.push(cyl('antenna-whip', 0.006, 0.008, whipTop - whipBottom, [-1.36, (whipTop + whipBottom) / 2, 1.20], undefined, 'darkMetal', 8));
  // Rear plate: tail lights, pioneer tools; lower hull: exhaust, tow pintle, shackles.
  // Local +Y follows the up-slope of the leaning rear plate.
  const rearTilt = [Math.atan(rearUpperSlope), 0, 0];
  for (const [side, s] of sides) {
    const y = 1.52, z = rearPlateZ(y) - 0.03;
    nodes.push(box(`${side}-tail-light`, [0.12, 0.14, 0.06], [s * 1.0, y, z], 'lamp', rearTilt));
    for (const g of [-1, 1]) nodes.push(box(`${side}-tail-light-guard-${g > 0 ? 'a' : 'b'}`, [0.02, 0.18, 0.1], [s * 1.0 + g * 0.09, y, z - 0.02], 'steel', rearTilt));
  }
  nodes.push(box('rear-shovel-handle', [0.80, 0.032, 0.032], [0.30, 1.64, rearPlateZ(1.64) - 0.025], 'accessory', rearTilt));
  nodes.push(box('rear-shovel-blade', [0.20, 0.14, 0.03], [0.78, 1.64, rearPlateZ(1.64) - 0.025], 'steel', rearTilt));
  nodes.push(box('rear-crowbar', [1.30, 0.03, 0.03], [-0.15, 1.40, rearPlateZ(1.40) - 0.025], 'steel', [rearTilt[0], 0, 0.06]));
  const tubRearZ = y => H.tubRearBottomZ + (y - H.tubBottomY) / (H.floorY - H.tubBottomY) * (H.tubRearTopZ - H.tubRearBottomZ);
  const R = P.detail.rear;
  nodes.push(box('rear-exhaust-deflector', [1.52, 0.34, R.deflectorDepth], [0, 0.87, tubRearZ(0.87) - R.deflectorDepth / 2], 'darkMetal'));
  for (const [i, x] of [[0, -0.10], [1, 0.085]]) nodes.push(cyl(`twin-diesel-exhaust-${i}`, 0.05, 0.05, 0.03, [x, 0.89, tubRearZ(0.87) - R.deflectorDepth - 0.01], AXIS_Z, 'grille', 16));
  nodes.push(box('rear-tow-pintle', [0.14, 0.14, R.pintleDepth], [0, 0.49, tubRearZ(0.49) - R.pintleDepth / 2 + 0.01], 'steel'));
  for (const [side, s] of sides) nodes.push(box(`${side}-rear-tow-shackle`, [0.10, 0.14, R.shackleDepth], [s * 0.56, 0.58, tubRearZ(0.58) - R.shackleDepth / 2 + 0.01], 'steel'));
  return nodes;
}

function hullSlot() {
  return [
    extrude('m4a2-lower-hull-tub', zyOutline([[H.tubFrontZ, H.tubBottomY], [H.tubRearBottomZ, H.tubBottomY], [H.tubRearTopZ, H.floorY], [H.tubFrontZ, H.floorY]]),
      H.tubHalf * 2, [-H.tubHalf, 0, 0], ALONG_X),
    upperHull(),
    ...hullDetails(),
  ];
}

// ---------------------------------------------------------------------------
// Running gear.
// ---------------------------------------------------------------------------
const T = P.track;
const returnRollerR = 0.085;

// Belt path around circles listed counter-clockwise in (Z, Y); returns [z, y].
function beltLoop(circles, step = Math.PI / 18) {
  const n = circles.length, tangents = [];
  for (let i = 0; i < n; i++) {
    const A = circles[i], B = circles[(i + 1) % n];
    const D = sub(B.c, A.c), L = len(D), d = mul(D, 1 / L), R = [d[1], -d[0]];
    const sb = (A.r - B.r) / L, cb = Math.sqrt(1 - sb * sb);
    const nrm = [cb * R[0] + sb * d[0], cb * R[1] + sb * d[1]];
    tangents.push({a: Math.atan2(nrm[1], nrm[0]), pa: addv(A.c, mul(nrm, A.r)), pb: addv(B.c, mul(nrm, B.r))});
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const tin = tangents[(i + n - 1) % n], tout = tangents[i], C = circles[i];
    let sweep = tout.a - tin.a;
    while (sweep < 0) sweep += 2 * Math.PI;
    if (sweep > 2 * Math.PI - 1e-3) sweep = 0;
    const segs = Math.max(1, Math.ceil(sweep / step));
    for (let k = 0; k <= (sweep > 1e-6 ? segs : 0); k++) {
      const a = tin.a + sweep * k / segs;
      pts.push([C.c[0] + C.r * Math.cos(a), C.c[1] + C.r * Math.sin(a)]);
    }
  }
  // Drop consecutive duplicates.
  return pts.filter((p, i) => i === 0 || len(sub(p, pts[i - 1])) > 1e-4).filter((p, i, a) => i < a.length - 1 || len(sub(p, a[0])) > 1e-4);
}
function wheelZs() { return T.bogieZ.flatMap(z => [z + T.pairHalf, z - T.pairHalf]); }
function beltCircles(offset) {
  const wheels = wheelZs().sort((a, b) => a - b).map(z => ({c: [z, T.wheelY], r: T.wheelR + offset.wheel}));
  return [...wheels, {c: T.sprocket, r: T.pulleyOuterR - T.beltThickness + offset.pulley}, {c: T.idler, r: T.pulleyOuterR - T.beltThickness + offset.pulley}];
}
const outerLoop = () => beltLoop(beltCircles({wheel: T.bottomThickness, pulley: T.beltThickness}));
const innerLoop = () => beltLoop(beltCircles({wheel: 0, pulley: 0}));
// Inner surface height of the upper run at a given Z (straight line between pulley tops).
function innerTopY(z) {
  const r = T.pulleyOuterR - T.beltThickness;
  const [zs, ys] = T.sprocket, [zi, yi] = T.idler;
  return yi + r + (z - zi) / (zs - zi) * (ys - yi);
}

function trackSide(side, s) {
  const cx = s * T.x, hullward = -s, nodes = [];
  const outer = outerLoop(), inner = innerLoop();
  nodes.push(extrude(`${side}-continuous-track`, zyOutline(outer), T.width, [cx - T.width / 2, 0, 0], ALONG_X, 'track', [zyOutline(inner)]));
  T.bogieZ.forEach((bz, b) => {
    const children = [];
    for (const [end, dz] of [['front', T.pairHalf], ['rear', -T.pairHalf]]) {
      children.push(cyl(`${side}-bogie-${b}-tire-${end}`, T.wheelR, T.wheelR, 0.30, [0, T.wheelY, dz], AXIS_X, 'trackRubber', 24));
      children.push(cyl(`${side}-bogie-${b}-wheel-disc-${end}`, 0.205, 0.205, 0.315, [0, T.wheelY, dz], AXIS_X, 'steel', 24));
      children.push(cyl(`${side}-bogie-${b}-wheel-hub-${end}`, 0.067, 0.067, 0.35, [0, T.wheelY, dz], AXIS_X, 'steel', 16));
      const pivot = [0, 0.60, 0], hub = [0, T.wheelY, dz], mid = lerp(pivot, hub, 0.5), arm = sub(hub, pivot);
      children.push(box(`${side}-bogie-${b}-rocker-${end}`, [0.10, 0.075, len(arm) + 0.04], [hullward * 0.13, mid[1], mid[2]], 'hullPrimary', [Math.atan2(-arm[1], arm[2]), 0, 0]));
      children.push(cyl(`${side}-bogie-${b}-volute-${end}`, 0.055, 0.078, 0.28, [hullward * 0.16, 0.73, Math.sign(dz) * 0.13], undefined, 'steel', 16));
    }
    children.push(box(`${side}-bogie-${b}-cast-housing`, [0.27, 0.40, 0.33], [0, 0.72, 0]));
    children.push(box(`${side}-bogie-${b}-hull-bracket`, [0.24, 0.24, 0.30], [hullward * 0.19, 0.86, 0]));
    children.push(box(`${side}-bogie-${b}-spring-seat`, [0.30, 0.06, 0.52], [0, 0.935, 0]));
    children.push(box(`${side}-bogie-${b}-skid`, [0.23, 0.03, 0.50], [0, 0.975, 0.01], 'steel'));
    const rz = -0.435, ry = innerTopY(bz + rz) - returnRollerR;
    const armFrom = [0, 0.88, -0.10], armTo = [0, ry, rz], armDir = sub(armTo, armFrom), armMid = lerp(armFrom, armTo, 0.5);
    children.push(box(`${side}-bogie-${b}-return-arm`, [0.10, 0.07, len(armDir)], [hullward * 0.02, armMid[1], armMid[2]], 'steel', [Math.atan2(-armDir[1], armDir[2]), 0, 0]));
    children.push(cyl(`${side}-bogie-${b}-return-roller`, returnRollerR, returnRollerR, 0.26, [0, ry, rz], AXIS_X, 'trackRubber', 20));
    nodes.push(group(`${side}-vvss-bogie-${b}`, [cx, 0, bz], children));
  });
  // Drive sprocket (13 teeth) with final-drive hub.
  const [sz, sy] = T.sprocket;
  const teeth = Array.from({length: 26}, (_, i) => {
    const a = i * Math.PI / 13, r = i % 2 === 0 ? 0.25 : 0.215;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  nodes.push(extrude(`${side}-drive-sprocket-rim`, teeth, 0.30, [cx - 0.15, sy, sz], ALONG_X, 'steel'));
  nodes.push(cyl(`${side}-drive-sprocket-disc`, 0.19, 0.19, 0.34, [cx, sy, sz], AXIS_X, 'steel', 24));
  nodes.push(cyl(`${side}-drive-sprocket-hub`, 0.10, 0.10, 0.40, [cx + s * 0.02, sy, sz], AXIS_X, 'steel', 16));
  nodes.push(cyl(`${side}-final-drive-shaft-housing`, 0.12, 0.12, 0.22, [s * 0.90, sy, sz], AXIS_X, 'hullPrimary', 16));
  // Trailing idler with six spokes.
  const [iz, iy] = T.idler;
  nodes.push(extrude(`${side}-rear-idler-rim`, circle(0.245), 0.30, [cx - 0.15, iy, iz], ALONG_X, 'steel', [circle(0.20)]));
  nodes.push(cyl(`${side}-rear-idler-hub`, 0.09, 0.09, 0.36, [cx, iy, iz], AXIS_X, 'steel', 16));
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, rm = 0.145;
    nodes.push(box(`${side}-rear-idler-spoke-${k}`, [0.07, 0.12, 0.045], [cx + s * 0.06, iy + rm * Math.cos(a), iz + rm * Math.sin(a)], 'steel', [a, 0, 0]));
  }
  nodes.push(cyl(`${side}-idler-mount`, 0.08, 0.08, 0.22, [s * 0.90, iy, iz], AXIS_X, 'hullPrimary', 16));
  nodes.push(trackShoes(side, cx, outer));
  return nodes;
}

// Batched cleats on the outer run plus inward guide horns (visible below the upper run).
function trackShoes(side, cx, loop) {
  const seg = loop.map((p, i) => len(sub(loop[(i + 1) % loop.length], p)));
  const perimeter = seg.reduce((a, b) => a + b, 0), count = Math.round(perimeter / T.shoePitch);
  const m = new Mesh();
  // Loop is counter-clockwise in (Z, Y); the inward normal is the left normal.
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
    block(0.066, -0.015, 0.02, cx - T.width / 2, cx + T.width / 2);
    block(0.03, 0.10, 0.20, cx - 0.035, cx + 0.035);
  }
  return m.node(`${side}-batched-track-shoes`, 'track');
}

// ---------------------------------------------------------------------------
// Turret: open-topped shell with the duckbill counterweight.
// ---------------------------------------------------------------------------
const TU = P.turret;
function ringOf(level) {
  const pts = level.pts.map(([x, z, y]) => [x, y ?? level.y, z]);
  const apex = [0, level.y, level.apexZ];
  return [...pts, apex, ...pts.slice().reverse().map(([x, y, z]) => [-x, y, z])];
}
function offsetRing(ring, t, apexZ) {
  // Horizontal miter offset toward the inside of a convex ring.
  const n = ring.length;
  const area = ring.reduce((s, p, i) => { const q = ring[(i + 1) % n]; return s + p[0] * q[2] - q[0] * p[2]; }, 0);
  const inwardOf = (a, b) => { const e = unit([b[0] - a[0], 0, b[2] - a[2]]); return area > 0 ? [-e[2], 0, e[0]] : [e[2], 0, -e[0]]; };
  const apexIndex = (n - 1) / 2;
  return ring.map((p, i) => {
    // The solid counterweight fills the space behind the interior rear wall.
    if (i === apexIndex) return [0, p[1], apexZ];
    const n0 = inwardOf(ring[(i + n - 1) % n], p), n1 = inwardOf(p, ring[(i + 1) % n]);
    const bis = addv(n0, n1), k = t / (1 + dot(n0, n1));
    return addv(p, mul(bis, k));
  });
}
function turretShell() {
  const levels = [TU.bottom, TU.knee, TU.top].map(ringOf);
  const inner = levels.map(r => offsetRing(r, TU.wall, TU.innerApexZ));
  const m = new Mesh();
  const O = levels.map(r => r.map(p => m.vertex(p))), I = inner.map(r => r.map(p => m.vertex(p)));
  const n = levels[0].length;
  const centroid = r => mul(r.reduce(addv, [0, 0, 0]), 1 / r.length);
  for (let l = 0; l < 2; l++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, c = centroid(levels[l]);
    const mid = mul(addv(levels[l][i], levels[l][j]), 0.5), out = [mid[0] - c[0], 0, mid[2] - c[2]];
    m.quad(O[l][i], O[l][j], O[l + 1][j], O[l + 1][i], out);
    m.quad(I[l][i], I[l][j], I[l + 1][j], I[l + 1][i], mul(out, -1));
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    m.quad(O[2][i], O[2][j], I[2][j], I[2][i], [0, 1, 0]);
    m.quad(O[0][i], O[0][j], I[0][j], I[0][i], [0, -1, 0]);
  }
  return {node: m.node('m10-open-turret-shell'), levels};
}
// Point on the outer wall between two ring levels (edge i of each ring).
function wallPoint(levels, lower, edge, tEdge, tUp) {
  const a = lerp(levels[lower][edge], levels[lower][edge + 1], tEdge);
  const b = lerp(levels[lower + 1][edge], levels[lower + 1][edge + 1], tEdge);
  const p = lerp(a, b, tUp);
  const e = sub(levels[lower][edge + 1], levels[lower][edge]), up = sub(b, a);
  let n = unit(cross(up, e));
  if (dot(n, [p[0], 0, p[2]]) < 0) n = mul(n, -1);
  return {p, n};
}

function turretSlot() {
  const {node: shell, levels} = turretShell();
  // The race top doubles as the visible floor of the open fighting compartment.
  const nodes = [
    cyl('turret-race', 0.95, 0.95, 0.08, [0, 0.03, 0], undefined, 'darkMetal', 48),
    shell,
  ];
  // Appliqué bosses on the front side plates (vehicle left edge indices 0..3 on +X).
  const bosses = [[1, 1, 0.35, 0.55], [1, 1, 0.75, 0.5], [1, 0, 0.3, 0.55], [1, 0, 0.7, 0.5]];
  for (const [side, mirror] of [['left', -1], ['right', 1]]) {
    bosses.forEach(([edge, lower, tEdge, tUp], i) => {
      const {p, n} = wallPoint(levels, lower, edge, tEdge, tUp);
      const q = addv(p, mul(n, 0.012)), nn = n.slice();
      if (mirror < 0) { q[0] *= -1; nn[0] *= -1; }
      nodes.push(cyl(`${side}-turret-applique-boss-${i}`, 0.04, 0.044, 0.035, q, eulerFromYAxis(nn), 'hullPrimary', 12));
    });
  }
  // Lifting rings on the front cheek tops.
  for (const [side, s] of [['left', -1], ['right', 1]]) {
    nodes.push(extrude(`${side}-turret-lifting-ring`, circle(0.06, 20), 0.03, [s * 0.49 - 0.015, 0.66, 1.10], ALONG_X, 'steel', [circle(0.035, 20)]));
    nodes.push(box(`${side}-turret-lifting-ring-base`, [0.05, 0.06, 0.09], [s * 0.49, 0.585, 1.10], 'steel'));
  }
  // .50 cal M2 on the rear pintle, stowed facing aft as in the drawing.
  nodes.push(group('m2-hb-rear-pintle-mg', [0, 0, 0], [
    cyl('m2-pintle-post', 0.028, 0.035, 0.26, [0, 0.90, -1.10], undefined, 'darkMetal', 12),
    box('m2-cradle', [0.10, 0.07, 0.20], [0, 1.02, -1.02], 'darkMetal'),
    box('m2-receiver', [0.13, 0.15, 0.44], [0, 1.07, -0.83], 'darkMetal'),
    box('m2-spade-grips', [0.14, 0.09, 0.06], [0, 1.06, -0.58], 'darkMetal'),
    cyl('m2-barrel-jacket', 0.028, 0.028, 0.26, [0, 1.075, -1.18], AXIS_Z, 'darkMetal', 12),
    cyl('m2-barrel', 0.016, 0.022, 0.62, [0, 1.075, -1.58], AXIS_Z, 'darkMetal', 12),
    box('m2-ammo-can', [0.10, 0.17, 0.27], [0.14, 1.03, -0.86], 'accessory'),
  ]));
  return nodes;
}

// ---------------------------------------------------------------------------
// Gun: M5 mount shield, 3-inch M7 barrel, breech inside the open turret.
// ---------------------------------------------------------------------------
const G = P.gun;
function gunSlot() {
  const m = new Mesh();
  const r = G.shieldRear, f = G.shieldFront;
  convexBox(m, [
    [-r.half, r.lo, r.z], [r.half, r.lo, r.z], [r.half, r.hi, r.z], [-r.half, r.hi, r.z],
    [-f.half, f.lo, f.z], [f.half, f.lo, f.z], [f.half, f.hi, f.z], [-f.half, f.hi, f.z],
  ]);
  const barrelLen = G.muzzle - G.barrelStart;
  return [
    m.node('m5-mount-gun-shield', 'mantlet'),
    cyl('gun-shield-collar', 0.16, 0.16, 0.10, [0, 0, f.z + 0.05], AXIS_Z, 'mantlet', 32),
    cyl('gun-shield-bell', 0.115, 0.13, 0.08, [0, 0, f.z + 0.14], AXIS_Z, 'mantlet', 32),
    cyl('3in-m7-barrel', G.barrelMuzzleR, G.barrelRootR, barrelLen, [0, 0, G.barrelStart + barrelLen / 2], AXIS_Z, 'barrel', 24),
    cyl('3in-m7-muzzle', G.barrelMuzzleR + 0.005, G.barrelMuzzleR + 0.005, 0.05, [0, 0, G.muzzle - 0.025], AXIS_Z, 'barrel', 24),
    cyl('telescope-port', 0.022, 0.022, 0.016, [-0.18, 0.06, f.z + 0.005], AXIS_Z, 'grille', 16),
    box('3in-m7-breech-ring', [0.30, 0.30, 0.42], [0, 0, r.z - 0.21], 'steel'),
    cyl('recoil-cylinder', 0.05, 0.05, 0.55, [0, 0.19, r.z - 0.10], AXIS_Z, 'steel', 16),
    box('breech-deflector-guard', [0.34, 0.04, 0.46], [0, -0.19, r.z - 0.30], 'steel'),
  ];
}

// ---------------------------------------------------------------------------
// Armour plates (OBB hitboxes).
// ---------------------------------------------------------------------------
const plates = [];
// Fit an OBB to a planar quad; the outer face lies on the surface.
// The collision routine resolves the hit face by testing local X, then Y, then Z
// within 10 mm, so thickness goes on local X (no dead band along any plate edge)
// and each plate grows by `pad` in-plane so neighbouring plates overlap at seams.
function plate(id, name, zone, parent, corners, thickness, outwardHint, halfThick = 0.02, pad = 0) {
  const c = mul(corners.reduce(addv, [0, 0, 0]), 1 / corners.length);
  const round = x => Math.round(x * 1e6) / 1e6;
  if (PASS >= 3) {
    // Mean-edge rectangle of the (possibly skewed, non-planar) quad p0 p1 p2 p3:
    // it splits the difference on trapezoids instead of covering the union,
    // which left bounding-box corners standing proud of the turret walls.
    const [p0, p1, p2, p3] = corners;
    const uVec = mul(addv(sub(p1, p0), sub(p2, p3)), 0.5), vVec = mul(addv(sub(p3, p0), sub(p2, p1)), 0.5);
    let n = unit(cross(uVec, vVec));
    if (dot(n, outwardHint) < 0) n = mul(n, -1);
    const u = unit(sub(uVec, mul(n, dot(uVec, n)))), v = cross(n, u);
    plates.push({id, name, zone,
      halfExtents: [halfThick, Math.abs(dot(uVec, u)) / 2 + pad, Math.abs(dot(vVec, v)) / 2 + pad].map(round),
      position: addv(c, mul(n, -halfThick)).map(round), rotation: eulerFromBasis(n, u, v).map(round), armorThickness: thickness, parent});
    return;
  }
  let u = unit(sub(corners[1], corners[0]));
  let n = unit(cross(sub(corners[1], corners[0]), sub(corners[corners.length - 1], corners[0])));
  if (dot(n, outwardHint) < 0) n = mul(n, -1);
  u = unit(sub(u, mul(n, dot(u, n))));
  const v = cross(u, n);
  const us = corners.map(p => dot(sub(p, c), u)), vs = corners.map(p => dot(sub(p, c), v));
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const center = addv(addv(c, addv(mul(u, (u0 + u1) / 2), mul(v, (v0 + v1) / 2))), mul(n, -halfThick));
  plates.push({id, name, zone, halfExtents: [(u1 - u0) / 2 + pad, halfThick, (v1 - v0) / 2 + pad].map(round), position: center.map(round),
    rotation: eulerFromBasis(u, n, v).map(round), armorThickness: thickness, parent});
}
function hullArmor() {
  const sides = [['left', -1], ['right', 1]];
  // Glacis in three strips; each uses its mean width so the trapezoid edges
  // stay within half a strip of the sloped side plates.
  const gy = [H.roofY, H.roofY - (H.roofY - glacisBottomY) / 3, H.roofY - 2 * (H.roofY - glacisBottomY) / 3, glacisBottomY];
  ['upper', 'middle', 'lower'].forEach((part, k) => {
    const y0 = gy[k], y1 = gy[k + 1], x = sideX((y0 + y1) / 2);
    plate(`hull-glacis-${part}`, `Glacis (${part})`, 'hull', 'hull',
      [[-x, y0, glacisZ(y0)], [x, y0, glacisZ(y0)], [x, y1, glacisZ(y1)], [-x, y1, glacisZ(y1)]], 38, [0, 1 / H.glacisTan, 1]);
  });
  // Vertical front below the glacis: centre section and sponson faces.
  plate('hull-front-vertical', 'Hull Front Plate', 'hull', 'hull',
    [[-H.tubHalf, glacisBottomY, H.sponsonFrontZ], [H.tubHalf, glacisBottomY, H.sponsonFrontZ], [H.tubHalf, H.floorY, H.sponsonFrontZ], [-H.tubHalf, H.floorY, H.sponsonFrontZ]], 38, [0, 0, 1]);
  for (const [side, s] of sides) {
    plate(`hull-sponson-front-${side}`, `Sponson Front ${side}`, 'hull', 'hull',
      [[s * H.tubHalf, glacisBottomY, H.sponsonFrontZ], [s * H.widestHalf, glacisBottomY, H.sponsonFrontZ], [s * H.widestHalf, H.lipY, H.sponsonFrontZ], [s * H.tubHalf, H.lipY, H.sponsonFrontZ]], 38, [0, 0, 1]);
  }
  // Differential housing: upper slope, nose and lower slope (51 mm casting).
  // The profile runs counter-clockwise in (Z, Y), so the right normal points out.
  const dp = H.diffProfile, dh = H.diffHalf;
  const diffSegments = PASS >= 3
    // One chord per profile segment: a single chord across a corner sat up to 0.13 m inside the casting.
    ? [['lower', 1, 2], ['nose-lower', 2, 3], ['nose-upper', 3, 4], ['upper', 4, 5], ['top', 5, 6]]
    : [['lower', 1, 2], ['nose', 2, 4], ['upper', 4, 6]];
  diffSegments.forEach(([part, a, b]) => {
    const [za, ya] = dp[a], [zb, yb] = dp[b];
    plate(`hull-differential-${part}`, `Differential Housing (${part})`, 'hull', 'hull',
      [[-dh, ya, za], [dh, ya, za], [dh, yb, zb], [-dh, yb, zb]], 51, [0, -(zb - za), yb - ya]);
  });
  // Sloped upper sides split along Z so no box extends past the glacis or rear plate.
  const cuts = [H.sponsonFrontZ, 2.21, 2.03, 1.85, H.roofFrontZ, 0.20, -1.25, H.roofRearZ, -2.80, H.rearKinkZ];
  for (const [side, s] of sides) {
    const nrm = [s * (H.roofY - H.widestY), H.widestHalf - H.roofHalf, 0];
    for (let k = 0; k < cuts.length - 1; k++) {
      const z0 = cuts[k], z1 = cuts[k + 1], zm = (z0 + z1) / 2;
      let top = H.roofY;
      if (zm > H.roofFrontZ) top = H.roofY - (zm - H.roofFrontZ) * H.glacisTan;
      if (zm < H.roofRearZ) top = H.roofY - (H.roofRearZ - zm) / rearUpperSlope;
      const bottom = H.widestY;
      plate(`hull-side-${side}-${k}`, `Upper Side ${side} ${k}`, 'hull', 'hull',
        [[s * sideX(top), top, z0], [s * sideX(top), top, z1], [s * sideX(bottom), bottom, z1], [s * sideX(bottom), bottom, z0]], 19, nrm);
    }
    const stripRearZ = (hullRearZ(H.widestY) + hullRearZ(H.stripBottomY)) / 2, lipRearZ = (hullRearZ(H.stripBottomY) + hullRearZ(H.lipY)) / 2;
    plate(`hull-side-strip-${side}`, `Sponson Strip ${side}`, 'hull', 'hull',
      [[s * H.widestHalf, H.widestY, H.sponsonFrontZ], [s * H.widestHalf, H.widestY, stripRearZ], [s * H.widestHalf, H.stripBottomY, stripRearZ], [s * H.widestHalf, H.stripBottomY, H.sponsonFrontZ]], 19, [s, 0, 0]);
    plate(`hull-sponson-lip-${side}`, `Sponson Lip ${side}`, 'hull', 'hull',
      [[s * H.widestHalf, H.stripBottomY, H.sponsonFrontZ], [s * H.widestHalf, H.stripBottomY, lipRearZ], [s * H.lipX, H.lipY, lipRearZ], [s * H.lipX, H.lipY, H.sponsonFrontZ]], 19, [s * (H.stripBottomY - H.lipY), -(H.widestHalf - H.lipX), 0]);
  }
  // Roof and engine deck (13 mm).
  plate('hull-roof', 'Hull Roof', 'hull', 'hull',
    [[-H.roofHalf, H.roofY, H.roofFrontZ], [H.roofHalf, H.roofY, H.roofFrontZ], [H.roofHalf, H.roofY, H.roofRearZ], [-H.roofHalf, H.roofY, H.roofRearZ]], 13, [0, 1, 0]);
  // Rear upper plate: full-height centre plus two lower corner sections.
  const rearOut = [0, rearUpperSlope, -1];
  plate('hull-rear-upper', 'Upper Rear Plate', 'hull', 'hull',
    [[-H.roofHalf, H.roofY, H.roofRearZ], [H.roofHalf, H.roofY, H.roofRearZ], [H.roofHalf, H.widestY, H.rearKinkZ], [-H.roofHalf, H.widestY, H.rearKinkZ]], 19, rearOut);
  for (const [side, s] of sides) {
    const y = (H.roofY + H.widestY) / 2 - 0.08;
    plate(`hull-rear-corner-${side}`, `Rear Corner ${side}`, 'hull', 'hull',
      [[s * H.roofHalf, y, rearPlateZ(y)], [s * sideX(y), y, rearPlateZ(y)], [s * H.widestHalf, H.widestY, H.rearKinkZ], [s * H.roofHalf, H.widestY, H.rearKinkZ]], 19, rearOut);
  }
  plate('hull-rear-sponson-lower', 'Rear Sponson Lower', 'hull', 'hull',
    [[-H.widestHalf, H.widestY, H.rearKinkZ], [H.widestHalf, H.widestY, H.rearKinkZ], [H.widestHalf, H.lipY, H.rearBottomZ], [-H.widestHalf, H.lipY, H.rearBottomZ]], 19, [0, -rearLowerSlope, -1]);
  plate('hull-rear-lower', 'Lower Hull Rear', 'hull', 'hull',
    [[-H.tubHalf, H.floorY, H.tubRearTopZ], [H.tubHalf, H.floorY, H.tubRearTopZ], [H.tubHalf, H.tubBottomY, H.tubRearBottomZ], [-H.tubHalf, H.tubBottomY, H.tubRearBottomZ]], 25, [0, 0, -1]);
  // Tracks.
  const outer = outerLoop();
  const zMax = Math.max(...outer.map(p => p[0])), zMin = Math.min(...outer.map(p => p[0])), yMax = Math.max(...outer.map(p => p[1]));
  const r6 = x => Math.round(x * 1e6) / 1e6;
  // Pass 3 pieces are 40 mm slabs on the outer belt face: a full-width box shorter
  // than the track is wide would make Z its thickness axis and reject side hits.
  const trackBox = (id, name, side, s, z0, z1, y0, y1) => plates.push({id, name, zone: 'track',
    halfExtents: [PASS >= 3 ? 0.02 : T.width / 2, (y1 - y0) / 2, (z1 - z0) / 2].map(r6),
    position: [s * (PASS >= 3 ? T.x + T.width / 2 - 0.02 : T.x), (y0 + y1) / 2, (z0 + z1) / 2].map(r6),
    rotation: [0, 0, 0], armorThickness: 20, isTrack: side, parent: 'hull'});
  if (PASS < 3) {
    for (const [side, s] of sides) trackBox(`track-${side}`, `${side[0].toUpperCase()}${side.slice(1)} Track`, side, s, zMin, zMax, 0, yMax);
    return;
  }
  // One box around the rounded track ends left empty corners with invisible armour;
  // follow the belt outline in <=0.3 m steps over the ends (vertical extent at each step centre).
  const yRange = z => {
    const ys = [];
    outer.forEach((a, i) => { const b = outer[(i + 1) % outer.length]; if ((a[0] - z) * (b[0] - z) <= 0 && a[0] !== b[0]) ys.push(a[1] + (z - a[0]) / (b[0] - a[0]) * (b[1] - a[1])); });
    return [Math.min(...ys), Math.max(...ys)];
  };
  const firstWheel = Math.max(...wheelZs()), lastWheel = Math.min(...wheelZs());
  const steps = (a, b) => { const n = Math.ceil((b - a) / 0.3 - 1e-9); return Array.from({length: n}, (_, i) => [a + (b - a) * i / n, a + (b - a) * (i + 1) / n]); };
  const pieces = [...steps(zMin, lastWheel), [lastWheel, firstWheel], ...steps(firstWheel, zMax)];
  for (const [side, s] of sides) pieces.forEach(([z0, z1], k) => {
    const [y0, y1] = z1 - z0 > 1 ? [0, Math.min(yRange(z0 + 0.05)[1], yRange(z1 - 0.05)[1])] : yRange((z0 + z1) / 2);
    trackBox(`track-${side}-${k}`, `${side[0].toUpperCase()}${side.slice(1)} Track ${k + 1}`, side, s, z0, z1, y0, y1);
  });
}
function turretArmor(levels) {
  // Outer wall quads per ring edge and band. The turret is open-topped: there is
  // deliberately no roof plate, so plunging hits reach the walls or hull roof.
  // Ring order: f+, m+, s+, r+, apex, r-, s-, m-, f- ("left" is -X, as in the node ids).
  const edges = [
    ['front-cheek-right'], ['front-side-right'], ['rear-side-right'], ['counterweight-right'],
    ['counterweight-left'], ['rear-side-left'], ['front-side-left'], ['front-cheek-left'], ['front-plate'],
  ];
  const n = levels[0].length;
  // From pass 3 each wall quad is split along the ring: the rings have
  // different corner positions, so whole quads are strongly skewed. The mean-edge
  // fit then needs a small overlap so neighbouring slabs meet at the seams.
  // Only the skewed front-side and counterweight quads are split, which keeps the
  // plate count (and per-projectile collision cost) near the other tanks.
  const pad = PASS >= 3 ? 0.015 : 0;
  edges.forEach(([part], i) => {
    const j = (i + 1) % n;
    const splits = PASS < 3 ? 1 : part.startsWith('front-side') ? 3 : part.startsWith('counterweight') ? 2 : 1;
    for (const [band, l] of [['lower', 0], ['upper', 1]]) for (let k = 0; k < splits; k++) {
      const t0 = k / splits, t1 = (k + 1) / splits;
      const q = [lerp(levels[l][i], levels[l][j], t0), lerp(levels[l][i], levels[l][j], t1), lerp(levels[l + 1][i], levels[l + 1][j], t1), lerp(levels[l + 1][i], levels[l + 1][j], t0)];
      const c = mul(q.reduce(addv, [0, 0, 0]), 1 / 4);
      // Names are unique: the select screen keys its armour inspection meshes by name.
      plate(`turret-${part}-${band}${splits > 1 ? `-${k}` : ''}`, `Turret ${part.replace(/-/g, ' ')} (${band}${splits > 1 ? ` ${k + 1}/${splits}` : ''})`, 'turret', 'turret', q, 25, [c[0], 0, c[2]], 0.02, pad);
    }
  });
  if (PASS < 3) return;
  // Narrow slabs along the counterweight ridge: the two V faces meet at the rear
  // apex at an angle, and rays straight from behind slipped between their slabs.
  const apex = (n - 1) / 2;
  for (const [band, l] of [['lower', 0], ['upper', 1]]) {
    const a = levels[l][apex], b = levels[l + 1][apex], w = 0.07;
    const nrm = unit(cross([1, 0, 0], sub(b, a)));
    const out = dot(nrm, [0, 0, -1]) > 0 ? nrm : mul(nrm, -1);
    plate(`turret-counterweight-ridge-${band}`, `Turret counterweight ridge (${band})`, 'turret', 'turret',
      [[-w, a[1], a[2]], [w, a[1], a[2]], [w, b[1], b[2]], [-w, b[1], b[2]]], 25, out, 0.02, 0.015);
  }
}
function gunArmor() {
  const r = G.shieldRear, f = G.shieldFront;
  const R = [[-r.half, r.lo, r.z], [r.half, r.lo, r.z], [r.half, r.hi, r.z], [-r.half, r.hi, r.z]];
  const F = [[-f.half, f.lo, f.z], [f.half, f.lo, f.z], [f.half, f.hi, f.z], [-f.half, f.hi, f.z]];
  plate('gun-shield-front', 'Gun Shield Face', 'gun', 'gunGroup', F, 57, [0, 0, 1]);
  plate('gun-shield-top', 'Gun Shield Top', 'gun', 'gunGroup', [R[3], R[2], F[2], F[3]], 57, [0, 1, 0.3]);
  plate('gun-shield-bottom', 'Gun Shield Bottom', 'gun', 'gunGroup', [R[0], R[1], F[1], F[0]], 57, [0, -1, 0.3]);
  plate('gun-shield-pos-x', 'Gun Shield Side (+X)', 'gun', 'gunGroup', [R[1], R[2], F[2], F[1]], 57, [1, 0, 0.5]);
  plate('gun-shield-neg-x', 'Gun Shield Side (-X)', 'gun', 'gunGroup', [R[0], R[3], F[3], F[0]], 57, [-1, 0, 0.5]);
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
turretArmor([TU.bottom, TU.knee, TU.top].map(ringOf));
gunArmor();

const tank = {
  schemaVersion: 1,
  id: 'm10',
  renderMode: 'parametric',
  catalog: {sortOrder: 7},
  meta: {
    displayName: 'M10 GMC',
    description: 'Open-topped 3-inch gun motor carriage on the diesel M4A2 chassis. Its long M7 gun hits as hard as the 76 mm Sherman, but thin sloped armour and an open turret with slow hand traverse leave the crew exposed. Late production with the duckbill counterweight.',
    nationality: 'USA',
    year: 1943,
  },
  appearance: {baseColor: '#4a5d23'},
  durability: {health: 240, trackHealth: 150, armorSummary: {front: 38, side: 19, rear: 19, turret: 57}},
  mounts: {
    turretOffset: TU.offset,
    gunPivotOffset: G.pivot,
    muzzleDistance: G.muzzle,
    broadPhaseRadius: 5,
  },
  mobility: {
    horsepower: 375, weight: 29.6, maxSpeed: 11, maxReverseSpeed: 2, acceleration: 4.45, deceleration: 9,
    trackWidth: Math.round((2 * T.x + T.width) * 1000) / 1000, turnRateLimit: 0.54, rotationalInertia: 2.7,
  },
  traverse: {turretSpeed: 0.078, gunSpeed: 0.1, maxElevationDeg: 30, maxDepressionDeg: 10},
  weapons: {
    caliber: 76,
    reloadTime: 5000,
    ammo: {
      AP: {penetration: 109, velocity: 792, damage: 380, drop: 0.08, dispersion: 0.0015, historicalPenetration: {standard: 'RHA_30deg', points: [
        {distance: 100, penetration: 109}, {distance: 500, penetration: 100}, {distance: 1000, penetration: 88}, {distance: 1500, penetration: 77}]}},
      APC: {penetration: 109, velocity: 792, damage: 480, drop: 0.08, dispersion: 0.0015},
      HE: {penetration: 25, velocity: 853, damage: 480, drop: 0.22, dispersion: 0.002},
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
