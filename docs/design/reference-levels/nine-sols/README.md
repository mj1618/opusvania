# Nine Sols: the first zone, mapped (2026-10-30)

The data is in `area.json`, with the schema from `../BRIEF.md`. The drawings are gitignored under `shots/reference-levels/nine-sols/`:
- `map.png`: 1 px = 8 of our px, drawn from `area.json` only.
- `map-{afm,afe,ch,fsp,cth}.png`: crops of `map.png`, one per scene.
- `terrain-native.png`: the in-game map tiles the terrain was traced from.

**The game files were not available.** I checked `~/Library/Application Support/Steam/steamapps/common/Nine Sols/` at the start and again before finishing. Both times it held only two `mono_crash` logs, with no `.acf` and nothing in `downloading/`. **Everything here is mined data**, and nothing comes from the Unity scenes. The pipeline is ready to swap in real colliders once the install exists.

## What the area is, and why there
**Scope.** Five Unity scenes. Their names come from the randomizer's `PortalData.cs`.

| key | Unity scene | name |
|---|---|---|
| AFM | `A1_S1_HumanDisposal_Final` | Apeman Facility (Monitoring) |
| AFE | `A1_S2_ConnectionToElevator_Final` | Apeman Facility (Elevator), including Baichang |
| CH | `AG_S1_SenateHall` | New Kunlun Central Hall |
| FSP | `AG_S2` | Four Seasons Pavilion, the hub |
| CTH | `A2_S6_LogisticCenter_Final` | Central Transport Hub |

The area runs from the elevator out of Peach Blossom Village to the Anomalous Root Node in CTH, where Lear teaches **Tai-Chi Kick**.

**Why this boundary:**
- **Baichang is the zone's boss.** He is the first fight with a boss bar, and he guards the elevator that leaves the zone.
- **The first new skills fall here.** Mystic Nymph is at about minute 30 and Tai-Chi Kick at about minute 60.
- **The Kick closes the zone's big loop.** CTH's bottom door opens back into Baichang's arena.
- **It is the zone's last new reach in the logic.** No other ability opens more of these 5 scenes, except one chest that needs Unbounded Counter, hours later.
- **The first Sol (General Yingzhao) is a separate zone.** He is 4 more scenes and about 1 h further on (Power Reservoir East, Central and West, then the Radiant Pagoda). Including him would double the area.

## Sources and confidence
| data | source | confidence |
|---|---|---|
| Terrain (air vs solid) | The in-game map, stitched from ninesolsmap.com zoom-15 tiles. DebugModPlus' `MapTeleportModule` shows each scene's map image is linear in world position. | Shapes are good. The map is simplified: no one-way platforms, ropes, grapple points or small ledges. Wall thickness is unknown, so I filled each scene's bounding box as solid. |
| Scale | My own measurement against screenshots (below) | ±15% |
| Room graph, gates, which ability opens what | Ixrec's Archipelago randomizer logic (`connections.jsonc`, `locations.jsonc`) | High: maintained and play-tested. I split each scene into rooms myself (39 rooms) along those logic regions. |
| Chests, lore, nodes, mini-bosses | ninesolsmap `/api/markers`, cross-checked against the randomizer tracker's per-scene map positions | High (±20 map px) |
| Enemy stats (HP, attack damage, XP) | ninesols.wiki.gg Enemy_Characteristics and the enemy pages | High (datamined on the wiki) |
| Enemy positions and counts | A research pass placed enemies from walkthrough text (Steam guide 3457329455, intoindiegames) | **Low.** About a third are medium confidence (tied to a landmark), the rest are guesses. The counts in AFE's "bunch of enemies" and the CTH lift ambush are invented to fit the text. |
| Yi's kit | The randomizer's `VanillaAbilities.cs` / `RemovedAbilities.cs` (vanilla always has Wall Climb, Grapple and Ledge Grab) plus wiki Combat | High |
| Times | Timestamps from a 100% video run (Steam guide 3268452563) ×1.8 for a first play | Estimate |

**Missing (unknowable without the game files):**
- Unity units and colliders.
- One-way platforms.
- Yi's collider, run speed and jump height. Nothing has been datamined, and I couldn't time a video.
- Contact damage. As far as I know, Nine Sols enemies hurt only with attacks, so I left the field out.
- Jin values of chests.
- Exact hazard, door and console positions. These are marked `estimate`.

