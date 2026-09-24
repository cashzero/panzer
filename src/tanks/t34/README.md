# T-34/76 model 1943 visual reference

The model is calibrated against the [George R. Bradford four-view drawing](https://onwar.com/wwii/tanks/ussr/su045t3476m43p.html) following the [shared orthographic workflow](../../../docs/tank-proportion-calibration.md). Sources, registration, the pass-by-pass changes and the verification results are in [`docs/references/t34/README.md`](../../../docs/references/t34/README.md). It is a game-scale interpretation, not a factory-exact reconstruction.

The upper glacis is 60 degrees from vertical and runs down to the nose; the hull sides slope at about 41 degrees above the fender line. Five large paired road wheels per side carry the upper track run, without return rollers; the front idler and rear drive sprocket sit higher. The track outline and tread links are generated from the wheel, idler and sprocket circles.

The hexagonal 1943 turret is a single cast polyhedron whose rear is rounded by intermediate rings. The commander's cupola is on the left, the loader's hatch on the right; the rounded F-34 mantlet carries a plain muzzle without a brake. The driver's hatch is on the left of the glacis and the bow MG on the right. The single headlight is at the left front, the radio antenna on the hull's right front. Rear-facing twin exhausts sit under covers on the sloped rear plate. There are three longitudinal external fuel drums, two on the right and one on the left. All coordinates are metres, +Z forward and +Y up.

Mount positions, muzzle distance and armour boxes follow the rendered surfaces; each plate's thickness is taken from the plate it replaces. Weapon, durability, mobility, traverse and armour-thickness values are unchanged.

`armor.test.ts` fires rays through the production collision routine and compares hit distances with surfaces rebuilt from `model.json`:

```powershell
node --import tsx --test --test-isolation=none src/tanks/t34/armor.test.ts
```
