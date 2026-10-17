# Scene 1 look target: the hatching branch

Companion to `01-hatching-branch.md` (beats, rules). This page sets what scene 1 must **look** like and how a reviewer
checks it. Measured 2026-10-17 on the official Steam store screenshots in `shots/reference/<game>/NN.jpg`
(gitignored, never commit them; URLs in `shots/reference/sources.txt`). Luma = Rec.709 on sRGB, 0–255, the same as
`npm run look:stats`. The target set's raw numbers are in `shots/reference/scene1-targets-stats.txt`.
**Matt's taste outranks every number here** (memory/reference-study.md): darker and subtler than the references,
no hero glow, no chasing brightness. Where the references are brighter, the "ours" column has been lowered.

## 1. Target frames

Primary (judge every shot against these):

| Frame | What it is | Take | Leave |
|---|---|---|---|
| `ori-bf/01.jpg` | Night wood, small figure on a fallen log, one moon shaft | How dark a frame can be and still read: top quarter luma 3, 59% near-black. One slanted shaft, upper right. Black brambles in the bottom-left corner as a frame | The glowing hero (p90 255) |
| `ori-bf/10.jpg` | Blue wood, log bridge, mist band, one warm glow far off | **The mist stage:** a pale band (luma ~120) directly behind the walk line, so everything on it reads as a silhouette. One far warm accent in an all-blue frame. A blurred black bottom 20% (luma 9) | The warm accent's size and height (ours is lower, smaller, dimmer) |
| `ori-wotw/06.jpg` | Running along a mossy fallen trunk at night | **The run composition:** the trunk as a long diagonal road rising to the right, hero at (0.58, 0.47), tree crowns silhouetted against a paler sky, a moss rim on the walking edge (p90 143) | The saturated royal-blue sky (`#00318c`) |
| `ori-bf/15.jpg` | Moon over a twisted branch above a void, warm low sky | **The moon and the branch:** moon at (0.71, 0.11), diameter 17% of height; the branch as a road over nothing; branch loops and hooks that make negative space; cool high, warm low | The purple-magenta grade, the pink moon, the hanging props |
| `ori-wotw/26.jpg` | Moon behind giant silhouettes, two eggs in a nest | **Birth staging:** the small precious thing low and central, dark giants framing it, a moon disc (227) with dark shapes crossing it. Rain streaks and dark foreground stalks as depth | The cyan moon (`#8cf9f8`); ours is paler and greyer |
| `hk/08.jpg` | Dark figures in front of a pale pool of light | **The pale stage**, HK's way: the light pool behind the figures is 163, the floor is 2. Wing and Tatter must read like this, as shapes, not as lights | The street-lamp light source |

Secondary (one thing each):

| Frame | Take |
|---|---|
| `ori-wotw/21.jpg` | Two characters as a pair (Ori and the owl Ku) in front of a moon halo. Staging for Wing and Tatter |
| `ori-wotw/08.jpg` | A moon glow pool directly behind a small hero on a ledge; a huge dead shape giving scale; muted lilac foliage |
| `ori-wotw/17.jpg` | One shaft from the upper right at low opacity (luma 39 on 25), particles only inside the light, a huge shape filling half the frame |
| `ori-wotw/20.jpg` | The open night sky as a stage, the hero tiny (5% of height), drifting particles as depth. Brighter than us (mean 72): take the layout, not the values |
| `ori-bf/18.jpg` | A remembered place: a focal object framed by dark verticals, black corners. Use it for the cocoon row |
| `silksong/03.jpg` | What a false light looks like in fog (warm halos, mist stage 71, black cut-out grass at 10). It calibrates our afterglow as **not** this |
| `nine-sols/01.jpg` | Flat value steps per layer (each layer one clean value), and a crowd of small figures on one line reading at once. Use it for the cocoon row and the swarm's far layer. (The Steam set has no Nine Sols night forest.) |

