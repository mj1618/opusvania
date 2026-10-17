# Character skin: Wick (`src/render/character/wick/`)

Wick, the lantern bearer: low sharp kasa hat over a hooded face with two gold eyes, plum scarf,
short indigo coat with split tails, pale wrapped shins / forearms / mitten hands, and a slender
lantern-glaive whose flame is the point light `ember`. Select with `?char=wick` or
`__game.character('wick')`. Concept: `src/concepts/designs/wick.ts`.
Owner history: v1 read as "an old lady" (drooping hat, long coat, leaning on a staff), then the
run was "too determined". So: the glaive is never leaned on (butt always off the ground), the body
runs nearly upright (lean ~0.115 rad), hat tilt is small, the free arm trails instead of pumping.

## Files
`rig.ts` poses -> joints + glaive. `secondary.ts` chains. `draw.ts` shapes back to front.
`fx.ts` embers, flame trail, twirl ring, dust. `index.ts` glue, flame, light. Imports
`../hooded/{math,chain,paint}` unchanged. Test: `tests/unit/character-wick.test.ts`.

## How it works
- **Mirrored 2.5D.** Poses are in a forward frame; every asymmetric offset is multiplied by the
  turn factor `d` (spring, +1..-1). Limbs, torso, collar are ribbons with their own width and the
  hat and hood are symmetric, so nothing collapses at d = 0. Mid-turn hips, shoulders and feet open
  sideways by `(1 - d*d)` on a *fixed screen side per limb* (continuous through 0; a sign(d) term
  would pop). The far arm always holds the glaive; near/far swap while the limbs coincide.
- **Glaive** = an under-damped angular spring in *screen space* chasing the pose's angle along the
  shortest arc (grounded carries are all above horizontal, so a turn-around sweeps it overhead;
  tested). Hook side `hs` is a spring too (the hand "rolls" the shaft so the lantern hangs on the
  lower / forward side); frozen during the twirl. Carries: idle upright ~81 deg in a loose grip,
  run 158 (low at the side, blade back), rise 146 -> apex 130 -> fall 118 (it lags the arc like a
  tail), dash 181 level, wall 118 held out behind.
- **Lantern** is a 2-segment `Chain` with zero rest stiffness: a real pendulum on the hook (drag
  0.011, gravity 1050). The flame sits 7.6 px down its body; its tongue leans against the flame's
  smoothed velocity. Flame position drives halo, embers, trail and the `ember` light.
- **Run**: cycle 216 px, stance 0.21 of it (linear in phase: planted), contact 19.5 px ahead.
  Pelvis rides `hop - 0.32(1 - hop^2)` (lingers at the top). Free arm is FK angles (upper arm,
  forearm a beat later) converted to a hand target, then IK. Both hands go through springs.
- **Air**: RISE (stretched, legs trailing) -> TUCK -> FALL blended by vy over the whole rise
  (-19..-3.5), not just near the apex; otherwise the rise is one frozen pose.
- **Double jump = forward tuck somersault** (owner: "legs come in into a ball and then extend out
  again"; spec in the brief was snap in / rigid spin / snap out). `spinAngle(t)` is the integral of
  a trapezoid of angular velocity and `spinTuck(t)` is its own curve (0->1 in 0.17, hold, 1->0 from
  0.74 with back-ease overshoot); both are functions of the move's clock (0.42 s), no spring, so it
  ends exactly upright. Every joint incl. the glaive is rotated about the box centre after the
  solve; `SOMER` is built so all body joints stay within ~21 px of that centre (hat within 33).
  While tucked: hand, grip and glaive-angle springs are overridden (nothing lags out of the ball),
  the near leg is drawn over the coat (`S_BALL > 0.5`, the thigh lies across the chest), the back
  is rounded, the skirt folds forward over the thighs, and chains are stiffened x3.4 toward a rest
  shape curled the trailing way (`rig.spin`, signed). The glaive is held at its middle through the
  ball's centre, so its ends and the lantern each sweep one circle. Interrupted (ground / dash /
  wall): angle (wrapped to the nearest upright) and tuck decay at rate 26/s. The jump's stretch
  kick is skipped for `double`. A loose spring on the angle or a looser tuck reads as a tumble.
- **Cloth**: scarf 8 segs, two coat tails, two hat ribbons (6 segs, soft: stiff short ones read as
  spikes), skirt centre line. Ambient wind sways the *rest shapes* (`lift`/`curl`), since chain
  drag swallows wind forces. `stiff` drops to 0.28 in a fall so cloth streams up; x2.2 in a dash.
  A small root flutter while moving feeds travelling waves.

## Gotchas
- The trail `streak` has a sharp bright core (shader falloff is ~quadratic): a narrow streak looks
  like a wire. Keep it wide (13 px half-width) and dim.
- Wrap / skin colours are authored mid-grey (0x5c6076..0xa39c90); post lifts them to near white.
- `fillPath` fans from the centroid: star-convex outlines only (hat, blade, hood are).
- tools/shots and tools/clip mangle `--url` queries; they get Wick anyway because it is first in
  the switcher's ORDER. Other agents' edits can reload the page mid-capture: just retry.
- Cost: about +0.05 ms a frame over the hooded skin on an M-series laptop.

## Round 3 (polish) additions
- **Run carry is over the shoulder** (GA 153, far hand forward of the chest at grip 27) so a hand is
  always seen on the shaft; the old low carry hid the hand behind the body and the shaft floated.
- **Two-segment spine** (`J_CHEST`): `CURL` channel bends it, twist `TW` bows lower and upper halves
  opposite ways and shifts the pelvis, so hips and shoulders counter-rotate in the run.
- **Landing**: `rig.groundDist` (index.ts scans the scene rects under the feet) drives a reach pose in
  the last ~8 frames of a fall (legs reach, glaive lifts upright). Hard landings use a softer, deeper
  crouch spring (omega 11.5, up to 16 px) and add spine curl.
- **Trail** is soft overlapping glow dabs along the Catmull-Rom path (fx.ts), spacing tied to radius;
  the painter's `streak` always showed a wire core.
- **Cloth colliders**: `wick/chain.ts` is a copy of the hooded chain plus soft circle colliders
  (eased, 0.35 per sub-step, not snapped: snapping jitters). Scarf/tails/ribbons avoid chest, belly,
  pelvis, head; the skirt is three chains drawn with `Painter.grid`, pushed by the knees.
- **Somersault**: glaive lies along the body axis (GA 227), hat tilts into the ball (HAT 0.62), second
  ribbon thins away. Interrupts verified on sheets (dash: 3 frames to upright; landing: ~4).
- **Idle beats**: weight settle + grip slides down the shaft, hand up to the hat brim, look up at the
  lantern (hat lifts), blink. All `pulse()` slots on incommensurate periods.
- Wrap/skin authored darker again (0x474b60..0x847e76): the new grade clipped them to white.
- tools/clip sometimes records at zoom 1 right after a file edit (HMR reload mid-setup): re-run.
