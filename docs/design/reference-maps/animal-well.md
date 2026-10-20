# Animal Well: how 256 screens pack secrets and loops into a small space

2026-10-20. One researcher's pass for `BRIEF.md`. The numbers come from the fan map's data (positions of every find,
every egg with the tools it needs, and a hand-made navigation graph). They are exact where marked so and estimates
elsewhere. **(guess)** marks guesses.

## The maps and data I used

All files are in `shots/reference/maps/animal-well/` (gitignored). Sources are in `sources.txt` there.

| file | what | source |
|---|---|---|
| `awhelper_maps_bright_full.png`, `…basic_full.png`, `…explored_full.png` (5120 × 2880) | the whole world, every screen at native resolution (16 × 16 screens of 320 × 180) | Animal Well Helper fan map, animal-well.pages.dev |
| `Map.png`, `awhelper_map.png` (640 × 352) | the in-game map, all tiles uncovered; border colours mark the regions | animalwell.wiki.gg (Screens page), and the helper |
| `awhelper_markers_eggs_nodes.json` | 264 marked finds by type (items, telephones, keys, doors, pipes, teleporters, flames, bunnies, candles, matches, medals, totems), the 64 eggs **with the tools each needs**, and a 343-node navigation graph | extracted from the helper's script |
| `screen_graph_from_nav_nodes.json` | my screen-level graph: two screens are linked if the nav graph crosses between them | built by me |
| `full_with_screen_grid.png`, `crop_start_and_hub.png` | the world with the 16 × 16 grid drawn; the start and hub at ¾ size | my crops |
| text | wiki: Screens, Starting area, Central area | animalwell.wiki.gg |

**The unit.** One screen is 320 × 180 px and **flip-screen**: no scrolling, and each screen is composed as one picture
and one problem. The player crosses one in about 3–4 s **(guess)**, about the same as Wing across our 1920 px screen
(3.3 s).

**Caveat on the graph.** The helper's nav graph was made for drawing routes. It ignores most one-way drops and every
tool gate, so the loop numbers say how the space is *built*, not what is open at minute 10.

---

## 1. The world in numbers

| | value |
|---|---|
| screens | 16 × 16 = **256** (255 reachable in the nav graph) |
| screen-to-screen links | 324 → **2.54 exits per screen** on average |
| exits per screen | 1: 34 screens · 2: 93 · 3: 84 · 4: 44 |
| dead-end screens | **34 (13%)**. 26 of them hold a marked find; the other 8 likely hold firecrackers, fruit or an unmarked secret **(guess)** |
| links that lie on a loop | **84%** (53 of 324 are bridges) |
| shortest loop through a link | **median 6 screens**. 130 links sit on 4-screen loops (2 × 2 blocks), 61 on 6-screen loops, and only 15 need a loop of 28–30 |
| edge wraps (Pac-Man style) | 9: rows 1–5, 11, 12 wrap left↔right, and the well wraps top↔bottom |
| teleporters / pipes | 16 / 23 |
| telephones (saves) | **19**: one per ~13 screens, 2–4 per region, one in the hub |
| marked finds | 264 (+ 64 eggs), on 153 of 256 screens: **60% of screens hold at least one find**; 62 screens hold 2+, and 6 hold 6 |
| eggs | 64 on 61 screens. **13 need no tool, 39 need one, 12 need two or more.** Disc 14 and Bubble Wand 14 are the most needed, then Slink 8, Yoyo 7, Remote 7 |
| other layers | 17 bunnies, 9 candles + 9 matches, 37 totems, medals and keys (6 keys, 6 doors) |
| length | layer 1 (four flames, credits) ~5–6 h; everything ~20 h |

**Distance from the hub** (the beacon room, screen 9,7), counted in screens along the graph:
- 23 screens within 3;
- 51 within 5;
- 122 within 8 (half the world);
- 203 within 12;
- the farthest is 20.

The whole world is a small neighbourhood.

## 2. The map

Regions come from the in-game map's border colours. They're approximate at their edges.

