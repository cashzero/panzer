## ADDED Requirements

### Requirement: Center dot represents the calibrated point of impact
The system SHALL treat the gunner-view center dot as the active calibrated aiming reference. For the selected `calibrationDistance`, the player shot trajectory SHALL intersect the sight line at screen center when fired without additional holdover.

#### Scenario: Firing at the selected range
- **WHEN** the player is in gunner view, sets a calibration distance, and places the center dot on a target at that same distance
- **THEN** the fired shot intersects the sight line at the center-dot aiming point within the limits of weapon dispersion

#### Scenario: Changing calibration distance
- **WHEN** the player increases or decreases `calibrationDistance`
- **THEN** the system updates the ballistic zero used for gun elevation while preserving the center dot as the authoritative aiming reference

### Requirement: Gunner reticle semantics remain consistent with calibrated zero
The system SHALL present the gunner reticle, labels, and comments in a way that matches a center-zeroed sight. The HUD SHALL NOT instruct or imply that the screen center is the bore axis or that the highlighted distance tick replaces the center dot as the primary aiming point.

#### Scenario: Displaying the gunner overlay
- **WHEN** the gunner overlay is shown
- **THEN** the center dot remains the primary aiming reference presented to the player

#### Scenario: Showing auxiliary range markings
- **WHEN** the gunner overlay includes distance markings in addition to the center dot
- **THEN** those markings are displayed as secondary references that do not contradict the selected center-dot zero

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
