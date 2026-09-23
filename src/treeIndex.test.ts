import assert from 'node:assert/strict';
import test from 'node:test';
import type { TreeInstance } from './trees';
import { forEachTreeAlongRay, forEachTreeNear } from './treeIndex';

function random(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

const rng = random(7);
const trees: TreeInstance[] = Array.from({ length: 2500 }, () => ({
  position: [(rng() - 0.5) * 1800, 0, (rng() - 0.5) * 1800],
  rotation: 0, scale: 1, type: 'conifer', habitat: 'wood', health: 100, fallen: false, fallDirection: 0, fallProgress: 0,
}));
const RADIUS = 1;

// Distance in XZ from a tree to the ray segment [0, maxDistance].
function segmentDistance(tree: TreeInstance, ox: number, oz: number, dx: number, dz: number, maxDistance: number) {
  const px = tree.position[0] - ox, pz = tree.position[2] - oz;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq < 1e-12 ? 0 : Math.max(0, Math.min(maxDistance, (px * dx + pz * dz) / lengthSq));
  return Math.hypot(px - dx * t, pz - dz * t);
}

test('ray walk returns every tree whose collision circle touches the ray', () => {
  for (let i = 0; i < 400; i++) {
    const ox = (rng() - 0.5) * 1600, oz = (rng() - 0.5) * 1600;
    const angle = rng() * Math.PI * 2;
    const flat = 0.2 + rng() * 0.8; // XZ length of a 3D unit direction
    const dx = Math.cos(angle) * flat, dz = Math.sin(angle) * flat;
    const maxDistance = 50 + rng() * 900;
    const found = new Set<number>();
    forEachTreeAlongRay(trees, RADIUS, ox, oz, dx, dz, maxDistance, (index) => found.add(index));
    trees.forEach((tree, index) => {
      if (segmentDistance(tree, ox, oz, dx, dz, maxDistance) <= RADIUS) assert.ok(found.has(index), `ray ${i} missed tree ${index}`);
    });
  }
});

test('vertical and axis-aligned rays still find their trees', () => {
  const target = trees[10].position;
  for (const [dx, dz] of [[0, 0], [1, 0], [0, -1]]) {
    const found = new Set<number>();
    forEachTreeAlongRay(trees, RADIUS, target[0] - dx * 5, target[2] - dz * 5, dx, dz, 10, (index) => found.add(index));
    assert.ok(found.has(10));
  }
});

test('near query covers the requested reach', () => {
  for (let i = 0; i < 200; i++) {
    const x = (rng() - 0.5) * 1600, z = (rng() - 0.5) * 1600, reach = 2 + rng() * 40;
    const found = new Set<number>();
    forEachTreeNear(trees, RADIUS, x, z, reach, (index) => found.add(index));
    trees.forEach((tree, index) => {
      if (Math.abs(tree.position[0] - x) <= reach && Math.abs(tree.position[2] - z) <= reach) assert.ok(found.has(index));
    });
  }
});
