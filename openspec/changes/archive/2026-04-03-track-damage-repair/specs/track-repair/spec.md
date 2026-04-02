## ADDED Requirements

### Requirement: Destroyed tracks can be repaired through field downtime
The game SHALL allow each destroyed track on a living tank to regain operable status through a time-based repair process. Repair SHALL apply independently to the left and right track so that one repaired side can recover mobility even if the opposite side remains destroyed.

#### Scenario: Single destroyed track begins repair
- **WHEN** a tank has one destroyed track and remains in a repair-eligible state long enough to start repair
- **THEN** the destroyed side enters repair progress without changing the intact side

#### Scenario: Both tracks are destroyed
- **WHEN** a tank has both tracks destroyed
- **THEN** each destroyed side remains independently eligible to recover through the repair process

### Requirement: Repair progress requires a safe, non-combat state
Track repair progress SHALL only advance while the tank is alive, effectively stationary, and not actively firing. If the tank leaves that safe state, repair progress SHALL stop advancing until the tank becomes eligible again.

#### Scenario: Repair progresses while immobilized and waiting
- **WHEN** a tank with a destroyed track is alive, stationary, and not firing
- **THEN** repair progress advances for the destroyed track

#### Scenario: Repair pauses during movement or firing
- **WHEN** a tank with active track repair moves or fires before repair completes
- **THEN** repair progress stops advancing until the tank returns to a repair-eligible state

### Requirement: Repair completion restores partial track health and mobility
When a track repair completes, the repaired side SHALL clear its destroyed state and restore a non-zero amount of track health that is lower than full health. The tank's mobility SHALL immediately reflect the newly repaired track state.

#### Scenario: Completing a single-track repair
- **WHEN** repair completes for one destroyed track on a tank whose opposite track is still operable
- **THEN** the repaired track becomes usable again and the tank regains the movement options permitted by having one operable track per side

#### Scenario: Completing one side while the other remains destroyed
- **WHEN** repair completes for one side of a tank whose other track is still destroyed
- **THEN** the tank is no longer fully immobilized and can move according to the remaining track-damage rules

### Requirement: Player repair state is visible through HUD feedback
The HUD SHALL show the player's destroyed-track repair state, including whether a repair is in progress and how close it is to completion. The game SHALL also provide a readable completion or status message when the player's mobility changes because of repair.

#### Scenario: Player track repair in progress
- **WHEN** the player's destroyed track is actively being repaired
- **THEN** the HUD displays repair progress for that side

#### Scenario: Player track repair completes
- **WHEN** the player's track repair finishes
- **THEN** the player receives visible feedback that the repaired side is operational again

### Requirement: AI tanks follow the same repair rules as the player
Enemy and allied tanks SHALL use the same eligibility, progression, pause, and completion rules for track repair as the player. AI repair SHALL be automatic and SHALL NOT require a separate control path from the shared gameplay rules.

#### Scenario: Immobilized enemy repairs while inactive
- **WHEN** an enemy tank has a destroyed track and remains in a repair-eligible state
- **THEN** its repair progresses under the same rules that apply to the player

#### Scenario: Immobilized ally resumes movement after repair
- **WHEN** an allied tank completes repair on at least one destroyed track
- **THEN** its subsequent movement logic uses the updated repaired-track state instead of remaining permanently immobilized
