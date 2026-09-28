import { expect, type Page, test } from '@playwright/test';
import type { GameState } from '../../src/sim/index';
import { type Replay, runReplay } from '../../src/sim/replay';

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

test('boots, steps 60 frames via window.__game and reads state back', async ({ page }) => {
  const errors = await boot(page);
  const s0 = await page.evaluate(() => window.__game.state());
  expect(s0.frame).toBe(0);
  expect(s0.roomId).toBe('gym');

  const s60: GameState = await page.evaluate(() => window.__game.step(60));
  expect(s60.frame).toBe(60);
  expect(s60.player.grounded).toBe(true);
  expect(await page.evaluate(() => window.__game.mode())).toBe('manual');

  // Manual mode: the real-time loop must not advance the sim on its own.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.state().frame)).toBe(60);

  // Scripted input moves the player.
  await page.evaluate(() => window.__game.input('right*30'));
  const s90: GameState = await page.evaluate(() => window.__game.step(30));
  expect(s90.player.x).toBeGreaterThan(s60.player.x + 200);

  expect(errors).toEqual([]);
});

test('renders with WebGL and screenshot() returns a PNG', async ({ page }) => {
  await boot(page);
  expect((await page.evaluate(() => window.__game.info())).renderer).toBe('webgl');
  const png = await page.evaluate(() => window.__game.screenshot(0.25));
  expect(png.startsWith('data:image/png;base64,')).toBe(true);
  expect(png.length).toBeGreaterThan(1000);
  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box && Math.round((box.width / box.height) * 100)).toBe(178);
});

test('load() switches rooms and spawns', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => window.__game.rooms())).toEqual(expect.arrayContaining(['gym', 'hall']));
  const s = await page.evaluate(() => window.__game.load('hall', 'a'));
  expect(s.roomId).toBe('hall');
  expect(await page.evaluate(() => window.__game.seed())).toBe(1);
});

test('a replay recorded in the browser reproduces the same hash in Node', async ({ page }) => {
  await boot(page, '?manual&seed=777');
  const replay: Replay | null = await page.evaluate(() => {
    const g = window.__game;
    g.step(5);
    g.replay.record();
    g.input('right*25 right+jump*16 right*30 left+jump*10 _*50 jump*4 _*40');
    g.step(175);
    return g.replay.stop();
  });
  expect(replay).not.toBeNull();
  if (!replay) return;
  const browserHash = await page.evaluate(() => window.__game.hash());
  expect(replay.endHash).toBe(browserHash);
  const node = runReplay(replay);
  expect(node.hash).toBe(browserHash);
  expect(node.matches).toBe(true);

  // Playing it back in the browser lands on the same hash too.
  const played = await page.evaluate((r) => {
    const g = window.__game;
    const n = g.replay.play(r);
    g.step(n);
    return g.hash();
  }, replay);
  expect(played).toBe(browserHash);
});

test('real-time mode advances on its own', async ({ page }) => {
  await boot(page, '');
  const f0 = await page.evaluate(() => window.__game.state().frame);
  await page.waitForTimeout(500);
  const f1 = await page.evaluate(() => window.__game.state().frame);
  expect(f1).toBeGreaterThan(f0 + 10);
});

test('replays survive load(), seed() and tuning edits mid-recording, in the browser and in Node', async ({
  page,
}) => {
  await boot(page, '?manual&seed=5');
  const replay: Replay | null = await page.evaluate(() => {
    const g = window.__game;
    g.replay.record();
    g.input('right*20 right+jump*10 _*20 left*30');
    g.step(15);
    g.load('hall', 'a');
    g.step(15);
    g.tuning.jump.gravity = 2500;
    g.step(15);
    g.seed(42);
    g.step(35);
    return g.replay.stop();
  });
  if (!replay) throw new Error('no replay');
  expect(runReplay(replay).matches).toBe(true);
  const played = await page.evaluate((r) => {
    const g = window.__game;
    g.tuning.jump.gravity = 9999; // playback must use the replay's tuning, not the live one
    g.load('gym');
    const n = g.replay.play(r);
    g.step(n);
    return { hash: g.hash(), room: g.state().roomId };
  }, replay);
  expect(played).toEqual({ hash: replay.endHash, room: 'hall' });
  await expect(page.evaluate(() => window.__game.step(1.5))).rejects.toThrow(/non-negative integer/);
});
