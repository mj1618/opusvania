# Chunk 1, human-like bots, round 1

2026-10-18. Build **b5c50f2** (pinned clean snapshot of HEAD: "Lamps read in grey ..."). The chunk is R1-R10 + R14
(`wood-hatch` to `wood-well`, plus `wood-caps`). Each run starts at the world's start and ends `through` (it has been in
every chunk room and has left the well by the climb-out), `lost` (180 s without progress), or after 40 min.
The command was `npm run humanplay -- run`. How these bots play: memory/playtest-harness.md, "Human-like runs".

**Files** are gitignored and live in `playtest-reports/humanlike-2026-10-17T16-49-07/`:
- `summary.md` / `summary.json` for the whole matrix.
- Each run has its own folder (`casual-s1/` ... `skilled-s3/`) holding `video.mp4` (the whole run at 2x),
  `contact-<room>-NN.jpg` (one picture a second, 36 to a sheet), `moments/` (deaths, hits, catches, lost stretches,
  first entries, finds), `report.md` (feel metrics and a timeline in 10 s rows), `trace.json` and `tape.txt`.
- To watch a stretch: game time T s is video time T/2. For example,
  `ffmpeg -ss <T/2> -i video.mp4 -t 5 -vf fps=6,scale=480:-1,tile=6x5 sheet.jpg`.

**How to read these numbers.** The bots have a person's hands and eyes: reaction times, timing and hold errors, the
screen seen a few frames late, and no look-ahead. They do not read the screen, admire the view, or take time to
think. Their times are lower bounds for a first-timer; the design estimates ~26 min to the climb-out. Their failures
are of two kinds:
- **Hands**: the room asks for timing that a person with that skill's error misses.
- **Head**: the bot's planner ran out of ideas where a person might not. I mark this where I could tell. Several
  "stood still" and "stuck" numbers are head, not game.

## Numbers per skill (3 seeds each)

| run | ended | time | rooms | deaths | hits | catches | flow / still | deaths / 10 min | retry loops | longest repeat | presses/s | new every |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual s1 | lost in R10 | 17:00 | 10/11 | 6 | 29 | 15 | 61% / 38% | 3.5 | 7 | 113 s | 4.0 | 1.0 s |
| casual s2 | lost in R7 (after R10) | 15:54 | 10/11 | 2 | 21 | 5 | 48% / 50% | 1.3 | 0 | 29 s | 5.4 | 0.8 s |
| casual s3 | lost in R10 | 15:58 | 11/11 | 6 | 29 | 17 | 63% / 35% | 3.8 | 7 | 116 s | 4.9 | 0.8 s |
| average s1 | lost in R10 | 18:22 | 11/11 | 5 | 26 | 14 | 59% / 39% | 2.7 | 6 | 128 s | 6.5 | 0.9 s |
| average s2 | lost in R6 | 8:47 | 6/11 | 1 | 9 | 6 | 41% / 58% | 1.1 | 3 | 27 s | 4.0 | 0.9 s |
| average s3 | **through** | 16:58 | 11/11 | 4 | 22 | 8 | 58% / 41% | 2.4 | 4 | 89 s | 7.3 | 0.8 s |
| skilled s1 | lost in R10 | 14:34 | 11/11 | 5 | 27 | 6 | 61% / 37% | 3.4 | 2 | 135 s | 6.8 | 0.8 s |
| skilled s2 | lost in R9 | 15:33 | 10/11 | 2 | 16 | 4 | 38% / 61% | 1.3 | 2 | 35 s | 7.2 | 0.9 s |
| skilled s3 | **through** | 13:32 | 11/11 | 2 | 16 | 4 | 48% / 51% | 1.5 | 2 | 13 s | 8.9 | 0.7 s |

| skill | through | mean time | rooms | deaths | hits | catches | flow | deaths / 10 min | retry loops | longest repeat |
|---|---|---|---|---|---|---|---|---|---|---|
| casual | 0 / 3 | 16:17 | 10.3 | 4.7 | 26.3 | 12.3 | 57% | 2.9 | 4.7 | 86 s |
| average | 1 / 3 | 14:42 | 9.3 | 3.3 | 19.0 | 9.3 | 53% | 2.1 | 4.3 | 81 s |
| skilled | 1 / 3 | 14:33 | 10.7 | 3.0 | 19.7 | 4.7 | 49% | 2.1 | 2.0 | 61 s |

**First input after spawn**: 3.1-4.3 s. The cocoon listens from 2.5 s, and the bot then waits its skill's 0.4-1.5 s.
The seed-1 runs show 1.4 s; that is a stray press during the fade-up, not a decision. **Control from**: 3.2-4.4 s.

