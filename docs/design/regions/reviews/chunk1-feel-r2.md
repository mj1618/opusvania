# Chunk 1 review: feel and combat, round 2

2026-10-18. An independent feel and combat review of the wood (R1–R11 and R14 `wood-caps`), plus `lab-creatures` for
the web and weaver. I didn't build any of it. The bar is Hollow Knight, Ori, Nine Sols and Celeste with the art
removed (`docs/design/quality-bar.md` §4). "Good for greybox" counts as a fail. I judged HEAD fresh, and I credit
only what is on screen and in the hands.

**Method.** I played a clean snapshot of HEAD (377cba9), checked out as a detached worktree and served on its own
port (5291) with hot reload stubbed out, so other agents' edits couldn't reach it. Evidence came from five sources:
- **Frame-stepped play** in `?manual` pages. An in-page policy chose each frame's input (the same input path as the
  `input()` DSL), with a screenshot on every frame around each event. Fights: a naive masher and a dodging bot
  against R4's burrback, R10's old burrback and R8's hawker. Also R3's catch, throw and snuff, R6's thorns and
  last-light fade, R4's seed-cases and floor bark, R14's caps, R2's vista, the hub's glimpse, R9's dangler and
  the lab's web.
- **One realtime test with real `KeyboardEvent`s** (latency).
- **Headless sim probes** on the snapshot's `src/sim`, with the real follow camera stepped beside the sim: falls
  in every wood room, a sweep of throw rhythms, idle drift and glide lines.
- **Pixel measurements on the captures:**
  - Shake: the same fight was captured with and without `?noshake` (identical sims), and the screen offset was
    found by image search. Captures are 1280×720, so ×1.5 gives 1080p pixels.
  - Vignette: edge and centre brightness.

Probes, strips and numbers are in this session's scratchpad (`review-chunk1-feel-r2/`) and aren't committed.

**Summary.** Round 1's render work landed. Creatures are filled, answer blows and die in a burst. The hawker has a
real tell, the snuff has its dark, and the throw obeys the stick on every rhythm. Lamps no longer pull her in while
she stands still, motes exist, and falls no longer lurch. The lamp verb is now the best thing in the chunk.

What fails now is mostly about **weight and stakes**:
- The first mini-boss can be beaten by standing still and mashing.
- The creatures, the mini-boss above all, are too small to be presences.
- Her hurt still doesn't land, because the shake is under the threshold of perception and the vignette is dark
  on dark.
- The camera keeps putting her at the bottom edge on falls and in the zones.

---

## 1. Verdicts

### 1a. Round 1's ten problems

