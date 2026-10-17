# The world: rooms linked by placement (tech stage 1, 2026-10-17)

A region plays start to end: rooms sit in world px (`content/world.json`), exits link where neighbours'
openings meet, the sim swaps rooms itself, render rebuilds per room, the save persists (memory/save.md).
Code: `src/sim/world.ts` (links, `enterRoom`, shortcuts), `src/sim/progress.ts` (patches, glades, shortcuts,
seen), `src/scene/world.ts` (`GAME_WORLD`, the world check), `src/render/lifecycle.ts`, `src/render/map/`.

## world.json
```json
{ "start": "wood-hatch",
  "rooms": [{ "id": "wood-hatch", "x": 0, "y": 0 }, { "id": "wood-chase", "x": 5760, "y": 2816 }, ...],
  "tests": ["test-grove", "lab-lamps"] }
```
`rooms` = the world graph (placed, linked, on the map, checked); `tests` = playable by `?room=` / `goto`, no links.
A room file must also be one import line in `FILES` (`src/scene/index.ts`; tsx tools cannot glob).

## Room JSON additions (all optional; ids are forever: `room:id` in the save)
| field | shape | what |
|---|---|---|
| `exits[].oneWay` | `true` | a drop: she leaves by it, never back. Set on the side she leaves; the mirror is arrival only (crossing it does nothing) |
| `patches` | `[{id, x, y}]` feet point on ground (`stands` check) | moon patch: box `patch.width` 128 x `height` 192 over the foot. Grounded + still `patch.restFrames` (30), or a press of up: full health, `save.patch`, `patchRest`. Once per stay |
| `glades` | `[{id, x, y, w, h, ability}]` rect | box centre inside: grants `ability` once (`save.taken`), `gladeGrant {id, ability, x, y}` |
| `shortcuts` | `[{id, x, y, w, h, opens: n/s/e/w}]` | a solid while shut (added by `withShortcuts`); her box touching the face on the `opens` side (pushing into a `w` face, head on an `s` underside...) opens it for good (`save.opened`, `shortcutOpen`) |
| `doors` | `[{id, x, y, to: "room#door"}]` foot point | non-edge link: press up standing in it (96 x 160): she comes out of the target door at rest |
| `routes` | `[{from, to, needs?, oneWay?, door?}]` | reachability claims for the world check (ids of exits / doors / patches / glades / `spawn`). Absent = the room is open inside. `door`: the way passes that shortcut, which opens from the `from` side |

## Linking and the crossing
- Exit `e` of room A links to the exit on the opposite edge of a placed room whose opening lies on the same world
  line and overlaps it (most overlap wins). The check wants the spans EXACTLY equal (standard spans: side exits
  4 tiles tall at floor level, top/bottom 4 wide; world.md §5.5). The `at` trigger line is not part of linking.
- No mirror at runtime: the old fallback (hold `exitFrames` 36, the room restarts). The check reports it.
- Crossing (sim, `step(..., world)`): `roomExit {id, edge, frames, to}`; for `room.transitionFrames` (18 = 0.3 s)
  she goes on with the input she held as she crossed (directions + jump, no new presses) and nothing else moves;
  then `enterRoom`: her whole PlayerState kept (speed, glide, timers), moved by the rooms' offset, **placed exactly
  `entryInset` (24) inside the mirror opening on the crossing axis** (the dip carried her past the edge in the OLD
  room's geometry: once it tunnelled her through C's gate) and inside its span along it, lifted out of solids
  (<= 96 px), safe ground = the ground under her (else the spawn). The room's local state is rebuilt from scene +
  save; `roomEnter {room, from: "A#exit"}` + `spawn`. `Game.stepOnce` swaps `game.scene` when `state.room` changes.
- **Seam hysteresis** (2026-10-18, area 1 video r4 #7: a casual run crossed the crown/canopy seam 190 times in
  3.5 min, each a fade): after an edge entry the opening she came in by is shut for `room.seamLockFrames` 60
  (`state.seam`, room-local): an east / west one becomes a wall just outside the edge (she stands `entryInset` inside
  it, clear), and no opening of hers carries her back (`crossedExit` skips it; at a top or bottom edge she is just
  not carried, since a body that came up through a floor still overlaps its line and a solid there would trap her).
  So turning straight back waits a second, and no seam swaps rooms twice within one (`seams.test.ts`: every two-way
  seam of the world, jittery hands; without the lock most of them fail). Not done: the plan's "fire only 64 px past
  the edge" (past an edge there is no floor: she would fall before the swap).
