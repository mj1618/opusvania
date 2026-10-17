# Area 1, human-like video review, round 1

2026-10-18. An independent review of the rebuilt area 1 (`wood-hatch` to the crown of `wood-heart`), judged from
human-like playthroughs watched as video. I didn't build any of it. The bar is Hollow Knight, Ori, Nine Sols and
Celeste with the art removed. Everything except art is in scope. "Good for greybox" is a fail.

**Build.** b42de7f (pinned clean snapshot; HEAD has since moved to 3529da4, whose bark-floor and juvenile-readability
changes land after these runs).

**Command.**
`npm run humanplay -- run --chunk wood-hatch,wood-chase,wood-wicks,wood-burrow,wood-glade,wood-glidewalk,wood-hollow,wood-hawkers,wood-silk,wood-well,wood-heart --upto wood-heart`
The default chunk stops at `wood-well`, so I passed the area-1 route through R7b explicitly. `through` means she left
the crown by its `e` exit. All nine replays matched the headless state hash.

**Files.** All under `playtest-reports/humanlike-2026-10-17T17-46-25/` (gitignored). Each run has `video.mp4`,
`contact-*.jpg`, `moments/`, `report.md` and `trace.json`.

**What I watched.**
- Every run's contact sheets for the rooms that mattered.
- The moments around every death and every lost stretch.
- Video cuts, at 2–4 pictures per game second, of these set pieces:
  - the vista and title;
  - R3's first catch;
  - the glade lip;
  - R6's gaps;
  - the hub and its glimpse;
  - R8's throw gap and tunnel;
  - the root stair and window;
  - the old burrback (casual s1, average s3, casual s2);
  - the hub→trunk seam;
  - W-ff and the thorn band;
  - the crown, at full resolution.

My stills and cuts are in this session's scratchpad (`video-review-r1/`) and aren't committed.

**How to read the bots.** They have a person's hands, eyes and reactions. They are an explorer at heart: they go for
every lamp and every patch of unwalked ground before the exit. They don't admire views, read the moth-stone or think.
Long "stood still" stretches are often their planner running out of ideas, which is **head**, not the game. I mark
where I could tell. Their times are a floor for a first-timer. Their failures where a person would also fail, in the
pit, on the thorn band and in the R1/glade catch loops, are **hands**, and those count in full.

---

## Verdict

The rebuild fixed the part of "random" that came from *content*. There are fewer kinds of thing now, the lamp is on
the critical path (10–20 snuffs a run against 1–2 before), and the predators each have a place. On video, though, it
still plays **disjointed**, because the experience the director designed is mostly not on screen:
- **The oak, the chunk's whole question, can't be seen.** It isn't in the vista. The hub's glimpse flies above the
  top of the hub, where the camera can't follow, so it shows two grey pillars for 2.5 s. Players are through the hub
  ~9.5 s after entering, in every run.
- **Time pools in the wrong places.** R8's throw gap is a 5-minute wall where the hawker never bites. The designed
  descent into the dark (the root stair) takes 15–20 s. The pit is a 10-second death loop for casual players.
- **The climb up the oak is broken up.** Black room-change fades flash at the hub/trunk seam, and long falls undo
  progress.

There is real fun in it. R6's glide-throw-snuff run is the best 90 s in the build, and R9's dangler-then-composition
reads cleanly. But the arc the player lives through is "a nice first 6 minutes → a wall in a clearing → a quick slide
into a beetle box → a fiddly climb → walk off". It is not "wonder → smallness → wings → competence → the dark → claws
→ release". The most important fixes are staging and camera (show the oak, ask the question) and pacing (R8 and the
root stair), not new content.

---

## 1. The numbers

| run | ended | time | deaths | hits | catches | snuffs | glide | hub (1st) | claws | flow / still |
|---|---|---|---|---|---|---|---|---|---|---|
| casual s1 | done in the pit (gave up after 9 fades) | 18:57 | 11 | 52 | 16 | 14 | 6:21 | 7:40 | – | 36% / 63% |
| casual s2 | **through** | 19:02 | 3 | 24 | 26 | 16 | 3:52 | 5:33 | 14:15 | 48% / 50% |
| casual s3 | lost in R8 / the hub | 20:21 | 0 | 7 | 11 | 10 | 5:04 | 8:10 | – | 38% / 59% |
| average s1 | **through** | 25:14 | 3 | 26 | 40 | 16 | 7:33 | 9:48 | 19:36 | 41% / 57% |
| average s2 | **through** | 18:10 | 1 | 20 | 22 | 18 | 4:40 | 6:36 | 15:23 | 43% / 55% |
| average s3 | done in the pit (gave up after 8 fades) | 17:12 | 9 | 42 | 17 | 14 | 4:12 | 7:30 | – | 38% / 60% |
| skilled s1 | lost in R8, *after* the trunk | 25:27 | 2 | 20 | 24 | 20 | 4:05 | 5:56 | 18:18 | 39% / 60% |
| skilled s2 | **through** | 19:19 | 3 | 24 | 28 | 17 | 3:39 | 5:16 | 14:30 | 49% / 50% |
| skilled s3 | **through** | 22:20 | 3 | 21 | 35 | 17 | 4:40 | 6:52 | 17:04 | 47% / 52% |

