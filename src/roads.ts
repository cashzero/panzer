import { GAME_CONFIG } from './config';

export interface RoadSegment {
  points: [number, number][]; // XZ waypoints
  halfWidth: number;
}

// Road network: crossroads layout
const ROAD_SEGMENTS: RoadSegment[] = [
  // Main N-S road (slightly curved)
  {
    points: [
      [15, -450],
      [10, -200],
      [5, -50],
      [0, 0],
      [-5, 100],
      [-10, 250],
      [-8, 450],
    ],
    halfWidth: GAME_CONFIG.roads.halfWidth,
  },
  // E-W crossroad
  {
    points: [
      [-450, 60],
      [-200, 50],
      [-50, 30],
      [0, 0],
      [80, -20],
      [200, -30],
      [450, -25],
    ],
    halfWidth: GAME_CONFIG.roads.halfWidth,
  },
];

function closestPointOnSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number
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
  influence: number;  // 0 = off road, 1 = road center
  closestX: number;
  closestZ: number;
}

export function getRoadInfluence(x: number, z: number): RoadInfluence {
  const blendMargin = GAME_CONFIG.roads.blendMargin;
  let bestDist = Infinity;
  let bestX = 0;
  let bestZ = 0;
  let bestHalfWidth = GAME_CONFIG.roads.halfWidth;

  for (const segment of ROAD_SEGMENTS) {
    const pts = segment.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const result = closestPointOnSegment(
        x, z,
        pts[i][0], pts[i][1],
        pts[i + 1][0], pts[i + 1][1]
      );
      if (result.dist < bestDist) {
        bestDist = result.dist;
        bestX = result.x;
        bestZ = result.z;
        bestHalfWidth = segment.halfWidth;
      }
    }
  }

  // influence: 1 at center, smooth falloff to 0 at halfWidth + blendMargin
  const influence = 1 - smoothstep(bestHalfWidth - blendMargin * 0.5, bestHalfWidth + blendMargin, bestDist);

  return { influence, closestX: bestX, closestZ: bestZ };
}

export function isOnRoad(x: number, z: number, extraMargin: number = 0): boolean {
  const halfWidth = GAME_CONFIG.roads.halfWidth;
  for (const segment of ROAD_SEGMENTS) {
    const pts = segment.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const result = closestPointOnSegment(
        x, z,
        pts[i][0], pts[i][1],
        pts[i + 1][0], pts[i + 1][1]
      );
      if (result.dist < halfWidth + extraMargin) return true;
    }
  }
  return false;
}
