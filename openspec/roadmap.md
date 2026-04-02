# Roadmap

This document tracks unfinished work only. Move completed capabilities into `openspec/implemented.md`.

## Sprint 1: Core Game Loop And Visual Polish

### Feature 1.1: Mission / Wave System [L]

Objective: replace ad hoc spawning with mission-driven phase flow and authored wave progression.

Implementation tasks:
- [ ] Add a game phase state machine to `store.ts` with `'menu' | 'briefing' | 'playing' | 'victory' | 'defeat'`
- [ ] Create `src/missions.ts` to define wave compositions, spawn positions, and timing
- [ ] Create `src/WaveManager.tsx` to read mission data and spawn waves under gameplay conditions
- [ ] Modify `GameScene.tsx` to remove hardcoded `spawnEnemy` usage and delegate spawning to `WaveManager`
- [ ] Modify `App.tsx` to switch between menu, briefing, gameplay, and result screens
- [ ] Create `src/screens/MissionSelect.tsx`, `src/screens/MissionBrief.tsx`, and `src/screens/MissionResult.tsx`

Player-facing validation:
- [ ] The game flows cleanly from mission selection through briefing, battle, and result states

### Feature 2.1: Screen Shake On Hits [S]

Objective: add recoil and damage feedback to strengthen impact readability.

Implementation tasks:
- [ ] Add a decaying shake offset to `CameraController.ts`
- [ ] Add `cameraShake` state to `store.ts` and trigger it on damage received and firing

Player-facing validation:
- [ ] Firing and incoming hits create readable but controlled camera shake without hurting aim usability

### Feature 2.2: Shell Tracer Visualization [S]

Objective: make shell travel easier to track during combat.

Implementation tasks:
- [ ] Add trail geometry per projectile in `ProjectileManager.tsx` using `THREE.Line` or a stretched mesh
- [ ] Add `tracerLength`, `tracerColor`, and `tracerFadeTime` to `config.ts`

Player-facing validation:
- [ ] Fast shots remain visible long enough to read trajectory and impact direction

---

## Sprint 2: Scoring And Sound

### Feature 1.2: Scoring / Stats System [S]

Objective: surface mission performance during combat and on mission completion.

Implementation tasks:
- [ ] Add a `stats` object to `store.ts` for kills, shots fired, accuracy, and damage dealt or received
- [ ] Add a real-time kill counter in `UI.tsx`
- [ ] Display detailed mission stats in `src/screens/MissionResult.tsx`

Player-facing validation:
- [ ] Players can track live combat performance and review a complete mission summary afterward

### Feature 2.4: Impact / Ricochet Sound Effects [M]

Objective: replace temporary synthesized hit sounds with more convincing transient playback.

Implementation tasks:
- [ ] Replace the generated impact, ricochet, and ground-hit backend in `audio.ts` with sample-based playback
- [ ] Tune `store.ts` `handleHit` event mapping and output levels against the new transient backend

Player-facing validation:
- [ ] Penetrations, bounces, and ground hits are distinguishable by ear during combat

### Feature 2.5: Ambient Battlefield Sounds [S]

Objective: give the battlefield a persistent sense of place beyond immediate weapon fire.

Implementation tasks:
- [ ] Add ambient loop support to `audio.ts` for distant artillery and wind loops

Player-facing validation:
- [ ] The battlefield sounds alive even during quiet periods without overpowering nearby combat cues

---

## Sprint 3: AI Behaviors, Difficulty, And Sky

### Feature 3.1: AI Behavior Types [M]

Objective: diversify enemy movement patterns by tank role and doctrine.

Implementation tasks:
- [ ] Refactor `EnemyAI.tsx` to extract movement into a strategy pattern for aggressive, defensive, and flanking behavior
- [ ] Add `aiBehavior` to `TankDefinition` in `tanks/types.ts`
- [ ] Assign Tiger to defensive behavior and Panzer III to aggressive behavior
- [ ] Add per-behavior tuning data to `config.ts`

Player-facing validation:
- [ ] Different enemy tank classes feel tactically distinct in movement and engagement style

### Feature 1.4: Difficulty Levels [S]

Objective: let players tune challenge without changing core rules.

Implementation tasks:
- [ ] Add difficulty presets to `config.ts` that scale AI accuracy, reload time, and enemy HP
- [ ] Add a `difficulty` field to `store.ts`
- [ ] Read difficulty-adjusted config values in `EnemyAI.tsx`

Player-facing validation:
- [ ] Difficulty selection changes combat challenge in clear and consistent ways

### Feature 3.5: Line-Of-Sight Spotting [M]

Objective: make vision and concealment part of tactical play.

Implementation tasks:
- [ ] Add spotted and hidden state for tanks to `store.ts`
- [ ] Use terrain and tree occlusion checks before AI can target enemies in `EnemyAI.tsx` and `AllyAI.tsx`
- [ ] Hide unspotted enemies from `MapMode.tsx` and reduce HUD information until contact is established
- [ ] Add spotting range and reveal delay tuning to `config.ts`

Player-facing validation:
- [ ] Terrain and vegetation meaningfully affect detection, targeting, and battlefield awareness

