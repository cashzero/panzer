## ADDED Requirements

### Requirement: Tanks gain and lose spotted state through line-of-sight evaluation
The system SHALL determine whether opposing tanks are currently visible using battlefield line-of-sight checks rather than range alone, and SHALL convert that visibility into a spotted state using configurable reveal delay and contact persistence rules.

#### Scenario: Visible target becomes spotted after reveal delay
- **WHEN** an opposing tank remains visible without line-of-sight interruption for at least the configured reveal delay
- **THEN** the system marks that tank as spotted for the observing side

#### Scenario: Brief occlusion does not instantly remove contact
- **WHEN** a tank that was already spotted loses line of sight for less than the configured persistence window
- **THEN** the system keeps that tank in the spotted state until the persistence window expires

#### Scenario: Occluded target does not become spotted by distance alone
- **WHEN** an opposing tank is within spotting range but terrain, a standing tree, or a building blocks line of sight
- **THEN** the system does not mark that tank as spotted unless some unobstructed visibility path exists

### Requirement: AI target eligibility depends on spotting and line of sight
The system SHALL require AI-controlled tanks to use the spotting and line-of-sight rules when selecting and sustaining enemy targets, rather than allowing engagement from pure range checks through cover.

#### Scenario: AI does not acquire a target through terrain or vegetation
- **WHEN** an AI-controlled tank evaluates an enemy that is inside nominal engagement range but blocked by terrain, a standing tree, or a building
- **THEN** that enemy is not treated as an eligible target unless current spotting rules still allow temporary contact retention

#### Scenario: AI can continue a recent engagement through short contact memory
- **WHEN** an AI-controlled tank briefly loses line of sight to a target that was already spotted and engaged
- **THEN** the AI may continue treating that target as eligible only for the configured contact persistence window

### Requirement: Tactical map hides unspotted enemy positions
The system SHALL hide enemy positions from the tactical map until those enemies are spotted by the player's side, while preserving friendly-unit command usability.

#### Scenario: Unspotted enemy is hidden from map mode
- **WHEN** the player opens map mode while an enemy tank is not currently spotted and no contact persistence is active
- **THEN** the map does not render that enemy's marker

#### Scenario: Allied positions remain visible for command use
- **WHEN** the player opens map mode during active combat
- **THEN** the player tank and allied tank markers remain available regardless of enemy spotting state

### Requirement: Spotting behavior is configurable
The system SHALL expose spotting range, reveal delay, and persistence tuning through configuration so visibility pacing can be balanced without rewriting AI logic.

#### Scenario: Tuning spotting delay changes reveal timing
- **WHEN** the spotting reveal delay is adjusted in configuration
- **THEN** the time required for a continuously visible target to become spotted changes accordingly without requiring code changes in the AI update loops
