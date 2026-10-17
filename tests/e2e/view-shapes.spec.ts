import { expect, type Page, test } from '@playwright/test';

/**
 * The picture fills any window shape with no black or uncovered edge (CLAUDE.md, memory/view-size.md).
 * Each room boots at one shape and is then resized to the others (so the boot path and a runtime
 * resize are both covered): 16:10, 21:9 and 4:3. At each, the canvas must cover the window, and with
 * a loud clear colour no pixel at the edges may show it (with post on: the filter covers the view;
 * with post off: the layers do), and the outer strip must not be a dark band next to the picture.
 */
const SHAPES = {
  '16:10': { width: 1280, height: 800 },
  '21:9': { width: 1680, height: 720 },
  '4:3': { width: 1024, height: 768 },
} as const;
type Shape = keyof typeof SHAPES;

const MAGENTA = 0xff00ff;

interface Probe {
  canvas: { x: number; y: number; w: number; h: number };
  window: { w: number; h: number };
  view: { w: number; h: number };
  /** Per post setting: clear-colour pixels found on the edges and a sparse grid, and edge vs inner luma. */
  runs: Array<{ post: boolean; magenta: number; sampled: number; strips: Record<string, [number, number]> }>;
}

async function boot(page: Page, room: string, shape: Shape): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize(SHAPES[shape]);
  await page.goto(`./?manual&nopickups&room=${room}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.body.dataset.error);
  expect(await page.evaluate(() => document.body.dataset.error)).toBeUndefined();
  // The key legend sits over the canvas; it is not the picture.
  await page.addStyleTag({ content: '#hint { display: none !important; }' });
  return errors;
}

async function probe(page: Page): Promise<Probe> {
  // Two animation frames: the loop refits the canvas to the window (render/app.ts) and redraws.
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  return page.evaluate((magenta) => {
    const g = window.__game;
    const gl = document.getElementById('game') as HTMLCanvasElement;
    const rect = gl.getBoundingClientRect();
    g.debug.clearColor(magenta);
    const runs: Probe['runs'] = [];
    for (const post of [true, false]) {
      // post() redraws; read the drawing buffer in the same task, before the browser composites it.
      g.debug.post(post);
      const W = gl.width;
      const H = gl.height;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      ctx.drawImage(gl, 0, 0);
      const px = ctx.getImageData(0, 0, W, H).data;
      const at = (x: number, y: number): [number, number, number] => {
        const i = (y * W + x) * 4;
        return [px[i] as number, px[i + 1] as number, px[i + 2] as number];
      };
      const isMagenta = ([r, gg, b]: [number, number, number]) => r > 200 && gg < 70 && b > 200;
      let magentaN = 0;
      let sampled = 0;
      const check = (x: number, y: number) => {
        sampled++;
        if (isMagenta(at(x, y))) magentaN++;
      };
      // Every pixel of the outer 3 px ring, and a 16 px grid inside.
      for (let x = 0; x < W; x++) for (const y of [0, 1, 2, H - 3, H - 2, H - 1]) check(x, y);
      for (let y = 0; y < H; y++) for (const x of [0, 1, 2, W - 3, W - 2, W - 1]) check(x, y);
      for (let y = 8; y < H; y += 16) for (let x = 8; x < W; x += 16) check(x, y);
      // Mean luma of the outer 4 px strip and of a strip 40-80 px in, per edge.
      const luma = (x0: number, y0: number, x1: number, y1: number): number => {
        let s = 0;
        let n = 0;
        for (let y = y0; y < y1; y += 2)
          for (let x = x0; x < x1; x += 2) {
            const [r, gg, b] = at(x, y);
            s += 0.2126 * r + 0.7152 * gg + 0.0722 * b;
            n++;
          }
        return s / Math.max(1, n);
      };
      const strips: Record<string, [number, number]> = {
        left: [luma(0, 0, 4, H), luma(40, 0, 80, H)],
        right: [luma(W - 4, 0, W, H), luma(W - 80, 0, W - 40, H)],
        top: [luma(0, 0, W, 4), luma(0, 40, W, 80)],
        bottom: [luma(0, H - 4, W, H), luma(0, H - 80, W, H - 40)],
      };
      runs.push({ post, magenta: magentaN, sampled, strips });
    }
    g.debug.post(true);
    const info = g.info();
    return {
      canvas: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      window: { w: window.innerWidth, h: window.innerHeight },
      view: { w: info.view.w, h: info.view.h },
      runs,
    };
  }, MAGENTA);
}

function expectCovered(p: Probe, shape: Shape): void {
  const { width, height } = SHAPES[shape];
  expect(p.window).toEqual({ w: width, h: height });
  expect(p.canvas).toEqual({ x: 0, y: 0, w: width, h: height });
  // The view extends past the 16:9 safe area on the long axis.
  if (width / height > 16 / 9) expect(p.view.w).toBeGreaterThan(1920);
  else expect(p.view.h).toBeGreaterThan(1080);
  for (const run of p.runs) {
    expect(run.sampled).toBeGreaterThan(1000);
    expect(run.magenta, `${shape}, post ${run.post}: uncovered pixels`).toBe(0);
    for (const [edge, [outer, inner]] of Object.entries(run.strips)) {
      // A strip the picture does not reach is flat black beside it; the vignette alone keeps well over a fifth.
      expect(outer, `${shape}, post ${run.post}, ${edge} edge: ${outer} vs ${inner}`).toBeGreaterThan(
        Math.min(inner * 0.2, 2),
      );
    }
  }
}

for (const [room, first, then] of [
  ['wood-hatch', '16:10', ['21:9', '4:3']],
  ['test-grove', '4:3', ['16:10', '21:9']],
  // A greybox room (memory/greybox.md): its flat background must cover every shape too.
  ['lab-lamps', '21:9', ['4:3', '16:10']],
] as const) {
  test(`${room}: the picture covers 16:10, 21:9 and 4:3 windows, booted and resized`, async ({ page }) => {
    const errors = await boot(page, room, first);
    expectCovered(await probe(page), first);
    for (const shape of then) {
      await page.setViewportSize(SHAPES[shape]);
      expectCovered(await probe(page), shape);
    }
    expect(errors).toEqual([]);
  });
}
