import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import type { MapSize } from './store';
import type { RoadNetwork, RoadSegment } from './roads';
import { getRoadInfluence } from './roads';
import { sampleTerrainHeight, sampleTerrainWithoutBuildings } from './terrainHeight';

export interface BuildingInstance {
  id: string;
  kind: 'farmhouse' | 'barn' | 'warehouse';
  position: [number, number, number];
  rotation: number;
  width: number;
  depth: number;
  height: number;
  roofHeight: number;
}

export interface FarmlandPlot {
  id: string;
  center: [number, number, number];
  rotation: number;
  width: number;
  depth: number;
}

interface BuildingShape {
  width: number;
  depth: number;
  height: number;
  roofHeight: number;
}

const MAP_METERS_BY_SIZE: Record<MapSize, number> = {
  small: 1000,
  medium: 2000,
  large: 4000,
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateLocalToWorld(x: number, z: number, rotation: number): [number, number] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [x * c - z * s, x * s + z * c];
}

function getBuildingRadius(building: Pick<BuildingInstance, 'width' | 'depth'>): number {
  return Math.sqrt(building.width * building.width + building.depth * building.depth) * 0.5;
}

export function getBuildingClearanceRadius(building: Pick<BuildingInstance, 'width' | 'depth'>): number {
  return getBuildingRadius(building);
}

function isNearExistingBuilding(
  x: number,
  z: number,
  radius: number,
  buildings: BuildingInstance[],
  margin: number,
): boolean {
  return buildings.some((building) => {
    const dx = building.position[0] - x;
    const dz = building.position[2] - z;
    return Math.hypot(dx, dz) < getBuildingRadius(building) + radius + margin;
  });
}

function sampleSlope(
  x: number,
  z: number,
  rotation: number,
  width: number,
  depth: number,
  roadNetwork: RoadNetwork,
): number {
  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const corners: [number, number][] = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [lx, lz] of corners) {
    const [wx, wz] = rotateLocalToWorld(lx, lz, rotation);
    const y = sampleTerrainWithoutBuildings(x + wx, z + wz, roadNetwork, getRoadInfluence);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return maxY - minY;
}

function createBuildingShape(kind: BuildingInstance['kind'], rng: () => number): BuildingShape {
  if (kind === 'barn') {
    return {
      width: 18 + rng() * 4,
      depth: 10 + rng() * 3,
      height: 6 + rng() * 1.5,
      roofHeight: 3,
    };
  }

  if (kind === 'warehouse') {
    return {
      width: 24 + rng() * 8,
      depth: 12 + rng() * 5,
      height: 7 + rng() * 2,
      roofHeight: 2.2,
    };
  }

  return {
    width: 10 + rng() * 5,
    depth: 7 + rng() * 3,
    height: 4.5 + rng() * 1.2,
    roofHeight: 2.4,
  };
}

function createBuildingFromShape(
  id: string,
  kind: BuildingInstance['kind'],
  x: number,
  z: number,
  rotation: number,
  roadNetwork: RoadNetwork,
  shape: BuildingShape,
): BuildingInstance {
  const y = sampleTerrainWithoutBuildings(x, z, roadNetwork, getRoadInfluence);
  return {
    id,
    kind,
    position: [x, y, z],
    rotation,
    width: shape.width,
    depth: shape.depth,
    height: shape.height,
    roofHeight: shape.roofHeight,
  };
}

function findFlatBuildingPosition(
  targetX: number,
  targetZ: number,
  rotation: number,
  shape: BuildingShape,
  roadNetwork: RoadNetwork,
  buildings: BuildingInstance[],
  mapHalfSize: number,
): [number, number] | null {
  const radii = [0, 10, 20, 32, 46, 62];
  for (const radius of radii) {
    const steps = radius === 0 ? 1 : 12;
    for (let i = 0; i < steps; i++) {
      const angle = radius === 0 ? 0 : (Math.PI * 2 * i) / steps;
      const x = targetX + Math.cos(angle) * radius;
      const z = targetZ + Math.sin(angle) * radius;
      if (Math.hypot(x, z) < GAME_CONFIG.buildings.exclusionFromCenter) continue;
      if (Math.abs(x) > mapHalfSize - 45 || Math.abs(z) > mapHalfSize - 45) continue;
      if (getRoadInfluence(x, z, roadNetwork).influence > 0.08) continue;
      if (sampleSlope(x, z, rotation, shape.width, shape.depth, roadNetwork) > GAME_CONFIG.buildings.placementMaxSlopeDelta) continue;
      if (isNearExistingBuilding(x, z, getBuildingRadius(shape), buildings, GAME_CONFIG.buildings.minSpacing)) continue;
      return [x, z];
    }
  }

  return null;
}

