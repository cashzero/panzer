import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getRoadInfluence } from './roads';
import { GAME_CONFIG } from './config';
import { useGameStore, MAP_SIZE_VALUES } from './store';
import { getFarmlandInfluence, isPointNearAnyBuilding } from './buildings';
import { sampleTerrainHeight } from './terrainHeight';

const TEXTURE_SIZE = 192;
const COVER_GRID_RADIUS = 15;
const COVER_GRID_WIDTH = COVER_GRID_RADIUS * 2 + 1;
const COVER_COUNT = COVER_GRID_WIDTH * COVER_GRID_WIDTH;
const COVER_CELL_SIZE = 2.8;

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash2D(x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function tileableValueNoise(x: number, y: number, frequency: number, seed: number): number {
  const sampleX = (x / TEXTURE_SIZE) * frequency;
  const sampleY = (y / TEXTURE_SIZE) * frequency;
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = (x0 + 1) % frequency;
  const y1 = (y0 + 1) % frequency;
  const wrappedX0 = ((x0 % frequency) + frequency) % frequency;
  const wrappedY0 = ((y0 % frequency) + frequency) % frequency;
  const tx = fract(sampleX);
  const ty = fract(sampleY);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const offsetX = seed * 19;
  const offsetY = seed * -31;
  const top = THREE.MathUtils.lerp(
    hash2D(wrappedX0 + offsetX, wrappedY0 + offsetY),
    hash2D(x1 + offsetX, wrappedY0 + offsetY),
    sx,
  );
  const bottom = THREE.MathUtils.lerp(
    hash2D(wrappedX0 + offsetX, y1 + offsetY),
    hash2D(x1 + offsetX, y1 + offsetY),
    sx,
  );
  return THREE.MathUtils.lerp(top, bottom, sy) * 2 - 1;
}

function createTerrainDetailTextures(terrainSize: number) {
  const albedoData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const normalData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const roughnessData = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const heights = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const surface = (
        tileableValueNoise(x, y, 4, 1) * 0.48
        + tileableValueNoise(x, y, 9, 2) * 0.25
        + tileableValueNoise(x, y, 21, 3) * 0.12
        + (hash2D(x, y) - 0.5) * 0.08
      );
      heights[y * TEXTURE_SIZE + x] = surface;

      const grain = (hash2D(x, y) - 0.5) * 15;
      const base = THREE.MathUtils.clamp(230 + surface * 22 + grain, 188, 255);
      const offset = (y * TEXTURE_SIZE + x) * 4;
      albedoData[offset] = Math.round(Math.min(255, base + 3));
      albedoData[offset + 1] = Math.round(base);
      albedoData[offset + 2] = Math.round(Math.max(0, base - 10));
      albedoData[offset + 3] = 255;

      const roughness = THREE.MathUtils.clamp(222 + grain * 1.35 - surface * 14, 178, 255);
      roughnessData[offset] = roughness;
      roughnessData[offset + 1] = roughness;
      roughnessData[offset + 2] = roughness;
      roughnessData[offset + 3] = 255;
    }
  }

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const left = heights[y * TEXTURE_SIZE + ((x - 1 + TEXTURE_SIZE) % TEXTURE_SIZE)];
      const right = heights[y * TEXTURE_SIZE + ((x + 1) % TEXTURE_SIZE)];
      const down = heights[((y - 1 + TEXTURE_SIZE) % TEXTURE_SIZE) * TEXTURE_SIZE + x];
      const up = heights[((y + 1) % TEXTURE_SIZE) * TEXTURE_SIZE + x];
      const normal = new THREE.Vector3((left - right) * 2.6, (down - up) * 2.6, 1).normalize();
      const offset = (y * TEXTURE_SIZE + x) * 4;
      normalData[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normalData[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normalData[offset + 2] = Math.round(normal.z * 255);
      normalData[offset + 3] = 255;
    }
  }

  const repeat = terrainSize / 34;
  const configure = (texture: THREE.DataTexture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = 8;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  };

  const albedo = configure(new THREE.DataTexture(albedoData, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat));
  albedo.colorSpace = THREE.SRGBColorSpace;
  const normal = configure(new THREE.DataTexture(normalData, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat));
  const roughness = configure(new THREE.DataTexture(roughnessData, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat));
  return { albedo, normal, roughness };
}

function createGrassTuftGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.14, 0, 0, -0.03, 0, 0.02, -0.1, 0.42, 0.01,
    0.02, 0, -0.08, 0.1, 0, -0.01, 0.08, 0.34, -0.05,
    -0.02, 0, 0.04, 0.06, 0, 0.13, 0.01, 0.48, 0.1,
    -0.09, 0, -0.09, -0.02, 0, -0.03, -0.04, 0.3, -0.08,
    0.05, 0, 0.02, 0.14, 0, 0.08, 0.12, 0.38, 0.05,
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
}

const grassTuftGeometry = createGrassTuftGeometry();
const grassTuftMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 1,
  metalness: 0,
  side: THREE.DoubleSide,
});

