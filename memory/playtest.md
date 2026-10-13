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

# Playtest 3, 2026-10-14 (HEAD 7edc9da, frozen build)
`npx vite build --outDir <scratch>` + `npx vite preview --outDir <scratch> --port 5183 --strictPort`
(served under `/opusvania/`; `window.__game` is in the built app). Real keys in real time
(`page.keyboard` inside `playwright-cli run-code`, state only read). Frames: `shots/play3/01..12`,
clips `clips/play3-{wallkick,longfall,leap,kindle}.mp4` (both gitignored). 60 fps, no console errors.

## The three runs
- **A, naive tapper** (holds right, 90 ms jump taps, cuts what is in the way, walks up to what reacts):
  noticed at 0.2 s, refused 4/12 at 1.0 s, cut pod-stone, first lantern lit at **3.8 s**. Stuck 5 s at
  the bluff (a tap + a tapped double jump do not climb 320 px; got up once the presses were 220 ms).
  Ran through lamp-trunk (channel started and cancelled), walked under both trunks without a jump:
  **never found the shaft**. Hit by burr-root coming off the root (x 4260). Stood at the right rise's
  step = at lamp-root: kindled by itself (19.7 s), healed. **Heart reached asleep at 23 s with 28
  glints, 1 of 3 lanterns.** Then wall-kicked the east wall under the far ledge for 20 s (the far
  lantern re-noticing her above every second) and gave up. Wings never opened with 90 ms taps.
- **A without waiting**: if she runs on the moment the pod bursts, the ten glints catch her up 400 px
  later and the lantern stays dark (refused, never lit). The kindle needs ~1 s of standing after the burst.
- **B, naive holder**: same route and same end (heart asleep 22.8 s, 34 glints, 1 lantern + lamp-root,
  stuck under the far ledge). Glided by accident four times (out of the pool, over the bluff's top, off
  the root, onto the rise): the glide IS discovered by a holder. 2 hits: glided into burr-path with no
  way to cut, and burr-root off the root, the same spot as A. Walked off the bluff's east lip (no jump
  held, so no leap) and through lamp-trunk.
- **C, thorough**: ending at **1:53** (6809 f), 92 of 189 glints (+2), 5/6 great, 2/12 pods, 2/9
  creatures, 2/2 lamps, 5 hits (4 on purpose), 1 fade, **42 unspent** after 52 spent. Shaft: 5 kicks,
  2.3 s, first try. Summit: landed on the bough at 3846 (the old top would have been an overshoot).
  Summit glide: 1.9 s, sky line and great glint, wings closed over the lip, lit the far lantern.
  Lit lamp-root with burr-root alive: 12 s standing there, it turned 136 px short every pass, 0 hits.
  Fade: 4 touches in 3.5 s, re-formed at lamp-root with 2 lights, 12 of 38 dropped 357 px away, shown
  as "-12" by the count and a gold cluster; the rest healed her where she stood 1.8 s later.

## Must fix
1. **A naive player still ends at a sleeping heart with a full wallet.** They now know what a lantern
   is and the shrine shows 1 of 3 drops lit (good), but nothing leads to the other two. The shaft is
   only stars overhead while she walks under two doorways at run speed, and the far lantern is seen
   from below with no way up that reads (both runs spent 20 s on the east wall). Nothing blocks or
   turns her at the shaft; the heart's refusal does not point anywhere. (12)
2. **burr-root hits everyone coming off the root** (x 4260, both naive runs, and me once): she tops the
   root at 4160 and the creature's patrol starts exactly there, below her landing. Keep it 150 px off
   the root's foot, as burr-path is kept off the bluff. (08)
3. **The glide for a tapper: not fixed.** The fall flutter is there (wings half open through a 1000 px
   fall, `clips/play3-longfall`) and reads as "she has wings", not as "hold jump"; a tapper has almost
   no long fall on the floor route anyway (192 px off the bluff). The leap with a jump held FROM the lip
   shows the wings for 0.3 s before the trunk (19 frames).

## Should fix
4. **The first kindle can be missed by a second**: run on at the pod's burst and the lantern stays dark.
   Let the glints land faster, or let the pod's glints fly to the lantern when she is short.
5. **Wayside lamps cannot be read before she is on them.** lamp-trunk from the terrace is a dark hook
   in the root tangle (04); no price crown at 260 px. Running through one starts and cancels the
   channel with nothing to see. Once lit they are good: small warm light, burrback turns away (09).
