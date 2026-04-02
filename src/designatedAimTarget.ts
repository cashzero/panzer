import * as THREE from 'three';
import { useGameStore } from './store';
import { getTankDef } from './tanks/registry';
import { testProjectileAgainstTank } from './armorModel';
import { intersectBuildingRay } from './buildings';
import { raycastTerrain } from './Terrain';
import { checkTreeRayCollision } from './projectilePhysics';
import { GAME_CONFIG } from './config';

export type DesignatedAimTargetKind = 'tank' | 'building' | 'tree' | 'terrain' | 'fallback';

export interface DesignatedAimTargetResult {
  point: THREE.Vector3;
  normal?: THREE.Vector3;
  distance: number;
  kind: DesignatedAimTargetKind;
  tankId?: string;
}

export function resolveDesignatedAimTarget(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance = 2000,
  excludeTankId?: string,
): DesignatedAimTargetResult {
  const state = useGameStore.getState();
  const ray = new THREE.Ray(origin.clone(), direction.clone().normalize());
  let closest: DesignatedAimTargetResult | null = null;

  const allTanks = [state.playerTank, ...state.enemies, ...state.allies].filter(
    (tank) => !tank.destroyed && tank.id !== excludeTankId,
  );

  for (const tank of allTanks) {
    const def = getTankDef(tank.tankType);
    const profile = { plates: def.plates, broadPhaseRadius: def.broadPhaseRadius };
    const hit = testProjectileAgainstTank(ray, maxDistance, tank, profile, def.turretOffset, def.gunPivotOffset);
    if (!hit) continue;
    if (!closest || hit.distance < closest.distance) {
      closest = {
        point: hit.worldPoint,
        normal: hit.normal,
        distance: hit.distance,
        kind: 'tank',
        tankId: tank.id,
      };
    }
  }

  for (const building of state.buildings) {
    const hit = intersectBuildingRay(ray, maxDistance, building);
    if (!hit) continue;
    if (!closest || hit.distance < closest.distance) {
      closest = {
        point: hit.point,
        normal: hit.normal,
        distance: hit.distance,
        kind: 'building',
      };
    }
  }

  const treeHit = checkTreeRayCollision(ray, maxDistance, state.trees, GAME_CONFIG.trees.collisionRadius);
  if (treeHit && (!closest || treeHit.distance < closest.distance)) {
    closest = {
      point: treeHit.point,
      normal: treeHit.normal,
      distance: treeHit.distance,
      kind: 'tree',
    };
  }

  const terrainHit = raycastTerrain(ray.origin, ray.direction, maxDistance);
  if (terrainHit) {
    const terrainDistance = ray.origin.distanceTo(terrainHit);
    if (!closest || terrainDistance < closest.distance) {
      closest = {
        point: terrainHit,
        distance: terrainDistance,
        kind: 'terrain',
      };
    }
  }

  if (closest) return closest;

  return {
    point: ray.origin.clone().add(ray.direction.clone().multiplyScalar(maxDistance)),
    distance: maxDistance,
    kind: 'fallback',
  };
}
