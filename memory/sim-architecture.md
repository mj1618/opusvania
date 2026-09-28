# Sim / runtime architecture (Phase 0)

- `src/sim/` pure: `step(state, inputMask, tuning, events)` mutates a plain-JSON `GameState` and appends
  `SimEvent`s. `hashState` = cyrb53 over key-sorted JSON. RNG state (`state.rng`, mulberry32) is in the state.
- `src/game.ts` (`Game`) is the harness: keeps `prev` + `state` for render interpolation (JSON-cloned
  every step; fine while state is tiny, revisit if it grows), scripted input queue, replay recorder, and
  dispatches events on an `EventBus`. No DOM, so it runs in Vitest.
- `src/loop.ts` fixed-step accumulator (max 5 steps/frame, then drops time; snaps near-60Hz frame
  times, see loop-timing.md). `src/main.ts` wires rAF.
- Input edge detection and buffering live in the sim (`src/sim/input.ts`, `prevInput` in state), not in
  `src/input/`, so buffered presses replay exactly. `src/input/` only turns devices into a bitmask.
- Tuning is a mutable module object (`src/sim/tuning.ts`) passed into `step`. Replays snapshot it at the
  start and the recorder diffs it before every step (records a `tuning` op), so live tweaks replay exactly.
  Anything else that mutates state outside `step()` must go through a `Game` method that records a
  replay op (see `load`/`reseed`/`setState` in `src/game.ts`), or replays silently diverge.
- `hashState` throws on NaN/Infinity (JSON would turn them into null and hash them like null).
- No engine-approximated Math in the sim (`sin/cos/atan2/exp/log/pow/**`...): V8, SpiderMonkey and JSC
  can differ in the last bit, so a replay from Firefox/Safari would diverge in Node. Add a deterministic
  helper in `src/sim` (lookup table or polynomial) when needed. `sqrt/floor/round/abs/min/max` are exact.
- Live keyboard is sampled on every step even when scripted input wins (and flushed while in manual
  mode), so taps made during a script or pause don't fire later.
- Render FX that animate (dust puffs) are timed by sim frame + alpha, not wall clock, so clips are deterministic.
- Rooms are hardcoded strings in `src/sim/world/rooms.ts`, validated with Zod; outside the room is solid.
