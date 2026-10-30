# Hollow Knight: King's Pass, Dirtmouth, Forgotten Crossroads (to False Knight + Vengeful Spirit)

2026-10-30. Brief: `../BRIEF.md`. Data: `area.json` (shared schema), **now read from the game files** (method and the
designer's findings: `EXTRACTED.md`). Map: `shots/reference-levels/hollow-knight/map.png` (1 px = 8 of our px, drawn
from `area.json` only) plus `map-small.png` and crops `map-crop-*.png`. Look references (Team Cherry's art, outside the
repo): `~/code/opusvania-refs/hollow-knight/`.

## Sources and confidence

| what | source | confidence |
|---|---|---|
| room size | the scene's tk2dTileMap (width x height in units; also the camera's bounds) | exact |
| terrain | every enabled, non-trigger collider on layer 8 (Terrain) active at load: the tile map's edge loops filled per 1-unit cell, plus polygon / box colliders (slopes, roofs, trims) | exact (colliders that only repeat the tile map are dropped) |
| hazards | DamageHero hazardType 2 (spikes, 89 strips) and 3 (acid, 4 boxes): their trigger colliders | exact |
| breakables | walls, floors, the dive floor, collapsing floors by their FSM (breakable_wall_v2 etc.): their colliders; walls take 4 hits | exact |
| hidden areas (secretWall) | the dark masks over pockets (unmasker FSM): the reveal trigger you step into, else the mask sprite's bounds | exact geometry; whether each is a "secret" is a judgement |
| exits | TransitionPoints (gate name, centre, target scene + entry) | exact |
| enemies | every HealthManager present on a first visit, incl. battle waves (waves that wait off-screen sit at the arena centre); hp and contact / weapon damage from the files; behaviour text from the wiki | exact; difficulty 1-5 is ours |
| pickups, saves, levers, NPCs | by component / FSM (Geo Rock: hits x geo per hit + payout; chests; shinies by charm id / PlayerData key; grubs; mask shards; vessel fragment; benches; stag) | exact positions and values |
| what an item or door needs | randomizer logic (homothetyhk/RandomizerMod), matched to the file items within 4 u | mined, exact |
| room graph (which door leads where), room placement | randomizer door table, rooms chained by matching door positions | mined, exact graph; placement is ours |
| camera, knight | resources.assets: tk2dCamera (perspective, FOV 24, z -38.1), Knight BoxCollider2D, HeroController constants, Physics2D gravity, fixed step | exact; jump height computed from them |
| first-play minutes, difficulty ratings | estimates | low |

Not in the data: enemy patrol ranges (behaviour is in PlayMaker FSMs, not fields), Goam HP (invulnerable), the Grubfather
rewards past 5 grubs (only 5 grubs exist in this area), anything conditional on later progress (kept in `enemiesLater`:
65 infected-Crossroads variants, Gruz Mother's brood, inactive-at-load and 2%-chance enemies).

## Units

The game camera is a perspective tk2dCamera, vertical FOV 24 deg, at z -38.1; the knight and the terrain are at z 0.
So the view is **28.80 x 16.20 units** (not the 30 x 16.875 the community figure gives) and **1 HK unit = 66.68 of our
px**. The art is authored at 64 px per unit, so HK draws it at 1.04x on a 1080p screen. The camera keeps its centre at
least 14.6 / 8.3 u from the scene's edges (the lock areas' minimums match).

Hero in our px (files): box **33 x 85** (0.5 x 1.28 u; ours 40 x 80), run **553 px/s** (8.3 u/s; ours 576), full jump
**352 px** (5.27 u: 16.65 u/s held for 9 steps of 0.02 s, then 47.4 u/s2 gravity; ours 272), dash 20 u/s for 0.25 s,
fall cap 20 u/s, nail cooldown 0.41 s, 1.3 s invulnerable after a hit, pogo 12 u/s.

## The area as a player meets it (first 10 minutes; times are estimates)

- **0:00 King's Pass** (201 x 80 u = 34.5 screens, one room). You drop in at the top left (the claw-locked exit to
  Howling Cliffs is beside you: the first lock). Three tiers worked left to right: 3 crawlids and 3 vengeflies (8 HP,
  1 mask), 5 geo rocks, 3 tablets, a lifeblood cocoon, 7 spike strips (50 u) with 8 respawn points, 4 dark pockets
  that open as you enter, a breakable floor and two collapsing floors. The Fury of the Fallen chest sits in a spike pit
  at the bottom right. The exit (a breakable stone) is at the top right.
