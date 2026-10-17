# Chunk 1 review, round 2: level and pacing (R1–R10 + R14, `wood-hatch` → `wood-well`, `wood-caps`)

Reviewer: the level and pacing lens (`STUDIO.md`, the onion loop). I built none of it. 2026-10-18, HEAD `eff24e3`.
The bar is `docs/design/quality-bar.md` §3, and "good for greybox" counts as a fail. The target is the rescope's area 1:
**~35 min (30–40) for a first-timer** (`wood.md`, rescope section).

**What I did**
- **Clean snapshot** of HEAD (`git worktree add --detach`, node_modules linked), with Vite on its own port (5211), so
  no other agent's HMR could touch it.
- **Real keys.** I drove the page through `playwright-cli` with an in-page driver. It dispatches `KeyboardEvent`s on
  `window` once per animation frame and reads `__game` state and events. I used `goto` / `grant` / `flag` only to
  reach a spot. What I played:
  - the vista in R2;
  - the hub glimpse;
  - all of R14: dangler 1, all four caps, the hollow, the moth-stone, the root cut, the drop and the return bough;
  - R8 four times as a runner;
  - R9's floor route and its bark panel;
  - R6 gap 1 as a press-offset sweep;
  - R10's chute from P-chute to the pit;
  - the canopy line from the crown to R9;
  - the hub mesh.

  I also did a few first-timer-tool bursts in the hatch (`--dev`).
- **1080p screenshots** of each room's entry and its key spots, with labels off. They are in the session scratchpad
  (`review-chunk1-level-r2/shots/`) and not committed.
- **Bots:** `npm run playtest -- --region wood --chunk wood-hatch..wood-well,wood-caps --upto wood-well
  --seconds 1500`. The report is `playtest-reports/2026-10-17T16-01-37-region.md` (gitignored). (With the default
  `--seconds 300`, three of the four personas time out.)
- **Reading:** STUDIO, quality-bar, wood.md (the rescope, §7, §12), core, craft §8, every memory file in the brief,
  round 1's review, plan and first-timer reports, and every room's JSON.

**First-timer minutes** are my estimates, marked *est.* I built them from three sources:
- round 1's first-timer journals. Rooms R1–R6 changed little, and both first-timers reached the hub at 3:16–3:37;
- the bot times, ×3–4 (the explorer and the cautious bot);
- my own play.

No round-2 first-timer journal existed when I wrote this, so the panel's first-timers should correct these minutes.

---

## 0. Three findings that outrank the rubric

1. **The mini-boss and the whole second half of the chunk can be skipped from the hub, in about 3 seconds.**
   - The cause is the hub's one-way root mesh over R10's climb-out (2560–2944, y 3136). It lies on the hub floor, on
     the walk east.
   - Standing on the mesh, **down + jump** drops her through it, down the climb-out and onto glade 2's floor. Walking
     east gives **wall jump** at once.
   - Reproduced with real keys:
     - the drop: `roomEnter wood-well` and `flagSet wood-climbout` in the same frame;
     - a short walk east to `gladeGrant glade-claws` (14 s including my pauses), with `old-burr` still at
       12/12 hp and asleep.
   - It also sets `wood-climbout`, which lifts the well lid.
   - From there, the crown and the canopy line take her east over R8 and R9 into the R9 shaft and on into area 2.
     She has met no hawker, no lantern and no old burrback.
   - The harness flagged this skip at the last commit (`memory/playtest-harness.md`, "Finding for the level agent").
     It is **not fixed at HEAD**.
   - The game itself invites the input: it has spent three rooms teaching "a dead-end floor with light under it is a
     door you cut down through", and this mesh shows glade 2's moonlight under it.
2. **The chunk is ~20–24 minutes for a first-timer, not 35.**
   - Round 1's first-timers reached the hub at **3:16 and 3:37**. The rescope's beat sheet puts the hub at
     **10:30**.
   - Everything added since then adds about 8–10 minutes:
     - R14: ~3 min;
     - the finds: ~1.5 min;
     - the bigger R8 and R9: ~1.5 min;
     - the chute: ~1 min;
     - the vista: a few seconds.
   - Bots, full chunk:

     | persona | time | first-timer equivalent (×3–4) |
     |---|---|---|
     | explorer | 5:19 | 16–21 min |
     | cautious | 6:55 | 21–28 min |
     | speedrunner | 2:12 | — |

   - My minute-by-minute estimate (§2) ends area 1 at **~22 min**. That is short of the 30–40 range by a third. The
     **wall-jump give lands at ~18 min**, against the beat sheet's 27:30.
   - Several rescope items that would add *play* rather than walking are still unbuilt:
     - R8's bounce caps under the hawker's lane;
     - R8's cap-bounce shortcut up to the hub's arch;
     - the view from R14's top across the canopy gap.
