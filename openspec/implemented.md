# Implemented Features

Completed roadmap items are documented here.

## Core Gameplay And Controls

- Gunner view toggles with `V` or mouse middle button.
- Gunner view supports range calibration with `PageUp` and `PageDown`.
- Gunner view supports multi-step zoom control.
- Gunner sight zeroing keeps the center dot as the calibrated point of impact for the selected distance, with the current zero shown in the HUD.
- The player tank update loop is split into focused modules for input, firing, turret aiming, aim point calculation, camera placement, and tank physics.
- Third-person right-click resolves a designated target from the screen-center ray across tanks, buildings, trees, terrain, and a stable long-range fallback.
- Player right-click target pursuit no longer stops short on a coarse deadzone; the turret and sight keep converging toward the designated target while still respecting traverse and elevation speed limits.
- GunAimPoint reflects the gun's current resolved aim point rather than mirroring the third-person viewpoint target.
- An order-of-battle editor lets the player configure allies, enemies, map size, and world seed before deployment.

## Vehicles, Weapons, And Combat

- Eight selectable tank types are currently registered with per-tank armor and weapon data: Sherman, Sherman A2 (76), Tiger I, Panzer III, Panzer IV, Panzer II, T-34, and the M10 GMC tank destroyer, whose open-topped turret has no roof plate, so plunging hits reach its walls or hull roof.
- Tank hulls are scaled to more realistic proportions relative to their turrets.
- Ammo cycling with `R` supports AP by default plus APC and-or HE when the selected tank carries them.
- Automatic weapons support magazine-based rapid fire for autocannon-equipped vehicles.
- Per-gun dispersion applies weapon-specific yaw and pitch spread to both player and enemy fire.
- Armor penetration falls off with range using either historical sample points or an auto-generated penetration curve.
- Tank-to-tank collision prevents overlapping using a circle-based XZ collision model.
- Gun sway simulates four vibration layers: base harmonic, terrain, inertial, and centrifugal.
- Body rock adds pitch, roll, and vertical bounce while moving.
- Engine RPM and gear simulation runs from idle through forward and reverse gears.

## AI And Tactical Systems

- Enemy AI can approach, retreat, follow terrain, and fire on cooldown.
- Enemy aim uses dispersion drift and gains steady-aim accuracy after remaining stationary.
- Allies support separate movement stance and fire-control orders, with waypoint assignment and cancellation in map mode.

## World, Terrain, And Obstacles

- Terrain is procedurally generated from layered noise with a flattened center area. The plains carry swells of about a metre (`GAME_CONFIG.world.microRelief`), and road beds sit `GAME_CONFIG.roads.sunkenDepth` below the surrounding ground. Physics, line of sight and rendering all read the same height field.
- Road layout is generated from a seed per map size, with terrain blending and road-driven world coloring.
- Trees are placed from the world seed as woods (copses and plantations), field-edge treelines, roadside avenues and lone trees, with collision, health, and knockdown state. Tree ray and proximity queries go through a uniform grid (`treeIndex.ts`).
- Field boundaries are planned once per world (`fieldBoundaries.ts`): each edge gets a treeline, a hedge or stays open. Hedges are continuous lofted meshes, visual only, like the telegraph poles and wires along the longest roads (`rendering/WorldDressing.tsx`).
- Beyond the map edge, a vertex-coloured skirt meets the terrain edge and rolls into low hills with distant woods (`rendering/HorizonSkirt.tsx`), all visual only.
- Farm buildings use period details: the former warehouse is a limestone grange with planked double doors, pilasters and shuttered loft openings; farmhouses gain shutters, corner quoins and back windows.
- Ground-cover tufts fade out at randomised distances (24-42 m), so the cover thins gradually instead of ending in a ring.
- Tank-tree collisions support slow pushing and high-speed knockdown.
- Projectiles damage trees for 50 HP per hit.
- Rural building clusters spawn along road junctions and roadsides as indestructible battlefield obstacles.
- Buildings block tank movement and receive projectile wall and roof impacts.
- Farmland plots generate around rural buildings, tint surrounding terrain, and suppress nearby tree placement. Each plot is ploughed, stubble or hay: furrows ridged along the plot's long side, pale stubble in reaper swaths, or tall pale hay. Ground cover follows the crop, and ploughed plots count as mud for track effects.
- Pasture colour varies between lush green and sun-dried straw over tens of metres, with worn bare patches, green verges beside the lanes and faint animal tracks. Past about 60 m, field-sized blotches keep the middle distance from settling into one tone. Grass tufts take the same pasture tint as the ground under them.

