import { create } from 'zustand';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from './config';
import { audioManager, toAudioVec3, type AudioSource } from './audio';
import type { ArmorPlateHitInfo } from './armorModel';
import { getTankDef, getAllTankDefs } from './tanks/registry';
import type { TankAmmoSpec } from './tanks/types';
import type { TreeInstance } from './trees';
import { analyzeImpact, computeReflectedVelocity, computeEffectiveArmor, rollPenetration, computeDamage, computeHESplashDamage } from './combatPhysics';
import { getAmmoPenetrationAtDistance } from './penetrationModel';
import { stepProjectile } from './projectilePhysics';

export type AmmoType = 'AP' | 'APC' | 'HE';
export type AllyBaseMoveOrder = 'follow' | 'hold';
export type AllyEffectiveMoveOrder = AllyBaseMoveOrder | 'move';
export type AllyFireOrder = 'hold-fire' | 'return-fire' | 'fire-at-will';
export type AllyEngagementPosture = 'fire-from-position' | 'advance-and-fire';

// Gunner sight zoom levels: FOV values in degrees (lower = more zoom)
export const GUNNER_ZOOM_LEVELS = [20, 10, 5, 2.5] as const;
export const GUNNER_ZOOM_LABELS = ['1x', '2x', '4x', '8x'] as const;

export interface Particle {
  id: string;
  type: 'fire' | 'hit_penetrate' | 'hit_bounce' | 'non_pen_impact' | 'ricochet_impact' | 'hit_ground' | 'tank_explosion' | 'dust' | 'dust_low' | 'he_hit_ground' | 'he_hit_penetrate' | 'burning_smoke' | 'tree_hit';
  position: Vector3;
  normal?: Vector3;
  scale?: number;
  createdAt: number;
}

export interface Projectile {
  id: string;
  origin: Vector3;
  position: Vector3;
  velocity: Vector3;
  type: AmmoType;
  ammoSpec: TankAmmoSpec;
  damage: number;
  caliber: number;
  firedBy: string;
  ricochet?: boolean;
  createdAt: number;
}

export interface TankData {
  id: string;
  tankType: string;
  position: Vector3;
  rotation: number; // Y-axis rotation of hull
  pitch?: number; // X-axis rotation of hull
  roll?: number; // Z-axis rotation of hull
  turretRotation: number; // Y-axis rotation relative to hull
  gunElevation: number; // X-axis rotation of gun
  turretSwayOffset: number;
  gunSwayOffset: number;
  gunSightAimPoint: Vector3; // 3D world position of the gun sight aim point
  aimDir: Vector3; // Gun sight direction (unit vector)
  aimGunPivotWorld: Vector3; // Gun pivot position in world space
  health: number;
  maxHealth: number;
  armor: {
    front: number;
    side: number;
    rear: number;
    turret: number;
  };
  isPlayer: boolean;
  destroyed: boolean;
  destroyedAt: number; // timestamp when tank was destroyed (0 if alive)
  lastFireTime: number;

  // Track state
  trackHealth: { left: number; right: number };
  trackMaxHealth: { left: number; right: number };
  trackDestroyed: { left: boolean; right: boolean };

  // Awareness
  alertedBy?: string; // ID of tank that last hit us
  alertedAt?: number; // timestamp of last hit

  // Physics properties
  speed: number;
  engineRPM: number;
  gear: number;
  leftTrackSpeed: number;
  rightTrackSpeed: number;
}

export type GameScreen = 'oob-editor' | 'tank-select' | 'playing';
export type MapSize = 'small' | 'medium' | 'large';
export const MAP_SIZE_VALUES: Record<MapSize, number> = { small: 1000, medium: 2000, large: 4000 };

export interface OOBUnit {
  id: string;
  tankType: string;
  position: [number, number]; // XZ world coords (pre-mapScale)
  rotation: number;
}

const AXIS_NATIONALITIES: Record<string, boolean> = { 'Germany': true };
export function isAxisNationality(nationality: string) { return !!AXIS_NATIONALITIES[nationality]; }

