# Ori and the Blind Forest DE: the Sunken Glades, mapped (2026-10-30)

For `../BRIEF.md`. Data: `area.json` (our px, origin at the area's top-left, y down). Pictures (gitignored):
`shots/reference-levels/ori/map.png` (1 px = 8 of our px; `map-west|middle|east.png` are the same image in thirds) and
`terrain-native.png` (the in-game map art, same scale, with the room boxes).

**Area.** The Sunken Glades and the Spirit Caverns: from where control begins (the waking glade, game coordinates
184, −220), past Sein, the first Spirit Well and Fil's Wall Jump tree, up through the Spirit Caverns' three keystone
gates to the Spirit Tree and the corridor east to the Hollow Grove. World box in game units: x −360..310,
y −316..−70 (y up). The prologue (Swallow's Nest, with Naru) is not in this space: the wiki says Ori can never return
there, so it is left out.

## Sources and confidence

**The game files were not on the disk when I started or when I finished.** I checked
`~/Library/Application Support/Steam/steamapps/content/app_387290/` and `/Applications/Steam.app/.../content/` at both
times. Everything below is mined or estimated. Every entry in `area.json` has a `src`.

| what | source | confidence |
|---|---|---|
| 30 pickups (cells, keystones, map stone, fragment, Wall Jump, spirit-light containers) with x,y | Ori DE randomizer logic `bf-areas.ori` (sparkle-preference/ori_rando_server) | exact to ±1 unit (the rando stores integers). Checked: 25 of 30 sit within 1 unit of open space on the map art; the other 5 are secret pockets that the map does not draw |
| what each pickup needs | the same logic file, plus the fandom wiki's Sunken Glades item list | high |
| terrain (110 solid polygons, 5 water polygons) | the in-game world map, as tiles from the rando tracker (`ori-tracker.firebaseapp.com/images/ori-map/7/x/y.png`, 8.77 map px per unit), georeferenced with the tracker's own transform (`getMapCrs`, built on the two teleporters) and checked against the pickups (best offset ≤ 1 unit) | about ±1 unit (47 px). It is the map's silhouette, not the colliders: no one-way platforms, slopes are smoothed, and secret rooms are missing. Water is the map's violet fill |
| camera / units | decompiled `Assembly-CSharp.dll` (the rando's copy): `CameraController.FieldOfView = 60`, `CameraOffsetController.DefaultZoom = 20` | these are code defaults; a scene or prefab can override them (not checked) |
| hero jump | `SeinJump.FirstJumpHeight = 3` (chained jumps `3.75`, `4.5`), code default | medium |
| run speed | TASVideos: airborne max ~11.67 u/s | medium |
| Spirit Flame | Speed Demos Archive wiki: 2 damage a hit, 0.2 s between shots, 2 shots then a 0.5 s cooldown; range 8 u (code) | high |
| health | wiki: 1 life cell = 4 internal HP; Ori starts with 3 cells and 0 energy | high |
| gates, levers, boulders, hazards, breakables, Sein's spot | rando anchors where they exist (gates ±3 u), otherwise placed by hand from wiki and walkthrough text | gates medium; the rest low |
| enemies (16) | kinds and groups from the wiki's enemy table and two walkthroughs (ludo.guide, gamerwalkthroughs.com); **positions placed by hand** | low. Count, positions, HP and damage all need the game files |
| order of play, minutes | the walkthroughs plus the logic | low (guesses) |

**Not obtained:** enemy HP and contact damage (prefab data; no wiki or speedrun page has them), the exact enemy count,
the small spirit-light orbs from plants and enemies, one-way platforms, the exact geometry of the 5 secret pockets
(they are drawn as 2-unit pockets behind a dashed "secretWall"), and a check that the camera zoom stays 20 here.
With the Windows depot, `UnityPy` on the Glades scenes (`sunkenGlades*`, `spiritCaverns*`, scene names are in the
rando's `RandomizerGUIDs.txt`) would give all of these.

## Units

- **1 game unit = 46.77 of our px.** View = 41.06 × 23.09 u (perspective camera, FOV 60°, 20 u away, 16:9), and
  1920 / 41.06 = 46.77.
- **Hero:** the box is about 1.0 × 1.5 u = **47 × 70 px** (an estimate; ours is 40 × 80). **Run 11.67 u/s =
  546 px/s** (ours 576). **Jump 3 u = 140 px** (ours ~272). Chained jumps are 3.75 / 4.5 u = 175 / 210 px.
- So the view scale matches the body and the run speed within 10%. **Ori's single jump is about half of ours**, in px
  and in body heights (2 bodies against our 3.4). Ori's spaces are built for a low jump plus wall jump and double jump.
- The whole area is 31,333 × 11,504 px (16.3 × 10.7 views).

## The area as a player meets it (first 10 minutes, then the rest)

- **0:00** Ori wakes in a bright, empty glade about 3 screens long (`wake`). There are no enemies or pickups in it.
  The way east is blocked by a bramble wall, which can only be passed hours later.
- **0:30** Head west. Climb a rise, then drop onto a log and fall through it into a lower band (`drop` → `well`). The
  drop is one-way for now.
- **1:30** Walk west along the lower band. Hop logs over polluted water and jump purple thorn plants (`crossing`).
  **Energy cell 1** here unlocks Soul Link (save anywhere for 1 energy).
- **3:00** A **Rammer** bursts out of a cracked wall in the tunnel. You jump it, and it breaks the wall and dies under
  a falling rock (`ram`).
- **4:00** At the tunnel's west end Ori climbs a big log and finds **Sein**, which gives **Spirit Flame**.
- **5:00** **Three Hoppers** attack: the first real fight. **Secret 2** (a small container) is under the log.
- **7:00** Walk back east. Burn the thorn plants around a wind plant. Behind them is the **Spirit Well**, the first
  save (`well`, 1.7 screens below the start).
- **8:00** The wind plant lifts Ori back up (`drop`). A Crawler waits on the pole. **Secret 1** is behind roots, and
  **keystone 1** is behind a boulder you pull aside.
- **10:00** Swinging logs over the pond lead to **keystone 2** (`logs`). Spirit Gate 1 opens with 2 keys. Behind it
  is the signpost hub.
- **10–15** Optional: hop up the giant mushrooms for **life cell 1** (`attic`). Go west under a log, down a shaft,
  and into the long hollow at the bottom-left. There, Fil's tree gives **Wall Jump** (`walljump`, ~min 15). Use it at
  once on the wall beside the tree for **energy cell 2**.
- **15–23** Climb back up. Push a boulder past swinging spikes for **keystone 2-2**, with secrets 3 and 4 beside it
  (`upperleft`). Pull a lever for the **map fragment** (`leftglades`). Drop to the **map stone** and **keystone 2-1**
  (`mapstone`).
- **23–29** Spirit Gate 2 opens into the **Spirit Caverns**. Wall-jump up between rows of shooter flowers and collect
  **4 keystones**. On the way you pass a 4-energy gate that you cannot open yet.
- **29–33** Spirit Gate 3 opens. Pass the Valley fork and enter the **Spirit Tree's** dome (a set piece and the
  second Spirit Well). Go east to the Hollow Grove.

## Measurements

| measure | value |
|---|---|
| rooms | 22 (hand-cut from the map; the game has no rooms) |
| screens: room boxes / open air inside them | **79.9 / 41.3** (1 screen = 1920 × 1080) |
| critical-path rooms | 16 of 22, **70.0 screens** of box |
| critical route walked (A* through the map's open space) | **121,271 px = 63 view-widths**, ~33 min (guess) → about 1.9 view-widths a minute |
| horizontal vs vertical travel on that route | **106,798 vs 30,431 px (3.5 : 1)** |
| rooms by shape | pocket 6, hall 5, corridor 5, shaft 4, hub 1, setpiece 1 |
| exits per room | mean **2.32**; max 5 (`leftglades`, the junction); 5 rooms have 1 |
| dead ends and what each holds | `ram`: Sein (Spirit Flame) + secret 2 · `walljump`: Wall Jump + energy cell + giant container · `upperleft`: keystone + 2 secrets · `mapstone`: map stone + keystone · `laserpond`: ability cell. **Every dead end pays a major item** |
| loops inside the area | 3 (E − V + 1). (a) `signpost` → drop to `mapstone` → `leftglades` → `signpost`, ~3 view-widths, open from min 10. (b) `lowercav` → 4-energy gate → `laser` → drop to `signpost`, ~5 view-widths, needs 4 energy (late). (c) `drop` → `well` → `crossing` → swim tunnel → `logs`, ~7 view-widths, needs clean water (hours later). **None of the loops is open on the first pass except (a)** |
| enemies | 16 placed (estimates): **0.20 per screen** overall, **0.17 per screen** on the critical path |
| enemy kinds | Hopper 6, shooter flower 5 (stationary, respawning projectile rows), Consumed Crawler 2, Rammer 1 (scripted), Quilled Crawler 1, Crawler 1 |
| enemy toughness | HP **not mined**. Spirit Flame does 2 a hit; Ori has 12 internal HP (3 cells). The walkthroughs say Hoppers die "in about one hop", i.e. a few hits, and that the Rammer ambush can kill a fresh Ori. The danger here is from terrain and timing (shooter rows, spikes, thorns, laser), not from enemy health |
| pickups | 30: keystones 8, spirit-light containers 10 (small 4, large 3, giant 3), energy cells 4, ability cells 4, life cell 1, map stone 1, map fragment 1, Wall Jump 1 → **0.38 pickups per screen**, 0.10 keystones per screen |
| secrets (truly hidden) | 11. Off the map art: 4 (secret 1, 2, 3, the pocket above the Wall Jump hollow). Behind a breakable wall or floor: 2. Behind a DE torch barrier (Light Burst): 2. Under polluted water: 2. Reached by bashing a projectile: 1. Distance from the route: median **~670 px (0.35 view-width)**, max 2,384 px (secret 3) |
| saves | 2 Spirit Wells, **83,803 px of route apart** (~44 view-widths). The first is 32,572 px into the route (~min 7). Soul Link (save anywhere for 1 energy) is available from ~min 2, so the well spacing is not the save spacing |
| gates seen before they open | the bramble wall east of the start (seen min 0, opened hours later); Spirit Gate 2 (seen ~min 12, opened ~23); the 4-energy laser gate (seen ~24, opened much later); the charge-flame wall; the pond's swim tunnel. Gates 1 and 3 open within a minute of being seen |
| longest stretch of route with no thing or enemy within 6 u | **17,951 px (9.3 view-widths)**: signpost → Wall Jump tree (low confidence: unplaced enemies may sit there). Next longest: the empty waking glade, 8,863 px |
| what the first abilities open | start: 5 rooms / 27 screens / 3 pickups → **+Spirit Flame (min 4): 12 / 49 / 10** → **+Wall Jump (min 15): 18 / 73 / 19, all 8 keystones** → later skills and clean water: 22 / 80 / 30. Wall Jump adds 24 screens and 9 pickups in the area itself |
| first play (guess) | critical path ~33 min; 100% of the area ~70 min spread over later visits (11 of the 30 pickups need skills from later areas) |

## 12 facts for an AI building a first area

1. **Scale:** 1 Ori unit = 46.8 px; the view is 41 × 23 units. The body (47 × 70 px) and run (546 px/s) are close to
   ours, but **Ori's jump is 140 px, half of ours**, and the spaces are cut for that. Scale our jump gaps from body
   heights, not from Ori's px.
2. The first area is **80 screens** of room boxes, of which **41 screens are open air**. The critical path is a
   **63-view-width walk** in ~33 minutes: about **2 view-widths a minute**.
3. **Travel is 3.5 : 1 horizontal to vertical.** The Glades are a stack of long horizontal bands linked by short
   shafts. The one big climb (the Spirit Caverns) comes last.
4. **The first 4 minutes have no weapon and no ability:** an empty 3-screen glade, a one-way drop, a scripted Rammer
   you jump over, then the weapon (Sein) at the far end of a dead-end tunnel, rewarded at once with a 3-Hopper fight.
5. **Two abilities in 15 minutes:** Spirit Flame at ~min 4, Wall Jump at ~min 15. **Each one nearly doubles the
   reachable space** (27 → 49 → 73 screens).
6. **The new ability is used within seconds:** energy cell 2 sits on the wall beside the Wall Jump tree.
7. **Keystones pace the path: 8 keys, 3 gates (2, 2, 4).** All 8 keys are within 16 px of the route. Keys are progress, not secrets.
8. **Every dead end pays a major item** (5 dead ends: the weapon, the skill, the map stone, 2 keystones + 2 secrets,
   an ability cell). The mean is 2.3 exits per room, with one 5-exit junction (`leftglades`).
9. **About a third of the pickups (11 of 30) are visible but locked** behind skills from later areas (Light Burst,
   Bash, Charge Jump, clean water). Gates are seen long before they open (the bramble wall at min 0, the energy gates).
10. **Secrets sit close:** 11 truly hidden pickups, median ~0.35 view-width off the route. They hide in pockets the map
    does not draw, behind breakables, behind torch barriers, and under polluted water.
11. **Combat is light:** ~0.2 enemies per screen. Hoppers come in groups of 3 in one tunnel, and the Spirit Caverns use
    5 stationary shooter rows as timing hazards. The pressure is mostly from terrain (thorns, swinging spikes, a laser).
12. **Saves:** 2 Spirit Wells ~44 view-widths of route apart, the first ~7 minutes in. Soul Link (save anywhere for 1
    energy, from min 2) does the real work. **The area ends at a landmark set piece** (the Spirit Tree dome, ~9 screens
    of box, also a save), with the exit to the hub right behind it.

## How to rebuild

The scripts are in the session scratchpad: `ori/tools/{crs,data,data2,build,render}.py`, run with the shared venv plus
opencv. `build.py` reads `bf-areas.ori` from `nifty-bhaskara-28e244/shots/reference/maps/ori/logic/` and the
stitched tiles. The hand-made tables (rooms, exits, route, estimated enemies and hazards) are in `data.py` and
`data2.py`. Replace them with scene data when the game files exist.
