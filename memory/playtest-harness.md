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
- Multi-room: everything is keyed by `state.room`; headless.ts re-reads `game.scene` every step and remakes the
  camera on `spawn`. With `--until exit` (default) a run ends at the first `roomExit`, since an exit restarts the room
  today; use `--until none` once exits lead to other rooms.

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