Five of nine runs went through. The four that didn't stopped at three places:
- **The pit** (casual s1, average s3): 8–9 fades each, 32–36 hits from the old burrback.
- **R8** (casual s3): it never found a way past the throw gap and finally tried the hub's trunk without claws.
- **R8 again** (skilled s1): a fade near the crown re-formed her at R8's P-dark, the last patch she had rested at,
  and she never found her way back up.

### Seconds per room against the A9 table

All visits are summed. The medians are over the runs that reached the room.

| room | A9 target | bots: median (range) | read |
|---|---|---|---|
| `wood-hatch` | 0:30–0:55 | 0:19 (0:17–0:30) | fine, but see the catch loop |
| `wood-chase` | 0:45–1:20 | 0:23 (0:22–0:25) | a corridor at bot speed; the vista hold is short |
| `wood-wicks` | 1:00–1:45 | **1:56** (0:44–**5:02**) | over: stuck at the dip's step under W2 (part head) |
| `wood-burrow` | 1:30–2:40 | 1:47 (1:08–**4:42**) | in range; 20–30 s standing beside the bark floor |
| `wood-glade` | 0:45–1:20 | 0:36 (0:22–0:58) | short; catch loops at the lip |
| `wood-glidewalk` | 3:00–5:00 | **1:20** (0:57–2:29) | **far under**: the best room is over in 80 s |
| `wood-hollow` | 1:30–2:40 | **0:26** (first visit ~9.5 s in all 9 runs) | **far under**: the question isn't asked |
| `wood-hawkers` | 3:00–5:00 | **5:08** (3:18–**11:44**) | the longest room in 8 of 9 runs; a wall |
| `wood-silk` | 3:20–5:50 | 2:59 (2:37–3:45) | slightly under; most of it is head |
| `wood-well` | 5:00–9:00 | **1:23** (1:01–3:00) | **far under**: act 3 is a minute long |
| `wood-heart` | 4:00–7:00 | 4:02 (2:11–4:54) | in range, but made of falls and re-climbs |

**Area totals.** Through runs took **18:10–25:14** against the 28–34 min target. Wall jump came at **14:15–19:36**
against 25–28.

The bots skip reading, views and most finds, and they plan worse than people in places. Even so, the *shape* is
wrong, and the shape doesn't depend on bot speed:
- R6, the hub and the well are 2–4× under the bottom of their ranges.
- R8 is at or over its budget.
- R8 takes longer than R6, the hub, the glade and the well together.

---

## 2. Experience timelines

Each timeline is a reference run with notes from its siblings. "Wants" and "feels" are what a player in that seat
would want and feel, read from the video and the bot's own goals.

### Casual (reference casual s2, through at 19:02; casual s1 and s3 for where it breaks)