| # | Round 1 problem | Verdict | Evidence now | Reference that does it better |
|---|---|---|---|---|
| 1 | Getting hit has no impact | **PARTLY** | Sim side done: 8-frame hold (14 on the last light), a white 8-point star at the contact. But the shake I measured on her first hurt in R4 is **≤ 1 px at 1280 (≤ 1.5 px at 1080p)** and on the second 3 px (4.5 at 1080p), against 6 px for a plain cut's kick. The dark vignette takes the edge brightness from **40 to 31 out of 255** on a background that is already near black, so it's invisible. What reads is the star and the freeze. Nothing changes on the screen as a whole | HK: the screen goes white for a frame, then dark, with a hard shake and a long freeze. Celeste's death burst |
| 2 | Hollow creatures, hits and kills don't land | **FIXED** (burrback, hawker, old burrback), **NOT** (dangler, weaver) | A hit fills the body white for the hold + 2 frames and squashes it (`s-hitflash`). A kill holds a white silhouette for 10 frames, then 8 shards and a ring, with a 15 px kick at 1080p. The dangler and the weaver are still "a filled box with a red front half": the dangler is a 30×26 square (about 24 px on screen at 1080p in R14) and the weaver a box beside her inside its web | HK's crawlid, vengefly, False Knight: one silhouette each |
| 3 | No screen shake | **PARTLY** | One trauma value with a budget exists, but `22 px × trauma²` puts most of it under perception: a kill is 2 px, a ram into a wall 2, a hard landing 0.9, the finisher 0.3. Measured on a finisher kill, the offset is all kick (10 px at 1280). The kicks (6 / 11 / 15 px) carry the cuts and are now visible. The trauma shake only shows on a hurt, and there it's small (row 1) | Nijman's shake budget: the loudest beats move the frame by 1–2% of its width, not 0.2% |
| 4 | The snuff isn't the loudest beat | **FIXED** (mostly) | A 2-frame hot flash, then rings, 12 spokes and a dark disc that grows to the pull radius and leaves a lasting wash. The freed moths are now chevrons and the snuff kicks 15 px (`s-snuff`). A leftover: the HUD's moth count appears showing **0** and only ticks to 3 about 1.5–2 s later, when the moths arrive | Ori's Spirit Well |
| 5 | Falls lurch and lose her | **PARTLY** | No lurch now: the peak vertical acceleration is ≤ 6.8 px/f² in every wood room. But while she falls faster than 6 px/f, her feet sit at **0.93–0.97 of the frame**, so only **37–95 px** of the world under her is on screen: 2–4 frames of warning at max fall. Cases: R2's drop to the exit (x ≈ 4680–4870), R6's gap 1 (zoom 0.75), the hub's look-up zone (0.97), R11 (0.91). `wood-camera.test.ts` passes at < 0.97, so the test now enshrines the bottom edge | Ori's falls lead downward; Keren's "show the landing" |
| 6 | The throw ignores the stick | **FIXED** | 16 of 16 rhythms (a press every 6–20 frames, two phases) holding right throw (14, −7) and land on the far side. Holding up-right, 16 of 16 throw (10, −17). No re-catches. The arrow is the throw | Ori's Bash |
| 7 | The hawker's tell is too small | **FIXED** (tell), **new problem** (the dive) | During the tell it swells, flashes in the hunt red and closes a ring round itself. A reticle under the target tightens and a dashed line runs to it, and the dive leaves a smear (`s-hawk`). But the dive is **65 frames at 6.4 px/f**: notice at f94, dive at f130, contact at f195. That's a drift, not a strike (problem 5) | HK's vengefly, Nine Sols' fliers |
| 8 | The armoured creatures' rules are invisible | **FIXED** (readability), **new problem** (the fight) | Readable at close zoom: braced, the shell top goes amber ("pogo me"); open, it lies on its back, pale, with a green bar; a clang shows a star and a shiver; there are cracks per hp and chips on every third (`s-old-z`). But a fighter who never dodges wins (problem 1), and in the pit it is smaller than her (problem 2) | HK's False Knight |
| 9 | Lamps catch her standing still or gliding | **FIXED** | Idle at 9 spots beside R3's and R4's low wicks for 600 frames: 0 px of drift and never caught. Gliding feels 0.6 of the pull | |
| 10 | The small grey juice is missing | **FIXED** (mostly) | Landing dust scaled by the fall, a ring on a hard landing, jump puffs, wall dust and `slashTerrain` sparks with a 2-frame hold (seen on R3's root knob). Thorns hold 8. Still thin: a cap bounce has no squash or anticipation (problem 10), and a seed-case clang is three white ticks on the ring | |

### 1b. Verbs now

| Verb | Verdict | Evidence | Note / reference |
|---|---|---|---|
| Input latency | **PASS** | Real `KeyboardEvent`s in a realtime page: the jump fired on the next sim frame in 6 of 6 presses | HK level |
| Run, jump, glide, wall kick, dash | PASS (unchanged) | No movement tuning changed since round 1 (`git diff b58e681 -- src/sim/tuning.ts`: only the walk-off coyote split, the kit and the lamp rules). Round 1's numbers stand | The 8-frame turn is still the one soft spot |
| Walk-off glide forgiveness | PASS (by code and tests) | A late press off an edge with no double jump left opens the wings; returns never chain (`hazard-return.test.ts`). Not played at length | |
| Slash, hit | **PASS** | A white fill and squash on the target, the contact cross, the kick 6 / 11 px, a 4/4/7 hold | HK nail |
| Slash, kill | **PASS** | A 10-frame white silhouette, then shards and a ring, a 15 px kick | |
| Slash into a wall | PASS | `slashTerrain`: sparks, a 2-frame hold, about 3 px of recoil | HK's nail on terrain |
| Pogo | PASS | A pogo off floor bark holds 2 and sends her up 125 px; bark takes it | |
| Lamp pull, caught, beat free | **PASS** | Pull line, core ring, pips, arrow; the throw is the stick's, every time (`s-caught`) | Ori's Bash UI |
| Snuff | **PASS** | See 1a row 4 | |
| Being hit | **FAIL** | See 1a row 1 | |
| Fade / re-form | PASS on time, weak on stakes | Last light: a hold of 14, 50 frames faded, then she re-forms with **2 of 4 lights**, beside the fight unless the room has a `reform` point (R4, R10 and R14 do; R6, R8 and R9 don't), and creatures keep their wounds. Problem 7 | HK: a death costs the shade walk |

### 1c. Creatures, the kit, the lamps, the camera

| Thing | Verdict | Evidence |
|---|---|---|
| Burrback (R4) | PASS (tell, hit, kill), weak (size) | Naive masher: 2 hits taken, kill at f291 (4.8 s). One hit came from a finisher that glanced off the brace's first frame. The tell is still the chunk's best. At 52×34 it reaches her knee, which is the crawlid's ratio and fine for fodder |
| Old burrback (R10) | **FAIL** (the fight), PASS (the states read) | A masher that never dodges **wins in 10.8 s with 1 of 4 lights left**: 3 hits taken, 8 cuts landed, 11 clangs, 2 feints. My dodging bot (badly timed jumps) won in 11.9 s, also taking 3 hits. In the pit the camera fits at zoom **0.833**: it is about **70×42 px at 1080p, shorter than she is** (67 px), with her feet at 0.90 of the frame. The upper two thirds of the screen are the empty pit (`s-old`) |
| Hawker (R8) | Partial | Tell, ring, reticle and smear read (`s-hawk`). The dive is 65 frames long: any step dodges it, and it looks like drifting. It is still 52×24 |
| Dangler (R9, R14) | Partial | The tell (34 frames, the silk shown down to her level) reads (`s-dangler`), but the body is a generic box. My hopper ran R9's composed encounter (burrback on the platform, dangler, lantern) along the floor and out at x 3544 with 0 hits: the composition doesn't engage a runner (level) |
| Web + weaver (lab only) | Partial | The grab, beats and run read. The weaver is a box beside her in the web, and its 24-frame count has no shape. Not in chunk 1 yet |
| Thorns | PASS | 8-frame hold, a star, a 30-frame hold, a dip to dark, the return, an 18-frame fade-in. About 0.8 s in all (`s-thorn`) |
| Seed-case | PASS (time), thin (feedback) | A forward cut clangs (hold 6, 8 px/f recoil) with three white ticks on the ring. Standing beside one at chest height (R4's seed-0), every forward cut clangs |
| Rotten bark | PASS | Hatched panel, cut pips, moonlight through the floor bark; pogo cuts land |
| Bounce caps | Partial | `capBounce` is exact (448 px mid). On screen: a ring and chevrons, no squash or anticipation, and the camera barely moves with the rise |
| Camera: falls | **PARTLY** | 1a row 5 |
| Camera: zones | **FAIL** (hub), partial (pit) | The hub's `rest` zone frames her at **zoom 0.5 with her feet at 0.95**: she is about 40 px tall at the bottom edge, all the way across the hub floor. The pit: 0.833 and 0.90. R6 gap 1: 0.75 |
| Camera: vista (R2) | Partial | Moon, swarm stream, valley lights and the title read. But a runner gets the title about 1.3 s before she drops out of the room (`flagSet` f423, room exit f548). The beat never holds (problem 8) |
| Camera: glimpse (hub) | Partial | The look-up finds the firefly (a dot) and the glow-cap, but she is **off screen for about 4 s with input live** (`s-glimpse`) |
| Hazard and fall returns | PASS | Never chain; fade-in; a fresh press needed |

---

## 2. The 10 worst feel problems now, ranked

**1. The first mini-boss can be beaten by not dodging.** The old burrback lies open after **every** ram, including a ram
that hits her. It takes 3 cuts a window and has 12 hp, so 4 rams kill it, and she has 4 lights. A masher who never
jumps or steps back wins in 10.8 s with a light to spare (3 hits, 8 cuts, 11 clangs). The fight's whole design (the
brace, the amber "pogo me" top, the feint) is optional. False Knight kills a player who stands and swings.
- *Fix (sim):* the open window has to be earned. A ram that **hits her** gives no window: it stops, turns and walks
  back to brace. Only a ram that misses, or one that hits a wall (120 frames), lies it on its back.
- Keep 3 cuts a window, and keep the pogo on the brace as the bonus damage.
- *Test:* the masher must fade on most seeds (`old-burrback-pilot.test.ts` gains a no-dodge pilot that must lose),
  while the slow first-timer pilot still wins in 1–3 attempts.
- *Owner:* sim creatures (`tuning.oldBurrback`, `openWinded`).

**2. The creatures are too small to be presences, and the mini-boss is shorter than she is.**
- At the pit's fit zoom (0.833) the old burrback is about 70×42 px at 1080p and she is 67 px tall. The fight sits
  in the bottom 15% of the screen, under an empty two-thirds of pit air (`s-old`).
- The dangler is a 30×26 box (about 24 px on screen), the hawker a 52×24 sliver, the weaver a box.
- This is the hurt box and the camera, not the art, so it has to be right in grey.
- *Fix:*
  - Make the old burrback about 2× (a 160×96 dome), with contact following the dome as now, and a ram reach to match.
  - Frame the pit at zoom 1.0 with `lock` and no `fit` (the camera follows inside the arena), or cut the arena to
    about 1400 px wide so the fit is near 1.
  - Give the dangler a body: a 40 px abdomen, 8 legs that fold on the tell, the silk.
  - Give the weaver a silhouette of its own: the boss's language, small.
- *Owner:* sim creatures (box sizes), greybox render (`creatures.ts`), level (the pit's size and zone).

**3. Her hurt still doesn't land, and the shake budget is under the threshold of perception.**
- A hurt measures ≤ 1.5–4.5 px of shake at 1080p.
- The vignette darkens edges that were already near black (brightness 40 → 31 out of 255).
- Kill, ram-into-wall and bark-break trauma is 2 px, a hard landing 0.9.
- On screen, only the white star and the 8-frame freeze say she was hit.
- *Fix:*
  - Make the shake curve `max × trauma^1.5` with `shake.max` 30. That gives about 10 px for a hurt (0.5) and 5 px
    for a kill (0.3), and makes the small beats perceptible.
  - Add a hurt **kick** of 12 px along the blow's direction (the kick system already reads at 6–15 px).
  - Replace the dark vignette with something that reads on a dark background: a 2-frame full-view light flash (white
    at 0.2, the screen, not her body) and then a red-tinted edge at 0.35 for 0.3 s. On the last light, desaturate
    for the 14-frame hold.
  - The no-white-on-her rule (`memory/feel.md`) is kept: ask Matt only if the screen flash is too close to it.
- *Owner:* camera (`shake.ts`, `kick.ts`, `hurt-fx.ts`, `camera/tuning.ts`).

**4. The camera keeps putting her at the bottom edge.**
- At max fall her feet are at 0.93–0.97 of the frame in R2, R6, R11 and the hub: 37–95 px of world under her, so
  2–4 frames of warning.
- The hub's rest zone holds her at zoom 0.5 with her feet at 0.95 across the whole hub floor. The pit holds 0.90.
- *Fix:*
  - Add a fall lead that scales with `vy`: after 8 frames above 12 px/f, the target puts her feet at ≤ 0.65 (Ori
    shows the floor before she reaches it).
  - Zones obey the same rule (a fall inside a zone still leads down).
  - The hub's rest frame should be a frame at the patch only (a small zone around P3, zoom ≥ 0.75), not the floor's
    whole width.
  - Tighten `wood-camera.test.ts`: feet ≤ 0.80 for any fall over 300 px, zones included.
- *Owner:* camera (follow and zones), level (the hub's zone rect).

**5. The hawker's dive is a drift.** After a good 36-frame tell, the committed dive takes 65 frames at 6.4 px/f:
1.7 s from notice to contact. A single step dodges it, and on screen it glides down like a leaf. The tell is the
warning; the strike has to be fast, or the creature is never a threat to anyone who saw the tell.
- *Fix:*
  - Split the dive: 6 frames of anticipation (it rises and pulls back along the line, wings folded), then a strike
    at 14–16 px/f capped at about 30 frames to the committed point, then the 34-frame stall as now.
  - Keep the reticle committed, so a reaction inside the tell still dodges.
  - Re-run the stander and runner pilots: a stander is hit, a stepper never is.
- *Owner:* sim creatures (`tuning.hawker`), greybox render (anticipation and smear).

**6. R6 is crossed with one held input.** Run at the first lip, jump and hold right with jump held. The coyote jump
meets `wick-line`'s pull, which slingshots her up to 731. From there the glide (2.3 : 1) carries her over gap 1,
over T3, under the thorn branch and over gap 2, and she lands at x 5336 beside `burr-ledge` at f367. It's one input
for 6 s. Pillar 2 says flight is the joy, but the room's tests (the walk-off at gap 1, T3, the branch) never happen.
- *Fix (level):* a ceiling or canopy over T3, so the line from the lip meets something or must land on T3. Or move
  `wick-line` so its swirl doesn't add height on the run-off line.
- *Test:* the glide from every take-off on the first top must land on T3 or in gap 1's catch.
- *Owner:* level (R6), lures (if the wick moves).

**7. A fade costs about a second and two lights, beside the fight, and creatures keep their wounds.** In rooms
without a `reform` point (R6, R8, R9 and most others), the last light re-forms her about 0.8 s later at her last safe
ground near what faded her, with 2 of 4 lights, and the creature keeps its wounds. Every fight can be brute-forced by
attrition, which flattens the stakes problem 1 has. Hazards should be cheap (HK's spike rule: keep it). A death
should cost a walk.
- *Fix:* a fade re-forms her at the last moon patch she rested at, or at the room's entry door when no patch is
  saved this region, never beside the creature.
- Creatures heal on a fade; R4's own `reform` already does the door.
- R9 "failure costs seconds" stays met: a door is at most about 10 s.
- *Owner:* sim (`src/sim/index.ts` fade / `reform` rule), level (a `reform` per room where a door is far).

**8. The staging beats don't hold, and the glimpse leaves her.**
- R2's vista: a runner sees "LAMPFALL" fade in about 1.3 s before she drops out of the room, while the camera lifts
  and she keeps running.
- The hub glimpse: the camera pans off her for about 4 s with input live, so a player who keeps walking walks blind.
- Ori's and HK's vista beats are short holds, or framings that keep the player in view.
- *Fix:*
  - Make the vista a held beat in the sim (≤ 2.5 s, input ignored, she slows to a stand at the lip), with its
    trigger moved to a ledge where she has to stop.
  - The glimpse zooms out to include her rather than leaving her, or holds input for its 4 s the same way.
  - Both play once a save, as now.
- *Owner:* staging (`stage-cam.ts`), sim (a `hold` trigger kind), level (trigger placement).

**9. Designer overlays and colour collisions in normal play.**
- With labels off, the dashed violet camera-zone frames, the cyan trigger plates and the red catch washes are drawn
  in the world. R2's vista is criss-crossed with them (`s-vista`).
- On every notice, a cream "thread" runs from the creature's eye to her. It is the giving system's "caught" thread
  (`src/render/giving/index.ts`, test-grove era) and it uses the same colour as the lamp's pull line, so "a lamp
  pulls you" and "a creature saw you" look the same (`zh.png`).
- *Fix:*
  - Draw zone and trigger outlines only with G (labels) or F2.
  - Recolour the seen-thread to the hunt red (or drop it in lamp rooms) so cream means only the lamp.
- *Owner:* greybox render (`kit.ts`, `static.ts`), giving render.

**10. Small feedback holes.**
- The HUD hides her lights at full health. Walking into a fight she can't see what she has until the first blow; HK
  never hides the masks.
- A cap bounce has no squash or anticipation and the camera hardly follows the rise.
- The seed-case clang is three ticks.
- After a snuff the moth count shows "0" for about 1.5 s before it ticks.
- *Fix:*
  - Show the lights whenever a creature is aware of her or she is lit.
  - Squash the cap 0.7 for 3 frames before the throw, with a ring and a 0.1 trauma.
  - Give the seed-case the clang star the old burrback uses.
  - Show the count only when the first moth arrives.
- *Owner:* HUD, greybox render (`kit.ts`).

---

## 3. What's good (keep)

- **The lamp verb is now the best feel in the chunk.**
  - A pull you can read (the line thickens with it), a caught state with pips and an arrow, and a throw that is
    exactly the stick on every rhythm I tried (32 of 32).
  - It never drifts her while she is idle.
  - A snuff with a flash, spokes, a dark disc that leaves a darker, safer room, a 15 px kick and moths that fly to
    the count.
- **Blows land on creatures.** A white fill and squash for the hold, a white silhouette then shards on a kill, and
  kill hitstop that grows with the blow (7 / 10).
- **The burrback's brace and the hawker's tell are a consistent language:** hunt red, a quickening flash, a ring, a
  reticle on the ground, a reach line on the ground.
- **The old burrback's states read:** amber "pogo me", pale on its back with a green bar, cracks per hp, chips per
  third.
- **Input to sim latency is one frame with real keys.** Coyote, buffers, corner corrections and the walk-off glide
  forgiveness are all at Celeste level.
- **Hazard returns:** about 0.8 s, a fade-in, no chained hits, a fresh press. HK's spike rule, done right.
- **Falls no longer lurch** (≤ 6.8 px/f² everywhere). Motes give the grey world its contact: dust, a hard-landing
  ring, wall dust, terrain sparks.
- **The R2 vista's content** (the moon, the swarm stream, the valley lights, the title) and the hub's look-up are real
  camera moves onto shapes. Only their timing and holding are wrong.
