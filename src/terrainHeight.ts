import { GAME_CONFIG } from './config';
import type { BuildingInstance } from './buildings';
import type { RoadNetwork } from './roads';

export function getRawTerrainHeight(x: number, z: number): number {
  const scale1 = 0.02;
  const scale2 = 0.05;
  const scale3 = 0.005;

  let y = Math.sin(x * scale1) * Math.cos(z * scale1) * 2.0;
  y += Math.sin(x * scale2 + 1.0) * Math.cos(z * scale2 + 2.0) * 0.5;
  y += Math.sin(x * scale3) * Math.cos(z * scale3) * 10.0;

  const distFromCenter = Math.sqrt(x * x + z * z);
  const flattenFactor = Math.min(1, distFromCenter / 50);

  return y * flattenFactor;
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
