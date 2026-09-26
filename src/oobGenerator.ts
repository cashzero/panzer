import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from './config';
import { effectiveArmour, getMatchup } from './aiMatchup';
import { getAmmoPenetrationAtDistance } from './penetrationModel';
import { getTankDef } from './tanks/registry';
import type { TankResolvedSpec } from './tanks/core/types';

/**
 * Random order of battle: two forces of the same period, weighed against
 * each other by how their guns and armour actually match up, deployed in
 * platoon formations facing each other across the map. Pure apart from the
 * `open` callback, which moves a point off buildings and out of forest.
 */

export interface GeneratedUnit {
  id: string;
  tankType: string;
  camouflage?: string;
  /** World metres. */
  position: [number, number];
  rotation: number;
  wingman?: boolean;
}

export interface GeneratedOob {
  /** World metres. */
  playerPosition: [number, number];
  allies: GeneratedUnit[];
  enemies: GeneratedUnit[];
  /** One line for the player: period, odds and approach. */
  summary: string;
}

export interface OobGeneratorInput {
  seed: number;
  /** Map edge length in metres. */
  mapSize: number;
  playerTankType: string;
  alliedPool: TankResolvedSpec[];
  enemyPool: TankResolvedSpec[];
  settings: OobGeneratorSettings;
  /** Nearest open ground to a world point, in world metres. */
  open: (x: number, z: number) => [number, number];
}

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randRange = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
const randInt = (rng: Rng, min: number, max: number) => Math.floor(randRange(rng, min, max + 1));

