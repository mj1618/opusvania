# Rooms, abilities, the hatching, per-room art (tech stage 0, 2026-10-17)

The game is built room by room (docs/design/tech.md). The Grove is the test bed `test-grove`; scene 1 is `wood-hatch`.

## Files and registry
- `content/rooms/<id>.json`: one room = the old scene format plus the fields below. `content/world.json`: `start`
  (the boot room), `rooms` (the real game's, placed in world px: exits link where openings meet, memory/world.md)
  and `tests` (outside the world: `test-grove`, `lab-lamps`). A new room = its file + one import line in `FILES`
  (`src/scene/index.ts`) + world.json. Patches, glades, doors, shortcuts, one-way exits, routes: memory/world.md.
- `src/scene/index.ts`: `parseScene` (Zod + placement rules, now also exits / catches / shot stops), `ROOMS`,
  `ROOM_IDS`, `DEFAULT_ROOM`, `getRoom(id)`, `GROVE` (= test-grove: the 26 Grove test files still import it),
  `WOOD_HATCH`. `src/scene/room.ts`: the `Room` type = sim `Scene` + render-only `title, region, art, marks, shots`.
  Every extra field is optional, so a flat test scene is a Room; `RenderContext.scene` / `SimView.scene` are Rooms.
- Boot: no `?room` = the game (Continue from the save, memory/save.md); `?room=<id>` = a test boot. The panel's Room
  list and `__game.goto(id)` / `room(id)` move her there in place, the save kept. Tools: `--room` (default wood-hatch).

## Sim fields (all optional; absent = the old behaviour)
| field | what |
|---|---|
| `abilities: AbilityId[]` | the starting kit (`src/sim/abilities.ts`: `glide, wallJump, doubleJump, dash`). Absent = all (test scenes, the grove) |
| `exits: [{id, edge: n/s/e/w, from, to, at?, oneWay?}]` | an open span of an edge (`at`: the line across the edge where the crossing counts, default the edge) (no wall there: `solidAt` / `kickableAt` honour it). Box centre past the edge inside the span: `roomExit`, then she enters the neighbour found from world placement (memory/world.md). With no neighbour: held `tuning.room.exitFrames` (36) with no input, then the room restarts (`roomEnter` + `spawn`; `save` and the frame count go on) |
| `catches: [{id, x, y, w, h, glideAssist?, back?}]` | a fall into the rect costs nothing: `fallCatch`, held `catchFrames` (18), then `fallReturn` + `spawn` at her last safe ground, moved `returnInset` (72) px in from that top's end (the lip she fell from loops a hold-right player otherwise), or at the zone's `back` point when it names one |
| `lures: [{id, kind, x, y, spin?}]` | the story's lamps (memory/lures.md) |
| `hatch: {x, y}` | she starts shut in the cocoon at (x, y) (render); her body stands at `spawn`, no input moves her. Presses of ANY button (a bit set that was not the step before) after `tuning.hatch.listenFrom` (150, the fade-up) stir it (`hatchStir`); the 3rd breaks it (`hatch`); with no input it stirs on its own every 90 frames from 300 and breaks at 720 (`auto`). The breaking press is not also a jump. **`placePlayer` (teleport) ends it silently** |
State v22 (memory/save.md): `room`, `save` (abilities, snuffed, moths, taken, flags, opened, visited, seen, crossed, patch, time), `exit` (a `TransitState`), `caught`, `hatch`, `rest`. `resolveParams(t, abilities)` turns off what she does not own:
glide; wall slide AND wall kick (`P.wallJump`, checked in `wallInRange`); double jump (`doubleJumps 0`); dash (`P.dash`,
in `canDash`). Run, variable jump, fast fall, the blade and pogo stay. The Game harness keeps a granted kit through
restarts (`Game.setAbilities`, `?abilities=`).

## wood-hatch (round 3, 2026-10-17): rolling stretches on trees
Round 2 review (docs/design/scenes/reviews/01-round-2.md, problems 1-2): planks two rounds running because the walk
was flat in the sim. Now every stretch is a run of 48-128 px rects whose tops roll (steps <= 12 px, the sim's rolling
ground runs over them: movement-controller.md "Rolling ground"). Generated from control points (scratch script, the
stretch table below is the source); a test checks widths, abutting, steps <= 12 and a roll >= 8 per stretch.
| stretch | x | tops (roll) | parent (`from`) | end |
|---|---|---|---|---|
| S1 | 224-1504 | 1024 -> 1030 (flat +-2 under the cocoons, 430-1100), then **a rise of 48 px rects 1120-1504 to 954** | tree `west` (230, 1070) | burl: S2 abuts 10 higher (it was a 61 px step, a wall: first-timers' `R120` from the cocoon stood at 1484, "a small step blocked my walk"; `hatch-walk.test.ts` checks every abutting step <= 12) |
| S2 | 1504-2048 | 938-960 | S1 | fork: gap A 256, S3 ~96 higher |
| S3 | 2304-2720 | 854-872 | S2 | snap: gap 160 to another tree's limb, 128 higher |
| S4 | 2880-3296 | 729-740 (the crown) | tree `crown` (3262, 770), grows west | trunk: its root is the crown tree |
| S5 | 3424-4032 | 890-914 | tree `crown` (3458, 930) | fork: gap B 256, down ~64 |
| S6 | 4288-4608 | 968-980 | S5 | knee: S7 abuts ~96 lower |
| S7 | 4608-5056 | 1076-1088 | S6 | snap: gap C 192 (the `droop` tree), down ~96 |
| S8 | 5248-5760 | 1176-1196 | tree `droop` (5236, 1220) | fork: gap D 128, down ~128 |
| S9 | 5888-6112 | 1316-1332 | S8 | tip: the exit |
Trees (`marks.trees`, centre x / width / top..bottom): `west` 112 / 224 / -500..2816, the only solid; `crown` 3360 / 200 /
-500..2816 (the gap between S4 and S5 is this trunk: she drops past it); `droop` 5152 / 170 / 260..2816. All `plane: 'walk'`.
`marks.farBranch`: no collision now, a polyline for a back layer, (4930, 536) -> (7700, 470), width 56; `promise` 3296..4930, y 736.
Room 7424 x 2816. Exit `drop`: the south edge 6144-7424, **`at` 1790** (fires while she is still in the frame), `oneWay`: it leads into wood-chase (she lands on bough A).
Catch `below`: x 224-6144, y 1600-2816. A caught fall returns her `returnInset` in from the end of the whole rolling top.
- **Rules learned for paintable joins:** abutting steps only for small changes (a +64 burl, a -96 knee); bigger height
  changes go across a gap. Abutting +96 / +128 / -192 steps painted as square boxes. Rolling tops: the painter must
  group rects by `marks.stretches` (until it does, every rect join reads as a burl with struts: round 3's first shots).
- **The room may not be wider than ~7450** (with the wood's far plans): far0 must bake as ONE tile (coverage x 0.62
  <= 2048 px), or far.ts cannot build the far pair pass, the opaque far composite hides the sky and **the moon
  vanishes** (seen at 8192). Guarded in `rooms.test.ts`. `art.anchorX` 2560 keeps the backdrop lined up.
- **The end must be ~1300 px short of the east edge** for the fall to stay mid-frame (she drifts ~400 px east
  before the fade is black; the camera's east clamp is width - 960 on 16:9). So the route was shortened ~480 px.
- Timing: the naive bot takes **10.2 s from the hatch to the exit**, no catches (13.0 s with a 2.5 s look at the
  swarm); a player who looks: ~15-20 s. Leaving the branch to black: ~1.0 s walking off, ~1.15 s jumping off.
- S1 rolls west (1026 -> 1010 -> 1022 over 224-520) and east (1032 dip at 1150, 1004 rise at 1420) of the cocoon
  section (432-1072 stays 1022-1024 for the hang points). Marks unchanged in meaning: cocoon hang points on S1's
  underside, Tatter (1210, 1031: in the dip), swarm through the moon (1420, 544), camera hints vista / swarm / promise (4110, 636) / drop (6300, 1700).

## The wood, area 1 in greybox (2026-10-18: the director's redesign, docs/design/regions/wood-area1-director.md)
Spec: wood.md A7 (rewritten from the redesign). Rooms R2-R10 and the hub are generated from one script per round
(a Python dict per room; hand edits are fine): keep the camera agent's tuning keys and staging's `marks.stage` /
`marks.tatter` when you edit. Every area-1 room carries `marks.stage.oak` (room-local; the trunk at world x 30336,
from the hub floor y 10048 up to ~4700). Labels off (`art.labels: false`). Tests: tests/unit/wood-rooms.test.ts.
Cut: R14 `wood-caps` and the hub's cap climb, R11 `wood-climb` (merged into R7b `wood-heart`, the second builder's),
the seed-cases, the lantern, the thorn branch, the alcove well and its lid, W-hummock, R6's CP bark wall, the canopy
line (to area 2). `wood-lantern` is now `wood-silk`.
| room | world x, y | size | what is in it |
|---|---|---|---|
| R2 `wood-chase` | 5760, 2816 | 6400x1920 | the fallen trunk, two real drops, V2 lookout; trigger `vista` (hold 150) |
| R3 `wood-wicks` | 11264, 4736 | 3840x2176 | W1 (1280, 720) catches a jump from L; the throw lands on M (1408-1920, y960) or back on L; the dip floor 1312 (352 deep) runs east under M to the column 1920-2048 up onto N (1152); knob 1856-1920, W2 (1944, 896); W-hi3 (1530, 420) by the hanging trunk |
| R4 `wood-burrow` | 15104, 4608 | 4480x1792 | `burr-juv` (juvenileBurrback) under `wick-door`; `burr-first` (windup 32) under W3; `wick-gap` (2990, 920) on the jump's path off the root step: thrown right onto F3; dark floor 1472, tunnel under F3, hatch at 3904; `bark-hole` floor over the hole (full jump, cut ~80 over it: each hit bounces -15.5, the third breaks); W-hi4 (3820, 430) by shelf H |
| R5 `wood-glade` | 18944, 6400 | 2880x2504 | the alcove's root rungs (1216-1312: 1920, 1792, a hatch at 1664) |
| R6 `wood-glidewalk` | 21824, 8064 | 5760x2368 | gaps 1-2 as before; `wick-bend` (4150, 1440) over gap 3; `wick-ledge` (4880, 1800) with `burr-ledge` on T4's landing; bark floor pocket only |
| R7 `wood-hollow`, **the oak** | 27584, 6208 | 3840x4208 | **one room since round 3** (the hub + the old R7b `wood-heart`, retired): the hollow (floor 3840, 368 of ground under it, doors W/E at floor level, P3 1280, glimpse trigger hold 180, `stone-oak` 1800, `sign-trunk` 2300, Tatter 2700, the root mesh 2560-2944 `noDrop: "wood-climbout"` over exit `climb`), the trunk and the crown (exit `canopy` to the stub): see "The oak" below |
| R8 `wood-hawkers` | 31424, 9024 | 3840x1392 | (shortened 1600 from the top so R7b fits above it; all y below are the new local ones) hawker A at W7 (1920, 520) over the hummocks (tops 832); the throw gap: near ledge to 2560 (1024), a dark pit 2560-3008 (floor 1248, **no thorns**: a miss is a hop back), far ledge 3008-3456 at 704 (320 up: only the throw), `wick-throw` (2700, 730) + `hawk-throw`; tunnel 2304-3712 (y 1264-1360), hatches at 2304 and 3600; `hollow-wings` behind `bark-hollow`; step 3456 y864 back up onto the far ledge; P-dark 3530 |
| R9 `wood-silk` | 35264, 7424 | 3840x2992 | floor 2624; knob 760 + W-s1 + `dang-s1`; W-s2 (1400, 2380) throws up-right onto the root shelf 1600-2400 at 2304 past `dang-s2`; dip 1824-2176 (2880) with root steps; knob 2780 + W-s3 with `burr-silk` and `dang-s3` (one snuff, both off); `sign-silk` 3650; `bark-panel` floor 3200-3456 -> R10 `shaft`; postgame W-dj on a hung ledge |
| R10 `wood-well` | 27584, 10416 | 11264x2240 | west hall (the drowned-roots stub); climb-out 2560-2944 with a top step; glade 2 2560-3264 under the mesh, P4 3136; gate 3520; pit 3584-5632 (zone `pit` frames the gate); `window` trigger (hold 120) + zone on L4; P-chute (6300, 1216) = `reform`; the stair L4..L0, two lit pockets (`wick-pocket`/`dang-pocket` over L3, `wick-chute`/`dang-chute` over L2); `wick-pogo` (9640, 760) under L1's lip with a root ceiling over L1's west end (no jump there) |
Measured: R3 throw back west lands on L; R4 gap throw onto F3 from 0/40/80 px back; R8 up-right throw clears
the thorns to the far ledge; R9 up-right throw lands on the shelf; R10 pogo-wick cut 2-6 frames after walking off:
snuff, bounce, L2.
- **Round 3 (2026-10-18, reviews/area1-plan-r3.md):** R1 has a ledge 192 under the trunk gap's far lip (2736-2848,
  y 935: not abutting, so not a wall). R3 moved its dip, W1, M, W2, the knot and the hanging trunk 400 east: she
  lands 500+ px outside W1's field (the shaft wall now reaches y 860), one camera zone `lesson` frames the catch, the
  stragglers circle W2, the dip is a retry (a root rung back to L, no tunnel), and M steps straight down onto N (no
  hole). R4: the juvenile alone (no lamp) at 850-1150; W3 over a widened root step (2432-2816) at (2560, 1000), a
  standing up-cut, its pull 320 clear of the patrol; zone `gap` frames the throw. R6 grew to 7808 (everything east of
  it moved 2048 east in world.json: the oak to x 29632, the clearing 33472, the silk hall 37312, the roots 29632, the canopy stub 33472): T4 4672-5504 (the beetle 300+ past gap 3's lip), the lamp chain C1 (5818, 1640)
  -> C2 (6718, 1765) over a chasm with a free catch, T5 at the door; the chain's second throw is up-right; a root lip at T4's far edge turns walk-offs into jumps, and the chasm's floor is the dark way (a root step up to T5). R8: the
  pit under the throw is the tunnel's mouth (no floor, no thorns; the west hatch is gone), zone `throw`, hawker B `orbit: wick-throw`. R10: L1 runs
  to L0 (a step), a root mass over L1 (9688-10272, to the room top) so no jump skips the pogo-wick; narrow lit landings
  L2 (8448-9088) and L3 (7296-7680); the window holds 180 and frames the old burrback close; escape ledges on both pit
  walls (3584 and 5504, y 1920). R5's chasm catch has `glideAssist: 2`.
- **Round 4 (2026-10-18, reviews/area1-video-r2.md, area1-firsttimer-r4.md):** R8's far ledge is 224 over the
  near ledge (top 800, 3008-3456): a beat free aimed right or up-right lands on its top (3115-3430), unaimed drops
  her back on the near ledge; a miss lands in the pit (floor 1248) with a root step (2560-2720 @1136) back up: a
  retry ramp. The tunnel is not the pit any more: its door is a root hatch in the near ledge (2208-2368, 160 wide
  for a 40 px body; down + jump, one drop to 1360), in frame of zone `throw`; `stage.tatters` walks Tatter 260 ahead
  of her over the hummocks to it (`vanish`). The tunnel's way up is an open shaft (3520-3712: a one-way step at
  1200, the floor mesh at 1024; P-dark moved to 3776). R10's stair: the pogo-wick hangs under
  L1's lip (9684, 780: a walk-off drops her into its pull), L2 8448-9216 @896, L3 7488-7872 @1040, a third dark
  landing L3b 6528-6976 @1152, L4 5760-6144 @1216; root curtains 88 over each landing's east part stop glides (no
  landing skipped); every gap is a jump or glide from its open lip with every lamp out. R9's burr-silk is fenced
  east of the flame (3054-3186), clear of the knob's landing (no R9 deaths since; still 2-4 hits a run: the panel
  is past it). A catch zone may name `back: {x, y}`: the glade's chasm returns her to the lip's top at 1100.
