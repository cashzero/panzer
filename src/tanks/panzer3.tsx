import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';

// ============================================================
// PANZER III — Panzerkampfwagen III Ausf. J/L medium tank
// Smaller, lighter than Tiger. 50mm KwK 39 gun. Torsion bar suspension.
// ============================================================

const Pz3Hull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Central Block — compact, lower than Sherman, narrower than Tiger */}
      <Box args={[2.4, 0.65, 3.2]} position={[0, 0.52, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis — moderate slope */}
      <Box args={[2.4, 0.18, 1.2]} position={[0, 0.65, 1.6]} rotation={[0.4, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis */}
      <Box args={[2.4, 0.18, 0.8]} position={[0, 0.2, 1.8]} rotation={[-0.25, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck — flat rear */}
      <Box args={[2.4, 0.18, 1.5]} position={[0, 0.82, -1.2]} rotation={[-0.04, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate */}
      <Box args={[2.4, 0.6, 0.12]} position={[0, 0.5, -1.9]} castShadow receiveShadow>{mat}</Box>

      {/* Side armor — thin plates */}
      <Box args={[0.12, 0.55, 3.6]} position={[1.3, 0.58, -0.05]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.12, 0.55, 3.6]} position={[-1.3, 0.58, -0.05]} castShadow receiveShadow>{mat}</Box>

      {/* Spaced armor (Schürzen — late model Ausf. L) */}
      <Box args={[0.04, 0.4, 3.2]} position={[1.65, 0.55, -0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.85} metalness={0.2} />
      </Box>
      <Box args={[0.04, 0.4, 3.2]} position={[-1.65, 0.55, -0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.85} metalness={0.2} />
      </Box>

      {/* Engine Grille */}
      <Box args={[1.4, 0.04, 0.7]} position={[0, 0.92, -1.2]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Exhaust — single muffler on left */}
      <Cylinder args={[0.07, 0.07, 0.9]} position={[-1.1, 0.75, -1.6]} rotation={[0.05, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights */}
      <Box args={[0.15, 0.12, 0.15]} position={[0.9, 0.65, 1.85]} rotation={[0.4, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.15, 0.12, 0.15]} position={[-0.9, 0.65, 1.85]} rotation={[0.4, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Hull MG (ball mount) */}
      <Cylinder args={[0.07, 0.07, 0.12]} position={[-0.6, 0.5, 1.9]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Driver's visor (right front) */}
      <Box args={[0.3, 0.1, 0.06]} position={[0.5, 0.7, 1.85]} castShadow receiveShadow>{darkMat}</Box>

      {/* Tow hooks */}
      <Box args={[0.1, 0.06, 0.12]} position={[0.8, 0.22, 1.9]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.1, 0.06, 0.12]} position={[-0.8, 0.22, 1.9]} castShadow receiveShadow>{darkMat}</Box>

      {/* Storage box on rear */}
      <Box args={[1.2, 0.3, 0.25]} position={[0, 0.7, -2.0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} roughness={0.9} />
      </Box>
    </group>
  );
};

const Pz3Tracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 1.55;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // 6 road wheels per side — torsion bar suspension (Panzer III signature)
  const roadWheels = [];
  for (let i = 0; i < 6; i++) {
    const z = 1.4 - i * 0.56;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.26, z]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.24, 0.24, 0.45, 12]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.15, 0.15, 0.47, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  // 3 return rollers on top
  const returnRollers = [];
  for (let i = 0; i < 3; i++) {
    const z = 0.9 - i * 0.8;
    returnRollers.push(
      <group key={`rr-${i}`} position={[xPos, 0.6, z]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.08, 0.08, 0.4, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Track Belt — narrower */}
      <Box args={[0.55, 0.04, 3.8]} position={[xPos, 0.56, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.55, 0.04, 3.0]} position={[xPos, 0.0, -0.1]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.55, 0.04, 0.8]} position={[xPos, 0.3, 1.7]} rotation={[0.65, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.55, 0.04, 0.7]} position={[xPos, 0.3, -1.8]} rotation={[-0.8, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>

      {/* Drive Sprocket (Front) */}
      <group position={[xPos, 0.38, 1.9]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.26, 0.26, 0.48, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {/* Idler Wheel (Rear) */}
      <group position={[xPos, 0.38, -1.9]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.24, 0.24, 0.48, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
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
      <Box args={[1.6, 0.65, 2.0]} position={[0, 0.32, -0.1]} castShadow receiveShadow>{mat}</Box>

      {/* Front face — angled cheeks */}
      <Box args={[1.2, 0.6, 0.8]} position={[0, 0.32, 0.8]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.5, 0.55, 0.7]} position={[-0.65, 0.32, 0.55]} rotation={[0, -0.35, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.5, 0.55, 0.7]} position={[0.65, 0.32, 0.55]} rotation={[0, 0.35, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Turret Bustle — short */}
      <Box args={[1.6, 0.55, 0.6]} position={[0, 0.32, -1.3]} castShadow receiveShadow>{mat}</Box>

      {/* Commander's Cupola — small */}
      <Cylinder args={[0.3, 0.3, 0.18, 12]} position={[0.35, 0.72, -0.4]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.25, 0.25, 0.05, 12]} position={[0.35, 0.83, -0.4]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Loader's Hatch */}
      <Cylinder args={[0.22, 0.22, 0.04, 10]} position={[-0.35, 0.67, -0.4]} castShadow receiveShadow>{mat}</Cylinder>

      {/* Turret ventilator */}
      <Cylinder args={[0.08, 0.08, 0.06, 8]} position={[0, 0.68, 0.2]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Antenna — single */}
      <Cylinder args={[0.01, 0.012, 1.8]} position={[-0.65, 1.4, -1.0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Turret bin (rear) */}
      <Box args={[1.2, 0.35, 0.25]} position={[0, 0.28, -1.7]} castShadow receiveShadow>
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
      <Box args={[0.4, 0.32, 0.4]} position={[0, 0, 0.12]} castShadow receiveShadow>
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
// Armor Plates — thinner than Tiger, smaller hull
// ============================================================

function makePz3Plates(): ArmorPlate[] {
  return [
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [1.2, 0.09, 0.7], position: [0, 0.65, 1.6], rotation: [0.4, 0, 0], armorThickness: 50, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [1.2, 0.09, 0.5], position: [0, 0.2, 1.8], rotation: [-0.25, 0, 0], armorThickness: 50, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.06, 0.32, 1.6], position: [-1.2, 0.52, 0], rotation: [0, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.06, 0.32, 1.6], position: [1.2, 0.52, 0], rotation: [0, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.2, 0.3, 0.06], position: [0, 0.5, -1.9], rotation: [0, 0, 0], armorThickness: 20, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.2, 0.08, 0.7], position: [0, 0.85, -0.3], rotation: [0, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.2, 0.08, 0.7], position: [0, 0.82, -1.2], rotation: [0, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Side Skirt Left', zone: 'hull', halfExtents: [0.35, 0.25, 2.0], position: [-1.55, 0.55, 0], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Side Skirt Right', zone: 'hull', halfExtents: [0.35, 0.25, 2.0], position: [1.55, 0.55, 0], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Turret Front', zone: 'turret', halfExtents: [0.8, 0.32, 0.08], position: [0, 0.32, 0.85], rotation: [0, 0, 0], armorThickness: 57, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.35, 0.3, 0.5], position: [-0.55, 0.32, 0.55], rotation: [0, -0.35, 0], armorThickness: 57, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.35, 0.3, 0.5], position: [0.55, 0.32, 0.55], rotation: [0, 0.35, 0], armorThickness: 57, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.08, 0.32, 1.0], position: [-0.8, 0.32, -0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.08, 0.32, 1.0], position: [0.8, 0.32, -0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Bustle', zone: 'turret', halfExtents: [0.8, 0.28, 0.3], position: [0, 0.32, -1.3], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [0.8, 0.08, 1.0], position: [0, 0.65, -0.1], rotation: [0, 0, 0], armorThickness: 10, parent: 'turret' },
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.3, 0.25, 0.3], position: [0, 0, 0.12], rotation: [0, 0, 0], armorThickness: 50, parent: 'gunGroup' },
    { name: 'Track Left', zone: 'track', halfExtents: [0.3, 0.3, 2.0], position: [-1.55, 0.26, 0], rotation: [0, 0, 0], armorThickness: 15, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.3, 0.3, 2.0], position: [1.55, 0.26, 0], rotation: [0, 0, 0], armorThickness: 15, isTrack: 'right', parent: 'hull' },
  ];
}

// ============================================================
// Definition
// ============================================================

export const panzer3Def: TankDefinition = {
  id: 'panzer3',
  displayName: 'Panzer III',
  health: 350,
  trackHealth: 80,
  armor: { front: 50, side: 30, rear: 20, turret: 57 },
  color: '#8a8463',  // field gray-tan
  turretOffset: [0, 0.85, 0.2],
  gunPivotOffset: [0, 0.4, 1.5],
  muzzleDistance: 2.5,
  broadPhaseRadius: 3.8,
  plates: makePz3Plates(),
  HullComponent: Pz3Hull,
  TracksComponent: Pz3Tracks,
  TurretComponent: Pz3Turret,
  GunComponent: Pz3Gun,
};
