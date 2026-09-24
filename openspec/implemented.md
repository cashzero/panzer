# Implemented Features

Completed roadmap items are documented here.

## Core Gameplay And Controls

- Gunner view toggles with `V` or mouse middle button.
- Gunner view supports range calibration with `PageUp` and `PageDown`.
- Gunner view supports multi-step zoom control.
- Gunner sight zeroing keeps the reticle's aim point as the calibrated point of impact for the selected distance, with the current zero shown in the HUD.
- The gunner's sight (`GunnerSight.tsx`) is a round eyepiece with the reticle of the player's nation, etched black over a pale halo so it reads on sky and foliage alike: German tanks get the Turmzielfernrohr's seven triangles under a range ring (Pzgr. or Sprgr., in hectometres) that turns until the set range stands under the pointer; American tanks the M70 cross with its 30-0-30 deflection scale; the T-34 an inverted-V aim mark with lead chevrons beside a range scale (БР or ОФ) whose pointer slides to the set range. Magnification, range set, round and velocity, and penetration at that range sit on a HUD plate beside the eyepiece.
- The player tank update loop is split into focused modules for input, firing, turret aiming, aim point calculation, camera placement, and tank physics.
- Third-person right-click resolves a designated target from the screen-center ray across tanks, buildings, trees, terrain, and a stable long-range fallback.
- Player right-click target pursuit no longer stops short on a coarse deadzone; the turret and sight keep converging toward the designated target while still respecting traverse and elevation speed limits.
- GunAimPoint reflects the gun's current resolved aim point rather than mirroring the third-person viewpoint target.
- The player hull is driven through forward speed and yaw rate rather than each track on its own. Yaw rate builds and settles at the tank's rotational inertia and never exceeds its turn-rate limit, so releasing the steering key stops the turn within a fraction of a second; turning under power costs some speed, fast turns are broader, and a stationary pivot is slower than a low-speed turn. With a track thrown the hull only creeps round the dead side.
- The third-person camera follows the hull height through a short ease, so suspension bounce and terrain snapping do not shake the view, and it keeps clear of the ground when looking up.
- In gunner view the mouse free-look stays on the sight line unless right-click is held, so the next right-click or return to third-person does not swing to a direction drifted off-screen. Gunner zoom steps ease rather than snap.
- An order-of-battle editor lets the player configure allies, enemies, map size, and world seed before deployment.

## Vehicles, Weapons, And Combat