| min | doing | wants / feels | flow |
|---|---|---|---|
| 0:00–0:25 | Hatch, the swarm, the branch run. s1 misses the trunk gap and is caught **6 times in 11 s**; s3 twice | Wonder, then "why do I keep falling here?" | Sings, then a stutter |
| 0:25–0:49 | The fallen-trunk run; LAMPFALL over the moon; the swarm arcs down to the valley's lights, stragglers peel off | "Follow them." Clear and good | **Sings** |
| 0:49–2:14 | Drops into R3 straight into W1's grip (a catch she didn't choose), cuts free onto M, walks off into the dark dip, then stands at the dip's far step under W2 for ~70 s | "What do I do with this lamp above me?" Stuck and quiet | Breaks (part head) |
| 2:14–3:51 | R4. Snuffs wick-door, the adult beetle hits her within 3 s (s1 and s3: the juvenile hits 1.4 s after the door, under wick-door's pull). Snuff W3. Back west for the pocket wick. Then ~30 s standing beside the bark floor before cutting it | Hurt with no read, then "is this hatched block the way?" | Breaks twice |
| 3:51–4:27 | The glade: glide. Waits 16 s at the lip, then a catch at the chasm | "I can fly!", then nervous | OK |
| 4:27–5:33 | R6: glide gaps, a catch at W5, the landing wick snuffed, a long walk east | Joy. The best stretch | **Sings** |
| 5:33–5:43 | The hub: P3, the stone, a camera beat on two grey pillars, Tatter standing on a grate; out the east arch in 10 s | Nothing to want | Flat |
| 5:43–10:17 | R8: 25 s waiting at the first hummock for the hawker. Then 4 min at the throw gap: jumps into the lamp land in the pit, she hops out, stands; one hawker hit; finally a throw lands or the tunnel takes her east | Confused, then bored. "Where does this go?" | **The wall** |
| 10:17–12:54 | R9: dangler hit at the first cut spot, two snuffs in 3 s (nice), then the composition, then long wandering in the dip (head), then the bark panel | Brief competence, then idle | Mixed |
| 12:54–13:13 | Root stair: two pocket wicks snuffed in passing; the window is a ~2 s camera dip to an orange dome in a box | Over before it registers | Too fast |
| 13:13–14:12 | The old burrback: killed in 60 s with 10 hits and 2 fades. **s1 and average s3 die 8–9 times in 10–15 s tries and give up** | Tense; for s1, hopeless | Peak, or quit point |
| 14:12–14:57 | Claws, P4, the climb-out | Relief | OK |
| 14:57–19:02 | The trunk: in and out of the hub through the seam (black flashes), thorn-band hits, a fade, the root curtain, the crown wick, walks out east | Fiddly; "am I making progress?" | Choppy |

**Quit points.** 0:15 (R1 trunk gap, s1), 2:14–3:51 (R4 bark floor; the first-timer r3 quit here), 5:43–10:17 (R8;
s3 never got out), 13:13 (the pit; s1 quit).

### Average (reference average s2, through at 18:10; average s1 for the slow version)

| min | doing | wants / feels | flow |
|---|---|---|---|
| 0:00–0:44 | R1 (2 catches at the trunk gap), the chase, the vista | Wonder | Sings |
| 0:44–2:50 | R3: W1 from the drop-in, the dip, then 2 min of trying to reach W2 (s1: **5 min**, two lost stretches of 94 s and 166 s) | "There's a lamp right there and I can't get to it" | Breaks (mostly head; the tease is real) |
| 2:50–4:39 | R4: juvenile hit at the door, adult hits ×3 (it lands on her after the jumped ram), gap throw, bark floor | Busy, a little unfair | OK |
| 4:39–5:16 | Glide, a catch at the chasm | Good | OK |
| 5:16–6:36 | R6: glides, caught by the bend wick and thrown, snuffs W6 on the pass, lands on T4 by the beetle, is hit twice, falls back into gap 3's thorns: **fade** | Joy, then "I already won that bit" | Sings, one sour note |
| 6:36–6:46 | The hub, in and out | – | Flat |
| 6:46–11:50 | R8: lost 73 s, then 55 s at the gap; one hawker hit in 5 min | Bored, unsure | **The wall** |
| 11:50–14:33 | R9: s1 and s2 snuffed in 3 s; the composition's beetle hits twice; lost 48 s in the dip | Competence, then idle | Mixed |
| 14:33–14:55 | Root stair | – | Too fast |
| 14:55–15:17 | The pit: killed in 22 s, 3 hits | "That's it?" | Peak, but short |
| 15:17–18:10 | Claws, the trunk: thorn band ×2, W-ff grabs her twice (never snuffed), hawker strike at the crown wick, which she snuffs, **then falls from the rim back down the shaft** and re-climbs; root curtain, P5, out | Annoyed at the fall; a thin finale | Choppy |

### Skilled (reference skilled s2, through at 19:19; skilled s1 for the worst case)

| min | doing | wants / feels | flow |
|---|---|---|---|
| 0:00–0:41 | R1 and R2 clean | Wonder | Sings |
| 0:41–2:09 | R3: 45 s on W2 from the dip, then out | Impatient | Breaks (head) |
| 2:09–3:38 | R4: juvenile hit at the door, adult killed, bark floor | Fine | OK |
| 3:38–5:16 | Glade, R6 in 63 s | Flying, fast | **Sings** |
| 5:16–5:25 | Hub | – | Flat |
| 5:25–10:34 | R8: **5 min**, a 164 s lost stretch at the gap. "jump into the lamp" lands in the pit 6 times before a throw reaches the far ledge at 10:19 | "Is this even the way?" | **The wall** |
| 10:34–13:34 | R9: kills dang-s1; the composition. 67 s lost on the shelf (head) | OK | Mixed |
| 13:34–13:50 | Root stair | – | Too fast |
| 13:50–14:25 | The pit: 35 s, 5 hits, 1 fade | A fair exam | **Good** |
| 14:30–19:19 | The trunk: 12 hub/heart crossings, thorn band ×8 hits, 2 fades on the band, the knot, the crown | Fiddly. The climb never builds into a rush | Choppy |

**Skilled s1** shows the worst case. It snuffed W-ff, the only run of nine that did. Then the crown hawker faded it at
22:10, it re-formed at **R8's P-dark** (its last rested patch), and it spent its last 3:17 lost in R8. A death at the
top of the area sent a skilled player back two rooms and down the oak.

---

## 3. The set pieces, as watched

- **Vista and title (0:30–0:45). Works.** The run, the title over the moon, the swarm's arc down to the valley's
  lights, the stragglers' "v"s. But **there is no oak**. `stage.oak` for R2 is at x 24576, outside the room, and the
  greybox staging doesn't draw an oak outside the room. The director's set-up #1 ("the crown ring seen from the
  vista") doesn't happen.
- **First catch and throw (R3).** The first catch comes *from the drop into R3* in 9 of 9 runs:
  - she falls into W1's field from the room above;
  - W1 is cut out 1.0–1.6 s after entering;
  - she is on M by 1.6 s (8 of 9);
  - she has walked off M's east end into the dark dip by 2.9–4.1 s (9 of 9).

  The designed beat, "jump at W1 from L, get caught, be thrown onto M", does happen, but in the first 1.5 s of the
  room, unchosen, before the player has seen the room. What a player meets is "fell into a lamp, then a hole".
- **Glide (the glade).** The bask and the text land. Then the lip is a catch loop: 3–4 catches in 6 s (casual s1),
  **16 catches in 22 s** (average s3). Each catch is a black flash and a return to a spot from which the next walk-off
  fails again. It's cheap per try, but it reads as broken.
- **The hub and the glimpse.** The glimpse fires: the camera frames the trunk for ~2.5 s. On screen it is two grey
  pillars ~860 px tall, a green exit line across their top, and a few moth specks. The firefly's path (y −356 to
  −1616) is above the hub's top, and the camera clamps to the room, so **the light is never seen**. Nothing says
  "up". Tatter stands on the mesh and doesn't look up at her. Every run is out of the east arch ~9.5 s after entering, glimpse included.
