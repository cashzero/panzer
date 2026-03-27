import { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';
import { computeAccelFromHpWeight } from '../config';

// ============================================================
// T-34/76 Model 1943 — Soviet medium tank
// Real dimensions: 6.68m long (gun forward), 3.0m wide, 2.45m tall
// Hull length ~6.1m, hexagonal turret, Christie suspension
// 45mm sloped armor (60° glacis = ~90mm effective)
// ============================================================

const T34Hull = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
  const grilleMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;

  // T-34 cross-section is trapezoidal: ~3.0m wide at sponson level, ~2.2m at roof
  // Side slopes ~40° from vertical

  // Sloped side armor — polygon follows glacis angle at front
  // Shape in XY: X = hull length (+X = front), Y = slope height
  // Right side: glacis at +X; Left side: mirrored (glacis at -X)
  const sideShapeR = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-2.2, -0.43);    // rear bottom
    s.lineTo(-2.2, 0.43);     // rear top
    s.lineTo(1.82, 0.43);     // front top (roof-glacis junction, Z=1.62)
    s.lineTo(2.95, -0.43);    // glacis bottom (sponson level, Z=2.75)
    s.closePath();
    return s;
  }, []);
  const sideShapeL = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(2.2, -0.43);     // rear bottom (mirrored X)
    s.lineTo(2.2, 0.43);      // rear top
    s.lineTo(-1.82, 0.43);    // front top
    s.lineTo(-2.95, -0.43);   // glacis bottom
    s.closePath();
    return s;
  }, []);
  const sideExtrude = useMemo(() => ({ depth: 0.12, bevelEnabled: false }), []);

  // Upper glacis — trapezoidal: wider at bottom (sponson), narrower at top (roof)
  // Shape in XY: X=width, Y=slope extent. Extruded along Z for thickness.
  // T-34 glacis: 60° from vertical (30° from horizontal). Rotation = -1.05 rad.
  // Shape Y half-extent 0.65 → slope length ~1.3m
  const glacisShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-1.4, -0.65);   // bottom-left (sponson width)
    s.lineTo(1.4, -0.65);    // bottom-right
    s.lineTo(1.1, 0.65);     // top-right (roof width)
    s.lineTo(-1.1, 0.65);    // top-left
    s.closePath();
    return s;
  }, []);
  const glacisExtrude = useMemo(() => ({ depth: 0.12, bevelEnabled: false }), []);

  return (
    <group>
      {/* Lower hull between tracks — narrow vertical sides */}
      <Box args={[1.8, 0.5, 4.6]} position={[0, 0.4, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Upper hull roof — extends forward to meet glacis top edge (~Z=1.6) */}
      <Box args={[2.2, 0.12, 3.8]} position={[0, 1.2, -0.28]} castShadow receiveShadow>{mat}</Box>

      {/* Sloped side armor — right: \ from front view, follows glacis at front */}
      <group position={[1.3, 0.88, -0.2]} rotation={[0, 0, 0.7]}>
        <mesh rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow>
          <extrudeGeometry args={[sideShapeR, sideExtrude]} />
          {mat}
        </mesh>
      </group>
      {/* Sloped side armor — left: / from front view, follows glacis at front */}
      <group position={[-1.3, 0.88, -0.2]} rotation={[0, 0, -0.7]}>
        <mesh rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
          <extrudeGeometry args={[sideShapeL, sideExtrude]} />
          {mat}
        </mesh>
      </group>

      {/* Sponson fill — connect sloped sides to lower hull */}
      <Box args={[2.8, 0.3, 4.4]} position={[0, 0.7, -0.2]} castShadow receiveShadow>{mat}</Box>

      {/* Upper Glacis — 60° from vertical trapezoidal slope */}
      <mesh position={[0, 0.875, 2.19]} rotation={[-1.05, 0, 0]} castShadow receiveShadow>
        <extrudeGeometry args={[glacisShape, glacisExtrude]} />
        {mat}
      </mesh>
      {/* Lower Glacis — narrower, between tracks */}
      <Box args={[1.8, 0.12, 0.45]} position={[0, 0.33, 2.75]} rotation={[1.8, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Deck — rear raised section */}
      <Box args={[2.4, 0.15, 2.0]} position={[0, 1.27, -1.8]} rotation={[-0.04, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Rear Plate — slightly angled */}
      <Box args={[2.6, 0.7, 0.12]} position={[0, 0.88, -2.8]} rotation={[-0.1, 0, 0]} castShadow receiveShadow>{mat}</Box>

      {/* Engine Grilles — characteristic rear louvers */}
      <Box args={[0.7, 0.05, 0.8]} position={[0.5, 1.36, -1.8]} castShadow receiveShadow>{grilleMat}</Box>
      <Box args={[0.7, 0.05, 0.8]} position={[-0.5, 1.36, -1.8]} castShadow receiveShadow>{grilleMat}</Box>

      {/* Twin exhaust pipes (rear, angled outward) */}
      <Cylinder args={[0.08, 0.08, 1.2]} position={[1.0, 1.05, -2.6]} rotation={[0.4, 0, 0.15]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.08, 0.08, 1.2]} position={[-1.0, 1.05, -2.6]} rotation={[0.4, 0, -0.15]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Front light */}
      <Box args={[0.16, 0.12, 0.08]} position={[-1.0, 0.95, 2.7]} rotation={[1.05, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#ffffcc'} emissive={destroyed ? '#000' : '#ffffaa'} emissiveIntensity={0.5} />
      </Box>

      {/* Hull MG — DT machine gun (ball mount, right front) */}
      <Cylinder args={[0.06, 0.06, 0.18]} position={[0.5, 0.75, 2.85]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Tow hooks */}
      <Box args={[0.12, 0.06, 0.15]} position={[0.7, 0.33, 2.9]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.12, 0.06, 0.15]} position={[-0.7, 0.33, 2.9]} castShadow receiveShadow>{darkMat}</Box>

      {/* Spare fuel drums (rear sides — iconic T-34 detail) */}
      <Cylinder args={[0.18, 0.18, 0.8]} position={[1.35, 0.95, -2.2]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>{darkMat}</Cylinder>
      <Cylinder args={[0.18, 0.18, 0.8]} position={[-1.35, 0.95, -2.2]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>{darkMat}</Cylinder>
    </group>
  );
};

const T34Tracks = ({ isLeft, trackMat, destroyedColor, destroyed }: TankTrackProps) => {
  const sign = isLeft ? -1 : 1;
  const xPos = sign * 1.2;
  const rubberMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
  const steelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;

  // Stadium-shaped track belt — Christie suspension, large road wheels
  const trackGeo = useMemo(() => {
    const cY = 0.32;
    const R = 0.28;
    const halfLen = 2.8;
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

    return new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
  }, []);

  // Christie suspension — 5 large road wheels per side (T-34 signature)
  const roadWheels = [];
  for (let i = 0; i < 5; i++) {
    const z = 2.0 - i * 1.0;
    roadWheels.push(
      <group key={`rw-${i}`} position={[xPos, 0.32, z]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.30, 0.30, 0.48, 14]} castShadow receiveShadow>{rubberMat}</Cylinder>
        <Cylinder args={[0.18, 0.18, 0.50, 8]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
    );
  }

  return (
    <group>
      {/* Track belt */}
      <mesh
        position={[xPos - 0.275, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        geometry={trackGeo}
        castShadow receiveShadow
      >
        <primitive object={trackMat} attach="material" />
      </mesh>

      {/* Drive sprocket (rear — T-34 has rear drive) */}
      <group position={[xPos, 0.32, -2.8]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.25, 0.25, 0.48, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>
      {/* Idler (front) */}
      <group position={[xPos, 0.32, 2.8]} rotation={[0, 0, Math.PI / 2]}>
        <Cylinder args={[0.25, 0.25, 0.48, 12]} castShadow receiveShadow>{steelMat}</Cylinder>
      </group>

      {roadWheels}
    </group>
  );
};

const T34Turret = ({ color, destroyedColor, destroyed }: TankGeometryProps) => {
  const mat = <meshStandardMaterial color={destroyed ? destroyedColor : color} roughness={0.7} metalness={0.3} />;
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} />;

  return (
    <group>
      {/* Hexagonal turret (Model 1943) — cast construction */}
      {/* Main body */}
      <Box args={[1.6, 0.65, 1.6]} position={[0, 0.33, -0.1]} castShadow receiveShadow>{mat}</Box>
      {/* Front face — angled cheeks for hexagonal shape */}
      <Box args={[1.2, 0.65, 0.5]} position={[0, 0.33, 0.75]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.5, 0.6, 0.5]} position={[-0.62, 0.33, 0.55]} rotation={[0, -0.5, 0]} castShadow receiveShadow>{mat}</Box>
      <Box args={[0.5, 0.6, 0.5]} position={[0.62, 0.33, 0.55]} rotation={[0, 0.5, 0]} castShadow receiveShadow>{mat}</Box>
      {/* Commander's cupola (Model 1943 added this) */}
      <Cylinder args={[0.28, 0.28, 0.2, 12]} position={[0.35, 0.73, -0.3]} castShadow receiveShadow>{mat}</Cylinder>
      <Cylinder args={[0.22, 0.22, 0.06, 12]} position={[0.35, 0.86, -0.3]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Loader's hatch */}
      <Cylinder args={[0.22, 0.22, 0.04, 10]} position={[-0.35, 0.67, -0.3]} castShadow receiveShadow>{mat}</Cylinder>

      {/* Ventilator dome */}
      <Cylinder args={[0.1, 0.1, 0.06, 8]} position={[0, 0.68, 0.2]} castShadow receiveShadow>{darkMat}</Cylinder>

      {/* Handrails on turret sides */}
      <Box args={[0.03, 0.03, 0.6]} position={[0.83, 0.4, -0.1]} castShadow receiveShadow>{darkMat}</Box>
      <Box args={[0.03, 0.03, 0.6]} position={[-0.83, 0.4, -0.1]} castShadow receiveShadow>{darkMat}</Box>

      {/* Antenna */}
      <Cylinder args={[0.01, 0.015, 1.8]} position={[-0.5, 1.4, -0.7]} castShadow receiveShadow>{darkMat}</Cylinder>
    </group>
  );
};

const T34Gun = ({ destroyedColor, destroyed }: TankGunProps) => {
  const darkMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
  const barrelMat = <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;

  return (
    <group>
      {/* Mantlet — rounded shape characteristic of T-34 */}
      <Cylinder args={[0.3, 0.28, 0.4, 12]} position={[0, 0, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />
      </Cylinder>
      {/* 76.2mm F-34 barrel — L/41.5, exposed length ~2.0m from mantlet */}
      <Cylinder args={[0.05, 0.065, 2.0]} position={[0, 0, 1.3]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>
      {/* Barrel sleeve (thicker at base) */}
      <Cylinder args={[0.085, 0.085, 0.4]} position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {barrelMat}
      </Cylinder>
      {/* Muzzle tip */}
      <Cylinder args={[0.065, 0.065, 0.1]} position={[0, 0, 2.35]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
      {/* Coaxial DT machine gun */}
      <Cylinder args={[0.015, 0.015, 0.6]} position={[0.12, -0.05, 0.6]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        {darkMat}
      </Cylinder>
    </group>
  );
};

// ============================================================
// Armor Plates
// ============================================================

function makeT34Plates(): ArmorPlate[] {
  return [
    // Hull — 45mm at 60° glacis, 40° sloped sides
    { name: 'Hull Upper Glacis', zone: 'hull', halfExtents: [1.25, 0.08, 0.65], position: [0, 0.875, 2.19], rotation: [0.524, 0, 0], armorThickness: 45, parent: 'hull' },
    { name: 'Hull Lower Glacis', zone: 'hull', halfExtents: [0.9, 0.08, 0.22], position: [0, 0.33, 2.75], rotation: [1.8, 0, 0], armorThickness: 45, parent: 'hull' },
    { name: 'Hull Side Left', zone: 'hull', halfExtents: [0.08, 0.36, 2.2], position: [-1.3, 0.88, -0.2], rotation: [0, 0, -0.7], armorThickness: 45, parent: 'hull' },
    { name: 'Hull Side Right', zone: 'hull', halfExtents: [0.08, 0.36, 2.2], position: [1.3, 0.88, -0.2], rotation: [0, 0, 0.7], armorThickness: 45, parent: 'hull' },
    { name: 'Hull Rear', zone: 'hull', halfExtents: [1.3, 0.35, 0.08], position: [0, 0.88, -2.8], rotation: [-0.1, 0, 0], armorThickness: 40, parent: 'hull' },
    { name: 'Hull Roof', zone: 'hull', halfExtents: [1.1, 0.08, 1.9], position: [0, 1.2, -0.28], rotation: [0, 0, 0], armorThickness: 20, parent: 'hull' },
    { name: 'Hull Engine Deck', zone: 'hull', halfExtents: [1.2, 0.08, 1.0], position: [0, 1.27, -1.8], rotation: [-0.04, 0, 0], armorThickness: 20, parent: 'hull' },
    // Turret — hexagonal cast, 52mm front
    { name: 'Turret Front', zone: 'turret', halfExtents: [0.6, 0.325, 0.08], position: [0, 0.33, 1.0], rotation: [0, 0, 0], armorThickness: 52, parent: 'turret' },
    { name: 'Turret Cheek Left', zone: 'turret', halfExtents: [0.25, 0.3, 0.25], position: [-0.62, 0.33, 0.55], rotation: [0, -0.5, 0], armorThickness: 52, parent: 'turret' },
    { name: 'Turret Cheek Right', zone: 'turret', halfExtents: [0.25, 0.3, 0.25], position: [0.62, 0.33, 0.55], rotation: [0, 0.5, 0], armorThickness: 52, parent: 'turret' },
    { name: 'Turret Side Left', zone: 'turret', halfExtents: [0.08, 0.325, 0.8], position: [-0.8, 0.33, -0.1], rotation: [0, 0, 0], armorThickness: 52, parent: 'turret' },
    { name: 'Turret Side Right', zone: 'turret', halfExtents: [0.08, 0.325, 0.8], position: [0.8, 0.33, -0.1], rotation: [0, 0, 0], armorThickness: 52, parent: 'turret' },
    { name: 'Turret Rear', zone: 'turret', halfExtents: [0.8, 0.325, 0.08], position: [0, 0.33, -0.9], rotation: [0, 0, 0], armorThickness: 45, parent: 'turret' },
    { name: 'Turret Roof', zone: 'turret', halfExtents: [0.8, 0.08, 0.8], position: [0, 0.655, -0.1], rotation: [0, 0, 0], armorThickness: 20, parent: 'turret' },
    { name: 'Mantlet', zone: 'gun', halfExtents: [0.3, 0.28, 0.2], position: [0, 0, 0.1], rotation: [0, 0, 0], armorThickness: 65, parent: 'gunGroup' },
    // Tracks
    { name: 'Track Left', zone: 'track', halfExtents: [0.3, 0.32, 2.8], position: [-1.2, 0.28, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'left', parent: 'hull' },
    { name: 'Track Right', zone: 'track', halfExtents: [0.3, 0.32, 2.8], position: [1.2, 0.28, 0], rotation: [0, 0, 0], armorThickness: 20, isTrack: 'right', parent: 'hull' },
  ];
}

// ============================================================
// Definition
// ============================================================

export const t34Def: TankDefinition = {
  id: 't34',
  displayName: 'T-34/76',
  description:
    'The Soviet Union\'s most iconic medium tank. Its revolutionary 60° sloped armor gives protection rivaling heavier tanks while maintaining excellent mobility. The cramped two-man turret limits rate of fire, but the reliable V-2 diesel engine and wide tracks make it fast and agile across all terrain.',
  nationality: 'Soviet Union',
  year: 1943,

  health: 270,
  trackHealth: 130,
  armor: { front: 45, side: 45, rear: 40, turret: 52 },
  color: '#4a6b3a',

  horsepower: 500,
  weight: 30.9,
  maxSpeed: 13,
  maxReverseSpeed: 4,
  acceleration: computeAccelFromHpWeight(500, 30.9),
  deceleration: 9,
  trackWidth: 3.0,
  turnRateLimit: 0.55,
  rotationalInertia: 2.5,

  turretSpeed: 0.08,
  gunSpeed: 0.09,

  turretOffset: [0, 1.2, 0.3],
  gunPivotOffset: [0, 0.33, 1.0],
  muzzleDistance: 2.4,
  broadPhaseRadius: 4.8,

  caliber: 76,
  reloadTime: 7000,
  weapons: {
    AP:  { penetration: 69, velocity: 662, damage: 350, drop: 0.1, dispersion: 0.0018 },
    APC: { penetration: 75, velocity: 655, damage: 420, drop: 0.1, dispersion: 0.0018 },
    HE:  { penetration: 20, velocity: 680, damage: 550, drop: 0.22, dispersion: 0.0022 },
  },

  plates: makeT34Plates(),
  HullComponent: T34Hull,
  TracksComponent: T34Tracks,
  TurretComponent: T34Turret,
  GunComponent: T34Gun,
};
