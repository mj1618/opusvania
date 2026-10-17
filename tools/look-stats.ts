/**
 * Numbers for judging the look against the reference study (memory/reference-study.md), with the
 * same definitions: luma = Rec.709 weights on sRGB bytes, 0-255.
 *
 *   npm run look:stats -- shots/r9                    every PNG in a directory (or list files)
 *   npm run look:stats -- shots/r9 --only=wide        only names containing "wide"
 *   npm run look:stats -- a.png --hero=930,650,64,108 hero box in image px: p10 / p90 inside it
 *                                                     and p90 / mean of the 300 px around it
 *   npm run look:stats -- shots/r9 --json             machine-readable
 *
 * A file `<image>.hero.json` holding `{"x":..,"y":..,"w":..,"h":..}` next to an image is used as
 * its hero box automatically. `--stops[=dir]` shoots the seven wide camera stops itself (dev
 * server on 5180 or --url, like `npm run shots`), writes them with their hero boxes into the
 * directory (default shots/look) and then measures them: one command for a before/after number.
 *
 * Per image and averaged: mean, median, near-black % (< 15), dark % (< 38), dark-grey % (15-38),
 * area above 150 %, near-white % (> 217), the luma of the brightest 0.1% of pixels (p99.9), mean
 * chroma (max minus min channel over all pixels; dark references: 48 / - / 27 / 2.0 / 0.5 / 237 / 34),
 * outer-10% border mean, top-quarter and bottom-quarter mean, corners / centre (mean of the four
 * 20% x 20% corners over the central 40% x 40%), dominant hue bin and its share of the chroma.
 * PNGs are decoded with ffmpeg (already needed for clips): no extra dependency.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_URL, launch, openGame } from './lib/browser';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    hero: { type: 'string' },
    only: { type: 'string' },
    json: { type: 'boolean', default: false },
    stops: { type: 'string' },
    url: { type: 'string', default: DEFAULT_URL },
    ambient: { type: 'string', default: '60' },
    help: { type: 'boolean', short: 'h' },
  },
});
const wantsStops = args.stops !== undefined || process.argv.includes('--stops');
if (args.help || (positionals.length === 0 && !wantsStops)) {
  console.log(
    'npm run look:stats -- <dir|files...> [--only=text] [--hero=x,y,w,h] [--json]\n' +
      'npm run look:stats -- --stops[=dir] [--url=http://localhost:5180] [--ambient=60]',
  );
  process.exit(args.help ? 0 : 1);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The camera stops of tools/shots.ts (feet centre, sim px). Keep in step with it. */
const STOPS: Array<[string, number, number]> = [
  ['left-bank', 520, 1280],
  ['pool', 1440, 1280],
  ['canopy-route', 1980, 608],
  ['trunks', 3050, 1152],
  ['high-ledge', 3000, 448],
  ['right-rise', 4500, 1280],
  ['far-ledge', 5524, 768],
];

const HUES = [
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
  'spring',
  'cyan',
  'azure',
  'blue',
  'violet',
  'magenta',
  'rose',
];

function decode(file: string): { w: number; h: number; rgb: Buffer } {
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  const [w = 0, h = 0] = probe.trim().split(',').map(Number);
  const rgb = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    {
      maxBuffer: w * h * 3 + 1024,
    },
  );
  return { w, h, rgb };
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i] as number;
    if (acc >= total * p) return i;
  }
  return 255;
}

function measure(file: string, hero: Box | null): Record<string, number | string> {
  const { w, h, rgb } = decode(file);
  const luma = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  const hue = new Float64Array(12);
  let chroma = 0;
  let chromaAll = 0;
  for (let i = 0, p = 0; i < w * h; i++, p += 3) {
    const r = rgb[p] as number;
    const g = rgb[p + 1] as number;
    const b = rgb[p + 2] as number;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[i] = l;
    hist[Math.min(255, Math.round(l))] = (hist[Math.min(255, Math.round(l))] as number) + 1;
    const mx = Math.max(r, g, b);
    const c = mx - Math.min(r, g, b);
    chromaAll += c;
    if (c > 8) {
      const hh = mx === r ? ((g - b) / c + 6) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
      const bin = Math.floor(((hh * 60 + 15) % 360) / 30);
      hue[bin] = (hue[bin] as number) + c;
      chroma += c;
    }
  }
  const mean = (x0: number, y0: number, x1: number, y1: number, skip?: Box): number => {
    let s = 0;
    let n = 0;
    const ax = Math.max(0, Math.round(x0));
    const bx = Math.min(w, Math.round(x1));
    const ay = Math.max(0, Math.round(y0));
    const by = Math.min(h, Math.round(y1));
    for (let y = ay; y < by; y++) {
      for (let x = ax; x < bx; x++) {
        if (skip && x >= skip.x && x < skip.x + skip.w && y >= skip.y && y < skip.y + skip.h) continue;
        s += luma[y * w + x] as number;
        n++;
      }
    }
    return n ? s / n : 0;
  };
  const total = w * h;
  const below = (t: number): number => {
    let n = 0;
    for (let i = 0; i < t; i++) n += hist[i] as number;
    return (n / total) * 100;
  };
  const all = mean(0, 0, w, h);
  const inner = mean(w * 0.1, h * 0.1, w * 0.9, h * 0.9);
  const border = (all * total - inner * (w * 0.8 * h * 0.8)) / (total - w * 0.8 * h * 0.8);
  const corners =
    (mean(0, 0, w * 0.2, h * 0.2) +
      mean(w * 0.8, 0, w, h * 0.2) +
      mean(0, h * 0.8, w * 0.2, h) +
      mean(w * 0.8, h * 0.8, w, h)) /
    4;
  const centre = mean(w * 0.3, h * 0.3, w * 0.7, h * 0.7);
  let top = 0;
  for (let i = 1; i < 12; i++) if ((hue[i] as number) > (hue[top] as number)) top = i;
  const out: Record<string, number | string> = {
    file: basename(file),
    mean: all,
    median: percentile(hist, total, 0.5),
    black: below(15),
    dark: below(38),
    grey: below(38) - below(15),
    above150: 100 - below(151),
    white: 100 - below(218),
    p999: percentile(hist, total, 0.999),
    chroma: chromaAll / total,
    border,
    topQ: mean(0, 0, w, h * 0.25),
    botQ: mean(0, h * 0.75, w, h),
    cornerRatio: corners / Math.max(1, centre),
    hue: HUES[top] as string,
    hueShare: chroma ? ((hue[top] as number) / chroma) * 100 : 0,
  };
  if (hero) {
    const hh = new Uint32Array(256);
    let n = 0;
    for (let y = Math.max(0, hero.y); y < Math.min(h, hero.y + hero.h); y++) {
      for (let x = Math.max(0, hero.x); x < Math.min(w, hero.x + hero.w); x++) {
        const v = Math.min(255, Math.round(luma[y * w + x] as number));
        hh[v] = (hh[v] as number) + 1;
        n++;
      }
    }
    const cx = hero.x + hero.w / 2;
    const cy = hero.y + hero.h / 2;
    const surround = mean(cx - 300, cy - 300, cx + 300, cy + 300, hero);
    out.heroP10 = percentile(hh, n, 0.1);
    out.heroP90 = percentile(hh, n, 0.9);
    out.surround = surround;
    out.heroRatio = (out.heroP90 as number) / Math.max(1, surround);
  }
  return out;
}

