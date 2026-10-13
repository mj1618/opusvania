# Playfield (terrain, plants, pool)

`src/render/scene/layers/playfield.ts` + `src/render/scene/lib/pf-*.ts`. Everything is generated from
`scene.solids` / `oneWays` by tag; no decoration data is authored in `grove.json`. Terrain painters:
`pf-terrain.ts` (ground, trunks, ledges, root mound, boughs, backdrop), `pf-islands.ts` (the floating
islands and the `limb()` wood helper), `pf-rock.ts` (every stone), `pf-forms.ts` (what keeps the ground
from being a ruled line on boxes: back ridge, banks, great forms, the three landmarks).

## Structure
- **Terrain is baked once at init.** `pf-terrain.ts` paints every body twice onto a `Paint` (`pf-paint.ts`):
  `albedo` (flat local colour) and `relief` (R height 0..1, G moss, B bark). `pf-bake.ts` blurs the relief
  at three scales and runs one lit pass per 512 px tile (normal from the height slope, warm key from
  `KEY_LIGHT`, cool shadow side, cast shadow under lips, darker interiors, noise per material). Each tile
  is cropped to what was painted in it. ~45 textures, ~20 MP at bake scale 1.5, ~30 ms.
- **Plants are a few static meshes** (`pf-flora.ts` builder + shader, `pf-plants.ts` species and placement),
  chunked every 480 px for culling. The vertex shader does wind (a GLSL copy of `wind()` in `look.ts`: keep
  them identical), bending and glow. ~190k vertices. Three meshes: back, additive halos, front fringe.
  Draw order inside the back mesh is placement order: rear row (shrubs, tall dark stands) first, then
  features, then grass.
- **Light comes from one sun map**, not from the paint: `sunAt(x, y)` in `pf-shape.ts` (a broad beam along
  `KEY_LIGHT` plus sine dapples) tints plants and moss albedo, and the bake shader has an identical copy
  (`sun`) that scales the key light: change both together. Warm flowers go where it is high, violet glow plants where it is low.
- **Three zones** (`zoneAt(x)` / `ZONES` in `pf-shape.ts`, mirrored as `uZone` in the bake shader): cool pool
  glade (x < ~1900), warm light well, deep stand (x > ~3900). They tint terrain and moss, shift plant tones,
  choose the species mix (`share(cool, warm, deep)` in `growGarden`) and the glow colour (cyan left, violet right).
- **Backdrop is mostly baked**: `paintBackdrop` puts mossy boulders (every fourth one a landmark with a sapling)
  and leaning dead stumps in the back plane behind the walk line, none flat-topped; the edge walls get a cliff
  foot with a thread of water (left) and a root buttress with a hollow (right). Free at runtime.
- **Fliers** (`pf-flutter.ts`): butterflies over warm flower drifts, moths by glow plants; one small mesh, all
  motion in the vertex shader. `Garden.butterflies` / `.moths` collect their homes during planting.
- **Elevated tops** (`MossOpts.read`, `TERRAIN.highRead`) get a continuous lit crest and a contact shadow under
  the lip so they separate from the canopy behind.
- **Depth around the walk line**, back to front in the back mesh: hazy reed stands (`HAZE`; hazy shrubs were removed, they read as pale cut-outs in fog), rear
  row shrubs (`REAR`), hero plants every screen or so (`heroGap`), features, grass; then the front fringe.
  `info.keepClear` ranges (the root mound) keep big plants off terrain that should be seen.
- **Moss is cushions with bare stretches** (`mossCap`): stones, surface roots and leaf litter fill the gaps.
  Trunks alternate `ivied` (vines, nest, ferns) and hollow (rot hollow, bracket fungi). Hanging trunks share
  `stiltRoots()` between a back-plane pass and `paintRootShoulders` (front, fading back).
- **Floating islands are one family per zone** (`pf-islands.ts`, by index left to right; palette `ISLES`), each
  explained by what holds it, with a 3x spread in depth (thin ~46-64 px, deep ~150 px):
  cool: 0 two wet boulders lodged in the crotch of a dead snag that stands on the ground; 1 a flake of slate in a
  vine sling (thin; pod-f2 hangs under its middle, so the sling loops are at the ends); 2 a lopsided mass of
  aerial roots round peat and stones. Warm: 3 a great bracket fungus (the walkway) with smaller brackets down a
  dead limb that hangs in the vines; 4 a woven nest. Deep: 5 the bent crown limb of an old snag (thin; pod-f6
  hangs under it); 6 two violet stones clutched by roots from above.
  `paintIslandBacks` runs before the ground and paints the two snags in the back plane (relief 0.25, so they
  stand behind the walk line like the saplings); `paintFloating` paints the body. Each kind sets `under(u)`
  (px below the collision bottom, used for `info.unders` and the belly shade), its `trail`, and its `ropes`.