- **R8's throw gap.** From the near ledge the far ledge (x 3008, 320 up) is at or past the right edge of the frame
  (`casual-s2/frames/wood-hawkers/06-44.jpg`), so the landing isn't on screen when she commits. A short throw lands
  in a walled pit 448 wide whose only exit is a hop back. Hawker B hovers over the wick and never strikes the caught
  moth: hawk-throw dealt **0 hits in 9 runs**. The tunnel (the dark line) is a drop-through hatch beside the gap;
  5 of 9 runs got into it, most of them after failing the throw.
- **R9 the silk hall. Best-read room after R6.** The dangler's thread, the drop, the cut, two snuffs in 3 s. At the
  composition every run went for W-s3, the flame. A good sign (Q5).
- **The root stair and the window.** Two pocket wicks snuffed while dropping through, in ~15–20 s.
  - **The pogo-wick was snuffed in 0 of 9 runs**: the glide line skips it, which was known on df4b0c5 and is still
    true.
  - dang-pocket and dang-chute **never engaged anyone**.
  - The window is a ~2 s pan down to an orange dome in a flat grey box.
- **The old burrback.**
  - On screen it is ~1.5× her height in a flat, empty 2048-wide box. It reads as "a bigger beetle", not a giant
    living on a carpet of wings.
  - Casual and average deaths come 10–17 s into a try, mostly pinned at the east wall (x 5612).
  - Death costs ~15 s (P-chute), so the loop is cheap, but the casual and average-s3 bots go 8–9 tries without
    learning. A human would learn faster, but the first try is nowhere near C13's "survives ≥ 60 s".
  - Skilled runs read it as a fair exam (19–35 s).
- **Claws (glade 2).** Clean: the text, P4, the climb-out. It's the most "earned" moment in the area, and nothing
  undercuts it.
- **The oak climb (R7b).** Three things on video:
  1. **The seam.** She crosses the hub/heart boundary 4–12 times per run. Each crossing is a full-black room fade,
     2–4 frames of black in a 2-pictures-a-second cut. The climb strobes.
  2. **The thorn band** at x ~1490, y ~1430: 2–12 hits per run, 1–3 fades in 5 of 7 runs.
  3. **Falls.** A hit drops her a third to the whole of the shaft. Average s2 was knocked off the rim after snuffing
     the crown wick and climbed the whole thing again.

  W-ff grabbed climbers 2–13 times per run and was **snuffed once in 9**. The glimpse's payoff ("I put it out") is
  missing for almost everyone.
