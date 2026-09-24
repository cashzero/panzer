// Reproducible migration. Inputs MUST be the original, uncalibrated JSON files
// (baseline commit 650af41), and the M4 model whose running gear was calibrated
// in docs/references/sherman. Passes accumulate: pass N applies passes 1..N.
//   node calibrate.mjs <original-model.json> <original-tank.json> <m4-model.json> <output-directory> [pass]
import fs from 'node:fs';
import path from 'node:path';
const [mp, tp, m4p, out, passArg] = process.argv.slice(2);
if (!mp || !tp || !m4p || !out) throw Error('Provide original model, original tank, M4 model and output directory');
const LAST_PASS = 4;
const pass = Number(passArg ?? LAST_PASS);
const m = JSON.parse(fs.readFileSync(mp)), t = JSON.parse(fs.readFileSync(tp)), m4 = JSON.parse(fs.readFileSync(m4p));
const r6 = v => Math.round(v * 1e6) / 1e6;
const find = (nodes, id) => nodes.find(n => n.id === id);
const get = (slot, id) => { const n = find(m.slots[slot], id) ?? find(m.slots.turret[0].children, id); if (!n) throw Error(`missing ${slot}/${id}`); return n; };
const plate = id => { const p = t.armorModel.plates.find(q => q.id === id); if (!p) throw Error(`missing plate ${id}`); return p; };
const mirrorX = n => { if (n.position) n.position[0] = -n.position[0]; if (n.rotation) { n.rotation[1] = -n.rotation[1]; n.rotation[2] = -n.rotation[2]; } };

// Drawing datums, metres (side view 150 px/m, origin x 668, ground y 577).
const ROOF_Y = 2.075, LIP_Y = 1.33;               // hull roof; side plate lower edge
const GLACIS = {bottom: [2.47, LIP_Y], top: [1.745, ROOF_Y]};   // [Z, Y]
const DECK = {front: [-0.9, ROOF_Y], rear: [-2.8, 1.635]};
const REAR_Z = -2.9, HALF_W = 1.36;               // upper hull rear plate; 2.72 m hull
const oldGlacisZ = y => 2.64 - (y - 1.2) * (0.943 / 0.88);
const newGlacisZ = y => GLACIS.bottom[0] - (y - GLACIS.bottom[1]) * ((GLACIS.bottom[0] - GLACIS.top[0]) / (GLACIS.top[1] - GLACIS.bottom[1]));
const oldDeckY = z => z >= -0.76 ? 2.08 : 2.08 - (-0.76 - z) * (0.42 / 2.04);
const deckSlope = (DECK.front[1] - DECK.rear[1]) / (DECK.front[0] - DECK.rear[0]);
const newDeckY = z => z >= DECK.front[0] ? ROOF_Y : ROOF_Y - (DECK.front[0] - z) * deckSlope;
const deckAngle = Math.atan(deckSlope), glacisAngle = Math.atan2(GLACIS.top[1] - GLACIS.bottom[1], GLACIS.bottom[0] - GLACIS.top[0]);

