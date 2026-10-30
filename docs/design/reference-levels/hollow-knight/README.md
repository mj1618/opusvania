# Hollow Knight: King's Pass, Dirtmouth, Forgotten Crossroads (to False Knight + Vengeful Spirit)

2026-10-30. Brief: `../BRIEF.md`. Data: `area.json` (shared schema). Map: `shots/reference-levels/hollow-knight/map.png`
(1 px = 8 of our px) plus crops `map-crop-*.png`; `terrain-native.png` is the hallownest.net screenshot collage of the
same region for the real art (its rooms are spaced like the in-game map, so it does not line up with `area.json`).

## Sources and confidence

**The game files were not available.** Hollow Knight was not installed at the start or at the end of this session
(`~/Library/Application Support/Steam/steamapps/common/` holds only CS:GO and Nine Sols; Steam's content log shows no
download). Everything below is mined community data, the wiki, and marked estimates. The extraction pipeline for the
game files is written and waiting (see "Re-running from the game files").

| what | source | confidence |
|---|---|---|
| room size (tile-map W x H) | hallownest-calculator `js/scene-objects.js` SIZES, generated from the game files | exact |
| exits, one-ways, what each door needs | RandomizerMod door table + logic (gates hand-read from the logic) | exact |
| door, item, bench positions | TangledMapView `mapData.js` (scene units) | exact |
| enemies per room | hallownest-calculator ENEMIES: per Hunter's-Journal type, a **count and the group's centre** | exact count, position = group centre |
| breakable walls/floors, one-way walls, hidden-room masks | hallownest-calculator SECRETS: centre point | centre exact, size guessed |
| geo rocks, totems, chests, tablets | TangledMapView + hallownest-calculator | exact |
| enemy HP, behaviour | hollowknight.wiki (datamined) | good |
| **terrain** | the game's **own map drawing** of each room (hallownest-calculator `map-walk.js` + GameMap boxes), 1-unit cells, nudged per room so benches/rocks/walkers stand on it | **rough envelope**: outer cave walls, floors and ceilings only. **No interior platforms, slopes, spikes or acid.** Up to a few units off. |
| hidden-thing "how / needs" | randomizer logic for needs, nearest secret object (<= 15 u) for how | inferred |
| hero box, jump height, difficulty ratings, play minutes | estimates | low |

