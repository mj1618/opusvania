# Lampfall: creatures and bosses

Draft 1, 2026-10-17; §2, §3, §4 and §6 rescoped 2026-10-18 for an Ori-length game (14 areas, 12 abilities,
`world.md` §2.2–2.3, `core.md` §4). Checked against `core.md` (pillars, lamp verbs, ability chain) and `memory/story.md`. What
exists today and what it cost is in `memory/enemies.md`, `memory/enemies-render.md`, `memory/creatures.md` and
`memory/bosses.md`. Regions and areas follow `world.md`; the firefly's story beats follow `journey.md` (which owns
them). The grove of lamps is the wood's boss and the mantis the valley's (settled in reconciliation). Costs: **S** is a row of numbers or a skin, about one increment. **M** is a new behaviour or a rig
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
   | **Sight** (default) | beetles, danglers, hawkers, jumping spiders, toads, skinks, mantis, ravens, nightjar | she is lit and in view | the dark, cover, Shroud |
   | **Vibration** | web spiders, glow-worms | she touches a strand | not touching: careful lines, cutting strands from outside |
   | **Sound** | bats | she makes wing noise (jump, double jump, dash, Gust, Moonflight beats) inside a visible sonar ring | quiet moves (walking, gliding, Soar). Fold and Shroud: folding the wings and dropping is what real moths do when a bat calls (both arrive in the marsh with the bats) |
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

## 2. Roster (rescoped 2026-10-18)

