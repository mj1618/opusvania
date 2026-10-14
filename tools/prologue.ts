/**
 * The prologue as a frame sheet: boots the game with `?prologue&manual`, drives the prologue's
 * clock through `__game.prologue.advance` (render time 1/60 s a frame, the sim stepped once she is
 * out of her cocoon: the same pictures every run), and writes one full-size PNG every `--every`
 * seconds plus a labelled contact sheet.
 *
 *   npm run prologue                          # every 1.5 s, into shots/prologue/
 *   npm run prologue -- --every 0.5 --from 60 --to 70 --out shots/prologue-cocoons
 *   npm run prologue -- --walk "R50 .30 L20"  # what the player presses in the walk (default: a short walk right)
 *   (for motion: npm run clip -- --prologue --fps 30 --name prologue)
 *
 * Needs the dev server (npm run dev, port 5180) and ffmpeg for the sheet.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_URL, launch, openGame } from './lib/browser';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: DEFAULT_URL },
    out: { type: 'string', default: 'shots/prologue' },
    every: { type: 'string', default: '1.5' },
    from: { type: 'string', default: '0' },
    to: { type: 'string', default: '90' },
    walk: { type: 'string', default: '.130 L40 .40 R6 .30' },
    cols: { type: 'string', default: '6' },
    'no-gpu': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});
if (args.help) {
  console.log(
    'npm run prologue -- [--every 1.5] [--from 0] [--to 90] [--out dir] [--walk "R50 .30"] [--cols 6]',
  );
  process.exit(0);
}

/** When Umber's cocoon splits and the sim starts (src/render/prologue/script.ts COCOONS.umberSplit). */
const WALK_AT = 66;

function ffmpeg(argv: string[]): void {
  const bin = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';
  const r = spawnSync(bin, ['-y', '-loglevel', 'error', ...argv], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.error) throw new Error(`ffmpeg not found (${r.error.message})`);
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr?.toString().slice(-2000)}`);
}

async function main(): Promise<void> {
  const outDir = resolve(args.out ?? 'shots/prologue');
  const framesDir = join(outDir, 'frames');
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const every = Number(args.every);
  const from = Number(args.from);
  const to = Number(args.to);
  const browser = await launch({ gpu: !args['no-gpu'] });
  const url = (args.url ?? DEFAULT_URL).replace(/\/?$/, '/');
  const size = { width: 1920, height: 1080 };
  const shots: Array<{ t: number; file: string }> = [];
  try {
    const page = await openGame(browser, `${url}?prologue`, size, 1, true);
    const has = await page.evaluate(() => !!window.__game.prologue);
    if (!has) throw new Error('The page has no prologue (is ?prologue handled in src/main.ts?)');
    const canvas = page.locator('#game');
    let walked = false;
    const at = async (t: number): Promise<number> => {
      if (!walked && t >= WALK_AT) {
        // Up to the split, then queue what the player presses (the sim reads it once it runs).
        await page.evaluate((s) => window.__game.prologue?.seek(s), WALK_AT);
        await page.evaluate((w) => window.__game.input(w), args.walk ?? '');
        walked = true;
      }
      return page.evaluate((s) => window.__game.prologue?.seek(s) ?? 0, t);
    };
    for (let t = from; t <= to + 1e-6; t += every) {
      const real = await at(t);
      const file = join(framesDir, `t${real.toFixed(1).padStart(5, '0')}.png`);
      writeFileSync(file, await canvas.screenshot({ type: 'png' }));
      shots.push({ t: real, file });
    }
  } finally {
    await browser.close();
  }

  // The sheet: every frame at 320x180 (small enough that viewers do not downscale it: a downscaled preview posterizes) with its time burnt in, `cols` across.
  const cols = Number(args.cols);
  const sheet = join(outDir, from === 0 && to >= 90 ? 'sheet.png' : `sheet-${from}-${to}.png`);
  const labelled = join(outDir, '.labelled');
  rmSync(labelled, { recursive: true, force: true });
  mkdirSync(labelled, { recursive: true });
  shots.forEach((s, i) => {
    ffmpeg([
      '-i',
      s.file,
      '-vf',
      `scale=320:180,drawtext=text='${s.t.toFixed(1)} s':x=8:y=8:fontsize=13:fontcolor=white@0.85:box=1:boxcolor=black@0.5:boxborderw=4`,
      '-pix_fmt',
      'rgb24',
      join(labelled, `${String(i).padStart(4, '0')}.png`),
    ]);
  });
  const rows = Math.ceil(shots.length / cols);
  ffmpeg([
    '-framerate',
    '1',
    '-i',
    join(labelled, '%04d.png'),
    '-vf',
    `tile=${cols}x${rows}:padding=4:color=0x101010`,
    '-pix_fmt',
    'rgb24',
    '-frames:v',
    '1',
    sheet,
  ]);
  rmSync(labelled, { recursive: true, force: true });
  // A JPEG too: image previews quantize a big PNG to a palette and its dark gradients look posterized.
  const jpg = sheet.replace(/\.png$/, '.jpg');
  ffmpeg(['-i', sheet, '-q:v', '3', jpg]);
  console.log(`${shots.length} frames -> ${framesDir}\nsheet -> ${sheet} (and ${jpg})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
