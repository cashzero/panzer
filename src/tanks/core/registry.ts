import type { TankDefinition, TankModule } from './types';
import { extractTankDefinitionFromExports, extractTankModuleFromExports } from './validate';

interface RegisteredTankEntry {
  definition: TankDefinition;
  module: TankModule;
  sourcePath: string;
  priority: number;
}

const folderModules = import.meta.glob('../*/index.ts', {eager: true}) as Record<string, Record<string, unknown>>;
const legacyModules = import.meta.glob('../*.tsx', {eager: true}) as Record<string, Record<string, unknown>>;

const LEGACY_SORT_ORDER: Record<string, number> = {
  sherman: 0,
  tiger: 1,
  panzer3: 2,
  panzer2: 3,
  sherman_a2_76: 4,
  t34: 5,
  panzer4: 6,
};

function registerEntry(registry: Map<string, RegisteredTankEntry>, entry: RegisteredTankEntry) {
  const existing = registry.get(entry.definition.id);
  if (!existing) {
    registry.set(entry.definition.id, entry);
    return;
  }

  if (entry.priority > existing.priority) {
    registry.set(entry.definition.id, entry);
    return;
  }

  if (entry.priority < existing.priority) {
    return;
  }

  throw new Error(`Duplicate tank id '${entry.definition.id}' from '${existing.sourcePath}' and '${entry.sourcePath}'.`);
}

function collectEntries(): RegisteredTankEntry[] {
  const registry = new Map<string, RegisteredTankEntry>();

  for (const [sourcePath, moduleExports] of Object.entries(folderModules)) {
    const tankModule = extractTankModuleFromExports(moduleExports);
    if (!tankModule) continue;

    registerEntry(registry, {
      definition: tankModule.definition,
      module: tankModule,
      sourcePath,
      priority: 20,
    });
  }

  for (const [sourcePath, moduleExports] of Object.entries(legacyModules)) {
    const tankDefinition = extractTankDefinitionFromExports(moduleExports);
    if (!tankDefinition) continue;

    registerEntry(registry, {
      definition: tankDefinition,
      module: {definition: tankDefinition, source: 'legacy'},
      sourcePath,
      priority: 10,
    });
  }

  return Array.from(registry.values()).sort((left, right) => {
    const leftOrder = left.module.spec?.catalog?.sortOrder ?? LEGACY_SORT_ORDER[left.definition.id] ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.module.spec?.catalog?.sortOrder ?? LEGACY_SORT_ORDER[right.definition.id] ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.definition.displayName.localeCompare(right.definition.displayName);
  });
}

const REGISTERED_TANKS = collectEntries();
const TANK_REGISTRY = new Map(REGISTERED_TANKS.map((entry) => [entry.definition.id, entry]));

export function getTankDef(tankType: string): TankDefinition {
  const entry = TANK_REGISTRY.get(tankType);
  if (!entry) throw new Error(`Unknown tank type: ${tankType}`);
  return entry.definition;
}

export function getAllTankDefs(): TankDefinition[] {
  return REGISTERED_TANKS.map((entry) => entry.definition);
}

export function getTankModule(tankType: string): TankModule {
  const entry = TANK_REGISTRY.get(tankType);
  if (!entry) throw new Error(`Unknown tank type: ${tankType}`);
  return entry.module;
}

export function getAllTankModules(): TankModule[] {
  return REGISTERED_TANKS.map((entry) => entry.module);
}
