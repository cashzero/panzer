# Open Panzer Front

A WW2 tank battle simulator for the browser, built with React 19, Three.js (via React Three Fiber), Zustand and Vite. Plan a fight on a map of procedurally generated Norman countryside, pick a historical tank and fight it out with range-based penetration, per-plate armour and AI-driven allies and enemies.

## Features

**Combat**
- Historical tanks: M4 Sherman, M4A2 (76), M10 GMC, Tiger I, Panther Ausf. A, Panzer II, III and IV, T-34/76. Each is a folder of JSON with per-plate armour (OBB hitboxes), mobility, traverse and weapon modes (AP, APC, HE, burst).
- Range-based penetration falloff, effective armour from impact angle, ricochets above 70°, post-penetration damage.
- Three aim points: gunner sight (arrow keys), ballistic gun aim point and free-look viewpoint. The zero distance (PageUp / PageDown) drives drop compensation.
- Allied and enemy AI with spotting, gravity-compensated aim, stances, fire control and waypoints.

**Battlefield**
- Land laid out like surveyed countryside: villages along the roads out of each junction, walled farm courts, rectangular fields squared to the roads, and zones of farmland, open grazing and forest that differ with every map number.
- Norman and Picard farm architecture (half-timbered, limestone and brick walls; tile, slate and thatch roofs) with farm courts and kitchen gardens.
- Procedural blade grass after the Ghost of Tsushima technique, ported from SimonDev's Quick_Grass (MIT). Leaf-card tree crowns, hedgerows, understory and orchards.
- Terrain with metre-high swells and sunken lanes. Crops (ploughed, stubble, hay, pasture) and ground effects follow the surface.
- Combat effects at physical scale: tracers, muzzle blasts, lit tumbling debris, craters, rolling fireballs and burning wrecks.
- Historical German camouflage schemes, with procedural Zimmerit on late-war Tiger I and Panzer IV.

**Screens**
- Order of battle: place both forces on a gridded planning map, choose map size and map number, then deploy.
- Vehicle catalogue: a studio preview with armour readouts per plate, and the vehicle's figures on a brass data plate.
- Cameras: third person, gunner sight with zoom, and a top-down tactical map.
- A standalone tank editor with live preview and validation (`tank-editor.html`).

The battlefield holds 60 FPS on a GTX 1050 Ti at 1600x900 on medium and large maps. See `docs/perf/README.md` for the benchmark.

## Run locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev        # http://localhost:3000
```

No API keys or environment variables are needed.

## Commands

```bash
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build to dist/ (main + tank-editor entries)
npm run preview    # Preview the production build
npm run lint       # TypeScript type-check (tsc --noEmit)
npm run clean      # Remove dist/
```

Unit tests use Node's test runner:

```bash
node --import tsx --test src/rendering/terrainSplat.test.ts src/treeIndex.test.ts
```

## Controls

| Input | Action |
|---|---|
| W A S D | Drive (differential tracks) |
| Arrow keys | Traverse the turret and elevate the gun |
| Mouse | Free look; right-click aligns the turret to the view or designates a target |
| Space / left mouse | Fire |
| R | Switch ammunition |
| V / middle mouse | Gunner sight on or off |
| + / − | Zoom the gunner sight |
| PageUp / PageDown | Raise or lower the zero distance |
| M | Tactical map |

On the order-of-battle map, scroll to zoom and right-drag to pan. Click a tank in a roster or on the map, then click the map to move it.

## Project layout

- `src/App.tsx`: screen router (order of battle, tank select, battle)
- `src/screens/`: the order-of-battle and tank select screens
- `src/GameScene.tsx`: R3F canvas and the per-frame game loop
- `src/store.ts`: the single Zustand store with all runtime state
- `src/landLayout.ts`, `src/landUse.ts`, `src/trees.ts`, `src/roads.ts`: world generation
- `src/rendering/`: terrain, grass, foliage, buildings and yards, effects, post-processing
- `src/tanks/<tankid>/`: tank definitions (`tank.json`, `model.json`, `index.ts`)
- `src/tank-editor/`: the standalone tank editor
- `openspec/`: product documentation (`product.md`, `implemented.md`, `roadmap.md`)
- `docs/rendering.md`: rendering notes; `docs/perf/`: benchmark and merge QA
- `CLAUDE.md`: architecture guide for contributors; `src/tanks/CLAUDE.md`: how to add or edit a tank

## Third-party assets

- Terrain textures: CC0, from ambientCG and Poly Haven (`public/assets/terrain/README.md`)
- Fonts: Big Shoulders Stencil and Barlow Semi Condensed, SIL OFL 1.1 (`public/assets/fonts/README.md`)
- Grass shader: adapted from Quick_Grass, MIT (`src/rendering/vendor/quick-grass.LICENSE`)
- Stochastic texture tiling: three-hex-tiling, MIT (`src/rendering/vendor/three-hex-tiling.LICENSE`)
