# Super Metroid: how the map is laid out (Crateria and Brinstar up close)

2026-10-20. One researcher's pass for `BRIEF.md`. The numbers come from real room data, not memory, unless marked
**(guess)**. Times are first-time-player estimates and are always guesses.

## The maps and data I used

All images are in `shots/reference/maps/super-metroid/` (gitignored). Sources are in `sources.txt` there.

| file | what | source |
|---|---|---|
| `SuperMetroid-Zebes.png` (16896 × 14336) | the whole planet, room-accurate, every room drawn | vgmaps.com, Jonathan Leung |
| `SuperMetroid-Crateria.png` (13056 × 4864), `SuperMetroid-Brinstar.png` (13568 × 5440) | the two opening areas, room-accurate | vgmaps.com |
| `SuperMetroid-*(In-GameMap).png` | the in-game pause maps, fully revealed (Zebes, Crateria, Brinstar) | vgmaps.com |
| `crop_*.png` | my crops and scalings of the above | — |
| room and door data | `sm-json-data` (github.com/vg-json-data/sm-json-data): every room's map-tile mask (its exact size in screens), every door with its lock colour, every item, save, map and refill, and every door-to-door connection | fetched into my scratchpad |

**The unit.** One Super Metroid screen is 256 × 256 px, and one pause-map tile is one screen. A room is any number
of screens between doors. Samus crosses a screen in about 2 s at a run **(guess)**; Wing crosses our 1920 px screen
in 3.3 s, so one SM screen of travel is roughly 0.6 of ours.

---

## 1. The whole game in numbers

