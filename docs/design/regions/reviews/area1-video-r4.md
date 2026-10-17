# Area 1, human-like video review, round 4

2026-10-18. The fourth independent video review of area 1, after round 5's depth pass (`reviews/area1-plan-r5.md`,
commits 642e087 → bfa9412). It uses the same method and bar as r1–r3: Hollow Knight, Ori, Nine Sols and Celeste with
the art removed, and "good for greybox" is a fail.

**Build:** bfa9412, a pinned clean snapshot.

**Command:**
`npm run humanplay -- run --chunk wood-hatch,wood-chase,wood-wicks,wood-burrow,wood-glade,wood-glidewalk,wood-hollow,wood-hawkers,wood-silk,wood-well,wood-rootshaft,wood-rootroad,wood-canopy --upto ''`

That is all 12 area-1 rooms, including the west root road (`wood-rootshaft`, `wood-rootroad`), plus the canopy stub.
"Through" would need every one of those rooms, and no run visited the root road (§2), so no run counts as "through".
I judge the runs by their milestones instead.

**Files:** `playtest-reports/humanlike-2026-10-17T22-49-11/` (gitignored). Every replay that finished rendering
matched the headless state hash.

**What I watched:**
- contact sheets and moments for every run;
- frame sheets of the oak's first visit (casual s2) and of R8 after the far ledge (casual s2);
- a frame sheet of the descent and den (casual s3);
- video cuts at 2–3 pictures per game second:
  - the boss's transition, roll and taproot (casual s3);
  - its staged death (casual s3);
  - the finale at full width (casual s3).

The average and skilled videos were still rendering when I wrote this. Their findings come from their traces and from
the rooms seen in other runs. My cuts are in the scratchpad (`video-review-r4/`).

**How to read the bots.** The usual caveats apply: they explore, chase lamps and don't read text. Two new
harness-side findings are in §8. Neither counts against the game.

---

## Verdict

Round 5 delivered most of the depth pass, and it shows on video:
- **The old burrback is now a real boss in a real place.** The den is under the oak, so its ring and trunk hang over
  the arena. The fight has three visible phases:
  1. the beetle rule, with the anti-camp slam;
  2. a shell that rolls, broken by landing on it or by a throw-cut;
  3. the taproot.

  Its death is staged: it lies down, the plug falls in pieces, the full moon column pours into the den onto the
  wing-layered walls, and "Your claws have hardened" appears in that light.
- **The stalemates are gone.** All 6 fights ended in 31–194 s (median ~46 s).
- **The throw-cut lands** 2–7 times a run.
- **The second reward is felt.** Every boss-fighter crossed 60 moths in R9, before the den. The oak's trunk-foot
  hollow with night eyes was found by 9 of 9 and quick wings by 8 of 9.
- **The oak's first visit is lived:** rest, glimpse, snuff, hollow, about 20 s.
- **Tatter has its beats**, and the finale holds its frame with the HUD faded.

**It is still one journey, and a richer one.** The added ecology (ants carrying wings down, the nest, the beetle that
grew on them, its death letting the moon in, the claws from that moon) reads as cause and effect. The story is no
longer just a sequence.

**Is the boss a peak?** As a set piece, yes. It is the best-staged moment in the area after the finale. As a threat,
not yet:
- 0–6 hits per fight;
- **1 death in the den across 6 fights**;
- on screen the beetle still reads at ~1.5× her height, because the camera frames the whole den and the trunk above
  it.

**Most hits and deaths are elsewhere:**
- the oak's thorn band takes 4–7 hits a run, more than the boss;
- R6's ants killed three runs at T4.

The descent is still short (median ~48 s; target ≥ 1:30). The new crossing, the west root road, was visited by
**0 of 9** runs.

**Fun:** yes, for most of it. The best beats are:
- the vista;
- R3's lesson;
- R6's chain with the throw-cut on its beetle;
- the glimpse and the oak's hollow;
- R8 when timed;
- R9;
- the den;
- the claws in the moonlight;
- the climb;
- the finale.

The flat spots are the descent (still drops), the thorn band, and a boss that never makes anyone careful.

