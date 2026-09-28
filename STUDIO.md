# Studio loop: how the orchestrator works

Read this at the start of every orchestrator session and after every context compaction. It is the operating manual for the lead agent. Sub-agents only need `CLAUDE.md` plus the brief they are given.

## 1. The user's original instructions (2026-09-28, preserved verbatim in spirit)

- Operate in a **loop**. You are the **orchestrator**; delegate the work to **sub-agents**.
- Each loop: decide the next chunk of work, sized at **about an hour of orchestrator time (≈ a couple of human-weeks)**. Implement it. Then **review and test** it.
- After review, decide one of:
  1. **Improve** the current implementation.
  2. **Ditch** it: it didn't work out.
  3. **Move on** to something else.
- **Before moving on, REVISE `PLAN.md`.** Every implementation can invalidate earlier assumptions, so rethink the plan each time.
- Then **brainstorm, research and plan the next loop**, and do it.
- **Parallelise** where it is cheap: fan out sub-agents on independent work, without drowning in coordination overhead.
- **Goal:** eventually a AAA-quality metroidvania, *Opusvania*, that feels like the start of a new hit franchise.
  - Be **original**: try new things and experiment. Don't copy other games.
  - But don't reinvent everything. Use **industry-proven** metroidvania practice for the parts that aren't our differentiator.
- Work like a **professional game studio**: iterate, revise what doesn't work, backtrack, build the tools needed to test the game properly, do play-throughs, and design things in the right sequence (e.g. bosses vs map vs artwork).

## 1b. Standing answers from the user (2026-09-28)

- **Builds:** use the `gh` CLI. Repo is `mj1618/opusvania` (private). GitHub Pages is not available for private repos on the user's plan, so see `progress/user-inbox.md` for the build-hosting decision.
- **Playtests:** the user plays as often as they can, but **don't rely on it**: loops run while they sleep. Never block on feel sign-off; use playtester agents, bots and metrics, and queue items for the user.
- **Art:** **no real artwork for now.** Work on everything except art: code-drawn placeholder shapes, shaders, particles and lighting are fine. No paid image, audio or video APIs.
- **Concept:** the orchestrator decides, but it **must be unique**. Inject real randomness into ideation (random Wikipedia articles, random dictionary words, forced constraints, different models per sub-agent) so we don't get the default ideas models are trained on. Re-run this divergence process for any major creative decision.
- **Duration:** **keep looping until the user stops you**, which could be a week or more.
- **Clips:** build video/GIF capture of gameplay so agents and the user can judge motion and feel.
- **No Sentry** or third-party crash reporting.

## 1c. Course correction (2026-09-28, after L4)

The user's review: the levels are small, not fun, disjointed, and don't feel like Hollow Knight or Ori. Diagnosis:
- Every loop proved a mechanic, and no loop made a place.
- We built what we measured.
- Nobody owned the world.
- There was no reference teardown for levels.
- The tools (ASCII grids, no slopes or organic terrain) rule out Ori-like spaces.
- The world came last.
- Reviews judged isolated rooms.

The rules below (§2.2, §2.4, §4 and §7) exist to prevent this. They override anything earlier that conflicts.

## 2. The loop

Each loop has an id `L<n>` and one entry in `progress/loops.md` (create it on first use). Steps:

### 2.1 Orient (orchestrator, ~5 min)
1. Read `STUDIO.md`, `memory/README.md`, the latest entries in `progress/loops.md`, and the relevant parts of `PLAN.md`.
2. Check `progress/user-inbox.md` for answers or feedback from the user, and act on them first.
3. Run `git log --oneline -20` and `npm run check` to confirm the tree is green before starting.

### 2.2 Choose the chunk
- Pick the **highest-risk, highest-leverage** unfinished thing on the critical path (see PLAN §7 phase order), unless the user redirected.
- Write the loop brief in `progress/loops.md` **before** starting:
  - **Goal** and the **hypothesis** it tests ("wall-jump with 0.16s forced speed feels better than 0.1s").
  - **Acceptance criteria**, measurable where possible.
  - **Kill criteria**: what result means we ditch it.
  - **Work streams**: which run in parallel, which are sequential, and which agent owns which files.
- Size: about one hour of orchestrator time. If it's bigger, split it; if it's trivially small, bundle.
- Include an **experiment slot** when possible: one small prototype of an original idea (see §5), alongside the proven-practice work.
- **Every loop advances the real world.** Test rooms and gyms are allowed as tools, but they don't count as progress. Each loop must add to or improve the continuous, connected game world (the region blockout, and later the vertical slice) and say how.
- **Measure against the north star.** Acceptance criteria must include at least one experience-level criterion from `docs/design/north-star.md`, such as sense of place, desire to explore, flow across rooms, or scale against the teardown numbers. Mechanic metrics alone can't pass a loop.
- **Name what the metrics can't see.** Each brief lists what its metrics miss, and who will judge that (a playtester, a critic, or the user).

### 2.3 Build (sub-agents)
- One sub-agent per independent work stream. Parallel streams use **separate git worktrees** (`isolation: "worktree"`) and must not share files. Never run two agents on the player controller or core physics at once.
- Every brief must be self-contained: the goal, files owned, acceptance criteria, the rules in `CLAUDE.md`, and "verify in the running game with playwright-cli using session `-s=<stream-name>`".
- Ask each sub-agent to return a **short report**: what changed, how it was verified (state dumps or screenshot paths), what's unfinished, and what it learned (also written to `memory/`).
- The orchestrator does not write feature code itself. It integrates, merges and resolves conflicts.

