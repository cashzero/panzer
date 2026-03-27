import type { ArmorPlate } from '../../armorModel';
import type { TankDefinition, TankRenderer, TankResolvedSpec, TankSpec } from './types';

export function toArmorPlates(plates: TankSpec['armorModel']['plates']): ArmorPlate[] {
  return plates.map(({id: _id, ...plate}) => ({...plate}));
}

export function resolveTankSpec(spec: TankSpec): TankResolvedSpec {
  return {
    id: spec.id,
    displayName: spec.meta.displayName,
    description: spec.meta.description,
    nationality: spec.meta.nationality,
    year: spec.meta.year,
    health: spec.durability.health,
    trackHealth: spec.durability.trackHealth,
    armor: {...spec.durability.armorSummary},
    color: spec.appearance.baseColor,
    turretOffset: [...spec.mounts.turretOffset],
    gunPivotOffset: [...spec.mounts.gunPivotOffset],
    muzzleDistance: spec.mounts.muzzleDistance,
    broadPhaseRadius: spec.mounts.broadPhaseRadius,
    horsepower: spec.mobility.horsepower,
    weight: spec.mobility.weight,
    maxSpeed: spec.mobility.maxSpeed,
    maxReverseSpeed: spec.mobility.maxReverseSpeed,
    acceleration: spec.mobility.acceleration,
    deceleration: spec.mobility.deceleration,
    trackWidth: spec.mobility.trackWidth,
    turnRateLimit: spec.mobility.turnRateLimit,
    rotationalInertia: spec.mobility.rotationalInertia,
    turretSpeed: spec.traverse.turretSpeed,
    gunSpeed: spec.traverse.gunSpeed,
    caliber: spec.weapons.caliber,
    reloadTime: spec.weapons.reloadTime,
    burstCount: spec.weapons.burst?.count,
    burstInterval: spec.weapons.burst?.interval,
    weapons: {
      AP: {...spec.weapons.ammo.AP},
      APC: spec.weapons.ammo.APC ? {...spec.weapons.ammo.APC} : undefined,
      HE: spec.weapons.ammo.HE ? {...spec.weapons.ammo.HE} : undefined,
    },
    plates: toArmorPlates(spec.armorModel.plates),
  };
}

export function createTankDefinition(spec: TankSpec, renderer: TankRenderer): TankDefinition {
  return {
    ...resolveTankSpec(spec),
    ...renderer,
  };
}
