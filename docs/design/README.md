# Lampfall: the design plan

Draft 1, 2026-10-17; rescoped to an Ori-length game 2026-10-18 (decisions at the end). A rough plan of the whole game, made before we start building it one polished increment at a
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
- **The abilities (12):** she starts with run, jump, blade and pogo. Then glide (0:05), wall jump (0:28), *Gust* (1:06: a wingbeat that blows out a flame at range), *Fling* (1:46: orbit a lamp and release), double jump (2:35), dash (3:15), *Fold* (4:00: wings folded, a dive that breaks crusts), *Shroud* (4:45: folded and dark, smothers glass lamps), *Soar* (5:30: full-span glide that rides wind), *Grip* (6:40: cling and climb, frost faces), *Moonflight* (7:20: real flight that drains in light) and *Shadow dash* (8:30: a shrouded dash through thorns and strands). Times are a first-timer's clock (core §4).
- **The world:** the moths' road is the spine, and forward is east or up: wood → valley of lamps (the hub) → marsh → pass → cave. **14 areas in 5 regions**, each area 30–50 minutes with its own hub, signature toy and creature; two optional areas (the canopy, the underways). Each region leaves sealed stubs so the map can grow later (world §2).
- **The bosses and peaks:** the Weaver (wood), the Mantis (valley), the bat Colony (marsh), the Beacon (pass), the Bat-eater and then the firefly (cave), with five mini-bosses and ten set pieces between them: a peak about every 30 minutes, two escapes. The firefly lives: after the last light the blade passes over it, and far off another firefly answers.
- **Completion:** a count of freed moths, plus three small kinds of find in every area: a moth-stone (the area's map), firefly signs (wordless lore) and moonlit hollows (small upgrades). Max health rises at moth milestones. The map shows every lamp she has seen still burning.
- **Size:** about **9.75 hours** for the main story and **12.5** for 100% (Ori's length: `quality-bar.md` G1), in three tiers (below).

## Scope tiers

| Tier | Content | Areas | Rooms | Lamps | Bosses | Abilities | Playtime (main / 100%) |
|---|---|---|---|---|---|---|---|
| **1 (initial)** | Wood and valley, as a standalone chapter: left behind → catches up → sets her kind on the road again. It ends with the river of moths rising from the valley and the beacon kindling far off on the pass | 5 | ~55 | ~105 | Weaver, Mantis (+2 minis) | 0–6 | **~3.5 h / ~4.25 h** |
| 2 | Marsh and pass, the reveal of why the firefly lights lamps, the drowned-roots escape and the chute, the underways, fast travel, secrets added to Tier 1 rooms | +6, +1 optional | +81 | +125 | Colony, Beacon (+3 minis) | 7–11 | to ~8 h / ~10.25 h |
| 3 | Cave, the firefly, the ending, the canopy, the moth trials | +3, +1 optional | +36 | +55 | Bat-eater, Firefly | 12 | to ~9.75 h / ~12.5 h |
| Later | Expansions plugged into stubs that already exist: deep pools, bat roost, more moth trials, call the swarm | | | | | slots | +30–60 min each |

Draft 1 (2026-10-17) was 1.5–2 h / ~4.5 h / ~5.5 h over 68 rooms. The rescope keeps the story, the regions and every
system, and grows the game by areas, rooms and rows rather than by new systems (world §4.1 lists what pays for many
areas).

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

## Rescope to an Ori-length game (2026-10-18), for Matt's veto

Matt set the target length to Ori's (`quality-bar.md` §1.6: a first run of 9–11 h, 12–14 h for 100%). These calls
were made to reach it without touching the locked story (`memory/story.md`) and with variety from rows and variants
where the fun is the same. Each is the doc's working assumption until vetoed.

| # | Call | Why | Where |
|---|---|---|---|
| 1 | **~9.75 h main / ~12.5 h 100%**, as 14 areas of 30–50 min in the same 5 regions (2 + 3 + 3 + 3 + 3), plus the canopy and the underways as optional areas | G1, G2; Ori has ~12 main-path areas | world §1–2 |
| 2 | **~155 main rooms and ~285 lamps** (draft 1: 68 and ~73), about 2.3x the content, with an area's new code capped at one toy and one creature block or rig | length from content, never from walking (G1, R5) | world §4, §4.1 |
| 3 | **12 abilities**: five new ones, *Gust*, *Fold*, *Soar*, *Grip*, *Shadow dash*, alongside the planned Fling, Shroud and Moonflight. Soar and Shadow dash are mostly numbers and flags | G3 (9–12, a gap of 40–75 min); Ori's ~11 skills | core §4 |
| 4 | **Gust is the Weaver's reward** at the canopy edge, on the Lamp button (tap: Gust; hold in a pull: Fling) | three abilities within 75 min (G3); HK's first spell after its first boss; still five buttons | core §4 |
| 5 | **Shroud becomes an upgrade of Fold** (tap Shroud in the air to dive and break crusts; hold to fold dark) | two abilities for one move; Shroud is taught on a button already known | core §4 |
| 6 | **Double jump moves to the roost tree's crown; dash moves to the Mantis's reward**; Moonflight moves before the Beacon | G3's gaps; HK's dash after Hornet; the Beacon fight already uses Moonflight in journey and creatures | core §4, world §2 |
| 7 | **The wood is two areas, ~70 min** (the floor ~35, the high wood ~35); the current chunk grows from ~22 to ~35 min (regions/wood.md, rescope) | the bar's §5.4; C1–C3 | wood.md |
| 8 | **Three new kinds of find**: moth-stones (one an area: the area's map), firefly signs (wordless lore), moonlit hollows (~12 small tuning upgrades). Health stays moth milestones, re-set to **110 / 350 / 800 / 1,400 / 2,100** (9 pips at most) | the bar's shortfall 3; G11 | core §6 |
| 9 | **New creatures: the dangler** (wood; the Weaver's drop rehearsed small) **and the skink** (pass); **the bombardier moves from the marsh to the high wood** | shortfall 1: ≥ 3 kinds per 20-min chunk; a ranged threat early | world §2.3 |
| 10 | **New peaks**: the web gauntlet, the roost climb, the storm crossing, the wall-less climb, the roost waking, and **the drowned roots as the marsh's escape**, surfacing in the wood's hub for a home visit | G4 (a peak every 30–60 min, ≥ 2 escapes), G5, G9 | world §2.2 |
| 11 | **Fast travel between hub moon patches ships with Tier 2** | G5: a ≤ 2 min return once play passes ~4 h | world §1 |
| 12 | **Tier 1 is ~3.5 h**: wood and valley, five areas, abilities 0–6, the Weaver and the Mantis | the bar's §5.4 (3–4 h) | world §4 |
| 13 | **Tatter gets a small want in the wood** (it can't cross where she can; something she does opens its way, and it is waiting further on). A small story call, flagged | C11: a character with a want in the first chunk | wood.md rescope |

**Not yet reconciled with the rescope** (each doc owns its part, and these sections now disagree with world.md and
core.md until their owners update them): creatures.md §2 and §6 (the dangler, the skink, the bombardier's move, the
Emperor at the fling glade, Tier rosters); journey.md §3–4 and §7 (new set pieces, the pacing table at ~9.75 h,
double jump and dash in Tier 1); look-and-sound.md §2 and §7 (sub-area moods inside each region kit); tech.md §4 and
§7 (fast travel moves to Tier 2; the find framework; the novelty and find lints).
