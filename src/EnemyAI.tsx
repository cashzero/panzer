import { useFrame } from '@react-three/fiber';
import { useGameStore, MAP_SIZE_VALUES, isCommandable } from './store';
import * as THREE from 'three';
import { useRef } from 'react';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { steerDirectionAroundBuildings } from './buildings';
import { chooseAvoidanceDirection, resolveTankCollision, resolveTreeCollision, resolveBuildingCollision, resolveForestCollision, resolveHedgeCrush } from './collision';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, computeBodyRock } from './tankPhysics';
import { computeMuzzleAndDirection, applyDispersion } from './firing';
import { ensureAiAccuracyState, getAiFireDispersion, layGun, registerAiShot, tankVelocity, type AiAccuracyState, type AiAimOffset } from './aiAccuracy';
import { clampGunElevation } from './turretAiming';
import { clampTraverse } from './traverseLimit';
import type { TankData } from './store';
import { audioManager, toAudioVec3 } from './audio';
import { routeDirection } from './navigation';
import { getActiveForest } from './forest';
import { hasLineOfSight } from './spotting';
import { weaponClassOf } from './battleStats';
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

/** What one crew is doing and has seen, kept between frames. */
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

/** A force that fights on its own: the enemy, or friendly tanks outside the player's command. */
export type AutonomousForce = 'enemy' | 'friendly';

/**
 * Drives every tank of an autonomous force: target choice, fighting
 * positions, default waypoints, gun laying and fire. Wingmen under the
 * player's orders are driven by AllyAI instead.
 */
