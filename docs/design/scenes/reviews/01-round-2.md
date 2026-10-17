# Scene 1 review, round 2 (2026-10-17)

Reviewer: an independent agent that wrote none of this code. The bar is Ori and the Blind Forest, Hollow Knight and
Nine Sols. "Good for code-drawn art" counts as a fail. Only what is on screen gets credit, not effort or improvement.

## What was looked at
- `npm run shots` at 1920x1080, `--size 2560x1080` and `--size 1440x1080` (wide stops 1–8), plus the close-ups.
- Captures of my own through the debug API (`?manual&nopickups`, 1920x1080, scratch scripts, not committed):
  - **The opening** after `g.load()` (with the fade), at frames 1, 30, 60, 90, 120, 150, 180, 240, 300 and 360.
  - **Three presses** at frame 360 (`J1 .20 J1 .20 J1`). The break lands at frame 403 (6.7 s). I took every 3rd
    frame to 640 at zoom 1, and every 2nd frame to 600 in close-up.
  - **No input:** the break comes on its own at frame 720.
  - **Tatter** in close-up, every 30 frames from 620 to 1100.
  - **The swarm pass, standing still**, every 20 frames from 660 to 1080.
  - **A naive bot** (hold right; a 14-frame jump when blocked or 12 px from an edge), from the break to the exit,
    every 6th frame captured, with the camera logged every frame. A second run waits 2.5 s after the break, like a
    player watching the swarm.
  - **A walk-off** at the branch end (hold right, no jump).
  - **A fall catch** off the end of S5.
- Clips (`npm run clip -- --setup "g.load()" --pre 0 --wide`): the first 15 s, and the whole bot run replayed as a
  script.
- `npm run look:stats` on S1–S6 and on the wide stops. Also band boxes, a warm-hue mask, 96x54 thumbnails, a luma-30
  threshold, a 1 s frame difference, a walk-line profile and a kick measurement (all scratch numpy).
- Greyscale side by sides: S1 with `ori-wotw/26`, S3 with `ori-bf/15`, S4 with `ori-wotw/06`, S6 with `ori-bf/01`.
  Colour comparisons with `ori-bf/10` and `hk/08`.
- `npm run check` passes: typecheck, lint, unit and 8/8 e2e.

**The S shots.**
- **S1:** frame 240 (4 s, the cocoon row).
- **S2:** frame 430 (mid break-out, she hangs from the silk).
- **S3:** frame 800 (the swarm at its peak on the moon, standing still, with the lean).
- **S4:** bot frame 765 (mid-run on S5, 12.75 s).
- **S5:** bot frame 699 (the apex over the crown → S5 gap).
- **S6:** bot frame 1023 (about 0.25–0.4 s after her feet leave the branch end).

**Limit.** I did not play by hand at real time. Feel is judged from frame sequences, the sim log and the clips'
frames, and I say so where it matters.

### Numbers (look:stats)
| shot | mean | near-black % | >150 % | >217 % | p99.9 | chroma | hue % | top Q | bottom Q |
|---|---|---|---|---|---|---|---|---|---|
| S1 | 32 | 36.0 | 1.12 | 0.00 | **194** | 35 | 99 azure | 33 | **20** |
| S2 | 31 | 36.8 | 1.14 | 0.00 | **194** | 34 | 99 | 30 | **21** |
| S3 | **34** | **29.5** | 1.14 | 0.00 | **196** | 37 | 100 | 38 | **22** |
| S4 | 29 | 42.4 | 1.03 | 0.01 | **212** | 31 | 99 | 32 | **30** |
| S5 | 31 | 37.6 | 0.54 | 0.01 | **205** | 35 | 99 | 28 | **29** |
| S6 | 32 | 37.4 | **0.26** | 0.00 | **160** | 35 | 100 | 39 | 12 |
| target | 24–32 | 35–50 | 0.3–1.5 | 0.1–0.6 | 215–240 | 30–42 | ≥ 70 | 20–40 | 6–16 |

The wide stops average out the same: mean 30, near-black 37.9 %, p99.9 203, bottom quarter 21 (12 at the branch end).

