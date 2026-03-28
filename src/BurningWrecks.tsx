import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from './store';
import { GAME_CONFIG } from './config';

const SMOKE_DURATION = 3 * 60 * 1000; // 3 minutes in ms

export function BurningWrecks() {
  const lastSpawnRef = useRef<Record<string, number>>({});

  useFrame(() => {
    const { playerTank, enemies, allies, spawnParticle } = useGameStore.getState();
    const now = Date.now();
    const smokeConfig = GAME_CONFIG.particles.burning_smoke as typeof GAME_CONFIG.particles.burning_smoke & {
      initialDelay?: number;
      rampUpDuration?: number;
    };
    const baseSpawnInterval = smokeConfig.spawnInterval ?? 150;
    const initialDelay = smokeConfig.initialDelay ?? 0;
    const rampUpDuration = smokeConfig.rampUpDuration ?? 0;
    const lastSpawn = lastSpawnRef.current;

    const allTanks = [playerTank, ...enemies, ...allies];

    for (const tank of allTanks) {
      if (!tank.destroyed || tank.destroyedAt === 0) continue;

      const wreckAge = now - tank.destroyedAt;

      // Stop smoking after 3 minutes
      if (wreckAge > SMOKE_DURATION) continue;

      if (wreckAge < initialDelay) continue;

      const rampProgress = rampUpDuration > 0
        ? Math.min(Math.max((wreckAge - initialDelay) / rampUpDuration, 0), 1)
        : 1;
      const intensity = 0.2 + rampProgress * 0.8;
      const spawnInterval = Math.max(80, baseSpawnInterval / intensity);

      // Check spawn interval
      const last = lastSpawn[tank.id] ?? 0;
      if (now - last < spawnInterval) continue;

      lastSpawn[tank.id] = now;
      spawnParticle('burning_smoke', tank.position.clone().add(new Vector3(0, 1.8, 0)));
    }
  });

  return null;
}
