# Lampfall: the design plan

Draft 1, 2026-10-17. A rough plan of the whole game, made before we start building it one polished increment at a
time. Its job is cohesion: every increment is checked against it, so small steps add up to one game. It is a living
plan. When play contradicts it, play wins and the doc gets updated.

## The pieces

| Doc | Owns |
|---|---|
| [core.md](core.md) | Pillars, the core loop, the lamp verbs (pull, caught, snuff, fling), lamp kinds, the ability chain, combat, completion. **The foundation: the others follow it** |
| [world.md](world.md) | Regions, the map graph, gates and backtracking, scope tiers, extensibility rules, room guidelines |
| [creatures.md](creatures.md) | Creature design rules, the roster per region, bosses, the firefly as a creature, shared sim blocks and rig families |
| [journey.md](journey.md) | The order of feelings: cast (the swarm, the firefly, Tatter), the opening and the ending, set pieces, pacing, wayfinding, wordless details |
| [look-and-sound.md](look-and-sound.md) | The two-light language (cool moon = safe, gold lamps = danger), region kits, moths at scale, HUD, audio |
| [tech.md](tech.md) | Rooms and `world.json`, persistent `save`, the map, authoring and validation, budgets, the staged tech roadmap |

Where two docs disagree: world.md owns geography, creatures.md owns creatures and bosses, journey.md owns story beats,
look-and-sound.md owns the picture, tech.md owns how it's built, core.md owns everything else.

## The game in one screen

- **The pillars:** light pulls and the dark is safe; flight is the joy; every lamp is a rescue; danger is fair and readable; the world tells it.
- **Moment to moment:** she flies through the dark. Lamps bend her path like gravity, and if she reaches the flame she is caught and has to beat free. She snuffs the flame with the blade, the predators at that lamp scatter, and freed moths fly with her for a few seconds, then head off the way she needs to go.
- **The abilities:** she starts with run, jump, blade and pogo. Then come glide (in the first 5 minutes), wall jump, *Fling* (orbit a lamp and release), double jump, dash, *Shroud* (fold her wings, go dark, smother glass lamps) and *Moonflight* (real flight that drains in light). Further slots stay open.
- **The world:** the moths' road is the spine, and forward is east or up: wood → valley of lamps (the hub) → marsh → pass → cave. Each region leaves sealed stubs so the map can grow later.
- **The bosses:** the Weaver in the grove of lamps (wood), the Mantis under the brightest lamp (valley), the bat Colony (marsh), the Beacon (pass), the Bat-eater and then the firefly (cave). The firefly lives: after the last light the blade passes over it, and far off another firefly answers.
- **Completion:** a count of freed moths. Max health rises at moth milestones, and secrets are hidden lamps. The map shows every lamp still burning.
- **Size:** about 5.5 hours for the main story and about 7 for 100%, in three tiers (below).

## Scope tiers

| Tier | Content | Rooms | Lamps | Bosses | Abilities | Playtime |
|---|---|---|---|---|---|---|
| **1 (initial)** | Wood and valley, as a standalone chapter: left behind → catches up → sets her kind on the road again. It ends with the river of moths rising from the valley and the beacon kindling far off on the pass | 27 | 25 | Weaver, Mantis (+2 minis) | 0–4 | 1.5–2 h |
| 2 | Marsh and pass, the reveal of why the firefly lights lamps, two shortcuts, secrets added to Tier 1 rooms | +28 | +30 | Colony, Beacon | 5–7 | to ~4.5 h |
| 3 | Cave, the firefly, the ending | +13 | +18 | Bat-eater, Firefly | slot | to ~5.5 h |
| Later | Expansions plugged into stubs that already exist: canopy, underways, deep pools, bat roost, moth trials | | | | 8+ | +30–60 min each |

## Changes made in reconciliation

- **Bosses.** The Weaver is the wood's boss and the Mantis the valley's, as journey.md and creatures.md had it. world.md is updated.
- **Great lamps.** The wood and valley great lamps go out flame by flame under the blade. From the marsh on, each has a glass heart that needs Shroud. core.md is updated.
- **Health milestones.** They are fixed moth counts (about 140 / 280 / 550 / 800), not percentages, so they don't move as tiers add moths. core.md is updated.
- **Rig families.** creatures.md's list (crawler, flyer, squat, raptor, strands, chain, bird) is the canonical one. look-and-sound.md's four templates are the render side of the same idea.
- **The Grove.** It becomes `test-grove`, a test bed outside the world. Its pictures and painters carry forward, not its layout.

