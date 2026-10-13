# Background layers (sky, far0..2, mid)

Everything behind the playfield. Files: `scene/layers/{sky,far,mid}.ts` + `scene/lib/bg-*.ts`.

## Pipeline
1. **Compose** (`lib/bg-forest.ts` `buildForest(plan)` using `lib/bg-shapes.ts`): Graphics in layer
   coordinates, in dark saturated *local* colours, plus a **LightMap** (soft blobs: `reset` under a
   shape, then its shade and its light, in painter's order). Order: far canopy tier (pale) -> `behind`
   landmark -> shadowed inner tier -> trunks (roots, boughs, bark; `onTrunk` hook) -> tip clumps -> near
   canopy tier -> moss -> erase-blend light holes -> `front` -> ground bushes (+ `groundRows`) -> `floor`.
   The canopy has **no solid fill**: three tiers of `clump()`s that drop out in clusters; a shared
   `opening` noise makes all tiers skip the same places, which are the sky holes (`build.openings`).
2. **Bake** (`lib/bg-bake.ts` `bakeLayer`): MSAA render-texture tiles (<= 2048 px wide) at a fixed scale
   per layer (far 0.62 / 0.9 / 1.15, mid 1.5), then the **atmosphere shader**: form shading and warm rim
   from the silhouette's alpha, the light map (shadow = cool and dark, light = brighter and pulled to
   `sunColor`), mottle, gain/saturation, height fog, light-well tint. Depth lives in the `ATM` objects.
3. **Show**. far0 + far1 + the sky go through `FarPairView`: one opaque pass on far1's tiles that looks
   up far0 (one tile) and the quarter-size sky texture (`SKY_OUTPUT`) at the matching place for the
   camera, with both mists, rustle and zone grading. far2 and mid use `LayerView` (same job for one
   layer; mid also gets the `back` texture: light seen through the canopy openings).
   **All three far layers are drawn into one render target at logical-view resolution** (`FAR_TARGET_SCALE`,
   far.ts): the real layer containers hold only the `far-composite` sprite (on far2); the content lives
   in off-tree `groups` that copy the layers' transforms each frame. The bakes hold no more detail than
   that, and it is a quarter of the pixels on a 2x display.
4. **Live extras**: `SwaySet` = ONE mesh per layer; a vertex shader bends each strip (GLSL copy of
   `wind()`: keep them in sync) and the fragment shader zone-grades it. far0 has no sway (nothing can be
   drawn over far0 alone any more; birds moved in front of far1). Waterfall shimmer per stage, flock
   (far.ts); glow caps, hollow glow + lantern fungi, fireflies, drifting leaves (mid.ts).

## Composition (layer coords; a layer shows x = 2880 + (camX - 2880) * parallax +- 960)
- **Zones** by playfield x: left glade < 1400..2500 (moonlit blue, cyan glow caps, the waterfall), the
  golden well in the middle, right stand > 3500..4500 (dusk violet, rose light opening, hanging gardens).
  Sky (`SKY.left/right`), each layer's `ZONE` and mid's glow colours all key off `zoneWeights()`.
- The **light well**: sky bloom tracks `KEY_LIGHT.entryX` at parallax 0.1; each layer opens its canopy
  at `wellX = 2880 + 520 * parallax` (2942 / 3010 / 3098 / 3234). Moon and dusk openings are extra
  negative gaussians in each plan's `drop` plus that layer's `wellL/wellR`.
- far0: pale giants. far1: bluff + three-stage waterfall at x 1960 (`WATERFALL.stages`), stone arch in
  the well (2770..3250). far2: 500 px giant at 1230, fallen log 3930 -> 4640. mid: seven trunks, none
  between 2700 and 3600; the **hollow tree** is mid's trunk at 4600 (`HOLLOW`; in far2 a mid trunk
  always stood in front of it). Its hollow is 700 px tall because the playfield's raised ground on the
  right hides everything below layer y ~1090. `clearWell` keeps lit bushes and boughs out of the well.
- Landmarks have to be placed against the *mid* trunks: check `x - (2880 + (cam - 2880) * f - 960)` for
  both layers at the cameras you care about, or a mid trunk sits on top (it did, twice).
- Keep total trunk width under ~55% of a layer or the luminous distance disappears.

## Gotchas
- Cost is fill rate: one blended full-screen pass per layer (~0.5-0.6 ms each at 3840x2160). A separate
  fog quad per layer doubled it, big soft sprites behind a layer cost as much again (bake them small and
  pass them as `back`), and the sky shader at full size was 0.8 ms (hence quarter size). Measure with
  many `__game.tick(1)` then one `gl.finish()`; per-frame `readPixels` quantises to the display cadence.
