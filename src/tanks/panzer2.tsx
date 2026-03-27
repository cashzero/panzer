import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';
import { computeAccelFromHpWeight } from '../config';

// ============================================================
// PANZER II — Panzerkampfwagen II Ausf. F light tank
// Real dimensions: 4.81m long × 2.22m wide × 1.99m tall
// Track width: 300mm, track gauge (center-to-center): ~1.92m
// ============================================================

const Pz2Hull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Superstructure Block — ends at front plate, rear reaches rear plate */}
      <Box args={[2.22, 1.05, 4.0]} position={[0, 0.72, -0.30]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Front Hull — between tracks, fits inside glacis envelope */}
      <Box args={[1.65, 0.40, 0.7]} position={[0, 0.40, 1.45]} castShadow receiveShadow>{mat}</Box>

      {/* Hull Front Plate (|) — vertical, 35mm, set back under roof overhang */}
      <Box args={[1.65, 0.45, 0.12]} position={[0, 1.02, 1.70]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis (\) — angled down-forward from front plate bottom */}
      <Box args={[1.65, 0.45, 0.12]} position={[0, 0.55, 1.90]} rotation={[-0.50, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis (/) — belly tuck */}
      <Box args={[1.65, 0.30, 0.12]} position={[0, 0.24, 1.92]} rotation={[0.80, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck — flat rear */}
      <Box args={[2.22, 0.15, 1.8]} position={[0, 1.22, -1.5]} rotation={[-0.03, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate */}
      <Box args={[2.22, 1.0, 0.10]} position={[0, 0.70, -2.30]} castShadow receiveShadow>{mat}</Box>

      {/* Side armor */}
      <Box args={[0.10, 0.95, 4.3]} position={[1.11, 0.72, -0.05]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.10, 0.95, 4.3]} position={[-1.11, 0.72, -0.05]} castShadow receiveShadow>{mat}</Box>

      {/* Track guards / mudguards */}
      <Box args={[0.285, 0.05, 4.3]} position={[1.11, 1.22, -0.05]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.285, 0.05, 4.3]} position={[-1.11, 1.22, -0.05]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Grille */}
      <Box args={[1.2, 0.04, 0.6]} position={[0, 1.30, -1.5]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Exhaust pipes — twin on left */}
      <Cylinder args={[0.05, 0.05, 0.7]} position={[-0.85, 1.05, -2.0]} rotation={[0.05, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.05, 0.05, 0.7]} position={[-0.65, 1.05, -2.0]} rotation={[0.05, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights — on front plate */}
      <Box args={[0.12, 0.1, 0.12]} position={[0.65, 1.00, 1.78]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.12, 0.1, 0.12]} position={[-0.65, 1.00, 1.78]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Driver's visor — on front plate */}
      <Box args={[0.25, 0.08, 0.05]} position={[0.4, 1.00, 1.78]} castShadow receiveShadow>{darkMat}</Box>

      {/* Tow hooks — at glacis nose */}
      <Box args={[0.08, 0.05, 0.1]} position={[0.6, 0.20, 2.03]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.08, 0.05, 0.1]} position={[-0.6, 0.20, 2.03]} castShadow receiveShadow>{darkMat}</Box>

      {/* Storage box on rear */}
      <Box args={[1.0, 0.25, 0.2]} position={[0, 1.00, -2.40]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} roughness={0.9} />
      </Box>
    </group>
  );
};

