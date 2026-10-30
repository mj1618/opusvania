# The Canopy: a first area built to the reference numbers (v5, 2026-10-30)

The question: the test grove is dense and fun at 4 screens; does that scale to a whole first area? The method: map the
reference games' first areas to scale (`docs/design/reference-levels/`), take their numbers as targets, build to
them, then measure the build with the same tool and draw it at the same scale. Open it: `?world=canopy&fresh`.

v1 (six huge boxes of sky with logs, every room on the road) scored 3.5/10 in review round 1
(`reviews/canopy-r1.md`). v2 is the answer to that review, built from `canopy-v2-brief.md`: **mass with rooms carved
out**, 24 rooms of 1-5 screens, 14 of them on the critical path.

## What the references say a first area is (README there, with sources)
- 30-60 min, 80-330 screens. Enemies 0.2-0.5 a screen on average, but in peaks: 40-60% of rooms have none, the
  densest reach the grove's density.
- 20-36 secrets near the route, mostly breakable walls and hidden rooms; every dead end pays a major.
- The first ability far and low, used at once, doubling the world; locks shown long before keys; a quiet hub.
- Their maps are black mass with beige carved into it (35-50% solid); 25-77% of rooms on the critical path.

## The build: v3, 27 rooms, 83 screens (tools/levels/canopy.ts)
Every room starts solid and its caves are carved; what is left becomes `root` (or the deep's `ground`) masses the
wood kit paints as bulk. v3 answers review round 2 (`reviews/canopy-r2.md`):
- **Rooms at least 2560 x 1440** (21:9 plus headroom; the generator throws otherwise), packed in bands that share
  edges, so the map has no holes between rooms (`PLACE`).
- **Bitten caves** (`cave()`): the top corners cut, the roof raised in irregular steps, the walls stepped back;
  `hole()` for what a mechanic needs straight (claw faces, corridors). Pillars and humps are tapered `burl()`s (two
  large steps where the reach allows), hanging clumps `hang()`.
- **Two branches of ~10 screens**: west, rot > crawl (a low tunnel winding down and back) > webs (the weaver's orb web
  over its lamp) > the Elder's room (a chimney climb to the moonDrop; its plug opens into the well); east, cellar
  (ants, a trapdoor that opens from below) > galleries (the ants' nest, a burl stair) > larder (the moonDrop behind a
  claw face). The tunnel's shortcut (opens from the tunnel) closes the deep into the cellar and the fork.
- **Every climb has a twist**, built as legs: each leg goes up one clean face to a rest carved into the other wall,
  thorns on the face it must not use (the well: east to the giant's mouth, west to a landing, east to the hollow;
  the Spire: east to the nook's mouth, then the west face under a hawker on its lamp's rhythm; the Elder's chimney;
  the kin: in from a limb over thorns). The limbs' gap is at the jump's edge (384 across, 192 up) over thorns.
- **The glide on the path after the gap**: the tunnel's thorn pit (1120 px from the hump, only the glide), the way
  out's door on a ledge 1344 px across the valley (no claws on its face); a glide-only shelf in the fork's sky.
- **Secrets that teach and hold**: the giant's rotten wall is the only way on from its first hall (minute two:
  the wood breaks); rot's two walls fill floor to roof; the hub's, the Grove's and the bower's panels became walls;
  `finish()` throws if a rotten wall has air above or below it (or a panel air beside it).
- **The hub reads west**: she lands east of its middle; the root floor steps down west into the giant's mouth, lit
  by a lamp with its moths under the high block. All three human-like bots now go west first (v2: none did).
- **The den** is 2688 wide (wall to wall at 21:9), two escape ledges 192 up, the taproot by the gate, the camera
  zone over the whole arena; the old burrback is phased by the sim's default tuning (no spawn field).
- **The way out**: a root chimney to a cliff lip, the valley 1600 px below (thorns), the next area's door on a ledge
  across (a glide), the way back up the door-oak and along its high limb; landmarks `valley` and `mountain` and a low
  moon (art) for render.
