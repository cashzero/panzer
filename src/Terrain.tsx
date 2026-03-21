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
