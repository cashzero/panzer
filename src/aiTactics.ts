import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { casemateHullHeading } from './traverseLimit';
import { getTerrainMeshHeight, raycastTerrain } from './Terrain';
import { FOREST, forestDepthAt, forestLengthAlong, getActiveForest } from './forest';
import { isPointNearAnyBuilding, type BuildingInstance } from './buildings';
import { forEachTreeNear } from './treeIndex';
import type { TreeInstance } from './trees';
import type { TankData } from './store';
import type { Matchup } from './aiMatchup';

/**
 * Where AI tanks stop and fight, and how they steer their tracks. The
 * movement and gunnery loops in EnemyAI / AllyAI ask these questions;
 * nothing here moves a tank.
 */

const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Clear sight between two points over the rendered ground and through the woods. */
function sightClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  _from.set(ax, ay, az);
  _dir.set(bx - ax, by - ay, bz - az);
  const length = _dir.length();
  if (length < 1) return true;
  _dir.divideScalar(length);
  const hit = raycastTerrain(_from, _dir, length - 1, getTerrainMeshHeight);
  if (hit) return false;
  const forest = getActiveForest();
  return !forest || forestLengthAlong(forest, ax, ay, az, bx, by, bz, getTerrainMeshHeight, FOREST.sightDepth) < FOREST.sightDepth;
}

/** Concealment around a spot: the edge of a wood, trees, farm buildings. 0..1. */
function concealmentAt(x: number, z: number, trees: TreeInstance[], buildings: BuildingInstance[]) {
  let score = 0;
  const forest = getActiveForest();
  if (forest) {
    const depth = forestDepthAt(forest, x, z);
    if (depth > -18 && depth < -4) score += 0.5;
  }
  let near = 0;
  forEachTreeNear(trees, GAME_CONFIG.trees.collisionRadius, x, z, 12, (index) => {
    const tree = trees[index];
    if (tree.fallen || tree.interior) return;
    if (Math.hypot(tree.position[0] - x, tree.position[2] - z) < 12) near++;
  });
  score += Math.min(near, 4) * 0.1;
  if (isPointNearAnyBuilding(x, z, buildings, 12)) score += 0.25;
  return Math.min(1, score);
}

function standable(x: number, z: number, halfMap: number, buildings: BuildingInstance[]) {
  if (Math.abs(x) > halfMap - 30 || Math.abs(z) > halfMap - 30) return false;
  const forest = getActiveForest();
  if (forest && forestDepthAt(forest, x, z) > -(GAME_CONFIG.tank.collisionRadius + 3)) return false;
  if (isPointNearAnyBuilding(x, z, buildings, GAME_CONFIG.tank.collisionRadius + 2)) return false;
  // Not on a bank steep enough to throw the gun off.
  const slope = Math.abs(getTerrainMeshHeight(x + 4, z) - getTerrainMeshHeight(x - 4, z))
    + Math.abs(getTerrainMeshHeight(x, z + 4) - getTerrainMeshHeight(x, z - 4));
  return slope < 3;
}

export type PositionIntent = 'engage' | 'withdraw';

export interface PositionQuery {
  self: TankData;
  target: TankData;
  matchup: Matchup;
  intent: PositionIntent;
  trees: TreeInstance[];
  buildings: BuildingInstance[];
  halfMap: number;
  /** Discourage staying put, e.g. after being hit where we stand. */
  leaveCurrent?: boolean;
}

/**
 * Picks a spot to fight from (or, withdrawing, to hide in) by scoring a small
 * set of candidates: a clear line from the turret to the target, the hull
 * hidden behind a rise, cover nearby, the right range, the side of the
 * target for a flanker, and not too far to drive. Costs a millisecond or two
 * of terrain rays, so callers ration it to one tank per frame.
 */
