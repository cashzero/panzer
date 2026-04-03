## Context

The current AI movement stack already contains one proactive steering primitive for buildings through `steerDirectionAroundBuildings(...)`, but tree and tank avoidance mostly happens after movement has already produced an overlap. `EnemyAI.tsx`, `AllyAI.tsx`, and `GameScene.tsx` all rely on `resolveTankCollision(...)`, `resolveTreeCollision(...)`, and `resolveBuildingCollision(...)` in `src/collision.ts` to push tanks back out of blocked space after the fact. That makes obstacle interaction physically safe enough to prevent gross overlap, but it does not produce convincing route selection in cluttered areas.

The game already has the data needed for a lightweight avoidance layer. Tank movement uses circle-based XZ collision radii, standing trees have a shared collision radius and `fallen` state, and buildings already participate in movement blocking. The design problem is to add short-range local steering that works with the existing movement model rather than replacing it with full pathfinding.

## Goals / Non-Goals

**Goals:**
- Add a shared short-range path-clearance helper that AI movement code can reuse before movement is applied.
- Let enemy and allied tanks choose a clearer local steering lane when a standing tree, building, or nearby tank blocks the direct heading.
- Preserve current movement semantics such as engagement range control, waypoint travel, follow behavior, and collision resolution as a fallback safety layer.
- Expose tuning in `src/config.ts` so obstacle-avoidance timing and spread can be adjusted without rewriting AI loops.

**Non-Goals:**
- Implementing full navigation meshes, A*, or long-range strategic pathfinding.
- Replacing existing collision resolution; post-move collision handling remains as the final safety net.
- Teaching AI to reason about future cover positions, hull-down terrain, or squad formations.
- Changing projectile, spotting, or player movement behavior.

## Decisions

### Decision: Add local avoidance as a steering layer rather than a new pathfinding system

AI movement will keep its existing objective selection and preferred heading logic, then run that heading through a short-range avoidance sampler to pick a nearby clear lane when needed.

Rationale:
- The current AI already knows where it wants to go; the missing piece is local clutter avoidance, not map-scale routing.
- This keeps the change small and aligned with the current per-frame steering architecture.
- It avoids introducing heavy new data structures or authored navigation content.

Alternatives considered:
- Full pathfinding over the battlefield: rejected because it is much larger than the roadmap item and unnecessary for the current obstacle set.
- Only improving post-collision push-out: rejected because it would still look reactive and stall-prone.

### Decision: Centralize movement obstacle checks in `src/collision.ts`

The change will export a shared helper such as `isPathClear()` from `src/collision.ts`, using the same XZ collision assumptions already used for tank, tree, and building interaction.

Rationale:
- The movement blockers already live in this module, so keeping short-range path probes there avoids duplicating obstacle math in `EnemyAI.tsx` and `AllyAI.tsx`.
- Shared logic keeps allied and enemy behavior consistent.
- The helper can reuse existing radii and obstacle state rules, such as ignoring destroyed tanks and fallen trees.

Alternatives considered:
- Putting the helper in each AI file: rejected because the logic would diverge and be harder to tune consistently.
- Reusing projectile ray tests for movement clearance: rejected because movement uses circle or footprint clearance rather than a thin ray.

### Decision: Sample a small fan of candidate headings around the preferred direction

When the preferred heading is blocked, AI movement will test a configurable fan of nearby headings and pick the first or best clear option within a limited angular spread.

Rationale:
- A fan sampler is simple, deterministic, and well matched to the current forward-steering model.
- It handles common cases like a tree or stopped tank directly ahead without adding long detours.
- The sampling spread and lookahead distance can be tuned per project without changing the underlying movement code.

Alternatives considered:
- Random heading jitter: rejected because it would look unstable and be hard to tune.
- Potential-field steering: deferred because it adds more balancing complexity than needed for the current scope.

### Decision: Treat buildings, standing trees, and live tanks as blockers for proactive steering

The path-clearance helper will consider building footprints, standing trees, and non-destroyed tanks as blockers. Fallen trees and the moving tank itself will be excluded.

Rationale:
- These are the obstacle types that currently create the visible stalls called out by the roadmap item.
- Standing trees and nearby tanks are the main gap in the existing proactive steering behavior.
- Excluding fallen trees preserves the current world-state meaning that a knocked tree no longer behaves like a standing obstacle.

Alternatives considered:
- Buildings only: rejected because that is already covered and does not solve the current problem.
- Include destroyed tanks as blockers: rejected for now because wreck blocking is not consistently modeled elsewhere in movement.

### Decision: Keep existing collision resolution as the fallback safety net

Even after proactive steering is added, the existing collision resolution functions will still run after movement updates.

Rationale:
- Local probes will reduce collisions, not eliminate every edge case in dense formations or near terrain boundaries.
- The existing push-out logic already provides a safe final guardrail with minimal extra work.
- Keeping both layers lowers the risk of introducing new overlap bugs.

Alternatives considered:
- Removing collision resolution once avoidance is added: rejected because sampling alone is not robust enough in every crowded case.

## Risks / Trade-offs

- [Heading oscillation in dense clutter] -> Mitigation: keep the candidate fan small and deterministic, and prefer the direct heading as soon as it is clear again.
- [Extra per-frame probe cost] -> Mitigation: use short lookahead distances, reuse simple XZ collision math, and stop searching once a clear candidate is found.
- [Allied groups may still bunch in narrow spaces] -> Mitigation: keep post-move collision resolution in place and limit this change to local obstacle avoidance rather than formation spacing.
- [Avoidance may produce visibly wide detours if over-tuned] -> Mitigation: expose spread, sample count, and lookahead distance in `src/config.ts` for balancing.

## Migration Plan

This is a runtime-only AI behavior change with no save-format or data migration impact. Implementation can land incrementally by introducing the shared path-clearance helper first, then routing enemy and allied movement calls through it while preserving the existing collision-resolution fallback. If the first tuning pass makes AI movement worse, the new steering layer can be softened by reducing the avoidance distance and angular spread without backing out the structural changes.

## Open Questions

- Whether the active engagement target should be ignored as a blocker at very short range to avoid overly cautious circling during close combat.
- Whether movement toward waypoints should bias left or right consistently when both candidate lanes are equally clear.
- Whether wrecks should later become explicit blockers once destroyed-tank obstacle behavior is defined more broadly.
