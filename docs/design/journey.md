# Lampfall: the journey

Draft 1, 2026-10-17. The story as the player lives it: beats per region, the opening and the ending as stageable
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
| **Tatter** (working name, never on screen) | A companion. The other late hatchling: a moth with one torn wing who can't fly the road, so it walks it | Where it is: resting at moon patches ahead of her, sitting when she sits. Two short interactions (below) | Wing's rig re-paletted, one wing cut short, three states (rest, walk, look up). No new rig |

**Recommend Tatter** (open question 1). The firefly alone gives us an antagonist relationship but no warmth, and the
swarm is a crowd, not a person. Tatter is the Quirrel slot done the cheap way: no lines, it is simply there at the
rest points, which also makes it a breadcrumb (§5). Its arc in five beats:
1. **Wood, opening.** Its cocoon hangs beside hers, already open. It is on the branch when she hatches, one wing
   torn, watching the swarm leave without it.
2. **Moon patches, throughout.** Every few patches it is already there, resting. When she rests, it shuffles a little
   closer. The player never has to do anything with it.
3. **Valley.** It is caught at a lamp: one lamp, in a room off the critical path but impossible to miss, with Tatter
   in the swarm. Snuffing it frees a moth the player knows. Same verb, more weight.
4. **The pass.** The cold. A moon patch where it should be is empty. Then the next one too. Absence, no body.
5. **The ending.** It is in the cave when she arrives. It walked. It settles beside her on the ceiling.

Fallback if Tatter doesn't read (moths look the same, players miss it): drop beats 3–4 and keep it as a figure at
the opening and the ending, or drop it entirely; nothing else depends on it.

**The firefly's arc**, the spine of the story, with its reason held back until the marsh:

| Region | What the player sees | What they think |
|---|---|---|
| Wood | A warm light far across a canopy gap, hanging a glow-cap on a branch, then gone. Later, picked glow-cap stumps | "Someone is putting these up" |
| Wood, boss | She snuffs the great lamp; a small light darts out of the dark, and behind her one lamp *relights*. It flees | An enemy. It undoes my work |
| Valley | Flicker lamps blink in its rhythm (three short, one long). It is seen hanging new lights, fleeing when she nears. The valley chase (set piece 4) | It is building this on purpose |
| Valley end | On a high branch it flashes its rhythm at the empty sky, slow and long. Nothing answers | The first crack: what is it doing? |
| Marsh | **The reason.** The empty meadow (set piece 5): it flashes over a meadow of dark firefly husks, and a lamp built in the shape of a firefly hangs over them | It is the last one. It is calling for someone |
| Pass | The beacon, the biggest light it ever made, with it at the top flashing at the stars | It is desperate, and it will fight for this |
| Cave | Its collection; the fight; the dark; the answer (§2) | Mercy |

## 2. The opening and the ending

### The opening: the first ten minutes

Baseline from story.md, plus the **upgrade** (last to hatch, chase the swarm). Times are targets.

