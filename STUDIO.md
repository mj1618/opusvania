# Studio loop

Matt decided on 2026-10-18: the game is designed and played in **greybox** first, a whole region at a time, and art
comes after the region plays great. Scene 1 (`wood-hatch`) keeps its art as the look target for the wood. Everything
else uses minimal graphics: flat shapes, hitboxes and labels, with Wing's own rig.

## The unit of work: a region
A region (the wood first) is about 12 rooms and 35–45 minutes. It is the smallest chunk where the things that make a
metroidvania good can be judged: pacing, getting lost and found, gates and backtracking, teaching an ability, a boss.
One room can't show any of these, and the whole game is too big to iterate on.

## Two loops

**Outer loop: the region** (top-down). Repeat until the region plays great in grey.
1. **Paper design** in `docs/design/regions/<region>.md`:
   - a beat sheet with minute marks and an intensity curve;
   - a room graph with gates, keys, loops, shortcuts, rest points and secrets;
   - an encounter list and a lamp list;
   - for each ability, how it is taught (show the lock, the glade, then the test);
   - room specs.
   It is checked against `docs/research/metroidvania-craft.md` §8 and `docs/design/core.md` / `world.md`.
2. **Greybox every room** from the specs, all of them connected, so the region plays start to end.
3. **Playtest the whole region** with persona bots and agent players (below), plus Matt when he can.
4. **Design review** by a separate agent: pacing against the curve, where players got lost, difficulty spikes, dead
   rooms, gates that don't teach, backtracking that drags. It ranks the 5 worst problems.
5. **Revise the paper design and the rooms.** Go to 3.

**Inner loop: a room, encounter or verb** (bottom-up), inside step 2 or 5.
Design note → greybox → bot and agent play with metrics → tune in `tuning.ts` and the room JSON. A verb or creature
must feel good in a plain room before any room is built around it.

**Exit criteria for a region:**
- The bots and agent players finish it, with no softlocks and the sequence-break check passing.
- No first-time persona is lost for more than 2 minutes.
- Time and intensity follow the curve.
- Every room has a stated purpose, and every ability is taught before it is tested.
- The boss is fair: tells read and deaths are the player's fault.
- **Matt plays it and says it's fun.**

Only then does the region get its art pass, using the kit proven in scene 1, and the next region starts.

## Playtesting without Matt
- **Persona bots:** a naive player (holds right, jumps at walls), an explorer (visits every exit), a speedrunner, and a
  "first-timer" agent that plays with real keys through the page and writes down what it understood.
- **Telemetry for every run:** time per room, deaths and where they happened, the path trace, time spent lost (no new
  room for N s), lamps found, backtracking time, input density. A run report with a heatmap per room.
- **Matt's play is the gate** at each region milestone. His notes outrank every metric.

## Working rules
- Sub-agents work in parallel, and each owns one directory or one area. They commit only their own files
  (`git commit -- <paths>`) and never run `git add -A`, stash or reset.
- Each one runs `npm run check` and looks at its own result.
- Reviewers are separate from implementers, and harsh.
- AI scores are lint, not the bar (`memory/ai-critics.md`). The orchestrator plays or watches the result itself
  before calling anything done.
