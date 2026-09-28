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

## Edge exits (sim, L5)
- Derived, never authored: a border opening becomes an exit when the neighbouring room has the
  mirror opening over exactly the same world tiles. The compiler writes `exits` into the RoomFile.
- Sim: outside the room is open 2 tiles deep along the span (`EDGE_DEPTH`); when the body's centre
  crosses, a `transitionFrames` freeze, then `enterRoomAt` moves the body by the rooms' offset and
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

## The proof region (L6): `content/world-sections/proof.json`
- One section sheet, two regions (`"regions": ["tally", "cellars"]`; ids `tally-*`/`cellars-*`, so
  `content/rooms-dressing/tally.json` = pink and `cellars.json` = brown). Import:
  `npm run world -- section import content/world-sections/proof.json`; export needs
  `section export proof --regions tally,cellars`. Map: `npm run world:render -- --region tally,cellars`
  (copy in docs/design/proof-section.png). Start: `?room=tally-yard` or hub door F.
- Strata as built: street rooms are 2 cells at y -17..17 with the street floor at row 0 (one screen of
  air, gutter-level pockets below); T09 roofs floor -20 (y -51..-17); the Cross 3x3 at -34..17;
  cellars floor 38 (C01/C02 at 17..51). Sample/port rooms were moved to y +166..264 to make room.
- **Route driver**: `npm run world:route -- tools/world/routes/proof.ts [--out f.txt]` plays the whole
  route on the headless sim in WORLD tiles (walk/jump/act/until, follows edge exits) and prints one
  input-DSL script for `npm run clip -- --room tally-yard --script "$(cat f.txt)"`. Full route = 96 s.
- Gotchas found: no step-up, so ramp stairs need a hop per 1-row step (fix = slopes); a Seize can't
  take a source flush with the floor under you (ground Down+Seize whiffs), so hatches/bolts are lids
  1 row proud of the floor; a forward-thrown pink spring lands ~2.5 tiles ahead, so put the creaking
  stall 2-3 tiles before the gutter; a 10-frame edge-transition freeze eats held Jump frames in
  scripts; one-way ledges must sit >= 1 body height from a horizontal seam (else ping-pong);
  `pickup` needs `grants` (collectibles are `landmark` `pickup:<id>` placeholders for now); ANY
  pressed plate opens EVERY plate gate in a room (C02's pan opens the round door too); progression
  treats doors into draft rooms as stubs.
- Placeholders waiting on the sim (landmark names): `receiver-cart` (intro throw + furniture crash on
  the cart's seize), `brass-balls` (drop on the chain source's seize; the chain is the barricade now),
  `pickup:*` (poundage, tally-ledger, chin-piece, cellars-ledger), `pawnbroker`/`copyist` barks,
  `ticker-board` line, `clerk-balcony` silhouette, `great-scale` pans (need gate->plate linking and a
  rising pan), furnace lights dying (source-powered lights), Gull snatch-and-flee (T03 gull).
- Not done: landmark rendering (nothing draws landmarks in game yet; the Board/Bell tower beacons are
  the camera stream's), zoom shots, carry rule (bag resets at every seam), guard metrics tool,
  non-draft promotion (progression + tapes), the ghost Row, slopes (stairs stand in).