| Time | Beat | Player does | Staging and cost |
|---|---|---|---|
| 0:00 | Black. Wind in leaves. Cool moonlight fades up through the canopy (warm only as a faint far afterglow: the two-light rule) | nothing | Audio + post fade. Free |
| 0:04 | A row of empty, split cocoons on a branch over the dark wood. One still closed. Above, the moon. Tatter sits on the branch | nothing | Static props on the existing Grove layers |
| 0:08 | The closed cocoon twitches with each button press. Third press: she breaks out | **first input** (jump ×3, the same input as beating free later) | Cocoon prop + rig spawn pose. Control at 8 s |
| 0:15 | The swarm streams overhead past the moon, a river of small moths leaving | runs along the branch after them | Swarm renderer on a spline. Camera leads toward the swarm |
| 0:20–1:30 | **The chase.** Downhill through the canopy: branch runs, jumps, a pogo off a thorn, the swarm always just ahead and above. She can't fly yet. No enemies | runs, jumps, pogo | A hand-built descending room. The swarm spline is keyed to her x, so it never escapes and never waits visibly |
| 1:30 | **The vista.** The canopy opens on a cliff edge. The valley below, dotted with warm lamps. The swarm pours down into them and breaks apart into spinning knots around each light. The moon over the far mountain. **Title over the moon: LAMPFALL** | stands at the edge (camera holds ~2 s, then she can move) | Camera widen, the swarm splits to N lamp orbits. Far valley is a background layer. The one big vista of the opening |
| 2:00 | Back down into the wood. A wick over a short gap pulls her in. She is **caught**, orbiting, and beats free (three presses, which she already knows from the cocoon). A dead moth lies under it | teaches pull and Caught by consequence | Core lamp module |
| 2:30 | The next wick, reachable from a ledge. A slash snuffs it: hitstop, the dark blooms, six moths spiral out, fly with her, then peel off downhill | **first snuff** | Core |
| 3:00–5:00 | First predator (a spider at a lit lamp), first moon patch (Tatter already resting there), two more wicks | fights, rests | Creatures doc |
| 5:00 | **First glade.** A shaft of real moonlight at the bottom of a hollow. She basks; her wings open and dry. *Item line* + glide glyph | gets glide | The one glade presentation |
| 5:30–8:00 | The glide room: the drop out of the hollow is too long without it. A pull field to glide across on a line. Joy before difficulty | glides | Level layout |
| 8:00 | **First glimpse of the firefly** across a canopy gap: a warm light hanging a glow-cap, then gone | sees | One actor on a path, 4 s |
| 8:00–10:00 | The wood opens up: a lit marker on the map for a lamp she can't reach yet. Free exploration starts | explores | |

What it does: control at 8 s, one want (the swarm), one force (the lights), each beat caused by the last (left
behind, so chase; chase, so the vista; the swarm falls into the lights, so the lights are the problem). Emotional
peaks are all things she does: breaking out, running, the first snuff.

**Cost and fallback.** The chase is the expensive part: a dedicated room plus the swarm spline. The vista is a
background layer and a camera move. *Fallback* (only if the chase fails a real attempt): the story.md baseline, she
hatches on the branch with the valley vista already in front of her, the swarm already circling the lamps, title over
the moon, and the chase room becomes a normal descent.

### The ending

Played, not watched, until the final pull-up.

1. **The cave of lights.** The firefly's collection blazes across the cave. She puts out its lights one by one while
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

## 3. Set pieces

Seven, spread so each region has one peak and the gaps between them breathe. Everything else in the game is rooms.

| # | Set piece | Region | What makes it land | Cost |
|---|---|---|---|---|
| 1 | **Last to hatch** (§2) | wood | Being left behind is felt by running, not shown. The swarm falling into the valley lamps is the premise in one image | Medium: one room, a spline, a vista layer |
| 2 | **The grove of lamps** (first boss) and the Kuro beat | wood | A ring of lamps pulling from every side while predators hunt; she snuffs them inward. When the great lamp dies: first sky clear (stars come out), a burst of moths, then a small light darts past and relights one lamp behind her | Medium: lamp params + a boss script + one scripted relight |
| 3 | **The river of moths** | valley, after the mantis | The valley's great lamp goes out and every moth still circling in the region rises together into one river toward the mountain. Camera lifts to the biggest vista so far. Music's first full swell | Low: swarm renderer + camera + one vista layer. The best cost-to-feeling ratio in the game |
| 4 | **The chase** | valley into marsh | Ori's escapes, reversed: she chases the firefly down a corridor of lamps as it relights them ahead of her, and the only way to keep up is to fling through them. It reaches the marsh and is gone | Medium-high: a scripted firefly path keyed to her position, relights triggered by x. *Fallback:* shorten to one screen |
| 5 | **The empty meadow** | marsh | Silence after the marsh's noise. She is shrouded (just got it), so predators and the firefly don't see her. The firefly flashes its call over a meadow of dark husks; a lamp built in the shape of a firefly hangs above them; nothing answers. She can watch or leave. No fight | Low: a quiet room, the firefly on a loop, a static prop. Lands only if it follows something loud |
| 6 | **The beacon** | pass | A lamp the size of a tree on an open cliff. She climbs it with Moonflight, which drains in its light, so the climb is a dash from shadow to shadow. Snuffed from the top: the whole pass goes dark, and the cave mouth appears above under the moon | High: a tall arena, Moonflight tuning. The one place the mountain is fully in frame |
| 7 | **The cave of lights and home** (§2) | cave | The brightest place in the world goes dark at her hands, and the dark becomes home | High (final boss) + low (the ending rules) |

