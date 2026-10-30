# The Canopy: a first area built to the reference numbers (v3, 2026-10-30)

The question: the test grove is dense and fun at 4 screens; does that scale to a whole first area? The method: map the
reference games' first areas to scale (`docs/design/reference-levels/`), take their numbers as targets, build to
them, then measure the build with the same tool and draw it at the same scale. Open it: `?world=canopy&fresh`.

v1 (six huge boxes of sky with logs, every room on the road) scored 3.5/10 in review round 1
(`reviews/canopy-r1.md`). v2 is the answer to that review, built from `canopy-v2-brief.md`: **mass with rooms carved
out**, 24 rooms of 1-5 screens, 14 of them on the critical path.

## What the references say a first area is (README there, with sources)
- 30-60 min, 80-330 screens. Enemies 0.2-0.5 a screen on average, but in peaks: 40-60% of rooms have none, the
  densest reach the grove's density.
- 20-36 secrets near the route, mostly breakable walls and hidden rooms; every dead end pays a major.
- The first ability far and low, used at once, doubling the world; locks shown long before keys; a quiet hub.
- Their maps are black mass with beige carved into it (35-50% solid); 25-77% of rooms on the critical path.

## The build: v3, 27 rooms, 83 screens (tools/levels/canopy.ts)
Every room starts solid and its caves are carved; what is left becomes `root` (or the deep's `ground`) masses the
wood kit paints as bulk. v3 answers review round 2 (`reviews/canopy-r2.md`):
- **Rooms at least 2560 x 1440** (21:9 plus headroom; the generator throws otherwise), packed in bands that share
  edges, so the map has no holes between rooms (`PLACE`).
- **Bitten caves** (`cave()`): the top corners cut, the roof raised in irregular steps, the walls stepped back;
  `hole()` for what a mechanic needs straight (claw faces, corridors). Pillars and humps are tapered `burl()`s (two
  large steps where the reach allows), hanging clumps `hang()`.
- **Two branches of ~10 screens**: west, rot > crawl (a low tunnel winding down and back) > webs (the weaver's orb web
  over its lamp) > the Elder's room (a chimney climb to the moonDrop; its plug opens into the well); east, cellar
  (ants, a trapdoor that opens from below) > galleries (the ants' nest, a burl stair) > larder (the moonDrop behind a
  claw face). The tunnel's shortcut (opens from the tunnel) closes the deep into the cellar and the fork.
- **Every climb has a twist**, built as legs: each leg goes up one clean face to a rest carved into the other wall,
  thorns on the face it must not use (the well: east to the giant's mouth, west to a landing, east to the hollow;
  the Spire: east to the nook's mouth, then the west face under a hawker on its lamp's rhythm; the Elder's chimney;
  the kin: in from a limb over thorns). The limbs' gap is at the jump's edge (384 across, 192 up) over thorns.
- **The glide on the path after the gap**: the tunnel's thorn pit (1120 px from the hump, only the glide), the way
  out's door on a ledge 1344 px across the valley (no claws on its face); a glide-only shelf in the fork's sky.
- **Secrets that teach and hold**: the giant's rotten wall is the only way on from its first hall (minute two:
  the wood breaks); rot's two walls fill floor to roof; the hub's, the Grove's and the bower's panels became walls;
  `finish()` throws if a rotten wall has air above or below it (or a panel air beside it).
- **The hub reads west**: she lands east of its middle; the root floor steps down west into the giant's mouth, lit
  by a lamp with its moths under the high block. All three human-like bots now go west first (v2: none did).
- **The den** is 2688 wide (wall to wall at 21:9), two escape ledges 192 up, the taproot by the gate, the camera
  zone over the whole arena; the old burrback is phased by the sim's default tuning (no spawn field).
- **The way out**: a root chimney to a cliff lip, the valley 1600 px below (thorns), the next area's door on a ledge
  across (a glide), the way back up the door-oak and along its high limb; landmarks `valley` and `mountain` and a low
  moon (art) for render.
- **Thinned**: 82 glints (v2 193), pods only in the Grove, 37 creatures: 57% of screens are empty again.

```
            sky (hawker roost, night eyes)   crown* (glide)
               |                                |
 hatch*     gap* (glide to the far limb, seed 3) -- bower* (kin climb) -- attic (dangler nest, long breath)
   | drop      | drop to hub    \ drop to fork          | (arrival up the Spire)
 limbs* -- hub* (lands east, lit way west) -- fork* (claw face, glide shelf) -- grove* (Grovemother) -- spire* -- nook
   |  \        | seed door        | panel > stairs                                                 \ wall
 well* trunk* (rotten wall,       cellar (ants, trapdoor) -- galleries (ants' nest) -- larder        hollowroot
 | | |   seed 1) | panel            |  shortcut (from the tunnel)
 | | rot (walls) tunnel* (glide over the pit) -- den* (arena) -- out* (cliff, valley, door across)
 | |  | panel     | panel                                          | wall + shaft
 | | crawl        burrow (stone, dark)                             ledge (hoard)
 | |  |
 | webs (orb web) -- elder (moonDrop, chimney; plug into the well)
```

