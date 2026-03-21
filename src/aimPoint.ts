import * as THREE from 'three';
import { getTankDef } from './tanks/registry';

export interface AimPointInput {
  position: THREE.Vector3;
  rotation: number;
  pitch: number;
  roll: number;
  turretRotation: number;
  sightPitch: number;
  turretSwayOffset: number;
  gunSwayOffset: number;
  tankType: string;
}

export interface AimPointResult {
  gunSightAimPoint: THREE.Vector3;
  aimDir: THREE.Vector3;
  aimGunPivotWorld: THREE.Vector3;
}

export function computeAimPoint(input: AimPointInput): AimPointResult {
  const aimTankEuler = new THREE.Euler(input.pitch, input.rotation, input.roll, 'YXZ');
  const aimTankQuat = new THREE.Quaternion().setFromEuler(aimTankEuler);

  const aimTurretEuler = new THREE.Euler(0, input.turretRotation + input.turretSwayOffset, 0, 'YXZ');
  const aimTurretQuat = new THREE.Quaternion().setFromEuler(aimTurretEuler);
  const aimWorldTurretQuat = aimTankQuat.clone().multiply(aimTurretQuat);

  // Sight direction: uses sightPitch so the aim point aligns with the viewpoint when right-clicking
  const aimGunEuler = new THREE.Euler(-input.sightPitch + input.gunSwayOffset, 0, 0, 'YXZ');
  const aimGunQuat = new THREE.Quaternion().setFromEuler(aimGunEuler);
  const aimWorldGunQuat = aimWorldTurretQuat.clone().multiply(aimGunQuat);

  const playerDef = getTankDef(input.tankType);
  const aimTurretPosWorld = input.position.clone().add(new THREE.Vector3(...playerDef.turretOffset).applyQuaternion(aimTankQuat));
  const aimGunPivotWorld = aimTurretPosWorld.clone().add(new THREE.Vector3(...playerDef.gunPivotOffset).applyQuaternion(aimWorldTurretQuat));

  const aimDir = new THREE.Vector3(0, 0, 1).applyQuaternion(aimWorldGunQuat);
  const gunSightAimPoint = aimGunPivotWorld.clone().add(aimDir.clone().multiplyScalar(500));

  return { gunSightAimPoint, aimDir, aimGunPivotWorld };
}
