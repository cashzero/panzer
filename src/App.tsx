import { useEffect } from 'react';
import { GameScene } from './GameScene';
import { UI } from './UI';
import { OOBEditor } from './screens/OOBEditor';
import { TankSelect } from './screens/TankSelect';
import { useGameStore } from './store';
import { audioManager } from './audio';

export default function App() {
  const gameScreen = useGameStore((s) => s.gameScreen);

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
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <GameScene />
      <UI />
    </div>
  );
}
