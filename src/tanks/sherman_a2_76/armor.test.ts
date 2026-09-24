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
  root.add(...pick(model.slots.hull, ['m4a2-large-hatch-welded-hull', 'lower-hull-tub', 'rounded-differential-housing']));
  const turretGroup = new THREE.Group();
  turretGroup.position.fromArray(spec.mounts.turretOffset);
  turretGroup.rotation.set(0, turret, 0);
  const casting = model.slots.turret[0];
  assert.ok(casting.type === 'group');
  const castingGroup = new THREE.Group();
  if (casting.scale) castingGroup.scale.fromArray(casting.scale);
  castingGroup.add(...pick(casting.children, ['t23-single-cast-shell']));
  turretGroup.add(castingGroup);
  const gunGroup = new THREE.Group();
  gunGroup.position.fromArray(spec.mounts.gunPivotOffset);
  gunGroup.rotation.set(-elevation, 0, 0);
  gunGroup.add(...pick(model.slots.gun, ['m62-rounded-rotor-shield']));
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
// Plates are flat approximations of the rendered surfaces; the rounded turret
// casting and differential housing get a wider fit tolerance.
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

test('M4A2(76) data validates and keeps its armour values', () => {
  assert.deepEqual(validateTankDraft(spec, model, 'sherman_a2_76').filter(i => i.severity === 'error'), []);
  assert.deepEqual(spec.durability.armorSummary, {front: 100, side: 38, rear: 38, turret: 89});
  // TankSelect keys its armour inspection meshes by plate name.
  const names = spec.armorModel.plates.map(p => p.name);
  assert.equal(new Set(names).size, names.length, 'Plate names must be unique');
  const ids = spec.armorModel.plates.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'Plate ids must be unique');
});

test('frontal hits land on the glacis, rotor shield and differential', () => {
  // The upper glacis is fronted by headlights and the bow MG; probe the plate between them.
  for (const x of range(-1.2, 1.2, 0.1)) for (const y of range(1.36, 2.02, 0.06)) {
    if (y > 1.45 && y < 1.7 && (Math.abs(Math.abs(x) - 0.96) < 0.2 || Math.abs(x + 0.55) < 0.2)) continue;
    expectPlate(`glacis ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 120, 'hull');
  }
  for (const x of range(-0.6, 0.6, 0.1)) for (const y of range(2.25, 2.74, 0.05)) {
    if (Math.abs(x) < 0.15 && Math.abs(y - 2.433) < 0.15) continue; // barrel and collar
    expectPlate(`shield ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 89, 'gun');
  }
  for (const x of range(-0.7, 0.7, 0.1)) for (const y of range(0.6, 1.2, 0.05)) expectPlate(`differential ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 80, 'hull', 0, 0.12);
});

test('side and rear hits follow the hull plates', () => {
  for (const side of [-1, 1]) {
    for (const z of range(-2.75, 1.7, 0.05)) for (const y of range(1.36, 1.6, 0.04)) expectPlate(`side ${side} ${z.toFixed(2)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 38, 'hull');
    for (const z of range(-0.85, 1.7, 0.1)) for (const y of range(1.6, 2.04, 0.04)) expectPlate(`upper side ${side} ${z.toFixed(2)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 38, 'hull');
  }
  for (const x of range(-1.3, 1.3, 0.1)) for (const y of range(1.36, 1.6, 0.06)) expectPlate(`rear upper ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 38, 'hull', 0, 0.06);
});

test('plunging hits land on the roof and engine deck', () => {
  for (const x of range(-1.2, 1.2, 0.2)) {
    for (const z of [1.6, -1.6, -2.0, -2.6]) {
      const hit = expectPlate(`top ${x.toFixed(1)},${z}`, [x, 10, z], [0, -1, 0], 19, 'hull', 0, 0.05);
      assert.match(hit.plateInfo.name, /Roof|Deck/);
    }
  }
});

test('turret casting hits follow the shell and traverse', () => {
  for (const side of [-1, 1]) for (const z of range(-1.2, 0.5, 0.1)) for (const y of range(2.4, 2.75, 0.05)) {
    const hit = expectPlate(`turret ${side} ${z.toFixed(1)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 63, 'turret', 0, 0.1);
    assert.match(hit.plateInfo.name, /Turret (Side|Bustle Side)/);
  }
  for (const x of range(-0.5, 0.5, 0.1)) for (const y of range(2.3, 2.7, 0.1)) expectPlate(`bustle ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 63, 'turret', 0, 0.1);
  for (const x of range(-0.5, 0.5, 0.1)) expectPlate(`turret 90 side ${x.toFixed(1)}`, [x, 2.5, 10], [0, 0, -1], 63, 'turret', Math.PI / 2, 0.1);
});
