import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';
import { computeAccelFromHpWeight } from '../config';

// ============================================================
// PANZER III — Panzerkampfwagen III Ausf. J/L medium tank
// Real dimensions: 5.56m long × 2.90m wide × 2.50m tall
// Track width: 380mm, track gauge (center-to-center): ~2.38m
// ============================================================

const Pz3Hull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Superstructure Block — ends at front plate, rear reaches rear plate */}
      <Box args={[2.9, 1.1, 5.0]} position={[0, 0.75, -0.35]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Front Hull — between tracks, fits inside glacis envelope */}
      <Box args={[2.0, 0.50, 1.2]} position={[0, 0.45, 2.05]} castShadow receiveShadow>{mat}</Box>

      {/* Hull Front Plate — vertical, set back under roof overhang */}
      <Box args={[2.0, 0.45, 0.15]} position={[0, 1.10, 2.15]} castShadow receiveShadow>{mat}</Box>

      {/* Hull Front Roof — horizontal step from front plate forward to glacis */}
      <Box args={[2.0, 0.12, 0.45]} position={[0, 0.86, 2.35]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis (\) — angled down-forward from front roof */}
      <Box args={[2.0, 0.47, 0.15]} position={[0, 0.62, 2.75]} rotation={[-0.56, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis (/) — belly tuck, angled back-down */}
      <Box args={[2.0, 0.39, 0.15]} position={[0, 0.28, 2.73]} rotation={[0.88, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck — flat rear */}
      <Box args={[2.9, 0.18, 2.0]} position={[0, 1.28, -1.8]} rotation={[-0.04, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate */}
      <Box args={[2.9, 1.05, 0.12]} position={[0, 0.73, -2.85]} castShadow receiveShadow>{mat}</Box>

      {/* Side armor — thin plates */}
      <Box args={[0.12, 1.0, 5.4]} position={[1.50, 0.80, -0.05]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.12, 1.0, 5.4]} position={[-1.50, 0.80, -0.05]} castShadow receiveShadow>{mat}</Box>

      {/* Spaced armor (Schürzen — late model Ausf. L) */}
      <Box args={[0.04, 0.7, 4.5]} position={[1.55, 0.78, -0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.85} metalness={0.2} />
      </Box>
      <Box args={[0.04, 0.7, 4.5]} position={[-1.55, 0.78, -0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.85} metalness={0.2} />
      </Box>

      {/* Engine Grille */}
      <Box args={[1.6, 0.04, 0.9]} position={[0, 1.38, -1.8]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Exhaust — single muffler on left */}
      <Cylinder args={[0.07, 0.07, 0.9]} position={[-1.15, 1.15, -2.4]} rotation={[0.05, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights — on vertical front plate */}
      <Box args={[0.15, 0.12, 0.15]} position={[0.8, 1.10, 2.24]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.15, 0.12, 0.15]} position={[-0.8, 1.10, 2.24]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Hull MG (ball mount) — on upper glacis */}
      <Cylinder args={[0.07, 0.07, 0.12]} position={[-0.75, 0.70, 2.65]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Driver's visor (right front) — on front plate */}
      <Box args={[0.3, 0.1, 0.06]} position={[0.6, 1.10, 2.24]} castShadow receiveShadow>{darkMat}</Box>

      {/* Tow hooks — on lower glacis nose */}
      <Box args={[0.1, 0.06, 0.12]} position={[0.7, 0.22, 2.85]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.1, 0.06, 0.12]} position={[-0.7, 0.22, 2.85]} castShadow receiveShadow>{darkMat}</Box>

      {/* Storage box on rear */}
      <Box args={[1.4, 0.3, 0.25]} position={[0, 1.10, -2.95]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} roughness={0.9} />
      </Box>
    </group>
  );
};

const Pz3Tracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 1.19;  // track gauge center-to-center ~2.38m
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // 6 road wheels per side — torsion bar suspension (Panzer III signature)
  const roadWheels = [];
  for (let i = 0; i < 6; i++) {
    const z = 2.2 - i * 0.84;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.26, z]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.24, 0.24, 0.35, 12]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.15, 0.15, 0.37, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  // 3 return rollers on top
  const returnRollers = [];
  for (let i = 0; i < 3; i++) {
    const z = 1.4 - i * 1.3;
    returnRollers.push(
      <group key={`rr-${i}`} position={[xPos, 0.6, z]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.08, 0.08, 0.32, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Track Belt — 380mm width */}
      <Box args={[0.38, 0.04, 5.3]} position={[xPos, 0.56, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.38, 0.04, 4.4]} position={[xPos, 0.0, -0.1]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.38, 0.04, 0.9]} position={[xPos, 0.3, 2.4]} rotation={[0.55, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.38, 0.04, 0.9]} position={[xPos, 0.3, -2.55]} rotation={[-0.7, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>

      {/* Drive Sprocket (Front) */}
      <group position={[xPos, 0.38, 2.65]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.26, 0.26, 0.36, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {/* Idler Wheel (Rear) */}
      <group position={[xPos, 0.38, -2.65]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.24, 0.24, 0.36, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {roadWheels}
      {returnRollers}
    </group>
  );
};

const Pz3Turret = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} />;

  return (
    <group>
      {/* Turret Base — compact hexagonal-ish shape (Pz III's distinctive turret) */}
      <Box args={[1.7, 0.78, 2.2]} position={[0, 0.39, -0.1]} castShadow receiveShadow>{mat}</Box>

      {/* Front face — angled cheeks */}
      <Box args={[1.3, 0.73, 0.9]} position={[0, 0.39, 0.9]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.5, 0.68, 0.7]} position={[-0.7, 0.39, 0.6]} rotation={[0, -0.35, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.5, 0.68, 0.7]} position={[0.7, 0.39, 0.6]} rotation={[0, 0.35, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Turret Bustle — short */}
      <Box args={[1.7, 0.68, 0.7]} position={[0, 0.39, -1.5]} castShadow receiveShadow>{mat}</Box>

      {/* Commander's Cupola — raised for correct overall height */}
      <Cylinder args={[0.32, 0.32, 0.25, 12]} position={[0.38, 0.92, -0.4]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.27, 0.27, 0.06, 12]} position={[0.38, 1.08, -0.4]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Loader's Hatch */}
      <Cylinder args={[0.22, 0.22, 0.04, 10]} position={[-0.38, 0.80, -0.4]} castShadow receiveShadow>{mat}</Cylinder>

      {/* Turret ventilator */}
      <Cylinder args={[0.08, 0.08, 0.06, 8]} position={[0, 0.80, 0.2]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Antenna — single */}
      <Cylinder args={[0.01, 0.012, 1.8]} position={[-0.7, 1.5, -1.2]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Turret bin (rear) */}
      <Box args={[1.3, 0.35, 0.25]} position={[0, 0.35, -1.95]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} wireframe={true} />
      </Box>
    </group>
  );
};

const Pz3Gun = ({ destroyedColor, destroyed }: TankGunProps) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;

  return (
    <group>
      {/* Mantlet — internal type, smaller */}
      <Box args={[0.4, 0.32, 0.4]} position={[0, 0, 0.05]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />
      </Box>

      {/* Main Barrel — 50mm KwK 39 L/60 (thinner, shorter than 88mm) */}
      <Cylinder args={[0.035, 0.05, 2.0]} position={[0, 0, 1.0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>

      {/* Muzzle brake — single baffle */}
      <Cylinder args={[0.065, 0.065, 0.18]} position={[0, 0, 2.0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
      <Box args={[0.15, 0.04, 0.15]} position={[0, 0, 2.0]} castShadow receiveShadow>
        {darkMat}
      </Box>

      {/* Coaxial MG */}
      <Cylinder args={[0.012, 0.012, 0.6]} position={[0.12, -0.06, 0.6]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
    </group>
  );
};

// ============================================================
// Armor Plates — matched to new geometry dimensions
// ============================================================

function makePz3Plates(): ArmorPlate[] {
  return [
    { name: 'Hull Front Plate', zone: 'hull', halfExtents: [1.0, 0.225, 0.075], position: [0, 1.10, 2.15], rotation: [0, 0, 0], armorThickness: 50, parent: 'hull' },
    { name: 'Hull Front Roof', zone: 'hull', halfExtents: [1.0, 0.06, 0.225], position: [0, 0.86, 2.35], rotation: [0, 0, 0], armorThickness: 15, parent: 'hull' },
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [1.0, 0.235, 0.075], position: [0, 0.62, 2.75], rotation: [-0.56, 0, 0], armorThickness: 50, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [1.0, 0.195, 0.075], position: [0, 0.28, 2.73], rotation: [0.88, 0, 0], armorThickness: 50, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.06, 0.50, 2.7], position: [-1.50, 0.80, -0.05], rotation: [0, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.06, 0.50, 2.7], position: [1.50, 0.80, -0.05], rotation: [0, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.45, 0.525, 0.06], position: [0, 0.73, -2.85], rotation: [0, 0, 0], armorThickness: 20, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.45, 0.08, 1.2], position: [0, 1.30, 0.0], rotation: [0, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.45, 0.08, 1.0], position: [0, 1.28, -1.8], rotation: [-0.04, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Side Skirt Left', zone: 'hull', halfExtents: [0.4, 0.35, 2.25], position: [-1.55, 0.78, -0.1], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Side Skirt Right', zone: 'hull', halfExtents: [0.4, 0.35, 2.25], position: [1.55, 0.78, -0.1], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Turret Front', zone: 'turret', halfExtents: [0.65, 0.365, 0.08], position: [0, 0.39, 1.35], rotation: [0, 0, 0], armorThickness: 57, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.25, 0.34, 0.35], position: [-0.70, 0.39, 0.6], rotation: [0, -0.35, 0], armorThickness: 57, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.25, 0.34, 0.35], position: [0.70, 0.39, 0.6], rotation: [0, 0.35, 0], armorThickness: 57, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.08, 0.39, 1.1], position: [-0.85, 0.39, -0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.08, 0.39, 1.1], position: [0.85, 0.39, -0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Bustle', zone: 'turret', halfExtents: [0.85, 0.34, 0.35], position: [0, 0.39, -1.5], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [0.85, 0.08, 1.1], position: [0, 0.78, -0.1], rotation: [0, 0, 0], armorThickness: 10, parent: 'turret' },
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.2, 0.16, 0.2], position: [0, 0, 0.05], rotation: [0, 0, 0], armorThickness: 50, parent: 'gunGroup' },
    { name: 'Track Left', zone: 'track', halfExtents: [0.22, 0.30, 2.7], position: [-1.19, 0.26, 0], rotation: [0, 0, 0], armorThickness: 15, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.22, 0.30, 2.7], position: [1.19, 0.26, 0], rotation: [0, 0, 0], armorThickness: 15, isTrack: 'right', parent: 'hull' },
  ];
}

// ============================================================
// Definition
// ============================================================

export const panzer3Def: TankDefinition = {
  id: 'panzer3',
  displayName: 'Panzer III',
  description: 'Germany\'s workhorse medium tank of the early war. Fast and agile with a rapid-firing 50mm gun, but lightly armored. Best used to flank heavier opponents rather than face them head-on.',
  nationality: 'Germany',
  year: 1939,
  health: 200,
  trackHealth: 80,
  armor: { front: 50, side: 30, rear: 20, turret: 57 },
  color: '#4d4f53',  // Dunkelgrau (RAL 7021)
  horsepower: 300,    // Maybach HL 120 TRM
  weight: 22.3,       // tonnes
  maxSpeed: 10,       // 40 km/h road, ~36 km/h game
  maxReverseSpeed: 3,
  acceleration: computeAccelFromHpWeight(300, 22.3),
  deceleration: 9,
  trackWidth: 2.38,
  turnRateLimit: 0.55,
  rotationalInertia: 3.0,
  turretSpeed: 0.15,
  gunSpeed: 0.12,
  turretOffset: [0, 1.35, 0.25],
  gunPivotOffset: [0, 0.4, 1.5],
  muzzleDistance: 2.5,
  broadPhaseRadius: 5.0,
  caliber: 50,
  reloadTime: 3000,
  weapons: {
    AP:  { penetration: 96,  velocity: 835,  damage: 180, drop: 0.15, dispersion: 0.0025 },
    APC: { penetration: 130, velocity: 1130, damage: 120, drop: 0.1, dispersion: 0.002 },
    HE:  { penetration: 20,  velocity: 835,  damage: 350, drop: 0.35, dispersion: 0.003 },
  },
  plates: makePz3Plates(),
  HullComponent: Pz3Hull,
  TracksComponent: Pz3Tracks,
  TurretComponent: Pz3Turret,
  GunComponent: Pz3Gun,
};
