import { GAME_CONFIG } from './config';
import type { RoadNetwork } from './roads';
import { getRoadInfluence, isOnRoadForNetwork } from './roads';
import type { BuildingInstance, FarmlandPlot } from './buildings';
import { isPointInsideFarmland, isPointNearAnyBuilding } from './buildings';
import { sampleTerrainHeight } from './terrainHeight';
import { planFieldBoundaries } from './fieldBoundaries';

export interface TreeInstance {
  position: [number, number, number];
  rotation: number;
  scale: number;
  type: 'deciduous' | 'conifer';
  health: number;
  fallen: boolean;
  fallDirection: number;
  fallProgress: number;
}

/** World seed offset for trees and the field-boundary plan they share with hedges. */
export const TREE_SEED_OFFSET = 43;

// Seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spacing test through a coarse hash grid, so placement stays linear. */
class SpacingGrid {
  private cells = new Map<number, Array<[number, number]>>();
  constructor(private cell: number) {}
  private key(ix: number, iz: number) { return ix * 73856093 ^ iz * 19349663; }
  isFree(x: number, z: number, spacing: number) {
    const ix = Math.floor(x / this.cell), iz = Math.floor(z / this.cell);
    const spacingSq = spacing * spacing;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const [px, pz] of this.cells.get(this.key(ix + dx, iz + dz)) ?? []) {
          if ((px - x) * (px - x) + (pz - z) * (pz - z) < spacingSq) return false;
        }
      }
    }
    return true;
  }
  add(x: number, z: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    const list = this.cells.get(k);
    if (list) list.push([x, z]); else this.cells.set(k, [[x, z]]);
  }
}

/**
 * Woodland reads like a real landscape rather than an even scatter: copses and
 * plantations, trees along field boundaries and some roads, a few lone trees.
 */
export function generateTrees(
  mapScale: number = 1,
  roadNetwork: RoadNetwork,
  buildings: BuildingInstance[] = [],
  farmlands: FarmlandPlot[] = [],
  seed: number = GAME_CONFIG.trees.seed,
): TreeInstance[] {
  const cfg = GAME_CONFIG.trees;
  const rng = mulberry32(seed ^ 0x3c6ef372);
  const trees: TreeInstance[] = [];
  const area = mapScale * mapScale; // relative to a 1 km map
  const maxTrees = Math.round(cfg.maxCountPerKm2 * area);
  const halfRange = cfg.maxPlacementRadius * mapScale;
  const grid = new SpacingGrid(cfg.minSpacing * 2);

  const tryPlace = (x: number, z: number, type: TreeInstance['type'], spacing: number, allowFieldEdge = false) => {
    if (trees.length >= maxTrees) return false;
    if (Math.abs(x) > halfRange || Math.abs(z) > halfRange) return false;
    if (Math.hypot(x, z) < cfg.exclusionFromCenter) return false;
    if (isOnRoadForNetwork(x, z, roadNetwork, cfg.exclusionFromRoad)) return false;
    if (isPointNearAnyBuilding(x, z, buildings, cfg.exclusionFromBuilding)) return false;
    const margin = allowFieldEdge ? 0.5 : GAME_CONFIG.farmland.treeExclusionMargin;
    if (farmlands.some((plot) => isPointInsideFarmland(x, z, plot, margin))) return false;
    if (!grid.isFree(x, z, spacing)) return false;
    grid.add(x, z);
    trees.push({
      position: [x, sampleTerrainHeight(x, z, roadNetwork, getRoadInfluence), z],
      rotation: rng() * Math.PI * 2,
      scale: 0.8 + rng() * 0.5,
      type,
      health: cfg.health,
      fallen: false,
      fallDirection: 0,
      fallProgress: 0,
    });
    return true;
  };

  // Hedgerow and field-edge trees, broadleaf, loosely spaced.
  for (const boundary of planFieldBoundaries(farmlands, seed)) {
    if (boundary.kind !== 'treeline') continue;
    const [ax, az] = boundary.from;
    const [bx, bz] = boundary.to;
    const length = Math.hypot(bx - ax, bz - az);
    for (let d = rng() * 6; d < length; d += 8 + rng() * 6) {
      const t = d / length;
      tryPlace(ax + (bx - ax) * t + (rng() - 0.5) * 1.5, az + (bz - az) * t + (rng() - 0.5) * 1.5,
        rng() < 0.85 ? 'deciduous' : 'conifer', cfg.minSpacing * 0.8, true);
    }
  }

  // Roadside rows (the plane-tree avenues of rural France) along some segments.
  for (const road of roadNetwork.segments) {
    if (rng() > cfg.roadsideRowChance) continue;
    const side = rng() < 0.5 ? 1 : -1;
    const both = rng() < 0.4;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1];
      const [bx, bz] = road.points[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 1) continue;
      const nx = -(bz - az) / length, nz = (bx - ax) / length;
      const offset = road.halfWidth + cfg.exclusionFromRoad + 1;
      for (let d = 6; d < length; d += 12 + rng() * 3) {
        const t = d / length;
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        for (const sign of both ? [1, -1] : [side]) {
          tryPlace(cx + nx * offset * sign, cz + nz * offset * sign, 'deciduous', cfg.minSpacing);
        }
      }
    }
  }

  // Copses and plantations: blobby outlines filled at woodland density.
  const woodCount = Math.round(cfg.woodsPerKm2 * area);
  for (let w = 0; w < woodCount && trees.length < maxTrees; w++) {
    const cx = (rng() * 2 - 1) * halfRange * 0.92;
    const cz = (rng() * 2 - 1) * halfRange * 0.92;
    const nearestVillage = roadNetwork.junctions.reduce((best, [jx, jz]) => Math.min(best, Math.hypot(cx - jx, cz - jz)), Infinity);
    if (nearestVillage < GAME_CONFIG.farmland.villageTreeSuppressionRadius) continue;
    const radius = cfg.woodRadius[0] + rng() * (cfg.woodRadius[1] - cfg.woodRadius[0]);
    const conifer = rng() < 0.55;
    const lobes = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
    const outline = (angle: number) => radius * (0.72 + 0.16 * Math.sin(angle * 2 + lobes[0])
      + 0.1 * Math.sin(angle * 3 + lobes[1]) + 0.06 * Math.sin(angle * 5 + lobes[2]));
    const attempts = Math.round((Math.PI * radius * radius) / (cfg.woodSpacing * cfg.woodSpacing) * 1.6);
    for (let a = 0; a < attempts; a++) {
      const angle = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * outline(angle);
      tryPlace(cx + Math.cos(angle) * r, cz + Math.sin(angle) * r,
        (rng() < (conifer ? 0.82 : 0.22)) ? 'conifer' : 'deciduous', cfg.woodSpacing);
    }
  }

  // A few lone field trees.
  const loneCount = Math.round(cfg.lonePerKm2 * area);
  let lone = 0;
  for (let i = 0; i < loneCount * 3 && lone < loneCount; i++) {
    if (tryPlace((rng() * 2 - 1) * halfRange, (rng() * 2 - 1) * halfRange, rng() < 0.7 ? 'deciduous' : 'conifer', cfg.minSpacing * 3)) lone++;
  }

  return trees;
}
