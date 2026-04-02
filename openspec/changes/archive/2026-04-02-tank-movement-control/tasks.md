## 1. Steering Model Rework

- [x] 1.1 Update tracked-vehicle target-speed generation in `src/tankPhysics.ts` so stationary pivot steering is intentionally weaker than low-speed forward steering.
- [x] 1.2 Rework forward steering targets to trade a small amount of speed for a visibly tighter turning line across low- and medium-speed driving.
- [x] 1.3 Preserve broad, deliberate turning at higher speeds by applying speed-regime-aware steering falloff instead of a flat turn-rate boost.

## 2. Mobility Tuning Integration

- [x] 2.1 Decide which steering-related tuning surfaces belong in shared movement logic versus per-tank mobility data.
- [x] 2.2 Update the affected tank mobility definitions in `src/tanks/*/tank.json` so medium and heavy tanks retain distinct handling while following the new steering contract.
- [x] 2.3 Confirm whether AI tanks should use the same steering target generation or require conservative tuning adjustments for path stability.

## 3. Validation And Documentation

- [x] 3.1 Validate the new handling profile in play using at least one medium tank and one heavy tank, checking stationary, low-speed, medium-speed, and high-speed steering behavior.
- [x] 3.2 Run `npm run lint` to verify the movement-control changes and related data updates remain type-safe.
- [x] 3.3 Update `openspec/product.md` and-or related OpenSpec docs if implementation establishes new stable movement-control behavior worth documenting outside the change artifacts.
