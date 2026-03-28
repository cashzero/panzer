# Specification

## Visual Style

This app is a **WW2 tank battle simulator**. All visual design — UI, HUD, color palette, typography, particle effects, terrain, and environmental art — should adopt a WW2 aesthetic (military olive drab, aged/weathered metal, period-appropriate gauges and instruments, wartime maps and iconography).

## Aiming System

There are three distinct aim points in the game:

1. **Gunner Sight Aim Point**:
   - Controlled by the Arrow Keys.
   - The Gunner Sight is physically locked to the turret. Moving the Gunner Sight with arrow keys directly rotates the turret (yaw) and the gun (pitch).
   - Arrow-key manual aiming ramps from a slow fine-adjustment speed to full traverse/elevation speed while the key is held.

2. **Gun Aim Point**:
   - Identical to the Gunner Sight Aim Point in terms of yaw.
   - The only difference is an elevation offset determined by the calibration distance.
   - Therefore, using the arrow keys directly moves the gun aim point, just with a vertical offset applied.
   - The calibration distance is controlled by PageUp / PageDown and the Mouse Wheel.

3. **Viewpoint**:
   - Controlled by the Mouse (Free look camera).
   - Holding Right Click makes the Gunner Sight (and thus the turret) align with the Viewpoint.

## Armor & Penetration Model

The game uses a **multi-plate oriented bounding box (OBB)** collision system. Each tank is composed of ~20 armor plates that match the visual geometry, each with its own armor thickness in mm.

### Armor Zones

**Hull:**
- **Upper Glacis** (front slope) — thick angled plate (player 120mm / enemy 95mm), effective thickness increases with LOS angle
- **Lower Glacis** (front lower) — thinner, less angled (player 80mm / enemy 60mm)
- **Hull Sides** — moderate armor (player 50mm / enemy 40mm)
- **Hull Rear** — thin armor (player 30mm / enemy 20mm)
- **Hull Roof / Engine Deck** — very thin (player 15mm / enemy 12mm), vulnerable to plunging fire
- **Side Skirts** — spaced armor panels (player 10mm / enemy 8mm), protects tracks from some angles

**Turret:**
- **Turret Front** — heavy armor (player 120mm / enemy 100mm)
- **Turret Cheeks** (left/right angled faces) — heaviest turret armor (player 140mm / enemy 110mm)
- **Turret Sides** — moderate (player 60mm / enemy 50mm)
- **Turret Bustle** (rear) — thin (player 40mm / enemy 30mm)
- **Turret Roof** — very thin (player 20mm / enemy 15mm)
- **Mantlet** (gun shield) — thickest armor on the tank (player 220mm / enemy 180mm)

**Tracks:**
- Left and right tracks are separate hit zones with their own HP (player 150 / enemy 100)
- Track armor: 20mm (easily penetrated by AP)
- Track hits do NOT damage main tank HP

### Penetration Calculation

1. **Impact angle**: angle between incoming round and surface normal
2. **Auto-ricochet**: rounds at >70° impact angle bounce automatically
3. **Effective armor**: `baseArmor / cos(impactAngle)` — angled plates appear thicker
4. **Penetration curve**: shell penetration is now evaluated at hit distance. If ammo defines `historicalPenetration.points`, the game uses that curve (linear interpolation, generated falloff beyond the sampled range). Otherwise it auto-generates a monotonic curve from muzzle velocity, caliber, and the ammo's 100m reference penetration.
5. **Penetration variance**: ±10% randomization on the distance-adjusted penetration value
6. **Penetration check**: if `actualPen > effectiveArmor` → penetration
7. **Post-pen damage**: AP scales 0.5×–1.5× by overmatch ratio; HE does full damage
8. **Non-pen HE**: 20% splash damage on armor (not on tracks)

### Track Damage

- Each track has independent HP
- When a track is destroyed:
  - That track's speed is locked to 0
  - Tank can only pivot toward the dead track side
  - Both tracks destroyed → fully immobilized
- Visual: destroyed track turns dark red
- HUD shows track HP bars

## Implemented Features

Completed TODO items are removed from `todo.md` and documented here.