How the openings use this: Ori and the Will of the Wisps opens on a hatching. Ku's egg hatches in a nest, and Ku is
born with a damaged wing, which is Tatter's role. Ori and the Blind Forest opens on the Spirit Tree at night with one
light falling from it. Hollow Knight opens with the Knight walking to a cliff edge and dropping into the dark of
King's Pass. Our scene ends on the same drop. We keep what they have in common: one small figure, a huge dark world,
one light source, and a drop into the unknown. We do not copy their long prologues: control comes at 8 s.

## 2. Composition

Positions are (x, y) as fractions of the 16:9 frame from the top left. At 1920x1080, Wing is about 85 px (8%).

| Moment | Focal point | Moon | Horizon / far | Below (the drop) | Camera |
|---|---|---|---|---|---|
| **Cocoon row and Tatter** (3–8 s) | The closed cocoon at (0.42–0.48, 0.62–0.70), hanging under the branch. 4–6 split husks spread irregularly over x 0.22–0.56 (gaps of 50–110 px). Tatter at (0.60–0.66, on the branch), turned toward the cocoon, torn wing on the camera side | Upper right: centre (0.70–0.78, 0.14–0.22), disc 150–210 px | Far horizon at y 0.80–0.86, under the branch. The warm afterglow is a thin band on the right half only (x 0.55–1.0, ≤ 6% of frame height) | The branch comes in from the left edge at y 0.60–0.66, rising 2–6° to the right and tapering. Under it, 32–40% of the frame is depth: far tree crowns seen **from above**, fog sheets, all falling to near-black at the bottom edge | Static, zoom 1 (1.1–1.2 if the baked layers support zoom; never fake it by scaling one layer). One dark out-of-focus twig or leaf mass in one corner, 5–12% of the frame, never over the cocoon |
| **Break-out** (≤ 8 s) | Same frame. The flash stays small (radius < 60 px, peak luma ≤ 190). 12–25 husk flakes and 3–6 silk strands fall into the drop with the wind. Her first pose is at x 0.44–0.48, feet at y 0.62–0.66 | Unchanged | Unchanged | Flakes fall the full height of the frame, so the drop's depth reads | A 6–10 px kick, settling in ~0.3 s |
| **Swarm past the moon** (~10 s) | The river crossing the moon disc. Wing looks up, at (0.38–0.46, feet at 0.70–0.78) | Moves to (0.62–0.70, 0.16–0.26) as the camera lifts | Same, lower in frame | 22–30% of the frame | Leans up 120–200 px and right 100–160 px over 1.0–1.5 s, eased. Holds while the densest part passes, then hands back to the follow |
| **The run** (10–30 s) | Wing at x 0.36–0.45, feet at y 0.56–0.64, with look-ahead to the right. The moss rim on the branch top is the highest local contrast in the playfield | Screen-fixed (parallax ≤ 0.02), upper band, y 0.10–0.25 | Far crowns below the branch line, never above it (she is above the wood) | 36–44% of the frame under her feet. Mid trunks pass at parallax 0.5–0.7 and rise out of the fog below | Soft follow. The swarm's thinner stream stays ahead and above, at x 0.60–0.95, y 0.08–0.35 |
| **The drop** (~30 s) | The branch ends at x 0.55–0.65 in a dark tangle of canopy. She runs off. The tail of the swarm pours over the edge ahead of her | Leaves the top of the frame as the camera follows her down | Rises out of the frame | The whole frame becomes the drop: fog layers rushing up past her at their parallax rates | Vertical look-ahead downward (the camera leads the fall). Fade to black 1.0–1.5 s after her feet leave the branch. The last frame shows her dark shape against paler fog below |

## 3. Values and palette

### Whole-frame numbers (`npm run look:stats` on our shots)

