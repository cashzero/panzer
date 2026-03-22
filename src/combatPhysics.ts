import { Vector3 } from 'three';
import { GAME_CONFIG } from './config';
import type { AmmoType } from './store';

// --- Impact Analysis ---

export interface ImpactAnalysis {
  angleRad: number;
  angleDeg: number;
  isAutoRicochet: boolean;
}

export function analyzeImpact(projectileVelocity: Vector3, hitNormal: Vector3): ImpactAnalysis {
  const projDir = projectileVelocity.clone().normalize();
  const angleRad = projDir.clone().negate().angleTo(hitNormal);
  const angleDeg = (angleRad * 180) / Math.PI;
  const isAutoRicochet = angleDeg > GAME_CONFIG.combat.autoRicochetAngle;
  return { angleRad, angleDeg, isAutoRicochet };
}

// --- Ricochet ---

export function computeReflectedVelocity(velocity: Vector3, normal: Vector3, damping = 0.3): Vector3 {
  const vel = velocity.clone();
  const n = normal.clone().normalize();
  return vel.sub(n.multiplyScalar(2 * vel.dot(n))).multiplyScalar(damping);
}

// --- Armor & Penetration ---

export function computeEffectiveArmor(baseArmor: number, angleRad: number): number {
  return baseArmor / Math.cos(angleRad);
}

export function rollPenetration(basePenetration: number): number {
  const variance = GAME_CONFIG.combat.penetrationVariance;
  return basePenetration * ((1 - variance) + Math.random() * (variance * 2));
}

// --- Damage ---

export interface DamageResult {
  damage: number;
  newHealth: number;
  destroyed: boolean;
}

export function computeDamage(
  ammoType: AmmoType,
  baseDamage: number,
  actualPen: number,
  effectiveArmor: number,
  targetHealth: number,
): DamageResult {
  const overmatch = actualPen / effectiveArmor;
  let damageMult = 1.0;
  if (ammoType === 'AP') {
    damageMult = Math.min(1.5, Math.max(0.5, overmatch));
  }
  const damage = baseDamage * damageMult;
  const newHealth = Math.max(0, targetHealth - damage);
  return { damage, newHealth, destroyed: newHealth <= 0 };
}

export function computeHESplashDamage(baseDamage: number): number {
  return baseDamage * 0.2;
}
