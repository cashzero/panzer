import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useGameStore } from './store';
import type { TreeInstance } from './trees';
import { buildConiferCrown, buildCrown, foliageDepthMaterial, patchFoliageMaterial } from './rendering/foliageCards';
import { planUnderstory } from './rendering/woodland';
import { treeLayoutSignature } from './treeIndex';
import { getTerrainMeshHeight } from './Terrain';

function mergeGeometryParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('Unable to build tree geometry');
  merged.computeVertexNormals();
  return merged;
}

function createBentTrunkGeometry(): THREE.BufferGeometry {
  const radialSegments = 9;
  const ringVertices = radialSegments + 1;
  const levels = [
    { y: 0, radius: 0.3, x: 0, z: 0 },
    { y: 1.2, radius: 0.245, x: 0.025, z: -0.015 },
    { y: 2.5, radius: 0.205, x: -0.015, z: 0.035 },
    { y: 3.8, radius: 0.155, x: 0.045, z: 0.02 },
    { y: 5.15, radius: 0.085, x: 0.08, z: -0.015 },
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  levels.forEach((level, levelIndex) => {
    for (let segment = 0; segment <= radialSegments; segment++) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      const irregularity = 1 + Math.sin(segment * 4.17 + levelIndex * 1.91) * 0.055;
      positions.push(
        level.x + Math.cos(angle) * level.radius * irregularity,
        level.y,
        level.z + Math.sin(angle) * level.radius * irregularity,
      );
      uvs.push(segment / radialSegments, level.y / levels[levels.length - 1].y);
    }
  });

  for (let level = 0; level < levels.length - 1; level++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const lower = level * ringVertices + segment;
      const lowerNext = lower + 1;
      const upper = (level + 1) * ringVertices + segment;
      const upperNext = upper + 1;
      indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createBranchGeometry(): THREE.BufferGeometry {
  const branchSpecs: Array<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    baseRadius: number;
  }> = [
    { from: new THREE.Vector3(0, 2.55, 0), to: new THREE.Vector3(-1.25, 4.15, 0.3), baseRadius: 0.12 },
    { from: new THREE.Vector3(0.02, 2.85, 0), to: new THREE.Vector3(1.2, 4.55, 0.55), baseRadius: 0.11 },
    { from: new THREE.Vector3(0.03, 3.2, 0), to: new THREE.Vector3(0.3, 5.15, -1.05), baseRadius: 0.1 },
    { from: new THREE.Vector3(0.04, 3.4, 0), to: new THREE.Vector3(-0.55, 5.45, -0.45), baseRadius: 0.085 },
  ];

  return mergeGeometryParts(branchSpecs.map(({ from, to, baseRadius }) => {
    const direction = new THREE.Vector3().subVectors(to, from);
    const midpoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const branch = new THREE.CylinderGeometry(baseRadius * 0.42, baseRadius, direction.length(), 6);
    branch.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    );
    branch.translate(midpoint.x, midpoint.y, midpoint.z);
    return branch;
  }));
}

function createDeciduousCanopyGeometry(): THREE.BufferGeometry {
  // A main crown with three offset lobes, so the silhouette is not a ball.
  return buildCrown([
    { center: [0, 5.85, 0], radii: [2.3, 1.8, 2.3], cards: 16, size: [1.7, 2.3] },
    { center: [1.15, 5.05, 0.45], radii: [1.45, 1.15, 1.45], cards: 6, size: [1.4, 1.9] },
    { center: [-0.95, 5.3, -0.75], radii: [1.5, 1.25, 1.5], cards: 6, size: [1.4, 1.9] },
    { center: [0.2, 6.75, -0.3], radii: [1.35, 0.95, 1.35], cards: 4, size: [1.3, 1.7] },
  ], { center: [0, 5.75, 0], radii: [2.9, 2.3, 2.9] }, 7331);
}