| Metric | Target set, 10 frames, measured | Ours, scene 1 target | Why we differ |
|---|---|---|---|
| Mean luma | 37 (17–54) | **24–32** | Matt: darker |
| Near-black area (< 15) | 33% | **35–50%** | Deep masses carry the dark, not a lifted mid-grey |
| Dark grey area (15–38) | 32% | 25–35% | |
| Area above 150 | 3.0% | **0.3–1.5%**: the moon disc and its inner halo, her eyes, the cocoon's lit silk | No hero glow |
| Near-white area (> 217) | 0.9% | 0.1–0.6%, the moon disc only | |
| p99.9 | 239 | 215–240 | A few real highlights, not none (our Grove stops at 188) |
| Mean chroma | 47 | **30–42** | We sit at 21, too grey. Commit to blue; stay below Ori's saturation |
| Dominant hue share | 74% (all azure/blue) | **≥ 70%, azure/blue** | One hue family per place |
| Border / corners ÷ centre | 20 / 0.24 | 10–20 / 0.15–0.35 | |
| Top / bottom quarter | 34 / 22 | 20–40 / **6–16** | The drop goes to black, the moon lifts the top |

### Depth bands (region means measured with a box per band, scratchpad script)

| Band | References measured | Ours: mean luma (p90 − p10 spread) | Colour |
|---|---|---|---|
| Moon disc | 222 (bf/15), 227 (wotw/26) | 205–225, flat | core `#dce8f6` |
| Moon halo, within 1.5 radii | 135 (wotw/08), 156 (wotw/21) | 90–130 | `#9fbfe0` falling to `#3d5f86` |
| Sky away from the moon | 3 (bf/01) to 102 (wotw/26), typically 45 | **18–35** | `#0d1a30` |
| Far wood, fog, crowns from above | 19–42 (bf/01, bf/10, wotw/06, wotw/21) | 30–48 (spread ≤ 30: low contrast, soft) | `#1f3550` fog, `#182c44` crowns |
| Warm afterglow, at the horizon only | 136 (bf/10), 116 (bf/15) | **peak 55–80, ≤ 3% of the frame**, gone above y 0.75 | `#6a4a3e` peak, `#33283a` edge, then into the blue |
| Mid trunks | 13–44 | 14–26 (spread ≤ 45) | `#0f1d2c` |
| Mist stage behind the walk line | 108–123 (Ori), 71 (Silksong), 163 (HK) | **45–80** (memory/background-layers.md) | `#2b4a66` |
| Walk line: branch top rim | mean 47–63, p90 114–143 | p90 100–135, the highest local contrast in the playfield | moss rim `#5e8a84` (moon-silvered, never yellow) over moss `#0f2622` |
| Playfield shadow (underside of the branch) | 13–21 | 10–20 | `#08131f` |
| Foreground | 2–18 | 2–10, blurred | `#04090f` |
| Wing | Ori 154–185 (lit); Hornet and the Knight are pale masks | **body p50 ≤ 30** against the stage; face 70–110; eyes are the only high on her (small, ≥ 200) | her own palette (memory/character-vesper.md) |

Scene props:

| Prop | Colour | Luma |
|---|---|---|
| Cocoon silk catching the moon | `#9aa6b2` rim over husk `#3a3240` | rim 120–165, husk 30–55 |
| Tatter | Wing's rig re-paletted, a step greyer: `#2a2230` body | 25–40, with a pale stage behind it like Wing |
| Wing's own light | core `#ece6d6`, cast `#b7c0c4` at low alpha (adds ≤ 12 luma within 80 px) | never a halo that lifts the frame |
| Cool bioluminescence | `#9ff3ff`, ≤ 6 points on screen | ≤ 170 |

Warm is allowed in one place only: the afterglow band at the far horizon. No warm rims, shafts, motes or moths.

## 4. What makes these openings feel AAA (checkable)

