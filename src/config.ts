export const GAME_CONFIG = {
  physics: {
    gravity: 9.81,
    maxFrameDelta: 0.05,     // s; longer player frames (tab switch, hitch) are simulated as this
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
    drive: {
      // Share of top speed held while turning under power, from standstill to full speed.
      steerSpeedScale: [0.65, 0.8] as [number, number],
      // Share of the turn-rate limit available at full speed, so fast turns stay broad.
      highSpeedYawScale: 0.7,
      // Share of the turn-rate limit available for a stationary pivot.
      pivotYawScale: 0.75,
    },
    collisionRadius: 3.0, // meters, approximate circle for tank-tank collision
    idleRPM: 800,
    maxRPM: 2800,
    colors: {
      destroyed: '#2a2622', // burnt-out, sooted steel
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
    heightSmoothing: 0.12,   // s time constant; filters suspension bounce out of the follow height
    groundClearance: 1.2,    // m the third-person camera keeps above the terrain
    zoomSmoothing: 0.07,     // s time constant for gunner sight zoom steps
  },
  ai: {
    detectionDistance: 800,
    returnFireThreatDistance: 180,
    spottingRange: 900,
    spottingRevealDelayMs: 350,
    spottingPersistenceMs: 1800,
    // Line-of-sight sweeps run at this cadence rather than every rendered frame.
    spottingIntervalMs: 100,
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
    // Own line-of-sight re-check cadence per AI tank before it may fire.
    fireLosIntervalMs: 300,
    tactics: {
      minRange: 150, // m — nearest preferred standoff when the gun works at range
      maxRange: 750, // m — farthest preferred standoff; stays inside detection distance
      rangeHorizon: 1500, // m — farthest range a matchup is evaluated to
      penetrationMargin: 1.05, // our penetration must beat effective armour by this factor
      hullAngleDeg: 30, // front plate angled this far off the enemy when holding
      movingFireDispersion: 0.005, // rad — extra spread firing at full speed
      replanIntervalMs: 7000, // re-choose a fighting position this often
      blindReplanMs: 2500, // re-choose sooner when the target stays out of sight
      withdrawHealth: 0.35, // fraction of health below which an outgunned tank breaks contact
      shortHaltMs: 2200, // assault and flank tanks stop this long to fire
      searchMemoryMs: 90000, // last known enemy positions are hunted for this long
      probeStandoff: 350, // m — before contact, attackers halt this short of the enemy's deployment
      goalReached: 6, // m — a fighting position counts as reached this close
      waypointReached: 15, // m — a default waypoint counts as reached this close
      stuckMs: 5000, // no headway toward the goal for this long counts as stuck
    },
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
    sunkenDepth: 0.3,     // m the road bed sits below the surrounding ground
    speedBonus: 1.15,
    color: 0x8b7355,
    grassColor: 0x556b2f,
  },
  world: {
    seed: 19440606,
    microRelief: 1,       // scale of the metre-high swells across the plains (0 = flat)
  },
  buildings: {
    placementMaxSlopeDelta: 1.5,  // m across a footprint; the pad beneath flattens the rest
    minBuildingGap: 3,            // m between neighbouring buildings
    // Villages: a street down each road out of a junction.
    villageStreetStart: 18,       // m from the junction to the first house
    villageStreetLength: [60, 105] as [number, number],
    villageFill: 0.8,             // share of street plots that get a building
    streetSetback: 4,             // m from the road edge to the house front
    streetGap: [3, 9] as [number, number],
    // Farmsteads along the open road.
    farmsteadSpacing: [330, 560] as [number, number],
    farmsteadSetback: 9,
    farmsteadVillageClearance: 170,
    gardenChance: 0.7,            // village houses with a walled garden behind
    secondBarnChance: 0.65,       // farm courts closed by a second barn or grange
    exclusionFromCenter: 80,
    villageFlattenRadius: 90,
    villageCoreRadius: 46,
    foundationFlatMargin: 3,
    footprintFlattenMargin: 16,
  },
  farmland: {
    color: 0x6c6a2e,
    edgeBlend: 3,         // m over which a plot fades into the surrounding grass
    // Parcels: frontage along the road, depth away from it (m).
    frontage: [55, 120] as [number, number],
    depth: [70, 150] as [number, number],
    tierChance: [0.95, 0.7, 0.4], // chance of a first, second and third parcel back from a road
    laneWidth: 4,         // m between neighbouring parcels (one shared hedge)
    roadMargin: 6,        // m of verge between a road and a parcel
    yardMargin: 10,       // m of farmyard kept clear around each building
    infillSpacing: 95,    // m between candidate parcels away from the roads
    infillChance: 0.35,
    growChance: 0.72,     // chance of each neighbour when the patchwork grows out from a parcel
    pastureShare: 0.4,    // hedged pasture rather than arable
    maxFieldRelief: 4,    // m of height across a parcel; steeper ground is left as rough grazing or wood
    orchardChance: 0.6,   // farmhouses with an orchard behind them
    orchardSpacing: 8,    // m between orchard trees
    villageOrchards: 3,   // orchard plots on the edge of each village
    treeExclusionMargin: 6,
    villageTreeSuppressionRadius: 120,
    villageTreeSuppressionChance: 0.55,
  },
  trees: {
    // Densities are per square kilometre of map.
    maxCountPerKm2: 700,
    woodsPerKm2: 4,       // copses scattered through farmland and open ground
    woodRadius: [35, 110] as [number, number],
    woodSpacing: 7.5,     // m between trees inside woods
    lonePerKm2: 40,       // mostly on open grazing land
    openScrubChance: 0.14, // share of 14 m cells on open land with a scrub bush
    roadsideRowChance: 0.35,
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
    zoomFactor: 1.15,      // per wheel notch; zooming out stops once the whole map fits
    panSpeed: 0.5,
  },
  tracers: {
    tracerLength: 14,        // m, streak length at the reference muzzle velocity
    referenceSpeed: 750,     // m/s, speed at which the streak reaches tracerLength
    tracerColor: '#ff6a1f',
    ricochetColor: '#ff4210',
    tracerFadeTime: 160,     // ms, streak collapses into the impact point after the shell stops
    width: 0.07,             // m, glowing core width for a 75mm shell (scales with caliber)
    minPixelWidth: 2,        // px, keeps distant tracers readable
    intensity: 9,            // HDR multiplier; kept under the bloom threshold so tracers glow without flaring
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
    burning_smoke: { lifetime: 9000, color: '#1d1a18', size: 1.6, expand: true,
      spawnInterval: 180,   // ms between plume puffs
      initialDelay: 1000,   // ms before wreck smoke begins
      rampUpDuration: 3500, // ms to reach full smoke density
      fireDuration: 90000,  // ms of open flames before the wreck only smoulders
      smokeDuration: 180000, // ms until the plume stops
    },
    wreck_fire: { lifetime: 700, color: '#ff6a1c', size: 1.0, expand: true,
      spawnInterval: 120,   // ms between flame tongues
    },
    tree_hit: { lifetime: 800, color: '#8b6914', size: 2, expand: true },
    hedge_crush: { lifetime: 900, color: '#4a6a2a', size: 1.2, expand: true },
    default: { lifetime: 500, color: '#ffffff', size: 1, expand: true },
  },
};

export function computeAccelFromHpWeight(hp: number, weightTonnes: number): number {
  const hpPerTon = hp / weightTonnes;
  const { accelPivotHpPerTon, accelBase, accelScale } = GAME_CONFIG.mobility;
  return Math.max(2.0, accelBase + (hpPerTon - accelPivotHpPerTon) * accelScale);
}
