import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store';
import { ArmourSymbol } from './menuParts';

/** Frames the battle scene draws behind the loading screen before it lifts; the first ones compile shaders and fill buffers. */
const READY_FRAMES = 3;
const FADE_MS = 450;

/**
 * Loading screen between the order of battle and the fight. Building a
 * battle blocks the main thread for seconds (terrain, forests, trees, shader
 * compilation), so the screen paints first and only then starts deployment;
 * it stays over the battle until the scene has drawn its first frames.
 */
export function DeployLoading({ active }: { active: boolean }) {
  const gameScreen = useGameStore((s) => s.gameScreen);
  const deployOob = useGameStore((s) => s.deployOob);
  const mapSize = useGameStore((s) => s.mapSize);
  const allyCount = useGameStore((s) => s.oobAllies.length) + 1;
  const enemyCount = useGameStore((s) => s.oobEnemies.length);
  const [shown, setShown] = useState(active);

  // Deploy once this screen is on glass: the frame callback runs before the
  // paint, the timeout after it. A hidden tab runs no frames, so a plain
  // timeout deploys there instead.
  useEffect(() => {
    if (gameScreen !== 'deploying') return;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      clearTimeout(fallback);
      timer = window.setTimeout(deployOob, 0);
    });
    const fallback = window.setTimeout(() => {
      cancelAnimationFrame(frame);
      deployOob();
    }, 250);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(fallback);
    };
  }, [gameScreen, deployOob]);

  useEffect(() => {
    if (active) {
      setShown(true);
      return;
    }
    const timer = window.setTimeout(() => setShown(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active && !shown) return null;

  return (
    <div className={`deploy-loading${active ? '' : ' is-leaving'}`} role="status" aria-live="polite" aria-busy={active}>
      <div className="deploy-loading__sheet">
        <p className="deploy-loading__kicker">Movement order</p>
        <h1 className="deploy-loading__title">Moving up</h1>
        <div className="deploy-loading__forces">
          <span><ArmourSymbol side="friendly" size={30} /> {allyCount} {allyCount === 1 ? 'tank' : 'tanks'}</span>
          <span className="deploy-loading__versus">against</span>
          <span><ArmourSymbol side="enemy" size={30} /> {enemyCount} {enemyCount === 1 ? 'tank' : 'tanks'}</span>
        </div>
        <p className="deploy-loading__detail">
          {mapSize === 'large' ? '4 km' : '2 km'} sector &middot; surveying ground, forming up
        </p>
        <div className="deploy-loading__track" aria-hidden="true">
          <span className="deploy-loading__column" />
        </div>
      </div>
    </div>
  );
}

/** Lives inside the battle canvas; tells the store once the scene has drawn its first frames. */
export function BattleReadySignal() {
  const markBattleReady = useGameStore((s) => s.markBattleReady);
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === READY_FRAMES) markBattleReady();
  });
  return null;
}
