import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import { useGameStore } from './store';
import * as THREE from 'three';
import { testProjectileAgainstTank } from './armorModel';
import type { HitResult } from './armorModel';
import { getTankDef } from './tanks/registry';
import { GAME_CONFIG } from './config';
import { checkTerrainCollision, checkTreeRayCollision, checkBuildingCollision } from './projectilePhysics';

export function ProjectileManager() {
  const projectiles = useGameStore((state) => state.projectiles);
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

      rayDir.normalize();
      const ray = new THREE.Ray(prevPos, rayDir);

      // Check collision with ground
      if (checkTerrainCollision(nextPos).hit) {
        handleHit(p.id, 'ground', nextPos.clone(), new THREE.Vector3(0, 1, 0));
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

  return (
    <group>
      {projectiles.map((p) => {
        const radius = 0.02 + 0.02 * ((p.caliber || 75) / 75);
        return (
          <Sphere key={p.id} args={[radius, 8, 8]} position={p.position}>
            <meshBasicMaterial color={p.ricochet ? '#cc6600' : '#ffaa00'} />
          </Sphere>
        );
      })}
    </group>
  );
}
