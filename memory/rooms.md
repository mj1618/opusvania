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

## The wood, greybox (2026-10-18, round 1 of the quality iteration): R2-R10 built, R11 a stub
From docs/design/regions/wood.md draft 2 (§3 placement, §7 specs); `art: greybox`, `region: wood`, `edgeKick: false`,
`abilities: []` (glide comes from R5's glade); every beat / lock / TODO is a `marks.notes` label (G). Tests:
`tests/unit/wood-rooms.test.ts` (placement, links, each room's claims, measured in the sim).
| room | world x, y | size | what is in it |
|---|---|---|---|
| R2 `wood-chase` | 5760, 2816 | 6400x1920 | (round 1) west wall split around a trunk hollow 64-256 x 448-704 with `wick-cave` (160, 590); A 256-1600 y704; the fallen trunk 1600-3328 (128-wide rects, tops 704 -> ~948, rolling); gap 128, drop ~330 to E 3456-4480 y1280; gap 128, drop 320 to V2 4608-5760 y1600; twig line one-way 3584-4224 y1056. Catches y1520-1720 (200 above the foot). S exit 5760-6400 one-way. Zone `vista` (bounds 4416-6400 x 576-1920) |
| R3 `wood-wicks` | 11264, 4736 | 3840x2176 | L 128-1152 y960, dip 1152-1408 floor 1120, M 1408-2048 y960 + knob 1984-2048 (24 tall), N 2048-3840 y1152, hanging trunk 1600-1664 to y704. W1 `wick-caught` (1280, 720) spin -1, W2 `wick-first` **(2072, 896)** (the paper's 918 put the knob inside its core: the validator refuses), W-hi3 `wick-high` (1408, 352). **Shaft wall 896-1024, y0-576, `kick: false`**: without it a fall held right drifts ~500 px and lands in W1's field (the bots did) |
| R5 `wood-glade` | 18944, 6400 | 2880x2504 (round 1: +200 under the catch; alcove 1216-1408 x 1856-2048 with `wick-alcove` (1310, 1960)) | hollow 192-576 (west face `kick: east`, east block 576-1024 to y1280 `kick: west`), glade `glade-glide` 192-576 x 1344-1664, **P2 at x 448** (a fall from the hole with no input lands at ~493: her walk-in speed carries), floor 0-1408 y1664, chasm catch 1408-2368, Z 2368-2880 y2176, east trunk 2816-2880 to y1920 (`kick: west`). Routes: p2 -> e needs glide, e -> p2 / p2 -> n need wallJump. Camera zone `lip` (bounds 960-2880 x 1216-2304: lip and Z both on screen) |
| R4 `wood-burrow` | 15104, 4608 | 4480x1792 | (round 1: `seed-0` (1000, 1176) over F1; `bark-pocket` floor 384-480 y1280 over a pocket 384-640 x 1344-1472 with `wick-pocket` (560, 1408); W-hi4 moved to (3300, 640)) F1 0-1216 y1280, F2 1216-2816 y1344, root step 2624-2816 top 1152, root roof 2752-3520 y768-864, seed-cases (3008, 1152) (3296, 1152), **safe floor 1472** (the paper's 1408: a full jump climbed F3's 256 face and skipped the pogo) + root steps of 160, F3 3456-4096 + 4352-4480 y1152, hole 4096-4352, trunk 4416-4480 (y192-1024, `kick: west`), shelf H 3904-4416 y512. W3 `wick-burr` (1984, 1144) guarded by `burr-first` (4 hp, patrol 1408-2560), W-hi4 `wick-high` (3136, 704), P1 3776 + Tatter |
| R6 `wood-glidewalk` | 21824, 8064 | 5760x2368 | (round 1: root roof 320-800 y256-320 over E0's lip; zone `gap1` (fit, bounds 0-2100 x 160-1600); `p-t3` (3200, 1472); thorn branch now 3798-4198 y920-1040, over the jump's apex) E0 0-576 y512; gap 1 to T2 1376-1984 y960 over a safe floor (576-1376, 1408) with **one-way rungs** at 576-672 (y 1216/1024/832/704: the paper's root steps toward T2 let a plain jump reach T2); gap 2 to T3 3008-3648 y1472 over thorns (y1920); thorn branch 3798-4198 y1176-1272 on a stem; gap 3 to T4 4672-5760 y1984 over thorns (y2240); bark wall 5376 (y1600-1984), bark floor panel 5456-5552 over a pocket (5456-5760 x 2048-2176) with `wick-pocket`; T-ret 5632-5696 (y256-1728); a rolling return bough y192 (east) rising to y32 over E0. W4 `wick-landing` (1920, 760), W5 `wick-line` (2434, 860) spin 1, W6 `wick-ledge` (5120, 1784) + `burr-ledge` (5 hp, patrol 4992-5248). Routes: w -> e needs glide, e -> w needs wallJump |
| R7 `wood-hollow` (hub) | 27584, 7168 | 3840x3248 | (round 1: `well-lid` flag gate 384-640 y3136 (wood-climbout); exit `e-high` 384-640 on the east edge off the crown shelf; zones `rest` (fit, bounds 0,380,3840,2868) and `look-up` (bounds 2176,300,1152,2948)) **SEAM FIX: the interior sits 256 lower than the paper** (R6's T4 and the hawkers' floor are both world y 10048 = hub local 2880; the paper's shelf 2624 / floor 2880 would put the W door under the shelf): root shelf 0-960 y2880 (the W door), floor y3136, alcove under the shelf 384-960 (back wall 0-384: an explorer crossing the well to reach a back floor fell in), well 384-640 (S exit, one way), east arch steps 3584 (3008) and 3712 (2880) up to the E door. Up-shaft walls 2496-2560 / 2944-3008 (inner faces kickable) from y640 down to 2976 (160 to walk under), crown shelf 1856-2496 (no kick) + 3008-3840 y640, `wick-crown` (3392, 448), `lantern-gap` (1280, 512) spin 1, far branch 256-768 y512 no kick, `wick-firefly` (512, 400). Grate: shortcut 2560-2944 y3136 h32 `opens: s` over the S exit `climb` (her head meets it from below 16 px under: the entry inset). Trigger `glimpse` at P3 sets `wood-firefly-glimpse`. P3 1280 + Tatter facing east |
| R8 `wood-hawkers` | 31424, 7424 | 3840x2752 | (round 1) floor y2624, hummocks A 1088-1472 / B 1728-2112 tops 2432 over a dip (floor 2688); `wick-hummock` (1280, 2250, unguarded), `wick-hawk` (1920, 2120) guarded by `hawk-first` (home 1640, 2200); S1 `bark-mound` 2688-2752 y2464-2624 under a root roof 2752-3200 y2464, cavity to 3136, `wick-bark` (2920, 2560); `p-dark` 3520. Canopy branches 0-704 y384, 1024-1664 y448, 1984-2752 y512, 3072-3840 y384, `wick-canopy` (2368, 300), `dang-canopy` (2300, 8) guards it. Exits w/e 2368-2624, w-high/e-high 128-384 |
| R9 `wood-lantern` | 35264, 7424 | 3840x2992 | (round 1) floor y2624 (0-1600, 2752-3200), upper level 1600-2752 y2432, root step one-way 864-1024 y2464, P one-way 1024-1536 y2304, `lantern-hall` (1280, 2048) guarded by `burr-lantern` (on P, `fenced`, radius 180) and `dang-lantern` (1480, 1860, under a root shelf 1408-1600 y1824). Shaft 3072-3584: west wall 2944-3072 (0-448, window 448-704, 752-1600 slick, 1600-1920 slick + thorn band 3072 w16, 1920-2400 kick east), east wall 3584 (slick 2304-2992, kick west 0-2304). `bark-panel` floor 3200-3456 y2624 = S exit `panel` (one way) onto R10's `shaft`. Hanging ledge 448-704 y1984 on a root (544-608) from the canopy, `wick-high` (672, 1880). Canopy 0-960 y384, 1280-2176 y512, 2496-3072 y704 |
| R10 `wood-well` | 27584, 10416 | 11264x2240 | (round 1) floor y2112 0-5632; ceiling blocks to y1344 with the well 384-640 and the climb 2560-2944 open; climb trunks 2496-2560 / 2944-3008 to y1888 (kick inward; walked under), rest ledge 2880 y1056, trigger `climbed` (top) sets `wood-climbout`; glade 3008-3520 + P4 3136, ledge 3264-3456 y1888, `wick-pit` (3392, 1600); `root-gate` 3520 y1344-2112 (flag wood-old-burrback-down); pit 3584-5632 under a roof to y1344, hole 5376-5632; `old-burr` 4600 (`sets`), zone `pit` (lock, fit); chute L4 5760-6656 y1216 ... L0 10688-11264 y448 + `p-chute`, `wick-chute` (8736, 700), `dang-chute` (8800, 8, drop 900); catch 5760-10688 y1840-2040; `reform` = p-chute; exit `shaft` 10880-11136 (in from R9) |
| R11 `wood-climb` | 38336, 4864 | 2048x2560 | **STUB** (title `STUB: ...`): a plain two-face shaft and P5 |
| R14 `wood-caps` | 23744, 5376 | 3840x2688 | (round 1) the cap stair: floor 2240-3840 y2624, steps 1792-2240 (2208), 1088-1792 (1792), 640-1088 (1216), 256-640 (640); caps cap-1 mid (2240, 2592), cap-2 mid (1792, 2176), cap-3 big (1152, 1760), cap-4 big (640, 1184), each against the next step's face; `dang-c1` (3000, 2212) / `wick-c1`, `dang-c2` (1500, 1136) / `wick-c2` (1600, 1500), `wick-c3` (330, 470); `bark-hollow` 1024 y1600-1792 -> `hollow-wings` (quickWings); `stone-wood` (448, 640, area wood-floor); `bark-root` 192 y448-640, trigger `root-cut` sets `wood-root-ladder`; chute 0-192 -> exit `s` (one way) onto R6's `n-bough`. Exit `e` 2368-2624 <- hub `nw` |
Measured (headless sim): every run-up jump across the dip is caught by W1 (11/11 launch points); standing jumps
held >= 10 frames are caught, a 6-frame tap passes under and is slung onto M; beaten free holding right she lands on M;
at the knob her centre is 108 px from W2 and a standing forward cut snuffs it; R5 without glide: 0 of 155 jump
timings reach Z, every one a catch; walk-off glide and jump-glides all cross. The lab-world rooms moved to `tests`
(memory/world.md). Bot and page times vs wood.md §9: memory/playtest-harness.md "The wood, first rooms".
**What play showed against the paper, and what changed:** wood.md §12 (the changelog table). Notes:
- **Jump-cut claims hold with the paper's method** (jump held through the cut, cut in the rise at 2-18 frames,
  60-140 px to the side): W3 3.4 / 9, W4 6.0, W7 6.0, L1 4.0, none caught; W8 from its ledge 23 of 27. Letting go
  of jump at the cut and cutting late reads far lower and gets L1 caught: measure with `jumpCuts` in the test.
- R6: W4 now (1800, 640): every jump-glide from E0 passes under it; the jump-glide from T2's lip is W5's (the
  combine); anything airborne under W4 (a hop, a short drop) is pulled into it. The thorn branch is thorns all over
  (no stem to land on): a glide on after W5's throw lands on T3 or meets the branch, never T4. Beaten free holding
  right with jump let go: T3 in ~5 of 8 beat timings, gap 2's thorns otherwise.
- Data pieces added for these rooms (memory/level-kit.md): room `reform`, lure `after`, creature `sets`.
- **Round 1 (2026-10-18), what to know:** the wood's greybox rooms ship `art.labels: false` (players see no
  designer notes; G shows them). A catch zone needs ~200 px of room under it (the camera clamps to the room's foot
  and she fell out of frame before the catch fired): R5 grew 200, R2's and R10's catches moved up. A room's
  `reform` now wins over a saved patch in another room (src/sim/index.ts fade branch): R10's pit re-forms her at
  P-chute, not at the hub. Rooms R4, R6-R11 are generated by a script (a Python dict per room, `dump` keeps one
  object per line); hand edits are fine, keep the camera block the camera agent tunes (realFallPx etc.).
- **Caps (batch 2):** a cap on the walk line bounces everyone who steps on it (walking onto it counts as landing), and
  a bounce under a platform bonks its underside: put a cap against the next step's *face* (R14), or as a bracket off
  the walk line (the hub's B1 over the W door: the door's walk-in passes under it). The hub's grate is now a one-way
  root mesh (an opened shortcut is a hole forever); the climb-out lands on it.
- **Bots and the loop:** the way into R10 is now R9's bark floor (a down cut). The playtest bots don't down-cut floor
  panels, so the region run stops in R9 (lost) until the harness learns it (playtest-harness.md).
- A lure with `after` burns for the one step of a room entry before the kit puts it out (createLures lights all):
  render can see it for a frame; the test steps once before it looks.

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