- Doors: same hold, she comes out at the target door's foot at rest.
- The hatch exit (`at` 1790, 1026 px above wood-hatch's bottom) lands her at the top of the room below, falling.
- A fade with `save.patch` set re-forms her at that patch in any room (`roomEnter {from: 'reform'}`, `reform`,
  `spawn`), whole, creatures fresh. Without one: the old rule (last light / safe ground). Fall catches unchanged.

## The world check (`validateWorld`, tests/unit/world.test.ts, in `npm run check`)
Mirrors (exact spans; not both one-way), no overlaps, door targets exist, the room graph connected, then the
symbolic progression from `start:spawn`: BFS over `room:thing` nodes (routes or all-to-all inside, links between),
abilities from glades reached and shortcuts opened from their open side added until nothing grows. Every placed
room and glade must be reached; from every reached node a moon patch must be reachable with what she had when she
got there (no softlock). `progression(world)` returns the order abilities are found. Boot logs problems as
`[world]` warnings (the page still runs).

## The lab-world (greybox test rooms since 2026-10-18)
A 2560x2816, B 2560x1536, C 2560x1280: arrival + patch P1 + one-way stairs, a wick and a one-way `hole`, the glide
glade + an 800 px glide gap + a burrback + the `gate` shortcut; loop A -> B -> C -> A. They were the first world under
wood-hatch's drop; wood-chase took that place, so they are `tests` in world.json now (unlinked in the game).
`tests/unit/world.test.ts` links them on their own (`LAB_WORLD`, the old placement A (5760, 2816), B (8320, 2816),
C (8320, 4352)) for the engine's crossing / patch / glade / gate / re-form tests; `?room=lab-world-a` and `goto` still
work (a crossing there restarts the room: no link). The wood's rooms: memory/rooms.md "The wood, greybox".

## A designer's new connected room
1. `content/rooms/<id>.json` (id `<region>-<name>`, `region`, greybox `art`), one import line in `FILES`.
2. Place it in `world.json` so its openings meet the neighbours' (same world line, same span); give both sides
   the exit (`oneWay` on the side she drops from).
3. Patches / glades / shortcuts / doors as above; `routes` where an ability or a shortcut gates the way.
4. `npx vitest run tests/unit/world.test.ts` (the check), then play it: `?room=<id>` or `__game.goto('<id>')`.

## Render lifecycle (src/render/lifecycle.ts, stage.ts)
- `RenderStage.rebuild()` on a room change: post filter, `SceneRenderer.destroy()` (module `destroy?()` for off-tree
  parts, then `destroyTree(layers.root)`), character / giving destroy (listeners), lights cleared,
  `TexturePool.clear(true)`, then build. HUD, overlay (`setScene`), dip, room fade and the map persist.
- `destroyTree`: Graphics WITH their context, mesh geometries **with buffers** (`destroy(true)`), shaders, filters,
  textures of sprites / meshes / shader bind groups. **`shader.resources` does not enumerate** (accessor): read
  `shader.groups[i].resources`. Module-level texture caches are marked `shareTexture()` and survive.
- **The ~700 MB heap** (tech.md §6) was the grove's: Pixi v8 `Graphics.destroy({children: true})` keeps the owned
  GraphicsContext, and the renderer caches each context's tessellated geometry until the context is destroyed, so
  every baked background shape stayed. `{children: true, context: true}`: the grove 691 -> 174 MB after GC
  (507 -> 55 MB JS), wood-hatch 154 -> 99 MB. Bakes also dropped quad geometries without their buffers (fixed).
- `npm run leak` (dev server, real GPU): 20 swaps wood-hatch <-> lab-world-a: heap 34 -> 39 MB, GPU textures 103
  (561 MB) in the hatch / 18 (12 MB) in the lab every time, GPU buffers 192 -> 220 (Pixi's batch pool). Greybox
  swaps: flat. A painted build takes ~140-170 ms on M-series, a greybox one ~5 ms. Before the fixes each painted
  build leaked ~15 textures (~245 MB GPU) and ~200 buffers. e2e `tests/e2e/world.spec.ts` asserts greybox swaps.
- Remaining Grove-shaped module state (memory/rooms.md) is reset per build by `setRoomLook`; POST.enabled is set per
  room (greybox off, painted back to what the page booted with).

## Map v1 (Tab; `__game.map(on)`)
`src/render/map/index.ts`, screen space over the HUD; the game freezes while it is open (realtime only). Drawn from
the visited placed rooms' rects (scaled to fit, <= 1/8): room boxes with ids, solids, one-ways, shut shortcuts
(amber), moon patches seen (ringed: her save patch), lures seen (warm dot burning / grey ring out), glades not taken
(white diamond), exits seen and not crossed (green; arrival-only openings never), her (pulsing). "Seen" is sim-side
and saved: within `map.seeX` 1000 x `seeY` 600 of her, every `map.seeEvery` 10 frames.
