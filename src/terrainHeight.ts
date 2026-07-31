import { GAME_CONFIG } from './config';
import type { BuildingInstance } from './buildings';
import type { RoadNetwork } from './roads';
import { createNoise2D } from 'simplex-noise';

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const terrainNoise = createNoise2D(mulberry32(GAME_CONFIG.world.seed ^ 0x5f3759df));

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function getRawTerrainHeight(x: number, z: number): number {
  const broadHills = terrainNoise(x * 0.0022, z * 0.0022) * 9.5;
  const rollingGround = terrainNoise(x * 0.0065 + 37, z * 0.0065 - 19) * 3.2;
  const shallowUndulation = terrainNoise(x * 0.017 - 11, z * 0.017 + 53) * 0.85;
  const erosionNoise = terrainNoise(x * 0.0041 + 83, z * 0.0041 + 71);
  const softenedRidge = Math.sign(erosionNoise) * Math.pow(Math.abs(erosionNoise), 1.65) * 2.1;
  const naturalHeight = broadHills + rollingGround + shallowUndulation + softenedRidge;

  // Preserve a broad, gently blended deployment area around the world origin.
  const distFromCenter = Math.hypot(x, z);
  return naturalHeight * smoothstep(32, 105, distFromCenter);
}

export function getTerrainHeightAt(
  x: number,
  z: number,
  roadInfluence: { influence: number; closestX: number; closestZ: number },
): number {
  const baseHeight = getRawTerrainHeight(x, z);
  if (roadInfluence.influence <= 0) return baseHeight;

  const roadHeight = getRawTerrainHeight(roadInfluence.closestX, roadInfluence.closestZ);
  return baseHeight + (roadHeight - baseHeight) * roadInfluence.influence;
}

export function sampleTerrainHeight(
  x: number,
  z: number,
  roadNetwork: RoadNetwork,
  getRoadInfluence: (x: number, z: number, network: RoadNetwork) => { influence: number; closestX: number; closestZ: number },
  buildings: BuildingInstance[] = [],
): number {
  let height = getTerrainHeightAt(x, z, getRoadInfluence(x, z, roadNetwork));

  for (const [jx, jz] of roadNetwork.junctions) {
    const dx = x - jx;
    const dz = z - jz;
    const dist = Math.hypot(dx, dz);
    if (dist > GAME_CONFIG.buildings.villageFlattenRadius) continue;

    const centerHeight = getTerrainHeightAt(jx, jz, getRoadInfluence(jx, jz, roadNetwork));
    const outer = GAME_CONFIG.buildings.villageFlattenRadius;
    const inner = GAME_CONFIG.buildings.villageCoreRadius;
    const t = dist <= inner ? 1 : 1 - Math.min(1, (dist - inner) / Math.max(1, outer - inner));
    const smooth = t * t * (3 - 2 * t);
    height += (centerHeight - height) * smooth;
  }

  for (const building of buildings) {
    const dx = x - building.position[0];
    const dz = z - building.position[2];
    const c = Math.cos(-building.rotation);
    const s = Math.sin(-building.rotation);
    const localX = dx * c - dz * s;
    const localZ = dx * s + dz * c;
    const flattenMargin = Math.max(
      GAME_CONFIG.buildings.footprintFlattenMargin,
      Math.min(building.width, building.depth) * 0.45,
    );
    const edgeX = Math.max(0, Math.abs(localX) - building.width * 0.5);
    const edgeZ = Math.max(0, Math.abs(localZ) - building.depth * 0.5);
    const distToFootprint = Math.hypot(edgeX, edgeZ);
    if (distToFootprint > flattenMargin) continue;

    const t = distToFootprint <= 0.001 ? 1 : 1 - distToFootprint / flattenMargin;
    const smooth = t * t * (3 - 2 * t);
    height += (building.position[1] - height) * smooth;
  }

  return height;
}

export function sampleTerrainWithoutBuildings(
  x: number,
  z: number,
  roadNetwork: RoadNetwork,
  getRoadInfluence: (x: number, z: number, network: RoadNetwork) => { influence: number; closestX: number; closestZ: number },
): number {
  return sampleTerrainHeight(x, z, roadNetwork, getRoadInfluence, []);
}
