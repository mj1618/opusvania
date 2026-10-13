# Sim / runtime architecture

- `src/sim/` is pure: `step(state, inputMask, tuning, scene, events)` mutates a plain-JSON `GameState`
  (`{version, frame, seed, rng, prevInput, player, pickups, pods, enemies}` (version 11)) and appends `SimEvent`s. The scene is static and
  not in the state. `hashState` = cyrb53 over key-sorted JSON (throws on NaN/Infinity). RNG state
  (`state.rng`, mulberry32, `src/sim/rng.ts`) is in the state; nothing uses it yet.
- No engine-approximated Math in the sim (`sin/cos/atan2/exp/log/pow/**`...): engines can differ in the
  last bit. `sqrt/floor/round/abs/min/max` are exact. Enforced by `tests/unit/sim-purity.test.ts`,
  `tsconfig.sim.json` (no DOM lib) and a Biome override.
- Scene data: `src/scene/index.ts` (outside the sim: it uses Zod and imports the JSON) validates
  `content/scene/grove.json` and exports `GROVE`; the sim only knows the `Scene` type.
- `src/game.ts` (`Game`) is the harness: `prev` + `state` for interpolation, the scripted input queue,
  `reset()` / `teleport()`, and `afterStep` listeners that receive each step's events. Modes: realtime,
  frozen, manual. No DOM, so it runs in Vitest.
- Input edges and buffering live in the sim (`prevInput` in state); `src/input/` only turns devices into a
  bitmask (`left right up down jump dash attack`). Live keys are sampled every step even when scripted input wins,
  and flushed while not realtime, so stray taps never fire later.
- `src/loop.ts`: fixed-step accumulator (max 5 steps per frame; snaps near-60Hz deltas, loop-timing.md).
- `src/render/stage.ts` is the render driver: it steps the camera once per sim step (in `afterStep`, so
  it is deterministic), and per render frame interpolates player and camera by the loop's alpha, applies
  the camera to the layers, then calls `SceneRenderer.update` → `CharacterRenderer.update` →
  `PostStage.update`. Render time (`dt`, `clock`) is separate from sim time: it runs while frozen and
  advances exactly 1/60 per `__game.step`.
- Tuning is a mutable module object (`src/sim/tuning.ts`) passed into `step`; `resolveParams` flattens it
  (and turns disabled assists into 0/false) every step. The controller never reads `tuning` directly.

## What an animator reads (`PlayerView`, `src/render/contract.ts`)
The sim's `PlayerState` with interpolated `x`, `y` plus `cx`, `cy`, `feetY`:
- `vx`, `vy` (px/frame), `facing` (-1/1), `inputX` (held direction), `grounded`, `contactFrames` (frames
  since `grounded` changed = time on ground / in air), `wallDir` (-1/0/1 touching side).
- `mode` (`normal | wallSlide | dash`) + `modeFrames`; `motion` (`idle | run | skid | rise | fall | glide |
  wallSlide | dash`) + `motionFrames` (0 on the frame it changes).
- Wing glide: `gliding` (true exactly while `motion === 'glide'`; `mode` stays `normal`). `vy` eases to
  4.8 px/f (from up to 21.3 over ~11 frames: the catch), `vx` up to 10.56. `facing` follows the held
  direction at once while `vx` takes ~22 frames to reverse, so a turn has `sign(vx) != facing` for a while.
- `dashDir`, `dashTimer`, `freeze` (dash wind-up frames left: the body hangs for 2 frames before it moves),
  `airDash`, `dj` (left this airtime), `airTopY`, `skid`.
- Slash: `attack` (`none | fwd | up | down`), `attackFacing`, `attackFrames`, `attackActive`,
  `attackSeq`, `attackHits`, `attackStep` (1-3), `attackFinisher`, `lungeX`, `hang`; `hitstop` (frames the sim is holding her after a hit: x, y and every
  player timer stand still, so hold the pose) and `kickX` (recoil shove). Details: combat.md.
- Health: `hp`, `hpMax`, `invuln`, `stagger`, `faded`, `hurtDir`, `hurtSeq` (enemies.md).
- While wall sliding `facing` points **away** from the wall (a `turn` event fires on contact).
- `motion` is `run` whenever a direction is held or vx != 0 on the ground, including pushing into a wall
  (vx = 0): check `vx` if that should look different.

## Sim events (`src/sim/events.ts`)
`x, y` = feet centre at the event; `dir` = -1/1.
- `spawn`: placed (boot, load, teleport): snap, don't interpolate.
- `jump {kind: ground|coyote|buffered|wall|double|dashJump, dir}` (wall: `dir` = away from the wall).
- `fall` (left the ground without jumping), `apex` (stopped rising), `land {vy, fallPx, hard}`
  (`vy` = impact speed px/f; `hard` = fallPx >= 320 or at max fall speed).
- `step` (every 96 px of grounded travel), `turn {dir, grounded}`, `skid {dir}`.
- `wallSlideStart/End {dir = wall side}`, `dashStart {dir, air}`, `dashEnd {dir}`.
- `slash`, `slashHit`, `impact`, `slashEnd`, `podHit`, `podBurst`, and pod glints as `pickup {pod: true}`: combat.md.
- `enemyTurn`, `enemyAlert` (burrback), `enemyNotice`, `enemyGiveUp` (lampwing), `enemyHit`, `enemyDie`, `hurt`, `fade`, `reform` (followed by `spawn`), and
  enemy glints as `pickup {enemy: true}`: enemies.md. `slashEnd` / `glideEnd` have a reason `hurt`.
- `glideStart {vy}` (`vy` = fall speed the wings have to catch: ~1.1-1.5 just after an apex, 21.3 out of a
  long fall, up to 32 out of a fast fall) and `glideEnd {reason: release|land|wall|dash|fastfall}`; one
  pair per glide. Same-step order: `glideEnd:land` then `land`; `glideEnd:wall` then `wallSlideStart`;
  `glideEnd:dash` then `dashStart`.
- `headBump`, `cornerCorrect {kind: head|ledge|dash, dx, dy}`, `dropThrough`.
- `pickupWake {id, kind, x, y, frames}`, `pickup {id, kind, value, x, y, px, py, combo, total}`: here
  `x, y` = where the pickup hung (not the feet), `px, py` = body-box centre when it goes in. `state.pickups`
  (`timers[]` per `scene.pickups[i]`, `count`, `taken`, `combo`...) and the rule are in pickups.md.

## Step order
`step()`: re-form if a fade just ended → player (slash hits resolved inside, pods and enemies) →
enemies → contact damage → safe-ground tracking → pod glints → pickups. The scene's `ceilingY` (the
canopy, movement-controller.md) and the tag `pool` (safe ground, enemies.md) are the only scene
fields besides the rects that the player code reads; the lampwing reads both too (it stays under the
canopy and off the water). Enemies are a framework with a module per kind: `src/sim/enemies.ts` +
`src/sim/enemies/` (enemies.md).
