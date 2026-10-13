# Pickups: glints (the first collectible)

Vesper is drawn to light, so what she gathers is light. `glint` = a small gold four-point star in a
bead (worth 1); `great` = a larger one cradled in a bud (worth `greatValue`, 5). Data: `pickups:
[{id, kind, x, y}]` in `content/scene/grove.json` (x, y = centre of the light), validated in
`src/scene/index.ts` (unique ids, inside the scene, not inside a solid).

## Sim (`src/sim/pickups.ts`, numbers in `tuning.pickups`)
- State: `state.pickups = {timers[], count, taken, combo, comboTimer, gate}`; `timers[i]` belongs to
  `scene.pickups[i]`: 0 waiting, n > 0 collected in n steps, -1 taken. State version 7.
- A waiting pickup wakes when it is within `wakePx` (84; great 56) of the nearest point of the body
  box. From then on it is hers: collected exactly `flightFrames` (14; great 46) steps later wherever
  she is. Pickups woken together queue `staggerFrames` (3) apart, nearest first (`gate`).
- Events: `pickupWake {id, kind, x, y, frames}`; `pickup {id, kind, value, x, y, px, py, combo,
  total}`. Here `x, y` = where the pickup hung (NOT the feet), `px, py` = body-box centre at the
  moment it goes in, `combo` = 0, 1, 2... through a run less than `comboFrames` (50) apart.
- Restart (`R`, `__game.load()`) makes a new state, so everything is back; `teleport` keeps the count.
- The sim only decides when; the flight is render. Timing was tuned so that at run speed a glint is
  absorbed about where it hung (wake 84 px ahead + 14 frames at 9.6 px/f). With 60 px / 20 frames
  she outran it and every pickup became a long chase from behind.

## Render (`src/render/pickups/`, layer `pickups`: over `character`, under `playfieldFront`)
- `batch.ts`: ONE mesh for everything luminous (glints, trails, sparks, rings, flares), quads with a
  kind, refilled on the CPU each frame. Output is premultiplied: light is additive (alpha 0), the
  bead's amber body and a small pocket of shade are laid over (alpha > 0). That body is what keeps
  gold readable against the pale light well.
- `index.ts`: reads `sim.pickups.timers` every frame (so load / state jumps just show) and the two
  events for the animation. Wake = notice (swell, brighten, lean away) then the flight in the last
  `flight.seconds`; a `pickup` event = burst at her chest (flare that follows her, sparks that
  inherit 72% of her velocity so they stay round her).
- `holder.ts`: the bud of a great glint, Graphics drawn once. It roots on the nearest top below the
  light or hangs from the nearest underside above (`findRoot`, 170 px); sepals fall open on a spring
  when it is taken and stay open.
- Up to 2 great glints near the view register as point lights `glint0/1` (intensity 0.26: at 0.7 the
  post light pass bleached the plants round the bud to mint).
- Knobs: `config.ts` (`GLINTS`), live through `window.__pickups.cfg`; `__pickups.cpuMs`, `.debug()`.
- HUD (`src/render/hud/`): outside the post stage, top left. The icon is a second `GlintBatch`
  (same shader as the world glints), digits are painted once into a canvas atlas (system serif
  stack, own shadow and glow). Appears on a pickup, ticks one by one, fades 3.6 s after the last.

## Look decisions (learned by looking)
- A round glowing dot is a firefly (the scene has orange ones). The four-point star is the
  silhouette that says "collectible"; keep the glow small so the star survives the bloom.
- Rings round the hero or round a small glint read as soap bubbles / UI. Only great glints get rings.
- Bloom + grade roughly double anything additive: author at half the brightness you want.
- Placement: arcs were taken from real jump paths (run the sim with an input script and print the
  box centre every few frames), then thinned to 3-5 per jump.

## Where they are (51 glints + 5 great = 76)
spawn line 3, pool arc 5, pool shallows 3, onto the left bank 3, bank→F1 3, F2→F3 3, F3→F4 5,
F5→high ledge 3, trunk A top→trunk B top 4, wall-jump shaft 5, left branch 3, step onto the mid rise
3, root→right branch 3, branch→F6 3, F7→far ledge 3. Great: left bank corner, top of trunk B, under
trunk B's root arch, far ledge, hanging under F4 (needs a double jump from the ground).

## Gotchas
- `npm run shots` teleports the hero to its stops, and three of them are next to glints, so wide
  shots show a pickup in progress and the counter. Use `__game.cam` stills for a clean plate.
- The e2e smoke boots on software GL in ~25 s of its 30 s budget: fold new assertions into an
  existing test rather than adding a test (a fourth worker made two time out).
- `page.evaluate` with arrow/inner functions from a `tsx` script dies with `__name is not defined`:
  pass the code as a string.
