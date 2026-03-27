import { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';
import { computeAccelFromHpWeight } from '../config';

// ============================================================
// TIGER — Tiger I (Panzerkampfwagen VI Ausf. E)
// Real dimensions: 6.316m long × 3.56m wide × 3.0m tall
// Hull length 6.3m, gun-forward 8.45m
// No Schürzen — Tiger I did not use side skirts
// ============================================================

const TigerHull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Central Block — wide boxy hull, Tiger I signature */}
      <Box args={[3.56, 1.2, 5.4]} position={[0, 1.05, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis — angled back (\), below front plate */}
      <Box args={[3.56, 0.25, 0.7]} position={[0, 0.85, 2.85]} rotation={[0.35, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis — nearly vertical, slight forward tilt at bottom (/) */}
      <Box args={[2.12, 0.5, 0.15]} position={[0, 0.45, 2.95]} rotation={[0.05, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Front plate — thick flat vertical plate (Tiger signature, top of front face) */}
      <Box args={[3.56, 0.45, 0.15]} position={[0, 1.42, 2.7]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck */}
      <Box args={[3.56, 0.2, 2.5]} position={[0, 1.63, -2.1]} rotation={[-0.03, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate — flat, vertical */}
      <Box args={[3.56, 1.2, 0.15]} position={[0, 1.05, -3.15]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Grilles — twin grilles */}
      <Box args={[0.9, 0.05, 1.2]} position={[0.65, 1.74, -2.1]} castShadow receiveShadow>{grilleMat}</Box>
      <Box args={[0.9, 0.05, 1.2]} position={[-0.65, 1.74, -2.1]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Twin Exhaust Pipes (rear) */}
      <Cylinder args={[0.1, 0.1, 0.5]} position={[0.9, 1.45, -3.35]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.1, 0.1, 0.5]} position={[-0.9, 1.45, -3.35]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.12, 0.12, 0.15]} position={[0.9, 1.45, -3.55]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.12, 0.12, 0.15]} position={[-0.9, 1.45, -3.55]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights — recessed into hull */}
      <Box args={[0.2, 0.15, 0.1]} position={[1.5, 1.2, 3.2]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.2, 0.15, 0.1]} position={[-1.5, 1.2, 3.2]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Front hull MG (ball mount — Kugelblende) */}
      <Cylinder args={[0.1, 0.1, 0.15]} position={[-1.0, 1.0, 3.2]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Spare track links on front glacis (field modification) */}
      <Box args={[2.0, 0.08, 0.25]} position={[0, 1.5, 3.0]} rotation={[0.35, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#1a1a1a'} roughness={0.95} />
      </Box>

      {/* Tow cable hooks */}
      <Box args={[0.15, 0.08, 0.2]} position={[1.5, 0.35, 3.2]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.15, 0.08, 0.2]} position={[-1.5, 0.35, 3.2]} castShadow receiveShadow>{darkMat}</Box>
    </group>
  );
};

const TigerTracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 1.42;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // Stadium-shaped track belt (straight top/bottom + semicircles around sprockets)
  const trackGeo = useMemo(() => {
    const cY = 0.35;      // vertical center (matches sprocket/idler center)
    const R = 0.30;       // semicircle radius (matches sprocket/idler radius)
    const halfLen = 3.15; // half distance between sprocket centers
    const band = 0.04;    // track band thickness
    const arcSegs = 16;

    function stadiumPts(r: number, cy: number, hl: number): THREE.Vector2[] {
      const pts: THREE.Vector2[] = [];
      // Top straight (rear to front)
      pts.push(new THREE.Vector2(-hl, cy + r));
      pts.push(new THREE.Vector2(hl, cy + r));
      // Front semicircle (top to bottom, clockwise)
      for (let i = 1; i < arcSegs; i++) {
        const a = Math.PI / 2 - (Math.PI * i) / arcSegs;
        pts.push(new THREE.Vector2(hl + r * Math.cos(a), cy + r * Math.sin(a)));
      }
      // Bottom straight (front to rear)
      pts.push(new THREE.Vector2(hl, cy - r));
      pts.push(new THREE.Vector2(-hl, cy - r));
      // Rear semicircle (bottom to top, clockwise going left)
      for (let i = 1; i < arcSegs; i++) {
        const a = -Math.PI / 2 - (Math.PI * i) / arcSegs;
        pts.push(new THREE.Vector2(-hl + r * Math.cos(a), cy + r * Math.sin(a)));
      }
      return pts;
    }

    const outer = stadiumPts(R, cY, halfLen);
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, outer[0].y);
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i].x, outer[i].y);
    shape.closePath();

    const inner = stadiumPts(R - band, cY, halfLen);
    const hole = new THREE.Path();
    hole.moveTo(inner[0].x, inner[0].y);
    for (let i = 1; i < inner.length; i++) hole.lineTo(inner[i].x, inner[i].y);
    hole.closePath();
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: false });
  }, []);

  // Interleaved road wheels — 8 per side (Tiger I's distinctive overlapping pattern)
  const roadWheels = [];
  for (let i = 0; i < 8; i++) {
    const z = 2.6 - i * 0.743;
    const xOffset = (i % 2 === 0) ? 0.06 : -0.06;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos + xOffset, 0.35, z]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.30, 0.30, 0.55, 12]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.18, 0.18, 0.57, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Elliptical track belt */}
      <mesh
        position={[xPos - 0.36, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        geometry={trackGeo}
        castShadow receiveShadow
      >
        <primitive object={trackMat} attach="material" />
      </mesh>

      {/* Drive sprocket (front) */}
      <group position={[xPos, 0.35, 3.15]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.28, 0.28, 0.55, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
      {/* Idler (rear) */}
      <group position={[xPos, 0.35, -3.15]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.28, 0.28, 0.55, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {roadWheels}
    </group>
  );
};

const TigerTurret = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} />;

  return (
    <group>
      {/* Main turret box */}
      <Box args={[2.2, 0.95, 2.8]} position={[0, 0.48, -0.2]} castShadow receiveShadow>{mat}</Box>
      {/* Turret front face */}
      <Box args={[2.2, 0.95, 0.15]} position={[0, 0.48, 1.2]} castShadow receiveShadow>{mat}</Box>
      {/* Turret bustle (rear) */}
      <Box args={[2.2, 0.85, 0.6]} position={[0, 0.48, -1.9]} castShadow receiveShadow>{mat}</Box>
      {/* Storage basket (rear) */}
      <Box args={[1.8, 0.6, 0.4]} position={[0, 0.4, -2.3]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} wireframe={true} />
      </Box>

      {/* Commander's cupola — tall with vision blocks */}
      <Cylinder args={[0.38, 0.38, 0.35, 16]} position={[0.55, 1.08, -0.5]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.32, 0.32, 0.1, 16]} position={[0.55, 1.28, -0.5]} castShadow receiveShadow>{darkMat}</Cylinder>
      {/* Loader's hatch */}
      <Cylinder args={[0.3, 0.3, 0.05, 12]} position={[-0.55, 0.97, -0.5]} castShadow receiveShadow>{mat}</Cylinder>
      {/* Ventilator */}
      <Cylinder args={[0.12, 0.12, 0.08, 8]} position={[0, 0.98, 0.3]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Smoke Grenade Launchers — NbK 39 */}
      <group position={[-1.15, 0.6, 0.6]} rotation={[0, -Math.PI/4, 0]}>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[-0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>
      <group position={[1.15, 0.6, 0.6]} rotation={[0, Math.PI/4, 0]}>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[-0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>

      {/* Antenna mounts */}
      <Cylinder args={[0.01, 0.018, 2.0]} position={[-0.8, 1.8, -1.5]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.01, 0.018, 2.0]} position={[0.8, 1.8, -1.5]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Zimmerit texture hint */}
      <Box args={[0.03, 0.8, 2.4]} position={[1.12, 0.48, -0.2]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#555759'} roughness={0.95} metalness={0.05} />
      </Box>
      <Box args={[0.03, 0.8, 2.4]} position={[-1.12, 0.48, -0.2]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#555759'} roughness={0.95} metalness={0.05} />
      </Box>
    </group>
  );
};

const TigerGun = ({ destroyedColor, destroyed }: TankGunProps) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;

  return (
    <group>
      {/* Mantlet */}
      <Box args={[0.7, 0.5, 0.6]} position={[0, 0, 0.075]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />
      </Box>
      {/* 88mm barrel */}
      <Cylinder args={[0.07, 0.09, 4.2]} position={[0, 0, 2.1]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>
      {/* Barrel reinforcement */}
      <Cylinder args={[0.11, 0.11, 0.7]} position={[0, 0, 2.8]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>
      {/* Muzzle brake */}
      <Cylinder args={[0.10, 0.10, 0.3]} position={[0, 0, 4.2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
      <Box args={[0.28, 0.06, 0.25]} position={[0, 0, 4.15]} castShadow receiveShadow>
        {darkMat}
      </Box>
      <Box args={[0.28, 0.06, 0.12]} position={[0, 0, 4.3]} castShadow receiveShadow>
        {darkMat}
      </Box>
      {/* Coaxial MG */}
      <Cylinder args={[0.02, 0.02, 0.9]} position={[0.18, -0.08, 0.8]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
    </group>
  );
};

// ============================================================
// Armor Plates
// ============================================================

function makeTigerPlates(): ArmorPlate[] {
  return [
    { name: 'Hull Front Plate', zone: 'hull', halfExtents: [1.78, 0.225, 0.075], position: [0, 1.42, 2.7], rotation: [0, 0, 0], armorThickness: 102, parent: 'hull' },
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [1.78, 0.125, 0.35], position: [0, 0.85, 2.85], rotation: [0.35, 0, 0], armorThickness: 95, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [1.06, 0.25, 0.075], position: [0, 0.45, 2.95], rotation: [0.05, 0, 0], armorThickness: 60, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.1, 0.6, 2.7], position: [-1.78, 1.05, 0], rotation: [0, 0, 0], armorThickness: 80, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.1, 0.6, 2.7], position: [1.78, 1.05, 0], rotation: [0, 0, 0], armorThickness: 80, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.78, 0.6, 0.1], position: [0, 1.05, -3.15], rotation: [0, 0, 0], armorThickness: 80, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.78, 0.1, 1.78], position: [0, 1.65, 0.92], rotation: [0, 0, 0], armorThickness: 12, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.78, 0.1, 1.25], position: [0, 1.63, -2.1], rotation: [-0.03, 0, 0], armorThickness: 12, parent: 'hull' },
    { name: 'Turret Front', zone: 'turret', halfExtents: [1.1, 0.475, 0.1], position: [0, 0.48, 1.275], rotation: [0, 0, 0], armorThickness: 100, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.1, 0.475, 1.4], position: [-1.1, 0.48, -0.2], rotation: [0, 0, 0], armorThickness: 80, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.1, 0.475, 1.4], position: [1.1, 0.48, -0.2], rotation: [0, 0, 0], armorThickness: 80, parent: 'turret' },
    { name: 'Turret Bustle', zone: 'turret', halfExtents: [1.1, 0.425, 0.3], position: [0, 0.48, -1.9], rotation: [0, 0, 0], armorThickness: 80, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [1.1, 0.1, 1.4], position: [0, 0.955, -0.2], rotation: [0, 0, 0], armorThickness: 15, parent: 'turret' },
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.35, 0.25, 0.3], position: [0, 0, 0.075], rotation: [0, 0, 0], armorThickness: 180, parent: 'gunGroup' },
    { name: 'Track Left', zone: 'track', halfExtents: [0.38, 0.35, 3.2], position: [-1.42, 0.3, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.38, 0.35, 3.2], position: [1.42, 0.3, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'right', parent: 'hull' },
  ];
}

