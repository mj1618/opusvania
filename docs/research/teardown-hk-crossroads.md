# Teardown: Hollow Knight, Forgotten Crossroads (hub), Infected Crossroads and the Dirtmouth link

The Crossroads is Hollow Knight's hub. It hangs from Dirtmouth's well, and every early route passes through it. This teardown takes its numbers from game data, not from guesses. Room sizes come from each scene's tilemap. The room graph comes from the randomizer's list of vanilla transitions and its logic. Enemy, hazard, set-dressing and infection counts come from dumps of scene objects. The sources are in §14.

**Labels.** **M** = measured (read directly from data, a map or code). **D** = derived (calculated from measured values). **E** = estimated (judgement or a secondary source). Scene IDs are shortened, so `C07` means `Crossroads_07`.

## Units

| Quantity | Hollow Knight | *Tallage* | Note |
|---|---|---|---|
| World unit | 1 Unity unit = 1 tilemap cell (**M**: `CameraController.GetTilemapInfo` sets scene width to `tilemap.width`) | 1 tile = 64 px | |
| Screen | ≈ 30 × 16.9 u (**D**, see below) | 30 × 16.9 tiles | **The screens are the same size in both games.** |
| Player height | Knight body collider 0.5 × 1.28125 u (**M**, hkrl dump) | 1.25 tiles (80 px) | 1 HK unit ≈ 1 *Tallage* tile, within 2.5% |
| Player heights per screen height | 16.9 / 1.28 = **13.2** (**D**) | 13.5 | |
| Run speed | 8.3 u/s (**M**, decompiled constants via our `movement-spec.md`) | 9 tiles/s | A screen width takes 3.6 s in HK and 3.3 s in *Tallage* |

**How the screen size was found.** The camera centre is clamped to `[14.6, W−14.6] × [8.3, H−8.3]` (**M**, `CameraController.cs`). The smallest scenes in the whole game are exactly 30 u wide and 17 u tall (**M**, 497 tilemaps). At 16:9 that gives a view of about 30 × 16.9 u, with a few tenths of a unit of edge margin. A screenshot cross-check agrees (**D**): in a 1280 × 720 in-game shot, the Knight's body without the horns is about 57 px tall, which is 1.34 u at 16.9 u per screen height.

**Conversion rule used below.** A size in HK units reads directly as *Tallage* tiles. A size in screens is the same in both games. Player heights (PH) = HK units / 1.28.

---

## 1. Overview

- **Role.** The central hub. Team Cherry designed it first and treated it as the quality bar for every other area. They put three minibosses in the first location and then realised they "had to make as many of them as possible" (RPS interview, via WN Hub). Pellen: it is called Forgotten Crossroads "because it's in the middle, it's the crossroads to the world" (PC Gamer). The early plan was "four areas with the Crossroads in the middle" (**M**, interviews).
- **Arrival.** It comes right after King's Pass (201 × 80 u) and Dirtmouth (263 × 70 u, 8.8 × 4.1 screens, no enemies) (**M**). The player drops down Dirtmouth's well into `C01`.
- **Abilities on arrival.** Nail, down-slash pogo and Focus, all from King's Pass. The Crossroads grants **Vengeful Spirit** in Ancestral Mound, the first spell, and the **City Crest** from False Knight's hall, which is the key to the City. The Mothwing Cloak (dash) comes from Greenpath, one step later (**M**).
- **Scenes.** The randomizer assigns **45 scenes** to the Crossroads map area (**M**). They are 41 `Crossroads_*` scenes, `Mines_33` (the dark toll to Crystal Peak), and 4 `Room_*` scenes: the Temple of the Black Egg, Salubra's shop, Menderbug's house and Sly's hut. 3 of the 45 are small interiors. The False Knight hall (`C10`) also has `_boss`, `_boss_defeated` and `_preload` variant scenes. Three other `Crossroads_*` scenes belong to other map areas: `C46b` (the tram station on the Resting Grounds side), `C49b` (the lift top in the City) and `C50` (Blue Lake).
- **Total area.** The room area adds up to **248 screens²** (**D**). The derived footprint is about **21.5 × 15.6 screens** (645 × 263 u, excluding the lift shaft), so rooms fill about 50–55% of the bounding box. This is **D** with an error of ±2 screens (see §3).
- **First-pass play time.** About 60–120 min for a blind player to reach Greenpath (**E**, community reports). The shortest pure-running route along the critical path is about 113 s (**D**, §3).
- **Revisit state.** Picking up the Monarch Wings or visiting the first Dreamer turns the area into the **Infected Crossroads** (**M**, wiki).

## 2. Room size distribution

All 45 scenes, from tilemap sizes (**M**). Screens and PH are **D**.

| | Width | Height | Area |
|---|---|---|---|
| Min | 30 u = 1.00 screen = 23 PH | 18 u (C15) = 1.07 screens = 14 PH | 1.48 screens² |
| **Median** | **70 u = 2.33 screens = 55 PH** | **30 u = 1.78 screens = 23 PH** | **4.41 screens²** |
| Mean | 2.35 screens | 2.53 screens | 5.51 screens² |
| Max | 160 u = 5.33 screens = 125 PH | 176 u = 10.4 screens = 138 PH | 21.0 screens² |
| Interquartile range | | | 3.45 – 7.1 screens² |

- **Shape mix** (**D**; aspect in screens of 1.5 or more is horizontal, 1/1.5 or less is vertical): **18 horizontal (40%), 13 vertical (29%), 14 squarish (31%)**.
- **Large rooms** of 8 screens² or more: **8 of 45 (18%)**.
- **Only 3 exterior scenes are exactly one screen wide**, and all of them are vertical shafts (`C03`, `C27`, `C49`); the fourth is Sly's hut, an interior. **No exterior room is a single 1 × 1 screen.**
- The Crossroads rooms are **smaller than the game average.** The median area across all 497 tilemaps is 9.4 screens² (3.0 × 3.0 screens) (**D**). The hub is made of corridors and junctions. The big set pieces live in the areas it leads to.
- **Rooms are built from a few reused sizes** (**M**). The corridors `C39`, `C40` and `C43` are all exactly 88 × 25. The shafts `C03` and `C27` are both 30 × 72. `C38` and `C12` are 70 × 25 and 70 × 24. This is template reuse, and the art hides it.