6. **Standing at a light she covers it** (lantern-stone, lamp-trunk, lamp-root: her body is on the lamp).
7. **Hero hard to find**: at lamp-root's foot against the rise's wall (09), on the far ledge by the
   lantern, at the shrine stones while the heart sleeps, in front of the lantern boulder, and gliding
   in the summit sky (dark wings on near-black; only the eye spots and trail carry her) (07).
8. **Tapper at the bluff**: 5 s of failed taps before a longer press. The branch is not read as the way.
9. **On the east wall the camera's right stop leaves her half out of the frame** (12).
10. **Spending**: 52 of 92 spent, 42 left; both lamps bought and still a third of the wallet idle. The
    lamps are a real reason to spend (rest, re-form, safe ground) but there are two. 10 of 12 pods unopened.
11. **A fade costs little**: she re-forms on the lamp and its rest heals her without a step; the only
    price is a 6 s walk for the cluster. Fair, readable, not felt.
12. Burrbacks read well within ~400 px (pale crown, magenta lights); at a screen's distance, calm or
    not, they are a dark lump (01 right edge). Lampwings never came for me in three runs.

## Nice
- Held jump off the bluff's west lip (the way home) snags F4's east end for 23 frames (wall slide at
  2132, 712) before the wings open; it still lands at 1412, on the first lantern.
- From the branch, jump + double jump with right held overflies the whole bluff (lands at 3036).
- The well is a 128 px chimney: wall kicks carry her up it to y ~600 under the high ledge, a dead end.
- HUD lights lag the sim by a beat and showed 4 lit about 50 frames after a re-form at 2 (check).
- The hint line sits under the ending's R key. The hint and the skin list are debug text over a
  picture that otherwise has none.
- Bright things that are not lights: the white sky gap (bluff view, top centre), the peach band right
  of trunk B, the pink sliver between trunks in the right zone. None is glare; they are the brightest
  patches of their frames.
- A hard landing is flagged from 182 px (every drop off a ledge, and the end of the shaft climb).

## Asked about
- **Glint stars**: they guide now. Counted per fresh frame: spawn / pool 18-20, bluff 8-10, shaft floor
  9-11, summit 4-5, right rise 5-8, heart 4-5. The shaft zigzag and the sky line are read at once (05,
  06). At the spawn it is on the edge of a starfield: 20 pale stars are brighter and more numerous than
  the one lantern and its 12-star crown, and they are the same shape as the crown's stars (01). They do
  not touch the HUD. Thin the spawn / pool frame, or dim stars further than ~600 px from her.
- **Dark and subtle**: holds in every frame I took. Ending and heart wake are warm columns, no white.
  The left zone is the busiest (stars + pool + blue mushrooms), the summit and the sky glide the best.
- **Art against collision** (hitbox overlay at stops 8-12): bluff, hollow, root, well, summit bough,
  catch branch and both trunks sit on their rects within ~20 px (trunk B's bark bulges past its right
  face; the terrace's east face into the well is painted as a slope, collision is a wall).
- **Against Ori / Hollow Knight**: stills of the glide home (03), the summit (06) and the sky glide (07)
  could sit next to them. The three biggest gaps: (a) the goal does not lead: after the first lantern
  the scene stops telling her where to go; (b) the hero's read: small and dark on dark props at every
  place she stands still; (c) nothing pushes back: two minutes, creatures that only matter if walked
  into, a fade without a sting, and a third of the glints with nowhere to go.

## Not tested
- Feel in the hands (latency, stiffness): frames, traces and clips only.
- Lampwing hunt display and the lampwing sanctuary at the far lantern: none noticed her.
- The left route (bank, F1-F5, high ledge), burr-bank, burr-ledge, pod-ledge, the catch branch as a
  catch (never fell onto it), 100%, the dev server on 5180 (not opened).
- The clips are scripted input through `npm run clip -- --url http://localhost:5183/opusvania/ --pickups`,
  not the real-key runs.

## Method notes
- `__game.load()` does not clear the event log and the frame counter starts over, so `events(n)` hands
  back the last run's events again: reload the page between runs.
- `npm run clip` and `npm run shots` take `--url` (the built app's is `.../opusvania/`).
