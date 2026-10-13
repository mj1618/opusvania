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
- Point lights (`ctx.lights.list`, up to 12 on screen) are a gain on the scene colour, masked to the
  playfield. Post has no depth, so the mask is the scene's collision rects drawn soft in the light
  pass (`lights.reachAbove` px above each top to catch grass). `lights.background` is what still
  reaches everything else. Things that are already bright get no gain (fireflies near the ember
  used to blow out to white).
- `POST.msaa: 'auto'` multisamples the scene texture only below 1.75 device px per logical px. At
  3840x2160 MSAA on that texture alone costs ~2.3 ms and cannot be seen.

## Air (`scene/layers/air.ts`, shaders in `lib/fx-air-shaders.ts`)
- `layers.airBack` (new, between mid and playfield): the strong shafts, so terrain and trunks cut
  them. `layers.air`: faint front shafts + ground mist in one quad, motes, fireflies, leaves.
- Shafts are noise in "light space" (u across `KEY_LIGHT.dir`, v along it), windowed by `AIR.shafts.groups`
  (where the canopy opens). Motes are stateless (position = f(seed, clock), wrapped in a tile around
  the camera) and evaluate the same shaft function in the vertex shader to light up inside beams.
- Mist and motes know the ground from `lib/fx-ground.ts` (profile of `ground`/`root`/`pool` rects as a
  1-row texture). Platforms are not in it.
- Fireflies are the only stateful thing (a spring offset when they flee the character).

## Foreground (`scene/layers/foreground.ts`, shapes in `lib/fx-foliage.ts`)
- Plants are drawn once as Graphics, baked at half size into one atlas, blurred once (`BlurFilter`
  strength 2.2 there looks like ~9 px on screen), then drawn as sprites that sway and fade.
- The top group is locked to the screen vertically (`topLock`): with true 1.35 parallax it swept
  through the middle of the frame whenever the camera climbed.
- Top pieces and the end trunks go translucent while the character is behind them. Full-height
  trunks mid-scene looked like cardboard or, faded, like ghosts: only thin lianas hang there now.
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
  3840x2160: post ~0.6 ms, air ~0.7 ms, foreground ~0.2 ms.
- `__fx` (`lib/fx-debug.ts`) = `{post, postFilter, air, foreground, layers}`: debug handles only.
