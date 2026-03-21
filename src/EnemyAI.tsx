import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import * as THREE from 'three';
import { useRef } from 'react';
import { playFireSound } from './audio';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { resolveTankCollision, resolveTreeCollision } from './collision';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, computeBodyRock } from './tankPhysics';

// Gaussian-like random using sum of two uniform values
function randGauss() {
  return (Math.random() - 0.5) + (Math.random() - 0.5);
}

export function EnemyAI() {
  const lastFireTimes = useRef<{ [id: string]: number }>({});
  const aimOffsets = useRef<{ [id: string]: { azimuth: number; elevation: number; nextChangeTime: number } }>({});
  const steadyAim = useRef<{ [id: string]: { time: number; lastEnemyPos: THREE.Vector3; lastPlayerPos: THREE.Vector3 } }>({});

  useFrame((state, delta) => {
    const { playerTank: player, enemies, updateEnemy, fireProjectile } = useGameStore.getState();

    if (player.destroyed) return;

    const now = Date.now();

    enemies.forEach((enemy) => {
      if (enemy.destroyed) return;

      // Calculate distance to player
      const dist = enemy.position.distanceTo(player.position);
      
      // Only engage if within distance
      if (dist > GAME_CONFIG.ai.engagementDistance) return;

      // Aim at player
      const dirToPlayer = player.position.clone().sub(enemy.position).normalize();
      
      // Movement logic
      let forwardSpeed = 0;
      let rotationSpeed = 0;
      let newRot = enemy.rotation;
      let newPos = enemy.position.clone();
      let leftSpeed = 0;
      let rightSpeed = 0;

      if (dist > 50) {
        // Move towards player
        const angleToPlayer = Math.atan2(dirToPlayer.x, dirToPlayer.z);
        let rotDiff = angleToPlayer - enemy.rotation;
        rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));
        
        if (Math.abs(rotDiff) > 0.1) {
          rotationSpeed = Math.sign(rotDiff) * 1.0; // Turn speed
          leftSpeed = -rotationSpeed * GAME_CONFIG.tank.trackWidth / 2;
          rightSpeed = rotationSpeed * GAME_CONFIG.tank.trackWidth / 2;
        } else {
          forwardSpeed = GAME_CONFIG.tank.maxSpeed * 0.5; // Half speed
          leftSpeed = forwardSpeed;
          rightSpeed = forwardSpeed;
        }
      } else if (dist < 30) {
        // Reverse
        forwardSpeed = -GAME_CONFIG.tank.maxReverseSpeed * 0.5;
        leftSpeed = forwardSpeed;
        rightSpeed = forwardSpeed;
      }

      // Track damage: destroyed tracks cannot move
      if (enemy.trackDestroyed?.left) leftSpeed = 0;
      if (enemy.trackDestroyed?.right) rightSpeed = 0;

      // Derive actual movement from track speeds
      if (enemy.trackDestroyed?.left && enemy.trackDestroyed?.right) {
        forwardSpeed = 0;
        rotationSpeed = 0;
      } else if (enemy.trackDestroyed?.left) {
        forwardSpeed = 0;
        rotationSpeed = rightSpeed > 0 ? -0.5 : rightSpeed < 0 ? 0.5 : 0;
      } else if (enemy.trackDestroyed?.right) {
        forwardSpeed = 0;
        rotationSpeed = leftSpeed > 0 ? 0.5 : leftSpeed < 0 ? -0.5 : 0;
      } else {
        const mov = computeTrackMovement(leftSpeed, rightSpeed, newPos, newRot, delta);
        newPos = mov.position;
        newRot = mov.rotation;
        forwardSpeed = mov.forwardSpeed;
        rotationSpeed = mov.rotationSpeed;
      }

      if (enemy.trackDestroyed?.left || enemy.trackDestroyed?.right) {
        // Single/no track: apply manual rotation only
        newRot += rotationSpeed * delta;
      }

      // Snap to terrain
      newPos.y = getTerrainHeight(newPos.x, newPos.z);

      // Tank-tank collision
      const allTanks = [player, ...enemies];
      resolveTankCollision(enemy.id, newPos, allTanks);

      // Tree collision
      const treeResult = resolveTreeCollision(newPos, forwardSpeed, useGameStore.getState().trees);
      if (treeResult.knockedTreeIndex !== null) {
        const idx = treeResult.knockedTreeIndex;
        const tree = useGameStore.getState().trees[idx];
        const fallDir = Math.atan2(newPos.x - tree.position[0], newPos.z - tree.position[2]);
        useGameStore.getState().updateTree(idx, { fallen: true, fallDirection: fallDir, fallProgress: 0.01 });
        useGameStore.getState().spawnParticle('tree_hit', new THREE.Vector3(tree.position[0], tree.position[1] + 2, tree.position[2]), new THREE.Vector3(0, 1, 0));
      }

      newPos.y = getTerrainHeight(newPos.x, newPos.z);

      // Calculate pitch and roll based on terrain
      const orientation = computeTerrainOrientation(newPos, newRot);
      const bodyRock = computeBodyRock(forwardSpeed, GAME_CONFIG.tank.maxSpeed, rotationSpeed, state.clock.elapsedTime);
      const pitch = orientation.pitch + bodyRock.pitchOffset;
      const roll = orientation.roll + bodyRock.rollOffset;
      newPos.y = orientation.adjustedY + bodyRock.yOffset;

      // Steady-aim tracking: accumulate time when both tanks are stationary
      const moveThresh = GAME_CONFIG.ai.movementThreshold;
      const sa = steadyAim.current[enemy.id];
      const enemySpeed = Math.abs(forwardSpeed);
      const playerSpeed = Math.abs(player.speed || 0);
      const bothStationary = enemySpeed < moveThresh && playerSpeed < moveThresh;

      if (!sa) {
        steadyAim.current[enemy.id] = { time: 0, lastEnemyPos: newPos.clone(), lastPlayerPos: player.position.clone() };
      } else if (bothStationary) {
        sa.time += delta;
        sa.lastEnemyPos.copy(newPos);
        sa.lastPlayerPos.copy(player.position);
      } else {
        sa.time = 0;
        sa.lastEnemyPos.copy(newPos);
        sa.lastPlayerPos.copy(player.position);
      }

      // Zeroing factor: 1.0 at start, decays to zeroInMinFactor over zeroInTime seconds
      const aimTime = steadyAim.current[enemy.id].time;
      const zeroProgress = Math.min(aimTime / GAME_CONFIG.ai.zeroInTime, 1);
      const zeroFactor = 1 - zeroProgress * (1 - GAME_CONFIG.ai.zeroInMinFactor);

      // Aim dispersion: per-enemy offset that drifts, scaled by zeroing factor
      if (!aimOffsets.current[enemy.id] || now > aimOffsets.current[enemy.id].nextChangeTime) {
        aimOffsets.current[enemy.id] = {
          azimuth: randGauss() * GAME_CONFIG.ai.aimDispersion * zeroFactor,
          elevation: randGauss() * GAME_CONFIG.ai.aimDispersion * zeroFactor,
          nextChangeTime: now + 1000 + Math.random() * 2000,
        };
      }
      const aimOff = aimOffsets.current[enemy.id];

      // Simple aiming: rotate hull towards player slowly, turret faster
      const targetRotation = Math.atan2(dirToPlayer.x, dirToPlayer.z) + aimOff.azimuth;
      
      // Rotate turret
      let newTurretRot = enemy.turretRotation;
      const angleDiff = targetRotation - (enemy.rotation + enemy.turretRotation);
      
      // Normalize angle
      let normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      
      if (Math.abs(normalizedDiff) > 0.05) {
        newTurretRot += Math.sign(normalizedDiff) * GAME_CONFIG.ai.turretSpeed * delta;
      }

      // Gun elevation (rough approximation for gravity drop)
      const projVel = GAME_CONFIG.weapons.enemy.velocity;
      const t = dist / projVel;
      const drop = 0.5 * GAME_CONFIG.physics.gravity * t * t;
      // Required elevation angle (negative because positive gunElevation means aiming down)
      const targetElev = -Math.atan2(player.position.y + 1.5 + drop - (enemy.position.y + 1.6), dist) + aimOff.elevation;
      
      let newGunElev = enemy.gunElevation;
      const elevDiff = targetElev - enemy.gunElevation;
      if (Math.abs(elevDiff) > 0.01) {
        newGunElev += Math.sign(elevDiff) * GAME_CONFIG.ai.gunSpeed * delta;
      }

      updateEnemy(enemy.id, {
        position: newPos,
        rotation: newRot,
        pitch: pitch,
        roll: roll,
        turretRotation: newTurretRot,
        gunElevation: newGunElev,
        speed: forwardSpeed,
        leftTrackSpeed: leftSpeed,
        rightTrackSpeed: rightSpeed,
      });

      // Fire if aimed and reloaded
      if (Math.abs(normalizedDiff) < 0.1 && Math.abs(elevDiff) < 0.1) {
        const lastFire = lastFireTimes.current[enemy.id] || 0;
        if (now - lastFire > GAME_CONFIG.ai.reloadTime + Math.random() * 3000) {
          lastFireTimes.current[enemy.id] = now;

          const tankEuler = new THREE.Euler(pitch, newRot, roll, 'YXZ');
          const tankQuat = new THREE.Quaternion().setFromEuler(tankEuler);
          
          const turretEuler = new THREE.Euler(0, newTurretRot, 0, 'YXZ');
          const turretQuat = new THREE.Quaternion().setFromEuler(turretEuler);
          
          const gunEuler = new THREE.Euler(newGunElev, 0, 0, 'YXZ');
          const gunQuat = new THREE.Quaternion().setFromEuler(gunEuler);
          
          const worldTurretQuat = tankQuat.clone().multiply(turretQuat);
          const worldGunQuat = worldTurretQuat.clone().multiply(gunQuat);
          
          const enemyDef = getTankDef(enemy.tankType);
          const turretPosWorld = newPos.clone().add(new THREE.Vector3(...enemyDef.turretOffset).applyQuaternion(tankQuat));
          const gunPivotWorld = turretPosWorld.clone().add(new THREE.Vector3(...enemyDef.gunPivotOffset).applyQuaternion(worldTurretQuat));

          const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldGunQuat);
          // Apply fire-time dispersion (reduced by zeroing)
          const fireDisp = GAME_CONFIG.ai.fireDispersion * zeroFactor;
          const dispYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), randGauss() * fireDisp);
          const dispPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), randGauss() * fireDisp);
          dir.applyQuaternion(dispYaw).applyQuaternion(dispPitch);
          const pos = gunPivotWorld.clone().add(dir.clone().multiplyScalar(enemyDef.muzzleDistance));

          const enemyWeapon = GAME_CONFIG.weapons.enemy;
          const velocity = dir.clone().multiplyScalar(enemyWeapon.velocity);
          fireProjectile(pos, velocity, 'AP', enemyWeapon.penetration, enemyWeapon.damage, enemy.id);
          updateEnemy(enemy.id, { lastFireTime: now });
          playFireSound();
        }
      }
    });
  });

  return null;
}