| # | Item | Check |
|---|---|---|
| A1 | **Layer count:** at least 7 planes visible at once: sky and moon, cloud or star veil, 2–3 far wood planes, a mid trunk plane, the playfield, and a foreground | Pan the camera ±400 px and count the distinct parallax rates. Suggested rates: 0, 0.08, 0.18, 0.32, 0.6, 1, 1.4 |
| A2 | **Atmospheric perspective:** the darkest values rise and the spread shrinks with each step back | Band table above. A far plane darker than a nearer one fails |
| A3 | **Foreground framing:** a dark blurred element in ≥ 70% of frames, 5–15% of the area, moving at 1.3–1.6x | Look at every shot |
| A4 | **Moon shafts:** 1–3 shafts slanted 15–30° from vertical, from the moon's side, adding ≤ 15 luma, breathing over ~5 s | Shots, plus a 5 s clip |
| A5 | **Particles:** 20–60 motes (1–3 px), brighter only inside shafts; 2–6 falling leaves or flakes. Not sparkle everywhere | Count in one shot |
| A6 | **Silhouettes:** every big shape (branch, trunks, cocoons, Tatter, Wing) reads as solid black at thumbnail size. Shapes taper, hook and leave holes (bf/15). No parallel edges, no rectangles | Threshold the shot at luma 30 and look at it |
| A7 | **Secondary motion:** cocoons swing with offset phases, silk threads lag, leaves flutter, Tatter breathes and moves its antennae, a wind wave travels in x across all planes | 10 s clip: no region of the frame bigger than 10% is frozen |
| A8 | **Focus:** foreground blurred, far planes softened, playfield crisp | Zoom into the shot |
| A9 | **Bloom** only on the moon disc and her eyes (and the cocoon flash for < 0.3 s) | Shots |
| A10 | **Camera:** soft follow and look-ahead, no snapping; leans toward the swarm and leads the fall | Clip |
| A11 | **Scale contrast:** one shape in the frame is 5–10x Wing's size (a trunk, the moon halo, the branch's knot) | Shot S1, S4 |

## 5. The swarm: a river of moths

References: starling murmurations (density waves running through a flock that keeps changing shape), the spirit-light
streams in Ori (curved ribbons that trail), the cloth creatures in Journey (a serpentine school with an undulation
travelling down its length).

| Aspect | Target |
|---|---|
| Count on screen | **120–250** at the peak pass (budget ≤ 300, look-and-sound §1.4); 20–60 in the thinner stream ahead during the run |
| Depth layers | **Far ~60%:** 2–6 px, dark V shapes and dots, hazed toward the sky colour, behind the far mist. **Mid ~30%:** 8–18 px, wing shapes and the flap readable. **Near ≤ 10%:** 25–60 px, blurred, faster, 0–6 at once; 1–2 pass between the camera and Wing once |
| River shape | A band 10–25% of the frame tall, longer than the frame is wide. Its width and density vary along its length (knots and necks, about 3:1). The centreline is a slow spline: no straight segment longer than 20% of the frame width, and the curve changes over 4–6 s |
| Path | Enters behind and above Wing (frame left, y 0.25–0.45), arcs **across the moon disc**, and leaves right and up (y 0.08–0.30). 8–20 moths are on the disc at any moment during the 2–3 s pass |
| Motion of each moth | Flow speed 250–450 px/s on screen, ±25% per moth. Lateral flutter 2–5 Hz at 4–12 px (scaled by size). Wingbeat flicker 8–15 Hz (a squash of the wing quad). Heading follows its velocity ±20°. 1 in 20 makes a sudden dart and rejoins. No two neighbours in step |
| Motion of the whole | Density waves travel along the river at about 1.5x the flow speed. Edge moths peel off and rejoin. Leaders on springs, followers as offsets from them (look-and-sound §1.4) |
| Light | **Dark against the moon** (≤ 30 luma on a 220 disc). Against the sky, a moon-side rim of 70–110. ≤ 5% catch a brief glint (≤ 160) under the wings. Never warm, never glowing, never brighter than the moon |
| Fails | Even spacing, one size, one speed, lanes, a straight line, a particle-system look; reads as leaves, snow or bats; all dots with no readable wings; it gets ahead of her and waits visibly |

