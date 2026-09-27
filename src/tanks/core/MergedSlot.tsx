import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef, type DependencyList, type ReactNode } from 'react';
import * as THREE from 'three';
import { isVisibleUnder, mergeStaticEntries, type MergeEntry } from '../../rendering/staticMerge';
import { armorWeathering, createCamouflageWeathering } from '../../rendering/surfaceWeathering';
import type { CamouflageScheme } from './camouflage';
import { zimmeritShader, type ZimmeritPattern } from '../../rendering/zimmerit';

// Parts smaller than this (bounding-sphere radius, metres) are dropped from the far LOD.
const FAR_LOD_MIN_PART_RADIUS = 0.12;
// Effective distances are normalised to the 60 degree third-person FOV, so a
// zoomed gunner sight keeps the near LOD on distant targets. Hysteresis avoids
// flicker at the boundary.
const FAR_LOD_ENTER_DISTANCE = 160;
const FAR_LOD_EXIT_DISTANCE = 140;
const REFERENCE_HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(30));

// Zimmerit goes on the armour plates, not on fittings: parts smaller than this
// (bounding radius, m) and parts whose id names a fitting stay bare.
const ZIMMERIT_MIN_PART_RADIUS = 0.3;
const ZIMMERIT_BARE_PART = /schurzen|skirt|hanger|rail|outrigger|track|wheel|exhaust|muffler|tool|shovel|jack|axe|crowbar|spare|lamp|lens|antenna|periscope|mg-|hinge|handle|grille|louvre|towing|tow-|mudflap|fender|smoke|discharger|cupola-ring|vision|visor/;

/** Whether a mesh under `root` belongs to a coated armour plate. */
function takesZimmerit(mesh: THREE.Object3D, root: THREE.Object3D, radius: number) {
  if (radius < ZIMMERIT_MIN_PART_RADIUS) return false;
  for (let node: THREE.Object3D | null = mesh; node && node !== root; node = node.parent) {
    const id = node.userData.partId as string | undefined;
    if (id && ZIMMERIT_BARE_PART.test(id)) return false;
  }
  return true;
}

/** Paint and fittings share one material per class across every tank; colour lives in vertices. */
const sharedMaterials = new Map<string, THREE.MeshStandardMaterial>();

interface MaterialClass {
  key: string;
  material: THREE.Material;
  bakeColor: boolean;
  /** Painted armour carrying a camouflage pattern: needs the `camoSeed` attribute. */
  camouflaged: boolean;
  /** Painted armour under Zimmerit: needs the `zimmeritMask` attribute. */
  zimmerit: boolean;
}

function classifyMaterial(material: THREE.Material, camouflage: CamouflageScheme | undefined, bare: boolean, groundWear: boolean): MaterialClass {
  const standard = material as THREE.MeshStandardMaterial;
  // Textured materials carry per-tank animated state (track scrolling) and
  // untyped materials have no known colour: keep the original instance.
  if (!standard.isMeshStandardMaterial || standard.map) {
    return { key: material.uuid, material, bakeColor: false, camouflaged: false, zimmerit: false };
  }
  // Only the weathered paint roles (hull, mantlet, barrel) carry the scheme.
  const pattern = camouflage && camouflage.pattern !== 'solid' && standard.onBeforeCompile === armorWeathering
    ? camouflage.pattern : null;
  // Zimmerit covers the painted armour of hull and turret; the gun stays bare.
  const zimmerit: ZimmeritPattern | null = !bare && camouflage?.zimmerit && standard.onBeforeCompile === armorWeathering
    ? camouflage.zimmerit : null;
  const key = [
    standard.type, standard.roughness, standard.metalness, standard.envMapIntensity,
    standard.emissive.getHexString(), standard.emissiveIntensity, standard.wireframe,
    standard.side, standard.transparent, standard.opacity, standard.customProgramCacheKey(),
    pattern ? `camo:${camouflage!.id}${groundWear ? ':ground' : ''}` : '',
    zimmerit ? `zim:${zimmerit}` : '',
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
    if (pattern) {
      const [colorA = camouflage!.base, colorB = colorA] = camouflage!.colors;
      shared.onBeforeCompile = createCamouflageWeathering(pattern, new THREE.Color(colorA), new THREE.Color(colorB), groundWear);
      shared.customProgramCacheKey = () => `armor-camo-${pattern}${groundWear ? '-ground' : ''}-v5`;
    } else {
      shared.onBeforeCompile = standard.onBeforeCompile;
      shared.customProgramCacheKey = standard.customProgramCacheKey;
    }
    if (zimmerit) {
      const paint = shared.onBeforeCompile;
      const paintKey = shared.customProgramCacheKey();
      const paste = zimmeritShader(zimmerit);
      shared.onBeforeCompile = (shader, renderer) => { paint.call(shared, shader, renderer); paste(shader, renderer); };
      shared.customProgramCacheKey = () => `${paintKey}-zimmerit-${zimmerit}-v2`;
    }
    sharedMaterials.set(key, shared);
  }
  return { key, material: shared, bakeColor: true, camouflaged: pattern !== null, zimmerit: zimmerit !== null };
}

