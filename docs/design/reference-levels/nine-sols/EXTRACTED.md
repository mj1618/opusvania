# Nine Sols first area: extracted from the game files (2026-10-30)

`area.json` was rebuilt from Matt's installed Mac build (Unity 2022.3.62f3, Mono scripting). It replaces the earlier
version traced from the community map. Internal reference only: nothing from the game is committed, only measured
numbers and our own drawings. The scripts are in `tools/reference/mined/nine-sols/extract.py`.

## Method
1. **Unpack.** All scenes and shared assets sit in one LZ4 bundle, `Contents/Resources/Data/data.unity3d` (2.6 GB,
   333 inner files, 28 GB unpacked). It is unpacked once into a scratch dir outside the game folder, with UnityPy in
   a venv, run with `python -I`. Scenes are `level<N>`, N = index in globalgamemanagers' BuildSettings: AFM level8,
   AFE level9, CTH level15, Central Hall level54, Pavilion level55 (`AG_S2_YiBase`).
2. **Dump.** Every GameObject with its composed world matrix, layer, components, 2D colliders in world space
   (Box, Polygon, Edge, Circle, Capsule, and CompositeCollider2D's generated paths), tilemaps, sprite renderers and the
   fields of the gameplay MonoBehaviours. Builds ship without script type trees, so they are generated from
   `Managed/*.dll` (TypeTreeGeneratorAPI). Pitfall: with the generator on, UnityPy misreads `m_Script`; read the
   script name with the generator off. Monster stats are ScriptableObjects in `resources.assets`, reached through
   `_monsterStat` (BaseHealthValue, BaseAttackValue, name tag).
3. **Classify** by layer and component. Layers: Solid 8, OneWay 9, OneWaySlope 10, WallRunEnable 23 (climbable walls),
   Trap 6. Terrain is each scene's tilemap `Room/Walls&Floor` and friends, merged into CompositeCollider2D polygons
   (outer loops and holes: fill even-odd), rasterised to 16-unit tiles. Hazards = objects with a `Trap` component
   (laser traps, `DeathTrap_Drop` tiles, crate-door crushers), merged into strips. Secrets = `HiddenPathTrigger`
   covers. Enemies = every `MonsterPoolObjectWrapper`; active ones are placed, inactive ones wake for an event.
   Chests = `Interact_TreasureBox` (Jin: 小/中/大量金 = small/medium/large), key items = `DropPickable` /
   `LootProvider`, saves = `SavePoint`, doors = `SceneConnectionPoint` (with target scene and connection id).
4. **Scale.** The SceneCamera is perspective, vertical FOV 68 deg, 240 units in front of the play plane (CameraCore at
   z -240; every camera zone also sets FOV 68). It sees 575.6 x 323.8 units, so **1 unit = 1920 / 575.6 = 3.336 of
   our px**. Independent check: the mined map scale gives 570 units per view (1% off).
5. **Hero.** `PPlayer` in `resources.assets`: collider 10 x 30 units; `CatanaStat` + `MaxRun`: run 150 u/s,
   JumpSpeed 255 u/s held for VariableJumpTime 0.133 s, Gravity 830, MaxFall 320, dash 300 u/s. Jump height
   255 x 0.133 + 255^2 / (2 x 830) = 73 units = 244 px, assuming the hold keeps full speed (Celeste-style controller,
   which these field names match); a tap gives about 131 px.
6. **Rooms and placement.** Rooms are rectangles drawn by hand on the collider renders (`colliders-*.png`), keeping
   the mined room ids (one new: `afm-cliff`; `afe-sw` folded into `afe-bottom`). The designers' own camera zones
   (`[小塊區域邊界設定]/CamBound_*`) were drawn as a guide but cover only parts of each scene, so they are not the
   rooms. Exits inside a scene are open tile borders between rects; exits between scenes and all gates come from the
   mined randomizer graph, placed at the scene's connection point. Scenes are placed as on the in-game world map:
   offsets fitted to the mined map on saves, chests and doors (old px = 3.5 x unit + b, residuals about +-50 px).
7. **Labels.** Each extracted object takes the name and hidden-how of the nearest mined thing of the same kind; mined
   things with no object (4 lore entries, NPC names, some landmarks) are kept at their mined positions, marked
   `src: mined`. To rebuild, pass the pre-extraction file: `git show d1b0713:docs/design/reference-levels/nine-sols/area.json`.

## Exact now vs still approximate
| | now | before |
|---|---|---|
| Terrain | exact tile colliders (638 solid rects, 143 one-ways, 29 climbable walls, 37 hazard strips, 19 hidden covers) | traced map art, bounding boxes filled solid |
| Scale and Yi | camera and collider from the files; run and jump from the stats | +-15% from screenshots; Yi's moves unknown |
| Enemies | all 100 with exact positions, HP and base attack; placed vs event-spawned | 47 placed from walkthrough text |
| Chests, saves, consoles, doors | exact positions | +-20 map px |
| Room split | hand-drawn on real geometry | hand-drawn on map art |
| Room graph, gates, item names | still the randomizer's (high confidence) | same |
| Scene-to-scene placement | fitted to the in-game map, +-50 px | the in-game map |
| Lore, NPC names, times | still mined / estimated | same |

**What changed in the metrics** (`npx tsx tools/reference/metrics.ts`, old -> new): rooms 39 -> 39; box screens 172.2 ->
170.5 (-1%); critical-path screens 133.3 -> 129.6; **enemies 47 -> 100** (71 placed + 29 event spawns); **enemies per
screen 0.27 -> 0.59** (0.42 placed only); mean difficulty 2.3 -> 1.9; kinds 11 -> 16; majors 15 -> 16; minors 8 -> 13;
breakables (incl. hidden covers) 2 -> 21; saves 5 -> 5; secrets 20 -> 19; hidden share 0.40 -> 0.26; things per
screen 0.29 -> 0.42; empty cells 66% -> 57%; longest empty run 9 -> 8; **solid share 1.0 -> 0.49**; **hazards 5 ->
37**; **one-ways 0 -> 143**; height 26.7 -> 24.3 screens, width 26.6 -> 25.7. Air ("filled") screens 107 -> 88.

## Five findings for a level designer building our first area
1. **Tight rooms, measured in bodies.** Yi is 33 x 100 px (0.093 of the view height; our Wing is 0.074) and the
   median floor-to-ceiling height on the critical path is **480 px = 4.8 Yi = 9 tiles** (quartiles 320 and 854).
   A room has a median of **1.65 air screens** (quartiles 1.1 and 2.4) inside boxes that are half solid (49%). The
   zone is long thin bands: corridors 850-1,650 px tall and 4,000-10,000 px long, joined by short shafts; only the
   hub (11.7 air screens) and the 10,670 px lift shaft are big. Scaled to our hero (x0.8), that is a 384 px clear
   height and rooms of about 1.3 screens of air: tighter than anything we have built.
2. **Enemies alone, at a steady beat; crowds come from events.** 71 placed enemies, **0.81 per air screen** (0.42 per
   box screen; the mined guess was 0.27), but **18 of 39 rooms have none** (the whole hub, Central Hall's upper route,
   corridors, shafts). In the busy rooms they stand alone: 32 of 46 groups are single (mean group 1.5), with a median
   **849 px (0.44 view width)** to the nearest other enemy, so the player meets one, then the next. Ranged Bolt
   Warriors are the most common placed kind (13), then Blade Troopers (11). The peaks are scripted: a locked gauntlet (2
   placed + 3 spawned) and the lift-shaft ambush (5 placed + 16 spawned in a 10-screen shaft). 14 trap robots and 4
   drones (60 HP or less, hackable) pad the count between real fights.
3. **Secrets are hidden space more than hidden items.** 19 **hidden-path covers**: foreground art that reads as
   solid wall until Yi enters, then fades. Sizes run from 165 x 175 px niches to 2,235 x 436 px tubes (median about
   770 x 375). Only 5 pickups lie under them (4 chests in vent pockets and alcoves, one guarded by a Blade Commander,
   and the way into the Mystic Nymph room); the rest are vents and tubes used as alternate routes, and 7 covers hide an
   enemy (trap robots waiting to be hacked, or the Commander). 15 of the 19 are in critical-path rooms. Items hide by framing instead:
   2 Jin chests on a pagoda roof above the camera, a corpse dropped by hacking a console, chests behind council statues
   you parry or kick and then hack.
4. **Hazards are floor strips that punish, not kill.** 37 hazard strips, 23,100 px in all (12 view widths), median
   **320 x 40 px** (6 tiles long, under a tile thick), 19 of them in critical-path rooms. They are death-trap tiles
   (AFE 180 tiles, CTH 157), laser traps (AFM 3, a dip under the first corridor), crate-door crushers (CTH 8) and spike
   pits (Central Hall's lower route, 6). Touching one sends Yi back to the last safe ground (`DangerZoneNoSafeGround`
   marks where not to respawn), so they shape platforming without a save cost. The first hazards are 3 laser traps at
   minute 1-2, in a dip under the first corridor.
5. **Every screen is furnished for movement and hitting.** Per air screen: **1.6 one-way ledges** (143, median 107 px
   = 2 tiles long: small steps, not long floors), **1.7 breakable props** (148 bottles, boxes, glass, chairs) and
   about 0.2 consoles, lifts or statues (19). 29 climbable wall strips (median 534 px tall, 2.2 jumps; the tallest
   1,388) carry most vertical travel inside rooms. So even the enemy-free rooms are not empty: there is always a ledge
   to take, a prop to break or a console to hack, which is the "density of choice" our Grove found by feel.
