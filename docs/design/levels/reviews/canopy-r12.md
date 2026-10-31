# The Canopy, review round 12 (2026-10-31)

Reviewer brief: **the goal has changed.** Matt agreed the Canopy matches the four references (Hollow Knight, Silksong,
Nine Sols, Ori) on layout numbers and readability, and set a new goal: "let's make it one people will definitely
remember". So this review judges memorability, and nothing else:
- staged moments;
- the boss;
- close-up art;
- sound;
- whether a person would retell it.

It proposes no new layout measures. The build is canopy-play at f159e7c (round 12: 3f6d1ae and 2c2557c merged), the
plan is `canopy-moments.md`, and the last score was 7.5 (r10).

Sources:
- the docs: `canopy-moments.md`, `memory/canopy.md` (v12), `memory/canopy-render.md` (round 12), `memory/audio.md`,
  `first-area.md` (v12: the bots, ft12), `canopy-r10.md`;
- **played live on the GPU** (a release worktree on port 5214, a scratch Playwright page over `window.__game`,
  1920 x 1080):
  - the opening from boot, twice (standing, and running east at once);
  - the Keeper from the balcony, three attempts (below);
  - the release, the collapse, the slope and the way out's clifftop;
- the round's clips, cut into frame sheets: `r12-opening`, `r12-keeper-intro`, `-death`, `-release`,
  `r12-vista-1280x720`, and the to-den video `canopy-r12-to-den.mp4` (4:07-5:12);
- the references in `~/code/opusvania-refs/` (HK's False Knight chamber `view-Crossroads_10-30-33`, Silksong's Moss
  Grotto rooms). Boss sizes and lengths for False Knight, Moss Mother, Hornet 1 and Nine Sols' first bosses are from
  my knowledge of the games, not measured from files. Read them as rough.

How I played the Keeper: there is no way to react in real time through a tool call, so I played it as bursts of real
key input, deciding every 10-60 frames from the screen and the state (the sim frozen between bursts). That is easier
than real time: I never fumble a reaction. To bracket it from the other side, I also ran a reactive controller with a
person's lag (8 and 15 frames) over real keys. Nothing was teleported or skipped once I was on the balcony. She had 4 lanterns (a fresh save given the claws and
the glide); a first-timer arrives with 5-6, so my runs are the harder case.

What I could not do: **hear it**. The page ran `?manual`, which stays silent, and I can't listen anyway. Audio is
judged from `memory/audio.md` and the plan. **No person has played round 12 yet**, and the plan makes Matt's run the
gate.

## The short version

**7.8 / 10.** The area now has a beginning, a climax and an ending you could describe to someone. But the climax is
over in 25 seconds, before any of its ideas can sink in.

What a player would retell today:
- **the Keeper eating a moth that fell out of the great cage**, seen from the balcony before the drop;
- **the den going dark around a swinging lantern**, and the Keeper losing you in the shadow;
- **the column of freed moths rising** out of the den;
- **the clifftop**: moon over the mountain, the kin on the far cliff, the glide out.

What stops it being retold:
- **The fight is short and soft.** My best run took 25 s from the first ram to the kill: P1 ~6 s, P2 ~4 s, P3 ~14 s.
  I took 2 hits, both my own carelessness. P2, the swinging light (the den's best picture and the plan's twist), was
  shorter than one swing of the cage. P3's "kill it or free them" was free: I cut the fallen cage three times while
  the Keeper was still rearing, and freed 84 moths for nothing.
- **The den's back wall is a flat brown card.** It's two banded hills and pale light shafts. In P3 it's the same card,
  only darker.
- **The moth river doesn't read as moths.** Over the hatch it's black flecks against the sky, like birds or bats. At
  the vista it's a dozen pale specks.
- **The middle is unstaged** (moments 3, 4 and 5 are round 13). Between minute 3 and minute 36 nothing is directed.

## What is now memorable (keep all of it)

