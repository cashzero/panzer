## MODIFIED Requirements

### Requirement: Supporting aiming views use the same calibration interpretation
The system SHALL keep aiming-related camera behavior, designated-target resolution, aim-point visualization, and related documentation consistent with the same calibration model used by the gunner sight and projectile firing. Entering gunner view SHALL preserve the current designated aim target as the sight-centered aiming reference when that target is mechanically reachable, rather than redefining the target from a contradictory terrain-only or direction-only rule.

#### Scenario: Aligning the gunner camera
- **WHEN** the player enters gunner view
- **THEN** the camera framing and related comments reflect the sight-line-centered calibration model rather than a bore-axis-centered one

#### Scenario: Switching from third-person designation into gunner view
- **WHEN** the player is designating a visible target in third-person view and switches into gunner view
- **THEN** the gunner sight continues to center that same designated aim target when the turret and gun can physically reach it

#### Scenario: Using aim-point debug or support visuals
- **WHEN** the game renders aim-point support visuals for the player
- **THEN** those visuals do not teach a contradictory interpretation of the selected calibration distance or of the currently designated target
