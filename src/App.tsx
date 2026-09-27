import { useEffect } from 'react';
import { GameScene } from './GameScene';
import { UI } from './UI';
import { DeployLoading } from './screens/DeployLoading';
import { OOBEditor } from './screens/OOBEditor';
import { TankSelect } from './screens/TankSelect';
import { useGameStore } from './store';
import { audioManager } from './audio';

export default function App() {
  const gameScreen = useGameStore((s) => s.gameScreen);
  const battleId = useGameStore((s) => s.battleId);
  const battleReady = useGameStore((s) => s.battleReady);

  useEffect(() => {
    audioManager.mount();
    return () => {
      audioManager.dispose();
    };
  }, []);

  let screen = null;
  if (gameScreen === 'oob-editor') {
    screen = <OOBEditor />;
  } else if (gameScreen === 'tank-select') {
    screen = <TankSelect />;
  } else if (gameScreen === 'playing') {
    screen = (
      // Keyed on the deployment, so a new battle mounts a fresh scene instead
      // of inheriting the last one's wrecks, craters and track marks.
      <div key={battleId} className="relative w-full h-screen overflow-hidden bg-black">
        <GameScene />
        <UI />
      </div>
    );
  }

  // The loading screen stays mounted from the deploy order until the battle
  // has drawn, so it never blinks out while the scene is being built.
  const loading = gameScreen === 'deploying' || (gameScreen === 'playing' && !battleReady);
  return (
    <>
      {screen}
      <DeployLoading active={loading} />
    </>
  );
}
