import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import type { RenderRect } from '../../src/debug/api';
import { contrastRatio, hueDeg, hueGap, PALETTE, rgbOf } from '../../src/render/palette';

/**
 * L3 brief §6.3 E1–E3: signature-mechanic readability, measured on the rendered canvas.
 * Pixels are sampled in the page (canvas getImageData, no new dependency) at four checkpoints:
 *   cp1 Lot 7 start (H humming), cp2 20 f after the H take, cp3 slab landed on the plate (F1
 *   ghost), cp4 the Barker ring with one Barker telegraphing and one disarmed.
 * Writes progress/l3/e-checks.json (read by `npm run l3:verdict`) and PNGs to progress/l3/.
 * Thresholds are the brief's; if a check fails, fix the rendering, not the numbers.
 * CI renders at ~1 fps: every step(n) and screenshot is one render, so keep the count small.
 */

const OUT = path.resolve('progress/l3');
const SLAB_TAPE = path.resolve('tests/replays/lot-7.slab.json');
/** Lot 7 route A (fallback if the tape is missing). */
const ROUTE_A = 'R37 R+S1 R48 R+J10 D+V1 R51 R+J20 R19 R+S1 R22 R+V1 R40 R+J24 R150';
/** E3: run into the partition, stand pressed against it, seize, keep holding right. */
const E3_SCRIPT = 'R60 R+S1 R30';
/**
 * cp4 (moved from the Pit to the Barker ring in L4, when the Pit got a safe spawn platform): a
 * Barker spawned next to Kid telegraphs at once and the Seize Catches it; a second one lunges after.
 */
const PIT_ROOM = 'ring-barker';
const PIT_SPAWNS = [
  { type: 'barker', x: 320, y: 896 },
  { type: 'barker', x: 760, y: 896 },
];
const PIT_SCRIPT = 'S1 .200';

const BG = rgbOf(PALETTE.bg);