export function chooseFightingPosition(query: PositionQuery): THREE.Vector3 {
  const { self, target, matchup, intent, trees, buildings, halfMap } = query;
  const sx = self.position.x, sz = self.position.z;
  const tx = target.position.x, tz = target.position.z;
  const targetEyeY = target.position.y + 2.6;
  const targetTurretY = target.position.y + 2.1;
  const range = matchup.preferredRange;
  const candidates: Array<[number, number]> = [[sx, sz]];

  if (intent === 'withdraw') {
    const away = Math.atan2(sx - tx, sz - tz);
    for (const radius of [35, 70, 110]) {
      for (let k = -3; k <= 3; k++) {
        const bearing = away + k * (Math.PI / 5);
        candidates.push([sx + Math.sin(bearing) * radius, sz + Math.cos(bearing) * radius]);
      }
    }
  } else {
    if (matchup.role === 'flank') {
      // Round to the target's side, on whichever flank is nearer.
      const facing = target.rotation;
      for (const offset of [75, 100, 125]) {
        for (const sign of [1, -1]) {
          const bearing = facing + sign * THREE.MathUtils.degToRad(offset);
          for (const scale of [0.8, 1.05]) {
            candidates.push([tx + Math.sin(bearing) * range * scale, tz + Math.cos(bearing) * range * scale]);
          }
        }
      }
    } else {
      const bearing0 = Math.atan2(sx - tx, sz - tz);
      for (const offset of [-30, -15, 0, 15, 30]) {
        const bearing = bearing0 + THREE.MathUtils.degToRad(offset);
        for (const scale of [0.85, 1, 1.15]) {
          candidates.push([tx + Math.sin(bearing) * range * scale, tz + Math.cos(bearing) * range * scale]);
        }
      }
    }
    // Small shifts from where we are: often a few metres find a crest.
    for (const radius of [25, 50]) {
      for (let k = 0; k < 8; k++) {
        const bearing = (k / 8) * Math.PI * 2;
        candidates.push([sx + Math.sin(bearing) * radius, sz + Math.cos(bearing) * radius]);
      }
    }
  }

  let best: [number, number] = [sx, sz];
  let bestScore = -Infinity;
  for (let index = 0; index < candidates.length; index++) {
    const [x, z] = candidates[index];
    const isCurrent = index === 0;
    if (!isCurrent && !standable(x, z, halfMap, buildings)) continue;
    const ground = getTerrainMeshHeight(x, z);
    const distance = Math.hypot(x - tx, z - tz);
    const travel = Math.hypot(x - sx, z - sz);
    const turretSeen = sightClear(x, ground + 2.4, z, tx, targetTurretY, tz);
    const concealment = concealmentAt(x, z, trees, buildings);
    let score: number;

    if (intent === 'withdraw') {
      const hullSeen = turretSeen || sightClear(tx, targetEyeY, tz, x, ground + 1.2, z);
      score = (turretSeen ? -3 : 2) + (hullSeen ? -1 : 0) + concealment
        - travel / 150 + (distance - self.position.distanceTo(target.position)) / 300;
    } else {
      const hullHidden = turretSeen && !sightClear(tx, targetEyeY, tz, x, ground + 1.0, z);
      score = (turretSeen ? 2 : -3) + (hullHidden ? 1.5 : 0) + concealment * 0.8
        - Math.abs(distance - range) / range * 1.5 - travel / 250;
      if (distance < 60) score -= 2;
      if (matchup.role === 'flank') {
        // Reward being off the target's frontal arc.
        const bearing = Math.atan2(x - tx, z - tz);
        const offAxis = Math.abs(Math.atan2(Math.sin(bearing - target.rotation), Math.cos(bearing - target.rotation)));
        score += Math.sin(Math.min(offAxis, Math.PI / 2)) * 1.5;
      }
    }
    if (isCurrent) score += query.leaveCurrent ? -1.5 : 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = [x, z];
    }
  }
  return new THREE.Vector3(best[0], getTerrainMeshHeight(best[0], best[1]), best[1]);
}

/**
 * Hull heading that angles the front plate to the enemy, the way crews set
 * a tank at "ten-thirty": whichever side of the bearing is nearer the
 * current heading, so the tank does not swing through the whole arc.
 */
export function angledHullHeading(bearingToTarget: number, currentRotation: number, traverseLimit?: number) {
  // A casemate gun bears only inside its traverse arc.
  if (traverseLimit !== undefined) return casemateHullHeading(bearingToTarget, currentRotation, traverseLimit);
  const angle = THREE.MathUtils.degToRad(GAME_CONFIG.ai.tactics.hullAngleDeg);
  const a = bearingToTarget + angle, b = bearingToTarget - angle;
  const diff = (h: number) => Math.abs(Math.atan2(Math.sin(h - currentRotation), Math.cos(h - currentRotation)));
  return diff(a) <= diff(b) ? a : b;
}

export interface TrackCommand {
  forwardSpeed: number;
  rotationSpeed: number;
  leftSpeed: number;
  rightSpeed: number;
}

