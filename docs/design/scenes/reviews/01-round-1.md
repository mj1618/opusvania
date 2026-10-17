# Scene 1 review, round 1 (2026-10-17)

Reviewer: an independent agent that wrote none of this code. The bar is Ori and the Blind Forest, Hollow Knight and
Nine Sols. "Good for code-drawn art" counts as a fail.

## What was looked at
- `shots/wide-1..7-*.png` (1920x1080), the same stops at `shots/2560x1080/` and `shots/1440x1080/`.
- Captures of my own from the debug API (`?manual&nopickups`, 1920x1080, scratch scripts, not committed):
  - The opening at frames 0, 30, 90, 180, 240, 300 and 360.
  - Three presses at frame 360 (`J1 .20 J1 .20 J1`), with every frame of the break-out at zoom 1.
  - The break-out and Tatter in close-up (`cam` zoom 2.2 and 3).
  - The swarm pass with Wing standing still, every 20 frames to frame 1005.
  - A naive bot that holds right and jumps when blocked or 24 px from an edge, run from the cocoon to the exit at
    two step sizes.
  - A fall catch.
- Clip `npm run clip -- --script ".330 J1 .20 J1 .20 J1 .520" --wide --pre 1`: the first 15 s, three presses at about
  6 s. The bot run was captured as frames every 2 sim frames.
- The S shots I used: **S1** frame 240 (the cocoon row), **S2** frame 403 (mid break), **S3** frame 765 (the swarm at
  its peak on the moon, standing still), **S4** frame 635 (mid-run), **S5** frame 575 (the apex over gap 1),
  **S6** frame 845 (just off the branch end).
- `npm run look:stats` on S1–S6, plus band boxes, a warm-hue mask, a 96x54 thumbnail, a luma-30 threshold and a 1 s
  frame difference (scratch numpy).
- Side by side with `ori-bf/10`, `ori-bf/15`, `ori-wotw/06` and `ori-wotw/26`.
- `npm run check` passes: 8/8 e2e.

I did not play by hand at real time. Feel is judged from frame sequences and sim numbers, and that limit is stated
where it matters.

### Numbers (look:stats)
| shot | mean | near-black % | >150 % | p99.9 | chroma | hue % | top Q | bottom Q |
|---|---|---|---|---|---|---|---|---|
| S1 | 29 | 50.2 | 1.26 | 220 | 31 | 99 azure | 28 | 12 |
| S2 | 28 | 50.1 | 1.27 | 220 | 31 | 99 | 28 | 12 |
| S3 | 28 | 49.5 | 1.21 | 219 | 30 | 99 | 28 | 12 |
| S4 | 26 | 48.6 | 0.23 | 198 | 30 | 99 | 14 | **21** |
| S5 | **23** | **52.9** | **0.10** | **148** | **29** | 99 | 10 | 15 |
| S6 | 29 | 43.4 | 1.27 | 225 | 32 | 99 | 29 | 12 |

Bands (box means, with the p90 − p10 spread where it was measured):

| band | measured | target |
|---|---|---|
| sky away from the moon | **3** (wide-3), top quarter 10–14 in S4 and S5 | 18–35 |
| moon disc | 198 | 205–225 |
| moon halo | **47** | 90–130 |
| far fog band | 48–55 (spread 35) | 30–48 |
| crowns below the branch | **17** | 30–48 |
| mid trunks | 11–22 | 14–26 |
| branch shadow | 11 | 10–20 |
| rim | about 82 mean | p90 100–135 |
| warm pixels | **0.002–0.007 %** of the frame | an afterglow band peaking at 55–80 |

Wing in S4: body p50 **45** (target ≤ 30); her stage is 70 (target 45–80, pass).

Timing: from boot to exit the bot takes **14.6 s**. From the hatch to the exit it takes **7.8 s** at 576 px/s,
against the brief's 10–30 s run. The swarm `releaseTau` fires at τ = 1.5 s when she runs straight away. The camera
stays at (960, 786) through the whole swarm pass: no lean. On the last stretch the camera is clamped at x = 4160.

---

## 1. "Done means" (brief items 1–9)