**Against the reference first areas:** closer than r3 on every axis that round 5 targeted. What still stands between
them is **threat, variety and the web being used** (§7).

---

## 1. Numbers

| run | ended | R1–R5 | R6 | oak 1st | R8 | R9 | descent → den | den fight | claws | oak entry → crown | deaths |
|---|---|---|---|---|---|---|---|---|---|---|---|
| casual s1 | finale, then canopy | 4:52 | 2:30 | 14 s | 2:52 | 3:00 | 38 s | 77 s, 6 hits, 1 fade | 15:26 | 1:49 | 2 (den, band) |
| casual s2 | stuck in R8 (harness, §8) | 4:15 | 4:27 | 21 s | 8:09 | – | – | – | – | – | 0 |
| casual s3 | finale, then canopy | 4:40 | 3:37 | 14 s | 1:58 | 2:52 | 36 s | 52 s, 3 hits | 14:52 | 1:15 | 2 (R4, R6 ants) |
| average s1 | finale, then canopy | 3:44 | 3:54 | 16 s | 0:37 | 2:46 | 102 s | 31 s, 0 hits | 13:34 | 1:18 | 3 (R6 ants ×2, band) |
| average s2 | finale, then canopy | 6:18 | 3:19 | 22 s | 3:04 | 2:52 | 59 s | 41 s, 2 hits | 17:38 | 1:07 | 0 |
| average s3 | finale, then canopy | 4:22 | 3:17 | 15 s | 2:46 | 3:18 | 33 s | 194 s, 0 hits | 15:06 | 5:55 | 1 (band) |
| skilled s1 | stuck in R8 (harness, §8) | 6:38 | 8:13 | 13 s | 7:47 | – | – | – | – | – | 1 (R4) |
| skilled s2 | gave up in the stair's catch loop | 4:33 | 3:29 | 14 s | 2:37 | 2:33 | – | – | – | – | 0 |
| skilled s3 | finale, then canopy | 3:39 | 2:44 | 14 s | 3:13 | 3:19 | 58 s | 40 s, 2 hits | 14:48 | 0:53 | 0 |

- **R1–R5** is each run's own total for the first five rooms (median 4:33, range 3:39–6:38).
- **The finale:** 6 of 9 runs reached it. All six then walked into the canopy stub. Their later "lost" is the
  explorer head wandering back for unwalked ground.
- **Deaths:** 9 in total across 9 runs:
  - 3 to R6's ants;
  - 3 on the thorn band;
  - 2 to R4's adult beetle;
  - 1 in the den;
  - 0 in R1–R3.

### Round 3 against round 4

| | r3 (10b5cc9) | r4 (bfa9412) |
|---|---|---|
| reached the finale | 6 / 9 | 6 / 9 |
| boss fight, winners | 13–18 s, 0–1 hits | **31–194 s (median ~46), 0–6 hits** |
| boss stalemates | 2 (249 s, 426 s) | **0** |
| boss phases seen | 1 | slam, roll and unroll in 6 / 6; taproot hits in 3 / 6; staged death in all |
| deaths in the den | 4 (pit) | 1 |
| oak first visit | 15 s | 13–22 s, with the hollow snuff and night eyes |
| 60-moth milestone before the den | – | **6 / 6 boss-fighters** (crossed in R9, 8:38–13:23) |
| hollows: blade / wings / night eyes | – / 8 / – | **0 / 8 / 9** |
| throw-cuts a run | – | 2–7 |
| descent (R10 entry → den) | 38 s | 33–102 s (median ~48) |
| west root road visited | – | **0 / 9** |
| R8 | 3:23 | 2:52 (0:37–3:13 for the runs that left it) |
| hawker hits in R8 | 8 / 9 runs, 1–4; 2 deaths | 3 / 9 runs, 1 each; 0 deaths |
| thorn-band hits (oak) | 1–4 | 4–7 |

---

## 2. The r3 problems: fixed, partly, not

