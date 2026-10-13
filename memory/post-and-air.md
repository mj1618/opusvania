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
  tried and removed (cardboard, ghosts, ropes through the centre); the end trunks went in round 12.
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
- Foreground is opaque near-black (tones in `foregroundTones`, luma < 12) with a faint cool rim (blur: see
  round 12), the blurred atlas drawn twice over itself so bodies stay opaque. Mass sits
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

## Round 7: lit surfaces keep their hue
- The light pass used to ADD (grey-ish albedo x light + a warm constant), which walked lit grass toward
  chalky white. It now multiplies the surface colour by `1 + gain`, tints by the light colour only
  `lights.tint`, raises chroma a little (`chroma`; 0.45 went neon, 0.08 is right), knees the luminance
  by scaling the whole colour, and scales back if any channel passes `channelCap`. Blade shading survives.
- The hero pocket skips bright saturated pixels (glints, glow caps, fireflies) so it never dims them.
- The centre beam that sat behind the high ledge moved from x 3560 to 3720 (hero ratio at stop 5).

## Round 8
- The playfield mask is `playfield` only. Drawing `playfieldFront` (the plant fringe mesh) in the mask
  pass logged `glDrawElements: Vertex buffer is not big enough` on every mask redraw; the fringe
  overlaps ground and back plants, so the lit result is the same without it.
- The pale slab at the top of the left zone was the back volume pass: wide beams plus the mist
  sheets between canopy tiers. Left beams are now three narrow ones (half width 55-90), sheets are
  0.14 / 0.08 opacity, and every beam is dimmer in mid-air than under the canopy hole and at its landing.

## Round 9
- The hero matte is computed first in the composite and also exempts the hero from the pocket (its
  ceiling pull was greying her face: the pocket's untouched core is centred on the ember, not the
  face), from 85% of the vignette (she was dim at frame edges, e.g. the far ledge) and from `midLift`.
- `grade.midLift` (0.12): a lift of mid-tones only (luma ~0.07-0.85 window), blacks untouched. 0.22
  measured mean 55 but dropped hero ratio under 2.7 at two stops and lifted fog; 0.12 is the compromise.
- look:stats hero p90 depends on how much of the hero box is face: on the high ledges the box holds
  more dark background, so p90 reads lower there even when the face is near-white.

## Round 10: the owner found it too bright (their eye outranks the metrics)
- In play, everything within ~200 px of the hero was a pale washed bubble. The seven fixed stops hid
  it: she stands on fairly bare ground there. Check with a walk of the ground route instead (frame
  every 150 px, idle and running, a 480x300 crop round her, % of pixels over luma 185): before, 67 of
  74 frames had > 3% pale and the worst 21%; after, none over 1.8%.
- What it was: hero light gain (1.5 x reach 1.5) stacked on zone exposure 1.72-1.85, the mid-tone
  lift, air halo, mist lit by lights, and bloom colour boost 2.6 on already saturated lit tips.
- Ended on: lights.gain 0.38 (about +38% at the centre), cap 0.43, channelCap 0.62, reach 1.15, haze
  0.006, glint 0.08, warm 0.004; bloom intensity 0.7, colorBoost 1.3; midLift 0; exposure 1.3 / 1.12 /
  1.4; mist litByLights 0; backGlow off. Do not raise these to chase mean luma or hero ratio.
- Resolution: nothing scales with window size (same numbers at 1920, 1280 and 960 wide).

## Round 11: what post does to the hero (measured)
- Post does not blur her: edge gradient on her box is the same or higher with post on, MSAA on/off
  makes no difference, the scene texture is composited 1:1 at device resolution.
- What washed her: the split-tone shadow lift (her darks +9 luma), ground mist and the front shaft
  veil drawn over her (+3-7), the highlight shoulder (greyed her near-white face), and bloom fed by
  her own pale face and rims (a soft halo round her outline, strongest at the antenna tips).
- Now, through the hero matte (full logical resolution 1920x1080, threshold 0.25-0.5): no exposure or
  shoulder on her, no shadow lift, no bloom added on her (`heroBloomCut` 1), and she feeds the bloom
  only 20% (`heroBloomSource` 0.8, applied in the prefilter). Mist and the front veil open 96% round her.
- Still applied to her: S-curve contrast, highlight tint, saturation, grain, 15% of the vignette.

