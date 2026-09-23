/**
 * Land-use zones over the map: enclosed farmland on the level ground, open
 * rough grazing and heath, and forest. A low-frequency noise field seeded
 * from the world picks the zone, so each seed mixes the three differently
 * while every zone stays several hundred metres across.
 */

export type LandUse = 'farm' | 'open' | 'forest';

function hash(x: number, z: number, seed: number) {
  const v = Math.sin(x * 127.1 + z * 311.7 + seed * 0.001731) * 43758.5453;
  return v - Math.floor(v);
}

function valueNoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

/** Smooth 0..1 field, features about 450 m across. */
export function landUseValue(x: number, z: number, seed: number) {
  const s = seed % 100003;
  return valueNoise(x / 450 + 13.1, z / 450 - 7.7, s) * 0.7 + valueNoise(x / 170 - 3.3, z / 170 + 5.9, s + 17) * 0.3;
}

// Thresholds give roughly half farmland, a third open land and a sixth forest.
const OPEN_FROM = 0.53;
const FOREST_FROM = 0.7;

export function landUseAt(x: number, z: number, seed: number): LandUse {
  const value = landUseValue(x, z, seed);
  return value >= FOREST_FROM ? 'forest' : value >= OPEN_FROM ? 'open' : 'farm';
}
