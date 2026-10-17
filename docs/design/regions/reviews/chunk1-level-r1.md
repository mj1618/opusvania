# Chunk 1 review, round 1: level and pacing (R1–R10, `wood-hatch` → `wood-well`)

Reviewer: the level and pacing lens (`STUDIO.md`, the onion loop), independent of the build. 2026-10-18, HEAD
`b58e681`. The bar is `docs/design/quality-bar.md` §3, and "good for greybox" counts as a fail.

**What I did**
- **Real keys.** I played in the page from a HEAD snapshot (vite on 5193, so other agents' HMR couldn't reload it).
  Each call dispatched KeyboardEvents on `window` in a rAF loop, and the sim stayed frozen between calls. Covered:
  the hatch and its exit; R3's first catch, beat-free and knob snuff; R4's seed-case gap (one clean real-key
  crossing); R5's lip; all three R6 gaps; the R8 hawker; R9's climb to P; the R10 pit.
- **Measurement in manual mode** (the input DSL, same sim) where a timing window needed numbers:
  - R4 pogo grid: 108 timings.
  - R6 gap 3: walk-off press offsets.
- **Screenshots** of every room: a whole-room view with labels, and the entry view and key spots at 1080p with labels
  off. They are in the session scratchpad (`review-chunk1-level/`), not committed.
- **Bots:** `npm run playtest -- --until none --seconds 900`, all four personas (reports
  `playtest-reports/2026-10-17T14-18-44-*`).
- **Reading:** room JSON for geometry, notes and TODOs.

**First-timer minutes** below are my estimates. They start from the paper's §9 targets, then I corrected them with
my own play and the bot times (bots run 3–15× faster than people). I mark them *est.*

---

## 0. Two findings that outrank the rubric

