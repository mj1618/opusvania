# Hollow Knight first area: extracted from the game files (2026-10-30)

Matt owns Hollow Knight on this Mac and asked for exact data in place of the web-mined map. Internal reference only:
nothing from the game is in the repo except measured numbers and our own maps drawn from them. Data: `area.json`;
write-up and measurements: `README.md`; look references (the game's art, outside the repo):
`~/code/opusvania-refs/hollow-knight/`.

## Method
- **Install**: Steam, Mac build, Unity 6000.0.61f1 (the 2025 engine update), 4.9 GB. Scenes are
  `Contents/Resources/Data/level<N>` (N = the scene's index in BuildSettings) plus `sharedassets<N>.assets`.
- **Reader**: UnityPy 1.25 in a fresh venv, run with `python -I` from outside the game folder, read-only. The build
  ships without type trees, so MonoBehaviour fields come from type trees generated from `Managed/*.dll`
  (TypeTreeGeneratorAPI). Two fixes were needed: load each scene's external asset files into the same environment so
  script and sprite pointers resolve, and retype the generator's `List<string>` nodes (typed `string` with an Array
  child, which UnityPy reads as one string) to `vector`; before that every PlayMakerFSM failed to parse.
- **Pipeline** (`tools/reference/mined/hollow-knight/`): `extract.py` dumps every GameObject of a scene (world matrix
  composed through parents, 2D colliders in world space, SpriteRenderers with sprite bounds, MonoBehaviour fields,
  PlayMakerFSM name / states / variables); `rooms.py` turns the dumps into rooms (terrain, hazards, breakables, hidden
  pockets, doors, things, enemies, first-visit state); `build.py` lays the rooms out and writes `area.json`;
  `render_look.py` draws look references. 64 scenes dump in ~15 s.
- **First-visit state**: an object counts if it is active at load (or in a battle group), not under an
  `Activate Infected` parent that wants the infected Crossroads, and not under a `DeactivateIfPlayerdataFalse` that
  needs later progress. The rest go to `enemiesLater` / are dropped.

## Exact vs approximate
**Exact (files)**: room sizes; every collider (the tile map filled per 1-unit cell, plus slopes, roofs, trims);
spike and acid zones; breakable walls / floors / collapsers / the dive floor (and walls' 4 hits); the dark pockets'
reveal triggers; TransitionPoints; every enemy's position, HP and damage; geo rock values, chests, grubs, mask shards,
the vessel fragment, charms (by id), benches, the stag, levers, lore tablets, lifeblood, roots; the camera (FOV 24 deg
at z -38.1, so 28.8 x 16.2 u in view) and the knight (box, run, jump constants, gravity, the 0.02 s physics step).
**Mined (exact, not from the files)**: the door graph, what each door and item needs (randomizer logic), enemy
behaviour text (wiki). **Ours / approximate**: the room placement (chained by door positions; HK's world is not one
consistent plane), "how hidden" text (from geometry: inside a pocket, a breakable within 12 u), difficulty 1-5, play
minutes, the jump height (computed from the constants, not measured in play), and whether a big dark mask is a secret
or just an unlit part of a room. Not got: patrol ranges and attack timings (they live in FSM actions, not fields).

## Five findings for building our first area (in our px: 1 HK unit = 66.7 px)

1. **Rooms are 2 x 2 views, and the first one is 34.** Median room 70 x 35 u = **4,670 x 2,330 px (2.4 x 2.2 views,
   4.8 screens)**; 31 of 45 rooms are 1.6-7.5 screens. The tile map is solid in 47% of each room box, so a median room
   holds ~2.5 screens of air. King's Pass breaks the rule on purpose: one 201 x 80 u room (13,400 x 5,330 px, 34.5
   screens) worked left to right in three tiers, then a 39.5-screen hub with no enemies.
2. **Density comes in clusters after a calm entrance.** 0.48 enemies per screen overall, 0.33 on the critical path,
   19 of 45 rooms empty. On the critical path the first enemy stands **0.56-1.46 view-widths (median ~0.9)** from the
   door you came in by: every room opens with most of a screen of calm. Enemies sit close to each other: median
   nearest neighbour **8.6 u = 570 px** (a quarter of them within 5.4 u = 360 px), so they come in pairs and groups,
   not spread evenly. 36% fly. The peaks are 5 rooms at 1.6-2.4 per screen, and 3 rooms lock you in for waves (the
   Glowing Womb's 12, the aspid arena's 3, the False Knight with 3 husks).
3. **Secrets are dark pockets about one view big, right on the path, plus walls one hero-step wide.** 33 of the 100
   things are hidden. 18 pockets are covered by a dark mask until you step in: median **18 x 12 u = 1,210 x 790 px**
   (0.6 x 0.7 of a view); 11 are in critical-path rooms and King's Pass alone has 4 (the player learns "dark edge =
   room" in the first minute). 19 breakables: walls **2.3 x 4.1 u = 150 x 275 px** (3.2 knight heights, 4 hits), floors
   3.8 x 5.5 u, 5 collapsing floors (two in King's Pass that drop you a tier), one dive floor shown long before the dive.
4. **Spikes are common, thin and forgiving.** Spikes in 15 of 45 rooms: 89 strips **1 u tall, 5.5 u long on average
   (370 px, 11 knight widths)**, 492 u in all; 1 mask a touch and 43 respawn triggers in 13 rooms put you back at the
   ledge, not the bench. King's Pass has 50 u of them (7 strips, 8 respawns) before any harmful enemy; the Fury charm
   sits in a spike pit at its end. Acid appears in one room only (4 boxes). Hazards carry the terrain challenge; the
   enemies stay simple.
5. **King's Pass and the Crossroads teach by stepping one number at a time.** King's Pass: only 8 HP enemies that hit
   for 1 (crawlids that never attack, vengeflies that home), spikes, dark pockets, a breakable floor, collapsing floors,
   tablets: every verb and every hiding trick, no real threat. The well adds the 15 HP husk (3 hits). The aspid hunter
   adds range, the aspid arena the first lock-in (3 aspids). The Husk Guard just before the False Knight is the first
   **2-mask** hit and 70 HP (14 hits), then the boss (65 HP x 3 armour phases, mace for 2). The first ability's room
   (11 baldurs at 15 HP, an Elder Baldur at 60) is a reward run, not a step up.

## Also learned
- The community "64 px per unit, 30 x 16.875 u view" is the art's scale, not the camera's: HK's camera shows 28.8 x
  16.2 u, so a screen of HK is 4% bigger in units than the old map assumed (+8.5% screens).
- The knight's full jump is ~5.3 u (352 px) against our 272; the run 553 px/s against our 576. Relative to the view,
  HK jumps 30% higher than Wing and runs 4% slower.
- The Black Egg Temple's bench (Room_Final_Boss_Atrium) is behind the sealed final door; the temple's first room has
  none. The first area has 5 benches and a stag, and King's Pass has none.
- Only one Grubfather reward (Grubsong) is reachable with this area's 5 grubs; the mined list counted all 7.