function spawnTankDestructionEffect(
  spawnParticle: GameState['spawnParticle'],
  position: Vector3,
) {
  const bursts = [
    { offset: new Vector3(0, 1.8, 0), scale: 1.8 },
    { offset: new Vector3(1.2, 1.3, 0.7), scale: 1.15 },
    { offset: new Vector3(-1.1, 1.2, -0.8), scale: 1.1 },
    { offset: new Vector3(0.6, 2.2, -1.0), scale: 0.9 },
  ];

  for (const burst of bursts) {
    spawnParticle('tank_explosion', position.clone().add(burst.offset), new Vector3(0, 1, 0), burst.scale);
  }
}

function cloneAmmoSpec(ammoSpec: TankAmmoSpec): TankAmmoSpec {
  return {
    ...ammoSpec,
    historicalPenetration: ammoSpec.historicalPenetration
      ? {
          standard: ammoSpec.historicalPenetration.standard,
          points: ammoSpec.historicalPenetration.points.map((point) => ({...point})),
        }
      : undefined,
  };
}

function getAudioSourceRole(allies: TankData[], tankId: string): AudioSource {
  if (tankId === 'player') return 'player';
  return allies.some((ally) => ally.id === tankId) ? 'ally' : 'enemy';
}

interface GameState {
  gameScreen: GameScreen;
  mapSize: MapSize;
  playerTank: TankData;
  enemies: TankData[];
  allies: TankData[];
  projectiles: Projectile[];
  particles: Particle[];
  messages: { id: string; text: string; color: string; time: number }[];
  ammoType: AmmoType;
  lastFireTime: number;
  viewMode: 'third-person' | 'gunner';
  isMapMode: boolean;
  selectedAllyId: string | null;
  allyBaseMoveOrders: Record<string, AllyBaseMoveOrder>;
  allyFireOrders: Record<string, AllyFireOrder>;
  allyEngagementPostures: Record<string, AllyEngagementPosture>;
  allyWaypoints: Record<string, { x: number; y: number; z: number }>;
  calibrationDistance: number;
  gunnerZoom: number; // index into GUNNER_ZOOM_LEVELS
  trees: TreeInstance[];
  cameraShake: number; // current shake intensity (decays over time)
  playerBurstRemaining: number;
  playerBurstNextFireTime: number;
  playerMagazineRounds: number;
  playerNextFireTime: number;
  cameraYawAbs: number; // absolute camera yaw (hull rotation + mouse yaw)

  fireProjectile: (pos: Vector3, vel: Vector3, type: AmmoType, ammoSpec: TankAmmoSpec, dmg: number, firedBy: string, caliber: number) => void;
  removeProjectile: (id: string) => void;
  updateProjectiles: (dt: number) => void;
  updatePlayer: (updates: Partial<TankData>) => void;
  updateEnemy: (id: string, updates: Partial<TankData>) => void;
  addMessage: (text: string, color: string) => void;
  handleHit: (projectileId: string, hitTankId: string, hitPoint: Vector3, hitNormal: Vector3, plateInfo?: ArmorPlateHitInfo) => void;
  spawnEnemy: (position: Vector3, tankType?: string) => void;
  spawnAlly: (position: Vector3, tankType?: string) => void;
  updateAlly: (id: string, updates: Partial<TankData>) => void;
  spawnParticle: (type: Particle['type'], position: Vector3, normal?: Vector3, scale?: number) => void;
  removeParticle: (id: string) => void;
  toggleAmmo: () => void;
  toggleViewMode: () => void;
  toggleMapMode: () => void;
  selectAlly: (id: string | null) => void;
  setAllyBaseMoveOrder: (allyId: string, order: AllyBaseMoveOrder) => void;
  setAllyFireOrder: (allyId: string, order: AllyFireOrder) => void;
  setAllyEngagementPosture: (allyId: string, posture: AllyEngagementPosture) => void;
  issueAllyMoveOrder: (allyId: string, position: { x: number; y: number; z: number }) => void;
  clearAllyWaypoint: (allyId: string) => void;
  setCalibrationDistance: (dist: number) => void;
  zoomGunnerIn: () => void;
  zoomGunnerOut: () => void;
  setLastFireTime: (time: number) => void;
  setMapSize: (size: MapSize) => void;
  selectPlayerTank: (tankType: string) => void;
  setPlayerBurst: (remaining: number, nextTime: number) => void;
  setPlayerAutomaticState: (rounds: number, nextTime: number) => void;

