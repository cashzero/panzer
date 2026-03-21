# Aiming System Specification

There are three distinct aim points in the game:

1. **Gunner Sight Aim Point**:
   - Controlled by the Arrow Keys.
   - The Gunner Sight is physically locked to the turret. Moving the Gunner Sight with arrow keys directly rotates the turret (yaw) and the gun (pitch).

2. **Gun Aim Point**:
   - Identical to the Gunner Sight Aim Point in terms of yaw.
   - The only difference is an elevation offset determined by the calibration distance.
   - Therefore, using the arrow keys directly moves the gun aim point, just with a vertical offset applied.
   - The calibration distance is controlled by PageUp / PageDown and the Mouse Wheel.

3. **Viewpoint**:
   - Controlled by the Mouse (Free look camera).
   - Holding Right Click makes the Gunner Sight (and thus the turret) align with the Viewpoint.
