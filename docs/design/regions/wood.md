# The wood: region design (paper)

Draft 2, 2026-10-18. The top-down half of the region loop (`STUDIO.md`): implementers greybox the rooms from this doc,
and persona bots and reviewers check the build against it. It follows `docs/design/core.md`, `world.md`,
`journey.md` and `creatures.md`, and is checked against `docs/research/metroidvania-craft.md` §8. Scene 1
(`wood-hatch`) is kept as built. Where this doc changes a number from those docs, §11 says so and why. Matt said
"don't ask, decide", so every call is made here and the big ones are listed at the end for his veto.

## Rescope (2026-10-18): the wood becomes two areas, ~70 minutes

Matt set the game's length to Ori's (`quality-bar.md` §1.6), and the bar's §5.4 finds the wood compressed: glide,
wall jump, a mini-boss, a boss and two set pieces in ~38 minutes, against HK's 45–70 minutes for one boss and one
spell. The whole-game plan is now 14 areas (`world.md` §2.2, `core.md` §4). **This section wins over the rest of
this doc** where they disagree. §1's 35–45 minutes, the §2 beat sheet after 10:00, the §9 targets, §10's exit
criterion 3 and §11's decision 16 are superseded until the chunk iteration rewrites them.

**The new shape.**

| Area | Rooms | Median (range) | Abilities | Peaks | Hub |
|---|---|---|---|---|---|
| **1. The wood floor** (the current chunk) | R1–R10 as built, plus **R14 `wood-caps`** (new) | **35 min (30–40)**, from ~22 on paper | glide ~0:05, wall jump ~0:28 | the chase and vista 0:01, the glide test ~0:09, the old burrback ~0:25 | the hollow (R7) |
| **2. The high wood** (the next chunk) | R11 climb, **R15 `wood-boughs`**, **R16 `wood-knot`** (the area's hub), R12 web, R13 grove and the canopy edge; optional **R17 `wood-gallery`** | **35 min (30–40)** | ***Gust*** ~1:06 (glade 3 at the canopy edge, the Weaver's reward) | the web gauntlet ~0:48, the Weaver ~1:00 and the relight | the knot (R16) |

Area 1 ends with the crown payoff after wall jump; area 2 starts at R9's broken-face shaft. The wood's arc and three
feelings stay, and the third ("my wings are getting stronger") gets a third beat: glide, claws, then a wingbeat
strong enough to blow out a flame. *Reason: G2 (areas of 25–60 min), G3 (three abilities within 75 min), and the
bar's §5.4 (the wood at 50–75 min in two areas).*

**What the current chunk must add** to reach ~35 minutes with quality: more to do, never more walking (R5). Ranked;
each line names the rubric item it fixes.

