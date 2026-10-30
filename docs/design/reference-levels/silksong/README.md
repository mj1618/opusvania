# Hollow Knight: Silksong: Moss Grotto, Bone Bottom, the Marrow and Mosshome (start to the Bell Beast + Silk Spear)

2026-10-30. Matt owns the game and asked for it as a fourth reference ("one of the best games"). Brief: `../BRIEF.md`.
Data: `area.json` (shared schema, **from the game files**). Map: `shots/reference-levels/silksong/map.png` (1 px = 8 of
our px; gitignored). How it was extracted, what is exact and the five findings for a level designer: `EXTRACTED.md`.
Look references (assembled room renders, 26 environment sprites) are outside the repo in `~/code/opusvania-refs/silksong/`.

## What counts as the first area, and why
Our definition: from the start to the first major ability / first boss, with the side rooms. The data decides it:
- The new game starts in **Tut_01** (PlayerData.respawnScene = `Tut_01`, marker `Death Respawn Marker Init`).
- The **first boss** is the Moss Mother (`Mossbone Mother`, 120 hp) in **Tut_03**, the chapel under Bone Bottom: its
  exits lead up into the town (`firstExit`, `top1`).
- The **first ability** is **Silk Spear**: the weaver shrine in **Mosstown_02** (FSM state `Set Silkspear` sets
  `hasNeedleThrow`); hint triggers for it switch off once `encounteredBellBeast`, so the designers expect it before or
  around the Bell Beast.
- The **first major boss** is the **Bell Beast** (`Bone Beast`, additive scene Bone_05_boss), whose defeat opens the
  Bellway (fast travel; `defeatedBellBeast` is tested in 6 of these scenes).
