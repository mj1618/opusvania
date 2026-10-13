# Pickups: glints (the first collectible)

Vesper is drawn to light, so what she gathers is light. `glint` = a tiny gold four-point star
(worth 1); `great` = a larger one cradled in a bud (worth `greatValue`, 5). Data: `pickups:
[{id, kind, x, y}]` in `content/scene/grove.json` (x, y = centre of the light), validated in
`src/scene/index.ts` (unique ids, inside the scene, not inside a solid).

## Sim (`src/sim/pickups.ts`, numbers in `tuning.pickups`)
- State: `state.pickups = {timers[], count, taken, combo, comboTimer, gate}`; `timers[i]` belongs to
  `scene.pickups[i]`: 0 waiting, n > 0 collected in n steps, -1 taken.
- A waiting pickup wakes when it is within `wakePx` (84; great 56) of the nearest point of the body
  box. From then on it is hers: collected exactly `flightFrames` (18; great 54) steps later wherever
  she is. Pickups woken together queue `staggerFrames` (4) apart, nearest first (`gate`).
- Events: `pickupWake {id, kind, x, y, frames}`; `pickup {id, kind, value, x, y, px, py, combo,
  total}`. Here `x, y` = where the pickup hung (NOT the feet), `px, py` = body-box centre at the
  moment it goes in, `combo` = 0, 1, 2... through a run less than `comboFrames` (50) apart.
- Restart (`R`, `__game.load()`) makes a new state, so everything is back; `teleport` keeps the count.
- The sim only decides when; the flight is render. Timing history: 60 px / 20 frames = every pickup
  a long chase from behind; 84 px / 14 = absorbed where it hung, but the flight (9 frames) could not
  be seen; 84 px / 18 (5 notice + 13 flight) = she passes it, it swings in behind and catches up.

## Render (`src/render/pickups/`)
- Layers: `pickupsBack` (under `character`: the buds) and `pickups` (over it, under
  `playfieldFront`: the lights and the three sepals that cup a great one).
- `batch.ts`: ONE mesh for everything luminous (glints, trails, motes, soft flares), quads with a
  kind, refilled on the CPU each frame. Output is premultiplied: light is additive (alpha 0); a small
  amber body and a pocket of shade round it are laid over (alpha > 0). The shade is what keeps a gold
  star readable against the bright light well; it cannot be seen in the dark zones.
- `index.ts`: reads `sim.pickups.timers` every frame (so load / state jumps just show) and the two
  events for the animation. A flight never runs ahead of the sim (`frame0`): frozen mode holds it.
  Flight = notice (swell, lean away), then `flight.seconds` of lag-then-slingshot (`s ** lag` toward
  her moving chest, with a sideways swing that peaks as the catch-up starts), a short ribbon that
  closes up over a few frames, a soft flare on her and motes that inherit 72% of her velocity.
- Great glint ceremony: sepals spring open at wake, the light lifts out, a corolla of soft petals of
  light unfolds (`corolla`, rotated flare quads), motes wind upward (`M_SPIRAL`), one flat swell of
  light runs out along the ground both ways (`wave`), then the flight with motes gathering into her
  chest (`M_GATHER`). No rings anywhere: they read as interface.
- `holder.ts`: the bud. Roots in a tuft on the nearest top below the light, or hangs from the nearest
  underside above (`findRoot`; a hanging root sits `HANG_SAG` px lower, inside the island's painted
  taper). Colours per zone (`TONES`, blended with `zoneWeights`). The three front sepals have twins
  in the back layer that take over as the bud opens, so open sepals never cross her legs.
- Up to 2 great glints near the view register as point lights `glint0/1` (intensity 0.22: higher
  bleaches the plants round the bud).
- Knobs: `config.ts` (`GLINTS`), live through `window.__pickups.cfg`; `__pickups.cpuMs`, `.debug()`.
  Shapes and brightness of the lights are in the shader.
- HUD (`src/render/hud/`): outside the post stage, top left. The icon is a second `GlintBatch`
  (the world glint drawn 1.7x), digits are painted once into a canvas atlas (system serif stack, own
  shadow and glow). Appears on a pickup, ticks one by one, fades 3.6 s after the last.
- `?nopickups` (src/main.ts) boots the scene with no pickups, so no glints, no counter and no skin
  reaction; shots / clip / look:stats use it by default (`--pickups` to show them).

## Lumen pods (render side; rules in combat.md)
- `pod.ts` `PodView`: Graphics drawn once per pod in the bud tones (`TONES`), in `pickupsBack` (she
  walks in front of them). Four bracts (two back, two front) round a lens of light that shows down
  the seam; `sit` = on a rosette, `hang` = on a short stem fixed to the nearest underside / branch.
  Springs for swing, bract opening and squash; `strike()` on `podBurst`, `set()` from `sim.pods.hp`
  every frame (restart shuts them, a state jump opens them without effects).
- The husk must be a step LIGHTER than the leaves behind it (front = front tone mixed 30% toward the
  lit tone, plus a rim on the key side). In the plain bud tones it vanished and the seam read as a
  floating orange slit. The seam lens is 7 px wide; at 11 px it looked like a cat's eye.
- Burst (in `index.ts`): one 0.11 s flare of 19 px at the pod, 7 husk flecks (`K_CHIP`, opaque, with
  gravity) and 6 motes along the blow, bracts spring open and stay, darker, with an ember that dies in
  `POD.ember` s. No light is registered and nothing is drawn at her end except the usual absorb.
- Spilled glints are ordinary flights with `pod >= 0`: they pop out of the husk on a small arc to a
  fan above it, hang, then fly with the usual lag-then-slingshot; `dur` = `frames + k * stagger` from
  the event, so each lands on its `pickup {pod: true}` event (matched oldest first). They use four
  stand-in `Item`s per pod, not scene pickups.
- `?nopickups` removes pods too.

## Look decisions (learned by looking)
- A round glowing dot is a firefly (the scene has orange ones). The four-point star with a
  whiter-gold core is the silhouette that says "collectible"; every few seconds an arm flash
  (`flash` in the shader) sets it further apart. Keep halo and body small or the bloom and the
  vignette at frame edges turn stars back into round orange dots.
- In the low-key picture they are ~14 px tall. Bigger and they clutter: one screen holds up to 22.
- Bloom + grade roughly double anything additive: author at half the brightness you want.
- Placement: arcs were taken from real jump paths (run the sim with an input script and print the
  box centre every few frames), then thinned to 3-5 per jump.

## Where they are (52 glints + 5 great = 57 pickups, worth 77)
spawn line 3, pool arc 5, pool shallows 3, onto the left bank 3, bank→F1 3, F2→F3 3, F3→F4 5,
F5→high ledge 3, trunk A top→trunk B top 4, wall-jump shaft 5, left branch 3, step onto the mid rise
3, root→right branch 3, branch→F6 3, F7→far ledge 3. Great: left bank corner, top of trunk B, under
trunk B's root arch, far ledge, hanging under F4 (needs a double jump from the ground).
`tests/unit/pickups-pilot.test.ts` gathers all 57 with the real controller from stations the route
pilots reach; move a rect or a pickup and it names what became unreachable.

## Gotchas
- The e2e smoke boots on software GL in ~25 s of its 30 s budget: fold new assertions into an
  existing test rather than adding a test (a fourth worker made two time out).
- `page.evaluate` with arrow/inner functions from a `tsx` script dies with `__name is not defined`:
  pass the code as a string.
- ffmpeg's `tile` to PNG picks a palette format: add `-pix_fmt rgb24` or contact sheets come out
  posterised and yellow.