async function shootStops(dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const browser = await launch();
  const page = await openGame(browser, args.url as string, { width: 1920, height: 1080 });
  const files: string[] = [];
  let i = 1;
  for (const [name, x, y] of STOPS) {
    const box = (await page.evaluate(
      `(() => { const g = window.__game; g.cam(null); g.teleport(${x}, ${y}); g.step(${Number(args.ambient)});
        const c = g.cam(); const p = g.state().player;
        return { x: Math.round(960 + (p.x - c.x) * c.zoom - 14), y: Math.round(540 + (p.y - c.y) * c.zoom - 26), w: p.w + 28, h: p.h + 30 }; })()`,
    )) as Box;
    const file = join(dir, `wide-${i++}-${name}.png`);
    await page.screenshot({ path: file });
    writeFileSync(`${file}.hero.json`, JSON.stringify(box));
    files.push(file);
  }
  await browser.close();
  return files;
}

const COLS: Array<[string, string, number]> = [
  ['mean', 'mean', 0],
  ['median', 'med', 0],
  ['black', 'blk%', 1],
  ['dark', 'drk%', 1],
  ['grey', 'gry%', 1],
  ['above150', '>150%', 2],
  ['white', 'wht%', 2],
  ['p999', 'p99.9', 0],
  ['chroma', 'chroma', 0],
  ['border', 'bord', 0],
  ['topQ', 'topQ', 0],
  ['botQ', 'botQ', 0],
  ['cornerRatio', 'c/ctr', 2],
  ['hueShare', 'hue%', 0],
  ['heroP10', 'h.p10', 0],
  ['heroP90', 'h.p90', 0],
  ['surround', 'surr', 0],
  ['heroRatio', 'h/surr', 2],
];

let files: string[] = [];
if (wantsStops)
  files = await shootStops(resolve(typeof args.stops === 'string' && args.stops ? args.stops : 'shots/look'));
for (const p of positionals) {
  const full = resolve(p);
  if (statSync(full).isDirectory()) {
    files.push(
      ...readdirSync(full)
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => join(full, f)),
    );
  } else files.push(full);
}
if (args.only) files = files.filter((f) => basename(f).includes(args.only as string));
if (files.length === 0) {
  console.error('No PNG files to measure.');
  process.exit(1);
}

const fixedHero = args.hero ? (args.hero.split(',').map(Number) as [number, number, number, number]) : null;
const rows = files.map((f) => {
  const side = `${f}.hero.json`;
  const hero: Box | null = fixedHero
    ? { x: fixedHero[0], y: fixedHero[1], w: fixedHero[2], h: fixedHero[3] }
    : existsSync(side)
      ? (JSON.parse(readFileSync(side, 'utf8')) as Box)
      : null;
  return measure(f, hero);
});
const avg: Record<string, number | string> = { file: `AVERAGE (${rows.length})`, hue: '' };
for (const [key] of COLS) {
  const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number');
  if (vals.length) avg[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
}

if (args.json) {
  console.log(JSON.stringify({ images: rows, average: avg }, null, 1));
} else {
  const width = Math.max(...rows.map((r) => String(r.file).length), 14);
  console.log(`${'image'.padEnd(width)}  ${COLS.map(([, label]) => label.padStart(6)).join(' ')}  hue`);
  for (const r of [...rows, avg]) {
    const cells = COLS.map(([key, , digits]) =>
      (typeof r[key] === 'number' ? (r[key] as number).toFixed(digits) : '-').padStart(6),
    );
    console.log(`${String(r.file).padEnd(width)}  ${cells.join(' ')}  ${r.hue ?? ''}`);
  }
}