URLs: https://github.com/betorzdev/hallownest-calculator (`js/scene-objects.js`, `js/map.js`, `js/map-walk.js`),
https://github.com/homothetyhk/RandomizerMod (Resources/Data, Resources/Logic),
https://github.com/sirbrialliance/TangledMapView (`Web/mapData.js`), https://hollowknight.wiki (MediaWiki API, enemy pages),
https://www.hallownest.net (screenshot map tiles, `terrain-native.png`). Cross-check: hk-psx's scene catalog
(https://github.com/EBonura/hk-psx, `docs/CATALOG.md`) counts 7 HealthManagers in King's Pass = our 3 vengeflies + 4 crawlids.

**Not got:** collider-accurate terrain (platforms, slopes), hazards (spikes in King's Pass and Crossroads_31, acid in
Crossroads_35), individual enemy positions and patrol ranges, Goams (not Journal kills, so absent), the exact size of
each breakable wall, the hero's collider and jump from `HeroController`, the camera's FOV (the 64 px/unit is the
community figure: 1080 px / 16.875 u).

## Units

1 HK unit = **64 of our px** (HK's 1080p view is 30 x 16.875 u, so its view = our 1920 x 1080 view exactly).
Hero in our px: box **~32 x 82** (est.; ours 40 x 80), run **531 px/s** (8.3 u/s; ours 576), full jump **~330 px**
(est. 5.2 u; ours 272). So HK's knight is slightly narrower, a touch slower and jumps ~20% higher, relative to the view,
than Wing.

## The area as a player meets it (first 10 minutes; times are estimates)

- **0:00 King's Pass** (201 x 80 u = 31.8 screens, one room). You fall in at the top left. Within the first screen and
  a half: three slash prompts (left, right, up) on the floor, then 4 crawlids (harmless walkers) and 3 vengeflies
  (homing fliers). The room is three long tiers worked left to right; the Focus tablet sits mid-way (x 111 u). Two
  breakable floors on the top tier, a hidden-room mask at the far left, a spike pit at the bottom right with the Fury
  of the Fallen charm and a tablet. The exit is a stone door you break; past it a ledge drop you can't climb back
  (the claw gate shown in minute 4). The Howling Cliffs exit is visible and needs claw: the first lock, minute 1-2.
- **~0:04 Dirtmouth** (263 x 70 u, 36 screens, no enemies). A flat walk with Elderbug, a bench at x 132, six
  locked doors (rescues, keys, the stag station, DLC tents), and the well at x 185. The Crystal Peak exit on the right needs wings + crystal
  heart: the second lock.
- **~0:06 the well** (Crossroads_01, 8 screens). 2 tiktiks, a crawlid, 2 wandering husks. Left goes to the Platforms
  shaft, right to the Black Egg Temple (bench + the game's final door, sealed).
- **~0:08-10** east: Crossroads_39 (2 wandering husks, a hornhead) to the East junction (Crossroads_14, 4 exits: a
  grub guarded by a Husk Guard, Myla, the lever corridor down to the stag shaft). Or west: the Platforms shaft
  (9 gruzzers, 7 tiktiks) to Cornifer and his map 2 rooms in, and the Greenpath gate guarded by an Elder Baldur
  (needs Vengeful Spirit: a lock you see by minute ~10).
- After that (est. minutes 10-45): the stag shaft (bench 1 room off), the Husk Guard corridor (Crossroads_21), the
  False Knight arena (Crossroads_10, its west door opens after the fight), the Ancestral Mound (11 baldurs, an Elder
  Baldur, a bench) and Vengeful Spirit.

## Measurements

Counted over the area's 45 rooms (King's Pass, Dirtmouth, 40 Crossroads rooms incl. Ancestral Mound, the Black Egg
Temple, Salubra's shop, Sly's hut); the two Greenpath rooms and the Crystal Peak toll room are drawn but not counted.
A "screen" is 1920 x 1080 of ours (30 x 16.875 u).

| measure | value |
|---|---|
| rooms / screens (room rects) | **45 / 310** screens; **~192** screens of air by the map drawings (62%) |
| room size | min 1.5, median **4.4**, max 36 screens (Dirtmouth 36, King's Pass 32, Ancestral Mound 21) |
| critical path (King's Pass to Vengeful Spirit) | **12 rooms (27%)**, 142 screens (46%, because the two 30+ screen intro rooms are on it); 56,971 px long through doors |
| critical path without King's Pass + Dirtmouth | 10 rooms, 74 screens, 7 rooms to the first boss from the well |
| rooms by shape | hall 24, hub 7 (4+ exits), set piece 6, shaft 6, corridor 2 |
| exits per room | mean **2.4**; 1 exit: 13, 2: 16, 3: 7, 4: 5, 5: 2, 6: 2 |
| dead ends | **17** (13 + 4 interiors). Each holds something: grub x3 (31, 35, 48), charm (Glowing Womb), vessel fragment (37), bench (Hot Springs; Stag + stag station), grub rewards (Grubfather), soul totem (Myla), geo rock (tram, Goam journal room), Ancestral Mound (ability + bench + charm), Black Egg Temple (bench + final door), Salubra (shop), Sly's hut (rescue), Baldur gate (tablet + the way to Greenpath), King's Pass (start) |
| loops (independent cycles) | **5**, lengths 4, 4, 7, 10, 11 rooms; the two 4-room loops close through one-way/boss walls (Mawlek wall, Gruz Mother) |
| enemies (first visit, no spawns) | **144 individuals = 0.46 per screen**; on the critical path 50 = **0.35 per screen**; 19 of 45 rooms have none; 125 more are Infected-Crossroads variants or spawns (excluded) |
| enemy kinds (n) | Aspid Hunter 21, Vengefly 17, Tiktik 14, Gruzzer 13, Wandering Husk 12, Aspid Mother 11, Baldur 11, Crawlid 10, Husk Bully 10, Husk Hornhead 8, Leaping Husk 6, Husk Warrior 3, Elder Baldur 2, Husk Guard 2, Menderbug 1, Gruz Mother 1, Brooding Mawlek 1, False Knight 1 (+ Goams, not counted) |
| HP vs the hero | nail 5 dmg. Commons 8 HP (**2 hits**: crawlid, vengefly, tiktik, gruzzer) or 15 (**3 hits**: husks, aspid hunter, baldur); Aspid Mother 20 (4). Heavies: Elder Baldur 60 (12, immune when curled), Husk Guard 70 (14). Bosses: Gruz Mother 90 (18), Brooding Mawlek 300 (60), False Knight 355 (71). Hero 5 masks; contact = 1 mask; Husk Guard club and FK mace = 2. 11 SOUL per hit, 33 to heal one mask = 3 hits per heal. |
| difficulty mix (1-5, est.) | 1: 26%, 2: 44%, 3: 26%, 4: 2% (2 Husk Guards, Gruz Mother), 5: 1% (Mawlek, False Knight) |
| pickups per screen | major **0.07** (22 incl. 7 Grubfather rewards: 5 grubs, 2 mask shards, 1 vessel fragment, 3 charms, map, key item, ability, relic, chest); geo rocks **0.12** (36); everything incl. totems, tablets, doors **0.35** |
| secrets | **26**: 18 breakable walls/floors (incl. a one-way wall and a dive floor) + 8 hidden-room masks. Hops from the critical path: 0: 11, 1: 1, 2: 7, 3: 5, 4: 2 |
| secrets on the critical path | 11 of 26: King's Pass has 3 (2 breakable floors, a hidden room); Crossroads_21 (the FK approach) has 4 |
| saves | **6 benches** (Dirtmouth, Black Egg Temple, Stag, Hot Springs, Salubra, Ancestral Mound); hops from the critical path 0, 1, 1, 3, 2, 0; straight-line Dirtmouth to Stag 8.2 screen-widths, Stag to Hot Springs 3.3, Stag to Salubra 7.4. No bench in King's Pass; the first is ~4 minutes in. |
| gated exits (all visible before they open) | **16**: boss 6, claw 3, breakable one-way 2, spell 1 (Elder Baldur), Isma's tear 1, claw+wings 1, wings+crystal heart 1, key 1; plus 6 shuttered houses in Dirtmouth |
| travel on the critical path | horizontal 44,832 px (23.4 screen-widths), vertical 11,904 px (11 screen-heights): V:H = 0.27 by px, 0.47 by screens |
| longest stretch with nothing within half a screen | 7,756 px (~4 screen-widths): the walk across Dirtmouth |
| what the first ability opens | Vengeful Spirit kills the Elder Baldur at Crossroads_11_alt: **the whole next area** (Greenpath, ~33 rooms). Inside this area it opens nothing new by door (43 of 45 rooms are reachable with the start kit + bosses); still locked: Glowing Womb (claw) and the vessel-fragment room (lift). |

## 12 facts for an AI building a first area

1. **The view is 30 x 16.875 units; 1 u = 64 of our px**, so HK numbers carry over 1:1 in screens. The hero is ~0.5 x
   1.3 u, runs 8.3 u/s (3.6 s per screen width).
2. **The tutorial room is huge and single**: King's Pass is 201 x 80 u = 32 screens in one room, three tiers, 7
   enemies, 3 secrets, 5 geo rocks, a charm; it ends in a one-way drop.
3. **A quiet hub of 36 screens with 0 enemies** follows it (Dirtmouth): one bench, one well, 6 locked doors, 1 locked exit.
4. **Only 27% of rooms are on the critical path** (12 of 45); the first boss is 7 rooms from the well.
5. **Median room = 4.4 screens**, but sizes swing 1.5 to 36; 24 of 45 are long halls, 6 are tall shafts, 7 are hubs
   with 4-6 exits.
6. **Mean 2.4 exits per room; 17 dead ends (38%), and every dead end holds something**: a grub, a charm, a bench, a
   shop, a mask or vessel piece, an ability.
7. **5 loops in 45 rooms** (one per 9), lengths 4-11 rooms; two of them close through walls that open from the far
   side (one-way shortcuts back to Cornifer's hub).
8. **Enemy density is low: 0.46 per screen overall, 0.35 on the critical path**; 19 of 45 rooms have none. The 26 rooms
   that have enemies hold ~5.5 each.
9. **Commons die in 2-3 nail hits (8 or 15 HP vs 5 damage)**; heavies take 12-14 hits; the first required boss takes
   71 (355 HP). Everything hits for 1 of 5 masks; only clubs and the boss's mace hit for 2.
10. **26 secrets** (0.08 per screen): 18 breakable walls/floors and 8 hidden-room masks; 11 sit on the critical path,
    the rest 1-4 rooms off it.
11. **6 benches, never more than 3 rooms from the critical path**; 3 of them are dead-end rewards (Stag, Hot Springs,
    Ancestral Mound).
12. **16 gated exits are shown before they open** (boss 6, claw 3, one-way walls 2, spell 1, ...), and the game's
    final door is 2 rooms from the well; the first ability (Vengeful Spirit) opens the next area rather than this one.

## Re-running from the game files

When Hollow Knight is installed, these scripts replace the mined estimates. Copies are in
`shots/reference-levels/hollow-knight/tools/` (gitignored; the mined inputs in `tools/data/`; the scripts' `SP`/`DATA`
paths point at the session scratchpad and the earlier study's `nifty-bhaskara-28e244` worktree, so repoint them):
`dump.py <...>/hollow_knight.app/Contents/Resources/Data <out> <scenes>` reads BuildSettings, builds type trees from
`Managed/*.dll` and writes every GameObject with world transform, layer, 2D colliders in world space, and each
MonoBehaviour's fields (HealthManager hp, DamageHero, PlayMakerFSM states and float params). `build.py area.json <dumps>`
then needs a converter from the dumps to its per-room dict (terrain = non-trigger colliders on layer 8 Terrain;
hazards = DamageHero hazardType; enemies = HealthManager; breakables by component/FSM name), `render.py` and
`metrics.py` are unchanged.
