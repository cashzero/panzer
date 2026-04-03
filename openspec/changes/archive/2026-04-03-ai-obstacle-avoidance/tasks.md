## 1. Avoidance Tuning And Shared Helpers

- [x] 1.1 Add obstacle-avoidance tuning values in `src/config.ts` for lookahead distance, heading spread, sample count, and clearance margin.
- [x] 1.2 Add a shared path-clearance helper in `src/collision.ts` that evaluates a short movement lane against buildings, standing trees, and non-destroyed tanks while ignoring the moving tank itself.

## 2. Enemy Movement Integration

- [x] 2.1 Update `src/EnemyAI.tsx` to run its preferred advance and retreat headings through the shared avoidance sampler before applying movement.
- [x] 2.2 Preserve existing range-control, rotation, and collision-resolution behavior while ensuring blocked direct lanes can select a nearby clear alternative.

## 3. Allied Movement Integration

- [x] 3.1 Update `src/AllyAI.tsx` movement helpers so follow, engagement, and waypoint travel all use the same obstacle-avoidance steering layer.
- [x] 3.2 Keep current ally fire orders, engagement posture rules, and waypoint arrival behavior intact while reducing stalls against trees and nearby tanks.

## 4. Validation

- [x] 4.1 Verify enemy and allied tanks navigate around standing trees and nearby tanks with fewer visible collisions and stalls in cluttered areas.
- [x] 4.2 Verify direct movement resumes when the preferred lane clears and that avoidance tuning changes behavior predictably.
