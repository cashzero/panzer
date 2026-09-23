# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Panzer Front is a **WW2 tank battle simulator** built with React 19, Three.js (via React Three Fiber), Zustand, and Vite. All visual design — UI, HUD, color palette, typography, effects — should follow a WW2 aesthetic (military olive drab, aged metal, period-appropriate instruments, wartime iconography).

## Commands

```bash
npm run dev        # Dev server at http://localhost:3000 (host 0.0.0.0)
npm run build      # Production build to dist/ (two entries: main + tank-editor)
npm run preview    # Preview production build
npm run lint       # TypeScript type-check only (tsc --noEmit)
npm run clean      # Remove dist/
```

No test framework. No ESLint. `tsc --noEmit` is the only static check — always run `npm run lint` after code changes.

The Vite config injects `GEMINI_API_KEY` from the environment into `process.env.API_KEY` / `process.env.GEMINI_API_KEY`. `.env.example` documents the expected variables.

## Architecture

**Two Vite entry points**:
- `index.html` → `src/main.tsx` → `App.tsx` (the game)
- `tank-editor.html` → `src/tank-editor/main.tsx` → `TankEditorApp.tsx` (standalone tank model/spec editor)

**App screen routing**: `App.tsx` reads `gameScreen` from the store and renders one of:
- `tank-select` — `screens/TankSelect.tsx` (rotating 3D preview, stats, armor tooltips, deploy)
- `oob-editor` — `screens/OOBEditor.tsx` + `OOBMiniMap.tsx` + `OOBTankList.tsx` (order-of-battle: allies, enemies, map size, seed)
- default — `GameScene.tsx` + `UI.tsx` (live battle)

**State**: A single Zustand store (`src/store.ts`, ~1300 LOC) owns all runtime game state — player tank, enemies, allies, projectiles, particles, trees, buildings, waypoints, messages, and screen routing. All mutation goes through store actions. Hit detection, armor penetration math, particle spawning, and destruction flow live here.

**Per-frame game loop**: `GameScene.tsx` hosts the R3F `Canvas` and the `PlayerController`, which each frame orchestrates extracted pure-ish modules:
- `useInput.ts` — keyboard, mouse, wheel, pointer-lock state
- `turretAiming.ts` — turret rotation / gun elevation from arrow keys or camera-alignment right-click
- `aimPoint.ts` — world-space aim point with terrain raycast (shared by camera + HUD crosshair)
- `designatedAimTarget.ts` — resolves a right-click target across tanks, buildings, trees, terrain, plus a stable long-range fallback
- `firing.ts` — cooldown, muzzle position, projectile spawn, dispersion
- `CameraController.ts` — third-person / gunner / map camera placement
- `tankPhysics.ts` — terrain orientation, differential tracks, ballistic angle, gun sway, body rock, engine RPM/gear
- `terrainHeight.ts` — height sampling shared across physics/camera/aim
- `audio.ts` — listener pose + player engine telemetry each frame

**Combat & physics modules**:
- `ProjectileManager.tsx` + `projectilePhysics.ts` — projectile stepping, terrain/tree/building collisions
- `armorModel.ts` — per-tank OBB armor plates, world transforms
- `combatPhysics.ts` — impact analysis, ricochet (>70°), effective armor, post-pen damage
- `penetrationModel.ts` — range-based penetration falloff (historical points or auto-curve)
- `collision.ts` — tank-tank (XZ circle) and tank-tree resolution
- `aiAccuracy.ts`, `spotting.ts` — AI gunnery accuracy and line-of-sight / detection

**World**:
- `Terrain.tsx` + `terrainHeight.ts` — layered-noise terrain with metre-high swells, sunken roads, flattened center
- `roads.ts` — seeded road network (N-S / E-W crossroads), height blend, speed bonus
- `trees.ts` + `TreeRenderer.tsx` — seeded woods, field-edge treelines, roadside avenues and lone trees; collision, HP, knockdown; instanced billboard-card crowns (`rendering/foliageCards.ts`) and visual-only understory (`rendering/woodland.ts`). `treeIndex.ts` grids tree queries; `fieldBoundaries.ts` decides which field edges get trees, hedges or nothing
- `rendering/WorldDressing.tsx` (hedges, telegraph lines) and `rendering/HorizonSkirt.tsx` (countryside beyond the map edge) — visual only, no collision or line-of-sight effect
- `buildings.ts` + `BuildingRenderer.tsx` — rural clusters at junctions/roadsides, wall/roof impacts, farmland plots that tint terrain and suppress nearby trees

