/**
 * The render leak check (memory/world.md "Render lifecycle"): boots a room in the dev server on the
 * real GPU, then swaps rooms 20 times with `__game.goto` and prints, after a forced GC, the JS heap,
 * ArrayBuffer backing store and what the GPU holds (`__game.debug.gpu()`: textures, their MB,
 * buffers). Flat numbers = no leak. Painted rooms are the heavy ones; the e2e (tests/e2e/world.spec.ts)
 * covers greybox swaps in software GL.
 *
 *   npm run leak                                    # wood-hatch <-> lab-world-a
 *   npm run leak -- --room test-grove --cycle lab-world-a,test-grove --swaps 10
 */
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { DEFAULT_URL } from './lib/browser';

const { values: args } = parseArgs({
  options: {
    room: { type: 'string', default: 'wood-hatch' },
    cycle: { type: 'string', default: 'lab-world-a,wood-hatch' },
    swaps: { type: 'string', default: '20' },
    url: { type: 'string', default: DEFAULT_URL },
  },
});
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(`${args.url}/?room=${args.room}&manual`);
await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 60000 });
const cdp = await page.context().newCDPSession(page);
const measure = async (tag: string): Promise<void> => {
  await page.evaluate('__game.step(2)');
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const u = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number; backingStorageSize?: number };
  const gpu = (await page.evaluate('__game.debug.gpu()')) as Record<string, number>;
  console.log(
    `${tag.padEnd(34)} heap ${Math.round(u.usedSize / 1e6)} MB  buffers(backing) ${Math.round((u.backingStorageSize ?? 0) / 1e6)} MB  gpu textures ${gpu.textures} (${gpu.textureMB} MB)  gpu buffers ${gpu.buffers}`,
  );
};
await measure(`boot ${args.room}`);
const cycle = (args.cycle ?? '').split(',');
const n = Number(args.swaps);
for (let i = 0; i < n; i++) {
  const id = cycle[i % cycle.length] as string;
  const t0 = performance.now();
  await page.evaluate(`__game.goto('${id}')`);
  const ms = Math.round(performance.now() - t0);
  if (i < 4 || i % 5 === 4 || i === n - 1) await measure(`swap ${i + 1} -> ${id} (${ms} ms)`);
}
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
