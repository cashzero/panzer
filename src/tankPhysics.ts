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
  trackWidth = 3.2,
  turnRateLimit = 99,
  prevRotationSpeed = 0,
  rotationalInertia = 99
): TrackMovementResult {

  const forwardSpeed = (leftSpeed + rightSpeed) / 2;
  let targetRotationSpeed = (rightSpeed - leftSpeed) / trackWidth;

  // Clamp to physical turn rate limit
  targetRotationSpeed = Math.max(-turnRateLimit, Math.min(turnRateLimit, targetRotationSpeed));

  // Rotational inertia: smoothly ramp toward target
  const maxRotChange = rotationalInertia * delta;
  let rotationSpeed = prevRotationSpeed;
  if (targetRotationSpeed > rotationSpeed) {
    rotationSpeed = Math.min(rotationSpeed + maxRotChange, targetRotationSpeed);
  } else {
    rotationSpeed = Math.max(rotationSpeed - maxRotChange, targetRotationSpeed);
  }

  const rotation = currentRotation + rotationSpeed * delta;
  const position = currentPosition.clone();

  const moveDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  position.add(moveDir.clone().multiplyScalar(forwardSpeed * delta));

  return { forwardSpeed, rotationSpeed, position, rotation };
}

// --- Gravity Drop (used by AI aiming) ---

