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
      // Layer A: base harmonic (road/track vibration)
      baseAmplitude: 0.012,                // rad at full speed (~0.7 deg)
      baseFrequencies: [1.8, 3.1, 2.4] as const, // Hz, incommensurate for organic feel

      // Layer B: terrain bump response
      terrainPitchGain: 0.4,              // pitch rate -> gun impulse
      terrainRollGain: 0.35,              // roll rate -> turret impulse

      // Layer C: inertial effects (acceleration/deceleration)
      inertiaLongitudinal: 0.008,         // accel -> gun pitch (brake = gun up)
      inertiaLateral: 0.015,              // yaw accel -> turret swing

      // Layer D: centrifugal turn sway
      centrifugalGain: 0.003,             // rotSpeed * fwdSpeed -> turret offset

      // Spring-damper settling
      springK: 25,                        // spring stiffness
      damping: 4.0,                       // damping coefficient
      maxSway: 0.06,                      // rad hard clamp
    },
    collisionRadius: 3.0, // meters, approximate circle for tank-tank collision
    idleRPM: 800,
    maxRPM: 2800,
    colors: {
      destroyed: '#2c3e50',
      trackDark: '#111',
      trackLight: '#333',
    },
    trackDamage: {
      trackArmor: 20, // mm
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
    aimDispersion: 0.03, // rad (~1.7°) — per-enemy aim offset that drifts over time
    fireDispersion: 0.015, // rad — additional random spread applied at fire time
    zeroInTime: 8, // seconds of steady aiming to reach minimum dispersion
    zeroInMinFactor: 0.15, // minimum dispersion multiplier (15% of base) when fully zeroed
    movementThreshold: 0.5, // m/s — speed below this counts as "stationary"
  },
  weapons: {
    AP: { damage: 300, penetration: 400, velocity: 300, drop: 0.1 },
    HE: { damage: 500, penetration: 50, velocity: 80, drop: 0.5 },
    enemy: { damage: 200, penetration: 150, velocity: 100, drop: 0.3 },
    reloadTime: 4000, // ms
    autoRicochetAngle: 70, // degrees
    penetrationVariance: 0.1, // +/- 10%
  },
  roads: {
    halfWidth: 4,
    blendMargin: 2,
    speedBonus: 1.15,
    color: 0x8b7355,
    grassColor: 0x556b2f,
  },
  trees: {
    count: 300,
    minSpacing: 8,
    trunkRadius: 0.3,
    collisionRadius: 1.0,
    knockdownSpeed: 5,
    health: 100,
    exclusionFromRoad: 5,
    exclusionFromCenter: 60,
    maxPlacementRadius: 450,
    seed: 42,
  },
  map: {
    defaultZoom: 150,
    minZoom: 30,
    maxZoom: 400,
    zoomStep: 10,
    panSpeed: 0.5,
  },
  particles: {
    fire: { lifetime: 300, color: '#ffaa00', size: 1.5, expand: true },
    hit_penetrate: { lifetime: 800, color: '#ff3300', size: 2, expand: true },
    hit_bounce: { lifetime: 400, color: '#ffff00', size: 0.8, expand: false },
    hit_ground: { lifetime: 1000, color: '#8b5a2b', size: 3, expand: true },
    tank_explosion: { lifetime: 1500, color: '#ff5500', size: 5, expand: true },
    he_hit_ground: { lifetime: 1200, color: '#ff5500', size: 4, expand: true },
    he_hit_penetrate: { lifetime: 1000, color: '#ff4400', size: 3.5, expand: true },
    dust: { lifetime: 2000, color: '#c2b280', size: 2.5, expand: true,
      speedThreshold: 8,      // minimum forward speed to spawn dust
      turnSpeedThreshold: 6,  // minimum turn speed to spawn dust
      minSpawnInterval: 80,   // ms, fastest spawn rate at max speed
      maxSpawnInterval: 200,  // ms, slowest spawn rate at threshold speed
      spawnSpeedScale: 8,     // interval reduction per m/s above threshold
      allowReverse: false,    // whether reversing generates dust
    },
    dust_low: {
      lifetime: 1000,
      color: '#c2b280',
      size: 1.0,
      expand: true,
      speedThreshold: 0.5,
      spawnInterval: 350,
    },
    burning_smoke: { lifetime: 3000, color: '#111111', size: 3.5, expand: true,
      spawnInterval: 150,  // ms between smoke puffs
    },
    tree_hit: { lifetime: 800, color: '#8b6914', size: 2, expand: true },
    default: { lifetime: 500, color: '#ffffff', size: 1, expand: true },
  },
};
