# Character skin: Vesper, the moth (`src/render/character/vesper/`)

THE hero. Slender moth-person, ~84 px tall; wings worn as a cape. Imports `../hooded/math`; `chain.ts`
(hooded chain + per-segment `extra` angle, `dragK`, `scale`) and `paint.ts` are our own copies.
Files: `rig.ts` poses + springs -> skeleton; `wings.ts` wing strands + antennae; `draw.ts` shapes;
`fx.ts` dust, trails, scales; `slashfx/` the slash's crescent and contact flash; `link.ts` hand-off with the goal renderer;
`index.ts` wiring, lights, `window.__vesper`.

## Look: owner decisions, do not undo
- **Value plan**: a dark plum figure with a SOFT pale lilac-ash face; eyes, lantern tips and wing
  eye-spots are the only bright things. "Too bright in the face", "it looked better when it wasn't so
  bright": never brighten her to win a ratio. Face on screen: lit ~160-185 luma, shadow ~110-130.
- **Shading is crisp and flat** (owner: highlights were "annoying, washed out and blurry"):
  `painter.coolK = 0`, `keyK = 0.22`, `l2k = 0`. No rim light, no halo behind body or head, no glow
  on the hem band, no additive haze. Lantern tips a 7 px bloom; eye-spots flat rings.
- **Face** = a smooth round heart of pale fur with an opaque dark plum hairline under it (6% larger)
  and two big gold eyes (dark amber rim, bright core that drifts with the gaze, two catchlights, a
  lid). Nothing else: no nose, mouth, brows, pupils. Nothing may span the brow (a band or shadow there
  reads as a monobrow / frown); the face meets the crown through four fine uneven tufts (`HAIRLINE`).
  Outer eye corners slightly raised (lowered = mournful, rejected). Failed: a narrow face with chin
  tufts (a skull with a beard); dark brow locks (sunglasses).
- No scarf (anything pale by the torso reads as an arm): a short ruff only; long round ruff puffs
  read as a hand at her throat. Rows of same-sized round puffs (cheeks, mane, ruff) read as warts.
- Antennae: shaft half-width 1.7 -> 0.85 px, a narrow vane (comb barbs = fishbones, wide vanes =
  rabbit ears). They must survive at 64 px.
