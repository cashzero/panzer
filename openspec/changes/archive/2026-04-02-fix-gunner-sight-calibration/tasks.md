## 1. Align Aiming Semantics

- [x] 1.1 Review `src/turretAiming.ts`, `src/aimPoint.ts`, and `src/CameraController.ts` to confirm the selected `calibrationDistance` keeps the gunner sight center as the active ballistic zero.
- [x] 1.2 Update any aiming or camera comments and naming that still describe the center of the gunner view as the bore axis instead of the calibrated sight line.
- [x] 1.3 Verify supporting aim-point visuals in `src/GameScene.tsx` do not contradict the center-dot calibration model.

## 2. Correct Gunner Overlay Behavior

- [x] 2.1 Rework the gunner overlay in `src/UI.tsx` so the center dot is presented as the authoritative calibrated aiming point.
- [x] 2.2 Adjust or simplify auxiliary distance markings so they remain secondary references and do not imply that the highlighted distance tick replaces the center dot.
- [x] 2.3 Keep the selected calibration distance readable in the HUD while preserving the center-dot-first aiming workflow.

## 3. Validate And Document

- [x] 3.1 Validate the resulting behavior in gunner view at short, medium, and long calibration distances across at least two weapon velocities.
- [x] 3.2 Update `openspec/product.md` to describe the finalized calibration behavior as center-dot-calibrated point of impact.
- [x] 3.3 Move the delivered change summary into `openspec/implemented.md` and remove any corresponding unfinished roadmap text if present.
