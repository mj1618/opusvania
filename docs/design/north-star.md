# North star: the spaces of *Tallage*

Status: **v1, Phase W (L5).** Owner: world and level design (STUDIO §1c, §5b). Date: 2026-09-28.

This is the target experience that every loop is measured against (STUDIO §2.2). It covers:
- how Tallage's spaces should feel;
- the camera, terrain, room and transition decisions;
- the quantitative targets for the first region, the Tally hub plus the Cellars;
- the first 20 minutes, beat by beat;
- the identity kit for each region;
- the experience rubric;
- the changes other documents need.

It is built on the teardowns in `docs/research/` (Crossroads, Greenpath, Sunken Glades, Wisps' Marsh and Wellspring), `level-toolchain.md`, `world-design.md` rev 2, Concept A, the movement and combat specs, and the L3 novice playtest.

**Units.** Tile = 64 px. Player = 40 × 80 px = 1 PH (player height) = 1.25 tiles. Screen = 1920 × 1080 = 30 × 16.9 tiles = 13.5 PH tall at zoom 1.0. **scr²** = one screen of area. Run speed is 9 tiles/s, so one screen width takes 3.3 s.

---

## 0. Which reference numbers we trust

The teardowns disagree in places. These are the rulings, and every target below follows them.

| Question | Ruling | Why |
|---|---|---|
| **HK's camera scale** | **13.2 PH per screen height. Trusted.** That's the same scale as ours (13.5), so HK's room sizes in HK units read directly as our tiles, and its sizes in screens carry over unchanged. | The Crossroads teardown *measured* it: the Knight collider is 0.5 × 1.28 u (hkrl), and the camera clamp and the 497 tilemaps give a 30 × 16.9 u view. A screenshot cross-check agrees within 5%. |
| **Greenpath's Knight height** (~35 px, "1 HK tile = 1.8 PH") | **Rejected**, together with everything derived from it: the advice to copy player-height counts rather than tile counts, and the claim that our rooms need more tiles than HK rooms to feel as spacious. | It's an estimate from conflicting fan height charts, with no collider data. At 35 px the view would be about 31 PH tall, which contradicts the measured 13.2. |
| **Greenpath's room sizes** ("45% single-screen", fades of 0.3–0.5 s) | **Rejected.** | They're estimates from longplay footage. The Crossroads *measured* no exterior room of 1 × 1 screen and fades of 0.8–1.5 s. We keep Greenpath's *qualitative* lessons: identity in the first two seconds, a hazard that is also a future gate, camouflage, sightline-driven curiosity, and 3 or more partly locked seams. Its critical-path share (30–40%) agrees with the measured HK value (29% of rooms, 39% of area). |
| **Ori's camera scale** | **About 21 PH per screen height, ±10–15%. Trusted as a range.** | Two independent teardowns each measured Ori at 50–55 px in Steam 1080p shots. The Wisps teardown adds a corroboration: its fixed-camera hut interiors are 36 u wide, which is one screen. Ori's view is 1.55× further out than ours. |
| **Converting Ori sizes into ours** | **Convert by screens for sense of place and room size. Convert by player heights only for obstacle cadence and jump-scale density.** The Sunken Glades teardown's "median segment 120 × 54 tiles" (a PH conversion) is rejected as a room-size target, because at our zoom it would put 1.55× more screens on the player than Ori does. | This is the Wisps teardown's §0 rule. A crossing-time check agrees: Ori's median segment (≈ 2.6 screens) takes about 9 s to cross at Ori's speed, and 2.6 of our screens take about 8.7 s at ours. The *time* is what the player feels. |
| **Our current rooms** | Use `level-toolchain.md` §1 (measured air extent: median 38 × 14 tiles, 0.83 scr², 31.8 scr² in total). | The Glades teardown's figure (40 × 17) includes padding. |
| **HK death runs** (median 24 s, max 48 s) | **Lower bounds.** Multiply by 1.3–1.6 for real paths, which gives about 31–38 s and 62–77 s. | They're Manhattan door distances (Crossroads §4). |
| **Ori flow chains** (median ≈ 20 s, max 39 s) | **Upper bounds on what the geometry allows.** Humans play in bursts of 5–20 s. | They come from TAS inputs (Glades §6.1). |
| **Ori enemy and secret densities** | **Estimates**, per Ori screen. We use HK's measured densities as the primary numbers and Ori's as a cross-check. | HK's come from scene dumps; Ori's come from walkthroughs. |

**Which reference leads where:**
- **HK leads** on sense of place, orientation, graph shape, encounter density and rests. It is measured, it uses our camera scale, and its combat is close to our boxing kit.
- **Ori leads** on flow chains, terrain shape, reveals, depth layering and hub-as-road. Those numbers are measured from TAS inputs, the map and the physics code.
- **The Wisps teardown leads** on "one mechanic used everywhere, at every scale" and on path folding.

---

## 1. The feeling

Tallage is a boomtown on the loudest night of its fever, and you can hear who owns what. Streets are stacked on streets, lamps and bunting hang between leaning towers, the Ticker Board shouts prices over a crowded square, and the Exchange Bell tower is always somewhere above you. Everything that hums belongs to somebody, and Kid is the bailiff who can take it. When she seizes a sound, the space around it goes quiet and the thing stops existing. The city notices.

From Hollow Knight we take **cohesion**:
- a fixed origin you can always point back to;
- roads and stairwells you can map in your head before you own a map;
- every room belonging to one place, every door lining up, and every dead end paying out.

From Ori we take **flow and beauty**:
- long runs where the ground keeps sending you down and along, and never asks you to stop;
- tight spaces that open into huge reveals;
- light as the only white;
- depth in fog and silhouette.

We copy neither. HK's hub is lonely and quiet; ours is **loud, crowded and alive**. Ori's world is a sick forest; ours is a city of commerce in a fever. Going down, the city gets heavier, warmer and lower in pitch. Going up, it gets lighter, colder and shriller. **You navigate by ear as much as by eye**, because in Tallage sound is title, and title is geography.

---

## 2. Decisions

### 2.1 Camera scale: HK scale by default, wider for set pieces

| Decision | Value |
|---|---|
| **Default zoom** | **1.0 = 13.5 PH per screen height.** This is HK's measured scale (13.2). |
| `open` zones: big chambers and flow runs | **0.9** (15 PH) |
| `vista` zones: one-shot reveals | **0.75–0.8** (17–18 PH), held 60–120 f with input live, then released. They don't repeat on backtrack unless flagged. |
| Combat | Boss and mini-boss arenas are `lock` at 1.0. Rooms with an active enemy stay at ≥ 0.9. |
| Limits | 0.75 to 1.1. Zoom 1.1 is only for intimate interiors, such as a Corner alcove or the Copyist's room. Kid never drops below 60 px tall on a 1080p canvas. |
| Easing | Zoom changes ease over 45–60 f and are capped per frame (the same blend model as camera zones, memory `camera.md`). |

**Why HK scale and not Ori's 21 PH:**
1. **Our combat is a short-reach boxing kit.** The jab reaches 1.06 tiles and a Seize 52 px, and telegraphs are colour fills on an enemy's hum outline. Ori's scale works because Sein auto-targets (Glades §6.2 point 6). Ours has to be read up close.
2. **HK proves that sense of place works at this scale.** The Crossroads' cohesion comes from room *size in screens*, framing and a legible graph, not from zoom.
3. **Ori's flow comes from geometry, not zoom.** It has an instant stop, reaches full speed in 0.19 s, and the terrain "never asks you to stop" (Glades §6.2 point 5). We get flow from terrain and room joins (§2.2 and §2.3).
4. **Zooming out alone makes our current rooms feel smaller** (Glades §13 item 1). Room size has to grow first.
5. **Fill-rate.** Zoom 0.75 costs about 1.8× the terrain and light-map area (`level-toolchain.md` §5).

**Why wider zooms at all:** Ori's arrival and reveal spaces (the Wisps spawn at 5.6 × 4.6 screens, the Spirit Tree dome 91% open) need a frame larger than the combat frame. A vista zoom gives Ori's sense of scale at the moments that matter, without shrinking the fighter everywhere else.

**The camera is part of the level.** HK has lock or framing zones in 87% of its rooms (median 2 per room). Rooms are composed as a series of framed shots, not a free scroll.

### 2.2 Terrain vocabulary: rectilinear bones, organic skin, three floor slopes

| Decision | Value |
|---|---|
| **Collision** | The existing 64 px rectilinear grid, **plus floor-only slopes at 1:4 (14°), 1:2 (26.6°) and 1:1 (45°)**. Each slope is an integer heightfield table. No ceiling slopes and no curved collision. Curves are baked into chains of flat → 1:4 → 1:2 → 1:1 segments, and only the skin draws the smooth spline. |
| **Walkable limit** | 45°. Anything steeper is a wall. |
| **Momentum on slopes** | **None in v1.** `vx` stays constant along x, with no uphill slowdown and no downhill boost (HK, Celeste, and Ori's "slopes change height, not rhythm"). **Ground-stick** snaps you downhill by up to `ceil(|dx|)+1` px, so crests never launch you. A jump from a slope is a normal jump, so the reach table stays exact. A grounded Slip follows the slope. |
| **Skin** | Marching-squares contour, smoothed and displaced, following `level-toolchain.md` §4.1. The honesty rules apply: walkable tops are exact to ±2 px, walls and ceilings may be ragged, and overhangs only sit above head height. |
| **Straight runs** | No straight wall or ceiling edge longer than **12 tiles (≈ 10 PH)** without a lip, a bump or a change of angle, in either skin or collision (Glades §13 item 4). |
| **Box fill** | Cellars rooms are 45–65% open inside their bounding box (Glades: 42–64%). Hub rooms are 55–80% open, because streets are built spaces. |

**Why:**
- **HK proves you can read a space as organic with square collision.** The Crossroads has no slope colliders; fossil-shell art covers the rectangles. That's why the skin comes first: it removes the "spreadsheet" look with zero sim risk.
- **Ori proves that flow needs uneven ground.** Only 23–29% of Glades floor length is flat, and **27–28% lies at 5–15°** (Glades §9.2). The opening flow chain averages about 7° downhill over 350 u.
- **We add 1:4 to the toolchain's 45° and 1:2**, because 1:2 is steeper than the whole 5–15° band that makes up Ori's biggest share of floor. 1:4 is exact in integers (`top[i] = 63 − (i >> 2)`, spanning 4 tiles) and uses the same table code.
- **Arbitrary angles are rejected** (`level-toolchain.md` §3.2 option C). They would rewrite the L2 controller and break exact determinism.
- **No slope momentum**, because both references get flow from geometry and not inertia. Adding speed would also break the reach table and the validator's geometric proofs.

**Tallage's dead band is deliberate.** Ori has no "can't stand, can't cling" surfaces. We do: plain masonry can't be clung to (world-design W4). So there's a **level rule**: a flow route never ends face-on at plain masonry at speed. It turns, ramps, drops, or ends at a facing or a spring source.

**Floor-angle mix targets**, as shares of walkable top length:

| | Flat | 1:4 | 1:2 | 45° |
|---|---|---|---|---|
| Tally hub (built city) | 55–65% | 20–30% | 5–15% | ≤ 5% |
| Cellars (dug strongrooms and spoil) | 30–40% | 25–30% | 20–25% | 10–15% |
| *Reference: Ori Glades* | 23–29% | 27–28% (5–15°) | 16–23% (15–30°) | 13% (30–60°) |
| *Reference: HK Crossroads* | ≈ 100% | 0 | 0 | 0 |

The contrast is part of identity. The hub is rectilinear and man-made, and the Cellars are dug and organic. The Wisps teardown's §9 lesson is that a geometric shape set against organic terrain defines an area.

### 2.3 Room model: large multi-screen rooms, placed in one world, joined by edge exits that keep momentum

| Decision | Value |
|---|---|
| **World** | Every room has a real world position (a GridVania cell of 30 × 17 tiles), so edges line up and the map is generated, not drawn. **Global geometry is exact**, which is stricter than HK, whose loops drift by up to 2 screens. |
| **Room sizes** | 1–8 screens wide × 1–5 screens tall. Size is a design choice per room: see the §3 targets. |
| **Joins** | **Edge exits.** An opening on a room edge is paired with the neighbour's opening. Crossing it keeps `vx`, `vy`, facing, the coyote timer and the Slip state. Up-press **doors** remain only for real doors: interiors, lifts and the dumbwaiter. |
| **Neighbour peek** | **Required.** Past an open exit, the camera bleeds into the neighbour and draws its skin and backdrop at its true world position. There is never black void past an open exit. |
| **What a room is for** | A room is the reset unit for enemies (HK uses this as a pacing tool), for the bag (W2), and for the validator. |
| **Seamless merged region** | **Deferred**, with a trigger: switch if the continuous-run playtest reports room seams as breaks in two consecutive loops. |

**Why not seamless now.** Ori's seamlessness is a feeling that comes from matching what's visible on both sides of a join. Even the Wisps mill interior is a hidden cut (Wisps §12 point 4). Edge exits plus peek plus camera continuity give most of that feeling for about a day of work (`level-toolchain.md` §6). A merged sim space would cost section-scoped resets, enemy sleep radii and a per-section validator, and it would not solve a problem we have yet.

**Why not HK's model as it is.** HK's fades take 0.8–1.5 s, and our polish bar is under 300 ms. HK rooms are also slightly small for our opening (median 4.4 scr²), and Ori's are larger (5.5–8).

**The bag and room seams.** W2 empties the bag at a room edge, and that stays, because it keeps the validator local. Two consequences:
- **The fiction.** A room edge is a **lot line**. It's marked by a brass survey stud in the floor or wall at every exit, and the ledger draws rooms as lots. Carried title can't cross a lot line, so carried sounds visibly ribbon back home across the seam.
- **The design rule.** A flow chain that crosses a seam uses movement only. Any sound-assisted beat sits inside one room.

Review this if the playtest flags lot lines as seams.

### 2.4 Transitions

| Kind | Target |
|---|---|
| **Edge exit** | **≤ 8 frames (133 ms)** visible, with no fade to black: a short luminance dip or none at all. The camera keeps its world position, so it never re-snaps. No input is dropped, with ≤ 4 f of arrival grace. Neighbours' skins are prefetched, so there's no hitch. |
| **Door** (interior, lift, dumbwaiter) | ≤ 250 ms fade. Hidden cuts are allowed (the Wisps mill), as long as **the same signature object is visible on both sides**. |
| **Vista entry** | The zoom eases out while you keep moving. Nothing freezes. |

**Reference:** HK 0.8–1.5 s (avoid), Ori 0 ms, PLAN's bar under 300 ms.

---

## 3. Quantitative targets: the first region (Tally hub + Cellars, the Phase W blockout)

Our region is the opening. It's a tutorial like the Glades and a hub like the Crossroads, so several targets sit between the two references on purpose. **A loop's world work passes when its region metrics are inside these ranges, or explains why not.** `npm run world -- metrics` should compute them (§7).

### 3.1 Scale and shape

| Metric | Target | Reference range (source) |
|---|---|---|
| Rooms | **22–28** (hub 12–15, Cellars 10–13), plus 3–5 secret closets | Crossroads 45 for the whole hub, and its teardown recommends 14–20 for our hub portion. Glades 15 segments. Marsh 29 scenes. |
| Total room area | **130–170 scr²** (hub 70–95, Cellars 55–75) | Crossroads 248 (60–120 min first pass). Glades ≈ 40 Ori screens (25–40 min). Marsh ≈ 290 (45–75 min). **Today: 31.8 for the whole game.** |
| First-pass time for the whole region | 40–55 min, of which the first 20 min cover §4 | HK ≈ 2.8 scr²/min. Glades ≈ 1.3/min. Marsh ≈ 4.8/min. |
| **Median room** | **5–6.5 scr²** (hub ≈ 4.5–5.5, e.g. 70 × 30 tiles; Cellars ≈ 6) | HK Crossroads 4.41 (measured); HK whole game 9.4; Glades ≈ 5.5; Marsh ≈ 8. **Today: 0.83.** |
| Largest room | **One set piece of 16–20 scr²** (Tally Cross) and **one of 12–15 scr²** (the Great Scale Hall) | The Ancestral Mound 21. The Wisps arrival and mill courtyard 26–57. |
| Large rooms (≥ 8 scr²) | 20–35% | HK 18%. Marsh 69% over 6 scr². |
| Smallest exterior room | **≥ 3 scr², and ≥ 2 screens long on its long axis.** A 1 × 1 screen room is only for an interior, a closet or a Corner alcove. **No exterior room is fully visible from its entrance** at zoom 1.0. | HK: no exterior 1 × 1 (measured). Wisps: "avoid". |
| Corridor height | 25–30 tiles (1.5–1.8 screens), so the camera always has vertical play | HK corridors 25–30 u (measured). |
| Shape mix | Horizontal 40–50%, vertical 20–30%, squarish or set piece 25–35% | HK 40/29/31. Glades 40/27/33. Marsh 57/7/36. |
| Vertical rooms | ≥ 1.3 screens wide (a core with side pockets, not a tube). The exception is the hub's 2 stairwell spines, which may be 1 screen wide. | Wisps: tall rooms are puzzle boxes 2.5–3.5 screens wide. HK: shafts 1 × 4.3 screens. |
| Floor-angle mix | §2.2 table | Glades §9.2 |

### 3.2 Graph

| Metric | Target | Reference range (source) |
|---|---|---|
| Mean degree | 2.2–2.6. The hub has 2 junctions of degree ≥ 4, and Tally Cross has degree ≥ 5. | HK 2.18, with junctions of degree 5–6. Wisps town well: degree 20. |
| Independent loops (E − V + 1) | **≥ 3**, loop length 4–8 rooms. At least 1 loop is walkable before any ability. | HK 5 per 45 rooms, lengths 5–12. Glades 0–1 on first pass. Wisps ≥ 2 per area. |
| Dead ends | 20–30% of rooms, **100% paying out** (a pickup, lore, a Corner, a Copyist, a view plus a cache) | HK 14 of 14 pay (measured). |
| One-way edges | **Hub: 0.** Cellars: ≤ 20% of edges, each one within 1 room of a Corner or a return route. | HK hub 0 (measured). Wisps 20–25%. Glades' wall-jump pit. |
| Shortcuts opened from the far side | **≥ 3 in the region, and the first by ~18 min** | HK hub 3+. Wisps ≥ 8 per area. |
| Hub exits | **≥ 5, in distinct compass directions. Every exit except the Cellars hatch is locked on the first visit, each by a different visible key.** | HK: 7 spokes, all locked but home (measured). Greenpath: 3 of 4 seams locked. |
| Endgame visible | The Exchange Bell tower (the Receivership) can be seen, and is sealed, from the first room | HK: the Black Egg is 1 room from the start. |
| Critical-path share | **35–50% of rooms** on the first pass, higher than HK because this is the opening | HK 29% of rooms, 39% of area. Greenpath ≈ 30–40%. Glades ≈ 90%. |
| Path / straight-line ratio (entrance → region exit) | **3–5** | Wisps 7.6–8 across a whole 60-min area. Glades ≈ 40% retracing. Under 3 reads as a corridor (Wisps "avoid"). |
| Retraced critical path | ≤ 30%, and **every retrace uses a new verb** | Glades ≈ 40%, each with a new tool (Mahler's rule). |
| Door alignment | Exact, to 0 tiles | HK: exact locally. |

### 3.3 Rest, orientation and flow

| Metric | Target | Reference range (source) |
|---|---|---|
| First Corner | **≤ 5 min and ≤ 3 rooms** from the start | HK: first bench 5 rooms in. Glades: well 2.3 screens from spawn. |
| Corner spacing | Every **3–6 min** of first-pass play; 1 per 35–50 scr²; every arena or boss door ≤ 1 room from a Corner. Region: **4 Corners.** | HK 1 per 60 scr² (too sparse for our opening). Wisps wells 14 screens apart plus checkpoints. |
| **Death run** (Corner → worst door of any room, bot path × 1.3) | **median ≤ 30 s, max ≤ 60 s** | HK 24/48 s lower bound, so ≈ 31–38 / 62–77 s real. Wisps < 1 screen. |
| Hazard respawn | A safe-ground marker ≤ 5 s of travel before every hazard (G5) | HK: 146 hazard-respawn markers in 45 scenes. |
| **Landmark spacing** | A new named landmark or vista **every ≤ 3 screen-widths** (≤ 90 tiles, ~10 s of running) of critical path. **Every room is within 1 room of a landmark**, and every junction has a waymark. | Glades: median 3.3 screen widths. Wisps: 1 per 2.5 screens. HK: 1 per 2.4 rooms, 44 of 45 within 2 rooms. |
| Beacons | **≥ 2**, each visible from ≥ 4 rooms and drawn at its true world position in the neighbours' backdrops. **≥ 1 audible beacon per region.** | HK: the Temple façade and Cornifer's humming. Wisps: the mill seen from the Marsh. |
| Named landmarks in the region | 18–24 | HK 19 per 45 rooms. Glades 13 per 1,900 u. |
| Vistas and reveals | **≥ 3 in the first 20 min**, each **after a compression** (a narrow space), each ≥ 2 screens and ≥ 75% open | The Glades Spirit Tree (91% open, after the Caverns). The Wisps arrival spaces. |
| **Flow chains** | **≥ 1 designed chain per 10 min of critical path. Each allows ≥ 15 s unbroken** (bot-optimal; ≈ 135 tiles ≈ 4.5 screen widths). **One showpiece chain ≥ 30 s that crosses ≥ 1 edge exit.** ≥ 60% of chain length is level or descending. | Glades TAS median ≈ 20 s, max 39 s (upper bounds); human bursts 5–20 s. Wisps 3–5 verbs per 1.5–3 screens. HK: one room ≈ 7 s door to door. |
| Obstacle cadence on chains | A beat (bump, gap, prop, enemy, spring) every **8–12 tiles** (6–10 PH, ≈ 1–1.3 s) | Glades: every 6–8 OH. Wisps: a movement object every ~10 PH. |
| Direction reversals, spawn → first Corner | ≤ 3 per minute | Glades: 3 in 80 s (spawn → Sein) against 21 on the keystone backtrack (Glades "avoid"). |
| Calm vs intense | 70–80% calm by time. Never two high-intensity rooms back to back. ≥ 60 s of calm after each peak. | Glades 75–80% calm. Greenpath ≈ 70%. Wisps ≈ 90%. |

### 3.4 Encounters, rewards and camera

| Metric | Target | Reference range (source) |
|---|---|---|
| Enemy density, overall | **0.3–0.5 per scr²**, at the low end in the first 20 min | HK 0.48 overall (measured). Glades ≈ 0.5 per Ori screen. |
| Hub enemy density at fever 0 | **≤ 0.15 per scr²**: a town, not a dungeon. Chained or ambient threats only. | The Wisps town has 0. |
| Enemy-free rooms | 45–55%. **Junctions, Corners and landmark rooms stay empty.** | HK 49% (measured). |
| Density in enemy rooms | 0.6–0.8 per scr², ≤ 3 in view, ≤ 2 attack tokens | HK 0.74 (measured). Combat spec C10. |
| **Forced combat** (doors lock, or the path is blocked until a kill) | **≤ 10% of critical-path time. No locked arena in the first 20 min.** At most 1 locked arena per 6 rooms in the region. | Wisps: 6% of Marsh paths need a kill. HK: 8 set-piece fights per 45 rooms. L3 novice: The Pit killed a newcomer every ~40 s. |
| Rooms holding something | **≥ 70%**: a pickup, lore, a Poundage cache, a breakable reward, an NPC or a Corner | HK 76% (measured). |
| Pickup density | 0.25–0.4 per scr² | HK 0.28 (measured). Glades 0.7 per Ori screen. Wisps 1 per 5 screens. |
| Hidden spaces | In 20–30% of rooms. **Secrets hum quietly, never silently** (audible within 6 tiles). | HK 27% (measured). |
| Visible promises | **≥ 1/3 of pickups are seen before they can be reached.** ≥ 3 are logged by 10 min. | Glades 34% need a later skill. Wisps: "show the reward before the route". |
| Breakable dressing | ≥ 3 things per screen react to a jab | HK ≈ 7.5 breakables per room: "hitting the scenery always does something". |
| Camera zones | **≥ 80% of rooms have ≥ 1 authored zone** (median 2). Every set piece has a `vista` or a `frame`. Every lock taught in a room shares a frame with its key. | HK 87%, median 2 (measured). |
| Depth bands per view | ≥ 5: dark foreground occluder, playfield, mid set-dressing, 1–3 fogged back planes, and a sky or light plate | Glades ≥ 5 bands. PLAN §1. |
| Scene value | Median luminance 0.05–0.2. **Only Kid, live hums, pickups and the ticker numerals are near-white.** | Glades median 0.04–0.19. |
| Music states | ≥ 2 loops per region keyed to progress, plus a distinct cue for each vista and for the region exit | Wisps: ≥ 2 per area (Coker), Marsh 5. |
| Signature object uses | **≥ 7 distinct uses** of the Cellars' scale and counterweight (§5.2) | The Wisps mill's wheel: ≥ 8 uses. |

---

## 4. The first 20 minutes, beat by beat

This is a typical first-time player. A slower novice reaches the Slip at about 25 min, and that's fine. Times are cumulative. Sizes are in screens (W × H). The teaching tags follow world-design §6.4: **I**ntroduce, **T**est, t**W**ist, **C**ombine.

### 4.1 The region at a glance

```
 sky       the Exchange Bell tower (the Receivership, sealed): on the skyline of every hub exterior room
 roofs     [T01 Carters' Viaduct ══ descends E ══╗]      [T08 Bourse Gate]   [T09 Chimney Walk ═══════════][T12
           (arrival vista over the whole Tally)  ║        (locked: Members  (roofs over the Cross and Pawn Row)  Scaffold
 street    [T02 Evictions Yard]═[T03 Rag Market]═[    T04 TALLY CROSS     ]═[T05 Pawn Row ═════════]═[T06 East Gate] Spine]
           W: the Row gate (ghost houses)        [ Ticker Board · 4 tiers ]  ↘[X1 Pawn Loft]           E: the Flats
           [T13 Registry Steps] off the Cross's west upper tier   hatch ▼     [T07 Gavel Lift Foot]
 gutter    [T11 West Stair]═══[T10 Gutter Arcade ══════════ store lift ▲ (bolt below) ══════ ]═[T07]
 cellars       [C05 Copyist]  [C02 GREAT SCALE HALL]◄═[C01 Spoil Slide ◄═ descends W from the hatch]
               (off the gallery) [C03 Bellows Closet]→[C04 Kennel Lots]═[C10 Vault Row]
 deep                                     [C06 Counterweight Shaft]
                                          [C07 Distraint Store]═[C08 Undercroft Run ═════════]═[C09 Ticker Hall]▲ to the Bourse Stairs (stub)
```

**The compass** (HK's lock showroom, made Tallage's):

| Direction | Exit | Key |
|---|---|---|
| Up (N) | Bourse Gate | Opened from the Bourse side |
| Down (S) | Gavel Lift | The Auctioneer |
| West | Mortgaged Row | Rope Skip plus a brown recoil |
| East | The Static Flats | Fever ≥ 3 |
| — | The Hum Registry | Writ |
| Down | The Cellars hatch | **Open**: Seize |

- **Tally Cross is the fixed origin**, and the Bell tower is always "up". The descent through the Cellars runs **west, then back east, then deep**, and that fold is where the path ratio comes from.
- **Loops:**
  - **L1**, the roofs (T04–T05–T06–T12–T09–T04), is open with no ability.
  - **L2**, under the street (T04–T03–T02–T11–T10–T07–T05–T04), is open with no ability, though the Gutter's Slip gaps are promises.
  - **L3**, the Cellars ring (C04–C06–C07–C08–C10–C04), needs the Slip.
  - **The U-bend** closes through the store lift (C07 → T10).
- **Corners:** Cross (T04), Scalehouse (C02), Shaft-foot (C06), and Ticker Hall (C09).

**Old world-design ids:**

| New | Old |
|---|---|
| T02 | T1 |
| T04 | T2 |
| T05 | T3 |
| C02 | B2 |
| C03 | X6 |
| C04 | B3 |
| C05 | the Copyist's part of B4 |
| C07 | B5 |
| C09 | B6 |

Everything else is new. See §7.

### 4.2 Beat by beat

**0:00 · T01 Carters' Viaduct** (5 × 2, set piece, `vista` 0.8 on entry, then 0.9)
- **Does:** Kid is booted off the back of a Receiver's cart onto an elevated carters' road high over the west of the city. She runs and jumps east along a gently descending viaduct: bales, broken railings, a first 5-tile gap. Jabbing the pawn tags on the bales scatters them. This is the first **flow** stretch, ~15 s, descending about 7°, with no enemies.
- **Sees:** **the first vista.** The whole Tally is laid out below at dusk.
  - The **Ticker Board** blinks prices on the square's north face.
  - The **Exchange Bell tower** stands on the skyline, top centre.
  - The Gavel Lift's headframe wheel.
  - Pawn Row's brass balls.
  - West, the **ghost houses of Mortgaged Row**: dashed outlines, silent.
  - East, static haze flickering past the city wall.
  - The crowd roar rises as the viaduct descends.
- **0:40, Seize I.** The cart has jammed across the ramp down, its axle grinding (a brown hum). One press of Seize: the grind cuts to silence, the cart becomes a dashed ghost, and a brown puck ribbons into the bag. The needle swings to MIDDLE. Kid walks through. There's nothing else to do and no threat (the L3 tooltip test).
- **Feels:** "This city is huge, and I'm going down into it."

**0:50 · T02 Evictions Yard** (3 × 2)
- **Does:** the ramp spirals down into a yard of evicted furniture. Wardrobes, bedsteads and rocking chairs hum on the cobbles.
- **1:30, Seize T.** Humming scaffold planks bridge a **static gutter**, a white crackle that is hazard-class. Seize the humming barricade ahead, not the plank you're standing on. If you seize your own plank, you drop into static: 1 pip, then a respawn at safe ground 2 tiles back.
- **2:15, Levy I.** A rocking chair creaks (pink). Its sound is the only way up the 6-tile yard wall. Geometry does the teaching: the chair sits in a corner, so the natural throw hits the wall, and pink becomes a spring (L3's best moment).
- **Sees:** the **Row gate** in the west wall: a portcullis, and past it the ghost houses. A 9-tile wall is marked with a lock glyph for Rope Skip. It's the first seen lock.
- **Feels:** "Taking a sound unmakes the thing, so be careful what you take."

**2:30 · T03 Rag Market** (3.5 × 1.7)
- **Does:** a narrow, crowded market lane. This is the **compression** before the Cross.
  - Stalls, awnings and bunting. Background crowd silhouettes bob, and the babble swells.
  - About 5 breakables per screen.
- **3:00, Levy T.** The lane climbs over stall roofs. Creaking pink stalls give springs over two static gutters, and a missed spring costs a pip.
- **Sees:** the Ticker Board's top edge over the rooftops, getting closer.
- **Feels:** busy, cramped, loud.

**3:30 · T04 Tally Cross** (4 × 4.5, 18 scr², **the second reveal**, `vista` 0.75)
- **Does:** the lane bursts into a tall square.
  - **The reveal:** four tiers of galleries rise around the **Ticker Board**, which fills the north face with clattering numerals. The Bell tower stands framed through the open top, and the crowd is loudest here.
- **4:15, the first Corner.** The Cross Corner is a stool and bucket under the board. The Registry clerk's desk hands over the **Tally ledger** (the hub map), within 1 room of the reveal.
- **Sees:** the showroom of locks, all from one square.
  - The **Bourse Gate** up on the top tier: "Members only until the Bell".
  - The **Gavel Lift** headframe past the east arch.
  - The brown **hatch** in the square's floor, humming.
  - A **balcony 12 tiles up**, unreachable: a fever-1 route.
- **Feels:** "This is the centre. Everything comes back here."

**4:30–8:00 · The hub circuit** (optional, typically taken, about 3–4 min)
- **Pawn Row (T05, 4.5 × 1.7).** A long street of pawnshops under the three brass balls. **A 9-tile collapsed gap** separates the pawnbroker's roof from the street, with a Poundage glint beyond it: the first seen Slip promise.
- **~5:45, the first secret.** A pawnshop wall hums *quietly*, in a way the player now recognises. Seize it to reach **X1 Pawn Loft**, which holds a Chin piece.
- **East Gate (T06, 2.5 × 2).** A dead end that pays out.
  - The city gate is barred. White static crackles through the bars, and a fever gauge on the gate reads 0 of 3.
  - A Poundage cache sits in the gatehouse.
  - Up the **Scaffold Spine** (T12): overbuilt boom scaffolding with humming planks.
- **~7:00, Chimney Walk (T09, 6 × 1.5, `open` 0.9).** Chimney pots and bunting lines over the city.
  - Looking down into the Cross shows **where you've been**.
  - Looking west, the ghost Row; looking east, the Flats haze.
  - It drops back into the Cross's top tier by the Bourse Gate. **The first loop closes.**
- **Optional:**
  - **The West Stair (T11) to the Gutter Arcade (T10).** A chained Barker, safe if you keep your distance, introduces a threat. You find a **lift cage bolted from below**, with no way to open it: the far side of the first shortcut. There are two Slip gaps.
  - **The Registry Steps (T13).** The Hum Registry's organ-pipe façade, where every pipe hums a registered sound. It's a Writ lock, and it pays out lore.
- **Feels:** "I can already picture this place, and I've seen five doors I can't open yet."

**8:00 · The hatch** (T04 floor, **Seize W**)
- Stand on the humming brown hatch and seize it. **The floor you're standing on unmakes itself**, and Kid drops. It's the Yard test flipped: the thing that cost a pip is now the answer.

**8:10 · C01 Spoil Slide** (5 × 2, `open` 0.9)
- **Does:** **the first real flow chain, ~20 s.** A descending tunnel of spoil and rubble on 1:4 and 1:2 slopes, running west under the Market.
  - Hops over props every ~10 tiles. No enemies.
  - A creaking pipe at the top gives a pink spring back up to the hatch, so the hub never strands you.
- **Sees and hears:** a column of street light falls from the hatch behind you (the Cellars' "up is home"). The crowd above goes muffled, lowpassed through the ceiling, and a brown rumble rises. Rounded, carved ceilings and warm dark close in, so the **compression** tightens to a 4-tile-tall neck.
- **Feels:** speed and descent.

**9:15 · C02 Great Scale Hall** (4 × 3.5, 14 scr², **the third reveal**, `vista` 0.75)
- **Sees:** the neck opens into a vaulted strongroom hall.
  - **The Great Scale** is a colossal balance: a 40-tile beam, pans 8 tiles wide, and a furnace roaring under the west pan.
  - Round vault doors line the walls.
- **~9:45, Corner 2.** The Scalehouse Corner sits in a gallery alcove.
- **~10:30, the Copyist.** His quill scratch is audible from the gallery. **C05 Copyist's Counting Room** is a dead end that pays out: one spring up gets you the Cellars ledger, and a green-shaded desk lamp is its waymark.
- **10:30–12:30, weigh-in I and Levy W.**
  - Seize the furnace's brown roar. You go heavy and your pan sinks, lifting the other pan to a ledge.
  - The fork, **Route A:** levy the brown onto a weigh-plate. Throwing weight *elsewhere* opens the plate door to C04.
  - The fork, **Route B:** stay heavy and push through the bellows gust corridor to **C03 Bellows Closet**, which holds a Chin piece, then drop into C04.
- **Sees:** a 17-tile violet facing chimney (X5 Furnace Loft) that you can't climb yet: a promise.
- **Feels:** awe, then "the room is a machine and my weight is the lever."

**12:30 · C04 Kennel Lots** (3.5 × 1.8)
- **Does:** Barkers chained to pawn-lot posts, with a raised spawn stoop and 120 f of grace.
  - **Seize W (on enemies):** a Barker's hum outline pulses pink three times as it crouches. Seize during that telegraph is **the Catch**: the lunge dies, and the Barker chases its bark.
  - **Seize + Levy C:** throw the bark back at its owner (return to sender). It's knocked down, the Count ring appears, and you seize it for good.
- **Sees:** a Barker guarding the portcullis to X4 Kennel Cache (the owner-chase), and the round-door corridor of C10 Vault Row, which is barred for now.

**14:30 · C06 Counterweight Shaft** (1.5 × 4.5, vertical core)
- **Does:** giant iron counterweights hang on humming chains. **Seize C (with weight):**
  - Seize a chain and its weight drops, hauling a cage up the other side. Ride it.
  - As heavy, ride a weight down.
  - The one wrong chain swings its weight across the shaft (a hazard).
  - The shaft floor is a one-way drop.
- **~15:45, Corner 3.** The Shaft-foot Corner is at the bottom, one room before the Store.

**16:00 · C07 Distraint Store** (3 × 2): the bottom of the U
- **Sees:** thousands of hanging pawn tags, and on a pedestal in Lot 19, **Kid's own ring shoes**.
- **Does:**
  - **A Grinder** patrols the lots. Stun it against a wall. This is an unlocked soft fight, and running also works.
  - **~17:00: the Slip.** It's the pit with the key inside. Both ways out need it:
    - a 10-tile static pit to the east;
    - the **store lift**, whose cage waits at the top of a shaft.
- **~17:30, the first shortcut.** Seize the lift's bolt (the far side of the cage seen from the Gutter). The counterweight drops, the cage carries you up into **T10 Gutter Arcade**, and you're 2 rooms from the Cross.
- **Feels:** "Oh, *this* is where that lift goes." (HK's Shaman-pillar moment.)

**17:30–20:00 · The hub opens up**
- **With the Slip, the promises pay:**
  - the Gutter's Slip gaps (a ledger page, and a route under the Cross);
  - Pawn Row's collapsed gap (the pawnbroker's roof: Poundage, plus a lore bill for the Auctioneer);
  - a Chimney Walk shortcut.
- The Cross's crowd hum now sounds different to a player who knows what it is. Every seen lock is inked on the ledger with its glyph.
- **The choice:** spend 2–3 min on hub pockets, or go back down to the Store's east pit.
- **Slip I → T → C, and the showpiece flow chain.** **C08 Undercroft Run** (7 × 1.6, `open` 0.9) is a long conduit under Pawn Row.
  - A humming ticker cable glows along the ceiling (the trail to the beacon's machinery).
  - Slip gaps and 1:4 descents, with Gulls dipping (violet).
  - The chain runs ≥ 30 s across the C07 → C08 → C09 seams.
  - Pink springs off creaking pipes combine with the Slip (Levy C).
  - It ends in **C09 Ticker Hall** (2 × 3.5): the chain-and-gear underside of the Ticker Board, clattering overhead. The fourth Corner is here, and so is the way up to the Bourse Stairs.

### 4.3 Teaching summary

Each beat is in a different room, and each of those rooms has a purpose beyond teaching (§6, P3).

| Verb | Introduce | Test | Twist | Combine |
|---|---|---|---|---|
| **Seize** | T01 cart, 0:40 | T02 scaffolds over static, 1:30 | T04 hatch: seize the floor you stand on, 8:00. C04: the Catch on an enemy, 12:30. | C04 return to sender, 13:30. C06 chains plus weight, 15:00. |
| **Levy** | T02 rocking chair → spring, 2:15 | T03 springs over static gutters, 3:00 | C02: throw weight elsewhere (the plate), 11:00 | C04 return to sender. C08 spring + Slip, ~19:00. |
| Weigh-in | C02 Great Scale, 10:30 | C02 fork | C06 riding counterweights | (Bourse Stairs: B8, outside the region) |
| Slip | C07, 17:00 | C07 pit exit | C08 gaps under Gulls | C08 with springs |

---

## 5. Region identity kits (code-drawn visuals, procedural audio only)

### 5.1 The Tally (hub)

| | |
|---|---|
| **In one line** | The loud, crowded, top-heavy heart of a city in a fever: the only place with sky, a crowd and the ticker. |
| **Palette** | The `pink` district base: rose lamps against teal-grey shadow, a dusk sky of deep indigo to a rose horizon, and dense amber window grids. A warm sodium-amber second light (market lanterns). The ticker numerals are the only cold near-white apart from Kid and live hums. **Fever steps warm the grade** (gain toward red) and saturate the bunting. Median luminance 0.10–0.20. |
| **Silhouette and shape language** | **Tall, narrow, leaning, top-heavy**: credit stacked on credit. Gables, stacked signage, overbuilt scaffolds and diagonals. Bunting and laundry catenaries are the only curves. Materials: brick, timber and iron. Mostly rectilinear collision, and street grades on 1:4 slopes. |
| **Layers** | A sky with the Bell tower (always), a skyline of leaning towers, mid facades with lit windows and **background crowd silhouettes** (procedural bobbing figures), the playfield, and a foreground of hanging signs, awnings, bunting and passers-by. Ticker-tape particles, vent steam, and lamp flicker in time with the fever BPM. |
| **Beacons** | The **Ticker Board**, visible from ≥ 6 rooms (T01, T03, T04, T05, T09, T13). The **Exchange Bell tower**, in the sky of every exterior room. |
| **Landmarks** | Carters' Viaduct arches · the jammed Receiver's cart (a ghost, then a wreck) · the Row gate and the ghost houses · Rag Market's bunting canopy · the Ticker Board · the Cross Corner stool · the Registry clerk's desk · the Hum Registry's organ-pipe façade · the Bourse Gate's marble steps and "Members only" board · Pawn Row's three brass balls · the Gavel Lift headframe wheel · the East Gate's fever gauge and static haze · the Scaffold Spine · Chimney Walk's pots · the bolted store-lift cage in the Gutter |
| **The world reacts** | **Seizing in the hub makes a local silence**: the crowd babble ducks around the seized thing, and nearby background figures turn to look. The city answers the bailiff. |
| **Ambience** (procedural) | A **crowd babble** bed: pink noise through 3–4 wandering formant band-passes with slow random gains. Footstep clatter. **Ticker clatter** (violet clicks, rate ∝ fever). A distant Bell toll every few minutes. The loudness is **a map**: loudest at the Cross, fading toward the edges, so "follow the noise" leads home. |
| **Music** | *The Tally*. Lead: a detuned street calliope (pulse waves with vibrato). The sparse layer plays at the edges and on the roofs; the full layer plays at the Cross. BPM rises one step per fever. A reveal sting plays for the Cross. |
| **Unmistakable because** | Sky, crowd, leaning verticals, rose light, and noise everywhere. |

### 5.2 The Cellars (the Bourse's brown strongrooms)

| | |
|---|---|
| **In one line** | Warm, dark, heavy vaults under the street, where title is weighed. **Weight rules the space.** |
| **Palette** | The `brown` district base: amber furnace glow against cool mauve shadow, iron grey, and gleaming brass vault dials. **No sky.** A ceiling is always in view. Light comes in pools, from furnaces and caged lamps, plus the shaft of street light under the hatch. Median luminance 0.05–0.12, darker than the hub. |
| **Silhouette and shape language** | **Circles and heavy horizontals**: round vault doors, barrel-vault arches, counterweights, and bottom-heavy piles of deed sacks. Chains are the only thin verticals. Materials: vault (smooth arcs), rock and soil (spoil, slopes), and iron (rivets, chains). **Dug and organic**: the §2.2 slope mix and 45–65% box fill. |
| **Signature object: the scale and counterweight**, with ≥ 7 uses | 1. **Landmark:** the Great Scale. 2. **Lock:** the weigh-plate door. 3. **Platform:** pans that tip with your weight class. 4. **Launcher:** a see-saw pan (drop a slab, fly from the other end). 5. **Elevator:** the counterweight cage (C06). 6. **Shortcut:** the store lift (C07 → T10). 7. **Hazard:** the wrong chain's swinging weight. 8. **Room twist:** C10 Vault Row's weigh-bridge floor, which tilts the whole corridor with your class. 9. **Reward:** the Copyist's ledger scale. |
| **Landmarks** | The hatch's light column · the Spoil Slide · **the Great Scale** · the Scalehouse Corner alcove · the Copyist's green lamp and paper trail · the Bellows Closet's gust vents · the Kennel lot-posts · the row of round vault doors · the Counterweight Shaft's iron weights · the Store's hanging pawn tags and the ring-shoe pedestal · the glowing ticker cable · the Ticker Hall's gearwork |
| **Ambience** (procedural) | A **brown-noise rumble** bed (lowpassed at about 80–200 Hz). Furnace roar breathing on an LFO. Chain clinks (metallic FM pings). Drips (short sine blips). **The street above**: the hub's babble lowpassed to about 300 Hz, so "up" is audible. The Copyist's quill scratch is an audible beacon two rooms out. **Pitch follows depth**: the drone's root drops a step for each stratum you descend. |
| **Music** | *Strongrooms*. Lead: a low bowed harmonium (FM, slow attack). The sparse layer is the default. The full layer adds a slow march pulse in the Scale Hall. Stings play for the Scale reveal and for the Slip pickup. |
| **Unmistakable because** | No sky, round shapes, warm dark, a low hum, and everything weighs something. |

**Cohesion across both regions:**
- **Lot-line studs** at every exit.
- **The ledger's glyphs** on every lock.
- **The same four noise colours** always mean the same materials.
- **The ticker cable** threads from the Cellars up to the board, so the hub's beacon has roots you can follow from below.

---

## 6. Experience rubric

These questions are used by the **continuous-run playtest** (STUDIO §2.4, a 10–20 min route) and by the **world cohesion review**. Each has a pass line. A loop that touches the world cites at least one of them in its acceptance criteria.

**Evidence:** continuous video, the region map PNG with the route drawn on it, the tester's notes, and a map sketch made *before* opening the ledger.

### Orientation
- **O1. Mental map.** At minute 10, before opening the ledger, the tester sketches the rooms visited and their joins. **Pass:** ≥ 80% of the joins are correct, and "up" and "down" are right for every vertical join.
- **O2. Home.** From any hub room and the first three Cellars rooms, the tester can point toward Tally Cross. **Pass:** correct in ≥ 90% of rooms asked.
- **O3. Landmarks from rests and junctions.** A screenshot at every Corner and junction shows ≥ 1 named landmark. **Pass:** no exceptions.
- **O4. Not lost.** **Pass:** no stretch of more than 90 s without either entering a new room or moving toward a goal the tester can name.

### Sense of place and cohesion
- **P1. Blind sort.** A reviewer is given 20 random screenshots from the region. **Pass:** they sort them into Tally vs Cellars with ≥ 90% accuracy, and place ≥ 7 of 10 within one room on the map.
- **P2. Every room is a place.** Every room has a one-line description *in the fiction* ("where evicted furniture is piled"), not only a mechanic ("the Levy test"). **Pass:** every room.
- **P3. No room exists only to test a mechanic.** Beyond any teaching role, each room also has ≥ 2 of: a place identity, a route role (junction, loop or connector), a reward, a landmark or vista. **Pass:** every room.
- **P4. No void past an open exit.** **Pass:** the neighbour's terrain is visible through every open exit, with no black.
- **P5. The tester's words.** **Pass:** unprompted, the tester describes the region as *one place*. Words like "level", "stage" or "test room" never come up.

### Desire to explore
- **E1. Detours.** **Pass:** the tester voluntarily detours ≥ 2 times in 20 min toward something seen off the critical path.
- **E2. Promises.** **Pass:** the tester logs ≥ 3 things seen but unreachable by minute 10, and ≥ 1 is paid off by minute 20.
- **E3. Novelty cadence.** Automated from world data along the critical path. **Pass:** a new landmark or vista every ≤ 3 screen-widths.
- **E4. Dead ends.** **Pass:** every dead end the tester enters pays out, with zero "empty" reactions.

### Flow and pacing
- **F1. Flow.** **Pass:** the bot measures ≥ 1 unbroken chain of ≥ 15 s per 10 min of critical path, **and** the tester reports at least one stretch of "flow" or "speed" unprompted.
- **F2. No forced stop.** **Pass:** no designated flow route contains a forced stop of more than 3 s (a door, a dead end or a required pause).
- **F3. Rhythm.** **Pass:** no two high-intensity rooms are adjacent on the critical path, and each peak is followed by ≥ 60 s of calm.
- **F4. Seams.** **Pass:** the tester never mentions loading, cuts or rooms "resetting" during movement, and no input is dropped at an edge exit (trace check).

### Scale
- **S1. Metrics.** **Pass:** `npm run world -- metrics` shows every §3 metric inside its range, or has a written exemption.
- **S2. Not boxed.** **Pass:** no exterior room is fully visible from its entrance at zoom 1.0.
- **S3. Ground covered.** **Pass:** the tester crosses ≥ 60 scr² of distinct space in the first 20 min.

### Teaching and fairness
- **T1. Four beats.** **Pass:** Seize and Levy each reach Introduce, Test, Twist and Combine in the first 20 min, in order, in different rooms (§4.3).
- **T2. Readable deaths.** **Pass:** the tester can explain every death ("I seized my own plank"). No death reads as random.
- **T3. Death runs.** **Pass:** the median measured Corner-to-death-spot return is ≤ 30 s, and the max is ≤ 60 s.

### Sound and identity (cohesion review)
- **A1. Ears only.** **Pass:** from audio-only clips, a listener tells Tally from Cellars ≥ 90% of the time, and hears depth (upper vs deep Cellars) ≥ 75% of the time.
- **A2. Heard before seen.** **Pass:** the Copyist and the Ticker Board are heard before they come into view.
- **C1. Palette.** **Pass:** every room uses its region palette, with ≤ 1 accent hue from outside the region's set, and a lint confirms it.
- **C2. Motif.** **Pass:** the region's shape motif (Tally: leaning verticals and catenaries; Cellars: circles and counterweights) is visible in ≥ 80% of that region's rooms.
- **C3. Signature uses.** **Pass:** the Cellars' scale and counterweight appear in ≥ 7 distinct uses (§5.2).
- **C4. Landmarks are data.** **Pass:** every landmark is a named `Landmark` entity and appears on the generated map.

---

## 7. Changes required

Each item is sized to become a loop brief or part of one. The order is the critical path.

### 7.1 `world-design.md` (world owner)
1. **Replace §4.1–§4.3 for the Tally and Cellars** with this document's region: 22–28 rooms, world positions, and the ids in §4.1, with the old ids mapped.
   - The Stairs (B8–B13) stay as a stub, to be re-scaled at teardown size when they are blocked out.
   - Update the §4.8 machine graph: new ids, `world: {x, y}`, the loops, the store-lift shortcut, and 4 Corners.
2. **Rewrite the §6.1 room rules:**
   - "Rooms ≥ 30 × 17" becomes the §3.1 minimums.
   - "Boss arenas exactly 30 × 17" becomes 1.5–2.5 screens inside a `lock` zone.
   - "Shafts in multiples of 17" becomes vertical cores ≥ 1.3 screens wide, except the spines.
   - "Doors ≥ 2 tiles" becomes edge-exit openings ≥ 3 tiles tall or wide.
3. **Corner rule.** "At most 3 rooms between Corners" becomes a time and distance rule: Corners every 3–6 min, death run median ≤ 30 s and max ≤ 60 s, and ≤ 1 room from any arena door. The validator's Corner check changes to match.
4. **Add the hub compass** (§4.1):
   - distinct keys per exit;
   - the Exchange Bell tower as the always-visible, sealed endgame;
   - hub fever-0 enemy density ≤ 0.15 per scr²;
   - hub one-way edges = 0.
5. **Move the Levy introduction into the hub** (T02/T03), and keep the first Seize by 0:45. Put the Copyist within 2 rooms of the Cellars entrance, and the Tally ledger at the Cross.
6. **Add the lot-line rule to W2** (the diegetic bag reset at room edges), plus the rule that flow chains crossing a seam use movement only.
7. **Add a "signature object ≥ 7 uses" rule for every district.** For the Cellars it is the scale and counterweight. The Foundry, the Row and the others get theirs when they're designed.
8. **Add the room-builder rules:**
   - no flow route ends face-on at plain masonry at speed;
   - descend to flow, climb in cores;
   - compress before every reveal;
   - every room gets a fiction line (rubric P2).

### 7.2 Level toolchain plan (`level-toolchain.md` Phase T1)
1. **Confirmed as the critical path:** A1–A3 (LDtk subset, brush bake, compiler, world coordinates), then A4 edge exits.
   - Change A4's fade from "8–12 frames" to **≤ 8 frames with no black**, keep camera continuity across the seam, and keep momentum, coyote and Slip state.
2. **Promote neighbour peek (B3) and camera bleed** from "nice" to **required for the Phase W blockout** (rubric P4).
3. **Promote beacons into T1:**
   - `Landmark` entities with `class` (beacon, waymark or set piece) and a `name`, listed in `toc`;
   - beacons drawn in neighbours' backdrops at their true world position (the Ticker Board and the Bell tower).
4. **Add `npm run world -- metrics`**, which computes every §3 metric from world data with pass/fail against the ranges:
   - room sizes and shapes, the "fully visible from entrance" check, loops and dead ends;
   - landmark spacing along an `Anchor`-defined critical path;
   - Corner death runs from bot path lengths;
   - camera-zone coverage, floor-angle mix, the straight-run rule, and box fill.
   - Warnings first, then gates, once the blockout exists.
5. **Add a flow-chain metric** to the bot or `feel:report`: the longest input-held stretch without a neutral gap of 6 f or more, per route, **across edge exits**.
6. **Brush and skin materials per region:** the hub gets brick, timber and iron; the Cellars get vault, rock, soil and iron. Add a `curve` brush that emits 1:4 as well as 1:2 and 45° (C3).
7. **Prop kit v1** adds signposts with lock glyphs, lot-line studs, and the scale pieces (pan, beam, counterweight, chain) as parameterised code-drawn props.
8. **The world PNG with the route overlay** is the standard evidence artefact for the cohesion review.
9. The merged region space stays in T2, with the trigger in §2.3.

### 7.3 Movement (movement owner; never parallel with another controller change)
1. **Floor slopes 1:4, 1:2 and 1:1** (toolchain C1, with 1:4 added):
   - integer surface tables and a two-column feet sensor;
   - step-up and ground-stick;
   - constant `vx`, and a normal jump from a slope;
   - a grounded Slip follows the slope, and an air Slip passes through slope air;
   - mirror swap of the slope tiles.
   - The exact V-tests and every tape stay bit-identical in rooms without slopes. Add new slope V-tests: no airborne frames when walking up or down at every speed, and mirror identity.
2. **Shared actor surface helper** (C2): walkers treat slopes as ground (a Barker doesn't turn at a ramp top), shots hit the solid part of a slope, and the bot flow field and the progression fill both accept slope cells.
3. **Edge-exit arrival:** preserve momentum, facing, coyote, the Slip and the dash cooldown; allow ≤ 4 f of input grace; and add tapes that cross a boundary.
4. **The L3 novice soft-lock:** a spring levied onto open floor must be re-seizable on foot (combat and signature owner). The T02 Levy introduction depends on it.
5. **W4 (cling only on facings) keeps its kill criterion.** Add the level rule from §2.2 to the playtest checklist.
6. **Experiment slot, not decided:** "brown sinks". Heavy gains +10–15% `vx` on descending slopes, feather gains nothing. It's a signature-flavoured momentum idea to test in greybox after slopes land, with a kill criterion if it breaks the reach table's proofs.

### 7.4 Camera (render owner; toolchain B2)
1. **Render-only zoom:**
   - default 1.0, limits 0.75–1.1, eased over 45–60 f and capped per frame;
   - clamps and zones computed on the zoomed view;
   - backdrops baked with a 1/0.75 margin;
   - the low quality tier caps zoom at 0.9.
2. **Zone modes:**
   - `open` (0.9);
   - `vista` (one-shot, 0.75–0.8, held 60–120 f with input live, not repeated on backtrack);
   - `frame` (bias toward a point, for a lock and its key, or a landmark on approach);
   - an optional `zoom` field on every zone;
   - arenas are `lock` at 1.0.
3. **Speed-scaled lookahead** for Slip chains, and an **upward lead** for spring rides.
4. **Continuity across edge exits.** The camera carries its world position and blends. It never re-snaps. Bleed shows the neighbour.
5. **Lints:** a landing that's out of view at take-off; a set piece with no `vista` or `frame`; zone coverage under 80%.

### 7.5 Also needed (other owners)
- **Audio:**
  - region ambience beds (crowd babble for the hub; brown rumble plus the muffled street for the Cellars);
  - spatial beacons audible across rooms (the ticker, the Copyist's quill);
  - the depth-pitch rule, and the hub's loudness map;
  - two music loops per region, plus vista and pickup stings;
  - the local-silence duck on a seize.
- **Art direction:** lock the two region palettes and shape motifs from §5. Background crowd silhouettes, ticker-tape particles, the lot-line stud, and the ghost-house style for the Row.
- **Combat:** confirm the Kennel's Catch reads (the pulse count and the visible open state; L3 novice §4). Enemy placement follows §3.4, with no locked arena in the first 20 min.

### 7.6 Suggested loop order
1. **T1 stream A**, to get world coordinates and edge exits working.
2. In parallel: **slopes** (7.3.1–2), and **camera zoom, peek and beacons** (7.4, 7.2.2–3).
3. **Region blockout stage 1**: the §4 route plus every room visible from it, about 16 rooms and ~90 scr². Measure it against §3 and run the first continuous-run playtest.
4. **Blockout stage 2**, to the full region and the audio beds. Then the cohesion review and a taste checkpoint.

---

## What the metrics can't see

The numbers bound scale, density and spacing. They don't prove that a reveal lands, that a room's composition leads the eye, or that the city feels alive rather than busy. Those are judged by:
- the continuous-run playtester, against rubric O, P, E and F;
- the world owner's cohesion review, against rubric A and C;
- the user at each taste checkpoint: "Does this feel like it's heading toward Hollow Knight or Ori, and like its own place?"

## Sources

- `docs/research/teardown-hk-crossroads.md`: §Units (13.2 PH), §2 (sizes), §3 (graph, one-ways, shortcuts, exits), §4 (death runs), §5 (landmarks), §7 (encounters), §8 (rewards), §10 (camera zones, fades), §13
- `docs/research/teardown-hk-greenpath.md`: §12 and §13, qualitative lessons only (§0 above)
- `docs/research/teardown-ori-sunken-glades.md`: §Units (21 OH), §2 (segments), §5 (landmark spacing), §6 (flow chains, slope physics), §9.2 (floor angles), §12, §13
- `docs/research/teardown-ori-wotw.md`: §0 (the conversion rule), §2 (scene sizes), §3 (path ratio, one-ways), §5, §6, §9 (the Wellspring's single shape), §12, §13
- `docs/research/level-toolchain.md`: §1 (our baseline), §2.4 (LDtk and brushes), §3 (slopes), §4 (skin, landmarks), §5 (camera), §6 (edge exits, peek), §7 (Phase T1)
- `docs/design/world-design.md` rev 2; `docs/concepts/raw-L1-p4.md` Concept A; `docs/design/movement-spec.md` §1.1, §3.4, §4; `docs/design/combat-spec.md` §1, §4.4; `docs/reports/L3-novice-playtest.md`
