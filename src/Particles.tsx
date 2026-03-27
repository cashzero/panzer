import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, Particle } from './store';
import * as THREE from 'three';
import { GAME_CONFIG } from './config';

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

// --- Pool sizes ---
const MAX_ADDITIVE = 384; // flash + fireball
const MAX_SPARK = 256;
const MAX_SMOKE = 256;
const MAX_DEBRIS = 384;

// --- Sub-particle state ---
interface SubState {
  particleId: string;
  type: 'flash' | 'smoke' | 'fireball' | 'debris' | 'spark';
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  baseScale: number;
  r: number; g: number; b: number;
  lifeMultiplier: number;
  rotSpeed: number;
  rotation: number;
  createdAt: number;
  lifetime: number;
}

// --- Shaders for Points ---
const spriteVertexShader = /* glsl */ `
attribute float aSize;
attribute float aOpacity;
attribute float aRotation;
attribute vec3 aColor;
varying float vOpacity;
varying float vRotation;
varying vec3 vColor;

void main() {
  vOpacity = aOpacity;
  vRotation = aRotation;
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mvPosition.z);
  gl_PointSize = clamp(gl_PointSize, 0.0, 512.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const spriteFragmentShader = /* glsl */ `
uniform sampler2D uMap;
varying float vOpacity;
varying float vRotation;
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRotation);
  float s = sin(vRotation);
  uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  vec4 tex = texture2D(uMap, uv);
  if (tex.a * vOpacity < 0.001) discard;
  gl_FragColor = vec4(vColor * tex.rgb, tex.a * vOpacity);
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
function createPointPool(maxCount: number, texture: THREE.Texture, blending: THREE.Blending) {
  const positions = new Float32Array(maxCount * 3);
  const sizes = new Float32Array(maxCount);
  const opacities = new Float32Array(maxCount);
  const rotations = new Float32Array(maxCount);
  const colors = new Float32Array(maxCount * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aOpacity', new THREE.Float32BufferAttribute(opacities, 1));
  geometry.setAttribute('aRotation', new THREE.Float32BufferAttribute(rotations, 1));
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: texture } },
    vertexShader: spriteVertexShader,
    fragmentShader: spriteFragmentShader,
    transparent: true,
    depthWrite: false,
    blending,
  });

  return { geometry, material, positions, sizes, opacities, rotations, colors };
}

// --- Particle spawning logic ---
const _tmpColor = new THREE.Color();

function getConfig(type: Particle['type']) {
  switch (type) {
    case 'fire': return GAME_CONFIG.particles.fire;
    case 'hit_penetrate': return GAME_CONFIG.particles.hit_penetrate;
    case 'hit_bounce': return GAME_CONFIG.particles.hit_bounce;
    case 'hit_ground': return GAME_CONFIG.particles.hit_ground;
    case 'he_hit_ground': return GAME_CONFIG.particles.he_hit_ground;
    case 'he_hit_penetrate': return GAME_CONFIG.particles.he_hit_penetrate;
    case 'tank_explosion': return GAME_CONFIG.particles.tank_explosion;
    case 'dust': return GAME_CONFIG.particles.dust;
    case 'dust_low': return GAME_CONFIG.particles.dust_low;
    case 'burning_smoke': return GAME_CONFIG.particles.burning_smoke;
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
    lifeMultiplier: life,
    rotSpeed,
    rotation: 0,
    createdAt,
    lifetime,
  });
}

