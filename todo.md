# TODO

## Sprint 1: Core Game Loop + Visual Polish

### 1.1 Mission / Wave System [L]
- [ ] Add game phase state machine to `store.ts`: `'menu' | 'briefing' | 'playing' | 'victory' | 'defeat'`
- [ ] Create `src/missions.ts` — define wave compositions (enemy types, count, spawn positions, delay)
- [ ] Create `src/WaveManager.tsx` — R3F component that reads wave config and spawns enemies on conditions
- [ ] Modify `GameScene.tsx` — remove hardcoded `spawnEnemy`, delegate to WaveManager
- [ ] Modify `App.tsx` — switch screens based on game phase (menu / briefing / gameplay / result)
- [ ] Create `src/screens/MissionSelect.tsx`, `MissionBrief.tsx`, `MissionResult.tsx`

### 2.1 Screen Shake on Hits [S]
- [ ] Add shake offset (decaying over time) to `CameraController.ts`
- [ ] Add `cameraShake` state to `store.ts`, trigger on damage received and firing

### 2.2 Shell Tracer Visualization [S]
- [ ] Add trail geometry per projectile in `ProjectileManager.tsx` (THREE.Line or stretched mesh)
- [ ] Add `tracerLength`, `tracerColor`, `tracerFadeTime` to `config.ts`

---

## Sprint 2: Scoring, Sound

### 1.2 Scoring / Stats System [S]
- [ ] Add `stats` object to `store.ts` (kills, shots fired, accuracy, damage dealt/received)
- [ ] Add real-time kill counter in `UI.tsx`
- [ ] Display detailed stats in `MissionResult.tsx`

### 2.4 Impact / Ricochet Sound Effects [M]
- [ ] Add `playImpactSound('penetrate' | 'ricochet' | 'ground')` to `audio.ts`
- [ ] Call appropriate sound in `store.ts` `handleHit` based on penetration result

### 2.5 Ambient Battlefield Sounds [S]
- [ ] Add `initAmbientSounds()` to `audio.ts` (distant artillery, wind loops)

---

## Sprint 3: AI Behaviors, Difficulty, Sky

### 3.1 AI Behavior Types [M]
- [ ] Refactor `EnemyAI.tsx` — extract movement into strategy pattern (aggressive / defensive / flanking)
- [ ] Add `aiBehavior` field to `TankDefinition` in `tanks/types.ts`
- [ ] Tiger → defensive, Panzer III → aggressive
- [ ] Add per-behavior tuning to `config.ts`

### 1.4 Difficulty Levels [S]
- [ ] Add difficulty presets to `config.ts` (scale AI accuracy, reload time, enemy HP)
- [ ] Add `difficulty` field to `store.ts`
- [ ] Read difficulty-adjusted config in `EnemyAI.tsx`

### 2.6 Sky and Clouds [S]
- [ ] Parameterize `Sky` sunPosition in `GameScene.tsx`, add drei `<Cloud>`
- [ ] Add `environment.timeOfDay`, `environment.fogDensity` to `config.ts`

---

## Sprint 4: Terrain Variety, Weather, Performance

### 4.1 Terrain Variety [M]
- [ ] Parameterize terrain profile in `Terrain.tsx` (amplitude, frequency, flat regions)
- [ ] Add `terrainProfiles` (plains / hills / valley) to `config.ts`
- [ ] Each mission references a terrain profile

### 4.2 Weather Effects — Fog and Rain [M]
- [ ] Add `<fog>` to `GameScene.tsx`
- [ ] Rain particle system above camera
- [ ] Scale AI engagement distance by fog visibility
- [ ] Reduce traction in rain (`tankPhysics.ts`)

## Sprint 5: Advanced AI, Day/Night

### 3.2 AI Obstacle Avoidance [L]
- [ ] Fan-shaped raycast sampling in `EnemyAI.tsx` to avoid trees and tanks
- [ ] Export `isPathClear()` from `collision.ts`

### 3.3 Hull-Down Positioning [M]
- [ ] Defensive AI scans nearby terrain heights for turret-exposed / hull-hidden positions

### 4.3 Day/Night Cycle [M]
- [ ] Animate sun position and lighting intensity over game time
- [ ] Add headlight `SpotLight` to tanks in `Tank.tsx`
- [ ] Reduce AI engagement distance at night

---

## Sprint 6: Squad AI, Buildings, Water, Save/Load

### 3.4 AI Squad Coordination [L]
- [ ] Coordination layer assigns roles (pin, flank-left, flank-right) before individual AI updates
- [ ] Add `squadAssignments` to `store.ts`

### 4.4 Destructible Buildings [XL]
- [ ] Create `src/buildings.ts` + `src/BuildingRenderer.tsx` (OBB walls with HP)
- [ ] Add building collision to `collision.ts` and `ProjectileManager.tsx`

### 4.5 Water / Rivers [M]
- [ ] Create `src/Water.tsx` — semi-transparent reflective plane
- [ ] Speed penalty in water, deep water impassable

### 5.2 Save / Load [M]
- [ ] Add serialize/deserialize to `store.ts` (Vector3 → [x,y,z])
- [ ] Use localStorage or JSON file

---

## Sprint 7: Replay, Mobile

### 5.3 Replay System [XL]
- [ ] Record per-frame input state, replay with deterministic physics
- [ ] Create `src/replay.ts`

### 5.4 Mobile Touch Controls [L]
- [ ] Create `src/TouchControls.tsx` (virtual joystick + touch drag camera)
- [ ] Abstract input sources in `useInput.ts`
