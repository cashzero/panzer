# Tiger I early-production visual reference

The model follows the early Tiger I / Ausf. H1 layout shown in the
[Drawing Database four-view reference](https://drawingdatabase.com/tiger-i/)
([drawing image](https://drawingdatabase.com/wp-content/uploads/2015/02/sdkfz181-pzkpfwvi-ausfh1-tiger.png)).
It is a game-scale approximation rather than a production-exact reconstruction.

The downloaded drawings and reproducible orthographic comparison are in
[`docs/references/tiger`](../../../docs/references/tiger/README.md). Three
comparison/correction passes calibrated the upper hull, turret height and plan,
wheel spacing, cupola, gun axis, muzzle, mudguards and rear fittings. The final
18 scan landmarks are within 7.90 pixels of the reference at 143–149 pixels/m;
see the measurement report for the individual residuals and source limitations.

Key calibrated dimensions: 3.56 m across the track belts, 0.72 m belt width,
0.80 m road-wheel diameter, 0.535 m axle pitch, 1.82 m hull deck, 2.645 m turret
roof, 2.215 m gun axis and approximately 3.01 m to the cupola hatch handle.
The turret shell plan is 2.29 m wide by 2.319 m long. The turret is centered at
Z=0 and the muzzle exit is at Z=5.27 m with the gun forward and level.

Key features are a vertical-sided upper hull, D-shaped rolled turret, wide curved
mantlet, left-rear drum cupola, rectangular loader hatch, solid rear stowage bin,
twin vertical exhausts, Feifel filters and intake hoses, and an open two-chamber
muzzle brake. The earlier mixed-period flat turret overlays and twin turret
antennas are replaced with this consistent early-production appearance.

Each side has eight wheel axles, with three thin rubber-rimmed discs per axle.
Alternating lateral lanes model the overlapping/interleaved wheel arrangement.
The 720 mm track belt follows raised sprocket/idler ends and a sagging upper run;
96 tread ribs are batched into one polyhedron per side. Each eight-vertex and
twelve-face group describes one rib. Coordinates are meters, +Z forward, +Y up.

Mounts, muzzle distance and armor boxes follow the revised surfaces. New lower
hull and curved turret panels inherit the existing corresponding 80 mm game
armor value; they are not a historical armor rebalance. Existing weapon, health,
mobility, traverse and armor-thickness values are preserved. Changing the surface
geometry necessarily changes hit coverage; the hitboxes remain approximations.
