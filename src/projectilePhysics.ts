import * as THREE from 'three';
import { getTerrainHeight } from './Terrain';
import type { TreeInstance } from './trees';
import type { BuildingInstance } from './buildings';
import { intersectBuildingRay } from './buildings';

// --- Projectile Motion ---

export interface ProjectileStep {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

export function stepProjectile(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  dt: number,
  gravity: number,
): ProjectileStep {
  const newPos = position.clone().add(velocity.clone().multiplyScalar(dt));
  const newVel = velocity.clone();
  newVel.y -= gravity * dt;
  return { position: newPos, velocity: newVel };
}

// --- Terrain Collision ---

export interface TerrainHitResult {
  hit: boolean;
}

export function checkTerrainCollision(nextPos: THREE.Vector3): TerrainHitResult {
  const terrainHeight = getTerrainHeight(nextPos.x, nextPos.z);
  return { hit: nextPos.y <= terrainHeight };
}

// --- Tree Collision ---

export interface TreeHitResult {
  hit: boolean;
  treeIndex: number;
  normal: THREE.Vector3;
  newHealth: number;
  shouldFall: boolean;
  fallDirection: number;
}

export function checkTreeCollision(
  nextPos: THREE.Vector3,
  trees: TreeInstance[],
  treeRadius: number,
): TreeHitResult | null {
  for (let ti = 0; ti < trees.length; ti++) {
    const tree = trees[ti];
    if (tree.fallen) continue;
    const tx = tree.position[0];
    const tz = tree.position[2];
    const ty = tree.position[1];
    const dx = nextPos.x - tx;
    const dz = nextPos.z - tz;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
    const treeHeight = 8 * tree.scale;
    if (distXZ < treeRadius + 0.2 && nextPos.y >= ty && nextPos.y <= ty + treeHeight) {
      const newHealth = tree.health - 50;
      return {
        hit: true,
        treeIndex: ti,
        normal: new THREE.Vector3(dx / distXZ, 0, dz / distXZ),
        newHealth,
        shouldFall: newHealth <= 0,
        fallDirection: Math.atan2(dx, dz),
      };
    }
  }
  return null;
}

export interface BuildingHitResult {
  hit: boolean;
  buildingId: string;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

export function checkBuildingCollision(
  ray: THREE.Ray,
  rayLength: number,
  buildings: BuildingInstance[],
): BuildingHitResult | null {
  let closest: BuildingHitResult | null = null;

  for (const building of buildings) {
    const hit = intersectBuildingRay(ray, rayLength, building);
    if (!hit) continue;
    if (!closest || hit.distance < closest.distance) {
      closest = {
        hit: true,
        buildingId: building.id,
        point: hit.point,
        normal: hit.normal,
        distance: hit.distance,
      };
    }
  }

  return closest;
}
