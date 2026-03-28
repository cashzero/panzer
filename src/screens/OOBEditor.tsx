import { useState, useRef, useCallback, Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { getAmmoDisplayPenetration } from '../penetrationModel';
import { getTankDef } from '../tanks/registry';
import { useGameStore, type MapSize, MAP_SIZE_VALUES } from '../store';
import { TankPreview, StatBar, maxHP, maxArmor, maxSpeed, maxPen, maxReload, minReload, penetrationStatLabel } from './TankSelect';
import { OOBTankList } from './OOBTankList';
import { OOBMiniMap } from './OOBMiniMap';
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
  const mapSize = useGameStore((s) => s.mapSize);
  const worldSeed = useGameStore((s) => s.worldSeed);
  const setMapSize = useGameStore((s) => s.setMapSize);
  const setWorldSeed = useGameStore((s) => s.setWorldSeed);
  const regenerateWorld = useGameStore((s) => s.regenerateWorld);
  const deployOob = useGameStore((s) => s.deployOob);
  const setGameScreen = useGameStore((s) => s.setGameScreen);

  const [hoveredPlate, setHoveredPlate] = useState<PlateHoverInfo | null>(null);
  const [hoveredListTank, setHoveredListTank] = useState<string | null>(null);
  const [seedInput, setSeedInput] = useState(String(worldSeed));
  const canvasContainerRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    setSeedInput(String(worldSeed));
  }, [worldSeed]);

  // The preview shows the hovered list tank, or the player's selected tank
  const previewTankType = hoveredListTank ?? oobPlayerTankType;
  const previewDef = getTankDef(previewTankType);
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
    <div className="absolute inset-0 bg-black flex flex-col font-mono text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 border-b border-gray-800">
        <div>
          <h1 className="text-2xl font-bold tracking-widest" style={{ color: '#8b9a5b' }}>
            ORDER OF BATTLE
          </h1>
          <div className="text-[10px] text-gray-500 tracking-wide">PANZER FRONT</div>
        </div>
        {/* Map size selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 uppercase tracking-widest">Map</span>
          <div className="flex gap-1">
            {(['small', 'medium', 'large'] as MapSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setMapSize(size)}
                className={`px-3 py-1 border text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  mapSize === size
                    ? 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                {size}
                <span className="text-[9px] ml-1 opacity-60">{MAP_SIZE_VALUES[size]}m</span>
              </button>
            ))}
          </div>
          <div className="ml-4 flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-widest">Seed</span>
            <input
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9-]/g, ''))}
              className="w-28 border border-gray-700 bg-black px-2 py-1 text-xs tracking-wider text-gray-200 outline-none focus:border-yellow-600"
            />
            <button
              onClick={() => {
                const parsed = Number.parseInt(seedInput, 10);
                if (Number.isFinite(parsed)) setWorldSeed(parsed);
              }}
              className="px-3 py-1 border border-gray-700 text-xs uppercase tracking-wider text-gray-300 hover:border-yellow-600 hover:text-yellow-400"
            >
              Apply
            </button>
            <button
              onClick={() => {
                const nextSeed = Math.floor(Math.random() * 1_000_000_000);
                setWorldSeed(nextSeed);
              }}
              className="px-3 py-1 border border-gray-700 text-xs uppercase tracking-wider text-gray-300 hover:border-yellow-600 hover:text-yellow-400"
            >
              New Seed
            </button>
            <button
              onClick={regenerateWorld}
              className="px-3 py-1 border border-gray-700 text-xs uppercase tracking-wider text-gray-300 hover:border-yellow-600 hover:text-yellow-400"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      {/* Main body: three columns */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Allies */}
        <div className="w-48 border-r border-gray-800 flex-shrink-0">
          <OOBTankList side="ally" onHoverTank={setHoveredListTank} />
        </div>

        {/* Center: Mini Map */}
        <div className="flex-1 min-w-0">
          <OOBMiniMap />
        </div>

        {/* Right: Enemies */}
        <div className="w-48 border-l border-gray-800 flex-shrink-0">
          <OOBTankList side="enemy" onHoverTank={setHoveredListTank} />
        </div>
      </div>

      {/* Bottom: Preview + Stats + Deploy */}
      <div className="border-t border-gray-800 flex" style={{ height: '200px' }}>
        {/* 3D Preview */}
        <div className="w-56 relative flex-shrink-0" ref={canvasContainerRef}>
          <Canvas camera={{ position: [8, 5, 8], fov: 40 }} gl={{ antialias: true }}>
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 10, 5]} intensity={1.2} />
            <directionalLight position={[-5, 3, -5]} intensity={0.3} />
            <Suspense fallback={null}>
              <TankPreview
                key={previewDef.id}
                def={previewDef}
                paused={hoveredPlate !== null}
                onPlateHover={handlePlateHover}
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
        <div className="flex-1 p-3 flex flex-col gap-1.5 overflow-y-auto min-w-0">
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
        <div className="w-48 border-l border-gray-800 p-3 flex flex-col justify-end gap-2 flex-shrink-0">
          <button
            onClick={() => setGameScreen('tank-select')}
            className="w-full px-4 py-2 border border-gray-600 text-gray-400 text-xs uppercase tracking-wider hover:border-yellow-600 hover:text-yellow-400 transition-all cursor-pointer"
          >
            Tank Detail
          </button>
          <button
            onClick={deployOob}
            className="w-full px-8 py-2.5 bg-green-900/40 border border-green-700 text-green-400 text-sm uppercase tracking-wider hover:bg-green-800/50 transition-all cursor-pointer font-bold"
          >
            Deploy
          </button>
        </div>
      </div>
    </div>
  );
}