For comparison, the look-ahead bots on the same build (`npm run playtest`, region run) give: speedrunner through
in 2:14, explorer 11/11 rooms in 5:00, cautious 8/11, naive 10/11 with 3 deaths in the well.

## Where the time and the pain went

Seconds in each room, all visits summed. R6's design budget is ~4:00 (6:00-10:00 in wood.md); R10 from the pit to
the climb-out is ~2:30.

| run | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R14 | R8 | R9 | R10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| casual s1 | 30 | 23 | 77 | 46 | 17 | **252** | 9 | - | 75 | 55 | **437** |
| casual s2 | 26 | 23 | 44 | 68 | 18 | 222 | **331** | - | 101 | 55 | 67 |
| casual s3 | 23 | 23 | 43 | 36 | 16 | 177 | 56 | 78 | 62 | 62 | **383** |
| average s1 | 19 | 21 | 74 | 50 | 28 | **251** | 90 | 128 | 51 | 101 | **288** |
| average s2 | 22 | 22 | 44 | 53 | 12 | **374** | - | - | - | - | - |
| average s3 | 19 | 21 | 78 | 51 | 37 | **359** | 97 | 132 | 99 | 57 | 68 |
| skilled s1 | 18 | 20 | 43 | 49 | 11 | 145 | 61 | 95 | 88 | 65 | **278** |
| skilled s2 | 18 | 21 | 75 | 63 | 11 | 129 | 92 | 179 | 115 | **231** | - |
| skilled s3 | 18 | 20 | 75 | 50 | 11 | 148 | 84 | 173 | 114 | 66 | 53 |

### 1. R6 glidewalk is where the chunk hurts. Every run, every skill (hands, and some head)

- **All 9 runs died there**: 22 of the 33 deaths were in R6 (the other 11 were in the R10 pit), from `thorns-2`, `thorns-3` and the ledge beetle
  (`burr-ledge`). Thorn hits in R6 ran 5-13 per run (casual 12-13, skilled 8).
- The longest lost stretches are here: average s2 gave up in R6 after 6 min, and casual s1 / average s1 / average s3
  each lost 30-112 s in it.
- Over the thorn floor, the bots failed most at the glide lines: walk-off glides and jump-glides that "landed
  elsewhere", or that ended "held" (caught by a wick mid-line). That part is hands.
- **Part of the R6 time is head**: at x ~280, y 512, above the west door, the bots tried a "jump up" to a ledge they
  cannot reach (casual s1 22 times, average s3 57 times). A person would give up on that sooner.
- The skilled bots took 2:09-2:28 here, inside budget. Casual and average took 2:57-6:14 and died 1-4 times.
- The moments show thorn hits at the foot of a wall: she slides down a face into the thorn floor, e.g.
  `casual-s1/moments/04-04-hit-thorns.jpg`.
- **Ask**: the gaps here forgive less than a person's ±67-100 ms of timing. Look at `contact-wood-glidewalk-*.jpg` for
  casual s1 and average s3, then consider either
  - a wider landing, or
  - thorns that start further from the faces she slides down.

### 2. The old burrback's ram: the early jump is the wrong one (hands; measured)

- **3 of the 7 runs that reached the pit killed it**: casual s2, average s3 and skilled s3, taking 2-3 hits. The
  other 4 took 8-11 hits, faded 2-3 times each, and ran out of the 180 s.
- **Lab, sim stepped directly on b5c50f2**: from standing 270 px in front of it, a jump clears the ram **only if it
  starts 14-40 frames after the tell begins**. The tell is 28 frames. A jump in the tell's first half (frames 0-12)
  lands in the ram. The tuning comment ("a jump anywhere in the tell clears it") does not hold.
- A person who reacts to the tell (200-300 ms, which is 12-18 frames) jumps right at the window's opening edge, so
  **the quicker player is punished**. That is what the human bots did until they waited for the ram instead.
- **Ask**: either make the early half of the tell safe (a longer hang, or a ram that starts later), or make the tell
  read as "wait for it". The jump window after the ram starts is 12 frames, which is fine.

### 3. Falls a person makes where the bots with look-ahead never do (hands)

- **R5 glade, the chasm**: 3-7 catches in every run. This is where she gets wings and learns them by falling. It is
  cheap, but it is the most repeated catch in the chunk.
- **R1 hatch, `below`**: casual s1 fell 6 times in the first 20 s at the gap by the big trunk
  (`casual-s1/moments/00-13-caught-below.jpg`). casual s3 and average s2 fell 2 times each.