export function computeGravityDrop(distance: number, velocity: number): number {
  if (distance <= 0 || velocity <= 0) return 0;
  const t = distance / velocity;
  return 0.5 * GAME_CONFIG.physics.gravity * t * t;
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

// --- Track Target Speeds (input → desired track speeds) ---

export interface TrackTargets {
  left: number;
  right: number;
}

export function computeTrackTargets(params: {
  throttle: number;
  steering: number;
  maxSpeed: number;
  maxReverseSpeed: number;
  currentLeftTrackSpeed: number;
  currentRightTrackSpeed: number;
  trackDestroyed: { left: boolean; right: boolean };
}): TrackTargets {
  const { throttle, steering, maxSpeed, maxReverseSpeed, currentLeftTrackSpeed, currentRightTrackSpeed, trackDestroyed } = params;

  let left = 0;
  let right = 0;

  if (throttle !== 0) {
    const topSpeed = throttle > 0 ? maxSpeed : maxReverseSpeed;
    const baseSpeed = (throttle > 0 ? 1 : -1) * topSpeed;
    const currentSpeed = (currentLeftTrackSpeed + currentRightTrackSpeed) / 2;
    const speedRatio = Math.min(1, Math.abs(currentSpeed) / Math.max(topSpeed, 0.01));

    left = baseSpeed;
    right = baseSpeed;

    if (steering !== 0) {
      // Low-speed forward motion is the strongest steering regime.
      const movingSpeedScale = THREE.MathUtils.lerp(0.84, 0.96, speedRatio);
      const innerTrackFactor = THREE.MathUtils.lerp(0.18, 0.58, speedRatio);

      left *= movingSpeedScale;
      right *= movingSpeedScale;

      if (steering > 0) {
        left *= innerTrackFactor;
      } else {
        right *= innerTrackFactor;
      }
    }
  } else if (steering !== 0) {
    const pivotSpeed = maxSpeed * 0.055;
    left = -steering * pivotSpeed;
    right = steering * pivotSpeed;
  }

  if (trackDestroyed.left) left = 0;
  if (trackDestroyed.right) right = 0;

  return { left, right };
}

// --- Track Speed Acceleration ---

export function accelerateTrackSpeeds(params: {
  currentLeft: number;
  currentRight: number;
  targetLeft: number;
  targetRight: number;
  acceleration: number;
  deceleration: number;
  delta: number;
}): TrackTargets {
  const { currentLeft, currentRight, targetLeft, targetRight, acceleration, deceleration, delta } = params;

  let left = currentLeft;
  let right = currentRight;

  const getResponseRate = (current: number, target: number) => {
    if (target === current) return 0;
    if (target === 0) return deceleration;

    const sameDirection = Math.sign(current) === Math.sign(target) || current === 0;
    const targetMagnitude = Math.abs(target);
    const currentMagnitude = Math.abs(current);

    if (!sameDirection || targetMagnitude < currentMagnitude) {
      return deceleration;
    }

    return acceleration;
  };

  const accelLeft = getResponseRate(currentLeft, targetLeft);
  const accelRight = getResponseRate(currentRight, targetRight);

  if (left < targetLeft) left = Math.min(left + accelLeft * delta, targetLeft);
  else if (left > targetLeft) left = Math.max(left - accelLeft * delta, targetLeft);

  if (right < targetRight) right = Math.min(right + accelRight * delta, targetRight);
  else if (right > targetRight) right = Math.max(right - accelRight * delta, targetRight);

  return { left, right };
}

// --- Drive Model (input → track speeds with healthy running gear) ---

export interface DriveParams {
  throttle: number;
  steering: number;
  maxSpeed: number;
  maxReverseSpeed: number;
  acceleration: number;
  deceleration: number;
  trackWidth: number;
  turnRateLimit: number;
  rotationalInertia: number;
  currentLeft: number;
  currentRight: number;
  delta: number;
}

function approach(current: number, target: number, maxStep: number) {
  if (current < target) return Math.min(current + maxStep, target);
  return Math.max(current - maxStep, target);
}

/**
 * Drives the hull through its forward speed and yaw rate rather than through
 * each track independently. Forward speed follows the engine's acceleration and
 * braking; yaw rate builds and settles at the hull's rotational inertia and never
 * exceeds the turn-rate limit. The tracks are then derived from both, so turning
 * responds promptly on key press and release instead of waiting for a braked
 * inner track to spool back up.
 */
export function computeDriveTrackSpeeds(params: DriveParams): TrackTargets {
  const { throttle, steering, maxSpeed, maxReverseSpeed, acceleration, deceleration, turnRateLimit, rotationalInertia, delta } = params;
  const drive = GAME_CONFIG.tank.drive;
  const trackWidth = Math.max(params.trackWidth, 0.01);
  const currentForward = (params.currentLeft + params.currentRight) / 2;
  const currentYaw = (params.currentRight - params.currentLeft) / trackWidth;

  let targetForward = 0;
  let targetYaw = 0;

  if (throttle !== 0) {
    const direction = throttle > 0 ? 1 : -1;
    const topSpeed = direction > 0 ? maxSpeed : maxReverseSpeed;
    const speedRatio = THREE.MathUtils.clamp(Math.abs(currentForward) / Math.max(topSpeed, 0.01), 0, 1);
    targetForward = direction * topSpeed;

    if (steering !== 0) {
      targetForward *= THREE.MathUtils.lerp(drive.steerSpeedScale[0], drive.steerSpeedScale[1], speedRatio);
      // Reversing swings the nose the same way a car does.
      targetYaw = steering * direction * turnRateLimit * THREE.MathUtils.lerp(1, drive.highSpeedYawScale, speedRatio);
    }
  } else if (steering !== 0) {
    targetYaw = steering * turnRateLimit * drive.pivotYawScale;
  }

  const speedingUp = targetForward !== 0
    && (currentForward === 0 || Math.sign(currentForward) === Math.sign(targetForward))
    && Math.abs(targetForward) > Math.abs(currentForward);
  const forward = approach(currentForward, targetForward, (speedingUp ? acceleration : deceleration) * delta);
  const yaw = approach(currentYaw, targetYaw, rotationalInertia * delta);

  const halfDifferential = yaw * trackWidth / 2;
  return { left: forward - halfDifferential, right: forward + halfDifferential };
}

/**
 * Scales a pair of track speeds down so their differential stays within the hull's
 * turn-rate limit while keeping the ratio between them (a stopped track stays stopped).
 */
export function limitTrackYawRate(tracks: TrackTargets, trackWidth: number, turnRateLimit: number): TrackTargets {
  const yaw = (tracks.right - tracks.left) / Math.max(trackWidth, 0.01);
  if (Math.abs(yaw) <= turnRateLimit || yaw === 0) return tracks;
  const scale = turnRateLimit / Math.abs(yaw);
  return { left: tracks.left * scale, right: tracks.right * scale };
}
