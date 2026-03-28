import { GAME_CONFIG } from './config';
import type { RoadNetwork } from './roads';
import { getRoadInfluence, isOnRoadForNetwork } from './roads';
import type { BuildingInstance, FarmlandPlot } from './buildings';
import { isPointInsideFarmland, isPointNearAnyBuilding } from './buildings';
import { sampleTerrainHeight } from './terrainHeight';

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

export function generateTrees(
  mapScale: number = 1,
  roadNetwork: RoadNetwork,
  buildings: BuildingInstance[] = [],
  farmlands: FarmlandPlot[] = [],
): TreeInstance[] {
  const cfg = GAME_CONFIG.trees;
  const rng = mulberry32(cfg.seed);
  const trees: TreeInstance[] = [];
  const minSpacingSq = cfg.minSpacing * cfg.minSpacing;
  const treeCount = Math.round(cfg.count * mapScale);

  // Jittered grid placement
  const gridSize = cfg.minSpacing * 1.2;
  const halfRange = cfg.maxPlacementRadius * mapScale;
  const gridStart = -halfRange;
  const gridEnd = halfRange;
  const cells: Array<{ gx: number; gz: number }> = [];

  for (let gx = gridStart; gx < gridEnd; gx += gridSize) {
    for (let gz = gridStart; gz < gridEnd; gz += gridSize) {
      cells.push({ gx, gz });
    }
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  for (const { gx, gz } of cells) {
    if (trees.length >= treeCount) break;

    const x = gx + (0.2 + rng() * 0.6) * gridSize;
    const z = gz + (0.2 + rng() * 0.6) * gridSize;

    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter < cfg.exclusionFromCenter) continue;
    if (distFromCenter > halfRange) continue;
    if (isOnRoadForNetwork(x, z, roadNetwork, cfg.exclusionFromRoad)) continue;
    if (isPointNearAnyBuilding(x, z, buildings, cfg.exclusionFromBuilding)) continue;
    if (farmlands.some((plot) => isPointInsideFarmland(x, z, plot, GAME_CONFIG.farmland.treeExclusionMargin))) continue;
    const nearestVillage = roadNetwork.junctions.reduce((best, [jx, jz]) => Math.min(best, Math.hypot(x - jx, z - jz)), Infinity);
    if (
      nearestVillage < GAME_CONFIG.farmland.villageTreeSuppressionRadius &&
      rng() < GAME_CONFIG.farmland.villageTreeSuppressionChance
    ) continue;

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

    const y = sampleTerrainHeight(x, z, roadNetwork, getRoadInfluence);

    trees.push({
      position: [x, y, z],
      rotation: rng() * Math.PI * 2,
      scale: 0.8 + rng() * 0.5,
      type: 'conifer',
      health: cfg.health,
      fallen: false,
      fallDirection: 0,
      fallProgress: 0,
    });
  }

  return trees;
}
