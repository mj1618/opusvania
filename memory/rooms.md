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
| `catches: [{id, x, y, w, h}]` | a fall into the rect costs nothing: `fallCatch`, held `catchFrames` (18), then `fallReturn` + `spawn` at her last safe ground, moved `returnInset` (72) px in from that top's end (the lip she fell from loops a hold-right player otherwise) |
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
| R7 `wood-hollow` | 27584, 9024 | 3840x1392 | (shortened 1856 from the top: the trunk is ~860 here, then R7b) floor 1024 (368 of ground under it), doors W/E at floor level; P3 1280, glimpse trigger (hold 150), `stone-oak` (1800), `sign-trunk` (2300); trunk walls 2496-2560 / 2944-3008 to 864 (kick inward); root mesh one-way 2560-2944 at 1024, `noDrop: "wood-climbout"`; Tatter (2700, 1024); zone `look-up` (no fit); exit `n` 2560-2944 into wood-heart |
| R8 `wood-hawkers` | 31424, 9024 | 3840x1392 | (shortened 1600 from the top so R7b fits above it; all y below are the new local ones) hawker A at W7 (1920, 520) over the hummocks (tops 832); the throw gap: near ledge to 2560 (1024), a dark pit 2560-3008 (floor 1248, **no thorns**: a miss is a hop back), far ledge 3008-3456 at 704 (320 up: only the throw), `wick-throw` (2700, 730) + `hawk-throw`; tunnel 2304-3712 (y 1264-1360), hatches at 2304 and 3600; `hollow-wings` behind `bark-hollow`; step 3456 y864 back up onto the far ledge; P-dark 3530 |
| R9 `wood-silk` | 35264, 7424 | 3840x2992 | floor 2624; knob 760 + W-s1 + `dang-s1`; W-s2 (1400, 2380) throws up-right onto the root shelf 1600-2400 at 2304 past `dang-s2`; dip 1824-2176 (2880) with root steps; knob 2780 + W-s3 with `burr-silk` and `dang-s3` (one snuff, both off); `sign-silk` 3650; `bark-panel` floor 3200-3456 -> R10 `shaft`; postgame W-dj on a hung ledge |
| R10 `wood-well` | 27584, 10416 | 11264x2240 | west hall (the drowned-roots stub); climb-out 2560-2944 with a top step; glade 2 2560-3264 under the mesh, P4 3136; gate 3520; pit 3584-5632 (zone `pit` frames the gate); `window` trigger (hold 120) + zone on L4; P-chute (6300, 1216) = `reform`; the stair L4..L0, two lit pockets (`wick-pocket`/`dang-pocket` over L3, `wick-chute`/`dang-chute` over L2); `wick-pogo` (9640, 760) under L1's lip with a root ceiling over L1's west end (no jump there) |
Measured: R3 throw back west lands on L; R4 gap throw onto F3 from 0/40/80 px back; R8 up-right throw clears
the thorns to the far ledge; R9 up-right throw lands on the shelf; R10 pogo-wick cut 2-6 frames after walking off:
snuff, bounce, L2.
- A one-way's `noDrop` may name a flag (refuses drop-through until it is set).
- A floor bark panel is hit by a down cut from the air (cut ~70-90 px over it, falling): each hit bounces
  her; cut as she lands and it hits with no bounce; a standing down cut does not reach it.
- Catch zones sit 200 above a room's foot (the camera keeps her in frame).
- The trunk (2026-10-18): the hub shortened by 1856 and R7b, the canopy stub and R8 moved with it (world.json),
  so the climb from the hub floor to the crown is ~3000, not ~5000. Known: falling down the trunk from R7b,
  the view clamps at R7b's foot and her feet reach the bottom of the frame before the room changes (measured 1.03);
  a room's camera can't see past its foot into the room below, so that wants a camera rule, not a seam move.

### R7b `wood-heart` (the oak's heart + the crown) and the area-2 stub `wood-canopy`
Placed at 28992, 4352 (2560x2816, its bottom on the hub's top); `wood-canopy` (STUB, area `wood-high`) at
31552, 4096, its `w` exit on the rim's line. Local coordinates; the hub's shaft comes in at x 1152-1536 (the oak's
column, `stage.oak` x 1344, top 348 = world ~4700). Tests: tests/unit/wood-heart.test.ts (each claim measured).
- **Lower third:** the lower shaft (both faces hold), the **rest ledge** (704-1152, y 2240) with `wick-rest` (960,
  2196: a standing cut from either side) and `dang-knot` hanging under the bridge at x 960, drop 880 (it bites a
  stander at the cut spot; stepping back at its thread clears it; the snuff sends it). A root step on the near face
  (1472-1536, y 2240). The spawn (the return point for a thorn hit before she has stood anywhere) is the tunnel
  floor (480, 2688): any spawn from which a walker can drop into the lower shaft fails wood-camera.test (the view
  clamps at the seam, her feet reach ~0.84 of the frame before the crossing into the hub).
- **Middle third:** the near (east) face holds to 1640, slick to 1544, the thorn band 1344-1544. `wick-firefly`
  W-ff (1380, 1460, `after: wood-firefly-glimpse`): a held-right climber is caught at the top of the face (25 of
  28 timings; 1 thorn). Beaten free up-left: thrown onto the knot bridge (one-way 832-1376, y 1312) or the band's
  top (1408), never the thorns; up-right or nothing: the thorns. **The snuff:** walk off the bridge's tip and
  down-cut in the first 0-6 frames: snuff, pogo, holding right onto the foothold over the thorns (1472-1536, 1248).
  With W-ff out, a kick-glide from the near face at 1740-1840 reaches the far face's band (576-704, 1408-1800;
  slick below), whose top is a jump from the bridge.
- **The dark way:** the hole at the ledge's back (704-784) -> the tunnel (2560-2688) -> the chimney (384-576) up
  through its lid onto the band's top; no lamp near; slower than the throw (tested). The **bark knot** (find) is at
  the band top's west end (3 cuts) with `wick-knot` behind it (a standing cut from the doorway).
- **Upper third:** the near face holds 576-1344 to the rim. `wick-crown` (1430, 540) hangs off the rim's lip,
  `hawk-crown` (1240, 470) guards it: the climb's top runs into the grip, and caught she is struck unless she beats
  free at once (up-right: onto the rim). From the lip a standing cut west snuffs it and the hawker leaves.
- **The crown (rim y 576):** `root-knot` bark (1600, the whole height to the room's top, hp 1) bars the rim; behind it
  trigger `root-cut` sets `wood-root-ladder` (stage `rootFall`, the ladder down the trunk, Tatter at 2080 `when` it).
  P5 (1920); trigger `crown` (1856-2048, hold 150) sets `wood-crown` (stage `cloud`, `vista`); exit `e` (320-576)
  -> the stub. `lantern-crown` (760, 340) is postgame: every critical-path point is > its radius + 60 from it.
- **Bots** (from the hub with glide + claws, 2026-10-18): speedrunner through, 32 s in R7b, 1 hawker hit; explorer
  through (~90 s, 4 snuffs, the dark way first); cautious through in 1 of 2 runs (110 s; the other never jumps from the
  band's top to the bridge: a planner limit, 128 across / 96 up). The naive bot does not climb, so it never gets here.
- Gotcha: a scratchpad is shared by sibling agents: use your own subfolder for probes.

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
