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
  root.add(...pick('hull', ['panther-welded-hull', ...skirts]));
  root.add(...pick('tracksLeft', ['left-continuous-track']), ...pick('tracksRight', ['right-continuous-track']));
  const turretGroup = new THREE.Group();
  turretGroup.position.fromArray(spec.mounts.turretOffset);
  turretGroup.rotation.set(0, turret, 0);
  turretGroup.add(...pick('turret', ['panther-turret-shell', 'commander-cupola']));
  const gunGroup = new THREE.Group();
  gunGroup.position.fromArray(spec.mounts.gunPivotOffset);
  gunGroup.rotation.set(elevation, 0, 0);
  gunGroup.add(...pick('gun', ['kwk42-rounded-mantlet']));
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
// Plates are flat approximations: 40 mm of fit tolerance by default; the skewed
// turret walls and the round cupola get a little more.
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

const S = {front: 2.955, rear: -2.819, top: 1.47, bottom: 0.95}; // Schurzen envelope

test('Panther data validates and keeps the documented armour layout', () => {
  assert.deepEqual(validateTankDraft(spec, model, 'panther_a').filter(i => i.severity === 'error'), []);
  assert.deepEqual(spec.durability.armorSummary, {front: 80, side: 40, rear: 40, turret: 100});
  // TankSelect keys its armour inspection meshes by plate name.
  const names = spec.armorModel.plates.map(p => p.name);
  assert.equal(new Set(names).size, names.length, 'Plate names must be unique');
  // Thickness on local X: the collision routine has no 10 mm dead band on that axis.
  for (const p of spec.armorModel.plates) assert.ok(p.halfExtents[0] <= Math.min(p.halfExtents[1], p.halfExtents[2]), `${p.id} thickness axis`);
});

test('frontal hits land on the glacis plates, mantlet and turret front', () => {
  for (const x of range(-1.1, 1.1, 0.1)) for (const y of range(1.5, 1.86, 0.04)) expectPlate(`upper glacis ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 80, 'hull');
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(1.08, 1.44, 0.04)) expectPlate(`upper glacis nose ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 80, 'hull');
  for (const x of range(-0.8, 0.8, 0.1)) for (const y of range(0.58, 1.0, 0.04)) expectPlate(`lower glacis ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 60, 'hull');
  for (const x of range(-0.6, 0.6, 0.1)) for (const y of range(2.05, 2.55, 0.05)) expectPlate(`mantlet ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 100, 'gun');
  for (const x of [-0.82, -0.78, 0.78, 0.82]) for (const y of range(1.95, 2.25, 0.05)) expectPlate(`turret front ${x},${y.toFixed(2)}`, [x, y, 10], [0, 0, -1], 100, 'turret', 0, 0.06);
});

test('side hits: sloped superstructure above 5 mm Schurzen, turret walls and cupola', () => {
  for (const side of [-1, 1]) {
    for (const z of range(-2.7, 2.0, 0.1)) for (const y of range(1.52, 1.84, 0.04)) expectPlate(`upper side ${side} ${z.toFixed(1)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 40, 'hull');
    for (const z of range(-2.7, 2.85, 0.1)) for (const y of range(1.0, 1.42, 0.06)) expectPlate(`skirt ${side} ${z.toFixed(1)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 5, 'hull');
    for (const z of range(-1.1, 0.3, 0.1)) for (const y of range(1.95, 2.5, 0.05)) expectPlate(`turret ${side} ${z.toFixed(1)},${y.toFixed(2)}`, [side * 10, y, z], [-side, 0, 0], 45, 'turret', 0, 0.06);
  }
  for (const z of range(-0.9, -0.45, 0.05)) expectPlate(`cupola ${z.toFixed(2)}`, [10, 2.78, z], [-1, 0, 0], 80, 'turret', 0, 0.06);
});

test('track hitboxes follow the belt below the skirts without empty corners', () => {
  // Classify probes against the filled belt outline (the running gear inside the
  // loop is part of the track silhouette): interior if the ray and four probes
  // 150 mm around it hit it, exterior if none do; edge probes are not judged.
  // Rays through the Schurzen are covered by the side test.
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
    for (const z of range(-3.0, 3.5, 0.05)) for (const y of range(0, 1.4, 0.05)) {
      if (z < S.front + 0.02 && z > S.rear - 0.02 && y > S.bottom - 0.02 && y < S.top + 0.02) continue;
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
  assert.ok(interior > 600 && exterior > 300, `${interior} interior, ${exterior} exterior probes`);
});

test('rear hits land on the undercut rear plate and turret rear', () => {
  for (const x of range(-0.6, 0.6, 0.1)) for (const y of range(0.6, 1.85, 0.05)) expectPlate(`rear ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 40, 'hull');
  for (const x of range(-0.5, 0.5, 0.1)) for (const y of range(2.0, 2.6, 0.05)) expectPlate(`turret rear ${x.toFixed(1)},${y.toFixed(2)}`, [x, y, -10], [0, 0, 1], 45, 'turret', 0, 0.06);
});

test('plunging hits land on the 16 mm roofs', () => {
  for (const [x, z] of [[0, 1.6], [0.8, 1.5], [-0.9, 1.2]]) assert.equal(expectPlate(`hull roof ${x},${z}`, [x, 10, z], [0, -1, 0], 16, 'hull').plateInfo.name, 'Hull Roof');
  for (const [x, z] of [[-0.9, -2.0], [0.7, -2.6]]) assert.equal(expectPlate(`engine deck ${x},${z}`, [x, 10, z], [0, -1, 0], 16, 'hull').plateInfo.name, 'Engine Deck');
  for (const [x, z] of [[0, -0.2], [-0.3, -0.6], [-0.4, 0.3]]) expectPlate(`turret roof ${x},${z}`, [x, 10, z], [0, -1, 0], 16, 'turret');
});

test('turret armour follows traverse', () => {
  for (const x of range(-0.9, 0.3, 0.1)) expectPlate(`turret 90 side ${x.toFixed(1)}`, [x, 2.3, 10], [0, 0, -1], 45, 'turret', Math.PI / 2, 0.06);
  for (const z of range(-0.8, 0.1, 0.1)) expectPlate(`turret 90 mantlet ${z.toFixed(1)}`, [10, 2.3, z], [-1, 0, 0], 100, 'gun', Math.PI / 2);
});