Bands (box means, with the p90 − p10 spread):

| band | measured | target |
|---|---|---|
| moon disc | 187 (S1), 189 (S3), 202 (S4) | 205–225 |
| moon halo, 1.05–1.5 r | 86 (S4), 122–131 (S1/S3, the ring catches the disc edge) | 90–130 |
| sky away from the moon | 31 (S1), 22 (S3), 28 (S4), spread 18–31 | 18–35 |
| fog band behind the cocoons | 54, spread 24 | (stage) 45–80 |
| far crowns below the branch | 26 (S1, spread 34), 41 (S4, spread 40) | 30–48, spread ≤ 30 |
| mid trunk, shaded side | **12** (S4, spread 15) | 14–26 |
| branch body and underside | 8–9 (S1), 16 (S4) | 10–20 |
| walk rim | p90 99–104 | p90 100–135 |
| foreground leaf (S1) | 13 (p10 5) | 2–10 |
| warm pixels | 0.004–0.11 % of the frame. The afterglow is a dim orange line at y 0.77–0.80, x 0.75–1.0, and p90 58 in that row. All warm-mask hits above y 0.75 are her gold eyes | ≤ 3 %, below y 0.75 |

**Wing** in S4: the dark half of her box has p50 11, the whole box p25 24, and the 300 px around her is 45 (the box
stage measured 71). This passes.

**Timing.**
- The break lands at 6.7 s.
- The bot goes from the break to `roomExit` in **11.5 s**, with no catches and 9 jumps.
- From boot to the exit: 18.2 s. With a 2.5 s look at the swarm: 20.7 s.
- The fall catch takes 1.0 s from the fall to the return (`fall` 258 → `fallCatch` 299 → `fallReturn` 317).

---

## 1. "Done means" (brief items 1–9)

