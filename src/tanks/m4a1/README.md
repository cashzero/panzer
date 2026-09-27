# M4A1 Sherman (75) reference

The M4A1 is the Sherman with a one-piece cast upper hull. This model reuses the calibrated M4 (`src/tanks/sherman`) turret, M34A1 gun mount, 75 mm M3 gun, VVSS running gear, lower hull, radial-engine rear plate and fittings unchanged. Only the welded upper hull is replaced by `m4a1-cast-upper-hull`: a smooth-shaded polyhedron lofted through 41 cross-sections, each with the 2.68 m hull width and a rounded roof-to-side edge (radius up to 0.30 m), following a curved glacis that blends into the roof instead of the welded hull's sharp break. The cast driver hoods, hatches and periscopes sit 40 mm higher than on the M4 so they stand proud of the curved glacis.

Combat values, mobility (30.2 t) and nominal armour are those of the M4: 51 mm hull front, 38 mm sides and rear, 76 mm turret front. The armour boxes are the M4's; they approximate the cast contours at game scale.

```bash
node --import tsx --test src/tanks/m4a1/armor.test.ts
```
