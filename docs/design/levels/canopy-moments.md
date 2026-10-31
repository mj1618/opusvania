# The Canopy: the moments people will remember (director's plan, 2026-10-31)

Matt's goal for the Canopy (`?world=canopy&fresh`): **"let's make it one people will definitely remember".** On layout
numbers and readability it now stands level with the first areas of Hollow Knight, Silksong, Ori and Nine Sols
(review r10: 7.5/10). It is behind on five things, and Matt agrees:
1. staged, directed moments;
2. art density up close;
3. sound and music;
4. a memorable boss;
5. nobody human has played it.

This doc covers the first four. It sets out seven signature moments (the ones a player tells a friend about), the boss
redesigned, the five biggest close-up art changes and a sound plan for each moment. It ends with the build order for
rounds 12 and 13, in three lanes that never share a file. The fifth gap is not a build: **Matt plays from the hatch
before round 12's review**, recorded. Every moment below should be judged on his run first, and on bots and clips
only after.

Inputs: `memory/story.md`, `memory/canopy.md` (the premise and its staged hooks), `memory/canopy-render.md`
(round 11), `memory/audio.md`, `docs/design/journey.md` (the cast, Tatter, the firefly's arc, the staging rule),
`creatures.md` §3-4, `quality-bar.md` §1, `first-area.md`, reviews r9 and r10, `art-direction.md`,
`audio-direction.md`, and the look renders in `~/code/opusvania-refs/` (internal only).

**What round 11 landed** (a71e1ba and before):
- **The release:** a 14-frame hold, the bars burst, 2x the moths swirl round her and stream to the moon, the count
  ticks with a sound.
- **The hub's cage** sits in the landing's frame, with the kin under it.
- **The firefly:** a 24 px beetle with a lantern abdomen. At the gap it relights the lamp she just flung off. At the
  warning it hangs the cage at the den's mouth. In the den it circles the great cage.
- **The great cage:** 120 moths, guarded by the old burrback. Its release opens the roof onto the clifftop and the
  vista.
- **The den** is drawn in three planes, and the boss is dark and red-eyed with a wake.

That was the hard part: the premise as systems with hooks. This plan turns those hooks into moments, and keeps what
already works:
- the first fling's lesson;
- the Grove's gates shutting on the wave;
- the release's timeline.

---

## 1. What makes the references' first areas memorable

Each reference's first area is remembered for three or four moments, and each moment is one of a few patterns. Each
pattern is built from the area's own kit (a creature, a light, the camera and the floor) and is never a cutscene.

| Pattern | Reference moments | What does the work |
|---|---|---|
| **The reveal** (a place shown before you enter it) | HK: the fall into King's Pass, then Dirtmouth's empty town in the rain, then the Crossroads' first look (the dead town's lamps still lit). Silksong: Bone Bottom's village under its moss houses. Ori: the Spirit Tree over the glades | The camera holds, the sound changes, and you see where you'll go and what is wrong there. You stand still and choose to |
| **The crash** (the floor betrays you) | HK: King's Pass's collapsing floor (safe, once). The False Knight drops from the ceiling, and in its last phase crashes through the floor; you follow it down | A rule you trusted (the floor) breaks, so the place changes under you |
| **The boss with a twist or a story** | HK: the False Knight is a maggot in stolen armour; the Gruz Mother bursts into children at its death. Nine Sols: Yingzhao guards Kuafu, and the person is the payoff. Silksong: the Moss Mother rises out of the moss the area is made of | The boss is the area's premise made big, and something about it turns at the end. You remember the turn, not the hit points |
| **The chase or escape** | Ori: Kuro's shadow over the Glades, Gumo leading you through Moon Grotto, and the archetype, **the Ginso Tree escape** (rising water, its own music, every move you've learned, a short checkpoint on each death, then out into the light and the forest healed) | The game sets the pace, the newest mechanic is the only way to keep it, and it ends somewhere new |
| **The quiet after the loud** | HK: Dirtmouth after King's Pass. Silksong: Bone Bottom after the Moss Mother. Ori: the Spirit Well after a hard room | Silence, a person, a bench. The loud part is only remembered because of the quiet one |
| **The character moment** | HK: Elderbug, the only one left. Ori: Naru feeding Ori, then her death. Nine Sols: Shuanshuan in the village. Silksong: the pilgrims' procession | Someone who wants something, met in a still frame, usually with no task attached |
| **The vista** | HK: the board at the edge of Hallownest. Ori: the Sunken Glades' first view. Silksong: the pilgrims' road up toward the Citadel | The goal at a distance, at a pause. It works only if it is rare |
| **A mechanic that changes the world** | Ori: the Ginso cleansed and the water back in the forest. HK: the Crossroads infected on return. Nine Sols: the village lost | Something you did is visible every time you pass that place afterwards |

What the Canopy has today, against these patterns:
- **Reveals:** the hatch's moon and the hub's landing frame.
- **A world that changes:** the hub's roosts.
- **The release** is the start of a story beat.
- **Missing:** a boss with a turn, a chase, a quiet scene with someone, and an ending that pays the opening.

Below, each of the seven moments takes one or two of these patterns. No pattern is used twice for the same job.

### The rules every moment keeps
- **The story is told by the world, the creatures and what she does.** No text, no name card, no letterbox, no
  dialogue. Lines stay as they are: item lines and the title.
- **She keeps control** (journey.md's staging rule). Input may be held for at most 3 s at a time (`kit.storyHoldMax`).
  The camera may lean, widen or hold a zone. Time may stop for a hit's length (the release's hold).
- **No signposts.** No new prompts, arrows or glows "for readability". If a moment needs a sign to be found, it's on
  the wrong line.
- **Density of choice:** each moment leaves her a choice (stay or go, cut or fight, the high line or the low).
- **Missing a moment never softlocks.** One she misses or walks away from either plays out without her or comes back.
- **Every moment works at 16:9, 16:10 and 21:9** (`fill-any-aspect`). Its clip is checked at all three.
- **Try before cutting.** Each L item has a fallback, used only if a real attempt fails as judged by Matt's play.

---

## 2. The seven moments

The minutes are a first-timer's estimates from the hatch, from the bots' times and the route. HK's first area runs
45-70 min and Ori's Sunken Glades ~25 min; the Canopy should land near 45.

