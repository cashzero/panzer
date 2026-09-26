# Adding a New Tank

Tank definitions now live in folder-based modules under `src/tanks/<tankid>/`.
Use `src/tanks/panzer4/` or `src/tanks/tiger/` as the reference template.

## Folder layout

Create a new folder:

```text
src/tanks/<tankid>/
  index.ts
  tank.json
  model.json
```

- `tank.json` stores gameplay, metadata, mounts, mobility, weapons, and armor plate data.
- `model.json` stores the parametric render tree for hull, tracks, turret, and gun.
- `index.ts` loads both JSON files, builds the renderer, and exports the tank module.

## Step-by-step

### 1. Create the tank folder

Create `src/tanks/<tankid>/` and copy one existing parametric tank folder as a base.

### 2. Add `index.ts`

Use the standard wrapper:

```ts
import { createParametricRenderer } from '../core/ParametricTankRenderer';
import { createTankDefinition } from '../core/resolver';
import type { TankModelSpec, TankModule, TankSpec } from '../core/types';
import modelJson from './model.json';
import tankJson from './tank.json';

const tank = tankJson as TankSpec;
const model = modelJson as TankModelSpec;

export const definition = createTankDefinition(tank, createParametricRenderer(model));

export const tankModule: TankModule = {
  definition,
  spec: tank,
  model,
  source: 'parametric',
};
```

No manual registration step is needed. `src/tanks/core/registry.ts` auto-discovers `../*/index.ts` files.

### 3. Fill out `tank.json`

`tank.json` must match `TankSpec` from `src/tanks/core/types.ts`.

Top-level structure:

```json
{
  "schemaVersion": 1,
  "id": "<tankid>",
  "renderMode": "parametric",
  "catalog": { "sortOrder": 99 },
  "meta": {
    "displayName": "Display Name",
    "description": "Shown on the tank select screen.",
    "nationality": "Country",
    "year": 1944
  },
  "appearance": {
    "baseColor": "#7a7754"
  },
  "durability": {
    "health": 250,
    "trackHealth": 90,
    "armorSummary": {
      "front": 80,
      "side": 30,
      "rear": 20,
      "turret": 50
    }
  },
  "mounts": {
    "turretOffset": [0, 1.4, 0.2],
    "gunPivotOffset": [0, 0.4, 1.4],
    "muzzleDistance": 3.5,
    "broadPhaseRadius": 5.2
  },
  "mobility": {
    "horsepower": 300,
    "weight": 25,
    "maxSpeed": 10.5,
    "maxReverseSpeed": 4,
    "acceleration": 3.5,
    "deceleration": 9,
    "trackWidth": 2.36,
    "turnRateLimit": 0.48,
    "rotationalInertia": 2.5
  },
  "traverse": {
    "turretSpeed": 0.26,
    "gunSpeed": 0.12,
    "maxElevationDeg": 20,
    "maxDepressionDeg": 10
  },
  "weapons": {
    "caliber": 75,
    "reloadTime": 5000,
    "burst": { "count": 5, "interval": 100 },
    "ammo": {
      "AP": { "penetration": 99, "velocity": 740, "damage": 350, "drop": 0.1, "dispersion": 0.0018 },
      "APC": { "penetration": 126, "velocity": 930, "damage": 250, "drop": 0.08, "dispersion": 0.0015 },
      "HE": { "penetration": 25, "velocity": 550, "damage": 500, "drop": 0.3, "dispersion": 0.0025 }
    }
  },
  "armorModel": {
    "plates": []
  }
}
```

Notes:
- `schemaVersion` is currently `1`.
- `id` must be unique and match the folder name.
- `renderMode` should be `"parametric"` for the new structure.
- `catalog.sortOrder` controls selection-screen ordering.
- `appearance.camouflage` (optional) lists scheme ids from `src/tanks/core/camouflage.ts`; the first is the default and should match `baseColor`. Offer only schemes the vehicle wore in service. Without it the tank wears `baseColor` alone.
- `appearance.zimmerit` (optional, `ribbed` or `waffle`) gives the tank Zimmerit paste under its 1943-45 schemes (those marked `zimmeritEra`). Only large painted parts of hull and turret are coated; parts whose id names a fitting (skirts, tools, hinges, lamps, exhausts and so on, see `ZIMMERIT_BARE_PART` in `MergedSlot.tsx`) and the gun stay bare.
- `mobility.acceleration` is stored directly now; it is not derived automatically in the JSON pipeline.
- `traverse.maxElevationDeg` and `traverse.maxDepressionDeg` define the historical gun arc in degrees.
- `traverse.limitDeg` (optional) is the gun's traverse each side of the hull centreline in degrees, for turretless vehicles; leave it out for a full turret. Put the casemate in the hull, only the gun's traversing cradle in the `turret` slot (with `mounts.turretOffset` at its pivot) and the mantlet and barrel in the `gun` slot; see `src/tanks/stug3g/`.
- `traverse.turretSpeed` is the full traverse rate in rad/s, `2π / (seconds for 360°)`. Take the time from the vehicle's manual or a reputable reference, not a game wiki. Hand-traversed turrets (Panzer II, Panzer III, M10) use a sustained cranking time; the engine-driven traverses of the Tiger I and Panther use a mid-rpm figure.
- `weapons.ammo.AP` is required. `APC` and `HE` are optional.
- `weapons.burst` is optional and used for burst-fire tanks such as autocannons.