- Foliage: `clump()` = lobed dark silhouette + lighter body per lobe + light-map blobs, leaves only as
  a ragged fringe, a sparse lit-side scatter and small sun leaves on the lit rim. Random per-leaf
  brightness looks like confetti; big pale leaves look like cut paper; a solid canopy fill is a wall.
  Light a clump by how close it is to an opening, not uniformly, or the lit spots read as glowing dots.
  (`foliageMass` is the older, cheaper mass, still used for small caps and sway fronds.)
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
- Bark extras on mid trunks (`barkDetail`): keep lichen tiny and faint (big pale blobs look like
  stickers), stubs short and thin (they read as beams), knots at most two (three look like a face).
- Sun colour of lit foliage is baked per zone (`sunColorL/R` + `zoneParallax` in the ATM objects):
  silver-teal left, yellow-green centre, gold right.
- Sway strips: keep the atlas slot narrow (`w` of a SwayItem); transparent texels are fill cost, and a
  per-strip CPU update + buffer upload cost 0.3 ms before it moved into the vertex shader.
- Hiding `far0`/`far1` via `__bg.layers` still works (the groups copy `visible`); hiding `far2` hides
  the whole far composite.
- Cost now: far layers ~0.6 ms together (logical-res target), mid ~0.6 ms (the one full-res pass).
- Side zones: the sun colour goes on edges only (`sideBody` / `sideLit` / `sideRim` in the ATM objects,
  gated by the alpha-open-toward-light term). Tinting whole clump bodies with a pale sun colour made the
  right canopy look frosted.
- Bridging roots (`drawRoots`, `gnarl` / `cut`): kinked, burled, always forked, with rootlets and moss;
  ~45% are snapped stubs. Trunk stubs in mid point steeply up (flat ones read as steps).

## Round 5: low key (see reference-study.md)
- The backdrop alone now measures mean luma 24-43, top quarter 12-42, border 27-34 (it was 80-110).
  Keep it there: sky/fog/haze colours are dark (peak ~180 only in the small sky bloom, the wells and
  the sky holes); `gain` 0.58 and warm dark `shadeTint` give mid its near-black cores.
- Hue: the BASE colours (centre zone) are amber-brown: `ATM.tint` warms the local colours before fog,
  fog/mist/sky are amber. The `ZONE` tints are strong per-channel multipliers that turn that amber
  azure (left) or violet (right); mistL/R and SKY.left/right are set directly.
- `Atmosphere.lid` / `lidY0` / `lidY1`: a dark lid over the top of each layer. `Atmosphere.blur`: gaussian
  sigma in layer px baked into the layer (far0 9, far1 8, far2 4.5, mid 2.2); the bake pads tiles by
  3 sigma so seams agree. Sway atlases are rendered at under half scale to stay as soft as their layer.
- Far rims are off (`rimStrength` 0, `sideRim` 0): hard rim lines on blurred far trunks read as neon.
- Giants: mid 1090 (720 px, left), far2 2440 (640 px, centre, left of the well), mid 4600 (hollow, right).
- Resize: a resized RenderTexture kept drawing into its old area; the far target is recreated on a size
  change (far.ts update) instead of `.resize()`.
- `leafPts(..., kind)`: 4 leaf shapes; `clump()` picks one per lobe, three sizes, bunched on the lit
  side of the rim only.

## Round 6
- Mid takes its zone hue at BAKE time (`ATM.zoneTintL/R`, `zoneSpare`): the light map is known there,
  so lit foliage is spared and stays emerald/olive while shadows go azure/violet. Its LayerView tints
  are forced to 1; `ZONE.tintL/R` in mid.ts now only feed the sway strips. Far layers still tint live.
- `edgeOnly: 1` (mid, far2): sun colour and brightening only on edges open toward the light, in every
  zone. Clumps must be dark shapes against the light, never paler than what is behind them.
- `atmTone()` (colours of sway items: fronds, moss caps, vines) now applies the layer's tint, lid and a
  shadow value. Without it the fronds were the "pale paper cut-outs" over the dark canopy.
- `MID.moonHole`: the canopy route's focal opening (a canopy `drop` plus soft sprites in `back`).
- Violet needs red: the right-zone tints are about [1.15, 0.45, 2.4]; with red under ~0.9 it measures blue.
