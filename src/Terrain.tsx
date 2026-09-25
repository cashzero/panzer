import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getRoadInfluence, type RoadNetwork } from './roads';
import { GroundMaterial } from './rendering/GroundMaterial';
import { useGameStore, MAP_SIZE_VALUES } from './store';
import type { BuildingInstance } from './buildings';
import { sampleTerrainHeight } from './terrainHeight';
import { GrassField } from './rendering/GrassField';

export function getTerrainHeight(x: number, z: number): number {
  const state = useGameStore.getState();
  return sampleTerrainHeight(x, z, state.roadNetwork, getRoadInfluence, state.buildings);
}

export function getTerrainSegments(terrainSize: number): number {
  return Math.round(200 * (terrainSize / 1000));
}

interface TerrainHeightField {
  roadNetwork: RoadNetwork;
  buildings: BuildingInstance[];
  size: number;
  segments: number;
  spacing: number;
  /** Vertex heights, row-major: index = iz * (segments + 1) + ix. */
  heights: Float32Array;
}

let heightField: TerrainHeightField | null = null;

/** Heights at the rendered terrain mesh vertices, computed once per world. */
function getTerrainHeightField(): TerrainHeightField {
  const state = useGameStore.getState();
  const size = MAP_SIZE_VALUES[state.mapSize];
  if (heightField && heightField.roadNetwork === state.roadNetwork
    && heightField.buildings === state.buildings && heightField.size === size) return heightField;
  const segments = getTerrainSegments(size);
  const spacing = size / segments;
  const heights = new Float32Array((segments + 1) * (segments + 1));
  for (let iz = 0; iz <= segments; iz++) {
    for (let ix = 0; ix <= segments; ix++) {
      heights[iz * (segments + 1) + ix] = sampleTerrainHeight(
        ix * spacing - size / 2, iz * spacing - size / 2, state.roadNetwork, getRoadInfluence, state.buildings);
    }
  }
  heightField = { roadNetwork: state.roadNetwork, buildings: state.buildings, size, segments, spacing, heights };
  return heightField;
}

export interface TerrainHeightTexture {
  texture: THREE.DataTexture;
  /** Map size (m), vertex spacing (m), segments per side, unused. */
  info: THREE.Vector4;
  minHeight: number;
  maxHeight: number;
}

let heightTexture: { field: TerrainHeightField; value: TerrainHeightTexture } | null = null;

/**
 * The rendered terrain's vertex heights as a float texture, texel (ix, iz), so
 * shaders can rebuild `getTerrainMeshHeight` exactly (see GrassField).
 */
export function getTerrainHeightTexture(): TerrainHeightTexture {
  const field = getTerrainHeightField();
  if (heightTexture?.field === field) return heightTexture.value;
  heightTexture?.value.texture.dispose();
  const row = field.segments + 1;
  const texture = new THREE.DataTexture(field.heights, row, row, THREE.RedFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  let minHeight = Infinity, maxHeight = -Infinity;
  for (const h of field.heights) { if (h < minHeight) minHeight = h; if (h > maxHeight) maxHeight = h; }
  const value = { texture, info: new THREE.Vector4(field.size, field.spacing, field.segments, 0), minHeight, maxHeight };
  heightTexture = { field, value };
  return value;
}

/**
 * Height of the rendered terrain surface: the vertex grid interpolated with the
 * same triangle split as PlaneGeometry. Far cheaper than the noise function,
 * and it is exactly the ground a viewer sees, so it suits line-of-sight tests.
 */
export function getTerrainMeshHeight(x: number, z: number): number {
  const field = getTerrainHeightField();
  const gx = (x + field.size / 2) / field.spacing;
  const gz = (z + field.size / 2) / field.spacing;
  if (!(gx >= 0 && gz >= 0 && gx <= field.segments && gz <= field.segments)) return getTerrainHeight(x, z);
  const ix = Math.min(field.segments - 1, Math.floor(gx));
  const iz = Math.min(field.segments - 1, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  const row = field.segments + 1;
  const h00 = field.heights[iz * row + ix];
  const h10 = field.heights[iz * row + ix + 1];
  const h01 = field.heights[(iz + 1) * row + ix];
  const h11 = field.heights[(iz + 1) * row + ix + 1];
  // PlaneGeometry cells split along the (ix, iz + 1)-(ix + 1, iz) diagonal.
  return fx + fz <= 1
    ? h00 + (h10 - h00) * fx + (h01 - h00) * fz
    : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

/** Raycast a ray against the procedural terrain. Returns the hit point or null. */
export function raycastTerrain(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDist: number = 2000,
  getHeight: (x: number, z: number) => number = getTerrainHeight,
): THREE.Vector3 | null {
  const step = 2; // metres per step
  const steps = Math.ceil(maxDist / step);
  let prevT = 0;
  let prevAbove = origin.y - getHeight(origin.x, origin.z) > 0;

  for (let i = 1; i <= steps; i++) {
    const t = i * step;
    const px = origin.x + direction.x * t;
    const py = origin.y + direction.y * t;
    const pz = origin.z + direction.z * t;
    const terrainY = getHeight(px, pz);
    const above = py > terrainY;

    if (!above && prevAbove) {
      // Crossed terrain between prevT and t — binary search for precision
      let lo = prevT, hi = t;
      for (let j = 0; j < 10; j++) {
        const mid = (lo + hi) / 2;
        const mx = origin.x + direction.x * mid;
        const my = origin.y + direction.y * mid;
        const mz = origin.z + direction.z * mid;
        if (my > getHeight(mx, mz)) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const ft = (lo + hi) / 2;
      return new THREE.Vector3(
        origin.x + direction.x * ft,
        origin.y + direction.y * ft,
        origin.z + direction.z * ft,
      );
    }
    prevT = t;
    prevAbove = above;
  }
  return null;
}

export function Terrain({ showGroundCover = true }: { showGroundCover?: boolean }) {
  const mapSize = useGameStore((s) => s.mapSize);
  const roadNetwork = useGameStore((s) => s.roadNetwork);
  const buildings = useGameStore((s) => s.buildings);
  const terrainSize = MAP_SIZE_VALUES[mapSize];
  const segments = getTerrainSegments(terrainSize);
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    // Share the vertex heights with getTerrainMeshHeight instead of sampling twice.
    const field = getTerrainHeightField();
    const row = field.segments + 1;
    for (let i = 0; i < pos.count; i++) {
      const ix = Math.round((pos.getX(i) + field.size / 2) / field.spacing);
      const iz = Math.round((pos.getZ(i) + field.size / 2) / field.spacing);
      pos.setY(i, field.heights[iz * row + ix]);
    }
    geo.computeVertexNormals();
    return geo;
  }, [terrainSize, segments, roadNetwork, buildings]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <GroundMaterial />
      </mesh>
      {/* Hidden, not unmounted: rebuilding the blades stalled every return from the map. */}
      <GrassField visible={showGroundCover} />
    </group>
  );
}
