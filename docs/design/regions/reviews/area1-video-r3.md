# Area 1, human-like video review, round 3

2026-10-18. This is the third independent video review of area 1, after round 4 (commits 57eee9a to 10b5cc9). It
uses the same method as r1 and r2 (`area1-video-r1.md`, `area1-video-r2.md`) and holds the same bar: Hollow Knight,
Ori, Nine Sols and Celeste with the art removed. "Good for greybox" is a fail.

**Build and command.** I ran build 10b5cc9 (pinned clean snapshot) with:

`npm run humanplay -- run --chunk wood-hatch,wood-chase,wood-wicks,wood-burrow,wood-glade,wood-glidewalk,wood-hollow,wood-hawkers,wood-silk,wood-well,wood-canopy --upto ''`

A run counts as "through" when it reaches the canopy stub by the crown's exit. All replays I checked matched the
headless state hash.

**Files.** `playtest-reports/humanlike-2026-10-17T21-02-52/` (gitignored).

**What I watched.** Contact sheets and moment stills for every run, plus video or frame cuts of these moments:
- the oak's first visit (casual s3);
- R8 in two runs: casual s1 timing its throw, and skilled s1 struck to death;
- the descent and pit (casual s1);
- the pit stalemate (casual s3);
- the whole climb and the finale at full width (casual s1).

Black frames were counted with `ffmpeg blackdetect`. My cuts are in the scratchpad (`video-review-r3/`). The
skilled videos were still rendering while I wrote this. Their findings come from their traces and from frames of the
rooms they share with the other runs.

**How to read the bots.** The same caveats apply as before, plus one new one:
- **Explorers.** The bots chase every lamp and every patch of unwalked ground. After the finale three runs (average
  s1, skilled s1, skilled s2) went back down the trunk for unwalked ground and were scored "lost". They had all seen
  the finale, so that is head, not game.
- **No sense of rhythm.** The bots don't model learning a rhythm. A skilled bot jumps into R8's lamp whenever it
  plans to, regardless of the hawker. Its deaths there are partly head.

---

## Verdict

Round 4 fixed the climb, which was the r2 wall:
- All 6 runs that got the claws reached P5 in 2:00–2:36.
- Each fall was stopped after 0–3 drops of ~600 px.
- W-ff is snuffed in 3 of those 6 runs, by choice.

The finale is complete. In one frame she stands at P5 with the cloud of her moths lifting, the hatching tree to the
west, the valley's lights to the east, and the hawker sent away.

Several other r2 problems are fixed too:
- The predators bite at their moments now. R8's hawker hits in all 9 runs, the danglers swing and hit, and the
  juvenile is fodder.
- The glade-lip loop is gone (at most 4 catches).
- The oak's first visit holds 15 s instead of 10.

**It is one journey, and from the vista to the crown it reads as one.**

What breaks it now is **the old burrback**. In 2 of 9 runs it never ended:
- 249 s and 426 s of stalemate. She stands on the one-way escape ledge, and the beetle waits beneath, neither
  attacking nor wandering.
- In the other 7 runs it died in 13–18 s with 0–1 hits taken.

So the area's one boss is either a non-event or a standoff, and neither is a peak. R8 has also swung from toothless
to lethal for an impatient player: skilled s1 and s2 were struck 4 times while caught and died, which sent them back
into the oak. The descent is still under a minute.

**Fun:** yes, in most of it now. The best stretches are the vista, R3's first snuffs, R6's flight and chain, the
glimpse, R8 when timed, R9, the claws, the climb and the crown. The weak spots are the pit and an impatient R8.

**Is it approaching the reference first areas in everything but art?** In *structure and staging*, yes: it now has
King's Pass and Sunken Glades' shape. In *depth*, no. §7 says what stands in the way.

---

## 1. Numbers

