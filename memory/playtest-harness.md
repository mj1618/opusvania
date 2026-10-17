# Playtest harness: persona bots, telemetry, region runs, the first-timer agent (tools/playtest/)

STUDIO.md "Playtesting without Matt". Reports go to `playtest-reports/` (gitignored).

## Run it
- `npm run playtest -- --region wood --upto wood-well` = **the region run**: every persona, headless, from the world's
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
(one per turn; a background server holds the browser; needs `npm run dev`):
`start [--room wood-hatch] [--name s1] [--abilities glide]` (prints the session dir and a first screenshot),
`act "R60 R+J20 .30" [--every 2]` (real keys in real time; prints what happened in a player's words — hits, deaths,
falls, rooms, abilities, catches — where she is, and the screenshots: every 2 s and at those moments),
`look`, `status`, `note "text" [--mood lost|stuck|unfair|fun|ok]`, `stop` (report.md + heatmaps + trace from the
whole session, and `journal.md`: every act and note with its screenshot). Keys: R L U D, J jump, X dash, A cut, O
offer, `.` nothing; a number is frames (60 = 1 s); `+` holds two. **Brief to paste to the sub-agent:**
> You are playing Lampfall for the first time. Know nothing about it beyond what you see. Run `npm run firsttimer --
> start --name <you>` from the repo root, then loop: Read the newest screenshot, decide, `act` a short burst (0.5-4 s),
> Read what happened and the screenshots. Every minute or at any moment that matters, `note` what you think, in the
> first person and plainly: what you think you should do ("I think the moths want me to follow them"), when you are
> lost ("I'm lost: I've walked this branch three times", `--mood lost`), stuck, a hit that felt unfair and why
> (`--mood unfair`), what you enjoyed (`--mood fun`), what you did not understand. Don't read the code, the room files
> or the design docs. Play until you reach <goal> or 20 minutes of game time, then `stop` and reply with the journal's
> path and your five strongest impressions.

## Files
`observe.ts` (what is on screen), `map.ts` (the persona's map: surfaces from solids and the kit's standing pieces —
bark, shut gates and shortcuts — moves incl. cut and climb, faces, Dijkstra), `lines.ts` (the look-ahead: candidate
lines played in a sim copy), `fight.ts` (look-ahead tactics against a creature), `personas.ts`, `recorder.ts`,
`headless.ts` (the `Game` in `GAME_WORLD` + the real follow camera), `live.ts` (in the page: personas, `record()`,
the first-timer's `burst()`), `firsttimer.ts`, `report.ts` (run + region reports), `heatmap.ts` + `png.ts` (own PNG
encoder), `targets.ts`, `cli.ts`. `weaver-bot.ts` / `weaver-run.ts` are the boss agent's (memory/bosses.md).
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
- **Moves** (map.ts): walk on (rolling steps <= 16 px), jump across, jump up beside a higher end, drop off an end, drop
  through a one-way, **cut** through standing rotten bark in a gap, **climb** a kickable face (it owns wall jump) to a
  surface above. A wall in a gap higher than a jump means no jump. Reach from movement-controller.md "Reach" (glide table
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

## Region run R1-R10, 2026-10-18 (HEAD a1e0d56 + the working copy)
| persona | ended | time | deaths | hits | lost | abilities |
|---|---|---|---|---|---|---|
| naive | lost in R9 (bounces R8 <-> R9) | 3:26 | 0 | 2 | 2:00 | glide 0:38 |
| explorer | through R10 | 4:21 | 0 | 3 | 1:28 | glide 1:17, wall jump 3:59 |
| speedrunner | through R10 | 1:46 | 0 | 2 | 0:10 | glide 0:44, wall jump 1:42 |
| cautious | through R10 | 4:10 | 1 | 6 | 0:31 | glide 1:48, wall jump 3:58 |
Findings for the level agent (each reproduced in the sim, not just the bots):
- **R9 wood-lantern's west door is shut by the DJ ledge's stalk** (trunk 288-352, y 672-1280, `kick: false`): from the
  `w` door at x 0 nothing gets past x 268 (jumps top out under the ledge). The room's `spawn` (300, 1280) sits inside
  the stalk. Every bot coming from R8 turns back after 1 s; the naive one ping-pongs R8 / R9 until it gives up.
- **R10's root gate can be skipped**: the speedrunner and the cautious bot pogo off the old burrback's braced shell
  onto the gate's top (y 1088, x 2048-2112) and walk into glade 2 for wall jump with the old burrback alive. Only the
  explorer killed it (bait into the gate, cut it stunned, pogo; 1 hit).
- **R8's root shelf going west**: wick-bark (2660, 1216) pulls a jump pressed against the root post (x 2784) down: it
  tops out at y 1110, 22 px short of the shelf. The naive bot is stuck there going back west, so it never reaches the
  hub's well. A jump from a few steps back clears it.
- Bot times are 3-15x under the first-timer targets (e.g. R6 0:12-0:42 vs 3:00-4:30): judge times with the first-timer
  agent and Matt.

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
