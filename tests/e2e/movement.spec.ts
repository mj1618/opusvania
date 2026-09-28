import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { runTape, type TapeFile } from '../../src/debug/tape';
import { installBuildInfo } from '../../tools/lib/build-info';

installBuildInfo();

const DIR = join(import.meta.dirname, '../replays');
const TAPES = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as TapeFile);

async function boot(page: Page, query: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(query);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__game);
  return errors;
}

/**
 * movement-spec §7.3 (3): the same tape in Node and in Chrome gives identical hash sequences.
 * Runs every golden tape in the page's JS engine via tape.check (headless, no rendering: CI's
 * software GL renders at ~1 fps) and compares the 60-frame hashes and end hash with Node.
 */
test('golden gym tapes reproduce their Node hashes in the browser', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await boot(page, '?manual');
  const browser = await page.evaluate(
    (ts) =>
      ts.map((t) => {
        const c = window.__game.tape.check(t);
        return { hashes: c.hashes, hash: c.hash, failures: c.failures };
      }),
    TAPES,
  );
  for (const [i, t] of TAPES.entries()) {
    const node = runTape(t);
    expect(browser[i]?.failures, t.name).toEqual([]);
    expect(browser[i]?.hashes, t.name).toEqual(node.hashes);
    expect(browser[i]?.hash, t.name).toBe(node.hash);
  }
  expect(errors).toEqual([]);
});

test('a door in the hub leads into its room (Up), and presets/assists switch live', async ({ page }) => {
  await boot(page, '?manual');
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.input('R20 .20 U1 .30');
    const s = g.step(71);
    g.preset('hk');
    const hk = g.tuning.run.groundAccel;
    g.preset('opus');
    const a = g.assists({ coyote: false }).coyote;
    g.assists({ coyote: true });
    return { room: s.roomId, hk, a, cam: g.camera().x >= 0, abilities: g.abilities() };
  });
  expect(res.room).toBe('gym-01');
  expect(res.hk).toBeGreaterThan(100);
  expect(res.a).toBe(false);
  expect(res.cam).toBe(true);
  expect(res.abilities.dash).toBe(false);
});

/**
 * movement-spec §7.2: key press -> first rendered frame whose player position changed.
 * 40 trials at seeded sub-frame offsets, real-time mode. Assert p95 < 100 ms.
 */
test('end-to-end input latency p95 < 100 ms', async ({ page }) => {
  // 40 real-time trials; CI runners are slower than dev machines.
  test.setTimeout(90_000);
  // quality=low: this measures the input path, not fill rate. Headless Chromium renders with
  // SwiftShader, where the full pipeline takes ~60 ms a frame and would skip this test.
  await boot(page, '?room=gym-01&quality=low');
  // If the page can't even hold 20 fps (CI's software GL takes hundreds of ms per frame), this
  // would measure the rasterizer, not our input path. Skip there; it runs on dev machines.
  const frameMs: number = await page.evaluate(async () => {
    const ts: number[] = [];
    await new Promise<void>((done) => {
      const tick = (t: number) => {
        ts.push(t);
        if (ts.length < 31) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    const d = ts
      .slice(1)
      .map((t, i) => t - (ts[i] ?? t))
      .sort((a, b) => a - b);
    return d[Math.floor(d.length / 2)] ?? 0;
  });
  console.log(`median rAF interval ${frameMs.toFixed(1)} ms`);
  test.skip(frameMs > 50, `renderer too slow to measure latency (median frame ${frameMs.toFixed(0)} ms)`);
  const trials: Array<[number, number]> = await page.evaluate(async () => {
    const g = window.__game;
    const out: Array<[number, number]> = [];
    let seed = 7;
    const rnd = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const key = (type: 'keydown' | 'keyup', code: string) => {
      const e = new KeyboardEvent(type, { code, bubbles: true });
      window.dispatchEvent(e);
      return e.timeStamp;
    };
    await wait(300);
    for (let i = 0; i < 40; i++) {
      const code = i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
      await wait(100 + rnd() * 16.7);
      const x0 = g.renderState().x;
      const t0 = key('keydown', code);

      // [ms, rendered frames] until the drawn position changes.
      const t1 = await new Promise<[number, number]>((resolve) => {
        let frames = 0;
        // performance.now(), not the rAF timestamp: that is the frame's begin time, which can
        // precede a key dispatched mid-frame (negative latencies).
        const probe = () => {
          frames++;
          const now = performance.now();
          if (g.renderState().x !== x0 || now - t0 > 500) resolve([now, frames]);
          else requestAnimationFrame(probe);
        };
        requestAnimationFrame(probe);
      });
      out.push([t1[0] - t0, t1[1]]);
      await wait(60);
      key('keyup', code);
    }
    return out;
  });
  const pct = (xs: number[], q: number) =>
    [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * q) - 1] ?? Infinity;
  const ms = trials.map((t) => t[0]);
  const frames = trials.map((t) => t[1]);
  const p95 = pct(ms, 0.95);
  // Headless Chrome produces a frame right after timer tasks, so ms reads low there; the frame
  // count (key -> first rendered frame showing the move) is the robust part of this check.
  console.log(
    `latency p50 ${pct(ms, 0.5).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, frames p95 ${pct(frames, 0.95)} (+1 vsync display estimate)`,
  );
  expect(pct(frames, 0.95)).toBeLessThanOrEqual(2);
  expect(p95).toBeLessThan(100);
});