- Eight selectable tank types are currently registered with per-tank armor and weapon data: Sherman, Sherman A2 (76), Tiger I, Panzer III, Panzer IV, Panzer II, T-34, and the M10 GMC tank destroyer, whose open-topped turret has no roof plate, so plunging hits reach its walls or hull roof.
- Tank hulls are scaled to more realistic proportions relative to their turrets.
- Ammo cycling with `R` supports AP by default plus APC and-or HE when the selected tank carries them.
- Automatic weapons support magazine-based rapid fire for autocannon-equipped vehicles.
- Per-gun dispersion applies weapon-specific yaw and pitch spread to both player and enemy fire.
- Turret traverse rates follow each vehicle's historical 360° time: hydraulic Shermans 15 s, electric T-34 14 s and Panzer IV 22.5 s, the engine-driven Tiger I about 45 s, and the hand-cranked Panzer II, Panzer III and M10 about 75, 90 and 120 s. Arrow-key aiming still starts from a capped fine-adjustment speed, so fast powered traverses lay precisely on a tap.
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
- Trees are placed from the world seed as orchards, field-edge treelines, roadside avenues, lone trees (mostly on open land), copses and forest zones, with collision, health, and knockdown state. Tree ray and proximity queries go through a uniform grid (`treeIndex.ts`).
- Field boundaries are planned once per world (`fieldBoundaries.ts`): each edge gets a treeline, a hedge or stays open. Neighbouring parcels share one boundary across the lane between them; pasture and orchards are hedged more often than arable land. Hedges are continuous lofted cores dressed with camera-facing leaf cards down to the ground on both faces, tinted per card and shaded darker toward the base; the core is kept dark so it reads as the shade between leaves. Each hedge is kept one of three ways: low and square-topped with fine leaves, grown out, or run up into a rough wall about 2.6 m high, and its height and width swell and dip along its length. Hedges are visual only, like the telegraph poles and wires along the longest roads (`rendering/WorldDressing.tsx`). Wires fade with the pixels a real wire would cover, so they read along the road and are gone a couple of hundred metres out instead of drawing hard strokes across the horizon.
- Beyond the map edge, a vertex-coloured skirt meets the terrain edge and rolls into low hills with distant woods (`rendering/HorizonSkirt.tsx`), all visual only.
- Buildings (`rendering/ruralArchitecture.ts`) carry a settlement style (`BuildingStyle`: timber, stone or brick walls; tile, slate or thatch roof; shutter colour). Half-timbering is close-studded oak with rails and corner braces on lime render, carried up the gable; stone has dressed quoins, brick has stone bands. Roofs of about 50 degrees have real thickness, eaves and verges, ridge capping and gable-end chimneys. Long houses have dormers; two-storey houses a first-floor row of windows; barns ledged and braced cart doors, pitching holes and ventilation slits; granges two cart doors and stepped buttresses.
- Brick, ashlar, rubble, clay tile, slate and thatch carry procedural coursing (`rendering/masonryPatterns.ts`) in a frame taken from the world-space surface, so courses stay level on walls and run across roof slopes: running-bond brick with lime mortar and patchy firing, ashlar courses, Voronoi rubble, tile and slate courses with shadowed lower edges, combed thatch. Mortar joints are box-filtered over the pixel footprint, so thin joints grey into their average share of the wall rather than beating into moiré arcs, and each pattern fades to its average before its courses shrink to a few pixels.
- Farm courts and village gardens (`FarmYard` in `landLayout.ts`, dressed by `rendering/farmYards.ts`): court walls 1.9 m high with coping stop where they meet a building and open onto the road through a gateway with capped piers and one gate leaf swung open. Courts hold a covered well, haystack, manure heap, cart and woodpile; gardens have a gravel path between raised beds planted in rows, a bean row on canes, currant bushes along the back wall, and paling fences in timber country. Gardens keep 5 m clear of any road, and no grass grows in courts, gardens or on building pads. Yards are beaten earth in the terrain splat and track effects, keep trees and fields out, and are visual only.
- Grass is procedural blades after the Ghost of Tsushima technique, ported from SimonDev's Quick_Grass (MIT) in `rendering/GrassField.tsx`: about 30 blades/m² within 20 m and wider low-detail blades out to about 95 m, where they shrink into the ground. Blades sit exactly on the rendered terrain and take colour, height and density from the ground's pasture grading and its road, crop, yard and woodland masks. Clumps share a lean and height; gusts sweep the field; tanks flatten the grass around them.
- Tank-tree collisions support slow pushing and high-speed knockdown.
- Projectiles damage trees for 50 HP per hit.
- Rural building clusters spawn along road junctions and roadsides as indestructible battlefield obstacles.
- Buildings block tank movement and receive projectile wall and roof impacts.
- Layout (`landLayout.ts`, `landUse.ts`): a seeded low-frequency field splits the map into farmland, open grazing and forest zones. Villages are streets of houses, barns and at most one grange down each road out of a junction; farmsteads (farmhouse, a barn at right angles and sometimes a rear barn) stand every 330-560 m along open road. All buildings are square to their road. Parcels are laid in up to three tiers back from every road, then grown out as a patchwork squared to the nearest road; they stay off roads, farmyards, woods and ground with more than 4 m of relief. Orchards stand behind farmhouses and on village edges, planted in 8 m rows.
- Farmland plots tint the terrain and keep trees out. Each plot is pasture, an orchard, ploughed, stubble or hay: furrows ridged along the plot's long side, pale stubble in reaper swaths, or tall pale hay. Grass follows the crop, and ploughed plots count as mud for track effects.
- Pasture colour varies between lush green and sun-dried straw over tens of metres, with worn bare patches, green verges beside the lanes and faint animal tracks. Past about 60 m, field-sized blotches keep the middle distance from settling into one tone. Grass blades share the ground's pasture grading, and the soil between blades near the camera lies in their shade.

## UI, Map, And Presentation

