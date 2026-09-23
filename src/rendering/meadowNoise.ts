import * as THREE from 'three';

/**
 * Pasture noise shared by the ground and the grass tufts, so a dry patch tints
 * the tufts standing in it the same way it tints the soil beneath.
 *
 * The noise is baked into a small tiling texture instead of hashed per pixel:
 * the ground covers most of the screen and a dozen hashed lookups there cost
 * several milliseconds on low-end GPUs. Two independent smooth value-noise
 * channels, 32 features across, eight texels per feature.
 */
const FEATURES = 32;
const TEXELS_PER_FEATURE = 8;

function createMeadowNoiseTexture() {
  const size = FEATURES * TEXELS_PER_FEATURE;
  const data = new Uint16Array(size * size * 2);
  // Deterministic lattice so every session sees the same pasture.
  let seed = 0x1f3a5c7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const lattices = [0, 1].map(() => Float32Array.from({ length: FEATURES * FEATURES }, random));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const gy = y / TEXELS_PER_FEATURE, iy = Math.floor(gy), fy = smooth(gy - iy);
    for (let x = 0; x < size; x++) {
      const gx = x / TEXELS_PER_FEATURE, ix = Math.floor(gx), fx = smooth(gx - ix);
      lattices.forEach((lattice, channel) => {
        const at = (i: number, j: number) => lattice[(j % FEATURES) * FEATURES + (i % FEATURES)];
        const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
        const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
        data[(y * size + x) * 2 + channel] = THREE.DataUtils.toHalfFloat(top + (bottom - top) * fy);
      });
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGFormat, THREE.HalfFloatType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

let noiseTexture: THREE.DataTexture | null = null;
/** Shared uniform: one texture for every material that uses the noise. */
export function getMeadowNoiseUniform() {
  noiseTexture ??= createMeadowNoiseTexture();
  return { value: noiseTexture };
}

export const meadowNoise = /* glsl */ `
  uniform sampler2D meadowNoiseMap;
  // Smooth value noise with one feature per unit of p, in [0, 1].
  float meadowValue(vec2 p) {
    return texture2D(meadowNoiseMap, p * ${(1 / FEATURES).toFixed(6)}).r;
  }
  float meadowValueB(vec2 p) {
    return texture2D(meadowNoiseMap, p * ${(1 / FEATURES).toFixed(6)}).g;
  }
  // 0 = lush green, 1 = sun-dried straw; varies over tens of metres.
  float meadowDryness(vec2 xz) {
    return meadowValue(xz / 85.0) * 0.62 + meadowValueB(xz / 31.0 + 17.0) * 0.28 + meadowValue(xz / 9.0 - 5.0) * 0.1;
  }
`;
