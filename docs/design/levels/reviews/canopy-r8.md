# The Canopy, review round 8 (2026-10-31)

Reviewer brief: judge the Canopy v8 (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 27 rooms `cn-*`) against the
first areas of Hollow Knight, Silksong, Ori and Nine Sols. It covers the level pass 83bd612..0617a6a, the render pass
473ac72..8f54fba, and the deployed snapshot 53b1585 (canopy-play, the same as live). Say what changed since round 7
(`canopy-r7.md`) and write the round-9 spec.

Sources:
- the docs: `first-area.md` (v8 and the builder's weak list), `memory/canopy.md`, `memory/canopy-render.md`,
  `art-direction.md`, the reference README and the four `EXTRACTED.md`, and Matt's notes (density of choice, paths not
  places, "bland, monotone, over-signposted", "strengths: feel; weakness: levels");
- 46 wide shots with pickups at 16:9 over eight rooms (the hatch, hub, well, Grove, fork, tunnel, gap and burrow),
  served from the release worktree on port 5214, with luma measured on each frame;
- `npm run look:check` on six rooms (the hub, well, Grove, tunnel, fork and hatch) at three sizes: all 117 frames
  pass;
- `metrics.ts --md` and `canopy-furniture.ts --check --rooms` on the four exact references and ours (`round 8's bar
  met`), and `climbs.ts --creatures`;
- **Wing driven live through `window.__game`** (playwright-cli on the GPU; no crash this round):
  - the hatch from the cocoon to the first fling, and on into the hub;
  - the well's hollow: over `p-hollow` at a run, into the ambush, standing still through the arrival;
  - the hollow's way out (both of them);
  - the drop into the Grove's pit and the wave's arrival;
  - the tunnel from the hub's shaft: the step, the pit, the glide, the den's warning;
  - the gap's chain, from a walk off the shelf, with three aims off the second lamp;
- the bot reports in `playtest-reports/canopy-r8/`;
- the compare sheet `shots/canopy-r8-render/compare/r8-vs-refs.png`, measured tile by tile.

What I could not do:
- Play it as a person with real hands. I drove her with scripted presses and frame stepping. That finds what breaks and
  what a moment shows, not whether it is fun.
- See the render work in progress: the "hold Lamp" prompt, drawn arrivals, the kin's lamp and beats, the save's flare,
  the den lid's mat. They are not in the snapshot. I note where their absence matters, but I don't re-spec them.
- Fight the den's boss.

All coordinates are room-local px, as in the generator.

## The short version

**7 / 10.** Up half a point. Round 8 fixed all three things r7 said a first-time player would hit in the first ten
minutes:
- **The fling is taught by the level.** At the hatch's lip, a running jump puts `wick-first` in reach on the rise
  (x 3,582, y 639 in my run). A right fling lands her on the far limb, and she is in the hub at 0:38 of game time.
- **Ambushes arrive.** In the hollow, the burrbacks walk in from x 338, about 1,000 px away, 40 frames after the flag.
  In the Grove, the pit's pair walks in from x 2,721 and 3,186 while the camera pulls to 0.81. Standing still, the
  first hit comes 150 frames after the flag, and only after a 36-frame tell.
- **A save she runs over counts.** `patchMark:p-hollow` fires at a run.

What holds it at 7 is now the level's shape and the look's proportions, not bugs:
- **The black is too big, and it is boxes.** In the well, 52-65% of every frame is near-black (the shaft 65%, the
  landing 64%, the rest 63%). Silksong's two compare tiles are 25% and 28%. Deep solid interior alone is 31-52% of a
  well frame.
  - Matt's question, render or geometry? **Mostly geometry and camera.** The well is a 384-768 px column of air in a
    2,560 px room, and the camera is clamped to the room, so a third to a half of every frame is wall.
  - **Render turns that into rectangles.** The core goes near-black 28-136 px in from the edge, and only the top gets
    moss. So the long straight edges of the collision boxes are the strongest shapes on screen. Silksong wraps every
    edge in moss.
- **The first long room is a vertical sink.**
  - The well's three climbing legs with thorn strips are the first five minutes after the hub.
  - Leg 2's strip is the top hit source for the fourth round running (casual 13 hits, average 11, skilled 5).
  - All three bots lost 10-22 minutes in the well.
  - The hollow's way out to the limbs is one wall kick up the east wall from the chimney's mouth. I did it on the
    first try. But nothing lights or frames that doorway, so the ambush is skippable without anyone knowing.
- **The second peak is counted, not on the path.**
  - 40 of the tunnel's 59 things are in the west hall and the nest, a dead-end branch.
  - On the way to the den: 11 glints, one pod, the hawker (which did not engage during my glide) and a three-creature
    warning on a 384 px floor with no camera fit.
  - Without glints, the path through the tunnel is about 2.5 things a screen, the same as the middle rooms.
- **51 glints buy nothing.** That is more minor pickups than any reference (HK 4, Ori 11, Nine Sols 13, Silksong
  41), and they pad both peaks. The trade is still Matt's call.

