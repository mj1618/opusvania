# Area 1, human-like video review, round 2

2026-10-18. A second independent review of area 1, this time after round 3
(`reviews/area1-plan-r3.md`). It uses the same method as round 1 (`area1-video-r1.md`). The bar is the same:
Hollow Knight, Ori, Nine Sols and Celeste with the art removed, and "good for greybox" is a fail.

**Build:** 8780dfa (pinned clean snapshot). Area 1 now has 10 rooms; the hub and R7b are merged into one room, "the
oak" (`wood-hollow`).

**Command:**
`npm run humanplay -- run --chunk wood-hatch,wood-chase,wood-wicks,wood-burrow,wood-glade,wood-glidewalk,wood-hollow,wood-hawkers,wood-silk,wood-well,wood-canopy --upto ''`

A run counts as `through` when it reaches the canopy stub. That is the only way to require the crown exit now that
the climb and the hub are one room. All nine replays matched the headless state hash.

**Files:** `playtest-reports/humanlike-2026-10-17T19-34-32/` (gitignored).

**What I watched:**
- every room's contact sheets for the reference runs;
- the moments around every death;
- video cuts (1–4 pictures a game second) of:
  - the vista;
  - R3 and R4;
  - the glade lip (the average s2 loop);
  - R6 and its chain;
  - the oak's first visit and glimpse;
  - R8's throw and tunnel;
  - the descent and the window;
  - the old burrback (casual s3);
  - the whole climb (casual s3, casual s2);
  - the crown finale.

Black frames were counted with `ffmpeg blackdetect`. The skilled runs' videos were still rendering when I wrote this, so their findings come from their traces and the same rooms seen in the casual and average videos. My stills and cuts are in this session's scratchpad
(`video-review-r2/`).

**How to read the bots.** Same caveats as round 1:
- They are explorers. They go for every lamp, including the post-game crown lantern they can't reach.
- They don't read text or admire.
- "Stood still" is often their planner.

New this round:
- **After the finale some runs went back for the unsnuffed crown wick instead of walking out.** The crown hawker
  knocked them down the trunk, and two never climbed back (skilled s2 and s3 count as "lost" though they *saw* the
  finale). That part is head.
- **The climb failures before the finale are hands:** wall-jump lines that miss in W-ff's pull and the hawker's lane.

---

## Verdict

Round 3 fixed most of what round 1 could *see*:
- The oak is on every horizon from the vista on.
- The glimpse now rises the whole trunk and shows the firefly hanging W-ff.
- The tree is one room with no seam.
- Full-black frames fell from 38 to 12 in a run.
- R1–R5 have no catch loops except the glade lip, and the juvenile is fodder.
- R6 is the longest room and mostly joy.
- R8 dropped from a 5-minute wall to a median 2:24.
- The finale holds 9 s with the cloud and the hatching tree in one wide frame.

For the first time on video **it reads as one journey**: the oak is the thing you walk toward, look up, go under and
climb out of.

But the experience now **ends badly**. The oak climb is the new wall:
- the median run spends 6 min in the oak;
- 7–39 falls of more than 600 px a run;
- two of nine runs never reached the crown, though both had been near the top.

The two middle twists are also still not happening:
- **R8:** 8 of 9 runs fail the throw into the tunnel and cross by the dark way. The hawker's rhythm is visible but
  never bites.
- **The descent:** median 41 s, and the pogo-wick is snuffed in only 3 of 9 runs.
- **The pit:** still kills a casual player in 11–15 s a try.

So the area now has a beginning and a centre. It is fun up to the hub, and in R6 especially. Its last third (pit →
climb) is where a player would put the controller down.

---

## 1. Numbers

