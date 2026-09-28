/**
 * Clip capture: runs the game headless, drives it with a scripted input sequence through
 * window.__game, grabs exactly one frame per sim step (deterministic, not wall-clock) and encodes
 * an mp4, a GIF and a contact-sheet PNG with ffmpeg into clips/.
 *
 *   npm run clip -- --script "right*40 right+jump*20 right*30 _*30" --name run-jump
 *   npm run clip -- --room hall --spawn a --script "left*90" --hitboxes
 *   npm run clip -- --replay path/to/replay.json --name bug-123
 *   npm run clip -- --url https://mj1618.github.io/opusvania/ --script "jump*20 _*30"
 *
 * See memory/clip-tool.md for details.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const { values: args } = parseArgs({
  options: {
    script: { type: 'string', short: 's' },
    replay: { type: 'string' },
    name: { type: 'string', short: 'n' },
    room: { type: 'string' },
    spawn: { type: 'string' },
    seed: { type: 'string', default: '1' },
    /** Steps to run before recording starts (lets the player settle). */
    pre: { type: 'string', default: '10' },
    /** Capture scale of the 1920x1080 canvas. */
    scale: { type: 'string', default: '0.5' },
    'gif-width': { type: 'string', default: '640' },
    'gif-fps': { type: 'string', default: '30' },
    hitboxes: { type: 'boolean', default: false },
    'keep-frames': { type: 'boolean', default: false },
    url: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help || (!args.script && !args.replay)) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(args.help ? 0 : 1);
}

const ROOT = resolve(import.meta.dirname, '..');
const name = (args.name ?? `clip-${new Date().toISOString().replace(/[:.]/g, '-')}`).replace(/[^\w.-]/g, '_');
const outDir = join(ROOT, 'clips');
const framesDir = join(outDir, `.frames-${name}`);
const ffmpeg = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';

function run(cmd: string, argv: string[]): void {
  const r = spawnSync(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${r.stderr?.toString().slice(-2000)}`);
}

async function main(): Promise<void> {
  let server: ViteDevServer | undefined;
  let baseUrl = args.url;
  if (!baseUrl) {
    server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, strictPort: false } });
    await server.listen();
    baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl) throw new Error('vite did not report a URL');
  }
  const q = new URLSearchParams({ seed: args.seed ?? '1' });
  q.set('manual', '1');
  if (args.room) q.set('room', args.room);
  if (args.spawn) q.set('spawn', args.spawn);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.error('[page error]', e));
    await page.goto(`${baseUrl.replace(/\/?$/, '/')}?${q}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true' && !!window.__game, null, {
      timeout: 30_000,
    });

    const replay = args.replay ? JSON.parse(readFileSync(resolve(args.replay), 'utf8')) : undefined;
    const total: number = await page.evaluate(
      ({ script, replay, pre, hitboxes }) => {
        const g = window.__game;
        g.debug.hitboxes(hitboxes);
        if (replay) return g.replay.play(replay);
        g.step(pre);
        g.clearInput();
        return g.input(script ?? '');
      },
      { script: args.script, replay, pre: Number(args.pre), hitboxes: args.hitboxes },
    );
    if (total === 0) throw new Error('script produced no frames');

    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    const scale = Number(args.scale);
    const writeFrame = (i: number, dataUrl: string) =>
      writeFileSync(
        join(framesDir, `${String(i).padStart(5, '0')}.png`),
        Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'),
      );

    writeFrame(0, await page.evaluate((s) => window.__game.screenshot(s), scale));
    const BATCH = 10;
    for (let done = 0; done < total; ) {
      const k = Math.min(BATCH, total - done);
      const shots: string[] = await page.evaluate(
        ({ k, s }) => {
          const out: string[] = [];
          for (let i = 0; i < k; i++) {
            window.__game.step(1);
            out.push(window.__game.screenshot(s));
          }
          return out;
        },
        { k, s: scale },
      );
      for (const [i, d] of shots.entries()) writeFrame(done + i + 1, d);
      done += k;
      process.stdout.write(`\rcaptured ${done}/${total} frames`);
    }
    process.stdout.write('\n');
    const final = await page.evaluate(() => ({ state: window.__game.state(), hash: window.__game.hash() }));

    mkdirSync(outDir, { recursive: true });
    const input = ['-y', '-framerate', '60', '-i', join(framesDir, '%05d.png')];
    const mp4 = join(outDir, `${name}.mp4`);
    const gif = join(outDir, `${name}.gif`);
    const sheet = join(outDir, `${name}-sheet.png`);
    run(ffmpeg, [
      ...input,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '18',
      '-movflags',
      '+faststart',
      mp4,
    ]);
    run(ffmpeg, [
      ...input,
      '-vf',
      `fps=${args['gif-fps']},scale=${args['gif-width']}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      '-loop',
      '0',
      gif,
    ]);
    const frames = total + 1;
    const every = Math.max(1, Math.ceil(frames / 24));
    run(ffmpeg, [
      ...input,
      '-vf',
      `select='not(mod(n\\,${every}))',scale=320:-1,tile=6x4:padding=4:color=white`,
      '-frames:v',
      '1',
      '-update',
      '1',
      sheet,
    ]);
    if (!args['keep-frames']) rmSync(framesDir, { recursive: true, force: true });

    console.log(
      JSON.stringify(
        {
          mp4,
          gif,
          sheet,
          sheetEveryNFrames: every,
          frames,
          framesDir: args['keep-frames'] ? framesDir : undefined,
          finalHash: final.hash,
          finalFrame: final.state.frame,
          player: final.state.player,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await server?.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
