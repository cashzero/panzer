import { create } from 'zustand';
import { Vector3, Euler } from 'three';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from './config';
import { audioManager, toAudioVec3, type AudioSource } from './audio';
import type { ArmorPlateHitInfo } from './armorModel';
import { getTankDef, getAllTankDefs } from './tanks/registry';
import { getCamouflageScheme } from './tanks/core/camouflage';
import type { TankAmmoSpec } from './tanks/types';
import type { TreeInstance } from './trees';
import { generateTrees, planWoods, TREE_SEED_OFFSET } from './trees';
import { buildForestMap, forestDepthAt, getActiveForest, setActiveForest } from './forest';
import { planHedgeRuns, resetHedgeDamage, setActiveHedges } from './hedges';
import { analyzeImpact, computeReflectedVelocity, computeEffectiveArmor, rollPenetration, computeDamage, computeHESplashDamage } from './combatPhysics';
import { getAmmoPenetrationAtDistance } from './penetrationModel';
import { stepProjectile } from './projectilePhysics';
import type { RoadNetwork } from './roads';
import { generateRoadNetwork } from './roads';
import type { BuildingInstance, FarmlandPlot } from './buildings';
import { findNearestOpenPosition, isPointNearAnyBuilding, projectBuildingsToTerrain } from './buildings';
import { generateBuildings, generateFarmlands, type FarmYard } from './landLayout';
import { isOnMainGround } from './navigation';
import { planForceWaypoints } from './aiWaypoints';
import { generateRandomOob, DEFAULT_OOB_SETTINGS, type OobGeneratorSettings } from './oobGenerator';
import { createBattleStats, decideOutcome, withHit, withOutcome, withShot, type BattleStats, type HitResult, type WeaponClass } from './battleStats';

export type AmmoType = 'AP' | 'APC' | 'HE';
export type AllyBaseMoveOrder = 'follow' | 'hold';
export type AllyEffectiveMoveOrder = AllyBaseMoveOrder | 'move';
export type AllyFireOrder = 'hold-fire' | 'return-fire' | 'fire-at-will';
export type AllyEngagementPosture = 'fire-from-position' | 'advance-and-fire';
export type SpottingSide = 'player' | 'enemy';
type TrackSide = 'left' | 'right';

const TRACK_SIDES: TrackSide[] = ['left', 'right'];

// Gunner sight zoom levels: FOV values in degrees (lower = more zoom)
export const GUNNER_ZOOM_LEVELS = [20, 10, 5, 2.5] as const;
export const GUNNER_ZOOM_LABELS = ['1x', '2x', '4x', '8x'] as const;

export interface Particle {
  id: string;
  type: 'fire' | 'hit_penetrate' | 'hit_bounce' | 'non_pen_impact' | 'ricochet_impact' | 'hit_ground' | 'tank_explosion' | 'dust' | 'dust_low' | 'track_grass' | 'track_mud' | 'he_hit_ground' | 'he_hit_penetrate' | 'burning_smoke' | 'wreck_fire' | 'tree_hit' | 'hedge_crush';
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
  weapon: WeaponClass;
  ricochet?: boolean;
  createdAt: number;
}

export interface SpottingContact {
  spotted: boolean;
  visibleSince: number;
  lastVisibleAt: number;
}

export interface TankData {
  id: string;
  tankType: string;
  position: Vector3;
  rotation: number; // Y-axis rotation of hull
  pitch?: number; // X-axis rotation of hull
  roll?: number; // Z-axis rotation of hull
  turretRotation: number; // Y-axis rotation relative to hull
  sightPitch: number; // X-axis rotation of the calibrated sight line
  gunElevation: number; // X-axis rotation of gun
  turretSwayOffset: number;
  gunSwayOffset: number;
  gunSightAimPoint: Vector3; // 3D world position of the gun sight aim point
  aimDir: Vector3; // Gun sight direction (unit vector)
  aimGunPivotWorld: Vector3; // Gun pivot position in world space
  designatedAimTarget: Vector3; // Shared world-space target designated by the current view center
  health: number;
  maxHealth: number;
  armor: {
    front: number;
    side: number;
    rear: number;
    turret: number;
  };
  isPlayer: boolean;
  camouflage: string; // scheme id from the tank's camouflage list
  destroyed: boolean;
  destroyedAt: number; // timestamp when tank was destroyed (0 if alive)
  lastFireTime: number;

  // Track state
  trackHealth: { left: number; right: number };
  trackMaxHealth: { left: number; right: number };
  trackDestroyed: { left: boolean; right: boolean };
  trackRepairProgress: { left: number; right: number };
  trackRepairActive: { left: boolean; right: boolean };
  trackRepairBlockedUntil: number;
  lastCombatTime: number;