- This matches the casual first-timer agent (chunk1-firsttimer-casual-r2), who fell 11 times in 30 s here. The trunk
  in front of the gap reads as a wall, and the jump only makes it from the very tip.
- **R2 chase, `below-2`**: every run is caught once at the same place, skilled included. Check whether this drop is
  meant.

### 4. The hub and R14 cost the most thinking (head, mostly)

- Skilled spent 95-179 s in R14 caps and 88-115 s in R8. Casual s2 climbed out of the well into R7 and then stood
  out of ideas for 3 min. It never found R14's way up from the hollow; the look-ahead explorer does find it.
- Skilled s2 lost 3:51 in R9. It gave up on the lantern-hall light ("no route on what it has seen"), and the room's
  burrback walked a beat it could not reach. The panel exit is shown on screen by its rotten bark (the R6 lesson),
  but it never went to it in time.
- These rooms ask a first-timer to find a way, and the bot's map is worse than a person's eyes. The first-timer
  agents should judge them.

### 5. Feel numbers worth tracking from here

- **Flow** was 38-63% moving or in the air; **stood still** was 35-61%.
  - The bots stand to "think" when a line has failed.
  - The rooms with the most `stuck` 10 s rows were R6 and R10 for casual, and R14 and R8 for skilled.
- **Something new** came every 0.7-1.0 s on average, but in clusters: the timeline shows 2-3 min of R6 or R10 with
  nothing new.
- **Fail-retry loops** (a fall or death within 20 s and 300 px of the last) were 0-7 for casual and 2 for skilled. They
  are all in R6, R5's chasm and R10's chute.
- **Presses a second**: casual 4-5, skilled 7-9.

## What the bots cannot tell you yet

- Whether anything was beautiful, readable or fun. The videos are for that: watch casual s1 and skilled s3 side by
  side, both at 2x.
- Dash, double jump and the offer (V) are never used. No LLM-intent mode yet: a person's judgement comes from the
  first-timer agents.
- The region doc's §9 table no longer parses as room targets (`--chunk a..b` of the region run fails on b5c50f2; pass
  the room ids instead). I will fix this in the harness next round.

## Changes to the harness this round

- `tools/playtest/human.ts`, `feel.ts`, `humanrun.ts` (`npm run humanplay`).
- Human mode in `personas.ts`, `lines.ts`, `fight.ts` and `headless.ts`.
- The first-timer fixes: `{R}` and reload no longer duplicate events or screenshots; the session's build is pinned and
  named in the journal.

## Addendum: the rebuilt area 1 (df4b0c5), headless, with the new bot skills

During this round, area 1 was rebuilt (df4b0c5: R14 and R11 were cut; R9 is now `wood-silk`). The persona bots
stalled in R8. They now have these skills:
- aimed lamp throws (they read the drawn arc);
- hatches (`noDrop` flags);
- the pogo-wick down cut;
- snuffing a guarded lamp.

They also no longer take thorn beds or the bottom of a catching pit as floor. These runs are headless only, so
there are no videos (render them with `npm run humanplay -- run` once this is committed).

- **Region run** (look-ahead bots): explorer through in 5:03, speedrunner 2:23, cautious 5:25. All three were lost
  in or before R8 before these skills. Naive, which has no look-ahead, still stalls in R8.
- **Human-like** (HEAD + this harness, seeds 1-3):

| skill | through | mean time | deaths / 10 min | where it hurt |
|---|---|---|---|---|
| casual | 1/3 | 17:40 | 3.4 | R8 thorn bed under the throw gap: 1-5 deaths a run, 129-515 s in R8; one run never left the hub |
| average | 2/3 | 15:02 | 3.2 | R8 (1-6 deaths), R3 wicks up to 5:03, R10 old burrback 3 deaths in one run |
| skilled | 1/3 (+1 out of ideas in R10 after 9 deaths to the old burrback) | 14:46 | 3.5 | R8 (1-6 deaths), R9 silk 2:07-4:21 |

- **R8 is the new R6.** All 9 human-like runs died on `thorns-gap`. The throw works when it is aimed (in the lab,
  all six aims at the far ledge landed), but a person's throw is also hit out of the lamp by hawker B diving at the
  orbit. A blow frees her mid-orbit, and the fall lands in the thorns.
- The look-ahead bots never needed the throw: they take the dark tunnel under it (its rungs, then the rungs up at
  x 3600), which is the cheaper route for them.
- **The pogo-wick is not required for a glider**: the 9728 -> 9088 ledge glide makes it without the wick. No bot,
  look-ahead or human-like, snuffed it.
