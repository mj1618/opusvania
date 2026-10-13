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

## Thorn slash (sim: memory/combat.md; `STROKES`, `CUT`, `SNAP` in rig.ts; look in `slashfx/crescent.ts`)
Round 19 (owner twice: "the sword slash still doesn't look very good"; playtest 4 must-fix 1): the three
switchable styles (brush / ribbon / scale-dust), the Y key, `?slash=`, `__vesper.slash`, the smear wedge
and the pirouette finisher are GONE. There is one slash, built on Hollow Knight's nail-slash principles.
- **One crescent** (`SlashMark`): opaque, hard-edged, flat cool cream, a thin lilac line inside the inner
  edge, a 1 px dusk hair round it. No glow, no gradient, no particles of its own. Its INNER edge is the
  blade point's path (`1 - thick` of the reach, so the blade in her hand ends on its leading needle); the
  outer edge swells from that path to the sim's reach at the middle. Every cut is this shape on a
  different arc of the stroke's ellipse (`show`..1 of the cut, `thick` 0.24-0.28).
- **Life**: whole on the first active frame (the blade crosses its arc in 1.7 frames, `CUT`, and is ~83%
  round on that frame), whole for 2 frames (finisher 3), then 3 frames thinning toward its outer edge
  while the tail end draws up to the leading end; gone on the 6th (7th). Its clock stands still in
  hitstop (it holds with her). It hangs from a fixed offset on her BODY CENTRE taken when the cut
  begins (`markOx/Oy`: chest + 4 px ahead, forward cuts 10 px lower = the target's height), so it
  moves with her and never drifts, pins or stays behind. A hit does not touch it.
- **Strokes alternate**: cut 1 comes DOWN in front (122 -> -56 degrees) and ends in a low reaching lunge,
  blade low ahead; cut 2 is the mirror, UP through the same place (-66 -> 72), ends tall, blade high
  ahead; the finisher is cut 1 larger (reach 135, 3 frames of gather with the blade swung up behind,
  a hop, held to frame 22). Up = the crescent overhead (back to front, front to back, larger); down
  (pogo) = beneath her, drawn straight from the sheath, back to front. Up / down crescents are let
  out x1.75 sideways and drawn at 0.88 of the sim's reach (`SLASH_LOOK`): to the true hit area
  (100 px wide, 124 from her centre) they are a tall arch far over her head.
- The press frame is the anticipation (`wind` = the sim's startup, 1 frame; `gripIn` is instant so
  the blade is already raised behind her on it); the finisher has 3.
- **Contact flash** (`SlashMark.hit`): a hard cream cross at the target's near side, long arm along the
  cut, 4 frames on render time (it runs through the hitstop), 3 specks (5 on the finisher) thrown on
  between the cut's direction and away from her. `enemyBlock` (a burrback's braced shell) is a
  **clang**: `sig.blocked`, the cut still advances on that frame, a smaller cross turned ACROSS the
  cut at `hitX/hitY`, specks back toward her. There is no terrain / wall clang: the sim emits nothing.
- Tone per zone: `toneFor(pale)` = 0.84 on the blue and violet sides, 1 in the amber centre (at 0.7 it
  was concrete grey; at 1 it glares on the dark side).
- A `Stroke` still = an ellipse about the chest sized to the sim's reach, blade angles, frames `wind /
  cut / hold / home`, two body keys (`K_*`) ADDED to the blended pose (running, the stride continues
  under the cut). Up / down also lerp to `UPCUT` / `DOWNCUT`. `Stroke.turn` (the pirouette) is still
  read by the rig but no stroke sets it.
- Rejected on the way here: the crescent with both needles on the OUTER path (a moon hanging a blade's
  length in front of her, the blade nowhere near it); belly 0.3-0.33 (covers the burrback for the
  whole hitstop); the origin at chest height (the belly sat at her head, over the creature); specks
  along the cut only (a down cut throws them into the ground); up / down at the true hit width (an
  umbrella); a leading end cut short at the blade on the first frame (a blunt D through the hitstop).
  Older: a wide translucent band (soap bubble), deep notches (shark teeth), a second smear frame (a
  second blade), a mark pinned to what it hit (it hung in the air after the blade had left).
- Honest gaps: the up crescent still floats ~45 px above her head (that is where the hit area's far end
  is; the blade is 46 px); cut 2's body is close to her standing pose (tall, weight not far forward);
  the down crescent is drawn over the ground when she pogos something on the floor; a hit late in the
  active window (a4-a6) finds the crescent already thin or gone, so only the cross marks it.
- Capture: `__vesper.markHidden = true` hides crescent and flash (the swing must read alone). Burrbacks
  brace and block from the front now: cut from behind for a real hit. Sheets: `shots/vesper/slash5/`
  (`*-3x.png`, `*-1x.png` = play zoom; left = blue zone, C = amber centre).

## Health (sim: memory/enemies.md; `HURT` in rig.ts)
- `hurt`: recoil pose pops 40% past itself, tones flip for two frames (`Painter.invertK`), wings
  blown toward the blow, 26 pale scales burst off (`Fx.scales`: 1.9-3.4 px, 0.4-0.8 s, mostly the
  way she is thrown; no glow) plus 7 motes; then a soft alpha pulse while invulnerable (4.5 Hz;
  7 Hz read as flicker). Low health dims lanterns and eyes. `fade` dissolves her into motes;
  `reform` gathers 46 motes and she unfolds from a curl.

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
