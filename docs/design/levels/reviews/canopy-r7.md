# The Canopy, review round 7 (2026-10-31)

Reviewer brief: judge the Canopy v7 (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 27 rooms `cn-*`) against the
first areas of Hollow Knight, Silksong, Ori and Nine Sols. It covers the level pass 9f0d77a, the render pass
7a7d45c..03919f9, and the deployed snapshot 3e924ff. Say what changed since round 6 (`canopy-r6.md`) and write the
round-8 spec.

Sources:
- the docs: `first-area.md` (v7 and both builders' weak lists), `memory/canopy.md`, `memory/canopy-render.md`,
  `art-direction.md`, the reference README and the four `EXTRACTED.md`, and Matt's notes (density of choice, paths not
  places, his area-1 playtest, "strengths: feel; weakness: levels");
- 54 wide shots with pickups at 16:9 over ten rooms (the well, hub, Grove, gap, tunnel, limbs, trunk, burrow, fork and
  hatch), and the hub and Grove again at 21:9. They were served from the release worktree on port 5214, with luma
  measured on each frame;
- `metrics.ts --md` and `canopy-furniture.ts --check --rooms` over the four exact references and ours;
- `climbs.ts --creatures`, plus `climbs.ts` at delays 6 / 16 / 24 with the default margin and at 16 / 24 with none;
- **Wing driven live through `window.__game`** (the room-change crash is fixed; headless playwright-cli now draws):
  - leg 3a and 3b past the lampwing;
  - the ambush, frame by frame;
  - a fade in the ambush, to see where she re-forms;
  - the drop into the Grove's pit, the wave, and a fling off `wick-a`;
  - the gap's fling chain from the shelf;
- the bot reports in `playtest-reports/canopy-r7/`;
- the compare sheet `shots/canopy-r7-render/compare/r7-vs-refs.png`.

What I could not do:
- Play it as a person with real hands. Scripted input finds where things break, not whether they are fun.
- Fight the den's boss.
- Script a clean three-lamp chain in the gap (more below).

All coordinates are room-local px, as in the generator.

## The short version

**6.5 / 10.** Up half a point. This is the first round in three where the area moved on what a player meets, not only
on the totals.
- **The shape is now in the references' band.**
  - Room density CV is 0.84 (r6: 0.41; HK 1.10, Silksong 0.96, Ori 0.59).
  - Six rooms are quiet, and 76% of the thorn length is in runs of 640 px or more.
  - Thorns sit in 10 rooms, not 20.
  - The Grove is a real peak at 5.7× the median.
- **The frames read.** Across my 54 wide frames, 12-49% of the pixels are near-black (r6: 54-85%), and the hub's
  clearing went from a mean luma of 8.8 to 34.8.
- **Leg 3 and the arena work.**
  - Leg 3 has a safe rest, and a person can climb past its lampwing; I did, unhurt, on my first composed try.
  - The Grove's fight is now the pit, with a fit camera and lamps a jump puts in fling reach.
- **What a person would hit first is new:**
  - **Both ambushes spawn on top of her.** In the well's hollow a burrback appears 90 px away and hits her within
    16 frames. In the Grove's pit, the west burrback appears 50 px from where she drops in and hits her within 40.
  - **The hollow's save does not catch a runner.** A fade in the ambush, without first standing on `p-hollow`,
    re-forms her at the landing's save (verified). That is legs 3a and 3b and the lampwing again: r6's runback,
    still there.
  - **The fling is never taught.** No prompt, and no required use. A new player can finish the area without knowing
    the verb, so the five fling lines and the Grove's low lamps exist only for people who already know.
- **The look traded one problem for another.**
  - The ground is no longer a silhouette: the inside of the big masses now reads at luma 19-35, against 0-5 in HK and
    Silksong, and is streaked diagonally like rain on glass.
  - One lime moss "frosting", the same thickness, sits on every top in every room.
  - The shaft's mid plane reads as stacked cartoon clouds.
  - The arena gates are flat grey planks.

**Still nobody has played it.** This is the fourth review to ask, and the numbers no longer say anything a person's run
wouldn't say better. Round 8's gate is the same as round 7's: **Matt's run from the hatch to the Grove**, recorded, with
his words per stretch. **A decision is also Matt's: the trade.** The area pays 39 glints that buy nothing; the spot by
the hub's save is ready (`place:trader`). Yes or no decides whether glints mean anything here (#4).

What works, and should be kept:
- **The spread measure and its bar** (`canopy-furniture.ts --check`). It reproduces the review's numbers, and the
  builder met it by moving furniture, not by adding it.
- **The long runs.**
  - The tunnel's west hall (1,856);
  - the limbs (1,408);
  - the way out's valley (1,344);
  - the bower's hall (1,088);
  - the gap's floor (944), where the fall is the cost.
