# Golden replays, tapes and build stamps

One system (unified at the L2 merge; the movement stream's `golden.ts`/`update.ts` format was converted).
Two file formats live in `tests/replays/*.json`; `npm run check` runs every file
(`tests/replays/replays.test.ts`, which also requires a tape for every gym room).

**Tape** (`kind: "tape"`, `src/debug/tape.ts`, movement-spec §7.3): room + spawn + seed + preset (+ tuning
overrides, assists, abilities, or an exact `start` state) + input DSL string + `expect` + `golden`.
- Behavioural `expect` (always checked; survives tuning changes): `target` (`G`, `spawn:a`, `tile:x,y`,
  `rect:x,y,w,h`) reached within `maxFrames`, `maxDeaths` (default 0), `assert: [{frame?, path, eq|min|max}]`
  on the normalised player view (`grounded`, `x`, `state`...) or `room`.
- `golden` = tuning hash + build + end x/y/frame + end hash + a hash every 60 steps.
  - Tuning hash differs → golden is **stale** (warning, not failure). Tapes run with the *current*
    preset values, so a tuning change is exactly when goldens stop applying.
  - Same tuning, different hash → **fail**. The message compares the recording build with this one:
    "Replay from an older build (sim code X -> Y)" means sim code changed since recording: re-record if
    intended. "SAME sim build" means a determinism bug or an unrecorded out-of-band state change.
- **Raw replay** (a `__game.replay.stop()` dump): self-contained start state + tuning + masks + ops.
  Fails on any hash change, with the same build explanation (from its `meta`).

Build stamp (`src/debug/build-info.ts`): `sha` = git short SHA (+`-dirty`), `sim` = sha1 of every
`src/sim/**` file (path + contents), `stateVersion` = `GameState.version`. Injected by Vite `define`
(`tools/lib/build-info.ts` → `vite.config.ts`, so browser + Vitest) and by `installBuildInfo()` in tsx tools.
The dev server computes it once at start, so after editing sim code under `npm run dev` restart it
before recording goldens.

Making tapes:
```
npm run bot -- --room gym-04 --target G --save tests/replays/gym-04.json     # bot solution (maxFrames = 1.5× bot)
npm run tape -- record --room gym-02 --script "R60 R+J16 R40" --target G --name my-tape
npm run tape -- from-replay dump.json --name bug-12 --target G               # browser replay without ops
__game.tape.record(); ...; __game.tape.stop({name, expect: {target: 'G'}})   # in the browser (exact start state)
npm run tape -- check [files]            # same checks as npm run check, readable output
npm run tape -- update [--resolve]       # refresh goldens; --resolve re-solves broken tapes with the bot
```
`npm run replays:update` = `tape update`. After a movement change, `tape update --resolve` re-solves
only the tapes that stop reaching their target (seconds); check the re-solved routes still exercise what
the room is for (e.g. the audio-router test needed its own wall-slide drive when no tape slid any more). Cross-runtime (spec §7.3.3): `tests/e2e/movement.spec.ts` runs
every committed tape in Chrome via `tape.check` (no rendering) and compares hashes with Node;
`tests/e2e/tools.spec.ts` covers browser-recorded tapes checked in Node and vice versa.
`tests/unit/mirror.test.ts` (V22) also replays every tape's inputs mirrored in a mirrored room.

Committed (L2): `gym-NN.<abilities>.json` = one G tape per gym room (opus preset); plus bot tapes for
optional goals (`gym-02-g.doubleJump`, `gym-07-g.wallJump`) and other presets (`gym-13.all.celeste`,
`gym-11.doubleJump.hk`). File name = `<room>[-<target>].<abilities>[.<preset>].json`. Target `G` is
"overlaps the goal tile", which lands on the same frame as the sim's `goal` event.