3. **The creatures still don't bite.**
   - **The hawker:** 0 hits in all four bot runs and in four of my runner passes. Its dives (`enemyDive` ×3 in one
     pass) all miss, because W-hummock catches a runner and throws her east past its lane.
   - **The danglers:** they hit only where she must stop.
     - The bots took 0 hits from `dang-c1`, `dang-c2` and `dang-lantern`. The only dangler hits were from
       `dang-chute`: 1 on the speedrunner and 2 on the naive bot.
     - I ran under `dang-c1` at full speed: it dropped behind me and stalled on the floor.
   - **R9's two-creature combination** sits above the critical path: you walk under it. The speedrunner and the naive
     bot "passed" it.

   So the chunk now has the right *count* of creature kinds and combinations (C2), but in play only one burrback per
   room and the mini-boss ever threaten her.

---

## 1. Per room

Legend: **P** pass, **F** fail. R1–R9 are must, R10–R12 should. A room passes when every must passes and at most two
shoulds fail. Screens are counted by area (w×h / 1920×1080), as in round 1.

### R1 `wood-hatch`: 11 P / 1 F, fails
| Item | | Evidence |
|---|---|---|
| R1–R2 | P | The cocoon row, the swarm and Tatter; the crown tree and the promise gap |
| R3 decision | **F** | Unchanged. Holding right is the line (the bots exit in 12–17 s). Going west to the trunk still finds nothing: the "go left" find moved to R2's trunk hollow |
| R4–R8 | P | A fall now puts her back on the ground she left (377cba9), not at the cocoon (round 1's curious first-timer lost ~30 s three times) |
| R9–R12 | P | |

**What would make it great:** HK's King's Pass rewards going left in the first ten seconds. Put a husk or a lore find
behind the cocoon row at the west trunk. It costs one prop and turns R1 from a corridor into a choice.

### R2 `wood-chase`: 12 P / 0 F, passes (weakly)
| Item | | Evidence |
|---|---|---|
| R1 purpose | P | Set piece, now staged: a swarm stream overhead, the moon, LAMPFALL over it, warm valley lights through the gap, stragglers peeling off, a camera hold on V2 (`flagSet<vista`, screenshot `r2-vista2.png`) |
| R2 feature | P | The fallen trunk rolling down into two real drops, then the lookout over the gulf |
| R3 decision | P | Turn back for W-cave in the trunk hollow behind the landing, or don't; the twig line or E |
| R4 find | P (weak) | W-cave, plus the valley's lamps as a promise. The room is 5.9 screens, so it needs two, and the second is only a view |
| R5–R6 | P | Each surface is ≤ 3 s; downhill east |
| R7 escalation | P (weak) | The room builds to the vista hold. There is still no chase: nothing pursues her, nothing breaks, and holding right clears it (300 frames to x 3600, no input but right) |
| R8–R12 | P | The vista zone now lifts onto shapes |

**What would make it great:** make it chase. The opening run of Ori's Sunken Glades and Celeste 1's first screens each
push one idea until it breaks. Let one trunk section sag and drop as she crosses it, with a catch under it, so the
room has a single "go!" beat before the hold.

### R3 `wood-wicks`: 11 P / 1 F, fails
| Item | | Evidence |
|---|---|---|
| R1 | P | Pull, Caught, snuff (unchanged, Celeste-clean) |
| R2 feature | P (weak) | The root knot: a slab with three thin tendrils around W1, the circlers and the dead moth in the dip. It is legible, but it's three sticks. Round 1's concern that its profile matches R4 (shelf, dip, knob, step down to a long floor) still stands |
| R3 | P | |
| R4 find | **F** | 4.0 screens, and only one find (W-hi3, a lock). The dead moth is story, not a find |
| R5–R12 | P | |

**What would make it great:** a second find in the dip or at N's east end, such as a pocket under the knob (a bark
floor panel, the language the chunk teaches anyway), and a heavier knot that wraps W1 like a cage. Celeste 1's first
berry is lit from its doorway.

### R4 `wood-burrow`: 12 P / 0 F, passes
| Item | | Evidence |
|---|---|---|
| R4 find | P | W-pocket under the bark by the door, and W-hi4 (a lock). Fixed since round 1 |
| R7 | P | Seed-0 over F1 (a free bounce), then the seed-case gap. This is the safe intro round 1 asked for |
| R9 | P | A miss lands on the 1472 floor, ~6 s back |
| rest | P | |

**What would make it great:** the seed-case gap is still the chunk's fiddliest required input (round 1: 8 and 10
tries). Next round's first-timer journals decide whether seed-0 fixed that. If not, widen the second case's ring.