## How we build it

The loop for every increment is a note, then greybox, then Matt plays, then polish, then memory. A short design note says what the player feels and which pillar it serves. Feel gets tuned in plain shapes before anything is painted. Matt plays it, and if it isn't fun yet it goes back to greybox. Then it is brought to the art bar (`STUDIO.md`'s loop: shots, clips). Finally `memory/` gets updated. Each increment removes the old demo piece it replaces, so the old and new designs never run side by side.

The first increments, in order (each is one or more loops):

1. **The lamp verb in `test-grove`, greybox.** Pull with swirl, caught and beat free, snuff with the blade, the predators at that lamp scattering. Matt plays it.
2. **The lamp brought to the bar.** The flame shader, the snuff (darkness spreading out, the husk), the swarm and the freed moths, and the lamp sounds (muted). Re-key the test grove to the two-light language so the lamp reads as the danger. Matt plays it.
3. **Tech stage 0.** Room loader and `world.json`, abilities in `save`, the state split, the first cut of the kit seam.
4. **The first real room: the hatching branch** (journey.md §2: the cocoon, control by 8 s). Then the opening chase and the vista with the title, and the first wick room.
5. **Tech stage 1** (exits, save/load, render teardown, the 700 MB heap), then the wood room by room: the glide glade, the hub, the wall-jump glade, the hawker and the web, the firefly's glimpse.
6. **The Weaver**, the first sky clearing, and the firefly relighting a lamp behind her. Then tech stage 2, and the valley.

Only the next one or two increments get planned in detail. Everything beyond that stays at this resolution until
we get there.

## Decisions

Matt accepted every recommendation below, big and small, on 2026-10-17. The "open questions" sections in the
other docs are settled the same way: each one's recommendation is the decision.

**Big calls.**

| # | Question | Recommendation | Where |
|---|---|---|---|
| 1 | Tier 1 scope: wood and valley, 27 rooms, 25 lamps, 2 bosses, 1.5–2 h, ending on the river of moths and the beacon kindling | yes | world §4, journey §7 |
| 2 | The ability chain, including three new verbs (Fling, Shroud, Moonflight), with Wing starting without glide | yes. Moonflight gets a real attempt and is cut only if it makes rooms trivial | core §4 |
| 3 | Drop the old demo systems (glints, wallet, giving, kindling lanterns, the heart, pods). Keep the burrback (restyled as a ground beetle). The lampwing becomes a dusk dragonfly, the hawker | yes | core §5, creatures §8 |
| 4 | A companion, Tatter: a torn-winged moth who walks the road. It has no lines and appears at moon patches, in one lamp rescue, as an absence in the pass, and at the end | yes, as presence only. Dropping it later costs nothing else | journey §1 |
| 5 | The two-light look: warm colour reserved for lamps. The Grove's golden well becomes moonlight, Wing's own light turns pale silver (gold eyes stay), ambient fireflies become spores, health becomes moon-drops | yes, compared side by side in shots before it lands | look §1, §8 |
| 6 | The boss line-up and the fast Mantis attempted at Hornet pace, with longer tells as the fallback | yes | creatures §3 |
| 7 | The firefly lives (the blade passes over it after the last light), and the last input of the game is Shroud: folding her wings to sleep | yes | journey §2, creatures §4 |
| 8 | A room-based world with a short fade between rooms (Hollow Knight), not one seamless world (Ori). Rooms are big and keep momentum across exits | rooms | tech §2 |
| 9 | Minimum machine: desktop browsers, M-series Macs and a 3-year-old laptop with a built-in GPU at 1080p, no mobile. Gamepad fully supported | yes | tech §9 |

**Small calls:**
- **Death and permanence:** death costs only time (no shade, freed moths can't be lost), and lamps stay out for good.
- **Health and buttons:** health rises at moth milestones, and there are five buttons (jump, attack, dash, Lamp, Shroud).
- **Creatures:** freed moths don't fight (a "call the swarm" slot is kept), snuffing a lamp scatters its predators, bats hunt by sound, and kills drop nothing.
- **World:** the valley is the hub, two glass fling anchors in Tier 1 are promises for later, and there's no fast travel in Tier 1.
- **Saving:** autosave to a single slot.
- **Look:** the night gets darker region by region, the cave is the one warm-lit region, a lamp's pull radius is shown by its light with no ring, and the title appears at the opening vista.
- **Firefly and sound:** the firefly relights lamps only twice, in scripted beats, and the old Hush audio layer is retired and its tone reused for lamps.