- **The crown and the cloud.**
  - What works: she cuts the root curtain, rests at P5, Tatter appears beside her, and ~90 moth specks drift up and
    away. The HUD's "moths 90/155" carries the "these are mine" meaning that the cloud's size can't carry in grey.
  - What doesn't: the crown trigger holds 2.5 s, but the cloud's lift is 6 s plus a 2.5 s stagger, and the bot walks
    off east at once. **The finale is over in about 3 seconds.** No look-out frames the hatching tree west or the
    valley east.

---

## 4. The director's §7 questions

1. **The one-sentence test. Fail** on video. What a viewer can retell is "fell in the woods, freed moths from lamps,
   got stuck at a gap with flying things, fought a beetle in a pit, climbed a shaft". That is a list of rooms. Nothing
   on screen before minute ~14 says "the big tree" or "up". Decided at the hub (5:33 in casual s2): the question
   wasn't shown.
2. **When did they first want to climb the oak?** Not before the claws, in any run. The vista has no oak and the
   glimpse shows no light. Wanting to go up first appears at glade 2 ("Jump at a wall to climb"), at 14–20 min, and
   that is a tutorial prompt, not a want.
3. **Did they use the lamp on purpose?** Partly.
   - **Incidental:** most catches were things that happened to her (R3's drop-in, wick-door at R4's door, the glade
     lip, W-ff grabbing climbers 2–13 times a run).
   - **Chosen:** the bots tried lamp lines ("jump into the lamp", "cut down on the lamp") 15–34 times a run. In R3, R8
     and R9 most of those did not land where the arc promised (landed in the pit, fell short).
   - **By R8 the throw does not feel like theirs.** It's the room where it fails most.
   - **R6 is the exception:** the bend wick's throw into a glide and the snuff on the pass look deliberate and
     joyful.
4. **Did each predator bite them once, at its moment?**
   - **Beetle: yes.** It bites at landings: R4's adult after the jumped ram, R6's T4 (0–2 hits in 7 of 9 runs), R9's
     composition (1–3). Its *first* bite is wrong, though: in 8 of 9 runs the juvenile hits 1.4–1.6 s after
     she enters, at x ~860–890, under wick-door's pull, before anything can be read.
   - **Dangler: weakly.** It bites at R9's first cut spot (5 of 9) and once or twice in R7b. The two root-stair
     danglers never engage.
   - **Hawker: no** at its designed moment. 0 hits on a caught moth in R8 in 9 runs. It bites only at the crown
     (hawk-crown, 0–5 hits), where its strike also knocks her down the shaft. The prey rule (essential #4) hasn't
     landed.
   - Whether players worked out *why* each one is there can't be judged from bots. The R8 hawker gives them nothing
     to work out.
5. **Did the snuff feel like the answer?** At R9's composition every run snuffed W-s3, the flame. Yes there. In R8 the
   throw lamp's snuff happened in 1 run of 9 (it's unreachable until you've crossed, and most crossed by the tunnel or
   left it lit).
6. **Did any element feel random?**
   - **The hub's green exit line and the two pillars.** They read as a doorway in the ceiling, not a tree.
   - **The pit's flat box.**
   - **The R8 pit**, a dead pocket with no purpose.
   - **The black flashes on the trunk.**
   - **The juvenile at R4's door**, which reads as a floor prop that hurts (first-timer r3 said the same).

   The elements themselves feel less random than in chunk 1. What feels random now is *placement and staging*.
7. **Can they draw the map from memory?** No oak was ever seen as an object, so there is no centre to draw round. From
   the runs, the map a viewer can draw is a line east, a drop, a box, and a shaft up. The "loop under the place you
   first stood" happens (R9 → roots → glade 2 → mesh → hub), but its proof is a 10-second hub visit at minute 6. The
   return, through the mesh at ~14–19 min, comes up into a room the player barely registered.
8. **Did they recognise the glow-cap in the trunk?** They couldn't, because it was never shown in the glimpse, and
   8 of 9 never snuffed it.
9. **The crown.** The cloud reads as moths leaving, and the HUD count helps. It's too short to land, and the player
   walks out of it. Tatter's arrival is visible but tiny and unheld. Whether a bigger cloud for more finds is noticed
   can't be told: the snuff range 14–20 makes little visible difference in specks.