### R5 `wood-glade`: 12 P / 0 F, passes
| Item | | Evidence |
|---|---|---|
| R3, R4, R7 | P | W-alcove under the lip: walk off, turn back, glide in. It is a decision, a find and a twist on the new verb straight away (Ori's energy cell after a new ability) |
| rest | P | |

### R6 `wood-glidewalk`: 12 P / 0 F, passes
| Item | | Evidence |
|---|---|---|
| R7 | P | The root roof over E0's lip makes gap 1 a walk-off. Measured with real keys (hold right from x 100, press jump at frame n): n = 52–64 crosses; jumping under the roof, or pressing at n ≥ 70, lands on the safe floor under the gap, with rungs back up. A wide window, and failing costs nothing |
| R8 | P | The `gap1` zone frames E0, the gap and T2 |
| R9 | P | P-t3 before the test. The thorn branch sits over the jump's apex, so both glides cross gap 3 |
| R4 | P | The gap-1 sign, the floor pocket, W5's high line |
| rest | P | |

**What would make it great:** nothing structural. Watch the thorn-branch chain hits (a feel item).

### R7 `wood-hollow` (hub): 12 P / 0 F, passes
| Item | | Evidence |
|---|---|---|
| R2 feature | P | The twin shaft columns and the cap ladder up the west wall, framed whole by the `rest` zone |
| R3 | P | Three readable ways: the caps (pink, with chevrons) up-left, the east arch, and the locked shaft |
| R6 | P | The east arch glow is still `TODO render`, but the floor runs to it |
| R8 | P | The `rest` fit zone and the `look-up` zone. The glimpse looks up the canopy gap, and the firefly hangs W-ff (`hub-glimpse1.png`) |
| R11 | P | The glimpse, Tatter gazing at B1 (its want), and the root-ladders after R14 |
| rest | P | |

The mesh skip (§0.1) lives here, but it breaks R10's purpose, so it is scored there.

**What would make it great:** HK's Dirtmouth has one obvious question (the well). Here the well is lidded, which is
right, but nothing shows the lid as a lid. Draw it as a shut root grate with the well's light leaking up, so the hub
shows a fourth way that the player will open later.

### R14 `wood-caps`: 12 P / 0 F, passes
| Item | | Evidence |
|---|---|---|
| R1 | P | Teach caps and the dangler; optional; a secret |
| R2 | P | The stair of pink caps climbing the dark |
| R3 | P (weak) | Hollow first or up first; snuff W-c2 or dodge. There is one line up |
| R4 | P | W-c1, W-c2, W-c3, the hollow (quick wings, real keys: "Quick wings: beat free in two."), the moth-stone (`stoneRead`) |
| R5 | P | ~2.5 s of floor from the door to cap 1. The return bough after the drop is a **6 s** flat walk (`wood-glidewalk` x 1920 → 5396 at y ~112), at the R5 limit |
| R6 | P | The cap is in view from the door; the exit is the cut root, then the chute |
| R7 | P | Dangler alone, then caps alone, then cap 2's landing under `dang-c2` (it hit me there), then the hollow, then the top |
| R8 | P | Without a zone, the next step's landing is still in frame from each cap's foot (`caps-step2.png`, `caps-step3.png`) |
| R9 | P | No hazards; a fade re-forms her at the door |
| R10 | P | `dang-c2` over the cap-2 landing is the chunk's one dangler that bites by design. `dang-c1` over open floor does not: I ran under it at full speed and it dropped behind me |
| R11–R12 | P | Caps, danglers and bark all read from shape |

Caveats a harsh reviewer must still name:
- It is **four copies of one beat** (a cap at the foot of a step, bounce, land).
- The hollow, "the chunk's secret a first-timer misses", **is in plain view**: an outlined window with a moonlight
  column behind hatched bark, right next to cap 3.
- The rescope's **view from the top** across the canopy gap to the glow-cap isn't built. The top is a dark ledge with
  a stone and a root.

**What would make it great:** twist the cap in its own room, the way Celeste 1 introduces each mechanic and turns it
once:
- cap 3 under a low thorn ceiling, so she must let go of jump to take the small bounce;
- cap 4 reached only by gliding off step 3.

Also:
- hide the hollow (spores only, no window);
- cut a slit at the top that looks east into the hub's canopy gap at W-ff. That lit lock is the reason to climb.

### R8 `wood-hawkers`: 11 P / 1 F, fails
| Item | | Evidence |
|---|---|---|
| R1–R2 | P | The hawker's room: twin hummocks over a dip, the root mound, the dark half |
| R3 | P (weak) | W-hummock or around it; S1; later the canopy line |
| R4 | P | S1 (W-bark), the dark-half sign, W-canopy (wall jump) |
| R5–R6, R8–R9 | P | P-dark in the dark half |
| R7 escalation | **F** | The hawker never lands a hit. All four bots took 0, and so did I in four runner passes (`enemyDive` ×3, no `hurt`). A runner who jumps the hummocks is caught by W-hummock and **thrown east past the lane**. One jump-cut on W7 sends the hawker off. The room has one beat and it doesn't bite. That is round 1's finding again, in a bigger room |
| R10–R12 | P | It is composed on paper (the lane over the hummocks) |

The rescope's bounce caps under W7 (rescope item 4) aren't built.

**What would make it great:** HK's Vengefly over the climb in King's Pass room 4.
- **Remove W-hummock's catch-and-throw.** Make it a wick she must snuff from inside the lane (it lights her but
  doesn't pull).
- Build the planned caps in the dip, so the only way onto hummock B is a cap bounce whose apex sits in the hawker's
  dive.
- Let the snuff send the hawker off only after one last committed dive.

### R9 `wood-lantern`: 11 P / 1 F, fails
| Item | | Evidence |
|---|---|---|
| R1–R2 | P | L1 over a two-level floor, the hanging ledge on its root, the broken face and its thorn band |
| R3–R6 | P | Fixed since round 1: the west door is clear. The bark panel reads in grey as hatched bark with motes and a dark void under it (`r9-shaftfoot.png`) |
| R7 escalation | **F** | The combination (the burrback on P, the dangler, L1) is **off the critical path**. You walk the floor under P (x 300 → 3184 in ~8 s, 0 hits). The room ends in a calm floor-panel cut. The hardest moment of the CP is the panel, which is a timing problem, not a threat. Measured: a hop of 10 frames, then down+attack at +10 to +18 frames hits; at +22 or later, or during the rise, it whiffs with no feedback (9 timings tried, 3 hit) |
| R8–R12 | P | |

**What would make it great:** the lantern should *be* the door. Nine Sols' dog in the laser corridor works because
the creature and the terrain change each other. Some options:
- move the bark panel under P's east end, so you cut down through the floor beside the fenced burrback, under the
  dangler, inside L1's field;
- or make L1's snuff release the moths that eat the panel (story and mechanics in one).

Either way, let a **standing down + attack** on a floor panel count. It's a door, not a pogo test.

### R10 `wood-well`: 11 P / 1 F, fails
| Item | | Evidence |
|---|---|---|
| R1 purpose | **F** | §0.1. Entered from the hub's mesh, the room is "drop, walk, wall jump"; the pit and the gate are never met. The W8 throw skip from round 1 is fixed (the gate runs floor to roof and W8 is behind it) |
| R2 | P (weak) | The chute stepping down in the dark into a sealed pit. But the pit is a flat 2048×768 box, and the old burrback is a slightly bigger dome: no scale change, nothing to sketch |
| R3–R7 | P | Chute lines, W-chute, W8, P4; chute → pit → glade → climb |
| R8 | P | The pit lock now frames the gate too (`pit.png`) |
| R9 | P | A boss is exempt from the 30 s rule. The runback is still long; see C5 |
| R10–R12 | P | Cracks per hp lost; the gate reads |

**What would make it great:** False Knight's arena is a hall you pass near before the fight, and its reveal is the
floor breaking. Two changes:
- Show the pit from the chute: a slit in L2 or L3 through which the sleeping shell is seen 30 s before the drop.
- Give the shell a scale: make it twice a burrback, and make the pit taller than wide, so the ram reads as a giant.

### Room totals

| Room | Score | Result |
|---|---|---|
| R1 hatch | 11 P / 1 F | **F** (R3) |
| R2 chase | 12 P / 0 F | P (weak) |
| R3 wicks | 11 P / 1 F | **F** (R4) |
| R4 burrow | 12 P / 0 F | P |
| R5 glade | 12 P / 0 F | P |
| R6 glidewalk | 12 P / 0 F | P |
| R7 hollow (hub) | 12 P / 0 F | P |
| R14 caps | 12 P / 0 F | P |
| R8 hawkers | 11 P / 1 F | **F** (R7) |
| R9 lantern | 11 P / 1 F | **F** (R7) |
| R10 well | 11 P / 1 F | **F** (R1) |

**Items: 127 P / 5 F. Rooms: 6 pass, 5 fail** (round 1: 0 of 10 passed). Every failing room is one must away from
passing.

---

## 2. The chunk

### C1–C14
| Id | | Evidence |
|---|---|---|
| C1 novelty | P | Something new every ~1–2 min *(est.)*: hatch 0:00, vista and title 1:00, catch and snuff 1:30, burrback 2:15, seed pogo 2:45, glide 3:30, gap-1 walk-off 4:15, thorn branch and P-t3 5:15, bark and pocket 5:45, hub and glimpse 6:15, caps and dangler 7:00, the hollow (upgrade) 8:00, the moth-stone (map) 9:30, the root ladder (story) 9:45, hawker 11:00, the sign 11:30, lantern + burrback + dangler 12:30, panel down 13:30, chute 14:00, old burrback 14:30, wall jump ~18:00, climb-out 18:30, crown 19:30, canopy line 20:30. The longest gap is the boss fight itself |
| C2 challenge types | P (count) | 4 creature kinds (burrback, hawker, dangler, old burrback); thorns, wick, lantern, seed-case pogo, rotten bark (wall and floor), bounce caps, glide gaps, a broken face. That is 12 types. Combinations ≥ 6: R4 burrback+wick+step, R6 glide+wick, R6 glide+thorn branch, R6 landing+burrback+wick, R8 hawker+wicks+hummocks, R9 lantern+burrback+dangler, R10 chute glide+dangler+wick, R14 cap+dangler+wick. **In play, only R4, R6 and R14's cap-2 landing bite (§0.3)** |
| C3 finds | P | ~17 optional finds in ~22 min *(est.)*, about one every 1.3 min, in **four kinds**: lamps (moths), the moth-stone (map), the hollow (quick wings), firefly signs. W-cave and S1 are missed by a hold-right player, and so is all of R14 (the naive and speedrunner bots skip it). Weak spot: the "secret" hollow is in plain view, and every bark panel glows |
| C4 promises | P | W-hi3, W-hi4, R5's east trunk, the hub shaft and crown, W-ff on the far branch, L-gap, R9's shaft, R9's W-high, the well lid. Glide pays at once (W-alcove); wall jump pays in ~1 min (climb-out, crown, canopy line); quick wings pays at the next catch (R8 or R9) |
| C5 rest | **F** | Cadence passes: P1 3:15, P2 3:45, P-t3 5:15, P3 6:15 (again ~10:15 on R14's loop), P-dark 11:45, P-chute 13:45, P4 ~18:00. **The boss-door rule fails.** A fade in the pit re-forms her at P-chute, 4,900 px and four gaps (two of 640, wanting jump-glides) up a dark chute under `dang-chute`. My clean real-key run took **782 frames (13.0 s)** from the patch to the pit floor. One missed glide is a catch back to the ledge. The naive bot logged 27 fall catches in R10 across its retries. A first-timer will run back 20–30 s, against ≤ 15 s |
| C6 loop | P | R9's panel → the chute → the pit → glade 2 → the climb-out → the hub: the lock and its key meet, and the forced R9→R7 backtrack is gone. R14's drop to R6's bough → the hub. The canopy line east after wall jump is new ground. The well lid opens as the shortcut down |
| C7 lost | P *(predicted)* | Bots: no persona lost > 2 min, except the naive one at the old burrback ("can't do bosses"). Cautious: 32 s and 16 s in R14 around cap 3 and step 3, and 11 s in R9. Risks: R9's panel (reading the dead end, then the down-cut timing) and the first hub choice. Briefly unsure: the hub and R9's shaft foot |
| C8 teaching ladder | **F** | Passes for glide, the pogo, the wick, rotten bark and the dangler: R14 alone → R14 at the cap landing → R9 in a combination → R10 over a glide landing. Fails for three others: **the hawker** has one rung (R8, intro only, and toothless); **the lantern** has one rung, and it is introduced *inside* a two-creature combination (R9); **bounce caps** have two (R14 and the hub brackets), never twisted or tested. R8's caps were the planned twist |
| C9 difficulty | P *(predicted)* | No death is possible before R6 (~5 min). Bots: 0 deaths outside R10 for every persona; the naive bot died 7 times in R10. Round 1's unplanned spike at R6 gap 3 has been addressed (P-t3, the branch moved, gap 1 teaching the line). The deaths should cluster at the old burrback, which is a boss |
| C10 peak | P (weak) | The staged vista (1:00) and the old burrback (~14:30). The mini-boss can be skipped from the hub (§0.1) |
| C11 story | P | In play: the vista and its stragglers, W1's circlers and the dead moth, the hub glimpse, Tatter's want (it gazes at B1 and tries), the root ladder (the cut root falls; ladders hang in the hub), and Tatter ahead at P-dark and P4. **Tatter has a want the player acts on.** Weak: it all sits on the optional branch, so a hold-east player sees Tatter's want and never its payoff |
| C12 shape | P | Rises at R4, R6 gap 3, R9, then the peak at R10 in the last third; rests at P1–P2, the hub, R14's top and P-dark |
| C13 first boss setup | **F** | The arena is never seen or felt before the fight: she drops through a roof hole from a dark chute, and the camera locks. The rhythm is rehearsed by three burrbacks. The reveal is now staged (cracks per hp lost). And it can be skipped (§0.1) |
| C14 length | P | Glide at ~3:30 ≤ 15; glide, wall jump and quick wings by ~18 min ≤ 75. **But see §0.2:** the area is ~22 min against the rescope's 30–40 |

**Must items: 9 P / 2 F** (C5, C8). **Should items: 2 P / 1 F** (C13). **The chunk fails**, narrowly. It is much
closer than round 1 (4 P / 7 F on the musts).

### Minute by minute (first-timer, *est.*), against the rescope's beat sheet
Key: **N** novelty, **T** threat that actually bites, **F** optional find, **R** rest, **V** view or story staged.
○ means present but weak.

| Min *(est.)* | Rescope target | Room | What they meet | N | T | F | R | V | Against the bar |
|---|---|---|---|---|---|---|---|---|---|
| 0:00–0:35 | 0:00–1:30 | R1 | Fade-up, cocoon, swarm, Tatter, run, promise gap | ● | | | | ● | the strongest minute; no decision |
| 0:35–1:15 | | R2 | Trunk run, two drops, W-cave behind the landing, **vista + LAMPFALL + stragglers** | ● | | ● | | ● | the set piece is built; no pursuer |
| 1:15–2:00 | 1:30–5:00 | R3 | Caught at W1, beat free, circlers, dead moth, knob snuff | ● | | | | ● | one find |
| 2:00–3:30 | | R4 | Burrback under W3, seed-0, seed gap (tries), pocket, P1 + Tatter | ● | ● | ● | ● | | dense |
| 3:30–4:15 | 5:15 | R5 | Bask, glide, chasm, W-alcove | ● | | ● | ● | ● | glide pays at once |
| 4:15–6:00 | 6:30–10:00 | R6 | Walk-off under the roof, W4, W5 line, P-t3, thorn branch, burrback, bark, pocket, sign | ● | ● | ● | ● | | the first test, with a rest before it |
| 6:00–6:45 | 10:30 | R7 | P3, **the glimpse**, Tatter's want, the choice | ● | | | ● | ● | **4 min ahead of the beat sheet** |
| 6:45–10:00 | 11:30–16:00 | R14 | Dangler alone, cap stair, cap-2 landing + dangler, hollow, stone, root cut, drop | ● | ○ | ● | | ● | 4 finds in 3 min; one beat repeated |
| 10:00–10:20 | | R6→R7 | The return bough, east (6 s flat), ladders in the hub | | | | ● | ● | |
| 10:20–11:45 | 16:00–19:30 | R8 | Hawker (dives, misses), W-hummock throw, S1, sign, P-dark + Tatter | ● | ○ | ● | ● | ● | the threat doesn't bite |
| 11:45–13:45 | 19:30–23:00 | R9 | L1 + burrback + dangler (optional), walk under, shaft lock, the panel (tries) | ● | ○ | | | | the CP has no threat; the panel is a timing hunt |
| 13:45–14:30 | 23:30 | R10 chute | P-chute, two glide gaps, dangler, W-chute | ● | ● | ● | ● | | |
| 14:30–18:00 | –27:00 | R10 pit | Old burrback, 1–3 fades, each a 20–30 s chute runback | ● | ● | | | | the peak, in the last third; runbacks too long |
| 18:00–18:30 | 27:30 | glade 2 | Wall jump, P4, W8, Tatter | ● | | ● | ● | | |
| 18:30–20:00 | 28:00–30:00 | climb-out, hub | Climb, mesh, the well lid opens, up-shaft, **crown** | ● | | ● | | | the payoff in ~1 min |
| 20:00–22:00 | 30:00–35:00 | R8–R9 high | The canopy line, W-canopy (dangler), W-high, the window into the shaft | ● | ○ | ● | | | new ground east; area 1 ends at the shaft |
| (+4–5) | | R1–R5 return | W-hi3, W-hi4, R5's trunk (optional) | | | ● | | | |

**Cadence against the bar:**
- **Novelty:** passes. Never more than ~2 min without something new, except during the fight.
- **Finds:** pass. About one every 1.3 min; the first at ~0:50 (W-cave).
- **Rest:** passes, except at the boss door (C5).
- **Events per minute:** ≥ 2 nearly everywhere. The thin stretches are the 6 s return bough and R9's walk under its
  own encounter.
- **Threat:**
  - real threat comes only at R4, R6 and R10, with R14's cap-2 landing as a minor one;
  - **from ~6:00 to ~13:45, nearly eight minutes, nothing on the critical path can hurt her** except a dangler she
    stops under;
  - HK's Crossroads keeps a husk or an aspid in every other room.
- **Length:** ~22 min against 30–40. The beat sheet's minutes are ~1.6× the build's, room for room.

---

## 3. Round-1 items: fixed, partly, not

| Round-1 item | Status | Evidence at HEAD |
|---|---|---|
| §0.1 / 1. The mini-boss skippable by accident (the W8 throw onto the gate) | **Partly** | The pit is sealed to the roof, the gate runs floor to roof, W8 is behind it, and the no-skip test exists. **A new skip:** the hub's mesh drops into the climb-out (§0.1) |
| §0.2 / 2. Set piece and story beats missing | **Fixed (mostly)** | The vista (stream, title, lights, stragglers, hold), the glimpse, circlers, the dead moth, Tatter's want and the root ladder, Tatter ahead. Still missing: a pursuer in the chase, the east arch's glow, R14's view |
| 3. One find every ~7 min, one currency | **Fixed** | ~17 finds in ~22 min; lamps, the map stone, an upgrade hollow, signs. Nothing is truly hidden |
| 4. R6 gap 3: untaught line, 5-frame window, 40 s fade | **Fixed** | The roof over E0 teaches the walk-off (12+ frame window, free failure), the `gap1` zone, P-t3, the branch over the apex. To be confirmed by the first-timers |
| 5. Flat rooms with one feature | **Partly** | R8 and R9 grew to two levels; R2's trunk; R3's knot (thin). R8's hummocks are 192 bumps, the pit is a flat box, and R14 repeats one beat four times |
| 6. The hub doesn't read | **Fixed** | Rest and look-up zones, the glimpse, the cap ladder. The arch glow and the lid's read are still owed |
| 7. No loop, double backtrack | **Fixed** | R9 → R10 → the climb-out → the hub; the canopy line east; R14's drop; the well-lid shortcut |
| 8. Encounters toothless and single | **Partly** | The dangler added; R9's two-creature combination built. But the hawker still lands 0 hits, three of four danglers never hit, and R9's combination is off the CP (§0.3) |
| 9. Rest gap 10–17.5 min, none in R6 | **Fixed** | P-t3, P-dark, P-chute |
| 10. No safe pogo intro | **Fixed** | Seed-0 over F1 |
| Extra: no `purpose` field in the room JSON | **Not** | Still only a `PURPOSE:` note; R1 can't be linted |
| Extra: R5's east trunk doesn't read as "later" | Not checked | No change in the data |
| Round-1 first-timers: R9's "pillar" box at the west door | **Fixed** | The ledge hangs from the canopy; the door and spawn are clear |
| Round-1 first-timers: hub traps (grate hole, well under the shelf, popping up under the floor) | **Fixed, with a new hole** | The one-way mesh, the root lip, the well lid. But the mesh is the §0.1 skip |
| Round-1 first-timers: falls in R1 resetting to the cocoon | **Fixed** | A fall returns her to the ground she left |

---

## 4. The 10 worst problems now, ranked, with fixes

1. **The hub mesh skips R8–R10's pit and the mini-boss** (§0.1; fixes R10 R1, C10, C13 and the whole chunk's
   pacing).
   - Make the mesh refuse a drop-through: a `noDrop` one-way, or a flag gate under it, shut until `wood-climbout`
     (the climb-out opens it from below, as the grate did).
   - Add the no-skip claim from the hub side to `wood-rooms.test`: with `wood-old-burrback-down` unset, no input
     from the hub floor reaches glade 2.
   - Teach the bots that a mesh is droppable, so the breaker sweep finds the next one.
2. **The area is ~22 min, not 35** (§0.2; G2 and the rescope).
   - **First, measure it.** Round 2's first-timers must log minutes per room, and the beat sheet's minutes should be
     corrected to what they show.
   - **Then add play, not distance.** Build what the rescope listed and never got:
     - R8's cap gap under the hawker's lane;
     - the cap-bounce shortcut up to the hub's arch;
     - R14's window onto the glow-cap.
   - **Make the lantern room's combination the critical path** (problem 4). That alone adds 1–2 real minutes.
   - **If that still lands under 30,** move the area-1 boundary to include R11's wall-jump test (the climb is the
     wall-jump ladder's "test" rung anyway). Don't stretch the walks.
3. **The hawker never hits, and three of four danglers never hit** (§0.3; fixes R8 R7, C2 in play, C8).
   - **Hawker:**
     - remove W-hummock's pull, or move it so its throw lands *in* the lane;
     - put the hawker's dive on her predicted landing, not where she stood;
     - let its snuff-dispersal wait for one last committed dive.
   - **Danglers** drop on fixed points that a runner passes at 9.6 px/f. Place each where she has to stop or slow:
     - `dang-c1` over cap 1, at the bounce's apex;
     - `dang-lantern` over the panel (problem 4);
     - `dang-canopy` over a canopy gap's landing.

     Or give the drop a lead.
   - **Target:** a first-timer takes 1–2 hits in R8 on the first pass.
4. **R9's combination is optional, and its CP ends in a fiddly floor-panel timing hunt** (R9 R7, C8, C7 risk).
   - Move the bark panel under P's east end (inside L1's field, under the dangler, beside the fenced burrback), or
     make L1's snuff open the way down.
   - Let a standing **down + attack** on a floor panel count. Measured: only 3 of the 9 hop-and-cut timings I tried
     hit, and a miss gives no feedback.
