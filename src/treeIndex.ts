import type { TreeInstance } from './trees';

const CELL = 24; // m

interface TreeIndex {
  signature: string;
  cells: Map<number, number[]>;
}

let cached: TreeIndex | null = null;

const key = (ix: number, iz: number) => ix * 73856093 ^ iz * 19349663;

// Trees never move; updates (knockdown) swap objects but keep order and
// positions, so count plus the end positions identify a layout.
export function treeLayoutSignature(trees: TreeInstance[]) {
  if (trees.length === 0) return '0';
  const a = trees[0].position, b = trees[trees.length - 1].position;
  return `${trees.length}:${a[0]}:${a[2]}:${b[0]}:${b[2]}`;
}

/**
 * Uniform grid over tree indices. Each tree is filed in every cell its
 * collision circle touches, so a cell walk never misses a tree near a border.
 */
function getIndex(trees: TreeInstance[], radius: number): TreeIndex {
  const signature = `${treeLayoutSignature(trees)}:${radius}`;
  if (cached?.signature === signature) return cached;
  const cells = new Map<number, number[]>();
  trees.forEach((tree, index) => {
    // Interior forest trees are out of reach; the forest map blocks there.
    if (tree.interior) return;
    const [x, , z] = tree.position;
    for (let ix = Math.floor((x - radius) / CELL); ix <= Math.floor((x + radius) / CELL); ix++) {
      for (let iz = Math.floor((z - radius) / CELL); iz <= Math.floor((z + radius) / CELL); iz++) {
        const k = key(ix, iz);
        const list = cells.get(k);
        if (list) list.push(index); else cells.set(k, [index]);
      }
    }
  });
  cached = { signature, cells };
  return cached;
}

/** Tree indices whose cells overlap the XZ box around a point. */
export function forEachTreeNear(trees: TreeInstance[], radius: number, x: number, z: number, reach: number, visit: (index: number) => void) {
  const { cells } = getIndex(trees, radius);
  const seen = new Set<number>();
  for (let ix = Math.floor((x - reach) / CELL); ix <= Math.floor((x + reach) / CELL); ix++) {
    for (let iz = Math.floor((z - reach) / CELL); iz <= Math.floor((z + reach) / CELL); iz++) {
      for (const index of cells.get(key(ix, iz)) ?? []) {
        if (seen.has(index)) continue;
        seen.add(index);
        visit(index);
      }
    }
  }
}

/**
 * Tree indices in the cells an XZ ray crosses up to maxDistance (grid DDA).
 * The direction need not be normalised in XZ; distances are in ray units.
 */
export function forEachTreeAlongRay(
  trees: TreeInstance[], radius: number,
  ox: number, oz: number, dx: number, dz: number, maxDistance: number,
  visit: (index: number) => void,
) {
  const { cells } = getIndex(trees, radius);
  const seen = new Set<number>();
  let ix = Math.floor(ox / CELL), iz = Math.floor(oz / CELL);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
  const tDeltaZ = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
  let tMaxX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (ix + 1) * CELL : ix * CELL) - ox) / dx : Infinity;
  let tMaxZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (iz + 1) * CELL : iz * CELL) - oz) / dz : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    for (const index of cells.get(key(ix, iz)) ?? []) {
      if (seen.has(index)) continue;
      seen.add(index);
      visit(index);
    }
    if (Math.min(tMaxX, tMaxZ) > maxDistance) break;
    if (tMaxX < tMaxZ) { ix += stepX; tMaxX += tDeltaX; } else { iz += stepZ; tMaxZ += tDeltaZ; }
  }
}
