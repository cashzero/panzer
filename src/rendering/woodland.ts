import { createFarmlandLookup, type TreeInstance } from '../trees';
import { treeLayoutSignature } from '../treeIndex';
import type { RoadNetwork } from '../roads';
import { isOnRoadForNetwork } from '../roads';
import { GAME_CONFIG } from '../config';
import { landUseAt } from '../landUse';
import { isPointInYard, type FarmYard } from '../landLayout';
import { isPointNearAnyBuilding, type BuildingInstance, type FarmlandPlot } from '../buildings';

/**
 * Woodland floor mask: how much leaf litter and canopy shade covers the ground.
 * Woods get a full floor, rows a narrower strip, lone trees a small patch of
 * trodden shade. Visual only; it never changes as trees are knocked down.
 */
export interface WoodlandMask {
  data: Uint8Array;
  resolution: number;
  size: number;
}

const HABITAT_FLOOR = {
  wood: { radius: 7, strength: 1 },
  line: { radius: 3.2, strength: 0.75 },
  lone: { radius: 2.6, strength: 0.5 },
} as const;

let cachedMask: { key: string; mask: WoodlandMask } | null = null;

export function getWoodlandMask(trees: TreeInstance[], size: number, resolution = 1024): WoodlandMask {
  const key = `${treeLayoutSignature(trees)}:${size}:${resolution}`;
  if (cachedMask?.key === key) return cachedMask.mask;
  const data = new Uint8Array(resolution * resolution);
  const spacing = size / resolution;
  const half = size / 2;
  for (const tree of trees) {
    const { radius: baseRadius, strength } = HABITAT_FLOOR[tree.habitat];
    const radius = baseRadius * tree.scale;
    const [x, , z] = tree.position;
    const x0 = Math.max(0, Math.floor((x - radius + half) / spacing));
    const x1 = Math.min(resolution - 1, Math.ceil((x + radius + half) / spacing));
    const z0 = Math.max(0, Math.floor((z - radius + half) / spacing));
    const z1 = Math.min(resolution - 1, Math.ceil((z + radius + half) / spacing));
    for (let iz = z0; iz <= z1; iz++) {
      const dz = (iz + 0.5) * spacing - half - z;
      for (let ix = x0; ix <= x1; ix++) {
        const dx = (ix + 0.5) * spacing - half - x;
        const t = 1 - Math.hypot(dx, dz) / radius;
        if (t <= 0) continue;
        const value = Math.round(Math.min(1, t * 2) * strength * 255);
        const offset = iz * resolution + ix;
        if (value > data[offset]) data[offset] = value;
      }
    }
  }
  // Soften the union of discs so wood edges curve instead of scalloping.
  blur(data, resolution, 2);
  blur(data, resolution, 2);
  const mask = { data, resolution, size };
  cachedMask = { key, mask };
  return mask;
}

/** Separable box blur in place. */
function blur(data: Uint8Array, resolution: number, radius: number) {
  const line = new Float32Array(resolution);
  const width = radius * 2 + 1;
  for (const horizontal of [true, false]) {
    for (let row = 0; row < resolution; row++) {
      const at = (i: number) => horizontal ? row * resolution + i : i * resolution + row;
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += data[at(Math.min(resolution - 1, Math.max(0, i)))];
      for (let i = 0; i < resolution; i++) {
        line[i] = sum / width;
        sum += data[at(Math.min(resolution - 1, i + radius + 1))] - data[at(Math.max(0, i - radius))];
      }
      for (let i = 0; i < resolution; i++) data[at(i)] = Math.round(line[i]);
    }
  }
}

export interface UnderstoryPlant {
  x: number;
  z: number;
  rotation: number;
  scale: number;
  /** 0..1 tint variation. */
  shade: number;
}

export interface UnderstoryPlan {
  shrubs: UnderstoryPlant[];
  saplings: UnderstoryPlant[];
}

function hash(a: number, b: number, salt: number) {
  const v = Math.sin(a * 12.9898 + b * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Scrub and young trees under the woods and along the rows. Scenery only:
 * they neither collide nor block sight, and stay below a commander's eye line.
 */
export function planUnderstory(
  trees: TreeInstance[], roadNetwork: RoadNetwork, buildings: BuildingInstance[], farmlands: FarmlandPlot[],
  yards: FarmYard[] = [],
): UnderstoryPlan {
  const inFarmland = createFarmlandLookup(farmlands);
  const shrubs: UnderstoryPlant[] = [];
  const saplings: UnderstoryPlant[] = [];
  const clear = (x: number, z: number) => !isOnRoadForNetwork(x, z, roadNetwork, 1.5)
    && !isPointNearAnyBuilding(x, z, buildings, 3)
    && !inFarmland(x, z, -0.5)
    && !yards.some((yard) => isPointInYard(x, z, yard, 1.5));
  for (const tree of trees) {
    // Lone trees stand clear; interior forest trees are never seen up close.
    if (tree.habitat === 'lone' || tree.interior) continue;
    const [tx, , tz] = tree.position;
    const count = tree.habitat === 'wood' ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const roll = hash(tx, tz, 11 + k);
      if (roll > (tree.habitat === 'wood' ? 0.8 : 0.6)) continue;
      const angle = hash(tx, tz, 21 + k) * Math.PI * 2;
      const distance = (tree.habitat === 'wood' ? 1.8 : 1.2) + hash(tx, tz, 31 + k) * 2.6;
      const x = tx + Math.cos(angle) * distance;
      const z = tz + Math.sin(angle) * distance;
      if (!clear(x, z)) continue;
      const plant = {
        x, z, rotation: hash(tx, tz, 41 + k) * Math.PI * 2,
        scale: 0.7 + hash(tx, tz, 51 + k) * 0.6, shade: hash(tx, tz, 61 + k),
      };
      // Young spruce seed in under conifers; everything else is broadleaf scrub.
      if (tree.type === 'conifer' && tree.habitat === 'wood' && roll < 0.35) saplings.push({ ...plant, scale: 0.28 + plant.shade * 0.14 });
      else shrubs.push(plant);
    }
  }
  // Scrub scattered over the open grazing land: gorse, bramble and thorn.
  const half = roadNetwork.terrainSize / 2 - 20;
  const cell = 14;
  for (let x = -half; x < half; x += cell) {
    for (let z = -half; z < half; z += cell) {
      if (hash(x, z, 71) > GAME_CONFIG.trees.openScrubChance) continue;
      const px = x + hash(x, z, 72) * cell, pz = z + hash(x, z, 73) * cell;
      if (landUseAt(px, pz, roadNetwork.seed) !== 'open' || !clear(px, pz)) continue;
      shrubs.push({ x: px, z: pz, rotation: hash(x, z, 74) * Math.PI * 2, scale: 0.6 + hash(x, z, 75) * 0.7, shade: hash(x, z, 76) });
    }
  }
  return { shrubs, saplings };
}