- **Thinned**: 82 glints (v2 193), pods only in the Grove, 37 creatures: 57% of screens are empty again.

```
            sky (hawker roost, night eyes)   crown* (glide)
               |                                |
 hatch*     gap* (glide to the far limb, seed 3) -- bower* (kin climb) -- attic (dangler nest, long breath)
   | drop      | drop to hub    \ drop to fork          | (arrival up the Spire)
 limbs* -- hub* (lands east, lit way west) -- fork* (claw face, glide shelf) -- grove* (Grovemother) -- spire* -- nook
   |  \        | seed door        | panel > stairs                                                 \ wall
 well* trunk* (rotten wall,       cellar (ants, trapdoor) -- galleries (ants' nest) -- larder        hollowroot
 | | |   seed 1) | panel            |  shortcut (from the tunnel)
 | | rot (walls) tunnel* (glide over the pit) -- den* (arena) -- out* (cliff, valley, door across)
 | |  | panel     | panel                                          | wall + shaft
 | | crawl        burrow (stone, dark)                             ledge (hoard)
 | |  |
 | webs (orb web) -- elder (moonDrop, chimney; plug into the well)
```

## v4: the level side of review round 3 (`reviews/canopy-r3.md`, 5.5/10)
Bots find bugs; they are not the difficulty bar. v3 had flattened every climb to one clean face so the explorer
could prove it; v4 puts the moves back and teaches the bots (the explorer's `zig` macros, the human bots'
`zigLine`), laying every thorn strip on the kicks' measured line (`tools/levels/canopy-probe.ts`).
- **#1, four climbs as set pieces.**
  - *The well*: leg 1 (the claws' first use, the wide shaft to the giant's mouth) stays clean. Legs 2 and 3 are a
    384 px chimney up from the mouth's floor, thorns on alternate faces (five strips): she must kick across
    (W 2937, E 2714, W 2491, E 2269 onto the landing; then E, E, W, E, W over the top). A lampwing keeps the landing
    (a fight at a rest), and a rotten wall at the landing's back hides a moon shard (only a climber stands there).
  - *The Elder* (the rot branch's climax): the whole 2,368 px chimney with thorns on alternate faces (six strips),
    the rest kept, a heartwood **plug** across the chimney over the passage to the well, cut with up cuts from
    under it while kicking; a moon shard at the top.
  - *The Spire*: thorns on the wide chimney's west face under the lamp (one face is no longer the way), and over
    the nook's passage the chimney narrows to 384: out from under the passage's lip and up by kicks across through
    the hawker's orbit (E 650, W 430, E 210), thorns on alternate faces.
  - *The way out*: the clifftop raised to 384 (a 704 px chimney, a higher glide to the door), the chimney 384 wide,
    a rotten plug across it at 704 cut from a cling under it, thorns on the east face under it and on alternate
    faces above. The door-oak's return limb rose to 48 (out of a jump's reach from the higher lip).
- **#5, moons and the reveal.** Moons in view px (hub 1500,300; fork 1650,380; out 1450,360 r 200). A zoom 0.85
  camera zone over the valley; three lamps down in the valley on the thorns' far side (the false lights, real in
  the sim). The crown's first shot stop on its first limb.