- Press V / mouse middle button to toggle gunner view (first person with gunner sight)
- In gunner sight, use PageUp/PageDown to calibrate distance
- Tank moving dust effect
- Layered player engine audio backend in `src/audio.ts` with lazy Web Audio unlock, 3D listener sync, and generated spatial shot/impact/explosion transients
- Enemy tank movement AI (approach, retreat, terrain-following)
- Procedural terrain with sine wave height formula (flattened center)
- Tank-tank collision model (circle-based XZ-plane collision preventing tanks from overlapping)
- PlayerController refactored into extracted modules: `useInput.ts` (input handling), `firing.ts` (fire logic), `turretAiming.ts` (turret/gun aiming), `aimPoint.ts` (aim point calculation), `CameraController.ts` (camera placement), `tankPhysics.ts` (movement, terrain, sway, engine)
- Tank hull scaled to realistic proportions relative to turrets
- Low-speed track-level dust particles for visible tank movement
- Road network (N-S and E-W crossroads) with height blending and 1.15× speed bonus
- Tree system: 300 trees with jittered grid placement, collision, health, and knockdown physics
- Enemy AI aim dispersion with per-enemy random offset drift
- Enemy AI steady-aim zeroing (8s stationary → dispersion reduced to 15%)
- Three playable tank types: Sherman (player), Tiger I, Panzer III (enemies) with per-tank armor profiles
- 11 particle effect types (fire, hit_penetrate, hit_bounce, hit_ground, he_hit_ground, he_hit_penetrate, tank_explosion, dust, dust_low, tree_hit, burning_smoke)
- AP and HE ammunition toggle (R key) with distinct ballistic properties
- Gun sway system with 4 vibration layers (base harmonic, terrain, inertial, centrifugal)
- Body rock oscillation (pitch, roll, vertical bounce) at speed
- Engine RPM/gear simulation (idle 800 → max 2800 RPM, gears N/D1-D3/R)
- Tank-tree collision: low speed push, high speed knockdown with falling animation
- Projectile-tree collision with damage (50 HP per hit)
- Tank selection screen: 3D rotating preview, stat bars (HP, armor, speed, penetration, reload), tank description/nationality/year, deploy button transitions to gameplay
- Armor plate hover tooltips on tank selection 3D preview: invisible OBB meshes per plate with pointer events, shows plate name/zone/thickness/slope angle, highlights hovered plate, pauses auto-rotation while hovering
- Per-gun dispersion: each weapon has an inherent `dispersion` (radians) applied as random yaw/pitch spread at fire time. Larger high-velocity guns (Tiger 88mm, 0.003 rad) are tightest; autocannons (Panzer II 20mm, 0.012 rad) are widest. Applies to both player and enemy fire.
- GunAimPoint (yellow circle) uses terrain raycast to find the actual world hit point where the aim ray intersects terrain, ensuring consistent screen position across third-person and gunner views regardless of camera position or FOV. Binary-search refinement (10 iterations) on 2m stepping ray for precision.
- Instanced rendering: TreeRenderer uses InstancedMesh (4 meshes: trunks, deciduous canopy, 2× conifer cones). Particles converted from per-effect React components to pooled Points (3 pools: additive+dust, additive+spark, normal+smoke) + InstancedMesh (debris boxes) with custom shaders — reduces draw calls from hundreds to 4.
- Ally command modes: map-selected allies now use separate movement and fire-control orders. Base movement stance is `follow` or `hold`; issuing a waypoint temporarily switches the ally into `move` until the waypoint is cleared or reached, then it returns to its base stance. Fire control supports `hold-fire` (track targets without shooting), `return-fire` (engage only when alerted or threatened nearby), and `fire-at-will`. Map mode shows the active orders and provides waypoint assignment and cancellation UI.
- Penetration now falls off with range. Ammo can define `historicalPenetration` sample points in `tank.json`; otherwise the game auto-generates a curve from muzzle velocity and caliber, with UI stats normalized to 100m penetration.
- World layout now generates a seeded road network per map size, with terrain flattening and coloring driven by procedural roads instead of one fixed crossroads layout.
- Rural building clusters now spawn along road junctions and roadsides as indestructible battlefield obstacles; tanks collide with them and shells impact their walls and roofs.

## Map Mode

Toggle with **M** key. Provides a top-down tactical view of the battlefield.

- **Pan**: WASD keys or left-click drag to move the camera around
- **Zoom**: Mouse scroll wheel to zoom in/out (range: 30–400 units height)
- **Tank markers**: 3D tank models are replaced with flat colored triangle icons indicating hull heading direction
  - Green triangle with white ring = player
  - Red triangle = enemy
  - Gray triangle with red X = destroyed
- Tank physics are paused while in map mode; enemy AI continues running
- All pan/zoom state resets when exiting map mode
