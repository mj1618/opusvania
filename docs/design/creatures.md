# Lampfall: creatures and bosses

Draft 1, 2026-10-17. Checked against `core.md` (pillars, lamp verbs, ability chain) and `memory/story.md`. What
exists today and what it cost is in `memory/enemies.md` and `memory/enemies-render.md`. Regions follow `world.md`;
the firefly's story beats follow `journey.md` (which owns them). One swap against `world.md`: the grove of lamps is
the wood's boss and the mantis the valley's, as `journey.md` already has it and as `world.md` question 6 invites
(open question 3). Costs: **S** is a row of numbers or a skin, about one increment. **M** is a new behaviour or a rig
rework, two or three increments. **L** is a new rig family plus a new behaviour, five or more increments with
playtests. The burrback took six playtest rounds to feel right, and every new base creature should be budgeted
the same way.

## 1. Design rules

1. **Every creature is a real night predator of moths, or a real hazard to them.** Spiders web near lights.
   Toads and geckos sit under lamps and eat what falls. Bats hunt moths by sound. Giant cave centipedes catch bats
   in flight. Mountain ravens and pygmy possums feed on migrating Bogong moths at their caves. Start from the
   biology and keep one true detail that the player can see. No invented monsters, and nothing hates Wing. They are
   hungry.
2. **Density follows light** (core §5). Predators gather where moths circle: a lit room is a fight and a dark
   corridor is a rest. Most creatures are **lamp-guarders**: in scene data they are tied to a lamp id. **When that
   lamp is snuffed they disperse** (sight hunters blink, lose interest and wander off to sleep, flyers leave the
   room). Snuffing is how a room goes "dark and safe", so a kill is optional and a snuff is the answer. Roamers
   (not tied to a lamp) are rarer and are placed on purpose.
3. **Three senses, and each one tests a different habit.** One shared "lit" value (how much lamp light she is in,
   from the lamp field) replaces today's glint-wallet `seen` levels.
   | Sense | Who | She is noticed when | What beats it |
   |---|---|---|---|
   | **Sight** (default) | beetles, hawkers, jumping spiders, toads, mantis, nightjar | she is lit and in view | the dark, cover, Shroud |
   | **Vibration** | web spiders, glow-worms | she touches a strand | not touching: careful lines, cutting strands from outside |
   | **Sound** | bats | she makes wing noise (jump, double jump, dash, Moonflight beats) inside a visible sonar ring | quiet moves (walking, gliding). Later Shroud: folding the wings and dropping is what real moths do when a bat calls |
