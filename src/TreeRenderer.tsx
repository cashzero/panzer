import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store';
import type { TreeInstance } from './trees';

// Shared geometries (created once)
const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 4, 6);
trunkGeo.translate(0, 2, 0); // pivot at base

const deciduousCanopyGeo = new THREE.IcosahedronGeometry(2.15, 1);
deciduousCanopyGeo.translate(-0.45, 5.25, 0);
const deciduousCrownGeo = new THREE.IcosahedronGeometry(1.65, 1);
deciduousCrownGeo.translate(0.85, 6.15, 0.25);

const coniferCone1 = new THREE.ConeGeometry(2.0, 3.5, 6);
coniferCone1.translate(0, 5.5, 0);
const coniferCone2 = new THREE.ConeGeometry(1.4, 2.5, 6);
coniferCone2.translate(0, 7.5, 0);

// Materials
const trunkMat = new THREE.MeshStandardMaterial({ color: '#765238', roughness: 1, metalness: 0 });
const deciduousLeafMat = new THREE.MeshStandardMaterial({ color: '#587445', roughness: 0.94, metalness: 0 });
const coniferLeafMat = new THREE.MeshStandardMaterial({ color: '#385943', roughness: 0.96, metalness: 0 });

const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function setTreeMatrix(
  tree: TreeInstance,
  mat: THREE.Matrix4
) {
  if (tree.fallen && tree.fallProgress > 0) {
    // Falling/fallen: rotate around base
    const fallAngle = (Math.PI / 2) * Math.min(tree.fallProgress, 1);
    _euler.set(
      Math.cos(tree.fallDirection) * fallAngle,
      tree.rotation,
      Math.sin(tree.fallDirection) * fallAngle,
      'YXZ'
    );
    _quat.setFromEuler(_euler);
  } else {
    _euler.set(0, tree.rotation, 0);
    _quat.setFromEuler(_euler);
  }

  _pos.set(tree.position[0], tree.position[1], tree.position[2]);
  _scale.setScalar(tree.scale);
  mat.compose(_pos, _quat, _scale);
}

export function Trees() {
  const trees = useGameStore((state) => state.trees);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const deciduousRef = useRef<THREE.InstancedMesh>(null);
  const deciduousCrownRef = useRef<THREE.InstancedMesh>(null);
  const coniferCone1Ref = useRef<THREE.InstancedMesh>(null);
  const coniferCone2Ref = useRef<THREE.InstancedMesh>(null);

  const { deciduousIndices, coniferIndices } = useMemo(() => {
    const dec: number[] = [];
    const con: number[] = [];
    trees.forEach((t, i) => {
      if (t.type === 'deciduous') dec.push(i);
      else con.push(i);
    });
    return { deciduousIndices: dec, coniferIndices: con };
  }, [trees.length]);

  // Update instance matrices
  useFrame(() => {
    if (!trunkRef.current) return;
    const currentTrees = useGameStore.getState().trees;
    if (currentTrees.length === 0) return;

    let decIdx = 0;
    let conIdx = 0;

    for (let i = 0; i < currentTrees.length; i++) {
      const tree = currentTrees[i];
      setTreeMatrix(tree, _mat);

      trunkRef.current!.setMatrixAt(i, _mat);

      if (tree.type === 'deciduous') {
        deciduousRef.current?.setMatrixAt(decIdx, _mat);
        deciduousCrownRef.current?.setMatrixAt(decIdx, _mat);
        decIdx++;
      } else {
        coniferCone1Ref.current?.setMatrixAt(conIdx, _mat);
        coniferCone2Ref.current?.setMatrixAt(conIdx, _mat);
        conIdx++;
      }
    }

    trunkRef.current.instanceMatrix.needsUpdate = true;
    if (deciduousRef.current) deciduousRef.current.instanceMatrix.needsUpdate = true;
    if (deciduousCrownRef.current) deciduousCrownRef.current.instanceMatrix.needsUpdate = true;
    if (coniferCone1Ref.current) coniferCone1Ref.current.instanceMatrix.needsUpdate = true;
    if (coniferCone2Ref.current) coniferCone2Ref.current.instanceMatrix.needsUpdate = true;
  });

  // Animate falling trees
  useFrame((_, delta) => {
    const state = useGameStore.getState();
    for (let i = 0; i < state.trees.length; i++) {
      const tree = state.trees[i];
      if (tree.fallen && tree.fallProgress < 1) {
        state.updateTree(i, { fallProgress: Math.min(tree.fallProgress + delta * 2, 1) });
      }
    }
  });

  if (trees.length === 0) return null;

  const decCount = deciduousIndices.length;
  const conCount = coniferIndices.length;

  return (
    <group>
      {/* All trunks */}
      <instancedMesh
        ref={trunkRef}
        args={[trunkGeo, trunkMat, trees.length]}
        castShadow
        receiveShadow
      />
      {/* Deciduous canopies */}
      {decCount > 0 && (
        <>
          <instancedMesh
            ref={deciduousRef}
            args={[deciduousCanopyGeo, deciduousLeafMat, decCount]}
            castShadow
            receiveShadow
          />
          <instancedMesh
            ref={deciduousCrownRef}
            args={[deciduousCrownGeo, deciduousLeafMat, decCount]}
            castShadow
            receiveShadow
          />
        </>
      )}
      {/* Conifer canopies */}
      {conCount > 0 && (
        <>
          <instancedMesh
            ref={coniferCone1Ref}
            args={[coniferCone1, coniferLeafMat, conCount]}
            castShadow
            receiveShadow
          />
          <instancedMesh
            ref={coniferCone2Ref}
            args={[coniferCone2, coniferLeafMat, conCount]}
            castShadow
            receiveShadow
          />
        </>
      )}
    </group>
  );
}
