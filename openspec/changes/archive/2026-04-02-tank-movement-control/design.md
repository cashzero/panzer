## Context

Player tank movement currently flows from keyboard throttle and steering input in `src/GameScene.tsx` into `computeTrackTargets()`, `accelerateTrackSpeeds()`, and `computeTrackMovement()` in `src/tankPhysics.ts`. The current target-speed model gives stationary steering a dedicated pivot mode while forward steering only reduces the inner track by a modest amount, which makes pivot turns feel overpowered and low- to medium-speed turning feel too wide.

This change needs to preserve the game's heavy WW2 handling fantasy while making the best steering state occur during low-speed forward motion rather than at a standstill. The user preference gathered during exploration was: stationary pivoting should be weaker, moving turns should trade a small amount of speed for a noticeably tighter line, and high-speed turns should still remain broad and deliberate.

## Goals / Non-Goals

**Goals:**
- Rebalance tracked-vehicle control so stationary turning is slower and more laborious than low-speed forward steering.
- Make low- and medium-speed forward steering tighten the tank's line enough to feel intentional without becoming arcade-like.
- Preserve large-radius steering at higher speeds so tanks remain heavy and believable.
- Keep the solution compatible with per-tank mobility tuning in `src/tanks/*/tank.json`.
- Avoid introducing a different control model for the player and AI beyond what is necessary to keep shared helpers stable.

**Non-Goals:**
- Full simulation of historical differential steering hardware by drivetrain type.
- Adding new input bindings, UI affordances, or HUD indicators.
- Reworking AI tactics beyond any incidental adjustments needed because shared movement helpers change.
- Replacing the existing track-speed movement model with a completely different vehicle physics system.

## Decisions

### Decision: Make steering effectiveness speed-regime aware
The movement model should distinguish among stationary, low-speed, medium-speed, and high-speed steering instead of relying on one inner-track reduction rule. Low-speed forward motion becomes the most effective steering state, stationary steering becomes intentionally weaker, and high-speed steering continues to widen naturally.

Rationale:
- This directly matches the desired handling profile from exploration.
- It preserves realism better than a flat turn-rate boost, which would also make stationary pivoting unrealistically strong.

Alternatives considered:
- Raise `turnRateLimit` globally: rejected because it improves all steering states equally and makes pivot turning even more dominant.
- Lower only `rotationalInertia`: rejected because it changes response timing, not the actual balance between stationary and moving turns.

### Decision: Model forward steering as stronger differential plus small forward-speed sacrifice
When throttle and steering are both active, target track speeds should use a more assertive inner-track reduction than the current model and may reduce overall forward target speed slightly. This should emulate a believable tracked-vehicle steering effort where the tank tightens its line by giving up a little speed rather than preserving nearly full speed and understeering.

Rationale:
- The requested feel is "slight speed loss for visibly smaller turn radius," not zero-cost turning.
- This keeps movement believable without forcing extreme brake-turn behavior.

Alternatives considered:
- Preserve forward speed completely and only increase yaw rate: rejected because it reads as gamey and disconnects steering from mass.
- Use aggressive brake-turn behavior that nearly stops one track in most steering cases: rejected because it would feel too harsh for the requested middle-ground realism.

### Decision: Separate stationary pivot behavior from forward steering behavior
Stationary steering should remain available, but it should use a distinctly weaker target than moving steering and may build rotational speed more slowly. Forward steering should no longer feel like a weaker version of pivot mode; instead, pivoting becomes the backup alignment tool while low-speed movement becomes the preferred way to steer.

Rationale:
- This addresses the main imbalance without removing useful in-place correction.
- It creates a clear hierarchy of steering states that players can learn intuitively.

Alternatives considered:
- Remove stationary pivoting entirely: rejected because it would make tight alignment frustrating.
- Keep the same pivot strength and only buff moving turns: rejected because the imbalance would remain visible.

### Decision: Keep per-tank tuning data lightweight
The implementation should prefer a small set of mobility tuning surfaces that can be shared across tanks and then adjusted per vehicle if needed. Candidate parameters include pivot steering strength, moving inner-track reduction, moving steering speed loss, and speed-based steering falloff.

Rationale:
- Tank definitions already carry mobility data and are the natural place for handling differentiation.
- A small tuning surface is easier to balance than adding many hidden constants.

Alternatives considered:
- Hardcode one steering curve for all tanks: rejected because heavy and medium tanks should not converge to the same feel.
- Add many separate turning constants immediately: rejected because it increases tuning complexity before proving which surfaces matter.

## Risks / Trade-offs

- [Shared movement helpers affect AI behavior] -> Mitigation: verify whether AI tanks should inherit the same steering rebalance or clamp AI-specific inputs if pathing becomes erratic.
- [Overcorrecting moving steering creates arcade handling] -> Mitigation: target a moderate radius reduction with slight speed loss rather than allowing near-pivot turns while moving.
- [Too many new tuning surfaces complicate balance] -> Mitigation: start with a minimal parameter set and reuse existing mobility fields where possible.
- [Per-tank values may diverge without a common baseline] -> Mitigation: define shared handling expectations by speed regime in the spec before tuning individual tanks.

## Migration Plan

1. Update the movement helper logic and any required mobility tuning data together so the new handling profile is coherent on first pass.
2. Validate at least one medium tank and one heavy tank against the new steering expectations.
3. If AI behavior regresses because of shared helpers, tune AI track target generation or AI mobility values without changing the player-facing movement contract.

Rollback is straightforward because the change is isolated to movement-control logic and tank mobility data.

## Open Questions

- Should player and AI use identical steering target generation, or should AI retain a more conservative profile for path stability?
- Which existing mobility fields are sufficient for this change, and which new tuning fields, if any, are worth exposing per tank?
- Should the new handling contract be documented only in the new capability spec, or also summarized in `openspec/product.md` when implementation lands?
