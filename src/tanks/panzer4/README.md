# Panzer IV Ausf. H visual reference

The September 2026 revision follows the silhouette and layout of the
[George R. Bradford four-view drawing](https://onwar.com/wwii/tanks/germany/ge047pz4hp2.html)
([drawing image](https://onwar.com/wwii/tanks/germany/ge047pz4hp2.jpg)).
It remains a game-scale approximation rather than a dimensionally certified replica.

Recognizable features include eight paired road wheels on four bogies per side,
four return rollers, raised end wheels, five suspended hull Schurzen panels per
side, an open-front turret surround, a rear-center commander cupola, a horizontal
rear muffler, and a long gun with an open two-chamber muzzle brake.

Coordinates are meters, +Z forward and +Y up. Track outlines use local XY
coordinates (-world Z, world Y), extruded along the axle direction. Tread ribs
follow that outline; their geometry is batched into one polyhedron per side to
avoid a separate draw call for every shoe. Each eight-vertex/twelve-face group
in those nodes describes one tread rib.

Mounts, muzzle distance and simplified armor boxes follow the revised geometry.
The seven added turret skirt collision panels use the same 5 mm thickness as the
existing side skirts. Existing armor thickness, health, weapons, mobility and
traverse values are preserved; moving armor surfaces necessarily changes the
geometric hit coverage.
