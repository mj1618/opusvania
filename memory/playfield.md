# Playfield (terrain, plants, pool)

`src/render/scene/layers/playfield.ts` + `src/render/scene/lib/pf-*.ts`. Everything is generated from
`scene.solids` / `oneWays` by tag; no decoration data is authored in `grove.json`.

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
  Floating islands are five kinds in a fixed left-to-right order (`FLOAT_ORDER`), each with its own `trail`;
  no kind appears more than twice and the second instance (`second`) is mirrored, re-proportioned and, for the
  shelf fungus, re-coloured. Trunks alternate `ivied` (vines, nest, ferns) and hollow (rot hollow, bracket fungi).
  Hanging trunks share `stiltRoots()` between a back-plane pass and `paintRootShoulders` (front, fading back).
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

- **Low key at the source** (see reference-study.md): the ground is a form, not a section. `TERRAIN.depthShade`
  lays washes of `abyss` over everything below the lip so it is near-black by ~150 px; detail painted there is
  meant to be barely visible. Ground tops carry a rounded moss crown (`crownLift` + `crownMound`). The sun map
  is discrete pools (most ground gets none); plant tone bases are near-black and only tips in a pool are bright.
  Glow plants are rare (`glowShare`), small and dim. One hollow per screen.
- **Islands hang** from slack vine bundles lashed to each end (back plane, baked). **Props** (`paintProps`):
  a carved standing stone by the pool, a cocoon lantern under the great bough, a moth shrine at the right;
  `info.lanterns` gives them a dim halo. Plants call `contact()` for a ground shadow under anything big.

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
- The bake shader erodes silhouettes by up to ~1 px with noise (brushed edges) and posterises the lighting
  into a few planes; both are in `main()` of `LIT_FRAG`.
- Hollows (`info.pockets`, kind `glow` or `crystal`) are kept 80 px clear of bank faces, or they open into the air.
- Form-following stroke noise draws contour rings round roots when posterised: keep its weight low (0.22) and
  the fine stroke layer on the plain grain. GLSL `smoothstep(a, b, x)` with a > b is undefined: flip it.
- A wide `tint()` ribbon that follows the smoothed ground profile swoops across banks: break it at steps.
- Cost: at 4K most of the playfield's time is the terrain sprites, and the atmosphere agent's hero-light mask
  draws `playfield` + `playfieldFront` a second time each frame. Big alpha-blended plants are the next cost:
  put large background shapes in the bake, not in the plant mesh.
- Rocks are never `blob()` ellipses: backdrop boulders are faceted corner runs with a sunk base, in side-by-side
  clusters (never stacked). Shrub lobes are lumpy `cloud()` fans with rim leaves, never plain `fan()` discs with a
  strip under them (that combination read as snowmen and balls on blocks).
- `npm run clip` centres on the character: to film the pool, stand in or beside it, or use `__game.cam` stills.
- Landing shiver is a ring (`BendField.waves`) that travels `landReach` px in `landTime` s, scaled by impact speed;
  it adds velocity, so plants overshoot and wobble back on the cell springs.
- Other agents' saves full-reload the page between `playwright-cli` calls: capture a motion sequence inside ONE
  `eval` (step, `g.render()`, `drawImage` the game canvas into a 2D canvas, return a JPEG data URL).
- GLSL: `cast` is a reserved word. Destroy shaders before the textures bound to them or Pixi warns.
- Bake scale is fixed at boot (`viewScale` clamped to 1.5..2); a later resize does not rebake.
- Tops are honest to within ~6 px (`__game.debug.hitboxes(true)` to check). Island tapers, ledge sag and the
  trunk root crowns hang below the collision bottom; nothing rises above a top.
- Dev only: `window.__pf` = `{layer, back, front}` (toggle `.visible` to profile; `layer.cpuMs`).
