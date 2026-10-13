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
  without glints or counter; the capture tools use it unless given `--pickups`).

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
- `load()` restarts the scene (glints come back, pods close). `teleport(x, y)` puts the feet centre there at rest and snaps the camera.
- `cam()` → `{x, y, zoom, follow, override}` (view centre, world px). `cam({x, y, zoom})` overrides (any
  subset; missing x/y follow the game camera), `cam({on: 'player', zoom: 4})` tracks the player,
  `cam(null)` releases. Overrides are not clamped to the scene.
- `tuning()`, `setTuning('run.maxSpeed', 12)` or `setTuning({run: {maxSpeed: 12}})`. `lights()`.
  `render()` redraws. `debug.hitboxes(on)` (also F2), `debug.panel(on)` (also backquote).

## Gotchas
- In manual mode the page only redraws on API calls; change something by hand, then call `render()`.
- `step()` with a big n renders every step's update but presents once: fine on a real GPU.
- Keys in the page: arrows/WASD, Z/Space/K jump, X/L/Shift dash, C/J attack, R restart.