if (pass >= 1) {
  // Running gear: the VVSS bogies, sprocket, idler and track are the same parts
  // as the M4, whose layout was calibrated against its own Dyer drawing. This
  // drawing agrees within 10 px, so the corrected M4 slots replace the old ones
  // (which had 570 mm wheels and bogies 0.24 m too far aft).
  m.slots.tracksLeft = structuredClone(m4.slots.tracksLeft);
  m.slots.tracksRight = structuredClone(m4.slots.tracksRight);
  for (const id of ['rounded-differential-housing', 'left-final-drive-bulge', 'right-final-drive-bulge', 'transmission-bolted-top-flange', 'transmission-flange-bolts']) {
    const i = m.slots.hull.findIndex(n => n.id === id);
    m.slots.hull[i] = structuredClone(find(m4.slots.hull, id));
  }

  // Upper hull: 2.72 m wide, side plates end at the sponson lip, 46° glacis,
  // level roof to the turret rear and the sloping diesel deck.
  const hull = get('hull', 'm4a2-large-hatch-welded-hull');
  hull.position = [-HALF_W, 0, 0]; hull.depth = 2 * HALF_W;
  // Outline x is -Z. The nose step drops the glacis to the differential top.
  hull.shape.outline = [[-2.52, 1.28], [-GLACIS.top[0], ROOF_Y], [-DECK.front[0], ROOF_Y], [-DECK.rear[0], DECK.rear[1]], [-REAR_Z, LIP_Y], [-2.42, LIP_Y], [-2.42, 1.28]].map(p => p.map(r6));
  const tub = get('hull', 'lower-hull-tub');
  tub.shape.outline = [[-2.65, 0.68], [-2.4, 0.43], [2.78, 0.43], [-REAR_Z, LIP_Y], [-2.42, LIP_Y]];

  for (const n of m.slots.hull) {
    const [x, y, z] = n.position ?? [0, 0, 0];
    // Glacis fittings (headlights, guards, bow MG, lifting eyes) follow the new slope.
    if (z > 1.9 && z < 2.6 && y > 1.3 && y < 2.1 && !/fender/.test(n.id)) n.position[2] = r6(z + newGlacisZ(y) - oldGlacisZ(y));
    // Engine-deck fittings follow the new deck line and angle.
    if (/diesel|intake|louvre|fuel-filler/.test(n.id)) {
      n.position[1] = r6(y + newDeckY(z) - oldDeckY(z));
      if (n.rotation) n.rotation[0] = r6(-deckAngle);
    }
  }
  // Headlights at X ±0.96, Y 1.59 in the front view; the bow MG is on the
  // co-driver's (vehicle right, -X) side.
  for (const n of m.slots.hull) {
    if (/headlamp|headlight/.test(n.id)) {
      const side = Math.sign(n.position[0]);
      n.position[0] = r6(n.position[0] - side * 0.13); n.position[1] = r6(n.position[1] + 0.028);
      n.position[2] = r6(n.position[2] + newGlacisZ(n.position[1]) - newGlacisZ(n.position[1] - 0.028));
    }
    if (n.id.startsWith('bow-mg')) mirrorX(n);
  }
  // Fenders sit under the sponson lip, clear of the track top run (Y 1.24).
  for (const s of ['left', 'right']) {
    const k = s === 'left' ? -1 : 1;
    Object.assign(get('hull', `${s}-front-fender`), {size: [0.44, 0.035, 0.575], position: [k * 1.1, 1.2725, 2.645], rotation: [0.131, 0, 0]});
    Object.assign(get('hull', `${s}-fender-edge`), {position: [k * 1.32, 1.3075, -0.12]});
    get('hull', `${s}-rear-mudflap`).position[1] = 1.272;
  }

  // Turret: the casting's lower edge is at Y 2.16 and the roof at 2.87, about
  // 0.12 m higher than before. The T23 commander's cupola, gunner's periscope
  // and antenna are on the right (-X), the loader's hatch and pistol port on
  // the left; the old model had the turret fittings mirrored.
  t.mounts.turretOffset = [0, 2.12, 0.08];
  const turret = m.slots.turret[0];
  for (const n of turret.children) {
    mirrorX(n);
    if (/^(loader-)/.test(n.id)) n.position[2] = r6(n.position[2] + 0.12);
    if (n.id.startsWith('antenna-')) { n.position[0] = -0.52; n.position[2] = -1.11; }
  }
  // Race fills the gap between hull roof and casting (group scale Y 0.88).
  Object.assign(get('turret', 't23-turret-race'), {position: [0, r6((ROOF_Y - 2.12 + 0.05) / 0.88), 0], height: r6(0.1 / 0.88)});
  const front = get('turret', 't23-front-casting');
  front.scale[2] = 0.12;

  // Gun: axis at Y 2.433, muzzle at Z 4.247 with a 0.16 m thread protector;
  // M62 shield face at Z 1.227, 1.37 × 0.58 m; coax on the right, sight on the left.
  t.mounts.gunPivotOffset = [0, r6(2.433 - 2.12), 1.02];
  const base = 0.08 + 1.02, muzzle = 4.247 - base;
  t.mounts.muzzleDistance = r6(muzzle);
  const shield = get('gun', 'm62-rounded-rotor-shield');
  shield.position = [0, 0, -0.03];
  shield.shape.outline = shield.shape.outline.map(([x, y]) => [r6(x * 1.035), r6(y * 1.074 + 0.05)]);
  Object.assign(get('gun', 'm1-gun-collar'), {radiusTop: 0.125, radiusBottom: 0.125, height: 0.29, position: [0, 0, 0.275]});
  Object.assign(get('gun', 'm1-76mm-barrel'), {radiusTop: 0.06, radiusBottom: 0.085, height: r6(muzzle - 0.1 - 0.42), position: [0, 0, r6((muzzle - 0.1 + 0.42) / 2)]});
  Object.assign(get('gun', 'thread-protector'), {radiusTop: 0.075, radiusBottom: 0.075, height: 0.145, position: [0, 0, r6(muzzle - 0.015 - 0.0725)]});
  const ring = get('gun', '76mm-open-muzzle');
  ring.position = [0, 0, r6(muzzle - 0.015)];
  ring.shape.outline = ring.shape.outline.map(p => p.map(v => r6(v * 0.075 / 0.052)));
  Object.assign(get('gun', 'coaxial-port'), {position: [-0.387, 0.147, 0.13]});
  Object.assign(get('gun', 'sight-port'), {position: [0.387, 0.073, 0.13]});

  // Armour follows the revised surfaces; thicknesses are unchanged.
  const glacisLen = Math.hypot(GLACIS.bottom[0] - GLACIS.top[0], GLACIS.bottom[1] - GLACIS.top[1]);
  const normal = [Math.cos(glacisAngle), Math.sin(glacisAngle)];   // [Y, Z] outward
  for (const [id, f] of [['hull-upper-glacis-top', 0.25], ['hull-upper-glacis-bottom', 0.75]]) {
    const p = plate(id), z = GLACIS.top[0] + f * (GLACIS.bottom[0] - GLACIS.top[0]), y = GLACIS.top[1] + f * (GLACIS.bottom[1] - GLACIS.top[1]);
    Object.assign(p, {halfExtents: [HALF_W, 0.035, r6(glacisLen / 4 + 0.005)], position: [0, r6(y - normal[0] * 0.035), r6(z - normal[1] * 0.035)], rotation: [r6(glacisAngle), 0, 0]});
  }
  // The cast differential housing (the M4 profile) is covered by chords that
  // follow its rounded side profile rather than one flat box in front of it.
  const diff = find(m.slots.hull, 'rounded-differential-housing').shape.outline.map(([x, y]) => [-x, y]);
  const lower = plate('hull-lower-glacis'), chords = [];
  for (let i = 0; i < 5; i++) {
    const [z0, y0] = diff[i], [z1, y1] = diff[i + 1], len = Math.hypot(z1 - z0, y1 - y0);
    // Local Z runs along the chord; local Y (n) points into the casting.
    const angle = Math.atan2(y0 - y1, z1 - z0), n = [Math.cos(angle), Math.sin(angle)];
    chords.push({id: i === 2 ? 'hull-lower-glacis' : `hull-lower-glacis-${i}`, name: i === 2 ? 'Hull Lower Glacis' : `Hull Lower Glacis ${i}`, zone: 'hull', halfExtents: [0.91, 0.04, r6(len / 2 + 0.01)], position: [0, r6((y0 + y1) / 2 + n[0] * 0.04), r6((z0 + z1) / 2 + n[1] * 0.04)], rotation: [r6(angle), 0, 0], armorThickness: lower.armorThickness, parent: 'hull'});
  }
  t.armorModel.plates.splice(t.armorModel.plates.indexOf(lower), 1, ...chords);
  Object.assign(plate('hull-roof'), {halfExtents: [HALF_W, 0.025, r6((GLACIS.top[0] - DECK.front[0]) / 2)], position: [0, ROOF_Y - 0.025, r6((GLACIS.top[0] + DECK.front[0]) / 2)]});
  const deckLen = Math.hypot(DECK.front[0] - DECK.rear[0], DECK.front[1] - DECK.rear[1]);
  const dm = [(DECK.front[0] + DECK.rear[0]) / 2, (DECK.front[1] + DECK.rear[1]) / 2];
  Object.assign(plate('hull-engine-deck'), {halfExtents: [HALF_W, 0.025, r6(deckLen / 2)], position: [0, r6(dm[1] - Math.cos(deckAngle) * 0.025), r6(dm[0] + Math.sin(deckAngle) * 0.025)], rotation: [r6(-deckAngle), 0, 0]});
  // The upper rear plate leans forward from the lip to the deck corner.
  const rearLen = Math.hypot(DECK.rear[0] - REAR_Z, DECK.rear[1] - LIP_Y), rearLean = Math.atan2(DECK.rear[0] - REAR_Z, DECK.rear[1] - LIP_Y);
  Object.assign(plate('hull-rear'), {name: 'Hull Rear Upper', halfExtents: [HALF_W, r6(rearLen / 2), 0.04], position: [0, r6((DECK.rear[1] + LIP_Y) / 2 - Math.sin(rearLean) * 0.04), r6((DECK.rear[0] + REAR_Z) / 2 + Math.cos(rearLean) * 0.04)], rotation: [r6(rearLean), 0, 0]});
  const rearIndex = t.armorModel.plates.findIndex(p => p.id === 'hull-rear');
  t.armorModel.plates.splice(rearIndex + 1, 0, {id: 'hull-rear-lower', name: 'Hull Rear Lower', zone: 'hull', halfExtents: [0.89, 0.45, 0.04], position: [0, 0.88, -2.8], rotation: [0, 0, 0], armorThickness: plate('hull-rear').armorThickness, parent: 'hull'});
  // Side plates: thickness on local X. One panel under the roof, short panels
  // under the glacis and the deck so no box stands outside the hull.
  const side = plate('hull-side-left'), thick = side.armorThickness;
  t.armorModel.plates = t.armorModel.plates.filter(p => !/^hull-side-/.test(p.id));
  const sides = [];
  const panel = (id, name, z0, z1, top) => {
    for (const [s, k] of [['left', 1], ['right', -1]]) sides.push({id: `${id}-${s}`, name: `${name} ${s[0].toUpperCase()}${s.slice(1)}`, zone: 'hull', halfExtents: [0.035, r6((top - LIP_Y) / 2), r6((z1 - z0) / 2 + 0.005)], position: [r6(k * (HALF_W - 0.035)), r6((top + LIP_Y) / 2), r6((z0 + z1) / 2)], rotation: [0, 0, 0], armorThickness: thick, parent: 'hull'});
  };
  panel('hull-side', 'Hull Side', DECK.front[0], GLACIS.top[0], ROOF_Y);
  const gz = [GLACIS.top[0], GLACIS.top[0] + (GLACIS.bottom[0] - GLACIS.top[0]) / 3, GLACIS.top[0] + 2 * (GLACIS.bottom[0] - GLACIS.top[0]) / 3, GLACIS.bottom[0]];
  const glacisY = z => GLACIS.top[1] - (z - GLACIS.top[0]) / (GLACIS.bottom[0] - GLACIS.top[0]) * (GLACIS.top[1] - GLACIS.bottom[1]);
  for (let i = 0; i < 3; i++) panel(`hull-side-front-${i}`, `Hull Side Front ${i}`, gz[i], gz[i + 1], glacisY((gz[i] + gz[i + 1]) / 2));
  for (let i = 0; i < 5; i++) {
    const z1 = DECK.front[0] - i * (DECK.front[0] - DECK.rear[0]) / 5, z0 = z1 - (DECK.front[0] - DECK.rear[0]) / 5;
    panel(`hull-engine-side-${i}`, `Hull Engine Side ${i}`, i === 4 ? REAR_Z : z0, z1, newDeckY((z0 + z1) / 2));
  }
  const roofIndex = t.armorModel.plates.findIndex(p => p.id === 'hull-rear-lower');
  t.armorModel.plates.splice(roofIndex + 1, 0, ...sides);
  for (const s of ['left', 'right']) Object.assign(plate(`track-${s}`), {halfExtents: [0.2105, 0.62, 2.9625], position: [s === 'left' ? -1.1 : 1.1, 0.615, 0.0925]});
  // The casting tapers inward ahead of and behind the flat side plates; short
  // panels follow it at mid height.
  const turretSide = plate('turret-side-left'), bustleSides = [];
  // Segments run [x, z] front → rear along the ring at unscaled local Y 0.38.
  const taper = [['turret-side-front', 'Turret Side Front', [0.95, 0.58, 1.075, 0.18]], ...[[1.07, -0.23, 0.94, -0.67], [0.94, -0.67, 0.73, -1.18], [0.73, -1.18, 0.55, -1.43]].map((seg, i) => [`turret-bustle-side-${i}`, `Turret Bustle Side ${i}`, seg])];
  for (const [id, name, [x0, z0, x1, z1]] of taper) {
    const len = Math.hypot(x1 - x0, z1 - z0), phi = Math.atan2(x0 - x1, z0 - z1), n = [Math.cos(phi), -Math.sin(phi)];
    for (const [s, k] of [['left', 1], ['right', -1]]) bustleSides.push({id: `${id}-${s}`, name: `${name} ${s[0].toUpperCase()}${s.slice(1)}`, zone: 'turret', halfExtents: [0.075, turretSide.halfExtents[1], r6(len / 2 + 0.01)], position: [r6(k * ((x0 + x1) / 2 - n[0] * 0.075)), turretSide.position[1], r6((z0 + z1) / 2 - n[1] * 0.075)], rotation: [0, r6(k * phi), 0], armorThickness: turretSide.armorThickness, parent: 'turret'});
  }
  t.armorModel.plates.splice(t.armorModel.plates.indexOf(plate('turret-bustle')), 0, ...bustleSides);
  // The flat side plates end where the casting starts to taper.
  for (const s of ['left', 'right']) Object.assign(plate(`turret-side-${s}`).halfExtents, {2: 0.215}), plate(`turret-side-${s}`).position[2] = -0.025;
  Object.assign(plate('mantlet'), {halfExtents: [0.683, 0.29, 0.08], position: [0, 0.072, 0.05]});
}

