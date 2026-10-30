# The Canopy, review round 4 (2026-10-30)

Reviewer brief: judge the Canopy v4 (`?world=canopy&fresh`, `tools/levels/canopy.ts`, 27 rooms `cn-*`, HEAD 71a38cf)
against the first areas of Hollow Knight, Ori and Nine Sols, and say what changed since round 3 (`canopy-r3.md`).

Sources:
- the docs: `first-area.md` (the v4 section and the builders' own weak list), `memory/canopy.md`,
  `memory/canopy-render.md`, `art-direction.md` and the reference README;
- a fresh wide shot of every stop in every room with pickups (16:9, 117 frames; the way out again at 21:9), and the
  mean luma of each room's shots;
- the map re-exported (the export reverted afterwards) and `metrics.ts` run against the three references;
- the bot reports in `playtest-reports/canopy-r4/` and `canopy-r4-fork/`, and `canopy-map.ts` for the rooms named
  below;
- probes in a `-s=review4` session: the Grove's wave fired, and the den forced into phase 3 to see the snuffed lamp;
- **a tolerance probe of the four set-piece climbs in the real sim.** This is the builder's `zig` macro with a human
  reaction delay added (0, 4 and 8 frames of slide before each kick), from three or four start x, each face first.

The v3 video (`canopy-video-v3/`) was not used, because the layout has changed since. All coordinates are room-local
px, as in the generator.

## The short version

v4 did almost everything round 3 asked, on paper.
- **The climbs.** The four climbs have thorns on alternate faces, and two of them have plugs to cut.
- **The ending.** The moons are on screen, and the way out has a mountain, a valley of false lights and a woven-root
  door.
- **The Grove.** The pit is a gated wave, and the Grovemother stands on four arching roots.
- **The den.** The escape shelves are drawn, and phase 3 puts out a lamp.
- **Secrets and the map.** The moonDrops are shards now, the rotten walls show a lit crack, the hub's secret needs
  the claws, and the west moth-stone sits beside the claws.

On screen, three of the frames would sit next to Ori: the way out from its clifftop, the Grove pit and the crown.

It still fails, and this round it fails worse in play than in pictures:
- **The set pieces are traps, not challenges.** I gave each climb a human reaction delay and several start points:
  - the well passes only when she jumps at the west face first and kicks within about 4 frames of each touch;
  - the Elder passes in 1 of 12 variants;
  - the way out passes in 1 of 16.

  The thorn strips are laid on a frame-perfect line with about 20 px of margin. The well's chimney is also **the only
  way on after the claws**, and a thorn there can send her 1,700 px down to the well's bottom. So the hardest and
  least forgiving climb in the area is the first thing the new ability is asked to do. That is why all three bots
  stop in the west.
- **The west has no pull and two holes.**
  - Without the claws the player can drop into the rot branch and get lost.
  - Once she has them, the Elder's notch at the well's foot pulls her in and the chimney throws her out.
  - The fork's claw face, the next step after the hub, stands behind a thorn bed with nothing lit at its top.
- **The boxes have changed shape, not gone.**
  - The tapers are now fluted cones, pleated fans and theatre curtains, the same three props in every room.
  - The big masses are still black rounded rectangles: the well's walls, the way out's two blocks, the hub's high
    block, the gap's roost.
  - The five looks are two families on screen, and the west got darker (mean luma 12).

Round 3's line holds a fourth time. The structure is close to the references, and the climbs now exist. But a
player cannot get through them, and still cannot tell where to go.

What works, and should be kept:
- **The way out** (`cn-out` top, valley and door, at 16:9 and 21:9): the moon behind the snow peak, the valley's
  lamps 1,600 px below, the woven door on its ledge. It is the area's best frame and its first real promise of the
  road.
- **The Grove pit as a wave.** Landing in it (trigger 1536-3200 × 1472) wakes two juveniles and a dangler, and
  `pit-gate` (3712, 1216) stays shut until every `sets` creature is dead. I verified both. With the Grovemother on
  four arching roots and the two lamps and their swarms, this is the area's peak in both look and play.
- **The Spire's neck** (`cn-spire`, out from under the nook's lip, kicks across E 652, W 429, E 207). It is short,
  starts from a rest, sits in the hawker's orbit and works from x 1300-1340. It is the right size for a set piece,
  and the model for the others.
- **Drawn gates and shelves.** The woven-root arches (den, Grove, door) and every `oneWay` now have a painter, with
  a test behind them. The den's escape shelves are visible.
- **The rot read.** The giant's teaching wall (`cn-trunk` 1472 × 512-704) shows a lit diagonal crack and chips. It is
  readable as "this breaks".
- **The numbers.**
  - 0.48 enemies a screen and 54% empty screens, against the references' 63-66%;
  - 58 minors, down from 82;
  - 5 saves, the bower's among them;
  - three moon shards to a light.

## Since round 3, fix by fix

