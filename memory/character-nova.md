# Character skin: Nova, the star-runner (`src/render/character/nova/`, `?char=nova`)

An acrobat made of night sky: indigo-black body with faint twinkling star-specks, four bands of pale
gold light (wrists, ankles), a moon head (dark disc, lit crescent on the side it faces, two glowing
eyes), a braid that thins into a long comet tail ending in a star (the `ember` light), a short
violet sash and neck wrap. No concept file: designed directly in game.

## How it works
- Reuses `../hooded/{math,chain,paint}` unchanged. Own `rig.ts`, `secondary.ts`, `draw.ts`, `fx.ts`.
- **Somersault (double jump)**: three beats on one clock (`SPIN_T` 0.42 s): snap in (`SPIN_IN` 0.2),
  rigid spin, snap out (from `SPIN_OUT` 0.72). The angle is a curve (`spinTurn`: ease in, linear,
  ease out to exactly one turn), the tuck its own curve (`spinTuck`), no spring. Every solved joint
  is rotated about the box centre; `TUCK` is authored so the ball's centre sits on that pivot
  (pelvis-forward -14). Hand and foot springs are bypassed by the tuck amount (nothing lags out of
  the ball), squash/stretch is off in it, and an `OPEN` pose is blended in over the snap-out.
  Direction = direction of travel. Cut short (ground / dash / wall): shortest way upright over
  0.13 s. In the ball the chains get `stiff` x3.6 and extra `curl`, so the tail wraps round it in
  one arc; trails are carried along with the body (`fx.update` carry) so they stay rings.
- **Standing feet** (`idleFeet`): world anchors that take a quick step when the body leaves them
  more than 8 px behind (stop slide, turn on the spot), so run <-> idle does not skate.
- **Tilt channel**: pelvis tilt in px (shoulders counter it): stance hip high in the run,
  contrapposto in idle. **Hard landing**: deep fold with the near hand to the ground (`hardT`).
- **Follow-through**: hand targets always pass through per-channel springs; foot targets do while
  airborne (blended out by the ground weight so planted feet never lag). This is what stops the
  limbs moving in lockstep with the pose.
- **Run**: cycle 232 px, stance 20% per foot (so 30% float between footfalls); pelvis height is a
  ballistic arc in the float and a short dip in the stance (`bob`), chest and head use the same curve
  a little later. Feet plant by IK (tested).
- **Trails** (`fx.ts`): five ring buffers (wrists, ankles, star) sampled at 60 Hz, each sample
  storing its own brightness; drawn as Catmull-Rom smoothed additive streaks. Brightness follows the
  point's speed *relative to the body*, times a `heat` level (spin / dash). Using world speed drew
  four parallel wires behind every jump: don't.

## Gotchas
- Clips die with "Execution context was destroyed" when another agent's edit triggers a Vite
  reload mid-capture: retry, and keep clips under ~80 frames while others are editing.
- Two upright crest tufts on the crown read as little ears/horns; one low swept-back tuft is the limit.
- The tail's rest shape must leave the head going back and down. Rising up and over the head it
  read as an antenna with a bobble (jester / anglerfish).
- A brow-arc "crescent" above the eyes read as eyebrows or a visor; the lit-limb crescent on the
  facing side of the head reads as a moon.
- Limbs drawn as a full Catmull-Rom bow look like bananas; `ROUND = 0.4` in `limb()` keeps a knee.