**The 5 largest rooms**

| Scene | Role | u (W × H) | Screens | PH | Type |
|---|---|---|---|---|---|
| Ancestral Mound | Snail Shaman, Vengeful Spirit, Baldur nest | 142 × 75 | 4.73 × 4.44 (21.0) | 111 × 59 | set piece |
| C49 | Lift shaft to the City | 30 × 176 | 1.00 × 10.4 | 23 × 138 | vertical |
| C35 | Acid grub and Fog Canyon exit | 70 × 75 | 2.33 × 4.44 | 55 × 59 | vertical set piece |
| C10 | False Knight hall | 75 × 68 | 2.50 × 4.02 | 59 × 53 | boss arena |
| C07 | Gruzzer platform shaft, the west spine | 43 × 115 | 1.43 × 6.80 | 34 × 90 | vertical |

<details><summary>All 45 scenes (sorted by area)</summary>

| Scene | Role | u | Screens | Area (screens²) | PH | Shape |
|---|---|---|---|---|---|---|
| Ancestral Mound | Ancestral Mound | 142×75 | 4.73×4.44 | 21.0 | 111×59 | S |
| C49 | Lift shaft to City | 30×176 | 1.00×10.41 | 10.4 | 23×138 | V |
| C35 | Acid grub / Fog Canyon exit | 70×75 | 2.33×4.44 | 10.4 | 55×59 | V |
| C10 | False Knight hall | 75×68 | 2.50×4.02 | 10.1 | 59×53 | V |
| C07 | Gruzzer platform shaft (west) | 43×115 | 1.43×6.80 | 9.8 | 34×90 | V |
| C04 | Gruz Mother church + Deserted Village | 160×30 | 5.33×1.78 | 9.5 | 125×23 | H |
| C11_alt | Greenpath gate (Elder Baldur) | 120×36 | 4.00×2.13 | 8.5 | 94×28 | H |
| C01 | Well landing (entry) | 100×42 | 3.33×2.49 | 8.3 | 78×33 | S |
| C52 | Goam journal pit | 55×70 | 1.83×4.14 | 7.6 | 43×55 | V |
| C13 | Goam mask-shard room | 80×47 | 2.67×2.78 | 7.4 | 62×37 | S |
| C22 | Aspid Nest (Glowing Womb) | 105×35 | 3.50×2.07 | 7.2 | 82×27 | H |
| C06 | Outside Ancestral Mound | 60×60 | 2.00×3.55 | 7.1 | 47×47 | V |
| C45 | Myla (to Crystal Peak) | 70×50 | 2.33×2.96 | 6.9 | 55×39 | S |
| C36 | Lower Mawlek approach | 60×58 | 2.00×3.43 | 6.9 | 47×45 | V |
| C37 | Vessel Fragment hall | 110×30 | 3.67×1.78 | 6.5 | 86×23 | H |
| C02 | Outside Black Egg Temple | 90×35 | 3.00×2.07 | 6.2 | 70×27 | S |
| C21 | Pre-False Knight corridor | 100×29 | 3.33×1.72 | 5.7 | 78×23 | H |
| C42 | East Goam room | 110×25 | 3.67×1.48 | 5.4 | 86×20 | H |
| Mines_33 | Dark toll to Crystal Peak | 100×25 | 3.33×1.48 | 4.9 | 78×20 | H |
| Room_temple | Temple of the Black Egg | 70×35 | 2.33×2.07 | 4.8 | 55×27 | S |
| C19 | SE junction | 50×45 | 1.67×2.66 | 4.4 | 39×35 | V |
| C33 | Cornifer junction | 45×50 | 1.50×2.96 | 4.4 | 35×39 | V |
| C08 | Aspid arena (to Hot Spring) | 52×43 | 1.73×2.54 | 4.4 | 41×34 | S |
| C39 | Corridor east of Temple | 88×25 | 2.93×1.48 | 4.3 | 69×20 | H |
| C40 | Central corridor | 88×25 | 2.93×1.48 | 4.3 | 69×20 | H |
| C43 | Corridor to lift | 88×25 | 2.93×1.48 | 4.3 | 69×20 | H |
| C03 | Stag shaft (east) | 30×72 | 1.00×4.26 | 4.3 | 23×56 | V |
| C27 | Tram shaft | 30×72 | 1.00×4.26 | 4.3 | 23×56 | V |
| C09 | Brooding Mawlek | 86×25 | 2.87×1.48 | 4.2 | 67×20 | H |
| C16 | Central-east corridor | 76×27 | 2.53×1.60 | 4.0 | 59×21 | H |
| C18 | Fungal Wastes exit | 41×50 | 1.37×2.96 | 4.0 | 32×39 | V |
| C25 | Upper Mawlek approach | 70×27 | 2.33×1.60 | 3.7 | 55×21 | S |
| C05 | Central-west corridor | 75×25 | 2.50×1.48 | 3.7 | 59×20 | H |
| C38 | Grubhome | 70×25 | 2.33×1.48 | 3.5 | 55×20 | H |
| C12 | Corridor to acid | 70×24 | 2.33×1.42 | 3.3 | 55×19 | H |
| C31 | Spike-pogo grub | 69×23 | 2.30×1.36 | 3.1 | 54×18 | H |
| C14 | NE junction | 33×48 | 1.10×2.84 | 3.1 | 26×38 | V |
| C46 | Upper tram station | 55×25 | 1.83×1.48 | 2.7 | 43×20 | S |
| C30 | Hot Spring (bench) | 50×23 | 1.67×1.36 | 2.3 | 39×18 | S |
| C48 | Guarded grub | 57×19 | 1.90×1.12 | 2.1 | 44×15 | H |
| C15 | Corridor to tram shaft | 60×18 | 2.00×1.07 | 2.1 | 47×14 | H |
| C47 | Stag station (bench) | 47×19 | 1.57×1.12 | 1.8 | 37×15 | S |
| Room_Charm_Shop | Salubra's shop | 35×25 | 1.17×1.48 | 1.7 | 27×20 | S |
| Room_Mender_House | Menderbug's house | 35×25 | 1.17×1.48 | 1.7 | 27×20 | S |
| Room_ruinhouse | Sly's hut | 30×25 | 1.00×1.48 | 1.5 | 23×20 | S |

</details>

