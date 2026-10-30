# The Canopy: a first area built to the reference numbers (2026-10-30)

The question: the test grove is dense and fun at 4 screens; does that scale to a whole first area? The method: map the
reference games' first areas to scale (`docs/design/reference-levels/`), take their numbers as targets, build to
them, then measure the build with the same tool and draw it at the same scale. Open it: `?world=canopy&fresh`.

## What the references say a first area is (README there, with sources)
- 30-60 min, 80-330 screens. Enemies 0.2-0.5 a screen on average, but in peaks: 40-60% of rooms have none, the
  densest reach the grove's density (HK 4-5.5 a screen). Our Downwood copied the average and lost the peaks.
- 20-36 secrets, near the route (Ori median 0.35 view-widths), mostly breakable walls and hidden rooms. Ours: none.
- Every dead end pays a major item. The first ability sits far and low, is used within seconds, and doubles the world.
- Locks are shown long before keys; keys (Ori's keystones) lie on the route. The opening and the hub are quiet;
  a save comes within the first minutes.

## The build: six rooms, ~47 screens, ~15 minutes (tools/levels/canopy.ts)
```
 hatch (quiet opening, 10 scr) ......drop.....  high canopy (10 scr: claws in, glide at the crown, the wide gap)
                                    |                  |  climb (claws)        | glide drop (one-way)
 Thornlimb (8 scr) ---- Crossing hub (7 scr) ---- Lamp Grove (7 scr: the dense clearing)
  claws in the well     save, seed door (3)
                              | seed door
                        den (5 scr): save, old burrback, the way on
```
| reference rule | how the Canopy meets it | measured |
|---|---|---|
| quiet opening | the hatching branch as it was: no creature, no pickup | 0 enemies, 10 screens |
| quiet hub, early save, crossed often | the Crossing: no creature, a moon patch where she lands (~0:30), crossed 4 times | 0 enemies |
| locks shown first | from the landing: the high west limb (claws), the seed door with three dark sockets | 2 locks for 2 open ways |
| first ability far and low, used at once, doubles the world | claws at the bottom of a well at the Thornlimb's far west end; the well is only left by climbing; a great glint hangs in the shaft; the climb leads on to the upper limbs and back to the hub (the first loop) | reachable rooms 4 -> 6 |
| the return is changed | the upper limbs wake a burrback pair and a lampwing with the claws (`wakes`) | |
| keys on the route | three moonseeds: a stub under the Thornlimb's fork, the Grove's crown, the far limb past the glide gap | |
| peaks and lows | the Grove is the peak (9 creatures, 44 things in 7 screens; its pit and crown at grove density); the hatch, hub and den are quiet | room density 0 / 0 / 0.2 / 0.4 / 0.7 / 1.2 per screen |
| secrets near the route | a hidden room behind bark at the hub's west roots; a crawlspace under a rotten floor panel (keenBlade); a leaf-hidden niche over the upper fork; a nook in the Grovemother's crown (nightEyes); a leaf mass on the glide's line over the gap (quickWings) | 5 hidden places, 18 hidden things |
| every dead end pays | the well (claws), the crown (glide), the crawlspace, the niche, the nook, the cache | 6 of 6 |
| a rest before the boss | a patch on the den's ledge over the old burrback's floor | 5 saves |

Totals against the references (`tools/reference/metrics.ts`): 0.42 enemies a screen (HK 0.31-0.46, Ori 0.18, Nine
Sols 0.27, grove 2.93, Downwood 0.33), 55% of screens empty (references 63-66%, Downwood 31% but flat), longest empty
run 6 screens (references 6-15), 11 majors (15-23), 18 hidden things (20-36).

## Proven (tools/solve/canopy.ts: the explorer in the real sim, ~8 min)
All 16 claims hold: every exit and find is reachable with the kit stated, and every lock holds without its key (the
hub's high limb and door, the well without claws, the canopy hole without claws, the far limb without glide). The
world check passes (claws, then glide; no softlock).

## What is weak (for the next round)
- **Thin terrain.** Solid is 9% of the rooms' boxes; the references are 35-50%. Their rooms are enclosed caves; ours
  are open sky with limbs in it, so the canopy room in particular is a lot of empty air. This is the biggest
  difference left on the map (`ours/canopy/map.png` next to the references' maps).
- **Few rooms, all on the path.** Six big rooms, every one on the critical path; the side content is inside them.
  References: 22-48 rooms, 27-77% on the path. More, smaller pockets off the path is the next step.
- **Not played.** No human or bot has played it through; difficulty and the creature mix (senses `always`) are untuned.
- Covers read as a dark bubbly mass, plainer than the painted leaf clumps beside them.
- The den reads as more canopy, not a burrow; the old burrback's arena has none of the Downwood den's stage marks.
- Found on the way: a placed player keeps the tuning's double jump until she lands, whatever she owns (`createPlayer`),
  so a spawn, a fall's return or a re-form gives one free air jump. Fixing it in the sim breaks two wood-well tests
  whose claw climbs only worked with it; left as a follow-up (memory/canopy.md).
