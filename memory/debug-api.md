# window.__game debug API and URL params

Source: `src/debug/api.ts` (typed `GameDebugApi`). Everything returns plain JSON. Tool-facing reads
of the player/tuning/rooms go through `src/debug/sim-adapter.ts` (see sim-adapter.md).

- URL params: `?manual` (start paused, only `step()` advances), `seed=<n>`, `room=<id>` (default `hub`),
  `spawn=<name>`, `preset=opus|celeste|hk`.
- Keys: 1-9/0 load gym-01..10, Shift+1-4 gym-11..14, H hub, B blind A/B swap (slots in the panel),
  F1/F2 hitboxes, backquote tuning panel.

## Stepping and input
- `step(n)` switches to **manual mode** (real-time loop stops advancing), renders, returns the state.
  `pause()` / `resume()` switch modes; `mode()`. `step(n)` / `trace(n)` throw unless n is a non-negative integer.
- `input(script)` queues scripted input consumed one frame per step (either mode; beats live devices).
  Spec DSL `".10 R30 R+J12 D+A1"` (L R U D, J jump, X dash, A attack; `.` = nothing) or long form
  `"right*30 right+jump*12 _*20"`, mixable; or `[{hold: ['right'], frames: 30}, ...]`, or raw masks.
  One parser: `src/input/script.ts` (`parseInputScript`, `formatInputScript`, `maskLabel`).
  Pressing the same button twice needs a gap (`J1 .1 J1`). `clearInput()` also cancels playback.
- In manual mode live keyboard/gamepad input is ignored, so agent runs are deterministic.
- `info()`: renderer, mode, frame, recording, `build` {sha, sim fingerprint}, `preset`, `gamepads`.

## Inspection
- `state()`, `hash()`, `rooms()`, `load(roomId, spawn?)`, `seed(n?)` (reseeds RNG in place).
- `view()`: normalised player `{x,y,w,h, vx,vy (px/f), grounded, facing, state, wallDir, airDash,
  doubleJump, dashCooldown, dead}`.
- `trace(n, script?)`: queues `script`, steps n frames, returns `[{f, in, p: view, ev}]`.
  `traceText(n, script?)` = the same as a fixed-width table (best for reading).
- `events(n?)` last n events `{f, e:{type, kind?, raw}}` (ring buffer, 2000, includes load events);
  `eventLog(n?)` as lines `f123 jump:ground x=.. y=..`; `lastEvents()` = the last step's.
  Event names: sim-architecture.md. The log hooks `game.bus.onAny` + `game.afterStep` (no patching).
- `targets()`: goals (`G`, `g`), doors (`exit:<char>`), spawns (`spawn:<name>`) as px rects.
- `camera()` (pre-shake view x/y, zone, trauma), `renderState()` (last drawn player position, latency probes).
- `screenshot(scale=1, {label})` renders and returns a PNG data URL; `label: true` burns in `f<frame>`.

## State, tuning, movement switches
- `save()` / `snapshot()` → plain state; `restore(s)` replaces it (recorded as a replay `state` op).
- `tuning` is the live object. `setTuning({jump:{gravity:1.2}})` deep-merges; `setTuning('jump.gravity', 1.2)`
  sets one path (throws on typos). `resetTuning()` = back to the current preset.
- `preset(name?)` → `{current, names}`; applies `opus|celeste|hk` through the tuning panel (keeps profiles).
- `assists(partial?)` → all assist booleans, e.g. `assists({coyote: false})` (throws on unknown names).
- `abilities(partial?)` → `{wallJump, dash, doubleJump, pogo}`; `profile(name?)` → movement profile.
  Both go through `setState`, so recordings capture them. Tuning edits are captured by the recorder's diff.

## Replays and tapes
- `replay.record()` / `replay.stop()` → `Replay` JSON (start state + tuning + masks + `ops` + endHash +
  `meta` {sha, sim, stateVersion}). `load()`, `seed()`, tuning edits and `restore()` while recording are
  `ops`. `replay.play(r)` loads start state **and writes the replay's tuning into the live tuning**,
  queues inputs, applies ops as they come due (then `step(n)`). `replay.verify(r)` runs headless; on a
  mismatch `message` says whether it is from an older sim build or the same one (determinism bug).
- `tape.record()` / `tape.stop({name, expect})` → a golden tape (replays-and-tapes.md); `tape.check(t)`
  runs one headless in the page (cross-runtime check, no rendering); `tape.play(t)` loads it into the live game.
- `headless(scenario)` runs a scenario in the page without touching the live game.

## Overlays
- `debug.hitboxes(on?)`, `debug.tuningPanel(on?)`, `debug.trail(on?, {length, every})` (motion trail +
  event markers, see clip-tool.md).

## playwright-cli
```
playwright-cli -s=me open "http://localhost:5180/?manual"
playwright-cli -s=me eval "window.__game.traceText(30, 'R10 R+J20')"
playwright-cli -s=me screenshot
```
Some sandboxes refuse any command containing `eval`. Put the code in a file and run
`playwright-cli -s=me --raw run-code --filename /path/check.js`, where the file is
`async (page) => page.evaluate(() => JSON.stringify(window.__game.view()))`.