### 2.4 Review and test (separate sub-agents from the builders)
Run these after each build, in parallel where possible:
- **Code review**: architecture rules, determinism, tuning in data not code, test coverage. Use `/code-review` or a reviewer agent.
- **QA / adversarial play**: try to break it (edge inputs, frame-perfect cases, room transitions, save/load).
- **Play-through / design critique**: a "playtester" agent plays the build via `window.__game` and screenshots or clips, then critiques against the pillars in PLAN §1. It reports what's fun, confusing, ugly or boring.
- **Automated gates**: `npm run check`, replays, the progression validator, perf budget.
- **Blind novice playtest** for anything a player must discover: an agent plays the live build without reading code or docs first (see `docs/reports/L3-novice-playtest.md`).
- **Independent audit** of any builder-authored verdict or metric.
- **Continuous-run playtest** (every loop that touches the world): an agent plays a continuous 10–20 minute route through the connected world, not isolated rooms. It judges:
  - sense of place and cohesion
  - desire to explore
  - getting lost vs staying oriented
  - pacing and rhythm across rooms
  - landmarks and sightlines

  It compares against the north star and the teardown numbers. Evidence is continuous video plus a map screenshot, not per-room contact sheets.
- **World cohesion review** by the world/level owner: does the new work fit the region's identity, landmarks, palette and flow?

### 2.5 Decide
Record in `progress/loops.md`: **Improve**, **Ditch** (revert or shelve on a branch, and write why in `memory/`), or **Move on**. Base it on the acceptance and kill criteria written in 2.2, not on sunk cost.

### 2.6 Revise the plan (mandatory before moving on)
- Update `PLAN.md`: what we learned, which assumptions changed, re-ordered or cut work, new risks. Record significant changes in a dated "Plan revisions" list at the end of `PLAN.md`.
- Update `memory/` with durable learnings. Prune stale entries.

### 2.7 Report to the user
- Append a short **loop report** to `progress/loops.md`: goal, outcome, decision, evidence (screenshots or clips), what's next.
- Put anything that needs the user (taste calls, playtests, approvals, API keys) in `progress/user-inbox.md`, marked **blocking** or **non-blocking**.
- Commit to `main` with a message starting `L<n>:`. Tag milestone builds (`build-L<n>`) so older builds can be compared.

### 2.8 Next loop
Brainstorm and research (web search, reference analysis) for the next chunk, then return to 2.2.

## 3. When to wait for the user

- **Never idle.** If a decision needs the user, record it in the inbox with a recommended default, then keep working on something that doesn't depend on it.
- **Blocking only for:** spending money or adding paid APIs, the final concept/name, art direction lock, and phase exit criteria that PLAN says need human sign-off (movement feel, combat feel, beauty room).
- **Taste checkpoints.** At least every 2–3 loops, put a playable build and a 1–2 minute continuous video in the inbox and ask: "Does this look and feel like it's heading toward Hollow Knight / Ori?" Don't block on the answer. Treat any "no" as the top priority for the next loop.
- Proceed on your best default for everything else, and make it easy to revert.

## 4. Sequencing (studio practice)

Follow PLAN §7. The principles behind it:
- **North star first.** Before mechanics work in any new area, define the target experience in `docs/design/north-star.md`: a beat-by-beat description plus quantitative targets from reference teardowns (`docs/research/teardown-*.md`).
- **World blockout early, in parallel with feel.** Tune movement and camera inside a large connected region, not only in single-screen gyms. Big spaces make different demands.
- **Feel before content, greybox before art, one polished slice before scale.**
- **Tools before content**: build the test harness, replay system, validators, bots and debug views before the content that needs them.
- **Level tooling is critical path.** The level editor (LDtk), slopes and organic terrain, set-dressing and camera framing tools limit level quality as much as the controller does.
- **Design the world before the bosses in it**, but prototype one boss early in greybox to test the combat system.
- **Art direction is a parallel track** once movement exists, not a gate on gameplay work.
- **Vertical slice before horizontal expansion.** Nothing scales out until the slice meets its bar.
- Schedule a **refactor / tech-debt loop** roughly every 5 loops or when reviewers flag rot.

## 5. Originality

- Keep a list of candidate **signature mechanics and ideas** in `docs/ideas.md`: what's new about them, the risk, and a cheap test.
- Prototype at most one or two at a time, in greybox, in the experiment slot. Keep ideas that pass a playtest, and drop the rest without regret.
- Aim for **one to three signature ideas** that define the franchise. Everything else uses proven metroidvania practice.

## 5b. Ownership

- **One world/level design owner**, a standing role briefed with the north star. That agent authors or approves every room in the real world and runs the cohesion review.
- **One art-direction owner** for the code-drawn look, covering palettes, landmarks and per-region identity, so rooms don't look randomly generated.
- Mechanic owners (movement, combat, audio, tools) don't author real-world rooms. They hand requirements to the world owner.

## 6. Orchestrator hygiene

- Keep your own context lean: delegate file-heavy reading and ask for conclusions, not dumps.
- `progress/loops.md` is the source of truth for loop state. It must be enough to resume after a compaction.
- Don't let parallel streams sprawl: 2 to 4 concurrent sub-agents is the normal range.
- While a sub-agent is working in the main tree, the orchestrator must not `git pull`/rebase there (autostash can disturb its uncommitted work). Commit orchestrator docs only with `git add <paths>` + push, or from a separate worktree.