So the area is every scene whose map zone (CustomSceneManager.mapZone, names from the DLL) is MOSS_CAVE, BONETOWN,
PATH_OF_BONE (the Marrow) or MOSSTOWN (Mosshome): 34 rooms, the same "whole first region incl. later-gated rooms" cut
as our Hollow Knight file. Left out: Weavenest Atla (its own zone, behind a Needolin song gate in Tut_01b), Tut_04/05
(behind the chapel's sanctum door, a later act), Mosstown_03 (Shellwood zone), and the Skull Tyrant's raid on Bone
Bottom (`Bonetown_boss`, a later event). Exits leave to 13 outside scenes (Deep Docks, Hunter's March, Wormways,
Shellwood, Coral, Bellhart's basement, Weavenest Atla, ...).

## Sources and confidence
| what | source | confidence |
|---|---|---|
| room size | tk2dTileMap tile grid: the box of the air tiles + 1 tile of wall (the full tilemap kept as `native.tilemap`) | exact (box); tilemaps carry solid filler, see EXTRACTED.md |
| solids | tile grid merged into rectangles + every non-trigger collider on the Terrain layer (roof polygons, platforms) | exact |
| room placement | gate pairs aligned (least squares over 108 gate-to-gate equations; mean misfit 4 u = 266 px, max 15 u) | derived, good to a few tiles |
| exits | TransitionPoint gates (target scene + entry point), doors | exact |
| gate requirements | objects next to each gate (song gates, levers, breakable walls, flags) read by hand | inferred |
| enemies, hp, contact damage | HealthManager.hp, DamageHero.damageDealt of each enemy root, world position | exact (fresh-game state) |
| enemy names, behaviour, difficulty | component/FSM names + knowledge of the game | estimate |
| pickups | CollectableItemPickup items resolved by name across bundles; rosary caches/strings/rocks, chests, shell-shard fossils, the spool piece, the flea | exact |
| benches, shops, NPCs, levers, arenas, bosses | RestBench/BellBench, ShopOwner, PlayMakerNPC, Lever, BattleScene, boss HealthManagers | exact |
| hazards | DamageHero with hazardType >= 2 (spikes, lava, acid) or trap objects (boulders, pilgrim trap spikes), not part of an enemy | exact |
| secrets | sprites under Unmasker/Remasker objects (the dark masks over hidden pockets) -> 164 mask rects; breakable walls that own a mask | exact geometry; "hidden" = inside a mask rect |
| units, hero | camera FOV/limits, HeroController constants, hero collider, Physics2D gravity, fixed step | exact; jump height derived |
| start kit (5 masks, needle 5) | wiki | good |
| minutes, critical-path order inside Moss Grotto | estimate | low |

**Not got:** individual patrol ranges (they live in FSM variables), FSM-spawned pickups (rosary drops from breakables),
mask shards (none are placed in these scenes: the nearest `Heart Piece` is in Weave_05b), one-way platforms (none found
on the Terrain layer), the exact reachability of each ledge (no movement solver run). The fresh-game rule (Normal World
on, Black Thread World off, DeactivateIfPlayerdataFalse off) can include things that appear only after a story flag.

## Units
Silksong's camera is perspective (FOV 24 at z -38.1): the view is **28.79 x 16.2 u**, so **1 u = 66.68 of our px** (the same camera as HK)
Hornet in our px: box **33 x 139** (0.5 x 2.08 u; ours 40 x 80), run **550 px/s** (8.25 u/s; ours 576),
full jump **~391 px** (18.6 u/s held 8 steps of 0.02 s, then 60 u/s^2; ours 272). Hornet is 1.7x taller than Wing
relative to the view (a view is 7.8 Hornets tall, 13.5 Wings), runs at the same speed and jumps 44% higher.

## The area as a player meets it (times are estimates)
- **0:00 Tut_01** (106 x 118 u box, 7 air screens, a hub of 6 exits). Hornet starts at the bottom of a tall central
  shaft. Two Mossmirs (12 hp) drift in the side caves; a Bone Chest and a rosary string sit in masked pockets; moss-vine
  clusters block the low left exit and the top-left exit until cut. The top exit to Bone Bottom is a shortcut that opens
  later (a broken bridge).
- **~0:01 Tut_02** (10 air screens): the first fight room, 8 Mossgrubs (10 hp, 2 hits) and 3 Mossmirs on a long
  rolling cave over a pool, 1.06 enemies per air screen; two shell-shard fossils in masked pockets. It loops back into
  Tut_01 at a higher door.
- **~0:04** the right branch **Tut_01b** (side): 3 Mossgrubs, 2 Mossmirs, 4 Bone rollers, the first spikes, and the
  **first lock**: a song gate (Needolin) into Weavenest Atla.
- **~0:06 Tut_03**, the chapel: a **bench 1.45 view widths before the Moss Mother** (120 hp = 24 needle hits, hits for
  1 mask, summons 2 Mossgrubs). Mr Mushroom and the Churchkeeper. Up into Bone Bottom.
- **~0:10 Bone Bottom** (Bonetown, 315 x 90 u: 40 air screens, 13 exits): the town, a bench, Pebb's shop, 5 NPCs; only
  3 Aspids, all in the upper ledges. The Bonegrave gate is shut (a flag); five openings in the roof lead up into the
  Aspid_01 shaft.
- **After (est. 10-45 min)**: Bone_01 (Sherma at the Great Bone Gate; a battle closes the room, then the gate opens;
  a secret wall beside it), Bone_01c (a bell bench, rolling boulders and no enemies), Bone_02 (spikes and a lava pit),
  the Bone_03 shaft hub (7 exits, the Bellshrine gate shut from the far side), Bone_04 (Shakra sells the map, a bench,
  a bone gate + lever), Bone_05 and the **Bell Beast** (150 hp in data, 2-mask hits). Mosshome (Mosstown_01/02) lies
  west of Bone_05: pilgrims, 28 trap spikes, and the **Silk Spear** shrine.

## Measurements
A "screen" is 1920 x 1080 of ours (28.79 x 16.2 u). "Air screens" count only the open tiles.

| measure | value |
|---|---|
| rooms / screens | **34 / 513** box screens (`metrics.ts`); **248 air screens** (48% of the boxes is rock) |
| room size (box) | min 0.8, median **11.0**, max 61 (Bone Bottom 61, Bonegrave 55, Aspid_01 47, Bone_01c 28, Tut_01 27) |
| room size (air) | min 0.5, median **6.0**, max 40 |
| critical path (start -> Bell Beast) | **10 rooms (29%)**: Tut_01, Tut_02, Tut_03, Bonetown, Bone_01, Bone_01c, Bone_02, Bone_03, Bone_04, Bone_05; 224 box screens (44%) |
| rooms by shape | hall 18, hub 8, set piece 3, corridor 3, pocket 2 |
| exits per room | mean **3.85**; 1: 6, 2: 7, 3: 5, 4: 8, 5: 3, 6: 2, 7: 1, 13: 1 (Bone Bottom), 17: 1 (Aspid_01) |
| dead ends (6) | Bone_12 (Straight Pin, a tool), Bone_17 (Bone Necklace), Bone_18 (a battle, then a Memory Locket), Bone_19 (bone chest + 2 rosary strings), Mosstown_02c (bench + Moss Creep NPC), Bellway_01 (the station) |
| loops | **11 independent loops** (44 internal links, 34 rooms): Tut_01-Tut_02 and Tut_01-Tut_01b (two doors each), Bone_01-Bone_01c, Bone_03-Bellshrine-Bone_05-Bone_04, Mosshome's ring, ... |
| enemies | **132**: 0.26 per box screen, **0.53 per air screen**; critical path 45 (0.41 per air screen); 9 of 34 rooms have none |
| densest rooms (per air screen) | Bone_14 1.64, Bone_16 1.31, Tut_01b 1.16, Bone_11 1.13, Tut_02 1.06 |
| enemy kinds | 23: Bone Circler 23, Skull Scuttler 17, Aspid 13, Mossgrub 11, Skull Brute 8, Bone crawler 8, spear Pilgrim 8, Mossmir 7, Bone flyer 7, Pilgrim 7, Bone roller 4, moss spitter 3, Rock roller 3, + 10 kinds with 1-2 each (incl. the 3 bosses) |
| hp / damage | commons 10-30 hp = **2-6 needle hits** (needle 5); 118 of 132 hit for **1 mask of 5**, 11 for 2; bosses 120 / 150 / 450 |
| mean difficulty (1-5, est.) | 1.98 (1: 23, 2: 92, 3: 15, 4: 1, 5: 1) |
| pickups | major **8** (Silk Spear, spool fragment, flea, Memory Locket, Straight Pin, Bone Necklace, Weaver Totem, Seal Chit): 0.016 per box screen; minor **41** (rosary strings/shrines/rocks, chests, shell-shard fossils): 0.17 per air screen |
| secrets | **19 hidden things** (22% of all things; 8 of them in critical-path rooms), **8 secret walls** (breakable walls that lift a mask), **164 mask sprites**; hidden things are minor (rosaries, shell shards, a chest); the spool fragment is a dead end behind the secret wall in Bone_01b |
| benches | **7**; the first is 4.1 view widths (straight line) from the start, 1.45 before the first boss; nearest bench 2.5-4.4 view widths apart |
| hazards | **127** pieces: spikes 73 (Bone_06 alone 29), traps 50 (rolling boulders, pilgrim spike traps), lava 3, acid 1; **none in Tut_01/Tut_02** (the first spikes are in the side branch) |
| gates seen before opened | Needolin song gate (Tut_01b, ~min 4), the chapel's sanctum door, the Bonegrave bone gate, the Bellshrine gate (from Bone_03, opened from the shrine side), the Bone_06 shortcut wall (from Mosstown_03), the top-of-Tut_01 bridge |
| vertical : horizontal travel (critical path, room centres) | **0.36** |
| longest run of screen cells with nothing in them | 16 (`metrics.ts`) |
| first ability's effect on space | **Silk Spear opens no room** (a ranged silk skill); the Bell Beast opens the Bellway (fast travel); Needolin (later) opens the first lock |

## Enemies with difficulty (name in play is an estimate; hp and damage from the files)
| kind (file) | in play | n | hp (hits) | dmg | difficulty, why |
|---|---|---|---|---|---|
| MossBone Crawler | Mossgrub | 11 | 10 (2) | 1 | 1: slow walker |
| MossBone Fly | Mossmir | 7 | 12 (3) | 1 | 1: slow drift |
| Bone Circler | skull circler | 23 | 14 (3) | 1 | 2: circles in the air, dives |
| Bone Goomba | Skull Scuttler | 17 | 15 (3) | 1 | 2: charges on sight |
| Aspid Collector | Aspid | 13 | 15 (3) | 1 | 2: keeps distance, spits |
| Bone Goomba Large | Skull Brute | 8 | 30 (6) | 2 | 3: heavy charge, 2 masks |
| Bone Crawler | bone crawler | 8 | 20 (4) | 1 | 2: walls and ceilings |
| Pilgrim 01 / 03 / 04 | Pilgrims | 16 | 20 (4) | 1 | 2: telegraphed swing / lunge |
| Pilgrim 05 | heavy Pilgrim | 2 | 30 (6) | 1 | 3 |
| Bone Flyer | bone flyer | 7 | 15 (3) | 1 | 2: swoops |
| Bone Roller | bone roller | 4 | 15 (3) | 1 | 2: fast roll |
| Pilgrim Moss Spitter, Pilgrim Fly | | 4 | 20 (4) | 1 | 2 |
| Rock Roller | rock roller | 3 | 95 | 0 | 1: runs; drops its load |
| Bone Thumper | thumper (Tut_01 side cave) | 1 | 45 (9) | 2 | 3 |
| Dock Worker / Dock Flyer | Deep Docks fauna at Bone_09 | 3 | 30 (6) | 1 | 3 |
| Mossbone Mother | **Moss Mother** (boss) | 1 | 120 (24) | 1 | 3: first boss, summons |
| Bone Beast | **Bell Beast** (boss) | 1 | 150 (30) | 2 | 4: burrows, charges |
| Skull King | **Skull Tyrant** (optional) | 1 | 450 (90) | 2 | 5 |

## Start kit
Needle (5 damage, wiki) with side/up slashes and a diagonal down-strike that bounces off enemies and spikes; Bind (heal 3
masks for a full spool of 9 silk, silk from hits); 5 masks; run, jump, ledge clamber. No dash, wall jump, double jump or
glide (Swift Step, the dash, is next, in Deep Docks).
