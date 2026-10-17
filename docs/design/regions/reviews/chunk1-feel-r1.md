# Chunk 1 review: feel and combat, round 1

2026-10-17. An independent feel and combat review of the wood from `wood-hatch` to `wood-well` (R1–R10), plus
`lab-lamps`, `lab-creatures` and `lab-kit`. The bar is Hollow Knight, Ori, Nine Sols and Celeste with the art
removed (`docs/design/quality-bar.md` §4). "Good for greybox" counts as a fail.

**Method.** I played against a HEAD snapshot (b58e681) served on its own port, because the shared dev server
HMR-reloaded mid-capture while other agents edited files. I used four kinds of evidence:
- headless sim probes (the `Game` harness, one step at a time, the real follow camera stepped beside it);
- frame-by-frame captures in a `?manual` page (`__game.step(n)` between screenshots);
- one realtime latency test with real `KeyboardEvent`s;
- one clip, `review-feel-burrback-brawl.mp4/.gif`, a naive brawler against `burr-first` in R4 at zoom 1.5,
  241 frames, made with `tools/clip.ts --pickups`.

The probe scripts, stills and the clip are in this session's scratchpad (`review-chunk1-feel/`). They are not
committed. Every number below comes from them unless it cites a memory file.

**Summary.** The sim under the feel is strong. Input reaches the sim one step after the key. The jump, buffers,
coyote time, slash timing, hitstop numbers, tells in frames and failure costs are all at Celeste/HK level. What
fails is everything §4 says must be great in grey and that only render can deliver:
- Getting hit has no impact.
- Creatures are 2 px outlines smaller than her, and nothing on them answers a hit or a kill.
- There is no screen shake at all.
- The snuff, the game's signature beat, gets the same 3.5 px camera kick as a jab, and no darkness.
- The greybox rooms never got the round-4 fall camera, so falls lurch and drop her out of the bottom of the frame.

On top of that, two lamp-verb rules break the forgiveness principle: the beat-free throw is a lottery on orbit
phase, and standing still near a low wick gets her caught.

---

## 1. Verdicts

### 1a. Rubric items this lens owns

