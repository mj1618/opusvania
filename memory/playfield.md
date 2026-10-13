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
  them identical), bending and glow. ~90k vertices. Three meshes: back, additive halos, front fringe.
- **Bend field** (`pf-field.ts`): a 480x67 RGBA8 texture, cell 12x24 px. R = sideways push (one damped
  spring per cell, driven by the character's box and `land` events), G = glow excitement (character and
  `ctx.lights.list`). Plants sample it at their base.
- **Pool** (`pf-water.ts`): two quads, one shader. `back` is the body and mirrored sky; `front` is the tint
  over whatever wades in, the surface line, glints, light reflections and up to four ripples.
- `pf-terrain.ts` returns `TerrainInfo` (tops, undersides, faces, twigs, pool) and `pf-plants.ts` plants
  from that, so a new solid gets plants for free.

## Knobs (config object at the top of each file)
`TERRAIN` palette, moss lift/thickness/drip, `waterDepth`; `BAKE` blur sigmas, bump, key, shadow, interior;
`PLANTS` feature gap, grass cover and heights, fringe, wind/bend per px, halo alpha, `glowEvery`;
`FIELD` spring stiffness/damping, reach, land kick, glow rise/fall; `WATER` colours, alphas, ripples;
`PLAYFIELD` bake scale range, glow gains.

## Gotchas
- **The front container is not in `LAYERS`.** `playfield.ts` adds `playfield-front` to `layers.root` just
  above `character` and calls `placeLayer` on it itself every frame. If the layer tree gains a real slot,
  move the fringe and `water.front` there.
- Final alpha is `albedo.a * relief.a`: a `tint()` with no relief under it is invisible. That is on purpose
  (shadow washes cannot leak outside a body), so anything solid must go through `solid()`.
- Relief below ~0.35 is the "back plane" (stilt roots, saplings): the lit pass gives it almost no key
  light, so it stays behind the walk plane. Keep things the character passes in front of down there.
- Pass `clearColor: [0,0,0,0]` when rendering to a RenderTexture: the default clears to the app background
  and shows as faint boxes around tiles.
- GLSL: `cast` is a reserved word. Destroy shaders before the textures bound to them or Pixi warns.
- Bake scale is fixed at boot (`viewScale` clamped to 1.5..2); a later resize does not rebake.
- Tops are honest to within ~6 px (`__game.debug.hitboxes(true)` to check). Island tapers, ledge sag and the
  trunk root crowns hang below the collision bottom; nothing rises above a top.
- Dev only: `window.__pf` = `{layer, back, front}` (toggle `.visible` to profile; `layer.cpuMs`).
