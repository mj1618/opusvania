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

# Playtest 2, 2026-10-14 (after the safety, burrback, fade, layout, HUD commits)

Real keys in real time (`page.keyboard` in `run-code`, state only read), paused between legs. Frames:
`shots/play2/01..10` (gitignored). Built from the working tree at 02:35-02:55 with other agents'
uncommitted edits in `foreground.ts`, `mid.ts`, `pf-*.ts`, so backdrop details may differ from 83f9bb5.
Delete entries as they are fixed.

## The two runs
- **Naive** (go right, jump when blocked, cut what is in the way): heart reached asleep at 24.5 s with
  45 glints and 0 lanterns, having run past the first lantern without knowing it was one. First
  lantern lit was the far one (36 s), second the stone (50 s); 1 hit (burr-path, 0.4 s after climbing
  out of the pool), 3 kills. Lost to a Vite reload before the crown; never glided, never found the shaft.
- **Thorough**: ending at 1:49 (6570 f), 6 hits (4 on purpose for the fade, 2 standing next to
  burr-root), 1 fade, 2 kills, 84 of 189 glints, 5/6 great, 1/12 pods, **52 unspent**. About 35 s of
  that was three failed summit attempts (below). 60 fps, no console errors.

## Must fix
1. **Nothing teaches the lantern.** A dormant lantern is a small dark hook; the refusal needs her to stand
   still on it. A player who keeps running reaches the sleeping heart with a full wallet and no idea
   (the pips row under the count is tiny and dim). Make the first lantern stop her: react to the glints
   she carries as she passes, or put it where she has to stop. (01)
2. **Dormant glints do not signpost anything.** From the shaft floor shaft-2..6 are 2 px orange specks,
   the same as the ambient motes; from the summit sky-1 and sky-2 cannot be found at all in the frame
   (08, 05). They only become stars when she is close (09: lovely, but too late to invite the jump).
3. **The shaft is hidden and its entry is a trap.** Trunks stand on stilt roots, their collision starts
   256 px up, a single jump (272) passes under them: only jump + double jump straight up from the
   middle catches a wall, and a running jump head-bumps the trunk's underside (every attempt). Once on
   the walls it is 3 kicks and 2 s and feels good. A foreground leaf silhouette hangs across the
   opening (06, at 860-990 px of the frame) where the glints are.
4. **The summit is a 128 px target at the end of a jump + double jump at full run speed**; overshoot
   and she falls 1100 px to the hollow and climbs the shaft again. Three misses in a row (pilot with
   ~40 ms reaction; a person will miss too). Widen the top, or catch her on something.
5. **The help text is two DOM lines drawn on top of each other** (`#hint` and `#char-label`, bottom
   of every frame, also under the ending's R key). The hint is the only place the glide is told
   ("hold while falling: glide") and it cannot be read.

## Should fix
6. **Glide is not discovered** by a player who taps jump (holds under 0.4 s never open the wings).
   The bluff does not teach it: jump + double jump at its wall is the obvious way up (the branch is
   not needed), and the way on is a plain drop. Known and used, the glide home (04: bluff lip to the
   first lantern's foot, 1.6 s, all five arc glints) and the summit glide (sky line, great glint,
   lands at the far lantern, first try) are the two best moments in the scene.
7. **Burrbacks are dark on dark**: about 30 px, ground-coloured, three dim spots. The naive hit was a
   creature I had not seen (02). Contact rules are fair once seen: a hit every 70 f if she keeps
   walking in, it does not chase. The calm at a kindle has no visible sign on the creature.
8. **From the bluff top the terrace below is behind foreground leaves** (03; burr-rise walks there).
   Not seen 10 minutes later after the `foreground.ts` edit: recheck. Leaves also sit over F7 / the
   far ledge in the heart view (10, top right).
9. **Fade**: fair (2 lights, 6 of 19 left where she fell, got back by walking there), but the loss is
   not shown: the count is off screen after the re-form, and the cluster is six dim dots next to the
   creature that killed her (07). Make the cluster pulse; show the count dropping.
10. **Hero lost against dark props**: in front of the lantern boulder (01), the bluff root (02), the
   shrine stones before the heart wakes.
11. **Ending glare**: the shrine stone goes near-white and a peach wash covers a third of the frame
   (10); the heart-wake column seen from the far ledge is the same. It lands as a beat (wings open,
   quiet tally), but it is the one place that breaks dark-and-subtle. Tally icons have no labels.
12. 52 glints unspent, 11 of 12 pods never opened: nothing asks for them.

## Nice
- Bright things that are not lights: the white sky gap behind the trunk at x ~1800 (seen from F3),
  the tan glow between the shaft trunks (06), the pool (brightest patch of the left zone).
- Stilt roots show triangle facets in their shading (05).
- The bluff's east face is painted as a ramp down to the terrace; collision is a wall at 2624. Top
  and west wall match. The hollow is a good small beat (three glints, one hop out).
- Lampwing reads as a pretty moth, not a threat; one touch then it gives up, fair.
- Lit lanterns now read well (stone warms, candle flowers stay, pips fill). Kindling pose is lovely.
- On the far ledge the camera's right stop puts her 60 px from the frame edge.

## Not tested
- Standing on a lit lantern's safe ground with a creature at its edge: no burrback shares the stone's
  ground and lamp-f3 hit her on F3 before I got down; the crown and far lanterns have none in reach.
- Feel in the hands (latency, stiffness): judged from traces and frames only. No video taken.
- 100% completion, the left route past F3, the lampwing pogo chain.

## Method
- Other agents saving files makes Vite reload the page and wipe the run. After loading, cut it off
  with `playwright-cli -s=<name> network-state-set offline`: the game needs nothing more.

# After playtest 2: the sim / layout round (2026-10-14, not replayed by a person yet)
Piloted (`layout-pilot.test.ts`, `goal-pilot.test.ts`, `lamps.test.ts`) and played with real held keys
through `playwright-cli`. What a person should check by hand next, by playtest 2's numbers:
- **1 (the lantern is never taught)**: `lanternNotice` fires 68 px into the first run and `pod-stone` at the
  lantern's foot makes "cut what is in the way" stop her on it; live: noticed f 11, refused 4/12 f 54, pod
  open f 82, lit f 145. Nothing of the notice is drawn yet. Does a person cut the pod, and stand the 0.5 s?
- **3 (the shaft)**: trunks down to 1168 (doorways 112 px), the well before trunk A. Live: a jump at trunk B
  from the floor slid at once, three kicks, on trunk A 1.3 s later, no head bump. Do the doorways read as
  low (the roots now arch at head height), or does she still jump in them?
- **4 (the summit)**: a 192 px bough east of the top and a catch branch under it. Live: both the clean
  arrival and a deliberate overshoot landed on the bough (3830, 3868; its end is 3904).
- **6 (the glide)**: the leap off the bluff's east lip (movement-controller.md). Honest limit: it is
  unmissable for anyone who holds jump and does nothing for a player who only taps.
- **12 (the sink)**: two wayside lamps, sim only (goal.md). They need drawing before anyone can judge them.
- Also: burr-path keeps off the bluff's foot (a tapper was hit three times there); burr-rise is gone.
- The safe-ground case is burr-root at `lamp-root`, not at the first lantern (goal.md says why).
