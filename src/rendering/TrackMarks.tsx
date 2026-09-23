import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';
import type { TankData } from '../store';
import { GAME_CONFIG } from '../config';
import { getTankDef } from '../tanks/registry';
import { getTerrainHeight } from '../Terrain';
import { sampleGroundSurface } from '../groundSurface';

/**
 * Tank specs only carry the track gauge (centre-to-centre), so the belt width and
 * ground-contact length are estimated from it. Close for the Sherman, Panzer and Tiger families.
 */
export function estimateTrackFootprint(gauge: number) {
  return {
    gauge,
    halfContact: gauge * 0.75,
    beltWidth: THREE.MathUtils.clamp(gauge * 0.17, 0.28, 0.72),
  };
}

// Surface response: crushed turf darkens slightly, mud takes deep ruts, gravel barely marks.
const SURFACE_TINT = {
  grass: { r: 0.88, g: 0.82, b: 0.66, strength: 0.8 },
  mud: { r: 0.82, g: 0.7, b: 0.58, strength: 0.92 },
  road: { r: 1.1, g: 1.05, b: 1.0, strength: 0.28 },
};

const OVERLAP = 0.03;
const TELEPORT_DISTANCE = 4;
const NORMAL_SAMPLE = 0.6;
const TIME_BASE = Date.now();

