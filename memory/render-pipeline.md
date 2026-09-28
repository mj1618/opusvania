# Render pipeline (src/render/gfx)

Code-drawn only (no art yet). `WorldRenderer` owns `gfx: GfxPipeline`; the layer tree is documented at
the top of `src/render/gfx/pipeline.ts`. Render never writes sim state; the e2e test records a replay
while switching tiers and verifies it headless.

- **Files:** `pipeline.ts` wiring and per-frame draw; `backdrop.ts` seeded parallax boomtown (far0-2 + mid
  baked into low-res RTs once per room, fg drawn live); `terrain.ts` playfield tiles, depth shading, lit
  rims, emissive copies, auto lights and hanging lamps; `lighting.ts` light map + LightingFilter;
  `light-model.ts` pure light maths; `post.ts` BloomPass + PostFilter (GLSL); `ambient.ts` pure particle
  model, `particles.ts` its ParticleContainer view; `dressing.ts` Zod schema/loader; `palette.ts`
  districts + `NOISE_COLOURS`; `quality.ts` tiers; `perf.ts` HUD + draw-call counter; `clock.ts`.
- **Determinism:** every time-based effect reads the render clock (`sim frame - 1 + alpha`) or state
  stepped in `Game.afterStep` (particles, juice). Grain is seeded by the frame. `Juice.reset()` reseeds
  its RNG, so restoring a snapshot re-renders identically (tests/e2e/gfx.spec.ts relies on it).
- **Dressing** (`content/rooms-dressing/<id>.json`): render-only, never read by the sim. Resolution
  `default` -> family (`gym` for `gym-NN`) -> room, section by section. Light `at` is in sketch tiles
  (before padding), like cameraZones. Districts: brown, pink, violet, white. New rooms fall back to
  `default` (brown); give them a file to pick a district.
- **Hooks for other render code:** world-space `gfx.layers.actors` (unlit, above the lit playfield,
  still post-graded: L3 sources/enemies, the player, front juice); `gfx.layers.emissive` (unlit, additive, blooms);
  `gfx.lights.providers.add((out, clock) => out.push({x, y, radius, color, intensity, flicker}))`;
  `gfx.layers.playfield` (= `renderer.world`, lit); `NOISE_COLOURS` for hum colours.
- **Value structure (the look):** sky/fog mid-dark, far layers close to fog, mid a bit darker, terrain
  darkest with bright top rims, player brightest + carried light. Warm lamps vs cool ambient per district.
- **Readability rules learned by looking:** anything the player must read (hums, ghosts, telegraphs)
  goes in `actors`, never under the light map (L3 E1 failed when it was lit); nothing horizontal and dark in the mid layer (pipes and
  hanging signs read as platforms, gym-09); the mid layer is unlit (lit, it went as dark as terrain and
  its pillars read as walls); foreground occluders only hang from the top (bottom ones hid spikes, gym-12);
  particles are hidden over solid tiles (embers over rock read as stars); heavy far-layer blur made the
  skyline mush, so blur is light (2.5 / 1.2 / 0.6 px).

## Gotchas
- **Big BlurFilter kernels ghost**: strength ~40 at full res with kernel 5 gives discrete copies. Bloom
  renders the emissive layer to 1/4 and 1/8 res targets and blurs there (`BloomPass`), which is also cheap.
- **Changing `renderer.resolution` at runtime crashed Pixi's filter stack** (`_findFilterResolution` on a
  destroyed pooled texture after text textures were rebuilt). Low tier's render scale is an AlphaFilter
  with `resolution: 2/3` on the scene instead; nested filters inherit it.
- Setting `container.filters = []` leaves an empty filter effect; use `null` to remove.
- Rebind a filter's texture resource before destroying the old texture (light map resize), or Pixi warns.
- GLSL: a uniform declared in both shaders needs the same precision (`uniform highp vec4 uInputSize` in
  the fragment), or the program fails to link.
- `renderer.render({container, target, transform})` on a container that has a parent works (it detaches
  temporarily); the container becomes a render group.
- Filter coords to light-map UVs: `fm.calculateSpriteMatrix(matrix, screenSprite)` with an unrendered
  screen-size sprite of the light map (DisplacementFilter's trick), robust to nested filter frames.

## Perf (bench = `__game.gfx.bench(n)`, frame forced to finish with a 1-px readPixels)
- Apple M5 Pro (ANGLE Metal): low 0.7 / med 1.3 / high 1.2 ms median, p95 1.1 / 2.3 / 2.3; ~13/28/32 draws.
- Headless Chromium uses **SwiftShader** by default (also locally on macOS): high ~55-60 ms, low ~26 ms.
  `tests/e2e/perf.spec.ts` launches with `--use-angle=metal` (darwin) and skips on software GL.
  The latency test boots `quality=low` so it is not skipped for fill rate. Canvas `antialias` is off:
  filtered layers never used MSAA anyway, and MSAA on the canvas cost SwiftShader a lot.
- Screenshot goldens: `tests/e2e/__screenshots__/gfx.spec.ts/*.png` (gym-01, gym-05, gym-11, lot-7, the-pit) (no platform suffix; fails above 1% of
  pixels off by YIQ 0.2). After a visual change: `npx playwright test gfx --update-snapshots=all`, then
  look at them. Plain `--update-snapshots` only rewrites goldens that fail, so a change under the
  tolerance silently keeps the old picture. Goldens were made on macOS ARM SwiftShader; CI is x86
  SwiftShader. If CI alone fails them, compare the CI diff artifact before loosening the tolerance.
