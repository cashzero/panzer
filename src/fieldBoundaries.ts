import type { FarmlandPlot } from './buildings';

export type FieldBoundaryKind = 'treeline' | 'hedge' | 'open';

export interface FieldBoundary {
  kind: FieldBoundaryKind;
  /** Endpoints in world XZ, pushed just outside the plot. */
  from: [number, number];
  to: [number, number];
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** World XZ of a point given in a plot's local frame (see isPointInsideFarmland). */
export function plotToWorld(plot: FarmlandPlot, localX: number, localZ: number): [number, number] {
  const c = Math.cos(plot.rotation);
  const s = Math.sin(plot.rotation);
  return [plot.center[0] + c * localX - s * localZ, plot.center[2] + s * localX + c * localZ];
}

const OUTSET = 2.2; // m outside the cultivated edge

/**
 * Each field edge is lined with trees, a hedge or left open. Trees and the
 * visual dressing both read this plan, so a boundary never gets both.
 */
export function planFieldBoundaries(farmlands: FarmlandPlot[], seed: number): FieldBoundary[] {
  const rng = mulberry32(seed ^ 0x6ed9eba1);
  const boundaries: FieldBoundary[] = [];
  for (const plot of farmlands) {
    const hx = plot.width / 2 + OUTSET;
    const hz = plot.depth / 2 + OUTSET;
    const corners: Array<[number, number]> = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    for (let edge = 0; edge < 4; edge++) {
      const roll = rng();
      const kind: FieldBoundaryKind = roll < 0.3 ? 'treeline' : roll < 0.78 ? 'hedge' : 'open';
      const a = corners[edge];
      const b = corners[(edge + 1) % 4];
      boundaries.push({ kind, from: plotToWorld(plot, a[0], a[1]), to: plotToWorld(plot, b[0], b[1]) });
    }
  }
  return boundaries;
}