- **~0:04 Dirtmouth** (263 x 70 u, 39.5 screens, no enemies): Elderbug, a bench at x 132, locked doors, the well at x 185.
- **~0:06 the well** (Crossroads_01, 100 x 42 u): 2 tiktiks, a crawlid, 2 wandering husks; a relic in a dark pocket
  above the floor. Left to the Platforms shaft, right to the Black Egg Temple (the final door, sealed; its bench is
  behind that door, so not usable now).
- **~0:08-10** east: the corridor (3 enemies) to the East junction and the lever corridor down to the stag shaft; or
  west: the Platforms shaft (9 gruzzers, 7 tiktiks, 1 crawlid), Cornifer two rooms in, the Elder Baldur gate (needs
  Vengeful Spirit, seen by minute ~10).
- After (est. 10-45 min): the stag, the Husk Guard corridor (Crossroads_21: 5 enemies, 41 u of spikes, 3 dark
  pockets), the False Knight arena (with its 3 husks), the Ancestral Mound (11 baldurs, an Elder Baldur, a bench) and
  Vengeful Spirit.

## Measurements

Over the area's 45 rooms (boundary rooms: Greenpath x2 and the Crystal Peak toll room, drawn but not counted). A screen
is 1920 x 1080 of ours = 28.8 x 16.2 u.

