## Why

Track damage currently acts as a mostly permanent mobility loss, which can leave the player or AI crippled for the rest of a fight after a single disabling hit. A repair mechanic adds a recoverable battlefield state, creates tactical downtime decisions, and makes track damage feel like a temporary mobility emergency instead of a soft game-over.

## What Changes

- Add a battlefield track repair flow that can restore a destroyed left or right track after a repair duration instead of leaving the tank immobilized indefinitely.
- Define the gameplay conditions that allow, pause, interrupt, and complete a repair attempt for a disabled track.
- Expose repair progress and completion feedback through the HUD and combat messaging so the player can understand when mobility is being recovered.
- Establish how AI-controlled tanks use the same repair rules when they become immobilized by track damage.

## Capabilities

### New Capabilities
- `track-repair`: Defines how disabled tracks enter repair, how repair progress behaves under interruption, and how tanks regain mobility when repair completes.

### Modified Capabilities

## Impact

- Affected code: `src/store.ts`, `src/GameScene.tsx`, `src/UI.tsx`, AI update code such as `src/EnemyAI.tsx` and `src/AllyAI.tsx`, and any movement helpers that consume track-disabled state.
- Affected systems: track damage state, player input flow, HUD messaging, AI immobilization behavior, and gameplay documentation in `openspec/product.md` when the feature ships.
- No external API or dependency changes are expected.
