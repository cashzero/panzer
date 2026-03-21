import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import { useGameStore } from './store';
import * as THREE from 'three';
import { getTerrainHeight } from './Terrain';
import { testProjectileAgainstTank } from './armorModel';
import type { HitResult } from './armorModel';
import { getTankDef } from './tanks/registry';

export function ProjectileManager() {
  const projectiles = useGameStore((state) => state.projectiles);
  const updateProjectiles = useGameStore((state) => state.updateProjectiles);
  const handleHit = useGameStore((state) => state.handleHit);

  useFrame((state, delta) => {
    const { projectiles: currentProjectiles, playerTank, enemies } = useGameStore.getState();
    const allTanks = [playerTank, ...enemies].filter(t => !t.destroyed);

    currentProjectiles.forEach((p) => {
      const prevPos = p.position.clone();
      const nextPos = p.position.clone().add(p.velocity.clone().multiplyScalar(delta));
      const rayDir = nextPos.clone().sub(prevPos);
      const rayLength = rayDir.length();

      if (rayLength === 0) return;

      rayDir.normalize();
      const ray = new THREE.Ray(prevPos, rayDir);

      // Check collision with ground
      const terrainHeight = getTerrainHeight(nextPos.x, nextPos.z);
      if (nextPos.y <= terrainHeight) {
        handleHit(p.id, 'ground', new THREE.Vector3(0, 1, 0));
        return;
      }

      let closestHit: { tankId: string; hit: HitResult } | null = null;

      // Check collision with tanks using multi-OBB armor model
      for (const tank of allTanks) {
        if (p.firedBy === tank.id) continue;
        const def = getTankDef(tank.tankType);
        const profile = { plates: def.plates, broadPhaseRadius: def.broadPhaseRadius };
        const hit = testProjectileAgainstTank(ray, rayLength, tank, profile, def.turretOffset, def.gunPivotOffset);
        if (hit && (!closestHit || hit.distance < closestHit.hit.distance)) {
          closestHit = { tankId: tank.id, hit };
        }
      }

      if (closestHit) {
        handleHit(p.id, closestHit.tankId, closestHit.hit.normal, closestHit.hit.plateInfo);
      }
    });

    updateProjectiles(delta);
  });

  return (
    <group>
      {projectiles.map((p) => (
        <Sphere key={p.id} args={[0.1, 8, 8]} position={p.position}>
          <meshBasicMaterial color={'#ffaa00'} />
        </Sphere>
      ))}
    </group>
  );
}
