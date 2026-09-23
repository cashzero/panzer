import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { grassShader, grassWind } from './rendering/terrainMaterial';
import * as THREE from 'three';
import { getRoadInfluence, type RoadNetwork } from './roads';
import { GroundMaterial } from './rendering/GroundMaterial';
import { useGameStore, MAP_SIZE_VALUES } from './store';
import { getFarmlandInfluence, isPointNearAnyBuilding, type BuildingInstance } from './buildings';
import { sampleTerrainHeight } from './terrainHeight';
import { GAME_CONFIG } from './config';

const COVER_GRID_RADIUS = 55;
const COVER_GRID_WIDTH = COVER_GRID_RADIUS * 2 + 1;
const COVER_COUNT = COVER_GRID_WIDTH * COVER_GRID_WIDTH;
const COVER_CELL_SIZE = 0.8;

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash2D(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function createGrassTuftGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  const root = new THREE.Color('#6b6943');
  const tip = new THREE.Color('#aaa572');
  const tint = new THREE.Color();
  for (let blade = 0; blade < 9; blade++) {
    const angle = hash2D(blade, 2) * Math.PI * 2;
    const height = 0.12 + hash2D(blade, 5) * 0.23;
    const width = 0.014 + hash2D(blade, 8) * 0.018;
    const x = Math.cos(angle) * 0.16;
    const z = Math.sin(angle) * 0.16;
    const point = (t: number, side: number) => {
      const bend = t * t * 0.12;
      positions.push(x + Math.cos(angle) * (side * width * (1 - t) + bend), height * t,
        z + Math.sin(angle) * (side * width * (1 - t) + bend));
      tint.copy(root).lerp(tip, t * 0.75);
      colors.push(tint.r, tint.g, tint.b);
    };
    for (let segment = 0; segment < 2; segment++) {
      const low = segment / 2;
      const high = (segment + 1) / 2;
      point(low, -1); point(low, 1); point(high, -1);
      point(low, 1); point(high, 1); point(high, -1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const grassTuftGeometry = createGrassTuftGeometry();
const grassTuftMaterial = new THREE.MeshPhysicalMaterial({
  color: '#ffffff',
  roughness: 1,
  metalness: 0,
  specularIntensity: 0,
  side: THREE.DoubleSide,
  vertexColors: true,
});
grassTuftMaterial.onBeforeCompile = grassShader;
const TUFT_FARMLAND = new THREE.Color('#d4c590');
const TUFT_LIGHT = new THREE.Color('#cac39a');
const TUFT_BASE = new THREE.Color('#b4b289');

function GroundCover() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lastCellRef = useRef<[number, number]>([Number.NaN, Number.NaN]);
  const { camera } = useThree();
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), []);
  const roadNetwork = useGameStore((state) => state.roadNetwork);
  const buildings = useGameStore((state) => state.buildings);
  const farmlands = useGameStore((state) => state.farmlands);
  useEffect(() => { lastCellRef.current = [NaN, NaN]; }, [roadNetwork, buildings, farmlands]);
  useFrame(({ clock }) => {
    grassWind.value = reducedMotion.matches ? 0 : clock.elapsedTime;
    const mesh = meshRef.current;
    if (!mesh) return;
    const centerX = Math.floor(camera.position.x / COVER_CELL_SIZE);
    const centerZ = Math.floor(camera.position.z / COVER_CELL_SIZE);
    if (lastCellRef.current[0] === centerX && lastCellRef.current[1] === centerZ) return;
    lastCellRef.current = [centerX, centerZ];

    const state = useGameStore.getState();
    // Only plots and buildings that can reach this grid affect it; filtering
    // once keeps the per-tuft tests from scanning the whole map.
    const reach = (COVER_GRID_RADIUS + 1) * COVER_CELL_SIZE;
    const nearGrid = (x: number, z: number, radius: number) =>
      Math.abs(x - camera.position.x) <= reach + radius && Math.abs(z - camera.position.z) <= reach + radius;
    const farmlands = state.farmlands.filter((plot) => nearGrid(plot.center[0], plot.center[2],
      Math.hypot(plot.width, plot.depth) * 0.5 + GAME_CONFIG.farmland.edgeBlend));
    const nearbyBuildings = state.buildings.filter((building) => nearGrid(building.position[0], building.position[2],
      Math.hypot(building.width, building.depth) * 0.5 + 1.5));
    let index = 0;
    for (let gz = -COVER_GRID_RADIUS; gz <= COVER_GRID_RADIUS; gz++) {
      for (let gx = -COVER_GRID_RADIUS; gx <= COVER_GRID_RADIUS; gx++) {
        const cellX = centerX + gx;
        const cellZ = centerZ + gz;
        const randomA = hash2D(cellX, cellZ);
        const randomB = hash2D(cellZ + 91, cellX - 47);
        const worldX = (cellX + (randomA - 0.5) * 0.98) * COVER_CELL_SIZE;
        const worldZ = (cellZ + (randomB - 0.5) * 0.98) * COVER_CELL_SIZE;
        const road = getRoadInfluence(worldX, worldZ, state.roadNetwork).influence;
        const blocked = road > 0.14 || isPointNearAnyBuilding(worldX, worldZ, nearbyBuildings, 1.5);
        const farmland = getFarmlandInfluence(worldX, worldZ, farmlands);
        const tuftScale = blocked ? 0 : (0.7 + randomB * 0.55) * (1 - farmland * 0.38);

        // Tufts sit on the rendered surface; the exact noise field is far costlier.
        position.set(worldX, blocked ? 0 : getTerrainMeshHeight(worldX, worldZ) + 0.008, worldZ);
        euler.set(0, randomA * Math.PI * 2, (randomB - 0.5) * 0.12);
        rotation.setFromEuler(euler);
        scale.set(tuftScale, tuftScale, tuftScale);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);

        mesh.setColorAt(index, farmland > 0.25 ? TUFT_FARMLAND : randomA > 0.58 ? TUFT_LIGHT : TUFT_BASE);
        index++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[grassTuftGeometry, grassTuftMaterial, COVER_COUNT]}
      frustumCulled={false}
      receiveShadow
    />
  );
}

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
      {showGroundCover && <GroundCover />}
    </group>
  );
}
