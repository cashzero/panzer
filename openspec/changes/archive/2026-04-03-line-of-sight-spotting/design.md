## Context

The current tactical-awareness model is incomplete for the intended game design. `EnemyAI.tsx` and `AllyAI.tsx` currently select and engage targets by distance, fire order, and temporary alert state, but they do not check whether terrain, buildings, or standing trees block visibility. `MapMode.tsx` also presents unit positions without a spotting gate, which conflicts with the product requirement that battlefield awareness should come from direct sightlines, the HUD, and map mode rather than omniscient information.

The codebase already contains most of the geometry queries needed for a spotting system. Terrain ray tests exist in `src/Terrain.tsx`, tree ray tests exist in `src/projectilePhysics.ts`, building ray tests exist in `src/buildings.ts`, and tank geometry ray tests exist in `src/armorModel.ts`. The design problem is not inventing a new geometry system, but defining one shared line-of-sight evaluation path and one gameplay state model that AI and map intel can both consume.

## Goals / Non-Goals

**Goals:**
- Add a reusable line-of-sight check that can tell whether one tank has an unobstructed view of another through terrain, buildings, and standing trees.
- Introduce a per-tank spotted state with reveal delay and short contact persistence so visibility changes do not flicker every frame.
- Make AI target acquisition and continued engagement depend on spotting and line of sight instead of range alone.
- Hide unspotted enemy units from the tactical map and related player intel surfaces.
- Keep the implementation local to the client runtime and current Zustand store structure.

**Non-Goals:**
- Adding camouflage values, crew skill simulation, weather-driven visibility reduction, or faction-specific optics.
- Reworking projectile collision, armor penetration, or player aiming semantics.
- Building a full fog-of-war system with terrain memory or sector ownership.
- Making decorative non-combat geometry participate in spotting.

## Decisions

### Decision: Separate the LOS primitive from gameplay spotting memory

The system will use a pure line-of-sight helper to answer whether one tank can currently see another, and a higher-level store state to track whether that target is presently spotted for gameplay purposes.

Rationale:
- AI targeting needs an immediate visibility answer, while map intel and HUD concealment need a slightly more stable, player-facing state.
- Separating the two concerns keeps the geometry helper deterministic and easier to test.
- This avoids mixing timers and reveal logic into every AI loop.

Alternatives considered:
- Store only a boolean `visibleNow`: rejected because it would cause rapid flicker in map and AI behavior around partial cover.
- Store only spotted state with no raw LOS helper: rejected because AI code would still need to reimplement geometry checks.

### Decision: Evaluate LOS from an observer eye point to a small set of target sample points

Each LOS check will cast from an observer point near the tank's turret or crew sightline height to multiple sample points on the target, such as center mass and upper silhouette. A target counts as visible if any sample point is unobstructed.

Rationale:
- A single center-point ray is too brittle for hull-down and ridge-line fights.
- A small sample set captures partial exposure without the cost of full per-plate visibility evaluation.
- The game already uses approximate target points for AI elevation logic, so this approach matches current system fidelity.

Alternatives considered:
- One ray to target center: rejected because it incorrectly hides turret-only exposures.
- Full armor-plate visibility using every plate OBB: rejected because it is more expensive and unnecessary for spotting.

### Decision: Count terrain, buildings, and standing trees as spotting occluders

The LOS helper will treat terrain intersections, building intersections, and standing-tree intersections that occur before the target sample point as blockers. Fallen trees will not block spotting. Tanks may remain excluded as blockers for the initial change to avoid excessive formation-based false negatives.

Rationale:
- These are the existing world objects that already shape movement, cover, and projectile interruption.
- The roadmap explicitly calls out terrain and tree occlusion, and buildings are already combat-relevant hard cover in the current game.
- Excluding tank-on-tank blocking from the initial version reduces AI edge cases in clustered formations and keeps the first tuning pass simpler.

Alternatives considered:
- Terrain and trees only: rejected because buildings are already major battlefield occluders.
- Include other tanks as blockers immediately: deferred because it could make group AI feel unstable until formation behavior improves.

### Decision: Use reveal delay plus short persistence for spotted state

A target will become spotted only after remaining visible for a configurable reveal delay, and it will remain spotted for a short configurable persistence window after LOS breaks.

Rationale:
- This prevents instant flicker when sightlines graze vegetation or ridge crests.
- It supports the intended tactical feel where contact can be momentarily retained after a brief occlusion.
- It creates tuning hooks in `config.ts` without hardcoding pacing in AI files.

Alternatives considered:
- Instant spot and instant loss: rejected because it is visually noisy and tactically brittle.
- Long persistent memory with no active LOS requirement for firing: rejected because it would preserve too much omniscience.

### Decision: Keep player intel asymmetric around the player tank's knowledge

The player will always know their own tank and allied positions, but enemy visibility on the tactical map will depend on the player's side having that enemy currently spotted or within persistence memory.

Rationale:
- This aligns with map mode as a command and awareness surface rather than omniscient spectator mode.
- It keeps ally command usability intact while still making enemy contact meaningful.
- It avoids hiding friendly units, which would harm command gameplay.

Alternatives considered:
- Global omniscience in map mode: rejected because it undermines concealment.
- Per-unit private visibility with no team sharing: rejected for now because the command model is team-oriented and simpler with shared friendly knowledge.

## Risks / Trade-offs

- [Per-frame raycast cost] -> Mitigation: use a small sample count, short-circuit on first clear sample, and reuse existing broad-phase helpers where possible.
- [Visibility flicker near cover] -> Mitigation: use reveal delay and persistence timers rather than raw LOS alone.
- [AI target churn] -> Mitigation: retain recent contact briefly so AI does not immediately drop and reacquire targets every frame.
- [Overly transparent forests or overly opaque forests] -> Mitigation: start with existing standing-tree collision shapes and expose timing and range tuning in `config.ts` for balance passes.
- [Map intel ambiguity] -> Mitigation: define spotted state at the team-awareness level and hide only enemy markers, not allied units or the player.

## Migration Plan

This change is runtime-only and requires no data migration. The implementation can ship incrementally behind existing AI and map systems because it adds new visibility state rather than changing external save formats or APIs. If rollout exposes undesirable targeting behavior, the LOS gating can be relaxed by tuning config values or temporarily bypassing the spotting requirement in AI while keeping the underlying state model.

## Open Questions

- Whether destroyed enemy tanks should remain visible on the map after they were once spotted, even if living enemies nearby are hidden.
- Whether other tanks should eventually count as LOS blockers after the initial spotting system lands.
- Which HUD surfaces, beyond map markers, should be reduced for unspotted enemies in the first implementation.
