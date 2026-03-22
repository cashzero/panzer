import { create } from 'zustand';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from './config';
import type { ArmorPlateHitInfo } from './armorModel';
import { getTankDef } from './tanks/registry';
import type { TreeInstance } from './trees';
import { analyzeImpact, computeReflectedVelocity, computeEffectiveArmor, rollPenetration, computeDamage, computeHESplashDamage } from './combatPhysics';
import { stepProjectile } from './projectilePhysics';

export type AmmoType = 'AP' | 'APC' | 'HE';

// Gunner sight zoom levels: FOV values in degrees (lower = more zoom)
export const GUNNER_ZOOM_LEVELS = [20, 10, 5, 2.5] as const;
export const GUNNER_ZOOM_LABELS = ['1x', '2x', '4x', '8x'] as const;

export interface Particle {
  id: string;
  type: 'fire' | 'hit_penetrate' | 'hit_bounce' | 'hit_ground' | 'tank_explosion' | 'dust' | 'dust_low' | 'he_hit_ground' | 'he_hit_penetrate' | 'burning_smoke' | 'tree_hit';
  position: Vector3;
  normal?: Vector3;
  scale?: number;
  createdAt: number;
}

export interface Projectile {
  id: string;
  position: Vector3;
  velocity: Vector3;
  type: AmmoType;
  penetration: number;
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

  // Physics properties
  speed: number;
  engineRPM: number;
  gear: number;
  leftTrackSpeed: number;
  rightTrackSpeed: number;
}

export type GameScreen = 'tank-select' | 'playing';
export type MapSize = 'small' | 'medium' | 'large';
export const MAP_SIZE_VALUES: Record<MapSize, number> = { small: 1000, medium: 2000, large: 4000 };

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
  calibrationDistance: number;
  gunnerZoom: number; // index into GUNNER_ZOOM_LEVELS
  trees: TreeInstance[];
  cameraShake: number; // current shake intensity (decays over time)
  playerBurstRemaining: number;
  playerBurstNextFireTime: number;
  cameraYawAbs: number; // absolute camera yaw (hull rotation + mouse yaw)

  fireProjectile: (pos: Vector3, vel: Vector3, type: AmmoType, pen: number, dmg: number, firedBy: string, caliber: number) => void;
  removeProjectile: (id: string) => void;
  updateProjectiles: (dt: number) => void;
  updatePlayer: (updates: Partial<TankData>) => void;
  updateEnemy: (id: string, updates: Partial<TankData>) => void;
  addMessage: (text: string, color: string) => void;
  handleHit: (projectileId: string, hitTankId: string, hitNormal: Vector3, plateInfo?: ArmorPlateHitInfo) => void;
  spawnEnemy: (position: Vector3, tankType?: string) => void;
  spawnAlly: (position: Vector3, tankType?: string) => void;
  updateAlly: (id: string, updates: Partial<TankData>) => void;
  spawnParticle: (type: Particle['type'], position: Vector3, normal?: Vector3, scale?: number) => void;
  removeParticle: (id: string) => void;
  toggleAmmo: () => void;
  toggleViewMode: () => void;
  toggleMapMode: () => void;
  setCalibrationDistance: (dist: number) => void;
  zoomGunnerIn: () => void;
  zoomGunnerOut: () => void;
  setLastFireTime: (time: number) => void;
  setMapSize: (size: MapSize) => void;
  selectPlayerTank: (tankType: string) => void;
  setPlayerBurst: (remaining: number, nextTime: number) => void;
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