/** Far and forest-interior crown: the same shape from about a third of the cards. */
function createDeciduousLiteCanopyGeometry(): THREE.BufferGeometry {
  return buildCrown([
    { center: [0, 5.85, 0], radii: [2.3, 1.8, 2.3], cards: 6, size: [2.4, 3.0] },
    { center: [1.15, 5.05, 0.45], radii: [1.45, 1.15, 1.45], cards: 2, size: [2.0, 2.5] },
    { center: [-0.95, 5.3, -0.75], radii: [1.5, 1.25, 1.5], cards: 2, size: [2.0, 2.5] },
    { center: [0.2, 6.75, -0.3], radii: [1.35, 0.95, 1.35], cards: 1, size: [1.9, 2.3] },
  ], { center: [0, 5.75, 0], radii: [2.9, 2.3, 2.9] }, 7331);
}

function createConiferLiteCanopyGeometry(): THREE.BufferGeometry {
  return buildConiferCrown([
    { y: 4.2, width: 4.6, height: 3.6, offsetX: -0.08, offsetZ: 0.06, phase: 0.08 },
    { y: 6.0, width: 3.6, height: 3.2, offsetX: 0.1, offsetZ: -0.05, phase: 0.42 },
    { y: 7.7, width: 2.2, height: 2.6, offsetX: -0.04, offsetZ: 0.02, phase: 0.28 },
  ]);
}

function createConiferCanopyGeometry(): THREE.BufferGeometry {
  return buildConiferCrown([
    { y: 3.75, width: 4.65, height: 2.55, offsetX: -0.08, offsetZ: 0.06, phase: 0.08 },
    { y: 4.75, width: 4.15, height: 2.45, offsetX: 0.1, offsetZ: -0.05, phase: 0.42 },
    { y: 5.75, width: 3.55, height: 2.25, offsetX: -0.06, offsetZ: -0.02, phase: 0.19 },
    { y: 6.68, width: 2.95, height: 2.05, offsetX: 0.08, offsetZ: 0.05, phase: 0.55 },
    { y: 7.52, width: 2.3, height: 1.85, offsetX: -0.04, offsetZ: 0.02, phase: 0.28 },
    { y: 8.25, width: 1.55, height: 1.55, offsetX: 0.04, offsetZ: -0.03, phase: 0.7 },
  ]);
}

// Geometries and materials are shared by every tree chunk.
const shrubGeo = buildCrown([
  { center: [0, 0.85, 0], radii: [1.3, 0.8, 1.3], cards: 9, size: [0.9, 1.3] },
  { center: [0.7, 0.6, 0.3], radii: [0.8, 0.6, 0.8], cards: 4, size: [0.8, 1.1] },
], { center: [0, 0.8, 0], radii: [1.6, 1.0, 1.6] }, 9127);
const trunkGeo = createBentTrunkGeometry();
const deciduousBranchGeo = createBranchGeometry();
const deciduousCanopyGeo = createDeciduousCanopyGeometry();
const coniferCanopyGeo = createConiferCanopyGeometry();
const deciduousLiteGeo = createDeciduousLiteCanopyGeometry();
const coniferLiteGeo = createConiferLiteCanopyGeometry();

const textureLoader = new THREE.TextureLoader();
const barkTexture = textureLoader.load('/assets/trees/bark-albedo.jpg');
barkTexture.colorSpace = THREE.SRGBColorSpace;
barkTexture.wrapS = THREE.RepeatWrapping;
barkTexture.wrapT = THREE.RepeatWrapping;
barkTexture.repeat.set(1.15, 2.6);
barkTexture.anisotropy = 4;

const deciduousFoliageTexture = textureLoader.load('/assets/trees/deciduous-foliage.png');
deciduousFoliageTexture.colorSpace = THREE.SRGBColorSpace;
deciduousFoliageTexture.anisotropy = 4;

const coniferFoliageTexture = textureLoader.load('/assets/trees/conifer-foliage.png');
coniferFoliageTexture.colorSpace = THREE.SRGBColorSpace;
coniferFoliageTexture.anisotropy = 4;