1. **The old burrback (R10's mini-boss) can be skipped by accident in about 10 s.**
   - W8 (`wick-pit`, 2000, 992) pulls a jump from the pit floor near x 1760–1950 up into its core.
   - Beating free while holding right throws her onto the top of the root gate (y 1088). The gate is 384 tall, and
     there are 384 px of open air between it and the rock roof (y 704).
   - From there she walks onto the ledge and into glade 2, and gets wall jump with the creature at 10/10 hp and the
     gate shut.
   - Reproduced 4 of 4 times with real keys during the fight. The speedrunner bot did the same at f5927–6015.
   - A first-timer who jumps toward the only flame in the room will do this, and the game has spent ten rooms
     teaching them to jump at flames.
2. **The chunk's set piece and its story beats are not in the build.**
   - R2's vista is an empty grey sky: there is no swarm, no LAMPFALL title, no stragglers, and no camera hold
     (`wood-chase.json` notes: "TODO render").
   - The hub's glimpse is a TODO, and W-ff burns 2700 px above the camera, where nobody ever sees it.
   - R3's stragglers and the dead moth are TODOs.
   - So in R2–R10 nothing is *staged* for the player. Tatter sits at two patches, and that is all the story there is.

---

## 1. Per room

Legend: **P** pass, **F** fail. The must items are R1–R9; R10–R12 are should.

### R1 `wood-hatch`: 11 P / 1 F
| Item | | Evidence |
|---|---|---|
| R1 purpose | P | Who she is and what she wants. Built and painted: cocoon row, swarm, Tatter, the run |
| R2 feature | P | The cocoon row under the bough, the crown tree, the promise gap |
| R3 decision | **F** | Holding right is the optimal line: naive and speedrunner both exit in ~10 s. The explorer goes west to the trunk first and finds nothing. The first "wrong way" pays nothing |
| R4 find | P | The promise gap, glide's lock, seen at 0:10 |
| R5 dead walking | P | A gap or a beat every 1–3 s |
| R6 entry/exit | P | The swarm leads east |
| R7 escalation | P | Gaps grow, then the promise gap, then the drop |
| R8 camera | P | Tuned beats: hatch frame, lean, fall lead (`memory/rooms.md`) |
| R9 failure | P | Fall catches cost nothing |
| R10–R12 | P | No creatures; density ≥ 5/min; painted |

**What would make it great:** let going west pay in the first ten seconds, the way HK's King's Pass does with the
geo cave to the left of the fall. A moth husk or a lore find behind the cocoon row would do it.

### R2 `wood-chase`: 6 P / 6 F
| Item | | Evidence |
|---|---|---|
| R1 purpose | **F** | The purpose is "set piece: the chase, the vista and the title". In play it is five flat boughs stepping down east with no pursuer. A first-timer would say "I went downhill" |
| R2 feature | **F** | Same-height boxes with ≤ 320 gaps; it sketches as a staircase. The vista zone frames empty air |
| R3 decision | P (weak) | The one-way twig line over C→D is a high/low choice that pays nothing |
| R4 find | **F** | 5.9 screens, so it needs two finds. The only planned one, the valley's lamps across the gulf, isn't drawn |
| R5 dead walking | P | Bough A is 1800 px (~3 s) |
| R6 entry/exit | P | Downhill east reads |
| R7 escalation | **F** | Every gap is ≤ 320 and every step ≤ 128, with no threat; the room is flat in difficulty from end to end |
| R8 camera | P | For the platforming. (The vista zone lifts onto nothing.) |
| R9 failure | P | Catch zone |
| R10 | P | No creatures |
| R11 density | **F** | Under 2 notable events a minute: no threat, no find, no view |
| R12 grey | **F** | quality-bar §4 says a greybox vista must be "a camera move onto something with a shape". There is no shape |

**What would make it great:** make it an actual chase. Run the swarm overhead as a dot stream that pulls ahead and
dives; let one bough sag or snap behind her (Ori's Sunken Glades opening run, Celeste 1's first screens: one idea
pushed until it breaks). End on a held vista: a far silhouette strip with a row of warm dots, LAMPFALL as text, and
8 dots peeling off over the lip.

### R3 `wood-wicks`: 10 P / 2 F
| Item | | Evidence |
|---|---|---|
| R1 purpose | P | Teach pull, Caught and snuff. Real keys: the run-up jump is caught at W1, three presses free her, she drops into the dip, and the knob stops her for a standing cut that snuffs W2 (+5) |
| R2 feature | **F** | Flat shelf, dip, knob, then a step down to a 1800 px flat floor. It has the same profile as R4's F1→F2→step. The hanging trunk is the only odd shape, and it's 600 px off the line |
| R3 decision | P (weak) | Cut W1 while caught, or beat free; jump the dip or walk through it |
| R4 find | **F** | 4.0 screens needs two. There is one, W-hi3; the dead moth is a TODO |
| R5 | P | N's flat run is ~3 s |
| R6 | P | W1's light is the way on |
| R7 | P | Pull, Caught, snuff: three beats with the twist inside |
| R8 | P | Both wicks are framed from L |
| R9 | P | The dip is free |
| R10–R12 | P | Fields and cores read; density OK |

**What would make it great:** give W1 a picture. Hang it in a hollow root knot over the dip, and make the dead moth
a find you can read (a husk with lore). That is Celeste 1's first room: the idea shown safe, with a picture to
remember it by.

### R4 `wood-burrow`: 11 P / 1 F
| Item | | Evidence |
|---|---|---|
| R1 | P | The blade against things |
| R2 | P | The root roof capping the seed-case gap is the chunk's best silhouette |
| R3 | P | Fight the burrback, or snuff W3 so it sleeps, or pogo it from the step |
| R4 find | **F** | 3.9 screens needs two. There is one, W-hi4. P1 and Tatter are a rest, not a find |
| R5–R6 | P | |
| R7 | P | Creature, then the required pogo, then rest |
| R8 | P | The gap and F3 are in frame from the step |
| R9 | P | A miss lands on the 1472 floor; ~6 s back up the steps |
| R10 | P | The step changes the fight |
| R11–R12 | P | Seed-cases read as orange rings |

**Measured.** A simple hold-right timing grid (jump hold × wait × wait) gets across in **29 of 108**. My real-key
crossing worked once I waited ~22 frames between the cuts. Expect 2–4 tries.

**What would make it great:** a safe pogo before the required one. Put one seed-case over the floor below the root
step, where a bounce lands back where it started, with moths drifting up off it. HK's optional spike pit works
because the pogo is discovered by trying.

### R5 `wood-glade`: 9 P / 3 F
| Item | | Evidence |
|---|---|---|
| R1 | P | Glade 1: glide (the item line shows) |
| R2 | P | The 1600 px fall into the moon shaft |
| R3 decision | **F** | One line out. It isn't a ≤ 15 s corridor |
| R4 find | **F** | 3.2 screens and nothing to find. The east trunk "promise" is a grey pillar that doesn't read without labels |
| R5–R6 | P | |
| R7 escalation | **F** | The ability, then one chasm, with no twist |
| R8 | P | The `lip` zone frames the lip and Z |
| R9 | P | The chasm is a free catch. A jump pressed 384 px early lands in it, which costs nothing |
| R10–R12 | P | |

**What would make it great:** pay the new verb at once. Put a lit alcove under the lip, inside the catch's airspace,
that you can only reach by gliding back west under the lip. That is Ori's energy cell straight after Wall Jump.

### R6 `wood-glidewalk`: 10 P / 2 F
| Item | | Evidence |
|---|---|---|
| R1–R5 | P | A real ladder: safe, combine (high or low line at W5), test, then bark on the critical path and the floor pocket at once |
| R6 | P | W4's light is the way on |
| R7 | P | The hardest gap is last |
| R8 camera | **F** | From E0, T2 (y 960) sits at or below the bottom edge (screenshot `entry-wood-glidewalk.png`), so the first glide gap is a blind jump. The cautious bot "stands on E0: T2 never comes into view". There is no camera zone in the room |
| R9 failure | **F** | See below |
| R10–R12 | P | Thorns read well; bark is hatched |

**R9 detail.**
- The test's answer is a walk-off glide. A first-timer who let go of jump on landing has to press it in a window
  about 5 frames wide. In a sweep of press offsets, offsets ≤ 8 frames still jump into the branch, offset 16 hits the
  floor thorns, and only the 10–12 frame offsets pass.
- The other way through is holding jump through the landing on T3, which nothing teaches.
- Each mistake costs 1 pip. On the fourth she fades and re-forms at **P2 in R5**, about 40 s back across R5 and gaps
  1–2. Real keys: two jump-glides took 4 → 2 hp, and a late walk-off faded her.

**What would make it great:** make gap 1 teach the walk-off. A root roof over E0's lip caps the jump, the same trick
as the seed-case gap, so the first glide *has* to be a walk-off. Then gap 2 offers both lines and gap 3 tests. Put
a patch on T3 so the test is a checkpoint. Celeste 1's crumble blocks: shown safe, then turned against you.

### R7 `wood-hollow` (hub): 9 P / 3 F
| Item | | Evidence |
|---|---|---|
| R1 | P | Hub and rest |
| R2 feature | **F** | At 1080p the hub is a ledge, a flat floor, a patch and two pillars that vanish upward (`hub-westdoor.png`, `hub-shaft.png`). Its 2240 px of height, the canopy gap, L-gap and W-ff are never in frame |
| R3 | P | East arch or the well alcove |
| R4 | P | The up-shaft and the grate (amber) |
| R5 | P | ~6 s from the arch to the alcove on the way back |
| R6 | P (weak) | The arch's glow is a TODO |
| R7 | P | Not applicable to a hub |
| R8 camera | **F** | No camera zones at all. There's no look-up under the shaft and no rest framing at P3 |
| R9–R10 | P | |
| R11 density | **F** | First visit: a patch and Tatter. The glimpse is unstaged |
| R12 | P | |

**What would make it great:** show the hub's height and its question. Add a vertical rest frame at P3 with the
canopy gap in view, a staged glimpse, and a look-up zone under the shaft that shows W-crown's glow at the top. HK's
Dirtmouth works because of silence plus one obvious question (the well).

### R8 `wood-hawkers`: 8 P / 4 F
| Item | | Evidence |
|---|---|---|
| R1 | P | Teach the hawker |
| R2 feature | **F** | "A flat floor with a wick". This is the rubric's own fail example, word for word |
| R3 decision | **F** | No real choice. I stood under W7's light for 70 frames and wasn't dived. One jump-cut snuffed W7 and the hawker left. Every bot took 0 hawker hits |
| R4 | P | S1 bark in the dark half |
| R5–R6 | P | |
| R7 escalation | **F** | One beat (snuff it), then a dark walk to a bark panel |
| R8–R10 | P | A teach room may have a lone creature on flat ground |
| R11 density | **F** | About 1 event a minute |
| R12 | P | |

**What would make it great:** a Vengefly over a climb (HK King's Pass room 4). Break the floor into two hummocks
over a 256 px dip, so the hawker's dive lane crosses the only line. W7 should be reachable only from the hummock
that sits inside that lane.

### R9 `wood-lantern`: 11 P / 1 F
| Item | | Evidence |
|---|---|---|
| R1–R6 | P | First lantern, then the broken-face lock. The shaft and its thorn band are the picture. The DJ wick is a promise |
| R7 escalation | **F** | Two jump-cuts from P, where the burrback (patrolling the floor) can't reach her. That is easier than R4's W3. The hardest moment is meeting the burrback at the step, near the door, and the room ends in a dead end |
| R8–R12 | P | |

**What would make it great:** put the burrback *on* P, so the lantern is cut while it rams along the platform. A
pogo off its braced shell up into L1 twists R4's lesson. Nine Sols' dog in the laser corridor: the creature and the
terrain change each other.

### R10 `wood-well`: 10 P / 2 F
| Item | | Evidence |
|---|---|---|
| R1 purpose | **F** | Mini-boss, then glade. The W8 pull skip (§0.1) turns it into "fell into a pit, floated over a wall" |
| R2–R6 | P | The fall down the well; the locked pit. It never strikes on landing |
| R7 | P | Fight, then glade, then climb-out (when it isn't skipped) |
| R8 | P | The `pit` lock zone |
| R9 | P | A fade goes to P3, 15 s from the well |
| R10–R11 | P | |
| R12 grey | **F** | W8 reads as "out of reach", but its field reaches the gate top and the pit floor. The danger and the skip are both invisible |

None of the bots ever killed it: naive took 22 hits and 10 fades, cautious 2 fades in this run.

**What would make it great:** a sealed arena, as in False Knight. The gate has to hold, and the reveal should be
staged through the fight: the shell cracks and shows the pogo target after the first wall stun.

**Room totals:** 95 P / 25 F. On the "every must passes, at most two shoulds fail" rule, **no room passes yet. Every
room, R1 included, fails at least one must.** R1, R4 and R9 are each one must away from passing.

---

## 2. The chunk

### C1–C14
| Id | | Evidence |
|---|---|---|
| C1 novelty | P | Something new about every 1.5–2.5 min *(est.)*: catch at 1.5, snuff 2.3, burrback 3, pogo 4, glide 5.3, high/low line 7.5, thorns 8.5, bark 9.5, hub 10, hawker 11, lantern 13, old burrback 15.5, wall jump 18. The longest gap is ~2.5 min. But three of the planned novelties (vista, title, glimpse) aren't built |
| C2 challenge types | P (barely) | 8 types: burrback, hawker, old burrback, thorns, wick pull, lantern, seed-case pogo, rotten bark (plus glide gaps). Combinations: R4 creature+wick+step, R6 glide+wick, R6 glide+thorn branch, R6 landing+creature+wick, R9 lantern+creature, R10 creature+wall. Still, two creature kinds and a variant by minute 16, against HK's 8–10 by its first boss |
| C3 finds | **F** | Optional finds before the R11 stub: the R6 pocket (~9:45), S1 (~12:00), the crown (~19:00). That is **3 in ~20 min, one per ~7 min** (bar: one per 2–3). **One reward kind**, and the moths unlock nothing in the chunk: the first health milestone is 110, and a critical-path player has ~50 by R10 |
| C4 promises | P | Visible locks: the promise gap, W-hi3, W-hi4, the up-shaft, R9's shaft, the DJ wick. Glide pays at once; wall jump pays the crown ~1 min later |
| C5 rest | **F** | P2 (~5:30) → P3 (~10:00) → P4 (~17:30) *(est.)*. That's 4.5 min, then 7+ min through two lit rooms, the lock and the well. R6, the riskiest room, has no patch. (The mini-boss door is fine: P3 is 15 s away.) |
| C6 loop | **F** | No loop a first-timer uses to save time. The grate is the climb-out's only exit, not a shortcut. The R1–R5 return is a 5-min optional detour for 10 moths. Meanwhile the route forces ~9000 px of cleared-room backtrack twice: R9→R7 to find the well, then R7→R9 after wall jump |
| C7 lost | P (risk) | A first-timer finds the well within ~1 min of the R9 lock (it's in frame from P3). Bots: the naive one ping-pongs R8↔R9 for 120 s and never turns back three rooms; the explorer lost 45 s in the hub's east end. The brief unsure moment at the lock is there |
| C8 teaching ladder | **F** | Pogo: no safe intro is required; the test (old burrback) is skippable. Glide: the walk-off is tested in gap 3 and never taught. Hawker: intro only. Lantern: intro only. Old burrback: one step |
| C9 difficulty | **F** *(predicted)* | Deaths will cluster at R6 gap 3 (a 5-frame window, fade → P2), which is not a designed peak. The designed peak (R10) can be passed with 0 deaths by the skip. Bots: the only fades were in R10 |
| C10 peak | **F** | The chase isn't a set piece in the build, and the only peak (the old burrback) is skippable by accident. The chunk has no peak a first-timer reliably meets |
| C11 story | **F** | No staged beat in R2–R10: the glimpse, stragglers, dead moth and vista are all TODO. Tatter has no want and doesn't move. Only R1 delivers story while you have control |
| C12 shape | P | Rises at R4, R6 and R10, rests at P1/P2 and the hub, with the peak in the last third (if it isn't skipped) |
| C13 first boss setup | **F** | The old burrback's pit is never seen before the drop. Its rhythm (brace, ram, wall stun) is rehearsed by three burrbacks, but the pogo-on-brace is rehearsed only if the player chose to pogo in R4. No reveal. Skippable |
| C14 length | P | Glide at ~5:30, wall jump at ~18 *(est.)* |

**Must items: 4 P / 7 F (C3, C5, C6, C8, C9, C10, C11 fail, with C9 predicted). Should items: 2 P / 1 F (C13). The
chunk fails.**

### Minute by minute (first-timer, *est.*)
Key: **N** novelty, **T** threat, **F** find (optional), **R** rest, **V** view or story staged.

| Min | Room | What they meet | N | T | F | R | V | Against the bar |
|---|---|---|---|---|---|---|---|---|
| 0–1 | R1 hatch | Fade-up, cocoon, swarm, Tatter, run, promise gap, drop | ● | | | | ● | the strongest minute |
| 1–1.5 | R2 chase | Five flat boughs downhill, empty vista zone | | | | | ○ | dead minute; planned set piece missing |
| 1.5–3 | R3 wicks | Caught at W1, beat free, dip, knob, first snuff; W-hi3 above | ● | | | | | good teaching; no find |
| 3–5 | R4 burrow | Burrback under W3, root step, seed-case gap (2–4 tries), P1 + Tatter | ● | ● | | ● | | dense; W-hi4 is a lock, not a find |
| 5–6 | R5 glade | Fall into moonlight, glide line, the chasm | ● | | | ● | ● | no decision, no find |
| 6–7 | R6 gap 1, 2 | Blind first gap, W4 jump-cut, the W5 high/low line | ● | | | | | |
| 7–9 | R6 gap 3 | Thorn branch: 1–4 pips; risk of a fade → P2 (~40 s) | ● | ● | | | | an unplanned difficulty spike |
| 9–10 | R6 end | Burrback on T4, bark wall, **pocket** | ● | ● | ● | | | first optional find, at minute ~9.5 |
| 10–11 | R7 hub | Shelf, P3, Tatter (no glimpse) | ● | | | ● | ○ | the story beat is missing |
| 11–12.5 | R8 hawkers | One jump-cut and the hawker leaves; dark walk; **S1** | ● | ○ | ● | | | the threat doesn't bite |
| 12.5–14.5 | R9 lantern | Burrback, P, L1 ×2, the shaft lock | ● | ● | | | | |
| 14.5–15.5 | R9→R7 | ~9000 px back through cleared rooms to the alcove | | | | | | backtrack, no new event |
| 15.5–18 | R10 well | Old burrback (or the W8 skip), W8, glade 2: wall jump, P4 | ● | ● | | ● | | peak; skippable |
| 18–19.5 | R10→R7 | Climb-out, grate, up-shaft, **crown** | ● | | ● | | | payoff within ~1 min |
| 19.5–20.5 | R7→R9 | ~9000 px east again through cleared rooms to the shaft (R11 is a stub) | | | | | | backtrack again |

○ = planned but not delivered. **Cadence against the bar:**
- **Novelty:** passes.
- **Finds:** fail. The first optional find comes at ~9.5 min, and there are 3 in 20.
- **Rest:** fails between 10 and 17.5 min.
- **Events per minute:** below 2 in minutes 1–1.5, 10–11, 11–12.5, 14.5–15.5 and 19.5–20.5.
- **Peaks:** one, and skippable.
- **Length:** the chunk runs ~20 min, which is fine for one chunk. But quality-bar §5.4 wants the wood at 50–75 min,
  and this chunk holds no fat to grow from: every room is single-purpose.

---

## 3. The 10 worst problems, ranked, with fixes

1. **The mini-boss is skippable by accident** (R10; fixes R1 and R12 in R10, plus C8, C9, C10, C13).
   - Close the gap over the root gate. Either make the gate 704–1472, or add a solid lintel 2048–2112 × 704–1088 that
     the flag doesn't clear.
   - Move W8 east, to about (2240, 960) over the ledge, so its 240 field can't reach x < 2048 on the pit floor.
   - Add a `wood-rooms.test` claim: with the flag unset, no jump or jump-glide from x 0–2048 on the pit floor ends at
     x > 2048.
2. **The set piece and the story beats are missing** (R2, R3, R7; fixes R1, R2, R4, R7, R11 and R12 in R2, R11 in R7,
   plus C10, C11). Build greybox stand-ins now; quality-bar §4 says staging is judged in grey.
   - **R2:**
     - the swarm as a dot stream running ahead overhead the whole room (the chase);
     - a far silhouette strip with a row of warm dots at the vista, and LAMPFALL as text;
     - a 2 s camera hold, with input free after 1 s;
     - 8 dots that peel off, dive over the lip and circle W1 in R3.
   - **R7:** on the `glimpse` trigger, a camera pan up the canopy gap to W-ff (1.5 s), a warm dot hangs it, pulses
     twice and darts away; hold 4 s.
   - **R3:** the dead moth as a shape in the dip.
3. **Finds: one per ~7 min, all the same currency** (fixes R4 in R2, R3, R4 and R5, plus C3). Add a **second reward
   kind** that does something within the chunk, for example health-shard fragments (3 = +1 pip) or lore husks that
   the map collects. Add 5–6 optional finds, which brings the rate to one per 2–3 min:
   - R1 or R2: west of the landing on bough A, a cave with a wick (the "go left" rule);
   - R3: the dead moth in the dip, as a lore husk;
   - R4: a bark panel in F1's west wall (dark, near the door);
   - R5: a lit alcove under the lip that you reach by gliding back under it;
   - R7: a bark panel in the well alcove's back wall;
   - R9: a fragment at the shaft's foot behind a seed-case pogo off the slick face.
4. **R6 gap 3 tests a line nobody taught, with a ~5-frame window and a 40 s fade** (fixes R8 and R9 in R6, plus C8
   and C9).
   - Add a **camera zone** that frames E0 and T2 together (x 0–2100, y 200–1500, zoom ~0.8). A second zone for T3 and
     T4 is optional.
   - Teach the walk-off at **gap 1**: a root roof ~200 over E0's lip caps the jump (the seed-case gap's trick, so a
     jump-glide bonks), and the only line is a walk-off glide over the safe floor.
   - Add a **moon patch on T3**.
   - Ask the feel lens about a glide "coyote": press jump within ~8 frames of leaving a lip and the wings open with
     no jump.
5. **Rooms are flat floors with one feature** (R8, R2, R3; fixes R2 in each, R11 in R8, and C2's quality).
   - **R8:** two hummocks over a 256 dip under W7, so the hawker's dive lane crosses the only line. W7 is reachable
     only from a hummock inside that lane. The dark half sits behind a hanging root curtain.
   - **R2:** one fallen giant trunk to run down, plus two real drops, instead of five even boughs.
   - **R3:** W1 inside a hollow root knot over the dip, so the room has a picture.
6. **The hub doesn't read as a hub** (R7; fixes R2, R8 and R11 in R7, plus C4 and C7). Add camera zones:
   - at P3, a rest frame (zoom ~0.55) with the canopy gap and L-gap in view;
   - under the up-shaft, a look-up that shows the shaft's full 2240 and W-crown's glow at the top.

   Draw the east arch as a lit doorway shape. Show the drowned-roots seep as a visible lock at the alcove's back wall,
   so the hub has a fourth readable way.
7. **No loop; a forced double backtrack** (fixes C5, C6, C7, C12, and R5 across the backtracking).
   - **Reorder so that lock and key meet.** The well's way in moves to R9's dead end: a rotten-bark floor panel at the
     shaft's foot, with moonlight welling up through it. The climb-out stays up through the hub's grate. That makes
     **hub → hawkers → lantern → well → climb-out → hub** a real loop the first-timer walks, and it removes the
     R9→R7 backtrack.
   - The hub's alcove well becomes the shortcut down to P4 and opens once the grate is open.
   - Then, with wall jump, give the crown shelf a high canopy route east over R8 to R9's shaft top, so the second
     trip east is new ground, not 9000 px of cleared floor.
8. **Encounters are toothless and single** (R8, R9; fixes R3 and R7 in R8 and R9, R10, C2, C8).
   - The hawker never dove in 70 frames under W7, and every bot took 0 hits from it.
   - Every lit-room creature disperses when you snuff, so each encounter reduces to one cut.
   - **R9:** put the burrback on P (patrol 1024–1536) so the lantern has to be cut around its ram.
   - **R6 or R8:** add one encounter where two threats overlap. In R6, the burrback on T4 inside W6's field at the
     landing, with W6 placed so the snuff needs a pogo off its braced shell.
   - Add one new creature kind before R10 (a ceiling-drop or spitter on R3's N floor or R5's Z). By minute 16 the
     chunk has two kinds and a variant.
9. **The rest cadence breaks between 10 and 17.5 min, and R6 has none** (fixes C5, and R9 in R6).
   - Add a patch on R6's T3 (problem 4).
   - Add a patch in R8's dark half, the planned "breath" (no creature can see it, so the threat lint holds).
   - If problem 7's reorder lands, P3 falls on the loop anyway.
10. **The pogo has no safe, required intro** (R4; fixes C8 and R7 in R4).
    - R4's "free bounce off the braced shell" only happens if the player drops on the burrback, and nothing prompts
      the down cut.
    - The first required pogo is the seed-case gap, which 27% of a simple timing grid gets across, at ~6 s a miss.
    - Add one seed-case over the floor below the root step (bounce, land back, no gap) with moths drifting up off it.
      Then the gap, then the old burrback (once problem 1 makes it hold).

Not in the ten, but should be fixed:
- No room JSON has a `purpose` field (only a note), so R1 can't be linted.
- R5's east trunk doesn't read as "climbable later" without labels.
- The naive bot never turns back three rooms to the well, which is a harness limit, but it echoes problem 7.

---

## 4. What's good (keep)

- **R1, the hatch.** Painted and tuned: the cocoon, the swarm, Tatter's failed hop, the promise gap. It is the bar's
  "first control in seconds" done right.
- **R3's teaching is Celeste-clean.**
  - The run-up jump is always caught (11/11 launch points), and the cocoon's input frees her.
  - She lands in a free dip.
  - The knob stops her right where a standing cut snuffs W2.
  - It's wordless, nothing can fail, and the snuff is loud.
- **R4's seed-case gap.** The root roof capping the jump is the chunk's best shape: a skill check with a safe floor
  under it and a ~6 s miss.
- **R5.** Glide can't be skipped, the chasm is a free catch, and the `lip` zone frames the lip and Z together.
- **R6.**
  - Gap 2's high/low line at W5 is the chunk's one genuine line decision.
  - Rotten bark on the critical path, then straight away in the floor, is Ori/HK's secret language taught right.
- **Lock lead and payoff.** Wall jump's lock is seen at 1:30 and paid ~1 min after the key (the crown).
- **The structural rules.** Lamp light decides what creatures see; failure costs are bounded. Re-forms go to R4's
  door and to P3, 15 s from the well; nothing in the first 3 min can kill her.
