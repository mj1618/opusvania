# Teardown: Ori and the Blind Forest (DE), Sunken Glades → Spirit Tree → Hollow Grove / Moon Grotto approach

Researcher: level-design teardown, 2026-09-28. Game version: *Definitive Edition* (DE) unless noted. Follows `docs/research/TEMPLATE.md`.

Ori is seamless, not room-based. Here a **segment** is a stretch of space between chokepoints (a door, a shaft neck or a narrow tunnel). Each segment roughly matches one or more of the game's streamed scene chunks.

## Units and how the numbers were obtained

| Quantity | Value | Label | How |
|---|---|---|---|
| World unit (u) | Unity world unit | — | All coordinates below are Ori world coordinates (x right, y up). |
| Ori hitbox | **0.68 × 1.15 u** | measured | LiveSplit.OriDE builds Ori's hitbox as `HitBox(pos, 0.68f, 1.15f)`. |
| **1 Ori-height (OH)** | **1.15 u** | measured | Used as the "player height" unit throughout. |
| Max run speed | 11.667 u/s = **10.1 OH/s** | measured | LiveSplit.OriDE restores `SetSpeed(11.6667f, …)` as the game's defaults. |
| Ground / air acceleration | 60 / 26 u/s² (0 → full run in 0.19 s on the ground, 0.45 s in air) | measured / derived | Same `SetSpeed` defaults. |
| Jump height parameter | 3 u = **2.6 OH** | measured | Same defaults. Consecutive grounded jumps get higher (second and third jump heights, with a flip on the third), per `SeinJump.cs`. |
| Other defaults | wall-jump impulse 6, climb 8, water 6, stomp 40, bash 56.6, charge jump 38, dash 50 u/s | measured | Same defaults. |
| Walkable slope | surface normal within **60°** of up = ground; within **30°** of horizontal (surface ≥ 60° steep) = wall | measured | `PlatformingMovement.OnCollision`: `IsGround(…, 60f)`, `IsWallLeft/Right(…, 30f)`. |
| Map scale | **8.74 px per u** on the 20480 × 14592 px community world map | measured | `getMapCrs()` in ori_rando_server calibrates two teleporters: Glades (109.9, −257.7) → px (11897, 11185), Swamp (493.7, −74.3) → px (15258, 9587). |
| **Screen (camera view)** | **≈ 42.7 × 24 u = 37 × 21 OH** (range 18–24 OH tall) | **estimated** | On 1920×1080 Steam gameplay shots Ori stands about 50–55 px tall with ears (measured). If the 1.15 u hitbox is about 50 px, a screen is about 24 u tall. The camera is a perspective camera whose zoom changes per zone, so this is the default-zoom value. |
| Conversion to *Tallage* | 1 OH ↔ 1 player height = 80 px = 1.25 tiles | — | This is the template's body-height conversion. |

Every "screens" figure below uses the estimated 42.7 × 24 u screen, so it carries about ±15% error. Figures in u and OH do not depend on that estimate.

**Headline scale fact (derived):** at default zoom, Ori's camera shows about **21 body heights** of height. *Tallage*'s shows **13.5**. On screen, Ori is about 35% smaller relative to the frame than Kid Tallow. Moon Studios did this on purpose: the art team wanted Ori very small on screen so the player sees far ahead and feels how small Ori is. Benson's GDC talk says the zoom was matched to *Super Meat Boy* ([Xbox Wire](https://news.xbox.com/en-us/2015/03/17/games-the-artwork-of-ori-and-the-blind-forest/), [GDC 2015 notes](https://zyzyz.github.io/en/2018/01/GDC2015-Animating-Ori/)).

---

## 1. Overview

