## ADDED Requirements

### Requirement: Screen-center designation resolves to a concrete world target
The aiming system SHALL resolve the active screen-center viewpoint ray into a designated aim target point in world space rather than treating player designation as direction-only alignment.

#### Scenario: Viewpoint intersects a tank
- **WHEN** the player centers the viewpoint on a tank that is visible along the screen-center ray
- **THEN** the designated aim target resolves to the nearest valid hit on that tank instead of passing through to terrain behind it

#### Scenario: Viewpoint intersects multiple world objects
- **WHEN** the screen-center ray intersects more than one valid world object
- **THEN** the designated aim target resolves to the nearest valid hit among tanks, buildings, trees, and terrain

#### Scenario: Viewpoint intersects nothing nearby
- **WHEN** the screen-center ray does not hit a valid world object within the configured aiming range
- **THEN** the system resolves a stable fallback point along that ray so designation remains continuous

### Requirement: Third-person right-click aiming follows the designated target
While the player holds right click in third-person view, the aiming system SHALL drive the player gun sight toward the designated aim target point so the target under the screen center and the gun-aim designation refer to the same world point, subject to turret and elevation limits.

#### Scenario: Designating terrain in third-person view
- **WHEN** the player holds right click while the screen center points at terrain
- **THEN** the gun-aim designation moves toward that terrain point instead of preserving an offset caused by camera-to-gun parallax

#### Scenario: Designating a tank in third-person view
- **WHEN** the player holds right click while the screen center points at an enemy or allied tank
- **THEN** the gun-aim designation moves toward the tank hit point selected by the designated aim target resolver

#### Scenario: Target exceeds mechanical limits
- **WHEN** the designated aim target requires more traverse or elevation than the current tank can achieve
- **THEN** the aiming system preserves that designated target as player intent while moving the turret and gun to the closest reachable aiming state

### Requirement: Aim-point support visuals reflect the designated target
Any player-facing aim-point support visual SHALL represent the same designated aim target semantics used by viewpoint designation and third-person right-click aiming.

#### Scenario: Rendering an aim marker over a tank
- **WHEN** the designated aim target resolves to a tank hit point
- **THEN** the support visual appears on that tank hit point rather than on terrain behind it

#### Scenario: Rendering an aim marker over empty sky
- **WHEN** the designated aim target is using the fallback ray point because no world object was hit
- **THEN** the support visual remains stable on the fallback target instead of disappearing or snapping to unrelated terrain
