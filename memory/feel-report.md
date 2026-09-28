# Feel report (`npm run feel:report`, `tools/feel-report/`)

Measures movement feel in the headless sim and compares it with the Celeste–Hollow Knight envelope from
movement-spec §3.4. Writes `progress/feel/<date>-<preset>.{md,json}` (`--no-write` to only print).

```
npm run feel:report                                  # default tuning
npm run feel:report -- --all-presets                 # every preset in the controller's PRESETS
npm run feel:report -- --tuning '{"jump":{"fallMult":1.4}}' --no-write
npm run feel:report -- --compare progress/feel/<older>.json     # adds a Previous column
```

- Runs in ~0.2 s, all in generated lab rooms (`registerTestRoom`, ids `lab-*`), so gym changes can't skew it.
- Verdicts: `in` the [min, max] of the two games, `near` = outside by ≤15% of the bound, `OUT` = more.
  A sanity guard, not a definition of good (spec §7.5): an OUT can be deliberate (our 100 ms buffer).
- Definitions (chosen so the spec §3.4 table reproduces exactly on the spec controller):
  - **Apex frame / air time** count the jump's own step as frame 1.
  - **Fall/rise gravity** = steady fall acceleration ÷ (launch speed / frames to apex). Celeste's constant-
    speed sustain makes its rise slow, hence 3.0. (rise/fall time² gives ~1.1 for everything: wrong.)
  - **Coyote** (spec V08) = largest k such that a press k steps after the step that left the ledge still
    jumps. Phase 0 reads 5, not its configured 6: it spends one on the leaving frame.
  - **Buffer** = number of press frames p ≤ F (F = first frame starting grounded) whose press fires on F.
  - **Forgiveness**: sweep the jump press over every step of a run-up (jump held 30 f) and count
    presses that succeed. `gap-N`: pit of floor(max flat jump) − 1 tiles; `ledge-N`: 2-tile pit then a
    floor(max jump height)-tile ledge. Falling below the start floor = fail. Assists off = every assist
    in `ASSISTS` set false via the adapter.
- Results on the L2 spec controller (pre-merge copy): `opus` matches the spec table on every metric
  (jump 4.31 tiles / 0.43 s, air 0.85 s, dwell 18 f, fall/rise 1.73, run 9 tiles/s in 3 f, dash 4.5 tiles);
  only buffer 100 ms is OUT (by design). `celeste` matches Celeste (fall/rise 3.0, jump 3.56 vs 3.35).
  `hk` jumps too high (6.39 tiles vs HK's 5.6) and its 2-frame coyote/buffer read 33 ms vs HK's 40 ms.
  Assists widen the gap window 10 → 19 f and the ledge window 21 → 32 f on `opus`.
