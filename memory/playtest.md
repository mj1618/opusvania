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

# Playtest 5, 2026-10-14: what is left of it
Fixed since and confirmed in playtest 6: fights have a second beat for anyone who is not pogoing (must 1), the
crescent's size and noise (2a, 2c, 2e, 2f), the offering drains, has tiers and a tally row (3), lampwings dive
(4), one price ring at a time (5), the glide glyph in the shaft (6). Still open, carried into playtest 6's list:
the run is short, the walk to the last lantern, hero on dark props, the debug text over the picture.

# Playtest 6, 2026-10-14 (HEAD d42d0dd, frozen build on 5186, 1600x900)
Same method as playtest 5 (one in-page rAF loop, real keys, 250-350 ms reactions, 80-120 ms taps), plus island
hops for all three hands (`B.hop`). Frames: `shots/play6/01..18` (gitignored), bots in `shots/play6/bots/`.
60 fps: p50 16.7 ms, p99 18-20 ms, 0.5% of frames over 20 ms in fights, wake and ending alike; no errors.

## The runs (clock = the tally's; my controller's dead time is named, not hidden)
- **A, naive masher** (never stops, never reads a tell, did not see the moths rise behind her): **1:51, of which
  ~24 s was my follower dithering under the show flight; a second run 3:25 with ~95 s of it.** Lantern 1 by the
  pledge at 1.9 s, burr-path 2.0 s (1 hit, 4 hp: she wins), burr-shaft **fade, fade, kill** (43-56 s), summit
  told her (59 s), burr-ledge fade, re-formed at lantern 1 = under the ember: islands, ember at 67 s, lamp-ledge +
  burr-ledge together: fade, crown 85 s, burr-root fade, burr-rise + wing-rise fade, far 108 s, heart 111 s.
  **15 hits, 6 fades, 7 kills**, 147 gathered, 46 lost, 65 offered (tier 2), 0 lamps, 9/12 pods. She always
  finishes: wounds kept through a fade make the second or third try a one-cut kill. The price is the walk: the
  first four fades all re-form at lantern 1 (4.3 s back to the shaft, three times over the same ground).
