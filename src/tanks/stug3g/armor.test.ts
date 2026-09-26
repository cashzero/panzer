import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {testProjectileAgainstTank} from '../../armorModel';
import type {TankData} from '../../store';
import {validateTankDraft} from '../../tank-editor/validation';
import {casemateHullHeading, clampTraverse} from '../../traverseLimit';
import type {ModelNode, TankModelSpec, TankSpec, Vec3} from '../core/types';
import {resolveTankSpec} from '../core/resolver';

const spec: TankSpec = JSON.parse(readFileSync(new URL('./tank.json', import.meta.url), 'utf8'));
const model: TankModelSpec = JSON.parse(readFileSync(new URL('./model.json', import.meta.url), 'utf8'));
const profile = {plates: spec.armorModel.plates, broadPhaseRadius: spec.mounts.broadPhaseRadius};

// Rendered armour surfaces rebuilt from model.json with the same node transforms
// and mount chain as the renderer, for comparing hitbox and surface positions.
function nodeMesh(node: ModelNode, material: THREE.Material) {
  let geometry: THREE.BufferGeometry;
  if (node.type === 'polyhedron') {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(node.faces.flatMap(f => f.flatMap(i => node.vertices[i])), 3));
  } else if (node.type === 'extrude') {
    const shape = new THREE.Shape(node.shape.outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of node.shape.holes ?? []) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    geometry = new THREE.ExtrudeGeometry(shape, {depth: node.depth, bevelEnabled: false});
  } else if (node.type === 'box') {
    geometry = new THREE.BoxGeometry(...node.size);
  } else if (node.type === 'cylinder') {
    geometry = new THREE.CylinderGeometry(node.radiusTop, node.radiusBottom, node.height, node.radialSegments ?? 32);
  } else {
    throw Error(`Unsupported armour surface ${node.id}`);
  }
  const mesh = new THREE.Mesh(geometry, material);
  if (node.position) mesh.position.fromArray(node.position);
  if (node.rotation) mesh.rotation.set(...node.rotation);
  return mesh;
}
function surfaces(turret = 0, elevation = 0) {
  const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  const pick = (slot: keyof TankModelSpec['slots'], ids: string[]) => ids.map(id => {
    const node = model.slots[slot].find(n => n.id === id);
    assert.ok(node, `missing ${id}`);
    return nodeMesh(node, material);
  });
  const root = new THREE.Group();
  const skirts = model.slots.hull.filter(n => /schurzen-panel/.test(n.id)).map(n => n.id);
  root.add(...pick('hull', ['stug-lower-hull', 'stug-casemate', 'stug-engine-compartment', 'commander-cupola', ...skirts]));
  root.add(...pick('tracksLeft', ['left-continuous-track']), ...pick('tracksRight', ['right-continuous-track']));
  const turretGroup = new THREE.Group();
  turretGroup.position.fromArray(spec.mounts.turretOffset);
  turretGroup.rotation.set(0, turret, 0);
  turretGroup.add(...pick('turret', ['stuk40-traverse-cradle']));
  const gunGroup = new THREE.Group();
  gunGroup.position.fromArray(spec.mounts.gunPivotOffset);
  gunGroup.rotation.set(elevation, 0, 0);
  gunGroup.add(...pick('gun', ['saukopf-mantlet']));
  turretGroup.add(gunGroup);
  root.add(turretGroup);
  root.updateMatrixWorld(true);
  return root;
}
// Rendered surfaces per gun traverse angle, built on first use.
const surfaceCache = new Map<number, THREE.Group>();
const meshesAt = (turret: number) => {
  if (!surfaceCache.has(turret)) surfaceCache.set(turret, surfaces(turret));
  return surfaceCache.get(turret)!;
};

