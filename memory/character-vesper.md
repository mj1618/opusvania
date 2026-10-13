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
- Pickups: `pickup` events set `rig.joy` (head/chest lift, wing flick; a 'great' opens the wings) and a
  flash through lanterns/eyes; scaled down by `combo`.

## Round 7
- `paint.ts` is now our own copy of the hooded painter: `coolWrap` (0.5) puts the cool rim on every
  edge the key light leaves dark, not only upper-left ones.
- Glide (prepared before the sim has it): `rig.wGlide`, pose `GLIDEP`, wing table `SOAR`, a catch
  spring (`catchK`) kicked by entry fall speed that billows the wings and swings the body. Driven by
  `motion === 'glide'`, or by any fall when `window.__vesperGlide = true` (test switch; remove once
  the sim lands). Landing out of a glide sets `openHold` for a wing flare.
- Ground turn = pivot: foot lift is cut by `1 - |d|` so both feet stay down through the swivel.
- Footfall give: each half-cycle of the run kicks the crouch spring by 9.
- Sheets: scratch `seq.mts`-style capture (one browser, step N + screenshot) survives HMR better than clips.

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
