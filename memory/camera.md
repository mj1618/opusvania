# Camera (src/render/camera)

- Pure TS, stepped once per sim frame via `Game.afterStep`; renderer interpolates prev/curr camera
  with the same alpha as the player, then rounds. Constants in `src/render/camera/tuning.ts`.
- Pipeline: x dual forward focus (flip after 48 px the other way) -> y platform snapping (target only
  updates when grounded, wall sliding, or feet outside [0.25, 0.72]) / fall follow (vy > 12) ->
  look up/down -> zone -> clamp -> (pre-shake view, used by tests) -> trauma shake + dash kick.
- **Zone blending** is a decaying offset, not a lerp toward the zone view: at a zone change the jump
  in target is stored and decays by zoneLerp per frame. A lerped zone view lagged badly inside a
  `bounds` zone while falling. The offset must be measured and applied on the same basis: it is
  `view − clamped(new target)` and `place()` adds it to the *clamped* target, then clamps again.
  Adding it to the unclamped target turned blends into 300–400 px cuts whenever the free-follow
  target was past a room bound (L2 playtest P1). The blend is also capped at `zoneBlendMaxPx`/frame.
- **Horizontal follow** is capped at max(`panMaxX`, `panMaxVxMult`·|vx|): with lerpX 0.15 the 400 px
  focus-flip swing would otherwise start at 60 px/f. Effective lead at full run ≈ lookahead − vx/lerpX.
- **Trauma is squared**: with shakeMaxPx 24, trauma < 0.45 is under 5 px (invisible). Hard land 0.55,
  death 0.8. Juice numbers live in `fxTuning` (src/render/fx.ts), including the death flash/hold/pop.
- C3 (feet within [15%, 85%]) is checked only on frames where room bounds didn't clamp y: at the
  bottom of gym-09 the floor is 2 tiles above the room edge, so clamping must win.
- C5: since the L2 fix pass look is lookDelay 12 + lerp 0.12, so 90% of look-down is reached ~31 f
  after the press (the playtest found the old 24 f + 0.06 took ~57 f); C5 asserts <= 32 f.
- Headless Chromium produces a frame right after timer tasks (no vsync), so the e2e latency test reads
  ~0 ms; it asserts the press is visible in the next rendered frame instead. Real displays add 1-2 vsyncs.
