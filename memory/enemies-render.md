# Enemies, render side: the burrback (`src/render/enemies/`)

Rules and state fields: enemies.md. Sheets: `shots/burr/*.png` (made with one `playwright-cli eval`
per sheet: step, `drawImage` the WebGL canvas into a 2D grid, return one data URL).

## How it is wired
- Layer `enemies` (layer-tree.ts): AFTER `playfieldFront`, before `foreground`: in front of the grass
  fringe (behind it the legs could not be seen at game size) and so also in front of her and of the
  glints. Not in the hero matte: it takes the zone grade and her light like the plants do.
- `EnemyRenderer.update(dt, clock, cam, sim)` from stage.ts. Reads `sim.enemies`, `sim.frame`,
  `sim.alpha`, `sim.player` (where to look, how near her light is), no events: a hit is a new
  `hitFrame`, death is `mode: 'dead'`, so `load()` and re-form just show. Dev handle
  `window.__enemies` (`cfg` = `BURR` in config.ts, `cpuMs`, `drawn`, `verts`, `recolor()`).
- `?nopickups` also empties `scene.enemies` (src/main.ts): shots / clip / look:stats are clean
  plates; `--pickups` shows glints, pods and enemies.
- One mesh (`paint.ts`, a copy of Vesper's painter with caller-set bounds) for all six and their
  debris. ~2000 vertices and ~0.05 ms per creature on screen; off-screen ones only step their springs.

## The creature
- Drawn x = `x + w/2 + rx`, interpolated by `sim.alpha`; legs run on `stride + rx * facing`. Integer
  `x` alone stutters (1.6 px/f = steps of 1, 2, 2, 1...).
- `gait.ts` is pure and tested (`tests/unit/enemies-render.test.ts`): tripod, stance 58% of a 30 px
  cycle, 6 px lift; a planted foot's offset shrinks 1 px per px walked, so it cannot slide.
- Turn factor `d` (-1..1). It always turns AWAY from the camera: the head (`dHead`, leads) ducks
  behind the shell, mid-turn we see the dome from behind with three legs each side. Flank things
  (lights, cracks, seams) fade by `|d|`. Legs belong to a body side: their shade follows `side * d`.
- Body transform (`setBody`): squash, then rotation about the middle of its height, so a half turn
  (death) lays the dome exactly on the ground. Planted feet are world points and skip it.
- Silhouette (`SPIKES`): a short upturned brow horn, three blunt ridge burrs, a raised tail lip, all
  drawn under the shell so their bases are hidden. Thin pointed ones read as a sea mine.
- Face (`drawHead`, called twice): under the shell with the feelers (so a turn hides it), and again
  over the brow as a mid-grey plate (`faceK` fades it in once the head has come round). Two blank
  pale eyes that SLIDE on the plate toward what it watches (`rig.lookX/Y`: ahead on the walk, at her
  while `alert` / `hurt`), widen when wary, blink. Pupils read as a toy; a pale plate read as an egg
  and swallowed the eyes: the plate must stay well darker than the eyes.
- Death: dark / pale snap, cracks wide, roll onto its back along the blow by frame 6 (22 px hop),
  legs curl, lights wink out front to back, it bursts at frame 9 (about 12 after the blow, while the
  spilled glints hang): `burst()` throws 8 plates (10 and x1.45 further for a finisher) with a paler
  inner face, one bounce, plus a dust puff and a few motes. After the burst the body is not drawn
  (the sim keeps it 30 frames).

## Look decisions (from looking)
- Flank lights: source colours must be deep and saturated (0x1fb4d8 / 0xf0a030 / 0x8a4cf0) to come
  out cyan / amber / violet after the grade; paler sources all went near-white. Radii 1.25-1.8.
- The dome's top edge takes a thin rim in the zone's light (`edgeColor`, the painter's key colour).
- The hit pop is 2 dark frames then ~2 frames mixed 55% toward 0x7d6873. Weaker cannot be seen at
  zoom 1; paler or longer is a washed ghost at close range.
- Right beside her everything is 20% darker (`nearHero`): her light gain lifts it otherwise.
- Fringe as 11 wide tufts read as teeth; 17 narrow dark ones read as a mossy skirt.
- Cracks are thin lines a step lighter than the shell; more than four made a tortoise pattern.
- Rim height 12 / dome 22: taller legs (rim 14) turned it into a spider.