/** In-page sampling helpers (a string, so no bundler helpers leak into the page). */
const HELPERS = `
window.__e = {
  shots: {},
  async grab(name) {
    const url = window.__game.screenshot(1);
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    this.shots[name] = { c, d: ctx.getImageData(0, 0, c.width, c.height) };
    const h = document.createElement('canvas');
    h.width = c.width / 2;
    h.height = c.height / 2;
    const hx = h.getContext('2d');
    hx.imageSmoothingQuality = 'high';
    hx.drawImage(c, 0, 0, h.width, h.height);
    return h.toDataURL('image/png');
  },
  inRects(x, y, rs) {
    for (const r of rs) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
    return false;
  },
  // Mean over pixels of mean-channel |pixel - bg| inside r (inset px), skipping excluded rects.
  meanDiff(name, r, inset, bg, excl) {
    const { d } = this.shots[name];
    const x0 = Math.max(0, Math.round(r.x + inset)), x1 = Math.min(d.width, Math.round(r.x + r.w - inset));
    const y0 = Math.max(0, Math.round(r.y + inset)), y1 = Math.min(d.height, Math.round(r.y + r.h - inset));
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (this.inRects(x, y, excl)) continue;
      const i = (y * d.width + x) * 4;
      sum += (Math.abs(d.data[i] - bg[0]) + Math.abs(d.data[i + 1] - bg[1]) + Math.abs(d.data[i + 2] - bg[2])) / 3;
      n++;
    }
    return { mean: n ? sum / n : 0, n };
  },
  // Mean diff over a band around the rect edge (outside by 'out' px, inside by 'inn' px).
  bandDiff(name, r, out, inn, bg, excl) {
    const { d } = this.shots[name];
    let sum = 0, n = 0;
    for (let y = Math.max(0, Math.round(r.y - out)); y < Math.min(d.height, Math.round(r.y + r.h + out)); y++)
      for (let x = Math.max(0, Math.round(r.x - out)); x < Math.min(d.width, Math.round(r.x + r.w + out)); x++) {
        const inner = x >= r.x + inn && x < r.x + r.w - inn && y >= r.y + inn && y < r.y + r.h - inn;
        if (inner || this.inRects(x, y, excl)) continue;
        const i = (y * d.width + x) * 4;
        sum += (Math.abs(d.data[i] - bg[0]) + Math.abs(d.data[i + 1] - bg[1]) + Math.abs(d.data[i + 2] - bg[2])) / 3;
        n++;
      }
    return { mean: n ? sum / n : 0, n };
  },
  // The drawn outline colour: mean of the 5% band pixels farthest from bg.
  edgeColour(name, r, bg, excl) {
    const { d } = this.shots[name];
    const px = [];
    for (let y = Math.max(0, Math.round(r.y - 4)); y < Math.min(d.height, Math.round(r.y + r.h + 4)); y++)
      for (let x = Math.max(0, Math.round(r.x - 4)); x < Math.min(d.width, Math.round(r.x + r.w + 4)); x++) {
        const inner = x >= r.x + 6 && x < r.x + r.w - 6 && y >= r.y + 6 && y < r.y + r.h - 6;
        if (inner || this.inRects(x, y, excl)) continue;
        const i = (y * d.width + x) * 4;
        const c = [d.data[i], d.data[i + 1], d.data[i + 2]];
        px.push([Math.abs(c[0] - bg[0]) + Math.abs(c[1] - bg[1]) + Math.abs(c[2] - bg[2]), c]);
      }
    px.sort((a, b) => b[0] - a[0]);
    const k = Math.max(1, Math.floor(px.length * 0.05));
    const m = [0, 0, 0];
    for (let i = 0; i < k; i++) for (let j = 0; j < 3; j++) m[j] += px[i][1][j] / k;
    return m;
  },
  // E2: both rects downscaled to 25%; fraction of pixels where any channel differs by > 16.
  diffFrac(a, ra, b, rb, exclA, exclB) {
    const w = Math.max(1, Math.round(ra.w / 4)), h = Math.max(1, Math.round(ra.h / 4));
    const small = (name, r) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(this.shots[name].c, r.x, r.y, r.w, r.h, 0, 0, w, h);
      return x.getImageData(0, 0, w, h).data;
    };
    const A = small(a, ra), B = small(b, rb);
    const rel = (rs, r) => rs.map((q) => ({ x: (q.x - r.x) / 4 - 1, y: (q.y - r.y) / 4 - 1, w: q.w / 4 + 2, h: q.h / 4 + 2 }));
    const ex = [...rel(exclA, ra), ...rel(exclB, rb)];
    let diff = 0, diffAll = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dd = Math.abs(A[i] - B[i]) > 16 || Math.abs(A[i + 1] - B[i + 1]) > 16 || Math.abs(A[i + 2] - B[i + 2]) > 16;
      if (dd) diffAll++;
      if (this.inRects(x, y, ex)) continue;
      n++;
      if (dd) diff++;
    }
    return { diffFrac: n ? diff / n : 0, diffFracRaw: diffAll / (w * h), n, total: w * h };
  },
};
`;

interface Checkpoint {
  frame: number;
  rects: RenderRect[];
  png: string;
}

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(query);
  await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__game);
  await page.evaluate(HELPERS);
  return errors;
}

/** Steps n frames (one render), grabs the canvas under `name`, returns rects and a half-size PNG. */
async function checkpoint(page: Page, n: number, name: string): Promise<Checkpoint> {
  return page.evaluate(
    async ({ n, name }) => {
      const g = window.__game;
      if (n > 0) g.step(n);
      const e = (window as unknown as { __e: { grab(s: string): Promise<string> } }).__e;
      const png = await e.grab(name);
      return { frame: g.state().frame, rects: g.render.rects(), png };
    },
    { n, name },
  );
}

function savePng(name: string, dataUrl: string): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
}

type Ev = { f: number; e: { type: string; raw: Record<string, unknown> } };

async function headlessEvents(page: Page, inputs: string): Promise<Ev[]> {
  return page.evaluate(
    (inputs) => window.__game.headless({ start: window.__game.save(), inputs }).events as unknown as Ev[],
    inputs,
  );
}

