import { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';

// ============================================================
// M4A2(76)W — Sherman with T23 turret and 76mm M1A1 gun
// Real dimensions: 5.89m long × 2.62m wide × 2.97m tall
// Hull nearly identical to M4A2 (welded, GM 6046 twin diesel)
// T23 turret: wider, more angular, fits 76mm gun
// Late-war Allied medium tank, Lend-Lease to USSR & Free French
// ============================================================

const ShermanA276Hull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  // Side plate polygon — same hull profile as M4 Sherman
  const sideShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(2.95, 0.75);   // rear bottom (above tracks)
    s.lineTo(2.95, 1.50);   // rear top
    s.lineTo(1.50, 1.70);   // engine deck transition
    s.lineTo(-2.00, 1.70);  // hull roof front
    s.lineTo(-3.15, 0.55);  // glacis front
    s.lineTo(-2.50, 0.75);  // front bottom (above tracks)
    s.closePath();
    return s;
  }, []);
  const sideExtrudeSettings = useMemo(() => ({ depth: 0.15, bevelEnabled: false }), []);

  return (
    <group>
      {/* Central Block — sits above tracks */}
      <Box args={[2.62, 0.95, 4.5]} position={[0, 1.225, 0]} castShadow receiveShadow>{mat}</Box>
      {/* Lower Central Body — between tracks, narrower */}
      <Box args={[1.78, 0.60, 4.5]} position={[0, 0.45, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis — upper portion, full tank width */}
      <Box args={[2.62, 0.15, 1.2]} position={[0, 1.296, 2.564]} rotation={[0.82, 0, 0]} castShadow receiveShadow>{mat}</Box>
      {/* Upper Glacis — bottom strip, narrower (between tracks) */}
      <Box args={[1.78, 0.15, 0.4]} position={[0, 0.711, 3.109]} rotation={[0.82, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis — slopes backward under hull */}
      <Box args={[1.78, 0.15, 0.48]} position={[0, 0.383, 3.092]} rotation={[2.27, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck (rear raised section) */}
      <Box args={[2.62, 0.28, 2.5]} position={[0, 1.65, -2.0]} rotation={[-0.05, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate — slightly angled */}
      <Box args={[2.62, 1.2, 0.4]} position={[0, 0.85, -2.95]} rotation={[-0.15, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Side armor — polygonal profile following glacis angle */}
      <mesh position={[1.235, 0, 0]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[sideShape, sideExtrudeSettings]} />
        {mat}
      </mesh>
      <mesh position={[-1.235, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[sideShape, sideExtrudeSettings]} />
        {mat}
      </mesh>

      {/* Hull MG port (right front — Sherman signature) */}
      <Cylinder args={[0.08, 0.08, 0.25]} position={[0.7, 1.2, 3.3]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Box args={[0.22, 0.25, 0.1]} position={[0.7, 1.2, 3.2]} castShadow receiveShadow>{darkMat}</Box>

      {/* Engine Grilles */}
      <Box args={[1.5, 0.05, 1.1]} position={[0, 1.8, -2.0]} rotation={[-0.05, 0, 0]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Twin exhaust — M4A2 diesel variant has twin exhausts (vs single on M4A1) */}
      <Cylinder args={[0.07, 0.07, 1.0]} position={[1.1, 1.45, -2.7]} rotation={[0.1, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.07, 0.07, 1.0]} position={[-1.1, 1.45, -2.7]} rotation={[0.1, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.09, 0.09, 0.12]} position={[1.1, 1.45, -3.2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.09, 0.09, 0.12]} position={[-1.1, 1.45, -3.2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights */}
      <Box args={[0.18, 0.13, 0.18]} position={[1.1, 1.35, 3.0]} rotation={[0.82, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.18, 0.13, 0.18]} position={[-1.1, 1.35, 3.0]} rotation={[0.82, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Front tow hooks */}
      <Box args={[0.12, 0.06, 0.15]} position={[0.9, 0.35, 3.3]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.12, 0.06, 0.15]} position={[-0.9, 0.35, 3.3]} castShadow receiveShadow>{darkMat}</Box>

      {/* Spare track links on glacis — field mod, common on (76) variants */}
      <Box args={[1.6, 0.06, 0.22]} position={[0, 1.15, 2.85]} rotation={[0.82, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#1a1a1a'} roughness={0.95} />
      </Box>
      <Box args={[1.6, 0.06, 0.22]} position={[0, 0.95, 3.0]} rotation={[0.82, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#1a1a1a'} roughness={0.95} />
      </Box>

      {/* Rear stowage rack */}
      <Box args={[2.0, 0.25, 0.3]} position={[0, 1.55, -3.15]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} roughness={0.9} />
      </Box>
    </group>
  );
};

const ShermanA276Tracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 1.1;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // VVSS bogies — 3 paired wheel assemblies per side (same as M4 Sherman)
  const bogies = [];
  for (let i = 0; i < 3; i++) {
    const z = 1.6 - i * 1.6;
    bogies.push(
      <group key={`bogie-${i}`} position={[xPos, 0, z]}>
        <group position={[0, 0.3, 0.22]} rotation={[0, 0, Math.PI / 2]}>
          <Cylinder args={[0.28, 0.28, 0.5, 14]} castShadow receiveShadow>{rubberMat}</Cylinder>
          <Cylinder args={[0.18, 0.18, 0.52, 10]} castShadow receiveShadow>{steelMat}</Cylinder>
        </group>
        <group position={[0, 0.3, -0.22]} rotation={[0, 0, Math.PI / 2]}>
          <Cylinder args={[0.28, 0.28, 0.5, 14]} castShadow receiveShadow>{rubberMat}</Cylinder>
          <Cylinder args={[0.18, 0.18, 0.52, 10]} castShadow receiveShadow>{steelMat}</Cylinder>
        </group>
        <Box args={[0.28, 0.12, 0.6]} position={[0, 0.5, 0]} castShadow receiveShadow>{steelMat}</Box>
      </group>
    );
  }

  const returnWheels = [];
  for (let i = 0; i < 3; i++) {
    const z = 1.2 - i * 1.2;
    returnWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.75, z]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.12, 0.12, 0.45, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Top track run */}
      <Box args={[0.42, 0.05, 5.0]} position={[xPos, 0.75, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      {/* Bottom track run */}
      <Box args={[0.42, 0.05, 4.2]} position={[xPos, 0.0, -0.1]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      {/* Front angled track */}
      <Box args={[0.42, 0.05, 1.0]} position={[xPos, 0.25, 2.55]} rotation={[-0.65, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      {/* Rear angled track */}
      <Box args={[0.42, 0.05, 0.9]} position={[xPos, 0.25, -2.55]} rotation={[0.7, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>

      {/* Rear idler */}
      <group position={[xPos, 0.5, -2.8]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.32, 0.32, 0.5, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
      {/* Front drive sprocket */}
      <group position={[xPos, 0.5, 2.8]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.28, 0.28, 0.5, 14]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {bogies}
      {returnWheels}
    </group>
  );
};

const ShermanA276Turret = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} />;

  return (
    <group>
      {/* T23 turret body — wider, more angular than 75mm turret */}
      <Box args={[1.85, 0.80, 1.6]} position={[0, 0.40, 0.0]} castShadow receiveShadow>{mat}</Box>
      {/* T23 front face — taller, flatter */}
      <Box args={[1.5, 0.80, 0.7]} position={[0, 0.40, 0.85]} castShadow receiveShadow>{mat}</Box>
      {/* Cheek armor — angled flats (T23 signature, less rounded than M4 75mm turret) */}
      <Box args={[0.6, 0.75, 0.65]} position={[-0.68, 0.40, 0.68]} rotation={[0, -0.40, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.6, 0.75, 0.65]} position={[0.68, 0.40, 0.68]} rotation={[0, 0.40, 0]} castShadow receiveShadow>{mat}</Box>
      {/* Rear bustle — extended for 76mm breech */}
      <Box args={[1.85, 0.70, 0.65]} position={[0, 0.40, -1.05]} castShadow receiveShadow>{mat}</Box>
      {/* Turret basket overhang (rear) */}
      <Box args={[1.5, 0.55, 0.35]} position={[0, 0.35, -1.55]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} wireframe={true} />
      </Box>

      {/* Commander's cupola — vision ring */}
      <Cylinder args={[0.38, 0.38, 0.28, 16]} position={[0.42, 0.90, -0.15]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.32, 0.32, 0.07, 16]} position={[0.42, 1.07, -0.15]} castShadow receiveShadow>{darkMat}</Cylinder>
      {/* Loader's hatch */}
      <Cylinder args={[0.26, 0.26, 0.05, 12]} position={[-0.42, 0.82, -0.15]} castShadow receiveShadow>{mat}</Cylinder>

      {/* Ventilator dome */}
      <Cylinder args={[0.10, 0.10, 0.06, 8]} position={[0, 0.82, 0.35]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* AA .50 cal mount on commander's cupola */}
      <group position={[0.42, 1.15, -0.15]}>
        <Cylinder args={[0.03, 0.03, 0.45]} position={[0, 0.12, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Box args={[0.08, 0.10, 0.55]} position={[0, 0.38, 0.18]} castShadow receiveShadow>{darkMat}</Box>
        <Cylinder args={[0.02, 0.02, 0.75]} position={[0, 0.40, 0.30]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>

      {/* Antenna */}
      <Cylinder args={[0.01, 0.015, 2.2]} position={[-0.72, 1.6, -0.9]} castShadow receiveShadow>{darkMat}</Cylinder>
      {/* Side grab handles */}
      <Box args={[0.04, 0.04, 0.4]} position={[0.96, 0.52, -0.05]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.04, 0.04, 0.4]} position={[-0.96, 0.52, -0.05]} castShadow receiveShadow>{darkMat}</Box>

      {/* Pistol port plugs (T23 turret feature — one per side) */}
      <Cylinder args={[0.04, 0.04, 0.06]} position={[0.94, 0.40, -0.5]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.04, 0.04, 0.06]} position={[-0.94, 0.40, -0.5]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>{darkMat}</Cylinder>
    </group>
  );
};

const ShermanA276Gun = ({ destroyedColor, destroyed }: TankGunProps) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;

  return (
    <group>
      {/* Mantlet — T23 style, wider rectangular with rounded edges */}
      <Box args={[0.60, 0.45, 0.50]} position={[0, 0, 0.15]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />
      </Box>

      {/* 76mm M1A1 barrel — longer than 75mm, tapers slightly */}
      <Cylinder args={[0.055, 0.07, 3.2]} position={[0, 0, 1.6]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>

      {/* Barrel reinforcement collar (near mantlet) */}
      <Cylinder args={[0.085, 0.085, 0.25]} position={[0, 0, 0.55]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>

      {/* Muzzle brake — M1A1C / M1A2 distinctive dual-baffle brake */}
      <Cylinder args={[0.09, 0.09, 0.22]} position={[0, 0, 3.2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
      {/* Brake baffles */}
      <Box args={[0.22, 0.05, 0.18]} position={[0, 0, 3.12]} castShadow receiveShadow>
        {darkMat}
      </Box>
      <Box args={[0.22, 0.05, 0.08]} position={[0, 0, 3.28]} castShadow receiveShadow>
        {darkMat}
      </Box>

      {/* Muzzle tip */}
      <Cylinder args={[0.065, 0.065, 0.06]} position={[0, 0, 3.34]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>

      {/* Coaxial MG */}
      <Cylinder args={[0.015, 0.015, 0.9]} position={[0.16, -0.08, 0.85]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
    </group>
  );
};

// ============================================================
// Armor Plates
// ============================================================

function makeShermanA276Plates(): ArmorPlate[] {
  return [
    // Hull — same as M4 Sherman (welded hull)
    { name: 'Hull Upper Glacis Top', zone: 'hull', halfExtents: [1.31, 0.1, 0.6], position: [0, 1.296, 2.564], rotation: [0.82, 0, 0], armorThickness: 120, parent: 'hull' },
    { name: 'Hull Upper Glacis Bottom', zone: 'hull', halfExtents: [0.89, 0.1, 0.2], position: [0, 0.711, 3.109], rotation: [0.82, 0, 0], armorThickness: 120, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [0.89, 0.1, 0.24], position: [0, 0.383, 3.092], rotation: [2.27, 0, 0], armorThickness: 80, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.1, 0.6, 2.25], position: [-1.31, 1.0, -0.5], rotation: [0, 0, 0], armorThickness: 38, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.1, 0.6, 2.25], position: [1.31, 1.0, -0.5], rotation: [0, 0, 0], armorThickness: 38, parent: 'hull' },
    { name: 'Hull Side Front Left', zone: 'hull', halfExtents: [0.1, 0.1, 0.8], position: [-1.31, 1.15, 2.55], rotation: [0.82, 0, 0], armorThickness: 38, parent: 'hull' },
    { name: 'Hull Side Front Right', zone: 'hull', halfExtents: [0.1, 0.1, 0.8], position: [1.31, 1.15, 2.55], rotation: [0.82, 0, 0], armorThickness: 38, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.31, 0.6, 0.2], position: [0, 0.85, -2.95], rotation: [-0.15, 0, 0], armorThickness: 38, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.31, 0.1, 1.25], position: [0, 1.7, 0.0], rotation: [0, 0, 0], armorThickness: 19, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.31, 0.1, 1.25], position: [0, 1.65, -2.0], rotation: [-0.05, 0, 0], armorThickness: 19, parent: 'hull' },

    // Turret — T23 turret, larger than M4 75mm turret
    { name: 'Turret Front', zone: 'turret', halfExtents: [0.75, 0.40, 0.1], position: [0, 0.40, 1.2], rotation: [0, 0, 0], armorThickness: 89, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.30, 0.375, 0.325], position: [-0.68, 0.40, 0.68], rotation: [0, -0.40, 0], armorThickness: 89, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.30, 0.375, 0.325], position: [0.68, 0.40, 0.68], rotation: [0, 0.40, 0], armorThickness: 89, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.1, 0.40, 0.8], position: [-0.925, 0.40, 0.0], rotation: [0, 0, 0], armorThickness: 63, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.1, 0.40, 0.8], position: [0.925, 0.40, 0.0], rotation: [0, 0, 0], armorThickness: 63, parent: 'turret' },
    { name: 'Turret Bustle', zone: 'turret', halfExtents: [0.925, 0.35, 0.325], position: [0, 0.40, -1.05], rotation: [0, 0, 0], armorThickness: 63, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [0.925, 0.1, 0.8], position: [0, 0.80, 0.0], rotation: [0, 0, 0], armorThickness: 25, parent: 'turret' },

    // Gun
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.30, 0.225, 0.25], position: [0, 0, 0.15], rotation: [0, 0, 0], armorThickness: 89, parent: 'gunGroup' },

    // Tracks
    { name: 'Track Left', zone: 'track', halfExtents: [0.25, 0.35, 3.0], position: [-1.1, 0.3, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.25, 0.35, 3.0], position: [1.1, 0.3, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'right', parent: 'hull' },
  ];
}

// ============================================================
// Definition
// ============================================================

export const shermanA276Def: TankDefinition = {
  id: 'sherman_a2_76',
  displayName: 'M4A2(76)',
  description: 'The up-gunned Sherman with the powerful 76mm M1 gun in a T23 turret. Better anti-armor capability than the 75mm variant at the cost of slightly slower reload. Diesel-powered and widely used by Soviet and Free French forces under Lend-Lease.',
  nationality: 'USA',
  year: 1944,
  health: 260,
  trackHealth: 150,
  armor: { front: 100, side: 38, rear: 38, turret: 89 },
  color: '#4a5d23',
  maxSpeed: 11,
  maxReverseSpeed: 4.5,
  acceleration: 5.5,
  deceleration: 10,
  trackWidth: 2.62,
  turnRateLimit: 0.48,
  rotationalInertia: 2.3,
  turretSpeed: 0.09,
  gunSpeed: 0.10,
  turretOffset: [0, 1.7, 0.15],
  gunPivotOffset: [0, 0.42, 1.3],
  muzzleDistance: 3.6,
  broadPhaseRadius: 5.2,
  caliber: 76,
  reloadTime: 5000,
  weapons: {
    AP:  { penetration: 128, velocity: 792, damage: 380, drop: 0.08, dispersion: 0.0015 },
    APC: { penetration: 109, velocity: 792, damage: 480, drop: 0.08, dispersion: 0.0015 },
    HE:  { penetration: 25,  velocity: 792, damage: 480, drop: 0.22, dispersion: 0.002 },
  },
  plates: makeShermanA276Plates(),
  HullComponent: ShermanA276Hull,
  TracksComponent: ShermanA276Tracks,
  TurretComponent: ShermanA276Turret,
  GunComponent: ShermanA276Gun,
};