### Feature 2.6: Sky And Clouds [S]

Objective: make the battlefield sky feel authored rather than static.

Implementation tasks:
- [ ] Parameterize `Sky` sun position in `GameScene.tsx` and add drei `<Cloud>` support
- [ ] Add `environment.timeOfDay` and `environment.fogDensity` to `config.ts`

Player-facing validation:
- [ ] The sky contributes to atmosphere and supports future environment presets

---

## Sprint 4: Terrain Variety, Weather, And Performance

### Feature 4.1: Terrain Variety [M]

Objective: support distinct battlefield topographies across missions.

Implementation tasks:
- [ ] Parameterize terrain profile behavior in `Terrain.tsx` for amplitude, frequency, and flat regions
- [ ] Add `terrainProfiles` to `config.ts` for plains, hills, and valley layouts
- [ ] Let each mission reference a terrain profile

Player-facing validation:
- [ ] Missions feel geographically different instead of sharing one terrain pattern

### Feature 4.2: Weather Effects - Fog And Rain [M]

Objective: add weather that changes both atmosphere and battlefield behavior.

Implementation tasks:
- [ ] Add `<fog>` to `GameScene.tsx`
- [ ] Add a rain particle system above the camera
- [ ] Scale AI engagement distance by fog visibility
- [ ] Reduce traction in rain through `tankPhysics.ts`

Player-facing validation:
- [ ] Fog and rain alter visibility, handling, and pacing in noticeable ways

---

## Sprint 5: Advanced AI And Day/Night

### Feature 3.2: AI Obstacle Avoidance [L]

Objective: improve route selection around dynamic and static battlefield obstacles.

Implementation tasks:
- [ ] Add fan-shaped raycast sampling in `EnemyAI.tsx` to avoid trees and tanks
- [ ] Export `isPathClear()` from `collision.ts`

Player-facing validation:
- [ ] AI units navigate around clutter with fewer obvious collisions and stalls

### Feature 3.3: Hull-Down Positioning [M]

Objective: let defensive AI exploit terrain for survivability.

Implementation tasks:
- [ ] Add terrain scanning for turret-exposed and hull-hidden positions in defensive AI behavior

Player-facing validation:
- [ ] Defensive tanks seek and use partial cover in a recognizable way

### Feature 4.3: Day/Night Cycle [M]

Objective: extend environmental variety across longer battles and future mission presets.

Implementation tasks:
- [ ] Animate sun position and lighting intensity over game time
- [ ] Add headlight `SpotLight` support to tanks in `Tank.tsx`
- [ ] Reduce AI engagement distance at night

Player-facing validation:
- [ ] Night conditions affect mood, visibility, and combat range

---

## Sprint 6: Squad AI, Buildings, Water, And Save/Load

### Feature 3.4: AI Squad Coordination [L]

Objective: coordinate AI units as groups instead of isolated actors.

Implementation tasks:
- [ ] Add a coordination layer that assigns pin, flank-left, and flank-right roles before individual AI updates
- [ ] Add `squadAssignments` to `store.ts`

Player-facing validation:
- [ ] Multi-tank enemy groups act with more coherent team behavior

### Feature 4.4: Destructible Buildings [XL]

Objective: turn village structures into damageable battlefield cover.

Implementation tasks:
- [ ] Add building HP and damage state to `store.ts`
- [ ] Extend `src/buildings.ts` and `src/BuildingRenderer.tsx` from indestructible obstacles into destructible wall and roof sections
- [ ] Add shell damage, collapse state, and debris or wreck visuals for destroyed buildings

Player-facing validation:
- [ ] Buildings can be broken down by fire and visibly transition into destroyed cover

### Feature 4.5: Water / Rivers [M]

Objective: add new terrain hazards and route constraints.

Implementation tasks:
- [ ] Create `src/Water.tsx` for a semi-transparent reflective plane
- [ ] Add a speed penalty in shallow water and make deep water impassable

Player-facing validation:
- [ ] Rivers and water crossings affect route choice and movement risk

### Feature 5.2: Save / Load [M]

Objective: preserve game state between play sessions.

Implementation tasks:
- [ ] Add serialization and deserialization to `store.ts` with `Vector3` values stored as `[x, y, z]`
- [ ] Persist saves using `localStorage` or a JSON file

Player-facing validation:
- [ ] Players can leave and resume a battle without losing key state

---

## Sprint 7: Replay And Mobile

### Feature 5.3: Replay System [XL]

Objective: support deterministic battle playback for review and debugging.

Implementation tasks:
- [ ] Record per-frame input state for deterministic playback
- [ ] Create `src/replay.ts`

Player-facing validation:
- [ ] A finished battle can be replayed with matching motion and firing outcomes

### Feature 5.4: Mobile Touch Controls [L]

Objective: make the core control scheme portable to touch devices.

Implementation tasks:
- [ ] Create `src/TouchControls.tsx` for virtual joystick and touch-drag camera input
- [ ] Abstract input sources in `useInput.ts`

Player-facing validation:
- [ ] Core driving, aiming, and firing interactions remain usable on touch screens
