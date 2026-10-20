# Places, not paths: the brief (2026-10-20)

Three designers each lay out the game's opening area (the wood: from Wing's hatching to its first boss) as a
**room-level web**. We pick the best one and build it as a playable, painted demo.

## Why
Our metroidvania levels felt disjointed, obvious and bland. A study of the reference games' real maps
(`docs/design/reference-maps/README.md`; read it first, then skim `hollow-knight.md`, `ori.md` and `super-metroid.md`)
found the cause: **we design paths; they design places.** In Hollow Knight's Crossroads, 7% of the rooms are on the way
on; in ours, 70–100%. Even designers told to make places drew journeys, so this time the layout is checked by
numbers: `node docs/design/places/place-score.mjs <your.json>` runs the reference rules on your layout. **Design the
place first** (the web of rooms with its hub, pockets, dead ends, shafts and loops), **then** thread a thin main path
through it, **then** gate it.

## What Matt has told us (outranks everything)
- Movement, jumps and combat feel good and the painted art is good; the levels are what fail.
- The test grove is the most fun: dense, so at any moment there are 2–3+ things to do (an enemy, a find, leaves to
  cut, a lamp to fling from, a route choice). Every room note must say what's within reach.
- Discovery and challenge over guidance; trust the player; no hints because a tester got stuck. The player keeps
  control. The lab Weaver was a good first boss.
- Read `memory/story.md` and `docs/design/regions/wood.md` for the setting. The earlier attempts
  (`docs/design/regions/wood-area1-v3.md`, `docs/design/levels/proto-1.md`, `docs/design/skeletons/*.md`) are there
  to learn from, not to patch.

## Constraints so it can be built quickly
- Abilities found here: 2–3 from what the engine already has (`src/sim/abilities.ts`: wallJump ("claws"), glide,
  doubleJump, dash; plus the fling off lamps, which she starts with). She starts with run, jump, the blade and the
  fling. Keys: small finds counted by a door (`keys:N`).
- Boss: the Weaver (`lab-weaver`, `src/sim/boss/weaver.ts`).
- Creatures: what exists (`memory/creatures.md`, `memory/enemies.md`).
- 28–50 rooms. A room is 1 screen up to a few screens (1 screen = one 16:9 view). ~20–25 minutes on the main path for
  a first-timer, ~40 minutes to find everything.

## Deliverables (no engine work, no commits, no sub-agents)
1. `docs/design/places/<n>-<slug>.json` in the shape documented at the top of `place-score.mjs`. Rooms are laid out on
   the grid in screens (x across, y down) without overlapping, and a link joins rooms that touch.
2. It must pass every check of `place-score.mjs`. If you believe a check is wrong for your design, you may leave at
   most one failing, and argue why in the doc.
3. `docs/design/places/<n>-<slug>.md`, one or two pages: the place (what it is, its geography and landmark), the hub,
   the main path as a thin thread (with minutes), what each ability reopens, the 4–5 best moments, the density
   (a table: every room → the 2–3+ things within reach), the dead ends and what each pays, the secrets, where it
   borrows from which reference map, and its biggest risk.

Report: the paths, the score output, and the pitch in a paragraph.
