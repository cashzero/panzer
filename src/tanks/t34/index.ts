import { createParametricRenderer } from '../core/ParametricTankRenderer';
import { createTankDefinition } from '../core/resolver';
import type { TankModelSpec, TankModule, TankSpec } from '../core/types';
import modelJson from './model.json';
import tankJson from './tank.json';

const tank = tankJson as TankSpec;
const model = modelJson as TankModelSpec;

export const definition = createTankDefinition(tank, createParametricRenderer(model));

export const tankModule: TankModule = {
  definition,
  spec: tank,
  model,
  source: 'parametric',
};
