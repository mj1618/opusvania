# 1. The Downwood (spine: the descent)

Layout: `1-downwood.json` (46 rooms, 61 links, 145 screens, 23 x 12 screens).
Score: `node docs/design/places/place-score.mjs docs/design/places/1-downwood.json` gives **25/25 pass** (output at the
end). Units are screens; a room is "the Fall" or "the Brook", not R-numbers.

## The place
The wood grows down a steep hillside to the valley of lamps. Wing hatches near the top, so the whole area is below
her. The hillside steps down in **four horizontal bands** (the Crown, the Boughs, the Floor, the Roots) to the
**Weaver's Hollow** under the roots, which is the brightest place in the wood. Three **junction shafts** cut through
the bands:
- **the West Fall**: a 7-screen drop, and a fall, never a climb;
- **the Charred Hollow**: the lightning-split inside of the great oak, 5 screens;
- **the Rain Chimney**: a 7-screen hollow trunk on the east edge, a climb.

East of the wood lies **the Gorge**, a 4 x 4 open-air set piece that she only ever enters on the wing.

**Landmark: the Split Oak.** Lightning split a giant oak down its middle. Its fork is the hub, its glassed-out hollow
is the central shaft, and the great lamp burns under its roots. The goal is seen from the start: through the charred
grate in the hub's floor, the great lamp glows far below. The light that is the area's danger is always
underneath her.

```
                              +---------+----+--------------+----+----+---------+---------+-------------------+
                              |nest     |scar|SPLIT OAK     |map |moon|highcrown|LOOKOUT  |THE GORGE          |
                    +----+----+---------+----|              |----+----+---------+----+----|                   |----+
                    |snap|windbreak          |              |hatch         |lone|    | C  |                   |swl |
                    +----+----+--------------|              |----+---------+----+----| H  |                   |----+
                    |owl | W  |west boughs   |              |    |cocoons  |    |rain| I  |                   |
                    +----| E  |---------+----|              |-------------------+----| M  |                   |
                         | S  |loft     |bst |              |lampwalk                | N  |                   |
                         | T  |         |    |----+----+----+------------------------| E  |-------------------+----+
                         | F  |         |    |hrt | H  |gls |                        | Y  |gorge floor        |thrn|
                         | A  |-------------------| O  |-----------------------------|    |-------------------+----+
                         | L  |fernfloor          | L  |the brook                    |    |
                    +----| L  |--------------+----| L  |------------------------+----|    |
                    |fern|    |root tangle   |rot | O  |black pool              |spr |    |
                    +----|    |---------+---------| W  |----+-------------------+----|    |
                         |    |OLD DEN  |ant road |    |    |drowned roots      | S  |    |
                    +----|    |         |----+----|    |    +----+----+---------| N  |----+
                    |well|    |         |    |crk |    |         |bur |         | K  |
                    +----+----+---------+    +--------------+----+----+---------|    |
                              |taproot  |    |SEED DOOR     |drowned hall       |    |
                              +---------+    +--------------+---------+---------+----+
                                             |WEAVER        |valley   |
                                             |              |---------+
                                             |              |
                                             +--------------+
```
One cell = one screen, x across, y down. W/H/C/SNK = the West Fall, the Charred Hollow, the Rain Chimney, the Sunk Stair; hrt = the Heartwood, gls = the Glass Crack, bst = the Bark Stair, rot = the Rotten Floor, crk = the Ant Crack, bur = the Burrow, snap = the Snapped Crown, swl = the Swallows' Ledge, thrn = the Thorn Run.

## The hub: the Split Oak (3 x 4 screens, 10 ways, 1 room from the start)
A moon patch sits in the fork. The hub has ten ways out:
- **Open from the start:** the hatch, the Moth-Stone, the West Boughs and the Lampwalk.
- **Locked:**
  - the Lightning Scar and the Windbreak (claws, up the charred tines);
  - the Bark Stair (claws, the west flank);
  - the Heartwood (a root knot with 5 sockets);
  - the grate down the Hollow and the Glass Crack. These are two shortcuts that open only from below, as both of
    Hollow Knight's shortcuts open into Cornifer's room.

She crosses the hub on every trip, because the oak's trunk splits the Boughs and its roots split the Floor: west
and east only meet through the oak until glide crosses the Black Pool. The hub changes on each return:
- after claws, the firefly has hung a lantern in the fork and a hawker hunts it;
- after glide, the moths she has freed spiral up out of the fork;
- after the Weaver, the grate goes cold.

## The main path, a thin thread (~25 min first-timer; ~42 to find everything)
The score's thread is 18 of 46 rooms (39%). Times are guesses.

