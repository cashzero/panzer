## Context

Track damage is already modeled in `src/store.ts` as per-side HP and a `trackDestroyed` flag, and the movement code in `src/GameScene.tsx`, `src/EnemyAI.tsx`, and `src/AllyAI.tsx` treats destroyed tracks as a hard mobility constraint. The current system has no recovery path, so a tank that loses a track can remain permanently crippled for the rest of the battle even if it survives long enough to disengage.

This change crosses gameplay state, player feedback, and AI behavior. The design needs to preserve the existing distinction between left and right track damage, avoid conflicting with the current `R` ammo-toggle binding, and keep repair behavior consistent across player and AI tanks.

## Goals / Non-Goals

**Goals:**
- Add a recoverable repair state for destroyed left and right tracks without replacing the existing track HP and destruction model.
- Define repair behavior that creates tactical downtime and vulnerability instead of granting immediate mobility recovery.
- Surface repair progress and completion clearly for the player HUD and combat messages.
- Keep AI tanks on the same repair rules as the player so immobilization remains readable and consistent.

**Non-Goals:**
- Adding a crew-management system, consumable repair kits, or inventory mechanics.
- Reworking non-track damage, engine damage, or a full subsystem repair model.
- Introducing a new manual repair keybinding that conflicts with existing controls.
- Changing the underlying penetration and track-hit detection rules.

## Decisions

### Decision: Model repair as per-track state stored alongside track damage
Each tank should carry explicit repair state for the left and right track, including whether repair is eligible, whether it is currently progressing, and accumulated progress time. This keeps the repair system aligned with the existing independent left/right track damage model and avoids deriving repair progress indirectly from transient movement state.

Rationale:
- The current gameplay already distinguishes left and right track destruction.
- Per-side state allows one repaired track to restore partial mobility even if the opposite side remains destroyed.

Alternatives considered:
- One shared "mobility repair" timer per tank: rejected because it loses which side is being restored and does not map cleanly to the current damage model.
- A purely visual repair timer outside the store: rejected because movement, HUD, and AI all need the same authoritative state.

### Decision: Use automatic field repair gated by safe-state conditions
Repair should begin and advance automatically when a destroyed-track tank is alive, effectively stationary, and not actively firing. Movement, firing, or renewed combat pressure should pause repair progress instead of requiring a dedicated repair input.

Rationale:
- This avoids adding a new binding in a control scheme that already uses major combat keys.
- It creates an understandable trade-off: remain still and vulnerable to recover mobility.
- It works for both player and AI without separate input logic.

Alternatives considered:
- Manual repair toggle: rejected because the existing input map is already dense and a toggle introduces extra UI and cancellation edge cases.
- Always-on repair even while maneuvering: rejected because it removes the tactical commitment that makes track damage meaningful.

### Decision: Restore repaired tracks to partial health, not full health
When repair completes, the repaired track should clear its destroyed state and return with partial HP instead of full durability. The intent is to restore mobility while keeping the tank more vulnerable to a follow-up track hit than a fresh vehicle.

Rationale:
- Immediate full restoration would erase too much value from successful track damage.
- Partial restoration creates a useful middle state between crippled and fully healthy.

Alternatives considered:
- Restore to full HP: rejected because it over-rewards disengagement and weakens the significance of track hits.
- Restore only the destroyed flag while leaving HP at zero: rejected because it creates an incoherent state and risks immediate re-destruction on any follow-up logic.

### Decision: Advance repair from one shared per-frame manager
Repair progression should be updated from one central per-frame gameplay manager rather than being embedded separately into player, enemy, and ally movement loops. That manager can inspect all tanks, determine repair eligibility, and update progress consistently even when the player movement loop is skipped in map mode.

Rationale:
- The player controller currently pauses movement updates in map mode, but repair rules should remain consistent.
- Centralizing repair progression avoids duplicating timing logic across three different frame systems.

Alternatives considered:
- Advance repair inside each controller loop: rejected because behavior would diverge across player and AI and become sensitive to mode-specific early returns.
- Advance repair only on damage events: rejected because repair is a time-based state, not a discrete event.

## Risks / Trade-offs

- [Automatic repair may feel opaque if feedback is too subtle] -> Mitigation: show explicit HUD status, progress, and completion or interruption messages for the player.
- [Repair timing that is too short makes track damage irrelevant] -> Mitigation: tune repair duration conservatively and restore only partial HP.
- [AI tanks repairing too eagerly may create frustrating re-mobility loops] -> Mitigation: gate AI repair by the same stationary and not-firing conditions and validate common combat cases.
- [Per-side timers increase state complexity] -> Mitigation: keep the repair data model minimal and co-located with existing track state in `TankData`.

## Migration Plan

1. Extend tank state with per-side track repair fields and initialize them for player, allies, and enemies.
2. Add a shared repair update path that advances or pauses repair based on destroyed-track state, motion, and firing status.
3. On repair completion, restore partial track HP, clear the relevant destroyed flag, and emit player-facing feedback.
4. Update HUD output and any player messages to expose repair status and progress.
5. Validate that map mode, player firing, and AI immobilization all interact correctly with repair progression.

Rollback is straightforward because the feature is isolated to track-state handling, HUD feedback, and AI or gameplay update flow.

## Open Questions

- What exact repair duration and restored HP fraction produce the best balance between tension and frustration?
- Should taking any incoming hit pause repair only while under active pressure, or also clear accumulated progress entirely?
- Should the player see enemy and ally repair feedback only through behavior, or through additional HUD markers later?
