import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import * as THREE from 'three';
import { useRef } from 'react';
import { playFireSound, playAutocannonSound } from './audio';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { resolveTankCollision, resolveTreeCollision } from './collision';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, computeBodyRock, computeGravityDrop } from './tankPhysics';
import { computeMuzzleAndDirection, applyDispersion, randGauss } from './firing';
import type { TankData } from './store';

export function AllyAI() {
  const lastFireTimes = useRef<{ [id: string]: number }>({});
  const aimOffsets = useRef<{ [id: string]: { azimuth: number; elevation: number; nextChangeTime: number } }>({});
  const steadyAim = useRef<{ [id: string]: { time: number; lastAllyPos: THREE.Vector3; lastTargetPos: THREE.Vector3 } }>({});
  const burstStates = useRef<{ [id: string]: { remaining: number; nextFireTime: number } }>({});

  useFrame((state, delta) => {
    const { playerTank: player, enemies, allies, updateAlly, fireProjectile } = useGameStore.getState();

    const now = Date.now();

    allies.forEach((ally) => {
      if (ally.destroyed) return;

      // Find closest living enemy
      let closestEnemy: typeof enemies[0] | null = null;
      let closestDist = Infinity;
      for (const enemy of enemies) {
        if (enemy.destroyed) continue;
        const d = ally.position.distanceTo(enemy.position);
        if (d < closestDist) {
          closestDist = d;
          closestEnemy = enemy;
        }
      }

      // Also follow player loosely — move toward player if no enemies or too far from player
      const distToPlayer = ally.position.distanceTo(player.position);
      const allyDef = getTankDef(ally.tankType);

      let forwardSpeed = 0;
      let rotationSpeed = 0;
      let newRot = ally.rotation;
      let newPos = ally.position.clone();
      let leftSpeed = 0;
      let rightSpeed = 0;

      // Check for waypoint
      const waypoint = useGameStore.getState().allyWaypoints[ally.id];

      if (closestEnemy && closestDist < GAME_CONFIG.ai.engagementDistance) {
        // Engage enemy
        const dirToEnemy = closestEnemy.position.clone().sub(ally.position).normalize();

        const playerDef = getTankDef(closestEnemy.tankType);
        const penRatio = allyDef.weapons.AP.penetration / closestEnemy.armor.front;
        const armorRatio = allyDef.armor.front / playerDef.weapons.AP.penetration;
        const preferredRange = Math.max(40, Math.min(170, 70 * penRatio + 40 * armorRatio));
        const rangeDeadzone = preferredRange * 0.15;

        if (closestDist > preferredRange + rangeDeadzone) {
          const angleToEnemy = Math.atan2(dirToEnemy.x, dirToEnemy.z);
          let rotDiff = angleToEnemy - ally.rotation;
          rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

          if (Math.abs(rotDiff) > 0.1) {
            rotationSpeed = Math.sign(rotDiff) * 1.0;
            leftSpeed = -rotationSpeed * allyDef.trackWidth / 2;
            rightSpeed = rotationSpeed * allyDef.trackWidth / 2;
          } else {
            forwardSpeed = allyDef.maxSpeed * 0.5;
            leftSpeed = forwardSpeed;
            rightSpeed = forwardSpeed;
          }
        } else if (closestDist < preferredRange - rangeDeadzone) {
          forwardSpeed = -allyDef.maxReverseSpeed * 0.5;
          leftSpeed = forwardSpeed;
          rightSpeed = forwardSpeed;
        }
      } else if (waypoint) {
        // Navigate to waypoint
        const wpVec = new THREE.Vector3(waypoint.x, waypoint.y, waypoint.z);
        const distToWp = ally.position.distanceTo(wpVec);

        if (distToWp > 5) {
          const dirToWp = wpVec.clone().sub(ally.position).normalize();
          const angleToWp = Math.atan2(dirToWp.x, dirToWp.z);
          let rotDiff = angleToWp - ally.rotation;
          rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

          if (Math.abs(rotDiff) > 0.1) {
            rotationSpeed = Math.sign(rotDiff) * 1.0;
            leftSpeed = -rotationSpeed * allyDef.trackWidth / 2;
            rightSpeed = rotationSpeed * allyDef.trackWidth / 2;
          } else {
            forwardSpeed = allyDef.maxSpeed * 0.5;
            leftSpeed = forwardSpeed;
            rightSpeed = forwardSpeed;
          }
        }
        // else: arrived at waypoint — hold position
      } else if (distToPlayer > 50) {
        // No enemies in range, no waypoint — follow player
        const dirToPlayer = player.position.clone().sub(ally.position).normalize();
        const angleToPlayer = Math.atan2(dirToPlayer.x, dirToPlayer.z);
        let rotDiff = angleToPlayer - ally.rotation;
        rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

        if (Math.abs(rotDiff) > 0.1) {
          rotationSpeed = Math.sign(rotDiff) * 1.0;
          leftSpeed = -rotationSpeed * allyDef.trackWidth / 2;
          rightSpeed = rotationSpeed * allyDef.trackWidth / 2;
        } else {
          forwardSpeed = allyDef.maxSpeed * 0.5;
          leftSpeed = forwardSpeed;
          rightSpeed = forwardSpeed;
        }
      }

      // Track damage
      if (ally.trackDestroyed?.left) leftSpeed = 0;
      if (ally.trackDestroyed?.right) rightSpeed = 0;

      if (ally.trackDestroyed?.left && ally.trackDestroyed?.right) {
        forwardSpeed = 0;
        rotationSpeed = 0;
      } else if (ally.trackDestroyed?.left) {
        forwardSpeed = 0;
        rotationSpeed = rightSpeed > 0 ? -0.5 : rightSpeed < 0 ? 0.5 : 0;
      } else if (ally.trackDestroyed?.right) {
        forwardSpeed = 0;
        rotationSpeed = leftSpeed > 0 ? 0.5 : leftSpeed < 0 ? -0.5 : 0;
      } else {
        const prevRotSpeed = ((ally.rightTrackSpeed || 0) - (ally.leftTrackSpeed || 0)) / allyDef.trackWidth;
        const mov = computeTrackMovement(leftSpeed, rightSpeed, newPos, newRot, delta, allyDef.trackWidth, allyDef.turnRateLimit, prevRotSpeed, allyDef.rotationalInertia);
        newPos = mov.position;
        newRot = mov.rotation;
        forwardSpeed = mov.forwardSpeed;
        rotationSpeed = mov.rotationSpeed;
      }

      if (ally.trackDestroyed?.left || ally.trackDestroyed?.right) {
        newRot += rotationSpeed * delta;
      }

      newPos.y = getTerrainHeight(newPos.x, newPos.z);

      // Collision with all tanks
      const allTanks = [player, ...enemies, ...allies];
      resolveTankCollision(ally.id, newPos, allTanks);

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

      const orientation = computeTerrainOrientation(newPos, newRot, allyDef.trackWidth);
      const bodyRock = computeBodyRock(forwardSpeed, allyDef.maxSpeed, rotationSpeed, state.clock.elapsedTime);
      const pitch = orientation.pitch + bodyRock.pitchOffset;
      const roll = orientation.roll + bodyRock.rollOffset;
      newPos.y = orientation.adjustedY + bodyRock.yOffset;

      // Turret aiming at closest enemy
      let newTurretRot = ally.turretRotation;
      let newGunElev = ally.gunElevation;
      let normalizedDiff = 0;
      let elevDiff = 0;
      const dist = closestDist;

      if (closestEnemy && !closestEnemy.destroyed) {
        const dirToTarget = closestEnemy.position.clone().sub(ally.position).normalize();

        // Steady-aim tracking
        const moveThresh = GAME_CONFIG.ai.movementThreshold;
        const sa = steadyAim.current[ally.id];
        const allySpeed = Math.abs(forwardSpeed);
        const targetSpeed = Math.abs(closestEnemy.speed || 0);
        const bothStationary = allySpeed < moveThresh && targetSpeed < moveThresh;

        if (!sa) {
          steadyAim.current[ally.id] = { time: 0, lastAllyPos: newPos.clone(), lastTargetPos: closestEnemy.position.clone() };
        } else if (bothStationary) {
          sa.time += delta;
        } else {
          sa.time = 0;
        }

        const aimTime = steadyAim.current[ally.id]?.time ?? 0;
        const zeroProgress = Math.min(aimTime / GAME_CONFIG.ai.zeroInTime, 1);
        const zeroFactor = 1 - zeroProgress * (1 - GAME_CONFIG.ai.zeroInMinFactor);

        if (!aimOffsets.current[ally.id] || now > aimOffsets.current[ally.id].nextChangeTime) {
          aimOffsets.current[ally.id] = {
            azimuth: randGauss() * GAME_CONFIG.ai.aimDispersion * zeroFactor,
            elevation: randGauss() * GAME_CONFIG.ai.aimDispersion * zeroFactor,
            nextChangeTime: now + 1000 + Math.random() * 2000,
          };
        }
        const aimOff = aimOffsets.current[ally.id];

        const targetRotation = Math.atan2(dirToTarget.x, dirToTarget.z) + aimOff.azimuth;
        const angleDiff = targetRotation - (ally.rotation + ally.turretRotation);
        normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

        if (Math.abs(normalizedDiff) > 0.05) {
          newTurretRot += Math.sign(normalizedDiff) * GAME_CONFIG.ai.turretSpeed * delta;
        }

        const drop = computeGravityDrop(dist, allyDef.weapons.AP.velocity);
        const targetElev = -Math.atan2(closestEnemy.position.y + 1.5 + drop - (ally.position.y + 1.6), dist) + aimOff.elevation;

        elevDiff = targetElev - ally.gunElevation;
        if (Math.abs(elevDiff) > 0.01) {
          newGunElev += Math.sign(elevDiff) * GAME_CONFIG.ai.gunSpeed * delta;
        }
      }

      updateAlly(ally.id, {
        position: newPos,
        rotation: newRot,
        pitch,
        roll,
        turretRotation: newTurretRot,
        gunElevation: newGunElev,
        speed: forwardSpeed,
        leftTrackSpeed: leftSpeed,
        rightTrackSpeed: rightSpeed,
      });

      if (!closestEnemy || closestEnemy.destroyed) return;

      // Fire logic
      const fireAllyRound = () => {
        const aiTank = { position: newPos, rotation: newRot, pitch, roll, turretRotation: newTurretRot, gunElevation: newGunElev } as TankData;
        const { pos, dir } = computeMuzzleAndDirection(aiTank, allyDef, { turretSwayOffset: 0, gunSwayOffset: 0 });
        const aimTime = steadyAim.current[ally.id]?.time ?? 0;
        const zeroProgress = Math.min(aimTime / GAME_CONFIG.ai.zeroInTime, 1);
        const zeroFactor = 1 - zeroProgress * (1 - GAME_CONFIG.ai.zeroInMinFactor);
        const gunDisp = allyDef.weapons.AP.dispersion || 0;
        const fireDisp = GAME_CONFIG.ai.fireDispersion * zeroFactor + gunDisp;
        applyDispersion(dir, fireDisp);

        const velocity = dir.clone().multiplyScalar(allyDef.weapons.AP.velocity);
        fireProjectile(pos, velocity, 'AP', allyDef.weapons.AP.penetration, allyDef.weapons.AP.damage, ally.id, allyDef.caliber);
        updateAlly(ally.id, { lastFireTime: now });

        if (allyDef.burstCount) {
          playAutocannonSound();
        } else {
          playFireSound();
        }
      };

      // Burst continuation
      const burst = burstStates.current[ally.id];
      if (burst && burst.remaining > 0) {
        if (now >= burst.nextFireTime) {
          fireAllyRound();
          burst.remaining--;
          if (burst.remaining > 0) {
            burst.nextFireTime = now + (allyDef.burstInterval || 125);
          } else {
            lastFireTimes.current[ally.id] = now;
          }
        }
      } else if (Math.abs(normalizedDiff) < 0.1 && Math.abs(elevDiff) < 0.1) {
        const lastFire = lastFireTimes.current[ally.id] || 0;
        if (now - lastFire > allyDef.reloadTime + Math.random() * 3000) {
          fireAllyRound();

          if (allyDef.burstCount && allyDef.burstCount > 1 && allyDef.burstInterval) {
            burstStates.current[ally.id] = {
              remaining: allyDef.burstCount - 1,
              nextFireTime: now + allyDef.burstInterval,
            };
          } else {
            lastFireTimes.current[ally.id] = now;
          }
        }
      }
    });
  });

  return null;
}