| # | Verdict | Evidence |
|---|---|---|
| 1 Any screenshot holds up next to the references | **FAIL** | Value ordering and the palette are disciplined, and the far warm accent is now there (a thin orange line, right half). The focal point in S1 is clear: the moon, then the pale stage behind Tatter. **But "nothing rectangular" still fails, and this sets the tier of every frame.** S1's walk line is flat to ±4 px over 1350 px (70 % of the width; profile measured). Past the burl the branch is a chain of **separate flat-topped log slabs, each with a parallel underside and a flat cut end, joined by thin twigs in mid-air** (wide-2..7). At the branch end, S9 is a small slab on a long curved stalk, like a mushroom. In greyscale next to `ori-wotw/06` and `ori-bf/15` (whose branches loop, overlap and fill the frame), our frames are 50–60 % empty sky with a few clean planks. |
| 2 A 10 s clip of the break-out and the run feels fluid and alive | **FAIL** (narrow) | Better than round 1: an 8 px kick at the break that settles in 0.3 s (measured), the lean, a soft follow (peak camera acceleration 8 px/f² outside the exit), the cocoons swinging, Tatter breathing, the swarm and the canopy moving. 18–21 % of pixels change over 1 s during the pass. What breaks it: (a) the climb pops through the bark (item 3); (b) before the hatch only 7.6 % of pixels change over 1 s, and the left trunk column (~12 % of the frame) is fully still; (c) the pale "silk strands adrift" (air.ts) are 1 px curved hairlines that drift across the sky and read as scratches on the lens, not as wind. |
| 3 The break-out reads as a birth | **FAIL** | Better staging: the cocoons hang under the branch, hers twitches on each press and on its own, the halves crack with flakes and falling wisps, she hangs from the silk (close-up f0430), and the wing unfold on the lip is still lovely. Two failures. **The climb is not a climb:** from f0478 to f0482 (about 4 frames) she passes *through* the 100 px bark face, from below the branch onto the top (`climb.png`). That is the same "slides out of the bark" read round 1 failed, now going the other way. **At zoom 1 it all happens 70–150 px under the walk line, at y 0.75–0.82**, where the cocoon is 40x80 px and the 8–12 visible flakes are specks. Only the unfold on top reads at playing size. |
| 4 The swarm reads as a river of moths leaving, and is beautiful | **FAIL** | It is visible now: about 150–250 dark specks cross the frame and the moon (S3, `pass/f0800`). But at 1x it reads as **a loose diagonal scatter of same-size dark flecks: a flock of small birds, bats or gnats**, not a river. There is no dense core, no edge and no visible haze band. Wings only read at 2x (`swarmzoom.png`). About 25–30 moths sit on the disc at once (target 8–20). The near layer showed one blurred dark blob, which reads as a bat or a leaf. In the 96x54 thumbnail S3 shows the moon and nothing else. During a fast run, the giant trunks and canopy cut the river into pieces (S4: moths on the moon plus a smear at the top left). |
| 5 Tatter reads at once as one of her kind, hurt, left behind | **FAIL** | At zoom 1, Tatter is a 55–60 px crouched figure: a pale doll face, a curled cap-antenna with a white ball, and a dark ragged shape behind it (S1, `tat3.png` right). The torn wing reads as **a tattered cape**, so the figure reads as a hunched imp, not a moth with a broken wing. The try (f0680) shows one big good wing like a cloak, which only reads in close-up. "Left behind" works through staging (it stays put, glances after her). "Hurt" doesn't read cold. |
| 6 Where to go is obvious without text | **PASS** (soft) | Right is unambiguous: the moss rim is the brightest edge in the playfield, and each gap's twig points across. The far branch (the promise) is now thin, hazy and rimless and reads as another tree's limb (wide-6/7). This was fixed. The soft spot is the end: past S9, lit-topped bush clumps sit a step below the lip and read as the next platforms (`end-zoom.png`), so the drop reads as "jump down to those", not "drop into the dark". Players still leave, so it is a pass. |
| 7 Feel: running and jumping is a pleasure (Ori standard) | **FAIL** | Not hand-played. From the sim: the route now has height (+64, +96, +128, then −160, −64, −96, −96, −128), 9 jumps in 11.5 s, and no box steps. That is a real improvement. But every gap is cleared by the same held jump from the lip onto a flat slab. There are no slopes, no arcs onto something, nothing that asks for a short hop versus a full one, and no landing that differs from the last. The bot never needed a decision. Ori's opening runs have rolling ground, momentum through dips, and launches off rising roots. |
| 8 Play checks | **PASS** | The naive bot reaches the exit with no catches. A first-timer: the 2.5 s fade, 3 presses or 12 s of waiting, a 3 s birth (any input ends it), and an 11.5–15 s run, so about 20–30 s. That is under 45 s, and nothing needs explaining. The fall catch is 1 s and clean, and it returns her 72 px in from the lip. |
| 9 `npm run check`, the debug API, the test grove | **PASS** | Check passes (8/8 e2e, including the Room list). `state`, `step`, `input`, `cam`, `teleport`, `load`, `events`, `__swarm.info` and `__tatter` all worked. |

Beats table: **t = 0 is black and fades up over 2.5 s** (fixed since round 1). Control comes at 6.7 s with three
presses, or 12 s with none.

## 2. Look-target checklist

