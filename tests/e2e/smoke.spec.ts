import { expect, type Page, test } from '@playwright/test';

/**
 * The whole e2e suite: the game boots clean, the character moves, the debug API works. Keep it
 * small (CI renders with software GL); looks are judged with `npm run shots`, not asserted here.
 */
/** Boots paused in the test grove (the old demo level: its glints, enemies and coordinates), or in `query`'s room. */
async function boot(page: Page, query = '?manual&room=test-grove'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`./${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.body.dataset.error);
  expect(await page.evaluate(() => document.body.dataset.error)).toBeUndefined();
  return errors;
}

test('boots without errors and fills a 16:9 canvas', async ({ page }) => {
  const errors = await boot(page);
  const info = await page.evaluate(() => window.__game.info());
  expect(info.scene).toEqual({ id: 'test-grove', width: 5760, height: 1600 });
  expect(info.canvas.w / info.canvas.h).toBeCloseTo(16 / 9, 2);
  expect(info.canvas.w).toBe(1280);
  // Something was drawn: the canvas is not one flat colour.
  const png = await page.locator('#game').screenshot();
  expect(png.length).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});

test('the character runs right and jumps off the ground', async ({ page }) => {
  const errors = await boot(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const start = g.state().player;
    g.input('R30');
    const ran = g.step(30).player;
    g.input('R+J12');
    const air = g.step(12).player;
    const events = g.events().map((e) => e.type);
    const landed = g.step(60).player;
    // The run passes through the first line of glints.
    const glints = g.pickups();
    const glintEvents = g.events(102).map((e) => e.type);
    return { start, ran, air, landed, events, glints, glintEvents, reset: g.load().pickups.count };
  });
  expect(r.start.grounded).toBe(true);
  expect(r.ran.x).toBeGreaterThan(r.start.x + 150);
  expect(r.ran.motion).toBe('run');
  expect(r.air.grounded).toBe(false);
  expect(r.air.y).toBeLessThan(r.start.y - 100);
  expect(r.events).toContain('jump');
  expect(r.landed.grounded).toBe(true);
  expect(r.glints.count).toBeGreaterThanOrEqual(3);
  expect(r.glints.worth).toBeGreaterThan(r.glints.count);
  expect(r.glints.list.filter((p) => p.state === 'taken')).toHaveLength(r.glints.taken);
  expect(r.glintEvents).toContain('pickupWake');
  expect(r.glintEvents).toContain('pickup');
  expect(r.reset).toBe(0);
  expect(errors).toEqual([]);
});

test('__game API: step, state, input, load, teleport, cam, freeze', async ({ page }) => {
  const errors = await boot(page);
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const f0 = g.state().frame;
    const f5 = g.step(5).frame;
    const queued = g.input('R10 .5');
    const tp = g.teleport(3000, 448).player;
    const follow = g.cam();
    const over = g.cam({ on: 'player', zoom: 4 });
    const released = g.cam(null);
    const clock0 = g.info().clock;
    g.freeze();
    await new Promise((r) => setTimeout(r, 250));
    const frozen = g.info();
    const frameWhileFrozen = g.state().frame;
    g.pause();
    const hashA = g.hash();
    const loaded = g.load();
    return {
      f0,
      f5,
      queued,
      tp,
      follow,
      over,
      released,
      clock0,
      frozen,
      frameWhileFrozen,
      hashA,
      loaded,
      lights: g.lights(),
      enemies: g.enemies(),
      health: g.health(),
    };
  });
  expect(r.f5).toBe(r.f0 + 5);
  expect(r.queued).toBe(15);
  expect(r.tp.x + r.tp.w / 2).toBe(3000);
  expect(r.tp.y + r.tp.h).toBe(448);
  expect(r.tp.grounded).toBe(true);
  expect(r.follow.zoom).toBe(1);
  expect(r.over.zoom).toBe(4);
  expect(r.over.x).toBe(3000);
  expect(r.released.override).toBeNull();
  // Frozen: render time runs, the sim does not.
  expect(r.frozen.mode).toBe('frozen');
  expect(r.frozen.clock).toBeGreaterThan(r.clock0);
  expect(r.frameWhileFrozen).toBe(r.f5);
  expect(r.hashA).toMatch(/^[0-9a-f]{14}$/);
  expect(r.loaded.frame).toBe(0);
  expect(r.lights.length).toBeGreaterThan(0);
  // Enemies and health are in the state and listed by the API.
  expect([r.enemies.alive, r.enemies.total, r.loaded.enemies.length]).toEqual([13, 13, 13]);
  expect(r.enemies.list[0]).toMatchObject({ id: 'burr-bank', kind: 'burrback', hp: 5, mode: 'walk' });
  expect(r.health).toMatchObject({ hp: 4, hpMax: 4, invuln: 0, faded: 0 });
  expect(errors).toEqual([]);
});

test('the default boot is scene 1 (wood-hatch): shut in the cocoon, then running with the starting kit', async ({
  page,
}) => {
  const errors = await boot(page, '');
  const r = await page.evaluate(() => {
    const g = window.__game;
    // Realtime from the first frame: pause it so the reading is stable.
    const mode = g.pause();
    g.load();
    const s0 = g.state();
    const x0 = s0.player.x;
    // Wait out the fade-up, then three presses break the cocoon.
    g.step(160);
    g.input('J1 .3 A1 .3 J1 .3');
    g.step(12);
    const hatch = g.events(20).filter((e) => e.type === 'hatch' || e.type === 'hatchStir').length;
    g.input('R40');
    const ran = g.step(40).player;
    return {
      mode,
      room: g.room(),
      rooms: g.rooms(),
      prologue: 'prologue' in g,
      shut: s0.hatch,
      hatch,
      moved: ran.x - x0,
      abilities: g.abilities(),
      granted: g.grant('glide', 'dash'),
      revoked: g.revoke('dash'),
      glints: s0.pickups.timers.length,
      enemies: g.enemies().total,
    };
  });
  expect(r.prologue).toBe(false);
  expect(r.mode).toBe('manual');
  expect(r.room).toBe('wood-hatch');
  expect(r.rooms).toEqual([
    'wood-hatch',
    'lab-world-a',
    'lab-world-b',
    'lab-world-c',
    'test-grove',
    'lab-lamps',
  ]);
  expect(r.shut).toEqual({ frames: 0, presses: 0, done: false });
  expect(r.hatch).toBe(4);
  expect(r.moved).toBeGreaterThan(150);
  expect(r.abilities.owned).toEqual([]);
  expect(r.granted).toEqual(['glide', 'dash']);
  expect(r.revoked).toEqual(['glide']);
  // Scene 1 has no glints and no creatures.
  expect([r.glints, r.enemies]).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('?room and ?abilities choose the room and the kit; the panel lists the rooms', async ({ page }) => {
  const errors = await boot(page, '?manual&room=test-grove&abilities=glide');
  const r = await page.evaluate(() => ({
    room: window.__game.room(),
    owned: window.__game.abilities().owned,
    options: [...(document.querySelector('.tp-dfwv select')?.querySelectorAll('option') ?? [])].map(
      (o) => o.textContent,
    ),
  }));
  expect(r).toEqual({
    room: 'test-grove',
    owned: ['glide'],
    options: ['wood-hatch', 'lab-world-a', 'lab-world-b', 'lab-world-c', 'test-grove', 'lab-lamps'],
  });
  expect(errors).toEqual([]);
});

test('sound is muted by default: no AudioContext until M, and the game plays the same either way', async ({
  page,
}) => {
  const errors = await boot(page);
  const play = () =>
    page.evaluate(() => {
      const g = window.__game;
      g.load();
      g.input('R30 R+J20 R10 .2 J20 R+X3 R30 .20');
      g.step(110);
      return { hash: g.hash(), cues: g.audio?.cues(50).map((c) => c.sound) ?? [] };
    });
  const muted = await page.evaluate(() => window.__game.audio?.state());
  expect(muted).toMatchObject({ muted: true, context: 'none', ready: false });
  const quiet = await play();
  // The router still runs muted (cues for tests), but nothing exists to play them.
  expect(quiet.cues).toContain('wing');
  expect(await page.evaluate(() => window.__game.audio?.state().context)).toBe('none');
  await page.keyboard.press('KeyM');
  const on = await page.evaluate(() => window.__game.audio?.state());
  expect(on?.muted).toBe(false);
  expect(on?.context).not.toBe('none');
  expect((await play()).hash).toBe(quiet.hash);
  await page.keyboard.press('KeyM');
  expect(await page.evaluate(() => window.__game.audio?.state().muted)).toBe(true);
  expect(await page.locator('#sound-key').textContent()).toBe('M sound');
  expect(errors).toEqual([]);
});