## Measured (tools/reference/metrics.ts, against the references)

| metric | HK | Ori | Nine Sols | Canopy v2 | **Canopy v3** |
|---|---|---|---|---|---|
| rooms | 48 | 22 | 39 | 24 | **27** |
| screens | 329 | 88 | 172 | 60 | **83** |
| rooms on the critical path | 25% | 77% | 72% | 58% | **52%** (14) |
| solid share of the room boxes | 0.35 | 0.5 | (traced) | 0.43 | **0.51** |
| enemies per screen | 0.31 | 0.18 | 0.27 | 0.58 | **0.43** (every ant counts) |
| enemy kinds | 30 | 9 | 11 | 6 | **9** (+ web, weaver, carrier) |
| majors | 23 | 21 | 15 | 25 | **28** |
| minor pickups | 6 | 10 | 8 | 193 | **82** |
| saves | 8 | 2 | 5 | 5 | **4** |
| hazard runs | 0 | 6 | 5 | 29 | **25** |
| screens with nothing in them | 65% | 63% | 66% | 35% | **57%** |
| longest run of empty screens | 15 | 6 | 9 | 5 | **8** |

Rooms all at least 2560 x 1440; the world's rects share edges (no holes between rooms; one notch under the burrow
opens to the outside). Secrets: the hub's bank wall (heart moth-stone), the giant's rot panel (the rot branch), the
Elder's plug, the limbs' niche, rot's two walls, the crawl's roof niche, the web room's niche, the fork's stone
pocket and its cellar panel (the cellar branch), the galleries' nest wall, the Grove's pit wall, the Spire's nook
and its foot wall (the hollow root), the bower's kin wall, the gap's roost (the sky room), the burrow panel, the way
out's ledge wall. Majors: two moonDrops (the two branch ends), five moth-stones, the keen blade, long breath, night
eyes, quick wings, three seeds, the two abilities.

## Proven (tools/solve/canopy.ts: the explorer in the real sim, ~2 min)
50 claims hold: every exit and find of every room is reachable with the kit stated, and the locks hold without
their key (the hub's high block and door, the trunk's one-way tiers, the well without claws, the fork's claw face
and its glide shelf, the Spire without claws, the far limb without the glide, the tunnel's pit and the way out's
door without the glide, the den's balcony once down, the next area's door, the larder and the Elder's top without
claws, the shortcut and the trapdoor from their shut side). The world check passes (claws, then glide; no softlock).

## Played by the human-like bots (playtest-reports/canopy-r3)
`npm run humanplay -- run --world canopy --skills casual,average,skilled --seeds 1` (25 min, give up after 180 s
without progress), on the final build:

| bot | rooms | claws at | how far on the critical path | where it stopped |
|---|---|---|---|---|
| casual | 8 / 27 | 3:07 | hatch, hub, trunk, well (claws) | the rot branch and the well: never climbed the well's west face |
| average | 9 / 27 | 3:40 | ... well, limbs | back down into the rot branch (crawl, web, Elder), lost there |
| skilled | 7 / 27 | 1:55 | hatch, hub, trunk, well, limbs, hub (high), fork | under the fork's glide-only shelf (it can see the great glint) |

v2's bots reached 4 rooms and went east from the hub (none found the west); all three v3 bots go west first and take
the claws. What the runs fixed on the way: thorns where she lands in the giant's hall and between the rot hall and
the claws (returns that sent her back to the ledge above, every time), the Elder's thin shelves, cross-chimney moves
(the well and the Elder now have one clean face from floor to top), the shaft's lampwing knocking her off the only
climb, the hollow's floor cut by the shaft's mouth, the limbs' floor between thorns with no way up (a stump that
refused the claws, the second limb in its kick's reach, thorns at the tall trunk's foot).

## What is still weak (for round 4)
- **The bots stop at a third of the critical path.** They detour into the rot branch for most of their time (it is
  the nearest unknown after the claws) and do not come back up; the fork's glide shelf holds the skilled bot. The
  cross-chimney move (kick across 384-640 px) is beyond them, so every critical climb is now one clean face: the
  "twist" on the well is thorns on the other face, not a change of wall.
- **Masses still read as rectangles** at a distance: bitten outlines help (map), but tall wall faces and stacked burls
  paint as slabs and terraces (render's side, noted to it).
- **The east half is unplayed by bots** (Grove, Spire, bower, gap, deep): proven by the explorer only.
- **Enemies 0.43 a screen** with every ant counted; the branches' creatures (web, ants) are untested in play.
- **No dash gaps or later locks** yet; two moonDrops is still generous for one area.
