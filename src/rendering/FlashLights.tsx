import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// A fixed pool keeps the scene's light count constant, so flashes never force
// material recompiles. Unused lights sit at zero intensity.
const LIGHT_COUNT = 4;
const MAX_QUEUED = 16;

export interface FlashLightRequest {
  x: number; y: number; z: number;
  color: string;
  intensity: number; // peak candela
  range: number;     // m, hard cutoff distance
  duration: number;  // ms
  flicker?: boolean;
}

interface ActiveFlash {
  startedAt: number;
  duration: number;
  peak: number;
  flicker: boolean;
}

const queue: FlashLightRequest[] = [];

export function queueFlashLight(request: FlashLightRequest) {
  if (queue.length >= MAX_QUEUED) queue.shift();
  queue.push(request);
}

function envelope(flash: ActiveFlash, now: number) {
  const t = (now - flash.startedAt) / flash.duration;
  if (t >= 1 || t < 0) return 0;
  const decay = (1 - t) * (1 - t);
  const flicker = flash.flicker ? 0.75 + 0.25 * Math.sin(now * 0.09 + flash.startedAt) : 1;
  return flash.peak * decay * flicker;
}

export function FlashLights() {
  const lightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const active = useMemo<ActiveFlash[]>(
    () => Array.from({ length: LIGHT_COUNT }, () => ({ startedAt: 0, duration: 1, peak: 0, flicker: false })),
    []
  );

  useEffect(() => () => { queue.length = 0; }, []);

  useFrame(() => {
    const now = Date.now();

    while (queue.length > 0) {
      const request = queue.shift()!;
      // Take the dimmest slot so a fresh flash always wins over a fading one.
      let slot = 0;
      let lowest = Infinity;
      for (let i = 0; i < LIGHT_COUNT; i++) {
        const level = envelope(active[i], now);
        if (level < lowest) { lowest = level; slot = i; }
      }
      if (lowest > request.intensity) continue;
      const light = lightRefs.current[slot];
      if (!light) continue;
      light.position.set(request.x, request.y, request.z);
      light.color.set(request.color);
      light.distance = request.range;
      active[slot].startedAt = now;
      active[slot].duration = request.duration;
      active[slot].peak = request.intensity;
      active[slot].flicker = !!request.flicker;
    }

    for (let i = 0; i < LIGHT_COUNT; i++) {
      const light = lightRefs.current[i];
      if (light) light.intensity = envelope(active[i], now);
    }
  });

  return (
    <group>
      {Array.from({ length: LIGHT_COUNT }, (_, i) => (
        <pointLight
          key={i}
          ref={(light) => { lightRefs.current[i] = light; }}
          intensity={0}
          decay={2}
          distance={20}
          castShadow={false}
        />
      ))}
    </group>
  );
}