5. **The mini-boss runback is ~13 s clean and ~20–30 s realistic** (C5).
   - Add a patch on the block beside the roof hole (5632–5760, y 1280) and make it the room's `reform`.
   - The chute becomes a one-time descent, and a retry is ≤ 5 s from the drop.
6. **The old burrback's arena is never seen before the fight, and has no scale** (C13, R10 R2).
   - Cut a slit in L2's or L3's floor through which the sleeping shell shows ~30 s before the drop (HK's False Knight
     hall, passed before it is fought).
   - Make the pit taller, and the shell visibly bigger than a burrback.
7. **Three ladders are one or two rungs** (C8).
   - **Lantern:** one lantern alone over safe ground before R9. For example, in R8's dark half over P-dark's
     approach. No creature sees it, so the threat lint holds.
   - **Hawker:** a second hawker beat on the canopy line, over a gap after wall jump (the "twist").
   - **Caps:** the R8 cap gap (problem 2) is the "develop". One cap used against her in R14 is the "twist".
8. **R14 is one beat four times, its secret isn't hidden, and its top has no reason to look up** (R14 caveats, C3's
   "missed").
   - Twist two caps: a thorn ceiling over cap 3 (let go of jump for the small bounce), and cap 4 reachable only by a
     glide off step 3.
   - Hide the hollow: no outline, no light column; spores in the seam only.
   - Open a window at the top onto the hub's canopy gap and W-ff.
   - Move the moth-stone *before* the hollow, so reading the map shows an unexplained gap in step 3: a hint, not a
     sign.
