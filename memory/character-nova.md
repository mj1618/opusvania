# Character skin: Nova, the star-runner (`src/render/character/nova/`, `?char=nova`)

An acrobat made of night sky: indigo-black body with faint twinkling star-specks, four bands of pale
gold light (wrists, ankles), a moon head (dark disc, lit crescent on the side it faces, two glowing
eyes), a braid that thins into a long comet tail ending in a star (the `ember` light), a short
violet sash and neck wrap. No concept file: designed directly in game.

## How it works
- Reuses `../hooded/{math,chain,paint}` unchanged. Own `rig.ts`, `secondary.ts`, `draw.ts`, `fx.ts`.
- **Somersault (double jump)**: the pose blends into `TUCK` while every solved joint is rotated about
  the box centre by `spinPhi`. The angle is a spring following an eased 0 -> 2pi ramp over `SPIN_T`
  (0.42 s), so it starts and ends with zero angular velocity and overshoots a little; at the end it
  is snapped back to 0 (a whole turn = identity, no pop). `TUCK` has pelvis-forward -12 so the ball
  is centred on the pivot. Direction = direction of travel (else facing). Cut short by ground / dash
  / wall: it goes to the nearest upright quickly. The chains get the flip as extra `rot`.
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
- `tools/shots.ts` and `tools/clip.ts` append `/?manual` to `--url`, which breaks a `?char=` query.
  Use `--url "http://localhost:5180/?char=nova&manual#"` (the appended part lands in the hash).
- Clips die with "Execution context was destroyed" when another agent's edit triggers a Vite
  reload mid-capture: just retry.
- The tail's rest shape must leave the head going back and down. Rising up and over the head it
  read as an antenna with a bobble (jester / anglerfish).
- A brow-arc "crescent" above the eyes read as eyebrows or a visor; the lit-limb crescent on the
  facing side of the head reads as a moon.
- Limbs drawn as a full Catmull-Rom bow look like bananas; `ROUND = 0.4` in `limb()` keeps a knee.