10. **The dark line.**
    - **R3's dip:** 9 of 9, always *after* the throw had already put her on M (she walks off M's end into it within
      4 s). It is never the slow alternative to the throw, only the floor you reach next.
    - **R8's tunnel:** 5 of 9, mostly after failing the throw.
    - **R7b's dark way:** all 6 runs that reached the trunk, mostly after a fall (her re-form point is in that
      tunnel).

    The dark line reads as **where you end up when the light line fails**, not as a slow, safe choice made from the
    decision point. Its entrances aren't visible from where the choice is made (R8: a hatch in the floor behind you;
    R3: you're already in it).
11. **Quit points.**
    - **0:15:** R1's trunk gap, 6 catches in 11 s for casual s1.
    - **2:15–4:00:** R4's bark floor, with the juvenile and the door wick before it (the first-timer r3 quit here).
    - **4:20:** the glade lip, 16 catches in 22 s.
    - **6–11 min:** R8, where casual s3 quit.
    - **13–18 min:** the pit, where casual s1 and average s3 quit.

    "Nothing before 6:00 takes more than 3 tries" fails in 6 of 9 runs (R1, R3 and the glade).
12. **Peak placement.** Partly. The deaths are in the pit and on the trunk's band, as designed. But the hardest *time*
    is R8, a predator-teaching room, and the earliest friction (R1, R3, R4, the glade) sits in the teaching minutes.
13. **Time.** Through in 18–25 min (target 28–34). Claws at 14–20 (target 25–28). The bot floor is low because it
    skips reading, views and finds. The per-room shape is what matters (§1): the designed acts 2 and 3 are much
    shorter than planned, and R8 is much longer.

---

## 5. Does it still feel random and disjointed?

**Yes, less than before, and for different reasons.** The director diagnosed a sampler of content, and the rebuild
fixed that. What makes it disjointed on video now:

1. **No through-line on screen.** The want ("up the oak") lives in the docs and the moth-stone's carving, not in any
   frame a player sees before minute 14. Without it every room is "the next room east". The swarm motivates minutes
   0–1 and then disappears for 17 minutes.
2. **Rooms don't see each other.** The vista doesn't show the oak, R3–R6 show no trunk in the backdrop, the hub
   doesn't show its top, and the crown doesn't show the hatching tree or the valley. In grey that is shapes and camera
   work, not art. Ori's Spirit Tree is a silhouette before it is a painting.
3. **The hub is a corridor.** At ~9.5 s on the first visit it is a pause between R6 and R8, not a place. HK's Dirtmouth works because it
   holds you (the bench, Elderbug, the well you stare into). Ours lets you walk through a beat that is supposed to be
   the area's question.
4. **Black cuts.**
   - Every room change fades to black, including the catch returns at the R1 gap and the glade lip, and the hub/heart
     seam crossed up to 12 times.
   - Catches flash black 2–19 times per run.
   - A 20-min run has ~30–40 full-black cuts (room changes, catches and fades).
   - Ori and HK keep the screen lit through respawns on hazards and never cut on a vertical seam.
5. **Lessons don't chain.**
   - Q10: the throw is taught in R3 by accident (a drop-in catch), developed in R4, sings in R6, then fails for
     5 minutes in R8.
   - The twist ("caught is prey") never fires.
   - The pogo ladder: the bark floor (R4) → pogo-wick (skipped by all) → the pit (where nobody pogoed on purpose) →
     the W-ff bridge snuff (1 in 9). It's a ladder on paper with missing rungs in play.

## 6. Is it fun?

**Where it is:**
- **R1–R2 (0:00–0:45).** Wonder, a clear want, the title. As good as King's Pass's opening seconds.
- **R6 (90 s).** Glide, a lamp's bend, a throw into a glide, a snuff on the pass, a landing by a beetle. The lamp
  verb and the wings make one motion. It's Ori's Sunken Glades feel: movement as joy, with the trap made a tool.
- **R9's opening.** Thread, drop, cut, two snuffs in 3 s: crisp. Celeste-like teaching inside one screen.
- **The pit for a skilled player.** A 20–35 s exam that uses the tell and the pogo. A fair, short False Knight.
- **Claws in glade 2.** A clean earned moment.

**Where it isn't, and what does it better:**
- **R8 (5 min of standing and hopping).** HK's Vengefly over the King's Pass climb does what R8 wants: the threat sits
  where you must go, the target is always in frame, and a miss puts you back 3 s. Ours hides the landing and has a
  hunter that never hunts.
- **The root stair (15 s) and the window (2 s).** Ori's descent into the Moon Grotto, or HK's drop into the Crossroads,
  makes going down feel like entering somewhere. Ours is a slide.
- **The pit for a casual (10-second deaths).** HK's False Knight gives a first-timer 40–60 s of reading on try one.
  Its first slams are slow and the arena is wide.
