import { createParametricRenderer } from '../../tanks/core/ParametricTankRenderer';
import { createTankDefinition } from '../../tanks/core/resolver';
import type { TankModelSpec, TankSpec } from '../../tanks/core/types';

export function buildPreviewDefinition(spec: TankSpec, model: TankModelSpec) {
  return createTankDefinition(spec, createParametricRenderer(model));
}