| run | ended | time | R1–R5 | R6 | oak 1st | R8 | R9 | R10 | oak (all) | claws | deaths | snuffs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| casual s1 | through | 24:45 | 6:25 | 4:14 | 10 s | 2:39 | 2:15 | 3:15 | 5:55 | 18:36 | 5 (pit) | 13 |
| casual s2 | lost in the oak (never reached P5) | 24:02 | 5:39 | 1:40 | 10 s | 1:07 | 2:43 | 2:12 | 10:39 | 12:30 | 0 | 16 |
| casual s3 | through | 20:39 | 3:49 | 4:25 | 10 s | 1:35 | 3:25 | 3:37 | 3:45 | 16:42 | 9 (5 pit) | 16 |
| average s1 | through | 22:30 | 5:00 | 2:26 | 10 s | 2:42 | 4:57 | 2:10 | 5:13 | 16:22 | 2 | 17 |
| average s2 | through | 21:44 | 5:33 | 3:17 | 10 s | 2:24 | 3:17 | 1:02 | 6:09 | 15:29 | 3 | 18 |
| average s3 | gave up in the pit (7 fades) | 18:11 | 4:40 | 3:28 | 10 s | 3:45 | 2:51 | 3:14 | – | – | 7 (pit) | 13 |
| skilled s1 | lost in the oak (never reached P5) | 22:13 | 5:18 | 2:17 | 10 s | 1:51 | 2:41 | 1:05 | 8:57 | 12:57 | 2 | 20 |
| skilled s2 | lost in the oak **after** the finale | 29:04 | 4:56 | 3:53 | 10 s | 3:29 | 2:37 | 1:43 | 12:23 | 15:44 | 3 | 17 |
| skilled s3 | lost in the oak **after** the finale | 25:53 | 6:28 | 3:10 | 10 s | 1:20 | 2:42 | 3:21 | 8:49 | 15:24 | 2 | 16 |

### Round 1 against round 2 (medians)

| | r1 (b42de7f) | r2 (8780dfa) |
|---|---|---|
| through (reached the exit) | 5 / 9 | 4 / 9, and 6 / 9 reached the finale |
| R6 | 1:20 | **3:17** |
| hub / oak, first visit | 9.5 s | 10 s |
| R8 | 5:08 | **2:24** |
| R10 entry → pit | 15–20 s | 41 s (18–61) |
| the climb (claws → P5) | 2–5 min, with seam strobing | 1:08–7:16, 2 runs never |
| full-black stretches in a run | 38 (casual s2) | **12** (casual s3) |
| R1–R3 deaths | 0 | 0 |
| juvenile hits at the door | 8 / 9 | 4 / 9 (1 hit, and it dies in 2 cuts in all 9) |
| hawker hits on a caught moth in R8 | 0 / 9 | 0 / 9 |
| pogo-wick snuffed | 0 / 9 | 3 / 9 |
| W-ff snuffed | 1 / 9 | 1 / 9 (caught by it 6–35 times a run) |

---

## 2. Round 1's ranked problems: fixed, partly, not

| # (r1) | Problem | Now | Evidence |
|---|---|---|---|
| 1 | The oak and its question never on screen | **Mostly fixed** | See below |
| 2 | R8 a five-minute wall, hunter never hunts | **Partly** | See below |
| 3 | Act 3 lasts a minute | **Partly** | See below |
| 4 | The trunk climb strobes and a hit undoes it | **Strobe fixed; undoing worse** | See below |
| 5 | The old burrback, a bigger beetle in an empty box | **Not** (for casual) | See below |
| 6 | Friction in the teaching minutes | **Mostly fixed** | See below |
| 7 | The light/dark choice isn't a choice | **Not; now inverted at R8** | See below |
| 8 | The finale is over in 3 s | **Fixed** | See below |

1. **The oak and its question: mostly fixed.**
   - **Fixed:** the oak's silhouette and ring sit beside the moon at the vista (0:45) and grow in R3–R6's backdrops.
   - **Fixed:** the glimpse holds 3 s and the camera rises the whole trunk. The firefly is visible and W-ff is hung
     in frame. This is the first frame with W-ff in every run, at 7:20–10:39.
   - **Not fixed:** the first visit is still **10 s** in all 9 runs (target ≥ 25 s). The beat now *asks*, but the
     room doesn't hold her: P3, the stone and Tatter are passed in stride.
2. **R8: partly fixed.**
   - **Fixed:** room median 2:24, and the frame holds the near ledge, W-throw and the far ledge. The rhythm is
     readable on video: the hawker swoops through the orbit every ~14 s and takes a moth.
   - **Not fixed:** hawk-throw hit a caught moth **0 times in 9 runs**. In 8 of 9 the first crossing was through the
     tunnel ~25 s *before* reaching the far ledge, because "jump into the lamp" threw her into the tunnel mouth
     (landed at y 1360). Nobody crossed by a timed throw.