/** Difference a - b wrapped to [-PI, PI]; its magnitude unless `signed`. */
export function angleBetween(a: number, b: number, signed = false) {
  const diff = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return signed ? diff : Math.abs(diff);
}

/**
 * Holds a drive heading steady against flicker between rival headings, such
 * as the two sides of an obstacle or two route legs, which would otherwise
 * swing a tank back and forth on the spot. A change of under about 55
 * degrees is taken at once; a larger one only once it has stood for
 * `settleMs`.
 */
export class HeadingFilter {
  private heading: number | null = null;
  private pending: number | null = null;
  private pendingSince = 0;

  constructor(private readonly settleMs = 700) {}

  update(next: number, now: number): number {
    if (this.heading === null || angleBetween(next, this.heading) < 0.95) {
      this.heading = next;
      this.pending = null;
    } else if (this.pending === null || angleBetween(next, this.pending) > 0.5) {
      this.pending = next;
      this.pendingSince = now;
    } else if (now - this.pendingSince >= this.settleMs) {
      this.heading = next;
      this.pending = null;
    }
    return this.heading;
  }

  reset() {
    this.heading = null;
    this.pending = null;
  }
}

/**
 * Signed turn from `rotation` to `heading`. Near a half turn either way is
 * as far, and the sign would flip with every rounding: a hull already
 * swinging keeps swinging the same way, instead of twitching on the spot.
 */
function turnToward(heading: number, rotation: number, yawRate: number) {
  const diff = angleBetween(heading, rotation, true);
  if (Math.abs(diff) > Math.PI - 0.35 && Math.abs(yawRate) > 0.01) return Math.sign(yawRate) * Math.abs(diff);
  return diff;
}

/** Turn-rate damping (s): how far ahead the hull's swing is allowed for. */
const YAW_DAMPING = 0.8;

export const HOLD: TrackCommand = { forwardSpeed: 0, rotationSpeed: 0, leftSpeed: 0, rightSpeed: 0 };

/**
 * Track speeds to drive along `heading` (radians, three.js Y). Pivots when
 * far off, otherwise drives and turns together. With `reverse`, backs along
 * the heading so the front stays toward the enemy. `yawRate` is the hull's
 * measured turn rate (rad/s); it damps the turn so the hull's rotational
 * inertia does not carry it past the heading and back.
 */
export function steerTracks(
  rotation: number,
  heading: number,
  speed: number,
  trackWidth: number,
  reverse = false,
  yawRate = 0,
): TrackCommand {
  const hullHeading = reverse ? heading + Math.PI : heading;
  const diff = turnToward(hullHeading, rotation, yawRate);
  let forwardSpeed = 0;
  let rotationSpeed: number;
  if (Math.abs(diff) > 0.6) {
    rotationSpeed = Math.sign(diff);
  } else {
    rotationSpeed = THREE.MathUtils.clamp(diff * 2 - yawRate * YAW_DAMPING, -1, 1);
    forwardSpeed = speed * (1 - Math.abs(diff) / 0.6 * 0.5) * (reverse ? -1 : 1);
  }
  return {
    forwardSpeed,
    rotationSpeed,
    leftSpeed: forwardSpeed - rotationSpeed * trackWidth / 2,
    rightSpeed: forwardSpeed + rotationSpeed * trackWidth / 2,
  };
}

/**
 * Pivot in place toward `heading`; holds once within a few degrees. The
 * turn rate falls off with the remaining angle, so the hull's rotational
 * inertia settles it instead of swinging it past and back.
 */
export function turnInPlace(rotation: number, heading: number, trackWidth: number, yawRate = 0): TrackCommand {
  const diff = turnToward(heading, rotation, yawRate);
  if (Math.abs(diff) < 0.05 && Math.abs(yawRate) < 0.1) return HOLD;
  const rotationSpeed = THREE.MathUtils.clamp(diff * 2.5 - yawRate * YAW_DAMPING, -1, 1);
  return {
    forwardSpeed: 0,
    rotationSpeed,
    leftSpeed: -rotationSpeed * trackWidth / 2,
    rightSpeed: rotationSpeed * trackWidth / 2,
  };
}

/** Extra trigger-pull spread for a gun fired on the move. */
export function movingFireDispersion(speed: number, maxSpeed: number) {
  return GAME_CONFIG.ai.tactics.movingFireDispersion * Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed));
}
