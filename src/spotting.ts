import * as THREE from 'three';
import { getTerrainMeshHeight, raycastTerrain } from './Terrain';
import { checkBuildingCollision, checkTreeRayCollision } from './projectilePhysics';
import type { BuildingInstance } from './buildings';
import type { TreeInstance } from './trees';
import type { TankData } from './store';
import { GAME_CONFIG } from './config';
import { getTankDef } from './tanks/registry';
import { FOREST, forestLengthAlong, getActiveForest } from './forest';
import { getActiveHedges, hedgeCrossing } from './hedges';

export type LosBlocker = 'terrain' | 'building' | 'tree' | 'hedge' | 'forest' | null;

export interface LineOfSightResult {
  visible: boolean;
  blockedBy: LosBlocker;
  observerPoint: THREE.Vector3;
  samplePoint: THREE.Vector3;
  distance: number;
}

const _observerOffset = new THREE.Vector3();
const _ray = new THREE.Ray();
const _direction = new THREE.Vector3();
const _segmentEnd = new THREE.Vector3();

function getObserverPoint(tank: TankData): THREE.Vector3 {
  const def = getTankDef(tank.tankType);
  const turretOffset = def.turretOffset;
  _observerOffset.set(turretOffset[0], turretOffset[1] + 0.6, turretOffset[2]);
  const hullQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(tank.pitch || 0, tank.rotation, tank.roll || 0, 'YXZ'),
  );
  _observerOffset.applyQuaternion(hullQuat);
  return tank.position.clone().add(_observerOffset);
}

function getTargetSamplePoints(tank: TankData): THREE.Vector3[] {
  const def = getTankDef(tank.tankType);
  const lateral = Math.max(0.8, def.trackWidth * 0.28);
  const yawQuat = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, tank.rotation);
  const left = new THREE.Vector3(-lateral, 1.6, 0).applyQuaternion(yawQuat).add(tank.position);
  const right = new THREE.Vector3(lateral, 1.6, 0).applyQuaternion(yawQuat).add(tank.position);

  return [
    tank.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
    tank.position.clone().add(new THREE.Vector3(0, 2.4, 0)),
    left,
    right,
  ];
}

function isBlocked(ray: THREE.Ray, distance: number, trees: TreeInstance[], buildings: BuildingInstance[]): LosBlocker {
  const margin = 0.25;
  // Test against the rendered surface: what a crew can actually see over.
  const terrainHit = raycastTerrain(ray.origin, ray.direction, distance, getTerrainMeshHeight);
  if (terrainHit && ray.origin.distanceTo(terrainHit) < distance - margin) {
    return 'terrain';
  }

  const buildingHit = checkBuildingCollision(ray, distance, buildings);
  if (buildingHit && buildingHit.distance < distance - margin) {
    return 'building';
  }

  const treeHit = checkTreeRayCollision(ray, distance, trees, GAME_CONFIG.trees.collisionRadius);
  if (treeHit && treeHit.distance < distance - margin) {
    return 'tree';
  }

  // Nobody sees through a hedge, only over it.
  const end = ray.at(distance, _segmentEnd);
  const hedgeT = hedgeCrossing(getActiveHedges(), ray.origin.x, ray.origin.y, ray.origin.z, end.x, end.y, end.z,
    getTerrainMeshHeight);
  if (hedgeT !== null && hedgeT * distance < distance - margin) {
    return 'hedge';
  }

  // A crew at the edge of a wood sees out and can be seen; nobody sees
  // through more than FOREST.sightDepth of it below the canopy.
  const forest = getActiveForest();
  if (forest) {
    const inForest = forestLengthAlong(forest, ray.origin.x, ray.origin.y, ray.origin.z, end.x, end.y, end.z,
      getTerrainMeshHeight, FOREST.sightDepth);
    if (inForest >= FOREST.sightDepth) return 'forest';
  }

  return null;
}

export function hasLineOfSight(
  observer: TankData,
  target: TankData,
  trees: TreeInstance[],
  buildings: BuildingInstance[],
): LineOfSightResult {
  const observerPoint = getObserverPoint(observer);
  const samplePoints = getTargetSamplePoints(target);
  let fallback = samplePoints[0];
  let fallbackDistance = observerPoint.distanceTo(fallback);
  let fallbackBlockedBy: LosBlocker = 'terrain';

  for (const samplePoint of samplePoints) {
    _direction.copy(samplePoint).sub(observerPoint);
    const distance = _direction.length();
    if (distance <= 0.001 || distance > GAME_CONFIG.ai.spottingRange) continue;
    _direction.divideScalar(distance);
    _ray.set(observerPoint.clone(), _direction.clone());

    const blockedBy = isBlocked(_ray, distance, trees, buildings);
    if (!blockedBy) {
      return {
        visible: true,
        blockedBy: null,
        observerPoint: observerPoint.clone(),
        samplePoint: samplePoint.clone(),
        distance,
      };
    }

    if (distance < fallbackDistance) {
      fallback = samplePoint;
      fallbackDistance = distance;
      fallbackBlockedBy = blockedBy;
    }
  }

  return {
    visible: false,
    blockedBy: fallbackBlockedBy,
    observerPoint: observerPoint.clone(),
    samplePoint: fallback.clone(),
    distance: fallbackDistance,
  };
}

export function collectVisibleTargetIds(
  observers: TankData[],
  targets: TankData[],
  trees: TreeInstance[],
  buildings: BuildingInstance[],
): string[] {
  const visible = new Set<string>();

  for (const observer of observers) {
    if (observer.destroyed) continue;

    for (const target of targets) {
      if (target.destroyed || visible.has(target.id)) continue;
      if (observer.position.distanceTo(target.position) > GAME_CONFIG.ai.spottingRange) continue;
      if (hasLineOfSight(observer, target, trees, buildings).visible) {
        visible.add(target.id);
      }
    }
  }

  return [...visible];
}
