import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import type { GoldenReplay } from '../replays/golden';

const DIR = join(import.meta.dirname, '../replays');
const REPLAYS = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as GoldenReplay);

async function boot(page: Page, query: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(query);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__game);
  return errors;
}

/** movement-spec §7.3 (3): the same replay in Node and in Chrome gives identical hash sequences. */
test('golden gym replays reproduce their Node hashes in the browser', async ({ page }) => {
  test.setTimeout(120_000);
  for (const r of REPLAYS) {
    const errors = await boot(page, `?manual&seed=${r.seed}&room=${r.room}`);
    const got = await page.evaluate(
      ({ inputs, abilities, frames }) => {
        const g = window.__game;
        g.abilities(abilities);
        g.input(inputs);
        const hashes: string[] = [];
        let f = 0;
        while (f + 60 <= frames - 1) {
          g.step(60);
          f += 60;
          hashes.push(g.hash());
        }
        const before = g.step(frames - 1 - f).roomStats.goal;
        const after = g.step(1).roomStats.goal;
        return { hashes, goal: !before && after ? frames : -1 };
      },
      { inputs: r.inputs, abilities: r.abilities, frames: r.expect.goalFrame },
    );
    expect(got.goal, r.room).toBe(r.expect.goalFrame);
    expect(got.hashes, r.room).toEqual(r.expect.hashes);
    expect(errors).toEqual([]);
  }
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
    const a = g.assists.set('coyote', false).coyote;
    g.assists.set('coyote', true);
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
  await boot(page, '?room=gym-01');
  const lat: number[] = await page.evaluate(async () => {
    const g = window.__game;
    const out: number[] = [];
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
      await wait(200 + rnd() * 16.7);
      const x0 = g.renderState().x;
      const t0 = key('keydown', code);
      const t1 = await new Promise<number>((resolve) => {
        // performance.now(), not the rAF timestamp: that is the frame's begin time, which can
        // precede a key dispatched mid-frame (negative latencies).
        const probe = () => {
          const now = performance.now();
          if (g.renderState().x !== x0 || now - t0 > 500) resolve(now);
          else requestAnimationFrame(probe);
        };
        requestAnimationFrame(probe);
      });
      out.push(t1 - t0);
      await wait(120);
      key('keyup', code);
    }
    return out;
  });
  const sorted = [...lat].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  console.log(`latency p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms (+1 vsync display estimate)`);
  expect(p95).toBeLessThan(100);
});
