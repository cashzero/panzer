import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useGameStore } from './store';
import type { TreeInstance } from './trees';

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
  const cards = [
    { position: [0, 5.25, 0], size: [4.8, 4.35], rotationY: 0.08, rotationZ: -0.035 },
    { position: [0.08, 5.3, -0.04], size: [4.65, 4.25], rotationY: Math.PI / 3, rotationZ: 0.025 },
    { position: [-0.06, 5.35, 0.06], size: [4.55, 4.2], rotationY: (Math.PI * 2) / 3, rotationZ: -0.018 },
    { position: [0.15, 5.75, -0.12], size: [3.7, 3.45], rotationY: Math.PI / 2, rotationZ: 0.04 },
  ];

  return mergeGeometryParts(cards.map(({ position, size, rotationY, rotationZ }) => {
    const card = new THREE.PlaneGeometry(size[0], size[1]);
    card.rotateZ(rotationZ);
    card.rotateY(rotationY);
    card.translate(position[0], position[1], position[2]);
    return card;
  }));
}

function createConiferCanopyGeometry(): THREE.BufferGeometry {
  const tiers = [
    { y: 3.75, width: 4.65, height: 2.55, offsetX: -0.08, offsetZ: 0.06, phase: 0.08 },
    { y: 4.75, width: 4.15, height: 2.45, offsetX: 0.1, offsetZ: -0.05, phase: 0.42 },
    { y: 5.75, width: 3.55, height: 2.25, offsetX: -0.06, offsetZ: -0.02, phase: 0.19 },
    { y: 6.68, width: 2.95, height: 2.05, offsetX: 0.08, offsetZ: 0.05, phase: 0.55 },
    { y: 7.52, width: 2.3, height: 1.85, offsetX: -0.04, offsetZ: 0.02, phase: 0.28 },
    { y: 8.25, width: 1.55, height: 1.55, offsetX: 0.04, offsetZ: -0.03, phase: 0.7 },
  ];

  const cards = tiers.flatMap((tier, tierIndex) => [0, 1, 2].map((direction) => {
    const card = new THREE.PlaneGeometry(tier.width, tier.height);
    card.rotateZ(((tierIndex + direction) % 2 === 0 ? -1 : 1) * 0.025);
    card.rotateY(tier.phase + direction * (Math.PI / 3));
    card.translate(tier.offsetX, tier.y, tier.offsetZ);
    return card;
  }));

  return mergeGeometryParts(cards);
}

// Shared geometries and materials keep the forest to four draw calls.
const trunkGeo = createBentTrunkGeometry();
const deciduousBranchGeo = createBranchGeometry();
const deciduousCanopyGeo = createDeciduousCanopyGeometry();
const coniferCanopyGeo = createConiferCanopyGeometry();

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

// These geometries have no vertex color attribute. Instance colors are applied
// independently by Three.js; enabling vertexColors here would blacken the trees.
const trunkMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  map: barkTexture,
  emissive: '#33271d',
  emissiveIntensity: 0.28,
  roughness: 1,
  metalness: 0,
});
const deciduousLeafMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
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

const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();

