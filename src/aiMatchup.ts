import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { getAmmoPenetrationAtDistance } from './penetrationModel';
import { getTankDef } from './tanks/registry';
import { testProjectileAgainstTank } from './armorModel';
import { analyzeImpact, computeEffectiveArmor } from './combatPhysics';
import type { TankData } from './store';

/**
 * How one tank type should fight another: how far each gun defeats the
 * other's armour, the standoff range that follows and the part to play.
 * Pure data about the two vehicles, with no world access, so deployment
 * can use it as well as the AI loops.
 */

/**
 * - `assault`: close to a range where the gun works, halting to fire.
 * - `overwatch`: out-ranges the enemy, or cannot hurt it at all; holds a
 *   hull-down position far off.
 * - `flank`: cannot beat the frontal armour; swings round to the side.
 */
export type AiRole = 'assault' | 'overwatch' | 'flank';

export interface Matchup {
  /** Farthest range at which our AP defeats the target's front, 0 if never. */
  frontPenRange: number;
  /** Farthest range at which our AP defeats the target's side, 0 if never. */
  sidePenRange: number;
  /** Farthest range at which the target's AP defeats our front, 0 if never. */
  threatRange: number;
  preferredRange: number;
  role: AiRole;
}

type Facing = 'front' | 'side';

const armourCache = new Map<string, number>();

/**
 * Line-of-sight armour a level shot meets on one face, found the way a shell
 * finds it: a grid of rays against the tank's own armour plates, each hit
 * taken as thickness over the cosine of its impact angle (a ricochet counts
 * as proof). The median over the silhouette stands for the face, so a
 * Sherman's sloped 51 mm glacis counts for what it is worth and a thick
 * mantlet or a thin hatch does not decide it.
 */
export function effectiveArmour(tankType: string, facing: Facing): number {
  const key = `${tankType}:${facing}`;
  const cached = armourCache.get(key);
  if (cached !== undefined) return cached;
  const def = getTankDef(tankType);
  const dummy = {
    position: new THREE.Vector3(), rotation: 0, pitch: 0, roll: 0, turretRotation: 0, gunElevation: 0,
  } as TankData;
  const profile = { plates: def.plates, broadPhaseRadius: def.broadPhaseRadius };
  const ray = new THREE.Ray();
  const values: number[] = [];
  const reach = 40;
  for (let row = 0; row < 6; row++) {
    const y = 0.6 + row * 0.4;
    for (let column = 0; column < 9; column++) {
      const across = -1 + column * 0.25; // fraction of the half width or length
      if (facing === 'front') {
        ray.origin.set(across * def.trackWidth * 0.45, y, reach);
        ray.direction.set(0, 0, -1);
      } else {
        ray.origin.set(reach, y, across * def.broadPhaseRadius * 0.6);
        ray.direction.set(-1, 0, 0);
      }
      const hit = testProjectileAgainstTank(ray, reach * 2, dummy, profile, def.turretOffset, def.gunPivotOffset);
      if (!hit || hit.plateInfo.zone === 'track') continue;
      const impact = analyzeImpact(ray.direction, hit.normal);
      values.push(impact.isAutoRicochet ? Infinity : computeEffectiveArmor(hit.plateInfo.armorThickness, impact.angleRad));
    }
  }
  values.sort((a, b) => a - b);
  const median = values.length > 0 ? values[Math.floor(values.length / 2)] : def.armor[facing];
  const value = Number.isFinite(median) ? median : def.armor[facing] * 3;
  armourCache.set(key, value);
  return value;
}

/** Farthest range (to the tactics horizon) at which `attacker`'s AP defeats `armour` mm. */
function penetrationRange(attackerType: string, armour: number): number {
  const def = getTankDef(attackerType);
  const { penetrationMargin, rangeHorizon } = GAME_CONFIG.ai.tactics;
  let reach = 0;
  for (let d = 0; d <= rangeHorizon; d += 50) {
    if (getAmmoPenetrationAtDistance(def.weapons.AP, 'AP', def.caliber, d) < armour * penetrationMargin) break;
    reach = d === 0 ? 1 : d;
  }
  return reach;
}

const matchupCache = new Map<string, Omit<Matchup, 'role'> & { outranges: boolean }>();

export function idHash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** How `selfType` should fight `targetType`. The role also varies with the tank's id. */
export function getMatchup(selfId: string, selfType: string, targetType: string): Matchup {
  const key = `${selfType}>${targetType}`;
  let base = matchupCache.get(key);
  if (!base) {
    const { minRange, maxRange } = GAME_CONFIG.ai.tactics;
    const frontPenRange = penetrationRange(selfType, effectiveArmour(targetType, 'front'));
    const sidePenRange = penetrationRange(selfType, effectiveArmour(targetType, 'side'));
    const threatRange = penetrationRange(targetType, effectiveArmour(selfType, 'front'));
    const outranges = frontPenRange > 0 && threatRange < frontPenRange - 200;
    let preferredRange: number;
    if (frontPenRange <= 0 && sidePenRange <= 0) {
      // Nothing to gain by closing: hang back and spot for the others.
      preferredRange = maxRange * 0.85;
    } else if (frontPenRange <= 0) {
      // Only the side will do: get in close enough for that.
      preferredRange = THREE.MathUtils.clamp(sidePenRange * 0.7, 80, maxRange * 0.6);
    } else if (outranges) {
      // Stay outside the enemy's reach but inside our own.
      preferredRange = THREE.MathUtils.clamp(
        threatRange > 0 ? threatRange + 250 : maxRange * 0.85,
        minRange, Math.min(maxRange, frontPenRange * 0.85),
      );
    } else {
      preferredRange = THREE.MathUtils.clamp(frontPenRange * 0.7, minRange, maxRange);
    }
    base = { frontPenRange, sidePenRange, threatRange, preferredRange, outranges };
    matchupCache.set(key, base);
  }
  let role: AiRole;
  if (base.frontPenRange <= 0 && base.sidePenRange <= 0) role = 'overwatch';
  else if (base.frontPenRange <= 0) role = 'flank';
  else if (base.outranges) role = 'overwatch';
  else role = idHash(selfId) % 3 === 0 ? 'flank' : 'assault';
  return {
    frontPenRange: base.frontPenRange,
    sidePenRange: base.sidePenRange,
    threatRange: base.threatRange,
    preferredRange: base.preferredRange,
    role,
  };
}

/** Whether our AP can hurt the target at this range from some reasonable angle. */
export function canHurtAt(matchup: Matchup, distance: number) {
  return distance <= matchup.frontPenRange || distance <= matchup.sidePenRange * 0.8;
}
