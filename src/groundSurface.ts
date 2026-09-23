import type { RoadNetwork } from './roads';
import { GAME_CONFIG } from './config';
import { CROP_SOIL, type BuildingInstance, type FarmlandPlot } from './buildings';

export type GroundSurfaceKind = 'grass' | 'mud' | 'road';

export interface GroundSurface {
  road: number;  // 0..1 gravel road weight
  mud: number;   // 0..1 exposed soil weight (farmland, building yards)
  grass: number; // 0..1 remaining turf
  kind: GroundSurfaceKind;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Same rotated-rectangle falloff the terrain splat rasterizes for exposed soil.
function soilPatch(x: number, z: number, cx: number, cz: number, width: number, depth: number, angle: number, blend: number, strength: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = x - cx;
  const dz = z - cz;
  const localX = dx * c + dz * s;
  const localZ = -dx * s + dz * c;
  const distance = Math.hypot(Math.max(0, Math.abs(localX) - width / 2), Math.max(0, Math.abs(localZ) - depth / 2));
  const t = Math.max(0, 1 - distance / blend);
  return t * t * (3 - 2 * t) * strength;
}

/**
 * CPU mirror of the terrain splat (`terrainSplat.ts` + `GroundMaterial.tsx`), so gameplay
 * effects match the surface the player sees. The shader's macro-noise soil speckle is omitted.
 */
export function sampleGroundSurface(
  x: number,
  z: number,
  network: RoadNetwork,
  farmlands: FarmlandPlot[],
  buildings: BuildingInstance[],
): GroundSurface {
  let roadDistance = Infinity;
  for (const road of network.segments) {
    const pts = road.points;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const dx = bx - ax;
      const dz = bz - az;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
      roadDistance = Math.min(roadDistance, Math.hypot(x - ax - t * dx, z - az - t * dz) - road.halfWidth);
    }
  }
  const road = 1 - smoothstep(-1, 2, roadDistance);

  let soil = 0;
  for (const plot of farmlands) {
    soil = Math.max(soil, soilPatch(x, z, plot.center[0], plot.center[2], plot.width, plot.depth, plot.rotation, GAME_CONFIG.farmland.edgeBlend, CROP_SOIL[plot.crop]));
  }
  for (const b of buildings) {
    soil = Math.max(soil, soilPatch(x, z, b.position[0], b.position[2], b.width + 3, b.depth + 3, b.rotation, 5, 1));
  }

  const mud = soil * (1 - road);
  const grass = (1 - road) * (1 - soil);
  const kind: GroundSurfaceKind = road >= mud && road >= grass ? 'road' : (mud >= grass ? 'mud' : 'grass');
  return { road, mud, grass, kind };
}
