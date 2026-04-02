## 1. Track Repair State And Rules

- [x] 1.1 Extend `src/store.ts` tank state with per-side track repair progress fields and initialize them for player, ally, and enemy tanks.
- [x] 1.2 Add shared track-repair rule handling that detects repair eligibility, advances or pauses progress, and restores partial track HP when repair completes.
- [x] 1.3 Reset or reconcile repair state correctly when new track damage occurs so destroyed-track and repaired-track data stay consistent.

## 2. Gameplay Integration

- [x] 2.1 Add one shared per-frame repair updater in the gameplay scene so repair progression runs consistently outside the player movement loop, including during map mode.
- [x] 2.2 Update player and AI movement consumers to use repaired track state immediately after completion without leaving tanks stuck in an immobilized condition.
- [x] 2.3 Ensure firing and other active combat behavior pause repair progression according to the new repair contract.

## 3. Feedback And Validation

- [x] 3.1 Update `src/UI.tsx` to show player track repair status and per-side progress when a destroyed track is being repaired.
- [x] 3.2 Add player-facing combat messages for repair start, pause or resume if needed, and completion so mobility recovery is readable.
- [x] 3.3 Run `npm run lint` and perform in-game validation for player, ally, and enemy cases covering single-track repair, both-tracks immobilization, interruption, and restored movement.
