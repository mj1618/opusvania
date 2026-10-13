# Playtest, 2026-10-14: the first start-to-finish review as a player

Played in `?manual` with closed-loop pilots and in real time (video). Frames: `shots/playtest/` (gitignored).
What should guide the next rounds; delete entries as they are fixed.

## The size of the game
- A goal-directed run is **42 s** (gather at frame 2503, 76 glints, 2 kills, 1 hit). Holding right and
  jumping when blocked crosses spawn -> shrine in **8 s**. Left route spawn -> summit: 11 s.
  A first-timer who wanders finishes in about 3-5 minutes. There is no "ten minutes" of content.
- Steady 60 fps (p99 16.8 ms over 17 s real time, no frame over 20 ms). The ending tally timer is right (0:41).

## What works (keep)
- Wrong order works: any lantern first, the heart wakes on the third.
- "One short" lands twice by accident: the spawn line gives 11, and the left route arrives at the
  summit with 11. The refusal arc of 12 dots is the only place the price is shown; it is small.
- Hold left + jump from the summit chains glides off every edge to the left wall (7 s): the best
  feeling thing in the scene, and nothing asks for it.
- Slash at zoom is crisp; burrback dies in 3 cuts / 42 frames.

## Problems found by playing (highest first)
1. (Fixed in the sim, not replayed by a person yet: burrbacks keep 96 px off every lip and back
   away from an edge she is under; calmed creatures and lit lanterns are safe; a touch is one hit; a
   fade costs 2 lights and a third of the wallet: enemies.md, goal.md.) Left over: **the dropped
   glint clusters are not drawn** (drawn since: goal-render.md). The F7 jump onto burr-far is solved by
   taking the creature off the far ledge (below).
4. **The heart waking is almost invisible.** Asleep vs awake from the far ledge differ by a few small
   orange drops and an opened bud; the big red glow behind the shrine is the background tree and is
   there before any lantern is lit. Only the fourth HUD pip says it.
5. **A lit lantern changes almost nothing**: a ~12 px warm flame. She stands on the trigger centre,
   so she covers the lantern while kindling. No lasting change to the zone.
6. (Canopy: the sim's ceiling is 420 px over the scene's top now, the whole jump + double jump fits
   on the summit and the summit glide reaches the far ledge. Check with the camera's headroom that
   the crown lantern is no longer in the top 10% of the screen.)
7. **Re-form cuts the camera** in one frame (x 2120 -> 1120), with nothing covering the cut.
8. **The blue mushroom cluster behind the moth-stone** blooms into the brightest blob of the left
   zone when she is near (and at the re-form point): glare, and it outshines the lantern.
9. Hero is often in front of the orange-leaf bush at x ~2080 (where burr-path is fought) and in front
   of the moth-stone: dark on dark / busy on busy.
10. Lampwing: 2.4 s from notice to touch at 2.2 px/f, gives up when she moves on. Its only effect is
    knocking her off a platform (F1 -> ground). During the summit glide it does land a hit.

## Economy as played
- Brisk run: 76 gathered, 36 spent, 40 left over with nothing to spend them on. Pods pay 3-10 for
  one to three cuts and are the best source; kills pay 4-6. After the third lantern glints are dead weight.
- Health was never a constraint: 4 hp, free rest at any lit lantern, free full heal on death. (Since: a
  fade re-forms her with 2 lights and drops a third of the wallet; the `gather` summary carries a tally
  (glints of 189 at base worth, pods of 12, great glints of 6, creatures of 10, deaths) for leftover glints to count toward.)

## Layout pass after this playtest (2026-10-14, not replayed by a person yet)
Sim-piloted and played through the debug API; what a person should now check by hand:
- **The floor**: hold-right-and-jump stops at the bluff (2432-2624, 320 px). Is the branch read as the
  step up, or do people double jump? Is the hollow (3744-3968) a beat or a nuisance?
