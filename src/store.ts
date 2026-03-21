import { create } from 'zustand';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from './config';
import type { ArmorPlateHitInfo } from './armorModel';
import { getTankDef } from './tanks/registry';
import type { TreeInstance } from './trees';

export type AmmoType = 'AP' | 'HE';

export interface Particle {
  id: string;
  type: 'fire' | 'hit_penetrate' | 'hit_bounce' | 'hit_ground' | 'tank_explosion' | 'dust' | 'dust_low' | 'he_hit_ground' | 'he_hit_penetrate' | 'burning_smoke' | 'tree_hit';
  position: Vector3;
  normal?: Vector3;
  createdAt: number;
}

export interface Projectile {
  id: string;
  position: Vector3;
  velocity: Vector3;
  type: AmmoType;
  penetration: number;
  damage: number;
  firedBy: string;
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

interface GameState {
  gameScreen: GameScreen;
  playerTank: TankData;
  enemies: TankData[];
  projectiles: Projectile[];
  particles: Particle[];
  messages: { id: string; text: string; color: string; time: number }[];
  ammoType: AmmoType;
  lastFireTime: number;
  viewMode: 'third-person' | 'gunner';
  isMapMode: boolean;
  calibrationDistance: number;
  trees: TreeInstance[];
  cameraShake: number; // current shake intensity (decays over time)

  fireProjectile: (pos: Vector3, vel: Vector3, type: AmmoType, pen: number, dmg: number, firedBy: string) => void;
  updateProjectiles: (dt: number) => void;
  updatePlayer: (updates: Partial<TankData>) => void;
  updateEnemy: (id: string, updates: Partial<TankData>) => void;
  addMessage: (text: string, color: string) => void;
  handleHit: (projectileId: string, hitTankId: string, hitNormal: Vector3, plateInfo?: ArmorPlateHitInfo) => void;
  spawnEnemy: (position: Vector3, tankType?: string) => void;
  spawnParticle: (type: Particle['type'], position: Vector3, normal?: Vector3) => void;
  removeParticle: (id: string) => void;
  toggleAmmo: () => void;
  toggleViewMode: () => void;
  toggleMapMode: () => void;
  setCalibrationDistance: (dist: number) => void;
  setLastFireTime: (time: number) => void;
  selectPlayerTank: (tankType: string) => void;
  triggerCameraShake: (intensity: number) => void;
  decayCameraShake: (dt: number) => void;
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
    health: def.health,
    maxHealth: def.health,
    armor: { ...def.armor },
    isPlayer,
    destroyed: false,
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
      health: def.health,
      maxHealth: def.health,
      armor: { ...def.armor },
      isPlayer: true,
      destroyed: false,
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
  projectiles: [],
  particles: [],
  messages: [],
  ammoType: 'AP',
  lastFireTime: 0,
  viewMode: 'third-person',
  isMapMode: false,
  calibrationDistance: 0,
  trees: [],
  cameraShake: 0,

  selectPlayerTank: (tankType) => {
    const newTank = createTankData(tankType, true);
    set({ playerTank: newTank, gameScreen: 'playing' });
  },

  triggerCameraShake: (intensity) => set((state) => ({
    cameraShake: Math.max(state.cameraShake, intensity),
  })),

  decayCameraShake: (dt) => set((state) => ({
    cameraShake: Math.max(0, state.cameraShake - dt * 4.0),
  })),

  initTrees: (trees) => set({ trees }),

  updateTree: (index, updates) => {
    set((state) => {
      const newTrees = [...state.trees];
      newTrees[index] = { ...newTrees[index], ...updates };
      return { trees: newTrees };
    });
  },

  spawnParticle: (type, position, normal) => {
    set((state) => ({
      particles: [
        ...state.particles,
        { id: uuidv4(), type, position, normal, createdAt: Date.now() },
      ],
    }));
  },

  removeParticle: (id) => {
    set((state) => ({
      particles: state.particles.filter((p) => p.id !== id),
    }));
  },

  toggleAmmo: () => set((state) => ({ ammoType: state.ammoType === 'AP' ? 'HE' : 'AP' })),
  toggleViewMode: () => set((state) => ({ viewMode: state.viewMode === 'third-person' ? 'gunner' : 'third-person' })),
  toggleMapMode: () => set((state) => ({ isMapMode: !state.isMapMode })),
  setCalibrationDistance: (dist) => set({ calibrationDistance: dist }),
  setLastFireTime: (time) => set({ lastFireTime: time }),

  fireProjectile: (pos, vel, type, pen, dmg, firedBy) => {
    set((state) => ({
      projectiles: [
        ...state.projectiles,
        { id: uuidv4(), position: pos, velocity: vel, type, penetration: pen, damage: dmg, firedBy, createdAt: Date.now() },
      ],
    }));
    get().spawnParticle('fire', pos, vel.clone().normalize());
  },

