import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainSplatData } from './terrainSplat';
import type { RoadNetwork } from '../roads';

const network: RoadNetwork = { seed: 1, terrainSize: 100, junctions: [], segments: [
  { points: [[-40, -40], [40, 40]], halfWidth: 4 },
] };
function sample(map: ReturnType<typeof createTerrainSplatData>, x: number, z: number, channel = 0) {
  const px = (x / map.size + 0.5) * map.resolution - 0.5;
  const pz = (z / map.size + 0.5) * map.resolution - 0.5;
  const ix = Math.floor(px), iz = Math.floor(pz), fx = px - ix, fz = pz - iz;
  const at = (a: number, b: number) => map.data[(b * map.resolution + a) * 2 + channel] / 255;
  return (at(ix, iz) * (1-fx) + at(ix+1, iz) * fx) * (1-fz)
    + (at(ix, iz+1) * (1-fx) + at(ix+1, iz+1) * fx) * fz;
}
test('filtered diagonal road edge stays aligned between terrain vertices', () => {
  const map = createTerrainSplatData(network, [], [], 512);
  for (const along of [-20.3, 0.7, 23.4]) {
    const offset = 4 / Math.sqrt(2);
    assert.ok(Math.abs((sample(map, along + offset, along - offset) - 0.5) * 32) < 0.1);
    assert.ok(sample(map, along, along) < 0.4);
  }
});
test('crossings and zero-length segments produce finite continuous road coverage', () => {
  const map = createTerrainSplatData({ ...network, segments: [...network.segments,
    { points: [[-40, 40], [40, -40]], halfWidth: 6 },
    { points: [[20, 0], [20, 0]], halfWidth: 3 },
  ] }, [], [], 512);
  assert.ok(sample(map, 0, 0) < 0.35);
  assert.ok(sample(map, 20, 0) < 0.43);
  assert.ok(sample(map, -40, 0) > 0.95);
});
test('rotated farmland changes only soil coverage and regeneration removes old features', () => {
  const empty = { ...network, segments: [] };
  const map = createTerrainSplatData(empty, [{ id: 'plot', center: [0, 0, 0], rotation: Math.PI / 2, width: 30, depth: 4 }], [], 512);
  assert.ok(sample(map, 0, 12, 1) > 0.8);
  assert.equal(sample(map, 12, 0, 1), 0);
  assert.equal(sample(map, 0, 0), 1);
  const regenerated = createTerrainSplatData(empty, [], [], 512);
  assert.equal(sample(regenerated, 0, 12, 1), 0);
});