- **What islands hang from** is `info.hangers[].ropes` (`{x, y, w, stout?, lean?, to?}`, optional `yoke`):
  pf-plants.ts grows one `hangVine` per rope up to a `leafKnot` near the scene top (ropes within 90 px share a
  knot; ropes with `to` meet at the yoke and one stout stem goes on up). Islands on a snag have no ropes.
- **Stone is `paintRock`** (`pf-rock.ts`): a lumpy superellipse outline, a real dome of height shells (`dome()`),
  shoulders (smaller swells that change plane and tone), weather streaks, lichen, hairline cracks cut below the
  surface, moss on the crown and in hollows, a dark heavy base. `baseY` sinks it in the ground, `topY` cuts it
  flush under a walkable top, `fitUnderTop()` sizes it so that cut spans the collision width, `spanX` pulls the
  shoulders back in (a boulder may bulge ~10 px past the collision ends below the walk line, no more). Used by
  the backdrop boulders, set stones, cliff-foot slabs, the standing stone, the cairn and the island rocks. In the
  back plane keep `h + rise` near 0.32.
- **Wood is `limb()`** (exported from `pf-islands.ts`): a ribbon with three height shells (a round section), a
  lit strip toward the key, a dark one opposite, optional winding grain. The one-way boughs are built from it:
  the top edge is the walk line, underneath are a swollen base, two knuckles with a forked branch and a stub.
- **Ledges are two different things**: beside a trunk, `paintLivingBough` (collar, belly, knuckled tip, side
  limbs); at the scene edge, `paintCrookShelf` (earth held by two limbs). Painted limbs and trunk vines
  report `info.twigs` / `info.ivy` so `pf-plants.ts` puts leaves on them.
- **Nothing manufactured**: no ruled edges, square ends or constant thickness. New shapes get a wobbling
  outline, a taper and something growing on them.
- **Bend field** (`pf-field.ts`): a 480x67 RGBA8 texture, cell 12x24 px. R = sideways push (one damped
  spring per cell, driven by the character's box and `land` events), G = glow excitement (character and
  `ctx.lights.list`). Plants sample it at their base.
- **Pool** (`pf-water.ts`): two quads, one shader. `back` is the body and mirrored sky; `front` is the tint
  over whatever wades in, the surface line, glints, bank foam, floor caustics, three fish glints, light
  reflections, up to four ripples (entry, wading, landing, and one on its own every `idleRipple` s) and the
  droplets of a landing splash (`uSplash`; the quad reaches `splashRoom` px above the surface for them).
- `pf-terrain.ts` returns `TerrainInfo` (tops, undersides, faces, twigs, pool) and `pf-plants.ts` plants
  from that, so a new solid gets plants for free.

- **Low key at the source** (see reference-study.md): the ground is a form, not a section. Under the lip
  there is a **lit band** ~120 px deep (`TERRAIN.lipBand` washes of `lipLight`, colour only; stones with
  their top planes to the light and roots running along under the lip are painted into it), then
  `TERRAIN.depthShade` takes everything to `abyss` by ~200 px. The main ground carries the same lit crest
  as the islands (`groundRead`). Ground tops carry a rounded moss crown (`crownLift` + `crownMound`, slow
  swells up to ~18 px behind her feet; the collision line is still where she stands). The sun map
  is discrete pools (most ground gets none); plant tone bases are near-black and only tips in a pool are bright.
  Glow plants are rare (`glowShare`), small and dim. One hollow per screen.
- **The lip is in front**: a low moss
  skin with drips and rootlets in `playfieldFront`, plus ankle-high root humps and stones every ~500 px. Plants call `contact()` for a ground shadow under anything big.
- **Breaking the line and the boxes** (`pf-forms.ts`, all baked, none collision):
  `paintBackRidge` mounds earth and moss behind the walk line (`ridgeHeight(x)`, 5-70 px, fading at pools and
  at the low side of steps); `paintBanks` puts a slope behind every step, from the upper lip down to the lower
  ground (`FORMS.bankRun` x the step height; steep under the lip, talus below), painted nearly as lit as the
  cut face (relief 0.4) so wall and slope read as one bank, with buttress roots, two boulders and ferns
  (`info.lee`); at the pool only an outcrop behind the edge. `paintBankFronts` (after the ground) sets a stone
  lip flush in the corner or roots over it and down the face. `paintGreatForms` places the `GREAT` list: fallen
  logs with a root plate, boulder clusters, a root arch, in the back plane; the random backdrop keeps off their
  spans and off the bank slopes.
