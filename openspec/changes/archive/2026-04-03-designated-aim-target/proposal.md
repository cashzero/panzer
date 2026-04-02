## Why

Third-person right-click aiming currently aligns the turret to the camera direction, but not to the actual world point under the screen center. This creates visible parallax against terrain and targets, and makes switching into gunner view feel inconsistent when the player is already looking at an enemy tank.

## What Changes

- Add a designated aim target concept that resolves the screen-center viewpoint ray into a concrete world hit point instead of treating right-click aim as direction-only alignment.
- Make third-person right-click aiming drive the player gun sight toward that resolved world target so the gun aim marker and screen-center designation refer to the same point.
- Make designated aim target resolution consider combat-relevant world geometry, including tanks, buildings, trees, and terrain, with a stable fallback when nothing is hit.
- Make gunner-view entry preserve the same designated target semantics so that switching from third-person to gunner view keeps the sight centered on the target the player was designating, subject to mechanical limits and calibration behavior.
- Update aim-point support visuals and aiming documentation so they reinforce target designation semantics instead of teaching contradictory terrain-only or direction-only behavior.

## Capabilities

### New Capabilities
- `designated-aim-target`: Resolves the viewpoint center into a shared world-space target used by third-person designation, aim-point visuals, and cross-view aiming transitions.

### Modified Capabilities
- `gunner-sight-calibration`: Clarify how gunner-view entry and support visuals relate to the shared designated target while preserving calibration-distance zero semantics.

## Impact

- Affected code: `src/GameScene.tsx`, `src/CameraController.ts`, `src/turretAiming.ts`, `src/aimPoint.ts`, `src/UI.tsx`, and collision/raycast helpers used for tanks, buildings, trees, and terrain.
- Affected systems: third-person aiming, gunner-view transitions, aim-point debug/support visuals, and player-facing aiming semantics.
- No new external dependencies or API surfaces are expected.
