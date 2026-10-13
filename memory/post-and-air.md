# Post stage, air and foreground

## Post (`src/render/post/`)
- One Pixi filter (`pipeline.ts`, `PostFilter`) on `layers.root`; `filterArea` is pinned to the view so
  Pixi never measures the tree. `apply()` runs: prefilter (threshold, box downsample) -> 6 dual-filter
  down levels (960x540 .. 30x17, fixed logical sizes, half-float) -> upsample chain back to 960x540 ->
  a 480x270 light map -> one fused composite (chroma split, lights, bloom, shoulder + S-curve, split
  tone, saturation, vignette, grain). Nothing depends on the window size; `resize()` only rebuilds the
  filter when `renderer.resolution` changes.
- Knobs: `POST` in `config.ts`, live. Tweakpane has a "post (look)" folder (backquote). From
  playwright: `__fx.post.bloom.intensity = 1.2; __game.render()`.
- Point lights (`ctx.lights.list`, up to 12 on screen, any colour) are a gain on the scene colour,
  masked to the playfield. The mask is real: `lib/fx-mask.ts` redraws `playfield` + `playfieldFront`
  into a 480x270 target every frame from `PostStage.update` (this makes those layers Pixi render
  groups; the picture is unchanged). The light map's rgb is light-on-surfaces (dimmed where the
  mask's own colour says the place is bright already: `lights.inBrightPlaces`), its alpha is a wider
  unmasked halo for the air. Bright pixels get glints, not gain. Skins register radius ~250-270;
  `lights.reach` scales it.
- Bloom favours emissive things without an emissive channel: the prefilter boosts saturated light
  (`bloom.colorBoost`), and the composite adds less bloom onto pixels that are already bright and
  pale (`bloom.paleCut`), so sky and lit fog do not fog further while halos around small lights grow.
- The grade follows the scene's three zones by camera x (`ZONE_GRADE` in config.ts, weights from
  `lib/fx-zones.ts`); `ZONE_GRADE.amount = 0` gives one grade everywhere.
- `POST.msaa: 'auto'` multisamples the scene texture only below 1.75 device px per logical px. At
  3840x2160 MSAA on that texture alone costs ~2.3 ms and cannot be seen.

## Air (`scene/layers/air.ts`, shaders in `lib/fx-air-shaders.ts`)
- `layers.airBack` (between mid and playfield): the strong shafts, so terrain and trunks cut them,
  and the moth flock. `layers.air`: faint front shafts + ground mist in one quad, motes, fireflies,
  leaves. The front shafts sample the playfield mask so they also pass behind solid things.
- Shafts are noise in "light space" (u across `KEY_LIGHT.dir`, v along it), windowed by
  `AIR.shafts.groups` (where the canopy opens); each opening breathes slowly. Motes are stateless
  (position = f(seed, clock), wrapped in a tile around the camera) and evaluate the same shaft
  function in the vertex shader to light up inside beams.
- Everything coloured comes in threes, `[left, centre, right]`, blended per pixel / per particle by
  world x with `zoneAt()` (GLSL twin of `zoneWeights()`): shaft colour and strength, mist tint and
  opacity, mote colours, density and brightness. Fireflies are placed and coloured per zone.
- Mist and motes know the ground from `lib/fx-ground.ts` (profile of `ground`/`root`/`pool` rects as a
  1-row texture). Platforms are not in it. Mist is lit by up to 4 point lights and pushed by the
  `wind()` wave; motes ride the same wave (`motes.windSway`), which is what makes gusts visible.
- Leaves are stateless except for one cached number per flight (the landing time, found by walking
  the path against the ground profile); they settle, lie for `leaves.rest` seconds and fade.
- Fireflies are the only truly stateful thing (a spring offset when they flee the character).

## Foreground (`scene/layers/foreground.ts`, shapes in `lib/fx-foliage.ts`)
- Two planes inside the one layer: near (parallax 1.35, the layer's own) and far (1.15, emulated by
  sliding its sprites by `(cam - anchor) * (1.35 - 1.15)`). Each plane is drawn once as Graphics,
  baked at half size into its own atlas and blurred once (`BlurFilter` strength N there looks like
  ~4N px on screen).
- Composition is screen-aware: a plant is at full size only in the side fifths of the frame and
  withdraws past the frame edge (`retract` px) as the camera carries it toward the centre
  (`clear`/`full`). This is what keeps the middle of the frame free; world-anchored masses at
  parallax > 1 always ended up crossing the character.
- Top plants are locked to the screen vertically (`topLock`); with true parallax they swept through
  the frame whenever the camera climbed.
- Anything the character is behind goes translucent. Full-height trunks and lianas mid-scene were
  tried and removed (cardboard, ghosts, ropes through the centre); only the two end trunks remain.
- The whole layer fades out above zoom ~1.15 (close-up shots).

## Gotchas
- A custom GLSL 300 fragment needs `#version 300 es` in its own source or Pixi compiles it as ES 1.00
  (`textureLod` then "has no matching overload").
- Pixi 8.21 `applyFilter` sizes the quad from the *input* frame; passes into smaller targets need
  their own vertex shader (`PASS_VERT` fills the target).
- After a filter's last pass Pixi's filter bind group still holds the pooled input texture; a canvas
  resize destroys it and logs "textureSource was destroyed while still bound". `PostFilter.apply`
  unhooks it.
- Timing: `performance.now()` around `__game.tick(1)` + a 1px `gl.readPixels` (forces the GPU to
  finish), toggling `__fx.post.enabled` / `__fx.layers.get(name).visible`. Measured on an M5 Pro at
  3840x2160, round 2: post ~1.3 ms (of which the mask redraw ~0.3), air ~1 ms, foreground ~0.1 ms.
  Numbers move by +-0.5 ms when other agents' browsers share the GPU.
- `__fx` (`lib/fx-debug.ts`) = `{post, postFilter, air, foreground, layers}`: debug handles only.
