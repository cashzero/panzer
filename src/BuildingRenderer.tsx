import { useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store';
import type { BuildingInstance } from './buildings';

const wallMaterial = new THREE.MeshStandardMaterial({ color: '#8f7d67', roughness: 1, metalness: 0 });
const barnMaterial = new THREE.MeshStandardMaterial({ color: '#72624f', roughness: 1, metalness: 0 });
const warehouseMaterial = new THREE.MeshStandardMaterial({ color: '#6b6a63', roughness: 0.95, metalness: 0 });
const roofMaterial = new THREE.MeshStandardMaterial({ color: '#6a3f2a', roughness: 1, metalness: 0 });
const yardMaterial = new THREE.MeshStandardMaterial({ color: '#655941', roughness: 1, metalness: 0 });
const fenceMaterial = new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 1, metalness: 0 });
const hedgeMaterial = new THREE.MeshStandardMaterial({ color: '#314b22', roughness: 1, metalness: 0 });

interface DetailSegment {
  position: [number, number, number];
  size: [number, number, number];
  material: THREE.Material;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRoofGeometry(building: BuildingInstance) {
  const halfW = building.width * 0.5;
  const halfD = building.depth * 0.5;
  const roof = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -halfW, 0, -halfD,
    0, building.roofHeight, -halfD,
    halfW, 0, -halfD,

    -halfW, 0, halfD,
    halfW, 0, halfD,
    0, building.roofHeight, halfD,

    -halfW, 0, -halfD,
    -halfW, 0, halfD,
    0, building.roofHeight, halfD,

    -halfW, 0, -halfD,
    0, building.roofHeight, halfD,
    0, building.roofHeight, -halfD,

    halfW, 0, -halfD,
    0, building.roofHeight, -halfD,
    0, building.roofHeight, halfD,

    halfW, 0, -halfD,
    0, building.roofHeight, halfD,
    halfW, 0, halfD,

    -halfW, 0, -halfD,
    halfW, 0, -halfD,
    halfW, 0, halfD,

    -halfW, 0, -halfD,
    halfW, 0, halfD,
    -halfW, 0, halfD,
  ]);
  roof.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  roof.computeVertexNormals();
  return roof;
}

function createDetailPlan(building: BuildingInstance) {
  const rng = mulberry32(hashString(building.id));
  const segments: DetailSegment[] = [];
  const yardInset = 4 + rng() * 2;
  const yardWidth = building.width + yardInset * 2 + (building.kind === 'warehouse' ? 7 : 3);
  const yardDepth = building.depth + yardInset * 2 + (building.kind === 'farmhouse' ? 8 : 4);
  const fenceHeight = 1.1 + rng() * 0.25;
  const fenceThickness = 0.35;
  const hedgeHeight = 1.5 + rng() * 0.35;
  const frontGap = 3.2 + rng() * 2.2;
  const useHedge = building.kind === 'farmhouse' || rng() > 0.55;
  const sideMaterial = useHedge ? hedgeMaterial : fenceMaterial;
  const sideHeight = useHedge ? hedgeHeight : fenceHeight;
  const fenceZ = yardDepth * 0.5;
  const fenceX = yardWidth * 0.5;

  segments.push({
    position: [0, 0.02, 0],
    size: [yardWidth + 1.5, 0.05, yardDepth + 1.5],
    material: yardMaterial,
  });
  segments.push({
    position: [0, sideHeight * 0.5, -fenceZ],
    size: [yardWidth, sideHeight, fenceThickness],
    material: sideMaterial,
  });
  segments.push({
    position: [-fenceX, sideHeight * 0.5, 0],
    size: [fenceThickness, sideHeight, yardDepth],
    material: sideMaterial,
  });
  segments.push({
    position: [fenceX, sideHeight * 0.5, 0],
    size: [fenceThickness, sideHeight, yardDepth],
    material: sideMaterial,
  });

  const frontSideWidth = Math.max(2, (yardWidth - frontGap) * 0.5);
  segments.push({
    position: [-(frontGap * 0.5 + frontSideWidth * 0.5), sideHeight * 0.5, fenceZ],
    size: [frontSideWidth, sideHeight, fenceThickness],
    material: sideMaterial,
  });
  segments.push({
    position: [frontGap * 0.5 + frontSideWidth * 0.5, sideHeight * 0.5, fenceZ],
    size: [frontSideWidth, sideHeight, fenceThickness],
    material: sideMaterial,
  });

  return { segments };
}

export function Buildings({ clickThrough = false }: { clickThrough?: boolean }) {
  const buildings = useGameStore((state) => state.buildings);

  const rendered = useMemo(
    () => buildings.map((building) => ({
      building,
      roofGeometry: createRoofGeometry(building),
      details: createDetailPlan(building),
      bodyMat: building.kind === 'warehouse'
        ? warehouseMaterial
        : building.kind === 'barn'
          ? barnMaterial
          : wallMaterial,
    })),
    [buildings],
  );

  if (rendered.length === 0) return null;

  return (
    <group>
      {rendered.map(({ building, bodyMat, roofGeometry, details }) => (
        <group
          key={building.id}
          position={[building.position[0], building.position[1], building.position[2]]}
          rotation={[0, building.rotation, 0]}
        >
          <mesh
            castShadow
            receiveShadow
            position={[0, building.height * 0.5, 0]}
            material={bodyMat}
            raycast={clickThrough ? () => null : undefined}
          >
            <boxGeometry args={[building.width, building.height, building.depth]} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            geometry={roofGeometry}
            position={[0, building.height, 0]}
            material={roofMaterial}
            raycast={clickThrough ? () => null : undefined}
          />
          {details.segments.map((segment, index) => (
            <mesh
              key={`${building.id}-detail-${index}`}
              castShadow
              receiveShadow
              position={segment.position}
              material={segment.material}
              raycast={clickThrough ? () => null : undefined}
            >
              <boxGeometry args={segment.size} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
