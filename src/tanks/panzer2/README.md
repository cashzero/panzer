# Panzer II visual reference

The model keeps the existing Ausf. F interpretation: flat driver front plate,
dummy visor, and commander cupola. The earlier Ausf. C drawings are used for
the shared five-wheel chassis, four return rollers, offset turret, and rear deck
layout. This is a game-scale approximation, not a dimensionally certified replica.

References inspected for the September 2026 revision:

- [Ausf. C side, top, front and rear drawing](https://warhistory.org/media/2024/12/svdvsd.jpg)
- [Drawing source page](https://warhistory.org/de/%40msw/article/panzer-ii-part-i)

Coordinates use meters, +Z forward, +Y up. The turret is offset toward the
vehicle left; the 20 mm cannon is left of the coaxial machine gun. Track
profiles are extruded in local XY, rotated onto the hull YZ plane. Each side
has five road wheels and four return rollers, with raised sprocket and idler.
Tread ribs follow the same closed profile as the continuous belt.

`tank.json` mount offsets, muzzle distance, and armor plate transforms follow
the revised geometry. Weapon, mobility, health and armor thickness values are
unchanged. Armor boxes remain simplified approximations of the visible surfaces.

## 2026-09 proportion calibration

The Ausf. F model has been calibrated against matching F side/front/rear illustrations and shared C plan geometry. See [reference scope, overlays and measurements](../../../docs/references/panzer2/README.md). Two geometry iterations corrected handedness, turret/cupola proportions, wheel pitch, F idler size, driver-plate position and clearance. Armor geometry and muzzle spawn follow the updated mesh; gameplay values are unchanged.
