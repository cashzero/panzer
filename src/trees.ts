import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { isOnRoad } from './roads';

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

export function generateTrees(): TreeInstance[] {
  const cfg = GAME_CONFIG.trees;
  const rng = mulberry32(cfg.seed);
  const trees: TreeInstance[] = [];
  const minSpacingSq = cfg.minSpacing * cfg.minSpacing;

  // Jittered grid placement
  const gridSize = cfg.minSpacing * 1.2;
  const halfRange = cfg.maxPlacementRadius;
  const gridStart = -halfRange;
  const gridEnd = halfRange;

  for (let gx = gridStart; gx < gridEnd; gx += gridSize) {
    for (let gz = gridStart; gz < gridEnd; gz += gridSize) {
      if (trees.length >= cfg.count) break;

      // Jitter within cell
      const x = gx + rng() * gridSize;
      const z = gz + rng() * gridSize;

      // Exclusion: center spawn area
      const distFromCenter = Math.sqrt(x * x + z * z);
      if (distFromCenter < cfg.exclusionFromCenter) continue;

      // Exclusion: terrain edge
      if (distFromCenter > cfg.maxPlacementRadius) continue;

      // Exclusion: roads
      if (isOnRoad(x, z, cfg.exclusionFromRoad)) continue;

      // Check minimum spacing against existing trees
      let tooClose = false;
      for (const t of trees) {
        const dx = t.position[0] - x;
        const dz = t.position[2] - z;
        if (dx * dx + dz * dz < minSpacingSq) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const y = getTerrainHeight(x, z);

      trees.push({
        position: [x, y, z],
        rotation: rng() * Math.PI * 2,
        scale: 0.8 + rng() * 0.5,
        type: rng() < 0.7 ? 'deciduous' : 'conifer',
        health: cfg.health,
        fallen: false,
        fallDirection: 0,
        fallProgress: 0,
      });
    }
    if (trees.length >= cfg.count) break;
  }

  return trees;
}
