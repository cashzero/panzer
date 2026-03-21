import { useMemo } from 'react';
import * as THREE from 'three';
import { getRoadInfluence } from './roads';
import { GAME_CONFIG } from './config';

function getRawTerrainHeight(x: number, z: number): number {
  const scale1 = 0.02;
  const scale2 = 0.05;
  const scale3 = 0.005;

  let y = Math.sin(x * scale1) * Math.cos(z * scale1) * 2.0;
  y += Math.sin(x * scale2 + 1.0) * Math.cos(z * scale2 + 2.0) * 0.5;
  y += Math.sin(x * scale3) * Math.cos(z * scale3) * 10.0;

  const distFromCenter = Math.sqrt(x * x + z * z);
  const flattenFactor = Math.min(1, distFromCenter / 50);

  return y * flattenFactor;
}

export function getTerrainHeight(x: number, z: number): number {
  const baseHeight = getRawTerrainHeight(x, z);
  const road = getRoadInfluence(x, z);

  if (road.influence <= 0) return baseHeight;

  // Road height is the terrain height at the closest road centerline point
  const roadHeight = getRawTerrainHeight(road.closestX, road.closestZ);
  return baseHeight + (roadHeight - baseHeight) * road.influence;
}

/** Raycast a ray against the procedural terrain. Returns the hit point or null. */
export function raycastTerrain(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDist: number = 2000,
): THREE.Vector3 | null {
  const step = 2; // metres per step
  const steps = Math.ceil(maxDist / step);
  let prevT = 0;
  let prevAbove = origin.y - getTerrainHeight(origin.x, origin.z) > 0;

  for (let i = 1; i <= steps; i++) {
    const t = i * step;
    const px = origin.x + direction.x * t;
    const py = origin.y + direction.y * t;
    const pz = origin.z + direction.z * t;
    const terrainY = getTerrainHeight(px, pz);
    const above = py > terrainY;

    if (!above && prevAbove) {
      // Crossed terrain between prevT and t — binary search for precision
      let lo = prevT, hi = t;
      for (let j = 0; j < 10; j++) {
        const mid = (lo + hi) / 2;
        const mx = origin.x + direction.x * mid;
        const my = origin.y + direction.y * mid;
        const mz = origin.z + direction.z * mid;
        if (my > getTerrainHeight(mx, mz)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const ft = (lo + hi) / 2;
      return new THREE.Vector3(
        origin.x + direction.x * ft,
        origin.y + direction.y * ft,
        origin.z + direction.z * ft,
      );
    }
    prevT = t;
    prevAbove = above;
  }
  return null;
}

export function Terrain() {
  const { geometry, colors } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1000, 1000, 200, 200);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colorArray = new Float32Array(pos.count * 3);

    const grassColor = new THREE.Color(GAME_CONFIG.roads.grassColor);
    const roadColor = new THREE.Color(GAME_CONFIG.roads.color);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z);
      pos.setY(i, y);

      // Vertex color based on road influence
      const road = getRoadInfluence(x, z);
      const c = grassColor.clone().lerp(roadColor, road.influence);
      colorArray[i * 3] = c.r;
      colorArray[i * 3 + 1] = c.g;
      colorArray[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geo.computeVertexNormals();
    return { geometry: geo, colors: true };
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={1}
        metalness={0}
        flatShading
      />
    </mesh>
  );
}
