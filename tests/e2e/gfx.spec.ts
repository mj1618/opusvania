import { expect, type Page, test } from '@playwright/test';

/**
 * Render pipeline checks (memory/render-pipeline.md):
 * - render determinism: the picture is a function of the sim frame (render clock), so the same
 *   inputs from a fresh load give identical pixels;
 * - screenshot regression: canonical rooms at a fixed frame vs goldens in tests/e2e/__screenshots__
 *   (update with `npx playwright test gfx --update-snapshots` after an intended visual change);
 * - the gfx debug API, quality tiers and render-only dressing.
 */

async function boot(page: Page, query = '?manual') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(query);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__game);
  return errors;
}

/** Loads a room, plays a fixed script and returns a half-size PNG at the final frame (UI text hidden). */
async function shot(page: Page, room: string, script: string, steps: number): Promise<Buffer> {
  const url = await page.evaluate(
    ({ room, script, steps }) => {
      const g = window.__game;
      g.gfx.set({ ui: false });
      g.load(room);
      g.input(script);
      g.step(steps);
      return g.screenshot(0.5);
    },
    { room, script, steps },
  );
  return Buffer.from(url.split(',')[1] ?? '', 'base64');
}

const CANON: Array<{ room: string; script: string; steps: number }> = [
  // Brown district, hanging lamps, parallax skyline; the player mid-run.
  { room: 'gym-01', script: 'R50', steps: 50 },
  // Violet district, goal beam and one-ways.
  { room: 'gym-05', script: 'R30 .20', steps: 50 },
  // White district, glowing spikes, respawn flag and goal; the player mid-jump.
  { room: 'gym-11', script: 'R20 R+J14', steps: 34 },
  // L3: Lot 7 after seizing the pink partition (humming brown furnace vs pink ghost, lit floor).
  { room: 'lot-7', script: 'R60 R+S1 R30', steps: 80 },
  // L3: the Pit, Barkers and the Grinder armed under the violet lamps.
  { room: 'the-pit', script: '.90', steps: 90 },
];

test('render is deterministic: the same sim state and inputs give identical pixels', async ({ page }) => {
  const errors = await boot(page);
  // Restoring a snapshot rebuilds the room (render state reseeds) at the same sim frame.
  const [a, b, c] = await page.evaluate(() => {
    const g = window.__game;
    g.gfx.set({ ui: false });
    g.load('gym-01');
    const s = g.save();
    const run = (n: number) => {
      g.restore(s);
      g.input('R50');
      g.step(n);
      return g.screenshot(0.5);
    };
    return [run(50), run(50), run(52)];
  });
  expect(a === b).toBe(true);
  expect(a === c).toBe(false);
  expect(errors).toEqual([]);
});

for (const c of CANON) {
  test(`screenshot matches golden: ${c.room} at frame ${c.steps}`, async ({ page }) => {
    // One software-GL frame can take a second on CI: allow for the load, bake and render.
    test.setTimeout(60_000);
    const errors = await boot(page);
    const png = await shot(page, c.room, c.script, c.steps);
    // Tolerance absorbs GPU/driver rounding (grain hash, blur); layout or colour changes exceed it.
    expect(png).toMatchSnapshot(`${c.room}.png`, { maxDiffPixelRatio: 0.01, threshold: 0.2 });
    expect(errors).toEqual([]);
  });
}

test('gfx API: quality tiers, toggles, stats, dressing and lights', async ({ page }) => {
  const errors = await boot(page, '?manual&quality=med');
  const r = await page.evaluate(() => {
    const g = window.__game;
    const start = g.gfx.quality();
    g.load('gym-07');
    g.step(5);
    const d = g.gfx.dressing() as { district: string; sources: string[]; lights: unknown[] };
    const stats = g.gfx.stats();
    const lights = g.gfx.lights();
    g.gfx.quality('low');
    const low = g.gfx.stats();
    g.gfx.quality('high');
    const toggles = g.gfx.set({ bloom: false, post: false });
    g.gfx.set({ bloom: true, post: true });
    g.gfx.hud(true);
    g.step(2);
    // The provider hook (what sound sources use): a light at the player shows up in the drawn set.
    const p = g.state().player;
    const before = g.gfx.lights().length;
    const withProbe = g.gfx.probeLight({ x: p.x, y: p.y, radius: 300, color: 0xff00ff, intensity: 1 });
    const probed = g.gfx.lights().some((l) => l.color === 0xff00ff);
    g.gfx.probeLight(null);
    return {
      start,
      d,
      stats,
      lights: lights.length,
      low,
      toggles,
      hud: g.gfx.hud(),
      room: g.state().roomId,
      probe: withProbe - before,
      probed,
    };
  });
  expect(r.start).toBe('med');
  expect(r.room).toBe('gym-07');
  expect(r.d.district).toBe('white');
  expect(r.d.sources).toEqual(['default', 'gym-07']);
  expect(r.d.lights.length).toBe(1);
  expect(r.lights).toBeGreaterThan(0);
  expect(r.stats.particles as number).toBeGreaterThan(r.low.particles as number);
  expect(r.toggles.bloom).toBe(false);
  expect(r.hud).toBe(true);
  expect(r.probe).toBe(1);
  expect(r.probed).toBe(true);
  await expect(page.evaluate(() => window.__game.gfx.quality('ultra'))).rejects.toThrow(/quality/);
  expect(errors).toEqual([]);
});

test('render never touches the sim: a replay recorded with every gfx path live verifies headless', async ({
  page,
}) => {
  await boot(page, '?manual');
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.load('gym-12');
    g.replay.record();
    g.input('R40 R+J20 R30 D+A1 .20');
    for (const q of ['high', 'low', 'med']) {
      g.gfx.quality(q);
      g.step(37);
    }
    const r = g.replay.stop();
    if (!r) throw new Error('no replay');
    return g.replay.verify(r);
  });
  expect(res.matches).toBe(true);
});
