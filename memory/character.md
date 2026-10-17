# Character: Ember (`src/render/character/`)

A small cloaked wanderer, drawn in code: near-black indigo hood and mantle, the hood's back falling
in one long veil; a pale bone mask in the hood's shadow with two calm amber almond eyes; one warm
light, the ember clasp at the throat (registered as point light `ember` at its true position).
Tone is solemn (docs/art-direction.md "Tone"). Earlier looks that were rejected or dropped, so
nobody rebuilds them: two long leaf ears + leaf-point cloak + bulb tail (read as a jester); a
pointed swept-back hood tip (reads as a gnome / nightcap whether stiff, arched or drooping); a
triangular chin with big almond eyes (reads as a grey alien).

## Files
- `rig.ts` poses -> skeleton. `chain.ts` verlet chains. `secondary.ts` mantle strands + veil.
  `draw.ts` shapes, back to front. `paint.ts` the mesh, shader and primitives. `fx.ts` dust, ring, motes.
- `tests/unit/character.test.ts`: springs, IK, chain rest/stretch, foot planting at 60 and 144 Hz,
  teleport without a `spawn` event.

## How it works
- **2.5D rig.** Poses are authored in a forward frame (f forward, u up, small sideways s for
  shoulders/hips/eyes) and projected through a turn factor `d` (+1 right .. -1 left, a spring). Mid-turn
  `d` crosses 0: forward offsets collapse, sideways ones open, so a turn is a quick turn through the
  camera. The head has its own faster `dh`; idle "looks aside" by scaling `dh`. Knee/elbow bend is
  scaled by `d` too, so limbs straighten instead of flipping.
- **Poses** are flat Float32Arrays of channels (pelvis, lean, foot balls + pitch, hands, flare...).
  Generators: idle, run, air (rise/tuck/fall blended by vy), wall, dash, skid; cross-faded by smoothed
  weights, then springs on top (lean from acceleration, landing crouch, squash, velocity stretch).
  A generator must be continuous in time; never reset its phase while its weight is > 0.
- **Run cycle** is 192 px long (one footfall per 96 px = the sim's `step` event). Phase advances by
  distance, the stance is linear in phase, feet are IK targets relative to the ground point under
  the body: planted feet do not slide (tested). Legs may stretch up to 24% to hold a plant.
- **While wall sliding** the rig faces `wallDir` (the sim's `facing` points away).
- **Chains** run at a fixed 120 Hz with an accumulator; rendered points are extrapolated by the
  leftover time, the root is pinned to its anchor every render frame. Each node is pulled toward a
  rest shape (global + local bend), so cloth holds a silhouette and still lags and overshoots. Reset
  on `spawn` or any jump > 160 px.
- **The mantle is one sheet**: five strands (back edge .. front edge) -> 13x13 grid -> `Painter.grid`.
  Flare (pose channel) swings back strands back/up and front strands forward: the "wing" on falls
  and the double jump. A dimmer copy is drawn behind the body as the far half.
- **Painter**: one Mesh, one draw call, own GLSL. Per vertex: core colour, rim colour + strength,
  `edge` (0 inside .. 1 silhouette), coverage (feather = 1 device px, so edges are anti-aliased
  inside filters too), mode (solid / additive glow / additive ghost / soft alpha). Output is
  premultiplied, so additive (alpha 0) and normal geometry share the draw call in painter's order.
  Rim = key light (KEY_LIGHT) + cool sky fill + the ember as a second light.

## Gotchas
- `noUncheckedIndexedAccess` is on: the typed-array maths uses `!` with a file-level
  `biome-ignore-all lint/style/noNonNullAssertion`.
- The mesh sets `boundsArea` itself; without it Pixi scans the whole vertex buffer for bounds.
- Unused index-buffer tail is zero-filled (degenerate triangles); vertex upload is sized to what was drawn.
- `shape()` fans from a centre: only for star-convex outlines. Cloth-like things go through `grid()`.
- Post bloom/grade lifts the character a lot: authored colours are much darker than they appear.
  Judge colour in `shots`, not from the hex values.
- Cost: rig + chains ~8 us/frame in Node; a couple of thousand vertices rebuilt per frame.
