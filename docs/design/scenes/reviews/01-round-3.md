# Scene 1 review, round 3 (2026-10-17)

Reviewer: an independent agent that wrote none of this code. The bar is Ori and the Blind Forest, Hollow Knight and
Nine Sols. "Good for code-drawn art" counts as a fail. Only what is on screen gets credit, not effort or improvement.
Build: `62643c9`.

## What was looked at
- `npm run shots` at 1920x1080, plus `--size 2560x1080` and `--size 1440x1080` (wide stops 1–8), and the close-ups.
- **A real boot** (no `?manual`, realtime, 1920x1080), with screens at 0.1, 1.5, 3, 6, 8, 10 and 11.5 s. Three presses
  of Z at about 6.4 s, then a "first-timer" script in the page: hold right, and jump 120 ms after the ground runs out
  60 px ahead. I ran it twice.
- **Captures of my own** through the debug API (`?manual&nopickups`, 1920x1080, scratch scripts, not committed):
  - **The opening** after `g.load()`: frames 1, 30, 60, 90, 120, 150, 180, 240, 300 and 360. Then three presses at
    frame 360 (the break lands at frame 403), and every 3rd frame to 660 at zoom 1.
  - **The same run in close-up:** the cocoon at zoom 2.4 every 3rd frame (380–680), and Tatter at zoom 3 every 30th
    frame (420–1080).
  - **The swarm pass standing still**, every 20 frames from 660 to 1140.
  - **No input:** it stirs at 300, 390, 480, 570 and 660, and breaks by itself at 720.
  - **A naive bot** (hold right; an 18-frame jump when the ground runs out ahead or a wall is in front), from the
    break to the exit, every 6th frame captured, with the camera logged every frame. A second run stands still for
    2.5 s after the break first.
  - **A walk-off** at the branch end, and **a fall catch** off the end of S5 (hold right).
- **Clips** (`npm run clip -- --setup "g.load()" --pre 0 --wide`): C1 is the first 15 s; C2 is the bot's run
  replayed as a script, 18 s. I kept the frames for a 1 s frame-difference test.
- **Measurements:** `npm run look:stats` on S1–S6. Also scratch numpy for band boxes, the moon disc, a warm mask, highs
  over 217, 96x54 thumbnails, a luma-30 threshold and stillness maps.
- **Side by sides:** S1 with `ori-bf/10` and `hk/08`, S3 with `ori-bf/15`, S4 with `ori-wotw/06`, and S6 with
  `ori-bf/01`, in colour and in grey.
- `npm run check` passes: typecheck, lint, unit, and 8/8 e2e.

**The S shots.**
- **S1:** the real boot at 3 s (`rt/t30`); `open/f0240` gives the same numbers.
- **S2:** frame 426 (0.4 s after the break; her head is out of the split husk).
- **S3:** frame 780 (the pass at its peak, standing, with the lean on).
- **S4:** bot frame 738 (mid-run on S5), with bot frame 660 (the crown) as a second.
- **S5:** bot frame 690 (the apex over the crown → S5 drop).
- **S6:** bot frame 996 (about 0.4 s after she passes the branch end).

**Limits.**
- I could not play by hand at 60 fps through playwright (about 1 s a call). Feel is judged from the sim and camera
  logs, the frame sequences and the clips; the "first-timer" is a scripted proxy.
- **The capture path differs from a real boot in two ways.**
  - In a `?manual` page, `g.load()` shows the swarm's specks around the moon **before the hatch** (`open/f0030–f0360`
    and the C1 clip). A real boot does not (`__swarm.info().running` is false until the hatch). Every
    "opening" clip made with `--setup "g.load()"` is therefore wrong about the beat.
  - The moon is a flat disc in every manual capture and has grey maria on a real boot.
  - Tools owner: fix both, or the S-shots stop meaning what the player sees.