- **The trunk (falls, black seam flashes, thorn band).** Celeste ch1's climbs checkpoint every screen. Ori's wall
  climbs have rest ledges and never cut. Ours undoes 30–60 s on a hit and strobes.
- **The finale (3 s).** HK's Dirtmouth arrival, or Ori's Spirit Tree, holds you. Ours lets you walk out of your own
  payoff.

---

## 7. The 8 worst problems, ranked

Ranked by how much each one damages the chunk as one experience. Each has a fix and an owner.

### 1. The oak and its question are never on screen (staging, camera; level for one move)

- **Evidence.** No oak in R2's vista. The glimpse's firefly flies at y −356 to −1616, above the hub's top, so the
  camera can't follow and it is never seen. The hub shows two 860 px pillars and a green exit line. First hub visit
  ~9.5 s in every run. W-ff snuffed in 1 of 9. "Up" first appears at the claws.
- **Fix.**
  - **Draw the oak as a greybox landmark everywhere it should be seen:** a tall column with a ring at its top, in
    R2's vista and in the backdrop of R3–R6, growing room by room. The staging should draw `stage.oak` even when it
    is outside the room's bounds, as a parallax backdrop.
  - **Make the glimpse a held look-up the camera can actually do:** let the glimpse beat pan into R7b's space (draw
    the room above for the beat), or move W-ff's hang point down into the hub's visible trunk for the glimpse.
  - **Hold the beat ≥ 4 s with input locked.** End it on Tatter turning to look up.
  - **Keep W-ff's glow visible from the hub floor** all through act 2.
  - **Remove the green exit line** from the player's view.

  Without this, problems 2–8 are polish on a chunk with no want.

### 2. R8's throw gap is a five-minute wall, and its hunter never hunts (level, camera, creatures)

- **Evidence.**
  - Median 5:08 (3:18–11:44), the longest room in 8 of 9 runs.
  - Lost stretches of 60–180 s at x 2132–2988.
  - One run never got past.
  - The far ledge is at or off the frame's edge from the near ledge.
  - A short throw drops her into a 448-wide walled pit whose only exit is back.
  - hawk-throw: 0 hits on a caught moth in 9 runs.
- **Fix.**
  - **Camera:** a zone over the gap that frames near ledge, wick and far ledge together.
  - **Level:** make the pit the *mouth of the dark tunnel* (a miss drops you into the slow line, not a dead box), and
    light that mouth so it's visible from the near ledge.
  - **Creatures:** land the prey rule. Hawker B starts its tell the frame she's caught and strikes the orbit; beating
    free early and aiming out is the lesson.
  - **Target:** ≤ 3:00 in the room, and every run bitten once while caught.

### 3. Act 3 lasts a minute: the descent into the dark is a slide (level, creatures)

- **Evidence.**
  - Well median 1:23 against 5:00–9:00.
  - Root stair to pit in 15–20 s.
  - Pogo-wick snuffed 0 of 9: a glide skips it.
  - dang-pocket and dang-chute never engage.
  - Window ~2 s.
- **Fix.**
  - Rebuild the stair as a real descent of ~2 min: dark glide gaps whose landings are lit only by the pocket wicks,
    with danglers over those landings (placed where she must land, per the rule).
  - A pogo-wick with no glide line round it: a root ceiling over the whole span, so drop + down-cut is the only way.
  - The window held ≥ 3 s with the old beetle framed large.
- **Note.** This also moves the pit to its designed minute and gives the area its "dark" act.

### 4. The trunk climb strobes, and a hit undoes it (sim/render for the seam, level, sim for re-form)

- **Evidence.**
  - 4–12 hub/heart crossings a run, each a black fade.
  - Thorn band: 2–12 hits and 1–3 fades in 5 of 7 runs, all at the same spot.
  - The crown hawker knocked average s2 off the rim down the shaft.
  - A fade re-forms at the last *rested* patch: skilled s1 went back to R8 and never returned.
- **Fix.**
  - **No fade on a vertical seam inside the oak:** either merge the hub's shaft into R7b, or make same-column seams a
    seamless camera hand-off.
  - **A patch at R7b's rest ledge.**
  - **Fades in R7b re-form in R7b**, never in a room behind the climb-out.
  - **Catch ledges** every ~600 px of shaft.
  - **The thorn band** shorter, or W-ff's catch window wider.
  - **The hawker's strike** shouldn't throw her over the rim's lip.
  - **Hazard returns stay lit** (no black) everywhere.

### 5. The old burrback is a bigger beetle in an empty box, and it kills a casual in 10–15 s (creatures, level, camera, staging)

