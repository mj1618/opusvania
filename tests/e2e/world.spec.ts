import { expect, type Page, test } from '@playwright/test';

/**
 * The multi-room engine in the page (memory/world.md): room swaps free what they built (the leak
 * test), a run crosses rooms, the map draws, and the save slot carries a game across a reload.
 * Greybox rooms only: a painted room takes ~25 s to bake in software GL (its numbers come from
 * `npm run leak` on a real GPU).
 */
async function boot(page: Page, query: string): Promise<string[]> {
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

test('20 room swaps leak nothing: textures and buffers come back to the same counts, the heap stays put', async ({
  page,
}) => {
  const errors = await boot(page, '?manual&room=lab-world-a');
  const cdp = await page.context().newCDPSession(page);
  const heap = async (): Promise<number> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const u = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
    return u.usedSize / 1e6;
  };
  const swap = (id: string) =>
    page.evaluate((room) => {
      window.__game.goto(room);
      window.__game.step(2);
      return window.__game.debug.gpu();
    }, id);
  // One round first: Pixi's pools (batches, text) fill to what these rooms need.
  await swap('lab-world-b');
  const first = await swap('lab-world-a');
  const h0 = await heap();
  let last = first;
  for (let i = 0; i < 20; i++) last = await swap(i % 2 === 0 ? 'lab-world-b' : 'lab-world-a');
  const h1 = await heap();
  expect(last.builds).toBe(first.builds + 20);
  expect(last.textures).toBe(first.textures);
  expect(last.buffers).toBeLessThanOrEqual(first.buffers + 8);
  expect(h1 - h0).toBeLessThan(8);
  expect(errors).toEqual([]);
});

test('a run crosses from one room into the next with its speed, and the map draws', async ({ page }) => {
  const errors = await boot(page, '?manual&room=lab-world-a');
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.teleport(2000, 1152);
    g.input('R120');
    let st = g.step(40);
    const vx = st.player.vx;
    for (let i = 0; i < 80 && st.room === 'lab-world-a'; i++) st = g.step(1);
    const enter = g.events(80).find((e) => e.type === 'roomEnter');
    const w = g.world();
    const map = g.map(true);
    g.step(1);
    g.map(false);
    return { room: st.room, vx, after: g.state().player.vx, enter, link: w.links['lab-world-a#e-up'], map };
  });
  expect(r.room).toBe('lab-world-b');
  expect(r.enter).toMatchObject({ room: 'lab-world-b', from: 'lab-world-a#e-up' });
  expect(r.after).toBeCloseTo(r.vx, 3);
  expect(r.link).toEqual({ to: 'lab-world-b', exit: 'w' });
  expect(r.map).toBe(true);
  expect(errors).toEqual([]);
});

test('the save slot: rest at a moon patch, reload, and the game continues there', async ({ page }) => {
  // A game whose save says she has been to the lab: Continue starts there (greybox, no bakes).
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const save = {
      abilities: [],
      snuffed: [],
      moths: 0,
      taken: [],
      flags: [],
      opened: [],
      visited: ['wood-hatch', 'lab-world-a'],
      seen: [],
      crossed: [],
      patch: { room: 'lab-world-a', id: 'p1' },
      time: 1,
    };
    localStorage.setItem('lampfall.save', JSON.stringify({ version: 1, save }));
  });
  const errors = await boot(page, '?manual');
  const a = await page.evaluate(() => {
    const g = window.__game;
    const st = g.state();
    // Into B (the save follows), then glide-less B: grant glide by hand and rest back at P1.
    g.goto('lab-world-b');
    g.goto('lab-world-a', 1408, 1152);
    g.grant('glide');
    g.step(40);
    return { room: st.room, at: [st.player.x + st.player.w / 2, st.player.y + st.player.h], save: g.save() };
  });
  expect(a.room).toBe('lab-world-a');
  expect(a.at).toEqual([1408, 1152]);
  expect(a.save.autosave).toBe(true);
  expect(a.save.stored?.visited).toEqual(['wood-hatch', 'lab-world-a', 'lab-world-b']);
  expect(a.save.stored?.abilities).toEqual(['glide']);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  const b = await page.evaluate(() => ({ room: window.__game.room(), save: window.__game.state().save }));
  expect(b.room).toBe('lab-world-a');
  expect(b.save.abilities).toEqual(['glide']);
  expect(b.save.patch).toEqual({ room: 'lab-world-a', id: 'p1' });
  expect(errors).toEqual([]);
});
