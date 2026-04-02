## Why

The current tank driving feel over-rewards stationary pivot turns while making low- and medium-speed steering feel too wide and unresponsive. This undermines the intended WW2 vehicle handling fantasy, where tanks should feel heavy and deliberate but still steer credibly while moving.

## What Changes

- Define player-facing movement-control behavior for tracked vehicles, including the expected relationship between stationary pivoting, low-speed steering, medium-speed steering, and high-speed turning radius.
- Establish a handling target where low-speed forward motion is the most effective steering state, stationary pivot turns are slower and more laborious, and high-speed movement preserves larger turn radii.
- Specify that forward steering may trade a small amount of speed for a visibly tighter line, instead of preserving speed at the cost of unrealistic understeer.
- Document the movement-control tuning surfaces that implement this behavior in the player tank update loop and shared tank mobility calculations.

## Capabilities

### New Capabilities
- `tank-mobility-control`: Defines intended tracked-vehicle driving behavior, steering effectiveness by speed regime, and player-facing handling expectations.

### Modified Capabilities

## Impact

- Affected code: `src/GameScene.tsx`, `src/tankPhysics.ts`, tank mobility data in `src/tanks/*/tank.json`, and any AI movement paths that share the same movement helpers.
- Affected systems: player driving feel, tank mobility tuning, per-tank handling differentiation, and any OpenSpec product documentation that describes movement behavior.
- No external API or dependency changes are expected.
