/**
 * Clip capture for judging motion. Drives the game through window.__game against a running dev
 * server, grabs exactly one picture per sim step (deterministic, not wall-clock) and encodes an
 * mp4 and a GIF with ffmpeg into clips/.
 *
 *   npm run clip -- --script "R40 R+J22 R30 .30" --name run-jump
 *   npm run clip -- --script "R+J30 R14 . L+J20 L30" --at 3456,1280 --zoom 2 --name wall-jump
 *   npm run clip -- --ambient 180 --at 1440,1280 --name pool-idle      # sim frozen, scene animating
 *   npm run clip -- --script "R120" --wide --name pan                  # follow camera, full view
 *
 * --script   input DSL (src/input/script.ts): R/L/U/D, J jump, X dash, `.` nothing, count = frames
 * --ambient  capture this many frames of render time with the sim standing still instead
 * --at x,y   start with the feet centre here (sim px; default: the scene's spawn)
 * --zoom n   camera zoom, centred on the character (default 2). --wide = the follow camera at zoom 1
 * --size WxH capture size (default 960x540). --fps (default 60; the GIF is 30)
 * --pre n    settle steps before recording (default 30). --hitboxes, --no-gpu, --url, --keep-frames
 * --pickups  with the glints and the counter (left out by default)
 * --audio    with sound: the game's audio director records every step while the clip steps the game
 *            (muted, so nothing plays), then renders it offline (OfflineAudioContext, src/audio/offline.ts)
 *            and muxes it into the mp4; clips/<name>.wav beside it, and its levels printed (tools/lib/levels.ts).
 *            --ab also makes <name>-nohush.mp4: the same take without the Hush's layer (the owner's A/B).
 *            --setup "<js>" runs in the page (with `g` = window.__game) before recording (e.g. gather glints).
 *   npm run clip -- --audio --ab --pickups --wide --script "..." --name audio-m1
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseInputScript } from '../src/input/script';
import { DEFAULT_URL, launch, openGame } from './lib/browser';
import { formatLevels, measure } from './lib/levels';

const { values: args } = parseArgs({
  options: {
    script: { type: 'string', short: 's' },
    ambient: { type: 'string' },
    name: { type: 'string', short: 'n', default: 'clip' },
    at: { type: 'string' },
    zoom: { type: 'string', default: '2' },
    wide: { type: 'boolean', default: false },
    size: { type: 'string', default: '960x540' },
    fps: { type: 'string', default: '60' },
    pre: { type: 'string', default: '30' },
    hitboxes: { type: 'boolean', default: false },
    pickups: { type: 'boolean', default: false },
    audio: { type: 'boolean', default: false },
    ab: { type: 'boolean', default: false },
    setup: { type: 'string' },
    'no-gpu': { type: 'boolean', default: false },
    'keep-frames': { type: 'boolean', default: false },
    url: { type: 'string', default: DEFAULT_URL },
    out: { type: 'string', default: 'clips' },
    help: { type: 'boolean', short: 'h' },
  },
});
if (args.help || (!args.script && !args.ambient)) {
  console.log(
    'npm run clip -- --script "R40 R+J22 R30 .30" [--name n] [--at x,y] [--zoom 2 | --wide] [--ambient frames] [--size 960x540] [--hitboxes]',
  );
  console.log('See the header of tools/clip.ts.');
  process.exit(args.help ? 0 : 1);
}

function ffmpeg(argv: string[]): void {
  const bin = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';
  const r = spawnSync(bin, ['-y', '-loglevel', 'error', ...argv], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.error) throw new Error(`ffmpeg not found (${r.error.message}). Install it to encode clips.`);
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr?.toString().slice(-2000)}`);
}

async function main(): Promise<void> {
  const name = (args.name ?? 'clip').replace(/[^\w.-]/g, '_');
  const outDir = resolve(args.out ?? 'clips');
  const framesDir = join(outDir, `.frames-${name}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const [w = 960, h = 540] = (args.size ?? '').split('x').map(Number);
  const frames = args.ambient ? Number(args.ambient) : parseInputScript(args.script ?? '').length;
  const at = args.at ? args.at.split(',').map(Number) : null;

  const browser = await launch({ gpu: !args['no-gpu'] });
  const takes: Array<{ suffix: string; wav: string }> = [];
  try {
    const page = await openGame(browser, args.url ?? DEFAULT_URL, { width: w, height: h }, 1, args.pickups);
    if (args.setup) await page.evaluate(`(() => { const g = window.__game; ${args.setup} })()`);
    await page.evaluate(
      ([at, zoom, wide, pre, hitboxes, script, audio]) => {
        const g = window.__game;
        if (at) g.teleport(at[0] ?? 0, at[1] ?? 0);
        g.cam(wide ? null : { on: 'player', zoom });
        g.debug.hitboxes(hitboxes);
        g.step(pre);
        if (audio) g.audio?.record(true);
        if (script) g.input(script);
      },
      [
        at,
        Number(args.zoom),
        args.wide,
        Number(args.pre),
        args.hitboxes,
        args.ambient ? '' : args.script,
        args.audio,
      ] as const,
    );
    const canvas = page.locator('#game');
    for (let i = 0; i <= frames; i++) {
      if (i > 0)
        await page.evaluate(
          (amb) => (amb ? window.__game.tick(1) : window.__game.step(1).frame),
          !!args.ambient,
        );
      writeFileSync(
        join(framesDir, `${String(i).padStart(5, '0')}.png`),
        await canvas.screenshot({ type: 'png' }),
      );
    }
    if (args.audio) {
      // The tape's first step is the clip's frame 1, at 1/60 s.
      const runs: Array<{ suffix: string; mute: string[] }> = [{ suffix: '', mute: [] }];
      if (args.ab) runs.push({ suffix: '-nohush', mute: ['hush'] });
      for (const run of runs) {
        const r = await page.evaluate(
          (mute) => window.__game.audio?.render({ mute: mute as never[] }) ?? null,
          run.mute,
        );
        if (!r) throw new Error('This build has no __game.audio.');
        const wav = join(outDir, `${name}${run.suffix}.wav`);
        writeFileSync(wav, Buffer.from(r.wavBase64, 'base64'));
        takes.push({ suffix: run.suffix, wav });
        console.log(
          `audio${run.suffix}: ${r.seconds.toFixed(1)} s rendered in ${(r.renderMs / 1000).toFixed(2)} s (bake ${r.bakeMs.toFixed(0)} ms); cues ${JSON.stringify(r.cues)}`,
        );
      }
    }
  } finally {
    await browser.close();
  }

  encode(framesDir, outDir, name, takes);
  for (const t of takes) console.log(`levels${t.suffix}:\n${formatLevels(measure(t.wav))}`);
  console.log(`${frames + 1} frames`);
}

/** framesDir/%05d.png -> clips/<name>.mp4 (one per audio take, sound muxed in) and .gif. */
function encode(
  framesDir: string,
  outDir: string,
  name: string,
  takes: Array<{ suffix: string; wav: string }> = [],
): void {
  const input = ['-framerate', args.fps ?? '60', '-i', join(framesDir, '%05d.png')];
  const gif = join(outDir, `${name}.gif`);
  for (const take of takes.length ? takes : [null]) {
    const mp4 = join(outDir, `${name}${take?.suffix ?? ''}.mp4`);
    const sound = take ? ['-i', take.wav, '-c:a', 'aac', '-b:a', '192k', '-shortest'] : [];
    ffmpeg([
      ...input,
      ...sound,
      '-vf',
      'pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '16',
      mp4,
    ]);
    console.log(`  ${mp4}`);
  }
  ffmpeg([
    ...input,
    '-vf',
    'fps=30,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    gif,
  ]);
  if (!args['keep-frames']) rmSync(framesDir, { recursive: true, force: true });
  console.log(`  ${gif}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
