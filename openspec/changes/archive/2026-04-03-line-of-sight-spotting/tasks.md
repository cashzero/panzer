## 1. Visibility State And Tuning

- [x] 1.1 Add spotting configuration values in `src/config.ts` for range, reveal delay, and contact persistence.
- [x] 1.2 Extend `src/store.ts` with per-tank spotted state and any supporting timestamps or team-awareness helpers needed by AI and map mode.

## 2. Line-Of-Sight Evaluation

- [x] 2.1 Add a shared line-of-sight helper that evaluates observer-to-target visibility against terrain, buildings, and standing trees using the existing ray or intersection utilities.
- [x] 2.2 Define target sample points and observer eye points so the helper can handle partial exposure without relying on a single center-point ray.

## 3. AI Integration

- [x] 3.1 Update `src/EnemyAI.tsx` to use the spotting and LOS rules when acquiring, maintaining, and firing at targets.
- [x] 3.2 Update `src/AllyAI.tsx` to use the same spotting and LOS rules while preserving ally move orders, fire orders, and short contact memory.

## 4. Player Awareness Surfaces

- [x] 4.1 Update `src/MapMode.tsx` so enemy markers render only when the player's side currently has that enemy spotted or within contact persistence.
- [x] 4.2 Reduce any remaining player-facing enemy intel surfaces that currently reveal unspotted enemies before contact is established.

## 5. Validation

- [ ] 5.1 Verify that terrain crests, buildings, and standing trees can prevent immediate spotting and AI engagement until a clear line of sight exists.
- [ ] 5.2 Verify that reveal delay and contact persistence behave consistently without causing rapid flicker in AI targeting or map visibility.