| # | Moment | Room | Minute | Pattern | Cost |
|---|---|---|---|---|---|
| 1 | **Last to hatch** | `cn-hatch` | 0:00-1:30 | reveal, character | M |
| 2 | **The first cage** | `cn-hub` (landing) | ~2:30 | the verb, the world changes | S (built in r11; polish) |
| 3 | **Moonlight for two** | `cn-crown` | ~24 | quiet after loud, character | S-M |
| 4 | **The firefly's flight** | `cn-gap` (into the roost) | ~27 | chase, reveal | L |
| 5 | **The trap is set** | `cn-tunnel` (the den's warning) | ~36 | the cause shown | M |
| 6 | **The Keeper** (the boss) | `cn-den` | ~39-43 | boss with a twist, the crash | L |
| 7 | **Follow the light up** | `cn-den` roof → `cn-out` | ~43-46 | escape, vista, the world changes | L (fallback M) |

The rhythm along the route:
- loud: the hatch's run and the first fling;
- the verb: the first cage;
- the long middle: the west and the Grove's wave (loud);
- quiet: the crown;
- loud: the chase;
- quiet: the tunnel's bramble run;
- unease: the trap is set;
- loudest: the boss;
- loud: the escape;
- the quietest and widest: the vista.

---

### Moment 1. Last to hatch

**The pitch:** you hear the swarm before you see it. You break out last, your kin tries to fly after them and falls
back, and from the branch's end you watch the river of moths fall into the valley's false lights.

**Where:** `cn-hatch` (from `content/rooms/wood-hatch.json`). The cocoon row is at ~864 × 1,022. The kin is at the
branch's end. The promise lip is at ~3,460 × 892, the first fling's lamp just past it. Minute 0:00-1:30.

**Beat by beat:**
1. **0:00, black.** Wind in leaves, then a sound that grows over 3 s: thousands of wings, close and passing.
2. **0:03, a close frame** (zoom ~1.5) on her closed cocoon among split, empty ones. **The swarm's shadows** ripple
   across the bark and the cocoons: it is passing between the moon and the branch. No moth is in frame yet.
3. **The presses.** Each press (`hatchStir`) splits the cocoon a little more, and **the camera widens one step a
   press** (1.5 → 1.25 → 1.0), so each press shows more sky and the wing sound comes closer. Nothing hurries her:
   until she breaks out, the river keeps passing.
4. **The breakout** (`hatch`) lets go of the camera to the full frame: the river of moths crossing the moon, its
   tail already past the zenith.
   - **The kin**, at the branch's end, opens its wings, jumps after the swarm and flutters with one good wing. It
     drops back onto the branch in a scuffle, sits, and turns to look at her.
   - **The title, LAMPFALL**, fades in over the moon as the river's tail crosses it (2.5 s). She has control
     throughout.
5. **From `hatch`, the river's tail takes ~8 s to clear the sky.** If she stands still, the sky empties. If she runs
   east, the stream is keyed to her x (journey.md: it never escapes, never visibly waits) and stays just ahead and
   above, down the branch. Being left behind is felt by running, not told.
6. **The promise lip: the reveal.** A widen zone (0.85, no lock, no input held) shows the river pouring over the
   canopy's edge and breaking into spinning knots round the warm false lights in the valley far below. Stragglers
   peel off toward the nearest. The moon is over the mountain. It is the premise in one image, held as long as she
   stands there.
7. **The first fling** follows as it does now (the lesson). It is the first thing she does with a lamp: she uses
   one, and the next moment shows her one that is a trap.

**What changes afterwards:**
- The sky is empty of the river for the rest of the area. The moths are gone, and that is the point.
- The kin isn't on the branch when she passes back: it walks the road on its own and is next seen in the hub.

**The story it carries:** both of them were left behind. She can fly, and the kin can't. The false lights are the
problem, seen before any lamp is met.

**Pieces:**
- **Level/sim** (in `canopy.ts`'s `hatch()` marks):
  - a `stage.vista` at the promise lip with `title` moved from the breakout to the river's tail;
  - the stream's `hatchTail` timing (frames from `hatch`);
  - the kin's `try` at `hatch` (the swarm try exists: `character/tatter.ts`);
  - the widen zone at the lip;
  - valley `lights` in the far layer.
- **Render:**
  - the close open and its zoom steps on `hatchStir`;
  - the swarm's shadows on the branch (a moving shadow mask in the moonlight);
  - the river's tail keyed to `hatch`, and the stream keyed to her x until the lip;
  - the river breaking into knots over the valley lights (`swarm/` behaviours: the `river` exists, knots are orbits);
  - the kin's failed flight.
- **Audio:** see §5.

**Cost:** M.

**The clip should show** (16:9 and 21:9, from frame 0, no keys for 4 s, then three presses, then right):
- the first 3 s are dark with the wing sound;
- shadows move on the cocoon before any moth is seen;
- three distinct widens;
- the river crossing the moon at the breakout, and the kin's jump and fall in frame;
- the title over the moon within 10 s of the first press;
- at the lip, the river in frame breaking into ≥ 3 knots over warm points, ≥ 2 s.

A second take, standing still after the breakout, must show the sky empty within 10 s.

---

### Moment 2. The first cage

**The pitch:** the first thing in the hub is a cage of moths with the kin under it. Three cuts, and the cloud swirls
round her and pours up past the kin toward the moon.

**Where:** `cn-hub`. The landing is at 6,160 × 1,152, the cage at 6,300 × 1,400 under the landing limb, and the kin
at 5,780 × 1,600. Minute ~2:30.

**Built in round 11:** the landing's frame, the cage, the escaped moth on the first cut, the hold, the burst, the
swirl, the stream, the count, the sound, and the hub's roost on the claw face.

**What's left (polish, S):**
- **The kin's answer.** It watches the cloud rise, then takes three steps after it, opens its wings once (the torn
  one shows) and folds them.
  - One freed moth breaks off the stream, lands on the kin's head for 1 s, opens its wings and goes.
  - The kin turns to her, then walks west to its light (`stage.tatters[0]`).
  - It's the smallest moment in the area, and the one that makes the kin a person.
- **The follow camera's drop** after the release (canopy-render.md "Not done"): a71e1ba now holds the landing's frame
  until she walks off the landing (`cn-hub-left`). Check it in the clip; nothing more if it holds.
- **The roost on every crossing:** it gains its cloud as she leaves the landing's frame, so it is new on her way back
  (it is now).

**The story it carries:** the verb (cut the cage, free the moths) and what the kin wants (to go with them).

**The clip should show:**
- the cage, the kin and the moon in the landing frame;
- the first cut's escaped moth;
- the burst;
- the kin's three steps and the one torn wing;
- a moth landing on it;
- the stream in frame ≥ 2 s.

---

### Moment 3. Moonlight for two (the quiet character moment)

**The pitch:** at the top of the tree, in the moonlight that just gave you your wings, your kin is already there. If
you sit with it, it opens its wings to the moon too, and one of them is torn.

**Where:** `cn-crown`. The glide's glade is at 1,980 × 800, the moon at 1,300 × 620, and the limb c4 (1,856-2,496 ×
1,024) runs out under the moon. Minute ~24, after the Grove's wave (the area's loudest stretch until the den), the
spire and the bower's climb. **The quiet after the loud.**

