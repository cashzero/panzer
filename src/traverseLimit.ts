import * as THREE from 'three';

/**
 * Guns that traverse only part of the way round (casemate vehicles such as the
 * StuG III) carry `traverseLimit`: radians each side of the hull centreline.
 * A full turret has no limit.
 */

/** Keeps a gun inside its traverse arc; a full turret turns freely. */
export function clampTraverse(turretRotation: number, limit?: number) {
  if (limit === undefined) return turretRotation;
  const wrapped = Math.atan2(Math.sin(turretRotation), Math.cos(turretRotation));
  return THREE.MathUtils.clamp(wrapped, -limit, limit);
}

/**
 * Hull heading for a gun with a traverse arc: hold the hull while the target
 * stays well inside the arc, else swing the front square on to it.
 */
export function casemateHullHeading(bearingToTarget: number, currentRotation: number, limit: number) {
  const off = Math.abs(Math.atan2(Math.sin(bearingToTarget - currentRotation), Math.cos(bearingToTarget - currentRotation)));
  return off <= limit * 0.6 ? currentRotation : bearingToTarget;
}