1. **The intro's feed** (`clips/r12-keeper-intro`, my k3-k5). From the balcony at zoom 0.72:
   - the firefly circles the great cage and leaves;
   - one pale fleck drops out of the orbit and falls ~600 px;
   - a dark shape heaves up under it with five red eyes and takes it (`enemyFeed` f +431);
   - the eyes close again.

   It's the best storytelling in the area: you know what's down there and what it eats before you drop. It's
   wordless, and Nine Sols could have done it.
2. **The wake at play zoom** (f1). On the floor at zoom ~1.05 the Keeper is ~440 x 230 px, with five red eyes, a
   spined dome and a pale crust. It's ~2x her height and fills a fifth of the frame: a real presence, more than the
   director's frames suggested.
3. **The eat window** (g1). Head down over the moth, jaws working, its back to the light. It reads as "it's eating,
   hit it" with no tell glyph.
4. **P2's dark** (f3). The cone of the swinging cage on the floor, and the room black outside it. When I stood in the
   shadow it walked slowly to where it last saw me, and a cut from behind landed. It's the right idea and the
   strongest image in the area. It just doesn't last.
5. **P3's low cloud** (g3, g4). The fallen cage glows on the floor with moths spilling round her ankles, lit from
   below. It's beautiful at play zoom.
6. **The death and the column.** It rolls onto its back, legs up, and lies still: no burst, as planned. Then one cut
   on the cage, a held beat, and the column rises straight up (r3). "A new light kindles." and the fifth lantern.
7. **The opening, standing still** (`r12-opening`, o1-o5). 3 s of black, then the cocoon row at 1.5. Each press
   widens the frame a step (1.5 → 1.39 → 1.12 → 1.03, measured). The moon fills in, and LAMPFALL fades in under it.
   The kin's hop after the swarm reads at last (44 px). It has the restraint of HK's King's Pass.
8. **The clifftop** (v1, the vista clip). Moonlit, the mountain, the kin on the far cliff as a small grey shape. It's
   the area's most composed frame.
9. **The valley's false lights** under the first fling: warm glows with moths knotted round them, seen through the
   giants. It's the premise in one image, the way the plan wanted.

## The Keeper against the references

| | HK False Knight | Silksong Moss Mother | HK Hornet 1 | Nine Sols' first bosses | **the Keeper (r12)** |
|---|---|---|---|---|---|
| size on screen (height, play camera) | ~30% (≈3.5x the Knight), more with the mace | ~35-40%, rises out of the floor | ~10% (≈1.3x the Knight) | human-sized duellists, large in their big moves | **~21% at zoom 1** (≈2x Wing); **11% in the intro** (zoom 0.72); low and wide, it never stands tall |
| arena framing | a dressed chamber: drapes, three tall windows, a floor band of shells (`view-Crossroads_10-30-33`) | the moss the area is made of, piled to the roof | a corridor ending in a clearing | a designed set with lit structures | three root columns and two shelves over **a flat brown card** |
| phase readability | 3 obvious beats: armour, head exposed, the floor gives way | it rises, its brood joins, it sinks | one moveset, faster with damage | a read per move (parry, unblockable) | **clear** (it eats; the light swings; the cage falls), but each phase is gone before it can be learned |
| length for a first-timer (rough) | 1.5-3 min a try, 1-3 deaths typical | 1-2 min a try | 1.5-2 min a try, several deaths typical | 2-4 min, several deaths | **25 s** my clean run; the bots 38-62 s; 12/12 bot wins, 0-2 hits |
| the turn | the maggot in the armour | it's the area | she talks, she leaves | the person behind the boss | **it eats the moths you came to free**: strong, and seen in the intro |

The idea is as good as any of them. The fight under it is the shortest of the five by a factor of 3-6.

## What I played

**The opening, standing (o1-o5).**
- Frames 0-210: black. 211-311: three presses (the third at f 311 breaks it).
- The pips "○○○" under the cocoon are the only feedback for a press. ft12 complained that the black "didn't respond
  to jump for a couple of seconds", and in the black there is still nothing.
- The close frame at 1.5 isn't a close-up: the cocoon is ~40 px tall and she is a speck on a long branch. The plan's
  "close frame on her cocoon among split ones" would need ~2.5-3x.
