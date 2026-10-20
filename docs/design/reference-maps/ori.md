# Reference maps: Ori and the Blind Forest (DE) and Ori and the Will of the Wisps

2026-10-20. Written for `BRIEF.md`. Slug `ori`; the images are in `shots/reference/maps/ori/` (gitignored), with the
sources in `shots/reference/maps/ori/sources.txt`.

**How sure each number is.** Three kinds of number appear below:
- **Measured**: from the randomizer logic files, which give every pickup's and every area anchor's game position,
  each connection between anchors, and the skills each one needs. Exact to the unit, and checked against the maps.
- **Measured, then converted**: game units turned into screens. One screen is assumed to be 40 x 22.5 units (marked
  *scr*); see "Units" below. This could be about 25% off either way.
- **Guess**: times for a first-time player, and anything I took from memory of playing. These are marked *(guess)*.

---

## 1. The maps used

| file (under `shots/reference/maps/ori/`) | what | source |
|---|---|---|
| `bf/gameranx-OriandtheBlindForestDE-Map1.jpg` | all of Nibel (BF DE), 5800 x 4240, in-game map art with every cell, keystone, well, tree and secret marked | gameranx, linked from Steam discussions |
| `wotw/demajen-niwen-full-steam.jpg` | all of Niwen (WotW), 8264 x 2304, labelled (every skill, shard, quest, NPC), with the Wellspring Glades hub inset at 200% | Demajen's map v3c, Steam UGC |
| `wotw/Inkwater_Marsh_map.png`, `Kwoloks_Hollow_map.png`, `Wellspring_Glades_map.webp`, `Luma_Pools_map.png`, `Silent_Woods_map.png`, `Baurs_Reach_map.png`, `Mouldwood_Depths_map.png`, `Midnight_Burrows_map.png` | per-area in-game map exports, up to 4096 x 2048 | Ori fandom wiki, by way of the Wayback Machine (the wiki's image host blocks scripts with a Cloudflare challenge) |
| `logic/bf-areas.ori` | the Ori DE randomizer's world: 248 pickups with x,y and zone, 228 area anchors with x,y, their connections and the skills each needs | `sparkle-preference/ori_rando_server` |
| `logic/wotw-areas.wotw`, `logic/wotw-loc_data.csv` | the WotW randomizer's world: 390 pickups with x,y, 334 anchors with x,y, connections and requirements | `ori-community/wotw-seedgen` |
| `view/bf-overlay-opening.jpg`, `view/bf-overlay-ginso.jpg`, `view/wotw-overlay-opening.jpg` | the logic graph drawn onto the maps (magenta = anchor, yellow = connection, green = pickup). **Look at these first** | made here (`tools/`) |

**Why the logic files matter.** Ori has no rooms: each area is one continuous, hand-painted space. The randomizer
community has mapped it as a graph of about 230 (BF) and 330 (WotW) anchor points, with "you need Wall Jump to get
from here to there" on every edge. That graph is the closest thing to a room list. The overlays show it lands on the
maps: the anchors sit inside the painted tunnels.

**Units.** One game unit is the width of Ori's hitbox, and Ori moves at about 11.67 units/s (TASVideos). I assume one
screen is 40 x 22.5 units. As a check, the Ginso Tree's inner shaft is about 48 units wide on the map, and in play it
fills a bit more than one screen's width. At that size Ori crosses a screen in about 3.4 s. **Wing crosses ours
(1920 px at 576 px/s) in 3.3 s**, so Ori's screens and ours feel the same size to move through, and the screen counts
below compare directly with our rooms.

**What I could not measure.** Rooms (Ori has none). Exact explored area: thresholding the map art gives anywhere from
180 to 450 screens for BF depending on the cut-off, because the art is dark, so I quote fill as a range. I also didn't
watch a first-timer's run, so the minute marks are guesses from the area order, the distances and the HLTB totals
(BF DE main story 9 h, WotW 12 h).

---

## 2. The whole worlds

### Nibel (Blind Forest)

```
                                                     ║ GINSO TREE
               ┌ sunstone                            ║ 38 scr tall, ~1.2 wide
               │ SORROW PASS (24 scr tall)           ║ (escape up its top 14)
   FORLORN     │                    MOUNT HORU       ║
   RUINS       │                   (lava; finale)    ║
     \      VALLEY OF THE WIND ─── SPIRIT TREE ── HOLLOW GROVE ── THORNFELT SWAMP
 MISTY WOODS   (tall, glide)        (hub well)    (the centre)      (Stomp)
                                       │              │
                                SUNKEN GLADES ═ start ═ MOON GROTTO
                                 (Wall Jump)      │       └ Gumo's Hideout (Double Jump)
                                         BLACK ROOT BURROWS (DE, optional)
                                                    └ Lost Grove
```

- **Size.** The pickups span 2,100 x 1,500 units, about **52 x 66 scr**. 248 pickups.
- **Shape.** A wide horizontal belt about 20 scr tall in the middle, holding Glades, Spirit Tree, Hollow Grove, Grotto
  and Swamp, with two towers rising out of it (Ginso Tree, east; Sorrow Pass, west), Mount Horu between them, and the
  optional Black Root Burrows hanging below.
- **The hub.** It is a region, not a room: the Spirit Tree plus Hollow Grove. The wiki calls Hollow Grove "a center
  network for most of the different paths": it touches the Spirit Tree, Valley of the Wind, Sunken Glades, Thornfelt
  Swamp, Moon Grotto and Mount Horu. Every opening area is within 17 scr of the start horizontally.
- **Wells.** About one Spirit Well per area. The Soul Link lets the player save anywhere for one energy: the player
  chooses the checkpoints, and pays for them.

### Niwen (Will of the Wisps)

```
                       BAUR'S REACH (north, Memory)        WILLOW'S END (top, finale)
 THE WELLSPRING ─── WELLSPRING GLADES (hub, town) ───────────────── SILENT WOODS ── WINDSWEPT WASTES ─ WINDTORN RUINS
 (above the spawn)          │                                     (east, Kuro)      (far east, Burrow) (Heart)
 LUMA POOLS (west) ─── INKWATER MARSH (spawn) ── KWOLOK'S HOLLOW (Bash, Dash)
                            │ Howl's Den             └── MOULDWOOD DEPTHS (south-east, Eyes, Flash)
                       MIDNIGHT BURROWS (south)
```

- **Size.** The pickups span 4,080 x 1,040 units, about **102 x 46 scr**: twice as wide as Nibel, and less tall.
  390 pickups.
- **Shape.** Long and horizontal. The hub sits a little left of centre on the spine, and the regions hang off it like
  petals. Each is named for a Wisp, and Kwolok sends you to them by compass direction: "frost in the North",
  "darkness to the South", "waters to the west", "shifting sands of the East".
- **Saves.** Wells (8 in the opening areas) plus automatic checkpoints at most anchors: Inkwater alone has 30
  checkpoint anchors, about one every 2–3 scr.

---

## 3. Blind Forest: the opening (Sunken Glades → Spirit Tree → Hollow Grove → Moon Grotto → Ginso Tree)

### Where everything is, measured from the start

Positions are in screens from where control begins ("SunkenGladesRunaway", x 184, y −220); +y is up.

| what | dx scr | dy scr | needs |
|---|---|---|---|
| first pickup | −2.3 | −0.2 | – |
| first keystone door (2 keys) | −5.0 | +0.2 | 2 keystones found nearby |
| Glades map stone | −6.6 | −1.2 | (pay a fragment) |
| the first fight (Fronkey) | −8.4 | −2.3 | – |
| **Wall Jump** (Fil's tree), at the bottom-left end | **−12.5** | **−3.9** | – |
| Spirit Caverns gate to the Spirit Tree (4 keys) | −9.2 | +3.9 | 4 keystones from the caverns |
| **Spirit Tree** (well; the hub) | **−6.9** | **+4.5** | Wall Jump |
| **Charge Flame** (Ano's tree) | −6.0 | +2.7 | – |
| Valley of the Wind's door (west of the tree) | −9.1 | +4.7 | Charge Flame |
| the 4-energy door, **2.6 scr east of the start**, into Moon Grotto | +2.6 | +0.9 | 4 energy cells |
| **Hollow Grove** (centre) | **+3.8** | **+5.7** | Charge Flame (spider-sac wall) |
| Moon Grotto well | +8.3 | +1.9 | – |
| Ginso Tree's door (Thornfelt Swamp) | +8.6 | +7.9 | the Water Vein |
| Water Vein | +7.9 | −1.2 | Gumo's chase |
| **Double Jump** (Leru's tree), at the bottom of Gumo's Hideout | **+15.0** | **−8.5** | 2 keystones |
| **Bash** (Reem's tree), halfway up the Ginso Tree | **+8.7** | **+24.4** | – |
| the top of the Ginso escape | +9.1 | +52 | – |
| Stomp (east swamp, next) | +16.9 | +5.5 | – |

**The opening is a spiral around the start:**
1. west and down to Wall Jump;
2. up through Spirit Caverns and back east *over* the start to the Spirit Tree and Hollow Grove;
3. east and far down to Double Jump;
4. up the Ginso Tower, which rises 8.6 scr east of the start.

Everything of the first ~3 hours *(guess)* fits in a band 30 scr wide and 17 scr tall around the spawn, plus the
tower.

### Sizes

The bounding box comes from the pickups. Fill is the painted map area in screens, a range because of the dark art.

| area | box (scr) | fill (scr) | pickups | skills | keystones | cells (life/energy/ability) | time *(guess)* |
|---|---|---|---|---|---|---|---|
| Sunken Glades + Spirit Caverns | 14.8 x 7.5 | 25–35 | 29 | Spirit Flame, Wall Jump | 8 (doors of 2 and 4) | 1 / 4 / 4 | 0:00–0:35 |
| Hollow Grove + Spirit Tree (+ Horu Fields) | 13.3 x 10.5 | 30–60 | 28 | Charge Flame | 0 | 4 / 3 / 6 | 0:35–1:00 |
| Moon Grotto + Gumo's Hideout | 11.4 x 14.8 | 20–40 | 35 | Double Jump | 2 | 3 / 3 / 2 | 1:00–1:50 |
| Thornfelt Swamp | 12.6 x 7.8 | 15–38 | 22 | (Stomp, after Ginso) | 2 | 1 / 1 / 4 | passes |
| Ginso Tree | 3.9 x 37.8 | 17–27 | 23 | Bash | 8 (doors of 4 and 4) | 0 / 1 / 0 | 1:50–2:40 |

- **Screens per minute.** The Glades are about 25–35 scr of space, played in about 35 min *(guess)*. That is roughly
  **one new screen a minute**, with **one pickup per screen**.
- **Pickup spacing.** The median distance from a pickup to its nearest neighbour is 0.74 scr in the Glades, 0.78 in
  the Grove, 0.88 in the Grotto and 1.07 in the Ginso Tree. The largest empty stretch is about 4 scr. This counts only
  the pickups the logic tracks: cells, keystones, spirit-light containers and plants. The small light orbs come on
  top.
- **Front-loading.** 19 of the Glades' 29 pickups need no skill at all. The other 10 wait for Charge Jump, Bash, Light
  Grenade or clean water: **a third of the first area is return payoff**.

### Shape and gating, as the skills come

Reachability over the logic graph from the start, using only "casual" paths, so no tricks. Numbers are anchors
reached, loops counted as edges − nodes + 1, and exits that are seen but locked.

| holding | anchors reached | where | loops | locked exits seen |
|---|---|---|---|---|
| nothing | 8 | Glades only | 3 | 7 |
| + Wall Jump | 24 | Glades, the Spirit Tree, the Black Root mouth | 10 | 8 |
| + Charge Flame | 54 | + Hollow Grove, Moon Grotto, the Swamp's edge | 23 | 24 |
| + Double Jump + Water Vein | 82 | + Ginso lower, Horu Fields | 35 | 30 |
| + Bash | 114 | + all of Ginso, Valley, Horu's door | 54 | 21 |

- **Each of the first three skills about doubles the reachable world**: 8 → 24 → 54 → 82 → 114.
- **The third skill is the world opening up.** Charge Flame takes the player from one area to five, and the number
  of locked exits they can see triples.
- **Locks are visible from the first minute.** Seven locked exits around the first eight anchors:
  - the 4-energy door just east of the start;
  - the Black Root crawlspace (Wall Jump);
  - a laser door;
  - the attic;
  - the doors to the keystone gates.
- **Dead ends.** The opening graph has 17 dead-end anchors. **15 hold a keystone, a cell, a map stone or a skill
  tree**; only 2 hold spirit light alone. Every skill tree (Wall Jump, Double Jump) is a dead end at the far end of
  its branch.
- **Exits per anchor.** The degrees are 1: 17, 2: 22, 3: 24, 4: 8, 5+: 18. So most points have 2–3 ways on, and a few
  junctions have 5–8: the Spirit Tree, Hollow Grove, the Grotto well and Gumo's Hideout.
- **One-ways.** The logic lists many, but most are door artefacts. The real ones I can confirm from the map and play:
  - the Gumo bridge trap (a forced drop into the hideout);
  - the Ginso escape;
  - the drops out of Spirit Caverns, and from the Glades down into its pools.

### Verticality

Summed over a plausible critical path, through anchor coordinates in play order:

| stretch | horizontal | vertical | vertical / horizontal, in screens |
|---|---|---|---|
| the start to the Ginso door | 98 scr-widths | 72 scr-heights | **0.74** |
| inside the Ginso Tree | 2 | 38 | **17.5** |
| the whole opening | 100 | 110 | 1.1 |

**The areas are horizontal bands, and the big vertical move is one tower.** The tower is the opening's climax: a
climb with Bash about 60% of the way up, the Element at the heart, then a 14-scr escape up new space above the heart
with water rising behind.

### Each area's layout

**Sunken Glades + Spirit Caverns** (`view/bf-glades-zoom.jpg`, `view/bf-overlay-opening.jpg`)

```
  +5            [SPIRIT TREE dome, ~3.5 x 2.5]════(east, over the start)══► Hollow Grove
  +4      [4-key gate]   │ (well)
  +2   SPIRIT CAVERNS    │ [Charge Flame tree, later]
  +1   tan maze, 4 keys, │
   0   saw blades        [2-key door]═══ GLADES BAND (pools, mushrooms, Sein) ═══ START ─[4-energy door]─► Grotto
  −2   (keys at its      signpost: "Spirit Caverns / Hollow Grove"                  └ crawl up: Black Root (WJ)
  −4    dead ends)   ─── WALL JUMP tree (bottom-left end, −12.5 scr)
        −12   −10   −8   −6   −4   −2    0 (scr from the start)
```

- **The spine** is a horizontal band of pools and logs running ~12 scr west from the spawn. A tan, root-filled maze
  (Spirit Caverns) stacks on its west end, and the Spirit Tree's dome sits on top of that.
- **The critical path:**
  1. west along the band;
  2. through a 2-key door;
  3. down to the far bottom-left for Wall Jump;
  4. back up through the caverns, collecting 4 keys from their side pockets;
  5. out the top through the 4-key gate into the Spirit Tree.
- **The keys force exploration without telling you the order**: six of the eight keystones are required, and each
  sits in a side pocket.
- **What lies off the path:**
  - pools you can only swim after Ginso (clean water);
  - the 4-energy door 2.6 scr east of the spawn (into Moon Grotto: a shortcut that opens about an hour later);
  - the Black Root crawlspace above the first well (Wall Jump; optional, and it holds Dash).
- **The landmark.** The Spirit Tree, seen in the prologue, and reached at the top of the first climb.

**Spirit Tree + Hollow Grove** (the hub region)
- **The Spirit Tree's dome** is one big set-piece space (~3.5 x 2.5 scr), with a well and four ways out:
  - down to the caverns;
  - the Charge Flame chamber just south-east;
  - west to Valley of the Wind (a Charge Flame wall);
  - east through the spider-sac pocket to Hollow Grove.
- **Hollow Grove** is a cluster of lakes and trees 10.7 scr east of the Spirit Tree and directly above the start. It
  has 4 life cells, its map stone and the Kuro set piece. Its exits:
  - up to Horu Fields (Bash);
  - east to the swamp;
  - south-east down to Moon Grotto.
- **Passes.** The player passes through the Grove at least 4 times in the first ~3 hours *(guess from the route)*:
  1. on the way to the Grotto;
  2. on the way back to the swamp;
  3. after Ginso, west toward the Valley;
  4. on the way to Horu.

  They come from the west, the south and the east.

**Moon Grotto + Gumo's Hideout**

```
  +2  [Grotto well]──── lasers ("GUMO" letters) ──── to the swamp (up-right)
   0      │ (the energy door from the Glades enters here, from the west)
  −1  [Water Vein]
  −4      │  the bridge trap: a forced fall
  −7  GUMO'S HIDEOUT: crushers, the mini-boss, rockslide, 2 keys ─[2-key door]─► DOUBLE JUMP (+15, −8.5)
      +7    +9    +11   +13   +15
```

- **The shape.** A deep pit (~15 scr tall). The story chase (Gumo steals the Water Vein) drags you in by a one-way
  fall, and the new skill (Double Jump) climbs you out.
- **The set pieces sit in a row down the shaft:**
  - the lasers;
  - the bridge trap;
  - the crushers;
  - the mini-boss;
  - the rockslide.

**Ginso Tree** (`view/bf-overlay-ginso.jpg`)

```
  +52  top (Kuro)        ▲ ESCAPE: 14 scr of new shaft above the heart, water rising
  +38  escape starts
  +35  HEART (wide cross-shaped chamber, ~3 scr) + well
  +32  4-key door ─ its 4 keys in side alcoves just below (+31..+32)
  +24  BASH tree (~60% of the way from the door to the heart)
  +23  4-key door to the Bash tree ─ its 4 keys just below (+22..+23)
  +21  mini-boss
   +8  door (needs the Water Vein)
```

- **The shape.** One shaft about 1.2 scr wide and 38 scr tall, with alcoves off both sides.
- **Two 4-key doors on the way up**, so the keys are hunted in the side alcoves.
- **The climax.** Bash (the opening's last skill) is learned about 60% of the way up and is needed for the redirect
  puzzles above it. The whole tower is then reused as a set piece: the escape.

---

## 4. Will of the Wisps: the opening (Inkwater Marsh → Kwolok's Hollow → Wellspring Glades → the Wellspring)

### Where everything is, measured from the spawn

Positions are in screens from the spawn well ("MarshSpawn.Main", −799, −4310).

| what | dx scr | dy scr | needs |
|---|---|---|---|
| Opher's wall (break it) | +2.9 | 0 | Spirit Edge |
| Lupo (the area map, 200 light) | +5.3 | −1.7 | – |
| **Opher's ledge: the view of the Wellspring mill** | **+5.1** | **+0.8** | – |
| Regenerate tree | +6.5 | −4.0 | the 2-key door, after the rain |
| Howl's Den mouth | +9.3 | −4.9 | – |
| **Spirit Edge tree** (sword), deep in the den | **+12.6** | **−7.5** | – (the den's bone doors need it) |
| **Double Jump tree**, the den's bottom-left end | **+6.1** | **−10.5** | – |
| **Spirit Arc tree** (bow), above Opher | **+8.6** | **+2.2** | Double Jump |
| Kwolok's Hollow (Twillen) | +12.4 | +3.2 | Double Jump |
| **Bash tree** (east hollow) | **+19.8** | **−0.7** | the beetle fight |
| **Dash tree**, at the bottom of the hollow | **+17.8** | **−5.0** | lever door |
| Kwolok | +24.4 | +4.2 | Bash lanterns |
| **Wellspring Glades** (hub well) | **+12.3** | **+7.0** | Grom's wall, from the hollow |
| West Glades signpost: "Wellspring / Reach / Pools" | +4.5 | +11.4 | – |
| **The Wellspring's door** | **−1.4** | **+11.2** | – (the inside is its own space; Grapple in room 1) |
| Midnight Burrows | −3.7 | −12.1 | the bell puzzle |
| the path to Luma Pools (wheel) | −6.8 | +1.6 | clean water |

**The opening is a figure-of-eight that ends straight above the spawn:**
1. east and down into Howl's Den (sword, double jump);
2. back west past the spawn;
3. up to Opher's ledge, where **the mill is in view, 11 scr above the spawn**;
4. east to Kwolok's Hollow (Bash, Dash, Kwolok, 24 scr east);
5. up and back west to the hub;
6. west through the Glades' pools to the Wellspring's door, **1.4 scr west of and 11 scr above the spawn**.

The player sees the destination about 20–30 min in *(guess)* and reaches it about 1:45 *(guess)*.

### Sizes

| area | box (scr) | fill (scr) | pickups | skills | median pickup spacing | wells / checkpoints | time *(guess)* |
|---|---|---|---|---|---|---|---|
| Inkwater Marsh (with Howl's Den) | 19.8 x 17.0 | 60–125 | 56 | Spirit Edge, Double Jump, Regenerate, Spirit Arc | 1.38 scr | 3 / 30 | 0:00–1:00 |
| Kwolok's Hollow | 17.3 x 11.7 | 40–70 | 34 | Bash, Dash | 1.27 scr | 1 / 20 | 1:00–1:30 |
| Wellspring Glades (hub) | 13.3 x 8.2 | 23–45 | 40 | (Ancestral Light; shops) | **0.70 scr** | 2 / 12 | 1:30–1:45, then every return |
| The Wellspring (outside + inside) | 17.5 x 21.3 | 70–110 | 38 | Grapple | 1.19 scr | 2 / 17 | 1:45–2:40 |

- **The hub is the densest area in the opening**, at 0.70 scr between pickups. The marsh is sparser (1.38 scr) but
  bigger.
- **Screens per minute.** About 1–2 new screens a minute in the marsh *(guess on both sides)*: bigger spaces and
  faster combat than BF.

### Shape and gating, as the skills come

Easiest ("moki") paths. World-state events are assumed done, so this slightly over-counts.

| holding | anchors | where | loops | locked exits seen |
|---|---|---|---|---|
| nothing | 31 | Inkwater (+1 Burrows mouth) | **0** | **14** |
| + Spirit Edge | 44 | + Burrows | 4 | 10 |
| + Double Jump | 136 | + Kwolok's Hollow, Glades, Baur's Reach mouth | 45 | 24 |
| + Bash, Dash | 163 | + Mouldwood mouth | 54 | 18 |
| + Grapple | 172 | + all of the Wellspring | 65 | 15 |

- **The first ~20 minutes are a tree, not a web.** 31 anchors with no loop at all, and **14 locked exits visible**:
  - Opher's wall;
  - the Burrows bells;
  - Life Pact's arena door;
  - the bone doors;
  - the pools path;
  - the Wellspring wheel.

  You fan out, bump into locks, and come back. The sword adds the first 4 loops.
- **The second skill opens the world.** Double Jump takes the player from 44 anchors to 136: the hollow, the hub and
  the Reach. (BF's Charge Flame is the same moment.)
- **Dead ends: 10 of 11 hold a reward**:
  - life cells;
  - an energy cell;
  - ore;
  - shards (Life Harvest);
  - a spirit trial.

  The odd one out is a hut door whose pickups are inside the hut.
- **Spirit trials (races) and combat shrines are optional challenge rooms, and they sit at dead ends**: "TrialStart"
  is a dead end in both the hollow and the Wellspring.
- **One-ways and the area's set pieces:**
  - the breaking log bridge 3–4 scr from the spawn, the first forced drop;
  - the long drop into Howl's Den;
  - Howl's chase;
  - the Wellspring escape (it ends with Ori diving out of the mill, back to the ground outside).

### Each area's layout

**Inkwater Marsh** (`view/Inkwater_Marsh_map.jpg`, `view/wotw-center-south.jpg`)

```
  +2               [SPIRIT ARC tree]   (looking west and up: THE MILL)
  +1  pools path ◄─ [SPAWN well] ── log bridge ── [Opher + ledge] ── spirit trial ── east: KWOLOK'S HOLLOW
   0      ▼ left signpost  │            │ (breaks: a drop)
  −4  life pact arena  [Tokk's cave]──[2-key door]─[REGENERATE]── Howl's approach ── Mokk ── Howl's fang
  −5  pools/burrows signpost               └─ HOWL'S DEN (bones, a loop of bone doors)
  −8   └ bells: MIDNIGHT BURROWS               SPIRIT EDGE tree (+12.6, −7.5)
 −10                                [DOUBLE JUMP tree] ── den teleporter / shrine
       −6     −3      0      +3      +6      +9      +12   (scr from the spawn)
```

- **The shape.** Three horizontal tiers of marsh tunnels, about 20 scr wide. The spawn is on the top tier, and Howl's
  Den is a pit under the middle.
- **The spine** runs spawn → bridge → cave → Howl's approach → the den. The den holds the sword, then the double jump
  at its far bottom-left end. That is the way back up and out, past the spawn to Opher.
- **The bright clearing at Opher** (the yellow dome on the map, ~4 x 4 scr) is the area's landmark room: the bow tree
  above it, the trial beside it, the view of the mill across it.
- **Two signposts at junctions** name where each way goes (Pools / Burrows / Marsh). These are wayfinding at forks,
  not hints toward secrets.

**Wellspring Glades: the hub** (`view/wotw-hub-inset.jpg`, `view/Wellspring_Glades_map.jpg`)
- **The town**: about 7 x 4 scr of tiered pockets, densely packed: huts on stilts, ledges, an updraft, a cave.
- **The services**, all in one place:
  - Opher (weapons);
  - Twillen (shards);
  - Lupo (maps);
  - Grom (building, paid in ore);
  - Tuley (gardening, paid in seeds);
  - Motay;
  - Tokk.
- **West Glades**: pools and a signpost to the Wellspring, the Reach and the Pools.
- **Exits: five**:
  - down to Inkwater;
  - east to the hollow;
  - north to Baur's Reach;
  - west to the Wellspring;
  - west and down to Luma Pools.

  Three of them are visibly locked on the first visit (the Reach, the Pools, the burrow cave).
- **The hub grows.** Grom's and Tuley's quests rebuild and replant it with what you bring back from every region, so
  each return shows a change.

**The Wellspring**
- **Outside**: a pale cavern bubble (~8 x 8 scr) at the foot of the mill, with:
  - the Lost Compass;
  - Ultra Grapple;
  - the trial;
  - Life Harvest in a dead end.
- **Inside**: a separate space behind a door, three rooms stacked about 14 scr tall:
  - **room 1: the Grapple tree**, and a drain puzzle;
  - room 2: the spin puzzle;
  - room 3: the top, then the Foul Presence's chase and the water escape out of the mill.

  The new skill is used straight away for the rest of the building, and the escape returns you to the outside: a
  loop closed by a set piece.

---

## 5. Side by side

| measure | BF opening | WotW opening |
|---|---|---|
| first area | Glades, 14.8 x 7.5 scr box, 25–35 scr of space, ~35 min *(guess)* | Inkwater, 19.8 x 17 scr box, 60–125 scr, ~60 min *(guess)* |
| pickups in the first area | 29 (median spacing 0.74 scr) | 56 (1.38 scr) |
| share of the first area held for later skills | 10 / 29 | not measured |
| skills in the first area | 2 | 4 |
| hub | Spirit Tree + Hollow Grove, ~0:35 *(guess)*, 4–6 exits | Wellspring Glades, ~1:30 *(guess)*, 5 exits, grows |
| skill that opens the world | #3 (Charge Flame): 1 area → 5 | #2 (Double Jump): 44 → 136 anchors |
| locked exits seen at the start | 7 around 8 anchors | 14 around 31 anchors |
| loops at the start | a few, short | none (a tree) |
| dead ends with a real reward | 15 / 17 | 10 / 11 |
| first big vertical set piece | Ginso: 38 scr tall, escape 14 scr | the Wellspring: 14 scr tall inside, escape |
| vertical / horizontal before the tower | 0.74 | 0.65 |
| destination seen before it's reached | the Spirit Tree (prologue); Ginso from the swamp | the mill from Opher's ledge, ~1 h before |
| farthest point of the opening from the start | 17 scr (Stomp) | 24 scr (Kwolok) |

---

## 6. Ten rules Ori's layout teaches

Each rule is stated so it can be checked against a map.

**1. Spiral around the start.** The opening's milestones circle the spawn and come back past it, above or below.
- **Check:** at least 3 of the first 5 milestones (skills, hub, boss) lie within 15 scr of the spawn.
- **Check:** the critical path crosses the spawn's column at least twice, at different heights.
- **In Ori:** BF crosses back over the start to the Spirit Tree (+4.5 up) and Hollow Grove (+5.7). WotW ends at a
  door 11 scr straight above the spawn.

**2. Show a lock at minute one, and open it as a shortcut an hour later.**
- **Check:** within 3 scr of the spawn there is a visible lock that can't be opened yet.
- **Check:** it opens from the far side, or with a later resource, between 30 and 90 min in, and the route it opens
  saves at least 3 scr.
- **In Ori:** BF's 4-energy door, 2.6 scr from the start, is a shortcut to Moon Grotto. WotW's wheel on the pools
  path, 7 scr west of the spawn, opens only after the Wellspring runs again (~2.5 h *(guess)*), as the way to Luma
  Pools.

**3. A tree first, a web after the first tools.** The first stretch branches but doesn't loop; the loops arrive with
skills.
- **Check:** before the first skill there is at least 1 locked exit visible per 3 reachable places.
- **Check:** each of the first 2–3 skills at least doubles the reachable space.
- **Check:** the skill that opens the world (the 2nd or 3rd) adds at least 3 loops at once.
- **In Ori:** WotW 31 anchors, 0 loops, 14 locks → 136 anchors and 45 loops after Double Jump. BF 8 → 24 → 54.

**4. Required finds in side pockets.** The first area's critical path is gated by doors that need items found off it.
- **Check:** at least 2 doors on the first area's critical path need an item found in a side pocket.
- **Check:** each side pocket holds at most one or two of them.
- **Check:** the door shows how many it needs.
- **In Ori:** Glades 2 + 4 keystones from side pockets; Ginso 4 + 4; Gumo's Hideout 2. Exploring is required, and
  nothing tells you where or in what order.

**5. Every dead end pays something that changes the numbers.**
- **Check:** at least 85% of dead ends hold health, energy, an upgrade, a key, a map, a skill or a challenge room.
- **Check:** at most one dead end in six pays currency alone.
- **In Ori:** BF 15 / 17, WotW 10 / 11. Optional challenges (spirit trials, combat shrines) are themselves placed at
  dead ends.

**6. A reward every screen; never more than 4 screens bare.**
- **Check:** the median distance from a significant pickup to its nearest neighbour is 0.7–1.4 scr.
- **Check:** the largest empty stretch is at most 4 scr, except for deliberate quiet stretches.
- **Check:** the hub is the densest area.
- **Check:** about a third of the first area's pickups need a later skill.
- **In Ori:** BF Glades 0.74 scr (10 of 29 held for later). The WotW hub 0.70, against the marsh's 1.38.

**7. A skill sits at the far, low end of its branch, and the way out needs it.**
- **Check:** each skill pickup is a dead end at the bottom or far end of its branch.
- **Check:** the first room after it can't be left without the new skill.
- **Check:** the area's next lock uses it within 5 min.
- **In Ori:** BF Wall Jump at −12.5, −3.9, with the caverns climbed by wall jump. Double Jump at the bottom of Gumo's
  pit. WotW Double Jump at the den's bottom-left. Grapple in the Wellspring's first room.

**8. Areas are horizontal bands; each act gets one tall set-piece shaft, and the escape uses it.**
- **Check:** vertical/horizontal travel (in screens) is about 0.6–0.8 in ordinary areas.
- **Check:** one shaft per act is at least 12 scr tall, holds the act's last skill around its middle, and ends in a
  timed run (a chase or rising water).
- **In Ori:** the Ginso Tree, 38 scr tall, Bash about 60% up, a 14-scr escape. The Wellspring, 14 scr tall, Grapple, the
  escape.

**9. Rooms vary wildly in size, and the landmark gets the cathedral.**
- **Check:** in each area the largest space is at least 6x the median pocket.
- **Check:** each area has one big open "cathedral" space that holds its landmark or hub.
- **Check:** no two neighbouring spaces have the same width and height.
- **In Ori:** the Spirit Tree's dome (~3.5 x 2.5 scr) against 1-screen root pockets. Opher's clearing in the marsh. The
  Ginso shaft.

**10. The destination is seen long before it's reached, from a ledge on the critical path.**
- **Check:** each area's goal is in view at least 20 min (or 10 scr of travel) before the player can enter it.
- **Check:** the view is from the critical path and needs no detour.
- **Check:** the player gets a second, different angle on the way.
- **In Ori:** WotW's mill from Opher's ledge, an hour before the door. BF's Spirit Tree from the prologue, and the
  Ginso Tree from the swamp.

Also useful, but not in the ten:
- **The hub is reached after 2–3 skills, and it grows.** At least 5 exits, at least 3 visibly locked on the first
  visit, and something in it changes on every return (Grom, Tuley).
- **Junction signposts name places, never secrets** (the Glades', the marsh's and the West Glades' signposts).
- **The map is earned per area:** a map stone, or Lupo, within about 5 scr of the area's entry, for a small price.

---

## 7. What each rule would have changed in our levels

Our two levels:
- **Wood area 1 v3** (`docs/design/regions/wood-area1-v3.md`): 13 wood rooms. Their rectangles total ~72 scr (from
  1.9 scr for the canopy to 12.2 scr for the well), with 30–35 min of main path.
- **Lanternroot** (`docs/design/levels/proto-1.md`): 3 rooms of 3 x 1.4 scr (9 equal chambers, ~13 scr) plus the
  cache, with 20–25 min of main path.

| rule | wood area 1 v3 | Lanternroot |
|---|---|---|
| **1 Spiral around the start** | It runs one way downhill, from the hatch (high west) to the oak (low east). It comes back over the start only through optional claws returns. **Change:** put the den and the trunk under or next to R1–R2, so the claws climb comes out beside the hatching tree. The crown vista then looks *down on where she began* | Partly there: Kindle (A3) sits right under the start (A1). The end (C1) is the far corner, though. **Change:** let the exit loop come back to A1's ridge (the crow's nest as the way out), so the level closes on its start |
| **2 Lock at minute one, shortcut later** | Nothing near R1–R2 is a visible lock that opens later (the ridge branch is optional). **Change:** a sealed hole or bark door in R2's landing that is clearly *something*, opened from below at ~25 min as the drop from the trunk to the start | The knot panel is close (a shortcut cut from above), but it is open from minute 1, so it is never felt as a lock. **Change:** make the split's west wall in A2 a lock seen at 1:30, opened from the roots side after Kindle |
| **3 A tree first, a web after the tools** | The reverse: R1–R6 is a line with *no* visible locks for 9 min, then the oak opens 5 ways before any new skill. **Change:** show 4–6 locks in R1–R6 (R4's high wick is one; add thorn walls, bark she can't break yet, a high flame out of reach). Let the claws (not the arrival at the oak) be what multiplies the web | B2 has 5 ways at minute 4, before she understands any lock. Kindle at ~10 min is the doubling moment (good). **Change:** hold B2's choice back until the seal, the grille and the knot have each been *seen* as locks; count 1 lock per 3 places before Kindle |
| **4 Required finds in side pockets** | No required collectible, so every side room is skippable and the main line needs no exploring. That is one reason it felt "obvious". **Change:** the way from the oak to the clearing needs two things found in side pockets (two moths freed from caged flames in R5's alcove and R6's floor pocket, say). The count is shown on the door, and the order and places aren't | The moonwick sets are keystone doors in effect (good), but every wick is in plain view at the lock itself. **Change:** put one of each set's wicks around a corner, in a side pocket, so finding it is part of the lock |
| **5 Dead ends pay** | Already a rule ("nothing optional pays moths alone") ✓. Check the W-cave, the alcove under the lip and the floor pocket: each needs a moon-drop shard, a hollow, a map or a key, not a moth count | ✓ by design (glints count as currency, so glint-only hoards break the rule). **Change:** the two 12-glint bark hoards become a vessel shard and a sign |
| **6 A reward every screen, ≤4 bare** | Not measured. The 12-scr well and the 9-scr glidewalk risk long bare stretches. **Change:** run a lint over the room JSON: nearest-neighbour pickup spacing (median ≤ 1.4 scr), no gap > 4 scr outside the quiet list. Make the oak hub the densest room | The density rule (3 kinds in view, 2 within 600 px) is stricter than Ori's and will hold. **Change:** check the other half: about a third of the pickups held for Kindle or Gust (as the Glades hold 10 of 29), and the hub (B2) the densest chamber |
| **7 A skill at the far, low end; the way out needs it** | The claws at the den, then up the trunk ✓: a textbook Ori placement. Sharp wings and long breath are optional hollows, which is fine | Kindle at the bottom of A3 with only a moss climb out ✓ (First Light is exactly this). Gust from the boss reopens three locks ✓ |
| **8 Bands, plus one tall shaft with an escape** | The trunk climb plus the firefly chase is our Ginso ✓. **Change:** make the trunk *tall*: ≥12 scr. Now it is one 2 x 3.9-scr room (probably `wood-hollow`). Put the claws' return in the middle of it, and let the chase run up new shaft above where the climb ends | It has none: three flat bands of 1.4 scr each, linked by drops. The chimney is a few screens. **Change:** make the root plate (column C) one 10–12-scr shaft from the cistern to the crest, and run the exit as a timed climb (rising water from the cistern, or the hall's lamps guttering out) |
| **9 Sizes vary wildly; the landmark gets the cathedral** | The rooms vary (1.9–12.2 scr, ✓), but each is a full rectangle the camera fills. **Change:** inside the rectangles, carve pockets of ½–1 scr against the oak's cathedral, so the largest space is ≥ 6x the median | Fails outright: 9 identical 1920 x 1536 chambers in a 3 x 3 grid. **Change:** give each layer a different rhythm (a 2-scr cathedral hall in B2 against ½-scr root pockets in A3; a tall plate column in C), and break the grid so the chambers aren't the same size |
| **10 The destination seen long before** | The vista shows the oak at minute 1 ✓. **Change:** a second angle, mid-way: from R6's far landing, the oak's trunk and the crown above it, the climb she'll make | The plate's crest is seen from the spawn ✓. **Change:** a second view from inside the hall (a crack in the vault toward the crest), so the end is seen from two places |

**What the numbers say overall.**
- **Ori's first 30–40 min fill 25–35 scr of space** (BF) and hold 2 skills, 29 pickups and 2 key doors.
- **Lanternroot's whole 20–25-min main path is ~13 scr**: about half the space, at a similar pickup density. That
  suits a test bed. The real wood area should sit closer to Ori's ~1 new screen a minute, so "dense" doesn't become
  "cramped".
- **Wood area 1 has the space (~72 scr of rectangles)**. What it lacks is the shape:
  - a spiral, not a slope;
  - locks seen before the hub;
  - required side finds;
  - one tall climactic shaft.