- **The glide before the summit**: nothing gates it. It is taught by the bluff: every way off it is a
  drop, and a held jump off the west lip sails over burr-path and the whole pool (all five arc glints) to
  the first lantern. Does anyone find it without being told? If not, the next step is a real gate, and
  that needs a drop the staircase does not catch (movement-controller.md, the `carried` rule).
- **The summit glide** now has a line of six glints and a great one that only a glide (or the lampwing pogo
  chain) reaches (4800, -57). From the summit the dormant glints are faint against the canopy: check that
  the first two (3900, -115 and 4150, -300) are seen at all.
- **The shaft**: six glints zigzag between the kick points. Same question: are they seen from the floor?
- Creatures: burr-far is gone (5 burrbacks), burr-rise keeps to the east 200 px of the terrace, lamp-glide-2
  follows the glide to the far lantern and turns back at its light. A run is still ~20 s for the pilot;
  the scene has more to look for (92 world glints against 77), not more to wait through.
- Leftover glints: 55 after a brisk run, still nothing to spend them on (proposal in goal.md).

## Method notes
- `playwright-cli run-code --filename f.js` runs a Playwright function with `page`: loop
  `page.evaluate` (inputs + `step`) and `page.screenshot` in one call. Build the file with
  `print -r` in zsh (`echo` eats backslashes).
- `page.screenshot` stalls a real-time frame ~100 ms; for real time use `video-start` / `video-stop`
  (800 px wide webm, 25 fps) and measure frame times in a separate run without screenshots.
- To attribute an event to a frame, `step(1)` and read `events()` each time; `events(k)` after `step(k)` only gives the batch.

# Playtest 2, 2026-10-14: what is left of it
Fixed since and confirmed in playtest 3: the lantern is taught (1), dormant glints signpost (2), the shaft
entry (3), the summit landing (4), the help text overlap (5), the fade's loss shown (9), the ending glare
and tally labels (11). Still open, carried into playtest 3's list: the glide for a tapper (6), burrbacks
at a distance (7), foreground leaves over the far ledge in the heart view (8), hero on dark props (10),
unspent glints (12), the white sky gap at x ~1800 and the tan glow between the shaft trunks (nice).

## Method (still true)
- Other agents saving files makes Vite reload the page and wipe the run. Either cut the dev page off
  with `playwright-cli -s=<name> network-state-set offline`, or play a frozen build (playtest 3).

# Playtest 3, 2026-10-14: what is left of it
Fixed since and confirmed in playtest 4: a naive player lights all three and ends (must 1), burr-root off the
root's foot (2), the first kindle caught by the pledge (4), the tapper at the bluff (8), a fade that costs
(11), the well as a way up, F4's snag. Still open, carried into playtest 4's list: the glide for a tapper
(3), lamps read late (5), hero on dark props (7), spending (10), creatures at a distance (12), the hint
line and skin list as debug text over the picture.

# Playtest 4, 2026-10-14 (HEAD c9efdb8, frozen build on 5184)
Real keys in real time (`page.keyboard` in `playwright-cli run-code`, state only read, 40 ms polls).
Frames: `shots/play4/01..13`, `fade-sheet`, `slash-{1-brush,2-ribbon,3-scale-dust,up-down-brush}`,
`hitboxes-{a,b}`, `glyph-and-moth-crops`, everything else in `shots/play4/raw/` (gitignored). 60 fps, no errors.

## The runs
- **A, naive tapper** (90 ms taps, holds right, 250-400 ms reactions, cuts what is in the way, walks up to
  what reacts and waits there): refused 3/12 at 2.3 s, cut pod-stone, lantern 1 by the pledge at **5.9 s**,
  hit once by burr-path (one cut, then she walks into it), glide glyph at 11.2 s, lamp-trunk 12.9 s, pod-shaft,
  up the shaft with no pause, lantern 2 at **21.2 s**, off the bough, lantern 3 at **27.3 s**, heart at
  **31.0 s** (frame 1830). 1 hit, 0 fades, 66 gathered, 44 spent, 22 left, 4/12 pods, 1/4 lamps, 0 kills.
  **Never stuck for 3 s.**
