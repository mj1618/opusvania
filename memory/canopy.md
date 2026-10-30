# The Canopy: the first area built to the reference numbers (v3, 2026-10-30)

Design, room list and measurements: docs/design/levels/first-area.md; reviews that drove it:
docs/design/levels/reviews/canopy-r1.md, canopy-r2.md; the reference data: docs/design/reference-levels/.
Open: `?world=canopy&fresh` (27 rooms `cn-*`).

## How it is made (tools/levels/canopy.ts)
- `npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json`, then
  `npx tsx tools/levels/canopy-check.ts` (world check + progression) and `npx tsx tools/solve/canopy.ts [room ...]`
  (~2 min for all 50 claims). Edit the generator, never the JSON.
- `PLACE`: each room's world rect, **at least 2560 x 1440** (throws otherwise), packed in bands that share edges (no
  holes between rooms). `LINKS`: room pairs and the shared opening (`at` = floor y on a side edge, west x on a top /
  bottom edge; `span`; `one` = the side she drops from). The constructor carves 128 px into every opening.
- **Carve, then fill**: `cave()` (bitten outline: corners cut, roof stepped up to `ceil`, walls stepped back `w` / `e`;
  `skip` x ranges keep the roof flat), `hole()` (a plain rect: claw faces, corridors), `air()`; pieces that are their
  own solid carve themselves (`bark`, `gate`, `cap`); then `fill()`. After `fill`: `mass()`, `burl()` (tiers narrowing
  up), `hang()` (tiers narrowing down, `keep` one face plumb), `limb()`, `tree()`, creatures, pickups.
- `back: true` (room) / `back()`; enclosed rooms get no moon (the constructor parks it). Every solid face takes the
  claws; `noClaws(x, y0, y1)` for a mass face, `limbNoClaws(x0, x1, top)` for a limb, `tree(..., kick)` defaults false.
- `finish()` throws if a rotten wall has air above / under it or a panel air beside it (r2: the rot cache was a
  hurdle), or a glint is stuck in mass. `dangler()` ties to the lowest roof within 320 px (bitten roofs move).
- `shortcut(id, ..., opens)`: the tunnel's door into the cellar (opens `w`, from the tunnel) and the cellar's trapdoor
  (opens `s`, from below); world routes use `door` (passable from `from`, the reverse only once open).
- Render (other builder) paints tapered stacks as terraces: prefer two big steps (`burl(..., 2)`) over many small.

## Gotchas (v3)
- **The explorer climbs one face at a time** (`climb` macros: toward a wall, jump at every slide, over the top). A
  climb must be legs: one clean face up to a rest (a floor), thorns on the face it must not use, the next leg from
  the rest across to the other wall. Rests carved into a wall must be **384 px tall** (the macro jumps at once; a
  256 niche bumps her head). Thin shelves sticking out of a wall are not rests: the human bot tries to climb their
  48 px faces (the Elder, round 3).
- **A face must reach within ~250 px of the floor** to start a climb (the well's east face, the out chimney's step).
- **Thorns where a one-way drop lands are a trap**: the return puts her back on the ledge above (trunk thorn-t1 kept
  all three bots out of the giant's hall). Same for thorns in a low corridor on the only way (the well's).
- A shaft's top must open into something (the Elder's shaft was a closed tube under its gallery: check the map).
- A solid tree on a ledge blocks the walk along it; a limb end is a claw hold from below (the way out's return
  limb). A mass face above an exit takes the claws too: a climb there can reach what a jump cannot (the fork).
- The Grovemother stands on painted stilts (`stilt-w/e`, non-solid): a solid trunk to the pit floor walled the
  room in two.
- `phased` is not a spawn field: the old burrback's three phases come from `tuning.oldBurrback.phased` (true by
  default); the den only sets `taproot`.
- **Debug a failing claim**: `CANOPY_MAP=1 npx tsx tools/solve/canopy.ts <room>` prints the room in 64 px cells
  (`#` solid, `^` thorns, `B` bark, `G` gate / shortcut, `o` where the explorer stood).
- The placed player's free double jump is still zeroed by the harness (`createPlayer` sets `dj` from tuning).

## The human-like bots (npm run humanplay)
- They head away from the side of the room they entered on (`wayOn`: landing east of the hub's middle sends them
  west) and skip anything 900 px behind once an exit ahead is seen. v2's hub (landing west of the middle) sent all
  three east to the fork; v3 sends all three west to the claws.
- Round 3 runs: playtest-reports/canopy-r3 (see first-area.md for the numbers).

## Measuring
`npx tsx tools/reference/export-area.ts canopy` (`CRITICAL`, `HIDDEN_ROOMS` there; `onCriticalPath` now from
`CRITICAL`) then `area-svg.ts` / `svg-png.ts` / `metrics.ts --md`. Lamps, pods, patches and every ant count as busy
cells: thin them to get empty screens.
