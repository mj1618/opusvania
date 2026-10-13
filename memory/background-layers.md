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
5. **Life and the mist stage** live in the view passes (`LifeSpec`, `StageSpec` in bg-bake): see Round 9.

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
- Cost at 3840x2160 (round 9, medians of 6): far layers ~0.42 ms together, mid ~0.7-0.8 ms.
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

## Round 7
- The light well sits RIGHT of the high ledge: wellX far 3110 / 3220 / 3330, mid 3450, sky bloom
  `SKY.glowOffsetX` 300; mid has a heavy canopy bough behind the ledge (`drop` + `cover` bumps at layer
  x 2940). A hero on the ledge (playfield ~3000, 448) must stand against dark with the light beside her.
- `sideBody` 0.22 (mid) / 0.3 (far2), `sideLit` 0.75-0.8: a little body value in clump interiors; much
  lower and they are pure silhouette.
- The big azure window at stops 1-2 is air.ts `shafts-back` (airBack layer), not a background light.
- The boot warning "glDrawElements: Vertex buffer is not big enough" is not from these layers (it
  persists with every background mesh, update and render pass disabled).

## Round 8 (glide audit)
- The follow camera's view top goes to y -540 now (`viewTop`: ceiling -420 less 120 headroom; view centre
  y 0) for the summit glide. far.ts / mid.ts bake up to `HEADROOM` 560 above the scene top (round 10); if
  the ceiling or the headroom moves, `HEADROOM` must grow first.
- The crisp lit "clover" clumps the island vines hang from are the playfield's, not these layers.
- Sway items (`atmTone`) sit at full light-map shadow (0.12 + 0.88 * shadeTint); mid lid 0.32.
- Right zone measures violet with these layers alone; stop 6's blue comes from what is in front.

## Round 9 (second reference study)
- **Mist stage** (`MID.stage` = peak opacity per zone, THE knob; `STAGE` = where it lies): a paler fog
  sheet hugging the playfield's walk line, drawn inside mid's view pass (in front of mid, behind the
  playfield). The pass maps each pixel to the playfield point behind it (`uZone.x/.w`, needs camera y:
  `LayerView.update(clock, camX, camY, anchorY)`); the ground line is `baseY` + eased `steps` and the
  two high ledges, mirroring grove.json by hand: move a ground rect and `STAGE` must follow. Its
  billows reuse the mist's two noise taps (two extra taps cost ~0.15 ms). Live A/B:
  `__bg.stage(l, c, r); __game.render()` (`__bg.stage(0)` = off).
- Measured on 14 ground-walk frames: luma behind the walk line (median of a 1040x180 band above the
  feet) 28 -> 38 on average, 44-66 on the flat runs, only 22-31 on the bank and the right rise where
  big playfield props stand in front of it; frame mean 24.5 -> 27.7. Mid's own grey veil (`FOG.alpha`)
  dropped to 0.28 to pay for it.
