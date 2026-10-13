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
- Pale colours must be authored dark (face 0x8c8490, fur 0x6f6978): bloom + the light mask near
  her own `ember` light push anything paler to white. Judge in `shots`, never by hex.

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
