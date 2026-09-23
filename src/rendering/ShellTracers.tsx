import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { GAME_CONFIG } from '../config';

const MAX_TRACERS = 160;

// Screen-space capsule between tail and head. Width never drops below a pixel
// minimum so shells stay traceable at long range and when flying away from the camera.
const tracerVertexShader = /* glsl */ `
uniform vec2 uResolution;
uniform float uMinPixelWidth;
attribute vec3 aHead;
attribute vec3 aTail;
attribute vec3 aColor;
attribute float aOpacity;
attribute float aWidth;
varying vec3 vColor;
varying float vOpacity;
// Multiplied by clip w and divided back in the fragment shader: screen-linear interpolation.
varying vec4 vShape;   // along px, across [-1,1], quad extent px, core radius px
varying float vLenPx;
varying float vW;

const float NEAR_CLIP = 0.1;
const float EXTENT = 3.0;

void main() {
  vec3 tailV = (modelViewMatrix * vec4(aTail, 1.0)).xyz;
  vec3 headV = (modelViewMatrix * vec4(aHead, 1.0)).xyz;

  if (tailV.z > -NEAR_CLIP && headV.z > -NEAR_CLIP) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (tailV.z > -NEAR_CLIP) tailV = mix(tailV, headV, (-NEAR_CLIP - tailV.z) / (headV.z - tailV.z));
  if (headV.z > -NEAR_CLIP) headV = mix(headV, tailV, (-NEAR_CLIP - headV.z) / (tailV.z - headV.z));

  vec4 tailC = projectionMatrix * vec4(tailV, 1.0);
  vec4 headC = projectionMatrix * vec4(headV, 1.0);
  vec2 halfRes = uResolution * 0.5;
  vec2 tailS = tailC.xy / tailC.w * halfRes;
  vec2 headS = headC.xy / headC.w * halfRes;

  vec2 axis = headS - tailS;
  float lenPx = length(axis);
  vec2 dir = lenPx > 1e-3 ? axis / lenPx : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);

  bool isHead = position.x > 0.5;
  vec4 endC = isHead ? headC : tailC;
  vec2 endS = isHead ? headS : tailS;
  float depth = isHead ? -headV.z : -tailV.z;

  float worldPerPixel = 2.0 * depth / (projectionMatrix[1][1] * uResolution.y);
  float radiusPx = max(aWidth * 0.5 / worldPerPixel, uMinPixelWidth * 0.5);
  float extentPx = radiusPx * EXTENT;

  float capSign = isHead ? 1.0 : -1.0;
  vec2 screen = endS + dir * capSign * extentPx + perp * position.y * extentPx;
  gl_Position = vec4(screen / halfRes * endC.w, endC.z, endC.w);

  float alongPx = isHead ? lenPx + extentPx : -extentPx;
  float w = endC.w;
  vShape = vec4(alongPx, position.y, extentPx, radiusPx) * w;
  vLenPx = lenPx * w;
  vW = w;
  vColor = aColor;
  vOpacity = aOpacity;
}
`;

const tracerFragmentShader = /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
varying float vOpacity;
varying vec4 vShape;
varying float vLenPx;
varying float vW;

