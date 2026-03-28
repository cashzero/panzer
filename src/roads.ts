import { GAME_CONFIG } from './config';
import type { MapSize } from './store';

export interface RoadSegment {
  points: [number, number][];
  halfWidth: number;
}

export interface RoadNetwork {
  seed: number;
  terrainSize: number;
  segments: RoadSegment[];
  junctions: [number, number][];
}

const MAP_METERS_BY_SIZE: Record<MapSize, number> = {
  small: 1000,
  medium: 2000,
  large: 4000,
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampToPlayArea(value: number, halfSize: number): number {
  return Math.max(-halfSize, Math.min(halfSize, value));
}

function pushAwayFromCenter(value: number, minAbs: number): number {
  if (Math.abs(value) >= minAbs) return value;
  return (value >= 0 ? 1 : -1) * minAbs;
}

function createVerticalRoad(halfSize: number, crossZ: number, rng: () => number): RoadSegment {
  const baseX = (rng() - 0.5) * halfSize * 0.22;
  return {
    halfWidth: GAME_CONFIG.roads.halfWidth + rng() * 1.5,
    points: [
      [baseX + (rng() - 0.5) * 20, -halfSize],
      [baseX + (rng() - 0.5) * 70, -halfSize * 0.45],
      [baseX + (rng() - 0.5) * 50, crossZ],
      [baseX + (rng() - 0.5) * 70, halfSize * 0.5],
      [baseX + (rng() - 0.5) * 20, halfSize],
    ],
  };
}

function interpolatePoint(points: [number, number][], targetZ: number): [number, number] {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    if ((targetZ >= az && targetZ <= bz) || (targetZ >= bz && targetZ <= az)) {
      const denom = bz - az;
      const t = Math.abs(denom) < 0.0001 ? 0 : (targetZ - az) / denom;
      return [ax + (bx - ax) * t, targetZ];
    }
  }
  return points[Math.floor(points.length / 2)];
}

function createHorizontalRoad(
  halfSize: number,
  crossX: number,
  crossZ: number,
  rng: () => number,
): RoadSegment {
  return {
    halfWidth: GAME_CONFIG.roads.halfWidth + rng() * 1.25,
    points: [
      [-halfSize, clampToPlayArea(crossZ + (rng() - 0.5) * 35, halfSize)],
      [-halfSize * 0.5, clampToPlayArea(crossZ + (rng() - 0.5) * 60, halfSize)],
      [crossX, crossZ],
      [halfSize * 0.45, clampToPlayArea(crossZ + (rng() - 0.5) * 60, halfSize)],
      [halfSize, clampToPlayArea(crossZ + (rng() - 0.5) * 35, halfSize)],
    ],
  };
}

function createDiagonalSpur(
  halfSize: number,
  crossX: number,
  crossZ: number,
  rng: () => number,
): RoadSegment {
  const sideX = rng() > 0.5 ? 1 : -1;
  const sideZ = rng() > 0.5 ? 1 : -1;
  const startX = crossX + sideX * (110 + rng() * 90);
  const startZ = crossZ + sideZ * (90 + rng() * 80);
  const endX = clampToPlayArea(crossX + sideX * (halfSize * 0.7 + rng() * halfSize * 0.18), halfSize);
  const endZ = clampToPlayArea(crossZ + sideZ * (halfSize * 0.55 + rng() * halfSize * 0.2), halfSize);
  const bendX = clampToPlayArea((startX + endX) * 0.5 + sideX * (25 + rng() * 45), halfSize);
  const bendZ = clampToPlayArea((startZ + endZ) * 0.5 + sideZ * (20 + rng() * 40), halfSize);
  return {
    halfWidth: Math.max(3.5, GAME_CONFIG.roads.halfWidth - 0.5 + rng()),
    points: [
      [crossX, crossZ],
      [clampToPlayArea(startX, halfSize), clampToPlayArea(startZ, halfSize)],
      [bendX, bendZ],
      [endX, endZ],
    ],
  };
}