if (pass >= 2) {
  // T23 bustle: the drawing's lower edge stays at Y 2.16 only to Z -0.51, then
  // rises to a flat bustle underside at Y 2.37 (Z -0.81 to -1.33). The old
  // casting kept a low, deep rear skirt. Rings hold 18 vertices, front centre
  // first, vehicle-left rear quarter 6-8, rear centre 9, mirrored 10-12.
  const shell = get('turret', 't23-single-cast-shell');
  const setRear = (ring, pts) => pts.forEach(([x, y, z], i) => {
    shell.vertices[ring * 18 + 6 + i] = [x, y, z];
    if (i < 3) shell.vertices[ring * 18 + 12 - i] = [-x, y, z];
  });
  // Bottom ring follows the turret ring round the rear; the ring rises to the
  // bustle underside (world Y 2.373 → unscaled local 0.2875).
  setRear(0, [[0.8, 0.045, -0.43], [0.62, 0.045, -0.66], [0.4, 0.045, -0.82], [0, 0.045, -0.9]]);
  setRear(1, [[0.93, 0.2875, -0.65], [0.71, 0.2875, -1.15], [0.53, 0.2875, -1.39], [0, 0.2875, -1.45]]);
  get('turret', 't23-turret-race').radiusTop = get('turret', 't23-turret-race').radiusBottom = 0.88;
  const rise = 0.2875 * 0.88;
  Object.assign(plate('turret-bustle'), {halfExtents: [0.58, r6((0.87 * 0.88 - rise) / 2), 0.09], position: [0, r6((0.87 * 0.88 + rise) / 2), -1.39]});
  // The sloping underside between the ring and the bustle is part of the rear.
  const [y0, z0, y1, z1] = [0.045 * 0.88, -0.86, rise, -1.42], len = Math.hypot(z1 - z0, y1 - y0);
  const tilt = Math.atan2(y0 - y1, z1 - z0), n = [Math.cos(tilt), Math.sin(tilt)];   // [Y, Z], outward
  t.armorModel.plates.splice(t.armorModel.plates.indexOf(plate('turret-bustle')) + 1, 0, {id: 'turret-bustle-underside', name: 'Turret Bustle Underside', zone: 'turret', halfExtents: [0.62, 0.045, r6(len / 2)], position: [0, r6((y0 + y1) / 2 - n[0] * 0.045), r6((z0 + z1) / 2 - n[1] * 0.045)], rotation: [r6(tilt), 0, 0], armorThickness: plate('turret-bustle').armorThickness, parent: 'turret'});
  for (const p of t.armorModel.plates.filter(q => /^turret-bustle-side-[12]/.test(q.id))) {
    const top = p.position[1] + p.halfExtents[1];
    p.halfExtents[1] = r6((top - rise) / 2); p.position[1] = r6((top + rise) / 2);
  }
}

