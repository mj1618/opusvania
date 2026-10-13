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
  no head halo to speak of (0.03), rims subtle (dark shades rim 0.8 / cool 0.5, crown less).
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

## Thorn slash (sim: memory/combat.md; render numbers in `SLASH` in rig.ts)
- Driven by the `slash` / `slashHit` events and `player.hitstop`; strokes alternate with `seq`
  parity. Timeline is render time (0.1 s swing, 0.34 s total), frozen while `hitstop > 0`.
- The sword hand (side A) rides the arc exactly (hand drag bypassed); the blade is drawn in the hand
  while `slashW > 0.5`, the empty sheath stays at the hip. Body: hip twist, lean, off-hand counter,
  small whole-body roll in the air, wings flare by `slashK` (not while spread in a glide).
- The crescent (`drawSlash` in fx.ts) is three additive streaks about the chest: sweep and reach per
  direction in `SLASH.arc` / `SLASH.reach`, sized to the sim's hit box (fwd is squashed to 0.6 in y:
  the box is only 88 tall). 9 frames of life. Contact spark at the target's near side, small.
- A down-slash hit runs `pogo` (legs long, then tuck). Known gaps: on a wall slide the rig faces the
  wall while the slash goes away from it, so the arm reaches behind her (no dedicated pose); up and
  down poses are additive tweaks, not authored poses.

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
