import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, Particle } from './store';
import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { queueFlashLight } from './rendering/FlashLights';
import { queueImpactDecal } from './rendering/ImpactDecals';
import { SUN_DIRECTION } from './rendering/BattlefieldLighting';

// --- Textures ---
const createDustTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
};
const dustTexture = createDustTexture();

const createSparkTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 200, 1)');
  gradient.addColorStop(1, 'rgba(255, 200, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 16);
  return new THREE.CanvasTexture(canvas);
};
const sparkTexture = createSparkTexture();

const createRingTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.58, 'rgba(255, 248, 236, 0.32)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.84, 'rgba(255, 240, 220, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
};
const ringTexture = createRingTexture();

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// Four lumpy puffs in a 2x2 atlas. Overlapping soft lobes with an eroded edge
// read as billowing smoke or thrown earth instead of a smooth ball.
const createSmokeAtlas = () => {
  const cell = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * 2;
  const ctx = canvas.getContext('2d')!;
  for (let variant = 0; variant < 4; variant++) {
    const random = seededRandom(97 + variant * 131);
    const ox = (variant % 2) * cell;
    const oy = Math.floor(variant / 2) * cell;
    for (let lobe = 0; lobe < 15; lobe++) {
      const angle = random() * Math.PI * 2;
      const distance = random() * cell * 0.2;
      const x = ox + cell / 2 + Math.cos(angle) * distance;
      const y = oy + cell / 2 + Math.sin(angle) * distance;
      const radius = cell * (0.13 + random() * 0.17);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,' + (0.35 + random() * 0.3).toFixed(3) + ')');
      gradient.addColorStop(0.6, 'rgba(255,255,255,0.18)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(ox, oy, cell, cell);
    }
  }
  // Erode the alpha with value noise and force it to zero at each cell's rim.
  const image = ctx.getImageData(0, 0, cell * 2, cell * 2);
  const noiseRandom = seededRandom(11);
  const grid = 17;
  const lattice = Array.from({ length: grid * grid }, () => noiseRandom());
  const noise = (x: number, y: number) => {
    const gx = (x / (cell * 2)) * (grid - 1), gy = (y / (cell * 2)) * (grid - 1);
    const ix = Math.min(grid - 2, Math.floor(gx)), iy = Math.min(grid - 2, Math.floor(gy));
    const fx = gx - ix, fy = gy - iy;
    const a = lattice[iy * grid + ix], b = lattice[iy * grid + ix + 1];
    const c = lattice[(iy + 1) * grid + ix], d = lattice[(iy + 1) * grid + ix + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  for (let y = 0; y < cell * 2; y++) {
    for (let x = 0; x < cell * 2; x++) {
      const r = Math.hypot((x % cell) - cell / 2, (y % cell) - cell / 2) / (cell / 2);
      const rim = Math.max(0, Math.min(1, (1 - r) / 0.3));
      const index = (y * cell * 2 + x) * 4 + 3;
      image.data[index] = image.data[index] * rim * (0.55 + 0.45 * noise(x, y));
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
};
const smokeAtlas = createSmokeAtlas();

// Hot core with short irregular rays: a gun flash rather than a round glow.
const createFlashTexture = () => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(5);
  ctx.globalCompositeOperation = 'lighter';
  for (let ray = 0; ray < 7; ray++) {
    const angle = (ray / 7) * Math.PI * 2 + random() * 0.5;
    const length = size * (0.28 + random() * 0.2);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(angle);
    const gradient = ctx.createLinearGradient(0, 0, length, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.05);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, size * 0.05);
    ctx.fill();
    ctx.restore();
  }
  const core = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.3);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
};
const flashTexture = createFlashTexture();

// Shared by every sprite pool; refreshed once per frame.
const spriteUniforms = {
  uSunView: { value: new THREE.Vector3(0, 1, 0) },
  uLightColor: { value: new THREE.Color(0.78, 0.7, 0.6) },
  // Slightly warm skylight so brown earth does not turn blue-grey in shade.
  uAmbientColor: { value: new THREE.Color(0.46, 0.44, 0.4) },
  uFogColor: { value: new THREE.Color(0.7, 0.7, 0.66) },
  uFogNear: { value: 120 },
  uFogFar: { value: 1400 },
};
const WIND = { x: 0.9, z: 0.35 }; // m/s drift for smoke plumes

// --- Pool sizes ---
const MAX_ADDITIVE = 384; // world-space flash + fireball
const MAX_MUZZLE_ADDITIVE = 160;
const MAX_IMPACT_ADDITIVE = 256;
const MAX_IMPACT_SPARK = 512;
const MAX_SHOCKWAVE = 96;
const MAX_SPARK = 256;
const MAX_SMOKE = 1024;
const MAX_MUZZLE_SMOKE = 256;
const MAX_FIRE = 512;
const MAX_DEBRIS = 1024;

// --- Sub-particle state ---
interface SubState {
  particleId: string;
  type: 'flash' | 'smoke' | 'dirt' | 'fireball' | 'debris' | 'spark' | 'shockwave' | 'muzzleFlash' | 'muzzleFireball' | 'muzzleSmoke' | 'impactFlash' | 'impactSpark' | 'ember' | 'plume' | 'wreckFire';
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  baseScale: number;
  r: number; g: number; b: number;
  lifeMultiplier: number;
  rotSpeed: number;
  rotation: number;
  createdAt: number;
  lifetime: number;
  /** Smoke atlas cell, 0-3. */
  variant: number;
  /** Colour a plume dilutes toward as it rises. */
  r2: number; g2: number; b2: number;
}

// --- Shaders for Points ---
const spriteVertexShader = /* glsl */ `
attribute float aSize;
attribute float aOpacity;
attribute float aRotation;
attribute float aVariant;
attribute vec3 aColor;
varying float vOpacity;
varying float vRotation;
varying float vVariant;
varying float vFogDepth;
varying vec3 vColor;

void main() {
  vOpacity = aOpacity;
  vRotation = aRotation;
  vVariant = aVariant;
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mvPosition.z;
  gl_PointSize = aSize * (520.0 / -mvPosition.z);
  gl_PointSize = clamp(gl_PointSize, 0.0, 512.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const spriteFragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform float uAtlas, uLit, uAdditive;
uniform vec3 uSunView, uLightColor, uAmbientColor, uFogColor;
uniform float uFogNear, uFogFar;
varying float vOpacity;
varying float vRotation;
varying float vVariant;
varying float vFogDepth;
varying vec3 vColor;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRotation);
  float s = sin(vRotation);
  vec2 uv = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  if (uAtlas > 0.5) uv = (uv + vec2(mod(vVariant, 2.0), floor(vVariant * 0.5))) * 0.5;
  vec4 tex = texture2D(uMap, uv);
  float alpha = tex.a * vOpacity;
  if (alpha < 0.002) discard;
  vec3 color = vColor * tex.rgb;
  if (uLit > 0.5) {
    // Shade each puff as a sphere in view space: sunlit top, dark underside.
    vec2 q = vec2(p.x, -p.y) * 2.0;
    vec3 normal = normalize(vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))) + 0.35));
    float sun = clamp(dot(normal, uSunView) * 0.6 + 0.4, 0.0, 1.0);
    color *= uAmbientColor + uLightColor * sun;
  }
  float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
  color = uAdditive > 0.5 ? color * (1.0 - fog) : mix(color, uFogColor, fog);
  gl_FragColor = vec4(color, alpha);
}
`;

// --- Debris shaders ---
const debrisVertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aOpacity;
varying vec3 vColor;
varying float vOpacity;

void main() {
  vColor = aColor;
  vOpacity = aOpacity;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const debrisFragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vOpacity;

void main() {
  if (vOpacity < 0.001) discard;
  gl_FragColor = vec4(vColor, vOpacity);
}
`;

// --- Pool creation helpers ---
function createPointPool(
  maxCount: number,
  texture: THREE.Texture,
  blending: THREE.Blending,
  options?: { depthTest?: boolean; atlas?: boolean; lit?: boolean }
) {
  const positionAttr = new THREE.BufferAttribute(new Float32Array(maxCount * 3), 3);
  const sizeAttr = new THREE.BufferAttribute(new Float32Array(maxCount), 1);
  const opacityAttr = new THREE.BufferAttribute(new Float32Array(maxCount), 1);
  const rotationAttr = new THREE.BufferAttribute(new Float32Array(maxCount), 1);
  const variantAttr = new THREE.BufferAttribute(new Float32Array(maxCount), 1);
  const colorAttr = new THREE.BufferAttribute(new Float32Array(maxCount * 3), 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('aSize', sizeAttr);
  geometry.setAttribute('aOpacity', opacityAttr);
  geometry.setAttribute('aRotation', rotationAttr);
  geometry.setAttribute('aVariant', variantAttr);
  geometry.setAttribute('aColor', colorAttr);
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...spriteUniforms,
      uMap: { value: texture },
      uAtlas: { value: options?.atlas ? 1 : 0 },
      uLit: { value: options?.lit ? 1 : 0 },
      uAdditive: { value: blending === THREE.AdditiveBlending ? 1 : 0 },
    },
    vertexShader: spriteVertexShader,
    fragmentShader: spriteFragmentShader,
    transparent: true,
    depthTest: options?.depthTest ?? true,
    depthWrite: false,
    blending,
  });

  return {
    geometry,
    material,
    positions: positionAttr.array as Float32Array,
    sizes: sizeAttr.array as Float32Array,
    opacities: opacityAttr.array as Float32Array,
    rotations: rotationAttr.array as Float32Array,
    variants: variantAttr.array as Float32Array,
    colors: colorAttr.array as Float32Array,
  };
}

type PointPool = ReturnType<typeof createPointPool>;

function writeSprite(pool: PointPool, index: number, sub: SubState, size: number, opacity: number, r = sub.r, g = sub.g, b = sub.b) {
  pool.positions[index * 3] = sub.px;
  pool.positions[index * 3 + 1] = sub.py;
  pool.positions[index * 3 + 2] = sub.pz;
  pool.sizes[index] = size;
  pool.opacities[index] = opacity;
  pool.rotations[index] = sub.rotation;
  pool.variants[index] = sub.variant;
  pool.colors[index * 3] = r;
  pool.colors[index * 3 + 1] = g;
  pool.colors[index * 3 + 2] = b;
}

function flagPool(pool: PointPool, count: number) {
  pool.geometry.setDrawRange(0, count);
  if (count === 0) return;
  for (const name of ['position', 'aSize', 'aOpacity', 'aRotation', 'aVariant', 'aColor']) {
    (pool.geometry.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }
}

// --- Particle spawning logic ---
const _tmpColor = new THREE.Color();

function getConfig(type: Particle['type']) {
  switch (type) {
    case 'fire': return GAME_CONFIG.particles.fire;
    case 'hit_penetrate': return GAME_CONFIG.particles.hit_penetrate;
    case 'hit_bounce': return GAME_CONFIG.particles.hit_bounce;
    case 'non_pen_impact': return GAME_CONFIG.particles.non_pen_impact;
    case 'ricochet_impact': return GAME_CONFIG.particles.ricochet_impact;
    case 'hit_ground': return GAME_CONFIG.particles.hit_ground;
    case 'he_hit_ground': return GAME_CONFIG.particles.he_hit_ground;
    case 'he_hit_penetrate': return GAME_CONFIG.particles.he_hit_penetrate;
    case 'tank_explosion': return GAME_CONFIG.particles.tank_explosion;
    case 'dust': return GAME_CONFIG.particles.dust;
    case 'dust_low': return GAME_CONFIG.particles.dust_low;
    case 'track_grass': return GAME_CONFIG.particles.track_grass;
    case 'track_mud': return GAME_CONFIG.particles.track_mud;
    case 'burning_smoke': return GAME_CONFIG.particles.burning_smoke;
    case 'wreck_fire': return GAME_CONFIG.particles.wreck_fire;
    case 'tree_hit': return GAME_CONFIG.particles.tree_hit;
    default: return GAME_CONFIG.particles.default;
  }
}

function pushSub(
  subs: SubState[],
  particleId: string,
  type: SubState['type'],
  basePos: { x: number; y: number; z: number },
  offX: number, offY: number, offZ: number,
  vx: number, vy: number, vz: number,
  scale: number,
  color: string,
  life: number,
  rotSpeed: number,
  createdAt: number,
  lifetime: number
) {
  _tmpColor.set(color);
  subs.push({
    particleId, type,
    px: basePos.x + offX, py: basePos.y + offY, pz: basePos.z + offZ,
    vx, vy, vz,
    baseScale: scale,
    r: _tmpColor.r, g: _tmpColor.g, b: _tmpColor.b,
    r2: _tmpColor.r, g2: _tmpColor.g, b2: _tmpColor.b,
    lifeMultiplier: life,
    rotSpeed,
    rotation: Math.random() * Math.PI * 2,
    createdAt,
    lifetime,
    variant: Math.floor(Math.random() * 4),
  });
}

function spawnSubParticles(p: Particle, subs: SubState[]) {
  const { type, position: pos, normal, scale: effectScale = 1, createdAt } = p;
  const config = getConfig(type);
  const lifetime = config.lifetime;
  const s = effectScale;
  const cs = config.size ?? 1;
  const sc = (count: number) => Math.max(1, Math.floor(count * s));
  const sv = Math.sqrt(s);

  const n = normal
    ? new THREE.Vector3(normal.x, normal.y, normal.z).normalize()
    : new THREE.Vector3(0, 1, 0);

  const randomConeVector = (spread: number) => {
    const dir = n.clone();
    const tangent = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const bitangent = dir.clone().cross(tangent).normalize();
    const realTangent = bitangent.clone().cross(dir).normalize();
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spread;
    return dir.add(realTangent.multiplyScalar(Math.cos(angle) * radius)).add(bitangent.multiplyScalar(Math.sin(angle) * radius)).normalize();
  };

  // Tangent basis around the surface normal for ground-hugging rings.
  const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

  const add = (type: SubState['type'], ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, scale: number, color: string, life: number, rot: number) =>
    pushSub(subs, p.id, type, pos, ox, oy, oz, vx, vy, vz, scale, color, life, rot, createdAt, lifetime);

  const cone = (type: SubState['type'], spread: number, speed: number, scale: number, color: string, life: number, rot: number) => {
    const v = randomConeVector(spread).multiplyScalar(speed);
    add(type, 0, 0, 0, v.x, v.y, v.z, scale, color, life, rot);
  };

  const jet = (type: SubState['type'], distance: number, spread: number, speed: number, scale: number, color: string, life: number, rot: number) => {
    const v = randomConeVector(spread);
    add(
      type,
      v.x * distance,
      v.y * distance,
      v.z * distance,
      v.x * speed,
      v.y * speed,
      v.z * speed,
      scale,
      color,
      life,
      rot,
    );
  };

  // Low skirt of material pushed outward along the surface.
  const ring = (type: SubState['type'], count: number, speedMin: number, speedMax: number, lift: number, scaleMin: number, scaleMax: number, colors: string[], lifeMin: number, lifeMax: number) => {
    const total = sc(count);
    for (let i = 0; i < total; i++) {
      const angle = (i / total) * Math.PI * 2 + Math.random() * 0.6;
      const speed = (speedMin + Math.random() * (speedMax - speedMin)) * sv;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      const dx = t1.x * c + t2.x * sn;
      const dy = t1.y * c + t2.y * sn;
      const dz = t1.z * c + t2.z * sn;
      add(
        type,
        dx * 0.4 * s + n.x * 0.2 * s, dy * 0.4 * s + n.y * 0.2 * s, dz * 0.4 * s + n.z * 0.2 * s,
        dx * speed + n.x * lift * sv, dy * speed + n.y * lift * sv, dz * speed + n.z * lift * sv,
        (scaleMin + Math.random() * (scaleMax - scaleMin)) * s,
        colors[i % colors.length],
        lifeMin + Math.random() * (lifeMax - lifeMin),
        (Math.random() - 0.5) * 1.6,
      );
    }
  };

  const DIRT = ['#6e5834', '#57452a', '#806842', '#4a3a22'];

  if (type === 'hit_ground') {
    // Kinetic strike into soil: dull flash, a column of thrown earth, then a dust skirt.
    add('flash', 0, 0, 0, 0, 0, 0, 1.8 * s, '#ffc27a', 0.07, 0);
    for (let i = 0; i < sc(15); i++) cone('dirt', 0.3, (11 + Math.random() * 12) * sv, (1.7 + Math.random() * 1.4) * s, DIRT[i % DIRT.length], 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(3); i++) cone('smoke', 1.2, (0.6 + Math.random() * 1.0) * sv, (2.0 + Math.random() * 1.2) * s, '#6f6250', 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8);
    ring('dirt', 9, 3, 6, 1.2, 1.6, 2.6, ['#8a7650', '#75623f'], 0.55, 0.8);
    for (let i = 0; i < sc(5); i++) cone('smoke', 1.0, (1.5 + Math.random() * 2.5) * sv, (1.8 + Math.random() * 1.6) * s, '#7a6848', 0.85 + Math.random() * 0.15, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(18); i++) cone('debris', 0.8, (9 + Math.random() * 9) * sv, (0.12 + Math.random() * 0.2) * s, i % 2 ? '#3d2e15' : '#2a2012', 0.7, 0);
  } else if (type === 'hit_penetrate') {
    const ox = n.x * 0.18 * s;
    const oy = n.y * 0.18 * s;
    const oz = n.z * 0.18 * s;
    add('impactFlash', ox, oy, oz, 0, 0, 0, 6.0 * s, '#fffaf0', 0.05, 0);
    add('impactFlash', ox, oy, oz, 0, 0, 0, 4.0 * s, '#ffc46b', 0.08, 0);
    // Short tongue of flame blown back out of the breach.
    for (let i = 0; i < sc(3); i++) jet('fireball', 0.3 * s, 0.35, (3 + Math.random() * 3) * sv, (1.2 + Math.random() * 0.8) * s, i === 0 ? '#ffd08a' : '#ff6a1a', 0.08 + Math.random() * 0.05, (Math.random() - 0.5) * 2);
    // Molten spall and burning fragments thrown back out of the breach.
    for (let i = 0; i < sc(26); i++) {
      cone('impactSpark', 1.3, (10 + Math.random() * 16) * sv, (0.4 + Math.random() * 0.22) * s, i < 8 ? '#fff4c8' : (i < 18 ? '#ffc04a' : '#ff7a14'), 0.12 + Math.random() * 0.18, 0);
    }
    for (let i = 0; i < sc(10); i++) cone('spark', 0.9, (5 + Math.random() * 6) * sv, 0.34 * s, '#ff9a2a', 0.3 + Math.random() * 0.25, 0);
    // Glowing hole that cools from yellow to dull red.
    add('ember', n.x * 0.05 * s, n.y * 0.05 * s, n.z * 0.05 * s, 0, 0, 0, 1.1 * s, '#ffb050', 0.55, 0);
    // Smoke leaking out of the breach.
    for (let i = 0; i < sc(6); i++) cone('smoke', 0.5, (0.8 + Math.random() * 1.4) * sv, (0.9 + Math.random() * 0.8) * s, i < 3 ? '#2b2926' : '#4a4640', 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 2);
  } else if (type === 'hit_bounce') {
    const ox = n.x * 0.28 * s;
    const oy = n.y * 0.28 * s;
    const oz = n.z * 0.28 * s;
    add('impactFlash', ox, oy, oz, 0, 0, 0, 4.8 * s, '#fffaf0', 0.12, 0);
    add('impactFlash', ox, oy, oz, 0, 0, 0, 3.3 * s, '#ffd27a', 0.18, 0);
    for (let i = 0; i < sc(28); i++) {
      const v = randomConeVector(2.4);
      const tangential = v.clone().sub(n.clone().multiplyScalar(v.dot(n))).normalize();
      const speed = (16 + Math.random() * 18) * sv;
      add(
        'impactSpark',
        ox + tangential.x * 0.05 * s,
        oy + tangential.y * 0.05 * s,
        oz + tangential.z * 0.05 * s,
        tangential.x * speed + n.x * (1.5 + Math.random() * 1.5) * sv,
        tangential.y * speed + n.y * (1.5 + Math.random() * 1.5) * sv,
        tangential.z * speed + n.z * (1.5 + Math.random() * 1.5) * sv,
        (0.52 + Math.random() * 0.22) * s,
        i < 10 ? '#fff2b8' : (i < 20 ? '#ffcc66' : '#ff8a00'),
        0.26 + Math.random() * 0.18,
        0,
      );
    }
    for (let i = 0; i < sc(10); i++) {
      const v = randomConeVector(0.85);
      add(
        'impactSpark',
        ox,
        oy,
        oz,
        v.x * (9 + Math.random() * 8) * sv,
        v.y * (9 + Math.random() * 8) * sv,
        v.z * (9 + Math.random() * 8) * sv,
        (0.36 + Math.random() * 0.16) * s,
        i < 4 ? '#fff8de' : '#ffb347',
        0.16 + Math.random() * 0.12,
        0,
      );
    }
    for (let i = 0; i < sc(3); i++) {
      add(
        'smoke',
        ox + (Math.random() - 0.5) * 0.04 * s,
        oy + (Math.random() - 0.5) * 0.04 * s,
        oz + (Math.random() - 0.5) * 0.04 * s,
        n.x * (0.5 + Math.random() * 0.4) * sv,
        n.y * (0.5 + Math.random() * 0.4) * sv,
        n.z * (0.5 + Math.random() * 0.4) * sv,
        (0.65 + Math.random() * 0.25) * s,
        i === 0 ? '#8c877f' : '#5a564f',
        0.42 + Math.random() * 0.18,
        (Math.random() - 0.5) * 1.5,
      );
    }
  } else if (type === 'non_pen_impact') {
    const ox = n.x * 0.22 * s;
    const oy = n.y * 0.22 * s;
    const oz = n.z * 0.22 * s;
    add('impactFlash', ox, oy, oz, 0, 0, 0, 5.8 * s * cs, '#fffdf4', 0.12, 0);
    add('impactFlash', ox, oy, oz, 0, 0, 0, 4.2 * s * cs, '#ffe09a', 0.18, 0);
    add('impactFlash', ox, oy, oz, 0, 0, 0, 3.0 * s * cs, '#ffb347', 0.22, 0);
    for (let i = 0; i < sc(36); i++) {
      const v = randomConeVector(2.1);
      const tangent = v.clone().sub(n.clone().multiplyScalar(v.dot(n))).normalize();
      add(
        'impactSpark',
        ox + tangent.x * 0.08 * s,
        oy + tangent.y * 0.08 * s,
        oz + tangent.z * 0.08 * s,
        tangent.x * (17 + Math.random() * 16) * sv + n.x * (1.4 + Math.random() * 1.6) * sv,
        tangent.y * (17 + Math.random() * 16) * sv + n.y * (1.4 + Math.random() * 1.6) * sv,
        tangent.z * (17 + Math.random() * 16) * sv + n.z * (1.4 + Math.random() * 1.6) * sv,
        (0.66 + Math.random() * 0.24) * s * cs,
        i < 24 ? '#fff7cf' : (i < 52 ? '#ffd87f' : '#ff9620'),
        0.2 + Math.random() * 0.16,
        0,
      );
    }
    for (let i = 0; i < sc(5); i++) {
      const v = randomConeVector(0.9);
      add(
        'impactSpark',
        ox,
        oy,
        oz,
        v.x * (8 + Math.random() * 6) * sv,
        v.y * (8 + Math.random() * 6) * sv,
        v.z * (8 + Math.random() * 6) * sv,
        (0.46 + Math.random() * 0.18) * s * cs,
        i < 5 ? '#fffef2' : '#ffca68',
        0.12 + Math.random() * 0.08,
        0,
      );
    }
    for (let i = 0; i < sc(2); i++) {
      cone('smoke', 0.7, (0.8 + Math.random() * 0.9) * sv, (0.75 + Math.random() * 0.25) * s * cs, i === 0 ? '#80776f' : '#5b554f', 0.3 + Math.random() * 0.12, (Math.random() - 0.5) * 1.2);
    }
    // Brief hot gouge where the shell struck.
    add('ember', ox * 0.3, oy * 0.3, oz * 0.3, 0, 0, 0, 0.7 * s, '#ffc870', 0.45, 0);
  } else if (type === 'ricochet_impact') {
    const ox = n.x * 0.24 * s;
    const oy = n.y * 0.24 * s;
    const oz = n.z * 0.24 * s;
    add('impactFlash', ox, oy, oz, 0, 0, 0, 6.2 * s * cs, '#fff8dc', 0.11, 0);
    add('impactFlash', ox, oy, oz, 0, 0, 0, 4.4 * s * cs, '#ffc761', 0.16, 0);
    for (let i = 0; i < sc(42); i++) {
      const v = randomConeVector(2.8);
      const tangent = v.clone().sub(n.clone().multiplyScalar(v.dot(n))).normalize();
      const forwardBias = 0.6 + Math.random() * 1.2;
      add(
        'impactSpark',
        ox + tangent.x * 0.06 * s,
        oy + tangent.y * 0.06 * s,
        oz + tangent.z * 0.06 * s,
        tangent.x * (19 + Math.random() * 18) * sv + n.x * (1.3 + forwardBias * 1.2) * sv,
        tangent.y * (19 + Math.random() * 18) * sv + n.y * (1.3 + forwardBias * 1.2) * sv,
        tangent.z * (19 + Math.random() * 18) * sv + n.z * (1.3 + forwardBias * 1.2) * sv,
        (0.7 + Math.random() * 0.26) * s * cs,
        i < 28 ? '#fff8cf' : (i < 60 ? '#ffd97e' : '#ff8d1a'),
        0.16 + Math.random() * 0.12,
        0,
      );
    }
  } else if (type === 'he_hit_ground') {
    // Detonation in soil: white-hot flash, short fireball, blast ring, tall dark earth column.
    add('flash', 0, 0, 0, 0, 0, 0, 6.5 * s, '#fff4e0', 0.06, 0);
    add('flash', n.x * 0.3 * s, n.y * 0.3 * s, n.z * 0.3 * s, 0, 0, 0, 4.2 * s, '#ffb060', 0.12, 0);
    add('shockwave', n.x * 0.3 * s, n.y * 0.3 * s, n.z * 0.3 * s, 0, 0, 0, 3.6 * s, '#e9dcc6', 0.12, Math.random() * Math.PI * 2);
    for (let i = 0; i < sc(5); i++) cone('fireball', 0.9, (3 + Math.random() * 4) * sv, (2.0 + Math.random() * 1.6) * s, i < 2 ? '#ffd08a' : '#ff6a1a', 0.14 + Math.random() * 0.1, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(26); i++) cone('dirt', 0.38, (5 + Math.random() * 23) * sv, (2.2 + Math.random() * 1.8) * s, i < 9 ? '#2e2519' : DIRT[i % DIRT.length], 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(6); i++) cone('smoke', 1.4, (0.8 + Math.random() * 1.4) * sv, (3.0 + Math.random() * 2.0) * s, i % 2 ? '#6b5d45' : '#574b38', 1.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8);
    ring('dirt', 12, 5, 9, 1.5, 2.0, 3.2, ['#6e5c3e', '#5a4a30'], 0.55, 0.85);
    for (let i = 0; i < sc(8); i++) cone('smoke', 1.2, (1.5 + Math.random() * 2) * sv, (2.6 + Math.random() * 2.4) * s, i < 4 ? '#3e3428' : '#5f4f36', 0.9 + Math.random() * 0.1, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(24); i++) cone('debris', 1.3, (10 + Math.random() * 9) * sv, (0.16 + Math.random() * 0.24) * s, i % 2 ? '#3d2e15' : '#241b10', 0.6, 0);
  } else if (type === 'he_hit_penetrate') {
    const ox = n.x * 0.25 * s;
    const oy = n.y * 0.25 * s;
    const oz = n.z * 0.25 * s;
    add('impactFlash', ox, oy, oz, 0, 0, 0, 6.5 * s, '#fff4e0', 0.05, 0);
    add('impactFlash', ox, oy, oz, 0, 0, 0, 4.5 * s, '#ffb060', 0.09, 0);
    add('shockwave', ox, oy, oz, 0, 0, 0, 3.2 * s, '#e9dcc6', 0.11, Math.random() * Math.PI * 2);
    for (let i = 0; i < sc(4); i++) cone('fireball', 1.0, (2.5 + Math.random() * 3) * sv, (1.8 + Math.random() * 1.5) * s, i < 2 ? '#ffd08a' : '#ff5a14', 0.14 + Math.random() * 0.1, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(20); i++) cone('impactSpark', 1.5, (12 + Math.random() * 14) * sv, (0.42 + Math.random() * 0.2) * s, i < 8 ? '#fff0b8' : '#ffa030', 0.14 + Math.random() * 0.16, 0);
    add('ember', n.x * 0.05 * s, n.y * 0.05 * s, n.z * 0.05 * s, 0, 0, 0, 1.4 * s, '#ff9a40', 0.5, 0);
    for (let i = 0; i < sc(8); i++) cone('smoke', 1.0, (1 + Math.random() * 2) * sv, (2.0 + Math.random() * 2) * s, i < 4 ? '#221f1c' : '#3a3632', 0.7 + Math.random() * 0.3, (Math.random() - 0.5) * 2);
  } else if (type === 'tank_explosion') {
    // Large blast silhouette with restrained fragment size.
    const radialBurst = (
      subType: SubState['type'],
      count: number,
      radius: number,
      lateralSpeedMin: number,
      lateralSpeedMax: number,
      upSpeedMin: number,
      upSpeedMax: number,
      scaleMin: number,
      scaleMax: number,
      colorA: string,
      colorB: string,
      lifeMin: number,
      lifeMax: number,
      rotScale: number,
    ) => {
      for (let i = 0; i < sc(count); i++) {
        const angle = Math.random() * Math.PI * 2;
        const radiusJitter = radius * (0.35 + Math.random() * 0.65);
        const ox = Math.cos(angle) * radiusJitter * s;
        const oz = Math.sin(angle) * radiusJitter * s;
        const oy = Math.random() * 0.9 * s;
        const lateralSpeed = (lateralSpeedMin + Math.random() * (lateralSpeedMax - lateralSpeedMin)) * sv;
        const upSpeed = (upSpeedMin + Math.random() * (upSpeedMax - upSpeedMin)) * sv;
        add(
          subType,
          ox,
          oy,
          oz,
          Math.cos(angle) * lateralSpeed,
          upSpeed,
          Math.sin(angle) * lateralSpeed,
          (scaleMin + Math.random() * (scaleMax - scaleMin)) * s,
          i < Math.ceil(count / 2) ? colorA : colorB,
          lifeMin + Math.random() * (lifeMax - lifeMin),
          (Math.random() - 0.5) * rotScale,
        );
      }
    };

    add('flash', 0, 0, 0, 0, 0, 0, 22.0 * s, '#ffffff', 0.13, 0);
    add('flash', 0, 0.22 * s, 0, 0, 0, 0, 16.0 * s, '#ffe6bf', 0.22, 0);
    add('flash', 0, 0.4 * s, 0, 0, 0, 0, 10.5 * s, '#ffb870', 0.3, 0);
    add('shockwave', 0, 0.14 * s, 0, 0, 0, 0, 11.0 * s, '#f5ead8', 0.2, Math.random() * Math.PI * 2);
    add('shockwave', 0, 0.32 * s, 0, 0, 0, 0, 7.0 * s, '#ddd4c8', 0.26, Math.random() * Math.PI * 2);
    add('shockwave', 0, 0.56 * s, 0, 0, 0, 0, 4.2 * s, '#b9b0a3', 0.32, Math.random() * Math.PI * 2);
    add('fireball', 0, 0.55 * s, 0, 0, 5.5 * sv, 0, 8.0 * s, '#ffe5ac', 0.16, (Math.random() - 0.5) * 1.6);
    add('fireball', 0, 0.92 * s, 0, 0, 4.2 * sv, 0, 6.0 * s, '#ff7426', 0.24, (Math.random() - 0.5) * 1.8);
    radialBurst('fireball', 18, 1.6, 3.0, 6.5, 3.0, 8.0, 2.2, 4.2, '#ffe0b0', '#ff9f3c', 0.14, 0.3, 2.0);
    radialBurst('smoke', 30, 1.8, 2.0, 4.5, 5.0, 10.0, 2.8, 4.8, '#141414', '#3b3026', 1.3, 1.9, 1.2);
    radialBurst('smoke', 14, 2.6, 5.0, 8.0, 0.6, 1.8, 2.4, 3.6, '#2b2620', '#4a4034', 1.0, 1.4, 1.6);
    radialBurst('spark', 34, 1.9, 13.0, 20.0, 0.8, 2.6, 0.28, 0.42, '#fff0b0', '#ff9f1c', 0.28, 0.46, 0);
    radialBurst('debris', 10, 1.5, 10.0, 14.0, 0.4, 1.6, 0.05, 0.1, '#3b2d1f', '#111111', 0.65, 0.8, 0);
  } else if (type === 'fire') {
    // Life multipliers are fractions of the 1200 ms 'fire' lifetime: flash ~90 ms, smoke ~1 s.
    const nv = n.clone().multiplyScalar(6.5 * sv);
    add('muzzleFlash', n.x * 0.55 * s, n.y * 0.55 * s, n.z * 0.55 * s, 0, 0, 0, 7.5 * s, '#fff8eb', 0.08, 0);
    add('muzzleFlash', n.x * 1.0 * s, n.y * 1.0 * s, n.z * 1.0 * s, 0, 0, 0, 5.2 * s, '#ffd08a', 0.07, 0);
    add('muzzleFlash', n.x * 1.5 * s, n.y * 1.5 * s, n.z * 1.5 * s, 0, 0, 0, 3.6 * s, '#ff7a1a', 0.06, 0);
    // Kept compact: a camera-facing ring this close to the lens otherwise balloons over the whole view.
    add('shockwave', n.x * 1.15 * s, n.y * 1.15 * s, n.z * 1.15 * s, 0, 0, 0, 2.6 * s, '#5e5850', 0.115, Math.random() * Math.PI * 2);
    for (let i = 0; i < sc(5); i++) {
      jet('muzzleFireball', 0.9 * s + Math.random() * 1.7 * s, 0.24, (11 + Math.random() * 10) * sv, (2.0 + Math.random() * 1.6) * s, i < 2 ? '#fff0b0' : '#ff6a00', 0.085 + Math.random() * 0.035, (Math.random() - 0.5) * 1.8);
    }
    for (let i = 0; i < sc(7); i++) {
      jet('muzzleSmoke', 0.8 * s + Math.random() * 1.6 * s, 0.42, (4.5 + Math.random() * 5.5) * sv, (1.8 + Math.random() * 1.5) * s, i < 4 ? '#c9c4bb' : '#98928a', 0.55 + Math.random() * 0.35, (Math.random() - 0.5) * 2);
    }
    for (let i = 0; i < sc(4); i++) {
      jet('muzzleSmoke', 0.25 * s + Math.random() * 0.7 * s, 0.18, (2.5 + Math.random() * 2.5) * sv, (1.4 + Math.random() * 0.9) * s, '#ded9cf', 0.14 + Math.random() * 0.05, (Math.random() - 0.5) * 2);
    }
    add('muzzleSmoke', n.x * 0.45 * s, n.y * 0.45 * s, n.z * 0.45 * s, nv.x, nv.y, nv.z, 3.2 * s, '#d7d2ca', 0.75, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(4); i++) {
      jet('smoke', 1.2 * s + Math.random() * 2.2 * s, 0.5, (1.2 + Math.random() * 1.8) * sv, (1.6 + Math.random() * 1.2) * s, i % 2 ? '#a19b92' : '#8a847b', 2.0 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8);
    }
    add('muzzleSmoke', n.x * 1.0 * s, n.y * 1.0 * s, n.z * 1.0 * s, nv.x * 0.7, nv.y * 0.7, nv.z * 0.7, 2.6 * s, '#8a847d', 1.0, (Math.random() - 0.5) * 2);

    // Muzzle blast lifts a ring of dust off the ground beneath and ahead of the barrel.
    const blastX = pos.x + n.x * 1.5 * s;
    const blastZ = pos.z + n.z * 1.5 * s;
    const groundY = getTerrainHeight(blastX, blastZ);
    const clearance = pos.y + n.y * 1.5 * s - groundY;
    const blastReach = 3.4 * sv;
    if (clearance < blastReach && clearance > -0.5) {
      const strength = 1 - Math.max(0, clearance) / blastReach;
      const horiz = Math.hypot(n.x, n.z) || 1;
      const fx = n.x / horiz;
      const fz = n.z / horiz;
      const count = sc(Math.round(10 * strength) + 2);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        // Bias the ring forward along the line of fire.
        const rx = Math.cos(angle) + fx * 0.8;
        const rz = Math.sin(angle) + fz * 0.8;
        const rl = Math.hypot(rx, rz) || 1;
        const speed = (5 + Math.random() * 6) * sv * (0.5 + strength * 0.5);
        add(
          'muzzleSmoke',
          blastX - pos.x + (rx / rl) * 0.5 * s, groundY - pos.y + 0.35 * s, blastZ - pos.z + (rz / rl) * 0.5 * s,
          (rx / rl) * speed, 0.6 + Math.random() * 0.8, (rz / rl) * speed,
          (1.4 + Math.random() * 1.2) * s,
          i % 2 ? '#b8a582' : '#a39070',
          0.6 + Math.random() * 0.3,
          (Math.random() - 0.5) * 1.6,
        );
      }
    }
  } else if (type === 'burning_smoke') {
    // Wreck plume: dense dark puffs off the engine deck that rise, swell,
    // drift downwind and dilute toward grey. Scale is the current density.
    const puffs = Math.random() < s ? 2 : 1;
    for (let i = 0; i < puffs; i++) {
      add('plume',
        (Math.random() - 0.5) * 1.6, Math.random() * 0.4, (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 0.9, 3.0 + Math.random() * 1.6, (Math.random() - 0.5) * 0.9,
        (2.1 + Math.random() * 1.3) * (0.6 + 0.4 * s), i === 0 ? '#141210' : '#221f1c',
        0.8 + Math.random() * 0.2, (Math.random() - 0.5) * 0.4);
      const sub = subs[subs.length - 1];
      _tmpColor.set(Math.random() < 0.5 ? '#5d5953' : '#6f6a63');
      sub.r2 = _tmpColor.r; sub.g2 = _tmpColor.g; sub.b2 = _tmpColor.b;
    }
  } else if (type === 'wreck_fire') {
    // Flames licking out of hatches and the engine deck at the plume's base.
    for (let i = 0; i < 2; i++) {
      add('wreckFire',
        (Math.random() - 0.5) * 1.1, Math.random() * 0.3, (Math.random() - 0.5) * 1.1,
        (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 0.3,
        (1.1 + Math.random() * 0.9) * s, Math.random() < 0.35 ? '#ffc46a' : '#ff6a1c',
        0.55 + Math.random() * 0.45, (Math.random() - 0.5) * 3);
    }
  } else if (type === 'tree_hit') {
    add('flash', 0, 0, 0, 0, 0, 0, 2.0 * s, '#ffcc66', 0.15, 0);
    for (let i = 0; i < sc(10); i++) cone('debris', 2.0, (6 + Math.random() * 6) * sv, (0.15 + Math.random() * 0.2) * s, i < 5 ? '#8b6914' : '#5c3a1e', 0.8, 0);
    for (let i = 0; i < sc(4); i++) cone('smoke', 1.0, (1 + Math.random() * 2) * sv, (1.5 + Math.random()) * s, '#2d5a1e', 0.8, (Math.random() - 0.5) * 2);
  } else if (type === 'dust') {
    add('smoke', 0, 0, 0,
      (Math.random() - 0.5) * 2, Math.random() * 1.5 + 0.5, (Math.random() - 0.5) * 2,
      config.size, config.color, 1, (Math.random() - 0.5) * 2
    );
  } else if (type === 'track_mud') {
    // Normal is the throw direction off the sprocket (behind the track, tilted up).
    // Scale is track-speed intensity, so clod size only grows gently with it.
    const MUD = ['#3a2a18', '#4a3520', '#2e2114', '#55402a'];
    const clod = 0.7 + 0.3 * s;
    for (let i = 0; i < sc(5); i++) cone('debris', 0.55, (2.5 + Math.random() * 4) * sv, (0.06 + Math.random() * 0.09) * clod, MUD[i % MUD.length], 0.55 + Math.random() * 0.35, 0);
    for (let i = 0; i < sc(2); i++) cone('dirt', 0.9, (0.8 + Math.random() * 1.4) * sv, (0.7 + Math.random() * 0.6) * clod, i % 2 ? '#5a4630' : '#6b5538', 0.45 + Math.random() * 0.35, (Math.random() - 0.5) * 1.6);
    add('smoke', 0, 0.1, 0, (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6, (1.0 + Math.random() * 0.5) * clod, '#7a6446', 0.7 + Math.random() * 0.3, (Math.random() - 0.5) * 1.2);
  } else if (type === 'track_grass') {
    // Torn turf and root soil flicked off the track, with only a faint haze.
    const TURF = ['#343f1e', '#3d4822', '#2f2616', '#44381f'];
    const bit = 0.7 + 0.3 * s;
    for (let i = 0; i < sc(4); i++) cone('debris', 0.7, (2 + Math.random() * 3.5) * sv, (0.035 + Math.random() * 0.045) * bit, TURF[i % TURF.length], 0.5 + Math.random() * 0.3, 0);
    for (let i = 0; i < sc(2); i++) cone('dirt', 0.8, (0.8 + Math.random() * 1.2) * sv, (0.35 + Math.random() * 0.3) * bit, i % 2 ? '#4a4128' : '#5a5033', 0.4 + Math.random() * 0.3, (Math.random() - 0.5) * 1.6);
    if (Math.random() < 0.5 + 0.4 * Math.min(1, s)) {
      add('smoke', 0, 0.15, 0, (Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.35, (Math.random() - 0.5) * 0.5, (0.8 + Math.random() * 0.5) * bit, '#8c8a64', 0.55 + Math.random() * 0.25, (Math.random() - 0.5) * 1.2);
    }
  } else if (type === 'dust_low') {
    add('smoke', 0, 0, 0,
      (Math.random() - 0.5) * 1, Math.random() * 0.3 + 0.1, (Math.random() - 0.5) * 1,
      config.size, config.color, 1, (Math.random() - 0.5) * 1
    );
  }
}

// Transient point light plus persistent ground crater for each effect type.
function spawnSecondaryEffects(p: Particle) {
  const { type, position: pos, normal, scale: s = 1 } = p;
  const nx = normal?.x ?? 0;
  const ny = normal?.y ?? 1;
  const nz = normal?.z ?? 0;
  const sv = Math.sqrt(s);
  const light = (offset: number, color: string, intensity: number, range: number, duration: number, flicker = false) =>
    queueFlashLight({
      x: pos.x + nx * offset, y: pos.y + ny * offset, z: pos.z + nz * offset,
      color, intensity, range, duration, flicker,
    });

  switch (type) {
    case 'fire':
      light(1.0 * s, '#ffb866', 90 * Math.pow(s, 1.5), 18 * sv, 90);
      break;
    case 'hit_penetrate':
      light(0.6, '#ffd49a', 50 * s, 12 * sv, 110);
      break;
    case 'non_pen_impact':
    case 'ricochet_impact':
    case 'hit_bounce':
      light(0.6, '#ffc070', 35 * s, 10 * sv, 80);
      break;
    case 'he_hit_ground':
    case 'he_hit_penetrate':
      light(0.8, '#ffa050', 160 * s, 22 * sv, 220);
      break;
    case 'tank_explosion':
      light(1.5, '#ff9040', 900 * s, 45 * sv, 900, true);
      break;
    case 'hit_ground':
      light(0.5, '#ffc88a', 12 * s, 8 * sv, 60);
      break;
    default:
      break;
  }

  // Craters only on ground-facing surfaces; walls may later collapse or move.
  if (normal && ny > 0.6) {
    if (type === 'hit_ground') {
      queueImpactDecal(pos, normal, (2.4 + Math.random() * 0.6) * s, 'ap');
    } else if (type === 'he_hit_ground') {
      queueImpactDecal(pos, normal, (4.6 + Math.random() * 1.0) * s, 'he');
    }
  }
}

// --- Shared reusable objects ---
const _debrisMat = new THREE.Matrix4();
const _debrisPos = new THREE.Vector3();
const _debrisQuat = new THREE.Quaternion();
const _debrisScale = new THREE.Vector3();
const _debrisEuler = new THREE.Euler();
const _debrisBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const _viewForward = new THREE.Vector3();

export function Particles() {
  const removeParticle = useGameStore((state) => state.removeParticle);

  // Pools (created once)
  const additivePool = useMemo(() => createPointPool(MAX_ADDITIVE, dustTexture, THREE.AdditiveBlending), []);
  const muzzleAdditivePool = useMemo(
    () => createPointPool(MAX_MUZZLE_ADDITIVE, flashTexture, THREE.AdditiveBlending),
    []
  );
  // Billowing flame (fireballs, muzzle fire, burning wrecks) uses the lumpy atlas.
  const firePool = useMemo(
    () => createPointPool(MAX_FIRE, smokeAtlas, THREE.AdditiveBlending, { atlas: true }),
    []
  );
  const impactAdditivePool = useMemo(
    () => createPointPool(MAX_IMPACT_ADDITIVE, dustTexture, THREE.AdditiveBlending),
    []
  );
  const shockwavePool = useMemo(
    () => createPointPool(MAX_SHOCKWAVE, ringTexture, THREE.AdditiveBlending),
    []
  );
  const sparkPool = useMemo(() => createPointPool(MAX_SPARK, sparkTexture, THREE.AdditiveBlending), []);
  const impactSparkPool = useMemo(
    () => createPointPool(MAX_IMPACT_SPARK, sparkTexture, THREE.AdditiveBlending),
    []
  );
  const smokePool = useMemo(
    () => createPointPool(MAX_SMOKE, smokeAtlas, THREE.NormalBlending, { atlas: true, lit: true }),
    []
  );
  const muzzleSmokePool = useMemo(
    () => createPointPool(MAX_MUZZLE_SMOKE, smokeAtlas, THREE.NormalBlending, { atlas: true, lit: true }),
    []
  );

  // Debris InstancedMesh setup
  const debrisRef = useRef<THREE.InstancedMesh>(null);
  const debrisAttrs = useMemo(() => {
    const colors = new Float32Array(MAX_DEBRIS * 3);
    const opacities = new Float32Array(MAX_DEBRIS);
    return { colors, opacities };
  }, []);

  // State refs
  const subsRef = useRef<SubState[]>([]);
  const processedRef = useRef<Set<string>>(new Set());
  const pendingRemoveRef = useRef<Map<string, number>>(new Map()); // particleId -> removeAt timestamp
  const smokeStageRef = useRef({
    index: new Uint16Array(MAX_SMOKE),
    depth: new Float32Array(MAX_SMOKE),
    size: new Float32Array(MAX_SMOKE),
    opacity: new Float32Array(MAX_SMOKE),
    color: new Float32Array(MAX_SMOKE * 3),
    subs: new Array<SubState | undefined>(MAX_SMOKE),
  });

  useFrame(({ camera, scene }, delta) => {
    const state = useGameStore.getState();
    const now = Date.now();
    const subs = subsRef.current;

    // Sun direction in view space and scene fog, shared by every sprite pool.
    spriteUniforms.uSunView.value.copy(SUN_DIRECTION).transformDirection(camera.matrixWorldInverse);
    if (scene.fog instanceof THREE.Fog) {
      spriteUniforms.uFogColor.value.copy(scene.fog.color);
      spriteUniforms.uFogNear.value = scene.fog.near;
      spriteUniforms.uFogFar.value = scene.fog.far;
    }
    camera.getWorldDirection(_viewForward);
    const processed = processedRef.current;
    const pendingRemove = pendingRemoveRef.current;

    // 1. Spawn sub-particles for new effects
    for (const p of state.particles) {
      if (!processed.has(p.id)) {
        processed.add(p.id);
        spawnSubParticles(p, subs);
        spawnSecondaryEffects(p);
        // Schedule store removal based on config lifetime
        const cfg = getConfig(p.type);
        pendingRemove.set(p.id, now + cfg.lifetime + 100); // small buffer
      }
    }

    // 2. Remove expired particles from store
    for (const [id, removeAt] of pendingRemove) {
      if (now >= removeAt) {
        removeParticle(id);
        pendingRemove.delete(id);
      }
    }

    // 3. Clean up processed IDs for particles already gone from store
    const activeIds = state.particles;
    if (processed.size > activeIds.length + pendingRemove.size + 50) {
      const storeIds = new Set(activeIds.map(p => p.id));
      for (const id of processed) {
        if (!storeIds.has(id) && !pendingRemove.has(id)) processed.delete(id);
      }
    }

    // 4. Update physics and populate buffers
    let addIdx = 0;
    let muzzleAddIdx = 0;
    let impactAddIdx = 0;
    let fireIdx = 0;
    let shockIdx = 0;
    let spkIdx = 0;
    let impactSpkIdx = 0;
    let smkCount = 0;
    let muzzleSmkIdx = 0;
    let debIdx = 0;
    const stage = smokeStageRef.current;

    let i = subs.length;
    while (i-- > 0) {
      const sub = subs[i];
      const age = now - sub.createdAt;
      const progress = Math.min(age / (sub.lifetime * sub.lifeMultiplier), 1);

      if (progress >= 1) {
        // Remove by swap with last
        subs[i] = subs[subs.length - 1];
        subs.pop();
        continue;
      }

      // Physics
      if (sub.type === 'debris' || sub.type === 'spark' || sub.type === 'impactSpark') {
        sub.vy -= 25 * delta;
      } else if (sub.type === 'plume') {
        // Buoyancy fades as the puff cools; the wind takes over.
        const drag = 1 - 0.35 * delta;
        sub.vx = sub.vx * drag + WIND.x * 0.35 * delta;
        sub.vz = sub.vz * drag + WIND.z * 0.35 * delta;
        sub.vy = sub.vy * drag + (1 - progress) * 0.6 * delta;
      } else if (sub.type === 'wreckFire') {
        sub.vy += 1.8 * delta;
      } else if (
        sub.type === 'smoke' ||
        sub.type === 'fireball' ||
        sub.type === 'muzzleSmoke' ||
        sub.type === 'muzzleFireball'
      ) {
        const drag = 1 - 2 * delta;
        sub.vx *= drag;
        sub.vy *= drag;
        sub.vz *= drag;
        sub.vy += 1.5 * delta;
      } else if (sub.type === 'dirt') {
        // Thrown earth: heavier than smoke, so the column slows, spreads and sags back.
        const drag = 1 - 1.4 * delta;
        sub.vx *= drag;
        sub.vy *= drag;
        sub.vz *= drag;
        sub.vy -= 7 * delta;
      }

      sub.px += sub.vx * delta;
      sub.py += sub.vy * delta;
      sub.pz += sub.vz * delta;
      sub.rotation += sub.rotSpeed * delta;

      // Populate appropriate buffer
      if (sub.type === 'flash') {
        if (addIdx < MAX_ADDITIVE) writeSprite(additivePool, addIdx++, sub, sub.baseScale * (1 + progress * 1.5), 1 - Math.pow(progress, 0.5));
      } else if (sub.type === 'fireball') {
        if (fireIdx < MAX_FIRE) writeSprite(firePool, fireIdx++, sub, sub.baseScale * (1 + progress * 2), 1 - Math.pow(progress, 1.5));
      } else if (sub.type === 'muzzleFireball') {
        if (fireIdx < MAX_FIRE) writeSprite(firePool, fireIdx++, sub, sub.baseScale * (1 + progress * 2.2), 1 - Math.pow(progress, 1.3));
      } else if (sub.type === 'wreckFire') {
        if (fireIdx < MAX_FIRE) {
          // Tongues shrink as they rise and flicker; cooler colour at the tips.
          const flicker = 0.75 + 0.25 * Math.sin(age * 0.045 + sub.variant * 1.7);
          const cool = 1 - progress * 0.6;
          writeSprite(firePool, fireIdx++, sub, sub.baseScale * (1.1 - progress * 0.5),
            Math.min(1, progress * 8) * (1 - progress) * flicker, sub.r * 2.2, sub.g * cool * 2.2, sub.b * cool * cool * 2.2);
        }
      } else if (sub.type === 'muzzleFlash') {
        if (muzzleAddIdx < MAX_MUZZLE_ADDITIVE) writeSprite(muzzleAdditivePool, muzzleAddIdx++, sub, sub.baseScale * (1 + progress * 1.8), 1 - Math.pow(progress, 0.45));
      } else if (sub.type === 'impactFlash') {
        if (impactAddIdx < MAX_IMPACT_ADDITIVE) writeSprite(impactAdditivePool, impactAddIdx++, sub, sub.baseScale * (1 + progress * 1.4), 1 - Math.pow(progress, 0.42));
      } else if (sub.type === 'ember') {
        if (impactAddIdx < MAX_IMPACT_ADDITIVE) {
          // Hot metal cools: green and blue drop out first, leaving a dull red glow.
          const cool = 1 - progress;
          const savedRotation = sub.rotation;
          sub.rotation = 0;
          writeSprite(impactAdditivePool, impactAddIdx++, sub, sub.baseScale * (1 - progress * 0.45),
            Math.pow(cool, 1.4) * (0.85 + 0.15 * Math.sin(age * 0.04)), sub.r, sub.g * cool, sub.b * cool * cool);
          sub.rotation = savedRotation;
        }
      } else if (sub.type === 'shockwave') {
        if (shockIdx < MAX_SHOCKWAVE) writeSprite(shockwavePool, shockIdx++, sub, sub.baseScale * (1 + progress * 4.5), Math.max(0, 1 - Math.pow(progress, 0.9) * 1.02) * 0.98);
      } else if (sub.type === 'spark') {
        if (spkIdx < MAX_SPARK) writeSprite(sparkPool, spkIdx++, sub, sub.baseScale, 1 - Math.pow(progress, 2));
      } else if (sub.type === 'impactSpark') {
        if (impactSpkIdx < MAX_IMPACT_SPARK) writeSprite(impactSparkPool, impactSpkIdx++, sub, sub.baseScale * (1 + progress * 0.25), 1 - Math.pow(progress, 1.8));
      } else if (sub.type === 'smoke' || sub.type === 'dirt' || sub.type === 'plume') {
        if (smkCount < MAX_SMOKE) {
          let size: number;
          let opacity: number;
          let r = sub.r, g = sub.g, b = sub.b;
          if (sub.type === 'smoke') {
            size = sub.baseScale * (1 + progress * 2);
            opacity = (1 - Math.pow(progress, 1.5)) * 0.6;
          } else if (sub.type === 'dirt') {
            size = sub.baseScale * (1 + progress * 1.6);
            // Thrown earth is opaque; thin dark puffs over the sky otherwise read blue.
            opacity = (1 - Math.pow(progress, 1.3)) * 0.98;
          } else {
            // Swell from a tight dark knot into a broad grey drift.
            size = sub.baseScale * (1 + progress * 4);
            opacity = Math.min(1, progress * 6) * Math.pow(1 - progress, 1.1) * 0.72;
            const dilute = Math.min(1, progress * 1.6);
            r += (sub.r2 - r) * dilute; g += (sub.g2 - g) * dilute; b += (sub.b2 - b) * dilute;
          }
          stage.index[smkCount] = smkCount;
          stage.depth[smkCount] = (sub.px - camera.position.x) * _viewForward.x
            + (sub.py - camera.position.y) * _viewForward.y + (sub.pz - camera.position.z) * _viewForward.z;
          stage.subs[smkCount] = sub;
          stage.size[smkCount] = size;
          stage.opacity[smkCount] = opacity;
          stage.color[smkCount * 3] = r;
          stage.color[smkCount * 3 + 1] = g;
          stage.color[smkCount * 3 + 2] = b;
          smkCount++;
        }
      } else if (sub.type === 'muzzleSmoke') {
        if (muzzleSmkIdx < MAX_MUZZLE_SMOKE) writeSprite(muzzleSmokePool, muzzleSmkIdx++, sub, sub.baseScale * (1 + progress * 2.3), (1 - Math.pow(progress, 1.25)) * 0.75);
      } else if (sub.type === 'debris') {
        if (debIdx < MAX_DEBRIS && debrisRef.current) {
          const opacity = 1 - progress;
          // Accumulate rotation from velocity
          _debrisEuler.set(sub.vy * progress * 3, sub.vx * progress * 3, 0);
          _debrisQuat.setFromEuler(_debrisEuler);
          _debrisPos.set(sub.px, sub.py, sub.pz);
          // Flattened chips read as clods and turf rather than cubes.
          _debrisScale.set(sub.baseScale, sub.baseScale * 0.45, sub.baseScale * 0.8);
          _debrisMat.compose(_debrisPos, _debrisQuat, _debrisScale);
          debrisRef.current.setMatrixAt(debIdx, _debrisMat);

          debrisAttrs.colors[debIdx * 3] = sub.r;
          debrisAttrs.colors[debIdx * 3 + 1] = sub.g;
          debrisAttrs.colors[debIdx * 3 + 2] = sub.b;
          debrisAttrs.opacities[debIdx] = opacity;
          debIdx++;
        }
      }
    }

    // Alpha-blended smoke must be drawn back to front, or dark puffs pop over light ones.
    const order = stage.index.subarray(0, smkCount).sort((a, b) => stage.depth[b] - stage.depth[a]);
    for (let k = 0; k < smkCount; k++) {
      const j = order[k];
      writeSprite(smokePool, k, stage.subs[j]!, stage.size[j], stage.opacity[j],
        stage.color[j * 3], stage.color[j * 3 + 1], stage.color[j * 3 + 2]);
    }

    flagPool(additivePool, addIdx);
    flagPool(muzzleAdditivePool, muzzleAddIdx);
    flagPool(impactAdditivePool, impactAddIdx);
    flagPool(firePool, fireIdx);
    flagPool(shockwavePool, shockIdx);
    flagPool(sparkPool, spkIdx);
    flagPool(impactSparkPool, impactSpkIdx);
    flagPool(smokePool, smkCount);
    flagPool(muzzleSmokePool, muzzleSmkIdx);

    // Update debris instanced mesh
    if (debrisRef.current) {
      debrisRef.current.count = debIdx;
      if (debIdx > 0) {
        debrisRef.current.instanceMatrix.needsUpdate = true;
        const colorAttr = debrisRef.current.geometry.getAttribute('aColor') as THREE.InstancedBufferAttribute;
        const opacityAttr = debrisRef.current.geometry.getAttribute('aOpacity') as THREE.InstancedBufferAttribute;
        if (colorAttr) {
          colorAttr.needsUpdate = true;
          opacityAttr.needsUpdate = true;
        }
      }
    }
  });

  // Debris material
  const debrisMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: debrisVertexShader,
    fragmentShader: debrisFragmentShader,
    transparent: true,
    depthWrite: false,
  }), []);

  // Attach instanced buffer attributes to debris geometry
  const debrisGeo = useMemo(() => {
    const geo = _debrisBoxGeo.clone();
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(debrisAttrs.colors, 3));
    geo.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(debrisAttrs.opacities, 1));
    return geo;
  }, [debrisAttrs]);

  return (
    <group>
      {/* Additive flash sprites */}
      <points geometry={additivePool.geometry} material={additivePool.material} frustumCulled={false} />
      {/* Billowing flame: fireballs, muzzle fire and burning wrecks */}
      <points geometry={firePool.geometry} material={firePool.material} frustumCulled={false} renderOrder={6} />
      {/* Muzzle flash sprites ignore barrel depth */}
      <points geometry={muzzleAdditivePool.geometry} material={muzzleAdditivePool.material} frustumCulled={false} renderOrder={20} />
      {/* Impact flashes temporarily ignore depth for visibility tuning */}
      <points geometry={impactAdditivePool.geometry} material={impactAdditivePool.material} frustumCulled={false} renderOrder={21} />
      {/* Expanding muzzle shockwave rings */}
      <points geometry={shockwavePool.geometry} material={shockwavePool.material} frustumCulled={false} renderOrder={19} />
      {/* Spark sprites */}
      <points geometry={sparkPool.geometry} material={sparkPool.material} frustumCulled={false} />
      {/* Impact sparks temporarily ignore depth for visibility tuning */}
      <points geometry={impactSparkPool.geometry} material={impactSparkPool.material} frustumCulled={false} renderOrder={21} />
      {/* Smoke sprites (normal blending) */}
      <points geometry={smokePool.geometry} material={smokePool.material} frustumCulled={false} />
      {/* Muzzle smoke ignores barrel depth */}
      <points geometry={muzzleSmokePool.geometry} material={muzzleSmokePool.material} frustumCulled={false} renderOrder={18} />
      {/* Debris boxes */}
      <instancedMesh
        ref={debrisRef}
        args={[debrisGeo, debrisMaterial, MAX_DEBRIS]}
        frustumCulled={false}
      />
    </group>
  );
}
