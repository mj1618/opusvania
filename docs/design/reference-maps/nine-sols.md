# Nine Sols: how the map is laid out (the world, and the opening through the first boss)

2026-10-20. One researcher's pass for `BRIEF.md`. Counts come from map data. Screen sizes and times are estimates and
are marked **(guess)** or **(est.)**.

## The maps and data I used

All files are in `shots/reference/maps/nine-sols/` (gitignored). Sources are in `sources.txt` there.

| file | what | source |
|---|---|---|
| `New_Kunlun_Zone_Map.png` (4701 × 1817) | the in-game zone map: 12 zones as boxes, the hub tree in the middle, the transit lines between them | ninesols.wiki.gg, Locations page |
| `New_Kunlun_Map.png` (9269 × 1847) | the in-game location map, every area drawn (marked WIP on the wiki) | ninesols.wiki.gg |
| `ninesolsmap_z13_with_markers.png` (6912 × 1536) | the whole world stitched from the interactive map's tiles, with all 364 markers drawn on (green root nodes, red bosses, orange mini-bosses, yellow chests) | ninesolsmap.com tiles and its `/api/markers` |
| `ninesolsmap_z14_opening_with_markers.png` (4608 × 2304) | the opening region at 2× zoom, with markers labelled | same |
| `ninesolsmap_markers.json` | the 364 markers: type, position, description | ninesolsmap.com |
| `crop_*.png` | the Apeman Facility, the Central Hall and Transport Hub, the Power Reservoir, the Radiant Pagoda at 4× | my crops |
| route | intoindiegames walkthrough parts 1–3, wiki pages (Locations, Kuafu) | text |

**The unit.** Nine Sols scrolls, so there are no map tiles to count. I took the Radiant Pagoda's boss arena as a
yardstick. It's about 1 screen tall and about 2 wide, which makes one screen about 125 × 70 px on the z14 map
**(est., ±30%)**. Screen counts below are map area divided by that, including the faded background bands, so they
run high.

---

## 1. The world in numbers

| | count | note |
|---|---|---|
| zones | 12 | Livestock, Apeman Facility, New Kunlun Hub, Power Reservoir, Agricultural, Warehouse, Abandoned Mines, Transmutation (Factory), Central Core, Empyrean, Grotto, Research Institute |
| locations | ~40 | each zone has 2–5 named locations |
| root nodes (save, heal, fast travel) | **36** | "Most zones contain one Root Node per Location" (wiki) |
| bosses | 8 on the map (11 in the boss list) | Yingzhao, Goumang, Yanlao, Jiequan, Lady Ethereal, Kanghui, Ji, Fuxi & Nuwa (+ Eigong etc.) |
| mini-bosses | 12 | Red Tiger Elites, Celestial Spectres and Sentinels, etc. |
| all markers | 364 | 73 chests, 59 collectibles, 45 data/lore, 18 Tao fruits, 18 parry robots, 17 jades, 15 artifacts… |
| length | ~20 h main, 30–35 h for 100% | secondary sources |

- **About 10 markers per root node.** Every location packs: one node, 2–3 chests, 1–2 lore entries, a parry robot or
  hack point, and often a mini-boss.
- **The world is islands joined by transit.**
  - On the zone map, the hub (the Central Hall, with the Four Seasons Pavilion above it, drawn as a tree) sits in
    the middle.
  - The zones hang west (the Factory, the Warehouse, the Mines), east (Agriculture, the Grotto, Research), up (the
    Empyrean District, Tiandao) and down (the Power Reservoir, the Apeman Facility).
  - Nearly every zone-to-zone link is an **elevator or a transporter**, drawn as a dotted line. The map pieces don't
    touch the way Super Metroid's rooms do.
- **Every boss sits at the far end of its zone.** For example, Goumang is at the Agrarian Hall, the east end of the
  map. Root-node fast travel takes you home afterwards.
- **One exception** puts a late boss (Lady Ethereal) next to the Cortex Center node, beside the hub. A space you've
  passed for hours is recast.

## 2. The opening (≈ 0:00–2:30): from the village to General Yingzhao

### The route

