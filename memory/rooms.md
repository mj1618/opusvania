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
| `exits: [{id, edge: n/s/e/w, from, to}]` | an open span of an edge (no wall there: `solidAt` / `kickableAt` honour it). Box centre past the edge inside the span: `roomExit`, she is held `tuning.room.exitFrames` (42) with no input, then the room restarts in the sim (`roomEnter` + `spawn`; `save` and the frame count go on). The target is never authored (stage 1 finds it from world placement) |
| `catches: [{id, x, y, w, h}]` | a fall into the rect costs nothing: `fallCatch`, held `catchFrames` (18), then `fallReturn` + `spawn` at her last safe ground, moved `returnInset` (72) px in from that top's end (the lip she fell from loops a hold-right player otherwise) |
| `hatch: {x, y}` | she starts shut in the cocoon at (x, y) (render); her body stands at `spawn`, no input moves her. Presses of ANY button (a bit set that was not the step before) after `tuning.hatch.listenFrom` (150, the fade-up) stir it (`hatchStir`); the 3rd breaks it (`hatch`); with no input it stirs on its own every 90 frames from 300 and breaks at 720 (`auto`). The breaking press is not also a jump. **`placePlayer` (teleport) ends it silently** |
State v21: `room`, `save: {abilities}`, `exit`, `caught`, `hatch`. `resolveParams(t, abilities)` turns off what she does not own:
glide; wall slide AND wall kick (`P.wallJump`, checked in `wallInRange`); double jump (`doubleJumps 0`); dash (`P.dash`,
in `canDash`). Run, variable jump, fast fall, the blade and pogo stay. The Game harness keeps a granted kit through
restarts (`Game.setAbilities`, `?abilities=`).

## wood-hatch (round 2, 2026-10-17; tops are walk lines, all `branch` solids)
Redesigned after review round 1 (docs/design/scenes/reviews/01-round-1.md, problems 3 and 5): longer, with height, no box steps.
| stretch | x | top y | join to the next (what pf-branch makes of it) |
|---|---|---|---|
| trunk | 0-224 | (0-2432) | the bole (`kick: false`) |
| S1 | 224-1600 | 1024 | the cocoon row: spawn 864; abutting +64: a **burl** |
| S2 | 1600-2240 | 960 | gap A 256, rising 96: a **fork** |
| S3 | 2496-2944 | 864 | gap 160, rising 128: fork |
| S4 | 3104-3520 | 736 | **the crown** (highest). The promise gap begins at its end (3520-5056, `marks.promise`); her way: gap 128, down 160 |
| S5 | 3648-4320 | 896 | gap B 256, down 64 |
| S6 | 4576-4928 | 960 | abutting -96: a **knee** |
| S7 | 4928-5440 | 1056 | gap C 192, down 96 |
| S8 | 5632-6208 | 1152 | gap D 128, down 128 |
| S9 | 6336-6592 | 1280 | the end (`marks.drop` 6592, 1280): walk off east = the exit |
| far | 5056-7424 | 512 | another tree's branch to the east edge: 448+ above every top under it (`rooms.test.ts`) |
Room 7424 x 2432. Exit `drop`: the south edge 6400-7424. Catch `below`: x 224-6400, y 1600-2432. No ceilingY.
- **Rules learned for paintable joins:** abutting steps only for small changes (a +64 burl, a -96 knee); bigger height
  changes go across a gap (the painter makes a fork with a dipping main mass). Abutting +96 / +128 / -192 steps
  painted as square boxes. Vary the stretch lengths (a test keeps them distinct).
- **The room may not be wider than ~7450** (with the wood's far plans): far0 must bake as ONE tile (coverage x 0.62
  <= 2048 px), or far.ts cannot build the far pair pass, the opaque far composite hides the sky and **the moon
  vanishes** (seen at 8192). Guarded in `rooms.test.ts`. `art.anchorX` 2560 keeps the backdrop lined up as it was
  composed (for the old 5120 room): new field, default the room's centre.
- Timing: the naive bot (hold right, 14-frame jump 12 px from an edge or when blocked; also 24 px) takes **11.6 s
  from the hatch to the exit** with no catches (12.1-14.3 s with a 2.5 s look at the swarm). A first-time player who
  watches the pass: ~15-20 s. Room for more length is limited by the far0 tile (above).
- Marks: cocoon hang points are now **on S1's underside** (top + painter thickness ~96-124: y 1148..1120 from west
  to east), irregular gaps 52-108, `len` 78-130 (silk + body), hers at 864 (len 130). With the feet line at 0.62
  the closed one's body sits at ~0.72-0.82 of the frame (the look target's 0.62-0.70 needs a thinner limb there).
  Tatter 1210 facing west. `swarm` polyline crosses the moon at (1420, 544) in the opening frame. `camera` hints:
  vista (960, 894), swarm (1090, 734), promise (4288, 636), drop (6592, 1650).
- `art`: kit `wood`, seed 7, moon (view px 1420, 190, r 88), afterglow (1500, 850, 0.35), `anchorY` 880, `anchorX` 2560.

## The room camera (`room.camera`, src/render/camera/)
- Framing overrides: `cameraFor(room)` (tuning.ts) = `cameraTuning` + `anchorY` / `lookaheadX` / `fallLookahead` /
  `smoothYFall` from the room; a room with none (test-grove) gets `cameraTuning` itself. wood-hatch: feet line 0.62
  (grove 0.72), fall lead 320.
- Beats (`beats.ts` `CameraBeats`, render-side offsets like the kick): `hatchKick` 8 px down on `hatch`, back in ~0.3 s;
  `lean` (130 right, 160 up) on SIM time after `hatch`: in 2.4-3.8 s, held to 8.0, out by 9.5, the swarm's
  `SWARM_PASS` (src/render/swarm/timing.ts; the numbers are copied into the room JSON, keep them in step). Any
  placement except a fall's return ends it.
- `fadeIn` 2.5 s (room-fade.ts): up from black at boot (**not when booted `?manual`**: tools and tests want the
  picture at once), on every restart (`load()` / R) and after a room exit. Matches the sim's 150-frame listen.
- The exit: the room runs 832 px past the branch end, so the follow camera (and its fall lead) frames the end at
  ~0.57 (16:9) to 0.68 (21:9) and follows her down; the fade reaches black ~1.4 s after she leaves the branch.

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
  composed for `art.anchorY` 880 and a reference camera y 800; since round 2 the camera centre runs ~894 at the
  cocoons (feet line 0.62), ~606 on the crown, ~1150 at the end.
- `pf-branch*` / `pf-rim.ts` are the playfield agent's; cocoons, Tatter and the swarm are the acting / swarm agents'.
