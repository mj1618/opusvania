# The Canopy, review round 6 (2026-10-31)

Reviewer brief: judge the Canopy v6 (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 27 rooms `cn-*`) against the
first areas of Hollow Knight, Silksong, Ori and Nine Sols. It covers the level pass 9d1c1c5..bf4f520, the render pass
16d1381 / c01462c / 07ba7b3, and the deployed snapshot b253ad6. Say what changed since round 5 (`canopy-r5.md`) and
write the round-7 spec. A separate render builder is already working on value contrast, so render is scored but
weighted less. Most of this review is about the level, the flow and the fun.

Sources:
- the docs: `first-area.md` (v6 and both builders' weak lists), `memory/canopy.md`, `memory/canopy-render.md`,
  `art-direction.md`, the reference README, and Matt's notes on density of choice, his area-1 playtest and
  "strengths: feel; weakness: levels";
- wide shots with pickups at every stop of 13 rooms (well, hub, fork, Grove, way out, den, hatch, limbs, trunk,
  tunnel, gap, Spire, bower), 72 frames, served from the release worktree on port 5214, with each frame's luma
  distribution set against HK's King's Pass and Crossroads views and Ori's renders;
- `metrics.ts --md` and `canopy-furniture.ts` over the four exact references and ours, plus two new measures from
  the `area.json` files, both described below: how hazard length is spread, and how busy each room is per screen;
- `climbs.ts` at kick delays 16 and 24 with no margin;
- **the well's leg 3 played with its creatures in.** `climbs.ts` strips every creature (`climbScene` sets
  `enemies: []`), so I ran the same person's plan in the real room: 4 delays × 3 start x × 3 waits, 36 runs. I also
  rendered one run as a clip, and tested where a fade in the ambush hollow re-forms her;
- the bot reports in `playtest-reports/canopy-r6/` and `canopy-r6-fork/`;
- the orchestrator's compare sheet (`shots/canopy-r6-render/compare/r6-vs-refs.png`).

What I could not do: drive Wing live from the fork into the Grove. In a headless playwright-cli page,
`goto` / `teleport` throws in the post filter (`FilterSystem._findFilterResolution`, `pipeline.ts:422`): the sim
steps but nothing draws. The shots and clip tools, which run their own GPU browser, work. For the Grove I relied on
the room's data, the shots, and the one fork bot that fought both beats. See "Smaller notes".

All coordinates are room-local px, as in the generator.

## The short version

**6 / 10.** Unchanged. The round met every number it was given, and the area got flatter.
- **The well's bottom works as a start.** All three start bots took the claws and stood on the landing within
  1:36-3:53. The arena door shuts, the hub is 8.9 screens, and two covered routes exist. Those are real fixes.
- **The furniture is spread evenly, and that is the measured form of Matt's "monotone".** Every room now holds
  1.4-7.3 things per screen. The spread across rooms is the flattest of any first area (CV 0.41; HK 1.10, Nine Sols
  1.08, Silksong 0.96, Ori 0.59), and no room is quiet (HK has 16 of 48, Nine Sols 7 of 39). Thorns sit in 20 of
  27 rooms as small identical trays: 20% of their length is in runs of 640 px or more, against 55-71% in HK,
  Silksong and Nine Sols.
- **Leg 3's "second element" is a toll, not a choice, and the top of it is a trap.** With the lampwing in, a
  person's plan takes a hit in 30 of 36 runs. The chimney fills the right fifth of a frame whose other two thirds
  are one black slab. The climb ends in an ambush, and a fade there re-forms her on the landing, so she has to do
  leg 3 and its lampwing again.