## 6. Review checklist (pass/fail)

**Shots to capture** (render at 1920x1080, HUD off): **S1** cocoon row at t ≈ 4 s; **S2** mid break-out, t ≈ 7 s;
**S3** the swarm on the moon, t ≈ 11 s; **S4** mid-run, t ≈ 18 s; **S5** apex of a jump over a gap; **S6** the drop,
0.4 s after she leaves the branch. **Clips:** C1 0–12 s, C2 10–32 s. For a side by side and a value check:
`ffmpeg -i S4.png -i shots/reference/ori-wotw/06.jpg -filter_complex "[1]scale=1920:1080[r];[0][r]hstack,format=gray" cmp.png`
(drop `format=gray` for colour).

| # | Pass if | How |
|---|---|---|
| R1 | S1–S6 each fall in the whole-frame ranges of §3 (mean, near-black, area above 150, chroma, hue share, bottom quarter) | `npm run look:stats -- <shots>` |
| R2 | In greyscale, each S-shot has the same value structure as its pair: S1 ↔ `ori-bf/18` and `ori-wotw/26`, S3 ↔ `ori-bf/15`, S4 ↔ `ori-wotw/06` and `ori-bf/10`, S6 ↔ `ori-bf/01`. That means dark frame, one pale stage, one bright point, black foreground | The ffmpeg greyscale side by side. The reviewer writes one line per pair |
| R3 | Depth ordering: the luma of each band rises with distance (fg < shadow < mid < far < sky near the moon), within §3's ranges | Box means on S1 and S4 (`python3 shots/reference/bands.py`, local and gitignored: edit its boxes) |
| R4 | Thumbnail test: at 96x54 px, S1 shows the cocoon row and the moon, S3 the river across the moon, S4 Wing on the branch | Downscale and look |
| R5 | Wing reads as a dark shape on a paler stage: the stage within 100 px of her is 45–80, her body p50 ≤ 30, and she is findable in S4 at a glance | `look:stats --hero=x,y,w,h` (the surround is the stage) |
| R6 | Tatter reads as one of her kind, hurt (one wing visibly short or torn), in S1, without text | Show S1 cold to someone: "what is that?" |
| R7 | The closed cocoon is the first thing the eye lands on in S1 (after the moon) | Squint test. It sits at the focal position in §2 |
| R8 | Warm appears only in the horizon band: in all shots, pixels with hue from red to yellow and chroma > 25 are ≤ 3% of the frame and all below y 0.75 | A small hue-mask script |
| R9 | The moon is the brightest area, and only the moon and her eyes pass 217 | `look:stats` p99.9 plus a look at where the highs are |
| R10 | The swarm meets every line of §5, including the "Fails" row | S3, C1 frame by frame around 10–13 s |
| R11 | A1–A11 all pass | §4 |
| R12 | The path reads: the branch top is the highest local contrast in the playfield, and no background shape looks walkable | S4, S5 |
| R13 | Nothing rectangular, tiled or repeated: no straight horizontal edge longer than 10% of the frame width on the branch | S1, S4, S5 |
| R14 | Height reads: 32–44% of the frame is below the walk line, with crowns seen from above, in S1 and S4 | Shots |
| R15 | Motion: in C1 and C2, no region bigger than 10% of the frame is still for 1 s, and the wind wave is visible crossing the planes | Frame-difference the clip (pixels changing > 6 luma within 1 s) |
| R16 | Camera: no snap in C2, the lean toward the swarm, the lead into the fall, the fade to black 1.0–1.5 s after she leaves the branch | C1, C2 |
| R17 | The break-out (C1, 6–9 s) reads as a birth: anticipation twitches, a split, husk and silk falling, her first unfolding pose, held for a beat | C1 |
| R18 | The overall test: S1, S3 and S4 placed next to `ori-bf/10`, `ori-wotw/06` and `hk/08` do not look out of place, and are darker | The reviewer's honest call, one line each, before any other score |