| # | Verdict | Evidence |
|---|---|---|
| 1 Any screenshot holds up next to the references | **FAIL** | Value ordering is broken at both ends: the sky away from the moon (3–14) is darker than the branch shadow (11), and the crowns below (17) are darker than the mid trunks. Nothing-rectangular fails: S1's walk line is one dead-straight horizontal edge across about 68 % of the frame, and wide-4..7 are flat slabs with square ends. The far warm accent is missing (0.002 % warm pixels, no band visible anywhere). The focal point is fine (the moon, then the pale cocoon). Next to `ori-bf/10` and `ori-wotw/06`, our frames are half empty sky above a plank. |
| 2 A 10 s clip of the break-out and the run feels fluid and alive | **FAIL** | The camera holds at (960, 786) through the break-out and the swarm pass: no kick, no lean. Over 1 s (frames 785→845) only 3.1 % of pixels change by more than 6 luma. The left trunk strip (10 % of the frame) and the upper-left sky are frozen. Wind is not visible as a wave across the planes. The run itself has real secondary motion (antennae, wing trail). |
| 3 The break-out reads as a birth | **FAIL** | What works: stir twitches, a split, and the wings opening with their eye-spots (close-up frames brk20–39), a lovely pose. What fails: the cocoon is pinned flat on the near face of the log, so she is born *out of the bark face* and then slides up onto the walk line in about 0.3 s (zoom-1 frames 405→430). Only about 5–8 flakes are visible, not 12–25, and no silk strands are seen falling into the drop. No 6–10 px camera kick. The flash is fine. |
| 4 The swarm reads as a river of moths leaving, and is beautiful | **FAIL** | At its peak (S3, standing still, 6 s after the hatch) about 60 dark **triangles** sit on and around the moon disc, with a few 1 px slashes to the left. They read as falling leaves, bats or debris, and only show where the moon is behind them. Against the sky they are invisible. There is no band, no curve, no depth and no near moths. If she runs at once, the release fires at τ 1.5 s and the river never crosses the moon at all (`run/` frames 455–875 show a handful of specks). |
| 5 Tatter reads at once as one of her kind, hurt, left behind | **FAIL** | At zoom 1 Tatter is a 70 px greyer copy of Wing crouched on the branch. It reads as "her little sibling", not "hurt". The torn wing only shows when it tries its wings, and only reads at zoom 3 (`close/tat2`). In the 96x54 thumbnail it is a dot. |
| 6 Where to go is obvious without text | **FAIL** (soft) | Going right is clear: the moss rim is the highest local contrast. But the far branch (the promise, wide-6/7 upper right) is painted exactly like the walkable path, with the same rim and slab, about 300 px above her. It reads as a ledge to jump to, not a promise. The swarm that should pull her along is invisible during the run. At the end the branch stops at x 0.86 with nothing that says "drop here". |
| 7 Feel: running and jumping is a pleasure (Ori standard) | **FAIL** | Not hand-played at real time, so this is judged from the sim. The whole route is 7.8 s at full speed: four 128–192 px gaps and two flat steps that never ask for a decision. The bot cleared it without a single variable-height or timing choice. There is no rhythm (no rise and fall, no slope, nothing to jump *onto*) and nothing to feel good about. Ori's opening runs earn the pleasure with height changes and arcs. |
| 8 Play checks | **PASS** | The naive bot reaches the exit from the break-out with no catches (6-frame steps; frames 405→875). A first-timer will finish well under 45 s: the whole scene takes 15 s. (One finer-stepped bot run fell at gap 1, which came from its queued inputs. The fall catch returned her within about 0.5 s, cleanly.) |
| 9 `npm run check`, the debug API, the test grove | **PASS** | Check passes with 8/8 e2e, including the Room list in the panel. `state`, `step`, `input`, `cam`, `teleport` and `__swarm.info` all worked. |

Also failing in the beats table, though not a numbered item: **t = 0 is not black.** Frame 0 is the fully lit
vista. There is no fade-up.

## 2. Look-target checklist

