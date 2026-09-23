import { useState, useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getAmmoDisplayPenetration, getReferencePenetrationDistance } from '../penetrationModel';
import { getAllTankDefs } from '../tanks/registry';
import type { TankDefinition } from '../tanks/types';
import type { ArmorPlate } from '../armorModel';
import { useGameStore, type MapSize, MAP_SIZE_VALUES } from '../store';
import { camouflageSeed, getCamouflageScheme, type CamouflageScheme } from '../tanks/core/camouflage';
import { PreviewStudio } from './PreviewStudio';
import { Play } from 'lucide-react';

const allTanks = getAllTankDefs();

/* ------------------------------------------------------------------ */
/*  Country tabs                                                       */
/* ------------------------------------------------------------------ */

const ALL_COUNTRY = 'ALL';
const countries = [ALL_COUNTRY, ...Array.from(new Set(allTanks.map((t) => t.nationality)))];

/* ------------------------------------------------------------------ */
/*  Stat bar — normalised against the best value across all tanks     */
/* ------------------------------------------------------------------ */

export function StatBar({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-24 text-right uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-3 bg-gray-800 border border-gray-700">
        <div
          className="h-full bg-olive-500 transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: '#6b7a3d' }}
        />
      </div>
      <span className="text-xs text-gray-300 w-16">{value}{unit ?? ''}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plate hover info                                                  */
/* ------------------------------------------------------------------ */

interface PlateHoverInfo {
  name: string;
  zone: string;
  armorThickness: number;
  slopeAngleDeg: number;
  mouseX: number;
  mouseY: number;
}

function plateSlopeAngle(plate: ArmorPlate): number {
  const ax = Math.abs(plate.rotation[0]);
  const ay = Math.abs(plate.rotation[1]);
  const az = Math.abs(plate.rotation[2]);
  const maxRad = Math.max(ax, ay, az);
  return Math.round(maxRad * (180 / Math.PI));
}

/* ------------------------------------------------------------------ */
/*  Invisible armor plate mesh with hover detection                   */
/* ------------------------------------------------------------------ */

function ArmorPlateMesh({
  plate,
  onHover,
}: {
  plate: ArmorPlate;
  onHover: (info: PlateHoverInfo | null, e?: ThreeEvent<PointerEvent>) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const handleEnter = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    onHover({
      name: plate.name,
      zone: plate.zone,
      armorThickness: plate.armorThickness,
      slopeAngleDeg: plateSlopeAngle(plate),
      mouseX: e.nativeEvent.clientX,
      mouseY: e.nativeEvent.clientY,
    }, e);
  }, [plate, onHover]);

  const handleMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover({
      name: plate.name,
      zone: plate.zone,
      armorThickness: plate.armorThickness,
      slopeAngleDeg: plateSlopeAngle(plate),
      mouseX: e.nativeEvent.clientX,
      mouseY: e.nativeEvent.clientY,
    }, e);
  }, [plate, onHover]);

  const handleLeave = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    onHover(null, e);
  }, [onHover]);

  return (
    <mesh
      position={plate.position}
      rotation={plate.rotation}
      onPointerEnter={handleEnter}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <boxGeometry args={[plate.halfExtents[0] * 2, plate.halfExtents[1] * 2, plate.halfExtents[2] * 2]} />
      <meshBasicMaterial
        transparent
        opacity={hovered ? 0.18 : 0}
        color={hovered ? '#c9b458' : '#000'}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Spinning 3D tank preview with armor plate overlays                */
/* ------------------------------------------------------------------ */

export function TankPreview({
  def,
  paused,
  onPlateHover,
  autoRotate = true,
  camouflage,
}: {
  def: TankDefinition;
  paused: boolean;
  onPlateHover: (info: PlateHoverInfo | null, e?: ThreeEvent<PointerEvent>) => void;
  autoRotate?: boolean;
  camouflage?: CamouflageScheme;
}) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_, dt) => {
    if (groupRef.current && !paused && autoRotate) {
      groupRef.current.rotation.y += dt * 0.4;
    }
  });

  const { HullComponent, TracksComponent, TurretComponent, GunComponent } = def;
  // Same merged path as the battlefield, so the preview shows the paint scheme.
  const scheme = camouflage ?? def.camouflage[0];
  const paint = { camouflage: scheme, paintSeed: camouflageSeed(def.id), merged: true };
  const geoProps = { color: scheme.base, destroyedColor: '#555', destroyed: false, ...paint };
  const gunProps = { color: scheme.base, destroyedColor: '#555', destroyed: false, ...paint };
  const trackMat = useRef(new THREE.MeshStandardMaterial({ color: '#4b4d46', roughness: 0.84, metalness: 0.42 })).current;
  const trackProps = { trackMat, destroyedColor: '#555', destroyed: false };

  const hullPlates = def.plates.filter((p) => p.parent === 'hull');
  const turretPlates = def.plates.filter((p) => p.parent === 'turret');
  const gunPlates = def.plates.filter((p) => p.parent === 'gunGroup');

  return (
    <group ref={groupRef}>
      <HullComponent {...geoProps} />
      <TracksComponent isLeft={true} {...trackProps} />
      <TracksComponent isLeft={false} {...trackProps} />
      {hullPlates.map((plate) => (
        <ArmorPlateMesh key={plate.name} plate={plate} onHover={onPlateHover} />
      ))}
      <group position={def.turretOffset}>
        <TurretComponent {...geoProps} />
        {turretPlates.map((plate) => (
          <ArmorPlateMesh key={plate.name} plate={plate} onHover={onPlateHover} />
        ))}
        <group position={def.gunPivotOffset}>
          <GunComponent {...gunProps} />
          {gunPlates.map((plate) => (
            <ArmorPlateMesh key={plate.name} plate={plate} onHover={onPlateHover} />
          ))}
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat ranges across all tanks (for bar normalisation)              */
/* ------------------------------------------------------------------ */

export const maxHP = Math.max(...allTanks.map((t) => t.health));
export const maxArmor = Math.max(...allTanks.map((t) => t.armor.front));
export const maxSpeed = Math.max(...allTanks.map((t) => t.maxSpeed));
export const penetrationStatLabel = `Pen @${getReferencePenetrationDistance()}m`;
export const maxPen = Math.max(...allTanks.map((t) => getAmmoDisplayPenetration(t.weapons.AP, 'AP', t.caliber)));
export const maxReload = Math.max(...allTanks.map((t) => t.reloadTime));
export const minReload = Math.min(...allTanks.map((t) => t.reloadTime));

/* ------------------------------------------------------------------ */
/*  Main screen                                                       */
/* ------------------------------------------------------------------ */

export function TankSelect() {
  const [selectedCountry, setSelectedCountry] = useState(ALL_COUNTRY);
  const filteredTanks = selectedCountry === ALL_COUNTRY
    ? allTanks
    : allTanks.filter((t) => t.nationality === selectedCountry);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, filteredTanks.length - 1);
  const [hoveredPlate, setHoveredPlate] = useState<PlateHoverInfo | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null!);
  const setOobPlayerTankType = useGameStore((s) => s.setOobPlayerTankType);
  const setOobPlayerCamouflage = useGameStore((s) => s.setOobPlayerCamouflage);
  const oobPlayerTankType = useGameStore((s) => s.oobPlayerTankType);
  const oobPlayerCamouflage = useGameStore((s) => s.oobPlayerCamouflage);
  const setGameScreen = useGameStore((s) => s.setGameScreen);
  const mapSize = useGameStore((s) => s.mapSize);
  const setMapSize = useGameStore((s) => s.setMapSize);
  const def = filteredTanks[safeIdx];
  // Picked scheme per tank on this screen; falls back to the deployed choice, then the default.
  const [schemeByTank, setSchemeByTank] = useState<Record<string, string>>({});
  const scheme = getCamouflageScheme(def.camouflage,
    schemeByTank[def.id] ?? (def.id === oobPlayerTankType ? oobPlayerCamouflage ?? undefined : undefined));
  const displayPenetration = Math.round(getAmmoDisplayPenetration(def.weapons.AP, 'AP', def.caliber));

  const handleConfirm = () => {
    setOobPlayerTankType(def.id);
    setOobPlayerCamouflage(scheme.id);
    setGameScreen('oob-editor');
  };

  const handlePlateHover = useCallback((info: PlateHoverInfo | null, e?: ThreeEvent<PointerEvent>) => {
    if (!info) {
      setHoveredPlate(null);
      return;
    }
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect || !e) return;
    setHoveredPlate({
      ...info,
      mouseX: e.nativeEvent.clientX - rect.left,
      mouseY: e.nativeEvent.clientY - rect.top,
    });
  }, []);

  // Reload "score" inverted so faster reload = longer bar
  const reloadScore = maxReload - def.reloadTime + minReload;

  return (
    <div className="tank-select-shell select-none">
      {/* Header */}
      <header className="tank-select-header">
        <div><span>ARMOURED REPLACEMENT DEPOT</span><h1>SELECT YOUR TANK</h1></div>
        <strong>PANZER FRONT / VEHICLE CATALOGUE</strong>
      </header>

      {/* Body: 3D preview left, info right */}
      <div className="tank-select-main">
        {/* 3D Canvas */}
        <div className="tank-select-stage" ref={canvasContainerRef}>
          <Canvas
            camera={{ position: [8, 5, 8], fov: 40 }}
            dpr={[1, 1.5]}
            shadows
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 0.9;
              gl.shadowMap.type = THREE.PCFSoftShadowMap;
            }}
          >
            <PreviewStudio />
            <Suspense fallback={null}>
              <TankPreview
                key={def.id}
                def={def}
                paused={hoveredPlate !== null}
                onPlateHover={handlePlateHover}
                autoRotate={false}
                camouflage={scheme}
              />
            </Suspense>
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              autoRotate={false}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2.5}
            />
          </Canvas>

          {/* Armor plate tooltip */}
          {hoveredPlate && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                left: hoveredPlate.mouseX,
                top: hoveredPlate.mouseY,
                transform: 'translate(12px, -50%)',
              }}
            >
              <div
                className="bg-black/90 p-3 font-mono text-sm min-w-48"
                style={{ border: '1px solid #6b7a3d' }}
              >
                <div className="text-xs uppercase tracking-widest mb-1" style={{ color: '#6b7a3d' }}>
                  {hoveredPlate.zone}
                </div>
                <div className="text-base font-bold" style={{ color: '#c9b458' }}>
                  {hoveredPlate.name}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-xs text-gray-400 uppercase">Thickness</span>
                  <span className="text-lg font-bold text-white">{hoveredPlate.armorThickness} mm</span>
                </div>
                {hoveredPlate.slopeAngleDeg > 0 && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-gray-400 uppercase">Slope</span>
                    <span className="text-sm text-gray-300">{hoveredPlate.slopeAngleDeg}&deg;</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Info Panel */}
        <aside className="tank-select-info">
          {/* Tank name + meta */}
          <div>
            <h2 className="text-2xl font-bold" style={{ color: '#c9b458' }}>{def.displayName}</h2>
            <div className="text-sm text-gray-500 mt-1">
              {def.nationality} &middot; {def.year} &middot; {def.horsepower} hp / {def.weight}t ({(def.horsepower / def.weight).toFixed(1)} hp/t)
            </div>
            <p className="text-sm text-gray-400 mt-3 leading-relaxed">{def.description}</p>
          </div>

          {/* Stat bars */}
          <div className="flex flex-col gap-2 mt-2">
            <StatBar label="Hitpoints" value={def.health} max={maxHP} unit=" HP" />
            <StatBar label="Front Armor" value={def.armor.front} max={maxArmor} unit=" mm" />
            <StatBar label="Speed" value={def.maxSpeed} max={maxSpeed} unit=" m/s" />
            <StatBar label={penetrationStatLabel} value={displayPenetration} max={maxPen} unit=" mm" />
            <StatBar label="Reload" value={reloadScore} max={maxReload} unit="" />
          </div>

          {/* Armor breakdown */}
          <div className="mt-2 text-xs text-gray-500 flex gap-4">
            <span>Front {def.armor.front}mm</span>
            <span>Side {def.armor.side}mm</span>
            <span>Rear {def.armor.rear}mm</span>
            <span>Turret {def.armor.turret}mm</span>
          </div>

          {/* Paint scheme selector */}
          {def.camouflage.length > 1 && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="text-xs text-gray-400 uppercase tracking-widest mb-2">Paint Scheme</div>
              <div className="grid grid-cols-3 gap-2">
                {def.camouflage.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setSchemeByTank((current) => ({ ...current, [def.id]: option.id }))}
                    className={`px-2 py-2 border text-left text-xs transition-all cursor-pointer ${
                      scheme.id === option.id
                        ? 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
                        : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex h-2.5 w-4 flex-shrink-0 border border-black/40">
                        {[option.base, ...option.colors].map((swatch) => (
                          <span key={swatch} className="flex-1" style={{ backgroundColor: swatch }} />
                        ))}
                      </span>
                      <span className="truncate">{option.name}</span>
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-60">{option.period}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Map size selector */}
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="text-xs text-gray-400 uppercase tracking-widest mb-2">Map Size</div>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as MapSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => setMapSize(size)}
                  className={`flex-1 px-3 py-2 border text-xs uppercase tracking-wider transition-all cursor-pointer ${
                    mapSize === size
                      ? 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
                      : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                  }`}
                >
                  <div>{size}</div>
                  <div className="text-[10px] mt-0.5 opacity-60">{MAP_SIZE_VALUES[size]}m</div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom: Country tabs + Tank selector + confirm */}
      <footer className="tank-select-catalog">
        {/* Country tabs */}
        <div className="flex justify-center gap-1 pt-3 pb-1">
          {countries.map((c) => (
            <button
              key={c}
              onClick={() => { setSelectedCountry(c); setSelectedIdx(0); }}
              className={`px-4 py-1 text-xs uppercase tracking-widest transition-all cursor-pointer border-b-2 ${
                c === selectedCountry
                  ? 'border-yellow-600 text-yellow-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              {c === ALL_COUNTRY ? 'All' : c}
            </button>
          ))}
        </div>
        {/* Tank buttons + deploy */}
        <div className="p-3 flex items-center justify-center gap-4">
          {filteredTanks.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setSelectedIdx(i)}
              className={`px-5 py-2 border text-sm uppercase tracking-wider transition-all cursor-pointer ${
                i === safeIdx
                  ? 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              {t.displayName}
            </button>
          ))}
          <button
            onClick={handleConfirm}
            className="tank-select-confirm"
          >
            <Play size={15} fill="currentColor" aria-hidden="true" /> Continue
          </button>
        </div>
      </footer>
    </div>
  );
}
