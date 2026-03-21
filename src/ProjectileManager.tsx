import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import { useGameStore } from './store';
import * as THREE from 'three';
import { getTerrainHeight } from './Terrain';

const hullBox = new THREE.Box3(new THREE.Vector3(-1.5, 0, -2.5), new THREE.Vector3(1.5, 1.2, 2.5));
const turretBox = new THREE.Box3(new THREE.Vector3(-1.0, 0, -1.25), new THREE.Vector3(1.0, 1.0, 1.25));

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

      let hitDetected = false;

      // Check collision with ground
      const terrainHeight = getTerrainHeight(nextPos.x, nextPos.z);
      if (nextPos.y <= terrainHeight) {
        handleHit(p.id, 'ground', new THREE.Vector3(0, 1, 0), 'hull');
        hitDetected = true;
      }

      if (hitDetected) return;

      let closestHit: { tankId: string, distance: number, normal: THREE.Vector3, part: 'hull' | 'turret' } | null = null;

      // Check collision with tanks
      for (const tank of allTanks) {
        if (p.firedBy === tank.id) continue;

        const tankMatrix = new THREE.Matrix4();
        const euler = new THREE.Euler(tank.pitch || 0, tank.rotation, tank.roll || 0, 'YXZ');
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        tankMatrix.compose(tank.position, quaternion, new THREE.Vector3(1, 1, 1));
        const inverseTankMatrix = tankMatrix.clone().invert();

        // Transform ray to hull local space
        const hullRay = new THREE.Ray();
        hullRay.copy(ray).applyMatrix4(inverseTankMatrix);

        const hullIntersection = new THREE.Vector3();
        if (hullRay.intersectBox(hullBox, hullIntersection)) {
          const dist = hullRay.origin.distanceTo(hullIntersection);
          if (dist <= rayLength) {
            // Calculate normal in local space
            const localNormal = new THREE.Vector3(0, 0, 0);
            const eps = 0.01;
            if (Math.abs(hullIntersection.x - 1.5) < eps) localNormal.x = 1;
            else if (Math.abs(hullIntersection.x + 1.5) < eps) localNormal.x = -1;
            else if (Math.abs(hullIntersection.y - 1.2) < eps) localNormal.y = 1;
            else if (Math.abs(hullIntersection.y - 0) < eps) localNormal.y = -1;
            else if (Math.abs(hullIntersection.z - 2.5) < eps) localNormal.z = 1;
            else if (Math.abs(hullIntersection.z + 2.5) < eps) localNormal.z = -1;

            // Transform normal back to world space
            const worldNormal = localNormal.clone().transformDirection(tankMatrix).normalize();

            if (!closestHit || dist < closestHit.distance) {
              closestHit = { tankId: tank.id, distance: dist, normal: worldNormal, part: 'hull' };
            }
          }
        }

        // Turret local space
        const turretMatrix = new THREE.Matrix4();
        const turretEuler = new THREE.Euler(0, tank.turretRotation, 0, 'YXZ');
        const turretQuat = new THREE.Quaternion().setFromEuler(turretEuler);
        turretMatrix.compose(new THREE.Vector3(0, 1.2, 0.2), turretQuat, new THREE.Vector3(1, 1, 1));
        const worldTurretMatrix = tankMatrix.clone().multiply(turretMatrix);
        const inverseTurretMatrix = worldTurretMatrix.clone().invert();

        const turretRay = new THREE.Ray();
        turretRay.copy(ray).applyMatrix4(inverseTurretMatrix);

        const turretIntersection = new THREE.Vector3();
        if (turretRay.intersectBox(turretBox, turretIntersection)) {
          const dist = turretRay.origin.distanceTo(turretIntersection);
          if (dist <= rayLength) {
            const localNormal = new THREE.Vector3(0, 0, 0);
            const eps = 0.01;
            if (Math.abs(turretIntersection.x - 1.0) < eps) localNormal.x = 1;
            else if (Math.abs(turretIntersection.x + 1.0) < eps) localNormal.x = -1;
            else if (Math.abs(turretIntersection.y - 1.0) < eps) localNormal.y = 1;
            else if (Math.abs(turretIntersection.y - 0) < eps) localNormal.y = -1;
            else if (Math.abs(turretIntersection.z - 1.25) < eps) localNormal.z = 1;
            else if (Math.abs(turretIntersection.z + 1.25) < eps) localNormal.z = -1;

            const worldNormal = localNormal.clone().transformDirection(worldTurretMatrix).normalize();

            if (!closestHit || dist < closestHit.distance) {
              closestHit = { tankId: tank.id, distance: dist, normal: worldNormal, part: 'turret' };
            }
          }
        }
      }

      if (closestHit) {
        handleHit(p.id, closestHit.tankId, closestHit.normal, closestHit.part);
      }
    });

    updateProjectiles(delta);
  });

  return (
    <group>
      {projectiles.map((p) => (
        <Sphere key={p.id} args={[0.1, 8, 8]} position={p.position}>
          <meshBasicMaterial color={p.type === 'AP' ? '#ffaa00' : '#ff0000'} />
        </Sphere>
      ))}
    </group>
  );
}
