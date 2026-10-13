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

## Round 3 additions
- Value plan per zone lives in `ZONE_GRADE` (post/config.ts): exposure, S-curve contrast and pivot
  per zone. The left glade was fixed there (exposure 0.86, contrast 0.5 around pivot 0.5: milky fog
  mid-tones drop, glows stay), not by editing the background's fog.
- Hero pocket (`POST.hero`): a wide, faint darken + desaturate ring centred on the 'ember' light,
  leaving the hero itself untouched. Strength per zone in `ZONE_GRADE.heroPocket`.
- The light pass takes 9 mask taps: a softer mask and its gradient, used as a cheap normal so
  silhouette edges facing the light gain and edges facing away lose (`lights.direction`).
- The playfield mask is redrawn every other frame (or at once if the camera jumps > 120 px or zooms).
- Both air volume passes (shafts, mist) render into 960x540 half-float targets and are shown as
  sprites: a sixteenth of the pixels at 4K, no visible loss. Mist sheets between the canopy tiers
  (`AIR.mist.sheets`) and a shaft boost at height (`shafts.highBoost`) serve the high route.
- Chroma split is off by default (two full-res taps nobody saw).
- Foreground near plane uses `leafBranch` (few big drip-tip leaves with veins) and `flowerCluster`;
  blur 1.5. On the high route the near top plants pull back and thin (`highRetract`, `highAlpha`).
- Leaves land on every solid and one-way top. Moths fly at y~800, behind the playfield.

## Round 4 additions
- Bottom foreground is designed like the top: `frond` (comb of separate pinnae), `bladeArc` (few long
  blades), `broadLeaves` with drip tips; the far plane adds gold flowers only in the light well and
  dark `mushrooms` with glowing gills in the two dark zones. Coloured things in the foreground must
  be mixed at least ~70% toward the body tone or they read as stickers.
- Light wrap (`bloom.wrap` / `wrapHigh`): in the composite, dark pixels take extra bloom in their
  own colour, so leaf masses beside bright openings get backlit edges. Stronger with the camera high.
- `AIR.backGlow`: an additive soft sprite in `airBack` behind the hero (behind the playfield too),
  tinted and scaled per zone. It is what separates a dark skin from a dark ledge; the post pocket
  only helps against bright backgrounds.
- `__fx.leaves` exposes the leaf system (used to find a platform landing for a screenshot).

## Round 5: the hero was washed out by her own light
- Cause (found by toggling): the post light is a gain that favours dark pixels and peaks at the
  light; the playfield mask is 1 wherever a bush or ground is behind the hero, so the hero's own
  dark body got the largest lift of anything on screen. Mist, bloom and back glow were minor.
- Fix: a hero matte (`lib/fx-mask.ts`, the character layer's alpha at 960x540, redrawn every frame
  from `PostStage.update`; this makes the character layer a render group). The composite keeps
  light, halo, light wrap and 65% of bloom off matte pixels (`lights.heroProtect`, `heroBloomCut`).
- Lit surfaces are soft-kneed toward `lights.cap` (0.78 luminance) so moss and grass never go white.
- Side effect: where the hero is behind a translucent foreground plant, the matte shows as a
  slightly darker hero shape on it.

## Round 6: low key (after memory/reference-study.md)
- Measure with `npm run look:stats -- --stops=shots/<dir>` (see toolchain.md); targets are in the study.
- Foreground is opaque near-black (tones in `foregroundTones`, luma < 12) with a faint cool rim, blur 4
  atlas px (~16 on screen), the blurred atlas drawn twice over itself so bodies stay opaque. Mass sits
  in two opposite corners (top-left + bottom-right, mirrored for camera x > ~2900: `mirrorAt`) plus a
  dense low band (`band`). Thin shapes vanish under that blur: only big leaves survive. On the high
  route the bottom corner and band are off-screen (true parallax); only the top corner remains.
- Shafts are explicit beams now (`AIR.shafts.beams`, max 8), two or three per screen. A beam with
  `pool > 0` registers a point light `shaft<i>` where its centre line meets the ground profile; post
  lands it on ground and plants through the playfield mask. Shaft strength was the main reason the
  centre measured 88-99 mean luma: back 0.42, centre zone 0.6, no boost at height.
- Motes: 420, 2-4 px points, gathered by a swarm noise, low over the ground and over the pool
  (`poolX`); the top `bokeh` seeds are big flat faint discs. Fireflies 12/4/8 in clusters (`spots`), size 30.
- Hero pocket pulls anything brighter than `hero.ceiling` behind the hero toward it (`pull`), on top
  of the flat darkening. `AIR.backGlow` is nearly off now that Vesper carries her own light values.
- Grade per zone (`ZONE_GRADE`): exposure 1.32 / 1.08 / 1.46 gives light back to the dark zones the
  other layers now darken at source; contrast 0.36 / 0.28 / 0.36 keeps blacks. Hero light gain 3.5,
  cap 0.6 (higher blew the grass around her to near-white in the dark zones).
- Stop 7's hero numbers are polluted: teleporting there collects a glint (pickup flash over her).

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
  3840x2160, round 3: post ~0.9-1.2 ms, air ~0.2-0.5 ms, foreground ~0.1 ms (round 2: 1.3 / 1.0 / 0.1).
  Numbers move by +-0.5 ms when other agents' browsers share the GPU.
- `__fx` (`lib/fx-debug.ts`) = `{post, postFilter, air, foreground, layers}`: debug handles only.