export function ForceAI({ force }: { force: AutonomousForce }) {
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
      playerSideSpotting,
      aiWaypoints,
      clearAiWaypoint,
      updateEnemy,
      updateAlly,
      fireProjectile,
    } = useGameStore.getState();

    const now = Date.now();
    const tactics = GAME_CONFIG.ai.tactics;
    const halfMap = MAP_SIZE_VALUES[mapSize] / 2;
    const forest = getActiveForest();
    const units = force === 'enemy' ? enemies : allies.filter((ally) => !isCommandable(ally));
    const opponents = (force === 'enemy' ? [player, ...allies] : enemies).filter((t) => !t.destroyed);
    // What this force's side has spotted of the other.
    const spotting = force === 'enemy' ? enemySideSpotting : playerSideSpotting;
    const updateUnit = force === 'enemy' ? updateEnemy : updateAlly;
    // The opponent a tank expects to meet decides its part before contact.
    const reference = force === 'enemy' ? player : enemies.find((e) => !e.destroyed) ?? enemies[0];
    const allTanks = [player, ...enemies, ...allies];
    // Choosing a position casts a few dozen terrain rays: one tank per frame.
    let planBudget = 1;

    const battleKey = units.map((u) => u.id).join();
    if (battle.current !== battleKey) {
      battle.current = battleKey;
      minds.current = {};
      lastKnown.current = {};
    }

    for (const opponent of opponents) {
      if (spotting[opponent.id]?.spotted) {
        lastKnown.current[opponent.id] = { position: opponent.position.clone(), at: now };
      }
    }

    units.forEach((tank) => {
      if (tank.destroyed) return;

      const mind = minds.current[tank.id] ??= createMind();
      const def = getTankDef(tank.tankType);
      const yawRate = mind.lastRotation === null || delta <= 0 ? 0 : angleBetween(tank.rotation, mind.lastRotation, true) / delta;
      mind.lastRotation = tank.rotation;

      /**
       * Track command to drive toward `goal`. Whether the leg is driven in
       * reverse (a short move away from the enemy at `enemyBearing`) is
       * settled when the leg starts, and the heading is filtered, so the
       * tank does not swing between two answers on the spot. Returns null
       * once the tank has made no headway toward the goal for a while.
       */
      const driveTo = (goal: THREE.Vector3, speed: number, enemyBearing: number | null, ignoreTankIds: string[] = []): TrackCommand | null => {
        const goalDistance = xzDistance(tank.position, goal);
        if (!mind.leg || xzDistance(mind.leg.goal, goal) > 2) {
          const bearingToGoal = bearing(tank.position, goal);
          mind.leg = {
            goal: goal.clone(),
            // Only when the hull already has its back to the goal: a tank
            // facing the goal would first swing a half turn on the spot.
            reverse: enemyBearing !== null && goalDistance < REVERSE_LEG_MAX
              && angleBetween(bearingToGoal, enemyBearing) > REVERSE_LEG_ANGLE
              && angleBetween(bearingToGoal, tank.rotation) > Math.PI / 2,
          };
          mind.heading.reset();
          mind.progressDistance = goalDistance;
          mind.progressPos.copy(tank.position);
          mind.progressAt = now;
        }
        if (goalDistance < mind.progressDistance - 3 || xzDistance(tank.position, mind.progressPos) > 8 || now < mind.haltUntil) {
          mind.progressDistance = Math.min(mind.progressDistance, goalDistance);
          mind.progressPos.copy(tank.position);
          mind.progressAt = now;
        } else if (now - mind.progressAt > tactics.stuckMs) {
          mind.stuckCount++;
          mind.unstickUntil = now + 2500;
          mind.leg = null;
          return null;
        }
        if (mind.leg.reverse) {
          const heading = mind.heading.update(bearing(tank.position, goal), now);
          return steerTracks(tank.rotation, heading, def.maxReverseSpeed * 0.8, def.trackWidth, true, yawRate);
        }
        const routeDir = routeDirection(tank.id, tank.position, goal, forest, buildings);
        const moveDir = chooseAvoidanceDirection(
          tank.position,
          steerDirectionAroundBuildings(tank.position, routeDir, buildings, 90, 14),
          tank.id,
          allTanks,
          trees,
          buildings,
          { ignoreTankIds },
        );
        const heading = mind.heading.update(Math.atan2(moveDir.x, moveDir.z), now);
        return steerTracks(tank.rotation, heading, speed, def.trackWidth, false, yawRate);
      };
      const stopDriving = () => {
        mind.leg = null;
      };

      // A fresh hit: the crew saw roughly where it came from.
      const wasHit = !!tank.alertedAt && tank.alertedAt !== mind.lastAlertAt;
      mind.lastAlertAt = tank.alertedAt ?? 0;
      const alertActive = !!tank.alertedBy && !!tank.alertedAt &&
        (now - tank.alertedAt) < GAME_CONFIG.ai.alertDecayTime;
      const attacker = alertActive ? opponents.find((t) => t.id === tank.alertedBy) : undefined;
      if (wasHit && attacker) lastKnown.current[attacker.id] = { position: attacker.position.clone(), at: now };

      // Pick the target that matters most: near for our gun, able to kill
      // us, the one that just hit us, or the one we are already fighting.
      let target: TankData | null = null;
      let dist = Infinity;
      let bestScore = Infinity;
      for (const opponent of opponents) {
        const isAttacker = opponent === attacker;
        if (!spotting[opponent.id]?.spotted && !isAttacker) continue;
        const d = tank.position.distanceTo(opponent.position);
        if (d > GAME_CONFIG.ai.detectionDistance && !isAttacker) continue;
        const m = getMatchup(tank.id, tank.tankType, opponent.tankType);
        let score = d / m.preferredRange;
        if (!canHurtAt(m, d)) score += 1;
        if (d < m.threatRange) score -= 0.4;
        if (isAttacker) score -= 0.6;
        if (opponent.id === mind.targetId) score -= 0.3;
        if (score < bestScore) {
          bestScore = score;
          target = opponent;
          dist = d;
        }
      }

      let command: TrackCommand = HOLD;
      let aimAt: THREE.Vector3 | null = null;
      const matchup = target ? getMatchup(tank.id, tank.tankType, target.tankType) : null;

      if (target && matchup) {
        aimAt = target.position;
        if (mind.targetId !== target.id) {
          mind.targetId = target.id;
          mind.goal = null;
          mind.losCheckedAt = 0;
          mind.lastSeenTargetAt = now;
        }
        if (now - mind.losCheckedAt > GAME_CONFIG.ai.fireLosIntervalMs) {
          mind.seesTarget = hasLineOfSight(tank, target, trees, buildings).visible;
          mind.losCheckedAt = now;
          if (mind.seesTarget) mind.lastSeenTargetAt = now;
        }

        // Badly hurt by an enemy that can finish us from here: break contact.
        const withdraw = tank.health / tank.maxHealth < tactics.withdrawHealth && dist < matchup.threatRange * 1.1;
        const intent: PositionIntent = withdraw ? 'withdraw' : 'engage';
        const atGoal = mind.goal !== null && xzDistance(tank.position, mind.goal) < tactics.goalReached;
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
            self: tank,
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

        const bearingToTarget = bearing(tank.position, target.position);
        if (dist < 45) {
          // Far too close for a gun duel: back off, front still to the enemy.
          stopDriving();
          command = steerTracks(tank.rotation, bearingToTarget + Math.PI, def.maxReverseSpeed * 0.8, def.trackWidth, true, yawRate);
        } else if (mind.goal && xzDistance(tank.position, mind.goal) > tactics.goalReached) {
          const speed = def.maxSpeed * (intent === 'withdraw' ? 0.85 : 0.65);
          const drive = driveTo(mind.goal, speed, bearingToTarget, [target.id]);
          if (drive === null) mind.goal = null; // cannot get there: choose again
          else command = now < mind.haltUntil ? HOLD : drive;
        } else {
          // In position: angle the front plate to the enemy.
          stopDriving();
          command = turnInPlace(tank.rotation, angledHullHeading(bearingToTarget, tank.rotation, def.traverseLimit), def.trackWidth, yawRate);
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
          if (!memory || tank.position.distanceTo(known.position) < tank.position.distanceTo(memory.position)) {
            memory = known;
            memoryId = id;
          }
        }
        if (memory && memoryId && xzDistance(tank.position, memory.position) < 60) {
          // Nobody here any more.
          delete lastKnown.current[memoryId];
          memory = null;
        }
        const role = reference ? getMatchup(tank.id, tank.tankType, reference.tankType).role : 'assault';
        const waypoint = aiWaypoints[tank.id];
        if (memory && memoryId && (role !== 'overwatch' || wasHit)) {
          aimAt = memory.position;
          mind.intent = 'search';
          const drive = driveTo(memory.position, def.maxSpeed * 0.5, null);
          if (drive === null) delete lastKnown.current[memoryId];
          else command = drive;
        } else if (waypoint) {
          const point = new THREE.Vector3(waypoint.x, waypoint.y, waypoint.z);
          if (xzDistance(tank.position, point) < tactics.waypointReached) {
            clearAiWaypoint(tank.id);
            stopDriving();
          } else {
            mind.intent = 'search';
            const drive = driveTo(point, def.maxSpeed * 0.45, null);
            // A waypoint the tank keeps failing to reach is given up.
            if (drive === null && mind.stuckCount >= 3) clearAiWaypoint(tank.id);
            else if (drive) command = drive;
          }
        } else {
          stopDriving();
          if (memory) aimAt = memory.position;
        }
      }

      // Stuck: back off at an angle before trying again.
      if (now < mind.unstickUntil) {
        command = steerTracks(tank.rotation, tank.rotation + Math.PI + 0.6, def.maxReverseSpeed, def.trackWidth, true);
      }

      let { forwardSpeed, rotationSpeed, leftSpeed, rightSpeed } = command;
      let newRot = tank.rotation;
      let newPos = tank.position.clone();

      // Track damage: destroyed tracks cannot move
      if (tank.trackDestroyed?.left) leftSpeed = 0;
      if (tank.trackDestroyed?.right) rightSpeed = 0;

      // Derive actual movement from track speeds
      if (tank.trackDestroyed?.left && tank.trackDestroyed?.right) {
        forwardSpeed = 0;
        rotationSpeed = 0;
      } else if (tank.trackDestroyed?.left) {
        forwardSpeed = 0;
        rotationSpeed = rightSpeed > 0 ? -0.5 : rightSpeed < 0 ? 0.5 : 0;
      } else if (tank.trackDestroyed?.right) {
        forwardSpeed = 0;
        rotationSpeed = leftSpeed > 0 ? 0.5 : leftSpeed < 0 ? -0.5 : 0;
      } else {
        const prevRotSpeed = ((tank.rightTrackSpeed || 0) - (tank.leftTrackSpeed || 0)) / def.trackWidth;
        const mov = computeTrackMovement(leftSpeed, rightSpeed, newPos, newRot, delta, def.trackWidth, def.turnRateLimit, prevRotSpeed, def.rotationalInertia);
        newPos = mov.position;
        newRot = mov.rotation;
        forwardSpeed = mov.forwardSpeed;
        rotationSpeed = mov.rotationSpeed;
      }

      if (tank.trackDestroyed?.left || tank.trackDestroyed?.right) {
        // Single/no track: apply manual rotation only
        newRot += rotationSpeed * delta;
      }

      // Snap to terrain
      newPos.y = getTerrainHeight(newPos.x, newPos.z);

      // Tank-tank collision
      resolveTankCollision(tank.id, newPos, allTanks);
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
      const hedgeBreak = resolveHedgeCrush(newPos, forwardSpeed);
      if (hedgeBreak) {
        useGameStore.getState().spawnParticle('hedge_crush', new THREE.Vector3(hedgeBreak.x, getTerrainHeight(hedgeBreak.x, hedgeBreak.z) + 0.8, hedgeBreak.z), new THREE.Vector3(0, 1, 0));
      }

      newPos.y = getTerrainHeight(newPos.x, newPos.z);

      // Calculate pitch and roll based on terrain
      const orientation = computeTerrainOrientation(newPos, newRot, def.trackWidth);
      const bodyRock = computeBodyRock(forwardSpeed, def.maxSpeed, rotationSpeed, state.clock.elapsedTime);
      const pitch = orientation.pitch + bodyRock.pitchOffset;
      const roll = orientation.roll + bodyRock.rollOffset;
      newPos.y = orientation.adjustedY + bodyRock.yOffset;

      // Lay the gun on the target, or on where the enemy was last reported.
      let newTurretRot = tank.turretRotation;
      let newGunElev = tank.gunElevation;
      let normalizedDiff = Infinity;
      let elevDiff = Infinity;
      const accuracy = target ? ensureAiAccuracyState(accuracyState.current, aimOffsets.current, tank.id, target.id) : null;
      if (aimAt) {
        const aimOff = target ? aimOffsets.current[tank.id] : { azimuth: 0, elevation: 0 };
        const lay = layGun(
          { ...tank, position: newPos, rotation: newRot, pitch, roll } as TankData,
          def, aimAt, target ? tankVelocity(target) : null, aimOff.azimuth, aimOff.elevation,
        );
        // The error to the lay decides firing; the gun only travels as far as its arc allows.
        normalizedDiff = angleBetween(lay.turret, tank.turretRotation, true);
        const travel = angleBetween(clampTraverse(lay.turret, def.traverseLimit), tank.turretRotation, true);
        if (Math.abs(travel) > 0.005) {
          newTurretRot += Math.sign(travel) * Math.min(def.turretSpeed * delta, Math.abs(travel));
        }
        newTurretRot = clampTraverse(newTurretRot, def.traverseLimit);
        elevDiff = lay.elevation - tank.gunElevation;
        if (Math.abs(elevDiff) > 0.002) {
          newGunElev += Math.sign(elevDiff) * Math.min(def.gunSpeed * delta, Math.abs(elevDiff));
        }
        newGunElev = clampGunElevation(newGunElev, def.minGunElevation, def.maxGunElevation);
      }

      updateUnit(tank.id, {
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

      const firesSingly = !def.automaticMagazineSize && !(def.burstCount && def.burstCount > 1);
      if (firesSingly && matchup && matchup.role !== 'overwatch' && Math.abs(forwardSpeed) > 1) {
        // Short halt: stop, then fire, rather than waste the round on the move.
        const reloaded = now - (lastFireTimes.current[tank.id] || 0) > def.reloadTime;
        if (reloaded && now >= mind.haltUntil) mind.haltUntil = now + tactics.shortHaltMs;
        if (now < mind.haltUntil) return;
      }

      // Helper: fire one round from this tank
      const fireEnemyRound = () => {
        const aiTank = { position: newPos, rotation: newRot, pitch, roll, turretRotation: newTurretRot, gunElevation: newGunElev } as TankData;
        const { pos, dir } = computeMuzzleAndDirection(aiTank, def, { turretSwayOffset: 0, gunSwayOffset: 0 });
        const gunDisp = def.weapons.AP.dispersion || 0;
        const fireDisp = getAiFireDispersion(accuracy.shotsOnTarget) + gunDisp + movingFireDispersion(forwardSpeed, def.maxSpeed);
        applyDispersion(dir, fireDisp);

        const velocity = dir.clone().multiplyScalar(def.weapons.AP.velocity);
        fireProjectile(pos, velocity, 'AP', def.weapons.AP, def.weapons.AP.damage, tank.id, def.caliber, weaponClassOf(def));
        updateUnit(tank.id, { lastFireTime: now });
        registerAiShot(accuracyState.current, aimOffsets.current, tank.id, target.id);
        audioManager.playShot({
          source: force === 'enemy' ? 'enemy' : 'ally',
          position: toAudioVec3(pos),
          caliber: def.caliber,
          burst: !!def.burstCount || !!def.automaticMagazineSize,
        });
      };

      if (def.automaticMagazineSize && def.automaticFireInterval) {
        const automatic = automaticStates.current[tank.id] ?? {
          magazineRounds: def.automaticMagazineSize,
          nextFireTime: 0,
        };
        automaticStates.current[tank.id] = automatic;

        if (automatic.magazineRounds <= 0) {
          const reloadStartedAt = lastFireTimes.current[tank.id] || 0;
          if (now - reloadStartedAt <= def.reloadTime) return;
          automatic.magazineRounds = def.automaticMagazineSize;
        }

        if (now < automatic.nextFireTime) return;

        fireEnemyRound();
        automatic.magazineRounds--;
        if (automatic.magazineRounds > 0) {
          automatic.nextFireTime = now + def.automaticFireInterval;
        } else {
          automatic.nextFireTime = 0;
          lastFireTimes.current[tank.id] = now;
        }
      } else {
        const burst = burstStates.current[tank.id];
        if (burst && burst.remaining > 0) {
          if (now >= burst.nextFireTime) {
            fireEnemyRound();
            burst.remaining--;
            if (burst.remaining > 0) {
              burst.nextFireTime = now + (def.burstInterval || 125);
            } else {
              lastFireTimes.current[tank.id] = now;
            }
          }
        } else {
          const lastFire = lastFireTimes.current[tank.id] || 0;
          if (now - lastFire > def.reloadTime + Math.random() * 3000) {
            fireEnemyRound();
            mind.haltUntil = Math.min(mind.haltUntil, now + 600);

            if (def.burstCount && def.burstCount > 1 && def.burstInterval) {
              burstStates.current[tank.id] = {
                remaining: def.burstCount - 1,
                nextFireTime: now + def.burstInterval,
              };
            } else {
              lastFireTimes.current[tank.id] = now;
            }
          }
        }
      }
    });
  });

  return null;
}

export function EnemyAI() {
  return <ForceAI force="enemy" />;
}

/** Friendly tanks that are not the player's wingmen fight like the enemy does. */
export function IndependentAllyAI() {
  return <ForceAI force="friendly" />;
}