3. **Act 3: partly fixed.**
   - **Fixed:** the window frames the old burrback on its wing carpet, and danglers now engage (dang-pocket and
     dang-chute appear in 6 runs).
   - **Not fixed:** entry to the pit in 18–61 s (median 41 s; target ≥ 1:30), and the pogo-wick snuffed in 3 of 9
     (target ≥ 8). The bots get *caught* by it 1–5 times instead of down-cutting it.
4. **The trunk climb: the strobe is fixed, the undoing is worse.**
   - **Fixed:** the tree is one room, with no seam black on the climb.
   - **Worse:** falls of more than 600 px happened 7–39 times a run after the claws; W-ff caught climbers 6–35 times;
     2 runs never reached P5.
   - **Re-form:** a fade near the crown now re-forms at P3 on the oak's floor, so the whole climb is redone (casual s3
     at 17:48). That's in the oak, as asked, but the patch at the rest ledge (P-ledge) only counts if rested at.
5. **The old burrback: not fixed for casual.**
   - Pit fades: casual s1 5, casual s3 5, average s3 7 (gave up).
   - First-try survival 11–15 s for those three (target ≥ 45).
   - On screen it is still ~1.5× her height in a wide frame. The escape ledge is used to hide, then she drops off it
     into the ram's lane and is pinned.
   - Skilled and average s1/s2 win in 15–28 s.
6. **Friction in the teaching minutes: mostly fixed.**
   - **Fixed:** R1's gap 1 catch; R3's drop-in lands outside W1 (1 drop-in catch in 9 runs); W1 is snuffed in all 9,
     W2 from the knob in 6 of 9; the juvenile is killed in 9 of 9.
   - **Not fixed:** the glade lip still loops: 5, 7 and **15 catches** (average s2, 30 s). The assist opens the wings,
     but the return point is the alcove under the lip, from which a glide still drops into the chasm.
   - R1–R5 total 3:49–6:28 (7 of 9 within 6:00).
7. **The light/dark choice: not fixed, and now inverted at R8.** The dark way became the *default*: the throw lands in
   it. In R3 and R4 the forks are gone, as the revised rule intended.
8. **The finale: fixed, with three rough edges.** Every run that reached P5 got the 9 s hold, in a wide frame with the
   hatching tree west, the moon, and the cloud lifting to the top right. The rough edges:
   - the crown hawker keeps diving red through the frame during the release;
   - the valley's lights east aren't in it;
   - at that zoom Tatter can't be told from the moths.

---

## 3. The director's shape targets

