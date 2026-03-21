import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { computeBallisticAngle } from './tankPhysics';

export interface TurretAimingInput {
  currentTurretRot: number;
  currentGunElev: number;
  cameraYaw: number;
  cameraPitch: number;
  isAiming: boolean;
  arrowKeys: { left: boolean; right: boolean; up: boolean; down: boolean };
  calibrationDistance: number;
  ammoVelocity: number;
  delta: number;
}

export interface TurretAimingResult {
  turretRotation: number;
  gunElevation: number;
  sightPitch: number;
}

export function computeTurretAiming(input: TurretAimingInput): TurretAimingResult {
  const turretSpeed = GAME_CONFIG.tank.turretSpeed * input.delta;
  const gunSpeed = GAME_CONFIG.tank.gunSpeed * input.delta;

  const angleOffset = computeBallisticAngle(input.calibrationDistance, input.ammoVelocity);

  // Current sight pitch is derived from actual gun elevation
  let currentSightPitch = -input.currentGunElev - angleOffset;
  let newTurretRot = input.currentTurretRot;

  if (input.isAiming) {
    // Align sight (and thus turret) to viewpoint (camera)
    let yawDiff = input.cameraYaw - input.currentTurretRot;
    yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));

    if (Math.abs(yawDiff) > 0.01) {
      newTurretRot += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), turretSpeed);
    }

    let pitchDiff = input.cameraPitch - currentSightPitch;
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
