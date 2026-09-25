import { useFrame } from '@react-three/fiber';
import { useGameStore, MAP_SIZE_VALUES } from './store';
import * as THREE from 'three';
import { useRef } from 'react';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { steerDirectionAroundBuildings } from './buildings';
import { chooseAvoidanceDirection, resolveTankCollision, resolveTreeCollision, resolveBuildingCollision, resolveForestCollision } from './collision';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, computeBodyRock, computeGravityDrop } from './tankPhysics';
import { computeMuzzleAndDirection, applyDispersion } from './firing';
import { ensureAiAccuracyState, getAiFireDispersion, registerAiShot, type AiAccuracyState, type AiAimOffset } from './aiAccuracy';
import { clampGunElevation } from './turretAiming';
import type { TankData } from './store';
import { audioManager, toAudioVec3 } from './audio';
import { routeDirection } from './navigation';
import { getActiveForest } from './forest';
import { hasLineOfSight } from './spotting';
import { canHurtAt, getMatchup } from './aiMatchup';
import {
  HOLD,
  HeadingFilter,
  angleBetween,
  angledHullHeading,
  chooseFightingPosition,
  movingFireDispersion,
  steerTracks,
  turnInPlace,
  type PositionIntent,
  type TrackCommand,
} from './aiTactics';

/** What one enemy crew is doing and has seen, kept between frames. */
interface EnemyMind {
  targetId: string | null;
  /** Where the tank is driving to fight from or hide in. */
  goal: THREE.Vector3 | null;
  intent: PositionIntent | 'search' | null;
  plannedAt: number;
  /** Own line of sight to the target (the side's spotting may come from another tank). */
  seesTarget: boolean;
  losCheckedAt: number;
  lastSeenTargetAt: number;
  /** Stopped to fire until this time. */
  haltUntil: number;
  /** alertedAt as last seen, to notice a fresh hit. */
  lastAlertAt: number;
  /** The leg being driven: its end, and whether it is driven in reverse (decided once per leg). */
  leg: { goal: THREE.Vector3; reverse: boolean } | null;
  heading: HeadingFilter;
  /**
   * Headway, to notice a tank that is stuck or turning on the spot: the
   * nearest it has come to the leg's end, where it stood, and when either
   * last improved. A detour round a wood moves the tank without bringing
   * it closer, so moving counts as well.
   */
  progressDistance: number;
  progressPos: THREE.Vector3;
  progressAt: number;
  stuckCount: number;
  /** Backing off an obstacle until this time. */
  unstickUntil: number;
  /** Hull heading last frame, to measure the turn rate. */
  lastRotation: number | null;
}

interface KnownPosition {
  position: THREE.Vector3;
  at: number;
}

const createMind = (): EnemyMind => ({
  targetId: null,
  goal: null,
  intent: null,
  plannedAt: 0,
  seesTarget: false,
  losCheckedAt: 0,
  lastSeenTargetAt: 0,
  haltUntil: 0,
  lastAlertAt: 0,
  leg: null,
  heading: new HeadingFilter(),
  progressDistance: Infinity,
  progressPos: new THREE.Vector3(),
  progressAt: 0,
  stuckCount: 0,
  unstickUntil: 0,
  lastRotation: null,
});

const xzDistance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const bearing = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
/** A leg this short and pointing more than this far from the enemy is backed down, front to the gun. */
const REVERSE_LEG_MAX = 80;
const REVERSE_LEG_ANGLE = THREE.MathUtils.degToRad(110);

