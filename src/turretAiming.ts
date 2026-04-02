import * as THREE from 'three';
import { computeBallisticAngle } from './tankPhysics';

export const MIN_GUN_ELEVATION = -Math.PI / 6;
export const MAX_GUN_ELEVATION = Math.PI / 12;

export function clampGunElevation(
  gunElevation: number,
  minGunElevation = MIN_GUN_ELEVATION,
  maxGunElevation = MAX_GUN_ELEVATION
) {
  return THREE.MathUtils.clamp(gunElevation, minGunElevation, maxGunElevation);
}

export interface TurretAimingInput {
  currentTurretRot: number;
  currentSightPitch: number;
  currentGunElev: number;
  cameraYaw: number;
  cameraPitch: number;
  hullRotation: number;
  hullPitch: number;
  hullRoll: number;
  isAiming: boolean;
  arrowKeys: { left: number; right: number; up: number; down: number };
  calibrationDistance: number;
  ammoVelocity: number;
  turretSpeed: number;
  gunSpeed: number;
  minGunElevation?: number;
  maxGunElevation?: number;
  designatedTarget?: THREE.Vector3 | null;
  aimOriginWorld?: THREE.Vector3;
  delta: number;
}

export interface TurretAimingResult {
  turretRotation: number;
  gunElevation: number;
  sightPitch: number;
}

const MANUAL_AIM_RAMP_TIME = 0.25;
const MANUAL_AIM_MIN_SPEED_SCALE = 0.18;

function getManualAimSpeed(maxSpeed: number, holdTime: number) {
  if (holdTime <= 0) return 0;
  const progress = THREE.MathUtils.clamp(holdTime / MANUAL_AIM_RAMP_TIME, 0, 1);
  const ramp = THREE.MathUtils.smoothstep(progress, 0, 1);
  return maxSpeed * THREE.MathUtils.lerp(MANUAL_AIM_MIN_SPEED_SCALE, 1, ramp);
}

export function computeTurretAiming(input: TurretAimingInput): TurretAimingResult {
  const turretSpeed = input.turretSpeed * input.delta;
  const gunSpeed = input.gunSpeed * input.delta;
  const minGunElevation = input.minGunElevation ?? MIN_GUN_ELEVATION;
  const maxGunElevation = input.maxGunElevation ?? MAX_GUN_ELEVATION;

  const angleOffset = computeBallisticAngle(input.calibrationDistance, input.ammoVelocity);
  const minSightPitch = -maxGunElevation - angleOffset;
  const maxSightPitch = -minGunElevation - angleOffset;

  // Keep the calibrated sight line persistent so changing zero does not move the view center.
  let currentSightPitch = input.currentSightPitch;
  let newTurretRot = input.currentTurretRot;

  if (input.isAiming) {
    let worldDir: THREE.Vector3;
    if (input.designatedTarget && input.aimOriginWorld) {
      worldDir = input.designatedTarget.clone().sub(input.aimOriginWorld).normalize();
    } else {
      // Align sight (and thus turret) to viewpoint (camera), accounting for hull tilt.
      // Transform world-space camera direction into the hull's local frame so that
      // the turret truly aims where the camera looks regardless of terrain slope.
      const camYawWorld = input.hullRotation + input.cameraYaw;
      worldDir = new THREE.Vector3(
        Math.sin(camYawWorld) * Math.cos(input.cameraPitch),
        Math.sin(input.cameraPitch),
        Math.cos(camYawWorld) * Math.cos(input.cameraPitch)
      ).normalize();
    }

    const hullQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(input.hullPitch, input.hullRotation, input.hullRoll, 'YXZ')
    );
    const localDir = worldDir.clone().applyQuaternion(hullQuat.clone().invert());

    const targetTurretYaw = Math.atan2(localDir.x, localDir.z);
    const horizLen = Math.sqrt(localDir.x * localDir.x + localDir.z * localDir.z);
    const targetSightPitch = Math.atan2(localDir.y, horizLen);

    let yawDiff = targetTurretYaw - input.currentTurretRot;
    yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));

    if (Math.abs(yawDiff) > 0) {
      newTurretRot += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), turretSpeed);
    }

    let pitchDiff = targetSightPitch - currentSightPitch;
    if (Math.abs(pitchDiff) > 0) {
      currentSightPitch += Math.sign(pitchDiff) * Math.min(Math.abs(pitchDiff), gunSpeed);
    }
  } else {
    // Arrow keys directly move the sight (and thus the turret), ramping from
    // fine-adjustment speed to each tank's full traverse/elevation rate.
    if (input.arrowKeys.left > 0) newTurretRot += getManualAimSpeed(turretSpeed, input.arrowKeys.left);
    if (input.arrowKeys.right > 0) newTurretRot -= getManualAimSpeed(turretSpeed, input.arrowKeys.right);
    if (input.arrowKeys.up > 0) currentSightPitch += getManualAimSpeed(gunSpeed, input.arrowKeys.up);
    if (input.arrowKeys.down > 0) currentSightPitch -= getManualAimSpeed(gunSpeed, input.arrowKeys.down);
  }

  currentSightPitch = THREE.MathUtils.clamp(currentSightPitch, minSightPitch, maxSightPitch);

  // Calculate final gun elevation from the sight pitch
  let newGunElev = -currentSightPitch - angleOffset;
  newGunElev = clampGunElevation(newGunElev, minGunElevation, maxGunElevation);

  return {
    turretRotation: newTurretRot,
    gunElevation: newGunElev,
    sightPitch: currentSightPitch,
  };
}
