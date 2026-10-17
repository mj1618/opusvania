# Opusvania

**Lampfall**, a metroidvania built by AI agents, aiming to look and move like Ori and the Blind Forest / Hollow Knight. Today it is one scene, the demo level. The story is in `memory/story.md`. The quality bar and the art direction are in `docs/art-direction.md`: read it before drawing anything. Goal, state and scope are in `PLAN.md`; the orchestrator's loop is in `STUDIO.md`.

## Stack
TypeScript (strict), Node 24 and npm, Vite, PixiJS v8 on WebGL2 (shaders in GLSL), everything drawn in code: no image assets. Audio is allowed only if generated in code (Web Audio API; no sample files); see `docs/audio-direction.md`. Physics is our own deterministic integer-AABB code. Scene data is JSON validated with Zod. Tools: Vitest, Playwright Test, Biome, Tweakpane. Don't add a dependency without a reason; record the reason in `memory/`.

## Architecture rules
- `src/sim/` is pure and deterministic. It must not import Pixi, the DOM or anything outside `src/sim`. It must not call `Math.random` or `Date.now`; use the seeded RNG and the frame count. It runs at a fixed 60Hz.
- Render code only reads sim state and events. It never changes the sim. Render animation runs on render time (`dt`, `clock`), never on wall-clock calls, and never uses `Math.random` for layout, so screenshots are reproducible.
- Stay in your directory: `src/render/scene/` (environment, one file per layer), `src/render/character/`, `src/render/post/`, `src/audio/` (sound: reads the sim like render, never imported by render; `memory/audio.md`). The shared contract is `src/render/contract.ts`; see `memory/scene-and-units.md`.
- Gameplay numbers go in tuning files (`src/sim/tuning.ts`, `src/render/camera/tuning.ts`), never inline as magic numbers.
- Keep the `window.__game` debug API working (`memory/debug-api.md`).

## Definition of done
- `npm run check` passes.
- You ran `npm run shots` (dev server on port 5180) and looked at the PNGs in `shots/` yourself, against `docs/art-direction.md`. For motion, `npm run clip`.
- `memory/` has been updated if you learned something useful.

## Browser control: playwright-cli
Agents drive the browser with the `playwright-cli` command, not the MCP server or the built-in browser.
- Main commands: `open <url>`, `snapshot`, `click <ref>`, `press` / `keydown` / `keyup <key>`, `eval "<js>"`, `screenshot`, `console`, `close`.
- Read game state with `eval "window.__game.state()"`. Use screenshots to check visuals.
- When agents run in parallel, give each its own session: `-s=<name>`.
- Run `playwright-cli --help [command]` for the full list.

## memory/
- `memory/` is shared knowledge for anyone working on the project: gotchas, decisions and the reasons for them, how-tos, and tuning findings.
- `memory/README.md` is the index. Read it at the start of every session. It has one line per file.
- Put one topic in each file. Update or delete entries that are stale.
- Don't duplicate what the code, git history or `PLAN.md` already say.

## Editing this file
Only add things that ALL agents ALWAYS need to know. Everything else goes in `memory/`. Keep this file very short: prune when you add.