- **Leg 3's mid rest.** 10 s on it with the lampwing in costs no hit, from all three starts. From its lip, up cuts
  kill the lampwing unhurt. Going straight past costs 0-1 hits in five of six (start, delay) pairs.
- **The Grove's arena** (`arena-w`, `arena-e`, the `fit` zone).
  - When the wave starts, the camera pulls to zoom 0.83 and the whole pit is one frame.
  - A jump from the floor puts `wick-a` in reach (at y 1,403 in my run), and the fling launches.
  - The lock holds with the lamps lit (`tools/solve/canopy.ts`).
- **The gap's frame**: the moon, the fling lamps hanging off the shelf, the vista. It is the area's best still now,
  next to the Grove.
- **Majors 23, hidden share 0.34.** In the references' range at last, and each pocket pays one thing.
- **The kin** reads as someone else now (small, ash-pale): no longer a second Wing.
- **The headless fix.** playwright-cli draws after `goto`, so reviewers can play again.

## Since round 6, fix by fix

| r6 # | fix | v7 | status |
|---|---|---|---|
| 1 | peaks and quiet | CV 0.84, 6 quiet rooms, the peak 5.7× the median, 76% of thorns in long runs, hazard in 10 rooms | **done to the bar.** Two gaps: 4 of the 6 quiet rooms are branch ends (the crawl, cellar, burrow and hollow root), and the second peak r6 asked for (the tunnel near the Grove's density) was not built (the tunnel is 3.57). See #7. |
| 2 | value contrast | the veil, a thick walk moss, sub-masses, `look:check` | **done by the numbers.** All 54 frames: near-black 12-49%, mid-tones 20-74%; the hub's clearing 34.8. But the lift reached the solids too (#3). |
| 3 | leg 3 as a choice | the mid rest, the lampwing at (2112, 1400), the ambush on a trigger, `p-hollow`, `climbs.ts --creatures` | **done in the climb, broken at the top.** The rest and the climb are fair (one variance case, #9). The trigger fires, but its spawns land on her (#2), and `p-hollow` only counts if she stands in it (#4). |
| 4 | five fling lines | the trunk, the limbs, the gap, the hollow, the Grove; proven with the lamps lit | **built, but invisible.** Nothing teaches the fling (#1). In the gap, a natural down-left aim off the first lamp skips the second and lands by the third. The bots lit 0 lamps. |
| 5 | no plane over 35% | sub-masses, lobes, fungus clumps | **done, with a cost.** No flat plane; the masses are now a streaked mid-dark (#3). |
| 6 | the arena is the pit | root gates, fit zone, lamps at 1,380, 7 pods | **done.** Spawns point-blank (#2); the gates draw as planks and pop (#8). |
| 7 | rewards that matter | majors 35 → 23, greats 3, shards 6, hidden 0.34 | **done.** No sink: Matt's call (#5). |
| 8 | pedestals and trays out | `families.ts`: mounts, 18 bramble families, test | **done.** Two shapes still read as objects: the arch mount as a croquet hoop, the burl mount as an egg (#8). |
| 9 | a mid plane of shapes | moss mounds, hanging roots, leaf masses, fern curls | **half.** The canopy look's leaf masses work (the limbs). The shaft's mounds stack into columns that read as cartoon clouds or smoke (#8). |
| 10 | the hub as the quiet place | the clearing stripped, the moon placed, the notch closed, the kin restyled | **half.** The notch is closed, and the clearing is empty. But the frame is 55-60% under-floor slab, there is no moon, and nothing is there to stop for (#5). |

## The numbers against the four references

`metrics.ts --md` and `canopy-furniture.ts --check --rooms` on 3e924ff (exact references; hero-scaled where noted:
Silksong ×0.58, Nine Sols ×0.8):

| measure | HK | Silksong | Ori | Nine Sols | Canopy v6 | **Canopy v7** | read |
|---|---|---|---|---|---|---|---|
| box screens / air screens (hero) | 357 / 132 | 513 / 44 | 85 / 48 | 170 / 56 | 87 / 44 | **94 / 45** | Ori's size |
| critical-path room share | 0.25 | 0.29 | 0.71 | 0.72 | 0.52 | **0.52** | in range |
| enemies per box screen | 0.55 | 0.26 | 0.57 | 0.59 | 0.47 | **0.42** | in range |
| things per box screen (metrics) | 0.28 | 0.17 | 0.80 | 0.42 | 1.70 | **1.33** | still the busiest, 1.7× Ori |
| screens with nothing in them | 59% | 67% | 33% | 57% | 40% | **46%** | in range |
| majors | 17 | 8 | 23 | 16 | 35 | **23** | top of the range |
| hidden share of pickups | 0.35 | 0.22 | 0.18 | 0.26 | 0.57 | **0.34** | in range |
| saves | 7 | 7 | 2 | 5 | 7 | **8** | generous |
| NPCs / lore | 12 / 3 | 12 / 3 | 0 / 0 (scenes) | 4 / 4 | 0 / 0 | **0 / 0** | nobody to meet (#5) |

**The spread:**

| measure | HK | Silksong | Ori | Nine Sols | Canopy v6 | **Canopy v7** |
|---|---|---|---|---|---|---|
| room density, mean / median | 1.31 / 0.86 | 0.85 / 0.71 | 2.40 / 2.16 | 2.51 / 1.69 | 3.12 / 2.95 | **2.23 / 1.69** |
| spread across rooms (CV) | 1.10 | 0.96 | 0.59 | 1.08 | 0.41 | **0.84** |
| rooms under 0.5 a screen | 16 / 48 | 9 / 34 | 2 / 17 | 7 / 39 | 0 / 27 | **6 / 27** |
| busiest room ÷ median | 8.9 | 5.4 | 2.6 | 7.7 | 2.5 | **5.7** |
| hazard runs ≥ 640 (share of length) | 18 (71%) | 8 (55%) | 3 (34%) | 13 (71%) | 2 (20%) | **7 (76%)** |
| rooms with any hazard | 16 / 48 | 20 / 34 | 11 / 17 | 16 / 39 | 20 / 27 | **10 / 27** |
| hazard px per air screen (hero) | 340 | 877 | 328 | 374 | 272 | **240** |

**Density along the critical path, in the order it is walked** (things a screen):
- the hatch 0.19;
- the hub 1.35;
- the trunk 3.71;
- the well 3.57;
- the limbs 3.38;
- the hub;
- the fork 3.38;
- **the Grove 9.56**;
- the Spire 2.53;
- the bower 2.63;
- the crown 0.42;
- the gap 4.34;
- the hub;
- the tunnel 3.57;
- the den 1.41 (the boss);
- the way out 2.44.

The rhythm exists: a quiet start, the hub between legs, the crown as a breath before the gap. But the trunk, the well,
the limbs and the fork run at 3.4-3.7 one after another, and the Grove is the only peak. HK's Crossroads have three
loud rooms (the Goam tunnel, the Aspid arena, False Knight) in a quiet web. The quiet rooms that bought the CV are
mostly branch ends: the crawl, the cellar, the hollow root, and the burrow (4.7 screens of mass and one map). They are
fine as rooms, but they are not where the path breathes.

**The look** (480 px wide grey per frame; "dark" < 16, "mid" 50-150):

| frame | mean | dark | mid |
|---|---|---|---|
| HK King's Pass (`Tutorial_01`) | 28.7 | 50% | 23% |
| HK Crossroads_01 | 45.5 | 34% | 41% |
| Ori, Spirit Caverns | 35.0 | 24% | 22% |
| ours, the hub's clearing (r6: 8.8 / 85% / 1%) | **34.8** | **38%** | **25%** |
| ours, the Grove pit (r6: 19.2 / 62% / 9%) | **36.1** | **43%** | **26%** |
| ours, the well's rest | 42.8 | 36% | 31% |
| ours, the well's hollow | 72.9 | 14% | 63% |
| ours, the tunnel's landing | 34.4 | 44% | 34% |
| ours, the gap's far side | 66.1 | 18% | 61% |
| ours, the hatch | 59-71 | 12-22% | 61-74% |

On the frame as a whole, value is solved. Inside the masses it is not (crops of the frame's interior, no edges):
- the well's west block, 27 and 35;
- the hub's under-floor, 19;
- the Grove's west mass, 19.

Silksong's and HK's ground is 0-5, with the air at 40-80 and the moss edge the brightest thing in the frame. Ours puts
the air at 40-70 and the solid at 19-35. The step from air to ground is about 2:1 where theirs is 10:1 or more, so
the playfield no longer reads as cut out of the picture. (`memory/canopy-render.md` reports the solid at 6-11 with
its own measure; on the final frame, my crops say otherwise. `look:check` should measure this itself, #3.)

## What I played, and what it felt like

- **Leg 3.** From the landing, `R40 R+J20 R8 J1 R16 J1 R16` climbs the east face. Crossing to the west face over the
  rest's mouth puts her by the lampwing at (2,130, 1,400): it turns `curious`, dives where she was, misses and
  stalls, and she is on the hollow's floor with 4 of 4. The rest is visible from the landing (the moss shelf over her
  head, y 1,856), which is right: you see your next stop. It feels like a fair climb with a threat. The toll is
  gone.
  - **Variance.** `climbs.ts --creatures`: the plain plan from x 1,728 at delay 10 takes 4 hits and fades. From
    x 1,792 it takes 0. Starts 64 px apart give a free pass or a fade.
- **The ambush.** I jumped off the block west of `p-hollow` and walked into the trigger (704-1,408 × 960-1,152). On
  the frame the trigger fired:
  - `burr-am-2` appeared at x 1,197, 90 px from her landing at 1,288, already in `windup`;
  - `wing-am` appeared at (1,300, 915), over her head;
  - she was hit 16 frames later.

  There is no entrance and no tell, and the gates and doors don't move. They are simply there. HK's ambushes shut
  the gates first and drop the enemies in from the ceiling or the room's ends with a beat to read. With 1 hp, she
  faded 50 frames after entering.
- **The re-form.** I stood on the landing's save, then went to the hollow without stopping on `p-hollow`, and faded
  in the ambush. She re-formed at `p-landing` (1,700, 2,352): legs 3a and 3b and the lampwing again. The casual bot
  did the same twice. A patch rests her only when she stands in it. A person who has just finished a climb walks
  through the save to the next thing.
- **The Grove.** I dropped from the tiers through `arena-w`'s opening and walked east. The trigger (1,536-3,200 ×
  1,472-1,600) fired at x 1,754:
  - `burr-pit-w` appeared at 1,802 and `juv-wave-w` at 1,761, both inside 50 px of her;
  - she took a hit within 40 frames;
  - the camera fit the pit at zoom 0.83, and the root gates appeared as grey planks.

  With the camera pulled back, a jump from the floor under `wick-a` put it in reach (`reach: wick-a` at y 1,403),
  and a fling launched her up and out of the scrum. The fight's tools are all there. The opening second is the
  problem.
- **The gap's chain.** I ran off the shelf's lip at 3,557 with a short hop, and `wick-gap-1` came into reach at
  (3,374, 1,095). A down-left fling off it carried her past `wick-gap-2` (140 px east of her line at y 1,600, never in
  reach) and into reach of `wick-gap-3`, landing safe at (3,043, 1,936) by the pod garden. So it works, it is safe,
  and it is fun to fall through, but the three lamps play as two. A plain walk-off at the lip also puts lamp 1 in
  reach. A plain jump from the lip does not (it carries her 140 px over it), so she drops onto the thorn floor: one
  hit, back to the lip.
- **The hub.** It is quiet now. The clearing is a long lime floor with fiddleheads, the kin and Wing, and under it
  sits a streaked slab that fills 55-60% of the frame at 16:9 and at 21:9. There is no moon and no light source, and
  nothing to look at or stop for. Dirtmouth is quiet too, but it is a *street*: houses, lamps, the well, Elderbug on
  his bench.

## The 10 most important problems, ranked

### 1. [level] The fling is never taught, so the area's best verb is invisible
**What.**
- No prompt: `src/render/hud/prompts.ts` has the offer's prompt and nothing for the lamp.
- No required use: every fling line is optional by design (v7 #4). The bots lit 0 lamps in three runs.
- A person who doesn't already know that V near a flame stops time will cross the whole Canopy jumping. They never
  see:
  - the trunk's return;
  - the limbs' high line;
  - the gap's chain;
  - the hollow's lamp;
  - the Grove's escape.
- Matt's "density of choice" names "go for a lamp" as one of the four things the Grove offers. For a new player it
  is zero of them.

**Why it matters.** Ori teaches Bash with a forced use over a gap the moment it is gained, then builds every optional
line on it. HK's first spell is used on the next screen. A verb that is never required is a verb most players never
find.

**Fix.**
- **A required, safe first fling within the first three minutes**, on the path before the well. A gap a jump can't
  cross, with one lamp over it and soft ground under it (no thorns: a miss puts her back on the near side). Two good
  places:
  - the hatch's descent;
  - the hub-to-trunk way (the hub's east, before the trunk's door).

  A wordless "notice" first: the camera holds the lamp for a beat as she arrives, and moths spill toward the far side.
- **A one-time prompt** the first time a flame is in reach (`lures().reach` non-null): "hold V" next to the lamp,
  in the offer prompt's style, gone after the first fling.
- **Every optional line shows its prize from the lamp.** The glints or the pocket mouth must be in the frame while
  she aims (the limbs' niche, the gap's roost).
- **The gap's chain**: move `wick-gap-2` onto the down-left arc from `wick-gap-1`, about (3,120, 1,560), so a natural
  aim catches it. Then the three lamps play as three.
- **Check.**
  - The solver's lock claims hold with the new lamp (lamps lit).
  - A `place:` claim that the first fling's gap can't be jumped, or glided once she has the glide (or put it before
    the glide).
  - A humanplay bot that knows the prompt uses it.

### 2. [level] Ambushes arrive; they don't appear on her
**What.** Both ambushes spawn their creatures where she lands when the trigger fires.

| ambush | trigger | where she is | spawns | first hit |
|---|---|---|---|---|
| the well's hollow | 704-1,408 × 960-1,152 | landing off the block at about x 1,290 | `burr-am-2` (1,197, already winding up), `wing-am` (1,300, 915) overhead | 16 frames |
| the Grove's pit | 1,536-3,200 × 1,472-1,600 | dropping in through `arena-w`'s opening, x 1,750 | `burr-pit-w` (1,802), `juv-wave-w` (1,761) | 40 frames |

**Why it matters.**
- A hit the player could not see coming is the one thing a skilled player won't forgive, and it is the first thing
  in both of the area's set-piece fights.
- HK's Crossroads ambushes shut the gates, then drop the enemies in from the room's ends.
- Nine Sols' lift ambush gives a beat of alarm before the first spawn.
- Silksong's Moss Mother rises out of the floor with a roar before she can strike.

**Fix.**
- **Shut first, spawn second.** The trigger shuts the doors and gates on frame 0. The creatures arrive 30-45 frames
  later.
- **Spawns at least 400 px from anywhere she can stand inside the trigger**, entering from the edges:
  - *the well*: `burr-am-1` and `burr-am-2` crawl out of a burrow mouth in the west wall (x ≤ 760). `wing-am` drops
    from the roof roots over the lamp (1,400, 880) with its tell. Narrow the trigger to 1,000-1,408, so it fires as
    she lands off the block and they come from the far end.
  - *the Grove*: beat 1's burrbacks come in from the pit's east floor (x ≥ 2,700) and down the west wall's root ramp
    (x ≤ 1,472, behind the cap). Beat 2's juveniles drop from the gates' undersides at the far side from her.
- **Harmless while arriving.** A spawning creature can't hurt or be hurt until it lands (a `spawning` mode, ≥ 40
  frames), and it is drawn: dust, the roots parting, a drop.
- **Check.** A test that enters each trigger from every edge she can come from, stands still for 60 frames and
  takes no hit. The nearest spawn is ≥ 400 px from her at frame 0.

### 3. [render] The ground is no longer a silhouette
**What.**
- Value is fixed on the frame (above), but the lift reached the solids. Mid-mass crops:
  - the well's west block, 27-35;
  - the hub's under-floor, 19;
  - the Grove's west mass, 19.
- The air is 40-70, so the step from air to ground is about 2:1. HK's and Silksong's ground is 0-5 with the air
  mid-value: 10:1 or more.
- The masses read as textured blue-grey surfaces:
  - the sub-masses at two values;
  - the diagonal grain streaks, like rain on glass;
  - the veil screened over everything behind.

  At 21:9 the hub's clearing is a slab of streaks under a strip of floor.
- The compare sheet shows it directly: Silksong's walls are black cut-outs with a lit moss rim; ours are a lit
  material.

**Fix.**
- Interiors deeper than about 96 px from an edge go to luma ≤ 12, flat or with only a whisper of shape (one lobe line,
  not hatching).
- The sub-masses and the knuckles live in the outer 64-160 px band, where they shape the silhouette, not the inside.
- The diagonal streak texture goes.
- The veil lifts only what is behind the playfield (it already sits behind it; check that the post's exposure isn't
  re-lifting the solids).
- **Check.** `look:check` adds two numbers on the final frame, from the collision split it already has:
  - the solid interior's mean ≤ 12;
  - the air's median ≥ 4× the solid's.

  The frame-level bars stay.

### 4. [level] The hollow's save doesn't catch a runner
**What.** A patch rests her (and becomes her re-form point) only when she stands in it. I verified: from the
landing's save, reach the hollow without stopping on `p-hollow`, fade in the ambush, and she re-forms at `p-landing`.
That is leg 3a, leg 3b and the lampwing again: exactly the runback r6 #3 asked to remove. The casual bot faded twice
this way.

**Why it matters.** HK's bench before a fight is a bench you *want* to sit on: it is the only light in the room, and
the music changes. Ours is a patch on the floor between a block and the chimney's mouth, crossed at a run.

**Fix.**
- **Walking through a patch sets the re-form point** (not a rest: no heal, no refill; `memory/goal.md` already
  separates the two). Standing in it still rests.
- Keep `p-hollow` where it is.
- Do the same for every patch at a climb's top (the way out's rests, the Spire's nook).
- **Check.** A test walks over `p-hollow` without stopping, fades in the ambush, and re-forms at `p-hollow`.

### 5. [level] The hub is quiet but not a place, and the trade is Matt's call
**What.**
- The clearing is a lime floor over a slab that fills 55-60% of every hub frame at 16:9 and 21:9 (the camera
  follows her with the floor at the top third).
- No moon: the level placed it at view (1,180, 200), and render's backdrop covers it.
- Nothing to stop for: the kin stands there, and the trader's spot is empty.
- The hub is 1.35 things a screen (its sockets and shown locks), which is fine for a hub.
- NPCs 0 against 4-12 in HK, Silksong and Nine Sols. The kin is the only other person in the area, and it does
  nothing.

**Why it matters.**
- README fact 10: the hub is quiet and crossed often. Dirtmouth and Bone Bottom are quiet *places*: lit, framed
  against the sky, with someone in them.
- The hub is crossed three times on the critical path, and each time it says nothing.
- `story-taste.md` asks for relationships; the kin is where one could start.

**Fix.**
- **Frame it.** A camera zone over the clearing (save ± 1,200 px) that biases the view up, so the floor sits at
  75-80% of the frame height, and the sky with the moon fills the rest. Render lets the moon through the backdrop in
  the hub (render's own weak list names it).
- **Light it.** One warm source in the clearing (the kin's own lamp, a moss bank), so it is the warmest place since
  the hatch.
- **The kin acts, in three places.**
  1. In the clearing it watches her and turns away.
  2. In the bower's kin chamber it is found again, doing something (keeping a lamp, mending a wing).
  3. At the way out it is waiting after the boss.

  Wordless, retellable, cheap to stage (`memory/staging.md` has the cue system).
- **The trade: put it to Matt as one yes or no.** Three offers bought with glints (a moon shard, the east's
  moth-stone, `quickWings`), priced so half the secrets buy two. If no, cut glints in the Canopy to the minimum the
  fade needs, so pockets pay shards, maps and upgrades, not a number.
- **Check.**
  - The clearing's wide stop has the moon in frame and the floor below 70% of the height, at 16:9, 16:10 and 21:9.
  - The kin has three staged beats.

### 6. [render] One moss, everywhere
**What.**
- The walk moss is a lime band of cushions with crest domes, 44-84 px deep, the same on every walkable top in every
  room and every look:
  - the hub's heartwood;
  - the well's shaft;
  - the Grove;
  - the limbs' canopy;
  - the tunnel's den.
- It fixed the value problem and made every ledge identical: a bright green frosting.
- Silksong's moss is stippled clumps with dark gaps: thick on some edges, absent on others, and a different growth
  per region.
- `canopy-render.md`'s weak list says it already: smooth, not stippled.

**Fix.**
- **Per look:**
  - the shaft: frost lichen, pale and thin;
  - the den: fungus caps and bare earth;
  - the heartwood: amber lichen and bark;
  - the canopy and the Grove: lime moss clumps.
- **Coverage 40-85% of a top's length, in runs with breaks**, and thickness varying 10-60 px along a top.
- **Stippled**: clumps built of dots with dark gaps and a shadowed underside, not a smooth band.
- The walkable read is carried by a thin lit lip on every top, so a bare stretch still reads as ground.
- **Check.** A test: no two looks share a top-band family. Across the area, a top's moss coverage ranges 40-85%.

### 7. [level] One peak, and the quiet is off the path
**What.**
- On the critical path, the trunk, the well, the limbs and the fork run at 3.4-3.7 things a screen one after another,
  and the Grove (9.6) is the only peak.
- r6 #1 asked the tunnel to rise to about the Grove's density as a second peak; it is 3.57.
- Four of the six quiet rooms are branch ends: the crawl, the cellar, the hollow root, the burrow.
- The burrow's 3,520 px west is solid mass, grown to close the map's notch. It is a closed hole, not a room anyone
  goes to.

**Why it matters.**
- README fact 3: highs and lows.
- HK's path has quiet halls between loud rooms. Its peaks (Goam, the Aspid arena, False Knight) are several, and
  each one is remembered.
- Ours has one fight to remember before the den.

**Fix.**
- **A second peak in the tunnel** (≥ 7 things a screen over its west hall and pit):
  - the carriers' trail through the bramble run;
  - a hawker over the pit;
  - the pod garden on the knuckles;
  - a gated wave at the pit's end (the den's warning).

  Same totals: take it from the bower and the Spire, which drop to about 1.5.
- **One path room between the well and the Grove goes quiet** (≤ 0.8). The fork's approach (its knoll and stairs)
  is the candidate: strip it to the face and the lamp, so the climb into the Grove starts from calm.
- **The burrow** either becomes the tunnel peak's lower floor (the carriers' nest, a loop back up), or shrinks back
  to its cave, with the notch filled by the tunnel's mass.
- **Check.** `canopy-furniture.ts --check` adds:
  - two rooms ≥ 4× the median;
  - no three critical-path rooms in a row within ±20% of each other.

### 8. [render] Shapes that read as objects, and gates that pop
**What** (all from this round's frames):
- **The shaft's mid plane**: lobed mounds stacked into columns. They read as cartoon cumulus or smoke stacks, the
  biggest shapes in every well frame.
- **The chimney walls** stack like pillows (render's own weak list).
- **The arena gates** draw as flat grey planks over the pit's roof, and appear or vanish in a frame.
- **The Grovemother's trunk**: a flat dark slab with an hourglass bulge, the largest object in the area's best room.
- **The arch one-way mount**: a croquet hoop or a pipe handle (the hub, the tunnel).
- **The burl mount**: an egg or an urn on a foot (the tunnel's run).
- **The limbs** end in square saw cuts.

**Fix.**
- The shaft's mid plane: hanging root curtains and frost-lit wall ribs that run off the frame top and bottom. No
  closed round shapes floating free.
- The chimney's faces: lobes of uneven length (100-400 px), with roots crossing seams.
- **The arena gates**: a root mat that grows across from both sides over 40 frames on `cn-grove-wave` (dust, a
  shake), and withdraws over 40 on `cn-grove-clear`. Same for `pit-door`. The level side is ready: `gateShut` and
  the flags.
- The Grovemother: bark plates, a lit ridge on its moon side, roots climbing it, a hollow; no flat interior over a
  third of its width.
- The arch and burl mounts redrawn as roots that grow out of a mass, not shapes on a floor. The limbs' ends broken or
  tapered.
- **Check.** The prop-family test: no closed convex shape over 200 px free-floating in a mid plane.

### 9. [level] Climb fairness for a relaxed hand
**What.**
- **Leg 3b's spread.** With the creatures in, the plain plan from x 1,728 at delay 10 takes 4 hits and fades (from
  full health); from x 1,664 or 1,792 it takes 0-1.
- **Delay 16** (a relaxed kick; r6 ran it, and every plan passed) now fails here:
  - `spire-1` from 2 of 3 starts (x 1,088, 1,152: back on the floor);
  - `spire-neck` from 1 (x 1,296);
  - `elder-1` from x 880;
  - `well-3b` from x 1,792.

  The rooms didn't change, so either the plans in `climbs.ts` (169 lines changed this round) or the margin moved
  them. Each fail is a fall back to a rest, not a hit.
- **Leg 2's strip** is still 84 px tall. It is the area's top hit source for three rounds running (casual 15,
  average 11), and r6 asked for 160-200 so a person sees it before touching it.

**Fix.**
- The lampwing's dive: after a missed dive it stalls ≥ 60 frames and doesn't dive again while she is on the same
  face. One pass, one dive.
- Add delay 16 to the fairness test's default delays. Fix the plans or the faces until every required climb passes
  at 16 from every start.
- Leg 2's strip to 160 tall, laid from `climbs.ts` touches. If the risk glints over it need the 84, move them up the
  face.
- **Check.**
  - `canopy-climbs.test.ts` at delays 0 / 6 / 10 / 16;
  - with creatures, ≤ 2 hits for every plain start at every delay;
  - `thorn-w2` ≥ 160 tall.

### 10. [render] The den look and the long runs
**What.**
- The tunnel and the burrow (the den look) are flat grey fog with horizontal lenses: render's weak list says "the
  den's back is flat fog".
- The area's longest hazard, the tunnel's 1,856 px bramble run, reads at play distance as a hairline row of small
  barbs along the floor: a texture, not a danger to plan around.
- The same holds for the gap's floor (944) and the limbs' bed (1,408).
- The 18 bramble families differ only up close (render's weak list again).

**Fix.**
- **Long runs (≥ 640) get a bed with a silhouette:**
  - 48-96 px of tangle over the strip (barbs only on the strip, as now);
  - canes arching up at the ends;
  - one warm glint per 200 px on the barbs, so the danger reads in the dark.
- **The den's back**: burrow mouths, root curtains, shed shells at mid value, with the fungus light from below
  (already in the look) on shapes, not fog.
- **Check.** `look:check` on the tunnel's run stop: the bed's top edge is visible (≥ 40 px of luma step over the
  floor) at 480 px wide.

## Smaller notes
- **Matt's run is the gate for round 8**, as for round 7. If it can't happen, the builders ship #1, #2 and #4 first:
  they are what a person meets in the first ten minutes, and none of them is tuning to bots.
- **The fork's passage under the floor hole** (r6's dead loop) was not checked this round; the average bot didn't
  reach the fork.
- **The fit zone at 21:9** frames the pit fine; the arena reads as one room.
- **Shared scratchpad.** I overwrote the orchestrator's `sheet-cn-<room>.png` contact sheets for the ten rooms I shot
  (scratchpad root); they are regenerable from `shots7/`. My files are in `rev7/` in the scratchpad.
- **The fling reach is generous and good**: a walk-off at the gap's lip and a jump under the Grove's lamps both find
  reach without precision. Keep `reach` as is when the first fling (#1) is built.

## Scores (1-10, against the HK / Silksong / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | r2 | r3 | r4 | r5 | r6 | **r7** | one line |
|---|---|---|---|---|---|---|---|---|
| layout | 3 | 6 | 6.5 | 6.5 | 6.5 | 7 | **7** | the notch closed, the arena is the pit; the hub is a floor over a slab, the burrow a filled hole |
| density | 4 | 5 | 6 | 6.5 | 6 | 6 | **7** | the spread in the references' band (CV 0.84, 6 quiet, 76% long runs); one peak, quiet mostly off the path |
| combat | 3 | 4 | 5 | 5.5 | 6 | 6 | **6.5** | a one-screen arena with lamps in reach, leg 3's lampwing a choice; both ambushes spawn on her |
| traversal | - | - | 4 | 4.5 | 6 | 6 | **6.5** | five fling lines and a fair leg 3; the fling never taught, the gap's chain plays as two, delay 16 fails on the Spire |
| secrets | 2 | 5 | 6 | 6.5 | 6.5 | 6.5 | **6.5** | majors 23, hidden 0.34, a pocket pays one thing; glints buy nothing |
| readability / look | 5 | 4 | 5 | 6 | 6.5 | 6.5 | **7** | the frames read (12-49% near-black); the solids lifted to 19-35, one moss frosting, cloud stacks, planks |
| pacing | 3 | 5 | 5 | 4.5 | 5.5 | 5.5 | **6** | quiet rooms, a save at the ambush; the save doesn't catch a runner, the path's middle is one level |

**Overall: 6.5 / 10 against the references** (r1 3.5, r2 4.5, r3 5.5, r4 5.5, r5 6, r6 6).

The area now has the references' shape on paper and, for the first time, frames a person can read. What holds it
under 7 is that the first ten minutes still contain three things a first-time player would hit and not forgive or
not find:
- a point-blank spawn;
- a runback through a save they crossed;
- a verb nobody told them about.

None of these is tuning to bots, and all three are small. Fix them, then put it in Matt's hands. The rest of the list
is what moves it from "works" to "a place".

**What improved since round 6:**
- the spread: quiet rooms, long composed thorn runs, one real peak;
- the value: 12-49% near-black, the hub's clearing 8.8 → 34.8;
- leg 3: a safe mid rest, a passable lampwing, a save at the top;
- the Grove's arena: the pit, a fit camera, lamps in fling reach, pods;
- five fling lines, proven with the lamps lit;
- rewards: majors 23, hidden share 0.34;
- the furniture families: no pedestals, 18 bramble families;
- the kin is someone else; headless playwright draws.

**What didn't:**
- both ambushes spawn on her;
- the hollow's save only counts if she stops;
- the fling is never taught;
- the hub is empty, not a place, with no moon;
- one peak, and the quiet is on the branches;
- the solids lifted out of silhouette;
- one moss everywhere;
- cloud stacks, pillows, planks, the slab trunk;
- glints with nothing to buy;
- still no human run.

## Round 8: the ten fixes, ranked by impact

Gate: Matt's run from the hatch to the Grove, after #1, #2 and #4 at least.
1. **[level] Teach the fling:** a required, safe first fling in the first three minutes (the hatch's descent or
   before the trunk), a one-time "hold V" prompt when a flame is first in reach, every optional line's prize in frame
   from its lamp, `wick-gap-2` moved onto the down-left arc (about 3,120 × 1,560).
2. **[level] Ambushes arrive:** shut the gates on frame 0, spawn 30-45 frames later from ≥ 400 px (a burrow mouth in
   the hollow's west wall, the pit's east floor and west ramp), harmless while arriving (≥ 40 frames); a test that
   enters each trigger and stands 60 frames unhit.
3. **[render] Ground as silhouette:** mass interiors ≤ 12 luma deeper than 96 px from an edge, sub-masses and knuckles
   only in the outer band, no diagonal streaks; `look:check` gains "solid mean ≤ 12" and "air ≥ 4× solid".
4. **[level] A patch she walks through is her re-form point:** no heal or rest, standing still rests; tested on
   `p-hollow` with a fade in the ambush.
5. **[level] The hub as a place:** a camera zone that puts the clearing's floor at 75-80% of the frame with the moon
   above, one warm light, the kin staged in three places (clearing, bower, way out), and the trade put to Matt as one
   yes or no.
6. **[render] Moss by look:** frost, fungus, amber lichen, lime clumps; coverage 40-85% with breaks, stippled clumps,
   thickness 10-60 px; a thin lit lip carries the walkable read.
7. **[level] A second peak, a quiet path room:** the tunnel's west hall and pit to ≥ 7 a screen (carriers, a hawker,
   the pod garden, a gated wave), the fork's approach to ≤ 0.8, the burrow a place or gone; the check adds two peaks
   and no three path rooms within ±20%.
8. **[render] Objects out, gates that move:** the shaft's mid plane as root curtains and ribs (no cloud stacks),
   uneven chimney lobes, root-mat arena gates that grow and withdraw over 40 frames, the Grovemother's trunk with
   plates and a lit ridge, arch and burl mounts as roots, the limbs' ends broken.
9. **[level] Climb fairness for a relaxed hand:** the leg-3b lampwing dives once a pass, delay 16 in the fairness
   test with every required climb passing, `thorn-w2` 160 tall.
10. **[render] The den and the long runs:** bramble beds with a 48-96 px silhouette and warm glints on runs ≥ 640,
    the den's back as shapes (burrow mouths, root curtains, shells) instead of fog.
