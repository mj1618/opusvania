# Rooms, abilities, the hatching, per-room art (tech stage 0, 2026-10-17)

The game is built room by room (docs/design/tech.md). The Grove is the test bed `test-grove`; scene 1 is `wood-hatch`.

## Files and registry
- `content/rooms/<id>.json`: one room = the old scene format plus the fields below. `content/world.json`: `start`
  (the boot room), `rooms` (the real game's, with world x / y for exits and the map later) and `tests` (outside
  the world: `test-grove`). A new room = its file + one import line in `FILES` (`src/scene/index.ts`) + world.json.
- `src/scene/index.ts`: `parseScene` (Zod + placement rules, now also exits / catches / shot stops), `ROOMS`,
  `ROOM_IDS`, `DEFAULT_ROOM`, `getRoom(id)`, `GROVE` (= test-grove: the 26 Grove test files still import it),
  `WOOD_HATCH`. `src/scene/room.ts`: the `Room` type = sim `Scene` + render-only `title, region, art, marks, shots`.
  Every extra field is optional, so a flat test scene is a Room; `RenderContext.scene` / `SimView.scene` are Rooms.
- Boot: `?room=<id>`, the panel's Room list (reloads), `__game.room(id)`. Tools: `--room` (default wood-hatch).

## Sim fields (all optional; absent = the old behaviour)
| field | what |
|---|---|
| `abilities: AbilityId[]` | the starting kit (`src/sim/abilities.ts`: `glide, wallJump, doubleJump, dash`). Absent = all (test scenes, the grove) |
| `exits: [{id, edge: n/s/e/w, from, to, at?}]` | an open span of an edge (`at`: the line across the edge where the crossing counts, default the edge) (no wall there: `solidAt` / `kickableAt` honour it). Box centre past the edge inside the span: `roomExit`, she is held `tuning.room.exitFrames` (42) with no input, then the room restarts in the sim (`roomEnter` + `spawn`; `save` and the frame count go on). The target is never authored (stage 1 finds it from world placement) |
| `catches: [{id, x, y, w, h}]` | a fall into the rect costs nothing: `fallCatch`, held `catchFrames` (18), then `fallReturn` + `spawn` at her last safe ground, moved `returnInset` (72) px in from that top's end (the lip she fell from loops a hold-right player otherwise) |
| `lures: [{id, kind, x, y, spin?}]` | the story's lamps (memory/lures.md) |
| `hatch: {x, y}` | she starts shut in the cocoon at (x, y) (render); her body stands at `spawn`, no input moves her. Presses of ANY button (a bit set that was not the step before) after `tuning.hatch.listenFrom` (150, the fade-up) stir it (`hatchStir`); the 3rd breaks it (`hatch`); with no input it stirs on its own every 90 frames from 300 and breaks at 720 (`auto`). The breaking press is not also a jump. **`placePlayer` (teleport) ends it silently** |
State v21: `room`, `save: {abilities}`, `exit`, `caught`, `hatch`. `resolveParams(t, abilities)` turns off what she does not own:
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
| S1 | 224-1504 | 1024 -> 1006 (flat +-2 under the cocoons, 430-1100) | tree `west` (230, 1070) | burl: S2 abuts 64 higher |
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
Room 7424 x 2816. Exit `drop`: the south edge 6144-7424, **`at` 1790** (fires while she is still in the frame).
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
black 0.12 s before the restart), `roomEnter` lifts it over 0.9 s; `fallCatch` dips to 0.85 over its hold,
`fallReturn` lifts over 0.35 s; a plain teleport / load clears it. The acting agent owns the cocoon and the hatch: drawn since 2026-10-17 (memory/hatch-and-tatter.md).

## What the art agents should know
- The wood's backdrop is its own (canopy height, 2026-10-17): memory/background-layers.md "The wood". It is
  composed for `art.anchorY` 880 and a reference camera y 894 (`WOOD.refCamY`, the opening at feet line 0.62);
  the camera centre runs ~606 on the crown, ~1150 at the end. Move `refCamY` with the feet line.
- `pf-branch*` / `pf-rim.ts` are the playfield agent's; cocoons, Tatter and the swarm are the acting / swarm agents'.
