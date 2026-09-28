# L3 audit: is the Seize/Levy PASS trustworthy?

Reviewer: independent skeptical audit, 2026-09-28. Subject: `docs/reports/L3-verdict.md` (PASS) at commit `d7870a5`.
Method: I extracted `d7870a5` into a scratch copy, so the graphics merge in the working tree didn't affect it. I then re-ran `npm run l3:verdict`, the E-check e2e (`tests/e2e/signature.spec.ts`), typecheck, lint and the unit tests, and ran my own probes against the headless sim and the bot.

## Bottom line

**Mostly trustworthy, with caveats.** The PASS reproduces exactly. The pre-registered rules were applied as written, and none of the builder's listed deviations changes the outcome. The caveats are about what PASS proves. The flow checks (B1/B2) are close to guaranteed by design, so they show that the verbs cost no movement time. They don't show that rooms built around the verbs will flow. The "levy is forced" gate holds only for a Kid with no movement abilities.

## 1. Verdict integrity

### Reproduction
- `npm run l3:verdict` on `d7870a5` gives the same result as the committed report: every row and guard is identical, and the sim fingerprint `15e1ba440c` matches. Only the timestamp and build line differ.
- Re-running the E-check e2e produces a byte-identical `progress/l3/e-checks.json`.
- Typecheck, Biome and the unit tests (282 tests) are green.

### Thresholds and decision rule
- The brief (`7aba347`) was committed before any L3 code and wasn't edited during L3. `lot-7.json` geometry didn't change after the tapes were made; only the bot-claim metadata did.
- `tools/l3-verdict/cli.ts` implements §6.4 as written:
  - PASS needs A1–A4, C1–C3, E1–E3 and F1, plus B1 or B2.
  - Kill triggers are B1 > 1.6, B2 > 20% and a C1 bypass.
  - INVALID guards are in place.
  - D failures don't block, which matches critique A's pass rule.
- **Drift from the critique to the brief (pre-registered, but decisive):** critique A2 says the Seize total is ≤ 14 frames. The brief's §8 #7 excludes hitstop and allows a whiff of 18.
  - A take is actually 14 + 5 hitstop = 19 f, and a whiff is 18 f.
  - Read literally, critique A2 fails, and the decision would be **IMPROVE**, not PASS.
  - The rationale is reasonable: moves never lock movement, and hitstop is a feel constant. But a human should approve this reinterpretation explicitly.

### Are the expert and control tapes comparable?
Yes. The control can't have been left slow on purpose (sandbagged):
- Both rooms are roughly a 2.7k px sprint.
- Feather run speed is 9.6 px/f, so holding Right on flat ground covers that distance in about 280 f.
- The control tape takes **280 f**, which is at that physical floor.
- Route A takes 290 f: 280 f of running at full speed plus **10 hitstop frames** (two seize takes).
- Route B takes 307 f, 15 of them hitstop.
- None of the three tapes has a single non-hitstop frame below 0.5 px/f, grounded or airborne.

The **control-guard deviation doesn't matter.** The bot at weight 1 and 1.1 finds nothing within 1M nodes, so the guard used the weight-1.2 result (286 f). A bot can't beat the run floor anyway.

