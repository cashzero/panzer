## Context

The current player aiming flow mixes two different concepts: a camera-centered viewpoint ray in third-person view and a gun-sight ray that starts at the tank's gun pivot. Holding right click currently aligns the turret to camera direction, but it does not preserve the concrete world point under the screen center. The visible result is parallax against terrain and enemy tanks, and the semantic result is that entering gunner view can shift the apparent target even when the player was already looking directly at it.

The code is already split across the right modules for this change: `GameScene.tsx` computes player-frame aiming state, `CameraController.ts` owns active camera placement, `turretAiming.ts` solves turret and sight motion, `aimPoint.ts` reconstructs the world-space sight line, and the collision helpers already support per-system ray tests for terrain, buildings, trees, and tank armor plates. The missing architectural concept is a shared designated target point derived from the active view rather than from terrain-only debug visuals or direction-only camera alignment.

## Goals / Non-Goals

**Goals:**
- Define a single designated aim target concept that represents the first meaningful world hit under the screen center.
- Make third-person right-click aiming drive the player sight toward that world target instead of only matching camera direction.
- Preserve designated target continuity when switching from third-person into gunner view.
- Ensure support visuals and aiming behavior agree when the player points at tanks, buildings, trees, terrain, or empty space.
- Preserve existing calibration-distance behavior so zeroing still affects bore elevation rather than redefining the sight center.

**Non-Goals:**
- Changing projectile ballistics, penetration rules, or armor resolution.
- Introducing target lock, aim assist, or automatic lead computation.
- Reworking the overall camera layout, HUD art direction, or control bindings.
- Eliminating all apparent mismatch when the target is mechanically unreachable; turret and gun limits still apply.

## Decisions

### Decision: Add a shared designated target point to the player aiming pipeline

The system will resolve the screen-center ray into a world-space designated target point before turret aiming and support visuals are computed. This target becomes the common reference for third-person designation, gun aim visualization, and view transitions.

Rationale:
- It matches player intent better than direction-only alignment.
- It creates one shared truth that multiple systems can reference.
- It removes the terrain-only assumption currently baked into the aim-point visual.

Alternatives considered:
- Keep direction-only alignment and only move the marker: rejected because it fixes the symptom but not the aiming semantics.
- Use only terrain hit points: rejected because it fails when the player is looking directly at tanks or other occluders.

### Decision: Resolve designated targets against combat-relevant geometry in nearest-hit order

World-target resolution will evaluate tanks, buildings, trees, and terrain, then choose the closest valid hit. If nothing is hit, the system will fall back to a far point along the center ray so aiming remains stable in open sky or long-range views.

Rationale:
- Nearest-hit behavior matches what the player sees at screen center.
- Reusing existing tank/building/tree/terrain ray helpers minimizes duplicated geometry logic.
- A deterministic fallback avoids erratic jumps when the center ray leaves the world.

Alternatives considered:
- Priority by object class rather than distance: rejected because it can select an object behind the visible obstruction.
- Terrain-only fallback with no sky point: rejected because it makes designation unstable when the ray does not intersect the ground soon enough.

### Decision: Keep calibration and designated target as separate concepts

The designated target point will define what the player is trying to look at. Calibration distance will continue to define how the gun bore is zeroed relative to the sight line. Entering gunner view should preserve the designated target at the sight center when mechanically reachable, but this does not redefine projectile zero semantics.

Rationale:
- Existing OpenSpec already defines center-dot zero behavior.
- This preserves the distinction between sight line and bore axis instead of collapsing the two.
- It avoids unintended regressions in ballistic tuning and ranging.

Alternatives considered:
- Make designated target equal to impact point regardless of calibration: rejected because it would silently change the game's aiming model.

### Decision: Treat gunner-view entry as a continuity operation, not a retargeting event

When the player switches from third-person into gunner view, the system should keep pursuing the same designated target rather than recomputing a different semantic target from a different camera origin. If the target is outside turret or elevation limits, the sight should move to the closest reachable solution without inventing a new target.

Rationale:
- This directly addresses the current user-visible jump when already looking at a tank.
- It makes camera switching feel like a mode change, not a target change.

Alternatives considered:
- Recompute target independently in gunner view: rejected because it reintroduces view-dependent aim drift.

## Risks / Trade-offs

- [Cross-module coupling] -> The designated target touches camera, aiming, visualization, and raycast helpers. Mitigation: define one narrow target-resolution step and feed its result forward instead of letting each subsystem compute its own target.
- [Raycast cost] -> Testing tanks, buildings, trees, and terrain every frame may add overhead. Mitigation: reuse existing broad-phase checks and nearest-hit helpers, and keep the target-resolution code in the player-only path.
- [Mechanical-limit mismatch] -> The target may remain unreachable because of traverse or elevation limits. Mitigation: specify that the system preserves target intent while allowing the turret/gun to stop at the closest reachable state.
- [Visual ambiguity during transition] -> Marker and sight motion may temporarily lag while the turret traverses toward a new target. Mitigation: keep the designated target stable and ensure support visuals communicate the intended target rather than the previous terrain-only interpretation.

## Migration Plan

This change is local to the client runtime and requires no data migration or save conversion. Implementation should land behind the existing aiming controls with no input changes. If rollout reveals regressions, the code can be reverted at the module level because no persistent data shape or external interface changes are required.

## Open Questions

- Whether the designated target visual should display the resolved target immediately or only the currently reachable sight point while the turret is still traversing.
- Whether the target resolver should include non-combat decorative geometry in the future, or stay limited to combat-relevant occluders.
