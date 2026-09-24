# M4A2(76)W / VVSS reference

The model is calibrated against the [D. P. Dyer four-view M4A2(76)W drawing](https://www.onwar.com/wwii/tanks/usa/us018m4a276wp.html) following the [shared orthographic workflow](../../../docs/tank-proportion-calibration.md). Sources, registration, the pass-by-pass changes and the verification results are in [`docs/references/sherman_a2_76/README.md`](../../../docs/references/sherman_a2_76/README.md). This is the large-hatch, welded-hull, diesel M4A2 with the T23 turret and narrow VVSS tracks, not a 75 mm Sherman or an HVSS Easy Eight.

Distinctive geometry:

- A 2.72 m upper hull with a 46° upper glacis meeting a level roof, flush large oval crew hatches, a folded Y-shaped travel lock and forward-reaching headlight brush guards; no cast driver hoods.
- A single rounded T23 casting whose roof slopes down at the front and whose bustle underside rises behind the turret ring, with a stowage box on the rear. Commander's cupola, gunner's periscope guard and antenna mount are on the right, the loader's hatch and pistol port on the left.
- A 76 mm M1 barrel tapering to an oversized thread protector, in the wide M62 rotor shield with the coaxial MG on the right.
- A sloping diesel deck with twin grilles, finned air cleaners on the rear plate and a louvred exhaust deflector; no radial-engine doors.
- The VVSS bogies, sprocket, idler and track are the running gear calibrated on the M4 (`src/tanks/sherman`), unchanged.

The roof .50 cal is kept as simplified optional equipment; the drawing shows only its pintle. Shapes and collision coverage are game-scale approximations. Combat values, armour thickness, mobility and traverse limits are unchanged from before the calibration; mounts, muzzle distance and the armour boxes follow the revised model.

`armor.test.ts` fires rays through the production collision routine and compares hit distances with surfaces rebuilt from `model.json`:

```powershell
node --import tsx --test --test-isolation=none src/tanks/sherman_a2_76/armor.test.ts
```
