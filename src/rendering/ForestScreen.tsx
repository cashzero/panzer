import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { getActiveForest, forestDepthAt, type ForestMap } from '../forest';
import { getTerrainMeshHeight } from '../Terrain';
import { treeLayoutSignature } from '../treeIndex';
import { foliageDepthMaterial, patchFoliageMaterial } from './foliageCards';

/**
 * The shade under a forest's canopy. Past the edge row the forest is planted
 * wide, with crowns that start a few metres up, so from outside a crew looked
 * under them straight through the wood to the sky beyond, as if it were open
 * parkland, while the sight rules treat it as a wall. A band of dark leaf
 * cards a few metres inside the edge, from the ground to the lower crowns,
 * closes that gap: the edge trunks stand against shadowed undergrowth.
 * Visual only; the forest map already blocks movement and sight.
 */

/** Depth band (m inside the edge) the screen fills. */
const SCREEN_DEPTH: [number, number] = [5, 11];
/** Card centre heights above the ground, m. */
const SCREEN_LEVELS = [1.1, 2.9, 4.7];
const CARD_SIZE: [number, number] = [3.0, 3.8];

function hash(x: number, z: number, salt: number) {
  const v = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

function buildScreen(forest: ForestMap) {
  const positions: number[] = [];
  const offsets: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const tint = new THREE.Color();
  const normal = new THREE.Vector3();
  const h = forest.cell * 0.5;
  for (let j = 0; j < forest.size; j++) {
    for (let i = 0; i < forest.size; i++) {
      const depth = forest.depth[j * forest.size + i];
      if (depth < SCREEN_DEPTH[0] || depth > SCREEN_DEPTH[1]) continue;
      const cx = forest.origin + (i + 0.5) * forest.cell, cz = forest.origin + (j + 0.5) * forest.cell;
      // Face out of the forest (down the depth gradient), tipped up a little.
      const gx = forestDepthAt(forest, cx - h, cz) - forestDepthAt(forest, cx + h, cz);
      const gz = forestDepthAt(forest, cx, cz - h) - forestDepthAt(forest, cx, cz + h);
      const length = Math.hypot(gx, gz) || 1;
      normal.set(gx / length, 0.35, gz / length).normalize();
      SCREEN_LEVELS.forEach((level, k) => {
        const x = cx + (hash(cx, cz, k) - 0.5) * forest.cell;
        const z = cz + (hash(cz, cx, k + 5) - 0.5) * forest.cell;
        const y = getTerrainMeshHeight(x, z) + level + (hash(x, z, 9) - 0.5) * 0.8;
        const size = CARD_SIZE[0] + hash(x, z, 11) * (CARD_SIZE[1] - CARD_SIZE[0]);
        const roll = hash(z, x, 13) * Math.PI * 2;
        // Deep, cool shade that lifts a little toward the canopy.
        tint.setHSL(0.24 + hash(x, z, 17) * 0.04, 0.22, 0.2 + k * 0.035 + hash(x, z, 19) * 0.03, THREE.SRGBColorSpace);
        const base = positions.length / 3;
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const ox = (u - 0.5) * size, oy = (v - 0.5) * size;
          positions.push(x, y, z);
          offsets.push(ox * Math.cos(roll) - oy * Math.sin(roll), ox * Math.sin(roll) + oy * Math.cos(roll));
          normals.push(normal.x, normal.y, normal.z);
          colors.push(tint.r, tint.g, tint.b);
          // The dense middle of the leaf texture, as the hedges use.
          uvs.push(0.1 + 0.8 * u, 0.1 + 0.8 * v);
        }
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      });
    }
  }
  if (indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('cardOffset', new THREE.Float32BufferAttribute(offsets, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += CARD_SIZE[1];
  return geometry;
}

const screenTexture = new THREE.TextureLoader().load('/assets/trees/deciduous-foliage.png');
screenTexture.colorSpace = THREE.SRGBColorSpace;
screenTexture.anisotropy = 4;
const screenMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff', vertexColors: true, map: screenTexture,
  roughness: 1, metalness: 0, alphaTest: 0.4, side: THREE.DoubleSide,
});
patchFoliageMaterial(screenMaterial, false);
const screenDepthMaterial = foliageDepthMaterial(false);

export function ForestScreen() {
  // The forest map is rebuilt with the world, and so is the tree layout.
  const layout = treeLayoutSignature(useGameStore((state) => state.trees));
  const geometry = useMemo(() => {
    const forest = getActiveForest();
    return forest?.any ? buildScreen(forest) : null;
  }, [layout]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  // Casts no shadow: it stands in the canopy's shade already.
  return <mesh geometry={geometry} material={screenMaterial} customDepthMaterial={screenDepthMaterial} receiveShadow />;
}