| run | ended | time | R1–R5 | R6 | oak 1st | R8 | R9 | R10 | claws | claws→P5 | deaths |
|---|---|---|---|---|---|---|---|---|---|---|---|
| casual s1 | **through** | 20:07 | 6:06 | 3:33 | 15 s | 2:24 | 2:11 | 1:46 | 15:36 | 2:01 | 1 (R6 thorns) |
| casual s2 | gave up in R9 (head: never took the bark panel) | 21:50 | 5:14 | 4:23 | 15 s | 7:45* | 3:51 | – | – | – | 1 (R9 beetle → re-formed in the oak) |
| casual s3 | gave up in the pit (**stalemate**, 426 s) | 20:00 | 3:53 | 3:11 | 15 s | 2:12 | 2:50 | 7:37 | – | – | 3 (pit) |
| average s1 | finale, then lost (head) | 21:57 | 3:38 | 2:14 | 15 s | 3:43 | 4:19 | 1:31 | 15:06 | 2:03 | 1 (R9 dangler) |
| average s2 | gave up in the pit (**stalemate**, 249 s) | 21:37 | 4:53 | 4:43 | 15 s | 3:23 | 2:39 | 5:41 | – | – | 3 |
| average s3 | **through** | 16:53 | 4:27 | 2:30 | 15 s | 3:39 | 2:42 | 1:46 | 14:22 | 2:20 | 0 |
| skilled s1 | finale, then lost (head) | 22:53 | 4:50 | 2:29 | 15 s | 2:14 | 2:49 | 2:02 | 14:02 | 1:59 | 2 (incl. **R8 hawker**) |
| skilled s2 | finale, then lost (head) | 25:10 | 5:04 | 2:26 | 15 s | 2:32 | 2:29 | 2:13 | 14:06 | 2:17 | 1 (**R8 hawker**) |
| skilled s3 | **through** | 25:29 | 6:15 | 3:06 | 15 s | 3:55 | 2:29 | 1:38 | 16:51 | 2:36 | 1 |

\* casual s2's R8 total includes two returns. A fade in R9 re-formed it at the oak's P3 (its last rest), so it
crossed R8 again.

**Outcomes.** 6 of 9 runs saw the finale and 3 exited. Three runs failed before the claws:
- casual s3 and average s2: the pit stalemate;
- casual s2: R9 and a re-cross of R8.

### Round 2 against round 3 (medians)

