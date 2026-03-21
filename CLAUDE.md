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
- `firing.ts` — Fire cooldown check, muzzle position calculation, projectile spawning.
- `turretAiming.ts` — Turret rotation and gun elevation computation from arrow keys or right-click camera alignment.
- `aimPoint.ts` — Gun sight aim point world-space calculation (used by both camera and HUD crosshair).
- `CameraController.ts` — Third-person and gunner-view camera placement logic.
- `tankPhysics.ts` — Pure functions for terrain orientation, differential track movement, ballistic angle, gun sway (spring-damper), and engine RPM/gear simulation.
- `store.ts` — Zustand store with tank data types, projectile firing, hit detection, armor penetration math, particle spawning.
- `config.ts` — All numeric constants (physics, tank stats, weapon stats, camera). Change gameplay tuning here.
- `Tank.tsx` — Procedural tank mesh geometry and animation.
- `Terrain.tsx` — Procedural terrain using sine wave height formula.
- `ProjectileManager.tsx` — Per-frame projectile movement, ray-cast collision against tank bounding boxes, armor penetration with impact angle and ricochet.
- `EnemyAI.tsx` — Simple AI: move toward player, aim turret with gravity compensation, fire on cooldown.
- `Particles.tsx` — Effect system with 5 particle types (flash, smoke, fireball, debris, spark), billboard sprites, additive blending.
- `audio.ts` — Procedural Web Audio API synthesis for engine sound and multi-layer gunfire.
- `UI.tsx` — HUD overlay (health, ammo type, calibration distance, messages).
- `TankModel.tsx` — Auto-generated wrapper for `public/tank.glb` (not currently used — `Tank.tsx` uses procedural geometry).

**Aiming system** (detailed in `spec.md`): Three distinct aim points — gunner sight (arrow keys), gun aim point (with ballistic elevation offset), and viewpoint (free-look mouse camera). Distance calibration via PageUp/PageDown affects ballistic drop compensation.

**Camera modes**: Third-person (default), gunner view (first-person zoomed, V key), map view.

**Physics**: Differential steering via independent track speeds, terrain height sampling, projectile gravity (9.81 m/s²), gun sway based on movement.

**Path alias**: `@/*` maps to project root in both TypeScript and Vite.

## TODO Workflow

- `todo.md` contains active TODO items.
- When an item is completed, move it from `todo.md` to the "Implemented Features" section in `spec.md`.
- `spec.md` contains the aiming system specification and documented implemented features.

