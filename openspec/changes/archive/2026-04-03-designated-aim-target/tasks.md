## 1. Target Resolution

- [x] 1.1 Add a player-facing designated-target resolution step that casts the screen-center ray against tanks, buildings, trees, and terrain and returns the nearest valid hit or a stable fallback point.
- [x] 1.2 Reuse or extend existing raycast helpers so tank armor, building collision, tree collision, and terrain queries can participate in one consistent designated-target result.

## 2. Aiming Pipeline

- [x] 2.1 Update the player aiming flow so third-person right-click aiming uses the designated aim target point rather than direction-only camera alignment.
- [x] 2.2 Update aim-point world reconstruction and support visuals so the gun aim marker reflects the designated target semantics for tanks, terrain, and fallback cases.
- [x] 2.3 Preserve designated-target continuity when switching from third-person to gunner view while respecting turret traverse, gun elevation, and calibration-distance behavior.

## 3. Validation And Documentation

- [x] 3.1 Verify the new behavior against terrain, tanks, buildings, trees, and empty-sky fallback cases in both third-person and gunner views.
- [x] 3.2 Update product documentation or related OpenSpec text if implementation reveals wording changes needed to keep aiming semantics and support visuals consistent.
