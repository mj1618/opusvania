# Movement controller (L2)

Spec: `docs/design/movement-spec.md`. Code: `src/sim/player/player.ts` (controller),
`params.ts` (profiles + assists -> flat params), `src/sim/physics/aabb.ts`, `src/sim/tuning.ts`.

- **Order of operations matters**: freeze -> latch presses -> state update (accel, gravity, dash,
  jump, pogo) -> moveX then moveY (per-pixel hazards, corner corrections) -> post (timers, ground
  probe, walls, facing, triggers). With it, V03/V04/V05 match the spec tables exactly (272/24/45,
  276/26/51, hold table 76..264). Change the order and the exact tests break.
- **Rounding**: sub-pixel moves use round-half-away-from-zero (`roundHalfAway`). Math.round is
  asymmetric (-2.5 -> -2) and would break V22 mirror symmetry, which is tested exactly in all 14 rooms.
- **Coyote semantics (deviates from spec wording)**: N usable *airborne* frames after the frame whose
  movement left the ground (that frame doesn't decrement). The spec's "g+1..g+N with g = last frame
  that ended grounded" contradicts its own "assist off: g+1 -> none"; ours satisfies the intent.
- **V06 (apex hang)**: measured 11 vs 6 frames with |vy| < 3 (1.83x). The spec says >= 2x, but its
  V04 numbers (which we match exactly) imply 1.83x; the test asserts >= 1.8x.
- **variableJump off** only disables the release cut/sustain end; apex hang still uses the real button.
- **Landing preference** uses the jump-buffer window, so jumpBuffer off also disables it (V19 is owned
  by both assists in the isolation matrix).
- **Wall speed retention** stores vx only on the first block (Celeste); re-storing every blocked frame
  would retain the tiny re-accelerated vx instead.
- **Profiles** (weight classes next loop): `tuning.profiles[name] = {shape?, set?, scale?}` with
  `group.key` paths; `state.player.profile` selects one; `setProfile(p, name, events)` switches it from
  sim code (emits `profileChange`); debug: `__game.profile(name)`. Profiles live in tuning, so replays
  capture their definitions. Resolved every frame (cheap: shallow group copies).
- **Ability flags**: `state.player.abilities {wallJump, dash, doubleJump, pogo}`; rooms set them on load
  (gym semantics; Phase 3 will persist them instead). Wall slide is gated by `wallJump`.
- **Presets**: `hk` was corrected after the L2 feel report: sustain 9 f (5.56 tiles, apex 0.50 s vs HK
  5.6 u / 0.52 s; the spec's 12 gave 6.39) and coyote/buffer 3 f (HK's 40 ms = 2.4 f).
- **Performance**: no closures in the per-step path. Under tsx/esbuild every closure is wrapped in a
  `__name` helper call; ~20 closures per step cut the sim from 1.5M to 270k frames/s (bot killer).
  Keep hot loops (solidAt, hazardAt) allocation-free.
- **Pogo** is `bounce(p, v, P, {refill, cutDisabled})`; Phase 2's nail hitbox should call the same.
