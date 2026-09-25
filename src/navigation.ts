import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import type { BuildingInstance } from './buildings';
import { forestDepthAt, type ForestMap } from './forest';

/**
 * Routes for AI tanks around forests. AI steering is local: it looks a few
 * dozen metres ahead and turns toward the nearest clear heading, which is
 * enough for a building or a tank but not for a wood several hundred metres
 * across. Where the straight line to a goal crosses forest, a tank now
 * follows an A* route over a coarse grid instead, smoothed to the fewest
 * straight legs, and the local steering handles the last few metres.
 */

const NAV_CELL = 8; // m
/** Waypoints closer than this count as reached. */
const WAYPOINT_REACHED = 12;
/** Replan when the goal has moved this far since the route was made. */
const REPLAN_GOAL_SHIFT = 30;
const REPLAN_INTERVAL_MS = 4000;
// A search gives up after this many cells, so an unreachable goal costs a
// few milliseconds, not a sweep of the whole map. Weighting the heuristic
// trades a slightly longer route for far fewer cells searched.
const MAX_EXPANSIONS = 30000;
const HEURISTIC_WEIGHT = 1.15;

interface NavGrid {
  forest: ForestMap;
  buildings: BuildingInstance[];
  origin: number;
  size: number;
  blocked: Uint8Array;
}

let grid: NavGrid | null = null;

function getGrid(forest: ForestMap, buildings: BuildingInstance[]): NavGrid {
  if (grid && grid.forest === forest && grid.buildings === buildings) return grid;
  const origin = forest.origin;
  const size = Math.ceil((forest.size * forest.cell) / NAV_CELL);
  const blocked = new Uint8Array(size * size);
  const clearance = GAME_CONFIG.tank.collisionRadius + 1;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = origin + (i + 0.5) * NAV_CELL, z = origin + (j + 0.5) * NAV_CELL;
      if (forestDepthAt(forest, x, z) > -clearance) blocked[j * size + i] = 1;
    }
  }
  // Buildings block too, so routes through villages keep to the streets.
  for (const building of buildings) {
    const radius = Math.hypot(building.width, building.depth) / 2 + GAME_CONFIG.tank.collisionRadius;
    const i0 = Math.max(0, Math.floor((building.position[0] - radius - origin) / NAV_CELL));
    const i1 = Math.min(size - 1, Math.floor((building.position[0] + radius - origin) / NAV_CELL));
    const j0 = Math.max(0, Math.floor((building.position[2] - radius - origin) / NAV_CELL));
    const j1 = Math.min(size - 1, Math.floor((building.position[2] + radius - origin) / NAV_CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = origin + (i + 0.5) * NAV_CELL, z = origin + (j + 0.5) * NAV_CELL;
        if (Math.hypot(x - building.position[0], z - building.position[2]) <= radius) blocked[j * size + i] = 1;
      }
    }
  }
  grid = { forest, buildings, origin, size, blocked };
  return grid;
}

const cellOf = (g: NavGrid, x: number, z: number) => {
  const i = Math.min(g.size - 1, Math.max(0, Math.floor((x - g.origin) / NAV_CELL)));
  const j = Math.min(g.size - 1, Math.max(0, Math.floor((z - g.origin) / NAV_CELL)));
  return j * g.size + i;
};
const cellX = (g: NavGrid, k: number) => g.origin + ((k % g.size) + 0.5) * NAV_CELL;
const cellZ = (g: NavGrid, k: number) => g.origin + (Math.floor(k / g.size) + 0.5) * NAV_CELL;