function pickWeighted<T>(rng: Rng, items: T[], weight: (item: T) => number): T {
  const weights = items.map(weight);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/* ------------------------------------------------------------------ */
/*  Combat strength                                                    */
/* ------------------------------------------------------------------ */

/** Ranges a tank fight is fought at, in metres. */
const ENGAGEMENT_RANGES = [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];
/** Share of shots that meet the front; the rest find a side. */
const FRONT_SHARE = 0.7;
/** Tanks that cannot penetrate still knock off tracks and crews now and then. */
const MIN_KILL_RATE = 0.002;
/** Human play is worth something: the player's tank fights above its type. */
const PLAYER_BONUS = 1.2;

const killRateCache = new Map<string, number>();

/**
 * Tanks of type `target` one `attacker` knocks out per second of firing,
 * from the same matchup data the AI fights by: how often its AP defeats
 * the armour over the usual ranges, how many penetrations the target's
 * health takes and how fast the gun fires (magazine and all).
 */
function killRate(attacker: string, target: string): number {
  const key = `${attacker}>${target}`;
  const cached = killRateCache.get(key);
  if (cached !== undefined) return cached;
  const m = getMatchup('oob', attacker, target);
  let pen = 0;
  for (const range of ENGAGEMENT_RANGES) {
    pen += FRONT_SHARE * (range <= m.frontPenRange ? 1 : 0) + (1 - FRONT_SHARE) * (range <= m.sidePenRange ? 1 : 0);
  }
  pen /= ENGAGEMENT_RANGES.length;
  const a = getTankDef(attacker);
  const shotsToKill = Math.max(1, Math.ceil(getTankDef(target).health / Math.max(1, a.weapons.AP.damage)));
  const shotsPerSecond = a.automaticMagazineSize && a.automaticFireInterval
    ? a.automaticMagazineSize / ((a.reloadTime + a.automaticMagazineSize * a.automaticFireInterval) / 1000)
    : 1000 / Math.max(500, a.reloadTime);
  const rate = Math.max(MIN_KILL_RATE, (pen * shotsPerSecond) / shotsToKill);
  killRateCache.set(key, rate);
  return rate;
}

interface Fighter { type: string; bonus?: number }

/**
 * Seconds a force needs to knock out every tank it faces, all guns turning
 * on one target after another. A target it can hardly penetrate (a Tiger
 * for 75 mm Shermans) costs far more time than easy ones save, so a few
 * weak tanks cannot hide a heavy one. For one type a side this is
 * Lanchester's square law: twice the tanks, a quarter of the time.
 */
function timeToDestroy(force: Fighter[], opponents: Fighter[]): number {
  let time = 0;
  for (const target of opponents) {
    let rate = 0;
    for (const unit of force) rate += (unit.bonus ?? 1) * killRate(unit.type, target.type);
    time += 1 / rate;
  }
  return time;
}

/** How much stronger the enemy is: above 1 it wins a straight fight. */
function forceOdds(allies: Fighter[], enemies: Fighter[]): number {
  if (enemies.length === 0) return 0;
  return timeToDestroy(allies, enemies) / timeToDestroy(enemies, allies);
}

/**
 * How heavy a tank is, independent of the matchup: frontal armour times
 * gun, 1 for a Panzer IV. Sets how scarce it is and what counts as light.
 */
function tankClass(def: TankResolvedSpec): number {
  const pen = getAmmoPenetrationAtDistance(def.weapons.AP, 'AP', def.caliber, 500);
  return (effectiveArmour(def.id, 'front') / 80) * (pen / 90);
}

/* ------------------------------------------------------------------ */
/*  Period and paint                                                   */
/* ------------------------------------------------------------------ */

/** A scheme's period ("1943-45") as years, or null for seasonal schemes. */
function schemeYears(period: string): [number, number] | null {
  const match = /^(\d{4})-(\d{2,4})$/.exec(period.trim());
  if (!match) return null;
  const from = Number(match[1]);
  const to = match[2].length === 2 ? Math.floor(from / 100) * 100 + Number(match[2]) : Number(match[2]);
  return [from, to];
}

/** A paint scheme for the period and season, or undefined for the tank's default. */
function pickCamouflage(rng: Rng, def: TankResolvedSpec, year: number, winter: boolean): string | undefined {
  const schemes = def.camouflage;
  if (schemes.length < 2) return undefined;
  if (winter) {
    const whitewash = schemes.find((scheme) => scheme.pattern === 'whitewash');
    if (whitewash) return whitewash.id;
  }
  const inPeriod = schemes.filter((scheme) => {
    if (scheme.pattern === 'whitewash') return false;
    const years = schemeYears(scheme.period);
    return years !== null && year >= years[0] && year <= years[1];
  });
  if (inPeriod.length === 0) return undefined;
  return inPeriod[Math.floor(rng() * inPeriod.length)].id;
}

/**
 * How likely a tank is to turn up in a given year: not before it entered
 * service, rarer once it is outdated, and the stronger it is the scarcer
 * (there were far fewer Tigers than Panzer IVs). A tank that can barely
 * fight the other side (a Panzer II against Shermans) seldom appears.
 */
function availability(def: TankResolvedSpec, year: number): number {
  if (def.year > year) return 0;
  const age = year - def.year;
  const obsolescence = age > 4 ? 0.35 : age > 2 ? 0.75 : 1;
  const weight = tankClass(def);
  const outclassed = weight < 0.25 ? 0.15 : 1;
  return obsolescence * outclassed / Math.sqrt(Math.max(weight, 0.05));
}

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

export type OobOdds = 'random' | 'favourable' | 'even' | 'hard' | 'desperate';
export type OobRange = 'random' | 'close' | 'medium' | 'long';
export type OobSeason = 'random' | 'summer' | 'winter';
export type OobEnemyMix = 'historical' | 'light' | 'heavy';

export interface OobGeneratorSettings {
  /** Tanks on your side besides your own; null sizes the force to the map. */
  alliedTanks: number | null;
  /** How many of those take your orders; the rest fight on their own. */
  wingmen: number;
  /** Enemy strength against yours, weighed by the matchups. */
  odds: OobOdds;
  /** Year of the battle; null picks one from your tank's service. */
  year: number | null;
  season: OobSeason;
  /** How far apart the two forces start. */
  range: OobRange;
  /** Which enemy tanks the points are spent on. */
  enemyMix: OobEnemyMix;
}

export const DEFAULT_OOB_SETTINGS: OobGeneratorSettings = {
  alliedTanks: null,
  wingmen: 3,
  odds: 'random',
  year: null,
  season: 'random',
  range: 'random',
  enemyMix: 'historical',
};

export const OOB_YEARS = [1941, 1942, 1943, 1944, 1945];
export const MAX_ALLIED_TANKS = 9;
const MAX_ENEMY_TANKS = 12;

/** Enemy strength over allied (square law: 1.44 is 1.2 times the tanks of one type). */
const ODDS_RANGES: Record<Exclude<OobOdds, 'random'>, [number, number]> = {
  favourable: [0.45, 0.7],
  even: [0.85, 1.15],
  hard: [1.35, 1.8],
  desperate: [2.1, 2.8],
};
const RANDOM_ODDS: [number, number] = [0.6, 1.4];

/** Distance between the two deployments, in metres. */
const RANGE_SEPARATIONS: Record<Exclude<OobRange, 'random'>, [number, number]> = {
  close: [500, 750],
  medium: [800, 1150],
  long: [1200, 1600],
};

const ALLIED_SIZES: [number, [number, number]][] = [[1000, [1, 3]], [2000, [2, 4]], [4000, [3, 6]]];

function alliedSizeFor(mapSize: number): [number, number] {
  return ALLIED_SIZES.reduce((best, entry) =>
    Math.abs(entry[0] - mapSize) < Math.abs(best[0] - mapSize) ? entry : best)[1];
}

/** Leans the enemy's picks toward light or heavy tanks. */
function mixFactor(mix: OobEnemyMix, def: TankResolvedSpec): number {
  const weight = tankClass(def);
  if (mix === 'light') return 1 / Math.sqrt(Math.max(weight, 0.05));
  if (mix === 'heavy') return Math.pow(weight, 2);
  return 1;
}

/* ------------------------------------------------------------------ */
/*  Force composition                                                  */
/* ------------------------------------------------------------------ */

interface Composition {
  year: number;
  winter: boolean;
  allies: { type: string; camouflage?: string; wingman: boolean }[];
  enemies: { type: string; camouflage?: string }[];
  odds: number;
}

function composeForces(rng: Rng, input: OobGeneratorInput): Composition {
  const settings = input.settings;
  const playerDef = getTankDef(input.playerTankType);
  // Battles are fought from 1941 on, whatever the year the tank entered service.
  const firstYear = Math.max(OOB_YEARS[0], playerDef.year);
  const year = settings.year
    ?? Math.min(1945, firstYear + randInt(rng, 0, Math.max(0, Math.min(2, 1945 - firstYear))));
  const winter = settings.season === 'winter' || (settings.season === 'random' && rng() < 0.2);

  // The player's own army where it has tanks of the period; otherwise any allied tank.
  const national = input.alliedPool.filter((def) => def.nationality === playerDef.nationality && def.year <= year);
  const inService = input.alliedPool.filter((def) => def.year <= year);
  const alliedPool = national.length > 0 ? national : inService.length > 0 ? inService : [playerDef];
  let enemyPool = input.enemyPool.filter((def) => def.year <= year);
  // Nothing in service yet: the oldest enemy tanks stand in.
  if (enemyPool.length === 0) {
    const earliest = Math.min(...input.enemyPool.map((def) => def.year));
    enemyPool = input.enemyPool.filter((def) => def.year === earliest);
  }

  const serviceYear = (def: TankResolvedSpec) => Math.min(def.year, year);

  const sizeRange = alliedSizeFor(input.mapSize);
  const allyCount = settings.alliedTanks ?? randInt(rng, sizeRange[0], sizeRange[1]);
  const allies: Composition['allies'] = [];
  const allyCamouflage = pickCamouflage(rng, alliedPool[0], year, winter);
  for (let i = 0; i < allyCount; i++) {
    // Platoons were mostly one type: the player's own tank is the likeliest pick.
    const def = pickWeighted(rng, alliedPool, (d) =>
      availability({ ...d, year: serviceYear(d) }, year) * (d.id === playerDef.id ? 3 : 1));
    const scheme = def.camouflage.some((s) => s.id === allyCamouflage) ? allyCamouflage : pickCamouflage(rng, def, year, winter);
    allies.push({ type: def.id, camouflage: scheme, wingman: i < settings.wingmen });
  }

  // The enemy is weighed against the tanks actually fielded, not the whole catalogue.
  const alliedFighters: Fighter[] = [
    { type: playerDef.id, bonus: PLAYER_BONUS },
    ...allies.map((unit) => ({ type: unit.type })),
  ];
  const oddsRange = settings.odds === 'random' ? RANDOM_ODDS : ODDS_RANGES[settings.odds];
  const target = randRange(rng, oddsRange[0], oddsRange[1]);

  const weightOf = (def: TankResolvedSpec) =>
    availability({ ...def, year: serviceYear(def) }, year) * mixFactor(settings.enemyMix, def);
  const enemies: Composition['enemies'] = [];
  const enemyFighters: Fighter[] = [];
  const enemyCamouflageByType = new Map<string, string | undefined>();
  let odds = 0;
  // Platoons of one to three of a type, as the enemy would have organised them.
  let platoonType: TankResolvedSpec | null = null;
  let platoonLeft = 0;
  while (enemies.length < MAX_ENEMY_TANKS && odds < target) {
    const oddsWith = (def: TankResolvedSpec) => forceOdds(alliedFighters, [...enemyFighters, { type: def.id }]);
    // A tank fits while adding it leaves the odds nearer the target than
    // stopping would, and overshoots it by no more than a quarter.
    const fits = (def: TankResolvedSpec) => {
      const after = oddsWith(def);
      return after - target < Math.min(target - odds, target * 0.25);
    };
    if (!platoonType || platoonLeft <= 0 || !fits(platoonType)) {
      const eligible = enemyPool.filter(fits);
      if (eligible.length === 0) {
        if (enemies.length > 0) break;
        // There is always an enemy: the one that tips the odds least.
        eligible.push(enemyPool.reduce((a, b) => (oddsWith(a) <= oddsWith(b) ? a : b)));
      }
      platoonType = pickWeighted(rng, eligible, weightOf);
      platoonLeft = randInt(rng, 1, 3);
    }
    if (!enemyCamouflageByType.has(platoonType.id)) {
      enemyCamouflageByType.set(platoonType.id, pickCamouflage(rng, platoonType, year, winter));
    }
    enemies.push({ type: platoonType.id, camouflage: enemyCamouflageByType.get(platoonType.id) });
    enemyFighters.push({ type: platoonType.id });
    odds = forceOdds(alliedFighters, enemyFighters);
    platoonLeft--;
  }

  return { year, winter, allies, enemies, odds };
}

/* ------------------------------------------------------------------ */
/*  Deployment                                                         */
/* ------------------------------------------------------------------ */

type Formation = 'line' | 'wedge' | 'echelon' | 'column';
const FORMATIONS: Formation[] = ['line', 'wedge', 'echelon', 'column'];

/** Slot offsets (lateral, forward) in metres, the lead at the origin. */
function formationSlots(formation: Formation, count: number, spacing: number): [number, number][] {
  const slots: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const rank = Math.ceil(i / 2);
    const side = i % 2 === 1 ? -1 : 1;
    switch (formation) {
      case 'line': slots.push([side * rank * spacing, 0]); break;
      case 'wedge': slots.push([side * rank * spacing, -rank * spacing * 0.7]); break;
      case 'echelon': slots.push([i * spacing, -i * spacing * 0.6]); break;
      case 'column': slots.push([(i % 2) * spacing * 0.4, -i * spacing]); break;
    }
  }
  return slots;
}

