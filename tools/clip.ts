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
 * --setup "<js>": evaluated in the page (with `g` = window.__game) after the settle steps, before
 *   the script: spawn enemies, set state (e.g. "g.spawn('barker', 700, 960)").
 * --audio: renders the clip's sound offline (the real event router, hums, ambience, music) and
 *   muxes it into the mp4 (clips/<name>.wav too).
 * --slowmo: during combat slow motion (__game.render.timeScale() < 1) capture extra frames
 * rendered between steps, so the mp4 shows the slow-down (frame files then outnumber sim steps).
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
    /** Tape/replay clips: step this many frames before capturing (fast, not recorded). */
    skip: { type: 'string', default: '0' },
    /** Capture at most this many frames. */
    frames: { type: 'string' },
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
    /** Capture combat slow motion as extra interpolated frames (the video then runs longer than the sim). */
    slowmo: { type: 'boolean', default: false },
    /** Render the game's audio for the clip offline and mux it into the mp4. */
    audio: { type: 'boolean', default: false },
    /** JS run in the page after load and the settle steps, before the script (e.g. spawns). */
    setup: { type: 'string' },
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
  // L3 signature verbs and combat beats.
  'seizeTake',
  'seizeRefused',
  'catch',
  'levyThrow',
  'levyLand',
  'springBounce',
  'recoilHop',
  'plate',
  'gateOpen',
  'telegraph',
  'down',
  'repossess',
  'hurt',
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
    const queued: number = await page.evaluate(
      ({ script, replay, tape, pre, skip, hitboxes, trail, setup }) => {
        const g = window.__game;
        g.debug.hitboxes(hitboxes);
        g.debug.trail(trail);
        let n: number;
        if (replay) n = g.replay.play(replay);
        else if (tape) n = g.tape.play(tape);
        else {
          g.step(pre);
          if (setup) new Function('g', setup)(g);
          g.clearInput();
          n = g.input(script ?? '');
        }
        if (skip > 0) g.step(skip);
        return n - skip;
      },
      {
        script: args.script,
        replay,
        tape,
        pre: Number(args.pre),
        skip: Number(args.skip),
        hitboxes: args.hitboxes,
        trail: args.trail,
        setup: args.setup,
      },
    );
    const total = args.frames ? Math.min(queued, Number(args.frames)) : queued;
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
    let fileNo = 1;
    // Audio cues: one per sim step, at the video time of its last frame.
    const cues: unknown[] = [];
    for (let done = 0; done < total; ) {
      const k = Math.min(BATCH, total - done);
      const batch: { shots: string[]; t: TraceFrame; cue: unknown }[] = await page.evaluate(
        ({ k, s, label, slowmo, audio }) => {
          const g = window.__game;
          const out: { shots: string[]; t: TraceFrame; cue: unknown }[] = [];
          for (let i = 0; i < k; i++) {
            const t = g.trace(1)[0] as TraceFrame;
            let cue: unknown = null;
            if (audio) {
              const st = g.state();
              const cam = g.camera();
              cue = {
                listener: { x: cam.x + 960, y: cam.y + 540 },
                events: g.lastEvents().map((e) => e.e.raw),
                state: {
                  frame: st.frame,
                  roomId: st.roomId,
                  player: st.player,
                  local: {
                    sources: st.local.sources,
                    sounds: st.local.sounds,
                    levied: st.local.levied,
                    enemies: st.local.enemies.map((e) => ({ id: e.id, type: e.type })),
                  },
                },
              };
            }
            const shots: string[] = [];
            const ts = slowmo ? g.render.timeScale() : 1;
            const extra = ts < 0.99 ? Math.max(0, Math.round(1 / ts) - 1) : 0;
            for (let j = 1; j <= extra; j++) shots.push(g.screenshot(s, { label, alpha: j / (extra + 1) }));
            shots.push(g.screenshot(s, { label }));
            out.push({ shots, t, cue });
          }
          return out;
        },
        { k, s: scale, label, slowmo: args.slowmo, audio: args.audio },
      );
      for (const b of batch) {
        for (const shot of b.shots) writeFrame(fileNo++, shot);
        if (b.cue) cues.push({ ...(b.cue as object), t: (fileNo - 1) / 60 });
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
    const wav = join(outDir, `${name}.wav`);
    let audioIn: string[] = [];
    if (args.audio) {
      const seconds = fileNo / 60 + 0.5;
      const r: { wavBase64: string } = await page.evaluate(
        ({ cues, seconds }) =>
          window.__game.audio.renderTrack(
            cues as Parameters<typeof window.__game.audio.renderTrack>[0],
            seconds,
          ),
        { cues, seconds },
      );
      writeFileSync(wav, Buffer.from(r.wavBase64, 'base64'));
      audioIn = ['-i', wav, '-c:a', 'aac', '-b:a', '192k', '-shortest'];
    }
    const gif = join(outDir, `${name}.gif`);
    const sheet = join(outDir, `${name}-sheet.png`);
    const traceFile = join(outDir, `${name}-trace.txt`);
    writeFileSync(traceFile, `${formatTrace(trace)}\n`);
    run(ffmpeg, [
      ...input,
      ...audioIn,
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
