# Movement controller

Code: `src/sim/player/player.ts` (controller), `params.ts` (tuning + assists → flat params),
`src/sim/physics/aabb.ts`, `src/sim/tuning.ts`. Everything is always enabled (no ability gating).

- **Order of operations matters**: freeze → latch presses → mode update (accel, gravity, dash, jump) →
  moveX then moveY (1 px steps, corner corrections) → post (timers, ground probe, walls, facing, events).
- **Rounding**: sub-pixel moves use round-half-away-from-zero (`roundHalfAway`). `Math.round` is
  asymmetric (-2.5 → -2) and would break mirror symmetry (tested in `tests/unit/movement.test.ts`).
- **Collision** is a linear scan over the scene's rects (`solidAt`), fine for tens of rects. Scene left /
  right / bottom edges are solid. One-ways block only when the box bottom is exactly on their line.
- **Coyote**: N usable *airborne* frames after the frame whose movement left the ground.
- **Jump buffer** also covers double jumps (`djBuf`); **landing preference**: a press while falling close
  to the ground stays buffered for a ground jump instead of spending the double jump.
- **Wall speed retention** stores vx only on the first blocked frame, is cancelled by opposite-sign vx and
  cleared by jumps and dashes; otherwise wall jumps get undone and the player glues to walls.
- **Wall slide** needs a held direction into the wall while falling; the cap ramps
  `min(slideMax, slideStartMax + slideRamp·slideT)` (2.5 → 6.5 px/f). Holding away for `stickFrames` lets go.
  Wall jump has a 20 px grace (no need to be sliding), forces vx for 8 frames, refills dash + double jump.
- **Dash**: 2 freeze frames (the press frame counts), then 12 frames at 24 px/f with vy = 0, exits at run
  speed; 24-frame cooldown; one per airtime; jump during a grounded dash = dash jump (vx 12).
- **Wing glide** (`tuning.glide`, toggle `assists.glide`): a flag inside mode `normal` (`gliding`), so
  ledge pop, wall-slide entry and retention all keep working. Decided at the top of `normal()`.
  - Starts when: airborne, jump held, Down not held, `vy > minVy` (1), and no buffered press is still
    waiting to become a jump (`jumpPending`: double jump left, coyote, wall in range, or ground within
    buffer reach). So a press is always the jump first; the hold after it is the glide.
  - **Held-jump rule**: a hold that launched a ground-type jump (ground/coyote/buffered/dash jump:
    `carried`) only glides once she is `carriedDropPx` (16) below the launch height. Flat jumps and jumps
    up to a platform are bit-for-bit what they were (tested against `assists.glide = false`); jumping off
    a ledge with jump held opens the wings as she drops past the ledge, with the double jump still in hand.
    Plain "any held jump glides" doubled the airtime of every held hop (49 → ~100 frames). Landing clears
    `carried`, so a jump still held when she walks off an edge glides at once. Double and wall jumps are
    never carried: hold and she glides from the apex.
  - Fall: above `fallSpeed` (4.8 = 22.5% of max fall) each frame sheds `max(catchMin, catchRate x excess)`:
    from max fall `21.3 → 16.4 12.9 10.5 8.8 7.6 6.8 6.2 5.8 5.4 5.0 4.8` (11 frames, 114 px lost).
    A linear or instant clamp read as hitting a shelf. Below it (just after an apex) `sinkAccel` 0.35.
  - Steering: top speed `run.maxSpeed x 1.1`, accel 0.6, drift decel 0.25, turn 0.9 (about 22 frames to
    reverse). Glide ratio 2.2 : 1.
  - Ends: `release`, `land`, `wall` (wall slide starts as before when a direction is held into the wall),
    `dash`, `fastfall` (Down). Re-entry is unlimited; after a dash the still-held jump resumes it.
  - While gliding `airTopY` follows her, so `land.fallPx` counts from where the wings let go and a glided
    landing is never `hard`.
- `land.vy` falls back to `vy` when the move ended exactly on the ground (it used to report 0 then).
- **Slash** (combat.md): never locks movement. It adds a lunge (`lungeX`, ground forward slashes, never
  off a ledge unless forward is held) and a short air hang (fall above 1.5 px/f halved per frame for
  4-6 frames, once per combo step per airtime); on a hit: `hitstop` (the whole controller holds,
  presses still latch), `kickX` (a fading shove back) and the pogo (`vy = -15.5`, dash + double jump
  refilled). `kickX` and `lungeX` are added to `vx` in the move only. Order: freeze → latch →
  `updateSlash` → mode update → `guardLunge` → move → post → `resolveSlash` (hits at the new position).
