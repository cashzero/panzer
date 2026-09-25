import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GAME_CONFIG } from '../config';

export type ImpactDecalKind = 'ap' | 'he';

interface DecalRequest {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  size: number;
  kind: ImpactDecalKind;
}

interface DecalSlot {
  createdAt: number;
  lifetime: number;
}

const MAX_QUEUED = 32;
const queue: DecalRequest[] = [];

export function queueImpactDecal(position: THREE.Vector3, normal: THREE.Vector3, size: number, kind: ImpactDecalKind) {
  if (queue.length >= MAX_QUEUED) queue.shift();
  queue.push({ position: position.clone(), normal: normal.clone().normalize(), size, kind });
}

// Crater: dark scorched pit, ragged churned rim and radial ejecta streaks.
// RGB is a linear multiply factor applied to the ground, not an sRGB colour.
function createCraterTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  for (let i = 0; i < 46; i++) {
    const angle = rand() * Math.PI * 2;
    const inner = c * (0.2 + rand() * 0.15);
    const outer = c * (0.55 + rand() * 0.4);
    const grad = ctx.createLinearGradient(
      c + Math.cos(angle) * inner, c + Math.sin(angle) * inner,
      c + Math.cos(angle) * outer, c + Math.sin(angle) * outer,
    );
    grad.addColorStop(0, 'rgba(92, 74, 56, 0.6)');
    grad.addColorStop(1, 'rgba(92, 74, 56, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2 + rand() * 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(angle) * inner, c + Math.sin(angle) * inner);
    ctx.lineTo(c + Math.cos(angle) * outer, c + Math.sin(angle) * outer);
    ctx.stroke();
  }

  for (let i = 0; i < 70; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = c * (0.18 + rand() * 0.3);
    const r = c * (0.05 + rand() * 0.1);
    const x = c + Math.cos(angle) * dist;
    const y = c + Math.sin(angle) * dist;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(72, 58, 44, 0.7)');
    grad.addColorStop(1, 'rgba(72, 58, 44, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const pit = ctx.createRadialGradient(c, c, 0, c, c, c * 0.56);
  pit.addColorStop(0, 'rgba(38, 33, 28, 0.95)');
  pit.addColorStop(0.55, 'rgba(52, 44, 36, 0.85)');
  pit.addColorStop(1, 'rgba(70, 56, 42, 0)');
  ctx.fillStyle = pit;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

const decalVertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 aTint;
attribute float aOpacity;
varying vec2 vUv;
varying vec3 vTint;
varying float vOpacity;

void main() {
  vUv = uv;
  vTint = aTint;
  vOpacity = aOpacity;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// Premultiplied multiply blend: dst * mix(1, tint, alpha). Darkens the ground
// under any lighting, and fading alpha returns it to the untouched surface.
const decalFragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vTint;
varying float vOpacity;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vOpacity;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = aerialAmount(vFogPosition, fogNear, fogFar);
    #endif
    a *= 1.0 - fogFactor;
  #endif
  if (a < 0.003) discard;
  gl_FragColor = vec4(tex.rgb * vTint * a, a);
}
`;

const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0);

export function ImpactDecals() {
  const cfg = GAME_CONFIG.impactDecals;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cursor = useRef(0);

  const slots = useMemo<DecalSlot[]>(
    () => Array.from({ length: cfg.maxCount }, () => ({ createdAt: 0, lifetime: 0 })),
    [cfg.maxCount]
  );

  const { geometry, material, tint, opacity } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const tintAttr = new THREE.InstancedBufferAttribute(new Float32Array(cfg.maxCount * 3), 3);
    const opacityAttr = new THREE.InstancedBufferAttribute(new Float32Array(cfg.maxCount), 1);
    opacityAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTint', tintAttr);
    geo.setAttribute('aOpacity', opacityAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uMap: { value: null } },
      ]),
      vertexShader: decalVertexShader,
      fragmentShader: decalFragmentShader,
      fog: true,
      transparent: true,
      premultipliedAlpha: true,
      blending: THREE.MultiplyBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    mat.uniforms.uMap.value = createCraterTexture();
    return { geometry: geo, material: mat, tint: tintAttr, opacity: opacityAttr };
  }, [cfg.maxCount]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) {
      for (let i = 0; i < cfg.maxCount; i++) mesh.setMatrixAt(i, _hidden);
      mesh.instanceMatrix.needsUpdate = true;
    }
    return () => {
      queue.length = 0;
      (material.uniforms.uMap.value as THREE.Texture | null)?.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [cfg.maxCount, geometry, material]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const now = Date.now();
    let matricesDirty = false;

    while (queue.length > 0) {
      const request = queue.shift()!;
      const index = cursor.current;
      cursor.current = (cursor.current + 1) % cfg.maxCount;

      _quat.setFromUnitVectors(_zAxis, request.normal);
      _spin.setFromAxisAngle(_zAxis, Math.random() * Math.PI * 2);
      _quat.multiply(_spin);
      _pos.copy(request.position).addScaledVector(request.normal, 0.03);
      _scale.set(request.size, request.size, 1);
      _mat.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(index, _mat);
      matricesDirty = true;

      // Multiply tint: HE scorches the ground near black, AP leaves lighter churned earth.
      if (request.kind === 'he') tint.setXYZ(index, 0.8, 0.76, 0.72);
      else tint.setXYZ(index, 1.55, 1.42, 1.3);
      tint.needsUpdate = true;
      slots[index].createdAt = now;
      slots[index].lifetime = cfg.lifetime * (request.kind === 'he' ? 1 : 0.8);
    }

    let anyAlive = false;
    for (let i = 0; i < cfg.maxCount; i++) {
      const slot = slots[i];
      if (slot.lifetime <= 0) continue;
      const age = now - slot.createdAt;
      const remaining = slot.lifetime - age;
      if (remaining <= 0) {
        slot.lifetime = 0;
        opacity.setX(i, 0);
        mesh.setMatrixAt(i, _hidden);
        matricesDirty = true;
        anyAlive = true;
        continue;
      }
      anyAlive = true;
      opacity.setX(i, Math.min(1, remaining / cfg.fadeTime));
    }
    if (anyAlive) opacity.needsUpdate = true;
    if (matricesDirty) mesh.instanceMatrix.needsUpdate = true;
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
