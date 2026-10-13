# Character skin: Vesper, the moth (`src/render/character/vesper/`, `?char=vesper`)

Slender moth-person; wings worn as a cape. Imports `../hooded/math` and `../hooded/paint`; `chain.ts`
is a copy of the hooded chain plus a per-segment `extra` angle and a `dragK`.

## Design decisions (owner feedback, do not undo)
- **Face = a pale, round heart-shaped fur disc (barn-owl style) with two big gold eyes and nothing else.**
  No nose, mouth, brows, pupils, liner. Owner asked for "cuter": the eyes are big, round, wide-set and
  low, each a dark amber rim + a bright core that drifts with the gaze (`S_LOOKX/Y`) + two catchlights,
  under a lid (`S_EYE`) that blinks, rests half-down in idle and squints on hard landings; they widen on
  take-off (`S_WIDE`). Flat blank ovals read vacant. Earlier tries that failed: a narrow pale face with chin tufts
  (skull with a beard); dark brow locks over the eyes (sunglasses / angry V). Outer eye corners are
  slightly *raised* (relaxed, sure); lowered corners read mournful, which the owner rejected.
- **No scarf.** Anything pale hanging by the torso reads as an arm. A short fur ruff at the neck only.
- Antennae are thin shafts with a narrow vane; comb barbs read as fishbones, wide vanes as rabbit ears.
- Palette (round 5): post now protects the hero (`POST.lights.heroProtect` 1, `heroBloomCut`), so
  colours are authored near their intended look again: face 0xe4dad4, fur 0xc2bac2, wings 0x9472a6
  -> 0x2e2548, band 0xdccbc0. Before that matte they had to be ~half as bright. If `heroProtect`
  drops, darken the pale values again. Judge in `shots`, never by hex.