| r3 # | fix | v4 | status |
|---|---|---|---|
| 1 | four climbs as set pieces | well legs 2-3 (five strips), Elder (six strips and a plug), Spire (west strip, a 384 neck), way out (plug and three strips); bots taught `zig` | **done as data, failed as design.** They are frame-tight and phase-locked, and the well's chimney gates the critical path (#1). Only the Spire's neck is fair. |
| 2 | broken moments: drawn `oneWays`, warm mint, arch gates | `wood-claims.ts` and `paintShelves` with a test; warm back dark grey-green; `rootGate` arches | **done.** New: a faint square checker in the deep back (fork entry, Grove pit lower left) and a ruler-straight back seam across the fork's entry (#6). |
| 3 | masses as wood | `mergeRuns`, `paintTaper` (root flares and bundles), root mats, lift and plates, `brokenTop`, `rootBase` | **half.** The Grovemother is fixed. The tapers became fluted cones and curtains, the big masses are still rounded slabs, and the gap's roost is unchanged (#3). |
| 4 | the vista | `WoodVista`: range, snow, near ridge, valley lights | **done.** It is plain: a single cone peak, floating snow slivers, and a valley that is a flat fog band (#7). |
| 5 | moons, zoom zone, valley lures, crown stop | moons in view px, zone 0.85, three valley lamps, crown on `c1` | **done.** Hub, fork and way out all show the moon. |
| 6 | the boss arena: shelves, hump, snuffed lamp, sleeping reveal | solid shelves, `snuffs` | **half.** No hump and no reveal. The snuff changes the picture by 1 luma point (#5). |
| 7 | a peak and the path's cast | gated wave, danglers on the trunk's tier 2, ants in the tunnel, two hawkers cut | **done.** The wave is two more commons on a flat floor (#5). |
| 8 | wayfinding and saves | `stone-west` at the claws, glide shelf hidden, bank hollow behind the claws, save at the bower | **done, with a new carrot.** The bank hoard (3620-3760 × 840) is in plain view from the landing: the skilled bot made six failed jumps at it in its first minute. The real wayfinding problem was elsewhere (#2). |
| 9 | five places, rotten wood, value lift | five looks (`lookOf`), rot crack and dust, lift toward `#0f2a36` | **half.** On screen there are two families plus the den. The pockets get the nest look by rule. The west is darker than in r3 (#4). |
| 10 | edges and leftovers | `roof: true`, shards, the fork's panel as a wall, hoards cut, metrics, the fork run | **done.** |

## The 10 most important problems, ranked

### 1. The set-piece climbs are frame-perfect, and the first one gates the path
**What.**
- **The probe.** The builder's `zig` macro kicks on the first frame of each wall touch. I added a reaction delay (the
  frames she slides before the kick) and varied the start x. Room-local starts; "passes" = reaches the next rest.

  | climb | variants | pass | what passes |
  |---|---|---|---|
  | `cn-well` legs 2-3, from the mouth's floor (y 3200) | W or E first × x 1700 / 1800 / 1900 × delay 0 / 4 / 8 / 14 | 3 of 24 | W first only. x 1800 with delay ≤ 4 frames; x 1700 with delay 0. Delay 8 (133 ms) hits `thorn-w2a` at (1620, 2573). Every E-first try hits a strip within one kick. |
  | `cn-elder` chimney, from the floor (2496) | W/E × x 860 / 960 / 1060 × delay 0 / 4 / 8 × 0-1 kicks up one face first | 1 of 36 | W first, x 960, delay 0 only. Every E-first try hits `thorn-e1` before the first touch. |
  | `cn-out` chimney with up cuts, from 1344 | W/E × x 950-1100 × delay 0 / 2 / 4 / 8 | 1 of 32 | E first, x 950, delay 0 only (top 274). Others hit `thorn-o1` (1242, 830-1000) or `thorn-o2` (925, 563). |
  | `cn-spire` neck, out from under the nook's lip (896) | builder macros × x 1300-1480 | 2 of 20 | x 1300-1340, `zigR0o`. Short (3 kicks), from a rest, and a miss costs one short drop. |

- **Why it is so tight.** `first-area.md` says it: a kick across rises about 222 px and a kick up one face about 235,
  so "the strips must pick the phase". Each strip sits in the gap between two touch zones with about 20 px margins.
  A late kick slides her 30-60 px lower, which puts the next touch on the strip. A human cannot see the phase. They
  see dark brambles 64 px wide on a dark face (`cn-well` chimney shot: the strips are thin dark twigs with dim red
  tips on near-black wood, behind a forest of blue fibre posts that run through the chimney itself).
- **The return.** After a thorn hit she reforms on her last safe ground. A climber who goes over leg 1's top straight
  into the chimney never stood on the mouth's floor, so the return is the well's bottom, about 1,700 px down (the
  builder's own finding). That makes 3,700 px of climbing for each try at a 4-frame window.
- **It gates the path.** The well's top (the ambush hollow, then the limbs) is the only way the clawed player gets
  back to the hub and on to the fork. There is no other exit up. The bots tell the rest:
  - **casual:** claws at 2:52, 23 fades;
  - **skilled:** claws at 2:54, then 18 minutes of well → Elder → well → rot;
  - **average:** never got the claws (#2).

**Why it matters.**
- **HK.** The Mantis Claw's first climbs are clean alternating walls. The thorn-lined set pieces come later, and HK's
  slow wall slide makes a late kick cost a little height, not a hit.
- **Ori.** The first wall-jump test is a trivial climb out of the Hollow. The Spirit Caverns' set piece comes after
  several easy ones, and Ori's thorn faces have wide margins and a save cell before them.
- **The pattern.** A first ability's first test is a celebration, and the precision test comes once the verb is in
  the hands.
- **Our own record.** `matt-playtest-area1.md`: the lamp catch "annoying" was this same kind of timing gate. And
  `strengths-feel-weakness-levels.md`: the movement is our best asset. These climbs punish the movement instead of
  showing it.

**Fix.**
- **The well, on the path: a first exam, not a final.**
  - Keep leg 1 clean. Move the chimney east so its foot is not over leg 1's top: chimney 1920-2304, its west face
    starting at 2944, the mouth's floor 1536-1920 a real rest under a 128 px lip. Leg 1 must then end standing on the
    mouth's floor, and that floor becomes her safe ground.
  - Leg 2 (mouth → landing) gets one strip, on the east face at 2560-2700: the player sees it from the floor, and
    one change of wall gets past it.
  - Leg 3 (landing → top) keeps two alternating strips. Lay them with ≥ 64 px margins on the touch zones measured
    at delays 0, 6 and 12 frames, and from 3 start x 64 px apart.
  - The landing (2240) is a reform point.
- **The Elder (optional, the branch's climax).** It can be the hardest climb in the area, but it must be a skill
  test, not a phase lock:
  - Keep the six strips, but shorten each to ≤ 128 px.
  - Make the east face's first 300 px clean, so the first touch can be either face.
  - Accept delays up to 8 frames.
  - Put a rest (384 tall, carved into the wall) every two strips: the existing one at 1472-1856, and one more at
    about 900.
- **The way out.** Put a reform point on the chimney's floor (1344) and one under the plug, so a hit costs one leg,
  not the climb. Pass it at delays 0-8 from x 950-1150.
- **The engine side** (sim tuning, `tuning.ts`). Give a fresh wall touch a short grip: about 10 frames with no slide
  before the slide starts, as HK's claw does. A late kick then loses no height, and the strips stop depending on
  reaction time. Re-measure the 222/235 numbers after.
- **A proof that means something.** Add `canopy-climbs.test.ts`: every set piece must pass with delays 0, 6 and 10
  frames from three start x, and fail (hit a strip) when she uses one face only. The explorer's frame-perfect `zig`
  proves the climb is possible. This proves a person can do it.

### 2. Wayfinding: the west swallows the player, and the next step east is invisible
**What.**
- **Before the claws, the rot branch is open.** `rot-panel` (`cn-trunk` 1088-1280 × 1024, a floor panel) drops into
  the rot hall without the claws. The average bot went down it at about 2:20 and spent 12 minutes in the crawl
  (1173-1969 × 80-504, three "lost" stretches) without ever finding the claws. Round 3 named this. v4 moved the map
  stone but left the branch open.
- **The rot hall is a gauntlet in a branch corridor.** `cn-rot` 1088-1472 is a 384 px corridor. Roof thorns at
  1408-1792 hang at y 1088, and a full jump from the floor touches them. Floor thorns follow at 1984-2112, with
  `burr-rot` (1856) pacing between. The bots took 51-54 hits there, and 13-14 fades at (1996, 1472). A human with
  jump-height control survives it, but it is the worst-placed pinch in the area: a lethal corridor on a side path,
  reached by a floor panel.
- **The trunk's tier 2** (`cn-trunk` 448-1280 × 768-1024, 256 tall): floor thorns at 768-960 under roof thorns at
  960-1088. `thorn-t2` took 7-28 hits per bot.
- **After the claws, the Elder pulls.**
  - The Elder's notch (`cn-well` 128-1024 × 4672-4928, its plug at x 64) is 300 px from the claws.
  - The moth-stone beside the claws now draws the rot branch on the map.
  - The well's chimney throws her down (#1).

  So the clawed player has three unknowns in the west and none of them is the way on. The skilled bot cycled well →
  Elder → well → rot 7 times.
- **The fork's claw face reads as "no".** `cn-fork`'s only way on is the face at x 2816 (1344 → 576). Its foot is a
  thorn bed (2560-2816 × 1280, `thorn-pit`), with a juvenile (2350) in front. The face is a plain black wall with
  no rim, no moss and no light, and the top shows sky with nothing in it. In 25 min from the fork, no bot climbed it.
  - **casual:** 5 min on the knoll and stairs;
  - **average and skilled:** went back west to the hub and the trunk.

  A player sees thorns before a dark wall. Every game teaches that as "not this way".
- **The hub's new carrot.** The bank hoard (`bank-great` 3620, `bank-1` / `bank-2` 3720-3760 at y 840) shows from the
  landing. The skilled bot jumped at it six times in its first minute ("fell short", x 3712). Round 3's glide-shelf
  lesson applies again: a visible reward that is almost reachable reads as a jump the player is failing.

**Why it matters.**
- README fact 7: the first ability doubles the world. Here it opens a loop back into the west's unknowns.
- HK's pull is light and silhouette:
  - Dirtmouth's well is a lit hole;
  - the Crossroads' unexplored exits glow;
  - the next area's colour bleeds through the transition.
- Ori uses the Spirit Tree's light on the horizon and Sein's lines.
- The Canopy has the parts (lamps, moths, the moon) and points none of them at the way on.

**Fix** (level, with one render line).
- **Close the rot branch until the claws.** Turn `rot-panel` into a rotten wall high on tier 3's west face (claws
  first), and make the rot hall's well door the branch's main entrance. A no-claws player in the trunk then sees one
  way: tier 3, to the well.
- **The rot hall's roof strip.** Raise it to y 1024 (out of a full jump's reach), or cut it. Keep the floor strip and
  the burrback: one problem at a time.
- **The trunk's tier 2.** Cut the roof strip at 960-1088 × 768. The floor strip alone is the lesson.
- **The Elder's notch.** Make `elder-plug` open only from the Elder side (a `shortcut`, opens `e`), so the branch's
  end opens it back to the well. At the claws she sees one way: up.
- **The fork's face.**
  - Move `thorn-pit` off the face's foot (to 2240-2432) and leave the last 256 px before the face clean.
  - Give the face a lit claw rim and three moss tufts as holds every 256 px. That is render work: a `climb` mark that
    paints a cool rim and the tufts.
  - Hang a Grove lamp's spill over the top (a lure at about 3000 × 420 in `cn-fork`, or the Grove's `wick-a` light
    reaching through the east exit), so the face points at a warm light and its moths.
  - Put `juv-e` on the knoll instead (2000, 768).
- **The hub's hoard.** Put `bank-*` behind a leaf cover seen only from the claw face under the clump, as was done
  for the fork's shelf.

### 3. The boxes changed shape: cones, curtains and cabinets
**What.** The taper painter fixed the stacked tiers, and its output now repeats as three props:
- **Fluted cones** ("tents"): every `burl()`. Each is a pleated cone with a lit cap: the galleries' stair (1280 ×
  1408), the tunnel hump (2304 × 1856), the nook, the larder, the ledge, the burrow, the hollowroot. Seven rooms show
  the same prop at the same angle.
- **Curtains**: every `hang()` and many roof masses paint as vertical pleats with a heavy rounded hem, a stage drape.
  Seen at the den's east wall over the gate (3000-3300 × 448-1100), the Spire's west (both lower shots), the trunk's
  low hall, the cellar and the tunnel.
- **Organ pipes and fans**: `brokenTop` and root mats paint a row of vertical tubes, as on a cornice. The hub's
  giant's mouth (0-1024 under the high block), the fork's entry roof and the trunk's ceiling show it.
- **Cabinets** are still there:
  - **the well's walls:** either side of the chimney, 400-1000 px black planes with rounded bottom corners (all
    seven well shots);
  - **the way out's two blocks** (0-896 and 1280-1792 × 384-1088): flat tops and plumb faces framing the area's
    last climb (`cn-out` chimney and top shots, at both aspects);
  - **the hub's high block** (0-1024 × 576-1600, hub high shot): a flat-topped cube with a rounded corner;
  - **the gap's roost** (2752-3328 from 0): a rounded black box with a few drips, in the shelf and gap shots.
    Unchanged since round 2.
- **The hub's swing.** The landing's `oneWay` under the east limb paints as a slab hung on four rope-like roots: it
  reads as a hanging planter.

**Why it matters.**
- `art-direction.md`: "nothing tiled, nothing rectangular, no visible repetition."
- A cone in seven rooms is repetition the player names ("the tent again").
- A curtain with a hem is a human object in a world with no human buildings.
- The flat blocks are still the first thing the eye reads in the well and at the ending.

**Fix** (render, `pf-mass.ts` / `paintTaper`).
- **Burls.** Vary the taper by seed:
  - lean ±6°;
  - an asymmetric flare (one side running long into the floor);
  - two or three roots splitting off the body, not a regular pleat;
  - a broken or rounded top, not a cap.

  No two burls in a room may share a silhouette. Pleat spacing is irregular, 40-140 px.
- **Hangs.** A hang is a clump of 3-7 root strands of uneven length and thickness, twisted, with gaps between.
  - Never a continuous pleated sheet, never a hem.
  - The widest strand is at most 40% of the clump's width.
  - Tips taper to points at different heights (±200 px).
- **Big masses.** Apply round 3's silhouette rule to every free face over 600 px, the claw faces included:
  - bulges of 24-48 px every 200-400 px;
  - bark plates crossing the face;
  - one root running diagonally across it;
  - no rounded-rect corners. A corner is a break, a root knuckle or moss.

  Start with the well's two chimney walls, the way out's two blocks, the hub's high block and the roost.
- **The roost.** Paint it as a hanging nest of roots and old leaves, the sky room's way in: ragged, wider at the top,
  showing the gap between its two root solids (2752-2944 and 3136-3328).
- **Check.** Lay the 27 rooms' first shots in one sheet. No prop shape may appear in more than two rooms.

### 4. Five looks in the code, two on the screen, and the west got darker
**What.**
- **What shows.** `lookOf` assigns five looks. On screen they collapse to two families plus the den:
  - **Blue fibre forest** (vertical blue posts in fog): well, Elder, limbs, Spire, bower, attic, sky. The shaft look
    and the canopy look differ by a beam and some leaves; side by side they are one place.
  - **Purple-grey banded wall**: trunk, rot, crawl and webs (heartwood: wavy grain); cellar, galleries, larder, nook,
    hollowroot, ledge and burrow (nest: the same bands plus black holes and pale larva pearls); tunnel. Heartwood's
    grain and the nest's bands are the same value and hue at play distance.
  - **The den**: blue earth bands, shells and scrapes. It is distinct, mostly by its curtain.
- **The pockets get the nest look by rule.** The nook (a moth-stone room off the Spire, in the high band), the
  hollowroot and the ledge (off the way out) all paint as an ants' nest, though no ant lives there. `lookOf` falls
  through to "carriers / ground = nest or den".
- **Value.** Mean luma of each room's wide shots:
  - trunk, rot and crawl 12 (r3: 13-16);
  - cellar 13, galleries 16;
  - the open rooms 25-41.

  The heartwood rooms are darker than in round 3. Most of each frame is near-black mass, and the grain behind reads as
  a flat striped wallpaper.

**Why it matters.**
- Round 3 #4 still stands: a metroidvania is learned by place.
- The west (trunk, rot, crawl, webs) is where the bots and probably people get lost. It is also where every room
  looks the same and is darkest.
- Wayfinding by look is the cheapest wayfinding there is.

**Fix** (render, `lib/interior.ts`).
- **Looks by region, not by rule.** Set `art.look` per room in the generator:
  - heartwood: trunk, rot, crawl, webs;
  - shaft: well, Elder;
  - nest: cellar, galleries, larder only;
  - canopy: limbs, Spire, bower, attic, sky, nook, hollowroot;
  - den: tunnel, burrow, den;
  - the ledge takes the way out's.
- **Two families into five.** Split them by hue as well as pattern:
  - **heartwood** warm: amber-brown grain, sap beads, value about 30;
  - **nest** earthy ochre-grey with lit trails;
  - **shaft** cold white-blue with a single moonbeam, and **no fibre posts inside the chimneys** (they compete with
    the faces she must read);
  - **canopy** green-teal with leaf mats and gaps to the sky;
  - **den** umber.

  Test: the four first shots of trunk, cellar, well and bower, desaturated, must still be told apart by value pattern
  alone.
- **Value.** Lift the heartwood rooms' mean to at least 20: a warmer and lighter back plane, and the mass lift
  (`liftReach`) doubled on the side of the room's key light.

### 5. The peak and the boss are there, but both are flat fights
**What.**
- **The Grove's wave** (verified):
  - Dropping into the pit sets `cn-grove-wave`. Two juveniles appear at 1640 and 3050, and the dangler at (2256, 1352)
    drops into its swing.
  - With `burr-pit-w` and `burr-pit-e` that makes 5 `sets` creatures, plus `wing-a` and `hawk-e` (not counted).
  - The gate holds until all five are dead.

  What it is: four ground walkers and a dangler on one flat floor (1536-3200 × 1600), the floor thorns at
  2560-2752 its only terrain.
  - The juveniles are the weakest kind in the game.
  - The new wave adds no pressure from above and no shape.
  - The gate only shuts the east way. A player who comes over the crown onto the east floor (3264-3840 × 1472) meets a
    shut gate and must drop back into the pit.
- **The den.**
  - The shelves (1024 and 2240 × 1152, w 256) are drawn, as thin planks on one stalk each. They are readable, but
    small for a 4.4× boss.
  - The arena is otherwise one flat floor, 576-2944. There is no hump (the builder: a burrback cannot step) and no
    sleeping reveal.
  - **The snuff.** I forced phase 3 (`p2At` / `p3At` 1). `wick-taproot` goes out, but the frame's mean luma moves from
    26 to 25: nothing on screen says the fight changed. The back stays the same lit earth bands, and the remaining
    lamp `wick-den` is on the balcony, outside the arena.
  - The taproot is still a thin knobbed post, and a theatre curtain hangs over the gate.

**Why it matters.**
- HK's gated fights escalate: each wave adds a kind or a direction (flyers after walkers, a fight on ledges). False Knight's arena reads because each of its attacks
  changes the floor (the falling barrels, the cracked ground).
- A wave of the same walkers is a longer fight, not a peak. A darkness the player cannot see is not a phase.

**Fix.**
- **[level] The wave as two beats.**
  - Beat 1: the two burrbacks as now.
  - Beat 2, when both are dead: the two juveniles drop from the Grovemother's arch roots (2100 and 2400 × 1344, not
    from the pit's ends) and the dangler.
  - Add one lampwing that wakes in beat 2 (`wakes`, from `wick-b` at 2800 × 1120), so the second beat has an air
    threat that pulls her off the floor.
  - Add one 192 px root step at the pit's centre (2048-2304 × 1408), shaped by the arch roots, so beat 2 has a high
    point.
  - Count the lampwing in `sets`.
- **[level] The den's shelves.** Widen them to 384, and give each a claw face under it (`claws`). A roll is then
  answered by a cling as well as a jump.
- **[level] The sleeping reveal.** Drop the balcony's lip by 192 and put a 256 px root ledge between it and the floor,
  so she sees the boss asleep for a beat before committing.
- **[render] The snuff must read.** When `wick-taproot` goes out:
  - darken the arena's back by about 40%, from the taproot outward, over 1.5 s;
  - kill the glow worms over 2560-3264;
  - let the boss's red rear and the floor wave become the brightest things on screen.
- **[render] The den's set dressing.**
  - Paint the taproot as a root 160+ px thick plunging through the roof, with a glowing scar where it plants.
  - Replace the gate's curtain with a ragged root clump (#3).

### 6. Seams and patterns in the backs
**What.**
- **A ruler-straight seam.** The fork's entry (wide-1 and wide-2, view y ≈ 220 at 16:9): one horizontal edge across
  the whole frame where the sky meets the dark back plane over the corridor (room x 0-2600 × about 1100).
- **A checker.** A faint square checker (tile-sized squares, alternating values) shows in the deep back:
  - the fork's entry corridor (0-1500 × 1100-1344);
  - the Grove pit's lower left (1536-2000 × 1300-1600, pit and east shots).

  It looks like a mask or bake texture showing its tiling.
- **Angular flaps.** The Grove's back behind the lamps paints as large angular dark grey-green polygons, like torn
  paper. Better than r3's mint, still not a material.

**Why it matters.** These are the places where the code shows through, and the Grove is the postcard. A grid behind
the area's signature image is exactly what `art-direction.md` forbids.

**Fix** (render).
- **The seam.** Feather the back mask's top edge over 120 px, and break it with the canopy's leaf mats where it meets
  open sky.
- **The checker.** Find its source. Suspects: the `interiorDeep` mask's cell size, or a bake at the wrong resolution.
  Add a shot test: no 64-px periodicity in the back layer's luma, measured by FFT over the fork's entry.
- **The Grove's flaps.** Replace them with the canopy look's leaf mats and dark gaps.

### 7. The vista is right and plain
**What.**
- **What works.** From the clifftop, at 16:9 and 21:9, the moon sits behind a snow peak, and the valley's lamp
  clusters lie 1,600 px below.
- **The range.** It is one symmetrical cone with a smaller flank on each side, flat-shaded, with one polygon of snow.
- **Floating slivers.** Pale flat quadrilaterals hang in mid-air left and right of the peak (21:9 top shot at view
  about (1080, 290), door shot at about (600, 830)). They read as floating rocks.
- **The valley.** A band of fog with yellow dots on it: no valley walls, no river, no trees standing in it, no
  sense of the drop. The "near ridge with firs" is a flat dark strip of tiny spikes.
- **The far lamps.** Their moths are specks, so the false lights read as a town at night.

**Why it matters.** The way out is now the best frame in the area, and the one the player carries out. Ori's
Spirit Tree and HK's view over the Howling Cliffs work because the far shapes are as carefully drawn as the near
ones.

**Fix** (render, `lantern/vista.ts`).
- **The range.** Three or four peaks of different heights, the main one off-centre with a ridge line running down to
  the near hills. Shade each by a light side under the moon and a dark side, and cut the snow along the ridges.
- **The slivers.** Delete any snow piece not attached to a peak polygon.
- **The valley.**
  - Two dark valley walls converging toward the mountain, and a river of mist.
  - Lamp clusters sitting on hills at three depths, nearer ones larger with visible swarms.
  - One nearer lamp tree at 60% scale halfway down the drop, so the 1,600 px reads as depth.

### 8. Thorns that do not read
**What.**
- **Small and dark.** The climbs' thorns (`thornsUp`, 28 px wide) paint as thin dark twigs with dim red or violet
  dots, on near-black faces. In the well's chimney shot they are hard to find at 1:1, and they are smaller than the
  glow fungi beside them.
- **Floor thorns** (trunk tier 2, rot hall, fork, Grove) are low brambles of the same dark value as the floor's moss
  rim.
- **Thorns vs. danglers.** The thorns and the danglers' silhouettes are near-identical dark spiky shapes.

**Why it matters.**
- With 37 hazard runs (the references have 0-6), thorns are now the area's main obstacle, and the climbs are built on
  them.
- HK's thorns (Greenpath) and Ori's spikes are the highest-contrast shapes on their faces: you plan a climb by
  looking at them.

**Fix** (render).
- **Thorns:** a hazard silhouette no prop shares, pale bone-white or rust-red barbs 24-40 px long, pointing out, on a
  darker bramble mat. Light them with a faint warm rim, so they read against any back.
- **Faces:** on a claw face, the strip's 64 px either side carries no glow fungus, so the hazard is the brightest
  thing on that wall.

### 9. Pacing: the area's difficulty peak sits at minute 3
**What.** The order of challenges on the critical path today:
1. trunk tier 2's thorn corridor (minute 1-2);
2. the claws (about 2:50);
3. **the well's chimney** (the strictest timing in the area);
4. the limbs' edge jump;
5. the hub, the fork's face, the Grove's wave, the Spire's neck, the gap glide, the tunnel pit and the boss;
6. the way out's chimney.

The hardest climb is step 3. Everything after it is easier, except the way out. There are 5 saves, but between the
well's bottom (`p-well` 1900 × 4928) and the hub there is none, and the chimney's thorns send her past it anyway.

**Why it matters.**
- README facts 9-10: a quiet opening, a set-piece first fight, saves early, and a rising curve to the boss.
- The references build their strictest platforming toward an area's end or into optional rooms. None puts it in
  the first five minutes of a new ability, on the only way on.

**Fix** (level).
- Order the climbs by strictness along the path:
  - the well: the teach (#1);
  - the fork's face: clean, the reveal;
  - the Grovemother: clean;
  - the Spire's neck: the first real set piece;
  - the way out: the final exam.
- The Elder stays the optional hardest.
- Add a save patch on the well's landing (1440 × 2240). It is 384 tall already, and the moon-shard niche makes it a
  place.

### 10. Secrets and density: fine numbers, one lesson
**What.**
- **Counts.**
  - 18 breakables, 31 majors, 58 minors;
  - empty screens 54% (refs 63-66%), the longest empty run 8;
  - 37 hazard runs: the climbs' strips are counted as busy cells.
- **The teaching wall** reads now. It is still a 64 px post between floor and beam, so it reads as a cracked post
  rather than a wall of the giant's heartwood.
- **Shard placement.** The three moon shards are good placements: the well's niche, the Elder's top, the larder. Two
  of the three sit behind the area's two strictest climbs, so most players will see one shard in the area.
- **Minors** are still 6-10× the references.

**Fix.**
- **[render]** Paint `giant-wall` as a section of the giant's split heartwood, 192 px wide around its 64 px collision:
  the crack, the grain bending around it, sap at the split.
- **[level]** Cut minors to about 30. Each hoard keeps one glint pile and one real thing.
- **[level]** Move one empty-screen killer: the climbs' thorn strips need not all be strips (#1 cuts about 8).

## Smaller notes
- **The bots.** They follow the generator's assumptions (`wayOn`, `zigLine`), so their failure in the west is
  evidence, not the bar. Two things they found are plainly real for people too: the chimney's tolerance and the fork
  face's thorns. Round 5 should get one human (Matt) run to the Grove before more bot tuning.
- **The free double jump** on a placed player is still zeroed by the harness (`memory/canopy.md`).
- **The ambush lampwing** is low enough to see her now. It fights at the hollow's floor, not on a face: good.
- **21:9** (the way out): the vista and the frame hold, with nothing cut.
- **The heartwood grain** reads as cartoon plank stripes at 16:9: the waves are too regular in period and amplitude.

## Scores (1-10, against the HK / Ori / Nine Sols first areas = 9-10)

| dimension | r1 | r2 | r3 | **r4** | one line |
|---|---|---|---|---|---|
| layout | 3 | 6 | 6.5 | **6.5** | loops, branches and a gated peak; the rot branch still opens without the claws, and the one way on after the claws is the area's strictest climb |
| density | 4 | 5 | 6 | **6.5** | a real peak at the Grove (5 to clear, about 2.5 a screen) and 54% empty screens; minors still 6-10× |
| combat | 3 | 4 | 5 | **5.5** | a gated wave and drawn escape shelves; the wave is two more commons on a flat floor, and phase 3's darkness doesn't show |
| traversal | - | - | 4 | **4.5** | set pieces exist and the Spire's neck is good; the well, the Elder and the way out pass in 1-3 of 12-36 human-like tries |
| secrets | 2 | 5 | 6 | **6.5** | the hub's secret behind the claws, the teaching wall reads, shards; the bank hoard teases at the landing, and two shards sit behind the strictest climbs |
| readability / look | 5 | 4 | 5 | **6** | the vista, moons, gates, the Grovemother on roots; cones, curtains and cabinets in every room, two interior families, the west darker, a checker in the backs, thorns that don't read |
| pacing | 3 | 5 | 5 | **4.5** | a save at the bower and an ending that shows the road; the difficulty peak sits at minute 3, on the critical path |

**Overall: 5.5 / 10 against the references** (r1: 3.5, r2: 4.5, r3: 5.5).

The look and the content went up. The play on the critical path went down: in r3 a person could at least climb the
well. It nets out flat.

**What improved since round 3:**
- the ending is a real frame;
- the moons are on screen;
- the Grove is a gated peak;
- the gates and shelves are drawn;
- the rotten wood reads;
- the climbs exist;
- the tapers are no longer stacked tables.

**What didn't:**
- the climbs are traps;
- the west still swallows the player;
- the next step east is invisible;
- the masses are still slabs, now joined by cones and curtains;
- the places are still two;
- the boss's phase 3 doesn't show.

Round 5 should not add rooms or set pieces. It should:
1. make the four climbs fair and order them by strictness;
2. point the player east after the claws;
3. break the three repeated props and the big slabs.

## Round 5: the ten fixes, ranked by impact

Each is one builder pass. The coordinates are in the problems above.
1. **[level] Fair climbs (#1).**
   - The well's chimney moved east off leg 1's top, the mouth's floor a rest: one strip on leg 2, two on leg 3, with
     ≥ 64 px margins at kick delays 0-12 frames and three start x.
   - The Elder's strips ≤ 128 px, either face first, and a second rest at about 900.
   - Reform points at the way out's chimney floor and under its plug.
   - A wall-touch grip of about 10 frames in `tuning.ts`.
   - A `canopy-climbs` test that passes at delays 0 / 6 / 10 and fails on one face.
2. **[level] The way on after the claws (#2).**
   - The fork's face: `thorn-pit` moved to 2240-2432, the last 256 px clean, `juv-e` onto the knoll, a lamp's spill
     over the top (about 3000 × 420).
   - `elder-plug` opens only from the Elder (a shortcut).
   - The bank hoard under a cover.
3. **[level] Close the west until the claws (#2).**
   - `rot-panel` becomes a rotten wall on tier 3's west face (claws first).
   - The rot hall's roof strip raised to 1024 or cut.
   - The trunk tier 2's roof strip cut.
4. **[render] Break the repeated props (#3).**
   - Burls with seeded lean, an asymmetric flare and split roots: no shared silhouette within a room.
   - Hangs as 3-7 uneven twisted strands with no hem.
   - A contact sheet of the 27 rooms with no prop in more than two.
5. **[render] The last slabs (#3).** Silhouette, plates and a crossing root on every free face over 600 px, no
   rounded-rect corners: the well's chimney walls, the way out's two blocks, the hub's high block, and the gap's roost
   as a ragged root nest.
6. **[render] Thorns that read (#8).** A pale or rust barbed silhouette no prop shares, a warm rim, and no fungus
   within 64 px of a strip on a claw face.
7. **[render] Looks by region and value (#4).**
   - `art.look` set per room in the generator (the nook, hollowroot and ledge out of the nest).
   - Five hues: heartwood amber, nest ochre, shaft cold white with no fibre posts in chimneys, canopy green-teal,
     den umber.
   - The heartwood rooms' mean luma ≥ 20.
8. **[level] The peak and the boss as beats (#5).**
   - The Grove wave in two beats: the juveniles drop from the arch roots, a lampwing wakes in beat 2, a 192 px root
     step at the pit's centre.
   - The den's shelves 384 wide with claw faces under them, and a lower balcony lip with a ledge for the sleeping
     reveal.
9. **[render] The snuff and the backs (#5, #6).**
   - Phase 3 darkens the arena about 40% from the taproot outward, the boss's red the brightest thing.
   - The taproot as a thick plunging root.
   - The fork's straight back seam feathered.
   - The checker in the deep back found and removed, with an FFT shot test.
   - The Grove's angular flaps replaced with leaf mats.
10. **[render] The vista's far shapes (#7).**
    - Three or four peaks with an off-centre main ridge and shaded faces.
    - No floating snow slivers.
    - Valley walls converging on the mountain, lamp clusters at three depths, and a half-scale lamp tree on the
      drop.

    Then a person plays from the hatch to the Grove, and that run is the next review's evidence.
