## ADDED Requirements

### Requirement: AI movement steers around short-range battlefield obstacles before contact
The system SHALL let AI-controlled tanks evaluate short-range candidate headings and prefer a clear steering lane over driving directly into a standing tree, building, or nearby tank when moving toward a target, waypoint, or follow position.

#### Scenario: Enemy avoids a tree blocking its advance
- **WHEN** an enemy tank tries to advance toward an eligible target and a standing tree blocks its current forward lane within the configured avoidance distance
- **THEN** the movement system selects a clearer candidate heading instead of keeping the direct heading into the tree

#### Scenario: Ally avoids another tank while moving to a waypoint
- **WHEN** an allied tank moves toward a waypoint and another non-destroyed tank occupies the direct lane inside the configured avoidance distance
- **THEN** the movement system prefers a nearby clear heading that avoids immediate overlap with that tank

#### Scenario: AI resumes direct movement when the lane clears
- **WHEN** the direct path toward the current movement objective is no longer blocked inside the configured avoidance distance
- **THEN** the movement system may resume the more direct heading instead of staying locked to a previous detour angle

### Requirement: Shared path-clearance checks use obstacle state relevant to movement
The system SHALL provide a shared path-clearance helper for AI movement that treats standing trees, blocking buildings, and non-destroyed tanks as movement obstacles while ignoring the moving tank itself and fallen trees.

#### Scenario: Fallen tree does not block path clearance
- **WHEN** a candidate AI heading intersects only a tree that has already fallen
- **THEN** that tree is not treated as a blocking obstacle by the path-clearance helper

#### Scenario: Moving tank is excluded from obstacle checks
- **WHEN** the path-clearance helper evaluates candidate headings for a specific AI tank
- **THEN** the helper excludes that tank's own collision volume from obstacle detection

### Requirement: Obstacle avoidance behavior is configurable
The system SHALL expose avoidance tuning through configuration so steering behavior can be balanced without rewriting AI movement logic.

#### Scenario: Tuning probe distance changes avoidance timing
- **WHEN** the configured avoidance lookahead distance is increased or decreased
- **THEN** AI tanks begin steering around obstacles earlier or later in the approach accordingly

#### Scenario: Tuning probe spread changes steering search width
- **WHEN** the configured candidate heading spread or sample count is adjusted
- **THEN** the set of directions considered for obstacle avoidance changes without modifying the AI update loops
