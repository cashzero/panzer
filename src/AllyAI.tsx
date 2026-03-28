import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import * as THREE from 'three';
import { useRef } from 'react';
import { GAME_CONFIG } from './config';
import { getAmmoDisplayPenetration } from './penetrationModel';
import { getTerrainHeight } from './Terrain';
import { steerDirectionAroundBuildings, type BuildingInstance } from './buildings';
import { resolveTankCollision, resolveTreeCollision, resolveBuildingCollision } from './collision';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, computeBodyRock, computeGravityDrop } from './tankPhysics';
import { computeMuzzleAndDirection, applyDispersion } from './firing';
import { ensureAiAccuracyState, getAiFireDispersion, registerAiShot, type AiAccuracyState, type AiAimOffset } from './aiAccuracy';
import { clampGunElevation } from './turretAiming';
import type { AllyEffectiveMoveOrder, AllyEngagementPosture, AllyFireOrder, TankData } from './store';
import { audioManager, toAudioVec3 } from './audio';

function computeEngagementMovement(
  ally: TankData,
  target: TankData,
  allyDef: ReturnType<typeof getTankDef>,
  buildings: BuildingInstance[],
) {
  const dirToEnemy = target.position.clone().sub(ally.position).normalize();
  const moveDir = steerDirectionAroundBuildings(ally.position, dirToEnemy, buildings, 90, 14);
  const playerDef = getTankDef(target.tankType);
  const allyPen = getAmmoDisplayPenetration(allyDef.weapons.AP, 'AP', allyDef.caliber);
  const targetPen = getAmmoDisplayPenetration(playerDef.weapons.AP, 'AP', playerDef.caliber);
  const penRatio = allyPen / target.armor.front;
  const armorRatio = allyDef.armor.front / Math.max(1, targetPen);
  const preferredRange = Math.max(40, Math.min(170, 70 * penRatio + 40 * armorRatio));
  const rangeDeadzone = preferredRange * 0.15;

  let forwardSpeed = 0;
  let rotationSpeed = 0;
  let leftSpeed = 0;
  let rightSpeed = 0;

  if (ally.position.distanceTo(target.position) > preferredRange + rangeDeadzone) {
    const angleToEnemy = Math.atan2(moveDir.x, moveDir.z);
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
  } else if (ally.position.distanceTo(target.position) < preferredRange - rangeDeadzone) {
    const retreatDir = steerDirectionAroundBuildings(ally.position, moveDir.clone().multiplyScalar(-1), buildings, 65, 14);
    const retreatAngle = Math.atan2(retreatDir.x, retreatDir.z);
    let retreatDiff = retreatAngle - ally.rotation;
    retreatDiff = Math.atan2(Math.sin(retreatDiff), Math.cos(retreatDiff));

    if (Math.abs(retreatDiff) > 0.16) {
      rotationSpeed = Math.sign(retreatDiff) * 1.0;
      leftSpeed = -rotationSpeed * allyDef.trackWidth / 2;
      rightSpeed = rotationSpeed * allyDef.trackWidth / 2;
    } else {
      forwardSpeed = -allyDef.maxReverseSpeed * 0.5;
      leftSpeed = forwardSpeed;
      rightSpeed = forwardSpeed;
    }
  }

  return { forwardSpeed, rotationSpeed, leftSpeed, rightSpeed };
}

function computeFireFromPositionMovement(
  ally: TankData,
  target: TankData,
  allyDef: ReturnType<typeof getTankDef>
) {
  const dirToEnemy = target.position.clone().sub(ally.position).normalize();
  const angleToEnemy = Math.atan2(dirToEnemy.x, dirToEnemy.z);
  let rotDiff = angleToEnemy - ally.rotation;
  rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

  if (Math.abs(rotDiff) <= 0.1) {
    return { forwardSpeed: 0, rotationSpeed: 0, leftSpeed: 0, rightSpeed: 0 };
  }

  const rotationSpeed = Math.sign(rotDiff) * 1.0;
  return {
    forwardSpeed: 0,
    rotationSpeed,
    leftSpeed: -rotationSpeed * allyDef.trackWidth / 2,
    rightSpeed: rotationSpeed * allyDef.trackWidth / 2,
  };
}

