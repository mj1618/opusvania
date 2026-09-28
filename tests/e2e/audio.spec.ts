import { expect, type Page, test } from '@playwright/test';

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('?manual');
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__game?.audio);
  return errors;
}

test('audio is locked until a gesture, then sim events play sounds', async ({ page }) => {
  const errors = await boot(page);
  expect((await page.evaluate(() => window.__game.audio.stats())).state).toBe('locked');

  // Events before unlock are routed but silent (and never throw).
  await page.evaluate(() => {
    window.__game.input('_*20 jump*10 _*40');
    window.__game.step(70);
  });

  await page.locator('canvas#game').click();
  await expect.poll(() => page.evaluate(() => window.__game.audio.stats().state)).toBe('running');

  // Record a replay while audio is live; replaying it headless (no audio) must match exactly.
  const verified = await page.evaluate(() => {
    const g = window.__game;
    g.replay.record();
    g.input('R20 R+J12 R40 .30');
    g.step(102);
    const r = g.replay.stop();
    return r ? g.replay.verify(r).matches : false;
  });
  expect(verified).toBe(true);
  const stats = await page.evaluate(() => window.__game.audio.stats());
  expect(stats.room).toBe('hub');
  // Sounds come from the sim's own events: jump, land and footsteps (step events).
  expect(stats.playedByName.jump).toBeGreaterThanOrEqual(1);
  expect(stats.playedByName.footstep).toBeGreaterThanOrEqual(1);
  expect(stats.recent.some((e) => e.type === 'land' && e.played)).toBe(true);
  expect(stats.recent.some((e) => e.type === 'step' && e.played)).toBe(true);

  // Hums, seize and levy work through the debug API.
  const id = await page.evaluate(() => window.__game.audio.hum('brown', 1000, 1000));
  expect(id).toBeTruthy();
  expect(await page.evaluate((i) => window.__game.audio.seize(i as string), id)).toBe(true);
  expect((await page.evaluate(() => window.__game.audio.stats())).hums[0]?.status).toBe('carried');
  expect(await page.evaluate(() => window.__game.audio.mute(true))).toBe(true);
  expect(await page.evaluate(() => window.__game.audio.mute(false))).toBe(false);
  expect(errors).toEqual([]);
});

test('offline renders are audible and do not clip', async ({ page }) => {
  await boot(page);
  const results = await page.evaluate(() =>
    window.__game.audio.render(['sfx/jump', 'sfx/landHard', 'hum/pink', 'levy/brown', 'ambience/hub']),
  );
  expect(results).toHaveLength(5);
  for (const r of results) {
    expect(r.stats.silent, r.name).toBe(false);
    expect(r.stats.clipped, r.name).toBe(0);
    expect(r.stats.peakDb, r.name).toBeGreaterThan(-40);
  }
});
