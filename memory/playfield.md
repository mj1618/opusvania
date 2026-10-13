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
| `pf-paint.ts`, `pf-bake.ts` | the two vector canvases (albedo, relief) and the lit bake, with its mist pools (`MistFill`) |
| `pf-plants.ts`, `pf-flora.ts` | species and placement (`growGarden`), mesh builder and shader |
| `pf-field.ts` | bend field; `pf-water.ts` pool; `pf-clippings.ts`, `pf-flutter.ts` |

## Map: what is painted where (west to east, after the critical-path layout, bff2e20)
Everything is still derived from the rects by tag and by rule; the rule that picks each look is in brackets.
| x | collision | painted as |
|---|---|---|
| 0-384 | bank 1088 | ground + back ridge; cliff foot and water thread at the scene edge (`paintEdgeWalls`) |
| 384-1536 | ground 1280 | great boulder 610, log 1150; **moth-stone** 1360 (350 px, leaning) with its fallen piece at 1516 and `lantern-stone` 1448 / `pod-stone` 1500 in front (a stand-mist pool) |
| 640-2592 | F1-F5 | islands 0-4: boulders in a snag, slate in a vine sling, aerial roots, bracket fungus, woven nest |
| 1536-1856 | pool, floor 1408 | water surface 1358 (`pf-water.ts`), basin stones, roots |
| 2048-2304 @1024 | one-way | bough on a sapling that stands WEST of it (2014): east it was inside the bluff face's kick swing (`saplingSide`) |
| 2432-2624 | bluff 960 | west face (320 px) is a **kick wall** (`paintClimbFace`); east face (192) a tall step with buttress and bank; top has a lit crest |
| 2624-3072 | terrace 1152 | ground; its east face into the well is a plain wall (`wellStep`: no bank, no stone lip, no toe) |
| 2816-2976 @448 | high ledge | free-standing: a hanging aerial-root mass on vines (`TERRAIN.freeLedgeIsle`), the five **cocoons** under it |
| 2976-3200 @448 | one-way | slim limb of trunk A leaving its crown's WEST flank (`boughHost(...).west`), tip on the ledge; `pod-ledge` 3050 |
| 3200-3328, 448-1168 | trunk A | hollow snag, squat stilt feet over the 112 px doorway; BOTH flanks kick walls; `lamp-high` 3264 on top, `lamp-trunk` 3160 in the well |
| 3584-3712, 192-1280 | trunk B | vine-wrapped, stands on the floor (no roots, no arch); both flanks kick walls; `lantern-crown` 3684 on top |
| 3712-3904 @192 | one-way | summit bough, flush, slim |
| 3808-4128 @448 | one-way | catch branch; its arm from trunk B's east flank is back-plane dark (behind the climb) |
| 3744-3968 | hollow 1376 | ground; the root mound 3968-4160 on its east lip |
| 4256-4608 @912 | one-way | bough on a sapling at 4642 (on the rise) |
| 4608-5472 | rise 1088 | west face a tall step (buttress, bank); boulder 4712; `lamp-rise` 4860; **shrine** at 5212 behind the heart (cairns 5090 / 5328, wing-stone 300 px); nothing tall in the last 170 px |
| 4736-5232 | F6, F7 | islands 5 (crown limb), 6 (violet stones) |
| 5472-5760 | far bluff 448 | west face (640 px) is the scene's last **kick wall**: stone courses, three roots, mist on the face and (mid layer) beside it; lit crest, `lantern-far` 5524, `pod-far` 5690; the great trunk and buttress roots of the scene edge behind |

## Kick walls (round F3, 2026-10-14)
- **Rule: a ground face of `FORMS.climbStep` 280 px or more (taller than a jump) is climbed by kicks**, and every
  trunk flank is (`TERRAIN.kickFlanks`). Such a face is plain: the outline keeps within ~3 px of the collision
  face (no lip, belly or toe), `paintBanks` / `paintBankFronts` skip it (no back slope, buttress, stone lip,
  rootlets, foot stones), moss over its corner drapes 20 px, `info.keepClear` holds plants off the 170 px at its
  foot, and its top gets the elevated lit crest (`highRead`, the whole way along).
- `paintClimbFace` (pf-terrain.ts): 3-6 weathered stone courses bedded flush (`paintRock`, boxy 2.7, rise 0.06),
  lesser blocks deeper in on a face over 400 px, 2-3 roots that stay inside the wall, then `paintKickWall` in
  stone tones (`KickTones`: rubbed runs down the edge, a scuff with claw strokes every 118-164 px, torn moss).
  **No moss on the face**: in shade the bake takes moss to black, and a dark cushion in a pale wall is a hole
  (so is `blob(..., n = 12)` without `chaikin`: a hexagon).
