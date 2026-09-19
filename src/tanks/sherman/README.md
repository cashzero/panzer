# M4 Sherman 75 mm visual reference

This model represents the welded, small-hatch M4 with VVSS and a low-bustle 75 mm turret; it is not an M4A1 cast hull or an M4A2(76).

References downloaded and visually inspected during the rework:

- [D. P. Dyer four-view drawing via OnWar](https://www.onwar.com/wwii/tanks/usa/us011m4p.html): main side, plan, front and rear silhouette reference. Local working copy: `tmp/sherman-m4-dyer-reference.jpg`.
- [Kohs M4 four-view drawing](https://www.kohs.com/Military_Site/Military_Images/M4_Sherman/M4_Tank_GOD_9_23_11.jpg): secondary proportion check. Local working copy: `tmp/sherman-m4-reference.jpg`.

The rework corrects the tall welded hull, sloping rear engine deck, rounded differential housing, small driver hoods, low-bustle casting, wide rotor shield and short M3 barrel. The horizontal muzzle ends near the hull nose (world Z 2.95); `muzzleDistance` is measured from the gun pivot, not from the hull origin. Each side has three paired-wheel VVSS bogies, high return rollers and a continuous narrow track.

The roof M2 is retained as an optional-equipment visual detail and is not present in the main drawing. Cast shapes, spring units and collision boxes remain game-scale approximations, not a manufacturing reconstruction. Existing weapon, mobility, traverse, health and armor-thickness values are unchanged; armor box geometry follows the revised surfaces and consequently changes hit coverage.

Working verification: `tmp/validate-sherman-rework.ts` and `tmp/check-sherman-rework.mjs`; the latter captures perspective, orthographic, elevation/depression and destroyed views. Reference images remain local research artifacts rather than redistributed source assets.