| # | location | what happens | root node | time **(guess)** |
|---|---|---|---|---|
| 1 | **Peach Blossom Village** (the apeman village) and the underground cave | wake, Shuanshuan, movement and combo tutorial, the pig chase over water with the grapple. **A blocked path to the left, "return later"** | yes | 0:00–0:20 |
| 2 | The Ceremony | cutscenes with Ruyi and Shennong; the elevator down | — | 0:20–0:30 |
| 3 | **Apeman Facility (Monitoring)** | a charging enemy, a root node, a dash through lasers, a heavy enemy, a hacked elevator, the surveillance footage. An alarm sounds in the Livestock Area | Monitoring, Galactic Dock | 0:30–0:50 |
| 4 | **Apeman Facility (Elevator)**: the path to Baichang | a grapple ledge, **a gauntlet (locked arena)**, elevators down floor by floor, a moving platform, **a secret room off a drop**, "a spot you can't cross yet", a healing station | 2 nodes | 0:50–1:10 |
| 5 | **Red Tiger Elite: Baichang** (mini-boss) | parry exam; the Stasis Jade; dying sends you to Lear, who teaches combat | node ~4 screens before | 1:10 |
| 6 | **Central Hall → Four Seasons Pavilion** (the hub) | the elevator up; lore consoles; **Mystic Nymph** (scout and hack) to get in; Ruyi wakes; **the Pavilion becomes home**: jades, Shuanshuan, Shanhai. **Lear gives the Fusang Horn: fast travel between nodes** | Pavilion | 1:10–1:30 |
| 7 | **Central Transport Hub** | a Nymph-locked door, the elevator down (an ~11-screen shaft), a fight on the moving lift, a narrow corridor, a root node. **Lear teaches Tai-Chi Kick there.** Right next to it, the **Anomalous Root Node secret** uses the kick at once, and exiting it unlocks a door back to the elevator (a shortcut loop) | yes | 1:30–1:50 |
| 8 | **Power Reservoir (East)** | a transporter, hacked lasers, an elevator, **Kuafu calls**, a root node; **Celestial Sentinel Jiaoduan** (mini-boss; lure him into the lasers) | yes | 1:50–2:10 |
| 9 | **Power Reservoir (Central)** | a transporter (a call from Heng), a secret room behind a breakable wall, chains, a heavy enemy, the Steely Jade chest. **The light bridge is seen and dead**: Shanhai tells you to power it. **Chiyou the merchant** and a node. A hacking puzzle powers the bridge, then a gauntlet | yes | 2:10–2:30 |
| (opt) | Power Reservoir (West) | a node, Tao fruit, a recording, components | yes | — |
| 10 | **Radiant Pagoda** | the control data, a root node **~2.5 screens before the arena**, **General Yingzhao** (first boss; parry, then Tai-Chi Kick on his green-glow attacks). Then Kuafu, his memories, **the first Sol Seal** | yes | 2:30–2:45 |

### Measurements (est.)

| location | map footprint | filled area **(est.)** | markers | nodes |
|---|---|---|---|---|
| Apeman Monitoring (+ the Livestock strip above) | 8 × 4 screens | ~9 | 12 | 2 |
| Apeman Elevator | 6 × 4.5 | ~15 | 9 | 2 |
| Central Hall | 8 × 3 | ~9 | 5 | 0 |
| Four Seasons Pavilion | 7 × 4 | ~8–17 | 5 | 1 |
| Central Transport Hub | 8 × 11 (the shaft) | ~20 | 12 | 1 |
| Power Reservoir W / C / E | 31 × 4 together | ~80 (inflated by background) | 9 / 12 / 9 | 1 each |
| Radiant Pagoda | 7 × 1.3 | ~5 | 4 | 1 |

- **Opening total:** about 100–150 screens over about 2.5 h, so **~1 screen a minute**. That is about a third of
  Super Metroid's pace. Nine Sols spends its time on fights, not on distance.
- **Root nodes:** 10 on the way to the first boss (9 on the main path), one every **~15 minutes** and every **~10–15
  screens**.
  - Every mini-boss and boss has a node within ~4 screens of its door: Baichang ~4, Shangui ~2, Jiaoduan 0,
    Yingzhao ~2.5.
