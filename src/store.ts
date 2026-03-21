import { create } from 'zustand';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from './config';

export type AmmoType = 'AP' | 'HE';

export interface Particle {
  id: string;
  type: 'fire' | 'hit_penetrate' | 'hit_bounce' | 'hit_ground' | 'tank_explosion' | 'dust';
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
  position: Vector3;
  rotation: number; // Y-axis rotation of hull
  pitch?: number; // X-axis rotation of hull
  roll?: number; // Z-axis rotation of hull
  turretRotation: number; // Y-axis rotation relative to hull
  gunElevation: number; // X-axis rotation of gun
  turretSwayOffset: number;
  gunSwayOffset: number;
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
  
  // Physics properties
  speed: number;
  engineRPM: number;
  gear: number;
  leftTrackSpeed: number;
  rightTrackSpeed: number;
}

interface GameState {
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
  
  fireProjectile: (pos: Vector3, vel: Vector3, type: AmmoType, pen: number, dmg: number, firedBy: string) => void;
  updateProjectiles: (dt: number) => void;
  updatePlayer: (updates: Partial<TankData>) => void;
  updateEnemy: (id: string, updates: Partial<TankData>) => void;
  addMessage: (text: string, color: string) => void;
  handleHit: (projectileId: string, hitTankId: string, hitNormal: Vector3, part?: 'hull' | 'turret') => void;
  spawnEnemy: (position: Vector3) => void;
  spawnParticle: (type: Particle['type'], position: Vector3, normal?: Vector3) => void;
  removeParticle: (id: string) => void;
  toggleAmmo: () => void;
  toggleViewMode: () => void;
  toggleMapMode: () => void;
  setCalibrationDistance: (dist: number) => void;
  setLastFireTime: (time: number) => void;
}

const GRAVITY = GAME_CONFIG.physics.gravity;

