# Product Specification

## Visual Style

This app is a WW2 tank battle simulator. All visual design - UI, HUD, color palette, typography, particle effects, terrain, and environmental art - should adopt a WW2 aesthetic (military olive drab, aged/weathered metal, period-appropriate gauges and instruments, wartime maps and iconography).

## Core Loop

- The player selects a tank, enters the battlefield, maneuvers in real time, engages enemy armor, and survives through positioning, gunnery, and target selection.
- Combat should emphasize readable armor interactions, ballistic drop, and terrain-aware movement over arcade-style instant lethality.
- Tactical awareness should come from direct sightlines, the HUD, and map mode rather than omniscient battlefield information.

## Movement And Steering

- Tank steering should feel like a heavy tracked vehicle rather than a neutral-spin arcade vehicle.
- Stationary pivot turning remains available for alignment, but it is slower and less effective than low-speed forward steering.
- Low-speed forward motion is the most effective steering regime for normal driving.
- Steering while moving may trade a small amount of speed for a tighter line, preserving momentum without excessive understeer.
- High-speed steering should remain broad and deliberate rather than snapping into tight turns.
- Per-tank mobility tuning should preserve handling differences between lighter, medium, and heavy vehicles while following the same steering behavior contract.

## Aiming System

There are three distinct aim points in the game:

1. Gunner Sight Aim Point
   - Controlled by the Arrow Keys.
   - The Gunner Sight is physically locked to the turret. Moving the Gunner Sight with arrow keys directly rotates the turret (yaw) and the gun (pitch).
   - Arrow-key manual aiming ramps from a slow fine-adjustment speed to full traverse/elevation speed while the key is held.

2. Gun Aim Point
   - Identical to the Gunner Sight Aim Point in terms of yaw.
   - The only difference is an elevation offset determined by the calibration distance.
   - The center dot in gunner view is the active calibrated point of impact for the selected range.
   - Therefore, using the arrow keys directly moves the gun aim point, while the selected calibration distance changes where the shell is zeroed relative to that sight line.
   - The calibration distance is controlled by PageUp / PageDown.

3. Viewpoint
   - Controlled by the Mouse (free-look camera).
   - Holding Right Click resolves the screen center to a concrete world target point and makes the Gunner Sight (and thus the turret) pursue that designated target rather than only matching camera direction.
   - The designated target uses the nearest valid hit along the screen-center ray, including tanks, buildings, trees, and terrain, with a stable fallback point when nothing is hit.
   - Switching from third-person into gunner view preserves the same designated target semantics while calibration distance continues to control bore zero relative to the sight line.

## Armor And Penetration Model

The game uses a multi-plate oriented bounding box (OBB) collision system. Each tank is composed of about 20 armor plates that match the visual geometry, each with its own armor thickness in mm.

### Armor Zones

Hull:
- Upper Glacis (front slope) - thick angled plate (player 120mm / enemy 95mm), effective thickness increases with LOS angle
- Lower Glacis (front lower) - thinner, less angled (player 80mm / enemy 60mm)
- Hull Sides - moderate armor (player 50mm / enemy 40mm)
- Hull Rear - thin armor (player 30mm / enemy 20mm)
- Hull Roof / Engine Deck - very thin (player 15mm / enemy 12mm), vulnerable to plunging fire
- Side Skirts - spaced armor panels (player 10mm / enemy 8mm), protects tracks from some angles

Turret:
- Turret Front - heavy armor (player 120mm / enemy 100mm)
- Turret Cheeks (left/right angled faces) - heaviest turret armor (player 140mm / enemy 110mm)
- Turret Sides - moderate (player 60mm / enemy 50mm)
- Turret Bustle (rear) - thin (player 40mm / enemy 30mm)
- Turret Roof - very thin (player 20mm / enemy 15mm)
- Mantlet (gun shield) - thickest armor on the tank (player 220mm / enemy 180mm)

Tracks:
- Left and right tracks are separate hit zones with their own HP (player 150 / enemy 100)
- Track armor: 20mm (easily penetrated by AP)
- Track hits do not damage main tank HP

### Penetration Calculation