- **#6, the den.** The balcony's lip opens into the arena (v3's bitten corner sealed it: a softlock found on the
  video, now a `place:floor` proof). The escape ledges are solid root shelves (drawn; their undersides clear the
  boss's back). A lamp over the taproot that the old burrback's phase 3 puts out (`snuffs`, new sim field).
  Not done: the 96 px centre hump (a burrback cannot step: it would wall the boss into one half; needs a sim
  step-up first) and the corridor where it is seen asleep (the balcony already shows the whole arena).
- **#7, the peak and the cast.** The Grove pit is a gated wave: landing in the pit wakes two juveniles and a
  dangler (seven creatures), and the way east is a root gate that opens when the last floor creature dies (a
  `sets` flag shared by a wave: new sim rule). Danglers replace the trunk's tier-2 lampwing; an ant trail crosses
  the tunnel; `hawk-kin` and `hawk-far` are gone.
- **#8, wayfinding.** `stone-west` beside the claws at the well's foot (the limbs' niche keeps a great); the fork's
  glide shelf is thick and sheer underneath, its great under a leaf cover; the hub's secret moved into a root clump
  hung over the east limb, its rotten wall high on a claw face (claws first: the giant's wall is the first break);
  a save at the bower's arrival.
- **#10, edges and leftovers.** Enclosed rooms are `roof: true` (the top edge solid but for `n` exits: the tunnel's
  standable top and the flight out over a wall are gone). Moon shards (three a light) replace the two moonDrops:
  the well's niche, the Elder's top, the larder. The fork's cellar panel is now a rotten wall in a root knoll's face.
  Hoards cut to 2-3 glints (minors 82 -> 58). Orchestrator: the giant's seed now sits behind the teaching wall (in a
  chamber over the drop), the well's ambush lampwing hangs low enough to see her.

## v5: the level side of review round 4 (`reviews/canopy-r4.md`, 5.5/10)
Round 4's verdict: the set-piece climbs were traps (the well 3 of 24 human-like tries, the Elder 1 of 36, the way
out 1 of 32), the west swallowed the player and the way east was invisible. v5 makes every required climb fair by a
test and points the clawed player east. Item by item:
- **#1, fair climbs.** The rule now: a thorn strip on one face at a time, and a clean stretch on both faces where she
  changes wall, so the strips decide *which* face, never *when* to press (memory/canopy.md has the numbers). Every
  climb starts from a rest, and a thorn puts her back on that rest.
  - *The test.* `tools/levels/climbs.ts` plays each climb the way a person does: she stands on the rest, jumps at a
    face (or walks to the lip first), and at every wall touch kicks after a reaction delay, up the same face or across
    as the plan says from her height. `tests/unit/canopy-climbs.test.ts`: each passes at delays 0, 6 and 10 frames
    from three start x, with every strip grown 64 px at both ends; one face alone hits a strip; the hit returns her
    to the rest she climbed from. (The explorer's frame-perfect zigs still prove reachability.)
  - *The well* (the teach): the chimney moved east (1920-2304) under the mouth's roof, so leg 1 (clean, the claws'
    first use) ends standing on the mouth's floor. Two root lips carry the chimney's faces down to 128 over that
    floor. Leg 2: one strip on the east face (2592-2740); the west face is clean to the landing, and a jump at the
    east face changes wall at once. The landing dropped to 2432 (leg 2 768 px, leg 3 1280), is a save
    (`p-landing`), keeps no creature (a lampwing kept it from being safe ground), and has a root lip into the
    chimney so the far face is a jump away. Leg 3: west strip over the landing's lip (1856-2048), east strip under
    the hollow (1152-1352): up the east face, across above the west strip, up the west face. The ambush's step moved
    off the chimney's top.
  - *The Elder* (the optional hardest): three legs, a rest at each end (the floor, the rest in the east wall, the
    plug's passage), root lips out of both rests. Strips: the west face of leg 1 (jump at either face; from the west
    one, across at once), the east face above the passage (stay on the west face, cutting the plug). A root carries
    the east face down at the floor cave's mouth.
  - *The way out*: a rest carved into the east block under the plug (floor 1024, a root lip), the plug raised to
    448-512 under the clifftop. Leg 1 is a hop up the east face to the rest; leg 2 jumps at the west face and climbs it
    cutting the plug. The three r4 strips are gone. (It is fair and short now, not the final exam the review wanted.)
  - *The Spire's neck* keeps its east strip (shortened to 235-420) and loses the west one: out from under the nook's
    lip onto the east face, across to the clean west face. A root at the foot passage's mouth carries the east face
    down to 192 over the base. *The kin*: its strip lowered to 1250-1408, off the limb she jumps from.
  - *The grip* (10 frames of no slide on a fresh touch) was not needed: the shapes pass at delay 10.
  - *Sim fix* (src/sim/return.ts): a thorn return walked back along the top's rect into a wall; the well landing's
    floor rect runs under a rotten wall, and she was squeezed up 1,500 px. The walk stops where her box does not fit.