/** Whether a straight drive between two points stays clear of the grid's obstacles. */
function lineClear(g: NavGrid, ax: number, az: number, bx: number, bz: number) {
  const length = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(length / (NAV_CELL * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (g.blocked[cellOf(g, ax + (bx - ax) * t, az + (bz - az) * t)]) return false;
  }
  return true;
}

/** Nearest open cell to k, searching outward in rings, or -1. */
function nearestOpen(g: NavGrid, k: number, maxRings = 40) {
  if (!g.blocked[k]) return k;
  const ci = k % g.size, cj = Math.floor(k / g.size);
  for (let r = 1; r <= maxRings; r++) {
    let best = -1, bestDistance = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= g.size || j >= g.size) continue;
        const n = j * g.size + i;
        const distance = di * di + dj * dj;
        if (!g.blocked[n] && distance < bestDistance) { best = n; bestDistance = distance; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// A* scratch, reused between searches; `stamp` marks which entries are live.
let gScore = new Float32Array(0);
let parent = new Int32Array(0);
let stamp = new Uint32Array(0);
let closed = new Uint32Array(0);
let generation = 0;

function ensureScratch(count: number) {
  if (gScore.length >= count) return;
  gScore = new Float32Array(count);
  parent = new Int32Array(count);
  stamp = new Uint32Array(count);
  closed = new Uint32Array(count);
  generation = 0;
}

/** Binary min-heap of cell indices keyed by f-score. */
class Heap {
  private keys: number[] = [];
  private items: number[] = [];
  get size() { return this.items.length; }
  push(item: number, key: number) {
    const items = this.items, keys = this.keys;
    let n = items.length;
    items.push(item); keys.push(key);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (keys[p] <= key) break;
      items[n] = items[p]; keys[n] = keys[p];
      n = p;
    }
    items[n] = item; keys[n] = key;
  }
  pop() {
    const items = this.items, keys = this.keys;
    const top = items[0];
    const lastItem = items.pop()!, lastKey = keys.pop()!;
    const count = items.length;
    if (count > 0) {
      let n = 0;
      for (;;) {
        const l = n * 2 + 1, r = l + 1;
        let m = n, mKey = lastKey;
        if (l < count && keys[l] < mKey) { m = l; mKey = keys[l]; }
        if (r < count && keys[r] < mKey) { m = r; }
        if (m === n) break;
        items[n] = items[m]; keys[n] = keys[m];
        n = m;
      }
      items[n] = lastItem; keys[n] = lastKey;
    }
    return top;
  }
}

const NEIGHBOURS: Array<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** A* from start to goal cell; returns the cell path, or null. */
function search(g: NavGrid, start: number, goal: number): number[] | null {
  ensureScratch(g.size * g.size);
  generation++;
  const gx = goal % g.size, gz = Math.floor(goal / g.size);
  const heuristic = (k: number) => {
    const dx = Math.abs((k % g.size) - gx), dz = Math.abs(Math.floor(k / g.size) - gz);
    return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * HEURISTIC_WEIGHT;
  };
  let expansions = 0;
  const open = new Heap();
  gScore[start] = 0; parent[start] = -1; stamp[start] = generation;
  open.push(start, heuristic(start));
  while (open.size > 0) {
    const k = open.pop();
    if (closed[k] === generation) continue;
    closed[k] = generation;
    if (++expansions > MAX_EXPANSIONS) return null;
    if (k === goal) {
      const path: number[] = [];
      for (let n = goal; n !== -1; n = parent[n]) path.push(n);
      return path.reverse();
    }
    const ki = k % g.size, kj = Math.floor(k / g.size);
    for (const [di, dj, cost] of NEIGHBOURS) {
      const i = ki + di, j = kj + dj;
      if (i < 0 || j < 0 || i >= g.size || j >= g.size) continue;
      const n = j * g.size + i;
      if (g.blocked[n] || closed[n] === generation) continue;
      // No corner cutting between two blocked cells.
      if (di !== 0 && dj !== 0 && (g.blocked[kj * g.size + i] || g.blocked[j * g.size + ki])) continue;
      const tentative = gScore[k] + cost;
      if (stamp[n] === generation && tentative >= gScore[n]) continue;
      stamp[n] = generation;
      gScore[n] = tentative;
      parent[n] = k;
      open.push(n, tentative + heuristic(n));
    }
  }
  return null;
}

/** Drops waypoints that a straight drive can skip. */
function smooth(g: NavGrid, points: THREE.Vector2[]) {
  const out = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let k = points.length - 1; k > anchor + 1; k--) {
      if (lineClear(g, points[anchor].x, points[anchor].y, points[k].x, points[k].y)) { next = k; break; }
    }
    out.push(points[next]);
    anchor = next;
  }
  return out;
}

