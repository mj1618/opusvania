# Character renderer (`src/render/character/`)

`index.ts` is a skin switcher (`?char=<id>`, number keys, `__game.character(id)`, remembered in
localStorage); every `character/<id>/index.ts` that exports `skin` is a skin. Only **Vesper** is left
(memory/character-vesper.md): the candidate skins (Ember the hooded wanderer, Yako, Wick, Nova) were
deleted on 2026-10-17 (git history has them). With one skin the on-screen skin label is not shown.
`math.ts` (springs, IK, easing, clock noise) is shared by Vesper and the creature renderers;
`tests/unit/character.test.ts` covers its spring and IK.

Rejected hero looks, so nobody rebuilds them: two long leaf ears + leaf-point cloak + bulb tail (read
as a jester); a pointed swept-back hood tip (reads as a gnome / nightcap whether stiff, arched or
drooping); a triangular chin with big almond eyes (reads as a grey alien).

## How it works (the approach Vesper's rig, chains and painter follow)
- **2.5D rig.** Poses are authored in a forward frame (f forward, u up, small sideways s for
  shoulders/hips/eyes) and projected through a turn factor `d` (+1 right .. -1 left, a spring). Mid-turn
  `d` crosses 0: forward offsets collapse, sideways ones open, so a turn is a quick turn through the
  camera. The head has its own faster `dh`; idle "looks aside" by scaling `dh`. Knee/elbow bend is
  scaled by `d` too, so limbs straighten instead of flipping.
- **Poses** are flat Float32Arrays of channels (pelvis, lean, foot balls + pitch, hands, flare...).
  Generators: idle, run, air (rise/tuck/fall blended by vy), wall, dash, skid; cross-faded by smoothed
  weights, then springs on top (lean from acceleration, landing crouch, squash, velocity stretch).
  A generator must be continuous in time; never reset its phase while its weight is > 0.
- **While wall sliding** the rig faces `wallDir` (the sim's `facing` points away).
- **Chains** run at a fixed 120 Hz with an accumulator; rendered points are extrapolated by the
  leftover time, the root is pinned to its anchor every render frame. Each node is pulled toward a
  rest shape (global + local bend), so cloth holds a silhouette and still lags and overshoots. Reset
  on `spawn` or any jump > 160 px.
- **Painter**: one Mesh, one draw call, own GLSL. Per vertex: core colour, rim colour + strength,
  `edge` (0 inside .. 1 silhouette), coverage (feather = 1 device px, so edges are anti-aliased
  inside filters too), mode (solid / additive glow / additive ghost / soft alpha). Output is
  premultiplied, so additive (alpha 0) and normal geometry share the draw call in painter's order.
  Rim = key light (KEY_LIGHT) + cool sky fill.

## Gotchas
- `noUncheckedIndexedAccess` is on: the typed-array maths uses `!` with a file-level
  `biome-ignore-all lint/style/noNonNullAssertion`.
- The mesh sets `boundsArea` itself; without it Pixi scans the whole vertex buffer for bounds.
- Unused index-buffer tail is zero-filled (degenerate triangles); vertex upload is sized to what was drawn.
- `shape()` fans from a centre: only for star-convex outlines. Cloth-like things go through `grid()`.
- Post bloom/grade lifts the character a lot: authored colours are much darker than they appear.
  Judge colour in `shots`, not from the hex values.