  // OOB Editor state
  oobPlayerTankType: string;
  oobPlayerPosition: [number, number];
  oobEnemies: OOBUnit[];
  oobAllies: OOBUnit[];
  oobAllyCountry: string;
  oobEnemyCountry: string;
  oobSelectedUnitId: string | null;
  oobPlacementMode: 'enemy' | 'ally' | null;

  // OOB Editor actions
  setOobPlayerTankType: (tankType: string) => void;
  setOobPlayerPosition: (pos: [number, number]) => void;
  addOobUnit: (side: 'enemy' | 'ally', tankType: string, position: [number, number]) => void;
  removeOobUnit: (id: string) => void;
  updateOobUnit: (id: string, updates: Partial<OOBUnit>) => void;
  setOobSelectedUnit: (id: string | null) => void;
  setOobPlacementMode: (mode: 'enemy' | 'ally' | null) => void;
  setOobAllyCountry: (country: string) => void;
  setOobEnemyCountry: (country: string) => void;
  setGameScreen: (screen: GameScreen) => void;
  deployOob: () => void;
  triggerCameraShake: (intensity: number) => void;
  decayCameraShake: (dt: number) => void;
  setCameraYawAbs: (yaw: number) => void;
  initTrees: (trees: TreeInstance[]) => void;
  updateTree: (index: number, updates: Partial<TreeInstance>) => void;
}

const GRAVITY = GAME_CONFIG.physics.gravity;

function createTankData(tankType: string, isPlayer: boolean): TankData {
  const def = getTankDef(tankType);
  return {
    id: isPlayer ? 'player' : uuidv4(),
    tankType,
    position: new Vector3(0, 0, 0),
    rotation: isPlayer ? 0 : Math.random() * Math.PI * 2,
    pitch: 0,
    roll: 0,
    turretRotation: 0,
    gunElevation: 0,
    turretSwayOffset: 0,
    gunSwayOffset: 0,
    gunSightAimPoint: new Vector3(0, 0, 500),
    aimDir: new Vector3(0, 0, 1),
    aimGunPivotWorld: new Vector3(0, 0, 0),
    health: def.health,
    maxHealth: def.health,
    armor: { ...def.armor },
    isPlayer,
    destroyed: false,
    destroyedAt: 0,
    lastFireTime: 0,
    trackHealth: { left: def.trackHealth, right: def.trackHealth },
    trackMaxHealth: { left: def.trackHealth, right: def.trackHealth },
    trackDestroyed: { left: false, right: false },
    speed: 0,
    engineRPM: GAME_CONFIG.tank.idleRPM,
    gear: 0,
    leftTrackSpeed: 0,
    rightTrackSpeed: 0,
  };
}

function getInitialMagazineRounds(tankType: string): number {
  return getTankDef(tankType).automaticMagazineSize ?? 0;
}

