# Playfield (terrain, plants, pool)

`src/render/scene/layers/playfield.ts` + `src/render/scene/lib/pf-*.ts`. Everything is generated from
`scene.solids` / `oneWays` by tag; nothing is authored in `grove.json`.

## Files
| file | what |
|---|---|
| `pf-terrain.ts` | `paintTerrain`: ground (strata, lit band, depth shade, moss cap), trunks, ledges, root mound, boughs, backdrop, edge walls; returns `TerrainInfo` |
| `pf-forms.ts` | back ridge, banks behind steps, bank fronts, great forms (logs, boulders, arch), the three landmarks |
| `pf-islands.ts` | the seven floating islands, their snags, `limb()` (all round wood) |
| `pf-rock.ts` | `paintRock` (all stone), `dome()`, `fitUnderTop()` |
| `pf-paint.ts`, `pf-bake.ts` | the two vector canvases (albedo, relief) and the lit bake |
| `pf-plants.ts`, `pf-flora.ts` | species and placement (`growGarden`), mesh builder and shader |
| `pf-field.ts` | bend field; `pf-water.ts` pool; `pf-clippings.ts`, `pf-flutter.ts` |

## How it works
- **Terrain is baked once at init.** Every shape is painted as `albedo` (flat colour) and `relief` (R height,
  G moss, B bark); the bake blurs relief at three scales and lights it per 512 px tile. Free at runtime.
  Final alpha is `albedo.a * relief.a`: `tint()` alone is invisible outside a body; solid things use `solid()`.
- **Relief is depth.** ~0.25-0.33 is the **back plane**: barely lit, reads as behind the walk line (snags,
  saplings, banks, great forms, landmarks). 0.5-0.8 is the walk plane. Height shells (`dome`, `limb`) make
  forms turn in the light.
- **Light is one sun map** (`sunAt` in `pf-shape.ts`, copied as `sun` in the bake shader: change both):
  discrete pools, most ground gets none. **Zones** (`zoneAt`, `uZone`): cool < ~1900, warm, deep > ~3900;
  they tint terrain, set plant tones (`toneAt`), species mix and glow colour.
- **Plants** are three static meshes (back, additive halos, front fringe in `playfieldFront`), chunked
  every 480 px; wind, bend and glow in the vertex shader (wind is a GLSL copy of `wind()` in `look.ts`).
  Order in the back mesh = placement order: haze reeds, rear shrubs, hero plants, features, grass.
  `TerrainInfo` (tops, unders, faces, twigs, lee, keepClear, hangers, lanterns, pockets) drives placement.
- **Ground**: under the lip a lit band ~120 px deep (`lipBand` washes, eased off in sun pools and in the warm
  zone; stones and roots painted into it), then `depthShade` to `abyss` by ~220 px. Near a step the dark is
  measured from a sloped top (`shadeTop`, `stepRun` 240) and the lower band runs on under the higher block,
  so no vertical line shows below ground. Crest (`groundRead`) only along moss cushions (`crestOnMoss`).
- **Steps** (`pf-forms.ts`): behind each, a dark back-plane slope (steep at the top, overgrown) so it is
  clearly not walkable; in the walk plane a stone lip or roots over the corner, one great buttress root
  standing off the face with its toe out along the lower ground (the hollow behind it is `abyss`), low stones
  at the foot. Under a trunk (`trunkXs`) the corner gets shadow and roots leaning down from the trunk's foot
  instead of boulders. `ridgeHeight(x)` mounds earth behind the walk line (kept low, + a swell on the
  centre block).
- **She must always stand against mist.** Nothing tall and dark directly behind the walk line for long:
  logs lie low (girth 44, below her waist), boulder clusters are few and under ~110 px, snag trunks are
  slim, the stretch between the two trunks is `keepClear`. Landmarks are the exception.
- **Fight spots are plain** (`info.calm`: `FIGHT_SPOTS` in pf-terrain.ts plus ±230 px round every burrback's
  start): no rear shrubs, reeds, tall grass, front clumps, backdrop boulders or great forms there, features at
  0.55 size, ridge at a third, so creatures and the hero read against the mist at shell height.