function spawnSubParticles(p: Particle, subs: SubState[]) {
  const { type, position: pos, normal, scale: effectScale = 1, createdAt } = p;
  const config = getConfig(type);
  const lifetime = config.lifetime;
  const s = effectScale;
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

  const add = (type: SubState['type'], ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, scale: number, color: string, life: number, rot: number) =>
    pushSub(subs, p.id, type, pos, ox, oy, oz, vx, vy, vz, scale, color, life, rot, createdAt, lifetime);

  const cone = (type: SubState['type'], spread: number, speed: number, scale: number, color: string, life: number, rot: number) => {
    const v = randomConeVector(spread).multiplyScalar(speed);
    add(type, 0, 0, 0, v.x, v.y, v.z, scale, color, life, rot);
  };

  if (type === 'hit_ground') {
    add('flash', 0, 0, 0, 0, 0, 0, 3.5 * s, '#ffaa00', 0.15, 0);
    for (let i = 0; i < sc(6); i++) cone('smoke', 1.2, (2 + Math.random() * 3) * sv, (2.0 + Math.random() * 2) * s, '#6b5428', 1, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(15); i++) cone('debris', 1.5, (8 + Math.random() * 8) * sv, (0.15 + Math.random() * 0.2) * s, '#3d2e15', 0.8, 0);
  } else if (type === 'hit_penetrate') {
    add('flash', 0, 0, 0, 0, 0, 0, 3.0 * s, '#ffffff', 0.15, 0);
    for (let i = 0; i < sc(25); i++) cone('spark', 1.5, (12 + Math.random() * 12) * sv, 0.5 * s, '#ffdd44', 0.4 + Math.random() * 0.4, 0);
    for (let i = 0; i < sc(5); i++) cone('smoke', 0.8, (1 + Math.random() * 2) * sv, (1.5 + Math.random() * 1.5) * s, '#444444', 1, (Math.random() - 0.5) * 2);
  } else if (type === 'hit_bounce') {
    add('flash', 0, 0, 0, 0, 0, 0, 1.5 * s, '#ffcc00', 0.15, 0);
    for (let i = 0; i < sc(15); i++) cone('spark', 2.0, (10 + Math.random() * 10) * sv, 0.4 * s, '#ffaa00', 0.3 + Math.random() * 0.3, 0);
  } else if (type === 'he_hit_ground') {
    add('flash', 0, 0, 0, 0, 0, 0, 5.0 * s, '#ffffff', 0.15, 0);
    for (let i = 0; i < sc(4); i++) cone('fireball', 1.5, (2 + Math.random() * 3) * sv, (3.0 + Math.random() * 2) * s, '#ff5500', 0.5, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(8); i++) cone('smoke', 1.5, (2 + Math.random() * 2) * sv, (2.5 + Math.random() * 2.5) * s, '#5a4020', 1, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(20); i++) cone('debris', 2.0, (10 + Math.random() * 8) * sv, (0.2 + Math.random() * 0.25) * s, '#3d2e15', 0.8, 0);
  } else if (type === 'he_hit_penetrate') {
    add('flash', 0, 0, 0, 0, 0, 0, 5.0 * s, '#ffffff', 0.15, 0);
    for (let i = 0; i < sc(3); i++) cone('fireball', 1.2, (2 + Math.random() * 2) * sv, (2.5 + Math.random() * 2) * s, '#ff4400', 0.5, (Math.random() - 0.5) * 2);
    for (let i = 0; i < sc(15); i++) cone('spark', 1.5, (12 + Math.random() * 12) * sv, 0.5 * s, '#ffdd44', 0.4 + Math.random() * 0.4, 0);
    for (let i = 0; i < sc(8); i++) cone('smoke', 1.0, (1 + Math.random() * 2) * sv, (2.0 + Math.random() * 2) * s, '#333333', 1, (Math.random() - 0.5) * 2);
  } else if (type === 'tank_explosion') {
    add('flash', 0, 0, 0, 0, 0, 0, 8.0, '#ffffff', 0.2, 0);
    for (let i = 0; i < 8; i++) cone('fireball', 2, 3 + Math.random() * 5, 4.5 + Math.random() * 4, '#ff5500', 0.5, (Math.random() - 0.5) * 2);
    for (let i = 0; i < 15; i++) cone('smoke', 2, 5 + Math.random() * 6, 5.0 + Math.random() * 5, '#222222', 1, (Math.random() - 0.5) * 2);
    for (let i = 0; i < 25; i++) cone('debris', 2.5, 15 + Math.random() * 20, 0.3 + Math.random() * 0.5, '#111111', 0.9, 0);
  } else if (type === 'fire') {
    const nv = n.clone().multiplyScalar(4 * sv);
    add('flash', 0, 0, 0, 0, 0, 0, 3.0 * s, '#ffaa00', 0.2, 0);
    add('smoke', 0, 0, 0, nv.x, nv.y, nv.z, 2.0 * s, '#888888', 1, (Math.random() - 0.5) * 2);
  } else if (type === 'burning_smoke') {
    for (let i = 0; i < 3; i++) {
      add('smoke',
        (Math.random() - 0.5) * 1.5, Math.random() * 0.5, (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 0.8, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.8,
        config.size * (0.7 + Math.random() * 0.6), config.color, 1,
        (Math.random() - 0.5) * 1.5
      );
    }
    if (Math.random() < 0.4) {
      add('fireball',
        (Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8,
        0, 1 + Math.random(), 0,
        1.5 + Math.random(), '#ff3300', 0.4,
        (Math.random() - 0.5) * 2
      );
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
  } else if (type === 'dust_low') {
    add('smoke', 0, 0, 0,
      (Math.random() - 0.5) * 1, Math.random() * 0.3 + 0.1, (Math.random() - 0.5) * 1,
      config.size, config.color, 1, (Math.random() - 0.5) * 1
    );
  }
}

// --- Shared reusable objects ---
const _debrisMat = new THREE.Matrix4();
const _debrisPos = new THREE.Vector3();
const _debrisQuat = new THREE.Quaternion();
const _debrisScale = new THREE.Vector3();
const _debrisEuler = new THREE.Euler();
const _debrisBoxGeo = new THREE.BoxGeometry(1, 1, 1);

export function Particles() {
  const removeParticle = useGameStore((state) => state.removeParticle);

  // Pools (created once)
  const additivePool = useMemo(() => createPointPool(MAX_ADDITIVE, dustTexture, THREE.AdditiveBlending), []);
  const sparkPool = useMemo(() => createPointPool(MAX_SPARK, sparkTexture, THREE.AdditiveBlending), []);
  const smokePool = useMemo(() => createPointPool(MAX_SMOKE, dustTexture, THREE.NormalBlending), []);

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

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    const now = Date.now();
    const subs = subsRef.current;
    const processed = processedRef.current;
    const pendingRemove = pendingRemoveRef.current;

    // 1. Spawn sub-particles for new effects
    for (const p of state.particles) {
      if (!processed.has(p.id)) {
        processed.add(p.id);
        spawnSubParticles(p, subs);
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
    let spkIdx = 0;
    let smkIdx = 0;
    let debIdx = 0;

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
      if (sub.type === 'debris' || sub.type === 'spark') {
        sub.vy -= 25 * delta;
      } else if (sub.type === 'smoke' || sub.type === 'fireball') {
        const drag = 1 - 2 * delta;
        sub.vx *= drag;
        sub.vy *= drag;
        sub.vz *= drag;
        sub.vy += 1.5 * delta;
      }

      sub.px += sub.vx * delta;
      sub.py += sub.vy * delta;
      sub.pz += sub.vz * delta;
      sub.rotation += sub.rotSpeed * delta;

      // Populate appropriate buffer
      if (sub.type === 'flash' || sub.type === 'fireball') {
        if (addIdx < MAX_ADDITIVE) {
          const pool = additivePool;
          const scale = sub.type === 'flash'
            ? sub.baseScale * (1 + progress * 1.5)
            : sub.baseScale * (1 + progress * 2);
          const opacity = sub.type === 'flash'
            ? 1 - Math.pow(progress, 0.5)
            : 1 - Math.pow(progress, 1.5);
          pool.positions[addIdx * 3] = sub.px;
          pool.positions[addIdx * 3 + 1] = sub.py;
          pool.positions[addIdx * 3 + 2] = sub.pz;
          pool.sizes[addIdx] = scale;
          pool.opacities[addIdx] = opacity;
          pool.rotations[addIdx] = sub.rotation;
          pool.colors[addIdx * 3] = sub.r;
          pool.colors[addIdx * 3 + 1] = sub.g;
          pool.colors[addIdx * 3 + 2] = sub.b;
          addIdx++;
        }
      } else if (sub.type === 'spark') {
        if (spkIdx < MAX_SPARK) {
          const pool = sparkPool;
          const opacity = 1 - Math.pow(progress, 2);
          pool.positions[spkIdx * 3] = sub.px;
          pool.positions[spkIdx * 3 + 1] = sub.py;
          pool.positions[spkIdx * 3 + 2] = sub.pz;
          pool.sizes[spkIdx] = sub.baseScale;
          pool.opacities[spkIdx] = opacity;
          pool.rotations[spkIdx] = 0;
          pool.colors[spkIdx * 3] = sub.r;
          pool.colors[spkIdx * 3 + 1] = sub.g;
          pool.colors[spkIdx * 3 + 2] = sub.b;
          spkIdx++;
        }
      } else if (sub.type === 'smoke') {
        if (smkIdx < MAX_SMOKE) {
          const pool = smokePool;
          const scale = sub.baseScale * (1 + progress * 2);
          const opacity = (1 - Math.pow(progress, 1.5)) * 0.6;
          pool.positions[smkIdx * 3] = sub.px;
          pool.positions[smkIdx * 3 + 1] = sub.py;
          pool.positions[smkIdx * 3 + 2] = sub.pz;
          pool.sizes[smkIdx] = scale;
          pool.opacities[smkIdx] = opacity;
          pool.rotations[smkIdx] = sub.rotation;
          pool.colors[smkIdx * 3] = sub.r;
          pool.colors[smkIdx * 3 + 1] = sub.g;
          pool.colors[smkIdx * 3 + 2] = sub.b;
          smkIdx++;
        }
      } else if (sub.type === 'debris') {
        if (debIdx < MAX_DEBRIS && debrisRef.current) {
          const opacity = 1 - progress;
          // Accumulate rotation from velocity
          _debrisEuler.set(sub.vy * progress * 3, sub.vx * progress * 3, 0);
          _debrisQuat.setFromEuler(_debrisEuler);
          _debrisPos.set(sub.px, sub.py, sub.pz);
          _debrisScale.setScalar(sub.baseScale);
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

    // Update additive pool
    additivePool.geometry.setDrawRange(0, addIdx);
    if (addIdx > 0) {
      (additivePool.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (additivePool.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      (additivePool.geometry.attributes.aOpacity as THREE.BufferAttribute).needsUpdate = true;
      (additivePool.geometry.attributes.aRotation as THREE.BufferAttribute).needsUpdate = true;
      (additivePool.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    }

    // Update spark pool
    sparkPool.geometry.setDrawRange(0, spkIdx);
    if (spkIdx > 0) {
      (sparkPool.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (sparkPool.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      (sparkPool.geometry.attributes.aOpacity as THREE.BufferAttribute).needsUpdate = true;
      (sparkPool.geometry.attributes.aRotation as THREE.BufferAttribute).needsUpdate = true;
      (sparkPool.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    }

    // Update smoke pool
    smokePool.geometry.setDrawRange(0, smkIdx);
    if (smkIdx > 0) {
      (smokePool.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (smokePool.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      (smokePool.geometry.attributes.aOpacity as THREE.BufferAttribute).needsUpdate = true;
      (smokePool.geometry.attributes.aRotation as THREE.BufferAttribute).needsUpdate = true;
      (smokePool.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    }

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
      {/* Additive sprites (flash + fireball) */}
      <points geometry={additivePool.geometry} material={additivePool.material} frustumCulled={false} />
      {/* Spark sprites */}
      <points geometry={sparkPool.geometry} material={sparkPool.material} frustumCulled={false} />
      {/* Smoke sprites (normal blending) */}
      <points geometry={smokePool.geometry} material={smokePool.material} frustumCulled={false} />
      {/* Debris boxes */}
      <instancedMesh
        ref={debrisRef}
        args={[debrisGeo, debrisMaterial, MAX_DEBRIS]}
        frustumCulled={false}
      />
    </group>
  );
}
