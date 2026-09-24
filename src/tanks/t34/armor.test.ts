import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {testProjectileAgainstTank} from '../../armorModel';
import type {TankData} from '../../store';
import {validateTankDraft} from '../../tank-editor/validation';
import type {ModelNode, TankModelSpec, TankSpec, Vec3} from '../core/types';

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
  const pick = (nodes: ModelNode[], ids: string[]) => ids.map(id => {
    const node = nodes.find(n => n.id === id);
    assert.ok(node, `missing ${id}`);
    return nodeMesh(node, material);
  });
  const root = new THREE.Group();
  root.add(...pick(model.slots.hull, ['sloped-upper-hull', 'lower-hull-tub']));
  const turretGroup = new THREE.Group();
  turretGroup.position.fromArray(spec.mounts.turretOffset);
  turretGroup.rotation.set(0, turret, 0);
  turretGroup.add(...pick(model.slots.turret, ['model-1943-hexagonal-turret']));
  const gunGroup = new THREE.Group();
  gunGroup.position.fromArray(spec.mounts.gunPivotOffset);
  gunGroup.rotation.set(-elevation, 0, 0);
  gunGroup.add(...pick(model.slots.gun, ['rounded-f34-mantlet', 'recoil-housing']));
  turretGroup.add(gunGroup);
  root.add(turretGroup);
  root.updateMatrixWorld(true);
  return root;
}
const meshesAtRest = surfaces();
const meshesTraversed = surfaces(Math.PI / 2);

const pose = (turret: number) => ({position: new THREE.Vector3(), rotation: 0, turretRotation: turret, gunElevation: 0, pitch: 0, roll: 0} as unknown as TankData);
const raycaster = new THREE.Raycaster();
function shoot(origin: Vec3, direction: Vec3, turret = 0) {
  const ray = new THREE.Ray(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());
  const armour = testProjectileAgainstTank(ray, 30, pose(turret), profile, spec.mounts.turretOffset, spec.mounts.gunPivotOffset);
  raycaster.set(ray.origin, ray.direction);
  const surface = raycaster.intersectObject(turret ? meshesTraversed : meshesAtRest, true)[0];
  return {armour, surface};
}
// Plates are flat approximations of the rendered surfaces; the rounded mantlet
// gets a wider fit tolerance.
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

test('T-34 data validates and keeps its armour values', () => {
  assert.deepEqual(validateTankDraft(spec, model, 't34').filter(i => i.severity === 'error'), []);
  assert.deepEqual(spec.durability.armorSummary, {front: 45, side: 45, rear: 40, turret: 52});
  // TankSelect keys its armour inspection meshes by plate name.
  const names = spec.armorModel.plates.map(p => p.name);
  assert.equal(new Set(names).size, names.length, 'Plate names must be unique');
  const ids = spec.armorModel.plates.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'Plate ids must be unique');
  // Thickness on local X: the collision routine has no 10 mm dead band on that axis.
  for (const p of spec.armorModel.plates.filter(q => q.parent !== 'gunGroup' && q.zone !== 'track' && !/roof/.test(q.id))) assert.ok(p.halfExtents[0] <= Math.min(p.halfExtents[1], p.halfExtents[2]), `${p.id} thickness axis`);
});

test('frontal hits land on the glacis, nose, lower glacis and mantlet', () => {
  const fitting = (x: number, y: number) =>
    (Math.abs(x + 0.515) < 0.3 && y > 1.0 && y < 1.45) ||              // bow MG and its armoured cover
    (x > -0.12 && x < 0.57 && y > 1.1 && y < 1.5) ||                    // driver's hatch
    (Math.abs(Math.abs(x) - 1.2) < 0.16 && y > 1.1) ||                  // headlights and antenna
    (Math.abs(Math.abs(x) - 0.5) < 0.1 && y < 1.05);                    // tow hooks
  for (const x of range(-1.1, 1.1, 0.1)) for (const y of range(1.16, 1.52, 0.06)) {
    if (!fitting(x, y) && Math.abs(x) < 1.29 - (y - 1.125) * 0.885 - 0.03) expectPlate(`glacis ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 45, 'hull');
  }
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(0.8, 1.1, 0.06)) if (!fitting(x, y)) expectPlate(`nose ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 45, 'hull');
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(0.45, 0.75, 0.06)) expectPlate(`lower glacis ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 45, 'hull');
  for (const x of range(-0.55, 0.55, 0.1)) for (const y of range(1.82, 2.28, 0.06)) {
    if (Math.abs(x) < 0.12 && Math.abs(y - 2.062) < 0.12) continue; // barrel
    expectPlate(`mantlet ${x.toFixed(2)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 65, 'gun', 0, 0.1);
  }
});

test('side, rear and deck hits follow the hull plates', () => {
  for (const side of [-1, 1]) for (const z of range(-0.2, 1.5, 0.1)) for (const y of range(1.16, 1.52, 0.06)) {
    if (y > 1.29 && y < 1.37 && z < 0.9) continue; // hand rail
    expectPlate(`side ${side} ${z.toFixed(1)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 45, 'hull');
  }
  for (const x of [-1.05, -0.95, -0.85, 0.85, 0.95, 1.05]) for (const y of range(1.2, 1.32, 0.04)) expectPlate(`rear ${x},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 40, 'hull');
  for (const x of range(-0.8, 0.8, 0.2)) for (const y of range(0.45, 0.85, 0.1)) expectPlate(`rear lower ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 40, 'hull');
  for (const x of range(-0.6, 0.6, 0.2)) for (const z of [-2.0, -1.3, -0.7]) expectPlate(`deck ${x.toFixed(1)},${z}`, [x, 10, z], [0, -1, 0], 20, 'hull', 0, 0.07);
});

test('turret casting hits follow its faces and traverse', () => {
  for (const side of [-1, 1]) for (const z of range(-0.25, 1.15, 0.1)) for (const y of range(1.8, 2.35, 0.05)) {
    if (y > 2.09 && y < 2.16 && z > -0.2 && z < 0.45) continue;       // hand rail
    if (Math.abs(y - 1.882) < 0.07 && Math.abs(z - 0.928) < 0.07) continue; // pistol port
    const hit = expectPlate(`turret ${side} ${z.toFixed(1)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 52, 'turret');
    assert.match(hit.plateInfo.name, /Turret (Side|Cheek|Rear Cheek)/);
  }
  for (const x of range(-0.4, 0.4, 0.1)) for (const y of range(1.8, 2.35, 0.05)) expectPlate(`turret rear ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 45, 'turret');
  for (const x of range(-0.5, 0.3, 0.1)) expectPlate(`turret 90 side ${x.toFixed(1)}`, [x, 2.1, 10], [0, 0, -1], 52, 'turret', Math.PI / 2);
});
