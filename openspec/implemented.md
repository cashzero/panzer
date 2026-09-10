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

- Seven selectable tank types are currently registered with per-tank armor and weapon data: Sherman, Sherman A2 (76), Tiger I, Panzer III, Panzer IV, Panzer II, and T-34.
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

- Terrain is procedurally generated with a sine-wave height formula and a flattened center area.
- Road layout is generated from a seed per map size, with terrain blending and road-driven world coloring.
- Tree placement uses a jittered grid with collision, health, and knockdown state.
- Tank-tree collisions support slow pushing and high-speed knockdown.
- Projectiles damage trees for 50 HP per hit.
- Rural building clusters spawn along road junctions and roadsides as indestructible battlefield obstacles.
- Buildings block tank movement and receive projectile wall and roof impacts.
- Farmland plots generate around rural buildings, tint surrounding terrain, and suppress nearby tree placement.

## UI, Map, And Presentation

- Tank selection includes a rotating 3D preview, stat bars, description, nationality, year, and deploy flow.
- Armor plate hover tooltips in tank selection show plate name, zone, thickness, and slope, while highlighting the hovered plate and pausing auto-rotation.
- Map mode provides a tactical top-down view with pan, zoom, marker rendering, and state reset on exit.
- Track damage and repair are surfaced through damage-state HUD text and combat messages rather than per-track HP bars, and gunner view keeps that status block hidden.

## Audio And Effects

- Player engine audio uses a layered Web Audio backend with lazy unlock and 3D listener sync.
- Generated spatial transients cover shot, impact, and explosion playback.
- Tank movement produces low-speed track dust.
- Destroyed tanks emit persistent burning smoke.
- The particle system supports effects including `fire`, `hit_penetrate`, `hit_bounce`, `hit_ground`, `he_hit_ground`, `he_hit_penetrate`, `tank_explosion`, `dust`, `dust_low`, `tree_hit`, `burning_smoke`, `non_pen_impact`, and `ricochet_impact`.

## Performance And Rendering

- The battlefield uses a shared analytic sky and sun direction, procedural clouds, baked sky reflections, and a camera-following 4096px directional shadow map stabilized in light space.
- Half-resolution N8AO adds contact occlusion; restrained HDR bloom, ACES output and SMAA run before the HTML HUD. Tactical map mode bypasses these passes and ground cover.
- Terrain uses locally vendored CC0 Poly Haven albedo, OpenGL normal and roughness maps, with biome tinting, two detail scales and anisotropic filtering.
- Instanced ground cover uses tapered blades, root-to-tip colour, wind and distance fade; wind respects reduced-motion preferences.
- Procedural armor and masonry shading adds surface variation without requiring UV coordinates on parametric models. Tree foliage uses alpha clipping compatible with offscreen post-processing.
- `TreeRenderer` uses `InstancedMesh` for trunks and canopy geometry.
- Particle rendering is pooled into shared `Points` and `InstancedMesh` batches, reducing draw calls from hundreds to 4.

### Layered terrain surfaces
- Grass, dry soil and gravel use local CC0 albedo/normal maps and MIT stochastic hex tiling.
- Signed road distance masks provide smooth diagonal edges independently of terrain vertex spacing; rotated farmland and building yards blend exposed soil.
- Ground and grass are matte, with macro vegetation variation, distance-faded normals and 12,321 nine-blade grass instances around the camera.
- Focused terrain mask tests cover diagonal edges, crossings, degenerate roads, rotated farmland and regeneration.