| # | Verdict | Evidence |
|---|---|---|
| R1 Whole-frame ranges | **FAIL** | **Bottom quarter is 20–30 in S1–S5** (target 6–16): the drop never goes to black, because the crowns below are mid-grey all the way to the bottom edge. **p99.9 is 160–212 and nothing passes 217** in any shot (target 215–240, 0.1–0.6 %): the softened moon disc is 187–202. S3: mean 34 and near-black 29.5 % (both out). S6: area above 150 is 0.26 %. Chroma (31–37) and hue share (99 % azure) pass. |
| R2 Greyscale value structure vs pairs (`grey.png`) | **FAIL** | **S1 ↔ `wotw/26`:** wotw frames the small precious thing low and central between huge dark shapes. Ours is a row of small beans under a horizontal bar, with nothing framing it but a trunk at the edge. **S3 ↔ `bf/15`:** bf's branch loops and makes negative space. Ours is a straight bar with a scatter above. **S4 ↔ `wotw/06`:** no diagonal road, flat slabs stepping down. **S6 ↔ `bf/01`:** for a jumper she is a dark shape against paler sky at 0.4 s (pass), but by 1.0 s she is gone off the bottom right. 1 of 4 pairs holds. |
| R3 Depth ordering of bands | **FAIL** (marginal) | S1 holds: fg 13, shadow 8–9, far crowns 26, sky 31, fog stage 54, halo, disc. S4 inverts at the middle: the mid trunk's shaded side (12) is darker than the playfield branch body (16), so a far plane is darker than a nearer one. The branch underside (8–9) is also below its 10–20 band. |
| R4 Thumbnail test (`thumbs.png`) | **FAIL** | S1: the moon, the bar and a row of brownish dots. The closed cocoon is not distinguishable. S3: the moon only, and the river is gone. S4: Wing is a 2-pixel speck, findable only if you know where to look. |
| R5 Wing as a dark shape on a paler stage | **PASS** | Body p50 11–24. Stage 45 (300 px ring) to 71 (the box behind her). She reads as a silhouette with gold eyes. |
| R6 Tatter reads as hurt in S1 | **FAIL** | See item 5. |
| R7 The closed cocoon is the first thing after the moon | **PASS** (weak) | It is the only pale, striped, new-silk shape in the row (mean 44, p90 72 against husks of 29), and the eye goes moon → Tatter's pale stage → cocoon. It hangs at **y 0.75–0.81**, against the 0.62–0.70 the look target sets, and it disappears in the thumbnail. |
| R8 Warm only in the horizon band | **PASS** | Under 0.11 % of the frame. The afterglow sits at y 0.77–0.80 on the right half, and the only warm-mask hits above 0.75 are her eyes. |
| R9 The moon is the brightest; only the moon and eyes pass 217 | **PASS** | Nothing passes 217 at all, and the moon is the brightest area. (The disc itself sits under its own 205–225 band, counted under R1.) |
| R10 The swarm meets §5 | **FAIL** | It passes on count (about 150–250 on screen), path (enters left, crosses the disc, leaves right and up) and darkness on the disc. It fails on: the river shape (a loose band, no knots or necks you can see, no readable curve at 1x), the disc count (25–30 against 8–20), readable wings (no, at 1x), the near layer (one blob that reads as a bat or leaf), the rim against the sky (not visible), and the "Fails" row ("reads as … bats", "all dots with no readable wings"). |
| R11 A1–A11 | **FAIL** | 6/11 pass (below). |
| R12 The path reads; no background looks walkable | **FAIL** | The rim works, and the far branch no longer looks walkable. The lit-tipped canopy clumps under and past the branch end (wide-8, `end-zoom.png`) are hemispherical masses with lit tops, sitting at the next step down. They read as platforms. During the drop (walkoff and bot frames 1035–1125), a stack of them rises past her like floating islands. |
| R13 Nothing rectangular; no straight edge > 10 % of the width | **FAIL** | S1's walk line is flat to ±4 px over 1350 px (70 %). Each slab after the burl has a flat top of 400–650 px (21–34 %) and a near-parallel underside (luma-30 threshold, `thresh.png`). The cocoon silk is drawn as dead-straight white rules, with a sagging thread strung between them like a clothesline (close-ups). |
| R14 32–44 % below the walk line, crowns from above, in S1 and S4 | **FAIL** | **S1 passes:** walk line at 0.62, 38 % below, moonlit crown tops in fog. **S4 fails:** the swarm lean holds while she runs, so her feet sit at **y 0.74–0.80 for most of frames 603–930** (5.5 s, the whole middle of the route for a fast runner). Only 20–26 % of the frame is below her, and the top 40 % is empty sky and canopy. |
| R15 No region > 10 % still for 1 s; wind wave visible | **FAIL** (narrow) | During the pass only two 2 % cells are still. Before the hatch, the left trunk column (x 0–0.125, full height, ~12 %) is fully still over frames 240→300. I saw no wind wave travelling across the planes in the frame sequences. Things sway, but not as one wave. |
| R16 Camera: no snap, the lean, the lead into the fall, the fade | **FAIL** | No snap (pass). The lean is there: 130 right, 160 up, eased, held, and handed back (pass; but see R14). **No lead into the fall:** the camera is clamped at x 6464. A walk-off falls straight down the right side and out of the frame's bottom edge ~0.8 s after leaving the lip (walkoff log: screen y 1.06 at frame 157). A jumper drifts to the room's east wall at x 7404 and leaves through the bottom-right corner. The fade reaches black **1.7 s (walk-off) to 2.0 s (jump-off) after her feet leave the branch** (target 1.0–1.5). The last ~0.8 s show empty canopy clumps, not "her dark shape against paler fog". |
| R17 The break-out reads as a birth | **FAIL** | See item 3. Anticipation, split, hang and unfold are all there. The climb pops through the bark, and nothing below the walk line reads at zoom 1. |
| R18 Overall next to `ori-bf/10`, `ori-wotw/06`, `hk/08` | **FAIL** | **S1:** a clean, moody moonlit plate with a log, a row of seed pods and two small figures. It is darker than `bf/10`, as intended, but sparse and diagrammatic where `bf/10` is dense and layered. A tier below, though closer than round 1. **S3:** a fine moon with a flock crossing it, nowhere near `bf/15`'s staging. **S4:** floating planks between giant trunks in front of a large empty sky. Next to `wotw/06`, it looks like a good mobile game, not a peer. |