// Bark geometry has no vertex color attribute; enabling vertexColors on the
// trunk material would blacken it. Foliage cards carry crown occlusion as
// vertex colour, multiplied with the per-instance tint.
const trunkMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  map: barkTexture,
  emissive: '#2a241d',
  emissiveIntensity: 0.18,
  roughness: 1,
  metalness: 0,
});
const deciduousLeafMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  map: deciduousFoliageTexture,
  emissive: '#53654a',
  emissiveMap: deciduousFoliageTexture,
  emissiveIntensity: 0.14,
  roughness: 1,
  metalness: 0,
  alphaTest: 0.38,
  alphaToCoverage: false,
  side: THREE.DoubleSide,
});
const coniferLeafMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  map: coniferFoliageTexture,
  emissive: '#435648',
  emissiveMap: coniferFoliageTexture,
  emissiveIntensity: 0.14,
  roughness: 1,
  metalness: 0,
  alphaTest: 0.36,
  alphaToCoverage: false,
  side: THREE.DoubleSide,
});

patchFoliageMaterial(deciduousLeafMat, false);
patchFoliageMaterial(coniferLeafMat, true);
const deciduousLeafDepthMat = foliageDepthMaterial(false);
const coniferLeafDepthMat = foliageDepthMaterial(true);

const _mat = new THREE.Matrix4();
const _crownMat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

function visualNoise(tree: TreeInstance, salt: number): number {
  const value = Math.sin(
    tree.position[0] * 12.9898
      + tree.position[2] * 78.233
      + salt * 37.719,
  ) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Crowns spread wider in woods and rows, where neighbours close the canopy.
 * Visual only: collision and sight use the tree's own scale.
 */
const CROWN_SPREAD = { wood: 1.3, line: 1.12, lone: 1 } as const;
const _crownSpread = new THREE.Matrix4();

function setCrownMatrix(tree: TreeInstance, trunkMatrix: THREE.Matrix4, mat: THREE.Matrix4) {
  const spread = CROWN_SPREAD[tree.habitat];
  // Scale about the tree's own base so the crown widens without rising.
  return mat.multiplyMatrices(trunkMatrix, _crownSpread.makeScale(spread, 1, spread));
}

function setTreeMatrix(tree: TreeInstance, mat: THREE.Matrix4) {
  if (tree.fallen && tree.fallProgress > 0) {
    const fallAngle = (Math.PI / 2) * Math.min(tree.fallProgress, 1);
    _euler.set(
      Math.cos(tree.fallDirection) * fallAngle,
      tree.rotation,
      Math.sin(tree.fallDirection) * fallAngle,
      'YXZ',
    );
  } else {
    const lean = (visualNoise(tree, 7) - 0.5) * 0.055;
    const leanDirection = visualNoise(tree, 8) * Math.PI * 2;
    _euler.set(Math.cos(leanDirection) * lean, tree.rotation, Math.sin(leanDirection) * lean, 'YXZ');
  }
  _quat.setFromEuler(_euler);

  _pos.set(tree.position[0], tree.position[1], tree.position[2]);
  const width = 0.87 + visualNoise(tree, 2) * 0.25;
  const depth = 0.88 + visualNoise(tree, 3) * 0.23;
  const height = 0.92 + visualNoise(tree, 4) * 0.18;
  _scale.set(tree.scale * width, tree.scale * height, tree.scale * depth);
  mat.compose(_pos, _quat, _scale);
}

function treeTrunkColor(tree: TreeInstance) {
  // Grey-brown bark, darker than the albedo scan, which reads pink in the grade.
  const trunkLightness = 0.5 + visualNoise(tree, 12) * 0.16;
  return _color.setRGB(trunkLightness * 0.93, trunkLightness * 0.96, trunkLightness * 0.95);
}

function treeLeafColor(tree: TreeInstance) {
  if (tree.type === 'deciduous') {
    const leafVariation = visualNoise(tree, 21);
    return _color.setHSL(0.22 + leafVariation * 0.025, 0.1 + leafVariation * 0.06, 0.76 + leafVariation * 0.1);
  }
  const leafVariation = visualNoise(tree, 31);
  return _color.setHSL(0.35 + leafVariation * 0.018, 0.1 + leafVariation * 0.055, 0.72 + leafVariation * 0.09);
}

/**
 * Trees are drawn in square chunks, so the renderer skips every chunk
 * outside the view and outside the sun's shadow box. Before this, every tree
 * on the map went into the shadow map each frame. Each chunk holds:
 * - detail: full crowns, branches and shadows, drawn while the chunk is near;
 * - lite: the same trees with a third of the crown cards and no shadows,
 *   drawn once the chunk is far;
 * - interior: trees deep inside a forest, always lite and never casting
 *   shadows. Nothing sees them up close: the forest edge hides them and
 *   tanks cannot drive in.
 */
interface TreeLayers {
  trunk: THREE.InstancedMesh | null;
  branches: THREE.InstancedMesh | null;
  deciduous: THREE.InstancedMesh | null;
  conifer: THREE.InstancedMesh | null;
}

interface TreeChunk {
  min: THREE.Vector2;
  max: THREE.Vector2;
  detail: THREE.Group;
  lite: THREE.Group;
  interior: THREE.Group;
  detailLayers: TreeLayers;
  liteLayers: TreeLayers;
  interiorLayers: TreeLayers;
  useLite: boolean;
}

interface TreeSlot {
  chunk: number;
  trunk: number;
  crown: number;
}

// Chunks whose nearest edge is further than this (m, normalised to the 60
// degree third-person FOV so zoomed sights keep detail) switch to lite crowns.
const LITE_ENTER_DISTANCE = 220;
const LITE_EXIT_DISTANCE = 190;
const TREE_REFERENCE_HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(30));

