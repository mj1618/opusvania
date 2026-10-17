# Lampfall: the journey

Draft 1, 2026-10-17; §1, §3, §4, §7 and parts of §2, §5 and §6 rescoped 2026-10-18 for an Ori-length game (14
areas, ~9.75 h main; `world.md` §2.2, `core.md` §4). The story is unchanged. The story as the player lives it: beats per region and area, the opening and the ending as stageable
moments, the set pieces, pacing, wayfinding without the mountain, and the wordless details that tell what happened.
It follows `docs/design/core.md` (pillars, lamp verbs, ability chain) and `memory/story.md`. Where the world map
(`world.md`) or the creatures and bosses (`creatures.md`) disagree, those docs own geography and creatures; this one
owns the order of feelings. Big calls are at the end with a recommendation, and the doc assumes the recommendation.

**Retold in one sentence:** the last moth to hatch chases her swarm, finds it trapped at false lights all along the
road, puts the lights out one by one, and learns they were hung by the last firefly calling for a mate; she brings her
kind home to the dark, and something far off answers it.

**One staging rule for everything below:** a story moment is a *place she flies into* with the player in control.
The camera may lift or widen, the music may swell, and input may be held for at most 3 s at a time (the ending's
final pull-up is the only longer exception). No cuts, no letterbox, no dialogue. Every moment uses the existing rig,
the swarm renderer, the camera and the sky uniform. Nothing is a bespoke cutscene.

## 1. The cast and the relationships

Matt wants the idea / world / people balance of Ori, Hollow Knight and Nine Sols. Code-drawn puppets can't act
(`story-direction.md`), so each relationship is carried by something the engine already does well: light, motion,
and where a character *is*.

| Who | The relationship | Carried by | Cost |
|---|---|---|---|
| **The swarm** | Her kind. She chases them, then frees them a cloud at a time | Freed moths fly with her, then leave along the migration line. The cave ceiling at the end | Render swarm (core.md §3) |
| **The firefly** | The antagonist she comes to understand (Kuro in Ori) | **Light, not acting.** Its flash language: slow long pulses = calling, fast bright bursts = alarm and fighting, dimming = tiring. Its body is tiny; its light is the face | One small actor + a flash pattern table |
| **Tatter** (working name, never on screen) | A companion. The other late hatchling: a moth with one torn wing who can't fly the road, so it walks it, and it wants to keep up | Where it is: resting at moon patches ahead of her, sitting when she sits, stuck where a walker can't pass. Three short interactions (below) | Wing's rig re-paletted, one wing cut short, three states (rest, walk, look up). No new rig |