/** World-space route from start to goal around obstacles, or null if none. */
export function findRoute(forest: ForestMap, buildings: BuildingInstance[], sx: number, sz: number, gx: number, gz: number) {
  const g = getGrid(forest, buildings);
  const start = nearestOpen(g, cellOf(g, sx, sz));
  const goal = nearestOpen(g, cellOf(g, gx, gz));
  if (start < 0 || goal < 0) return null;
  const cells = search(g, start, goal);
  if (!cells) return null;
  const points = [new THREE.Vector2(sx, sz), ...cells.slice(1, -1).map((k) => new THREE.Vector2(cellX(g, k), cellZ(g, k)))];
  // End at the goal itself when it is reachable, else at the nearest open cell.
  points.push(g.blocked[cellOf(g, gx, gz)] ? new THREE.Vector2(cellX(g, goal), cellZ(g, goal)) : new THREE.Vector2(gx, gz));
  return smooth(g, points);
}

interface Route {
  goal: THREE.Vector2;
  /** Null when no route was found: head straight until the next replan. */
  points: THREE.Vector2[] | null;
  next: number;
  madeAt: number;
}

const routes = new Map<string, Route>();

/**
 * Heading for a tank driving toward `goal`: straight at it while the line is
 * clear, otherwise along a route around the forest. Unit vector in XZ.
 */
export function routeDirection(
  tankId: string, from: THREE.Vector3, goal: THREE.Vector3,
  forest: ForestMap | null, buildings: BuildingInstance[], now = Date.now(),
): THREE.Vector3 {
  const direct = new THREE.Vector3(goal.x - from.x, 0, goal.z - from.z);
  if (direct.lengthSq() < 1e-6) return direct;
  direct.normalize();
  if (!forest || !forest.any) return direct;
  const g = getGrid(forest, buildings);
  // Only forests make local steering fail; buildings alone it handles.
  if (lineClearOfForest(forest, from.x, from.z, goal.x, goal.z)) {
    routes.delete(tankId);
    return direct;
  }

  let route = routes.get(tankId);
  if (!route || route.goal.distanceTo(new THREE.Vector2(goal.x, goal.z)) > REPLAN_GOAL_SHIFT || now - route.madeAt > REPLAN_INTERVAL_MS) {
    const points = findRoute(forest, buildings, from.x, from.z, goal.x, goal.z);
    route = { goal: new THREE.Vector2(goal.x, goal.z), points, next: 1, madeAt: now };
    routes.set(tankId, route);
  }
  const points = route.points;
  if (!points) return direct;

  // Skip waypoints reached, or already visible past.
  while (route.next < points.length - 1) {
    const waypoint = points[route.next];
    const after = points[route.next + 1];
    if (Math.hypot(waypoint.x - from.x, waypoint.y - from.z) < WAYPOINT_REACHED || lineClear(g, from.x, from.z, after.x, after.y)) route.next++;
    else break;
  }
  const target = points[Math.min(route.next, points.length - 1)];
  const heading = new THREE.Vector3(target.x - from.x, 0, target.y - from.z);
  return heading.lengthSq() > 1e-6 ? heading.normalize() : direct;
}

function lineClearOfForest(forest: ForestMap, ax: number, az: number, bx: number, bz: number) {
  const clearance = GAME_CONFIG.tank.collisionRadius + 1;
  const length = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(length / 4));
  // From the first step on: a tank sliding along the edge starts right at it.
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (forestDepthAt(forest, ax + (bx - ax) * t, az + (bz - az) * t) > -clearance) return false;
  }
  return true;
}