- **The area ignores its own best verb, and its rewards are cheap.** The fling (Ori's Bash) works from minute one
  next to 19 wicks, and no line in the area asks for it. There are 35 majors where the references have 8-23, and 18
  of them are great glints. 57% of all pickups are hidden, and the currency they pay has nothing to buy in the
  Canopy.

No person has played the Canopy yet; this is the third review to ask for it. The last three rounds tuned pits,
strips and lines to bot pass rates, which `matt-playtest-area1.md` says never to do. My r5 checks ("two of three
bots on the landing") encouraged it, and I withdraw them. **Round 7's check is Matt's run from the hatch to the
Grove.** The bots stay what they are good at: finding broken routes.

What works, and should be kept:
- **The well's bottom as a start.** The claws (`glade-claws`) sit at the foot of leg 1 with a lamp up the shaft
  (`wick-shaft`), and the rot hall's door opens only from the rot side. No bot enters the rot branch before the
  claws now; in r5 all three looped there for 15 minutes.
- **Saves on the climb.** The save and the stone on the mouth's floor, and the landing's save. A thorn on leg 2 or 3
  costs one leg, verified by `climbs.ts` fail plans (back on the rest they started from).
- **The risk glints over the strips** (`risk-w-*`, `risk-e-*`). Geo on the spikes, as in HK. A choice that costs
  something, which is what the area needs everywhere.
- **The arena door and its re-arm** (`gates[].shut`, `rearmArenas`). HK's lock-in, never a softlock.
- **The covered routes.** The vent under the limbs into the hub's high chamber, and the tunnel's roof tube. They
  are the first secrets that change how she moves.
- **The Grove at the pit** (shots: `cn-grove` wide 3 and 5). Still the area's best frame: two lamps with their
  swarms, the Grovemother's roots, bounce caps, burrbacks on a lit floor. It is the one frame where value contrast
  already works: warm lamps against a cool back, with a lit floor band.
- **The way out's vista.** The range now reads as one range, with the moon behind the main peak and the door-oak
  framing it (`cn-out` wide 7 and 8).
- **The fairness test** (`climbs.ts`). At delay 16 every plan passes. At 24 only `well-1` from x 1500 fails (the
  late kick slides off the face's foot). Fair, and it should keep guarding every climb.

## Since round 5, fix by fix

| r5 # | fix | v6 | status |
|---|---|---|---|
| 1 | the well's bottom a start | `rot-wall` opens from the rot side; `p-well` and `stone-west` on the mouth's floor; `wick-shaft` | **done.** Bots on the landing at 1:36-3:53 (r5: never). |
| 2 | climbs with a second element; the way out the exam | the way out in three legs from rests; a lampwing on leg 3; risk glints | **half.** The risk glints are right. The way out's legs are 2-3, 3-6 and 2-3 kicks (`climbs.ts` touches): a stack of short ladders between rests. The leg-3 lampwing in a 384 px slot is a toll: 30 of 36 creature-in runs take a hit, and 4 are knocked back to the landing (#3). |
| 3 | furnish the travel to the exact numbers | thorns 6,800 → 12,000; pods 1 → 29; one-ways 8 → 33 | **the numbers, not the shape.** Every number passes, but they are laid as one recipe in every hall (a 192-256 thorn tray, two stalked knuckles, a pod). The area is now uniformly busy (#1). |
| 4 | edges, not insides | lobed faces, moss bands, interiors flattened | **half.** Lobes show on the chimney faces. The moss band is a teal hairline, not a 40-80 px bright band. The flat interiors now fill two thirds of the climb frames as one near-black plane (#5). |
| 5 | the Grove's wave as an arena | `pit-door` shuts on `cn-grove-wave`; beat 2 from three sides; root step off the thorns; `p-grove` | **half.** The lock-in exists, but it locks the whole 3,840 × 1,920 room. The lamps hang 420-480 px over the pit floor, out of a jump's fling reach, so the fight never uses them (#6). |
| 6 | stock props | five burl families, none in more than three rooms | **half.** The burls are fixed. Two new stock props came with the furniture: the stalked one-way "pedestal" and the thorn "tray" (#8). |
| 7 | the backs | the interiorMid plane; den split | **half.** The mid plane in the shaft and the way out reads as loose white brush arcs, not as shapes (#9). |
| 8 | the vista as one range | shared base, opaque layers, receding bands | **done enough.** It reads as a range now. |
| 9 | the hub as a place | 8,000 × 2,304; the clearing with the save and the kin; two more shown locks | **half.** It is bigger and shows its locks. But the "moonlit clearing" is the darkest frame in the area (mean luma 8.8, 85% of pixels under 16), and it holds 26 things (2.9 per screen), where Dirtmouth has none (#10). |
| 10 | secrets as places and routes | four pockets ≥ 768 × 448, two covered routes, a dark edge in the hatch | **done in shape.** The routes are good. What the pockets pay is the problem (#7). |

## The numbers against the four references

`metrics.ts --md` and `canopy-furniture.ts` (exact references; hero-scaled where noted: Silksong ×0.58, Nine Sols
×0.8, HK and Ori per screen):

| measure | HK | Silksong | Ori | Nine Sols | **Canopy v6** | read |
|---|---|---|---|---|---|---|
| box screens / air screens (hero) | 357 / 132 | 513 / 44 | 85 / 48 | 170 / 56 | **87 / 44** | the size of Ori's Glades; fine for a test bed |
| critical-path room share | 0.25 | 0.29 | 0.71 | 0.72 | **0.52** | in range |
| enemies per box screen | 0.55 | 0.26 | 0.57 | 0.59 | **0.47** | in range |
| hazard px per air screen (hero) | 340 | 877 | 328 | 374 | **272** | close enough on total |
| things to hit + ledges per air screen | 0.68 | 0.2 | 1.11 | 2.95 | **1.77** | met |
| things per box screen (metrics) | 0.28 | 0.17 | 0.8 | 0.42 | **1.7** | **the busiest first area by 2×** |
| screens with nothing in them | 59% | 67% | 33% | 57% | **40%** | between Ori and the rest |
| majors | 17 | 8 | 23 | 16 | **35** (18 great glints) | **1.5-4× the references** |
| hidden share of pickups | 0.35 | 0.22 | 0.18 | 0.26 | **0.57** (47 of 58 glints hidden) | **a secret everywhere is not a secret** |
| NPCs / lore | 12 / 3 | 12 / 3 | 0 / 0 (Sein, Naru in scenes) | 4 / 4 | **0 / 0** (the hub's kin is a prop) | no one to meet |

**New: how the furniture is spread** (my measures from the `area.json` files; "things" = enemies, pickups,
breakables, levers, hazards, one-ways and secret walls in a room, per box screen of that room):

| measure | HK | Silksong | Ori | Nine Sols | **Canopy v6** |
|---|---|---|---|---|---|
| room density, mean / median | 1.31 / 0.86 | 0.85 / 0.71 | 2.40 / 2.16 | 2.52 / 1.69 | **3.12 / 2.95** |
| spread across rooms (CV = sd / mean) | **1.10** | **0.96** | 0.59 | **1.08** | **0.41** |
| quietest tenth (p10) | 0.00 | 0.13 | 0.47 | 0.00 | **1.41** |
| rooms under 0.5 a screen | 16 / 48 | 9 / 34 | 2 / 17 | 7 / 39 | **0 / 27** |
| busiest room ÷ median | 8.9 | 5.5 | 2.6 | 7.8 | **2.5** (the Grove 7.3) |
| hazard runs ≥ 640 px (share of length) | 18 (71%) | 8 (55%) | 3 (34%) | 13 (71%) | **2 (20%)** |
| hazard runs ≤ 256 px | 62 | 104 | 34 | 16 | **28** |
| rooms with any hazard | 16 / 48 | 20 / 34 | 11 / 17 | 16 / 39 | **20 / 27** |

What the two tables say together:
- The references are **lumpy**. HK, Silksong and Nine Sols keep a third to half their rooms near empty, and pile
  things into a few rooms that hold 5-9× the median. Their hazard is mostly a few long, composed runs (HK's 18 runs
  of ≥ 640 hold 71% of its spikes) in a third of the rooms.
- Ori is the even one (CV 0.59), and Ori is also the smallest and the fullest. Even Ori keeps two near-empty rooms,
  and its hazard is a third long runs.
- The Canopy is **flat**. It has no quiet room, its peak (the Grove, 7.3) is only 2.5× the median, and its hazard
  is mostly 192-256 px trays in three of every four rooms. README fact 3 already names this mistake: "the Downwood
  copied the average and got the flat version: that is monotone." v6 did it again with furniture instead of
  creatures.
- My own r5 spec asked for totals ("hazard to ~12,000", "~30 pods", "things + ledges ≥ 0.8 per air screen"). The
  builder met them as asked. The totals were the wrong check, and round 7 adds the shape.

## The look, briefly (render is known-weak and in progress)

Luma per wide frame (480 px wide grey; "dark" = under 16, "mid" = 50-150):

| frame | mean | dark | mid |
|---|---|---|---|
| HK King's Pass (`Tutorial_01`) | 28.7 | 50% | 23% |
| HK Crossroads_01 | 45.5 | 34% | 41% |
| Ori, Spirit Caverns | 35.0 | 24% | 22% |
| ours, the well's landing | 40.0 | 61% | 24% |
| ours, the fork's entry | 25.2 | 54% | 17% |
| ours, the trunk's wall | 27.1 | 45% | 14% |
| ours, the Grove pit | 19.2 | 62% | 9% |
| ours, the hub's landing | 15.9 | 73% | 8% |
| ours, the hub's clearing | 8.8 | 85% | 1% |

The compare sheet's reading holds: the references put a mid-value, busy back behind black ground with a thick lit
moss edge, and ours is dark on dark. Three things only this review adds:
- **The slabs fill the climbs.** In the leg-3 clip the chimney is the right fifth of the frame, and two thirds of the
  frame is the west block, one near-black plane, for 20-30 s of the area's signature climb. The camera clamps to
  the room's east edge (2560 wide, chimney at 1920-2304), so it can never centre.
- **The furniture has a look of its own, and it repeats.** The stalked one-way, a round cap on a curved stalk like a
  birdbath, appears 4 times in the hub, 3 in the trunk, 2 in the tunnel, 2 in the bower and in the Grove. The
  thorn tray, a 64 px box with a lip and barbs, is identical in 20 rooms.
- **The mid plane is scribble.** In the shaft and the way out it is wide white brush arcs. They read as marks on
  the glass, not as moss or roots behind the play.

## The 10 most important problems, ranked

### 1. [level] Uniform furniture: no quiet rooms, no peaks, hazard sprinkled as trays
**What.**
- Density per room runs from 1.35 (the crawl) to 7.30 (the Grove). Only the hatch is under 1. The tables above give
  CV 0.41, no room under 0.5, and a peak at 2.5× the median.
- **The recipe.**
  - Trunk: three thorn trays of 192-256, three knuckles, two pods.
  - Hub: one tray, six one-ways, five pods, seven glints.
  - Tunnel: three trays, three knuckles, three pods.
  - Bower: three trays, two knuckles, three pods.
  - Limbs, Spire, out, burrow, nook, sky, attic and rot: one to three small trays each.
- **The quiet rooms that should be quiet aren't.**
  - The hub is 26 things (Dirtmouth: 0 enemies, a bench, its locks).
  - The crown, where the glide is learned, has a thorn strip and a pod.
  - The crawl has 3 things.
- **What a person feels.** Every hall asks the same small thing: hop a 256 tray, maybe break a pod. There is no
  long hard stretch to remember, and no empty hall to breathe in. That is "no highs or lows: monotone", in Matt's
  words, nearly to the letter.

**Why it matters.**
- README fact 3: highs and lows, not a flat average.
- `density-of-choice.md` is about *moments* with 2-3 choices, which the Grove has. It is not about every room
  carrying one of each.
- HK's King's Pass is spikes in long runs under a few platforms. The Crossroads are near empty between fights.
- Silksong's Marrow is a long spike gauntlet. Bone Bottom is quiet.
- Nine Sols' Pavilion is empty, and its lift shaft is the 16-enemy ambush.

**Fix.** Same totals, new shape: move furniture, don't add it.
- **Quiet rooms (≤ 0.5 things a screen; at least 6).**
  - the hub's clearing west of the landing: no thorns, pods or knuckles. Keep its shown locks, the bank pocket, the
    save and the kin;
  - the hatch, as now;
  - the crown: drop its strip and pod, so the glide is learned in a calm room;
  - the crawl, the nook, the ledge and the den's balcony approach.
- **Composed hazard set pieces (≥ 50% of the length in runs ≥ 640, in ≤ 12 rooms).** Each run sits under a line of
  ledges, knuckles or pods, so it is a stretch with two lines (low and slow, or high and fast), not a tray:
  - the **tunnel**: one bramble floor about 1,600 long west of the pit, under three knuckles and the roof tube's
    mouth (Silksong's Marrow, HK's Crossroads spike floor under platforms);
  - the **limbs**: a continuous bed about 1,000 under the gap between the limbs (it is already 1,280 in pieces:
    join them);
  - the **trunk**: tier 2's three trays become one bed about 768, with the knuckles over it;
  - the **bower's hall**: one run about 900;
  - the **gap**: one floor run about 1,200 under the glide line (the fall is the cost);
  - the **way out's valley** (1,536) and the **Spire's chimney**, as now.
- **Pods in clusters, not one a hall** (29 stay 29).
  - A pod garden on a jump arc in two places (the gap's glide line, 6 pods; the tunnel's run, 5 pods over the bed),
    so she pogoes along it.
  - The Grove pit gets 3-4 more as refuel in the fight.
  - Take them out of the quiet rooms.
- **A second peak.** The tunnel (4.26 now) should rise to about the Grove's density with the run above, its ants
  and the pods. The bower drops to medium.
- **Check.** Extend `canopy-furniture.ts` with the spread table above and require:
  - room-density CV ≥ 0.8;
  - at least 6 rooms under 0.5 a screen;
  - the busiest room ≥ 5× the median;
  - ≥ 50% of the hazard length in runs ≥ 640;
  - hazard in ≤ 14 rooms;
  - totals within 10% of v6 (thorns ≈ 12,000, things + ledges ≥ 1.5 per air screen).

### 2. [render] Value contrast: dark on dark (in progress)
**What.** In the table above our frames are 54-85% near-black with 1-24% mid-tones. HK is 34-50% near-black with
23-41% mid-tones, and Ori 24% / 22%. Our moss edge is an 8-12 px teal hairline. Silksong's is a 40-80 px
yellow-green band, the brightest saturated thing in the frame. The hub's clearing is the worst frame in the area.

**Fix** (the render builder's current pass; this sets its bar).
- A mid-value back (luma 60-130) behind every play band.
- Ground near-black (≤ 16) only on the mass.
- A lit moss band of 40-80 px on every walkable top, luma 120-180, saturated toward the look's hue.
- **Check** (a `look-stats` test over every wide stop at 16:9, 16:10 and 21:9):
  - near-black ≤ 50% of the frame;
  - mid-tones ≥ 20%;
  - the hub's clearing mean ≥ 25;
  - the Grove keeps its warm-on-cool.

### 3. [level] Leg 3: a toll in a slot, then an ambush with a runback
**What.**
- **The lampwing** (`wing-chimney`, 2112 × 1680, radius 140) hovers in a 384 px chimney.
  - The same person's plan `climbs.ts` uses (E face to ≤ 1856, across to W), run with the creatures in, takes a hit
    in 30 of 36 runs: delays 0 / 6 / 10 / 16, three start x, waiting 0, 1 or 3 s on the landing.
  - 4 of 36 are knocked back to the landing.
  - Waiting 3 s first lowers the hits but does not remove them (6 of 12 still hit).
  - There is no dodge, because there is no room to dodge in. It is a health toll.
  - Fighting it from a wall is untested: `climbScene` removes every creature.
- **The frame.** The chimney (1920-2304) sits against the room's east edge (2560), so the camera clamps. The chimney
  is the right fifth of the frame, and two thirds of it is the west block (#5).
- **The top.** Leg 3 comes up through the root at (1920-2304, 1152) into the ambush hollow: `burr-am-1`,
  `burr-am-2` and `wing-am`, all woken by the claws, so they are awake before she arrives.
  - She arrives having paid 1-2 lights to the lampwing.
  - A fade in the hollow re-forms her at the landing's save (1720, 2432): I verified it in the sim. So every failed
    ambush costs leg 3 and the lampwing again: 1,280 px of chimney.
  - HK runbacks are short, flat walks; this is the area's hardest climb, used as a runback.
- The bots stop at 2,070-2,170 (below the lampwing). That is the bots' problem, not the fix's measure.

**Why it matters.**
- A second element has to be a decision: fight it, wait for its stall, or take another line. HK's flyers in spike
  shafts are on open walls with room to strike. Ori's Spirit Caverns give a ledge before each shooter row.
- A first ambush after a long climb wants a bench at its door. Nine Sols puts a save before every gauntlet.
  Silksong puts a bench 1.45 view widths before Moss Mother.

**Fix.**
- **A mid rest in leg 3 that is also a window.**
  - Carve a 384-tall rest into the west wall at about 1536-1920 × 1472-1856 (floor 1856), with a root lip into the
    chimney (`oneWay(CH0 - 128, 1856, 128)`).
  - Leg 3 becomes 3a (landing to the rest, 576 px: the E face, across onto the lip) and 3b (the rest to the top,
    704 px).
  - Move `wing-chimney` to hover at about (2112, 1400), ≥ 200 px from the rest (`safeEnemyPx`), radius 140.
  - From the rest she can watch its dive, strike it as it stalls by the lip, or go during its climb.
  - The rest's opening puts mid-depth air into the frame's west half.
  - Re-lay `thorn-w3a` / `w3b` from `climbs.ts` touches (two legs, one change of wall each).
- **The ambush wakes on a trigger in the hollow's middle** (about 700-1400 × 960-1152), not on the claws. The
  arrival is quiet.
- **A save at the top.** `p-hollow` at about (2200, 1152), the chimney's lip, at least 400 px from the fenced
  burrbacks. A fade in the ambush costs the ambush, not leg 3.
- **Test creatures in climbs.** A `creatures: true` option in `climbs.ts` keeps the room's enemies. Then:
  - the plain plan at delays 6 / 10 takes ≤ 1 hit in at least two of three starts;
  - a wait plan (stand on the rest until the lampwing's first dive ends) takes none;
  - an up-cut plan from the lip kills it.
- **Camera.** If the rest's window is not enough, widen `cn-well` east by 640, so the chimney can sit mid-frame.
  This needs a band check: the well is on the map's west edge.

### 4. [level] The fling is in her hands and nowhere in the level
**What.**
- The fling works with no ability (`flingTarget` checks only reach and a burning flame). The Canopy has 19 wicks:
  - 4 are hub sockets and the giant's mouth;
  - 3 are decoration in the valley;
  - 3 hang over the Grove pit at 1120-1180, 420-480 px over its floor. A jump reaches about 272, and the fling's
    reach is 110, so they are out of reach from the floor (#6);
  - the rest light rooms.
- `wick-shaft` was placed "out of a fling's reach from the floor" on purpose.
- No line in the area is a fling line, optional or required.

**Why it matters.**
- `density-of-choice.md` names four things the Grove offers: hit, collect, cut, **go for a lamp**. The fling is the
  game's own verb (Ori's Bash, `memory/lures.md`) and Matt kept it after cutting the catch.
- Ori's first area is lines through the air between things that move you. Ours has jumps and walls.
- The explorer already models flings (`explore.ts`: chains, eight aims), so a line can be proven not to break a lock.

**Fix.** Five optional fling lines on the travel. Each is faster, higher or richer than the floor line, and none
replaces a lock.
- **The trunk**: a wick over tier 2's new bed (#1). A fling from tier 2 back up to tier 1 is the clawed return
  (`t2 → t1 needs C` today), now with a second way.
- **The limbs**: two wicks over the bed between the limbs, a high line to a pocket of three glints above the second
  limb.
- **The gap**: three wicks under the roof from the shelf, ending at the pod garden (#1) and a pocket. Not at the far
  limb, which stays the glide's.
- **The well's hollow**: one wick over the ambush floor (fight tool and a way up to the east shelf at 1792 × 704).
- **The Grove pit**: `wick-a` and `wick-b` lowered to about 1,380 (220 over the floor), so the wave is fought with
  the throw-cut and the fling's escape (#6).

Rules for all five:
- Embers relight on a miss (`lures.md`), so a fall under a chain must land on a floor or a catch, never in thorns
  that send her back (put the bed's end clear of the chain's landing).
- **Check.** `tools/solve/canopy.ts` with flings on: every lock claim holds (the gap's far limb, the tunnel's pit,
  the hub's shelf).

### 5. [render] The big masses fill the frame as single planes
**What.**
- The well's west block (the leg 2-3 frames).
- The way out's two blocks (wide 3, 4 and 5): each about 600 × 900 px on screen, one tone, a lobed outline, blue
  LED dots of moss glow down the face.
- The hub's under-floor: the bottom 40-60% of every hub frame is black.
- The Grovemother's trunk: a flat dark rectangle cut by the top of the frame.
- The render builder's own list says the claw faces look straight at play distance.

**Fix.**
- No single flat plane over 35% of a wide frame. Break the big interiors into 2-3 sub-masses at different values
  (luma 8-30), with the edges between them lobed, as HK's Crossroads stacks rock at three depths.
- Faces over 600 px get a lobe or a root every 150-250 px that breaks the silhouette by 24-64 px, inside the claw
  tolerance (±12 px of the collision face at foot height, more above and below the reach).
- The moss-glow dots become clumps on the lobes, not a dotted line.
- Level side: #3's window.
- **Check.** A frame-coverage test over the wide stops: the largest connected region within ±6 luma ≤ 35% of the
  frame.

### 6. [level] The Grove's arena is the whole room, and its lamps are out of reach
**What.**
- `pit-door` (640, 192-576) and `pit-gate` (3712, 1216-1472) hold the whole 3,840 × 1,920 room.
- The pit floor (y 1600, x 640-3264) opens upward at x 1472-1984 (to the tiers) and x 2496-3264 (to the east
  half). With the claws on every face she can climb out mid-wave, kite above, and come back.
- `wick-a` (1760, 1180) and `wick-b` (2800, 1120) hang out of a jump's fling reach from the floor.
- Beat 2 is two juveniles, the dangler and a lampwing: a fair beat. The fight's tools are cut and pogo only.

**Why it matters.**
- HK's first lock-ins (the Crossroads' False Knight, Gruz Mother) are one screen, walls closed.
- Silksong's Moss Mother arena is about a screen and a half.
- A peak is the room you are in, not the building.

**Fix.**
- **Bounds.** The arena is x 1408-3264 × 1088-1600 (about 1,850 × 510 of air, one screen wide).
  - Two horizontal root gates over the openings shut on `cn-grove-wave` (`gates[].shut`, `h` 64): about 1472-1984
    at y 1088, and 2496-3264 at y 1088.
  - `pit-door` stays at the entry, so the re-arm still works.
  - Spawn `dang-wave` and `wing-wave` inside the bounds.
- A camera zone that fits the pit while the wave runs (`zoom: fit`).
- `wick-a` and `wick-b` lowered to about 1,380 (#4). The fight then has the fling: the throw-cut through a juvenile,
  and an escape over a ram.
- Add 3-4 pods inside as refuel (#1).
- A visible gate release. Render: roots draw back on `gateShut` and on the flag. The builder's weak list says the
  door pops today.
- **Check.**
  - `canopy-arena.test.ts` covers both new gates and the re-arm;
  - a solver claim that the tiers are unreachable from the pit while `cn-grove-wave` is set and `cn-grove-clear`
    is not;
  - `place:` claims that both lamps are in fling reach from the pit floor.

### 7. [level] Rewards that matter: fewer, better, and something to spend on
**What.**
- 35 majors, against 8-23 in the references. Ori, the richest, has 23 in 85 screens. Ours:
  - 18 great glints;
  - 5 maps;
  - 3 keys;
  - 3 moon shards;
  - 4 upgrades;
  - 2 abilities.
- 47 of 58 glints sit hidden, a hidden share of 0.57 (references 0.18-0.35).
- Nothing in the Canopy takes glints. They are a number on the HUD, plus what a fade drops.
- So the r6 pockets, now place-sized (#10 done), mostly pay a number.

**Why it matters.**
- README fact 6: every dead end pays a *major*, and a major is something the player wants.
- HK's geo buys the map, the compass and charms at Dirtmouth. Silksong's rosaries buy at Bone Bottom.
- A secret worth finding changes what she can do or carry.
- Matt's "bland, obvious" is partly this: the payout is always the same glow.

**Fix.**
- **Greats 18 → 6.** Keep `claw-prize` and the risk lines. Cut the rest to glint piles of half the worth, or to
  nothing.
- **Moon shards 3 → 6** (two lights: +2 health), in the four grown pockets and two branch ends.
- **Hidden glints 47 → ~25**, so the hidden share is ≤ 0.35.
- **One sink: the kin in the hub's clearing trades.** The kin and the clearing already exist; the trade is a small
  sim feature, so check the scope with Matt. Three offers bought with glints:
  - a moon shard;
  - the east's moth-stone (the map's east);
  - `quickWings`.

  Priced so a player who finds about half the secrets can buy two.
- Majors ≤ 23. Each pocket pays one of: a shard, a key, an upgrade, a map, or a glint pile big enough to buy
  something.
- **Check.** `metrics.ts`: majors ≤ 23, hidden share ≤ 0.35, and no cover over fewer than 3 glints unless it hides a
  route.

### 8. [render] The furniture's two stock props: the pedestal and the tray
**What.**
- **The pedestal.** One-ways render as a round cap on a curved stalk standing free on the floor: 4 in the hub, 3 in
  the trunk, 2 in the tunnel, 2 in the bower, and in the Grove. At play distance they read as birdbaths or side
  tables: human objects (r5 #6) again.
- **The tray.** Thorn pits render as a 64 px box with a lip and a row of barbs, identical in 20 rooms.
- The prop-family test covers burls only.

**Fix.**
- **One-ways grown from their mount, chosen by what is near:**
  - a shelf fungus on a wall or trunk;
  - a root knuckle out of a mass;
  - a broken branch stub;
  - a moss clump on a hanging root.

  Never a free-standing stalk. Mid-air knuckles hang from a root above or grow from a burl beside them.
- **Bramble beds** that spill over the pit's lips and climb the nearest wall in varying lengths, with tangles and
  dead stems, so two beds never share an outline. The long runs (#1) make this easier: fewer, bigger beds.
- Extend `wood-props.test.ts` to one-ways and thorn beds: no family in more than three rooms.

### 9. [render] The mid plane reads as brush marks
**What.** The interiorMid plane in the shaft looks (the well, the way out) is wide white brush arcs over the fog. It
reads as scribble on the glass, not as a place behind the play. In the hub and the trunk the back is a flat haze
with a few posts.

**Fix.**
- Per look, a mid plane of *shapes* at 0.9-0.95 parallax, covering 25-40% of the frame at luma 50-110:
  - the shaft: moss lobes and hanging roots;
  - the heartwood: broken grain panels;
  - the canopy: leaf masses and fern curls (Silksong Tut_01 and Tut_02 backs).
- Silhouettes with lit edges, no strokes.
- **Check** with #2's luma test: the mid band supplies most of the 20% mid-tones.

### 10. [level] The hub as the quiet place
**What.**
- The hub is 8.9 screens. Its west is a long flat root floor: the clearing, with the save and the kin, two root
  burls, four knuckles, three pods, a thorn pit, then the high block and the giant's mouth.
- It is the darkest frame in the area (mean 8.8). There is no moon over the "moonlit clearing" in any of the 8 hub
  stops.
- The skilled start bot stood still in it for about 60 s at 1:00-1:30.
- Widening it west left a notch 3,520 wide under it, the map's only hole.

**Why it matters.**
- README fact 10: the hub is quiet and crossed often.
- Dirtmouth is a lit street with a bench, no enemies and locked doors on show. Bone Bottom is a lit bowl with a
  bench and a shop.
- The quiet is the point, and it has to be lit and readable, or it is just empty.

**Fix.**
- Strip the clearing's furniture (#1). Keep the save, the kin, the locks and the bank pocket.
- Open the clearing's roof to the sky over about 2,000 px around the save (`back` / moon placement), so the moon
  hangs in the frame from the save.
- Give the kin a different value and pose from Wing (r5's note: it still reads as a second Wing).
- Put the kin's trade there (#7).
- Close the notch: grow `cn-crawl` and `cn-burrow` (or add mass to the rooms under the hub) so the bands meet under
  the hub's west half.
- **Check.**
  - the clearing's wide stop has a mean luma ≥ 30 with the moon in frame (#2's test);
  - the map export has no holes;
  - the hub reads under 0.5 things a screen in the furniture table.

## Smaller notes
- **Matt's run is the check for round 7.** From the hatch to the Grove, recorded (`npm run clip` or a screen
  capture), with his words on each stretch. If it can't happen this round, the builders should not tune anything
  else to the bots.
  - v6 changed the hub's pit (448 → 256) and cut the limb's landing pit because bots turned back. Those are
    reasonable for people too.
  - "Leg 3 stops every bot" is not a reason to make leg 3 easier. #3 is about the toll and the runback, which a
    person would hate.
- **What the bots did find that a person would also meet.**
  - The trunk's beds cost the casual bot 22 hits before the claws (`thorn-t3` 14, `thorn-t2` 8). #1 replaces those
    trays with one composed bed on tier 2. Keep `thorn-t3` out of the walk to the well's door.
  - `thorn-w2` still costs 5-12 hits a run, as a teach that the east face is wrong. It is only 84 px tall
    (2656-2740), so a person may not see it before touching it. Make it 160-200 tall, laid by `climbs.ts`.
  - The fork's average bot spent 3 minutes in the passage under the fork's floor hole (1792-1984 → 1408-1856). That
    passage is a dead-looking loop with nothing in it. A quiet room is fine; a quiet *dead end* should pay (README
    fact 6) or lead on.
- **The way out after the boss** can stay a cooldown. The area's exam belongs before the den: the Spire's neck and
  leg 3. I withdraw r5's "the way out is the final exam". Three short legs after a boss fight are right. Keep them,
  and stop calling them the exam.
- **The headless render error.** In a playwright-cli session (no GPU flags), `goto` / `teleport` throws
  `Cannot read properties of null (reading '_resolution')` from `PostFilter.apply` (`src/render/post/pipeline.ts`
  line 422) and from `AlphaMaskPipe`. The sim keeps stepping, and the shots / clip tools draw fine. Probably a
  headless-only filter-resolution bug, but `CLAUDE.md` says agents use playwright-cli, so it should not throw. Worth
  one look by whoever owns `src/render/post/`.
- **The well's moth-stone and save on the mouth's floor** are right. The stone now pays for leg 1, as asked.
- **16:10 and 21:9** were not re-shot this round; the render builder's pass owns them. #3's camera note is the one
  aspect-sensitive level change.

## Scores (1-10, against the HK / Silksong / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | r2 | r3 | r4 | r5 | **r6** | one line |
|---|---|---|---|---|---|---|---|
| layout | 3 | 6 | 6.5 | 6.5 | 6.5 | **7** | the well's bottom is a start, the hub is bigger and shows its locks, two covered routes; the map's notch, and the arena is the whole room |
| density | 4 | 5 | 6 | 6.5 | 6 | **6** | every total met; every room the same: CV 0.41 against about 1.0, no quiet room, hazard as trays in 20 of 27 rooms |
| combat | 3 | 4 | 5 | 5.5 | 6 | **6** | a lock-in and beat 2 from three sides; the arena is a building, its lamps out of reach, and leg 3's lampwing is a toll in a slot |
| traversal | - | - | 4 | 4.5 | 6 | **6** | risk glints over the strips, a three-leg way out; the legs are 2-6 kicks each, the fling never asked for, the leg-3 runback |
| secrets | 2 | 5 | 6 | 6.5 | 6.5 | **6.5** | pockets as places, two covered routes, a dark edge in the hatch; 57% of pickups hidden, 35 majors, nothing to spend glints on |
| readability / look | 5 | 4 | 5 | 6 | 6.5 | **6.5** | lobed faces, one vista range, prop families for burls; dark on dark (54-85% near-black), slabs filling the climbs, pedestals and trays, scribbled mid plane |
| pacing | 3 | 5 | 5 | 4.5 | 5.5 | **5.5** | claws at 1:30-2:20 and saves on the climb; no low anywhere, the darkest frame is the hub, and the first ambush's runback is the hardest climb |

**Overall: 6 / 10 against the references** (r1 3.5, r2 4.5, r3 5.5, r4 5.5, r5 6).

The structure is now close: a start that funnels into its first ability, a hub with shown locks, two branches,
routes behind covers, a peak and a boss. What keeps it at 6 is what a player feels moment to moment:
- the same small furniture everywhere;
- a climb whose added element is a hit she can't avoid;
- a verb she owns and never needs;
- rewards that are all the same glow;
- frames that are mostly black.

None of these needs a new room. All of them need the area to be composed: loud in a few places, quiet in many, and
paying in things that matter.

**What improved since round 5:**
- the well's bottom is a start, and the rot branch is shut before the claws;
- saves on the mouth and the landing; risk glints over the strips;
- an arena door that re-arms on a fade;
- the hub is 8.9 screens with three shown locks;
- four pockets the size of places, two covered routes, a dark edge in the hatch;
- lobed faces; the vista as one range.

**What didn't:**
- the furniture is a recipe stamped in every hall;
- the leg-3 lampwing is a toll, and the ambush above it has a leg-long runback;
- the arena is the whole room;
- the fling is unused;
- majors and hidden glints are inflated, with no sink;
- the hub is the darkest frame;
- new stock props (pedestals, trays);
- still no human run.

## Round 7: the ten fixes, ranked by impact

Each is one builder pass. The coordinates are in the problems above.
1. **[level] Peaks and quiet:** same totals, ≥ 6 quiet rooms, hazard in ≥ 640 px composed runs (tunnel 1,600, limbs
   1,000, trunk 768, bower 900, gap 1,200), pods in two gardens. Check: room CV ≥ 0.8 and ≥ 50% of the hazard
   length in long runs.
2. **[render] Value contrast:** mid-value backs, a 40-80 px lit moss band, near-black ≤ 50% and mid-tones ≥ 20% of
   every wide frame, the hub's clearing mean ≥ 25 (in progress).
3. **[level] Leg 3 as a choice:** a rest and window at 1536-1920 × 1472-1856, the lampwing moved to (2112, 1400),
   the ambush on a trigger, `p-hollow` at the top, `climbs.ts` with creatures in.
4. **[level] Five fling lines:** trunk tier return, limbs high line, gap roof chain to the pod garden, the hollow,
   the Grove lamps lowered to 1,380, every lock proven with flings on.
5. **[render] No plane over 35% of a frame:** sub-masses at 2-3 values, a lobe or root every 150-250 px on faces
   over 600 px, moss glow as clumps; first the well's west block, the way out's blocks and the hub's under-floor.
6. **[level] The Grove arena is the pit:** gates over 1472-1984 and 2496-3264 at y 1088 shut on the wave, a camera
   fit, lamps in fling reach, pods inside, a visible release.
7. **[level] Rewards that matter:** greats 18 → 6, moon shards 3 → 6, hidden glints 47 → ~25, majors ≤ 23, and the
   kin's three-offer trade in the hub.
8. **[render] Pedestals and trays out:** one-ways grown from their mount (fungus, knuckle, stub, clump), bramble beds
   with varied outlines, the prop-family test extended to both.
9. **[render] A mid plane of shapes:** moss lobes, roots and leaf masses at 0.9-0.95 parallax, 25-40% of the frame at
   luma 50-110, per look, replacing the brush arcs.
10. **[level] The hub as the quiet place:** its clearing stripped, the moon in frame from the save, the kin
    restyled and trading, the map's notch closed.

Then Matt plays from the hatch to the Grove, and that run is round 7's evidence. If he can't, nothing is tuned to
the bots in the meantime.