// Tread print: soft ragged edges across the belt, grouser bars along it.
// RGB is a linear multiply factor for the ground, not an sRGB colour.
function createTreadTexture() {
  const w = 64;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(w, h);
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const edgeJitter = Array.from({ length: h }, () => rand() * 0.06);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    // Four grousers per tile; the tile repeats every segment so bars stay continuous.
    const bar = (v * 4) % 1 < 0.38 ? 1 : 0;
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const edge = Math.min(u, 1 - u) - edgeJitter[y];
      const alpha = THREE.MathUtils.smoothstep(edge, 0.0, 0.16);
      const value = 0.66 - bar * 0.18 - rand() * 0.06;
      const i = (y * w + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(value * 255);
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const markVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uNow;
uniform float uLifetime;
uniform float uFadeTime;
attribute vec3 aTint;
attribute float aBirth;
attribute float aStrength;
varying vec2 vUv;
varying vec3 vTint;
varying float vOpacity;

void main() {
  vUv = uv;
  vTint = aTint;
  float remaining = uLifetime - (uNow - aBirth);
  vOpacity = aStrength * clamp(remaining / uFadeTime, 0.0, 1.0);
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// Premultiplied multiply blend, same approach as the impact craters.
const markFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vTint;
varying float vOpacity;

void main() {
  if (vOpacity < 0.003) discard;
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vOpacity;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    a *= 1.0 - fogFactor;
  #endif
  if (a < 0.003) discard;
  gl_FragColor = vec4(min(tex.rgb * vTint, vec3(1.0)) * a, a);
}
`;

interface TrackCursor {
  lx: number; lz: number;
  rx: number; rz: number;
}

const _mat = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

export function TrackMarks() {
  const cfg = GAME_CONFIG.trackMarks;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cursor = useRef(0);
  const tracks = useRef(new Map<string, TrackCursor>());

  const { geometry, material, tint, birth, strength } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const tintAttr = new THREE.InstancedBufferAttribute(new Float32Array(cfg.maxCount * 3), 3);
    const birthAttr = new THREE.InstancedBufferAttribute(new Float32Array(cfg.maxCount).fill(-1e6), 1);
    const strengthAttr = new THREE.InstancedBufferAttribute(new Float32Array(cfg.maxCount), 1);
    geo.setAttribute('aTint', tintAttr);
    geo.setAttribute('aBirth', birthAttr);
    geo.setAttribute('aStrength', strengthAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uMap: { value: null },
          uNow: { value: 0 },
          uLifetime: { value: cfg.lifetime / 1000 },
          uFadeTime: { value: cfg.fadeTime / 1000 },
        },
      ]),
      vertexShader: markVertexShader,
      fragmentShader: markFragmentShader,
      fog: true,
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.MultiplyBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    mat.uniforms.uMap.value = createTreadTexture();
    return { geometry: geo, material: mat, tint: tintAttr, birth: birthAttr, strength: strengthAttr };
  }, [cfg.fadeTime, cfg.lifetime, cfg.maxCount]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) {
      for (let i = 0; i < cfg.maxCount; i++) mesh.setMatrixAt(i, _hidden);
      mesh.instanceMatrix.needsUpdate = true;
    }
    const trackState = tracks.current;
    return () => {
      trackState.clear();
      (material.uniforms.uMap.value as THREE.Texture | null)?.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [cfg.maxCount, geometry, material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const now = Date.now();
    material.uniforms.uNow.value = (now - TIME_BASE) / 1000;

    const state = useGameStore.getState();
    const { roadNetwork, farmlands, buildings, yards } = state;
    const seen = new Set<string>();
    let first = -1;
    let count = 0;

    const emit = (ax: number, az: number, bx: number, bz: number, beltWidth: number) => {
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      const my = getTerrainHeight(mx, mz);
      const e = NORMAL_SAMPLE;
      _z.set(
        getTerrainHeight(mx - e, mz) - getTerrainHeight(mx + e, mz),
        2 * e,
        getTerrainHeight(mx, mz - e) - getTerrainHeight(mx, mz + e),
      ).normalize();
      // Along-track axis follows the travel direction, projected onto the local slope.
      _y.set(bx - ax, 0, bz - az);
      const length = _y.length();
      _y.addScaledVector(_z, -_y.dot(_z)).normalize();
      _x.crossVectors(_y, _z).normalize();
      _mat.makeBasis(_x.multiplyScalar(beltWidth), _y.multiplyScalar(length + OVERLAP), _z);
      _mat.setPosition(mx + _z.x * 0.035, my + _z.y * 0.035, mz + _z.z * 0.035);

      const index = cursor.current;
      cursor.current = (cursor.current + 1) % cfg.maxCount;
      mesh.setMatrixAt(index, _mat);

      const surface = sampleGroundSurface(mx, mz, roadNetwork, farmlands, buildings, yards);
      const g = SURFACE_TINT.grass;
      const m = SURFACE_TINT.mud;
      const r = SURFACE_TINT.road;
      tint.setXYZ(
        index,
        g.r * surface.grass + m.r * surface.mud + r.r * surface.road,
        g.g * surface.grass + m.g * surface.mud + r.g * surface.road,
        g.b * surface.grass + m.b * surface.mud + r.b * surface.road,
      );
      strength.setX(index, g.strength * surface.grass + m.strength * surface.mud + r.strength * surface.road);
      birth.setX(index, (now - TIME_BASE) / 1000);

      if (first < 0) first = index;
      count++;
    };

    const visit = (tank: TankData) => {
      if (tank.destroyed) return;
      seen.add(tank.id);
      const { gauge, beltWidth } = estimateTrackFootprint(getTankDef(tank.tankType).trackWidth);
      const fx = Math.sin(tank.rotation);
      const fz = Math.cos(tank.rotation);
      const half = gauge / 2;
      const lx = tank.position.x - fz * half;
      const lz = tank.position.z + fx * half;
      const rx = tank.position.x + fz * half;
      const rz = tank.position.z - fx * half;

      const prev = tracks.current.get(tank.id);
      if (!prev) {
        tracks.current.set(tank.id, { lx, lz, rx, rz });
        return;
      }
      const dl = Math.hypot(lx - prev.lx, lz - prev.lz);
      const dr = Math.hypot(rx - prev.rx, rz - prev.rz);
      if (dl > TELEPORT_DISTANCE || dr > TELEPORT_DISTANCE) {
        prev.lx = lx; prev.lz = lz; prev.rx = rx; prev.rz = rz;
        return;
      }
      if (dl >= cfg.segmentLength) {
        emit(prev.lx, prev.lz, lx, lz, beltWidth);
        prev.lx = lx; prev.lz = lz;
      }
      if (dr >= cfg.segmentLength) {
        emit(prev.rx, prev.rz, rx, rz, beltWidth);
        prev.rx = rx; prev.rz = rz;
      }
    };

    visit(state.playerTank);
    for (const tank of state.enemies) visit(tank);
    for (const tank of state.allies) visit(tank);
    for (const id of tracks.current.keys()) {
      if (!seen.has(id)) tracks.current.delete(id);
    }

    if (count === 0) return;
    const attrs = [mesh.instanceMatrix, tint, birth, strength] as THREE.BufferAttribute[];
    const wrapped = first + count > cfg.maxCount;
    for (const attr of attrs) {
      attr.clearUpdateRanges();
      if (!wrapped) attr.addUpdateRange(first * attr.itemSize, count * attr.itemSize);
      attr.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, cfg.maxCount]}
      frustumCulled={false}
      renderOrder={1}
    />
  );
}