- **A2, the same hands but never stopping**: every lantern's channel started and broke 9-10 frames in
  (it needs 30 standing); **0 lanterns in 2 minutes with 86 glints**, pinballing between the scene's two
  edge walls. The first lantern cannot teach "stand here" to someone who arrives with 0-3 glints and runs on.
- **B, naive holder** (420-650 ms presses): glide by accident at 9.6 s (over the bluff to the high ledge),
  lamp-high 13.3 s, lantern 2 at 17.5 s (arrived with 11, refused, the 12th drifted in), walked east off the
  boughs, heart asleep at 2 of 3 at 34.3 s, followed the heart's four moths to the bluff face, lantern 3 at
  41.3 s, heart at **44.8 s**. 0 hits. (About 8 s of that was the bot cutting at pod-branch-r, which hangs
  under the branch she stood on.) 53 gathered, 9 left, lamp-rise refused 5/8.
- **C, explorer** (left first, islands, well, both glides, all lamps): 6:47 on the clock, about 2.5 min of
  play (the rest was me between segments). **160 of 189 glints +4, 6/6 great, 8/12 pods, 6/9 creatures, 4/4
  lamps, 9 hits (5 on purpose), 2 fades, 68 spent, 96 left.** Not opened: pod-branch-l / -r (hang under
  one-way branches: an up cut from a jump missed, a down cut from above missed), pod-f6, pod-row-2.

## Must fix
1. **The slash is still not at Hollow Knight's level** (sheets). *Brush* cut 1: the cream mark is a crescent
   that ends up ABOVE the creature, detached from blade and hero, and hangs there frames 4-7 after the blade
   has gone back up (it reads as a claw / moon, the dark slits as feathers); the smear frame reads as two
   blades. *Brush* cut 2 (the flat return sweep through the target) is the one that works: do cut 1 like it.
   *Ribbon*: a thin wire arc with a ring, 9 frames, floats up and away: elegant, weightless. *Scale-dust*:
   confetti. Missing in all three: a mark that lives 3-4 frames IN FRONT of her at the target's height and
   tapers to the blade tip; a hit read on the creature (a white cross-streak, a real shove: 21 px today, 2
   frames of hitstop, a pale flash for 2 frames); a body pose that commits (she finishes upright, sword
   raised, by frame 6).
2. **The run is 31-45 s and nothing pushes back.** The critical path now works so well that a naive player
   sees a third of the scene and finishes before anything has asked anything of them. Creatures on the path:
   one (burr-path). Standing at reach and cutting kills any burrback in 3 cuts / 0.6 s with no risk (three
   times in C); they only hurt someone who walks into them. The first hits that felt earned were lampwings.
3. **The heart's wake is off-screen from the far lantern** (08). She stands at 5524, 448; the heart is 640 px
   below. What shows: a warm column from under the frame and the HUD bud. No moths lead down, the camera
   does not lean. A held jump off the west lip (what the glide taught) carries her 1800 px to trunk B (C,
   3.4 s) over the heart. The last ten seconds should be the clearest, and are the least.

## Should fix
4. **Ember-moths: they lead from the heart, they decorate everywhere else** (crops). 12 px orange moths at
   150 px/s against a player at 400+: in A she had passed them before they left the lamp. From the heart at 2
   of 3 the four go to the bluff face and up it and B followed in 3 s (07): that one works. From the crown
   they fly the sky line up to y -300, off the top of the screen for anyone on foot (B walked east under
   them). They are the same size and colour as the ambient orange / pink butterflies (04, 12). No wall
   crossing seen: the doorway and shaft routes stay in open air. Fewer, larger, faster, and a route for
   walkers from the crown.