A1–A11:
- **A1 layer count: PASS.** Sky and moon, a cloud and star veil, far firs, crowns below (two planes), giant mid
  trunks with crowns, the playfield, the swarm (three planes), foreground leaves and air strands.
- **A2 atmospheric perspective: FAIL** (marginal). See R3: in S4 the mid trunk (12) is darker than the playfield (16).
- **A3 foreground framing: PASS** (weak). A blurred dark leaf mass or trunk sits at a corner in about 6 of 8 wide
  stops and in most run frames. It is a little light: 13 against 2–10.
- **A4 moon shafts: PASS.** One soft shaft in the opening, slanted about 10–15°.
- **A5 particles: FAIL.** Most of the points of light are stars. Air motes near the walk line are few. The 1 px
  drifting silk hairlines are the most visible "particle" and read as artefacts.
- **A6 silhouettes: FAIL.** Parallel-edged slabs. The mid crowns are lumpy, rounded "cloud" blobs that look the same
  from tree to tree. The end canopy is repeated hemispheres. The cocoons' husks are better (peeled, bell, torn,
  shrivelled).
- **A7 secondary motion: FAIL** (narrow). Same as R15. The cocoons, Tatter, the swarm and the leaves do move.
- **A8 focus: PASS.**
- **A9 bloom: PASS.** Only the moon, her eyes and the 0.2 s cocoon flash.
- **A10 camera: FAIL.** See R16 and R14.
- **A11 scale contrast: PASS.** The giant trunks are 5–10x Wing.

**Tally:**

| | PASS | FAIL |
|---|---|---|
| Brief items 1–9 | 3 | 6 |
| R1–R18 | 4 | 14 |
| A1–A11 | 6 | 5 |

---

## 3. The 5 worst problems now, ranked

### 1. The branch is still a chain of floating flat-topped planks, not one limb (owner: playfield branch, `pf-branch*` / `pf-rim`; level for the solid layout)
It is the crispest thing in every frame, so it sets the tier of every frame.
- **S1's walk line** is flat to ±4 px over 70 % of the width.
- **After the burl, every stretch is its own slab:** a flat top of 400–650 px, a parallel underside, and a sawn or
  peeled end. The slabs are joined across each gap by a single thin twig, with nothing holding them up (wide-2..7).
- **Struts are back:** S5 and S6 hang pale curved stalks under them (wide-4/5/6).
- **S9, the end,** is a small plank on a long curved stem (wide-8).

The threshold image shows parallel bars. `ori-bf/15` and `ori-wotw/06` show one twisting mass that grows from
somewhere.

**Fixed looks like:**
- **A visible parent limb.** Every stretch grows out of one main limb (or the giant trunk it passes) that you can
  see behind and below it. The gaps become places where the limb dips, forks or snapped, not empty air between
  planks.
