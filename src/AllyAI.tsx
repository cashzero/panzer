import { useFrame } from '@react-three/fiber';
import { useGameStore, isCommandable } from './store';
import * as THREE from 'three';
import { useRef } from 'react';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { steerDirectionAroundBuildings, type BuildingInstance } from './buildings';
import { chooseAvoidanceDirection, resolveTankCollision, resolveTreeCollision, resolveBuildingCollision, resolveForestCollision } from './collision';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, computeBodyRock } from './tankPhysics';
import { computeMuzzleAndDirection, applyDispersion } from './firing';
import { ensureAiAccuracyState, getAiFireDispersion, layGun, registerAiShot, tankVelocity, type AiAccuracyState, type AiAimOffset } from './aiAccuracy';
import { clampGunElevation } from './turretAiming';
import type { AllyEffectiveMoveOrder, AllyEngagementPosture, AllyFireOrder, TankData } from './store';
import { audioManager, toAudioVec3 } from './audio';
import { routeDirection } from './navigation';
import { getActiveForest } from './forest';
import { hasLineOfSight } from './spotting';
import { weaponClassOf } from './battleStats';
import { getMatchup } from './aiMatchup';
import { HOLD, HeadingFilter, angleBetween, angledHullHeading, movingFireDispersion, steerTracks, turnInPlace, type TrackCommand } from './aiTactics';

type Trees = ReturnType<typeof useGameStore.getState>['trees'];

/** Per-ally steering memory, so a drive heading does not flicker between answers. */
interface Steering {
  heading: HeadingFilter;
  now: number;
  /** Measured hull turn rate (rad/s), damping the steering. */
  yawRate: number;
}

/**
 * Track command to drive toward `goal` around forests, buildings and other
 * tanks. The pivot rate and the turn while driving both fall off with the
 * remaining angle, so the hull settles on its heading rather than pivoting,
 * lunging off-line and pivoting again.
 */
function driveToward(
  ally: TankData,
  goal: THREE.Vector3,
  speed: number,
  allyDef: ReturnType<typeof getTankDef>,
  buildings: BuildingInstance[],
  trees: Trees,
  allTanks: TankData[],
  steering: Steering,
  ignoreTankIds: string[] = [],
): TrackCommand {
  // Drive around forests rather than into them.
  const routeDir = routeDirection(ally.id, ally.position, goal, getActiveForest(), buildings);
  const moveDir = chooseAvoidanceDirection(
    ally.position,
    steerDirectionAroundBuildings(ally.position, routeDir, buildings, 85, 14),
    ally.id,
    allTanks,
    trees,
    buildings,
    { ignoreTankIds },
  );
  const heading = steering.heading.update(Math.atan2(moveDir.x, moveDir.z), steering.now);
  return steerTracks(ally.rotation, heading, speed, allyDef.trackWidth, false, steering.yawRate);
}

function computeEngagementMovement(
  ally: TankData,
  target: TankData,
  allyDef: ReturnType<typeof getTankDef>,
  buildings: BuildingInstance[],
  trees: Trees,
  allTanks: TankData[],
  steering: Steering,
): TrackCommand {
  // Close to where our gun defeats the target, not to point-blank range.
  const preferredRange = getMatchup(ally.id, ally.tankType, target.tankType).preferredRange;
  const rangeDeadzone = preferredRange * 0.15;
  const distance = ally.position.distanceTo(target.position);
  const bearing = Math.atan2(target.position.x - ally.position.x, target.position.z - ally.position.z);

  if (distance > preferredRange + rangeDeadzone) {
    return driveToward(ally, target.position, allyDef.maxSpeed * 0.5, allyDef, buildings, trees, allTanks, steering, [target.id]);
  }
  if (distance < preferredRange - rangeDeadzone) {
    // Back away with the front still toward the enemy.
    steering.heading.reset();
    return steerTracks(ally.rotation, bearing + Math.PI, allyDef.maxReverseSpeed * 0.5, allyDef.trackWidth, true, steering.yawRate);
  }
  steering.heading.reset();
  return turnInPlace(ally.rotation, angledHullHeading(bearing, ally.rotation), allyDef.trackWidth, steering.yawRate);
}

function computeFireFromPositionMovement(
  ally: TankData,
  target: TankData,
  allyDef: ReturnType<typeof getTankDef>,
  steering: Steering,
) {
  // Hold with the front plate angled to the enemy.
  const bearing = Math.atan2(target.position.x - ally.position.x, target.position.z - ally.position.z);
  return turnInPlace(ally.rotation, angledHullHeading(bearing, ally.rotation), allyDef.trackWidth, steering.yawRate);
}