function tryPlaceRoadsideBuilding(
  buildings: BuildingInstance[],
  roadNetwork: RoadNetwork,
  segment: RoadSegment,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  t: number,
  side: 1 | -1,
  id: string,
  rng: () => number,
  mapHalfSize: number,
): void {
  const x = ax + (bx - ax) * t;
  const z = az + (bz - az) * t;
  const tangentX = bx - ax;
  const tangentZ = bz - az;
  const length = Math.hypot(tangentX, tangentZ);
  if (length < 1) return;

  const dirX = tangentX / length;
  const dirZ = tangentZ / length;
  const normalX = dirZ * side;
  const normalZ = -dirX * side;
  const facing = Math.atan2(dirX, dirZ);
  const kindRoll = rng();
  const kind: BuildingInstance['kind'] = kindRoll < 0.58 ? 'farmhouse' : kindRoll < 0.86 ? 'barn' : 'warehouse';
  const shape = createBuildingShape(kind, rng);
  const setback = segment.halfWidth + GAME_CONFIG.buildings.roadsideSetback + shape.depth * 0.5 + rng() * 10;
  const jitter = (rng() - 0.5) * 14;
  const targetX = x + normalX * setback + dirX * jitter;
  const targetZ = z + normalZ * setback + dirZ * jitter;
  const placement = findFlatBuildingPosition(targetX, targetZ, facing, shape, roadNetwork, buildings, mapHalfSize);
  if (!placement) return;

  buildings.push(createBuildingFromShape(id, kind, placement[0], placement[1], facing, roadNetwork, shape));
}

export function generateBuildings(mapSize: MapSize, roadNetwork: RoadNetwork, seed: number): BuildingInstance[] {
  const rng = mulberry32(seed ^ 0x9E3779B9);
  const buildings: BuildingInstance[] = [];
  const mapHalfSize = MAP_METERS_BY_SIZE[mapSize] * 0.5;
  let idCounter = 0;

  for (const [jx, jz] of roadNetwork.junctions) {
    const angle = rng() * Math.PI * 2;
    const clusterCount = GAME_CONFIG.buildings.junctionClusterMin + Math.floor(rng() * (GAME_CONFIG.buildings.junctionClusterMax - GAME_CONFIG.buildings.junctionClusterMin + 1));
    for (let i = 0; i < clusterCount; i++) {
      const localAngle = angle + (Math.PI * 2 * i) / clusterCount + (rng() - 0.5) * 0.4;
      const dist = 32 + rng() * 36;
      const kind: BuildingInstance['kind'] = i % 4 === 0 ? 'warehouse' : i % 3 === 0 ? 'barn' : 'farmhouse';
      const rotation = localAngle + Math.PI * 0.5 + (rng() - 0.5) * 0.5;
      const x = jx + Math.cos(localAngle) * dist;
      const z = jz + Math.sin(localAngle) * dist;
      const shape = createBuildingShape(kind, rng);
      const placement = findFlatBuildingPosition(x, z, rotation, shape, roadNetwork, buildings, mapHalfSize);
      if (!placement) continue;
      buildings.push(createBuildingFromShape(`bld-${idCounter++}`, kind, placement[0], placement[1], rotation, roadNetwork, shape));
    }
  }

  for (const segment of roadNetwork.segments) {
    const points = segment.points;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const segmentLength = Math.hypot(bx - ax, bz - az);
      const spacing = GAME_CONFIG.buildings.roadsideSpacing * (0.75 + rng() * 0.5);
      const steps = Math.max(1, Math.floor(segmentLength / spacing));

      for (let step = 1; step < steps; step++) {
        if (rng() > GAME_CONFIG.buildings.roadsideChance) continue;
        const t = step / steps;
        tryPlaceRoadsideBuilding(
          buildings,
          roadNetwork,
          segment,
          ax,
          az,
          bx,
          bz,
          t,
          rng() > 0.5 ? 1 : -1,
          `bld-${idCounter++}`,
          rng,
          mapHalfSize,
        );
      }
    }
  }

  return buildings;
}