| min | where | what |
|---|---|---|
| 0:00 | Hatching Bough | Cocoon, Tatter's failed hop, the swarm over the moon, the first snuff, the vista down the bands. **Two locks in the first 10 s**: the Moon Perch (double jump) and the Lone Limb (dash) |
| 0:01 | Split Oak | The patch, the glow through the grate, three locked tines. The Moth-Stone, one room east, draws 46 faint rooms |
| 0:03 | West Boughs → West Fall | The first fights and flings, then the drop: no way back up. On the way down: the Silk Loft (seed 1) and the Fern Hollow (rest, Tatter) |
| 0:05 | Fernfloor → Charred Hollow → Seed Door | Drops to the bottom of the oak. **The goal, sealed**: 3 empty sockets, and the Weaver seen mending its web around the great lamp |
| 0:07 | Ant Road → Root Tangle → Old Den | Drops into the pit. **The old burrback** (slam, roll, taproot). Its death opens the glade: **CLAWS** (~0:10). The only way out is to climb |
| 0:11 | Ant Road → **the Hollow climb** → the grate | Kicks up the glassed shaft over the lamp's glow, kicks the grate open, and comes out in the hub. The crown has woken |
| 0:13 | Scar (seed 2) → Lampwalk → Rain Chimney | Climbs to the top of the wood. The chimney's lip breaks behind her |
| 0:16 | Owl's Lookout | Glade, vista #2: **GLIDE**. The only ways off are glides |
| 0:17 | High Crown → hatch → hub | Glides home over where she hatched (the loop closes) |
| 0:18 | a third seed | Any one of three: the Snapped Crown (glide off the Windbreak), the Root Well (glide over the thorns at the Fall's foot) or the Swallows' Ledge (if she glided east) |
| 0:21 | grate → Seed Door | The opened grate is now a 5-screen drop from the hub to the door |
| 0:22 | **The Weaver** | Rings, drops, floor, heart. Then the firefly's first relight, the web falls, and the Valley Mouth opens |

## What each ability reopens
**Claws** (den, ~0:10). It opens 10 locks, and the reachable world grows from 19 rooms to 35:
- the den wall (the only way out);
- the Hollow climb and the grate shortcut;
- the Lightning Scar;
- the Windbreak and the Hawkers' Nest beyond it;
- the Bark Stair, a west loop back to the hub;
- the Owl Hole;
- the Rain Chimney and its top;
- the Glass Crack (the second shortcut);
- the Drowned Hall's wall up to the Seed Door.

Through the chimney it also opens the whole east of the wood: the Brook, the Black Pool, the Drowned Roots, the Warm
Spring and the Gorge Floor. From the Gorge Floor she looks up at the Lookout before she has climbed to it.

**Glide** (Lookout, ~0:16). It opens 6 locks, and the reachable world grows to 43 rooms:
- both ways off the Lookout (home over the hatch, or out over the Gorge);
- the Snapped Crown;
- the Root Well;
- the Black Pool (an east–west loop under the oak);
- the Thorn Run.

**Later.** Double jump opens the Moon Perch and dash opens the Lone Limb, both seen at 0:00 and opened an hour or more
later. All 5 seeds open the Heartwood, seen at 0:01.

## The return, changed (the spine's promise)
When she climbs back up after claws, the bands she fell through have woken. The firefly followed her down and relit
every wick she snuffed, then hung new lights in the Crown and on the Lampwalk (the Kuro beat: a light that flees and
relights behind her). Predators came for the moths circling the new lights:
- a hawker in the hub and two on the Windbreak;
- a dangler under every relit wick in the West Fall, which turns the fall into a gauntlet of threads;
- carriers on the Fernfloor, marching a trail of moths that fell at the lamps.

The rooms are the same, and the scene is new. Mechanically this is flag-armed lures (the boss's `relight` cue) and
`enemies[].wakes` on the claws flag, both of which exist.

## The best moments
1. **The first ten seconds**: two locks on screen and the whole wood below her, falling away in bands toward the
   valley's lights.
2. **The Seed Door at 0:05**: at the bottom of the charred oak, the boss is seen through the door it guards, with
   three empty sockets. From then on she carries a "come back here".
3. **Trapped in the den**: she drops into the old burrback's pit. Its death gives the claws, and the first thing the
   claws do is get her out.
4. **The Hollow climb**: she kicks up 5 screens of lightning-glass with the great lamp glowing below, kicks the grate
   open, and finds the hub she left an hour ago lit, with a hawker circling it.
5. **The Lookout**: the highest point, and the chimney breaks behind her. She steps off: west, she glides home over
   her own cocoon; east, out into the Gorge.

## Density: what is within reach in every room
| room | within reach |
|---|---|
| Hatching Bough | first wick + 5 stragglers, leaves, two locks, the vista, the drop to the Cocoon Row |
| Moon Perch / Lone Limb | a moon-drop / a hollow (wide throw), each seen from the start |
| High Crown | a firefly sign, a wick with a hawker, leaves, the drop home |
| Owl's Lookout | glide, a patch, vista #2, two ways off |
| Lightning Scar | a seed, a sign, the hub patch below |
| Windbreak | a lantern + hawker, a wick chain to fling, bark to cut, 3 ways on |
| Hawkers' Nest | two hawkers on a rhythm, a thorn bowl, a moon-drop |
| Snapped Crown | a seed over nothing, the drop to the Owl Hole |
| Moth-Stone | the map, the carving |
| Split Oak (hub) | a wick, a juvenile beetle, seed-cases, a patch, 10 ways (later: a lantern + hawker) |
| Heartwood | a 5-seed knot: a hollow (keen blade) + a moon-drop |
| Glass Crack | a wick inside the glass, a claw climb, the flap into the hub |
| West Boughs | a juvenile beetle, a gap wick to fling off, leaves, the Fall's drop (later: a dangler) |
| Owl Hole | a caged lantern of 20 moths, a dangler, two ways |
| West Fall | wall wicks to fling, falling bark, a dangler, 7 doors (later: danglers on every wick) |
| Silk Loft | a dangler over a lit wick, a seed |
| Bark Stair | a wick, seed-cases, the claw face to the hub |
| Cocoon Row | the empty cocoons, a firefly sign, a wick |
| Lampwalk | a fling chain of 3 wicks, a burrback, a dangler, the chimney wall |
| Rain Chimney | wicks to fling up between kicks, rotten bark, 5 doors |
| Rain Ledge | a hollow (quick wings) behind bark |
| Fern Hollow | a patch, Tatter, the dark |
| Fernfloor | a burrback under a lantern, ferns, rotten-bark floor, the Hollow door (later: carriers) |
| Charred Hollow | the glow below, side doors, the climb + grate, the pool door |
| Rotten Floor | 3 bouncing down-cuts, a wick, the hole |
| The Brook | 2 swinging wicks over water, a hawker, carriers, the Glass Crack overhead |
| Warm Spring | a patch, dark, 2 ways |
| Black Pool | a lantern on a root isle with stragglers, a glide gap, 4 ways |
| Root Tangle | roots to cut, a caged wick, a juvenile, the den drop |
| Old Den | the old burrback, claws, the cracked floor |
| Taproot | a hollow (night eyes), found by a down-cut |
| Ant Road | carriers on rails, a moth trail, a wick, the crack |
| Ant Crack | 20 stunned moths, carriers, a crawl to the Seed Door |
| Root Well | a seed, a dangler on the landing, thorns |
| Drowned Roots | a burrback under a lantern, a swinging wick, 4 ways |
| Burrow | a dark fight (adult + 3 juveniles), a 30-moth lantern |
| Sunk Stair | a dark rest between two lit rooms, 3 ways |
| Drowned Hall | danglers over water, a lantern, a claw wall |
| The Gorge | lanterns to fling across, hawkers in the lanes, a waterfall, the far ledge |
| Gorge Floor | the waterfall, carriers, a lantern, the Lookout seen above |
| Swallows' Ledge | a seed, mid-glide |
| Thorn Run | glide + pogo over thorns, a swinging wick, a moon-drop |
| Seed Door | a patch, the door, the Weaver glimpsed, the crawl, the claw wall |
| Weaver's Hollow | the boss |
| Valley Mouth | the exit |

## The dead ends and what each pays (15, 33%)
| dead end | what it pays |
|---|---|
| Moon Perch | a moon-drop (double jump, later) |
| Lone Limb | the hollow *wide throw* (dash, later) |
| Lightning Scar | a seed and a firefly sign |
| Hawkers' Nest | a challenge and a moon-drop |
| Moth-Stone | the map |
| Heartwood | the hollow *keen blade* and a moon-drop (5 seeds) |
| Silk Loft | a seed |
| Rain Ledge | the hollow *quick wings* |
| Fern Hollow | a patch, and Tatter |
| Taproot | the hollow *night eyes* (secret) |
| Root Well | a seed |
| Burrow | a challenge, and the cache that crosses the 60-moth health milestone |
| Swallows' Ledge | a seed |
| Thorn Run | a challenge and a moon-drop |
| Valley Mouth | the exit |

**Item key.** Seeds are moonseeds, the keys. The Seed Door takes 3 of the 5; the Heartwood takes all 5. A moon-drop is
one more light for good (`moonDrop`). A hollow is an upgrade (`hollows[].upgrade`).

## Secrets
None of these are pointed at:
- **the Taproot**: a down-cut where the old burrback's taproot phase cracked the den floor;
- **the Rain Ledge**: behind rotten bark half-way up the chimney;
- **the Burrow**: a dark hole off the Drowned Roots;
- **the Snapped Crown**: a glide off the Windbreak's broken end into apparently nothing;
- **the Swallows' Ledge**: only seen mid-glide in the Gorge;
- **the Glass Crack**: a crack in the Brook's ceiling.

## Borrowed from
- **Super Metroid:**
  - the Landing Site's two coloured locks in view, opened an hour later (the Moon Perch and the Lone Limb);
  - Parlor, the hub one door from the start;
  - the descent of the first 10 minutes (the Climb, the Pit Room, Morph Ball at the bottom);
  - the alarm on the way back (the woken bands);
  - Bomb Torizo / Alcatraz: the den you can only leave with the new tool;
  - Kraid's save one room before his door (the Seed Door's patch).
- **Hollow Knight:**
  - Dirtmouth's well and King's Pass's one-way ledge (the West Fall's overhanging lip);
  - the Black Egg Temple door seen early (the Seed Door at 0:05, the Heartwood at 0:01);
  - two one-way shortcuts into the busiest room (the grate and the Glass Crack);
  - Cornifer's map two rooms in (the Moth-Stone, one room in);
  - dead-end benches as the quiet rooms (the Fern Hollow, the Warm Spring);
  - Hornet glimpsed before she is fought (the Weaver through the door).