if (pass >= 3) {
  // Turret roof: level from the rear to Z 0.55, then slopes down to the casting
  // front at Y 2.68 (side view x 586 → 520). Lower the front of the top two rings.
  const shell = get('turret', 't23-single-cast-shell');
  for (const i of [0, 1, 2]) {
    for (const k of i ? [i, 18 - i] : [0]) {
      shell.vertices[3 * 18 + k][1] = 0.64;                    // ring Y 0.77 front
      shell.vertices[4 * 18 + k][2] = r6([0.47, 0.46, 0.4][i]); // roof ring front edge
    }
  }
  Object.assign(get('turret', 't23-front-casting'), {position: [0, 0.4, 0.99], scale: [0.72, 0.3, 0.12]});
  // Whip ends at Y 3.62 in the drawing; the pistol port is centred at Z -0.33.
  const whipTop = (3.62 - 2.12) / 0.88, whipBase = 0.89 + 0.035;
  Object.assign(get('turret', 'antenna-whip'), {height: r6(whipTop - whipBase), position: [-0.52, r6((whipTop + whipBase) / 2), -1.11]});
  get('turret', 'left-pistol-port').position[2] = -0.41;
  // Stowage box on the bustle rear (side x 892–922, y 175–197; rear view x 857–923).
  m.slots.turret[0].children.push({id: 'turret-rear-stowage-box', type: 'box', size: [0.44, r6(0.2 / 0.88), 0.2], position: [0.06, r6((2.6 - 2.12) / 0.88), -1.62], materialRole: 'accessory'});

  // Driver and co-driver hatches stand proud of the roof; periscopes at Z 1.41.
  for (const s of ['left', 'right']) {
    get('hull', `${s}-large-hatch-coaming`).position[1] = 2.02;
    get('hull', `${s}-large-oval-hatch`).position[1] = 2.08;
    Object.assign(get('hull', `${s}-hatch-periscope`).position, {1: 2.14, 2: 1.41});
    get('hull', `${s}-hatch-hinge`).position[1] = 2.1;
  }
  // Rear: the louvred exhaust deflector is at Y 0.76–1.09 in the rear view;
  // fittings stay inside the side-view outline. Two finned air cleaners stand on
  // the rear plate (rear view x 715–785 / 1013–1083, side view to Z -3.08). The
  // drawing has no rear shovel.
  Object.assign(get('hull', 'diesel-rear-exhaust-grille'), {size: [1.73, 0.33, 0.065], position: [0, 0.925, -2.89]});
  for (let i = 0; i < 10; i++) get('hull', `rear-exhaust-louvre-${i}`).position = [0, r6(0.78 + i * 0.033), -2.92];
  Object.assign(get('hull', 'rear-exhaust-upper-deflector'), {position: [0, 1.14, -2.93]});
  get('hull', 'rear-tow-hitch').position[2] = -2.9;
  m.slots.hull = m.slots.hull.filter(n => !n.id.startsWith('rear-shovel'));
  const rearIndex = m.slots.hull.findIndex(n => n.id === 'rear-folding-stowage-shelf');
  const cleaners = [];
  for (const [s, k] of [['left', -1], ['right', 1]]) {
    cleaners.push({id: `${s}-rear-air-cleaner`, type: 'cylinder', radiusTop: 0.15, radiusBottom: 0.15, height: 0.36, radialSegments: 24, position: [k * 0.99, 1.48, -3.0], materialRole: 'hullPrimary'});
    for (let f = 0; f < 4; f++) cleaners.push({id: `${s}-air-cleaner-fin-${f}`, type: 'cylinder', radiusTop: 0.165, radiusBottom: 0.165, height: 0.02, radialSegments: 24, position: [k * 0.99, r6(1.36 + f * 0.08), -3.0], materialRole: 'steel'});
    cleaners.push({id: `${s}-air-cleaner-bracket`, type: 'box', size: [0.2, 0.05, 0.12], position: [k * 0.99, 1.33, -2.9], materialRole: 'steel'});
  }
  m.slots.hull.splice(rearIndex + 1, 0, ...cleaners);
  // Folded travel lock on the glacis: a Y-shaped frame (front view x 273–360,
  // y 1410–1483), laid on the plate.
  const lay = -(Math.PI / 2 - glacisAngle);
  const onGlacis = (y, lift = 0.03) => r6(newGlacisZ(y) + lift * Math.sin(glacisAngle) + 0.01);
  const lock = [];
  for (const k of [-1, 1]) lock.push({id: `travel-lock-arm-${k < 0 ? 'right' : 'left'}`, type: 'box', size: [0.05, 0.42, 0.04], position: [k * 0.14, 1.845, onGlacis(1.845)], rotation: [r6(lay), 0, r6(-k * 0.62)], materialRole: 'steel'});
  lock.push({id: 'travel-lock-stem', type: 'box', size: [0.06, 0.14, 0.04], position: [0, 1.62, onGlacis(1.62)], rotation: [r6(lay), 0, 0], materialRole: 'steel'});
  m.slots.hull.splice(m.slots.hull.findIndex(n => n.id === 'bow-mg-barrel') + 1, 0, ...lock);
}

