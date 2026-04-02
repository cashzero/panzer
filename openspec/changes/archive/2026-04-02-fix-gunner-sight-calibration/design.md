## Context

The current aiming code already uses `calibrationDistance` as a ballistic zero when converting sight pitch into gun elevation. In `src/turretAiming.ts`, the selected distance is converted into a ballistic angle offset, and the barrel is elevated relative to the sight line so the shell intersects that sight line at the selected range.

The player-facing presentation does not match that model. The gunner overlay in `src/UI.tsx` documents the screen center as the bore axis and renders range marks as if the player must use a lower tick mark instead of the center dot. This conflicts with the intended behavior that the center dot is the calibrated point of impact. Supporting comments in the overlay reinforce the wrong mental model and make the system feel broken even when parts of the simulation are correct.

This change touches several modules but does not introduce a new subsystem. It clarifies one aiming contract across the aiming math, gunner camera, HUD, and supporting documentation.

## Goals / Non-Goals

**Goals:**
- Make the active gunner-view aiming reference unambiguous: the center dot is the calibrated point of impact for the selected distance.
- Keep `calibrationDistance` behavior consistent across turret aiming, camera alignment, and the reticle presentation.
- Ensure any auxiliary range marks are treated as secondary references and do not contradict the center-dot zero.
- Document the expected behavior clearly enough that regressions can be tested visually and behaviorally.

**Non-Goals:**
- Rework the overall aiming control scheme or free-look behavior beyond what is necessary to preserve the calibration contract.
- Introduce historically modeled multi-stadia sights, per-tank custom optics, or new ballistic simulation.
- Change ammo penetration, projectile drag, or AI gunnery behavior.

## Decisions

### Decision: The center dot is the active zero reference
The gunner reticle will treat the center dot as the authoritative aiming point. At the selected calibration distance, a shot fired without additional holdover SHALL cross the sight line at screen center.

Rationale:
- This matches the current ballistic-zero math in `src/turretAiming.ts`.
- It is easier for players to understand and verify.
- It removes the contradiction between the simulation and the HUD commentary.

Alternatives considered:
- Treat the center as bore axis and require the player to use a highlighted lower range mark. Rejected because it conflicts with the existing gun elevation model and is harder to read.
- Move the camera to a true bore-axis view. Rejected because it adds more coupling between camera placement and barrel animation without solving the player confusion as directly.

### Decision: Reticle markings must support, not replace, the center dot
If the overlay retains distance marks, those marks must be described and positioned as secondary hold references around a center-zeroed sight rather than as the primary calibrated aiming point.

Rationale:
- The selected range should remain readable from the info panel and center-dot behavior alone.
- Secondary marks are only useful if they do not teach a contradictory aiming workflow.

Alternatives considered:
- Remove all marks and leave only the center dot. Viable, but deferred because existing markings may still provide useful reference once their semantics are corrected.

### Decision: Supporting visuals must follow the same sight-line interpretation
Aim visualization and comments in `src/GameScene.tsx`, `src/aimPoint.ts`, and `src/CameraController.ts` must align with the same sight-line-zero model so debugging tools and gameplay cues reinforce the same behavior.

Rationale:
- The current bug is partly conceptual drift between modules, not just a single bad formula.
- Shared terminology reduces future regressions.

## Risks / Trade-offs

- [Visual tuning may still feel off at some ranges] -> Validate the selected distance against visible impact at short, medium, and long ranges with multiple muzzle velocities.
- [Existing ladder graphics may be hard to reinterpret cleanly] -> Prefer simplification over preserving misleading marks if the current layout cannot express center-zero semantics clearly.
- [Players may expect calibration to move the reticle rather than the shot zero] -> Keep the distance readout visible and make the center-dot contract explicit in OpenSpec and HUD behavior.

## Migration Plan

No save-data or external API migration is required. Implement the HUD and aiming presentation changes, then update product documentation to reflect the finalized behavior.

## Open Questions

- Whether the final overlay should keep a distance ladder or simplify to a center-dot-first reticle with minimal auxiliary marks.
- Whether `GunAimPoint` in third-person should visualize the calibrated sight-line intersection, the terrain hit of the current sight ray, or an explicit ballistic impact prediction.