- **B, careful first-timer, ember first** (watches the moths rise 3 s, climbs): **1:26.** Ember at **10.3 s**
  (stepped out of lamp-f3's dive), fell off the high route at F5, burr-shaft 6.2 s (3 tells hopped, 0 hits),
  lamp-trunk, shaft, burr-ledge 4.0 s (1 hit), lamp-high, crown 47.9 s, burr-rise + wing-rise 5.5 s (2 hits),
  lamp-rise, far 79.9 s (12 s of that my controller on the far cliff), watched the wake, heart 85.7 s. 4 hits,
  0 fades, 3 kills, 3/4 lamps, 104 gathered, 44 offered (**tier 1, 6 short of tier 2**).
- **B, summit first**: **1:39.** Floor, burr-shaft, burr-ledge, lamp-high, **refused at the summit 36.0 s**, moths
  led west along the high route, **hit by lamp-f3 as she reached the ember (42.9 s)**, ember 43.2 s, fell off F4
  stepping out of the next dive, floor again, crown **63.4 s (27 s after the refusal)**, burr-rise + wing 4.0 s
  (1 hit), far 87.4 s, heart 98.7 s. 3 hits, 80 offered (tier 2).
- **C, skilled** (seven scripted segments): **tier 3: 115 offered**, 177 of 208, 12/12 pods, 4/4 lamps, 6/7
  great, **9/13 creatures** (6/6 burrbacks, 3/7 lampwings), 1 hit, 0 fades. Tally 3:49 with 131 s of my step
  timeouts: about **1:40** of play. Not 100%: lamp-glade, lamp-glide-1 / -2, lamp-sky (left at 1 hp) and the sky
  line's great glint were not taken.

**Fixed since in the sim, not replayed by a person yet**: must 1 (the ember take calms everything near:
goal.md), must 2 (the pogo: one landed down cut an exchange, it curls, the braced top glances and bounces her;
spammer pilot 7.5-9.3 s with 4-5 rams met, pogo reader 4-6 s: enemies.md "round 2"), must 3 (re-form at the
nearest light, a lamp she passed even dark: shaft fades re-form at lamp-trunk, goal.md), should 6 (a ram
carries its last 32 px into a wall: the shaft's second exchange is a wall stun), should 11 (lamp-sky: after a
`far` give-up it tells only at one well inside its leash for 5 s), should 12 (a drop onto a burrback: it gets
out from under her and braces only once she is down), nice 4 (no ram sooner than 80 frames after a hit).

## Must fix
1. **The lampwing on F3 hits her as she takes the ember.** lamp-f3 tells as she lands on F3 and dives while she
   stands the 54 frames at the cup: hit in 2 of 4 unskilled takes (A2, B summit-first), and A's second dive
   there was a fade ON the ember island. lamp-glade also hit A in the air between the bank and F1. The run's
   new backbone should not be the place where the least readable creature gets a free hit: move lamp-f3 off the
   cup (it guards F4, say), or calm it while the ember wakes like a kindle does.
2. **Pogo skips the whole burrback.** A down cut breaks the brace (`broken`), she bounces, the next down cut
   lands before it can brace: four bounces, 1.6-2.6 s, no ram ever (staged and live: burr-path, burr-shaft).
   The skilled fight is one beat again and has no risk. Give the shell a top (down cuts glance while braced,
   as forward ones do) or let a pogo break only once.
3. **The masher's loop is the weakest minute of the game.** Three walks from lantern 1 to the shaft, one cut
   each time at the end. Either `lamp-trunk` should be where she re-forms once she has passed it (a notice is
   enough), or the second fade at the same creature should re-form her at the nearest safe ground.
4. **It is still a 1:30-1:40 game** for a careful first-timer (1:26 / 1:39, of which ~15 s was scripted
   looking). The ember added one out-and-back (27 s); it did not add a third act.

## Should fix
5. **The slash is now too slight in the blue zone and a hairline everywhere** (10, 11, 13). Size and life are
   right (about her height, gone in ~5 frames, finisher ~1.4x with a filled wedge on its first frame), cut 1
   and cut 2 mirror, the pogo mark is on the shell, the clang is still the best frame. But the body of the
   crescent is a 1-2 px grey outline at play zoom: on blue it reads as a scratch, and cut 1 / cut 2 have no
   frame with weight. **One change: fill the leading third as a tapered wedge at full value for the first 2
   frames (as the finisher's first frame already is), then let the hairline be the fade.** The finisher is the
   kill in about half the fights (rise, bank, ledge: yes; path, shaft: a plain cut).
6. **The wall stun is rarely met.** It works when she stands between burr-shaft and trunk B's bark (ram ends
   `wall`, 5 cuts, dead in 2.2 s: `08`), but all four live runs came in through the doorway, hopped east and got
   `spent` every time. As played, shaft = path with walls. burr-rise is the different one (two tells at once);
   burr-ledge is different too (ram ends `ledge`, lamp-ledge joins).
7. **wing-rise over burr-rise is fair for a reader and a wall for a masher**: B took 1-2 hits there, A faded
   there in both runs. Its dive and the ram land ~0.5 s apart; fine as the last fight, but it is also where a
   first-timer on 2 lights meets the heart.
8. **The refusal is carried by the moths, not by the mark.** At the summit the cold glass shows a 15 px hollow
   oval; what tells her is the flight leaving west 1-1.5 s later (`04`). Ember-first is clear: it is in the
   opening frame (`01`), the moths rise to it 3 s after the first kindle (`02`), and it took 10 s. A runner who
   leaves the first lantern at once never sees the show (it starts 840 px behind her).
9. **The second summit visit is backtracking** when she went summit-first: the same shaft climb again (her
   high-route return failed once in each B run: a miss at F5 or F4 drops her to the floor). The high route east
   with the ember (F3 -> F4 -> F5 -> ledge -> trunk A -> summit) is the best traversal in the scene when it works.
10. **Tiers differ, but only side by side** (`16`): tier 1 flowers at the shrine, tier 2 two thin veins, tier 3
    a scatter of canopy lights. A player sees one of them. The lit veins run through the tally text.
11. **lamp-sky tells every 2 s at one who is climbing the far cliff** (`enemyNotice` / `enemyGiveUp far` six
    times in 12 s): a tell that never dives.
12. Dropping from the summit into the shaft lands on burr-shaft: hurt on the same frame as its brace (C).

## Nice
- Debug text is still over the picture in the real page: the skin list top right, the key line at the bottom (`01`).
- Hero hard to find: on the bank against the dark rock (blue: eyes and antenna dots carry her), at the shaft's
  foot, at the shrine in the ending before her wings open. Nowhere lost for more than a moment.
- Her wings flare open on every landing from a fall, larger than she is (`06`, `09`): reads as an event when it is not.
- A's two ram hits on burr-bank were 77 frames apart (enemies.md says >= 80).

## Asked about
- **Fights**: for a reader 2-3 exchanges, 4-6 s, readable at play zoom in all three zones; the rim is the
  clearest thing on screen in each (salmon arc ~60 px; blue is the weakest ground but the creature is paler
  than it now). B hopped every ram she tried to hop. Nothing dragged except A's walks back.
- **Lampwing**: an event now: a red light in the tell, a real swoop, a hang she can cut (`09`). Standing still
  is hit ~25 frames into the dive; one who cuts on its arrival kills it in three dives without moving (C).
- **Last beat**: the wake is a sequence now (carving, bud, veins to the bluff, warm ground: `14`), the count runs
  down (`15`), the tally has an offered row with stars. A real ending, quiet rather than a climax: nothing in
  the frame moves more than ~150 px and the camera does not come in. **No glare: brightest frame 0.15% of
  pixels over 200 luma** (all 255 frames; mean luma 31).
- **Visual rule**: holds everywhere. Palest frame is the first lantern's kindle (mean 41, median 32; play5's
  frames 27-33): the mist behind the islands made the blue zone paler, not flat; the islands read against it.
