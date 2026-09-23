import type * as THREE from 'three';
import type { ArmorPlate } from '../../armorModel';
import type { CamouflageScheme } from './camouflage';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type AmmoKey = 'AP' | 'APC' | 'HE';
export type PenetrationStandard = 'RHA_30deg' | 'RHA_0deg';
export type ArmorZone = ArmorPlate['zone'];
export type ArmorParent = ArmorPlate['parent'];
export type TrackSide = NonNullable<ArmorPlate['isTrack']>;
export type TankRenderMode = 'legacy' | 'parametric';
export type TankModuleSource = 'legacy' | 'parametric' | 'hybrid';

export interface TankHistoricalPenetrationPoint {
  distance: number;
  penetration: number;
}

export interface TankHistoricalPenetrationSpec {
  standard?: PenetrationStandard;
  points: TankHistoricalPenetrationPoint[];
}

export type TankMaterialRole =
  | 'hullPrimary'
  | 'darkMetal'
  | 'grille'
  | 'track'
  | 'trackRubber'
  | 'steel'
  | 'lamp'
  | 'mantlet'
  | 'barrel'
  | 'wireframe'
  | 'accessory'
  | (string & {});

export type ModelHelperId =
  | 'hull.panel_stack'
  | 'hull.side_profile_extrude'
  | 'tracks.segmented_run'
  | 'tracks.stadium_belt'
  | 'turret.faceted_bustle'
  | 'gun.linear_assembly'
  | 'detail.mirrored_accessories'
  | 'detail.crew_fittings'
  | 'detail.overlay_panels'
  | 'detail.wire_rack_box';

export interface TankGeometryProps {
  color: string;
  destroyedColor: string;
  destroyed: boolean;
  /** Draw as merged per-material batches with LOD (battlefield). Loses the named part tree. */
  merged?: boolean;
  /** Battlefield paint scheme (merged rendering only); omit for plain base colour. */
  camouflage?: CamouflageScheme;
  /** Per-vehicle offset of the camouflage pattern. */
  paintSeed?: number;
}

export interface TankTrackProps {
  isLeft: boolean;
  trackMat: THREE.Material;
  destroyedColor: string;
  destroyed: boolean;
  /** Draw as merged per-material batches with LOD (battlefield). Loses the named part tree. */
  merged?: boolean;
}

export interface TankGunProps {
  color?: string;
  destroyedColor: string;
  destroyed: boolean;
  /** Draw as merged per-material batches with LOD (battlefield). Loses the named part tree. */
  merged?: boolean;
  /** Battlefield paint scheme (merged rendering only); omit for plain base colour. */
  camouflage?: CamouflageScheme;
  /** Per-vehicle offset of the camouflage pattern. */
  paintSeed?: number;
}

export interface TankAmmoSpec {
  penetration: number;
  velocity: number;
  damage: number;
  drop: number;
  dispersion: number;
  historicalPenetration?: TankHistoricalPenetrationSpec;
}

export interface TankBurstSpec {
  count: number;
  interval: number;
}

export interface TankAutomaticSpec {
  magazineSize: number;
  fireInterval: number;
}

export interface TankVisualSpec {
  recoilAnimationScale?: number;
}

export interface TankArmorSummary {
  front: number;
  side: number;
  rear: number;
  turret: number;
}

export interface TankArmorPlateSpec extends ArmorPlate {
  id: string;
}

export interface TankSpec {
  schemaVersion: 1;
  id: string;
  renderMode?: TankRenderMode;
  catalog?: {
    sortOrder?: number;
    hidden?: boolean;
  };
  meta: {
    displayName: string;
    description: string;
    nationality: string;
    year: number;
  };
  appearance: {
    baseColor: string;
    /** Camouflage scheme ids from `camouflage.ts`; the first is the default. */
    camouflage?: string[];
  };
  durability: {
    health: number;
    trackHealth: number;
    armorSummary: TankArmorSummary;
  };
  mounts: {
    turretOffset: Vec3;
    gunPivotOffset: Vec3;
    muzzleDistance: number;
    broadPhaseRadius: number;
  };
  mobility: {
    horsepower: number;
    weight: number;
    maxSpeed: number;
    maxReverseSpeed: number;
    acceleration: number;
    deceleration: number;
    trackWidth: number;
    turnRateLimit: number;
    rotationalInertia: number;
  };
  traverse: {
    turretSpeed: number;
    gunSpeed: number;
    maxElevationDeg: number;
    maxDepressionDeg: number;
  };
  weapons: {
    caliber: number;
    reloadTime: number;
    burst?: TankBurstSpec;
    automatic?: TankAutomaticSpec;
    ammo: {
      AP: TankAmmoSpec;
      APC?: TankAmmoSpec;
      HE?: TankAmmoSpec;
    };
  };
  visuals?: TankVisualSpec;
  armorModel: {
    plates: TankArmorPlateSpec[];
  };
}