const Pz2Tracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 0.97;  // track gauge center-to-center ~1.94m (belt 285mm)
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // 5 road wheels per side — leaf-spring suspension (Panzer II signature)
  const roadWheels = [];
  for (let i = 0; i < 5; i++) {
    const z = 1.7 - i * 0.85;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.24, z]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.22, 0.22, 0.28, 12]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.13, 0.13, 0.30, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  // 2 return rollers on top
  const returnRollers = [];
  for (let i = 0; i < 2; i++) {
    const z = 0.7 - i * 1.2;
    returnRollers.push(
      <group key={`rr-${i}`} position={[xPos, 0.52, z]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.07, 0.07, 0.26, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Track Belt — 300mm width */}
      <Box args={[0.285, 0.04, 4.2]} position={[xPos, 0.48, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.285, 0.04, 3.5]} position={[xPos, 0.0, -0.1]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.285, 0.04, 0.7]} position={[xPos, 0.25, 1.9]} rotation={[0.55, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.285, 0.04, 0.6]} position={[xPos, 0.25, -2.1]} rotation={[-0.7, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>

      {/* Drive Sprocket (Front) */}
      <group position={[xPos, 0.34, 2.1]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.22, 0.22, 0.28, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {/* Idler Wheel (Rear) */}
      <group position={[xPos, 0.34, -2.1]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.20, 0.20, 0.28, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
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
      <Box args={[1.2, 0.55, 1.5]} position={[0, 0.275, -0.05]} castShadow receiveShadow>{mat}</Box>

      {/* Front face — angled cheeks */}
      <Box args={[0.9, 0.50, 0.6]} position={[0, 0.275, 0.6]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.4, 0.45, 0.5]} position={[-0.5, 0.275, 0.4]} rotation={[0, -0.3, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.4, 0.45, 0.5]} position={[0.5, 0.275, 0.4]} rotation={[0, 0.3, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Simple hatch on top (no cupola on Panzer II) */}
      <Cylinder args={[0.2, 0.2, 0.04, 10]} position={[0.2, 0.57, -0.1]} castShadow receiveShadow>{mat}</Cylinder>
      <Box args={[0.06, 0.02, 0.06]} position={[0.2, 0.60, -0.1]} castShadow receiveShadow>{darkMat}</Box>

      {/* Turret ventilator */}
      <Cylinder args={[0.06, 0.06, 0.05, 8]} position={[-0.15, 0.57, 0.1]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Antenna */}
      <Cylinder args={[0.008, 0.01, 1.5]} position={[-0.5, 1.3, -0.7]} castShadow receiveShadow>{darkMat}</Cylinder>
    </group>
  );
};

const Pz2Gun = ({ destroyedColor, destroyed }: TankGunProps) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;

  return (
    <group>
      {/* Mantlet — small rectangular */}
      <Box args={[0.3, 0.25, 0.3]} position={[0, 0, -0.05]} castShadow receiveShadow>
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
    { name: 'Hull Front Plate', zone: 'hull', halfExtents: [0.825, 0.225, 0.06], position: [0, 1.02, 1.70], rotation: [0, 0, 0], armorThickness: 35, parent: 'hull' },
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [0.825, 0.225, 0.06], position: [0, 0.55, 1.90], rotation: [-0.50, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [0.825, 0.15, 0.06], position: [0, 0.24, 1.92], rotation: [0.80, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.05, 0.475, 2.15], position: [-1.11, 0.72, -0.05], rotation: [0, 0, 0], armorThickness: 15, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.05, 0.475, 2.15], position: [1.11, 0.72, -0.05], rotation: [0, 0, 0], armorThickness: 15, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.11, 0.50, 0.05], position: [0, 0.70, -2.30], rotation: [0, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.11, 0.06, 1.0], position: [0, 1.245, 0.0], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.11, 0.06, 0.9], position: [0, 1.22, -1.5], rotation: [-0.03, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Turret Front', zone: 'turret', halfExtents: [0.45, 0.25, 0.06], position: [0, 0.275, 0.9], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.2, 0.225, 0.25], position: [-0.5, 0.275, 0.4], rotation: [0, -0.3, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.2, 0.225, 0.25], position: [0.5, 0.275, 0.4], rotation: [0, 0.3, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.06, 0.275, 0.75], position: [-0.6, 0.275, -0.05], rotation: [0, 0, 0], armorThickness: 15, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.06, 0.275, 0.75], position: [0.6, 0.275, -0.05], rotation: [0, 0, 0], armorThickness: 15, parent: 'turret' },
    { name: 'Turret Rear', zone: 'turret', halfExtents: [0.6, 0.275, 0.06], position: [0, 0.275, -0.8], rotation: [0, 0, 0], armorThickness: 15, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [0.6, 0.06, 0.75], position: [0, 0.55, -0.05], rotation: [0, 0, 0], armorThickness: 5, parent: 'turret' },
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.15, 0.125, 0.15], position: [0, 0, -0.05], rotation: [0, 0, 0], armorThickness: 30, parent: 'gunGroup' },
    { name: 'Track Left', zone: 'track', halfExtents: [0.16, 0.25, 2.1], position: [-0.97, 0.24, 0], rotation: [0, 0, 0], armorThickness: 10, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.16, 0.25, 2.1], position: [0.97, 0.24, 0], rotation: [0, 0, 0], armorThickness: 10, isTrack: 'right', parent: 'hull' },
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
  health: 150,
  trackHealth: 50,
  armor: { front: 30, side: 15, rear: 10, turret: 30 },
  color: '#4d4f53',  // Dunkelgrau (RAL 7021)
  horsepower: 140,    // Maybach HL 62 TR
  weight: 8.9,        // tonnes
  maxSpeed: 10,       // 40 km/h road, ~36 km/h game
  maxReverseSpeed: 3,
  acceleration: computeAccelFromHpWeight(140, 8.9),
  deceleration: 11,
  trackWidth: 1.94,
  turnRateLimit: 0.65,
  rotationalInertia: 4.0,
  turretSpeed: 0.2,
  gunSpeed: 0.15,
  turretOffset: [0, 1.30, 0.15],
  gunPivotOffset: [0, 0.3, 1.1],
  muzzleDistance: 2.0,
  broadPhaseRadius: 4.2,
  caliber: 20,
  reloadTime: 2500,
  burstCount: 5,
  burstInterval: 125,
  weapons: {
    AP: { penetration: 20, velocity: 780, damage: 25, drop: 0.12, dispersion: 0.005 },
  },
  plates: makePz2Plates(),
  HullComponent: Pz2Hull,
  TracksComponent: Pz2Tracks,
  TurretComponent: Pz2Turret,
  GunComponent: Pz2Gun,
};
