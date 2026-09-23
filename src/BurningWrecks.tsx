import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from './store';
import { GAME_CONFIG } from './config';

const _offset = new Vector3();

/**
 * A knocked-out tank burns for a while, then smoulders: flames and a dense
 * plume first, a thinner grey drift later, nothing after the smoke duration.
 */
export function BurningWrecks() {
  const lastSmokeRef = useRef<Record<string, number>>({});
  const lastFireRef = useRef<Record<string, number>>({});

  useFrame(() => {
    const { playerTank, enemies, allies, spawnParticle } = useGameStore.getState();
    const now = Date.now();
    const cfg = GAME_CONFIG.particles.burning_smoke;

    for (const tank of [playerTank, ...enemies, ...allies]) {
      if (!tank.destroyed || tank.destroyedAt === 0) continue;
      const age = now - tank.destroyedAt;
      if (age > cfg.smokeDuration || age < cfg.initialDelay) continue;

      const ramp = Math.min(1, (age - cfg.initialDelay) / cfg.rampUpDuration);
      const smoulder = age < cfg.fireDuration
        ? 1
        : 1 - 0.65 * (age - cfg.fireDuration) / (cfg.smokeDuration - cfg.fireDuration);
      // Burning happens over the engine deck, behind the turret.
      _offset.set(-Math.sin(tank.rotation) * 1.1, 1.9, -Math.cos(tank.rotation) * 1.1);

      if (now - (lastSmokeRef.current[tank.id] ?? 0) >= cfg.spawnInterval) {
        lastSmokeRef.current[tank.id] = now;
        spawnParticle('burning_smoke', tank.position.clone().add(_offset), undefined, Math.max(0.2, ramp * smoulder));
      }

      const fire = age < cfg.fireDuration ? Math.min(1, 1.6 * (1 - age / cfg.fireDuration) + 0.2) : 0;
      if (fire > 0 && now - (lastFireRef.current[tank.id] ?? 0) >= GAME_CONFIG.particles.wreck_fire.spawnInterval) {
        lastFireRef.current[tank.id] = now;
        spawnParticle('wreck_fire', tank.position.clone().add(_offset).setY(tank.position.y + 1.5), undefined, fire);
      }
    }
  });

  return null;
}
