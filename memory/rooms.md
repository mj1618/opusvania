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

## wood-hatch (blocked out; tops are walk lines, all `branch` solids)
| x | top y | what |
|---|---|---|
| 0-224 | (0-2048) | the trunk the branch grows from (`kick: false`) |
| 224-1536 | 1024 | the cocoon row: spawn 864 (her cocoon `hatch` 864, 1086), husks 440-1064 hung at y 1030, Tatter 1200 facing west |
| 1536-2112 | 960 | the knot: a 64 px step up |
| 2112-2304 | | gap 1 (192) |
| 2304-2944 | 960 | ends at **the promise gap** (2944-4608, `marks.promise`): the swarm crosses it to the far branch |
| 2944-3456 | 1088 | the way bends down (128 under the end of the last) |
| 3456-3584 | | gap (128) |
| 3584-4224 | 1216 | |
| 4224-4352 | | gap (128) |
| 4352-4736 | 1344 | the branch's end over the dark (`marks.drop` 4736, 1344): walk off it east = the exit |
| 4608-5120 | 896 | **the far branch**: unreachable with the starting kit (every top under it is > 300 below or > 1000 away; `rooms.test.ts`) |
Room 5120 x 2048. Exit `drop`: the south edge 4400-5120. Catch `below`: x 224-4400, y 1600-2048. No ceilingY, `edgeKick: false`.
The naive bot of the brief (hold right, a 14-frame jump when grounded and blocked or 12 px from an edge) reaches the
exit with no catches, pressed out or waiting the 12 s (`tests/unit/rooms.test.ts`, under 45 s).
Marks (render / acting only): `cocoons` (hang point + length + split/closed), `tatter`, `swarm` (a world polyline,
a rough first path), `promise`, `drop`, `camera` (named views: vista, swarm, promise, drop, with notes).
`art`: kit `wood`, seed 7, moon (view px 1420, 190, r 88), afterglow (view px 1500, 850, 0.35; it rides at far0's parallax), `anchorY` 880, moods all cool.

## Per-room look: what is per room now, what is still Grove-only
`src/render/scene/lib/room-look.ts` `setRoomLook(room)` runs first in `RenderStage` (shaders are built after it, so
the zone and key-light constants inside them are the room's). `LOOK.kit` is `grove` (test-grove, and any room with
no `art`: unit tests) or `wood`.
- **Per room now:** the mood zones (every zone source keeps the Grove's edges plus `LOOK.zoneShift` from `art.moods`:
  `fx-zones` `ZONE_EDGES` / `zoneGlsl()`, `pf-shape` `ZONES`, `bg-bake` `ZONES`; all-cool pushes both edges out of
  reach); the key light's entry x (the moon's side) and colour (moon silver in the wood; its direction is shared);
  the sky's moon disc + halo and the afterglow band (`sky.ts`, `SKY.wood`; no warm bloom in the wood); the
  background anchor (`art.anchorY`, unset: default rule); the playfield painter (`pf-wood.ts` for the wood: a
  bole for `trunk`, a round limb with a moss cap for every other solid, tapering at free ends; the grove keeps
  `paintTerrain`); mid's mist stage (derived from the rects: `woodStage`); fireflies (cool, one gathering per
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
  composed for `art.anchorY` 880 and a reference camera y 800; the camera's feet line is a backdrop knob too.
- `pf-wood.ts` / `pf-branch*` are the playfield agent's; cocoons, Tatter and the swarm are the acting / swarm agents'.