**Recommend Tatter** (open question 1). The firefly alone gives us an antagonist relationship but no warmth, and the
swarm is a crowd, not a person. Tatter is the Quirrel slot done the cheap way: no lines, it is simply there at the
rest points, which also makes it a breadcrumb (§5). **Rescoped 2026-10-18:** it also gets a small want in the wood
(README rescope call 13, the bar's C11: a character with a want in the first chunk): it can't cross where she can,
something she does opens its way, and it is waiting further on. Its arc in six beats (clock as in §4):
1. **Wood floor, opening (0:00).** Its cocoon hangs beside hers, already open. It is on the branch when she hatches,
   one wing torn, watching the swarm leave without it.
2. **Wood floor, the oak (~0:10 and ~0:32): the want.** At the hub it sits under the hollow oak's trunk, looking up
   at a climb it can't make, while every freed moth spirals up the trunk and out. When she has climbed the trunk
   with her new claws, she cuts the hanging root at the crown. It falls down the trunk, and Tatter climbs up and
   sits beside her as the cloud of her freed moths lifts off. Both beats are on the critical path (the director's
   area 1 redesign, `regions/wood-area1-director.md`). From then on it is ahead of her at the next patch.
3. **Moon patches, throughout.** Every few patches it is already there, resting. When she rests, it shuffles a little
   closer. The player never has to do anything with it.
4. **The roost (2:10).** It is caught at a lamp: Tatter's lamp, in a room off the critical path but impossible to
   miss, with Tatter in the swarm. Snuffing it frees a moth the player knows. Same verb, more weight. Because she
   once opened its way, this reads as the second time she has helped it, not the first.
5. **The cliffs (6:55).** The cold. A moon patch where it should be is empty. Then the next one too. Absence, no
   body.
6. **Home (9:45).** It is in the cave when she arrives. It walked. It settles beside her on the ceiling.

Fallback if Tatter doesn't read (moths look the same, players miss it): drop beats 4–5 and keep it as a figure at
the opening, the want and the ending, or drop it entirely. If it goes, the crown root is cut for nothing and can be
removed; nothing else depends on it.

**The firefly's arc**, the spine of the story, with its reason held back until the marsh:

| Region (area, clock) | What the player sees | What they think |
|---|---|---|
| Wood (the hollow oak, ~0:10 → ~0:30) | From the hub floor, a warm light hangs a glow-cap **inside the oak's trunk**, two thirds up, and darts out through the crown. Picked glow-cap stumps at the trunk's foot. The glow-cap burns overhead all through the floor, and in the trunk climb it is the last lamp that throws her; she snuffs it | "Someone is putting these up", then "I put it out" |
| Wood, boss (the grove, 1:02) | She snuffs the great lamp; a small light darts out of the dark, and behind her one lamp *relights*. It flees | An enemy. It undoes my work |
| Valley (the rim and the roost) | Flicker lamps blink in its rhythm (three short, one long). It is seen hanging new lights, fleeing when she nears. Firefly signs start to add up | It is building this on purpose |
| Valley (the roost's crown, ~2:35) | On a high branch above the dead roost tree it flashes its rhythm at the empty sky, slow and long. Nothing answers | The first crack: what is it doing? |
| Valley into marsh (3:25) | The chase (set piece 4): it relights lamps ahead of her, then escapes into the marsh fog | It is running from me, and it is fast |
| Marsh (the fen, 4:50) | **The reason.** The empty meadow (set piece 5): it flashes over a meadow of dark firefly husks, and a lamp built in the shape of a firefly hangs over them | It is the last one. It is calling for someone |
| Pass (the beacon, 7:45) | The beacon, the biggest light it ever made, with it at the top flashing at the stars | It is desperate, and it will fight for this |
| Cave (home, 9:35) | Its collection; the fight; the dark; the answer (§2) | Mercy |

The order of the crown flash and the chase changed with the rescope: the crack comes before the chase, so the
player chases something they have started to wonder about.

## 2. The opening and the ending

### The opening: the first ten minutes

Baseline from story.md, plus the **upgrade** (last to hatch, chase the swarm). Times are targets; the wood's beat
sheet (`regions/wood.md` Part A, from the director's area 1 redesign) owns the minutes after 5:00: the area's question
is the hollow oak, and the way out is up its trunk.

| Time | Beat | Player does | Staging and cost |
|---|---|---|---|
| 0:00 | Black. Wind in leaves. Cool moonlight fades up through the canopy (warm only as a faint far afterglow: the two-light rule) | nothing | Audio + post fade. Free |
| 0:04 | A row of empty, split cocoons on a branch over the dark wood. One still closed. Above, the moon. Tatter sits on the branch | nothing | Static props on the existing Grove layers |
| 0:08 | The closed cocoon twitches with each button press. Third press: she breaks out | **first input** (jump ×3, the same input as beating free later) | Cocoon prop + rig spawn pose. Control at 8 s |
| 0:15 | The swarm streams overhead past the moon, a river of small moths leaving | runs along the branch after them | Swarm renderer on a spline. Camera leads toward the swarm |
| 0:20–1:30 | **The chase.** Downhill through the canopy: branch runs, jumps, a fallen trunk, the swarm always just ahead and above. She can't fly yet. No enemies, no hazards | runs, jumps | A hand-built descending room. The swarm spline is keyed to her x, so it never escapes and never waits visibly |
| 1:30 | **The vista.** The canopy opens on a cliff edge. The valley below, dotted with warm lamps. The swarm pours down into them and breaks apart into spinning knots around each light. Below, **the great hollow oak** with a ring of moonlight at its crown, and stragglers peeling down into the wood. The moon over the far mountain. **Title over the moon: LAMPFALL** | stands at the edge (camera holds ~2 s, then she can move) | Camera widen, the swarm splits to N lamp orbits. Far valley is a background layer. The one big vista of the opening |
| 2:00 | Down into the wood after the stragglers. They circle a wick over a dip; it pulls her in, she is **caught**, beats free (three presses, which she knows from the cocoon) and **the throw lands her on the next shelf**. A dead moth lies in the dip | teaches pull, Caught and the throw by consequence | Core lamp module |
| 2:30 | A jump-cut puts the stragglers' wick out: hitstop, the dark blooms, the moths spiral out, fly with her, then peel off toward the oak | **first snuff** | Core |
| 3:00–5:00 | A juvenile beetle (two cuts), then a beetle under a lit wick that notices her only in its light; a throw across a gap; first moon patch (Tatter already resting there); a bark floor she cuts through, bouncing, down to the glade | fights, rests, pogos | Creatures doc |
| 5:00 | **First glade.** A shaft of real moonlight at the bottom of a hollow. She basks; her wings open and dry. *Item line* + glide glyph | gets glide | The one glade presentation |
| 5:30–10:00 | The glide room: the drop out of the hollow is too long without it. A pull field to glide across on a line, then a ladder of gaps. Joy before difficulty | glides | Level layout |
| 10:30 | **The hub, the hollow oak: the question.** Looking up the trunk: the crown ring of moonlight, every freed moth spiralling out, and the **first glimpse of the firefly** hanging a glow-cap inside the trunk, then gone. Tatter under the trunk, looking up at a climb it can't make. Her kicks slide on its walls | sees, tries the walls | One actor on a path, a held beat; Tatter's look-up state |
| 10:30–12:00 | One way on, east across the floor, to find a way up. The glow-cap burns overhead as a lit lock | goes on | |

What it does: control at 8 s, one want (the swarm), one force (the lights), each beat caused by the last (left
behind, so chase; chase, so the vista; the swarm falls into the lights, so the lights are the problem). Emotional
peaks are all things she does: breaking out, running, the first snuff.

**Cost and fallback.** The chase is the expensive part: a dedicated room plus the swarm spline. The vista is a
background layer and a camera move. *Fallback* (only if the chase fails a real attempt): the story.md baseline, she
hatches on the branch with the valley vista already in front of her, the swarm already circling the lamps, title over
the moon, and the chase room becomes a normal descent.

### The ending

Played, not watched, until the final pull-up.

1. **The cave of lights** (its heart: area 14, home, after the Bat-eater). The firefly's collection blazes across the cave. She puts out its lights one by one while
   it fights to keep them (the boss, `creatures.md`). Each light out, the cave gets darker and the firefly's flashes
   get faster and smaller.
2. **The last light.** The final flame goes out. 2 s of near black and near silence. The only light left is the
   firefly itself, on the floor, dim, pulsing slowly. It is not a target: her blade passes over it (the `blocks`
   hook, no damage). The player can try; nothing happens. That is the mercy, delivered by a rule, not a scene.
3. **The moths come home.** Out of the dark, every moth she freed streams in through the cave mouth and settles on
   the ceiling. The density is the freed-moth count. Tatter is already there.
4. **The answer.** The firefly crawls toward the cave mouth. She can follow (the camera leans that way). At the mouth:
   the whole journey below in moonlight, every region dark and full of stars (each region's sky uniform at its
   final value). Any lamp she missed still burns as a tiny dot down there, which is the completion screen without
   a UI. The firefly flashes its rhythm. A pause. Far off, one flash answers. The firefly lifts and flies toward it.
5. **Home.** She turns back into the cave. A space on the ceiling beside Tatter. The last input is **Shroud**:
   she folds her wings in the dark. The pillar "dark is safe" becomes the last button the player presses.
6. **Pull-up.** The camera rises slowly across the sleeping ceiling (the one long non-interactive shot, ~20 s). The
   title, then credits over the sleeping moths.

Cost: steps 2–5 are rules and render state on the boss arena (no new tech beyond the boss). Step 4's vista is the
expensive frame: a composite of every region's far layer. *Fallback:* the vista becomes a single moonlit night
sky over a dark valley with the stars of the cleared regions, and the answer flash lands the same.

## 3. Set pieces (rescoped 2026-10-18)

Draft 1 had seven, one per region plus the ends. At ~9.75 h the bar asks for a peak every 30–60 minutes and at
least two escapes (G4), so there are now **eleven set pieces and three staged encounters**, never more than one set
piece per area, with bosses and mini-bosses (`creatures.md` §3) between them. Numbers 1–7 keep their draft 1
numbers, because the other docs cite them; 8–11 are new. `world.md` §2.3 counts ten set pieces because it counts
the Beacon (6) as a major boss. Everything else in the game is rooms.

| # | Set piece | Area, clock | What makes it land | Cost |
|---|---|---|---|---|
| 1 | **Last to hatch** (§2) | wood floor, 0:01 | Being left behind is felt by running, not shown. The swarm falling into the valley lamps is the premise in one image | Medium: one room, a spline, a vista layer |
| 2 | **The grove of lamps** (first boss) and the Kuro beat | high wood, 1:00–1:02 | A ring of lamps pulling from every side while predators hunt; she snuffs them inward. When the great lamp dies: first sky clear (stars come out), a burst of moths, then a small light darts past and relights one lamp behind her | Medium: lamp params + a boss script + one scripted relight |
| 8 | **The roost climb** (new) | the roost, 2:30 | The dead roost tree, climbed from root to crown in one tall room: seed wheels spun by Gust, fling chains up its limbs, emperor hawkers, the whole bowl dropping away below. At the crown, the double-jump glade and the firefly flashing at the empty sky | Medium: one tall room and the camera; no new tech |
| 3 | **The river of moths** | bright floor, 3:20, after the Mantis | The valley's great lamp goes out and every moth still circling in the region rises together into one river toward the mountain. Camera lifts to the biggest vista so far. Music's first full swell | Low: swarm renderer + camera + one vista layer. The best cost-to-feeling ratio in the game |
| 4 | **The chase** (escape 1) | bright floor into the reedbeds, 3:25–3:30 | Ori's escapes, reversed: she chases the firefly down a corridor of lamps as it relights them ahead of her, and the only way to keep up is to fling through them and dash out of Caught (dash is ten minutes old). It reaches the marsh fog and is gone | Medium-high: a scripted firefly path keyed to her position, relights triggered by x. *Fallback:* shorten to one screen |
| 5 | **The empty meadow** | the fen, 4:50 | Silence after the marsh's noise, at the game's midpoint. She is shrouded (just got it), so predators and the firefly don't see her. The firefly flashes its call over a meadow of dark husks; a lamp built in the shape of a firefly hangs above them; nothing answers. She can watch or leave. No fight | Low: a quiet room, the firefly on a loop, a static prop. Lands only if it follows something loud |
| 9 | **The drowned roots** (new; escape 2) | the bridge into the wood, 5:35 | The bridge falls with the Colony and black water rises through the roots behind her. Soar, found at the bottom, carries her up the updraft shafts ahead of the water, and she breaks out through the seeping root wall in the roots under the wood's hollow oak, then up through the root mesh into the hub: the stub seen from the root stair since minute 20, and home, changed | Medium-high: a rising-hazard cue timeline (the boss framework's), three or four shafts. *Fallback:* the water rises only in the last shaft |
| 10 | **The storm crossing** (new) | the scree, 6:22 | An open saddle in a storm: gusts on a beat (a flameless pull row with a period) throw her off the slope unless she shelters behind cairns, and with Soar she rides a gust up to the next one. The cave draft starts here | Low-medium: wind rows, the camera, sound |
| 6 | **The beacon** | the beacon, 7:45 (the Beacon boss) | A lamp the size of a tree on an open cliff. She climbs it with Moonflight, which drains in its light, so the climb is a dash from shadow to shadow. Snuffed from the top: the whole pass goes dark, and the cave mouth appears above under the moon | High: a tall arena, Moonflight tuning. The one place the mountain is fully in frame |
| 11 | **The wall-less climb** (new) | the cave mouth, 8:00 | Straight up a sheer face with nothing to hold, above the dark beacon, toward the cave mouth under the moon: Moonflight alone, refilled in the dark between the last few lamps. The last time the open sky is seen until the ending | Medium: one tall room, dark refill pockets (`world.md` §3 rule 5) |
| 7 | **The cave of lights and home** (§2) | the cave of lights and home, 9:05–9:45 | The brightest place in the world goes dark at her hands, and the dark becomes home | High (final boss) + low (the ending rules) |

**Staged encounters** (rooms with one scripted cue, cheaper than a set piece): **the web gauntlet** (high wood,
0:48: the orb web, a bombardier behind it and a dangler, Nine Sols' gauntlet before the boss), **Tatter's lamp**
(the roost, 2:10, §1) and **the roost waking** (the cave mouth, 8:35: the cave bats wake in groups as she passes
under them, and Shroud is the way through).

**Escapes and chases:** the firefly chase (4) and the drowned roots (9) are the two the bar asks for, roughly at
the game's third and its middle; the opening chase (1) and the storm crossing (10) are smaller ones.

Deliberately **not** set pieces: the bat colony and the mantis are bosses (creatures doc), not staged moments.
Region and area entrances get a vista, not a scene.

## 4. Pacing curve (rescoped 2026-10-18)

| Region | Areas | Intensity | Rests and quiet | Vistas | Music | First-run time |
|---|---|---|---|---|---|---|
| **Wood** | the floor, the high wood | low → medium. The floor peaks at the old burrback and ends on the climb up the oak; the high wood on the grove of lamps | Moon patches, dark tunnels between lit rooms, the hub, the glades | The opening cliff (valley + mountain, and the hollow oak below); the oak's crown, looking back to the hatching tree; the canopy edge (Gust's glade, the first open moonlight) | Sparse; first swell at the title, second at the first sky clear | **70 min** (0:00–1:10) |
| **Valley of lamps** | the rim, the roost, the bright floor | medium → high. Dense lit rooms, predators everywhere | Dark river caves under the lamps; Tatter's lamp; the roost's crown | The rim on arrival (lamps to the horizon); the roost's crown; **the river of moths** | Rhythmic (the flicker beat); full swell at the river | **135 min** (1:10–3:25) |
| **Marsh** | the reedbeds, the fen, the bridge | medium, then a hard stop, then the escape. Drifters, fog, glass | **The empty meadow**, the quietest moment in the game | Few: fog. The mountain is not seen here at all, on purpose | Low drones; silence at the meadow; the escape's rising pulse | **135 min** (3:25–5:40) |
| **Return** | the wood's hub, the valley to its east rim | low: a home visit, every new move paying | the wood's dark sky full of stars; Tatter's root ladder | the wood and the valley seen changed | the wood's bed, quieter | **15 min** (5:40–5:55) |
| **The pass** | the scree, the cliffs, the beacon | high. Cold, wind, birds, the beacon | Few patches, wide apart; Tatter's empty patches | The storm's saddle; the beacon arena (the mountain full in frame) | Building throughout; peak at the beacon | **120 min** (5:55–7:55) |
| **The cave** | the mouth, the cave of lights, home | highest, then nothing | The ending | The wall-less climb's last sky; the cave mouth, looking back over the whole journey | Peak in the fight, then silence, then one quiet theme | **110 min** (7:55–9:45) |

About **9.75 hours** for a first run (Ori's ~9–11, G1), **~12.5** for full moths and finds. Tier 1 (wood + valley)
is **~3.5 hours** (`world.md` §4: ~3:25 main, ~4:15 for 100%).

**Beats by area**, with the first-timer's clock (the order of feelings; `world.md` §2.2 owns the areas and
`creatures.md` §3 the bosses):

| # | Area | Clock | Feeling | Story beats while in control (C11) | Peaks |
|---|---|---|---|---|---|
| 1 | wood floor | 0:00–0:35 | left behind; the first lights; "my wings are getting stronger" | the hatch and Tatter; the vista and the title; the glimpse; Tatter's want and the root ladder | the chase and vista 0:01; the old burrback 0:25 |
| 2 | high wood | 0:35–1:10 | the wood tested whole; the first boss; leaving | the knot (Tatter ahead); the relight; Gust's glade in the open moonlight | the web gauntlet 0:48; the Weaver and the relight 1:00 |
| 3 | rim | 1:10–1:55 | arrival: the bowl seen whole; traps become launchers | the arrival vista 1:12; lamps built of collected things; firefly signs | the Emperor 1:52 |
| 4 | roost | 1:55–2:45 | choice; the crossroads; a moth she knows | Tatter's lamp 2:10; the crown flash ~2:35 | the roost climb 2:30 |
| 5 | bright floor | 2:45–3:25 | the valley's climax; her kind set on the road | the river 3:20; the chase begins 3:25 | the Mantis 3:08; the river; the chase |
| 6 | reedbeds | 3:25–4:10 | low, wet, lost in fog; learning to fall | the firefly gone into the fog 3:30; moths stuck in black water | the Great Toad 4:05 |
| 7 | fen | 4:10–4:55 | the drowned wood; going dark; the reason | **the empty meadow** 4:50 | the meadow |
| 8 | bridge | 4:55–5:40 | the marsh's climax; the way home | the bridge falls; the roots surface in the wood's hub | the Colony 5:22; the drowned roots 5:35 |
| — | return | 5:40–5:55 | home, changed: the world answers what she did (G9) | the wood's sky clear and its lamps dark; the root ladder still hanging where she cut it | (a rest) |
| 9 | scree | 5:55–6:35 | cold, wind, the open moon | a trail of dropped glowing things up the slope; the cave draft starts | the storm crossing 6:22 |
| 10 | cliffs | 6:35–7:15 | verticality; absence | Tatter's empty patches 6:55 | the Nightjar 7:08 |
| 11 | beacon | 7:15–7:55 | the climb to the biggest light; desperation | the firefly at the top, flashing at the stars | the Beacon 7:45 |
| 12 | cave mouth | 7:55–8:40 | the last moonlight; the dark galleries | the old pale stains of sleeping moths on the ceiling | the wall-less climb 8:00; the roost wakes 8:35 |
| 13 | cave of lights | 8:40–9:15 | everything at once | the collection arranged like a nest | the Bat-eater 9:05 |
| 14 | home | 9:15–9:45 | mercy; home | the last light; the answer; Tatter on the ceiling | the firefly 9:35; home 9:45 |

Shape: each **area** rises to a peak (a boss, a mini-boss or a set piece, about one every 30 minutes) and then
drops into a dark, quiet stretch; each **region** rises to its boss and set piece and then drops further (the
corridor between regions is always a dark, safe, predator-free walk with the freed moths overhead). The marsh is the
trough of the whole game, so the meadow's reveal has room at the midpoint, and the drowned roots climb straight out
of it into the one home visit. After the return, the pass and cave climb without a break to the end.

## 5. Wayfinding without the mountain

The mountain is a reward at a few vistas per region (`world.md` §6), never a constant. Seven cheaper signals keep
the goal felt (the seventh added 2026-10-18):

1. **The migration line** (core.md): freed moths follow her for about 6 s, then peel off toward the way on. The
   player's own rescue points the way. Underground, they head for the exit.
2. **The lamps are the road.** The firefly hung its lights along the moths' road, so the lit rooms *are* the route.
   Going toward unsnuffed lights is going forward. This is free, and it is ironic in a way players notice.
3. **The moon.** The sky layer places the moon on the mountain's side of every outdoor room (left or right, high or
   low by region). Players learn "the moon is that way" without being told. One number per room in scene data.
4. **Tatter at the next moon patch.** Once she has opened its way in the wood, it is always ahead, so finding it
   means you went the right way. It stops in the cliffs, which is where the cave draft takes over.
5. **The cave draft.** From the pass on, cold air flows toward the cave: snow and spores drift the way on, and the
   wind audio (which already exists) pans that way. A particle direction and a pan, nothing more.
6. **The map's lit dots** (core.md): every lamp still burning is a dot. The to-do list and the direction in one.
7. **Moth-stones** (core.md §6): one near each area's hub draws the whole area on the map. With an area hub every
   30–50 minutes, the player is never more than one area away from knowing its shape. From Tier 2, the hubs' moon
   patches are also the fast-travel points.

Plus **the sky as progress**: a region's stars come out as its lamps go out, so the player always knows how much of
the region is done by looking up.

## 6. Wordless storytelling toolkit

Details that tell what happened. All are static props or render state; none need acting. **Rescoped 2026-10-18:**
two of core.md §6's finds are this toolkit made collectable. **Firefly signs** (one or two an area) are things it
hung and left; each plays its flash rhythm once when she stands still beside it, and they grow lonelier along the
road, so a player who looks has half-guessed the meadow before reaching it. **Moth-stones** (one an area) are carved
with moments of older migrations, so the stones in order are the moths' history.

- **Everywhere:** dead moths under every lit lamp (a few, not a carpet; the stakes stay real without becoming
  grim). Spider webs near lamps heavy with moth wings. Pale wing dust on the ground in a ring under each flame.
- **Wood:** the row of empty cocoons. Glow-cap stumps with the caps freshly gone (it is harvesting light). A thread
  of glow-worm silk strung across a gap, leading toward the valley. Predator nests built right under the first lamps.
  The hanging root she cut for Tatter, still lying as a ladder when the drowned roots bring her home.
- **Valley:** the lamps are made of collected things: foxfire wood stacked into a pillar, glow-worms hung in silk
  like a chandelier, phosphorescent fungus arranged in rings. Some are carefully arranged, almost pretty. The mantis's
  perch over the brightest lamp is littered with wings. Flicker lamps blink the firefly's rhythm.
- **Marsh:** the old firefly meadow. Reeds full of tiny dark husks. The firefly-shaped lamp. Moths stuck in the black
  water around drifter lights. A small pile of glowing things left half-hung, as if it was interrupted. In the
  drowned roots, the wood's own roots: the player realises the marsh lies under the wood's edge.
- **Pass:** a trail of dropped glowing things up the slope (it carried the beacon's parts here alone). Frozen moths
  that flew too high, off course. The beacon itself is built of everything from every earlier region: the player
  recognises the valley's foxfire and the marsh's gas-lights in it.
- **Cave:** the collection arranged like a nest, with the firefly's resting place in the middle of it. On the
  ceiling, old pale stains in the shape of generations of sleeping moths: the empty outline the ending fills.

## 7. Tier 1: the wood and the valley as a standalone chapter (rescoped 2026-10-18)

Tier 1 has to be a whole story with an ending, not the first third of one. Its arc: **left behind → catches up →
sets her kind on the road again**. Rescoped from 1.5–2 h to **~3.5 h** (five areas, `world.md` §4), with the same
arc and the same ending image.

- **Beginning (the wood floor, 0:00–0:35):** last to hatch; the swarm falls into the valley lamps (set piece 1);
  glide; Tatter's want and the root ladder; the old burrback; wall jump.
- **Middle (the high wood to the roost, 0:35–2:45):** the web gauntlet, the grove of lamps and the Kuro relight (set
  piece 2), Gust at the canopy edge; the valley seen whole from the rim, fling, the Emperor; the roost, Tatter's
  lamp, the roost climb (set piece 8) to double jump and the firefly's flash at the empty sky.
- **Climax (the bright floor, 2:45–3:25):** the mantis under the brightest lamp; dash.
- **Ending beat (3:20–3:30):** the river of moths (set piece 3) rises toward the mountain. Then the firefly is seen
  relighting lamps down the valley's south ledge, and the chase (set piece 4, the short version) runs to the edge of
  the marsh fog, where it escapes. At that edge, a last moon patch on a ridge, with Tatter already there. She looks
  back east across the dark bowl, and far off on the pass a huge light kindles: the beacon. The river flows around
  it in the distance. Title card. The "why" is open (the flash at the empty sky is the only hint), the "what next"
  is obvious. In the full game this is the same beat, and play goes on into the fog.

It works standalone because the want set in the first minute (catch the swarm, free them) is paid off in full by the
river, and the beacon is a hook rather than a cliffhanger: the chapter's problem is solved, and a bigger one is shown.
Scope: four set pieces at full cost (1, 2, 8, 3) and one short (4), two staged encounters (the web gauntlet,
Tatter's lamp), two bosses and two minis, abilities 0–6, about 105 lamps (~900 moths, so the first three health
milestones can fall in Tier 1).

## 8. Easy-path choices

| Chose | Over | Why the effect is the same |
|---|---|---|
| Story moments as places she flies into, with control | Cutscenes | Players feel what they do more than what they watch; no directing skill needed |
| The firefly acts through light (pulse rhythm, brightness, speed) | A puppet with expressions | Light reads at any size; a 10 px insect can't emote, but a slow pulse in the dark reads as lonely |
| Tatter is Wing's rig re-paletted, appearing at rest points | A second character with its own rig and AI | The companion is felt through presence and absence, which costs a spawn per patch |
| The mercy is a rule (the blade passes over it) | A choice prompt or a staged spare | The player discovers the mercy by trying; nothing to read |
| The completion screen is the cave-mouth vista with missed lamps still lit | A stats screen | Wordless, and it makes 100% visible and wanted |
| Eleven set pieces, at most one per area, and three staged encounters (rescoped 2026-10-18; draft 1 had seven) | Many smaller scripted moments | Each still lands for being rare (one every ~50 minutes, with bosses between); the rest of the budget goes to rooms and bosses |
| The river of moths as the valley climax | A bespoke cinematic of the migration | It is the swarm renderer and a camera lift, and it is the image of the whole game |
| Wayfinding by moths, the moon's side and wind | The mountain always in view | Same "I know which way" feeling for a scene-data number per room |
| The meadow reveal by environment, seen while shrouded | Any exposition | The why arrives as an image the player assembles; Shroud justifies watching unseen |
| Region entrances are vistas | Region intro scenes | A camera hold on a new layer does the "new place" job |

## 9. Open questions for Matt

1. **A companion (Tatter, the torn-winged moth who walks the road).** *Recommend:* yes, as presence only: no
   lines, appears at moon patches, one lamp rescue, an absence in the pass, there at the end. It adds the "people"
   side the story lacks between the swarm and the firefly. Cheap fallback: drop it with no knock-on cost. One thing to
   settle with the creatures doc: Wing is a moth-person at ~84 px while the swarm is small moths, so Tatter must be
   drawn as clearly one of her kind; reusing her rig does that, but the swarm then needs to read as "far" or
   "young".
2. **Title placement.** *Recommend:* the title appears at the opening vista, as the swarm falls into the lamps
   (literally lamp-fall), not at first control. Control still comes at 8 s.
3. **The mercy as a rule** (the blade passes over the firefly after the last light). *Recommend:* yes; no prompt,
   no choice. The alternative, letting the player kill it, splits the ending and the story.md ending loses its
   answer flash.
4. **The firefly relights a lamp only twice** (the wood boss and during the chase). *Recommend:* yes, consistent
   with core.md's "scripted beats only". (The chase relights a corridor of lamps, as one beat.)
5. **The last input is Shroud** (fold wings to sleep). *Recommend:* yes. It ties the ending to the pillar and gives
   the player the last act.
6. **Tier 1's ending: the beacon kindling far off.** *Recommend:* yes, as the chapter's hook. It means the pass's
   far layer must exist (as a background silhouette) in Tier 1.
7. **Try-before-cut list for this doc:** the opening chase, the firefly chase, and the firefly's light language. Each
   gets a real attempt built at the bar; fallbacks are listed above, and Matt judges from play.
8. **Rescope, 2026-10-18.** Tatter's want in the wood (README rescope call 13), the four new set pieces (8–11, call
   10) and the crown flash moving before the chase are assumed until Matt vetoes them. The story itself is unchanged.