- **A walk top that rolls**, ±8–20 px over 300–600 px. Moss and bark spill over it, so no edge is longer than 10 %
  of the frame.
- **Thickness that tapers and swells** along each stretch, not a constant bar.
- **No end or underside cut parallel to the top.**
- **The end is the limb thinning into a twiggy tangle**, not a stalked plank.

### 2. The camera frames the run and the drop badly (owner: level/camera)
- **The swarm lean holds during the run.** Pinned to sim time (2.4–9.5 s after the hatch), it holds while she runs.
  For anyone who runs at once, her feet sit at y 0.74–0.80 through the crown and the promise gap (frames 603–930).
  The frame then shows 40 % empty sky above and only 20 % drop below: exactly the "half dead sky" round 1 failed, in
  the scene's best stretch.
- **The fall is not led.** The east clamp at x 6464 holds the camera still while she falls down the right side and
  out of the bottom edge, about 0.8 s before black. A jumper slides out of the bottom-right corner.
- **The fade comes late:** 1.7–2.0 s after she leaves the branch.

**Fixed looks like:**
- **The lean yields to the run.** Blend it to the run framing (feet 0.56–0.64) once she has run more than a few
  hundred px, or lean only while she is slow. Keep it for the player who stops to look.
- **Room to follow the fall.** Let the camera pass the clamp (or widen the room east, inside the far0 tile limit),
  so the end sits at x 0.55–0.65 and the camera follows her down with a downward lead.
- **The fade reaches black 1.0–1.5 s after her feet leave**, with her still in frame.

### 3. The world below and around the branch is made of repeated lumpy blobs, and the drop never goes dark (owner: backdrop mid/far + air)
- **Mid canopy:** the crowns on the giant trunks are rounded, bubbly cloud shapes, near-identical from tree to tree
  (wide-4/5/6).
- **The drop's canopy** is a stack of identical hemispherical clumps with lit leaf tips. They read as floating
  islands, and look walkable (R12), during the scene's last beat.
- **The bottom quarter is 20–30** (target 6–16). The depth never falls to black, so the height doesn't feel
  dangerous.
- **The skies are bare.** With the moon softened (disc 187–202, nothing above 217), the frame has no real highlight.
- **The silk hairlines** drifting in the sky read as scratches.

**Fixed looks like:**
- **Canopy from above as continuous, varied masses.** Clustered crowns of different sizes and leaf directions, with
  moon-silvered upper edges only, and fog sheets between two crown planes.
- **A drop that goes black:** the bottom 15 % falls to luma ≤ 12.
- **No lit tops at walk height** below the branch end. The end canopy is dark tangle and fog that rushes up past her.
- **The moon disc back to 205–225.**
- **The silk strands** either cut, or made short and soft enough that they read as gossamer catching light only near
  the moon.

### 4. The swarm is a scatter of specks, not a river (owner: swarm)
- **At 1x it reads as a flock of small birds or bats:** one size, no readable wings, no core or edge, and no haze
  you can see.
- **The disc is crowded:** 25–30 on it (target 8–20).
- **It vanishes in the thumbnail.**
- **Near moths read as dark leaves.**
- **During the run it is chopped up** by the trunks, and sits up-left or over the moon rather than "just ahead and
  above".

**Fixed looks like:**
- **One curved band you can see as a shape at thumbnail size:** a dense core with a soft edge (density, or a haze
  strong enough to survive the toe), with knots and necks.
- **A real size spread,** so the mid moths at 14–22 px show a readable wingbeat at 1x.
- **8–20 on the disc.**
- **1–2 near moths that are clearly moths** (wing shape, beat) crossing in front of her once.
- **During the run, a lead stream in clear sky** to the right and above her: draw the swarm layers over the far
  crowns, or route it where the trunks are not.

### 5. The birth and Tatter don't read at playing size (owner: acting hatch/Tatter; level for where the cocoon hangs)
- **The climb pops through the bark.** From under the branch to the top in about 4 frames (f0478 → f0482). The
  "climb you can see" is still not there.
