# Reference maps: Hollow Knight (and Silksong's opening)

2026-10-20. Researcher brief: `BRIEF.md`. This doc covers Hollow Knight's whole world, a close study of its first
1–2 hours (King's Pass, Dirtmouth, the Forgotten Crossroads, Greenpath), and Silksong's opening (Moss Grotto, Bone
Bottom, the Marrow). It measures them and turns what it finds into ten rules we can check, then applies each rule to
wood area 1 v3 (`docs/design/regions/wood-area1-v3.md`) and Lanternroot (`docs/design/levels/proto-1.md`).

**Confidence.** Room counts, exits, one-ways, gates, dead ends, loops and bench distances come from game data (the
randomizer's door table and logic), so they are exact. Room sizes in screens are estimates (±15%; method in §1).
Play times are typical first-timer estimates, marked *(guess)*.

---

## 0. The short version

Hollow Knight's opening is big, open, and mostly optional:
- **The way on is short.** Greenpath is 2 rooms from the bottom of the well. The first boss is 7. Of the
  Crossroads' 41 rooms, about 3 are needed to reach the next area.
- **Everything else is a web you wander:** 41 rooms, 5 loops, 10 dead ends, and every one of those dead ends pays.
- **It shows ~4 locks for every open door.** The game's final door is in the second room.
- **Benches are never more than 4 rooms away.**

Our two levels are the opposite:
- **Small:** 10–15 rooms.
- **Mostly critical path:** 80–90% of the rooms.
- **Every room is about the same size**, and in Lanternroot exactly the same.

That is a large part of why they read as "obvious".

**Top 5 rules** (all ten are in §6):
1. **The critical path through an area is ≤ 30% of its rooms.** Most of the area is there to be found, not to be
   passed.
2. **Every dead end pays** something that changes play, or holds a rest or a way home. About a quarter of all rooms
   are dead ends.
3. **Show ≥ 2 locks for every open exit**, and show the final goal within the first 15 minutes.
4. **Build a ladder:** long halls stacked in tiers, tied together by 2–3 tall junction shafts with 5–6 exits each.
   Make one loop per 6–10 rooms, and open every shortcut back into the busiest junction.
5. **Mix the room sizes on purpose.** Use roughly 10% single screens, 30% long halls, 15–20% tall shafts and 10–15%
   big set pieces. Never make every room the same size.

---

## 1. Maps and data used

All files are in `shots/reference/maps/hollow-knight/` (gitignored), with every URL in `sources.txt` there.

| file | what | source |
|---|---|---|
| `hk-world-terrain-z4.png` (4096²) | **Room-accurate terrain map of all Hallownest**, stitched from in-game screenshots | hallownest.net interactive map (The Embraced One), tiles `lorthiz.github.io/MapRealm-HollowKnight/0/4/{y}/{x}.webp` |
| `hk-opening-terrain-z6.png` (8192×3072) + `hk-crossroads-…`, `hk-kingspass-dirtmouth-…`, `hk-greenpath-terrain-z6.png` | The same map at 4× detail over the opening areas | same, zoom 6 |
| `hk-world-marked.png`, `hk-world-clean.png` (4498×2901) | The full in-game (Cornifer) map, with and without markers | hollowknight.wiki `File:Hallownest_marked_map.png`, `File:Clean_map_updated.png` |
| `hk-world-benches.png`, `-grubs`, `-charms`, `-relics` | In-game map with every bench / grub / charm / relic marked | hollowknight.wiki `Mapshot_HK_*` |
| `hk-crossroads.png`, `hk-greenpath.png`, `hk-kings-pass.png`, `hk-dirtmouth.png` | Per-area in-game maps | hollowknight.wiki `*_Map_Clean.png` |
| `ss-world-marked.png`, `ss-world-clean.png` (5514×4096), `ss-world-benches.png` | Silksong full map | hollowknight.wiki `Silksong_Full_Map_*`, `Mapshot_SS_Benches` |
| `ss-moss-grotto.png`, `ss-bone-bottom.png`, `ss-marrow.png` | Silksong opening areas | hollowknight.wiki `*_Map_Clean_Textless.png` |
| `data/hk-rando-*.json` | **Every HK room door**, its target, one-way flags, map area, and the logic for what each door and item needs | homothetyhk/RandomizerMod |
| `data/hk-tangledmapview-mapData.js` | Room names, plus door, item and bench coordinates in Unity units | sirbrialliance/TangledMapView |
| `data/ss-rando-scenes.json` | **Silksong scene width × height in Unity units** | timothymarriott/Silksong-Rando |
| `data/*.py` | The analysis scripts (graph metrics, sizes, stitching) | mine |

(The fandom wiki's image CDN blocks scripts with a Cloudflare challenge. The same files come from hollowknight.wiki,
whose `mw/api.php` lists them.)

**Units and the screen.**
- HK draws 64 px per unit at 1080p, so one screen is ~30 × 17 units. The knight runs at 8.3 u/s, so it crosses a
  screen in ~3.6 s.
- Wing runs at 576 px/s, so she crosses a 1920 px screen in 3.3 s. **A screen is about the same amount of travel in
  both games**, so screen counts compare directly.
- Cross-check: on the terrain map, the Dirtmouth bench-to-well distance (52.6 units in the data) and the size of the
  knight on the bench agree with 30 units per screen within ~10%.
- HK room sizes are the bounding box of each room's doors, items and benches, plus 6 units of headroom. That is a
  lower bound on the room, and an upper bound on its *playable* area for L-shaped rooms.
- Silksong sizes are the scene bounds from the game. They are larger than the playable space, so don't compare them
  1:1 with HK's.

---

## 2. The whole world (Hollow Knight)

| | value |
|---|---|
| rooms with doors (excl. shop/house interiors) | **338** (362 incl. interiors), 892 doors |
| map areas | 15 |
| mean exits per room | **2.41** |
| exits-per-room mix | 1: 27% · 2: 33% · 3: 24% · 4: 10% · 5+: 6% |
| dead ends | **90 / 338 = 27%** |
| independent loops (links − rooms + components) | **60**, one per ~5.6 rooms |
| one-way doors (by data) | 16 (most one-ways are *inside* rooms: drops, breakable floors, shortcut walls) |
| benches | 47, one per ~7 rooms |
| room sizes (bounding box) | 2795 screens in total, mean 8.3 a room. Mix: 11% single, 20% medium, 17% long halls, 18% tall shafts, 34% big |
| vertical:horizontal room extent | 0.86 (Crossroads) and 0.80 (Greenpath) early; 1.3–1.5 later (City of Tears 1.54, Fungal Wastes 1.41, Deepnest 1.31) |

**Shape.** Dirtmouth is a surface town at the top centre. Directly under it is the Forgotten Crossroads, the hub
area, which borders 6 areas.
- The rest of the world rings outward from there. The nearest room of each area, in room hops from Dirtmouth:
  - Crossroads 1;
  - Howling Cliffs 1;
  - Crystal Peak 1 (locked);
  - Greenpath 4;
  - Fog Canyon 6;
  - Fungal Wastes 6;
  - Resting Grounds 9;
  - Queen's Gardens 11;
  - City of Tears 12;
  - Deepnest 14;
  - Waterways 15;
  - Kingdom's Edge and Ancient Basin 21.
- Mean distance from Dirtmouth is 12.7 hops (max 26). Hop distance roughly tracks the order you are meant to reach
  each area.
- The **stag network** (11 stations) and the **tram** collapse those distances later. A ring world, with a hub at
  the top and a fast-travel graph laid on top of it.
- City of Tears is a second hub in the middle (it borders Fungal, Waterways and Kingdom's Edge; Resting Grounds by
  lift).
- **The spine** is the vertical line under Dirtmouth: well → Crossroads → (Fungal) → City → Waterways → Basin → the
  Abyss. The game ends at the bottom of the world, under the place it starts.

---

## 3. The opening, area by area

### 3.1 King's Pass (1 room) and Dirtmouth (1 room + 7 interiors)

```
  (sky)                                             DIRTMOUTH ~9 x 5 screens, flat
    |  fall in (one-way)                           [Elderbug][bench][Sly*][Iselda*][stag*] [well] ... ► Crystal Peak (locked)
  ┌─┴──────────────────────────┐   ledge drop:          |                             |
  │ KING'S PASS ~6 x 5 screens │── one-way until ──────►|                             ▼ drop
  │ 3 tiers, worked left→right,│   claws                                    FORGOTTEN CROSSROADS
  │ top to bottom              │
  │ ↑ Howling Cliffs exit:     │   * opens later (Sly rescued in the Crossroads, Iselda after Cornifer,
  │   seen at once, needs claw │     the stag once you ride in from the Crossroads)
  │ (spike pit: Fury, hidden)  │
  └────────────────────────────┘
```

- **King's Pass is a single room** (~194 × 88 units, ~6 × 5 screens) and lasts ~3–5 min *(guess)*. In that one room
  the data lists **16 things**:
  - the 3 slash prompts;
  - the Focus tablet;
  - 3 lore tablets;
  - 5 geo deposits (1 behind a hidden wall, 1 in a collapse);
  - the Fury of the Fallen charm in a spike pit;
  - a lifeblood cocoon up a hidden way;
  - a Grimm flame (late game).

  You fall in from the sky (`top1` is out-only). The exit up to Howling Cliffs (needs claws or wings) is **the first
  lock, shown in the first minute**. The way out into Dirtmouth is a ledge drop you can't climb back until you have
  claws.
- **Dirtmouth** is a ~9 × 5-screen strip on the surface, a ~30 s walk end to end. It's a valley:
  - quiet, no enemies;
  - a bench;
  - Elderbug;
  - shuttered houses that open later (Sly, Iselda, Bretta, Jiji, the stag);
  - the well.

  It's 1 hop from the hub area and stays the game's emotional home. The Crystal Peak exit on its east edge needs
  claws, wings and Crystal Heart: a second lock in view from minute 5.

### 3.2 The Forgotten Crossroads (the hub area)

**Size and shape.**
- **41 rooms** (plus 4 interiors), ~163 screens by bounding box (~100 playable *(guess)*). The area spans ~20 × 12
  screens.
- **The ladder:** four tiers of long horizontal halls stacked on top of each other and tied together by a few tall
  shafts. The busiest junctions are shafts:
  - `07` Platforms: 6 exits, 1.5 × 6.7 screens;
  - `03` Outside Stag: 6 exits, 1 × 4.6;
  - `27` Outside Tram: 4 exits, 1 × 4.3.

```
 schematic, not to scale (room numbers are Crossroads_NN; not every link drawn)   ║ = tall junction shaft
                                  DIRTMOUTH
                                     │ well (the entrance drop)
 [38 Grubfather]─┐   ┌──────────── 01 well room ── 02 ── 39 ── 14 ──┬── 48 [grub]
   (dead end)    07══╡             (big, 3x3)      │            │  └── 45 Myla ─► Crystal Peak (lock)
 Greenpath ◄─11 ═╣   └── 05 [grub] ── 40 ── 16 ───(│)───────────┘
 (Baldur gate)   ║                                 └─ [Black Egg Temple: bench + the FINAL DOOR]
     36 ── 25 ═══╣
     │           ║                            16 ══03══ 47 stag [bench, dead end]
     │           ║                                 ║╲── Dark toll (lantern) ─► Crystal Peak (lock)
     09 Mawlek ═>33 Cornifer (MAP) <═ pillar ═ 06 ── Ancestral Mound [bench, Vengeful Spirit]
   (opt. boss,    ║  ╲                          │
    mask; its     12   08 Aspid hunters ──30 Hot Springs [bench]
    wall opens    │     │  ╲                    10 FALSE KNIGHT ── 21 ── 03   (21 ↑ 22 Glowing Womb: claws)
    into 33)      35    18  13 Goam [mask: claws]
            [grub;acid] │    ╲                  03 ── 15 ── 27══ 46 tram (lock) / 31 spike-pogo grub
            ▼ Fog Canyon ▼ Fungal Wastes  42 ── 19 ── 04 GRUZ MOTHER (opt.) + Salubra [bench] ─► Resting Grounds (lock)
            (lock)       (open drop)           ╲
                                               43 ── 49 lift ── 37 [vessel fragment]
```

**Measurements (from the door data).**

| | Crossroads | Greenpath |
|---|---|---|
| rooms (excl. interiors) | 41 | 33 |
| internal links | 45 | 36 |
| **independent loops** | **5** (one per 8 rooms) | **4** (one per 8) |
| mean exits per room | 2.46 | 2.36 |
| exits mix: 1 / 2 / 3 / 4 / 5+ | 10 / 17 / 6 / 4 / 4 | 6 / 13 / 11 / 2 / 1 |
| **dead ends** | **10 (24%), all pay** | **6 (18%), all pay** |
| exits to other areas | 11 | 6 |
| hops from the entry: mean / max | 4.3 / 9 | 6.2 / 11 |
| **hops to the nearest bench: mean / max** | **2.0 / 4** | **1.6 / 4** |
| benches | 5 (Black Egg Temple, Ancestral Mound, Stag, Hot Springs, Salubra) | 6 (entry, Toll, Sheo, Stag, a dead-end bench, Lake of Unn) |
| bounding-box screens / mean per room | 163 / 4.0 | 184 / 5.6 |
| room mix: single / medium / hall / shaft / big | 5 / 15 / 11 / 6 / 4 | 4 / 6 / 12 / 6 / 5 |
| vertical : horizontal extent | 0.86 | 0.80 |
| boss-class fights | False Knight; optional Gruz Mother, Brooding Mawlek; Aspid hunters (mini) | Hornet; Moss Knight, Vengefly King, Massive Moss Charger (mini/optional); No Eyes (late) |

**What the dead ends hold** (all 16 across both areas):

| area | dead end | what's there |
|---|---|---|
| Crossroads | Grubfather | the grub reward room |
| | Glowing Womb | a charm |
| | 2 grub rooms | a grub each |
| | the vessel-fragment room | a vessel fragment |
| | Hot Springs | a bench and the spa |
| | Stag | a bench and fast travel |
| | Ancestral Mound | a bench, a spell, a charm |
| | the tram stop | travel |
| | the Goam pocket | geo, and a dive floor later |
| Greenpath | the Hunter | the bestiary |
| | Thorns of Agony | a charm |
| | Stag | a bench and fast travel |
| | the mask-shard room | a mask shard |
| | the "Dead End Bench" | a bench |
| | Unn | a charm |

**The way on is short. Shortest paths on a first visit (locked doors removed):**

| from the well (`01`) to | hops | path |
|---|---|---|
| Cornifer (the map) | **2** | 01 → 07 → 33 |
| Grubfather | 2 | 01 → 07 → 38 |
| **Greenpath (next area)** | **2** (+2 to its bench) | 01 → 07 → 11 → Greenpath |
| Stag station | 6 | 01 → 02 → 39 → 14 → 16 → 03 → 47 |
| **False Knight (first boss)** | **7** | 01 → 02 → 39 → 14 → 16 → 03 → 21 → 10 (the long way round: its west door only opens after the fight) |
| Gruz Mother (optional boss) | 7 | … → 03 → 19 → 04 |
| Ancestral Mound (spell) | 9 | through the False Knight, then west |
| Hornet (Greenpath's boss, cloak) | 11 | 01 → 07 → 11 → 8 Greenpath rooms |

So the next ability (the cloak) needs **3 of the Crossroads' 41 rooms (7%)** and 9 of Greenpath's 33 (27%). The
first boss isn't on that path at all. The area is explored because it's *there*, and because Cornifer's map 2 rooms
in shows how much more there is.

**Shortcuts and one-ways.**
- **Two one-way shortcuts, and both open into Cornifer's room (`33`), the area's busiest junction:**
  - the Shaman pillar, opened from the Ancestral Mound side after the False Knight;
  - the Mawlek wall, opened from the Mawlek side.
- The well is a drop with climbable platforms. King's Pass → Dirtmouth is one-way until claws. The False Knight's
  floor gives way under you.
- Each shortcut turns a long way round into a 2-room hop back to the map room.

**Busiest rooms** (share of all room-to-room shortest paths that pass through them):

| room | share | role |
|---|---|---|
| `03` Outside Stag | 37% | 6 exits; the stag station is next door |
| `33` Cornifer | 32% | 5 exits; the map |
| `07` Platforms | 27% | 6 exits; under the well, and the way to Greenpath |

In the first two hours the player passes through `07` and `01` on every trip between Dirtmouth and Greenpath:
~5–8 times *(guess)*, from 4 different sides.

**Locks the Crossroads shows.** Of 11 exits to other areas, **3 are open at first**:
- up to Dirtmouth;
- west to Greenpath (a Baldur the nail can kill);
- down to Fungal Wastes.

**8 read as locks:**
- the acid to Fog Canyon;
- the dark toll to Crystal Peak (lantern);
- Myla's way to Crystal Peak;
- the claw ledge to Resting Grounds;
- the tram (needs a pass);
- the lift;
- the stag (before you ride it);
- **the Black Egg Temple door, the game's last door, one room from the well with a bench in front of it**.

Inside the area, the Glowing Womb and the Goam mask also wait for claws.

### 3.3 Greenpath (the first "proper" area)

```
 schematic, every link drawn (room numbers are Fungus1_NN). Entry from the Crossroads at the EAST; the far west
 and the south wait for the cloak.
                                        Howling Cliffs ▲
                                        20 VENGEFLY KING (6 x 1 hall)
                                         │            ╲
 Unn ── 26 Lake of Unn ── 25 ── 04 HORNET ── 21 ─────── 32 MOSS KNIGHT
 (charm) (shrine bench)         (cloak)      │           │
                               stag 16 ──── 22 (1 x 7.5) 31 TOLL BENCH (1 x 8 shaft) ── 03 ── 17 ── 02 ── 01b BENCH ── 01 ◄ Crossroads
                                             │           │                              │            │
                Sheo 15 ── 09 (8 x 1 hall) ─ 30 ─────────┘                Thorns 14 ── 05           06 CORNIFER (map, grub)
                                             │                                          │            │
                                             10 (6 x 1.5 hall) ─────────────────────────┘            07 ── 08 Hunter (journal)
                                             │                                                       │
                                             19 ─────────────────────────────────────────────────────┘
                                             │
         Queen's Gardens ◄ 13 ── 12 ── 29 ── 11 ── 34 ── 35 No Eyes ── 36 [mask]
            (vessel, grub)                   │ ╲
                                  Fog Canyon ▼  37 dead-end bench
```

- Greenpath is 33 rooms, ~184 bounding-box screens, ~60–90 min for a first-timer *(guess)*. It's wider and flatter
  than the Crossroads (vertical:horizontal 0.80), with **12 long halls** (one in three rooms) and 6 tall shafts:
  - the Toll Bench shaft (8 screens);
  - Outside Stag (7.5);
  - the shafts to Unn and to the lower halls (5.4 each).
- **The first bench is 1 room in. Cornifer is 4 rooms in.** No room is more than 4 hops from a bench.
- The critical path (entry → Hornet) is 8 hops and climbs the 8-screen Toll Bench shaft in the middle. The 24 other
  rooms are the south halls, the west lake, Sheo, Unn and No Eyes, mostly opened by the cloak or later.
- Optional fights are dense: Moss Knight, Vengefly King and Massive Moss Charger sit just off the path. Hornet is
  glimpsed before she is fought.

### 3.4 Pacing on the map, the first two hours *(times are a guess for a first-timer)*

| time | where | beat | kind |
|---|---|---|---|
| 0:00 | King's Pass | Fall in. Slashes, crawlids. The Cliffs exit overhead (lock 1). Focus tablet | tutorial, dense |
| 0:03 | King's Pass | (Optional) the spike pit to Fury, a hidden wall | first secret |
| 0:05 | Dirtmouth | The drop: no way back. Quiet town, Elderbug, the first bench | **valley** |
| 0:08 | the well | A long drop into the dark | threshold |
| 0:09 | Crossroads `01`–`02` | First enemies. **The Black Egg Temple: bench + the last door** (1 room in) | **set piece**, goal shown |
| 0:12 | `07` → `33` | Follow Cornifer's humming and paper; the map | orientation |
| 0:15–0:40 | the web | Grubs, Aspid hunters, Goam, Grubfather; maybe Gruz Mother (opt. boss); the stag | wander |
| ~0:35 | `10` | **The False Knight** (drops from above; the floor breaks after) | **peak** |
| ~0:45 | Ancestral Mound | A spell; the pillar shortcut back to the map room | reward + loop |
| ~0:55 | `11` → Greenpath | The Baldur gate; **bench 1 room in** | new area |
| 1:00–1:40 | Greenpath | Cornifer again; long halls; Moss Knight; optional bosses; the toll bench | wander |
| ~1:40 | `04` | **Hornet**: the cloak. Every dash gap seen in 2 areas now opens | **peak**, re-gate |

**Gaps between beats.**
- Benches: ~5–10 min apart.
- Real fights: one every ~10 rooms.
- An ability: about every hour. Before the cloak the player gets a spell (~45 min) and the map (~12 min).

**Quiet rooms** sit in dead ends and nearly always hold a bench: the Black Egg Temple, Hot Springs, the Stag, the Lake
of Unn shrine.

**Screens per minute** *(estimate)*: ~1.5–2.5 new screens a minute while exploring, ~0.5–0.7 new rooms a minute.
King's Pass is denser: ~16 things in one room in ~4 min.

---

## 4. Silksong's opening

Maps: `ss-world-marked.png`, `ss-moss-grotto.png`, `ss-bone-bottom.png`, `ss-marrow.png`.

Scene sizes: `data/ss-rando-scenes.json`. These are scene bounds, so they run larger than HK's room extents. I had no
door table, so loops and exits below are read off the maps.

```
                                   (the rest of Pharloom climbs UP from here: Shellwood, Bellhart, the Citadel on top)
                         Mosshome (Silkspear)        ▲
                           ┌──────┐   tall shaft ~8+ screens (the spine, seen from the village)
 Bonegrave ── BONE BOTTOM (hub village: bench, shop, Pinmaster…) ══ THE MARROW (4-tier warren, ~25 x 6 screens)
                 ▲ climb                                   ║   └── Bell Beast (long hall arena 6.7 x 1.3) ─ Bellway
            MOSS GROTTO (start, ~6 scenes, Moss Mother)    ╠══► Deep Docks (SE) · Hunter's March (E) · Far Fields
                 (the lowest point of the world)           ╚══► up to Shellwood / Bellhart
```

| area | scenes | sizes | notes |
|---|---|---|---|
| **Moss Grotto** (`Tut_*`) | 6 | 3–10 screens wide, 2–9 tall | Near-linear, one small loop. The start is the **lowest point on the whole map**. Ends at the first boss and a climb |
| **Bone Bottom** (`Bonetown`) | 1 (+1 boss variant), plus Bonegrave west | 10.5 × 5.3 screens | **The hub village, ~10–15 min in** *(guess)*. Bench, shop, the townsfolk. Sits at the foot of the tall shaft and the Marrow |
| **Mosshome** (`Mosstown_*`) | 4 | includes a 1 × 8.6-screen shaft | A side branch up off the hub's shaft: the first tool (Silkspear) is **off the main line** |
| **The Marrow** (`Bone_01`–`19`) | ~22 | ~263 bounding-box screens, ~12 a scene | A wide, low warren of 4 stacked tiers. Many loops. Exits on 3 sides. The Bell Beast arena is a long flat hall |

**What Silksong adds to HK's lessons:**
- **The start is the bottom of the world, and the whole game climbs.** The direction (up, to the Citadel) is the
  spine. The hub's huge shaft shows it from minute ~10. HK did the mirror image: start on top, end at the bottom.
- **A short linear tutorial area (~6 rooms) hands off to a hub *village* within ~15 min,** and the hub opens three
  ways at once. HK's equivalents are 1 room plus a town.
- **The first optional tool sits on a side branch**, so the critical path never hands it over.

---

## 5. What the numbers say about level size

For a first 20–40 minutes, HK shows:
- King's Pass and Dirtmouth;
- **~15–25 Crossroads rooms**, 60–100 screens, about half of which the player needs for nothing yet;
- 5 benches, 3 open exits and ~8 visible locks;
- 1 boss and 1–2 optional ones;
- a map;
- a spell.

Our two levels, for comparison:

| | HK Crossroads | wood area 1 (built) | wood area 1 v3 | Lanternroot |
|---|---|---|---|---|
| rooms (or chambers) | 41 | 13 | ~15 | 10 (9 chambers + the cache) |
| screens (bounding box) | 163 | ~73 | ~85 | ~14 |
| mean exits per room | 2.46 | 2.15 | ~2.3 | 2.6 |
| loops | 5 (1/8 rooms) | 2 | ~3 | 4 (it's a 3 × 3 grid) |
| dead ends / with a reward | 24% / 100% | 2 / 0 (start, end) | ~4 / all (C1, C2, cache, R3 hollow) | 1 room + pockets / all |
| rooms on the critical path | **7%** (to the next ability) | ~100% | ~80% | **~80%** (8 of 10) |
| room size mix | 5 single / 15 med / 11 hall / 6 shaft / 4 big | 1.3–5.9 wide, 0.9–3.9 tall: varied | varied | **all 10 identical** (1 × 1.4 screens) |
| benches; max hops to one | 5; 4 | ~3 patches | ~4 patches | 4 patches; 2 |
| locks shown in the first 10 min | ~8 | ~1 | ~3 (mesh, crack, trunk) | ~5 (good) |

Per-room size is fine in the wood: Wing and the knight cross a screen in about the same time. The problems are:
- **count:** too few rooms;
- **topology:** everything is on the path;
- **in Lanternroot, sameness:** every chamber is the same box, and all of them sit within one hop of each other.

---

## 6. The ten rules

Each rule has a check a designer can run on a map.

**R1. The critical path through an area is ≤ 30% of its rooms.**
- Evidence:
  - the Crossroads needs 3 of 41 rooms for the next ability (7%);
  - Greenpath needs 9 of 33 (27%);
  - the first boss isn't even on the path to the next area.
- Check: count the rooms on the shortest path from the entry to the next ability or exit, and divide by the area's
  rooms.

**R2. Every dead end pays, and about a quarter of all rooms are dead ends.**
- Evidence:
  - Crossroads: 10 of 41 rooms; Greenpath: 6 of 33; world: 27%;
  - 16 of 16 opening dead ends hold a charm, mask, vessel, grub, spell, bench, stag, NPC or travel.
- Check: list the degree-1 rooms; each must hold an upgrade, a bench, travel, or an NPC with a use.

**R3. Show ≥ 2 locks per open exit, and the final goal within the first 15 minutes.**
- Evidence:
  - the Crossroads has 3 open exits and 8 visible locks;
  - King's Pass shows the claw ledge in minute 1;
  - Dirtmouth shows the Crystal Peak route;
  - the Black Egg Temple door is 1 room past the well (~minute 9).
- Check: on the first walk-through, count the exits the player can see but not use, and the exits they can use.

**R4. Build a ladder: tiers of long halls tied by 2–3 tall junction shafts with 5–6 exits each.**
- Evidence:
  - Crossroads `07` (6 exits, 6.7 screens tall), `03` (6, 4.6 tall), `27` (4, 4.3 tall);
  - Greenpath's Toll Bench shaft (8 screens) and Outside Stag (7.5);
  - mean exits per room 2.4–2.5;
  - ~35% of rooms have 3+ exits.
- Check: the exits-per-room histogram should look like 25 / 40 / 20 / 15% for 1 / 2 / 3 / 4+ exits, with the top
  junctions being shafts.

**R5. One loop per 6–10 rooms. Loops are short (4–9 rooms). Every shortcut opens from the far side into the area's
busiest junction.**
- Evidence:
  - 5 loops in the Crossroads and 4 in Greenpath, about one per 8 rooms;
  - the Shaman pillar and the Mawlek wall both open into Cornifer's room;
  - the top three rooms carry 27–37% of all routes.
- Check: count links − rooms + 1. List each shortcut's target room and its betweenness rank.

**R6. A bench (rest) within 2 rooms of every area entrance, and never more than 4 room-hops from any room.**
- Evidence:
  - Crossroads: mean 2.0 hops to a bench, max 4;
  - Greenpath: mean 1.6, max 4, and the first bench 1 room in;
  - Dirtmouth's bench sits right before the descent;
  - the Black Egg Temple bench is 1 room after it.
- Check: BFS from the bench rooms.

**R7. Quiet rooms are dead ends with a rest.**
- Valleys are placed off the path, so the player chooses when to breathe.
- Evidence: the Black Egg Temple, Hot Springs, the stags, the Lake of Unn shrine, and Dirtmouth itself (no enemies,
  a bench).
- Check: every rest room is a dead end or a hub, and has no threat in view.

**R8. Mix room sizes on purpose: ~10% single screens, ~30% long halls (≥ 2.5 screens wide), 15–20% tall shafts
(≥ 2.5 tall), 10–15% big set pieces (≥ 2 × 2), the rest medium.**
- Evidence:
  - Crossroads: 12 / 37 / 27 / 15 / 10% (single / medium / hall / shaft / big);
  - Greenpath: 12 / 18 / 36 / 18 / 15%;
  - the first boss room is big (2.5 × 3.7 screens);
  - the first town is 9 screens wide.
- Check: tabulate room w × h in screens.

**R9. The map is found early, near the start of each area, but not handed over.**
- Evidence:
  - Cornifer is 2 rooms from the well (~minute 12), led to by humming and paper scraps;
  - Greenpath's Cornifer is 4 rooms in.
- Check: the map item is within the first 10–15% of the area's rooms by hop distance, and isn't in the entry room.

**R10. One spine, entered by a big vertical move. Early areas are wide (vertical:horizontal room extent ~0.8–0.9);
verticality grows later (1.3–1.5).**
- Evidence:
  - HK: the fall into King's Pass, the drop down the well, the spine straight down from Dirtmouth;
  - Silksong: the start at the bottom, and the hub's 8+ screen shaft up;
  - big vertical moves in the opening are concentrated in the few junction shafts.
- Check: sum room heights ÷ widths in screens. Mark the spine on the map, and check it's visible from the hub.

Two smaller observations worth keeping:
- **Density in the first room.** King's Pass holds 16 things in one 6 × 5-screen room: 3 prompts, 2 hidden ways and
  an optional hard bit.
- **A tutorial area (1–6 rooms) hands off to a hub town within 5–15 minutes**, in both games.

---

## 7. What each rule would have changed

**Wood area 1 v3** (`docs/design/regions/wood-area1-v3.md`):

| rule | what it would have changed |
|---|---|
| R1 critical path ≤ 30% | v3's main line runs R1 → R2 → R3 → R4 → R5 → R6 → oak → R8 → R9 → roots → den → trunk → crown, ~12 of ~15 rooms (80%). Fix: make the oak reachable within ~3 rooms of the vista. Make the way on (the den) 2–3 rooms from the oak. Let R3–R6 become a side web (glade, glidewalk, burrow) the player can skip or wander. Add rooms off the path rather than lengthening it |
| R2 dead ends pay, ~25% | v3 has ~4 dead ends (C1, C2, the cache, R3's hollow), all paying. Good. At ~15 rooms it wants ~4; at HK scale (~30 rooms) ~7–8. The built version's only dead ends are the start and the end |
| R3 locks ≥ 2 per open exit; the goal shown | v3's oak hub shows the mesh, the crack and the trunk: about 3 locks against 2–3 open ways. Add locks that open *later in the game*, not later in the area: a ledge for the valley's ability, a dark tunnel, a sealed door to the mountain. Show the migration cave or mountain (the story's end) from the vista, not only the oak |
| R4 ladder with junction shafts | The bowl is three layers (canopy, floor, roots), but only the oak links them. Add 1–2 more tall shafts that each tie 3 layers (e.g. a hollow trunk at R4/R5, a root shaft under R8). Each should have 4–6 exits |
| R5 loop per 6–10 rooms; shortcuts into the junction | v3's shortcuts (the crack, the crown-window drop, R6's high bough) already open into the oak. Good. It needs ~2 loops that don't go through the oak, e.g. R4 → roots → R8, so the web isn't a star |
| R6 rest within 2 rooms of entry, ≤ 4 hops | Patches at R1, R5 (glade), the oak and the den pass. Check: is any room > 4 rooms from a patch? (C2 off the trunk, the roots) |
| R7 quiet rooms are dead ends with a rest | v3 puts its valleys *on* the path (the glade, the oak, the roots), so they are imposed, not chosen. Move one rest into a side dead end (a hollow with a patch and a view) |
| R8 size mix | Built sizes already vary (1.3–5.9 screens wide). v3 needs one more big set piece besides the oak (the clearing, R8, at ≥ 2 × 2) and one true single-screen room (the cache is the candidate) |
| R9 map near the start, found | v3 hides the moth-stone behind the oak's bark (~minute 10+). R9 says closer: within the first 10–15% of rooms, led to by a sound or a trail (HK's humming), not hidden behind a breakable wall |
| R10 one spine, a big vertical entrance | The hatch → chase downhill is the entrance drop. The spine should be the oak's trunk (floor → crown), seen from the vista. v3 already does this; keep it |

**Lanternroot** (`docs/design/levels/proto-1.md`):

| rule | what it would have changed |
|---|---|
| R1 critical path ≤ 30% | The path is A1 → A2 → A3 (Kindle) → A2 → B2 (seal) → B3 boss → C3 → C2 → chimney → C1: 8 of 10 chambers, every chamber a step of the solution. HK would put the Kindle hollow and the boss 2–3 rooms from the start in a ~25-room web, with most of the web optional |
| R2 dead ends pay | The H1–H3 pockets, the cache and the ember run all pay (good). But they are pockets *inside* chambers, so the map has 1 dead-end room. Make 2–3 of them real side rooms off a junction, so the map reads as having branches |
| R3 locks ≥ 2 per open exit | Lanternroot's best feature: the seal, the shaft, the curtain, the brambles, the vault, all visible early. But every lock opens within 25 minutes and the same level. Add 2–3 locks that stay shut (they wait for the next level's tool). An HK area's locks mostly point *out of the area* |
| R4 ladder with junction shafts | A 3 × 3 grid of identical 1 × 1.4-screen chambers has no long halls and no tall shafts. Every chamber is one hop from its neighbours, so there is no sense of distance or of a spine. Rebuild as tiers: the trunk's hall as one ~6-screen hall, the roots as 2–3 halls of different lengths, and the root plate as one 1 × 5-screen shaft with 5 exits. That shaft is the junction |
| R5 loop per 6–10 rooms | 4 loops in 10 chambers is too many. Every route is short, so getting lost and then suddenly knowing never happens. One or two loops at this size; more as it grows |
| R6 rest within 2 rooms, ≤ 4 hops | 4 patches in 10 chambers (max 2 hops) is generous, and fine for a prototype. At HK spacing the level would carry 2 |
| R7 quiet rooms are dead ends with a rest | The quiet minute (A3's black water) is forced on the critical path. Make it a choice: put the Kindle hollow at the end of a branch the player has to want to enter |
| R8 size mix | All ten spaces are the same size, which alone makes it monotone. Target for 10 rooms: 1 single (the cache), 3 halls (one 6+ screens), 2 tall shafts, 1 big set piece (the Gloam arena at 2 × 2), 3 medium |
| R9 map near the start | The moth-stone in A2 (1 room in) fits HK's distance, but HK *leads* you there by sound. Keep it close; give it a trail rather than "look up" |
| R10 spine, big vertical entrance | The giant's fall (crown → trunk → plate) is a strong spine, and the split from night to hall is the entrance drop. But the layers are stacked boxes of equal height. Make the plate's chimney the one tall vertical moment (5+ screens), seen from the spawn (the doc already wants this sightline) |

**Overall.**
- The wood's problem is mostly **R1** (everything is the route) and **R3/R7** (no locks pointing beyond, and valleys
  imposed).
- Lanternroot's is **R4/R8** (one room shape, a grid with no distance) and **R1**.
- Both are **too small to have a web.** HK's first 30 minutes cover 15–25 rooms. If we keep levels at 10–15 rooms,
  we need R1 more than anything: let the path be 3–4 of them and the rest be found.

---

## 8. Caveats

- **The randomizer's door table.** It omits boss-arena variants, dream rooms and some cosmetic rooms, so "rooms" is
  rooms with doors.
- **Hops are room hops, not distance.** One hop through `07` can be 7 screens of climbing.
- **"Locks" are counted from the logic.** Some, like the tram and the stag, are "not yet" rather than an ability gate.
- **Silksong scene names map to areas only by prefix** (`Tut` = Moss Grotto, `Bonetown` = Bone Bottom, `Bone_` = the
  Marrow, `Mosstown` = Mosshome). Its loop and exit counts are read off the maps, not computed.
- **All times are a first-timer guess**, not measured.
