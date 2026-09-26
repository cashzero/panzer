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
import { DataPlate, PaintChip, type PlateRow } from './menuParts';

const allTanks = getAllTankDefs();

/* ------------------------------------------------------------------ */
/*  Nations, in catalogue order                                        */
/* ------------------------------------------------------------------ */

const nations = Array.from(new Set(allTanks.map((t) => t.nationality)));

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
export const penetrationStatLabel = `Penetration at ${getReferencePenetrationDistance()} m`;
export const maxPen = Math.max(...allTanks.map((t) => getAmmoDisplayPenetration(t.weapons.AP, 'AP', t.caliber)));
export const maxReload = Math.max(...allTanks.map((t) => t.reloadTime));
export const minReload = Math.min(...allTanks.map((t) => t.reloadTime));

/** Data plate figures for a vehicle, each placed on a scale against the best in the catalogue. */
export function vehicleRows(def: TankDefinition): PlateRow[] {
  const penetration = Math.round(getAmmoDisplayPenetration(def.weapons.AP, 'AP', def.caliber));
  return [
    { label: 'Front armour', value: def.armor.front, unit: ' mm', fraction: def.armor.front / maxArmor },
    { label: penetrationStatLabel, value: penetration, unit: ' mm', fraction: penetration / maxPen },
    { label: 'Road speed', value: Math.round(def.maxSpeed * 3.6), unit: ' km/h', fraction: def.maxSpeed / maxSpeed },
    { label: 'Reload', value: Number((def.reloadTime / 1000).toFixed(1)), unit: ' s', fraction: minReload / def.reloadTime },
    { label: 'Hit points', value: def.health, fraction: def.health / maxHP },
  ];
}

export function vehicleSubtitle(def: TankDefinition) {
  return `${def.nationality}, ${def.year}. ${def.horsepower} hp, ${def.weight} t`;
}

/** Armour plate readout shown while hovering a plate on the preview. */
export function PlateTooltip({ plate }: { plate: { name: string; zone: string; armorThickness: number; slopeAngleDeg: number; mouseX: number; mouseY: number } }) {
  return (
    <div className="plate-tooltip" style={{ left: plate.mouseX, top: plate.mouseY }}>
      <strong>{plate.name}</strong>
      <span>{plate.armorThickness} mm{plate.slopeAngleDeg > 0 ? `, sloped ${plate.slopeAngleDeg}°` : ''}</span>
      <small>{plate.zone}</small>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main screen                                                       */
/* ------------------------------------------------------------------ */

export function TankSelect() {
  const [selectedId, setSelectedId] = useState<string>(() => useGameStore.getState().oobPlayerTankType);
  const def = allTanks.find((t) => t.id === selectedId) ?? allTanks[0];
  const [hoveredPlate, setHoveredPlate] = useState<PlateHoverInfo | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null!);
  const setOobPlayerTankType = useGameStore((s) => s.setOobPlayerTankType);
  const setOobPlayerCamouflage = useGameStore((s) => s.setOobPlayerCamouflage);
  const oobPlayerTankType = useGameStore((s) => s.oobPlayerTankType);
  const oobPlayerCamouflage = useGameStore((s) => s.oobPlayerCamouflage);
  const setGameScreen = useGameStore((s) => s.setGameScreen);
  const mapSize = useGameStore((s) => s.mapSize);
  const setMapSize = useGameStore((s) => s.setMapSize);
  // Picked scheme per tank on this screen; falls back to the deployed choice, then the default.
  const [schemeByTank, setSchemeByTank] = useState<Record<string, string>>({});
  const scheme = getCamouflageScheme(def.camouflage,
    schemeByTank[def.id] ?? (def.id === oobPlayerTankType ? oobPlayerCamouflage ?? undefined : undefined));

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

  return (
    <div className="depot select-none">
      <div className="depot__stage" ref={canvasContainerRef}>
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
        <h1 className="depot__name">{def.displayName}</h1>
        <p className="depot__hint">Drag to turn the tank. Point at a plate to read its armour.</p>
        {hoveredPlate && <PlateTooltip plate={hoveredPlate} />}
      </div>

      <aside className="depot__sheet">
        <p className="depot__description">{def.description}</p>

        <DataPlate
          title={def.displayName}
          subtitle={vehicleSubtitle(def)}
          rows={vehicleRows(def)}
          footer={<>Side {def.armor.side} mm, rear {def.armor.rear} mm, turret {def.armor.turret} mm</>}
        />

        {def.camouflage.length > 1 && (
          <fieldset className="depot__field">
            <legend>Paint</legend>
            <div className="paint-card">
              {def.camouflage.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={scheme.id === option.id}
                  onClick={() => setSchemeByTank((current) => ({ ...current, [def.id]: option.id }))}
                >
                  <PaintChip scheme={option} />
                  <span>{option.name}</span>
                  <small>{option.period}{option.zimmerit ? ', Zimmerit' : ''}</small>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="depot__field">
          <legend>Battlefield</legend>
          <div className="map-size">
            {(['medium', 'large'] as MapSize[]).map((size) => (
              <button key={size} type="button" aria-pressed={mapSize === size} onClick={() => setMapSize(size)}>
                {MAP_SIZE_VALUES[size] / 1000} km
              </button>
            ))}
          </div>
        </fieldset>

        <button type="button" className="command-button depot__confirm" onClick={handleConfirm}>
          Take the {def.displayName}
        </button>
      </aside>

      <nav className="depot__catalogue" aria-label="Vehicles">
        {nations.map((nation) => (
          <div key={nation} className="depot__nation">
            <span>{nation}</span>
            <div>
              {allTanks.filter((t) => t.nationality === nation).map((t) => (
                <button key={t.id} type="button" aria-pressed={t.id === def.id} onClick={() => setSelectedId(t.id)}>
                  {t.displayName}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