**What happens:**
1. **She gets the glide** (the glade's bask plays as now: her wings open and dry in the moonlight).
2. **The kin is there** when the bask ends, at the limb's tip, looking at the moon. It walked: in the bower it was on
   its own climb (`marks.tatter` at 300 × 1,472), and now it is here first. No beat shows it arriving: it is simply
   there, the way the kin always is.
3. **If she comes within ~160 px and stands still 2 s** (no new verb, no prompt; `kinSit`), the kin shuffles over
   beside her. The camera eases out to 0.85 over 3 s and the bed drops. **The area's only duet** begins (§5).
4. **The kin opens its wings to the moon, as she just did.** The torn one only half opens. It holds them open a
   breath, folds them and leans against her.
5. **She leaves when she likes.** The music finishes its phrase and fades; it never cuts. The kin stays on the limb,
   looking at the moon.

**Density of choice:** nothing makes her stop. A runner sees the kin on the limb and glides on. A player who stops
gets the scene. Nothing is locked behind it; it's the most optional and most retold thing in the area.

**What changes afterwards:**
- The kin is gone from the crown on any later visit. It has walked on.
- It is waiting on the clifftop at the end (Moment 7). The payoff: **it walked all that way.**

**The story it carries:** the kin can't fly. She can, now. Nothing she does will fix that, and the moment doesn't
pretend it will. It sets up journey.md's Tatter arc (its lamp, its absence in the cold, home).

**Pieces:**
- **Level/sim:**
  - `marks.tatter` on the crown (`when: gladeGrant` of `glade-glide`) with a `sit {x, y, r: 160, frames: 120}`;
  - a `kinSit {id}` event when she stands still in it (the sim never moves the kin);
  - the zone `crown-sit` (zoom 0.85, from `kinSit`, until she leaves r + 200).
- **Render** (`character/tatter.ts`): the walk-over, the wing opening with a half-opened torn wing, the lean, and
  the stay.
- **Audio:** the duet.

**Cost:** S-M (the kin rig has rest, walk and look-up; the wing opening is new).

**The clip should show** (16:9 and 21:9): the bask, the kin at the tip in frame, her stop, its shuffle, both wing
pairs open against the moon in one frame (the torn one visibly short), and the lean. Then a second take where she
walks off at once: no hold, no line, the kin stays put.

---

### Moment 4. The firefly's flight (the chase)

**The pitch:** you catch the firefly hanging a light. It bolts across the gap, and every lamp it passes catches fire,
so its own lights are the only road fast enough to follow it, all the way into its nest.

**Where:** `cn-gap` (4,352 × 2,304), entered from the bower on the east, crossed once on the route. The chain is at
~2,688-3,456 × 1,550-1,700. **The roost** is the hanging root clump at 2,752-3,328 × 0-1,280. Its pocket (a covered
hollow with a hoard at 2,990 × 1,150) has a shaft up into `cn-sky`. Minute ~27: she has the blade, the fling, the
claws and the glide (one minute old). Every move she owns is in this chase.

**This is the area's Ginso**, made small and kept on the story. journey.md puts the real firefly chase (set piece 4)
in the valley later; this is its first rehearsal, in the Kuro slot (story rule 3: early on it's a light that flees
and relights lamps behind her). It replaces r11's gap pass (`firefly-gap`).

**What happens:**
1. **The sighting** (the bower's door, the gap's east edge). Across the upper air of the gap, the firefly hangs a
   springboard, its back to her, pulsing slow.
2. **It sees her** and flashes fast and bright (the alarm), then bolts west along the upper gap.
3. **The chase.** As it passes them, **5-6 dark hooks catch fire** (`kindles`): new springboards in a falling S
   across the gap's upper half, then down onto the existing chain.
   - The lamps are the only line fast enough; the glide is the slow safe line under them.
   - It stays 450-600 px ahead of her, keyed to her progress along the path (the swarm-spline trick): it never
     escapes and never visibly waits.
   - **Two lines:** the high line (flings only, fast, it stays close) and the low line (glide and claw the clump
     faces, slower, it pulls ahead and hovers at its next lamp flashing alarm until she is back within reach).
4. **She can't fail it.** A fall drops her to the gap's floor (the bramble, as now). The firefly hovers at its next
   stop, and the lit lamps stay lit while the chase is on. There is no reset and no death screen. Ori's escapes
   restart you; this one waits, because it's minute 27 and the move is one minute old.
5. **Into the nest.** It dives into the roost's mouth, and she follows it in (the cover lifts as she enters, as covers
   do). **The reveal**, the inside of its nest:
   - stripped glow-cap husks;
   - empty cages hanging on threads, waiting to be hung;
   - a coil of thread;
   - the hoard's glints among them.

   The firefly is at the shaft's top. It flashes once, slow and long, the call (§5), up at the sky through the
   shaft. Nothing answers. It squeezes up the shaft and is gone into `cn-sky`.
6. **After:** the pocket is quiet. The glints are hers. The way on is down the chain as now.

**Density of choice:** the high line or the low; the glints in the nest; and the shaft up to `cn-sky` as a secret
she can now follow.

**What changes afterwards:**
- The chase's lamps stay as springboards (relight 240), so a fast fling line across the upper gap now exists for
  every later crossing.
- The roost's pocket is open, with its empty cages and husks. The hooks it hung in the sky room are seen from the
  shaft.

**The story it carries:**
- **The cause is shown:** this is who hangs the lights, and where the cages come from.
- **A seed of the reason:** one unanswered call. Players won't know what it means until the marsh; replayers will.
- Rule 2 (it is still a threat) is not touched here. It runs, it doesn't fight.