- **Everything before the unfold happens at y 0.75–0.82,** 40–80 px tall, behind dark husks. At zoom 1 the birth is
  "something twitched under the log, then she was on top".
- **The silk is ruler-straight white lines** with a clothesline thread.
- **Tatter reads as a caped imp,** not a moth with a torn wing. Its cap-antenna with a white ball doubles the
  jester read of Wing's.

**Fixed looks like:**
- **Hers hangs higher** (the limb thinner there, or hers on a short silk off the lip), so the closed cocoon is at
  y 0.62–0.70 and the split happens at the walk line.
- **The climb goes round the lip in view.** She hooks the bark edge, hangs a beat, pulls up over it (0.6–1.0 s),
  and never crosses the bark face.
- **The silk sags and catches the wind:** 2–3 curved strands, no straight rules.
- **Tatter's torn wing is a moth wing,** with the forewing outline and a big bite out of it, held open and drooping
  on the camera side, so the notch shows against the pale stage at 60 px.

### Also failing, next in line
- **R15: the still trunk column.** The left trunk is still for 1 s before the hatch (about 12 % of the frame).
- **R3 and A2: the mid trunk's shaded side** (12) is darker than the playfield; the branch underside (8–9) is under
  its band.
- **Wing's and Tatter's antennae** (the owner's pick, so not counted). Twin curled stalks with white end balls still
  read as a jester or bunny cap at zoom 1, the read `docs/art-direction.md` "Tone" warns against. Raise it with Matt.
- **The closed cocoon in the thumbnail.** It is not distinguishable in the 96x54 thumbnail.

## 4. What's good now (keep)
- **The opening.** It fades up from black over 2.5 s, control comes by 6.7 s, the 8 px kick at the break settles
  cleanly, and the lean toward the moon is eased and returned. The beats are finally staged.
- **The look of S1 as a plate.** The moon upper right, a starry cloud veil, one soft shaft, a pale fog stage behind
  the walk line, crowns from above below it, and the faint warm afterglow line on the right half. Values are
  disciplined (mean 29–34, 99 % azure, no warm leaks), and the walk line sits at 0.62 with 38 % depth below.
- **Wing as a silhouette.** Body p50 11–24 on a 45–71 stage, with gold eyes. That passes the HK test.
- **The cocoon row as an idea.** Husks hang under the branch in four torn states, with hers the one pale, new one,
  and they swing out of phase. The wing unfold on the lip remains the best moment in the scene.
- **The promise branch.** Thin, hazy and rimless: it reads as another tree's limb, out of reach.
- **The route.** It has height now (rises then descents, 9 jumps, about 11.5 s at full speed) with no box steps. The
  fall catch is a clean 1 s.
- **The giant trunks** give real scale (A11), and the 21:9 and 4:3 shapes fill cleanly.
- **Plumbing.** Check passes, and the debug API made every claim here measurable.

## 5. The honest call
Still a long way from AAA, though closer than round 1. The opening now plays as a scene: black, fade, moon, pods,
stir, break, kick, unfold, lean, a flock across the moon. As a still plate, S1 is the first frame that could sit at the
end of a row of indie Ori-likes without embarrassment. Put next to `ori-bf/10`, `ori-wotw/06` or `ori-bf/15`, three
things give it away at once:
- **The playfield** is a chain of clean flat planks in empty air.
- **The world around it** is made of a few repeated rounded blobs.
- **The big beats** (the birth, the river, the drop) happen too small, too low or off-frame to land.

The references are dense, tangled and organic, and they fill the frame with overlapping shapes. Ours is sparse and
diagrammatic. The single change that would move it most is the same as round 1, because it was only half done:
**paint the playfield as one connected, rolling, tapering limb system that visibly grows from the giant trunks (no
slab ends, no straight tops, gaps as forks and snaps of a continuous mass), and stop the camera's lean from pushing
her to the bottom of the frame while she runs.** Those two fix R13, R14, R2 and most of item 1 together, because the
best stretch of the scene (crown to promise) is currently framed as empty sky over floating planks.
