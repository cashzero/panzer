# M4 Sherman 75 mm visual reference

## Armor specification

Armor uses the nominal thicknesses in the [OnWar M4 specification](https://www.onwar.com/wwii/tanks/usa/us011m4.html), matching the small-hatch welded hull and 75 mm turret: hull front 51 mm, hull sides/rear 38 mm, upper hull roof/engine deck 19 mm, turret front/cheeks 76 mm, turret sides/rear 51 mm, turret roof 25 mm, and mantlet 89 mm. The curved differential housing and turret castings use uniform plate approximations. The catalog summary reports nominal hull front/side/rear and turret-front thickness, not line-of-sight protection; combat physics applies impact angle separately.

These values replace the previous inflated armor (120 mm glacis, 140 mm cheeks, 220 mm mantlet). The visual calibration described below originally retained those old values; this subsequent armor correction represents the standard M4, not the M4A3E2 Jumbo.

The M34A1 rotor shield now uses an 89 mm curved shell instead of a solid 370 mm-deep extrusion, with a separate rear rotor and surface-mounted coaxial/sight port details. Its 1.09 m width, gun pivot and muzzle position are retained. The rounded side profile follows the [TM 9-1307 M34/M34A1 photograph](https://afvdatabase.com/usa/pics/m4sherman/75mmgunmounts113-4.jpg) and the Dyer drawing; it is a game-scale approximation. Six overlapping 89 mm armor collision strips follow the arc and rotate with gun elevation, replacing the solid bounding box. Their small overlap accommodates the collision routine's 10 mm face-normal tolerance so seams do not reject frontal hits. Historical calibration results below predate this shell correction.

Run `node --import tsx --test --test-isolation=none src/tanks/sherman/armor.test.ts` for schema, shell thickness and 459 frontal collision checks across the mantlet and gun elevation range.

The fixed turret-ring seat fills the modeling gap between the simplified sloped hull roof and the horizontal rotating race. It belongs to the hull slot, has a 0.95 m outer radius, and spans Y=1.775–1.985 m, overlapping the race bottom at Y=1.98 m. Its lower edge stays embedded in the hull roof around the complete circumference. The rear bustle beyond the ring retains its clearance. This is a visual mounting correction, not additional armor thickness. Side/rear/90° traverse checks are captured as `turret-ring-side.png`, `turret-ring-rear.png`, and `turret-ring-traverse.png` by the same capture script.

Visual review on 2026-09-21 uses the production renderer at fixed cameras. It caught the old spherical gun mount protruding through the shell and a gap between shell and rotor; the final model replaces the sphere with a chamfered fixed shield and joins the rotor to the shell's inner radius. Captures: [front](../../../docs/references/sherman/mantlet-front.png), [side](../../../docs/references/sherman/mantlet-side.png), [quarter](../../../docs/references/sherman/mantlet-quarter.png), [+25° elevation](../../../docs/references/sherman/mantlet-elevation.png), [−12° depression](../../../docs/references/sherman/mantlet-depression.png), [full tank](../../../docs/references/sherman/mantlet-full-tank.png), and [Dyer overlay](../../../docs/references/sherman/mantlet-overlay.png). These local images are ignored by Git; regenerate with Vite running and `NODE_PATH=/path/to/playwright/node_modules node docs/references/sherman/capture-mantlet.mjs`. This is visual validation of a simplified game model, not manufacturing-level dimensional verification.

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
stowage rack originally replaced the solid rear panel; that unsupported rack
has since been removed. Engine-side armor boxes follow the
sloping deck and inherit the existing side thickness.

Run `node docs/references/sherman/capture.mjs after` with Vite/Playwright available,
then `npx tsx docs/references/sherman/verify.ts`. All 26 measured scan landmarks
pass (mean error 2.30 px; maximum 8.32 px), alongside schema, wheel contact,
hull continuity and muzzle alignment checks. Captures include four orthographic
views, front/rear oblique views and elevation/depression/traverse checks.