- **Evidence.**
  - Casual s1 and average s3: 9 and 8 fades, 36 and 32 hits, then gave up.
  - First-try survival 11–21 s in the runs that died (C13: ≥ 60 s).
  - It's ~1.5× her height on screen.
  - Deaths pinned at the east wall.
  - Skilled: 19–35 s, 3–5 hits (fair).
- **Fix.**
  - **Creatures:** slower first cycles (a longer tell for the first two rams of a fight), and no contact damage in
    the earned window. The lab found jumps in the first half of the tell land in the ram; widen that.
  - **Camera:** frame it close enough to read as huge (zoom in, not out).
  - **Level/staging:** give the box a feature, such as a ledge to escape the ram, or the wing carpet as floor
    texture, and keep the east wall from being a corner trap (a ledge or a slope).

### 6. The teaching minutes are where the friction is (level)

- **Evidence.**
  - R1's trunk gap: 6 catches in 11 s (casual s1), 2 for casual s3 and average s2.
  - R3: 9 of 9 caught by the drop-in and in the dip within 4 s; 0:44–5:02 in the room, stuck under W2.
  - R4: the juvenile hits 1.4–1.6 s after the door in 8 of 9, under wick-door's pull.
  - The glade lip: 3–16 catches in a row.
  - The first-timer r3 quit at R4's bark floor (since changed by aa98d39).
- **Fix.**
  - **R1:** take the trunk gap's fall away, or put a ledge under it.
  - **R3:** move the drop-in out of W1's field. She should land on L, see W1, M and the dip, and *then* take the
    catch on purpose. Give the dip's step a visible way up, and make W2's cut spot readable from the dip.
  - **R4:** move the juvenile off the door wick's landing (one new thing at a time).
  - **Glade lip:** a catch must return her to a place where walking on doesn't fail again (back from the lip), with
    the glide hint on.

### 7. The light/dark choice isn't a choice: the dark line is where you fall (level, design)

- **Evidence.**
  - R3's dip: 9 of 9, all after the drop-in throw, never instead of it.
  - R8's tunnel: 5 of 9, mostly after a failed throw; entered by a hatch behind the decision point.
  - Q10's trade (fast and dangerous against slow and safe) is never presented as a fork you can see.
- **Fix.** At every lamp gap the dark way's *entrance* must be visible from the spot where the light line is taken, as
  a separate door: a lit-from-below tunnel mouth, stragglers drifting into it, a gap in the floor with moonlight. Then
  a player chooses it. Design rule for A5: "the dark way starts where the light way starts".

### 8. The finale is over in three seconds (staging, camera, level)

- **Evidence.**
  - The crown trigger holds 2.5 s, but the cloud's lift takes 6 s plus a 2.5 s stagger.
  - Every through run walks out east within ~3 s of P5.
  - No look-out framing west or east.
  - Tatter's arrival is a few pixels, unheld.
- **Fix.**
  - Hold the crown beat until the cloud is gone (~9 s), with the camera pulled out wide: the hatching tree (as a grey
    silhouette) west, the valley's lights east.
  - Tatter's climb shown in frame during the hold.
  - The `e` exit shut until the cloud has lifted.
  - Scale the cloud's specks so 70 against 100 moths is visibly different, and keep the HUD count up during it.

---

## 8. Smaller notes

- **R6 is too short for its budget** (median 1:20 against 3:00–5:00), and it's the best room. When the area is
  re-paced, grow R6 (another bend or throw beat) before adding anywhere else.
- **R6 T4:** after the snuff-on-the-pass, a beetle hit can knock her back into gap 3's thorns (average s2 faded there).
  The landing should forgive the hit.
- **R9's DJ wick** was never seen by any run (postgame; fine).
- **R8's east exit,** seen from the tunnel's rungs at x 3600, isn't framed as an exit (casual s3 stood next to it and
  turned back). It's partly bot head, but a doorway shape would cost nothing.
- **Black on catches.** The R1, R2, glade and chute catches all cut to black. A lit return (a quick fade of her, not
  of the screen) would remove most of the strobing.

## 9. Bot limits that touched these numbers

- **R3, R9 and part of R4:** the explorer head chases lamps it can't reach (W2 from the dip, R9's shelf) for 45 s at a
  time. People would give up sooner, or read the knob.
- **R8:** "stood still" includes the planner retrying the same failed throw every 11 s. A person would try the tunnel
  sooner, or aim differently. Even so, R8's camera and pit problems are real (frames above).
- **No LLM intent.** Nothing here can tell what a player *understood* (the stone, the carving, Tatter). §4's answers on
  meaning are from what's on screen, which is the ceiling of what a player could understand.
