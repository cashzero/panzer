# Tiger I / H1 proportion calibration

> Images, PDFs, screenshots and `*-bounds.json` are local calibration artifacts excluded from Git. A fresh clone must download or regenerate them before opening images or running bounds-based verification. See the [shared workflow](../../tank-proportion-calibration.md).

Downloaded 2026-09-20:

- [Drawing Database: Tiger I](https://drawingdatabase.com/tiger-i/),
  [original PNG](https://drawingdatabase.com/wp-content/uploads/2015/02/sdkfz181-pzkpfwvi-ausfh1-tiger.png):
  `tiger-i-h1-four-view.png`, 1344 × 1848 pixels. Side, top, front and rear views.
- [David Byrden: turret dimensions](https://tiger1.info/EN/Turret-dimensions.html),
  [original GIF](https://tiger1.info/pictures/TurretProfileDimensions.gif):
  `turret-dimensions.gif` and a lossless PNG conversion. The page distinguishes
  original German dimensions from survey measurements. Copyright David Byrden;
  the images remain attributed reference material, not game textures.

## Method and limits

Render the actual `ParametricTankRenderer` with orthographic cameras, neutral
turret traverse and gun elevation. Overlay the unchanged downloaded drawing at
60% opacity. The same fixed cameras and image coordinates are used in every pass.
Side calibration is 143 pixels/m (800 mm wheel diameter); top/front/rear use
149 pixels/m (3.56 m outside track span). Each view has a uniform scale; the
model is never stretched per view. The scan views differ slightly in alignment
and scale, so zero-pixel agreement across every detail is not a defensible target.

The engineering diagram cross-checks the 815 mm turret profile envelope and
265 mm cupola drum. The model's 805 mm shell sits on a 10 mm raised ring.
This is a calibrated game model, not a manufacturing drawing. Small fittings,
rounded surfaces, track shoes and armor OBBs remain approximations. The scan's
sloping fender line and individual production details are not exact reconstructions.

## Iteration record

1. `before.png`: original model. Upper front projects too far forward, turret
   and gun axis too high, wheel pitch too long, cupola and driver/MG handedness
   reversed. Original hull deck 1.92 m, turret roof 2.795 m, gun axis 2.39 m,
   road-wheel pitch 0.58 m, cupola handle about 3.189 m.
2. `iteration-1.png`: corrected major dimensions, offsets and handedness.
3. `iteration-2.png`: refined turret plan, mudguard reach, antenna location,
   rear jack orientation and associated turret armor bounds.
4. `after.png`: final pass, including muzzle-brake height, stowage-bin reach
   and correctly oriented Feifel hoses. `after-model.png` shows the model alone.

[`measurements.md`](measurements.md) records 18 independent image landmarks.
All pass the declared 12 pixel tolerance; largest residual is 7.89 px (about
55 mm at the side-view scale). The verification also checks the editor schema,
800 mm wheel diameter, 265 mm cupola drum and rendered muzzle/spawn agreement.
`after-bounds.json` contains actual world bounds of 309 named rendered nodes.
Weapons, armor thicknesses, health and mobility tuning are unchanged; surface
and armor-box positions necessarily alter hit coverage.

## Reproduce

```powershell
npm run dev -- --host 127.0.0.1
# Open http://127.0.0.1:3000/docs/references/tiger/compare.html
# Append ?mode=model for the model without the reference overlay.
```

For automated capture, install Playwright into a separate tools directory and
set `NODE_PATH` to its `node_modules`. The capture script defaults to installed
Microsoft Edge; `TIGER_QA_BROWSER` can specify another Chromium executable.
`TIGER_QA_URL` optionally changes the Vite origin.

```powershell
node docs/references/tiger/capture.mjs after
npx tsx docs/references/tiger/verify.ts
npm run lint
npm run build
```

Run capture immediately before verification so the measured bounds reflect the
current model. The comparison fixture is development-only and not a production
entry point. `calibrate.mjs` records the migration from the **original** model
and tank JSON; do not run it on the already calibrated files. The baseline
commit is recorded below for reproducing that migration.

Baseline: `7e9d4b2db8cf479ee9b8b092a67598d8af398a92`, files
`src/tanks/tiger/model.json` and `src/tanks/tiger/tank.json`.
