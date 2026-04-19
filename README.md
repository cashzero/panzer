<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Panzer Front

A WW2 tank battle simulator built with React 19, Three.js (via React Three Fiber), Zustand, and Vite. Command historical tanks — Sherman, Tiger I, Panzer III/IV, T-34 — across procedural battlefields with range-based penetration, armor plate modeling, ricochet physics, and AI-controlled allies and enemies.

## Features

- **Historical tanks** — folder-based JSON definitions with per-tank armor plates (OBB hitboxes), mobility, traverse, and multiple weapon modes (AP / APC / HE / burst)
- **Realistic combat** — range-based penetration falloff, effective armor from impact angle, ricochet above 70°, post-penetration damage
- **Three aim points** — gunner sight (arrow keys), ballistic gun aim point, free-look viewpoint; distance calibration via PageUp/PageDown drives drop compensation
- **Multiple camera modes** — third-person (default), gunner view (V / MMB), top-down map view (M) with pan/zoom
- **Procedural world** — sine-wave terrain, seeded road network, rural building clusters, destructible trees
- **AI units** — enemy and allied tanks with gravity-compensated aim, spotting, stance and fire-control orders, waypoints
- **Order-of-Battle editor** — configure allies, enemies, map size, and seed before deploying
- **Standalone tank editor** — live preview + validation for authoring new tanks (`tank-editor.html`)

## Commands

```bash
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build to dist/ (main + tank-editor entries)
npm run preview    # Preview production build
npm run lint       # TypeScript type-check (tsc --noEmit)
npm run clean      # Remove dist/
```

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` to your Gemini API key.
3. Start the dev server:
   ```bash
   npm run dev
   ```

## Project Layout

- `src/App.tsx` — screen router (tank select, OOB editor, battle)
- `src/GameScene.tsx` — R3F canvas and per-frame game loop
- `src/store.ts` — single Zustand store; owns all runtime game state
- `src/tanks/<tankid>/` — tank definitions (`tank.json`, `model.json`, `index.ts`)
- `src/tank-editor/` — standalone parametric tank editor
- `openspec/` — canonical product documentation (`product.md`, `implemented.md`, `roadmap.md`)
- `CLAUDE.md` — architecture guide for contributors
- `src/tanks/CLAUDE.md` — authoritative guide for adding or editing tanks

## Controls

- **Arrow keys** — turret traverse and gun elevation (gunner sight)
- **WASD** — drive (differential tracks)
- **Mouse** — free-look viewpoint; right-click to align turret to camera or designate a target
- **Space / LMB** — fire
- **V / MMB** — toggle gunner view
- **M** — toggle tactical map view
- **PageUp / PageDown** — adjust zero distance for drop compensation

View this app in AI Studio: https://ai.studio/apps/99f9e6ec-32f7-4725-b79c-b7d1cf90a9ea