- Tank selection includes a rotating 3D preview, stat bars, description, nationality, year, and deploy flow.
- Armor plate hover tooltips in tank selection show plate name, zone, thickness, and slope, while highlighting the hovered plate and pausing auto-rotation.
- Map mode provides a tactical top-down view with pan, zoom, marker rendering, and state reset on exit. It shares the order-of-battle look: armour symbols (blue own force with a filled track for the player, red spotted enemies, grey and crossed out when destroyed, a tick for facing, a brass halo on the selected ally), dashed move orders ending in an arrowhead, the A-H by 1-8 grid with column letters along the top and row numbers down the left of the view (they follow the view, so a zoomed-in map still shows where it is), ground beyond the battlefield dimmed, and a scale bar that always fits its panel. A narrow 22 degree camera keeps the view nearly flat; wheel steps zoom by a constant factor, and fully zoomed out the whole battlefield fits the screen. The orders panel lists your allies with their current task (following, holding, moving to a grid square, knocked out) and gives movement, fire and engagement orders.
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
- Half-resolution N8AO adds contact occlusion; restrained HDR bloom, ACES output and SMAA run before the HTML HUD. Tactical map mode bypasses these passes and the grass.
- Terrain uses locally vendored CC0 Poly Haven albedo, OpenGL normal and roughness maps, with biome tinting, two detail scales and anisotropic filtering.
- Grass wind respects reduced-motion preferences.
- Procedural armor and masonry shading adds surface variation without requiring UV coordinates on parametric models. Tree foliage uses alpha clipping compatible with offscreen post-processing.
- `TreeRenderer` uses `InstancedMesh` for trunks and canopy geometry. Crowns are clouds of small camera-facing leaf cards shaded with one enclosing crown shape (`rendering/foliageCards.ts`), so they read as solid, lit masses instead of crossed planes. Broadleaf crowns have offset lobes; spruce whorls stay upright. Crowns spread wider in woods and rows, where the canopy closes. Shadows use matching billboard depth materials.
- Woods and tree rows carry scrub and young spruce (`Understory` in `TreeRenderer.tsx`, planned by `rendering/woodland.ts`), scenery only and below a commander's eye line. Under the woods the grass gives way to leaf litter and moss from a blurred woodland mask; rows and lone trees get a narrower strip and a small shaded patch.
- Particle rendering is pooled into a fixed set of shared `Points` and `InstancedMesh` batches instead of one draw call per effect. Tracers and crater decals each render as a single instanced draw.
- Smoke, dust and thrown earth use a procedural four-variant puff atlas, are shaded as spheres against the sun direction, fade into the distance fog and draw back to front. Flames and fireballs use the same atlas additively; muzzle flashes use a rayed flash texture. Propellant smoke lingers for 2-3 s, HE throws a continuous earth fountain, and tank explosions rise as a fireball ten metres and more across under a mushrooming column. The gun flash burns on out of the bore as a forward tongue of flame. Sprite sizes come from the real projection, so effects keep their size relative to the scene at gunner zoom and at any resolution; flashes and flame a few pixels across are drawn up to 3.5 times larger, a gain that fades out as they grow, so a gun firing or a tank brewing up several hundred metres away still reads.
- The in-battle HUD shares that look: the vehicle plate (name, hull scale in tenths, loaded round, reload state), the driver's speed, gear, engine and track readouts, and the bearing strip are painted-steel plates with chalk text and a brass edge.
- The pre-battle screens use a command-post look: painted-steel panels, stencilled titles (Big Shoulders Stencil) and a condensed DIN-like text face (Barlow Semi Condensed), both vendored under `public/assets/fonts`. Vehicle figures sit on a brass data plate (front armour, penetration, road speed in km/h, reload in seconds, hit points), each on a scale against the best in the catalogue. Units are drawn with the period armour symbol, blue for your force and red for the enemy, in the rosters and on the planning map. The planning map is square, gridded A-H by 1-8, lit flat and shows the woods.
- The tank select and order-of-battle previews share a neutral studio (`screens/PreviewStudio.tsx`): a room environment for reflections, warm key, cool fill and rim lights, a concrete floor fading into a dark backdrop, and a soft occlusion pad under the hull.
- Battlefield tanks draw each slot (hull, both tracks, turret, gun) as one merged mesh per material class, with paint variation baked into vertex colours and materials shared across every tank. Parts under 0.12 m drop out beyond an FOV-normalised 160 m, so zoomed sights keep full detail. The tank select screen, editor and calibration pages still render the named part tree.
- Buildings are baked into one world-space batch per material.
- Line-of-sight spotting runs every `GAME_CONFIG.ai.spottingIntervalMs` (100 ms) against a cached copy of the rendered terrain mesh, which the terrain mesh and grass also read.
- Looking toward the sun stays readable: the sky glow is compressed onto a soft shoulder below white, so the haze near the sun keeps its gradient (also at gunner zoom) and never blooms over the scene, and grass against the sun lights at its tips rather than washing out.
- The battlefield uses a period colour-film look: a display-space colour grade, hazy sky, weak neutral fill light, straw-olive grass, desaturated dirt roads, and historical paint per vehicle (Olive Drab, Dunkelgrau, Dunkelgelb, 4BO green).
- German tanks have selectable historical camouflage (`src/tanks/core/camouflage.ts`, listed per tank in `appearance.camouflage`), picked on the tank select screen and per unit in the order of battle and shown in both previews. Patterns are procedural in slot space with a per-vehicle seed and cost one extra material class per scheme in use. Paint chips are always darker than the paint they break through, so grey tanks no longer show pale specks.
- Tiger I and Panzer IV wear Zimmerit under their Dunkelgelb schemes (`rendering/zimmerit.ts`): combed columns of horizontal ridges about 2.8 cm apart on upright and sloped armour, as an analytic normal perturbation in the plate's tangent frame with groove occlusion and broken patches. No texture or geometry is added; at 4K on a GTX 1050 Ti the frame time is unchanged.
- `docs/perf/bench.mjs` measures battlefield FPS, p95 frame time, draw calls and triangles across fixed scenarios; `docs/perf/merge-qa.html` diffs merged against authored tanks.

### Layered terrain surfaces
- Grass, dry soil and gravel use local CC0 albedo/normal maps and MIT stochastic hex tiling.
- Signed road distance masks provide smooth diagonal edges independently of terrain vertex spacing; rotated farmland and building yards blend exposed soil.
- The ground is matte, with macro vegetation variation and distance-faded normals.
- Focused terrain mask tests cover diagonal edges, crossings, degenerate roads, rotated farmland and regeneration.