```
    0123456789abcdef            D = dog area (top-left, ~52 screens)       C = chameleon area + house (~48)
 0  tDDDDDDDDctCCCCC            s = seahorse area (left, ~41)              O = ostrich area (bottom-right, ~47)
 1  DDtDDDDD2c3CCCCC            . = starting area (~20)                    m = manticore area (~18, last)
 2  DDDDDDDtDcCtCCCC            c = central: the well shaft, egg room, beacon room (~16)
 3  DDDDDDDDDcCCCCtC            e = eel and shortcut area (~8)
 4  CDDDDtDDccCCCCCC
 5  CCDDDDDDccCCCCCC            S = start (about 5,11, from the helper's route graph)
 6  sssss  EcccCCCCC            H = the hub, the beacon room with the four animal statues (9–10,7)
 7  stsssssscHHcOOOO            E = egg room (7,6): pays at 8 / 16 / 32 / 64 eggs
 8  ssssssss.MmOOOOO            M = map chest, at the top of the start area, right under the hub (9,8)
 9  ssss..t..mmOtOOO            1–4 = the four flames, one in each corner region: B (1,d), P (8,1), V (a,1), G (f,f)
 a  ssts....mtOOOOOO            t = telephone (save)
 b  ssss.S..mmOOOOOO
 c  ssssst..mmOOOOOt
 d  s1seemmmmmOOO OO
 e  eete.CmmmmtOOOOO
 f  eeDDD.tCCcOOOOt4
```

### The opening (≈ 0–40 min)

- **The start area (~20 screens, rows 9–12, columns 4–8)** is four long horizontal floors stacked as a switchback.
  She climbs up through it toward the hub. In order:
  1. a bulb, a squirrel, ghosts, firecrackers (the first tool, a detour up and right through a crank-and-button
     loop);
  2. the first telephone under a moving platform (6,9);
  3. a ghost room;
  4. a ladder;
  5. **the map chest in the last room (9,8)**.
- Visible but unreachable in the start area:
  - the tutorial rabbit's alcove (reached hours later from the seahorse area);
  - the snake gate (needs the S medal);
  - the breakable-brick wall (needs the B. Ball);
  - the fish-head pipe gate (needs every candle lit).

  So the first 20 screens show four locks.
- **The map shows the four flames in the four corners from the moment you take it.** The goals are given; the
  routes are not.
- **The hub, the beacon room (9–10,7)**, is 8 screens from the start:
  - 4 exits, a telephone, four statue beacons waiting for flames;
  - the manticore gate in the floor, which needs all four;
  - next door, the egg room (7,6) with its count-gated rewards (the flute at 8 eggs).

  The four regions branch from it:
  - the dog area by a ladder top-left;
  - the seahorse area at the bottom-left;
  - the ostrich area past the pixel display, bottom-right;
  - the chameleon area by a ladder on the right.
