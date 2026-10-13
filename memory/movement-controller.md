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
- **Corner corrections**: head bump (slide ≤ 20 px sideways around a ceiling corner), ledge pop-up (≤ 16 px
  up onto a lip), dash (≤ 24 px up/down). Each emits `cornerCorrect`.
- **Performance**: no closures in the per-step path; keep `solidAt` allocation-free.

## Reach (default tuning, for laying out the scene)
- Jump: 272 px high (4.25 tiles), apex after 24 frames (28 with apex hang), ~43 frames of airtime on the
  flat = ~410 px (6.4 tiles) of horizontal travel at run speed (9.6 px/f). Double jump adds 192 px (3 tiles).
- Comfortable: steps up to 3 tiles (192 px) and gaps up to 5 tiles (320 px) on a single jump.
- Dash: 288 px + exit speed. Max fall 21.3 px/f (32 with Down held).
