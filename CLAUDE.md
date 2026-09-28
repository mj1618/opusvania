# Opusvania

A browser metroidvania built by AI agents, aiming for Hollow Knight and Ori quality. Vision, research and roadmap are in `PLAN.md`. The lead/orchestrator agent works by the loop in `STUDIO.md`; read it first if you are orchestrating.

## Stack
TypeScript (strict), Node 24 and npm, Vite, and PixiJS v8 with WebGL2 as the default renderer (shaders in GLSL). Physics is our own deterministic integer-AABB code, with no physics engine. Levels are built in LDtk, and content data is validated with Zod. Audio uses the Web Audio API directly. Other tools: Vitest, Playwright Test, Biome, Tweakpane and AssetPack. `PLAN.md` §4.0 explains why each was chosen. Don't add a dependency without a reason; record the reason in `memory/`.

## Architecture rules
- `src/sim/` is pure and deterministic. It must not import Pixi, the DOM or audio. It must not call `Math.random` or `Date.now`; use the seeded RNG and the frame count. It runs at a fixed 60Hz.
- Render and audio code only read sim state and events. They never change the sim.
- Gameplay numbers go in tuning and data files, never inline as magic numbers.
- Keep the `window.__game` debug API working: `step`, `state`, `input`, `load`.

## Definition of done
- `npm run check` passes.
- The feature has been checked in the running game with playwright-cli (state or a screenshot), not only in tests.
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
