# Camera (src/render/camera)

- Pure TS, stepped once per sim frame via `Game.afterStep`; renderer interpolates prev/curr camera
  with the same alpha as the player, then rounds. Constants in `src/render/camera/tuning.ts`.
- Pipeline: x dual forward focus (flip after 48 px the other way) -> y platform snapping (target only
  updates when grounded, wall sliding, or feet outside [0.25, 0.72]) / fall follow (vy > 12) ->
  look up/down -> zone -> clamp -> (pre-shake view, used by tests) -> trauma shake + dash kick.
- **Zone blending** is a decaying offset, not a lerp toward the zone view: at a zone change the jump
  in target is stored and decays by zoneLerp per frame. A lerped zone view lagged badly inside a
  `bounds` zone while falling.
- C3 (feet within [15%, 85%]) is checked only on frames where room bounds didn't clamp y: at the
  bottom of gym-09 the floor is 2 tiles above the room edge, so clamping must win.
- C5: 90% of look-down is reached 37 frames after the 24-frame delay (lerp 0.06), so "within 60 f"
  is read as 60 f after the delay.
- Headless Chromium produces a frame right after timer tasks (no vsync), so the e2e latency test reads
  ~0 ms; it asserts the press is visible in the next rendered frame instead. Real displays add 1-2 vsyncs.