| # | Verdict | Evidence |
|---|---|---|
| R1 Whole-frame ranges | **FAIL** | S4 bottom quarter 21 (target 6–16). S5 fails on mean 23, near-black 52.9 %, area >150 0.10 %, p99.9 148 and chroma 29 (the moon is hidden and nothing else is bright). S1 near-black is 50.2 %, on the edge. Chroma sits at 29–32, the floor of the range. |
| R2 Greyscale value structure vs pairs | **FAIL** | S1 vs `ori-bf/18` / `wotw/26`: the cocoons sit on dark bark, not against a pale stage, and nothing frames them. S3 vs `bf/15`: a straight log instead of a looping branch over a void. S4 vs `wotw/06`: no diagonal road, a flat slab. S6 vs `bf/01`: she leaves the frame at the right edge, so there is no dark shape against paler fog. |
| R3 Depth ordering of bands | **FAIL** | Sky away from the moon 3–14 < shadow 11 ≈ mid trunk 15 ≈ crowns 17 < fog 48. The farthest plane is the darkest. |
| R4 Thumbnail test | **FAIL** | At 96x54, S1 shows the moon and a black bar, but the cocoon row is gone. S3 shows the moon with a few specks, no river. S4: Wing is barely findable. |
| R5 Wing as a dark shape on a paler stage | **FAIL** | Stage 70 passes. Body p50 45 fails (≤ 30): she is a lit purple figure, not a silhouette. |
| R6 Tatter reads as hurt in S1 | **FAIL** | See item 5. |
| R7 The closed cocoon is the first thing after the moon | **PASS** (weak) | It is the palest shape on the branch and sits under a small rim glow. But it is at y 0.78 (target 0.62–0.70) and disappears in the thumbnail. |
| R8 Warm only in the horizon band | **PASS** (on the letter) | 0.002–0.007 % warm pixels. The band it allows is also missing, which fails item 1. |
| R9 The moon is the brightest; only the moon and eyes pass 217 | **PASS** | p99.9 is 219–225 and the highs sit on the disc. |
| R10 The swarm meets §5 | **FAIL** | It hits nearly every line of the "Fails" row: one size (triangles), reads as leaves or bats, all dots, no readable wings, no river shape. The count on screen is far under 120–250. No near layer was seen. |
| R11 A1–A11 | **FAIL** | 5/11 pass (below). |
| R12 The path reads; no background looks walkable | **PASS** | The moss rim is clearly the highest local contrast in the playfield. The trunks, struts and fog don't look walkable. (The promise branch problem is under item 6.) |
| R13 Nothing rectangular, no straight edge > 10 % of the width | **FAIL** | S1: one straight walk line over about 1300 px (68 %) with a parallel underside. wide-4..7: slabs with flat tops of 400–650 px, square cut ends and rectangular step notches (wide-4/5 at x 1000). The fog band's top edge is also a straight line across the frame in the threshold image. |
| R14 32–44 % of the frame below the walk line, crowns from above | **FAIL** | S1: walk line at y 0.71, about 29 % below, and the branch body eats a third of that. The crowns below are a 17-luma mush with no tops lit by the moon. The 4:3 stop (`shots/1440x1080/wide-1`) shows the depth this needs, so the framing is the problem. |
| R15 No region > 10 % still for 1 s; wind wave visible | **FAIL** | 1 s difference map: the left trunk column and the upper-left sky (about 12 %) are still. No travelling wave is visible. |
| R16 Camera: no snap, a lean, the lead, the fade | **FAIL** | No snap (pass). No lean to the swarm (`cam()` is constant). No lead into the fall: the camera clamps at x 4160, so she runs off at screen x 0.92 and leaves the frame (`run/r0845`, `r0875`). The branch end is at x 0.86, not 0.55–0.65. Her feet leave the branch about 0.75 s before `roomExit`, so the fade reaches black about 1.45 s after (pass). |
| R17 The break-out reads as a birth | **FAIL** | See item 3. |
| R18 Overall, next to `ori-bf/10`, `ori-wotw/06` and `hk/08` | **FAIL** | **S1**: a moody plate with a log and beans pinned to it, a tier below `bf/10`. **S3**: a nice moon with debris crossing it, nowhere near `bf/15`'s staging. **S4**: floating cut planks on struts in front of a pale ghost trunk, which looks like a different, cheaper game than `wotw/06`. Darker than the references, yes, but not in a way that reads as intent. |

A1–A11:
- **A1 layer count: PASS.** Sky and moon, cloud veil, fog band, far firs, crowns below, mid giant trunks, canopy crowns, playfield and foreground leaves: at least 7.
- **A2 atmospheric perspective: FAIL.** See R3.
- **A3 foreground framing: FAIL.** No foreground in wide-1..4 or in any opening frame. It only appears in wide-5..7.
- **A4 moon shaft: PASS.** One shaft from the moon at about 15–20°.
- **A5 particles: FAIL.** About 3–6 motes per frame; leaves only at the twig tips.
- **A6 silhouettes: FAIL.** Parallel edges, rectangular slabs, identical cocoon ovals.
- **A7 secondary motion: FAIL.** Fails R15.
- **A8 focus: PASS.**
- **A9 bloom: PASS.**
- **A10 camera: FAIL.**
- **A11 scale contrast: PASS.** The giant trunks are 5–10x Wing.

**Tally:** brief items 2 PASS / 7 FAIL. Checklist R1–R18 4 PASS / 14 FAIL. A1–A11 5 PASS / 6 FAIL.

---

