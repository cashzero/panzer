import { GAME_CONFIG } from './config';
import type { RoadNetwork } from './roads';
import { getRoadInfluence, isOnRoadForNetwork } from './roads';
import type { BuildingInstance, FarmlandPlot } from './buildings';
import { isPointInsideFarmland, isPointNearAnyBuilding } from './buildings';
import { sampleTerrainHeight } from './terrainHeight';
import { planFieldBoundaries, plotToWorld } from './fieldBoundaries';
import { landUseAt } from './landUse';
import { isPointInYard, type FarmYard } from './landLayout';

export interface TreeInstance {
  position: [number, number, number];
  rotation: number;
  scale: number;
  type: 'deciduous' | 'conifer';
  /** Where the tree grows: inside a wood, in a field-edge or roadside row, or alone. Visual only. */
  habitat: 'wood' | 'line' | 'lone';
  health: number;
  fallen: boolean;
  fallDirection: number;
  fallProgress: number;
}

/** World seed offset for trees and the field-boundary plan they share with hedges. */
export const TREE_SEED_OFFSET = 43;

/** A copse or plantation, planned before the fields so the fields leave it clear. */
export interface WoodSite {
  x: number;
  z: number;
  radius: number;
  conifer: boolean;
  /** Phases of the outline's lobes. */
  lobes: [number, number, number];
  /** Part of a forest zone: planted wider and filled after the copses. */
  forest?: boolean;
}

/** Wood outline radius toward `angle`: a blob rather than a circle. */
function woodOutline(site: WoodSite, angle: number) {
  return site.radius * (0.72 + 0.16 * Math.sin(angle * 2 + site.lobes[0])
    + 0.1 * Math.sin(angle * 3 + site.lobes[1]) + 0.06 * Math.sin(angle * 5 + site.lobes[2]));
}

export function planWoods(mapScale: number, roadNetwork: RoadNetwork, seed: number): WoodSite[] {
  const cfg = GAME_CONFIG.trees;
  const rng = mulberry32(seed ^ 0x2545f491);
  const halfRange = cfg.maxPlacementRadius * mapScale;
  const woods: WoodSite[] = [];
  const count = Math.round(cfg.woodsPerKm2 * mapScale * mapScale);
  for (let w = 0; w < count; w++) {
    const x = (rng() * 2 - 1) * halfRange * 0.92;
    const z = (rng() * 2 - 1) * halfRange * 0.92;
    const radius = cfg.woodRadius[0] + rng() * (cfg.woodRadius[1] - cfg.woodRadius[0]);
    const site: WoodSite = { x, z, radius, conifer: rng() < 0.55, lobes: [rng() * 6.28, rng() * 6.28, rng() * 6.28] };
    const nearestVillage = roadNetwork.junctions.reduce((best, [jx, jz]) => Math.min(best, Math.hypot(x - jx, z - jz)), Infinity);
    if (nearestVillage < GAME_CONFIG.farmland.villageTreeSuppressionRadius + radius * 0.5) continue;
    if (Math.hypot(x, z) < cfg.exclusionFromCenter + radius) continue;
    // Copses belong to open land and field corners, not the middle of the arable.
    if (landUseAt(x, z, roadNetwork.seed) === 'farm' && rng() < 0.6) continue;
    woods.push(site);
  }
  // Forest zones: overlapping woods tile each zone into one large forest.
  const step = 95;
  for (let x = -halfRange + step / 2; x < halfRange; x += step) {
    for (let z = -halfRange + step / 2; z < halfRange; z += step) {
      const cx = x + (rng() - 0.5) * step * 0.5, cz = z + (rng() - 0.5) * step * 0.5;
      if (landUseAt(cx, cz, roadNetwork.seed) !== 'forest') continue;
      if (Math.hypot(cx, cz) < cfg.exclusionFromCenter + 80) continue;
      // Villages keep their fields and orchards; the forest stops short of them.
      if (roadNetwork.junctions.some(([jx, jz]) => Math.hypot(cx - jx, cz - jz) < GAME_CONFIG.farmland.villageTreeSuppressionRadius + 100)) continue;
      // Each forest is either broadleaf or plantation conifer, decided per zone.
      const zoneHash = Math.sin(Math.floor(cx / 600) * 12.9898 + Math.floor(cz / 600) * 78.233 + seed * 0.001) * 43758.5453;
      const conifer = zoneHash - Math.floor(zoneHash) > 0.5;
      woods.push({ x: cx, z: cz, radius: 60 + rng() * 25, conifer, lobes: [rng() * 6.28, rng() * 6.28, rng() * 6.28], forest: true });
    }
  }
  return woods;
}

