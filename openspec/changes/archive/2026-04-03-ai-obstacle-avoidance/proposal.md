## Why

Enemy and allied tanks currently steer proactively around buildings, but they still handle nearby trees and other tanks mostly through overlap resolution after they have already driven into them. This creates visible stalls, bunching, and repeated collisions that conflict with the intended tactical feel of terrain-aware AI maneuvering.

## What Changes

- Add proactive obstacle-avoidance steering for AI movement so tanks probe for clear headings before colliding with standing trees or nearby tanks.
- Add a shared path-clearance helper in `src/collision.ts` that can evaluate candidate headings against standing trees, buildings, and other tanks over a short lookahead distance.
- Update `src/EnemyAI.tsx` and `src/AllyAI.tsx` movement steering to use obstacle sampling when advancing, retreating, following, or moving to waypoints.
- Add avoidance tuning in `src/config.ts` for probe distance, sampling spread, and clearance so the behavior can be balanced without rewriting AI loops.

## Capabilities

### New Capabilities
- `ai-obstacle-avoidance`: Allows AI-controlled tanks to choose clear short-range steering lanes around battlefield obstacles before contact, reducing collisions and stalls during movement.

### Modified Capabilities

## Impact

- Affected code: `src/EnemyAI.tsx`, `src/AllyAI.tsx`, `src/collision.ts`, `src/config.ts`, and any small shared movement helpers extracted to support reuse.
- Affected systems: enemy movement, allied movement orders, obstacle interaction, and AI navigation tuning.
- No new external dependencies, save-format changes, or network APIs are expected.
