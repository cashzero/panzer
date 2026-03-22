# Adding a New Tank

Standard procedure for creating a new tank definition. Use `tiger.tsx` as the reference template.

## Step-by-step

### 1. Create the tank file

Create `src/tanks/<tankid>.tsx`. The file has 6 sections:

```
1. Imports
2. Hull component
3. Tracks component
4. Turret component
5. Gun component
6. Armor plates function
7. TankDefinition export
```

### 2. Imports (copy from tiger.tsx)

```tsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { Box, Cylinder } from '@react-three/drei';
import type { ArmorPlate } from '../armorModel';
import type { TankDefinition, TankGeometryProps, TankTrackProps, TankGunProps } from './types';
```

### 3. Geometry components

Create 4 React components using the prop interfaces from `types.ts`:

| Component | Props | Role |
|-----------|-------|------|
| `<Name>Hull` | `TankGeometryProps` (`color`, `destroyedColor`, `destroyed`) | Hull body, glacis, engine deck, rear plate, details (lights, MG, exhaust, tow hooks) |
| `<Name>Tracks` | `TankTrackProps` (`isLeft`, `trackMat`, `destroyedColor`, `destroyed`) | Track belt (stadium-shaped ExtrudeGeometry), drive sprocket, idler, road wheels |
| `<Name>Turret` | `TankGeometryProps` | Turret box, bustle, cupola, hatches, smoke launchers, antennas |
| `<Name>Gun` | `TankGunProps` (`destroyedColor`, `destroyed`) | Mantlet, barrel, muzzle brake, coaxial MG |

Key conventions:
- **Materials**: create `mat` (main color), `darkMat` (#222), optional `grilleMat` (#111). Always respect `destroyed` flag: `color={destroyed ? destroyedColor : normalColor}`.
- **Coordinate system**: +Z = front of tank, +Y = up. Hull center is at origin. Turret is mounted via `turretOffset` in the definition (not baked into geometry).
- **Dimensions**: Use real-world meters. Comment real dimensions at top of file.
- **Shadows**: Every mesh gets `castShadow receiveShadow`.

#### Track belt pattern (from Tiger)

The tracks use a `useMemo` stadium-shaped `ExtrudeGeometry`:
- Outer and inner contours form the belt shape (straight top/bottom + semicircles at sprocket/idler)
- Key params: `cY` (vertical center), `R` (semicircle radius), `halfLen` (half sprocket-to-sprocket distance), `band` (belt thickness), `depth` (track width)
- Road wheels placed in a loop with `Cylinder` pairs (rubber outer + steel hub)
- `xPos = sign * trackCenterX` where `sign = isLeft ? -1 : 1`
- The track mesh is positioned at `[xPos - depth/2, 0, 0]` rotated `[0, PI/2, 0]`

### 4. Armor plates function

```tsx
function make<Name>Plates(): ArmorPlate[] {
  return [ ... ];
}
```

Each plate:
```ts
{
  name: string,           // Display name (shown in tooltip)
  zone: 'hull' | 'turret' | 'track' | 'gun',
  halfExtents: [x, y, z], // Half-size of OBB box
  position: [x, y, z],    // Center position relative to parent
  rotation: [x, y, z],    // Euler XYZ radians
  armorThickness: number,  // mm
  isTrack?: 'left' | 'right',  // Only for track plates
  parent: 'hull' | 'turret' | 'gunGroup',
}
```

Standard plate set (minimum):
- **Hull**: Front Plate, Upper Glacis, Lower Glacis, Side Left, Side Right, Rear, Roof, Engine Deck
- **Turret**: Front, Side Left, Side Right, Bustle (rear), Roof, Mantlet
- **Tracks**: Left, Right

Plates should closely match the visual geometry positions/rotations. The `halfExtents` define invisible OBB hitboxes used for collision detection and armor tooltips on the selection screen.

### 5. TankDefinition export

```tsx
export const <tankid>Def: TankDefinition = {
  // Identity
  id: '<tankid>',              // Unique key, used in registry
  displayName: 'Display Name',
  description: '...',          // Shown on tank select screen
  nationality: 'Country',
  year: 1942,

  // Combat
  health: 350,
  trackHealth: 100,
  armor: { front: 102, side: 80, rear: 80, turret: 100 },  // Summary values for stat bars
  color: '#b8a04a',            // Base hull/turret color

  // Mobility
  maxSpeed: 8,                 // m/s forward
  maxReverseSpeed: 3,          // m/s reverse
  acceleration: 4,             // m/s²
  deceleration: 8,             // m/s²
  trackWidth: 3.56,            // meters, affects differential steering
  turnRateLimit: 0.35,         // rad/s max hull rotation
  rotationalInertia: 1.5,      // rad/s² rotation acceleration

  // Turret/gun traverse
  turretSpeed: 0.06,           // rad/s
  gunSpeed: 0.08,              // rad/s

  // Geometry offsets
  turretOffset: [0, 1.65, 0.2],     // Where turret sits on hull
  gunPivotOffset: [0, 0.45, 1.5],   // Gun pivot relative to turret
  muzzleDistance: 4,                  // Barrel length from gun pivot
  broadPhaseRadius: 5.8,             // Bounding sphere for broad-phase collision

  // Weapons
  caliber: 88,                 // mm, affects visual effect scale
  reloadTime: 7000,            // ms between shots
  burstCount: undefined,       // Set for autocannons (e.g. Panzer II = 5)
  burstInterval: undefined,    // ms between burst rounds (e.g. Panzer II = 100)
  weapons: {
    AP:  { penetration: 132, velocity: 773, damage: 550, drop: 0.08, dispersion: 0.0012 },
    APC: { penetration: 120, velocity: 773, damage: 650, drop: 0.08, dispersion: 0.0012 },  // Optional
    HE:  { penetration: 30,  velocity: 773, damage: 700, drop: 0.2,  dispersion: 0.0015 },  // Optional
  },

  // Armor & geometry
  plates: make<Name>Plates(),
  HullComponent: <Name>Hull,
  TracksComponent: <Name>Tracks,
  TurretComponent: <Name>Turret,
  GunComponent: <Name>Gun,
};
```

**Weapon notes**:
- `AP` is required. `APC` and `HE` are optional.
- `dispersion`: radians of random spread. Smaller = more accurate. Reference: Tiger 88mm = 0.0012, Panzer II 20mm autocannon = 0.012.
- `drop`: gravity multiplier for ballistic arc. Higher = more drop.
- `velocity`: m/s muzzle velocity.

### 6. Register the tank

In `src/tanks/registry.ts`:

```tsx
import { <tankid>Def } from './<tankid>';
// ...
register(<tankid>Def);
```

That's it. The tank is now available in the selection screen and can be assigned to enemies/allies in the game.

## Checklist

- [ ] File created: `src/tanks/<tankid>.tsx`
- [ ] 4 geometry components: Hull, Tracks, Turret, Gun
- [ ] All meshes respect `destroyed` / `destroyedColor` props
- [ ] All meshes have `castShadow receiveShadow`
- [ ] Armor plates cover all major surfaces and match visual geometry
- [ ] `TankDefinition` exported with all required fields
- [ ] Registered in `registry.ts`
- [ ] `npm run lint` passes (tsc --noEmit)