- The swarm's shadows are dark flecks moving across the sky, not shadows on the bark (render's own "weak still").
- At f 460 LAMPFALL fades in under the moon. Standing, it's lovely.

**The opening, running (t1-t3).** I broke out and held right at once, as the hatch's first gap teaches:
- **The title never appeared.** At f 455-601 the moon is at the frame's top right behind the leaves, and the title
  (a26ebe5: "the title goes with the moon's disc") goes with it.
- **The river reads as a flock of black birds** above the branch: dark silhouettes, no pale wing, no glow.
- I fell at the gap once.
- By the time I reached the promise zone (f 830) the river's tail had already left (`hatchTail` 480 frames after the
  break), so **the lip's reveal showed lights with knots and no river pouring into them.** A first-timer who falls
  once or twice will always see it this way.

**The Keeper, attempt 1** (bursts, my play; f 1,251 lock):
- The intro played as built.
- I dropped to the floor and stood by the west wall. Windup 44 frames (very readable), charge 9.6 px/f. I jumped it
  and landed on the shelf, dropped behind it in recover and cut twice (10 → 8).
- Second ram: jumped, cut once (→ 7). P1 ended at f 1,748: **6.8 s after it began, one moth dropped.**
- I caught that moth with a jump (`mothSaved`). It was easy: it falls at 3 px/f and the Keeper was curling.
- P2: windup 28 frames, charge ~16 px/f. Jumped, cut twice from behind (→ 5). Then I handed it to the 12-frame
  controller, which took a ram, cut the cage, ate three ram hits in P3 and **faded at the Keeper's last hit point**
  (f 2,725, 23 s in). The retry puts her on the balcony with the cage full, 4 s from the floor. That's fair.

**Attempt 2** (the 15-frame controller with catches): faded in P2 after 14 s, 4 hits, all rams it didn't jump. A
person who hasn't learned the burrbacks' "jump the ram" will lose here. That's right for a first boss.

**Attempt 3** (bursts, my play, start to finish; P1 at f 12,269):
- **P1 (5.7 s):**
  - Ram 1 jumped, two cuts on the recover (10 → 8).
  - Ram 2 jumped, one cut (→ 7).
  - One moth dropped, during the curl.
- **P2 (3.6 s):**
  - It went for the moth and ate it, head down. Two cuts from behind (→ 5).
  - A third was blocked. Ram jumped, one cut (→ 4).
  - The cage swung through less than one period (252 frames).
- **P3 (14 s):**
  - The cage fell beside me. Three cuts in 46 frames, **while the Keeper was still rearing 350 px away**: 84 moths
    freed, guard and pressure absent.
  - Its slam sent a floor wave 2,000 px that hit me while I cut (my only fair hit).
  - A long P3 ram (640 px) left it too far to punish. A sweep's eat window gave two cuts (→ 1).
  - A recover cut from in front was blocked.
  - The 8-frame controller finished it: one more hit taken, killed at f 13,753.
- **Total: 24.7 s from the first phase to the kill, 2 hits, 84 saved, 32 left in the cage (116 freed), 4 eaten.**
- It never felt dangerous after the first ram. The tense moment was the P3 slam's floor wave, which I didn't see
  coming because I was looking at the cage.

**The release to the vista:**
- The cut at f 13,951 starts a held beat (90 frames).
- `denCollapse` groan +100 and dust ×3 follow. The rubble appears at +330 as six clod steps up the east end.
- Two running jumps a step, and I was in `cn-out` at f 14,665: **12 s from the cut, 7 s of it waiting.** The
  "escape" is a staircase after a pause.
- The moonbeam down the shaft is a faint pale band; in the clip it reads as fog, not moonlight.
- The clifftop frame is good. The river round her glide (`r12-vista`) is a scatter of fine pale specks across the
  sky, thinner than the cloud that left the den.

## The ten weakest things, ranked by how much they hurt memorability

### 1. [sim] The Keeper is over in 25 seconds, and its phases end before they're learned
**What.**
- 10 hp, two cuts per window, P2 at 7 and P3 at 4.
- A player who jumps the ram gets ~2 hits a ram.
- **P1 is two rams and one moth. P2 is one ram and one eat, less than one swing of the cage.** P3 is the only phase
  with time in it.
