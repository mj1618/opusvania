# The Canopy, review round 18 (2026-11-01)

Reviewer brief: the goal is still Matt's: "a first area people will definitely remember". This review judges
memorability only:
- staged set pieces;
- close-up art;
- sound;
- the boss;
- a great first ten minutes for a human.

The build is canopy-play at edccee4 (round 18 merged). Rounds 15-18 had no review. Round 15 built r14's list (the
escape, the fair wave, the sit's beats, quiet moments). Rounds 16-18 were spent on the first ten minutes, driven by AI
first-timers (ft15fix to ft18c). The last score was 8.4 (r14).

Sources:
- the docs: `canopy-moments.md`, `memory/canopy.md` (v15-v18), `memory/canopy-render.md` (rounds 15 and 18), review
  r14;
- **played on the GPU** (the release worktree on port 5214, one `playwright-cli` session `rev18`, 1920 x 1080,
  `?world=canopy&fresh`). Screenshots are in the reviewer's scratchpad `r18/`:
  - **the opening**: from frame 0, one jump press, then by hand to the hub. I made the first fling at both flames
    myself (`o1`-`o8`, `h-*`);
  - **the hub's cage**: two standing cuts (`c1`-`c4`);
  - **the well's floor and its root door** (`w1`-`w3`), and **the fallen giant** and its juvenile (`t1`, `t2`), both
    reached by `goto`;
  - **the Lamp Grove**: looked at and walked into the pit, not fought (`g1`-`g3`);
  - **the Keeper**: r14's live controller (`rev14/ft.js`, real KeyboardEvents, a state 15 ± 3 frames old), fixed for
    r15's two-room escape. I ran it once as "reader", with a screenshot every ~3 s through the kill, the column and the
    escape (`k1/`, sheets `k1-a/b/c`), and once as "naive" (no escape). She had 4 lights, the claws and the glide;
  - **the chase**: by script in a frozen page. Each fling pressed 12 frames after its hook came into reach (5 frames
    once), the direction a person would hold (`ch0`-`ch11`);
  - **the sit**: real arrival into the glade (the glide's grant), then standing still, one screenshot per beat
    (`t-*`, `sit-sheet`, `sit-crop`);
- `escape-probe.ts --careful --lag=15` run headless, to separate the build from my live run;
- the references in `~/code/opusvania-refs/` (Silksong's Moss Grotto, HK's Crossroads), used only for comparison.

What I could not do:
- **Hear it.** The page runs muted under `?manual`, and no audio is judged by ear here. I only confirmed that cues
  route (`audio.cues`). Sound is the one pillar of Matt's goal this review cannot score.
- **Watch a person.** Still nobody has played the Canopy. The first-ten-minutes numbers below are agents' (ft18a-c).
- **Play the escape by hand.** My escape numbers are the builders' `EscapePlan`, driven live.

## The short version

**8.5 / 10.** The four set pieces r14 named have all moved:
- the escape now happens inside the frame;
- the wave hit the careful controller once, against six times in r14;
- the kin is a solid character that tries its wing;
- the first ten minutes went from "stuck 5 of 7 minutes" (ft15fix) to the cage in 0:20-0:40 and the Grove in 3-4 min
  (ft18a-c).

That is real progress. But the score barely rises, for three reasons:
- the **close-up art** of most rooms is where it was at r14 (flat card walls, decal larders, clip-art hills);
- I found **ruler-straight room tops with sky above them**, at the chase's peak and at the Grove's door;
- the answers rounds 16-18 added to the first ten minutes are **lights and rings that read as interface**, not as
  world.

The thing between this area and "definitely remembered" is no longer the AI-checkable list. It is a person.

What a player would retell today (unchanged from r14, and still true):
- **the Keeper**: it eats the moths you came to save; it rears, slams and lights all five eyes; in the dark it only
  sees you in the light; it rips the cage down;
- **the column**: the cage breaks, and the moths pour up a moonbeam with her small at its foot (`k1/0081`);
- **the hatch**: the cocoon among the split ones, the moon, the title, the first fling (`o5`, `o7`, `h-reach`);
- **the crown**: the pair on the limb's end against a moon that fills half the frame (`sit-sheet`).

What still stops it:
- **the frame breaks** at two of its best moments: the chase's top hook and the Grove's entrance;
- **the world reads as cut paper up close.** The den's back wall, the giant's interior and the Grove's mid plane are
  flat colour with a few decals;
- **the Keeper is still a wall for anyone who doesn't read the rage beat**: 6 fades in 4 min for the naive
  controller.

## The ten weaknesses of r14, re-checked

| # | r14 weakness | now | what I saw |
|---|---|---|---|
| 1 | The escape has no danger on screen | **better** | Zone at 1.0. The front is a dark mass of clods and torn roots ~200 px under her in the chimney (`k1/0092`, `0096`), and a falling rock is told by a lit cone with the rock in it (`k1/0084`). Headless probe, careful, lag 15: 13.9 s, front 220-444 px under her, no hits. Live (my run): collapse to the way out 7.1 s, to the clifftop 32.1 s, with 8 thorn hits and a fade (#6 below). In a still the front reads as dark ground, not as something rising: no lit rim, no dust above it, and the same near-black as the solids. |
| 2 | The slam's wave, unfair at the cage | **mostly fixed** | The tell is a red seam across the whole floor through the rear (`k1/0048`), unmissable. The reader took **1 wave hit** in one run (P3, 2 s in, "windup wave"), against 6 of 8 hits in r14. The naive controller took 5 wave hits in 4 min, all in P1. |
| 3 | The duet: nothing happens between them | **better** | The kin is solid now: dark brown body, pale face, about 0.8x her height (`sit-crop`). Its wing lifts on `try` and falls on `fail`, and the camera pushes in until the moon fills half the frame. Wing's answer is visible: her wings open wide (`s-fold`). But at play size the whole exchange is a ~60 px gesture between two figures **150 px apart**. The kin never comes to sit by her, and I can't read "torn" in the lifted wing. |
| 4 | The roof hole a blue star glyph | **fixed (as framed)** | At the column the beam runs off the top of the frame and no glyph shows (`k1/0081`). The column itself is the best frame in the area. |
| 5 | The chase a 3 s sequence | **unchanged in length, new problems** | Hook-1 to hook-7 at a 12-frame beat: **223 frames (3.7 s)**, 6.6 s to the call. Holding the stick down-left through the flight after a down-left press (what a hand does) missed hook-7 **3 times of 3**, at both a 5- and a 12-frame beat. Each fall put her back on the start shelf, not at a hook, with six hooks to fly again. At hook-3 the frame shows the room's straight top (#2 below). |
| 6 | A non-reader never leaves P1 | **unchanged** | The naive controller faded 6 times in 240 s and reached P2 once. Nearly every hit was a ram in the 15 s after the rage beat. The bridge ram (r15) did not change this. |
| 7 | Larder reads as wallpaper | **unchanged** | The niche is still a flat arch with five leaf decals on a flat brown wall (`k1/0003`). The floor band is litter at ankle height. The carcass after the kill is a flat orange-outlined bowl with three cartoon claws (`k1/0081`, `0084`). |
| 8 | Column moths sparkle | **better** | In the column they read as wings in a stream (`k1/0081`). Up close they are white paper chevrons, as are the hub's freed moths (`c4`). |
| 9 | The trap's back wall | **not checked** | I didn't visit the warning. The same flat triangle hills stand behind the Grove (`g2-wide`, `g3`). |
| 10 | Spell-breakers on quiet moments | **better** | The HUD is gone through the column (`k1/0081`). The glide's line still sits across the crown's moon frame as she arrives (`s0`), before the sit starts. |

Net: one fixed, one mostly fixed, five better, three unchanged or not checked. Round 15 did its job. Rounds 16-18
then turned away from memorability toward legibility, and the four items that are art or acting (#3, #5, #7, #9) were
barely touched.

## The Keeper, measured (live, real keys, lag ~15)

| run | controller | lock to kill | P1 / P2 / P3 | fight hits | where | kill → cage open | column alone | collapse → way out → clifftop | escape |
|---|---|---|---|---|---|---|---|---|---|
| 1 | reader | **105.8 s** | 28.4 / 34.8 / 41.1 s | 2 | P2 ram, P3 wave (2 s into P3) | 1.7 s* | 3.5 s | 7.1 s → 32.1 s | 8 thorn hits, 1 fade, 1 front hit |
| 2 | naive | **no win in 240 s** | P1, P2 once | 24 | fast rams after the rage beat, 5 P1 waves | | | | |

\* the controller knows where the cage is.

Against r14 (reader 86-128 s, 2-3 hits, P2 the longest at 52-56 s): the phases are now even (28 / 35 / 41 s), which
is a better shape. P2 no longer drags. The fight stands with False Knight and Moss Mother for structure. It does not
stand with them for **silhouette**: at play zoom the Keeper is a dark dome with five red dots and plank legs
(`k1/0042`). False Knight is a readable armoured body with a mace, from any distance.

## What is now memorable (keep all of it)

1. **The column** (`k1/0081`): unchanged, still the store-page frame.
2. **The hatch** (`o5`, `o7`): the split cocoons hanging under the moss-lit limb, the moon, LAMPFALL. The 1 s of black
   with her glimmer (`o1`) is a good, quiet start (slight banding rings in the glow).
3. **The first fling's tongue of light** (`h-reach`): the V cap, a ring and a short gold line show the way. I found
   and used the first flame in one jump. ft18b-c found it in 8.6-8.7 s from reach and flew in 11.6-15.4 s.
4. **The chase's S of lit hooks** (`ch8`): seven warm lamps up a hanging root mass, the firefly's green glow behind.
   It is beautiful at the moment you fall.
5. **The nest** (`ch10`): a green-lit shaft with the firefly's empty cages, the most "place-like" interior in the
   area.
6. **The wave's red floor seam** (`k1/0048`): clear, fair, and it turns the P3 cage scene into a readable dance.
7. **The crown push-in** (`sit-sheet`): the moon fills half the frame and the kin's wing goes up against it.

## The ten weakest things, ranked by how much they keep the area from being memorable

### 1. [render] Close-up art: most rooms are flat cards behind good silhouettes
**What.** The hatch and the hub's limbs are at the bar. Inside, the picture is a flat colour field with a few shapes:
- **the fallen giant** (`t1`, `t2`): a smooth orange gradient wall with three soft diagonal blobs, a ceiling of dark
  discs, and a teach wall like a birch post;
- **the den** (`k1/0003`): a flat brown wall with faint lines; the larder niche is an arch with five leaf decals;
- **the Grove** (`g2-wide`, `g3`): two teal triangle mountains behind the great tree, like clip art;
- **the Keeper's carcass** (`k1/0084`): a flat bowl with an orange outline and three cartoon claws;
- **the freed moths** (`c4`, `k1/0081`): white paper chevrons.

The director's plan §4 named five close-up changes (stippled moss masses, textured mid masses, silhouette life on the
walked line, story litter, moving strands and shafts). Four rounds later, none has been done as a pass.

**Why it matters.** "Remembered" is partly a screenshot. Silksong's Moss Grotto and HK's Crossroads hold a still
because every surface is made of small marks. Ours holds a still at the hatch, the crown and the column, and nowhere
else. It is the largest share of what people will see, and the least worked on since r12.

**Fix (render, one room at a time, in the order a person sees them: hub, giant, well, Grove, den):**
- **textured mid masses** in 2-3 depths, internal stipple at ≤ 10 luma contrast (keep look:check's air mean 45-70):
  - the giant's interior: rotten wood grain, beetle galleries, hanging fibre;
  - the den: packed earth with root hair;
  - the Grove: overlapping crowns, not triangles;
- **story litter at 80-150 px in front of the floor's edge** in the den: gnawed husks, old cages, dead wings. Same
  for the carcass: a real shell, split, with its legs folded, not a bowl;
- **moths as moths**: ≥ 12 px wings with a beat, two-tone, for the freed and the column's near layer.

**Check:** before / after pairs at each room's `shots` stops at 16:9 and 21:9, beside Silksong's `tut_01-03`. Count
marks per 100 px of walked top (plan §4: Silksong 25-40, ours 3-6).

**Owner:** render. **L**, but it splits per room.

### 2. [render / camera] The frame shows the room's top as a ruler line with sky above it
**What.**
- **The chase** (`ch5-rest3`): at hook-3, the hanging root mass and the left pillar end in a **straight horizontal
  edge** at the frame's top, with blue sky above. The zone's camera sits at y 694 at zoom 0.72, so the view's top is
  56 px above the room.
- **The Grove's entrance** (`g1`): arriving at (280, 496), the ceiling mass is a flat black slab from edge to edge,
  ruled straight at y 120, with sky above it. The camera's centre is at y 420 with a 1080 view.

**Why it matters.** The chase's top hook is the moment of the rush. It is where a player looks up for the next hook,
and the world visibly ends there. Art direction's first shape rule is "nothing rectangular". It is the one flaw a
stranger would spot in a ten-second clip.

**Fix:**
- **Camera:** clamp every zone and the follow camera to the room's top unless the room above is drawn. Or, for rooms
  under another room (the Grove under the bower, the gap), bake the neighbour's lower edge into the view.
- **Render:** masses that touch the room's top edge get a ragged, lobed crown when the view can see past it
  (`hang()` and the gap's root mass).
- **Check:** a sweep of every camera zone and every arrival spawn at 16:9, 16:10 and 21:9 that flags any frame whose
  top rows are the room's outside. That's a new `look:check` class.

**Owner:** camera, render. **S-M.**

### 3. [level + render] The first ten minutes' answers read as interface, and they're piling up
**What.** Rounds 16-18 answered every confusion with a light:
- **the root door** (`w3-knock-close`): a dark slab with two white slits and two glowing rings on knots, which reads
  as a sensor panel. All three r18 agents knocked and read "two round lights behind bars" (memory v18);
- **the seed door**: three black circles hanging in the air at the hub's west edge (`h-w4`, `c2`). All three r18
  agents said "three dark dots";
- the first flame's ring, tongue and cap (good: keep);
- a cage that rattles toward her;
- a rot sill that drips chips;
- a door that glows warm from beyond.

Each one alone is reasonable. Together they are the over-signposting Matt flagged in area 1 (`matt-playtest-area1`:
"AI testers made us over-signpost"). And the two that still fail, fail because they look like UI.

**Why it matters.** HK teaches its one-way doors with no light at all. You open the first one from its far side,
then meet the next one shut and know it. The first ten minutes are where Matt's goal says "great". They should feel
discovered, not annotated.

**Fix:**
- **Level:** the first root door she meets is met **from its opening side**. Put a short loop in the well or the hub
  that brings her to a knot and lets her cut it (a door swings open onto a place she has been). Every later shut door
  is then read without help.
- **Render:**
  - draw the door as roots lashed with silk: no slits, no ring glyphs;
  - the knot is a fat tied bundle of silk on the far side, seen through the gaps between roots;
  - drop the knock's rings;
  - the seed door's sockets become husks set into bark (as the lampoak's), not floating dots.
- **Rule:** no new signpost in rounds 19-20 without a human's confusion behind it.

**Owner:** level (the loop), render (the door, the sockets).

### 4. [sim + level] The chase is still a few seconds, and a natural hand drops you to the start
**What.**
- At a 12-frame beat with the right directions, hook-1 to hook-7 took **3.7 s** and the call came at 6.6 s.
- Pressing down-left at hook-6 and **holding** down-left (not the probe's one frame of down, then left) missed hook-7
  **3 of 3** times.
- Each miss put her **on the start shelf**, not at a hook (`ch8`: `fallReturn` at 3790, 1264, all seven hooks lit
  above her). memory v15 says a put-back hangs her at a hook, and it didn't here.

**Why it matters.** The chase is moment 4, retold for its rush. At 3.7 s it's a blink. A fall that sends you back six
hooks, for holding the stick the way you aimed it, is the kind of thing a person remembers as cheap.

**Fix:**
- **Sim:**
  - latch a fling's direction at the press, so a held down doesn't drag the arc;
  - or widen hook-7's catch window for a down-held arc. `chase-probe --beat` with a held-diagonal variant must reach
    the nest at 0-20;
- **Sim:** the put-back hangs her at the **last hook she reached**, as the contract says. Add a test for the fall
  from hook-6;
- **Level:** the second leg down the chain (deferred since r13), for 15-20 s of chase. Existing hooks, two rests.

**Owner:** sim (`lures.ts`), level. **S** for the first two, **M** for the leg.

### 5. [sim / tuning] The Keeper's P1 is still a wall for a player who doesn't read the rage beat
**What.** The naive controller faded **6 times in 240 s**, reaching P2 once. Its 24 hits were fast rams in the 15 s
after each rage beat, plus 5 P1 waves. That is r14's finding unchanged, and the builders' own (`keeper-react` naive:
44 hits in 5 min). The bridge ram is too small a step.

**Why it matters.** The reader proves the fight is fair to someone who learns. But "I couldn't get past the first
minute" is how a first boss gets remembered badly, and it's the first thing to ask Matt.

**Fix (sim, only if Matt's run shows it):**
- after a rage beat, the first **three** fast rams keep a 1.3x tell, not one;
- a fast-ram hit knocks her ≥ 400 px clear.

Hold this until his run. If he reads the beat, leave it.

**Owner:** sim (`keeper.ts`), tuning. **S.**

### 6. [render + level] The escape is in frame now, but its threat is the same dark as the ground
**What.**
- The front in the chimney (`k1/0092`, `0096`) is a near-black mass with darker clods and thin roots. It sits about
  200 px under her, the right distance.
- But it has no lit rim, no dust or chunks breaking off its top in a still, and the same value as the solid masses
  beside it. It reads as more ground.
- Live, the builders' `EscapePlan` jumped from rest W into the thorns on the chimney's east face at (1240, 993)
  **8 times** and faded once. That made a 32 s escape.
- The headless probe at the same settings passes in 13.9 s with no hits. So this is a live-timing miss, not a broken
  route. But a row of thorns on a wall you kick off with the earth under you is where a person will also eat hits.

**Why it matters.** "I barely got out" needs the threat to be the brightest moving thing under her.

**Fix:**
- **Render:** the front's top as torn earth lit from above (the column's cold light), chunks thrown up and falling
  back, dust boiling above it, a rumble shake that grows as it nears;
- **Level:** take the thorns off the chimney's kick face at (1240, 993), or make them a visible lit bed she can read
  before the kick. The escape's danger should be the earth, not a spike row;
- **Check:** `escape-live.ts` three times at lag 15 with 0 thorn hits.

**Owner:** render, level. **M.**

### 7. [render] The sit acts, but too small and too far apart
**What.** The beats play (`kinBeat` come → lean, ~13 s) and the push-in works. But:
- the kin stands ~150 px from her the whole time; "come" doesn't bring it to her side;
- the wing's try is a ~60 px lift on a brown blob at play zoom (`sit-sheet`);
- I can't read the tear.

**Fix (render, `character/tatter.ts`):**
- `come` ends shoulder to shoulder (≤ 50 px);
- the push-in goes to ~1.6 on the pair at `try` and holds through `answer`;
- the torn wing has a visible missing piece cut against the moon (it is backlit: use that), and trembles before it
  fails.

**Check:** one crop at `try` where a stranger says "its wing is torn and it tried".

**Owner:** render. **S-M.**

### 8. [render] The Keeper's silhouette
**What.** At play zoom it reads as a dark dome with five red dots on flat brown plank legs (`k1/0042`, `0048`). The
shell's texture is cut-paper leaf decals.

**Why it matters.** The boss is the area's most retold thing. False Knight and Moss Mother are drawable from memory.

**Fix (render):**
- one strong silhouette feature: the larder's cages and wrapped moths **strapped to its back**, so its story is its
  shape;
- jointed legs with hooks;
- a lit underside when it rears.

**Owner:** render (enemies). **M.**

### 9. [render / HUD] The glide's line across the crown's moon
**What.** "Your wings have dried. Hold jump as you fall to glide." sits across the moon as she arrives (`s0`). The sit
starts ~2 s after she stops.

**Fix:** show the line on the glade's trigger, then hold it while `quiet` is `sit`. Or move it to after she leaves
the limb.

**Owner:** render (prompts). **S.**

### 10. [render] Small things
- **The opening's glimmer** shows banding rings in its radial falloff (`o1`). Dither it.
- **The hatch's first gap**: holding right off the limb's end at 1,976 dropped me into a catch and back three times
  before I jumped. The next limb is in frame (`h-run3`) and the catch is quick, so it's fair. Watch whether Matt
  does the same.

## Round 19: the build list

The order:
- **fix the two frame-breakers** (the room tops, the chase's put-back and held arc), small and sure;
- **then the first close-up pass** on the rooms of the first ten minutes;
- **put the build in front of Matt before anything else lands.**

**Camera / sim / level**
1. **Room tops** (#2): clamp to the room's top or draw past it, plus the new look:check class. **S-M.**
2. **The chase** (#4): the fling's direction latched at the press, the put-back at the last hook, the held-diagonal
   probe. **S.** The second leg only after Matt plays.
3. **The escape's thorn face** (#6): off the kick face, or lit; `escape-live` three times with 0 thorn hits. **S.**
4. **The first root door met from its opening side** (#3): one short loop. **S-M.**

**Render**
1. **Close-up pass, first ten minutes** (#1): the hub's clearing and the giant's interior first. Textured mid masses,
   silhouette life on tops, moths with wings. **L** (one room per sub-lane).
2. **The root door and seed sockets as world, not UI** (#3). **S.**
3. **The sit closer** (#7) and **the glide line held** (#9). **S.**

**Audio:** not judged by ear. The next reviewer should render the column, the escape and the sit with
`audio.render()` and listen, because sound is one of Matt's five pillars and no review has scored it since it
shipped.

**Defer**
- **The Keeper's P1 tuning** (#5) until Matt's run.
- **The Keeper's silhouette** (#8) to round 20 (after the first-ten-minutes art).
- **No new signposts** in the first ten minutes until a human is confused by something.

## Stepping back as a director

**Is it time for Matt's playthrough?** It was time at r14, and it's overdue now. r14 said "playtest now, alongside
round 15". Four rounds later nobody has played. Three of those rounds went to AI first-timers' confusions, and they
were answered with more glow:
- rings on doors;
- tongues of light;
- rattles, sills, warm doorways.

That is the exact loop `matt-playtest-area1` warned about: AI testers misread, we signpost, a person finds it obvious
and bland. The agents' numbers are now fine:
- first fling 11.6-21.8 s from reach;
- the cage at 0:20-0:40;
- the Grove at 2:50-3:49.

What remains is taste, and only Matt can judge it. **Freeze this build (edccee4) as the playtest build and have Matt
play from the hatch, recorded, before round 19's work merges.**

The questions for his run:
- **The first ten minutes:** what did he think the root doors and the three dots were? Did the glows help or nag?
- **The Keeper:** did the rage beat change how he jumped, or did P1 stop him?
- **After the kill:** what did he feel at the column, and did the escape feel like being chased?
- **The chase:** did he fall, and where did it put him back?
- **The crown:** did he stop, and what did he think the kin did?
- **Sound:** what did he notice, and what was missing?

**What should the next 2-3 rounds spend on?**
1. **Round 19: frame and fairness, plus the build in Matt's hands.** The room tops, the chase's arc and put-back, the
   escape's thorn face. All small and sure, and none of them change what he'll judge. Start the close-up pass on the
   hub and the giant in parallel.
2. **Round 20: whatever Matt's run says, first.** His notes outrank this list. If they don't redirect, spend the round
   on **close-up art**: the den (litter band, the carcass, the larder), the Grove's mid plane, and the Keeper's
   silhouette. Art is the pillar that has moved least since r12, and it touches every screenshot.
3. **Round 21: the long parts of the set pieces.** The chase's second leg (15-20 s), the escape's lit front, the
   sit's closeness. Then a full recorded human run of the whole area as the next review's evidence, not a bot's.

The single change that would most raise the area now isn't a feature. It's **Matt's hands on it**, then one honest
art pass on the rooms between the set pieces, so that the places between the moments look as good as the moments do.
