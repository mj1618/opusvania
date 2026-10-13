# Background layers (sky, far0..2, mid)

Everything behind the playfield. Files: `scene/layers/{sky,far,mid}.ts` + `scene/lib/bg-*.ts`.

## Pipeline
1. **Compose** (`lib/bg-forest.ts` `buildForest(plan)` using `lib/bg-shapes.ts`): Graphics in layer
   coordinates, in dark saturated *local* colours. Draw order: back canopy bank -> `behind` landmark ->
   trunks (roots, branches, bark bands/grooves) -> tip foliage -> front canopy bank -> moss -> light
   holes (a Graphics with `blendMode = 'erase'`, skipped over trunks) -> `front` landmark -> ground and
   undergrowth -> `floor`.
2. **Bake** (`lib/bg-bake.ts` `bakeLayer`): rendered once into MSAA render-texture tiles (<= 2048 px
   wide) at a fixed scale per layer (far 0.62 / 0.9 / 1.15, mid 1.5 texture px per layer px: lower =
   softer = farther; not tied to the window size), then the **atmosphere shader** turns local colour
   into distance: form shading and a warm rim from the silhouette's alpha sampled toward the key light,
   mottle, gain/saturation, height fog, light-well tint. All depth separation is in the `Atmosphere`
   objects (`ATM` in far.ts / mid.ts): fog colour + `fogTop`/`fogGround` are the main knobs.
3. **Show** (`LayerView`): one mesh per tile whose shader samples the bake, rustles the canopy (noise UV
   offset above `y0..y1`) and composites that layer's drifting mist (`FogSpec`) in the same pass.
4. **Live extras**: `SwaySet` (vines, moss tufts, canopy fronds drawn into one atlas per layer, rotated
   by `wind()`), the waterfall shimmer and bird flock (far.ts), glow sprites and fireflies (mid.ts,
   additive, nothing registered as a light). Sky is one full-screen shader (`SKY` config).

## Composition (layer coords; a layer shows x = 2880 + (camX - 2880) * parallax +- 960)
- The **light well**: sky bloom tracks `KEY_LIGHT.entryX` at parallax 0.1; each layer opens its canopy
  and thins trunks at `wellX = 2880 + 520 * parallax` (2942 / 3010 / 3098 / 3234).
- far0: cliff + waterfall at x~1962. far1: stone arch in the well (2770..3250). far2: 540 px giant at
  1730, fallen log 3270 -> 4330. mid: seven trunks, none between 2700 and 3600 (the playfield's trunk
  pair stands against the well).
- Trunk lists are hand-placed in the plans; keep total trunk width under ~55% of a layer or the
  luminous distance disappears.

## Gotchas
- Cost is fill rate: one blended full-screen pass per layer (~0.3-0.5 ms each at 3840x2160). A separate
  fog quad per layer doubled it; keep fog inside `LayerView`.
- `foliageMass` shades a mass as sub-clumps (dark core, lit upper right). Random per-leaf brightness
  looks like confetti; big flat-coloured leaves look like cut paper. Leaf size ~11-23 layer px.
- Roots: a buttress must start just inside the trunk edge with zero width, or its blunt start pokes out
  as a fin. Bridging roots only when long and low.
- Hanging moss as parallel strands reads as a comb/barcode: it is drawn as tapering tufts with a leaf
  clump hiding the top.
- The rim light is gated on having body behind the edge, or thin vines glow.
- Sway sprites are not run through the atmosphere shader: tone their colours with `atmTone()`.
- Rustle is zeroed near a tile's side edges so tiles agree; tiles must not be split vertically
  (layer height x scale must stay <= 4096).
- Custom Mesh shaders need `#version 300 es` as the first line of the fragment (Pixi then treats both
  stages as ES 3.00).
- Dev only: `__bg.layers.get('playfield').visible = false; __game.render()` isolates layers.
- Pixi's Mesh sets its own `uColor` (vec4) on every mesh shader: never name a custom uniform `uColor` (GL warns every frame: "glUniform4f: Uniform size does not match").