**Pieces:**
- **Level/sim:**
  - a re-laid upper gap: 5-6 hooks on a falling S, proven with `fling-probe.ts` (each in reach of the last's best
    aim, none a skip to the far limb, the glide's prize: memory/canopy.md "Lamps near a glide lock");
  - the firefly's `chase` block on `scene.fireflies`: `{lead: [450, 600], kindles: [lure ids], waits: [path
    points], end: point}`, its progress a pure function of her progress along the path, deterministic;
  - hooks as `after` springboards lit by `fireflyKindle {id, lure}`;
  - the roost's cover lifting on entry (exists);
  - the end in the pocket (`fireflyHide {id, x, y}`, then up the shaft);
  - a `chase-gap` claim in `tools/solve/canopy.ts` (the high line lit; the low line without the chase lamps);
  - a test that no fall leaves the firefly out of frame for more than 4 s.
- **Render:**
  - the firefly at speed (wing blur, a short light trail, the alarm flashes);
  - a hook catching fire as it passes (a thread of its light to the hook, a flare);
  - the camera's lean toward it on `fireflyKindle` (the 40% lean exists), and a `look` holding it and her in frame;
  - the nest's inside drawn as its collection (husks, empty cages, thread), lit only by its cold-gold light until it
    leaves, then dim;
  - the call at the shaft.
- **Audio:** the chase cue (§5).

**Cost:** L.

**Fallback** (only if the real attempt fails Matt's play): 3 kindled lamps on the existing chain's line and no
re-layout. The nest reveal stays; it's the cheap half and carries the story.

**The clip should show** (16:9, 16:10, 21:9; the high line and the low line, two takes each):
- the firefly ≥ 20 px and in the frame's middle two thirds ≥ 70% of the chase;
- every kindle in frame;
- her flinging off lamps it just lit;
- the dive into the pocket;
- the nest's cages and husks in frame ≥ 2 s;
- the call;
- the exit up the shaft.

A third take, falling at the first lamp, must show the firefly waiting in frame and the chase going on.

---

### Moment 5. The trap is set

**The pitch:** after the fight at the den's mouth, the firefly flies in, hangs a new cage and lights it, and a passing
stream of moths swerves into it and is caught while you watch.

**Where:** `cn-tunnel`, the den's warning. The floor is 6,912-7,936 × 1,856, and the den's mouth arch has its lintel
at 7,808-8,000 × 1,408. The cage is at ~7,552 × 1,200 since a71e1ba (320 px west, over the knuckle). Minute ~36,
right after beat 2 is cleared (`cn-tunnel-clear`).

**Built in round 11:** the second sighting (`firefly-warn`) comes out of the tube's east shaft and hangs `trap-warn`
for 75 frames. The cage grows in, the firefly flees down into the den, and the `look` frames it.

**What's new: the cage is empty when it's hung, and fills in front of her.**
1. The firefly hangs it. The cage lights: a hum swells in, and it is empty.
2. **A thin stream of 40 moths** has been drifting down the tunnel's high shaft toward the moon's side since she came
   onto the warning's floor. It is a background stream in the far plane, seen during the fight if she looks. It
   swerves.
3. **The moths spiral in**, the stream bending into the cage's orbit over ~3 s, and the cage's cloud thickens to its
   40. The firefly is already gone into the den. It never looked back.
4. Then the den's deep slam (the boss stirring, the beat r10 asked for) moves from beat 2's start to here: the cage
   is lit, and something under the floor answers.

**Why it lands:** the area has said "moths are trapped" since minute 2. This is the only time she sees it happen. The
moths she will free were free a minute ago, and she watched them get caught.

**What changes afterwards:** the cage is there to be cut from the lintel's ledge (as built). Freed, its roost lights in
the hub's lampoak crown (as built).

**The story it carries:**
- The firefly doesn't know the lights trap moths (story: "it is not evil"). It hangs the cage and leaves without
  seeing the moths go in. The player sees what it doesn't, and that is the irony.
- The slam sets up the boss.

**Pieces:**
- **Level/sim:**
  - `trap-warn` gets `fills: {frames: 180}` (its `moths` count up from 0 after `fireflyHang`; `trapFill {lure, n}`
    each moth; cuttable only once full, so it can't be cut empty);
  - the slam cue `denStir` on the fill's end.
- **Render:**
  - the far stream in the tunnel's high air (a `stage.stream` with `captured: trap-warn`);
  - its moths bending into the orbit in step with `trapFill`;
  - the den's slam (0.3 trauma, dust off the lintel).
- **Audio:** the moths' wings turning regular (§5).

**Cost:** M.

**The clip should show:**
- the stream in the background during beat 2;
- the hang;
- an empty cage lit;
- moths visibly bending from the stream into it, ≥ 20 of them in frame at once;
- the cage full;
- the slam's dust.

All in one held frame at zoom 1.1, at 16:9 and 21:9.

---

### Moment 6. The Keeper (the boss, redesigned)

**The pitch:** the old burrback isn't guarding the great cage, it's eating from it. Halfway through the fight it
tears the cage loose, and the light swings, so it can only see you in the light. Then it rips the cage down and feeds
on the spilled moths, and you choose: kill it, or cut them free first.

#### Its story
The great cage hangs over the den with 120 moths, the firefly's biggest light in the wood. Moths at a lamp circle
until they drop. The old burrback (working name *the Keeper*; it has no name card and the name is never shown) found
that the den's floor fills with moths every night. It sleeps under the light and eats what falls. It's
`creatures.md`'s "fat on the moths that fall", made the plot.
- It's a real predator where moths circle (story rule 1).
- The firefly hangs the light and never sees what happens under it (rule 3).
- The moths really die (rule 4): in this fight they die in front of her, and she can stop it.

Its parallel is Nine Sols' Yingzhao (the boss guards a person, and the person is the payoff) and HK's Gruz Mother
(the turn comes out of its body). The moths are the payoff, and the turn is that the guard is the threat to them.

#### The intro (the reveal, ~8 s, she keeps control)
From the balcony (`place:balcony`, 300 × 320), on her first landing:
1. The firefly's third sighting plays as built. It circles the great cage, stops over it, and goes up through the
   roof's gate.
2. **As it leaves, one exhausted moth drops out of the cage's orbit** and spirals down into the dark floor, a pale
   fleck falling 600 px.
3. **Out of the dark, a shape the width of the floor heaves up and takes it** (`enemyFeed`). The red eyes open for
   the first time, then close. It settles. The den is quiet except for the cage's hum.
4. She knows what's down there, what it does, and that the moths are its food, all before she drops. Then the drop,
   and the wake (as built: 90 frames, lids, flank lights, burrs rising, the 8% push).

#### Phase 1: under the light (10 → 7 hp)
- **Moves:** the old burrback's slam and rams as now, tells as now. Phase 1 stays the honest exam of what the
  burrbacks taught: bait, jump the ram, cut the recover.
- **New:** every ~8 s a moth drops from the cage (`cageDrop`), telegraphed by a pale flutter as it leaves the orbit.
  The Keeper breaks off and goes for it. **The choice:**
  - **Catch it:** she touches it in the air before the Keeper does. It clings to her (`mothSaved`) and flies with her
    to the end. It's a jump at the wrong moment, maybe into a ram.
  - **Take the window:** the Keeper eats (`mothEaten`, the cage's count drops by one) and stands with its head down
    for ~1.2 s, a free opening for two cuts.

  Either is right. The cage's count is visible in its cloud: fewer moths circle it as the fight goes on.

#### Phase 2: the swinging light (7 → 4 hp). The twist begins.
- At 7 hp the Keeper rears and slams the taproot (the existing `taproot` move, 2,944-3,040), and the cage's east root
  tears.
- **The cage swings** from its west root as a pendulum across the arena: ~4 s period, ~±700 px at the floor
  (`Lure.swing` exists, paths.ts; started by a cue, `cageSwing`).
- **The Keeper sees only in the cage's light** (`player.lit`, the senses by lamp light that exist):
  - when the swing's light is on her, it charges at once;
  - in the swing's shadow it loses her: it sniffs, turns slow and goes for the last place it saw her;
  - lit, it's fast and sure; in the dark, it's blind and open from behind.
- **The pillar is taught by a boss:** the dark is safe, the light is danger. She fights by moving with the shadow
  and cutting from the dark side. The bait-and-punish of phase 1 still works and is slower.
- **The arena changes:** the light and every shadow (the braided root columns, the shelves, the Keeper) sweep across
  the walls every 2 s. It's the most dramatic picture the den can make, and the area's best.
- Moths still drop, flung wider by the swing.

#### Phase 3: the fallen cage (4 → 0 hp). The turn.
- At 4 hp the Keeper climbs the taproot and **rips the cage down.** It hits the floor at the arena's middle, its bars
  bent open on one side, and lies on its flank.
- `wick-taproot` goes out (its `snuffs`, as built). **The den is lit from below now**: the shadows climb the roof.
- **Moths spill out** through the bent bars and circle low over the floor, too dazed to rise. **The Keeper feeds**:
  between attacks it sweeps its claws through the low cloud, and each sweep eats 2-3 (`mothEaten`). The cage's cloud
  thins in front of her.
- **The choice**, the area's last and biggest piece of density:
  - **Kill it first:** 4 hits. The faster she is, the fewer it eats.
  - **Free them first:** the fallen cage takes cuts now (its guard drops on `cageFall`). **Each cut frees a third**
    of what's left (`cageRelease {moths, left}`), and those rise out of its reach to the roof. Three cuts is three
    jumps' worth of time with the Keeper on her back.
  - Mixed is fine, and probably what most do.
- **Fairness:**
  - A fade restarts the fight with the cage full and hung (the arena's retry). Moths are lost only in the run she
    wins.
  - Tuned so a slow first-timer still frees ≥ 60 of 120, and a fast or clever one frees ≥ 110.
  - The phase 3 rams keep the den's `strikeHeadroomPx` rules (memory/canopy.md gotchas).

#### The ending beat
1. **The last hit:** a 22-frame hold, then silence: no bed, no hum.
2. **The Keeper rolls onto its back and doesn't get up.** Its shell cracks along the split. A few moth wings drift
   off its plates. It breathes out once, long, and is still.
3. **The bent cage** lies glowing on the floor with whatever is left circling it. She cuts the last bars (if any
   are left) → **the great release** (built: 22 frames held, pull-out to 0.88, lift 260 px). The cloud doesn't swirl
   round her: **it rises in a column**, straight up to the roof's root gate.
4. **The roof gate's roots** grew round the cage's chain. With the anchor gone they slacken and part
   (`gateOpen den-roof`), and **moonlight comes down the shaft onto the cloud.** It's the first moonlight in the den:
   the real light replaces the false one, and that's the whole game in one picture.
5. Then the roof groans. Moment 7 starts.

#### What changes in the world
- The Keeper's carcass stays on its back in the arena, a landmark.
- The cage lies bent and dark on the floor.
- The den is moonlit from the roof forever after (Moment 7's collapse).

#### How it ties to the story
- **Lamps:** the false light feeds a predator.
- **Moths:** they die at the lamps, in front of her, and she saves them by speed and choice.
- **The firefly:** it hung this and left, never knowing.
- **The moon:** the first time the real light reaches the den.
- **The migration:** the column rising toward it.

#### Pieces
- **Level/sim:**
  - move the old burrback onto the boss framework (`src/sim/boss/`: arena lock, phase table, cue timelines, retry,
    defeat flag; the Weaver and the Mantis use it) as kind `keeper`, reusing burrback.ts's moves;
  - cues `intro` (the falling moth and `enemyFeed`), `p2` (`cageSwing`), `p3` (`cageFall`, the lure moved to the
    floor and unguarded);
  - the falling moths (`cageDrop`, a small falling body; `mothSaved` / `mothEaten`);
  - the feed target choice and the head-down window;
  - phase 2's lit / unlit hunting (existing senses);
  - phase 3's sweep-feed;
  - the partial release (`cageRelease`);
  - `lureSnuff {trap, moths: <saved>}` at the end;
  - the retry restoring the cage;
  - tests: phase changes at 7 and 4, the swing's period and reach, the guard off on `cageFall`, a fade restores 120,
    the bots' win rate (12 of 12 before; keep ≥ 10 of 12 and a casual win ≤ 2:30).
- **Render:**
  - the intro's falling moth and the snap from the dark;
  - the Keeper's shell **stippled with dead moth wings** stuck in its plates (a predator's coat, readable at play
    zoom);
  - the swinging cage's light with moving shadows (the three planes and the root columns cast onto the back);
  - lit-from-below for phase 3;
  - the low cloud and the sweep;
  - the cage's count readable as cloud density;
  - the death roll;
  - the column release up into moonlight down the shaft.
- **Audio:** the boss score (§5).

**Cost:** L (boss framework move M, swing and senses S, the fallen cage and feeding M, render L).

**Fallback, cut in this order** (each only after a real attempt fails):
1. drop phase 1's falling moths;
2. phase 2's swing becomes a fixed light that dims and brightens on a beat;
3. the fallen cage can't be cut mid-fight.

The intro, the ending beat and the column are never cut.

**The clips should show** (one per phase, 16:9 and 21:9, the average bot's win plus a first-timer's):
- the intro's moth taken in frame ≥ 1 s before the drop;
- a caught moth and an eaten moth;
- the swing's light crossing the whole arena with shadows sweeping the back wall;
- the Keeper turning blind in the shadow;
- the cage falling;
- the light from below;
- the low cloud thinning under a sweep;
- a cut freeing a third;
- the death roll;
- the column rising into moonlight down the shaft, ≥ 3 s.

The Keeper is the darkest large shape in every frame (rim luma ≥ 120, r10 #9).

---

### Moment 7. Follow the light up (the area's ending)

**The pitch:** the den's roof comes down, and the only light in the dark shaft is the cloud you just freed, streaming
up ahead of you. You burst out onto a clifftop in moonlight with the whole valley below, every moth you saved pouring
toward the mountain, and your kin already there. Then you jump off the cliff and glide with them.

**Where:** `cn-den` → `cn-out`.
- The arena's east wall (the claw face, 3,264 × 448-1,152), the roof's gate (3,072-3,264 × 384) and its shaft and
  passage (3,072-3,840 × 128-384).
- The out's clifftop at TOP 384, with the vista trigger `out-vista` (out 64-576 × 0-384) and the vista camera
  (2,300 × 760, zoom 0.7).
- The door's ledge across the valley at 3,584 × 1,088.
- Minute ~43-46.

#### The escape (Ori's Ginso, short)
1. **The roof fails.** Earth pours from the roof's edges, root columns snap and fall, and the arena floor cracks
   along the Keeper's slam lines (`denCollapse`).
2. **The freed cloud is the only light.** The braided columns fall into dark, and the column of moths streams up the
   east wall and the shaft ahead of her, cool-white.
3. **She follows:**
   - up the east claw face, with rocks falling at telegraphed spots (dust trickles first, the dangler's thread
     language);
   - through the gate;
   - up the shaft, with a collapse front of falling earth 300-400 px under her, rising at her pace;
   - along the passage east, with the roof falling in behind her.
4. **Fair:** a hit returns her to the escape's last checkpoint (the gate, the passage's start). There are three
   checkpoints, Ori's rule, and no fade loop back to the balcony.
5. **20-30 s.** It's the area's one test of nerve, and every move used is one she owns.

#### The vista
6. **She bursts out onto the clifftop** into full moonlight (`cn-out-vista`). The vista hold plays (built: zoom 0.7,
   3 s, she keeps control).
7. **What the frame holds:**
   - the moon over the mountain;
   - the valley of lamps below: warm false lights, each with a spinning knot of moths. This is the next area's
     promise and its problem, the same image as the hatch's lip, closer;
   - **her freed cloud** streaming out of the den's shaft behind her and away toward the mountain;
   - **from the west, far off over the canopy, the hub's roosts lifting**: thin pale streams rise out of the wood
     where she freed each cage and join it. Every moth she freed in the area is in that river. Its density is her
     count.
8. **The kin is on the clifftop** (built: `marks.tatter` when `cn-den-down`). It walked the whole way. It watches the
   river, then turns to her.
9. **The glide.** The door's ledge is a glide across the valley (built). She steps off the cliff and glides **inside
   the river**: the stream passes round and over her at her height while the camera stays wide. It's the last thing
   in the area, and she's doing it: flying with them, which is what she couldn't do at minute 0.
10. She lands at the door. The river goes on to the mountain without her. She will follow. The kin stays on the
    cliff.

#### What changes in the world
- **The den is caved in and moonlit.** A rubble slope runs from the balcony up to the skylight: a shortcut from the
  tunnel to the clifftop, and the one place in the area where the false light was replaced by the moon.
- **The hub's roosts are empty** (a few wing scales glint on the bark): the moths went on the migration.

#### How it ties to the story
- The opening's pain (left behind, can't keep up) is paid by the ending's image: in the river at last.
- The kin is the reminder that not everyone can fly.

#### Pieces
- **Level/sim:**
  - the escape's cue timeline (`denCollapse`: rockfalls with tells on a fixed schedule keyed to her progress, a
    collapse-front hurt volume rising behind her at her pace, three escape checkpoints as `MoonPatch.mark`s);
  - rubble as `shut` gates keyed to `cn-den-collapse` (a gate with `shut` becomes solid on its flag, as the arenas
    do) forming the slope;
  - re-route the den's world routes so the slope reaches the roof without claws (the balcony → roof `place:` claim);
  - `roostsLeft` (a flag the roosts read: the hub's roosts empty after `cn-den-freed`);
  - the glide's line to the door unchanged;
  - tests: the escape is passable at kick delays 0 / 6 / 10 (climbs.ts); the slope route; the escape's checkpoints.
- **Render:**
  - the collapse (falling earth, snapping columns, cracking floor, dust);
  - the cloud as the escape's only light (the den's grade drops to near black, with the moths as point lights);
  - the vista's layers (the valley lamps with knots, the far roost streams rising from the hub's direction);
  - the river passing round her glide (the `releasePath` streams merged into one `river` across the valley at her
    height);
  - the caved den and the rubble slope;
  - the empty roosts.
- **Audio:** the collapse and the area's theme (§5).

**Cost:** L. **Fallback M:** no hazards or collapse front: the roof groans and dust falls, and the cloud leads her up
in the dark. The vista, the roosts' streams, the kin and the glide in the river are never cut.

**The clip should show** (16:9, 16:10, 21:9, ≤ 60 s from the last hit):
- the column rising;
- the gate opening onto moonlight;
- the escape with the cloud as the brightest thing in frame;
- ≥ 1 rockfall tell before its fall;
- the burst into moonlight;
- the vista with ≥ 3 distinct streams joining (the den's, ≥ 2 of the hub's roosts);
- the kin in frame;
- the glide with moths passing on both sides of her;
- control never held more than 3 s.

---

## 3. Why these seven and not others

- **Kept, not listed:** the first fling's lesson and the Grove's gates. They're already the area's best two minutes
  of play, and they need nothing.
- **Built, polished (Moment 2):** the first cage is the verb. Round 11 made it a moment, and it needs only the kin.
- **No second escape** in the middle. The chase (4) and the escape (7) are 16 minutes apart and differ in kind (you
  chase the cause; you flee the consequence).
- **The firefly appears four times** (the chase, its nest, the hung cage, the den's circle), and its reason is never
  given. That's journey.md's rule: the cause in the wood, the reason in the marsh.
- **Each moment changes something you see again:**
  - the sky empties (1);
  - the roost grows (2);
  - the kin goes on ahead (3);
  - a new fling line and an open nest (4);
  - a cage where none was (5);
  - a carcass, a bent cage (6);
  - a caved, moonlit den and empty roosts (7).

---

## 4. Close-up art: the five biggest changes to reach Silksong's density at play zoom

The comparison: Silksong's Moss Grotto (`~/code/opusvania-refs/silksong/rooms/tut_01-03.png`) against our r11 frames
(`shots/canopy-r11/`).

**Where we are level:**
- our value structure (mid-value air, near-black ground, a lit rim) matches theirs;
- the big shapes, the moon and the vistas are at the bar.

**Where we fall short:** surface. At play zoom every Silksong top, underside and back wall is made of hundreds of
small marks (stipple, lobes, strands, sprouts). Ours are made of a few big smooth shapes with a thin tuft line. The
hub's landing frame (`wide-1-landing.png`) shows clean bark logs with a dotted lime rim. The same frame in Silksong
would be furred with moss.

Ranked by how much of the frame each change touches:

1. **Stippled moss masses on walk tops and hanging from undersides.**
   - **What:** clumps of 40-140 px built from 150-400 small round marks each, in three value steps, lit from the top,
     a dark core, and breaking the silhouette with lobes. Beards of hanging moss strands (60-300 px) from every
     underside, swaying.
   - **Today:** tufts of 3-7 blades and a lime lip.
   - **Rooms:** the hub, the hatch, the crown and the gap first (the green rooms, the most crossed), then the bower
     and the Grove.
   - **Keep:** the near-black core rule (look:check's solid ≤ 12 past ~100 px) and lime at 0.6x chroma. The density
     is in the marks, not in brighter colour.
   - **How:** one baked instanced-dot mesh per clump family (`top-growth.ts` families), placed from geometry. It's
     cheap at GPU scale; the swarm already draws thousands.
2. **Textured mid-ground masses, not fog cards.**
   - **What:** Silksong's back wall is a solid mass of rounded moss clumps in 2-3 depths, each with low-contrast
     internal stipple. Ours is flat fog with pale trunk silhouettes.
   - **How:** a mid plane of overlapping rounded masses with internal texture at ≤ 10 luma contrast, keeping the air
     mean at 45-70 (figure-ground is the rule we earned; the texture must not raise contrast behind the play plane).
   - **Rooms:** the hub (behind the landing and the clearing), the well's walls, the Grove, the den (its banks get
     earth and root-hair texture, not moss).
3. **Silhouette life on the walked line.**
   - **What:** curled fiddleheads, sprouts, grass blades, small mushrooms and bent stalks standing up out of the moss
     every 100-250 px, near-black against the air. Silksong's tops are lined with them, and they are what makes a
     ledge read as a place.
   - **Today:** a curl every few screens.
   - **Rooms:** every route room. Densest at rests and lips, thinnest in fights' floors (keep the floor readable).
4. **Story litter in the play plane.**
   - **What:** things that say what happened here:
     - dead moths and wing scales under every cage (exists; thicken);
     - wing litter and the Keeper's gnawed husks across the den's floor;
     - the firefly's stripped glow-cap stumps and cut threads along the chase's hooks and in the nest;
     - shed shells and scrapes in the tunnel (exist).
   - **Rooms:** the den, the warning, the gap's nest, under each cage. This is the art that tells the story without
     text.
5. **Hanging strands and shafts of light that move.**
   - **What:** hanging moss and root hair in front of and behind the play plane (silhouettes at the frame's top
     edge), god rays through canopy gaps and the den's new skylight, and drifting spores in the rays. Silksong's frames
     are never still at the top edge.
   - **Rooms:** the hub's clearing, the crown, the well's top, the den after the collapse (moonbeam and dust, the
     area's final interior frame), the gap's nest (threads).

**Check for all five:**
- before / after pairs at the r11 stops of the named rooms, at 16:9 and 21:9, set beside the Silksong renders;
- look:check's bars unchanged (solid, air, chroma);
- a new count: marks per 100 px of walked top (Silksong's tut_02 ≈ 25-40; ours today ≈ 3-6).

---

## 5. Sound plan

All of it is muted by default until Matt listens and says yes. Each moment ends in an A/B clip for him (`npm run
clip -- --audio --ab`).

**Aligned with docs/audio-direction.md:**
- home is D, modal;
- the forest and the moon are in just intonation (the chord D A E B);
- **the false lights are out of tune** (`LAMP_HZ` 38 cents sharp, beating);
- Wing's motif is A rising to D, then E, F, back to E. It ends unresolved, and she never reaches home on her own;
- her instruments are plucked strings (Karplus-Strong) and struck or rubbed glass, never blown or voiced;
- **mouths breathe:** the Keeper has a mouth, the firefly doesn't;
- **silence is the default:** music only at vistas, glades, the great lamp and the boss, plus this area's two set
  pieces;
- "regular is the enemy": re-aimed (as the doc itself suggests) as the lamps' steady beating hum against the forest's
  irregular life.

**The firefly's voice (new; every moment uses it).** Its light is its face, so its sound is its light: small cold
glass pings, **tuned to the lamps** (38 cents sharp, out of tune with the world), in its flash language:
- slow long pulses for the call;
- fast bright bursts for alarm;
- a dimming tremolo when tiring (later regions).

Its call rhythm is **three short, one long** (journey.md). In the Canopy its call is never answered. At the game's end
the far answer comes in the forest's tuning. The seed is planted here and paid in the cave.

**For the audio builder starting now:**
- **The area's music** is one theme, *the Canopy*: Wing's motif on plucked strings over the forest chord in rubbed
  glass. Played whole only three times: the hatch's title, the crown's duet (as a duet) and the clifftop vista. Pieces
  of it at the glades.
- **The ambience** is the per-room `BEDS` (airy in the hatch, crown and gap; hushed in the well and the den; no owl
  underground), plus the lamps' hums.
- **The boss score** is below (Moment 6).

| Moment | Sound | Music |
|---|---|---|
| **1. Last to hatch** | 3 s of black: wind, then a dense wing band (many `mothRush` grains) rising and passing overhead L → R, closer with each widen. Each press: a dry crackle of cocoon silk, unpitched, no blip. The breakout: one breath of silence, then the river's rush right overhead. The kin's try: one beat of a good wing and a torn flutter (a ragged felt rip), a soft thump on the branch. The river's tail thins over 8 s | **The first music in the game**, at the title: Wing's motif once on plucked string (A D E F E), the forest chord in rubbed glass under it, unresolved on E. At the lip's reveal the valley's lamps are heard far off as a faint cluster of out-of-tune hums under the music, the region's name heard (look-and-sound §6) |
| **2. The first cage** | Built (`cageBreak`, `releaseSwell` D4 A4 D5 E5, a chime per count tick, `mothRush` to the moon). Add: the cage's hum is the only tone near it, and on the snuff the hum falls and the forest's wind opens back up (the dark blooming in sound); the moth landing on the kin is one soft glass tick | none beyond the swell |
| **3. Moonlight for two** | The bed drops to near silence on `kinSit`. The kin's wings opening: two soft sheets of felt, the torn one catching short | **The area's only duet.** Wing's motif plucked, and the kin's answer: a 3/4 lilt circling her top notes a third above (F E F A, G F E: the line audio-direction wrote for Sorrel, re-aimed at the kin; "the only music you could dance to"), in canon, very soft, over the moon's glass chord. It ends on her unresolved E with the kin's line resolving under it to D: the kin is home where it sits; she isn't. If she leaves, the phrase finishes and fades |
| **4. The firefly's flight** | Alarm bursts (fast glass pings) on its bolt. Each kindle: a struck match of glass and a hum swelling in, out of tune. Her flings as built (`slowIn`, the held swell, `launch`) | **The area's first rhythmic music.** An ostinato built from the call rhythm (three short, one long) in out-of-tune glass, its tempo and layers keyed to the chase's progress and her distance to it: close means more layers, far means the alarm alone. Each kindled lamp adds its hum to a growing out-of-tune chord. **At the nest it stops dead.** One slow call (three short, one long, slowly), long tail, nothing answers. Then wind |
| **5. The trap is set** | The hang: a thin thread pluck, high. The cage lights: its hum swells from nothing. The far stream's wings are irregular grains, and as they bend into the orbit **their flutter falls into the hum's beat** (grains quantised to `LAMP_BEAT`): the moths turn regular, you hear them caught. The slam: `slam` deep, with dust hiss | none: the dread is the hum |
| **6. The Keeper** | The intro: the den's drips, the great cage's hum (`great`, over D3, 0.6 Hz beat) as the room's floor; the falling moth a single falling chime; the snap from the dark a wet crunch and a long breath out (it has a mouth). Its gait is heavy modal knocks of earth and shell. `mothEaten`: a falling chime cut short. `mothSaved`: a chime that rises | **The boss score.** *Intro:* silence + hum; the first music on the wake. *P1:* low drum-like earth knocks on its gait, the great hum as the harmonic floor, a short low figure (the falling fourth) on its rams. *P2:* the hum **swings in pan and brightness with the pendulum**; when the light is on her the mix is bright and present, in the shadow muffled (`graph.muffle`): she hears when she is seen. The score's pulse follows the swing's period. *P3:* the hum drops an octave (the cage on the floor), the spilled moths' wings loud and panicky, the score at full tension, each eaten moth a cut-off chime in the texture, each freed third a rising rush. *The last hit:* the ring held through the 22-frame hold, then **total silence** (no bed, no hum), then its last breath out. *The release:* the release swell, two octaves, the count's chimes climbing |
| **7. Follow the light up** | The collapse: low rumbles, earth hiss, root snaps (wood cracks), rockfall tells as trickles of grit before each fall. The cloud's `mothRush` panned up and ahead, the one bright sound, leading | No score in the escape: the cloud and the collapse are the music. **On the burst into moonlight: the theme, whole**, the forest chord in glass, Wing's motif harmonised for the first time, the valley's lamps faint and out of tune far below. It holds through the glide in the river and ends on a suspended chord, A over D: open, because the journey isn't over. A far owl at the door |

---

## 6. The contract between the lanes

Sim names are the contract. The level/sim lane lands these names, with empty or stub behaviour, **in its first
commit of the round**. Render and audio build against them from day one, driving them with scratch tapes until the
behaviour lands. Render and audio never write the sim. Render never imports audio.

| Moment | Sim / scene names (new unless noted) |
|---|---|
| 1 | `hatchStir` / `hatch` (exist); `stage.vista` at the lip with `title`; `stage.stream.hatchTail` (frames); the kin's `try` on `hatch`; zone `promise` |
| 2 | (built) `landing` zone until `cn-hub-left`; `stage.tatters[0]` |
| 3 | `marks.tatter.sit {x, y, r, frames}`; event `kinSit {id}`; zone `crown-sit` |
| 4 | `fireflies[].chase {lead, kindles, waits, end}`; events `fireflyChase {id, phase}`, `fireflyKindle {id, lure}`, `fireflyHide {id, x, y}`; `state.kit.firefly` as now |
| 5 | `Lure.fills {frames}`; event `trapFill {lure, n}`; event `denStir` |
| 6 | boss kind `keeper` (boss framework); cues `intro`, `p2`, `p3`; events `enemyFeed {id, x, y}`, `cageDrop {lure, x, y}`, `mothSaved {x, y}`, `mothEaten {enemy, x, y, left}`, `cageSwing {lure}`, `cageFall {lure, x, y}`, `cageRelease {lure, moths, left}`; `Lure.mothsLeft` |
| 7 | event `denCollapse {phase}`; `rockfall {x, y, tell}`; `collapseFront {y}`; flag `cn-den-collapse`; rubble gates; `roostsLeft` |

**Files by lane, never shared:**
- **level/sim:** `tools/levels/canopy.ts`, `content/worlds/canopy*.json`, `src/sim/**`, `tools/solve/`,
  `tools/levels/*-probe.ts`, `tests/unit/canopy-r12*.test.ts`, `memory/canopy.md`.
- **render:** `src/render/**` (scene, character/tatter, lantern, camera, enemies, swarm, post), `src/render/contract.ts`
  only to read new names, render tests, `memory/canopy-render.md`.
- **audio:** `src/audio/**`, `memory/audio.md`.
- **This doc** is the director's. Builders report back in their memory files, not here.

---

## 7. Build order

Matt's run from the hatch gates the review of each round. In each lane the items are ranked: if a round runs short,
it ships the top of each list.

### Round 12: the climax, the opening and the ending

Round 12 builds the first and last impressions plus the boss. These are the three things Matt will remember from one
play.

**Level/sim**
1. **The Keeper on the boss framework** (6): phases at 7 and 4, the falling moths and the feed window, the swing and
   lit / unlit hunting, the fallen cage and sweep-feed, the partial releases, the retry restoring 120, tests, bots.
2. **The ending's sim** (7): the den's roof gate on the release as built, plus `denCollapse` as the **fallback M
   first** (groan and dust cues only, no hazard). The rubble gates and the slope route, `roostsLeft`.
3. **The opening's hooks** (1): `hatchTail`, the kin's try on `hatch`, the lip's vista and title moved, the promise
   zone.
4. **Moment 2's polish:** confirm a71e1ba's landing frame holds through the swirl.

**Render**
1. **The Keeper** (6): the intro's falling moth and snap, the moth-wing coat, the swinging light and sweeping
   shadows, lit from below, the low cloud and sweep, the cage's count as density, the death roll, the column into
   moonlight.
2. **The opening** (1): the close open on the presses, the swarm's shadows on the bark, the river keyed to `hatch`
   and to her x, the knots over the valley lights, the kin's failed flight.
3. **The vista** (7): the valley's lamps with knots, the hub's roost streams rising far off, the river round her
   glide, the kin; the caved den's moonbeam (behind the fallback's dust).
4. **Close-up art #1, stippled moss,** in the hub and the hatch.
5. **The kin's answer** at the first cage (2).

**Audio**
1. **The boss score** (6): intro, the three phases, the swing's pan and brightness, the last hit's silence, the
   release. One A/B clip of the bot's win.
2. **The theme and the opening** (1): the 3 s black open, the presses, the kin's try, the motif at the title, the far
   lamp hums at the lip.
3. **The vista** (7): the theme whole at the burst into moonlight, through the glide, on its open chord.
4. **The area's ambience** pass over the 27 rooms' `BEDS` with the Canopy's names; the firefly's voice (its glass
   pings and call rhythm) for the existing sightings.

### Round 13: the middle (the chase, the trap, the quiet) and the full escape

**Level/sim**
1. **The firefly's flight** (4): the upper gap's hooks on a falling S (fling-probe lines), the chase block keyed to
   her progress, the waits, the nest's end and the shaft, the claims, the never-out-of-frame test. Fallback: 3
   kindled lamps on the chain's line.
2. **The full escape** (7): rockfalls with tells, the collapse front, three checkpoints, climbs.ts at delays
   0 / 6 / 10.
3. **The trap is set** (5): `fills`, `trapFill`, `denStir` moved.
4. **Moonlight for two** (3): the crown's kin, `sit`, `kinSit`, the zone.

**Render**
1. **The chase** (4): the firefly at speed, the kindles and their threads, the lean and look, the nest's inside, the
   call at the shaft.
2. **The escape** (7): the falling earth, snapping columns, cracking floor, the cloud as the only light.
3. **The trap is set** (5): the far stream, the capture in step with `trapFill`, the slam.
4. **Moonlight for two** (3): the walk-over, the wings opening with the torn one short, the lean.
5. **Close-up art #2-5:** textured mid masses (the hub, well, Grove, den), silhouette life on the walked line (every
   route room), story litter (the den, warning, nest, under cages), strands and shafts (the clearing, crown, the
   den's skylight).

**Audio**
1. **The chase cue** (4): the call-rhythm ostinato keyed to progress, the kindles' growing out-of-tune chord, the
   dead stop and the unanswered call.
2. **The capture** (5): the moths' wings falling into the hum's beat.
3. **The duet** (3): Wing's motif and the kin's lilt in canon, ending her E over its D.
4. **The collapse** (7): rumble, hiss, root snaps, rockfall tells, the cloud's rush leading up.

### After round 13
A review against this doc, from Matt's run and a first-timer's journal (`firsttimer --world canopy`). For each
moment, the question is the one this doc began with: **would a player tell a friend about it?** A moment that passes
its clip but not that question gets reworked, not polished (`no-sunk-cost`).
