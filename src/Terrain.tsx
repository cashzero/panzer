import { useMemo } from 'react';
import * as THREE from 'three';
import { getRoadInfluence } from './roads';
import { GAME_CONFIG } from './config';
import { useGameStore, MAP_SIZE_VALUES } from './store';
import { getFarmlandInfluence } from './buildings';
import { sampleTerrainHeight } from './terrainHeight';

export function getTerrainHeight(x: number, z: number): number {
  const state = useGameStore.getState();
  return sampleTerrainHeight(x, z, state.roadNetwork, getRoadInfluence, state.buildings);
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
  const mapSize = useGameStore((s) => s.mapSize);
  const roadNetwork = useGameStore((s) => s.roadNetwork);
  const buildings = useGameStore((s) => s.buildings);
  const farmlands = useGameStore((s) => s.farmlands);
  const terrainSize = MAP_SIZE_VALUES[mapSize];
  const segments = Math.round(200 * (terrainSize / 1000));
  const { geometry, colors } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colorArray = new Float32Array(pos.count * 3);

    const grassColor = new THREE.Color(GAME_CONFIG.roads.grassColor);
    const farmlandColor = new THREE.Color(GAME_CONFIG.farmland.color);
    const roadColor = new THREE.Color(GAME_CONFIG.roads.color);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z);
      pos.setY(i, y);

      const farmland = getFarmlandInfluence(x, z, farmlands);
      const road = getRoadInfluence(x, z, roadNetwork);
      const c = grassColor.clone().lerp(farmlandColor, farmland).lerp(roadColor, road.influence);
      colorArray[i * 3] = c.r;
      colorArray[i * 3 + 1] = c.g;
      colorArray[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geo.computeVertexNormals();
    return { geometry: geo, colors: true };
  }, [terrainSize, segments, roadNetwork, buildings, farmlands]);

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
