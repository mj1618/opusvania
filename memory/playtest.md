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

# Playtest 4, 2026-10-14: what is left of it
Fixed since and confirmed in playtest 5: the mark of the cut sits in front of her at the target (must 1, partly:
see 5), creatures push back (2, partly), the wake is in the picture (3), moths lead (4), glide glyph only over
drops (5, one leak), scene edges (6), lamp-f3 (7), lamps by accident (8), a sink for glints (9). Still open,
carried into playtest 5's list: run length, far bluff's east body black from above (10), burrbacks heal on a
fade unseen, hero on dark props.

# Playtest 5, 2026-10-14 (HEAD 4613042, frozen build on 5185, 1600x900)
Real `KeyboardEvent`s from ONE in-page rAF loop that only reads `state()` (250-350 ms reactions, 80-240 ms
taps). Frames: `shots/play5/01..17` (gitignored), the bots in `shots/play5/bots/`. 60 fps (0.5% slow frames), no errors.

## The runs (clock = the tally's)
- **A, naive tapper** (never stops, mashes at what is in the way): **0:20**. Lantern 1 by the pledge at 1.9 s
  (290 px behind her), burr-path 1.7 s, burr-shaft 1.6 s, crown 13.7 s (214 px behind), burr-rise 1.5 s, far
  19.4 s (she was at the east wall), heart 20.3 s. Each fight identical: cut, cut, brace, clang, rammed, cut,
  dead. **3 hits (one ram each), ends on 1 light, 0 fades**, 92 gathered, 56 offered (tier 2), 8/12 pods, 0 lamps.
  Never stuck. She saw no kindle on purpose and reached the heart 0.9 s after it woke.
- **B, careful first-timer** (stops at what reacts, watches burr-path 3 s, follows `__goal.guide.lx/ly`, holds
  jump when `__prompts.lesson === 'glide'`): **1:08, of which 11 s was my controller on the far cliff: ~58 s.**
  First cut ever was a clang (it braced as she walked up), she hopped the ram 0.3 s later, killed it spent:
  2.6 s. Then the same three more times (1.3-2.5 s each). 0 hits, 4 kills, 3/4 lamps, 110 gathered, 50 offered
  (tier 2). Glide taught at 33 s (off trunk A into the shaft). A first attempt whose controller copied the
  leader's x took 2:08: it oscillated 12-15 s under the moths wherever the way is vertical (pool start, shaft,
  the drop off the catch branch): a person reads "up" / "down" there, a literal follower does not.
- **C, skilled explorer** (seven scripted segments, paused between; burr-bank, lantern 1, burr-path, lamp-trunk,
  burr-shaft, up trunk A's east face, burr-ledge, lamp-ledge, lamp-high, crown, the three branch pods, burr-root,
  lamp-root, burr-rise, lamp-rise, pods, back up trunk B's east face, summit glide with one cut at lamp-sky, far,
  heart): **1:12. 7 kills (6/6 burrbacks), 1 hit, 0 fades, 4/4 lamps, 11/12 pods, 5/6 great, 157 of 200 +2, 68
  spent, 91 offered (tier 2; tier 3 wants the islands too).** Every burrback fight 1.3-2.3 s.

