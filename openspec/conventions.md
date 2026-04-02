# OpenSpec Conventions

## Purpose

OpenSpec keeps product intent, implementation history, and planned work in one consistent format.

## Document Roles

### `openspec/product.md`

Use for stable game design and behavior specifications.

Include:
- player-facing systems
- gameplay rules
- control schemes
- visual and UX direction
- mechanical formulas that define intended behavior

Do not include:
- temporary task lists
- implementation checklists
- speculative notes without a clear design decision

### `openspec/implemented.md`

Use for features that are already present in the codebase.

Rules:
- organize entries by system
- describe the delivered capability, not the coding process
- keep wording concise and factual
- prefer one bullet per shipped capability
- merge small related items when they form one coherent feature

### `openspec/roadmap.md`

Use for not-yet-finished work.

Rules:
- group by sprint or milestone
- give each feature an objective line
- use checkbox bullets for actionable work
- split tasks into implementation work and player-facing validation when useful
- keep each item implementation-oriented and testable
- if a feature is partially done, split shipped work into `implemented.md` and leave only remaining work here

## Writing Style

- Prefer short sections with clear headings
- Use present tense for product behavior
- Use concrete nouns and system names from the codebase when helpful
- Prefer ASCII punctuation unless the file already needs Unicode
- Avoid vague terms like "improve" or "enhance" without saying what changes

## Section Patterns

### Product Spec Pattern

Use this shape when adding a new gameplay system:

1. Overview
2. Player interaction or controls
3. Rules and constraints
4. Data or tuning notes
5. Edge cases or special states

### Implemented Features Pattern

Recommended top-level grouping:

- Core gameplay and controls
- Vehicles, weapons, and combat
- AI and tactical systems
- World, terrain, and obstacles
- UI, map, and presentation
- Audio and effects
- Performance and rendering

### Roadmap Pattern

Recommended item shape:

- Feature title and size
- Objective: one sentence describing intended outcome
- Implementation tasks:
  - [ ] Action in specific file or subsystem
  - [ ] Follow-up behavior or data wiring
- Player-facing validation:
  - [ ] Validation surface if needed

## Maintenance Workflow

When completing a feature:

1. Remove or update the unfinished item in `openspec/roadmap.md`
2. Add the delivered capability to `openspec/implemented.md`
3. Update `openspec/product.md` if the intended design changed or was clarified

When refactoring without behavior change:

- usually update code only
- update OpenSpec only if terminology, architecture boundaries, or documented capabilities changed

When discovering undocumented behavior:

- add it to `openspec/implemented.md` if it already exists in code
- add it to `openspec/product.md` only if it is intended to remain part of the design
