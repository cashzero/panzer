import type { BuildingInstance, FarmlandPlot } from './buildings';
import { isPointNearAnyBuilding } from './buildings';
import { planFieldBoundaries } from './fieldBoundaries';
import { isOnRoadForNetwork, type RoadNetwork } from './roads';

// Field hedges, planned once per world. The renderer builds leaf cards over
// these runs and line of sight tests against the same profile, so a crew
// cannot see through a hedge that hides the player's view. Tanks still drive
// through them: hedges neither collide nor stop shells.

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Station spacing along a hedge (m). Hundreds of field hedges now line the
// parcels; the leaf cards carry the detail.
export const HEDGE_STEP = 1.6;

/**
 * How a hedge has been kept. Field hedges are not one clipped tube: some are
 * laid or flailed low and square, most have grown out a season or two, and
 * a few have run up into a rough wall of thorn and hazel.
 */
export interface HedgeCharacter {
  height: number; // m
  width: number; // m
  /** Scale of the lumps and dips along the top. */
  ragged: number;
  /** Profile exponent: lower is squarer across the top. */
  crown: number;
  /** Leaf card size relative to CARD_SIZE; clipped hedges read finer. */
  leaf: number;
  /** Outer leaf cards per station: enough to close the outline at this size. */
  cards: number;
  hue: number;
  lightness: number;
}

function hedgeCharacter(roll: number, tone: number): HedgeCharacter {
  const hue = 0.215 + tone * 0.055;
  const lightness = 0.5 + (1 - tone) * 0.08;
  if (roll < 0.38) return { height: 1.35, width: 1.3, ragged: 0.35, crown: 0.42, leaf: 0.5, cards: 11, hue, lightness: lightness + 0.02 };
  if (roll < 0.85) return { height: 1.85, width: 1.6, ragged: 1, crown: 0.7, leaf: 0.6, cards: 14, hue, lightness };
  return { height: 2.6, width: 2.05, ragged: 1.7, crown: 0.8, leaf: 0.72, cards: 18, hue, lightness: lightness - 0.03 };
}

/** One unbroken stretch of hedge: stations HEDGE_STEP apart along (dirX, dirZ). */
export interface HedgeRun {
  stations: Array<{ x: number; z: number }>;
  dirX: number;
  dirZ: number;
  phase: number;
  character: HedgeCharacter;
}

/**
 * Height and width of a run at station i: an arch that wanders on a long
 * and a short wave and tapers at the ends.
 */
export function hedgeStationProfile(run: HedgeRun, i: number) {
  const { character, phase } = run;
  const s = i * HEDGE_STEP + phase;
  // Lumps along the top, and a long swell where the hedge has been cut back or left.
  const bumps = (Math.sin(s * 0.9) * 0.1 + Math.sin(s * 1.7 + 1.7) * 0.07) * character.ragged;
  const swell = Math.sin(s * 0.13 + phase) * 0.14 * character.ragged + Math.sin(s * 0.047 + 2 * phase) * 0.1;
  const endTaper = Math.min(1, i / 2, (run.stations.length - 1 - i) / 2);
  const height = character.height * (1 + bumps + swell) * (0.35 + 0.65 * endTaper);
  const width = character.width * (1 + Math.sin(s * 0.7 + 2.9) * 0.12 + Math.sin(s * 1.3) * 0.05 + swell * 0.5) * (0.5 + 0.5 * endTaper);
  return { height, width, s };
}

/**
 * Hedge runs along the planned boundaries, broken wherever a road or
 * farmyard crosses. `boundarySeed` is the seed trees plan boundaries with.
 */
export function planHedgeRuns(
  farmlands: FarmlandPlot[],
  roadNetwork: RoadNetwork,
  buildings: BuildingInstance[],
  boundarySeed: number,
  worldSeed: number,
): HedgeRun[] {
  const rng = mulberry32(worldSeed ^ 0x2545f491);
  const runs: HedgeRun[] = [];
  for (const boundary of planFieldBoundaries(farmlands, boundarySeed)) {
    if (boundary.kind !== 'hedge') continue;
    const [ax, az] = boundary.from;
    const [bx, bz] = boundary.to;
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 4) continue;
    const dirX = (bx - ax) / length, dirZ = (bz - az) / length;
    const phase = rng() * 100;
    const character = hedgeCharacter(rng(), rng());
    let stations: Array<{ x: number; z: number }> = [];
    const flush = () => {
      // Runs split by the same road keep their own phase so their lumps differ.
      if (stations.length >= 3) runs.push({ stations, dirX, dirZ, phase: phase + runs.length * 0.37, character });
      stations = [];
    };
    for (let d = 0; d <= length; d += HEDGE_STEP) {
      const x = ax + dirX * d, z = az + dirZ * d;
      if (isOnRoadForNetwork(x, z, roadNetwork, 3) || isPointNearAnyBuilding(x, z, buildings, 4)) { flush(); continue; }
      stations.push({ x, z });
    }
    flush();
  }
  return runs;
}

/**
 * First point along the segment (x0,y0,z0)→(x1,y1,z1) that passes below the
 * top of a hedge, as a fraction of the segment, or null. The hedge is taken
 * as a thin wall along its centre line; `groundAt` is the rendered surface.
 */
export function hedgeCrossing(
  runs: HedgeRun[],
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  groundAt: (x: number, z: number) => number,
): number | null {
  const dx = x1 - x0, dz = z1 - z0;
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
  let best: number | null = null;
  for (const run of runs) {
    const first = run.stations[0];
    const last = run.stations[run.stations.length - 1];
    if (Math.max(first.x, last.x) < minX || Math.min(first.x, last.x) > maxX) continue;
    if (Math.max(first.z, last.z) < minZ || Math.min(first.z, last.z) > maxZ) continue;
    const ex = last.x - first.x, ez = last.z - first.z;
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-9) continue; // parallel to the hedge
    const fx = first.x - x0, fz = first.z - z0;
    const t = (fx * ez - fz * ex) / denom; // along the sight line
    const u = (fx * dz - fz * dx) / denom; // along the hedge
    if (t <= 0 || t >= 1 || u < 0 || u > 1) continue;
    if (best !== null && t >= best) continue;
    const i = Math.round(u * (run.stations.length - 1));
    const x = x0 + dx * t, z = z0 + dz * t;
    const top = groundAt(x, z) + hedgeStationProfile(run, i).height;
    if (y0 + (y1 - y0) * t < top) best = t;
  }
  return best;
}

// The hedges of the world in play, set when a world is generated (like the
// active forest) for sight code that has no other route to the world state.
let activeHedges: HedgeRun[] = [];

export function setActiveHedges(runs: HedgeRun[]) {
  activeHedges = runs;
}

export function getActiveHedges() {
  return activeHedges;
}
