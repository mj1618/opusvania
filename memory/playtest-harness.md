# Playtest harness: persona bots, telemetry, region runs, the first-timer agent (tools/playtest/)

STUDIO.md "Playtesting without Matt". Reports go to `playtest-reports/` (gitignored).

## Run it
- `npm run playtest -- --region wood --chunk wood-hatch,wood-chase,wood-wicks,wood-burrow,wood-glade,wood-glidewalk,wood-hollow,wood-hawkers,wood-silk,wood-well --upto wood-well`
  = **the region run** for area 1 (R1-R10, df4b0c5; `a..b` ranges need the targets table, see "Area 1 skills"). `--chunk a..b,c` = the region doc's §9 rows from a to b plus c: a run is `through` once
  she has been in every chunk room (and left `--upto` by another way than in); the speedrunner heads for the nearest
  chunk room it has not been in. Without `--chunk`, `--upto` alone is the end. It is every persona, headless, from the world's
  start (`--until none`), until it leaves `--upto` by another way than it came in (`through`), gives up lost, or stops.
  One combined `<stamp>-region.md` (time per room, longest lost stretch, deaths / catches / hits, lamps put out / seen /
  there, all against wood.md §9; encounters; moths; abilities and when; how each run ended) beside the per-persona
  reports. ~6 s for all four.
- `npm run playtest` = all four personas in wood-hatch to its first exit. Per run `playtest-reports/<stamp>-<persona>/`
  (`report.md`, `heatmap-<room>.png`, `trace.json`, `tape.txt`) and `<stamp>-summary.md`.
- Options: `--room a,b --persona naive,explorer --abilities glide,wallJump --seconds 300 --give-up 120 --lost-after 10
  --runs 3 --until exit|none --seed 1 --goal <room>` (where the speedrunner heads; default the placed room furthest from
  the start). `--live`: the same personas in the page with real keys (dev server on 5180; live runs matched headless to
  the frame on wood-hatch). `--clip [--clip-seconds 30]`: the run's tape replayed in the page through tools/clip.ts
  (checked against the headless state hash first; ~1.5 min for 14 s, the GIF ~65 MB). `--from trace.json`: a report for
  a trace recorded in the page.
- Debug a bot: `globalThis.__ptDebug = (s) => console.log(s)` before `runHeadless(...)` prints every line and every
  fight tactic the look-ahead tried, with its outcome. `runHeadless(...).persona` has `chosen` (lines played) and notes.

## The first-timer agent (`npm run firsttimer`, tools/playtest/firsttimer.ts)
A Claude sub-agent plays in the page with real keys, a burst at a time, the game paused between its turns. Commands
(one per turn; a background server holds the browser):
`start [--room wood-hatch] [--name s1] [--abilities glide]` (prints the session dir and a first screenshot),
`act "R60 R+J20 .30 {Tab}" [--every 2]` (real keys in real time; prints what happened in a player's words — hits,
deaths, falls, rooms, abilities, catches, the map — where she is, and the screenshots: every 2 s and at those
moments), `look`, `status`, `note "text" [--mood lost|stuck|unfair|fun|ok]`, `stop` (report.md + heatmaps + trace,
and `journal.md`: every act and note with its screenshot). Keys: R L U D, J jump, X dash, A cut, O offer, `.`
nothing; a number is frames (60 = 1 s); `+` holds two; a player's other keys in braces: `{Tab}` (the map: it
freezes the sim, the burst runs on the page clock), `{R}` restart, `{M}` sound, `{Esc}`, `{Enter}`; `{Tab}30` holds.
- **What it sees is what a player sees**: greybox designer labels and room notes are off (every room's init turns
  them back on, so the burst re-asserts it on each room change); designer keys `{G}` `{F2}` `{Panel}` are refused.
  `start --labels` keeps the labels, `--dev` allows those keys: only when the orchestrator asks.
- **Several sessions at once**: `start --name <you>`; every later command takes the same `--name` (it may be left out
  while only one session runs; with two or more it refuses and lists them). Each session has its own pointer
  (`playtest-reports/.firsttimer/<name>.json`, cleared when its server is gone) and browser. `list` shows them. (Round 1
  had one shared pointer: one agent's commands went to another's session.)