type Sampler = {
  meanDiff(
    n: string,
    r: RenderRect,
    inset: number,
    bg: number[],
    ex: RenderRect[],
  ): { mean: number; n: number };
  bandDiff(
    n: string,
    r: RenderRect,
    out: number,
    inn: number,
    bg: number[],
    ex: RenderRect[],
  ): { mean: number; n: number };
  edgeColour(n: string, r: RenderRect, bg: number[], ex: RenderRect[]): [number, number, number];
  diffFrac(
    a: string,
    ra: RenderRect,
    b: string,
    rb: RenderRect,
    exA: RenderRect[],
    exB: RenderRect[],
  ): { diffFrac: number; diffFracRaw: number; n: number; total: number };
};

async function sample<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ({ fn, args }) => {
      const e = (window as unknown as { __e: Record<string, (...a: unknown[]) => unknown> }).__e;
      return e[fn]?.(...args) as T;
    },
    { fn, args },
  );
}

const find = (rs: RenderRect[], pred: (r: RenderRect) => boolean) => rs.find(pred);
const kidOf = (rs: RenderRect[]) => rs.filter((r) => r.kind === 'player');
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

test('E1–E3 signature readability (writes progress/l3/e-checks.json)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await boot(page, '?manual&room=lot-7&seed=1');
  const route = fs.existsSync(SLAB_TAPE)
    ? (JSON.parse(fs.readFileSync(SLAB_TAPE, 'utf8')) as { inputs: string }).inputs
    : ROUTE_A;

  // --- Lot 7: plan the checkpoints headlessly (no rendering), then render only those frames.
  const evs = await headlessEvents(page, `${route} .60`);
  const takeH = evs.find((e) => e.e.type === 'seizeTake' && e.e.raw.colour === 'pink')?.f;
  const plate = evs.find((e) => e.e.type === 'plate')?.f;
  expect(takeH, 'route takes the pink partition').toBeDefined();
  expect(plate, 'route presses the plate with the slab').toBeDefined();
  await page.evaluate((s) => window.__game.input(s), `${route} .60`);

  const cp1 = await checkpoint(page, 20, 'cp1');
  const cp2 = await checkpoint(page, (takeH as number) + 20 - cp1.frame, 'cp2');
  const cp3 = await checkpoint(page, (plate as number) + 8 - cp2.frame, 'cp3');
  savePng('e-cp1', cp1.png);
  savePng('e-cp2', cp2.png);
  savePng('e-cp3', cp3.png);

  const H1 = find(cp1.rects, (r) => r.kind === 'object' && r.colour === 'pink');
  const H2 = find(cp2.rects, (r) => r.kind === 'object' && r.id === H1?.id);
  expect(H1?.status).toBe('humming');
  expect(H2?.status).toBe('ghost');
  const browns3 = cp3.rects.filter((r) => r.kind === 'object' && r.colour === 'brown');
  const F1 = browns3.find((r) => r.status === 'ghost');
  const F2 = browns3.find((r) => r.status === 'humming');
  const slab = find(cp3.rects, (r) => r.kind === 'levied' && r.colour === 'brown');
  expect(F1, 'F1 ghost at cp3').toBeDefined();
  expect(slab?.status, 'slab landed and solid at cp3').toBe('humming');
  const F2cp1 = cp1.rects.find(
    (r) => r.kind === 'object' && r.colour === 'brown' && r.x >= 0 && r.x + r.w <= 1920,
  );

  // E1: ghost vs humming interior (inset 8 px), Kid's box masked out.
  const s = (fn: keyof Sampler, ...a: unknown[]) => sample<never>(page, fn, ...a);
  const hH = (await s('meanDiff', 'cp1', H1, 8, BG, kidOf(cp1.rects))) as { mean: number };
  const gH = (await s('meanDiff', 'cp2', H2, 8, BG, kidOf(cp2.rects))) as { mean: number };
  const ratios: Record<string, number> = { H: gH.mean / hH.mean };
  let hF: { mean: number } | null = null;
  let gF: { mean: number } | null = null;
  if (F1 && F2) {
    hF = (await s('meanDiff', 'cp3', F2, 8, BG, kidOf(cp3.rects))) as { mean: number };
    gF = (await s('meanDiff', 'cp3', F1, 8, BG, kidOf(cp3.rects))) as { mean: number };
    ratios.F = gF.mean / hF.mean;
  }
  const ghostRatio = Math.max(...Object.values(ratios));

  // Colour of the drawn outlines (brown and pink measured; no violet source exists in L3 rooms).
  const pinkPx = (await s('edgeColour', 'cp1', H1, BG, kidOf(cp1.rects))) as [number, number, number];
  const brownPx = F2cp1
    ? ((await s('edgeColour', 'cp1', F2cp1, BG, kidOf(cp1.rects))) as [number, number, number])
    : ((await s('edgeColour', 'cp3', F2, BG, kidOf(cp3.rects))) as [number, number, number]);
  const violet = rgbOf(PALETTE.violet);
  const cols = { brown: brownPx, pink: pinkPx, violet };
  const hues = Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, hueDeg(...c)]));
  const hueGapMin = Math.min(
    hueGap(hues.brown ?? 0, hues.pink ?? 0),
    hueGap(hues.brown ?? 0, hues.violet ?? 0),
    hueGap(hues.pink ?? 0, hues.violet ?? 0),
  );
  const contrasts = Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, contrastRatio(c, BG)]));
  const contrastMin = Math.min(...Object.values(contrasts));

  // E2: the same H rect, cp1 vs cp2, at 25%.
  const e2 = (await s('diffFrac', 'cp1', H1, 'cp2', H2, kidOf(cp1.rects), kidOf(cp2.rects))) as {
    diffFrac: number;
    diffFracRaw: number;
    n: number;
    total: number;
  };

  // --- E3: the take reads on the same frame, and the old wall is passable on the next moving step.
  await page.evaluate(() => {
    window.__game.clearInput();
    window.__game.load('lot-7');
  });
  const e3evs = await headlessEvents(page, E3_SCRIPT);
  const e3start = await page.evaluate(() => window.__game.state().frame);
  const take = e3evs.find((e) => e.e.type === 'seizeTake');
  expect(take, 'E3 script takes a sound').toBeDefined();
  const owner = take?.e.raw.owner as number;
  const e3 = await page.evaluate(
    ({ script, pre, owner }) => {
      const g = window.__game;
      const before = g.render.rects().find((r) => r.id === owner);
      g.input(script);
      if (pre > 0) g.trace(pre);
      g.step(1);
      const tookNow = g.lastEvents().some((l) => l.e.type === 'seizeTake');
      const atTake = g.render.rects().find((r) => r.id === owner);
      const wall = g.state().local.sources.find((x) => x.id === owner);
      const x0 = g.state().player.x;
      let steps = 0;
      let hitstopSteps = 0;
      let overlap = false;
      let moved = false;
      for (let i = 0; i < 12; i++) {
        const st = g.step(1);
        steps++;
        const p = st.player;
        moved = p.x !== x0;
        if (!moved) {
          hitstopSteps++;
          continue;
        }
        overlap =
          !!wall &&
          p.x < wall.x + wall.w &&
          wall.x < p.x + p.w &&
          p.y < wall.y + wall.h &&
          wall.y < p.y + p.h;
        break;
      }
      return { tookNow, before: before?.status, atTake: atTake?.status, steps, hitstopSteps, overlap, moved };
    },
    { script: E3_SCRIPT, pre: (take?.f as number) - e3start - 1, owner },
  );
  const e3png = await checkpoint(page, 0, 'e3');
  savePng('e-e3-after', e3png.png);

  // --- cp4: one Barker telegraphing and one disarmed.
  await page.evaluate(
    ({ room, spawns }) => {
      const g = window.__game;
      g.clearInput();
      g.load(room);
      for (const sp of spawns) g.spawn(sp.type, sp.x, sp.y);
    },
    { room: PIT_ROOM, spawns: PIT_SPAWNS },
  );
  const pitEvs = await headlessEvents(page, PIT_SCRIPT);
  const pit0 = await page.evaluate(() => window.__game.state().frame);
  const caught = pitEvs.find((e) => e.e.type === 'catch');
  const disarmed = caught?.e.raw.enemy as number | undefined;
  // First telegraph by a different Barker after the take; sample mid-wind-up.
  const tele = pitEvs.find(
    (e) =>
      e.e.type === 'telegraph' &&
      e.e.raw.attackId === 'lunge' &&
      e.f > (caught?.f ?? 0) &&
      e.e.raw.enemy !== disarmed,
  );
  expect(caught, 'cp4 script disarms a Barker').toBeDefined();
  expect(tele, 'another Barker telegraphs after').toBeDefined();
  await page.evaluate((s) => window.__game.input(s), PIT_SCRIPT);
  const cp4 = await checkpoint(page, (tele?.f as number) + 9 - pit0, 'cp4');
  savePng('e-cp4', cp4.png);
  const pitState = await page.evaluate(() =>
    window.__game.state().enemies.map((e) => ({ id: e.id, source: e.source, type: e.type, state: e.state })),
  );
  const teleEnemy = pitState.find((e) => e.id === tele?.e.raw.enemy);
  const disEnemy = pitState.find((e) => e.id === disarmed);
  const teleRect = cp4.rects.find((r) => r.kind === 'enemy' && r.id === teleEnemy?.source);
  const disRect = cp4.rects.find((r) => r.kind === 'enemy' && r.id === disEnemy?.source);
  expect(teleRect?.status).toBe('telegraph');
  expect(disRect?.status).toBe('ghost');
  // Informational: outline band energy (outside the body) for the armed/telegraphing vs disarmed Barker.
  const ringT = teleRect
    ? ((await s('bandDiff', 'cp4', teleRect, 18, 0, BG, kidOf(cp4.rects))) as { mean: number })
    : null;
  const ringD = disRect
    ? ((await s('bandDiff', 'cp4', disRect, 18, 0, BG, kidOf(cp4.rects))) as { mean: number })
    : null;

  const E1pass = ghostRatio <= 0.4 && hueGapMin >= 60 && contrastMin >= 3;
  const E2pass = e2.diffFrac >= 0.15;
  const E3pass = e3.tookNow && e3.atTake === 'ghost' && e3.overlap;
  const result = {
    E1: {
      ghostRatio: round(ghostRatio),
      hueGapMin: round(hueGapMin, 1),
      contrastMin: round(contrastMin, 2),
      pass: E1pass,
      detail: {
        ratios: Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, round(v)])),
        hummingMean: { H: round(hH.mean, 1), F2: hF ? round(hF.mean, 1) : null },
        ghostMean: { H: round(gH.mean, 1), F1: gF ? round(gF.mean, 1) : null },
        measuredRgb: { brown: brownPx.map(Math.round), pink: pinkPx.map(Math.round) },
        hues: Object.fromEntries(Object.entries(hues).map(([k, v]) => [k, round(v, 1)])),
        contrasts: Object.fromEntries(Object.entries(contrasts).map(([k, v]) => [k, round(v, 2)])),
        note: 'violet is the palette token: no L3 room has a violet source. bg = #12141A token. Kid box masked.',
        pitBarkerBand: {
          telegraph: ringT ? round(ringT.mean, 1) : null,
          disarmed: ringD ? round(ringD.mean, 1) : null,
        },
      },
    },
    E2: {
      diffFrac: round(e2.diffFrac),
      pass: E2pass,
      detail: { diffFracWithKid: round(e2.diffFracRaw), pixels: e2.n, bboxPixels: e2.total },
    },
    E3: {
      ghostSameFrame: e3.tookNow && e3.atTake === 'ghost',
      passableNext: e3.overlap,
      pass: E3pass,
      detail: {
        statusBefore: e3.before,
        statusOnTakeFrame: e3.atTake,
        hitstopStepsAfterTake: e3.hitstopSteps,
        stepsToFirstMove: e3.steps,
        note: 'The take starts a 5 f global hitstop (combat-spec §2), so the first step on which Kid moves is the "next" step; she enters the old wall rect on it.',
      },
    },
    checkpoints: {
      cp1: cp1.frame,
      cp2: cp2.frame,
      cp3: cp3.frame,
      cp4: cp4.frame,
      route: fs.existsSync(SLAB_TAPE) ? 'tests/replays/lot-7.slab.json' : 'ROUTE_A',
    },
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'e-checks.json'), `${JSON.stringify(result, null, 2)}\n`);

  expect(errors).toEqual([]);
  expect(result.E1, JSON.stringify(result.E1)).toMatchObject({ pass: true });
  expect(result.E2, JSON.stringify(result.E2)).toMatchObject({ pass: true });
  expect(result.E3, JSON.stringify(result.E3)).toMatchObject({ pass: true });
});
