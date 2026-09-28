# Teardown: Ori and the Will of the Wisps, Inkwater Marsh, the Wellspring and Wellspring Glades

Scope: the opening area (Inkwater Marsh, including Howl's Den), the first set-piece area (the Wellspring watermill, outer and inner) and the hub (Wellspring Glades). Every number is labelled **measured**, **derived** or **estimated** as the template asks. Section 0 explains the units, because they matter more for Ori than for any other reference game.

## 0. Units and how they were measured

Ori is almost seamless, so "rooms" here are the game's own **streaming scene chunks**: each has a `boundaries` rectangle (in world units) in the community's `scenes3.1.json` dump of the shipped game (patch 3.1) [S1]. These are the regions the game streams and the camera works within; they are the closest thing Ori has to rooms and they are what its designers named and built. Graph structure comes from the randomizer's logic file `areas.wotw` [S2], which names every reachable anchor with a world coordinate and lists every connection, pickup, lever state and refill, and from `loc_data.csv` [S3], which lists all 390 pickups with zone and coordinates.

**World unit.** The speedrunning community states "1 unit = 1 Ori height" [S4] (measured by them with the LiveSplit OriWotW memory reader).

**Screen.** I measured Ori in Steam's official 1920×1080 screenshots [S5]: Ori stands 50–55 px tall including ears (measured, two screenshots: the Luma Pools shot and the spirit-well shot). So the default gameplay camera shows 1080 / 52 ≈ **21 units tall** and, at 16:9, **37 units wide** (derived, ±10%; the camera also zooms out in large rooms and in). Corroboration: the six Moki hut interiors are fixed-camera single-screen rooms and their scene bounds are 36×28 units (measured), i.e. exactly one screen wide.

**Conversion to Tallage.** One Ori screen = one Tallage screen (1920×1080). But Ori's screen is **21 player heights tall**, versus Tallage's 13.5: Ori's camera is 1.55× further out relative to the character. So there are two honest conversions and this document gives both:
- **by screens**: Ori W/37 and H/21 → Tallage screens → ×30 and ×16.9 for tiles;
- **by player heights**: Ori units are already player heights.
The "by screens" numbers are the ones to copy for sense of place; the "by player heights" numbers are the ones to copy for jump-scale platforming density. §13 says which to use where.

## 1. Overview

| | Inkwater Marsh (+ Howl's Den) | The Wellspring (outer + inner mill) | Wellspring Glades (hub) |
|---|---|---|---|
| Role | First real area after the prologue; tutorialises movement, torch, sword, double jump, bow; first boss-chase (Howl) | First set-piece area: a giant watermill whose wheels are seized; ends in the game's first escape sequence | Safe town hub, unlocked by breaking Grom's wall; upgrades over the game |
| Arrival time | ~0:10 into the game (after prologue) | ~2–3 h in for a first-time player (after Marsh, Kwolok's Hollow, Glades) (**estimated**) | ~2 h (**estimated**), right before the Wellspring |
| Abilities on arrival | Wall-jump and wall-cling only; torch is temporary | Wall-jump, Spirit Edge, Double Jump, Regenerate, Spirit Arc, Dash, Bash (+ Sentry/Spirit Smash if bought) | Same as Wellspring minus Grapple |
| Abilities gained here | Spirit Edge, Double Jump, Regenerate, Spirit Arc; shards Magnet, Sticky, Resilience, Reckless, Life Pact [S6] | Grapple; shards Thorn, Life Harvest, Ultra Grapple [S7] | Ancestral Light; shards Arcing, Bounty, Secret [S8] |
| Pickups (loc_data) | 56 (23 resource, 18 spirit light, 5 shards, 5 abilities, 4 quest, 1 shop) (**measured**) | 38 (11 resource, 17 spirit light, 3 shards, 1 ability, 5 quest, 1 shop) | 40 (10 resource, 18 spirit light, 2 shards, 1 ability, 9 quest) |
| Wiki collectible counts | 5 life-cell frags, 6 energy frags, 6 keystones + 2 eyestones, 6 Gorlek ore, 2 shrines, 1 trial, 2 spirit wells [S6] | 2 life, 3 energy, 0 keystones, 6 ore, 0 shrines, 1 trial, 1 well [S7] | 2 energy, 4 ore, 1 shrine, 0 trials, 1 well (needs 1 ore to repair) [S8] |
| Logic anchors / directed connections (`areas.wotw`) | 48 anchors, 120 directed conns (110 internal) (**measured**) | 32 anchors, 85 conns (79 internal) | 29 anchors, 67 conns (54 internal) |
| Scene chunks ("rooms") | 29 gameplay scenes + 3 background-only scenes (**measured**) | 25 (6 outer, 19 inner incl. 7 escape chunks) | 13 (2 hub chunks, 1 transition, West Glades room, shrine, connector, cave, 6 hut interiors) |
| Footprint (anchor bbox) | 852×396 u = **23×19 screens** (**derived**) | Outer 280×339 u = 7.6×16 screens; inner tower 321×411 u = **8.7×19.6 screens** | Town 358×121 u = **9.7×5.8 screens**; West Glades adds ~4.3×5.9 |
| First-pass play time | 45–75 min (**estimated**; the 100% first-pass video route reaches 73% of the area [S9]; the whole game is 11–12 h main story) | 45–70 min (**estimated**; the optimised route gets 97% on the first pass [S9]) | 5–10 min per visit, ~10 visits over the game (**estimated**) |

Sequence: Marsh → (eyestone door) → Kwolok's Hollow (Dash, Bash) → break Grom's wall → Glades → Wellspring → escape → back to Kwolok via the Glades well → Silent Woods. So the first three hours are a linear U-bend that passes through the hub twice before the world opens: exactly Mark Brown's Silksong pacing in `PLAN.md` §3.4.

## 2. Room size distribution

Scene bounds from `scenes3.1.json` [S1], with background-only, "Setups" and "Master" layers excluded (they overlay gameplay scenes and would double count). Sizes are the bounding box of each scene's boundary rectangles. All **measured**, conversions **derived** at 37×21 units per screen.

### Inkwater Marsh (29 scenes)

| | Width | Height |
|---|---|---|
| min | 42 u = 1.1 screens = 42 player heights | 30 u = 1.4 screens |
| **median** | **~100 u = 2.7 screens** (= 80 Tallage tiles) | **~62 u = 3.0 screens** (= 51 tiles) |
| max | 207 u = 5.6 screens | 121 u = 5.8 screens |
| median area | ~8 screens | |
| sum of scene areas | ~290 screens (scenes overlap slightly at seams) | |

Shape mix: 16 horizontal (aspect > 1.4, **57%**), 2 vertical (aspect < 0.8, **7%**), 11 squarish (36%). 20 of 29 scenes exceed 6 screens of area; the median Ori "room" is bigger than any room in our current levels.

### The Wellspring (25 scenes)

| | Width | Height |
|---|---|---|
| min | 42 u = 1.1 screens | 32 u = 1.5 screens |
| **median** | **108 u = 2.9 screens** | **68 u = 3.2 screens** |
| max | 279 u = 7.5 screens | 160 u = 7.6 screens |
| median area | 8.4 screens | |
| sum of scene areas | ~317 screens (outer 132, inner 185) | |

Shape mix: 14 horizontal (56%), 4 vertical (16%), 7 squarish (28%). The inner mill is three stacked interior sections (A: y −4009…−3848, B: −3848…−3678, C: −3719…−3598, in world units), i.e. a **tower 8.7 screens wide and 19.6 screens tall**, but each section reads as a vertically-biased puzzle box rather than a shaft.

### Wellspring Glades (13 scenes)

| | Width | Height |
|---|---|---|
| min | 36 u = 1.0 screen (hut interiors, 36×28 u) | 28 u = 1.3 screens |
| median | 78 u = 2.1 screens | 54 u = 2.6 screens |
| max | 206 u = 5.6 screens | 124 u = 5.9 screens |
| sum of scene areas | ~120 screens | |

Shape mix: 4 horizontal (31%), 2 vertical (15%), 7 squarish (54%). The town proper is two chunks totalling 358×121 u (9.7×5.8 screens): a wide, shallow strip you can read left-to-right.

### The 5 largest rooms across the three areas

| Scene | Size (units) | Screens | What it is |
|---|---|---|---|
| waterMillEntrance | 279×159 | 7.5×7.6 | The outer Wellspring courtyard with the three giant wheels and the entrance door; everything outside the mill happens against this backdrop |
| waterMillEntranceTop | 216×136 | 5.8×6.5 | Upper outer Wellspring: grapple ascents, the trial, the "rotating spikes" climb to Ultra Grapple |
| swampIntroTop | 207×96 | 5.6×4.6 | Marsh spawn: Inkwater Well, the first left-hand life-cell detour, the breaking bridge |
| willOfTheWispsLagoonConnection | 207×80 | 5.6×3.8 | Marsh west of spawn: turrets, the signpost toward Luma Pools |
| wellspringGladesHub | 206×112 | 5.6×5.4 | The Glades town: Grom, Twillen, the well, the great tree |

Note the pattern: the biggest scenes are the **arrival/overview** spaces (spawn, the mill courtyard, the town). Puzzle and challenge scenes are 2–3.5 screens wide.

## 3. Graph structure

All numbers from `areas.wotw` [S2] (**measured**), path lengths **derived** by summing straight-line distances between consecutive anchors along the intended route (a lower bound on actual travel).

### Inkwater Marsh
- **Nodes** 48 (MarshSpawn 18, MarshPastOpher 14, HowlsDen 14, 2 shrines). **Edges** 110 internal directed; 47 bidirectional pairs; **26 one-way** edges (drops, breaking bridge, one-way wall, bone barriers).
- **Loops**: the Den is a loop (enter by the long drop at BoneBridge, exit by climbing back through a keystone door to AboveBoneBridge); Howl's Den also has an inner upper loop (UpperLoopEntrance/Exit bone doors) and a bottom loop through the secret room; the Opher clearing → Bow path → PoolsPath → back to spawn forms a big outer loop once the one-way wall is passed.
- **Dead ends**: FangPlatform, LeftSecretRoom (hidden life cell), UpperBowArea, LifepactLedge, BurrowsEntry (until the bells puzzle).
- **Hub degree**: MillView (Opher's clearing) 9, PoolsBurrowsSignpost 8, BowApproach 8, AboveBoneBridge 8, BoneBridge 7. The Opher clearing is the Marsh's hub: it is the largest open space, it has the Opher shop, the trial start, the vista of the mill, and paths to four regions.
- **Locks**: 2 keystone doors (2 keys each: Tokk's gate, Howl's Den gate), 1 eyestone door (2 eyestones, exit east), 22 breakable walls/branches in casual-logic paths, 3 lock-in fight arenas (CaveFight, BurrowArena, DoubleJumpTreeCombat).
- **Shortcuts** (10, all unlocked from the far side after a loop): UpperLoopExitBarrier, BoneBarrier, TrunkWall, PoolsPathOneWayWall/PoolsPathFloor, SecretRoomWall, LogBroken, BurrowsOpen, DamageTreeOpen, MidnightBurrows.HowlsDenShortcut (return route from the Burrows), WheelFreed (to Luma).
- **Exits** to other areas: east to Kwolok's Hollow (eyestone door), west to Luma Pools ×2 (a water route past turrets that needs Water, and a breakable wall at PoolsPathWest), south to Midnight Burrows ×2 (the bells door; the Den→Burrows wall), plus 2 teleporters (Inkwater Well, Howl's Den well).
- **Critical path**: 2,763 u of polyline (**≈75 screens of travel**, including the descent into and climb out of the Den) versus 364 u (10 screens) straight-line from spawn to the exit door: a **path/straight-line ratio of 7.6**. The player walks about 7 screens for every screen of net progress.

### The Wellspring
- **Nodes** 32 (Outer 13, Inner 19). **Edges** 79 internal; 33 pairs; **19 one-way**.
- **The doors are cuts.** The three mill doors (entrance, west/east, top) each connect an outer anchor to an inner anchor 250–400 u away in world space: OuterWellspring.EntranceDoor (−856, −4057) ↔ InnerWellspring.EntranceDoor (−1263, −3952); WestDoor (−892, −3991) ↔ (−1205, −3894); EastDoor (−814, −3972) ↔ (−1190, −3732); TopDoor (−836, −3927) ↔ Teleporter (−1308, −3674). The interior is a separate space stitched to the courtyard by fades, and the player never notices, because both sides show the same wheels.
- **Loops**: outer courtyard is a ring (entrance ↔ above-entrance ↔ west door ↔ east door ↔ right wall ↔ entrance); inner A has a lever-opened return (ShortCutWheel, FallingWheel); inner B is entered at the bottom and exited at the top with a door back to the courtyard (a vertical loop).
- **Hub degree**: OuterWellspring.EntranceDoor 12, EastDoor 12, AboveEntranceDoor 11. The courtyard is the hub; each mill section is a spoke.
- **Locks/shortcuts**: 0 keystones. 6 blob-corruption "locks" (destroy the blob → wheels turn → door/wheel moves), 6 lever states (ShortCutWheel, DrainLever, LifeHarvestLever, WestDoorBlueMoonFree, MiddleDoorsOpen, TopDoorOpen), a 3-lever spin puzzle (SpinPuzzleSolved), 1 arena lock (SpinArena), 12 breakable walls.
- **Exits**: 4 edges to WestGlades.MillApproach (the same physical mouth reached from different heights), plus after the escape the drained pools open a swim into Luma Pools.
- **Critical path**: 1,241 u walked (**34 screens**) + 6 door hops to the escape start, then the escape itself is 716 u (**19 screens**, 676 u horizontal, 128 u vertical net). Straight-line from the mill mouth to the escape exit is ~250 u, so the ratio is ~8, the same as the Marsh.

### Wellspring Glades
- **Nodes** 29 (Town 22, WestGlades 6, shrine). **Edges** 54 internal; 23 pairs; 21 one-way (mostly hut doors and drops). **13 external edges**: Kwolok's Hollow (Grom's wall), Baur's Reach ×2 (Upper ledge once the bear sneezes; BelowHoleHut → Veral's home), the Wellspring ×2, Luma Pools (via MillApproach with Water), and the shops.
- **Hub degree**: GladesTown.Teleporter has **degree 20** (12 outgoing connections): the well is the literal centre. Grom, Twillen, Opher, Lupo, Tokk and Tuley are all within ~110 u (3 screens) of it.
- Town traverse east→west to the mill mouth: 665 u ≈ **18 screens**. The hub is a place you cross, not a room you stand in.

## 4. Rest and map

- **Spirit wells** (full refill, save, warp): Marsh 2, at the spawn ("Inkwater Well") and in Howl's Den, **522 u = 14 screens apart** (**derived**), roughly 25–35 min apart on a first pass (**estimated**). Wellspring: 1, at the top of the mill just before the escape (the whole ~45 min area is done from the Glades well). Glades: 1, but it is broken until the player pays Grom 1 Gorlek ore [S10]. Combat shrines (Marsh 2, Glades 1) also give full refills.
- **Checkpoints**: Will of the Wisps autosaves constantly (on collectibles, on passing triggers, on scene transitions); reviews and forum threads complain the game "has way too many checkpoints" [S11]. `areas.wotw` marks 30 checkpoint anchors in the Marsh, 17 in the Wellspring and 7 in the Glades (**measured**) over critical paths of 75 and 34+19 screens: a checkpoint anchor roughly every **2.5 screens** in the Marsh and every **3 screens** in the mill, and the real trigger density is higher than the anchor count.
- **Death-run length**: typically under one screen; a death in an arena restarts the arena; a death in the escape restarts the escape from its start (the escape is ~19 screens, 36.6 s at world-record pace [S12], 1.5–2.5 min for a first-timer (**estimated**)). The pause menu offers "abandon run" for escapes and bosses [S13].
- **Map**: the map fills in automatically as you explore (the Marsh map screen shows 45% after Howl's Den, with grey = unexplored outline; screenshot [S14]). Lupo sells the full area map: Marsh 50 spirit light (he stands above the second spirit gate, 2 screens from the exit), Wellspring 150 (he is mid-mill, inner section A) [S15]. In the Glades, Lupo's house sells "all energy cells / all life cells / all shards" markers for 2,000/3,000/4,000 [S10]. Unexplored exits are drawn as open edges on the map image; the quest marker ("Guardian of the Marsh: Find Kwolok") sits on the map as a pin.

## 5. Landmarks and sightlines

Counting anything the walkthroughs refer to by name rather than by direction (**measured** from [S15], [S16]; spacing **derived** from anchor coordinates):

**Inkwater Marsh, 9 landmarks in 23×19 screens, ~one per 2.5 screens of critical path:**
1. The Inkwater Well (spawn): glowing well, first save.
2. The breaking bridge and the fallen tree.
3. The fireplace where the torch is picked up (light source in a dark marsh).
4. Tokk at the spirit gate (an NPC as landmark; his keystone line makes the gate the goal).
5. The waterfall with the keystone (first blue-moss climb).
6. Howl's fang platform / the Howl arena (a pale bone ridge).
7. The skeleton on Howl's Den floor ("see the skeleton on the ground? this will be important later" [S15]: a landmark that pays off hours later with the hammer).
8. Opher's clearing with the **view of the Mill** (anchor comments: "Standing next to Opher, looking at the Millstone", "scenic mill view" [S2]; the music changes to "Overlooking the Mill" here [S17]). The mill is 350 u ≈ 9.5 screens away and one area over, and it is what the player is walking toward for the next hour.
9. The giant Kwolok statue (frog head) at the east exit; its two **eyes are the lock** (eyestones), so the lock and the landmark are the same object, and the music becomes "The Eyes of Kwolok" [S17].

**The Wellspring, 6 landmarks in ~8×20 screens:** the three giant wheels at the entrance (seen from the Glades approach and from the Marsh vista), the seized cog with the blob, the falling wheel, Lupo/Tokk/the Moki inside the machine, the rotating room, the Foul Presence's tentacles at the summit. Every landmark is a wheel or a piece of the mechanism: identity by repetition of one shape.

**Wellspring Glades, 5:** Grom's broken wall (the first thing you break), the great tree with Opher on a branch, the (broken) spirit well, Twillen's cave, Motay's ledge. Buildings appear on the tree as projects complete, so the landmark set grows with the game.

**Orientation devices:** wooden signposts with area names at forks (anchors are literally named "LeftSpawnSignpost", "PoolsBurrowsSignpost", "At the sign that gives you directions to Wellspring, Reach and Pools"); the Voice of the Forest wisp speaks a line on entering an area ("Water from the Luma Pools flows through here… before the mill stopped" [S7]); the quest pin on the map; Kwolok's dialogue points the compass ("The Wellspring to the west, a great watermill, sits silent" [S18]). The escape reveals the layout in reverse: you exit the mill by falling into the courtyard you first entered.

## 6. Traversal rhythm

**Flow chains.** Will of the Wisps chains are long because every verb refreshes in the air off an object: bash a projectile → grapple a moonblossom → jump off a spinning moss wheel → wall-cling blue moss → double jump → dash. Walkthrough sentences show the typical chain length: "Use the spinning wheel on the lake to get to the wooden pole, swing upwards and land on the wooden pole, from there do a double jump and destroy the blob on the left to rotate the wheel" (4 verbs between two stable footholds); "wait for she to shoot at you then bash the projectile to reach the wooden pole, next jump on the blue moss then bash out the lantern to reach the other side" (4) [S16]; Glades: "wall jump your way to the lantern, then aim at the other one, use the wooden poles to traverse, jump on the vertical log and… bash on the projectile to jump above the enemy" (5) [S16]. **Typical chain: 3–5 verbs, 1.5–3 screens, then a foothold** (**estimated** from the walkthrough text; the scene widths of 2.5–3.5 screens agree). The speedrun tech list [S19] confirms the underlying rule: "Attacking an enemy will give you back every aerial resource — Double Jump, Dash, and Launch" and bashing anything refreshes them, so chains are limited by what the designer hangs in the air, not by the player's resources.

**Platforming density.** In the Marsh a movement beat (a wall, a pole, a rope, a plant) roughly every screen; hazards are spikes and (until cleansed) the ink water, which is safe in the Marsh ("this water won't hurt you if you jump on it" [S15]) but poisonous in the Hollow and the Wellspring. In the Wellspring, hazards become mechanical: laser beams that sweep, geysers, spinning spiked contraptions, moving wheels whose safe side changes; the walkthroughs use "avoid the lasers" 7 times and "spikes" 12 times for the mill [S16].

**Calm vs intense.** Casual-logic paths that require killing something: Marsh 10 mentions in 156 paths (6%), Wellspring 1 in 113 (1%), Glades 1 in 87 (the optional shrine) (**measured** [S2]). Forced fights: Marsh 3 arena locks + Howl + 2 optional shrines; Wellspring 1 arena (2 Lizards + 3 Mantises + a Miner) + 2 Corrupted Gorlek minibosses in the open; Glades 0. So roughly **9 in 10 screens are calm traversal or puzzle**, and intensity comes from set-pieces, not roaming enemies.

**Set-piece escapes.**
- *Howl chase (Marsh)*: scripted in scene `swampNightcrawlerA`, a 192×50 u corridor (**5.2 screens wide, 2.4 tall**), running left-to-right: Howl roars, you flee across breaking platforms, grab a torch from the far end, then turn and fight in a 1-screen arena; the fight ends when Howl is at ~1/3–1/2 health and he flees [S15][S20]. It is a chase that becomes a fight, and it teaches "fire scares him" before the sword exists.
- *Wellspring escape*: scenes EscapeA (139×32 u corridor) → EscapeB (111×107 vertical) → EscapeC (139×34) → EscapeD (98×38) → EscapeE (92×34) → EscapeF (88×58) → EscapeEnd (102×111, the fall) [S1]: **716 u ≈ 19 screens of travel, 676 u of it horizontal**, in a corridor 1.5–1.8 screens tall that opens into two vertical chambers. Water bursts from the well behind you; you drop into a wheel that falls and spins (spikes inside), then the design switches to blue fruit (grapple) vs white fruit (bash) so the player must read colour at speed [S16]; it ends with a scripted fall out of the mill into the now-clean courtyard pool. World record 36.6 s [S12]; a first-timer takes 1.5–2.5 min with retries (**estimated**; Hold To Reset calls it "a couple minute long platforming chase" [S21]). Music switches to a dedicated escape track [S17]. The next two escapes in the game (Avalanche, Windtorn Ruins) have WRs of 28.8 s and 47.3 s [S12], so **an Ori escape is 30–50 s of perfect play, i.e. 15–25 screens**.

## 7. Encounters

- **Types.** Marsh: Slug, Spine Slug, Caterpillar, Snapper (lizard), Mantis, Skeeto (mosquito), plus Howl [S6]. Wellspring: Stinger fly, Skeeto hive, Corrupted Gorlek ×2, snapping vines, and one arena of Lizards + Mantises + a Miner [S2][S16]. Glades: none inside the town.
- **Density.** Marsh: enemies are mentioned about once per 1–2 screens along the critical path in the walkthroughs [S15][S16] (**estimated**); the rando's Combat requirements name 3 Slugs, 2 Skeetos, "3xLizard", "Mantis+2xLizard+SmallSkeeto" for the arenas (**measured**). Wellspring: about one enemy per 3 screens (**estimated**), with hazards doing the work instead. Enemies are placed where they double as movement: the Stinger fly's projectile is the bash point across the first pool; the Skeeto hive is a bash ladder ("bash the Skeetos to propel you upwards" [S15]); the Snapping Vine in the Glades is a bash point over itself.
- **Arena vs roaming.** Arenas are small (Marsh cave fight, burrow arena, the double-jump tree fight; Wellspring spin-room arena ~1 screen), gated by doors that close, and each one sits directly before or after a new tool so the fight is a test of it. The rando's own comment on the double-jump tree fight: "the game puts this before regen. It's why all the enemies drop tons of health" [S2]: pre-Regenerate arenas are tuned to drop health. Combat shrines (2 Marsh, 1 Glades) are the optional hard version, rewarded with a shard slot.

## 8. Secrets and rewards

- **Density.** Marsh 56 pickups over ~290 screens of scene area (≈1 per 5 screens; 1 per 1.3 screens of critical path); Wellspring 38 over ~317 (1 per 8); Glades 40 over ~120, but 9 are quest turn-ins and 8 are inside huts that only exist after Grom builds them (**derived** from [S1][S3]).
- **Spirit light totals**: Marsh 2,500, Wellspring 2,700, Glades 1,500 (**measured** [S3]); a shop shard costs 200–1,200, so an area funds 2–4 purchases.
- **Types**: spirit light orbs (18/17/18), life and energy fragments (4 fragments per cell), Gorlek ore (the hub's currency: Marsh 6, Wellspring 6, Glades 4), shards, keystones, mysterious seeds (one per area, for Tuley), quest items (the Wanderer's Pouch chain "Hand to Hand").
- **How they're signposted.** Breakable walls have a distinct wooden/branch look and 22 of the Marsh's casual paths and 12 of the Wellspring's include one (**measured** [S2]); "you will see a spirit orb below a log, this area is inaccessible for now" [S15]: the reward is shown first, the route later. Blue-glow orbs are visible through terrain. The wiki counts the map's "secrets" separately (Kwolok's Hollow lists 18). Every hut interior in the Glades is a small reward room (furniture breaks into orbs).
- **Secrets that are also shortcuts**: the Den secret room holds a life cell and is the bottom of the Den loop; the Wellspring "shortcut lever" reveals an orb inside the wheel it rotates.

## 9. Area identity

**Inkwater Marsh.** Palette: teal, cyan and ink-black water, with sickly green ferns and mushrooms and amber firelight; deep-dusk lighting with god-rays through the canopy (Steam screenshots [S5]). Mid-ground is fully 3D (the whole game moved the mid-ground to 3D "which adds more passive animation and makes almost every single object interactive" [S22]); background is 2–3 painted parallax layers blurred and desaturated to blue; foreground is dark silhouetted foliage and roots. Music: "A Shine Upon Inkwater Marsh" plays only after the second spirit gate; before Howl there is a darker cue, then "Howl", then the tree cue, then "Overlooking the Mill" and "The Eyes of Kwolok" as you go east [S17]: the Marsh has **at least five music states keyed to progress**, and Gareth Coker says "almost all of the environments have at least two musical loops — the 'before you did the thing' loop and the 'after you did the thing' loop" [S23]. Shape language: rounded, blobby, root-and-fern; wooden ramps and rope bridges are the only straight lines.

**The Wellspring.** Palette: warm amber timber, wet grey stone, brass, blue moss (the climbable surface is colour-coded) and purple laser light; inside, hazard lasers and geysers glow against dark wood (Steam screenshot ss26 [S5]). Its identity is one shape, the circle: three colossal wheels at the entrance, moss-covered wheels you ride, a wheel that falls, a round room that rotates 90° per lever, an open wheel you crawl through to reach the escape. Music: "The Ancient Wellspring" outside, then "Turn, Turn, Turn Again" inside, switching to "Amelioration" beyond the large wheel, then the escape track [S17]. Environmental storytelling: the mill is a Gorlek machine (their builder is Grom in the Glades); the Foul Presence squatting at the top is why the water is poisoned; after the escape the courtyard pool is clear and swimmable.

**Wellspring Glades.** Palette: warm gold, green, lantern light; the only place that is not slightly threatening. Music "Sanctuary in the Glades" [S17]. Its identity is change over time: 7 Grom projects (well 1, dwellings 4, thorns 5, roofs 6, cave 6, treehouses 8, decoration 10 ore = 40 ore total [S10][S24]) and 6 Tuley seeds (each grows a new traversal plant: moss, moonblossoms for grapple, light-catchers for bash, spring plants, flowers, a spirit tree) [S24]. Daniel Smith: the hub "is inspired by things like Terraria" and "can be upgraded" [S13].

**Art production facts** that explain the depth: the team hand-painted six light-direction maps for each of ~7,000 assets, "close to 30,000" maps, so painted lighting responds to Ori's glow and to lanterns [S25][S26]; Korol lists the "dynamic painterly lighting engine, the amount of parallaxing art, reactive physical animations of the environment" as the visual pillars [S22]; van Leeuwen on readability: "a composition with leading lines that nudge players to focus on something with right contrast, but without making it feel overly gamey" [S25]; Gritton checks compositions in greyscale because "colour can sometimes fool you" [S23]; Gritton on biomes: "each cardinal direction you go in, you get this different colour palette and feel" [S25].

**Terrain shape vocabulary.** Organic. The in-game maps [S14][S27] show rooms as rounded blobs with lobes, never rectangles; floors are undulating slopes; walls are curved. The movement tech list is evidence that slopes and curves are load-bearing: "Corner Boost: performed by touching the very bottom of a curved wall", "Dash Jump… use this on sloped surfaces", "Launch Slide: performed by Launching into an upward slope", "Sentry Dash… while standing on an upwards slope" [S19]. The Wellspring is the deliberate exception: it adds circles and straight laser lines to the organic base, and that contrast is its identity.

## 10. Camera and transitions

- **Seamless streaming.** Every scene in `scenes3.1.json` has `boundaries` (the playable/camera region), `loading_boundaries` (a smaller inner rectangle that triggers loading of neighbours) and `padding` (an outer rectangle kept resident) [S1]. Neighbouring scenes share edges exactly (e.g. Howl's Den chunks at x −506.5 / −465 / −337.5), so the world is one continuous coordinate space and the camera never cuts within an area.
- **Camera.** Default view ≈ 37×21 units (§0). It leads horizontally in the facing direction, lags vertically until landing, and zooms out in big rooms; it is scripted for reveals ("The camera will slowly pan out to the left, showing you a hook to grapple onto" [S16]) and locks for arenas and the escape.
- **Cuts exist and are hidden.** The mill interior is a different region of world space joined by doors (§3); hut interiors are 36×28 u fixed screens elsewhere in the world (y ≈ −4500…−4600 while the town is at −4150); both use a short fade. Area-to-area moves (Marsh → Hollow through the statue, Glades → Wellspring) are walked, with the wisp's voice line as the only marker. The rando's own note that "the loading here is not very smart" at the Glades→mill mouth [S2] shows the streaming seam is the only place a hitch can show.
- **Transition timing**: the door fades are well under a second (**estimated** from play); the walked transitions are 0 ms.

## 11. Teaching

The scene names in the shipped game are a design-grammar confession [S1]: `swampTorchIntroductionA`, `swampWalljumpChallengeA`, `swampWalljumpChallengeB`, `springIntroCavernA/B`, `swampSpringIntroductionB`, `nightcrawlerCavernGetDoubleJump` → `nightcrawlerCavernDoubleJumpIntroduction` → `nightcrawlerCavernDoubleJumpEscalation`, `swampChargeShotIntroductionNew` (the bow), `inkwaterMarshPoleEscalationA`, `kwoloksCavernTimedTongueEscalation`, `bashIntroductionA`, `waterMillBGetLeash` (grapple), `waterMillBEntranceCreepSetup`. **Get → Introduction → Escalation → Challenge** is literally how Moon Studios names rooms, and the coordinates confirm the order: GetDoubleJump (x −576…−527), then DoubleJumpIntroduction (−527…−439), then DoubleJumpEscalation (−439…−351), walking back east.

Concrete introductions:
- *Torch*: the fireplace lights a dark cave; the first slug is unkillable until you have it ("jump over the Slime as you can't fight it") [S15]; torch → burn branches → gate; the torch then goes out in water (loss teaches value) and returns for the Howl fight.
- *Wall-cling (blue moss)*: introduced on the keystone climb to a waterfall you can see the keystone above.
- *Spirit Edge*: given at a tree in the Den; the way back is lined with enemies; a branch barrier immediately after requires it.
- *Double jump*: tree, then a wall you "can now jump" to reach the Sticky shard (test), then a lever/rock/laser puzzle (twist), then the keystone door climb out of the Den (combine with wall jump).
- *Bow*: a blue target above the tree raises a platform (introduce), targets move stone walls (test), shooting a target mid-swing from a pole (combine) opens the eyestone alcove.
- *Grapple*: the tree has a hook on itself; the lever that opens the exit needs it; then Lupo's ledge, then the drained-water chamber, then the "rotating spikes" climb (escalation), then the escape (combine under time pressure).
- *Wellspring mechanism*: blob → wheel turns → door opens (cause/effect in one screen); wheel momentum launches you (test); a wheel that falls when its blob dies (twist); a whole room that rotates (twist again); wheels + fruit types at speed in the escape (combine).
- *Threats*: Howl roars from off-screen and appears before the chase, the Corrupted Gorlek is met once in the open before the arena version; lasers sweep on a visible rhythm before they are placed over pits.

## 12. Why it works

1. **Rooms are big, and the biggest are the ones you arrive in.** The median Marsh scene is 2.7×3.0 screens and the spawn is 5.6×4.6. Nothing you see on arrival ends at the edge of the screen; every camera view has an exit implied on two or three sides. That is the "sense of place" our levels lack: each of our rooms is a full statement, Ori's are clauses.

2. **Travel is 7–8× the straight-line distance.** The Marsh's exit is 10 screens from spawn but the route is 75 screens because the design folds the path: down into the Den, back up through a locked door you saw from the other side, out past Opher, along the top to the Bow, and back to the statue. The player crosses the same spaces 2–3 times with new verbs and from new directions, which is what makes 23×19 screens feel like a world.

3. **One mechanic, everywhere, at every scale.** The Wellspring's wheels are a landmark on the horizon (seen from the Marsh), the door lock, the moving platform, the momentum launcher, the falling hazard, the rotating room, the escape's spinning cage and the reward alcove. The area's identity is the mechanic's *vocabulary of uses*, not its art. This is the model for Tallage's sound-as-property mechanic.

4. **Cuts hidden inside a seamless world.** The mill interior is elsewhere in world space and nobody notices. Seamlessness is a feeling produced by matching what is visible on both sides of a door, not a technical requirement.

5. **Set-pieces are short and horizontal.** Both escapes are corridors 1.5–2.5 screens tall and 5–19 screens long, sub-minute at pace, with one vertical chamber to break rhythm. They are scripted to end in a reveal (Howl flees; you fall into clean water).

6. **Calm is the default.** Roughly 6% of casual paths in the Marsh and 1% in the Wellspring require a kill. Intensity is rationed into 4–6 named moments per area, and each moment sits beside a full refill.

7. **The hub is a road, not a room.** The Glades is 18 screens wide, on the route between the Hollow and the mill and between the Hollow and Baur's Reach; the well is its centre with degree 20 in the logic graph; every visit changes it (buildings, plants, NPCs moving in). Terraria was the stated inspiration.

8. **Teaching is spatial and named.** Get/Introduction/Escalation/Challenge rooms in sequence, with one-way drops so the player cannot retreat to the easy version.

9. **Landmarks double as locks and goals.** The statue's eyes are the eyestone lock; the mill is the destination for an hour before you reach it; the skeleton on the Den floor is a promise.

10. **Music states track progress**, five in the Marsh alone, so the same space feels different after each gate.

What the numbers miss: the *drawing* of the rooms. Ori's terrain is painted first and collided second: the floor is never a row of tiles, the walls curve, the platforms are roots and wheels with their own animation. The scene sizes above would feel empty in a tile grid; they feel full because every scene has 3D midground clutter, painted light from Ori's own glow, and foreground silhouettes cutting the frame.

## 13. What *Tallage* should steal, adapt or avoid

Targets in Tallage units (screen = 1920×1080 = 30×16.9 tiles = 13.5 player heights). Where Ori's number is a "by screens" figure I have converted by screens; where it is about jump-scale, by player heights (§0).

**Steal (targets):**
- **Room size**: median room **2.5–3 screens wide × 2.5–3 screens tall** (75–90 × 42–50 tiles); min 1×1.4 screens; arrival/overview rooms **5–6 × 4–6 screens**. Shape mix ≈ **55% horizontal, 10% vertical, 35% squarish**. A room under 1.5 screens should be a save room, hut or secret alcove only.
- **Area footprint**: an opening area of **~20×18 screens** with ~25–30 rooms; a set-piece area **~8×20 screens** (a tower) with ~20–25 rooms; a hub of **~10×6 screens** plus interiors.
- **Path folding**: critical-path travel **≥ 6× the straight-line distance** from entrance to exit; ≥ 2 loops per area; **20–25% of edges one-way** (drops, breaking bridges, one-way walls); **≥ 8 shortcuts** per area that open from the far side.
- **Chain length**: 3–5 verbs between footholds, spanning 1.5–3 screens; put a foothold every ≤ 3 screens.
- **Set-piece escape**: 15–25 screens of travel, corridor 1.5–2.5 screens tall, one vertical chamber, 30–50 s at perfect pace, ends in a scripted reveal, checkpoint at the start only.
- **Rest**: 2 full-refill points per area ~14 screens apart; a checkpoint every 2–3 screens; death-run < 1 screen except in set-pieces.
- **Calm ratio**: forced combat on ≤ 6% of paths; 4–6 named intense moments per area, each next to a refill.
- **Landmarks**: one nameable landmark per ~2.5 screens of critical path, at least one visible from another area, at least one that is also a lock.
- **Secrets**: 1 pickup per ~5 screens of area; ~20 breakable walls per area; show a reward before its route.
- **Hub**: on the road between two areas (a traverse of 10–18 screens), one central node with degree ≥ 12, and a change on every return (build, grow, NPC arrives).
- **Music**: ≥ 2 loops per area keyed to progress; a distinct cue for the vista room and the exit.
- **Scene naming**: name rooms `Get / Introduction / Escalation / Challenge / Setup`, and check that each ability has all four within 10 screens of its tree.

**Adapt:**
- Ori's camera shows 21 player heights; ours shows 13.5. Keep our zoom (our art is silhouettes with glowing accents and needs to read), but that means Ori's rooms scaled *by screens* contain fewer jumps per screen than Ori's do. Compensate by copying Ori's jump-scale density instead: a movement object every ~10 player heights (≈ 12 tiles), not every screen.
- The Wellspring's rotation-as-identity → Tallage's sound-as-property: pick one physical consequence of the seize/levy verb (e.g. a hum that holds a platform up) and use it as horizon landmark, lock, platform, launcher, hazard, whole-room twist, escape gimmick and reward alcove in a single area. Count the uses; aim for ≥ 7 distinct ones.
- The mill's hidden-cut interiors: allow separate LDtk levels for interiors and set-pieces, joined by doors with a short fade, as long as the same signature object is visible on both sides.
- Ori's organic terrain in a 64 px integer-AABB world: use slopes (the physics supports them or must) and hand-drawn collision edges that under-cut the painted terrain, with painted overhangs and foreground silhouettes hiding the boxes. The Wellspring shows that a single geometric shape against organic terrain is enough contrast to define an area.

**Avoid:**
- Rooms sized to one screen with edge exits (our current problem: 1×1 rooms read as disjoint boxes). No room should be entirely visible from its entrance except huts.
- Straight-line areas: an entrance-to-exit ratio under 3 is a corridor, not a place.
- Roaming enemy density above one per screen; Ori's density is ~1 per 1–2 screens in the tutorial area and lower after.
- Over-checkpointing inside set-pieces (the one place Ori withholds saves) and under-checkpointing outside them.
- Vertical shafts as the default vertical room: Ori's tall rooms are stacked puzzle boxes 2.5–3.5 screens wide, and only 7–16% of rooms are vertical at all.

## 14. Sources

- [S1] ori-community/wotw-scenes-map, `src/scenes3.1.json` (scene boundaries, loading boundaries and padding dumped from the game, patch 3.1): https://github.com/ori-community/wotw-scenes-map
- [S2] ori-community/wotw-seedgen, `wotw_seedgen/areas.wotw` (randomizer logic: anchors with coordinates, connections, pickups, states, refills): https://github.com/ori-community/wotw-seedgen/blob/main/wotw_seedgen/areas.wotw ; syntax guide: https://docs.google.com/document/d/1XAiL4GbyYGr2_PobxWajrOPO9kQ5UOSf4KrbI1rsOBM/view
- [S3] ori-community/wotw-seedgen, `wotw_seedgen/loc_data.csv` (390 pickups with zone and coordinates): https://github.com/ori-community/wotw-seedgen/blob/main/wotw_seedgen/loc_data.csv
- [S4] Vulajin, "Sentry Jumps: How-to and How High" (unit definition "1 unit = 1 Ori height", jump heights measured with the OriWotW LiveSplit reader): https://www.speedrun.com/ori_wotw/guides/niejf
- [S5] Steam store screenshots for Ori and the Will of the Wisps at 1920×1080 (Ori's on-screen height measured at 50–55 px): https://store.steampowered.com/app/1057090/
- [S6] Ori wiki, "Inkwater Marsh" (collectible counts, enemies, skills, shards, sub-area Howl's Den): https://oriandtheblindforest.fandom.com/wiki/Inkwater_Marsh
- [S7] Ori wiki, "The Wellspring": https://oriandtheblindforest.fandom.com/wiki/The_Wellspring
- [S8] Ori wiki, "Wellspring Glades": https://oriandtheblindforest.fandom.com/wiki/Wellspring_Glades
- [S9] Ashininity, "100% Video Walkthrough with Timecodes Map" (first-pass completion percentages per area): https://steamcommunity.com/sharedfiles/filedetails/?id=2048343772
- [S10] Ori wiki, "Grom" (project table and costs): https://oriandtheblindforest.fandom.com/wiki/Grom ; GameFAQs walkthrough, "Wellspring Glades projects" (7 projects, Lupo's marker prices, Tuley's seeds): https://gamefaqs.gamespot.com/pc/211281-ori-and-the-will-of-the-wisps/faqs/78217/wellspring-glades-projects
- [S11] Steam forum thread "This game has way too many checkpoints": https://steamcommunity.com/app/1057090/discussions/0/3040432704970364229/ ; Twinfinite on autosaves: https://twinfinite.net/guides/ori-and-the-will-of-the-wisps-how-to-save-your-game/
- [S12] speedrun.com Ori WotW level leaderboards (Wellspring Escape 36.559 s, Avalanche Escape 28.819 s, Windtorn Ruins Escape 47.299 s, trials): https://www.speedrun.com/ori_wotw/levels
- [S13] Screen Rant developer interview (Daniel Smith on the hub "inspired by things like Terraria", abandon-run, difficulty curve): https://screenrant.com/ori-and-the-will-of-the-wisps-developer-interview/
- [S14] Prodigy Gamers, Inkwater Marsh map screenshot (45% explored map screen) and shard locations: https://prodigygamers.com/2020/03/11/ori-and-the-will-of-the-wisps-inkwater-marsh-shards-location-100-map/
- [S15] Nikoartemis, GameFAQs walkthrough: "Inkwater Marsh" https://gamefaqs.gamespot.com/xboxone/211254-ori-and-the-will-of-the-wisps/faqs/78217/inkwater-marsh ; "The Wellspring" https://gamefaqs.gamespot.com/xboxone/211254-ori-and-the-will-of-the-wisps/faqs/78217/the-wellspring ; "Wellspring Glades" https://gamefaqs.gamespot.com/xboxone/211254-ori-and-the-will-of-the-wisps/faqs/78217/wellspring-glades
- [S16] Neoseeker walkthrough, "The Wellspring" (scripted camera pan, escape description, Lupo's 150 map): https://www.neoseeker.com/ori-and-the-will-of-the-wisps/The_Wellspring
- [S17] Ori wiki, "Soundtrack (Ori and the Will of the Wisps)" (which track plays where): https://oriandtheblindforest.fandom.com/wiki/Soundtrack_(Ori_and_the_Will_of_the_Wisps)
- [S18] Ori wiki, "Kwolok" (dialogue directing the player to the Wellspring): https://oriandtheblindforest.fandom.com/wiki/Kwolok
- [S19] Skarfelt, "Movement and Tech Guide" (resource refresh, corner boost on curved walls, dash jump on slopes, launch slide): https://www.speedrun.com/ori_wotw/guides/i70ul
- [S20] Ori wiki, "Howl" (attacks, chase): https://oriandtheblindforest.fandom.com/wiki/Howl ; Hold To Reset Inkwater Marsh guide: https://holdtoreset.com/ori-and-the-will-of-the-wisps-inkwater-marsh-guide/
- [S21] Hold To Reset, "The Wellspring Guide" ("a couple minute long platforming chase"): https://holdtoreset.com/ori-and-the-will-of-the-wisps-the-wellspring-guide/
- [S22] Nintendo Life, "Moon Studios On Ori And The Will Of The Wisps' Journey From Xbox To Switch" (Korol on lighting/parallax; van Leeuwen on iterative design; escape sequences): https://www.nintendolife.com/news/2021/01/feature_moon_studios_on_ori_and_the_will_of_the_wisps_journey_from_xbox_to_switch
- [S23] Inverse, "How Ori and the Will of the Wisps blends art and music" (Coker: two loops per environment; Gritton: greyscale check): https://www.inverse.com/gaming/ori-will-of-the-wisps-interview
- [S24] Hold To Reset, "Rebuilding the Glades Guide" (lists 6 projects / 34 ore; the wiki and GameFAQs list 7 / 40 including "The Gorlek Touch"): https://holdtoreset.com/ori-and-the-will-of-the-wisps-rebuilding-the-glades-guide/
- [S25] TheGamer, "Ori And The Will Of The Wisps Interview — Art, Cut Content, And The Pressure Of Making A Sequel" (30,000 light maps, leading lines, biome palettes, cut Riverlands between the mill and the winter forest): https://www.thegamer.com/ori-and-the-will-of-the-wisps-art-interview/
- [S26] CGMagazine, "Blending Art and Music With Ori and the Will of the Wisps" (van Leeuwen and Gritton on lighting, scale, readability): https://www.cgmagonline.com/interviews/blending-art-and-music-with-ori-and-the-will-of-the-wisps/
- [S27] Prodigy Gamers, Wellspring and Wellspring Glades map screenshots: https://prodigygamers.com/2020/03/17/ori-and-the-will-of-the-wisps-the-wellspring-walkthrough-100-map/
- [S28] Console Creatures, Thomas Mahler interview ("the pacing is much tighter this time", "over a year getting the combat as refined as the platforming"): https://www.consolecreatures.com/interview-with-thomas-mahler-about-ori-and-the-will-of-the-wisps/
- [S29] ori-community/wotw-map, `scenes/WotwMap.gd` (in-game map bounds x −2023…2382, y −4656…−3423): https://github.com/ori-community/wotw-map
- [S30] GDC Vault, "The Art of 'Ori and the Will of the Wisps'" and "'Ori Will of the Wisps': Narrative Design and Visual Storytelling" (Gritton, McEntee; paywalled, not used for numbers): https://www.gdcvault.com/play/1027375/ , https://gdcvault.com/play/1027305/
