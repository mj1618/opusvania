# The Canopy: the first area built to the reference numbers (v4, 2026-10-30)

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

## Climbs as set pieces (r4, review r3 #1)
- **Bots find bugs; they are not the bar.** v3 flattened every climb to one clean face for the bots; r4 put the
  moves back and taught the bots instead: the explorer's `chimneyMacros()` (tools/solve/explore.ts: `zig<dir><n>`
  = a full jump at a face, `n` kicks on it, then a kick across at every touch; `u` up cuts (a plug), `o` out from
  under a lip first, `zig?9f` up one face cutting forward on each swing back in) and the human bots' `zigLine` /
  `zigCandidates` (tools/playtest/lines.ts, offered for any climb with an opposite face 200-700 px across).
- **Measured**: a kick across a 384 px chimney rises ~222 px (31 frames), a kick up one face ~235. A 512 px chimney
  *loses* ~47 px a crossing, 640 more: chimneys meant for kicks across are 384 wide.
- **Laying thorns on the real line**: `npx tsx tools/levels/canopy-probe.ts <room> <x,x> <feetY> <macro,macro>
  [kit]` prints every wall touch (`W2937 E2714 ...`, feet y), thorn hit and the end. A touch uses the face from
  feet-130 to feet+5 (she rises along it before she is clear). Put each strip on the face she does NOT touch, in the
  gap between that face's used zones (margins ~20), then check one face alone hits a strip within two kicks and
  probe a few start x. Done this way: the well (legs 2-3), the Elder (three legs and the plug), the Spire's neck,
  the way out.
- **Plugs** (`plug()`): rotten bark lying across a chimney, a wall panel (every cut takes it, an up cut too),
  checked solid either side by `finish()`. The explorer counts bark cuts left in its node key (`barkHp: true`):
  a wall high on a claw face takes one cut a climb. A plug cut from below must not hide the only way to a side
  passage under it (the Elder's first plug sat under its passage: the well unreachable).
- **A thorn returns her to her last safe ground**: a climber who goes over leg 1's top straight into the chimney
  never stood on the mouth's floor, so a chimney thorn sends her 1,700 px down. Give a set piece a rest she must
  stand on (or a `reform`-like return point) before its first strip.
- `npx tsx tools/levels/canopy-map.ts <room> [cell]`: the generated room in ASCII (`k` faces refusing claws, `e`
  creatures, `*` finds, `L` lamps, `P` patches).

## Gotchas (v3, still true)
- Rests carved into a wall must be **384 px tall** (a jump from the rest at once; a 256 niche bumps her head).
  Thin shelves sticking out of a wall are not rests: the human bot tries to climb their 48 px faces.
- **A ledge under a corridor's roof**: a step inside a 192 px corridor may be at most ~110 tall (she is 80).
- **A bitten cave corner can seal a doorway** (the den's balcony, v3: found only on video). Proofs now check
  `place:<id>` (feet at a `marks.places` point): add one for every entry that must reach the next floor.
- **Solids near the top edge of a `back` room**: the room has `roof: true` (sim: solid above y 0 except an `n`
  exit's span), so nothing stands on its top or flies out over a wall (the tunnel, review r3 #2).
- **A face must reach within ~250 px of the floor** to start a climb (the well's east face, the out chimney's step).
- **Thorns where a one-way drop lands are a trap**: the return puts her back on the ledge above (trunk thorn-t1 kept
  all three bots out of the giant's hall). Same for thorns in a low corridor on the only way (the well's).
- A shaft's top must open into something (the Elder's shaft was a closed tube under its gallery: check the map).
- A solid tree on a ledge blocks the walk along it; a limb end is a claw hold from below (the way out's return
  limb). A mass face above an exit takes the claws too: a climb there can reach what a jump cannot (the fork).
- The Grovemother stands on painted stilts (`stilt-w/e`, non-solid): a solid trunk to the pit floor walled the
  room in two.
- **A gated wave** (the Grove pit): a trigger sets a flag, creatures with `wakes: <flag>` appear; every creature
  carrying the same `sets` flag must die before it is set (src/sim/kit.ts, r4), and a gate on that flag opens. The
  explorer has no creatures: claims pass the flag in `flags`, and a lock claim checks the gate holds without it.
- **The old burrback's `snuffs`**: a lamp id that goes out as its phase 3 begins (the den darkens).
- **Moon shards** (`moonShard` hollows, flag `moonShard:<room>:<id>`): three make a light (`tuning.upgrades
  .moonShard.perLight`). The Canopy has three: the well's landing niche, the Elder's top, the larder.
- `phased` is not a spawn field: the old burrback's three phases come from `tuning.oldBurrback.phased` (true by
  default); the den only sets `taproot`.
- **Debug a failing claim**: `CANOPY_MAP=1 npx tsx tools/solve/canopy.ts <room>` prints the room in 64 px cells
  (`#` solid, `^` thorns, `B` bark, `G` gate / shortcut, `o` where the explorer stood).
- The placed player's free double jump is still zeroed by the harness (`createPlayer` sets `dj` from tuning).

## The human-like bots (npm run humanplay)
- `--from <room> --abilities wallJump` (with `--world`): a run that starts mid-area (r4: from the fork).
- They head away from the side of the room they entered on (`wayOn`: landing east of the hub's middle sends them
  west) and skip anything 900 px behind once an exit ahead is seen. v2's hub (landing west of the middle) sent all
  three east to the fork; v3 sends all three west to the claws.
- Runs: playtest-reports/canopy-r3, canopy-r4 and canopy-r4-fork (first-area.md has the numbers). r4: they take
  the claws and loop the west; two or three tries at the well's chimney, then away.

## Measuring
`npx tsx tools/reference/export-area.ts canopy` (`CRITICAL`, `HIDDEN_ROOMS` there; `onCriticalPath` now from
`CRITICAL`) then `area-svg.ts` / `svg-png.ts` / `metrics.ts --md`. Lamps, pods, patches and every ant count as busy
cells: thin them to get empty screens.
