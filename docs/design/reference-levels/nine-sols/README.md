# Nine Sols: the first zone, mapped (2026-10-30)

The data is in `area.json`, with the schema from `../BRIEF.md`. **Since 2026-10-30 it is read from the game files**
(Matt's Mac install): how, what is exact and what is still mined is in `EXTRACTED.md`, which also has the five most
useful findings for a level designer. The drawings are gitignored under `shots/reference-levels/nine-sols/`:
- `map.png`: 1 px = 8 of our px, drawn from `area.json` only. `map-{afm,afe,ch,fsp,cth}.png`: crops, one per scene.
- `colliders-{afm,afe,ch,fsp,cth}.png`: each scene's real colliders in Unity units (0.3 px per unit), with the room
  rects, the designers' camera zones (green), every enemy (pale = spawned by an event), chest, door and console.
- `terrain-native.png`: the old in-game map tiles the mined version was traced from (superseded).
- Look references (renders and sprites, never committed): `~/code/opusvania-refs/nine-sols/README.md`.

## What the area is, and why there
**Scope.** Five Unity scenes (build index in brackets):

| key | Unity scene | name |
|---|---|---|
| AFM | `A1_S1_HumanDisposal_Final` (level8) | Apeman Facility (Monitoring) |
| AFE | `A1_S2_ConnectionToElevator_Final` (level9) | Apeman Facility (Elevator), including Baichang |
| CH | `AG_S1_SenateHall` (level54) | New Kunlun Central Hall |
| FSP | `AG_S2_YiBase` (level55) | Four Seasons Pavilion, the hub |
| CTH | `A2_S6_LogisticCenter_Final` (level15) | Central Transport Hub |

The area runs from the elevator out of Peach Blossom Village to the Anomalous Root Node in CTH, where Lear teaches
**Tai-Chi Kick** (the save there links to the scene `AG_Tutorial_Lear_S2_識破JumpKick`).

**Why this boundary:**
- **Baichang is the zone's boss.** He is the first fight with a boss bar (`NameTag_Giant_Sword`, 1160 HP from his stat
  asset) and stands at the right end of AFE.
- **The first new skills fall here.** Mystic Nymph at about minute 30 and Tai-Chi Kick at about minute 60.
- **The Kick closes the zone's big loop.** CTH's bottom corridor connects to Baichang's arena through the
  `A1_S2_RightLockCorridar` connection (locked from the AFE side).
- **It is the zone's last new reach in the logic.** No other ability opens more of these 5 scenes, except one chest
  that needs Unbounded Counter, hours later.
- **The first Sol (General Yingzhao) is a separate zone**, 4 more scenes and about 1 h further on.

## Sources and confidence
| data | source | confidence |
|---|---|---|
| Terrain: solid, one-way, slopes, climbable walls | files: tilemap CompositeCollider2D on the Solid / OneWay / OneWaySlope / WallRunEnable layers | exact (16-unit tiles; slopes stepped at 1 tile) |
| Hazards, doors, breakable wall, hidden-path covers, water | files: objects with a `Trap` component, door colliders, `BreakableWall`, `HiddenPathTrigger` | exact |
| Scale, camera, Yi's body and moves | files: SceneCamera (FOV 68 deg, z -240), PPlayer collider, CatanaStat, MaxRun | exact; jump height derived (see `EXTRACTED.md`) |
| Enemies: positions, HP, attack, respawn | files: every `MonsterPoolObjectWrapper` with its monster stat asset | exact; names mapped to the wiki's by HP |
| Chests, key items, saves, consoles, lifts, heal machine | files | exact positions; item names from the mined data or the scene's Chinese names |
| Room split (39 rooms) | drawn by hand on the collider renders, keeping the mined ids | judgement |
| Room graph, gates, which ability opens what | Ixrec's Archipelago randomizer logic; open borders between rooms checked against the tiles | high |
| Scene placement | each scene shifted to the in-game world map (fitted on saves, chests and doors) | +-50 px between scenes; inside a scene exact |
| Lore entries, NPC names, a few landmarks | mined (ninesolsmap markers, walkthroughs), positions moved into the new frame | +-200 px |
| Times | a 100% video run x1.8 | estimate |

**Still missing:** lore (database) entries and NPC identities are not tied to scene objects; contact damage (Nine
Sols enemies hurt with attacks only, so it is 0); enemy attack values beyond the stat's base attack; the exact walked
critical-path line (scaled from the mined one).

## Units
- **Native unit:** the Unity unit. A tile is 16 units.
- **Conversion: 3.336 of our px per unit.** The gameplay camera is perspective with a vertical FOV of 68 deg, 240 units
  in front of the play plane, so it sees 2 x 240 x tan 34 = 323.8 units high, 575.6 wide at 16:9 = 1920 of our px.