- **Fights that gate:**
  - 2 gauntlets (locked arenas);
  - 2 mini-bosses (Baichang, Jiaoduan) and 1 boss on the path;
  - Yanren, Lieguan and Shangui sit nearby and come later.

  So a gate fight comes every ~20–30 minutes, and a boss at ~2.5 h.
- **Verticality.**
  - Each location is a **horizontal band**: Power Reservoir is 31 screens wide and 4 tall.
  - The big vertical moves are **elevators between bands**: the village ↓ Monitoring, Elevator ↑ Central Hall,
    the Transport Hub's 11-screen shaft ↓ the Reservoir, the light bridge ↓ the Pagoda.
  - Within bands, play is multi-level (3–4 floors stacked), not a single corridor. Overall ratio **~1 : 3 vertical to
    horizontal (est.)**, with the vertical concentrated in 4–5 set-piece moves.
- **The hub.** The Pavilion is reached at ~1:10 and returned to after every Sol. Its NPCs change each time (Kuafu
  moves in after the first Sol). Fast travel arrives at the same moment, so **from 1:30 on, backtracking costs one
  menu**.
- **Gating seen in the opening:**
  - the village's blocked path;
  - the Elevator's uncrossable spot (an ability later);
  - the Depths' gap;
  - the Abandoned Mines ("explore later");
  - Lieguan's keycard (the Mines);
  - the dead light bridge (powered within the area: a local puzzle lock).

  That's about **one visible "later" per location**, while the main path itself is mostly linear.
- **The critical path versus the whole:** the opening's main path runs through about 8 of the ~11 nearby locations.
  Power Reservoir West, the Depths and the Mines are off-path. Inside locations, side rooms with chests and secrets
  take about 30–40% of the area **(guess)**.

### The layout

```
                                   [FOUR SEASONS PAVILION]  home: Ruyi, Shuanshuan, jades, Lear, fast travel (1:10)
                                             ║ lift
  ◀══ west: Cortex ▸ Factory ▸ Warehouse ══[CENTRAL HALL]══ east: Lake Yaochi ▸ Agriculture ▸ Grotto ══▶
  (Lady Ethereal beside the hub, late)       ║   ║ (lift up from Baichang's door)
                                             ║   ╚═[APEMAN ELEVATOR: 3 stacked floors, gauntlet, secret, BAICHANG]
   [PEACH BLOSSOM VILLAGE]═lift═[APEMAN MONITORING]══▶ Livestock / Galactic Dock ...
                                             ║
                                 [CENTRAL TRANSPORT HUB] ← 11-screen shaft; Tai-Chi Kick; Anomalous-node loop
                                             ║ transporter
          [POWER RESERVOIR  West ═══ Central (Chiyou, the console) ═══ East (Kuafu calls, Jiaoduan)]
             (optional)                 ╲ light bridge (seen dead, then powered)
                                    [RADIANT PAGODA: node → GENERAL YINGZHAO → Kuafu, Sol Seal 1]
```

## 3. The ten rules this map teaches

1. **One home hub, reached by ~1 h and returned to after every boss.** It holds the people who react to what you
   did. All zones are one transit hop from it.
2. **A save within 4 screens of every boss and mini-boss door**, plus one save per location (every ~10–15 screens or
   ~15 minutes). A retry costs seconds of walking, never a level.
3. **A zone is a horizontal band of 2–3 wings with its goal hanging off it.** The goal is seen early and dead (the
   light bridge, the Pagoda). Reaching it means 2 jobs in the wings: a hack, a gauntlet. The boss is at the far end.
4. **Teach a verb, then a secret uses it right next door, and the secret closes a loop.** *Tai-Chi Kick at the node →
   the Anomalous Root Node beside it → it exits through a door that opens back to the elevator.*
5. **Fights are the gates.** One locked-arena gauntlet or mini-boss every 20–30 minutes on the main path, a boss at
   ~2.5 h. Each is a different exam (the parry, the lasers, the kick on green glows).
6. **Vertical moves are set pieces between bands, not rooms.** Elevators, lifts that fight you, a light bridge. 4–5
   big ones in the opening, each a breath between two dense bands.
7. **One visible "later" per location**: a gap, a sealed door, a keycard lock, a "too far" ledge. The main path stays
   readable while the world promises more.