## 3. The 5 worst problems on screen, ranked

### 1. The branch is a stack of cut planks, not one living branch (owner: playfield branch painter, `pf-branch*.ts` / `pf-rim.ts`)
It is the only crisp thing in every frame, so it sets the tier of the whole picture, and it is the crudest thing in
the picture:
- **Straight lines.** The walk line is dead straight (68 % of the width in S1), with a parallel underside.
- **Rectangular shapes.** After the knot the "branch" is a row of flat-topped slabs with square sawn ends. The two
  steps are rectangular notches (wide-4, wide-5).
- **Struts, not limbs.** The slabs rest on S-curved struts that read as furniture supports, not as the limbs they
  grow from (wide-6, wide-7).

`ori-bf/15` and `ori-wotw/06` are one tapered, twisting limb whose walk line rolls. Loops and hooks cut negative
space out of the void, and moss spills over the edge.

**Fixed looks like:**
- **One continuous limb** from the trunk to the end, tapering about 3:1. It rises 2–6° as the brief asks.
- **A walk line that rolls**, ±8–20 px over 300–600 px. The painted top can hug the collision rect within a few px,
  or ask the sim for gentle slopes.
- **Swellings, not notches.** The knot and the steps are a burl or an elbow where the limb turns down.
- **The gaps are real breaks:** a snapped stub with torn fibres facing a twiggy fork.
- **Side growth.** Secondary limbs come off at angles and end in hooks and twig fans. They make holes, not struts.
- **The far branch belongs to another tree.** It is thinner, hazier (one plane back in value) and has no moss rim,
  so it reads as a place you can't reach yet.

### 2. The swarm is not there for the player (owner: swarm, plus camera for the lean)
- **Too thin.** At its peak, about 60 dark triangles cross the moon disc, and nothing shows against the sky (S3,
  `sw-peak`).
- **Wrong read.** It reads as leaves, bats or ash.
- **The run cancels the pass.** A player who runs at once triggers the release at τ 1.5 s, so the river never passes
  the moon.
- **No lean.** The camera never leans toward it.
- **Its own notes admit it.** `memory/swarm.md` lists "does not read as a river".

**Fixed looks like:**
- **Count and shape:** 120–250 moths on screen at the peak, in a curved band 10–25 % of the frame tall, crossing the
  disc with 8–20 moths on it at once.
- **Visible on the sky:** a moon-side rim of 70–110 on every mid moth, so they read against the 18–35 sky (which
  also has to come up, problem 3). An optional faint haze along the river's core.
- **Readable wings:** mid moths of 8–18 px with a wingbeat you can read (not arrowheads).
- **Near moths:** 1–2 blurred moths that pass between the camera and Wing.
- **A pass the run can't cancel:** start the pass on the first stir, not the hatch, or hold the release until the
  densest part has crossed the moon.
- **The lean:** the camera leans 120–200 px up and right over 1–1.5 s.

### 3. The frame is half dead sky with a shallow, muddy drop (owner: backdrop sky/far, camera feet line `art.anchorY`, foreground)
- **Branch too low.** The walk line sits at y 0.71. Under it, about 29 % of the frame is a 17-luma smear with no
  crowns lit from above (S1, R14).
- **The top is empty.** The upper half is a near-black sky (3–14) with soft cloud bars. Nothing gives it structure,
  and it is darker than the playfield.
- **No warm accent.** The afterglow does not render at all.
- **No foreground.** The opening has no foreground framing.
- **Proof.** The 4:3 stop (`shots/1440x1080/wide-1`) already looks better because it shows more drop.

**Fixed looks like:**
- **Raise the walk line** to y 0.60–0.66 at 16:9.
- **Paint the drop as a canopy seen from above:** crown tops with moon-silvered upper edges at 30–48, spread ≤ 30,
  and fog sheets between two crown planes, falling to near-black at the bottom edge.
- **Lift the sky** away from the moon to 18–35, with a halo of 90–130 (it is 47).
- **Add the afterglow** as a thin band at y 0.80–0.86, x 0.55–1.0, peak 55–80.
- **Add one dark out-of-focus twig mass** in the lower-left corner of the opening.

### 4. The cocoon row and the break-out are staged in the wrong place (owner: character/hatch, `cocoons.ts`, vesper `emerge()`; camera kick)
- **Pinned to the bark.** The cocoons are pinned flat on the near face of the log like beans on a clothesline: one
  size, one shape, even ~110 px spacing, a straight thread. They should hang under the branch into the drop as
  silhouettes against the fog (`close/c200`).