function computeMoveToPoint(
  ally: TankData,
  destination: THREE.Vector3,
  allyDef: ReturnType<typeof getTankDef>,
  buildings: BuildingInstance[],
  trees: Trees,
  allTanks: TankData[],
  steering: Steering,
): TrackCommand & { arrived: boolean } {
  const distToWp = ally.position.distanceTo(destination);
  if (distToWp <= GAME_CONFIG.ai.moveArrivalDistance) {
    steering.heading.reset();
    return { ...HOLD, arrived: true };
  }
  return { ...driveToward(ally, destination, allyDef.maxSpeed * 0.5, allyDef, buildings, trees, allTanks, steering), arrived: false };
}

// Following allies close up beyond the outer distance and stop inside the
// inner one, so a player creeping about does not start and stop them.
const FOLLOW_STOP = 40;
const FOLLOW_RESUME = 60;

function computeFollowMovement(
  ally: TankData,
  player: TankData,
  allyDef: ReturnType<typeof getTankDef>,
  buildings: BuildingInstance[],
  trees: Trees,
  allTanks: TankData[],
  steering: Steering,
): TrackCommand {
  const distToPlayer = ally.position.distanceTo(player.position);
  const moving = Math.abs(ally.speed) > 0.5;
  if (distToPlayer <= (moving ? FOLLOW_STOP : FOLLOW_RESUME)) {
    steering.heading.reset();
    return HOLD;
  }
  return driveToward(ally, player.position, allyDef.maxSpeed * 0.5, allyDef, buildings, trees, allTanks, steering, [player.id]);
}

