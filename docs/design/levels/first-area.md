# The Canopy: a first area built to the reference numbers (v11, 2026-10-31)

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
    chimney (256 long) so the far face is a jump away. Leg 3: west strip over the landing's lip (1856-2048), east strip under
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
  - The fork's face: `thorn-pit` moved west (2240-2432) into a shallow pit, the last 384 px before the face clean,
    `juv-e` onto the knoll, a lamp (`wick-fork`, 3000 x 440) over the face's top.
  - The Elder's notch: its rotten plug is now a shortcut that opens only from the Elder's side (`elder-door`, opens
    `w`): at the claws the notch is a shut root door, and the way on is up.
  - The hub's hoard was already under a cover; the bots saw through covers. `tools/playtest/observe.ts` now hides a
    pickup under a cover until she is inside it or its bark is broken (as on screen).
- **#3, the west shut until the claws.** The giant's rot panel (a floor panel where she lands on tier 2) is gone:
  the rot branch's way in is a rotten wall high in tier 3's east face (`rot-door`, its sill 320 over the floor: out of
  a jump), the shaft behind it down to the rot hall. The rot hall's roof strip and tier 2's roof strip are cut (the
  floor strips stay).
- **Floor thorns on the way sit in shallow pits** (tier 2, tier 3, the fork, the Grove's pit and east floor: 64 deep).
  Found by the bots: tier 2's flat bed under its 256 px roof was unjumpable (every jump bumped the roof and came down
  in it; the first r5 run faded 6-8 times there and never reached the well). Its roof lifts over the bed now, the bed
  is 128 wide, and a pit reads as a gap to jump, not floor to walk.
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

## v6: the level side of review round 5 (`reviews/canopy-r5.md`, 6/10)
Round 5's verdict: the climbs were fair and flat, the well's bottom still pulled west, and against the four exact
references the screens between fights were bare (half their thorns, one pod, 8 ledges), the hub was a crossing and
the secrets niches. v6 takes the six [level] items; the render items (#4 edges, #6 props, #7 backs, #8 vista) are
the render builder's.
- **#1, the well's bottom is a start.** The rot hall's door is a root door in the well's own corridor that opens
  only from the rot side (`rot-wall`, a shortcut, opens `e`): from the bottom the one way out is up. The save and the
  west moth-stone moved up onto the mouth's floor (`p-well` 1720, `stone-west` 2440 at 3200): leg 1 pays with them,
  and a thorn on leg 2 puts her back beside a save. A lamp hangs up the shaft (`wick-shaft`, 1290 x 4180, seen from
  the bottom, out of a fling's reach from the floor). The claws were already on the bottom floor at the foot of leg
  1 (`glade-claws`); `claw-prize` stays the great on the face above it (Ori's energy cell by the Wall Jump tree).
- **#2, climbs with a second element; the way out as the exam.**
  - *The way out*: the chimney's floor dug down to 1856 (in from the den down a root shaft and a low passage), 1,472
    px of chimney in three legs from three rests: up the east face to rest E (1344, a 384 px opening in the east
    block); across to the west face, cutting the rotten plug (832-896) from a cling under it, to rest W (832, in the
    west block over the plug); across to the east face and over the top. A strip over each upper rest on the face she
    must not take (`thorn-o2` east 832-960, `thorn-o3` west 384-448, and that corner refuses the claws): two changes
    of wall. `climbs.ts` out-1/2/3 pass at 0 / 6 / 10 with 64 px margins; "east face only" from rest E and "west face
    only" from rest W fail.
  - *The well's leg 3*: a lampwing in the chimney halfway up (`wing-chimney`, 2112 x 1680, radius 140, woken by the
    claws), 750 px over the landing and 500 under the hollow: no rest is kept.
  - *Rewards off the line*: three glints on the well's thorned east face just over leg 2's strip (`risk-w-*`, the
    strip lowered to 2656-2740), two on the Elder's east face over its upper strip (`risk-e-*`, the strip at
    648-800). Each has a `climbs.ts` plan that takes them (a kick in from the clean face and out again), held at
    delays 0 and 6 with half the margin: a risk, not a ladder.
- **#3, the travel furnished to the exact numbers** (`tools/levels/canopy-furniture.ts`, the table below): thorns
  6,800 -> 12,000 px (41 strips, median 256; 272 px per air screen in hero heights against HK 340, Nine Sols 330-374,
  Ori 328), each a floor pit (64 deep) or a strip with ground to return to: the limbs' floor under the second limb,
  the hub's clearing, the crown's floor, the attic, the sky's roost, the gap's floor, the tunnel's west floor (two
  pits), the trunk's first hall, the cellar's stair, the burrow, the nook, the bower's hall, the Grove's east floor,
  the rot hall, the Spire's foot, the Elder's floor. Pods 1 -> 29 (2-3 a hall where no fight is, some on knuckles
  and in pockets), paid out of the hoards (the glints stay at 58). One-ways 8 -> 33: root knuckles of 128-160 px in
  the trunk's tiers, the tunnel, the gap's floor, the galleries' nest, the bower's hall, the cellar, the larder, the
  burrow, the nook and the hub's clearing. Things to hit plus ledges: 1.77 per air screen (the review's check: 0.8).
  What the proofs and bots threw back: a knuckle by tier 3's rot door reached it without the claws, the galleries'
  east pit (in a 256 px corridor) and its highest knuckle cut off / opened the larder, two knuckles by the gap's west
  wall reached the far limb without wings, the hub clearing's pit at 448 turned the start bots back before the claws,
  and a pit under the hub's east limb caught every drop off it: all moved or cut.
- **#5, the Grove's wave is an arena.** Landing in the pit shuts the west door behind her (`pit-door`, a root gate at
  the entry corridor's lip with `shut: cn-grove-wave`, a new sim field), so both doors hold until the wave is down;
  a fade re-arms it (the door opens behind her as she re-forms at the entry's new save, `p-grove`, and the trigger
  shuts it again: never locked out). Beat 1's burrbacks sleep until then (`wakes: cn-grove-wave`); beat 2 comes from
  three sides: the juveniles from the pit's two ends (1760 and 2920, clear of the caps), the dangler down from the
  Grovemother's west crown limb (1824), the lampwing from `wick-b` as before. The root step moved off the thorn bed
  to 1792-1984 under her west arch. `tests/unit/canopy-arena.test.ts`.
- **#9, the hub is a place.** 8,000 x 2,304 (8.9 box screens; the west rooms moved 3,520 west with it): she still
  lands east of its middle on the lampoak, and the root floor runs west through a moonlit clearing (the save and the
  moth kin at its heart, two root burls, four knuckles, three pods, two thorn pits, no creature) to the high block
  and the giant's mouth. Two more shown locks: a rotten wall high in the block's east face (its sill 320 over the
  clearing's floor: the claws), and a shelf off the block's top only wings reach (1,280 px across the clearing,
  sheer, a great on it).
- **#10, secrets as places and routes.**
  - Four path pockets grown to at least 768 x 448, each with a ledge or a drop to climb and a pod: the hub's bank,
    the fork's stone pocket, the Grove's pit wall, the bower's kin (it drops into a chamber under the west hall).
    The hub's high chamber is a fifth.
  - Two covered routes: a vent under the upper limbs' floor (between the stump and the tall trunk) east into the
    hub's high chamber, the short way home from a fall off the gap; a tube in the tunnel's roof over the pit, the
    clawed way back west (in from a shaft over the east block, out by a drop onto the hump whose faces refuse the
    claws: the glide still owns the way east).
  - The first dark edge: a root clump hung under the hatching branch's end, three glints in it, under a cover (the
    hatch now has `art.pieces`).
- **The bots read strips** (tools/playtest/lines.ts): a climb whose face has a thorn strip in its span offers the
  clean far face first, and the persona takes it first.

