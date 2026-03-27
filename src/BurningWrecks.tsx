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
    const spawnInterval = (GAME_CONFIG.particles.burning_smoke as any).spawnInterval ?? 150;
    const lastSpawn = lastSpawnRef.current;

    const allTanks = [playerTank, ...enemies, ...allies];

    for (const tank of allTanks) {
      if (!tank.destroyed || tank.destroyedAt === 0) continue;

      // Stop smoking after 3 minutes
      if (now - tank.destroyedAt > SMOKE_DURATION) continue;

      // Check spawn interval
      const last = lastSpawn[tank.id] ?? 0;
      if (now - last < spawnInterval) continue;

      lastSpawn[tank.id] = now;
      spawnParticle('burning_smoke', tank.position.clone().add(new Vector3(0, 1.8, 0)));
    }
  });

  return null;
}