| | rooms | screens | items | screens per item |
|---|---|---|---|---|
| Crateria | 34 | 234 | 13 | 18 |
| Brinstar (incl. Kraid's lair) | 54 | 248 | 31 | 8 |
| Norfair (upper + lower) | 76 | 362 | 30 | 12 |
| Maridia | 56 | 283 | 18 | 16 |
| Wrecked Ship | 16 | 69 | 8 | 9 |
| Tourian | 19 | 78 | 0 | — |
| Ceres | 6 | 12 | 0 | — |
| **Total** | **261** | **1286** | **100** | **13** |

- A first playthrough is about 7 h **(guess, HLTB-ish)**: about 3 screens a minute including backtracking.
- **The room graph (255 rooms, Ceres left out):**
  - 284 door links; 17 one-way links in the whole game;
  - degree: 66 rooms have 1 door, 121 have 2, 40 have 3, 28 have 4–8;
  - 62% of links lie on a loop; the shortest loop through a link has a median of 8 rooms.
- **Dead ends: 63 rooms, and every one of them pays.** 33 hold an item, 28 a save, map or refill, one is a boss
  (Phantoon), and one is a farming room. No dead end is empty.
- **Locks.** Door nodes in Crateria + Brinstar: 204 (each door counted from both sides). 62 of them are coloured or
  grey:
  - red (missiles) 13;
  - green (supers) 12;
  - yellow (power bombs) 10;
  - grey (boss or event) 22;
  - plus elevators.

  About **30% of doors are locks**. Bomb blocks and fake walls come on top of that.

## 2. Crateria (the opening, minutes 5–35)

### Size and room mix
34 rooms, 234 screens. By shape:

| kind | count | examples |
|---|---|---|
| single screen (1 × 1) | 7 | save, map, Bomb Torizo, 230 Missile |
| hall (1 tall) | 9 | Gauntlet (5 + 6 wide), Statues Hallway, Flyway |
| shaft (1 wide) | 7 | Green Pirates Shaft (7 tall), elevator rooms (4 tall), Statues Room (5) |
| medium block | 4 | Pit Room 3 × 2, Moat 2 × 2 |
| big set piece (≥ 10 screens) | 7 | West Ocean 42, **Landing Site 39** (9 × 5), Climb Supers 14 (a U-loop), East Ocean 14, **Climb 12** (3 × 9), Parlor 11 (5 × 5), Terminator 10 |

- The five biggest rooms hold **52% of Crateria's screens**.
- Crateria is a few huge outdoor set pieces plus a scatter of tiny pockets.
- Room extents: sum of widths 100 screens, sum of heights 99. Overall it is balanced, but the opening path goes down
  (below).

### The layout

```
   ┌──────────────── Gauntlet (bomb blocks) ──────────────┐
   │ [Gauntlet Ent 5x1]══[Gauntlet E-tank 6x1]           [LANDING SITE 9x5]  ship = save   ▓ yellow door (PBs)
   │                                    │                │  start                         ▓ green door (supers)
 [Green Pirates   ]   [Terminator 6x3]──┤        ┌───────┘
 [Shaft 1x7, 4 drs]╲__/ (E-tank)        │  [PARLOR 5x5, 7 doors] ── red ── [Flyway] ── [BOMB TORIZO 1x1]
   │                                    │    │  │  └─ [Pre-Map Flyway] ── [MAP]     (bombs, then the statue wakes)
 [Lower Mushrooms]                      │    │  └─ [SAVE]       "Alcatraz": doors shut, bomb your way out ↖
   │                                    │    │
 [Green Brinstar elevator]──▼ Brinstar  │  [CLIMB 3x9 shaft] ══ [Climb Supers 4x8 U-loop, speed booster]
                                        │    │
                                        │  [PIT ROOM 3x2]  (first pass: dark and empty; return: lights, pirates, grey doors)
                                        │    │
                                        │  [Blue Brinstar elevator]──▼ Blue Brinstar: MORPH BALL (far west end), first missile
   east: [Tube]─[Kihunter]─[Moat]─[West Ocean 42]─▶ Wrecked Ship;  [Red Brinstar elevator] ▼ ;  ▶ Maridia
```

- **The hub is Parlor, one door from the start.** It has 7 doors and is passed through about **4 times in the first
  35 minutes**:
  1. down to the Climb;
  2. back up from Blue Brinstar;
  3. back from Bomb Torizo;
  4. trapped in Alcatraz and bombing out.
- **The Landing Site is the outer hub.** It has 5 exits and the ship (save and refill), and it's passed 2–3 times.
- Everything in Crateria is within **4 door-hops** of the Landing Site. Everything in Brinstar is within **9**.
- **The first walk is a descent.** Landing Site → Parlor's shaft → the Climb (9 screens tall) → Pit Room →
  elevator (4) → Morph Ball. That is about 18 screens down against about 13 across **(measured off the in-game
  map, ±2)**. Vertical/horizontal ≈ 1.4 for the first 10 minutes.
- **Loops in Crateria:**
  - **Landing → Gauntlet → Green Pirates Shaft → Terminator → Parlor → Landing** (6 rooms, about 40 screens).
    It opens with bombs: the Gauntlet's blocks.
  - **The Climb ↔ Climb Supers U-loop** (speed booster, late).
  - **Crateria ↔ Brinstar through two elevators**: Green Pirates Shaft ↓ Green Brinstar … Red Tower ↑ the Red
    Brinstar elevator ↑ Crateria's east. It's the big early-game loop. You walk it the first time at about 1:30 and
    it saves the long way round ever after.

  Inside Crateria alone only 37% of links are on a loop. **The loops are long and they run through other areas.**

### The opening, minute by minute (guess)

| min | room | what happens | kind |
|---|---|---|---|
| 0–5 | Ceres (6 rooms, 12 screens) | prologue, Ridley, escape on a timer | peak |
| 5 | Landing Site | rain, the ship, total silence. **Two coloured locks in view** (yellow, green) | quiet, wonder |
| 6–10 | Parlor → Climb → Pit Room | empty ruins. Nothing attacks; the old Tourian's corridors | quiet, dread |
| 10–13 | Blue Brinstar | first enemies; the Morph Ball on a pedestal at the far west end | first ability |
| 13–16 | Construction Zone → First Missile | the morph tunnel is used at once; a missile | ability use |
| 17 | Pit Room again | **the alarm.** Lights come on, pirates drop in, the grey doors lock until they're dead. The same rooms, now hostile | contrast |
| 18–25 | Climb → Parlor → Flyway → Bomb Torizo | the red door (missiles) opens at once; bombs; the Torizo statue wakes and fights | mini-boss |
| 26–32 | Parlor (Alcatraz) → Terminator → Green Pirates Shaft | the doors shut around her and she has to bomb out: the new tool forced at once. An E-tank in the Terminator room | ability use, loop |
| 33–40 | Green Brinstar elevator → Main Shaft | a new area; a save, the map station, a refill, five red doors | hub, choice |

## 3. Brinstar (minutes 35–120, close study)

- **Size:** 54 rooms, 248 screens, 31 items: one item per 8 screens, more than twice Crateria's density.
- **Room mix:** 18 single screens, 12 halls, 3 shafts, 13 medium, 8 big (≥ 10 screens).
  - The big ones: Big Pink 21, Green Brinstar Main Shaft 19, Dachora 17, Green Hill Zone 14, Red Brinstar
    Fireflea 12, Red Tower 10, Morph Ball 10, Caterpillar 10.
  - The five biggest hold 33% of the screens.
- **Dead ends:** 23 rooms have one door. 13 hold items (17 items, more than half of Brinstar's), 10 hold a save, map
  or refill. **None is empty.**
- **Two spines, each a big multi-door room:**
  - **Green Brinstar Main Shaft**: 4 × 12, **10 doors**. It's a vertical spine with rooms as ribs on both sides:
    the map, a save, a missile refill, the reserve tank, Early Supers, the Etecoons (power bombs). The bottom half is
    behind power-bomb blocks: you see it now and get it 1 h later.
  - **Big Pink**: 5 × 10, **9 doors**. The second hub. Its door colours are red, yellow, green, blocks: every lock
    type in the game in one room. It holds 3 items, the Charge Beam among them.
- **Saves:** five save rooms in Brinstar (Green, Etecoon, Big Pink, Caterpillar, Kraid), plus two energy refills and
  two missile refills. Brinstar's saves are about **50 screens apart**. Crateria has one save room plus the ship.
  **Kraid has a save one room before his door.**
- **Red Tower** (1 × 10) is the vertical link from green and pink Brinstar down to red Brinstar. Every Brinstar
  sub-area hangs off a vertical spine: Main Shaft, Big Pink, Red Tower, the Caterpillar room.
- **Items in Brinstar:**
  - Morph, Charge, Spazer, X-Ray, Varia;
  - 5 E-tanks, a reserve;
  - 12 missiles, 3 supers, 5 PBs.
- **First-pass versus later:** on the first visit (~35–75 min) the critical path is Main Shaft → Early Supers' red
  door → Big Pink → Charge Beam → Spore Spawn → Super Missiles. About 12 of 54 rooms **(guess)**. The rest is seen,
  locked, and returned to: Etecoons (PB), the Main Shaft's bottom (PB), X-Ray (PB + grapple), Kraid (later),
  Spazer, the Waterway E-tank (speed).

```
 Crateria▲elev      Crateria▲elev(Morph)        Crateria▲(the big loop's other end)
 [GREEN BRINSTAR MAIN SHAFT 4x12, 10 doors]──[Early Supers]──[BIG PINK 5x10, 9 doors]──[Spore Spawn]─▶ supers
   ribs: map, save, refill, reserve,              │       └─ Dachora 7x7, Wave gate, Mission Impossible
   Etecoons (PB, later)                           │
   [Blue Brinstar: Morph]  [Green Hill Zone 8x4]──[Noob Bridge]──[RED TOWER 1x10]── red Brinstar:
                                                                   Caterpillar shaft, Alpha/Beta PBs, Spazer, X-Ray
                                                                   └─▶ Kraid's lair (save, recharge, Kraid, Varia) · ▼ Norfair
```

## 4. The ten rules this map teaches

Each rule can be checked on a map or in a playthrough trace.

1. **Every dead end pays.** No room with one exit is empty. It holds an ability, an upgrade, a save, the map, a
   refill or a boss. *SM: 63 of 63 dead-end rooms.*
2. **The area's hub is one big room with ≥ 5 exits, one door from the area's entrance, passed ≥ 4 times in the first
   35 minutes.** *Parlor: 7 doors, 1 hop, about 4 passes. The Main Shaft: 10 doors. Big Pink: 9.*
3. **The first room shows ≥ 2 locks of different kinds, and they open much later (≥ 1 h).** *The Landing Site's
   yellow and green doors open at about 1:00 and 1:30. The Main Shaft's PB blocks are seen at 0:35 and opened at
   about 1:40.* The player carries a list of "come back here" from minute one.
4. **The first pass is quiet; the return is changed.** After the first tool, the rooms you came through get new
   enemies, lighting, music or locked doors, so backtracking is a new scene. *Empty Crateria, then the alarm in the
   Pit Room.*
5. **Each new ability opens a lock within 1–3 rooms of where you got it, and at least once the room you got it in can
   only be left with it.** *Morph → the tunnel in the same room. Missiles → the red door one room on. Bombs →
   Alcatraz.*
6. **The opening goes down first.** The first 10 minutes are mostly a descent (vertical : horizontal ≈ 1.4). Each
   area has 1–2 tall shafts (≥ 8 screens) as spines with rooms as ribs off them. *Parlor + Climb 14 tall, the Main
   Shaft 12, Red Tower 10, Big Pink 10.*
7. **Size mix per area (~250 screens): about 30% single screens (rewards, saves), 25% halls, 10–15% shafts, and 5–8
   set pieces of ≥ 10 screens that hold 30–50% of the space.** Small pockets are where the rewards live. The giants
   are where the moments live (the Landing Site in the rain, the Climb, Big Pink).
8. **Rewards are dense, saves are sparse.** Brinstar: 1 item per 8 screens, 1 save per ~50 screens, a refill near
   every save, a save one room before every boss door. (The game as a whole: 1 item per 13 screens.)
9. **About 30% of doors are locks**, of 3–4 visible kinds plus hidden walls. Every lock kind is shown before its key
   exists (Big Pink shows all of them at once).
10. **The first-hour critical path is ≤ 40% of the area's rooms**, and the big loops between areas (two elevators per
    area pair) open about 1 h in. The rest is seen first and visited later. *Crateria to bombs: 9 of 34 rooms.
    Brinstar's first visit: about 12 of 54.*

## 5. What each rule would have changed

**Our two levels in the same units.**

- **Wood area 1 as built:**
  - 13 rooms, ~73 screens of 1920 × 1080;
  - mean 2.15 links per room (28 link ends: 14 links for 13 rooms);
  - two independent loops in the world graph;
  - 2 dead ends, the hatch (the start) and the canopy (the end);
  - main path ~30–35 min.
- **Wood area 1, v3 plan:** a five-way oak hub at minute 9.
- **Lanternroot:**
  - 3 rooms of 3 chambers (≈ 13 screens) plus the cache (1.4);
  - main path ~20–25 min;
  - 10 links between rooms (split, knot, chimney, hole, stair, seal, shaft, east door, cache door, valley), so
    every chamber touches 2–4 others.

| # | wood area 1 (v3 doc and build) | Lanternroot (proto-1) |
|---|---|---|
| 1 Dead ends pay | The build has almost no dead ends, so there is nothing to find off the path. v3 adds pockets: the left hollow, R4's shelf, the cache. Make **every** side pocket a real payoff (v3 already says "nothing optional pays moths alone"), and add 6–10 single-screen pockets off the main rooms | The hollows and the cache pay well. The A1 log and the nest are fine. Check the chambers' corners: every closed-off nook needs a payoff, or it should be cut |
| 2 Hub ≥ 5 exits, passed ≥ 4 times | The oak becomes the hub at minute 9 (v3), but the critical path passes it twice. Route the clearing, the roots and the trunk so she **crosses the oak floor 4+ times by minute 35** (the crack shortcut is one) | B2 is the hub with 5 ways, but the 3 × 3 grid lets her go around it. Make B2 the only east–west link at hall level, so every trip crosses it |
| 3 Two locks in the first room | R1/R2 show the vista but no lock. Put **two different locks** in the first two rooms: a high bark seal (claws) and a sealed root door (the den's shortcut), each paid back after 20+ min | Partly met: the cold M-a1 by the spawn. Add a second, different lock in A1 (a Gust-only bramble), and let one stay shut until the last 10 minutes |
| 4 Quiet first pass, changed return | v3 has this idea for the roots (quiet, then the den). Add a world-state flip after the claws: the bowl's creatures wake, the oak's hall darkens, so the walk back west is new | The hall should change after the boss: lamps out, the spider's brood loose, moss lit. The review found revisits "go hollow"; this rule is the fix |
| 5 Ability used within 1–3 rooms, once forced | The claws come at the den: force their first use to get **out** of the den (no other exit), then a lock in the next room | Kindle is forced (First Light, good). Gust: make leaving the arena need a gust (the fan opens the moon-hole shaft), then the curtain one chamber on |
| 6 Go down first; a tall spine | The wood runs west to east across ~15 screens before any big vertical move (the trunk is at the end). Put one ≥ 8-screen vertical spine early: the oak's trunk as the climb back between the roots and the crown, used 3+ times | 3 layers × 1.4 screens tall: no shaft over 3 screens. Make the split or the chimney a real 4–6 screen shaft so the descent reads |
| 7 Size mix | The build is 13 medium rooms of 2–12 screens each, with no tiny pockets and no single-screen rewards. Add 6–10 single-screen pockets; keep 3–4 set pieces (the hatch vista, the oak, the den) | Every chamber is the same size (1 × 1.4). Vary it: the hall at 2 screens and tall, the cache tiny, the arena 1 screen, a 3-screen night run |
| 8 Dense rewards, sparse saves | The wood: patches every room or two, upgrades rare (2 moon-drops, 2 hollows in ~73 screens ≈ 1 per 18). Aim for 1 reward per 8–10 screens and 1 rest per 25–50 | Already dense (one hollow or upgrade per 2 chambers). Saves: 4 patches in 13 screens is plenty |
| 9 About 30% of exits are locks | The build: few of its 14 links are locks **(guess: 1–2)**. v3 adds the mesh, the crack, C1/C2. Target 30% of exits locked, of 3 visible kinds (claws ledge, bark seal, flame chain) | It has ~8 locks over ~15 links: on target. The issue is that two of them are open without the tool (review #1) |
| 10 Critical path ≤ 40%, long loops | The build's critical path runs through about 11 of 13 rooms **(guess)**. v3's web helps. Count it: ≤ 6 of the area's ~15 rooms on the path to the den | The main path covers 8 of 10 chambers. Hide 2–3 more spaces (more like the cache) so ≥ 40% of the space is off-path |

## 6. Caveats
- Times are guesses from memory of the route and typical first-time pace.
- The room graph treats each room as one node. Many of SM's real loops are inside big rooms (the Landing Site, Parlor
  and the Main Shaft each have several routes through them), so the "on a loop" share understates how loopy play feels.
- vgmaps maps show every room revealed. I counted sizes from the room data, not by eye.