  /**
   * Allies only: false for a friendly tank that fights on its own and takes
   * no orders. Unset (the player, enemies, wingmen) takes orders if an ally.
   */
  commandable?: boolean;

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
export type MapSize = 'medium' | 'large';
export const MAP_SIZE_VALUES: Record<MapSize, number> = { medium: 2000, large: 4000 };

export interface OOBUnit {
  id: string;
  tankType: string;
  /** Camouflage scheme id; the tank's default scheme when unset. */
  camouflage?: string;
  position: [number, number]; // XZ world coords (pre-mapScale)
  rotation: number;
  /**
   * Allied units only: a wingman takes the player's orders; otherwise the
   * tank is a friendly unit fighting on its own, like the enemy. Unset
   * counts as a wingman.
   */
  wingman?: boolean;
}

const AXIS_NATIONALITIES: Record<string, boolean> = { 'Germany': true };
export function isAxisNationality(nationality: string) { return !!AXIS_NATIONALITIES[nationality]; }

function spawnTankDestructionEffect(
  spawnParticle: GameState['spawnParticle'],
  position: Vector3,
) {
  const bursts = [
    { offset: new Vector3(0, 1.85, 0), scale: 2.2 },
    { offset: new Vector3(1.0, 1.35, 0.65), scale: 1.1 },
    { offset: new Vector3(-0.95, 1.25, -0.7), scale: 1.0 },
    { offset: new Vector3(0.35, 2.15, -0.95), scale: 0.9 },
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

/** Whether an allied tank takes the player's orders (a wingman). */
export function isCommandable(tank: TankData) {
  return tank.commandable !== false;
}

function getAudioSourceRole(allies: TankData[], tankId: string): AudioSource {
  if (tankId === 'player') return 'player';
  return allies.some((ally) => ally.id === tankId) ? 'ally' : 'enemy';
}

interface GameState {
  gameScreen: GameScreen;
  mapSize: MapSize;
  worldSeed: number;
  roadNetwork: RoadNetwork;
  buildings: BuildingInstance[];
  farmlands: FarmlandPlot[];
  /** Farm courts and village gardens (visual walls, beaten-earth ground). */
  yards: FarmYard[];
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
  /**
   * Default waypoint of each tank that fights on its own (enemies and
   * friendly tanks outside the player's command), planned at deployment:
   * where it advances to before contact. Cleared on arrival. Not shown on
   * the map.
   */
  aiWaypoints: Record<string, { x: number; y: number; z: number }>;
  calibrationDistance: number;
  gunnerZoom: number; // index into GUNNER_ZOOM_LEVELS
  trees: TreeInstance[];
  cameraShake: number; // current shake intensity (decays over time)
  playerBurstRemaining: number;
  playerBurstNextFireTime: number;
  playerMagazineRounds: number;
  playerNextFireTime: number;
  cameraYawAbs: number; // absolute camera yaw (hull rotation + mouse yaw)
  playerSideSpotting: Record<string, SpottingContact>;
  enemySideSpotting: Record<string, SpottingContact>;
  /** Trees as the world was generated, restored at each deployment. */
  worldTrees: TreeInstance[];
  /** Bumped at each deployment; the battle scene is keyed on it and mounts afresh. */
  battleId: number;
  battleStats: BattleStats;

  fireProjectile: (pos: Vector3, vel: Vector3, type: AmmoType, ammoSpec: TankAmmoSpec, dmg: number, firedBy: string, caliber: number, weapon?: WeaponClass) => void;
  removeProjectile: (id: string) => void;
  updateProjectiles: (dt: number) => void;
  updateTrackRepairs: (dt: number) => void;
  updatePlayer: (updates: Partial<TankData>) => void;
  updateEnemy: (id: string, updates: Partial<TankData>) => void;
  addMessage: (text: string, color: string) => void;
  handleHit: (projectileId: string, hitTankId: string, hitPoint: Vector3, hitNormal: Vector3, plateInfo?: ArmorPlateHitInfo) => void;
  /** Adds a round striking a tank to the battle record, and ends the battle once a side is beaten. */
  recordHit: (shooterId: string, targetId: string, result: HitResult) => void;
  /** Leaves the battle for the order-of-battle screen. */
  leaveBattle: () => void;
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
  clearAiWaypoint: (tankId: string) => void;
  setCalibrationDistance: (dist: number) => void;
  zoomGunnerIn: () => void;
  zoomGunnerOut: () => void;
  setLastFireTime: (time: number) => void;
  setMapSize: (size: MapSize) => void;
  setWorldSeed: (seed: number) => void;
  regenerateWorld: () => void;
  selectPlayerTank: (tankType: string) => void;
  setPlayerBurst: (remaining: number, nextTime: number) => void;
  setPlayerAutomaticState: (rounds: number, nextTime: number) => void;

  // OOB Editor state
  oobPlayerTankType: string;
  oobPlayerCamouflage: string | null;
  oobPlayerPosition: [number, number];
  oobEnemies: OOBUnit[];
  oobAllies: OOBUnit[];
  oobAllyCountry: string;
  oobEnemyCountry: string;
  oobSelectedUnitId: string | null;
  oobPlacementMode: 'enemy' | 'ally' | null;
  /** Briefing line for a randomly generated order of battle; cleared by any edit. */
  oobBriefing: string | null;
  /** Settings for the random order of battle. */
  oobRandomSettings: OobGeneratorSettings;

  // OOB Editor actions
  setOobPlayerTankType: (tankType: string) => void;
  setOobPlayerCamouflage: (schemeId: string | null) => void;
  setOobPlayerPosition: (pos: [number, number]) => void;
  addOobUnit: (side: 'enemy' | 'ally', tankType: string, position: [number, number]) => void;
  removeOobUnit: (id: string) => void;
  updateOobUnit: (id: string, updates: Partial<OOBUnit>) => void;
  setOobSelectedUnit: (id: string | null) => void;
  setOobPlacementMode: (mode: 'enemy' | 'ally' | null) => void;
  setOobAllyCountry: (country: string) => void;
  setOobEnemyCountry: (country: string) => void;
  /** Replaces both forces with a balanced random order of battle on the current map. */
  randomizeOob: () => void;
  setOobRandomSettings: (settings: Partial<OobGeneratorSettings>) => void;
  setGameScreen: (screen: GameScreen) => void;
  deployOob: () => void;
  triggerCameraShake: (intensity: number) => void;
  decayCameraShake: (dt: number) => void;
  setCameraYawAbs: (yaw: number) => void;
  initTrees: (trees: TreeInstance[]) => void;
  updateTree: (index: number, updates: Partial<TreeInstance>) => void;
  refreshSpotting: (observerSide: SpottingSide, visibleTargetIds: string[], now: number) => void;
  isTankSpottedBySide: (tankId: string, observerSide: SpottingSide) => boolean;
}

const GRAVITY = GAME_CONFIG.physics.gravity;

function getMapScale(mapSize: MapSize): number {
  return MAP_SIZE_VALUES[mapSize] / 1000;
}

function toWorldPosition(position: [number, number], mapSize: MapSize): [number, number] {
  const mapScale = getMapScale(mapSize);
  return [position[0] * mapScale, position[1] * mapScale];
}

function toOobPosition(position: [number, number], mapSize: MapSize): [number, number] {
  const mapScale = getMapScale(mapSize);
  return [position[0] / mapScale, position[1] / mapScale];
}

/** The nearest point a tank can stand on: clear of buildings and outside any forest. */
function nearestOpenGround(worldX: number, worldZ: number, buildings: BuildingInstance[]): [number, number] {
  const margin = GAME_CONFIG.tank.collisionRadius + 2;
  const position = findNearestOpenPosition(worldX, worldZ, buildings, margin);
  const forest = getActiveForest();
  // Not in a clearing that forest walls off: a tank there could never leave.
  const open = (x: number, z: number) => !forest
    || (forestDepthAt(forest, x, z) < -margin && isOnMainGround(forest, buildings, x, z));
  if (open(position[0], position[1])) return position;
  for (let radius = 8; radius <= 400; radius += 8) {
    for (let i = 0; i < 32; i++) {
      const angle = (Math.PI * 2 * i) / 32;
      const x = worldX + Math.cos(angle) * radius, z = worldZ + Math.sin(angle) * radius;
      if (open(x, z) && !isPointNearAnyBuilding(x, z, buildings, margin)) return [x, z];
    }
  }
  return position;
}

function sanitizeOobPosition(position: [number, number], mapSize: MapSize, buildings: BuildingInstance[]): [number, number] {
  const [worldX, worldZ] = toWorldPosition(position, mapSize);
  // Units placed on a building or in a forest start at open ground beside it.
  return toOobPosition(nearestOpenGround(worldX, worldZ, buildings), mapSize);
}

function sanitizeOobLayout(
  mapSize: MapSize,
  buildings: BuildingInstance[],
  oobPlayerPosition: [number, number],
  oobEnemies: OOBUnit[],
  oobAllies: OOBUnit[],
) {
  return {
    oobPlayerPosition: sanitizeOobPosition(oobPlayerPosition, mapSize, buildings),
    oobEnemies: oobEnemies.map((unit) => ({ ...unit, position: sanitizeOobPosition(unit.position, mapSize, buildings) })),
    oobAllies: oobAllies.map((unit) => ({ ...unit, position: sanitizeOobPosition(unit.position, mapSize, buildings) })),
  };
}

function generateWorld(mapSize: MapSize, seed: number) {
  const roadNetwork = generateRoadNetwork(mapSize, seed);
  const layout = generateBuildings(mapSize, roadNetwork, seed + 17);
  const buildings = projectBuildingsToTerrain(layout.buildings, roadNetwork);
  const yards = layout.yards;
  const mapScale = MAP_SIZE_VALUES[mapSize] / 1000;
  // Woods are planned first; fields leave them clear and trees then fill them.
  const woods = planWoods(mapScale, roadNetwork, seed + TREE_SEED_OFFSET);
  const farmlands = generateFarmlands(buildings, roadNetwork, mapSize, seed + 29, woods, yards);
  // Large woods become forest: impassable, sight-blocking terrain (forest.ts).
  const forest = buildForestMap(mapScale, woods, roadNetwork, buildings, farmlands, yards);
  // Every generated world is put straight into play by the store.
  setActiveForest(forest);
  const trees = generateTrees(mapScale, roadNetwork, buildings, farmlands, seed + TREE_SEED_OFFSET, woods, yards, forest);
  // Hedges block sight (spotting.ts) and are drawn over the same runs.
  setActiveHedges(planHedgeRuns(farmlands, roadNetwork, buildings, seed + TREE_SEED_OFFSET, seed));
  return { roadNetwork, buildings, farmlands, trees, yards, forest };
}

const initialWorld = generateWorld('medium', GAME_CONFIG.world.seed);

function createTankData(tankType: string, isPlayer: boolean, camouflage?: string | null): TankData {
  const def = getTankDef(tankType);
  return {
    id: isPlayer ? 'player' : uuidv4(),
    tankType,
    position: new Vector3(0, 0, 0),
    rotation: isPlayer ? 0 : Math.random() * Math.PI * 2,
    pitch: 0,
    roll: 0,
    turretRotation: 0,
    sightPitch: 0,
    gunElevation: 0,
    turretSwayOffset: 0,
    gunSwayOffset: 0,
    gunSightAimPoint: new Vector3(0, 0, 500),
    aimDir: new Vector3(0, 0, 1),
    aimGunPivotWorld: new Vector3(0, 0, 0),
    designatedAimTarget: new Vector3(0, 0, 500),
    health: def.health,
    maxHealth: def.health,
    armor: { ...def.armor },
    isPlayer,
    camouflage: getCamouflageScheme(def.camouflage, camouflage ?? undefined).id,
    destroyed: false,
    destroyedAt: 0,
    lastFireTime: 0,
    trackHealth: { left: def.trackHealth, right: def.trackHealth },
    trackMaxHealth: { left: def.trackHealth, right: def.trackHealth },
    trackDestroyed: { left: false, right: false },
    trackRepairProgress: { left: 0, right: 0 },
    trackRepairActive: { left: false, right: false },
    trackRepairBlockedUntil: 0,
    lastCombatTime: 0,
    speed: 0,
    engineRPM: GAME_CONFIG.tank.idleRPM,
    gear: 0,
    leftTrackSpeed: 0,
    rightTrackSpeed: 0,
  };
}

function markTankUnderCombatPressure(now: number): Pick<TankData, 'lastCombatTime' | 'trackRepairBlockedUntil' | 'trackRepairActive'> {
  return {
    lastCombatTime: now,
    trackRepairBlockedUntil: now + GAME_CONFIG.tank.trackRepair.recentCombatPauseMs,
    trackRepairActive: { left: false, right: false },
  };
}

function applyTrackDamageToTank(tank: TankData, side: TrackSide, damage: number, now: number) {
  const newTrackHealth = Math.max(0, tank.trackHealth[side] - damage);
  const trackDead = newTrackHealth <= 0;

  return {
    updates: {
      trackHealth: { ...tank.trackHealth, [side]: newTrackHealth },
      trackDestroyed: { ...tank.trackDestroyed, [side]: trackDead },
      trackRepairProgress: { ...tank.trackRepairProgress, [side]: 0 },
      trackRepairActive: { ...tank.trackRepairActive, [side]: false },
      ...markTankUnderCombatPressure(now),
    } satisfies Partial<TankData>,
    newTrackHealth,
    trackDead,
  };
}

function isTankStationaryForRepair(tank: TankData, isPlayerInMapMode: boolean): boolean {
  if (isPlayerInMapMode) return true;

  const threshold = GAME_CONFIG.tank.trackRepair.stationarySpeedThreshold;
  return Math.abs(tank.speed) <= threshold
    && Math.abs(tank.leftTrackSpeed) <= threshold
    && Math.abs(tank.rightTrackSpeed) <= threshold;
}

function updateTankTrackRepairState(tank: TankData, dtMs: number, now: number, isPlayerInMapMode: boolean) {
  let nextTank = tank;
  const events: string[] = [];
  const durationMs = GAME_CONFIG.tank.trackRepair.durationMs;
  const restoredFraction = GAME_CONFIG.tank.trackRepair.restoredHealthFraction;
  const combatPauseMs = GAME_CONFIG.tank.trackRepair.recentCombatPauseMs;
  const safeState = !tank.destroyed
    && isTankStationaryForRepair(tank, isPlayerInMapMode)
    && now >= tank.trackRepairBlockedUntil
    && now - tank.lastCombatTime >= combatPauseMs;

  for (const side of TRACK_SIDES) {
    const wasDestroyed = nextTank.trackDestroyed[side];
    const wasActive = nextTank.trackRepairActive[side];
    const wasProgress = nextTank.trackRepairProgress[side];

    if (!wasDestroyed) {
      if (wasActive || wasProgress > 0) {
        nextTank = {
          ...nextTank,
          trackRepairActive: { ...nextTank.trackRepairActive, [side]: false },
          trackRepairProgress: { ...nextTank.trackRepairProgress, [side]: 0 },
        };
      }
      continue;
    }

    if (!safeState) {
      if (wasActive) {
        nextTank = {
          ...nextTank,
          trackRepairActive: { ...nextTank.trackRepairActive, [side]: false },
        };
        if (tank.isPlayer) {
          events.push(`${side === 'left' ? 'Left' : 'Right'} track repair paused`);
        }
      }
      continue;
    }

    const nextProgress = Math.min(durationMs, wasProgress + dtMs);
    nextTank = {
      ...nextTank,
      trackRepairActive: { ...nextTank.trackRepairActive, [side]: nextProgress < durationMs },
      trackRepairProgress: { ...nextTank.trackRepairProgress, [side]: nextProgress < durationMs ? nextProgress : 0 },
    };

    if (!wasActive && tank.isPlayer) {
      events.push(`${wasProgress > 0 ? 'Resuming' : 'Repairing'} ${side === 'left' ? 'left' : 'right'} track`);
    }

    if (nextProgress >= durationMs) {
      const restoredHealth = Math.max(1, Math.round(nextTank.trackMaxHealth[side] * restoredFraction));
      nextTank = {
        ...nextTank,
        trackHealth: { ...nextTank.trackHealth, [side]: restoredHealth },
        trackDestroyed: { ...nextTank.trackDestroyed, [side]: false },
        trackRepairActive: { ...nextTank.trackRepairActive, [side]: false },
        trackRepairProgress: { ...nextTank.trackRepairProgress, [side]: 0 },
      };

      if (tank.isPlayer) {
        events.push(`${side === 'left' ? 'Left' : 'Right'} track repaired`);
      }
    }
  }

  return { nextTank, events };
}

function getInitialMagazineRounds(tankType: string): number {
  return getTankDef(tankType).automaticMagazineSize ?? 0;
}

function createSpottingContact(): SpottingContact {
  return {
    spotted: false,
    visibleSince: 0,
    lastVisibleAt: 0,
  };
}

function buildSpottingMap(tanks: TankData[]): Record<string, SpottingContact> {
  return Object.fromEntries(tanks.map((tank) => [tank.id, createSpottingContact()]));
}

function updateSpottingMap(
  current: Record<string, SpottingContact>,
  targetIds: string[],
  visibleTargetIds: string[],
  now: number,
): Record<string, SpottingContact> {
  const visible = new Set(visibleTargetIds);
  const next: Record<string, SpottingContact> = {};
  const revealDelayMs = GAME_CONFIG.ai.spottingRevealDelayMs;
  const persistenceMs = GAME_CONFIG.ai.spottingPersistenceMs;

  for (const id of targetIds) {
    const previous = current[id] ?? createSpottingContact();

    if (visible.has(id)) {
      const visibleSince = previous.visibleSince || now;
      next[id] = {
        spotted: previous.spotted || now - visibleSince >= revealDelayMs,
        visibleSince,
        lastVisibleAt: now,
      };
      continue;
    }

    next[id] = {
      spotted: previous.spotted && now - previous.lastVisibleAt <= persistenceMs,
      visibleSince: 0,
      lastVisibleAt: previous.lastVisibleAt,
    };
  }

  return next;
}

export const useGameStore = create<GameState>((set, get) => ({
  gameScreen: 'oob-editor',
  mapSize: 'medium',
  worldSeed: GAME_CONFIG.world.seed,
  roadNetwork: initialWorld.roadNetwork,
  buildings: initialWorld.buildings,
  farmlands: initialWorld.farmlands,
  yards: initialWorld.yards,
  playerTank: createTankData('sherman', true),
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
  aiWaypoints: {},
  calibrationDistance: 0,
  gunnerZoom: 1,
  trees: initialWorld.trees,
  worldTrees: initialWorld.trees,
  battleId: 0,
  battleStats: createBattleStats(0),
  cameraShake: 0,
  playerBurstRemaining: 0,
  playerBurstNextFireTime: 0,
  playerMagazineRounds: getInitialMagazineRounds('sherman'),
  playerNextFireTime: 0,
  cameraYawAbs: 0,
  playerSideSpotting: {},
  enemySideSpotting: { player: createSpottingContact() },

  // OOB Editor initial state
  oobPlayerTankType: 'sherman',
  oobPlayerCamouflage: null,
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
  oobBriefing: null,
  oobRandomSettings: DEFAULT_OOB_SETTINGS,

  // OOB Editor actions
  // A different tank keeps the chosen scheme only if it can wear it.
  setOobPlayerTankType: (tankType) => set((state) => ({
    oobPlayerTankType: tankType,
    oobBriefing: null,
    oobPlayerCamouflage: getTankDef(tankType).camouflage.some((scheme) => scheme.id === state.oobPlayerCamouflage)
      ? state.oobPlayerCamouflage : null,
  })),
  setOobPlayerCamouflage: (schemeId) => set({ oobPlayerCamouflage: schemeId }),
  setOobPlayerPosition: (pos) => set({ oobPlayerPosition: pos }),
  addOobUnit: (side, tankType, position) => {
    const unit: OOBUnit = { id: uuidv4(), tankType, position, rotation: side === 'enemy' ? Math.PI : 0 };
    set((state) => side === 'enemy'
      ? { oobEnemies: [...state.oobEnemies, unit], oobBriefing: null }
      : { oobAllies: [...state.oobAllies, unit], oobBriefing: null }
    );
  },
  removeOobUnit: (id) => set((state) => ({
    oobEnemies: state.oobEnemies.filter((u) => u.id !== id),
    oobAllies: state.oobAllies.filter((u) => u.id !== id),
    oobSelectedUnitId: state.oobSelectedUnitId === id ? null : state.oobSelectedUnitId,
    oobBriefing: null,
  })),
  updateOobUnit: (id, updates) => set((state) => ({
    oobEnemies: state.oobEnemies.map((u) => u.id === id ? { ...u, ...updates } : u),
    oobAllies: state.oobAllies.map((u) => u.id === id ? { ...u, ...updates } : u),
    // Moving or turning a tank keeps the briefing; changing the forces does not.
    ...('tankType' in updates || 'wingman' in updates ? { oobBriefing: null } : {}),
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
  randomizeOob: () => {
    const state = get();
    const allTanks = getAllTankDefs();
    const generated = generateRandomOob({
      seed: Math.floor(Math.random() * 0x7fffffff),
      mapSize: MAP_SIZE_VALUES[state.mapSize],
      playerTankType: state.oobPlayerTankType,
      settings: state.oobRandomSettings,
      alliedPool: allTanks.filter((def) => !isAxisNationality(def.nationality)),
      enemyPool: allTanks.filter((def) => isAxisNationality(def.nationality)),
      open: (x, z) => nearestOpenGround(x, z, state.buildings),
    });
    const toOob = (position: [number, number]) => toOobPosition(position, state.mapSize);
    set({
      oobPlayerPosition: toOob(generated.playerPosition),
      oobAllies: generated.allies.map((unit) => ({ ...unit, position: toOob(unit.position) })),
      oobEnemies: generated.enemies.map((unit) => ({ ...unit, position: toOob(unit.position) })),
      oobSelectedUnitId: null,
      oobPlacementMode: null,
      oobBriefing: generated.summary,
    });
  },
  setOobRandomSettings: (settings) => set((state) => ({ oobRandomSettings: { ...state.oobRandomSettings, ...settings } })),
  setGameScreen: (screen) => set({ gameScreen: screen }),
  deployOob: () => {
    const state = get();
    const mapScale = MAP_SIZE_VALUES[state.mapSize] / 1000;
    // Units dragged onto a building or into a forest start at open ground next to it.
    const open = (position: [number, number]) => sanitizeOobPosition(position, state.mapSize, state.buildings);
    const playerPosition = open(state.oobPlayerPosition);

    // Create player tank
    const player = createTankData(state.oobPlayerTankType, true, state.oobPlayerCamouflage);
    const px = playerPosition[0] * mapScale;
    const pz = playerPosition[1] * mapScale;
    player.position = new Vector3(px, 0, pz);

    // Create enemies
    const enemies: TankData[] = state.oobEnemies.map((u) => {
      const t = createTankData(u.tankType, false, u.camouflage);
      const [ux, uz] = open(u.position);
      const ex = ux * mapScale;
      const ez = uz * mapScale;
      t.position = new Vector3(ex, 0, ez);
      t.rotation = u.rotation;
      return t;
    });

    // Create allies
    const allies: TankData[] = state.oobAllies.map((u) => {
      const t = createTankData(u.tankType, false, u.camouflage);
      const [ux, uz] = open(u.position);
      const ax = ux * mapScale;
      const az = uz * mapScale;
      t.position = new Vector3(ax, 0, az);
      t.rotation = u.rotation;
      t.commandable = u.wingman !== false;
      return t;
    });

    // Every tank that fights on its own gets a default waypoint: the ground
    // its advance aims at. Wingmen follow the player instead.
    const halfMap = MAP_SIZE_VALUES[state.mapSize] / 2;
    const independents = allies.filter((ally) => !isCommandable(ally));
    const planned = {
      ...planForceWaypoints(enemies, [player, ...allies], player, halfMap),
      ...(enemies.length > 0 ? planForceWaypoints(independents, enemies, enemies[0], halfMap) : {}),
    };
    const aiWaypoints = Object.fromEntries(Object.entries(planned).map(([id, [x, z]]) => {
      const [ox, oz] = nearestOpenGround(x, z, state.buildings);
      return [id, { x: ox, y: 0, z: oz }];
    }));

    const allyBaseMoveOrders = Object.fromEntries(allies.map((ally) => [ally.id, 'follow' as AllyBaseMoveOrder]));
    const allyFireOrders = Object.fromEntries(allies.map((ally) => [ally.id, 'fire-at-will' as AllyFireOrder]));
    const allyEngagementPostures = Object.fromEntries(allies.map((ally) => [ally.id, 'fire-from-position' as AllyEngagementPosture]));
    // Hedges a previous battle crashed through stand whole again.
    resetHedgeDamage();

      set({
        playerTank: player,
        enemies,
        allies,
        playerSideSpotting: buildSpottingMap(enemies),
        enemySideSpotting: buildSpottingMap([player, ...allies]),
        allyBaseMoveOrders,
        allyFireOrders,
        allyEngagementPostures,
      allyWaypoints: {},
      aiWaypoints,
      trees: state.worldTrees,
      battleId: state.battleId + 1,
      battleStats: createBattleStats(Date.now()),
      isMapMode: false,
      viewMode: 'third-person',
      cameraShake: 0,
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

  setMapSize: (size) => {
    const { worldSeed, oobPlayerPosition, oobEnemies, oobAllies } = get();
    const world = generateWorld(size, worldSeed);
    const sanitized = sanitizeOobLayout(size, world.buildings, oobPlayerPosition, oobEnemies, oobAllies);
    set({ mapSize: size, roadNetwork: world.roadNetwork, buildings: world.buildings, farmlands: world.farmlands, trees: world.trees, worldTrees: world.trees, yards: world.yards, ...sanitized });
  },

  setWorldSeed: (seed) => {
    const state = get();
    const world = generateWorld(state.mapSize, seed);
    const sanitized = sanitizeOobLayout(state.mapSize, world.buildings, state.oobPlayerPosition, state.oobEnemies, state.oobAllies);
    set({ worldSeed: seed, roadNetwork: world.roadNetwork, buildings: world.buildings, farmlands: world.farmlands, trees: world.trees, worldTrees: world.trees, yards: world.yards, ...sanitized });
  },

  regenerateWorld: () => {
    const state = get();
    const world = generateWorld(state.mapSize, state.worldSeed);
    const sanitized = sanitizeOobLayout(state.mapSize, world.buildings, state.oobPlayerPosition, state.oobEnemies, state.oobAllies);
    set({ roadNetwork: world.roadNetwork, buildings: world.buildings, farmlands: world.farmlands, trees: world.trees, worldTrees: world.trees, yards: world.yards, ...sanitized });
  },

  selectPlayerTank: (tankType) => {
    const newTank = createTankData(tankType, true);
    set({
      playerTank: newTank,
      enemySideSpotting: buildSpottingMap([newTank, ...get().allies]),
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
  selectAlly: (id) => set((state) => {
    if (id === null) return { selectedAllyId: null };
    const ally = state.allies.find((a) => a.id === id);
    return ally && isCommandable(ally) ? { selectedAllyId: id } : {};
  }),
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
  issueAllyMoveOrder: (allyId, position) => set((state) => {
    const ally = state.allies.find((a) => a.id === allyId);
    if (!ally || !isCommandable(ally)) return {};
    // An order into a forest goes to the open ground at its edge.
    const [x, z] = nearestOpenGround(position.x, position.z, state.buildings);
    return { allyWaypoints: { ...state.allyWaypoints, [allyId]: { x, y: position.y, z } } };
  }),
  clearAiWaypoint: (tankId) => set((state) => {
    const { [tankId]: _, ...rest } = state.aiWaypoints;
    return { aiWaypoints: rest };
  }),
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

  fireProjectile: (pos, vel, type, ammoSpec, dmg, firedBy, caliber, weapon = 'gun') => {
    const scale = caliber / 75;
    const now = Date.now();
    set((state) => ({ battleStats: withShot(state.battleStats, firedBy, weapon) }));
    set((state) => {
      const projectile = {
        id: uuidv4(),
        origin: pos.clone(),
        position: pos.clone(),
        velocity: vel.clone(),
        type,
        ammoSpec: cloneAmmoSpec(ammoSpec),
        damage: dmg,
        caliber,
        firedBy,
        weapon,
        createdAt: now,
      };

      if (firedBy === 'player') {
        return {
          projectiles: [...state.projectiles, projectile],
          playerTank: {
            ...state.playerTank,
            ...markTankUnderCombatPressure(now),
          },
        };
      }

      if (state.allies.some((ally) => ally.id === firedBy)) {
        return {
          projectiles: [...state.projectiles, projectile],
          allies: state.allies.map((ally) => ally.id === firedBy
            ? { ...ally, ...markTankUnderCombatPressure(now) }
            : ally),
        };
      }

      return {
        projectiles: [...state.projectiles, projectile],
        enemies: state.enemies.map((enemy) => enemy.id === firedBy
          ? { ...enemy, ...markTankUnderCombatPressure(now) }
          : enemy),
      };
    });
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

  refreshSpotting: (observerSide, visibleTargetIds, now) => {
    set((state) => {
      if (observerSide === 'player') {
        return {
          playerSideSpotting: updateSpottingMap(
            state.playerSideSpotting,
            state.enemies.map((enemy) => enemy.id),
            visibleTargetIds,
            now,
          ),
        };
      }

      return {
        enemySideSpotting: updateSpottingMap(
          state.enemySideSpotting,
          [state.playerTank, ...state.allies].map((tank) => tank.id),
          visibleTargetIds,
          now,
        ),
      };
    });
  },

  isTankSpottedBySide: (tankId, observerSide) => {
    const spottingMap = observerSide === 'player' ? get().playerSideSpotting : get().enemySideSpotting;
    return !!spottingMap[tankId]?.spotted;
  },

  updateTrackRepairs: (dt) => {
    const state = get();
    const dtMs = dt * 1000;
    const now = Date.now();
    const events: string[] = [];

    const playerResult = updateTankTrackRepairState(state.playerTank, dtMs, now, state.isMapMode);
    const enemyResults = state.enemies.map((enemy) => updateTankTrackRepairState(enemy, dtMs, now, false));
    const allyResults = state.allies.map((ally) => updateTankTrackRepairState(ally, dtMs, now, false));

    events.push(...playerResult.events);
    enemyResults.forEach((result) => events.push(...result.events));
    allyResults.forEach((result) => events.push(...result.events));

    set({
      playerTank: playerResult.nextTank,
      enemies: enemyResults.map((result) => result.nextTank),
      allies: allyResults.map((result) => result.nextTank),
    });

    for (const event of events) {
      get().addMessage(event, event.includes('paused') ? '#ffaa00' : '#7CFC00');
    }
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
    const now = Date.now();
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
      const alertUpdate = { alertedBy: projectile.firedBy, alertedAt: now };
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
      get().recordHit(projectile.firedBy, hitTankId, { weapon: projectile.weapon, penetrated: false, damage: 0, killed: false });
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
          firedBy: projectile.firedBy, weapon: projectile.weapon, ricochet: true, createdAt: Date.now(),
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
        const { updates, newTrackHealth, trackDead } = applyTrackDamageToTank(target, trackSide, projectile.damage, now);
        get().recordHit(projectile.firedBy, hitTankId, { weapon: projectile.weapon, penetrated: true, damage: 0, killed: false });

        if (hitTankId === 'player') {
          get().updatePlayer(updates);
          get().triggerCameraShake(0.7 * scale);
        } else if (state.allies.some(a => a.id === hitTankId)) {
          get().updateAlly(hitTankId, updates);
        } else {
          get().updateEnemy(hitTankId, updates);
        }

        if (trackDead) {
          get().addMessage(`${trackSide === 'left' ? 'Left' : 'Right'} Track Destroyed!`, '#ff4400');
        } else {
          get().addMessage(`${faceName} hit! (${Math.round(newTrackHealth)} HP remaining)`, '#ffaa00');
        }
      } else {
        // Normal armor hit — damage main HP
        const { newHealth, destroyed } = computeDamage(
          projectile.type, projectile.damage, actualPen, effectiveArmor, target.health
        );
        const destroyedAt = destroyed ? now : target.destroyedAt;
        const impactUpdates = { health: newHealth, destroyed, destroyedAt, ...markTankUnderCombatPressure(now) };

        if (hitTankId === 'player') {
          get().updatePlayer(impactUpdates);
          get().triggerCameraShake(1.0 * scale);
        } else if (state.allies.some(a => a.id === hitTankId)) {
          get().updateAlly(hitTankId, impactUpdates);
        } else {
          get().updateEnemy(hitTankId, impactUpdates);
        }

        get().addMessage(`Penetration! ${faceName} (${Math.round(actualPen)}mm vs ${Math.round(effectiveArmor)}mm at ${Math.round(angleDeg)}°)`, '#00ff00');
        get().recordHit(projectile.firedBy, hitTankId, { weapon: projectile.weapon, penetrated: true, damage: target.health - newHealth, killed: destroyed });
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
        const { updates, trackDead } = applyTrackDamageToTank(target, trackSide, splashDamage, now);
        get().recordHit(projectile.firedBy, hitTankId, { weapon: projectile.weapon, penetrated: false, damage: 0, killed: false });

        if (hitTankId === 'player') {
          get().updatePlayer(updates);
        } else if (state.allies.some(a => a.id === hitTankId)) {
          get().updateAlly(hitTankId, updates);
        } else {
          get().updateEnemy(hitTankId, updates);
        }
        get().addMessage(
          trackDead
            ? `${trackSide === 'left' ? 'Left' : 'Right'} Track Destroyed!`
            : `HE Splash on ${faceName}! (-${Math.round(splashDamage)} track HP)`,
          trackDead ? '#ff4400' : '#ffaa00',
        );
      } else if (projectile.type === 'HE' && !isTrackHit) {
        // HE splash on armor
        const splashDamage = computeHESplashDamage(projectile.damage);
        const newHealth = Math.max(0, target.health - splashDamage);
        const destroyed = newHealth <= 0;
        const destroyedAt = destroyed ? now : target.destroyedAt;
        const splashUpdates = { health: newHealth, destroyed, destroyedAt, ...markTankUnderCombatPressure(now) };

        if (hitTankId === 'player') {
          get().updatePlayer(splashUpdates);
        } else if (state.allies.some(a => a.id === hitTankId)) {
          get().updateAlly(hitTankId, splashUpdates);
        } else {
          get().updateEnemy(hitTankId, splashUpdates);
        }
        get().addMessage(`HE Splash! ${faceName} (-${Math.round(splashDamage)} HP)`, '#ffaa00');
        get().recordHit(projectile.firedBy, hitTankId, { weapon: projectile.weapon, penetrated: false, damage: target.health - newHealth, killed: destroyed });
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
        get().recordHit(projectile.firedBy, hitTankId, { weapon: projectile.weapon, penetrated: false, damage: 0, killed: false });
        get().addMessage(`Armor not pierced. ${faceName} (${Math.round(actualPen)}mm vs ${Math.round(effectiveArmor)}mm at ${Math.round(angleDeg)}°)`, '#aaaaaa');
      }
    }
  },

  recordHit: (shooterId, targetId, result) => {
    const now = Date.now();
    set((state) => {
      const shooterIsEnemy = state.enemies.some((enemy) => enemy.id === shooterId);
      const targetIsEnemy = state.enemies.some((enemy) => enemy.id === targetId);
      const battleStats = withHit(state.battleStats, shooterId, targetId, shooterIsEnemy !== targetIsEnemy, result, now);
      const ended = withOutcome(battleStats, decideOutcome(state.playerTank, state.enemies), now);
      // The report takes the screen and the mouse: close the tactical map.
      return ended.outcome && !battleStats.outcome ? { battleStats: ended, isMapMode: false } : { battleStats: ended };
    });
  },

  leaveBattle: () => set({ gameScreen: 'oob-editor', isMapMode: false, projectiles: [], particles: [], messages: [] }),

  spawnEnemy: (position, tankType = 'tiger') => {
    const enemy = createTankData(tankType, false);
    enemy.position = position;
    set((state) => ({
      enemies: [...state.enemies, enemy],
      playerSideSpotting: {
        ...state.playerSideSpotting,
        [enemy.id]: createSpottingContact(),
      },
    }));
  },

  spawnAlly: (position, tankType = 'sherman') => {
    const ally = createTankData(tankType, false);
    ally.position = position;
    set((state) => ({
      allies: [...state.allies, ally],
      enemySideSpotting: {
        ...state.enemySideSpotting,
        [ally.id]: createSpottingContact(),
      },
    }));
  },

  updateAlly: (id, updates) => {
    set((state) => ({
      allies: state.allies.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  },
}));