function GroundCover() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lastCellRef = useRef<[number, number]>([Number.NaN, Number.NaN]);
  const { camera } = useThree();
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const centerX = Math.floor(camera.position.x / COVER_CELL_SIZE);
    const centerZ = Math.floor(camera.position.z / COVER_CELL_SIZE);
    if (lastCellRef.current[0] === centerX && lastCellRef.current[1] === centerZ) return;
    lastCellRef.current = [centerX, centerZ];

    const state = useGameStore.getState();
    let index = 0;
    for (let gz = -COVER_GRID_RADIUS; gz <= COVER_GRID_RADIUS; gz++) {
      for (let gx = -COVER_GRID_RADIUS; gx <= COVER_GRID_RADIUS; gx++) {
        const cellX = centerX + gx;
        const cellZ = centerZ + gz;
        const randomA = hash2D(cellX, cellZ);
        const randomB = hash2D(cellZ + 91, cellX - 47);
        const worldX = (cellX + (randomA - 0.5) * 0.72) * COVER_CELL_SIZE;
        const worldZ = (cellZ + (randomB - 0.5) * 0.72) * COVER_CELL_SIZE;
        const road = getRoadInfluence(worldX, worldZ, state.roadNetwork).influence;
        const blocked = road > 0.14 || isPointNearAnyBuilding(worldX, worldZ, state.buildings, 1.5);
        const farmland = getFarmlandInfluence(worldX, worldZ, state.farmlands);
        const tuftScale = blocked ? 0 : (0.7 + randomB * 0.55) * (1 - farmland * 0.38);

        position.set(worldX, getTerrainHeight(worldX, worldZ) + 0.025, worldZ);
        euler.set(0, randomA * Math.PI * 2, (randomB - 0.5) * 0.12);
        rotation.setFromEuler(euler);
        scale.set(tuftScale, tuftScale, tuftScale);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);

        color.set(farmland > 0.25 ? '#777345' : randomA > 0.58 ? '#697b45' : '#52683f');
        mesh.setColorAt(index, color);
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

/** Raycast a ray against the procedural terrain. Returns the hit point or null. */
export function raycastTerrain(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDist: number = 2000,
): THREE.Vector3 | null {
  const step = 2; // metres per step
  const steps = Math.ceil(maxDist / step);
  let prevT = 0;
  let prevAbove = origin.y - getTerrainHeight(origin.x, origin.z) > 0;

  for (let i = 1; i <= steps; i++) {
    const t = i * step;
    const px = origin.x + direction.x * t;
    const py = origin.y + direction.y * t;
    const pz = origin.z + direction.z * t;
    const terrainY = getTerrainHeight(px, pz);
    const above = py > terrainY;

    if (!above && prevAbove) {
      // Crossed terrain between prevT and t — binary search for precision
      let lo = prevT, hi = t;
      for (let j = 0; j < 10; j++) {
        const mid = (lo + hi) / 2;
        const mx = origin.x + direction.x * mid;
        const my = origin.y + direction.y * mid;
        const mz = origin.z + direction.z * mid;
        if (my > getTerrainHeight(mx, mz)) {
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
  const farmlands = useGameStore((s) => s.farmlands);
  const terrainSize = MAP_SIZE_VALUES[mapSize];
  const segments = Math.round(200 * (terrainSize / 1000));
  const detailTextures = useMemo(() => createTerrainDetailTextures(terrainSize), [terrainSize]);
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colorArray = new Float32Array(pos.count * 3);

    const grassColor = new THREE.Color('#52623a');
    const dryGrassColor = new THREE.Color('#73704a');
    const lowlandColor = new THREE.Color('#40543a');
    const farmlandColor = new THREE.Color(GAME_CONFIG.farmland.color);
    const roadColor = new THREE.Color(GAME_CONFIG.roads.color);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z);
      pos.setY(i, y);

      const farmland = getFarmlandInfluence(x, z, farmlands);
      const road = getRoadInfluence(x, z, roadNetwork);
      const broadVariation = (
        Math.sin(x * 0.019 + z * 0.013)
        + Math.sin(x * 0.047 - z * 0.031) * 0.5
        + Math.cos((x + z) * 0.009) * 0.75
      ) / 2.25;
      const moisture = THREE.MathUtils.clamp(0.5 - y * 0.055, 0, 1);
      const c = grassColor.clone()
        .lerp(broadVariation > 0 ? dryGrassColor : lowlandColor, Math.abs(broadVariation) * 0.24)
        .lerp(lowlandColor, moisture * 0.14)
        .lerp(farmlandColor, farmland * 0.88)
        .lerp(roadColor, road.influence);
      colorArray[i * 3] = c.r;
      colorArray[i * 3 + 1] = c.g;
      colorArray[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geo.computeVertexNormals();
    return geo;
  }, [terrainSize, segments, roadNetwork, buildings, farmlands]);

  useEffect(() => () => {
    geometry.dispose();
    detailTextures.albedo.dispose();
    detailTextures.normal.dispose();
    detailTextures.roughness.dispose();
  }, [geometry, detailTextures]);

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          vertexColors
          map={detailTextures.albedo}
          normalMap={detailTextures.normal}
          normalScale={[0.52, 0.52]}
          roughnessMap={detailTextures.roughness}
          roughness={0.9}
          metalness={0}
          dithering
        />
      </mesh>
      {showGroundCover && <GroundCover />}
    </group>
  );
}
