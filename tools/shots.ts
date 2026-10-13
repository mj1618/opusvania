/**
 * Screenshots for judging the look. Boots the game against a running dev server, drives it
 * deterministically through window.__game and writes PNGs:
 *
 *   wide-<n>-<name>.png     the full 1920x1080 view at camera stops spanning the scene, with the
 *                           character standing in view
 *   closeup-<name>.png      the character at 4x zoom in one situation each (idle, run, jump rise,
 *                           apex, fall, land, wall slide, dash, skid, double jump)
 *   closeup-strip.png       all close-ups side by side, labelled
 *
 *   npm run shots                       # everything, into shots/
 *   npm run shots -- --only=wide        # or --only=closeup
 *   npm run shots -- --out=shots/before --url=http://localhost:5199
 *   npm run shots -- --ambient=90       # let render time run this many frames first (default 60)
 *   npm run shots -- --hitboxes         # with the collision overlay
 *   npm run shots -- --no-gpu           # software GL
 *   npm run shots -- --pickups          # with the glints and the counter (left out by default: the
 *                                       # stops stand next to some, so they would be mid-pickup)
 *
 * Same code + same flags = same pictures: the sim is stepped, never timed, and render time
 * advances exactly 1/60 s per step.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';
import { DEFAULT_URL, launch, openGame } from './lib/browser';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: DEFAULT_URL },
    out: { type: 'string', default: 'shots' },
    only: { type: 'string' },
    ambient: { type: 'string', default: '60' },
    zoom: { type: 'string', default: '4' },
    hitboxes: { type: 'boolean', default: false },
    pickups: { type: 'boolean', default: false },
    'no-gpu': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});
if (args.help || (args.only && args.only !== 'wide' && args.only !== 'closeup')) {
  console.log(
    'npm run shots -- [--only=wide|closeup] [--out=dir] [--url=http://localhost:5180] [--ambient=60] [--zoom=4] [--hitboxes] [--pickups] [--no-gpu]',
  );
  process.exit(args.help ? 0 : 1);
}

const VIEW = { width: 1920, height: 1080 };
/** Close-up tile: this part of the centre of the zoomed view, in canvas px. */
const TILE = { width: 640, height: 760 };

/** Camera stops: where the character stands (feet centre, sim px). The follow camera frames it. */
const WIDE: Array<{ name: string; x: number; y: number }> = [
  { name: 'left-bank', x: 520, y: 1280 },
  { name: 'pool', x: 1440, y: 1280 },
  { name: 'canopy-route', x: 1980, y: 608 },
  { name: 'trunks', x: 3050, y: 1152 },
  { name: 'high-ledge', x: 3000, y: 448 },
  { name: 'right-rise', x: 4500, y: 1280 },
  { name: 'far-ledge', x: 5560, y: 448 },
  { name: 'bluff', x: 2528, y: 960 },
  { name: 'hollow', x: 3856, y: 1376 },
  { name: 'shaft-pit', x: 3456, y: 1280 },
  { name: 'summit-bough', x: 3800, y: 192 },
  { name: 'catch-branch', x: 3960, y: 448 },
];

/**
 * Close-up situations: start standing at `at`, queue `script`, step `frames` sim frames, shoot.
 * Scripts use the input DSL (src/input/script.ts): R/L/U/D, J jump, X dash, `.` nothing.
 */
const CLOSEUPS: Array<{ name: string; at: [number, number]; script: string; frames: number }> = [
  { name: 'idle', at: [1120, 1280], script: '', frames: 45 },
  { name: 'run', at: [1000, 1280], script: 'R60', frames: 26 },
  { name: 'skid', at: [1000, 1280], script: 'R30 L10', frames: 32 },
  { name: 'jump-rise', at: [1000, 1280], script: 'R14 R+J40', frames: 21 },
  { name: 'apex', at: [1000, 1280], script: 'R14 R+J40', frames: 42 },
  { name: 'fall', at: [1000, 1280], script: 'R14 R+J30 R40', frames: 56 },
  { name: 'land', at: [1000, 1280], script: 'R14 R+J30 R40', frames: 71 },
  { name: 'double-jump', at: [1000, 1280], script: 'R14 R+J24 R2 R+J30', frames: 46 },
  { name: 'wall-slide', at: [3456, 1280], script: 'R+J30 R40', frames: 44 },
  { name: 'wall-jump', at: [3456, 1280], script: 'R+J30 R14 . L+J20', frames: 52 },
  { name: 'dash', at: [1000, 1280], script: 'R10 R+X1 R20', frames: 18 },
  { name: 'air-dash', at: [1000, 1280], script: 'R14 R+J22 R+X1 R20', frames: 44 },
];

