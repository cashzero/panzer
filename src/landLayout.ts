import { GAME_CONFIG } from './config';
import type { MapSize } from './store';
import { isOnRoadForNetwork, type RoadNetwork, type RoadSegment } from './roads';
import {
  buildingRotationAlong,
  createBuildingFromShape,
  createBuildingShape,
  sampleSlope,
  type BuildingInstance,
  type BuildingStyle,
  type FarmlandCrop,
  type FarmlandPlot,
} from './buildings';
import type { WoodSite } from './trees';
import { landUseAt, landUseValue } from './landUse';
import { sampleTerrainWithoutBuildings } from './terrainHeight';
import { getRoadInfluence } from './roads';

/**
 * Rural layout in the manner of a Norman or Picard commune. Villages line the
 * roads leaving each junction, farmsteads stand at intervals along the roads
 * with their outbuildings around a yard, and fields are rectangular parcels
 * laid in strips back from the road, then aligned to the nearest road across
 * the land between. Everything is squared to the road network, so the map
 * reads as surveyed land rather than a scatter.
 */

const MAP_METERS_BY_SIZE: Record<MapSize, number> = { small: 1000, medium: 2000, large: 4000 };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Road paths: arc-length sampling of a road polyline ---

interface RoadPath {
  segment: RoadSegment;
  /** Arc length at each polyline point. */
  cumulative: number[];
  length: number;
}

function toPath(segment: RoadSegment): RoadPath {
  const cumulative = [0];
  for (let i = 1; i < segment.points.length; i++) {
    const [ax, az] = segment.points[i - 1], [bx, bz] = segment.points[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  return { segment, cumulative, length: cumulative[cumulative.length - 1] };
}

/** Point and unit tangent of the straight piece containing arc length s. */
function sampleAt(path: RoadPath, s: number) {
  const points = path.segment.points;
  let i = 1;
  while (i < points.length - 1 && path.cumulative[i] < s) i++;
  const [ax, az] = points[i - 1], [bx, bz] = points[i];
  const length = Math.max(1e-6, path.cumulative[i] - path.cumulative[i - 1]);
  const t = Math.max(0, Math.min(1, (s - path.cumulative[i - 1]) / length));
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / length, dz: (bz - az) / length };
}

function closestOnPath(path: RoadPath, x: number, z: number) {
  const points = path.segment.points;
  let best = { s: 0, distance: Infinity, dx: 1, dz: 0 };
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const ex = bx - ax, ez = bz - az;
    const lengthSq = ex * ex + ez * ez;
    if (lengthSq < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / lengthSq));
    const distance = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (distance < best.distance) {
      const length = Math.sqrt(lengthSq);
      best = { s: path.cumulative[i - 1] + t * length, distance, dx: ex / length, dz: ez / length };
    }
  }
  return best;
}

// --- Oriented rectangles in plan ---

interface Rect {
  x: number;
  z: number;
  /** Unit direction of the half-width axis; the half-depth axis is (-uz, ux). */
  ux: number;
  uz: number;
  halfWidth: number;
  halfDepth: number;
}

function corners(rect: Rect): Array<[number, number]> {
  const vx = -rect.uz, vz = rect.ux;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [
    rect.x + rect.ux * rect.halfWidth * a + vx * rect.halfDepth * b,
    rect.z + rect.uz * rect.halfWidth * a + vz * rect.halfDepth * b,
  ]);
}

/** Separating-axis overlap test, with `gap` metres of clearance required. */
function rectsOverlap(a: Rect, b: Rect, gap: number) {
  const axes: Array<[number, number]> = [[a.ux, a.uz], [-a.uz, a.ux], [b.ux, b.uz], [-b.uz, b.ux]];
  for (const [ax, az] of axes) {
    const project = (rect: Rect) => {
      const centre = rect.x * ax + rect.z * az;
      const reach = Math.abs(rect.ux * ax + rect.uz * az) * rect.halfWidth + Math.abs(-rect.uz * ax + rect.ux * az) * rect.halfDepth;
      return [centre - reach, centre + reach];
    };
    const [a0, a1] = project(a), [b0, b1] = project(b);
    if (a1 + gap <= b0 || b1 + gap <= a0) return false;
  }
  return true;
}

