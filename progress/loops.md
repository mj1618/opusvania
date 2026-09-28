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

**Status.** In progress.