### What B1 and B2 actually prove
- **B1 is structurally near 1.** Seize and Levy never block horizontal input (A2 measures 0 ignored frames). Lot 7's route only moves rightward, and every source sits on the route. So B1 ≈ 1 + hitstop / run time.
- Lot 7 has no backtracking and nothing to fetch and carry back, so it can't show the "pick-up-and-place" friction the kill question worries about. B1 would pass in almost any room with this layout.
- **B2 is 0% by construction** on a time-optimal tape. It can't be gamed, because airborne and zero-progress frames are also 0 and counting hitstop as still only raises it to 3.4%. But it adds no information beyond B1.
- The fair reading: the verbs are free to use while moving. Whether levels built around them flow is still untested. Ask the human (inbox #5, "put-back") and design an L4 room that requires carrying a sound back.

### Is the expert line human-executable?
Yes, and it's forgiving. I swept the spring climb (run length, jump timing, and the delay before the down-levy): **46%** of 6,560 combinations reach the upper corridor. The tape's one-frame down-levy is a result of trimming, not a requirement of the room.

### C1: is the movement-only bypass search strong enough?
- It passes as registered. The partition fills the corridor, and the hall is 384 px tall while the feather jump reaches 288 px. The bot results were "not found in budget", not "exhausted", but the geometry closes the gate anyway.
- **But it depends on the ability set.** I gave the bot movement abilities, still without levy. With **wall jump only** or **double jump only**, it reaches the upper corridor without the spring in 166 f and 156 f (13k and 33k expansions). It didn't reach G within 1M nodes.
- So "Levy is forced" holds only for the base kit. Phase 3 levy gates must be validated against the ability set the player will actually have at that point.
- The 500×3600 no-verbs fuzz run is weak evidence on its own. The bot and the geometry carry this check.

### E checks
- **E1** is real. It samples the rendered canvas; the Kid box is masked out and interiors are inset 8 px.
  - Ghost-to-humming ratio 0.24; hue gap 64.5°; minimum contrast 6.05:1.
  - Violet uses the palette token, because no L3 room has a violet source.
- **E2** can't fail. Going from fill α 0.35 to α 0.10 changes every pixel by more than 16/255, so it reads 100%. It measures fill change, not silhouette or shape, and is redundant with E1.
- The checkpoint-4 enemy readability numbers (telegraphing vs disarmed band: 52.4 vs 25.4) are collected but not scored.
- **`e-checks.json` carries no build or sim stamp.** The verdict tool reads whatever file is present, so a stale E result would pass silently. It wasn't stale this time.

### D (non-blocking)
- **D2 FAIL** is recorded honestly: signature cleared 19/20 with one death on seed 1, and the ratio is 0.729 against a 0.75 threshold.
- The 20 seeds give only about 6 distinct results. For signature, 13 seeds give exactly 1612 f.
- The signature and jabOnly policies share an identical opening of about 70 input segments. D2 therefore measures a handful of late verb uses.
- The committed Pit tape is **seed 2**, because seed 1 fails; the brief named `.s1`. This is visible in the policy-run array but isn't called out.

### Builder-listed deviations: none change the verdict

| Deviation | Checks it affects | Why it doesn't change the verdict |
|---|---|---|
| Control guard uses the weight-1.2 bot result | B1 guard | Control is at the run floor |
| Pit tape uses seed 2 | D only | D doesn't block PASS |
| Levy spawn offsets | Route A only | Route B has no forward levy, and on its own gives B1 = 1.096 |
| Spring launches an enemy once | D only | D doesn't block PASS |
| Barker hops only at a grounded Kid | D only | D doesn't block PASS |

## 2. Code review (ranked by severity)

1. **HIGH: the combat foundations have no behavioural tests.** Nothing directly tests:
   - the enemy FSM: 14 states, tokens ≤ 2, Catch, Snatch, RETRIEVE, the Count, KO and the Furious rise;
   - hitstop max-merge, the cap and press latching;
   - the box mirror;
   - Kid hurt, i-frames and Slip.

   `tests/unit/signature/verbs.test.ts` covers only the verbs, the bag, weight and plates. The rest is covered by golden Pit hashes, which catch change but not wrongness, and by fuzz and verdict invariants. **Neither the fuzz nor the verdict runs in `npm run check`**, so conservation, overlap, token and room-regeneration invariants will rot unnoticed. Phase 2 builds directly on this code.
2. **MEDIUM: the move table isn't the source of truth.**
   - `cls` in `content/moves.json` is never read. The jab hard-codes `requestHitstop('light')` (`combat/kid.ts`), and so does the guarded-seize path (`ai/enemy.ts:612`).
   - `kidHits` and `kidAction` branch on `m.id === 'seize' | 'jab'`, and jab direction is forced to `'fwd'`.
   - `MoveId` is a closed union, and the Zod table is a fixed object.
   - Adding Cross, Uppercut or Swallow means editing about 4 code sites. Use a per-move handler table like `sources.ts` HANDLERS, and read `cls` from the data.
3. **MEDIUM: seize priority is a set of magic integers split across two modules.**
   - `sources.ts` uses 4, 5, 7 and 99; `ai/enemy.ts` uses 1, 2, 3 and 6.
   - `ai/enemy.ts` treats `pri === 6` as "guarded".
   - These should be a shared const enum.
4. **LOW–MEDIUM: module-level mutable scratch.**
   - The hitstop request accumulator (`combat/hitstop.ts`) and dynamic solids (`world/dynamic.ts`) are safe today, because stepping is synchronous and every reader runs inside a step.
   - However, `req` resets only in `beginHitstopStep`. A `requestHitstop` outside a normal step (debug spawn, a test, the Chin-0 reload that returns mid-step) carries into the next step.
   - A step-context object would remove this whole class of bug before Phase 2 adds more callers.
5. **LOW: gameplay numbers are inline.**
   - The knockdown threshold `kbScale > 0.5` (`ai/enemy.ts:718`).
   - The 32 px placement search (`levied.ts:133`).
   - `ts = 64` collider defaults (overwritten at runtime, but misleading).
6. **LOW: duplicate mirror logic.** `moveHitbox` (`player/moves.ts`) re-implements the facing mirror instead of calling `boxAt` from `combat/boxes.ts`. That is the duplication the box module exists to prevent.
7. **LOW, tooling:**
   - Stamp `e-checks.json` with the build and sim hash, and make the verdict refuse a mismatch.
   - Replace the control guard with the run-floor bound, or document the weight-1.2 fallback in the brief.
   - The verdict prints `build unknown` outside a git checkout.

**Good:**
- `src/sim` purity is enforced recursively, and the purity test passes.
- The sound model is clean, with a conservation checker.
- There really is one sound-source component, with a kind-handler registry and no wall special cases.
- Dynamic solids don't allocate.
- `local` (including `nextId`) regenerates on every load.
- Enemy code is data-driven, with no per-type branches.
- Numbers largely live in `tuning.ts` and `content/`.

## 3. Recommendations
1. Accept PASS, conditional on the human approving the A2 reinterpretation (hitstop excluded; whiff 18 f).
2. In L4, add a room that requires backtracking or carrying a sound back, so B1 can test pick-up-and-place friction.
3. Record that levy gates must be designed against the player's current ability set: wall jump or double jump defeats the Lot 7 spring gate.
4. Before Phase 2 combat:
   - Add unit tests for the enemy FSM, hitstop, boxes and Kid hurt.
   - Put a short fuzz run (e.g. 20 runs × 1200 f per room) into `npm run check`.
   - Make the move table data-driven, including `cls` and per-move handlers.
