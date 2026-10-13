# Enemies, render side: the burrback (`src/render/enemies/`)

Rules and state fields: enemies.md. Sheets: `shots/burr/*.png` (made with one `playwright-cli eval`
per sheet: step, `drawImage` the WebGL canvas into a 2D grid, return one data URL).

## How it is wired
- Two layers, two meshes (`painter`, `front`). `enemies` (before `character`): the whole body, so
  she and the glints pass in front of it and the grass fringe crosses the shell's lower edge.
  `enemiesFront` (after `playfieldFront`): each leg again from the rim line down (same geometry,
  clipped at `rig.y - rimH + 2`, so no join shows), dust, chips and the death plates. With the body
  alone behind the grass the legs could not be seen at game size; with everything in front it drew
  over her. Not in the hero matte: it takes the zone grade and her light like the plants do.
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

## The lampwing (`lampwing.ts`, `LAMP` in config.ts)
- Drawn in the back painter (`enemies` layer, behind her); its scales are debris in the front one.
  `index.ts` dispatches on `e.kind`; rigs are per kind, by enemy index (`rigs`, `lamps`).
- Front view: body in the middle, a fore and a hind wing to either side. Centre = `x + w/2 + rx`,
  `y + h/2 + ry`, interpolated by `sim.alpha`; `flap` is interpolated the short way round its wrap.
- Beat: wing angle = mid + amp x sin(2 pi flap) between `down` (-0.5 rad) and `up` (1.05); the hind
  pair lags 0.13 of a beat and hangs 0.62 rad lower; the chord narrows on the upstroke (`twist`);
  the body bobs with the sine. `turn` (eased `facing`) shortens the wing pair on the side it faces.
- Dusky wing margins without extra geometry: for the wings the painter's key and cool colours are
  set to the dusk tone with `coolWrap` 1 and rim 1, so the rim band IS the margin (restored after).
- Wing outlines are rounded once at load (Catmull-Rom, 3 points per corner): raw 8-point polygons
  looked low-poly at zoom.
- Modes: `keen` (curious / pursue: lamp x1.45, antennae and head toward `lookX/Y`, a 2.4 px noise
  wobble on top of the sim's path), `slack` (rest / return: smaller stroke, drooping antennae),
  `hurt` = one full turn end over end along `hitDir` through the 16 frames with wings 70% folded and
  a few scales shed, `dead` = folded, greying, rocking like a leaf as it falls (render-only sideways
  slip), flat on its side when `landed`; when `gone` first shows it dissolves into 14 scales (20 for
  a finisher) where it was last drawn.
- Look decisions: source tints must be mid-values (wing 0x76899c / 0xa39678 / 0x847b96): the first
  pass at ~0xb0 came out near-white. A round dark face with 0.85 px eyes read as a cartoon bee: the
  face is a narrow tall mask with two 0.5 px pinpricks set low and close. Lamp radius 1.5, halo 0.18.
