# The Canopy: a first area built to the reference numbers (v2, 2026-10-30)

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

## The build: 24 rooms, 60 screens (tools/levels/canopy.ts)
Every room starts solid and its caves are carved (`air`); what is left becomes `root` (or the den's `ground`) masses
the wood kit paints as bulk (src/render/scene/lib/pf-mass.ts). Exits come from one link table (`LINKS`). `*` = on
the critical path.

```
                                  crown* (glide, the moon)          attic (long breath)
                                    |                                 |
           sky (night eyes)    bower* (arrival, the kin climb) ----------- spire* (hawker's chimney) - nook (stone)
              |                 /                                         |
 hatch*     gap* (vista: glide to the far limb, seed 3)              grove* (arena-pit, seed 2, crown on a claw climb)
   |  drop     |  drop to hub     \ drop to fork                          |                \
 limbs* --- hub* (landing, save, door, Tatter) ---------- fork* (open, claw face) --+     hollowroot (quick wings)
   |    \    |  seed door                                    | panel
 well*  trunk* (seed 1)    tunnel* (root tunnel)           cellar (moonDrop)
 | | \     | panel             |        \ panel
 | |  rot (a second way down)  den* (arena) -- out* (the reveal, the next area's door) -- ledge (hoard)
 | |   | panel                   burrow (stone)
 | |  crawl (moonDrop)
 | elder (moonDrop) behind a plug
```

| room | role |
|---|---|
| cn-hatch | the quiet opening (wood-hatch as it is) |
| cn-hub | the Crossing: she lands on the Fork over the save; from the landing the seed door (three sockets) in the root floor below, the high west block (a sheer face: claws) and the mouth into the fallen giant; a lamp on the lampoak lights per seed held; Tatter keeps the door. Secrets: a rotten panel by the door (the heart moth-stone), a hollow in the east bank behind a rotten wall |
| cn-trunk | down inside a fallen giant in three tiers (each drop too high to climb back before the claws), thorns, a lampwing over them, a burrback under a low roof, seed 1 in an alcove in the roof; a rotten panel drops to the rot hall |
| cn-well | the Elder's shaft: in at the giant's mouth, a fall to the claws at the bottom (far and low); the climb back up the shaft (thorns on alternating walls, a great glint) into the **ambush hollow** (two burrbacks, a juvenile and a lampwing, all woken by the claws); out by the hollow's east face. A rotten plug in the west wall hides the Elder's root room |
| cn-limbs | the way home along the giant's back: gaps at the jump's edge over thorns, a rise, a kick up a tall trunk; a niche in the roof (the west moth-stone) |
| cn-rot | a second way down: a low hall, a burrback under the roof, a dangler over the rotten wall; a panel to the crawlspace; a cache behind rot |
| cn-crawl, cn-elder, cn-cellar | pockets, one moonDrop each (one more light) |
| cn-fork | the open fork: two juveniles, a knoll; a rotten panel over the cellar; the east moth-stone in the west wall; the pit and the claw face up to the Grove (**the Grove is the reward for the claws**) |
| cn-grove | a closed arena-pit in tiers, lamplit (three wicks), at grove density (2 burrbacks, a juvenile, 2 lampwings, a dangler, a hawker), caps to climb back; the crown (seed 2, keen blade) on the Grovemother's claw climb; a panel over the hollow root |
| cn-spire | a chimney up the Spire's heart, thorns on alternate faces, the hawker in it; a hollow through the trunk to the nook |
| cn-bower | in through the floor from the Spire; the hall roofed in heartwood; the kin (a broken tree) as the claw climb to the crown and over to the gap; the attic up the east wall; a root hollow under the west ledge |
| cn-crown | the one cold-white moon room: the glide, a dead end, a save |
| cn-gap | **the** vista: from the bower's shelf a glide over the wide gap to the far limb (seed 3) whose end drops into the Crossing (loop 2); a fall lands in the gap's floor (claw back up the shelf, or drop to the fork); a roost hidden in a hanging root clump on the glide line, its shaft up to the sky room |
| cn-tunnel | under the seed door: the drop between root curtains, three screens of root tunnel, a burrback pair in the pit between two humps with a dangler over them, a panel over the burrow (the deep moth-stone) |
| cn-den | the save balcony over a closed arena (the balcony's face refuses the claws: the fight is the way on), the old burrback, its root gate; camera locked to the arena |
| cn-out | the climb up a root chimney to the first real vista, the next area's sealed door in view, a save; a rotten wall in the chimney hides the ledge |

Loops: the high west limb (well -> limbs -> hub), the far limb's drop (gap -> hub), the gap's floor drop (gap -> fork).
Order (`progression`): claws, then glide; three seeds open the door.

Look per room (`art`, `marks.backs`): enclosed rooms have a back wall (the inside of the wood, or earth in the deep)
and no sky over the view's edge (`camera.headroom: 0`); the vistas (hub, gap, crown, the way out's top) keep the sky;
the Grove is warm with its moon hidden; the crown's moon is huge and low; the deep is earth (`mass: 'ground'`).

## Measured (tools/reference/metrics.ts, against the references)

| metric | HK | Ori | Nine Sols | Canopy v1 | **Canopy v2** |
|---|---|---|---|---|---|
| rooms | 48 | 22 | 39 | 6 | **24** |
| screens | 329 | 88 | 172 | 47 | **60** |
| rooms on the critical path | 25% | 77% | 72% | 100% | **58%** |
| solid share of the room boxes | 0.35 | 0.5 | (traced) | 0.09 | **0.43** |
| enemies per screen | 0.31 | 0.18 | 0.27 | 0.42 | **0.58** |
| enemy kinds | 30 | 9 | 11 | 6 | 6 |
| majors | 23 | 21 | 15 | 11 | **25** |
| hidden things | 36 | 27 | 20 | 18 | **119** (16 hidden places) |
| saves | 8 | 2 | 5 | 5 | 5 |
| hazard runs | 0 | 6 | 5 | 1 | **29** |
| screens with nothing in them | 65% | 63% | 66% | 55% | **35%** |
| longest run of empty screens | 15 | 6 | 9 | 6 | 5 |

Secrets (16 places): hub cache panel, hub bank wall, the trunk's rot panel, the Elder's plug, the limbs' niche, the
rot cache, the crawl panel, the fork's stone pocket, the cellar panel, the Grove's pit panel, the Spire's nook, the
bower's kin hollow, the attic, the gap's roost (and the sky room), the burrow panel, the ledge wall. Covers and
rotten walls in the wood are painted as the mass they sit in (baked patches, `mass-patches.ts`); a rotten wall shows
only a faint seam until it is cut. Majors that matter: three moonDrops (one more light each), five moth-stones (one
per area: heart, west, east, high, deep), long breath, night eyes, quick wings; keen blade sits on the Grove's crown.

## Proven (tools/solve/canopy.ts: the explorer in the real sim, ~45 s)
35 claims hold: every exit and find of every room is reachable with the kit stated, and the locks hold without
their key (the hub's high block and door, the trunk's one-way tiers, the well without claws, the fork's claw face,
the Spire without claws, the far limb without the glide, the den's balcony once down, the next area's door). The
world check passes (claws, then glide; no softlock).

## What is still weak (for round 2)
- **Every mass face takes the claws** (the sim's default, as in HK and Ori); a lock is a face with nothing else
  near it. Faces that must refuse say `kick: false` (`noClaws`).
- **Too much to pick up.** 193 glints make 65% of screens "busy": the references' 63-66% empty screens and their
  long quiet runs are not met. Fewer, bigger hoards in the secrets would give the lows back.
- **Dark.** The enclosed rooms read as caves now, but they are low in value everywhere; few lights.
- **Masses are rect-built.** Their silhouettes are rounded at the edges but the shapes underneath are boxes (pillars,
  knolls, the roost); the references' rock is shaped.
- **Not played.** Difficulty, the hawker chimney and the boss arena are unproven by hand; caps are still the flat
  lilac mushrooms.
