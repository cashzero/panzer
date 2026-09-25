import type { TankData } from './store';
import type { TankDefinition } from './tanks/types';

/**
 * The after-action record of one battle: what each tank fired, hit and
 * destroyed, who destroyed whom, and how it ended. Built up by the store as
 * shells land; read by the HUD and the debrief.
 */

export type BattleOutcome = 'victory' | 'defeat';

/**
 * What fired a round. Automatic weapons (the Panzer II's 20 mm autocannon,
 * and machine guns when they come) hose rounds at a target, so they are
 * tallied apart and left out of gunnery accuracy, which is about laying a
 * main gun.
 */
export type WeaponClass = 'gun' | 'automatic';

export function weaponClassOf(def: TankDefinition): WeaponClass {
  return def.automaticMagazineSize ? 'automatic' : 'gun';
}

export interface CombatRecord {
  /** Main-gun rounds fired. */
  shotsFired: number;
  /** Main-gun rounds that struck an opposing tank, whatever the result. */
  hits: number;
  /** Rounds from automatic weapons, kept out of accuracy. */
  automaticRounds: number;
  automaticHits: number;
  penetrations: number;
  kills: number;
  /** Hull hit points taken off opposing tanks. */
  damageDealt: number;
  hitsTaken: number;
  damageTaken: number;
}

export interface KillEntry {
  killerId: string;
  victimId: string;
  at: number;
}

export interface BattleStats {
  startedAt: number;
  /** 0 while the battle is on. */
  endedAt: number;
  outcome: BattleOutcome | null;
  records: Record<string, CombatRecord>;
  kills: KillEntry[];
}

export interface HitResult {
  weapon: WeaponClass;
  penetrated: boolean;
  /** Hull hit points the round took off. */
  damage: number;
  killed: boolean;
}

const EMPTY_RECORD: CombatRecord = {
  shotsFired: 0, hits: 0, automaticRounds: 0, automaticHits: 0, penetrations: 0, kills: 0, damageDealt: 0, hitsTaken: 0, damageTaken: 0,
};

export function createBattleStats(now: number): BattleStats {
  return { startedAt: now, endedAt: 0, outcome: null, records: {}, kills: [] };
}

export function getRecord(stats: BattleStats, tankId: string): CombatRecord {
  return stats.records[tankId] ?? EMPTY_RECORD;
}

function bump(stats: BattleStats, tankId: string, changes: Partial<CombatRecord>): Record<string, CombatRecord> {
  const record = { ...getRecord(stats, tankId) };
  for (const key of Object.keys(changes) as Array<keyof CombatRecord>) record[key] += changes[key] ?? 0;
  return { ...stats.records, [tankId]: record };
}

export function withShot(stats: BattleStats, shooterId: string, weapon: WeaponClass): BattleStats {
  if (stats.outcome) return stats;
  return { ...stats, records: bump(stats, shooterId, weapon === 'gun' ? { shotsFired: 1 } : { automaticRounds: 1 }) };
}

/**
 * Records a round striking a tank. A hit on a tank of the shooter's own
 * side counts against the target but earns the shooter nothing.
 */
export function withHit(
  stats: BattleStats,
  shooterId: string,
  targetId: string,
  opposing: boolean,
  result: HitResult,
  now: number,
): BattleStats {
  if (stats.outcome) return stats;
  let next: BattleStats = { ...stats, records: bump(stats, targetId, { hitsTaken: 1, damageTaken: result.damage }) };
  if (opposing) {
    next = {
      ...next,
      records: bump(next, shooterId, {
        ...(result.weapon === 'gun' ? { hits: 1 } : { automaticHits: 1 }),
        penetrations: result.penetrated ? 1 : 0,
        damageDealt: result.damage,
        kills: result.killed ? 1 : 0,
      }),
    };
  }
  if (result.killed) next = { ...next, kills: [...next.kills, { killerId: shooterId, victimId: targetId, at: now }] };
  return next;
}

/** Victory when every enemy is destroyed; defeat when the player's tank is. */
export function decideOutcome(player: TankData, enemies: TankData[]): BattleOutcome | null {
  if (player.destroyed) return 'defeat';
  if (enemies.length > 0 && enemies.every((enemy) => enemy.destroyed)) return 'victory';
  return null;
}

export function withOutcome(stats: BattleStats, outcome: BattleOutcome | null, now: number): BattleStats {
  if (stats.outcome || !outcome) return stats;
  return { ...stats, outcome, endedAt: now };
}
