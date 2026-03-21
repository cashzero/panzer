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

  // Armor plates
  plates: ArmorPlate[];

  // React geometry components
  HullComponent: React.FC<TankGeometryProps>;
  TracksComponent: React.FC<TankTrackProps>;
  TurretComponent: React.FC<TankGeometryProps>;
  GunComponent: React.FC<TankGunProps>;
}
