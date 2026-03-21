import { useState, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getAllTankDefs } from '../tanks/registry';
import type { TankDefinition } from '../tanks/types';
import { useGameStore } from '../store';

const allTanks = getAllTankDefs();

/* ------------------------------------------------------------------ */
/*  Stat bar — normalised against the best value across all tanks     */
/* ------------------------------------------------------------------ */

function StatBar({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
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
/*  Spinning 3D tank preview                                          */
/* ------------------------------------------------------------------ */

function TankPreview({ def }: { def: TankDefinition }) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_, dt) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.4;
    }
  });

  const { HullComponent, TurretComponent, GunComponent } = def;
  const geoProps = { color: def.color, destroyedColor: '#555', destroyed: false };
  const gunProps = { destroyedColor: '#555', destroyed: false };

  return (
    <group ref={groupRef}>
      <HullComponent {...geoProps} />
      <group position={def.turretOffset}>
        <TurretComponent {...geoProps} />
        <group position={def.gunPivotOffset}>
          <GunComponent {...gunProps} />
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat ranges across all tanks (for bar normalisation)              */
/* ------------------------------------------------------------------ */

const maxHP = Math.max(...allTanks.map((t) => t.health));
const maxArmor = Math.max(...allTanks.map((t) => t.armor.front));
const maxSpeed = Math.max(...allTanks.map((t) => t.maxSpeed));
const maxPen = Math.max(...allTanks.map((t) => t.weapons.AP.penetration));
const maxReload = Math.max(...allTanks.map((t) => t.reloadTime));
const minReload = Math.min(...allTanks.map((t) => t.reloadTime));

/* ------------------------------------------------------------------ */
/*  Main screen                                                       */
/* ------------------------------------------------------------------ */

export function TankSelect() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectPlayerTank = useGameStore((s) => s.selectPlayerTank);
  const def = allTanks[selectedIdx];

  const handleConfirm = () => {
    selectPlayerTank(def.id);
  };

  // Reload "score" inverted so faster reload = longer bar
  const reloadScore = maxReload - def.reloadTime + minReload;

  return (
    <div className="absolute inset-0 bg-black flex flex-col font-mono text-white select-none">
      {/* Header */}
      <div className="text-center pt-6 pb-2">
        <h1 className="text-3xl font-bold tracking-widest" style={{ color: '#8b9a5b' }}>
          SELECT YOUR TANK
        </h1>
        <div className="text-sm text-gray-500 mt-1 tracking-wide">PANZER FRONT</div>
      </div>

      {/* Body: 3D preview left, info right */}
      <div className="flex-1 flex min-h-0">
        {/* 3D Canvas */}
        <div className="flex-1 relative">
          <Canvas
            camera={{ position: [8, 5, 8], fov: 40 }}
            gl={{ antialias: true }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 10, 5]} intensity={1.2} />
            <directionalLight position={[-5, 3, -5]} intensity={0.3} />
            <Suspense fallback={null}>
              <TankPreview key={def.id} def={def} />
            </Suspense>
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              autoRotate={false}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2.5}
            />
            {/* Ground plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
              <planeGeometry args={[30, 30]} />
              <meshStandardMaterial color="#2a2a20" roughness={1} />
            </mesh>
          </Canvas>
        </div>

        {/* Info Panel */}
        <div className="w-96 p-6 flex flex-col gap-4 border-l border-gray-800 overflow-y-auto">
          {/* Tank name + meta */}
          <div>
            <h2 className="text-2xl font-bold" style={{ color: '#c9b458' }}>{def.displayName}</h2>
            <div className="text-sm text-gray-500 mt-1">
              {def.nationality} &middot; {def.year}
            </div>
            <p className="text-sm text-gray-400 mt-3 leading-relaxed">{def.description}</p>
          </div>

          {/* Stat bars */}
          <div className="flex flex-col gap-2 mt-2">
            <StatBar label="Hitpoints" value={def.health} max={maxHP} unit=" HP" />
            <StatBar label="Front Armor" value={def.armor.front} max={maxArmor} unit=" mm" />
            <StatBar label="Speed" value={def.maxSpeed} max={maxSpeed} unit=" m/s" />
            <StatBar label="Penetration" value={def.weapons.AP.penetration} max={maxPen} unit=" mm" />
            <StatBar label="Reload" value={reloadScore} max={maxReload} unit="" />
          </div>

          {/* Armor breakdown */}
          <div className="mt-2 text-xs text-gray-500 flex gap-4">
            <span>Front {def.armor.front}mm</span>
            <span>Side {def.armor.side}mm</span>
            <span>Rear {def.armor.rear}mm</span>
            <span>Turret {def.armor.turret}mm</span>
          </div>
        </div>
      </div>

      {/* Bottom: Tank selector + confirm */}
      <div className="border-t border-gray-800 p-4 flex items-center justify-center gap-6">
        {allTanks.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setSelectedIdx(i)}
            className={`px-5 py-2 border text-sm uppercase tracking-wider transition-all cursor-pointer ${
              i === selectedIdx
                ? 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
                : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
            }`}
          >
            {t.displayName}
          </button>
        ))}
        <button
          onClick={handleConfirm}
          className="ml-8 px-8 py-2 bg-green-900/40 border border-green-700 text-green-400 text-sm uppercase tracking-wider hover:bg-green-800/50 transition-all cursor-pointer font-bold"
        >
          Deploy
        </button>
      </div>
    </div>
  );
}