## UI, Map, And Presentation

- Tank selection includes a rotating 3D preview, stat bars, description, nationality, year, and deploy flow.
- Armor plate hover tooltips in tank selection show plate name, zone, thickness, and slope, while highlighting the hovered plate and pausing auto-rotation.
- Map mode provides a tactical top-down view with pan, zoom, marker rendering, and state reset on exit.
- Track damage and repair are surfaced through damage-state HUD text and combat messages rather than per-track HP bars, and gunner view keeps that status block hidden.

## Audio And Effects

- Player engine audio uses a layered Web Audio backend with lazy unlock and 3D listener sync.
- Generated spatial transients cover shot, impact, and explosion playback.
- Track effects follow the surface under the tank, using a CPU mirror of the terrain splat (`groundSurface.ts`). Roads raise the existing track dust. Grass throws torn turf with a faint haze, and exposed soil (farmland, building yards) flings mud clods and dirt puffs off the trailing end of each track.
- Every tank leaves tread-patterned track marks that follow terrain slope and fade out over time (`GAME_CONFIG.trackMarks`). They are dark ruts in mud, crushed turf on grass, and faint on gravel roads.
- Destroyed tanks turn sooted dark brown and burn: flickering flames over the engine deck for 90 s under a dense black plume that rises about 15 m, drifts downwind and dilutes to grey, then a thinner smoulder until 3 minutes.
- The particle system supports effects including `fire`, `hit_penetrate`, `hit_bounce`, `hit_ground`, `he_hit_ground`, `he_hit_penetrate`, `tank_explosion`, `dust`, `dust_low`, `tree_hit`, `burning_smoke`, `non_pen_impact`, and `ricochet_impact`.
- Shells in flight draw as HDR tracer streaks with a pixel-width floor so they stay readable at range. The streak collapses into the impact point after the shell stops, and ricochets flicker while tumbling. Length, color, width and fade time are set in `GAME_CONFIG.tracers`.
- Muzzle flashes, armor impacts, HE bursts and tank explosions briefly light nearby hulls and ground through a fixed pool of four point lights, so no materials recompile. The lights sit a metre or more off the struck surface at modest intensity, so a hit warms the hull instead of gilding it.
- Ground strikes throw a column of earth and a low dust skirt. HE adds a faint blast ring and fireball. Penetrations leave a cooling ember at the hole with smoke leaking out, and a muzzle blast lifts dust off the ground when the barrel is low.
- Debris is lit, opaque, flat-shaded clods and fragments that tumble, land on the terrain and shrink away. Thrown earth and smoke lighten toward sunlit dust and pale grey as they spread, so thin veils do not read blue against the sky.
- Armour-hit flashes and sparks are physically sized and depth-tested; a minimum on-screen size keeps distant hits visible, dimmed as they are enlarged.
- A tank explosion is a short detonation flash, a rolling fireball of hot gas that cools from white through orange to dull red over about a second, black smoke boiling out of it, and a column of plume puffs released in a stream that rise and drift downwind. Effects can schedule delayed sub-particles for such sequences.
- Terrain impacts are resolved onto the surface with the local terrain normal. Each one leaves a crater decal that fades out (`GAME_CONFIG.impactDecals`): brown churned earth for AP, black scorch for HE.

## Performance And Rendering