type Clip = { x: number; y: number; width: number; height: number };

/** Writes the canvas (or a part of it) to a PNG file. */
async function shoot(page: Page, file: string, clip?: Clip): Promise<Buffer> {
  const png = clip
    ? await page.screenshot({ type: 'png', clip })
    : await page.locator('#game').screenshot({ type: 'png' });
  writeFileSync(file, png);
  return png;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const outDir = resolve(args.out ?? 'shots');
  mkdirSync(outDir, { recursive: true });
  const ambient = Number(args.ambient);
  const zoom = Number(args.zoom);
  const browser = await launch({ gpu: !args['no-gpu'] });
  const written: string[] = [];
  try {
    const page = await openGame(browser, args.url ?? DEFAULT_URL, VIEW, 1, args.pickups);
    const info = await page.evaluate(() => window.__game.info());
    if (info.canvas.w !== VIEW.width || info.canvas.h !== VIEW.height)
      throw new Error(`Canvas is ${info.canvas.w}x${info.canvas.h}, expected ${VIEW.width}x${VIEW.height}`);
    if (args.hitboxes) await page.evaluate(() => window.__game.debug.hitboxes(true));

    if (args.only !== 'closeup') {
      let i = 1;
      for (const stop of WIDE) {
        await page.evaluate(
          ([x, y, n]) => {
            const g = window.__game;
            g.cam(null);
            g.teleport(x, y);
            g.step(20);
            g.tick(n);
          },
          [stop.x, stop.y, ambient] as const,
        );
        const file = join(outDir, `wide-${i++}-${stop.name}.png`);
        await shoot(page, file);
        written.push(file);
      }
    }

    if (args.only !== 'wide') {
      const tiles: Array<{ name: string; png: Buffer; note: string }> = [];
      const clip = {
        x: (VIEW.width - TILE.width) / 2,
        y: (VIEW.height - TILE.height) / 2,
        ...TILE,
      };
      for (const c of CLOSEUPS) {
        const note = await page.evaluate(
          ([x, y, script, frames, z, n]) => {
            const g = window.__game;
            g.teleport(x, y);
            g.cam({ on: 'player', zoom: z });
            // Settle springs and ambient motion at rest first, then play the situation.
            g.step(n);
            if (script) g.input(script);
            const s = g.step(frames);
            g.clearInput();
            return `${s.player.motion} f${s.player.motionFrames}`;
          },
          [c.at[0], c.at[1], c.script, c.frames, zoom, ambient] as const,
        );
        const file = join(outDir, `closeup-${c.name}.png`);
        tiles.push({ name: c.name, png: await shoot(page, file, clip), note });
        written.push(file);
      }
      await page.evaluate(() => window.__game.cam(null));

      // The strip: lay the tiles out in a plain page and screenshot that.
      const strip = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const html = `<body style="margin:0;background:#020a0e;display:inline-flex;gap:6px;padding:6px;font:20px ui-monospace,monospace;color:#cfe">${tiles
        .map(
          (t) =>
            `<figure style="margin:0"><img width="${TILE.width / 2}" height="${TILE.height / 2}" src="data:image/png;base64,${t.png.toString('base64')}"><figcaption style="padding:4px 2px">${t.name} <span style="opacity:.5">${t.note}</span></figcaption></figure>`,
        )
        .join('')}</body>`;
      await strip.setContent(html);
      const file = join(outDir, 'closeup-strip.png');
      writeFileSync(file, await strip.locator('body').screenshot({ type: 'png' }));
      written.push(file);
    }
    console.log(`${written.length} shots in ${((Date.now() - t0) / 1000).toFixed(1)} s (${info.gpu})`);
    for (const f of written) console.log(`  ${f}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
