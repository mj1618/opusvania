# Sim / runtime architecture (Phase 0)

- `src/sim/` pure: `step(state, inputMask, tuning, events)` mutates a plain-JSON `GameState` and appends
  `SimEvent`s. `hashState` = cyrb53 over key-sorted JSON. RNG state (`state.rng`, mulberry32) is in the state.
- `src/game.ts` (`Game`) is the harness: keeps `prev` + `state` for render interpolation (JSON-cloned
  every step; fine while state is tiny, revisit if it grows), scripted input queue, replay recorder, and
  dispatches events on an `EventBus`. No DOM, so it runs in Vitest.
- `src/loop.ts` fixed-step accumulator (max 5 steps/frame, then drops time). `src/main.ts` wires rAF.
- Input edge detection and buffering live in the sim (`src/sim/input.ts`, `prevInput` in state), not in
  `src/input/`, so buffered presses replay exactly. `src/input/` only turns devices into a bitmask.
- Tuning is a mutable module object (`src/sim/tuning.ts`) passed into `step`. Replays snapshot it, so
  live tweaks don't break recorded replays.
- Render FX that animate (dust puffs) are timed by sim frame + alpha, not wall clock, so clips are deterministic.
- Rooms are hardcoded strings in `src/sim/world/rooms.ts`, validated with Zod; outside the room is solid.