1. **A third creature kind: the dangler** (C2, C13; shortfall 1). A small spider that drops on silk at a lit point,
   with the thread shown first (the Weaver's P2 tell, small), swings once, hangs open for a cut, and climbs back. A
   lamp-guarder: it only drops inside its lamp's light, and a snuff sends it up for good. Sim: the weaver's drop on a
   small weaver (S). Ladder: alone over a safe floor in R14, then over a glide landing or a cap bounce, then under L1 in
   R9 with the burrback below (the chunk's first two-creature combination). It rehearses the Weaver's drops 30
   minutes before the fight.
2. **A new terrain toy: bounce caps** (C2, R2; "flight is the joy"). Mushroom caps that throw her up when she lands
   on them (a solid with a bounce number; the wood kit already lists mushrooms as buildings). Safe in R14, then a
   hawker over a cap-bounce gap in R8, then reused in the high wood.
3. **R14 `wood-caps`, the cap stair** (~4–5 min, 3–4 screens; purpose teach + secret). The hub's third branch: from
   the hollow's root shelf, north-west and up toward the canopy. The caps and the dangler alone, then together; **the
   wood's moth-stone** at the top, with a view across the canopy gap to the firefly's glow-cap from the other side; a
   **moonlit hollow** behind rotten bark (quick wings: beat free in 2 presses), the chunk's secret a first-timer
   misses; 2–3 lamps; and a drop back to the hub floor, so it is a loop. The hub becomes a real three-way choice
   (C7: briefly unsure, never lost).
4. **Grow R8 and R9** (R2, R3, R10; suspect 2: both are 3200×1600 boxes with one floor and one lamp). Each to ~4
   screens with height and two lines through it. R8: the hawker's wick over a gap with bounce caps under it, and the
   dark half keeps S1 and adds a firefly sign. R9: the lantern over a two-level floor, the burrback low and a dangler
   high, and the broken-face shaft as it is.
5. **Finds of four kinds** (C3; shortfall 3), from one optional find every ~5 min to one every ~2.5: +4–6 optional
   lamps (R14, R8, R9), the moth-stone (R14), two firefly signs (under R6's gap 1, in R8's dark half) and the hollow
   (R14). The first health milestone stays at 110 moths, in the Weaver's burst.
6. **Return legs that aren't dead walking** (R5, C6; suspect 7). The walk back from R9's lock gets a cap-bounce
   shortcut from R8's floor back up to the hub's arch, and the walk east after wall jump passes the R8 sign and a new
   high line over R8's caps. Loops then: the grate, the cap stair's drop, R8's shortcut, and the optional R1–R5 return.
7. **Tatter wants something** (C11; suspect 8). It walks the road and keeps getting stuck: at the hub it waits under
   the root shelf it can't climb. When she cuts the hanging root at the top of the cap stair, the root falls as a
   ladder, and from then on Tatter is ahead of her at the next patch. A flag gate and two Tatter positions (both
   exist). A small story call, flagged for Matt (README).
8. **Fix the measured forgiveness problems** (R7, R9, C8; suspect 5): W5's throw landing in gap 2's thorns, R6's
   gap-3 skip by gliding on after W5, L1's hit and catch rates.

**Target beat sheet for area 1** (first-timer minutes; the chunk iteration measures and corrects it): hatch, chase,
vista 0:00–1:30 · wicks and burrow, the seed-cases, P1 1:30–5:00 · glide 5:15 · glidewalk 6:30–10:00 · the hub and
the glimpse 10:30 · the cap stair 11:30–16:00 · the hawkers 16:00–19:30 · the lantern and the lock 19:30–23:00 ·
the well and the old burrback 23:30–27:00 · wall jump 27:30 · climb-out and crown 28:00–30:00 · the optional R1–R5
return or straight on up R9's shaft 30:00–35:00. About 18 novelties in 35 minutes (C1), 3 creature kinds and ~10
challenge types (C2), ≥ 4 combinations (C2), ≥ 6 visible locks (C4), three loops (C6).

**For the next chunk (area 2),** in outline: R15 `wood-boughs` (crumbling bark bridges above the canopy line, the
**bombardier** on a ledge spitting arcs across them, a swinging lantern); R16 `wood-knot` (the area's hub: P5, a
moth-stone, Tatter, three exits: the web hall, the optional R17 gallery with a sign and a hollow, and the landing
of the edge drop); the **web gauntlet** in R12 (the orb web, a bombardier behind it and a dangler composed, Nine
Sols' gauntlet before the boss); glade 3 (**Gust**) in the open moonlight at the canopy edge after P7; and **the
edge drop**, one way back into the knot, past Gust's first old payoffs (R11's thorn niche, the web hall's high
strands). Area 2 holds ~20 lamps.

---

**Draft 2** answers paper review 1 (`reviews/wood-paper-1.md`) and uses the lamp lab's real lure numbers
(`memory/lures.md`). Every reach number below was measured in the sim (headless probes on `step`, the way
`tests/unit/glide.test.ts` does it), not taken from a straight line. What changed:
- The hub well moved into an alcove off the walkway. Glade 2's climb-out now comes up through the hub floor and
  carries on up the hub's up-shaft.
- The pogo is taught as a ladder.
- R8 is split into `wood-hawkers` and `wood-lantern`, and the second hawker is cut. That makes 13 rooms.
- The glide gaps were re-derived from real trajectories. W4 and ledge M are gone, and gaps 2 and 3 are wider.
- The Weaver is rebuilt: spokes only in P1, a smaller pull, three ring flames on a retry, and half-arena swings with
  the safe spot opposite.
- The wall-jump ladder escalates: broken faces, a rest ledge, and flat rooms in between.
- R1–R5 reopen with wall jump.
- Tatter walks; the glimpse happens in the hub; the relit flame sits on the critical path.
- The leaks from §4 of the review are closed.

**Units.** "R6" means room 6 in the §3 table. Px, a 64 px grid, a screen is 1920×1080. Room coordinates are local (x
right, y down, y = the top of a floor). The wood's kit has no double jump and no dash.

**Measured reach** (default tuning, run speed 9.6 px/f, x past the lip when her feet are this far below launch):

| Drop below launch | 0 | 128 | 192 | 256 | 384 | 448 | 512 | 640 | 832 |
|---|---|---|---|---|---|---|---|---|---|
| Walk off, no wings | | 141 | 170 | 198 | 256 | 285 | 314 | 371 | 458 |
| Jump at the lip, no glide | 486 | 544 | 573 | 602 | 659 | 688 | 717 | 774 | 861 |
| **Walk-off glide** (jump already held, wings open at the lip) | | 348 | 486 | 623 | 908 | 1045 | 1193 | 1468 | 1890 |
| **Jump-glide** (jump at the lip, held) | 486 | 622 | 760 | 897 | 1182 | 1319 | 1467 | 1742 | 2164 |

- The jump-glide rises over a hump first: 189 px above launch at x +100, a peak of 276 at x +250, back to launch
  height at x ~470. After that it runs 53 / 121 / 169 / 212 / 260 px below launch at x +500 / 600 / 700 / 800 / 900.
- The walk-off glide is 22 / 113 / 204 / 295 / 386 below launch at x +100 / 300 / 500 / 700 / 900.
- Every glide gap below is built so that the plain jump misses by ≥ 100 and the glide it asks for makes it by ≥ 150.
- **Wall kick across a shaft**: kick off face A, hold jump and toward face B. She meets B 253 / 273 / 229 / 172 /
  109 / 52 px *higher* than the kick for shaft widths 256 / 384 / 512 / 640 / 768 / 896. On one wall alone she
  climbs ~230 px a kick. There is **no cling**: a slide ramps from 2.5 to 6.5 px/f (about 700 px in 2 s).
- **Pogo**: 125 px up. **Standing forward cut**: snuffs a flame up to 120 px from her body centre (not at 140).
- **Jump-cut** (jump held, forward cut in the rise): a wick 200–300 px over the floor goes out from 60–140 px to
  one side in 3–6 of 9 cut timings, and **she is never caught**. A lantern gives 3–5 of 9, never caught. At 180 px
  to the side it misses.

**Lures** (`memory/lures.md`, tuned in the lab):

| | Wick | Lantern |
|---|---|---|
| Radius / core | 240 / 40 | 360 / 52 |
| Pull (edge → core) | 0.15 → 1.9 | 0.2 → 2.3 |
| Swirl | 0.5 | 0.6 |
| Hits / moths | 1 / 5 | 2 / 10 |

- **Beating free**: 3 presses of jump or attack. The throw is 14 px/f plus 7 up, exactly along the held direction
  (8-way; outward from the flame only when nothing is held), then 50 frames of grace for that lure and for every
  core the throw passes through (feel review r1, 3834228). A catch needs her moving inward, or 4 frames in the core.
  Measured since: W1 → M 17 of 17, W5 → T3 8 of 8 holding right.
- **Snuff**: 9 frames of hitstop, 1 health back.
- **Lanterns are static in the sim today.** The swing in this doc waits for the path-follow block, and every lantern
  room works without it.
- The Weaver's heart is a new great-lamp row: R 700 in P1–P2 and 1100 in P3, core 72, pull 0.2 → 2.3, 3 hits.

---

## 1. The wood's job

The wood teaches the game. In 35–45 minutes it turns a newborn moth who can only run, jump and cut into a flyer
who glides, climbs, pogos and reads lamps and predators. It does this in the one place she'll ever think of as safe:
close, dark and old, with the moon above the canopy. Its arc is **left behind → finds the lights are the problem →
grows wings and claws → puts out the first great lamp**. The region ends when its sky clears for the first time, and
a small warm light she has seen once before relights a flame in her path and flies off toward the valley. The three
feelings it must deliver:

1. **"I want to catch them."** The pull of the swarm leaving without her, kept alive by every cloud of moths she frees.
2. **"Light is a trap, the dark is mine."** Every lit room is tense, every dark room is a breath, and every snuff
   turns the first kind of room into the second.
3. **"My wings are getting stronger."** Glide by minute 6 and claws by minute 19. Claws reopen places already seen:
   the hub's shaft at once, then the high wicks of R3 and R4 and the hollow back into them.

---

## 2. Beat sheet and intensity

Minute marks are a first-timer's (the first-timer agent as the reference player), on the expected route (hawkers
before the well; see §3 for the other order), with 1–2 deaths at the old burrback and 1–3 at the Weaver. Intensity
runs 0–10: 1 is resting at a moon patch, 5 is a normal lit room, and 9 is the Weaver's last phase.

| Min | Room | Beat | Int. | Kind |
|---|---|---|---|---|
| 0:00 | 1 hatch | Fade up, the cocoon row, break out (control by 8 s) | 1 | |
| 0:10 | 1 hatch | The swarm overhead, the run, **the promise gap** (glide's lock) | 3 | |
| 0:30 | 2 chase | Off the branch's end after the swarm, then the downhill chase | 4 | set piece 1 |
| 1:00 | 2 chase | **The vista**: the swarm pours down into the valley's lamps. **Title over the moon** | 2 | vista |
| 1:20 | 2 chase | Stragglers peel off the river and dive over the lip; she follows them down | 2 | |
| 1:30 | 3 wicks | **First lamp**: the stragglers circle a wick; a jump across the dip is pulled in, caught, beaten free (the cocoon's input). A dead moth lies below. High up, another wick by a hanging trunk she can't climb (**wall jump's first lock**) | 4 | first catch |
| 2:15 | 3 wicks | **First snuff** from a root knob: hitstop, the dark blooms, 5 moths fly with her | 5 | |
| 3:00 | 4 burrow | **First predator** under a wick. It notices her only in its light. A down cut on its braced shell bounces her (**pogo intro**) | 5 | |
| 4:15 | 4 burrow | **The seed-case gap**: a low root roof, two hard seed-cases, and the only way over is to pogo them. A miss lands on a floor | 5 | pogo, safe |
| 4:45 | 4 burrow | **First moon patch, Tatter already resting there.** A wick glows on a high shelf (wall jump and glide) | 1 | rest |
| 5:15 | 5 glade | Drop down the hollow and land in moonlight: **glide** ("Hold jump to glide") | 2 | glade 1 |
| 6:00 | 5 glade | The only way out is a long glide over the chasm, unpulled | 4 | |
| 6:30 | 6 glidewalk | A safe glide over a floor, the first glide wick on the landing | 4 | |
| 7:30 | 6 glidewalk | A high line through a wick's pull, or a low line under it | 5 | |
| 8:45 | 6 glidewalk | Test: a thorn branch over the jump's hump, thorns below; the low line onto a burrback's ledge | 6 | |
| 9:45 | 6 glidewalk | **Rotten bark** on the critical path, and right after it a second, in the floor, hiding a wick | 3 | secret |
| 10:15 | 7 hollow | **The hub.** Patch, Tatter. **The firefly's glimpse** in the canopy gap overhead: it hangs a glow-cap on a real branch and leaves | 1 | rest, story |
| 11:15 | 8 hawkers | **First hawker** at a wick over a flat, safe floor. A dark half with a secret | 5 | |
| 13:15 | 9 lantern | **First lantern** (2 hits), with only a burrback below | 5 | |
| 15:00 | 9 lantern | The broken-face shaft: freed moths fly up it, and she can't | 2 | lock |
| 15:30 | 7 hollow | Back to the hub, under the root shelf to the alcove, down the well (one way) | 1 | |
| 16:00 | 10 well | **The old burrback** (mini-boss): only a pogo on its braced shell hurts it | 7 | mini-boss |
| 19:00 | 10 well | **Glade 2: wall jump**. Climb out (a rest ledge halfway) | 2–3 | glade 2 |
| 19:45 | 7 hollow | Up through the hub floor's grate and **straight on up the shaft she couldn't climb**: the crown wick, and the glow-cap she saw hung | 3 | payoff |
| 21:30 | 8 → 9 | East through the dark rooms she cleared (a flat walk) | 1 | |
| 22:30 | 9 lantern | The broken-face shaft: kick, glide across, catch the other face | 5 | |
| 23:30 | 11 climb | Broken faces and thorn bands, a lantern bending the crossings, a hawker at the top wick | 7 | test |
| 26:30 | 11 climb | **The look back** above the canopy: the hatching tree far off under the moon. Patch | 1 | vista, rest |
| 27:00 | 12 web | **The orb web** strung across a wick; the weaver runs to where she touches it. Cut it from outside | 6 | |
| 30:45 | 12 web | The approach: dark, silk thick on the trunks, warm light through them. Patch at the door | 1 | rest |
| 31:00 | 13 grove | **The Weaver**, P1: glide to the ring flames between the spokes | 6 | boss |
| 32:00 | 13 grove | P2: drops that swing half the arena; get to the far side and up a face | 8 | |
| 33:00 | 13 grove | P3: lunges on the floor, pogo the abdomen, then the heart | 9 | |
| 33–37 | 13 grove | Retries: patch to door in under 15 s, and a 30 s P1 on a retry | 7–9 | |
| 37:00 | 13 grove | **The great lamp goes out**: the first sky clear, 60 moths, +1 max health, the silk curtain falls. **A small warm light relights an old husk in the chimney ahead of her** | 3 | set piece 2 |
| 37:30 | 13 grove | Climb the chimney, snuff the relit flame in the climb. At the top she sees the firefly leave over the edge | 4 | |
| 38:00 | 13 grove | Patch at the canopy edge. **Tatter walks up out of the chimney behind her** and sits. The exit vista: the valley, a flicker blinking, the mountain | 2 | vista |
| 39:00 | → valley | A long glide off the edge, down into the valley | 2 | |

```
Intensity, first run (one column = one minute)
 9 |                                 #  #
 8 |                                ## ##
 7 |                ###     ##      #####
 6 |        ##      ###    ### ### ######
 5 |   ##  ### #### ###   #### ### ######
 4 |  ### #### #### ###   #### ### ######
 3 |# ### #### #### ### # #### ### #######
 2 |########## ########## #### ### ########
 1 |#######################################
   +---------------------------------------
    0    5    10   15   20   25   30   35
```

There are three rising waves, each ending in a rest. The opening (0–10) peaks at the glide test. The middle
(10–20) peaks at the old burrback, then dips through the crown payoff and the flat walk east. The climb to the boss
(22–38) runs through the wall-jump test, the web and the Weaver. **Novelty:** the hatch (0), the vista (1), pull
and Caught (1.5), the snuff (2.2), the burrback and the pogo (3), the seed-cases (4.2), glide (5.2), the high/low
line (7.5), rotten bark (9.7), the hub and the firefly (10.2), the hawker (11.2), the lantern (13.2), the old
burrback (16), wall jump (19), the broken face (22.5), the look back (26.5), the web (27), the Weaver (31) and the
relight (37). That is one every ~2 minutes, with the longest gap 27 → 31.

---

## 3. Room graph

Thirteen rooms, twelve new, about 52 new screens of area (the hatch adds 10, mostly empty depth). That is more than
world.md's ~32 because tall rooms count their empty air. Every room is ≤ 6 screens except R6 (6.5: three glide
gaps and a return bough). There are seven moon patches. Ids are forever.

```mermaid
flowchart LR
  H["1 wood-hatch"] -->|drop| C["2 wood-chase: vista + title"]
  C -->|drop| K["3 wood-wicks"]
  K <--> B["4 wood-burrow: patch P1"]
  B -->|hole| G1{{"5 wood-glade: GLIDE, P2"}}
  G1 -->|glide| GW["6 wood-glidewalk"]
  GW -->|rotten bark| HUB(("7 wood-hollow: HUB, P3"))
  HUB <--> HK["8 wood-hawkers"]
  HK <--> LN["9 wood-lantern"]
  HUB -->|alcove well, one way| WL["10 wood-well: old burrback"]
  WL --> G2{{"glade 2: WALL JUMP, P4"}}
  G2 -->|wall, grate opens from below| HUB
  HUB -.->|wall: up-shaft| CR["hub crown: wick, glow-cap, stub"]
  LN -->|wall: broken face| CL["11 wood-climb: P5 at top"]
  CL --> WB["12 wood-web: approach, P6"]
  WB --> AR[["13 wood-grove: the Weaver"]]
  AR -->|silk falls, chimney| ED["canopy edge: P7"] -->|long glide| V(["valley rim"])
  GW -.->|wall: return bough| G1
  G1 -.->|wall: hollow shaft| B
  CR -.->|fling or DJ + glide| PG["postgame lamps"]
```

| # | id | Screens (px) | Purpose | Exits | Gates | Lamps | Creatures | Patch | Secrets / later | Visible but locked |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `wood-hatch` (built) | 10 (7424×2816) | Who she is, what she wants, how she moves | S drop | none | none | none | | | **The promise gap** (glide) |
| 2 | `wood-chase` | 5.9 (6400×1920) | Flow and the chase; the vista and the title | N in, S out | one way down | none | none (the swarm) | | T3: a Moonflight lamp over the vista (later, data) | The valley's lamps across the gulf |
| 3 | `wood-wicks` | 4.0 (3840×2176) | Pull, Caught and snuff by consequence | N in, E | N is one way in | W1, W2; W-hi3 (wall jump) | none | | | W-hi3 by the hanging trunk |
| 4 | `wood-burrow` | 3.9 (4480×1792) | The blade against things: first predator, pogo intro and the required pogo | W, S hole | hole is one way down until wall jump | W3; W-hi4 (wall jump + glide) | burrback (4 hp) | **P1** (Tatter) | | W-hi4 on the high shelf |
| 5 | `wood-glade` | 3.2 (2880×2304) | Glade 1; glide's lock room | N, E | glide to leave; wall jump back up the hollow and the east trunk | none | none | **P2** | | |
| 6 | `wood-glidewalk` | 6.5 (5760×2368) | Glide: safe → combine → test; the secret language | W, E | glide gaps; rotten bark; return bough by wall jump | W4, W5, W6; W-pocket (secret) | burrback (5 hp) | | floor pocket | |
| 7 | `wood-hollow` (hub) | 6.0 (3840×3248) | Rest, choice, the story beat, the lock board | W, E, S (alcove well), grate | well one way; up-shaft and grate by wall jump; far branch by fling or DJ + glide | W-crown; L-gap + W-ff (postgame) | none | **P3** (Tatter) | stubs: canopy log (T3+), drowned-roots wall (T2) | Up-shaft and its glow; the grate's moonlight; W-ff burning on the far branch |
| 8 | `wood-hawkers` | 2.5 (3200×1600) | Hawker intro over a flat, safe floor | W, E | none | W7; S1 (secret) | hawker | | S1 | |
| 9 | `wood-lantern` | 2.5 (3200×1600) | First lantern; the broken-face lock and the combine | W, N shaft | wall jump | L1; DJ wick (postgame) | burrback | | | The shaft, with moths flying up it; the DJ ledge |
| 10 | `wood-well` | 3.0 (3840×1600) | Mini-boss (pogo combine), glade 2, the wall-jump lock room | N well in, N grate out | well walls refuse kicks; root gate | W8 | **old burrback** | **P4** | | |
| 11 | `wood-climb` | 2.5 (2048×2560) | Wall jump test; the look back | S, E (top) | wall jump | L2, W10; S2 (risk niche) | hawker | **P5** | S2 | |
| 12 | `wood-web` | 4.7 (4480×2176) | The orb web; the quiet approach | W, E (arena door) | wall jump (capped trunk) | W9; S3 (secret); DJ wick (postgame) | orb web + weaver | **P6** | S3; stub: fallen log south | DJ ledge |
| 13 | `wood-grove` | 5.3 (4736×2304) | The Weaver; set piece 2; the exit vista | W, E (valley) | arena locks; silk curtain | great lamp (5 ring flames + heart); W-relit | **the Weaver** | **P7** (Tatter walks in) | | |

**Order at the hub.** The hub floor runs unbroken from the west door to the east arch, and the well sits in a dark
alcove under the entry's root shelf. Taking it means turning back on purpose. So the expected route is hawkers →
lantern → (the lock) → well. Well-first still works: the old burrback's pogo exam is already taught in R4, and
wall jump's lock was seen at 1:30 in R3, so its lead time is ≥ 13 min in either order. After glade 2 she comes up
through the hub floor at the foot of the up-shaft (the far-side shortcut, opened from below), and the crown is one
climb away.

**Loops and shortcuts.**
- **The glade-2 loop:** hub alcove → well (one way) → pit → glade → climb-out → **grate in the hub floor, opened
  from below** → the up-shaft. The grate is then a drop straight into P4.
- **The return to R1–R5** (optional, with wall jump, ~5 min round trip from the hub; offered, never required):
  1. R6's **return bough**: kick up the trunk at R6's east end, walk the canopy bough west, drop onto R6's entry.
  2. Into R5 at Z, then kick up R5's east trunk and kick-glide west to the glade floor.
  3. Climb the **hollow shaft** up through the hole into R4. W-hi4 is there, and W3 if it was missed.
  4. West into R3: W-hi3, and W1 if it was missed. Back the normal way: R4's hole, R5's glide, R6.

  Nothing in R1–R4 can be missed for good.
- **The return from the boss door to the hub**: a fall down R11 (~3 s), the R9 shaft, then walking through R9 and R8,
  about 50 s.
- **Stubs** (scenery only: no light, no ledge, no map marker): the canopy log in the crown roof (T3+), the seeping
  root wall at the back of the hub's well alcove (T2 drowned roots, which opens from the marsh side), and a fallen
  log heading south off the web hall's floor (an unassigned slot). T2 hooks to add in data later: the dash thorn run
  (R11's top shelf) and the Shroud glass lamp (inside the drowned-roots cave).

**World placement** (world px, top-left; every seam lines up on these):

| Room | x, y | Room | x, y | Room | x, y |
|---|---|---|---|---|---|
| 1 hatch | 0, 0 | 6 glidewalk | 21824, 8064 | 11 climb | 37184, 6208 |
| 2 chase | 5760, 2816 | 7 hollow | 27584, 7168 | 12 web | 39232, 5952 |
| 3 wicks | 11264, 4736 | 8 hawkers | 31424, 8768 | 13 grove | 43712, 4800 |
| 4 burrow | 15104, 4608 | 9 lantern | 34624, 8768 | | |
| 5 glade | 18944, 6400 | 10 well | 27584, 10416 | | |

Forward is always east, so the migration line (which points at the great lamp until it is out, then at the exit)
never points backward. For tech: the hatch's exit fires at `at` 1790, 1026 px above its south edge, so `enterRoom`
places her at the top of `wood-chase` with her velocity kept.

**Where a first-timer gets lost, and what pulls them back within 2 minutes:**

| Where | The risk | Pull-back (cheapest first) |
|---|---|---|
| R4 seed-case gap | Not knowing a down cut bounces | She has just bounced off the burrback's braced shell. A miss costs ~6 s (a floor and root steps back up). Moths drift up between the seed-cases |
| R5 glade exit | A tapper never opens the wings | The item line says "hold". A catch costs nothing. After 2 catches render plays the wings-twitch acting cue on the lip |
| R7 hub, first visit | Four ways out | The arch glows gold, Tatter faces it, the alcove is behind and under her. The glimpse pulls the eye up to the canopy gap (a lock, not a route) |
| R9 east end | A dead end at the shaft (before wall jump) | L1's moths fly up the shaft ("up, later"). It's 35 s back to the hub, where the alcove's moonlight is the only new thing |
| R12 web | Not knowing the web can be cut | One sector near the entry is already slack and cut. W9's trapped moths struggle in the strands |
| R13 P2 | Standing on the near side as the swing comes | The thread tell draws the whole danger arc on the floor band for 45 frames, and the safe side is always the far one |

---

## 4. Teaching the abilities

The ladder from world.md §6, room by room. Failure costs climb with the step.

| Step | Glide | Wall jump | Pogo |
|---|---|---|---|
| 0. Lock | 0:10, R1: the promise gap | 1:30, R3: W-hi3 by a hanging trunk. 4:45, R4: W-hi4 on a high shelf. 10:15, R7: the up-shaft. 15:00, R9: the broken-face shaft | (a verb from the start) |
| 1. Intro / glade | R5: she lands in the moon shaft, so it can't be skipped. "Your wings have dried. Hold jump to glide" plus the glyph | R10 glade 2. "Your claws have hardened. Jump at a wall to climb" plus the glyph | R4: a down cut on the burrback's braced shell bounces her for free. A 192 px root step at its patrol's end makes a hop over its ram fall onto the shell |
| 2. Lock room | R5: the only way out is 960 px of chasm with a 512 drop. A jump makes 717 ✗, a walk-off glide 1193 ✓, a jump-glide 1467 ✓. The chasm is a catch with no cost. No lamp pulls on this glide | R10: the well's walls refuse kicks, and the climb-out is the only way | R4 seed-case gap (required, safe): a root roof 288 over the floor caps the jump, two hard seed-cases sit 290 apart, and a miss lands on a floor 256 below |
| 3. Safe | R6 gap 1: 800 px with a 448 drop over a safe floor. Jump 688 ✗, walk-off 1045 ✓, jump-glide 1319 ✓. W4 waits on the landing | R10 climb-out: 1472 px, two kickable faces, a rest ledge at the halfway point. It carries on up the hub's up-shaft to the crown (optional) | |
| 4. Combine | R6 gap 2: 1024 / 512. The jump-glide's line meets W5's pull (caught, beat free holding right, land); the walk-off line passes under it | R9 broken face: the west face is kickable, then a 320 px thorn band. Kick across the 512 shaft (she meets the east face ~229 higher), carry on up it | R10: the old burrback. While it's braced, only a pogo on its shell hurts it (forward cuts clang) |
| 5. Test | R6 gap 3: 1024 / 512. A thorn branch hangs over the jump's hump, so the jump-glide hits it and only the walk-off glide passes under. Thorns below, a burrback's ledge beyond | R11: two broken faces with alternating thorn bands, L2's field bending the crossings in the middle third, the hawker's dive lane over the top third | The Weaver's P3: the abdomen takes only pogos |
| 6. Look back | W-hi4 in R4 needs glide too. The return bough's drop into R6 shows the ladder from above | The crown wick ~1 min after the key. Then (optional) the return to R1–R5: W-hi3, W-hi4, the hollow | |

Glide's lock comes ~5 min before its key, not 10, because glide arrives at minute 5 (§11, decision 7). Wall jump's
first lock comes 17 minutes ahead (13 on the well-first route), and its first payoff ~1 minute after.

---

## 5. The lamp verb: introduction and escalation

| Idea | Where | How the player learns it |
|---|---|---|
| Lamps pull moths in (demonstration) | R2 → R3 | The stragglers peel off the river, dive over the lip and circle W1 before she reaches it |
| The pull | R3, W1 | W1 hangs 240 over the shelves, over a 256 px dip, spin −1. Measured: **5 of 5 run-up jumps across the dip are caught**, so no special row is needed. A walker only feels a drag (max 2.4 px/f, which she outwalks) |
| Caught and beat free | R3, W1 | Three presses, the same input as the cocoon. The throw is steered by the held direction. The dip has a floor and a dead moth on it |
| The snuff | R3, W2 | A 64-wide, 24 px root knob stops her and the drag. W2 hangs at chest height 112 px from her body centre (measured reach 120). 9-frame hold, the loudest beat |
| Light means noticed | R4 | The burrback ignores her in the dark and notices her in W3's light |
| A snuff scatters guarders | R4, W3 | W3 hangs 200 px up. A jump-cut snuffs it in 3–5 of 9 timings and is never caught. The burrback curls and sleeps |
| The pull as a choice of line | R6, W5 | The high line meets the pull, the low line passes under it |
| A snuff on a pass | R6 (W5, W6) | A cut while gliding. The flame box (20 half-size) plus 110 of reach |
| A heavier flame | R9, L1 | 2 hits from a platform, jump-cuts (3–5 of 9 per cut). It swings once the path block exists |
| A pogo off a flame | R9, L1 (optional), R13 heart | A down cut on a flame bounces her and counts as a hit |
| A pull against walls | R11, L2 | Kick-glides across the shaft get bent by its field |
| Light makes a trap of something else | R12, W9 | The web hangs in the light because moths come to it. The pull drags her toward the hub where the weaver waits |
| Pulls from every side | R13 | Five ring flames, then the heart |

**Escalation: wick → lantern → overlapping fields → the grove.** Wicks with no threat (R3), then a wick with a
ground guarder (R4), then wicks on glide lines (R6). Then the lantern with an old creature (R9), the lantern plus
walls and a wick above it (R11, the fields just touch), a lamp plus a creature's trap (R12), and finally the ring and
the heart (R13). Every lamp is snuffable, and none is a required fling point, so core's permanence rule holds.

---

## 6. Encounters

**Creature ladder** (introduce alone near a safe floor, then pair with a lamp, then with a second kind; never a new
creature and a new lamp kind in the same room):

| Creature | Intro | Develop | Twist | Conclude |
|---|---|---|---|---|
| Burrback | R4: alone under W3, 4 hp, a long safe floor | R6: on T4 after a glide landing, 5 hp | R9: under the first lantern | R10: the old burrback |
| Hawker (the lampwing's sim on the dragonfly look) | R8: alone at W7 over a flat safe floor, 3 hp | R11: at W10 in the climb's top third (dodge by moving on, which on a wall means kicking away) | | (valley) |
| Orb web + weaver | R12: one web, one wick, a safe floor | | | R13: the Weaver |
| Old burrback | R10: mini-boss, 10 hp, a 260 px ram, two braces in a row (a feint). **While braced only a pogo lands** (forward cuts clang); after a wall stun (90 f), cuts land. As a mini-boss it ignores the lit rule (the pit is its den) | | | |
| Firefly | R7: the glimpse (4 s, a path and a slow pulse, no hitbox) | | | R13: the relight |

**Density** (threat points: burrback 1, hawker 1.5, web + weaver 2, old burrback 4; lint at ≤ 1.5 a lit screen):

| Room | Light | Threats | Points / lit screen |
|---|---|---|---|
| 1, 2 | dark | none | 0 |
| 3 | lit (teaching) | none | 0 |
| 4 | lit west, dark east (patch) | burrback | ~0.5 |
| 5 | dark (glade) | none | 0 |
| 6 | lit | burrback | ~0.3 |
| 7 | dark (hub) | none | 0 |
| 8 | lit west, dark east | hawker | ~1.2 |
| 9 | lit | burrback | ~0.6 |
| 10 | pit (mini-boss), glade dark | old burrback | (boss) |
| 11 | lit shaft, dark top | hawker | ~0.9 |
| 12 | lit hall, dark approach | web + weaver | ~0.7 |
| 13 | boss, then the dark edge | the Weaver | (boss) |

Lit and dark alternate, and a still, dark, safe moment is at most 3 rooms apart. No creature is in sight of a moon
patch. No door opens inside a pull field or a notice range.

### The Weaver (greybox spec)

The first major boss is a lesson with **one exam a phase**: P1 tests glide, P2 reading and moving (wall kicks to
stay up), P3 pogo. Goals: a first-timer survives 60 s on the first attempt, a clear takes ~2.5 minutes, and a retry
reaches P3 in ~75 s.

**Arena** (inside `wood-grove`, local x 0–2176, y 1088–2304; the camera locks to this rect at zoom ~0.88 so that all
of it is on screen; if the camera has no zoom, trim it to 1920×1080 inside the walls):
```
 y1088 ═══════════════════════ canopy ═════════════════════════
       ║  pivotW     C1┃   (3)    pivotC    ┃C2   pivotE ║ silk  ║
       ║              ┃(2)·   ╲  │  ╱   ·(4)┃           ║curtain║→ chimney
       ║              ┃     spokes(HEART)    ┃           ║1344-  ║
 1728  ║  (1)·        ┗━                   ━┛      ·(5) ║ 1600  ║
 1920  ║     ═══B1═══                      ═══B2═══     ║       ║
 2176 →╚════════════════════ floor ═════════════════════════════╝
   west trunk x0-128 (entry at floor)            east trunk x2048-2176
```
- Floor y 2176, x 128–2048, flat. The west trunk's east face and the east trunk's west face are kickable.
- Hanging columns C1 (x 576–672) and C2 (x 1504–1600) run from the canopy down to y 1728, both faces kickable.
  One-way branches B1 (448–800) and B2 (1376–1728) sit at y 1920.
- The **heart** hangs at (1088, 1536). The **ring flames** are wick rows at ring-1 (320, 1792), ring-2 (832, 1408),
  ring-3 (1088, 1216), ring-4 (1344, 1408) and ring-5 (1856, 1792). Reach: rings 1 and 5 by a jump-cut from the
  branch ends (≤ 140 px to the side); rings 2 and 4 from the column faces (a kick toward them); ring 3 by a
  kick-glide from a column top.
- **The P1 web is spokes only**: one strand from the heart to each ring flame, and nothing between neighbours. No
  strand crosses an approach to a ring flame. Touching a spoke is Caught, gentle (no bite).

| Phase | Exam | What happens | Tells and timings (60 Hz) | Ends |
|---|---|---|---|---|
| **P1: the ring** (~50 s first time, ~30 s on a retry) | glide | The weaver sits on the heart. She snuffs the ring flames; each snuff drops its spoke and gives 1 health back. The heart pulls with R 700 (the floor's outer thirds and both trunks are outside it). Caught in the heart's core, the weaver's eyes go hunt colour and count down. **On a retry only rings 2–4 burn**; rings 1 and 5 stay husks | Bite after 60 frames held at the heart, 1 damage, then she is thrown out | The last ring flame. The spokes fall, the weaver climbs into the canopy (2 s, harmless) |
| **P2: the drops** (~40 s) | read the arc, move, kick up a face | Three drops in order, from pivots over x 448, 1728, then 1088. Each starts with the thread tell: a pale arc drawn on the floor band showing the whole swing. The weaver drops to one end of its arc (thread ~1010 px, ±40°: it sweeps x pivot ± 650, and the ends rise ~240), swings through to the other end and back to the bottom, then hangs winded. **Each swing covers half the arena, and the safe side is always opposite**: the far trunk or the far column. The columns' feet (1728) are above the band's highest point (~1860), so a face is safe while she keeps kicking (one wall is enough, ~230 px a kick; a plain slide from a column top lasts ~110 f) | Tell 45 f, drop 18 f, swing 60 f (123 f in all, enough to cross ~1000 px and kick once). Winded 90 f (open: 2–3 cuts), or cut its thread and it falls stunned for 120 f. Contact 1 | 3 hits taken |
| **P3: the floor** (~45 s) | pogo | The heart's pull grows to R 1100. The weaver hunts the floor: a lunge (rears up with flashes quickening 30 f, then 240 px at 10 px/f), then lies winded with its abdomen up for 60 f. Front cuts glance off its fangs, and **only a pogo on the abdomen lands**. Between lunges it skitters up a trunk and drops back on a short thread (shown first, 30 f). After 3 pogos it flees into the canopy for good | Lunge tell 30 f; winded 60 f | The heart lowers to (1088, 1792), unguarded. 3 hits (a pogo on the flame counts) and it goes out |

- **Fairness:** the whole arena is on screen, nothing attacks from off screen, nothing hits during the re-form, every
  attack has a punish window, and every tell reads with the sound off. A death re-forms her at P6, under 15 s from
  the arena, and on a retry P1 is the three-flame version. There are no pits.
- **Ending (set piece 2):** input held ≤ 3 s. The heart dies, the wood's sky clears, all 60 moths burst out (the ring
  flames' moths had fed the heart), and the count crosses the first health milestone (§8). The silk curtain on the
  east trunk falls. A small warm light darts in through the opening and relights **an old glow-cap husk halfway up
  the chimney** (`wood-grove:wick-relit`); five freed moths are pulled back into it. Flags `wood-weaver-down`,
  `wood-relit`.
- **Fallback** (only if a real attempt fails): cut P2 (P1 → P3); the web stays a fixed graph.

---

## 7. Room specs

Approximate dimensions, main floors, gaps with measured reach, lamps, creatures, the critical path (CP), optional
paths, camera. Snap to the 64 grid and keep the margins. Every room gets a `purpose` tag in data, and `edgeKick:
false` unless a spec says otherwise (room edges are never a climb).

**Terrain the sim doesn't have yet** (needed by these specs):
- **Thorns**: a hazard rect, 1 pip and back to the last safe ground.
- **Seed-cases**: non-solid hit targets that never break, so a down cut always bounces. They behave like a pod with
  `blocks`.
- **Rotten bark**: a breakable solid, 3 hits; a floor panel takes down cuts.
- **The grate**: a one-way floor that opens from below.
- **The silk curtain**: a solid cleared by a flag.

### 1 `wood-hatch` (built, kept)
As built (`memory/rooms.md`): 7424×2816, exit `drop` on the south edge, x 6144–7424, `at` 1790. It leads into
`wood-chase` once stage 1 lands.

### 2 `wood-chase`: the chase, the vista and the title (6400×1920; purpose: set piece)
```
y 0   [N in: x 384-1664]
 704  ═══A══════════════╗       (A reaches 2048: a run off the hatch's end lands on it)
 832                    ║  ═══B════════╗
 960                                   ╚═C══════  (twig line, one-ways y 768 over C)
1024                                         gap ═══D═══════╗
 896                                                        ╚═V═══════|lip 5760  VISTA
1920 ═══════ catch (x 256-5056, y 1600+) ═══════════════════════[S out: 5760-6400]
```
- **As built (round 1):** A (256–1600, y 704) → **the fallen trunk** (1600–3328), rolling down from 704 to ~960: she
  runs its back → a **real drop** of ~330 over a 128 gap → E (3456–4480, y 1280) → a second real drop of 320 →
  the lookout V2 (4608–5760, y 1600). A twig line (one-way 3584–4224, y 1056) is the high line over E. A **trunk
  hollow** behind the landing (64–256 × 448–704) holds **W-cave**, a jump-cut from its floor (the chunk's first
  find, ten seconds in, and the up-cut taught where nothing can catch her: 114 over its floor, a standing up-cut
  from under it). A trigger on V2 (`vista`, 4800–5184 × 1344–1600) sets `wood-vista` so the vista plays once per
  save (staging). Catches 200 above the room's foot (the camera keeps her in frame). Landmark: the fallen
  trunk. The vista zone frames V2 (bounds 4416–6400 × 576–1920).
- (Paper) A (256–2048, y 704) → gap 256, drop 128 → B (2304–3200, y 832, rolling) → step down 128 → C (3200–3840, y 960) →
  gap 320, drop 64 → D (4160–5056, y 1024) → step up 128 → V (5056–5760, y 896). Every gap ≤ 320, every step ≤ 128.
  No thorns, no pips. A fall between boughs is a catch.
- **The vista**: a camera lift from x 5000. On V the camera holds ~2 s (input free after 1 s), the swarm pours into
  the valley's lamps (far layer), and **LAMPFALL** appears over the moon. About 8 stragglers break off and dive over
  the lip.
- **Everything east of the lip is the south exit** (5760–6400). A jump off V carries ≤ 720 px (drop 512) and lands
  in the exit, so there is no loop and no catch at the lip.
- Time: 30–60 s.

### 3 `wood-wicks`: pull, Caught, snuff (3840×2176; purpose: teach)
```
y 0   [N in 256-896]                  ┃hanging trunk 1600-1664 (to y 704)
 352   shaft (she falls ~900)  (W-hi3)·┃
 720                   (W1)· spin -1
 918                                       (W2)·
 960  ══L═══════════╗dip╔══M══════════▌knob (1984-2048)
1120                ╚═══╝ (dead moth)    ╲ step 192
1152                                      ══N═══════════════[E out]
```
- She falls in and lands on L (128–1152, y 960), dark. W1's field is 300+ px away.
- **W1** at (1280, 720), spin −1, 240 over the shelves, over a dip (1152–1408, floor 1120). Measured: 5 of 5 run-up
  jumps caught. A walker falls into the dip and walks out.
- M (1408–2048, y 960) ends in a **root knob 64 wide, 24 tall** (1984–2048): she stops against it, and so does the
  drag. **W2** at (2072, 918), 112 px from her body centre at the knob (measured reach 120). Hop the knob, then drop
  192 to N (2048–3840, y 1152). E exit at N, floor level.
- **W-hi3** (wall jump) at (1408, 352). A trunk hangs from the canopy at 1600–1664 down to y 704, 256 over M: she can
  touch it but can't climb it. With wall jump: kick up its west face to ~400, kick west into the field, cut. Her jump
  apex over the dip (y ~690) stays ~340 px from it, so it never interferes with W1.
- CP: L → W1 → M → W2 → N → E. Camera: ease toward a flame inside its field.
- **Round 1: the root knot** (landmark): a root bridges the shaft wall to the hanging trunk at y 192–248, and three
  tendrils hang round W1 (to 548, 388 and 488; the east one clear of W-hi3's core). It sits above every reach
  without wall jump (W1's throw apex is ~478), so it can't be stood on to cheat W-hi3. The dead moth lies in the
  dip under it (a stand-in note until render draws it).

### 4 `wood-burrow`: the blade against things (4480×1792; purpose: teach + rest)
```
 512                                                  ══H══(4416 trunk ┃)
 704                              (W-hi4)·
 768-864                 ▓▓▓▓ root roof ▓▓▓▓                          ┃ kickable
1144             (W3)·                                                ┃ west face
1152                     ▄root▄ ·seed· ·seed· ═══F3══[P1]═Tatter═hole═┃
1280 [W]══F1════╗        step  (3008)  (3296)                    ↓ S (4096-4352)
1344            ╚══F2══ burrback 1408-2560═╝ safe floor 1408 below the gap
```
- F1 (0–1216, y 1280), dark → F2 (1216–2816, y 1344). **W3** at (1984, 1144), 200 up (a jump-cut works in 3–5 of 9
  timings and is never caught). Burrback `burr-first` (4 hp, guards W3) patrols 1408–2560. A **root step** (2624–2816,
  top 1152) at the patrol's east end: drop on the burrback from it, or hop its ram, and land on the braced shell (a
  free bounce).
- **The seed-case gap** (2816–3456, level with the step's top, 1152): a root roof at 768–864 (288 over the gap) caps
  any jump to ~200 px of rise, which is too short to cross 640. Seed-cases hang at (3008, 1152) and (3296, 1152),
  290 apart. Hop, down-cut, bounce 125, drift, down-cut, land on F3. Below is a safe floor (1472) with root steps
  (160) back up to the root step. A miss costs ~6 s.
- F3 (3456–4480, y 1152). **P1** at 3776 with Tatter. The **hole** (4096–4352) is the south exit to R5. W3's freed
  moths fly into it.
- **W-hi4** (wall jump + glide) at (3136, 704), over the root roof. The trunk at 4416–4480 hangs from y 192 to 1024
  (128 over F3) with a kickable west face. With wall jump, climb it to shelf **H** (3904–4416, y 512), then
  jump-glide west: 768 across, 192 down, and a jump-glide carries 760 before the pull takes her. She lands on the
  root roof and walks off. Seen from P1 at 4:45.
- With wall jump the hole opens from below (R5's hollow is climbable). Until P1 is touched, a fade re-forms her at
  the burrow's west door (room `reform` point (300, 1280)), not beside the burrback.
- **Round 1:** **seed-0** at (1000, 1176) over F1, a safe floor: a hop and a down cut bounce her in place (the pogo
  taught where a miss costs nothing, before the gap; chunk1-plan item 11, the impatient first-timer's pit). **W-hi4**
  moved to (3300, 640), 420+ px from the seed-case hops, so its pull no longer lifts them. A **bark floor panel** by
  the door (384–480, y 1280) opens a pocket (384–640 × 1344–1472) with **W-pocket**; a hop climbs back out. Landmark:
  the seed-case pair over the gap, under the root roof.

### 5 `wood-glade`: glade 1, glide's lock room (2880×2304; purpose: glade)
```
y 0  [N in 256-512]
      ║hollow║ 192-576, walls kickable (wall jump: the way back up)    ┃east trunk 2816-2880
      ↓ (she falls ~1600 into moonlight)                              ┃(to y 1920, kickable)
1664 ══glade floor══[P2]══(moon shaft)══╗lip 1408                     ┃
2176                                              ══Z══ 2368-2880 ════[E out 1920-2176]
2240 ......... catch (x 1408-2368) ..........
```
- She lands at 256–512 **inside the moon shaft**. The bask (3 s), glide and the item line follow, so it can't be
  skipped. **P2** is here.
- Lip (1408, 1664) → Z (2368–2880, y 2176): gap 960, drop 512. Jump 717 ✗ (243 short), walk-off glide 1193 ✓, jump-glide
  1467 ✓. **No lamp in the room.** The chasm is a catch back to the lip.
- With wall jump: kick up the **east trunk** from Z (its foot is 256 over Z) to ~1200, then kick-glide west. That
  carries ~1000 px at the kick's height and ~380 more down to the glade floor. The **hollow** (walls at 192 and 576)
  climbs 1664 px to the hole into R4.
- Camera: frame the moon shaft while she basks; on the lip, look ahead east so that Z is on screen.
- **Round 1:** an **alcove under the lip** (1216–1408 × 1856–2048) with **W-alcove**: walk off, turn back and glide
  in (the only lamp in the room, below every line out). The room is 200 taller (2504) so the chasm's catch sits 200
  above its foot and the camera keeps her in frame until it fires. Landmark: the lip over the moonlit chasm.

### 6 `wood-glidewalk`: the glide ladder (5760×2368; purpose: teach → test; 6.5 screens for three gaps and the bough)
```
  32  ═══════ return bough (high over E0) ═══════╗
 192                                             ╚═══ return bough (rolling) ══════════════╗
 512 [W]═E0═╗                                        ┃T-ret 5632-5696 (kick, to y 1728)
 860        ╲ gap1 800       ·(W4)  (W5)·spin 1
 960         safe floor 1408 ══T2══╗              ▓▓ thorn branch (3798-4198, 1176-1272)
1472   (root steps up to E0)       ╲ gap2 1024 ═══T3═══╗     (W6)·
1984                    thorns 1920                    ╲ gap3 1024 ════T4═══▌bark▐═▒▒═┃═[E]
2240                                    thorns 2240                    burrback  pocket
```
- **Safe:** E0 (0–576, y 512) → gap 800, drop 448 → T2 (1376–1984, y 960). Jump 688 ✗, walk-off 1045 ✓, jump-glide
  1319 ✓. Below is a safe floor (576–1376, y 1408) with one-way root rungs (576–672, y 1216 / 1024 / 832 / 704) back to
  E0. **W4** at (1800, 640) on T2, 320 up, is glide's first lamp: a jump-cut (6 of 9); every jump-glide from E0
  passes under it and lands on T2.
- **Combine:** T2 lip 1984 → T3 (3008–3648, y 1472): gap 1024, drop 512. Walk-off 1193 ✓, jump-glide 1467 ✓, jump 717
  ✗. **W5** at (2434, 860), spin 1: measured, the jump-glide is caught; beating free while holding right lands her at
  +1515 (T3). The walk-off passes under untouched and lands at +1192. Thorns at y 1920 under the gap.
- **Test:** T3 lip 3648 → T4 (4672–5760, y 1984): gap 1024, drop 512. A **thorn branch** (3798–4198, y 1112–1272,
  thorny all over, underside 200 over T3) hangs over the jump's hump. Measured, the jump-glide hits it (1 pip, back to T3); the
  walk-off glide passes ~240 under it and lands at +1193 (4841). Thorns at 2240 below. **W6** at (5120, 1784) with
  burrback `burr-ledge` (5 hp, guards W6) patrolling 4992–5248, so the landing at ~4841 is clear.
- **Rotten-bark wall** (5376–5440, y 1600–1984) on the CP: spores drift from its seams, W6's freed moths slip through,
  3 cuts. **Right after it, a rotten-bark floor panel** (5456–5552) breaks with down cuts into a pocket holding
  **W-pocket**: the language used once more, a few metres on.
- **Round 1:** a **root roof** over E0's lip (320–800, y 256–320, 192 clear) caps a jump at ~112 of rise: the jump
  bumps, the walk-off glide is the way (taught at the safe gap, with the rungs under it). Camera zone **gap1** (fit,
  bounds 0–2100 × 160–1600) frames E0, the gap and T2 at once. **P-t3** on T3 (3200, 1472): the halfway rest, so a
  death at gap 3 costs ~10 s, not ~40. The **thorn branch** moved up over the jump's apex (3798–4198, y 920–1040,
  76 px clear): "hold jump to glide" teaches the jump-glide, and the branch sat on its arc (the impatient
  first-timer: 8 hits, 2 deaths). Both glides now cross gap 3; a glide on after W5's throw lands on T3 or T4.
  A **firefly sign** on the safe floor under gap 1 (1100, 1408; `wood-sign-gap1`). **n-bough** (1920–2112 on the top
  edge): R14's drop lands on the return bough (east to T-ret and the hub, or west home).
- **Return bough** (wall jump): trunk T-ret (5632–5696) hangs from 256 to 1728 (256 over T4: touchable, and walked
  under to the exit), with kickable faces. At its top the rolling bough runs west at y 192 and rises to y 32 over
  E0 (448 up, so it can't be jumped onto from E0, and the jump hump from E0 clears it by ~24). It ends over E0:
  drop down. E exit at T4, floor level (1728–1984).
- Time: 3:00–4:30.

### 7 `wood-hollow`: the hub (3840×3248; purpose: hub + rest + story)
**As built, everything below the canopy sits 256 lower than written here** (shelf 2880, floor 3136, alcove roof
2944, steps up to the E arch at 2880): the W door (R6's T4) and the E door (the hawkers' floor) are both at world
y 10048 = local 2880. W-ff burns only once `wood-firefly-glimpse` is set (lure `after`).
```
 400 (W-ff)·                                      ▓ canopy log (T3 stub)
 512 ═far branch═╗   (L-gap)· spin 1      ══crown shelf═════(W-crown)·═══
 640  (kick:false)   canopy gap (open)    ║up║ 1856-3840
                                          ║sh║ 2560-2944, kickable
2624 [W]══root shelf══╗                   ║af║
2688  alcove: ▓roots(T2) [well]  ╲        ║t ║
2880          (dark, moonlit) ╚═══[P3]═Tatter═══▒grate▒══════════[E arch]
```
- She enters from R6 onto a **root shelf** (0–960, y 2624) and drops 256 to the floor (960–3840, y 2880). The floor
  is unbroken to the east arch. **P3** at 1280 with Tatter, facing the arch.
- **The well alcove**: under the shelf (256–960, floor 2880, roof 2688), dark, with moonlight welling up from **the
  well** (384–640, the south exit, one way). The drowned-roots stub seeps at the alcove's back wall.
- **The glimpse** (first visit, on reaching P3): the camera looks up through the canopy gap (input free, 4 s). A small
  warm light hangs **W-ff** on the far branch, pulses slowly twice and darts away (`wood-firefly-glimpse`). W-ff then
  burns overhead all region as a lit lock.
- **The up-shaft** (2560–2944, kickable both sides) rises 2240 to the crown shelf (1856–3840, y 640) and **W-crown**
  at (3392, 448). At its foot, **the grate** (2560–2944) shows glade 2's moonlight. It opens from below when she
  climbs out of R10, and she carries straight on up.
- **The canopy gap** (768–1856, open to the floor). **L-gap** (lantern, spin 1) at (1280, 512). The far branch
  (256–768, y 512, `kick: false`) holds W-ff. From the crown lip: 1088 to the branch's end and 128 up, so no glide
  (it needs a drop) and no jump. Double jump + glide (apex 176, then ~1190 px) or a fling reaches it, both in Tier 1's
  postgame. **Measured leak check**: a jump from the crown lip into L-gap, then beating free toward the branch,
  reached it in 0 of 5 timings with spin 1 and 2 of 5 with spin −1. So spin 1 is required, and the breaker bot must
  confirm 0 over a full sweep. If it doesn't, raise the branch to 448 and move it 128 west. `edgeKick: false`, and
  every face around the gap is `kick: false`.
- Camera: rest framing at P3, the glimpse look-up, a vertical look-up under the shaft, a vista lift on the crown.
- **Round 1, batch 2: the cap climb to R14.** Bracket caps on the west wall: **B1** (0–192, top 2656, big) over the W
  door, a jump from the root shelf (the door's walk-in passes under it, so the main path is never bounced), **B2**
  (448–704, 2048), **B3** (0–256, 1440), then up through a one-way root (0–384, y 832) to **NW** (576–832), R14's
  door. Tatter at P3 looks up at it (its want; staging's `marks.tatter.want` still points at the shelf's end, 930,
  2870: move it to B1, ~96, 2656). **The root mesh**: the grate became a one-way root mesh over the climb (no hole
  under the up-shaft: the curious first-timer fell into the well jumping across it, and climbing out landed below the
  floor); the climb-out kicks up through it and lands on it. A **root lip** (640–672, 48 tall) before the well: going
  down is a choice, not a short jump's accident.
- **Round 1:** camera zones **rest** (fit over the floor: the whole hub, bounds 0–3840 × 380–3248) and **look-up**
  (the shaft framed tall, bounds 2176–3328 × 300–3248). **The well lid**: a flag gate over the well (384–640, y
  3136) shut until `wood-climbout` (set by climbing out of R10): the way into the well is now R9's floor, and the
  well is the shortcut back down once she has the claws. **E-high** (384–640 on the east edge, off the crown shelf):
  the canopy line east over R8 and R9 to R9's shaft window. Landmark: the canopy gap of moonlight over P3.

### 8 `wood-hawkers`: the hawker over the hummocks (3840×2752; purpose: teach; round 1)
```
 384 [W-high]═canopy═╗  ═══╗      ═══(W-canopy)·══╗     ════[E-high]     (dangler over the canopy landing)
2120            (W-hummock)·  hawker home (1640, 2200)   (W7)·
2432         ▄▄hummock A▄▄  dip  ▄▄hummock B▄▄        ▄▒mound▒▄ (W-bark in the cavity)
2624 [W]════════╝          ╚═══╝              ╚═══════▌bark▐════════════[P-dark]══[E]
```
- Floor y 2624, **hummocks** A (1088–1472) and B (1728–2112), tops 2432, over a dip (floor 2688). **W7** at (1920, 2120),
  312 over hummock B: a jump-cut from inside the dive lane (6.0 of 9). **W-hummock** (1280, 2250) over hummock A is
  not the hawker's lamp: it lights her early, and snuffing it does not send the hawker off. **Hawker** `hawk-first`
  (3 hp, guards W7), home (1640, 2200), 232 over the hummocks. Measured, a runner: lit at frame 84, noticed 93, hit
  165, on hummock B (the only reach) at 194: 1.8 s in the light before she can cut W7.
- The dark half (2112–3840): **S1** (bark 2688–2752 in a root mound, top 2464) opens a cavity with **W-bark** at
  (2920, 2560) (out of the bark cuts' reach, and of the jump over the mound). **P-dark** at 3520. A firefly sign
  goes here when the kit lands.
- **The canopy line** (from the hub's crown, wall jump): branches at 384–512 with 320 gaps, **W-canopy** (2368, 300),
  and a **dangler** (`dang-canopy`, guards W-canopy) tied to the room top over the landing at 2300.
- A **firefly sign** in the dark half (3250, 2624; flag `wood-sign-dark`).
- Landmark: twin hummocks with the hawker's lane over them. Time: 1:30–2:30.

### 9 `wood-lantern`: the first lantern, the broken face, the way down (3840×2992; purpose: teach + lock + combine; round 1)
```
 384 [W-high]═canopy══╗  ═══╗          ═══window╗║        ║[N out 3072-3584]
1860            ┃root (dangler)          ▓thorn ║  shaft  ║ east face kickable above 2304
1984  ══ledge(W-high)┃    (L1)·             band║         ║
2304           ════P════ burrback (fenced)       ║kickable║ slick
2432                         ══upper floor══════╗         ║
2624 [W]══floor══ step ╝                        ╚═══════▒bark floor▒══╝
                                                         ↓ the way down: R10's chute
```
- Floor y 2624, an upper level (1600–2752, y 2432). Root step (864–1024, y 2464) and platform **P** (one-way 1024–1536,
  y 2304). **L1** (lantern) at (1280, 2048), 256 over P (4.0 of 9 with its guards gone). The burrback **on P**
  (`fenced`, radius 180: it stays 1100–1460) and a **dangler** on a root shelf over P's east end (1480, 1860): both
  guard L1, one snuff sends both off. The chunk's first two-creature combination (rescope item 1).
- **The broken face** (shaft 3072–3584): west face kickable 2400–1920, a thorn band 1920–1600, slick above; east face
  slick to 2304, kickable above. Kick up the west face, kick-glide across, up the east face to R11.
- **The way down**: a rotten-bark **floor** at the shaft's foot (3200–3456) breaks to down cuts and drops her onto
  R10's chute patch (one way). This is the loop: the lock (the shaft) and its key (the well) meet here. TODO render:
  moonlight welling up through its seams, so the dead end reads as a door.
- **The canopy line** from R8 crosses over L1 (a hanging ledge 448–704 y 1984 on a root from the canopy, with
  **W-high** at (672, 1880): a first-run find dropped onto from above) to a **window** (448–704) into the shaft,
  halfway up the broken face.
- Round-1 fix: the west door is clear (the ledge's root hangs from the canopy, it no longer stands on the floor
  where it boxed in the door and the spawn). Landmark: L1 over the two-level floor. Time: 2:20–4:10.

### 10 `wood-well`: the chute, the old burrback, glade 2, the climb-out (11264×2240; purpose: mini-boss + glade; round 1)
```
  0 [N: hub well 384-640]  [out: climb 2560-2944]                         [shaft: from R9's floor 10880-11136]
 448                                                                    ══L0══[P-chute]
 640                                                          ══L1══
 896                                         ══L2══(W-chute)·  (dangler over L2)
1088                              ══L3══
1216                ══L4══ (west end over the roof hole)
1344 ▓roof▓║well║▓▓▓▓▓▓▓║climb║▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓║hole║
1600              ║rest  ║  (W8)·   ┃gate floor-to-roof┃  THE PIT (sealed, camera lock)
1888                          ═ledge═
2112 ═══west hall═══╝     ╚═══glade 2 [P4]═══╝═════ pit floor, old burrback ═════════╝ catch 1840+ under the chute
```
- In from R9's floor onto **P-chute** (L0). The pit's camera lock now frames the gate too (bounds 3392–5696 ×
  1280–2176; the curious first-timer stood at the gate with it off-screen). A one-way root step at the climb-out's
  top (2560–2720, y 160): stand, jump, up through the hub's mesh. **The chute**: root ledges stepping down west in the dark, two 640 gaps
  that want a jump-glide, a 384 and a 320; **W-chute** at (8736, 700) over L2 and a **dangler** (`dang-chute`, its
  silk from the room top) over L2's landing. A fall is a catch back to the last ledge.
- **The pit** (3584–5632 × 1344–2112): in through the roof hole off L4's west end. Sealed to the roof: the root gate
  (3520, 1344–2112) is floor-to-roof, so no throw, pogo or glide gets past it while the old burrback lives (tested:
  no-skip sweep). Camera lock. The old burrback sleeps at 4600 and wakes on her landing.
- When it dies the gate opens: **glade 2** (3008–3520), **P4**, wall jump; **W8** (3392, 1600) over a ledge
  (3264–3456, y 1888), a gimme behind the gate (18 of 27), out of reach from the pit.
- **The climb-out** (2560–2944, both faces kickable down to 1888, walked under at floor level) rises to the hub's
  grate; the top sets `wood-climbout`, which lifts the well lid. **The west hall** under the well: the shortcut down
  lands here (~2700 px of fall), a short walk to P4.
- A fade here re-forms her at P-chute (the room's `reform` point wins over a patch in another room: a small sim
  rule), so the pit is retried from the chute, not from the hub. Landmark: the sealed pit under its roof hole.

### 14 `wood-caps`: the cap stair (3840×2688; purpose: teach + secret; optional; round 1)
```
 470 (W-c3)·  ▒root▒                                              the hub's NW door is east, 2368-2624
 640 ║chute║ ══top══(stone)
1184         ▄cap-4▄  ║step 3 ║
1500                          (W-c2)·      branch (dang-c2)
1760          ▒bark▒[hollow] ▄cap-3▄ ═step 2═══
2176                                   ▄cap-2▄ ═step 1═
2440                                                 (W-c1)·   branch (dang-c1)
2624 ↓ s (to R6's bough)                      ▄cap-1▄══════════════════════════════[E]
```
- North-west of the hub, over R6's east end (23744, 5376). In from the hub's cap climb at the east door (floor 2624).
- **The dangler alone** (`dang-c1`, W-c1 lighting the way in, ~700 px of floor lit before its thread). Then **the cap
  stair**: four steps west and up, each cap against the next step's face so a bounce never meets an underside:
  cap-1 (mid) → step 1 (2208) → cap-2 (mid) → step 2 (1792) → cap-3 (big) → step 3 (1216) → cap-4 (big) → the top
  (640). **Together**: `dang-c2` hangs over step 2 where cap-2 lands her, W-c2 292 above.
- **The secret**: rotten bark in step 3's face (1024–1088) hides the **moonlit hollow** (quick wings: beat free in
  2). **The top**: the wood's **moth-stone** (draws `wood-floor` on the map), W-c3, and the **hanging root** (bark,
  192–256 × 448–640): cut it and step west, a trigger sets `wood-root-ladder` (TODO render: the root falls as
  Tatter's ladder in the hub; from then on Tatter is ahead), and she drops down the chute (0–192) onto R6's return
  bough: east to the hub. A loop of ~4 minutes. Patches: none (P3 is a door away); a fade re-forms her at the door.
- Measured: four bounces to the top with no lamp catch; the hollow grants quick wings; the root cut sets the flag
  and the drop lands on the bough at R6 y ~160. Landmark: the stair of caps climbing the dark.

### 11 `wood-climb`: the wall-jump test and the look back (2048×2560; purpose: test + vista)
```
 640 ║ shaft ║═══top shelf═══════[P5]═══════════════[E out 384-640]
1000 ║ (W10)·║ hawker home (256, 1100): dive lane over the top third
1280 ║▲      ║   ← east face: thorn band 1600-1280
1600 ║ (L2)· ║   middle third: L2's field bends every crossing
1920 ║      ▲║   ← west face: thorn band 2240-1920; S2 niche at 2080
2560 ╚[S in]═╝ shaft 0-512 (faces at 0 and 512)
```
- One 512 shaft (it lines up with R9's), climbing 1920 to the top shelf, with alternating broken faces:
  - lower third: the west face kickable, with a thorn band 2240–1920 above it; the east face kickable 2240–1600;
  - middle third: **L2** (lantern, spin −1) at (256, 1600), whose field (R 360) covers the shaft, so every
    kick-glide across is bent; the east face has a thorn band 1600–1280, and the west face is kickable 1920–1000;
  - top third: **W10** at (256, 1000) (spin 1; its field and L2's just touch) with hawker `hawk-climb` (home (256,
    1100)) diving across the shaft. Dodge by kicking away.
- **S2** (risk line): a 64 px niche in the west thorn band at y 2080 with a wick. Kick-glide into it.
- Top shelf (512–2048, y 640): **P5** at 1600, no Tatter. **The look back**: a camera lift over the canopy, the
  hatching tree far off west under the moon. E exit at the top.
- Time: 2:30–4:00.

### 12 `wood-web`: the orb web and the approach (4480×2176; purpose: teach + rest)
```
 640                                           ══DJ══(wick)
 896 [W]═entry═╗          ╭──web r640──╮
1024           ║S3▐      │    (W9)    │      ╔cap╗══approach══[P6]══[E door]
1344           ║bark    │   weaver    │      ║trunk 3200 (kickable to 1024 only)
1600           ╚═══ hall floor 768-3200 ═══════╝   ↓stub log
```
- Entry ledge (0–768, y 896) → drop to the hall floor (768–3200, y 1600), safe all the way.
- **The orb web**: a disk of radius 640 centred on **W9** (1984, 960), anchored to the canopy, two root columns and
  floor stakes. It fills the hall from y 320 to the floor. Touching it is Caught (a creature's Caught): the weaver
  runs out at 5 px/f and bites after a 24-frame count, 1 damage. Cuts from outside sever strands, and the weaver
  senses touches, not cuts.
  - CP: **cut the lower-west sector** (~6 cuts) to open a doorway at floor level. One sector near the entry already
    hangs cut.
  - Options: snuff W9 (the weaver disperses and the web goes dark and harmless), or glide through an outer cell.
- **S3**: a rotten-bark panel in the hall's west wall (768–832, y 1088–1344), one kick up, with an alcove under the
  entry ledge holding a lantern.
- The trunk at 3200 is kickable from the floor to 1024 and **capped there with an overhang**. It climbs 576 to the
  approach shelf (3328–4480, y 1024).
- **The approach**: dark, quiet, silk thick on the trunks. **P6** at 4096, no Tatter. The arena door is the E exit,
  floor level.
- **DJ ledge** (3584–3840, y 640, slick faces): 384 over the shelf (a double jump reaches it). The capped trunk stops
  a kick-glide.

### 13 `wood-grove`: the Weaver and the canopy edge (4736×2304; purpose: boss + exit)
- **Arena** at x 0–2176: §6. The camera locks until `wood-weaver-down`.
- **Chimney**: the silk curtain on the east trunk (y 1344–1600) opens onto a chimney (2176–2560, kickable both
  faces). It climbs ~960 to the edge shelf (2560–4736, y 640). **W-relit** hangs at (2368, 1100), mid-chimney: its
  field covers the chimney, so she is pulled or caught in the climb and snuffs it there (critical path). As she tops
  out, the firefly crosses the frame and leaves over the edge.
- **The edge**: **P7** at 3200. While she rests, **Tatter walks up out of the chimney** (insects climb bark) and sits
  beside her: her victory opened its road. The **exit vista** (camera lift): the valley below and the mountain
  larger than at the title. One flicker lamp far off blinks the firefly's rhythm (three short, one long). E exit at
  the shelf's end: a long glide down into the valley's arrival room.

---

## 8. Collectibles and completion

| Lamp id | Room | Kind | Moths | When | How |
|---|---|---|---|---|---|
| `wood-wicks:wick-caught` | 3 | wick | 5 | CP | cut after beating free, or on the way in |
| `wood-wicks:wick-first` | 3 | wick | 5 | CP | from the root knob |
| `wood-wicks:wick-high` | 3 | wick | 5 | optional (wall jump) | kick off the hanging trunk |
| `wood-burrow:wick-burr` | 4 | wick | 5 | CP | jump-cut over the burrback |
| `wood-burrow:wick-high` | 4 | wick | 5 | optional (wall jump + glide) | from shelf H |
| `wood-glidewalk:wick-landing` | 6 | wick | 5 | CP | on T2 |
| `wood-glidewalk:wick-line` | 6 | wick | 5 | CP | the high line's pull |
| `wood-glidewalk:wick-ledge` | 6 | wick | 5 | CP | on T4 with the burrback |
| `wood-glidewalk:wick-pocket` | 6 | wick | 5 | secret | rotten-bark floor |
| `wood-hollow:wick-crown` | 7 | wick | 5 | optional (wall jump) | top of the up-shaft |
| `wood-hollow:lantern-gap` | 7 | lantern | 10 | postgame (fling) | fling anchor, or a skilled cut |
| `wood-hollow:wick-firefly` | 7 | wick | 5 | postgame (fling / DJ + glide) | the glow-cap from the glimpse |
| `wood-hawkers:wick-hawk` | 8 | wick | 5 | CP | jump-cut |
| `wood-hawkers:wick-bark` | 8 | wick | 5 | secret | rotten bark, dark half |
| `wood-lantern:lantern-hall` | 9 | lantern | 10 | CP | 2 jump-cuts from P |
| `wood-lantern:wick-high` | 9 | wick | 5 | postgame (DJ) | from P |
| `wood-well:wick-pit` | 10 | wick | 5 | CP | from the ledge behind the gate |
| `wood-climb:lantern-shaft` | 11 | lantern | 10 | CP | cuts from kicks |
| `wood-climb:wick-niche` | 11 | wick | 5 | risk line | thorn niche |
| `wood-climb:wick-top` | 11 | wick | 5 | CP | past the hawker |
| `wood-web:wick-web` | 12 | wick | 5 | CP-adjacent | the web's hub |
| `wood-web:lantern-bark` | 12 | lantern | 10 | secret | rotten bark, west wall |
| `wood-web:wick-high` | 12 | wick | 5 | postgame (DJ) | from the approach |
| `wood-grove:great` | 13 | great (5 ring + heart) | 60 | CP | the Weaver |
| `wood-grove:wick-relit` | 13 | wick (story) | 5 | CP | in the chimney |

**Totals:** 25 lamps.

| | Lamps | Moths | Running total |
|---|---|---|---|
| Critical path | 14 (12 small for 70, the great lamp 60, the relit wick 5) | **135** | 135 |
| First run's optional lamps and secrets (both high wicks, the pocket, the crown, S1, S2, S3) | 7 | 40 | **175 reachable on the first run** |
| Postgame (fling and double jump) | 4 | 25 | **200**, the Tier 1 wood total |

The map shows a lamp once it has been on screen, plus a per-region "unseen" count. **Nothing on the first run can be
missed for good** (§3, the return).

**Secrets** (all paying in moths, one language): the rotten bark is drifting spores and 3 cuts. It is taught on the
CP in R6 and reused at once in R6's floor pocket, then in S1 (R8) and S3 (R12). S2 is a visible risk line. The high
wicks and the crown are visible locks opened by wall jump.

**First health milestone: at 110 moths** (§11 decision 3). A critical-path player has ~70 before the Weaver and
crosses 110 in the great lamp's burst, with 20 moths of margin. An explorer who takes every optional lamp before the
boss (110) gets the pip just before the Weaver: the reward for exploring arrives when it is useful. Each snuff gives
1 health back, so the ring flames heal her in P1.

---

## 9. Metrics targets for the playtest harness

Personas (`memory/playtest-harness.md`): naive, explorer, speedrunner, cautious, plus the first-timer agent. "Lost"
is the harness's (no progress for 10 s, counted in full). Rows follow the expected route. A room the route enters
twice has two rows, and the harness sums them.

| Room (visit) | Time (first-timer) | Max lost | Deaths | First-run lamps (naive / explorer) |
|---|---|---|---|---|
| 1 `wood-hatch` | 0:20–0:45 | 0:10 | 0 | none |
| 2 `wood-chase` | 0:30–1:00 | 0:15 | 0 | none |
| 3 `wood-wicks` | 1:00–2:00 | 0:30 | 0 | 2/3 / 3/3 (the high wick on the return) |
| 4 `wood-burrow` | 1:30–3:00 | 0:30 | 0–1 | 1/2 / 2/2 |
| 5 `wood-glade` | 0:45–1:30 | 1:00 (tapper) | 0 | none |
| 6 `wood-glidewalk` | 3:00–4:30 | 0:45 | 0–1 (2–4 pips) | 3/4 / 4/4 |
| 7 `wood-hollow` (first) | 0:45–1:30 | 1:00 | 0 | 0/1 / 1/1 |
| 8 `wood-hawkers` | 1:30–2:30 | 0:30 | 0–1 | 1/2 / 2/2 |
| 9 `wood-lantern` (to the lock, and back) | 2:20–4:10 | 1:00 | 0–1 | 1/1 / 1/1 |
| 10 `wood-well` | 3:00–5:00 | 0:30 | 1–2 | 1/1 / 1/1 |
| 7 hollow (crown) | 0:45–1:30 | 0:30 | 0 | |
| 8 → 9 (walk east and the shaft) | 1:25–2:30 | 0:30 | 0 | |
| 11 `wood-climb` | 2:30–4:00 | 0:45 | 0–1 | 2/3 / 3/3 |
| 12 `wood-web` | 3:00–4:30 | 1:00 | 0–1 | 1/2 / 2/2 |
| 13 `wood-grove` (fight, chimney, edge) | 5:00–9:00 | 0:30 | 1–3 | 2/2 / 2/2 |
| **Region** | **27–47 min, median ~38** | **≤ 2:00 anywhere** | **3–7** | **naive ≥ 13 of 21 first-run lamps; first-timer ≥ 16; explorer 21/21** |

Also:
- The speedrunner finishes in < 12 min and the explorer (with the R1–R5 return) in 50–60.
- The naive bot reaches the hub in ≤ 12 min. It is the wayfinding check for the guided opening, and it can't do
  bosses.
- No deaths in rooms 1–3. Deaths sit at the peaks (R10, R11, R13).
- Backtracking ≤ 3 min on the expected route. The return from the boss door to the hub is ≤ 60 s.

---

## 10. Exit criteria, and what we cut first

**The wood is done in grey when:**
1. **The run finishes with no softlock and no skipped gate.**
   - The explorer bot and the first-timer agent go from the hatch to the valley glide, and the symbolic world check
     finds no softlock.
   - The breaker bot finds no first-run skip of: R5's lip, the hub's well, up-shaft, grate and far branch (with the
     full jump × beat-timing sweep at L-gap), R9's shaft, R10's well walls and root gate, R12's capped trunk, the
     three DJ ledges, the arena lock and the curtain.
   - Reported skips are allowed if no softlock follows.
2. **Nobody is lost for long:** no first-timer persona is lost for more than 2 minutes anywhere, or 60 s at the hub.
3. **The timing holds:** the median first-timer run is 35–45 minutes, each row is inside its §9 range ± 30%, and
   deaths sit where the curve peaks.
4. **Every ability is taught before it is tested.**
   - Every room has a purpose tag.
   - Wall jump's lock comes ≥ 8 min before its key on both routes.
   - Glide, wall jump and the pogo each run the §4 ladder in the rooms named.
   - Every lamp kind and creature is met alone before it is paired.
5. **The bosses are fair.**
   - The Weaver passes the replay test. A first-timer survives ≥ 60 s on the first attempt, the median is 1–3
     deaths, a retry reaches P3 in ≤ 90 s, and the run back is < 15 s.
   - The first-timer beats the old burrback in ≤ 3 attempts.
6. **The layout lints pass**: doors into the dark, no creature in sight of a patch, threat ≤ 1.5 a lit screen, every
   dead end pays, and every glide gap passes the trace overlay with the margins in "Measured reach" at the top.
7. **The postgame is honest.** The postgame count is only claimed once the valley's landing has a way back up to
   R13's edge (tier honesty, world.md §3.7), so this is an exit criterion for the valley doc too.
8. **Matt plays it and says it's fun.**

**Cut first if it runs long** (in order; each keeps the region whole):
1. Weaver P2 (two phases, P1 → P3).
2. The chase's length (a short ordinary descent). The vista and the title stay.
3. The R1–R5 return (the bough, R5's trunk, the high wicks). W1 and W3 then have to be forced: W1 over the dip's
   exit lip, W3 on the step.
4. S2 and the R6 floor pocket.
5. The relit wick's moths. The relight stays as a picture.
6. The crown's postgame lamps move to the valley's double-jump list.

Never cut: the first catch, the first snuff, the seed-case gap, both glades, the hub, the Weaver's P1 and P3, the
vista and the title, the glimpse and the relight.

---

## 11. Big decisions made (for Matt's veto)

1. **Thirteen rooms, twelve new.** R8 is split so that the hawker and the lantern each arrive alone (review problem
   3, Matt's call). The second hawker is cut. The approach stays the dark end of the web room, and the edge stays
   part of the grove.
2. **25 lamps and ~200 moths in the wood**, up from world.md's 10 lamps and ~115. The core loop is the lamp, secrets
   must be lamps, and both abilities need lamps to reopen. Lamps are parameter rows, so the cost is layout time.
3. **First health milestone at 110 moths, not ~140.** It lands for everyone in the great lamp's burst, and for an
   explorer just before the Weaver. Veto keeps 140: explorers then cross it at the Weaver, and others in the
   valley.
4. **The great lamp's ring flames are part of it.** Their moths feed the heart and burst out together.
5. **The Weaver tests one thing a phase,** with spokes only in P1, a heart of R 700 until P3, three ring flames on a
   retry, and P2 swings over half the arena with the safe side always opposite. There is no cling: a face is safe
   only while she kicks.
6. **The exit gate is a silk curtain** that falls with the Weaver, not world.md's "the pull drags her off the edge".
   The valley doc owns the landing and the way back up.
7. **Glide's lock comes ~5 min before its key.** Glide comes at minute 5 (core), so the 10-minute rule can't hold.
   Glide's back payoff (W-hi4) needs wall jump too.
8. **The hub's far-side shortcut is the grate at the foot of the up-shaft** (glade 2's climb-out). There is no
   boss-to-hub drop: the boss door is ~50 s from the hub.
9. **The pogo is an ability ladder**: the burrback's shell (free), the seed-case gap (required, safe, minute 4), the
   old burrback (only pogos while braced), then the Weaver's P3. No pip can be lost before minute 3.
10. **The soft order at the hub stays, but steered.** The well is in a dark alcove you turn back into, so
    hawkers-first is the natural route. Well-first still keeps every ladder honest, because wall jump's first lock
    is R3's high wick at 1:30.
11. **R1–R5 reopen with wall jump** (R6's return bough, R5's east trunk and hollow, two high wicks). It is an optional
    ~5 min trip with nothing missable left behind.
12. **One secret language:** rotten bark, taught on the CP in R6 and reused at once in R6's floor.
13. **Tatter appears at P1, P3 and P7 only**, and walks to each. At P7 it walks up the chimney after her victory
    opened the way. It is not at the glades, P5 or P6.
14. **The firefly's glimpse happens at the hub, on the real branch,** so its glow-cap is a lock that burns overhead
    all region. **The relit flame is in the chimney** she has to climb, so re-snuffing it is the critical path.
15. **Lanterns are designed static** until the path-follow block exists. The swing is welcome later, and no room
    depends on it.
16. **The wood runs ~38 minutes at the median** (35–45 target). journey.md's 45–60 isn't the target.

---

## 12. Changelog: built vs paper (greybox, 2026-10-18)

What the greybox build changed, each measured in the sim (`tests/unit/wood-rooms.test.ts`, memory/rooms.md).
Rooms built: R2–R10. R11 `wood-climb` is a stub.

| Room | Paper | Built | Why |
|---|---|---|---|
| R3 | W2 (2072, 918) | (2072, 896) | the knob sat inside its core |
| R3 | — | a shaft wall 896–1024 to y 576 (no kick) | a fall held right drifted into W1's field |
| R2 | twigs over C | one one-way 3584–4224 y 768, C to over D | short twigs trapped walkers between a missed walk-off and a missed jump |
| R5 | P2 in the shaft | P2 at x 448 | where a fall from the hole lands |
| R4 | safe floor 1408 | 1472 | a full jump climbed F3's 256 face and skipped the pogo |
| R4 | fade before P1 → R3's landing | → the burrow's door (300, 1280) | room-local re-form point; R3 has nothing that can fade her |
| R6 | root steps back to E0 | one-way rungs at 576–672 | steps toward T2 let a plain jump reach it |
| R6 | W4 (1920, 760) | (1800, 640) | at 200 up it caught the jump-glide from E0's lip and every jump from T2's lip before W5 |
| R6 | thorn branch 1176–1272 under a stem | thorns 1112–1272, no stem | a glide on after W5's throw landed on the stem's top and went on to T4 |
| R7 | shelf 2624, floor 2880 | shelf 2880, floor 3136, arch steps | the doors did not meet R6 and the hawkers |
| R7 | alcove 256–960 | 384–960 (back wall 0–384) | an explorer reaching for a floor behind the well fell in |
| R10 | gate 1216–1472, W8 (1984, 992) | gate 1088–1472, W8 (2000, 992) | a jump cleared a 256 gate; W8 out of reach from the ledge |

**Jump-cut claims hold with this doc's method** (jump held through the cut, cut in the rise, 9 timings 2–18
frames, 60–140 px to the side): W3 3.4 of 9, W4 6.0, W7 6.0, L1 4.0, none caught. An earlier test that let go of
jump at the cut and cut late (6–22 frames) read W3 at 1–2 and L1 caught; that was the test, not the room.
Still open: beaten free from W5 holding right lands on T3 in ~5 of 8 beat timings, the rest in gap 2's thorns.
(Since the stick throw, 3834228: 8 of 8.)

**Round 1 of the quality iteration** (docs/design/regions/reviews/chunk1-plan-r1.md; the impatient first-timer):

| Room | Before | Round 1 | Why (plan item) |
|---|---|---|---|
| R10 | gate 384 tall under an open roof; W8 over the pit | the pit sealed to the roof, the gate floor to roof, W8 behind it | the throw and a pogo skipped the mini-boss (1) |
| R9 | DJ ledge on a floor stalk | hung from the canopy; spawn and door clear | the stalk boxed in the west door (2) |
| R8 | wick-bark 22 px from the root post | the cavity's wick at (2920, 2560), deep in the mound | its pull dragged the westward jump short; the bark cuts put it out (2) |
| R9→R10 | the well from the hub only | R9's shaft floor drops into R10's chute; the hub's well is a lid until the climb-out | a loop: the lock and its key meet (3) |
| R7→R8→R9 | — | e-high off the crown, the canopy line east to R9's shaft window | a high route after wall jump (3, 5) |
| R2, R4, R5, R8, R9, R10 | 3 optional lamps | + W-cave, W-pocket, W-alcove, W-hummock, W-canopy, W-high (R9), W-chute | finds every 2–3 min (4) |
| R8, R9 | 3200×1600 flat boxes | 3840×2752 / 3840×2992, two levels, two lines | rooms you remember (5) |
| R2 | rolling boughs | the fallen trunk, two real drops, the trunk hollow | a landmark, real drops (5) |
| R3 | — | the root knot over W1 | a landmark (5) |
| R7 | no zones | rest (fit) and look-up zones | the hub reads as a hub (8) |
| R6 | — | the root roof over E0's lip, the gap1 zone, P-t3 | walk-off taught; rest before the test (9, 10) |
| R8 | — | P-dark | patches every ≤ 4 min (10) |
| R4 | — | seed-0 over F1; W-hi4 moved off the hops | a pogo intro where a miss is free (11) |
| R6 | thorn branch on the jump-glide's hump | over the apex, 76 clear | "hold jump to glide" teaches that arc (first-timer) |
| R8, R9, R10 | one creature under one lamp | two lamps over the hawker's lane; burrback + dangler + L1 on P; danglers over R8's canopy landing and R10's chute landing | ≥ 4 creature + terrain combinations (6) |
| R2, R5, R10 | catches at the room's foot | 200 above the foot (R5 grew 200) | the camera kept her in frame until the catch (feel r1) |
| all | labels on | `art.labels: false` (G shows them) | players saw the designer's notes (first-timer) |

| R14 | — | built: the cap stair, two danglers, three lamps, the moth-stone, the hollow, the root, the drop to R6 | rescope items 2, 3, 5, 7 |
| R7 | grate (a shortcut hole) | a one-way root mesh; a lip before the well; B1-B3 to NW | the curious first-timer's hub traps; the cap climb |
| R6, R8 | — | firefly signs (under gap 1, the dark half) | finds (4) |
| R2 | — | trigger `vista` (wood-vista) | staging: the vista once per save |

Measured (tests/unit/wood-rooms.test.ts): W7 30 of 45 jump-cuts, L1 20 of 45, W8 18 of 27; the hawker hits a runner
before she reaches W7 (1.8 s lit first); the chute to the pit 754 frames with jump-glides and no catch; the no-skip
sweep never gets west of 3584 or above the roof.

