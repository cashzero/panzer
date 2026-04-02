# OpenSpec

This directory is the single source of truth for product specification, delivered features, and planned work.

## Documents

- `openspec/product.md` - gameplay and design specification
- `openspec/implemented.md` - shipped features, organized by system
- `openspec/roadmap.md` - planned work and sprint backlog
- `openspec/conventions.md` - OpenSpec structure, style, and maintenance rules

## Workflow

- Add or refine planned work in `openspec/roadmap.md`
- When a roadmap item is completed, move it into `openspec/implemented.md`
- Keep `openspec/product.md` aligned with the current intended game design

## Ownership Rules

- `openspec/product.md` describes intended behavior and player-facing design
- `openspec/implemented.md` records what is already live in the codebase
- `openspec/roadmap.md` tracks work that is not finished yet
- If a feature changes scope, update both the relevant spec and roadmap entry