if (pass >= 4) {
  // Brush guards reach forward to Z 2.53 (side view x 288).
  // The guards are bar frames: side rails and a front hoop, not solid plates.
  for (const n of m.slots.hull.filter(q => /headlight-guard/.test(q.id))) { n.size[2] = 0.44; n.position[2] = 2.33; }
  for (const n of m.slots.hull.filter(q => /headlight-guard-[ab]$/.test(q.id))) { n.size[1] = 0.03; n.position[1] = 1.64; }
  for (const s of ['left', 'right']) {
    const top = get('hull', `${s}-headlight-guard-top`);
    m.slots.hull.splice(m.slots.hull.indexOf(top) + 1, 0, {id: `${s}-headlight-guard-hoop`, type: 'box', size: [0.255, 0.1, 0.022], position: [top.position[0], 1.678, 2.54], materialRole: 'steel'});
  }
  // Close the gap between the travel-lock stem and the arms.
  Object.assign(get('hull', 'travel-lock-stem'), {size: [0.06, 0.16, 0.04], position: [0, 1.66, r6(newGlacisZ(1.66) + 0.03 * Math.sin(glacisAngle) + 0.01)]});
  // Gunner's periscope guard stands to Y 3.10 (side view x 580–615, top y 112);
  // the antenna mount is a box on the bustle roof (x 797–847, y 125–149).
  const roofLocal = y => r6((y - 2.12) / 0.88);
  Object.assign(get('turret', 'gunner-periscope'), {size: [0.16, r6(1.114 - 0.85), 0.2], position: [-0.4, r6((1.114 + 0.85) / 2), 0.46]});
  const mast = get('turret', 'antenna-base');
  for (const k of ['radiusTop', 'radiusBottom', 'height', 'radialSegments']) delete mast[k];
  Object.assign(mast, {type: 'box', size: [0.2, r6(roofLocal(3.01) - 0.85), 0.33], position: [-0.52, r6((roofLocal(3.01) + 0.85) / 2), -1.11]});
  const whip = get('turret', 'antenna-whip'), whipTop = roofLocal(3.62), whipBase = roofLocal(3.01);
  Object.assign(whip, {height: r6(whipTop - whipBase), position: [-0.52, r6((whipTop + whipBase) / 2), -1.11]});
  get('turret', 'turret-rear-stowage-box').position[2] = -1.59;
  // Air cleaners: squarish ribbed boxes spanning Z -2.81…-3.05, Y 1.35…1.75.
  for (const [s, k] of [['left', -1], ['right', 1]]) {
    const body = get('hull', `${s}-rear-air-cleaner`);
    for (const key of ['radiusTop', 'radiusBottom', 'height', 'radialSegments']) delete body[key];
    Object.assign(body, {type: 'box', size: [0.34, 0.4, 0.24], position: [k * 0.99, 1.55, -2.93]});
    for (let f = 0; f < 4; f++) {
      const fin = get('hull', `${s}-air-cleaner-fin-${f}`);
      for (const key of ['radiusTop', 'radiusBottom', 'height', 'radialSegments']) delete fin[key];
      Object.assign(fin, {type: 'box', size: [0.36, 0.02, 0.26], position: [k * 0.99, r6(1.4 + f * 0.1), -2.93]});
    }
    get('hull', `${s}-air-cleaner-bracket`).position = [k * 0.99, 1.33, -2.86];
  }
  // Below Y 1.09 the drawing shows nothing aft of the track, so the lower rear
  // fittings stay within Z -2.87; the tow eyes sit 0.15 m higher (rear view).
  get('hull', 'diesel-rear-exhaust-grille').position[2] = -2.8;
  for (let i = 0; i < 10; i++) get('hull', `rear-exhaust-louvre-${i}`).position[2] = -2.84;
  get('hull', 'rear-exhaust-upper-deflector').position[2] = -2.84;
  get('hull', 'rear-tow-hitch').position[2] = -2.75;
  for (const s of ['left', 'right']) Object.assign(get('hull', `${s}-rear-tow-eye`).position, {1: 0.62, 2: -2.79});
}

fs.writeFileSync(path.join(out, 'model.json'), serializeModel(m));
fs.writeFileSync(path.join(out, 'tank.json'), `${JSON.stringify(t, null, 2)}\n`);
console.log(`Wrote pass ${Math.min(pass, LAST_PASS)} to ${out}`);

// Match the repository's one-node-per-line model.json layout.
function serializeModel(model) {
  const slots = Object.entries(model.slots).map(([k, nodes]) => `    "${k}": [\n${nodes.map(n => `      ${JSON.stringify(n)}`).join(',\n')}\n    ]`);
  return `{\n  "schemaVersion": ${model.schemaVersion},\n  "slots": {\n${slots.join(',\n')}\n  }\n}\n`;
}