export function EnemyAI() {
  const lastFireTimes = useRef<{ [id: string]: number }>({});
  const aimOffsets = useRef<Record<string, AiAimOffset>>({});
  const accuracyState = useRef<Record<string, AiAccuracyState>>({});
  const burstStates = useRef<{ [id: string]: { remaining: number; nextFireTime: number } }>({});
  const automaticStates = useRef<{ [id: string]: { magazineRounds: number; nextFireTime: number } }>({});
  const minds = useRef<Record<string, EnemyMind>>({});
  // Last reported position of each of our enemies, shared by the whole side.
  const lastKnown = useRef<Record<string, KnownPosition>>({});
  const battle = useRef('');

  useFrame((state, delta) => {
    const {
      playerTank: player,
      enemies,
      allies,
      buildings,
      trees,
      mapSize,
      enemySideSpotting,
      enemyWaypoints,
      clearEnemyWaypoint,
      updateEnemy,
      fireProjectile,
    } = useGameStore.getState();

    const now = Date.now();
    const tactics = GAME_CONFIG.ai.tactics;
    const halfMap = MAP_SIZE_VALUES[mapSize] / 2;
    const forest = getActiveForest();
    const friendlyTargets = [player, ...allies].filter((t) => !t.destroyed);
    const allTanks = [player, ...enemies, ...allies];
    // Choosing a position casts a few dozen terrain rays: one tank per frame.
    let planBudget = 1;

    const battleKey = enemies.map((e) => e.id).join();
    if (battle.current !== battleKey) {
      battle.current = battleKey;
      minds.current = {};
      lastKnown.current = {};
    }

    for (const friendly of friendlyTargets) {
      if (enemySideSpotting[friendly.id]?.spotted) {
        lastKnown.current[friendly.id] = { position: friendly.position.clone(), at: now };
      }
    }

    enemies.forEach((enemy) => {
      if (enemy.destroyed) return;

      const mind = minds.current[enemy.id] ??= createMind();
      const enemyDef = getTankDef(enemy.tankType);
      const yawRate = mind.lastRotation === null || delta <= 0 ? 0 : angleBetween(enemy.rotation, mind.lastRotation, true) / delta;
      mind.lastRotation = enemy.rotation;

      /**
       * Track command to drive toward `goal`. Whether the leg is driven in
       * reverse (a short move away from the enemy at `enemyBearing`) is
       * settled when the leg starts, and the heading is filtered, so the
       * tank does not swing between two answers on the spot. Returns null
       * once the tank has made no headway toward the goal for a while.
       */
      const driveTo = (goal: THREE.Vector3, speed: number, enemyBearing: number | null, ignoreTankIds: string[] = []): TrackCommand | null => {
        const goalDistance = xzDistance(enemy.position, goal);
        if (!mind.leg || xzDistance(mind.leg.goal, goal) > 2) {
          const bearingToGoal = bearing(enemy.position, goal);
          mind.leg = {
            goal: goal.clone(),
            // Only when the hull already has its back to the goal: a tank
            // facing the goal would first swing a half turn on the spot.
            reverse: enemyBearing !== null && goalDistance < REVERSE_LEG_MAX
              && angleBetween(bearingToGoal, enemyBearing) > REVERSE_LEG_ANGLE
              && angleBetween(bearingToGoal, enemy.rotation) > Math.PI / 2,
          };
          mind.heading.reset();
          mind.progressDistance = goalDistance;
          mind.progressPos.copy(enemy.position);
          mind.progressAt = now;
        }
        if (goalDistance < mind.progressDistance - 3 || xzDistance(enemy.position, mind.progressPos) > 8 || now < mind.haltUntil) {
          mind.progressDistance = Math.min(mind.progressDistance, goalDistance);
          mind.progressPos.copy(enemy.position);
          mind.progressAt = now;
        } else if (now - mind.progressAt > tactics.stuckMs) {
          mind.stuckCount++;
          mind.unstickUntil = now + 2500;
          mind.leg = null;
          return null;
        }
        if (mind.leg.reverse) {
          const heading = mind.heading.update(bearing(enemy.position, goal), now);
          return steerTracks(enemy.rotation, heading, enemyDef.maxReverseSpeed * 0.8, enemyDef.trackWidth, true, yawRate);
        }
        const routeDir = routeDirection(enemy.id, enemy.position, goal, forest, buildings);
        const moveDir = chooseAvoidanceDirection(
          enemy.position,
          steerDirectionAroundBuildings(enemy.position, routeDir, buildings, 90, 14),
          enemy.id,
          allTanks,
          trees,
          buildings,
          { ignoreTankIds },
        );
        const heading = mind.heading.update(Math.atan2(moveDir.x, moveDir.z), now);
        return steerTracks(enemy.rotation, heading, speed, enemyDef.trackWidth, false, yawRate);
      };
      const stopDriving = () => {
        mind.leg = null;
      };

      // A fresh hit: the crew saw roughly where it came from.
      const wasHit = !!enemy.alertedAt && enemy.alertedAt !== mind.lastAlertAt;
      mind.lastAlertAt = enemy.alertedAt ?? 0;
      const alertActive = !!enemy.alertedBy && !!enemy.alertedAt &&
        (now - enemy.alertedAt) < GAME_CONFIG.ai.alertDecayTime;
      const attacker = alertActive ? friendlyTargets.find((t) => t.id === enemy.alertedBy) : undefined;
      if (wasHit && attacker) lastKnown.current[attacker.id] = { position: attacker.position.clone(), at: now };

      // Pick the target that matters most: near for our gun, able to kill
      // us, the one that just hit us, or the one we are already fighting.
      let target: TankData | null = null;
      let dist = Infinity;
      let bestScore = Infinity;
      for (const friendly of friendlyTargets) {
        const isAttacker = friendly === attacker;
        if (!enemySideSpotting[friendly.id]?.spotted && !isAttacker) continue;
        const d = enemy.position.distanceTo(friendly.position);
        if (d > GAME_CONFIG.ai.detectionDistance && !isAttacker) continue;
        const m = getMatchup(enemy.id, enemy.tankType, friendly.tankType);
        let score = d / m.preferredRange;
        if (!canHurtAt(m, d)) score += 1;
        if (d < m.threatRange) score -= 0.4;
        if (isAttacker) score -= 0.6;
        if (friendly.id === mind.targetId) score -= 0.3;
        if (score < bestScore) {
          bestScore = score;
          target = friendly;
          dist = d;
        }
      }

      let command: TrackCommand = HOLD;
      let aimAt: THREE.Vector3 | null = null;
      const matchup = target ? getMatchup(enemy.id, enemy.tankType, target.tankType) : null;

      if (target && matchup) {
        aimAt = target.position;
        if (mind.targetId !== target.id) {
          mind.targetId = target.id;
          mind.goal = null;
          mind.losCheckedAt = 0;
          mind.lastSeenTargetAt = now;
        }
        if (now - mind.losCheckedAt > GAME_CONFIG.ai.fireLosIntervalMs) {
          mind.seesTarget = hasLineOfSight(enemy, target, trees, buildings).visible;
          mind.losCheckedAt = now;
          if (mind.seesTarget) mind.lastSeenTargetAt = now;
        }

        // Badly hurt by an enemy that can finish us from here: break contact.
        const withdraw = enemy.health / enemy.maxHealth < tactics.withdrawHealth && dist < matchup.threatRange * 1.1;
        const intent: PositionIntent = withdraw ? 'withdraw' : 'engage';
        const atGoal = mind.goal !== null && xzDistance(enemy.position, mind.goal) < tactics.goalReached;
        const sincePlan = now - mind.plannedAt;
        const blind = now - mind.lastSeenTargetAt > tactics.blindReplanMs;
        const needPlan = mind.goal === null
          || mind.intent !== intent
          || (wasHit && intent === 'engage' && matchup.role !== 'assault')
          || (intent === 'engage' && atGoal && blind && sincePlan > tactics.blindReplanMs)
          || (intent === 'engage' && sincePlan > tactics.replanIntervalMs * (atGoal ? 1 : 2));
        if (needPlan && planBudget > 0) {
          planBudget--;
          mind.goal = chooseFightingPosition({
            self: enemy,
            target,
            matchup,
            intent,
            trees,
            buildings,
            halfMap,
            // Shoot and scoot: a tank that has been hit where it stands moves on.
            leaveCurrent: wasHit || (blind && atGoal),
          });
          mind.intent = intent;
          mind.plannedAt = now;
        }

        const bearingToTarget = bearing(enemy.position, target.position);
        if (dist < 45) {
          // Far too close for a gun duel: back off, front still to the enemy.
          stopDriving();
          command = steerTracks(enemy.rotation, bearingToTarget + Math.PI, enemyDef.maxReverseSpeed * 0.8, enemyDef.trackWidth, true, yawRate);
        } else if (mind.goal && xzDistance(enemy.position, mind.goal) > tactics.goalReached) {
          const speed = enemyDef.maxSpeed * (intent === 'withdraw' ? 0.85 : 0.65);
          const drive = driveTo(mind.goal, speed, bearingToTarget, [target.id]);
          if (drive === null) mind.goal = null; // cannot get there: choose again
          else command = now < mind.haltUntil ? HOLD : drive;
        } else {
          // In position: angle the front plate to the enemy.
          stopDriving();
          command = turnInPlace(enemy.rotation, angledHullHeading(bearingToTarget, enemy.rotation), enemyDef.trackWidth, yawRate);
        }
      } else {
        mind.targetId = null;
        mind.seesTarget = false;
        // Nothing in sight: hunt where the enemy was last reported, else
        // carry on to the waypoint given at deployment, else hold.
        let memoryId: string | null = null;
        let memory: KnownPosition | null = null;
        for (const [id, known] of Object.entries(lastKnown.current)) {
          if (now - known.at > tactics.searchMemoryMs) continue;
          if (!memory || enemy.position.distanceTo(known.position) < enemy.position.distanceTo(memory.position)) {
            memory = known;
            memoryId = id;
          }
        }
        if (memory && memoryId && xzDistance(enemy.position, memory.position) < 60) {
          // Nobody here any more.
          delete lastKnown.current[memoryId];
          memory = null;
        }
        const role = getMatchup(enemy.id, enemy.tankType, player.tankType).role;
        const waypoint = enemyWaypoints[enemy.id];
        if (memory && memoryId && (role !== 'overwatch' || wasHit)) {
          aimAt = memory.position;
          mind.intent = 'search';
          const drive = driveTo(memory.position, enemyDef.maxSpeed * 0.5, null);
          if (drive === null) delete lastKnown.current[memoryId];
          else command = drive;
        } else if (waypoint) {
          const point = new THREE.Vector3(waypoint.x, waypoint.y, waypoint.z);
          if (xzDistance(enemy.position, point) < tactics.waypointReached) {
            clearEnemyWaypoint(enemy.id);
            stopDriving();
          } else {
            mind.intent = 'search';
            const drive = driveTo(point, enemyDef.maxSpeed * 0.45, null);
            // A waypoint the tank keeps failing to reach is given up.
            if (drive === null && mind.stuckCount >= 3) clearEnemyWaypoint(enemy.id);
            else if (drive) command = drive;
          }
        } else {
          stopDriving();
          if (memory) aimAt = memory.position;
        }
      }

      // Stuck: back off at an angle before trying again.
      if (now < mind.unstickUntil) {
        command = steerTracks(enemy.rotation, enemy.rotation + Math.PI + 0.6, enemyDef.maxReverseSpeed, enemyDef.trackWidth, true);
      }

      let { forwardSpeed, rotationSpeed, leftSpeed, rightSpeed } = command;
      let newRot = enemy.rotation;
      let newPos = enemy.position.clone();

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
      resolveTankCollision(enemy.id, newPos, allTanks);
      resolveBuildingCollision(newPos, buildings);
      resolveForestCollision(newPos);

      // Tree collision
      const treeResult = resolveTreeCollision(newPos, forwardSpeed, trees);
      if (treeResult.knockedTreeIndex !== null) {
        const idx = treeResult.knockedTreeIndex;
        const tree = trees[idx];
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

      // Lay the gun on the target, or on where the enemy was last reported.
      let newTurretRot = enemy.turretRotation;
      let newGunElev = enemy.gunElevation;
      let normalizedDiff = Infinity;
      let elevDiff = Infinity;
      const accuracy = target ? ensureAiAccuracyState(accuracyState.current, aimOffsets.current, enemy.id, target.id) : null;
      if (aimAt) {
        const aimOff = target ? aimOffsets.current[enemy.id] : { azimuth: 0, elevation: 0 };
        const aimDistance = enemy.position.distanceTo(aimAt);
        const targetRotation = Math.atan2(aimAt.x - enemy.position.x, aimAt.z - enemy.position.z) + aimOff.azimuth;
        normalizedDiff = Math.atan2(Math.sin(targetRotation - (newRot + enemy.turretRotation)), Math.cos(targetRotation - (newRot + enemy.turretRotation)));
        if (Math.abs(normalizedDiff) > 0.005) {
          newTurretRot += Math.sign(normalizedDiff) * Math.min(enemyDef.turretSpeed * delta, Math.abs(normalizedDiff));
        }

        // Gun elevation with gravity compensation
        const drop = computeGravityDrop(aimDistance, enemyDef.weapons.AP.velocity);
        const targetElev = -Math.atan2(aimAt.y + 1.5 + drop - (enemy.position.y + 1.6), aimDistance) + aimOff.elevation;
        elevDiff = targetElev - enemy.gunElevation;
        if (Math.abs(elevDiff) > 0.002) {
          newGunElev += Math.sign(elevDiff) * Math.min(enemyDef.gunSpeed * delta, Math.abs(elevDiff));
        }
        newGunElev = clampGunElevation(newGunElev, enemyDef.minGunElevation, enemyDef.maxGunElevation);
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

      // Fire only at a target this crew can see for itself.
      if (!target || !accuracy || !mind.seesTarget) return;
      if (
        Math.abs(normalizedDiff) >= GAME_CONFIG.ai.fireTurretThreshold ||
        Math.abs(elevDiff) >= GAME_CONFIG.ai.fireElevationThreshold
      ) return;

      const firesSingly = !enemyDef.automaticMagazineSize && !(enemyDef.burstCount && enemyDef.burstCount > 1);
      if (firesSingly && matchup && matchup.role !== 'overwatch' && Math.abs(forwardSpeed) > 1) {
        // Short halt: stop, then fire, rather than waste the round on the move.
        const reloaded = now - (lastFireTimes.current[enemy.id] || 0) > enemyDef.reloadTime;
        if (reloaded && now >= mind.haltUntil) mind.haltUntil = now + tactics.shortHaltMs;
        if (now < mind.haltUntil) return;
      }

      // Helper: fire one round from this enemy
      const fireEnemyRound = () => {
        const aiTank = { position: newPos, rotation: newRot, pitch, roll, turretRotation: newTurretRot, gunElevation: newGunElev } as TankData;
        const { pos, dir } = computeMuzzleAndDirection(aiTank, enemyDef, { turretSwayOffset: 0, gunSwayOffset: 0 });
        const gunDisp = enemyDef.weapons.AP.dispersion || 0;
        const fireDisp = getAiFireDispersion(accuracy.shotsOnTarget) + gunDisp + movingFireDispersion(forwardSpeed, enemyDef.maxSpeed);
        applyDispersion(dir, fireDisp);

        const velocity = dir.clone().multiplyScalar(enemyDef.weapons.AP.velocity);
        fireProjectile(pos, velocity, 'AP', enemyDef.weapons.AP, enemyDef.weapons.AP.damage, enemy.id, enemyDef.caliber);
        updateEnemy(enemy.id, { lastFireTime: now });
        registerAiShot(accuracyState.current, aimOffsets.current, enemy.id, target.id);
        audioManager.playShot({
          source: 'enemy',
          position: toAudioVec3(pos),
          caliber: enemyDef.caliber,
          burst: !!enemyDef.burstCount || !!enemyDef.automaticMagazineSize,
        });
      };

      if (enemyDef.automaticMagazineSize && enemyDef.automaticFireInterval) {
        const automatic = automaticStates.current[enemy.id] ?? {
          magazineRounds: enemyDef.automaticMagazineSize,
          nextFireTime: 0,
        };
        automaticStates.current[enemy.id] = automatic;

        if (automatic.magazineRounds <= 0) {
          const reloadStartedAt = lastFireTimes.current[enemy.id] || 0;
          if (now - reloadStartedAt <= enemyDef.reloadTime) return;
          automatic.magazineRounds = enemyDef.automaticMagazineSize;
        }

        if (now < automatic.nextFireTime) return;

        fireEnemyRound();
        automatic.magazineRounds--;
        if (automatic.magazineRounds > 0) {
          automatic.nextFireTime = now + enemyDef.automaticFireInterval;
        } else {
          automatic.nextFireTime = 0;
          lastFireTimes.current[enemy.id] = now;
        }
      } else {
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
        } else {
          const lastFire = lastFireTimes.current[enemy.id] || 0;
          if (now - lastFire > enemyDef.reloadTime + Math.random() * 3000) {
            fireEnemyRound();
            mind.haltUntil = Math.min(mind.haltUntil, now + 600);

            if (enemyDef.burstCount && enemyDef.burstCount > 1 && enemyDef.burstInterval) {
              burstStates.current[enemy.id] = {
                remaining: enemyDef.burstCount - 1,
                nextFireTime: now + enemyDef.burstInterval,
              };
            } else {
              lastFireTimes.current[enemy.id] = now;
            }
          }
        }
      }
    });
  });

  return null;
}
