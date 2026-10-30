# The Canopy: the first area built to the reference numbers (v5, 2026-10-30)

Design, room list and measurements: docs/design/levels/first-area.md; reviews that drove it:
docs/design/levels/reviews/canopy-r1.md .. canopy-r4.md; the reference data: docs/design/reference-levels/.
Open: `?world=canopy&fresh` (27 rooms `cn-*`).

## How it is made (tools/levels/canopy.ts)
- `npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json`, then
  `npx tsx tools/levels/canopy-check.ts` (world check + progression) and `npx tsx tools/solve/canopy.ts [room ...]`
  (~10 min for all 55 claims since r4 counts bark cuts). Edit the generator, never the JSON.
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
- **r4's strips were frame-perfect** (review r4 #1): laid in the gaps between one zig's touches with ~20 px margins,
  they passed only at a kick delay of 0-4 frames from one start x. A late kick slides her 20-40 px lower and the
  error adds up kick by kick (touches drift ~17-34 px a kick at a 6-10 frame delay), so a strip that picks the phase
  is a trap for a person.
- **v5's rule: a strip on one face at a time, a clean stretch on both where she changes wall.** A person reads
  "thorns on that wall: climb this one, cross above them". Climbing one face is always possible (one wall is
  enough: movement-controller.md), so the strips decide which face, never when. A change of wall needs ~470 px
  between the strip she leaves behind and the one ahead (her touch on the old face >= 64 below the strip over it,
  the touch on the new face, ~222 higher, >= 64 above the strip under it, over a 235 px kick spacing and the drift);
  shorter legs get one strip. A face that starts a climb reaches within ~190 px of the floor (a late kick at a
  falling touch slides off a face's foot: root lips, `mass(x, y, 64, 128)`). A rest in a chimney wall gets a root
  lip into the chimney (`oneWay(face, floor, 128)`): from its end the far face is a jump away (a standing jump from
  inside the rest misses the far face and falls down the leg below).
- **The fairness test** (`tools/levels/climbs.ts` CLIMBS + `tests/unit/canopy-climbs.test.ts`): every required climb
  (and the Elder) from three start x on its rest, a person's plan (`face` legs: kick up this face until a touch at or
  over `until`, then across; `zig`; `away` out from under a lip; `jumpAt` walk to the lip first; `cut` up cuts), at
  kick delays 0 / 6 / 10 with every strip grown 64 px at both ends; `fails` plans (one face only) must hit a strip,
  and the thorn must put her back on the rest she started from. CLI: `npx tsx tools/levels/climbs.ts [id] [--margin
  64]` prints every touch. Lay a strip from the CLI's touches, then run the test.
- `canopy-probe.ts` still plays the explorer's macros (frame-perfect zigs) for the proofs.
- **Plugs** (`plug()`): rotten bark lying across a chimney, a wall panel (every cut takes it, an up cut too),
  checked solid either side by `finish()`. The explorer counts bark cuts left in its node key (`barkHp: true`):
  a wall high on a claw face takes one cut a climb. A plug cut from below must not hide the only way to a side
  passage under it (the Elder's first plug sat under its passage: the well unreachable).
- **A thorn returns her to the last ground she stood on** (`groundX/Y`, any length of time, not `safeX`): r4's
  climber who went over leg 1's top straight into the chimney was sent 1,700 px down. v5: the chimney stands east of
  leg 1's top under the mouth's roof, so she lands on the mouth's floor first. Ground near a living creature is not
  ground for this (`safeEnemyPx` 200): no creature keeps a rest (r4's landing lampwing). A rolling limb can fail it
  too (her centre over a rect 4 px lower than the one she stands on).
- **The return walk could end inside a wall** (fixed in src/sim/return.ts, r5): `clearOfThorns` steps back along the
  top's rect, and the well landing's floor rect ran west under the mass and a rotten wall: she was put inside the
  bark and squeezed up 1,500 px. It now stops at the first spot her box does not fit.
- `npx tsx tools/levels/canopy-map.ts <room> [cell]`: the generated room in ASCII (`k` faces refusing claws, `e`
  creatures, `*` finds, `L` lamps, `P` patches).

## Gotchas (v3, still true)
- **Floor thorns sit in a shallow pit** (64 deep, r5): a flat bed on the way is floor the human bots (and tired
  people) walk into; a pit reads as a gap and gets jumped. Tier 2's bed under its 256 px roof was unjumpable: a
  jump bumped the roof and came down in it from any lip (the roof lifts over it now). Check a bed under a low roof
  with a real jump.
- **A creature spawned inside a kit solid is sealed in** (v4 video: the Grove wave's juveniles inside the bounce
  caps: never move, never cut, the wave's gate never opens). `finish()` now throws on a spawn inside a solid, cap,
  gate or bark (walkers probed at their feet and shoulders).
- **The den's solid shelves vs phase 3**: a ram pulls up under any roof lower than `strikeHeadroomPx` (200; v4's
  shelves left 160, so phase 3 opened only on a wall or the taproot, won by waiting by the root: fight.ts `DEN_HOLD`).
  v5: the shelves are at 1088 (256 over the floor, a full jump), 384 wide, 224 clear underneath. Any roof a boss
  rams under keeps >= 200.
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
- r5 (canopy-r5, canopy-r5-fork): claws at ~1:05, then loops of well / rot / trunk (their chimney lines choose the
  face from the map and climb leg 2's thorned east face); from the fork two of three climb the claw face and fight
  the Grove's wave. They see no pickup under a cover until inside it or its bark is broken (observe.ts, r5: the
  hub's covered hoard drew six jumps in r4). They walk into flat floor thorns: put beds in shallow pits.

## Measuring
`npx tsx tools/reference/export-area.ts canopy` (`CRITICAL`, `HIDDEN_ROOMS` there; `onCriticalPath` now from
`CRITICAL`) then `area-svg.ts` / `svg-png.ts` / `metrics.ts --md`. Lamps, pods, patches and every ant count as busy
cells: thin them to get empty screens.