| # (r3) | Problem | Now | Evidence |
|---|---|---|---|
| 1 | The old burrback isn't a peak (15 s, or a standoff) | **Fixed as a set piece; partly as a peak** | See below |
| 2 | A death re-forms her a room back | **Fixed** | Deaths now re-form in their own room. The den's re-form point is P-den at the stair's foot; R4's and R6's are local. No run re-crossed a room after dying. |
| 3 | R8 is lethal for the impatient | **Fixed** | Hawker hits in R8: 3 runs, 1 each, no deaths. The strike knocks her out of the pull. Its swoops still snatch moths on screen (24–271 snatches a run). |
| 4 | The descent is under a minute | **Not fixed** | See below |
| 5 | The oak's first visit is held, not lived | **Mostly fixed** | 13–22 s, now containing rest, glimpse, stone, the trunk-foot bark, a snuff that sends moths up the trunk, and the night-eyes hollow. Everyone does it; it's short only because the bots don't linger. Tatter is small at that zoom. |
| 6 | Combat stays shallow | **Partly** | See below |
| 7 | One currency, finds not felt | **Mostly fixed** | See below |
| 8 | R9's beetle and R6's thorns cost more than the peaks | **Shifted, not fixed** | See below |

1. **The old burrback: fixed as a set piece, partly as a peak.**
   - On video the three phases are readable: braced and ramming, white belly-up, the curl into a rolling shell, the
     blade of light at the transition, then the taproot.
   - Times: 31–194 s; no stalemate; the slam fires against ledge-camping (1–4 times a fight).
   - **But** the fight costs 0–6 hits and 1 fade across 6 fights, and the beetle is still small in a wide frame.
4. **The descent: not fixed.**
   - 33–102 s from R10's entry to the den (median ~48 s; target ≥ 1:30). The nest with its ants, pockets and
     danglers is crossed in ~10 s.
   - skilled s2 fell into the stair's catch zone 33 times in two minutes (x 7988–9372), then gave up.
   - The pogo-wick is snuffed in some runs, but the line still reads as "drop".
6. **Combat: partly.**
   - **New:** carriers (ants) on trails in R6, R9, the nest and the oak's foot; the throw-cut (2–7 a run); the
     boss's three phases.
   - **Still:** 4 kinds. The ants bite on contact and killed three runs at R6's T4, which is the throw-cut lesson's
     landing. Fodder shouldn't be lethal in the teaching room for a new verb.
