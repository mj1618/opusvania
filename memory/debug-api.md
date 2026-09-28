# window.__game debug API and URL params

Source: `src/debug/api.ts` (typed `GameDebugApi`). Everything returns plain JSON.

- URL params: `?manual` (start paused, only `step()` advances), `seed=<n>`, `room=<id>`, `spawn=<name>`.
- `step(n)` switches to **manual mode** (real-time loop stops advancing) and returns the new state.
  `pause()` / `resume()` switch modes; `mode()`, `info()` (`renderer`, `frame`, `recording`, `build`
  {sha, sim fingerprint}, `preset`, `gamepads` [{id, mapping, buttonsUsable}]).
- `input(script)` queues scripted input consumed one frame per step (in either mode; scripted input
  beats live devices). Two syntaxes, mixable per token (`src/debug/dsl.ts`):
  spec DSL `".10 R30 R+J12 D+A1"` (`.` nothing, L R U D, J jump, X dash, A attack; number = frames)
  or Phase 0 `"right*30 right+jump*12 _*20"`; also `[{hold: ['right'], frames: 30}, ...]` or raw masks.
  Pressing the same button twice needs a gap (`J1 .1 J1`): edges come from held transitions.
- In manual mode live keyboard/gamepad input is ignored, so agent runs are deterministic.
- `state()`, `hash()`, `load(roomId, spawn?)`, `rooms()`, `seed(n?)` (reseeds RNG in place, doesn't reset world).
- `screenshot(scale=1, {label})` renders and returns a PNG data URL; `label: true` burns in `f<frame>`.
- `step(n)` / `trace(n)` throw unless n is a non-negative integer.

## Inspection (L2)
- `view()`: normalised player `{x,y,w,h, vx,vy (px/FRAME), grounded, facing, state, wallDir, airDash,
  doubleJump, dashCooldown, dead}` via `src/debug/sim-adapter.ts` (same shape on any controller).
- `trace(n, script?)`: queues `script` (optional), steps n frames, returns `[{f, in, p: view, ev}]`, one per
  frame. `traceText(n, script?)` = same as a fixed-width table (best for reading).
- `events(n?)` last n events `{f, e:{type, kind?, raw}}` (ring buffer, 2000); `eventLog(n?)` as lines
  `f123 jump:ground x=.. y=..`; `lastEvents()` = the last step's. `f` = the frame the step produced.
- `targets()`: goals/spawns in the room as px rects (what the bot and tapes target).

## State and tuning (L2)
- `save()` / `snapshot()` → plain state; `restore(s)` replaces it (recorded as a replay `state` op).
- `setTuning({jump:{gravity:4000}})` deep-merges; `setTuning('jump.gravity', 4000)` sets one path
  (throws on typos). `resetTuning()` back to the current preset. `preset(name?)` applies a preset from
  the controller's `PRESETS` (only `default` until the spec controller lands) and returns `{current, names}`.
- `assists({coyote:false})` reads/sets assist toggles (Phase 0 maps coyote/jumpBuffer/variableJump to
  frame counts); `abilities({dash:true})` grants abilities in the live state (false if unsupported).
- Tuning edits made while recording a replay are captured automatically (recorder diffs tuning).

## Replays and tapes
- `replay.record()` / `replay.stop()` → `Replay` JSON (start state + tuning + input masks + `ops` +
  endHash + `meta` {sha, sim, stateVersion}). `load()`, `seed()`, tuning edits and `restore()` while
  recording are captured as `ops`. `replay.play(r)` loads start state **and writes the replay's tuning
  into the live tuning object**, queues inputs, applies ops as they come due (then `step(n)`);
  `clearInput()` cancels. `replay.verify(r)` runs headless; on mismatch `message` says whether the
  replay is from an older sim build (re-record) or the same one (determinism bug).
- `tape.record()` / `tape.stop({name, expect})` → a golden tape (see replays-and-tapes.md);
  `tape.check(t)` runs one headless in the page; `tape.play(t)` puts it on the live game.
- `headless(scenario)` runs a scenario in the page without touching the live game.

## Overlays
- `debug.hitboxes(on?)` (also F2), `debug.tuningPanel(on?)` (also backquote),
  `debug.trail(on?, {length, every})` motion trail + event markers (see clip-tool.md), `tuning` (live object).

## playwright-cli
```
playwright-cli -s=me open "http://localhost:5180/?manual"
playwright-cli -s=me eval "window.__game.traceText(30, 'R10 R+J20')"
playwright-cli -s=me screenshot
```
In an isolated worktree agent, the sandbox refuses any command containing `eval`. Put the code in a
file and use `playwright-cli -s=me --raw run-code --filename /path/check.js`, where the file is
`async (page) => page.evaluate(() => JSON.stringify(window.__game.view()))`.
