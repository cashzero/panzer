## Why

AI units currently choose and engage targets based on range and alert state without checking whether terrain, buildings, or standing trees actually block sight. This makes concealment weaker than intended and conflicts with the product goal that battlefield awareness should come from direct sightlines rather than omniscient information.

## What Changes

- Add a line-of-sight spotting system that determines whether tanks are currently visible to opposing units using battlefield occluders instead of distance alone.
- Add per-tank spotted state and short-lived contact memory so visibility affects both targeting and battlefield awareness without causing instant flicker.
- Make `EnemyAI.tsx` and `AllyAI.tsx` require a valid line of sight before they can acquire or sustain a firing target unless temporary alert memory still applies.
- Hide unspotted enemy units from `MapMode.tsx` and reduce player battlefield information until contact is established.
- Add spotting range, reveal delay, and contact persistence tuning to `config.ts` so visibility behavior can be balanced without rewriting AI logic.

## Capabilities

### New Capabilities
- `line-of-sight-spotting`: Determines whether tanks are visible through terrain, trees, buildings, and related spotting rules, and uses that state to control AI targeting and battlefield awareness.

### Modified Capabilities

## Impact

- Affected code: `src/store.ts`, `src/EnemyAI.tsx`, `src/AllyAI.tsx`, `src/MapMode.tsx`, `src/config.ts`, and shared ray or intersection helpers used for terrain, trees, buildings, and tanks.
- Affected systems: AI target selection, tactical awareness, map-mode intel, and concealment gameplay.
- No new external dependencies or network APIs are expected.