function computeMoveToPoint(
  ally: TankData,
  destination: THREE.Vector3,
  allyDef: ReturnType<typeof getTankDef>,
  buildings: BuildingInstance[],
) {
  const distToWp = ally.position.distanceTo(destination);
  if (distToWp <= GAME_CONFIG.ai.moveArrivalDistance) {
    return { forwardSpeed: 0, rotationSpeed: 0, leftSpeed: 0, rightSpeed: 0, arrived: true };
  }

  const dirToWp = steerDirectionAroundBuildings(ally.position, destination.clone().sub(ally.position).normalize(), buildings, 85, 14);
  const angleToWp = Math.atan2(dirToWp.x, dirToWp.z);
  let rotDiff = angleToWp - ally.rotation;
  rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

  if (Math.abs(rotDiff) > 0.1) {
    const rotationSpeed = Math.sign(rotDiff) * 1.0;
    return {
      forwardSpeed: 0,
      rotationSpeed,
      leftSpeed: -rotationSpeed * allyDef.trackWidth / 2,
      rightSpeed: rotationSpeed * allyDef.trackWidth / 2,
      arrived: false,
    };
  }

  const forwardSpeed = allyDef.maxSpeed * 0.5;
  return { forwardSpeed, rotationSpeed: 0, leftSpeed: forwardSpeed, rightSpeed: forwardSpeed, arrived: false };
}

function computeFollowMovement(
  ally: TankData,
  player: TankData,
  allyDef: ReturnType<typeof getTankDef>,
  buildings: BuildingInstance[],
) {
  const distToPlayer = ally.position.distanceTo(player.position);
  if (distToPlayer <= 50) {
    return { forwardSpeed: 0, rotationSpeed: 0, leftSpeed: 0, rightSpeed: 0 };
  }

  const dirToPlayer = steerDirectionAroundBuildings(ally.position, player.position.clone().sub(ally.position).normalize(), buildings, 85, 14);
  const angleToPlayer = Math.atan2(dirToPlayer.x, dirToPlayer.z);
  let rotDiff = angleToPlayer - ally.rotation;
  rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

  if (Math.abs(rotDiff) > 0.1) {
    const rotationSpeed = Math.sign(rotDiff) * 1.0;
    return {
      forwardSpeed: 0,
      rotationSpeed,
      leftSpeed: -rotationSpeed * allyDef.trackWidth / 2,
      rightSpeed: rotationSpeed * allyDef.trackWidth / 2,
    };
  }

  const forwardSpeed = allyDef.maxSpeed * 0.5;
  return { forwardSpeed, rotationSpeed: 0, leftSpeed: forwardSpeed, rightSpeed: forwardSpeed };
}

