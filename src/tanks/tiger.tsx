import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';

// ============================================================
// TIGER — Tiger I-inspired German tank
// Hull scaled to realistic proportions: ~3.6m wide, ~4.4m long, ~1.0m hull height
// ============================================================

const TigerHull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Central Block */}
      <Box args={[3.6, 1.0, 4.4]} position={[0, 0.7, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis — flatter angle (~20°, Tiger's weakness) */}
      <Box args={[3.6, 0.2, 1.6]} position={[0, 1.0, 2.2]} rotation={[0.35, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis — nearly vertical (Tiger characteristic) */}
      <Box args={[3.6, 0.3, 0.8]} position={[0, 0.22, 2.3]} rotation={[-0.15, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Front plate — thick flat plate (Tiger signature, 100mm) */}
      <Box args={[3.6, 0.85, 0.15]} position={[0, 0.7, 2.5]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck */}
      <Box args={[3.6, 0.2, 2.0]} position={[0, 1.18, -1.7]} rotation={[-0.03, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate — flat, vertical */}
      <Box args={[3.6, 1.0, 0.15]} position={[0, 0.7, -2.65]} castShadow receiveShadow>{mat}</Box>

      {/* Schürzen side skirts (Tiger's armor skirts — separate panels with gap) */}
      <Box args={[0.06, 0.85, 5.3]} position={[2.4, 0.8, -0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.8} metalness={0.2} />
      </Box>
      <Box args={[0.06, 0.85, 5.3]} position={[-2.4, 0.8, -0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.8} metalness={0.2} />
      </Box>
      {/* Skirt mounting brackets */}
      <Box args={[0.3, 0.06, 0.15]} position={[2.25, 1.2, 1.8]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.3, 0.06, 0.15]} position={[2.25, 1.2, 0]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.3, 0.06, 0.15]} position={[2.25, 1.2, -1.8]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.3, 0.06, 0.15]} position={[-2.25, 1.2, 1.8]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.3, 0.06, 0.15]} position={[-2.25, 1.2, 0]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.3, 0.06, 0.15]} position={[-2.25, 1.2, -1.8]} castShadow receiveShadow>{darkMat}</Box>

      {/* Engine Grilles — twin grilles */}
      <Box args={[0.9, 0.05, 1.0]} position={[0.65, 1.29, -1.7]} castShadow receiveShadow>{grilleMat}</Box>
      <Box args={[0.9, 0.05, 1.0]} position={[-0.65, 1.29, -1.7]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Twin Exhaust Pipes (rear) */}
      <Cylinder args={[0.1, 0.1, 0.5]} position={[0.9, 1.1, -2.8]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.1, 0.1, 0.5]} position={[-0.9, 1.1, -2.8]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.12, 0.12, 0.15]} position={[0.9, 1.1, -3.05]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.12, 0.12, 0.15]} position={[-0.9, 1.1, -3.05]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights — recessed into hull */}
      <Box args={[0.2, 0.15, 0.1]} position={[1.5, 0.9, 2.55]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.2, 0.15, 0.1]} position={[-1.5, 0.9, 2.55]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Front hull MG (ball mount — Kugelblende) */}
      <Cylinder args={[0.1, 0.1, 0.15]} position={[-1.0, 0.75, 2.55]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Spare track links on front glacis (field modification) */}
      <Box args={[2.0, 0.08, 0.25]} position={[0, 1.15, 2.4]} rotation={[0.35, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#1a1a1a'} roughness={0.95} />
      </Box>

      {/* Tow cable hooks */}
      <Box args={[0.15, 0.08, 0.2]} position={[1.5, 0.3, 2.55]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.15, 0.08, 0.2]} position={[-1.5, 0.3, 2.55]} castShadow receiveShadow>{darkMat}</Box>
    </group>
  );
};

const TigerTracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 2.3;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // Interleaved road wheels — 8 per side (Tiger I's distinctive overlapping pattern)
  const roadWheels = [];
  for (let i = 0; i < 8; i++) {
    const z = 2.1 - i * 0.6;
    const xOffset = (i % 2 === 0) ? 0.08 : -0.08;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos + xOffset, 0.28, z]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.22, 0.22, 0.5, 12]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.14, 0.14, 0.52, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      <Box args={[0.85, 0.05, 5.4]} position={[xPos, 0.62, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.85, 0.05, 4.4]} position={[xPos, 0.0, -0.1]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.85, 0.05, 1.2]} position={[xPos, 0.33, 2.5]} rotation={[0.65, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>
      <Box args={[0.85, 0.05, 1.1]} position={[xPos, 0.33, -2.65]} rotation={[-0.8, 0, 0]} castShadow receiveShadow>
        <primitive object={trackMat} attach="material" />
      </Box>

      <group position={[xPos, 0.42, 2.65]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.3, 0.3, 0.6, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
      <group position={[xPos, 0.42, -2.65]} rotation={[0, 0, Math.PI/2]}>
        <Cylinder args={[0.28, 0.28, 0.6, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
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
      <Box args={[2.2, 0.85, 2.8]} position={[0, 0.42, -0.2]} castShadow receiveShadow>{mat}</Box>
      <Box args={[2.2, 0.85, 0.15]} position={[0, 0.42, 1.2]} castShadow receiveShadow>{mat}</Box>
      <Box args={[2.2, 0.75, 0.6]} position={[0, 0.42, -1.9]} castShadow receiveShadow>{mat}</Box>
      <Box args={[1.8, 0.5, 0.4]} position={[0, 0.35, -2.3]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} wireframe={true} />
      </Box>

      <Cylinder args={[0.38, 0.38, 0.22, 16]} position={[0.55, 0.92, -0.5]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.32, 0.32, 0.08, 16]} position={[0.55, 1.05, -0.5]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.3, 0.3, 0.05, 12]} position={[-0.55, 0.87, -0.5]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.12, 0.12, 0.08, 8]} position={[0, 0.88, 0.3]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Smoke Grenade Launchers — NbK 39 */}
      <group position={[-1.15, 0.55, 0.6]} rotation={[0, -Math.PI/4, 0]}>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[-0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>
      <group position={[1.15, 0.55, 0.6]} rotation={[0, Math.PI/4, 0]}>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.04, 0.04, 0.3]} position={[-0.1, 0, 0]} rotation={[Math.PI/3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>

      <Cylinder args={[0.01, 0.018, 2.0]} position={[-0.8, 1.8, -1.5]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.01, 0.018, 2.0]} position={[0.8, 1.8, -1.5]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Zimmerit texture hint */}
      <Box args={[0.03, 0.7, 2.4]} position={[1.12, 0.42, -0.2]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#a89840'} roughness={0.95} metalness={0.05} />
      </Box>
      <Box args={[0.03, 0.7, 2.4]} position={[-1.12, 0.42, -0.2]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#a89840'} roughness={0.95} metalness={0.05} />
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
      <Box args={[0.7, 0.5, 0.6]} position={[0, 0, 0.2]} castShadow receiveShadow>
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
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [1.7, 0.1, 1.0], position: [0, 1.05, 2.1], rotation: [0.35, 0, 0], armorThickness: 95, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [1.7, 0.1, 0.6], position: [0, 0.25, 2.4], rotation: [-0.4, 0, 0], armorThickness: 60, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.1, 0.55, 2.2], position: [-1.7, 0.75, 0], rotation: [0, 0, 0], armorThickness: 40, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.1, 0.55, 2.2], position: [1.7, 0.75, 0], rotation: [0, 0, 0], armorThickness: 40, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.7, 0.55, 0.25], position: [0, 0.65, -2.55], rotation: [0, 0, 0], armorThickness: 20, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.7, 0.1, 1.0], position: [0, 1.3, -0.4], rotation: [0, 0, 0], armorThickness: 12, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.7, 0.1, 1.0], position: [0, 1.25, -1.8], rotation: [0, 0, 0], armorThickness: 12, parent: 'hull' },
    { name: 'Side Skirt Left', zone: 'hull', halfExtents: [0.5, 0.45, 2.8], position: [-2.3, 0.85, 0], rotation: [0, 0, 0], armorThickness: 8, parent: 'hull' },
    { name: 'Side Skirt Right', zone: 'hull', halfExtents: [0.5, 0.45, 2.8], position: [2.3, 0.85, 0], rotation: [0, 0, 0], armorThickness: 8, parent: 'hull' },
    { name: 'Turret Front', zone: 'turret', halfExtents: [1.1, 0.4, 0.1], position: [0, 0.4, 1.05], rotation: [0, 0, 0], armorThickness: 100, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.55, 0.4, 0.75], position: [-0.55, 0.4, 1.2], rotation: [0, -0.5, 0], armorThickness: 110, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.55, 0.4, 0.75], position: [0.55, 0.4, 1.2], rotation: [0, 0.5, 0], armorThickness: 110, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.1, 0.4, 1.25], position: [-1.1, 0.4, -0.2], rotation: [0, 0, 0], armorThickness: 50, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.1, 0.4, 1.25], position: [1.1, 0.4, -0.2], rotation: [0, 0, 0], armorThickness: 50, parent: 'turret' },
    { name: 'Turret Bustle', zone: 'turret', halfExtents: [1.1, 0.35, 0.6], position: [0, 0.45, -1.8], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [1.1, 0.1, 1.25], position: [0, 0.8, -0.2], rotation: [0, 0, 0], armorThickness: 15, parent: 'turret' },
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.4, 0.3, 0.4], position: [0, 0, 0.2], rotation: [0, 0, 0], armorThickness: 180, parent: 'gunGroup' },
    { name: 'Track Left', zone: 'track', halfExtents: [0.45, 0.35, 2.8], position: [-2.3, 0.3, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.45, 0.35, 2.8], position: [2.3, 0.3, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'right', parent: 'hull' },
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
  health: 500,
  trackHealth: 100,
  armor: { front: 80, side: 40, rear: 20, turret: 100 },
  color: '#b8a04a',
  maxSpeed: 8,
  maxReverseSpeed: 3,
  acceleration: 4,
  deceleration: 8,
  trackWidth: 3.6,
  turretSpeed: 0.06,
  gunSpeed: 0.08,
  turretOffset: [0, 1.2, 0.2],
  gunPivotOffset: [0, 0.4, 1.5],
  muzzleDistance: 4,
  broadPhaseRadius: 5.2,
  reloadTime: 7000,
  weapons: {
    AP: { penetration: 200, velocity: 380, damage: 250, drop: 0.08 },
    HE: { penetration: 30, velocity: 250, damage: 400, drop: 0.2 },
  },
  plates: makeTigerPlates(),
  HullComponent: TigerHull,
  TracksComponent: TigerTracks,
  TurretComponent: TigerTurret,
  GunComponent: TigerGun,
};
