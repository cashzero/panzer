import { GAME_CONFIG } from './config';
import type { AmmoKey, TankAmmoSpec, TankHistoricalPenetrationPoint } from './tanks/core/types';

function getSortedHistoricalPoints(ammo: TankAmmoSpec): TankHistoricalPenetrationPoint[] {
  const points = ammo.historicalPenetration?.points ?? [];
  return points
    .filter((point) => Number.isFinite(point.distance) && point.distance >= 0 && Number.isFinite(point.penetration) && point.penetration > 0)
    .slice()
    .sort((a, b) => a.distance - b.distance);
}

function getGeneratedPenetrationFromReference(
  referencePenetration: number,
  referenceDistance: number,
  velocity: number,
  ammoType: AmmoKey,
  caliber: number,
  distance: number,
): number {
  const clampedDistance = Math.max(0, distance);
  const clampedReferenceDistance = Math.max(0, referenceDistance);
  const decayScale = Math.max(
    250,
    velocity * (
      GAME_CONFIG.combat.generatedPenetration.velocityBaseFactor
      + caliber * GAME_CONFIG.combat.generatedPenetration.caliberFactor
    ),
  );
  const exponent = GAME_CONFIG.combat.generatedPenetration.exponent[ammoType];
  const refVelocityFactor = Math.exp(-clampedReferenceDistance / decayScale);
  const distanceVelocityFactor = Math.exp(-clampedDistance / decayScale);
  return Math.max(0, referencePenetration * Math.pow(distanceVelocityFactor / refVelocityFactor, exponent));
}

export function getReferencePenetrationDistance(): number {
  return GAME_CONFIG.combat.referencePenetrationDistance;
}

export function hasHistoricalPenetrationData(ammo: TankAmmoSpec): boolean {
  return getSortedHistoricalPoints(ammo).length > 0;
}

export function getGeneratedPenetrationAtDistance(
  ammo: TankAmmoSpec,
  ammoType: AmmoKey,
  caliber: number,
  distance: number,
): number {
  return getGeneratedPenetrationFromReference(
    ammo.penetration,
    getReferencePenetrationDistance(),
    ammo.velocity,
    ammoType,
    caliber,
    distance,
  );
}

export function getAmmoPenetrationAtDistance(
  ammo: TankAmmoSpec,
  ammoType: AmmoKey,
  caliber: number,
  distance: number,
): number {
  const points = getSortedHistoricalPoints(ammo);
  if (points.length === 0) {
    return getGeneratedPenetrationAtDistance(ammo, ammoType, caliber, distance);
  }

  if (points.length === 1) {
    return getGeneratedPenetrationFromReference(
      points[0].penetration,
      points[0].distance,
      ammo.velocity,
      ammoType,
      caliber,
      distance,
    );
  }

  const clampedDistance = Math.max(0, distance);
  const firstPoint = points[0];
  if (clampedDistance <= firstPoint.distance) {
    return getGeneratedPenetrationFromReference(
      firstPoint.penetration,
      firstPoint.distance,
      ammo.velocity,
      ammoType,
      caliber,
      clampedDistance,
    );
  }

  for (let index = 1; index < points.length; index += 1) {
    const prevPoint = points[index - 1];
    const nextPoint = points[index];
    if (clampedDistance > nextPoint.distance) continue;

    const segmentDistance = nextPoint.distance - prevPoint.distance;
    if (segmentDistance <= 0) return nextPoint.penetration;
    const t = (clampedDistance - prevPoint.distance) / segmentDistance;
    return prevPoint.penetration + (nextPoint.penetration - prevPoint.penetration) * t;
  }

  const lastPoint = points[points.length - 1];
  return getGeneratedPenetrationFromReference(
    lastPoint.penetration,
    lastPoint.distance,
    ammo.velocity,
    ammoType,
    caliber,
    clampedDistance,
  );
}

export function getAmmoDisplayPenetration(
  ammo: TankAmmoSpec,
  ammoType: AmmoKey,
  caliber: number,
  distance: number = getReferencePenetrationDistance(),
): number {
  return getAmmoPenetrationAtDistance(ammo, ammoType, caliber, distance);
}