function makeLayer(geometry: THREE.BufferGeometry, material: THREE.Material, count: number,
  depth: THREE.Material | null, castShadow: boolean) {
  if (count === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  if (depth) mesh.customDepthMaterial = depth;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

function layerMeshes(layers: TreeLayers) {
  return [layers.trunk, layers.branches, layers.deciduous, layers.conifer]
    .filter((mesh): mesh is THREE.InstancedMesh => mesh !== null);
}

function buildTreeChunks(trees: TreeInstance[]) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const tree of trees) {
    minX = Math.min(minX, tree.position[0]); maxX = Math.max(maxX, tree.position[0]);
    minZ = Math.min(minZ, tree.position[2]); maxZ = Math.max(maxZ, tree.position[2]);
  }
  // About nine chunks across the map, at least 250 m: small enough to cull
  // and switch detail usefully, few enough to keep the draw calls down.
  const size = Math.max(250, Math.max(maxX - minX, maxZ - minZ) / 9);
  const columns = Math.max(1, Math.ceil((maxX - minX + 1) / size));
  const chunkOf = (tree: TreeInstance) => Math.floor((tree.position[2] - minZ) / size) * columns
    + Math.floor((tree.position[0] - minX) / size);

  // Count per chunk and bucket (trunks, broadleaf, conifer) first, then
  // allocate exact-size meshes.
  const counts = new Map<number, { outer: [number, number, number]; interior: [number, number, number] }>();
  const slots: TreeSlot[] = trees.map((tree) => {
    const key = chunkOf(tree);
    let entry = counts.get(key);
    if (!entry) { entry = { outer: [0, 0, 0], interior: [0, 0, 0] }; counts.set(key, entry); }
    const bucket = tree.interior ? entry.interior : entry.outer;
    const trunk = bucket[0]++;
    const crown = tree.type === 'deciduous' ? bucket[1]++ : bucket[2]++;
    return { chunk: key, trunk, crown };
  });

  const chunkByKey = new Map<number, TreeChunk>();
  const group = (layers: TreeLayers) => {
    const g = new THREE.Group();
    layerMeshes(layers).forEach((mesh) => g.add(mesh));
    return g;
  };
  for (const [key, { outer, interior }] of counts) {
    const cx = key % columns, cz = Math.floor(key / columns);
    const detailLayers: TreeLayers = {
      trunk: makeLayer(trunkGeo, trunkMat, outer[0], null, true),
      branches: makeLayer(deciduousBranchGeo, trunkMat, outer[1], null, true),
      deciduous: makeLayer(deciduousCanopyGeo, deciduousLeafMat, outer[1], deciduousLeafDepthMat, true),
      conifer: makeLayer(coniferCanopyGeo, coniferLeafMat, outer[2], coniferLeafDepthMat, true),
    };
    const liteLayers: TreeLayers = {
      trunk: makeLayer(trunkGeo, trunkMat, outer[0], null, false),
      branches: null,
      deciduous: makeLayer(deciduousLiteGeo, deciduousLeafMat, outer[1], null, false),
      conifer: makeLayer(coniferLiteGeo, coniferLeafMat, outer[2], null, false),
    };
    const interiorLayers: TreeLayers = {
      trunk: makeLayer(trunkGeo, trunkMat, interior[0], null, false),
      branches: null,
      deciduous: makeLayer(deciduousLiteGeo, deciduousLeafMat, interior[1], null, false),
      conifer: makeLayer(coniferLiteGeo, coniferLeafMat, interior[2], null, false),
    };
    const chunk: TreeChunk = {
      min: new THREE.Vector2(minX + cx * size, minZ + cz * size),
      max: new THREE.Vector2(minX + (cx + 1) * size, minZ + (cz + 1) * size),
      detail: group(detailLayers), lite: group(liteLayers), interior: group(interiorLayers),
      detailLayers, liteLayers, interiorLayers,
      useLite: false,
    };
    chunk.lite.visible = false;
    chunkByKey.set(key, chunk);
  }

  // Colours never change; matrices are written by writeTree.
  trees.forEach((tree, index) => {
    const slot = slots[index];
    const chunk = chunkByKey.get(slot.chunk)!;
    for (const layers of tree.interior ? [chunk.interiorLayers] : [chunk.detailLayers, chunk.liteLayers]) {
      layers.trunk?.setColorAt(slot.trunk, treeTrunkColor(tree));
      if (tree.type === 'deciduous') layers.branches?.setColorAt(slot.crown, _color);
      (tree.type === 'deciduous' ? layers.deciduous : layers.conifer)?.setColorAt(slot.crown, treeLeafColor(tree));
    }
  });
  const chunks = [...chunkByKey.values()];
  // The root is built here, with the chunks: adding them to a group made
  // anywhere else would move them out of any earlier root.
  const root = new THREE.Group();
  for (const chunk of chunks) root.add(chunk.detail, chunk.lite, chunk.interior);
  return { chunks, chunkByKey, slots, root };
}

