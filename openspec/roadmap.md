# Roadmap

This document tracks unfinished work only. Move completed capabilities into `openspec/implemented.md`.

## Sprint 1: Difficulty And Scenarios

### Feature 1.4: Difficulty Levels [S]

Objective: let the player choose how hard the enemy fights without breaking the armour penetration model.

Implementation tasks:
- [ ] Add difficulty presets to `config.ts` that scale AI gun dispersion, reaction and reload time, and spotting reveal delay (never tank HP or armour)
- [ ] Add a `difficulty` field to `store.ts` and a selector in the order-of-battle screen
- [ ] Read difficulty-adjusted values in `EnemyAI.tsx`, `aiAccuracy.ts` and `spotting.ts`

Player-facing validation:
- [ ] Difficulty selection changes combat challenge in clear and consistent ways while penetration outcomes stay the same

### Feature 1.1: Scenario / Mission System [L]

Objective: give battles objectives and authored order-of-battle setups, built on the existing order-of-battle editor rather than arcade waves.

Implementation tasks:
- [ ] Create `src/missions.ts` defining scenarios: fixed order of battle, map seed and size, objectives (destroy, hold a grid square, break through, withdraw) and optional timed reinforcements
- [ ] Add mission selection and briefing screens (`src/screens/MissionSelect.tsx`, `src/screens/MissionBrief.tsx`) routed from `App.tsx`
- [ ] Evaluate objectives in `store.ts` alongside the existing victory/defeat decision; show them in `BattleDebrief.tsx`
- [ ] Spawn reinforcements from mission data and remove the legacy `spawnEnemy` store action

Player-facing validation:
- [ ] The game flows cleanly from mission selection through briefing, battle, and an after-action report that grades the objectives

---

## Sprint 2: Environment And Sound

### Feature 2.6: Environment Presets (Sky, Fog, Time Of Day) [M]

Objective: replace the single summer-haze setup in `rendering/BattlefieldLighting.tsx` with presets that change atmosphere and gameplay together.

Implementation tasks:
- [ ] Add `environment` presets to `config.ts` (clear, overcast, morning mist, dusk) covering sun position, light intensity, fog range and cloud cover
- [ ] Parameterize `BattlefieldLighting.tsx` sky, sun and fog from the active preset
- [ ] Scale spotting range in `spotting.ts` and AI engagement distance by fog visibility and light level
- [ ] Let each mission pick a preset

Player-facing validation:
- [ ] Mist and dusk noticeably shorten detection and engagement ranges; the sky and light read as different times of day

### Feature 2.4: Impact / Ricochet Sound Effects [M]

Objective: make hit results distinguishable by ear.

Implementation tasks:
- [ ] Choose freely licensed samples and keep the bundle small
- [ ] Replace the generated impact, ricochet, and ground-hit backend in `audio.ts` with sample-based playback via `replaceBackend()`
- [ ] Tune `store.ts` `handleHit` event mapping and output levels against the new transient backend

Player-facing validation:
- [ ] Penetrations, bounces, and ground hits are distinguishable by ear during combat

---

## Sprint 3: Terrain, Water, And Squad AI

### Feature 4.1: Terrain Profiles [M]

Objective: make missions feel geographically different.

Implementation tasks:
- [ ] Parameterize `terrainHeight.ts` / `Terrain.tsx` for amplitude, frequency, and flat regions
- [ ] Add `terrainProfiles` to `config.ts` for plains, hills, and valley layouts
- [ ] Check that roads, villages, fields and forests (`roads.ts`, `landLayout.ts`, `forest.ts`) still lay out sensibly on every profile
- [ ] Let each mission reference a terrain profile

Player-facing validation:
- [ ] Missions feel geographically different instead of sharing one terrain pattern

### Feature 4.5: Rivers And Bridges [L]

Objective: add water as a route-shaping obstacle.

Implementation tasks:
- [ ] Plan a seeded river per world and carve it into the terrain height
- [ ] Place bridges and fords where roads cross; keep villages and fields off the water
- [ ] Create `src/Water.tsx` for a semi-transparent reflective surface
- [ ] Slow tanks in fords, make deep water impassable, and mark it in the `navigation.ts` route grid
- [ ] Stop shells and draw water splashes in `projectilePhysics.ts` / `Particles.tsx`

Player-facing validation:
- [ ] Rivers and crossings affect route choice and movement risk for the player and the AI

### Feature 3.4: AI Squad Coordination [L]

Objective: make multi-tank groups act as a team on top of the existing per-tank roles (`aiMatchup.ts`, `aiTactics.ts`).

Implementation tasks:
- [ ] Add a coordination pass before individual AI updates that assigns pin, flank-left and flank-right to groups sharing a target
- [ ] Add `squadAssignments` to `store.ts` and have fighting-position scoring respect them

Player-facing validation:
- [ ] Multi-tank enemy groups pin and flank rather than all converging on one line

---

## Sprint 4: Destructible Buildings

### Feature 4.4: Destructible Buildings [XL]

Objective: turn buildings from indestructible cover into cover that can be shot down. Wall and roof impacts already exist in `buildings.ts`.

Implementation tasks:
- [ ] Add building HP and damage state to `store.ts`
- [ ] Split buildings in `buildings.ts` and `BuildingRenderer.tsx` into destructible wall and roof sections
- [ ] Add collapse state, rubble footprint (collision and line of sight), and debris visuals

Player-facing validation:
- [ ] Buildings can be broken down by fire and visibly transition into rubble cover

---

## Backlog (not scheduled)

Low value for a short-battle simulator or blocked by large prerequisites; revisit only if priorities change.

- Save / load [M]: battles are short; serialize `store.ts` state with `Vector3` as `[x, y, z]` only if long scenarios appear.
- Replay system [XL]: needs a deterministic simulation first (fixed timestep, seeded dispersion) before recording inputs is meaningful.
- Mobile touch controls [L]: precise gun laying, range calibration and view switching are hard to make usable on touch.
- Rain [S]: rain particles and reduced traction in `tankPhysics.ts`; add as an environment preset once presets exist.
- Tank headlights at night: dropped; wartime tanks fought blacked out.
