import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';

// ============================================================
// SHERMAN — M4 Sherman-inspired Allied tank
// Hull scaled: ~3.2m wide, ~4.0m long, ~1.2m hull height
// ============================================================

const ShermanHull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Central Block — taller than Tiger */}
      <Box args={[3.2, 1.2, 4.0]} position={[0, 0.8, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis — steep ~47° slope (Sherman's characteristic front) */}
      <Box args={[3.2, 0.2, 2.2]} position={[0, 1.15, 2.0]} rotation={[0.82, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis — curved belly */}
      <Box args={[3.2, 0.2, 1.0]} position={[0, 0.25, 2.3]} rotation={[-0.3, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck (rear raised section) */}
      <Box args={[3.2, 0.25, 2.0]} position={[0, 1.35, -1.6]} rotation={[-0.05, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate — slightly angled */}
      <Box args={[3.2, 1.0, 0.4]} position={[0, 0.7, -2.35]} rotation={[-0.15, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Thin side armor (no Schürzen — Allied style) */}
      <Box args={[0.15, 1.0, 4.6]} position={[1.75, 0.85, -0.1]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.15, 1.0, 4.6]} position={[-1.75, 0.85, -0.1]} castShadow receiveShadow>{mat}</Box>

      {/* Hull MG port (right front — Sherman signature) */}
      <Cylinder args={[0.08, 0.08, 0.25]} position={[0.85, 1.0, 2.6]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Box args={[0.25, 0.25, 0.1]} position={[0.85, 1.0, 2.5]} castShadow receiveShadow>{darkMat}</Box>

      {/* Engine Grilles */}
      <Box args={[1.8, 0.05, 0.9]} position={[0, 1.48, -1.6]} rotation={[-0.05, 0, 0]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Exhaust (single side — Sherman style) */}
      <Cylinder args={[0.08, 0.08, 1.2]} position={[1.6, 1.2, -2.1]} rotation={[0.1, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights */}
      <Box args={[0.18, 0.13, 0.18]} position={[1.35, 1.1, 2.4]} rotation={[0.82, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.18, 0.13, 0.18]} position={[-1.35, 1.1, 2.4]} rotation={[0.82, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Front tow hooks */}
      <Box args={[0.12, 0.06, 0.15]} position={[1.1, 0.3, 2.6]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.12, 0.06, 0.15]} position={[-1.1, 0.3, 2.6]} castShadow receiveShadow>{darkMat}</Box>
    </group>
  );
};

const ShermanTracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 2.3;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // VVSS bogies — 3 paired wheel assemblies per side (Sherman signature)
  const bogies = [];
  for (let i = 0; i < 3; i++) {
    const z = 1.6 - i * 1.4;
    bogies.push(
      <group key={`bogie-${i}`} position={[xPos, 0, z]}>
        <group position={[0, 0.3, 0.2]} rotation={[0, 0, Math.PI/2]}>
          <Cylinder args={[0.28, 0.28, 0.55, 14]} castShadow receiveShadow>{rubberMat}</Cylinder>
          <Cylinder args={[0.18, 0.18, 0.57, 10]} castShadow receiveShadow>{steelMat}</Cylinder>
        </group>
        <group position={[0, 0.3, -0.2]} rotation={[0, 0, Math.PI/2]}>
          <Cylinder args={[0.28, 0.28, 0.55, 14]} castShadow receiveShadow>{rubberMat}</Cylinder>
          <Cylinder args={[0.18, 0.18, 0.57, 10]} castShadow receiveShadow>{steelMat}</Cylinder>
        </group>
        <Box args={[0.3, 0.12, 0.6]} position={[0, 0.5, 0]} castShadow receiveShadow>{steelMat}</Box>
      </group>
    );
  }

  const returnWheels = [];
  for (let i = 0; i < 3; i++) {
    const z = 1.2 - i * 1.15;
    returnWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.7, z]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.12, 0.12, 0.5, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      <Box args={[0.7, 0.05, 4.8]} position={[xPos, 0.65, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.7, 0.05, 4.0]} position={[xPos, 0.0, -0.1]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.7, 0.05, 1.1]} position={[xPos, 0.35, 2.2]} rotation={[0.7, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.7, 0.05, 1.0]} position={[xPos, 0.35, -2.35]} rotation={[-0.9, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>

      <group position={[xPos, 0.45, -2.35]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.32, 0.32, 0.55, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
      <group position={[xPos, 0.45, 2.45]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.28, 0.28, 0.55, 14]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {bogies}
      {returnWheels}
    </group>
  );
};

const ShermanTurret = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} />;

  return (
    <group>
      <Box args={[2.0, 0.7, 2.2]} position={[0, 0.35, -0.1]} castShadow receiveShadow>{mat}</Box>
      <Box args={[1.6, 0.7, 1.2]} position={[0, 0.35, 0.9]} rotation={[0, 0, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.8, 0.65, 1.0]} position={[-0.75, 0.35, 0.7]} rotation={[0, -0.45, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.8, 0.65, 1.0]} position={[0.75, 0.35, 0.7]} rotation={[0, 0.45, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[2.0, 0.6, 0.8]} position={[0, 0.35, -1.4]} castShadow receiveShadow>{mat}</Box>

      <Cylinder args={[0.4, 0.4, 0.25, 16]} position={[0.5, 0.8, -0.3]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.35, 0.35, 0.06, 16]} position={[0.5, 0.95, -0.3]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.28, 0.28, 0.05, 12]} position={[-0.5, 0.72, -0.3]} castShadow receiveShadow>{mat}</Cylinder>

      <group position={[0.5, 1.05, -0.3]}>
        <Cylinder args={[0.03, 0.03, 0.5]} position={[0, 0.15, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Box args={[0.08, 0.12, 0.5]} position={[0, 0.4, 0.15]} castShadow receiveShadow>{darkMat}</Box>
        <Cylinder args={[0.02, 0.02, 0.7]} position={[0, 0.42, 0.3]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>

      <Cylinder args={[0.01, 0.015, 2.2]} position={[-0.8, 1.6, -1.2]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Box args={[0.04, 0.04, 0.5]} position={[1.05, 0.5, -0.1]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.04, 0.04, 0.5]} position={[-1.05, 0.5, -0.1]} castShadow receiveShadow>{darkMat}</Box>
    </group>
  );
};

const ShermanGun = ({ destroyedColor, destroyed }: TankGunProps) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;

  return (
    <group>
      {/* Mantlet */}
      <Box args={[0.5, 0.4, 0.5]} position={[0, 0, 0.15]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />
      </Box>
      {/* 76mm barrel */}
      <Cylinder args={[0.06, 0.08, 2.4]} position={[0, 0, 1.2]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>
      {/* Muzzle tip */}
      <Cylinder args={[0.09, 0.09, 0.15]} position={[0, 0, 2.4]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
      {/* Coaxial MG */}
      <Cylinder args={[0.015, 0.015, 0.8]} position={[0.15, -0.08, 0.8]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
    </group>
  );
};

// ============================================================
// Armor Plates
// ============================================================

function makeShermanPlates(): ArmorPlate[] {
  return [
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [1.6, 0.1, 1.0], position: [0, 1.05, 2.0], rotation: [0.35, 0, 0], armorThickness: 120, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [1.6, 0.1, 0.6], position: [0, 0.25, 2.4], rotation: [-0.4, 0, 0], armorThickness: 80, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.1, 0.55, 2.0], position: [-1.6, 0.75, 0], rotation: [0, 0, 0], armorThickness: 50, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.1, 0.55, 2.0], position: [1.6, 0.75, 0], rotation: [0, 0, 0], armorThickness: 50, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.6, 0.55, 0.25], position: [0, 0.65, -2.5], rotation: [0, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.6, 0.1, 0.9], position: [0, 1.3, -0.4], rotation: [0, 0, 0], armorThickness: 15, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.6, 0.1, 0.9], position: [0, 1.25, -1.8], rotation: [0, 0, 0], armorThickness: 15, parent: 'hull' },
    { name: 'Side Skirt Left', zone: 'hull', halfExtents: [0.5, 0.45, 2.5], position: [-2.2, 0.85, 0], rotation: [0, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Side Skirt Right', zone: 'hull', halfExtents: [0.5, 0.45, 2.5], position: [2.2, 0.85, 0], rotation: [0, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Turret Front', zone: 'turret', halfExtents: [1.1, 0.4, 0.1], position: [0, 0.4, 1.05], rotation: [0, 0, 0], armorThickness: 120, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.55, 0.4, 0.75], position: [-0.55, 0.4, 1.2], rotation: [0, -0.5, 0], armorThickness: 140, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.55, 0.4, 0.75], position: [0.55, 0.4, 1.2], rotation: [0, 0.5, 0], armorThickness: 140, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.1, 0.4, 1.25], position: [-1.1, 0.4, -0.2], rotation: [0, 0, 0], armorThickness: 60, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.1, 0.4, 1.25], position: [1.1, 0.4, -0.2], rotation: [0, 0, 0], armorThickness: 60, parent: 'turret' },
    { name: 'Turret Bustle', zone: 'turret', halfExtents: [1.1, 0.35, 0.6], position: [0, 0.45, -1.8], rotation: [0, 0, 0], armorThickness: 40, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [1.1, 0.1, 1.25], position: [0, 0.8, -0.2], rotation: [0, 0, 0], armorThickness: 20, parent: 'turret' },
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.4, 0.3, 0.4], position: [0, 0, 0.2], rotation: [0, 0, 0], armorThickness: 220, parent: 'gunGroup' },
    { name: 'Track Left', zone: 'track', halfExtents: [0.4, 0.35, 2.5], position: [-2.3, 0.3, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.4, 0.35, 2.5], position: [2.3, 0.3, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'right', parent: 'hull' },
  ];
}

