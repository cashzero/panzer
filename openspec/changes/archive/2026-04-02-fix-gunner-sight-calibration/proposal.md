## Why

The current gunner sight distance calibration behavior is unclear and appears wrong because the HUD reticle describes the screen center as the bore axis while the aiming model treats calibration as a ballistic zero relative to the sight line. This mismatch makes the player-visible aiming reference disagree with the simulated shot behavior and makes range calibration difficult to trust.

## What Changes

- Define gunner distance calibration so the center dot is the calibrated point of impact for the selected range.
- Align gunner-view reticle behavior, camera assumptions, and supporting comments with the calibration model already used by turret aiming and projectile firing.
- Add explicit requirements for how calibration distance affects sighting, how the active zero is presented in the HUD, and how non-center markings should behave if they are shown.
- Clarify the player-facing aiming model in OpenSpec so future HUD or camera changes do not reintroduce the bore-axis interpretation.

## Capabilities

### New Capabilities
- `gunner-sight-calibration`: Defines gunner-view calibration behavior, including the active zero, reticle semantics, and expected point-of-impact relationship between the center dot and the selected range.

### Modified Capabilities

## Impact

- Affected code: `src/UI.tsx`, `src/turretAiming.ts`, `src/aimPoint.ts`, `src/CameraController.ts`, and supporting aim visualization in `src/GameScene.tsx`.
- Affected systems: gunner HUD, calibration controls, camera alignment, and aiming documentation.
- Player impact: range calibration becomes predictable because the center dot remains the authoritative aiming reference at the selected distance.
