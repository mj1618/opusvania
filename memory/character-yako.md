# Character skin: Yako, the dark fox (`src/render/character/yako/`)

A lean bipedal charcoal fox (crossed-collar jacket, crimson sash with two tails, big tail with a pale
ember-lit tip), drawn as flat cel shapes. Ported from `src/concepts/designs/yako.ts`; select with
`?char=yako`. The point light `ember` is the tail tip.

## How it works
- **Forward frame.** Rig and shapes live in the concept's own space: design units, x forward, y DOWN,
  origin at the feet. One affine base matrix (`rig.ma..mty`) maps it to the world: scale `K` (0.95),
  the turn, squash/stretch. Shapes go through `Cel.base()` + `push()`; limbs, tail and cloth are
  `Rib`s built from WORLD points, so their hard shadow side and rim follow the light when he faces left.
- **Turn-around** = x scale through a spring (`turnScale`, never thinner than 0.24: a squash-through).
  The head has its own faster spring and flips first (`headFlip`); in a wall slide the body faces the
  wall and the head looks away (the sim's `facing`). Ears get a kick, the tail's rest shape mirrors.
- **Cel painter (`cel.ts`)**: one mesh, flat colours, 1 device px feather. Paths are ear-clipped
  (simple polygons only, keep them under ~100 points); ribbons are quad strips. Rim = a copy nudged
  toward the light, drawn first. `tone` (0.74) darkens everything because post lifts darks.
- **Run**: cycle 240 px (not the sim's 192: slower, floatier), stance 17%, feet are ball targets with
  heel roll; planted ankles do not slide (tested at 60 and 144 Hz).
- **Looseness**: hands ride springs relative to the shoulder; `dragX/dragY` (low-passed velocity minus
  velocity) pushes hands, air feet, head, ears, tail. Positive dragY = parts pushed down (both on
  take-off and on landing).
- **Chains** (`chain.ts`, a copy of hooded's with `lenScale` and `push`): tail, two sash tails, charm.
  The pose only sets lift / curl / stiffness. Dash: stiff + `lenScale` > 1 = the smear.

- **Double jump = somersault** (spec: three beats, snap in / rigid spin / snap out). `spinPhi` is an
  eased curve of time (`spinCurve`: ease in, linear, ease out; no spring), folded into the base matrix
  as a rotation about the body's middle. The tuck weight `spinW` is its own curve; while it is up, hand
  springs and all drags are bypassed so no limb lags out of the ball. Pose `SPIN_TUCK` then `EXTEND`
  (a small overshoot past the fall pose). Chains get the flip as extra `rot` and are stiffened toward a
  rest shape that wraps the ball. Authored body shadows fade while upside down (`shadeA`). Cut short by
  ground / dash / wall: rolls to the nearest upright in a few frames.
- **Run bob** (`bob()`): a dip while the knee gives in the stance, a ballistic arc in the float.
- Wrists (`wristN/F`) are springs driven by the hand's own motion; the hand shape rotates by them.

## Gotchas
- A stiffened chain flips if kG + kL per sub-step exceeds 1 (the tail hung straight down in the dash).
  The copy clamps the sum to 0.85; hooded's chain clamps each to 0.9 only.
- During a dash the other pose weights must drop at once (`cut`), or the dash pose is half run.
- Elbow bend: ik2 `bend` +1 = elbow behind the shoulder-hand line (natural); the hilt pose uses -1.
- Test jumps where the sky is open (e.g. feet at 4650,1088); at 600,1280 a platform is overhead.
- `tools/shots.ts` / `clip.ts` append `/?manual` to the URL: pass `--url="http://localhost:5180/?char=yako&z="`.