4. **One silhouette, one behaviour, one tell** (pillar 4). Every attack has a windup event with a fixed frame count
   (today's `enemyWindup`) and a fair window after it (winded, stall). The tell is one language for the whole game,
   and it already exists: when a creature notices her, its eyes or spots go to its **hunt colour**, and before it
   strikes, the colour **counts down in quickening flashes** (the burrback's red rim, the lampwing's coral). The hit
   tone (pale outline, then struck dusk) and the death (it breaks into plates, scales or chips) are shared too.
5. **Grabs are Caught.** A web, a toad's tongue, a mantis's forelegs and a sundew all put her in the lamp's
   **Caught** state (beat free with jump presses, or dash out once she has the dash). One mechanic, one input,
   already taught by the first lamp. A creature's Caught costs health while it holds her, which a gentle lamp's
   does not.
6. **Kills pay in safety, not loot.** Glints are gone (core §5), so a dead creature spills nothing. Health comes
   from snuffs and moth milestones. A creature is a reason to read the room, not a resource.
7. **Fair placement**, as already tested for the burrback and lampwing: no landing straight into a creature, no
   route a creature blocks, no hit through ground, and a re-hit gap after every hit. Each new kind gets a pilot test.

## 2. Roster

Four base rigs in Tier 1, about six by the end, everything else a variant. Variant columns name the base and the
change that the player feels.

### The wood (abilities 0–2: blade, pogo, glide, wall jump)
| Creature | Role | Behaviour in one line | Tests | Cost | Base / variant |
|---|---|---|---|---|---|
| **Burrback** (ground beetle; carabid beetles do hunt insects at night) | ground, lamp-guarder | patrols under a lamp, braces, rams, is winded, curls under a pogo | reading a tell, punishing, pogo | S (exists, rework the look toward a carabid, drop the old calm/offer rules) | base: *crawler* |
| **Hawker** (dusk dragonfly; hawkers really do hunt at dusk around lights) | flyer, lamp-guarder | hovers at its lamp, tells, dives in an arc, stalls open, climbs, dives again | glide steering, air cuts, cutting in the stall | M (the lampwing's sim kept, its moth look replaced by a four-winged dragonfly on the same flyer rig) | base: *flyer* (rework of the lampwing) |
| **Orb web + weaver** | hazard-creature | a web strung across a lamp's light. Touching it is Caught, and the weaver runs out along the strands to the spot she touched | Caught and beat free, careful glide lines, cutting strands from outside | M (strands tech + an 8-legged crawler) | base: *crawler* + *strands* |
| **Old burrback** | mini-boss | bigger, 10 hp, its ram carries further and it braces twice in a row | everything the burrback taught | S | variant: burrback (size, numbers, one move) |

### The valley of lamps (adds fling, double jump; flicker lamps)
| Creature | Role | Behaviour | Tests | Cost | Base / variant |
|---|---|---|---|---|---|
| **Toad** | ambusher, lamp-guarder | sits under a lamp, throat pulsing; tongue lashes at anything lit in reach and pulls it in (Caught) | reading reach, flinging past, pogo on its head | M (new squat rig, `lash` block) | base: *squat* |
| **Jumping spider** | ambusher (sight) | crouches on a ledge, all eyes on her, then leaps along a ballistic arc to where she is | timing, side-stepping a leap, up and down cuts | M (`leap` block on the crawler rig) | variant of the *crawler* (8 legs, big front eyes) |
| **Emperor hawker** | flyer | chains two dives with no climb between them | fling and double jump to break line | S | variant: hawker |
| **The Emperor** | mini-boss | an emperor hawker that dives from inside a lantern's pull, later two at once | fling | S | variant: hawker |
| **Mantis nymph** | ground duellist | small mantis: a threat display (wings flared), then one fast strike | the boss's tell, taught small and after the boss, or before it as foreshadowing | S once the boss rig exists | variant: *raptor* (the boss rig, small) |
| **Flicker hunters** | rule, not a creature | sight hunters near a flicker lamp see only while it is on | moving in the off-beat | S | a parameter on any sight hunter |

### The marsh (adds dash, Shroud; glass, ember and drifter lamps)
| Creature | Role | Behaviour | Tests | Cost | Base / variant |
|---|---|---|---|---|---|
| **Pipistrelle** (small bat) | flyer (sound) | pings a visible sonar ring; if the ring meets wing noise it swoops (the hawker's dive) | quiet movement, glide, later Shroud | M (membrane wings on the flyer rig, `sound` sense) | variant: *flyer* |
| **Frog** | ambusher | leaps lily pad to lily pad and lashes in mid-air | dash timing | S | variant: toad (leap block) |
| **Bombardier** | ground | a burrback that sprays a hot cone instead of ramming (bombardier beetles really spray boiling liquid) | spacing, approach from behind | S | variant: burrback (one new move, `spit` block) |
| **Archerfish** | hazard-creature | a ripple, then a jet of water from below knocks her out of the air (archerfish really shoot insects down) | reading ripples, dash across | S–M (mostly water render; a `spit` projectile) | new, tiny rig |
| **Sundew** | hazard-creature | sticky tentacles on a glowing tip: a wick lamp whose core is a creature's Caught | Shroud past its lure | S | variant: wick lamp + Caught damage |
| **Ghost mantis** | ambusher | a mantis that hides as a dead leaf until she is close | reading the world | S | variant: raptor |

### The pass (adds Moonflight; wind)
| Creature | Role | Behaviour | Tests | Cost | Base / variant |
|---|---|---|---|---|---|
| **Nightjar** | flyer (sight), roamer | a big-eyed bird that hunts moths on the wing: it glides a long pass with its gape open, then turns | Moonflight in and out of light | L (new *bird* rig) | base: *bird* |
| **Raven** | flyer, lamp-guarder | perches and hops, then snatches at her (Caught), as ravens do at the moth caves | escape, dash | S once the bird exists | variant: bird |
| **Wolf spider** | ground | runs fast along ledges, sight hunter | ground combat at speed | S | variant: jumping spider |
| **Pygmy possum** (stretch) | ambusher | climbs out of rock gaps and grabs (it lives on Bogong moths) | | L (fur in code is the hardest surface) | new; park unless the pass feels thin |

### The cave (everything; the firefly's collection)
| Creature | Role | Behaviour | Tests | Cost | Base / variant |
|---|---|---|---|---|---|
| **Glow-worm curtain** | hazard-creature (vibration) | a cluster of tiny lights with pull on the ceiling, each hanging sticky threads (real glow-worms lure insects with light) | Shroud through, cut threads, snuff | S | variant: wick lamp + strands |
| **Cave centipede** (small) | ground and wall | runs along walls and ceilings, drops at what passes under | wall play, pogo on segments | M (segment chain on the crawler rig) | base: *chain* (built for the boss) |
| **Cave bats** | flyer (sound) | the pipistrelle in a roost, waking in groups | Shroud | S | variant: pipistrelle |
| **Cave weta / cricket** | ground fodder | hops in the dark, harmless until lit | light reading | S | variant: jumping spider (6 legs, numbers) |

## 3. Bosses

Each boss sits at its region's great lamp (core §2), with a moon patch by the door. **Major** bosses have a name card
and give an ability or open the next region. **Mini**-bosses are variants of regulars in a locked room. Every boss
ends with the great lamp going out.

| Boss | Kind | Fantasy and arena | Phases | Exams | Cost | Risk | Fallback |
|---|---|---|---|---|---|---|---|
| **The Weaver**, wood | major (the first one, so gentle) | the story's "grove of lamps that pull from every side": a clearing between tall trunks where an orb-weaver has strung its web between five wicks around the wood's great lamp | 1: she snuffs the outer wicks while gliding between crossing pulls; each snuff drops one anchor, and the weaver runs to wherever she touches the web. 2: the web falls in sections and the weaver drops on silk from the canopy at telegraphed points (the thread shows first) and swings; she cling-jumps the trunks to stay above. 3: on the floor and trunks, lunges; pogo its abdomen, then snuff the great lamp, and the firefly's first relight follows (`journey.md`) | glide, wall jump, Caught, pogo | L | spider moving on a live verlet web | the web is a fixed graph of nodes and edges; drops at fixed points |
| **The Emperor**, valley | mini | an emperor hawker in a shaft of lanterns by the fling glade | 1: chained dives. 2: it perches on a lantern and dives from inside its pull. 3: two at once | fling to break line, air cuts | S–M | none | one phase |
| **The Mantis**, valley | major | "the mantis under the brightest lamp": a fast duellist on a floor under the valley's great lamp, with a ring of lanterns | 1: ground duel. Dash-strikes across the floor and a raptorial grab that throws her into the great lamp's core. The tell is its real threat display (wings flared, forelegs raised). 2: the great lamp's pull rises and it leaps through the air; she flings round the lanterns to get above it and pogo. 3: the lanterns flicker on a beat, and it strikes only while they are lit (it hunts by sight) | blade reading, fling, Caught escape | L (the raptor rig, fast animation) | speed against readability with code animation | **plan the real attempt** at target speed (Hornet / Mantis Lords pace), tune tell frames in playtests; fall back to longer tells and two phases. The rig is reused for nymphs either way |
| **The Great Toad**, marsh | mini | the toad at 3x, half sunk in black water under an ember lamp | tongue, belly flop (shockwave), swallow (Caught, beat free from inside) | dash | S–M | none | drop the swallow |
| **The Colony**, marsh | major | "the bat colony under the bridge": a dark span over water, hundreds of bats roosting, glass lamps hung below | 1: scouts ping; she moves quietly and cuts them. 2: the colony wakes, and sonar rings sweep the arena; a ring that meets wing noise sends a stream of bats at her, and Shroud drops her out of it (the real moth defence). She shrouds onto the glass lamps to put them out. 3: the colony's mother hunts by ping in the full dark; dash and Shroud timing | Shroud, dash, sound | L (a swarm: many cheap bats, boids, the mother on the flyer rig) | reading a swarm, CPU cost | 6–10 bats in fixed lanes |
| **The Nightjar**, pass | mini (or a regular encounter) | one bird circling a lit ledge at dusk | long passes, a stoop, a ground scuttle | Moonflight in and out of light | (the bird rig is paid by the region) | — | — |
| **The Beacon**, pass | major | "the beacon on the pass, a lamp the size of a tree": Shadow of the Colossus, the boss is a landscape | 1: climb the crag below it while its beam sweeps (inside the beam: pull, and seen by nightjars). 2: at the top, its flames on swinging arms; Moonflight drains in its light, so she refills in its shadow behind the housing. 3: the last flame, the pull at full strength bending the whole screen; fling from the beam itself and Shroud-dive the flame | Moonflight, fling, Shroud | L | can feel like a platforming room, not a fight | a shorter climb and one flame phase; or the nightjar duel as the major boss |
| **The Bat-eater**, cave | major | "the cave of lights": a giant cave centipede hangs from a ceiling of glow-worms and snatches anything flying through their light (real *Scolopendra* do this) | 1: it hangs and grabs at her when she is lit; she snuffs glow-worm patches to make dark pockets. 2: it drops and chases along walls and floor, its body a moving hazard; pogo the segments. 3: it coils round the cave's last bright lamp, and she must fly the coil to reach the flame | everything, especially wall play and Moonflight | L (the chain rig) | a long body that reads clearly | shorter body; it emerges from fixed holes (worm style) |
| **The Firefly**, cave heart | final major | section 4 | | | L | | |

## 4. The firefly

The last firefly, the cause and never an everyday enemy (story rules 1–4). Its arc and its light language belong to
`journey.md`: slow long pulses are calling, fast bright bursts are alarm and fighting, dimming is tiring. Here is
what it costs as a creature. It uses the flyer rig at a small size, the abdomen as its light, and its light is its
face. Every appearance is a cue timeline (`tech.md`: scripted beats) plus a motion path in scene data, and it is
never a hitbox outside the finale.

| Where (journey.md) | What it does | Creature cost |
|---|---|---|
| Wood, about 8:00 | far off across a canopy gap, hanging a glow-cap, then gone | a path and a pulse, 4 s |
| Wood, after the Weaver | darts out of the dark, relights one lamp behind her, flees (the Kuro beat) | the relight cue (one lamp re-armed by a story flag) |
| Valley into marsh | **the chase**: it relights lamps ahead of her down a corridor, and she keeps up only by flinging through them | a path keyed to her position, relights by x. Tier 1 ships the short version |
| Marsh | the empty meadow: it calls over dark firefly husks and nothing answers. No fight | a loop |
| Cave | the finale | |

**The final fight**, at the cave of lights after the Bat-eater:
1. **Its lights.** It zips from lamp to lamp relighting what she snuffs (in its arena only) and throws small lights
   that pull (`spit`). She has to snuff faster than it can relight. Its flashes are fast bursts.
2. **Its own light.** With few lamps left it burns brighter and becomes a lamp with pull. She fights in its pull,
   shrouds to approach, and hits it from just outside the core.
3. **The last light.** Every lamp is out and it is the only light. Its bursts quicken before each charge, so the
   flash count is the tell (the shared tell language). Moonflight in the dark, which is now hers.

Its glow then sinks to a slow dim pulse on the floor and the blade passes over it (`blocks`). The mercy and the
answering flash are `journey.md`'s. This is the most important acting in the game, so it gets a real attempt (story
rules). Fallback: keep it far away and small in every beat except the finale, where it is mostly light anyway.

## 5. Shared tech: build once

### Sim: behaviour building blocks
A creature is **one sense + one movement + one or two attacks + a window**, written as a `KindRules` record built
from shared blocks (`src/sim/enemies/common.ts` grows into the library). Bosses add a phase table on top.

| Block | Exists? | Used by |
|---|---|---|
| sense: `sight(lit)`, `vibration(strand)`, `sound(noise, ring)` | sight exists (driven by the wallet today; rework it to read lamp light) | all |
| move: ground patrol with lips and wary | yes (burrback) | beetles, spiders, wolf spider, weta |
| move: hover in a territory | yes (lampwing) | hawkers, bats, firefly |
| move: surface crawl (along walls and ceilings) | new | spiders, centipede, gecko-type variants |
| move: anchored, path-follow, hang on a thread | new (path-follow is shared with lantern and drifter lamps) | toads, sundews, weaver drops, firefly |
| attack: charge | yes | burrback, old burrback |
| attack: arc dive, stall, climb | yes | hawkers, bats, nightjar |
| attack: `lash` (a hitbox along a line, out and back) | new | toad tongue, frog, mantis strike, raven snatch |
| attack: `leap` (ballistic to a target) | new | jumping spider, frog, mantis phase 2, weta |
| attack: `spit` (one projectile system) | new | bombardier, archerfish, firefly's thrown lights |
| grab into Caught | new, reusing the lamp's Caught | web, toad, mantis, raven, sundew, glow-worms |
| window: winded / stall / `blocks` / curl | yes | everyone |
| disperse on snuff (lamp-guarder) | new, replaces the lantern calm | all lamp-guarders |
| swarm (boids, deterministic) | new | bat colony, cave bats; render already needs it for freed moths |
| boss: phase table, arena lock, cue timeline, name card | new | all bosses, firefly beats |

### Render: rig families
| Family | Built for | Then reused by |
|---|---|---|
| **Crawler** (`gait.ts` generalised to N legs, body as shells) | burrback (exists) | weaver, jumping and wolf spiders, weta, centipede segments |
| **Flyer** (wing pairs on a beat, abdomen ribbon) | lampwing (exists) | hawker, emperor, firefly, bats (membrane wing shape), colony mother |
| **Squat** (soft body, throat sac, tongue spline) | toad | frog, great toad |
| **Raptor** (upright, folding forelegs, flaring wings) | the mantis boss | nymph, ghost mantis |
| **Strands** (verlet lines) | orb web | silk drops, glow-worm threads, lantern chains (core §3) |
| **Chain** (segments following a head) | the Bat-eater | small centipedes |
| **Bird** (layered feather shapes, a big gape) | nightjar | raven |
| Shared look | hunt colour and countdown flashes, hit tone, notice pose, death particles (plates, scales, chips), "winded is pale" | everyone |

Rule: **a boss rig pays twice.** Every major boss's rig is built so that a small version is a regular enemy
(mantis to nymph, colony mother to pipistrelle, Bat-eater to small centipede).

## 6. Scope tiers

**Tier 1 (core §8.7: wood and valley, abilities 0–4, two major bosses).** Four rig families (crawler, flyer, squat,
raptor) plus strands. Build order, each step playable and polished before the next:

1. **Rework the senses to lamp light** and add **disperse on snuff**, on the existing burrback (with the first lamp
   increment in PLAN.md). Drop the offer and lantern-calm rules. S–M.
2. **Hawker**: the lampwing's sim on a new dragonfly look. M.
3. **Grab into Caught** + **orb web and weaver** (strands, an 8-legged crawler). M.
4. **Old burrback** mini-boss at the wall-cling glade. S.
5. **Firefly**, the glimpse and the relight: the flyer rig small, cue timeline, light language. M.
6. **The Weaver** (wood boss), ending in the relight. L.
7. **Toad** (squat rig, `lash`). M.
8. **Jumping spider** (`leap`), **emperor hawker**, **the Emperor** mini-boss. M + S + S.
9. **The Mantis** (raptor rig), then **nymphs** from its rig. L + S.
10. **The firefly chase**, short version, at the valley's edge. M.

Tier 1 roster: 7 regular kinds (4 of them variants), 2 mini-bosses, 2 major bosses, 3 firefly beats.

**Tier 2 (marsh, pass).** Pipistrelle, frog, bombardier, archerfish, sundew, ghost mantis, the Great Toad, the
Colony, the full chase, the meadow; the bird rig, raven, wolf spider, nightjar, the Beacon. **Tier 3 (cave).** Glow-worms, the
chain rig, cave bats, weta, the Bat-eater, the firefly finale.

**Extending later.** A new creature is first a variant row (size, palette, numbers, one block swapped), and a new
block or rig only when a row can't express it. The same rule core.md uses for lamps.

## 7. Easy-path choices

| Chose | Over | Why the fun is the same |
|---|---|---|
| Variants (size, palette, timing, one new block) for about two thirds of the roster | a new creature per encounter | HK's roster is full of re-skins with one new move. The player feels the new move, not the new skeleton |
| Grabs reuse Caught | per-creature grab states and escape minigames | one input, already taught by the first lamp, and it makes predators and lamps one language |
| Snuff disperses lamp-guarders | every fight to the death | the pillar's "dark is safe" becomes a tactic, and skipping a fight is a skill, not a cheat |
| The lampwing's sim kept, the look changed to a dragonfly | a new flyer | the dive was tuned over two playtests. A moth eating moths made no sense |
| Boss rigs reused as regulars | separate rigs for boss and regulars | each L rig pays twice |
| One tell language (hunt colour, counted flashes) | a tell designed per creature | readable at play zoom with no learning per creature, and the burrback and lampwing already proved it |
| Firefly as a light with a pulse language | a puppet that acts | light reads at any size, and it is the relationship and the ending. No directed acting (`story-direction.md`) |
| The Beacon as a landscape boss, the Weaver's arena made of lamps | a creature for every boss | Shadow of the Colossus and Ori's escapes. Lamps are already our richest system |
| Glow-worms and sundews as wick lamps plus a creature's Caught | new creatures | built from parts that exist by then |
| The pygmy possum parked | fur in Tier 2 | ravens and nightjars carry the pass. Fur only if the pass feels thin |

## 8. Open questions for Matt

1. **Rework the lampwing into the hawker (dusk dragonfly), keeping its sim?** *Recommend:* yes. A glowing moth that
   hunts moths fights the story, and its lamp bulb now belongs to the environment.
2. **Snuffing a lamp disperses its predators.** *Recommend:* yes for lamp-guarders. A snuff under pressure is a
   valid way through a fight. Roamers and bosses don't disperse.
3. **The grove of lamps (the Weaver) is the wood's boss and the mantis the valley's,** swapping `world.md`'s table.
   *Recommend:* yes, as `journey.md` already has it. A spatial boss made of pulls suits the first hour; the fast
   mantis gets fling and a full Tier 1 of practice, so it can be fast without a gentle first version.
4. **Bats hunt by sound** (Shroud as the real moth drop). *Recommend:* yes. It gives the marsh a new rule instead of
   a new enemy skin, and the biology is a gift.
5. **The firefly is not killed.** *Recommend:* the last blow puts out its light, it lives, and the answering flash
   is its reward too. Killing it would undo "lonely, not evil".
6. **Kills give nothing but safety** (no drops). *Recommend:* yes, so health stays tied to snuffs, which keeps
   the play at the lamps.
7. **A spider as the wood's boss creature.** The story list names no creature for the grove of lamps. *Recommend:*
   the orb-weaver, since spiders really web at lights and its web is the strands tech the wood needs anyway.
   Fallback: the grove with burrbacks and hawkers in the gaps (`world.md`'s version).