interface Bucket extends MaterialClass {
  near: MergeEntry[];
  far: MergeEntry[];
  /** Per entry: 1 where Zimmerit coats the part (only for Zimmerit classes). */
  nearCoat: number[];
  farCoat: number[];
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

function buildMergedSlot(source: THREE.Object3D, camouflage: CamouflageScheme | undefined, paintSeed: number, bare: boolean, groundWear: boolean): BuiltSlot {
  source.updateMatrixWorld(true);
  const toSlot = source.matrixWorld.clone().invert();
  const buckets = new Map<string, Bucket>();
  const instanceMatrix = new THREE.Matrix4();

  source.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !isVisibleUnder(mesh, source)) return;
    const materialClass = classifyMaterial(mesh.material, camouflage, bare, groundWear);
    let bucket = buckets.get(materialClass.key);
    if (!bucket) {
      bucket = { ...materialClass, near: [], far: [], nearCoat: [], farCoat: [], castShadow: false, receiveShadow: false };
      buckets.set(materialClass.key, bucket);
    }
    bucket.castShadow ||= mesh.castShadow;
    bucket.receiveShadow ||= mesh.receiveShadow;
    const color = bucket.bakeColor ? (mesh.material as THREE.MeshStandardMaterial).color.clone() : undefined;
    const meshToSlot = new THREE.Matrix4().multiplyMatrices(toSlot, mesh.matrixWorld);
    const add = (matrix: THREE.Matrix4) => {
      const entry = { geometry: mesh.geometry, matrix, color };
      const radius = partRadius(mesh.geometry, matrix);
      const coat = bucket.zimmerit && takesZimmerit(mesh, source, radius) ? 1 : 0;
      bucket.near.push(entry);
      bucket.nearCoat.push(coat);
      if (radius >= FAR_LOD_MIN_PART_RADIUS) { bucket.far.push(entry); bucket.farCoat.push(coat); }
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
    for (const [target, entries, coats, castShadow] of [[near, bucket.near, bucket.nearCoat, bucket.castShadow], [far, bucket.far, bucket.farCoat, false]] as const) {
      const geometry = mergeStaticEntries(entries, bucket.bakeColor);
      if (!geometry) continue;
      if (bucket.zimmerit) {
        // mergeStaticEntries keeps entry order and vertex counts, skipping empty ones.
        const mask = new Float32Array(geometry.attributes.position.count);
        let offset = 0;
        entries.forEach((entry, index) => {
          const count = entry.geometry.attributes.position?.count ?? 0;
          mask.fill(coats[index], offset, offset + count);
          offset += count;
        });
        geometry.setAttribute('zimmeritMask', new THREE.BufferAttribute(mask, 1));
      }
      if (bucket.camouflaged) {
        const seeds = new Float32Array(geometry.attributes.position.count).fill(paintSeed);
        geometry.setAttribute('camoSeed', new THREE.BufferAttribute(seeds, 1));
      }
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
export function MergedSlot({ children, rebuildKey, camouflage, paintSeed = 0, bare = false, groundWear = false }: {
  children: ReactNode;
  rebuildKey: DependencyList;
  camouflage?: CamouflageScheme;
  paintSeed?: number;
  /** No Zimmerit on this slot (the gun). */
  bare?: boolean;
  /** Hull slot: slot-space height is height above the ground, so paint wears along the lower edge. */
  groundWear?: boolean;
}) {
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
    const slot = buildMergedSlot(source.current, camouflage, paintSeed, bare, groundWear);
    slot.near.visible = !useFar.current;
    slot.far.visible = useFar.current;
    holder.current.add(slot.near, slot.far);
    built.current = slot;
    return () => {
      slot.dispose();
      built.current = null;
    };
  }, [...rebuildKey, camouflage, paintSeed, bare, groundWear]);

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