function rectNearCircle(rect: Rect, x: number, z: number, radius: number) {
  const dx = x - rect.x, dz = z - rect.z;
  const lx = Math.max(-rect.halfWidth, Math.min(rect.halfWidth, dx * rect.ux + dz * rect.uz));
  const lz = Math.max(-rect.halfDepth, Math.min(rect.halfDepth, -dx * rect.uz + dz * rect.ux));
  return Math.hypot(dx - (rect.ux * lx - rect.uz * lz), dz - (rect.uz * lx + rect.ux * lz)) < radius;
}

/** True when no road comes within `margin` of the rectangle's outline. */
function clearOfRoads(rect: Rect, network: RoadNetwork, margin: number) {
  const outline = corners(rect);
  for (let i = 0; i < 4; i++) {
    const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % 4];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 6));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      if (isOnRoadForNetwork(ax + (bx - ax) * t, az + (bz - az) * t, network, margin)) return false;
    }
  }
  return !isOnRoadForNetwork(rect.x, rect.z, network, margin);
}

/** Uniform grid over rectangles by their bounding circle, for overlap queries. */
class RectGrid {
  private cells = new Map<number, Rect[]>();
  constructor(private cell: number) {}
  private key(ix: number, iz: number) { return ix * 73856093 ^ iz * 19349663; }
  private range(rect: Rect, pad: number) {
    const reach = Math.hypot(rect.halfWidth, rect.halfDepth) + pad;
    return [Math.floor((rect.x - reach) / this.cell), Math.floor((rect.x + reach) / this.cell),
      Math.floor((rect.z - reach) / this.cell), Math.floor((rect.z + reach) / this.cell)];
  }
  add(rect: Rect) {
    const [x0, x1, z0, z1] = this.range(rect, 0);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const list = this.cells.get(this.key(ix, iz));
      if (list) list.push(rect); else this.cells.set(this.key(ix, iz), [rect]);
    }
  }
  overlaps(rect: Rect, gap: number) {
    const [x0, x1, z0, z1] = this.range(rect, gap);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      for (const other of this.cells.get(this.key(ix, iz)) ?? []) if (rectsOverlap(rect, other, gap)) return true;
    }
    return false;
  }
}

function insideMap(rect: Rect, half: number) {
  return corners(rect).every(([x, z]) => Math.abs(x) < half && Math.abs(z) < half);
}

function buildingRect(building: Pick<BuildingInstance, 'position' | 'rotation' | 'width' | 'depth'>, margin: number): Rect {
  // Width axis of a three.js Y rotation: (cos r, -sin r).
  return {
    x: building.position[0], z: building.position[2],
    ux: Math.cos(building.rotation), uz: -Math.sin(building.rotation),
    halfWidth: building.width / 2 + margin, halfDepth: building.depth / 2 + margin,
  };
}

// --- Buildings and yards ---

/**
 * A walled farm court or a village garden. Plan frame as Rect: width axis
 * (ux, uz), depth axis (-uz, ux); `gate` is the edge index (see yardEdges)
 * with the gateway, or -1. Walls are visual only, like hedges.
 */
export interface FarmYard {
  id: string;
  kind: 'court' | 'garden';
  style: BuildingStyle;
  x: number;
  z: number;
  ux: number;
  uz: number;
  halfWidth: number;
  halfDepth: number;
  gate: number;
}

export function isPointInYard(x: number, z: number, yard: FarmYard, margin = 0) {
  const dx = x - yard.x, dz = z - yard.z;
  return Math.abs(dx * yard.ux + dz * yard.uz) <= yard.halfWidth + margin
    && Math.abs(-dx * yard.uz + dz * yard.ux) <= yard.halfDepth + margin;
}

/** Yard outline edges in order: depth -1 side, width +1, depth +1, width -1. */
export function yardEdges(yard: FarmYard): Array<[[number, number], [number, number]]> {
  const outline = corners(yard);
  return [0, 1, 2, 3].map((i) => [outline[i], outline[(i + 1) % 4]]);
}

/** Plan-frame axes that turn a building's front (local +z) toward (fx, fz). */
function facing(fx: number, fz: number) {
  return { ux: fz, uz: -fx };
}

/**
 * Villages line the roads out of each junction: houses with their fronts on
 * the street and gardens walled behind them. Farmsteads along the open road
 * are courts: the farmhouse across the back, barns down the sides and a wall
 * with a gateway on the road, in the manner of a Picard cour fermée.
 */
