# Teardown: Hollow Knight — Greenpath

Covers Greenpath proper, its named sub-areas (Lake of Unn, Stone Sanctuary, Sheo's hut), the Hornet 1 boss arena, and Greenpath's seams to Forgotten Crossroads, Fog Canyon, Queen's Gardens and Howling Cliffs.

## Units

Tallage: player 80px tall, 64px tiles, one screen = 1920×1080px = 30×16.9 tiles = 13.5 player heights tall.

Hollow Knight: tiles are **64px** (measured — Team Cherry blocked out levels in 64×64px tiles before hand-painting art on top). The Knight's on-screen height is reported inconsistently across community sources (24px sprite vs. ~42px including cape/horns); this teardown uses **~35px** as a working estimate (**estimated**, wide error bars — no decompiled collider data was available). That makes an HK tile ≈1.8 player heights, versus Tallage's tile = 0.8 player heights — HK's grid is coarser relative to its character than Tallage's. HK's camera/screen size could not be found as a hard number in any public source checked (no GDC talk or decompiled `CameraController` value turned up); screen-size claims below are **estimated** from published screenshots/longplay footage and are flagged as such every time they're used.

---

## 1. Overview

Greenpath is Hallownest's second explorable area and the first "real biome" after the tutorial-weight Forgotten Crossroads — a lush, acid-flooded cavern that is the game's first hard tonal and mechanical break from the grey opening area. **(measured/general knowledge, multiple sources)**

- **Role:** first optional-feeling detour off the Crossroads hub; not required to finish the game, but the conventional route (every walkthrough and the developers' own difficulty curve) takes the player through it early because it's where the Mothwing Cloak (dash) lives.
- **Arrival:** reached from the southwest of Forgotten Crossroads, through a wall/gate guarded by an Elder Baldur ("healthy" shelled roller enemy) that must be broken open — the wiki states this requires the Vengeful Spirit spell, though a nail-only route also works with more hits. **(measured, hollowknight.wiki)**
- **Abilities on arrival:** typically just Vengeful Spirit (from the Crossroads) and the base nail/jump kit — no dash, no wall-jump, no acid immunity. Every hazard in Greenpath (acid, thorns, drops) is therefore a "no" the player can't yet argue with, which is the point (see §11, §12).
- **Ability gained here:** the **Mothwing Cloak** (dash), dropped by Hornet after the Hornet Protector fight — Greenpath's signature reward.
- **First-pass play time:** **estimated 45–90 minutes** for a first-time player doing moderate exploration (grubs, a couple of charms, Sheo's hut, Lake of Unn), based on completionist walkthrough pacing; **estimated 5–10 minutes** for a routed speedrun that beelines Hornet and leaves. No official or aggregated timing data was found split cleanly by area, so both figures are **estimated**.
- **Total rooms/scenes:** the game's internal scene list has **34 scene files** prefixed `Fungus1_*` (Greenpath's internal codename — Greenpath, Fungal Wastes, Fog Canyon and Queen's Gardens were originally one area, hence `Fungus1/2/3`) — **measured**, pulled from `SceneNames.cs` in the community `SereCore` modding library. Four of those are alternate/duplicate layouts of the same physical room (`Fungus1_01b`, `_05b`, `_16_alt`, `_20_v02`), so the distinct navigable room count is **~30** (**derived**). The numbering also skips 07, 08, 18, 27 and 33, suggesting rooms that were merged or cut during development (**estimated** interpretation of the gap).

---

## 2. Room size distribution

No decompiled per-room pixel/tile dimensions were found in public sources within scope (RandomizerCore's data files expose room *names* and logic, not geometry). Sizes below are **estimated** by counting camera-pans in published longplay footage and cross-referencing the wiki's area screenshots against the 64px tile grid.

| Rough size class | Share of ~30 rooms (estimated) | Example |
|---|---|---|
| Single-screen, small (~1 screen) | ~45% | Sheo's hut, most connective corridors, Lake of Unn shrine alcove |
| Single-screen, large / elongated (1–1.5 screens) | ~30% | Hornet arena, the main acid-lake traversal room, Stag Station approach |
| Multi-screen vertical shaft (2–3 screens tall) | ~20% | The entrance shaft down from Crossroads, the Stone Sanctuary spike interior, the shaft up to the Stag Station |
| Large "set-piece" (3+ screens in one dimension) | ~5% | Lake of Unn's open acid lake room |

**Five largest rooms (estimated, by screen-span):**

| Room (by landmark) | Approx. size | Why it's large |
|---|---|---|
| Lake of Unn (main lake room) | ~2.5–3 screens wide × 1 screen tall | Open acid lake, needs room to read the water and the far shore before the player has acid immunity |
| Entrance shaft from Forgotten Crossroads | ~2 screens tall | Vertical drop that sells "this is a different, wetter place" on arrival |
| Stag Station approach shaft | ~2–3 screens tall | Vertical gauntlet of Moss Knights/Chargers building to the safe stag hub |
| Stone Sanctuary interior | ~2 screens tall (spans 2 connected rooms) | Dark spike-pit gauntlet leading to the No Eyes Dream boss and a mask shard |
| Hornet arena | ~1.2–1.5 screens wide | Wide enough for her lunge/thread-storm kit but still a single readable "boss box" |

Greenpath is overwhelmingly **vertical-leaning**: the area's identity room-to-room is more about acid-lake drops and mossy shafts than long horizontal runs, which is unusual for an "opening biome" and is one of its strongest identity markers (see §9, §12).

---

## 3. Graph structure

**Nodes/edges:** ~30 rooms (derived, §1), each with 1–3 room-to-room doors; a handful of one-way drops (typical of HK's acid/thorn rooms, where you can fall down but can't climb back without an ability).

**External connections (measured/general knowledge):**
- **Forgotten Crossroads (east):** the main entrance, gated by an Elder Baldur wall. There is community consensus that Greenpath and Crossroads share more than one seam (the area borders run alongside each other for a long stretch), but only one is the "front door" used by every walkthrough.
- **Howling Cliffs (north):** a **shortcut**, not a forward path — it requires the Mantis Claw (wall-jump), gained much later in Fungal Wastes, so on a first visit this is a locked door that becomes a return shortcut. It's also one of three ways into Howling Cliffs (the others being the King's Pass secret passage at the very start of the game, and the Stag Nest). **(measured, hollowknight.wiki / community wiki)**
- **Fog Canyon (south/southeast):** reached via the Stone Sanctuary corner in the far southeast of Greenpath; this is the forward path onward toward Fungal Wastes and the City of Tears loop. **(measured)**
- **Queen's Gardens (west/southwest):** reached by crossing the acid lake at Lake of Unn — impassable without **Isma's Tear** (acid immunity), an item found much later in Fungal Wastes/Royal Waterways. So this "connection" is really a **locked gate that only opens on a return visit**, turning Greenpath into a hub the player revisits at least twice. **(measured)**

**Loops and shortcuts:** the Stag Station (once the 140-geo toll is paid) is itself a shortcut back to every other unlocked stag station in the game, making Greenpath a permanent fast-travel hub the moment it's cleared. The Howling Cliffs and Queen's Gardens seams are both "shortcuts that double as area entrances" — a favorite HK pattern of gating forward progress behind an ability so the same room reads as a dead end on the first pass and a shortcut on the second.

**Dead ends:** Sheo's hut (southwest, rewards the Great Slash nail art) and the hidden Unn chamber west of the lake (rewards the Shape of Unn charm) are true dead ends — pure reward rooms with no through-traffic.

**Critical path vs. total:** the minimum path to get the Mothwing Cloak and leave (Crossroads entrance → chase/approach Hornet → arena → exit toward Fog Canyon) is roughly **8–12 rooms** out of ~30 total (**estimated**), i.e. **critical path ≈ 30–40% of the area**. The other 60–70% is Lake of Unn, Stone Sanctuary, Sheo's hut, the Stag Station shaft, and connective tissue — all optional on a first pass.

---

## 4. Rest and map

- **Benches:** at least 3 documented (near the Crossroads entrance, near Stone Sanctuary, and inside the Lake of Unn shrine) — **measured**, though the true count including less-traveled corners may be slightly higher.
- **Map:** as with every HK area, the map is blank until Cornifer is found and his map is bought (Cornifer is present in Greenpath, per the enemy/NPC list) — pins and room shapes appear progressively as rooms are visited, and full detail requires the Quill upgrade found later. This is a area-entry ritual repeated in every biome, not something unique to Greenpath.
- **Stag Station:** one station, central-north, requiring a 140-geo toll to open — a rest/fast-travel point roughly in the geographic middle of the area. **(measured)**
- **Death-run length:** not directly measured; given the critical path is ~8–12 rooms with one mid-difficulty boss (Hornet, 225 HP, single phase), a death-to-recover-shade run is **estimated at 1–3 minutes** for a player who knows the route, longer on a first visit due to the Elder Baldur gate and platforming risk.

---

## 5. Landmarks and sightlines

- **The acid lake itself** is Greenpath's biggest landmark — bright, backlit green-yellow acid that reads instantly as "hazard" against the duller cave palette, visible from multiple rooms before the player ever touches it.
- **The standing/egg-shaped carved stones** ("stelae") recur throughout Greenpath and mark points of narrative and navigational significance — including the stones marking the entrance to Lake of Unn, where the Knight catches up to Hornet standing over another Vessel's body (the game's second boss reveal, staged as a landmark-triggered cutscene rather than a random encounter). **(measured, hollowknight.wiki)**
- **Lore tablets** (six, scattered) function as secondary landmarks/reading stops that reward thorough exploration without gating anything mechanical.
- **The Stag Station** is a fixed, brightly-lit orientation anchor: once found, every subsequent trip through the area can route through it, so it acts as a mental "center" for the map.
- **Vertical sightlines:** several shafts (entrance drop, Stag Station approach, Stone Sanctuary) let the player see 1–2 screens up or down before committing, which is how HK telegraphs "this is worth exploring" without a UI marker — you can *see* platforms or a Moss Knight patrol above/below and choose to detour.

---

## 6. Traversal rhythm

- **Movement kit at entry:** jump + nail only (no dash yet), so traversal chains are short and reactive — a jump, a beat to check for acid or a hidden Mosskin, another jump. This is deliberately slower and more cautious than later areas.
- **Platforming density:** moderate-to-high around the acid lake and the Stage Station shaft (moving between narrow mossy platforms over acid), lower in connective corridors.
- **Hazards:** acid (instant heavy damage + knockback, and un-crossable without Isma's Tear), thorn patches (contact damage, block sightlines), and disguised enemies (Mosskin variants that look like plant matter until they move) — a hazard vocabulary distinct from the Crossroads' pure combat/spike hazards. **(measured, from enemy/hazard lists)**
- **Calm vs. intense ratio:** mostly calm, exploratory pacing punctuated by two spikes — the Hornet chase-and-fight, and the Stone Sanctuary/No Eyes optional dream-boss gauntlet. **Estimated ratio 70/30 calm:intense**, which is gentler than Fungal Wastes or Deepnest — appropriate for a second area.

---

## 7. Encounters

- **Enemy roster (measured, hollowknight.wiki):** Vengefly, Crawlid, Gulka, Squit, Tiktik, Obble, Mosscreep, Mosskin (standard/Volatile/Charger variants), Moss Knight, Duranda/Durandoo, Maskfly, Aluba (Lake of Unn only), various Husk types, Fool Eater, plus the optional bosses Massive Moss Charger and No Eyes (Dream), and the mandatory Hornet Protector fight.
- **Density:** enemies are placed individually or in pairs per room rather than in packs — **estimated 1–2 enemies per screen** on the main path, rising in set-piece rooms (the Stag Station shaft stacks multiple Moss Knights/Chargers vertically to force careful platforming-under-fire).
- **Placement patterns:** several enemies (Mosskin) are camouflaged as background plant matter — a "look twice" pattern unique to this area's identity (see §12) that trains players to distrust the foliage for the rest of the game.
- **Arena vs. roaming:** almost everything is roaming/ambient except the two boss arenas (Hornet, No Eyes), which are contained single-room fights typical of HK's boss design.

---

## 8. Secrets and rewards

**(measured, hollowknight.wiki, though exact counts may vary slightly by wiki revision)**

- 4 Grubs
- 1 Vessel Fragment (Mask Shard-equivalent progress item)
- 1 Mask Shard (Stone Sanctuary, reward for the No Eyes Dream boss)
- 1 Hallownest Seal
- 2 Wanderer's Journals
- 2 charms: **Thorns of Agony** and **Shape of Unn** (the latter hidden behind a secret western chamber at Lake of Unn, guarded by nothing but obscurity — a pure "did you look" reward)
- The **Great Slash** nail art, taught by Nailmaster Sheo in his hidden southwest hut
- 6 lore tablets
- Assorted geo deposits/chests, soul totems, a lifeblood cocoon and a whispering root (essence)

**Signposting:** most secrets are hidden by geometry (a wall that looks solid, a corner behind thorns) rather than by a puzzle — Greenpath teaches "explore the edges of the map" more than it teaches any specific secret-finding mechanic. The Shape of Unn and Sheo's hut are both dead-end detours with no partial credit, rewarding only players who diverge from the critical path.

---

## 9. Area identity

- **Palette:** saturated green/teal foliage against dark cave rock, with acid rendered in a bright, almost toxic yellow-green that pops against the cooler background — a hard, immediate break from the Crossroads' greys. **(measured, general knowledge/screenshots)**
- **Lighting:** dim ambient cave light with acid pools acting as a secondary light source; deeper alcoves (Stone Sanctuary, Sheo's hut) go dark enough to require the Lumafly Lantern.
- **Parallax/foreground:** dense background foliage silhouettes and hanging vines read as midground layers; foreground occluding plants and thorn overgrowth are used to partially obscure the playfield in several rooms, a technique that reinforces the "overgrown, half-swallowed" reading of the ruins beneath.
- **Music/ambience:** Greenpath has its own distinct musical theme (lush, more organic instrumentation than the Crossroads' theme) plus ambient water/insect sound layered under it — consistent with the project's own pillar table (`PLAN.md` §1) calling for a distinct lead instrument and ambience bed per area.
- **Silhouette/shape language:** organic and curved — mossy outcrops, round acid pools, vine tangles — a deliberate contrast to the more rectilinear, masonry-built Crossroads and City of Tears. Greenpath is the game's first "nature has reclaimed this" area, and its terrain vocabulary (curves, overhangs, irregular platform edges) is the visual argument for that.
- **Environmental storytelling:** carved standing stones and Mosskin worship-lore (Unn as the "mother" of the flora and the Mosskin) turn the hazard (acid, thorns, camouflaged enemies) into implied *culture* rather than random obstacle — the area explains itself without dialogue.

---

## 10. Camera and transitions

Hollow Knight's camera is a smoothly-scrolling, room-locked 2D camera (not a hard per-screen cut) that pans to keep the Knight roughly centered within each room's bounds; screen size and behavior are consistent across the whole game, and Greenpath does not deviate from the norm — no unusual camera tricks specific to this area were found in the sources checked. Room-to-room transitions are the same short black fade used everywhere in HK (**estimated ~0.3–0.5s**, no exact figure found in public sources), which the project's own `PLAN.md` polish bar (transitions under 300ms) uses as a comparable target.

---

## 11. Teaching

Greenpath's teaching loop follows introduce → test → twist → combine cleanly:

1. **Introduce (acid):** the very first acid pool the player meets is small, visible, and easy to route around — a free lesson.
2. **Test (acid + platforming):** the Lake of Unn approach and the Stag Station shaft put moving platforms and acid together, forcing the "commit to a jump over a hazard" skill under time pressure from patrolling enemies.
3. **Twist (disguised enemies):** Mosskin that look like background plants until they attack subvert the "acid is the only hazard" lesson the player just learned, re-teaching vigilance.
4. **Combine (Hornet fight):** the Hornet Protector fight combines everything taught so far — spacing against a fast, readable-but-punishing melee attacker, without any new mechanic, functioning as a check on the base nail/jump kit before the reward (dash) trivializes some of what came before.
5. **Reward re-teaches itself:** after Mothwing Cloak, the game doesn't hand-hold the player back through Greenpath with dash-specific puzzles inside the area itself (unlike, e.g., Fungal Wastes' more deliberate ability-gated returns) — Greenpath's dash-teaching is mostly implicit, via the platforming already seen becoming trivially easier, which itself teaches the player the tool's power.

---

## 12. Why it works

**Identity is established before mechanics are.** The player's very first sensory read on entering Greenpath — a hard palette shift from grey stone to saturated green, and the visual "wrongness" of glowing acid pools — does the area's identity work in under two seconds, before a single new mechanic appears. This matters because Greenpath's *mechanical* additions (acid, camouflaged enemies) are genuinely small; the area earns its status as "the first real biome" almost entirely through art direction and hazard framing, not new verbs. That's a cheap, high-leverage lesson: tone and palette can carry an area's sense of newness even when the moveset hasn't changed yet.

**The acid is a locked door disguised as a hazard.** Because Isma's Tear (acid immunity) doesn't exist yet, every acid pool in Greenpath is simultaneously "a thing that hurts you" and "a thing you'll be able to ignore later." This is what makes the eventual return to Lake of Unn (to cross into Queen's Gardens) satisfying rather than just backtracking — the exact same geography is re-read as trivial once the player is stronger, which is the core metroidvania pleasure and Greenpath sets it up on the very first hazard type the player meets.

**Camouflaged Mosskin recalibrate trust in the environment.** Most early hazards in games are legible at a glance; Greenpath's plant-enemies are not, and that's a deliberate, cheap way to make "explore carefully" a felt need rather than an instruction. It also retroactively makes the dense foreground foliage layering (used for atmosphere) do double duty as a suspicion-generator — the player starts eyeing every clump of leaves.

**Verticality plus visible sightlines drive curiosity without markers.** Several of Greenpath's largest rooms (the entrance shaft, the Stag Station approach) let the player see a platform, an item glint, or an enemy patrol one or two screens away before they can reach it. That's the "I can see it, I want it" hook operating with zero UI — the level geometry itself is the quest marker. Sheo's hut and the Shape of Unn chamber are placed off this visible-but-not-obviously-reachable axis, rewarding the itch the sightlines create.

**The Mothwing Cloak reward is taught by proof of the problem it solves, not by a tutorial popup.** By the time the player reaches Hornet, they've already fought the geography of Greenpath without a dash — every gap felt slightly too far, every acid-adjacent jump slightly too tight. The dash isn't explained; its value is *recognized* immediately because the player has spent 30–60 minutes accumulating specific, remembered frustrations it resolves. This is a stronger teaching method than any prompt: the ability is validated against the player's own recent experience.

**Hornet as a "check" boss, not a "gate" boss.** At 225 HP with four simple, individually-telegraphed attacks and a generous ~1-second opening stance, Hornet 1 is tuned to be beatable by a player using only the base kit, but to punish sloppy spacing. She isn't there to block progress (the player could arguably route around via Crossroads/Fungal Wastes some other way) — she's there to certify that the player has internalized Greenpath's spacing lessons before the game hands them a mobility tool that makes spacing errors easier to paper over. Rewarding a *skill check* with a *mobility upgrade*, rather than the reverse, is a deliberate sequencing choice.

**What the numbers miss:** none of the counts above (room counts, secret counts, enemy density) explain why Greenpath feels bigger than a ~30-room area "should." The honest answer is redundant, overlapping connections — Crossroads, Fog Canyon, Queen's Gardens and Howling Cliffs all touch Greenpath, and three of those four seams are initially locked. A player's mental model of Greenpath keeps growing on later visits even though not one new room is added, because previously-unreachable exits reveal themselves as the world, not just the character, changing. That's an information-architecture trick as much as a level-design one, and it's much cheaper than building more rooms.

---

## 13. What Tallage should steal, adapt, or avoid

**Steal:**
- **A hazard that's also a future-you gate.** Give Tallage's first district (post-hub) one persistent, visible hazard that a *later* item trivializes, so a second visit re-reads the same geometry as easy. This is higher-leverage than adding a new room for the callback.
- **Camouflage as a cheap "look twice" beat.** At least one enemy type in the first district should be visually indistinguishable from set dressing until it moves. It costs one enemy variant and permanently raises player vigilance.
- **Sightline-driven curiosity over markers.** Build 2–3 rooms in the first district where the player can *see* a reward or a path one screen away that they can't yet reach — no quest marker needed.
- **Sequence the ability reward after the problem, not before.** Whatever the first district's signature ability unlock is, make sure the player has already personally felt its absence for 30+ minutes of that same district before receiving it.
- **Overlapping, partially-locked seams to the hub.** Greenpath borders 4 areas, and 3 of those exits are locked on first visit. Target: Tallage's first district should border **at least 3** other spaces (hub + 2 more), with **at least 1** locked behind a later item — this is what makes a "small" area feel geographically important.

**Adapt:**
- **Room-to-player-height ratio.** Greenpath's tiles are large relative to its character (~1.8 player heights/tile, estimated); Tallage's are the opposite (0.8 player heights/tile — Tallow is *big* relative to the grid). This isn't wrong, but it means Tallage rooms need proportionally *more* tiles of width/height than an HK-equivalent room to read as similarly spacious. When targeting "Greenpath-sized" rooms, don't copy HK's tile counts directly — copy the **player-height** counts from §2 and convert.
- **Vertical-leaning room mix.** Greenpath is roughly 20% multi-screen vertical shafts and only ~5% large horizontal set-pieces (estimated, §2). If Tallage's district currently reads as flat/horizontal, deliberately add 2–4 vertical shaft rooms (2–3 Tallage-screens tall) rather than widening existing rooms.
- **Critical-path fraction.** Target **30–40%** of the district's rooms on the mandatory path, the rest optional — matches Greenpath's estimated ratio and gives room for secrets without bloating the "must visit" count.

**Avoid:**
- **Don't make the identity-establishing palette/tone shift wait for a new mechanic.** Greenpath's biggest lesson is that tone can do first-two-seconds identity work for free; if Tallage's first district currently signals "new area" only through a new enemy or mechanic rather than an immediate palette/silhouette change, that's a gap worth closing before adding more content.
- **Don't over-explain the signature-ability payoff.** Resist a tutorial popup for the first district's key unlock; if the preceding rooms are tuned right, the player should recognize the value on their own (see §12).

---

## 14. Sources

- [Greenpath — hollowknight.wiki](https://hollowknight.wiki/w/Greenpath) — area overview, connections, sub-locations, benches, enemies, items, access requirement
- [Lake of Unn — hollowknight.wiki](https://hollowknight.wiki/w/Lake_of_Unn) — location, access, Unn NPC, Shape of Unn charm, layout
- [Hornet Protector — hollowknight.wiki](https://hollowknight.wiki/w/Hornet_Protector) — HP (225), attacks, stagger threshold (11 hits / 6-combo), fight framing, reward
- [Fog Canyon — hollowknight.wiki](https://hollowknight.wiki/w/Fog_Canyon) — Greenpath/Fog Canyon connection (northern seam)
- [Queen's Gardens — hollowknight.wiki](https://hollowknight.wiki/w/Queen%27s_Gardens) — general overview (connection to Greenpath confirmed indirectly via Lake of Unn/Isma's Tear search)
- [Stone Sanctuary — hollowknight.wiki](https://hollowknight.wiki/w/Stone_Sanctuary) — location, mask shard, No Eyes, layout
- [Howling Cliffs — search aggregate, hollowknight.fandom.com / hollowknight.wiki](https://hollowknight.fandom.com/wiki/Howling_Cliffs) — three access points, Mantis Claw requirement for the Greenpath seam
- [Isma's Tear — hollowknight.fandom.com](https://hollowknight.fandom.com/wiki/Isma%27s_Tear) — acid immunity gating the Lake of Unn → Queen's Gardens crossing
- [SceneNames.cs — seresharp/HollowKnight.SereCore, GitHub](https://github.com/seresharp/HollowKnight.SereCore/blob/master/SceneNames.cs) — full list of 34 `Fungus1_*` internal scene names (Greenpath's room count)
- [RandomizerCore — homothetyhk, GitHub](https://github.com/homothetyhk/RandomizerCore) — randomizer logic/data library referenced for scene-naming context (`Fungus1/2/3` = originally one area)
- [How the Hollow Knight devs mapped out their 'Metroidvania' — Game Developer](https://www.gamedeveloper.com/design/how-the-i-hollow-knight-i-devs-mapped-out-their-metroidvania-) — Ari Gibson/William Pellen on intuition-driven, discovery-first map design (source for §12's design-philosophy framing)
- [How to design a great Metroidvania map — PC Gamer](https://www.pcgamer.com/how-to-design-a-great-metroidvania-map/) — companion piece to the above interview
- Tile size (64×64px) and world-map pixel scale: aggregated from search results referencing Team Cherry's level blockout process and the Hallownest.net interactive-map project FAQ/mapping-stats pages
- Knight character height (24px vs. ~42px, conflicting): aggregated from community height-chart discussions (Tumblr "Height chart for every Hollow Knight NPC and boss" threads, cited only for the pixel figures, not reproduced)
- Room sizes (§2), traversal rhythm (§6), screen dimensions (Units), first-pass playtime (§1), critical-path fraction (§3): **no public source gave exact figures** — all are explicitly labeled **estimated** in-line, derived from playing-knowledge-informed reading of published screenshots, longplay footage descriptions, and walkthrough pacing rather than measured data. Treat these as directional targets, not ground truth, and revisit if a randomizer room-geometry dataset or decompiled camera constant surfaces later.