## Must fix
1. **A fight is one beat and the game is 20-70 s.** Every burrback in every run died inside ONE cycle:
   spent 45 + cooldown 150 = 195 frames in which it cannot brace, and three cuts take ~55. There is never a
   second tell. The masher pays exactly 1 light per burrback and wins anyway (3 on the path, 4 lights, no
   fade possible). First one: good (the clang teaches the brace at once, the hop is generous: jumps as late as
   the ram's first frame from 52 px cleared it). Third one: rote. Wanted: a creature that outlives one punish
   (brace again after ~60 frames, or more hp, or a shell that only opens from behind / above), and three
   encounters that differ (the shaft's walls, the ledge's edges, the rise's open ground are the same fight today).
2. **The cut: structure is right now, the finish is not** (04-08, 12). Good: one cream crescent in front of her
   at the target, the 4-frame hold with the creature black and a contact cross, pale flash and shove after,
   the clang (shards, crescent cut short, blade thrown back: the best new thing), the up cut, finisher with a
   3-frame draw-back. Still off, in order: (a) **size and value**: the crescent is ~1.4x her height (1.7x on
   the finisher) at full cream for 7-11 frames: the largest, brightest thing on screen each cut, worst in the
   blue zone; HK's is about one knight tall and gone in 4. (b) **Cut 1's pose does not make its mark**: she
   stabs low and forward, the mark is an overhead chop, the blade tip never meets it (cut 2's does). (c) Cut 1
   and cut 2 draw the same arc the same way round: no down / return rhythm. (d) It pops whole in one frame and
   stands still through the hold: no frame where it sweeps out of the blade. (e) **Noise on top**: 8-12 flat
   green leaf triangles per hit, drawn over the crescent, alive ~12 frames, green also on violet stone; a
   kill's glints pop as five head-sized orange stars DURING the freeze (they move while the world is held) and
   then fly into her face through the next cut. (f) **Pogo**: the down mark is a sliver at ground level ~100 px
   to the side of the contact (08); only the cross says hit. (g) The finisher's 7-frame hold is rare in play: a
   3-hp burrback takes cut, [clang], cut, cut, so it dies on a plain cut 2.
3. **The offering is not legible, and a runner skips the last beat.** The third kindle's picture works (15:
   lantern top right, shrine bottom centre, ten dotted moth trails down the cliff, the fourth pip a flower) and
   nothing glares. But the wake itself is a 60 px bud and a warm haze; the HUD count is hidden from `gather`, so
   nothing runs down; 56 and 91 offered end in the same picture (16) and the tally has no offered / tier row.
   A reached the heart 0.9 s after the wake: no hold on the picture, ending already rolling.

## Should fix
4. **Lampwings are not an event.** Pale grey-violet, 25-30 px, the same read as the ambient butterflies (11,
   17); the 36-frame tell is not visible at play zoom; 110 frames of drift at 2.2 px/f from tell to touch; two
   up cuts. None touched A or B. lamp-sky in the glide: one cut and through. Needs a swoop and a look of its own.
5. **Violet zone fights are the busiest** (03, 13): lamp-rise's price crown (a ring of 12 orange drops) stands
   inside burr-rise's patch through the whole fight, next to pod-row-1 and the shrine's lights; the creature's
   red count is three 3-4 px dots among them. Amber is the clearest zone; blue reads by the dots alone (the
   body is dark on dark, and burr-bank is fought at the frame's left edge).
6. **Glide glyph leaks into the shaft climb**: five times in 3 s between kicks (C, 3520, 641 -> 36), and B's
   first one was stepping off trunk A into the shaft she had to climb. Not while a wall is within a kick's swing.
7. **Moths when the lantern caught behind her**: the flight goes to the way's first point ((1700, 1130) for the
   crown) and waits 290 px over the pool, 90 px behind where she stands. Otherwise they lead: 220-330 px ahead
   on the run pool -> bluff -> well, 560 px up the shaft, across to the crown, down the boughs, over the heart
   to the cliff, on the hook; after the wake off the west lip and into the heart (B followed in 2.5 s).
8. **The weakest 20 s is the walk to the last lantern**: lamp-rise -> two pods -> the sleeping heart -> a 320 px
   face (B 47.9-62.9 s): flat ground, nothing asked after burr-rise. The summit, the best view, is 2 s.
9. Hopping burr-ledge's ram carries her off the ledge's west end to the floor (C's first attempt). A player who
   kicks on contact is carried up trunk A's bark from the well and never meets lamp-trunk or burr-shaft.

## Nice
- Her hurt frame is the whole body in pale lavender (1-2 frames): the one moment the dark hero is not dark.
- Hero hard to find: in the pool, in front of the dark tree at x ~2100-2160 where burr-path is fought (09), at
  the frame's right edge after the summit glide (5740), dark violet on violet at the shrine (eyes carry her).
- Kick glyph: right moment (first wall contact: the bank at 1.7 s, the bluff), small but legible (17).
- The bank's 192 px step wants a held jump or a kick: 100 ms taps without a kick never clear it.
- Tally: small, calm, legible; "0:20" for A says the size of the game.

## Asked about
- **Far cliff with slow hands**: one kick clears it up to 20 frames of slide (30 with a 12-frame press), two
  beyond; no loop. Bluff the same. Trunk B's west face 5-10 kicks.
- **Visual rule**: no glare in kindles, wake or ending (warm orange, no white). What leans on it: the crescent
  (must 2a), kill stars, price crowns two or three to a view in violet, green chips. Violet is the loudest zone
  (magenta shafts left of the shrine) but not washed.
- **Against Ori / Hollow Knight**: at the bar: stills in all three zones, the clang, the up cut, the ending
  picture, the glide. Gaps by what fixing adds: (1) fights with a second beat and a longer road (must 1),
  (2) the cut's finish (must 2), (3) a last beat that shows what she gave (must 3).

## Not tested
- Feel in the hands; whether a person sees the red count at play speed (judged from stills).
- F1-F7, lamp-glade, lamp-f3 in play (staged only), lamp-glide-1 / -2, the pogo chain, pod-branch-l,
  100%, tier 3, a fade (none happened), art against collision (no hitbox pass), scene-edge kicks beyond a touch.

## Method notes
- Serve the bot from the frozen build's folder (`play5-dist/bot.js`, `await import('/opusvania/bot.js')`): one
  rAF loop reads `state()`, dispatches keys, logs `events(n)` by `f`, crops the WebGL canvas with `drawImage`
  inside the same rAF (not blank: the game's callback ran first) into sheets, returned as data URLs.
- Sheets of a fight: `stage.js` (manual mode, `step(1)` closed loop, every frame grabbed at the game camera
  and again at `cam({zoom: 3})`), then `__sheet(name, 'pz' | 'zx', from, to, every, cols)`.
- A step that brakes before a teleported fight misses the `enemyWindup` it starts (settle 0-1 frames).
- A follower of `guide.lx` must keep its heading while the leader is > 190 px above or below it.