function visualNoise(tree: TreeInstance, salt: number): number {
  const value = Math.sin(
    tree.position[0] * 12.9898
      + tree.position[2] * 78.233
      + salt * 37.719,
  ) * 43758.5453;
  return value - Math.floor(value);
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

function colorTreeInstances(
  trees: TreeInstance[],
  trunk: THREE.InstancedMesh | null,
  branches: THREE.InstancedMesh | null,
  deciduous: THREE.InstancedMesh | null,
  conifer: THREE.InstancedMesh | null,
) {
  let deciduousIndex = 0;
  let coniferIndex = 0;

  trees.forEach((tree, index) => {
    const trunkLightness = 0.82 + visualNoise(tree, 12) * 0.17;
    _color.setRGB(trunkLightness, trunkLightness * 0.98, trunkLightness * 0.94);
    trunk?.setColorAt(index, _color);

    if (tree.type === 'deciduous') {
      branches?.setColorAt(deciduousIndex, _color);
      const leafVariation = visualNoise(tree, 21);
      _color.setHSL(0.22 + leafVariation * 0.025, 0.1 + leafVariation * 0.06, 0.76 + leafVariation * 0.1);
      deciduous?.setColorAt(deciduousIndex, _color);
      deciduousIndex++;
    } else {
      const leafVariation = visualNoise(tree, 31);
      _color.setHSL(0.35 + leafVariation * 0.018, 0.1 + leafVariation * 0.055, 0.72 + leafVariation * 0.09);
      conifer?.setColorAt(coniferIndex, _color);
      coniferIndex++;
    }
  });

  [trunk, branches, deciduous, conifer].forEach((mesh) => {
    if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
}

export function Trees() {
  const trees = useGameStore((state) => state.trees);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const deciduousBranchRef = useRef<THREE.InstancedMesh>(null);
  const deciduousRef = useRef<THREE.InstancedMesh>(null);
  const coniferRef = useRef<THREE.InstancedMesh>(null);

  const treeLayoutKey = useMemo(() => trees.reduce(
    (key, tree) => key
      + tree.position[0] * 0.011
      + tree.position[2] * 0.017
      + (tree.type === 'deciduous' ? 0.37 : 0.73),
    trees.length,
  ), [trees]);

  const { deciduousIndices, coniferIndices } = useMemo(() => {
    const deciduous: number[] = [];
    const conifer: number[] = [];
    trees.forEach((tree, index) => {
      if (tree.type === 'deciduous') deciduous.push(index);
      else conifer.push(index);
    });
    return { deciduousIndices: deciduous, coniferIndices: conifer };
  }, [treeLayoutKey]);

  useEffect(() => {
    colorTreeInstances(
      trees,
      trunkRef.current,
      deciduousBranchRef.current,
      deciduousRef.current,
      coniferRef.current,
    );
  }, [treeLayoutKey]);

  useFrame(() => {
    if (!trunkRef.current) return;
    const currentTrees = useGameStore.getState().trees;
    if (currentTrees.length === 0) return;

    let deciduousIndex = 0;
    let coniferIndex = 0;
    for (let index = 0; index < currentTrees.length; index++) {
      const tree = currentTrees[index];
      setTreeMatrix(tree, _mat);
      trunkRef.current.setMatrixAt(index, _mat);

      if (tree.type === 'deciduous') {
        deciduousBranchRef.current?.setMatrixAt(deciduousIndex, _mat);
        deciduousRef.current?.setMatrixAt(deciduousIndex, _mat);
        deciduousIndex++;
      } else {
        coniferRef.current?.setMatrixAt(coniferIndex, _mat);
        coniferIndex++;
      }
    }

    trunkRef.current.instanceMatrix.needsUpdate = true;
    if (deciduousBranchRef.current) deciduousBranchRef.current.instanceMatrix.needsUpdate = true;
    if (deciduousRef.current) deciduousRef.current.instanceMatrix.needsUpdate = true;
    if (coniferRef.current) coniferRef.current.instanceMatrix.needsUpdate = true;
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

  const deciduousCount = deciduousIndices.length;
  const coniferCount = coniferIndices.length;

  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[trunkGeo, trunkMat, trees.length]}
        castShadow
        receiveShadow
      />
      {deciduousCount > 0 && (
        <>
          <instancedMesh
            ref={deciduousBranchRef}
            args={[deciduousBranchGeo, trunkMat, deciduousCount]}
            castShadow
            receiveShadow
          />
          <instancedMesh
            ref={deciduousRef}
            args={[deciduousCanopyGeo, deciduousLeafMat, deciduousCount]}
            castShadow
            receiveShadow
          />
        </>
      )}
      {coniferCount > 0 && (
        <instancedMesh
          ref={coniferRef}
          args={[coniferCanopyGeo, coniferLeafMat, coniferCount]}
          castShadow
          receiveShadow
        />
      )}
    </group>
  );
}
