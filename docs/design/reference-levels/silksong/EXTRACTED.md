# Silksong's first area: how it was extracted, and what a level designer should take from it (2026-10-30)

## Method
- **Install** (Matt's, read-only): `~/Library/Application Support/Steam/steamapps/common/Hollow Knight Silksong/`, Mac
  build, Unity **6000.0.50f1**. Scenes are Addressables bundles (`StreamingAssets/aa/StandaloneOSX/scenes_scenes_scenes/
  <scene>.bundle`, 590 of them); the version string is stripped from bundles, so UnityPy needs
  `config.FALLBACK_UNITY_VERSION`. Typetrees are included, so every MonoBehaviour reads without the DLLs; script names
  come from `*_monoscripts.bundle`; enums (MapZone, HazardType, EnemySize) from `Managed/Assembly-CSharp.dll` metadata
  (dnfile); pointers into other bundles resolve through an index of CAB names read from the 2,074 bundle headers.
- **Tooling**: a scratch venv (UnityPy 1.25.4, Pillow, numpy, dnfile), Python run with `-I`, scripts outside the game
  folder, nothing executed from it. Everything is in `tools/reference/mined/silksong/extract.py` (`cabindex`, `dump`,
  `build`, `measure`, `render`, `enums`); it reproduces `area.json` byte-for-byte in content.
- **Per scene**: every GameObject with its composed world transform, layer, components, 2D colliders in world space and
  the scalar fields of every MonoBehaviour (PlayMaker FSMs summarised: states, variables, string params); plus the
  tk2dTileMap's tile ids as a solid/empty grid.
- **Area**: picked by map zone and by the start / boss / ability flags (README). Rooms are placed by aligning linked
  gates; solids are the tile grid merged into rectangles plus Terrain-layer colliders; the rest follows `../BRIEF.md`.
- **Look**: rooms re-assembled from their SpriteRenderers (orthographic, by sorting layer and order), the most-used
  sprites exported: `~/code/opusvania-refs/silksong/` (not in the repo).

## Exact vs approximate
**Exact (from the files):** scene list and zones; tile solids and collider geometry; gate positions and links; the new
game's start (`respawnScene = Tut_01`); every enemy root's position, hp and contact damage; item pickups and what they
are; benches, shops, NPCs, levers, arenas, bosses; hazard colliders and their type; the mask sprites that hide pockets;
camera FOV and limits (view 28.79 x 16.2 u -> 66.68 px per unit, as HK); HeroController run/jump constants, Hornet's collider,
gravity (60 u/s^2), fixed step (0.02 s).

**Derived:** jump height (5.86 u = 391 px, from the constants, not measured in play); room boxes (air-tile bounds +1
tile: the tilemaps carry solid filler, e.g. Tut_01's map is 120 x 120 u but its air spans 106 x 118); room placement
(least squares over 108 gate equations, mean misfit 4 u, max 15 u; the game's own map is stylised, so this is truer to
the level but not to the map screen); "hidden" (inside a mask rect).

**Approximate / estimate:** gate requirements (read from the objects beside each gate), enemy common names, behaviour
lines and difficulty, minutes, the order of Tut_01 / Tut_02 on the critical path, the fresh-game state (Act 1 objects
switched by `Normal World`, PlayerData switches assumed at new-game defaults). **Missing:** patrol ranges (FSM data),
FSM-spawned drops, mask shards (none placed in these scenes), any reachability solve.

## The five most useful findings for building our first area
1. **Measure rooms in heroes, not screens.** Hornet is **139 px** tall in our units (2.08 u at 66.7 px/u), Wing 80, so a
   Silksong screen is 7.8 Hornets tall and ours is 13.5 Wings. Silksong's median room is **11.0 screens of box but 6.0
   of air** (48% of every box is rock), the largest 40 air screens (Bone Bottom). Copy layout in hero units: scaled to
   Wing's height (x0.58) a median room is ~2 of our screens of air; copied by screens it would feel 1.7x emptier per
   hero. Jumps agree with that scale: 391 px = 2.8 Hornets, ours 272 = 3.4 Wings.
2. **Density comes in rooms, not averages.** 132 enemies = **0.53 per air screen**, but 9 of 34 rooms have none, the hub
   (Bone Bottom, 40 air screens) has 3 (0.07), and the fight rooms run **1.1-1.6** (Bone_14 1.64, Bone_16 1.31, Tut_01b
   1.16, Tut_02 1.06). One critical-path room (Bone_01c, 6.8 air screens) has **no enemies and 8 rolling boulders**:
   hazards stand in for creatures. 118 of 132 enemies hit for 1 mask of 5 and die in 2-6 needle hits; challenge is
   groups, arenas (Bone_01's gate battle, Bone_18) and terrain.
3. **Secrets are painted over, not walled off.** 164 mask sprites (Unmasker/Remasker) cover open pockets with rock-dark
   shapes that lift when entered; 8 breakable walls own such a mask (wall + mask = the secret-room pattern). 19 things
   (22%) sit in masked pockets, **8 of them in critical-path rooms**, almost all currency (rosary strings and rocks,
   shell-shard fossils, a chest). The majors hide by distance instead: 4 of 8 are in dead ends (Straight Pin, Bone
   Necklace, a Memory Locket after a battle, the spool fragment behind Bone_01b's secret wall).
4. **The opening teaches one thing per room, hazards last.** Tut_01 (start): 2 slow Mossmirs. Tut_02: 8 Mossgrubs (2
   hits each) and 3 Mossmirs over a pool, no hazards. Tut_01b (side): rollers plus the first spikes and the first lock
   (a Needolin song gate, ~minute 4). Tut_03: a **bench 1.45 view widths before the first boss** (Moss Mother, 120 hp =
   24 hits, summons). **No hazard in the first two rooms**; the first boss comes at ~minute 6, then the town.
5. **Many loops, a short path, benches every 2.5-4.4 view widths.** 34 rooms, 44 links, **11 independent loops**;
   the critical path is **10 rooms (29%)**; exits average 3.85 per room; 6 dead ends each pay something. 7 benches,
   nearest-neighbour 2.5-4.4 view widths apart. Travel is horizontal (vertical : horizontal 0.36) around two tall
   shafts (Tut_01, Aspid_01). The first ability (Silk Spear, in Mosshome off the path) opens **no** space: the reward
   is combat; space opens with the Bell Beast's Bellway and, later, Needolin's song gates.

## How it differs from Hollow Knight's first area (HK numbers from `../hollow-knight/area.json` today)
| | HK (King's Pass -> False Knight + VS) | Silksong (Moss Grotto -> Bell Beast + Silk Spear) |
|---|---|---|
| px per unit / hero box | see `../hollow-knight/` (same camera) | 66.7 / **33 x 139** |
| rooms / box screens | 48 / 357 | 34 / 513 (248 of air) |
| median room (box) | 4.4 screens | **11.0** (6.0 of air) |
| enemies per box screen | 0.55 | 0.26 (0.53 per air screen) |
| hidden share of things | 0.35 | 0.22 |
| hazards | 93 | 127 (spikes, boulders, trap spikes, lava) |
| first boss | False Knight, deep in the Crossroads (7 rooms past the well) | Moss Mother, **~6 min** (est.), the gate into town |
| opening | King's Pass: one 32-screen room, 7 harmless enemies | Tut_01: a 6-exit vertical hub; the first fight room is its side loop |
| first ability | Vengeful Spirit, at the end of a dead end, opens Baldur gates | Silk Spear, a side room in Mosshome, opens nothing |
| the hub | Dirtmouth: 36 screens, 0 enemies, 6 locked doors | Bone Bottom: 60 box / 40 air screens, 3 enemies (upper ledges), 13 exits, 5 into one shaft |

Silksong packs fewer, bigger rooms with more rock between the caves, a taller hero, the first boss within minutes, and
more hazard pieces; HK spreads more, smaller rooms and hides a larger share of its things.
