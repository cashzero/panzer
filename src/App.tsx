import { GameScene } from './GameScene';
import { UI } from './UI';

export default function App() {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <GameScene />
      <UI />
    </div>
  );
}