/** Splits a force into platoons of three to five. */
function platoons<T>(units: T[], rng: Rng): T[][] {
  const groups: T[][] = [];
  let index = 0;
  while (index < units.length) {
    const left = units.length - index;
    const size = left <= 5 ? left : randInt(rng, 3, Math.min(5, left - 2));
    groups.push(units.slice(index, index + size));
    index += size;
  }
  return groups;
}

export function generateRandomOob(input: OobGeneratorInput): GeneratedOob {
  const rng = mulberry32(input.seed);
  const composition = composeForces(rng, input);
  const half = input.mapSize / 2;

  // The line of advance: mostly along the roads' grain, sometimes across it.
  const cardinal = rng() < 0.6;
  const bearing = cardinal ? randInt(rng, 0, 3) * (Math.PI / 2) : rng() * Math.PI * 2;
  const forward: [number, number] = [Math.sin(bearing), Math.cos(bearing)];
  const right: [number, number] = [Math.cos(bearing), -Math.sin(bearing)];

  // Start outside detection range but close enough to meet within a few minutes.
  const separationRange = input.settings.range === 'random'
    ? RANGE_SEPARATIONS[(['close', 'medium', 'medium', 'long'] as const)[randInt(rng, 0, 3)]]
    : RANGE_SEPARATIONS[input.settings.range];
  const reach = Math.min(Math.abs(forward[0]) > Math.abs(forward[1]) ? half / Math.abs(forward[0]) : half / Math.abs(forward[1]), half * 1.4);
  const maxSeparation = Math.max(400, 2 * (reach - 160));
  const separation = Math.min(maxSeparation, randRange(rng, separationRange[0], separationRange[1]));
  const shift = randRange(rng, -0.25, 0.25) * half;
  const alliedCentre: [number, number] = [
    -forward[0] * separation / 2 + right[0] * shift,
    -forward[1] * separation / 2 + right[1] * shift,
  ];
  const enemyCentre: [number, number] = [
    forward[0] * separation / 2 + right[0] * shift * randRange(rng, -1, 1),
    forward[1] * separation / 2 + right[1] * shift * randRange(rng, -1, 1),
  ];

  const clampToMap = (x: number, z: number): [number, number] => {
    const limit = half - 60;
    return [Math.max(-limit, Math.min(limit, x)), Math.max(-limit, Math.min(limit, z))];
  };
  const placed: [number, number][] = [];
  /** Open ground near a point, kept apart from tanks already placed. */
  const place = (x: number, z: number): [number, number] => {
    let best: [number, number] = input.open(...clampToMap(x, z));
    for (let attempt = 0; attempt < 24; attempt++) {
      const crowded = placed.some(([px, pz]) => Math.hypot(px - best[0], pz - best[1]) < 16);
      if (!crowded) break;
      const angle = rng() * Math.PI * 2;
      const radius = 18 + attempt * 6;
      best = input.open(...clampToMap(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
    }
    placed.push(best);
    return best;
  };
  const toWorld = (centre: [number, number], dir: 1 | -1, lateral: number, ahead: number): [number, number] => [
    centre[0] + (right[0] * lateral + forward[0] * ahead) * dir,
    centre[1] + (right[1] * lateral + forward[1] * ahead) * dir,
  ];
  const facingEnemy = Math.atan2(forward[0], forward[1]);
  const facingPlayer = Math.atan2(-forward[0], -forward[1]);

  // Allied side: the player leads the wingmen; friendly units form their own group on a flank.
  const spacing = randRange(rng, 30, 45);
  const wingmen = composition.allies.filter((unit) => unit.wingman);
  const friendly = composition.allies.filter((unit) => !unit.wingman);
  const allyFormation = FORMATIONS[randInt(rng, 0, FORMATIONS.length - 1)];
  const playerSlots = formationSlots(allyFormation, wingmen.length + 1, spacing);
  const playerPosition = place(...toWorld(alliedCentre, 1, playerSlots[0][0], playerSlots[0][1]));
  const allies: GeneratedUnit[] = wingmen.map((unit, i) => ({
    id: uuidv4(),
    tankType: unit.type,
    camouflage: unit.camouflage,
    position: place(...toWorld(alliedCentre, 1, playerSlots[i + 1][0], playerSlots[i + 1][1])),
    rotation: facingEnemy,
    wingman: true,
  }));
  if (friendly.length > 0) {
    const flank = (rng() < 0.5 ? -1 : 1) * randRange(rng, 150, 260);
    const slots = formationSlots(FORMATIONS[randInt(rng, 0, FORMATIONS.length - 1)], friendly.length, spacing);
    friendly.forEach((unit, i) => allies.push({
      id: uuidv4(),
      tankType: unit.type,
      camouflage: unit.camouflage,
      position: place(...toWorld(alliedCentre, 1, flank + slots[i][0], slots[i][1] - randRange(rng, 0, 60))),
      rotation: facingEnemy,
      wingman: false,
    }));
  }

  // Enemy side: platoons spread across a front, some held back in depth.
  const enemies: GeneratedUnit[] = [];
  const groups = platoons(composition.enemies, rng);
  const front = Math.min(half * 0.9, 120 + groups.length * randRange(rng, 90, 160));
  groups.forEach((group, g) => {
    const lateral = groups.length === 1 ? 0 : -front / 2 + (front * g) / (groups.length - 1);
    const depth = g === 0 ? 0 : randRange(rng, -40, 120);
    const slots = formationSlots(FORMATIONS[randInt(rng, 0, FORMATIONS.length - 1)], group.length, spacing);
    group.forEach((unit, i) => enemies.push({
      id: uuidv4(),
      tankType: unit.type,
      camouflage: unit.camouflage,
      // Mirrored frame: the enemy's "ahead" points at the player.
      position: place(...toWorld(enemyCentre, -1, lateral + slots[i][0], slots[i][1] - depth)),
      rotation: facingPlayer,
    }));
  });

  const odds = composition.odds;
  const balance = odds > 1.9 ? 'heavily outmatched' : odds > 1.25 ? 'enemy stronger'
    : odds < 0.75 ? 'odds in your favour' : 'even odds';
  const compass = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  // +Z is south on the map sheet; the enemy lies along `forward`.
  const heading = Math.atan2(forward[0], -forward[1]);
  const towards = compass[Math.round(((heading + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
  const summary = `${composition.winter ? 'Winter ' : ''}${composition.year} · ${allies.length + 1} v ${enemies.length} · ${balance} · enemy ${(separation / 1000).toFixed(1)} km to the ${towards}`;

  return { playerPosition, allies, enemies, summary };
}