## Units
- **Native unit:** px of the in-game map at ninesolsmap zoom 15 (Unity units are unknown).
- **Conversion:** **9.6 of our px per map px**, from a view of **200 × 112.5 map px = 1920 × 1080 ours**.
- **How I measured it:**
  - **Normal zoom.** In two normal-zoom gameplay screenshots of AF Monitoring, a 46-map-px corridor fills 0.41 of the view height. That gives a view 112 map px tall.
  - **Cross-check.** In the Baichang screenshot the camera is zoomed out 1.41×: Yi is 0.076 of the view height there, against 0.107 at normal zoom. There the elevator door frame (60 map px) is 0.21 of the view width, which gives 285 map px = 200 × 1.41. ✓
- **Yi's sprite is 116 px tall in our px** (0.107 of the view height) and about 60 px wide. Our hero is a 40×80 box drawn about 83 px tall, so **Yi is about 1.4× bigger relative to the view**.
- **Clear height.** The median clear height of the space is 586 px (5.0 Yi, 7.3 of our hero box). The quartiles are 403 and 979 px.

## The first ten minutes, as a player meets them (first-play estimate)
- **0:00** The elevator drops Yi into the long Monitoring corridor. A parry-and-talisman tutorial prompt appears.
- **0:30** The first Root Node, 2.2 screen widths from the start.
- **1:00** The first Blade Trooper stands just right of the node. It is a parry dummy with one telegraphed slash.
- **2:00** Cell blocks, then a dip with three lasers to dash through.
  - Back up, a console hack drops a hanging corpse, which holds a key item: the Bloody Crimson Hibiscus.
- **3:00** A Bolt Warrior, then two grunts below a ledge (drop behind them).
- **4:00** The east stairs: a Bolt Warrior and a Blade Trooper climbing toward you.
- **5:00** The Blade Commander: 400 HP and the first unparryable crimson attack. He guards the first Jin chest.
- **6:00–7:30** Switchbacks down. Troopers, then two Spear Vanguards that roll past to attack from behind.
- **8:00** A third spearman in front of a laser, with a Bolt Warrior shooting through it.
  - A console lift makes a shortcut back to the node.
  - A breakable wall beside it leads to the vent chest.
- **9:00** A one-way drop into the descent rooms, and a lore console (Surveillance Footage).
- **10:00** An alarm cutscene, then 5.6 empty screen widths of corridor to AF Elevator's first node.

**After minute 10:**
- **10–25:** AF Elevator.
  - A locked 3-enemy gauntlet in the pagoda hall.
  - Two chests hidden on a pagoda roof.
  - Two hacked lifts.
  - The floating-block hall.
  - A second node 5 screen widths before Baichang, and a heal machine at his door.
- **~25:** Baichang (1160 HP). He drops the Stasis Jade.
- **27:** The elevator up to Central Hall. Two hacked doors and a statue gate are visible from here, all shut.
- **30:** The Pavilion hub. Mystic Nymph sits in a dead-end room at its far right.
- **35–42:** Ruyi gives the jades. Lear gives the Fusang Horn (fast travel) and the skill tree.
- **45:** The Nymph opens Central Hall's lower-right door into CTH.
- **48:** CTH's great lift: an 8.5-screen-tall shaft and an ambush ride down.
- **50–58:** A turret and a rope drop, moving platforms, a vent chest, the Root Node.
- **~60:** The Anomalous Root Node teaches Tai-Chi Kick. It immediately opens a statue puzzle and the bottom corridor, whose one-way door opens into Baichang's arena.

## Measurements
All numbers come from `area.json`. "Screens" means area / (1920×1080). "Filled" counts only air pixels; "rect" counts room rectangles.

**Size**
- **Total.** 39 rooms in 5 scenes: **106.7 filled screens** (172 rect).
- **By scene** (filled): AFM 12.7, AFE 25.0, CH 15.2, FSP 24.9 (about 15 of it is open sky above the pavilion), CTH 29.0.
- **Critical path.** 28 rooms, **82.2 filled screens (77% of the area)**.
  - Its walked length is **143,500 px = 75 view widths**, plus 6 scene transitions (doors, elevators).
  - Pace: about **1.4 filled screens per minute**, or **1.25 view widths of path per minute** (first play, estimated 60 min).

