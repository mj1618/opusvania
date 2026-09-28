# window.__game debug API and URL params

Source: `src/debug/api.ts` (typed `GameDebugApi`). Everything returns plain JSON.

- URL params: `?manual` (start paused, only `step()` advances), `seed=<n>`, `room=<id>`, `spawn=<name>`.
- `step(n)` switches to **manual mode** (real-time loop stops advancing) and returns the new state.
  `pause()` / `resume()` switch modes; `mode()`, `info()` (`renderer`, `frame`, `recording`).
- `input(script)` queues scripted input consumed one frame per step (in either mode; scripted input
  beats live devices). Syntax: `"right*30 right+jump*12 _*20"` (`_` = nothing, count defaults to 1),
  or `[{hold: ['right'], frames: 30}, ...]`, or raw masks. Actions: left right up down jump dash attack special map pause.
- In manual mode live keyboard/gamepad input is ignored, so agent runs are deterministic.
- `state()`, `hash()`, `load(roomId, spawn?)`, `rooms()`, `seed(n?)` (reseeds RNG in place, doesn't reset world).
- `screenshot(scale=1)` renders and returns a PNG data URL of the canvas.
- `replay.record()` / `replay.stop()` → `Replay` JSON (start state + tuning + input masks + endHash);
  `replay.play(r)` loads start state and queues its inputs (then `step(n)`), `replay.verify(r)` runs it headless.
- `debug.hitboxes(on?)` (also F2), `debug.tuningPanel(on?)` (also backquote), `tuning` (live object).
- `audio.*` (memory/audio.md): `stats()` (context state, voices, playedByName, recent routed events, music),
  `play(name, {x,y,volume})`, `sounds()`, `mute(on?)`, `volume(bus, v?)`, `muffle('pause'|'underwater'|'none')`,
  `hum(colour, x?, y?)` → id, `seize(id)`, `levy(id, x, y)`, `stopHum(id)`, `music('sparse'|'full'|'stop')`,
  `render([scenario])` (offline levels), `scenarios()`. Audio stays `'locked'` until a real gesture.
- If a sandbox rejects `playwright-cli eval`, use `playwright-cli run-code "async page => await page.evaluate(() => ...)"`.

playwright-cli example:
```
playwright-cli -s=me open "http://localhost:5180/?manual"
playwright-cli -s=me eval "window.__game.input('right*30'), JSON.stringify(window.__game.step(30).player)"
playwright-cli -s=me screenshot
```
