import { expect, test } from '@playwright/test';

/**
 * Render benchmark (PLAN §4.3: CI fails if a benchmark room drops below budget). Renders a
 * representative room at each quality tier with every frame forced to finish on the GPU
 * (`__game.gfx.bench`), so the numbers are full CPU+GPU frame cost, independent of vsync.
 *
 * Needs a real GPU: headless Chromium defaults to SwiftShader (software GL), which measures the
 * rasterizer, not our pipeline, so the test skips there (as the latency test does). On macOS it
 * asks for ANGLE's Metal backend, which works headless.
 */
const GPU_ARGS: Record<string, string[]> = {
  darwin: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  win32: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  linux: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'],
};
test.use({ launchOptions: { args: GPU_ARGS[process.platform] ?? [] } });

/**
 * Budget for the whole render at each tier, p95, in ms. A 60 fps frame is 16.7 ms and the sim and
 * browser need their share; an M-series laptop measures ~1-1.5 ms, so these leave room for a
 * mid-range 2020 laptop GPU (roughly 5-8x slower) while still catching an accidental extra
 * full-screen pass per layer or a per-frame re-bake.
 */
const BUDGET_MS = { low: 6, med: 8, high: 10 } as const;

test('render benchmark: every quality tier holds its frame budget in the hub', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('?manual');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__game);
  const renderer = await page.evaluate(() => window.__game.gfx.bench(1).renderer);
  test.skip(
    /swiftshader|llvmpipe|software/i.test(renderer),
    `software GL (${renderer}): not a GPU benchmark`,
  );
  const results: Record<string, { median: number; p95: number; drawCalls: number }> = {};
  for (const q of ['low', 'med', 'high'] as const) {
    results[q] = await page.evaluate((q) => {
      const g = window.__game;
      g.gfx.quality(q);
      // The hub: the most lights and lamps, every backdrop layer, doors, particles; mid-run.
      g.load('hub');
      g.input('R60');
      g.step(60);
      return g.gfx.bench(120);
    }, q);
  }
  for (const [q, r] of Object.entries(results))
    console.log(
      `${q.padEnd(4)} median ${r.median.toFixed(2)} ms  p95 ${r.p95.toFixed(2)} ms  draws ${r.drawCalls}`,
    );
  console.log(`renderer: ${renderer}`);
  for (const q of ['low', 'med', 'high'] as const)
    expect(results[q]?.p95 ?? Infinity).toBeLessThan(BUDGET_MS[q]);
  // Draw calls stay batched: a regression here usually means a layer stopped batching.
  expect(results.high?.drawCalls ?? Infinity).toBeLessThan(60);
});