- The bots' 38-62 s and my 25 s are the same story.

**Why it matters.**
- People retell a boss they struggled against, and the moment it turned. False Knight's head coming out of the armour
  is remembered because you fought the armour for a minute first. Hornet is remembered because she killed you three
  times.
- The Keeper's twist, the dark is safe, needs time to be discovered: the player has to be seen, be hit, hide, and
  realise it. At 3.6 s that never happens.

**Fix (sim, `src/sim/boss/keeper.ts`, `t.keeper`):**
- **Phases end on time and hits, not hits alone.** P1 ends at 7 hp *and* after ≥ 2 moth drops. P2 lasts ≥ 2 full
  swings (≥ 504 frames): while lit, the Keeper's dome glances every cut (the P2 rule becomes "only the dark lets you
  hurt it"), and only a cut from the dark or in an eat window lands. P3 ≥ 3 sweeps.
- **HP 10 → 16** (6 / 5 / 5 a phase), and **1 cut a window in P2's lit time** (2 in an eat window or from the dark).
- **One new move a phase:**
  - P1 keeps the honest rams.
  - P2: a lunge at the light's edge when the swing brings her into it (it waits in the dark at the cone's rim).
  - P3: the sweep reaches her if she's in the cloud, and the rams are shorter but come in pairs.
- **Target:** an attentive first-timer at 70-110 s a try and 1-2 deaths on average. The bots' bar changes to ≥ 8 of
  12 wins, 60-120 s, ≥ 2 hits a casual run. Matt's run decides.

### 2. [sim] The choices cost nothing, so they aren't choices
**What.**
- P1's moth catch is a free jump during the curl.
- P3's cage takes its three cuts in the 60 frames of the rear, with the Keeper 350 px away: I freed 84 for nothing.
- The eaten count doesn't change anything you see: 4 eaten of 120.

**Why it matters.** The plan's last and biggest piece of density ("kill it or free them first") is the beat a player
would argue about with a friend. Right now there's nothing to argue about.

**Fix (sim):**
- The fallen cage is guarded until the Keeper's first sweep (it lands with its bars under the Keeper's claws).
- A cut on the cage turns the Keeper on her at once: it protects its food, with a short ram aimed at the cage's side.
- Sweeps eat 6-8, not 3, so the low cloud visibly halves after two.
- P1 drops two moths, one of them over the ram's line, so a catch means jumping into its path.
- Show the result: the column's density at the end is `left + saved`, and the HUD's count ticks once per moth in the
  column.

### 3. [render] The den's back wall is a flat brown card
**What.** Confirmed at every stop (k2-k5, f1, g1-g6, r1-r5): two banded umber hills, pale vertical light bands and
two arched burrow mouths, all one flat plane. In P3 and after the release it's the same card, darker. The light's
swing moves the columns' shadows across it, which shows how much a textured surface would gain.

**Why it matters.** The boss room is the area's last interior and its most watched frame. HK's False Knight chamber
(`view-Crossroads_10-30-33`) is the most dressed room of the Crossroads: patterned drapes, three tall leaded windows,
a floor band of shells. Silksong's Moss Mother rises out of the material of the room itself.