5. **Key glyphs.** Glide: a neat pale Z cap, tasteful, on brand (01). But it shows 12 frames into ANY fall,
   so it appears as she lands from a hop off the bluff, mid-fight, or mid-platforming (C: three times on
   the islands before a glide mattered) and lingers 1.3 s over nothing; in the captured frames it is the cap
   alone, no wings, so it says "Z", not "hold Z". 24 px at 1600 wide. Kick: **never shown in any run**; every
   hand kicked before 24 frames of slide. Show the glide one only over a real drop (or at the summit lip).
6. **Scene edges climb to nowhere** (09): the east and west walls take kicks up to the canopy (y -337), the
   camera stops, she sits in the top corner under the HUD. A2 spent most of its two minutes there. Give the
   last 300 px of each wall no kick, or an overhang.
7. **lamp-f3 sits in the F2 -> F3 jump arc**: hit 0.2 s after its tell, twice (A after the ending, C). And
   lamp-ledge reached her on the high ledge while she fought burr-ledge (C's unplanned fade at 1 hp).
8. **Lamps kindle by accident**: lamp-high as she tops out of the well (C, B), lamp-root while chasing
   burr-root. 8 glints go without a choice. A run-through still starts and breaks a channel unseen.
9. **Economy**: A 22 left, B 9, C 96 left of 164 with everything bought. Lamps are the only sink (32).
   B was refused at lamp-rise (5/8) and reached the crown one short: a holder who glides past the floor
   glints is tight, an explorer is rich. 4-8 of 12 pods opened; the hanging pods are not hittable in practice.
10. **Far bluff** (hitboxes-b): the pale stone face is 110 px wide, the collision 288; east of it the body
    is black, so from above she stands on a slab over a void. The face is the palest large surface on the
    right (chalky lavender, brighter than the shrine stone): take it down a step. The dormant far lantern is
    a dark blue wire on near-black (06).

## Nice
- Burrbacks heal to full when she fades; enemies killed stay dead. Not shown.
- The HUD's health row hides while she rests / stands at a light: with the count also gone (crown) the
  corner is two different layouts.
- pod-branch-r / -l invite a cut from the branch above that cannot land.
- The well: 4 presses, 1.9 s, lands on lamp-high. Trunk B's east face: 5 presses, 2.3 s. Shaft: 6 presses,
  3.3 s. None is a chore; the second and third climbs are quicker than walking round. The way back west by
  glide from the bluff is the fastest thing in the game.

## Asked about
- **Shaft read as the way on?** Yes for every hand: the floor ends at trunk B with the great glint at its
  foot and the zigzag of stars overhead (03). **Far bluff?** Yes with the heart's moths and the `cliff`
  glints (07); the tapper never needed to (glided there from the summit).
- **Fade** (fade-sheet): right. Four hits, 50-frame dissolve, dim dip, re-formed at the lamp with 2 of 4,
  "-32" by the count, gold cluster 232 px away under the creature that killed her, no heal for 3 s standing
  (`restHold`), full rest after stepping out and back. A cost, not a punishment. Unplanned fade with no
  light lit: back on F5, 9 of 28 dropped on the ledge above the well.
- **Combat feel**: pogo is the best of it (3 down cuts, 3 bounces, 0 hits, 11). Up cuts kill a lampwing in 2.
  Ground: see must 1 and 2.
- **Visual rule**: no frame broke it. No glare, nothing washed; ending and wake are warm, not white.
  Vesper is found everywhere I stood except: the far bluff top before the lantern is lit (dark on black at
  the frame edge), the scene-edge corners, and against the shrine stones (eyes carry her). Wings now carry
  a pale rim in the sky glide (06): fixed. Mist pools and kick walls sit naturally (13, 03); I could not
  point at them as effects. Brightest non-lights: the peach band right of trunk A (13), the far bluff face.
- **Art against collision** (hitboxes-a/b): trunks, high ledge root mass, boughs, terrace, bluff, far
  bluff's west face all within ~20 px. Only the far bluff's missing body (should 10).
- **Against Ori / Hollow Knight**: at the bar as stills: the sky glide (06), the shaft climb (04), the summit
  at night with one lantern (05), the ending (10). The three gaps: (a) the cut (must 1); (b) length and
  resistance: 31 s, one creature in the way (must 2); (c) guidance by light is half there: the heart's moths
  work, the rest are ambience, and the last beat is off-screen (must 3, should 4).

## Not tested
- Feel in the hands. A person's eyes at play speed: "noticed" above is my read of stills and positions.
- The kick glyph (never fired), the finisher frames (my press was late), pod-f6, pod-row-2, 100%.
- burr-bank fought cleanly (my controller walked into it: 2 hits), lampwing sanctuary at the far lantern.

## Method notes
- `__game.load()` does not clear the event log: reload the page between runs. `events(n)` entries carry `f`.
- A real-key bot must stop for a channel (30 frames) and steer to what noticed her, or it lights nothing.
- `state().player.kindling` is an index (-1 = none), not a flag.
- `npm run clip` and `npm run shots` take `--url` (the built app's is `.../opusvania/`).

## After playtest 4: what changed in the sim, and what to replay (2026-10-14)
Each line: the finding, what was done, where to look. Not yet seen by a person.
- **Nothing pushes back** -> the burrback's ram (brace 26 frames, ram 180 px, spent 45 frames; a braced
  front turns a cut; enemies.md). Three on the critical path with a light before each (scene-and-units.md).
  *Replay*: stand at reach of burr-path and mash: is the hit earned, is the tell (0.43 s) readable at play
  speed BEFORE the render acts it (today it is only a standstill; hitboxes: thick red box, white front)?
  Hop it and cut it spent. Fight burr-shaft in the 256 px shaft (wall kick over it). Try to cheese: cuts
  from the doorway, from just outside a patch, baiting rams into walls.
- **Hit weight** -> 4 frames of hitstop on a creature (7 on the finisher), 32 px shove (102), she is pushed
  back 10 px (21); the pogo unchanged. *Replay*: does a standing cut, cut, finisher still connect (it
  does from within 65 px), does the push back feel like weight or like slipping?
- **lamp-f3 in the jump arc** -> moved to (1470, 420), and no lampwing hurts in the first 20 frames of its
  tell. *Replay* F2 -> F3 with a full jump, and standing on F3 under it.
- **A lampwing on the crossing** -> `lamp-sky` on the summit glide's line. *Replay*: the plain held glide
  (it should hit, 21 frames after its tell: too soon? she sees it 1.8 s ahead only if the camera shows
  it), a forward cut on the way in, closing the wings under it; the pogo chain past it.
- **A tapper lights nothing** -> a channel that has started runs on within 260 px. *Replay*: run past each
  lantern with its price without stopping (it catches behind her: does that read, or does it feel like
  it happened to her?). Lamps want 20 still frames first: run over lamp-high out of the well and against
  the rise at lamp-root (nothing), then stand (0.83 s in all: too long?).
- **Scene-edge climbs** -> no slide, no kick on either edge. *Replay* both corners, and the summit glide
  held into the east wall (she sinks along it, wings open, onto the bluff).
- **The wake off-screen** -> the far bluff's top is 320 px lower (768): heart 320 below, 312 west.
  *Replay*: kindle the far lantern on foot and from the glide: is the shrine in the picture as it wakes
  (it is at the frame's bottom edge in the wide stop; the wake's lean and the moths are render work)?
  The held jump off the west lip still carries her ~1500 px west over the heart.
- **Economy** -> the offering (everything left goes into the heart during the hold; tiers 25 / 50 / 100),
  hanging pods within a standing up cut, pod-branch-r on its branch. *Replay*: does the count running
  down at the end read as a gift (HUD and heart need to act it)? Open pod-branch-l, pod-f6.
- **Run length**: robots still finish in 19-24 s (they mash perfectly and react in a frame). Whether a
  person now takes minutes is the thing to measure: time each encounter, count hits and fades.