| | r2 (8780dfa) | r3 (10b5cc9) |
|---|---|---|
| reached the finale | 6 / 9 | 6 / 9 |
| claws → P5 | 1:08–7:16, 2 never | **2:00–2:36, all 6** |
| big falls (> 600 px) before P5 | 7–39 a run | **0–3, each ~600–700 px** |
| W-ff snuffed | 1 / 9 | 3 / 6 reaching it |
| oak first visit | 10 s | 15 s |
| R6 | 3:17 | 3:06 |
| R8 | 2:24 (via the tunnel) | 3:23 (2:12–3:55, ignoring casual s2's returns) |
| R8 hawker hits on a caught moth | 0 / 9 | **8 / 9 runs, 1–4 each**; 2 deaths |
| R10 entry → pit | 41 s | 38 s (25–57) |
| pogo-wick snuffed | 3 / 9 | 4 / 8 |
| pit, winners | 15–28 s | 13–18 s, 0–1 hits |
| pit, stalemates or quits | 1 quit (7 fades) | **2 stalemates** (249 s, 426 s) |
| glade-lip catches, worst run | 15 | 4 |
| juvenile hits | 4 / 9 | 4 / 9 (1 each; killed in all 9) |
| full-black stretches in a run | 12 | 14–16 (room changes) |

---

## 2. The r2 problems: fixed, partly fixed, not fixed

| # (r2) | Problem | Now | Evidence |
|---|---|---|---|
| 1 | The oak climb is the new wall | **Fixed** | Every claws run reaches P5 in 2:00–2:36 with 0–3 falls of ~600 px. W-ff is a choice: 3 of 6 snuff it, and nobody is grabbed 35 times. The crown is now its own last beat: a timed wait under the crown wick with its hawker (~40 s, 1–3 hits), then the finale. On video it is one rising climb. |
| 2 | The pit kills a casual in 11–15 s | **Fixed, then overshot** | Nobody dies in 11–15 s now; deaths in the pit fell to 0–3. But winners take 13–18 s with 0–1 hits (no exam), and two runs **stalemate** for 249 s and 426 s on the escape ledge. The beetle idles beneath her; the bot logs "let it be: 10 s, nothing dealt or taken" a dozen times. |
| 3 | The oak's floor is a doorway (10 s) | **Partly** | 15 s in all 9 runs (target ≥ 25). P3 now prompts "be still to rest", the glimpse plays, and Tatter's look-up holds the camera at the trunk's foot. It is a held beat, not yet a place: the moth-stone is read in passing and the arch opens as soon as the look-up ends. |
| 4 | R8's twist doesn't fire | **Fixed, maybe too hard** | The far ledge is raised and the miss lands on a retry ramp. The hawker teaches its rhythm over the hummocks: casual s1 snuffed wick-hawk under its swoops, waited on the ramp through two passes, then threw onto the far ledge first try. Hawk-throw hits in 8 of 9 runs. But skilled s1 and s2 died there (4 strikes in ~36 s while caught: a strike, then a re-catch, then another strike) and re-formed in the oak, a room back. R8's median rose to 3:23. |
| 5 | The descent is under a minute | **Not fixed** | 25–57 s from entry to the pit (median 38; target ≥ 1:30). The pogo-wick is snuffed in 4 of 8; the rest are caught by it or pass it. The root curtains and glide gaps read as "drop, drop, drop" on video. |
| 6 | The glade-lip loop | **Fixed** | 1–4 catches a run. |
| 7 | The light/dark rule inverted at R8 | **Partly** | The tunnel has its own hatch door and a miss lands on the ramp, not in the dark. 6 of 9 still cross by the tunnel, mostly after a failed throw. I did not catch Tatter vanishing into it on any first visit in the frames I checked. |
| 8 | Predators bite too little; R9's beetle kills | **Mostly fixed** | Hawkers bite (R8 in 8 of 9, the crown in 5). Danglers bite at cut spots and landings (dang-s1, s3, chute, knot). R9's beetle still hits 1–3 times in every run and killed casual s2. |

---

## 3. The director's shape targets

| Stretch | Target | Bots: median (range) | Result |
|---|---|---|---|
| R1–R5 | ≤ 6:00, nothing over 3 tries | 4:53 (3:38–6:15) | **Pass**: 7 of 9 in time, no loop over 4 |
| R6 | ≥ 2:30 | 3:06 (2:14–4:43) | Pass |
| The oak, first visit | ≥ 25 s | 15 s (all 9) | **Fail** (was 10 s) |
| R8 | ≤ 3:00 | 3:23 (2:12–3:55) | **Fail**: hawker strikes and re-tries |
| R9 | 2:30–4:00 | 2:42 (2:11–4:19) | Pass |
| Act 3 to the pit | ≥ 1:30 | 0:38 (0:25–0:57) | **Fail** |
| The pit | 0:30–2:00 | 13–18 s (winners); 249 s and 426 s (stalemates) | **Fail** at both ends |
| The climb | 2:30–4:00, no fall over 600 px | 2:00–2:36; falls stop at ~600–700 px | Pass (a little fast) |
| The crown | ≥ 9 s | 9 s, all 6 | Pass |

---

## 4. The experience timeline

The reference runs are casual s1 (through, 20:07) and average s3 (through, 16:53, 0 deaths). Skilled s3 (25:29) is
noted where it differs.

| min (casual / avg) | doing | wants / feels | flow |
|---|---|---|---|
| 0:00–0:58 / 0:00–0:54 | Hatch; the branch; the chase; the vista: LAMPFALL by the moon, the oak beside it, stragglers peeling toward it | "Follow them to the tree" | **Sings** |
| 0:58–2:53 / 0:54–1:58 | R3: she lands outside W1, sees the dead moth and the stragglers, snuffs W1 and (avg) W2 from the knob. Casual stands ~50 s in the dip (head) | "Lights trap moths; I free them" | Good |
| 2:53–5:43 / 1:58–4:03 | R4: the juvenile dies in 2 cuts, W3 from the step, the adult, the gap throw, P1, the bark floor | Competent; a little long | OK |
| 5:43–6:06 / 4:03–4:27 | The glade: glide; at most a catch or two at the lip | Joy | Good |
| 6:06–9:40 / 4:27–6:57 | R6: glides, the bend, T4, the lamp chain over the chasm toward the oak's door. Casual takes one fade on gap 2's thorns | Flight; the goal growing | **Sings** |
| 9:40–9:55 / 6:57–7:12 | The oak: "be still to rest"; the glimpse up the trunk (firefly, W-ff hung); the stone; Tatter's look-up held at the trunk's foot; the arch opens | Awe, then "let's go" | Good, still brisk |
| 9:55–12:20 / 7:12–10:52 | R8: hawker A swoops through wick-hawk over the hummocks (she snuffs it under the swoop), then the gap. She waits on the ramp through passes and throws onto the raised far ledge. Average s3 crosses by the tunnel after a miss. **Skilled s1 and s2 mistime 4 catches, are struck and die, re-form in the oak, and re-cross** | Tension and payoff when timed; punishing when not | Good / harsh |
| 12:20–14:31 / 10:52–13:34 | R9: dangler swing and drop, two snuffs, the fenced beetle and dangler pair (1–3 hits), the bark panel | Competence | Good |
| 14:31–15:17 / 13:34–14:00 | The descent: glide gaps into the dark, chute catches, a dangler swing hit, the pocket snuff, the window on the old burrback asleep | Over too soon | Too short |
| 15:17–15:32 / 14:00–14:18 | **The old burrback: 15 s, 0 hits, dead.** Casual s3 and average s2 instead stand on the escape ledge for 4–7 minutes while it waits below | Winners: "was that it?" Stalemates: nothing happens | **Anticlimax / dead stop** |
| 15:32–16:20 / 14:18–14:50 | Claws; the climb-out (~40 s searching glade 2 for the way up); through the mesh | Earned | **Sings** |
| 16:20–17:37 / 14:50–16:42 | The climb: rest ledge, W-ff (casual snuffs it from the bridge), the knot, the band, then **~40 s under the crown wick** with its hawker (3 hits for casual) and the snuff | A real rise; the last beat is a tense wait | Good |
| 17:37–17:47 / 16:42–16:53 | **The finale:** P5, the cloud of 90 lifting, the hatching tree west, the valley's lights east, the hawker gone | Release. It lands | **Sings** |

---

## 5. One journey?

**Yes.** Every set-up I listed in r1 now pays off on screen:
- the crown ring seen at 0:45 is where she stands at 17:40;
- the oak grows in every backdrop;
- the glimpse shows the light she later snuffs;
- the descent passes under the trunk;
- she climbs out through the oak's own floor;
- the finale looks back west to where she hatched and east to where she is going.

A viewer could retell it in one sentence: "I fell into the woods after the swarm, walked to the giant tree, went
down under it, beat a beetle, and climbed out the top to set the moths free."

Two things still break the line:
1. **The pit is not a peak.** It's 15 s, or it's forever.
2. **Death re-forms her a room back.** A fade in R8 or R9 re-forms her at the oak's P3, her last rest, and the bots
   don't rest at R8's P-dark. Two runs re-crossed R8 because of it. The rule "re-form at or below" exists in the oak.
   R8 and R9 need their own re-form points, as the pit has P-chute.

## 6. Is it fun?

Mostly, yes. I count ten good beats in ~17–20 minutes:
1. the vista;
2. R3's six-second lesson;
3. R6's flight and chain;
4. the glimpse;
5. R8 when timed;
6. R9's dangler;
7. the claws;
8. the climb's rise;
9. the crown wick wait;
10. the finale.

Where it isn't fun, and what does it better:
- **The pit.**
  - *HK's False Knight* gives a first-timer a staged, readable 60–120 s fight that ends with a reveal: the maggot
    inside the armour.
  - *Ours* is either a 15 s pogo-down or a standoff.
- **The descent.**
  - *Ori's Moon Grotto* entrance and *HK's well drop into the Crossroads* make "down" a place, with things to do on
    the way.
  - *Ours* is 38 s of drops.
- **R8 for an impatient player.**
  - *Celeste*'s timing rooms kill you and put you 2 s back.
  - *Ours* costs 4 pips and a room.

---

## 7. Is area 1 approaching the reference first areas, art aside?

Measured against Sunken Glades (Ori) and King's Pass + Forgotten Crossroads (HK), the quality bar's §1.5 teardown:

**Where it is at or near the bar:**
- **A through-line and a centre.** The oak is our Spirit Tree, seen from the vista, held in the backdrop, climbed at
  the end. Dirtmouth-and-the-well clarity, achieved.
- **A signature mechanic, developed.**
  - The lamp: caught, thrown, snuffed.
  - It is taught in R3, developed in R4 and R6 (the chain), twisted in R8 (the hunter's rhythm), and concluded at W-ff
    and the crown wick.
  - That is a Celeste-grade ladder, and the bash-like throw is a genuinely good verb.
- **Set pieces.** The vista, the glimpse, the claws and the finale are staged with holds and framing. That is Ori's
  standard for a first area's beats.
- **Movement.** Glide, then claws, then the climb that uses both, with each ability paying off within minutes.
- **One predator per moment of the verb.** This is a clearer ecology than Ori's first hour.

**Where it is clearly below the bar:**

1. **The boss.** False Knight is a set-piece fight with phases, arena destruction and a reveal. Ours is a beetle with
   one attack that is either trivial or a standoff. *No first area in the references ends act 3 this flat.*
2. **Combat depth and enemy count.**
   - HK's first 45 minutes have 8–10 enemy kinds and fodder in every other room. Ours has 3 predators and 2 beetle
     rows.
   - Fights are mostly avoided or snuffed away.
   - The blade has no development (no upgrade, no new use) beyond the pogo.
3. **Finds and rewards.**
   - HK pays every 40 s in the pass and every 2–3 minutes in the Crossroads, in five currencies. Ori pays every
     ~2 minutes in three kinds of cell.
   - Ours has one kind: lamp moths. There is one upgrade (quick wings), and the health milestone falls outside the
     area for most players.
   - No run *noticed* a secret on video. There is nothing a first-timer would go back for except more lamps.
4. **The world as a place.**
   - The Crossroads is a web you learn, with a bench, a map seller and three ways out.
   - Ours is a line with one loop under the oak, one shortcut (the mesh), and doors that open in order.
   - No room offers a meaningful choice of where to go next.
   - The dead ends and the back-way return west (claws into R3–R5) are untested by anyone on video.
5. **People.**
   - HK's first hour has Elderbug, Quirrel and Cornifer; Ori has Naru, Sein and Gumo.
   - We have Tatter, who now walks, looks up and climbs, but never *does* anything that changes the play.
   - Nobody speaks; the firefly is a light.
6. **Room craft at the minute scale.**
   - In grey, too many rooms read as boxes on boxes. Inside the oak especially, the readable shapes are the lamps and
     the red bands; the walls are rectangles.
   - HK's greybox rooms (its devs' own) would still each have one memorable silhouette.
   - We have that at the vista, the oak and R8. R4, R9 and the descent don't.
7. **Length and density.**
   - At ~17–25 minutes for the bots and an estimated ~25–35 for a person, the length is right.
   - But "something new every 3–5 minutes" holds only up to the pit. From the pit to the finale it is climb, climb,
     climb, the same verbs with no new one.

**Honest summary.** Area 1 now has the *shape* of a reference first area: the want, the centre, the arc, the payoffs.
It does not yet have the *density*: enemies, finds, a boss, people, a place you learn. On the quality bar's rubric I
would expect it to pass most of the chunk items (C1, C4, C5, C6, C10, C11, C12) and fail on:
- **C2:** challenge types and combinations, thin in combat;
- **C3:** finds, one currency, secrets not felt;
- **C13:** first-boss setup and fight;
- **C9:** deaths cluster in R6 and R8, not at the peaks.

This is not "polish away" from Sunken Glades or King's Pass. It needs a real boss, a second kind of reward, and two
or three more creature kinds that compose with the lamp, before it is a peer in everything but art.

---

## 8. The 8 worst problems now, ranked

### 1. The old burrback is not a peak: 15 s or a standoff (creatures, level, staging)

- **Evidence.**
  - Winners: 13–18 s, 0–1 hits.
  - casual s3: 426 s and average s2: 249 s of stalemate. She stands on the one-way escape ledge and the beetle idles
    below.
  - 2 of 9 runs ended there.
- **Fix.**
  - **The beetle must act when she camps.** After ~3 s under a ledge it rears and slams the floor (a shockwave up the
    walls, or the ledge shakes her off), so the ledge is a breather and not a home.
  - **Give it a second phase.** At half health its shell cracks and it starts rolling (a moving hazard to jump), or it
    digs and surfaces under her: something the beetle rows never showed.
  - **Stage a reveal at the end.** The moth wings it ate pour out, and the carpet lifts as moths that join her cloud.
  - **Target:** 45–120 s for winners, no stalemates, 0–3 fades for casual players.

### 2. A death re-forms her a room back (sim, level)

- **Evidence.** Deaths in R8 (skilled s1, s2) and in R9 (casual s2) re-formed them at the oak's P3. They then
  re-crossed R8, the room that had just killed them. casual s2 never recovered.
- **Fix.** Every critical-path room re-forms her in that room (its own `reform` point, as the pit has P-chute). R8's
  is at the near ledge's ramp and R9's at its west door. The "last patch" rule applies only to patches in the same
  room.

### 3. R8 is lethal for an impatient player (creatures, lures)

- **Evidence.**
  - 4 strikes in ~36 s killed two skilled runs.
  - The video shows strike → re-catch → strike, because after a strike she falls back into W-throw's pull.
  - Median 3:23 (target ≤ 3:00).
- **Fix.**
  - A strike should knock her *out* of the pull, down to the ramp, and give her 2 s of no re-catch.
  - A strike costs 1 pip, but never 2 strikes within one pass.
  - Keep the rhythm, which reads well when timed.

### 4. The descent is still under a minute (level)

- **Evidence.** 25–57 s (target ≥ 1:30). The pogo-wick is snuffed in 4 of 8. On video it is a run of drops.
- **Fix.**
  - Give the descent a **place in the middle**: a lit pocket wide enough to be a room beat. For example, a dangler
    and a wick over the only landing, and the stragglers' bodies on the floor below (story).
  - The pogo-wick over a pit with no ledge under it, so the down-cut is the only way on.
  - The window held longer, as the act's pause.

### 5. The oak's first visit is held, not lived in (staging, level)

- **Evidence.** 15 s in all 9 runs (target ≥ 25).
- **Fix.**
  - Make the moth-stone part of the beat: reading it is what opens the arch, not the look-up.
  - Let Tatter walk her to the arch.
  - Give the floor one small thing to do: a dead-end hollow in the trunk's foot with a lamp to snuff, so the first
    snuff in the oak sends moths spiralling up the trunk in frame.
  - This also answers "the oak, every visit": the more she frees, the brighter the column.

### 6. Combat stays shallow: few kinds, no blade development (creatures, design)

- **Evidence.**
  - 3 predators and 2 beetle rows in the whole area.
  - Most encounters end in a snuff that sends the creatures away.
  - The blade's only development is the pogo.
  - HK's first 45 minutes have 8–10 kinds and the nail has four uses.
- **Fix (design, for the next chunk loop):**
  - add **one fodder kind that composes with the lamp** in R6–R9: a lamp-feeder that brightens a lamp's pull when
    alive;
  - add **one armoured kind** that only a thrown body or a pogo opens;
  - give the blade **one new use** in area 1, such as cutting a dangler's silk to drop it onto a beetle.

### 7. One currency, and the finds aren't felt (design, level, render)

- **Evidence.**
  - Rewards are lamp moths, plus quick wings and the moth-stone.
  - No run lingered at a secret.
  - The crown cloud is the only payoff for finds, and it can't show the difference between 75 and 90 moths.
  - HK uses five currencies and Ori three kinds of cells.
- **Fix.**
  - Add **a second find kind with a visible effect inside the area**: for example, glow-seed fragments, where three
    make a lamp-sense charm that shows arcs earlier.
  - Put the first health milestone where a player who takes ~3 finds crosses it **before the pit**, so finds pay for
    the boss.

### 8. R9's beetle and the late-game thorns still cost more than the peaks (creatures, level)

- **Evidence.**
  - R9's fenced beetle hits 1–3 times in every run and killed casual s2.
  - R6's gap-2 thorns took 1–6 hits a run.
  - 7 of the 13 deaths are in R6, R8 and R9, against 4 in the pit and 1 on the climb (C9).
- **Fix.**
  - R9's pair should be "land, then snuff": the beetle's patrol stops 200 px short of the landing.
  - Gap 2 needs a lip that turns a short glide into a ledge grab.
  - Then deaths cluster where they should, in the pit (once #1 is fixed) and on the crown wick.

---

## 9. Answers to the plan's §5 questions (round 4)

1. **W2 by choice:** 6 of 9 snuff W2 from the knob. W1 is snuffed in all 9.
2. **First oak frame:** the vista at ~0:45. **First W-ff frame:** the glimpse at 6:57–9:40.
3. **R8 waits on purpose:** casual s1 waited through two passes and threw first try. The skilled bots don't model
   waiting and died. I saw no tunnel taken because of Tatter.
4. **The climb:** one continuous rise with no black, and falls stop at ~600 px.
5. **The crown's frame:** it holds the hatching tree west and the valley's lights east, with the cloud, for 9 s. The
   hawker is gone and she is small but readable.
6. **The one-sentence test:** it passes on what is on screen.
