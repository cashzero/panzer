import type * as THREE from 'three';
import type { ArmorPlate } from '../armorModel';

export interface TankGeometryProps {
  color: string;
  destroyedColor: string;
  destroyed: boolean;
}

export interface TankTrackProps {
  isLeft: boolean;
  trackMat: THREE.Material;
  destroyedColor: string;
  destroyed: boolean;
}

export interface TankGunProps {
  destroyedColor: string;
  destroyed: boolean;
}

export interface TankDefinition {
  id: string;
  displayName: string;
  description: string;
  nationality: string;
  year: number;

  // Stats
  health: number;
  trackHealth: number;
  armor: { front: number; side: number; rear: number; turret: number };
  color: string;

  // Geometry offsets (single source of truth)
  turretOffset: [number, number, number];
  gunPivotOffset: [number, number, number];
  muzzleDistance: number;
  broadPhaseRadius: number;

  // Mobility
  maxSpeed: number;        // m/s
  maxReverseSpeed: number; // m/s
  acceleration: number;    // m/s²
  deceleration: number;    // m/s²
  trackWidth: number;      // meters
  turnRateLimit: number;   // rad/s — max hull rotation rate
  rotationalInertia: number; // rad/s² — how fast rotation speed can change

  // Turret/gun traverse
  turretSpeed: number; // rad/s
  gunSpeed: number;    // rad/s

  // Weapon stats per ammo type
  caliber: number;    // mm, used for visual effect scaling
  reloadTime: number; // ms
  burstCount?: number;    // rounds per trigger pull (undefined = single shot)
  burstInterval?: number; // ms between rounds within a burst
  weapons: {
    AP: { penetration: number; velocity: number; damage: number; drop: number; dispersion: number };
    APC?: { penetration: number; velocity: number; damage: number; drop: number; dispersion: number };
    HE?: { penetration: number; velocity: number; damage: number; drop: number; dispersion: number };
  };

  // Armor plates
  plates: ArmorPlate[];

  // React geometry components
  HullComponent: React.FC<TankGeometryProps>;
  TracksComponent: React.FC<TankTrackProps>;
  TurretComponent: React.FC<TankGeometryProps>;
  GunComponent: React.FC<TankGunProps>;
}
