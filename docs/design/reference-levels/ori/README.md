# Ori and the Blind Forest DE: the Sunken Glades, mapped from the game files (2026-10-30)

For `../BRIEF.md`. Data: `area.json` (our px, origin at the area's top-left, y down). How it was read, what is exact and
the five findings that matter most for our first area: `EXTRACTED.md`. Pictures (gitignored):
`shots/reference-levels/ori/map.png` (1 px = 8 of our px; `map-west|middle|east.png` are the same image in thirds) and
`terrain-native.png` (the collider terrain, 5 px per unit). Look references (art, outside the repo):
`~/code/opusvania-refs/ori/`.

**Area.** The Sunken Glades and the Spirit Caverns: from where control begins (game units 189, −219) through Sein, the
first Spirit Well, Fil's Wall Jump tree and the Spirit Caverns' three keystone gates to the Spirit Tree and the way east
to the Hollow Grove. In the game it is 17 streaming scenes (`sunkenGlades*`, `spiritTreeRefined`,
`upperGladesBelowSpiritTree`, `westGladesOverworldForestA`) plus 5 art-only scenes that load with them. World box in
game units: x −344..295, y −314..−64.5 (y up). The prologue (Swallow's Nest) is a separate space and is left out.

## Sources and confidence

Read from the Windows depot of Ori DE (Unity 5.3.2f1) with UnityPy: `tools/reference/mined/ori/extract.py`.

| what | source | confidence |
|---|---|---|
| rooms = the game's streaming scenes, their bounds | each scene's `SceneRoot.MetaData` (`SceneMetaData.SceneBoundaries`) | exact |
| terrain: 272 solid polygons, 11 one-way platforms, 8 water volumes | the collider strips (`CageStructureToolCollider` meshes, layer `solids`), filled by their winding (rock on the right of the strip); `GoThroughPlatform` and physics logs; `WaterZone` bounds | edges exact; the fill is ±0.2 u (a raster) |
| hazards (54) and their damage | layer `killCharacter` colliders + `DamageDealer` (thorns 4 or 8, lasers 10000), `LaserBeam`, `WaterZone.Damage` (4 or 20) | exact |
| 48 enemies: position, HP, contact damage, respawn, loot | `*EnemyPlaceholder.Settings` (Health, DamageOnTouch, ...) and `ProjectileSpawner` | exact; kind names are the class names with the wiki's common name |
| 34 pickups, 2 Spirit Wells, lever, boulders, spring, 26 orb plants | `CollectablePlaceholder.Prefab`, `KeystonePickup`, `MapStone(Pickup)`, `GetAbilityPedestal`, `GetAbilityAction`, `SavePedestal`, `Lever`, `PushPullBlock`, `Spring`, orb-plant entities | exact |
| gates | `DoorWithSlots.NumberOfOrbsRequired`, `EnergyDoor.AmountOfEnergyRequired`, `ChargeFlameWall`, `StompableFloor`, thorn barriers (`shootableCreepDoor`), the Rammer's scripted wall | exact; which exit each one closes is read off the map |
| secrets | `TransparentWallB` zones (foreground art that fades when Ori enters) for 5; the randomizer's notes for 7 (torch barriers, polluted pools, a breakable wall) | exact / mined |
| scene joins | open runs ≥ 1.5 u along shared scene edges of the collider terrain | exact positions; curated (sky above the start is not an exit) |
| camera, hero, attack | `CameraController` / `CameraOffsetController` prefabs and the scenes' `DefaultCameraZoom`; the `seinCharacter` prefab; `SpiritFlame` assets | exact |
| pickup ids, what a pickup needs from later areas | the randomizer's location table (as in the earlier mined data) | mined |
| order of play, minutes | walkthroughs (unchanged) | estimate |

**Not extracted:** the order of play and the minutes; spirit light dropped by plants (loot tables on prefabs); swinging
spike-log damage (on prefabs). The Spirit Tree itself does not render from these scenes (its art is in a cutscene
scene), so the look render skips it.

**What changed from the mined version:** rooms are now the game's 17 scenes, not 22 hand-cut boxes (so counts per room
moved by definition); the terrain is the colliders, not the map's silhouette (now with 11 one-way platforms, 54 hazards,
6 secret pockets); there are 48 enemies, not 16 placed by hand, all with HP and damage; the hero is smaller than
estimated (32 x 54 px, not 47 x 70) and the chained-jump bonus does not exist in the shipped prefab; Spirit Flame reaches
12 u, not 8. "Secrets" now counts only pickups that cannot be seen from the route (12), not every pickup the randomizer
annotated (27).

## Units