const pose = (turret: number) => ({position: new THREE.Vector3(), rotation: 0, turretRotation: turret, gunElevation: 0, pitch: 0, roll: 0} as unknown as TankData);
const raycaster = new THREE.Raycaster();
function shoot(origin: Vec3, direction: Vec3, turret = 0) {
  const ray = new THREE.Ray(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());
  const armour = testProjectileAgainstTank(ray, 30, pose(turret), profile, spec.mounts.turretOffset, spec.mounts.gunPivotOffset);
  raycaster.set(ray.origin, ray.direction);
  const surface = raycaster.intersectObject(meshesAt(turret), true)[0];
  return {armour, surface};
}
// Plates are flat approximations: 40 mm of fit tolerance by default; the domed
// Saukopf and the round cupola get a little more.
function expectPlate(label: string, origin: Vec3, direction: Vec3, thickness: number, zone: string, turret = 0, tolerance = 0.04) {
  const {armour, surface} = shoot(origin, direction, turret);
  assert.ok(armour, `${label}: no armour hit`);
  assert.equal(armour.plateInfo.armorThickness, thickness, `${label}: ${armour.plateInfo.name}`);
  assert.equal(armour.plateInfo.zone, zone, `${label}: ${armour.plateInfo.name}`);
  assert.ok(surface, `${label}: ray misses the rendered surface`);
  assert.ok(Math.abs(armour.distance - surface.distance) <= tolerance,
    `${label}: ${armour.plateInfo.name} ${armour.distance.toFixed(3)} m vs surface ${surface.distance.toFixed(3)} m`);
  return armour;
}
const range = (from: number, to: number, step: number) => Array.from({length: Math.floor((to - from) / step + 1e-6) + 1}, (_, i) => from + i * step);


const S = {front: 2.056, firstJoint: 1.043, rear: -2.010, top: 1.921, frontTop: 1.454, bottom: 0.638}; // Schurzen envelope
const LIMIT = THREE.MathUtils.degToRad(10);
const gunX = spec.mounts.turretOffset[0], gunY = spec.mounts.turretOffset[1] + spec.mounts.gunPivotOffset[1];

test('StuG data validates and keeps the documented armour layout', () => {
  assert.deepEqual(validateTankDraft(spec, model, 'stug3g').filter(i => i.severity === 'error'), []);
  assert.deepEqual(spec.durability.armorSummary, {front: 80, side: 30, rear: 50, turret: 80});
  assert.ok(!spec.armorModel.plates.some(p => p.parent === 'turret'), 'The casemate is hull armour; nothing traverses but the gun');
  const names = spec.armorModel.plates.map(p => p.name);
  assert.equal(new Set(names).size, names.length, 'Plate names must be unique');
  for (const p of spec.armorModel.plates) assert.ok(p.halfExtents[0] <= Math.min(p.halfExtents[1], p.halfExtents[2]), `${p.id} thickness axis`);
});

test('the gun traverses only 10 degrees each side and the crew turns the hull beyond that', () => {
  assert.ok(Math.abs(resolveTankSpec(spec).traverseLimit! - LIMIT) < 1e-9);
  assert.equal(clampTraverse(0.05, LIMIT), 0.05);
  assert.equal(clampTraverse(0.5, LIMIT), LIMIT);
  assert.equal(clampTraverse(-2 * Math.PI - 0.5, LIMIT), -LIMIT);
  assert.equal(clampTraverse(3, undefined), 3, 'A full turret is not limited');
  // Player aiming and both AIs clamp through clampTraverse. The AI holds the
  // hull while the target is well inside the arc, else faces it.
  assert.equal(casemateHullHeading(0.3, 0.3 - LIMIT * 0.5, LIMIT), 0.3 - LIMIT * 0.5);
  assert.equal(casemateHullHeading(1.2, 0, LIMIT), 1.2);
  assert.equal(casemateHullHeading(-Math.PI + 0.05, Math.PI - 0.05, LIMIT), Math.PI - 0.05, 'Bearings wrap across ±180 degrees');
});

test('frontal hits land on the Saukopf, casemate front and nose', () => {
  for (const dx of range(-0.06, 0.06, 0.03)) for (const y of range(1.53, 1.65, 0.03)) expectPlate(`Saukopf ${dx},${y.toFixed(2)}`, [gunX + dx, y, 10], [0, 0, -1], 80, 'gun', 0, 0.06);
  for (const x of range(0.3, 0.85, 0.05)) for (const y of range(1.40, 1.60, 0.04)) expectPlate(`driver plate ${x.toFixed(2)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 80, 'hull');
  for (const x of range(0.3, 0.85, 0.05)) for (const y of range(1.68, 2.0, 0.04)) expectPlate(`upper front ${x.toFixed(2)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 50, 'hull');
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(0.95, 1.18, 0.04)) expectPlate(`upper nose ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 80, 'hull');
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(0.45, 0.85, 0.05)) expectPlate(`lower nose ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 50, 'hull');
  for (const s of [-1, 1]) for (const x of range(1.05, 1.45, 0.1)) for (const y of range(1.40, 1.60, 0.05)) expectPlate(`pannier front ${s * x},${y.toFixed(2)}`, [s * x, y, 10], [0, 0, -1], 30, 'hull');
});