- **Round 4b (creatures r4's asks):** R8's hawk-first orbits wick-hawk too (the rhythm taught over safe floor).
  R10's pit escape ledges and the climb-out's catch ledges are one-ways (a bot under a solid ledge flush with a
  wall jumps into its underside for minutes): the climb-out has one every ~420 px, alternating faces (2560 @1700,
  2880 @1280, 2560 @860, 2880 @460), then the root step at 160.
- **The bots' map reads walls right now (fixed in tools/playtest/map.ts, 2026-10-18):** a walk-off is refused when any
  solid fills the column she would fall down (however high it starts), a wall in a gap counts from her take-off
  height, and a jump up needs headroom over its launch spot. R8's 3 px lip under the pit floor (2540, 1265) and the
  1 px knuckle on the far ledge's lip (3007, 765) were removed (round 4c; the open shaft stays, it is design): without them all four look-ahead bots' region
  results are unchanged and 9 of 9 human-like runs go through (7 of 9 with them). Level geometry need not carry
  bot hacks; tell the playtest tools engineer when the bots misread a room.
- **Round 5 (2026-10-18, reviews/area1-plan-r5.md), the roots:** R10 `wood-well` is the stair, the nest and the den.
  Local x 0 is the oak's west edge; the oak's column is x 2560-2944 (exit `out`, under the oak's mesh). East to
  west: the stair (L0-L3, E0 6528-7040 @1152; no danglers over its landings: they are fall-return points), the nest
  (3872-6528, floor 1856, ceiling 1440; two lit pockets @1728 with a dangler each), the window (trigger 3872-4128,
  hold 180; a 60 px slot in the den's east wall), P-den (3744, 2112, the room's `reform`; a 256 jump back up), the
  den (1952-3552, floor 2112, ceiling 1600): the old burrback (`sets wood-old-burrback-down`), W-den (2240, 1760:
  caught from a jump, off the climb line), the taproot (3200-3296, 88 over the floor: she walks under, the 96-tall
  beetle rams it), the column's faces hanging to 1872 (240 clear: a claw jump reaches them). The plug is a gate
  (2560-2944, 1536-1600) on that flag, and the glade-claws rect (2240-3072) has `when: wood-old-burrback-down`
  (glades take `when`, sim + schema). The road's tunnel (y 444-700) runs from the nest's claw shaft (3616-3872,
  kickable faces, catch ledges) west over the den, across the column, out exit `w` into `wood-rootroad` (world
  21248, 10432; 8384 x 1024) and `wood-rootshaft` (world 18944, 8904; a claw shaft) up to R5's Z, whose root panel is
  a shortcut (`panel-road`, opens from below; floor from above). R4: no roof over the gap; W-gap (2990, 860) and a
  high ledge (3456-3712 @900): up-right lands on it, right alone meets its face; the keen-blade hollow in the door's
  pocket (deepened to 1536); W-hi4 moved to (3980, 400) off the high ledge's reach. R6: a root step under T3's lip
  (2752-3008 @1664), thorns-2 768 wide. Each critical-path room names a `reform`. The descent from R9's floor to the
  den's door is ~0:45-1:05 for the human-like bots (the nest adds ~30 s; carriers will add more).
- **Round 5b (creatures r5, 792b4be):** `old-burr` has `taproot: [3200, 3296]`, `crack: "wood-den-cracked"` (also in
  `marks.stage.den`) and `radius` 1000 (at 560 it never reached the taproot). The carriers, three a line (a lead with
  `trail`, two `follow` it at `phase` 0.33 / 0.67, all `guards` their lamp): R6 from W6's pool to the root lip's crack
  (W6 now at (4900, 1840), west of the beetle: the throw meets its braced front); R8 from W7's pool at hummock B's
  foot into the hatch, the tunnel, up the shaft to the hollow's bark (kept off hummock B: ants under W7 broke its
  jump-cut); R9 under the composition to the bark panel; the nest, each pocket's pool to a crack at its west end.
  Carrier trails shift with a room's `dy` in the generator (lib.shift).
- **Round 6 (area1-video-r4):** the nest's west exit is a bark plug (3872-3936, 1440-1856: the window and the den's
  door are behind it); its ants go down a crack just short of it (standing at a trail's end she is bitten: a plug at
  a trail's end faded every bot). Each stair gap has its own catch with `back` on the ledge she fell from, set back
  from its lip (`chute-1..3`; the one zone looped a bot 33 times). The road's mouth on the column's climb: ants walk
  west into the tunnel from the column; the nest's claw shaft tops out in a one-way flush with the tunnel's floor
  (bots hung about a ledge under the lip); the road's own find is a claw niche in its roof (W-niche, stragglers).
  R6's ants moved off T4 into the floor pocket at T5 (they killed 3 runs on the throw-cut's landing). R4's pocket
  is signposted (a straggler circling over the panel, stragglers drifting in, a dead moth on it): the bots don't read
  signposts, so they still miss it. R8's doorway lintel ends 64 over the opening. Dressing: root masses hung high in
  R4, R9 and over the stair's gaps, stalactites in the nest (all above every arc). The generator keeps others'
  stage keys in a base room beside mine (render's `guide`). Human-like: 9 of 9 through; R9's floor to the den's door
  1:34-2:27; the road 0 of 9.
- A one-way's `noDrop` may name a flag (refuses drop-through until it is set).
- A floor bark panel is hit by a down cut from the air (cut ~70-90 px over it, falling): each hit bounces
  her; cut as she lands and it hits with no bounce; a standing down cut does not reach it.
- Catch zones sit 200 above a room's foot (the camera keeps her in frame).
- The trunk (2026-10-18): the hub shortened by 1856 and R7b, the canopy stub and R8 moved with it (world.json),
  so the climb from the hub floor to the crown is ~3000, not ~5000. Known: falling down the trunk from R7b,
  the view clamps at R7b's foot and her feet reach the bottom of the frame before the room changes (measured 1.03);
  a room's camera can't see past its foot into the room below, so that wants a camera rule, not a seam move.

### The oak (`wood-hollow`, round 3: the hub and R7b merged) and the area-2 stub `wood-canopy`
Area 1 plan r3 item 3 (the seam strobed and the camera could not show the glimpse across it). One column from the
mesh to the crown: no room change in the tree. Old hub content sits 2816 lower than in the hub, old R7b content 1408
east. `wood-heart` is retired (never reuse the id). `wood-canopy` (STUB, area `wood-high`) at 31424, 5952, its `w`
exit on the crown's `canopy` exit (320-576). Generator: a Python dict (hand edits fine). Tests:
tests/unit/wood-oak.test.ts (the trunk and the crown), wood-rooms.test.ts (the hollow floor), wood-camera.test.ts.
- **The hollow** (y 2816-3840): roofed; the trunk's two walls stand in it to 160 over the floor (walk under). West of
  the trunk, x 0-1408 over the roof is solid wood up to the west crown (640).
- **The column** x 2560-2816 from the hollow up to the rest ledge (west face holds; the east face is P-ledge's slick
  buttress 2816-2944 from 2240 down), one-way **catch rungs** across it at 3264 and 2752.
- **Rest ledge (2240):** the solid ledge 2192-2560 with `wick-rest` (2380, 2196) and `dang-knot` hung under the
  floor above (1800, drop 400); the one-way across the column; **P-ledge** (2880) on the buttress, 500 px from
  W-rest (dark: the dangler never drops on a rester). Walled west (the dark way, cut in round 6b: see below).
- **Middle (round 4: the catch is a choice).** The near face (2944) holds only from P-ledge up to **the floor under
  W-ff** (one-way 2112-2944, y 1776: `noDrop` over the dangler 2112-2560, a drop-through over the column and the
  buttress 2560-2944 onto the rest ledge, the way back down); above it, slick 1344-1776. **No thorns in the oak** (first-timer r6: the band ~900 px over P-ledge was off screen
  when a climb began, and W-ff's release held right flung her into it). W-ff hangs at
  (2620, 1460), 300 px off the face: a held-right climber from P-ledge is never caught
  (24 press rhythms: 16 reach the floor, the rest still climbing at 10 s). From the floor, out of the pull, a hop
  (10 f) under W-ff is caught; beaten free up-left she lands on the **knot bridge** (one-way 2112-2624, y 1312, on
  from the band's top and the filled chimney's) in 36 of 36 rhythms x orbit phases. The bridge's tip is over W-ff:
  walk off and down-cut in frames 0-4 (snuff, pogo, onto the foothold 2848-2944 at 1248). With W-ff out the far
  band climbs from the floor to the bridge (the permanence way). Zone `snuff` (0.85) frames the tip; zone `trunk`
  (0.8, last, so the others win) is the climb's look-ahead: at zoom 1 the follow's dead zone let her rise to ~290 px
  under the view's top while climbing; at 0.8 ~480, and from P-ledge the whole face and the floor over it show.
- **Falls:** from 16 drop points on the faces, the bridge and the upper rung she lands within 600 px: rungs 3264 /
  2752, the ledge and buttress 2240, the floor 1776 (`noDrop` west of 2560: human-like personas dropped through into the old hole, 900-1400 px), the bridge
  1312, the shelf 2680-2944 at 1248 (a step up from the bridge's tip), footholds against the face at 1048 and 800,
  the upper rung 2240-2700 at 1000. (A ledge 64+ px off a face she climbs catches a one-wall climber's kick-out and
  she bounces between it and the face: keep ledges right against the face or well clear of it.)
- **Top (round 4, after human-like runs in the oak):** the footholds make the last face a stair of plain jumps to the
  rim. On the rim, close together: the root's knot (bark, 1 cut, 3136), `wick-crown` (3264, 536: a standing cut,
  like R3's knob) with `hawk-crown` on its rhythm over the rim (`rim: 3100`, 2953d05: every blow sends her up and
  over onto the rim), P5 3392, then the finale trigger `crown` (3328-3520, **the rim's full height**, so no jump
  skips it: `hold: 540, finale: true, endSets: "wood-crown-gone"`; a finale's hold sends the room's creatures away)
  and the exit `canopy` (no gate: the hold is the shut door; a gate made the bots plan the exit as unreachable).
- **Human-like runs on 4424bd7** (full chunk, 9): 5 through (0 on 57eee9a); every run with the claws reached P5,
  claws -> P5 69-189 s; the big falls left were drops through the chimney's lid (now `noDrop`) and leaps west off
  the rim; two skilled runs explored the oak's west after the finale until lost (the personas finish every cell).
- **Dressing (round 6, the review's "boxes on boxes"):** only shapes whose tops are covered (round 4: unreachable
  tops in view kept the personas looking for minutes). Root curtains hang from the hollow's roof (x 360, 840, 1640,
  2080; none within a jump of the floor). **A solid's top at the room's top edge (y 0) is ground too:** two step-outs
  of the west wall toward the crown (1792-2048 from y 0) were "unwalked ground at 1984, 0" to every persona after the
  finale, and 7 of 9 runs wandered the oak instead of leaving (human-r6 on b62eab5); removed. The narrowing to the
  ring is render's.
- **Tatter close (round 6 #8):** zones `hollow` (zoom 1.4, inside the root flare) and `crown-close` (1.3, the rim
  at the root's knot) frame its two beats; the finale's pull-out is render's.
- **Cut in round 4:** the postgame crown lantern (in view of the rim it drew players off the top: human-like
  personas chased it and fell), the west crown's top (an unreachable ledge in view: the west wood is solid to the
  room's top now), the chimney rungs (frontier the personas could not reach). **Round 6b:** the dark way (the hole at
  the rest ledge's back, the tunnel, the chimney to the bridge): its tunnel floor was a goal to every persona after the
  finale and none found the hole (it dropped onto the tunnel's dead end); nobody used it; the far band and W-ff are
  the two ways up the middle. Filled solid (1408-1984 and 1984-2192 down to 2688).
- **Fades:** `reformPatch: true` (8036fc0: the nearest patch at or below where she lay): a fade above the rest ledge
  re-forms her at P-ledge, below it at P3; `reform` (P3) stays as the fallback. Never in R8.
- **The first visit (round 5: lived, not held):** the glimpse at P3 holds 180 (no `finale`; holds <= 4 s except the
  crown). Then **the trunk's foot**: a root flare (roof 3008-3392 at 3584-3648) east of the trunk's base, its west wall
  `bark-foot` (3 cuts). Tatter walks to it and goes in at the crack (`stage.tatters`, `vanish`). The passage under
  the roof is the only way east before the claws (the trunk wall overhead stops a jump onto the roof from the west):
  inside, `wick-foot` (3200, 3712: a standing up-cut; above the walk line, so a walker isn't caught) with three
  stragglers (`circlers`), `hollow-night` (night eyes), trigger `oak-hollow` (`wood-oak-hollow`): Tatter sits in the
  moonlight there, then leads her out east to the arch. No arch gate any more.
- Gotcha: a scratchpad is shared by sibling agents: use your own subfolder for probes. Keep in-progress room data
  loadable in the shared tree (a room that fails to parse breaks every agent's tests): work in a scratch copy.

## The room camera (`room.camera`, src/render/camera/)
- Framing overrides: `cameraFor(room)` (tuning.ts) = `cameraTuning` + the room's `anchorY`, `lookaheadX`,
  `leadFrames`, `fallLookahead`, `smoothYFall`, `smoothYFastFall`, `realFallPx`, `targetSmoothY`; a room with none
  (test-grove) gets `cameraTuning` itself. wood-hatch: feet line 0.62, look-ahead 330 built over 36 frames (the
  follow spring lags ~155 px at her 9.6 px/f, so she sits at x ~0.41 running right, mirrored left; it eases back
  when she stops), fall lead 320.
- **Falls (round 4, review 3's lurch):** `smoothYFall` 4 had been applied to every gap drop: 0 -> 35 px/f in one
  frame. Now (rooms with `realFallPx` > 0): the vertical target runs through its own spring (`targetSmoothY` 10)
  before the view follows it, so the view's velocity never steps; below her last ground the fall lead and the follow
  speed grow smoothly with the drop (`k` = (drop / `realFallPx` 250)^2: a gap drop gets a little lead on the usual
  9-frame follow, a long fall or the exit the full lead on `smoothYFastFall` 5). Measured on the naive run: peak
  camera acceleration 0.85 px/f^2 on the gap drops, 5.8 in the final drop; she stays at 0.47-0.78 of the frame
  through the drop and the fade. `tests/unit/rooms.test.ts` runs the camera headless over the whole run (< 8).
- **Round 2 (feel review r2): the speed lead.** From the first frame she descends past her last ground the fall's
  lead grows with her speed (`fallLead` vy 2 -> 14) as well as the drop, capped at the ground under her
  (`landBelow`: solids, one-ways, catch tops); camera zones yield to a fall (their y shift scales by 1 - k, their
  spring quickens); the target's spring shortens to 45% in a full fall. `wood-camera.test.ts`: feet <= 0.80 in every
  fall over 300 px (zones included; not in the last 64 px over the floor, nor while the view stands on the room's
  floor), peak < 8 px/f². wood-hatch went to `smoothYFastFall` 6 with it (5 peaked at 9.9). The hub's `rest` zone is a
  small frame at P3 (zoom 0.8), but the hub's floor is 112 px above the room's bottom, so standing there her feet
  are at ~0.9 whatever the camera does: the room needs ~250 px of ground under the floor (level).
- **Falls across a room seam (7e1c353's trunk):** a room's camera never showed past its own floor, so falling into a
  floor exit her feet reached 1.03 of the frame before the swap. Now (greybox rooms) while she falls within `reach`
  of the floor over a `s` exit's span, the view may show up to `seamLook.px` past the floor (an eased extra bound,
  `cam.seam`): the dark under the room is the way on. `wood-camera.test.ts` drops her down wood-heart's trunk:
  <= 0.80 until the swap (0.66). A rise through a ceiling exit is not covered (the top has only its headroom).
- **Every wood greybox room carries the fall block too (2026-10-17, feel review problem 5):** `realFallPx` 250,
  `targetSmoothY` 10, `fallLookahead` 320, but `smoothYFastFall` **6** (5 gave 8.2-8.7 px/f² at the onset of the
  long straight drops, R2's exit, R9's branch, R11); `lookaheadX` 330 / `leadFrames` 36 in R2, R6 and R9. And in
  rooms with `realFallPx` the vertical target is clamped to what the scene's bounds can show (less a zone's shift)
  BEFORE its spring: a fall toward a catch or a drop exit at a room's foot was stopped dead by the clamp (18-29
  px/f² in one frame). `tests/unit/wood-camera.test.ts` runs a hopping runner and two walkers from each room's spawn:
  peak < 8 px/f², feet < 0.97 of the frame above the room's last 200 px. A catch zone or exit at the very bottom of
  a room is under the lowest view: she falls out of frame before it fires; give such a room 200+ px under its catch.
- **A rounding bug, fixed:** `place()` zeroed the spring's velocity whenever `cam.y + line` missed `cam.fy` by an ulp
  (it took that for a clamp); a fast follow stuttered every other frame at half speed. Now only a real clamp does.
- Beats (`beats.ts` `CameraBeats`, render-side offsets like the kick):
  - `hatchFrame` {y 130, hold 2.4, out 1.4}: shut in, the view sits 130 px lower, so the cocoon is framed at ~0.62-0.70
    (the walk line at ~0.50); after `hatch` it holds 2.4 s and eases back over 1.4 s.
  - `hatchKick` 8 px down on `hatch`, back in ~0.3 s.
  - `lean` (130 right, 160 up) on SIM time after `hatch`: from 4.0 s (after the birth: the unfold on the lip ends
    ~3.9 s; the hatch framing has eased out by 3.8), in over 1.2 s, held to 8.0, out by 9.5 (the swarm's
    `SWARM_PASS` ends then).
  - **Both yield to the run**: they hold only while she is shut in or on the ground slower than 2.5 px/f; once she
    runs they give way in 0.35 s (feet back at 0.62), and come back over 0.9 s if she stops.
  - Any placement except a fall's return ends them.
- `fadeIn` 2.5 s (room-fade.ts): up from black at boot (**not when booted `?manual`**), on every restart and after a
  room exit. Matches the sim's 150-frame listen.
- The exit: while `state.exit` is set and she falls, the follow camera leads her down every frame (target feet +
  `fallLookahead`, `smoothYFall`): she stays at ~0.36-0.6 of the frame until it is black.

## Greybox rooms and the lamp lab
`art: {mode: 'greybox', labels?}` draws a room flat (memory/greybox.md); `kit` / `seed` are only required for painted
rooms. `marks.notes: [{x, y, text}]` are designer notes shown with the labels. `lab-lamps` (a test room in world.json,
every ability) has seven stations for the lamp verb: A a wick over a 440 px gap, B a lantern over an 800 px pit, C two
fields of opposite spin, D a wick to up-cut from a hop, E a wick to pogo from a branch, F a low wick to walk away from,
G a row of three over a 1100 px pit (memory/lures.md).

## Per-room look: what is per room now, what is still Grove-only
`src/render/scene/lib/room-look.ts` `setRoomLook(room)` runs first in `RenderStage` (shaders are built after it, so
the zone and key-light constants inside them are the room's). `LOOK.kit` is `grove` (test-grove, and any room with
no `art`: unit tests) or `wood`.
- **Per room now:** the mood zones (every zone source keeps the Grove's edges plus `LOOK.zoneShift` from `art.moods`:
  `fx-zones` `ZONE_EDGES` / `zoneGlsl()`, `pf-shape` `ZONES`, `bg-bake` `ZONES`; all-cool pushes both edges out of
  reach); the key light's entry x (the moon's side) and colour (moon silver in the wood; its direction is shared);
  the sky's moon disc + halo and the afterglow band (`sky.ts`, `SKY.wood`; no warm bloom in the wood); the
  background anchor (`art.anchorY`, unset: default rule); the playfield painter (`pf-branch.ts` for the wood: one living branch from the rects, its own
  growth and a live moonlit rim, playfield.md "The wood"; the grove keeps `paintTerrain`); mid's mist stage (derived from the rects: `woodStage`); fireflies (cool, one gathering per
  1000 px) and leaves (greens) in air; mid's leaves.
- **Grove-only, gated by `isGroveKit()`:** far's waterfall, stone arch, fallen log, birds, live falls and log moss;
  mid's hollow tree (a plain giant at 4560 in the wood), its canopy bough / shaft pendant / moon hole drops and
  the moon-hole sprites; `STAGE` (the hand-copied grove mist stage); everything in `paintTerrain` (landmarks,
  banks, islands, FIGHT_SPOTS).
- **Still Grove-shaped but harmless in the wood:** far / mid trunk tables and their `wellX` openings (layer
  coords around the old 2880 anchor), mid's glow clusters, `quiet`, `bluffClear`, mid / far ATM warm well
  colours (the cool zone tints cover them), air's beam list (8 beams at Grove x, cool in the wood), the
  foreground's `mirrorAt` cameras, `hud/prompts.ts` shaft prompt `[3328, 3584, 192]`, `post/config.ts`
  `goalIds`, goal/config moth routes (no lanterns in the wood).
- Verified 2026-10-17: every test-grove wide stop and close-up is pixel-identical to before the seam (diffed against a
  build of the previous commit).

## Render side of the new events
`camera/room-fade.ts` (`RoomFade`, knobs `cameraTuning.room`): `roomExit` fades to black over the hold (reaching
black 0.12 s before the swap), `roomEnter` lifts it over `enterLift` 0.3 s into another room (`from` `room#exit`,
`goto`, `continue`), `exitLift` 0.9 s after a re-form, the room's own `fadeIn` on a restart; the stage rebuilds the
room's renderers on the swap (memory/world.md); `fallCatch` dips to 0.85 over its hold,
`fallReturn` lifts over 0.35 s; a plain teleport / load clears it. The acting agent owns the cocoon and the hatch: drawn since 2026-10-17 (memory/hatch-and-tatter.md).

## What the art agents should know
- The wood's backdrop is its own (canopy height, 2026-10-17): memory/background-layers.md "The wood". It is
  composed for `art.anchorY` 880 and a reference camera y 894 (`WOOD.refCamY`, the opening at feet line 0.62);
  the camera centre runs ~606 on the crown, ~1150 at the end. Move `refCamY` with the feet line.
- `pf-branch*` / `pf-rim.ts` are the playfield agent's; cocoons, Tatter and the swarm are the acting / swarm agents'.