- **The first choice comes at ~10–15 min (guess)**, and the nearest things are close:
  - Disc 5 screens, Slink 5, the flute 5 (needs 8 eggs);
  - the P and V flames 7;
  - the B. Wand and Yoyo 12;
  - the B flame 14.

  Right of the hub, a key-and-door room (a chinchilla to stand on, the key, the hedgehog room's door) is the first
  puzzle off the hub.
- **Pace:** about 25–35 screens in the first 40 minutes **(guess)**, under 1 screen a minute. The time goes into
  reading screens, not crossing them.

### How it packs so much into 256 screens

1. **The screen is the unit.** Every screen is a self-contained, readable problem. A find's tell, its lock and its key
   are on the same screen, or on its neighbour.
2. **Every screen does two jobs.**
   - 60% of screens hold a find, and 62 screens hold two or more.
   - The main route runs through screens whose second job is a secret.
   - So the same screen is played again later with a new tool, and becomes new.
3. **Tools are generic, and each one opens things everywhere.**
   - Bubble Wand: platforms, floating. Disc: a platform, a lure, a switch-hitter. Yoyo: switches. Slink: buttons.
   - The Disc and the Wand each open 14 eggs spread over all regions.
   - A new tool sends you back through the whole map, not one corridor.
4. **Loops at every scale.** 4-screen loops in 2 × 2 blocks, 6–12-screen loops inside a region, and the hub loop
   through all four. Then the wraps and pipes tie the far corners together. You almost never walk back the way you
   came.
5. **Layers.** Layer 1: four flames, about 120 screens of route. Layer 2: 64 eggs, bunnies, the egg-room rewards, on
   the same screens. Layer 3: the puzzles across all of it. The map doesn't grow. What you can read in it does.
6. **Count gates at home.** The egg room pays at 8, 16, 32 and 64 eggs, so a find in any corner is progress at the
   hub.

## 3. The ten rules this map teaches

1. **One screen, one composed problem.** A puzzle's tell, its lock and its key fit in one screen (or two adjacent).
   *Every Animal Well screen is a flip-screen tableau.*
2. **The hub is ≤ 8 screens from the start, and half the world is within 8 screens of the hub.** Nothing is more
   than ~20 away.
3. **At least 80% of links lie on a loop, and the median shortest loop is ≤ 6 screens.** Dead-end screens stay ≤ 15%,
   and ≥ 75% of them hold a find.
4. **Show the goals, not the paths.** All the area's goals are marked (map, vista) by ~15 min, in the far corners. The
   route to each is found.
5. **≥ 50% of screens hold a find, and ≥ 20% hold two or more**, and most finds sit on screens the main route already
   crosses.
6. **Most secrets need a tool you get later (≥ 60%)**, and each tool opens ≥ 7 things across ≥ 3 regions. A new tool
   is a reason to replay the whole map.
7. **A save every ~13 screens**: 2–4 per region, one in the hub.
8. **Far corners are tied together**: wraps, pipes or warps, so late routes can skip the hub. *9 wraps, 16
   teleporters.*
9. **The hub counts what you found** and pays at thresholds (8/16/32/64), so finds anywhere pay at home.
10. **Regions are quadrants of 40–50 screens around a 15–20-screen centre.** Each has one creature set piece at its
    far end and its goal in the corner. The start area (~20 screens) is the switchback up to the hub.

## 4. What each rule would have changed

The sizes in screens: **wood area 1** ~73 screens in 13 rooms. **Lanternroot** ~13 screens in 9 chambers, plus the
cache.

| # | wood area 1 | Lanternroot |
|---|---|---|
| 1 One screen, one problem | Wood rooms are 2–12 screens of scrolling with puzzles spread across them, so nothing reads as one problem. **Compose each secret or puzzle inside one 1920 × 1080 view** (tell, lock and key on screen together) | Chambers are this already (1 × 1.4). Keep each puzzle inside one chamber's view; the seal spans 1150 px across a chamber, so it fits. Good |
| 2 Hub ≤ 8 screens, half the world within 8 | The oak (wood-hollow) is ~17 screen-widths of travel from the start (hatch → glidewalk, plus the climbs), and the far ends (the well, the silk hall) are ~15 more. **Pull the hub closer**: ≤ 10 screens from the start, everything within ~20 | Met: B2 is 2–3 chambers from the spawn, and everything is within 4 |
| 3 ≥ 80% of links on a loop, loops ≤ 6 screens | The build has two loops among 14 links, most links are bridges, and its loops are 20+ screens long. **Add 2 × 2 local loops in every room**: an upper route and a lower route between the same exits | The 3 × 3 with its vertical links gives ~5 loops among ~13 links. The one-ways (knot, hole, seal) cut many of them. Make 2 of the one-ways two-way after a switch, so loops close |
| 4 Show goals, not paths | The vista shows the oak (good). Show **all** of the area's goals early (the den's mesh, the crown, C1's top), and don't light the way | The spawn shows the plate's crest (good). Show the arena's moon-hole and the cache's knot from places she passes in the first 5 minutes |
| 5 ≥ 50% of screens hold a find | Most of the wood's ~73 screens hold no find. Target ~35 finds (hoards, hollows, signs, moon-drops), at least one per screen of play | Met on paper (glints everywhere), but they are trickle, not finds. Count only real finds: Lanternroot has ~10 (3 hollows, nest, ember run, vault, cache, stone, hoards): ~0.7 a screen. That's fine |
| 6 Most secrets need a later tool; each tool opens ≥ 7 things | The claws open R4's shelf, R6's bough and R1's ridge: 3 things in one direction (west). Give the claws (and the fling) ≥ 7 uses spread across the area, most in rooms already seen | Kindle opens ~6 (M-a1, the seal, the guarded set, the vault, the boss, the stair). Gust opens ~5. Spread them over all three layers; add 2–3 small gust-only finds in A2/A3 |
| 7 A save every ~13 screens | The patches are closer than that (fine). The roots and den need one at the roots' end | 4 patches in ~14 screens: generous. Keep |
| 8 Far corners tied together | The wood's far ends (the hatch ridge and the silk hall) are ~30 screen-widths apart. One shortcut between them (a root tunnel from the roots to R3, or a high canopy run) would let the late area loop | The night layer's east (C1) drops west to B1 (good). Tie A3 to C3 under the arena (a water passage opened from the cistern) |
| 9 The hub counts finds | Nothing counts at the oak. **Let the oak (or Tatter) pay at moth-count thresholds**: a hollow at 100 moths, a map piece at 200 | Let B2's patch pay at kindle or rescue thresholds (all hall lamps out → the loft opens), so finds in every layer pay at the hub |
| 10 Quadrants of 40–50 around a centre | The wood is a chain, not quadrants. As the v3 web: the oak in the middle, the clearing (east), the roots (down), the lamp road (up), the bowl (west), each ~10–15 screens | The 3 × 3 is a tiny version: centre B2, with A, C, night and roots around it. Fine for a test; for the real game, regions of ~15 screens each |

---

## 5. The three games side by side

| | **Super Metroid** | **Nine Sols** | **Animal Well** |
|---|---|---|---|
| unit | rooms of 1–42 screens (256 px), scrolling | locations of ~10–30 screens, scrolling | 1 screen (320 × 180), flip-screen |
| whole world | 261 rooms, 1286 screens | 12 zones, ~40 locations, ~600–850 screens **(est. from map area)** | 256 screens |
| length (main) | ~7 h | ~20 h | ~5–6 h (layer 1) |
| pace | ~3 screens/min | ~1 screen/min | ~0.7 screens/min |
| hub | one per area, a big room with 7–10 doors 1 hop from the entrance (Parlor, the Main Shaft) | one home for the whole game (the Pavilion), reached at ~1 h, every zone 1 transit hop away | one centre (the beacon room) 8 screens from the start, half the world within 8 screens |
| loops | long, and through other areas (median 8 rooms); 62% of room links on a loop | few inside a location; shortcut loops back to the entrance node | everywhere: 84% of links on a loop, median 6 screens |
| dead ends | 25% of rooms, **100% pay** | side-room ends hold the chests | 13% of screens, ≥ 76% pay |
| saves | ~1 per 50 screens, always one before a boss | 1 per location (~10–15 screens), always ≤ 4 screens before a boss | 1 per ~13 screens |
| finds | 1 item per 8 (Brinstar) to 18 (Crateria) screens | ~10 per save | ≥ 1 per screen; 60% of screens have one |
| gating | ~30% of doors are coloured locks; each tool opens a lock within 1–3 rooms and again across the world | fights gate (a gauntlet or mini-boss every 20–30 min); abilities open "later" spots | tools open secrets in rooms already seen; count gates at the hub |
| verticality | opening descends (~1.4 : 1); shafts are the spines | bands joined by elevators (~1 : 3), verticals as set pieces | mixed per screen; the start is a switchback climb to the hub |
| what you see first | two locked doors in the first room | the goal, dead (a light bridge, the Pagoda) | all four goals on the map |
| the main path vs the whole | ≤ 40% of the area's rooms in the first hour | ~70% (linear locations, with side rooms) | layer 1 ≈ half the screens; layers 2–3 reuse all of them |

**What the three agree on:**
- **Every dead end pays.**
- **A save sits just before every hard thing.**
- **The goal is shown before the way is.**
- **A new ability goes to work at once, near where you got it, and then sends you back through places you know.**

**Where they differ, and what to take for Lampfall:**
- **Super Metroid** gives the **descent, the locked-door promise and the changed return**. Its hubs are big rooms with
  many doors. Its long cross-area loops suit a world-scale map.
- **Nine Sols** gives **pacing inside a location**: save → dense band → gate fight, a home that reacts, and transit
  set pieces between islands. That last one fits our one-look-per-room renderer best.
- **Animal Well** gives **density per screen**: screens composed as single problems, short loops everywhere, every
  screen doing two jobs, and tools that reopen the whole map. Lanternroot borrowed its secret layers but not its
  loops or its per-screen composition.

The wood failed on the things all three share: few dead ends with payoffs, a hub far from the start, a chain instead
of loops, and no visible locks early. Lanternroot met most of the shared rules on paper, and failed where its locks
opened without their tools.

The mix to try next:
- Animal Well's loop and density numbers for the screen-level layout (rules 3, 5, 6);
- Super Metroid's opening (a descent, two locks in the first room, the changed return);
- Nine Sols' saves before every gate fight and its home that reacts.