### 4. Define armor plates in `tank.json`

Each entry in `armorModel.plates` must include an `id` plus the armor plate fields used by the combat system:

```json
{
  "id": "hull-front-plate",
  "name": "Hull Front Plate",
  "zone": "hull",
  "halfExtents": [1.42, 0.25, 0.075],
  "position": [0, 1.18, 2.55],
  "rotation": [-0.17, 0, 0],
  "armorThickness": 80,
  "parent": "hull"
}
```

Field meanings:
- `id`: stable unique key for the plate.
- `name`: display name for tooltips/debugging.
- `zone`: one of `hull`, `turret`, `track`, or `gun`.
- `halfExtents`: half-size of the OBB hitbox in meters.
- `position`: center relative to the owning parent.
- `rotation`: Euler XYZ radians.
- `armorThickness`: thickness in mm.
- `parent`: one of `hull`, `turret`, or `gunGroup`.
- `isTrack`: required only for track plates, using `left` or `right`.

Recommended minimum coverage:
- Hull front, upper glacis, lower glacis, both sides, rear, roof, engine deck.
- Turret front, both sides, rear/bustle, roof, mantlet.
- Left and right track plates.

Keep hitboxes close to the rendered geometry. These plates drive penetration, ricochet, and selection-screen armor inspection.

Collision details that affect plate layout:
- The smallest half-extent is the thickness axis, and only hits on that pair of faces count. Face detection tests local X, then Y, then Z within 10 mm, so hits within 10 mm of the edges of any axis tested before the thickness axis are rejected. Putting the thickness on X (`[thickness/2, width/2, height/2]`) avoids that dead band; segmented plates still need a small overlap at seams.
- Plate `name` values must be unique: the tank select screen uses them as React keys for its armor inspection meshes.
- `src/tanks/m10/armor.test.ts` shows how to compare armor hit distances with surfaces rebuilt from `model.json`, which catches boxes floating outside the model or leaving gaps.

### 5. Build `model.json`

`model.json` must match `TankModelSpec`:

```json
{
  "schemaVersion": 1,
  "slots": {
    "hull": [],
    "tracksLeft": [],
    "tracksRight": [],
    "turret": [],
    "gun": []
  }
}
```

Each slot contains model nodes. Supported node types are:
- `group`
- `box`
- `cylinder`
- `sphere` (supports ellipsoid shapes through `scale`; useful for cast turrets and housings)
- `polyhedron` (triangle faces over explicit vertices; useful for welded/sloped armor hulls)
- `extrude`
- `repeat`
- `mirror`
- `helper`

Any node may carry `shade` (0.3-1.5, default 1): a paint brightness multiplier for the painted roles (`hullPrimary`, `mantlet`, `barrel`). Use it where parts facing the same way would otherwise merge into one flat colour, e.g. a nose in the shadow of an overhang, a cast mantlet or a bolted-on visor housing (see `src/tanks/stug3g/`). It is baked into the merged battlefield batches too.

Useful material roles:
- `hullPrimary`
- `darkMetal`
- `grille`
- `track`
- `trackRubber`
- `steel`
- `lamp`
- `mantlet`
- `barrel`
- `wireframe`
- `accessory`

Important conventions:
- +Z is the front of the tank.
- +Y is up.
- Use real-world scale in meters.
- Keep turret and gun geometry centered on their own local origins; placement comes from `mounts` in `tank.json`.
- The renderer automatically applies `castShadow` and `receiveShadow`.
- Destroyed-state coloring is handled by `ParametricTankRenderer`; use material roles instead of hardcoded mesh materials.
- The battlefield merges each slot into one mesh per material class and drops parts under 0.12 m radius at long range. Node names and per-part meshes exist only in the tank select screen, editor and calibration pages; do not rely on them for gameplay. Check a new or edited tank in `docs/perf/merge-qa.html?tank=<tankid>`.

### 6. Prefer helpers when they match the shape

Current helper ids are defined in `src/tanks/core/types.ts`, but only some are implemented in `src/tanks/core/helpers.tsx`.

Implemented helpers:
- `hull.side_profile_extrude`
- `tracks.stadium_belt`
- `detail.wire_rack_box`

Declared but not yet implemented helpers will warn and render nothing, so do not rely on them unless you add helper support first.

### 7. Verify the module loads

The tank should appear automatically once the folder exports a valid `tankModule` or `definition`.

Run:

```bash
npm run lint
```

## Checklist

- [ ] Folder created: `src/tanks/<tankid>/`
- [ ] `index.ts` exports `definition` and `tankModule`
- [ ] `tank.json` matches `TankSpec`
- [ ] `model.json` matches `TankModelSpec`
- [ ] Armor plates include stable `id` values and cover major surfaces
- [ ] Mount offsets and muzzle distance line up with the rendered model
- [ ] Material roles are used instead of custom per-mesh material logic
- [ ] `npm run lint` passes

## Legacy note

`src/tanks/core/registry.ts` still supports legacy top-level `src/tanks/*.tsx` tank files, but new work should use the folder-based parametric format.
