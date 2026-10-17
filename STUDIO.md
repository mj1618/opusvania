# Studio loop

The game is designed and played in **greybox** (flat shapes, hitboxes and labels, with Wing's own rig), and art is
left until the end (Matt, 2026-10-18). Scene 1 (`wood-hatch`) keeps its art as the look target for the wood.

"Quality" in greybox means everything except the art. It covers the level design, pacing, encounters, game feel, wayfinding,
secrets and rewards, teaching, the camera, readability, and how the story is staged. The bar is the first areas of the reference
games (`docs/design/quality-bar.md`): Hollow Knight's King's Pass and Forgotten Crossroads, Ori's Sunken Glades and
Hollow Grove, Nine Sols' opening area, Celeste's first chapter.

## The onion: build a chunk fast, then make it great, then check the layers above it

**1. Build a chunk quickly.** A chunk is about 15–25 minutes of play: a run of rooms that holds its own arc, such as the
wood up to its hub and both branches. It is built from the paper design to "plays end to end", without polishing any room.

**2. Iterate on the chunk until it meets the bar.** Each round:
1. **Review panel.** Independent reviewers, none of whom built the chunk, each work through one lens and score it against
   the quality bar's rubric:
   - **Level and pacing designer:** room by room and minute by minute.
   - **Feel and combat:** movement, the verbs, the creatures, the camera.
   - **First-timer agents:** they play with real keys and keep a journal.
   - **Persona bots:** numbers.
2. **Synthesis.** The orchestrator merges the reviews into a ranked list of the worst problems. The list is about the
   chunk as a whole, not about any one room. Typical answers are:
   - make a room bigger or cut it;
   - add a secret, a shortcut or a landmark;
   - change the order;
   - add a new encounter type;
   - retune a verb.
3. **Iterate.** Builders and engineers fix the top problems, each in their own area.
4. **Repeat** until every rubric item passes on two rounds in a row and the orchestrator agrees from its own play.
   Matt plays it when he can, and his notes outrank everything.

**3. Build the next chunk** the same way, then iterate on it.

**4. Layer reviews** check the structure above the chunks:
- **When a region is complete:** whole-region pacing, the hub and backtracking, the ability ladder across chunks, and
  whether the region's three feelings come through.
- **Every two regions, and before any art:** the whole game so far. This covers the difficulty curve, repetition, the story
  arc, whether it hangs together, and anything that feels disjointed.

Problems found at a higher layer go back into the chunk loop for the rooms they touch.

## Playtesting without Matt
- **Persona bots** (`npm run playtest`): naive, explorer, speedrunner and cautious. Each run records telemetry: time per room,
  deaths, the trace, time lost, hits per encounter, lamps and moths found.
- **First-timer agents** play in the page with real keys, take screenshots, and write what they understood and felt.
- **Matt's play is the gate** for each chunk and region.

## Working rules
- Sub-agents work in parallel, and each owns one directory or area.
- Agents commit only their own files (`git commit -- <paths>`). Never `git add -A`, stash or reset.
- **HEAD must always build.** Many agents share one working tree, so a commit of only your hunks can leave out a
  definition you depend on. After every commit, typecheck and run the unit tests on a clean checkout of HEAD
  (`git worktree add --detach <tmp> HEAD` with `node_modules` symlinked). The first-timer tool plays HEAD.
- **If you commit from a separate index** (`GIT_INDEX_FILE=...`), reset the shared index entries for those files
  afterwards (`git reset -q -- <paths>`). Otherwise the shared index keeps the old copies staged, and the next plain
  `git commit` silently reverts your work. That is how a commit lost another agent's hunks on 2026-10-18.
- Each agent runs `npm run check` and looks at its own result.
- Reviewers are separate from builders, and harsh. "Good for greybox" is a fail: the bar is the reference games minus
  their art.
- AI scores are lint, not the bar (`memory/ai-critics.md`). The orchestrator plays or watches the result before calling
  anything done.
