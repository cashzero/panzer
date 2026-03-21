import type { TankDefinition } from './types';
import { shermanDef } from './sherman';
import { tigerDef } from './tiger';
import { panzer3Def } from './panzer3';
import { panzer2Def } from './panzer2';

const TANK_REGISTRY = new Map<string, TankDefinition>();

function register(def: TankDefinition) {
  TANK_REGISTRY.set(def.id, def);
}

register(shermanDef);
register(tigerDef);
register(panzer3Def);
register(panzer2Def);

export function getTankDef(tankType: string): TankDefinition {
  const def = TANK_REGISTRY.get(tankType);
  if (!def) throw new Error(`Unknown tank type: ${tankType}`);
  return def;
}

export function getAllTankDefs(): TankDefinition[] {
  return Array.from(TANK_REGISTRY.values());
}