**AI**: `EnemyAI.tsx` and `AllyAI.tsx` each drive their tanks (approach/retreat, gravity-compensated aim, dispersion drift, steady-aim zero after stillness). Allies also accept stance + fire-control orders and waypoints (see `WaypointMarker.tsx`).

**Rendering & views**:
- `Tank.tsx` / `TankModel.tsx` — legacy procedural tank geometry + animation
- `Particles.tsx` — 11+ effect types (fire, penetrate, bounce, ground/HE hits, explosion, dust, smoke, tree hits, non-pen, ricochet), pooled `Points` + `InstancedMesh`; also queues flash lights and crater decals per effect
- `rendering/ShellTracers.tsx` (screen-space HDR tracer streaks, rendered by `ProjectileManager`), `rendering/FlashLights.tsx` (fixed 4-light flash pool), `rendering/ImpactDecals.tsx` (multiply-blended ground craters), `rendering/TrackMarks.tsx` (tread marks per track); `groundSurface.ts` classifies grass / mud / road under a point for surface-dependent effects
- `MapMode.tsx` + `MapMarker.tsx` — top-down tactical view (M key) with pan/zoom
- `BurningWrecks.tsx` — time-limited smoke on destroyed tanks

**Aiming system** (see `openspec/product.md` for canonical rules): three distinct aim points — gunner sight (arrow keys), gun aim point (with ballistic elevation offset), viewpoint (free-look mouse). Distance calibration via PageUp/PageDown drives drop compensation. The center of the gunner sight is the calibrated point of impact at the selected zero.

**Camera modes**: third-person (default), gunner view (first-person zoomed, V or MMB), map view (M).

**Path alias**: `@/*` maps to project root in both `tsconfig.json` and `vite.config.ts`.

## Tanks

Tank definitions are **folder-based JSON modules** under `src/tanks/<tankid>/`:

- `tank.json` — `TankSpec`: metadata, mounts, mobility, traverse, weapons (AP + optional APC/HE + optional burst), armor plates (OBB hitboxes with thickness and parent)
- `model.json` — `TankModelSpec`: parametric render tree (hull / tracksLeft / tracksRight / turret / gun) using `box`, `cylinder`, `extrude`, `repeat`, `mirror`, `group`, `helper` nodes with material roles
- `index.ts` — imports both JSONs, builds a `ParametricTankRenderer`, exports `definition` and `tankModule`

Registry at `src/tanks/core/registry.ts` **auto-discovers** `../*/index.ts` (folder-based, priority 20) and legacy `../*.tsx` files (priority 10) via `import.meta.glob`. No manual registration. Sort order comes from `tank.json` `catalog.sortOrder`.

Currently registered: Sherman, Sherman A2 (76), Tiger I, Panzer III, Panzer IV, Panzer II, T-34, M10 GMC (open-topped tank destroyer).

**When adding or editing a tank, follow `src/tanks/CLAUDE.md`** — it is the authoritative step-by-step with required schemas, coordinate conventions (+Z forward, +Y up, meters), armor coverage checklist, and helper/material role lists.

The standalone tank editor (`src/tank-editor/`) reads/writes these JSON files via `fs.ts` and provides a live preview + validation (`validation.ts`).

## Audio

`src/audio.ts` is the single runtime audio entry point. Gameplay code emits events (`playShot`, `playImpact`, `playExplosion`) and telemetry (`setListenerPose`, `syncPlayerEngine`); it never builds sounds directly. The manager owns Web Audio unlock/lifecycle and swappable backends via `replaceBackend()`. See `audio-architecture.md` for the full event surface and integration points.

## OpenSpec Workflow

OpenSpec under `openspec/` is the canonical product documentation:

- `product.md` — gameplay and design specification (intended behavior)
- `implemented.md` — shipped capabilities, grouped by system
- `roadmap.md` — unfinished work (checkboxes, grouped by sprint/milestone)
- `conventions.md` — document format and writing rules
- `README.md` — index
- `changes/` and `specs/` — OpenSpec change proposals and specs

Rules:
- When a roadmap item ships, move it from `roadmap.md` to `implemented.md`.
- When intended behavior changes, update `product.md` in the same change.
- Refactors without behavior change do not require OpenSpec edits unless terminology or architecture boundaries moved.