## v11: staging, three directed moments and the ending (review `reviews/canopy-r10.md`, 7.5/10)
Round 10's step back: the premise works as a mechanic, but nothing is directed. v11 directs the first release, the
firefly hanging a cage, and ends the area on a great cage. The level / sim side (#1, #2, #3, #4, #5, #10); the render
builder drew the look (the release, the firefly as a creature, the boss's intro, the HUD) from the hooks in
`memory/canopy.md` ("The premise, staged").
- **#1, the great cage.** `cn-den:trap-den`, 120 moths, hung from the den's roof over the arena's middle (1,856 x 760),
  the old burrback asleep under it. While it lives the blade glances off the bars (`Lure.guard: cn-den-down`,
  `lureGuarded`); down, three up cuts from a running jump off either shelf's inner end free it: a held beat
  (`Lure.hold` 90: she stands, nothing hurts her), the area's biggest cloud, and the cage's `sets` (`cn-den-freed`)
  opens **the den's roof** (`den-roof`, over the arena's east end). The arena's east wall is the climb to it (its foot
  refuses the claws, as v10's gate there did), then a passage east under the den's roof onto **the way out's
  clifftop**: the valley vista first (trigger `out-vista` -> `marks.stage.vista`, a 3 s look over the valley, the moon
  and the mountain), the kin waiting there. v10's east root gate and corridor are gone; the way out's chimney is the
  way down to the ledge's secret and back up. The arena's lock lets go with the release. Proofs: with the boss down
  and the cage not freed the den holds (`not: out, place:roof`); freed, `out` and `place:roof`. **Played**: the route
  plan beats the old burrback (55.7 s, 1 hit), cuts the cage in 3 tries, climbs out through the roof and reaches
  the vista **22 s after the last hit**, then glides over the valley to `cn-area-end`.
- **#2, the hub's cage.** `trap-crossing` moved under the landing limb (6,300 x 1,400, 200 over the floor), in the
  drop's frame. A cage's catch is `lures.trapRadius` 64 (a flame's 20): a standing up cut reaches 228 px over her
  feet. The first cut on any cage lets one moth out (`lureHit.escape`). A cage's break is a 14-frame hitstop
  (`trapSnuffHitstop`) **with the world held** (every creature's hitstop too; render: the Grove's wave lurched). The
  first-timer cut it at 27.7 s, at the landing ("a swarm of moths flew free around me. Felt nice").
- **#2, the warning's cage** is not there in the fight (v10: the reviewer freed it by accident under a lampwing): the
  firefly hangs it once the warning is cleared (`after: cn-warn-hung`), over the root knuckle before the den's mouth
  (7,552 x 1,420), cut standing on the knuckle.
- **#3, the firefly.** The gap's pass starts on her first fling off the chain (`FireflyPass.onFling`; the landing
  trigger is gone): the firefly comes out of the roost's mouth and relights the lamp she just left, in her frame
  (it relights a smouldering lamp now), then the others, then flees down to the fork; in the route plan she
  re-flings two of the relit lamps. **The second sighting** (`firefly-warn`, `onFlag: cn-tunnel-clear`): out of the
  tube's east shaft, it hangs the warning's cage (`hang {point, frames, sets}`, `fireflyHang`) and flees through the
  den's mouth; her input is held 1.5 s (`hold`), and `look` is the camera hook. **A third** (`firefly-den`): landing on
  the den's balcony, it circles the great cage and goes up through the roof's gate.
- **#4, the hub's landing view.** A camera zone `landing` (zoom 0.9) frames the landing limb, the cage under it, the
  kin on the floor below looking up at the cage (`marks.tatter`, `want` the cage) and the sky, until she first walks
  off the landing (`cn-hub-left`; ending it on the release dropped the view mid-ease); then the kin is back by its
  light. The clump under the gap's drop has a stepped root crown (no straight band) and its east face runs down to a
  root foot 192 over the bank's floor, lit by a springboard (`wick-clump`): `place:clump-top` in one climb. **Not
  done**: a way up into the gap from the hub. The gap's opening over the clump stays arrival only: the far floor
  behind it is the glide's prize (the far seed), and a claw route up would hand it out without the glide.
- **#5, `firsttimer --world canopy`** plays a world from its start as the game (`?world=<id>&fresh`, R to its last
  save). A first-timer agent played 6.5 game minutes (playtest-reports/canopy-r11-firsttimer): the hatch, the hub's
  cage at once, ~2 game minutes stuck at the fallen giant's notch (a short hop gets through, a full jump bonks the
  hanging trunk; "a one-tile gap I couldn't see"), the claws ("a real reward"), four deaths at the upper limbs' gap
  (it never found how the lamp throws there: "I can't read where I'm meant to hold"), then the fork and the Grove.
  It read "30 / 60" as moths of 60, never knew what the star counter (glints) counts, never knowingly saw the firefly
  (it never flung the gap's chain) and never reached the boss.
- **#10, the old burrback's wake** (sim): 1.5 s on her drop into the arena (`wakeFrames` 90): it rises facing the way
  it slept, turns to her in the last half second (`wakeTurnFrames` 30, `enemyTurn` cause `wake`), harmless, then
  hunts. Deterministic. The route plan's fight: down in 55.7 s, 1 hit.
- **Checks.** `canopy-r11.test.ts` (16): the hub's cage in the landing's frame at 16:9 / 16:10 / 21:9 with the kin;
  a standing up cut frees it in three, the first lets a moth out, the hitstop; the ±64 catch; the world held through
  a cage's break in the Grove's wave; the warning's cage absent in the fight, hung by the firefly (input held 90),
  hung even if the pass is cut short, cut from the knuckle; the gap's pass on a real fling relighting that lamp in
  frame; the great cage guarded, then freed from the shelf (120 moths, the held beat, the roof open); the den's
  firefly; the wake. Proofs: every claim in all 27 rooms holds (v11 adds the clump, the den's two locks, the way
  out from the clifftop, the warning's cage spot). `canopy-furniture.ts --check --rooms --route`: round 9's bar met.
  `route-video.ts plan` (v8): the whole area, every cage cut, both sightings, the boss, the roof, the vista: 0 legs
  failed, 6.3 min of play.
- **Bots** (playtest-reports/canopy-r11, on 9b2f08d, bugs only): all three cut the hub's cage on the way (30 moths),
  none softlocked; none got past the west (5 rooms in 25 min): each lost 100-160 s at a time in the well's gallery and
  bottom, and 5-7 hits on the upper limbs' thorns (`thorn-g1`), the same gap that killed the first-timer four times.

## v10: the premise in play and the first lesson (review `reviews/canopy-r9.md`, 7/10)
Round 9's verdict: every measured bar is met and the score has plateaued, because nothing in play is about anything.
v10 spends half its effort on the first lesson and the premise, end to end, and adds no measures. The level / sim
side (#1, #2, #3, #6 level, #7, #9 and a gate guard); the render builder draws what it reads (memory/canopy.md "The
premise" has every name).
- **#1, the first fling.** Near `wick-first`, until she has flung off it once (`lesson:cn-hatch:wick-first`; a cut does
  not end it), her fall and run ease to a drift (`Lure.lesson`; `lures.lessonPx` 130, just past the 110 reach;
  `lessonFall` 1.25, `lessonRun` 2.5, eased over 6 frames; `player.lessonK` for render). Every jump toward the lamp
  from the lip (S5) or off the crown's limb (S4) is in reach **33-85 frames** (8-21 without it; the review saw 8); no
  jump without the fling crosses. A Lamp key pressed with no flame in reach and held on is taken as a press when a
  flame comes into reach (`lures.heldPress`; not in glow rooms). Let go with no direction held, the lamp flings her
  up-right (`Lure.aim`), never out through her (down, once she had drifted under it). Tuned on the human-like bots in
  the hatch (6 runs): a 200 px zone slowed them outside the reach and the casual one fell 36 times; at 130 they are
  out in 30-49 s with 1-6 catches (without the lesson 26-56 s, 1-8).
- **#2, the premise.** Two kinds of lamp. **Traps** (`Lure.trap`): cages of moths, three on the route, `trap-crossing`
  (the hub, the first thing west of the drop, 30 moths), `trap-grove` (the pit's west lamp, 30), `trap-warn` (by the
  den's mouth, 40). The verb is the blade, the snuff the game already had: three cuts from a jump off the floor under
  it (`lures.trapHp`), no fling off a trap. Out for good, saved (`save.snuffed`), its moths counted in `save.moths`
  (the HUD's number; `lureSnuff {trap, moths, total}`), a light back. **Springboards**: every other lamp she can fling
  off is one of the firefly's hung lights, holds no moths and relights (240 frames; the gap's 900; never saved), so
  the two read differently in play: what to use and what to free. That also closed a lost-for-good: a swing at the
  well hollow's ambush lampwing cut `wick-hollow`, the shard's only way up (the video agent's find). **The firefly
  once**: landing below the gap's chain the first time, a light leaves the roost's mouth, touches the three lamps
  (any she flung burns again), swoops down past her and flees ahead of her down the drop to the fork, 5 s (2.5+ of
  them in her frame at every shape), no control lost (`scene.fireflies`,
  `state.kit.firefly`, `fireflyStart / fireflyRelight / fireflyEnd`). **The hub keeps the count**: each freed trap's
  moths roost in the hub (`scene.roosts`, `roostsLit`): the hub's on the high block's claw face (the shard chamber's
  way up, lit), the Grove's over the kin's lamp, the warning's in the lampoak's crown over the drop.
- **#3, retries in front of the hard part.** A mark patch on the den's warning (`p-warn`, `MoonPatch.mark` + `area`:
  marked anywhere on the floor, never a rest): faded there she re-forms on the floor, past the pit and the hawker.
  Thorn returns inside a shut arena go to the end of her floor farthest from the bed, 160+ px from every bed
  (`room.arenaThornPx`; walked back along the floor only as far as her box fits: the Grove's pit floor runs on under the west wall into the secret pocket. Walking into `thorn-p1` she is back at ~1,690, by the bounce cap, 870 px off).
- **#6, the den's warning as an arena (level).** The hump and the pit 128 west; the floor **1,024 flat** from the pit
  (6,912) to the lid, its middle clear (a knuckle at each end, a pod), the lamps at its ends (the springboard by the
  pit's lip, the trap by the mouth). The den's mouth an arch in the east wall at the floor (lintel 7,808-8,000 x
  1,408-1,600, the cellar shortcut's ledge on it), its lid a root gate standing in it; the link to the den moved up to
  it (the den's balcony 192 higher). Zoom 1.1 (was 0.85; render asked for closer): the mouth sits in the middle third of the frame at 16:9,
  16:10 and 21:9, the pit's far lip in the frame's left part. Beat 2 comes out of the mouth. The east root curtain by
  the hub's shaft is shorter (the moved hump put its first tier under it: the solver's tunnel claims caught it).
- **#7, the boss as payoff.** Played: my own reactive controller through `window.__game` (bait at ~360 px, jump the
  ram on its windup, cut it in `recover`; pogo the roll) took phase 1 without a hit and phase 2 for one (the slam's
  wave); phase 3's rams are a jump and the taproot's opening. The human-like bots alone in the den (`npm run humanplay
  -- den --room cn-den --at 300`, 4 skills x 3 seeds): **12 of 12 down**, 55-109 s, 0-2 fades, 5-9 hits; casual 0:55-1:48.
  Beatable, and as hard as a first boss should be (HK's False Knight costs a first-timer 1-3 tries). The rest before
  its gate is `p-den` on the balcony, one drop from the arena (a fade re-forms there). Foreshadowed: shed shells the
  boss's size and claw scrapes in the tunnel and the warning (landmarks `shell` / `scrape` for render), and beat 2's
  start (`flagSet cn-tunnel-beat2`) asks render / audio for a deep slam from the den. Clip:
  `clips/canopy-r10-den-boss.mp4` (the average bot's win, from the balcony).
- **#9, a hub that changes.** The roosts (one more each trap freed) and the map station opening on her first pass
  too (`mapStation` on a mark; then on each rest).
- **A gate never shuts on her** (sim): a gate shutting with her box in its rect pushes her the shortest way to a clear
  spot (`gatePush`). Tested on the Grove's arena gate.
- **Checks.** `canopy-r10.test.ts` (19): the lesson's windows and held press from five take-offs, the let-go aim, no
  crossing without the fling; each trap cut out in three cuts from its floor, saved, counted, out after a reload;
  every other flingable lamp a springboard; the hollow lamp relights; the roosts; the map on a pass; the firefly's
  pass and its relights, once; the gate push; the arena thorn return; the warning's floor and its re-form.
  `canopy-r9b.test.ts` moved with the pit (the glide lock holds at -128) and frames the new mouth. Proofs: every claim
  (`tools/solve/canopy.ts`, 100 claims in 27 rooms, on fee9700: all hold); the route bar met (the warning's window 9.0
  a screen, 3.0x); `canopy-furniture.ts --check --route` met.
- **Bots** (playtest-reports/canopy-r10, on ba98685; bugs only): all three out of the hatch in 30-49 s (the first
  fling's lesson and aim: the casual bot had fallen 36 times in a row on the first try of the lesson, with a 200 px
  zone), every one cut the hub's trap on the way west (30 moths freed), the average and skilled bots up the well to the
  limbs (r9: none), the skilled back to the hub. No softlock. Deaths: the well hollow's ambush (906 / 419 x 1,152, 2-3
  each). Lost time: the well's bottom and gallery (80-180 s), the skilled bot 140 s under the lampoak's east limb.

## v9b: round 9's weak list, a fix pass before deploy
- **The tunnel's glide is clear.** The hump steps up from the west to a plumb east face that is the pit's west wall:
  the take-off (6,080 x 1,472) is the highest ground, 384 over the warning's floor (v9: 256), over a 960 pit whose far
  face is slick. `tools/levels/glide-probe.ts`: a jump reaches the thorns at 6,790, a walk-off jump late in coyote time
  at 6,828, a jump and a pogo off the thorns ~7,000 (all short of 7,040, no kick up the far face); a jump held through
  lands at 7,255, a late glide 7,116, a glide from the apex 7,677, a walk-off glide 7,746. The solver's claws-only claim
  now also holds `place:east` (a first try with the lamp where it was let a jump pogo off it onto the lip: the lamp is
  at the far lip, 7,000 x 1,560, where only a glide passes). The route's tunnel peak still 3.0x (9.0 a screen).
- **The hawker is fair.** It hunts her, not its lamp's clock: from under the roof it sees her a third of the way across
  (`sight` 520), tells 30 frames (`hawker.curiousFrames`, the fairness test's floor) and strikes where her glide will
  be (a 15-34 frame strike). A blow on a glider throws her on along it (`hawker.glideKnockVx` 8, `glideKnockLift` 5):
  over 36 arrival phases every glide still lands across (a light lost), and a check back, a drop and a fresh glide, or a
  cut answers it with no hit (36 of 36 each). Driven in the page: held through, hit at x 6,920, landed at 7,315 with 3
  of 4 lights.
- **The gap's chain keeps an early press** (`lures.flingBufferFrames` 8): a press held from 1-7 frames after lamp 1's
  release (in the cooldown, before lamp 2 is in reach at +5) flings lamp 2 (v9: none before +8). Driven: pressed at +3,
  lamp 2 flung at +8.
- **Bots** (`giveUpGround`): an unwalked cell given up after 45 s takes the rest of that ground with it (r9's skilled
  bot spent 45 s on each cell of the shard's shelf in turn). Their explorer still walks every reachable cell of a room
  before an exit; that is the bots, not a reading of the door.
- **The den's warning frames the mouth** (render's note): the zone is a set zoom (0.85) over a small frame at the
  mouth's corner, so the view runs to ~2,155 (v9: 2,048, the mouth's floor on the frame's edge) and to ~7,998 at
  16:9, 16:10 and 21:9; the pit's far lip and the roof still in frame.
- **The Grove's wave trigger** starts 128 under the arena gates (it reached up to their foot, and a slow drop set it
  with her head in the gate, which shut on her: found by the route plan).
- `tools/playtest/route-video.ts plan` runs the v9 route end to end (57 legs; the shard's fling, optional, unfound).
- `canopy-r9b.test.ts` (8): the jumps short and the glides clear, the hawker's blow and its answers, the chain's press,
  the warning's frame at three shapes, the Grove trigger under its gates.

## v9: the level side of review round 8 (`reviews/canopy-r8.md`, 7/10)
Round 8's verdict: the first ten minutes are fair; what holds it at 7 is shape. The well was a vertical sink with an
unlit door, the frames half black boxes, the second peak on a branch, 51 glints buying nothing. v9 takes the [level]
items (#1, #2, #4, #5, #7, #8, #9); #3, #6 and #10 are the render builder's.
- **#1, the well.**
  - *Two climbing legs to the limbs* (v8: legs 1, 2, 3a, 3b). Leg 3 is **the gallery**, a switchback through the
    hollowed west wall, walked and jumped: west along the landing's floor (a burrback, a bramble pit), up two root
    terraces at the west wall, east along a bough (a lampwing over it, one dive a pass), up a stair of roots through
    a root across the hollow's floor. The solver walks it with no claws at all (`(1700, 2432) [none]`).
  - *Leg 2's strip is off the climb* (the bots' top hit source four rounds running): `thorn-w2` is the gallery's
    bramble pit, 256 long in a 64 px pit, where a jump is the choice. Leg 2 is either face at delays 0-16 (36 of 36),
    its top lip the chimney's width (the east face tops out on it).
  - *The door*: a root step under it, so the hollow's floor, the step and the door are two plain jumps east of where
    the stair comes up (I drove it: floor -> step -> door -> the limbs in 64 frames). A `door-notice` camera zone
    over the stair's top holds the view at 640-2,560 x 256-1,344: the door is the frame's top right at 16:9, 16:10
    and 21:9 (`canopy-r9.test.ts`). A `door` landmark (`door-limbs`) is for render to light.
  - *The ambush pays*: a root shelf high on the west wall (256-832 x 800, its face slick) holds the moon shard (v8's
    landing niche). Only the hollow lamp reaches it, an up-left fling from over the ambush floor (in the trigger:
    the fight is on); the claim without the lamp holds (`lampKey`), lit it is taken.
  - Path climbing between the hub and the Grove: 18% of the path's length (`canopy-furniture.ts --route`).
- **#2, less solid in frame.** `sealDeep(d)` (generator): mass more than `d` px (256; 192 for the crawl, galleries and
  Spire) from any carved air or the room's edge is carved out as sealed air with the back behind it, listed in
  `marks.sealed` (Zod and `Room`: air to the sim and the painter, rock to the area export, the map and the bots).
  Walls become shells, pillars and boughs. By hand: the well's pillars (behind leg 1's faces, under the gallery,
  behind the stairwell), the hub's floor a 256 px bough (two posts by the seed door's shaft, the east bank too), the
  fork's west block a 320 px trunk. `canopy-frames.ts` (headless, the real follow camera and zones, look:check's ring
  test): **every wide stop of every room at most 30% deep solid** at 16:9, 16:10 and 21:9 (v8: 27 over); the well's
  median 4% (v8: 44%), the hub 6%, the fork 7%. look:check on the painted frames: the well 2-10% deep, near-black 6-13%
  (v8: 52-65%).
- **#4, the second peak on the path.** The den's warning is a two-beat arena: the pit 768 (v8: 1,024), the floor 640 to
  the lid; beat 1 the two lampwings down from the roof, beat 2 a juvenile pair and a burrback up out of the den's mouth
  (or down the tube's shaft), each from 400+ px; the lid opens when the last falls; a `fit` zone over the arena until
  `cn-tunnel-clear`; two lamps a jump over the floor, two root knuckles. The hawker orbits a lamp on the glide's line
  (`wick-pit`): she is lit as she glides by and it strikes mid-glide (driven: a dive every crossing). The pit's arc
  is three glints. Peaks measured along the route without glints (`alongRoute`, sliding 2-screen windows, what is
  within 640 x 360 of her line): the Grove 11.5 a screen (3.8x the median 3.0), the tunnel's warning 9.0 (3.0x).
- **#5, glints 51 -> 23** (no answer on the trade): kept as the prizes of lines and secrets (the limbs' niche 2, the
  Elder's risk 2, the nest wall 2, the Grove's arc 3, the gap's roost 2 and glide 2, the tunnel's burrow 2, tube 2, pile
  3, pit arc 3); the run's arc and leg 2's risk glints are gone. The trader's spot stays.
- **#7, the gap's chain is three lamps.** `wick-gap-3` at 2,800 x 1,580, where the down-left and the left flings off the
  second both pass (`fling-probe.ts`); straight down lands on a knuckle. From there a left or up-left fling carried a
  clawed player onto the far limb, and a shorter far limb is past the glide (a walk-off glide sinks 0.45 px a px), so
  a slick root hangs from the canopy between them (2,368-2,560, its foot at 1,560, under which the glide passes): the
  flights west off the third lamp meet it and fall to the bramble. Driven: lamp 1 down-left, lamp 2 down-left, lamp 3
  down-right, onto the pod garden. The lit proofs hold.
- **#8, every set piece framed.** `fit` zones on the hollow's ambush (until `cn-well-clear`) and the den's warning;
  `wing-am` waits by the lamp (1,450 x 820), off her column. `canopy-check.ts`: every trigger that wakes creatures has
  a camera zone over it keyed to its wave's clear flag.
- **#9, a reason to stop in the hub** (sim, small): a moon patch can be a **map station** (`MoonPatch.map`) that
  **hangs moth-stones** (`hangs: [{stone, flag}]`). Resting at it pushes `mapStation` (render opens the map) and, for
  each stone she has read and not hung, sets its flag and pushes `stoneHung` (`hung` = how many hang now). The hub's
  save beside the kin's lamp (260 px) is one: `cn-stone-west / heart / east / high / deep`, one more each return.
- **Bots** (a bug the run found): a persona's map took the floor of sealed air for ground and walked at it 45 s at a
  time (the r9 run's first pass stood in the hub and the trunk for minutes); `buildSurfaces` drops tops inside
  `marks.sealed`.

**v9's numbers** (`metrics.ts`, `canopy-furniture.ts --check --route`; round 9's bar met):

| measure | HK | Silksong | Ori | Nine Sols | Canopy v8 | **Canopy v9** |
|---|---|---|---|---|---|---|
| enemies per box screen | 0.55 | 0.26 | 0.57 | 0.59 | 0.55 | **0.59** (the gallery's two, the warning's beat 2) |
| majors / minors | 17 / 4 | 8 / 41 | 23 / 11 | 16 / 13 | 23 / 51 | **23 / 23** |
| hidden share | 0.35 | 0.22 | 0.18 | 0.26 | 0.27 | **0.30** |
| things per box screen | 0.28 | 0.17 | 0.80 | 0.42 | 1.48 | **1.21** |
| solid share of room boxes | 0.63 | 0.74 | 0.44 | 0.49 | 0.50 | **0.50** (sealed air counted as rock) |
| deep solid in a wide stop (max) | | | | | 52% | **20%** (every stop <= 30%) |
| peaks along the route (no glints) | | | | | (the tunnel's on a branch) | **Grove 3.8x, the warning 3.0x** |
| hub -> Grove climbing | | | | | | **18% of the path** |

What round 9's bar is (`check`): one room peak; two route peaks at >= 3x (the review asked 4x: the middle stretches,
3-6 a screen on the trunk, the well and the bower / gap, would have to thin); thorns >= 10,000 px (two strips came off
the climbs); the hub to the Grove climbing at most half its path.

**Proven**: every claim of every room on 6ffd96e (27 rooms, a room a process), then the well and the tunnel again
after the stair and the tunnel's last change. `canopy-r9.test.ts` (10): the door in frame at three shapes, the ambush
fit and its lampwing's post, the shard by the fling, the warning's two beats and its lid and zone, glints <= 25, the
gap's three aims, the map station. `climbs.ts --creatures`: leg 2 with the room's creatures 0 hits, the Spire's foot
with its hawker <= 1.

**Played by the bots** (playtest-reports/canopy-r9, on c543690; bugs only): claws at 1:22-2:19; the average bot in
the hollow at 3:54 and on the door's floor 14 s after the ambush, then it turned back to explore (the shard's shelf,
which it cannot fling to, and the well's bottom) and was lost there; the skilled bot spent 75 s jumping at the
shard's shelf. None reached the limbs (4 / 27 rooms each). Hits: the gallery's bramble 2 (casual), its burrback 1-2;
no leg-2 strip hits. A person walked the door in one go (driven); the bots' explorer goes for unwalked ground before
exits and has no plan for a fling to a ledge.

## v8: the level side of review round 7 (`reviews/canopy-r7.md`, 6.5/10)
Round 7's verdict: the shape is in the references' band, but the first ten minutes hold three things a new player
would not forgive or not find: a point-blank spawn, a runback through a save she crossed, a verb nobody told her
about. v8 takes the [level] items (#1, #2, #4, #5's level side, #7, #9) and two bugs from the coordinator's v7 video;
the render items (#3, #6, #8, #10, the moon's draw) are the render builder's. The trade is Matt's call (not built).
- **#1, the fling taught.**
  - *A required, safe first fling a minute in* (the hatch, the one room crossed once; the lamp relights 90 frames
    after it goes out, `relight`, so a cut never leaves her without it): the crown's east limb (S5) is
    cut back to 3,520 and the droop's limb (S8) starts at 4,272 (still inside its painted trunk): 752 px across and
    290 down, past any jump (a coyote jump with the hold reached 4,221 before: 51 px short of the new lip). One lamp
    (`wick-first`, 3,700 x 660) hangs on a running jump's rise off the lip; under the gap the fall catch sets her
    back on S5 and the lamp burns again. Flung right, down-right or up-right she lands on S8, S9 or the drop. Out for
    good after (`sets: cn-first-fling`).
  - *The notice, wordless*: a camera zone on S5's east end (`first-fling`, bounds 3,200-5,248 x 360-1,512, `until:
    cn-first-fling`) holds the lamp and the far limb in one frame until she has flung. The landmark `first-fling`
    (kind `teach`) is where render's moths can spill toward the far side.
  - *The prompt*: render's (prompts.ts already teaches the glide, the kick and the offer, "for good" in
    localStorage): a fourth lesson, the Lamp key's cap HELD beside the flame, while `flingTarget()` is non-null and
    she has never flung; gone for good on the first `fling` event. No sim flag needed (`cn-first-fling` exists if
    render wants one).
  - *Prizes in frame from their lamps*: the limbs' niche (280 x 230 from `wick-limb-2`), the gap's roost (390 from
    `wick-gap-1`), the Grove's arc (over the lamps), the hollow's east shelf; all inside one 1920 x 1080 view.
  - *The gap's chain*: v7's second lamp sat 140 px east of a down-left fling's line off the first. The review's spot
    (~3,120 x 1,560) opens the glide's lock: from any lamp west of ~3,200 at 1,550-1,700 an up-left fling lands a
    clawed player on the far limb (the lit proofs, five spots tried). So the first lamp moved instead, down under the
    shelf's lip (3,400 x 1,420: a walk to the lip finds it), and the second sits on its down-left line (3,250 x 1,460);
    down off the second, the third. A down-left fling off the first brings the second into reach
    (`canopy-r8.test.ts`), and every gap claim holds lit.
  - *The bots fling*: `FlingAim` in tools/playtest/lines.ts (Lamp pressed when a flame is in reach on a lamp
    line, the stick swept over the ways toward the goal reading `lureArc`, let go on the best), and the Lamp key in
    the motor's keys (human.ts). v7's bots still played the old lamp catch (`player.lure`, always -1 since
    2026-10-18), and their hands had no Lamp key: that is why they lit 0 lamps.
- **#2, ambushes arrive** (sim: `EnemySpawn.arrive`, a list of points; `EnemyState.arrive / arriveX / arriveY`;
  `enemyArrive`; `tuning.enemies.arriveDelayFrames` 36, `arriveFrames` 48, `arriveClearPx` 400; trigger `rearm`).
  The flag's step shuts the gates; 36 frames later each creature shows at the first of its arrive points 400+ px from
  her and travels to its spawn over 48 frames, harmless and out of reach; then it is itself.
  - *The well's hollow*: the trigger is where she lands off the block (1,000-1,408); the burrbacks crawl out of a
    burrow mouth in the west wall (x 300) to grounds west of her, the lampwing drops from the roof roots (1,350 x 470).
    Until all three are down a fade or a new entry takes the flag back (`rearm`): it plays again from its arrival.
  - *The Grove*: the trigger is the drop's column west of the Grovemother (1,472-2,016 x 1,120-1,600: her trunk walls
    the pit's east half from the roof to her stilts, so it is the only way in before the wave) and fires as she
    passes the gates' line. Beat 1 arrives from the pit's east floor (2,800 and 3,240) to 2,380 and 2,950; beat 2's
    juveniles drop from under the gates, the far side if she stands under the near one.
  - *The tunnel's new wave* (#7) arrives the same way.
  - A cleared wave stays clear on a new entry (a woken creature whose own `sets` flag is saved stays out), and a fade
    in beat 2 replays the wave from beat 1 (`rearmArenas` takes back a beat's flag with its waking flag), never both
    beats at once (v7 brought beat 1 back over a living beat 2).
  - `canopy-r8.test.ts`: every trigger entered from each side she can come from (8 entries): gates shut on the flag's
    step, every arrival 30-45 frames later from 400+ px, 60 frames standing still unhit.
- **#4, a patch she runs through is her re-form point** (sim: `progress.ts`, `tuning.patch.markOnPass`, event
  `patchMark`, an autosave event): her feet in its box, on the ground or in the air, set `save.patch`; no heal, no
  rest (standing still in it still rests). Every patch, so the way out's rests and the Spire's nook too. Tested on
  `p-hollow`: from the chimney's top over the save at a run, into the ambush, a fade, she re-forms at `p-hollow`.
- **#5, the hub as a place** (level side; the trade not built):
  - *Framed*: a camera zone over the clearing (the save +- 1,200) whose bounds end 240 under the floor: the floor
    sits at 78% of a 1080 frame, 80% at 16:10, the sky over it (the moon is render's: `art.moon` is placed at view
    1,180 x 200).
  - *One warm light*: the kin's lamp (`landmarks` `kin-lamp`, kind `light`, 2,700 x 1,600), not a fling lamp.
  - *The kin in three places* (`marks.tatter`, `when`): the clearing (watches, turns away), the bower's chamber
    behind the rotten wall (keeping a light: landmark `kin-light`), the way out's cliff top after the den
    (`when: cn-den-down`). The acting is render's (`marks.notes` say what each beat is).
- **#7, a second peak, a quiet path room, the burrow a place.**
  - *The tunnel is the second peak* (59 things, 7.0 a screen, 4.2x the median): the west hall's garden staggered
    (six knuckles with pods, two higher; the run grew to 1,056-3,072), an arc of seven glints over the run, the carriers' trail out of the hall's
    crack at the run's east end, a juvenile keeping the pile, a hawker over the pit, eight glints on the glide's line,
    and the den's warning: a gated wave where the glide lands (two lampwings, a juvenile, arriving; a root lid over
    the drop to the den's mouth until it is cleared; the cellar's shortcut stays open off the block).
  - *The fork's approach is the quiet path room* (0.68): its knoll juvenile, the face's pod, the stone pocket (the
    east's moth-stone moved to the Grove's door, by its save) and the glide shelf with its glints are gone; the face
    and the lamp over its top remain. The climb into the Grove starts from calm, under the moon.
  - *The burrow is the nest*: the tunnel's lower floor, a long low gallery under the hall's west end (a shaft from the
    hall's floor by the pile, `nest` / `hall`), the carriers' trails into their cracks, a juvenile pair, pods hung
    from root clumps (render's floor-mounted ledge families are spent: no family in more than three rooms), the
    deep's map at the far end; back up the shaft or the burl (the claws). 2.14 a screen.
  - *Taken from the middle*: the limbs' lampwing and pod (the trunk, well and limbs ran 3.4-3.7 in a row), the bower's
    kin-chamber pod and the knuckle over its save's floor, the Spire's foot tray. The fork's cellar cover is two now
    (the knoll's chamber, the stairs under the floor): v7's ran over the open way in from the Crossing.
- **#9, climbs fair for a relaxed hand** (`DELAYS` 0 / 6 / 10 / 16, every required climb from every start, 64 px
  margins):
  - *Leg 3b's lampwing dives once a pass* (`dives: 1`, sim: a lampwing with its own dive count that tired or touched
    her tells nothing for `retellFrames` and its body is harmless meanwhile): the plain plan takes at most one hit
    from every start at every delay (v7: 4 hits and a fade from one start); the up-cut plan still kills it unhurt.
  - *The Spire's neck*: its first touch slid off the east face's foot (256 over the nook's mouth). A root column
    hangs off the neck's east face in front of the mouth's top (to 760, the mouth 136 open under it) and a root lip
    runs out from the mouth's floor (1,088-1,280): from the lip a jump meets the column on the way up. `thorn-s2`
    moved onto the column's face. A climber from the foot now goes on up past the mouth to the bower (either ends
    `spire-1`).
  - *The Elder's leg 1*: its root lip carries the east face to 128 over the floor (was 192).
  - *The way out's leg 3*: `thorn-o2` 880-984 (was 832-960: a 16-frame slide from the first touch met its grown top).
  - *Leg 2's strip is 160 tall* (`thorn-w2` 2,580-2,740). The risk glints over it moved to a new risk line from the
    landing: off its lip (64 longer, to 2,240) down the east face to the glints just over the strip and a kick back
    (`well-2-risk`, delays 0 / 6, margin 16: the slide onto glints over thorns is the risk). Leg 3a jumps from the
    lip's middle (2,016-2,048).
- **The v7 video's bugs** (the coordinator): the den's two escape shelves are root one-ways now (under the solid west
  shelf the old burrback sat in `recover` 90 s and its ram stopped at the shelf's underside: a free safe spot); the
  Grove's beat-2 lampwing hangs low over the east floor with a 360 px sight (it hovered out of reach and never dived:
  with the gates shut the wave stalled), and the beat's juveniles range the pit floor (500 / 300).
- **A sim bug the first fling found**: a fall catch's return (`placePlayer`) gave a fresh player the tuning's double
  jump whether she owned it or not; a miss at the gap then crossed it with an air jump. The catch's and the thorns'
  return cap `dj` at what she owns.

**v8's numbers** (`metrics.ts`, `canopy-furniture.ts --check --rooms`; round 8's bar met):

| measure | HK | Silksong | Ori | Nine Sols | Canopy v7 | **Canopy v8** |
|---|---|---|---|---|---|---|
| enemies per box screen | 0.55 | 0.26 | 0.57 | 0.59 | 0.42 | **0.55** (52: the tunnel's warning and hall, the nest) |
| majors / minors | 17 / 4 | 8 / 41 | 23 / 11 | 16 / 13 | 23 / 39 | **23 / 51** (+15 glints on the tunnel's lines, -3 the fork's shelf) |
| hidden share | 0.35 | 0.22 | 0.18 | 0.26 | 0.34 | **0.27** |
| things per box screen | 0.28 | 0.17 | 0.80 | 0.42 | 1.33 | **1.48** |
| room density mean / median | 1.31 / 0.86 | 0.85 / 0.71 | 2.40 / 2.16 | 2.51 / 1.69 | 2.23 / 1.69 | **2.32 / 1.69** |
| spread (CV) | 1.10 | 0.96 | 0.59 | 1.08 | 0.84 | **0.89** |
| rooms at >= 4x the median | 4 | 2 | 0 | 3 | 1 | **2** (the Grove 9.8, the tunnel 7.0) |
| rooms under 0.5 a screen | 16 / 48 | 9 / 34 | 2 / 17 | 7 / 39 | 6 / 27 | **5 / 27** (the burrow is the nest) |
| hazard runs >= 640 (share) | 18 (71%) | 8 (55%) | 3 (34%) | 13 (71%) | 7 (76%) | **7 (78%)**, 10,831 px |
| one-ways | 0 | 0 | 11 | 143 | 32 | **36** |

Along the critical path (things a screen): the hatch 0.39, the hub 1.35, the trunk 3.71, the well 3.57, the limbs
2.53, the hub, **the fork 0.68**, the Grove 9.84, the Spire 2.53, the bower 2.10, the crown 0.42, the gap 4.34, the
hub, **the tunnel 7.03**, the den 2.11, the way out 2.44. (The references' "rooms at >= 4x the median" are from their
area files the same way.)

## v7: the level side of review round 6 (`reviews/canopy-r6.md`, 6/10)
Round 6's verdict: v6 met every number and the area got flatter: the furniture was one recipe stamped in every hall
(room density CV 0.41 against about 1.0 in HK, Silksong and Nine Sols, no quiet room, the thorns 20% in long runs),
leg 3's lampwing was a toll in a slot with a leg-long runback, the fling was in her hands and nowhere in the level,
the rewards were all the same glow. v7 takes the six [level] items; the render items (#2, #5, #8, #9) and the kin's
restyle are the render builder's. Same totals, new shape: furniture moved, not added.
- **#1, peaks and quiet.** `canopy-furniture.ts` now measures the spread the review measured (it reproduces its v6
  numbers exactly) and `--check` holds round 7's bar; v7 meets it (table below).
  - *Six quiet rooms* (under 0.5 things a screen): the hatch (its dark-edge pocket holds one pod), the crown (the
    glide learned in a calm room: no lampwing, strip or pod), the crawl (one juvenile in the winding dark), the cellar
    (one ant), the burrow (the deep's map alone, grown west, below), the hollow root (grown 480 down: a dark well with
    quick wings at its foot). The hub's clearing is stripped too (#10). The middle thinned: the nook, the ledge, the
    attic, the sky, the larder, the webs and the rot hall each keep their one find or fight and lose their hoard and
    tray.
  - *The peak*: the Grove's pit, 34 things in 3.6 screens (9.6 a screen, 5.7x the median): the wave, two low lamps,
    six pods, two root steps, an arc of six glints the fling and the big cap reach (#6). The busy middle: the gap's
    pod garden, the trunk's bed, the tunnel's west hall, the well.
  - *Thorns in composed runs* (76% of the length in runs of 640+; 21 strips in 10 rooms, v6 41 in 20): the tunnel's
    west hall 1,856 (a new hall, below), the way out's valley 1,344, the limbs 1,408 (v6's three trays joined under
    the gap and the second limb), the bower's hall 1,088 (one pit under two knuckles and the upper limb), the tunnel's
    pit 1,024, the gap's floor 944 (the fall is the cost: from the west wall to the drop to the fork, which moved to
    the floor's east end, by the shelf's foot), the trunk's tier 1 640 (under two knuckles; v6's tier 2 and tier 3
    trays gone, so nothing on the walk to the well's door). The short strips left are the climbs' (well, Elder, way
    out, Spire, kin) and the Grove's. 10,875 px in all (v6 12,000: within 10%).
  - *Pods in clusters* (29 stay 29): the gap's garden (four on knuckles over the run), the tunnel's (three on knuckles,
    two under root hangs over its run), the Grove's six; out of the quiet rooms.
  - What the proofs threw back: a knuckle by the trunk's top lip was a hop up to the top without the claws (the bed
    shortened to 640, two knuckles); the gap's pods hung under the roost were pogoed across to the far limb without
    wings, and a pod on a knuckle near the west wall is a step 44 px higher (the knuckles moved east of 2,816 and down).
- **#3, leg 3 as a choice, not a toll.**
  - *A mid rest and window* in the west wall at 1,536-1,920 x 1,536-1,856 (320 tall: the 384 the review asked let a
    kick across from the east face slide under the west face and back into the rest), a root lip into the chimney.
    Leg 3 is 3a (the landing to the rest, clean, up the east face and across into the rest) and 3b (the rest to the
    hollow: up the east face, across over the rest's opening, up the west face; `thorn-w3b` on the east face under the
    hollow, re-laid to 1,152-1,340 from `climbs.ts`). v6's `thorn-w3a` is gone (the rest took its face).
  - *The lampwing* at (2,112, 1,400), radius 140, 456 px over the rest's floor.
  - *The ambush wakes on a trigger* (`ambush`, 704-1,408 x 960-1,152, flag `cn-well-ambush`), not the claws: the
    arrival over the chimney's top is quiet. The second burrback moved off the block onto the floor west of it.
  - *A save at the top* (`p-hollow`, 1,856 x 1,152, between the block and the chimney's mouth, where 3b's west face
    tops out; 556 px from the nearer burrback's ground): a fade in the ambush costs the ambush. (A save stands on solid
    ground 128 wide: not on the root across the chimney's mouth.)
  - *`climbs.ts` with the creatures in* (`runClimb(..., { creatures: true })`, `--creatures`, `CREATURE_CLIMBS`,
    `restSafe`; in `canopy-climbs.test.ts`): the rest is safe (10 s on it with the lampwing in: no hit, from all three
    starts: at 456 px it never sees her there); the plain plan straight past it takes at most one hit from two starts
    of three at delays 6 and 10 (the third: 0 and 4 hits); hops with up cuts on the rest's lip draw it down and kill
    it, unhurt, from all three. The review wanted her to watch its dive from the rest: at its sight (260 px) it never
    dives at her there, so the choice is draw it and kill it, or climb past it. Leg 2's strip stays 84 tall (the
    review asked 160-200; the risk glints over it and the kick across at its foot leave 84 at a 64 px margin).
- **#4, five fling lines** (lamps lit in the proofs: every lock claim in a room with a lamp runs again with the lamps
  burning, `tools/solve/canopy.ts`; all hold):
  - *the trunk's tiers*: a lamp in the drop's shaft (1,184 x 800), a jump over tier 2's floor: flung up she is back
    in the wall's chamber and on to tier 1 (`t2 -> t1` was the claws' only); the hall's way out stays the claws';
  - *the limbs' high line*: a lamp a jump off the first limb's end (1,240 x 600), another a jump off the second (1,640
    x 450); flung up off the second she is in the niche over the second limb (three glints; the claws reach it too);
  - *the gap*: three lamps down from the shelf's lip over the run's east end (3,380 x 1,240, 3,240 x 1,600, 3,100 x
    1,920): flung west off the first into the roost's mouth (three glints now), or down the chain into the pod
    garden. (West of x 3,080 at 1,580 a chain carried a clawed player over to the far limb: the lamps sit 840+ px
    east of its lip.)
  - *the well's hollow*: a lamp over the ambush floor (1,400 x 880), a jump's reach: the throw-cut in the fight and
    the way up to the east shelf (1,792 x 704);
  - *the Grove*: `wick-a` and `wick-b` at 1,380 (220 over the pit floor; a test checks a jump from the floor puts each
    in fling reach).
  - And one old skip the lit proofs found: flung west off the fork's lamp over the face's top, a clawed player reached
    the glide shelf (the lamp moved east and up in the top's cave, 3,120 x 400).
- **#6, the Grove's arena is the pit.** Two root gates (`arena-w` 1,472-2,016, `arena-e` 2,496-3,840, both 64 tall
  under y 1,088) shut on `cn-grove-wave` with `pit-door` and open on `cn-grove-clear`: she fights in 1,472-3,840 x
  1,088-1,600 (the east floor and its gate out inside it) and cannot climb out to kite. A camera zone fits the arena
  while the wave runs (`fit`, `until: cn-grove-clear`). Beat 2's dangler hangs under the Grovemother's trunk (a gate
  does not tie a thread), the lampwing over the east floor. The proofs: in the pit with the wave on, the tiers, the
  crown, the seed, the keen hollow and the save are out of reach (with the lamps lit too); once clear, she climbs out
  without the claws (the lamps and the caps). The crown's seed now comes after the wave (it is over the arena's east
  gate). The release is render's (the gates draw as the existing root gates; they need their own drop and draw-back).
- **#7, rewards that matter.** Majors 35 -> 23 (the references 8-23): greats 18 -> 3 (`claw-prize`, the hub's wings
  shelf, the ledge after the boss), moon shards 3 -> 6 (two lights: the hub's high chamber, the Grove's pit wall, the
  kin's chamber join the well's niche, the Elder and the larder). The review's "greats 6" and "majors <= 23" cannot
  both hold with 2 abilities, 4 upgrades, 3 seeds, 5 maps and 6 shards (20). Glints 58 -> 39, hidden 47 -> 19, hidden
  share 0.34 (metrics.ts; the references 0.18-0.35). Pockets pay one thing: a shard, a map, a great or a pile (the
  fork's shelf, the galleries' nest, the roost, the limbs' niche: three each; the tunnel's west end: five, in the
  open; the rot cache: a pod). No trade: a clear spot by the hub's save (`place:trader`, 3,240 x 1,600) where a
  trader could stand, when Matt says yes to the sim work.
- **#10, the hub as the quiet place.** The clearing stripped (v6's four knuckles, three pods and thorn pit gone): the
  root floor, two low swellings, the save, the kin, the trader's spot; the hub is 1.35 things a screen (12: the
  lampoak's three sockets and the mouth's lamp, the two shown locks and their finds, the wings shelf, two knuckles, two
  pods). Not under 0.5: its sockets and locks are things. The moon placed over the clearing's frame from the save
  (view 1,180 x 200, r 120); the clearing's sky is open to the room's top, but render's backdrop covers the moon in
  every hub frame (a render item). **The notch is closed**: the tunnel and the burrow grew 3,520 west under the hub's
  west half (`TX`; their old content east of it, the links unchanged in world px). The tunnel's new west hall is its
  bramble run (1,856 in a shallow pit under three knuckles and two root hangs with pods) to a pile of five glints in
  the open at its west end; the burrow's west is mass.

## Measured (tools/reference/metrics.ts, against the references)

| metric | HK | Ori | Nine Sols | Canopy v2 | Canopy v3 | Canopy v4 | Canopy v5 | Canopy v6 | **Canopy v7** |
|---|---|---|---|---|---|---|---|---|---|
| rooms | 48 | 22 | 39 | 24 | 27 | 27 | 27 | 27 | **27** |
| screens | 329 | 88 | 172 | 60 | 83 | 83 | 83 | 87 (the hub 8.9) | **94** (the tunnel and burrow grown under the hub, the hollow root down) |
| rooms on the critical path | 25% | 77% | 72% | 58% | 52% | 52% (14) | 52% (14) | 52% (14) | **52%** (14) |
| solid share of the room boxes | 0.35 | 0.5 | (traced) | 0.43 | 0.51 | 0.51 | 0.51 | 0.49 | **0.52** |
| enemies per screen | 0.31 | 0.18 | 0.27 | 0.58 | 0.43 | 0.49 (41: the wave, the tunnel's ants) | 0.48 (40: the wave is 2 + 4, the landing lampwing gone) | 0.47 (41: a lampwing on the well's leg 3) | **0.42** (39: the crown's lampwing and a cellar ant gone) |
| enemy kinds | 30 | 9 | 11 | 6 | 9 | 9 (the path now meets the dangler too) | 9 | 9 | **9** |
| majors | 23 | 21 | 15 | 25 | 28 | 31 (three moon shards) | 31 | 35 (greats in the hub's chamber and shelf, the stone pocket, the kin chamber) | **23** (3 greats, 6 moon shards) |
| minor pickups | 6 | 10 | 8 | 193 | 82 | 58 | 58 | 58 (pods paid out of the hoards) | **39** (19 hidden; hidden share 0.34) |
| saves | 8 | 2 | 5 | 5 | 4 | 5 (the bower) | 6 (the well's landing) | 7 (the Grove's entry; the well's up on the mouth) | **8** (the well's hollow) |
| hazard runs | 0 | 6 | 5 | 29 | 25 | 37 (the chimneys' strips) | 25 (one strip a leg-half) | 41 (12,000 px) | **21** (10,875 px, 76% in runs of 640+) |
| screens with nothing in them | 65% | 63% | 66% | 35% | 57% | 53% | 54% | 40% (29 pods) | **46%** |
| longest run of empty screens | 15 | 6 | 9 | 5 | 8 | 8 | 8 | 5 | **5** |

The furniture against the four exact references (`tools/levels/canopy-furniture.ts`; air = room boxes minus solids,
in hero heights: Silksong x0.58, Nine Sols x0.8, HK and Ori as a screen; the Nine Sols props are its 148 from the
README, not in its area.json):

| measure | HK | Silksong | Nine Sols | Ori | Canopy v5 | Canopy v6 | **Canopy v7** |
|---|---|---|---|---|---|---|---|
| air screens (hero heights) | 132 | 44 | 56 | 48 | 41 | 44 | **45** |
| thorn / hazard strips | 93 | 127 | 37 | 54 | 25 | 41 | **21** |
| hazard length, px | 45,000 | 67,700 | 26,000 | 15,600 | 6,800 | 12,000 | **10,875** |
| hazard px per air screen | 340 | 478-877 | 330-374 | 328 | 166 | 272 | **240** |
| things to hit (breakables + pods) | 90 | 9 | 21 (+148 props) | 42 | 18 | 45 (29 pods) | **45** (29 pods) |
| one-way ledges | 0 | 0 | 143 | 11 | 8 | 33 | **32** |
| hit + ledges per air screen | 0.68 | 0.2 | 1.9 (3.6 with props) | 1.11 | 0.6 | 1.77 | **1.70** |

**The spread** (review r6 #1, `canopy-furniture.ts --check --rooms`; things = enemies, pickups, pods, rotten bark,
lamps, thorn strips and one-ways in a room, per box screen of it; long runs hero-scaled):

| measure | HK | Silksong | Nine Sols | Ori | Canopy v6 | **Canopy v7** | round 7's bar |
|---|---|---|---|---|---|---|---|
| room density, mean / median | 1.31 / 0.86 | 0.85 / 0.71 | 2.51 / 1.69 | 2.40 / 2.16 | 3.12 / 2.95 | **2.23 / 1.69** | |
| spread across rooms (CV) | 1.10 | 0.96 | 1.08 | 0.59 | 0.41 | **0.84** | >= 0.8 |
| quietest tenth (p10) | 0 | 0.13 | 0 | 0.40 | 1.41 | **0.34** | |
| rooms under 0.5 a screen | 16 / 48 | 9 / 34 | 7 / 39 | 2 / 17 | 0 / 27 | **6 / 27** | >= 6 |
| busiest room / median | 8.9 | 5.4 | 7.7 | 2.6 | 2.5 | **5.7** (the Grove, 9.6) | >= 5 |
| hazard runs >= 640 (share of length) | 18 (71%) | 8 (55%) | 13 (71%) | 3 (34%) | 2 (20%) | **7 (76%)** | >= 50% |
| hazard runs <= 256 | 62 | 104 | 16 | 34 | 28 | **13** | |
| rooms with any hazard | 16 / 48 | 20 / 34 | 16 / 39 | 11 / 17 | 20 / 27 | **10 / 27** | <= 14 |

Room by room (v7): the Grove 9.6; the gap 4.3; the trunk 3.7; the tunnel and the well 3.6; the limbs and the fork 3.4;
the galleries, the Elder, the bower, the Spire and the way out 2.4-2.8; the rot hall, the webs, the larder, the attic
and the sky 1.7; the den 1.4; the hub 1.35; the nook and the ledge 1.1; the crawl, the hollow root, the crown, the
cellar, the burrow and the hatch 0.2-0.45.

Rooms all at least 2560 x 1440; the world's rects share edges (no holes between rooms; v7 closed the notch under the
hub's west half). Secrets: the hub's bank wall (heart moth-stone), the giant's rot panel (the rot branch), the
Elder's plug, the limbs' niche, rot's two walls, the crawl's roof niche, the web room's niche, the fork's stone
pocket and its cellar panel (the cellar branch), the galleries' nest wall, the Grove's pit wall, the Spire's nook
and its foot wall (the hollow root), the bower's kin wall, the gap's roost (the sky room), the burrow panel, the way
out's ledge wall. Majors: two moonDrops (the two branch ends), five moth-stones, the keen blade, long breath, night
eyes, quick wings, three seeds, the two abilities.

## Proven (tools/solve/canopy.ts: the explorer in the real sim, ~7 min with a room a process, 8 at once)
v8: 74 claims, 96 runs (every lock claim in a room with a lamp again lit), all hold (~6 min, a room a process, 8 at
once). New: the first fling (from the crown's east limb no jump reaches the droop's limb, `lampKey`: not re-run
lit; lit, the drop and the pocket); the gap's chain with the first lamp moved (the far limb shut lit); the tunnel's
den warning (the lid holds from the glide's landing, the cellar's shortcut open; with `cn-tunnel-clear` the den);
the nest both ways (down the hall's shaft without the claws, back up with them, never without); the fork without its
shelf and stone. `canopy-climbs.test.ts`: 15 climbs at delays 0 / 6 / 10 / 16 (`well-2-risk` new), leg 3b with its
lampwing at most two hits from every start at every delay, `thorn-w2` >= 160. `canopy-r8.test.ts`: the ambushes'
arrivals, the patch pass and re-form, the first fling, the gap's chain.

v7: 69 claims, 92 runs: every lock claim in a room with a lamp runs a second time with the lamps burning (flings,
chains, eight aims), and all hold. New: the five fling lines (the trunk's tier 2 back to tier 1 without the claws,
never out of the hall; the limbs' niche without the claws off the two lamps; the gap's roost and pod garden off the
shelf's chain, never the far limb; the well's hollow lamp to the east shelf; the Grove cleared, out of the pit without
the claws); the Grove's arena (in the pit with the wave on: no tiers, no crown, no seed, no keen hollow, no save,
with the lamps lit too; the seed after the wave); the well's mid rest, the ambush trigger and `p-hollow`; the hub's
shard chamber and the trader's spot; the tunnel's west hall both ways and its pile. What the lit proofs found: the
gap's first chain (west of x 3,080) and the fork's lamp over the face (to the glide shelf, an old skip), both moved.
`canopy-climbs.test.ts`: 14 climbs (the well's leg 3 is 3a and 3b), and with the creatures in: the mid rest is safe,
the plain plan past the lampwing at most one hit from two starts of three, the up-cut plan kills it unhurt.
`canopy-arena.test.ts`: the root gates shut with the door, and both pit lamps are in a jump's fling reach.

v6: 63 claims hold (the full run, then the rooms changed after it: the trunk, galleries, gap, hub). New: the well's bottom a pit with the claws in it (the rot hall's door and the Elder's shut from
the well), its save and stone up on the mouth; the Grove's arena (in the pit with the wave on, neither door, the save
outside the west one); the way out's rests E and W, no glide from the way in skipping leg 1, the plug holding without
a cut; the hub's chamber and the vent only with the claws, its shelf only with wings; the limbs' vent both ways;
the tunnel's tube the clawed way west and never the way east; the hatch's pocket. `canopy-climbs.test.ts`: 13
climbs (the way out now three legs), the two risk plans at 0 / 6 with a 32 px margin, every fail plan on its strip
or slick face. `canopy-arena.test.ts`: the door shuts on the wave and a fade re-arms it.

r5: the same claims with the rot branch shut without the claws (and reached from tier 3 with them), the Elder's
door shut from the well, the well landing's save reached; all hold (~12 min). Plus the fairness test
(`tests/unit/canopy-climbs.test.ts`, in `npm run test`): 12 climbs (the well's three legs, the way out's two, the
fork's face, the Spire's foot and neck, the Elder's three legs, the kin) pass at kick delays 0 / 6 / 10 from 3-5
start x with every strip grown 64 px; the ones with a strip fail on one face; a thorn returns her to her rest.
55 claims hold: every exit and find of every room is reachable with the kit stated, and the locks hold without
their key (as v3, plus r4's: the chimneys only by kicks across (the explorer's `zig` macros: no single face is a
ladder), the Elder's and the way out's plugs cut from under them, the hub's clump only with the claws, the giant's
seed only through its wall (`cuts: false`), the Grove's gate only once the pit is clear, the den's balcony reaching
the arena floor and not climbable back (`place:` claims), the giant's tier 3 back up with the claws). r4 counts bark
cuts in the search's keys (`barkHp`), which made it ~5x slower. The world check passes (claws, then glide).

## Played by the human-like bots (v8: playtest-reports/canopy-r8)
On 9643301 (25 min, give up after 180 s; for bugs and softlocks only):

| bot | out of the hatch | claws at | furthest | where it went |
|---|---|---|---|---|
| casual | 0:57 (3 catches, then the fling) | 2:23 | leg 2 | well <-> trunk loops for 22 min; leg 2's strip 13 hits |
| average | 0:30 | 1:26 | **the hollow at 4:17**, the ambush cleared (all three), leg 3 | lost in the well at 14:40 (the hollow and the chimney: never found the shelf to the limbs) |
| skilled | 0:32 | 1:24 | **the hollow at 8:04**, the ambush cleared | lost in the well at 13:27, the same |

What the runs found, fixed on the way: the hands never pressed the Lamp key (`ActionBit.lamp` was missing from the
motor's keys in human.ts: the lamp lines planned flings the keyboard never sent), and **the first lamp could be cut
down for good** (the bots' old lamp-cut lines snuffed it: no lamp, no way across, a softlock): it relights 90 frames
after it goes out. With both, all three fling across in the first minute. The well's ambush arrived and was fought
and cleared by two bots (4 and 3 hits in it). Not reached: the limbs (v7's skilled bot left by them at 16:39); the
bots wander the hollow after the ambush. A plain jump from the block to the east shelf is the way (the proofs).

### v7 (playtest-reports/canopy-r7)
The start command on 9f0d77a (25 min, give up after 180 s; for bugs and softlocks only, never a difficulty bar):

| bot | claws at | furthest | where it went |
|---|---|---|---|
| casual | 1:47 | **the hollow at 8:36**, the ambush, the chimney's lampwing killed | well <-> trunk loops; leg 2's strip 15 hits; two fades in the ambush re-formed it on the mouth (it never rested at `p-hollow`) |
| average | 1:23 | **the hollow at 23:12** | well <-> trunk loops; leg 2's strip 11 hits |
| skilled | 2:06 | **the hollow at 8:55**, the ambush, out to the limbs (16:39) | the limbs' bed 10 hits (three fades missing the jump between the limbs), back to the well; later fades re-formed at `p-hollow` |

No softlock, no stuck spot. Against r6: all three bots up leg 3 to the hollow (r6: none, all stopped at 2,070-2,170
under v6's lampwing), the first to fight the ambush and to leave by the limbs. The casual bot never stood still on the hollow's
save, so its ambush fades cost legs 2 and 3 again: a patch rests her only when she stands in it (or presses up).

### v6 (playtest-reports/canopy-r6, canopy-r6-fork)
The same commands on 82ae204 (25 min, give up after 180 s without progress; then from the fork with the claws):

| bot | claws at | on the landing at | where it stopped |
|---|---|---|---|
| casual | 1:58 | 3:53 | up to 2,067 in the chimney (leg 3), then well <-> trunk loops; thorn-t3 14 hits (r5's floor bed by the well's door) |
| average | 1:27 | 1:36 | up to 2,174, then trunk <-> hub <-> well loops; leg 2's east strip 9 hits |
| skilled | 2:21 | 2:29 | up to 2,128, then well <-> trunk loops; leg 2's east strip 8 hits |
| fork: casual | (given) | 5:04 | went west (hub, trunk, well), never tried the fork's face |
| fork: average | (given) | - | the fork for 9 min (its thorn pit 5 hits) |
| fork: skilled | (given) | 15:24 | **up the face into the Grove**: the door shut behind it, beat 1 cleared (both burrbacks), beat 2 started (a juvenile killed), a thorn on the east floor, out by the re-armed door; then west |

Against r5: **the well's bottom works** (review's check: two of three start bots on the landing within 4 min; all
three are, at 1:36-3:53, where r5 had them looping the rot hall from the bottom; no bot enters the rot branch now).
The claws come 25-70 s later than r5's 1:02 (the hub is 3,520 px wider). Leg 3 is still where they stop (now with
the lampwing; they reach 2,070-2,170 and turn back), and the leg 2 strip still takes 5-9 hits a run even with the
strip-reading candidate (their chimney lines kick-glide across from the east face as often as they take the west).
The arena held: the one bot that entered fought both beats behind a shut door, and a fade opened it again. One bot
of three climbed the fork's face (r5: two): the fork runs vary with the hub's new size (casual walked west).

### r5 (playtest-reports/canopy-r5, canopy-r5-fork)
Same commands as r4 on 871a37b (from the start; then from the fork with the claws):

| bot | rooms | claws at | where it stopped |
|---|---|---|---|
| casual | 5 / 27 | 1:02 | well, rot and trunk loops (lost 16 min); leg 2's east strip 0-7 hits |
| average | 5 / 27 | 1:02 | the same; leg 2's east strip 6 hits |
| skilled | 5 / 27 | 1:13 | the same; reached the landing in an earlier run, never leg 3 |
| fork: casual | 6 | (given) | **up the claw face**, cleared both beats of the Grove wave (12 kills), then back to the fork and the cellar branch |
| fork: average | 5 | (given) | fork -> hub -> trunk -> well loops (never tried the face) |
| fork: skilled | 6 | (given) | **up the claw face**, beat 1 (one burrback left), then the cellar branch |

Against r4: the claws come ~1:50 sooner (no rot panel to fall down, no tier-2 trap), no bot is swallowed by the rot
branch before the claws, and two of three fork bots climb the fork's face (r4: none in 25 min). Still not reached:
the well's leg 3 and the hollow (the bots' chimney lines climb the east face of leg 2 into its strip: they choose
the face from the map, not from the thorns), the Spire, anything past it. The bots' climb lines are
`zigLine` / `climbLine` with kick-glides across at fixed heights; a person reads the strips.

### r4 (playtest-reports/canopy-r4, canopy-r4-fork)
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

## What is still weak (for round 10)
- **No person has played it.** Matt's run from the hatch to the Grove is still the gate.
- **Route peaks at 3x, not 4x.** The middle (the trunk, the well's gallery and mouth, the bower and the gap) is 3-6
  things a screen along the line; 4x needs it thinner, a density call.
- **The bots don't leave the hollow.** The door is two jumps and in frame, but their explorer chases the shard's
  shelf and the well's bottom; a person's read of it is unmeasured.
- **The gap's hanging root** is a stark black column across the area's best still until render dresses it.

## What was weak after v8 (round 9 answered most)
- **No person has played it.** The first ten minutes now teach the fling, arrive instead of spawning and keep her save;
  Matt's run from the hatch to the Grove is still the evidence nothing else gives.
- **The tunnel's peak is counted, not felt.** 59 things in 8.4 screens, 15 of them glints on lines (the run's arc,
  the glide's line): they buy nothing until the trade is decided. The den's warning is a small wave on a 384 px floor:
  untested with a person, and the bots rarely get that far.
- **The gap's chain is three lamps only from the shelf's lip**: the review's spot for the second lamp opens the glide's
  lock, so the first moved under the lip; a person who jumps off the shelf (not walks) meets the second lamp first.
- **The ambushes' arrivals are drawn as a slide** until render draws them (the creature moves in its own mode from its
  arrive point: dust, roots parting, a drop are render's). The well's ambush has no gates (no lock-in: she can run
  for the shelf); `rearm` replays it after a fade or a new entry.
- **Quiet rooms 5** (r7's bar was 6): the burrow is the nest now, a place on the tunnel's loop. The 1.8-screen dead
  ends (the nook, the ledge) cannot be quiet with one find in them.
- **Climb fairness at 16 came from three plan changes** (well-3b's far start jumps 18 px nearer the lip, leg 3a from
  the lip's middle, spire-1 crossing at 900) as well as the faces: a person's habit varies more than the plans do.
- **The den's camping** was fixed by making the shelves one-ways, not by finding why the old burrback sat in `recover`
  for 90 s (not reproduced headless: on the shelf it rears and slams within 3 s).

## What was weak after v7 (round 8 answered most)
- **No person has played it.** Round 7's evidence was to be Matt's run from the hatch to the Grove; the numbers now
  meet the review's shape bar, which is still not fun measured.
- **The hub is not quiet by the measure** (1.35 a screen): its sockets, shown locks and their finds are things. The
  clearing is empty, but the moon is not in its frame (render's backdrop covers the open sky).
- **The watchable dive was not built**: the leg-3b lampwing does not see her on the rest (260 px sight), so the choice
  is draw it from the lip and kill it, or climb past it; "watch it dive, go while it climbs" needs it lower or a
  wider sight, which crowds the rest.
- **Leg 2's strip is still 84 px** (the risk glints over it and the kick across at its foot fix both ends).
- **Rewards: 3 greats, not 6**, to hold majors at 23; glints 58 -> 39 with nothing to buy (the trade is Matt's call);
  the trader's spot is empty.
- **The arena gates have no art of their own** (they draw as root gates and pop: a drop and a draw-back are render's).
- **The tunnel's west hall** is long and plain past its run (a dead end paying a pile); the burrow's 3,520 px west of
  its cave are solid mass (a closed notch, not a place).

## What was weak after v6 (round 7 answered most)
- **Leg 3 stops the bots** (2,070-2,170 of 2,432 -> 1,152): the strips and now the lampwing; no bot has reached the
  hollow in two rounds. A person's run is the evidence that matters; the bot's chimney lines still pick a face from
  the map more often than from the strips.
- **The hub's west half under the map**: widening the hub west left a notch 3,520 wide under it (between the
  trunk / rot / crawl and the tunnel / burrow), open at the bottom: the one hole in the bands.
- **The empty share fell to 40%** (29 pods; the review's check said 50-60%; Ori is 33%, the others 57-67%).
- **The Grove's lock-in is the whole room**: the west door is at the entry corridor, so she can still climb the
  Grovemother and roam the tiers mid-wave; the arena is the room, not the pit.
- **The fork bots** went west or stayed (1 of 3 up the face, r5: 2 of 3).
- **Render, not done here**: the arena door has no drop animation of its own (`gateShut` is emitted, render pops the
  gate in), the high chamber's cover and the hatch pocket's look, the knuckles' shelf look.

## What was weak after v5 (round 6 answered most)
- **The bots still stop in the west**: they take the claws in a minute and climb leg 1, but loop well, rot and trunk;
  their chimney lines pick a face by the map, not by the thorns, so leg 2's east strip turns them back. Teaching
  `lines.ts` to read strips (climb the clean face, cross above the strip) is the next bot step; a human run (Matt)
  to the Grove is the better evidence.
- **The way out is fair but plain**: a hop to a rest and one face cut through a plug. It is no longer the final
  exam the review asked for; the Elder (optional) is the hardest climb now, and it is moderate.
- **The Grove's gate**: a bot that leaves one burrback of beat 1 alive never sees beat 2 or an open gate; nothing on
  screen says "clear the pit". The east floor's way to the gate is long and the bots turned back from it.
- **The den**: the shelves are higher and wider, but there is still no claw face under them (a face to the floor would
  wall the arena), and the reveal is a root shoulder, not a corridor.
- **Render items from r4 untouched by this pass** (the props, the slabs, looks by region, the snuff, the vista).

### Weak after v4 (round 5 answered most)
- **The bots still stop at a third**: they take the claws and loop the west (well, rot, Elder); the human bot's
  chimney line works in probes but the planner gives it few tries, and a thorn in the chimney can return a climber
  who never stood on the mouth's floor to the well's bottom (1,700 px down): a person would hate that too.
- **One phase only**: a chimney's alternate thorns suit one first face (the well: jump at the west face first). Kicks
  across and kicks up one face rise nearly the same (222 vs 235 px), so the strips must pick the phase.
- **The east half is still unplayed by any bot** (the fork's claw face was never tried in 20 min from the fork).
- **The den** has no centre hump (a burrback cannot step: it would wall the boss in half) and no asleep reveal.
- **The Grove's wave** is untested by a bot; the gate needs every floor creature dead, flyers spared.