export function projectBuildingsToTerrain(buildings: BuildingInstance[], roadNetwork: RoadNetwork): BuildingInstance[] {
  return buildings.map((building) => ({
    ...building,
    position: [
      building.position[0],
      sampleTerrainHeight(building.position[0], building.position[2], roadNetwork, getRoadInfluence, buildings),
      building.position[2],
    ],
  }));
}

export function isPointInsideFarmland(x: number, z: number, plot: FarmlandPlot, margin: number = 0): boolean {
  const dx = x - plot.center[0];
  const dz = z - plot.center[2];
  const c = Math.cos(-plot.rotation);
  const s = Math.sin(-plot.rotation);
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  return Math.abs(localX) <= plot.width * 0.5 + margin && Math.abs(localZ) <= plot.depth * 0.5 + margin;
}

export function getFarmlandInfluence(x: number, z: number, farmlands: FarmlandPlot[]): number {
  let best = 0;
  for (const plot of farmlands) {
    const dx = x - plot.center[0];
    const dz = z - plot.center[2];
    const c = Math.cos(-plot.rotation);
    const s = Math.sin(-plot.rotation);
    const localX = dx * c - dz * s;
    const localZ = dx * s + dz * c;
    const edgeX = Math.max(0, Math.abs(localX) - plot.width * 0.5);
    const edgeZ = Math.max(0, Math.abs(localZ) - plot.depth * 0.5);
    const dist = Math.hypot(edgeX, edgeZ);
    if (dist > GAME_CONFIG.farmland.edgeBlend) continue;
    const t = dist <= 0.001 ? 1 : 1 - dist / GAME_CONFIG.farmland.edgeBlend;
    best = Math.max(best, t * t * (3 - 2 * t));
  }
  return best;
}

export function generateFarmlands(
  buildings: BuildingInstance[],
  roadNetwork: RoadNetwork,
  mapSize: MapSize,
  seed: number,
): FarmlandPlot[] {
  const rng = mulberry32(seed ^ 0x51f15e);
  const farmlands: FarmlandPlot[] = [];
  const mapHalfSize = MAP_METERS_BY_SIZE[mapSize] * 0.5;

  for (const building of buildings) {
    if (building.kind === 'warehouse') continue;
    const plots = building.kind === 'barn' ? 2 : 1;
    for (let i = 0; i < plots; i++) {
      const side = i === 0 ? 1 : -1;
      const width = building.kind === 'barn' ? 42 + rng() * 24 : 30 + rng() * 18;
      const depth = building.kind === 'barn' ? 60 + rng() * 28 : 42 + rng() * 20;
      const offset = building.depth * 0.6 + depth * 0.52 + 10 + rng() * 10;
      const angle = building.rotation + (rng() - 0.5) * 0.18;
      const normalX = Math.sin(building.rotation) * side;
      const normalZ = Math.cos(building.rotation) * side;
      const cx = building.position[0] + normalX * offset;
      const cz = building.position[2] + normalZ * offset;
      if (Math.abs(cx) > mapHalfSize - 30 || Math.abs(cz) > mapHalfSize - 30) continue;
      if (getRoadInfluence(cx, cz, roadNetwork).influence > 0.12) continue;
      if (isPointNearAnyBuilding(cx, cz, buildings, Math.min(width, depth) * 0.2)) continue;
      farmlands.push({
        id: `${building.id}-field-${i}`,
        center: [cx, building.position[1], cz],
        rotation: angle,
        width,
        depth,
      });
    }
  }

  return farmlands;
}

export function isPointInsideBuildingFootprint(
  x: number,
  z: number,
  building: BuildingInstance,
  margin: number = 0,
): boolean {
  const dx = x - building.position[0];
  const dz = z - building.position[2];
  const c = Math.cos(-building.rotation);
  const s = Math.sin(-building.rotation);
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  return Math.abs(localX) <= building.width * 0.5 + margin && Math.abs(localZ) <= building.depth * 0.5 + margin;
}

export function isPointNearAnyBuilding(
  x: number,
  z: number,
  buildings: BuildingInstance[],
  margin: number,
): boolean {
  return buildings.some((building) => isPointInsideBuildingFootprint(x, z, building, margin));
}