### Numbers (look:stats)
| shot | mean | near-black % | >150 % | >217 % | p99.9 | chroma | hue % | top Q | bottom Q |
|---|---|---|---|---|---|---|---|---|---|
| S1 | 28 | 44.0 | 1.01 | 0.00 | **192** | 31 | 100 azure | 31 | 10 |
| S2 | 27 | 43.8 | 1.16 | 0.00 | **193** | 31 | 99 | 32 | 9 |
| S3 | 31 | 36.7 | 1.13 | 0.00 | **201** | 35 | 100 | 35 | 16 |
| S4 | 26 | 50.0 | 0.39 | 0.00 | **211** | **29** | 99 | 30 | 14 |
| S4b | 32 | 38.0 | 1.11 | 0.00 | **206** | 34 | 99 | 30 | 16 |
| S5 | 32 | 40.9 | 1.12 | 0.00 | **207** | 34 | 99 | 31 | 16 |
| S6 | **19** | **69.4** | 1.14 | 0.00 | **184** | **22** | 99 | 46 | 6 |
| target | 24–32 | 35–50 | 0.3–1.5 | 0.1–0.6 | 215–240 | 30–42 | ≥ 70 | 20–40 | 6–16 |

**The moon and the highs.**
- **The moon disc is 179–196** (target 205–225), with a halo of 77–127.
- **The moon is not the brightest thing in the frame.** Pixels over 217 do exist: 37–343 per wide stop, and **every
  one of them is off the moon.** They are on:
  - her white antenna balls;
  - the moonlit tops of the descending limbs (p99 211, max 236 in bot frame 798);
  - the white "snap" tips (S7's tip p95 178, max 223).
- **The walk rim** is p99 102–140 and p90 85–96 (target p90 100–135).

**Bands** (box means, S1 and bot frame 798):

| band | measured | target |
|---|---|---|
| far crowns below the branch | 16–19 | 30–48 |
| mid trunks | 7–11 | 14–26 |
| branch body | 10–15 | (playfield) |
| underside | 36 (S1, rimmed hangers) | 10–20 |
| fog behind the walk line | 33 (S1), 56 (run) | 45–80 |
| bottom 15 % | 4.8–11 | ≤ 12 |
| warm pixels | ≤ 0.17 %; the hits above y 0.75 are her eyes | ≤ 3 %, below y 0.75 |

**Timing.**
- **The break:** 6.7 s (three presses), or 12.0 s with no input.
- **The naive bot:** the break to `roomExit` in **9.9 s**, with 8 jumps and no catches. With a 2.5 s look first,
  12.4 s.
- **The real-boot first-timer:** **17.5 s from page load to the exit**, both runs, with 8 jumps and no catches.
- **The fall catch:** fall → return in 1.0 s.
- **The walk-off:** feet leave the lip → black in about 1.0 s. A jump-off reaches black about 0.95 s after she passes
  the end.

---

## Blocker outside the ranking (one line to fix, but on screen in every real boot)
**A monospace key legend sits along the bottom of the opening** (`index.html` `#hint`). It reads: arrows/WASD move,
Z/Space jump ("again in air: somersault, hold while falling: glide"), X/Shift dash, C attack, V/F "give a glint
(calms a creature, into a lantern or the heart)", R restart, M sound, Enter full screen, H keys. It stays until 12 s
after the first key press, so through the whole hatch and most of the run (`rt/t15`–`t115`).

- It breaks the brief's "no text" rule and item 6's "without text".
- **It advertises glide, dash, the somersault, glints, lanterns and the heart, none of which exist in this scene,
  and four of which the starting kit forbids.**
- The capture tools hide it, which is why no S-shot shows it.

Hide it in `wood-hatch` (or entirely until scene 2 has anything to explain).

## 1. "Done means" (brief items 1–9)

| # | Verdict | Evidence |
|---|---|---|
| 1 Any screenshot holds up next to the references | **FAIL** | A real step up. The playfield is now limbs growing from trees, with bark, collars, forks and moss (wide-2..7), and the crown stop (wide-4) is the best frame the scene has made. But next to `ori-bf/10` and `ori-wotw/06` the frames are sparse: 45–55 % of S1 and S3 is a soft cloud plate, and the world under the branch is a dark band of fir spires seen side on (16–19 luma), not crowns from above. The moon is not the brightest thing (see R9). In the run, the swarm's haze band crosses **in front of** the giant trunks. "Nothing rectangular" still fails on S1 (R13). |
| 2 A 10 s clip of the break-out and the run feels fluid and alive | **FAIL** | The break and the lean are smooth. But: (a) **the camera lurches on every drop**. Vertical velocity steps from 0 to 35 px/frame in one frame, peaks at 52–55, and decays, at frames 790, 852, 971, 989 and 999 (bot log). C2 frames 790→796 show the whole world jumping about 240 px. (b) In C1, **60–63 % of the frame changes by less than 6 luma over 1 s** (p90 per 24 px cell). The largest still region is the bottom quarter plus the left trunk column, about 60 % of the frame. (c) Pale hairlines (air silk, her antenna trails) still streak the sky. |
| 3 The break-out reads as a birth | **PASS** (weak) | Fixed in the main. `hatchFrame` puts her cocoon at (0.45, 0.66), the focal point. It twitches on presses and on its own, splits with flakes, and she hangs from the silk (close-up `h0444` is lovely). **The climb no longer pops through the bark:** she goes up the front of the limb and over the lip (`f0462–f0534`). The unfold on the lip still lands. What's weak: at zoom 1 the climb is a near-black figure rising smoothly over near-black bark, with no visible grip. The lean starts at hatch + 2.4 s, **while she is still unfolding** (`f0570–f0612`: the camera pulls up and away from the best moment). And the long drop threads under the cocoons are still dead-straight white rules (`h0444`: one runs 480 px straight down). |
| 4 The swarm reads as a river of moths leaving, and is beautiful | **FAIL** | Clearly better: the haze makes it one curved band you can see at 96x54 (thumbnail S3), it enters left, arcs across the disc (about 10–14 on it) and leaves right. It fails on three things. **The haze is a smooth, even, luminous tube** of constant width, so it reads as a contrail or a searchlight beam, not scale dust. **In the run it is drawn in front of the giant trunks:** a pale stripe across the bark in bot frames 738–912 and C2 790–798. That is a depth error, because a far layer is over a nearer one. **The moths are still dark angular specks**, and the 20–30 px near and mid ones read as bats or crows (S3 at (1220, 490), (1395, 450)). No knots or necks show. |
| 5 Tatter reads at once as one of her kind, hurt, left behind | **FAIL** | At zoom 1 it is a small crouched figure with a tall black spike rising behind it and a white ring (S1, `f0240`). At zoom 3 (`tatter.png`) the "torn wing" is **one rigid black blade, a shark fin or bat wing**, with a single jagged notch and a crisp bullseye. Nothing about it is a moth's soft, rounded, scaled wing, so "hurt" doesn't read; it reads as "has a fin". The try (`t0690`) opens a second blade like a cape. "Left behind" works through staging. |
| 6 Where to go is obvious without text | **PASS** (soft) | Right is unambiguous: the bot and the first-timer never hesitate. Soft spots: (a) the legend text (above). (b) The pale-topped descending limbs look like walkable slopes (R12). (c) Under the end, a stack of lit-tipped clumps reads as platforms to drop onto (`b0996`). |
| 7 Feel: running and jumping is a pleasure (Ori standard) | **FAIL** | Not hand-played. **The ground rolls now** (S1 aside), and the route has rises and drops. But: **every drop ends in the camera lurch** (item 2), the worst thing you can do to a run's feel. **There is no horizontal look-ahead:** running right she sits at x 0.48–0.55 (camera x = her x + 20 px in every logged frame; the target is 0.36–0.45), so you see as much behind as ahead. And every gap is still the same held full jump from a lip; nothing asks for a short hop or rewards momentum. |
| 8 Play checks | **PASS** | The naive bot reaches the exit in 9.9 s after the break, with no catches. The real-boot first-timer exits at 17.5 s from page load. Even with a long look at the swarm that is under 25 s. The fall catch is a clean 1.0 s. |
| 9 `npm run check`, the debug API, the test grove | **PASS** | Check passes (8/8 e2e, including the Room list). `state`, `step`, `input`, `cam`, `teleport`, `load`, `events`, `scene` and `__swarm.info` all worked. |

## 2. Look-target checklist

| # | Verdict | Evidence |
|---|---|---|
| R1 Whole-frame ranges | **FAIL** | Mean (26–32), near-black (37–50 %), >150 (0.4–1.2 %), hue and **the bottom quarter (6–16) now pass**. That last one was fixed: the drop goes dark. **p99.9 is 184–211 and nothing on the moon passes 217** (target 215–240). S6: mean 19, near-black 69 %, chroma 22. S4 chroma 29. |
| R2 Greyscale value structure vs pairs (`cmp-grey.png`) | **FAIL** | **S1 ↔ `bf/18`, `wotw/26`:** this now holds. Dark frame, a pale fog stage, the moon, a black trunk and leaf corner, and the precious thing low and central. **S3 ↔ `bf/15`:** fails. A straight bar, plus an arc in an otherwise empty sky; no loops, no negative space. **S4 ↔ `wotw/06`:** fails. No rising diagonal road, just short limbs between vertical columns. **S6 ↔ `bf/01`:** partial. A dark frame, but she is dark on dark among the clumps, not a shape on paler fog. 1 of 4 pairs holds. |
| R3 Depth ordering of bands | **FAIL** | The mid trunks (7–11) are as dark as or darker than the playfield branch (10–15). The far crowns (16–19) are under their 30–48 band, and darker than the fog in front of them (33). |
| R4 Thumbnail test (`thumbs.png`) | **FAIL** | **S1:** the moon, the bar and the row of pods; the closed cocoon is not distinguishable from the husks. **S3:** the arc across the moon reads now (fixed). **S4:** Wing is a 2-pixel speck at the walk line. |
| R5 Wing as a dark shape on a paler stage | **PASS** | Her body is near-black on a 33–56 stage, with gold eyes. |
| R6 Tatter reads as hurt in S1 | **FAIL** | See item 5. |
| R7 The closed cocoon is the first thing after the moon | **PASS** | It is at (0.45, 0.66), inside the target window, and it is the only pale striped pod in the row. |
| R8 Warm only in the horizon band | **PASS** | ≤ 0.17 % of the frame; the afterglow is a thin line at y 0.77–0.80, right half. |
| R9 The moon is the brightest; only the moon and eyes pass 217 | **FAIL** | The disc is 179–196 and **never passes 217**. What does pass is the antenna balls, the moonlit tops of the descending limbs (to 236) and the white snap tips (to 223), 37–343 px per stop. |
| R10 The swarm meets §5 | **FAIL** | It passes on: path, count on the disc (about 10–14), darkness on the disc, the thumbnail shape, never warm. It fails on: knots and necks (the band is even), readable wings at 1x (no), near moths that read as moths (bats), and depth (in front of the trunks during the run). From the "Fails" row: "reads as … bats". |
| R11 A1–A11 | **FAIL** | 4 of 11 pass (below). |
| R12 The path reads; no background looks walkable | **FAIL** | The walk rim (p99 102–140) is **not** the highest local contrast in the playfield. The non-walkable descending limbs carry a brighter moon rim (p99 211), and the snap ends are white pencil points (wide-3, wide-6, wide-7, bot frame 798). Those limbs slope like ramps. Under the end, the canopy is hemispherical clumps with lit leaf tips **and flat dark elliptical undersides** (`b0996`, at (800–1000, 420–460), (1290–1520, 540–600)): floating islands, three rounds running. |
| R13 Nothing rectangular; no straight edge > 10 % of the width | **FAIL** | S1's walk line is ruler flat over about 1300 px (68 % of the frame, `f0780`, `thresh.png`). It is flat by design for the cocoon marks, but on screen it is the same bar round 2 failed. The burl is a near-vertical step face. The long drop threads are straight rules. Past S1 the tops roll (pass there). |
| R14 32–44 % below the walk line, crowns from above | **FAIL** (narrow) | In S1 the hatch framing lifts the walk line to y 0.50, so 50 % is below (the look target's own cocoon and branch windows conflict here; say which wins). In S4 the feet are at 0.67, so 33 % (pass). In the run, the feet swing 0.45–0.67. What lies below is fir spires seen side on, not crowns seen from above. |
| R15 No region > 10 % still for 1 s; wind wave visible | **FAIL** | In C1 (before and during the pass), 60–63 % of the 24 px cells change by less than 6 luma over 1 s. The bottom quarter, the left trunk and the branch body are still (`still-sheet.png`). No wind wave crosses the planes. |
| R16 Camera: no snap, the lean, the lead into the fall, the fade | **FAIL** | **Snaps:** the drop lurch (35 → 55 px/frame onset). The cause: the room's `smoothYFall` 4 applies to every fall past `fallBelow`, not only the exit. **No horizontal look-ahead** on screen. **The lean:** it now yields to the run (round 2's problem fixed; the bot's feet held at 0.47–0.67, not 0.74–0.80). **The lead into the fall:** pass, she stays at 0.40–0.60 while falling. **The fade:** about 1.0 s after the lip (pass). |
| R17 The break-out reads as a birth | **PASS** (weak) | See item 3. |
| R18 Overall next to `ori-bf/10`, `ori-wotw/06`, `hk/08` | **FAIL** | **S1:** a moody, disciplined moonlit plate with a real limb now. It is darker than `bf/10`, as intended, but half of it is an empty cloud plate and the wood below is a flat band; a tier below. **S3:** a nice moon with a pale arc and bat-like specks; nowhere near `bf/15`'s staging. **S4:** limbs between giant trunks, with a pale beam across the trunks. Next to `wotw/06`, a solid indie game, not a peer. |

A1–A11:
- **A1 layer count: PASS.** Sky and moon, a cloud and star veil, far firs, crowns below, mid trunks with foliage, the
  playfield, the swarm (three planes), and a foreground of leaves and air.
- **A2 atmospheric perspective: FAIL.** The mid trunks (7–11) are no lighter than the playfield (10–15), and the far
  crowns (16–19) are darker than the fog in front of them.
- **A3 foreground framing: FAIL** (narrow). A blurred dark leaf mass frames S1–S3 and wide-1/2/3/7. Most run frames
  (wide-4/5/6, bot frame 798) have none, so it is about 50–60 % of frames, under 70 %.
- **A4 moon shafts: FAIL** (narrow). One soft shaft, but it falls 5–8° off vertical (S1: x 1490 → 1440 over 350 px).
  The target is 15–30°.
- **A5 particles: FAIL.** Few motes near the walk line. The most visible "particles" are 1 px hairlines in the sky
  and her antenna trails, which read as scratches.
- **A6 silhouettes: FAIL** (narrow). The limbs taper, fork and hook now (credit). But: S1 is a flat bar, the end
  canopy is repeated domes with flat bottoms, and the snap ends are pencil points.
- **A7 secondary motion: FAIL** (narrow). Same as R15. The cocoons, Tatter, the swarm and the leaves do move.
- **A8 focus: PASS.**
- **A9 bloom: PASS** (weak). On the moon, the eyes and the short cocoon flash. The antenna balls are the brightest
  points on screen; that is the owner's design, so it is not counted.
- **A10 camera: FAIL.** See R16.
- **A11 scale contrast: PASS.** The crown and droop trees are 5–10x Wing.

Other shapes: at 2560x1080 and 1440x1080 the view fills cleanly with no seams. 4:3 shows more sky and more drop.

**Tally:**

| | PASS | FAIL |
|---|---|---|
| Brief items 1–9 | 4 | 5 |
| R1–R18 | 4 | 14 |
| A1–A11 | 4 | 7 |

---

## 3. The 5 worst problems now, ranked

### 1. The camera lurches on every drop and never looks ahead (owner: level/camera)
This is the one thing that touches every second of play.
- **The lurch.** On every drop of more than about 48 px, the vertical follow goes from still to 35 px/frame in one
  frame and peaks at 52–55. That happens at the S4→S5 drop, S5→S6, S6→S7, S7→S8 and the end (bot frames 790, 852,
  971, 989). The cause is the room's `smoothYFall` 4 (default 9), meant for the exit, applied by
  `p.vy > fallFollowVy && feet > targetY + fallBelow` to every gap.
- **No horizontal look-ahead.** Running right at full speed she sits at x 0.48–0.55 the whole route; the camera
  centre is her x + 20 px. The run's target is 0.36–0.45, with the space ahead of her.
- **The lean during the unfold.** The swarm lean starts at hatch + 2.4 s, while she is still unfolding on the lip,
  and pulls the frame off the scene's best moment.

**Fixed looks like:**
- **The fast fall-follow only for the exit and real falls** (more than about 250 px, or `s.exit`). Gap drops get the
  default smoothing, with a velocity ramp (no step in camera velocity). Peak camera acceleration under about
  8 px/frame² outside the exit, as round 2 measured.
- **Her x at 0.38–0.44 while running right**, eased in over about 0.6 s.
- **The lean starting after she stands** (birth ≥ 3.9 s), or the pass timed later.

### 2. The playfield's light and fork grammar fight the walk line (owner: playfield branch)
The limbs are the round's big win, but four things undercut them.
- **The brightest wood is the wood you can't walk on.** Every fork is the same move: the parent's end bends down into
  a long limb that plunges off the bottom of the frame, and the child grows out of it in an X or an elbow (wide-2/3,
  wide-5/6, wide-7/8). Those plunging limbs carry a moon rim of p99 211, max 236, and they look like ramps.
- **The snap ends are white pencil points** (S3 at wide-3 x 1700, S7 at wide-6 x 1580, S7 at bot frame 798; max 223),
  not broken wood.
- **S1 is a ruler-flat bar** for 68 % of the opening frame.
- **S6's end, with its knot "eye" and a twig "tongue",** reads as an animal head (wide-6 x 1100).

**Fixed looks like:**
- **The walk rim brightest:** the walk rim p90 100–135 is the playfield's top value. Non-walk wood is capped about
  30 luma under it (no white tops on the descending limbs), and nothing outside the moon and the eyes goes over 217.
- **Varied joins:** a fork that rises, a snapped stub with the child limb on another tree behind it, a dip that
  continues. Not the same X four times. At least one child limb should come from above or behind, not from a pillar
  below.
- **Snaps as jagged, dark, splintered wood**, with no pale point.
- **S1's top rolling ±8–15 px** between the cocoon marks (move the hang points with it, or let the render roll above
  a flat collision).

### 3. The swarm is a luminous tube with bats in it, drawn in front of the trees (owner: swarm)
- **The haze is an even, constant-width, softly glowing band.** It reads as a contrail or a searchlight beam, not
  scale dust.
- **It is drawn over the giant trunks** during the run (bot frames 738–912, C2 790–798). The far river is in front of
  the nearest trees in frame, which breaks the depth the whole scene is built on.
- **The moths are dark angular specks.** The bigger ones read as bats or crows.
- **No knots or necks are visible.** The density is even along the arc.

**Fixed looks like:**
- **The haze masked by the mid layer:** no pale stripe ever crosses a trunk or limb nearer than the far plane.
- **Haze that breaks up:** varying in width and density along the river (3:1 knots and necks), patchy, fading to
  nothing at the edges, brighter only where it crosses the moon's halo.
- **Mid moths with a readable soft moth wing** at 1x: rounded forewing and hindwing, and a visible flap squash, not a
  V or a bat's point.
- **Near moths** clearly moths, 1–2 crossing her once, and none that read as a bird.

### 4. The world around the branch: dark, still, floating-island drop (owner: backdrop mid/far + air; post for the moon)
- **The far wood below the branch is a band of fir spires seen side on**, at 16–19 luma (target 30–48). It is darker
  than the fog in front of it, and still.
- **The mid trunks (7–11)** are no lighter than the playfield.
- **In C1, 60 % of the frame doesn't change over 1 s:** the bottom quarter, the left trunk and the branch body.
- **The end canopy** is the same stack of lit-tipped domes with flat dark undersides, which read as floating
  platforms as she drops (`b0996`, walk-off `w0056–w0080`).
- **The moon disc** is 179–196 (target 205–225), so it is not the brightest thing in its own frame.
- **Hairlines in the sky.** Pale 1 px silk strands drift across the sky in every stop.

**Fixed looks like:**
- **Crowns seen from above** under the branch: rounded masses with moonlit upper edges, two planes with fog sheets
  between them, lighter with distance (30–48), and swaying.
- **Mid trunks at 14–26.**
- **A wind wave** visible crossing the far canopy, the mid foliage and the hangers.
- **The end canopy as soft dark masses with no flat undersides**, dissolving into fog that rushes up past her.
- **The moon disc at 205–225**, the only area over 217.
- **The sky hairlines** cut, or kept to the moon's halo.

### 5. Tatter still doesn't read as a hurt moth (owner: acting)
- **The torn wing is one rigid black blade** with a bullseye: a shark fin, a bat wing or a witch's hat at zoom 1, and
  a dragon's wing at zoom 3.
- **The try opens a second blade like a cape.**
- **A crisp white ring on a black blade reads as a target or a button,** not an eye-spot on scales.
- **The good wing hides folded,** so there is nothing to compare the torn one against.

**Fixed looks like:**
- **A soft moth wing:** rounded forewing and hindwing outlines in Wing's own wing language, with dusty edges.
- **The near wing visibly shorter than the far one,** with a ragged bite out of its trailing edge, drooping and
  trembling against the pale stage.
- **The eye-spot soft and partly torn away.**
- **The good wing shown at least once,** so the difference reads at 60 px.

### Also failing, next in line
- **The legend text** (above: fix first, it is one line).
- **R14 / the look target's own conflict:** the cocoon at 0.62–0.70 and the branch at 0.60–0.66 can't both hold with
  a 100 px hang. Pick one.
- **A4:** the shaft is too vertical (5–8°).
- **A3:** no foreground frame in most run frames.
- **The capture path:** `g.load()` in `?manual` shows the swarm before the hatch, and the moon has no maria. The
  opening clips and S1/S2 lie about the beat.
- **Owner's pick (not counted):** Wing's and Tatter's curled antennae with white end balls still read as bunny ears or
  a jester's cap at zoom 1. They are also now among the brightest pixels in the frame. Raise it with Matt.

## 4. What's good now (keep)
- **The branch is a tree's limb.** Bark, collars where limbs leave the trunks, moss tops, hanging moss, knots, forks
  and tapering ends. The crown stop (wide-4: a limb out of a giant trunk, the moon behind willow fronds) is the
  best single frame the scene has. The planks are gone.
- **The ground rolls in the sim**, and the route rises and falls.
- **The hatch staging.** Her cocoon is the focal point at (0.45, 0.66); the split, the flakes, the hang from the
  silk, the climb up the front of the limb (no more popping through the bark), and the unfold on the lip. The
  close-up of her head coming out of the husk (`h0444`) is genuinely good.
- **The lean yields to the run.** Round 2's "feet at 0.80 through the best stretch" is fixed.
- **The fall into the exit.** She stays mid-frame, the camera leads her down, and it is black in about 1.0 s.
- **The drop goes dark:** bottom quarter 6–16, bottom 15 % at 5–11.
- **The swarm's shape survives the thumbnail** (an arc across the moon), and the number on the disc is in range.
- **Values and palette:** 99–100 % azure, no warm leaks, Wing a silhouette on a paler stage.
- **Plumbing:** check passes, the debug API made every claim here measurable, and the bot and first-timer exits come
  in at 10–18 s with no catches.

## 5. The honest call
Closer, and for the first time the playfield is not the first thing that gives it away. As a still, the crown stop
could sit at the end of a row of good indie Ori-likes. Next to `ori-bf/10`, `ori-wotw/06` or `ori-bf/15`, it is still
clearly a tier down, for three reasons:
- **The world beyond the playfield** is sparse, dark and still: an empty cloud plate above, a flat band of side-on
  firs below, and islands at the end.
- **The light is misplaced.** The brightest things are limb tops you can't walk on, pencil-white snap tips and
  antenna balls, not the moon and the walk line.
- **The camera makes the run feel worse than the ground does,** with a lurch on every drop and no space ahead.

I'd put it at about 55–60 % of the way to the bar on the look and lower on the feel. The single change that moves it
most: **fix the camera** (no velocity step on gap drops, Wing at x 0.38–0.44 with space ahead, and the lean after the
unfold), **and in the same round re-light the playfield** so that the walk rim is the top value and nothing but the
moon passes 217. That turns every frame of the run from "the world jolts and the eye goes to the wrong wood" into "the
path glows and the view opens ahead of her", and it costs the least of anything on this list.
