import type { TankDefinition, TankModule } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isTankDefinition(value: unknown): value is TankDefinition {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.displayName === 'string' &&
    Array.isArray(value.plates) &&
    typeof value.HullComponent === 'function' &&
    typeof value.TracksComponent === 'function' &&
    typeof value.TurretComponent === 'function' &&
    typeof value.GunComponent === 'function' &&
    isRecord(value.armor) &&
    isRecord(value.weapons)
  );
}

export function isTankModule(value: unknown): value is TankModule {
  return isRecord(value) && isTankDefinition(value.definition);
}

export function extractTankModuleFromExports(moduleExports: Record<string, unknown>): TankModule | null {
  for (const exportName of ['tankModule', 'tankDefinition', 'definition']) {
    const candidate = moduleExports[exportName];
    if (isTankModule(candidate)) return candidate;
  }

  for (const candidate of Object.values(moduleExports)) {
    if (isTankModule(candidate)) return candidate;
  }

  return null;
}

export function extractTankDefinitionFromExports(moduleExports: Record<string, unknown>): TankDefinition | null {
  const tankModule = extractTankModuleFromExports(moduleExports);
  if (tankModule) return tankModule.definition;

  for (const exportName of ['tankDefinition', 'definition']) {
    const candidate = moduleExports[exportName];
    if (isTankDefinition(candidate)) return candidate;
  }

  for (const candidate of Object.values(moduleExports)) {
    if (isTankDefinition(candidate)) return candidate;
  }

  return null;
}