export const useGameStore = create<GameState>((set, get) => ({
  gameScreen: 'oob-editor',
  mapSize: 'medium',
  playerTank: (() => {
    const def = getTankDef('sherman');
    return {
      id: 'player',
      tankType: 'sherman',
      position: new Vector3(0, 0, 0),
      rotation: 0,
      pitch: 0,
      roll: 0,
      turretRotation: 0,
      gunElevation: 0,
      turretSwayOffset: 0,
      gunSwayOffset: 0,
      gunSightAimPoint: new Vector3(0, 0, 500),
    aimDir: new Vector3(0, 0, 1),
    aimGunPivotWorld: new Vector3(0, 0, 0),
      health: def.health,
      maxHealth: def.health,
      armor: { ...def.armor },
      isPlayer: true,
      destroyed: false,
      destroyedAt: 0,
      lastFireTime: 0,
      trackHealth: { left: def.trackHealth, right: def.trackHealth },
      trackMaxHealth: { left: def.trackHealth, right: def.trackHealth },
      trackDestroyed: { left: false, right: false },
      speed: 0,
      engineRPM: GAME_CONFIG.tank.idleRPM,
      gear: 0,
      leftTrackSpeed: 0,
      rightTrackSpeed: 0,
    };
  })(),
  enemies: [],
  allies: [],
  projectiles: [],
  particles: [],
  messages: [],
  ammoType: 'AP',
  lastFireTime: 0,
  viewMode: 'third-person',
  isMapMode: false,
  selectedAllyId: null,
  allyBaseMoveOrders: {},
  allyFireOrders: {},
  allyEngagementPostures: {},
  allyWaypoints: {},
  calibrationDistance: 0,
  gunnerZoom: 1,
  trees: [],
  cameraShake: 0,
  playerBurstRemaining: 0,
  playerBurstNextFireTime: 0,
  playerMagazineRounds: getInitialMagazineRounds('sherman'),
  playerNextFireTime: 0,
  cameraYawAbs: 0,

  // OOB Editor initial state
  oobPlayerTankType: 'sherman',
  oobPlayerPosition: [0, 0] as [number, number],
  oobEnemies: [
    { id: uuidv4(), tankType: 'tiger', position: [80, 300] as [number, number], rotation: Math.PI },
    { id: uuidv4(), tankType: 'panzer3', position: [-120, 400] as [number, number], rotation: Math.PI },
    { id: uuidv4(), tankType: 'panzer3', position: [0, 500] as [number, number], rotation: Math.PI },
    { id: uuidv4(), tankType: 'panzer2', position: [-60, 360] as [number, number], rotation: Math.PI },
  ],
  oobAllies: [
    { id: uuidv4(), tankType: 'sherman', position: [20, 10] as [number, number], rotation: 0 },
    { id: uuidv4(), tankType: 'sherman', position: [-20, 15] as [number, number], rotation: 0 },
  ],
  oobAllyCountry: 'USA',
  oobEnemyCountry: 'Germany',
  oobSelectedUnitId: null,
  oobPlacementMode: null,

  // OOB Editor actions
  setOobPlayerTankType: (tankType) => set({ oobPlayerTankType: tankType }),
  setOobPlayerPosition: (pos) => set({ oobPlayerPosition: pos }),
  addOobUnit: (side, tankType, position) => {
    const unit: OOBUnit = { id: uuidv4(), tankType, position, rotation: side === 'enemy' ? Math.PI : 0 };
    set((state) => side === 'enemy'
      ? { oobEnemies: [...state.oobEnemies, unit] }
      : { oobAllies: [...state.oobAllies, unit] }
    );
  },
  removeOobUnit: (id) => set((state) => ({
    oobEnemies: state.oobEnemies.filter((u) => u.id !== id),
    oobAllies: state.oobAllies.filter((u) => u.id !== id),
    oobSelectedUnitId: state.oobSelectedUnitId === id ? null : state.oobSelectedUnitId,
  })),
  updateOobUnit: (id, updates) => set((state) => ({
    oobEnemies: state.oobEnemies.map((u) => u.id === id ? { ...u, ...updates } : u),
    oobAllies: state.oobAllies.map((u) => u.id === id ? { ...u, ...updates } : u),
  })),
  setOobSelectedUnit: (id) => set({ oobSelectedUnitId: id, oobPlacementMode: null }),
  setOobPlacementMode: (mode) => set({ oobPlacementMode: mode, oobSelectedUnitId: null }),
  setOobAllyCountry: (country) => {
    const firstTank = getAllTankDefs().find((t) => t.nationality === country);
    if (!firstTank) return;
    set((state) => ({
      oobAllyCountry: country,
      oobAllies: state.oobAllies.map((u) => ({ ...u, tankType: firstTank.id })),
    }));
  },
  setOobEnemyCountry: (country) => {
    const firstTank = getAllTankDefs().find((t) => t.nationality === country);
    if (!firstTank) return;
    set((state) => ({
      oobEnemyCountry: country,
      oobEnemies: state.oobEnemies.map((u) => ({ ...u, tankType: firstTank.id })),
    }));
  },
  setGameScreen: (screen) => set({ gameScreen: screen }),
  deployOob: () => {
    const state = get();
    const mapScale = MAP_SIZE_VALUES[state.mapSize] / 1000;

    // Create player tank
    const player = createTankData(state.oobPlayerTankType, true);
    const px = state.oobPlayerPosition[0] * mapScale;
    const pz = state.oobPlayerPosition[1] * mapScale;
    player.position = new Vector3(px, 0, pz);

    // Create enemies
    const enemies: TankData[] = state.oobEnemies.map((u) => {
      const t = createTankData(u.tankType, false);
      const ex = u.position[0] * mapScale;
      const ez = u.position[1] * mapScale;
      t.position = new Vector3(ex, 0, ez);
      t.rotation = u.rotation;
      return t;
    });

    // Create allies
    const allies: TankData[] = state.oobAllies.map((u) => {
      const t = createTankData(u.tankType, false);
      const ax = u.position[0] * mapScale;
      const az = u.position[1] * mapScale;
      t.position = new Vector3(ax, 0, az);
      t.rotation = u.rotation;
      return t;
    });

    const allyBaseMoveOrders = Object.fromEntries(allies.map((ally) => [ally.id, 'follow' as AllyBaseMoveOrder]));
    const allyFireOrders = Object.fromEntries(allies.map((ally) => [ally.id, 'fire-at-will' as AllyFireOrder]));
    const allyEngagementPostures = Object.fromEntries(allies.map((ally) => [ally.id, 'fire-from-position' as AllyEngagementPosture]));

    set({
      playerTank: player,
      enemies,
      allies,
      allyBaseMoveOrders,
      allyFireOrders,
      allyEngagementPostures,
      allyWaypoints: {},
      selectedAllyId: null,
      gameScreen: 'playing',
      ammoType: 'AP',
      playerBurstRemaining: 0,
      playerBurstNextFireTime: 0,
      playerMagazineRounds: getInitialMagazineRounds(player.tankType),
      playerNextFireTime: 0,
      projectiles: [],
      particles: [],
      messages: [],
    });
  },

  setCameraYawAbs: (yaw) => set({ cameraYawAbs: yaw }),

  setMapSize: (size) => set({ mapSize: size }),

  selectPlayerTank: (tankType) => {
    const newTank = createTankData(tankType, true);
    set({
      playerTank: newTank,
      gameScreen: 'playing',
      ammoType: 'AP',
      playerBurstRemaining: 0,
      playerBurstNextFireTime: 0,
      playerMagazineRounds: getInitialMagazineRounds(tankType),
      playerNextFireTime: 0,
    });
  },

  triggerCameraShake: (intensity) => set((state) => ({
    cameraShake: Math.max(state.cameraShake, intensity),
  })),

  decayCameraShake: (dt) => set((state) => ({
    cameraShake: Math.max(0, state.cameraShake - dt * 2.5),
  })),

  initTrees: (trees) => set({ trees }),

  updateTree: (index, updates) => {
    set((state) => {
      const newTrees = [...state.trees];
      newTrees[index] = { ...newTrees[index], ...updates };
      return { trees: newTrees };
    });
  },

  spawnParticle: (type, position, normal, scale) => {
    set((state) => ({
      particles: [
        ...state.particles,
        { id: uuidv4(), type, position, normal, scale, createdAt: Date.now() },
      ],
    }));
  },

  removeParticle: (id) => {
    set((state) => ({
      particles: state.particles.filter((p) => p.id !== id),
    }));
  },

  setPlayerBurst: (remaining, nextTime) => set({ playerBurstRemaining: remaining, playerBurstNextFireTime: nextTime }),
  setPlayerAutomaticState: (rounds, nextTime) => set({ playerMagazineRounds: rounds, playerNextFireTime: nextTime }),

  toggleAmmo: () => {
    const playerDef = getTankDef(get().playerTank.tankType);
    const available: AmmoType[] = ['AP'];
    if (playerDef.weapons.APC) available.push('APC');
    if (playerDef.weapons.HE) available.push('HE');
    if (available.length <= 1) return;
    set((state) => {
      const idx = available.indexOf(state.ammoType);
      return { ammoType: available[(idx + 1) % available.length] };
    });
  },
  toggleViewMode: () => set((state) => ({ viewMode: state.viewMode === 'third-person' ? 'gunner' : 'third-person' })),
  toggleMapMode: () => set((state) => ({ isMapMode: !state.isMapMode })),
  selectAlly: (id) => set({ selectedAllyId: id }),
  setAllyBaseMoveOrder: (allyId, order) => set((state) => {
    const { [allyId]: _, ...restWaypoints } = state.allyWaypoints;
    return {
      allyBaseMoveOrders: { ...state.allyBaseMoveOrders, [allyId]: order },
      allyWaypoints: restWaypoints,
    };
  }),
  setAllyFireOrder: (allyId, order) => set((state) => ({
    allyFireOrders: { ...state.allyFireOrders, [allyId]: order },
  })),
  setAllyEngagementPosture: (allyId, posture) => set((state) => ({
    allyEngagementPostures: { ...state.allyEngagementPostures, [allyId]: posture },
  })),
  issueAllyMoveOrder: (allyId, position) => set((state) => ({
    allyWaypoints: { ...state.allyWaypoints, [allyId]: position },
  })),
  clearAllyWaypoint: (allyId) => set((state) => {
    const { [allyId]: _, ...rest } = state.allyWaypoints;
    return { allyWaypoints: rest };
  }),
  setCalibrationDistance: (dist) => set({ calibrationDistance: dist }),
  zoomGunnerIn: () => set((state) => ({
    gunnerZoom: Math.min(state.gunnerZoom + 1, GUNNER_ZOOM_LEVELS.length - 1),
  })),
  zoomGunnerOut: () => set((state) => ({
    gunnerZoom: Math.max(state.gunnerZoom - 1, 0),
  })),
  setLastFireTime: (time) => set({ lastFireTime: time }),

  fireProjectile: (pos, vel, type, ammoSpec, dmg, firedBy, caliber) => {
    const scale = caliber / 75;
    set((state) => ({
      projectiles: [
        ...state.projectiles,
        {
          id: uuidv4(),
          origin: pos.clone(),
          position: pos.clone(),
          velocity: vel.clone(),
          type,
          ammoSpec: cloneAmmoSpec(ammoSpec),
          damage: dmg,
          caliber,
          firedBy,
          createdAt: Date.now(),
        },
      ],
    }));
    get().spawnParticle('fire', pos, vel.clone().normalize(), scale);
  },

  removeProjectile: (id) => {
    set((state) => ({
      projectiles: state.projectiles.filter((p) => p.id !== id),
    }));
  },

  updateProjectiles: (dt) => {
    set((state) => {
      const now = Date.now();
      const newProjectiles = state.projectiles
        .map((p) => {
          const { position, velocity } = stepProjectile(p.position, p.velocity, dt, GRAVITY);
          return { ...p, position, velocity };
        })
        .filter((p) => now - p.createdAt < 10000); // Remove if too old (terrain collision handled by ProjectileManager)

      return { projectiles: newProjectiles };
    });
  },

  updatePlayer: (updates) => {
    set((state) => ({ playerTank: { ...state.playerTank, ...updates } }));
  },

  updateEnemy: (id, updates) => {
    set((state) => ({
      enemies: state.enemies.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  },

  addMessage: (text, color) => {
    const id = uuidv4();
    set((state) => ({
      messages: [...state.messages.slice(-4), { id, text, color, time: Date.now() }],
    }));
    setTimeout(() => {
      set((state) => ({ messages: state.messages.filter((m) => m.id !== id) }));
    }, 3000);
  },

  handleHit: (projectileId, hitTankId, hitPoint, hitNormal, plateInfo) => {
    const state = get();
    const projectile = state.projectiles.find((p) => p.id === projectileId);
    if (!projectile) return;

    const scale = (projectile.caliber || 75) / 75;
    const sourceRole = getAudioSourceRole(state.allies, projectile.firedBy);

    // Remove projectile
    set((s) => ({ projectiles: s.projectiles.filter((p) => p.id !== projectileId) }));

    if (hitTankId === 'ground') {
      get().spawnParticle(projectile.type === 'HE' ? 'he_hit_ground' : 'hit_ground', hitPoint.clone(), hitNormal, scale);
      audioManager.playImpact({
        position: toAudioVec3(hitPoint),
        normal: toAudioVec3(hitNormal),
        source: sourceRole,
        target: 'terrain',
        caliber: projectile.caliber,
        projectileType: projectile.type,
        material: 'ground',
        result: 'ground',
      });
      return;
    }

    const target = hitTankId === 'player' ? state.playerTank : (state.enemies.find((e) => e.id === hitTankId) ?? state.allies.find((a) => a.id === hitTankId));
    if (!target || target.destroyed) return;
    const targetRole = getAudioSourceRole(state.allies, hitTankId);

    // Alert the hit tank — it now knows who attacked it
    if (hitTankId !== 'player') {
      const alertUpdate = { alertedBy: projectile.firedBy, alertedAt: Date.now() };
      if (state.allies.some(a => a.id === hitTankId)) {
        get().updateAlly(hitTankId, alertUpdate);
      } else {
        get().updateEnemy(hitTankId, alertUpdate);
      }
    }

    // Plate info carries armor thickness and zone directly
    const baseArmor = plateInfo?.armorThickness ?? target.armor.front;
    const faceName = plateInfo?.name ?? 'Unknown';
    const isTrackHit = plateInfo?.zone === 'track';
    const trackSide = plateInfo?.isTrack;

    // Calculate impact angle
    const { angleRad, angleDeg, isAutoRicochet } = analyzeImpact(projectile.velocity, hitNormal);

    // Auto-ricochet — spawn visible bouncing shell
    if (isAutoRicochet) {
      get().spawnParticle('ricochet_impact', hitPoint.clone(), hitNormal, scale);
      get().addMessage(`Ricochet! (${Math.round(angleDeg)}° on ${faceName})`, '#ffaa00');
      if (hitTankId === 'player') get().triggerCameraShake(0.4 * scale);
      audioManager.playImpact({
        position: toAudioVec3(hitPoint),
        normal: toAudioVec3(hitNormal),
        source: sourceRole,
        target: targetRole,
        caliber: projectile.caliber,
        projectileType: projectile.type,
        material: 'armor',
        result: 'ricochet',
      });

      // Create reflected projectile so the shell visibly bounces away
      const reflected = computeReflectedVelocity(projectile.velocity, hitNormal);
      set((s) => ({
        projectiles: [...s.projectiles, {
          id: uuidv4(), origin: projectile.position.clone(), position: projectile.position.clone(), velocity: reflected,
          type: projectile.type, ammoSpec: projectile.ammoSpec, damage: 0, caliber: projectile.caliber,
          firedBy: projectile.firedBy, ricochet: true, createdAt: Date.now(),
        }],
      }));
      return;
    }

    const effectiveArmor = computeEffectiveArmor(baseArmor, angleRad);
    const impactDistance = projectile.origin.distanceTo(hitPoint);
    const actualPen = rollPenetration(
      getAmmoPenetrationAtDistance(projectile.ammoSpec, projectile.type, projectile.caliber, impactDistance),
    );

    if (actualPen > effectiveArmor) {
      // Penetration!
      get().spawnParticle(projectile.type === 'HE' ? 'he_hit_penetrate' : 'hit_penetrate', hitPoint.clone(), hitNormal, scale);
      audioManager.playImpact({
        position: toAudioVec3(hitPoint),
        normal: toAudioVec3(hitNormal),
        source: sourceRole,
        target: targetRole,
        caliber: projectile.caliber,
        projectileType: projectile.type,
        material: 'armor',
        result: projectile.type === 'HE' ? 'blast' : 'penetration',
      });

      if (isTrackHit && trackSide) {
        // Track hit — damage track HP, not main HP
        const newTrackHealth = Math.max(0, target.trackHealth[trackSide] - projectile.damage);
        const trackDead = newTrackHealth <= 0;
        const updatedTrackHealth = { ...target.trackHealth, [trackSide]: newTrackHealth };
        const updatedTrackDestroyed = { ...target.trackDestroyed, [trackSide]: trackDead };

        if (hitTankId === 'player') {
          get().updatePlayer({ trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
          get().triggerCameraShake(0.7 * scale);
        } else if (state.allies.some(a => a.id === hitTankId)) {
          get().updateAlly(hitTankId, { trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
        } else {
          get().updateEnemy(hitTankId, { trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
        }

        if (trackDead) {
          get().addMessage(`${trackSide === 'left' ? 'Left' : 'Right'} Track Destroyed!`, '#ff4400');
        } else {
          get().addMessage(`${faceName} hit! (${Math.round(newTrackHealth)} HP remaining)`, '#ffaa00');
        }
      } else {
        // Normal armor hit — damage main HP
        const { damage: actualDamage, newHealth, destroyed } = computeDamage(
          projectile.type, projectile.damage, actualPen, effectiveArmor, target.health
        );
        const destroyedAt = destroyed ? Date.now() : target.destroyedAt;

        if (hitTankId === 'player') {
          get().updatePlayer({ health: newHealth, destroyed, destroyedAt });
          get().triggerCameraShake(1.0 * scale);
        } else if (state.allies.some(a => a.id === hitTankId)) {
          get().updateAlly(hitTankId, { health: newHealth, destroyed, destroyedAt });
        } else {
          get().updateEnemy(hitTankId, { health: newHealth, destroyed, destroyedAt });
        }

        get().addMessage(`Penetration! ${faceName} (${Math.round(actualPen)}mm vs ${Math.round(effectiveArmor)}mm at ${Math.round(angleDeg)}°)`, '#00ff00');
        if (destroyed) {
          spawnTankDestructionEffect(get().spawnParticle, target.position);
          const distance = state.playerTank.position.distanceTo(target.position);
          if (distance < 45) get().triggerCameraShake(Math.max(0.4, 1.8 - distance / 30));
          get().addMessage('Target Destroyed!', '#ff0000');
          audioManager.playExplosion({
            position: toAudioVec3(target.position),
            source: targetRole,
            scale,
          });
        }
      }
    } else {
      // Non-penetration
      get().spawnParticle('non_pen_impact', hitPoint.clone(), hitNormal, scale);
      if (hitTankId === 'player') get().triggerCameraShake(0.5 * scale);
      audioManager.playImpact({
        position: toAudioVec3(hitPoint),
        normal: toAudioVec3(hitNormal),
        source: sourceRole,
        target: targetRole,
        caliber: projectile.caliber,
        projectileType: projectile.type,
        material: 'armor',
        result: projectile.type === 'HE' ? 'blast' : 'non-penetration',
      });

      if (isTrackHit && trackSide && projectile.type === 'HE') {
        // HE splash on track
        const splashDamage = computeHESplashDamage(projectile.damage);
        const newTrackHealth = Math.max(0, target.trackHealth[trackSide] - splashDamage);
        const trackDead = newTrackHealth <= 0;
        const updatedTrackHealth = { ...target.trackHealth, [trackSide]: newTrackHealth };
        const updatedTrackDestroyed = { ...target.trackDestroyed, [trackSide]: trackDead };

        if (hitTankId === 'player') {
          get().updatePlayer({ trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
        } else if (state.allies.some(a => a.id === hitTankId)) {
          get().updateAlly(hitTankId, { trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
        } else {
          get().updateEnemy(hitTankId, { trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
        }
        get().addMessage(`HE Splash on ${faceName}! (-${Math.round(splashDamage)} track HP)`, '#ffaa00');
      } else if (projectile.type === 'HE' && !isTrackHit) {
        // HE splash on armor
        const splashDamage = computeHESplashDamage(projectile.damage);
        const newHealth = Math.max(0, target.health - splashDamage);
        const destroyed = newHealth <= 0;
        const destroyedAt = destroyed ? Date.now() : target.destroyedAt;

        if (hitTankId === 'player') {
          get().updatePlayer({ health: newHealth, destroyed, destroyedAt });
        } else if (state.allies.some(a => a.id === hitTankId)) {
          get().updateAlly(hitTankId, { health: newHealth, destroyed, destroyedAt });
        } else {
          get().updateEnemy(hitTankId, { health: newHealth, destroyed, destroyedAt });
        }
        get().addMessage(`HE Splash! ${faceName} (-${Math.round(splashDamage)} HP)`, '#ffaa00');
        if (destroyed) {
          spawnTankDestructionEffect(get().spawnParticle, target.position);
          const distance = state.playerTank.position.distanceTo(target.position);
          if (distance < 45) get().triggerCameraShake(Math.max(0.4, 1.8 - distance / 30));
          get().addMessage('Target Destroyed!', '#ff0000');
          audioManager.playExplosion({
            position: toAudioVec3(target.position),
            source: targetRole,
            scale,
          });
        }
      } else {
        get().addMessage(`Armor not pierced. ${faceName} (${Math.round(actualPen)}mm vs ${Math.round(effectiveArmor)}mm at ${Math.round(angleDeg)}°)`, '#aaaaaa');
      }
    }
  },

  spawnEnemy: (position, tankType = 'tiger') => {
    const enemy = createTankData(tankType, false);
    enemy.position = position;
    set((state) => ({
      enemies: [...state.enemies, enemy],
    }));
  },

  spawnAlly: (position, tankType = 'sherman') => {
    const ally = createTankData(tankType, false);
    ally.position = position;
    set((state) => ({
      allies: [...state.allies, ally],
    }));
  },

  updateAlly: (id, updates) => {
    set((state) => ({
      allies: state.allies.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  },
}));