- **Cross-check:** the mined estimate (a view is 200 map px; AFM's 5888 units span 2067 map px) gives 570 units, 1% off.
- **Yi:** a 10 x 30 unit box = **33 x 100 px** (our hero 40 x 80). Run 150 u/s = **500 px/s** (ours 576). Jump
  speed 255 u/s held 0.133 s under gravity 830: **~244 px** (ours ~272). A tile is 53 px; a view is 36 x 20 tiles.
- **Clear height** (floor to ceiling, critical-path rooms): median **480 px = 4.8 Yi = 9 tiles**, quartiles 320 and
  854 px. The mined guess was 586.

## The first ten minutes, as a player meets them (first-play estimate; positions now from the files)
- **0:00** The elevator drops Yi into the long Monitoring corridor (room `afm-entry`, 6100 px long, 960 tall).
- **0:30** The first Root Node, 1.4 screen widths from the elevator, between two tutorial Blade Troopers (one spawned
  by the tutorial).
- **1:00-3:00** A Bolt Warrior and Blade Trooper in the corridor; the laser dip (3 laser traps) under it; the Bloody
  Crimson Hibiscus on a console-dropped corpse.
- **3:00-5:00** The east cells and ladders: 8 enemies (Blade Troopers, Bolt Warriors, 2 hackable trap robots inside
  hidden tubes), the Blade Commander (400 HP) on the stairs beside the first Jin chest.
- **5:00-8:00** The lower-east switchbacks (Spear Vanguards, Troopers), then the cliff band back west: a Spear
  Vanguard ambush on a ledge with two Bolt Warriors, a breakable wall, a shortcut lift up to the corridor, and a small
  Jin chest in a vent pocket hidden behind a hidden-path cover.
- **8:00-10:00** The descent rooms (Bolt Warriors on ladders, the key-item drop), then the empty exit corridor to AFE.

**After minute 10:** AFE's locked gauntlet (2 placed + 3 spawned), two small chests on the pagoda roof above the
camera, the middle hall's floating blocks and drones, the west lift shaft with a component chest behind a cover, the
lower hall's electrified floor, the second Root Node, the heal machine and Baichang (~25). Then Central Hall (no
enemies on the upper route), the Pavilion (no enemies; Mystic Nymph at the far right, ~30), CTH's 10-screen lift shaft
ridden through a 16-enemy ambush (~48), the drop, the west wing and the Anomalous Root Node (~60).

## Measurements
All numbers come from `area.json` (`tools/reference/mined/nine-sols/extract.py stats`). "Screens" = area / (1920 x 1080).
"Air" counts only non-solid cells inside the room rects; "box" counts the rects.

**Size**
- **Total.** 39 rooms in 5 scenes: **170 box screens, 88 of air** (the mined version: 172 box, 107 "filled").
- **By scene** (air): AFM 10.9, AFE 21.9, CH 13.7, FSP 15.8 (much of it open sky around the pavilion), CTH 25.6.
- **Rooms:** median 1.65 air screens (quartiles 1.1 and 2.4); the hub is the largest (11.7). Solid fills 49% of the
  room boxes.
