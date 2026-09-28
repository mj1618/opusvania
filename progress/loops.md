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

**Status.** In progress.