**Shape and connections**
- **Rooms by shape:** hall 15, corridor 12, shaft 6, setpiece 2, arena 2, hub 1, pocket 1.
- **Connections per room:** mean **2.54**. 2 rooms have 1, 19 have 2, 13 have 3, 5 have 4.
- **Dead ends:** 2 rooms. `fsp-east` holds **Mystic Nymph** (the dead end is the ability room); `cth-alcove` holds a Jin chest.
  - Two more side pockets inside rooms hold chests: the AFM vent and the AFE shaft alcove.
- **Loops:**

  | loop | walked length | how it closes |
  |---|---|---|
  | **Main loop:** Baichang → elevator → Central Hall → CTH → node → bottom corridor → one-way door → Baichang | 48,400 px = **25 view widths** + 1 elevator ride | Closes at about minute 62, right after the Kick |
  | AFM, around the shortcut lift | 16.8 widths | Opens at about minute 8 |
  | AFE middle → west → lower | 8.9 widths | Grapple back up |
  | AFE lower → Baichang → bottom | 8.0 widths | After the Kick |
  | Central Hall's vents | 9–12 widths | After the Kick |

**Enemies**
- **Count.** **47 placed**: 43 met on the first pass, 40 of them in critical-path rooms.
- **Density.** **0.44 per filled screen** overall, **0.49 on the critical path**. By scene (first pass): AFE 16, AFM 14, CTH 13. CH and FSP have **0 on the main route**.
- **Kinds:**

  | enemy | count |
  |---|---|
  | Blade Trooper | 14 |
  | Bolt Warrior | 7 |
  | Spear Vanguard | 7 |
  | Blade Commander | 4 |
  | Feral Beast | 4 |
  | Skycleaver | 4 |
  | turret | 3 |
  | Maul Corporal | 1 |
  | Armored Spear Vanguard | 1 |
  | Baichang | 1 |
  | Yanren | 1 |

  The difficulty spread (1–5) is 10 / 22 / 8 / 5 / 2.
- **HP and damage relative to Yi.** Yi has 120 HP; his sword does 20/20/40 per 3-hit combo, so a basic hit is 20.

  | target | HP | sword hits to kill |
  |---|---|---|
  | Bolt Warrior | 72 | 4 |
  | Blade Trooper | 136 | 7 |
  | Spear Vanguard | 160 | 8 |
  | Blade Commander | 400 | 20 |
  | Maul Corporal | 800 | 40 |
  | Baichang | 1160 | 58 |

  - The median regular enemy has 136 HP (≈1.7 full combos).
  - **Grunt hits do 20–30 = 17–25% of Yi's HP**: 4–6 hits kill him.
  - Commander hits do 35 (29%).
  - Baichang's triple slam is 3×35 = 88% if all three land; his crimson slam is 61 = 51%.
  - Yi's whole heal budget is 2 pipe charges × 60 = 1 full bar.
  - Fights are won by parry, then talisman (64–128 per blast), not by chip damage.

**Pickups and saves**
- **Pickups.** 15 major, 8 minor (Jin chests), 4 lore.
  - Per filled screen: major 0.14, minor 0.075, lore 0.037.
  - First pass: **15 pickups in 82 critical screens, 1 per 5.5 screens**. Enemies also drop Jin.
- **Secrets: 19 hidden things.** 11 are reachable on the first pass, 8 need later abilities or items.
  - **How they are hidden:**
    - above the camera on a roof (2);
    - side alcoves off shafts or vents (4);
    - behind a breakable wall (1);
    - a dropped corpse after a hack (1);
    - behind hacked doors (2);
    - behind parry-then-hack statues (3);
    - over a hazard floor (1);
    - grown on the hub's tree by bringing items (2);
    - the rest behind ability gates.
  - **Distance from the critical path:** median 787 px (0.4 view widths) for the first-pass secrets; the maximum is 5,550 px. Over all 19, the median is 1,200 px.
