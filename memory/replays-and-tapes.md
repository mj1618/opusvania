# Golden replays, tapes and build stamps

Two formats live in `tests/replays/*.json`; `npm run check` runs every file (`tests/replays/replays.test.ts`).

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
npm run tape -- record --room hall --script "R136 R+J16 R108" --target a --name hall-a
npm run tape -- from-replay dump.json --name bug-12 --target G               # browser replay without ops
__game.tape.record(); ...; __game.tape.stop({name, expect: {target: 'G'}})   # in the browser (exact start state)
npm run tape -- check [files]            # same checks as npm run check, readable output
npm run tape -- update [--resolve]       # refresh goldens; --resolve re-solves broken tapes with the bot
```
`npm run replays:update` = `tape update`. Cross-runtime (spec §7.3.3) is covered by `tests/e2e/tools.spec.ts`:
tapes made in Node are checked in Chrome and vice versa, comparing the 60-frame hash sequence.

No tapes are committed yet (L2): the gym rooms were being rewritten. Generate them per room once rooms settle.