| Stretch | Target | Bots (median, range) | Pass? |
|---|---|---|---|
| R1–R5 | ≤ 6:00, nothing over 3 tries | 5:18 (3:49–6:28) | **Fail on tries**: the glade lip loops 5–15 times in 3 runs |
| R6 | ≥ 2:30 | **3:17** (1:40–4:25) | Pass. Some of it is thorn-fall retries (casual s3: 10 hits on gap 2's thorns, 3 fades) |
| The oak, first visit | ≥ 25 s | **10 s** in all 9 | **Fail** |
| R8 | ≤ 3:00 | **2:24** (1:07–3:45) | Pass (7 of 9), but for the wrong reason (the tunnel) |
| R9 | 2:30–4:00 | 2:43 (2:15–4:57) | Pass |
| Act 3 to the pit | ≥ 1:30 | **0:41** (0:18–1:01) | **Fail** |
| The pit | 0:30–2:00 | 15–28 s (skilled, average); 2:09–2:20 (casual); average s3 gave up | **Fail** at both ends |
| The climb | 2:30–4:00, no fall over 600 px | claws → P5: 1:08, 1:35, 2:17, 6:00, 6:05, 7:16, never ×2; 7–39 falls > 600 px | **Fail** |
| The crown | ≥ 9 s | 9 s hold in all 6 runs that reached P5 | Pass |

---

## 4. The experience timeline

Times are from reference runs: casual s3 (through, 20:39), average s2 (through, 21:44) and skilled s2 (finale at
18:01, lost after). The others are noted where they differ.

| min (casual / avg / skilled) | doing | wants / feels | flow |
|---|---|---|---|
| 0:00–0:55 | Hatch, branch (one catch, not a loop), the chase. **The vista: LAMPFALL by the moon, and the oak's silhouette with its ring, stragglers peeling toward it** | "Follow them, toward that tree." Clear | **Sings** |
| 0:55–2:00 | R3: lands outside W1, sees the dip and its dead moth, W1, then W2 with stragglers spinning; snuffs W1 by a jump-cut and W2 from the knob within 6 s | "Lights trap moths; I free them." Learned | Good. The oak sits in the backdrop |
| 2:00–4:00 | R4: the juvenile dies in 2 cuts; W3 from the step; the gap throw; P1; bark floor. Some 50–80 s standing (head) | Competent | OK |
| 4:00–5:00 | The glade, glide. **Average s2: 15 catches in 30 s at the lip** (wings open, glides into the chasm, back to the alcove) | Joy, then a loop that looks broken | Breaks for some |
| 5:00–8:15 | R6: glides, the bend, T4 (forgiving now), **the lamp chain** over the chasm toward the oak's door, which fills the frame. Casual s3: 3 thorn fades at gap 2 and walks back from the room start | The best stretch: flight, the trap as tool, the goal getting bigger | **Sings** (with a sour casual loop) |
| 8:15–8:25 | **The oak, first visit:** P3, then the glimpse rises the trunk to the crown, the firefly hangs W-ff, Tatter. Out of the east arch 10 s after entering | Awe, briefly. "Up there." But no time to sit in it | Good, too short |
| 8:25–10:00 | R8: the frame shows the whole gap; the hawker swoops through the orbit on a beat. She waits 40 s on the near ledge, takes the catch, lands *in the tunnel mouth*, walks the tunnel, comes up by the far ledge | Watchful, then "huh, I fell in, fine" | OK. No longer a wall, but no payoff |
| 10:00–13:25 | R9: dangler, two snuffs, the composition (its beetle now kills in 3 runs), the bark panel | Competence | Good |
| 13:25–14:20 | The descent: the pogo-wick (snuffed here; 6 other runs get caught by it instead), chute catches, two pockets, the window on the old burrback asleep on its wings | Over quickly. The window works | Too short |
| 14:20–16:40 | The pit: hides on the escape ledge, drops off, pinned, fades 5 times, wins on the 6th (average s3: 7 fades, quits). Skilled: 15–28 s | Casual: hopeless, then relief. Skilled: a fair exam | **Quit point** for casual |
| 16:40–17:00 | Claws in glade 2, the climb-out, up through the mesh (one real room-change fade) | "Now the tree." Earned | **Sings** |
| 17:00–18:17 | The climb: rest ledge, W-ff's catch, the band, the knot, the crown wick with its hawker. **Casual s3 is struck at the top at 17:48, fades and re-forms at P3 on the floor**, then re-climbs | Rising, then crushed | Choppy |
| 18:17–18:26 | **The crown:** a wide frame, the hatching tree west, the moon, the cloud lifting (the crown hawker still diving through the frame) | Release. It lands | **Sings** (nearly) |
| 18:26–20:39 | (head) Goes back for the crown wick, is struck down the trunk, re-climbs, exits east | – | – |
| avg 15:29–21:34 / skilled 15:44–18:01 | The same climb, 2–6 min with repeated falls from the upper third. Casual s2 and skilled s1 reach the top area and are knocked down again and again, for 8–9 min, and never reach P5 | Frustration | **The wall** |

---

## 5. Does it feel like one journey now?

**Yes, for the first time, up to the oak's floor.**
- The oak in the vista gives minute 1 a destination.
- The same silhouette growing in R3–R6 gives the walk a direction.
- R6's chain flies her at the oak's door.
- The glimpse finally *shows* the inside of the tree and the light hung in it.
- The descent passes under the oak, whose trunk stays in the backdrop of the roots.
- She climbs out through its floor.
- The crown frames where she started.

The set-ups pay off on screen: the crown ring she saw at 0:45 is where she stands at the end. The one-sentence test
would now plausibly pass: "I fell into the woods, walked to the big tree, went under it, and climbed it out."

**Where it still breaks:**
- **The oak's floor is a doorway, not a place** (10 s). The question is shown but not *sat with*. Tatter, the stone
  and P3 go by in stride.
- **R8's lesson doesn't happen.** The tunnel absorbs everyone, so "time the catch to the hunter" is scenery.
- **The climb isn't a rise; it's a ladder of slips.** On video it reads as up, down, up, down. The payoff room plays
  like a punishment room until the crown.

## 6. Is it fun?

**Yes, in more places than round 1:**
- the opening and the vista;
- R3's "lights trap moths, I free them" in 6 seconds;
- R6 for 3 minutes;
- the glimpse;
- R9;
- the claws;
- the crown.

That is seven good beats in ~20 minutes, against two in round 1.

**Where it isn't, and what does it better:**
- **The climb** (median 6 min in the oak, 7–39 big falls a run). Ori's Ginso Tree climb and Celeste's chapter-1
  summit are climbs where a mistake costs one screen. Our crown hawker and W-ff throw a mistake down most of the
  trunk.
- **The pit for a casual** (11–15 s a try, 5–7 tries). HK's False Knight gives a first-timer 40–60 s on try one.
- **The glade lip loop.** Ori's first glide over the Sunken Glades has no way to land back below the lip.
- **R8's throw.** It looks like a timing puzzle (Celeste's moving blocks) but solves itself by falling. Being let off
  isn't fun.