**What the sizes mean.** A typical Crossroads room is a **corridor about 2.5–3.7 screens long and 1.5–1.8 screens tall** (70–110 × 25–30 u). Because it is taller than one screen, the camera moves vertically as well as horizontally inside it. The rest are **shafts about 1 screen wide and 4–7 screens tall**. Set pieces (the Mound, the False Knight hall, the Gruz Mother church and village) run from 8 to 21 screens².

## 3. Graph structure

Nodes are the 45 scenes. Edges are the vanilla transitions from RandomizerMod `Data/transitions.json`, and gates come from `Logic/*.json` (**M**). The metrics are **D**.

**Topology**

| Metric | Value |
|---|---|
| Nodes / internal edges | 45 / 49 (mean degree 2.18) |
| Independent loops (E − V + 1) | **5** (**D**). Their closing lengths are 5, 5, 8, 11 and 12 rooms (C04–C27; C09–C36; C16–C40; C03–C21; C19–C42). |
| Degree distribution | 1: 18 rooms · 2: 15 · 3: 4 · 4: 4 · 5: 2 · 6: 2 |
| Main junctions | **C07** (6 exits: the west shaft), **C03** (6: the east shaft), **C33** (5: Cornifer's room), **C04** (5: the village) |
| Loop core (2-edge-connected, containing the well) | 23 of 45 rooms |
| Bridges / articulation rooms | 22 / 15 |
| Degree-1 rooms | 18. **14 are true dead ends.** The other 4 hold area exits. |
| Dead ends with a payoff | **14 of 14.** Grub ×2 (C31, C48), Grubhome, Glowing Womb, Hot Spring + bench, Stag + bench, tram, Goam journal, Vessel Fragment hall, Ancestral Mound (spell + bench), Temple, and the 3 shop/NPC interiors. |
| Diameter | 9 rooms (C52 to C45) |
| Depth from the well | max 9, mean 4.5 rooms |

**One-way drops: 0.** Every transition in the area is logged `TwoWay`, and no vertical transition needs a movement ability to climb back up for a player who can reach it (**M**). The only exception is `C21 → C22`, whose upward exit needs claw or wings, and the player needs claw or wings to get there anyway. **The hub never strands you.**

**Shortcuts and one-sided openers** (**M**, logic)

1. **The Shaman pillar, C06 → C33.** It opens only from the C06 side (`Opened_Shaman_Pillar` = reached C06). You reach C06 only after beating False Knight. It links the Mound and False Knight side back to Cornifer and the well's column. It also opens automatically when the area becomes infected.
2. **The Mawlek wall, C09 → C33.** It opens from the Mawlek side after the boss is killed.
3. **The False Knight hall, C10 → C06.** You enter from the east. Going west through it needs `Defeated_False_Knight`.
4. **The Stag, C47 ↔ Dirtmouth.** A 50-Geo toll, 7 rooms and 388 u from the well (**M**/**D**).
5. **The lift, C49 ↔ City of Tears.** A 150-Geo toll, **paid from the City side**. It is the classic "open it from the far end" shortcut.
6. **The tram, C46.** Needs the Tram Pass from Deepnest.
7. **Breakable walls: 8 objects in 7 rooms** (C03, C07, C08, C10 ×2, C18, C21, C27). There are also 4 break-floor objects, 3 collapsers and 1 one-way wall (**M**, scene dump).

**Exits to other areas: 7 exits plus 2 fast-travel links, reaching 7 neighbouring areas** (**M**). **On the first visit, every exit except the well is locked, and each by a different key:**

| Exit | Direction from the well | Key needed |
|---|---|---|
| Dirtmouth (well, C01 top) | N | none |
| Greenpath (C11_alt west) | W | Kill the Elder Baldur: needs **Vengeful Spirit** (`LEFTBALDURS`) |
| Fungal Wastes (C18 bottom) | SW-S | Entering C18 from C08 needs **left dash** (Mothwing Cloak) |
| Fog Canyon (C35 bottom) | SW | **Acid** (Isma's Tear) |
| City of Tears (C49 lift) | S | Lift toll paid in the City |
| Resting Grounds via Blue Lake (C04 east) | SE | **Claw + Wings**, then Crystal Heart or swim |
| Resting Grounds via tram (C46) | E | **Tram Pass** |
| Crystal Peak (Mines_33) | E | **Lumafly Lantern** (dark room) |
| Crystal Peak (C45 → Mines_01) | NE | **Desolate Dive** floor |
| Stag network (C47) | — | 50 Geo |

The exits fan out across about 160° of the lower half-plane from the well: W 200°, SW 225°, S 250°, S 285°, SE 330–342°, and E 355° (**D**, from derived room positions). Only the north exit, back to town, is free.

**Critical path, first pass** (door-to-door Manhattan distance inside rooms, **D**, a lower bound)

`Well C01 → C02 → C39 → C14 → C16 → C03 → C21 → C10 (False Knight)` = **8 rooms, 475 u (15.8 screen-widths, 57 s of pure running)**. The route `C01 → C07 → C05 → C40 → C16` is the same length within a few percent.
→ West through C10 (+76 u) → C06 → Ancestral Mound (Vengeful Spirit about 25 u inside) → back out, and the pillar opens → C33 → C07 → C11_alt, where you kill the Elder Baldur and reach Greenpath (+335 u).

- Total ≈ **936 u ≈ 31 screen-widths ≈ 113 s** of running (**D**).
- **13 unique rooms, which is 29% of the area's rooms and 39% of its area.** The other 71% of rooms are optional on the first pass. You can enter 43 of the 45 rooms with only the nail (**D**; only C06 and the Mound sit behind the False Knight gate), but you can leave only through the well.

**The world is only locally consistent.** Stitching the rooms together by their door coordinates places every room (**D**). Six long loops then fail to close by 17–58 u (0.6–2 screens) (**M**/**D**). Every door lines up exactly with its neighbour, but the global geometry doesn't. The hand-drawn map hides the mismatch.

## 4. Rest and map

- **Benches** (**M**, Benchwarp `benches.json`): Hot Spring (C30), Stag (C47), Salubra (C04, outside the shop), Ancestral Mound, and the Black Egg Temple atrium (endgame only). Dirtmouth adds the town bench.
  - A nail-only first pass has **3 usable rests**: Dirtmouth, Hot Spring and Stag. The Mound bench is added after False Knight, and Salubra's after the dash.
  - That is about **1 bench per 11 rooms, or 1 per 60 screens²** (**D**).
- **Rooms from the well to each rest** (**D**): Dirtmouth bench 0 rooms (53 u across town from the well); Hot Spring 5 rooms (310 u); Stag 7 rooms (388 u); Mound 4 rooms after False Knight.
- **Death-run length** (**D**; the worst door in each room, measured to the nearest usable bench, Manhattan distance, which is a lower bound):
  - First pass with Dirtmouth, Hot Spring and Stag: **median 202 u (24 s), max 399 u (48 s)**, at C09.
  - With the Dirtmouth bench alone: median 452 u (54 s), max 667 u (80 s), at C04. The two in-area benches **halve** the corpse runs.
  - Add about 1.3–1.6× for real platforming paths and enemies (**E**).
- **Map acquisition** (**M**):
  - You start with no map.
  - Cornifer sits in **C33, 2 rooms and 192 u (about 23 s) from the well**. He sells the map for **30 Geo**. You find him by a paper trail plus audible humming.
  - The Quill costs **120 Geo** from Iselda in Dirtmouth.
  - The map updates **only when resting** (wiki).
  - The Wayward Compass (220 Geo) shows your position. Bench pins cost 100 Geo.
  - Gibson: "purchasing simple maps from a cartographer and expanding on those yourself as you explore" (Game Informer).

## 5. Landmarks and sightlines

**19 landmark rooms out of 45, about 1 every 2.4 rooms** (**D**, from our list):

- the well landing
- the Black Egg Temple façade (C02) and its interior
- Grubhome
- Cornifer's room
- the Ancestral Mound exterior and interior
- the False Knight hall
- the Stag station
- the Hot Spring
- the Aspid Nest (a giant Aspid corpse)
- the Gruz Mother church and Salubra's village
- the tram station
- the lift shaft
- Myla's mine
- the Mawlek den
- the Greenpath gate with the Pilgrim's Way sign and tablet
- the dark toll
- the Goam pit

**Distance to the nearest landmark** (**D**): 0 rooms for 19 rooms, 1 room for 16, 2 rooms for 9, and 3 rooms for 1 (C31). **44 of 45 rooms are within 2 rooms of a landmark.** The rooms 2 away are the plain corridors (C05, C40, C16, C15, C42, C12, C25, C13).

**How the player stays oriented**

- **The well is a fixed origin at the top.** It drops into the middle of C01 (x = 52.5 of 100 u). C01 is a **T-junction**: the Temple is 1 room east, and Grubhome is 2 rooms west through C07. You choose a direction the moment you land, and each exit is about 50 u (6 s) away.
- **Five horizontal strata connected by shafts** (**D**, derived y-bands). The roads run at a few consistent depths:
  - surface road, y ≈ 0 to +45: C38, C01, C02, C39, C14, C45
  - upper-middle, y ≈ −45 to −10: C11_alt, C05, C40, C16
  - middle, y ≈ −100 to −25: C25, C36, C09, C06, C10, C21, C15, C47
  - lower, y ≈ −170 to −90: C12, C35, C33, C08, C30, C13, C42, C43, C19, C04
  - exits below: C18, C52, the C49 lift

  Two long columns cross them: the **west spine C07 (115 u)** and the **east spine C03 plus C27 (72 u each)**. The area is literally a crossroads of roads and shafts, and the map reads as a grid.
- **Signage.** 19 signpost objects sit in 17 of 45 scenes (**M**, scene dump). They include direction signs, stag signs pointing to the station, a Pilgrim's Way sign, and village signs. A stag sign sends the player toward the station (vgkami).
- **Sound as a beacon.** Cornifer hums (wiki), and Myla sings (**E**).
- **Vistas.**
  - The Black Egg Temple façade frames the east road.
  - The Ancestral Mound's bone arch sits above C06.
  - The False Knight hall (10 screens²) is the first big vertical space.
  - The Aspid Nest has a glowing orange interior.
  - Salubra's pink shop lamps light the dark village.
  - The Hot Spring's steam and colour mark a rest from a distance.

  All of these are painted set pieces placed where a corridor opens up (**E**, wiki screenshots). There are only **15 `Light` components in all 45 scenes** (**M**). The glow is painted into the art, not calculated.

## 6. Traversal rhythm

- **One continuous movement chain is one room.** Transitions are fade cuts (§10), so each room is a chain. The median door-to-door distance is **58 u, about 7 s at run speed** (interquartile range 37–80 u). The longest crossing in a typical room is 80 u (9.6 s) (**D**, 119 door pairs).
  - Corridors of 88–110 u take **10.6–13.3 s** to run across, before combat (**D**).
  - Shafts are 72 u (C03, C27) or 115 u (C07) of climbing through ledges and platforms.
- **Platforming density is low.** Damaging spike objects appear in only **12 of 45 rooms (27%)**, which is a lower bound (**M**). Most of them are optional: C36 has 46 and C25 has 27 on the Mawlek approach, C31 has 12 (the spike-pogo grub), and C22 has 10 (the Nest).
  - Acid colliders appear in 2 rooms (C11_alt, C35). There are 146 hazard-respawn markers across 45 scenes (**M**).
  - The **critical path is mostly running and fighting on flat ground.** Precision platforming is kept for side rooms that pay a grub or a mask (**D**).
- **Calm and intense stretches alternate:**
  - **22 of 45 rooms (49%) have no roaming enemies** on the first pass (**D**, §7).
  - 3 bosses and 5 wave arenas are the intense set pieces: the Aspid trio (C08), the Husk Guard (C48), the Elder Baldur ×2, and the Aspid Nest (4 waves).
  - The critical path runs roughly: fight corridor → quiet junction → fight corridor → boss → quiet Mound interior with Baldurs → gate fight (**E**).

## 7. Encounters

Enemy objects with a `HealthManager` component were counted per scene (**M**, EnemyRandomizerDB scene dumps). The count excludes spawners, the Gruz Mother's brood, NPC maggots and arena waves. Goams are invulnerable hazards and are not counted.

| | Base Crossroads | Infected Crossroads |
|---|---|---|
| Roaming enemies (excluding bosses and Elder Baldurs) | **118** | **135** (+14%) |
| Density across all 248 screens² | **0.48 per screen²** | 0.54 |
| Rooms with no enemies | **22 / 45** | 18 / 45 |
| Median per room / mean | 1 / 2.6 | 2 / 3.0 |
| Density in rooms that have enemies (median / max) | **0.74 / 2.2 per screen²** | 0.72 / 2.2 |

- **Types, base state** (**M**): 15 roaming types. Tiktik 14, Vengefly 14, Wandering Husk 13, Gruzzer 13, Husk Bully 11, Baldur 11 (all in the Mound), Aspid Hunter 9, Husk Hornhead 9, Crawlid 6, Aspid Mother 6, Leaping Husk 6, Husk Warrior 2, Husk Guard 2, Glimback 2, Elder Baldur 2. Goams, Maggots and Menderbug are listed by the wiki but carry no health.
- **Bosses** (**M**): False Knight (C10, required), Gruz Mother (C04, optional; it opens the village), and Brooding Mawlek (C09, optional, hidden behind a wall). Failed Champion comes later, as a dream boss.
- **Placement patterns** (**D**):
  - **By vocabulary.** Flyers (Gruzzers, Tiktiks) crowd the shafts: C07 has 9 Gruzzers and 7 Tiktiks. Husks crowd the corridors. Aspids crowd the nest end.
  - Enemies cluster in "lanes." The **C37 hall has 14 husks**, the densest room, and it guards the Vessel Fragment.
  - Junction and rest rooms are kept empty: C02, C06, C30, C33, C38, C46, C47 and C49 have 0.
- **Arenas versus roaming** (**M**, wiki):
  - Locked wave arenas: the Aspid trio in C08 (2 waves), the Aspid Nest in C22 (4 waves; logic needs claw or wings, and the wiki lists Crystal Heart), and the Mound's Elder Baldur, which seals you in after you get the spell.
  - Unlocked "gauntlets": the Husk Guard in C48 and the Greenpath Elder Baldur.
  - Everything else roams. That is 3 bosses plus 5 arenas, so **8 set-piece fights across 45 rooms**, about 1 per 5–6 rooms.

## 8. Secrets and rewards

- **69 item locations in 45 scenes**, 1.5 per room and 0.28 per screen² (**M**, randomizer locations). By type:
  - Geo rocks 34, Soul Totems 7, Grubs 5, Charms 3 (plus Salubra's stock), Masks 2, Roots 2, Lore 2, Relics 2
  - Vessel 1, Spell 1, Key (City Crest) 1, Geo chest 1, Map 1, Stag 1, Lifeblood cocoon 1, Journal 1, Dreamer tablet (World Sense) 1, and Boss Geo and Essence
- **34 of 45 rooms (76%) hold at least one item. 26 (58%) hold something other than a Geo rock** (**D**). The 11 empty rooms are corridors, junctions, the lift, and interiors that hold an NPC instead.
- **Hidden spaces** (**M**, scene dump): 9 "Secret Mask" objects plus 7 re-maskers (fake walls that fade to show hidden rooms), and 8 breakable walls. Hidden spaces appear in about **12 rooms (27%)** (**D**).
- **How they are signposted** (**E**, walkthroughs):
  - A cracked-wall art style.
  - Geo rocks placed in plain sight near the hidden entrance.
  - Grubs cry out, and there are 5 grubs in this area.
  - Cornifer's papers.
  - The Grubfather rewards collection at thresholds: 60 Geo at 5 grubs, a Mask Shard at 10 (rogueranker). This gives optional rooms a reason to exist.
- **Breakable dressing as a small reward:**
  - 339 `Breakable` objects, about 7.5 per room (**M**). Most are breakable poles: 124 poles, 101 pole tops and 101 pole bases.
  - Torches and signs break too.
  - Hitting the scenery always does something.

## 9. Area identity

- **Palette** (**E**, wiki screenshots):
  - Desaturated blue-slate and grey-violet, with pale ferns and cream highlights.
  - Accents are warm orange lamp-bugs, Salubra's pink, and the Mound's white bone.
  - **When infected, the palette flips to orange pustule light against the same blue.** The geometry stays the same and the dominant hue changes.
- **Lighting.** Painted, not calculated: only 15 `Light` components in 45 scenes (**M**). There are 54 `lamp_bug` objects plus 25 shop lamp-bugs (**M**). Glowing props act as light sources.
- **Density of layers and set dressing** (**M**):
  - **33,132 `SpriteRenderer`s in 45 scenes, about 134 per screen²** (median 138).
  - The densest rooms are C18, C03, C42 and C12, at 225–245 per screen². The sparsest are C49 (22) and C52 (38).
  - There are 47,885 scene objects in total, about 1,060 per scene.
  - Foreground silhouettes are black shell-rubble occluders framing the edges. Behind the playfield sit misty blue colonnades and arches (**E**, screenshots).
- **Shape language and terrain.**
  - The collision is rectilinear: axis-aligned tilemap edges. We found no slope colliders (**E**).
  - The *art* is organic. Stacked fossil-shell rubble with rounded silhouettes covers the square collision.
  - Repeated motifs: 16 "crossroads statue shell" pieces plus 10 statue bases; arched colonnades on thin iron pillars; railings and fences along the roads; hanging lamps; signposts (**M**/**E**).
- **Music and ambience** (**M**, wiki):
  - Main theme "Crossroads", with an **Action** layer used in arenas. Ambience layers "Cave Noises" and "Cave Wind".
  - The Mound has its own "Shaman theme". The Black Egg Temple has its own track.
  - **Infected:** a separate "Infected Crossroads" track plus a third ambience layer, "Shimmer."
  - There are 6 `MusicRegion` components in the area (**M**). The track carries across rooms without restarting (**E**).
- **Environmental storytelling** (**M**, wiki):
  - It was once a traveller's junction: "highways and crossroads pulsed with life" (Last Stag).
  - The Pilgrim's Way tablet points onward to the City.
  - Husks are reanimated citizens.
  - The Black Egg is the game's endgame goal, placed **1 room from the start**.
  - Salubra thinks the village is "full of life."

**Infected Crossroads (the revisit state)** (**M**)

| What changes | Numbers |
|---|---|
| Scenes with an infection toggle | **36 of 45** (Infected/Uninfected parent objects) |
| Objects switched | 5,813: 5,565 infected-only and 248 uninfected-only; median 151 per affected scene |
| Paths sealed | **2 passages** (C03 ↔ C19; C06 ↔ C10), with 4 blockade objects (ItemChanger) |
| Paths opened | **1**: the Shaman pillar opens automatically |
| Enemies | +14% roaming. Vengefly 14 → 4 while Furious Vengefly 0 → 21. Wandering Husk 13 → 6 while Violent Husk 0 → 12. Slobbering Husk 0 → 9. Gruzzer 13 → 3 while Volatile Gruzzer 0 → 7. Lightseed added (wiki). |
| Audio | A new main track and an extra ambience layer |
| Places left untouched | Grubhome and the Ancestral Mound's enemy set |
| Trigger | Monarch Wings, or the first Dreamer |

## 10. Camera and transitions

**Camera** (**M**, decompiled code and scene dumps)

- **Following.** A SmoothDamp follow. The target has horizontal look-ahead that eases at 6 u/s up to `xLookAhead`, and dashes add their own look-ahead.
- **Look up and down.** Holding up or down shifts the view by **±6 u, which is 35% of the screen height**.
- **Clamping.** The camera centre stays inside the room, 14.6 u in from the sides and 8.3 u from the top and bottom. The camera never shows outside the tilemap.
- **Lock zones.** `CameraLockArea` volumes clamp the view inside a room and can disable look-up or look-down.
  - **104 of them across 45 scenes. 39 rooms (87%) have at least one; the median is 2 per room.**
  - The Mound alone has 23 and C09 has 5.
  - Rooms are composed as **several framed shots**, not a free scroll.
- **Room transitions.** A **cut through a fade to black**, then the hero auto-walks in.
  - Scripted waits in `HeroController`'s scene-entry coroutine: 0.165 s + 0.2 s, plus 0.25–0.33 s for vertical entries. There is a 0.3 s fade-in delay in `GameManager`.
  - Total ≈ **0.8–1.5 s per transition including load** (**E**).
  - Nothing streams seamlessly. Every door is a fade.

## 11. Teaching

Order along the critical path (**M**/**D**, from the room enemy lists and the path in §3):

1. **C01, the landing.** Crawlid (passive), Tiktik (a crawler on walls) and Wandering Husk. These are safe nail targets beside the first choice.
2. **C07, the west shaft.** 9 Gruzzers and 7 Tiktiks. It teaches hitting flyers and climbing with enemies in the way. Grubhome, the first "collect these" goal, sits 1 room off it.
3. **The corridors (C05/C40/C16 or C39/C14).** Leaping Husk, Husk Hornhead (a charger) and a Vengefly trio (C16: 3). One new threat per corridor, **tested in a flat, readable lane.**
4. **C03, the east shaft.** Aspid Hunters (ranged spitters) inside a vertical space. The stag sign sits here.
5. **C21.** 2 Husk Bullies plus a Husk Guard. This is **the whole husk vocabulary combined**, right before the boss.
6. **C10, False Knight.** A giant husk boss that falls **in the same room as a husk ambush** (the pre-battle Husk Bully, Hornhead and Wandering Husk). This is **combine**.
7. **The Mound.** Pick up Vengeful Spirit (**introduce**). An Elder Baldur locks you in the moment you get it (**test**: the spell is the only practical answer). Eleven rolling Baldurs that block the nail fill the Mound (**twist**). The Greenpath gate's Elder Baldur (**combine**, and it is also the key) sends you out.
8. **Systems.**
   - The map comes in 2 rooms (buy it) and is completed at rests.
   - The first bench is 5 rooms in.
   - The Hot Spring restores health and soul next to a bench.
   - The Stag toll is the first "spend Geo to shorten the world" choice.
   - Seven visibly locked exits teach the lock vocabulary long before any of their keys exist.
9. **The revisit twist.** Infection re-tests familiar geometry with upgraded enemy variants. Sealed passages force new routes through a place the player thought they knew.

## 12. Why it works

**1. One origin, seven spokes, and a free way home.** Everything hangs from a single fixed point: the well at the top edge, about 37% from the west end of the area. You know where "up and out" is at all times, because town is always north. The seven exits fan across the lower half-plane in different directions, so a direction on the map means a biome: west is green, southwest is acid, south is fungus and the City, east is crystal and tram. The hub works like a compass rose. Crucially, **every exit except home is locked on the first visit, each by a different key.** The Crossroads is a **showroom of locks.** You can see 43 of 45 rooms with only the nail, and every closed door becomes a promise. Each later ability pays off in the hub, because it opens one more spoke there.

**2. A grid of roads, not a maze of caves.** Five horizontal strata are crossed by two long shafts, the west spine C07 and the east spine C03 plus C27. Corridors reuse a few sizes (88 × 25, 30 × 72) and run at consistent depths, so the player can build a mental map before owning a paper one. That is why the map is only 30 Geo, 2 rooms in: Team Cherry can hand it over early because the space is already legible. The map then shows a grid that confirms what the player learned by walking.

**3. Rooms are shots, and shots open onto vistas.** The median room is 2.3 × 1.8 screens, so it is never a single static screen. It is also never so big that you lose the thread. There are 104 camera lock zones (87% of rooms). The camera frames each segment deliberately, and the corridor that opens into the Temple façade, the Mound's arch or the False Knight hall is timed so the set piece arrives inside a frame. Vertical height of 1.5–1.8 screens in the corridors keeps a ceiling and a floor on screen together. Space feels enclosed and "underground" without feeling flat.

**4. It feels like one place because the local continuity is perfect and the vocabulary repeats.**
- Every door lines up to the unit. Global loops can be off by 2 screens, and nobody notices, because the player only ever checks continuity at the door they just walked through.
- The same palette, the same two ambience beds, one uninterrupted music track, and the same props appear in almost every room: lamp-bugs, railings, statue shells, signposts and breakable poles. At about 134 sprites per screen² there is no bare room. Even the corridors are fully dressed.
- The **Infected** version changes 5,800 objects in 36 rooms and keeps every wall. The player recognises the place and feels that it has changed. That builds attachment in a way a new area can't.

**5. Density is uneven on purpose.** Half the rooms have no enemies. The other half average about 0.74 enemies per screen². Rest rooms, junctions and landmark rooms are kept quiet, and lanes are loaded. Every dead end (14 of 14) pays out. So the rhythm is: the road fights you, junctions let you think, and side-rooms reward curiosity. Precision platforming, where spikes are dense, is kept almost entirely to optional reward rooms. The critical path stays about running, reading enemies and choosing directions.

**6. Shortcuts pay back effort at the moment of highest tension.**
- The Shaman pillar opens from the far side right after the False Knight. The walk back to the well and Greenpath then shrinks from 8+ rooms to 3.
- The Mawlek wall and the lift (paid in the City) repeat the pattern.
- Loops are short (5–12 rooms), so any wrong turn comes back round to something familiar within about a minute.

**7. Teaching is embedded in place, not in tutorials.** Each new enemy is introduced in a flat lane, tested in a shaft, and combined before a boss. The first spell is taught by locking you in with the one enemy that needs it. The map, bench, toll and Hot Spring systems are all met within 7 rooms of the well.

**What the numbers miss** (**E**):
- The atmosphere of the painted parallax.
- The loneliness of a hub with no music changes while exploring.
- The fossil-shell texture that makes rectangular rooms read as organic.
- The fact that the endgame (the Black Egg) is visible, and sealed, 1 room from the start. That turns the whole game into a return journey.
- Players also call the Crossroads the plainest area. Its job is to be a legible frame for the stranger places it leads to.

## 13. What *Tallage* should steal, adapt or avoid

All numbers are in *Tallage* units. Because 1 HK unit ≈ 1 tile and the screens are the same, HK sizes carry over directly.

**Current gap.** The vertical slice plan in `world-design.md` §4 has a **3-room hub** of 30 × 34 tiles, and slice rooms of 30–75 × 23–51 tiles. The Crossroads is **45 rooms and 248 screens².**

**Steal**

| Target | Hub value (full game) | Phase W blockout, Tally hub portion |
|---|---|---|
| Rooms | 30–45 | **14–20** |
| Total room area | 200–250 screens² | **70–100 screens²** |
| Footprint | about 20 × 15 screens, 50% filled | about 10 × 8 screens |
| Median room | **70 × 30 tiles** (2.3 × 1.8 screens, 4.4 screens², 56 × 24 PH) | same |
| Room-area interquartile range | 3.5–7 screens² | same |
| Minimum room | 30 × 17 tiles, **only for shafts or interiors.** No exterior room is a single 1 × 1 screen. | same |
| Large rooms (8 screens² or more) | about 18%. One set piece of 20 screens² or more (a Mound-scale 140 × 75). | 2–3, including one of 12 screens² or more |
| Shape mix | 40% horizontal / 30% vertical / 30% squarish | same |
| Corridor module | 88 × 25 tiles (and 70 × 25, 110 × 25). The height is **1.5–1.8 screens**, not 1. | same |
| Shaft module | 30 × 72 tiles (1 × 4.3 screens). One spine of 110 tiles or more. | 2 shafts |
| Mean degree / junction rooms | 2.2 / 2–4 junctions of degree 5–6 | 2.2 / 2 junctions |
| Loops | 1 independent loop per about 9 rooms, loop length 5–12 rooms | 2 loops |
| Dead ends | about 30% of rooms, **100% of them paying out** | same |
| One-way drops in the hub | **0** | 0 |
| Shortcuts | 3 or more, opened from the far side (after a boss, from a neighbouring district) | 1–2, including the B5 → T2 latch |
| Exits | 7 spokes to distinct districts plus 2 fast-travel links. **Every non-home exit locked on the first visit by a distinct, visible key.** | 3 or more visible locked exits plus the Cellars route |
| Critical path | about 30% of rooms, about 40% of area, about 900–950 tiles, about 100–110 s of running at 9 tiles/s | 5–7 rooms, 400–500 tiles |
| Entrance | The entrance room is itself a landmark and a T-junction, with a second landmark 1 room away and a third 2 rooms away. Map seller within 2 rooms (about 200 tiles); first rest within 5 rooms | same |
| Rests | 1 per about 10 rooms or 60 screens². Worst death run 400 tiles or less (about 45 s); median 200 tiles or less (about 22 s). | 1 Corner in the hub plus the town rest |
| Landmarks | 1 per about 2.4 rooms; **every room within 2 rooms of a landmark**; a signpost system pointing to fast travel and exits | 5–7 landmarks |
| Enemies | 0.5 per screen² overall; **about 50% of rooms empty**; enemy rooms 0.7 per screen² (3 in a 4.4-screen² room); 1 set-piece fight per 5–6 rooms | same ratios |
| Rewards | 75% or more of rooms hold something; 1.5 per room; hidden spaces in about 25% of rooms | same |
| Camera | Lock or framing zones in about 85% of rooms (median 2); look up/down about 6 tiles (35% of screen height) | same |
| Dressing | About 130 sprite-equivalents per screen² at final quality. Budget our art pass and draw calls for this. | Greybox: silhouette occluders on every screen edge |
| Revisit state | One world event changes about 80% of hub rooms (a colour, enemy variants, +15% enemies), **seals 2 routes, opens 1**, and adds 1 music track and 1 ambience layer. This maps directly onto our fever steps (W6). | Fever 1 on the hub rooms |

**Adapt**

- **The lock showroom → the Tally's ledger.**
  - Each hub exit shows its key's glyph (world-design already requires this). Make that **7 or more exits spread around a compass**, not a row of doors.
  - Put the town (home) at one fixed edge so "back" is always one direction.
  - Keep the endgame visible and sealed within 1–2 rooms of the entrance (our equivalent of the Black Egg).
- **Roads and shafts → the Tally's streets and stairwells.**
  - Build the hub as 4–5 street levels at consistent heights (the noise-colour layering in W5 fits this well).
  - Cross them with 2 long stairwell spines.
  - Reuse 3–4 room size modules so the space becomes legible before the ledger is bought.
- **Local door continuity.** Door heights and positions must match exactly across every transition, within 1 tile. Global loop closure can be off by up to about 2 screens if the ledger is drawn by hand. Our progression validator should check the first rule, not the second.
- **The Copyist (Cornifer).** Put him within 2 rooms and about 200 tiles of the hub entrance. He is audible from 2 rooms away. The ledger updates at Corners. This is already in the design; the numbers above give it placement targets.

**Avoid**

- **Fade transitions of 0.8–1.5 s.** Our bar is under 300 ms (PLAN §1). Keep the room-as-shot framing and drop the black-out.
- **One screen per room, and 23-tile-tall corridors that fit in a single view.** L4's rooms are close to this. HK corridors are 25–30 tiles tall, so the camera always has vertical play.
- **The Crossroads' plainness.** HK can afford a bland hub because its neighbours are spectacular. Our slice *starts* in the hub, so the hub needs its own set pieces. Aim for 2–3 of 8 screens² or more in the blockout.
- **Long runs back to a single bench.** With only Dirtmouth's bench, HK's corpse runs would roughly double, to a median of 54 s. Two in-area rests are the minimum for a hub of this size.

## 14. Sources

**Data (primary)**
- Scene tilemap sizes, 497 scenes: MapChanger `tileMaps.json`. https://github.com/syyePhenomenol/MapChanger/blob/master/MapChanger/Resources/tileMaps.json
- Room list, map areas, vanilla transitions: RandomizerMod `Data/rooms.json`, `Data/transitions.json`. https://github.com/homothetyhk/RandomizerMod/tree/master/RandomizerMod/Resources/Data
- Gates and logic: RandomizerMod `Logic/transitions.json`, `Logic/waypoints.json`, `Logic/macros.json`. https://github.com/homothetyhk/RandomizerMod/tree/master/RandomizerMod/Resources/Logic
- Item locations and pools: RandomizerMod `Data/locations.json`, `Data/pools.json` (same folder as above).
- Door and bench coordinates inside each room: TangledMapView `mapData.js`. https://github.com/sirbrialliance/TangledMapView/blob/master/Web/mapData.js
- A cross-check of world positions: HollowKnightNoAreaTransitions `Maps/HollowKnight.cs`. https://github.com/jakzo/HollowKnightNoAreaTransitions/blob/main/src/Maps/HollowKnight.cs
- Vanilla bench list: Benchwarp `benches.json`. https://github.com/homothetyhk/HollowKnight.BenchwarpMod/blob/master/Benchwarp/Resources/benches.json
- Per-scene object dumps (enemies, sprites, camera locks, hazards, secrets, infection groups): EnemyRandomizerDB `SceneData_*.xml`. https://github.com/Kerr1291/EnemyRandomizerDB/tree/main/EnemyRandomizerDB/SceneData
- Infected blockades: ItemChanger `RemoveInfectedBlockades.cs`. https://github.com/homothetyhk/HollowKnight.ItemChanger/blob/master/ItemChanger/Modules/RemoveInfectedBlockades.cs
- Camera clamps and look offset: decompiled `CameraController.cs`, `CameraTarget.cs`, `CameraLockArea.cs`. Transition waits: `HeroController.cs`, `GameManager.cs`. https://github.com/ayushpaharia/hollow-knight-code/tree/main/Assembly-CSharp
- Knight collider 0.5 × 1.28125 u: hkrl `analysis/specs/hero-motion.md`. https://github.com/Ramora0/hkrl/blob/main/analysis/specs/hero-motion.md
- Run speed 8.3 u/s: our `docs/design/movement-spec.md` (cites the decompiled HeroController constants).

**Wiki and guides**
- Forgotten Crossroads (description, enemies, arenas and waves, infection, music layers, sub-areas): https://hollowknight.wiki/w/Forgotten_Crossroads
- Crossroads map image: https://cdn.wikimg.net/en/hkwiki/images/7/72/Forgotten_Crossroads_Map.png. Screenshots Screenshot_HK_Forgotten_Crossroads_01–13 and _Grey on the same page.
- Cornifer (30 Geo, paper trail, humming): https://hollowknight.wiki/w/Cornifer
- Map and Quill (Quill 120, compass 220, updates at rest): https://hollowknight.wiki/w/Map_and_Quill_(Hollow_Knight)
- Stag stations (Crossroads 50 Geo): https://hollowknight.wiki/w/Stag_Station
- Infection trigger: https://hollowknight.wiki/w/Infection
- Benches (50 in the game): https://hollowknight.wiki/w/Bench_(Hollow_Knight)
- Soundtrack (Infected Crossroads track): https://hollowknight.wiki/w/Soundtrack_(Hollow_Knight)
- Fextralife Forgotten Crossroads: https://hollowknight.wiki.fextralife.com/Forgotten+Crossroads
- VGKAMI walkthrough (stag sign, room order): https://vgkami.com/wiki/hollow-knight/walkthrough/forgotten-crossroads/
- Rogue Ranker Crossroads guide (Grubfather thresholds, Cornifer): https://rogueranker.com/hollow-knight-forgotten-crossroads/
- Lift toll of 150 Geo from the City side (Fextralife City of Tears; community): https://hollowknight.wiki.fextralife.com/City+of+Tears

**Team Cherry and design analysis**
- Game Informer, "The Making of Hollow Knight" (Gibson on mapping, getting lost): https://gameinformer.com/2018/10/15/the-making-of-hollow-knight
- Game Developer, "How the Hollow Knight devs mapped out their Metroidvania" (Pellen: "mainly intuition"): https://www.gamedeveloper.com/design/how-the-i-hollow-knight-i-devs-mapped-out-their-metroidvania-
- PC Gamer, "How to design a great Metroidvania map" (Pellen, "crossroads to the world", four areas). The full text could not be loaded; the quote comes from a search excerpt. https://www.pcgamer.com/how-to-design-a-great-metroidvania-map/
- WN Hub, "How Hollow Knight was created" (summarises the RPS interview; Crossroads as the quality standard, three minibosses): https://wnhub.io/news/other/item-14643
- Mark Brown / GMTK, "The World Design of Hollow Knight: Silksong" ("go somewhere else"): https://gmtk.substack.com/p/the-world-design-of-hollow-knight
- SUPERJUMP, "Getting Lost (by Design) in Hollow Knight": https://www.superjumpmagazine.com/getting-lost-by-design-in-hollow-knight/

**Method notes**
- Rooms were placed in the world by walking the transitions breadth-first from C01. Each neighbour's position is the current room's door coordinate minus the neighbour's matching door coordinate.
- Distances are Manhattan distances between door pairs inside each room, run through Dijkstra. They are lower bounds.
- Enemy counts classify objects under `Infected*` or `Uninfected*/non_infected*` parents by state. False Knight's hall uses its `_boss` scene.
- The analysis scripts were kept in the session scratchpad and not committed.