  updateProjectiles: (dt) => {
    set((state) => {
      const now = Date.now();
      const newProjectiles = state.projectiles
        .map((p) => {
          const newPos = p.position.clone().add(p.velocity.clone().multiplyScalar(dt));
          const newVel = p.velocity.clone();
          newVel.y -= GRAVITY * dt; // Apply gravity
          return { ...p, position: newPos, velocity: newVel };
        })
        .filter((p) => p.position.y > -1 && now - p.createdAt < 10000); // Remove if below ground or too old

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

    // Remove projectile
    set((s) => ({ projectiles: s.projectiles.filter((p) => p.id !== projectileId) }));

    if (hitTankId === 'ground') {
      get().spawnParticle(projectile.type === 'HE' ? 'he_hit_ground' : 'hit_ground', projectile.position, hitNormal);
      return;
    }

    const target = hitTankId === 'player' ? state.playerTank : state.enemies.find((e) => e.id === hitTankId);
    if (!target || target.destroyed) return;

    // Plate info carries armor thickness and zone directly
    const baseArmor = plateInfo?.armorThickness ?? target.armor.front;
    const faceName = plateInfo?.name ?? 'Unknown';
    const isTrackHit = plateInfo?.zone === 'track';
    const trackSide = plateInfo?.isTrack;

    // Calculate impact angle
    const projDir = projectile.velocity.clone().normalize();
    const angleRad = projDir.clone().negate().angleTo(hitNormal);
    const angleDeg = (angleRad * 180) / Math.PI;

    // Auto-ricochet
    if (angleDeg > GAME_CONFIG.combat.autoRicochetAngle) {
      get().spawnParticle('hit_bounce', projectile.position, hitNormal);
      get().addMessage(`Ricochet! (${Math.round(angleDeg)}° on ${faceName})`, '#ffaa00');
      if (hitTankId === 'player') get().triggerCameraShake(0.4);
      return;
    }

    const effectiveArmor = baseArmor / Math.cos(angleRad);

    // Randomize penetration
    const variance = GAME_CONFIG.combat.penetrationVariance;
    const actualPen = projectile.penetration * ((1 - variance) + Math.random() * (variance * 2));

    if (actualPen > effectiveArmor) {
      // Penetration!
      get().spawnParticle(projectile.type === 'HE' ? 'he_hit_penetrate' : 'hit_penetrate', projectile.position, hitNormal);

      if (isTrackHit && trackSide) {
        // Track hit — damage track HP, not main HP
        const newTrackHealth = Math.max(0, target.trackHealth[trackSide] - projectile.damage);
        const trackDead = newTrackHealth <= 0;
        const updatedTrackHealth = { ...target.trackHealth, [trackSide]: newTrackHealth };
        const updatedTrackDestroyed = { ...target.trackDestroyed, [trackSide]: trackDead };

        if (hitTankId === 'player') {
          get().updatePlayer({ trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
          get().triggerCameraShake(0.7);
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
        const overmatch = actualPen / effectiveArmor;
        let damageMult = 1.0;
        if (projectile.type === 'AP') {
          damageMult = Math.min(1.5, Math.max(0.5, overmatch));
        }

        const actualDamage = projectile.damage * damageMult;
        const newHealth = Math.max(0, target.health - actualDamage);
        const destroyed = newHealth <= 0;

        if (hitTankId === 'player') {
          get().updatePlayer({ health: newHealth, destroyed });
          get().triggerCameraShake(1.0);
        } else {
          get().updateEnemy(hitTankId, { health: newHealth, destroyed });
        }

        get().addMessage(`Penetration! ${faceName} (${Math.round(actualPen)}mm vs ${Math.round(effectiveArmor)}mm at ${Math.round(angleDeg)}°)`, '#00ff00');
        if (destroyed) {
          get().spawnParticle('tank_explosion', target.position, new THREE.Vector3(0, 1, 0));
          get().addMessage('Target Destroyed!', '#ff0000');
        }
      }
    } else {
      // Non-penetration
      get().spawnParticle(projectile.type === 'HE' ? 'he_hit_penetrate' : 'hit_bounce', projectile.position, hitNormal);
      if (hitTankId === 'player') get().triggerCameraShake(0.5);

      if (isTrackHit && trackSide && projectile.type === 'HE') {
        // HE splash on track
        const splashDamage = projectile.damage * 0.2;
        const newTrackHealth = Math.max(0, target.trackHealth[trackSide] - splashDamage);
        const trackDead = newTrackHealth <= 0;
        const updatedTrackHealth = { ...target.trackHealth, [trackSide]: newTrackHealth };
        const updatedTrackDestroyed = { ...target.trackDestroyed, [trackSide]: trackDead };

        if (hitTankId === 'player') {
          get().updatePlayer({ trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
        } else {
          get().updateEnemy(hitTankId, { trackHealth: updatedTrackHealth, trackDestroyed: updatedTrackDestroyed });
        }
        get().addMessage(`HE Splash on ${faceName}! (-${Math.round(splashDamage)} track HP)`, '#ffaa00');
      } else if (projectile.type === 'HE' && !isTrackHit) {
        // HE splash on armor
        const splashDamage = projectile.damage * 0.2;
        const newHealth = Math.max(0, target.health - splashDamage);
        const destroyed = newHealth <= 0;

        if (hitTankId === 'player') {
          get().updatePlayer({ health: newHealth, destroyed });
        } else {
          get().updateEnemy(hitTankId, { health: newHealth, destroyed });
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
}));
