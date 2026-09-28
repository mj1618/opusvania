# Feel report (`npm run feel:report`, `tools/feel-report/`)

Measures movement feel in the headless sim and compares it with the Celeste–Hollow Knight envelope from
movement-spec §3.4. Writes `progress/feel/<date>-<preset>.{md,json}` (`--no-write` to only print).

```
npm run feel:report                                  # default preset
npm run feel:report -- --all-presets                 # every preset in the controller's PRESETS
npm run feel:report -- --tuning '{"jump":{"gravity":4000}}' --no-write
npm run feel:report -- --compare progress/feel/<older>.json     # adds a Previous column
```

- Runs in ~40 ms, all in generated lab rooms (`registerTestRoom`, ids `lab-*`), so gym changes can't skew it.
- Verdicts: `in` the [min, max] of the two games, `near` = outside by ≤15% of the bound, `OUT` = more.
  A sanity guard, not a definition of good (spec §7.5): an OUT can be deliberate (our 100 ms buffer).
- Definitions that are easy to get wrong:
  - **Apex frame / air time** count the jump's own step as frame 1 (spec §3.1 derivation: apex after T frames).
  - **Fall/rise gravity** = (rise frames / fall frames)², i.e. effective, including apex hang.
  - **Coyote** = largest k such that a press on the k-th step after the last grounded step still jumps.
  - **Buffer** = number of press frames p ≤ F (F = first frame starting grounded) whose press fires on F.
    With `JUMP_BUFFER_FRAMES` = 6 this reads 6 (100 ms), matching spec §2.2 semantics.
  - **Forgiveness**: sweep the jump press over every step of a run-up (jump held 30 f) and count
    presses that succeed. `gap-N`: pit of floor(max flat jump) − 1 tiles; `ledge-N`: 2-tile pit then a
    floor(max jump height)-tile ledge. Falling below the start floor = fail. Assists off = every assist
    in `ASSISTS` set false via the adapter.
- Phase 0 controller result (L2): jump 3.06 tiles/0.27 s (near, low), run 9.4 tiles/s in 5 f (in),
  coyote 100 ms, buffer 100 ms (OUT high, by design), apex dwell 10 f and fall/rise 0.89 OUT (no fall
  multiplier or hang yet); coyote widens the gap window 11 → 16 frames.