7. **Finds: mostly fixed.**
   - **Working:** the 60-moth milestone landed before the den for every boss-fighter, and the x / 60 HUD reads.
     Night eyes was found by 9 of 9 and quick wings by 8 of 9.
   - **Not working:** keen blade (R4, behind the door's bark pocket) was found by **0 of 9**, so act 1's hollow is
     invisible.
8. **Costs: shifted, not fixed.**
   - **Better:** R9's beetle hits 1–3 times and kills nobody.
   - **Worse:** R6 is now where runs die (3 to ants, plus thorns), and the oak's thorn band takes more hits (4–7)
     than the boss (0–6).
   - Deaths still don't cluster at the peak (C9).

---

## 3. The shape targets

| Stretch | Target | Bots: median (range) | Result |
|---|---|---|---|
| R1–R5 | ≤ 6:00, nothing over 3 tries | 4:33 (3:39–6:38) | Pass (8 of 9) |
| R6 | ≥ 2:30 | 3:29 (2:30–8:13) | Pass |
| The oak, first visit | lived, ~30–40 s | 13–22 s | **Partly**: lived, but short |
| R8 | ≤ 3:00 | 2:52 | Pass |
| R9 | 2:30–4:00 | 2:52 (2:33–3:19) | Pass |
| The descent | ≥ 1:30 | ~0:48 (0:33–1:42) | **Fail** |
| The den | 45–120 s; casual ≥ 45 s on try one; ≤ 4 fades; no stalemate | 31–194 s; casual 52 s and 77 s; ≤ 1 fade; 0 stalemates | **Pass on time; too easy** |
| The climb (oak entry → crown) | ~2:30–4:00, no fall over 600 px | 0:53–1:49 (average s3: 5:55); falls ~600–670 px | Pass (fast) |
| The crown | ≥ 9 s | 9 s | Pass |

---

## 4. The experience timeline

The reference run is casual s3 (finale at 16:38). Average s1 is the fast variant.

| min | doing | wants / feels | flow |
|---|---|---|---|
| 0:00–1:00 | Hatch, branch, chase, the vista with the oak | "Follow them to the tree" | **Sings** |
| 1:00–2:40 | R3: the first catch shows "hold a direction"; W1 and W2 snuffed | Learned | Good |
| 2:40–4:00 | R4: the juvenile; the adult rams the step and flips on its own (the rule shown); the up-right throw to the high far ledge; the bark floor. The door's bark pocket (keen blade) goes unnoticed | "I see how beetles work" | Good |
| 4:00–4:40 | The glade, glide | Joy | Good |
| 4:40–8:20 | R6: glides; the beetle at T4 under W6 (the throw-cut's lesson; ants on its landing); the chain toward the oak's door | Flight, plus a heavy hit that flips the beetle. Ants bite and kill in 3 runs | **Sings** (a sour note at T4) |
| 8:20–8:35 | The oak: rest, the glimpse, the stone, the trunk-foot bark, a snuff sending moths up the trunk, the night-eyes hollow, Tatter | "The tree has secrets; Tatter knows them" | Good, brisk |
| 8:35–10:30 | R8: the hummocks' hawker teaches the rhythm; the raised far ledge by a timed throw; quick wings behind the bark (the ants' trail leads there) | Tension, then reward | Good |
| 10:30–13:24 | R9: the dangler's swing tell, the fenced pair, the ants' trail to the bark floor. **60 moths: +1 light** | Competence and a gift | Good |
| 13:24–13:59 | The descent: the stair, the pogo-wick, chute catches, the nest's two pockets, the window | Over in 35 s | Too short |
| 13:59–14:51 | **The den.** The beetle under the oak's ring; rams into walls, belly-up, cuts; a blade of moonlight through the plug; the roll, broken by landing; the taproot; it lies down, the plug falls, the moon pours in on walls of wings: **"Your claws have hardened"** | Rising, then awe | **Sings** (as staging) |
| 14:51–16:38 | Claws; up the moon column into the oak (one fade); the climb (band hits; W-ff by choice; the crown wick under its hawker) | A real rise | Good |
| 16:38–16:47 | **The finale:** HUD faded; the cloud of 95 lifts; the hatching tree west; the valley east; Tatter beside her | Release | **Sings** |

---

## 5. One journey?

**Yes, and more coherent than r3.** The new chain is:

> ants carry the dead down → the nest → the beetle grew huge on them under the oak → its death breaks the floor →
> the moon pours in → claws.

Each step is on screen in order. The den sits directly under the oak's ring, so the boss happens *in* the tree's
foundation, and she climbs out up the same moon column the glimpse showed.

**What still doesn't join:** the **west root road** is the second crossing that was meant to make the floor and the
roots a web. Nobody found it. It's reached from the nest, which she passes before she has claws, and after the boss
every run goes straight up the column. So the area is still played as a line with one loop.

## 6. Is it fun?

**Yes, for most of it:**
- **The den** is now a genuine reason to keep playing.
- **The throw-cut** gives R6 and R9 a new verb to play with.
- **The milestone** pays the finds off before the fight.

**Where it isn't, and what does it better:**
- **The boss never threatens.**
  - *False Knight* kills a first-timer once or twice. It hits hard enough that the jump over its mace feels earned.
  - *Ours* costs 0–6 hits and 1 death across six fights. Its first two rams are slowed, its phase 1 is the rule
    they've already used twice, and the camera keeps it small.
- **The descent.**
  - *HK's Crossroads entrance* is a place with enemies on the way down.
  - *Ours* is 35–60 s of drops, and the nest is passed in seconds.
- **R6's T4 is both the throw-cut lesson and an ant trap.**
  - *Celeste* teaches a new mechanic in a safe room and tests it later.
  - *Ours* teaches with three creatures on one landing.

---

## 7. Is area 1 approaching the reference first areas, art aside?

**Where it now meets the bar (the Sunken Glades, King's Pass plus the Crossroads):**
- **Through-line, centre and staging.** The oak is our Spirit Tree. The vista, the glimpse, the den's death and the
  finale are held scenes.
- **A signature verb developed into a combat use.**
  - The throw, taught in R3 and R4, chained in R6, timed in R8.
  - The throw-cut makes it a weapon from R6.
  - The boss's roll phase asks for it.
  - That is HK's nail-to-pogo ladder in our own language.
- **A first boss staged as a reveal.** It is set up from above (the breathing under the mesh), rehearsed (the beetle
  rule in R4 and R6), and paid off as a world change (the plug falls, the moon comes in, the claws).
  - Structurally this is False Knight's job done.
- **A second reward that pays inside the area:** hollows plus a milestone before the boss.
- **Ecology:** four creatures, each with a reason to be where it is.

**What still stands between it and that bar:**
1. **Threat.**
   - The area is easy: 0–3 deaths per run, 1 in the boss across six fights, and none of the deaths at the peak.
   - The references' first areas make you careful at least twice: HK's first Vengefly and False Knight; Ori's
     Spirit Tree climb and the Ginso approach.
   - *The fix is tuning, not content:*
     - the boss at full speed after its first try;
     - its phase 3 at real pace;
     - the camera close on it;
     - thorns and ants calmed in the teaching rooms, so the deaths move to the den and the crown.
2. **Variety in the minute-to-minute.**
   - Four creature kinds is Ori's first-hour count, not HK's.
   - In grey, R4, R9, the descent and the oak's interior still read as boxes on boxes. Nothing in them is a shape you
     would remember.
   - HK's first 45 minutes have 8–10 kinds and a memorable silhouette in every room.
3. **The web, used.**
   - The second crossing exists but is unseen (0 of 9).
   - Until a first-timer *takes* a second way between the floor and the roots, the area is a line with one loop.
   - The Crossroads works because you cross it four times by different doors.
4. **People.** Tatter now has an act (the hollow) and a look (the crown). That is the right size for this game, but
   at the current zoom it is barely visible in either beat. Our first area has no Quirrel-like second character.
5. **Finds you'd go back for.**
   - The keen-blade hollow was found by nobody, and there is no visible lock you'd come back for with the claws.
   - The west road was meant to be that lock, but you never see it from the critical path.

**Honest summary.** Structurally and narratively, area 1 is now a peer of a reference first area in greybox. It has
the want, the centre, the arc, a staged first boss that changes the world, a developed signature verb, and a second
reward. What separates it from Sunken Glades or King's Pass is **feel-level difficulty, room identity in grey, and a
web the player actually crosses**. That is a tuning and level-dressing round, not a design round.

It is also the point where bots stop being able to judge. **Matt's play of this build is the next real gate.**

---

## 8. Harness findings (not counted against the game)

- **R8's east exit.** casual s2 and skilled s1 reached the far ledge and quick wings (7:39, 11:25), then never took
  exit `e` ("not reached in 45 s", repeated). They walked back west and wandered for 8–13 minutes. Every other run
  left R8 east normally, and in r3 all nine did. This is likely the planner's new wall reading (698363d, 72ea9d5)
  meeting the trunk stub over the east exit (`trunk` 3776, y 448–768). A person would walk out.
  - **Harness owner:** check `map.ts` against R8's east end.
  - **Level owner:** confirm the exit's doorway reads.
- **The crown/canopy seam bounce.**
  - After the finale, casual s3 crossed between `wood-hollow` and `wood-canopy` **190 times in 3.5 min**, every
    ~0.4 s, each crossing a full fade: 208 black stretches in that video.
  - It's head-driven, but the plan's seam hysteresis (r5 item m) clearly doesn't apply at this seam. A player who
    turns back at the canopy edge would see a double fade.
  - **Owner:** sim (apply the hysteresis to every seam).

---

## 9. The 8 worst problems now, ranked

### 1. The boss is staged but not dangerous (creatures, camera)
- **Evidence:**
  - 0–6 hits and 1 fade across 6 fights.
  - Casual players won in 52 s and 77 s.
  - On screen the beetle is ~1.5× her height in a frame that shows the whole den and the trunk ring above.
- **Fix:**
  - After the first try, its first rams are at full speed. Today they are slowed for the first two of each try.
  - Phase 3's three rams come at real pace.
  - The slam does 1 pip if she's on the floor in its wave.
  - The camera zooms in during phases 1–3 so the beetle is ≥ 2.5× her height (the plan's target), and pulls out
    only for the death.
- **Target:** casual 1–3 fades, skilled 0–1, fight 60–120 s.

### 2. The descent is still drops (level)
- **Evidence:**
  - 33–102 s (median ~48; target ≥ 1:30).
  - The nest is crossed in ~10 s.
  - skilled s2 looped 33 catches in the stair's catch zone and gave up.
- **Fix:**
  - Make the nest a room-sized beat she must *do* something in:
    - its exit west is behind a bark plug the ants pass through (cut it);
    - its floor carries their trail;
    - two lit pockets, each with a dangler over the landing.
  - The stair's catch zone returns her to the ledge she fell from, never to one she'll fall off again.

### 3. The west root road is never found (level, staging)
- **Evidence:** 0 of 9 runs visited `wood-rootshaft` or `wood-rootroad`. The nest's shaft west is passed before the
  claws, and after the boss every run climbs the moon column.
- **Fix:**
  - Show the lock *on the way up*: the moon column's climb passes the root road's mouth, where ants climb in and
    moonlight leaks.
  - Or put R5's bark floor panel on R5's critical path, so act 1 walks over it ("ants vanish into it") and the claws
    remind her.
  - Then give the road its own find (the keen-blade hollow could move there).

### 4. The oak's thorn band hurts more than the boss (level)
- **Evidence:** 4–7 hits a run in the runs that climbed (the most-hit hazard in the area) and 3 of 9 deaths. The boss: 0–6 hits, 1 death.
- **Fix:** shorten the band by a third again, or put a foothold under its middle. The climb's tension should come
  from the crown wick's hawker, not from a wall of thorns.

### 5. R6's T4 teaches the throw-cut on a landing with ants (creatures, level)
- **Evidence:** ants killed 3 runs at T4 (ants-ledge-1/2/3). That landing also holds the beetle the throw-cut is meant
  to flip.
- **Fix:** move the ants' trail off T4 to R6's floor pocket. Teach the throw-cut with the beetle alone, and bring
  ants with a beetle back in R9.

### 6. Act 1's hollow is invisible (level, staging)
- **Evidence:** keen blade (R4, behind the door's bark pocket) found by 0 of 9. Night eyes 9 of 9, quick wings 8 of 9.
- **Fix:** use the signposts the plan defined: moonlight leaking through the pocket's cracks, visible from the door,
  and one straggler circling it. Or put an ant trail to it, as R8's leads to quick wings.

### 7. Seams still strobe (sim)
- **Evidence:** casual s3 crossed the crown/canopy seam 190 times, each a full fade. One black frame still appears at
  the den → oak column change.
- **Fix:** apply the hysteresis (r5 item m) to every seam: a re-entry within 20 frames doesn't fade, and an exit fires
  only 64 px past the edge.

### 8. Tatter's beats are too small to see (camera, staging)
- **Evidence:** in the oak's hollow and at the crown, Tatter is a few pixels at the beats' zoom. The finale frame
  shows her and something beside her. The crown's "look" and "walk ahead" can't be read at 960 px.
- **Fix:** frame Tatter's two beats closer. Zoom to Tatter at the hollow's entrance, and at the crown frame her and
  Tatter in the lower third before pulling out for the cloud.

---

## 10. Answers to the plan's questions (round 5)

1. **Is the den the peak?**
   - In memory: yes, the best-staged moment after the finale.
   - In time: yes, 31–194 s.
   - In deaths: no, 1 in six fights.
2. **"The ants go somewhere": did anyone follow a trail on purpose?**
   - The bots can't say.
   - Trails led 8 of 9 to quick wings and 9 of 9 to the oak's hollow, but those are also on their exploring route.
3. **The throw-cut without being told:** 2–7 a run after R6, but bots don't choose it; they cut whenever thrown. Only
   a first-timer can answer this.
4. **60 moths before the den, and the +1 noticed:** every boss-fighter crossed 60 in R9. The +1 light shows in the
   HUD.
5. **Does the crown read as "we go on together"?** Tatter is there, but too small to read (#8).
6. **Still one journey?** Yes, and the ecology chain makes it a better one.