Deliberately **not** set pieces: the bat colony and the mantis are bosses (creatures doc), not staged moments.
Region entrances get a vista, not a scene.

## 4. Pacing curve

| Region | Intensity | Rests and quiet | Vistas | Music | First-run time |
|---|---|---|---|---|---|
| **Wood** | low → medium. Ends on the grove of lamps | Moon patches, dark tunnels between lit rooms, the glade | The opening cliff (valley + mountain); one canopy gap | Sparse; first swell at the title, second at the first sky clear | 45–60 min |
| **Valley of lamps** | medium → high. Dense lit rooms, predators everywhere | Dark river caves under the lamps; Tatter's lamp | Entering (lamps to the horizon); **the river of moths** | Rhythmic (the flicker beat); full swell at the river | 60–75 min |
| **Marsh** | medium, then a hard stop. Drifters, fog, glass | **The empty meadow**, the quietest moment in the game | Few: fog. The mountain is not seen here at all, on purpose | Low drones; silence at the meadow | 60–75 min |
| **The pass** | high. Cold, wind, bats, the beacon | Few patches, wide apart; Tatter's empty patch | The beacon arena (the mountain full in frame) | Building throughout; peak at the beacon | 45–60 min |
| **The cave** | highest, then nothing | The ending | The cave mouth, looking back over the whole journey | Peak in the fight, then silence, then one quiet theme | 25–35 min |

About **4–5 hours** for a first run, **6–8** for full moths. Tier 1 (wood + valley) is **1.5–2 hours**, matching
core.md.

Shape: each region rises to its boss and set piece, then drops into a dark, quiet stretch before the next one starts
(the corridor between regions is always a dark, safe, predator-free walk with the freed moths overhead). The marsh is
the trough of the whole game, so the meadow's reveal has room, and the pass and cave climb without a break to the end.

## 5. Wayfinding without the mountain

The mountain is a reward at four or five vistas, never a constant. Six cheaper signals keep the goal felt:

1. **The migration line** (core.md): freed moths follow her for about 6 s, then peel off toward the way on. The
   player's own rescue points the way. Underground, they head for the exit.
2. **The lamps are the road.** The firefly hung its lights along the moths' road, so the lit rooms *are* the route.
   Going toward unsnuffed lights is going forward. This is free, and it is ironic in a way players notice.
3. **The moon.** The sky layer places the moon on the mountain's side of every outdoor room (left or right, high or
   low by region). Players learn "the moon is that way" without being told. One number per room in scene data.
4. **Tatter at the next moon patch.** It is always ahead, so finding it means you went the right way. It stops in
   the pass, which is where the cave draft takes over.
5. **The cave draft.** From the pass on, cold air flows toward the cave: snow and spores drift the way on, and the
   wind audio (which already exists) pans that way. A particle direction and a pan, nothing more.
6. **The map's lit dots** (core.md): every lamp still burning is a dot. The to-do list and the direction in one.

Plus **the sky as progress**: a region's stars come out as its lamps go out, so the player always knows how much of
the region is done by looking up.

## 6. Wordless storytelling toolkit

Details that tell what happened. All are static props or render state; none need acting.

- **Everywhere:** dead moths under every lit lamp (a few, not a carpet; the stakes stay real without becoming
  grim). Spider webs near lamps heavy with moth wings. Pale wing dust on the ground in a ring under each flame.
