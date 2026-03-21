import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';

// --- Terrain Orientation ---

export interface TerrainOrientation {
  pitch: number;
  roll: number;
  adjustedY: number;
}

export function computeTerrainOrientation(
  position: THREE.Vector3,
  rotation: number,
  trackWidth = 3.2
): TerrainOrientation {
  const tankLength = 5.0;

  const forward = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, rotation, 0));
  const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, rotation, 0));

  const frontPos = position.clone().add(forward.clone().multiplyScalar(tankLength / 2));
  const backPos = position.clone().sub(forward.clone().multiplyScalar(tankLength / 2));
  const rightPos = position.clone().add(right.clone().multiplyScalar(trackWidth / 2));
  const leftPos = position.clone().sub(right.clone().multiplyScalar(trackWidth / 2));

  const frontHeight = getTerrainHeight(frontPos.x, frontPos.z);
  const backHeight = getTerrainHeight(backPos.x, backPos.z);
  const rightHeight = getTerrainHeight(rightPos.x, rightPos.z);
  const leftHeight = getTerrainHeight(leftPos.x, leftPos.z);

  const slope = (frontHeight - backHeight) / tankLength;
  const rollSlope = (rightHeight - leftHeight) / trackWidth;

  const pitch = -Math.atan(slope);
  const roll = Math.atan(rollSlope);

  const avgHeight = (frontHeight + backHeight + rightHeight + leftHeight) / 4;
  const currentHeight = getTerrainHeight(position.x, position.z);
  const adjustedY = Math.max(currentHeight, avgHeight);

  return { pitch, roll, adjustedY };
}

// --- Body Rock (suspension bounce / track vibration) ---

export interface BodyRockResult {
  pitchOffset: number;
  rollOffset: number;
  yOffset: number;
}

export function computeBodyRock(
  speed: number,
  maxSpeed: number,
  rotationSpeed: number,
  time: number
): BodyRockResult {
  const rock = GAME_CONFIG.tank.bodyRock;
  const speedRatio = Math.abs(speed) / maxSpeed;

  if (speedRatio < 0.01) {
    return { pitchOffset: 0, rollOffset: 0, yOffset: 0 };
  }

  const pf = rock.pitchFrequency;
  const rf = rock.rollFrequency;
  const yf = rock.yBounceFrequency;
  const TAU = Math.PI * 2;

  // Multi-frequency oscillation for organic, non-repeating feel
  const pitchOffset = rock.pitchAmplitude * speedRatio * (
    0.6 * Math.sin(time * pf * TAU) +
    0.3 * Math.sin(time * pf * TAU * 1.73) +
    0.1 * Math.sin(time * pf * TAU * 2.41)
  );

  const rollOffset = rock.rollAmplitude * speedRatio * (
    0.7 * Math.sin(time * rf * TAU) +
    0.3 * Math.sin(time * rf * TAU * 2.13)
  ) + rotationSpeed * rock.turnRollGain; // centrifugal lean

  const yOffset = rock.yBounceAmplitude * speedRatio * (
    0.5 * Math.abs(Math.sin(time * yf * TAU)) +
    0.3 * Math.abs(Math.sin(time * yf * TAU * 1.67)) +
    0.2 * Math.abs(Math.sin(time * yf * TAU * 2.31))
  );

  return { pitchOffset, rollOffset, yOffset };
}

// --- Track Movement ---

export interface TrackMovementResult {
  forwardSpeed: number;
  rotationSpeed: number;
  position: THREE.Vector3;
  rotation: number;
}

export function computeTrackMovement(
  leftSpeed: number,
  rightSpeed: number,
  currentPosition: THREE.Vector3,
  currentRotation: number,
  delta: number,
  trackWidth = 3.2
): TrackMovementResult {

  const forwardSpeed = (leftSpeed + rightSpeed) / 2;
  const rotationSpeed = (rightSpeed - leftSpeed) / trackWidth;

  const rotation = currentRotation + rotationSpeed * delta;
  const position = currentPosition.clone();

  const moveDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  position.add(moveDir.clone().multiplyScalar(forwardSpeed * delta));

  return { forwardSpeed, rotationSpeed, position, rotation };
}

// --- Ballistic Angle ---

export function computeBallisticAngle(
  distance: number,
  velocity: number
): number {
  if (distance <= 0) return 0;
  const g = GAME_CONFIG.physics.gravity;
  const sin2Theta = (distance * g) / (velocity * velocity);
  if (sin2Theta <= 1) {
    return 0.5 * Math.asin(sin2Theta);
  }
  return Math.PI / 4; // Max range
}

// --- Gun Sway ---

export interface SwayState {
  turretCurrent: number;
  turretVelocity: number;
  gunCurrent: number;
  gunVelocity: number;
}

