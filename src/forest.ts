import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import type { RoadNetwork } from './roads';
import type { BuildingInstance, FarmlandPlot } from './buildings';
import { isPointInYard, type FarmYard } from './landLayout';
import { createFarmlandLookup, woodOutline, type WoodSite } from './trees';

/**
 * Forests as gameplay terrain. Individual trees only ever blocked a tank or a
 * line of sight with their 1 m trunks, so a wood was as open as a field
 * between them. Here the large woods are rasterised once per world into a
 * grid holding the signed distance to the forest edge, and that grid, not the
 * trees, decides:
 * - movement: tanks cannot enter, and slide along the edge;
 * - sight: a line through more than FOREST.sightDepth metres of forest below
 *   the canopy is blocked, so a tank at the edge sees out and is seen, but
 *   nobody sees through a wood;
 * - shells: a round that gets deeper than FOREST.shellDepth into the forest
 *   strikes a tree;
 * - AI routes, which go around.
 * Roads cut lanes through, as rides do through real woods.
 */

export const FOREST = {
  /** Grid cell size, m. */
  cell: 4,
  /** Copses at least this large (outline radius, m) count as forest. */
  minWoodRadius: 80,
  /** Metres of forest below the canopy that block a line of sight. */
  sightDepth: 30,
  /** Canopy top above the ground, m: sight lines above it pass over. */
  canopyHeight: 15,
  /** Depth at which a shell is taken to strike a tree. */
  shellDepth: 8,
  /** Clear margin either side of a road through the forest, m. */
  roadMargin: 5,
  /** Fragments smaller than this (m²) are left open. */
  minArea: 600,
} as const;

export interface ForestMap {
  cell: number;
  /** World coordinate of the grid's first cell edge, both axes. */
  origin: number;
  /** Cells per side. */
  size: number;
  /**
   * Signed distance to the forest edge at each cell centre, m: positive
   * inside (depth into the forest), negative outside (clearance).
   */
  depth: Float32Array;
  /** Index into `sites` of the wood each forest cell belongs to, or -1. */
  site: Int16Array;
  sites: WoodSite[];
  /** Whether any cell is forest. */
  any: boolean;
}

/** Whether a planned wood is big enough to be forest rather than a copse. */
export function isForestWood(site: WoodSite) {
  return site.forest === true || site.radius >= FOREST.minWoodRadius;
}

const FAR_OUTSIDE = -1000;

export function buildForestMap(
  mapScale: number,
  woods: WoodSite[],
  roadNetwork: RoadNetwork,
  buildings: BuildingInstance[],
  farmlands: FarmlandPlot[],
  yards: FarmYard[],
): ForestMap {
  const cell = FOREST.cell;
  const half = GAME_CONFIG.trees.maxPlacementRadius * mapScale;
  const size = Math.ceil((half * 2) / cell);
  const origin = -half;
  const count = size * size;
  const inside = new Uint8Array(count);
  const site = new Int16Array(count).fill(-1);
  const sites = woods.filter(isForestWood);
  const toCell = (v: number) => Math.floor((v - origin) / cell);
  const centre = (i: number) => origin + (i + 0.5) * cell;

  // Fill each wood's outline.
  sites.forEach((wood, index) => {
    const reach = wood.radius * 1.2;
    const i0 = Math.max(0, toCell(wood.x - reach)), i1 = Math.min(size - 1, toCell(wood.x + reach));
    const j0 = Math.max(0, toCell(wood.z - reach)), j1 = Math.min(size - 1, toCell(wood.z + reach));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = centre(i) - wood.x, dz = centre(j) - wood.z;
        if (Math.hypot(dx, dz) > woodOutline(wood, Math.atan2(dz, dx))) continue;
        const k = j * size + i;
        inside[k] = 1;
        if (site[k] < 0) site[k] = index;
      }
    }
  });

  const clearDisc = (x: number, z: number, radius: number) => {
    const i0 = Math.max(0, toCell(x - radius)), i1 = Math.min(size - 1, toCell(x + radius));
    const j0 = Math.max(0, toCell(z - radius)), j1 = Math.min(size - 1, toCell(z + radius));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (Math.hypot(centre(i) - x, centre(j) - z) <= radius) inside[j * size + i] = 0;
      }
    }
  };
  // Rides along the roads, clearings round buildings and the spawn ground.
  for (const road of roadNetwork.segments) {
    const radius = road.halfWidth + FOREST.roadMargin;
    for (let p = 1; p < road.points.length; p++) {
      const [ax, az] = road.points[p - 1], [bx, bz] = road.points[p];
      const length = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(length / 2));
      for (let s = 0; s <= steps; s++) clearDisc(ax + (bx - ax) * (s / steps), az + (bz - az) * (s / steps), radius);
    }
  }
  for (const building of buildings) {
    clearDisc(building.position[0], building.position[2], Math.hypot(building.width, building.depth) / 2 + 6);
  }
  clearDisc(0, 0, GAME_CONFIG.trees.exclusionFromCenter);
  const inFarmland = createFarmlandLookup(farmlands);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      if (!inside[k]) continue;
      const x = centre(i), z = centre(j);
      if (inFarmland(x, z, 1) || yards.some((yard) => isPointInYard(x, z, yard, 4))) inside[k] = 0;
    }
  }

  removeSmallFragments(inside, size, Math.ceil(FOREST.minArea / (cell * cell)));
  let any = false;
  for (let k = 0; k < count; k++) {
    if (!inside[k]) site[k] = -1;
    else any = true;
  }
  return { cell, origin, size, depth: signedDistance(inside, size, cell), site, sites, any };
}

