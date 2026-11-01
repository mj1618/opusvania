# The Downwood: the place-level demo (2026-10-20)

The design is docs/design/places/1-downwood.md (+ .json), picked from three by the reference-map rules
(docs/design/reference-maps/README.md, docs/design/places/BRIEF.md). This is the built thing: how it is made, how it is
proven, what is in it and what is not.

## Open it
- `?world=downwood&fresh` (its own save slot `lampfall.save.downwood`). `?room=dw-<id>` boots a room in its world.
  `__game.goto('dw-hub', 2800, 2040)`, `__game.grant('wallJump', 'glide')`.
- Rooms are `dw-<design id>` (`dw-hub` is the Split Oak, `dw-east-boughs` the Lampwalk, `dw-floor-west` the
  Fernfloor, `dw-floor-east` the Brook, `dw-roots-west` the Root Tangle, `dw-roots-east` the Drowned Roots,
  `dw-antechamber` the Seed Door, `dw-vault` the Heartwood, `dw-crown-tip` the Snapped Crown, `dw-far-ledge` the
  Swallows' Ledge, `dw-gorge-shelf` the Thorn Run, `dw-carrier-crack` the Ant Crack, `dw-bark-floor` the Rotten Floor).

## How it is made (tools/levels/downwood.ts: edit it, never the JSON)
- **One engine room per design room**, at the design's screen rect (1 screen = 1920 x 1080). The room list and every
  link are read from docs/design/places/1-downwood.json, so the room graph is the design's by construction. All 46 rooms
  are one generated file, content/worlds/downwood-rooms.json (one spread into `FILES`); the world is
  content/worlds/downwood.json.
- Each link is an exit pair on the shared edge at the world coordinate in `AT` (side doors: the door's floor y; tall
  spans for the glide gaps) or `ATX` (top / bottom: opening x0, width). `shell()` cuts the openings into side walls
  (T = 160) and the ceiling (CEIL = 120); `floor()` cuts bottom exits; `climbTo()` hangs one-way rungs under a top exit
  (the two-way vertical links: the upper room's floor is 120 thick, so the hop from the top rung lands beside the hole).
- Every face is `kick: false` unless it is a claw climb. `routes` are generated from the design links (a middle
  place `mid` to every exit and find; a locked link's exit `needs` its ability, `flags` `seeds:n` / the Weaver's flag,
  or passes the shortcut `grate` / `flap` from below). The world check runs on them; the solver proves them.
- Bands (Lanternroot's painter, memory/lanternroot-art.md): the Crown, the Boughs, the shafts and the Gorge `night`; the
  Split Oak's inside (the hub, the Hollow, the Heartwood, the Glass Crack, the Bark Stair) and the Floor `hall`; the
  Roots `roots`; the Seed Door, the Weaver and the Valley Mouth `cache` (the brightest place). The hub as `night` read
  as platforms in a void; as `hall` it is the inside of a great tree with moonlight falling through the split.

## New pieces
- **Moonseeds** (the keys): `moonseeds: [{id, x, y}]` (src/sim/finds.ts). Touched: `taken` gets `room:id`, flags get
  `seed:room:id` and `seeds:1..n` for the n held, event `seedTaken {count}`. A door that counts is a plain flag gate on
  `seeds:3` (the Seed Door) / `seeds:5` (the Heartwood's knot). The world check counts seeds reached into those flags.
  Render: a pale winged seed bobbing in its light (render/lantern/kit.ts); a seed gate draws its sockets, one lit per
  seed held; the item line says how many are held.
- Painted rooms draw the old burrback (x4.4) on the burrback's rig (render/enemies/index.ts `BEETLE_SCALE`) and the
  carriers as ants (render/enemies/ant.ts since Canopy r22; a carrier `under` its crack is not drawn).
- The explorer (tools/solve/explore.ts) gained `allExits` (several crossings per exit) and dash macros (with dash owned).

## The proof (tools/solve/downwood.ts, `npx tsx tools/solve/downwood.ts --write`, ~30-40 min)
- A **world search over arrivals**: an arrival is her state right after the sim carried her into a room. From each
  new arrival the explorer searches the room (creatures out); each exit it leaves by is played on through the crossing
  into the next room: a new arrival. Stages have a fixed kit (glades taken out): s0 none; s1 claws (the old burrback
  down); s2 claws + glide + the five seeds; s3 + the Weaver down; later-dj / later-dash.
- Each stage twice: lamps **spent** at every arrival (nothing a lamp gives is needed: the lower bound) and lamps
  **kept** (every lamp relit after every move: the skip hunt's superset). Both must equal the exported layout's reach
  for that kit (tools/levels/downwood-export.ts, place-score's input read from the built world). Report:
  tools/solve/downwood-report.json.
- `npx tsx tools/levels/downwood-export.ts`: the built layout + its place-score. `downwood-check.ts`: the world check
  (the Moon Perch and the Lone Limb are named as later locks). `downwood-parse.ts`: every room's first schema problem
  (the scene module throws at the first bad room on load). tests/unit/downwood.test.ts: check, design = built, score,
  seeds.

## Fights in the built rooms
- The old burrback in `dw-den`: `npm run humanplay -- den --room dw-den --skills average,skilled,casual --seeds 1,2 --at
  1700` brings it down in 5 of 6 (0:47 to 2:29; one casual timed out at 4:00).
- The Weaver in `dw-weaver`: `npx tsx tools/playtest/weaver-run.ts --room dw-weaver` wins in ~48 s (1 hurt). The bot
  knows lab-weaver's numbers, so weaver-run shows it the room moved back (`labView`). The arena must be lab-weaver's
  exactly: its columns take kicks (my helper's `kick: false` default stalled the bot in phase 1) and its east trunk
  has its window.

## Gotchas (each cost a try)
- **A claw face under a door ledge is a dead end**: she climbs into the ledge's underside. Climbs are faces whose top
  IS the door's floor (a bark block), and a face must reach down to where she stands (the Brook's root ran 200 px
  short: never met). A climb into an opening above needs a spine standing under that opening (the Hollow's glass,
  the chimney's heartwood, the Glass Crack's face continuing the hub throat's wall at the same world x).
- **Up through a top edge** used to drop her back (memory/world.md): fixed in the sim (`TransitState.vy`).
- **Traversal never needs a lamp** (a flung lamp is out for good): the Lampwalk's thorn bed became a patch a jump
  clears, the Brook got isles. The solver's spent run is what catches these.
- A wall top level with a glide opening is a ledge beside it (`noSill`); a tip within ~600 px of a glide opening
  is crossed by a running coyote jump.
- **An arrival-only opening is open in the engine** (`edgeOpen` ignores one-way): from inside she can walk out through
  it into nothing. Every arrival-only side opening needs the floor near it more than a jump below its span (far-crown,
  crown-tip, the Gorge's west), a bottom one a `noDrop` one-way lip (the Lookout).
- A hole in a floor on the walking line is a trap: the hub's rungs come up through a one-way, not a hole.
- `ceilingY` caps her box top: a top exit with `ceilingY: 0` can never be crossed. The Downwood sets none.
- A top exit's `at` moves the crossing line down (the Moon Perch: `at` 160, past a jump, inside a double jump).
- Two tools both ending in `downwood.ts`: the main-module guards must say `levels/` / `solve/`, or importing the
  generator rewrites the rooms.
- Biome formats the generated JSON (the generator runs `biome format` itself).

## State (2026-10-20, parked)
**Done**
- All 46 rooms are built, painted and linked. The built layout scores 25/25 on place-score.
- The world check passes, except for the two later locks, which the check names on purpose.
- Solver (last full run, before the dressing pass), lamps spent and kept: each stage's rooms equal the layout's
  reach, s0 19, s1 35, s2 43, s3 44, later-dash 45. Link check (`downwood-links.ts`): 121 link-ways passed, all 15
  dead ends entered, all 29 finds reached. Known exceptions:
  - The double jump also opens the Lone Limb (meant to be dash only).
  - The Black Pool's glide lock is the water inside the room, not its door. With claws she crosses the Hollow's door
    to an isolated sill and back.
  - weaver -> antechamber: a root to climb back up was added after that run, and the run that would prove it was stopped.
- Both fights work in the built rooms (the old burrback's bots, the Weaver's bot).
- `npm run check` passes.

**Next**
1. **The density pass (the coordinator's note: rooms read empty and boxy, especially the hub and the West Fall).**
   `dress()` and `DRESS` are a start: hummocks, shelves with leaf-pods, glint arcs, hanging pods, a juvenile per
   stretch. They are only partly in, and the hub still reads as one long floor. Still to do:
   - every room's "within reach" list from the design's density table, visible on screen;
   - the shafts (the West Fall, the Rain Chimney, the Hollow) as places to stop: wall wicks, danglers, ledges;
   - terrain broken up beyond rectangles;
   - the Split Oak reading as a split giant oak from the outside. The `scar` mark (a lightning seam) and the `glow`
     mark (the great lamp seen through the hub's grate, the Hollow's foot, the Seed Door) are in, but not judged.
   Shoot mid-room frames (`__game.goto` + screenshot), not only the spawn stops, and compare them with test-grove.
2. Re-run the solver after the dressing: `npx tsx tools/solve/downwood.ts --write --max 6000` (~2.5 h for every
   stage; `--stage s0,s1,s2 --lamps kept` is the lock hunt, ~25 min), then `npx tsx tools/solve/downwood-links.ts`.
   Dressing keeps clear of the locks (`avoid` ranges, 260 px from exits), but only the solver proves it.
3. Not built yet:
   - the hatching (the cocoon) and the swarm;
   - the Weaver glimpsed through the Seed Door;
   - the freed moths spiralling out of the fork after glide, and the grate going cold after the Weaver;
   - water drawn in the hall-band pools.
