# Debug API (`window.__game`)

Defined and documented in `src/debug/api.ts` (the interface there is the reference). Everything returns
plain JSON. `document.body.dataset.ready === 'true'` once booted (`dataset.error` on failure).

## Time model
- `realtime`: normal play. `frozen`: the sim stands still, render time runs (wind, glow, particles keep
  animating). `manual`: nothing moves except through the API, so results are reproducible.
- `step(n)` runs n sim steps **and** n/60 s of render time (renderers get `dt = 1/60` per step), draws,
  returns the state → manual. `tick(n)` advances render time only → manual. `freeze()` / `freeze(false)`,
  `pause()` (manual), `resume()` (realtime).
- URL: `?manual` boots paused (tools and tests do this), `?seed=n`, `?hitboxes`, `?nopickups` (the scene
  without glints, pods, enemies, lanterns, heart or counter; the capture tools use it unless given `--pickups`).

## Calls
- `state()` the sim state (`src/sim/state.ts`); `hash()`; `info()` (mode, frame, clock, canvas size, GPU);
  `scene()` the scene data; `events()` events of the last `step()` call, `events(n)` of the last n frames
  (each with `f`, the frame).
- `input('R30 R+J12 .5')` queues scripted input: `R L U D`, `J` jump, `X` dash, `A` attack, `.` nothing, `+` combines,
  number = frames; a re-press needs a gap (`J1 .1 J1`). Long form `right+jump*12` also works. `clearInput()`.
- `pickups()` → `{count, taken, worth, list: [{id, kind, x, y, state: waiting|flying|taken}]}`; the count is
  also `state().pickups.count`. Dev handle `window.__pickups` (renderer, `cfg`, `cpuMs`): pickups.md.
- `pods()` → `{burst, total, worth, list: [{id, x, y, mount, state: closed|open, hp, hpMax, worth, paid,
  left}]}` (`paid` = glints set loose so far, `left` = still flying to her): combat.md.
- `enemies()` → `{alive, total, list: [{id, kind, x, y (feet centre), box, home (the scene's x, y: a burrback's
  feet, a lampwing's home centre), facing, hp, hpMax, mode, modeFrames, gone, vx, vy, target}]}`; the full
  records are `state().enemies` (enemies.md).
- `health()` → `{hp, hpMax, invuln, stagger, faded, safe: {x, y}}`; `health(n)` sets hp to n (1..hpMax)
  first, e.g. `health(1)` then walk into a burrback to see a fade.
- `lanterns()` → `{lit, total, wallet, spent, list: [{id, x, y (foot), box, cost, state: dormant|channel|lit,
  channel, of, rest, refused, litFrame, restPoint}]}`; `goal()` → `{lit, total, wallet, spent, gathered (= both),
  restAt (lantern id | null), heart: {x, y, box, awake, frames, hinted}, ending: {gathered, held, frames, of,
  ended, glints, time, kills, hits}, run: {time, hits, kills}}` (goal.md). There is no call to set the wallet:
  gather for real (teleport onto great glints: `teleport(3640, 192)`, `(3648, 1280)`, each + `step(70)`).
- `load()` restarts the scene (glints come back, pods close, enemies return, full health, lanterns dark, the heart asleep, the ending undone). `teleport(x, y)` puts the feet centre there at rest and snaps the camera (health, enemies, the last safe ground and the slash count `attackSeq` are kept).
- `cam()` → `{x, y, zoom, follow, override}` (view centre, world px). `cam({x, y, zoom})` overrides (any
  subset; missing x/y follow the game camera), `cam({on: 'player', zoom: 4})` tracks the player,
  `cam(null)` releases. Overrides are not clamped to the scene.
- `tuning()`, `setTuning('run.maxSpeed', 12)` or `setTuning({run: {maxSpeed: 12}})`. `lights()`.
  `render()` redraws. `debug.hitboxes(on)` (also F2; shows enemy boxes too: magenta, orange while hurt, grey dead, with a tick on the facing side; a lampwing also gets its territory circle, a line to what it is drawn to (yellow while curious / pursuing) and its velocity in white; her box is white while invulnerable; lantern trigger boxes are cyan, gold once lit, with a white bar over them that fills while she kindles or rests and a gold line under the one she re-forms at; the heart's box is dim violet asleep, orange awake, white once reached), `debug.panel(on)` (also backquote).

## Gotchas
- In manual mode the page only redraws on API calls; change something by hand, then call `render()`.
- `step()` with a big n renders every step's update but presents once: fine on a real GPU.
- Keys in the page: arrows/WASD, Z/Space/K jump, X/L/Shift dash, C/J attack, R restart.
- After `gather` no
  input reaches her (`goal().ending.held`): `load()` to play on.
- A scripted `input()` longer than the `step(n)` after it leaves frames in the queue: later one-frame inputs then
  lag a frame behind (a walk-to loop oscillates). Count the script's frames.
- Lampwings are not drawn yet: the hitbox overlay is the only way to see one. A teleport inside 260 px of one
  (in plain view) starts its tell on the next step.
- Enemies keep walking through every `step()`: a teleport next to one a few hundred frames later finds it
  somewhere else. Read `enemies()` first, or `load()` for the start positions.
- `?nopickups` removes the enemies too (src/main.ts). None patrols the spawn ground or the trunk shaft, where the
  close-up shots run.
