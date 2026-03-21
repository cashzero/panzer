import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';

// ============================================================
// PANZER II — Panzerkampfwagen II Ausf. F light tank
// Hull scaled: ~2.3m wide, ~3.2m long, ~0.8m hull height
// ============================================================

const Pz2Hull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Central Block — compact, smaller than Panzer III */}
      <Box args={[2.3, 0.8, 3.2]} position={[0, 0.6, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis — moderate slope */}
      <Box args={[2.3, 0.15, 1.0]} position={[0, 0.82, 1.5]} rotation={[0.35, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis */}
      <Box args={[2.3, 0.15, 0.6]} position={[0, 0.2, 1.7]} rotation={[-0.2, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck — flat rear */}
      <Box args={[2.3, 0.15, 1.4]} position={[0, 0.98, -1.2]} rotation={[-0.03, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate */}
      <Box args={[2.3, 0.75, 0.1]} position={[0, 0.58, -1.9]} castShadow receiveShadow>{mat}</Box>

      {/* Side armor */}
      <Box args={[0.1, 0.7, 3.4]} position={[1.2, 0.65, -0.05]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.1, 0.7, 3.4]} position={[-1.2, 0.65, -0.05]} castShadow receiveShadow>{mat}</Box>

      {/* Track guards / mudguards */}
      <Box args={[0.35, 0.05, 3.4]} position={[1.35, 0.98, -0.05]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.35, 0.05, 3.4]} position={[-1.35, 0.98, -0.05]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Grille */}
      <Box args={[1.2, 0.04, 0.6]} position={[0, 1.05, -1.2]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Exhaust pipes — twin on left */}
      <Cylinder args={[0.05, 0.05, 0.7]} position={[-1.0, 0.9, -1.6]} rotation={[0.05, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.05, 0.05, 0.7]} position={[-0.8, 0.9, -1.6]} rotation={[0.05, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights — small */}
      <Box args={[0.12, 0.1, 0.12]} position={[0.85, 0.82, 1.75]} rotation={[0.35, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.12, 0.1, 0.12]} position={[-0.85, 0.82, 1.75]} rotation={[0.35, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Driver's visor */}
      <Box args={[0.25, 0.08, 0.05]} position={[0.45, 0.82, 1.78]} castShadow receiveShadow>{darkMat}</Box>

      {/* Tow hooks */}
      <Box args={[0.08, 0.05, 0.1]} position={[0.8, 0.2, 1.8]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.08, 0.05, 0.1]} position={[-0.8, 0.2, 1.8]} castShadow receiveShadow>{darkMat}</Box>

      {/* Storage box on rear */}
      <Box args={[1.0, 0.25, 0.2]} position={[0, 0.85, -2.0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} roughness={0.9} />
      </Box>
    </group>
  );
};

const Pz2Tracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 1.45;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // 5 road wheels per side — leaf-spring suspension (Panzer II signature)
  const roadWheels = [];
  for (let i = 0; i < 5; i++) {
    const z = 1.3 - i * 0.6;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.24, z]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.22, 0.22, 0.38, 12]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.13, 0.13, 0.4, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  // 2 return rollers on top
  const returnRollers = [];
  for (let i = 0; i < 2; i++) {
    const z = 0.8 - i * 1.0;
    returnRollers.push(
      <group key={`rr-${i}`} position={[xPos, 0.52, z]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.07, 0.07, 0.34, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Track Belt */}
      <Box args={[0.45, 0.04, 3.6]} position={[xPos, 0.48, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.45, 0.04, 3.0]} position={[xPos, 0.0, -0.1]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.45, 0.04, 0.7]} position={[xPos, 0.25, 1.65]} rotation={[0.6, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.45, 0.04, 0.6]} position={[xPos, 0.25, -1.8]} rotation={[-0.7, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>

      {/* Drive Sprocket (Front) */}
      <group position={[xPos, 0.34, 1.85]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.22, 0.22, 0.4, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {/* Idler Wheel (Rear) */}
      <group position={[xPos, 0.34, -1.85]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.2, 0.2, 0.4, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {roadWheels}
      {returnRollers}
    </group>
  );
};

const Pz2Turret = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} />;

  return (
    <group>
      {/* Turret Base — small hexagonal shape */}
      <Box args={[1.2, 0.5, 1.5]} position={[0, 0.25, -0.05]} castShadow receiveShadow>{mat}</Box>

      {/* Front face — angled cheeks */}
      <Box args={[0.9, 0.45, 0.6]} position={[0, 0.25, 0.6]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.4, 0.4, 0.5]} position={[-0.5, 0.25, 0.4]} rotation={[0, -0.3, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.4, 0.4, 0.5]} position={[0.5, 0.25, 0.4]} rotation={[0, 0.3, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Turret Bustle — short */}
      <Box args={[1.2, 0.4, 0.4]} position={[0, 0.25, -0.95]} castShadow receiveShadow>{mat}</Box>

      {/* Simple hatch on top (no cupola on Panzer II) */}
      <Cylinder args={[0.2, 0.2, 0.04, 10]} position={[0.2, 0.52, -0.1]} castShadow receiveShadow>{mat}</Cylinder>
      <Box args={[0.06, 0.02, 0.06]} position={[0.2, 0.55, -0.1]} castShadow receiveShadow>{darkMat}</Box>

      {/* Turret ventilator */}
      <Cylinder args={[0.06, 0.06, 0.05, 8]} position={[-0.15, 0.52, 0.1]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Antenna */}
      <Cylinder args={[0.008, 0.01, 1.5]} position={[-0.5, 1.2, -0.7]} castShadow receiveShadow>{darkMat}</Cylinder>
    </group>
  );
};

const Pz2Gun = ({ destroyedColor, destroyed }: TankGunProps) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;

  return (
    <group>
      {/* Mantlet — small rectangular */}
      <Box args={[0.3, 0.25, 0.3]} position={[0, 0, 0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />
      </Box>

      {/* Main Barrel — 20mm KwK 30 (thin autocannon barrel) */}
      <Cylinder args={[0.025, 0.035, 1.6]} position={[0, 0, 0.8]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>

      {/* Barrel jacket / cooling sleeve */}
      <Cylinder args={[0.04, 0.04, 0.5]} position={[0, 0, 0.35]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>

      {/* Coaxial MG (7.92mm MG 34) */}
      <Cylinder args={[0.01, 0.01, 0.5]} position={[0.1, -0.05, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
    </group>
  );
};

// ============================================================
// Armor Plates — light tank, thin armor
// ============================================================

function makePz2Plates(): ArmorPlate[] {
  return [
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [1.1, 0.08, 0.6], position: [0, 0.82, 1.5], rotation: [0.35, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [1.1, 0.08, 0.4], position: [0, 0.2, 1.7], rotation: [-0.2, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.05, 0.4, 1.6], position: [-1.15, 0.6, 0], rotation: [0, 0, 0], armorThickness: 15, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.05, 0.4, 1.6], position: [1.15, 0.6, 0], rotation: [0, 0, 0], armorThickness: 15, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.1, 0.38, 0.05], position: [0, 0.58, -1.9], rotation: [0, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.1, 0.06, 0.7], position: [0, 1.0, -0.2], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.1, 0.06, 0.7], position: [0, 0.98, -1.2], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Turret Front', zone: 'turret', halfExtents: [0.6, 0.25, 0.06], position: [0, 0.25, 0.7], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.28, 0.22, 0.4], position: [-0.42, 0.25, 0.4], rotation: [0, -0.3, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.28, 0.22, 0.4], position: [0.42, 0.25, 0.4], rotation: [0, 0.3, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.06, 0.25, 0.75], position: [-0.6, 0.25, -0.05], rotation: [0, 0, 0], armorThickness: 15, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.06, 0.25, 0.75], position: [0.6, 0.25, -0.05], rotation: [0, 0, 0], armorThickness: 15, parent: 'turret' },
    { name: 'Turret Bustle', zone: 'turret', halfExtents: [0.6, 0.2, 0.2], position: [0, 0.25, -0.95], rotation: [0, 0, 0], armorThickness: 15, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [0.6, 0.06, 0.75], position: [0, 0.5, -0.05], rotation: [0, 0, 0], armorThickness: 5, parent: 'turret' },
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.22, 0.18, 0.22], position: [0, 0, 0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'gunGroup' },
    { name: 'Track Left', zone: 'track', halfExtents: [0.25, 0.25, 1.9], position: [-1.45, 0.24, 0], rotation: [0, 0, 0], armorThickness: 10, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.25, 0.25, 1.9], position: [1.45, 0.24, 0], rotation: [0, 0, 0], armorThickness: 10, isTrack: 'right', parent: 'hull' },
  ];
}

// ============================================================
// Definition
// ============================================================

export const panzer2Def: TankDefinition = {
  id: 'panzer2',
  displayName: 'Panzer II',
  description: 'Germany\'s light reconnaissance tank armed with a rapid-firing 20mm autocannon. Extremely fast and agile but paper-thin armor. Fires in 5-round bursts — deadly up close, but struggles to penetrate heavier armor at range.',
  nationality: 'Germany',
  year: 1936,
  health: 200,
  trackHealth: 50,
  armor: { front: 30, side: 15, rear: 10, turret: 30 },
  color: '#7a7a5a',
  maxSpeed: 16,
  maxReverseSpeed: 7,
  acceleration: 9,
  deceleration: 12,
  trackWidth: 2.1,
  turretSpeed: 0.2,
  gunSpeed: 0.15,
  turretOffset: [0, 1.0, 0.15],
  gunPivotOffset: [0, 0.3, 1.1],
  muzzleDistance: 2.0,
  broadPhaseRadius: 3.5,
  caliber: 20,
  reloadTime: 2500,
  burstCount: 5,
  burstInterval: 125,
  weapons: {
    AP: { penetration: 46, velocity: 280, damage: 40, drop: 0.12, dispersion: 0.012 },
  },
  plates: makePz2Plates(),
  HullComponent: Pz2Hull,
  TracksComponent: Pz2Tracks,
  TurretComponent: Pz2Turret,
  GunComponent: Pz2Gun,
};