- **Wrong place for the focal cocoon.** The closed one is a pale striped almond at y 0.78.
- **She slides out of the bark.** At the break she is born out of the bark face, then slides up onto the walk line
  (frames 405→430).
- **Too little debris, no kick.** About 5–8 flakes are visible and no silk falls; there is no kick.

**Fixed looks like:**
- **Hang them below the branch's underside** on silk of 20–60 px, against the pale fog, as dark shapes with a silk
  rim of 120–165.
- **Vary them:** lengths, tilts and states (split, torn, one half fallen); irregular gaps of 50–110 px.
- **The closed one at (0.42–0.48, 0.62–0.70).**
- **A climb you can see:** she drags herself out, half hangs, and climbs or flutter-hops up the silk to the walk
  line, with a beat on the lip before she stands.
- **Debris that reads:** 12–25 flakes and 3–6 silk strands that fall the full height of the frame.
- **A kick:** 6–10 px, settling in about 0.3 s.

The wing-unfold pose is good: keep it, but stage it on the walk line where it can be seen.

### 5. The camera misses every scripted moment, and the ending happens off-frame (owner: camera, plus room width / `marks.camera`)
- **No fade-up:** frame 0 is the full vista, not black.
- **No kick** at the break.
- **No lean** to the swarm: `cam()` is constant for 10 s.
- **The ending happens off-frame.** At the end the camera clamps at x 4160, so the branch end lands at x 0.86 and
  she falls out at the right edge (x 0.92). The last frames show empty platforms, not "her dark shape against paler
  fog below" (`run/r0845`, `r0875`).
- **The scene is too short:** 7.8 s from the hatch to the exit, against a 10–30 s run.

**Fixed looks like:**
- **A fade-up from black** over about 2 s at boot (the sim already listens from frame 150).
- **The kick and the lean** from §2 of the look target.
- **Room past the drop.** Widen the room or let the camera pass the east clamp, so the branch end sits at x 0.55–0.65
  and the camera leads downward as she falls, with fog rushing up.
- **A longer route.** Lengthen it with height (rises, a fork, a dip) to about 20 s, so the swarm's lead stream has
  time to be seen.

**Also failing, next in line:**
- **Tatter** doesn't read as hurt. Give it a visibly short, ragged wing held drooping on the camera side at rest, so
  the notch shows in the silhouette at thumbnail size.
- **Wing's body is too lit** (p50 45 against ≤ 30).
- **Wing's antennae read as a jester cap.** Twin stalks with white end-balls read as a jester or bunny cap at zoom 1,
  which `docs/art-direction.md` "Tone" forbids ("no floppy two-point hat ears… no bell-like bobble"). Feathered moth
  antennae would fix it. Wing is the owner's pick, so raise it with Matt rather than change it unasked.
- **Particles:** only about 3–6 motes.
- **Mystery lines:** thin static 1 px vertical lines (silk or rain?) run top to branch in several shots
  (`close/c200` x 570, wide-6). They read as render seams.

---

## 4. What's already good (keep)
- **Values and hue.** The overall value budget and hue discipline: means 23–29, hue 99 % azure, no warm leakage, the
  moon as the single bright point with a slanted shaft. The "darker than the references" intent is there.
- **The stage behind her.** The pale mist band behind the walk line (about 70) is right, and Wing's stage passes.
- **The path.** The moss rim reads instantly as the way.
- **The birth pose.** Wing's first unfolding, with the eye-spot wings opening and the damp shiver, is the best moment
  in the scene.
- **Scale.** The giant mid trunks give real scale (A11). Moon-lit canopy crowns crossing the moon (wide-4, wide-5)
  are a lovely shape idea.
- **Plumbing.** Fall catches are quick and soft. Window shapes (21:9, 4:3) fill cleanly. Check passes, and the debug
  API makes all of this reviewable.

## 5. The honest call
This is a long way from AAA. Right now it reads as a moody, competent night plate with a placeholder level dropped
into it. Put next to `ori-bf/15` or `ori-wotw/06` it looks like a different tier, because the playfield is the only
sharp, high-contrast thing on screen and it is drawn as straight planks on struts. The story beats, the swarm, the
lean and the drop, are mostly invisible to a player who just runs. The single change that would move it most is to
**repaint the playfield as one organic, tapering, rolling limb, with the cocoons hanging beneath it into a deeper
drop, and the walk line raised to about y 0.62.** That fixes R13, R14, R2 and most of item 1 at once, and it gives
the swarm, the hatch and the drop a stage worth looking at. The swarm's visibility and the camera beats come second.
