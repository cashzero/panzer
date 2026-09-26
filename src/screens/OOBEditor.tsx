import { useState, useRef, useCallback, Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { getTankDef } from '../tanks/registry';
import { useGameStore, type MapSize, MAP_SIZE_VALUES } from '../store';
import { TankPreview, PlateTooltip, vehicleRows, vehicleSubtitle } from './TankSelect';
import { DataPlate } from './menuParts';
import { OOBTankList } from './OOBTankList';
import { OOBMiniMap } from './OOBMiniMap';
import { OOBRandomPanel } from './OOBRandomPanel';
import { PreviewStudio } from './PreviewStudio';
import * as THREE from 'three';
import { getCamouflageScheme } from '../tanks/core/camouflage';
import type { ThreeEvent } from '@react-three/fiber';


interface PlateHoverInfo {
  name: string;
  zone: string;
  armorThickness: number;
  slopeAngleDeg: number;
  mouseX: number;
  mouseY: number;
}

export function OOBEditor() {
  const oobPlayerTankType = useGameStore((s) => s.oobPlayerTankType);
  const oobPlayerCamouflage = useGameStore((s) => s.oobPlayerCamouflage);
  const mapSize = useGameStore((s) => s.mapSize);
  const worldSeed = useGameStore((s) => s.worldSeed);
  const setMapSize = useGameStore((s) => s.setMapSize);
  const setWorldSeed = useGameStore((s) => s.setWorldSeed);
  const regenerateWorld = useGameStore((s) => s.regenerateWorld);
  const deployOob = useGameStore((s) => s.deployOob);
  const [randomOpen, setRandomOpen] = useState(false);
  const setGameScreen = useGameStore((s) => s.setGameScreen);

  const [hoveredPlate, setHoveredPlate] = useState<PlateHoverInfo | null>(null);
  const [hoveredListTank, setHoveredListTank] = useState<{ tankType: string; camouflage?: string } | null>(null);
  const [seedInput, setSeedInput] = useState(String(worldSeed));
  const canvasContainerRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    setSeedInput(String(worldSeed));
  }, [worldSeed]);

  // The preview shows the hovered list tank, or the player's selected tank
  const previewTankType = hoveredListTank?.tankType ?? oobPlayerTankType;
  const previewDef = getTankDef(previewTankType);
  const previewScheme = getCamouflageScheme(previewDef.camouflage,
    hoveredListTank ? hoveredListTank.camouflage : oobPlayerCamouflage ?? undefined);

  const handlePlateHover = useCallback((info: PlateHoverInfo | null, e?: ThreeEvent<PointerEvent>) => {
    if (!info) { setHoveredPlate(null); return; }
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect || !e) return;
    setHoveredPlate({
      ...info,
      mouseX: e.nativeEvent.clientX - rect.left,
      mouseY: e.nativeEvent.clientY - rect.top,
    });
  }, []);

  const applySeed = () => {
    const parsed = Number.parseInt(seedInput, 10);
    if (Number.isFinite(parsed)) setWorldSeed(parsed);
  };

  return (
    <div className="orders select-none">
      <header className="orders__head">
        <h1>Order of battle</h1>
        <div className="orders__settings">
          <div className="map-size" role="group" aria-label="Battlefield size">
            {(['small', 'medium', 'large'] as MapSize[]).map((size) => (
              <button key={size} type="button" aria-pressed={mapSize === size} onClick={() => setMapSize(size)}>
                {MAP_SIZE_VALUES[size] / 1000} km
              </button>
            ))}
          </div>
          <form className="orders__seed" onSubmit={(e) => { e.preventDefault(); applySeed(); }}>
            <label htmlFor="world-seed">Map number</label>
            <input
              id="world-seed"
              inputMode="numeric"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9-]/g, ''))}
            />
            <button type="submit" className="plain-button">Load</button>
            <button type="button" className="plain-button"
              onClick={() => setWorldSeed(Math.floor(Math.random() * 1_000_000_000))}>
              Random map
            </button>
            <button type="button" className="plain-button" onClick={regenerateWorld} title="Rebuild the terrain for this map number">
              Rebuild
            </button>
          </form>
          <button type="button" className="plain-button" aria-pressed={randomOpen} aria-expanded={randomOpen}
            onClick={() => setRandomOpen(!randomOpen)}>
            Random forces
          </button>
        </div>
        {randomOpen && <OOBRandomPanel />}
      </header>

      <div className="orders__table">
        <aside className="orders__force orders__force--friendly">
          <OOBTankList side="ally" onHoverTank={setHoveredListTank} />
        </aside>
        <main className="orders__map">
          <OOBMiniMap />
        </main>
        <aside className="orders__force orders__force--enemy">
          <OOBTankList side="enemy" onHoverTank={setHoveredListTank} />
        </aside>
      </div>

      <footer className="orders__vehicle">
        <div className="orders__preview" ref={canvasContainerRef}>
          <Canvas camera={{ position: [8, 5, 8], fov: 40 }} gl={{ antialias: true }} shadows
            onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.9; }}>
            <PreviewStudio />
            <Suspense fallback={null}>
              <TankPreview
                key={previewDef.id}
                def={previewDef}
                paused={hoveredPlate !== null}
                onPlateHover={handlePlateHover}
                camouflage={previewScheme}
              />
            </Suspense>
            <OrbitControls enablePan={false} enableZoom={false} autoRotate={false}
              minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.5} />
          </Canvas>
          {hoveredPlate && <PlateTooltip plate={hoveredPlate} />}
        </div>
        <DataPlate compact title={previewDef.displayName} subtitle={vehicleSubtitle(previewDef)} rows={vehicleRows(previewDef)} />
        <div className="orders__actions">
          <button type="button" className="plain-button" onClick={() => setGameScreen('tank-select')}>
            Change your tank
          </button>
          <button type="button" className="command-button" onClick={deployOob}>
            Deploy
          </button>
        </div>
      </footer>
    </div>
  );
}
