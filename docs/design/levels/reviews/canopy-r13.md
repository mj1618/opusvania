# The Canopy, review round 13 (2026-10-31)

Reviewer brief: the goal is still Matt's: "let's make it one people will definitely remember". This review judges
memorability only:
- staged moments;
- the boss;
- close-up art;
- whether a person would retell it.

It proposes no new layout measures. The build is canopy-play at eebde32 (round 13 merged: the Keeper r13, the den's
larder, the chase, the trap, the sit, the river and title fixes). The plan is `canopy-moments.md`, and the last score
was 7.8 (r12).

Sources:
- the docs: `canopy-moments.md`, `memory/canopy.md` (v13), `memory/canopy-render.md` (round 13), review r12;
- the round's clips, cut into frame sheets: `r13-keeper-intro`, `-p1`, `-p2`, `-p3`, `-death`, `r13-hatch-river`,
  `r13-vista`, `r13-chase` (`r13-keeper.mp4` ignored: a take without the creature), and `shots/canopy-r13-render/`
  (the den before / after at 16:9, 16:10, 21:9);
- **played live on the GPU** (the release worktree on port 5214, a scratch Playwright page over `window.__game`,
  1920 x 1080):
  - the opening from boot, standing and then running east;
  - the Keeper from the balcony: one full fight played by me, plus three real-key runs by a reactive controller;
  - the release, the rubble and the climb to the clifftop, the vista and the glide;
  - the chase, twice (once as a person presses, once on the builders' proven line);
  - the crown sit;
  - the trap filling at the den's warning;
- the references in `~/code/opusvania-refs/` (HK's False Knight chamber `view-Crossroads_10-30-33`). Boss lengths
  for the references are from my knowledge of the games, not measured. Read them as rough.

How I played the Keeper:
- **My run.** Bursts of input, deciding every 10-60 frames from the state and the screen, the sim frozen between
  bursts. I held myself to a person's lag: I acted on a tell no sooner than ~15 frames after it began. That is still
  easier than real time, because I never fumble a reaction.
- **The controller runs.** A small controller of my own (not the builders' den plan) pressed real `KeyboardEvent`s in
  a realtime page, deciding from a state 12-18 frames old. It knows what the burrbacks teach (jump a ram, cut what is
  open or eating, keep some distance, catch a moth that falls near, cut the fallen cage when the Keeper is far). It
  doesn't know P2's lit rule, the sweep's claws or the slam's wave. It is crude. Read its runs as a lower bound, not
  as a person.
- She had 4 lanterns (a fresh save given the claws and the glide), so these are the harder case.

What I could not do:
- **Hear it.** An audio pass is running in parallel. Sound is not judged here.
- **Watch a person play.** No person has played round 13 yet, and none has played the chase or the sit.

## The short version

**8.1 / 10.** The Keeper is now a fight a person would retell: 70 s, three hits, one lantern left, and a turn you
feel. But the area still drops its two payoffs: the freed cage after the kill, and the kin's wings at the crown.

What a player would retell today:
- **the Keeper.** "It eats the moths that fall, and when the cage swings it can only see you in the light." Then
  it rips the cage down and eats them by the claw-full, and every cut on the cage turns it on you;
- **its rear**: legs up, taller than the shelves, eyes over you (`a2-slam`). At last a boss silhouette;
- **the six hooks catching fire** across the gap as the firefly bolts, and flinging up through them;
- **the opening's run**: LAMPFALL now shows for a runner, and the river over the branch reads as pale moths;
- **the glide inside the river** at the vista.

What stops it being retold:
- **After the kill, the cage is hidden under the carcass.** The release is a thin dotted line, with "A new light
  kindles." written over it.
- **P3 lies to you.** The sweep's tell is the same head-down pose that meant "free hits" in P1 and P2. Every
  controller run died to it.
- **The duet isn't visible.** The kin is a 35 px beige lump beside her. No wing opening was visible in any frame
  I took, and the camera didn't move.
- **The chase is 6 seconds,** and pressing a lamp the moment it is in reach breaks its last fling. That is what
  people do.

## The ten weaknesses of r12, re-checked

| # | r12 weakness | now | what I saw |
|---|---|---|---|
| 1 | The Keeper over in 25 s | **fixed** | My run: 70.5 s from the lock, P1 28.8 s, P2 23.0 s, P3 18.8 s, 3 hits, 1 lantern left. Controller runs: never past P1 (reacting to the charge), or P3 on every try then a fade (jumping in the tell). The builders' look-ahead bots 53-79 s, and ft13den ~100 s with 2 hits. It now has new readability debts (#2, #3, #7 below). |
| 2 | The choices cost nothing | **better** | The fallen cage stays guarded until the first sweep. A cut on it brings a guard ram (it cost me a lantern), and three sweeps ate 21. P1's catch is still free: the Keeper was 500 px behind me when I jumped for it. |
| 3 | The den's back wall a flat card | **better** | Now drape folds, niches of wrapped moths, ribs whose shadows the swing throws, old cages. At play zoom it reads as folds and ribs; the cells (~60-80 px) and the floor litter are specks. HK's chamber has 80-150 px shells along the floor band. |
| 4 | The Keeper doesn't own the frame | **fixed** | The snap pushes 0.72 → 1.08, and the Keeper fills ~a quarter of the frame. Drawn 1.3x, with a coat of wings, the rear pose and the cage on its flank. New: the rear shows a white belly slab (`p3-sheet`, `a5-p3`). |
| 5 | The river reads as birds | **fixed** | Over the hatch the moths have pale membranes, readable as moths in a crop. A few near ones are dark edge-on dashes. At the vista she glides through a pale cloud. |
| 6 | The opening loses its title for a runner | **fixed** (title, tail) / unchanged (close frame) | Running east from the break, LAMPFALL is in frame at f 450-510. The close frame at 1.5 still shows a ~40 px cocoon, not a close-up. A press in the black now counts and shows the pips. |
| 7 | The ending is waiting then a staircase | **better** | The rubble comes at +152. Cut to `cn-out` took 9.7 s, ~5 of it my walking. The moonbeam is the brightest thing in the den, but at play zoom it's a white blob on top of the steps (reads as a lamp). The rubble reads as a clean black staircase. |
| 8 | The middle unstaged | **better** | The chase, the trap and the sit all exist and fire. The sit doesn't read (#4), the chase is short and breaks (#5), and the trap reads weakly (#10). |
| 9 | Nobody has heard it | unchanged | Not judged; the audio pass is running. |
| 10 | Small spell-breakers | **mixed** | The block flashes amber (fixed). The intro's moth is 15 px with a trail (better, still hard to find at 0.72). The kindle line still sits over the column (unchanged). The slam's floor wave is still unreadable (unchanged; the builders say so too). |

## What is now memorable (keep all of it)

1. **The Keeper's length and turn.** My fight had a shape:
   - **P1:** two slow rams taught me the jump. Then two fast ones hit me.
   - **P2:** I learned the dark. The light swung back onto me at 289 px and it lunged at once. I jumped it, it
     recovered under the light and my cut glanced, then the light moved off and the same cut landed.
   - **P3:** I paid a lantern to free 36 moths, and finished on one lantern waiting for the third sweep.

   That is the arc a False Knight or Moss Mother fight has. It's the first fight in the area I'd describe to someone.
2. **The rear** (`slam-sheet`). Legs up, eyes over the shelves, ~2.5x her height. The pose the director asked for.
3. **The snap's push** (`intro-sheet`). The camera moves in as it takes the moth, then eases back by f 646. The
   intro is still the best storytelling in the area.
4. **P2's dark.** It sniffs where it lost you and turns slowly, and a cut from behind lands. With 23 s of P2 the
   player can discover it, as r12 asked.
5. **The hooks lit across the gap** (`c8`). After the chase all six hang lit, each with its own knot of moths. That
   is the premise drawn in passing: every light the firefly hangs gathers moths.
6. **The crown frame** (`k4`). Wing and the kin on the limb's end against a moon a third of the frame tall. It's
   the area's most beautiful still, even though the moment in it doesn't play (#4).
7. **The hatch's river and the title for runners** (`run-sheet`): pale wings over the branch, with LAMPFALL in
   frame.
8. **The vista's glide** (`vista-sheet` v4): her wings inside a cloud of pale moths, the moon and the mountain
   behind.

## The Keeper against the references

| | HK False Knight | Silksong Moss Mother | HK Hornet 1 | Nine Sols' first bosses | **the Keeper (r13)** |
|---|---|---|---|---|---|
| size on screen | ~30%, more with the mace | ~35-40% | ~10% | duellists, big in big moves | **~25% at the snap's 1.08**, ~30% in the rear |
| length for a first-timer | 1.5-3 min a try, 1-3 deaths | 1-2 min a try | 1.5-2 min, several deaths | 2-4 min, several deaths | **70 s** (my run, 3 hits), ~100 s (ft13den); a crude reactive player fades in P3 every try |
| phase reads | armour, head out, floor gives way | rise, brood, sink | one set, faster | a read per move | P1 and P2 **clear**; P3's sweep **misreads** as the eat window; P3's gate invisible |
| the turn | the maggot in the armour | it's the area | she leaves | the person behind it | **it eats the moths you came to free**, and in P3 freeing them provokes it |
| the payoff after | the maggot dies, the floor breaks | Bone Bottom's quiet | a door opens | a person | **the cage you fought for is under the carcass** |

The fight now stands with them in length and threat. What it lacks is the clean payoff after the last hit.

## The ten weakest things, ranked by how much they hurt memorability

### 1. [sim + render] After the kill, the payoff is hidden: cage under the carcass, a dotted line for a column, the line over it
**What.**
- The death roll leaves the carcass at x 1,913, over the fallen cage at 1,856 (`dead-sheet`). The cage shows only
  as a warm halo behind the shell.
- Nothing else in the frame moves or points. ft13den spent ~70 s lost here.
- When I cut it:
  - "A new light kindles." sat over the burst (r12 #10, unchanged);
  - the freed moths left as a thin dotted diagonal to the roof's east corner (`rel-sheet`), not the plan's column
    rising into moonlight;
  - the moonbeam is at the far east, over the rubble, not over the cloud.

**Why it matters.** The plan calls the column into moonlight "the whole game in one picture" and says it is never
cut. It's the last image of the fight people retell. Right now the fight's last image is a carcass and a search.

**Fix:**
- **Sim:**
  - the death roll ends ≥ 250 px from the cage (the carcass slides away from the cage on `enemyDie`);
  - camera zone `den-end` from `cn-den-down` until the release, leaning 40% to the cage at zoom ~1.1.
- **Render:**
  - after the kill, the cage's light swells to its P1 brightness, and what's left of its moths lifts to head height
    and circles (the "come here" without a sign);
  - the release rises **vertically** from the cage as a column at least 120 px wide, with a density floor that
    ignores the count;
  - the moonbeam falls onto the column (move the beam, or bend the column into it);
  - the kindle line waits until the column has left the frame.
- **Check:** a clip from the last hit to the column leaving: the cage visible in every frame, the column ≥ 3 s,
  no text over it.

### 2. [render + sim] P3's sweep reads as the eat window that meant "hit it"
**What.**
- In P1 and P2, "head down over moths" means open: cut it twice.
- P3's sweep starts in the same mode (`eat`) and the same pose (`p3-sheet`, bottom), and 36 frames later its claws
  (`keeperSweep`, ±170 x 150) hurt anyone in the cloud.
- In my run I waited at range because I'd read the memory notes. A player won't have.
- Both controller variants that reached P3 faded there on every try (8 tries), mostly to claws "while it ate", even
  the one told to stay out for the first 44 frames.

**Why it matters.** A death people blame on the game is remembered against it. HK's False Knight changes pose for
every move. Its tells are never the same as its openings.

**Fix:**
- **Render (`enemies/`):** a sweep tell that looks nothing like eating:
  - it rears its front half, claws raised and rimmed amber;
  - a lit arc is drawn on the floor where the claws will land (the ±170 box) through the whole tell;
  - dust lifts off the cloud.
- **Sim:**
  - sweep mode named apart from `eat`;
  - `sweepTell` 36 → 42, so a lag-15 person sees ~27 frames of it.
- **Check:** the controller that cuts anything eating no longer fades to the sweep after its first one.

### 3. [sim] P1's ram changes speed without telling you, and the first two rams teach the wrong timing
**What.**
- The first two rams of a life run at 0.6x with a 1.5x tell (42 frames, 9.6 px/f): `firstTellRams`. Jumping
  when it starts to charge clears them.
- From the third ram the tell is 28 frames and the ram 16 px/f, so the same jump lands in it.
- I took both my P1 hits exactly this way (f 1,969, f 2,436, both at ~390 px).
- The controller that reacts to the charge faded 12 times in 200 s and never left P1. The one that jumps in the tell
  reached P2 every time.

**Why it matters.** This is a lesson, but taught backwards: the slow rams reward a habit the fast ones then punish,
with no beat that says "it's angrier now". A first-timer feels cheated twice before learning to jump in the tell.

**Fix (sim + render):**
- Make the switch a visible beat. After the first moth falls in P1:
  - the Keeper rears and slams once (no wave);
  - all five eyes stay lit from then on;
  - only then do the rams speed up.
- Or ramp the tell across three rams (42 → 36 → 30) rather than one step.
- Render: the brace's depth reads the tell's length (a deeper crouch for the fast ram).

### 4. [render + sim] The duet doesn't show: the kin is a lump, and the camera never moves
**What.**
- `kinSit` fires after 120 still frames and she gets the beautiful frame (`k4`).
- But at the crown's 0.85 zoom the kin is a ~35 px beige-grey lump, half her height.
- In four frames from kinSit +20 to +320 (`kin-zoom`) neither its wing opening nor the torn wing was visible, nor the
  lean.
- The zone `crown-sit` is 0.85, which is the crown's zoom already, so nothing changes when it begins.
- render's own note: its wings are grey on a pale disc.

**Why it matters.** The plan calls this "the most optional and most retold thing in the area". A player who stops
for it sees two figures standing. Nothing happens, so nothing gets retold. Ori's Naru and HK's Elderbug scenes work
because the character fills the frame.

**Fix:**
- **Sim / zone:** `crown-sit` pushes **in** to ~1.3 over 2 s on `kinSit`, framing the pair and the moon's edge, then
  eases out when she leaves.
- **Render (`character/tatter.ts`):**
  - the open wings span ≥ 2x the kin's body;
  - a silver moon rim on the wing edges, so they read against both sky and disc;
  - the torn wing visibly half open for ≥ 1.5 s;
  - the lean held while she stays.
- **Check:** a crop at 1.3 where a stranger can say "its wing is torn".

### 5. [level / sim] The chase is over in 6 s, and its last fling breaks the way people press
**What.**
- On the builders' line (pressed when each hook is nearest), the bolt to the nest takes 343 frames (5.7 s).
- I played it as a person does: press the moment the next hook is in reach. The S held to hook-6. Its fling (aimed
  down-west, as the line wants) missed both chain lamps.
- She fell, and `fallReturn` put her back on the start shelf ~1,200 px east.
- Meanwhile the firefly reached its nest (f 373) and hung at the shaft's top for good (beat 4, no call) until she
  came back.
- The hooks stayed lit, so she can retry, but the dive into the nest happened off-screen without her.

**Why it matters.** A chase is retold for its rush. This one is a 6 s fling sequence, and a common way to play it
ends with a long walk back and a missed reveal. Ori's escapes are 1-2 minutes and restart you a few seconds back.

**Fix (sim / level):**
- The firefly waits at its last stop (over hook-6) until she has flung off it and landed. It never dives while she is
  falling.
- A fall in the chase returns her to the last hook she used, not the start shelf (a chase checkpoint).
- Make hook-6 → chain hold for an on-reach press (the chase-probe `--beat=0` case). Re-hang the chain's first lamp,
  or add a seventh hook.
- If the round has room: a second leg down the chain with two waits, for ~20 s in all.

### 6. [render] The slam's floor wave is still unreadable in the dark
**What.** At the slam (`slam-sheet`, bottom) the only sign is a little dust at its feet. The wave is invisible along
the floor. In the controller runs and ft13den it caused unexplained hits. It's the builders' own weak item, and r12
#10's.

**Fix (render):**
- A lit crack running along the floor at the wave's speed, with dust kicked up at its front, for the whole 2,000 px.
- A 12-frame flash of the floor's rim at the slam.

### 7. [sim + render] P3's rules are invisible: the gate, and a cut that hits both
**What.**
- **The gate:** at 1 hp the Keeper can't die until its third sweep. Cuts glance (`keeperGlance gate`) with the same
  amber flash as any block. I waited ~90 frames at 1 lantern not knowing why.
- **A cut that hits both:** my cut on the recovering Keeper also struck the cage beside it. It counted as a cage cut
  (`cageRelease` and `keeperGuard` on the same frame), and the guard ram hit me point blank 31 frames later
  (f 4,899).

**Why it matters.** Each is a moment where the player feels the rules changed under them.

**Fix:**
- **Sim:** a cut that hits the Keeper doesn't also count on the cage; the cage takes only cuts aimed at it, with the
  Keeper outside the blade box.
- **Render:** the gate glance gets its own look: plates flare white, it shrugs, and the claws scrape. Pair it with a
  `gateSoon` that brings the sweep within ~40 frames, as tuned.

### 8. [render] The den's larder details are too small at play zoom; the rear's belly is a white slab
**What.**
- At the floor stop (zoom 1.0) the wall's cells are ~60-80 px niches, the wrapped moths specks, and the floor litter
  a line of grit.
- HK's chamber carries its story in big shapes: three windows, a floor band of 80-150 px shells.
- In the rear and the P3 frames, the belly plate is a flat near-white wedge, the brightest shape on the Keeper. It
  reads as a slab, not a body.

**Fix (render):**
- Two or three **hero pieces at play scale**:
  - a heap of old cages ≥ 200 px by the west wall;
  - a drift of dead wings ≥ 300 px wide under the cage's old place, lit by it;
  - the cells 1.5x.
- **The belly:** mid-tone (≤ 150 luma), segmented plates with dark seams, a few wings stuck in it like the back.

### 9. [level + render] The ending is still a staircase, and the moonbeam reads as a lamp
**What.**
- 9.7 s from the cut to the clifftop, with nothing at stake.
- The rubble is a clean black stair of 128 px steps.
- The moonbeam lands as a white blob at the top of the steps (`rub-sheet`). Render chose glow-only to avoid a
  "lampshade", and at play zoom the blob reads as a lamp.

**Why it matters.** The plan's moment 7 (the Ginso slot) is still its fallback. Now that the boss is 70-100 s, the
escape is the next thing in line, as r12 said it would be.

**Fix:** the full escape (round 14, below). Until then, render:
- slumps the stair into a scree (broken diagonals, loose clods);
- draws the beam's shaft down the full height from the gate.

### 10. [render] The trap is set, but it reads weakly
**What.**
- The capture fires on time: the cage is hung at +81, and 40 `trapFill`s land from +86 to +261 with `denStir` at the
  end.
- The far stream runs along the frame's top edge in the look's framing.
- The moths swerving in read as dark flecks round the cage (`trap-sheet` t2), like r12's black "birds".
- The tunnel's back is still the r12 card: two banded brown hills.

**Fix (render):**
- The swerving moths get the river's moonlit sheen.
- The `look` framing drops so the stream is in the upper third, not on the edge.
- One larder-style fold pass on the warning's back wall (reuse `den-larder.ts` without cells).

Smaller, still worth a line:
- **The intro's falling moth** is hard to find at 0.72 against the cage's glow. Give its trail the cage's colour and
  drop it in front of the dark root.
- **The hatch's close frame** at 1.5 still frames a ~40 px cocoon.
- **The nest** reads as a teal shaft with cage outlines. The husks and the coil of thread aren't legible.

## Round 14: the build list

The order: **fix the payoffs and the misreads first** (they are cheap, and they decide whether the Keeper is
retold kindly), then **the full escape** (moment 7's remaining work). Each lane keeps its own files.

**Level / sim**
1. **The fight's ending reads** (#1): the carcass rolls clear of the cage, the `den-end` lean. **S.**
2. **The Keeper's honest tells** (#2, #3, #7): sweep mode apart from eat, `sweepTell` 42, the ram speed-up as a
   visible beat (or a three-ram ramp), a cut on the Keeper never counts on the cage. Re-run the bots and a
   lag-15 reactive controller; the bar is that no death comes from a tell that looks like an opening. **S.**
3. **The full escape** (moment 7):
   - rockfalls with dust tells keyed to her progress;
   - a collapse front 300-400 px under her up the shaft;
   - three checkpoints (`MoonPatch.mark`s);
   - `climbs.ts` at kick delays 0 / 6 / 10;
   - 20-30 s.
   **L.**
4. **The chase holds** (#5): the firefly waits until she's past hook-6, a fall returns her to her last hook, and
   hook-6 → chain proven for an on-reach press. **S.** The second leg is deferred.
5. **The duet's zone** pushes in on `kinSit` (#4). **S.**

**Render**
1. **The release** (#1): the cage lit after the kill, the column vertical into the moonbeam, the line delayed. **M.**
2. **The Keeper's tells** (#2, #6, #7): the sweep's rear and claw arc, the slam's floor crack, the gate's own glance,
   the belly's plates (#8). **M.**
3. **The escape** (moment 7): falling earth, snapping columns, cracking floor, the cloud as the only light. **L.**
4. **The duet readable** (#4): the wing span, the silver rim, the torn wing held, the lean. **S-M.**
5. **The larder's hero pieces** (#8) and the trap's moonlit swerve and framing (#10). **S.**

**Audio**
1. **Matt's A/B listen** of the opening, the Keeper and the vista, before anything new.
2. **The boss score retimed** to the new lengths (P1 ~28 s, P2 ~23 s, P3 ~19 s for a careful player), with the
   sweep's tell **sounding unlike eating** (a claw scrape, not a chew).
3. **The escape's cues:** rumble, root snaps, rockfall tells, the cloud's rush leading up.
4. The chase cue and the duet as planned, once their render fixes land.

**Defer or cut**
- **Defer:** the chase's second leg and its low glide line (the escape is the bigger beat).
- **Defer:** close-up #3 (silhouette life on every walked line) and #5 (strands and shafts) outside the den and the
  crown, again.
- **Defer:** the hatch's tighter close frame. It's polish on a moment that works.
- **Don't add** moves or hit points to the Keeper. It has enough; what it needs is honest tells.
- **Cut the trap's far stream** if it can't be framed below the edge: the cage filling from out of frame still
  reads.

**The gate is still Matt's run from the hatch**, recorded. The new questions for it:
- did the Keeper kill him, and did he think it was fair?
- did he find the cage after the kill?
- did he stop for the kin, and see its wing?
