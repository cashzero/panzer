import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef, type DependencyList, type ReactNode } from 'react';
import * as THREE from 'three';
import { isVisibleUnder, mergeStaticEntries, type MergeEntry } from '../../rendering/staticMerge';

// Parts smaller than this (bounding-sphere radius, metres) are dropped from the far LOD.
const FAR_LOD_MIN_PART_RADIUS = 0.12;
// Effective distances are normalised to the 60 degree third-person FOV, so a
// zoomed gunner sight keeps the near LOD on distant targets. Hysteresis avoids
// flicker at the boundary.
const FAR_LOD_ENTER_DISTANCE = 160;
const FAR_LOD_EXIT_DISTANCE = 140;
const REFERENCE_HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(30));

/** Paint and fittings share one material per class across every tank; colour lives in vertices. */
const sharedMaterials = new Map<string, THREE.MeshStandardMaterial>();

interface MaterialClass {
  key: string;
  material: THREE.Material;
  bakeColor: boolean;
}

function classifyMaterial(material: THREE.Material): MaterialClass {
  const standard = material as THREE.MeshStandardMaterial;
  // Textured materials carry per-tank animated state (track scrolling) and
  // untyped materials have no known colour: keep the original instance.
  if (!standard.isMeshStandardMaterial || standard.map) {
    return { key: material.uuid, material, bakeColor: false };
  }
  const key = [
    standard.type, standard.roughness, standard.metalness, standard.envMapIntensity,
    standard.emissive.getHexString(), standard.emissiveIntensity, standard.wireframe,
    standard.side, standard.transparent, standard.opacity, standard.customProgramCacheKey(),
  ].join('|');
  let shared = sharedMaterials.get(key);
  if (!shared) {
    shared = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: standard.roughness,
      metalness: standard.metalness,
      envMapIntensity: standard.envMapIntensity,
      emissive: standard.emissive.clone(),
      emissiveIntensity: standard.emissiveIntensity,
      wireframe: standard.wireframe,
      side: standard.side,
      transparent: standard.transparent,
      opacity: standard.opacity,
    });
    shared.onBeforeCompile = standard.onBeforeCompile;
    shared.customProgramCacheKey = standard.customProgramCacheKey;
    sharedMaterials.set(key, shared);
  }
  return { key, material: shared, bakeColor: true };
}

interface Bucket extends MaterialClass {
  near: MergeEntry[];
  far: MergeEntry[];
  castShadow: boolean;
  receiveShadow: boolean;
}

interface BuiltSlot {
  near: THREE.Group;
  far: THREE.Group;
  dispose: () => void;
}

function partRadius(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  return (geometry.boundingSphere?.radius ?? 0) * matrix.getMaxScaleOnAxis();
}

function buildMergedSlot(source: THREE.Object3D): BuiltSlot {
  source.updateMatrixWorld(true);
  const toSlot = source.matrixWorld.clone().invert();
  const buckets = new Map<string, Bucket>();
  const instanceMatrix = new THREE.Matrix4();

  source.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !isVisibleUnder(mesh, source)) return;
    const materialClass = classifyMaterial(mesh.material);
    let bucket = buckets.get(materialClass.key);
    if (!bucket) {
      bucket = { ...materialClass, near: [], far: [], castShadow: false, receiveShadow: false };
      buckets.set(materialClass.key, bucket);
    }
    bucket.castShadow ||= mesh.castShadow;
    bucket.receiveShadow ||= mesh.receiveShadow;
    const color = bucket.bakeColor ? (mesh.material as THREE.MeshStandardMaterial).color.clone() : undefined;
    const meshToSlot = new THREE.Matrix4().multiplyMatrices(toSlot, mesh.matrixWorld);
    const add = (matrix: THREE.Matrix4) => {
      const entry = { geometry: mesh.geometry, matrix, color };
      bucket.near.push(entry);
      if (partRadius(mesh.geometry, matrix) >= FAR_LOD_MIN_PART_RADIUS) bucket.far.push(entry);
    };
    const instanced = mesh as THREE.InstancedMesh;
    if (instanced.isInstancedMesh) {
      for (let index = 0; index < instanced.count; index++) {
        instanced.getMatrixAt(index, instanceMatrix);
        add(meshToSlot.clone().multiply(instanceMatrix));
      }
    } else {
      add(meshToSlot);
    }
  });

  const near = new THREE.Group();
  const far = new THREE.Group();
  far.visible = false;
  const geometries: THREE.BufferGeometry[] = [];
  for (const bucket of buckets.values()) {
    for (const [target, entries, castShadow] of [[near, bucket.near, bucket.castShadow], [far, bucket.far, false]] as const) {
      const geometry = mergeStaticEntries(entries, bucket.bakeColor);
      if (!geometry) continue;
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, bucket.material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      target.add(mesh);
    }
  }
  return {
    near,
    far,
    dispose: () => {
      near.removeFromParent();
      far.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
}

/**
 * Renders authored model parts once into a detached source group, then draws
 * them as one mesh per material class with a small-part-free far LOD.
 * Battlefield only: editors and calibration pages need the named part tree.
 */
export function MergedSlot({ children, rebuildKey }: { children: ReactNode; rebuildKey: DependencyList }) {
  const source = useRef<THREE.Group>(null);
  const holder = useRef<THREE.Group>(null);
  const built = useRef<BuiltSlot | null>(null);
  const useFar = useRef(false);
  const position = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    if (!source.current || !holder.current) return;
    // Children have committed (and run their layout effects) by now. Keeping the
    // source out of the scene also skips its matrix updates every frame.
    source.current.removeFromParent();
    const slot = buildMergedSlot(source.current);
    slot.near.visible = !useFar.current;
    slot.far.visible = useFar.current;
    holder.current.add(slot.near, slot.far);
    built.current = slot;
    return () => {
      slot.dispose();
      built.current = null;
    };
  }, rebuildKey);

  useFrame(({ camera }) => {
    const slot = built.current;
    if (!slot || !holder.current) return;
    position.current.setFromMatrixPosition(holder.current.matrixWorld);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
    const zoom = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / REFERENCE_HALF_FOV_TAN;
    const distance = camera.position.distanceTo(position.current) * zoom;
    const far = useFar.current ? distance > FAR_LOD_EXIT_DISTANCE : distance > FAR_LOD_ENTER_DISTANCE;
    if (far === useFar.current) return;
    useFar.current = far;
    slot.near.visible = !far;
    slot.far.visible = far;
  });

  return (
    <group>
      <group ref={source} visible={false}>{children}</group>
      <group ref={holder} />
    </group>
  );
}