/** Clears 4-connected forest fragments smaller than minCells. */
function removeSmallFragments(inside: Uint8Array, size: number, minCells: number) {
  const seen = new Uint8Array(inside.length);
  const stack: number[] = [];
  const component: number[] = [];
  for (let start = 0; start < inside.length; start++) {
    if (!inside[start] || seen[start]) continue;
    component.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      component.push(k);
      const i = k % size, j = (k - i) / size;
      if (i > 0 && inside[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
      if (i < size - 1 && inside[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
      if (j > 0 && inside[k - size] && !seen[k - size]) { seen[k - size] = 1; stack.push(k - size); }
      if (j < size - 1 && inside[k + size] && !seen[k + size]) { seen[k + size] = 1; stack.push(k + size); }
    }
    if (component.length < minCells) for (const k of component) inside[k] = 0;
  }
}

/**
 * Chamfer (3-4) distance from every cell to the nearest cell of the other
 * kind, signed positive inside. Within about 8% of Euclidean, which is ample
 * for an edge that is itself 4 m cells.
 */
function signedDistance(inside: Uint8Array, size: number, cell: number) {
  const distanceTo = (target: number) => {
    const d = new Float32Array(inside.length).fill(Infinity);
    for (let k = 0; k < inside.length; k++) if (inside[k] === target) d[k] = 0;
    const orth = 1, diag = Math.SQRT2;
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const k = j * size + i;
        if (d[k] === 0) continue;
        let best = d[k];
        if (i > 0) best = Math.min(best, d[k - 1] + orth);
        if (j > 0) {
          best = Math.min(best, d[k - size] + orth);
          if (i > 0) best = Math.min(best, d[k - size - 1] + diag);
          if (i < size - 1) best = Math.min(best, d[k - size + 1] + diag);
        }
        d[k] = best;
      }
    }
    for (let j = size - 1; j >= 0; j--) {
      for (let i = size - 1; i >= 0; i--) {
        const k = j * size + i;
        if (d[k] === 0) continue;
        let best = d[k];
        if (i < size - 1) best = Math.min(best, d[k + 1] + orth);
        if (j < size - 1) {
          best = Math.min(best, d[k + size] + orth);
          if (i < size - 1) best = Math.min(best, d[k + size + 1] + diag);
          if (i > 0) best = Math.min(best, d[k + size - 1] + diag);
        }
        d[k] = best;
      }
    }
    return d;
  };
  const toOutside = distanceTo(0);
  const toInside = distanceTo(1);
  const depth = new Float32Array(inside.length);
  for (let k = 0; k < inside.length; k++) {
    // Cell distances run centre to centre; the edge lies half a cell between.
    depth[k] = inside[k]
      ? (toOutside[k] - 0.5) * cell
      : Number.isFinite(toInside[k]) ? -(toInside[k] - 0.5) * cell : FAR_OUTSIDE;
  }
  return depth;
}

/** Signed distance to the forest edge at a point (bilinear), m; positive inside. */
export function forestDepthAt(map: ForestMap, x: number, z: number) {
  if (!map.any) return FAR_OUTSIDE;
  const fx = (x - map.origin) / map.cell - 0.5, fz = (z - map.origin) / map.cell - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= map.size - 1 || j >= map.size - 1) return FAR_OUTSIDE;
  const tx = fx - i, tz = fz - j;
  const k = j * map.size + i;
  const d = map.depth;
  return (d[k] * (1 - tx) + d[k + 1] * tx) * (1 - tz) + (d[k + map.size] * (1 - tx) + d[k + map.size + 1] * tx) * tz;
}

