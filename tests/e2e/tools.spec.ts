import { expect, type Page, test } from '@playwright/test';
import type { TraceFrame } from '../../src/debug/headless';
import { checkTape, makeTape, type TapeFile } from '../../src/debug/tape';
import { runReplay } from '../../src/sim/replay';
import { installBuildInfo, simFingerprint } from '../../tools/lib/build-info';

installBuildInfo();

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

test('trace, event log, save/restore and tuning helpers', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(() => {
    const g = window.__game;
    g.step(10);
    const saved = g.save();
    const hashAtSave = g.hash();
    const trace = g.trace(40, 'R10 R+J20 .10');
    const text = g.traceText(3);
    const log = g.eventLog();
    const events = g.events();
    g.restore(saved);
    const restored = g.hash() === hashAtSave;
    const before = JSON.stringify(g.tuning);
    g.setTuning({ jump: { gravity: 1234 } });
    const g1 = (g.tuning as unknown as { jump: { gravity: number } }).jump.gravity;
    g.setTuning('jump.gravity', 4321);
    const g2 = (g.tuning as unknown as { jump: { gravity: number } }).jump.gravity;
    let threw = false;
    try {
      g.setTuning('jump.nope', 1);
    } catch {
      threw = true;
    }
    g.resetTuning();
    return {
      trace,
      text,
      log,
      nEvents: events.length,
      restored,
      g1,
      g2,
      threw,
      reset: JSON.stringify(g.tuning) === before,
      preset: g.preset(),
      view: g.view(),
      targets: Object.keys(g.targets()),
    };
  });
  const trace = res.trace as TraceFrame[];
  expect(trace).toHaveLength(40);
  expect(trace[0]?.f).toBe(11);
  expect(trace[10]?.in).toBe('R+J');
  expect(trace.some((t) => t.ev.some((e) => e.type === 'jump'))).toBe(true);
  expect(res.text.split('\n')).toHaveLength(4);
  expect(res.log).toMatch(/jump/);
  expect(res.nEvents).toBeGreaterThan(1);
  expect(res.restored).toBe(true);
  expect([res.g1, res.g2, res.threw, res.reset]).toEqual([1234, 4321, true, true]);
  expect(res.preset.names.length).toBeGreaterThan(0);
  expect(typeof res.view.vx).toBe('number');
  expect(res.targets).toContain('spawn:default');
  expect(errors).toEqual([]);
});

test('replays carry build info; a mismatch explains itself', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.replay.record();
    g.input('R20 R+J10 .20');
    g.step(50);
    return g.replay.stop();
  });
  if (!r) throw new Error('no replay');
  expect(r.meta.sim).toBe(simFingerprint());
  expect(r.meta.sha).toMatch(/^[0-9a-f]{7,}/);
  expect(runReplay(r).matches).toBe(true);
  const older = { ...r, endHash: 'bogus', meta: { ...r.meta, sim: '0123456789' } };
  const v = await page.evaluate((x) => window.__game.replay.verify(x), older);
  expect(v.matches).toBe(false);
  expect(v.message).toMatch(/older build/);
});

test('tapes are identical in the browser and in Node (both directions)', async ({ page }) => {
  await boot(page);
  // Browser-recorded tape, checked in Node.
  const browserTape: TapeFile | null = await page.evaluate(() => {
    const g = window.__game;
    g.step(5);
    g.tape.record();
    g.input('R30 R+J14 R20 L+J10 .40');
    g.step(114);
    return g.tape.stop({ name: 'e2e' });
  });
  if (!browserTape) throw new Error('no tape');
  const browserHash = await page.evaluate(() => window.__game.hash());
  expect(browserTape.golden?.hash).toBe(browserHash);
  const node = checkTape(browserTape);
  expect(node.failures).toEqual([]);
  expect(node.golden).toBe('match');

  // Node-made tape, checked in the browser: same end hash and hash sequence.
  const room = (await page.evaluate(() => window.__game.rooms()))[0] as string;
  const nodeTape = makeTape('x', { room, seed: 4 }, '.10 R60 R+J20 .30 L+J12 .60 R+J8 .40', {});
  const inBrowser = await page.evaluate((t) => window.__game.tape.check(t), nodeTape);
  expect(inBrowser.failures).toEqual([]);
  expect(inBrowser.golden).toBe('match');
  expect(inBrowser.hashes).toEqual(nodeTape.golden?.hashes);

  // tape.play drives the live game to the same end state.
  const played = await page.evaluate((t) => {
    const g = window.__game;
    g.step(g.tape.play(t));
    return g.hash();
  }, nodeTape);
  expect(played).toBe(nodeTape.golden?.hash);
});

test('clip overlays: labelled screenshots and the motion trail render without errors', async ({ page }) => {
  const errors = await boot(page);
  const out = await page.evaluate(() => {
    const g = window.__game;
    g.debug.trail(true);
    g.debug.hitboxes(true);
    g.input('R20 R+J16 R20');
    g.step(56);
    const plain = g.screenshot(0.25);
    const labelled = g.screenshot(0.25, { label: true });
    return { plain: plain.length, labelled: labelled.length, on: g.debug.trail(false) };
  });
  expect(out.labelled).not.toBe(out.plain);
  expect(out.on).toBe(false);
  expect(errors).toEqual([]);
});
