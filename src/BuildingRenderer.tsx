import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { masonryWeathering } from './rendering/surfaceWeathering';
import { mergeStaticEntries, type MergeEntry } from './rendering/staticMerge';
import { useGameStore } from './store';
import type { BuildingInstance } from './buildings';

const MATERIALS = {
  farmhouseWall: new THREE.MeshStandardMaterial({ color: '#a69a80', roughness: 0.96 }),
  barnWall: new THREE.MeshStandardMaterial({ color: '#76513a', roughness: 1 }),
  warehouseWall: new THREE.MeshStandardMaterial({ color: '#7c7a70', roughness: 0.94 }),
  tileRoof: new THREE.MeshStandardMaterial({ color: '#6f4031', roughness: 0.92 }),
  slateRoof: new THREE.MeshStandardMaterial({ color: '#41484a', roughness: 0.9 }),
  timber: new THREE.MeshStandardMaterial({ color: '#3f2c21', roughness: 1 }),
  trim: new THREE.MeshStandardMaterial({ color: '#d1c4a5', roughness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({ color: '#26383d', roughness: 0.42, metalness: 0.05 }),
  door: new THREE.MeshStandardMaterial({ color: '#4b3225', roughness: 0.96 }),
  warehouseDoor: new THREE.MeshStandardMaterial({ color: '#505654', roughness: 0.82, metalness: 0.12 }),
  stone: new THREE.MeshStandardMaterial({ color: '#66645b', roughness: 1 }),
  gravel: new THREE.MeshStandardMaterial({ color: '#706a5b', roughness: 1 }),
  chimneyCap: new THREE.MeshStandardMaterial({ color: '#37342f', roughness: 1 }),
};

for (const [role, material] of Object.entries(MATERIALS)) {
  if (role === 'glass') continue;
  material.onBeforeCompile = masonryWeathering;
  material.customProgramCacheKey = () => 'masonry-weathering-v1';
}

interface DetailSegment {
  position: [number, number, number];
  size: [number, number, number];
  material: THREE.Material;
  rotation?: [number, number, number];
}

interface BuildingRenderPlan {
  building: BuildingInstance;
  bodyMaterial: THREE.Material;
  roofMaterial: THREE.Material;
  roofGeometry: THREE.BufferGeometry;
  details: DetailSegment[];
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
  const overhang = building.kind === 'warehouse' ? 0.65 : 0.45;
  const halfW = building.width * 0.5 + overhang;
  const halfD = building.depth * 0.5 + overhang;
  const roof = new THREE.BufferGeometry();
  const positions = new Float32Array([
    -halfW, 0, -halfD, 0, building.roofHeight, -halfD, halfW, 0, -halfD,
    -halfW, 0, halfD, halfW, 0, halfD, 0, building.roofHeight, halfD,
    -halfW, 0, -halfD, -halfW, 0, halfD, 0, building.roofHeight, halfD,
    -halfW, 0, -halfD, 0, building.roofHeight, halfD, 0, building.roofHeight, -halfD,
    halfW, 0, -halfD, 0, building.roofHeight, -halfD, 0, building.roofHeight, halfD,
    halfW, 0, -halfD, 0, building.roofHeight, halfD, halfW, 0, halfD,
    -halfW, 0, -halfD, halfW, 0, -halfD, halfW, 0, halfD,
    -halfW, 0, -halfD, halfW, 0, halfD, -halfW, 0, halfD,
  ]);
  roof.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  roof.computeVertexNormals();
  return roof;
}

function addFrontPanel(
  details: DetailSegment[],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  material: THREE.Material,
) {
  details.push({ position: [x, y, z], size: [width, height, 0.12], material });
}

function addWindow(details: DetailSegment[], x: number, y: number, z: number, scale = 1) {
  addFrontPanel(details, x, y, z, 1.55 * scale, 1.7 * scale, MATERIALS.trim);
  addFrontPanel(details, x, y, z + 0.07, 1.27 * scale, 1.42 * scale, MATERIALS.glass);
  addFrontPanel(details, x, y, z + 0.145, 0.09 * scale, 1.42 * scale, MATERIALS.trim);
  addFrontPanel(details, x, y, z + 0.145, 1.27 * scale, 0.09 * scale, MATERIALS.trim);
  addFrontPanel(details, x, y - 0.96 * scale, z + 0.04, 1.82 * scale, 0.18 * scale, MATERIALS.stone);
}

function addFarmhouseDetails(building: BuildingInstance, details: DetailSegment[], rng: () => number) {
  const frontZ = building.depth * 0.5 + 0.08;
  const twoStorey = building.height > 5.15 && building.width > 12.5;
  const windowY = twoStorey ? 1.62 : Math.min(building.height - 1.2, 2.65);
  const doorWidth = 1.45;
  const doorHeight = 2.35;
  const windowOffset = Math.min(building.width * 0.29, 3.8);

  addFrontPanel(details, 0, doorHeight * 0.5 + 0.18, frontZ, doorWidth + 0.28, doorHeight + 0.25, MATERIALS.trim);
  addFrontPanel(details, 0, doorHeight * 0.5 + 0.18, frontZ + 0.08, doorWidth, doorHeight, MATERIALS.door);
  addWindow(details, -windowOffset, windowY, frontZ);
  addWindow(details, windowOffset, windowY, frontZ);

  if (twoStorey) {
    addWindow(details, -windowOffset, building.height - 0.95, frontZ, 0.72);
    addWindow(details, windowOffset, building.height - 0.95, frontZ, 0.72);
  }

  const chimneyX = (rng() > 0.5 ? 1 : -1) * building.width * 0.23;
  details.push({
    position: [chimneyX, building.height + building.roofHeight * 0.72, 0.25],
    size: [0.8, building.roofHeight * 1.25, 0.78],
    material: MATERIALS.stone,
  });
  details.push({
    position: [chimneyX, building.height + building.roofHeight * 1.36, 0.25],
    size: [0.98, 0.18, 0.96],
    material: MATERIALS.chimneyCap,
  });
}

function addBarnDetails(building: BuildingInstance, details: DetailSegment[]) {
  const frontZ = building.depth * 0.5 + 0.08;
  const doorWidth = Math.min(5.2, building.width * 0.34);
  const doorHeight = Math.min(4.8, building.height * 0.7);

  addFrontPanel(details, 0, doorHeight * 0.5 + 0.15, frontZ, doorWidth + 0.45, doorHeight + 0.35, MATERIALS.timber);
  addFrontPanel(details, 0, doorHeight * 0.5 + 0.15, frontZ + 0.08, doorWidth, doorHeight, MATERIALS.barnWall);
  addFrontPanel(details, 0, doorHeight * 0.5 + 0.15, frontZ + 0.17, 0.18, doorHeight, MATERIALS.timber);
  details.push(
    {
      position: [0, doorHeight * 0.5 + 0.15, frontZ + 0.17],
      size: [0.16, Math.hypot(doorWidth, doorHeight), 0.12],
      rotation: [0, 0, Math.atan2(doorWidth, doorHeight)],
      material: MATERIALS.timber,
    },
    {
      position: [0, doorHeight * 0.5 + 0.15, frontZ + 0.17],
      size: [0.16, Math.hypot(doorWidth, doorHeight), 0.12],
      rotation: [0, 0, -Math.atan2(doorWidth, doorHeight)],
      material: MATERIALS.timber,
    },
  );

  // Exposed posts make the long barn walls read as timber construction at range.
  const postCount = Math.max(4, Math.round(building.width / 4));
  for (let i = 0; i <= postCount; i++) {
    const x = THREE.MathUtils.lerp(-building.width * 0.5 + 0.2, building.width * 0.5 - 0.2, i / postCount);
    addFrontPanel(details, x, building.height * 0.5, frontZ + 0.01, 0.18, building.height, MATERIALS.timber);
  }
  addFrontPanel(details, 0, building.height - 0.28, frontZ + 0.01, building.width, 0.22, MATERIALS.timber);
}

function addWarehouseDetails(building: BuildingInstance, details: DetailSegment[]) {
  const frontZ = building.depth * 0.5 + 0.08;
  const doorWidth = Math.min(5.5, building.width * 0.26);
  const doorHeight = Math.min(4.8, building.height * 0.62);
  const doorOffset = building.width * 0.24;

  for (const x of [-doorOffset, doorOffset]) {
    addFrontPanel(details, x, doorHeight * 0.5 + 0.18, frontZ, doorWidth + 0.34, doorHeight + 0.3, MATERIALS.stone);
    addFrontPanel(details, x, doorHeight * 0.5 + 0.18, frontZ + 0.08, doorWidth, doorHeight, MATERIALS.warehouseDoor);
    for (let y = 0.8; y < doorHeight; y += 0.75) {
      addFrontPanel(details, x, y + 0.18, frontZ + 0.16, doorWidth, 0.09, MATERIALS.stone);
    }
  }

  const windowCount = Math.max(3, Math.floor(building.width / 7));
  for (let i = 0; i < windowCount; i++) {
    const x = THREE.MathUtils.lerp(-building.width * 0.36, building.width * 0.36, windowCount === 1 ? 0.5 : i / (windowCount - 1));
    addWindow(details, x, building.height - 1.05, frontZ, 0.72);
  }
}

function createDetailPlan(building: BuildingInstance): DetailSegment[] {
  const rng = mulberry32(hashString(building.id));
  const details: DetailSegment[] = [];
  const apronWidth = building.width + 4.5;
  const apronDepth = building.depth + 4.5;

  // A thin horizontal apron masks terrain tessellation at the wall line and
  // visually ties the structure to its levelled construction pad.
  details.push({
    position: [0, 0.035, 0],
    size: [apronWidth, 0.07, apronDepth],
    material: MATERIALS.gravel,
  });
  details.push({
    position: [0, 0.22, 0],
    size: [building.width + 0.55, 0.44, building.depth + 0.55],
    material: MATERIALS.stone,
  });

  if (building.kind === 'farmhouse') addFarmhouseDetails(building, details, rng);
  else if (building.kind === 'barn') addBarnDetails(building, details);
  else addWarehouseDetails(building, details);

  return details;
}

function createRenderPlan(building: BuildingInstance): BuildingRenderPlan {
  return {
    building,
    bodyMaterial: building.kind === 'farmhouse'
      ? MATERIALS.farmhouseWall
      : building.kind === 'barn'
        ? MATERIALS.barnWall
        : MATERIALS.warehouseWall,
    roofMaterial: building.kind === 'warehouse' ? MATERIALS.slateRoof : MATERIALS.tileRoof,
    roofGeometry: createRoofGeometry(building),
    details: createDetailPlan(building),
  };
}

interface MaterialBatch {
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
}

/** Buildings never move: bake every part into world space, one batch per material. */
function createBatches(plans: BuildingRenderPlan[]): MaterialBatch[] {
  const entries = new Map<THREE.Material, MergeEntry[]>();
  const temporary: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const add = (material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) => {
    const list = entries.get(material) ?? [];
    list.push({ geometry, matrix });
    entries.set(material, list);
  };
  for (const { building, bodyMaterial, roofMaterial, roofGeometry, details } of plans) {
    const root = new THREE.Matrix4().compose(
      new THREE.Vector3(...building.position),
      new THREE.Quaternion().setFromAxisAngle(up, building.rotation),
      new THREE.Vector3(1, 1, 1),
    );
    const body = new THREE.BoxGeometry(building.width, building.height, building.depth);
    temporary.push(body);
    add(bodyMaterial, body, root.clone().multiply(new THREE.Matrix4().makeTranslation(0, building.height * 0.5, 0)));
    add(roofMaterial, roofGeometry, root.clone().multiply(new THREE.Matrix4().makeTranslation(0, building.height, 0)));
    for (const detail of details) {
      const box = new THREE.BoxGeometry(...detail.size);
      temporary.push(box);
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(...detail.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(detail.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1),
      );
      add(detail.material, box, root.clone().multiply(local));
    }
  }
  const batches: MaterialBatch[] = [];
  for (const [material, list] of entries) {
    const geometry = mergeStaticEntries(list, false);
    if (geometry) batches.push({ material, geometry });
  }
  temporary.forEach((geometry) => geometry.dispose());
  for (const plan of plans) plan.roofGeometry.dispose();
  return batches;
}

export function Buildings({ clickThrough = false }: { clickThrough?: boolean }) {
  const buildings = useGameStore((state) => state.buildings);
  const batches = useMemo(() => createBatches(buildings.map(createRenderPlan)), [buildings]);

  useEffect(() => () => {
    for (const batch of batches) batch.geometry.dispose();
  }, [batches]);

  if (batches.length === 0) return null;

  return (
    <group>
      {batches.map(({ material, geometry }) => (
        <mesh
          key={material.uuid}
          castShadow
          receiveShadow
          geometry={geometry}
          material={material}
          raycast={clickThrough ? () => null : undefined}
        />
      ))}
    </group>
  );
}