- **Ori:**
  - keystone doors that count (the Seed Door and the Heartwood);
  - the goal seen sealed;
  - a tower climb that opens a skill (the Rain Chimney);
  - the spiral back over the start (gliding home over the hatch).
- **Animal Well:** one screen, one problem for every pocket (the tell, the lock and the key in one view).

## Biggest risk
The descent front-loads one-way drops. For the first 10 minutes she mostly falls: the West Fall, the Hollow, the
den. If the shafts are thin they read as a chute that herds her (a journey again), and Matt's "obvious" returns. The
answer is in the rooms, not the graph:
- every shaft has ledge doors, wall wicks and a dangler, so it is a place to stop;
- the hatch and the hub show 7 locks before the first drop;
- the map at 0:02 shows how much of the wood is off the way down.

**A second risk is the vertical round trips.** The hub is at the top and the boss is at the bottom, so the third
seed can mean a top-to-bottom trip. The grate shortcut makes the hub-to-Seed-Door trip a 5-screen drop, and the Glass
Crack and the Bark Stair make the climb back short. If that is still too much, the fix is a seed down low, not a
change to the spine.

**The size is near the brief's limit.** At 145 screens, the 40-minute find-everything target rests on the halls being
quick travel.

## Score
```
The Downwood (design 1: the descent)  (docs/design/places/1-downwood.json): 25/25 pass
  PASS  everything reachable in order          ok                           want abilities then boss
  PASS  rooms in the area                      46                           want 28–50
  PASS  main path share                        39%                          want ≤ 40%
  PASS  dead ends                              15 (33%)                     want 15–35% of rooms
  PASS  every dead end pays                    all pay                      want none unpaid
  PASS  locks seen before the first ability    12 for 19 reachable rooms    want ≥ 1 per 3 reachable
  PASS  two kinds of lock in the first rooms   doubleJump, dash, glide, claws, keys:5 want ≥ 2 kinds
  PASS  hub size                               The Split Oak: 10 ways       want ≥ 5
  PASS  hub near the start                     1 rooms                      want ≤ 3
  PASS  hub crossed on the main path           4×                           want ≥ 4
  PASS  loops                                  16                           want ≥ 5 (one per 10 rooms)
  PASS  first ability opens the world          19 → 35 rooms                want ≥ 1.6×
  PASS  claws: opens ≥ 5 things                10                           want ≥ 5 locks
  PASS  claws: a lock within 3 rooms           yes                          want yes
  PASS  glide: opens ≥ 5 things                6                            want ≥ 5 locks
  PASS  glide: a lock within 3 rooms           yes                          want yes
  PASS  required finds off the path            5 keys                       want a keys door on the main path
  PASS  pockets (1×1)                          17 (37%)                     want ≥ 20%
  PASS  tall shafts                            5                            want ≥ 2
  PASS  long halls                             12                           want ≥ 15%
  PASS  biggest space vs median                8.0                          want ≥ 6×
  PASS  neighbours differ in shape             1                            want ≤ 15% of links
  PASS  a bench within 4 rooms of everywhere   4                            want ≤ 4
  PASS  a bench just before the boss           1                            want ≤ 2 rooms
  PASS  rooms with a find                      93%                          want ≥ 50%
```
