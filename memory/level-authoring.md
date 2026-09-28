# Level authoring: LDtk world, room sheets, bake, compile, world map

How to build world rooms (L5 tools). Plan and rationale: `docs/research/level-toolchain.md` §2.4.
Code: `tools/world/` (one file per job; `model.ts` is the one table of brushes, entities and fields).

## Files
- `content/world.ldtk` = the file of record (LDtk 1.5.3, GridVania, **1-tile world grid** so rooms can
  be any tile size: 70x30, 150x60...). One `content/world/<room_id>.ldtkl` per room (LDtk's own
  naming; ids use `_` there, `-` everywhere else). Never hand-edit either: use the CLI.
- `content/world.compiled.json` = GENERATED RoomFiles + world positions. `src/sim/world/content.ts`
  bundles it, so every world room is a normal sim room (`__game.load`, `?room=`, bot, tapes, dressing).
- `content/stamps/<name>.json` = small ASCII chunks for the `stamp` brush (space = keep).
- `clips/world/*.png` = rendered maps (gitignored). Commit a copy into a report if it matters.

## Section-first (preferred for a region; north star §3.3)
Author the whole region as ONE section sheet in world tiles, then cut it into rooms:
`npm run world -- section export sample` shows the format: `{"section": "sample", "rooms": [{id, at,
size, abilities, ...}], "brushes": [...], "entities": [...], "paint": [...]}` (all world tiles).
`npm run world -- section import region.json` gives every room a translated copy of each brush that
touches it (tagged `s<index>`), so a tunnel or shaft drawn across a seam bakes the same on both sides
and the openings always match (edge exits for free). Entities must sit inside one room. Import
replaces all `<section>-*` rooms and DELETES ones missing from the sheet. Per-room sheets still work
for local tweaks; their untagged brushes come back at the end of a section export.

## The loop (agents)
1. Write a room sheet (JSON; copy one: `npm run world -- export sample-cellar`). Keys: `id`
   (`<region>-<room>`, one hyphen, so `content/rooms-dressing/<region>.json` dresses the region),
   `at` (world tile of the top-left), `size` (tiles), `abilities`, optional `name hazard spawnGrace
   next draft claims notes`, then `brushes`, `entities`, `paint`.
2. `npm run world -- import my-room.json [more.json]` = create/replace, bake, compile, lint. Read the
   errors: spawn/door inside a wall, overlapping entities, unknown door targets, unreachable doors/goals
   (gravity-free flood), sealed air, edge openings that meet solid; north-star warnings: seams wider
   than 8, floor not flat 3 tiles either side of an e/w seam, non-draft rooms off the 30x17 cell grid.
3. `npm run world:render [-- --region <prefix> --scale 8]` and READ the PNG: rooms at world positions,
   30x17 screen grid with world-tile coordinates, door links (dashed), edge openings (green = joined,
   red = blocked), sealed air (orange), labels. Judge geography here, not per room.
4. `npm run world -- ascii <room>` shows the compiled rows with a column ruler: use it to put
   entities on floors (tunnel/blob roughness moves floors; always check).
5. Play it: `?room=<id>` or `__game.load(id)`; `npm run bot -- --room <id> --target exit:<char>`;
   record a tape (`npm run tape -- record ...`). Commit the .ldtk, the .ldtkl files and the bundle.
`npm run check` fails if any of them is stale (`npm run world -- build` fixes it) or doesn't compile.