| Item | Verdict | Evidence | Reference that does it better |
|---|---|---|---|
| §4 Feedback (juice) must be great in grey | **FAIL** | Her hurt: 0 hitstop frames (she moves on the next step), no shake, no flash, only the HUD lantern dims and the rig poses. A creature hit: its outline turns orange for 14 frames, plus a few 2 px specks. A kill: the outline turns grey for 30 frames, then vanishes. The only shake in the game is a kick of 3.5 px on a cut and 7 px on the finisher (×1.4 on a kill), which is 0.2–0.5% of a 1920 view. No landing dust in grey (it lives in the painted `pf-field`). No trauma value exists (`grep shake src/render/camera`: none) | HK nail hit: a short freeze, a white flash on the enemy, knockback, orange particles, a sound. HK damage taken: a hard freeze, a white screen flash with a dark vignette, shake. Nijman's shake budget |
| §4 Camera final in grey | **FAIL** | None of R2–R10 sets `room.camera`, so they run the default `realFallPx 0` / `targetSmoothY 0` rule that round 4 fixed only for wood-hatch. Peak vertical camera acceleration: R2 walk-off into the catch **8.9 px/f²**, R5 lip walk-off **6.0** (wood-hatch after its fix: 0.85, test limit < 8). Her feet leave the bottom of the frame: R6 walk-off from E0 reaches **1.09** of the view height, R2 **1.13**. The look-ahead is the default 170 everywhere, including R6, a 5760 px flight room (wood-hatch uses 330) | Ori's falls lead downward and never lurch; Keren's "show the landing" |
| §4 Readability by shape and colour | **Partial FAIL** | The burrback's brace reads well: a thick red box, a white armoured front, a red line along the ground showing how far the ram will carry, and a draining bar. But a creature is a 52×34 (burrback) or 52×24 (hawker) **unfilled 2 px outline**. At melee range her rig covers it (`hit-f0..8`, `hurt-0..5`). The hawker's tell is a 4 px bar over a 52×24 box about 480 px above her. The old burrback's "only a pogo on the brace lands" rule has no shape: the same red box, and a white outline only after a wall stun | HK: one silhouette per enemy and a readable windup pose; Nine Sols' hunt colour |
| R8 The camera shows what matters | **FAIL** (falls) / PASS (pit) | See the camera row. The `pit` lock-and-fit zone in R10 works: zoom 0.9375, the whole pit on screen | |
| R9 Failure costs seconds | **PASS** | Thorns: hit, then a 30-frame hold, then she is back on safe ground (0.5 s, back at T2's lip in R6). Fall catch: from leaving the ground to `fallReturn` is 68 frames (1.1 s) in R2. A fade: 50 frames faded, then a 0.6–0.9 s re-form glide. R4's `reform` stands her at the door 1600 px from the burrback (about 3 s of walking: fine) | Celeste, HK spikes |
| R12 Readable in grey (labels off) | **Partial FAIL** | Lures, the field, the core, beat pips and the throw arrow read without labels. The creatures don't (see readability). Rotten bark and seed-cases were not played at length; going by the code, they have a hatched panel with cut pips and spores, and an amber ring | |
| Pillar 2: flight is the joy | PASS on the sim, FAIL on the frame | The movement numbers are good (below), but falls throw the camera and leave her out of frame | |
| Pillar 4: danger is fair and readable | Partial FAIL | The burrback is fair and readable. The hawker's tell is too small. The old burrback's vulnerability windows are invisible. A low wick catches her while she stands still | |

### 1b. Verbs

| Verb | Verdict | Numbers | Note / reference |
|---|---|---|---|
| Input latency | **PASS** | keydown → the jump fires on the very next sim step (5 of 5 trials, realtime page); taps between samples are latched | at or better than HK |
| Run | PASS | 0 → 9.6 px/f in 6 frames, stop in 5 frames / 18 px, a reversal from full speed takes 8 frames (4.8, 0, -1.6 … -9.6) | HK has no acceleration at all, Celeste about 5 frames. The 8-frame turn is the only soft spot; leave it unless Matt calls it mushy |
| Jump | PASS | 1-frame tap 76 px, 3 → 108, 6 → 150, 10 → 196, 24 → 273, held 40 → 276 (apex hang). Rise 24 frames, fall 20 (fallMult 1.6): a snappy asymmetric arc | Celeste/HK feel. Coyote 6, buffer 6, the landing preference and corner correction are all on par (`metroidvania-craft.md` §4) |
| Glide | PASS | From max fall the catch takes 11 frames, a curve rather than a shelf; ratio 2.2 : 1; the held-jump rule stops flat hops from floating | Ori's feather. But see problem 9: a glide near a wick gets caught |
| Wall kick | PASS, with a note | Kicks rise the full 272 px on a tap, with 8 frames forced away | Generous like Celeste. The cost: the player can't make a short kick. Watch it in R9/R10 |
| Pogo | PASS | vy -15.5 (125 px), 32 frames bounce to bounce, down box 100 wide reaching 80 px below the feet, hitstop 2 | HK |
| Slash (sim) | PASS | 1-frame startup, never locks movement, da-da-DUM at 1/18/39, hitstop 4/4/7 on a creature, recoil 10 / 21 px, finisher knockback about 102 px | HK. The numbers are right |
| Slash (what you see land) | **FAIL** | The crescent and contact cross are on her side. On the target only the outline changes colour (`hit-strip.png`). There is no hit flash on the target and no squash | HK: the enemy flashes white for its freeze |
| Lamp pull | PASS | Starts at 0.15 px/f² at the rim and ramps to the core; the her-to-flame line thickens with strength, so the pull reads as gravity. The swirl slingshot over R3's dip works | |
| Caught | PASS (readable) | Core ring thickens, 3 beat pips, a throw arrow that grows on the last beat, rings on catch / beat / free (`caught-strip.png`). The quickest mash frees her in 19 frames, a press every 12 frames in 37 | Ori's Bash UI clarity |
| Beat free (the throw) | **FAIL** | Holding right from W1 over 34 beat rhythms (presses every 6–22 frames, two phases): **7 of 34 throw her left** (vx -13 to -1), **3 of 34 throw her up into W-hi3 and she is caught again** (`caught-strip.png`: thrown up, re-caught 44 frames later, the arrow pointing up while right is held). Several more come out weak (\|vx\| < 5) | Ori's Bash: the stick alone picks the direction. The design doc says "the stick bends the exit" |
| Snuff | **Partial** | Hitstop 9 (the frames read 9,8,…,1), a hot flash for about 10 frames, rings, 12 spokes, 5 moths (`snuff-strip.png`). That reads. But: the camera kick is 3.5 px, the same as a jab; there is no darkness (§4 asks for "the snuff's dark bloom, even as a flat circle"); the moths are 6 px dashes | Ori's Spirit Well, HK's soul totem: the biggest beat changes the screen |
| Being hit | **FAIL** | 0 freeze, 12 frames of stagger, vx/vy ±7, 70 i-frames shown as an alpha pulse (by design "never a white flash"). Nothing on the screen | HK: a freeze, a white flash, a vignette and shake. Celeste's death: a hard freeze and a burst |
| Fade / re-form | PASS | Hurt at f46 → re-form at f96, then the 0.6–0.9 s camera glide under a dip: about 1.6 s back in control | Celeste's quick respawn. Don't let it grow |

### 1c. Creatures and the kit

| Thing | Verdict | Evidence |
|---|---|---|
| Burrback, tell | **PASS** | Brace for 26 frames: thick red outline, white front bar, red ram-reach line and a draining red bar. The best tell in the chunk |
| Burrback, fight | Partial | Naive masher (`review-feel-burrback-brawl.mp4`): 2 hits taken. The first comes at f62: her cut glanced off the braced front, and the ram hit her on the same frame. Kill at f222 (3.7 s). It felt like nothing: see hit feedback |
| Burrback, kill | **FAIL** | A grey outline for 30 frames, then gone. No burst, no extra hitstop (a kill holds the same 4 or 7 frames as any hit), and a kick of 4.9 px |
| Hawker | **FAIL** (tell) | Tell 36 frames, then a committed dive, then a 34-frame stall. Standing still: the first dive misses, the second hits (f190 dive → f222 hurt). Two up-cuts in the stall kill it. Fair in frames, but the tell is a 4 px orange bar over a 52×24 outline about 480 px above her (`hawk-strip.png`). The dive's target point isn't shown. lab-creatures: the stop-start cautious bot was hit 10 times and faded 5 times (memory/creatures.md) |
| Old burrback (R10) | **FAIL** (readability) | A forward cut on it clangs (6-frame hold, thrown back at 8 px/f): a few white specks, and the box doesn't change (`clang-strip.png`). Nothing shows that the shell takes a pogo only while braced, or that every cut lands for 90 frames after a wall stun, apart from a white outline. Bots fade 10–60 times in the pit (memory/playtest-harness.md). In the `pit` zone at zoom 0.94 she and it are small |
| Thorns | PASS (time), weak (feedback) | 1 light, a 30-frame hold, then back on safe ground with a room-fade dip; i-frames are ignored. No hitstop or shake on the touch |
| Fall catch | PASS | 1.1 s, a dip over the hold |
| Bark / seed-case | not measured in play | By code: bark gets a panel shake, hitstop 4 a cut and 8 on the break; a seed-case clang holds 6 frames and throws her back at 8 px/f. Plausible. Check them with labels off next round |
| Camera zones | PASS | R10 pit lock-and-fit 0.9375, R5 `lip`, R2 `vista` |

---

## 2. The 10 worst feel problems, ranked

**1. Getting hit has no impact.** A ram, a hawker's dive or thorns cost a light, and the screen doesn't react: no
freeze, no shake, no flash. The HUD lantern dims in the corner. This is the moment HK sells hardest, and here it
isn't felt.
- *Fix (sim):* add `health.hurtHitstop` 8. Hold her and the creature that hit her, the way slash hitstop already
  holds both; thorns use it too.
- *Fix (render):* a full-view flash on `hurt` (white at 0.35 alpha for 2 frames, then a dark vignette pulse over
  0.3 s); camera trauma 0.5 (problem 3); and on her last light a heavier hold of 14 and a desaturating pulse.
- *Owner:* sim movement (`hurtPlayer`), camera, greybox render.

**2. Creatures are hollow outlines, and hits and kills don't land on them.** The burrback is a 52×34 2 px
rectangle, smaller than her and drawn where her rig covers it; a hit turns the line orange; a kill turns it grey.
In grey, the creature is the thing the player reads, and here it's a debug overlay.
- *Fix:* draw greybox creatures as filled shapes. Use a body colour per kind, and draw the danger part separately:
  the shell's front for a burrback, the beak or underside for a hawker.
- On `enemyHit`, fill it white for the hitstop plus 2 frames and squash it 1.15 × 0.85 over 4 frames.
- On `enemyDie`, hold the white silhouette for the kill's hitstop, then burst it into 8 shards and a ring.
- Add `enemies.killHitstopBonus` 3, so a kill holds 7 frames on a plain cut and 10 on the finisher.
- *Owner:* greybox render (`drawEnemyBoxes` is the debug overlay's; give greybox its own creature view), sim
  creatures for the kill bonus.

**3. There is no screen shake.** §4 names "screen shake (one trauma value)" as a must in grey. Only `CameraKick`
exists, and at 3.5 and 7 px it can't be seen at 1080p.
- *Fix:* add a render-side `trauma` value (0..1). The offset is `maxShake 22 px × trauma²` with smooth noise,
  decaying 1.8 per second.
- Budget, loudest first: snuff 0.45, her hurt 0.5, a kill 0.3, a ram into a wall 0.3, a bark break 0.3, a hard
  landing 0.2, the finisher 0.12, a clang 0.1.
- Raise the kick to `power1` 6 and `power2` 11.
- *Owner:* camera (`kick.ts` and a new `shake.ts`, numbers in `camera/tuning.ts`).

**4. The snuff isn't the loudest beat, and the dark doesn't come.** The core loop's payoff is "hitstop, the flame
dies, dark blooms outward, moths burst". We have the hitstop and a flash, but the camera kick is the same as a
jab's, nothing gets darker, and the moths are 6 px dashes.
- *Fix:* a flat dark disc grows from the flame to the old pull radius over 0.5 s (multiply 0.6), then settles to a
  permanent slightly darker wash where the field was, so a cleared room *looks* safe.
- Add trauma 0.45, a 2-frame white flash on the frame the flame goes out, moths drawn as 10–12 px chevrons, and a
  2-frame pulse on the HUD lantern that `healOnSnuff` refills.
- *Owner:* greybox render (`lures.ts`), camera.

**5. Falls in the greybox rooms lurch and lose her.** Walking off R6's E0, her feet reach 1.09 of the view height
(off the bottom). In R2 they reach 1.13, and the camera accelerates at 8.9 px/f². R5's lip gives 6.0. Round 4 fixed
this only in wood-hatch's `camera` block.
- *Fix:* give every wood greybox room (or the region, as a default) wood-hatch's fall block: `realFallPx` 250,
  `targetSmoothY` 10, `smoothYFastFall` 5, `fallLookahead` 320.
- Set `lookaheadX` 330 / `leadFrames` 36 in R2, R6 and R9.
- Extend `rooms.test.ts`'s headless camera check (peak acceleration < 8, feet inside 0.15–0.85) to every wood room.
- *Owner:* camera, plus the room data.

**6. The beat-free throw ignores the stick a fifth of the time.** Holding right, 7 of 34 rhythms threw her left
and 3 of 34 threw her straight up into W-hi3 to be caught again. The throw is the radius she happens to be at,
bent by `freeSteer` 0.8, so where she is on the orbit when the third beat lands decides it. A player who chose a
direction and got the opposite one blames the game.
- *Fix:* when a direction is held, throw along the held direction (8-way, with Up as the default), blending in the
  radius only as a tie-break (`dir = normalize(held + 0.25 × radial)`).
- Freeze the orbit for the last beat's 6 frames, so the arrow she sees is the throw she gets.
- Give `graceFrames` 50 to every lure the throw passes through in its first 20 frames, so a throw can't be caught
  again by another wick straight away.
- *Owner:* lures (`src/sim/lures.ts`, `tuning.lures.freeSteer`).

**7. The hawker's tell is too small and too far away.** A 4 px bar over a 52×24 outline, about 480 px over her
head, for 36 frames, and the point it will dive at isn't shown.
- *Fix (greybox):* during the tell the body swells 1.3× and fills in the hunt colour with quickening flashes, the
  same language as the burrback brace bar.
- Mark the committed target on the ground under her: a reticle that tightens over the last 12 frames, and a dashed
  dive line.
- The dive leaves a 6-frame smear.
- *Owner:* creatures render (greybox). Sim timings stay as they are.

**8. The armoured creatures' rules are invisible.** The old burrback clangs on everything except a pogo during its
brace or any cut after a wall stun. In grey the only signs are a few specks and a white outline when stunned. The
pogo exam is unreadable, which is why bots fade 10–60 times.
- *Fix:* draw the shell as a filled dome. During a brace its top turns the seed-case amber ("pogo me": the kit's own
  language) and greys out once it has been pogoed (`pogoed`).
- A clang shows a big white star at `hitX/hitY` and a 0.1 trauma shake, and the shell rings (a 4-frame offset).
- A wall stun flips the box over (or draws it upside down) and fills it pale for the 90 frames, with a draining
  bar.
- *Owner:* creatures render (greybox), camera.

**9. Lamps catch her when she's standing still or gliding.** Standing on R3's knob (the spot the paper says a
standing cut snuffs W2 from), she drifts 58 px into the core and is caught while idle. memory/lures.md notes that
glide plus double jump get caught a lot near flames, and the R6 bots were pulled into W4 by every hop under it.
The pull should feel like gravity you ride, not glue.
- *Fix:* no ground drag when there is no input (`groundDrag` × 0 while `inputX` = 0 and she is grounded).
- A gliding body feels `glidePullMult` 0.6.
- The catch needs her to be moving inward or to have spent 4 consecutive frames in the core (Celeste's rule that
  the threat's box is tight).
- *Owner:* lures.

**10. The small grey juice is missing.**
- No landing dust or hard-landing shape in grey: `pf-field` only draws in painted rooms.
- No puff on a jump or a wall kick, and no wall-slide dust.
- No terrain clang when a slash meets a wall (`combat.md`'s open "wanted" item), so slashes at walls feel like
  whiffs.
- Thorns get no hitstop.
- *Fix:* a greybox `motes.ts` module, with 2–3 flat arcs or dots per event scaled by `land.vy` (`hard` adds trauma
  0.2), and dust while wall-sliding.
- A `slashTerrain` sim event (the first live frame where the slash box overlaps a solid on the facing side): 2
  frames of hitstop, a spark and 3 px of recoil.
- Thorns get the hurt hitstop from problem 1.
- *Owner:* greybox render, sim movement.

---

## 3. What's good (keep)

- **Input to sim latency of one step**, latched taps, and Celeste-grade forgiveness: coyote 6, buffer 6, the landing
  preference, corner corrections of 20 / 16 / 24 px, and a slash buffer of 8.
- **The jump curve**: a 76 → 276 px range on the hold, a 24-frame rise, a 20-frame fall. It is crisp and
  controllable.
- **The slash as a system**: 1-frame startup, no movement lock, a lunge and recoil that never take her off a ledge,
  the da-da-DUM combo, and hitstop numbers in the reference ranges.
- **The burrback's brace**: thick red outline, armoured front, ram-reach line and countdown bar. This is the
  readable-tell language the rest of the creatures should copy.
- **The lamp's UI in grey**: the field wash, the pull line that thickens, the core ring, the beat pips, the throw
  arrow, and the snuff's flash, ring and spokes. Snuff hitstop 9 really is the longest hold.
- **Failure is cheap**: thorns 0.5 s, a fall catch 1.1 s, a fade about 1.6 s, R4's re-form at the door. Nothing
  outside a boss costs over 5 s.
- **The R10 pit's lock-and-fit zone**: the whole fight on screen.
- **The glide's catch curve** (no shelf) and the held-jump rule.