- **Life** (`LifeSpec`: `MID.life`, `LIFE` in far.ts): `breath` = px of slow travelling sway of the
  whole canopy zone (same mask as the rustle), `shimmer` = flicker of lit foliage only (gated on the
  texel's green), `openings` = swell of the `back` light and the wells (~+-10%, 5 s). The sky bloom
  breathes at the same pace. Pixels changing > 6 luma in 1 s with the hero idle: 7% -> 13-15%.
- Waterfall: the "pale stair-stepped rectangles" were the three `LiveFall` quads (narrow quad, spray
  clipped flat at the bottom, alpha not zero at the sides). Now a gaussian column in px space with a
  round spray plume and an explicit fade before every quad border (`FALL_PAD`); the bluff widens by
  smoothsteps and its shelves are lumps. Any live quad must reach alpha 0 before its border.
- The "hard disc in the warm opening" was NOT these layers: it was the post stage's hero pocket cutting
  against the bright sky (it moved 1:1 with the world and showed with every background layer hidden but
  the sky sprite). To bisect the far composite, temporarily expose `FarLayers` on `globalThis` and
  toggle `groups[i].children[j].visible`.
- Straight dark beams across the well were far1's leaning trunk (x 3500, removed) and bare limbs:
  `clearWell` now turns branches as well as boughs away from the well, and far1 uses it.
- A dark soft-edged slab at the right scene edge (world x > ~5600) shows even with only these layers
  visible: it is not ours (it moves at parallax 1).
- Darks: far2 `gain` 0.6, shade tints lowered (mid [0.24, 0.2, 0.16], far2 [0.26, 0.23, 0.18]). The
  walk frames now measure 48% near-black / 27% dark grey (the dark references: 48 / 27).

## Round 10 (after the first playtest)
- **These layers register no point lights** (`ctx.lights`): every glow here is a plain additive sprite.
  The light the playtest saw at (1552, 1268) r 144 is `shaft1` from `layers/air.ts`.
- Glow-cap clusters (`MID.glowClusters`): a cluster at layer x L sits behind playfield x
  L + 0.32 * (camX - 2880), so its distance to a lantern changes as the camera moves. Layer x
  1110..2550 (stone lantern, 1448) and 4110..5250 (heart 5212, far lantern 5524) stay empty; knots
  spread at most 140 px; caps are 8-17 px embers sunk 45% toward shadow, haze alpha 0.12. The lantern
  fungi on the hollow tree stop at 30% of the trunk (higher ones sat behind the far ledge's lantern).
- **The hollow tree answers the goal** (`HOLLOW.levels / awake / ended`, mid.ts `update`): its baked
  inside is a dark ember, all of its light is live sprites (`GlowSpot.hollow`). Level x `glowAlpha`:
  0.15 / 0.3 / 0.45 with 0 / 1 / 2 lanterns (tint `ember` -> `glow`), 1.25 over 2 s once
  `goal.heart.awake` (plus the `spill` glows up the trunk and on the canopy), 1.6 through the ending
  hold, when `LayerView.setWarm` also warms the light behind every opening and the sky's key bloom
  shows more in the side zones (`SKY.wake`). Preview without playing:
  `__bg.goal = {lit, heart: {awake, frames}, gathered, ending: {frames}}` then tick ~300 (it eases).
- **Headroom**: `coverRect()` (bg-bake) = the layer tree's coverage, padded, extended up to a view
  `HEADROOM` (560 px) above the scene top; far.ts and mid.ts bake that. `buildForest` adds canopy rows
  until the rect top is reached (cap 9) and `crownOpen` (mid) opens the upper rows a little more;
  openings above layer y 80..420 keep 28% of their light (`MID.skyHole.dim`) or they are pale tabs on
  the frame edge. Mid is now 1935 px tall x 1.5 = 2903 texels (limit 4096). Check with
  `cam({x, y: -20})`.

## Round 11 (after the layout pass: bluff, hollow, sky line)
- `STAGE` (mist stage) follows the new ground: the bluff (2432-2624, top 960) is a `ledges` entry (k 0.7),
  not a ground step (a ground step put a 400 px column of mist in the air beside it); the terrace step sits
  at 2528 behind the bluff; the hollow is two steps (3744 +96, 3968 -96). Steps take an optional third
  number, their own ease (`[x, dy, ease]`): narrow forms need ~60, the default 150 smears them away.
- `ForestPlan.quiet(x, y)` (0..1 at a clump's centre): near clumps there carry no amber leaves or
  blossoms and take 45% less key light. Mid uses it (`MID.quiet`) behind the two places dormant glints
  (dim gold motes, luma 110-130) hang in the air: the summit glide's sky line (layer x 3250-4800, y < 470)
  and the wall-jump shaft. At 85% less light the whole crown went to a flat black wall: keep some.
- `MID.shaftPendant`: a pendant of canopy (a `drop` + `cover` gaussian at layer x 3275) behind the upper
  two thirds of the wall-jump shaft. Median luma behind shaft glints 4-6: 88 / 44 / 33 -> 50 / 44-60 / 34-40;
  It is placed for cameras inside the shaft (layer x = playfield x - 0.32 * (camX - 2880)); from the
  terrace the shaft shows layer x ~3400 instead.
- `MID.shaftTongue` (x 3268, half 62, +150 px, a flat-topped `exp(-u^4)`): a narrow tongue on the pendant's
  tip, behind shaft-3 (3455, 850) for cameras in the shaft (layer x 3240-3300, y 856-1000 as she climbs).
  Median luma behind it 107 -> 16 from inside the shaft, 19 -> 23 from the floor. From the terrace (stop 4)
  it stands behind trunk A and the gold light between the trunks is as it was; the glint there still hangs on
  ~135 (was 155): only something at parallax 1 could fix that view, and a liana with a leaf knot across the
  shaft (tried in the playfield) read as a rope bridge / something to land on.
- Sky glints from the summit (sky-1..4, great-sky): backdrop median 5-15 at the summit, bough and glide
  cameras, and identical with the foreground hidden: nothing of the scene layers is in front of or bright
  behind them. sky-1's foliage was the bough's old sapling (playfield), gone now. What dims sky-3 / sky-4
  there is the post vignette at the frame's top right, not these layers.
- Layer coordinates of a playfield point: x = px - (1 - f) * (camX - 2880), y = py + (1 - f) * (1060 - camY).
