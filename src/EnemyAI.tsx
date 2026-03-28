import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import * as THREE from 'three';
import { useRef } from 'react';
import { playFireSound, playAutocannonSound } from './audio';
import { GAME_CONFIG } from './config';
import { getAmmoDisplayPenetration } from './penetrationModel';
import { getTerrainHeight } from './Terrain';
import { resolveTankCollision, resolveTreeCollision } from './collision';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, computeBodyRock, computeGravityDrop } from './tankPhysics';
import { computeMuzzleAndDirection, applyDispersion } from './firing';
import { ensureAiAccuracyState, getAiFireDispersion, registerAiShot, type AiAccuracyState, type AiAimOffset } from './aiAccuracy';
import { clampGunElevation } from './turretAiming';
import type { TankData } from './store';

export function EnemyAI() {
  const lastFireTimes = useRef<{ [id: string]: number }>({});
  const aimOffsets = useRef<Record<string, AiAimOffset>>({});
  const accuracyState = useRef<Record<string, AiAccuracyState>>({});
  const burstStates = useRef<{ [id: string]: { remaining: number; nextFireTime: number } }>({});

  useFrame((state, delta) => {
    const { playerTank: player, enemies, allies, updateEnemy, fireProjectile } = useGameStore.getState();

    const now = Date.now();

    enemies.forEach((enemy) => {
      if (enemy.destroyed) return;

      // Find closest friendly target (player + allies)
      const friendlyTargets = [player, ...allies].filter(t => !t.destroyed);
      let target: typeof player | null = null;
      let dist = Infinity;
      for (const t of friendlyTargets) {
        const d = enemy.position.distanceTo(t.position);
        if (d < dist) {
          dist = d;
          target = t;
        }
      }

      if (!target) return;

      // Check if alerted by a hit (overrides detection range)
      const alertActive = enemy.alertedBy && enemy.alertedAt &&
        (now - enemy.alertedAt) < GAME_CONFIG.ai.alertDecayTime;
      let alerted = false;

      if (alertActive) {
        // Prioritize the tank that hit us
        const attacker = friendlyTargets.find(t => t.id === enemy.alertedBy);
        if (attacker) {
          target = attacker;
          dist = enemy.position.distanceTo(attacker.position);
          alerted = true;
        }
      }

      // Only engage if within detection range or alerted
      if (dist > GAME_CONFIG.ai.detectionDistance && !alerted) return;

      // Aim at target
      const dirToPlayer = target.position.clone().sub(enemy.position).normalize();

      // Movement logic
      let forwardSpeed = 0;
      let rotationSpeed = 0;
      let newRot = enemy.rotation;
      let newPos = enemy.position.clone();
      let leftSpeed = 0;
      let rightSpeed = 0;

      // Dynamic engagement range based on both tanks' characteristics
      const enemyDef = getTankDef(enemy.tankType);
      const targetDef = getTankDef(target.tankType);
      const enemyPen = getAmmoDisplayPenetration(enemyDef.weapons.AP, 'AP', enemyDef.caliber);
      const targetPen = getAmmoDisplayPenetration(targetDef.weapons.AP, 'AP', targetDef.caliber);
      const penRatio = enemyPen / target.armor.front;
      const armorRatio = enemyDef.armor.front / Math.max(1, targetPen);
      const preferredRange = Math.max(40, Math.min(170, 70 * penRatio + 40 * armorRatio));
      const rangeDeadzone = preferredRange * 0.15; // 15% deadzone to avoid jitter

      if (dist > preferredRange + rangeDeadzone) {
        // Too far — advance towards target
        const angleToPlayer = Math.atan2(dirToPlayer.x, dirToPlayer.z);
        let rotDiff = angleToPlayer - enemy.rotation;
        rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

        if (Math.abs(rotDiff) > 0.1) {
          rotationSpeed = Math.sign(rotDiff) * 1.0;
          leftSpeed = -rotationSpeed * enemyDef.trackWidth / 2;
          rightSpeed = rotationSpeed * enemyDef.trackWidth / 2;
        } else {
          forwardSpeed = enemyDef.maxSpeed * 0.5;
          leftSpeed = forwardSpeed;
          rightSpeed = forwardSpeed;
        }
      } else if (dist < preferredRange - rangeDeadzone) {
        // Too close — reverse away
        forwardSpeed = -enemyDef.maxReverseSpeed * 0.5;
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
        const prevRotSpeed = ((enemy.rightTrackSpeed || 0) - (enemy.leftTrackSpeed || 0)) / enemyDef.trackWidth;
        const mov = computeTrackMovement(leftSpeed, rightSpeed, newPos, newRot, delta, enemyDef.trackWidth, enemyDef.turnRateLimit, prevRotSpeed, enemyDef.rotationalInertia);
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
      const allTanks = [player, ...enemies, ...useGameStore.getState().allies];
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
      const orientation = computeTerrainOrientation(newPos, newRot, enemyDef.trackWidth);
      const bodyRock = computeBodyRock(forwardSpeed, enemyDef.maxSpeed, rotationSpeed, state.clock.elapsedTime);
      const pitch = orientation.pitch + bodyRock.pitchOffset;
      const roll = orientation.roll + bodyRock.rollOffset;
      newPos.y = orientation.adjustedY + bodyRock.yOffset;

      const accuracy = ensureAiAccuracyState(accuracyState.current, aimOffsets.current, enemy.id, target.id);
      const aimOff = aimOffsets.current[enemy.id];

      // Simple aiming: rotate hull towards player slowly, turret faster
      const targetRotation = Math.atan2(dirToPlayer.x, dirToPlayer.z) + aimOff.azimuth;
      
      // Rotate turret
      let newTurretRot = enemy.turretRotation;
      const angleDiff = targetRotation - (enemy.rotation + enemy.turretRotation);
      
      // Normalize angle
      let normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      
      if (Math.abs(normalizedDiff) > 0.005) {
        newTurretRot += Math.sign(normalizedDiff) * enemyDef.turretSpeed * delta;
      }

      // Gun elevation with gravity compensation
      const drop = computeGravityDrop(dist, enemyDef.weapons.AP.velocity);
      const targetElev = -Math.atan2(target.position.y + 1.5 + drop - (enemy.position.y + 1.6), dist) + aimOff.elevation;
      
      let newGunElev = enemy.gunElevation;
      const elevDiff = targetElev - enemy.gunElevation;
      if (Math.abs(elevDiff) > 0.002) {
        newGunElev += Math.sign(elevDiff) * enemyDef.gunSpeed * delta;
      }
      newGunElev = clampGunElevation(newGunElev, enemyDef.minGunElevation, enemyDef.maxGunElevation);

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

      // Helper: fire one round from this enemy
      const fireEnemyRound = () => {
        const aiTank = { position: newPos, rotation: newRot, pitch, roll, turretRotation: newTurretRot, gunElevation: newGunElev } as TankData;
        const { pos, dir } = computeMuzzleAndDirection(aiTank, enemyDef, { turretSwayOffset: 0, gunSwayOffset: 0 });
        const gunDisp = enemyDef.weapons.AP.dispersion || 0;
        const fireDisp = getAiFireDispersion(accuracy.shotsOnTarget) + gunDisp;
        applyDispersion(dir, fireDisp);

        const velocity = dir.clone().multiplyScalar(enemyDef.weapons.AP.velocity);
        fireProjectile(pos, velocity, 'AP', enemyDef.weapons.AP, enemyDef.weapons.AP.damage, enemy.id, enemyDef.caliber);
        updateEnemy(enemy.id, { lastFireTime: now });
        registerAiShot(accuracyState.current, aimOffsets.current, enemy.id, target.id);

        const distToPlayer = newPos.distanceTo(player.position);
        if (enemyDef.burstCount) {
          playAutocannonSound(enemyDef.caliber, distToPlayer);
        } else {
          playFireSound(enemyDef.caliber, distToPlayer);
        }
      };

      // Continue active burst
      const burst = burstStates.current[enemy.id];
      if (burst && burst.remaining > 0) {
        if (now >= burst.nextFireTime) {
          fireEnemyRound();
          burst.remaining--;
          if (burst.remaining > 0) {
            burst.nextFireTime = now + (enemyDef.burstInterval || 125);
          } else {
            lastFireTimes.current[enemy.id] = now;
          }
        }
      } else if (
        Math.abs(normalizedDiff) < GAME_CONFIG.ai.fireTurretThreshold &&
        Math.abs(elevDiff) < GAME_CONFIG.ai.fireElevationThreshold
      ) {
        // Fire if aimed and reloaded
        const lastFire = lastFireTimes.current[enemy.id] || 0;
        if (now - lastFire > enemyDef.reloadTime + Math.random() * 3000) {
          fireEnemyRound();

          if (enemyDef.burstCount && enemyDef.burstCount > 1 && enemyDef.burstInterval) {
            // Start burst — schedule remaining rounds
            burstStates.current[enemy.id] = {
              remaining: enemyDef.burstCount - 1,
              nextFireTime: now + enemyDef.burstInterval,
            };
          } else {
            lastFireTimes.current[enemy.id] = now;
          }
        }
      }
    });
  });

  return null;
}