/** Write one tree's matrices into its chunk, collecting the meshes touched. */
function writeTree(tree: TreeInstance, slot: TreeSlot, chunk: TreeChunk, touched: Set<THREE.InstancedMesh>) {
  setTreeMatrix(tree, _mat);
  setCrownMatrix(tree, _mat, _crownMat);
  for (const layers of tree.interior ? [chunk.interiorLayers] : [chunk.detailLayers, chunk.liteLayers]) {
    const crown = tree.type === 'deciduous' ? layers.deciduous : layers.conifer;
    const branches = tree.type === 'deciduous' ? layers.branches : null;
    layers.trunk?.setMatrixAt(slot.trunk, _mat);
    branches?.setMatrixAt(slot.crown, _mat);
    crown?.setMatrixAt(slot.crown, _crownMat);
    for (const mesh of [layers.trunk, branches, crown]) if (mesh) touched.add(mesh);
  }
}

export function Trees() {
  const trees = useGameStore((state) => state.trees);
  // Knockdowns replace the tree array without moving trees: key on the layout.
  const layout = treeLayoutSignature(trees);
  const built = useMemo(() => buildTreeChunks(useGameStore.getState().trees), [layout]);
  useEffect(() => () => {
    for (const chunk of built.chunks) {
      for (const layers of [chunk.detailLayers, chunk.liteLayers, chunk.interiorLayers]) {
        layerMeshes(layers).forEach((mesh) => mesh.dispose());
      }
    }
  }, [built]);

  // Trees only move when one is knocked over, which replaces that tree's
  // object in a new store array: rewrite just the trees that changed.
  const uploadedTrees = useRef<TreeInstance[] | null>(null);
  const uploadedBuild = useRef<typeof built | null>(null);
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const currentTrees = useGameStore.getState().trees;
    if (currentTrees.length === built.slots.length
      && (currentTrees !== uploadedTrees.current || uploadedBuild.current !== built)) {
      const fresh = uploadedBuild.current !== built;
      const previous = uploadedTrees.current;
      const touched = new Set<THREE.InstancedMesh>();
      for (let index = 0; index < currentTrees.length; index++) {
        const tree = currentTrees[index];
        if (!fresh && previous && previous[index] === tree) continue;
        const slot = built.slots[index];
        writeTree(tree, slot, built.chunkByKey.get(slot.chunk)!, touched);
      }
      for (const mesh of touched) {
        mesh.instanceMatrix.needsUpdate = true;
        if (fresh && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        // Frustum culling uses the instance bounds; refresh them with the matrices.
        mesh.computeBoundingSphere();
      }
      uploadedTrees.current = currentTrees;
      uploadedBuild.current = built;
    }

    // Detail by distance from the camera to the nearest point of each chunk.
    camera.getWorldPosition(cameraPosition);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
    const zoom = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / TREE_REFERENCE_HALF_FOV_TAN;
    for (const chunk of built.chunks) {
      const dx = Math.max(chunk.min.x - cameraPosition.x, 0, cameraPosition.x - chunk.max.x);
      const dz = Math.max(chunk.min.y - cameraPosition.z, 0, cameraPosition.z - chunk.max.y);
      const distance = Math.hypot(dx, dz, Math.max(0, cameraPosition.y - 40)) * zoom;
      const useLite = chunk.useLite ? distance > LITE_EXIT_DISTANCE : distance > LITE_ENTER_DISTANCE;
      if (useLite === chunk.useLite) continue;
      chunk.useLite = useLite;
      chunk.detail.visible = !useLite;
      chunk.lite.visible = useLite;
    }
  });

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    for (let index = 0; index < state.trees.length; index++) {
      const tree = state.trees[index];
      if (tree.fallen && tree.fallProgress < 1) {
        state.updateTree(index, { fallProgress: Math.min(tree.fallProgress + delta * 2, 1) });
      }
    }
  });

  if (trees.length === 0) return null;
  return <primitive object={built.root} />;
}

