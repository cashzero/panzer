import * as THREE from 'three';
import { TankData } from './store';
import { GAME_CONFIG } from './config';

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
