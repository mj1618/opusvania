# Loop log

Source of truth for loop state. Newest loop at the bottom. Format per STUDIO.md §2.

---

## L1: Foundations + concept divergence (started 2026-09-28)

**Goal.** Complete Phase 0 so every later loop has a working harness. In parallel, find an original concept using randomised divergent ideation.

**Hypotheses.**
- A single agent can stand up the whole Phase 0 harness (sim loop, debug API, tests, CI, Pages deploy, clip capture) in one loop.
- Random external seeds (Wikipedia, dictionary words, forced lenses, bans on common tropes) produce concepts that are clearly less generic than *The Unfinished Opus*.

**Streams.**
- **A: Foundations** (1 agent; owns the repo root, `src/`, `tests/`, `tools/` except `tools/ideation/`, `.github/`). Phase 0 per PLAN §7, plus Pages deploy and a gameplay clip tool.
- **B: Concept divergence** (6 agents on different models, then 1 synthesis/critic agent; owns `docs/concepts/`, `docs/ideas.md`). Seeds in `docs/concepts/seeds-L1.json`.

**Acceptance criteria.**
- A: `npm run check` is green locally and in CI. A Playwright test boots the game, steps 60 frames, and reads state. `window.__game` has `step`, `state`, `input`, `load`, `seed`, `screenshot`. Replay record and playback are deterministic (same input log gives an identical state hash). A clip tool produces an mp4 or GIF from a scripted input. The build is live on https://mj1618.github.io/opusvania/.
- B: at least 12 raw concepts, a ranked shortlist of 3 with the signature mechanic stated for each, and a chosen direction with a greybox test for its signature mechanic.

**Kill criteria.**
- A: if Pixi v8 plus the fixed-step loop can't be made deterministic in headless tests, fall back to sim-only headless tests and flag it.
- B: if the shortlist still reads as generic to a critic agent, re-run with new seeds and harder constraints.

**Status.** Done.

### L1 report
- **A: Foundations. Passed.**
  - Harness, `window.__game`, replays, clip tool (mp4, GIF and contact sheet), CI, and Pages at https://mj1618.github.io/opusvania/.
  - Independent review fixed 6 harness bugs: replay ops and tuning drift, stale key taps, NaN hashing, fractional steps, and sim-purity holes (also banned `sin`/`cos`/`pow`, since browsers can compute them differently).
  - Open issues (feeding L2): replay build SHA, stale preview server in `check`, frame-time jitter snapping, gamepad layout check, frame numbers on contact sheets.
- **B: Concept. Passed.** 12 concepts, 2 independent critics. Both picked DISTRAINT, now working title *Tallage*, because "Distraint" is an existing game.
- **Decision: move on.**
  - PLAN revised (§2, Phase 1, §9, revisions log).
  - Movement spec written: `docs/design/movement-spec.md`.
- **Next.** L2 movement greybox (controller + verification tooling + procedural audio). L3 is the Tallage signature-mechanic experiment.

---

## L2: Movement greybox (started 2026-09-28)

**Goal.** Phase 1 per `docs/design/movement-spec.md`: a controller with all assists, camera, juice and a 14-room gym, verified objectively. Procedural audio foundation in parallel.

**Streams.**
- **A: Controller** (main tree; owns `src/sim/` player, physics, tuning, rooms, `src/render/`).
- **B: Verification tooling** (worktree; owns `tools/`, `src/debug/`, `src/loop.ts`, `tests/replays/`). Search bot, feel report, trace API, golden replays, and the review's open harness issues.
- **C: Audio** (worktree; owns `src/audio/`, `content/audio/`). Procedural SFX, noise-colour hum/seize/levy voices, buses, ambience, music scheduling stub.

**Acceptance.**
- The spec's exact tests pass.
- The bot proves every gym room completable, and proves rooms fail without their required abilities.
- Feel metrics are inside the Celeste–Hollow Knight range.
- Clip sheets exist for each movement tech, and a playtester agent critique has been done.
- The build is live on Pages.

**Kill criteria.** None for the controller: it's mandatory work, so it iterates until it's good. If the ASCII room format proves painful, switch to LDtk early.

**Status.** Done (provisional; human feel sign-off is queued in the inbox).

### L2 report
- **A: Controller.** Physics, all assists, 3 presets, camera, juice, 14 gym rooms plus a hub. The spec's exact tests pass.
- **B: Tooling.** trace, save and restore; headless runner; search bot; feel report; golden tapes; clip study mode.
- **C: Audio.** Fully procedural, event-driven, with noise-colour hum, seize and levy voices.
- **Integration.** One debug API and one tape system. `check` takes about 18 s.
- **Playtester critique** (`docs/reports/L2-playtest.md`): solid base, with 1 P0 (wall retention cancelled wall jumps) and 2 P1s (camera zone cuts, weak juice). Decision: **improve**. A fix pass resolved P0, both P1s and the P2s. The A/B toggle moved to F3. All 23 bot claims pass and all 18 tapes reach their goals.
- **Also done.** Combat spec (`docs/design/combat-spec.md`), L3 experiment brief (`docs/design/seize-levy-experiment.md`), naming pass (keep **Tallage**).
- **Decision: move on** to L3.

---

## L3: Tallage signature-mechanic experiment (started 2026-09-28)

**Goal.** Build Seize, Levy, the bag and weight classes per `docs/design/seize-levy-experiment.md`, plus the shared combat foundations (move table, hitbox module, sound-source component). Decide PASS / IMPROVE / KILL on the concept with `npm run l3:verdict`.