export const useGameStore = create<GameState>((set, get) => ({
  gameScreen: 'tank-select',
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
  calibrationDistance: 0,
  gunnerZoom: 1,
  trees: [],
  cameraShake: 0,
  playerBurstRemaining: 0,
  playerBurstNextFireTime: 0,
  cameraYawAbs: 0,

  setCameraYawAbs: (yaw) => set({ cameraYawAbs: yaw }),

  setMapSize: (size) => set({ mapSize: size }),

  selectPlayerTank: (tankType) => {
    const newTank = createTankData(tankType, true);
    set({ playerTank: newTank, gameScreen: 'playing', ammoType: 'AP', playerBurstRemaining: 0, playerBurstNextFireTime: 0 });
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
  setCalibrationDistance: (dist) => set({ calibrationDistance: dist }),
  zoomGunnerIn: () => set((state) => ({
    gunnerZoom: Math.min(state.gunnerZoom + 1, GUNNER_ZOOM_LEVELS.length - 1),
  })),
  zoomGunnerOut: () => set((state) => ({
    gunnerZoom: Math.max(state.gunnerZoom - 1, 0),
  })),
  setLastFireTime: (time) => set({ lastFireTime: time }),

  fireProjectile: (pos, vel, type, pen, dmg, firedBy, caliber) => {
    const scale = caliber / 75;
    set((state) => ({
      projectiles: [
        ...state.projectiles,
        { id: uuidv4(), position: pos, velocity: vel, type, penetration: pen, damage: dmg, caliber, firedBy, createdAt: Date.now() },
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

  handleHit: (projectileId, hitTankId, hitNormal, plateInfo) => {
    const state = get();
    const projectile = state.projectiles.find((p) => p.id === projectileId);
    if (!projectile) return;

    const scale = (projectile.caliber || 75) / 75;

    // Remove projectile
    set((s) => ({ projectiles: s.projectiles.filter((p) => p.id !== projectileId) }));

    if (hitTankId === 'ground') {
      get().spawnParticle(projectile.type === 'HE' ? 'he_hit_ground' : 'hit_ground', projectile.position, hitNormal, scale);
      return;
    }

    const target = hitTankId === 'player' ? state.playerTank : (state.enemies.find((e) => e.id === hitTankId) ?? state.allies.find((a) => a.id === hitTankId));
    if (!target || target.destroyed) return;

    // Plate info carries armor thickness and zone directly
    const baseArmor = plateInfo?.armorThickness ?? target.armor.front;
    const faceName = plateInfo?.name ?? 'Unknown';
    const isTrackHit = plateInfo?.zone === 'track';
    const trackSide = plateInfo?.isTrack;

    // Calculate impact angle
    const { angleRad, angleDeg, isAutoRicochet } = analyzeImpact(projectile.velocity, hitNormal);

    // Auto-ricochet — spawn visible bouncing shell
    if (isAutoRicochet) {
      get().spawnParticle('hit_bounce', projectile.position, hitNormal, scale);
      get().addMessage(`Ricochet! (${Math.round(angleDeg)}° on ${faceName})`, '#ffaa00');
      if (hitTankId === 'player') get().triggerCameraShake(0.4 * scale);

      // Create reflected projectile so the shell visibly bounces away
      const reflected = computeReflectedVelocity(projectile.velocity, hitNormal);
      set((s) => ({
        projectiles: [...s.projectiles, {
          id: uuidv4(), position: projectile.position.clone(), velocity: reflected,
          type: projectile.type, penetration: 0, damage: 0, caliber: projectile.caliber,
          firedBy: projectile.firedBy, ricochet: true, createdAt: Date.now(),
        }],
      }));
      return;
    }

    const effectiveArmor = computeEffectiveArmor(baseArmor, angleRad);
    const actualPen = rollPenetration(projectile.penetration);

    if (actualPen > effectiveArmor) {
      // Penetration!
      get().spawnParticle(projectile.type === 'HE' ? 'he_hit_penetrate' : 'hit_penetrate', projectile.position, hitNormal, scale);

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
          get().spawnParticle('tank_explosion', target.position, new THREE.Vector3(0, 1, 0));
          get().addMessage('Target Destroyed!', '#ff0000');
        }
      }
    } else {
      // Non-penetration
      get().spawnParticle(projectile.type === 'HE' ? 'he_hit_penetrate' : 'hit_bounce', projectile.position, hitNormal, scale);
      if (hitTankId === 'player') get().triggerCameraShake(0.5 * scale);

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
          get().spawnParticle('tank_explosion', target.position, new THREE.Vector3(0, 1, 0));
          get().addMessage('Target Destroyed!', '#ff0000');
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
