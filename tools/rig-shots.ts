/**
 * Close-up follow-cam captures of Kid for character-animation review (memory/rig.md).
 *
 *   npm run rig:shots -- --room gym-07 --script "R30 R+J20 L+J10 .40" --name wall
 *   npm run rig:shots -- --room the-pit --script ".30 A1 .8 A1 .30" --crop 480x270 --zoom 2 --every 2
 *   npm run rig:shots -- --room gym-01 --script "R60" --crop 1920x1080 --zoom 0.5 --mp4   # full frame
 *
 * Steps the game in manual mode one sim frame at a time (deterministic, like `npm run clip`) and
 * crops a window of `--crop` canvas px centred on Kid (smoothed by `--follow`, 1 = locked), scaled
 * by `--zoom`. Writes clips/rig/<name>/NNNNN.png (file N = N frames after the start), a contact
 * sheet (`--every` N frames, `--cols`) and, with --mp4, an H.264 mp4. `--setup` is JS run in the
 * page first with `g` = window.__game (abilities, spawns, tuning); `--pre` settle steps before it.
 * `--hook "N:js"` (repeatable) runs js just before file N is stepped; `--skip N` steps N frames
 * of the script before capturing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const { values: args } = parseArgs({
  options: {
    room: { type: 'string' },
    spawn: { type: 'string' },
    script: { type: 'string', default: '' },
    tape: { type: 'string' },
    hook: { type: 'string', multiple: true },
    skip: { type: 'string', default: '0' },
    setup: { type: 'string', default: '' },
    name: { type: 'string', default: 'shot' },
    pre: { type: 'string', default: '10' },
    seed: { type: 'string', default: '1' },
    crop: { type: 'string', default: '360x270' },
    zoom: { type: 'string', default: '2' },
    follow: { type: 'string', default: '1' },
    every: { type: 'string', default: '3' },
    cols: { type: 'string', default: '8' },
    frames: { type: 'string' },
    mp4: { type: 'boolean', default: false },
    sheet: { type: 'boolean', default: true },
    'no-ui': { type: 'boolean', default: true },
    offset: { type: 'string', default: '0,-20' },
  },
});

const ROOT = resolve(import.meta.dirname, '..');
const outDir = join(ROOT, 'clips', 'rig');
const framesDir = join(outDir, args.name ?? 'shot');
const ffmpeg = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';

function run(cmd: string, argv: string[]): void {
  const r = spawnSync(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${r.stderr?.toString().slice(-2000)}`);
}

async function main(): Promise<void> {
  const server: ViteDevServer = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { port: 0, strictPort: false },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error('vite did not report a URL');
  const q = new URLSearchParams({ seed: args.seed ?? '1', manual: '1' });
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
    const [cw, ch] = (args.crop ?? '360x270').split('x').map(Number) as [number, number];
    const [ox, oy] = (args.offset ?? '0,0').split(',').map(Number) as [number, number];
    const total: number = await page.evaluate(
      ({ script, setup, pre, ui, tape, skip }) => {
        const g = window.__game;
        if (ui) g.gfx.set({ ui: false });
        let n: number;
        if (tape) n = g.tape.play(tape);
        else {
          g.step(pre);
          if (setup) new Function('g', setup)(g);
          g.clearInput();
          n = g.input(script);
        }
        if (skip > 0) g.step(skip);
        return n - skip;
      },
      {
        script: args.script ?? '',
        setup: args.setup ?? '',
        pre: Number(args.pre),
        ui: args['no-ui'],
        tape: args.tape ? JSON.parse(readFileSync(resolve(args.tape), 'utf8')) : null,
        skip: Number(args.skip),
      },
    );
    const n = args.frames ? Number(args.frames) : total;
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    // --hook "N:js" runs js (g = window.__game) just before file N's step (e.g. to edit state).
    const hooks: Record<number, string> = {};
    for (const h of args.hook ?? []) {
      const at = h.indexOf(':');
      hooks[Number(h.slice(0, at))] = h.slice(at + 1);
    }
    const BATCH = 8;
    const log: string[] = [];
    for (let done = 0; done <= n; ) {
      const k = Math.min(BATCH, n + 1 - done);
      const shots: { png: string; line: string }[] = await page.evaluate(
        ({ k, first, cw, ch, zoom, follow, ox, oy, hooks, base }) => {
          const g = window.__game;
          const w = window as unknown as { __rigCam?: { x: number; y: number } };
          const out: { png: string; line: string }[] = [];
          for (let i = 0; i < k; i++) {
            const hk = hooks[base + i];
            if (hk) new Function('g', hk)(g);
            if (!(first && i === 0)) g.step(1);
            g.screenshot(0.01);
            const src = document.querySelector('canvas') as HTMLCanvasElement;
            const pr = g.render.rects().find((r) => r.kind === 'player');
            const tx = (pr ? pr.x + pr.w / 2 : src.width / 2) + ox;
            const ty = (pr ? pr.y + pr.h / 2 : src.height / 2) + oy;
            const cam = w.__rigCam ?? { x: tx, y: ty };
            cam.x += (tx - cam.x) * follow;
            cam.y += (ty - cam.y) * follow;
            w.__rigCam = cam;
            const sx = Math.max(0, Math.min(src.width - cw, Math.round(cam.x - cw / 2)));
            const sy = Math.max(0, Math.min(src.height - ch, Math.round(cam.y - ch / 2)));
            const c = document.createElement('canvas');
            c.width = Math.round(cw * zoom);
            c.height = Math.round(ch * zoom);
            const ctx = c.getContext('2d') as CanvasRenderingContext2D;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(src, sx, sy, cw, ch, 0, 0, c.width, c.height);
            ctx.font = `bold ${Math.max(10, Math.round(c.height * 0.05))}px monospace`;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, 0, 70, Math.round(c.height * 0.07));
            ctx.fillStyle = '#ffe14c';
            ctx.textBaseline = 'top';
            ctx.fillText(`f${g.state().frame}`, 4, 2);
            const st = g.state();
            const p = st.player;
            const ev = g
              .lastEvents()
              .map((e) => (e.e.kind ? `${e.e.type}:${e.e.kind}` : e.e.type))
              .join(',');
            const mv = p.move ? `${p.move.id}:${p.move.frame}` : '';
            out.push({
              png: c.toDataURL('image/png'),
              line: `f${st.frame} ${p.state} g=${p.grounded ? 1 : 0} vx=${p.vx.toFixed(1)} vy=${p.vy.toFixed(1)} ${mv} ${ev}`,
            });
          }
          return out;
        },
        {
          k,
          first: done === 0,
          cw,
          ch,
          zoom: Number(args.zoom),
          follow: Number(args.follow),
          ox,
          oy,
          hooks,
          base: done,
        },
      );
      for (const [i, s] of shots.entries()) {
        writeFileSync(
          join(framesDir, `${String(done + i).padStart(5, '0')}.png`),
          Buffer.from(s.png.split(',')[1] ?? '', 'base64'),
        );
        log.push(`${String(done + i).padStart(5, '0')} ${s.line}`);
      }
      done += k;
      process.stdout.write(`\rcaptured ${Math.min(done, n + 1)}/${n + 1}`);
    }
    process.stdout.write('\n');
    writeFileSync(join(outDir, `${args.name}-log.txt`), `${log.join('\n')}\n`);
    const input = ['-y', '-framerate', '60', '-i', join(framesDir, '%05d.png')];
    if (args.sheet) {
      const every = Number(args.every);
      const idx: number[] = [];
      for (let i = 0; i <= n && idx.length < 48; i += every) idx.push(i);
      const cols = Number(args.cols);
      const rows = Math.ceil(idx.length / cols);
      const sel = idx.map((i) => `eq(n\\,${i})`).join('+');
      run(ffmpeg, [
        ...input,
        '-vf',
        `select='${sel}',tile=${cols}x${rows}:padding=3:color=white`,
        '-frames:v',
        '1',
        '-update',
        '1',
        join(outDir, `${args.name}-sheet.png`),
      ]);
      console.log(join(outDir, `${args.name}-sheet.png`));
    }
    if (args.mp4) {
      const mp4 = join(outDir, `${args.name}.mp4`);
      run(ffmpeg, [
        ...input,
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '17',
        '-movflags',
        '+faststart',
        mp4,
      ]);
      console.log(mp4);
    }
    console.log(framesDir);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