- `TERRAIN.faceHold` 130: behind a kick wall the ground's depth shade starts that far in, top to bottom. Without
  it the face is lit only in a wedge 240 px wide at the top and 0 at the foot.
- Trunks: `cleanL` / `cleanR` replace the old one-sided `shaft` test in `paintTrunk` (burls, lapping plates,
  shelf fungi and flank moss only exist on a flank that is not kicked; with both kicked, moss keeps to the middle
  and vines dive under the bark 20 px short of both edges). `shaft` still picks the short stilt foot.
- A trunk's own boughs are `slim` (0.62): she comes up through them. The catch branch's arm is one back-plane
  limb with the walk-plane bough laid over it and shade on the bough's first stretch (its start is not a sawn end).
- The bank behind the far bluff was a black wedge 350 px wide (H x 1.1 x 0.5) over the shrine and the last of the
  rise; the three great forms that the layout left stranded are gone (boulder ON the bluff, arch behind the
  shrine, log on the far bluff's top with its butt over the face).

## Mist pools: paler behind the hero without painting pale (round F3)
- The bake multiplies a solid interior by 0.36, no-sun by 0.72 and the deep zone by ~0.54: an albedo cannot be
  made pale enough (a face at luma 55 would need an albedo of ~440). So value comes from **`MistFill`**
  (pf-bake.ts): soft ellipses (`exp(-d^(2 power))`, never an edge) inside which the baked colour goes toward a
  mist tone, `backOnly` keeping part of it off the walk plane, `floor` ending it at her feet. The GLSL is
  generated from `info.mist` at bake time: free at runtime. Shadowed planes stay a step darker under it
  (`mistForm`) or the prop turns to frosted glass.
- Who adds pools: every lantern, lamp and the heart (`TERRAIN.standMist`, the deep tone is a cool grey, not her
  violet; the heart's is 1.8x tall for the 300 px shrine), every kick wall's foot, and every kick wall's face
  (`TERRAIN.faceMist`). **`?nopickups` strips lanterns and lamps, so the clean-plate shots have no stand pools**:
  judge with `--pickups`.
- The far bluff is always in the right 15% of the frame (the camera clamps at x 4800), i.e. under ~50% vignette:
  its face mist (0x66638a, 0.6) is set for that and looks bright in an unclamped `cam()` override.
- Measured (final frame, `--pickups`, her body luma 27-38; "behind" = mean luma under her silhouette with the
  character layer hidden; before -> after): lantern boulder 43-45 -> 51-54; bluff foot 21-23 -> 81-83; shrine
  22 / 28 / 6 -> 33 / 36 / 26 with the ring round her 47 / 35 / 18 -> 63 / 51 / 50; last of the rise 22 / 4 / 17
  -> 48 / 59 / 58; lamp-root 26 -> 38 (ring 50 -> 77); on the far bluff's face 5 / 4 / 6 -> 55 / 54 / 43, the face
  itself 50-57; on the bluff's west face 14 -> 61. Unchanged on purpose: the shaft (36, glints need its dark)
  and the last 80 px under the high ledge's branch on trunk A (19: mid's canopy bough behind the ledge). Method: scratch script that shoots each spot twice (`__bg.layers.get('character').visible`).
- `bellyShade` (pf-islands.ts) is a TINT, and a tint lands on any body behind it: it ran 260 px below each
  island as a ruled box, and when F7 moved over the shrine it cut the wing-stone along a straight line at y 900
  (F3 did the same to the moth-stone at 1012). It ends 16 px under the island's own body now.
- Pool: `WATER.lineGain` [line, glints, foam] 0.24 / 0.5 / 0.2 (was 1.05 / 1.9 / 0.75), line colour 0x9ccad6,
  `shallow` / `skyNear` a third darker, sky mirror 0.8 -> 0.55, caustics and bank glow halved. After post, no
  pickups, hero out of the water: surface band (y 1352-1366) mean 104 -> 93, p99 189 -> 166, max 220 -> 198;
  whole pool mean 77 -> 69, p99 168 -> 151. What is left in the band is not the water shader (the last three
  cuts moved nothing): it is the air layer's ground mist and beam pool lying on the surface, and the lily.

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
  350 px carved moth-stone by the pool; five cocoons under the high ledge (any `ledge` solid: they vanished when
  the ledge stopped touching trunk A); shrine at the right, exactly behind the heart.
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
- `FIGHT_SPOTS` = burr-path 2004-2316 and burr-root 4160-4608 (the terrace entry is gone with burr-rise).
- (Superseded for the bluff's WEST face and the far bluff by "Kick walls" above: those have no buttress or bank
  at all. The tall-step treatment still dresses the bluff's east face and the rise's west face.)
- The vines' leaf knots (`leafKnot`) hang from limbs that start above `viewTop(scene)` (passed to
  `growGarden` as `skyTop`); they began 330 px up, and with the camera's headroom two of them showed as a
  sawn-off X over F7 (5260, -150). All knots of one island lean the same way.