---

## 7. The 8 worst problems now, ranked

### 1. The oak climb is the new wall (level, creatures, lures, sim)

**Evidence:**
- Median 6:09 in the oak. Claws → P5: 1:08–7:16, and **2 runs never reached P5** (casual s2, skilled s1), knocked
  down from the upper third for 8–9 min.
- 7–39 falls of more than 600 px a run after the claws.
- **W-ff caught climbers 6–35 times a run** (skilled s2: 35) and was snuffed in 1 of 9.
- **The crown hawker strikes knock her off the top:**
  - hawk-crown hit 7 of 9 runs and caused 3 deaths;
  - casual s3 faded at 17:48, re-formed at P3 on the floor and re-climbed the whole trunk.

**Fix:**
- **Catch rungs or ledges every ~600 px that actually stop a fall:** one-way stubs at the faces, not just on the
  route.
- **The crown hawker's strike pushes her onto the rim**, never off it. Its lane should cross the wick, not the last
  face.
- **W-ff's pull** shouldn't reach the face she climbs *below* the band: a climber held right is caught 25 of 28
  times. Make the catch a choice: hang W-ff off the face, reached by a jump from the knot bridge.
- **A fade above the rest ledge re-forms at P-ledge** whether or not she rested there (like P-chute in the well).

**Target:** claws → P5 ≤ 3:00 for every run, and no fall over 600 px.

### 2. The pit still kills a casual player in 11–15 s a try (creatures, camera, level)

**Evidence:**
- casual s1 and s3: 5 fades each; average s3: 7, then gave up.
- First-try survival 11–15 s; plan target ≥ 45.
- Video: she hides on the west escape ledge, drops into the ram's lane, and is pinned at the gate wall.
- The beetle still reads ~1.5× her height; the camera isn't zoomed in.

**Fix:**
- **The first fight's opening rams are slower:** +50% tell on the first two *per try*, not per fight, plus a longer
  recover.
- **A ram that hits the wall stuns it longer** (the earned window), so hiding and baiting is rewarded.
- **Frame the pit at zoom ≥ 1.2** so the beetle is huge and its tell reads.
- **The escape ledges should be useful:** a drop from them onto its back is a pogo, not a landing in its lane.

### 3. The oak's floor is a doorway: 10 s on the first visit (staging, level, camera)

**Evidence:** 10 s in all 9 runs (target ≥ 25). The glimpse holds 3 s, and then nothing else holds her: she walks
past the stone and Tatter, under the trunk and out.

