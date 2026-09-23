import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { masonryWeathering } from './rendering/surfaceWeathering';
import { mergeStaticEntries, type MergeEntry } from './rendering/staticMerge';
import { buildBuildingParts, type ArchitectureMaterial } from './rendering/ruralArchitecture';
import { buildYardParts } from './rendering/farmYards';
import { getTerrainMeshHeight } from './Terrain';
import { useGameStore } from './store';

const material = (color: string, roughness = 0.96, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

// Period palette for Norman and Picard farms: lime render, silvered oak,
// Caen limestone, Picard brick, weathered clay tile, slate and old thatch.
const MATERIALS: Record<ArchitectureMaterial, THREE.MeshStandardMaterial> = {
  render: material('#c4b898'),
  daub: material('#a8936f', 1),
  oak: material('#3b2d22', 1),
  limestone: material('#b3a88e'),
  rubble: material('#7a7261', 1),
  brick: material('#8c4d3a'),
  dressing: material('#cdc2a6', 0.95),
  tile: material('#7e4b37', 0.9),
  slate: material('#434b50', 0.82),
  // Old thatch weathers to a grey-brown; only fresh straw is golden.
  thatch: material('#5f5440', 1),
  ridge: material('#4a4232', 1),
  boards: material('#56463a', 1),
  glass: material('#27373b', 0.4, { metalness: 0.05 }),
  door: material('#4a3325', 0.96),
  shutterGreen: material('#4b5a46', 0.95),
  shutterGrey: material('#6b7270', 0.95),
  shutterOxblood: material('#5e3129', 0.95),
  seam: material('#2c211a', 1),
  chimneyCap: material('#3a3631', 1),
  plinth: material('#6f6b60', 1),
  gravel: material('#726b5b', 1),
  hay: material('#b09a5c', 1),
  manure: material('#3a3024', 1),
  earth: material('#4b3c2b', 1),
  veg: material('#4d6433', 1),
  water: material('#26302f', 0.3),
  log: material('#6a4f35', 1),
};

for (const [role, value] of Object.entries(MATERIALS)) {
  if (role === 'glass' || role === 'water') continue;
  value.onBeforeCompile = masonryWeathering;
  value.customProgramCacheKey = () => 'masonry-weathering-v1';
}

interface MaterialBatch {
  material: THREE.Material;
  geometry: THREE.BufferGeometry;
}

/** Buildings and yards never move: bake every part into world space, one batch per material. */
function createBatches(
  buildings: ReturnType<typeof useGameStore.getState>['buildings'],
  yards: ReturnType<typeof useGameStore.getState>['yards'],
): MaterialBatch[] {
  const entries = new Map<ArchitectureMaterial, MergeEntry[]>();
  const add = (key: ArchitectureMaterial, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) => {
    const list = entries.get(key) ?? [];
    list.push({ geometry, matrix });
    entries.set(key, list);
  };
  const up = new THREE.Vector3(0, 1, 0);
  for (const building of buildings) {
    const root = new THREE.Matrix4().compose(
      new THREE.Vector3(...building.position),
      new THREE.Quaternion().setFromAxisAngle(up, building.rotation),
      new THREE.Vector3(1, 1, 1),
    );
    for (const part of buildBuildingParts(building)) add(part.material, part.geometry, root.clone().multiply(part.matrix));
  }
  for (const yard of yards) {
    for (const part of buildYardParts(yard, buildings, getTerrainMeshHeight)) add(part.material, part.geometry, part.matrix);
  }
  const batches: MaterialBatch[] = [];
  for (const [key, list] of entries) {
    const geometry = mergeStaticEntries(list, false);
    if (geometry) batches.push({ material: MATERIALS[key], geometry });
  }
  return batches;
}

export function Buildings({ clickThrough = false }: { clickThrough?: boolean }) {
  const buildings = useGameStore((state) => state.buildings);
  const yards = useGameStore((state) => state.yards);
  const batches = useMemo(() => createBatches(buildings, yards), [buildings, yards]);

  useEffect(() => () => {
    for (const batch of batches) batch.geometry.dispose();
  }, [batches]);

  if (batches.length === 0) return null;

  return (
    <group>
      {batches.map(({ material: batchMaterial, geometry }) => (
        <mesh
          key={batchMaterial.uuid}
          castShadow
          receiveShadow
          geometry={geometry}
          material={batchMaterial}
          raycast={clickThrough ? () => null : undefined}
        />
      ))}
    </group>
  );
}
