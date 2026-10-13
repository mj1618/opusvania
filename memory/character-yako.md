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

## Gotchas
- A stiffened chain flips if kG + kL per sub-step exceeds 1 (the tail hung straight down in the dash).
  The copy clamps the sum to 0.85; hooded's chain clamps each to 0.9 only.
- During a dash the other pose weights must drop at once (`cut`), or the dash pose is half run.
- Elbow bend: ik2 `bend` +1 = elbow behind the shoulder-hand line (natural); the hilt pose uses -1.
- Test jumps where the sky is open (e.g. feet at 4650,1088); at 600,1280 a platform is overhead.
- `tools/shots.ts` / `clip.ts` append `/?manual` to the URL: pass `--url="http://localhost:5180/?char=yako&z="`.