**Fix:**
- **The east arch is shut until she has sat at P3** (Dirtmouth's bench rule: the rest *is* the gate; one press).
- **The glimpse plays from the rest**, not on the walk-in.
- **Tatter walks to the trunk's foot, looks up, and then walks ahead to the arch:** the beat ends with it leading
  her out.
- **The moth-stone carving opens with the rest.**
- **Target:** 25–40 s.

### 4. R8's twist doesn't fire: the throw lands in the tunnel (lures, level, creatures)

**Evidence:**
- 8 of 9 runs fail "jump into the lamp" into the tunnel mouth (landed at y 1360), cross by the tunnel, and reach the
  far ledge ~25 s later.
- hawk-throw: 0 hits on a caught moth in 9 runs, though its swoop is clearly on screen every ~14 s.
- The room is short now (median 2:24), but nobody *does* the lesson.

**Fix:**
- **Lures:** the up-right beat from W-throw must land on the far ledge from any orbit position with the stick held
  up-right. Make the arc honest: if it shows short, it *is* short.
- **Level:** narrow the tunnel mouth so a miss lands on a lip, with a hop back to the near ledge, not straight into
  the slow way. The dark way stays a *choice*, entered by a visible door beside the near ledge (the round-3 rule).
- **Creatures:** the hawker's pass should cross the orbit at the moment a *mashing* player is still caught (~0.4 s),
  so a mistimed catch is struck.

### 5. The descent is still under a minute, and its pogo-wick is skipped (level)

**Evidence:**
- Entry to pit 18–61 s (median 41; target ≥ 1:30).
- The pogo-wick snuffed in 3 of 9; caught by it 1–5 times a run. The bots jump *into* it or walk off and are
  grabbed.
- The pockets work (danglers engage).

**Fix:**
- **Make the pogo-wick unavoidable as a down-cut:** the wick sits *below* a lip, so walking off drops her past it
  into the cut window, and its pull is weaker than a fall's speed.
- **Add a third dark glide gap**, and a lit pocket whose landing is the only safe floor, so the descent has three
  beats instead of two.
- **Hold the window 3 s with the camera on the beetle** (it's there; keep it).

### 6. The glade lip loop survives the assist (sim, level)

**Evidence:**
- average s2: 15 catches at the lip in 30 s; skilled s1: 7; casual s1: 5.
- The assist opens the wings. The catch then returns her to the alcove *under* the lip, from which a glide goes down
  into the chasm.

**Fix:** after a chasm catch, return her **on the lip's top, back from the edge**. After 2 catches, show the line
across as a dotted arc (the throw-arc language) from the lip.

### 7. The light/dark rule is now inverted at R8, and absent elsewhere (design, level)

**Evidence:**
- The only real fork in the area (R8) now funnels every miss into the dark way.
- R3 and R4 (no forks, by the revised rule) are fine.
- The dark way never reads as Tatter's road: I saw no Tatter at R8's tunnel mouth on any first visit.

**Fix:**
- Decide whether area 1 keeps the light/dark trade at all.
- **If it does:** R8's tunnel gets its own visible door, and Tatter walks into it once, on the first visit, in frame.
- **If it doesn't:** cut the R8 tunnel to a short retry ramp, and keep the dark way as a post-claws secret.

### 8. The middle predators bite too little, and the R9 beetle now kills (creatures)

**Evidence:**
- **Hawkers:** R8's two hit 1 time in 9 runs. The crown hawker is the only hawker that bites, and it bites in the
  worst place (#1).
- **Dangler:** dang-s1 hit 1 run, dang-s3 hit 1. The root-stair danglers engage but don't hit.
- **R9's composition beetle** (burr-silk) killed 3 runs (avg s1, avg s2, skilled s2: 4–5 hits each). The
  composition beat is now harder than the pit for average players.

**Fix:**
- **R8's hawker A** gets the same rhythm as B, over the hummocks, so the rhythm is taught on safe floor before the
  gap.
- **Danglers drop when she *stops*** (the rule), with a shorter thread delay.
- **R9's beetle** should be a burrback whose patrol stops short of the cut spot's landing, so the composition is
  "land, then snuff" and not a duel.

---

## 8. Answers to the plan's §5 questions

1. **Did they put out W2 by choice?** 6 of 9, from the knob, ~5 s after W1, with the stragglers spinning round it.
   The bots can't say why.
2. **First frame with the oak:** the vista at ~0:45. **First frame with W-ff hung:** the glimpse at 7:20–10:39.
3. **R8:** casual s3 waited 40 s on the near ledge through three passes, then went. It still landed in the tunnel.
   No run took the tunnel because of Tatter; I didn't see Tatter there.
4. **Is the climb one continuous rise with no black?** No black: yes, it's one room. A continuous rise: no. It's a
   rise with 7–39 big falls.
5. **Does the crown hold the hatching tree and the valley in one frame for the whole cloud?**
   - **The hatching tree:** yes, held ~9 s.
   - **The valley:** no; the valley's lights aren't in the frame.
   - **Scale:** the frame is so wide that she and Tatter are specks.
   - **The hawker:** still diving through it.

   Pull the frame in and east, and send the hawker away when the hold starts.
6. **The one-sentence test:** it would pass now, on what is on screen ("climb the big tree"). That is the round's
   biggest win.
