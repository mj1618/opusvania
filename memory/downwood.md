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
- Painted rooms draw the old burrback (x4.4) and the carriers (x0.5) on the burrback's rig (render/enemies/index.ts
  `BEETLE_SCALE`; a carrier `under` its crack is not drawn). Before this they were greybox only.
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

## Gotchas (each cost a try)
- **An arrival-only opening is open in the engine** (`edgeOpen` ignores one-way): from inside she can walk out through
  it into nothing. Every arrival-only side opening needs the floor near it more than a jump below its span (far-crown,
  crown-tip, the Gorge's west), a bottom one a `noDrop` one-way lip (the Lookout).
- A hole in a floor on the walking line is a trap: the hub's rungs come up through a one-way, not a hole.
- `ceilingY` caps her box top: a top exit with `ceilingY: 0` can never be crossed. The Downwood sets none.
- A top exit's `at` moves the crossing line down (the Moon Perch: `at` 160, past a jump, inside a double jump).
- Two tools both ending in `downwood.ts`: the main-module guards must say `levels/` / `solve/`, or importing the
  generator rewrites the rooms.
- Biome formats the generated JSON (the generator runs `biome format` itself).
