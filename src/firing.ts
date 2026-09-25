import * as THREE from 'three';
import { useGameStore, type AmmoType, type TankData } from './store';
import { getTankDef } from './tanks/registry';
import type { TankDefinition } from './tanks/types';
import { audioManager, toAudioVec3 } from './audio';
import { weaponClassOf } from './battleStats';

export function randGauss() {
  return (Math.random() - 0.5) + (Math.random() - 0.5);
}

/** Apply random yaw/pitch dispersion to a direction vector (mutates and returns dir). */
export function applyDispersion(dir: THREE.Vector3, dispersion: number): THREE.Vector3 {
  if (dispersion > 0) {
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), randGauss() * dispersion);
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), randGauss() * dispersion);
    dir.applyQuaternion(yawQ).applyQuaternion(pitchQ);
  }
  return dir;
}

export interface MuzzleOverrides {
  turretSwayOffset?: number;
  gunSwayOffset?: number;
}

export function computeMuzzleAndDirection(
  tank: TankData,
  def: TankDefinition,
  overrides?: MuzzleOverrides,
): { pos: THREE.Vector3; dir: THREE.Vector3 } {
  const turretSway = overrides?.turretSwayOffset ?? (tank.turretSwayOffset || 0);
  const gunSway = overrides?.gunSwayOffset ?? (tank.gunSwayOffset || 0);

  const tankEuler = new THREE.Euler(tank.pitch || 0, tank.rotation, tank.roll || 0, 'YXZ');
  const tankQuat = new THREE.Quaternion().setFromEuler(tankEuler);

  const turretEuler = new THREE.Euler(0, tank.turretRotation + turretSway, 0, 'YXZ');
  const turretQuat = new THREE.Quaternion().setFromEuler(turretEuler);

  const gunEuler = new THREE.Euler(tank.gunElevation + gunSway, 0, 0, 'YXZ');
  const gunQuat = new THREE.Quaternion().setFromEuler(gunEuler);

  const worldTurretQuat = tankQuat.clone().multiply(turretQuat);
  const worldGunQuat = worldTurretQuat.clone().multiply(gunQuat);

  const turretPosWorld = tank.position.clone().add(new THREE.Vector3(...def.turretOffset).applyQuaternion(tankQuat));
  const gunPivotWorld = turretPosWorld.clone().add(new THREE.Vector3(...def.gunPivotOffset).applyQuaternion(worldTurretQuat));

  const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldGunQuat);
  const pos = gunPivotWorld.clone().add(dir.clone().multiplyScalar(def.muzzleDistance));

  return { pos, dir };
}

function fireOneRound(tank: TankData, def: TankDefinition, ammoType: AmmoType): void {
  const ammoStats = def.weapons[ammoType];
  if (!ammoStats) return;

  const { pos, dir } = computeMuzzleAndDirection(tank, def);
  applyDispersion(dir, ammoStats.dispersion);

  const velocity = dir.clone().multiplyScalar(ammoStats.velocity);

  useGameStore.getState().fireProjectile(pos, velocity, ammoType, ammoStats, ammoStats.damage, 'player', def.caliber, weaponClassOf(def));
  const caliberScale = (def.caliber || 75) / 75;
  const rapidFire = !!def.burstCount || !!def.automaticMagazineSize;
  useGameStore.getState().triggerCameraShake((rapidFire ? 0.3 : 0.8) * caliberScale);
  audioManager.playShot({
    source: 'player',
    position: toAudioVec3(pos),
    caliber: def.caliber || 75,
    burst: rapidFire,
  });

}

export function fireTank(): void {
  const now = Date.now();
  const store = useGameStore.getState();
  const lastFireTime = store.lastFireTime;
  const state = store.playerTank;
  const playerDef = getTankDef(state.tankType);

  // Don't fire if still reloading or mid-burst
  if (now - lastFireTime < playerDef.reloadTime) return;
  if (store.playerBurstRemaining > 0) return;

  if (state.destroyed) return;

  const ammoType = store.ammoType;

  if (playerDef.automaticMagazineSize && playerDef.automaticFireInterval) {
    let roundsAvailable = store.playerMagazineRounds;

    if (roundsAvailable <= 0) {
      if (now - lastFireTime < playerDef.reloadTime) return;
      roundsAvailable = playerDef.automaticMagazineSize;
    }

    if (now < store.playerNextFireTime) return;

    fireOneRound(state, playerDef, ammoType);

    const roundsRemaining = roundsAvailable - 1;
    if (roundsRemaining > 0) {
      store.setPlayerAutomaticState(roundsRemaining, now + playerDef.automaticFireInterval);
    } else {
      store.setPlayerAutomaticState(0, 0);
      store.setLastFireTime(now);
      store.updatePlayer({ lastFireTime: now });
    }
    return;
  }

  if (playerDef.burstCount && playerDef.burstCount > 1 && playerDef.burstInterval) {
    // Burst fire: fire first round, schedule remaining
    fireOneRound(state, playerDef, ammoType);
    store.setPlayerBurst(playerDef.burstCount - 1, now + playerDef.burstInterval);
    // Don't set lastFireTime yet — set it when burst completes
  } else {
    // Single shot (existing behavior)
    store.setLastFireTime(now);
    store.updatePlayer({ lastFireTime: now });
    fireOneRound(state, playerDef, ammoType);
  }
}

export function updatePlayerBurst(): void {
  const now = Date.now();
  const store = useGameStore.getState();
  if (store.playerBurstRemaining <= 0) return;
  if (now < store.playerBurstNextFireTime) return;

  const state = store.playerTank;
  if (state.destroyed) {
    store.setPlayerBurst(0, 0);
    return;
  }

  const playerDef = getTankDef(state.tankType);
  const ammoType = store.ammoType;

  fireOneRound(state, playerDef, ammoType);

  const remaining = store.playerBurstRemaining - 1;
  if (remaining > 0) {
    store.setPlayerBurst(remaining, now + (playerDef.burstInterval || 125));
  } else {
    // Burst complete — start reload cooldown
    store.setPlayerBurst(0, 0);
    store.setLastFireTime(now);
    store.updatePlayer({ lastFireTime: now });
  }
}
