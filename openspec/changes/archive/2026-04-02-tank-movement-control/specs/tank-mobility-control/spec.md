## ADDED Requirements

### Requirement: Stationary pivot steering is slower than low-speed moving steering
The movement-control system SHALL make stationary steering a lower-effectiveness state than low-speed forward steering. A tank at a standstill SHALL remain able to pivot for alignment, but that pivot behavior SHALL feel slower and more laborious than steering while already moving forward slowly.

#### Scenario: Steering from a standstill
- **WHEN** the player applies steering input without forward or reverse throttle
- **THEN** the tank pivots in place at a deliberately reduced rate compared with its low-speed forward steering response

#### Scenario: Comparing standstill and low-speed steering
- **WHEN** the player compares stationary steering with low-speed forward steering on similar terrain
- **THEN** low-speed forward steering produces the tighter and more useful directional change state

### Requirement: Forward steering trades slight speed for a tighter line
The movement-control system SHALL let a tank tighten its path while moving forward by giving up a small amount of speed instead of preserving nearly full speed and producing excessive understeer. This speed trade SHALL remain modest enough that the tank still feels like it is carrying momentum through the turn.

#### Scenario: Steering while moving forward
- **WHEN** the player holds forward throttle and steering together
- **THEN** the tank follows a visibly tighter turning line than straight-line travel while losing only a small amount of forward speed

#### Scenario: Preserving momentum during a turn
- **WHEN** the player performs a normal low- or medium-speed steering input
- **THEN** the tank does not collapse into a near-stop or near-pivot turn unless explicitly tuned for an exceptional vehicle

### Requirement: Steering effectiveness varies by speed regime
The movement-control system SHALL make low-speed forward motion the most effective steering regime, medium-speed steering moderately effective, and high-speed steering broader and less responsive. High-speed turning SHALL remain deliberate enough to preserve the heavy tracked-vehicle feel.

#### Scenario: Low-speed steering
- **WHEN** the player steers while moving at low speed
- **THEN** the tank responds with the most effective turning behavior available during normal driving

#### Scenario: High-speed steering
- **WHEN** the player steers while moving at high speed
- **THEN** the tank turns in a broader arc than it does at low speed and does not gain arcade-like snap rotation

### Requirement: Tank mobility tuning preserves distinct vehicle classes
The mobility-control implementation SHALL support per-tank tuning so medium and heavy tanks can keep distinct handling character while still following the same movement-control contract. Shared tuning defaults SHALL NOT force all tanks into identical steering feel.

#### Scenario: Comparing tank classes
- **WHEN** mobility values differ between a medium tank and a heavy tank
- **THEN** both tanks follow the same steering-regime rules while retaining different turn responsiveness and inertia

#### Scenario: Shared movement helper updates
- **WHEN** shared movement helpers are updated to satisfy the new handling contract
- **THEN** tank-specific mobility data remains the mechanism for differentiating individual vehicle feel