export function AllyAI() {
  const lastFireTimes = useRef<{ [id: string]: number }>({});
  const aimOffsets = useRef<Record<string, AiAimOffset>>({});
  const accuracyState = useRef<Record<string, AiAccuracyState>>({});
  const burstStates = useRef<{ [id: string]: { remaining: number; nextFireTime: number } }>({});
  const automaticStates = useRef<{ [id: string]: { magazineRounds: number; nextFireTime: number } }>({});
  // Own line of sight to the engagement target, re-checked on a cadence.
  const sight = useRef<Record<string, { targetId: string; visible: boolean; checkedAt: number }>>({});
  const headings = useRef<Record<string, HeadingFilter>>({});
  const lastRotations = useRef<Record<string, number>>({});
  const targets = useRef<Record<string, string | null>>({});

  useFrame((state, delta) => {
    const store = useGameStore.getState();
      const {
        playerTank: player,
        enemies,
        allies,
        playerSideSpotting,
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
      // Friendly tanks outside the player's command fight on their own (ForceAI).
      if (ally.destroyed || !isCommandable(ally)) return;

      const allyDef = getTankDef(ally.tankType);
      const lastRotation = lastRotations.current[ally.id];
      const yawRate = lastRotation === undefined || delta <= 0 ? 0 : angleBetween(ally.rotation, lastRotation, true) / delta;
      lastRotations.current[ally.id] = ally.rotation;
      const steering: Steering = { heading: headings.current[ally.id] ??= new HeadingFilter(), now, yawRate };
      const waypoint = allyWaypoints[ally.id];
      const moveOrder: AllyEffectiveMoveOrder = waypoint ? 'move' : (allyBaseMoveOrders[ally.id] ?? 'follow');
      const fireOrder: AllyFireOrder = allyFireOrders[ally.id] ?? 'fire-at-will';
      const engagementPosture: AllyEngagementPosture = store.allyEngagementPostures[ally.id] ?? 'fire-from-position';

      // Closest spotted enemy. The current target is kept unless another is
      // clearly nearer, so the hull does not swing between two of them.
      let closestEnemy: typeof enemies[0] | null = null;
      let closestDist = Infinity;
      for (const enemy of enemies) {
        if (enemy.destroyed) continue;
        if (!playerSideSpotting[enemy.id]?.spotted) continue;
        const d = ally.position.distanceTo(enemy.position) * (enemy.id === targets.current[ally.id] ? 0.8 : 1);
        if (d < closestDist) {
          closestDist = d;
          closestEnemy = enemy;
        }
      }
      if (closestEnemy) closestDist = ally.position.distanceTo(closestEnemy.position);
      targets.current[ally.id] = closestEnemy?.id ?? null;

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
      const allTanks = [player, ...enemies, ...allies];

      if (moveOrder === 'move' && waypoint) {
          const moveResult = computeMoveToPoint(ally, new THREE.Vector3(waypoint.x, waypoint.y, waypoint.z), allyDef, buildings, trees, allTanks, steering);
        forwardSpeed = moveResult.forwardSpeed;
        rotationSpeed = moveResult.rotationSpeed;
        leftSpeed = moveResult.leftSpeed;
        rightSpeed = moveResult.rightSpeed;

        if (moveResult.arrived) {
          clearAllyWaypoint(ally.id);
        }
      } else if (moveOrder === 'follow') {
        const followResult = computeFollowMovement(ally, player, allyDef, buildings, trees, allTanks, steering);
        forwardSpeed = followResult.forwardSpeed;
        rotationSpeed = followResult.rotationSpeed;
        leftSpeed = followResult.leftSpeed;
        rightSpeed = followResult.rightSpeed;
      }

      if (engagementTarget && moveOrder !== 'move' && fireOrder === 'fire-at-will') {
        const combatMove = engagementPosture === 'advance-and-fire'
          ? computeEngagementMovement(ally, engagementTarget, allyDef, buildings, trees, allTanks, steering)
          : computeFireFromPositionMovement(ally, engagementTarget, allyDef, steering);
        forwardSpeed = combatMove.forwardSpeed;
        rotationSpeed = combatMove.rotationSpeed;
        leftSpeed = combatMove.leftSpeed;
        rightSpeed = combatMove.rightSpeed;
      } else if (engagementTarget && moveOrder !== 'move' && fireOrder === 'return-fire' && engagementPosture === 'fire-from-position') {
        const combatMove = computeFireFromPositionMovement(ally, engagementTarget, allyDef, steering);
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
      resolveTankCollision(ally.id, newPos, allTanks);
      resolveBuildingCollision(newPos, useGameStore.getState().buildings);
      resolveForestCollision(newPos);

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

      if (closestEnemy && !closestEnemy.destroyed) {
        ensureAiAccuracyState(accuracyState.current, aimOffsets.current, ally.id, closestEnemy.id);
        const aimOff = aimOffsets.current[ally.id];
        const lay = layGun(
          { ...ally, position: newPos, rotation: newRot, pitch, roll } as TankData,
          allyDef, closestEnemy.position, tankVelocity(closestEnemy), aimOff.azimuth, aimOff.elevation,
        );
        normalizedDiff = angleBetween(lay.turret, ally.turretRotation, true);
        if (Math.abs(normalizedDiff) > 0.005) {
          newTurretRot += Math.sign(normalizedDiff) * Math.min(allyDef.turretSpeed * delta, Math.abs(normalizedDiff));
        }

        elevDiff = lay.elevation - ally.gunElevation;
        if (Math.abs(elevDiff) > 0.002) {
          newGunElev += Math.sign(elevDiff) * Math.min(allyDef.gunSpeed * delta, Math.abs(elevDiff));
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

      // Fire only at a target this crew can see for itself.
      let los = sight.current[ally.id];
      if (!los || los.targetId !== engagementTarget.id || now - los.checkedAt > GAME_CONFIG.ai.fireLosIntervalMs) {
        los = { targetId: engagementTarget.id, visible: hasLineOfSight(ally, engagementTarget, trees, buildings).visible, checkedAt: now };
        sight.current[ally.id] = los;
      }
      if (!los.visible) return;

      // Fire logic
      const fireAllyRound = () => {
        const aiTank = { position: newPos, rotation: newRot, pitch, roll, turretRotation: newTurretRot, gunElevation: newGunElev } as TankData;
        const { pos, dir } = computeMuzzleAndDirection(aiTank, allyDef, { turretSwayOffset: 0, gunSwayOffset: 0 });
        const shotsOnTarget = engagementTarget ? ensureAiAccuracyState(accuracyState.current, aimOffsets.current, ally.id, engagementTarget.id).shotsOnTarget : 0;
        const gunDisp = allyDef.weapons.AP.dispersion || 0;
        const fireDisp = getAiFireDispersion(shotsOnTarget) + gunDisp + movingFireDispersion(forwardSpeed, allyDef.maxSpeed);
        applyDispersion(dir, fireDisp);

        const velocity = dir.clone().multiplyScalar(allyDef.weapons.AP.velocity);
        fireProjectile(pos, velocity, 'AP', allyDef.weapons.AP, allyDef.weapons.AP.damage, ally.id, allyDef.caliber, weaponClassOf(allyDef));
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
