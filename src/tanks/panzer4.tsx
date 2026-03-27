import { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';
import { computeAccelFromHpWeight } from '../config';

// ============================================================
// PANZER IV — Panzerkampfwagen IV Ausf. H
// Real dimensions: 7.02m long × 2.84m wide × 2.68m tall
// Weight: 25.0 tonnes, Engine: 300 PS Maybach HL 120 TRM
// Track width: 400mm, track gauge (center-to-center): ~2.36m
// Main gun: 7.5 cm KwK 40 L/48
// ============================================================

const Pz4Hull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  return (
    <group>
      {/* Superstructure — boxy Panzer IV profile */}
      <Box args={[2.84, 1.15, 5.6]} position={[0, 0.85, -0.2]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Front Hull — between tracks */}
      <Box args={[2.0, 0.50, 1.3]} position={[0, 0.50, 2.45]} castShadow receiveShadow>{mat}</Box>

      {/* Hull Front Plate — 80mm, nearly vertical */}
      <Box args={[2.84, 0.50, 0.15]} position={[0, 1.18, 2.55]} rotation={[-0.17, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis — angled plate connecting roof to front */}
      <Box args={[2.0, 0.50, 0.15]} position={[0, 0.68, 3.0]} rotation={[-0.5, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Lower Glacis — angled under hull */}
      <Box args={[2.0, 0.40, 0.15]} position={[0, 0.30, 3.0]} rotation={[0.85, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck — flat rear section */}
      <Box args={[2.84, 0.18, 2.2]} position={[0, 1.40, -2.0]} rotation={[-0.03, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate — 20mm */}
      <Box args={[2.84, 1.10, 0.12]} position={[0, 0.82, -3.1]} castShadow receiveShadow>{mat}</Box>

      {/* Side armor plates */}
      <Box args={[0.12, 1.05, 5.8]} position={[1.46, 0.85, -0.1]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.12, 1.05, 5.8]} position={[-1.46, 0.85, -0.1]} castShadow receiveShadow>{mat}</Box>

      {/* Schürzen — 5mm spaced armor skirts (Ausf. H signature) */}
      <Box args={[0.04, 0.75, 4.8]} position={[1.55, 0.80, -0.3]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.85} metalness={0.2} />
      </Box>
      <Box args={[0.04, 0.75, 4.8]} position={[-1.55, 0.80, -0.3]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.85} metalness={0.2} />
      </Box>

      {/* Engine Grilles — twin */}
      <Box args={[0.7, 0.04, 1.0]} position={[0.55, 1.50, -2.0]} castShadow receiveShadow>{grilleMat}</Box>
      <Box args={[0.7, 0.04, 1.0]} position={[-0.55, 1.50, -2.0]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Exhaust — single muffler on left rear */}
      <Cylinder args={[0.08, 0.08, 1.0]} position={[-1.15, 1.20, -2.7]} rotation={[0.05, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.10, 0.10, 0.15]} position={[-1.15, 1.20, -3.15]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front Lights */}
      <Box args={[0.16, 0.12, 0.15]} position={[1.1, 1.20, 2.65]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>
      <Box args={[0.16, 0.12, 0.15]} position={[-1.1, 1.20, 2.65]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Hull MG (ball mount) — right side of front plate */}
      <Cylinder args={[0.07, 0.07, 0.12]} position={[-0.8, 0.75, 3.0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Driver's visor — left side of front plate */}
      <Box args={[0.3, 0.1, 0.06]} position={[0.7, 1.20, 2.62]} castShadow receiveShadow>{darkMat}</Box>

      {/* Tow hooks — front */}
      <Box args={[0.1, 0.06, 0.12]} position={[0.8, 0.25, 3.15]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.1, 0.06, 0.12]} position={[-0.8, 0.25, 3.15]} castShadow receiveShadow>{darkMat}</Box>

      {/* Storage box on rear */}
      <Box args={[1.6, 0.30, 0.25]} position={[0, 1.15, -3.22]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} roughness={0.9} />
      </Box>

      {/* Spare track links on glacis */}
      <Box args={[1.6, 0.06, 0.2]} position={[0, 1.35, 2.7]} rotation={[-0.17, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#1a1a1a'} roughness={0.95} />
      </Box>
    </group>
  );
};

const Pz4Tracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 1.18;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // Stadium-shaped track belt
  const trackGeo = useMemo(() => {
    const cY = 0.32;
    const R = 0.28;
    const halfLen = 2.9;
    const band = 0.04;
    const arcSegs = 16;

    function stadiumPts(r: number, cy: number, hl: number): THREE.Vector2[] {
      const pts: THREE.Vector2[] = [];
      pts.push(new THREE.Vector2(-hl, cy + r));
      pts.push(new THREE.Vector2(hl, cy + r));
      for (let i = 1; i < arcSegs; i++) {
        const a = Math.PI / 2 - (Math.PI * i) / arcSegs;
        pts.push(new THREE.Vector2(hl + r * Math.cos(a), cy + r * Math.sin(a)));
      }
      pts.push(new THREE.Vector2(hl, cy - r));
      pts.push(new THREE.Vector2(-hl, cy - r));
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

    return new THREE.ExtrudeGeometry(shape, { depth: 0.40, bevelEnabled: false });
  }, []);

  // 8 small road wheels per side — leaf spring suspension (Panzer IV signature)
  const roadWheels = [];
  for (let i = 0; i < 8; i++) {
    const z = 2.4 - i * 0.69;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.28, z]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.22, 0.22, 0.38, 12]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.13, 0.13, 0.40, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  // 4 return rollers on top
  const returnRollers = [];
  for (let i = 0; i < 4; i++) {
    const z = 1.8 - i * 1.15;
    returnRollers.push(
      <group key={`rr-${i}`} position={[xPos, 0.58, z]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.07, 0.07, 0.34, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Track belt */}
      <mesh
        position={[xPos - 0.20, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        geometry={trackGeo}
        castShadow receiveShadow
      >
        <primitive object={trackMat} attach="material" />
      </mesh>

      {/* Drive Sprocket (Front) */}
      <group position={[xPos, 0.32, 2.9]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.26, 0.26, 0.38, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {/* Idler Wheel (Rear) */}
      <group position={[xPos, 0.32, -2.9]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.24, 0.24, 0.38, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {roadWheels}
      {returnRollers}
    </group>
  );
};

const Pz4Turret = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} />;

  return (
    <group>
      {/* Main turret body — boxy Panzer IV style */}
      <Box args={[1.85, 0.82, 2.4]} position={[0, 0.41, -0.1]} castShadow receiveShadow>{mat}</Box>

      {/* Front face — slightly angled cheeks */}
      <Box args={[1.5, 0.78, 0.9]} position={[0, 0.41, 0.95]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.5, 0.72, 0.7]} position={[-0.75, 0.41, 0.6]} rotation={[0, -0.3, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.5, 0.72, 0.7]} position={[0.75, 0.41, 0.6]} rotation={[0, 0.3, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Turret Bustle — rear */}
      <Box args={[1.85, 0.72, 0.7]} position={[0, 0.41, -1.6]} castShadow receiveShadow>{mat}</Box>

      {/* Commander's Cupola — raised with vision blocks */}
      <Cylinder args={[0.34, 0.34, 0.28, 12]} position={[0.42, 0.96, -0.4]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.28, 0.28, 0.07, 12]} position={[0.42, 1.13, -0.4]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Loader's Hatch */}
      <Cylinder args={[0.24, 0.24, 0.04, 10]} position={[-0.42, 0.84, -0.4]} castShadow receiveShadow>{mat}</Cylinder>

      {/* Turret ventilator */}
      <Cylinder args={[0.09, 0.09, 0.06, 8]} position={[0, 0.84, 0.2]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Turret Schürzen — thin armor panels on turret sides (Ausf. H) */}
      <Box args={[0.03, 0.6, 1.8]} position={[0.96, 0.41, -0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.85} metalness={0.2} />
      </Box>
      <Box args={[0.03, 0.6, 1.8]} position={[-0.96, 0.41, -0.1]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.85} metalness={0.2} />
      </Box>

      {/* Antenna — single rod */}
      <Cylinder args={[0.01, 0.012, 1.8]} position={[-0.75, 1.5, -1.3]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Storage bin (rear) */}
      <Box args={[1.4, 0.35, 0.25]} position={[0, 0.38, -2.05]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} wireframe={true} />
      </Box>

      {/* Smoke Grenade Launchers — NbK 39 (single rack, right side) */}
      <group position={[0.96, 0.6, 0.6]} rotation={[0, Math.PI / 4, 0]}>
        <Cylinder args={[0.035, 0.035, 0.25]} position={[0, 0, 0]} rotation={[Math.PI / 3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.035, 0.035, 0.25]} position={[0.09, 0, 0]} rotation={[Math.PI / 3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
        <Cylinder args={[0.035, 0.035, 0.25]} position={[-0.09, 0, 0]} rotation={[Math.PI / 3, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>
      </group>
    </group>
  );
};

const Pz4Gun = ({ destroyedColor, destroyed }: TankGunProps) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;

  return (
    <group>
      {/* Mantlet — external type, wider than Panzer III */}
      <Box args={[0.55, 0.38, 0.45]} position={[0, 0, 0.15]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />
      </Box>

      {/* Main Barrel — 75mm KwK 40 L/48 (longer barrel than Panzer III) */}
      <Cylinder args={[0.045, 0.065, 3.0]} position={[0, 0, 1.5]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>

      {/* Muzzle brake — double-baffle (KwK 40 signature) */}
      <Cylinder args={[0.08, 0.08, 0.25]} position={[0, 0, 3.0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
      <Box args={[0.2, 0.05, 0.2]} position={[0, 0, 2.95]} castShadow receiveShadow>
        {darkMat}
      </Box>
      <Box args={[0.2, 0.05, 0.12]} position={[0, 0, 3.1]} castShadow receiveShadow>
        {darkMat}
      </Box>

      {/* Coaxial MG */}
      <Cylinder args={[0.012, 0.012, 0.7]} position={[0.14, -0.07, 0.65]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
    </group>
  );
};

// ============================================================
// Armor Plates — matched to geometry dimensions
// Panzer IV Ausf. H historical armor values
// ============================================================

function makePz4Plates(): ArmorPlate[] {
  return [
    // Hull
    { name: 'Hull Front Plate', zone: 'hull', halfExtents: [1.42, 0.25, 0.075], position: [0, 1.18, 2.55], rotation: [-0.17, 0, 0], armorThickness: 80, parent: 'hull' },
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [1.0, 0.25, 0.075], position: [0, 0.68, 3.0], rotation: [-0.5, 0, 0], armorThickness: 80, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [1.0, 0.20, 0.075], position: [0, 0.30, 3.0], rotation: [0.85, 0, 0], armorThickness: 80, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.06, 0.525, 2.9], position: [-1.46, 0.85, -0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.06, 0.525, 2.9], position: [1.46, 0.85, -0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.42, 0.55, 0.06], position: [0, 0.82, -3.1], rotation: [0, 0, 0], armorThickness: 20, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.42, 0.08, 1.4], position: [0, 1.42, 0.2], rotation: [0, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.42, 0.08, 1.1], position: [0, 1.40, -2.0], rotation: [-0.03, 0, 0], armorThickness: 10, parent: 'hull' },
    { name: 'Side Skirt Left', zone: 'hull', halfExtents: [0.4, 0.375, 2.4], position: [-1.55, 0.80, -0.3], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    { name: 'Side Skirt Right', zone: 'hull', halfExtents: [0.4, 0.375, 2.4], position: [1.55, 0.80, -0.3], rotation: [0, 0, 0], armorThickness: 5, parent: 'hull' },
    // Turret
    { name: 'Turret Front', zone: 'turret', halfExtents: [0.75, 0.39, 0.08], position: [0, 0.41, 1.4], rotation: [0, 0, 0], armorThickness: 50, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.25, 0.36, 0.35], position: [-0.75, 0.41, 0.6], rotation: [0, -0.3, 0], armorThickness: 50, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.25, 0.36, 0.35], position: [0.75, 0.41, 0.6], rotation: [0, 0.3, 0], armorThickness: 50, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.08, 0.41, 1.2], position: [-0.925, 0.41, -0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.08, 0.41, 1.2], position: [0.925, 0.41, -0.1], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Bustle', zone: 'turret', halfExtents: [0.925, 0.36, 0.35], position: [0, 0.41, -1.6], rotation: [0, 0, 0], armorThickness: 30, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [0.925, 0.08, 1.2], position: [0, 0.82, -0.1], rotation: [0, 0, 0], armorThickness: 16, parent: 'turret' },
    { name: 'Turret Skirt Left', zone: 'turret', halfExtents: [0.4, 0.3, 0.9], position: [-0.96, 0.41, -0.1], rotation: [0, 0, 0], armorThickness: 5, parent: 'turret' },
    { name: 'Turret Skirt Right', zone: 'turret', halfExtents: [0.4, 0.3, 0.9], position: [0.96, 0.41, -0.1], rotation: [0, 0, 0], armorThickness: 5, parent: 'turret' },
    // Gun
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.275, 0.19, 0.225], position: [0, 0, 0.15], rotation: [0, 0, 0], armorThickness: 50, parent: 'gunGroup' },
    // Tracks
    { name: 'Track Left', zone: 'track', halfExtents: [0.22, 0.30, 2.9], position: [-1.18, 0.28, 0], rotation: [0, 0, 0], armorThickness: 15, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.22, 0.30, 2.9], position: [1.18, 0.28, 0], rotation: [0, 0, 0], armorThickness: 15, isTrack: 'right', parent: 'hull' },
  ];
}

// ============================================================
// Definition
// ============================================================

export const panzer4Def: TankDefinition = {
  id: 'panzer4',
  displayName: 'Panzer IV',
  description: 'The backbone of the Wehrmacht\'s Panzer divisions throughout the war. The Ausf. H mounts the powerful 75mm KwK 40 L/48 gun capable of engaging any Allied medium tank, with Schürzen side skirts for added protection. A well-balanced workhorse — reliable, versatile, and deadly at range.',
  nationality: 'Germany',
  year: 1943,
  health: 250,
  trackHealth: 90,
  armor: { front: 80, side: 30, rear: 20, turret: 50 },
  color: '#7a7754',  // Dunkelgelb (RAL 7028) — standard from Feb 1943
  horsepower: 300,    // Maybach HL 120 TRM
  weight: 25.0,       // tonnes
  maxSpeed: 10.5,     // 38 km/h road
  maxReverseSpeed: 4,
  acceleration: computeAccelFromHpWeight(300, 25.0),
  deceleration: 9,
  trackWidth: 2.36,
  turnRateLimit: 0.48,
  rotationalInertia: 2.5,
  turretSpeed: 0.26,  // ~15 deg/s electric traverse
  gunSpeed: 0.12,
  turretOffset: [0, 1.42, 0.3],
  gunPivotOffset: [0, 0.42, 1.5],
  muzzleDistance: 3.5,
  broadPhaseRadius: 5.2,
  caliber: 75,
  reloadTime: 5000,   // ~10-12 rpm experienced crew → ~5s
  weapons: {
    AP:  { penetration: 99,  velocity: 740,  damage: 350, drop: 0.10, dispersion: 0.0018 },
    APC: { penetration: 126, velocity: 930,  damage: 250, drop: 0.08, dispersion: 0.0015 },
    HE:  { penetration: 25,  velocity: 550,  damage: 500, drop: 0.30, dispersion: 0.0025 },
  },
  plates: makePz4Plates(),
  HullComponent: Pz4Hull,
  TracksComponent: Pz4Tracks,
  TurretComponent: Pz4Turret,
  GunComponent: Pz4Gun,
};
