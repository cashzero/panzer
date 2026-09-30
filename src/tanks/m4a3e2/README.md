# M4A3E2 Sherman "Jumbo" reference

The assault Sherman, built from the M4A2(76)W model in `src/tanks/sherman_a2_76`: the same large-hatch welded hull with its 47° glacis, the T23-style turret casting and the calibrated VVSS running gear. Jumbo-specific changes:

- `glacis-applique-plate`: a 38 mm plate over the upper glacis, keeping clear of the nose and roof edge.
- `left-side-applique-plate` / `right-side-applique-plate`: 38 mm plates over the fighting-compartment sides (world Z −0.905 to 1.75); the engine bay keeps the plain 38 mm side.
- `jumbo-thickened-rotor-shield`: the gun shield is 0.24 m deep instead of 0.16 m, with its bolts, sleeve, collar and ports moved forward to match.
- The 76 mm M1 is replaced by the 75 mm M3 (1.75 m exposed barrel, plain muzzle); weapons data comes from the 75 mm M4.

Armour: glacis 140 mm (102 + 38 appliqué), cast differential 108 mm, fighting-compartment sides 76 mm, engine-bay sides and rear 38 mm, turret walls 152 mm, gun shield 177 mm, roofs 19/25 mm. The glacis, side and mantlet hitboxes move outward to the appliqué and the thicker shield. Mobility uses the 500 hp Ford GAA and 38.1 t, which makes it slower in speed and turret traverse than the other Shermans.

Game-scale approximations, not reconstructions: the turret keeps the T23 casting's shape rather than the Jumbo's thicker, more upright walls, and the rear deck is still the M4A2's diesel deck rather than the M4A3's Ford GAA deck.

```bash
node --import tsx --test src/tanks/m4a3e2/armor.test.ts
```
