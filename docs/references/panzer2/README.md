# Panzer II Ausf. F proportion calibration

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

Calibrated the existing F interpretation, not a conversion to Ausf. C. Baseline commit: `baf3f68e2853e2addab1e4c53e16577e743dbcc3`.

## References and limits

- [Academy Panzer II Ausf. F instructions](https://d37tikmwcb2tc.cloudfront.net/plastic_models/file_attachment/1343367-69-instructions.pdf), downloaded as `academy-ausf-f.pdf`. Page 21 supplies matching F side/front/rear illustrations; `ausf-f-reference.png` is a 144 dpi rendering. These are model painting illustrations, not factory drawings.
- [Panzer II Ausf. C orthographic drawing](https://warhistory.org/media/2024/12/svdvsd.jpg), downloaded as `panzer-ii-c-reference.jpg`, from [War History](https://warhistory.org/de/%40msw/article/panzer-ii-part-i). Its printed ruler gives approximately 112 px/m. The plan is used only for the shared turret footprint, lateral offset and general layout. C hatches, front hull profile, rear idler and roof height are excluded from F fitting.
- [OnWar F dimensions](https://www.onwar.com/wwii/tanks/germany/ge032pz2f.html): overall height 2.15 m, width 2.28 m and ground clearance 0.34 m provide broad dimensional checks. Accessory extent and the painting illustrations do not agree exactly enough to imply manufacturing accuracy.

`comparison-reference.png` places the F side, C plan, and F front/rear into separate panels, using uniform two-times display scaling within each source. No anisotropic image stretching was used. F cameras use 183 display pixels/m, C plan 224 pixels/m. Cameras are identical for before, iteration 1, iteration 2 and after captures. The F image has accessory and stowage differences; the rear turret storage box, spare wheel and field stowage are not silhouette targets for this existing unstowed model.

## Iterations

1. Corrected vehicle-left turret offset and cannon/coax arrangement, and mirrored asymmetric hull fittings. Reduced turret roof height, widened its base to 1.54 m and increased side slope. Replaced the tall, narrow cupola proportions with a lower, wider assembly at the measured longitudinal/lateral location.
2. Reduced road-wheel pitch from 0.64 to 0.62 m while preserving circular wheels. Increased F rear-idler diameter to 0.69 m and lowered its center to 0.59 m. Advanced the driver plate 0.17 m, raised the hull underside to 0.34 m, shortened the exposed barrel 0.10 m and aligned projectile spawn with the bore. Removed below-ground track outline/shoes and corrected rear vision-cover placement.
3. Verification pass: fitted all eight sloped turret armor facets to their four geometry vertices, added the two missing rear corner plates, and split front/engine side coverage into short sections following the hull silhouette. Existing thickness values and all weapon, mobility, health and traverse settings are preserved.

Final roof height: 1.98 m; cupola handle height: 2.15 m, excluding antenna. Turret origin `[0.17, 1.46, 0.27]`; gun pivot `[0.16, 0.25, 0.67]`; muzzle distance 1.046 m. Track-center spacing remains 1.94 m.

## Evidence

- `before.png`, `iteration-1.png`, `iteration-2.png`, `after.png`: production-renderer orthographic overlays.
- `after-model.png`: identical cameras without the reference layer.
- `front-quarter.png`, `rear-quarter.png`, `elevation.png`, `depression.png`, `traverse.png`: oblique inspection at neutral, +20°, -9° and 90° traverse.
- `measurements.md`: 23 independently read illustration landmarks. Mean error 19.70 -> 2.28 display px; maximum final error 9.52 px. Acceptance is 12 display px, equivalent to 6 native reference pixels. This is an illustration-fit tolerance, not a claim of exact historical reconstruction.
- `*-bounds.json`: measured world bounds from actual production meshes.

## Reproduction

Start Vite with `npm run dev`. `compare.html` imports the production parametric renderer and current JSON. Install Playwright externally or make it available through `NODE_PATH`, then run `node docs/references/panzer2/capture.mjs after`. The default browser is Edge; `PANZER2_QA_BROWSER` and `PANZER2_QA_URL` override the executable and server.

Run `npx tsx docs/references/panzer2/verify.ts` for schema validation, landmark tolerance, circularity, track contact, muzzle alignment, exact turret-facet OBB coverage, and unchanged gameplay/thickness checks against the baseline commit. `npm run lint` and `npm run build` also pass; build retains the existing large-chunk warning.

`calibrate.mjs` is a one-time reproducible migration. Supply original model and tank JSON extracted from the baseline, an output directory, and optional pass `1` or `2`. Never feed it already calibrated JSON. The HTML/TSX/capture scripts are development fixtures and are not production build entries.

Reference illustrations retain their original ownership and are kept here for this model-comparison task.