## How it works
- `rig.ts`: hooded-style 2.5D rig, retuned. Run = lope: `RUN_CYCLE` 256 px (a footfall per 128 px,
  NOT the sim's 96 px `step` event), stance 18% of the cycle, so both feet are off the ground ~60%
  of the time; feet still plant (tested). Lean, curl, head pitch and hip twist each chase the blended
  pose through their own spring (overlap down the spine); hands go through `Drag2` (world-space
  spring, soft-clamped) so they trail and overshoot on every start, stop, jump, landing.
- **Double jump = tuck somersault** (owner: "legs come in into a ball and then extend out again").
  `spinCurve` drives the angle directly (velocity eases in over the snap-in, constant, eases out to
  exactly one turn; no spring); `spinW` is its own curve (in by 17%, out from 72%); `TUCK` is centred
  on the box centre, the pivot; spine/head springs, hand drag and squash/stretch are bypassed by
  `spinW` so nothing lags out of the ball; `OPEN` is blended in on the way out for the overshoot.
  Every solved joint is rotated about the centre; chains get the angle as extra `rot`. Wings wrap
  over the back as a shell (`TUCKED` lifts + strong curl, stiff x9), antennae curl round in one arc.
  The dust burst fires on `sig.opened`. Interrupted: angle goes to the nearest upright exponentially.
- `wings.ts`: each wing = 5 strand chains (leading .. trailing edge), rest shape = folded cape.
  States are tables of per-strand lift (STREAM, RISE, APEX, GLIDE, DART, WALL_FREE, TUCKED, BEAT_UP)
  blended by rig weights; roots slide from the shoulder line to down the back as `spread` rises.
  Ripple goes into the chains' `extra` rest angles (so the cloth filters it). Mid-turn the two wings
  splay to either side (`lat`). The far wing rides higher when open so fore/hind both read.
- `draw.ts`: wing = 13x13 `Painter.grid`; columns are re-sampled along their length for scallops
  and, with `open`, a fore/hind notch. The eye-spot is painted at a grid cell so it foreshortens.
- `fx.ts`: gold motes that rise (buoyant), short comet trails from antenna tips and wing hem
  (only when the point itself moves fast), land/skid dust. Light `ember` = midpoint of the lantern tips.

## Round 3 notes
- Eyes under the zone grades: rim 0x5e2c04 -> 0xb8660c, core 0xe89a1e -> 0xffd670, almost no additive
  glow on top (glow is what flattened them to yellow). Catchlights 0.3R / 0.14R, blush alpha 0.5.
- Ball: TUCK head pitch 2.0 (chin right into the knees), both wings wrap back over the spine as one
  shell. Sending the far wing forward over the head made a second lobe: don't.
- `openHold` (decays ~0.5 s after the opening) keeps the wings half spread through the post-spin rise.
- Run: stance 16%, pelvis arc 7.4 px, wings half-beat once per stride (`stride` in wings.ts).
- Wall: hand x targets are the wall face itself (`ox + d*(w/2-1.4)`), hands rotate flat and splay fingers.

## Round 4 notes (she is THE hero now)
- Somersault smoothed: 0.48 s; angular velocity is quintic-in (30%), flat, quintic-out (40%)
  (`spinCurve`, integrated analytically), tuck is `tuckCurve` (quintic in over the first 34%, out over
  the last 48%, overlapping the turn). Max frame-to-frame change at 60 Hz: angular velocity 6.8 -> 4.3
  rad/s, tuck rate 18 -> 3.5 /s. A short arm-lift anticipation (`antic`). All driven by render dt.
  Interrupts hand the current angular velocity to a critically damped spring (no kink).
  To SEE a landing interrupt: teleport under trunk A (3264,1152) and `J3 .5 J3`.
- Mane = two rows of round-tipped puffs (`tuft(..., tip)`), inner row lighter and on the fast hair
  spring, outer on a slower one plus speed ruffle. Pointed tufts read as gear teeth. Keep the ruff
  short and only half-rounded: long round ruff puffs read as a hand at her throat.
- Light / halo / glow numbers belong to the atmosphere agent for now: do not retune them here.

## Stance (round 5, owner: "legs curved to the front too much")
- Idle: pelvis height 32.1 (legs nearly straight; thigh+shin = 31.5 plus the ankle), pelvis over the
  weight foot (B at +3.2), relaxed foot A ahead with the heel just lifted, spine upright, chest open.
- `limb()` blends the two straight segments with the Catmull-Rom bow by `ROUND` 0.35: a full bow
  drew every bent leg as one C-curve.

## Round 6: value design (see memory/reference-study.md, gap 2)
- Knight-style: darks are deep plum-indigo (wings 0x553a6e -> 0x150f28, tunic 0x34274e, legs 0x2b2044,
  crown 0x2e2246), the face disc is the brightest surface (0xf6f0ea lit / 0xbab2cc shade), eye core
  to 0xffe9a6, pale accents (band, cuffs, feet, ruff) second. Dark shades carry rim 1 / cool 0.95 and
  the painter's `coolColor` is a brighter moon blue. The cool fill in hooded/paint.ts only reaches
  edges facing upper-left: a truly continuous rim needs a copy of the painter.
- Head halo: radius 72 warm, 0.1. `ember` light: radius 300 (+70 dash, +90 flash), intensity 1.15 x glow.
- Run float (foot lift and pelvis arc) scales with `speedK`, so starts/stops/turns step low.
- Pickups: `pickup` events set `rig.joy` (head/chest lift, antennae perk, small wing flick, 0.7 / (1 +
  combo/2)) and a flash through lanterns/eyes. A 'great' runs `rig.flourish` (0.85 s envelope) which
  drives `rig.soar` to 0.86: the wings open to both sides once and fold. While running the small
  reaction is nearly invisible next to the pickup renderer's own burst; that is deliberate (no jitter).

## Round 7
- `paint.ts` is now our own copy of the hooded painter: `coolWrap` (0.5) puts the cool rim on every
  edge the key light leaves dark, not only upper-left ones.
- Ground turn = pivot: foot lift is cut by `1 - |d|` so both feet stay down through the swivel.
- Footfall give: each half-cycle of the run kicks the crouch spring by 9.
- Sheets: scratch `seq.mts`-style capture (one browser, step N + screenshot) survives HMR better than clips.

## Round 8: the wing glide (`motion === 'glide'`; numbers in `GLIDE` in rig.ts and the `SOAR*` tables)
- **Silhouette**: the wings unfurl (`Chain.scale`, strand lengths x1.56-2.3, ~97 px fore wing) and lie
  to EITHER side of her on screen, wing A always screen-left and wing B screen-right (`c.d` goes to
  +1 / -1 instead of the body's turn `d`), like HK's Monarch Wings. Because the sides are absolute, a
  mid-air turn only swivels the body under wings that stay spread; near/far brightness cross-fades
  with `|d|`. Both wings are drawn BEHIND the body while `soar > 0.5`.
- `rig.soar` (wing spread, in 25/s; out 6.5 release, 34 dash, 15 wall, 17 fastfall, 11 after the
  landing flare) is separate from `rig.wGlide` (body pose; drops at 30/s on the ground or it would
  hold the feet up). Span follows `soar^2`: a folding wing is already short when it swings in.
  The far wing's flip to its own side happens early (`side`, soar 0.03-0.4), while it is small;
  flipping at full span showed a dark edge-on slab beside her face for two frames.
- **Catch**: `catchK` = spring (13, 0.5) kicked by `glideStart.vy` and held up by the sim's real
  deceleration (`lastVy - vy`), so the billow lasts exactly as long as the 11-frame catch and ends in
  one overshoot. It raises the leading edges (27 deg), cups the strands, stretches the span 5%, throws
  the legs down and arms up. The body is a pendulum about the collar (`swing`, screen-space rotation
  of the solved joints, head at 30%), kicked forward by the catch and driven by horizontal acceleration.
- **Bank**: `bank` = 0.009 x vx + 0.2 x smoothed ax, added to the wings' frame (and 35% to the body).
- Steady life: common breath (2.3 and 0.83 rad/s), per-wing noise corrections (0.47, 1.13 Hz-ish),
  slow ripple, a 15 Hz hem flutter on the last segment scaled by airspeed.
- Exits: land = `flare` (wings stay up ~0.1 s, +20 deg, then fold); fastfall = `dive` (table `DIVE`,
  also any fall above 22.5 px/f); dash/wall just use fast `soarOut`. Out of the somersault `openK`'s
  BEAT_UP is cut by `soar` so the unfurl runs straight into the opening.
- Draw: wing grid is 17x17 now; hem and band are functions of u/t (`tab`, `bump`), `HEM_SOAR` is the
  spread outline (waist + short hind tail), second eye-spot and warm membrane light fade in with soar.
- Fx: `Fx.trail` sheds SPARK particles from all ten strand tips (they keep 12% of her velocity, so
  her path draws the trail); two wing-tip `Trail`s follow wing A / wing B (fixed, not near/far, or a
  turn draws a streak across her). Lantern trails are cut 75% in the glide (they read as speed lines).
- Capture scripts: a held J only glides after a double jump or below the launch height; to catch a
  long fall use `R+J8 R10 .2 R+J6 R46 R+J200` from trunk B top (3660,192). Scripts passed to
  `g.input` queue AFTER what is already queued.
- Round 9 additions: a slow wing beat (`rig.beat`, `pulse()` every 3.4 s, 0.8 s long: lift, press
  down 34 deg, body rises 2.6 px, `sig.beat` puffs dust); landing reach (`rig.groundDist` from the
  scene rects, `rig.reach` from 78 px of clear air: legs come under her, wings brake); per-wing fold
  (`Secondary.foldT/faceX`, set from solids beside her at wing height: that wing shrinks to 30% and
  its strands are clamped to the solid's face, which is also the wall exit); backlit membranes
  (`View.back` per wing: the centre zone, plus `shaft<i>` lights whose beam, along KEY_LIGHT, passes
  the wing); silk wing-tip ribbons (`Trail` with `silk`); denser, longer-lived sparks.
- Not done: wing beat is hard to pick out on every-4th-frame sheets (tested by number, not by eye);
  landing reach not checked at zoom.

## Value plan (owner, round 9: "too bright in the face", "it looked better when it wasn't so bright")
- She is a dark plum figure with a SOFT pale lilac-ash face; the eyes, lantern tips and eye-spots are
  the only bright things. Face on screen: lit side luma ~160-185, shadow ~110-130. Never near-white,
  no head halo, no rims (see Shading below).
  Do NOT brighten her to win the look:stats hero ratio; the owner's eye wins.
- Post grades the three zones differently and that lifts pale surfaces by different amounts, so the
  pale tones are scaled per zone: `view.pale = 0.72 / 0.94 / 0.68` (left / centre / right, by
  `zoneWeights(player.cx)`), applied to the face, cheek fur, ruff, hands, wraps, feet and hem band
  (`PALE` list and `paleNow` in draw.ts). If post's exposure changes, re-measure the face (crop at
  zoom 6, post on) and retune these three numbers, not the base colours.
- The face is a smooth disc with a feathered edge (a 8% larger, darker, 60% alpha copy underneath),
  a brow shadow, three fine pointed cheek tufts. The mane is three broad dark locks plus two lighter
  ones. Rows of same-sized round puffs (cheeks, mane, ruff) read as a bumpy, warty face at 84 px.
- Small-glint reaction: the light RUNS: lantern flare, a bead down the antenna (0.16 s), eye bloom,
  then the wing eye-spots (`View.glintT/glintK`, strength 0.7 + 0.1 per combo step, cap 1.1); the
  first glint of a run puts a small skip in her stride (`crouch.v -= 34`).

## Shading (owner, round 11: "highlights are annoying, washed out and blurry"; "the monobrow looks weird")
- Crisp and flat, the Knight's way: `painter.coolK = 0` (no cool rim at all), `keyK = 0.22` (a faint
  warm key edge), `l2k = 0` (no rim from her own lanterns: it moved with the antennae and shimmered).
  No halo behind the body or head, no glow on the hem band, eye-spots are flat rings (they only
  glow for a moment when a glint's light reaches them), lantern tips a 7 px bloom, antennae solid dark.
  Do not add rims, halos or additive haze back. Checked with 4x nearest-neighbour crops at DPR 1 and 2
  (`shots/vesper/crisp/`): feather is `1 / (layer scale x viewScale)` = one device pixel.
- Nothing may span the brow: no band, line or shadow across the top of the face (it reads as one
  heavy eyebrow / a frown). The face meets the crown through four fine uneven tufts (`HAIRLINE`).

## Somersault (round 11: rebuilt on angular momentum; `SOMERSAULT` in rig.ts)
- What the physics says (gymnastics / diving sources): in flight angular momentum L is fixed, so the
  spin rate is L / I; a tight tuck has roughly a quarter to a third of the stretched body's moment of
  inertia, so pulling in triples or quadruples the spin and kicking out slows it again; the turn is
  about the centre of mass, which keeps to the ballistic arc; rotation is set at take-off (arm throw,
  chest drive); the kick-out is timed so she is long and slow at the exit.
- Ours: `tuckAt(n, u)` is the fold timeline; `inertiaAt` = 1 (ball) .. 3.85 (open; the rig's own
  joints measure 3.85, `rig.jointI`) plus 5 for the wings flaring at the kick-out (an air brake);
  momentum ramps in over the first tenth and out over the last; the angle is the normalised integral
  of L / I (`SPIN_TABLE`, built once for 1 and 2 turns), so it ends exactly upright. `rig.spinOmega`,
  `rig.spinI` are exposed; the unit test checks omega x I is constant and peaks at the tightest.
- The figure is rotated about its centre of mass (`MASS` weights) and that centre is moved onto the
  box centre as she tucks. She must NOT visibly shrink (owner): lengths 3%, wings 4%, head never
  scaled; roundness comes from folding. Ball: ~43 px across (body), wing shell ~41 px.
  A 12% shrink and a 38 px ball were tried and rejected.
- One turn 0.48 s (peak 20 rad/s), two turns 0.56 s (peak 31 rad/s), two is the DEFAULT. A tapped
  double jump at the apex has only 30 frames (0.5 s) of air on flat ground (the tap cuts the jump),
  so two turns land 4 frames into the kick-out and the interrupt spring finishes it. `Rig.turns`; `?turns=1|2`, key T
  (toast bottom-left, remembered in localStorage `vesper.turns`), `window.__vesper.turns`.
- Capture gotcha: x 600-900 is under F1 and 1900 running right reaches the mid rise: both cut the
  airtime. For a full double jump use flat open ground and check the log for `headBump`.

## Thorn slash (sim: memory/combat.md; strokes in `STROKES` in rig.ts, trail look in `TRAIL` in fx.ts)
- **Three strokes per direction, picked by the event's `step`** (`strokeFor`): fwd 1 = rising draw cut
  out of the sheath, 2 = flat falling backhand, 3 = gather behind + cleave over the top into a deep
  lunge with the wings thrown wide. Up: 1 back-over-to-front, 2 front-to-high, 3 gathered cleave.
  Down: one dive cut (the pogo's rhythm never changes). A `Stroke` = an ellipse about the chest
  (`reach` = the sim's hit reach for that step, tested against `slashBox`; `tilt`, `sq`), blade
  angles `a0 -> a1 (+over, -relax)`, frames `wind / cut / hold / home`, and two body keys (`w` end
  of gather, `f` end of cut; channels `K_*`). The same ellipse places the hand, turns the blade and
  lays the trail.
- **Timing is tied to the sim**: the press frame is drawn at stroke frame 1 and `wind` = the sim's
  startup, so the press frame shows the gathered pose and the first possible hit lands one frame into
  the cut. The frame a `slashHit` arrives still advances (the sim's hitstop is already > 0 on it):
  otherwise the hold freezes the gather and the pod bursts before the blade moves. `ease` 3 puts
  ~2/3 of the arc into that first frame. Timeline is render time, frozen while `hitstop > 0`.
- **Chaining**: `hold` is SHORT (12 / 13 / 22 frames; home 9 / 9 / 12) so a lone tap is sheathed by
  ~frame 20 (was 29). The sim allows the next cut from 17 / 19 / 27: by then the blade is part-way
  down in front and the body key (which lets go over `home`, `rig.slashBody`) is still partly in the
  follow-through; a new `slash` blends blade, hand and body from wherever they are. `slashEnd`
  reasons `dash` and `hurt` drop it at once.
- **The near arm holds the thorn** (`rig.swordSide`, chosen at each `slash` from the facing, or the
  wall side on a wall slide); twist, off-hand and lead foot mirror with it. Facing left reads like
  facing right. The sheath is drawn at the hip centre, so it needs no mirroring.
- **Silhouettes** (check with `window.__vesper.hidden = true` + a frame difference; scratch
  `sil.sh`): cut 1 ends HIGH (tall, chest open, head back), cut 2 ends LOW and LONG (deep lunge,
  spine forward, off-arm up behind), the finisher gathers small, HOPS (`K_HOP` 13 px, render only,
  down again 3 frames after the cut; the ground shadow shrinks under it) and lands wide. Half of
  the stroke's lean / curl / head bypasses the spine springs (`direct`), or the pose arrives late.
- Running: the stride continues (no foot sliding); each cut kicks the crouch spring (a dip).
  Air up cut: `UPCUT` legs together and long, wings forced closed (`slashWing` -1.1): one vertical line.
- Ends matter: a stroke must not end with the blade parked behind her head (it is held ~15 frames).
- Body: the stroke's key is ADDED to the blended pose (run legs keep striding; feet channels only
  when standing; `K_ROT` rolls her in the air; `K_LEGS` trails the legs). Up / down also lerp to the
  whole poses `UPCUT` / `DOWNCUT`. The lunge leaves the back foot behind for a moment (`lungeBack`).
  Wings read `rig.slashWing` (-1 folded .. 1.5 thrown wide), `slashTwist` (counterweight: far / near
  wing differ) and `hangK` (lift during the air hang); antennae get the same flare.
- **The trail** (`BladeTrail` in fx.ts): sampled from `rig.strokeAt(q)` several times per frame, so
  it has the stroke's true shape; drawn as a SOLID pale crescent whose outer edge is the blade
  point's path at `reach` (cool at the tail to warm at the blade, a thin dusk rim under it, a faint
  additive haze inside, a hair-thin additive cut line along the whole arc for 3 frames). It dies by
  thinning from the tail, not by fading. The finisher's is wider, lasts longer and has a slim echo
  crescent at 0.76 of the reach. Owner brightness: `TRAIL.tone` 0.76 (was 0.84), widths 0.085 /
  0.115 of the reach (were 0.11 / 0.15), and the tone is scaled per zone like her pale fur
  (`0.25 + 0.75 x view.pale`). Judge with `shots/vesper/slash13/trail-zones-game-size.png`. It follows her (`TRAIL.follow` 0.9: left in the world, a fall or a
  glide flies through it) until the blow lands, then it is pinned where it struck.
- **Tried and rejected**: a wide translucent swept band (soft veil + additive body + bright edge
  line) read as a glass dome / soap bubble, and anything with partial alpha goes into post's hero
  matte, which takes the scene's exposure off those pixels: a faint veil shows as DARK glass on a
  lit backdrop. Solid + thin + short-lived reads as a blade and matches her flat shading. A taper
  in thickness on a wide band draws a straight chord, not a point.
- Hits: `Fx.sparks` = 6-8 short streaks along the blade point's travel (`STREAK` particles, 4-6
  frames) + `drawImpact` (small star, long axis along the cut, 5 frames), both scaled by `power`.
  Finisher only: 9 dust sparks off the wing hems at the start of the cut.
- Camera kick: `src/render/camera/kick.ts`, numbers in `cameraTuning.kick`, on the `impact` event.
- Wall slide: the rig faces the wall, the slash goes away. `View.bladeFront` draws the sword arm and
  blade over the wing (arm A is the far arm when she faces left and was hidden); the head yaw target
  becomes the slash side; the spine leans out. `View.bladeOver` draws the blade (and arm) over the
  head on up slashes.
- A down-slash hit runs `pogo` (legs long, then tuck).
- Capture: `?nopickups` also removes the pods; a great glint mid-capture opens the wings (flourish)
  and ruins an air sheet: stand clear of glints or use `?nopickups` for misses.
- Not done: the finisher is a hop, not a turn (a pirouette needs the 2.5D rig's turn factor driven
  through a full revolution with the wings swapping depth: untried); run-leg accent is only a dip.

## Health: hurt, fade, re-form (sim: memory/enemies.md; render numbers in `HURT` in rig.ts)
- `hurt` event: `rig.hurtK` (recoil pose flung along `dir`, feet leading, eyes squeezed, wings thrown
  open, antennae whipped; held 0.2 s, out over 0.28 s), 7 dust motes, slash dropped.
- While `player.invuln > 0` after the stagger: a soft alpha pulse (`Painter.alphaK`, depth 0.4 at
  7 Hz), never a white flash. `Painter.alphaK / glowK` scale everything drawn between set and reset.
- Low health: lanterns, eyes and her point light scale `0.5 + 0.5 x (hp - 1) / (hpMax - 1)`, with a
  slow unease on the last light.
- `fade`: `rig.fadeK` dissolves her (alpha and glows) over 0.45 s from 0.12 s after the blow while
  `Fx.scatter` sheds ~150 motes/s from wing hems, head, chest, hips; her light goes out.
  `reform` (+ `spawn` the same step): `Fx.gather` draws 46 motes in to the new place, she fades in
  curled (TUCK blend, wings closed) and unfolds over 0.6 s, lights swell once.
- Kill: `CameraKick` multiplies the kick by `cameraTuning.kick.kill` (1.4) when an `enemyDie`
  arrives with the `impact`. Sparks on creatures are the same as on pods.
- Backlit membranes are amber (0.95, 0.6, 0.26), not pink; the wing beat is 58 deg / 1.0 s and still
  only just readable on sheets.

## Gotchas
- Wing strands have no body collision: a stiff, fast flare throws them over the head and they
  come down in FRONT of the body. Keep the flare's stiffness boost low (0.5) and BEAT_UP <= ~-112 deg.
- Chain pulls: kG + kL must stay below 1 per sub-step (capped 0.6 / 0.35 in our `chain.ts`). With the
  hooded cap of 0.9 each, a stiffened chain overshoots every sub-step and locks into a straight rod.
- Fast vertical motion: chain drag is relative to still air, so high drag blows wings straight
  up/down regardless of the rest shape. `dragK` is cut in the air and in the dash for that reason.
- Do not rotate the wing rest frame by the dash's 1.2 rad lean (`rot` is scaled by 1 - wDash).
- Clips fail at random while other agents' edits trigger HMR reloads: retry; for long idles step 10
  frames per screenshot instead of 1.