- **Glow never blooms**: `PLAYFIELD.glowGain` 0.28 / `haloGain` 0.22 (was 0.7 / 0.7), and no glow plants within
  ~260 px of `info.noGlow` (the goal's lanterns and the heart: they are the lights there). The cyan blob by the
  moth-stone was NOT ours: a mid-layer mushroom cluster with its own light at (1552, 1268); the stone's fallen
  piece is sized to hide it.
- **Pool basin**: stones at the waterline, half way down and in the floor corners plus roots dipping in
  (`paintBankFronts`, pool case), and the water shader masks its tint to a basin with leaning, wobbling walls
  and round floor corners (`basin` in pf-water.ts).
- The moth-stone's lower 110 px is calm (mist washes, no carving or moss): the goal's lantern and the hero
  stand in front of it; carving starts above head height.
- **Islands** (by index, palette `ISLES`): 0 two wet boulders in the crotch of a snag; 1 slate flake in a
  vine sling (thin; pod-f2 hangs under its middle); 2 aerial-root mass; 3 bracket fungus on a hanging limb;
  4 woven nest; 5 bent crown limb of an old snag (thin; pod-f6 under it); 6 two violet stones clutched by
  roots. Each sets `under(u)`, `trail`, `ropes` (`info.hangers`: one `hangVine` per rope to a `leafKnot`).
- **Landmarks** (`paintLandmarks`, back plane, a dim halo each via `info.lanterns {cyan|violet,size}`):
  350 px carved moth-stone by the pool; five cocoons under the great bough; shrine at the right.
- **Bend field**: 480x67 cells of 12x24 px. R push (springs; the hero, `land` rings, slash blast and gust,
  and ground enemies: burrbacks are fed in as `bodies` from `sim.enemies`), G glow, B cut (grass shortens,
  regrows in `FIELD.regrow` s). **Slash** (`onSlash`): blast + gust, clippings from a fixed pool, pool
  droplets. **Pool**: two quads, one shader (surface, caustics, fish, ripples, splash).

## Layout pass, 2026-10-14 (the bluff, the hollow)
- Both are plain `ground` rects painted by the generic step code. **Tall steps** (`FORMS.tallStep`, H >= 170:
  both faces of the bluff) are treated as cliffs: the great buttress stands as a column (toe 50-74 px, relief
  0.6, `lit` 0.14) instead of leaning out as far as the face is high, the back bank is half as long
  (`tallRun`), and the face gets bedded stones, a second clinging root and rootlets under the lip. Before, the
  buttress was a lit 45 degree ramp from the terrace to the lip (east) and from the path to the lip (west):
  the "lit slope" failure. Any root or bank that joins a lower walk line to a higher one at under ~65
  degrees reads as a way up.
- The root mound (3968-4160) stands on the hollow's east lip: whatever leaves it westward (back roots, the
  first braid, the feeder, the lee plant) now comes down to `footAt(x)` = the hollow's floor; they ended in
  the air at the old ground level 1280.
- `FIGHT_SPOTS` terrace entry is `[2624, 3200]`. burr-rise starts at 3002 (calm ±230 = 2772-3232).
- The vines' leaf knots (`leafKnot`) hang from limbs that start above `viewTop(scene)` (passed to
  `growGarden` as `skyTop`); they began 330 px up, and with the camera's headroom two of them showed as a
  sawn-off X over F7 (5260, -150). All knots of one island lean the same way.
- Not done: the 1280 ground's grass still runs across the front of the root mound (the ground top is not
  split under a `root` solid).

## Rules learned
- Nothing manufactured: no ruled edges, flat facets, even spacing or even heights. Stone = `paintRock`,
  wood = `limb()`. `blob(..., n < 9)` is a polygon. A `ribbon()` ends in a flat cut: taper short wide ones.
- Elevated tops must not rule a line: front lip is separate pads, grass bases are lifted (`baseLift`),
  contact shadow is scaled (`lipShade`), grass grows in drifts and shortens to the free ends.
- Ground plants grow in thickets with gaps (`thicket(x)`).
- Leaves are rooted on their host (`lobeLump` for mass and leaves alike); never scatter by radius.
- Vine anchors (`leafKnot`) stay in canopy shadow tones.
- The owner wants it dark: never brighten plant or moss tones to chase luma. Centre zone: deep saturated
  green in shade, gold only in sun pools.
- In the deep zone the bake's violet tint eats green: island crests there are painted brighter.
- Shapes that failed: symmetric fork (goblet), one boxy boulder (drum), stone hooped by roots (cauldron),
  wedge bracket (axe head), evenly lit roots (straps), four even shards (a hand), a lit slope behind a
  step (reads as a ramp she cannot climb), a back form under a trunk (`paintRootShoulders` repaints the
  stilt roots over it: keep great forms clear of x 3050-3750).
- Tops are honest to ~6 px; nothing lit rises above a top. Check with `--hitboxes`.

## Gotchas
- FloraBuilder vertex indices are per chunk: a strip along x must restart when `chunkIndex(x)` changes.
- Bake shader: no hard `step()`/`floor()` (use `plane3`); `smoothstep(a, b, x)` needs a < b; `cast` is
  reserved; pass `clearColor: [0,0,0,0]` to render textures. Bake scale is fixed at boot.
- Hollows (`info.pockets`) stay 80 px clear of bank faces.
- Cost at 3840x2160 (M5 Pro, toggle `__pf.back/.front`, `gl.readPixels` per tick), 2026-10-14: 0.25-0.37 ms,
  CPU ~0.15 ms. Most of it is terrain sprites; put big shapes in the bake, not the plant mesh.
- Dev: `window.__pf = {layer, back, front}`. Terrain only: `for (const f of __pf.layer.flora)
  f.container.visible = false`. Other agents' saves reload the page: capture sequences in one script
  (`tools/lib/browser.ts` + `__game.step`), fixed camera, crop to the action.