- **Critical path.** 28 rooms, 130 box / **70 air screens (80% of the air)**. Walked length about 137,000 px = 71 view
  widths (the mined line rescaled to the files' scale; not re-traced).

**Shape and connections**
- **Rooms by shape:** hall 18, corridor 9, shaft 5, pocket 2, set piece 2, arena 2, hub 1.
- **Connections per room:** mean **3.0** (2 rooms have 1, 13 have 2, 11 have 3, 10 have 4, 3 have 5-6). Exits inside a
  scene are the open borders between room rects, checked on the tiles.
- **Dead ends: 2.** `fsp-east` holds **Mystic Nymph**; `cth-alcove` holds a Jin chest guarded by a Blade Commander
  inside a hidden-path cover.
- **Loops:** as in the mined graph (the main loop Baichang -> Central Hall -> CTH -> bottom corridor -> Baichang is
  about 24 view widths at the files' scale, closing at about minute 62).

**Enemies**
- **Count.** **100**: 71 placed in the scenes, 29 spawned by events (16 in the CTH lift ambush: 12 hackable turrets and
  4 Skycleavers; 3 + 2 in AFE's gauntlet; 2 tutorial and story spawns).
- **Density.** **0.42 placed per box screen, 0.81 per air screen** (0.83 on the critical path); 0.59 per box screen
  with the spawns. The mined version had 47 enemies, 0.27. By scene (placed): AFM 22, AFE 22, CTH 22, CH 5, FSP 0.
- **18 of 39 rooms have no enemy:** all of the Pavilion, Central Hall's upper route, the exit corridors, the elevator
  rooms. The densest: the cliff band (5.6 placed per air screen), the east cells (3.3), CTH's west wing (3.2).
- **Spacing.** Placed enemies stand mostly alone: 46 groups (a group = enemies within 900 px of each other), 32 of
  them single; mean group 1.5; the median distance to the nearest other enemy is 849 px (0.44 view width).
- **Kinds (all / placed):**

  | enemy (prefab) | HP | count |
  |---|---|---|
  | Bolt Warrior (`GunBoy`) | 72 | 17 / 13 |
  | Blade Trooper (`Minion`) | 136 | 14 / 11 |
  | hackable turret (`Turrent_Danger_Bullet`) | 56 | 13 / 1 |
  | Skycleaver Soldier (`Phoenix_AirDrone Dasher`) | 60 | 10 / 6 |
  | crawler robot, trap monster (`TrapMonster_Robot_Crawler`) | 60 | 8 / 7 |
  | Spear Vanguard (`Spearman`) | 160 | 7 / 7 |
  | exploding air drone (`AirSpider_ReflectAndExplode`) | 56 | 7 / 4 |
  | Blade Commander (`Elite`, `Sword Elite`) | 400 | 6 / 5 |
  | broken robots, trap monsters (`TrapMonster_Mutant`, `Mini`) | 60 / 20 | 10 / 9 |
  | Swift Crossbow Cannon (`AirTurrent`) | 25 | 3 / 3 |
  | Maul Corporal (`FatGuy`), Spear Vanguard elite, Armored Spear Vanguard | 800, 480, 160 | 1 each |
  | Baichang, Yanren | 1160, 1300 | 1 each |

  The mined version's 4 Feral Beasts do not exist in these scenes; the trap robots, drones and turrets were missing.
  Difficulty spread (1-5): 40 / 42 / 8 / 8 / 2, mean 1.9.
- **HP and damage relative to Yi** (unchanged; HP now confirmed from the stat assets): Yi has 120 HP and hits for 20;
  grunts take 4-8 hits and hit for 20-30 (17-25%); the Commander 20 hits; Baichang 58.

**Pickups, saves and the rest**
- **Pickups.** 16 major, 13 minor (Jin chests and bags), 4 lore (mined). Per air screen: major 0.18, minor 0.15.
- **Secrets: 19 hidden things** (how: the roof above the camera 2, hidden-path covers 4, statues to parry/kick and hack
  2, a hacked corpse 1, an electrified floor 1, under the floating blocks 1, the tree 2, vents, hacked doors and
  ability gates the rest). Plus **19
  hidden-path covers**, foreground masks that look like wall until Yi walks in (see `EXTRACTED.md`).
- **Saves.** 5 Root Nodes, none in Central Hall. Gaps along the path about 22 / 13 / 18 / 17 view widths (the mined
  walked gaps rescaled). A heal machine stands at Baichang's door.
- **Hazards: 37 strips**, 23,100 px long in all (12 view widths), median 320 x 40 px; 19 in critical-path rooms.
- **One-way platforms: 143** (1.6 per air screen), median 107 px (2 tiles) long. **Climbable walls: 29**, median 534
  px tall, the tallest 1388.
- **Breakable props** (bottles, boxes, glass, chairs): 148, 1.7 per air screen. 19 consoles, lifts and statues.

**Travel and the first abilities:** as in the mined analysis (randomizer logic): the start kit reaches 13 of 36
regions, Mystic Nymph 22, Tai-Chi Kick all 36. The one big vertical is CTH's lift shaft, 10,670 px (9.9 screens) tall.

## Most useful facts for an AI building a first area
1. **Yi is 33 x 100 px in a 1920 x 1080 view** (0.093 of the view height; our hero 0.074), runs 500 px/s, jumps ~244
   px. The median clear height is **4.8 Yi (480 px)**: Nine Sols frames tight, industrial spaces.
2. **The first zone is 88 air screens (170 of box) and ~60 minutes:** 1.5 air screens a minute.
3. **80% of the air is on the critical path** (28 of 39 rooms). Side content is pockets, covers and roofs next to it.
4. **0.81 placed enemies per air screen**, but 18 of 39 rooms have none (the hub and the halls): busy facilities,
   quiet civic spaces.
5. **Enemies stand alone**: 32 of 46 groups are single, median 849 px apart. Big numbers come from events: the lift
   ambush spawns 16, the gauntlet 3.
6. **Grunts die in 4-8 hits and hit for 17-25%**; the boss has 8.5x a grunt's HP.
7. **Saves 13-22 view widths apart**, one 5 widths before the boss with a heal machine at the door.
8. **The first ability sits in the zone's only real dead end** (the Pavilion's far-right room).
9. **Teach the verb, then use it at once:** Tai-Chi Kick opens statues one screen away and the door home.
10. **10 gates are visible before they open, only 4 within the hour.**
11. **Terrain is busy:** 1.6 one-way ledges and 1.7 breakable props per air screen, 37 hazard strips, 29 climb walls.
12. **19 hidden-path covers**: the zone hides space more than it hides items; 5 pickups lie under them, and 15 of the 19 are in critical-path rooms.