## Brushes (applied in order; `add` writes `tile` (default solid), `carve` writes air)
`["fill"]` whole room (start here, then carve) · `["rect", op, [x,y,w,h]]` · `["shaft", op, [x,y,w,h]]`
· `["blob", op, [x,y,w,h], {rough, seed}]` ellipse in the rect · `["arch", op, [x,y,w,h], {thick}]` upper
half-ellipse on the rect's bottom edge (thick > 0 = a band) · `["tunnel", op, [[x,y],...], width,
{rough, seed}]` capsule path, exactly `width` tiles across (odd or even) · `["ledges", op, [[x,y],...],
len, {tile: "oneWay", thick}]` a platform starting at each point (top row) · `["poly", op, [[x,y],...]]`
vertices on tile CORNERS · `["ramp", op, [x0,y0], [x1,y1]]` stairs under the line down to the lower end
· `["oneway", [x,y], w]` · `["spikes", "up"|"down"|"left"|"right", [x,y,w,h]]` · `["stamp", name, [x,y],
{flipX}]`. Points of tunnel/ledges/ramp name tiles. `rough` moves the boundary by up to `rough` tiles
(a rough-1 tunnel of width 5 is 3-7 tall): keep critical floors on exact brushes (rect/ledges).
Single-tile specks left by rough brushes are cleaned; exact brushes are never touched. `paint:
[[x,y,w,h,"solid"|"air"|...]]` overrides the result (last-resort fixes).

## Entities (`[kind, [x,y]]` or `[kind, [x,y,w,h], {props}]`; defaults omitted)
spawn (exactly one) · respawn · goal `{optional}` · corner · door `{name, to, toDoor}` (Up-door;
`toDoor` = a door NAME in an LDtk room, or a door CHAR in an ASCII room like the hub) · source rect
`{sound, colour, locked}` · plate rect `{pressedBy}` · gate rect `{opensOn, requires, hold, moves}` ·
enemy `{type}` · pickup `{grants, id}` · rest `{name}` · prompt `{keys, until, near}` · camera rect
`{mode, value}` · lock rect `{name, requires, target, from, prelude, moves, hold, teachGate, region,
note}` (target defaults to the rect) · landmark rect `{name, note}` (map + toc only for now).
Any char-mapped entity takes `char` to pin its RoomFile character (else allocated; ~80 per room).

## L6 proof kit (sim stream B): slopes, carry, set pieces (sheet syntax; names are the contract)
**Status (end of L6 stream B):** DONE = slopes (sim for Kid/enemies/levied/shots, `ramp` grade,
`curve`, lints, `?room=lab-slopes`), source `solid`/`name`, edge exits 4 f with no fade. Every
entity below is in the model, LDtk defs and the RoomFile (`district`, `weights`, `breakables`,
`reveals`, `lights`, `barks`, `lines`, `waypoints`, `enemyRoutes`), so rooms can place them now, but
the SIM IGNORES THEM YET: carry rule, weights/breakables/reveals, `power`/`bark`/`boardLine`/
`nightStep`/`carryReset`/`steal` events (declared in events.ts, never emitted), `thiefgull`
(= a plain gull clone), grounded Down+Seize, bot/progression waypoints. Next stream: build those
against these names; the render must also draw slope tiles (they render as air today: use
`slopeTop()` from src/sim/physics/slopes.ts).
- **Level field `district`** (string). Rooms with the same district share the carry state (north
  star §3.4: bag, levied objects and ghosted sources persist across seams and doors). Unset = the
  old per-room reset. Proof: T rooms `"district": "tally"`, C rooms `"district": "cellars"`.
- **Slopes (floor only).** `["ramp", "add", [x0,y0], [x1,y1], {grade: "1:4"|"1:2"|"1:1"}]`: the
  points are the floor surface's end tile CORNERS; |dx| must be 4/2/1 x |dy|; solid fills under
  the surface down to the lower end's row (the flat floor you step onto). Without `grade` = the old
  stairs. `["curve", "add", [[x,y],...], {max: "1:1"}]`: a surface through corner points, quantised
  to the nearest flat/1:4/1:2/1:1 tile chain (max = steepest grade allowed, default 1:2), solid
  under it down to the lowest point + 1 row. Rules: the tile under a slope is solid; a slope's high
  end meets flat solid (or another slope); no spikes on slopes (lint).
- **`source` gains** `name` (other entities link to it) and `solid` (default true; false = hums but
  is not a platform/wall, e.g. the pawnbroker's chain, the furnace roar).
- **`weight` rect `{on: <source name>}`**: hangs (solid) until that source is seized, then falls;
  smashes every `breakable` it falls into (`by` includes `weight`); comes to rest as solid (it IS
  debris). T05 brass balls: three weights on the chain source.
- **`breakable` rect `{name, by: ["weight","strike","slab"]}`** (default by = weight + strike):
  solid until broken (Kid's jab/pogo = strike; a brown slab landing on it = slab). Author air under
  it (the compiler forces its tiles to air). The T05 barricade and boardwalk.
- **`reveal` rect `{after: <name>}`**: solid only once the named breakable broke (or named source
  was seized). T05's debris stair up to the roofs = a few reveal rects after the boardwalk.
- **`light` rect `{source: <name>, radius, colour}`**: a light the render draws; dark while its
  source is seized (sim event `power {name, on}`). C02: every hall light on the furnace.
- **`bark` rect `{text, speaker, once}`**: Kid entering the rect emits `bark {text, speaker}`
  (`text` = a short text id the render looks up; speaker e.g. `pawnbroker`, `copyist`). With
  `speaker: "board"` it emits `boardLine {text}` instead (T04 LOT 19). once defaults true.
- **`line` rect `{name}`**: a district line (Registry threshold): Kid touching it resets the carry
  (sounds ribbon home, event `carryReset {reason: "line"}`). Put it at the T04 hatch.
- **`waypoint` point `{route, order}`**: an ordered path. Thief gulls fly it after a snatch
  (`enemy {type: "thiefgull", route}`); the bot/progression uses routes as staged searches in big
  rooms (spawn → w0 → w1 ... → target) when a direct search runs out of budget.
- **Enemy `thiefgull`** (+ enemy field `route`): snatches the newest deed from the bag (or a
  landed levied object), flees along its route, perches at the end; a hit or a Catch makes it drop
  the sound, which falls as a levied object (a pink puck lands as a spring). T03.
- **Hatch you seize from under yourself (C01)**: a solid `source`; grounded Down+Seize now aims
  down, so standing on it and seizing drops you through.
- Corners reset the carry (`carryReset {reason: "rest"}`), as does being Counted Out.

## Edge exits (sim, L5)
- Derived, never authored: a border opening becomes an exit when the neighbouring room has the
  mirror opening over exactly the same world tiles. The compiler writes `exits` into the RoomFile.
- Sim: outside the room is open 2 tiles deep along the span (`EDGE_DEPTH`); when the body's centre
  crosses, a `world.edgeTransitionFrames` (4, <= 8; L6) freeze with no fade (roomExit/roomEnter carry `edge: true`; render skips the fade), then `enterRoomAt` moves the body by the rooms' offset and
  keeps the WHOLE player state (vx/vy, facing, timers, coyote, Chin). Abilities come from the room
  (gym semantics), respawn marker and safe ground reset. Rooms with exits must be >= 30x17 (padding
  would shift the world). Tests: tests/unit/edge-exits.test.ts, tape `sample-cellar-edge`.
- Tools: an `edge` entity per exit (`char` = `e17` = side + first tile), bot/progression target
  `exit:e17`, arrival spawn `edge-e17` in the room it belongs to. Progression links them like doors.
- Not done: camera bleed / neighbour peek (the view clamps to the room, so you arrive at the screen
  edge), arrival input grace, the merged-region option. Up-doors stay for real doors and lifts.

## Rules and gotchas
- `draft: true` rooms load in the game but are NOT in the progression graph (no hub link needed).
  Clear it when the region is wired to the hub and has tapes/claims. `sample-*` and `port-*` are drafts.
- `port-*` rooms are exact ports of gym-14, lot-7 and yard (`npm run world -- port <room> --id ...`):
  tests prove they compile to the same RoomFile and replay the originals' golden tapes. The ASCII
  originals are still the ones the game uses; delete the ports if they get in the way.
- LDtk editor: code owns `defs` (world.test fails if they drift); Collision is generated (paint in
  `Paint`); a human saving in LDtk reformats the JSON once (harmless) and the project's AfterSave
  command runs `npm run world -- build`. Our files pass LDtk's official JSON schema (vendored), but no
  human has opened them in the editor yet: do that at the first taste checkpoint.
- Bake maths: tile-centre sampling, + - * / sqrt floor only (no sin/cos/pow: engines differ), seeded
  integer hashes. Never change a brush's raster without expecting every room using it to re-bake.
- No new dependencies: schema checker (`schema-check.ts`) and PNG encoder (node:zlib) are ours.
