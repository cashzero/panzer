import * as THREE from 'three';
import { useGameStore, AmmoType } from './store';
import { getTankDef } from './tanks/registry';
import { playFireSound } from './audio';

export function fireTank(): void {
  const now = Date.now();
  const lastFireTime = useGameStore.getState().lastFireTime;
  const state = useGameStore.getState().playerTank;
  const playerDef = getTankDef(state.tankType);
  if (now - lastFireTime < playerDef.reloadTime) return;

  const setLastFireTime = useGameStore.getState().setLastFireTime;
  setLastFireTime(now);

  if (state.destroyed) return;

  const updatePlayer = useGameStore.getState().updatePlayer;
  updatePlayer({ lastFireTime: now });

  const ammoType = useGameStore.getState().ammoType;
  const fireProjectile = useGameStore.getState().fireProjectile;

  // Calculate gun tip position and direction with pitch and roll
  const tankEuler = new THREE.Euler(state.pitch || 0, state.rotation, state.roll || 0, 'YXZ');
  const tankQuat = new THREE.Quaternion().setFromEuler(tankEuler);

  const turretEuler = new THREE.Euler(0, state.turretRotation + (state.turretSwayOffset || 0), 0, 'YXZ');
  const turretQuat = new THREE.Quaternion().setFromEuler(turretEuler);

  const gunEuler = new THREE.Euler(state.gunElevation + (state.gunSwayOffset || 0), 0, 0, 'YXZ');
  const gunQuat = new THREE.Quaternion().setFromEuler(gunEuler);

  const worldTurretQuat = tankQuat.clone().multiply(turretQuat);
  const worldGunQuat = worldTurretQuat.clone().multiply(gunQuat);

  const turretPosWorld = state.position.clone().add(new THREE.Vector3(...playerDef.turretOffset).applyQuaternion(tankQuat));
  const gunPivotWorld = turretPosWorld.clone().add(new THREE.Vector3(...playerDef.gunPivotOffset).applyQuaternion(worldTurretQuat));

  const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldGunQuat);
  const pos = gunPivotWorld.clone().add(dir.clone().multiplyScalar(playerDef.muzzleDistance));

  const ammoStats = playerDef.weapons[ammoType];
  if (!ammoStats) return;
  const velocity = dir.clone().multiplyScalar(ammoStats.velocity);

  fireProjectile(pos, velocity, ammoType, ammoStats.penetration, ammoStats.damage, 'player');
  playFireSound();
}