- **Against Ori / Hollow Knight**: at the bar: every still, the island road, the opening frame, the ram's tell
  and clang, the lampwing's dive, the ending picture. Gaps by value: (1) length / a third act, (2) fights that
  hold up against pogo and do not punish the ember take, (3) the cut's weight. Not "Ori/HK level" as a scene
  to play yet; it is as a scene to look at.

## Not tested
- Feel in the hands; whether a person counts the rim's five beats (stills only show the rim).
- A person's reading of the ember mark; the pogo chain over lamp-glide-1 / -2; great-sky; 100%.
- Whether fallen glints are found again after a fade (46 lost in A; not followed).
- Art against collision beyond one overlay pass at 12 stops (`18`: nothing off at that size).

## Method notes (added)
- Serve the bot from the frozen build's folder (`play6-dist/bot.js`, `await import('/opusvania/bot.js')`): one
  rAF loop reads `state()`, dispatches keys, logs `events(n)` by `f`, crops the WebGL canvas with `drawImage`
  inside the same rAF into sheets, returned as data URLs.
- Sheets of a fight: `stage6.js` (manual mode, `step(1)` closed loop, every frame grabbed at the game camera
  and again at `cam({zoom: 3})`), then `__sheet(name, 'pz' | 'zx', from, to, every, cols)`. Wall stun: place her
  at 3556, 1280 after ~120 frames. A step that brakes before a teleported fight misses the `enemyWindup` it starts.
- Two `playwright-cli` sessions on one preview run two bots at once; frame times suffer (p99 25 ms), so time
  performance alone.
- A follower of `guide.lx` dithers under the SHOW flight (it goes straight up): give naive hands the island
  hops instead (`B.hop(S, 'F3' | 'TB')` in `bots/bot.js`; G0 -> F1 is a standing jump at x 962, then steer).
- Read events at the top of the policy: an early `return` in the fight branch ate `lanternKey` once.