## Round 12: tonal range, rich darks, a near plane (second reference study)
- Grade additions, all after the S-curve and all off the hero (matte): a **toe** (`grade.toe` 0.2,
  `toeDepth` 0.8 per zone: below luma ~51 the value falls by a power curve, above nothing moves; it runs
  before the split-tone lift, so crushed blacks keep the zone's coloured floor), **rich darks**
  (`ZONE_GRADE.richSaturation` 1.5 / 1.45 / 1.38 and `richTint`: only below luma ~0.3-0.6, less on pixels that
  are saturated already or inside a point light; highlights keep `saturation`), centre shadow tint is deep
  green now (was olive-brown). Measured on the stops: near-black 33 -> 47%, dark grey 39 -> 27%, chroma 22 -> 30.
  Centre richSaturation 1.7 turned lit grass neon.
- **Sparks** (`grade.spark`, `sparkWhite`): cores of small very bright things go white-hot. Point vs area is
  told by `uWide` (bloom level 240x135) over the pixel's own expected glow: < 0.3 point, > 0.6 area. The
  first try used the full bloom texture: no separation, a whole glow-mushroom cap beside the hero went white.
  Sparks are off within the hero pocket radius. They move p99.9 by only a few points: there are too few hot
  pixels in the scene (the 237 of the references is ~2000 px; ours are firefly, glint and HUD-flame cores).
- Foreground: blur 2.2 / 1.3 atlas px (4 was a formless smear; shapes must read), new near shapes `toadstools`
  and `archRoot`, never the same kind twice running, a far-plane middle tier (170-250 px, both sides), the
  corner opposite the main bottom mass comes out 85% (`bottomOther`), bottom plants use `bottomClear` /
  `bottomFull` (out in the side thirds). Bottom plants are **pinned to the frame's bottom edge** while the
  camera is within `bottomFree` px of its ground rest: with true parallax the 128 px terrace dropped them out
  of sight. They only read where the ground behind them is lit (the lip under the walk line, the pool).
- Moths: zone-coloured dusky wings (`moths.color`, ~60% value), size 7, glow 0.07. Fireflies 26 px, peak 0.85.
- Shafts flicker 10% over ~5 s (`shimmer`) and widen/narrow 14% with the slow breathing (`breatheWidth`);
  the ground mist's second sheet drifts 14 px/s.
- The glare walk (scratch script: frame every 150 px, idle + run, 480x300 crop, % over luma 185) now tops
  out at 1.7-1.85% at x 1500 (pool edge); hiding the `mid` layer drops it to 1.0%, so it is the mist stage
  there, not post. Watch it.
- The "huge hard-edged disc" in the centre's sky opening was the rim of a point light (shaft pools, radius
  ~240-370 px): the light-colour tint (`lights.tint`) applied at full strength from `lm > 0.002`, a 22% colour
  step exactly at the light's radius, visible against anything bright. The tint now fades in with the light.
  The hero pocket was not involved (it is two Gaussians, no edge).
- The foreground end trunks are gone (`trunks: []`): opaque black, they were a flat slab over the last ~90 px
  at the right camera clamp and hid the far ledge with the hero on it.
- Right zone richSaturation is 1.38 with a bluer tint: with the mid layer's mist stage it read magenta-pink.
- Cost at 3840x2160 (M5 Pro): post ~0.8 ms, air ~0.3 ms, foreground ~0.1 ms.

## Round 13: the goal's lights (lanterns, heart)
- Shaft pools keep ~350 px clear of the lanterns (feet 1448,1280 / 3684,192 / 5524,448) and the heart
  (5212,1088): beams 2290 -> 2580 (pool 1552 -> 1851) and 5560 -> 5380 (pool 4919 -> 4739). A beam lands
  ~0.46 px left per px of fall. The pool at 1552 was the "blue blob" behind the moth-stone; the glare walk's
  worst frame (x 1500) fell from 1.86% to 0.76%. Not moved: the big centre beam (3720) passes ~190 px left
  of the summit lantern in the air; moving it puts it behind the high ledge again (round 7).
- `POST.lights.goalIds` (`lantern0..2`, `lanternSwell`, `heart`): looked up by id in the registry, they and the
  ember always get a slot (the rest by distance from the view centre when more than 12 are in range); their
  intensity x `goalBoost` 1.8; under them (positions go to the composite as `uGoal`, 4 max) the lit-surface caps
  rise by `goalCap` 0.22, surfaces take `goalTint` 0.4 more of the light's colour, the hero pocket lets go
  (`goalPocket` 0.9), and sparks are allowed at the light's core even beside the hero. 2.4 / 0.45 / no tint
  turned the pale boulder by the first lantern cream-white: pale rock needs tint, not gain.
- Measured (full-frame mean luma): the heart's wake adds +2..6 as it passes and is not crushed by the toe; in
  the centre zone near-white touches 1.2% for a few frames; the settled state after the wake is +7 in the
  left zone (26.8 -> 33.9), +5 right, +3 centre: that lift is the goal layer's, not post.
- Camera above the scene top (y -20): shafts, motes and the pinned top boughs fill it without edges. The
  "crossed dark beams" are still there with the foreground hidden: not air or foreground.

## Round 14: after the layout pass (bluff, hollow, the sky line)
- **Bottom foreground plants never stand on a walk line** (`walkClear`, `walkReach`, `walkEase`): each sinks
  until its top is 12 px under the lowest ground within 250 px of the playfield x it is in front of (a
  max-filtered, smoothed copy of the ground profile, so it moves with the camera and never pops), and lets
  go when that line is more than ~80-220 px under the frame. Pinned to the frame edge with the camera on
  the bluff they covered the terrace, burr-rise and the hollow. Cost: at ground rest the near masses are
  about 300 px tall at most and mostly lie on dark earth, so the bottom corners frame less than before.
  The knob is `walkClear` (negative lets tips cross the line).
- `GroundProfile`: a pool's surface line comes from its own banks. It was the lowest ground top of the scene,
  which the hollow (1376) pulled 96 px down: mist, motes and leaves over the pool sat under the water.
- Beam pools are found by marching the centre line down from the entry (`POOL_MARCH`): the first ground it
  meets. The old fixed-point walk put beam 3080's pool on the path in the bluff's shadow (2350, 1250); it
  lands on the bluff's top now (2498, 930).
- `AIR.shafts.sky`: beams thin to 60% above y -260 (full below y 260). They were at full strength from the
  entry (y -300) upward, i.e. right behind the sky line's dormant glints (backdrop luma 64-78 mean, 118
  peak, against a glint of 110-130). At 40% with the mid canopy quieted the band was an empty black lid.
- The "crossed dark beams" above the scene top were the playfield's leaf-knot limbs (playfield.md).

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
