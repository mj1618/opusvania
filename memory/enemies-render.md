# Enemies, render side: the burrback (`src/render/enemies/`)

Rules and state fields: enemies.md. Sheets: `shots/burr/*.png` (made with one `playwright-cli eval`
per sheet: step, `drawImage` the WebGL canvas into a 2D grid, return one data URL).

## How it is wired
- Layer `enemies` (layer-tree.ts): after `pickupsBack`, before `character`; so behind her, under the
  glints and under the `playfieldFront` grass. Not in the hero matte: it takes the zone grade and her
  light like the plants do.
- `EnemyRenderer.update(dt, clock, cam, sim)` from stage.ts. Reads `sim.enemies`, `sim.frame`,
  `sim.alpha` only, no events: a hit is a new `hitFrame`, death is `mode: 'dead'`, so `load()` and
  re-form just show. Dev handle `window.__enemies` (`cfg` = `BURR` in config.ts, `cpuMs`, `drawn`,
  `verts`, `recolor()` after editing `cfg.color`).
- `?nopickups` now also empties `scene.enemies` (src/main.ts), so shots / clip / look:stats are clean
  plates; `--pickups` shows glints, pods and enemies.
- One mesh (`paint.ts`, a copy of Vesper's painter with caller-set bounds) for all six and their
  debris. ~1800 vertices and ~0.04 ms per creature on screen; off-screen ones only step their springs.

## The creature
- Drawn x = `x + w/2 + rx`, interpolated by `sim.alpha` between sim frames; legs run on `stride + rx
  * facing`. Integer `x` alone stutters (1.6 px/f = steps of 1, 2, 2, 1...).
- `gait.ts` is pure and tested (`tests/unit/enemies-render.test.ts`): tripod, stance 62% of a 25 px
  cycle; a planted foot's offset shrinks 1 px per px walked, so it cannot slide.
- Turn factor `d` (-1..1). It always turns AWAY from the camera: the head (`dHead`, leads) ducks
  behind the shell, mid-turn we see the dome from behind with three legs each side, no draw-order
  swap needed. Flank things (lights, cracks, seams) fade by `|d|`. Legs belong to a body side, not to
  near/far: their shade follows `side * d`.
- Body transform (`setBody`): squash, then rotation about the middle of its height, so a half turn
  (death) lays the dome exactly on the ground. Planted feet are world points and skip it.
- Death: roll along the blow onto its back (10 frames, small hop), legs kick then curl, lights
  gutter one by one, shell splits in two halves from frame 13 that part and fade by 29; fragments
  and a few small motes at 13 and 20. The spilled glints are the pickup renderer's.

## Look decisions (from looking)
- The flank lights read as a row of eyes above ~1.5 px radius or at full colour: radii 0.95-1.4,
  colour x0.82, halo 0.22. The eyes (pale, 1.05 px) must stay dimmer than Vesper's face: 0xb3ad9e.
- Fringe as 11 wide tufts read as teeth; 17 narrow dark ones read as a mossy skirt.
- The hit pop is a mix toward a dark dusty mauve (0x54404b, 33%), after 2 dark frames. Mixing toward
  anything paler turned the whole creature into a washed pale ghost under the centre zone's grade.
- Cracks are thin lines a step lighter than the shell (dark-on-dark cannot be seen); more than four
  of them made a tortoise pattern.
- The front grass (~10 px) hides the legs on most ground: the walk reads through the shell's bob and
  rock, the feelers and the head. Rim height 11.5 is as high as it goes inside the 34 px box.