- **Canopy ceiling** (scene `ceilingY`, -420 in the grove; `tuning.ceiling.rate` 0.5): just before the
  vertical move, a rising `vy` is capped at `rate x (box top - ceilingY)`, so she eases to a stop with
  the top of her box exactly on the line: no `headBump`, no event, `vx` untouched, the jump's sustain
  ends, gravity takes over (the glide opens as usual if jump is held). The cap only bites in the last
  ~40 px at full jump speed. A scene without `ceilingY` is open (every flat test scene). It was at y 0
  (the camera could not look above the scene): from trunk B's top a jump rose 112 px of 272, "an
  invisible wall at the climax". At -420 the whole jump + double jump fits on the summit (feet 192 ->
  -277, box top -357, 63 px short of the line), so **the ceiling is never felt in the grove**; it only
  bounds what the camera must show (view top = `ceilingY - headroom`: scene-and-units.md). Lampwings
  share it (they could follow her up there). Tests: `tests/unit/ceiling.test.ts`.
- **Run start / stop** (playtest: "Hollow Knight snappy, not Ori's ease"): `groundAccel` 1.6 (was 3.2),
  `groundDecel` 2.0 (was 3.2); turn (4.8) and air (2.4 / 1.2 / 2.4) unchanged. Full speed after 6
  frames / 34 px (was 3 / 19); stop in 5 frames / 18 px (was 3 / 10); reversing: 5 px of overshoot
  as before, full speed back after 8 frames (was 5); a 4-frame tap moves 23 px (was 38); a standing
  held jump 472 px (was 478); 30 frames of running from rest 264 px (was 278). Every route, pickup,
  pod, pogo, glide and enemy pilot passed unchanged; four scripted tests were retimed by 3 frames.
- **Being hurt** (enemies.md): a hit sets `vx = +-7, vy = -7` and `stagger` 12; while `stagger` is above
  `steerFrames` (3) the controller sees no input and `horizontal()` only fades `vx` by `hurtDecel`.
- **Corner corrections**: head bump (slide ≤ 20 px sideways around a ceiling corner), ledge pop-up (≤ 16 px
  up onto a lip), dash (≤ 24 px up/down). Each emits `cornerCorrect`.
- **Performance**: no closures in the per-step path; keep `solidAt` allocation-free.

## Reach (default tuning, for laying out the scene)
- Jump: 272 px high (4.25 tiles), apex after 24 frames (28 with apex hang), ~43 frames of airtime on the
  flat = ~410 px (6.4 tiles) of horizontal travel at run speed (9.6 px/f). Double jump adds 192 px (3 tiles).
- Comfortable: steps up to 3 tiles (192 px) and gaps up to 5 tiles (320 px) on a single jump.
- Dash: 288 px + exit speed. Max fall 21.3 px/f (32 with Down held).
- Glide (jump, double jump at the apex, hold; horizontal px from take-off to landing, `tests/unit/glide.test.ts`):

  | landing this far below take-off | jump | jump + double | + glide | + glide, air dash, glide |
  |---|---|---|---|---|
  | 0 (flat) | 470 | 768 | 1594 | 1933 |
  | 192 | 557 | 854 | 2017 | 2355 |
  | 384 | 643 | 941 | 2439 | 2778 |
  | 640 | 758 | 1056 | 3009 | 3337 |
  | 832 | 845 | 1142 | 3432 | 3760 |

  Rule of thumb: every 64 px of height is 141 px of glide. Without the double jump (held jump off a
  ledge, wings open as she passes it): 763 / 1185 / 1745 / 2167 px for drops of 192 / 384 / 640 / 832.
- **A held ground jump only glides below its launch height** (the `carried` rule), so a glide needs a drop:
  nothing glides on the flat or going up a staircase. That is why the early glide is taught off the bluff
  (320 px over the path) and not off the F platforms, whose next step always catches the jump.
- What the glide opens in the grove (all land on ground; nothing leaves the scene or traps her). From
  trunk B's top, jump + double jump + glide: going right it passes x 4400 at feet y -202 and 4700 at
  -63 (the two lampwings at y 270 never notice), crosses the far ledge's lip (5472) at y 288, 160 px
  over it: close the wings to drop by lantern-far (goal.md: the designed approach); held, she reaches
  the scene's wall and slides down onto the ledge's far end. Going left it reaches the left bank
  (lands at x ~210, in burr-bank's patrol). A lazy glide (a short hop off the summit, wings late)
  flies through the lampwings' air as before. High ledge → left bank; far ledge / F7 / F6 → the shaft
  floor under trunk B; F4 → high ledge direct (skips F5); right branch → F7 direct (skips F6); F3 →
  high ledge with glide + air dash; spawn ground → over the
  pool onto the mid rise. Gaps meant to need the glide must be wider than ~1150 px at the same height
  (jump + double + dash is ~1050); gaps meant to stop it need > 1950 px or a ceiling.