## After the second layout pass, 2026-10-14 (trunks to 1168, the well, boughs off trunk B)
- **Shaft trunks** (`shaftSide`: flanks within `TERRAIN.shaftGap` of another trunk). The inner flank is a
  wall: silhouette wobble 2 px instead of 7 + flare, no burls, plates, moss, fungi or ivy on it (`Face.clean`),
  vines dive under the bark 20 px short of it, the cap's drape is 16 px. `paintKickWall`: runs of bark rubbed a
  shade paler down the edge and, every 118-164 px, a scuff with 3-4 claw strokes (`TERRAIN.scuff`) and torn
  moss under it. The scuff patch must stay in bark tones: at `barkLit` + pale wood, 13 x 30 px, it read as a
  row of seed pods stuck on the trunk.
- **Doorways** (`TERRAIN.lowDoor`: gap under a hanging trunk < 180): `stiltRoots` gives squat feet instead
  of the arch. Each main root leaves from UNDER its corner (inset 20-27% of the width, at the bottom edge), so
  the flank above is plain wall down to the collision bottom; the shaft-side foot is short (46-60 px, the
  outer 84-112). Underside sag halved, and nothing hangs more than ~34 px into the doorway (`Under.reach`).
- **The well** (`wellStep`: a trunk within `FORMS.narrowRun` of a step's foot; the ground rect is one, so its
  width says nothing). The generic step filled it: the buttress toe (even the tall-step column, 50-74 px on a
  128 px face) and the back bank were a lit ramp from the lip to the lamp's foot. There the root clings to the
  face (toe 18-26, 0.6 girth, relief 0.5, `lit` 0.06), the bank is `narrowBank` 0.26 of the run, one foot stone.
- **Boughs of a trunk** (`boughHost`: a one-way starting within `boughReach` 140 px east of a trunk's flank,
  below its top, or ending at a trunk's crown, `.west`): no sapling; the limb grows from the flank in the host's wood (zone of the trunk, not of the
  tip). Flush (the summit bough): it starts 22 px inside the flank under a bark `collar`, the cap has no drape
  on that side (`joinedR`). With a gap (the catch branch, 96 px): arm and bough are ONE `limb` outline, the arm
  leaving the flank `gap * 1.7` px lower, climbing steeply and levelling 14 px before the walk line starts,
  with shade over the arm. Two pieces joined at the elbow showed a sawn pale end.
- **Clear spots** (`info.clearSpots`: lanterns 76 px, lamps 84, sitting pods 40): rear shrubs, hero plants,
  features, reeds and front clumps there are grown **muted** (`FloraBuilder.mute` drops the triangles), so the
  random sequence and every other plant on that top stay put. Use `mute` for any new exclusion; a `continue`
  reshuffles the top. `keepClear` takes an optional y (only tops near it); the trunk pair's entry now runs from
  trunk A's west face to 30 px past trunk B (the doorways too: a grass clump under B hid her at the hollow's lip).
- **`?nopickups` strips lanterns, lamps and pods from the scene**, so the clean-plate shots show plants where
  the game has clear spots (the bush in the well). Judge those with `--pickups`.
- `info.covered` (ground under a `root` solid): no grass, lip, fringe or humps across the mound's front; its
  foot is a ragged shadow and six root toes going down through the ground's lit band (which ruled a pale block).
- Foot stones sink into the earth tone with the sun on them (`FORMS.footStoneSun`): the pale flat stone on the
  terrace (2783, 1150) was the bluff's third foot stone in a sun pool.

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
  stilt roots over it: keep great forms clear of x 3050-3750), anything dark and tall inside a kick wall's
  145 px swing (sapling, bank, buttress, hanging moss), a ledge painted as growing from a wall that is not there.
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
