import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import * as THREE from 'three';
import { audioManager, toAudioVec3 } from './audio';
import { testProjectileAgainstTank } from './armorModel';
import type { HitResult } from './armorModel';
import { getTankDef } from './tanks/registry';
import { GAME_CONFIG } from './config';
import { checkTerrainCollision, checkTreeRayCollision, checkBuildingCollision } from './projectilePhysics';
import { getTerrainHeight } from './Terrain';
import { forestStrikeAlong, getActiveForest } from './forest';
import { ShellTracers } from './rendering/ShellTracers';

const NORMAL_SAMPLE = 0.6; // m, finite-difference step for the terrain normal

// Bisect the frame's travel segment to place the impact on the surface instead of below it.
function resolveTerrainImpact(from: THREE.Vector3, to: THREE.Vector3) {
  let lo = 0;
  let hi = 1;
  const point = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) * 0.5;
    point.lerpVectors(from, to, mid);
    if (point.y <= getTerrainHeight(point.x, point.z)) hi = mid;
    else lo = mid;
  }
  point.lerpVectors(from, to, hi);
  point.y = getTerrainHeight(point.x, point.z);
  const e = NORMAL_SAMPLE;
  const normal = new THREE.Vector3(
    getTerrainHeight(point.x - e, point.z) - getTerrainHeight(point.x + e, point.z),
    2 * e,
    getTerrainHeight(point.x, point.z - e) - getTerrainHeight(point.x, point.z + e),
  ).normalize();
  return { point, normal };
}

/** A shell passing within this of the listener is heard going by. */
const FLYBY_RANGE = 30;
// Shells already heard, so each passes once.
const heardFlyby = new Set<string>();

/**
 * Plays the crack of a shell passing close to the listener, once per shell,
 * where its step brings it nearest. The listener's own rounds leave it
 * behind and are not heard this way.
 */
function listenForFlyby(p: { id: string; firedBy: string; caliber: number }, from: THREE.Vector3, to: THREE.Vector3) {
  if (p.firedBy === 'player' || heardFlyby.has(p.id)) return;
  const listener = audioManager.getListenerPosition();
  if (!listener) return;
  const segment = to.clone().sub(from);
  const lengthSq = segment.lengthSq();
  if (lengthSq === 0) return;
  const t = THREE.MathUtils.clamp(
    ((listener.x - from.x) * segment.x + (listener.y - from.y) * segment.y + (listener.z - from.z) * segment.z) / lengthSq, 0, 1);
  // Only once the shell has come level with the listener, not while still on its way.
  if (t <= 0 || t >= 1) return;
  const closest = from.clone().addScaledVector(segment, t);
  const miss = Math.hypot(closest.x - listener.x, closest.y - listener.y, closest.z - listener.z);
  if (miss > FLYBY_RANGE) return;
  heardFlyby.add(p.id);
  if (heardFlyby.size > 512) heardFlyby.clear();
  audioManager.playFlyby({ position: toAudioVec3(closest), caliber: p.caliber, missDistance: miss });
}

export function ProjectileManager() {
  const updateProjectiles = useGameStore((state) => state.updateProjectiles);
  const handleHit = useGameStore((state) => state.handleHit);

  useFrame((state, delta) => {
    const { projectiles: currentProjectiles, playerTank, enemies, allies } = useGameStore.getState();
    const allTanks = [playerTank, ...enemies, ...allies].filter(t => !t.destroyed);

    // Build faction sets for friendly-fire prevention
    const playerAndAllyIds = new Set(['player', ...allies.map(a => a.id)]);
    const enemyIds = new Set(enemies.map(e => e.id));

    const now = Date.now();
    currentProjectiles.forEach((p) => {
      // Ricochet projectiles: skip collision, auto-expire after 1.5s
      if (p.ricochet) {
        if (now - p.createdAt > 1500) {
          useGameStore.getState().removeProjectile(p.id);
        }
        return;
      }

      const prevPos = p.position.clone();
      const nextPos = p.position.clone().add(p.velocity.clone().multiplyScalar(delta));
      const rayDir = nextPos.clone().sub(prevPos);
      const rayLength = rayDir.length();

      if (rayLength === 0) return;

      listenForFlyby(p, prevPos, nextPos);
      rayDir.normalize();
      const ray = new THREE.Ray(prevPos, rayDir);

      // Check collision with ground
      if (checkTerrainCollision(nextPos).hit) {
        const impact = resolveTerrainImpact(prevPos, nextPos);
        handleHit(p.id, 'ground', impact.point, impact.normal);
        return;
      }

      // Check collision with trees
      const trees = useGameStore.getState().trees;
      const treeHit = checkTreeRayCollision(ray, rayLength, trees, GAME_CONFIG.trees.collisionRadius);
      if (treeHit) {
        const { spawnParticle, updateTree, removeProjectile } = useGameStore.getState();
        const tree = trees[treeHit.treeIndex];
        const fallDirection = Math.atan2(ray.direction.x, ray.direction.z);
        spawnParticle('tree_hit', treeHit.point.clone(), treeHit.normal, (p.caliber || 75) / 75);
        updateTree(treeHit.treeIndex, {
          health: 0,
          fallen: true,
          fallDirection,
          fallProgress: tree.fallen ? tree.fallProgress : 0.01,
        });
        removeProjectile(p.id);
        return;
      }

      // Deep in a forest the shell strikes a tree that is not modelled one by one.
      const forest = getActiveForest();
      const forestStrike = forest && forestStrikeAlong(forest, prevPos, nextPos, getTerrainHeight);
      if (forestStrike) {
        const { spawnParticle, removeProjectile } = useGameStore.getState();
        spawnParticle('tree_hit', forestStrike, rayDir.clone().negate(), (p.caliber || 75) / 75);
        removeProjectile(p.id);
        return;
      }

      const buildingHit = checkBuildingCollision(ray, rayLength, useGameStore.getState().buildings);
      if (buildingHit) {
        handleHit(p.id, 'ground', buildingHit.point, buildingHit.normal);
        return;
      }

      let closestHit: { tankId: string; hit: HitResult } | null = null;

      // Check collision with tanks using multi-OBB armor model
      for (const tank of allTanks) {
        if (p.firedBy === tank.id) continue;
        // No friendly fire: skip same-faction targets
        const firedByFriendly = playerAndAllyIds.has(p.firedBy);
        const targetFriendly = playerAndAllyIds.has(tank.id);
        if (firedByFriendly && targetFriendly) continue;
        if (!firedByFriendly && enemyIds.has(tank.id)) continue;
        const def = getTankDef(tank.tankType);
        const profile = { plates: def.plates, broadPhaseRadius: def.broadPhaseRadius };
        const hit = testProjectileAgainstTank(ray, rayLength, tank, profile, def.turretOffset, def.gunPivotOffset);
        if (hit && (!closestHit || hit.distance < closestHit.hit.distance)) {
          closestHit = { tankId: tank.id, hit };
        }
      }

      if (closestHit) {
        handleHit(p.id, closestHit.tankId, closestHit.hit.worldPoint, closestHit.hit.normal, closestHit.hit.plateInfo);
      }
    });

    updateProjectiles(delta);
  });

  return <ShellTracers />;
}
