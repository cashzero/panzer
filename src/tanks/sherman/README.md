# M4 Sherman 75 mm visual reference

This model represents the welded, small-hatch M4 with VVSS and a low-bustle 75 mm turret; it is not an M4A1 cast hull or an M4A2(76).

References downloaded and visually inspected during the rework (permanent
copies, iteration captures and reproducible checks are now in
[`docs/references/sherman`](../../../docs/references/sherman/README.md)):

- [D. P. Dyer four-view drawing via OnWar](https://www.onwar.com/wwii/tanks/usa/us011m4p.html): main side, plan, front and rear silhouette reference. Local copy: `docs/references/sherman/m4-dyer.jpg`.
- [Kohs M4 four-view drawing](https://www.kohs.com/Military_Site/Military_Images/M4_Sherman/M4_Tank_GOD_9_23_11.jpg): secondary proportion check. Local copy: `docs/references/sherman/m4-kohs.jpg`.

The rework corrects the tall welded hull, sloping rear engine deck, rounded differential housing, small driver hoods, low-bustle casting, wide rotor shield and short M3 barrel. The horizontal muzzle ends near the hull nose (world Z 2.95); `muzzleDistance` is measured from the gun pivot, not from the hull origin. Each side has three paired-wheel VVSS bogies, high return rollers and a continuous narrow track.

The roof M2 is retained as an optional-equipment visual detail and is not present in the main drawing. Cast shapes, spring units and collision boxes remain game-scale approximations, not a manufacturing reconstruction. Existing weapon, mobility, traverse, health and armor-thickness values are unchanged; armor box geometry follows the revised surfaces and consequently changes hit coverage.

Three subsequent orthographic calibration passes correct the turret fore/aft
datum, hatch handedness and diameter, upper hull depth and width, deck/ring
height, differential housing, 1.50 m VVSS bogie pitch and 0.830 m paired-wheel
spacing. Circular 508 mm wheels meet the inner track run. The turret roof is
2.75 m above datum, the main deck 1.98 m and gun axis 2.295 m. A shallow rear
stowage rack replaces the solid rear panel. Engine-side armor boxes follow the
sloping deck and inherit the existing side thickness.

Run `node docs/references/sherman/capture.mjs after` with Vite/Playwright available,
then `npx tsx docs/references/sherman/verify.ts`. All 26 measured scan landmarks
pass (mean error 2.30 px; maximum 8.32 px), alongside schema, wheel contact,
hull continuity and muzzle alignment checks. Captures include four orthographic
views, front/rear oblique views and elevation/depression/traverse checks.
