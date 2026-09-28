/**
 * Clip capture: runs the game headless, drives it with a scripted input sequence through
 * window.__game, grabs exactly one frame per sim step (deterministic, not wall-clock) and encodes
 * an mp4, a GIF and a contact-sheet PNG with ffmpeg into clips/. Every frame has its sim frame
 * number burned in, and a per-frame trace (<name>-trace.txt) is written next to the clip so
 * critiques can cite frame numbers.
 *
 *   npm run clip -- --script "R40 R+J22 R30 .30" --name run-jump
 *   npm run clip -- --script "R40 R+J22 R30 .30" --name run-jump --study     # trail + hitboxes + keyframe sheet
 *   npm run clip -- --room hub --spawn 5 --script "left*90" --hitboxes
 *   npm run clip -- --replay path/to/replay.json --name bug-123
 *   npm run clip -- --tape tests/replays/gym-04.none.json --trail --sheet events
 *   npm run clip -- --url https://mj1618.github.io/opusvania/ --script "jump*20 _*30"
 *
 * Overlays: --trail (ghost box every 2 frames for the last 60 + event markers: J jump, Jc coyote,
 * W wall jump, 2 double jump, L land, D/d dash start/end, C corner correction, H head bump,
 * X death; each marker shows its frame), --hitboxes, --no-label (no frame number).
 * Contact sheet: --sheet uniform (default: every Nth frame, N = --every or auto) or
 * --sheet events (keyframes around jump/land/wall-jump/dash/apex), --cols (6), --max-tiles (24),
 * --tile-width (320 uniform / 480 events).
 * --study = --trail --hitboxes --sheet events.
 *
 * See memory/clip-tool.md for details.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { formatTrace, type TraceFrame } from '../src/debug/headless';
import type { TapeFile } from '../src/debug/tape';

const { values: args } = parseArgs({
  options: {
    script: { type: 'string', short: 's' },
    replay: { type: 'string' },
    tape: { type: 'string' },
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
    trail: { type: 'boolean', default: false },
    study: { type: 'boolean', default: false },
    'no-label': { type: 'boolean', default: false },
    sheet: { type: 'string', default: 'uniform' },
    every: { type: 'string' },
    cols: { type: 'string', default: '6' },
    'tile-width': { type: 'string' },
    'max-tiles': { type: 'string', default: '24' },
    'keep-frames': { type: 'boolean', default: false },
    url: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help || (!args.script && !args.replay && !args.tape)) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0],
  );
  process.exit(args.help ? 0 : 1);
}
if (args.study) {
  args.trail = true;
  args.hitboxes = true;
  if (args.sheet === 'uniform') args.sheet = 'events';
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

const KEY_EVENTS = new Set([
  'jump',
  'land',
  'dashStart',
  'dashEnd',
  'wallSlideStart',
  'cornerCorrect',
  'headBump',
  'pogo',
  'death',
]);

/**
 * Picks contact-sheet tiles (file indices; file 0 = before the first step, file i = after step i)
 * around events rather than uniformly: each key event frame, its apex, and frames either side.
 */