9. **Eight minutes with no threat on the critical path (~6:00–13:45), and the opening is a hold-right corridor**
   (R1 R3, R2 R7, R3 R4, C12's rises).
   - **The middle:** problems 3 and 4 do most of it.
   - **The opening:**
     - R1: a find west of the cocoon row (the King's Pass rule);
     - R2: one trunk section that drops as she crosses it, with a catch under it (one "go!" beat before the vista
       hold);
     - R3: a second find, a pocket under the knob.
10. **Tatter's payoff and the moth-stone sit on an optional branch most players reach late or never** (C11, C3).
    - The naive and speedrunner bots skip R14 on the way east. A first-timer who goes east first meets wall jump,
      the crown and the canopy line, and heads into area 2 without ever seeing why Tatter stares at the shelf.
    - Put a pull on the branch: let Tatter hop at B1 and fall *in frame* every time she passes P3 before the ladder
      is down (it already has the try; make it repeat).
    - Or put the moth-stone where it's due, so the map shows the unfinished area.
    - Ori's Gumo moves the player around; here the character should at least ask twice.

Not in the ten, but should be fixed:
- **Designer overlays show with labels off.** Camera-zone frames (purple dashes), trigger boxes (teal) and catch
  rectangles (red dashes) are drawn in the player's view (`r2-vista2.png`, `entry-wood-hollow.png`,
  `caps-top.png`). Either they are part of the greybox language (then document it in `memory/greybox.md`) or they
  are noise. A red dashed box over a gap reads as a hazard, the opposite of what a catch means (R12).
- **Room data:** the `purpose` field is still missing from every room JSON. The hub's east-arch glow is still
  `TODO render`.
- **Doc drift:** the R1–R5 return, R5's east trunk and the drowned-roots seep aren't shown as locks in grey. The
  rescope's §9 targets have no R14 row (the region report shows `-`).

---

## 5. What's good (keep)

- **The loop.** R9's floor → the chute → the pit → glade 2 → the climb-out → the hub's crown → the canopy line east
  is real metroidvania structure:
  - the lock (R9's shaft) and its key (wall jump) meet in one room;
  - the second trip east is new ground above the first;
  - the well lid turns the descent into a shortcut.

  Round 1's double backtrack is gone.
- **The staging is built and reads in grey.** The vista hold has the swarm streaming over the moon, LAMPFALL, warm
  valley points and stragglers dropping over the lip. The hub glimpse (the firefly hangs W-ff, then darts) gives the
  region its question in under 5 s with input free. Together with Tatter's want and the root ladder, it is the
  chunk's first wordless relationship beat. It meets quality-bar §4's "a camera move onto something with a shape".
- **Finds per minute are at the bar,** in four kinds, with a map stone and an upgrade among them. Round 1's "one
  currency" problem is solved.
- **Teaching fixes that are cheap to fail:**
  - seed-0 bounces in place over the floor;
  - gap 1's roof makes the walk-off the only line, with a 12+ frame window over a safe floor and rungs back up;
  - P-t3 sits before the test.

  This is Celeste's "shown safe, then tested".
- **R14's cap stair reads instantly in grey** (pink tops and chevrons), each landing is in frame before the bounce,
  and the cap-2 landing under `dang-c2` is the chunk's best small composition.
- **The hub is now a hub.** The `rest` fit zone shows the whole room with its three ways at once, the cap ladder
  invites, and the shaft shows its height.
- **The pit is sealed** (the round-1 skip is closed), its lock frames the gate, and the old burrback shows its damage
  as cracks.
- **The bots run the whole chunk** (three of four personas through, with bark floors, meshes and cap chains
  understood). That makes every future round measurable in seconds.
