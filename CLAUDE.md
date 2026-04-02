# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Panzer Front is a **WW2 tank battle simulator** built with React 19, Three.js (via React Three Fiber), Zustand state management, and Vite. All visual design — UI, HUD, color palette, typography, effects — should follow a WW2 aesthetic (military olive drab, aged metal, period-appropriate instruments, wartime iconography).

## Commands

```bash
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build to dist/
npm run preview    # Preview production build
npm run lint       # TypeScript type-check only (tsc --noEmit)
npm run clean      # Remove dist/
```

No test framework is configured. No ESLint — only `tsc` for type checking.

## Architecture

**Entry flow**: `index.html` → `src/main.tsx` → `App.tsx` → `GameScene.tsx` + `UI.tsx`

**State**: Single Zustand store in `store.ts` holds all game state — player tank, enemy tanks, projectiles, particles, messages. All mutation goes through store actions.

**Key modules**:
- `GameScene.tsx` — R3F Canvas, scene setup, **PlayerController** (orchestrates per-frame tank update loop by calling extracted modules below).
- `useInput.ts` — Custom hook for keyboard/mouse/wheel event handling, pointer lock management, and input state refs.
- `firing.ts` — Fire cooldown check, muzzle position calculation, projectile spawning, dispersion application.
- `turretAiming.ts` — Turret rotation and gun elevation computation from arrow keys or right-click camera alignment.
- `aimPoint.ts` — Gun sight aim point world-space calculation with terrain raycast (used by both camera and HUD crosshair).
- `CameraController.ts` — Third-person, gunner-view, and map-view camera placement logic.
- `tankPhysics.ts` — Pure functions for terrain orientation, differential track movement, ballistic angle, gun sway (spring-damper), body rock, and engine RPM/gear simulation.
- `store.ts` — Zustand store with tank data types, projectile firing, hit detection, armor penetration math, particle spawning, ally/enemy management.
- `config.ts` — All numeric constants (physics, tank stats, weapon stats, camera, map). Change gameplay tuning here.
- `Tank.tsx` — Procedural tank mesh geometry and animation.
- `Terrain.tsx` — Procedural terrain using sine wave height formula (flattened center).
- `ProjectileManager.tsx` — Per-frame projectile movement, collision against armor plates and trees, penetration with impact angle and ricochet.
- `EnemyAI.tsx` — Enemy AI: approach player, aim turret with gravity compensation and dispersion drift, fire on cooldown with steady-aim zeroing.
- `AllyAI.tsx` — Ally tank AI: similar to EnemyAI but targets enemies, uses tank-tank and tree collision resolution.
- `Particles.tsx` — Effect system with 11 particle types (fire, penetrate, bounce, ground hits, explosions, dust, smoke), billboard sprites, additive blending.
- `audio.ts` — Procedural Web Audio API synthesis for engine sound, multi-layer gunfire, and autocannon bursts.
- `UI.tsx` — HUD overlay (health, track HP, ammo type, calibration distance, messages).
- `armorModel.ts` — Per-tank armor plate definitions (OBB geometry, thickness, zones) and world-space transform helpers.
- `combatPhysics.ts` — Impact analysis, ricochet checks, effective armor calculation, penetration checks, damage computation.
- `projectilePhysics.ts` — Projectile motion stepping, terrain/tree collision detection, extracted from ProjectileManager.
- `collision.ts` — Tank-tank (circle-circle XZ) and tank-tree collision resolution.
- `roads.ts` — Road network definition (N-S and E-W crossroads) with height blending and speed bonus.
- `trees.ts` — Tree placement (jittered grid), collision, health, and knockdown state.
- `TreeRenderer.tsx` — 3D tree rendering with knockdown animation.
- `MapMode.tsx` — Top-down tactical map view (M key) with pan/zoom camera controller.
- `MapMarker.tsx` — Flat colored triangle markers for tanks on the map view.
- `BurningWrecks.tsx` — Persistent burning smoke effect on destroyed tanks (time-limited).
- `tanks/types.ts` — `TankDefinition` type with armor profiles, weapon stats, description, nationality, year.
- `tanks/registry.ts` — Tank definition registry, exports `getTankDef()` and `getAllTankDefs()`.
- `tanks/sherman.tsx`, `tanks/tiger.tsx`, `tanks/panzer3.tsx`, `tanks/panzer2.tsx` — Individual tank definitions with procedural geometry and armor plate configs.
- `screens/TankSelect.tsx` — Tank selection screen with 3D rotating preview, stat bars, armor tooltips, and deploy button.

**Tank definitions** (`tanks/`): Each tank type (Sherman, Tiger I, Panzer III, Panzer II) has its own file defining procedural geometry, armor plate layout, weapon stats, and metadata. Registered via `tanks/registry.ts`.

**Armor & penetration**: Multi-plate OBB collision system. Each tank has ~20 armor plates with individual thickness. Impact angle, auto-ricochet (>70°), effective armor calculation, and post-pen damage scaling. Detailed in `openspec/product.md`.

**Aiming system** (detailed in `openspec/product.md`): Three distinct aim points — gunner sight (arrow keys), gun aim point (with ballistic elevation offset), and viewpoint (free-look mouse camera). Distance calibration via PageUp/PageDown affects ballistic drop compensation. Terrain raycast for accurate aim point positioning.

**Camera modes**: Third-person (default), gunner view (first-person zoomed, V key), map view (top-down tactical, M key).

**Physics**: Differential steering via independent track speeds, terrain height sampling, projectile gravity (9.81 m/s²), gun sway (4 vibration layers), body rock oscillation, engine RPM/gear simulation, track damage and immobilization.

**Path alias**: `@/*` maps to project root in both TypeScript and Vite.

## OpenSpec Workflow

OpenSpec is the canonical documentation system for this repository. Write and maintain product, roadmap, and implementation documentation in `openspec/`.

- `openspec/product.md` contains the gameplay and design specification.
- `openspec/roadmap.md` contains active roadmap items and unfinished work.
- `openspec/implemented.md` records shipped capabilities that already exist in the codebase.
- `openspec/conventions.md` defines the OpenSpec document format and writing rules.
- `openspec/README.md` is the index for the OpenSpec docs.
- When an item is completed, move it from `openspec/roadmap.md` to `openspec/implemented.md`.
- When intended behavior changes, update `openspec/product.md` as part of the same work.