- **Wood:** the row of empty cocoons. Glow-cap stumps with the caps freshly gone (it is harvesting light). A thread
  of glow-worm silk strung across a gap, leading toward the valley. Predator nests built right under the first lamps.
- **Valley:** the lamps are made of collected things: foxfire wood stacked into a pillar, glow-worms hung in silk
  like a chandelier, phosphorescent fungus arranged in rings. Some are carefully arranged, almost pretty. The mantis's
  perch over the brightest lamp is littered with wings. Flicker lamps blink the firefly's rhythm.
- **Marsh:** the old firefly meadow. Reeds full of tiny dark husks. The firefly-shaped lamp. Moths stuck in the black
  water around drifter lights. A small pile of glowing things left half-hung, as if it was interrupted.
- **Pass:** a trail of dropped glowing things up the slope (it carried the beacon's parts here alone). Frozen moths
  that flew too high, off course. The beacon itself is built of everything from every earlier region: the player
  recognises the valley's foxfire and the marsh's gas-lights in it.
- **Cave:** the collection arranged like a nest, with the firefly's resting place in the middle of it. On the
  ceiling, old pale stains in the shape of generations of sleeping moths: the empty outline the ending fills.

## 7. Tier 1: the wood and the valley as a standalone chapter

Tier 1 has to be a whole story with an ending, not the first third of one. Its arc: **left behind → catches up →
sets her kind on the road again**.

- **Beginning:** last to hatch; the swarm falls into the valley lamps (set piece 1).
- **Middle:** glide, wall jump, the grove of lamps and the Kuro relight (set piece 2), the valley, fling, Tatter's lamp,
  the chase as a short version (set piece 4 ends at the valley's edge, the firefly escaping toward the marsh fog).
- **Climax:** the mantis under the brightest lamp; double jump.
- **Ending beat:** the river of moths (set piece 3) rises toward the mountain. She follows it up to a high ridge with
  Tatter beside her at the last moon patch. Far off on the pass, a huge light kindles: the beacon, lit by the
  firefly as they watch. The swarm flows around it in the distance. Title card. The "why" is open (one flash at the
  empty sky earlier is the only hint), the "what next" is obvious.

It works standalone because the want set in the first minute (catch the swarm, free them) is paid off in full by the
river, and the beacon is a hook rather than a cliffhanger: the chapter's problem is solved, and a bigger one is shown.
Scope: two set pieces at full cost (1, 3), one short (4), two bosses, abilities 0–4, about 25 lamps.

## 8. Easy-path choices

| Chose | Over | Why the effect is the same |
|---|---|---|
| Story moments as places she flies into, with control | Cutscenes | Players feel what they do more than what they watch; no directing skill needed |
| The firefly acts through light (pulse rhythm, brightness, speed) | A puppet with expressions | Light reads at any size; a 10 px insect can't emote, but a slow pulse in the dark reads as lonely |
| Tatter is Wing's rig re-paletted, appearing at rest points | A second character with its own rig and AI | The companion is felt through presence and absence, which costs a spawn per patch |
| The mercy is a rule (the blade passes over it) | A choice prompt or a staged spare | The player discovers the mercy by trying; nothing to read |
| The completion screen is the cave-mouth vista with missed lamps still lit | A stats screen | Wordless, and it makes 100% visible and wanted |
| Seven set pieces, one per region plus the ends | Many smaller scripted moments | Each lands harder for being rare; the rest of the budget goes to rooms and bosses |
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
   with core.md's "scripted beats only".
5. **The last input is Shroud** (fold wings to sleep). *Recommend:* yes. It ties the ending to the pillar and gives
   the player the last act.
6. **Tier 1's ending: the beacon kindling far off.** *Recommend:* yes, as the chapter's hook. It means the pass's
   far layer must exist (as a background silhouette) in Tier 1.
7. **Try-before-cut list for this doc:** the opening chase, the firefly chase, and the firefly's light language. Each
   gets a real attempt built at the bar; fallbacks are listed above, and Matt judges from play.