export function AllyAI() {
  const lastFireTimes = useRef<{ [id: string]: number }>({});
  const aimOffsets = useRef<Record<string, AiAimOffset>>({});
  const accuracyState = useRef<Record<string, AiAccuracyState>>({});
  const burstStates = useRef<{ [id: string]: { remaining: number; nextFireTime: number } }>({});
  const automaticStates = useRef<{ [id: string]: { magazineRounds: number; nextFireTime: number } }>({});

  useFrame((state, delta) => {
    const store = useGameStore.getState();
    const {
      playerTank: player,
      enemies,
      allies,
      updateAlly,
      fireProjectile,
      allyWaypoints,
      allyBaseMoveOrders,
      allyFireOrders,
      clearAllyWaypoint,
      trees,
      updateTree,
      spawnParticle,
      buildings,
    } = store;

    const now = Date.now();

    allies.forEach((ally) => {
      if (ally.destroyed) return;

      const allyDef = getTankDef(ally.tankType);
      const waypoint = allyWaypoints[ally.id];
      const moveOrder: AllyEffectiveMoveOrder = waypoint ? 'move' : (allyBaseMoveOrders[ally.id] ?? 'follow');
      const fireOrder: AllyFireOrder = allyFireOrders[ally.id] ?? 'fire-at-will';
      const engagementPosture: AllyEngagementPosture = store.allyEngagementPostures[ally.id] ?? 'fire-from-position';

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

      // Check if alerted by a hit — prioritize attacker
      const alertActive = ally.alertedBy && ally.alertedAt &&
        (now - ally.alertedAt) < GAME_CONFIG.ai.alertDecayTime;
      let alerted = false;

      if (alertActive) {
        const attacker = enemies.find(e => !e.destroyed && e.id === ally.alertedBy);
        if (attacker) {
          closestEnemy = attacker;
          closestDist = ally.position.distanceTo(attacker.position);
          alerted = true;
        }
      }

      const canFireAtWill = fireOrder === 'fire-at-will';
      const canReturnFire = fireOrder === 'return-fire';
      const inThreatRange = closestEnemy !== null && closestDist < GAME_CONFIG.ai.returnFireThreatDistance;
      const canEngage = fireOrder !== 'hold-fire' && closestEnemy !== null && (
        (canFireAtWill && closestDist < GAME_CONFIG.ai.detectionDistance) ||
        (canReturnFire && (alerted || inThreatRange))
      );
      const engagementTarget = canEngage ? closestEnemy : null;

      let forwardSpeed = 0;
      let rotationSpeed = 0;
      let newRot = ally.rotation;
      let newPos = ally.position.clone();
      let leftSpeed = 0;
      let rightSpeed = 0;

      if (moveOrder === 'move' && waypoint) {
          const moveResult = computeMoveToPoint(ally, new THREE.Vector3(waypoint.x, waypoint.y, waypoint.z), allyDef, buildings);
        forwardSpeed = moveResult.forwardSpeed;
        rotationSpeed = moveResult.rotationSpeed;
        leftSpeed = moveResult.leftSpeed;
        rightSpeed = moveResult.rightSpeed;

        if (moveResult.arrived) {
          clearAllyWaypoint(ally.id);
        }
      } else if (moveOrder === 'follow') {
        const followResult = computeFollowMovement(ally, player, allyDef, buildings);
        forwardSpeed = followResult.forwardSpeed;
        rotationSpeed = followResult.rotationSpeed;
        leftSpeed = followResult.leftSpeed;
        rightSpeed = followResult.rightSpeed;
      }

      if (engagementTarget && moveOrder !== 'move' && fireOrder === 'fire-at-will') {
        const combatMove = engagementPosture === 'advance-and-fire'
          ? computeEngagementMovement(ally, engagementTarget, allyDef, buildings)
          : computeFireFromPositionMovement(ally, engagementTarget, allyDef);
        forwardSpeed = combatMove.forwardSpeed;
        rotationSpeed = combatMove.rotationSpeed;
        leftSpeed = combatMove.leftSpeed;
        rightSpeed = combatMove.rightSpeed;
      } else if (engagementTarget && moveOrder !== 'move' && fireOrder === 'return-fire' && engagementPosture === 'fire-from-position') {
        const combatMove = computeFireFromPositionMovement(ally, engagementTarget, allyDef);
        forwardSpeed = combatMove.forwardSpeed;
        rotationSpeed = combatMove.rotationSpeed;
        leftSpeed = combatMove.leftSpeed;
        rightSpeed = combatMove.rightSpeed;
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
      resolveBuildingCollision(newPos, useGameStore.getState().buildings);

      // Tree collision
      const treeResult = resolveTreeCollision(newPos, forwardSpeed, trees);
      if (treeResult.knockedTreeIndex !== null) {
        const idx = treeResult.knockedTreeIndex;
        const tree = trees[idx];
        const fallDir = Math.atan2(newPos.x - tree.position[0], newPos.z - tree.position[2]);
        updateTree(idx, { fallen: true, fallDirection: fallDir, fallProgress: 0.01 });
        spawnParticle('tree_hit', new THREE.Vector3(tree.position[0], tree.position[1] + 2, tree.position[2]), new THREE.Vector3(0, 1, 0));
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
      const dist = engagementTarget ? ally.position.distanceTo(engagementTarget.position) : Infinity;

      if (closestEnemy && !closestEnemy.destroyed) {
        const dirToTarget = closestEnemy.position.clone().sub(ally.position).normalize();
        const accuracy = ensureAiAccuracyState(accuracyState.current, aimOffsets.current, ally.id, closestEnemy.id);
        const aimOff = aimOffsets.current[ally.id];

        const targetRotation = Math.atan2(dirToTarget.x, dirToTarget.z) + aimOff.azimuth;
        const angleDiff = targetRotation - (ally.rotation + ally.turretRotation);
        normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

        if (Math.abs(normalizedDiff) > 0.005) {
          newTurretRot += Math.sign(normalizedDiff) * allyDef.turretSpeed * delta;
        }

        const drop = computeGravityDrop(dist, allyDef.weapons.AP.velocity);
         const targetElev = -Math.atan2(closestEnemy.position.y + 1.5 + drop - (ally.position.y + 1.6), closestDist) + aimOff.elevation;

        elevDiff = targetElev - ally.gunElevation;
        if (Math.abs(elevDiff) > 0.002) {
          newGunElev += Math.sign(elevDiff) * allyDef.gunSpeed * delta;
        }
        newGunElev = clampGunElevation(newGunElev, allyDef.minGunElevation, allyDef.maxGunElevation);
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

      if (!engagementTarget || engagementTarget.destroyed || fireOrder === 'hold-fire') return;

      // Fire logic
      const fireAllyRound = () => {
        const aiTank = { position: newPos, rotation: newRot, pitch, roll, turretRotation: newTurretRot, gunElevation: newGunElev } as TankData;
        const { pos, dir } = computeMuzzleAndDirection(aiTank, allyDef, { turretSwayOffset: 0, gunSwayOffset: 0 });
        const shotsOnTarget = engagementTarget ? ensureAiAccuracyState(accuracyState.current, aimOffsets.current, ally.id, engagementTarget.id).shotsOnTarget : 0;
        const gunDisp = allyDef.weapons.AP.dispersion || 0;
        const fireDisp = getAiFireDispersion(shotsOnTarget) + gunDisp;
        applyDispersion(dir, fireDisp);

        const velocity = dir.clone().multiplyScalar(allyDef.weapons.AP.velocity);
        fireProjectile(pos, velocity, 'AP', allyDef.weapons.AP, allyDef.weapons.AP.damage, ally.id, allyDef.caliber);
        updateAlly(ally.id, { lastFireTime: now });
        registerAiShot(accuracyState.current, aimOffsets.current, ally.id, engagementTarget.id);
        audioManager.playShot({
          source: 'ally',
          position: toAudioVec3(pos),
          caliber: allyDef.caliber,
          burst: !!allyDef.burstCount || !!allyDef.automaticMagazineSize,
        });

      };

      if (
        Math.abs(normalizedDiff) < GAME_CONFIG.ai.fireTurretThreshold &&
        Math.abs(elevDiff) < GAME_CONFIG.ai.fireElevationThreshold
      ) {
        if (allyDef.automaticMagazineSize && allyDef.automaticFireInterval) {
          const automatic = automaticStates.current[ally.id] ?? {
            magazineRounds: allyDef.automaticMagazineSize,
            nextFireTime: 0,
          };
          automaticStates.current[ally.id] = automatic;

          if (automatic.magazineRounds <= 0) {
            const reloadStartedAt = lastFireTimes.current[ally.id] || 0;
            if (now - reloadStartedAt <= allyDef.reloadTime) return;
            automatic.magazineRounds = allyDef.automaticMagazineSize;
          }

          if (now < automatic.nextFireTime) return;

          fireAllyRound();
          automatic.magazineRounds--;
          if (automatic.magazineRounds > 0) {
            automatic.nextFireTime = now + allyDef.automaticFireInterval;
          } else {
            automatic.nextFireTime = 0;
            lastFireTimes.current[ally.id] = now;
          }
        } else {
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
          } else {
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
        }
      }
    });
  });

  return null;
}