/** Lowest foliage on the spruce crown, in model units; saplings sink to it. */
const CONIFER_CROWN_BASE = 2.4;

/** Scrub and young spruce under the woods and along the rows (visual only). */
export function Understory() {
  const trees = useGameStore((state) => state.trees);
  const roadNetwork = useGameStore((state) => state.roadNetwork);
  const buildings = useGameStore((state) => state.buildings);
  const farmlands = useGameStore((state) => state.farmlands);
  // Knockdowns replace the tree array without moving trees: key on the layout.
  const layout = treeLayoutSignature(trees);
  const meshes = useMemo(() => {
    const plan = planUnderstory(useGameStore.getState().trees, roadNetwork, buildings, farmlands, useGameStore.getState().yards);
    const shrubs = new THREE.InstancedMesh(shrubGeo, deciduousLeafMat, Math.max(1, plan.shrubs.length));
    const saplings = new THREE.InstancedMesh(coniferCanopyGeo, coniferLeafMat, Math.max(1, plan.saplings.length));
    shrubs.customDepthMaterial = deciduousLeafDepthMat;
    saplings.customDepthMaterial = coniferLeafDepthMat;
    const place = (mesh: THREE.InstancedMesh, plants: typeof plan.shrubs, sink: number, tint: (shade: number) => void) => {
      plants.forEach((plant, index) => {
        _pos.set(plant.x, getTerrainMeshHeight(plant.x, plant.z) - sink * plant.scale, plant.z);
        _quat.setFromAxisAngle(_up, plant.rotation);
        _scale.set(plant.scale, plant.scale * (0.85 + plant.shade * 0.3), plant.scale);
        mesh.setMatrixAt(index, _mat.compose(_pos, _quat, _scale));
        tint(plant.shade);
        mesh.setColorAt(index, _color);
      });
      mesh.count = plants.length;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
    };
    place(shrubs, plan.shrubs, 0.05, (shade) => _color.setHSL(0.19 + shade * 0.06, 0.14 + shade * 0.06, 0.62 + shade * 0.12));
    place(saplings, plan.saplings, CONIFER_CROWN_BASE, (shade) => _color.setHSL(0.33 + shade * 0.03, 0.12, 0.7 + shade * 0.08));
    return [shrubs, saplings];
  }, [layout, roadNetwork, buildings, farmlands]);
  useEffect(() => () => meshes.forEach((mesh) => mesh.dispose()), [meshes]);
  return <>{meshes.map((mesh) => <primitive key={mesh.uuid} object={mesh} />)}</>;
}