void main() {
  vec4 shape = vShape / vW;
  float lenPx = vLenPx / vW;
  float alongPx = shape.x;
  float dAlong = alongPx < 0.0 ? -alongPx : max(alongPx - lenPx, 0.0);
  float dAcross = abs(shape.y) * shape.z;
  float d = length(vec2(dAlong, dAcross)) / shape.w;

  float core = exp(-d * d * 1.4);
  // Window the halo so it reaches zero before the quad edge (EXTENT = 3 radii).
  float glow = exp(-d * d * 0.32) * (1.0 - smoothstep(2.0, 3.0, d));
  // Burning base of the shell sits at the head; the streak cools toward the tail.
  float head = clamp(alongPx / max(lenPx, 1.0), 0.0, 1.0);
  float trail = mix(0.16, 1.0, head * head);

  vec3 hot = vec3(1.0, 0.86, 0.66);
  vec3 rgb = (vColor * glow * 0.55 + hot * core) * trail * uIntensity * vOpacity;
  if (max(rgb.r, max(rgb.g, rgb.b)) < 0.002) discard;
  gl_FragColor = vec4(rgb, 1.0);
}
`;

interface TracerRecord {
  hx: number; hy: number; hz: number;
  dx: number; dy: number; dz: number;
  length: number;
  width: number;
  ricochet: boolean;
  phase: number;
  removedAt: number; // 0 while the shell is still in flight
}

const _color = new THREE.Color();
const _bufferSize = new THREE.Vector2();

export function ShellTracers() {
  const cfg = GAME_CONFIG.tracers;
  const records = useRef(new Map<string, TracerRecord>());

  const { geometry, material, attrs } = useMemo(() => {
    const geo = new THREE.InstancedBufferGeometry();
    // x: 0 = tail, 1 = head; y: side across the streak.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, -1, 0,  0, 1, 0,  1, -1, 0,  1, 1, 0,
    ]), 3));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const head = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
    const tail = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
    const color = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
    const opacity = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS), 1);
    const width = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS), 1);
    for (const attr of [head, tail, color, opacity, width]) attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aHead', head);
    geo.setAttribute('aTail', tail);
    geo.setAttribute('aColor', color);
    geo.setAttribute('aOpacity', opacity);
    geo.setAttribute('aWidth', width);
    geo.instanceCount = 0;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uMinPixelWidth: { value: cfg.minPixelWidth },
        uIntensity: { value: cfg.intensity },
      },
      vertexShader: tracerVertexShader,
      fragmentShader: tracerFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    return { geometry: geo, material: mat, attrs: { head, tail, color, opacity, width } };
  }, [cfg.intensity, cfg.minPixelWidth]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const tracerColor = useMemo(() => new THREE.Color(cfg.tracerColor), [cfg.tracerColor]);
  const ricochetColor = useMemo(() => new THREE.Color(cfg.ricochetColor), [cfg.ricochetColor]);

  useFrame(({ gl }) => {
    const now = Date.now();
    const map = records.current;
    const { projectiles } = useGameStore.getState();

    gl.getDrawingBufferSize(_bufferSize);
    material.uniforms.uResolution.value.copy(_bufferSize);
    material.uniforms.uMinPixelWidth.value = cfg.minPixelWidth * gl.getPixelRatio();

    // Anything we tracked last frame that is gone now has hit something: start its fade.
    const live = new Set<string>();
    for (const p of projectiles) live.add(p.id);
    for (const [id, rec] of map) {
      if (rec.removedAt === 0 && !live.has(id)) rec.removedAt = now;
      if (rec.removedAt > 0 && now - rec.removedAt >= cfg.tracerFadeTime) map.delete(id);
    }

    for (const p of projectiles) {
      const speed = p.velocity.length();
      if (speed < 1e-3) continue;
      const traveled = p.origin.distanceTo(p.position);
      const speedFactor = THREE.MathUtils.clamp(speed / cfg.referenceSpeed, 0.2, 1.4);
      let rec = map.get(p.id);
      if (!rec) {
        rec = {
          hx: 0, hy: 0, hz: 0, dx: 0, dy: 0, dz: 0, length: 0,
          width: cfg.width * THREE.MathUtils.clamp((p.caliber || 75) / 75, 0.35, 1.4),
          ricochet: !!p.ricochet,
          phase: Math.random() * Math.PI * 2,
          removedAt: 0,
        };
        map.set(p.id, rec);
      }
      rec.hx = p.position.x; rec.hy = p.position.y; rec.hz = p.position.z;
      rec.dx = p.velocity.x / speed; rec.dy = p.velocity.y / speed; rec.dz = p.velocity.z / speed;
      rec.length = Math.min(traveled, cfg.tracerLength * speedFactor);
    }

    let count = 0;
    for (const rec of map.values()) {
      if (count >= MAX_TRACERS) break;
      let length = rec.length;
      let opacity = 1;
      if (rec.removedAt > 0) {
        const t = (now - rec.removedAt) / cfg.tracerFadeTime;
        length *= 1 - t;
        opacity = 1 - t * t;
      }
      if (rec.ricochet) {
        // Tumbling shells flicker as the burning base turns toward and away from the viewer.
        opacity *= 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(now * 0.05 + rec.phase));
      }
      const i3 = count * 3;
      attrs.head.array[i3] = rec.hx;
      attrs.head.array[i3 + 1] = rec.hy;
      attrs.head.array[i3 + 2] = rec.hz;
      attrs.tail.array[i3] = rec.hx - rec.dx * length;
      attrs.tail.array[i3 + 1] = rec.hy - rec.dy * length;
      attrs.tail.array[i3 + 2] = rec.hz - rec.dz * length;
      _color.copy(rec.ricochet ? ricochetColor : tracerColor);
      attrs.color.array[i3] = _color.r;
      attrs.color.array[i3 + 1] = _color.g;
      attrs.color.array[i3 + 2] = _color.b;
      attrs.opacity.array[count] = opacity;
      attrs.width.array[count] = rec.width;
      count++;
    }

    geometry.instanceCount = count;
    if (count > 0) {
      attrs.head.needsUpdate = true;
      attrs.tail.needsUpdate = true;
      attrs.color.needsUpdate = true;
      attrs.opacity.needsUpdate = true;
      attrs.width.needsUpdate = true;
    }
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={17} />;
}