export function findNearestOpenPosition(
  x: number,
  z: number,
  buildings: BuildingInstance[],
  margin: number,
  maxDistance: number = 180,
): [number, number] {
  if (!isPointNearAnyBuilding(x, z, buildings, margin)) return [x, z];

  const directions = 24;
  for (let radius = 8; radius <= maxDistance; radius += 8) {
    for (let i = 0; i < directions; i++) {
      const angle = (Math.PI * 2 * i) / directions;
      const candidateX = x + Math.cos(angle) * radius;
      const candidateZ = z + Math.sin(angle) * radius;
      if (!isPointNearAnyBuilding(candidateX, candidateZ, buildings, margin)) {
        return [candidateX, candidateZ];
      }
    }
  }

  return [x, z];
}

export function steerDirectionAroundBuildings(
  position: THREE.Vector3,
  desiredDir: THREE.Vector3,
  buildings: BuildingInstance[],
  lookAhead: number,
  clearance: number,
): THREE.Vector3 {
  const planar = desiredDir.clone();
  planar.y = 0;
  if (planar.lengthSq() < 0.0001) return desiredDir;
  planar.normalize();

  const lateral = new THREE.Vector3(planar.z, 0, -planar.x);
  const steer = planar.clone();

  for (const building of buildings) {
    const toBuilding = new THREE.Vector3(
      building.position[0] - position.x,
      0,
      building.position[2] - position.z,
    );
    const forwardDist = toBuilding.dot(planar);
    if (forwardDist <= 0 || forwardDist > lookAhead) continue;

    const lateralDist = toBuilding.dot(lateral);
    const avoidRadius = getBuildingClearanceRadius(building) + clearance;
    if (Math.abs(lateralDist) > avoidRadius) continue;

    const strength = (1 - forwardDist / lookAhead) * (1 - Math.abs(lateralDist) / avoidRadius);
    const turnDir = lateralDist >= 0 ? -1 : 1;
    steer.add(lateral.clone().multiplyScalar(turnDir * Math.max(0.6, strength * 1.8)));
  }

  steer.y = 0;
  if (steer.lengthSq() < 0.0001) return desiredDir;
  return steer.normalize();
}

const _localRay = new THREE.Ray();
const _inverse = new THREE.Matrix4();
const _world = new THREE.Matrix4();
const _box = new THREE.Box3();
const _hitLocal = new THREE.Vector3();
const _hitWorld = new THREE.Vector3();
const _normalLocal = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _normalWorld = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _origin = new THREE.Vector3();

export function intersectBuildingRay(
  ray: THREE.Ray,
  maxDistance: number,
  building: BuildingInstance,
): { point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null {
  _origin.set(building.position[0], building.position[1], building.position[2]);
  _quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, building.rotation);
  _world.compose(_origin, _quat, _scale);
  _inverse.copy(_world).invert();
  _localRay.copy(ray).applyMatrix4(_inverse);
  _box.min.set(-building.width * 0.5, 0, -building.depth * 0.5);
  _box.max.set(building.width * 0.5, building.height + building.roofHeight, building.depth * 0.5);
  const hit = _localRay.intersectBox(_box, _hitLocal);
  if (!hit) return null;

  const distance = _localRay.origin.distanceTo(_hitLocal);
  if (distance > maxDistance) return null;

  const dxMin = Math.abs(_hitLocal.x - _box.min.x);
  const dxMax = Math.abs(_hitLocal.x - _box.max.x);
  const dyMin = Math.abs(_hitLocal.y - _box.min.y);
  const dyMax = Math.abs(_hitLocal.y - _box.max.y);
  const dzMin = Math.abs(_hitLocal.z - _box.min.z);
  const dzMax = Math.abs(_hitLocal.z - _box.max.z);
  const best = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax);

  _normalLocal.set(0, 0, 0);
  if (best === dxMin) _normalLocal.set(-1, 0, 0);
  else if (best === dxMax) _normalLocal.set(1, 0, 0);
  else if (best === dyMin) _normalLocal.set(0, -1, 0);
  else if (best === dyMax) _normalLocal.set(0, 1, 0);
  else if (best === dzMin) _normalLocal.set(0, 0, -1);
  else _normalLocal.set(0, 0, 1);

  _hitWorld.copy(_hitLocal).applyMatrix4(_world);
  _normalMatrix.getNormalMatrix(_world);
  _normalWorld.copy(_normalLocal).applyMatrix3(_normalMatrix).normalize();

  return { point: _hitWorld.clone(), normal: _normalWorld.clone(), distance };
}