/** Grid lookup of the plots near a point, so tree placement scales with map size. */
export function createFarmlandLookup(farmlands: FarmlandPlot[], cell = 64) {
  const cells = new Map<number, number[]>();
  const key = (ix: number, iz: number) => ix * 73856093 ^ iz * 19349663;
  farmlands.forEach((plot, index) => {
    const reach = Math.hypot(plot.width, plot.depth) / 2 + 8;
    for (let ix = Math.floor((plot.center[0] - reach) / cell); ix <= Math.floor((plot.center[0] + reach) / cell); ix++) {
      for (let iz = Math.floor((plot.center[2] - reach) / cell); iz <= Math.floor((plot.center[2] + reach) / cell); iz++) {
        const list = cells.get(key(ix, iz));
        if (list) list.push(index); else cells.set(key(ix, iz), [index]);
      }
    }
  });
  return (x: number, z: number, margin: number) =>
    (cells.get(key(Math.floor(x / cell), Math.floor(z / cell))) ?? []).some((index) => isPointInsideFarmland(x, z, farmlands[index], margin));
}

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
  woods: WoodSite[] = planWoods(mapScale, roadNetwork, seed),
  yards: FarmYard[] = [],
): TreeInstance[] {
  const cfg = GAME_CONFIG.trees;
  const rng = mulberry32(seed ^ 0x3c6ef372);
  const trees: TreeInstance[] = [];
  const area = mapScale * mapScale; // relative to a 1 km map
  const maxTrees = Math.round(cfg.maxCountPerKm2 * area);
  const halfRange = cfg.maxPlacementRadius * mapScale;
  const grid = new SpacingGrid(cfg.minSpacing * 2);
  const inFarmland = createFarmlandLookup(farmlands);

  const tryPlace = (x: number, z: number, type: TreeInstance['type'], spacing: number,
    habitat: TreeInstance['habitat'], allowFieldEdge = false, inPlot = false, scale = 0.8 + rng() * 0.5) => {
    if (trees.length >= maxTrees) return false;
    if (Math.abs(x) > halfRange || Math.abs(z) > halfRange) return false;
    if (Math.hypot(x, z) < cfg.exclusionFromCenter) return false;
    if (isOnRoadForNetwork(x, z, roadNetwork, cfg.exclusionFromRoad)) return false;
    if (isPointNearAnyBuilding(x, z, buildings, cfg.exclusionFromBuilding)) return false;
    if (yards.some((yard) => isPointInYard(x, z, yard, 3))) return false;
    const margin = allowFieldEdge ? 0.5 : GAME_CONFIG.farmland.treeExclusionMargin;
    if (!inPlot && inFarmland(x, z, margin)) return false;
    if (!grid.isFree(x, z, spacing)) return false;
    grid.add(x, z);
    trees.push({
      position: [x, sampleTerrainHeight(x, z, roadNetwork, getRoadInfluence), z],
      rotation: rng() * Math.PI * 2,
      scale,
      type,
      habitat,
      health: cfg.health,
      fallen: false,
      fallDirection: 0,
      fallProgress: 0,
    });
    return true;
  };

  // Orchards: fruit trees in rows across the plot.
  for (const plot of farmlands) {
    if (plot.crop !== 'orchard') continue;
    const spacing = GAME_CONFIG.farmland.orchardSpacing;
    for (let lx = -plot.width / 2 + spacing / 2; lx < plot.width / 2; lx += spacing) {
      for (let lz = -plot.depth / 2 + spacing / 2; lz < plot.depth / 2; lz += spacing) {
        const [x, z] = plotToWorld(plot, lx, lz);
        tryPlace(x, z, 'deciduous', spacing * 0.8, 'line', true, true, 0.5 + rng() * 0.15);
      }
    }
  }

  // Hedgerow and field-edge trees, broadleaf, loosely spaced.
  for (const boundary of planFieldBoundaries(farmlands, seed)) {
    if (boundary.kind !== 'treeline') continue;
    const [ax, az] = boundary.from;
    const [bx, bz] = boundary.to;
    const length = Math.hypot(bx - ax, bz - az);
    for (let d = rng() * 6; d < length; d += 8 + rng() * 6) {
      const t = d / length;
      tryPlace(ax + (bx - ax) * t + (rng() - 0.5) * 1.5, az + (bz - az) * t + (rng() - 0.5) * 1.5,
        rng() < 0.85 ? 'deciduous' : 'conifer', cfg.minSpacing * 0.8, 'line', true);
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
          tryPlace(cx + nx * offset * sign, cz + nz * offset * sign, 'deciduous', cfg.minSpacing, 'line');
        }
      }
    }
  }

  // Lone trees, mostly out on the open grazing land.
  const loneCount = Math.round(cfg.lonePerKm2 * area);
  let lone = 0;
  for (let i = 0; i < loneCount * 4 && lone < loneCount; i++) {
    const x = (rng() * 2 - 1) * halfRange, z = (rng() * 2 - 1) * halfRange;
    if (landUseAt(x, z, roadNetwork.seed) !== 'open' && rng() < 0.8) continue;
    if (tryPlace(x, z, rng() < 0.7 ? 'deciduous' : 'conifer', cfg.minSpacing * 3, 'lone')) lone++;
  }

  // Copses and plantations: blobby outlines filled at woodland density;
  // forest zones last, at wider spacing, with whatever of the budget remains.
  for (const wood of [...woods.filter((w) => !w.forest), ...woods.filter((w) => w.forest)]) {
    if (trees.length >= maxTrees) break;
    const spacing = wood.forest ? cfg.forestSpacing : cfg.woodSpacing;
    const attempts = Math.round((Math.PI * wood.radius * wood.radius) / (spacing * spacing) * 1.6);
    for (let a = 0; a < attempts; a++) {
      const angle = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * woodOutline(wood, angle);
      tryPlace(wood.x + Math.cos(angle) * r, wood.z + Math.sin(angle) * r,
        (rng() < (wood.conifer ? 0.82 : 0.22)) ? 'conifer' : 'deciduous', spacing, 'wood');
    }
  }

  return trees;
}