**Hypothesis.** Seize/Levy adds expression without slowing play:
- Lot 7 flow ratio is at most 1.35 against the jumps-only control room.
- Stillness is at most 10% of frames.
- Gates can't be bypassed.
- Seize/Levy fighting beats jab-only by 25% or more.

**Kill criteria.** Flow ratio above 1.6, stillness above 20%, or a movement-only bypass of Lot 7. On a kill, fall back to THE DISSOLUTION ROLLS in the same harness.

**Streams.**
- **A: Experiment** (main tree; owns `src/sim/`, rooms, sim tests, render for sources and HUD).
- **B: Atmosphere foundation** (worktree; owns a new render post-FX and lighting layer, parallax layers, perf HUD, screenshot-diff tests). Code-drawn only, no art assets.

**Status.** Done.

### L3 report
- **Verdict: PASS** (`docs/reports/L3-verdict.md`). Flow ratio 1.036, 0% stillness, no movement-only bypass, readability checks pass, deterministic. D2 (signature combat beats jab-only) failed narrowly and noisily.
- **Audit** (`docs/reports/L3-audit.md`): mostly trustworthy, with caveats.
  - B1/B2 barely *could* fail in a one-way room.
  - Gates only hold with every movement ability off (wall jump or double jump alone bypasses Lot 7).
  - The E2 check can't fail.
  - Code gaps: no enemy, hitstop or hurt unit tests; fuzz invariants aren't in `check`; the move table's `cls` field is unused.
- **Novice blind playtest** (`docs/reports/L3-novice-playtest.md`): the traversal verbs are discoverable within about 70 s, the tooltip test passed (seizing everything by 90 s), and both Lot 7 routes were found blind, so it's fun.
  - The up/down aims were never discovered.
  - Seize gives no whiff or refusal feedback.
  - The Pit is a wall: 8 deaths in 5 minutes, spawn sits in the charge lane, no visible hit reactions or Count.
  - Missing death and room-clear beats; door triggers need exact standing.
- **Atmosphere merged**: parallax, light map, post-FX, particles, perf HUD, screenshot goldens. Readability held after a render fix.
- **Decision: concept kept, move on.** The combat and teaching issues roll into L4.
- **Lesson.** Pre-registered checks written by the builder are necessary but not sufficient. Always pair them with an independent audit and a blind novice playtest. Gate design must assume the full movement kit.

---

## L4: Combat greybox + world design (started 2026-09-28)

**Streams.**
- **A: Combat** (main tree). Phase 2 per `docs/design/combat-spec.md` on the L3 foundations, plus the L3 fixes: teach aims, seize whiff/refusal feedback, hit reactions, a visible Count, Pit spawn grace, death and clear beats, full-width doors, a deaths counter. Also the audit's High and Medium code items.
- **B: World design** (docs). World structure for the vertical slice: biome 1 plus the hub, ability order, and a gate taxonomy that stays robust to the full movement kit.
- **C: Progression validator** (worktree). A graph solver over rooms, doors and gates, with the bot as the in-room reachability oracle.

**Acceptance.**
- Combat: the spec's bot-fight metrics pass (reaction-bot avoidance ≥95%, a signature/jab-only ratio in range, jab-only always winnable), the Auctioneer greybox boss works, and a novice replay of The Pit is no longer a wall (a blind playtester reruns it).
- B: a world doc reviewed by a critic.
- C: the validator runs in `check` and proves the gym plus L3 rooms reachable, with no softlocks.

**Status.** Stopped by the user for a review.

### L4 report
- **A: Combat** (`docs/reports/L4-combat.md`). 13/16 checks pass.
  - Misses: Gull time-to-kill, signature not paying off against fodder, a Pit gap.
  - Expert critique (`docs/reports/L4-combat-critique.md`): the boss can be stun-locked; knockdowns throw enemies out of Seize reach; the bag gives a free heal; bodies should shove, not damage. It recommends a short combat rules pass.
- **B: World design** (`docs/design/world-design.md`), revised after a critique (`world-design-critique.md`).
- **C: Progression validator.** Merged; covers 25 rooms; Stairwell tape added.
- **Novice combat playtest:** stopped before it finished. No report.
- **User review:** the levels are small, not fun, disjointed, and don't feel like Hollow Knight or Ori. See `STUDIO.md` §1c for the diagnosis.
- **Decision.** Course correction. `STUDIO.md` and `PLAN.md` are revised, and Phase W (world-first reset) is inserted. The combat rules pass is deferred into the region blockout.

---

## L5: Phase W, part 1: reference teardowns (started 2026-09-28)

**Goal.** Quantitative, comparable teardowns of the reference areas, as the foundation for `docs/design/north-star.md` and the level toolchain decision.

**Streams** (parallel, research only, each writing its own file in `docs/research/`):
- **A:** Hollow Knight, Forgotten Crossroads.
- **B:** Hollow Knight, Greenpath.
- **C:** Ori and the Blind Forest, Sunken Glades (plus the Ori opening flow).
- **D:** Ori and the Will of the Wisps, Inkwater Marsh (plus the Wellspring as a set-piece area).
- **E:** Level toolchain research: LDtk features, slopes and organic terrain in integer-AABB engines, how Ori builds its terrain, and set-dressing approaches. It also measures our current rooms against the same template.

**Then.** A synthesis agent writes the north star from the teardowns. A critic reviews it, and the user gets a taste checkpoint.

**What metrics can't see.** Whether our numbers capture *why* those spaces feel good (composition, sightlines, reveals). The teardowns must include qualitative "why it works" analysis, not only numbers.

**Status.** In progress.