- **Head silhouette = a round head, ONE swept crest, two plumes.** `LOCKS`: the crest (off the top
  of the skull, level and arched, all dark) is the only lock that leaves the crown's outline; the
  other two end inside it. `CHEEK` tufts also end inside the crown's outline (pale fluff over the
  dark fur: soft cheeks, no points on the edge). Failed: five locks + two top tufts (a spiky ball);
  pointed tufts (gear teeth); a crest pointing up-and-back with a lighter lock on it (a cat's ear).
- Pale tones are scaled per zone because post grades the zones differently: `view.pale = 0.72 / 0.94
  / 0.68` (left / centre / right), applied through the `PALE` list and `paleNow` in draw.ts. If
  post's exposure changes, re-measure the face (zoom 6 crop, post on) and retune those three numbers.
- She must not visibly shrink in the somersault (lengths 3%, wings 4%, head never).
- Light / halo numbers of the scene belong to the atmosphere work; her point light `ember` is the
  midpoint of the lantern tips (radius 300, + dash / flash / soar).

## Rig basics (`rig.ts`)
- 2.5D: poses authored in a forward frame, projected through the turn factor `d` (a spring); the
  head has its own. Generators (idle, run, air, WALL, DASH, SKID) are cross-faded by smoothed
  weights; lean, curl, head pitch and hip twist each chase the blend through their own spring; hands
  go through `Drag2` (world-space spring, soft-clamped) so they trail and overshoot.
- `BODY.neck` is 6.5 (was 4.5): the head is clearly off the shoulders in every pose. It draws back
  to 4.5 with `spinW`, so the somersault's ball is the shape it was tuned at.
- `limb()` blends straight segments with a Catmull-Rom bow by `ROUND` 0.35 (a full bow = banana legs).
- Ground turn = a planted pivot: foot lift is cut by `1 - |d|` while she swivels through the camera.
- If a leg cannot reach its target (air poses), the toe joint is moved with the reached ankle: the
  foot is never drawn stretched.

## The run (round 17: rebuilt as a bound; owner: "effortless and relaxed like Ori", not "determined")
- `RUN_CYCLE` 288 px (a footfall every 144 px, 15 frames at top speed; NOT the sim's 96 px `step`),
  `STANCE` 0.165, contact 25 px ahead, toe-off 22.5 px behind. Both feet are off the ground 67% of
  the cycle. Phase advances with distance; the stance is linear in phase; the TOE TIP is the planted
  point (the ball rolls up over it as the heel peels: `TOE`), tested at 60 and 144 Hz.
- The swing is a key table (`SWING_BOUND`: time, ball forward, up, pitch) through a Hermite spline
  that leaves and meets the ground at the ground's speed: the pushed-off leg is left long behind
  with the toes pointed (the split of the float), folds under the hip as the other foot lands (the
  passing pose), reaches ahead, comes down and back onto the toes. Legs may stretch 24%. Measured:
  toe-to-toe split 78 px, front toe 27 px ahead of the head, rear toe 40 px behind her centre.
- Body: lean 0.09 + 0.55 x speed (plus curl), head gives it back and stays level (tilt < 0.1 rad),
  pelvis 27.8 + 9.4 px arc, head bob ~9 px, hips sit back 2.6 px. Each footfall kicks the crouch
  spring by 9 (the soft give). Arms trail behind with a small counter-swing; the NEAR arm is held
  lower (hand ~12 px back and 12 below the shoulder) so forearm and open hand show under the cape;
  the far arm lies along it.
- Low speed = `SWING_TROT` (small, close to the ground) and an upright body. The sim reaches top
  speed in 6 frames and stops in 5 (it was 3 / 3); the POSE takes its time: `speedK` (lean; rate 6.5
  up, 8 down) and `boundK` (trot -> bound; 9 up, 12 down, driven by `speedK`), `wRun` lets go at 12
  plus a constant 1.5 /s (an exponential tail alone left the feet creeping to the stand for 12
  frames). So the lean-in takes ~15 frames, a tap stays an upright trot step, a stop settles over ~10.
- **First and last step** (`stepK`): while stand and run trade places both feet are carried 2-3 px
  (height follows the blend's rate), so they land where they stand instead of sliding there. Measured
  with the sim's real accel profile: start and stop slide 0 px on the ground (was 7 px back at the
  start, 9 px forward after a stop); the feet are down 9 frames after the sim stops. The ground turn
  is still a swivel (feet cross under her in 2 frames): by design.
- Stop: `stopK` (render only, `STOP`): the lead foot is set out toes-up, hips sink 4 px and sit back,
  arms swing through; gone in ~0.3 s.
- **The cape while running** (`wings.ts`): `STREAM` lifts are WORLD angles (the spine's lean is taken
  out of the wing frame by `1 - run`), upper edge ~19 degrees below the horizontal and the lower edge
  flatter so they converge; roots spread 0.2 px per strand down the spine (more hides the arm); strands 24% longer;
  stiffness -0.45; ripple amp 0.3; a +-7 degree lift per stride; the far wing rides 11 degrees lower
  (a second tail). Hem while streaming = `HEM_STREAM` (one long upper tail, a short step under it)
  and the eye-spot is folded away.
  Rejected on the way: the cape as a fan with lean-relative lifts (a hump on her back that balloons
  over her head in the float); roots spread to the hips (a plank at hip height); a blunt end with the
  eye-spot showing (a fish with an eye); a deep symmetric fork (a crocodile's open jaws).
- Antennae while running: `ANT_STREAM` adds per-segment angles so they lie back in a lazy S (A arcs
  higher, B lower and flatter, or the two merge into one fat quiff) with a slow travelling wave.
- Honest gap to Ori: Ori's whole body is one horizontal stroke 3-4x as long as it is tall (head low,
  spine level, ears and tail in line). Vesper is a big-headed biped with a 13 px torso: her float is
  ~1.4x as wide as tall and the long line is carried by the cape and the split legs, with the head
  still on top. Going further needs proportions (longer torso), which the owner's design rules out.

## Standing (round 17)
- Tall and easy: pelvis 33 (legs nearly straight), weight on leg B under the hips, foot A set 9 px
  ahead with the heel just lifted, spine upright, chest open. The NEAR hand rests by the thorn's
  hilt (the two hands trade through `yaw`); the other hangs. Owner once said "legs curved to the
  front too much": keep the knees nearly straight.
- Cape at rest: `STAND` sweeps the strands back (front edge 23 degrees) so the front edge hangs
  behind the legs, and `HEM` rises to 0.66 at the front: legs and pale feet read under a tapering
  swallow-tail. The sheath tip shows behind.
- Alive: breath, weight shift, glance (`HYAW`), antenna flick, a wing resettle every ~7 s.

## Air, wall, dash
- `RISE`: stretched into the jump (lean 0.2, chest open, chin up, lead knee lifted, the other leg
  long behind with the toes pointed, arms low behind); wings `RISE` trail down-and-back in a narrow
  line. `APEXP`: open, legs apart, arms out, wings half spread. `FALL`: legs reach down toes first,
  arms lifted, wings up behind as a parachute (`GLIDE` table). Fall > 22.5 px/f = `dive`.
- The "long thin drips under her" on the round-16 fall silhouettes were an artefact of that
  silhouette tool (her light changes the scenery it differenced against); nothing is drawn there.
- Wall slide: the rig faces the wall, hands on the wall face with fingers splayed, upper foot braced,
  lower leg long down the wall, the free wing open (`WALL_FREE`, through `wallSoft`: slower in than
  the body's `wWall`).
- **Wall kick** (`KICK`; the shaft climb is slide, kick, catch three times): the yaw spring runs at
  omega 62 for 0.13 s (head 80), so she is round and facing the jump on the 2nd-3rd frame (it was a
  face-on pencil with the wings as a bow tie for 4-5 frames); then 0.2 s of push: the leg that
  kicked left long behind toward the bark, lead knee up, arms back, lean + 0.2. One frontal frame
  with both wings parted remains, and the antennae whip through vertical for 2-3 frames.
- **Re-catch** (`catchReach`): `index.ts sideGaps` gives `rig.wallAhead`; from 84 px out (moving
  toward it) the lead hand and foot go out to the bark, so the slide pose is arrived at, not cut to.
  The wing lifting as she starts to drop before the catch is the fall's parachute, not the wall.
- Wing strands have no body collision: a stiff fast flare throws them over the head. Keep flare
  stiffness boosts low and `BEAT_UP` <= ~-112 degrees. Chain pulls: kG + kL < 1 per sub-step (capped
  0.6 / 0.35) or a stiffened chain locks into a rod. Chain drag is relative to still air: `dragK` is
  cut in the air and in the dash or the wings blow straight up/down. The wing rest frame is not
  rotated by the dash's lean.

## Somersault (double jump; liked: do not change the physics or the ball)
- Angular momentum: spin rate = L / I; `tuckAt` is the fold timeline, `inertiaAt` 1 (ball) .. 3.85
  (open) + 5 for the wings flaring at the kick-out; the angle is the normalised integral
  (`SPIN_TABLE`), so it ends exactly upright. Turns 1-4, **default 3** (`Rig.turns`, `?turns=`, key T,
  localStorage `vesper.turns.v3`, `__vesper.turns`). The figure turns about its centre of mass, which
  is moved onto the box centre as she tucks. `TUCK` pose; wings wrap as one shell (`TUCKED`, stiff x9).
- At high spin single frames strobe: lights are smeared into rings (`drawSpinRings`); sampled trails
  fade out there. Landing in the ball = a roll-out (`rolling`, sits 17 px lower, never rocks back).
  A slash during it kicks her out at once (`spinCut`); dash / wall hand the angular velocity to a
  critically damped spring. Dust burst on `sig.opened`; `openHold` keeps the wings half spread after.
- Capture: x 600-900 is under island F1; a tapped double jump has ~30 frames of air.

## Glide (`motion === 'glide'`; liked; `GLIDE` in rig.ts, `SOAR*` in wings.ts)
- Wings unfurl (`Chain.scale` x1.56-2.3) and lie to EITHER side on screen (wing A always screen-left)
  so a mid-air turn swivels the body under wings that stay spread; both drawn behind her at soar > 0.5.
- `rig.soar` (wing spread) is separate from `rig.wGlide` (body pose). `catchK` = the billow as the
  sim sheds fall speed; the body is a pendulum about the collar (`swing`); `bank` from vx and ax;
  slow breath, per-wing corrections, a wing beat every 3.4 s (`rig.beat`), landing reach
  (`groundDist`), per-wing fold beside solids (`foldT / faceX`), `flare` on touch-down, backlit amber
  membranes (`View.back`), silk wing-tip trails and shed sparks.
- A held J only glides after a double jump or below the launch height.
- **The wings ask to be used** (`YEARN`; playtest 2: a player who taps never finds the glide): in any
  fall with no glide, after 14 frames the wings try to open, wider and sooner until frame ~27:
  `rig.soar` gets a floor (`base` 0.3 x `yearn`) and each wing adds its own try on `yearnPh`
  (wings.ts `tryK`: out fast, held, blown shut, the two 0.17 of a cycle apart, never the same size
  twice), 2.1 -> 3.3 tries / s; shut, the membrane shakes. Body: a small lift per try, arms out, and
  late in a long fall a look up at them. A flat tapped hop (19 frames of fall) barely shows it.
  Quieter once she has glided in this run (`known` 0.55; a re-form does not reset it), and off for
  the rest of an airtime in which she glided (letting go was the player's choice; a unit test also
  wants a released glide fully folded). Off in the somersault, the stoop, a slash, a blow.
  `view.soar` is the max of the two wings (a wing swung out to the side must be drawn behind her)
  and the far wing's tint comes in early (`tint`), or it is a dark blot in the right zone.
  The first version (soar floor 0.2 only) changed nothing: the fall's parachute shape already looks
  like a small half-open wing. It only reads when the second wing comes out on the other side.
- **First glide of a run** (`firstOpen`, 0.75 s): soar rate 42, catch spring + 1.6, wings 14 degrees
  higher and 6% longer for the beat, body lifted 2.6 px with the chest open, eyes wide, the hem puff.
  24 degrees + a catch kick of 2.6 stood the wings up like sails for 20 frames.
- Landing out of a glide: no squash (the sim's land is never `hard`); `flare` holds the spread ~6
  frames, then the wings stay lifted while the span draws in (`36 x 4 soar (1 - soar)` on the
  ground) and come down behind her. Without that they drooped flat along the grass (a bow tie).

## Thorn slash (sim: memory/combat.md; `STROKES`, `CUT`, `SNAP`, `BRACE`, `CLANG` in rig.ts; look in `slashfx/crescent.ts`)
Round 19: ONE crescent on Hollow Knight's nail-slash principles. Round 20: a line, not a lid. **Round 21
(playtest 5: "the structure is at HK's level, the finish is not")**: smaller, darker, shorter, swept out of
the blade, three different marks. **Round 22 (playtest 6: "right size and life, but a hairline; on blue a
scratch")**: weight without glare: a filled leading WEDGE while it is cream, a darker-edged hold line.
- **The wedge** (`CRESCENT.wedge*`): while it is cream (`bright`, i.e. its first two seen frames: a whiff's
  sweep-out + whole frame; a hit's frame + the first frame of the freeze, `holdAt` 1) its thickness is
  `s^2 (1-s)^1.2` along its LENGTH (`sl`, arc length, not the blade parameter: the samples bunch at the ends
  and the tip came out a blunt flag), peak at s 0.62 = `wedge` x `thick` (1.7 cuts / up, 1.3 finisher and
  pogo: at 1.8 both were lids). Behind the wedge the old `even` belly's line floor keeps a hair to the tail.
  Then it thins to the line exactly as before (`wk` = `bright` blends wedge -> even). Same tone, no new
  brightness. A peaked profile with a corner (two power laws meeting) read as a flag: keep it one smooth curve.
- **Hold line**: `holdPx` 4.6 px floor while/after held (was the 3.3 `linePx`), `duskLine` 2 px dark edge each
  side of the line (the cream wedge keeps a 1.1 px hair). Reads on blue and violet now; it adds dark, not light.
- Measured at play zoom (1920x1080, zoom 1, crescent alone vs `markHidden`, `flashHidden` hides the contact
  cross): crescent area peak 1.3-2.0x before (e.g. blue cut 1 hit 932 -> 1567 px); px > 200 luma made by the
  crescent: blue / violet 0-19 (the zone-toned cream stays under 200 there), amber peak 1200 = 0.058% of the
  frame (finisher whiff; cuts ~860 = 0.041%). Table: `shots/vesper/slash8/luma.txt`.
- **One crescent** (`SlashMark`): opaque, hard-edged, flat. Its INNER edge is the blade point's path
  (`1 - thick` of its reach), the belly swells outward from it; thinning, it draws back onto that path.
- **Size**: the mark's reach is `Stroke.size` x the sim's (`reach` stays the sim's: a unit test pins it).
  Cuts 0.8 x 110 = 88 px, belly 0.13 (11 px): the whole mark is ~72 px tall, 0.86 of her 84. Finisher
  0.78 x 135 = 105, belly 0.15: ~98 px, 1.16x. Up 0.72 x 124, down 0.9 x 120 (see pogo). It no longer
  reaches the far end of the hit area: a creature hit at full range (shoved back by the cut before) is
  marked by the contact cross only, 20-40 px past the crescent. Accepted for the size.
- **Life** (`CRESCENT`; `age` counts frames it has been SEEN, not hitstop): frame 1 = the **sweep-out**: drawn
  only as far as the blade's point has got (cut 83% round = ~75% of the arc), belly at the blade end
  (`sweepSkew`); frame 2 whole, needle on the blade; frames 3-4 a thinning line; gone on the 5th (finisher
  one more). Cream only while it has a belly (`bright`), a dim lilac line after (`DIM`), both x the zone
  tone (`toneDark` 0.68 blue / violet, `toneLight` 0.88 amber). A whiff is cream for 2 frames, a hit for 1.
- **Hitstop**: it stays where the blade stopped (the sweep-out shape, ending ON the blade's point), thins
  to `holdThin` 0.26 within `holdIn` 1.6 frames and **shivers** (`shiver` px wave along it, `flutter` of its
  thickness, on `heldFor`, render time). After the freeze the line completes with the blade and is gone in
  3 frames. A line never thinner than `linePx` 3.3 world px (`holdPx` 4.6 once held), or it is lost at play zoom.
  (Round 22: it now stands whole for the hit frame AND the first freeze frame, `holdAt`, then thins.)
- **The needle is on the blade**: while it sweeps (`mark.tracking`), index.ts sets the mark's origin so its
  leading end = hand joint + drawn blade (`mark.leadAt`); the offset is then kept on her body. Not on the
  completing frame (the blade's overshoot and her air roll made the arc jump back over her face), not for down.
- **Gotcha**: `__game.render()` re-runs the skin with dt 0. Anything in `SlashMark.frame` that advances on
  a call rather than on `dt` breaks every capture that re-renders (zoomed crops): `if (frames <= 0) return`.
- **Three strokes, three marks** (whiff sheet shows them side by side): cut 1 = a DOWNWARD DIAGONAL, blade
  128 -> -50, ellipse tilted -30 (long axis down-ahead): a "\" from in front of her brow to low ahead,
  body dropping (pelvis -11, curl). Cut 2 = the RETURN, mirrored: -66 -> 36, tilt +30: a "/" from her knee
  to high ahead, body rising, chest open. Finisher = a great RISING cleave: three gather frames coiled low
  with the blade dragged behind (-150), up through the front to 55, rounder ellipse (sq 0.7), hop 14: a tall
  bracket standing 90 px out. Tried and dropped for the finisher: a horizontal cleave as a flat ellipse
  (sq 0.27-0.42): the mark hides under the blade / behind the grass and reads as a thrust; its far half
  would cross her face. A rising hook over her head (tilt 55, to 85 degrees) missed the creature by 60 px.
- **A hit always has a crescent**: `SlashMark.hit` calls it back whole for one frame if it was thin or gone
  (late pogo, a running cut that connects on active frame 5), then it is the hold line.
- **Clang** (`power 0`): the near 0.62 of the arc at 0.6 belly, the line through the freeze, gone the frame
  the freeze lets go (it used to hang in the air two more frames). Pose unchanged (the best thing: keep).
- **Pogo**: a short tight arc (65 px wide, 39 deep) whose lowest point is 58 px under her box (a falling
  down-cut meets its target at the far end of the 80 px area, so that is where contacts are; the blade
  does not reach it, as in HK). On the hit it moves at most 30 px sideways / 30 down / 40 up to sit ON the
  target's top under her (`SLASH_LOOK.pogo*`), is **pinned to the world** (`markPin`: carried up with her
  bounce it hung in mid-air) and floored at the contact (`markFloor`). Contact cross at the same point.
- **Never under the floor**: `SlashFrame.groundY` clamps every point.
- **Up**: own arc (`Stroke.mark`, tail .. lead in blade degrees) from her shoulder line behind over the top
  to high in front; `q0 / q1` = the cut fractions at its ends (nothing is drawn until the blade moves).
- **Blade smear**: drawn long enough to reach the crescent's inner edge through the cut (`stretch` 1.4), back
  to 1.1 within two frames of hitstop: so in the hold the blade's point stands ~5 px short of the line's end.
- **Landed on a creature** (`braceK`), **blocked** (`clangT / clangK`), contact flash (a little smaller now:
  38 / 13 px arms), antenna whip, cape `sweep`: as round 20.
- A unit test pins a lone tap sheathed 21 frames after the press: `hold + home` = 21 (14 + 7); unchanged.
- Rejected over the rounds: belly 0.24-0.33 (a lid); the crescent whole on the first active frame (it stood
  past the blade: "pops whole"); 110-135 px reach at full cream for 7-11 frames (the biggest, brightest
  thing on screen); cut 1 and 2 on the same arc; a down bowl 150 px wide; needles on the OUTER path; a
  forward mark pinned to what it hit; a second smear blade; a translucent band.
- Honest gaps: at full range the crescent does not touch what it hits (above); cut 1's held pose is still
  a low lunge with the blade ~-20 degrees (the mark says diagonal, the body says reach); the finisher and
  cut 2 both rise (bigger, rounder, further out, with a hop, but the same direction); tall
  foreground grass (left zone) hides the low end of cut 1. The amber finisher whiff's wedge is the
  biggest cream shape (~1200 px > 200 luma for 2 frames): the first thing to trim if the owner calls glare.
- Capture: `__vesper.markHidden = true` hides crescent and flash. Staging (round 21 script kept in
  `shots/vesper/slash7/stage.js` + `all.sh`): wrap `__enemies.update` to grab the live `sim`; move every
  other enemy to x -5000; set the burrback's `x / homeX`, `facing` away and `strikeCd = 9999` each frame for
  a landed combo (`.4 A1 .20 A1 .22 A1`), leave it to brace and press 6 frames into `braced` for a block,
  hold a lampwing 68 px over her head for the up cut, teleport 84 / 100 px over it + `D+A1` for an early /
  late pogo. Zones: x 960 (blue), 2236 (amber; pogo at 2340: pods at 2176 and 2570 eat slashes). One eval per
  stage (other agents' HMR reloads the page between evals). "3x" on the 1280 canvas is 2 px per world px.
  Sheets: `shots/vesper/slash7/` (`*-3x`, `*-1x` play zoom, `L` blue / `C` amber, `cmp-*` = before on top,
  after under, `before/`); rounds 19 / 20 in `slash5/`, `slash6/`. **Round 22: `shots/vesper/slash8/`**: full
  1920x1080 play-zoom frames, before | after per row (`cmp-hits|whiffs|up-pogo-{L,C,V}.jpg`), the scripts
  (`stage.js` measures luma per frame with / without the mark and the flash; `run.sh`, `all.sh`, `sheet.py`,
  `table.py`, `cmp.py` = tight crops by the crescent's box), and a ground fight at burr-bank (`clip --pickups
  --at 330,1088 --zoom 2 --size 960x540`: zoom 2 on a 960 capture IS play zoom; zoom 1 there is half).

## Health (sim: memory/enemies.md; `HURT` in rig.ts)
- `hurt` (round 21; owner dislikes any brightness on her, and the old two-frame tone flip turned her whole
  body pale lavender): she goes DARK. Recoil pose pops 55% past itself, `Painter.dimK` drains every solid
  tone to 0.6 of its own grey for 2 frames and back over 5 (`HURT.dim / dimOut`; glows x0.3, lanterns and
  eyes dimmed), eyes shut 7 frames (`shut`), wings blown toward the blow, 9 dark plum scales (`Fx.scales`,
  `SCALE_TINTS`; no gold motes), then the soft alpha pulse while invulnerable (4.5 Hz). Low health dims
  lanterns and eyes. `fade` dissolves her into motes; `reform` gathers 46 motes and she unfolds from a curl.

## Pickups
- `pickup` sets `rig.joy` and a flash; the light RUNS lantern -> antenna bead -> eyes -> eye-spots
  (`View.glintT/glintK`); a 'great' runs `rig.flourish` (wings open once). The first glint of a run
  puts a small skip in the stride.

## Acting at the lanterns and the heart (sim: memory/goal.md; `ACT`, `Cue`, `actPose` in rig.ts)
- A skin only gets the player and the events, so `link.ts` (`vesperLink`) is the hand-off with the goal
  renderer (updated after her): it leaves `goal` (the state) and `beads` (each glass's x, y) there, she
  leaves `offerX/Y` (her open palm while kindling, else the chest joint) and `live`. `index.ts readGoal`
  turns that into `rig.cue` (the rig stays testable without Pixi). She reads the goal one render frame late.
- Everything is an OVERLAY on the stand: acting poses (`KINDLE`, `REST`, `WARM`, `EMPTY`, `LISTEN`,
  `UPLIFT`; hands are near / far and trade with the turn through `mix`) are lerped onto the blended
  pose by weights x `wIdle` x (1 - grip) x (1 - hurt), so a step, a slash or a blow takes her out at
  once and the spine / hand springs do the easing. She turns to the lantern's FOOT (the light runs
  to the foot and up the stem), render only; the player's facing is untouched.
- What the wings / antennae / lights read: `cloak` (+ = relaxed open: kindle; - = wrapped round her,
  `WRAP`: rest), `shiver`, `antLift` (deg) + `antCurl` (rad per segment), `eyeLit` (scales `view.glow`
  and the eye core's size), `raise` (deg the spread wings lift above the glide shape), `gazeAX/AY/W`.
- Kindle: half-kneel (pelvis 23.5), near hand out LOW at chest height (a hand lifted to the glass sat
  in front of her face and read as a hand on her chin), chin up, eyes dim and lids lower as the
  glints leave; `lanternKindle` = look up, eyes wide, the glint light-run, a breath of the cloak,
  held `catchHold` then she rises. Refuse: a short reach, then `EMPTY` (head down into the hand,
  antennae hooked down) ~1.2 s. Rest: `seated` from the first rest frame until the player moves;
  sat on her heels, wings wrapped; the heal lifts her face, shivers the wings, then a calmer seat.
  Company: idle 2.6 s by a lit lantern = hands up to the glass (6.5 s of every 15), looking into it.
  Sleeping heart: armed by `heartSleep`, played when she next stands still within 64 px of the bud.
  Waking heart: head / gaze / antennae only (over the shoulder if it is behind her), so it shows on a run.
- Ending (`cue.gathered` and standing still): she turns to `endTurn` 0.6 (0.34 hid the lifted chin:
  the head's pitch is drawn x the head's turn; the head itself is turned further, HYAW 1.4), wings
  unfurl through the glide's own `soar` over 2.4 s (they come out low and rise: liked), raised 13
  degrees into a V (flat they read as a bow tie and hid the flower), ONE beat at 2.55 s (amplitude
  0.5: at 0.8 the down-stroke flattened the wings on the ground), lanterns + 32%, then breath, the
  glide's wing drift and the ordinary blinks for as long as it lasts. A state already ended skips
  the ceremony. Works from either side.
- **Notice** (`lanternNotice` / `lampNotice`, `ACT.notice` 1.3 s; not scaled by the stand, so it
  shows at a run): antennae tip forward (20 degrees standing, 38 running: more straightens them into
  rods when she stands), chin up a little, eyes wide, gaze to it; the head follows the glass as she
  passes (`HYAW` 1 -> -0.6 by how far ahead it is, `lookS` quickened to 12) and lets go. Ground
  only (in the air it turned her head away from the jump for a whole wall kick), off while kindling
  or resting.
- **Wayside lamps** act exactly as lanterns: `readGoal` runs one list (lanterns, then
  `scene.lamps`, the goal renderer's `beads` order), kindle flag `kindling` or `kindlingLamp`, state
  from `goal.lamps`; `lampKindle / lampRefuse / lampRest` share the lantern handlers.
- Antennae gotcha: their rest shape bends back ~22 degrees per segment, so `antCurl` -0.4 exactly
  straightens them (two rods: rabbit ears). Keep it under ~-0.2 for an arc. The head's pitch also
  turns them (chin up = antennae back), so a "forward" lift has to beat that first.
- Not solved: the lantern's stem stands in front of her wherever the player stops inside the 48 px
  trigger, so the offering hand is often half behind it; the hand is a 4 px oval (no palm to turn
  up); a blow while kindling / resting is unit-tested, not looked at. Sheets: `shots/vesper/goal/`.

## The ceremony: ember, summit lantern, the wait, the offering (round 22; `ACT`, `Cue`, `actPose`)
`index.ts readGoal` adds to `rig.cue`: `emberId / emberHangs / emberDx,Dy` (the keyed lantern's pickup, relative to
her head = feet - 62), `carry` (keyed, lantern dark, no channel on it), `lampKeyed`, `away + awayDx,Dy` (a channel
running on a light she is not at), `heartWait`. Weights for tools: `__vesper.act.{guard, reach, wait, give, look}`.
- **Glance up at the ember** (`lanternKindle` with the ember hanging < 900 px from that lantern; `ACT.show*`): the
  show flight leaves the glass ~1.6 s after the catch and is out of the top of the picture at ~2.4 s (measured on
  the sheet), so the look comes in at 1.15-1.7 s, travels glass -> ember over 1.45-2.5 s, lets go by 4.3 s. Head
  pitch up to -0.5 (x 0.6 at a run), chest opens, antennae -40..-62 degrees (the lifted chin alone lays them back
  flat: at -34 they still lay back). If the goal layer's flight timing changes, retime `showIn / showRise`.
- **Taking it** (`pickupWake` of the ember .. `pickup`, 54 frames): no flourish and joy 0.22 for this pickup (a
  great glint's wings-open is a victory pose). Both hands go out to it (it lifts out of the cup and comes down
  from over her brow: `over`), draw in to a cup before her collar (the coal's first point is `vesperLink.offer`,
  which is her near hand then), then `SHOULDER` 0.04-1.75 s: near hand up by it, head half turned (HYAW 0.62),
  eyes back. **HYAW lower than ~0.5 brings her face round under the coal and it sits on her eyes** (the goal
  layer circles it 5-25 px behind her centre at head height, in front of her on the near half).
- **Carrying** (`rig.guard`): standing, the hanging hand at her ribs, wings 24% toward `WRAP`, a glance back
  about every 5.9 s; running, the near arm bent at her side (-3.2, -8.6) instead of trailing, the cape's strands
  drawn to the middle one (x0.55), 7% shorter, the stride beat x0.6. Deliberately subtle; gone when it is given.
- **Summit lantern without it** (`lanternRefuse.key`; replaces the empty-hand refusal): up on her toes looking
  into the glass with the near hand half lifted (0.2-1.4 s), then she TURNS to where the ember is, head first and
  pitched down at least 0.24 (1.05-2.5 s), and back. A head turn alone (HYAW -0.6 on a body facing east) is a
  face staring at the camera; the body has to come round.
- **With it** (`liftT` from the channel's start at the keyed lantern while `guard` > 0.3; `GIVE`, `ACT.give`):
  she stays standing, both hands up and out toward the glass for the coal's 0.42 s, the kneel weight is x(1 -
  0.92 lift) so she goes down as the hands come down; `giveHold` keeps her down 0.3 s longer after that catch.
  **Her arms are 17 px and her head 20: hands cannot go over her head.** Face height, out in front, is the top.
- **Heart wait** (`cue.heartWait`, standing within 84 px, no input; `WAIT`): turned to the heart, tall, chin up
  a little, breath at 1.5 rad/s with the chest a beat behind, hands eased off her sides, antennae rising, wings
  to soar 0.2 raised 18 degrees over 2.6 s (`waitOpen`; at 0.3 unraised they lay flat at her hips: the bow tie
  again). `waitOpen` is kept through `gather` and the walk to the centre, and the ending's unfurl takes over by max.
- **Offering** (`heartOffer`, `giveW`): arms open to either side (near +15, far -13 forward: she is turned 0.6
  to us, so "forward" is the only sideways there is), head down to watch them go; glints leave her near hand
  (`offerK`). Dark arms on dark open wings: only the pale hands show, a few px either side of her waist.
- **`groveWake`**: 1.5 s looks: flowers = down and round (HYAW 1.75, HT +0.8), paths = the other way (HYAW -0.9;
  at -1.5 we saw the back of her head), canopy = up (HYAW 1.7, HT -0.3). Pitch only shows with the head turned.
- **A channel that runs on behind her** (`cue.away`) and a catch with `away`: never the kneel. Head / eyes to its
  glass (over the shoulder), standing a hand out toward it, running the near hand left 4 px higher; 0.85 s more
  after the catch. Seen: kneel begun, run off at frame 10, caught at 28 mid-stride, no kneel; and stopped 100 px on.
- Staging (scripts kept in `shots/vesper/ceremony/`: `cap.ts` + `scenes.ts`, a tsx script on `tools/lib/browser`,
  own headless page set offline after boot, sheets composed in page): move enemies off every frame (grab the live
  sim by wrapping `__enemies.update`), `health(hpMax)` after gathering (a hurt hero rests at the lantern and sits
  down in the middle of the sheet), skip great glints when filling the wallet and take `great-crown` first (a
  great glint arriving mid-sheet is a flourish), `setTuning({goal: {offerTier2: 40, offerTier3: 60}})` to see
  all three tiers. tsx's `__name` helper must exist in the page (`window.__name = (f) => f`).
- Not looked at closely: the carry glance (only on a small long-idle sheet), taking the ember at a run or in the
  air (head only, by design), the old plain kindle / refuse / rest after this round beyond what shows on the
  `show` and `give` sheets (kneel, catch, rise are on those).

## Capture and review
- `window.__vesper`: `turns`, `markHidden`, `hidden`, `mesh` (her Pixi mesh),
  `act` (acting weights, `endT`, `cloak`, `antLift`, `eyeLit`, `soar`, the offer point).
- Goal moments: plain URL (not `?nopickups`); wallet by teleporting onto waiting pickups; the ending:
  kindle all three (teleport to each foot - 20, step 34), teleport (5132, 1088), `R6`, step 300.
- One `playwright-cli eval` that steps and draws each frame's canvas crop into a 2D canvas grid and
  returns a data URL survives other agents' HMR reloads. Clean plates: hide `mesh.parent.parent`'s
  children `playfieldFront`, `foreground`, `air`. **Silhouettes**: hide every layer except
  `character`, render with and without her (`hidden`), threshold the difference at ~8: exact, and no
  scenery artefacts (differencing against the lit scene picks up her light on vines and grass).
- Open flat ground: x 450-1400 at feet y 1280 (pool after 1536), 3200-4608 right; walls for slides at
  x 3328 / 3584 (teleport to 3350,600 and hold L). The canvas is 1280 wide for a 1920 view: zoom 1.5
  gives her 84 px, zoom 3 scaled 0.5 the 84 px silhouette, x0.381 the 64 px one.
- Sheets: `shots/vesper/run17/` (before / after of the run rebuild) and `shots/vesper/run17b/` (the
  follow-up: glide entry / steady + turn / land-run, somersault standing and running, slash chain
  standing and running, hurt, wall slide + jump, taps, head close-up, the ground route at game size).
- Capture recipes after the layout pass (the old (1500,1280) glide recipe hits a wall now):
  long clean fall: teleport (960,300) or (5050,250), no input (lands frame ~50); glide + landing:
  teleport (1500,704), `L+J70 J40` (wings at 52, lands on the 640 platform at 89); fall, then a first
  glide: teleport (960,150), `J2 .46 L+J80`; three kicks in the shaft: teleport (3350,1100),
  `L12 R+J14 R9 L+J14 L9 R+J14 R9 L+J14 L9`; lamp kindle: teleport (3640,192) step 70, (3648,1280)
  step 70, then (3138,1280) and step. A teleport within 260 px of a dormant light fires its notice.
  A teleport into the air leaves the double jump in hand: a held J there is the somersault first.
- Sheets of round 18 (fall / first glide / landing / notice / lamp kindle / wall kicks / start-stop,
  1:1, zoom 3 and game size, `base/` = before): `shots/vesper/r18/`. Foot slide is measured, not
  looked at: drive `Rig` with the sim's accel profile and difference the toe joints while y < 1.2.
- Where she is still hard to find at game size (ground route, running): against the big dark fallen
  log and trunk bases of the left zone (x ~900-1400) and the dark rock shelf of the right zone
  (x ~3300-3600): only face, eyes and lanterns carry her there. Fine in the centre zone and wherever
  the mist band is behind her.