export function generateBuildings(mapSize: MapSize, roadNetwork: RoadNetwork, seed: number): { buildings: BuildingInstance[]; yards: FarmYard[] } {
  const cfg = GAME_CONFIG.buildings;
  const rng = mulberry32(seed ^ 0x9E3779B9);
  const buildings: BuildingInstance[] = [];
  const yards: FarmYard[] = [];
  const half = MAP_METERS_BY_SIZE[mapSize] * 0.5 - 45;
  const paths = roadNetwork.segments.map(toPath);
  let idCounter = 0;

  const blocked = (rect: Rect, gap: number) =>
    buildings.some((other) => rectsOverlap(rect, buildingRect(other, 0), gap))
    || yards.some((yard) => rectsOverlap(rect, yard, gap));

  /** Place a building centred at (x, z), front toward (fx, fz), if the site is sound. */
  const place = (kind: BuildingInstance['kind'], style: BuildingStyle, x: number, z: number, fx: number, fz: number,
    shape = createBuildingShape(kind, rng), ignoreYard?: FarmYard) => {
    const { ux, uz } = facing(fx, fz);
    const rotation = buildingRotationAlong(ux, uz);
    const rect: Rect = { x, z, ux, uz, halfWidth: shape.width / 2, halfDepth: shape.depth / 2 };
    if (Math.hypot(x, z) < cfg.exclusionFromCenter) return null;
    if (!insideMap(rect, half)) return null;
    if (!clearOfRoads(rect, roadNetwork, 2.5)) return null;
    if (buildings.some((other) => rectsOverlap(rect, buildingRect(other, 0), cfg.minBuildingGap))) return null;
    if (yards.some((yard) => yard !== ignoreYard && rectsOverlap(rect, yard, 0.5))) return null;
    if (sampleSlope(x, z, rotation, shape.width, shape.depth, roadNetwork) > cfg.placementMaxSlopeDelta) return null;
    const building = createBuildingFromShape(`bld-${idCounter++}`, kind, x, z, rotation, roadNetwork, shape);
    building.style = style;
    buildings.push(building);
    return building;
  };

  // Settlements share one building tradition; the mix shifts across the map.
  const pickStyle = (x: number, z: number): BuildingStyle => {
    const roll = rng();
    const brickCountry = landUseValue(x + 3100, z - 1700, roadNetwork.seed);
    const walls: BuildingStyle['walls'] = roll < 0.42 ? 'timber' : roll < 0.42 + brickCountry * 0.5 ? 'brick' : 'stone';
    const roofRoll = rng();
    const roof: BuildingStyle['roof'] = roofRoll < 0.18 ? 'thatch' : roofRoll < 0.7 ? 'tile' : 'slate';
    return { walls, roof, shutters: rng() < 0.6 ? 'green' : rng() < 0.5 ? 'grey' : 'oxblood' };
  };

  // Villages: a street of houses and barns down each road out of a junction.
  for (const [jx, jz] of roadNetwork.junctions) {
    let grangePlaced = false;
    for (const path of paths) {
      const hit = closestOnPath(path, jx, jz);
      if (hit.distance > 12) continue;
      for (const direction of [-1, 1]) {
        for (const side of [-1, 1]) {
          const streetLength = cfg.villageStreetLength[0] + rng() * (cfg.villageStreetLength[1] - cfg.villageStreetLength[0]);
          let s = hit.s + direction * (cfg.villageStreetStart + rng() * 6);
          while (Math.abs(s - hit.s) < streetLength && s > 0 && s < path.length) {
            const roll = rng();
            const kind: BuildingInstance['kind'] = !grangePlaced && roll < 0.12 ? 'warehouse' : roll < 0.7 ? 'farmhouse' : 'barn';
            const shape = createBuildingShape(kind, rng);
            const at = sampleAt(path, s + direction * shape.width / 2);
            const nx = -at.dz * side, nz = at.dx * side;
            const setback = path.segment.halfWidth + cfg.streetSetback + rng() * 1.5 + shape.depth / 2;
            if (rng() < cfg.villageFill) {
              const style = pickStyle(at.x, at.z);
              const building = place(kind, style, at.x + nx * setback, at.z + nz * setback, -nx, -nz, shape);
              if (building && kind === 'warehouse') grangePlaced = true;
              // A walled kitchen garden behind each house.
              if (building && kind === 'farmhouse' && rng() < cfg.gardenChance) {
                const gardenDepth = 10 + rng() * 8;
                const gardenReach = setback + shape.depth / 2 + 0.6 + gardenDepth / 2;
                const garden: FarmYard = {
                  id: `yard-${yards.length}`, kind: 'garden', style,
                  x: at.x + nx * gardenReach, z: at.z + nz * gardenReach, ux: at.dx * side, uz: at.dz * side,
                  halfWidth: shape.width / 2 + 1 + rng() * 2, halfDepth: gardenDepth / 2, gate: -1,
                };
                if (insideMap(garden, half) && clearOfRoads(garden, roadNetwork, 1) && !blocked(garden, 0.4)) yards.push(garden);
              }
            }
            s += direction * (shape.width + cfg.streetGap[0] + rng() * (cfg.streetGap[1] - cfg.streetGap[0]));
          }
        }
      }
    }
  }

  // Farmsteads: a walled court with the farmhouse across the back, a barn down
  // one side and often a second barn or grange down the other.
  for (const path of paths) {
    let s = 60 + rng() * 140;
    while (s < path.length - 60) {
      const at = sampleAt(path, s);
      const nearVillage = roadNetwork.junctions.some(([jx, jz]) => Math.hypot(at.x - jx, at.z - jz) < cfg.farmsteadVillageClearance);
      if (!nearVillage && landUseAt(at.x, at.z, roadNetwork.seed) !== 'forest') {
        const side = rng() < 0.5 ? 1 : -1;
        const nx = -at.dz * side, nz = at.dx * side;
        const style = pickStyle(at.x, at.z);
        const houseShape = createBuildingShape('farmhouse', rng);
        const courtWidth = Math.max(houseShape.width + 8, 22 + rng() * 8);
        const courtDepth = 20 + rng() * 8;
        const n0 = path.segment.halfWidth + cfg.farmsteadSetback;
        const at2 = (along: number, out: number): [number, number] =>
          [at.x + at.dx * along + nx * out, at.z + at.dz * along + nz * out];
        const [cx, cz] = at2(0, n0 + courtDepth / 2);
        const court: FarmYard = {
          id: `yard-${yards.length}`, kind: 'court', style, x: cx, z: cz, ux: at.dx * side, uz: at.dz * side,
          halfWidth: courtWidth / 2, halfDepth: courtDepth / 2, gate: 0,
        };
        if (insideMap(court, half) && clearOfRoads(court, roadNetwork, 1) && !blocked(court, 2)) {
          yards.push(court);
          // The house closes the back of the court and faces the gateway.
          const [hx, hz] = at2(0, n0 + courtDepth + houseShape.depth / 2 - 0.6);
          const house = place('farmhouse', style, hx, hz, -nx, -nz, houseShape, court);
          if (!house) {
            yards.pop();
          } else {
            const flank = rng() < 0.5 ? 1 : -1;
            for (const [flankSide, chance] of [[flank, 1], [-flank, cfg.secondBarnChance]] as const) {
              if (rng() > chance) continue;
              const kind: BuildingInstance['kind'] = flankSide !== flank && rng() < 0.35 ? 'warehouse' : 'barn';
              const shape = createBuildingShape(kind, rng);
              // Barn width runs back from the road; its doors open onto the court.
              const along = flankSide * (courtWidth / 2 + shape.depth / 2 - 0.6);
              const out = n0 + courtDepth - shape.width / 2 + 1.5;
              const [bx, bz] = at2(along, out);
              place(kind, style, bx, bz, -at.dx * flankSide, -at.dz * flankSide, shape, court);
            }
          }
        }
      }
      s += cfg.farmsteadSpacing[0] + rng() * (cfg.farmsteadSpacing[1] - cfg.farmsteadSpacing[0]);
    }
  }

  return { buildings, yards };
}

