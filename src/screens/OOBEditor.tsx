import { useState, useRef, useCallback, Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { getAmmoDisplayPenetration } from '../penetrationModel';
import { getTankDef } from '../tanks/registry';
import { useGameStore, type MapSize, MAP_SIZE_VALUES } from '../store';
import { TankPreview, StatBar, maxHP, maxArmor, maxSpeed, maxPen, maxReload, minReload, penetrationStatLabel } from './TankSelect';
import { OOBTankList } from './OOBTankList';
import { OOBMiniMap } from './OOBMiniMap';
import { PreviewStudio } from './PreviewStudio';
import * as THREE from 'three';
import { getCamouflageScheme } from '../tanks/core/camouflage';
import type { ThreeEvent } from '@react-three/fiber';
import { ArrowLeft, Dices, Play, RefreshCw } from 'lucide-react';

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
  const reloadScore = maxReload - previewDef.reloadTime + minReload;
  const previewPenetration = Math.round(getAmmoDisplayPenetration(previewDef.weapons.AP, 'AP', previewDef.caliber));

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

  return (
    <div className="oob-shell select-none">
      {/* Header */}
      <header className="oob-header">
        <div className="oob-brand">
          <div className="oob-kicker">FIELD COMMAND / DEPLOYMENT</div>
          <h1>ORDER OF BATTLE</h1>
          <div className="oob-brandline"><span>PANZER FRONT</span><span>WESTERN SECTOR</span></div>
        </div>
        {/* Map size selector */}
        <div className="oob-toolbar">
          <div className="oob-control-group">
          <span className="oob-control-label">Theatre</span>
          <div className="oob-segmented">
            {(['small', 'medium', 'large'] as MapSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setMapSize(size)}
                className={mapSize === size ? 'is-active' : ''}
              >
                {size}
                <span>{MAP_SIZE_VALUES[size]}m</span>
              </button>
            ))}
          </div>
          </div>
          <div className="oob-control-group oob-seed-control">
            <label className="oob-control-label" htmlFor="world-seed">Map seed</label>
            <input
              id="world-seed"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9-]/g, ''))}
            />
            <button
              onClick={() => {
                const parsed = Number.parseInt(seedInput, 10);
                if (Number.isFinite(parsed)) setWorldSeed(parsed);
              }}
              className="oob-tool-button oob-tool-button--text"
            >
              Apply
            </button>
            <button
              onClick={() => {
                const nextSeed = Math.floor(Math.random() * 1_000_000_000);
                setWorldSeed(nextSeed);
              }}
              className="oob-tool-button"
              title="Generate a new map seed"
            >
              <Dices size={15} aria-hidden="true" /><span>New seed</span>
            </button>
            <button
              onClick={regenerateWorld}
              className="oob-tool-button"
              title="Regenerate terrain from this seed"
            >
              <RefreshCw size={14} aria-hidden="true" /><span>Regenerate</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main body: three columns */}
      <div className="oob-main">
        {/* Left: Allies */}
        <aside className="oob-roster oob-roster--allies">
          <OOBTankList side="ally" onHoverTank={setHoveredListTank} />
        </aside>

        {/* Center: Mini Map */}
        <main className="oob-map-stage">
          <OOBMiniMap />
        </main>

        {/* Right: Enemies */}
        <aside className="oob-roster oob-roster--enemies">
          <OOBTankList side="enemy" onHoverTank={setHoveredListTank} />
        </aside>
      </div>

      {/* Bottom: Preview + Stats + Deploy */}
      <footer className="oob-inspector">
        {/* 3D Preview */}
        <div className="oob-tank-preview" ref={canvasContainerRef}>
          <Canvas camera={{ position: [8, 5, 8], fov: 40 }} gl={{ antialias: true }} shadows
            onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; }}>
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
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
              <planeGeometry args={[30, 30]} />
              <meshStandardMaterial color="#2a2a20" roughness={1} />
            </mesh>
          </Canvas>

          {/* Armor plate tooltip */}
          {hoveredPlate && (
            <div className="absolute pointer-events-none z-10"
              style={{ left: hoveredPlate.mouseX, top: hoveredPlate.mouseY, transform: 'translate(12px, -50%)' }}>
              <div className="bg-black/90 p-2 font-mono text-xs min-w-36" style={{ border: '1px solid #6b7a3d' }}>
                <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: '#6b7a3d' }}>{hoveredPlate.zone}</div>
                <div className="text-sm font-bold" style={{ color: '#c9b458' }}>{hoveredPlate.name}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[10px] text-gray-400 uppercase">Thick</span>
                  <span className="text-sm font-bold text-white">{hoveredPlate.armorThickness}mm</span>
                </div>
                {hoveredPlate.slopeAngleDeg > 0 && (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[10px] text-gray-400 uppercase">Slope</span>
                    <span className="text-xs text-gray-300">{hoveredPlate.slopeAngleDeg}&deg;</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="oob-vehicle-data">
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#c9b458' }}>{previewDef.displayName}</h2>
            <div className="text-[10px] text-gray-500">
              {previewDef.nationality} &middot; {previewDef.year} &middot; {previewDef.horsepower}hp / {previewDef.weight}t
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <StatBar label="Hitpoints" value={previewDef.health} max={maxHP} unit=" HP" />
            <StatBar label="Front Armor" value={previewDef.armor.front} max={maxArmor} unit=" mm" />
            <StatBar label="Speed" value={previewDef.maxSpeed} max={maxSpeed} unit=" m/s" />
            <StatBar label={penetrationStatLabel} value={previewPenetration} max={maxPen} unit=" mm" />
            <StatBar label="Reload" value={reloadScore} max={maxReload} unit="" />
          </div>
          <div className="text-[10px] text-gray-500 flex gap-3 mt-1">
            <span>Front {previewDef.armor.front}mm</span>
            <span>Side {previewDef.armor.side}mm</span>
            <span>Rear {previewDef.armor.rear}mm</span>
            <span>Turret {previewDef.armor.turret}mm</span>
          </div>
        </div>

        {/* Actions */}
        <div className="oob-actions">
          <button
            onClick={() => setGameScreen('tank-select')}
            className="oob-secondary-action"
          >
            <ArrowLeft size={15} aria-hidden="true" /> Tank detail
          </button>
          <button
            onClick={deployOob}
            className="oob-deploy-action"
          >
            <Play size={16} fill="currentColor" aria-hidden="true" /> Deploy force
          </button>
        </div>
      </footer>
    </div>
  );
}