- **It plays a pinned clean build**: `start` makes a detached worktree of HEAD per commit (`.scratch/playtest-snap-<sha>`,
  gitignored, node_modules linked), first loads its rooms and world (`firsttimer.ts validate`): a commit that does not
  load stops `start` with the commit, the problem as `path: message` lines and the room files that commit changed
  (`loadError` in report.ts), and nothing is started. Then one Vite per commit (from `--snap-port` 5193 up), shared by
  every session on it; snapshots of older commits nobody plays are stopped and removed at the next `start`
  (registry `.scratch/playtest-snaps.json`). The session server runs from the snapshot; its log is `server.log` in the
  session dir, and a session that fails to boot prints its tail. The client commands import nothing of the game.
  `--tree` plays the working tree on the dev server (`--url`, default 5180). The journal's header names the build
  (`Build: <sha> ("subject"), pinned for the whole session`); a session never changes build mid-run.
- **The save and R** (round 4 bug, fixed 2026-10-18): from the world's start the session page is **the game**
  (no `?room=`, `?fresh`): it autosaves and `{R}` goes back to the last save, as for a player. Any other `--room` is
  a test boot: the slot is never read or written and `{R}` starts that room over **with its own kit** (that is what
  put ft4 in glade 2 with wall jump and a new tally: R in wood-well's test boot, not another session's save).
  Every session has its own Chromium and a fresh context, so its slot is its own (tested: two at once, progress in
  one, R in the other shows none of it). The journal states the save at start; each `{R}` notes what it gave back
  (`R: back to the moon patch <id> in <room> (moths n, owns ...)`). Human-like renders boot `?room=` and never press R.
  Making a snapshot is locked (`.scratch/playtest-snap.lock`: two `start`s at once on a new commit raced), and a port
  where anything answers (another tool's server, even a 404) is not free.
- **Events are read by identity, not by frame** (live.ts `fresh`): `{R}` and a reload reset the frame count, and a
  frame-window cursor re-read the whole log (round 2: ~1,100 duplicate screenshots and nonsense totals).
**Brief to paste to the sub-agent:**
> You are playing Lampfall for the first time. Know nothing about it beyond what you see. Run `npm run firsttimer --
> start --name <you>` from the repo root and pass `--name <you>` to every command after it; then loop: Read the newest screenshot, decide, `act` a short burst (0.5-4 s;
> moves `R L U D`, `J` jump, `X` dash, `A` cut, `.` wait, a number of frames after each, `+` to combine, and `{Tab}`
> for the map, `{R}` to restart), Read what happened and the screenshots. Every minute or at any moment that matters,
> `note` what you think, in the first person and plainly: what you think you should do ("I think the moths want me to
> follow them"), when you are lost ("I'm lost: I've walked this branch three times", `--mood lost`), stuck, a hit that
> felt unfair and why (`--mood unfair`), what you enjoyed (`--mood fun`), what you did not understand. Don't read the
> code, the room files or the design docs. Play until you reach <goal> or 20 minutes of game time, then `stop` and
> reply with the journal's path and your five strongest impressions.

## Human-like runs (`npm run humanplay`, tools/playtest/humanrun.ts, human.ts, feel.ts)
A bot that plays like a person, over the whole chunk, watched as video. Built 2026-10-18 (review:
`docs/design/regions/reviews/chunk1-humanlike-r1.md`).
- `npm run humanplay -- run` = casual / average / skilled x seeds 1-3 on the pinned build of HEAD (snapshot.ts, the
  first-timer's), headless at sim speed (~2 s a run) from the world's start until `through` the chunk, `lost`
  (`--give-up` 180 s without progress), `done` (gave up: nothing left it can think of) or `--minutes` 40; then each
  tape is replayed in that build's page and recorded (~real time a run, `--jobs` 3 at once: ~1 h for nine).
  `--no-render`, `--skills average --seeds 4,5`, `--tree` (the working tree at `--url`), `--chunk id,id`, `--upto`.
  `render <run dir>` re-renders one. The working tree's harness is copied into the snapshot
  (`<snapshot>/tools/playtest-human/`) so the tape is played by the code the page replays; `meta.json` `render.match`
  = the page ended in the headless run's state hash.
- **Out**: `playtest-reports/humanlike-<stamp>/summary.md` (one row a run, means a skill) and per run
  `<skill>-s<seed>/`: `video.mp4` (the whole run at 2x, 30 fps, 960x540), `frames/<room>/mm-ss.jpg` (one a second of
  play), `contact-<room>-NN.jpg` (6 x 6 of those: 36 s a sheet), `moments/mm-ss-<what>.jpg` (hatch, first entry to each
  room, every hit / death (before and after) / catch, 5 s into each lost stretch, abilities, lamps lit / snuffed, the
  old burrback's start and end), `report.md` (the usual run report + feel metrics + the timeline), `timeline.md`,
  `feel.json`, `trace.json`, `tape.txt`, `heatmap-<room>.png`, `meta.json`.
- **How a reviewer agent watches a run**: read `summary.md`, then a run's `report.md` (feel table, timeline: the
  `stuck` / `falling` rows are where to look) and Read its `contact-<room>-NN.jpg` sheets (a room at a glance) and the
  `moments/` stills. For a stretch in motion, cut frames from the video: 1 s of game = 0.5 s of video, so game time
  `T` s is video `T/2`: `ffmpeg -ss <T/2> -i video.mp4 -t 5 -vf fps=6,scale=480:-1,tile=6x5 sheet.jpg` (10 s of play
  as 30 pictures in one image) or `-frames:v 1 still.jpg`. Don't Read the mp4 itself.
- **The body** (human.ts `Motor`, per skill row in `SKILLS`): a press lands `latency +- jitter` frames after the brain
  wants it (keys pressed together, e.g. down + cut, land together); after a surprise (a hit, a tell, a catch, a wake:
  feel.ts `surprising`; a ram after its tell is not one) a reaction time (casual 240-330 ms, average 200-280, skilled
  170-230; x1.25 out of nowhere, less the eye's share); a hold comes out `holdErr` longer or shorter, counted from the
  real press (a long jump is held at least as long as meant); stray presses (2 / 1 / 0.3 a minute) and double taps.
  Deterministic per seed.
- **The eye and the head**: the world is seen `perception` frames late (4-6; a ring of past states), her own body now
  (a player feels their hands: with a delayed body no wall-jump climb worked). No look-ahead, no sim copy: lines by rule
  of thumb (`humanPick`: under a roof walk off, a gap past a plain jump jump-glide, else a full jump), the next idea
  after each failure; landing back where it set out is a miss; a little hesitation at edges; edges and pogos pressed a
  `latency + 1` early. Fights from the tells on screen (`humanTactic`), answered at once when the tell changes, jumps
  timed where the ram will be; after `patience` hits from one kind, another plan (burrbacks: bait into a wall). Out of
  ideas in a room: tries again what failed (six rounds, 10 s apart), then backs out, toward a room with an opening it
  saw and never took. Rotten bark in a floor on screen means an opening under it (the R6 lesson).
- **Feel metrics** (feel.ts; 10 s buckets labelled waking / falling / fighting / exploring / stuck / travelling):
  first input after spawn (the cocoon listens from 2.5 s), flow = moving at half run speed or in the air, stood still,
  deaths per 10 min, fail-retry loops (a fall or death within 20 s and 300 px of the last), longest stretch over ground
  already walked, presses a second, seconds between new things (a new 128 px cell, a room, an ability, a lamp out).
- **Not built**: the LLM-intent mode (an agent picking intents from a screenshot every few seconds); the first-timer
  agent covers judgement with real eyes for now.
- **Lab numbers it found** (sim stepped directly, enemies removed where noted): the old burrback's ram (b5c50f2)
  is cleared by a jump from 14 to 40 frames after its tell starts (28-frame tell): a jump in the first half of
  the tell lands in the ram. The burrow pogo chain (no glide yet) takes a take-off within -3..+6 frames of the edge and
  a down cut up to ~4 frames late.

## Area 1 skills (2026-10-18, df4b0c5: the rebuilt area)
- **Aimed lamp throws** (`Aim`, lines.ts): caught by a lamp, the bot sweeps the stick over the ways within 100 degrees
  of where it is going and reads `player.lureArc` for each (the arc drawn on screen, for the way held last step:
  fair), gives the beats meanwhile, and gives the last beat holding the best way when the arc held is about as good
  as the best seen (or after ~1 s). `arcScore`: landing on the goal surface beats ending near it; an arc through thorns
  is never taken. A bot sweeps a way a frame, a person every 3 (`Hands.aimPer`). Inside a line the goal is the line's;
  caught with no line, the persona's target. The map has **throw moves**: a gap no jump spans, with a lamp in reach
  of a jump off this end (or up to 320 px under the lip) that throws as far as the other side (`Move.lure`); lines
  `jump into the lamp`, `walk off into the lamp`, `walk off / hop, cut down on the lamp` (the pogo-wick).
- **Hatches**: a one-way's `noDrop` (true, or a flag) is in the map (`Surface.noDrop`); no drop-through until the flag
  is in the save. A drop-through goes to the first thing under her (stacked rungs: the next rung), never through a
  solid.
- **Floors that are not**: thorn beds lying on a top and the bottom of a pit that catches a fall (`scene.catches`)
  are not surfaces (people see the teeth and the dark); a walk-off is never planned onto a solid between (R8's thorn
  bed over the tunnel). The map's body height is the sim's 80 (R10's root ceiling leaves 80: she walks under it).
- **Lamp-guarders** (`fight.ts` tactic `snuff its lamp`): to the flame a creature guards, cut it (up, down or ahead);
  R9's beetle and dangler at one wick go together. The human player uses it for ground creatures (not a flyer's lamp:
  that is often the throw it needs).
- **Planner fixes (builder 1's R8 report)**: a walk-off is refused when any solid fills the fall column; a wall in a
  gap counts from the take-off height; an `up` move needs headroom over its launch spot; a side exit's target
  accepts the surface it was computed on after it grows (the hub floor: bots ping-ponged hollow <-> glidewalk); a fight
  is let be after 10 s (30 s for bots) from the **last** blow either way, not from its start (bots waited on R10's
  escape ledges for minutes); from a ledge over the old burrback a person comes down (`come down`, through a
  one-way); `press and cut` drops through a one-way to a creature below.
- What they found on df4b0c5: R8's throw works but the look-ahead bots take the dark tunnel (cheaper); R10's
  pogo-wick is not required for a glider (the 9728 -> 9088 glide makes it); naive (no look-ahead) still stalls in R8.
- **Region targets table** the harness reads (targets.ts): any markdown table in `docs/design/regions/*.md` with a
  column whose header contains "room" and one with "target", "time", "min", "minutes" or "duration"; optional "lost",
  "deaths", "lamps" columns. The room cell must contain the room id (`wood-hatch`, backticks fine); times `1:30`,
  `90 s`, `2 min`, ranges `1:00-2:00` / `60-90 s`; a room in two rows adds up. Row order is the order `--chunk a..b`
  uses. Example: `| room | target | lost | deaths |` / `| \`wood-hatch\` | 0:40 | 10 s | 0 |`.

## Files
`observe.ts` (what is on screen), `map.ts` (the persona's map: surfaces from solids and the kit's standing pieces —
bark, shut gates and shortcuts — moves incl. cut and climb, faces, Dijkstra), `lines.ts` (the look-ahead: candidate
lines played in a sim copy), `fight.ts` (look-ahead tactics against a creature), `personas.ts`, `recorder.ts`,
`headless.ts` (the `Game` in `GAME_WORLD` + the real follow camera), `live.ts` (in the page: personas, `record()`,
the first-timer's `burst()`), `firsttimer.ts`, `snapshot.ts` (the pinned build), `human.ts` + `feel.ts` + `humanrun.ts` (human-like runs),
`report.ts` (run + region reports), `heatmap.ts` + `png.ts` (own PNG encoder), `targets.ts`, `cli.ts`. `weaver-bot.ts` / `weaver-run.ts` are the boss agent's (memory/bosses.md).
Tests: `tests/unit/playtest.test.ts` (gap lab every persona leaves, determinism, a shaft climbed with wall jump and a
lock without, a line under a thorn branch, a burrback fought or passed, telemetry, targets, PNG).

## How the planners play (explorer, speedrunner, cautious)
They decide from `observe()` — her own state and what is inside the follow camera's view (+32 px); a top is ground
only once its top edge was in view — and remember it per room (`Mind`, `RoomMemory`). The speedrunner knows every
room and the world graph (it has run it before).
- **Targets**: explorer = pickups, lamps, unwalked ground (256 px cells, the surface it stands on first), dangling ends
  (a leap), faces rising out of sight (a climb into the unknown, once it owns wall jump), then exits, a one-way drop
  last. Speedrunner = the exit whose link leads fewest hops to its goal room; an exit it cannot take is blocked and the
  goal moves to the nearest room it has not been in. Cautious = the exits it sees (a one-way last), else forward ground.
  Out of things to do: **turn back** by the exit it has left by least (not the one it came in by unless it is the only
  one). A new ability clears every give-up (the shaft, the far ledge get another go).
- **Moves** (map.ts): walk on (rolling steps <= 16 px; abutting tops at one height, a mesh by the floor), jump across,
  jump up beside a higher end, drop off an end, drop through a one-way, **cut** through standing rotten bark in a gap,
  **climb** a kickable face (it owns wall jump) to a surface above, **bounce** off a cap's top (caps are kit solids in
  the map, tops marked with their held rise; nobody stands on one) to ground or the next cap: a move onto a cap plays
  as one line with the bounces after it (`capChain`). Covered exits: a hole under a **bark floor panel** is taken by
  standing on it and hopping into down cuts (R9's panel into R10); under a shut gate or shortcut, or a **one-way mesh**
  (the hub's grate), it is not a way on (blocked for the route). Frontier also has **caps into the unknown** (a cap it
  can get onto: up the run of caps from there, `capClimbLine`, the hub's B1-B3 to NW). A wall in a gap higher than a jump means no jump. Reach from movement-controller.md "Reach" (glide table
  included) with an 18% margin; the look-ahead has the last word.
- **Lines** (lines.ts): before each move it plays every candidate it knows forward in a copy of the sim and plays the
  best for real: plain jump (3 edges x 3 holds), jump-glide, double jump, standing hop (narrow steps), walk off,
  walk-off glide (jump pressed after the coyote frames), jump-glide off, pogo hop over seed-cases, cut through bark,
  wall climb, and climb + kick-glide across to the opposite face at 5 heights (a broken face), with waits of 0 / 40 / 90
  frames when a creature or a lamp is in view. Score = frames + 600 a hit + 240 a catch: thorns over the hump, a lamp's
  pull and a creature's dive all show, so it picks round them, or through a lamp's catch and throw if nothing else
  works. Dangling ends are leaps chosen the same way (onto any other ground; never through a one-way exit by chance).
  Exits at the top of a shaft are climbed in the **world** (`SimCtx.world`): the look-ahead crosses into the next room
  and climbs on there (R10's climb-out through the hub's grate); kicks can come late (`kickDelay`) so the last one falls
  under the seam. Carried up into a room beside a face, it climbs on. A line that does not go as foreseen counts as a
  miss; two misses drop the move.
- **Fights** (fight.ts): a hostile creature within 420 px (kept until 700): every 20 frames it plays 9 tactics 480
  frames ahead (wait, back off, press and cut, pogo, pogo early, hop over, bait into a wall behind / beyond it — jump
  the ram, cut it stunned — and run past) and plays the best: 900 a hit taken, -250 a hit dealt, -3000 the kill, -500
  a stun, +80 for waiting; the tactic under way keeps a 300 edge (no dithering). 30 s with nothing dealt or taken: it
  leaves the creature be for 10 s. Each fight is a note (tactics used, hits taken, how it ended).
- **Cautious habits**: stops every 2-4 s, looks 0.5-1.25 s at every lip (and longer at a dangling end) then creeps to
  it, jumps 2 px from the end, waits up to 4 s while a creature 300+ px away faces her (closer is a fight).
- **Naive** (personas.ts `Naive`): holds the way on, jumps (14 frames; a full 22 at the same wall again) at walls and
  gap edges, cuts a creature right in front, pogoes seed-cases, cuts bark, walks into holes that are exits, holds jump
  once it owns glide. 8 s without headway: turns round 3 s; walks out of the room while turned round, or turns round
  twice in one room: that way is the way on now.
- **Adding a persona**: a `Persona` (`decide(obs, scene, ctx)`, `notes`, `itinerary`) or a `Planner` config (targets,
  edge, hold, stops, waits, turn back), in `PERSONAS` and `makePersona`.

## Metric definitions (recorder.ts)
- **time per room / area**: frames with `state.room` = the room (visits summed in the region report); area = `region`.
  Targets come from any table in `docs/design/regions/*.md` with a "room" column and a "time / target / min" column
  (`90 s`, `1:30`, `0:20–0:45`), plus "lost", "deaths" and "lamps" columns when present; two rows for one room add up.
- **deaths** = `fade`; **catches** = `fallCatch`; **hits** = `hurt` (per creature or thorn id).
- **progress** = a 128 px cell of the room never stood in, a room first entered, a pickup, a lamp lit or put out, an
  ability, a moth freed. **Lost** = every stretch of `--lost-after` (10 s) or more without progress, counted in full.
  The run gives up after `--give-up` (120 s) without progress (`lost`).
- **backtracking** = frames moving (> 30 px/s) through a cell she had already left once.
- **lamps**: `scene.lures` (and the grove's lanterns / lamps); seen = its point in the view; put out = `lureSnuff`.
  **moths** = `lureSnuff.moths`. **caught by lures** = `lureCaught` per lure. **abilities** = new ids in the save.
- **encounters**: per creature, from its first act about her to its last; hits it gave; killed / dispersed / passed.
- **outcome**: `exit` (`--until exit`), `through` (out of `--upto`), `done` (nothing left it wants), `lost`, `timeout`.

## Region run chunk 1 (R1-R10 + R14), 2026-10-18 (HEAD 0d46c2e, the rooms of 489b31f / fe620a4)
| persona | ended | time | deaths | hits | rooms | abilities |
|---|---|---|---|---|---|---|
| naive | lost in R10 (the old burrback: 7 fades, 13 hits; it "can't do bosses", wood.md §9) | 7:27 | 7 | 17 | 10 of 11 | glide 0:37 |
| explorer | through | 5:19 | 0 | 6 | 11 of 11 | glide 1:14, wall jump 4:41 |
| speedrunner | through | 2:12 | 0 | 2 | 11 of 11 | glide 0:43, wall jump 1:54 |
| cautious | through | 6:55 | 0 | 5 | 11 of 11 | glide 1:46, wall jump 6:39 |
Old burrback: explorer 2 hits, speedrunner 0, cautious 1, all killed. Explorer frees 65 moths. Bot times are 3-15x under
the first-timer targets: judge times with the first-timer agent and Matt.
Finding for the level agent: **the hub's root mesh over R10's climb-out is a way into R10 from above**: standing on it,
down + jump drops her through it and down the climb-out to glade 2 (wall jump) with the pit and the old burrback skipped
(reproduced in the sim). The bots treat a mesh over an exit as not the way on, so their numbers do not use it.
What the bots learned this round: the bark floor panel, the mesh as a floor, bounce caps (chains and climbs into the
unknown, from beside a cap, not under it), the way on from the side she came in by (`wayOn`), a stuck speedrunner
explores the room (the fight that opens the gate), a leap never leaves the room, a cautious bot leaps where it lands
farthest on and takes a way up it sees as a way through, landings count only with the feet over the surface (abutting
tops), targets on points (surfaces grow as more is seen), reach margin 0.95 (the look-ahead decides), standing to think
instead of wandering when a target has no route, the naive bot cuts a bark floor when stuck on it and jumps an edge it
fell from walking off.

## Known limits
- Look-ahead lines and fights step a copy of the whole sim: a creature's timers and the room past the view are known
  to it. They stand for a player's judgement of what they can see; only moves between surfaces the persona knows (and
  leaps / climbs into the unknown, which only keep her off thorns) use them.
- No dash lines yet, no double-jump planning beyond the apex press, no offer (V). Fights are one creature at a time.
- The naive bot has no look-ahead: it shows what holding the way on does, including where it cannot go back.
- Live runs: the tape is buttons per animation frame (a replay is close, not exact); a slow page decides less often.
- The view is the follow camera at the 16:9 safe size; camera zones and beats are not in it.
- Other agents' half-written sim / room files break tsx and vitest runs; a HEAD snapshot works (`git archive HEAD | tar
  -x -C <scratch>/snap`, symlink node_modules, copy your files over). The first-timer server and `--live` need the dev
  server; an HMR reload mid-session kills the page's context (tools/lib/browser.ts serves the page without HMR).