export interface ExtrudeShapeDefinition {
  outline: Vec2[];
  holes?: Vec2[][];
}

export interface ModelNodeBase {
  id: string;
  name?: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  visible?: boolean;
  materialRole?: TankMaterialRole;
}

export interface GroupNode extends ModelNodeBase {
  type: 'group';
  children: ModelNode[];
}

export interface BoxNode extends ModelNodeBase {
  type: 'box';
  size: Vec3;
}

export interface CylinderNode extends ModelNodeBase {
  type: 'cylinder';
  radiusTop: number;
  radiusBottom: number;
  height: number;
  radialSegments?: number;
}

export interface SphereNode extends ModelNodeBase {
  type: 'sphere';
  radius: number;
  widthSegments?: number;
  heightSegments?: number;
}

export interface PolyhedronNode extends ModelNodeBase {
  type: 'polyhedron';
  vertices: Vec3[];
  faces: Array<[number, number, number]>;
  /** Share vertex normals for rounded cast surfaces; armor plates stay flat by default. */
  smoothShading?: boolean;
}

export interface ExtrudeNode extends ModelNodeBase {
  type: 'extrude';
  shape: ExtrudeShapeDefinition;
  depth: number;
  bevelEnabled?: boolean;
}

export interface RepeatNode extends ModelNodeBase {
  type: 'repeat';
  count: number;
  step: Vec3;
  child: ModelNode;
}

export interface MirrorNode extends ModelNodeBase {
  type: 'mirror';
  axis: 'x' | 'y' | 'z';
  includeSource?: boolean;
  child: ModelNode;
}

export interface HelperNode extends ModelNodeBase {
  type: 'helper';
  helper: ModelHelperId;
  params: Record<string, unknown>;
}

export type ModelNode =
  | GroupNode
  | BoxNode
  | CylinderNode
  | SphereNode
  | PolyhedronNode
  | ExtrudeNode
  | RepeatNode
  | MirrorNode
  | HelperNode;

export interface TankModelSpec {
  schemaVersion: 1;
  slots: {
    hull: ModelNode[];
    tracksLeft: ModelNode[];
    tracksRight: ModelNode[];
    turret: ModelNode[];
    gun: ModelNode[];
  };
}

export interface TankResolvedSpec {
  id: string;
  displayName: string;
  description: string;
  nationality: string;
  year: number;
  health: number;
  trackHealth: number;
  armor: TankArmorSummary;
  color: string;
  camouflage: CamouflageScheme[];
  turretOffset: Vec3;
  gunPivotOffset: Vec3;
  muzzleDistance: number;
  broadPhaseRadius: number;
  horsepower: number;
  weight: number;
  maxSpeed: number;
  maxReverseSpeed: number;
  acceleration: number;
  deceleration: number;
  trackWidth: number;
  turnRateLimit: number;
  rotationalInertia: number;
  turretSpeed: number;
  gunSpeed: number;
  minGunElevation: number;
  maxGunElevation: number;
  caliber: number;
  reloadTime: number;
  burstCount?: number;
  burstInterval?: number;
  automaticMagazineSize?: number;
  automaticFireInterval?: number;
  recoilAnimationScale: number;
  weapons: {
    AP: TankAmmoSpec;
    APC?: TankAmmoSpec;
    HE?: TankAmmoSpec;
  };
  plates: ArmorPlate[];
}

export interface TankRenderer {
  HullComponent: React.FC<TankGeometryProps>;
  TracksComponent: React.FC<TankTrackProps>;
  TurretComponent: React.FC<TankGeometryProps>;
  GunComponent: React.FC<TankGunProps>;
}

export type TankDefinition = TankResolvedSpec & TankRenderer;

export interface TankModule {
  definition: TankDefinition;
  spec?: TankSpec;
  model?: TankModelSpec;
  source?: TankModuleSource;
}
