export const GAME_CONFIG = {
  physics: {
    gravity: 9.81,
  },
  tank: {
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
    bodyRock: {
      pitchAmplitude: 0.015,   // rad (~0.9°) max pitch oscillation at full speed
      rollAmplitude: 0.01,     // rad (~0.6°) max roll oscillation at full speed
      yBounceAmplitude: 0.06,  // meters vertical bounce at full speed
      pitchFrequency: 2.5,     // Hz — track link rhythm
      rollFrequency: 1.7,      // Hz — lateral sway (different from pitch for organic feel)
      yBounceFrequency: 3.2,   // Hz — suspension bounce
      turnRollGain: 0.03,      // rad per rad/s of rotation speed (centrifugal lean)
    },
    collisionRadius: 3.0, // meters, approximate circle for tank-tank collision
    idleRPM: 800,
    maxRPM: 2800,
    colors: {
      destroyed: '#2c3e50',
      trackDark: '#24251f',
      trackLight: '#55564d',
    },
    trackDamage: {
      trackArmor: 20, // mm
    },
    trackRepair: {
      durationMs: 12000,
      restoredHealthFraction: 0.4,
      stationarySpeedThreshold: 0.15,
      recentCombatPauseMs: 4000,
    },
  },
  camera: {
    distance: 12,
    heightOffset: 4.5,
  },
  ai: {
    detectionDistance: 800,
    returnFireThreatDistance: 180,
    spottingRange: 900,
    spottingRevealDelayMs: 350,
    spottingPersistenceMs: 1800,
    moveArrivalDistance: 5,
    obstacleAvoidance: {
      lookAheadDistance: 22,
      spreadDegrees: 55,
      sampleCount: 4,
      clearanceMargin: 1.25,
    },
    alertDecayTime: 30000, // ms — alert from being hit decays after 30s
    turretSpeed: 0.05,
    gunSpeed: 0.1,
    initialAimDispersion: 0.0022, // rad — first-shot aim offset before any correction shots
    minAimDispersion: 0.00045, // rad — persistent aim offset after walking rounds onto target
    initialFireDispersion: 0.0012, // rad — first-shot random spread at trigger pull
    minFireDispersion: 0.0002, // rad — trigger-pull spread after enough ranging shots
    shotsToMaxAccuracy: 4, // shots on the same target to reach best practical precision
    fireTurretThreshold: 0.012, // rad (~0.7°) — require tighter lateral alignment before firing
    fireElevationThreshold: 0.01, // rad (~0.57°) — require tighter elevation alignment before firing
  },
  combat: {
    autoRicochetAngle: 70, // degrees
    penetrationVariance: 0.1, // +/- 10%
    referencePenetrationDistance: 100, // meters
    generatedPenetration: {
      velocityBaseFactor: 4.5,
      caliberFactor: 1 / 30,
      exponent: {
        AP: 1.5,
        APC: 1.6,
        HE: 0.15,
      },
    },
  },
  roads: {
    halfWidth: 4,
    blendMargin: 2,
    speedBonus: 1.15,
    color: 0x8b7355,
    grassColor: 0x556b2f,
  },
  world: {
    seed: 19440606,
  },
  buildings: {
    roadsideSpacing: 120,
    roadsideChance: 0.42,
    roadsideSetback: 10,
    minSpacing: 14,
    maxSlopeDelta: 2.8,
    placementMaxSlopeDelta: 0.65,
    exclusionFromCenter: 80,
    villageFlattenRadius: 90,
    villageCoreRadius: 46,
    foundationFlatMargin: 3,
    footprintFlattenMargin: 16,
    junctionClusterMin: 3,
    junctionClusterMax: 6,
  },
  farmland: {
    color: 0x6c6a2e,
    edgeBlend: 8,
    treeExclusionMargin: 6,
    villageTreeSuppressionRadius: 120,
    villageTreeSuppressionChance: 0.55,
  },
  trees: {
    count: 300,
    minSpacing: 8,
    trunkRadius: 0.3,
    collisionRadius: 1.0,
    knockdownSpeed: 5,
    health: 100,
    exclusionFromRoad: 5,
    exclusionFromBuilding: 8,
    exclusionFromCenter: 60,
    maxPlacementRadius: 450,
    seed: 42,
  },
  mobility: {
    accelPivotHpPerTon: 12.0,  // hp/t reference point
    accelBase: 3.5,             // m/s² at pivot
    accelScale: 0.95,           // m/s² per hp/t above pivot
  },
  map: {
    defaultZoom: 150,
    minZoom: 30,
    maxZoom: 800,
    zoomStep: 10,
    panSpeed: 0.5,
  },
  tracers: {
    tracerLength: 14,        // m, streak length at the reference muzzle velocity
    referenceSpeed: 750,     // m/s, speed at which the streak reaches tracerLength
    tracerColor: '#ff6a1f',
    ricochetColor: '#ff4210',
    tracerFadeTime: 160,     // ms, streak collapses into the impact point after the shell stops
    width: 0.09,             // m, glowing core width for a 75mm shell (scales with caliber)
    minPixelWidth: 3,        // px, keeps distant tracers readable
    intensity: 16,           // HDR multiplier so the bloom pass catches the hot core
  },
  impactDecals: {
    lifetime: 45000,         // ms before a crater has fully faded
    fadeTime: 12000,         // ms of fade-out at the end of the lifetime
    maxCount: 96,
  },
  trackEffects: {
    minSpeed: 0.6,              // m/s of track motion before turf or mud is thrown
    fullSpeed: 8,               // m/s at which spawn rate and intensity peak
    minSpawnInterval: 70,       // ms between bursts at full speed
    maxSpawnInterval: 240,      // ms between bursts at minimum speed
    surfaceSampleInterval: 250, // ms between ground surface lookups per tank
    maxCameraDistance: 220,     // m, no track particles beyond this range
  },
  trackMarks: {
    segmentLength: 0.8,         // m of travel per mark quad
    lifetime: 40000,            // ms before a mark has fully faded
    fadeTime: 15000,            // ms of fade-out at the end of the lifetime
    maxCount: 4096,
  },
  particles: {
    fire: { lifetime: 1200, color: '#ffaa00', size: 1.5, expand: true },
    hit_penetrate: { lifetime: 1800, color: '#ff3300', size: 2, expand: true },
    hit_bounce: { lifetime: 400, color: '#ffff00', size: 0.8, expand: false },
    non_pen_impact: { lifetime: 680, color: '#ffd46b', size: 2.9, expand: false },
    ricochet_impact: { lifetime: 740, color: '#ffe08c', size: 3.4, expand: false },
    hit_ground: { lifetime: 1400, color: '#8b5a2b', size: 3, expand: true },
    tank_explosion: { lifetime: 2200, color: '#ff5500', size: 8, expand: true },
    he_hit_ground: { lifetime: 1800, color: '#ff5500', size: 4, expand: true },
    he_hit_penetrate: { lifetime: 1800, color: '#ff4400', size: 3.5, expand: true },
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
    // Off-road track effects; the surface under each track picks grass or mud.
    track_grass: { lifetime: 1200, color: '#4d6b2a', size: 1.0, expand: true },
    track_mud: { lifetime: 1400, color: '#4a3520', size: 1.0, expand: true },
    burning_smoke: { lifetime: 5000, color: '#111111', size: 3.5, expand: true,
      spawnInterval: 150,  // ms between smoke puffs at full intensity
      initialDelay: 1000,  // ms before wreck smoke begins
      rampUpDuration: 3500, // ms to reach full smoke density
    },
    tree_hit: { lifetime: 800, color: '#8b6914', size: 2, expand: true },
    default: { lifetime: 500, color: '#ffffff', size: 1, expand: true },
  },
};

export function computeAccelFromHpWeight(hp: number, weightTonnes: number): number {
  const hpPerTon = hp / weightTonnes;
  const { accelPivotHpPerTon, accelBase, accelScale } = GAME_CONFIG.mobility;
  return Math.max(2.0, accelBase + (hpPerTon - accelPivotHpPerTon) * accelScale);
}