- **#2, the way on after the claws.**
  - The fork's face: `thorn-pit` moved west (2240-2432), the last 384 px before the face clean, `juv-e` onto the
    knoll, a lamp (`wick-fork`, 3000 x 440) over the face's top.
  - The Elder's notch: its rotten plug is now a shortcut that opens only from the Elder's side (`elder-door`, opens
    `w`): at the claws the notch is a shut root door, and the way on is up.
  - The hub's hoard was already under a cover; the bots saw through covers. `tools/playtest/observe.ts` now hides a
    pickup under a cover until she is inside it or its bark is broken (as on screen).
- **#3, the west shut until the claws.** The giant's rot panel (a floor panel where she lands on tier 2) is gone:
  the rot branch's way in is a rotten wall high in tier 3's east face (`rot-door`, its sill 320 over the floor: out of
  a jump), the shaft behind it down to the rot hall. The rot hall's roof strip and tier 2's roof strip are cut (the
  floor strips stay).
- **#8, the peak and the boss as beats.**
  - The Grove's wave in two beats: beat 1 the two burrbacks (their death sets `cn-grove-beat2`); beat 2 two juveniles
    out from under the Grovemother's arch (2120, 2400), the dangler, and a lampwing from `wick-b`'s light (2800 x
    1120), all four on `cn-grove-clear`, the gate's flag. A root step (a one-way, 2560-2816 x 1376, 224 over the
    floor, over the thorn bed) is the pit's high point. v4's juveniles spawned inside the bounce caps (sealed in: the
    gate never opened, a softlock found on the review video); `finish()` now throws on any creature spawned inside a
    solid, cap, gate or bark.
  - The den: the shelves 384 wide at 1088 (256 over the floor, 224 clear underneath: v4's 160 stopped every ram, so
    phase 3 opened only at a wall or the taproot). The sleeping reveal: the balcony steps down onto a root shoulder
    (576-832 at 704) over the arena, the old burrback in view asleep, a root ledge (a one-way at 1024) halfway down.
    No claw face under the shelves: a face to the floor walls the arena.

## Measured (tools/reference/metrics.ts, against the references)

