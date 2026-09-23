import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface MergeEntry {
  geometry: THREE.BufferGeometry;
  /** Transform from the geometry's local space into the merged space. */
  matrix: THREE.Matrix4;
  /** Optional per-entry colour baked into a `color` vertex attribute. */
  color?: THREE.Color;
}

const _normalMatrix = new THREE.Matrix3();

/**
 * Bake entries into one indexed geometry with position / normal / uv (+ color).
 * Missing uvs are zero-filled so heterogeneous primitives can share a batch.
 * Mirrored (negative-determinant) transforms get their winding flipped, which
 * three.js otherwise handles per object by swapping the front face.
 */
export function mergeStaticEntries(entries: MergeEntry[], withColor: boolean): THREE.BufferGeometry | null {
  const prepared: THREE.BufferGeometry[] = [];
  for (const { geometry, matrix, color } of entries) {
    const source = geometry.attributes.position;
    if (!source || source.count === 0) continue;
    const out = new THREE.BufferGeometry();
    const count = source.count;
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const sourceNormal = geometry.attributes.normal;
    const sourceUv = geometry.attributes.uv;
    const v = new THREE.Vector3();
    _normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(source, i).applyMatrix4(matrix);
      position[i * 3] = v.x; position[i * 3 + 1] = v.y; position[i * 3 + 2] = v.z;
      if (sourceNormal) {
        v.fromBufferAttribute(sourceNormal, i).applyMatrix3(_normalMatrix).normalize();
        normal[i * 3] = v.x; normal[i * 3 + 1] = v.y; normal[i * 3 + 2] = v.z;
      }
      if (sourceUv) { uv[i * 2] = sourceUv.getX(i); uv[i * 2 + 1] = sourceUv.getY(i); }
    }
    out.setAttribute('position', new THREE.BufferAttribute(position, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (withColor) {
      const colors = new Float32Array(count * 3);
      const c = color ?? new THREE.Color(1, 1, 1);
      for (let i = 0; i < count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
      out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }

    const flip = matrix.determinant() < 0;
    const index = geometry.index;
    const triangles = index ? index.count : count;
    const indices = new Uint32Array(triangles - (triangles % 3));
    for (let i = 0; i < indices.length; i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      indices[i] = a;
      indices[i + 1] = flip ? c : b;
      indices[i + 2] = flip ? b : c;
    }
    out.setIndex(new THREE.BufferAttribute(indices, 1));
    if (!sourceNormal) out.computeVertexNormals();
    prepared.push(out);
  }
  if (prepared.length === 0) return null;
  const merged = prepared.length === 1 ? prepared[0] : mergeGeometries(prepared, false);
  if (prepared.length > 1) prepared.forEach((geometry) => geometry.dispose());
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** True when the object and every ancestor up to (excluding) `root` are visible. */
export function isVisibleUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node && node !== root; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}