**22 regular kinds over 14 areas** (draft 1: ~20 over five regions), on seven rigs, about two thirds of them variant
rows. The rescope adds two kinds and moves one, all to meet the bar's C2 (≥ 3 creature kinds in every 20-minute
chunk) without new rigs: the **dangler** (wood floor), the **skink** (the scree), and the **bombardier** moved from
the marsh to the high wood so the wood has a ranged threat early (HK's Aspid slot). Each region's table names the
**area** where the kind is first met (numbers as in `world.md` §2.2); the per-area mix and its combinations are
`world.md` §2.3's table, which this roster has to keep fed. Variant columns name the base and the change that the
player feels.

### The wood (areas 1–2; abilities 0–3: blade, pogo, glide, wall jump, then Gust at the canopy edge)
| Creature | First met | Role | Behaviour in one line | Tests | Cost | Base / variant |
|---|---|---|---|---|---|---|
| **Burrback** (ground beetle; carabid beetles do hunt insects at night) | 1 wood floor | ground, lamp-guarder | patrols under a lamp, braces, rams, is winded, curls under a pogo | reading a tell, punishing, pogo | S (exists, rework the look toward a carabid, drop the old calm/offer rules) | base: *crawler* |
| **Dangler** (new; spiders really drop on a dragline to ambush, and the bolas spider hunts moths on a single line at night) | 1 wood floor (R14, then R8–R9) | ambusher, lamp-guarder | the thread shows first, it drops on silk to a lit point, swings once, hangs open for a cut, climbs back. It drops only inside its lamp's light; a snuff sends it up for good | reading a thread, waiting out a swing, the up cut. It rehearses the Weaver's drops ~30 min before the fight (C13) | S (the weaver's drop on a small weaver) | variant: weaver (*crawler* + *strands*), small |
| **Hawker** (dusk dragonfly; hawkers really do hunt at dusk around lights) | 1 wood floor | flyer, lamp-guarder | hovers at its lamp, tells, dives in an arc, stalls open, climbs, dives again | glide steering, air cuts, cutting in the stall | M (the lampwing's sim kept, its moth look replaced by a four-winged dragonfly on the same flyer rig) | base: *flyer* (rework of the lampwing) |
| **Old burrback** | 1 wood floor (the well) | mini-boss | bigger, 10 hp, its ram carries further and it braces twice in a row | everything the burrback taught | S | variant: burrback (size, numbers, one move) |
| **Bombardier** (moved from the marsh; bombardier beetles really fire a boiling spray from the tail) | 2 high wood (R15 boughs) | ground, lamp-guarder, ranged | perches on a ledge, turns its tail, and spits a burst of spray in an arc at where she is lit; up close it sprays a short cone instead of ramming | spacing, crossing an arc's gap, approaching from behind, climbing under fire | S (the burrback with one new move; builds the `spit` block that Gust and the archerfish reuse) | variant: burrback (`spit` block) |
| **Orb web + weaver** | 2 high wood (R12 web hall) | hazard-creature | a web strung across a lamp's light. Touching it is Caught, and the weaver runs out along the strands to the spot she touched. Gust tears strands from outside once she has it | Caught and beat free, careful glide lines, cutting strands from outside | M (strands tech + an 8-legged crawler; exists) | base: *crawler* + *strands* |

### The valley of lamps (areas 3–5; adds fling, double jump, dash; flicker lamps)
| Creature | First met | Role | Behaviour | Tests | Cost | Base / variant |
|---|---|---|---|---|---|---|
| **Toad** | 3 rim | ambusher, lamp-guarder | sits under a lamp, throat pulsing; tongue lashes at anything lit in reach and pulls it in (Caught) | reading reach, flinging past, pogo on its head | M (new squat rig, `lash` block) | base: *squat* |
| **Jumping spider** | 3 rim | ambusher (sight) | crouches on a ledge, all eyes on her, then leaps along a ballistic arc to where she is | timing, side-stepping a leap, up and down cuts | M (`leap` block on the crawler rig) | variant of the *crawler* (8 legs, big front eyes) |
| **Emperor hawker** | 3 rim | flyer | chains two dives with no climb between them | fling and Gust to break line | S | variant: hawker |
| **The Emperor** | 3 rim (1:52) | mini-boss | an emperor hawker that dives from inside a lantern's pull, later two at once | fling | S | variant: hawker |
| **Mantis nymph** | 4 roost | ground duellist | small mantis: a threat display (wings flared), then one fast strike | the boss's tell, taught small in the roost an hour before the Mantis (foreshadowing) | S once the boss rig exists | variant: *raptor* (the boss rig, small) |
| **Flicker hunters** | 3 rim, the roost's rule | rule, not a creature | sight hunters near a flicker lamp see only while it is on | moving in the off-beat | S | a parameter on any sight hunter |

The dangler and the hawker carry on into the roost and the bright floor, so the valley's chunks mix old kinds with
new ones (`world.md` §2.3).

### The marsh (areas 6–8; adds Fold, Shroud, Soar; glass, ember and drifter lamps)
| Creature | First met | Role | Behaviour | Tests | Cost | Base / variant |
|---|---|---|---|---|---|---|
| **Pipistrelle** (small bat) | 6 reedbeds | flyer (sound) | pings a visible sonar ring; if the ring meets wing noise it swoops (the hawker's dive) | quiet movement, glide, Fold's drop, then Shroud | M (membrane wings on the flyer rig, `sound` sense) | variant: *flyer* |
| **Frog** | 6 reedbeds | ambusher | leaps lily pad to lily pad and lashes in mid-air | dash timing | S | variant: toad (leap block) |
| **Archerfish** | 6 reedbeds | hazard-creature | a ripple, then a jet of water from below knocks her out of the air (archerfish really shoot insects down) | reading ripples, dash across | S–M (mostly water render; reuses `spit`) | new, tiny rig |
| **Sundew** | 7 fen | hazard-creature | sticky tentacles on a glowing tip: a wick lamp whose core is a creature's Caught | Shroud past its lure | S | variant: wick lamp + Caught damage |
| **Ghost mantis** | 7 fen | ambusher | a mantis that hides as a dead leaf until she is close | reading the world | S | variant: raptor |

### The pass (areas 9–11; adds Grip, Moonflight; wind, frost faces, the beam)
| Creature | First met | Role | Behaviour | Tests | Cost | Base / variant |
|---|---|---|---|---|---|---|
| **Raven** | 9 scree | flyer, lamp-guarder | perches and hops, then snatches at her (Caught), as ravens do at the moth caves | escape, dash | L (the *bird* rig is built for it, since it is met first) | base: *bird* |
| **Skink** (new; alpine skinks live on the Bogong moths' mountains, and a cold lizard is slow until it warms) | 9 scree | ground ambusher, lamp-guarder | basks in a lamp's light between cairns. In the cold dark it is sluggish; lit, it darts a short burst along the ground and snaps, then freezes still | reading warm and cold (snuffing slows it before it disperses), side-stepping a dart, pogo | S (a low, long-tailed squat body with a dart instead of a tongue) | variant: *squat* |
| **Wolf spider** | 9 scree | ground | runs fast along ledges, sight hunter | ground combat at speed | S | variant: jumping spider |
| **Nightjar** | 10 cliffs | flyer (sight), roamer | a big-eyed bird that hunts moths on the wing: it glides a long pass with its gape open, then turns | Grip and Soar on faces under its passes; at the beacon, Moonflight in and out of light | M (the raven's rig with a big gape and a long gliding pass) | variant: *bird* |
| **Pygmy possum** (stretch) | — | ambusher | climbs out of rock gaps and grabs (it lives on Bogong moths) | | L (fur in code is the hardest surface) | new; park unless the pass feels thin |

### The cave (areas 12–14; adds Shadow dash; the firefly's collection)
| Creature | First met | Role | Behaviour | Tests | Cost | Base / variant |
|---|---|---|---|---|---|---|
| **Glow-worm curtain** | 12 cave mouth | hazard-creature (vibration) | a cluster of tiny lights with pull on the ceiling, each hanging sticky threads (real glow-worms lure insects with light) | Shroud through, cut threads, snuff, Shadow dash through | S | variant: wick lamp + strands |
| **Cave bats** | 12 cave mouth (the roost wakes, 8:35) | flyer (sound) | the pipistrelle in a roost, waking in groups | Shroud | S | variant: pipistrelle |
| **Cave weta / cricket** | 12 cave mouth | ground fodder | hops in the dark, harmless until lit | light reading | S | variant: jumping spider (6 legs, numbers) |
| **Cave centipede** (small) | 12 cave mouth | ground and wall | runs along walls and ceilings, drops at what passes under | wall play, pogo on segments | M (segment chain on the crawler rig) | base: *chain* (built for the boss) |

### The optional areas (rescoped 2026-10-18)
No new kinds: each is a remix that pays the kit she has. **The canopy** (wood, north; Tier 3): hawkers, emperor
hawkers and nightjars in the open sky above the trees, flown with fling, double jump, Soar and Moonflight. **The
underways** (beneath the valley; Tier 2): toads and frogs in the root tunnels, pipistrelles in the dark, and **the
old toad** (mini). `world.md` §2.3 also lists cave bats and small centipedes there: cave bats are a pipistrelle row
and can ship with Tier 2, but the centipede needs the chain rig, which Tier 3 builds for the Bat-eater, so the
underways' centipedes are a Tier 3 hook added to its rooms then (`world.md` §5 rule 8).

## 3. Bosses (rescoped 2026-10-18)

Each major boss sits at its region's great lamp (core §2), with a moon patch by the door. **Major** bosses give an
ability or open the next region. **Mini**-bosses are variants of regulars in a locked room, each the exam of the
ability found just before it. Every major boss ends with its great lamp going out. No boss has a name card (pillar
5 and `look-and-sound.md` §5: text is item lines and the title only); a boss is announced by its arena, its light
and its music. All of them run on one framework (arena lock, phase table, cue timeline, retry, defeat flag), built
for the Weaver (`memory/bosses.md`).

**Cadence and rewards.** The clock is the first-timer's time since the hatch (`world.md` §2.2). Majors land 80–145
minutes apart (a region climax every 1.5–2.5 h, G4) until the cave, where the Bat-eater and the firefly come 30
minutes apart as the finale; minis fill the gaps, so with the set pieces (`journey.md`
§3) a peak comes about every 30 minutes.

| Clock | Boss | Kind | Area | Exam of | Reward |
|---|---|---|---|---|---|
| 0:25 | the old burrback | mini | 1 wood floor (the well) | blade, pogo | the well's glade: **wall jump** (0:28) |
| 1:00 | **the Weaver** | major | 2 high wood (the grove) | glide, wall jump, Caught, pogo | the first sky clear and the relight; the first health milestone (110 moths) in its burst; glade 3 at the canopy edge: ***Gust*** (1:06); the way to the valley |
| 1:52 | the Emperor | mini | 3 rim | **Fling** (1:46) | the way into the roost |
| 3:08 | **the Mantis** | major | 5 bright floor | blade reading, fling, double jump, Caught escape | the valley's great lamp out; the glade beyond: **dash** (3:15); then the river of moths |
| 4:05 | the Great Toad | mini | 6 reedbeds | ***Fold*** (4:00), dash | the way into the fen |
| 5:22 | **the Colony** | major | 8 bridge | Fold, Shroud, dash, sound | the bridge falls: the drowned roots, where ***Soar*** (5:30) carries her up the escape |
| 7:08 | the Nightjar | mini | 10 cliffs | ***Grip*** (6:40), Soar | the way up to the beacon |
| 7:45 | **the Beacon** | major | 11 beacon | ***Moonflight*** (7:20), fling, Shroud | the pass goes dark; the cave mouth appears above: the wall-less climb |
| 9:05 | **the Bat-eater** | major | 13 cave of lights | ***Shadow dash*** (8:30), wall play, Moonflight | the way home |
| 9:35 | **the firefly** | final major | 14 home | everything | the ending |
| opt | the old toad | mini | the underways | Fold, Shroud in the dark | the underways' moonlit hollow lies past it |

Draft 1 had the Mantis give double jump and the Nightjar test Moonflight. The rescope moves double jump to the
roost's crown, makes dash the Mantis's reward (HK's dash after Hornet) and puts the Nightjar before Moonflight, as
Grip's exam (`core.md` §4).

| Boss | Kind | Fantasy and arena | Phases | Exams | Cost | Risk | Fallback |
|---|---|---|---|---|---|---|---|
| **The Weaver**, high wood | major (the first one, so gentle) | the story's "grove of lamps that pull from every side": a clearing between tall trunks where an orb-weaver has strung its web between five wicks around the wood's great lamp | 1: she snuffs the outer wicks while gliding between crossing pulls; each snuff drops one anchor, and the weaver runs to wherever she touches the web. 2: the web falls in sections and the weaver drops on silk from the canopy at telegraphed points (the thread shows first, as the danglers taught) and swings; she kicks up the trunks to stay above. 3: on the floor and trunks, lunges; pogo its abdomen, then snuff the great lamp, and the firefly's first relight follows (`journey.md`) | glide, wall jump, Caught, pogo | L (greybox exists in `lab-weaver`) | spider moving on a live verlet web | the web is a fixed graph of nodes and edges; drops at fixed points |
| **The Emperor**, rim | mini | an emperor hawker in a shaft of lanterns by the fling glade | 1: chained dives. 2: it perches on a lantern and dives from inside its pull. 3: two at once | fling to break line, air cuts, Gust to push it off a dive | S–M | none | one phase |
| **The Mantis**, bright floor | major | "the mantis under the brightest lamp": a fast duellist on a floor under the valley's great lamp, with a ring of lanterns | 1: ground duel. Dash-strikes across the floor and a raptorial grab that throws her into the great lamp's core. The tell is its real threat display (wings flared, forelegs raised). 2: the great lamp's pull rises and it leaps through the air; she flings round the lanterns and double-jumps to get above it and pogo. 3: the lanterns flicker on a beat, and it strikes only while they are lit (it hunts by sight). She has no dash yet: Caught is beaten free with presses, and the dash she earns here is the answer she wanted | blade reading, fling, double jump, Caught escape | L (the raptor rig, fast animation) | speed against readability with code animation | **plan the real attempt** at target speed (Hornet / Mantis Lords pace), tune tell frames in playtests; fall back to longer tells and two phases. The rig is reused for nymphs either way, and the nymphs ship first (the roost) |
| **The Great Toad**, reedbeds | mini | the toad at 3x, half sunk in black water under an ember lamp | tongue, belly flop (shockwave), swallow (Caught, beat free from inside). Its head surfaces after each flop: a folded dive onto it is the damage window | Fold, dash | S–M | none | drop the swallow |
| **The Colony**, bridge | major | "the bat colony under the bridge": a dark span over water, hundreds of bats roosting, glass lamps hung below | 1: scouts ping; she moves quietly and cuts them. 2: the colony wakes, and sonar rings sweep the arena; a ring that meets wing noise sends a stream of bats at her, and Fold or Shroud drops her out of it (the real moth defence). She shrouds onto the glass lamps to put them out. 3: the colony's mother hunts by ping in the full dark; dash and Shroud timing. The span breaks as it falls, and the drowned roots begin | Fold, Shroud, dash, sound | L (a swarm: many cheap bats, boids, the mother on the flyer rig) | reading a swarm, CPU cost | 6–10 bats in fixed lanes |
| **The Nightjar**, cliffs | mini | one bird circling a lit ledge at dusk, its passes sweeping a frost face she must climb | long passes across the face (Grip and hold still, or let go and Soar out), a stoop, a ground scuttle on the ledge | Grip, Soar | (the bird rig is paid by the scree's ravens) | — | a regular encounter instead |
| **The Beacon**, beacon | major | "the beacon on the pass, a lamp the size of a tree": Shadow of the Colossus, the boss is a landscape | 1: climb the crag below it while its beam sweeps (inside the beam: pull, and seen by nightjars). 2: at the top, its flames on swinging arms; Moonflight drains in its light, so she refills in its shadow behind the housing. 3: the last flame, the pull at full strength bending the whole screen; fling from the beam itself and Shroud-dive the flame | Moonflight, fling, Shroud | L | can feel like a platforming room, not a fight | a shorter climb and one flame phase; or the nightjar duel as the major boss |
| **The Bat-eater**, cave of lights | major | "the cave of lights": a giant cave centipede hangs from a ceiling of glow-worms and snatches anything flying through their light (real *Scolopendra* do this) | 1: it hangs and grabs at her when she is lit; she snuffs glow-worm patches to make dark pockets. 2: it drops and chases along walls and floor, its body a moving hazard; pogo the segments, or Shadow dash through the body when it corners her. 3: it coils round the cave's last bright lamp, and she must fly the coil to reach the flame | everything, especially wall play, Shadow dash and Moonflight | L (the chain rig) | a long body that reads clearly | shorter body; it emerges from fixed holes (worm style) |
| **The old toad**, underways (optional) | mini | a Great Toad row in a flooded root chamber, in the dark | the Great Toad's moves, in true dark: its throat glow is the only light, and Shroud hides her from its tongue | Fold, Shroud | S | none | — |
| **The Firefly**, home | final major | section 4 | | | L | | |

## 4. The firefly

The last firefly, the cause and never an everyday enemy (story rules 1–4). Its arc and its light language belong to
`journey.md`: slow long pulses are calling, fast bright bursts are alarm and fighting, dimming is tiring. Here is
what it costs as a creature. It uses the flyer rig at a small size, the abdomen as its light, and its light is its
face. Every appearance is a cue timeline (`tech.md`: scripted beats) plus a motion path in scene data, and it is
never a hitbox outside the finale.

Rescoped 2026-10-18: the clock marks follow `journey.md` §4 and `world.md` §2.2.

| Where (journey.md), clock | What it does | Creature cost |
|---|---|---|
| Wood floor, the hub, ~0:10 | far off across a canopy gap, hanging a glow-cap, then gone | a path and a pulse, 4 s |
| High wood, after the Weaver, 1:02 | darts out of the dark, relights one lamp behind her, flees (the Kuro beat) | the relight cue (one lamp re-armed by a story flag) |
| The roost, its crown, ~2:35 | on a high branch above the dead tree it flashes its rhythm at the empty sky, slow and long; nothing answers | a loop on a path, 6 s |
| Bright floor into the reedbeds, 3:25–3:30 | **the chase**: it relights lamps ahead of her down a corridor, and she keeps up only by flinging through them and dashing out of Caught | a path keyed to her position, relights by x. Tier 1 ships the short version, which ends at the marsh fog |
| The fen, 4:50 | the empty meadow: it calls over dark firefly husks and nothing answers. No fight | a loop |
| The beacon, 7:45 | at the top of the beacon, flashing at the stars, then fleeing up toward the cave as the last flame dies | a path and a pulse |
| Home, 9:35 | the finale | |

**The final fight**, at home (the heart of the cave of lights, area 14) after the Bat-eater:
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
| move: anchored, path-follow, hang on a thread | the thread exists (the Weaver's drops); path-follow is shared with lantern and drifter lamps | toads, sundews, weaver drops, danglers, firefly |
| attack: charge | yes | burrback, old burrback, skink (a short dart) |
| attack: arc dive, stall, climb | yes | hawkers, bats, nightjar |
| attack: `lash` (a hitbox along a line, out and back) | new | toad tongue, frog, mantis strike, raven snatch |
| attack: `leap` (ballistic to a target) | new | jumping spider, frog, mantis phase 2, weta |
| attack: `spit` (one projectile system) | new, built for the bombardier in the high wood | bombardier, archerfish, firefly's thrown lights; Wing's Gust is the same projectile with her as the source (`core.md` §4) |
| grab into Caught | new, reusing the lamp's Caught | web, toad, mantis, raven, sundew, glow-worms |
| window: winded / stall / `blocks` / curl | yes | everyone |
| disperse on snuff (lamp-guarder) | new, replaces the lantern calm | all lamp-guarders |
| swarm (boids, deterministic) | new | bat colony, cave bats; render already needs it for freed moths |
| boss: phase table, arena lock, cue timeline, retry, defeat flag | yes (built for the Weaver, `memory/bosses.md`) | all bosses, firefly beats, the set pieces' cue timelines (relight, chase, escape, storm) |

### Render: rig families
| Family | Built for | Then reused by |
|---|---|---|
| **Crawler** (`gait.ts` generalised to N legs, body as shells) | burrback (exists) | bombardier, weaver, dangler, jumping and wolf spiders, weta, centipede segments |
| **Flyer** (wing pairs on a beat, abdomen ribbon) | lampwing (exists) | hawker, emperor, firefly, bats (membrane wing shape), colony mother |
| **Squat** (soft body, throat sac, tongue spline) | toad | frog, great toad, old toad, skink (long and low, a tail) |
| **Raptor** (upright, folding forelegs, flaring wings) | the mantis boss | nymph, ghost mantis |
| **Strands** (verlet lines) | orb web | silk drops (the Weaver's and the danglers'), glow-worm threads, lantern chains (core §3) |
| **Chain** (segments following a head) | the Bat-eater | small centipedes |
| **Bird** (layered feather shapes, a big gape) | raven (the scree, met first) | nightjar |
| Shared look | hunt colour and countdown flashes, hit tone, notice pose, death particles (plates, scales, chips), "winded is pale" | everyone |

Rule: **a boss rig pays twice.** Every major boss's rig is built so that a small version is a regular enemy
(Weaver to dangler, mantis to nymph, colony mother to pipistrelle, Bat-eater to small centipede).

## 6. Scope tiers (rescoped 2026-10-18)

**Tier 1 (wood and valley: areas 1–5, abilities 0–6, ~3.5 h; README scope tiers).** Four rig families (crawler,
flyer, squat, raptor) plus strands, and the `spit` block. Build order, each step playable and polished before the
next, in the order the player meets them:

1. **Rework the senses to lamp light** and add **disperse on snuff**, on the existing burrback (with the first lamp
   increment in PLAN.md). Drop the offer and lantern-calm rules. S–M. (Exists: `memory/creatures.md`.)
2. **Hawker**: the lampwing's sim on a new dragonfly look. M. (Sim exists.)
3. **Grab into Caught** + **orb web and weaver** (strands, an 8-legged crawler). M. (Sim exists.)
4. **Old burrback** mini-boss in the well, before glade 2. S. (Sim exists.)
5. **Dangler**: the weaver's drop on a small weaver, for the wood floor's current chunk (`regions/wood.md`,
   rescope item 1). S.
6. **Firefly**, the glimpse and the relight: the flyer rig small, cue timeline, light language. M.
7. **Bombardier** (`spit`), for the high wood; Gust reuses the block. S.
8. **The Weaver** (wood boss), ending in the relight. L. (Greybox exists in `lab-weaver`.)
9. **Toad** (squat rig, `lash`). M.
10. **Jumping spider** (`leap`), **emperor hawker**, **the Emperor** mini-boss. M + S + S.
11. **The Mantis** (raptor rig), then **nymphs** from its rig. L + S. The nymphs ship in the roost, before the
    Mantis is met, so the rig is built ahead of its area.
12. **The firefly chase**, short version, from the bright floor to the marsh fog. M.

Tier 1 roster: **9 regular kinds** (burrback, dangler, hawker, bombardier, orb web + weaver, toad, jumping spider,
emperor hawker, mantis nymph; 5 of them variants) plus the flicker hunters' rule, 2 mini-bosses (the old burrback,
the Emperor), 2 major bosses (the Weaver, the Mantis), 4 firefly beats (the glimpse, the relight, the crown, the
short chase). Every 20-minute chunk has ≥ 3 kinds (`world.md` §2.3).

**Tier 2 (marsh, pass, the underways: areas 6–11 + one optional).** Pipistrelle, frog, archerfish, sundew, ghost
mantis, the Great Toad, the Colony, the full chase, the meadow; the bird rig, raven, skink, wolf spider, nightjar,
the Nightjar mini, the Beacon; cave bats (a pipistrelle row) and the old toad for the underways. 9 new regular kinds,
3 minis, 2 majors.

**Tier 3 (cave, the canopy: areas 12–14 + one optional).** Glow-worms, the chain rig, cave weta, small centipedes
(also added to the underways as a hook), the cave bats' roost waking, the Bat-eater, the firefly finale. The canopy
reuses hawkers, emperor hawkers and nightjars. 3 new regular kinds (cave bats ship in Tier 2), 1 major and the final
boss.

**Extending later.** A new creature is first a variant row (size, palette, numbers, one block swapped), and a new
block or rig only when a row can't express it. The same rule core.md uses for lamps. At 2.3x the rooms, an area's
new creature code is capped at one block or rig (`world.md` §4.1); every other creature in it is a row.

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
| The pygmy possum parked | fur in Tier 2 | ravens, skinks and nightjars carry the pass. Fur only if the pass feels thin |
| The dangler as the Weaver's drop made small (rescoped 2026-10-18) | a new early creature with its own rig | a third kind in the first chunk for one row, and the boss's rhythm is rehearsed before the boss (C13) |
| The skink as a squat row whose speed follows the lamp light (rescoped 2026-10-18) | a new rig for the pass | the pass's thin ground gets a quick threat, and the cold reads as a rule |

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

**Rescope, 2026-10-18.** The dangler, the skink and the bombardier's move to the high wood are README rescope call 9;
the Mantis giving dash and the Nightjar becoming Grip's exam follow call 6. Each is assumed until Matt vetoes it.