// --- Fields ---

/**
 * Parcels in strips back from every road, up to three deep with a lane
 * between, then parcels squared to the nearest road across the land between.
 * Woods and farmyards are left clear.
 */
export function generateFarmlands(
  buildings: BuildingInstance[],
  roadNetwork: RoadNetwork,
  mapSize: MapSize,
  seed: number,
  woods: WoodSite[],
  farmYards: FarmYard[] = [],
): FarmlandPlot[] {
  const cfg = GAME_CONFIG.farmland;
  const rng = mulberry32(seed ^ 0x51f15e);
  const cropRng = mulberry32(seed ^ 0x2c9f1a);
  const half = MAP_METERS_BY_SIZE[mapSize] * 0.5 - 25;
  const paths = roadNetwork.segments.map(toPath);
  const yards = new RectGrid(80);
  buildings.forEach((building) => yards.add(buildingRect(building, cfg.yardMargin)));
  farmYards.forEach((yard) => yards.add({ ...yard, halfWidth: yard.halfWidth + 4, halfDepth: yard.halfDepth + 4 }));
  const parcels = new RectGrid(80);
  const farmlands: FarmlandPlot[] = [];

  const footprints = new RectGrid(80);
  buildings.forEach((building) => footprints.add(buildingRect(building, 3)));
  farmYards.forEach((yard) => footprints.add({ ...yard, halfWidth: yard.halfWidth + 2, halfDepth: yard.halfDepth + 2 }));
  const zone = (x: number, z: number) => landUseAt(x, z, roadNetwork.seed);
  const relief = (rect: Rect) => {
    const heights = [...corners(rect), [rect.x, rect.z] as [number, number]]
      .map(([x, z]) => sampleTerrainWithoutBuildings(x, z, roadNetwork, getRoadInfluence));
    return Math.max(...heights) - Math.min(...heights);
  };

  const accept = (rect: Rect, crop?: FarmlandCrop) => {
    const orchard = crop === 'orchard';
    const minHalf = orchard ? 12 : 18;
    if (rect.halfWidth < minHalf || rect.halfDepth < minHalf) return false;
    if (!insideMap(rect, half)) return false;
    // Only level farmland is enclosed; open grazing and forest stay unfenced.
    if (!orchard && (zone(rect.x, rect.z) !== 'farm' || corners(rect).some(([x, z]) => zone(x, z) === 'forest'))) return false;
    // Cheap tests first; the road test walks the outline against every road.
    if (parcels.overlaps(rect, cfg.laneWidth - 0.5)) return false;
    // An orchard backs onto its farmhouse; fields keep the whole yard clear.
    if (orchard ? footprints.overlaps(rect, 0) : yards.overlaps(rect, 0)) return false;
    if (woods.some((wood) => rectNearCircle(rect, wood.x, wood.z, wood.radius * 0.95))) return false;
    if (!clearOfRoads(rect, roadNetwork, cfg.roadMargin)) return false;
    if (relief(rect) > cfg.maxFieldRelief) return false;
    parcels.add(rect);
    if (!crop) {
      const roll = cropRng();
      crop = roll < cfg.pastureShare ? 'pasture' : ((r) => r < 0.4 ? 'stubble' : r < 0.72 ? 'ploughed' : 'hay')(cropRng());
    }
    farmlands.push({
      id: `field-${farmlands.length}`,
      center: [rect.x, 0, rect.z],
      // Plot rotation is the math-convention angle of its width axis.
      rotation: Math.atan2(rect.uz, rect.ux),
      width: rect.halfWidth * 2,
      depth: rect.halfDepth * 2,
      crop,
    });
    return true;
  };

  const size = (range: [number, number]) => range[0] + rng() * (range[1] - range[0]);

  // Orchards first, behind the farmhouses they belong to.
  for (const house of buildings) {
    if (house.kind !== 'farmhouse' || rng() > cfg.orchardChance) continue;
    // Building frame of a three.js Y rotation: width (cos r, -sin r), depth (sin r, cos r).
    const ux = Math.cos(house.rotation), uz = -Math.sin(house.rotation);
    // About the width of the house plot, so it clears the neighbours in a village street.
    const halfDepth = 14 + rng() * 10;
    for (const [side, halfWidth] of [[1, house.width / 2 + 6 + rng() * 8], [-1, house.width / 2 + 6 + rng() * 8], [1, 12.5], [-1, 12.5]]) {
      const reach = house.depth / 2 + 12 + halfDepth;
      const rect: Rect = { x: house.position[0] + Math.sin(house.rotation) * reach * side, z: house.position[2] + Math.cos(house.rotation) * reach * side, ux, uz, halfWidth, halfDepth };
      if (accept(rect, 'orchard')) break;
    }
  }
  const queue: Rect[] = [];
  const acceptAndGrow = (rect: Rect) => {
    if (!accept(rect)) return false;
    queue.push(rect);
    return true;
  };
  /**
   * Grow the patchwork out from each parcel: neighbours of the same depth side
   * by side and of the same width behind, so boundaries run on in straight lines.
   */
  const grow = () => {
    while (queue.length > 0) {
      const rect = queue.shift()!;
      const vx = -rect.uz, vz = rect.ux;
      for (const [ax, az, keepDepth] of [[rect.ux, rect.uz, true], [-rect.ux, -rect.uz, true], [vx, vz, false], [-vx, -vz, false]] as const) {
        if (rng() > cfg.growChance) continue;
        const halfWidth = keepDepth ? size(cfg.frontage) / 2 : rect.halfWidth;
        const halfDepth = keepDepth ? rect.halfDepth : size(cfg.depth) / 2;
        const reach = keepDepth ? rect.halfWidth + cfg.laneWidth + halfWidth : rect.halfDepth + cfg.laneWidth + halfDepth;
        const next: Rect = { x: rect.x + ax * reach, z: rect.z + az * reach, ux: rect.ux, uz: rect.uz, halfWidth, halfDepth };
        if (!acceptAndGrow(next) && keepDepth) {
          // Squeeze a narrower parcel into the gap before a road, wood or yard.
          const narrow = { ...next, halfWidth: halfWidth * 0.55 };
          const narrowReach = rect.halfWidth + cfg.laneWidth + narrow.halfWidth;
          narrow.x = rect.x + ax * narrowReach;
          narrow.z = rect.z + az * narrowReach;
          acceptAndGrow(narrow);
        }
      }
    }
  };

  // Village orchards: plots on the edge of each village, squared to its road.
  for (const [jx, jz] of roadNetwork.junctions) {
    for (let attempt = 0, made = 0; attempt < 24 && made < cfg.villageOrchards; attempt++) {
      const angle = rng() * Math.PI * 2, distance = 55 + rng() * 90;
      const x = jx + Math.cos(angle) * distance, z = jz + Math.sin(angle) * distance;
      let nearest = { distance: Infinity, dx: 1, dz: 0 };
      for (const path of paths) {
        const hit = closestOnPath(path, x, z);
        if (hit.distance < nearest.distance) nearest = hit;
      }
      const rect: Rect = { x, z, ux: nearest.dx, uz: nearest.dz, halfWidth: 18 + rng() * 14, halfDepth: 15 + rng() * 12 };
      if (accept(rect, 'orchard')) made++;
    }
  }

  // Strips back from the roads: frontage along the road, depth away from it.
  for (const path of paths) {
    for (const side of [-1, 1]) {
      let s = rng() * 25;
      while (s < path.length) {
        const frontage = size(cfg.frontage);
        const at = sampleAt(path, s + frontage / 2);
        const nx = -at.dz * side, nz = at.dx * side;
        let offset = path.segment.halfWidth + cfg.roadMargin + 1;
        for (let tier = 0; tier < cfg.tierChance.length && rng() < cfg.tierChance[tier]; tier++) {
          const depth = size(cfg.depth);
          const rect: Rect = { x: at.x + nx * (offset + depth / 2), z: at.z + nz * (offset + depth / 2), ux: at.dx, uz: at.dz, halfWidth: frontage / 2, halfDepth: depth / 2 };
          if (!acceptAndGrow(rect)) {
            // A shallower parcel often still fits behind a farmyard or before a wood.
            const shallow = { ...rect, halfDepth: rect.halfDepth * 0.55 };
            shallow.x = at.x + nx * (offset + shallow.halfDepth);
            shallow.z = at.z + nz * (offset + shallow.halfDepth);
            if (!acceptAndGrow(shallow)) break;
            offset += shallow.halfDepth * 2 + cfg.laneWidth;
            continue;
          }
          offset += depth + cfg.laneWidth;
        }
        s += frontage + cfg.laneWidth;
      }
    }
  }

  grow();

  // Land still open: seed parcels squared to the nearest road and grow them.
  const step = cfg.infillSpacing;
  const candidates: Array<[number, number]> = [];
  for (let x = -half + step / 2; x < half; x += step) {
    for (let z = -half + step / 2; z < half; z += step) candidates.push([x + (rng() - 0.5) * step * 0.6, z + (rng() - 0.5) * step * 0.6]);
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const [x, z] of candidates) {
    if (rng() > cfg.infillChance) continue;
    let nearest = { distance: Infinity, dx: 1, dz: 0 };
    for (const path of paths) {
      const hit = closestOnPath(path, x, z);
      if (hit.distance < nearest.distance) nearest = hit;
    }
    const rect: Rect = { x, z, ux: nearest.dx, uz: nearest.dz, halfWidth: size(cfg.frontage) / 2, halfDepth: size(cfg.depth) / 2 };
    if (!acceptAndGrow(rect)) acceptAndGrow({ ...rect, halfWidth: rect.halfWidth * 0.6, halfDepth: rect.halfDepth * 0.6 });
    grow();
  }

  return farmlands;
}