The gate for round 9 is the same as the last two rounds: **Matt plays from the hatch to the Grove.** The render backlog
(above all the Lamp prompt) should land first. Without the prompt, a new player stands at the hatch's gap with no way
to know the Lamp key exists.

What works, and should be kept:
- **The hatch as the lesson.** It is quiet and moonlit, and a one-gap problem is framed by the `first-fling` zone, with
  the lamp, the lip and the far limb in one frame. The lamp relights, so a miss costs a catch and nothing else. This is
  Ori's "forced use the moment it's gained", done right.
- **The Grove's pit is the area's best set piece.**
  - The root gates grow shut, and the camera pulls to 0.81.
  - Both warm lamps are in reach, and the creatures come from the far floor.
  - The Grovemother now has plates and a lit ridge.
- **Arrivals and `rearm`.** Fair, readable, and a cleared wave stays clear.
- **The re-form on a pass.** It is invisible, and it is right.
- **The gap**, still the best still: the moon, the hanging lamps, the void.
- **The tunnel's run as a danger.** The bramble bed has a silhouette, and its warm barbs read at play distance
  (r7 #10 done).
- **The hub has a moon.** The clearing's stop is 2% near-black with the floor at 76%, the sky over it and the kin in
  frame.
- **Moss by look.** Frost in the shaft, amber in the heartwood, lime in the canopy, fungus in the den: the areas no
  longer share one frosting.

## Since round 7, fix by fix

| r7 # | fix | v8 | status |
|---|---|---|---|
| 1 | teach the fling | required first fling in the hatch (S5 cut to 3,520, S8 from 4,272), `wick-first` relights after 90 frames, the `first-fling` camera zone, prizes in frame from lamps, the gap's lamps moved, the bots press the Lamp key | **done on the level side.** Verified live: running jump → reach at the rise → right fling → far limb. The prompt is render's and isn't in the snapshot. The gap's chain still plays as two (#7). |
| 2 | ambushes arrive | `arrive` points 400+ px off, 36-frame delay, 48 frames harmless, `rearm` | **done.** Hollow: burrbacks walk in from 338 / 370, the lampwing drops from 539 to its post 160 px over her landing and dives after a 36-frame `curious`. Grove: the pair from 2,721 / 3,186. Arrivals slide in until render draws them. The hollow has no gates, which is fine: see #1. |
| 3 | ground as silhouette | `paintCore`, `look:check` solid ≤ 12 and air ≥ 4× | **done to the letter, and it exposed the geometry.** Solid interior 3-8 luma (HK / Silksong 0-5). But the black now reads as the collision boxes (#2, #3). |
| 4 | re-form on a pass | `markOnPass`, `patchMark` | **done.** Verified on `p-hollow` at a run. |
| 5 | the hub as a place | camera zone (floor at 78%), the kin's lamp, kin in three places, the moon window | **half.** The frame is right: the clearing's stop shows the moon, with near-black 2% and the floor at 76%. The kin is there but does nothing yet (render's beats), and there is still nothing to stop for. The hub's other stops are 28-33% deep solid (east, clump, west). |
| 6 | moss by look | `top-growth.ts` families, 40-85% cover, the rim per family | **done.** Amber lichen reads as yellow spots ("cheese", render's own gotcha) on the hub's floor. The moss is still a top cap only (#3). |
| 7 | a second peak, a quiet path room | the tunnel at 7.0, the fork at 0.68, the burrow the nest | **met on paper.** The fork is quiet and good. The tunnel's peak is on its dead-end branch, and its path half is mostly glints (#4). The nest is a flat one-screen corridor. |
| 8 | objects out, gates that move | ribs and curtains in the shaft, uneven lobes, growing gates, plates, root mounts, broken limb ends | **mostly done.** The gates are the round's best render work. The Grovemother's plates stack like river stones. The tunnel's pod garden stands on stalks like stools (#10). |
| 9 | climbs fair at 16 | `dives: 1`, delay 16 in the test, `thorn-w2` 160 | **done by the tests.** Leg 3b takes 0-1 hits from every start at every delay. Leg 2's strip is still where the bots bleed: 13 / 11 / 5 hits (#1). |
| 10 | the den and the long runs | bramble beds, the den's back as banks and shells | **beds done.** The den's back has shapes now, but the den look is a grey monochrome: the tunnel and burrow frames read as greyscale (#6). |

## The numbers against the four references

`metrics.ts --md` and `canopy-furniture.ts --check --rooms` on 53b1585 (exact references; hero-scaled where noted:
Silksong ×0.58, Nine Sols ×0.8):

| measure | HK | Silksong | Ori | Nine Sols | Canopy v7 | **Canopy v8** | read |
|---|---|---|---|---|---|---|---|
| box screens / air screens (hero) | 357 / 132 | 513 / 44 | 85 / 48 | 170 / 56 | 94 / 45 | **94 / 46.5** | Ori's size |
| critical-path room share | 0.25 | 0.29 | 0.71 | 0.72 | 0.52 | **0.52** | in range |
| enemies per box screen | 0.55 | 0.26 | 0.57 | 0.59 | 0.42 | **0.55** | in range |
| things per box screen | 0.28 | 0.17 | 0.80 | 0.42 | 1.33 | **1.48** | busiest, 1.85× Ori |
| minor pickups | 4 | 41 | 11 | 13 | 39 | **51** | **above every reference**, and they buy nothing |
| majors | 17 | 8 | 23 | 16 | 23 | **23** | top of the range |
| hidden share | 0.35 | 0.22 | 0.18 | 0.26 | 0.34 | **0.27** | in range (diluted by line glints) |
| empty-cell share | 0.59 | 0.67 | 0.33 | 0.57 | 0.46 | **0.45** | in range |
| solid share of room boxes | 0.63 | 0.74 | 0.44 | 0.49 | 0.52 | **0.50** | *less* rock than HK or Silksong (see below) |
| saves | 7 | 7 | 2 | 5 | 8 | **8** | generous |

**The spread:**

| measure | HK | Silksong | Nine Sols | Ori | Canopy v7 | **Canopy v8** |
|---|---|---|---|---|---|---|
| room density, mean / median | 1.31 / 0.86 | 0.85 / 0.71 | 2.51 / 1.69 | 2.40 / 2.16 | 2.23 / 1.69 | **2.32 / 1.69** |
| spread (CV) | 1.10 | 0.96 | 1.08 | 0.59 | 0.84 | **0.89** |
| quiet rooms (< 0.5) | 16 / 48 | 9 / 34 | 7 / 39 | 2 / 17 | 6 / 27 | **5 / 27** |
| busiest ÷ median | 8.9 | 5.4 | 7.7 | 2.6 | 5.7 | **5.8** |
| hazard runs ≥ 640 (share) | 18 (71%) | 8 (55%) | 13 (71%) | 3 (34%) | 7 (76%) | **7 (78%)** |
| rooms with any hazard | 16 / 48 | 20 / 34 | 16 / 39 | 11 / 17 | 10 / 27 | **10 / 27** |

**The second peak, split by where the path goes** (my count from `scene()`, x ≥ 5,300 is the way from the hub's shaft
to the den):

| tunnel | glints | pods | enemies | one-ways | thorns | total | ≈ screens | a screen | without glints |
|---|---|---|---|---|---|---|---|---|---|
| east (the path) | 11 | 1 | 4 | 1 | 1 | 18 | 2.8 | 6.4 | **2.5** |
| west (hall + nest, a branch) | 15 | 8 | 8 | 8 | 1 | 40 | 5.6 | 7.1 | 4.4 |

The per-room measure is met because the room includes its dead end. On the path, take out the glints (which buy
nothing) and the tunnel is a middle room. The Grove (9.8) is still the only loud room on the way.

**The look** (whole frame, 480 px wide grey; "dark" < 16, "mid" 50-150). The compare sheet, measured tile by tile:

| frame | mean | dark | read |
|---|---|---|---|
| Silksong, the moss tile (top right) | 51.7 | **25%** | black tubes wrapped in lime |
| Silksong, the fern tile (bottom right) | 47.5 | **28%** | |
| HK (middle right) | 25.4 | 55% | the black is a cave full of drawn shapes |
| ours, the well (top left) | 44.5 | **59%** | |
| ours, the hub (middle left) | 36.3 | 57% | |
| ours, the Grove pit (bottom left) | 34.0 | 49% | |

And my 46 frames:

| room | dark (whole frame) | deep solid (look:check) | air mean (look:check) |
|---|---|---|---|
| the hatch | 12-23% | - | 59-79 |
| the gap | 17-35% | - | - |
| the Grove | 37-50% | 8-16% | 47-74 |
| the tunnel | 29-51% | 7-20% | 45-50 |
| the hub | 26-65% | 3-38% | 51-74 |
| the fork | 21-53% | 4-18% | 56-75 |
| **the well** | **52-65%** | **31-52%** | **91-113** |

Three things show here that `look:check` can't see:
1. **Solid in frame.** The well's frames are a third to a half deep solid. The rooms aren't solid-heavy (0.50 of the
   boxes, less than HK's 0.63 or Silksong's 0.74). It's that ours put walls 300-1,500 px thick *inside the camera's
   bounds*, beside narrow air. Silksong's rock is mostly outside its camera locks. Its frames are three-quarters air
   with thin, mossy shapes in it.
2. **Black starts at the edge.** In the tunnel only 7-20% of a frame is deep solid, yet 29-51% is near-black: the
   outer band is black too. The silhouette has no lit, lumpy outer skin.
3. **The well's air is paper.** A mean of 91-113 against the art direction's 45-70. Black boxes on a pale grey ground
   read as cut-outs on a lightbox.

**Was it right to measure the bars over the air only?** Half right. The references fail whole-frame bars (HK's King's
Pass is 50-56% near-black), so judging the ground by its own bar (≤ 12) was correct. But the change left no bar that
sees *how much* of the frame is ground, or how pale the air is. So the two things the compare sheet shows at a glance
(huge black and a lightbox in the shaft) pass all 117 frames. Keep the air bars and add three (#2, #6):
- deep solid ≤ 30% of a wide stop (median ≤ 20% over a room);
- air mean ≤ 85;
- a minimum chroma per look.

## What I played, and what it felt like

- **The hatch** (from the cocoon, three presses). Walking right, the first gap (x ~1,990) is a fall, and the catch is
  instant and kind. A running jump from 1,951 lands on the rise, and a jump puts her on the block (top 656). Off S5's
  lip with a running jump (from 3,486), `wick-first` comes into reach 10 frames into the rise at (3,582, 639). Lamp +
  right held 30 frames: `flingStart`, `fling`, and she lands on S8 at (4,453, 1,103). The lamp relights 90 frames
  later. Into the hub at frame 2,265, 0:38 of game time.
  - The frame at the lip is good. The warm lamp high in the frame with its moths, the far limb under the moon. The
    painted trunk between them reads as the droop's, not as a way across.
  - **Without the prompt, the moment depends on pressing a key nobody named.** The bots, who know it, took 0-3 catches.
- **The hollow.** From the chimney's top at a run west: `patchMark:p-hollow`, a jump over the block, and the trigger
  fires as she lands at 1,326. The burrbacks show at x 338 / 370 and walk in. `wing-am` drops from 539 to its post at
  (1,300, 915), 160 px over her head. At frame +90 it turns `curious`; at +126 it dives and hits her (she stood still
  on purpose). A fair tell, but its post is right over the landing spot every time.
- **The hollow's way out.** Two ways:
  - **From the block.** A jump at its east edge (1,760) clears the east shelf (top 704) by 16 px with a corner correct.
    Tight.
  - **From the chimney's mouth.** One wall kick off the east wall (x 2,304) and she is in `cn-limbs`, 70 frames after
    leaving the floor: `R+J20 R10 J1 R20`. **The ambush (trigger 1,000-1,408) is 600+ px west of this.** So a new
    player who kicks up the obvious wall never sees it. One who goes west to fight it then has to walk back 700 px and
    find a door that shows no light, no sky and no path. In my frame from the mouth, the door is a dark overhang at the
    frame's top-right corner, under hanging roots. That is where the bots wandered for 50-180 s at a time.
- **The Grove's pit.** Dropped in at 1,650: the flag and three `gateShut`s on one step. The camera eases 1.00 → 0.81
  over 60 frames. The pit's pair arrives at frame +40, from 1,000+ px. She bounces on the west cap until stepped off.
  The frame (gates woven shut, two warm lamps, the plated trunk, the moon light) is the area's best moment.
- **The tunnel's way to the den.**
  - From the shaft at 5,420, a 260 px wall at 5,888 needs a jump, and the step to the pit's lip.
  - A plain run-and-jump falls on the pit's thorns: one hit, then back at 5,712.
  - A jump-and-hold glide from the lip (6,026) collects the eight-glint arc and lands on the warning's floor at 7,557.
    The hawker over the pit stayed on its orbit (`return` / `hover`) and never struck.
  - The warning: two lampwings and a juvenile arrive from the east roof in 48 frames, the lid holds, and the camera
    stays at 1.0. It's a scuffle on a knuckle, not the den's warning, and the den look's grey makes it the dullest
    frame of the five.
- **The gap's chain** (walk off the shelf):
  - `wick-gap-1` is in reach at (3,394, 1,273), 73 frames after starting the walk.
  - A down-left fling brings `wick-gap-2` into reach at (3,264, 1,334). That works.
  - Off the second lamp I tried straight down, down-left and left, from three fresh starts. **None brings `wick-gap-3`
    (3,100 × 1,920) into reach.** Down lands safe at (3,264, 2,000). Left lands safe at (2,867, 2,000). Down-left puts
    her on the floor's thorns: one hit, back to the shelf.
  - So it plays as two lamps and a landing. The third lamp sits 80 px over the floor, where she can only stand next to
    it.

## The 10 most important problems, ranked

### 1. [level] The well is a vertical sink, and its way out doesn't read
**What.**
- After the hub and the trunk, the critical path is the well: three climbing legs with thorn strips (6.2 screens,
  3.57 things a screen), then the hollow.
- All three bots spent 10-22 minutes there.
- Leg 2's strip (`thorn-w2`, now 160 tall) is still the top hit source for the fourth round: 13 / 11 / 5 hits.
  `thorn-w3b` adds 6 / 4.
- The hollow has two exits to the limbs:
  - a tight jump from the block (16 px to spare);
  - one wall kick from the chimney's mouth.

  Neither is lit, framed or marked. The ambush sits 600+ px west of the obvious one, so it is either skipped unseen, or
  fought and followed by a walk back to an unmarked door.

**Why it matters.**
- README fact 11: first areas are mostly horizontal (vertical : horizontal 0.26-0.47). Long bands, short shafts, one
  big vertical set piece.
- Ours puts its big vertical piece in the first five minutes, on the only way on.
- HK's first five minutes are King's Pass, a horizontal walk with harmless enemies. Ori's first vertical set piece
  comes after the first ability.
- An unmarked exit after a fight is the "lost" a new player remembers. Matt's "over-signposted" doesn't mean
  "unmarked": HK lights its doors with the next room's light.

**Fix.**
- **Light the door.** The limbs' leaf light and moonlight spill through the opening (2,304-2,560 × 512-768) into the
  hollow, so the door is the brightest gap in the room's east wall. A `notice` camera zone on the chimney's top
  (1,900-2,304 × 900-1,152) biases up-right, so the door is in frame the moment she arrives.
- **Make the ambush a choice that pays.**
  - Keep it skippable (the kick is the main way), and put the hollow's reward where only the fight's side reaches: the
    lamp line from `wick-hollow` to a pocket on the west (a moon shard or the hollow's major).
  - From the ambush's floor, the way back east should show the door: the shelf's lip catches the door's light.
- **Leg 2.** The strip is on the line a relaxed hand slides down. Before round 9's run, play it by hand ten times from
  the landing. If a person takes the hits the bots take, move the strip off the slide line: onto the far face, or 64 px
  lower than the first touch's slide at delay 16. Don't widen it again. Each hit should be a choice someone made.
- **Bring the big vertical piece down to one leg on the main path.** The well's leg 2 or 3 becomes a horizontal band
  (a root bridge across the shaft with a creature on it), or moves to the branch to the rot hall. Keep at most two
  climbing legs between the hub and the limbs.
- **Check.**
  - A `place:` claim that the door is on screen from the chimney's top at 16:9 and 21:9.
  - The humanplay `average` bot leaves the hollow within 60 s of topping the chimney.
  - Path climbing between the hub and the Grove ≤ 50% of the path's length (measure it: `metrics.ts` can sum the
    critical route's vertical vs horizontal px).

### 2. [level] Too much solid in frame: geometry and camera, not paint
**What.** Matt asked whether the black is render or room geometry. It is mostly geometry, framed by a clamped camera:

| stop | deep solid (> 96 px in) | whole frame near-black |
|---|---|---|
| the well's shaft | 52% | 65% |
| the landing | 44% | 64% |
| the rest | 44% | 63% |
| the mouth | 40% | 61% |
| the hub's door | 38% | 58% |
| the hub's east | 33% | 62% |

- Silksong's compare tiles are 25-28% near-black in total.
- Our rooms hold *less* rock than theirs (0.50 of the box against Silksong's 0.74). But in the well, a 384-768 px air
  column sits in a 2,560 px room, so 1,000-1,500 px of wall is in every frame.
- The hub's clearing is a 1-screen-thick slab under a strip of floor.
- The fork's face is one rectangle a screen tall.

**Why it matters.**
- Figure-ground works when the air is the larger shape. Silksong's ground is a black tube or arch 200-500 px thick
  in air, with the rock filler outside the camera lock.
- Ours are slabs bigger than the air they hold. That is also why the boxes read as boxes (#3): a 1,500 px straight edge
  can't be dressed into a branch.

**Fix.**
- **Camera locks that keep rock out.** Every shaft and hall gets camera bounds or zones that frame the air with at most
  30% solid. Where the air is narrower than the view (the well's legs), widen the air instead: see the next point.
- **Hollow out the slabs.**
  - The well's walls become a pillar and a buttress pair with air and the deep back behind them (the shaft look's
    ribs and curtains get room to show). Leg faces stay where they are; the mass behind them goes.
  - The hub's under-floor becomes a bough 200-320 px thick with air and back under it.
  - The fork's face becomes a trunk 300-400 px wide, not a block.
- Generator rule: no solid rect wider than 640 px whose interior shows in a wide stop.
- **Check.** `look:check` adds the bar: deep solid ≤ 30% of every wide stop, median ≤ 20% per room. The well, the
  hub's door / east / clump / west, and the fork's face fail it today.

### 3. [render] Edges, not boxes: the moss wraps, the black starts deeper
**What.**
- The near-black core starts 28-136 px in from an edge, and growth only covers the tops.
- So every mass is a flat black shape whose outline is the collision box: the well's walls, the hub's slab, the
  fork's block, the hub's floating clump (a rounded rectangle).
- In the tunnel, deep solid is 7-20% of the frame, but near-black is 29-51%: the outer band is black too.
- Silksong puts moss on every exposed edge: sides 30-80 px thick, undersides with hanging clumps 60-160 px, tubes
  wrapped all round. The rock's outline is the moss's outline.

**Fix.**
- **Growth wraps.** Every exposed face and underside gets its look's growth, not only the tops:
  - faces: 20-60 px lumps, broken into runs;
  - undersides: hanging clumps and drips 40-160 px, every 120-300 px;
  - per look: frost rime on the shaft's faces, amber shelf lichen in the heartwood, lime moss in the canopy, fungus
    and pale roots in the den.

  The lit lip on tops stays the brightest line (the path still reads first).
- **The core starts at 120-200 px**, with the outer band at mid-dark (20-40 luma) carrying the lobes, knuckles and
  roots. The deep interior stays ≤ 12.
- **No ruled edge.** No straight run longer than 300 px is visible at play distance: lobes of ±40-80 px over every
  long face, and corner breakup on every rect corner (the hub's clump, the fork's block, the well's lips).
- **Check.**
  - A test over every Canopy room: the painted outline's longest straight segment ≤ 300 px.
  - Growth covers ≥ 50% of exposed face length.
  - `look:check`: whole-frame near-black ≤ 45% at the well, hub and fork stops, after #2.

### 4. [level] The second peak is on a branch; the path's peak is glints
**What.**
- The tunnel meets the bar (7.0 a screen, 4.2× the median) by counting its dead-end hall and nest: 40 of its 59
  things.
- On the way to the den: 11 glints, one pod, the pit's hawker (it held its orbit through my glide and never struck),
  and a three-creature warning on 384 px with no camera fit and no beat. Without glints that is 2.5 a screen.
- The Grove is still the only loud room on the critical path.

**Why it matters.**
- README fact 3 is about what the player *walks through*. HK's Crossroads peaks (Goam, the Aspid arena, False
  Knight) are on the way; its quiet branches are quiet.
- Counting a branch's density as the room's density repeats r6's mistake: meeting the average and losing the shape.

**Fix.**
- **The den's warning is the second set piece.**
  - Widen its floor to 768-1,024 px.
  - Put a `fit` camera zone over it (as the Grove's).
  - Two beats: lampwings from the roof first, then the juvenile pair and a burrback up out of the den's mouth.
  - The root lid stays shut until both beats are down.
  - Lamps in a jump's reach over the floor.
- **The pit glide is contested.** Put the hawker's orbit on the glide's line, so its strike comes mid-glide, with its
  tell and room to dodge or cut. Cut the eight-glint arc to three. The glide is the prize.
- **Measure peaks on the path, not by room.** `canopy-furniture.ts --check` sums things per screen along the critical
  route (in route order, by stretch of 2-3 screens), **without glints**, and wants two stretches ≥ 4× the route's
  median.
- **Check.** The warning has a `canopy-r9.test.ts` like the arrivals': gates shut on the flag's step, both beats
  arrive from 400+ px, the fit zone engages.

### 5. [level] 51 glints buy nothing: decide the trade, or cut them
**What.**
- Minor pickups went 39 → 51. That is more than every reference: HK 4, Ori 11, Nine Sols 13, Silksong 41 (in an area
  five times our size).
- 15 of the tunnel's things and 11 of its path's 18 are glints.
- The hidden share fell 0.34 → 0.27 because line glints are in plain view.
- Matt's notes: "density of choice". A glint on a line is one choice (take the line) whose payoff is a number that does
  nothing.

**Fix.**
- **Matt's yes or no on the trade, one line:** three offers at the hub's `place:trader` (a moon shard, the east's
  moth-stone, `quickWings`), priced so two secrets' worth buys one.
- **If no answer by the start of round 9, cut.** Glints in the Canopy down to ≤ 25, kept only where a line or pocket
  needs a visible lure. The pockets pay shards, maps and upgrades. The pods remain the "things to hit".
- **Check.** `metrics.ts`: minors ≤ 25 (or the trade is in). The peak measure excludes glints either way (#4).

### 6. [render] The air and the hue by look: the shaft is a lightbox, the den is greyscale
**What.**
- **The shaft look.** The well's air is a pale grey fog, mean 91-113 at every stop (art direction: 45-70). It has flat
  pale trunk bands, and black slabs sit on it like paper cut-outs.
- **The den look.** The tunnel's and the nest's frames are a warm grey with almost no hue: the den's banks, the fog
  lenses, the ground, all one grey. It is the dullest room in the area, and it is the way to the boss.
- Matt's "monotone" is literal here: two of the five looks have no colour.

**Fix.**
- **The shaft.** Air mean 55-75. A cold teal-blue fog (`#0b2a33` → `#4a6f7a`), with frost-lit ribs as the brightest
  shapes in the back. The pale trunks lose half their contrast.
- **The den.** A warm umber body (`#2a1d14` → `#5a4330`), the fungus's violet and cyan as the only cool notes, a low
  warm glow from below (burrow mouths, the carriers' trails) and a red-amber warning in the den's mouth.
- **Check.** `look:check` adds:
  - the air's mean ≤ 85;
  - a minimum chroma per look (mean saturation of the air ≥ 0.12 in HSV);
  - the well, tunnel and burrow stops pass.

### 7. [level] The gap's chain plays as two
**What.**
- From a walk off the shelf, lamp 1 → lamp 2 works.
- Off lamp 2, none of down, down-left or left (three fresh runs) brings `wick-gap-3` (3,100 × 1,920) into reach. It
  hangs 80 px over the floor, where she can only stand by it.
- Down-left drops her on the thorn floor (one hit, back to the shelf).
- The builder's note: a jump off the shelf meets lamp 2 first. So the area's prettiest frame offers one good line and
  one trap.

**Fix.**
- Raise `wick-gap-3` onto the down-left arc off lamp 2, at about (3,020, 1,640) or wherever `lureArc` from lamp 2 at
  the natural aims crosses x ~3,000, and keep the glide's lock (the lit proofs).
- Make the jump-off line a chain too: from lamp 2 first, a down-left fling meets lamp 3.
- **Check.** `canopy-r8.test.ts`'s chain test becomes three aims (down, down-left, left) from lamp 2: at least two
  bring lamp 3 into reach, and none lands on the thorns without a lamp in reach on the way.

### 8. [level] Every set piece gets a frame
**What.**
- The Grove's pit, the one fight with a camera fit and gates, is the area's best moment.
- The hollow's ambush and the den's warning have neither: the camera stays at 1.0 and follows her.
- In the hollow, `wing-am`'s post is 160 px over the landing spot every time, so its dive always comes from straight
  above, out of the frame's middle.

**Fix.**
- **A `fit` zone for the hollow's floor** (1,000-1,800 × 600-1,152) while `cn-well-ambush` is set and not cleared.
- **`wing-am`'s post** moves to the lamp's side (about 1,450 × 820), so its dive comes in at an angle she can read.
- The den's warning as in #4.
- **Check.** Every trigger with `sets` that wakes creatures has a camera zone keyed to it (a scene check).

### 9. [level] The hub still has nothing to stop for
**What.**
- The clearing's frame is right now: the moon, the floor at 76%, the kin.
- But the kin does nothing yet (its beats are render's, in progress), the trader's spot is empty (Matt's call, #5),
  and there is no use for the place.
- The hub is crossed three times on the critical path. NPCs 0 against 4-12 in HK, Silksong and Nine Sols.
- The hub's other stops are slab frames (#2).

**Fix (level side; the kin's acting stays render's).**
- **The kin's lamp is a rest with a reason.** Standing at it shows the map of what she has walked (the map exists:
  Tab). It's the first map station, as HK's Cornifer and Iselda.
- **The moth-stones she carries are shown in the clearing.** Hang them on the kin's lamp, one more each time she comes
  back. The hub changes as she progresses (Dirtmouth's lit windows).
- **Check.** A `place:` claim that the kin's lamp is within 300 px of the save. The hub has one thing that changes per
  return (flags `cn-stone-*`).

### 10. [render] Objects that still read as objects
**What** (this round's frames):
- **The Grovemother.** Its plates are big dark ovals stacked edge to edge, like river stones or a pile of shields. The
  outline is still a straight-sided column.
- **The tunnel's pod garden.** Round pads on stalks with a slab on top, like stools or birdbaths, six in a row along
  the run (the knuckles).
- **The hub's amber lichen.** Even saturated yellow spots along the floor, the "cheese" render's gotcha warns of.
- **The well's fungus shelves.** Three grey lozenges stacked on a face, like drawer handles.

**Fix.**
- **The Grovemother.** Plates as long vertical bark ridges, 2-4× taller than wide, overlapping like fissured bark. The
  column's sides bulge and taper, and roots cross the plates.
- **The knuckle mounts.** Root bundles that rise from the bramble bed and spread into the pad, with no stalk-and-pad
  silhouette. Or hang the pods from root clumps, as the nest does.
- **The lichen.** Desaturate it to the heartwood's amber at 40-60% of its current chroma, in irregular smears, not
  discs.
- **The shelves.** Uneven bracket fungi (2-5 per cluster, sizes 2:1, overlapping), not identical lozenges.
- **Check.** The prop-family test adds:
  - no repeated identical silhouette three times in one view;
  - no "stalk + disc" profile (the width at mid-height < 35% of the top's).

## Smaller notes
- **The render backlog is the gate's precondition.** The Lamp prompt above all: without it the first fling is a
  wall for anyone who doesn't already know the Lamp key. Then the drawn arrivals (they slide in today), the kin's
  beats and the save's flare.
- **The well's ambush without gates is right.** With the exit one kick from the mouth, gates would only trap people
  who chose the fight. Frame it instead (#8).
- **The fork is the quiet room r7 asked for.** It's calm and moonlit, and the face and lamp read. Keep it. Its face is
  one block (#2).
- **The nest** is a one-screen-tall straight corridor with its floor along the frame's bottom and 70% fog above. It's
  a gallery on paper, a hallway on screen. If #2 hollows the tunnel, give the nest a roof line that varies (root
  curtains down to 400 px off the floor).
- **The juvenile pile (`juv-pile`)** turns every 25 frames in the events (`enemyTurn` a second, for the whole tunnel
  visit), while she is 4,000 px away. It's harmless, but check it isn't a stuck-turning loop in a pocket.
- **Climbs at 16** pass in `climbs.ts --creatures` (leg 3b: 0-1 hits from every start at every delay; the up-cut plan
  kills it unhurt from all three).
- **Shared scratchpad.** My files are in `rev8/` (shots, look:check frames, my live screenshots `p-*.png`, the
  helpers). I didn't touch the orchestrator's sheets.

## Scores (1-10, against the HK / Silksong / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | r2 | r3 | r4 | r5 | r6 | r7 | **r8** | one line |
|---|---|---|---|---|---|---|---|---|---|
| layout | 3 | 6 | 6.5 | 6.5 | 6.5 | 7 | 7 | **7** | the hatch's lesson, a framed hub; the well a vertical sink with an unlit door, slab rooms |
| density | 4 | 5 | 6 | 6.5 | 6 | 6 | 7 | **7** | two peaks on paper; the second on a branch, its path half glints; a real quiet fork |
| combat | 3 | 4 | 5 | 5.5 | 6 | 6 | 6.5 | **7** | arrivals fair, the Grove's pit excellent; the hollow and the den's warning unframed |
| traversal | - | - | 4 | 4.5 | 6 | 6 | 6.5 | **7** | the fling required and safe at minute one; leg 2 still bleeds; the gap's chain is two |
| secrets | 2 | 5 | 6 | 6.5 | 6.5 | 6.5 | 6.5 | **6.5** | majors 23; 51 glints buy nothing, hidden share down to 0.27 |
| readability / look | 5 | 4 | 5 | 6 | 6.5 | 6.5 | 7 | **7** | a silhouette ground, moss by look, growing gates, beds, the moon; black boxes, a lightbox shaft, a grey den |
| pacing | 3 | 5 | 5 | 4.5 | 5.5 | 5.5 | 6 | **6.5** | a pass re-forms her, a quiet fork, 0:38 to the hub; then climbs, and the bots lose 10+ min in the well |

**Overall: 7 / 10 against the references** (r1 3.5, r2 4.5, r3 5.5, r4 5.5, r5 6, r6 6, r7 6.5).

The first ten minutes are now fair: nothing spawns on her, a run through a save counts, and the area's verb is required
at minute one with a lamp that can't be lost. That is what r7 asked, and it is the first round where I would hand a
build to a person without warning them about something unfair. (The prompt has to land first.)

What keeps it from 8:
- the first long room is a climb with a door nobody can see;
- the frames are half black boxes;
- the loud places are the Grove and a branch;
- the pickups that pad the counts buy nothing.

These are shape problems, Matt's "the level design is what fails", and the fixes are geometry, not dressing.

**What improved since round 7:**
- the first fling: required, safe, framed, a minute in;
- ambushes that arrive from 1,000 px with a beat, and stay cleared;
- the re-form on a pass;
- the hub's frame with the moon;
- a quiet fork;
- leg 3b fair at 16;
- the ground a silhouette, moss by look;
- gates that grow;
- bramble beds that read;
- the Grovemother plated.

**What didn't:**
- leg 2's strip (4th round as the top hit source);
- the hollow's unlit door and skippable-unseen ambush;
- the second peak on a branch;
- 51 glints and no trade;
- too much solid in frame, drawn as rectangles;
- the shaft's pale air;
- the grey den;
- the gap's third lamp;
- the kin still idle;
- still no human run.

## Round 9: the ten fixes, ranked by impact

Gate: Matt's run from the hatch to the Grove, after render's Lamp prompt lands and #1 is in.
1. **[level] The well's door and its climb:** light the limbs' door from the hollow and frame it on topping the
   chimney, so the ambush is a choice that pays (the hollow's prize behind its lamp line), leg 2's strip off a relaxed
   hand's slide line (hand-tested), and at most two climbing legs between the hub and the limbs. Checks: the door in
   frame at 16:9 / 21:9, the average bot out of the hollow in 60 s.
2. **[level] Less solid in frame:** camera locks and zones that keep wide stops ≤ 30% deep solid (median ≤ 20%),
   the well's walls hollowed to pillars with back behind them, the hub's slab a bough 200-320 thick, the fork's block
   a trunk, no solid rect over 640 wide showing its interior; `look:check` gets the bar.
3. **[render] Edges, not boxes:** growth wraps faces (20-60 px) and undersides (hanging clumps 40-160 px) in each
   look's growth, the core starts 120-200 px in with a mid-dark outer band, no straight painted edge over 300 px;
   test the outline and the face cover; whole-frame near-black ≤ 45% at the well, hub and fork.
4. **[level] The second peak on the path:** the den's warning as a two-beat arena on 768-1,024 px with a fit zone and
   lamps, the hawker's strike on the glide's line, the pit's arc 8 → 3 glints; peaks measured along the critical
   route without glints (two stretches ≥ 4× the route median).
5. **[level] Glints:** Matt's yes or no on the trade (three offers at `place:trader`); if no answer at round 9's
   start, cut Canopy glints to ≤ 25 and pay pockets in shards, maps and upgrades.
6. **[render] Air and hue by look:** the shaft's air to 55-75 in a cold teal, the den's umber with fungus accents and
   a warm glow from below; `look:check` air mean ≤ 85 and an air chroma floor per look.
7. **[level] The gap's chain as three:** `wick-gap-3` up onto lamp 2's down-left arc (about 3,020 × 1,640, glide's lock
   kept), the jump-off line chained too; at least two of three natural aims off lamp 2 reach lamp 3, none lands on
   thorns without a lamp on the way.
8. **[level] Every set piece framed:** `fit` zones keyed to the hollow's ambush and the den's warning, `wing-am`'s
   post off her landing column (about 1,450 × 820); a scene check that every creature-waking trigger has a camera
   zone.
9. **[level] A reason to stop in the hub:** the kin's lamp as the map station by the save, and the moth-stones she
   carries hung there, one more per return, so the hub changes as she progresses.
10. **[render] Objects out:** the Grovemother's plates as tall fissured bark ridges on a tapering column, the tunnel's
    knuckle pads as root bundles (no stalk and disc), the hub's amber lichen desaturated into smears, the well's
    fungus shelves as uneven bracket clusters; the prop test bans stalk-and-disc profiles and triple repeats in a view.
