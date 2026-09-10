import type { RoadNetwork } from '../roads';
import type { BuildingInstance, FarmlandPlot } from '../buildings';

export const ROAD_DISTANCE_RANGE = 16;

/** Signed road-edge distance (R), farmland / exposed soil (G).
 * Rasterize only feature bounds; cost scales with roads, not pixels x roads.
 * Linear filtering of distance, rather than colour, keeps diagonal edges smooth.
 */
export function createTerrainSplatData(
  network: RoadNetwork, farmlands: FarmlandPlot[], buildings: BuildingInstance[],
  resolution = 2048,
) {
  const size = network.terrainSize;
  const spacing = size / resolution;
  const half = size / 2;
  const data = new Uint8Array(resolution * resolution * 2);
  for (let i = 0; i < data.length; i += 2) data[i] = 255;
  const rasterize = (minX: number, minZ: number, maxX: number, maxZ: number,
    visit: (x: number, z: number, offset: number) => void) => {
    const x0 = Math.max(0, Math.floor((minX + half) / spacing));
    const x1 = Math.min(resolution - 1, Math.ceil((maxX + half) / spacing));
    const z0 = Math.max(0, Math.floor((minZ + half) / spacing));
    const z1 = Math.min(resolution - 1, Math.ceil((maxZ + half) / spacing));
    for (let iz = z0; iz <= z1; iz++) {
      const z = (iz + 0.5) * spacing - half;
      for (let ix = x0; ix <= x1; ix++) visit((ix + 0.5) * spacing - half, z, (iz * resolution + ix) * 2);
    }
  };
  for (const road of network.segments) {
    const margin = road.halfWidth + ROAD_DISTANCE_RANGE;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
      const dx = bx - ax, dz = bz - az;
      const lengthSquared = dx * dx + dz * dz;
      rasterize(Math.min(ax, bx) - margin, Math.min(az, bz) - margin,
        Math.max(ax, bx) + margin, Math.max(az, bz) + margin, (x, z, offset) => {
          const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
          const distance = Math.hypot(x - ax - t * dx, z - az - t * dz) - road.halfWidth;
          const encoded = Math.round(Math.max(0, Math.min(1, distance / (2 * ROAD_DISTANCE_RANGE) + 0.5)) * 255);
          data[offset] = Math.min(data[offset], encoded);
        });
    }
  }
  const soilPatch = (x: number, z: number, width: number, depth: number, angle: number, blend: number, strength: number) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    const boundX = Math.abs(c) * width / 2 + Math.abs(s) * depth / 2 + blend;
    const boundZ = Math.abs(s) * width / 2 + Math.abs(c) * depth / 2 + blend;
    rasterize(x - boundX, z - boundZ, x + boundX, z + boundZ, (wx, wz, offset) => {
      const dx = wx - x, dz = wz - z;
      const localX = dx * c + dz * s, localZ = -dx * s + dz * c;
      const distance = Math.hypot(Math.max(0, Math.abs(localX) - width / 2), Math.max(0, Math.abs(localZ) - depth / 2));
      const t = Math.max(0, 1 - distance / blend);
      data[offset + 1] = Math.max(data[offset + 1], Math.round(t * t * (3 - 2 * t) * strength * 255));
    });
  };
  for (const plot of farmlands) soilPatch(plot.center[0], plot.center[2], plot.width, plot.depth, plot.rotation, 8, 0.85);
  for (const building of buildings) soilPatch(building.position[0], building.position[2], building.width + 3, building.depth + 3, building.rotation, 5, 1);
  return { data, resolution, size };
}