export const useGameStore = create<GameState>((set, get) => ({
  playerTank: {
    id: 'player',
    position: new Vector3(0, 0, 0),
    rotation: 0,
    pitch: 0,
    roll: 0,
    turretRotation: 0,
    gunElevation: 0,
    turretSwayOffset: 0,
    gunSwayOffset: 0,
    health: GAME_CONFIG.tank.player.health,
    maxHealth: GAME_CONFIG.tank.player.health,
    armor: { ...GAME_CONFIG.tank.player.armor },
    isPlayer: true,
    destroyed: false,
    lastFireTime: 0,
    speed: 0,
    engineRPM: GAME_CONFIG.tank.idleRPM,
    gear: 0,
    leftTrackSpeed: 0,
    rightTrackSpeed: 0,
  },
  enemies: [],
  projectiles: [],
  particles: [],
  messages: [],
  ammoType: 'AP',
  lastFireTime: 0,
  viewMode: 'third-person',
  isMapMode: false,
  calibrationDistance: 0,

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

  handleHit: (projectileId, hitTankId, hitNormal, part) => {
    const state = get();
    const projectile = state.projectiles.find((p) => p.id === projectileId);
    if (!projectile) return;

    // Remove projectile
    set((s) => ({ projectiles: s.projectiles.filter((p) => p.id !== projectileId) }));

    if (hitTankId === 'ground') {
      get().spawnParticle('hit_ground', projectile.position, hitNormal);
      return;
    }

    const target = hitTankId === 'player' ? state.playerTank : state.enemies.find((e) => e.id === hitTankId);
    if (!target || target.destroyed) return;

    // Calculate impact angle
    const projDir = projectile.velocity.clone().normalize();
    // Angle between inverted projectile direction and surface normal
    const angleRad = projDir.clone().negate().angleTo(hitNormal);
    const angleDeg = (angleRad * 180) / Math.PI;

    // Determine which armor face was hit based on normal
    const tankMatrix = new THREE.Matrix4();
    const euler = new THREE.Euler(target.pitch || 0, target.rotation, target.roll || 0, 'YXZ');
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    tankMatrix.compose(target.position, quaternion, new THREE.Vector3(1, 1, 1));
    
    let localNormal = hitNormal.clone();
    
    if (part === 'turret') {
      const turretMatrix = new THREE.Matrix4();
      const turretEuler = new THREE.Euler(0, target.turretRotation, 0, 'YXZ');
      const turretQuat = new THREE.Quaternion().setFromEuler(turretEuler);
      turretMatrix.compose(new THREE.Vector3(0, 1.2, 0.2), turretQuat, new THREE.Vector3(1, 1, 1));
      const worldTurretMatrix = tankMatrix.clone().multiply(turretMatrix);
      localNormal.transformDirection(worldTurretMatrix.invert()).normalize();
    } else {
      localNormal.transformDirection(tankMatrix.invert()).normalize();
    }

    let baseArmor = target.armor.front;
    let faceName = "Front";
    
    if (part === 'turret') {
      if (Math.abs(localNormal.x) > 0.5) {
        baseArmor = target.armor.turret * 0.6; // Side turret
        faceName = "Turret Side";
      } else if (localNormal.z < -0.5) {
        baseArmor = target.armor.turret * 0.4; // Rear turret
        faceName = "Turret Rear";
      } else if (localNormal.y > 0.5) {
        baseArmor = target.armor.turret * 0.2; // Top turret
        faceName = "Turret Roof";
      } else {
        baseArmor = target.armor.turret; // Front turret
        faceName = "Turret Front";
      }
    } else {
      if (Math.abs(localNormal.x) > 0.5) {
        baseArmor = target.armor.side;
        faceName = "Hull Side";
      } else if (localNormal.z < -0.5) {
        baseArmor = target.armor.rear;
        faceName = "Hull Rear";
      } else if (localNormal.y > 0.5) {
        baseArmor = target.armor.side * 0.5; // Top hull
        faceName = "Hull Roof";
      } else {
        baseArmor = target.armor.front;
        faceName = "Hull Front";
      }
    }

    // Effective armor calculation (LOS thickness)
    // If angle is too high, auto-ricochet
    if (angleDeg > GAME_CONFIG.weapons.autoRicochetAngle) {
      get().spawnParticle('hit_bounce', projectile.position, hitNormal);
      get().addMessage(`Ricochet! (${Math.round(angleDeg)}° on ${faceName})`, '#ffaa00');
      return;
    }

    const effectiveArmor = baseArmor / Math.cos(angleRad);
    
    // Randomize penetration slightly
    const variance = GAME_CONFIG.weapons.penetrationVariance;
    const actualPen = projectile.penetration * ((1 - variance) + Math.random() * (variance * 2));

    if (actualPen > effectiveArmor) {
      // Penetration!
      get().spawnParticle('hit_penetrate', projectile.position, hitNormal);
      
      // Calculate post-pen damage based on remaining penetration
      const overmatch = actualPen / effectiveArmor;
      let damageMult = 1.0;
      if (projectile.type === 'AP') {
        damageMult = Math.min(1.5, Math.max(0.5, overmatch));
      } else if (projectile.type === 'HE') {
        damageMult = 1.0; // HE always does full damage if it pens
      }
      
      const actualDamage = projectile.damage * damageMult;

      const newHealth = Math.max(0, target.health - actualDamage);
      const destroyed = newHealth <= 0;
      
      if (hitTankId === 'player') {
        get().updatePlayer({ health: newHealth, destroyed });
      } else {
        get().updateEnemy(hitTankId, { health: newHealth, destroyed });
      }

      get().addMessage(`Penetration! ${faceName} (${Math.round(actualPen)}mm vs ${Math.round(effectiveArmor)}mm at ${Math.round(angleDeg)}°)`, '#00ff00');
      if (destroyed) {
        get().spawnParticle('tank_explosion', target.position, new THREE.Vector3(0, 1, 0));
        get().addMessage('Target Destroyed!', '#ff0000');
      }
    } else {
      // Non-penetration
      get().spawnParticle('hit_bounce', projectile.position, hitNormal);
      
      // HE splash damage on non-pen
      if (projectile.type === 'HE') {
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

  spawnEnemy: (position) => {
    set((state) => ({
      enemies: [
        ...state.enemies,
        {
          id: uuidv4(),
          position,
          rotation: Math.random() * Math.PI * 2,
          pitch: 0,
          roll: 0,
          turretRotation: 0,
          gunElevation: 0,
          turretSwayOffset: 0,
          gunSwayOffset: 0,
          health: GAME_CONFIG.tank.enemy.health,
          maxHealth: GAME_CONFIG.tank.enemy.health,
          armor: { ...GAME_CONFIG.tank.enemy.armor },
          isPlayer: false,
          destroyed: false,
          lastFireTime: 0,
          speed: 0,
          engineRPM: GAME_CONFIG.tank.idleRPM,
          gear: 0,
          leftTrackSpeed: 0,
          rightTrackSpeed: 0,
        },
      ],
    }));
  },
}));
