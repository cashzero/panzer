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
  // Warp a very low-frequency field to create broad, irregular terrain
  // provinces rather than distributing the same roughness everywhere.
  const warpX = terrainNoise(x * 0.00085 + 41, z * 0.00085 - 17) * 115;
  const warpZ = terrainNoise(x * 0.00085 - 73, z * 0.00085 + 29) * 115;
  const regionNoise = terrainNoise(
    (x + warpX) * 0.00145 + 101,
    (z + warpZ) * 0.00145 - 67,
  );
  const ruggedness = smoothstep(-0.12, 0.24, regionNoise);
  const ruggedDetail = Math.pow(ruggedness, 1.25);

  // Plains retain a slow regional rise and a trace of ground texture. Hills
  // gain several octaves only where the regional mask calls for rough ground.
  const regionalRise = terrainNoise(x * 0.00072 - 59, z * 0.00072 + 43) * 1.8;
  const broadHills = terrainNoise((x + warpX * 0.3) * 0.0024, (z + warpZ * 0.3) * 0.0024) * 5.2 * ruggedness;
  const rollingGround = terrainNoise(x * 0.0065 + 37, z * 0.0065 - 19) * 1.8 * ruggedDetail;
  const shallowUndulation = terrainNoise(x * 0.017 - 11, z * 0.017 + 53) * (0.12 + ruggedDetail * 0.43);
  const erosionNoise = terrainNoise(x * 0.0041 + 83, z * 0.0041 + 71);
  const softenedRidge = Math.sign(erosionNoise)
    * Math.pow(Math.abs(erosionNoise), 1.65)
    * 1.3
    * ruggedDetail;
  const naturalHeight = regionalRise + broadHills + rollingGround + shallowUndulation + softenedRidge;

  // Even the plains swell and dip by a metre or so: enough to hide a hull at
  // range and to break the horizon, never enough to stop a tank.
  const swells = (terrainNoise(x * 0.0105 + 211, z * 0.0105 - 137) * 0.85
    + terrainNoise(x * 0.027 - 91, z * 0.027 + 17) * 0.3) * GAME_CONFIG.world.microRelief;

  // Preserve a broad, gently blended deployment area around the world origin.
  const distFromCenter = Math.hypot(x, z);
  return naturalHeight * smoothstep(32, 105, distFromCenter)
    + swells * (0.35 + 0.65 * smoothstep(20, 90, distFromCenter));
}

export function getTerrainHeightAt(
  x: number,
  z: number,
  roadInfluence: { influence: number; closestX: number; closestZ: number },
): number {
  const baseHeight = getRawTerrainHeight(x, z);
  if (roadInfluence.influence <= 0) return baseHeight;

  // Old lanes sit a little below the fields either side, worn down by traffic.
  const roadHeight = getRawTerrainHeight(roadInfluence.closestX, roadInfluence.closestZ) - GAME_CONFIG.roads.sunkenDepth;
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
    if (Math.abs(dx) > GAME_CONFIG.buildings.villageFlattenRadius
      || Math.abs(dz) > GAME_CONFIG.buildings.villageFlattenRadius) continue;
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
    const hardMargin = GAME_CONFIG.buildings.foundationFlatMargin;
    const flattenMargin = Math.max(
      GAME_CONFIG.buildings.footprintFlattenMargin,
      Math.min(building.width, building.depth) * 0.45,
    );
    // Conservative bounds enclose the rotated footprint plus its blend region.
    // Most visibility-ray samples are far away: skip their trig and distance work.
    const bounds = (building.width + building.depth) * 0.5 + hardMargin * 2 + flattenMargin;
    if (Math.abs(dx) > bounds || Math.abs(dz) > bounds) continue;
    // Building rotation is a three.js Y rotation (see worldToBuildingLocal in buildings.ts).
    const c = Math.cos(building.rotation);
    const s = Math.sin(building.rotation);
    const localX = dx * c - dz * s;
    const localZ = dx * s + dz * c;
    const padHalfWidth = building.width * 0.5 + hardMargin;
    const padHalfDepth = building.depth * 0.5 + hardMargin;
    const edgeX = Math.max(0, Math.abs(localX) - padHalfWidth);
    const edgeZ = Math.max(0, Math.abs(localZ) - padHalfDepth);
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
