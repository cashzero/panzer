import { createParametricRenderer } from '../core/ParametricTankRenderer';
import { createTankDefinition } from '../core/resolver';
import type { TankModelSpec, TankModule, TankSpec } from '../core/types';
import modelJson from './model.json';
import tankJson from './tank.json';

const spec = tankJson as TankSpec;
const model = modelJson as TankModelSpec;

export const definition = createTankDefinition(spec, createParametricRenderer(model));

export const tankModule: TankModule = {
  definition,
  spec,
  model,
  source: 'parametric',
};