| metric | HK | Ori | Nine Sols | Canopy v2 | Canopy v3 | Canopy v4 | **Canopy v5** |
|---|---|---|---|---|---|---|---|
| rooms | 48 | 22 | 39 | 24 | 27 | 27 | **27** |
| screens | 329 | 88 | 172 | 60 | 83 | 83 | **83** |
| rooms on the critical path | 25% | 77% | 72% | 58% | 52% | 52% (14) | **52%** (14) |
| solid share of the room boxes | 0.35 | 0.5 | (traced) | 0.43 | 0.51 | 0.51 | **0.51** |
| enemies per screen | 0.31 | 0.18 | 0.27 | 0.58 | 0.43 | 0.49 (41: the wave, the tunnel's ants) | **0.48** (40: the wave is 2 + 4, the landing lampwing gone) |
| enemy kinds | 30 | 9 | 11 | 6 | 9 | 9 (the path now meets the dangler too) | **9** |
| majors | 23 | 21 | 15 | 25 | 28 | 31 (three moon shards) | **31** |
| minor pickups | 6 | 10 | 8 | 193 | 82 | 58 | **58** |
| saves | 8 | 2 | 5 | 5 | 4 | 5 (the bower) | **6** (the well's landing) |
| hazard runs | 0 | 6 | 5 | 29 | 25 | 37 (the chimneys' strips) | **25** (one strip a leg-half) |
| screens with nothing in them | 65% | 63% | 66% | 35% | 57% | 53% | **54%** |
| longest run of empty screens | 15 | 6 | 9 | 5 | 8 | 8 | **8** |

Rooms all at least 2560 x 1440; the world's rects share edges (no holes between rooms; one notch under the burrow
opens to the outside). Secrets: the hub's bank wall (heart moth-stone), the giant's rot panel (the rot branch), the
Elder's plug, the limbs' niche, rot's two walls, the crawl's roof niche, the web room's niche, the fork's stone
pocket and its cellar panel (the cellar branch), the galleries' nest wall, the Grove's pit wall, the Spire's nook
and its foot wall (the hollow root), the bower's kin wall, the gap's roost (the sky room), the burrow panel, the way
out's ledge wall. Majors: two moonDrops (the two branch ends), five moth-stones, the keen blade, long breath, night
eyes, quick wings, three seeds, the two abilities.

## Proven (tools/solve/canopy.ts: the explorer in the real sim, ~10 min since r4)
55 claims hold: every exit and find of every room is reachable with the kit stated, and the locks hold without
their key (as v3, plus r4's: the chimneys only by kicks across (the explorer's `zig` macros: no single face is a
ladder), the Elder's and the way out's plugs cut from under them, the hub's clump only with the claws, the giant's
seed only through its wall (`cuts: false`), the Grove's gate only once the pit is clear, the den's balcony reaching
the arena floor and not climbable back (`place:` claims), the giant's tier 3 back up with the claws). r4 counts bark
cuts in the search's keys (`barkHp`), which made it ~5x slower. The world check passes (claws, then glide).

## Played by the human-like bots (r4: playtest-reports/canopy-r4, canopy-r4-fork)
`npm run humanplay -- run --world canopy --skills casual,average,skilled --seeds 1 --no-render --minutes 25`
(give up after 180 s without progress), on 07d894b; then the same from the fork with the claws (`--from cn-fork
--abilities wallJump`, review r3's "start the bots at the fork"):

| bot | rooms | claws at | where it stopped |
|---|---|---|---|
| casual | 6 / 27 | 2:52 | well <-> rot <-> Elder: two looks at the chimney, thorns, back down |
| average | 7 / 27 | - | down the rot panel into the rot branch (crawl, web, Elder) without the claws, lost there |
| skilled | 6 / 27 | 2:54 | as the casual: up leg 1 (the east face) many times, two or three tries at the chimney |
| fork: casual | 1 | (given) | the fork's knoll and stairs for 5 min |
| fork: average | 3 | (given) | fork -> hub -> trunk and back (a creature-pogo out of the giant's hall) |
| fork: skilled | 3 | (given) | fork -> hub -> trunk -> hub |

What the runs found and r4 fixed on the way (two earlier runs): the well's leg 1 had no reachable face once its
west face refused the claws (a root curtain carries the east face down), the west face under the mouth's roof was a
kick-loop (it refuses the claws now), two danglers over tier 2's thorns faded the casual bot 29 times (one, over
clean floor), the rot hall's drop shaft read as a climb to a panel shut from below (its faces refuse the claws),
and the giant's tier 3 was a pocket (its shaft started 448 px over the floor). Not fixed: the bots give the chimney
two or three tries and leave (a thorn there returns them to the well's bottom when they never stood on the mouth's
floor), none climbed the fork's claw face in 20 min, and the rot branch still swallows the no-claws bot.

## What is still weak (for round 5)
- **The bots still stop at a third**: they take the claws and loop the west (well, rot, Elder); the human bot's
  chimney line works in probes but the planner gives it few tries, and a thorn in the chimney can return a climber
  who never stood on the mouth's floor to the well's bottom (1,700 px down): a person would hate that too.
- **One phase only**: a chimney's alternate thorns suit one first face (the well: jump at the west face first). Kicks
  across and kicks up one face rise nearly the same (222 vs 235 px), so the strips must pick the phase.
- **The east half is still unplayed by any bot** (the fork's claw face was never tried in 20 min from the fork).
- **The den** has no centre hump (a burrback cannot step: it would wall the boss in half) and no asleep reveal.
- **The Grove's wave** is untested by a bot; the gate needs every floor creature dead, flyers spared.