// ============================================================
// Definition
// ============================================================

export const tigerDef: TankDefinition = {
  id: 'tiger',
  displayName: 'Tiger I',
  description: 'The feared heavy tank of the Wehrmacht. Its legendary 88mm gun can penetrate almost anything at range, and thick flat armor provides excellent protection. Slow but devastating.',
  nationality: 'Germany',
  year: 1942,
  health: 350,
  trackHealth: 100,
  armor: { front: 102, side: 80, rear: 80, turret: 100 },
  color: '#4d4f53',  // Dunkelgrau (RAL 7021)
  horsepower: 700,    // Maybach HL 230 P45
  weight: 57.0,       // tonnes
  maxSpeed: 11,       // 45.4 km/h road, ~40 km/h game
  maxReverseSpeed: 3,
  acceleration: computeAccelFromHpWeight(700, 57.0),
  deceleration: 7,
  trackWidth: 3.56,
  turnRateLimit: 0.35,
  rotationalInertia: 1.5,
  turretSpeed: 0.06,
  gunSpeed: 0.08,
  turretOffset: [0, 1.65, 0.2],
  gunPivotOffset: [0, 0.45, 1.5],
  muzzleDistance: 4,
  broadPhaseRadius: 5.8,
  caliber: 88,
  reloadTime: 7000,
  weapons: {
    AP:  { penetration: 132, velocity: 773, damage: 550, drop: 0.08, dispersion: 0.0012 },
    APC: { penetration: 120, velocity: 773, damage: 650, drop: 0.08, dispersion: 0.0012 },
    HE:  { penetration: 30,  velocity: 773, damage: 700, drop: 0.2, dispersion: 0.0015 },
  },
  plates: makeTigerPlates(),
  HullComponent: TigerHull,
  TracksComponent: TigerTracks,
  TurretComponent: TigerTurret,
  GunComponent: TigerGun,
};
