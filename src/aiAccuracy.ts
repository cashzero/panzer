import { GAME_CONFIG } from './config';
import * as THREE from 'three';
import { computeMuzzleAndDirection, randGauss } from './firing';
import { computeGravityDrop } from './tankPhysics';
import type { TankData } from './store';
import type { TankDefinition } from './tanks/types';

export interface AiAccuracyState {
  targetId: string;
  shotsOnTarget: number;
}

export interface AiAimOffset {
  targetId: string;
  azimuth: number;
  elevation: number;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function getAiAccuracyProgress(shotsOnTarget: number): number {
  return Math.min(shotsOnTarget / GAME_CONFIG.ai.shotsToMaxAccuracy, 1);
}

export function getAiAimDispersion(shotsOnTarget: number): number {
  return lerp(
    GAME_CONFIG.ai.initialAimDispersion,
    GAME_CONFIG.ai.minAimDispersion,
    getAiAccuracyProgress(shotsOnTarget)
  );
}

export function getAiFireDispersion(shotsOnTarget: number): number {
  return lerp(
    GAME_CONFIG.ai.initialFireDispersion,
    GAME_CONFIG.ai.minFireDispersion,
    getAiAccuracyProgress(shotsOnTarget)
  );
}

function createAimOffset(targetId: string, dispersion: number): AiAimOffset {
  return {
    targetId,
    azimuth: randGauss() * dispersion,
    elevation: randGauss() * dispersion,
  };
}

export function ensureAiAccuracyState(
  accuracyByActor: Record<string, AiAccuracyState>,
  aimOffsetsByActor: Record<string, AiAimOffset>,
  actorId: string,
  targetId: string,
): AiAccuracyState {
  let state = accuracyByActor[actorId];
  if (!state || state.targetId !== targetId) {
    state = { targetId, shotsOnTarget: 0 };
    accuracyByActor[actorId] = state;
    aimOffsetsByActor[actorId] = createAimOffset(targetId, getAiAimDispersion(0));
    return state;
  }

  const aimOffset = aimOffsetsByActor[actorId];
  if (!aimOffset || aimOffset.targetId !== targetId) {
    aimOffsetsByActor[actorId] = createAimOffset(targetId, getAiAimDispersion(state.shotsOnTarget));
  }

  return state;
}

export function registerAiShot(
  accuracyByActor: Record<string, AiAccuracyState>,
  aimOffsetsByActor: Record<string, AiAimOffset>,
  actorId: string,
  targetId: string,
): AiAccuracyState {
  const state = ensureAiAccuracyState(accuracyByActor, aimOffsetsByActor, actorId, targetId);
  const nextShotsOnTarget = Math.min(state.shotsOnTarget + 1, GAME_CONFIG.ai.shotsToMaxAccuracy);
  const nextState = { targetId, shotsOnTarget: nextShotsOnTarget };

  accuracyByActor[actorId] = nextState;
  aimOffsetsByActor[actorId] = createAimOffset(targetId, getAiAimDispersion(nextShotsOnTarget));

  return nextState;
}

const _hullQuat = new THREE.Quaternion();
const _hullEuler = new THREE.Euler();
const _dir = new THREE.Vector3();

export interface GunLay {
  /** Turret traverse relative to the hull. */
  turret: number;
  /** Gun elevation relative to the turret ring (negative raises the gun). */
  elevation: number;
  distance: number;
}

/**
 * Turret traverse and gun elevation that lay the gun on a point, allowing for
 * shell drop, for a target's motion over the time of flight and for the
 * hull's pitch and roll. The gun's line is the hull's attitude times the
 * turret and gun angles, so a solution worked out as if the hull were level
 * throws the shot off by the slope it stands on: some 20 m at 600 m from a
 * 2 degree bank. `azimuthOffset` / `elevationOffset` are the crew's laying
 * error (radians, positive elevation offset lowers the gun).
 */
export function layGun(
  tank: TankData,
  def: TankDefinition,
  aimPoint: THREE.Vector3,
  targetVelocity: THREE.Vector3 | null,
  azimuthOffset = 0,
  elevationOffset = 0,
): GunLay {
  const { pos: muzzle } = computeMuzzleAndDirection(tank, def, { turretSwayOffset: 0, gunSwayOffset: 0 });
  const velocity = def.weapons.AP.velocity;
  let dx = aimPoint.x - muzzle.x, dy = aimPoint.y + 1.5 - muzzle.y, dz = aimPoint.z - muzzle.z;
  if (targetVelocity) {
    // Lead: where the target will be when the shell gets there.
    const flight = Math.hypot(dx, dz) / velocity;
    dx += targetVelocity.x * flight;
    dz += targetVelocity.z * flight;
  }
  const horizontal = Math.hypot(dx, dz);
  const drop = computeGravityDrop(horizontal, velocity);
  const yaw = Math.atan2(dx, dz) + azimuthOffset;
  const up = Math.atan2(dy + drop, horizontal) - elevationOffset;
  _dir.set(Math.sin(yaw) * Math.cos(up), Math.sin(up), Math.cos(yaw) * Math.cos(up));
  _hullQuat.setFromEuler(_hullEuler.set(tank.pitch || 0, tank.rotation, tank.roll || 0, 'YXZ')).invert();
  _dir.applyQuaternion(_hullQuat);
  return {
    turret: Math.atan2(_dir.x, _dir.z),
    elevation: -Math.atan2(_dir.y, Math.hypot(_dir.x, _dir.z)),
    distance: Math.hypot(horizontal, dy),
  };
}

/** Ground velocity of a tank from its heading and speed. */
export function tankVelocity(tank: TankData, out = new THREE.Vector3()) {
  return out.set(Math.sin(tank.rotation) * tank.speed, 0, Math.cos(tank.rotation) * tank.speed);
}