function createSideRoadFromVertical(
  halfSize: number,
  trunkPoints: [number, number][],
  trunkZ: number,
  rng: () => number,
): { segment: RoadSegment; junction: [number, number] } {
  const [junctionX, junctionZ] = interpolatePoint(trunkPoints, trunkZ);
  const side = rng() > 0.5 ? 1 : -1;
  const turnX = clampToPlayArea(junctionX + side * (110 + rng() * 90), halfSize);
  const turnZ = clampToPlayArea(junctionZ + (rng() - 0.5) * 70, halfSize);
  const endX = clampToPlayArea(junctionX + side * (halfSize * 0.68 + rng() * halfSize * 0.16), halfSize);
  const endZ = clampToPlayArea(junctionZ + side * (40 + rng() * 110), halfSize);

  return {
    junction: [junctionX, junctionZ],
    segment: {
      halfWidth: Math.max(3.2, GAME_CONFIG.roads.halfWidth - 0.8 + rng()),
      points: [
        [junctionX, junctionZ],
        [turnX, turnZ],
        [endX, endZ],
      ],
    },
  };
}

export function generateRoadNetwork(mapSize: MapSize, seed: number): RoadNetwork {
  const terrainSize = MAP_METERS_BY_SIZE[mapSize];
  const halfSize = terrainSize * 0.45;
  const rng = mulberry32(seed ^ terrainSize);
  const crossZ = pushAwayFromCenter((rng() - 0.5) * terrainSize * 0.22, terrainSize * 0.08);
  const vertical = createVerticalRoad(halfSize, crossZ, rng);
  let [crossX] = interpolatePoint(vertical.points, crossZ);
  crossX = pushAwayFromCenter(crossX, terrainSize * 0.06);
  const horizontal = createHorizontalRoad(halfSize, crossX, crossZ, rng);
  const segments = [vertical, horizontal];
  const junctions: [number, number][] = [[crossX, crossZ]];

  if (rng() > 0.28) {
    segments.push(createDiagonalSpur(halfSize, crossX, crossZ, rng));
  }

  if (rng() > 0.42) {
    const branchZ = clampToPlayArea(crossZ + (rng() > 0.5 ? 1 : -1) * (180 + rng() * 180), halfSize * 0.9);
    const sideRoad = createSideRoadFromVertical(halfSize, vertical.points, branchZ, rng);
    segments.push(sideRoad.segment);
    junctions.push(sideRoad.junction);
  }

  return { seed, terrainSize, segments, junctions };
}

function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number; dist: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;

  if (lenSq === 0) {
    const d = Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
    return { x: ax, z: az, dist: d };
  }

  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cz = az + t * dz;
  const dist = Math.sqrt((px - cx) ** 2 + (pz - cz) ** 2);

  return { x: cx, z: cz, dist };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface RoadInfluence {
  influence: number;
  closestX: number;
  closestZ: number;
}

export function getRoadInfluence(x: number, z: number, network: RoadNetwork): RoadInfluence {
  const blendMargin = GAME_CONFIG.roads.blendMargin;
  let bestDist = Infinity;
  let bestX = 0;
  let bestZ = 0;
  let bestHalfWidth = GAME_CONFIG.roads.halfWidth;

  for (const segment of network.segments) {
    const pts = segment.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const result = closestPointOnSegment(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (result.dist < bestDist) {
        bestDist = result.dist;
        bestX = result.x;
        bestZ = result.z;
        bestHalfWidth = segment.halfWidth;
      }
    }
  }

  const influence = 1 - smoothstep(bestHalfWidth - blendMargin * 0.5, bestHalfWidth + blendMargin, bestDist);
  return { influence, closestX: bestX, closestZ: bestZ };
}

export function isOnRoadForNetwork(x: number, z: number, network: RoadNetwork, extraMargin: number = 0): boolean {
  for (const segment of network.segments) {
    const pts = segment.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const result = closestPointOnSegment(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (result.dist < segment.halfWidth + extraMargin) return true;
    }
  }
  return false;
}