- **1 game unit = 46.765 of our px.** Camera: perspective, `FieldOfView` 60 (prefab), `DefaultZoom` 20 u (prefab, and
  every Glades scene's `SceneSettingsComponent.DefaultCameraZoom`). View = 41.06 x 23.09 u; 1920 / 41.06 = 46.765. A
  few `CameraOffsetAnimationZone`s pull to 18-21 u (±10%).
- **Hero** (`seinCharacter`): capsule 0.68 x 1.15 u = **32 x 54 px** (ours 40 x 80). **Run 11.67 u/s = 546 px/s**
  (ours 576; ground accel 60 u/s², decel 30). **Jump 3 u = 140 px** (first, second and third jump all 3 u in the
  prefab), gravity 26 u/s², max fall 32 u/s. Wall jump (6, 12) u/s. Ori's jump is **2.6 body heights**, ours 3.4.
- **Attack:** Spirit Flame, 2 damage, combos of 3 shots 0.2 s apart then 0.5 s; auto-aims within 12 u (561 px).
- **Health:** 3 life cells. A hit costs ceil(damage / 4) cells: damage 1-4 = 1 cell, 5-8 = 2 cells.
- The area is 29,883 x 11,668 px (15.6 x 10.8 screens).

## The area as a player meets it

- **0:00** Ori wakes in a 6.4-screen glade (`wake`) with no enemies. The way east is a 4-energy door; above, an
  invisible ceiling and a high ledge (a large spirit-light container for later).
- **0:30** West: drop through a log into the lower band (`well`). The Spirit Well here is behind thorn plants.
- **1:30** The pools (`crossing`): one Piranha in the polluted pond (shallow water costs 1 cell a tick, the deep pools
  20 damage = death). **Energy cell 1** in the ram tunnel unlocks Soul Link.
- **3:00** The **Rammer** (20 HP, 2 cells a hit) charges; jumping it makes it break the rock into Sein's hollow.
- **4:00** **Sein: Spirit Flame.** At once 3 Hoppers (10 HP = 5 hits, 1 cell a touch, no respawn) and a hidden small
  container under fading foreground art.
- **5-10** Walking back east, the Glades fill up: 7 enemies switch on only once Ori has Spirit Flame (2 Hoppers of
  20 HP and a slug in `well`, 4 slugs in `crossing`), and so do the first 2 keystones. Burn the thorns around the
  spring, the first Spirit Well (route 30,519 px from the start), keystone, swinging logs, keystone, Spirit Gate 1.
- **10-15** The signpost hub (`signpost`): 4 Hoppers (12 HP, 1 cell), a slug, the life cell up the mushrooms. West
  (`leftglades`): 3 slugs, a thorn barrier, down the Spirit Caverns shaft to **Wall Jump** (`walljump`, no enemies),
  energy cell on the wall beside the tree.
- **15-23** Push blocks past rotating lasers for a keystone (`upperleft`); the map stone and a keystone (`mapstone`).
- **23-29** Spirit Gate 2 into the Spirit Caverns (`caverns`, 10 screens): 7 indestructible shooter plants in rows,
  4 slugs, a Hopper, a drop slug, 4 keystones, the map fragment behind a lever bridge.
- **29-33** Spirit Gate 3 opens straight into the Spirit Tree (the second Spirit Well, 84,914 px of route after the
  first), then east to the Hollow Grove.

## Measurements

| measure | value |
|---|---|
| rooms | 17 scenes; 83.8 screens of exact scene area (84.9 by bounding box); sizes 1.5-11.5, median 3.7 |
| critical-path rooms | 12 of 17, 67.8 screens |
| critical route (shortest open path through the colliders, waypoint to waypoint; ignores gravity) | **121,040 px = 63 view-widths**, ~33 min (guess): ~1.9 view-widths a minute |
| horizontal vs vertical travel | **104,146 vs 29,528 px (3.5 : 1)** |
| rooms by shape | hall 7, pocket 4, corridor 3, hub 1, shaft 1, set piece 1 |
| exits per room | 3.0 inside the area, 3.7 with the exits to other areas; max 8 (`crossing`) |
| dead ends and what each holds | `sein`: Spirit Flame + a secret · `walljump`: Wall Jump + energy cell + a secret · `upperleft`: keystone + 2 small containers · `laserpond`: ability cell · `porch`: ability cell (the Valley side) · `wake`: the start (a container on a high ledge). Every dead end pays |
| loops | 5 (E − V + C). Open on the first pass: 2 short ones round the hub (`signpost`–`attic`–`laser`, `signpost`–`laser`–`leftglades`). Gated: the polluted swim tunnel, the 4-energy gate, the one-way hole into Sein's hollow |
| enemies | **48: 41 killable + 7 shooter plants. 0.57 per screen (0.48 killable); 0.50 per screen in critical-path rooms** |
| rooms with no enemy | 3 of 17: the start glade, the Wall Jump hollow, the Spirit Tree |
| densest rooms (enemies per screen) | Sein's hollow 1.5 (the 3-Hopper set piece), the drop-slug pond 1.3, the Spirit Caverns 1.3 (13) |
| enemy kinds | Spiked slug 14 (7 HP, 1 cell), Hopper 13 (10 / 12 / 20 / 40 HP; 1-2 cells), shooter plant 7, swooping bird 5 (28-32 HP), drop slug 3, Piranha 2, acid slug 2, Rammer 1, Spitter 1 |
| toughness against Ori | Spirit Flame 2 a hit: a slug takes 4 hits, the first Hoppers 5, the hub's 6, the later ones 10-20. A touch costs 1 cell (damage 1-4) or 2 (damage 5: Rammer, the 20-HP Hoppers, drop slugs, Spitter). Ori has 3 |
| hazards | 54: thorn surfaces (4 = 1 cell, 8 = 2 cells), 6 lasers (instant death), polluted deep water (20 = death) |
| pickups | 34 = keystones 8, ability cells 5, energy cells 4, life cell 1, map stone + fragment 2, abilities 3 (Spirit Flame, Wall Jump, Charge Flame from the Hollow Grove side), spirit-light containers 11 → **0.41 per screen**. Also 26 orb plants and bulbs (spirit light, 3-5 HP) |
| secrets (not visible from the route) | **12 of 34 pickups.** Under fading foreground art (`TransparentWallB`): 5. Behind torch barriers (Light Burst): 2. Under polluted water: 2. Behind a breakable / stompable: 2. A pocket above the ceiling: 1. Distance from the route: median **644 px (0.34 view-width)**, max 2,388 px |
| saves | 2 Spirit Wells, **84,914 px of route apart (44 view-widths)**; the first at 30,519 px (~min 7). Soul Link (save anywhere for 1 energy) from ~min 2 |
| gates seen before they open | the start glade's 4-energy door (min 0, opens much later); Spirit Gate 2 (seen ~min 12, opens ~23); the laser cave's 4-energy gate; two Charge Flame walls; the polluted swim tunnel. Gates 1 and 3 open within a minute of being seen |
| longest stretch of route with no pickup, save or enemy within 6 u | **5,437 px (2.8 view-widths)**: the climb from the Wall Jump tree back up the caverns shaft. The mined estimate was 17,951 px; the real Glades are fuller |
| what the first abilities open (by scene) | start: 5 scenes / 30 screens → **+Spirit Flame: 13 / 66** → +Wall Jump: 14 / 74 (all 8 keys, the Spirit Tree). Coarse: big scenes count whole |
| first play (guess) | critical path ~33 min; 100% ~70 min over later visits (13 pickups need skills from later areas) |

## 12 facts for an AI building a first area

1. **Scale:** 1 unit = 46.8 px; the view is 41 x 23 units. Ori is 32 x 54 px and runs 546 px/s; **the jump is 140 px,
   2.6 body heights** (ours 3.4). Scale gaps from body heights, not from Ori's px.
2. **84 screens, 63 view-widths of route, ~33 minutes**, 17 scenes of 1.5-11.5 screens (median 3.7).
3. **Travel is 3.5 : 1 horizontal.** Long bands, short shafts, one 10-screen vertical set piece last (the caverns).
4. **0.57 enemies per screen, 48 in all** (3x the walkthrough estimate). Only 3 rooms are empty: the start, the
   ability tree and the Spirit Tree, the places to breathe.
5. **The first stretch is empty until the weapon arrives:** before Spirit Flame Ori meets 2 enemies (a scripted Rammer,
   a Piranha); 7 enemies and the first 2 keystones switch on the moment Sein joins.
6. **Escalation by numbers, not by kinds:** the first Hoppers have 10 HP and hit for 1; the hub's 12 HP and 1 cell; the
   optional rooms' 20-40 HP and 2 cells. Slugs (7 HP) are the filler everywhere.
7. **Hazards outnumber enemies: 54 hazard shapes** (thorns, lasers, polluted water); a laser or deep water kills
   outright, a thorn costs 1-2 of 3 cells.
8. **Every dead end pays** (6 of 6): the weapon, the skill, a keystone, ability cells.
9. **12 of 34 pickups are hidden, 0.34 view-width from the route**; the main trick (5) is foreground art that fades
   when Ori walks into it.
10. **Keys are on the route** (8 keystones, 3 gates of 2, 2, 4); the new skill is used within seconds (an energy cell
    waits on the wall beside the Wall Jump tree, 0.7 view-width of route after it).
11. **Saves:** 2 Spirit Wells 44 view-widths apart, the first ~7 minutes in; Soul Link from minute 2 is the real save.
12. **Pickups 0.41 per screen plus 26 orb plants**, so the longest empty stretch is 2.8 view-widths; the area ends at a
    landmark (the Spirit Tree, 8 screens, a save) with the exit right behind it.