export function pickKeyframes(trace: TraceFrame[], maxTiles: number): { indices: number[]; why: string[] } {
  const primary = new Map<number, string>();
  const secondary = new Set<number>();
  trace.forEach((t, i) => {
    const idx = i + 1;
    for (const e of t.ev) {
      if (!KEY_EVENTS.has(e.type)) continue;
      primary.set(
        idx,
        `${primary.get(idx) ? `${primary.get(idx)}+` : ''}${e.kind ? `${e.type}:${e.kind}` : e.type}`,
      );
      for (const d of [-3, -1, 2, 4]) secondary.add(idx + d);
    }
    const prev = trace[i - 1];
    if (prev && prev.p.vy < 0 && t.p.vy >= 0 && !t.p.grounded) primary.set(idx, primary.get(idx) ?? 'apex');
  });
  primary.set(0, primary.get(0) ?? 'start');
  primary.set(trace.length, primary.get(trace.length) ?? 'end');
  const chosen = new Map<number, string>();
  for (const [i, why] of [...primary.entries()].sort((a, b) => a[0] - b[0])) {
    if (chosen.size < maxTiles) chosen.set(i, why);
  }
  for (const i of [...secondary].sort((a, b) => a - b)) {
    if (chosen.size >= maxTiles) break;
    if (i >= 0 && i <= trace.length && !chosen.has(i)) chosen.set(i, '');
  }
  const indices = [...chosen.keys()].sort((a, b) => a - b);
  return { indices, why: indices.map((i) => chosen.get(i) ?? '') };
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
    const tape: TapeFile | undefined = args.tape
      ? JSON.parse(readFileSync(resolve(args.tape), 'utf8'))
      : undefined;
    const total: number = await page.evaluate(
      ({ script, replay, tape, pre, hitboxes, trail }) => {
        const g = window.__game;
        g.debug.hitboxes(hitboxes);
        g.debug.trail(trail);
        if (replay) return g.replay.play(replay);
        if (tape) return g.tape.play(tape);
        g.step(pre);
        g.clearInput();
        return g.input(script ?? '');
      },
      {
        script: args.script,
        replay,
        tape,
        pre: Number(args.pre),
        hitboxes: args.hitboxes,
        trail: args.trail,
      },
    );
    if (total === 0) throw new Error('script produced no frames');

    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    const scale = Number(args.scale);
    const label = !args['no-label'];
    const writeFrame = (i: number, dataUrl: string) =>
      writeFileSync(
        join(framesDir, `${String(i).padStart(5, '0')}.png`),
        Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'),
      );

    writeFrame(
      0,
      await page.evaluate(({ s, label }) => window.__game.screenshot(s, { label }), { s: scale, label }),
    );
    const trace: TraceFrame[] = [];
    const BATCH = 10;
    for (let done = 0; done < total; ) {
      const k = Math.min(BATCH, total - done);
      const batch: { shot: string; t: TraceFrame }[] = await page.evaluate(
        ({ k, s, label }) => {
          const out: { shot: string; t: TraceFrame }[] = [];
          for (let i = 0; i < k; i++) {
            const t = window.__game.trace(1)[0] as TraceFrame;
            out.push({ shot: window.__game.screenshot(s, { label }), t });
          }
          return out;
        },
        { k, s: scale, label },
      );
      for (const [i, b] of batch.entries()) {
        writeFrame(done + i + 1, b.shot);
        trace.push(b.t);
      }
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
    const traceFile = join(outDir, `${name}-trace.txt`);
    writeFileSync(traceFile, `${formatTrace(trace)}\n`);
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
    const cols = Number(args.cols);
    const maxTiles = Number(args['max-tiles']);
    let indices: number[];
    let why: string[] = [];
    if (args.sheet === 'events') {
      ({ indices, why } = pickKeyframes(trace, maxTiles));
    } else {
      const every = Number(args.every ?? Math.max(1, Math.ceil(frames / maxTiles)));
      indices = [];
      for (let i = 0; i < frames && indices.length < maxTiles; i += every) indices.push(i);
    }
    const rows = Math.max(1, Math.ceil(indices.length / cols));
    const tileW = Number(args['tile-width'] ?? (args.sheet === 'events' ? 480 : 320));
    const select = indices.map((i) => `eq(n\\,${i})`).join('+');
    run(ffmpeg, [
      ...input,
      '-vf',
      `select='${select}',scale=${tileW}:-1,tile=${cols}x${rows}:padding=4:color=white`,
      '-frames:v',
      '1',
      '-update',
      '1',
      sheet,
    ]);
    if (!args['keep-frames']) rmSync(framesDir, { recursive: true, force: true });

    const startFrame = final.state.frame - total;
    console.log(
      JSON.stringify(
        {
          mp4,
          gif,
          sheet,
          trace: traceFile,
          sheetMode: args.sheet,
          sheetTiles: indices.map((i, n) => ({ frame: startFrame + i, ...(why[n] ? { why: why[n] } : {}) })),
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
