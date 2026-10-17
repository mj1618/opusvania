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
- **Rooms** (memory/rooms.md, memory/world.md): `?room=<id>` (a test boot: new game there, the save slot untouched;
  `test-grove` is the old demo level, and every Grove coordinate in this file is a test-grove one); no `?room` =
  the game (Continue from the slot; `?fresh` = new game; memory/save.md). `?abilities=all | none | glide,wallJump,doubleJump,dash`
  (what she owns instead of the room's starting kit; kept through restarts). The tuning panel's first row is
  the **Room** list (`goto`: she goes there, the save kept; it follows her through exits). The tools take `--room <id>`.

## Calls
- `room()` the room's id; `room(id)` = `goto(id)`. `rooms()` every id (the game's, then the test rooms).
  `load(id?)` = a new game in that room (default the current one), fresh save, in place (no reload).
- **World** (memory/world.md): `goto(id, x?, y?)` puts her in any room (feet at x, y; default its spawn), at rest,
  the save kept, renderers rebuilt; returns the state. `world()` -> `{start, rooms: [{id, x, y, w, h, placed,
  region}], links: {'room#exit': {to, exit} | null}, doors}`. `save()` -> `{save, stored (the slot), autosave}`,
  `clearSave()`. `map(on?)` the map overlay (Tab). `debug.gpu(list?)` -> `{textures, textureMB, buffers, builds}`
  (what the GPU holds; `list` adds every texture): the leak checks read it.
- `abilities()` → `{owned, all}` (`state().save.abilities`); `grant('glide', ...)` / `grant('all')`,
  `revoke('dash')` / `revoke('all')`: from the next step, kept by `load()` / R / a room restart; no redraw.
- wood-hatch fades up from black at boot (not with `?manual`) and on `load()`: render time has to run (`step` / `tick`
  ~150 frames) before the picture is up.
