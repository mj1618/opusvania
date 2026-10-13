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