1. Impact angle: angle between incoming round and surface normal
2. Auto-ricochet: rounds at more than 70 degrees impact angle bounce automatically
3. Effective armor: `baseArmor / cos(impactAngle)` - angled plates appear thicker
4. Penetration curve: shell penetration is evaluated at hit distance. If ammo defines `historicalPenetration.points`, the game uses that curve (linear interpolation, generated falloff beyond the sampled range). Otherwise it auto-generates a monotonic curve from muzzle velocity, caliber, and the ammo's 100m reference penetration.
5. Penetration variance: +/-10% randomization on the distance-adjusted penetration value
6. Penetration check: if `actualPen > effectiveArmor`, the round penetrates
7. Post-pen damage: AP scales 0.5x-1.5x by overmatch ratio; HE does full damage
8. Non-pen HE: 20% splash damage on armor (not on tracks)

### Track Damage

- Each track has independent HP
- When a track is destroyed:
  - That track's speed is locked to 0
  - Tank can only pivot toward the dead track side
  - Both tracks destroyed -> fully immobilized
  - A destroyed track can recover through time-based field repair while the tank remains stationary and out of active combat
- Visual: destroyed track turns dark red
- HUD reports which track is damaged rather than showing per-track HP bars

## HUD And UI

- The HUD should present only essential combat information during active play.
- Core HUD elements include vehicle health, damaged-track status, active ammunition type, calibration distance, and important combat messages.
- Gunner view should avoid redundant vehicle-status clutter that competes with the sight picture.
- Readability takes priority over decorative noise; information must remain legible during camera motion and effects.
- UI styling should reinforce the WW2 vehicle and instrument aesthetic rather than modern minimalist game UI patterns.

## Audio

- Engine audio should communicate throttle, load, and vehicle state rather than acting as a flat loop.
- Weapon audio should clearly distinguish firing, penetration, ricochet, ground impact, and explosion outcomes.
- Ambient battlefield audio should support atmosphere without masking nearby tactical cues.
- Audio feedback should help the player infer what just happened even when visibility is limited.

## World Generation

- Battlefield layout should be procedurally generated from a seed so maps can vary while remaining readable and traversable.
- Terrain should support open maneuvering, local cover, and elevation-driven sightlines.
- Roads should function as navigational landmarks and movement aids.
- Trees and buildings should shape lines of movement, cover, and projectile interruption.
- Environmental generation should preserve battlefield clarity; clutter should support tactics, not obscure them.

## Vehicles And Factions

- Each tank type should communicate a distinct battlefield role through armor profile, gun behavior, mobility, and silhouette.
- Vehicle differences should be grounded in plausible WW2-era tradeoffs rather than purely abstract balance.
- Tank definitions should expose enough structured data to support UI comparison, AI behavior tuning, and combat simulation.

## Camera Modes

- Third-person view is the default tactical driving camera.
- Gunner view acts as the precision aiming mode with a stronger focus on sight alignment and ranging.
- Map mode provides high-level battlefield awareness and command support.
- Camera transitions should preserve player orientation and avoid disorienting jumps.

## Map Mode

Toggle with `M`. Provides a top-down tactical view of the battlefield.

- Pan: `WASD` keys or left-click drag to move the camera around
- Zoom: Mouse scroll wheel to zoom in/out (range: 30-400 units height)
- Tank markers: 3D tank models are replaced with flat colored triangle icons indicating hull heading direction
  - Green triangle with white ring = player
  - Red triangle = enemy
  - Gray triangle with red X = destroyed
- Tank physics are paused while in map mode; enemy AI continues running
- All pan/zoom state resets when exiting map mode

## AI And Tactical Awareness

- Enemy AI should maneuver toward effective firing positions rather than only driving straight at the player.
- AI accuracy should reflect movement, dispersion, line of sight, and engagement conditions.
- Allied units should support player intent through simple command structures rather than full manual micromanagement.
- Tactical systems should reward concealment, flanking, and terrain usage over static trading.

## Effects And Feedback

- Effects should make ballistic outcomes readable: penetration, ricochet, ground strike, explosion, and movement state must feel visually distinct.
- Camera shake, particles, smoke, and dust should enhance impact without hiding core combat information.
- Visual feedback should stay consistent between third-person, gunner view, and map-driven command flow.
