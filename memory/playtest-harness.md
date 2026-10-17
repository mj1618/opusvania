# Playtest harness: persona bots and telemetry (`npm run playtest`, tools/playtest/)

STUDIO.md "Playtesting without Matt". Built 2026-10-17. Reports go to `playtest-reports/` (gitignored).

## Run it
- `npm run playtest` = all four personas on wood-hatch, headless (no browser, ~20 ms a run). Prints a comparison
  table; writes `playtest-reports/<stamp>-<persona>/` (`report.md`, `heatmap-<room>.png`, `trace.json`, `tape.txt`)
  and `<stamp>-summary.md`.
- `--room a,b --persona naive,explorer --abilities glide,dash --seconds 300 --give-up 120 --lost-after 10 --runs 3
  --until exit|none --seed 1`. `--runs n` gives each run its own persona dice (only cautious rolls any today).
- `--live`: the same personas in the page with real keys (needs the dev server on 5180; one browser per run). On this
  machine the page ran one sim step per animation frame and the live runs matched the headless ones to the frame.
- `--clip [--clip-seconds 30]`: replays the run's input tape in the page (`?manual`, `g.load()`, then the tape) through
  `tools/clip.ts --pickups --wide`, after checking the replay ends in the same state hash as the headless run. A
  14 s clip takes ~1.5 min and the GIF is ~65 MB (the clip tool's): keep clips short.
- A first-timer agent (or Matt) playing by hand: in the page,
  `const pt = await import('/tools/playtest/live.ts'); pt.record('agent')`, play (playwright-cli `press` / `keydown`),
  then `JSON.stringify(await pt.stop())` into a file and `npm run playtest -- --from that.json` for the same report.
  `pt.play({persona: 'explorer'})` runs a persona in the page (what `--live` does).

## Files
`observe.ts` (what is on screen), `map.ts` (the persona's map: surfaces, moves, Dijkstra), `personas.ts`,
`recorder.ts` (telemetry), `headless.ts` (the `Game` harness + the real follow camera, src/render/camera, which is
pure), `live.ts` (in the page: Vite serves `/tools/...`), `report.ts`, `heatmap.ts` + `png.ts` (own PNG encoder on
node:zlib: no canvas dependency), `targets.ts`, `cli.ts`. Tests: `tests/unit/playtest.test.ts` (a two-floor gap lab
room every persona must leave by its exit, determinism, telemetry on synthetic events, targets, PNG).

## Personas (what they see)
They decide from `observe()`: her own state, and only solids / exits / pickups / creatures / lights inside the
follow camera's view (+32 px). A solid's top counts as known ground only once its top edge was in view. They
remember what they saw (`Mind`, one per room). The speedrunner alone knows the whole room (it has run it before).
- **naive**: holds the way on (right; toward an exit once one is in view), jumps (14 frames) at a wall or a gap edge
  (12 px); no headway for 8 s: turns round for 3 s. Mashes jump in the cocoon. The same rule as the rooms.test bot.
- **explorer**: goes to the nearest of: pickups seen, lights not stood at, ground seen and not walked (256 px cells,
  the surface it stands on first), then "dangling ends" (an end with no known move onward: it leaps off), then exits.
  Taps attack at a creature close in front. Presses out of the cocoon 2 s after it listens.
- **speedrunner**: the shortest route to the exit on the full map, jumps 3 px from the end, short hops down short
  gaps, dashes long clear runs when it owns the dash. Presses out at the first listening frame.
- **Lures** (memory/lures.md): caught, naive and cautious mash jump (beat free), explorer and speedrunner cut the
  flame (it goes out); a speedrunner that owns the dash dashes out. Explorer and speedrunner also cut a flame within
  ~110 px (up / down cut when it is above / below). Nobody steers round a lure's pull.
- **cautious**: like the explorer but forward only and exit first once seen; stops every 2-4 s for 0.4-1.3 s, stops
  0.5-1.25 s before every edge then creeps to it in taps, jumps 2 px from the end, waits (up to 4 s) while a
  creature within 420 px faces her. Waits for the cocoon to break by itself (12 s).
- **Adding one**: a class with `decide(obs, scene) -> input mask` (+ `notes`, `itinerary`) in `personas.ts`, or a new
  `Planner` config (target picker, edge, hold, stops), then add its name to `PERSONAS` and `makePersona`.
- Moves the planner knows: walk on (rolling steps <= 16 px are one surface), jump across a gap, jump up beside a
  higher surface's end, drop off an end over a lower one, drop through a one-way. Reach comes from the "Reach" table
  in movement-controller.md with an 18% margin. A move that fails twice (landed elsewhere / not reached in 8 s) is
  dropped and the route is planned round it; a target not reached in 45 s is given up (both go in the report).

## Metric definitions (recorder.ts)
- **time per room / area**: frames with `state.room` = the room; area = the room's `region`. A room visit ends at
  the next room change or at the end; `how` = the exit id. Per-room targets come from any table in
  `docs/design/regions/*.md` with a "room" column and a "target / time / min" column (`90 s`, `1:30`, `1-2 min`).
- **from hatch**: time after the `hatch` event (the cocoon); "time" counts from boot (the fade-up and the cocoon too).
- **deaths** = `fade` events (with the last creature that hit her); **catches** = `fallCatch` (caught falls).
- **progress** = standing in a 128 px cell of the room never visited before, entering a room for the first time, a
  pickup, a light lit or snuffed, an ability gained, a moth freed. **Lost time** = every stretch of `--lost-after`
  (10 s) or more without progress, counted in full, with the box she wandered in. The run gives up after
  `--give-up` (120 s) without progress (outcome `lost`).
- **backtracking** = frames moving (> 30 px/s) through a cell she had already left once.
- **lights**: every entry of `scene.lanterns`, `scene.lamps` and (when it exists) `scene.lures`; seen = first frame
  its point is in the view; lit = `lanternKindle` / `lampKindle`; snuffed = any event whose type contains "snuff".
- **moths freed**: the `moths` of every `lureSnuff` (a lure put out frees its moths), plus any event named like
  `mothFreed` / `cocoonOpen` (`FREED` in recorder.ts). **caught by lures**: `lureCaught` per lure id, and frames
  with `player.lure >= 0`. **abilities**: new ids in `state.save.abilities`.
- **input**: presses = rising edges of any button; changes = mask changes; % of frames with a button held.
- **speed**: |velocity| (falls included, so max is a fall's 1427 px/s), average over frames with control and over
  frames moving; distance in px. **hits per creature**: `hurt.source.id`.
- Every event type is counted in the report's "Events" line, so new sim events show up before anything reads them.
- **outcome**: `exit` (left by an exit), `done` (a planning persona had nothing left to go to for 5 s: rooms with no
  exit, like the labs), `lost` (no progress for `--give-up`), `timeout` (`--seconds`).
- Multi-room: everything is keyed by `state.room`; headless.ts plays in `GAME_WORLD` (a room id given; a test-built
  room plays alone), re-reads `game.scene` every step and remakes the camera on `spawn`. `--until exit` (default)
  ends a run at the first `roomExit`; `--until none` follows her through the world (2026-10-17: from wood-hatch the
  bots reach lab A, B and C; the naive one ends pinned against C's east wall, the planners stop when nothing is
  left that they want).

## First numbers (wood-hatch, 2026-10-17, room as of 8a2c01e + the level agent's working copy)
| persona | exit at | from hatch | catches | lost | backtrack |
|---|---|---|---|---|---|
| naive | 13.1 s | 10.2 s | 0 | 0 | 0.2 s |
| speedrunner | 13.0 s | 10.3 s | 0 | 0 | 0.1 s |
| explorer | 20.2 s | 15.5 s (west to the trunk first) | 0 | 0 | 3.0 s |
| cautious | 35.7 s | 23.7 s (12 s waiting for the cocoon) | 0 | 0 | 0.1 s |
The speedrunner cannot beat the naive bot here: no abilities, and holding right is already the optimal line.

lab-lamps (the lure lab, all abilities, no exit, working copy of 2026-10-17): naive gives up lost after 82 catches in
pit-b (800 px wide: it never glides); explorer done at 65 s (69 catches, 1 lure out); speedrunner done at 63 s (0
catches, 4 lures out, 20 moths, but 34 s lost round the post and the one-way at x 3920-4260: its hands); cautious
done at 83 s (6 catches). Read these as "what a bot does", not yet as the lab's verdict.

## Known limits
- The bots' hands, not the level, cause some failures: no wall-kick climbing in the planner (the naive habit of
  jumping at walls is all), no glide planning beyond holding jump while short of a landing, no combat beyond a tap at
  close range, no offer (V) and no lamp verb. In test-grove (no exits, a heart goal) they wander and get lost round
  the pool and the shaft: read lost time there as "the bot could not", not "a player could not".
- Live runs: the tape is the buttons held per animation frame, so a replay of a live run is close, not exact. When
  the page runs slower than 60 fps a frame covers several steps and the persona decides less often.
- The view is the follow camera at the 16:9 safe size (1920x1080); beats (the hatch framing, the lean) are not in it.
- Reach is approximate; a jump the bot drops may still be makeable by a person (the note says which).
- `npm run check` on a loaded machine (load average 170+ from parallel agents): the e2e boots time out; rerun later.

## The wood, R2-R9 (2026-10-18, `--until none` from wood-hatch; R10 / R11 stubs)
| persona | chase | wicks | burrow | glade | glidewalk | hollow | hawkers | lantern | how it ends |
|---|---|---|---|---|---|---|---|---|---|
| target (wood.md §9) | 30-60 | 60-120 | 90-180 | 45-90 | 180-270 | 45-90 | 90-150 | 140-250 | |
| naive | 9.9 | 5.6 | 8.7 | 5.2 | 11.3 | 7.0 | 6.0 | 9.3 | at R9's lock at 1:16; then back and forth hawkers <-> lantern (it never turns back 3 rooms to the well) |
| speedrunner | 10.0 | 6.6 | 9.0 | 5.3 | 16.2 | 3.1 | | | well first (its shortest route), done in R10's stub (planners cannot wall-climb) |
| cautious | 17.2 | 12.2 | 24.2 | 8.6 | 26 (stops) | | | | stands on E0: T2 never comes into view from where it stops |
| explorer | 16.5 | 29.6 | 13.3 | 52.0 | 155 (stops) | | | | jump-glides into gap 2's thorns and the thorn branch: 94 hits |
Hits per encounter: burr-first 0-1 (planners) / 1-4 (naive, 1 fade); burr-ledge 1; hawk-first 0-1; thorns 0 for the
naive (it walk-off glides), up to 52 + 42 for the explorer. The live naive run (real keys, page) matched to the frame.
**Bots run the rooms 3-15x faster than the first-timer targets**: judge times with the first-timer agent and Matt.
What the planners learned this round (tools/playtest/): the **pogo** (a seed-case under her feet within the down
cut's reach: a down cut; map.ts lets a jump span a gap over a chain of seed-cases <= 320 apart, executed as a 4-frame
hop); **rotten bark** in the way gets cut; a **south exit is a hole**: stand on the lip on her side and walk off it,
never leap it (the R4 hole has a ledge past it), and a hole is seen from its lip (observe's exit rect is 720 deep);
a **walk-off glide** when jump is still held from the glide that landed her (R6 gap 3's thorn branch); a landing
right at a launch end is not "off the map" (feet past the end); a target given up for want of a route is tried
again once more of the room is seen; forward personas prefer a way through to a one-way drop. The naive: once it
owns glide (the glade's line) a gap jump is held from then on, so later edges are walk-off glides; it walks into a
gap that is a south exit; its headway resets per room (a stale best x from the last room turned it round in R6).
Not done: planners cannot wall-climb (R10's stub, R9's shaft, the up-shaft) and do not choose a glide line; the
cautious one does not look ahead from a lip.

## The well (R10), 2026-10-18 (bots from the hub, HEAD's harness)
Every persona goes down the well and loses to the old burrback: naive 22 hits / 10 fades, speedrunner 38, explorer
60, cautious 61, in 2-3.5 min; none opens the gate. Skills the bots need for R10 and the glide rooms (for the harness
agent): **pogo a braced creature's shell** (down cut on the tell, one per brace) and **bait a ram into a wall** for the
stun window; **kick-climb a two-face shaft** (R10's climb-out, R9's broken face, the up-shaft); **pick the walk-off
line** at a gap with something over the jump's hump (R6 gap 3: the planners jump-glide into the thorn branch 14-48
times); **don't hop under a wick** (R6's W4 pulls anything airborne beneath it); **turn back to a one-way drop** after
a lock (the naive ping-pongs hawkers / lantern and never finds the well).

## Multi-room notes (2026-10-18)
- Planner fix: its memory (exits, lights, pickups, walked cells, given-up targets, move tries) is **per room**
  (`RoomMemory`); before, a given-up `exit:e` in one room shut the next room's `e`, and the cautious bot ended "done"
  in wood-chase chasing wood-hatch's exits. On entering a room the opening she came in by is given up (planners
  bounced between two rooms' facing exits), and given-up exits no longer hide the forward frontier.
- `playwright-cli` + `eval` of a long in-page player on the dev server died with "execution context destroyed" while
  other agents edited files (HMR reloads), and `tsx` / vitest runs broke on their half-written sim files. A HEAD
  snapshot works: `git archive HEAD | tar -x -C <scratch>/snap`, symlink node_modules, copy your own files over, and
  run tsx / vitest / `npx vite --port 5192` (live runs need the dev server: they import /tools/) from there.