- **Role.** Sunken Glades is the first explorable area and the tutorial for the whole game. It teaches movement, Sein (the attack), Soul Link saving, energy cells, keystone doors, map stones, ability trees and the first skill tree (Wall Jump). It ends at the Spirit Tree, the game's central landmark and the story's origin point. Next door is the Charge Flame tree, which unlocks the way out to Hollow Grove. Hollow Grove leads on to Moon Grotto and Thornfelt Swamp.
- **Arrival.** Play starts right after the prologue in Swallow's Nest. Mahler says the prologue took eight months to make ([orithegame Q&A](https://www.orithegame.com/qa-with-thomas-mahler-celebrating-8-years-of-ori-the-game/)). Ori respawns at **(189, −215)** in scene `sunkenGladesRunaway` (measured: `Randomizer.cs` sets `Sein.Position = (189, −215)`, and `GameController.GameStartScene = "sunkenGladesRunaway"`). The TAS waits **813 frames (13.6 s)** for the wake-up before the first input takes effect (measured, OriDETAS `01 Start to Sein.tas`).
- **Abilities on arrival.** Run and jump only. Sein (the Spirit Flame) is picked up at **(−162.4, −257.7)**, measured from the randomizer map icon. On the path that is about **360 u (≈ 8.4 screen widths, 310 OH)** from spawn. Wall Jump is at **(−316, −308)**. Charge Flame is at **(−56, −160)**, just below the Spirit Tree.
- **First-pass time.** An experienced player's 100% walkthrough spent **15 min** in Sunken Glades (from 10:00 to 25:10). It reached the Spirit Tree at 25:10, Hollow Grove at 28:15 and Moon Grotto at 40:55 ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2801279330)). That walkthrough is a secondary source. A **first-time player** probably takes **25–40 min** from spawn to the Spirit Tree (estimated, at 1.7–2.5× the experienced pace). The whole game is **8h14m (original) / 9h05m (DE)** of main story on [HowLongToBeat](https://howlongtobeat.com/game/36755). So the Glades take about **4–7%** of a first playthrough.
- **Scenes.** At least **15 streamed scene chunks** make up Sunken Glades (measured: the union of scene names in LiveSplit.OriDE `SceneIDs.cs` and the randomizer's `SceneToZone`). Examples: `sunkenGladesRunaway`, `…Running`, `…IntroSplitA/B`, `…EnemyIntroductionC`, `…ObstaclesIntroductionStreamlined`, `…Waterhole`, `…OriRoom`, `…SpiritCavernsPushBlockIntroduction`, `…SpiritCavernWalljumpB`, `…SpiritCavernLaser`, `…SpiritCavernSaveRoomB`, `…BackgroundB`, and `spiritTreeRefined`. Glades has about 40 screens of playable area (see §2), so each chunk averages **≈ 2.7 screens**. Mahler puts a room at a quarter to a half of a *Super Mario Bros. 3* level ([ResetEra](https://www.resetera.com/posts/9970544/)).
- **Pickups.** The randomizer's "Glades" zone has **29 pickup locations** (measured, `areas.ori`): 9 spirit-light, 8 keystones, 4 energy cells, 4 ability cells, 1 health cell, 1 map-stone fragment, 1 map stone and 1 skill tree. The wiki infobox lists 1 spirit well, 2 life cells, 4 energy cells, 8 keystones, 5 ability cells and 7 secrets.

## 2. Segment size distribution

I measured each segment's bounding box on the stitched world map (zoom 7, 8.74 px/u) against a 10 u grid, to about ±5 u. **Fill** is the share of the box that is open space on the map (measured by pixel count). The *Tallage* tiles column converts through body heights (OH × 1.25).

| Segment | u (w × h) | screens (est.) | OH | *Tallage* tiles | Fill | Shape |
|---|---|---|---|---|---|---|
| S1 Wake meadow (spawn) | 129 × 44 | 3.0 × 1.8 | 112 × 38 | 140 × 48 | 77% | H, vista |
| S2 Key-door approach + pond top | 151 × 45 | 3.5 × 1.9 | 131 × 39 | 164 × 49 | 56% | H |
| S3 Lower corridor (tunnel, pond, energy cell, well) | **290 × 28** | **6.8 × 1.2** | 252 × 24 | 315 × 30 | 52% | H |
| S4 Sein clearing + Fronkey ambush | 60 × 27 | 1.4 × 1.1 | 52 × 23 | 65 × 29 | 49% | M |
| S5 Glades main hub (inside key door) | 95 × 57 | 2.2 × 2.4 | 83 × 50 | 103 × 62 | 42% | M |
| S6 Left Glades (brambles, saws, map fragment) | 145 × 50 | 3.4 × 2.1 | 126 × 43 | 158 × 54 | 47% | H |
| S7 Drop shaft to Wall Jump | 20 × 45 | 0.5 × 1.9 | 17 × 39 | 22 × 49 | 53% | V |
| S8 Wall Jump cave (Fil's tree) | 160 × 32 | 3.7 × 1.3 | 139 × 28 | 174 × 35 | 50% | H |
| S9 Spirit Caverns (keystone climb) | 70 × 87 | 1.6 × 3.6 | 61 × 76 | 76 × 95 | 54% | V |
| S10 Spirit Tree dome | 110 × 55 | 2.6 × 2.3 | 96 × 48 | 120 × 60 | **91%** | set piece |
| S11 Charge Flame area | 125 × 60 | 2.9 × 2.5 | 109 × 52 | 136 × 65 | 44% | M |
| S12 Spider Sac (Upper Glades) | 90 × 85 | 2.1 × 3.5 | 78 × 74 | 98 × 92 | 56% | V |
| S13 Spider water | 125 × 25 | 2.9 × 1.0 | 109 × 22 | 136 × 27 | 64% | H |
| S14 Hollow Grove core (Kuro's tree) | 80 × 90 | 1.9 × 3.8 | 70 × 78 | 87 × 98 | 62% | V |
| S15 Death Gauntlet pond (toward Moon Grotto) | 75 × 60 | 1.8 × 2.5 | 65 × 52 | 82 × 65 | 46% | M |

- **Min / median / max** (measured): width 20 / **110** / 290 u. Height 25 / **50** / 90 u.
  - The median is **2.6 × 2.1 screens = 96 × 43 OH ≈ 120 × 54 *Tallage* tiles**.
  - For comparison, the current *Tallage* rooms in `content/gym/` have a median of **40 × 17 tiles (32 × 14 player heights)**. Their largest (gym-14, 96 × 34 tiles = 77 × 27 PH) is still smaller than Ori's median segment. Measured on 2026-09-28.
- **Shape mix** (on screen-normalised aspect): horizontal 6/15 (40%), vertical 4/15 (27%), mixed or large 5/15 (33%). One of the mixed segments is a true set piece (the Spirit Tree dome, 91% open). The wake meadow (77% open) works as a vista.
- **Total area** (derived from map pixels): Sunken Glades proper, excluding Black Root Burrows below it, is about **40,700 u² ≈ 30,800 OH² ≈ 40 screens**. Upper Glades and Hollow Grove up to x = 380 add about **33,000 u² (≈ 32 screens)**.
  - *Tallage*'s 25 rooms together come to about 13,600 PH². That is **less than half of Sunken Glades alone**, even though both are "about 40 screens". The gap is the camera scale.
- **Open-space ratio.** Inside a segment's bounding box, 42–64% is open space. Ori's spaces are carved (tunnels, overhangs, bulbs), not rectangles with a floor.

**The 5 largest segments by bounding box:** S3 Lower corridor (8,120 u²), S12 Spider Sac (7,650), S11 Charge Flame area (7,500), S6 Left Glades (7,250) and S14 Hollow Grove core (7,200). The dominant vertical space is S9 Spirit Caverns: **87 u = 76 OH ≈ 3.6 screens tall**.

## 3. Graph structure

There are two views of the graph.

**(a) The randomizer logic graph** (measured, `areas.ori`, casual paths, Glades and Grove area nodes, warp helpers excluded):
- 30 area nodes and 49 undirected connections.
- The hub is `GladesMain`, with degree 8.
- Dead-end nodes: `UpperLeftGlades` and (inside this subgraph) `HollowGrove`, which continues out to the Swamp.
- This graph over-counts loops, because each door appears twice (closed and open).

**(b) The physical segment graph** (derived from the map plus logic):
- **15 segments and 19 internal connections.**
- **5 independent loops**, but **4 of the 5 need a later ability**: Charge Flame, energy, or Stomp plus clean water. So on first pass Sunken Glades is essentially a **tree with 0–1 loops**.
- **Dead ends:** S4 Sein clearing and S8 Wall Jump cave, plus the Upper Left Glades pocket (needs Wall Jump).
- **Hubs:** S5 main hub (degree 4) and S1 wake meadow (degree 4 including the Black Root exit).
- **Gates:**
  - **3 keystone doors** needing 2, then 2, then 4 keys, 8 in total. The doors are the first key door (−15, −215), the Spirit Caverns door and the Spirit Tree door (−183, −132).
  - **3 energy doors** costing 4 energy each: the Death Gauntlet door (289, −199), the Glades laser door, and the spider-sac door.
  - Charge Flame barriers on the exits from the Spirit Tree and on the hub attic.
  - Thorn brambles (story block at spawn).
  - A pool that needs clean water (after Ginso).
- **One-way drops:**
  - **S6 → S7 → S8**: you fall into the Wall Jump pit and can only climb out with the skill it contains. The TAS labels for this stretch are JUMP OUT OF WALL JUMP PIT, AFTER FIRST CLIMB, and TURN AROUND IN ELBOW.
  - **S1 → Lower Charge Flame area**: logic marks it free in one direction, with the way back gated by Charge Flame.
- **Shortcuts (count 3, all ability-gated):**
  - Charge Flame opens hub ↔ attic ↔ Charge Flame area, which connects the spawn meadow to the hub without the key door.
  - Energy doors plus Wall Jump open spawn → Death Gauntlet → Moon Grotto.
  - Spirit wells at S3 and at the Spirit Tree become DE teleporters.
- **Exits to other areas (5):**
  - Black Root Burrows, from S1 with Wall Jump.
  - Valley of the Wind, from the Spirit Tree with Charge Flame.
  - Hollow Grove, from the Spirit Tree with Charge Flame via the Spider Sac.
  - Moon Grotto, via Hollow Grove or the Death Gauntlet.
  - Thornfelt Swamp and Horu Fields, via Hollow Grove.
- **Critical path** (derived from straight lines between anchor points, which underestimate the real path): spawn → Sein → back east for keystones 1 and 2 → key door → Left Glades → Wall Jump pit → back → Spirit Caverns → Spirit Tree comes to **≈ 1,400 u ≈ 33 screen widths ≈ 1,220 OH**.
  - Continuing through Charge Flame and the Spider Sac to Hollow Grove brings it to **≈ 1,900 u**. On to Moon Grotto is **≈ 2,100 u**.
  - At full run speed that is only **2 min (to the Spirit Tree)**, so about 85–90% of a first-timer's 25–40 min goes to platforming, combat, pickups and hesitation.
  - About **40% of the critical-path distance to the Spirit Tree is retracing**: Sein → keystone 1 (≈ 300 u back east), and out of the Wall Jump pit (≈ 160 u). The retraced legs are always done with a new tool: Spirit Flame on the first, Wall Jump on the second. Mahler states the principle directly: crossing an area one way with one set of abilities and back the other way with another feels like two different levels ([ResetEra](https://www.resetera.com/posts/10228077/)).
- **Critical path vs total.** The critical path passes through 9 of the 10 Glades-proper segments. Optional content sits in pockets off the path: Upper Left Glades, the energy-cell ledges, the pond, and the Kuro's Feather/Light Burst item at spawn. It does not sit in separate branches.

## 4. Rest and map

- **Fixed saves:**
  - **One spirit well** in the Glades, at **(109.9, −257.7)** in S3. That is **≈ 100 u (≈ 2.3 screen widths) from spawn**, on the critical path.
  - The next well is at the **Spirit Tree (−93, −118)**, **≈ 1,300 u of path later** (≈ 30 screen widths, ≈ 15 min for an experienced player).
  - After that come the Swamp well (496, −77) and the Moon Grotto well (≈ 443, −150).
  - Sources: randomizer map calibration and `areas.ori` anchors.
- **Player-placed saves (Soul Link)** cover the gap between wells.
  - A Soul Link costs one energy cell, has a cooldown of ~18 s, and can't be placed in the air, underwater, in unsafe zones or during escapes ([wiki](https://oriandtheblindforest.fandom.com/wiki/Soul_Link)).
  - The **first energy cell (−27, −256) is ≈ 220 u (≈ 5 screen widths, ≈ 20 s at run speed) from spawn**. The TAS places a Soul Link about 2 s after picking it up (a `Save` input follows the pickup's UI frames), so the save system is taught within the first minute of play.
  - Mahler's stated reason: dying should not feel like a big deal, and replaying 10 minutes from a far-away save is bad ([Steam post](https://steamcommunity.com/app/387290/discussions/0/2333276539607716284/?ctp=4)).
  - Moon dropped Soul Links in the sequel as too weighty and complex ([VideoGamer](https://www.videogamer.com/news/soul-links-in-ori-and-the-will-of-the-wisps-didnt-make-sense-says-developer/)).
- **Death-run length** depends on the player. With Soul Links used as intended it is typically **< 30 s** (estimated). Without them the worst case in the Glades is from the Spirit Caverns back to the S3 well: ≈ 600–700 u ≈ 1–2 min of travel (derived).
- **Map.**
  - The map fills in as you explore.
  - The **map stone (−81, −248) sits in the main hub** and needs a **map-stone fragment found in Left Glades (−184, −227)**, ≈ 110 u away. Placing it reveals the whole area.
  - The map tutorial pops up right after Sein (the TAS spends 32.8 s in its "CANCEL MAP" section, which includes the Sein dialogue).
  - Wall signposts at the hub point to the Spirit Caverns, Hollow Grove and (in DE) Black Root Burrows ([wiki](https://oriandtheblindforest.fandom.com/wiki/Sunken_Glades)).

## 5. Landmarks and sightlines

Landmarks along the first pass, with **path spacing (derived)**:

| # | Landmark | Type | Path distance from previous |
|---|---|---|---|
| 1 | Wake meadow: tall trees, light shafts, thorn wall | vista, story block | spawn |
| 2 | Spirit well | structure, save | ≈ 100 u |
| 3 | Pond with hanging platforms and a submerged cave | water set | ≈ 130 u |
| 4 | Sein in the grass, then the Fronkey ambush | story beat, arena-lite | ≈ 135 u |
| 5 | Keystone door (round stone, 2 sockets) | gate | ≈ 300 u (back east) |
| 6 | Hub signpost and map stone | wayfinding | ≈ 60 u |
| 7 | Rotating saws and pushable boulder (Left Glades) | hazard set | ≈ 110 u |
| 8 | Fil's Ancestral Tree (Wall Jump) | ability shrine | ≈ 160 u |
| 9 | Spirit Caverns doors and laser flowers | gate, hazard set | ≈ 190 u |
| 10 | **The Spirit Tree** | mega-landmark, set piece, well | ≈ 190 u |
| 11 | Charge Flame Ancestral Tree | ability shrine | ≈ 60 u |
| 12 | Spider-sac blue wall, spider water pegs | gate, hazard set | ≈ 150–250 u |
| 13 | Kuro's tree in Hollow Grove | mega-landmark | ≈ 190 u |

- **Count and spacing (derived):** 13 landmarks over ≈ 1,900 u. That is a **median of ≈ 140 u (≈ 3.3 screen widths, ≈ 120 OH, ≈ 12 s at run speed)** between landmarks, and a new identifiable feature every 1–4 screens.
- **Types:** 3 shrines/wells, 2 mega-trees, 3 gates, 3 hazard sets, 2 story beats.
- **Reveals:**
  - The **Spirit Tree dome** is the one space on the map that is 91% open (S10). You reach it through the vertical, cramped Spirit Caverns: 70 u wide, 54% open, 8 keystones and laser flowers. The reveal works by contrast after compression.
  - Hollow Grove's **Kuro's tree** is the second compress-then-release.
  - The spawn itself is a vista (77% open).
- **Orientation.**
  - The map is hub-and-spoke from S5: east is spawn, down is the corridor, west is the Wall Jump pit, and up is the Spirit Caverns and Spirit Tree.
  - The Spirit Tree sits at the geometric top-centre of the area and is the story goal from minute one.
  - Sub-areas are colour-coded on the map: blue lower glades, amber Spirit Caverns and Left Glades, gold Spirit Tree, green Spider Sac, teal-blue Hollow Grove (measured from the map colours). The colour change tells you which sub-area you are in.

## 6. Traversal rhythm and flow chains (emphasis)

### 6.1 How long Ori keeps moving

The TAS inputs from OriDETAS (All Cells route) are exact frame counts. A **chain** is a run of inputs with left or right held and no neutral gap of 6 frames or more. The TAS is optimal play: it shows how long the **geometry allows** uninterrupted motion, not how long a new player keeps it up.

| Stretch | Chains (s) | Direction reversals | Jumps |
|---|---|---|---|
| Spawn → Sein (after the 13.6 s wake-up) | **36.6** (one unbroken chain; the ~350 u includes the energy-cell pickup) | 3 in 80 s | 49 (one per 0.75 s) |
| Sein → Wall Jump (keystones, 7 enemies, mushroom drop) | 14.4, 3.4, **26.2**, 13.8, **20.1**, 4.3, **18.7** | 21 | 137 (one per 0.6 s of movement) |
| Wall Jump → spirit well (wall-jump climb out, log, frog, slime, flower jump) | **20.7**, **39.0**, 4.4, 6.4 | 13 | 158 (one per 0.45 s, mostly wall jumps) |

- **Chain length (measured):** the median of the chains ≥ 10 s is **≈ 20 s**. The maximum on these stretches is **39 s**. At the TAS's average of ~9.6 u/s, 20 s is ≈ 190 u ≈ **4.5 screen widths ≈ 170 OH**.
- **Speed retention (derived):** spawn → Sein covers ≈ 351 u horizontally in ≈ 36.6 s, an average of **≈ 9.6 u/s = 82% of max run speed**. That includes descending into the corridor, the pond and the energy cell. So the first 8 screens need almost no braking. The terrain sends Ori *down and along*, never into a wall.
- **Obstacle cadence (derived):** on running stretches the TAS jumps every **0.6–0.75 s ≈ 7–9 u ≈ 6–8 OH**. Some of that is speed tech (Ori's second and third consecutive jumps get higher), so read it as an upper bound on feature density. It fits the art: bumps, logs, roots and gaps about every 1–2 of Ori's jump lengths.
- **Human pace (estimated):** the experienced walkthrough's 15 min over ≈ 1,400+ u of critical path is ≈ 1.5 u/s averaged, including pickups, fights and side trips. So on first play the flow chains come in **bursts of 5–20 s between stops**. The stops happen at keystones, shrines, the map and fights, and almost never because the terrain dead-ends.

### 6.2 How terrain shape feeds momentum

These are the engine rules that make flow possible (measured, from decompiled `PlatformingMovement.cs` and `SeinDashAttack.cs`):

1. **Every surface is either ground or wall; there is no dead band.** Any surface up to 60° is ground and any surface over 60° is a wall (wall contact accepts normals within 30° of horizontal).
   - A rounded root, a curved trunk or a boulder always gives either footing or a wall-jump.
   - There is no "slide off, can't cling" zone, so an organic shape never causes a dead-stop.
2. **Speed is applied along the ground tangent.** On the ground, the position advances by `GroundBinormal × LocalSpeedX`, and vertical speed is zeroed.
   - Running up a 30° slope costs no horizontal input effort and loses no speed.
   - Slopes change your *height* without changing your *rhythm*.
3. **Ground-snapping over crests.** Each tick, Ori is swept back onto the ground by `0.04 + |vx|·dt` along the normal. So at full speed on a convex hump, Ori stays glued to the surface instead of launching off it.
   - Leaving the ground is always a player decision (a jump) or the end of the surface.
   - The raycast grace below the capsule is radius + 0.5 u.
4. **The capsule collider plus the ground normal** means the dash and the sprite both rotate to the ground angle (`SpriteRotation → GroundAngle`). Motion reads as following the curve.
5. **Instant stop, fast start.** Ori stops the moment the stick is released (Mahler, [Steam](https://steamcommunity.com/app/387290/discussions/0/2333276539607716284/?ctp=4)) and reaches full speed in 0.19 s.
   - Flow in Ori does **not** come from inertia. It comes from geometry that never asks you to stop.
   - The designers keep the momentum; the player never has to manage it.
6. **Combat doesn't break movement.** Sein auto-targets, so Ori's movement animation is never interrupted by attacking. A programmer put it as Ori running from everything while Sein does the attacking ([Reddit AMA](https://www.reddit.com/r/xboxone/comments/2yxclb/hi_everyone_its_moon_studios_creators_of_ori_and/)). Enemies along a flow route are things you shoot on the move, not stop-and-fight rooms.

### 6.3 Shape grammar of a flow chain (from the map and the TAS labels)

The spawn → Sein chain is a **descending staircase of long, gently sloped shelves**:
- the meadow floor, near level at y ≈ −216 to −219 over 130 u;
- then down about 35 u through the dead-tree log into the corridor at y ≈ −255;
- then a 290 u corridor that undulates ±5 u, with the pond as a dip;
- then out to Sein.

The net descent is ~43 u (37 OH) over ~350 u: an average grade of **≈ 7°**.

**Descending grades are the flow backbone.** Climbs are packed into short vertical cores instead: the Wall Jump pit, Spirit Caverns and the Spider Sac, each 1.6–3.6 screens tall. The Wall Jump → well chain (39 s) alternates wall-runs with log runs and a "flower jump" and "mushroom drop" (a bouncy mushroom in a drop). **Vertical punctuation** (bounce, drop, wall-run) sits between **horizontal runs**.

### 6.4 Calm versus intense

- **Calm (estimated ≈ 75–80% of first-pass time):** meadow, corridor, pond, hub, the Spirit Tree approach.
- **Intense (≈ 20–25%):** the 3-Fronkey ambush after Sein, the Left Glades saws and boulder push, the Spirit Caverns laser flowers and thorn pit, and the spider pegs.
- There is **no chase or escape in the Glades.** The first escape is the Ginso Tree, which comes after Moon Grotto.
- **Hazard types:** thorns (static), rotating saws and spikes, laser and flower shooters, falling "consumed" slimes, and water that is harmful until cleaned (later).

## 7. Encounters

- **Enemy types in the Glades** ([wiki enemy table](https://oriandtheblindforest.fandom.com/wiki/Enemies_of_Nibel)): Hopper ("Fronkey"), Crawler (spits globs), Quilled Crawler (drips 3 droplets), Consumed Crawler (drops from ceilings, Spirit Caverns), and Rammer (charges; the first enemy, in the tunnel). Five types in total. Hollow Grove adds Spitters, Arachne, Snappers, Crawler Colonies and Darkwings.
- **Density:**
  - The TAS kills or damages **3 enemies at the Sein ambush and 7 more between Sein and Wall Jump** (measured, section labels).
  - Estimated **≈ 20 enemies over ≈ 40 screens ≈ 0.5 per screen**, clustered 1–3 at a time on the path.
- **Placement patterns:**
  - Singles on shelf ends, where you land into them.
  - Crawlers placed so their arcing shots cover a jump.
  - Consumed Crawlers above narrow vertical passages.
  - One **arena-lite**: after Sein, 3 Fronkeys attack in the tunnel (~7.7 s of TAS combat). This is the Spirit Flame test, and it is not locked.
- **No locked arenas, mini-bosses or bosses in the Glades.** The first mini-boss is in Gumo's Hideout (Moon Grotto).
- **Roaming vs arena:** about 100% roaming. Enemies are obstacles on flow routes, and Sein's auto-aim lets you fight on the move.

## 8. Secrets and rewards

- **Density (measured, `areas.ori`):** **29 pickups in the Glades zone** over ≈ 40 screens, **≈ 0.7 per screen of area**. The nearest-neighbour spacing between pickups has a median of **26 u (≈ 0.6 screen width, ≈ 23 OH)**, a minimum of 7 u and a maximum of 167 u.
- **Types:** 9 spirit-light caches (15, 100 or 200 XP), 8 keystones (all on or next to the critical path; they are how the path is paced), 4 energy cells, 4 ability cells, 1 health cell, the map fragment, the map stone and 1 skill tree. The wiki counts **7 secrets**: walls you can walk through behind roots or tree trunks.
- **Return rate:** by the randomizer's difficulty tag, 19 of 29 (66%) need no skill, and **10 of 29 (34%) need a later skill**: Charge Jump, Bash, Grenade, clean Water, Stomp, Double Jump, or Wind + Glide. So one in three Glades rewards is a visible promise for later.
  - Examples: the item up and to the right of spawn (needs Kuro's Feather, or Light Burst in DE), the Grenade tree, the deep pool items and the Laser area.
- **Signposting:**
  - Glowing orbs against dark silhouettes. Keystones glow blue.
  - The **4-energy doors are visible gates on the path** (Death Gauntlet, laser, spider sac).
  - The spawn-room item is visible from where you wake up.
  - Secret walls are marked by root and trunk gaps in the foreground art ([wiki item list](https://oriandtheblindforest.fandom.com/wiki/Sunken_Glades)).

## 9. Area identity and terrain vocabulary (emphasis)

### 9.1 Palette, lighting, depth

- **Palette (measured from the map colours and 20 Steam 1080p shots):**
  - The lower Glades are **blue and teal** (hues 180–210° dominate 11 of 20 shipped screenshots, including non-Glades ones).
  - The Spirit Caverns and Left Glades are **amber and ochre**.
  - The Spirit Tree is **gold and orange** backlight.
  - The Spider Sac is **green**. Hollow Grove is **teal and green**.
  - One warm-cool pair per sub-area, with warm light shafts cutting cool fog.
- **Value structure (measured on the Steam gameplay shots):** median luminance is **0.04–0.19** (0–1 scale) and the 99.9th percentile is **0.86–1.0**. The scene is overwhelmingly dark-to-mid. The only near-white elements are Ori, Sein, pickups and light sources. Ori was designed as a pure-white silhouette ([GDC 2015 notes](https://zyzyz.github.io/en/2018/01/GDC2015-Animating-Ori/)). Early builds were only black-and-white silhouettes ([Xbox Wire](https://news.xbox.com/en-us/2015/03/17/games-the-artwork-of-ori-and-the-blind-forest/)).
- **Depth layers:**
  - The game uses **2D planes placed in real 3D space under a perspective camera, not scrolling parallax layers**. The team said it doesn't use orthographic cameras or a 2D parallax approach ([Polycount 2014](https://polycount.com/discussion/135747/ori-and-the-blind-forest/p3), [Polycount 2015 p3](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p3)).
  - Depth is sold by **custom coloured fog (transparency and value) and depth of field on a non-linear curve**. Draw order is simply depth sorting. Atlased meshes skip transparent pixels to control overdraw ([Polycount p2](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p2)).
  - There is **no fixed layer count**. Typical shots read as ≥ 5 bands: near-black blurred foreground silhouettes; the playfield; mid-ground set dressing; 1–3 fogged tree lines; and a light or sky plate (estimated, from the Steam shots).
  - One scene, `sunkenGladesBackgroundB`, is named as a background-only scene. Backgrounds are streamed like gameplay chunks.
- **Foreground:** dark, blurred occluders (roots, leaves, trunks) frame most shots and hide secret passages. Foliage sways via a GPU shader, not bones ([Polycount p3](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p3)).
- **Music and sound:** the Glades have their own theme; audio is covered in the GDC 2016 audio talk ([GDC Vault](https://www.gdcvault.com/play/1022925/-Ori-and-the-Blind)). Not analysed in detail here.
- **Environmental storytelling:**
  - The thorns at spawn (the forest is sick).
  - The Spirit Tree dominates the area. The prologue walk and collapse are in the Glades, and the game's scene names `sunkenGladesRunning/Runaway` suggest the playable wake-up is in the same space.
  - Ancestral Trees are shrines with lore voices.

### 9.2 Terrain shape vocabulary

- **Organic, not rectilinear.** A Microsoft producer said of the game: "hardly any platforms in the game are flat" ([Eurogamer](https://www.eurogamer.net/articles/2014-06-28-ori-and-the-blind-forest-looks-great-but-plays-even-better)). The numbers bear it out.
- **Floor-angle distribution (measured).** I took the map's open/solid mask for the Glades (x −350…100), smoothed it at 8–16 px (≈ 1–2 u), and histogrammed the angles of upward-facing boundaries (floors), weighted by length.

| Floor angle | 0–5° | 5–15° | 15–30° | 30–45° | 45–60° | > 60° (walls) |
|---|---|---|---|---|---|---|
| Share of floor length | **23–29%** | **27–28%** | **16–23%** | 6.5% | 6–6.5% | 13–15% |

  - Only about a quarter of walkable floor is flat. **About half is a gentle-to-moderate slope (5–30°).** Roughly 13% is steep but still walkable (30–60°).
  - Caveat: the world map is a hand-painted simplification of the level, so this measures the level's *silhouette*, not per-collider angles. It is still the best available whole-area measurement.
- **The shape primitives:**
  - Mossy mounds (convex, 5–20°).
  - Fallen logs, used as bridges and ramps, some tilted 10–30°.
  - Root walls: near-vertical, wall-jumpable, often curved.
  - Bulbous caverns and overhangs, which give ceilings and hide pickups.
  - Hanging and swinging platforms (the pond).
  - Bouncy mushroom caps.
  - Pushable boulders.
  - Thorn beds lining the bottoms of pits.
- **Corners are rounded.** In the map crops almost no straight segment is longer than ~10 u. Tunnel necks are curved S-bends, not right angles.
- **How collision relates to the painted art:**
  1. Designers block out every room with a **custom polygon tool**, as black shapes made with a modified plane tool.
     - The first blockouts were conservative 90° shapes. The team says it took time to break the tile-based mindset ([Polycount p2](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p2)).
     - In the sequel era Mahler describes drawing the polygons that define what Ori runs on, then getting a "design approved" stamp before any art ([Game Developer 2020](https://www.gamedeveloper.com/design/q-a-designing-the-gorgeous-metroidvania-i-ori-and-the-will-of-the-wisps-i-)).
  2. **Colliders are auto-generated from the painted ground textures.** Artists lay out ground art, press "refresh colliders" and run Ori over it. Some scenes have no blockout at all; their collision comes from art alone ([Polycount p2](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p2)).
     - So **the visible edge of the painted ground is the collision edge**, to within the tool's tolerance.
     - Early on colliders were traced by hand and it was slow.
  3. **Ground art is many painted pieces fitted edge to edge, not one tiled texture.** It is reused like a kit across rooms, but each room is unique as a composition ([Polycount p1](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump), [p2](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p2)). Moon cites over 7,000 hand-painted graphics ([Xbox Wire](https://news.xbox.com/en-us/2015/03/17/games-the-artwork-of-ori-and-the-blind-forest/)).
  4. Everything is **PNG painted in Photoshop and placed as planes**. Double-click to place, then refresh colliders to test ([Polycount p2](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p2)).

## 10. Camera and transitions

- **Camera:**
  - A **perspective 3D camera** follows a chase target. Zoom is a camera z-offset. The randomizer's "chaos zoom" adds −20 to +100 u to `OffsetController.AdditiveDefaultOffset.z`, which implies the default distance is over 20 u.
  - The horizontal chase speed is scaled during a dash (`ChaseTarget.CameraSpeedMultiplier.x` ramps 0→1 over the dash).
  - The zoom changes by place: set pieces like the Spirit Tree pull back. Some players said the DE camera felt more zoomed out than the original ([Steam](https://steamcommunity.com/app/387290/discussions/0/364040166673751617/)).
- **Transitions:** **seamless.** There are no loading screens, scroll locks or fades during play.
  - Early builds had 8-bit-style scroll locks with fades to black. Moon wrote multi-scene editing in 2012 and moved to Unity 5 streaming for 60 fps with no loading ([MCV/Develop](https://mcvuk.com/development-news/unity-focus-making-ori-and-the-blind-forest/)).
  - Mahler said loading takes the immersion away ([Eurogamer](https://www.eurogamer.net/articles/2014-06-28-ori-and-the-blind-forest-looks-great-but-plays-even-better)).
  - Scene chunks (≈ 2–3 screens each) stream in around Ori. Transition time is **0 ms**.
  - The only cuts are story cutscenes: Sein, the Spirit Tree, and the ability trees, which are short in-engine sequences.
- **World assembly:** Mahler's most valued tool took screenshots of each scene so whole chunks of the world map could be dragged around. He called it the key tool for designing a metroidvania ([Polycount p2](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p2)). Korol described levels as LEGO blocks rearranged on a big world map ([MCV](https://mcvuk.com/development-news/unity-focus-making-ori-and-the-blind-forest/)).

## 11. Teaching

The scene names show that **each streamed chunk introduces one thing**: `sunkenGladesEnemyIntroductionC`, `…ObstaclesIntroductionStreamlined`, `…SpiritCavernsPushBlockIntroduction`, `upperGladesSpiderIntroduction`, `…SwarmIntroduction`, `moonGrottoLaserIntroduction`, `…StomperIntroduction` and `moonGrottoDoubleJumpIntroductionArt` (measured, `SceneIDs.cs` and `SceneToZone`). Moon also wanted every area to carry its own gameplay hook ([Game Informer](https://gameinformer.com/games/ori_and_the_blind_forest/b/xboxone/archive/2014/12/22/a-multinational-team-bands-together-to-create-ori-and-the-blind-forest.aspx)).

| Mechanic | Introduce | Test | Twist | Combine |
|---|---|---|---|---|
| Run and jump | Wake meadow: long gentle floor, low logs | Corridor undulations and the pond jumps | Hanging pond platforms | With the Rammer in the tunnel |
| Spirit Flame (Sein) | Pickup at (−162, −258) with a dialogue | **3 Fronkeys at once**, in the next ~5 s | Crawlers whose arcs cover jumps | Shooting on the move along the keystone backtrack |
| Energy + Soul Link | First energy cell ≈ 220 u from spawn; save prompt | Energy doors shown as a cost of 4 | Save vs. spend energy (the Soul Link trade-off, [Eurogamer](https://www.eurogamer.net/articles/2014-06-28-ori-and-the-blind-forest-looks-great-but-plays-even-better)) | — |
| Keystones | 2 keys → first door, both near it | 2 keys → Spirit Caverns door | 4 keys → Spirit Tree door, spread through the laser caverns and thorn pits | — |
| **Wall Jump** | **Fall into a pit (S7→S8) that you can only leave with the skill it holds**, with no enemies | Immediate climb out: pit, then an elbow turn, then a wall-run | Brambles on the walls ("JUMP OVER BRAMBLE"); thorn pit with keystone 3-3 | Spirit Caverns: wall jumps + laser flowers + keystones |
| Charge Flame | Tree right below the Spirit Tree | Blue walls and pillars block the exits | Hub attic shortcut | Opens the Spider Sac → Hollow Grove |
| Map | Tutorial right after Sein | Map fragment in Left Glades | Map stone in the hub | — |

- **The "pit with the key inside" is the Glades' signature teaching beat.** The one-way drop *is* the lesson. The climb out *is* the test.
- The first 5 minutes introduce, in order: movement, a vista, a save point, water, the attack, a combat test, the map and keys. That is roughly one new thing every 30–60 s (estimated).
- I found no developer source for introduce/test/twist beyond the scene names and one designer's rule that deaths must always read clearly ([Reddit AMA](https://www.reddit.com/r/xboxone/comments/2yxclb/hi_everyone_its_moon_studios_creators_of_ori_and/)).

## 12. Why it works

1. **The camera makes the world big, and the art makes it deep.** Ori is about 1/21 of the screen's height, so every space is measured in dozens of body lengths. The median Glades segment is **96 × 43 Ori-heights**. When the body is tiny, even a 1.2-screen-tall corridor reads as a tunnel through a huge forest. Perspective planes with fog and depth of field put the playfield inside a volume, not in front of a backdrop.
2. **Space is carved, not boxed.** Every segment's box is only 42–64% open. Floors, ceilings and walls are all curves, so the edges of a space are shaped like the things in it (roots, trunks, logs). The eye never finds a rectangle, so the world never reads as "a room".
3. **The collision is the painting.** Colliders are generated from the painted ground, so what you see is exactly what you stand on. There are no invisible ledges and no floating art. The shapes can therefore be as organic as the painters want without costing readability. The level designer's polygon blockout and the artist's surface converge on the same edge.
4. **The physics turns curves into rhythm, not friction.**
   - Everything up to 60° is runnable at full speed along the tangent. Everything steeper is wall-jumpable. Ori is ground-snapped over crests.
   - So an organic surface never costs speed or causes a dead-stop. Slopes only change Ori's height, and the player hears it as rhythm.
   - The movement can stop instantly and start in 0.19 s. Flow is designed into the terrain, not left to inertia the player has to manage.
5. **Descend to flow, climb in cores.** Long runs are gentle downhill staircases (the opening chain averages ~7° down over ~350 u). Climbing is concentrated in 1.6–3.6-screen vertical cores. This is the cheapest way to get long uninterrupted chains (20–40 s) without a speed-boost mechanic.
6. **Compress, then release.**
   - The Spirit Tree dome (91% open) comes right after the tightest, most gated space: the Spirit Caverns, with 8 keystones and laser flowers.
   - Hollow Grove's Kuro tree repeats the pattern.
   - The spawn is a vista too: the first screen promises the scale.
7. **Every retrace is a new level.** ~40% of the critical path is backtracking, but each backtrack follows a new tool (Spirit Flame, Wall Jump). One third of the pickups are visible promises for later tools. Space is reused without feeling repeated.
8. **Light is the only white.** With scene median luminance of 0.04–0.19 and only Ori, Sein and rewards near white, the eye always finds the hero and the goals, however busy the painting. That is what lets the art be so dense while the play stays readable.
9. **Combat never breaks the run.** Auto-targeting Sein keeps Ori's movement uninterrupted, so enemies punctuate flow chains instead of ending them.
10. **Iteration order.** Controls were tuned for 12–18 months before level layouts were finalised ([Steam](https://steamcommunity.com/app/387290/discussions/0/2333276539607716284/?ctp=4), [Game Informer](https://gameinformer.com/games/ori_and_the_blind_forest/b/xboxone/archive/2014/12/22/a-multinational-team-bands-together-to-create-ori-and-the-blind-forest.aspx)). Rooms got 1–3 days of blockout and 3–5 days of set dressing ([ResetEra](https://www.resetera.com/posts/9970544/)). The terrain was shaped around a finished controller.

**What the numbers miss:**
- Motion everywhere: particles, swaying foliage and light shafts.
- The prologue's emotional charge, which makes the Spirit Tree a destination.
- Gareth Coker's score.
- Animation. Most animations run at 30 fps, but run and walk transitions run at 120 ([Polycount p3](https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump/p3)).

## 13. What *Tallage* should steal, adapt or avoid

All targets are in *Tallage* units: player 80 px = 1 PH, tile 64 px = 0.8 PH, and a screen of 1920 × 1080 = 13.5 PH tall at the current zoom.

### Steal

1. **Camera scale.** Show more body heights per screen. Ori shows ≈ 21 OH (estimated). *Tallage* shows 13.5.
   - Target: **17–19 PH per screen height**, which is a camera zoom of **≈ 0.72–0.8** (a world view of about 2,400–2,700 × 1,360–1,520 px), with the glowing silhouette hero kept readable.
   - Zooming out alone would make today's 40 × 17-tile rooms fit on one screen and feel *smaller*. It only works together with the bigger segments in item 2.
2. **Segment sizes: grow the spaces, not just the count.**
   - Median camera zone between chokepoints: **≥ 96 × 43 PH ≈ 120 × 54 tiles** (Ori median). Current *Tallage* median: 40 × 17.
   - Mix: **≈ 40% horizontal** (flow runs), **≈ 25–30% vertical cores** of 60–80 PH tall (≈ 75–100 tiles, like the Spirit Caverns' 76 OH), **≈ 30% mixed**, and **1 set piece per area** that is ≥ 90% open.
   - **At least one long corridor per area of ≥ 250 PH (≈ 310 tiles).**
   - Box fill: 45–65% open, not rectangles with a floor.
3. **Flow chains.** On the critical path the geometry must allow **uninterrupted movement chains of 15–40 s (median ≈ 20 s)** with no forced stop: no door, no dead end, no required pause.
   - At *Tallage*'s run speed (9 tiles/s = 7.2 PH/s), 20 s is **≈ 180 tiles ≈ 145 PH**.
   - Put **an obstacle, bump or gap every 6–8 PH (≈ 8–10 tiles)** along those chains.
   - Build them as **descending staircases averaging 5–10° down**. Put climbs in separate vertical cores.
   - Measure it: add a "flow chain" metric to `npm run feel:report` or the bot. Report the longest input-held stretch without a neutral gap of ≥ 6 frames per room chain, with **median ≥ 15 s** as a gate.
4. **Terrain vocabulary: we need slopes and curves.** Target floor-angle mix per area: **≈ 25% flat, ≈ 30% at 5–15°, ≈ 20% at 15–30°, ≈ 10% at 30–60°, ≈ 15% walls.** This needs physics changes to our integer AABB solver:
   - **Slope tiles** at 1:4 (14°), 1:2 (26.6°) and 1:1 (45°), with optional 2:1 (63°) treated as wall. Build **curves by chaining these** (a 1:4 → 1:2 → 1:1 quarter-curve) and half-height or offset variants for mounds.
   - **Ori's rules, adapted:**
     - Horizontal speed is **preserved** along the slope, with no uphill slowdown.
     - **Ground-snap** downhill by up to `|vx|·dt + 2 px` per frame, so crests don't launch the player.
     - Walkable up to 45° (we have no 60° tile). Anything steeper is a **clingable wall**, with no dead band.
     - Keep corner correction working on slope tops.
   - **Collision equals art edge.** The painted or auto-tiled terrain edge must sit within **≤ 8 px (0.1 PH)** of the collider everywhere. Generate the art edge from the collision (LDtk IntGrid slope values plus auto-layer rules that paint rounded edge pieces), not the other way round.
   - **Rounded corners.** No straight run of wall or ceiling longer than **~10 PH (≈ 12 tiles)** without a bump, lip or change of angle.
   - Deterministic sim: slopes as integer rise/run lookup per tile keep the sim pure and replayable.
5. **Depth layers.**
   - At least **5 bands**: a dark blurred foreground occluder, the playfield, a mid set-dress layer, 1–3 fogged background planes, and a light or sky plate.
   - Fog should push colour toward the area's fog colour by depth.
   - Target a scene **median luminance of 0.05–0.2**, with only the hero, sources and rewards above 0.85.
6. **Compress then release.** Every area gets one reveal space (≥ 90% open, ≥ 2 screens) placed straight after its tightest gated segment.
7. **The pit with the key inside.** Teach each traversal ability by dropping the player into a safe space they can only leave with it. Test it on the way out, within 30 s.
8. **Landmarks.** One new identifiable landmark every **≈ 120 PH of path (≈ 150 tiles, ≈ 12–17 s of running)**. Put one mega-landmark per area (the Spirit Tree) visible or referenced from the start. Colour-code sub-areas.
9. **Pickups.** About **0.7 per screen of area**, with a median spacing of **≈ 23 PH (≈ 29 tiles)**. About **one third** should be visible but locked behind a later ability.

### Adapt

- **Soul Link → Corners.** Ori puts a fixed well about 2.3 screen widths from spawn, then leaves a gap of about 30 screen widths to the next well, bridged by player saves. *Tallage* uses fixed Corners, so place **one within 2–3 screens of an area entrance, then one every 3–5 min of first-play time (≤ 8 screen widths of path)**, and one right next to every boss door.
- **Keystone pacing (2 → 2 → 4)** works as a way to spread short collect-quests along the path. Adapt it as escalating "collect N hums to open" gates. Keep the first N ≤ 2 and within 1 screen of the door.
- **Retracing ~40% of the path** is fine only if each retrace comes with a new verb, per Mahler's rule. Audit every backtrack in the world design for that.

### Avoid

- **Sterile rectangular rooms joined by doors.** Ori spent years removing scroll locks and fades. *Tallage* rooms of 40 × 17 tiles, joined by transitions, are the opposite of Ori's seamless 2–3-screen chunks. If rooms must remain in the sim, make the transitions **seamless (no fade, < 1 frame hitch)** and make each camera zone span several rooms.
- **An early flow break for keys.** The Glades send you ~300 u back east for keystone 1 right after Sein. That is the weakest stretch of the opening: the TAS's Sein → Wall Jump segment has 21 direction reversals, against 3 in the spawn → Sein segment. Put keys *ahead of* the door on the path.
- **Energy-gated saves.** Moon itself dropped them.
- **A 1:1 copy of Ori's zoom.** A hero at 1/21 of screen height only reads if it is the brightest object on screen. If *Tallage*'s hero art can't hold that contrast, stop at about 17 PH.

## 14. Sources

**Primary data (measured):**
- Randomizer logic, `areas.ori` (pickup coordinates and types, area anchors, connections): https://github.com/sparkle-preference/ori_rando_server/blob/master/seedbuilder/areas.ori
- Map calibration `getMapCrs()` (teleporter game coordinates ↔ map px, 20480 × 14592 map): https://github.com/sparkle-preference/ori_rando_server/blob/master/map/src/shared_map.js
- Map tiles (zoom 7), stitched for the region x −360…460, y −330…−40: https://ori-tracker.firebaseapp.com/images/ori-map/{z}/{x}/{y}.png (URL in ori_rando_server `map/src/PlandoBuilder.js`)
- Randomizer decompiled classes: `PlatformingMovement.cs` (ground 60° and wall 30° thresholds, tangent motion, ground snap), `SeinJump.cs`, `SeinDashAttack.cs`, `RandomizerChaosZoom.cs` (camera z-offset), `Randomizer.cs` (spawn at 189, −215), `RandomizerWorldMapIconManager.cs` (Sein at −162.4, −257.7), `RandomizerStatsManager.cs` (scene→zone), `GameController.cs` (start scene): https://github.com/tksstepan/OriDERandomizer
- LiveSplit.OriDE: Ori hitbox 0.68 × 1.15, default speeds `SetSpeed(11.6667f, 60, 26, 6, 56.568, 40, 6, 38, 100, 3, 8, 50, 100)` (`OriManager.cs`); scene list (`Manager/SceneIDs.cs`): https://github.com/ShootMe/LiveSplit.OriDE
- OriDETAS frame-exact inputs, `All Cells TAS/TAS/01 Start to Sein.tas`, `02 Sein to Wall Jump.tas`, `03 Wall Jump to BRB.tas`: https://github.com/ShootMe/OriDETAS
- Steam store screenshots (1920×1080), used for Ori's on-screen size and luminance/hue stats: https://store.steampowered.com/app/387290/
- Ori wiki (Fandom) pages, via the MediaWiki API: [Sunken Glades](https://oriandtheblindforest.fandom.com/wiki/Sunken_Glades), [Hollow Grove](https://oriandtheblindforest.fandom.com/wiki/Hollow_Grove), [Moon Grotto](https://oriandtheblindforest.fandom.com/wiki/Moon_Grotto), [Spirit Well](https://oriandtheblindforest.fandom.com/wiki/Spirit_Well), [Soul Link](https://oriandtheblindforest.fandom.com/wiki/Soul_Link), [Enemies of Nibel](https://oriandtheblindforest.fandom.com/wiki/Enemies_of_Nibel), [Swallow's Nest](https://oriandtheblindforest.fandom.com/wiki/Swallow%27s_Nest)
- HowLongToBeat: https://howlongtobeat.com/game/19265 and https://howlongtobeat.com/game/36755
- Experienced 100% walkthrough with timestamps: https://steamcommunity.com/sharedfiles/filedetails/?id=2801279330
- speedrun.com leaderboards (Any% Unrestricted 5:42, All Skills No OOB/TA 26:28): https://www.speedrun.com/ori_de

**Developer statements:**
- Polycount artdump threads (Moon/Airborn artists and Mahler; read via Wayback; the live pages return 403): https://polycount.com/discussion/150335/ori-and-the-blind-forest-artdump (p1–p3), https://polycount.com/discussion/135747/ori-and-the-blind-forest/p3
- MCV/Develop, "Unity Focus: Making Ori and the Blind Forest" (Korol: streaming, LEGO-block levels): https://mcvuk.com/development-news/unity-focus-making-ori-and-the-blind-forest/
- Eurogamer preview, 2014 (flat platforms quote, no loading, Soul Link trade-off): https://www.eurogamer.net/articles/2014-06-28-ori-and-the-blind-forest-looks-great-but-plays-even-better
- Game Informer preview, Dec 2014 (controls first, one hook per area): https://gameinformer.com/games/ori_and_the_blind_forest/b/xboxone/archive/2014/12/22/a-multinational-team-bands-together-to-create-ori-and-the-blind-forest.aspx
- Game Developer postmortem (greybox first): https://www.gamedeveloper.com/audio/postmortem-moon-studios-heartfelt-i-ori-and-the-blind-forest-i-
- Game Developer Q&A 2020 (blockout polygons, "design approved"): https://www.gamedeveloper.com/design/q-a-designing-the-gorgeous-metroidvania-i-ori-and-the-will-of-the-wisps-i-
- Xbox Wire, "The Artwork of Ori" (Ori small on screen, 7,000+ graphics): https://news.xbox.com/en-us/2015/03/17/games-the-artwork-of-ori-and-the-blind-forest/
- GDC 2015, James Benson, "Animation Bootcamp: The Animation Process of Ori" (session page and third-party notes): https://gdcvault.com/play/1021791/Animation-Bootcamp-The-Animation-Process, https://zyzyz.github.io/en/2018/01/GDC2015-Animating-Ori/
- GDC 2016 audio talk: https://www.gdcvault.com/play/1022925/-Ori-and-the-Blind
- Moon Studios Reddit AMA, 2015: https://www.reddit.com/r/xboxone/comments/2yxclb/hi_everyone_its_moon_studios_creators_of_ori_and/
- Mahler on Steam (identity not independently verified): https://steamcommunity.com/app/387290/discussions/0/2333276539607716284/?ctp=4
- Mahler on ResetEra (room size and time, backtracking, Hollow Knight comparison): https://www.resetera.com/posts/9970544/, https://www.resetera.com/posts/10228077/, https://www.resetera.com/posts/10227128/
- orithegame.com 8th-anniversary Q&A (flow, prologue took 8 months): https://www.orithegame.com/qa-with-thomas-mahler-celebrating-8-years-of-ori-the-game/
- VideoGamer on Soul Links being dropped: https://www.videogamer.com/news/soul-links-in-ori-and-the-will-of-the-wisps-didnt-make-sense-says-developer/
- Steam thread on the DE camera zoom: https://steamcommunity.com/app/387290/discussions/0/364040166673751617/

**Tallage comparison (measured in this repo):** `content/gym/*.json` room sizes; `docs/design/movement-spec.md` §3.4 (run 9 tiles/s, jump 3.45 body heights).