| measure | value |
|---|---|
| rooms / screens | **45 / 336** screens of room box; the tile map is solid in 47% of it (~178 screens of air) |
| room size | min 1.6, median **4.8**, max 39.5 screens (Dirtmouth 39.5, King's Pass 34.5); median room 70 x 35 u |
| critical path (King's Pass to Vengeful Spirit) | **12 rooms (27%)**, 155 screens (46%); 58,978 px through doors |
| rooms by shape | hall 22, hub 9 (4+ exits), set piece 6, shaft 6, corridor 2 |
| exits per room | mean **2.4**; 1 exit: 13, 2: 16, 3: 5, 4: 7, 5: 2, 6: 2 |
| dead ends | **17**, each holds something (grubs, a charm, the vessel fragment, benches, the stag, shops, the ability) |
| loops | **5** independent cycles |
| enemies (first visit) | **162 = 0.48 per screen** (137 without the 25 Goams); critical path **51 = 0.33 per screen**; 19 of 45 rooms have none |
| densest rooms | Goam room (Crossroads_13) 19 = 2.4/screen; Glowing Womb arena 17 (12 in waves) = 2.2; vessel-fragment hall 13 husks = 1.8; Platforms shaft 17 = 1.6; Ancestral Mound 17 |
| enemy kinds (n) | Goam 25, Aspid Hunter 18, Vengefly 17, Tiktik 14, Wandering Husk 12, Gruzzer 12, Baldur 11, Husk Bully 10, Aspid Mother 10, Crawlid 9, Husk Hornhead 9, Leaping Husk 6, Elder Baldur 2, Husk Warrior 2, Husk Guard 2, Gruz Mother 1, Brooding Mawlek 1, False Knight 1 |
| HP vs the hero (files) | nail 5. **8 HP** (2 hits): crawlid, vengefly, tiktik, gruzzer. **15** (3): every husk, aspid hunter, baldur. 20 (4): aspid mother. Elder Baldur 60, Husk Guard 70, Gruz Mother 90, Brooding Mawlek 300, False Knight 65 per armour phase x 3. Every contact = 1 mask of 5; only the Husk Guard's club and the False Knight's mace deal 2 |
| battle waves | 3 rooms lock you in: Glowing Womb (12 in waves), False Knight (the boss + 3 husks), aspid arena (3); the two Elder Baldurs are battle groups of one |
| pickups per screen | major **0.05** (17: 5 grubs, 2 mask shards, a vessel fragment, 4 charms incl. Grubsong, map, City Crest, relic, geo chest, Vengeful Spirit); geo rocks **0.11** (36, mostly 15 geo in 5 hits); soul totems 7 |
| hazards | spikes in **15 of 45 rooms**, 492 u of strip (~17 view-widths); acid 4 boxes (the acid grub room); 13 of the 15 spike rooms have hazard-respawn triggers (43) |
| secrets | **33 hidden things**; 19 breakables (8 walls, 5 floors, 5 collapsing floors, 1 dive floor) and 18 dark pockets; 11 pockets are in critical-path rooms |
| saves | **5 benches + 1 stag** (Dirtmouth, Salubra, Hot Springs, Stag, Ancestral Mound); none in King's Pass |
| gated exits (all visible first) | **16**: boss 6, claw 3, breakable 2, spell 1, Isma's tear 1, claw+wings 1, wings+crystal heart 1, key 1 |
| travel on the critical path | horizontal 46,706 px, vertical 12,169 px: V:H = 0.26 |
| screens with nothing in them | 59%; the longest straight run of empty screens is 16 |
| what the first ability opens | Vengeful Spirit kills the Elder Baldur at Crossroads_11_alt: the whole next area (Greenpath). Inside this area it opens no door |

### What changed from the mined version (same tools, a screen = 1920 x 1080)
metrics.ts on the whole file (with the boundary rooms): screens 329 -> **357** (+8.5%: the camera shows 28.8 u, not 30,
so every unit is 66.7 px, not 64); enemies 102 group entries -> **198** individuals (0.31 -> 0.55 per screen; area only
0.48); mean difficulty 2.27 -> 1.89; kinds 30 -> 24 (infected variants moved to `enemiesLater`); majors 23 -> 17 (only
1 of the 7 Grubfather rewards is reachable with this area's 5 grubs); saves 8 -> 7 (no bench in the temple's first
room); secrets 36 -> 35; empty screens 65% -> 59%; solid share 0.35 -> 0.63 (real colliders instead of the map's
outline); hazards 0 -> 93. Densest room 5.5 -> 2.4 per screen (the old figure was per mined screen).

## 12 facts for an AI building a first area

1. **The view is 28.8 x 16.2 units; 1 u = 66.7 of our px.** The knight is 0.5 x 1.28 u (33 x 85 px), runs 8.3 u/s
   (3.5 s a screen), jumps 5.3 u (352 px) and its walls break in 4 hits.
2. **The tutorial room is huge and single**: King's Pass is 201 x 80 u = 34.5 screens: 6 enemies (all 8 HP), 50 u of
   spikes with 8 respawn points, 4 dark pockets, 5 geo rocks, 3 tablets, a charm in a spike pit.
3. **A quiet hub of 39.5 screens with 0 enemies** follows it (Dirtmouth).
4. **Only 27% of rooms are on the critical path** (12 of 45); the first boss is 7 rooms from the well.
5. **Median room 4.8 screens (70 x 35 u)**, sizes 1.6 to 39.5; 22 halls, 9 hubs, 6 shafts, 6 set pieces.
6. **Mean 2.4 exits; 17 dead ends, every one holds something.**
7. **Enemies 0.48 per screen, 0.33 on the critical path, 19 of 45 rooms empty**, and 5 dense rooms at 1.6-2.4 per
   screen, two of them lock-in fights.
8. **Commons take 2-3 hits (8 / 15 HP vs 5)**; every enemy hits for 1 of 5 masks; only two weapons hit for 2.
9. **Spikes are quiet and common**: 15 of 45 rooms, 492 u of 1-u-tall strips, 1 mask a touch, and a respawn point
   beside them (43 triggers in 13 rooms).
10. **33 hidden things**: 19 breakables and 18 dark pockets you only see once you step in; 11 pockets on the critical
    path's rooms (King's Pass alone has 4).
11. **5 benches and a stag, none in King's Pass**; the first is ~4 minutes in.
12. **16 gated exits are shown before they open**; the first ability opens the next area, not this one.

## Re-running from the game files

```
python3 -m venv <venv> && <venv>/bin/pip install UnityPy TypeTreeGeneratorAPI Pillow numpy
D=~/Library/Application\ Support/Steam/steamapps/common/Hollow\ Knight/hollow_knight.app/Contents/Resources/Data
<venv>/bin/python -I tools/reference/mined/hollow-knight/extract.py "$D" <dumps> <scenes|ALL>   # ~15 s for the area
<venv>/bin/python -I tools/reference/mined/hollow-knight/rooms.py <dumps> <rooms.json>
<venv>/bin/python -I tools/reference/mined/hollow-knight/build.py <area.json> <rooms.json>
```
`build.py` still reads the mined tables (randomizer door table + logic, TangledMapView, the wiki's behaviour text) from
the paths at its top; repoint them. Scene list for the area: Tutorial_01, Town, Crossroads_* (with Crossroads_10_boss),
Room_temple, Room_ruinhouse, Room_Charm_Shop, Mines_33, Fungus1_01, Fungus1_01b. `render_look.py` makes the look
references (outside the repo).