/** The wood a forest point belongs to (nearest cell), or null. */
export function forestSiteAt(map: ForestMap, x: number, z: number) {
  const i = Math.floor((x - map.origin) / map.cell), j = Math.floor((z - map.origin) / map.cell);
  if (i < 0 || j < 0 || i >= map.size || j >= map.size) return null;
  const index = map.site[j * map.size + i];
  return index >= 0 ? map.sites[index] : null;
}

/**
 * Keeps a circle of `radius` out of the forest: pushes the point back along
 * the depth gradient until it clears the edge. Returns true if it moved.
 */
export function pushOutOfForest(map: ForestMap, point: { x: number; z: number }, radius: number) {
  let moved = false;
  for (let iteration = 0; iteration < 3; iteration++) {
    const depth = forestDepthAt(map, point.x, point.z);
    const overlap = depth + radius;
    if (overlap <= 0) break;
    const h = map.cell * 0.5;
    let gx = forestDepthAt(map, point.x + h, point.z) - forestDepthAt(map, point.x - h, point.z);
    let gz = forestDepthAt(map, point.x, point.z + h) - forestDepthAt(map, point.x, point.z - h);
    const length = Math.hypot(gx, gz);
    if (length < 1e-6) break;
    gx /= length; gz /= length;
    // Depth rises inward: step against the gradient, a little past the edge.
    point.x -= gx * (overlap + 0.05);
    point.z -= gz * (overlap + 0.05);
    moved = true;
  }
  return moved;
}

/**
 * Metres of forest a straight line crosses below the canopy. `heightAt`
 * gives the ground height; the line passes over any forest where it runs
 * higher than the canopy top. Walks the grid cell by cell.
 */
export function forestLengthAlong(
  map: ForestMap,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  heightAt: (x: number, z: number) => number,
  stopAt = Infinity,
) {
  if (!map.any) return 0;
  const dx = bx - ax, dz = bz - az;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return 0;
  // Sample every half cell: exact enough for a 30 m threshold and simpler
  // than an exact grid walk with the height test.
  const step = map.cell * 0.5;
  const steps = Math.ceil(length / step);
  const piece = length / steps;
  let total = 0;
  for (let s = 0; s < steps; s++) {
    const t = (s + 0.5) / steps;
    const x = ax + dx * t, z = az + dz * t;
    if (forestDepthAt(map, x, z) <= 0) continue;
    const y = ay + (by - ay) * t;
    if (y > heightAt(x, z) + FOREST.canopyHeight) continue;
    total += piece;
    if (total >= stopAt) return total;
  }
  return total;
}

/**
 * Where a shell travelling from `a` to `b` in one step first gets deeper than
 * FOREST.shellDepth into forest below the canopy, or null. The edge trees in
 * front of that depth are still modelled and hit one by one.
 */
export function forestStrikeAlong(
  map: ForestMap,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  heightAt: (x: number, z: number) => number,
): THREE.Vector3 | null {
  if (!map.any) return null;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(length / 2));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (forestDepthAt(map, x, z) < FOREST.shellDepth) continue;
    const y = a.y + (b.y - a.y) * t;
    if (y > heightAt(x, z) + FOREST.canopyHeight) continue;
    return new THREE.Vector3(x, y, z);
  }
  return null;
}

// The forest of the world in play. Set when a world is generated, read by
// movement, sight and shell code that has no other route to the world state.
let activeForest: ForestMap | null = null;

export function setActiveForest(map: ForestMap | null) {
  activeForest = map;
}

export function getActiveForest() {
  return activeForest;
}
