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
 * True when edge (a, b) runs along an already planned boundary: neighbouring
 * parcels share one hedge across the lane between them, not one each.
 */
function sharesBoundary(a: [number, number], b: [number, number], planned: FieldBoundary[]) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
  return planned.some(({ from, to }) => {
    const otherLength = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const vx = (to[0] - from[0]) / otherLength, vz = (to[1] - from[1]) / otherLength;
    if (Math.abs(ux * vz - uz * vx) > 0.05) return false;
    // Perpendicular distance of this edge's midpoint from the other edge's line.
    const mx = (a[0] + b[0]) / 2 - from[0], mz = (a[1] + b[1]) / 2 - from[1];
    if (Math.abs(mx * vz - mz * vx) > SHARED_GAP) return false;
    // Overlap along the line, as a share of the shorter edge.
    const s0 = (a[0] - from[0]) * vx + (a[1] - from[1]) * vz;
    const s1 = (b[0] - from[0]) * vx + (b[1] - from[1]) * vz;
    const overlap = Math.min(Math.max(s0, s1), otherLength) - Math.max(Math.min(s0, s1), 0);
    return overlap > 0.4 * Math.min(length, otherLength);
  });
}

const SHARED_GAP = 3; // m: parallel edges closer than this are the same boundary
/** Grid cell (m) for boundary midpoints; must exceed the longest field edge. */
const BOUNDARY_CELL = 200;

/**
 * Each field edge is lined with trees, a hedge or left open. Trees and the
 * visual dressing both read this plan, so a boundary never gets both.
 */
export function planFieldBoundaries(farmlands: FarmlandPlot[], seed: number): FieldBoundary[] {
  const rng = mulberry32(seed ^ 0x6ed9eba1);
  const boundaries: FieldBoundary[] = [];
  // Planned boundaries by midpoint cell: a shared edge's midpoint lies within
  // half the longer edge of this one's, so the 3x3 neighbourhood is enough.
  const cells = new Map<number, FieldBoundary[]>();
  const key = (ix: number, iz: number) => ix * 73856093 ^ iz * 19349663;
  const cellOf = (p: [number, number], q: [number, number]) =>
    [Math.floor((p[0] + q[0]) / 2 / BOUNDARY_CELL), Math.floor((p[1] + q[1]) / 2 / BOUNDARY_CELL)];
  const nearby = (p: [number, number], q: [number, number]) => {
    const [cx, cz] = cellOf(p, q);
    const found: FieldBoundary[] = [];
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) found.push(...(cells.get(key(ix, iz)) ?? []));
    return found;
  };
  for (const plot of farmlands) {
    const hx = plot.width / 2 + OUTSET;
    const hz = plot.depth / 2 + OUTSET;
    const corners: Array<[number, number]> = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    for (let edge = 0; edge < 4; edge++) {
      const roll = rng();
      const a = plotToWorld(plot, corners[edge][0], corners[edge][1]);
      const b = plotToWorld(plot, corners[(edge + 1) % 4][0], corners[(edge + 1) % 4][1]);
      if (sharesBoundary(a, b, nearby(a, b))) continue;
      // Pasture is hedged all round (bocage); arable land is more often open.
      const hedgeShare = plot.crop === 'pasture' || plot.crop === 'orchard' ? 0.85 : 0.55;
      const kind: FieldBoundaryKind = roll < 0.18 ? 'treeline' : roll < hedgeShare ? 'hedge' : 'open';
      const boundary: FieldBoundary = { kind, from: a, to: b };
      boundaries.push(boundary);
      const [cx, cz] = cellOf(a, b);
      const list = cells.get(key(cx, cz));
      if (list) list.push(boundary); else cells.set(key(cx, cz), [boundary]);
    }
  }
  return boundaries;
}