- **Saves.** 5 Root Nodes, and **none in Central Hall**.
  - Gaps along the path: **22.7 / 13.2 / 18.4 / 18.3 view widths**, about 1 every 12 minutes.
  - The last node before Baichang is 5.1 widths from him, and a heal machine stands at his door.

**Gates**
- **Seen before opened: 10.** Only 4 open within this zone's hour.

  | gate | lock | opened |
  |---|---|---|
  | Central Hall west door | Nymph | about 15 min after it is seen |
  | Central Hall door to CTH | Nymph | about 15 min after it is seen |
  | 2 CTH statues | Kick | about 5 min after they are seen |
  | Central Hall's Lake Yaochi statue | Kick | next zone |
  | AFE bottom level | Kick | next zone |
  | AFE statue chest | Kick + Nymph | next zone |
  | Yanren's platform | Nymph + Kick | next zone |
  | Exit to AF Depths | Kick | next zone |
  | Pavilion tree | items | hours later |
  | Central Hall turret room | Unbounded Counter | hours later |

**Travel**
- **Vertical vs horizontal.** Walked travel is **0.26 vertical to horizontal** (31.7k vs 121k px), plus 3 vertical rides between scenes (village elevator, Baichang's elevator, the Pavilion lift).
- **The one big in-scene vertical** is CTH's 8.5-screen lift shaft, ridden as a set-piece ambush.
- **Longest stretch with nothing within half a view of the path:** **10,800 px = 5.6 view widths**. It is AFM's exit corridor into AFE, right after the alarm cutscene.

**How the first new abilities change the reachable space** (randomizer logic, the 36 regions and 22 checks of these scenes)

| kit | regions reachable | checks reachable |
|---|---|---|
| Start kit (Wall Climb, Grapple, Ledge Grab) | 13 (36%) | 12 |
| + Mystic Nymph | 22 (61%) | 16 |
| + Tai-Chi Kick | 36 (100%) | 21 |

- **Tai-Chi Kick adds 14 regions (39% of the zone), 5 checks and the main loop's closing door.** It also opens the routes to 3 neighbouring zones (Lake Yaochi, AF Depths, Power Reservoir), so the zone ends by fanning out.
- The 22nd check needs Unbounded Counter, hours later.

## 12 most useful facts for an AI building a first area
1. **Yi is about 0.107 of the view height** (116 px in ours), and the median clear height is **5 Yi tall** (586 px). Nine Sols frames tighter than us; our hero box is 0.074 of the view.
2. **The first zone is about 107 filled screens and ~60 minutes**, so **1.4 screens and 1.25 view widths of path per minute**. The game spends its time on fights, not distance.
3. **77% of the area is on the critical path** (28 of 39 rooms). Side content is pockets and alcoves next to the path (median 0.4 view widths away), not side branches.
4. **0.49 enemies per filled screen on the path** (43 enemies on the first pass). They cluster in the two facility scenes, with **zero** in the hall and the hub, so the hub stays quiet.
5. **Grunts die in 4–8 hits and hit for 17–25% of the hero's HP**; elites take 20 hits and hit for 29%; the boss has **8.5× a grunt's HP** and one unblockable move worth 51% of the hero's HP.
6. **Saves are 13–23 view widths apart** (about 12 min). One sits **5 widths before the boss**, with a heal machine at the arena door.
7. **The boss (Baichang) comes at minute 25 of 60, 58% of the path length** (43 of 75 widths). The rest is the hub, the new abilities and the loop home.
8. **The first ability sits in the zone's only real dead end** (the Pavilion's far-right room). The dead end *is* the reward.
9. **Teach the verb, then use it at once.** Tai-Chi Kick opens a statue puzzle 1 screen from where it is taught and the door that closes the **25-width main loop** back to the boss arena, within about 2 minutes.
10. **10 gates are visible before they open, and only 4 open within the hour.** 2 open in about 15 minutes; the rest promise the next zones.
11. **Travel is 0.26 vertical to horizontal.** The big verticals are elevators between scenes and one 8.5-screen ambush lift, each a set piece rather than a climb.
12. **15 first-pass pickups in 82 screens (1 per 5.5)**, mostly Jin chests and crafting components. Secrets are hidden by camera framing (roofs), side alcoves, one breakable wall, and "parry then hack" statues that turn combat into the key.
