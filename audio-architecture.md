# Audio Architecture

## Current state

- `src/audio.ts` is the single entry point for runtime audio.
- The manager owns Web Audio unlock/lifecycle and now boots a layered player-engine backend built from looped buffers.
- Gameplay code only emits events and telemetry; it does not build sounds directly anymore.
- Shot, impact, and explosion events now use generated transient layers with 3D panning as a placeholder backend.

## Runtime pieces

- `audioManager.mount()` / `audioManager.dispose()` handle browser unlock listeners and `AudioContext` lifetime.
- `audioManager.replaceBackend()` still lets us swap the current backend without rewriting gameplay callsites.
- `audioManager.setListenerPose()` receives camera position/orientation and current view mode.
- `audioManager.syncPlayerEngine()` receives player engine telemetry every frame.
- `audioManager.playShot()`, `audioManager.playImpact()`, and `audioManager.playExplosion()` are the one-shot event surface.

## Integration points

- `src/App.tsx` mounts the audio manager once for the app lifecycle.
- `src/GameScene.tsx` feeds listener pose and player engine telemetry.
- `src/firing.ts`, `src/EnemyAI.tsx`, and `src/AllyAI.tsx` emit gunfire events.
- `src/store.ts` emits impact and destruction events.

## Rebuild plan

- Replace the generated loop backend with recorded samples if we want more authentic tank timbre later.
- Keep iterating on the player engine layers: idle rumble, load, track clatter, transmission whine.
- Replace the generated transient shot/impact/explosion layers with recorded or hybrid sample banks when we want more authentic battlefield timbre.
- Keep gameplay modules event-driven so audio iteration stays isolated from combat and physics code.