test('side hits land on the 5 mm Schurzen, the engine sides and the cupola', () => {
  for (const side of [-1, 1]) {
    // The first panel's top edge slopes down to the front; its armour steps in quarters.
    const skirtTop = (z: number) => (z < S.firstJoint ? S.top : S.frontTop + (S.front - z) / (S.front - S.firstJoint) * (S.top - S.frontTop));
    for (const z of range(-1.85, 1.85, 0.1)) for (const y of range(0.75, 1.85, 0.1)) {
      if (y > skirtTop(z) - 0.1) continue;
      expectPlate(`skirt ${side} ${z.toFixed(2)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 5, 'hull');
    }
    for (const z of range(-2.45, -2.1, 0.05)) for (const y of range(1.40, 1.66, 0.04)) expectPlate(`engine side ${side} ${z.toFixed(2)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 30, 'hull');
  }
  for (const z of range(-0.35, 0.0, 0.05)) expectPlate(`cupola ${z.toFixed(2)}`, [10, 2.14, z], [-1, 0, 0], 30, 'hull', 0, 0.06);
});

test('track hitboxes follow the belt below and ahead of the skirts without empty corners', () => {
  const belts = ([['tracksLeft', 'left-continuous-track'], ['tracksRight', 'right-continuous-track']] as const).map(([slot, id]) => {
    const node = model.slots[slot].find(n => n.id === id);
    assert.ok(node?.type === 'extrude');
    const mesh = nodeMesh({...node, shape: {outline: node.shape.outline}}, new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  let interior = 0, exterior = 0;
  for (const [k, side] of [[0, -1], [1, 1]] as const) {
    const onBelt = (y: number, z: number) => { raycaster.set(new THREE.Vector3(side * 10, y, z), new THREE.Vector3(-side, 0, 0)); return raycaster.intersectObject(belts[k]).length > 0; };
    for (const z of range(-2.8, 3.0, 0.05)) for (const y of range(0, 1.35, 0.05)) {
      if (z < S.front + 0.05 && z > S.rear - 0.05 && y > S.bottom - 0.05) continue;
      const around = [[0, 0], [0.15, 0], [-0.15, 0], [0, 0.15], [0, -0.15]].map(([dy, dz]) => onBelt(y + dy, z + dz));
      const armour = testProjectileAgainstTank(new THREE.Ray(new THREE.Vector3(side * 10, y, z), new THREE.Vector3(-side, 0, 0)), 30, pose(0), profile, spec.mounts.turretOffset, spec.mounts.gunPivotOffset);
      if (around.every(Boolean)) {
        interior++;
        assert.equal(armour?.plateInfo.zone, 'track', `track ${side} ${z.toFixed(2)},${y.toFixed(2)}: ${armour?.plateInfo.name ?? 'no hit'}`);
        assert.ok(Math.abs(armour.distance - (10 - (spec.mobility.trackWidth / 2))) < 0.01, 'Track hitbox lies on the outer belt face');
      } else if (!around.some(Boolean)) {
        exterior++;
        assert.notEqual(armour?.plateInfo.zone, 'track', `invisible track armour at ${side} ${z.toFixed(2)},${y.toFixed(2)}`);
      }
    }
  }
  assert.ok(interior > 300 && exterior > 300, `${interior} interior, ${exterior} exterior probes`);
});

test('rear hits land on the rear plates and the casemate rear', () => {
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(0.45, 1.30, 0.05)) expectPlate(`lower rear ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 50, 'hull');
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(1.40, 1.68, 0.04)) expectPlate(`upper rear ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 30, 'hull');
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(1.78, 2.0, 0.04)) expectPlate(`casemate rear ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 30, 'hull');
});

test('plunging hits land on the casemate roof and engine deck', () => {
  for (const [x, z] of [[0, 0.5], [-0.5, -0.3], [0.3, 0.9]]) assert.equal(expectPlate(`roof ${x},${z}`, [x, 10, z], [0, -1, 0], 17, 'hull').plateInfo.name, 'Casemate Roof');
  for (const [x, z] of [[0, -1.5], [0.3, -1.1]]) assert.equal(expectPlate(`deck ${x},${z}`, [x, 10, z], [0, -1, 0], 16, 'hull').plateInfo.name, 'Engine Deck');
});

test('the Saukopf follows the gun to its traverse stops', () => {
  for (const turn of [LIMIT, -LIMIT]) {
    const faceX = gunX + 0.87 * Math.sin(turn);
    for (const dx of [-0.03, 0, 0.03]) expectPlate(`Saukopf at ${turn.toFixed(3)} ${dx}`, [faceX + dx, gunY, 10], [0, 0, -1], 80, 'gun', turn, 0.06);
  }
});
