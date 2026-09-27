# Open Panzer Front

A browser WW2 tank battle simulator (React 19, Three.js / React Three Fiber, Zustand, Vite). Plan a battle on procedurally generated Norman countryside, pick a historical tank, and fight with per-plate armour and range-based penetration against AI allies and enemies.

## Highlights

- **Tanks**: Sherman, M4A1, M4A2 (76), M10 GMC, Tiger I, Panther, Panzer II/III/IV, StuG III G, T-34/76 — each defined as JSON (`src/tanks/<id>/`).
- **Combat**: OBB armour plates, angle-based effective armour, ricochets above 70°, range-based penetration falloff, zeroed gunner sight with drop compensation.
- **AI**: role-based enemy and allied AI with spotting, navigation around forests, and commandable wingmen (stances, fire control, waypoints).
- **World**: seeded roads, villages, farms, fields, forests and hedgerows; blade grass and physical-scale effects.
- **Tools**: order-of-battle planner with random force generator, and a standalone tank editor (`tank-editor.html`).

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build to dist/
npm run lint    # tsc --noEmit
```

No API keys needed.

## Controls

| Input | Action |
|---|---|
| W A S D | Drive |
| Arrow keys | Turret / gun elevation |
| Mouse / right-click | Free look / align turret or designate target |
| Space / left mouse | Fire |
| R | Switch ammunition |
| V / middle mouse | Gunner sight (+ / − to zoom) |
| PageUp / PageDown | Zero distance |
| M | Tactical map |

## Docs

- `CLAUDE.md` — architecture; `src/tanks/CLAUDE.md` — adding a tank
- `openspec/` — product spec, implemented features, roadmap
- Third-party asset licences: `public/assets/*/README.md`, `src/rendering/vendor/`