export interface SwayInputs {
  forwardSpeed: number;
  rotationSpeed: number;
  maxSpeed: number;
  pitch: number;
  roll: number;
  prevPitch: number;
  prevRoll: number;
  prevForwardSpeed: number;
  prevRotationSpeed: number;
  time: number;
  delta: number;
}

export interface SwayResult {
  turretSwayOffset: number;
  gunSwayOffset: number;
}

export function updateGunSway(
  state: SwayState,
  inputs: SwayInputs
): SwayResult {
  const sway = GAME_CONFIG.tank.gunSway;
  const { forwardSpeed, rotationSpeed, maxSpeed, pitch, roll, time, delta } = inputs;
  const swaySpeedRatio = Math.abs(forwardSpeed) / maxSpeed;
  const [f1, f2, f3] = sway.baseFrequencies;
  const safeDelta = Math.max(delta, 0.001);

  // Layer A: base harmonics (road/track vibration)
  const turretA = sway.baseAmplitude * swaySpeedRatio * (
    0.6 * Math.sin(time * f1 * 2 * Math.PI) +
    0.4 * Math.sin(time * f2 * 2 * Math.PI * 1.17)
  );
  const gunA = sway.baseAmplitude * swaySpeedRatio * (
    0.6 * Math.cos(time * f1 * 2 * Math.PI * 0.9) +
    0.4 * Math.cos(time * f3 * 2 * Math.PI * 1.31)
  );

  // Layer B: terrain bump impulse (rate of change of pitch/roll)
  const pitchRate = (pitch - inputs.prevPitch) / safeDelta;
  const rollRate = (roll - inputs.prevRoll) / safeDelta;
  const terrainGunImpulse = pitchRate * sway.terrainPitchGain;
  const terrainTurretImpulse = rollRate * sway.terrainRollGain;

  // Layer C: inertial effects (acceleration/deceleration)
  const longAccel = (forwardSpeed - inputs.prevForwardSpeed) / safeDelta;
  const yawAccel = (rotationSpeed - inputs.prevRotationSpeed) / safeDelta;
  const gunInertia = -longAccel * sway.inertiaLongitudinal;
  const turretInertia = -yawAccel * sway.inertiaLateral;

  // Layer D: centrifugal turn sway
  const turretCentrifugal = rotationSpeed * Math.abs(forwardSpeed) * sway.centrifugalGain;

  // Combine targets
  const turretTarget = turretA + turretInertia + turretCentrifugal;
  const gunTarget = gunA + gunInertia;

  // Spring-damper integration
  state.turretVelocity += (turretTarget - state.turretCurrent) * sway.springK * delta;
  state.turretVelocity += terrainTurretImpulse * delta;
  state.turretVelocity *= Math.max(0, 1 - sway.damping * delta);
  state.turretCurrent += state.turretVelocity * delta;
  state.turretCurrent = THREE.MathUtils.clamp(state.turretCurrent, -sway.maxSway, sway.maxSway);

  state.gunVelocity += (gunTarget - state.gunCurrent) * sway.springK * delta;
  state.gunVelocity += terrainGunImpulse * delta;
  state.gunVelocity *= Math.max(0, 1 - sway.damping * delta);
  state.gunCurrent += state.gunVelocity * delta;
  state.gunCurrent = THREE.MathUtils.clamp(state.gunCurrent, -sway.maxSway, sway.maxSway);

  return {
    turretSwayOffset: state.turretCurrent,
    gunSwayOffset: state.gunCurrent,
  };
}

// --- Engine State ---

export interface EngineState {
  rpm: number;
  gear: number;
}

export function computeEngineState(
  forwardSpeed: number,
  maxSpeed: number,
  currentRPM: number,
  hasInput: boolean,
  delta: number
): EngineState {
  const idleRPM = GAME_CONFIG.tank.idleRPM;
  const maxRPM = GAME_CONFIG.tank.maxRPM;
  const absSpeed = Math.abs(forwardSpeed);
  const speedRatio = absSpeed / maxSpeed;

  let targetRPM = idleRPM;
  if (hasInput) {
    targetRPM = idleRPM + (maxRPM - idleRPM) * Math.max(0.3, speedRatio);
    if (absSpeed < 2) targetRPM += 800;
  }
  targetRPM = Math.min(maxRPM, targetRPM);

  const rpm = currentRPM + (targetRPM - currentRPM) * 5 * delta;

  let gear = 0;
  if (forwardSpeed > 0.5) gear = Math.max(1, Math.ceil((forwardSpeed / maxSpeed) * 5));
  else if (forwardSpeed < -0.5) gear = -1;

  return { rpm, gear };
}