- The battlefield uses a shared analytic sky and sun direction, procedural clouds, baked sky reflections, and a camera-following 4096px directional shadow map stabilized in light space.
- Half-resolution N8AO adds contact occlusion; restrained HDR bloom, ACES output and SMAA run before the HTML HUD. Tactical map mode bypasses these passes and ground cover.
- Terrain uses locally vendored CC0 Poly Haven albedo, OpenGL normal and roughness maps, with biome tinting, two detail scales and anisotropic filtering.
- Instanced ground cover uses tapered blades, root-to-tip colour, wind and distance fade; wind respects reduced-motion preferences. Blade normals point up on both faces, so no blade renders black from behind.
- Procedural armor and masonry shading adds surface variation without requiring UV coordinates on parametric models. Tree foliage uses alpha clipping compatible with offscreen post-processing.
- `TreeRenderer` uses `InstancedMesh` for trunks and canopy geometry. Crowns are clouds of small camera-facing leaf cards shaded with one enclosing crown shape (`rendering/foliageCards.ts`), so they read as solid, lit masses instead of crossed planes. Broadleaf crowns have offset lobes; spruce whorls stay upright. Crowns spread wider in woods and rows, where the canopy closes. Shadows use matching billboard depth materials.
- Woods and tree rows carry scrub and young spruce (`Understory` in `TreeRenderer.tsx`, planned by `rendering/woodland.ts`), scenery only and below a commander's eye line. Under the woods the grass gives way to leaf litter and moss from a blurred woodland mask; rows and lone trees get a narrower strip and a small shaded patch.
- Particle rendering is pooled into a fixed set of shared `Points` and `InstancedMesh` batches instead of one draw call per effect. Tracers and crater decals each render as a single instanced draw.
- Smoke, dust and thrown earth use a procedural four-variant puff atlas, are shaded as spheres against the sun direction, fade into the distance fog and draw back to front. Flames and fireballs use the same atlas additively; muzzle flashes use a rayed flash texture. Propellant smoke lingers for 2-3 s, HE throws a continuous earth fountain, and tank explosions rise as a fireball under a mushrooming column.
- Battlefield tanks draw each slot (hull, both tracks, turret, gun) as one merged mesh per material class, with paint variation baked into vertex colours and materials shared across every tank. Parts under 0.12 m drop out beyond an FOV-normalised 160 m, so zoomed sights keep full detail. The tank select screen, editor and calibration pages still render the named part tree.
- Buildings are baked into one world-space batch per material.
- Line-of-sight spotting runs every `GAME_CONFIG.ai.spottingIntervalMs` (100 ms) against a cached copy of the rendered terrain mesh, which the terrain mesh and ground cover also read.
- The battlefield uses a period colour-film look: a display-space colour grade, hazy sky, weak neutral fill light, straw-olive grass, desaturated dirt roads, and historical paint per vehicle (Olive Drab, Dunkelgrau, Dunkelgelb, 4BO green).
- German tanks have selectable historical camouflage (`src/tanks/core/camouflage.ts`, listed per tank in `appearance.camouflage`), picked on the tank select screen and per unit in the order of battle and shown in both previews. Patterns are procedural in slot space with a per-vehicle seed and cost one extra material class per scheme in use.
- `docs/perf/bench.mjs` measures battlefield FPS, p95 frame time, draw calls and triangles across fixed scenarios; `docs/perf/merge-qa.html` diffs merged against authored tanks.

### Layered terrain surfaces
- Grass, dry soil and gravel use local CC0 albedo/normal maps and MIT stochastic hex tiling.
- Signed road distance masks provide smooth diagonal edges independently of terrain vertex spacing; rotated farmland and building yards blend exposed soil.
- Ground and grass are matte, with macro vegetation variation, distance-faded normals and 12,321 nine-blade grass instances around the camera.
- Focused terrain mask tests cover diagonal edges, crossings, degenerate roads, rotated farmland and regeneration.