8. **Someone speaks in every location.** A call (Ruyi, Kuafu, Heng), a merchant (Chiyou), a robot (Shanhai), lore on
   consoles. The opening has ~15 story touches in 2.5 h **(guess, counted from the walkthrough)**: one every ~10 minutes.
9. **About 10 finds per save.** Chests, lore, a parry robot that unlocks a chest, a jade, a component. Finds cluster
   at side-room ends of each location, not on the main line.
10. **Fast travel comes early (at the hub, ~1:10)**, so the world can be wide (12 zones, 36 nodes) and areas can be
    islands linked by transit instead of one contiguous rock.

## 4. What each rule would have changed

| # | wood area 1 | Lanternroot |
|---|---|---|
| 1 Home hub, return after every boss | The oak is the hub, but nothing lives there that changes. **Put Tatter (and later others) at the oak**, reacting after the den and after the crown; send her back there after the boss (the crack shortcut) | B2 is a hub of exits but not a home. Make the B2 patch the place where freed moths gather and the firefly's lore plays back after each puzzle, so returning feels like coming home |
| 2 Save within 4 screens of every boss | The den's re-form is in the den (fine). The roots' walk is "a minute of dark" before it: put the last patch at the roots' end, ≤ 2 screens from the drop | Already met (B2 patch above the seal, ~5 s). Keep it |
| 3 Band + goal seen dead + 2 jobs | The crown is seen from the vista (good). Make the **oak's crown a seen-dead goal**, the mesh visible but sealed, and give the area two jobs that open it (the den, the clearing) | Strong fit: show the Pagoda-equivalent (the arena's moon-hole, or the root plate's crest) dead from the start, and make the seal and the guarded set the two jobs, each *needing* its tool (review #1) |
| 4 Verb → adjacent secret → loop | The fling's first secret should be next to its teaching room (R3), and exit back into R2's cave as a shortcut | Kindle → First Light is the teaching. Put a small kindle-only secret in A3 itself that loops back up to A2 (the stair already half does this) |
| 5 A gate fight every 20–30 min | Today: the beetle at ~4, the boss at ~24. Add one locked-arena fight at the clearing (~15 min) | The Gloamweaver at ~18 min, with nothing before. Add one gauntlet (the hall's west mouth when the seal opens), so the boss isn't the first real fight |
| 6 Vertical set pieces between bands | The wood is one long west→east band. Make the **drop into the roots** and **the trunk climb** the two set-piece verticals, and keep the rest horizontal | The three layers are bands already. Make each crossing a moment: the split as a moonlit fall, the chimney as a climbing set piece, not just 256 px gaps |
| 7 One visible "later" per location | Every wood room should show one thing she can't do yet: R4's shelf (v3), the mesh, the crack, R1's ridge. Audit: 1 per room | A1 (M-a1), B2 (the seal), C2 (grille, vault) have them. A2, A3, C3 need one each |
| 8 Someone speaks every ~10 min | v3 cut most of the held beats, rightly. Replace them with **non-holding** voices: firefly signs, Tatter's gestures, freed moths' chorus, about one per room | Signs S1–S4 exist; add a voice per chamber (a moth-lamp that hums the firefly's phrase, Tatter appearing) |
| 9 About 10 finds per save | The wood's patches are close together, with few finds between them. Aim for ~10 finds (glint hoards, hollows, signs) per patch interval | Over target already (~100 glints, 16 pods). Turn some glint lines into fewer, bigger finds behind small challenges |
| 10 Fast travel early, islands by transit | Not needed at this size. But **islands by transit** fits our tech: each look a room, joined by a set-piece crossing (the 0.3 s carry). Draw the wood as 4–5 islands, not 13 rooms in a chain | Already islands (3 rooms). The lesson: make each crossing a place (an elevator, a fall, a climb), not a door |

## 5. Caveats
- Nine Sols' "screen" is my yardstick (±30%). The footprints are fair; the filled areas include faded background and
  run high.
- The route and times are from walkthrough text and my estimate of a first-timer's pace, not from timing a run.
- The opening's node and marker counts come from the interactive map's data (ninesolsmap.com), boxed by region by eye.
- Nine Sols is a Sekiro-like more than a Metroid-like. Its structure is "a dense linear location, a save, a gate
  fight", repeated. Its world map matters less than its pacing inside each location.
