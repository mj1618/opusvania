# Pixi v8 gotchas

Carried over from the old render pipeline (deleted; `git log -- memory/render-pipeline.md`) plus the
new skeleton. Add what bites you.

- **Resolution**: the canvas is backed at CSS size x devicePixelRatio and resized on window resize
  (`src/render/app.ts`, `renderer.resize(w, h, dpr)`); the stage root is scaled to logical 1920x1080
  units. Filters render to textures at the *filter's* resolution, not the canvas's: give filters
  `resolution: ctx.viewScale()`-ish values (and `antialias` where edges matter) or the picture goes
  soft. Rebuild size-dependent targets in `PostStage.resize()`.
- Changing `renderer.resolution` at runtime once crashed Pixi's filter stack (`_findFilterResolution` on a
  destroyed pooled texture). It happens here only when the window moves to a display with another
  devicePixelRatio; if it bites, recreate the filters in `resize()`.
- The canvas has MSAA (`antialias: true`), but anything inside a filter or render texture does not get it
  for free. Soft, gradient-edged shapes hide this better than hard ones.
- **Big BlurFilter kernels ghost**: strength ~40 at full resolution with kernel 5 gives discrete copies.
  Render what must glow to 1/4 and 1/8 size targets and blur there; cheaper too.
- `container.filters = []` leaves an empty filter effect; use `null` to remove (`PostStage.setFilters`).
- Rebind a filter's texture resource before destroying the old texture, or Pixi warns.
- GLSL: a uniform declared in both shaders needs the same precision (`uniform highp vec4 uInputSize` in
  the fragment), or the program fails to link.
- `renderer.render({container, target, transform})` on a container that has a parent works (it detaches
  temporarily); the container becomes a render group.
- Filter coords to another texture's UVs: `filterManager.calculateSpriteMatrix(matrix, sprite)` with an
  unrendered screen-size sprite (DisplacementFilter's trick) is robust to nested filter frames.
- One fused post pass is cheaper than chained filters; we do not use `pixi-filters`.
- `FillGradient` (`type: 'linear', textureSpace: 'local'`, 0..1 start/end) works for flat gradients on
  Graphics (see `scene/layers/sky.ts`).
- **Headless Chromium uses SwiftShader** (software GL) by default, even on macOS: slow, and it can render
  shaders differently. `tools/lib/browser.ts` passes `--use-angle=metal --enable-gpu`; `__game.info().gpu`
  says what you got. The e2e smoke runs on software GL on purpose (CI has no GPU): keep it tiny.
- Biome flags a function named `fit()` as a focused test (`noFocusedTests`). Hence `fitWindow`.
