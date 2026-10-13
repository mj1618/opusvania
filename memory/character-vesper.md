# Character skin: Vesper, the moth (`src/render/character/vesper/`)

THE hero. Slender moth-person, ~84 px tall; wings worn as a cape. Imports `../hooded/math`; `chain.ts`
(hooded chain + per-segment `extra` angle, `dragK`, `scale`) and `paint.ts` are our own copies.
Files: `rig.ts` poses + springs -> skeleton; `wings.ts` wing strands + antennae; `draw.ts` shapes;
`fx.ts` dust, trails, scales; `slashfx/` the slash's look; `link.ts` hand-off with the goal renderer;
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
  speed in 3 frames and stops in 3; the POSE takes its time: `speedK` (lean; rate 6.5 up, 8 down)
  and `boundK` (trot -> bound; 9 up, 12 down, driven by `speedK`), `wRun` lets go at 12. So the
  lean-in takes ~15 frames, a 4-6 frame tap stays an upright trot step, and a stop settles over ~12.
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
  lower leg long down the wall, the free wing open (`WALL_FREE`).
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

## Thorn slash (sim: memory/combat.md; `STROKES`, `SNAP` in rig.ts; look in `slashfx/`)
- Three strokes per direction picked by the event's `step`; a `Stroke` = an ellipse about the chest
  sized to the sim's reach, blade angles, frames `wind / cut / hold / home`, two body keys (`K_*`).
  `wind` = the sim's startup; timeline is render time, frozen in hitstop (the hit frame still moves).
  The near arm holds the thorn (`swordSide`). Body key is ADDED to the blended pose: running, the
  stride continues under the cut. Up / down also lerp to `UPCUT` / `DOWNCUT`. Finisher = cleave with
  a hop (`K_HOP`); the pirouette (`Rig.finisherTurn`) was built and judged worse, off.
- Shared look: leaf blade (`BLADE_LEN` 46), ONE smear frame (first cut frame), the snap (overshoot at
  speed, ring out; `back` 0.55). Mark laid in the blade frame as it was when the cut STARTED
  (`markRoll`); up / down marks 55% wider on the trailing side (`markWide`).
- Three styles (`SlashStyle`; Y cycles, `?slash=1|2|3`, `__vesper.slash`): **brush** (default: flat
  opaque cream mark, barbs, dry-brush slits, gone by frame 6-8), ribbon (close to the look the owner
  rejected; option only), scale-dust (tumbling scales; hers). Everything near her is opaque or
  additive, never partial alpha (the hero matte turns a faint veil into dark glass).
- Rejected: a wide translucent band (soap bubble); belly > 0.34 of the reach (a moon / umbrella); deep
  V notches (shark teeth); three parallel bristles (ribcage); a second smear frame (a second blade).
- Still open: the up cuts' mark is an arch over her head (the hit area is tall and narrow).

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
- Antennae gotcha: their rest shape bends back ~22 degrees per segment, so `antCurl` -0.4 exactly
  straightens them (two rods: rabbit ears). Keep it under ~-0.2 for an arc. The head's pitch also
  turns them (chin up = antennae back), so a "forward" lift has to beat that first.
- Not solved: the lantern's stem stands in front of her wherever the player stops inside the 48 px
  trigger, so the offering hand is often half behind it; the hand is a 4 px oval (no palm to turn
  up); a blow while kindling / resting is unit-tested, not looked at. Sheets: `shots/vesper/goal/`.

## Capture and review
- `window.__vesper`: `turns`, `slash`, `slashName`, `finisherTurn`, `hidden`, `mesh` (her Pixi mesh),
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
- Glide capture that lands cleanly on open ground: teleport (1500,1280), `L4 L+J14 L2 L+J50 L80`
  (glide frames 29-70, lands ~x 670 at frame 81).
- Where she is still hard to find at game size (ground route, running): against the big dark fallen
  log and trunk bases of the left zone (x ~900-1400) and the dark rock shelf of the right zone
  (x ~3300-3600): only face, eyes and lanterns carry her there. Fine in the centre zone and wherever
  the mist band is behind her.
