import * as THREE from 'three';
import { TankData } from './store';
import { GAME_CONFIG } from './config';
import type { TreeInstance } from './trees';
import type { BuildingInstance } from './buildings';

const _tempVec = new THREE.Vector3();

/**
 * Resolve tank-tank collisions by pushing the moving tank out of overlap.
 * Uses circle-circle collision in the XZ plane.
 * Returns the adjusted position for the moving tank.
 */
export function resolveTankCollision(
  movingTankId: string,
  newPos: THREE.Vector3,
  allTanks: TankData[]
): THREE.Vector3 {
  const radius = GAME_CONFIG.tank.collisionRadius;
  const minDist = radius * 2;

  for (const other of allTanks) {
    if (other.id === movingTankId || other.destroyed) continue;

    _tempVec.copy(newPos).sub(other.position);
    _tempVec.y = 0; // Only XZ plane

    const dist = _tempVec.length();
    if (dist < minDist && dist > 0.001) {
      // Push out along the separation direction
      const overlap = minDist - dist;
      _tempVec.normalize().multiplyScalar(overlap);
      newPos.x += _tempVec.x;
      newPos.z += _tempVec.z;
    }
  }

  return newPos;
}

export interface TreeCollisionResult {
  knockedTreeIndex: number | null;
}

const _treeSep = new THREE.Vector3();
const _buildingPush = new THREE.Vector3();

/**
 * Resolve tank-tree collisions.
 * High speed knocks tree down; low speed blocks the tank.
 */
export function resolveTreeCollision(
  newPos: THREE.Vector3,
  speed: number,
  trees: TreeInstance[]
): TreeCollisionResult {
  const tankRadius = GAME_CONFIG.tank.collisionRadius;
  const treeRadius = GAME_CONFIG.trees.collisionRadius;
  const minDist = tankRadius + treeRadius;
  const knockdownSpeed = GAME_CONFIG.trees.knockdownSpeed;

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    if (tree.fallen) continue;

    const dx = newPos.x - tree.position[0];
    const dz = newPos.z - tree.position[2];
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < minDist && dist > 0.001) {
      if (Math.abs(speed) > knockdownSpeed) {
        // Knock tree down
        const fallDir = Math.atan2(dx, dz);
        return { knockedTreeIndex: i };
      } else {
        // Push tank out
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        newPos.x += nx * overlap;
        newPos.z += nz * overlap;
        return { knockedTreeIndex: null };
      }
    }
  }

  return { knockedTreeIndex: null };
}

export function resolveBuildingCollision(newPos: THREE.Vector3, buildings: BuildingInstance[]): void {
  const tankRadius = GAME_CONFIG.tank.collisionRadius;

  for (const building of buildings) {
    const dx = newPos.x - building.position[0];
    const dz = newPos.z - building.position[2];
    const c = Math.cos(-building.rotation);
    const s = Math.sin(-building.rotation);
    const localX = dx * c - dz * s;
    const localZ = dx * s + dz * c;
    const expandedHalfW = building.width * 0.5 + tankRadius;
    const expandedHalfD = building.depth * 0.5 + tankRadius;

    if (Math.abs(localX) >= expandedHalfW || Math.abs(localZ) >= expandedHalfD) continue;

    const pushX = expandedHalfW - Math.abs(localX);
    const pushZ = expandedHalfD - Math.abs(localZ);
    const outX = localX >= 0 ? expandedHalfW : -expandedHalfW;
    const outZ = localZ >= 0 ? expandedHalfD : -expandedHalfD;
    const resolvedLocalX = pushX < pushZ ? outX : localX;
    const resolvedLocalZ = pushZ <= pushX ? outZ : localZ;
    const wc = Math.cos(building.rotation);
    const ws = Math.sin(building.rotation);

    _buildingPush.set(
      building.position[0] + resolvedLocalX * wc - resolvedLocalZ * ws,
      newPos.y,
      building.position[2] + resolvedLocalX * ws + resolvedLocalZ * wc,
    );
    newPos.x = _buildingPush.x;
    newPos.z = _buildingPush.z;
  }
}