**Fix (render, `src/render/scene/` den look, close-up #2 and #4 done here first):**
- A **larder wall**: earth packed with root hair and stones in 2-3 depths, internal stipple ≤ 10 luma contrast, air
  mean held at 45-60.
- **Story litter** on the floor and the near banks: drifts of dead moth wings under the cage's old place, gnawed
  husks, the shells of older cages.
- **Shapes the swing's shadows can fall across**: root ribs and hanging roots. The P2 shadow sweep is the payoff.
- After the collapse: a moonlit rubble face, not the same card in brown.
- **Check:** before / after at the intro stop, the floor stop and the P2 stop, at 16:9 and 21:9, beside the HK
  chamber; `look:check` air and solid unchanged.

### 4. [render] The Keeper doesn't own the frame where it matters
**What.**
- At zoom 1 on the floor it's ~21% of the frame's height (≈2x Wing). That's fine, and bigger than the director's
  frames suggested.
- But the intro runs at 0.72, where it's **11% of the height**: a lump under a lantern twice its apparent size.
- It's low and wide in every pose. Even its rear never stands taller than the shelves.
- The coat is pale specks, not wings (render's own note), and the fallen cage stands upright and unbent.

**Why it matters.** False Knight and Moss Mother are a third of the screen. The image people keep is the boss's
silhouette at its biggest, and the Keeper has no big pose.

**Fix (render, `enemies/` and `camera/`):**
- **The intro's snap gets a camera push**: zoom 0.72 → ~1.0 toward the floor on `enemyFeed` for ~1.2 s, then back. The
  heave fills a third of the frame.
- **A tall rear** for P2's start and P3's rip: the front half rises to ~3x her height, eyes over the shelves, the cage
  in its claws. A boss pose, not a beetle's.
- **Draw the body 1.3x** over the sim box, so the dome's spines and legs reach out past it. Keep the hurt box honest:
  only the dome hurts.
- The coat as **wings**: 12-20 large pale wing shapes 20-40 px, not 64 specks.
- The fallen cage **on its flank, bars bent open** on the spill side.

### 5. [render] The moth river reads as birds over the hatch and as dust at the vista
**What.**
- At the hatch (o6, t1-t3) the river and its "shadows" are black silhouettes against a mid-blue sky: crows or bats.
- At the vista the river is a scatter of fine pale specks, with no stream shape.
- The game's premise is a migration of moths, and its two biggest images don't show moths.

**Why it matters.** The river is the opening's image and the ending's payoff ("in the river at last"). Ori's light,
HK's infection orange: the premise has to be legible in the sky.

**Fix (render, `swarm/`, `lantern/vista-river.ts`):**
- **Moonlit wings**: a pale rim on the moon's side and a flicker of wing-catch (bright on the downstroke).
- A density floor (≥ 400 in frame over the hatch, ≥ 200 round her glide) regardless of the count. The count scales
  above the floor.
- The swarm's shadows on the bark, not in the sky, or cut.
- **Check:** at the hatch's breakout frame, ≥ 60% of the river's moths have a pixel ≥ 120 luma.

### 6. [render + sim] The opening loses its title and its river for anyone who moves
**What.**
- Breaking out and running east (the natural thing) puts the moon behind the leaves at the frame's top right, and
  the title goes with it: **no LAMPFALL at all**.
- The river's tail leaves 8 s after the break, so a player who falls once reaches the lip's reveal with an empty sky.
- In the black, nothing answers a press.

**Why it matters.** The first minute is a third of what people remember from a single play.

**Fix:**
- **Render:** the title in screen space under where the moon is (or at the top centre) for 2.5 s after `titleAfter`,
  whether or not the disc is in frame. The opening's camera holds the moon in frame until the title has faded.
- **Sim:** `hatchTail` keyed to her progress along the branch, not frames (the plan's "keyed to her x"): the tail
  leaves the lip when she reaches the promise zone, or after 30 s.
- **Audio + render:** in the black, a press gives a dry silk crackle and a faint crack of light in the dark.

### 7. [sim + render] The ending is 7 seconds of waiting, then a staircase
**What.** From the release:
- 90 frames held;
- the groan;
- three dust cues;
- the rubble at +330 (5.5 s);
- six 128 px steps.

You're on the clifftop 12 s after the cut. The moonbeam down the shaft is faint. Nothing is at stake.

**Why it matters.** This is the plan's Ginso (moment 7), in its fallback form. The fallback is now longer than the
fight's P2.

**Fix:** the full escape is round 13 (below). Until it lands:
- **Sim:** the rubble at +150, not +330.
- **Render:** the moonbeam as the brightest thing in the den once the roof opens (a cool shaft, dust lit in it, the
  column's moths silvered as they enter it).

### 8. [level] The middle of the area has no staged moment
**What.** Moments 3, 4 and 5 are unbuilt. From the first cage (~2:30) to the den's warning (~36) the Canopy is the r10
area: good play and the Grove's gates, but nothing directed.

**Why it matters.** The plan's rhythm (loud, quiet, the chase, unease) is what makes the climax land. Without the duet,
the boss has no quiet before it. Without the chase, the firefly is a glow seen three times.

**Fix:** round 13's list (below), as the plan has it.

### 9. [audio] Nobody has heard the boss, the opening or the vista
**What.**
- Sound is on by default since 5736e23.
- `b501300` scores all three. The P2 idea, the hum's pan and brightness following the swing and a muffle when she's
  unseen, is the sound idea most likely to be retold.
- I couldn't hear any of it, and Matt hasn't judged it.

**Why it matters.** Half of what makes HK's False Knight and Ori's escapes stick is their music. A muffle that tells you
"it can't see you" only works if P2 lasts long enough to hear it (#1).

**Fix (audio):**
- Retime the boss score's P2 to the longer phase.
- The A/B clips Matt asked for (`npm run clip -- --audio --ab`): the opening, the Keeper's win, the vista.
- Then the plan's round-13 cues.

### 10. [render + level] Small things that break the spell
- "A new light kindles." sits over the release column and the carcass (r1-r2). The kindle line should wait until the
  column has left the frame.
- The intro's falling moth is a fleck of a few px at 0.72, easy to miss against the lit cage. Make it 14-18 px, and
  give it a pale trail so the eye finds it.
- The first ram's windup (44 frames) and P2's (28) read well. P3's slam floor wave (2,000 px) has no visible tell
  while she's at the cage. Give it a dust line along the floor.
- A cut on a recovering Keeper's front is blocked even though it's "open". That's right for the rule, but unreadable:
  flash the braced front amber on a block.

## Round 13: the build list

The order is the plan's (moments 3, 4, 5 and 7's full escape), with **the Keeper's fix first in each lane**. It is the
climax, the plan's own clip bar ("a first-timer's") hasn't been met, and it's cheaper than any new moment.

**Level / sim**
1. **The Keeper's length and bite** (#1, #2). Phase gates on time, 16 hp, P2's lit glance, one new move a phase,
   the cage guarded until the first sweep, a cut on it turns the Keeper, bigger sweeps, two P1 drops. The bots
   re-tuned to 60-120 s. **S-M.**
2. **The firefly's flight** (moment 4) as planned, with its fallback. **L.**
3. **The trap is set** (moment 5): `fills`, `trapFill`, `denStir`. **M.**
4. **Moonlight for two** (moment 3): `sit`, `kinSit`, the zone. **S.**
5. **The opening's river keyed to her progress** (#6). **S.**
6. **Defer the full escape** (rockfalls, collapse front, checkpoints) to round 14. This round, only the rubble at
   +150 (#7). A longer, harder boss buys more memorability than a 25 s escape after a 25 s boss. Revisit once Matt
   has played both.

**Render**
1. **The den** (#3, #4): the larder wall and story litter, shapes for the swing's shadows; the Keeper's tall rear, the
   intro's camera push, the body at 1.3x, wings for a coat, the cage on its flank. **L.**
2. **The river reads as moths** at the hatch and the vista (#5), and the title in screen space (#6). **M.**
3. **The chase** (moment 4). **L.**
4. **The trap is set** (moment 5) and **the duet** (moment 3). **M.**
5. **The moonbeam** as the den's brightest thing after the roof opens (#7). **S.**
6. **Defer:** close-up #3 (silhouette life on every walked line) and #5 (strands and shafts) outside the den and the
   crown. **Cut:** the swarm's shadows in the sky if they can't be made to fall on the bark.

**Audio**
1. **Matt's A/B listen** of the opening, the Keeper and the vista, before anything new.
2. The boss score retimed to the longer phases, with the P2 muffle checked against the swing.
3. The chase cue, the capture (moths falling into the hum's beat), the duet.
4. **Defer** the collapse's cues with the full escape.

**The gate is still Matt's run from the hatch.** Every moment above should be judged on it first. The question for
each: would he tell someone about it?