- **Capturing the opening (or any whole run) in a `?manual` page:** call `g.load()` first, then step. `load()` emits
  `roomEnter {from: 'load'}` + `spawn` (since 2026-10-17, round 4), so render restarts exactly as at a real boot: the
  fade up, the cocoon framing, the swarm waiting for the hatch (before that, a paused page at frame 0 took the load
  for a teleport and started the swarm late, specks on the moon before the hatch). A `teleport` instead skips the
  hatching on purpose (no fade, no hatch beats, the swarm's late stream): use it for stills of a place, not of the
  opening. Recipe: `npm run clip -- --setup "g.load()" --pre 0 --wide --script "<presses and run>"`.
- The hatching (`wood-hatch` starts shut in the cocoon, `state().hatch`): three presses of any button after the
  fade-up (150 frames), or wait 720 frames. **A `teleport` ends it silently**, so the capture tools just teleport.
- `state()` the sim state (`src/sim/state.ts`); `hash()`; `info()` (mode, frame, clock, `view` = the logical view `{w, h, left, top, scale}` and `safe`, canvas size, GPU);
  `scene()` the scene data; `events()` events of the last `step()` call, `events(n)` of the last n frames
  (each with `f`, the frame).
- `input('R30 R+J12 .5')` queues scripted input: `R L U D`, `J` jump, `X` dash, `A` attack, `O` offer, `.` nothing, `+` combines,
  number = frames; a re-press needs a gap (`J1 .1 J1`). Long form `right+jump*12` also works. `clearInput()`.
- `pickups()` → `{count, taken, worth, list: [{id, kind, x, y, state: waiting|flying|taken}]}`; the count is
  also `state().pickups.count`. Dev handle `window.__pickups` (renderer, `cfg`, `cpuMs`): pickups.md.
- `lures()` → `{snuffed, freed, total, caught: {id, frames, beats, of, out} | null, pullX, grace: {id, frames} | null,
  list: [{id, kind, x, y, spin, state: burning|out, hp, hpMax, radius, core, moths, outFrame}]}` (memory/lures.md).
  `debug.labels(on?)` (also the G key): a greybox room's labels and notes (memory/greybox.md). `?room=lab-lamps` is the
  lamp lab (greybox, every ability).
- `kit()` → `{thorns, seedCases, bark: [{id, ..., floor, hp, hpMax, broken}], gates: [{id, flag, open}], triggers: [{id, sets, set}], flags, hold}`;
  `flag()` lists the save's story flags, `flag(name)` sets, `flag(name, false)` clears (gates follow next step).
  `lures().list[].x, y` = where the flame is now (a swinging one moves). `cam().zoom` < 1 inside a camera zone.
  `?room=lab-kit` is the level-kit lab (memory/level-kit.md). F2 draws the kit's boxes.
- `pods()` → `{burst, total, worth, list: [{id, x, y, mount, state: closed|open, hp, hpMax, worth, paid,
  left}]}` (`paid` = glints set loose so far, `left` = still flying to her): combat.md.
- `enemies()` → `{alive, total, list: [{id, kind, x, y (feet centre), box, home (the scene's x, y: a burrback's
  feet, a lampwing's home centre), facing, hp, hpMax, mode, modeFrames, braced, strikeCd, gone, vx, vy, target}]}`; the full
  records are `state().enemies` (enemies.md).
- **Creatures (memory/creatures.md)**: `creatures()` -> `{lit, grab: {id, x, y, beats, of, frames} | null, grace, webs: [{id,
  strands, intact, cut, fell, slack, touch}]}`; `enemies().list[]` has `sense, guards, dispersed, stunned, feints`.
  `?room=lab-creatures` is the creature lab. The overlay / greybox draw webs (strands), a yellow dot over a creature
  aware of her, a grey dash over one asleep / roosting / leaving, a draining bar over a tell (red brace, orange feint).
- `giving(wallet?)` → `{wallet, seen, level, steps, reach: {burrback: {brace, aware}, lampwing}, target, gift, offerCd,
  gifted, heartGiven, aware: [ids]}`; with a number it sets the wallet first (being seen IS the wallet: giving.md).
  `enemies().list[]` has `aware, calm, gift, gifts`. Keys in the page: V / F / I offer.
- `health()` → `{hp, hpMax, invuln, stagger, faded, safe: {x, y}}`; `health(n)` sets hp to n (1..hpMax)
  first, e.g. `health(1)` then walk into a burrback to see a fade.
- `lanterns()` → `{lit, total, wallet, spent, list: [{id, x, y (foot), box, cost, state: dormant|channel|lit,
  channel, of, rest, refused, pledged, litFrame, restPoint}]}`; `goal()` → `{lit, total, wallet, spent, gathered (= both),
  restAt (lantern or lamp id | null), reformAt (where she would re-form now: nearest light | null), restHold (she re-formed there and has not stepped out yet: no rest), lamps: {lit, total}, heart: {x, y, box, awake, frames, hinted}, ending: {gathered, held, frames, of,
  ended, glints, time, kills, hits + the tally, offered, offerTier}, offer: {total, given, tier, tiers}, run: {time, hits, kills, deaths}, lost, drops: [{id, x, y, value,
  left, timer}], sanctuary: {burrback, lampwing, lamp: {burrback, lampwing}}}` (goal.md). There is no call to set the wallet:
  gather for real (teleport onto great glints: `teleport(3768, 192)` (great-crown, on the bough since playtest 6; it was 3640), `(3648, 1280)`, each + `step(70)`).
- Playtest 5 additions: `enemies().list[]` has `rams, roused, stirred, dives`; `lanterns().list[]` has `key` (the
  pickup id it wants, or null) and `keyed`; `goal().heart` has `ready, waited`; `goal().grove {flowers, paths,
  canopy}`; `goal().ending.offerNext`. Hitboxes: a lampwing is thick red in its dive, green in its stall.
- `audio` (memory/audio.md): `state()`, `mute(bool)`, `volume(bus | 'master', dB)`, `cues(n)` (the last cues routed, muted or not), `record()` then `render({mute?: ['hush']})` (offline WAV base64 + levels). Null-safe: `g.audio?.`.
- `lamps()` → the same record as `lanterns()` for the wayside lamps (`scene.lamps`; the hitbox
  overlay shows them as thin green boxes, gold once lit).
- `load()` restarts the scene (glints come back, pods close, enemies return, full health, lanterns dark, the heart asleep, the ending undone). `teleport(x, y)` puts the feet centre there at rest and snaps the camera (health, enemies, the last safe ground and the slash count `attackSeq` are kept).
- `cam()` → `{x, y, zoom, follow, override}` (view centre, world px). `cam({x, y, zoom})` overrides (any
  subset; missing x/y follow the game camera), `cam({on: 'player', zoom: 4})` tracks the player,
  `cam(null)` releases. Overrides are not clamped to the scene.
- `tuning()`, `setTuning('run.maxSpeed', 12)` or `setTuning({run: {maxSpeed: 12}})`. `lights()`.
  `render()` redraws. `debug.hitboxes(on)` (also F2; scene edges and solids that take no kick are grey; shows enemy boxes too: magenta, orange while hurt, grey dead, **thick red while a burrback is braced (a white bar on its armoured front, a red line along the ground as far as its ram will go), green while it stands spent**, with a tick on the facing side; a lampwing also gets its territory circle, a line to what it is drawn to (yellow while curious / pursuing) and its velocity in white; her box is white while invulnerable; lantern trigger boxes are cyan, gold once lit, with a white bar over them that fills while she kindles or rests and a gold line under the one she re-forms at, and once lit a gold line along the ground burrbacks keep off and the circle lampwings give up at; a dropped cluster is a yellow diamond; the heart's box is dim violet asleep, orange awake, white once reached), `debug.panel(on)` (also backquote), `debug.post(on)` (post-processing), `debug.clearColor(rgb)` (what an uncovered pixel shows; view-size.md).

## Gotchas
- In manual mode the page only redraws on API calls; change something by hand, then call `render()`.
- `step()` with a big n renders every step's update but presents once: fine on a real GPU.
- Keys in the page: arrows/WASD, Z/Space/K jump, X/L/Shift dash, C/J attack, Tab map, R restart (a game page: back
  to the last save; a `?room=` page: new game in the room).
- After `gather` no
  input reaches her (`goal().ending.held`): `load()` to play on.
- A scripted `input()` longer than the `step(n)` after it leaves frames in the queue: later one-frame inputs then
  lag a frame behind (a walk-to loop oscillates). Count the script's frames.
- Lampwings are not drawn yet: the hitbox overlay is the only way to see one. A teleport inside 260 px of one
  (in plain view) starts its tell on the next step.
- Enemies keep walking through every `step()`: a teleport next to one a few hundred frames later finds it
  somewhere else. Read `enemies()` first, or `load()` for the start positions.
- `?nopickups` removes the enemies too (src/main.ts). None patrols the spawn ground or the terrace. **burr-shaft paces
  the shaft floor (3378-3522)**: the close-ups at 3456, 1280 run without enemies (`?nopickups`); with `--pickups` a
  hero placed there is rammed (the wide stop `shaft-pit` stands at 3556 for that reason).
- `goto` / a crossing rebuilds the room's renderers: a painted room takes ~150 ms (and ~25 s in software GL).
- `events(n)` is not cleared by `load()` and frame numbers start again at 0: reload the page between runs.
  (A live bot that calls `load()` twice in one page sees nothing of the second run through `events(n)`: seen 2026-10-14.)
- `playwright-cli` takes about a second a call: nothing can react to a 26-frame tell through it. For a live
  fight, one `eval` of an async function that watches `state()` per animation frame and dispatches real
  `KeyboardEvent`s (`code: 'ArrowRight' | 'KeyZ' | 'KeyC'`) on `window`.
