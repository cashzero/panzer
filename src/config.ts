export const GAME_CONFIG = {
  physics: {
    gravity: 9.81,
  },
  tank: {
    maxSpeed: 12, // m/s
    maxReverseSpeed: 5, // m/s
    acceleration: 6, // m/s^2
    deceleration: 10, // m/s^2
    trackWidth: 3.2, // meters
    turretSpeed: 0.1, // rad/s
    gunSpeed: 0.1, // rad/s
    gunSway: {
      movingAmount: 0.05, // rad
      frequency: 10, // Hz
    },
    idleRPM: 800,
    maxRPM: 2800,
    colors: {
      player: '#4a5d23',
      enemy: '#7f8c8d',
      destroyed: '#2c3e50',
      trackDark: '#111',
      trackLight: '#333',
    },
    player: {
      health: 1000,
      armor: { front: 100, side: 50, rear: 30, turret: 120 },
    },
    enemy: {
      health: 500,
      armor: { front: 80, side: 40, rear: 20, turret: 100 },
    },
  },
  camera: {
    distance: 12,
    heightOffset: 4.5,
  },
  ai: {
    engagementDistance: 200,
    turretSpeed: 0.05,
    gunSpeed: 0.1,
    reloadTime: 5000, // ms
  },
  weapons: {
    AP: { damage: 300, penetration: 400, velocity: 300, drop: 0.1 },
    HE: { damage: 500, penetration: 50, velocity: 80, drop: 0.5 },
    enemy: { damage: 200, penetration: 150, velocity: 100, drop: 0.3 },
    reloadTime: 4000, // ms
    autoRicochetAngle: 70, // degrees
    penetrationVariance: 0.1, // +/- 10%
  },
  particles: {
    fire: { lifetime: 300, color: '#ffaa00', size: 1.5, expand: true },
    hit_penetrate: { lifetime: 800, color: '#ff3300', size: 2, expand: true },
    hit_bounce: { lifetime: 400, color: '#ffff00', size: 0.8, expand: false },
    hit_ground: { lifetime: 1000, color: '#8b5a2b', size: 3, expand: true },
    tank_explosion: { lifetime: 1500, color: '#ff5500', size: 5, expand: true },
    dust: { lifetime: 2000, color: '#c2b280', size: 2.5, expand: true },
    default: { lifetime: 500, color: '#ffffff', size: 1, expand: true },
  },
};
