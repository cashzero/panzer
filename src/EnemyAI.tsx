import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import * as THREE from 'three';
import { useRef } from 'react';
import { playFireSound } from './audio';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';

export function EnemyAI() {
  const lastFireTimes = useRef<{ [id: string]: number }>({});

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

      newRot += rotationSpeed * delta;
      const moveDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), newRot);
      newPos.add(moveDir.clone().multiplyScalar(forwardSpeed * delta));

      // Snap to terrain
      const currentHeight = getTerrainHeight(newPos.x, newPos.z);
      newPos.y = currentHeight;

      // Calculate pitch and roll based on terrain using tank dimensions
      const forward = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, newRot, 0));
      const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, newRot, 0));
      
      // Tank is roughly 5 units long and 3.2 units wide
      const frontPos = newPos.clone().add(forward.clone().multiplyScalar(2.5));
      const backPos = newPos.clone().sub(forward.clone().multiplyScalar(2.5));
      const rightPos = newPos.clone().add(right.clone().multiplyScalar(1.6));
      const leftPos = newPos.clone().sub(right.clone().multiplyScalar(1.6));
      
      const frontHeight = getTerrainHeight(frontPos.x, frontPos.z);
      const backHeight = getTerrainHeight(backPos.x, backPos.z);
      const rightHeight = getTerrainHeight(rightPos.x, rightPos.z);
      const leftHeight = getTerrainHeight(leftPos.x, leftPos.z);
      
      const slope = (frontHeight - backHeight) / 5;
      const rollSlope = (rightHeight - leftHeight) / 3.2;
      
      const pitch = -Math.atan(slope);
      const roll = Math.atan(rollSlope);

      // Adjust center height to prevent clipping on hills/valleys
      const avgHeight = (frontHeight + backHeight + rightHeight + leftHeight) / 4;
      newPos.y = Math.max(currentHeight, avgHeight);

      // Simple aiming: rotate hull towards player slowly, turret faster
      const targetRotation = Math.atan2(dirToPlayer.x, dirToPlayer.z);
      
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
      const targetElev = -Math.atan2(player.position.y + 1.5 + drop - (enemy.position.y + 1.6), dist);
      
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
          
          // Match the visual model: turret is at [0, 1.2, 0.2] relative to tank, gun is at [0, 0.4, 1.5] relative to turret
          const turretPosWorld = newPos.clone().add(new THREE.Vector3(0, 1.2, 0.2).applyQuaternion(tankQuat));
          const gunPivotWorld = turretPosWorld.clone().add(new THREE.Vector3(0, 0.4, 1.5).applyQuaternion(worldTurretQuat));
          
          const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldGunQuat);
          const pos = gunPivotWorld.clone().add(dir.clone().multiplyScalar(4));

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
