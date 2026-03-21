import * as THREE from 'three';
import { computeBallisticAngle } from './tankPhysics';

export interface TurretAimingInput {
  currentTurretRot: number;
  currentGunElev: number;
  cameraYaw: number;
  cameraPitch: number;
  hullRotation: number;
  hullPitch: number;
  hullRoll: number;
  isAiming: boolean;
  arrowKeys: { left: boolean; right: boolean; up: boolean; down: boolean };
  calibrationDistance: number;
  ammoVelocity: number;
  turretSpeed: number;
  gunSpeed: number;
  delta: number;
}

export interface TurretAimingResult {
  turretRotation: number;
  gunElevation: number;
  sightPitch: number;
}

export function computeTurretAiming(input: TurretAimingInput): TurretAimingResult {
  const turretSpeed = input.turretSpeed * input.delta;
  const gunSpeed = input.gunSpeed * input.delta;

  const angleOffset = computeBallisticAngle(input.calibrationDistance, input.ammoVelocity);

  // Current sight pitch is derived from actual gun elevation
  let currentSightPitch = -input.currentGunElev - angleOffset;
  let newTurretRot = input.currentTurretRot;

  if (input.isAiming) {
    // Align sight (and thus turret) to viewpoint (camera), accounting for hull tilt.
    // Transform world-space camera direction into the hull's local frame so that
    // the turret truly aims where the camera looks regardless of terrain slope.
    const camYawWorld = input.hullRotation + input.cameraYaw;
    const worldDir = new THREE.Vector3(
      Math.sin(camYawWorld) * Math.cos(input.cameraPitch),
      Math.sin(input.cameraPitch),
      Math.cos(camYawWorld) * Math.cos(input.cameraPitch)
    ).normalize();

    const hullQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(input.hullPitch, input.hullRotation, input.hullRoll, 'YXZ')
    );
    const localDir = worldDir.clone().applyQuaternion(hullQuat.clone().invert());

    const targetTurretYaw = Math.atan2(localDir.x, localDir.z);
    const horizLen = Math.sqrt(localDir.x * localDir.x + localDir.z * localDir.z);
    const targetSightPitch = Math.atan2(localDir.y, horizLen);

    let yawDiff = targetTurretYaw - input.currentTurretRot;
    yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));

    if (Math.abs(yawDiff) > 0.01) {
      newTurretRot += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), turretSpeed);
    }

    let pitchDiff = targetSightPitch - currentSightPitch;
    if (Math.abs(pitchDiff) > 0.01) {
      currentSightPitch += Math.sign(pitchDiff) * Math.min(Math.abs(pitchDiff), gunSpeed);
    }
  } else {
    // Arrow keys directly move the sight (and thus the turret)
    if (input.arrowKeys.left) newTurretRot += turretSpeed;
    if (input.arrowKeys.right) newTurretRot -= turretSpeed;
    if (input.arrowKeys.up) currentSightPitch += gunSpeed;
    if (input.arrowKeys.down) currentSightPitch -= gunSpeed;
  }

  currentSightPitch = THREE.MathUtils.clamp(currentSightPitch, -Math.PI / 4, Math.PI / 4);

  // Calculate final gun elevation from the sight pitch
  let newGunElev = -currentSightPitch - angleOffset;
  newGunElev = THREE.MathUtils.clamp(newGunElev, -Math.PI / 6, Math.PI / 12);

  return {
    turretRotation: newTurretRot,
    gunElevation: newGunElev,
    sightPitch: currentSightPitch,
  };
}
