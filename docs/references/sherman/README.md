# M4 Sherman 75 mm: orthographic calibration

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

This is the welded, small-hatch M4 with VVSS and a low-bustle 75 mm turret.
The separate `sherman_a2_76` model is outside this change.

## Sources

Downloaded and inspected on 2026-09-20:

- [D. P. Dyer (1978), M4 four-view drawing, via OnWar](https://www.onwar.com/wwii/tanks/usa/us011m4p.html):
  [original image](https://www.onwar.com/wwii/tanks/usa/us011m4.jpg), saved as
  `m4-dyer.jpg` (1200 × 1800). Main side/plan/front/rear proportion reference.
- [Kohs M4 drawing](https://www.kohs.com/Military_Site/Military_Images/M4_Sherman/M4_Tank_GOD_9_23_11.jpg),
  saved as `m4-kohs.jpg`; secondary visual cross-check of variant and silhouette.
- [OnWar M4 data](https://www.onwar.com/wwii/tanks/usa/us011m4.html):
  5.89 m hull, 2.62 m width and 421 mm tracks. These are scale checks, not a
  reason to stretch a drawing independently along its horizontal/vertical axes.

Reference images retain their original attribution and are research material,
not textures used by the game. No manufacturing accuracy or redistribution
license is implied.

## Calibration and iterations

The fixture uses the actual `ParametricTankRenderer`. Cameras stay unchanged
between the baseline and all corrected captures: 150 px/m for side/front/rear,
151 px/m for plan. The downloaded scan is overlaid unmodified at 60% opacity.
The scan has line weight and small cross-view inconsistencies. A 12 pixel
(about 80 mm) landmark tolerance is used for game-scale shape verification.

1. `before.png`: original model. Turret and foremost running gear too far
   forward/back respectively; commander hatch handedness wrong; VVSS bogies
   and paired wheels too close together; upper hull overly deep.
2. `iteration-1.png`: moved turret to its ring datum, corrected gun reach,
   bogie/wheel positions, sprocket and track contour, hatch handedness, turret
   bustle and the shallow external stowage rack.
3. `iteration-2.png`: corrected hull width and hatch diameter/position, roof
   fittings and wheel/track ground contact.
4. `after.png`: corrected hull side depth, glacis junction, roof/ring height,
   rear deck slope, differential housing and connected fenders. Gun axis,
   muzzle and turret roof retain their calibrated world positions.

`after-model.png` is the model without the overlay. `front-quarter.png` and
`rear-quarter.png` show oblique orthographic views in the game paint color.
`elevation.png`, `depression.png`, `traverse.png` verify +25°, −12° and 90°
respectively. The roof M2 is retained optional equipment absent from Dyer's
drawing; it is excluded from vehicle-height comparisons.

[`measurements.md`](measurements.md): 26/26 landmarks pass; mean residual
27.45 → 2.30 px, maximum final residual 8.32 px. Measurements are collected
from actual world bounds of 292 rendered nodes, not a separate proxy model.
The checks also cover 508 mm circular wheels, wheel/track contact, hull section
continuity, schema validity and rendered muzzle/spawn alignment. Fine casting,
wheel spokes, sheet-metal and accessory details remain approximations.

Final key dimensions: upper hull width 2.68 m, track outside width 2.621 m,
421 mm tracks, 508 mm wheels, 1.50 m bogie pitch, 0.830 m paired-wheel spacing,
1.98 m main hull deck, 2.00 m turret mount, 2.75 m turret roof, 2.295 m gun axis,
and level muzzle at Z=2.95 m. Dimensions exclude the roof MG and antenna.

Armor OBBs follow the revised surfaces. Twelve short engine-side OBBs inherit
the existing 50 mm side value and follow the sloping deck within about 35 mm.
Weapon, mobility, traverse, health and existing armor-thickness values are
unchanged; geometric hit coverage necessarily changes.

## Reproduce

Start Vite with `npm run dev -- --host 127.0.0.1`, then open
`http://127.0.0.1:3000/docs/references/sherman/compare.html`.
Query options: `?mode=model`, `?mode=perspective`, and optional `&rear`,
`&elevation=25`, `&elevation=-12`, `&traverse=90`.

For automated screenshots, install Playwright into a tools directory and set
`NODE_PATH` to its `node_modules`. The script uses installed Microsoft Edge;
`SHERMAN_QA_BROWSER` overrides the executable and `SHERMAN_QA_URL` the origin.

```powershell
node docs/references/sherman/capture.mjs after
npx tsx docs/references/sherman/verify.ts
npm run lint
npm run build
```

Always capture before verifying so the bounds match the current model. These
fixtures are development-only and are not production Vite entry points.
`calibrate.mjs` documents the migration and requires **original** model/spec
inputs. Baseline: commit `7e9d4b2db8cf479ee9b8b092a67598d8af398a92`,
`src/tanks/sherman/model.json` and `src/tanks/sherman/tank.json`.