- **Landmarks** (`paintLandmarks`, one per zone, back plane, each with a dim halo from `info.lanterns`
  `{cyan|violet, size}`): a 350 px leaning carved moth-stone by the pool with a fallen piece, roots up its
  edges and lichen in the carving; five cocoons on silk under the great bough (one lit, one torn);
  a shrine at the right (wing-stone on a plinth, two cairns, charm cords, a bowl, violet moss).
- **Plants grow in thickets** on the ground (`thicket(x)` in `growGarden`: gap x0.55-2.9, size x0.62-1.22);
  an even spacing and height along the walk line read as planting. Centre-zone tones in `toneAt` are deep
  saturated green with olive as a minor note and gold only by `sun^2`; the bake's warm zone tint is green in
  shade and warm in a sun pool.

- **Slash reaction** (`PlayfieldLayer.onSlash`, on the sim's `slash` event; see combat.md): the bend field takes a
  blast across `slashBox(...)` for the live frames and a gust that runs ~210 px on ahead (`BendField.slash`); the
  field's B channel is a per-cell cut amount that shortens grass blades in the shader and regrows over
  `FIELD.regrow` s (blades are recognised by droop 0.35-0.42); `pf-clippings.ts` throws 8-16 bits of grass, leaf
  and petal from a fixed pool (flight computed in the vertex shader, buffer written only on spawn); the pool gets a
  line of droplets and a ripple (`Water.slash`). Power: 1, +0.12 per combo step, 1.6 for the finisher.

- Slash tuning that reads at zoom 3 and zoom 1: `slashKick` 19, `gustKick` 11, 20 clippings (size 4.5-9), regrow 7 s.
  The blast also covers `slashHangRows` rows above the box, because hanging things sample the field at their
  anchor, which is above the box. To judge it, stand still with tall grass within 110 px and use a fixed camera.
- Vine-anchor clumps (`leafKnot`) are painted in `SHADE` (canopy shadow) with rim alpha 0.15 and only a modest lit
  side: they must merge into the canopy behind, never be the lightest foliage up there.

## Knobs (config object at the top of each file)
`TERRAIN` palette, moss lift/thickness/drip, `mossBare`, `faceUndercut`, `waterDepth`; `BAKE` blur sigmas, bump, key, shadow, interior, `beamWidth`, brushwork (`planes`, `strokes`, `crevice`, `chips`);
`PLANTS` feature gap, `rearGap`, `backdropGap`, `heroGap`, `glowShare` (per zone), `autumnEvery`, `fineShare`, grass cover and heights, fringe, wind/bend per px, halo alpha, `glowEvery`;
`FIELD` spring stiffness/damping, reach, land kick/reach/time/width, glow rise/fall; `WATER` colours, alphas, ripples;
`PLAYFIELD` bake scale range, glow gains.

## Gotchas
- The fringe and `water.front` live in the `playfieldFront` layer (just above `character`, parallax 1).
- Final alpha is `albedo.a * relief.a`: a `tint()` with no relief under it is invisible. That is on purpose
  (shadow washes cannot leak outside a body), so anything solid must go through `solid()`.
- Relief below ~0.35 is the "back plane" (stilt roots, saplings): the lit pass gives it almost no key
  light, so it stays behind the walk plane. Keep things the character passes in front of down there.
- Pass `clearColor: [0,0,0,0]` when rendering to a RenderTexture: the default clears to the app background
  and shows as faint boxes around tiles.
- Hard `step()` / `floor()` edges in the bake shader alias at the bake resolution: use `plane3()` or a narrow
  `smoothstep`.
- The bake shader erodes silhouettes by up to ~1 px with noise (brushed edges) and breaks the lighting into
  a few soft planes; both are in `main()` of `LIT_FRAG`.
- Hollows (`info.pockets`, kind `glow` or `crystal`) are kept 80 px clear of bank faces, or they open into the air.
- Form-following stroke noise draws contour rings round roots when posterised: keep its weight low (0.22) and
  the fine stroke layer on the plain grain. GLSL `smoothstep(a, b, x)` with a > b is undefined: flip it.
- A wide `tint()` ribbon that follows the smoothed ground profile swoops across banks: break it at steps.
- Cost: at 4K most of the playfield's time is the terrain sprites, and the atmosphere agent's hero-light mask
  draws `playfield` + `playfieldFront` a second time each frame. Big alpha-blended plants are the next cost:
  put large background shapes in the bake, not in the plant mesh.
- Rocks are neither `blob()` ellipses nor facets (triangles between corners read low-poly): use `paintRock`.
  Backdrop boulders stand in side-by-side clusters (never stacked). Low-count `blob(..., n < 9)` is a polygon:
  avoid it for anything bigger than a pebble. Shrub lobes are lumpy `cloud()` fans with rim leaves, never plain `fan()` discs with a
  strip under them (that combination read as snowmen and balls on blocks).
- `npm run clip` centres on the character: to film the pool, stand in or beside it, or use `__game.cam` stills.
- Landing shiver is a ring (`BendField.waves`) that travels `landReach` px in `landTime` s, scaled by impact speed;
  it adds velocity, so plants overshoot and wobble back on the cell springs.
- Other agents' saves full-reload the page between `playwright-cli` calls: capture a motion sequence inside ONE
  `eval` (step, `g.render()`, `drawImage` the game canvas into a 2D canvas, return a JPEG data URL).
- **FloraBuilder vertex indices are per chunk.** Anything that keeps indices across `plant()` calls (a strip
  running along x, like the front moss lip) must restart when `chunkIndex(x)` changes, or the draw indexes past
  the chunk's vertex buffer (`glDrawElements: Vertex buffer is not big enough`).
- Hanging vines end in a `leafKnot` near the scene top (y 30-90): a clump of lumpy lobes on a dark bough.
  **Leaves are rooted on their host**: `lobeLump(a, seed)` is the one outline formula for a foliage lobe and for
  the leaves on it (rim leaves at 0.8-0.9 of the outline so tips lap the edge). Never scatter leaves by a plain
  radius round a shape: they float off it. Leaf colour is a step lighter than its mass, same hue.
- The owner prefers the darker picture (post-and-air.md, round 10): do not brighten plant or moss tones to chase
  mean luma. Lit foliage is saturated at moderate value. Judge with a walk strip of the hero among plants in each
  zone, not only the seven stops.
- Warm zone variety lives in `toneAt`: each plant draws `vary` (moss green to olive bodies, gold only on lit tips
  in a pool) and ~8% are a cool blue-green accent. A single warm tint for everything read as uniform mustard.
- GLSL: `cast` is a reserved word. Destroy shaders before the textures bound to them or Pixi warns.
- Bake scale is fixed at boot (`viewScale` clamped to 1.5..2); a later resize does not rebake.
- **Elevated tops must not rule a line.** Three things used to stack into a dark tray rim along every island:
  the front moss lip (now separate pads in BACK tones on non-ground tops), the near-black bases of grass
  (`baseLift` in pf-plants.ts lifts `tone.dark` toward mid while planting non-ground tops) and the contact shadow
  under the crest (`MossOpts.lipShade`). Grass on elevated tops grows in small drifts with gaps and shortens to
  the free ends (an even stand read as a clipped hedge on a tray).
- The bake's posterised planes are softer than they were (`BAKE.planes` 0.6, `plane3` riser 0.2-0.8): at 0.82
  with a narrow riser every round root and trunk was tiled with crisp angular plates.
- A `ribbon()` ends in a flat cut: anything short and wide (a node, a collar) needs a width that goes to ~0 at
  both ends or it bakes as a box. Four even shards on a stump read as a hand: use one tall splinter and a lip.
- Island shapes that failed: a symmetric fork (a goblet), one boxy boulder (a drum / a log end), one stone with
  roots hooped round it (a cauldron), a wedge-shaped bracket (an axe head of wood), roots with bright even
  highlights (straps). What worked: asymmetry, two stones instead of one, supports that come from one side.
- Cost measured 2026-10-13 at 3840x2160 (M5 Pro, playfield + front toggled, `gl.readPixels` after each tick):
  0.22-0.53 ms per frame at four stops after the forms and landmarks (0.23-0.48 before), CPU 0.14-0.16 ms. The
  pool stop is the dearest (most baked area on screen): big new baked forms there need a re-measure.
- Bank lessons: a back-plane (dark) slope is invisible against a dark background and leaves the lit wall
  as a box, so the slope must share the face's tone. The lit band makes any face it runs into more of a box:
  the raised centre block (x 2560-3200) is still the squarest thing in the scene. A wide `tint()` over the band
  needs stones and roots in it or it reads as a smear. To judge terrain alone, hide the plants:
  `for (const f of __pf.layer.flora) f.container.visible = false`.
- `paintRootShoulders` paints the stilt roots a second time, fading, over whatever stands behind them: a back
  form placed under a trunk looks like glass. Keep great forms clear of x 3050-3750.
- Tops are honest to within ~6 px (`__game.debug.hitboxes(true)` to check; re-checked for all seven islands and
  both boughs after the rebuild). Island bodies, ledge sag and the trunk root crowns hang below the collision
  bottom; nothing lit rises above a top (the snags' spars do, but in the dark back plane).
- Dev only: `window.__pf` = `{layer, back, front}` (toggle `.visible` to profile; `layer.cpuMs`).