// ============================================================
// Definition
// ============================================================

export const shermanDef: TankDefinition = {
  id: 'sherman',
  displayName: 'M4 Sherman',
  description: 'The backbone of Allied armored forces. Well-rounded with good mobility, reliable mechanics, and a versatile 75mm gun. What it lacks in raw firepower it makes up for in speed and rate of fire.',
  nationality: 'USA',
  year: 1942,
  health: 1000,
  trackHealth: 150,
  armor: { front: 100, side: 50, rear: 30, turret: 120 },
  color: '#4a5d23',
  maxSpeed: 12,
  maxReverseSpeed: 5,
  acceleration: 6,
  deceleration: 10,
  trackWidth: 3.2,
  turretSpeed: 0.1,
  gunSpeed: 0.1,
  turretOffset: [0, 1.4, 0.2],
  gunPivotOffset: [0, 0.4, 1.5],
  muzzleDistance: 3,
  broadPhaseRadius: 5.2,
  caliber: 75,
  reloadTime: 4000,
  weapons: {
    AP: { penetration: 150, velocity: 300, damage: 200, drop: 0.1, dispersion: 0.005 },
    HE: { penetration: 30, velocity: 200, damage: 400, drop: 0.25, dispersion: 0.006 },
  },
  plates: makeShermanPlates(),
  HullComponent: ShermanHull,
  TracksComponent: ShermanTracks,
  TurretComponent: ShermanTurret,
  GunComponent: ShermanGun,
};
