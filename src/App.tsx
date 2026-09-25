import { useEffect } from 'react';
import { GameScene } from './GameScene';
import { UI } from './UI';
import { OOBEditor } from './screens/OOBEditor';
import { TankSelect } from './screens/TankSelect';
import { useGameStore } from './store';
import { audioManager } from './audio';

export default function App() {
  const gameScreen = useGameStore((s) => s.gameScreen);
  const battleId = useGameStore((s) => s.battleId);

  useEffect(() => {
    audioManager.mount();
    return () => {
      audioManager.dispose();
    };
  }, []);

  if (gameScreen === 'oob-editor') {
    return <OOBEditor />;
  }

  if (gameScreen === 'tank-select') {
    return <TankSelect />;
  }

  return (
    // Keyed on the deployment, so a new battle mounts a fresh scene instead
    // of inheriting the last one's wrecks, craters and track marks.
    <div key={battleId} className="relative w-full h-screen overflow-hidden bg-black">
      <GameScene />
      <UI />
    </div>
  );
}
