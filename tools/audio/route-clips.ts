/**
 * Review clips with sound from a route tape (tools/playtest/route-video.ts `plan` -> tape.json, legs.json): the page
 * replays the tape (follow camera, zoom 1, glints and HUD on), fast-forwards to each clip's start, records the audio
 * director's tape while it takes one picture every 2 sim frames (30 fps, real time), renders the sound offline
 * (src/audio/offline.ts) and muxes an mp4 small enough for a phone (Matt reviews there). Levels are printed.
 *
 *   npx tsx tools/audio/route-clips.ts --dir <route dir> --url http://localhost:5240 --out playtest-reports/x \
 *     --clip opening:0:1700 --clip boss:15900:19400 [--size 1280x720] [--crf 26] [--ab]
 *
 * Build a frozen copy for the page (`vite build --outDir <scratch>` + `vite preview`) so other builders' edits do
 * not reload it mid-clip (memory/audio.md gotchas). `--ab` adds a take without the score (`-noscore`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { launch, openGame } from '../lib/browser';
import { formatLevels, measure } from '../lib/levels';

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:5240/opusvania/' },
    out: { type: 'string', default: 'playtest-reports/audio-clips' },
    clip: { type: 'string', multiple: true },
    size: { type: 'string', default: '1280x720' },
    crf: { type: 'string', default: '26' },
    start: { type: 'string', default: 'cn-hatch' },
    ab: { type: 'boolean', default: false },
    /** Sound only (fast, for listening by numbers): a WAV per clip, no pictures. */
    wav: { type: 'boolean', default: false },
    /** Also the score alone, the bed alone, and all but the score (WAVs; with --wav). */
    stems: { type: 'boolean', default: false },
  },
});
if (!args.dir || !args.clip?.length) {
  console.log(
    'npx tsx tools/audio/route-clips.ts --dir <route dir> --clip name:from:to [--clip ...] [--url ...]',
  );
  process.exit(1);
}

function ffmpeg(argv: string[]): void {
  const bin = existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg';
  const r = spawnSync(bin, ['-y', '-loglevel', 'error', ...argv], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${r.stderr?.toString().slice(-2000)}`);
}

type G = {
  step(n: number): { frame: number };
  load(): unknown;
  input(t: unknown): number;
  cam(c: unknown): unknown;
  teleport(x: number, y: number): unknown;
  flag(f: string): unknown;
  debug: { labels?: (on: boolean) => unknown };
  audio: {
    record(on?: boolean): number;
    render(
      o: unknown,
    ): Promise<{ wavBase64: string; seconds: number; renderMs: number; cues: Record<string, number> }>;
  };
};

async function main(): Promise<void> {
  const dir = resolve(args.dir as string);
  const tape = JSON.parse(readFileSync(join(dir, 'tape.json'), 'utf8')) as number[];
  const warps =
    (
      JSON.parse(readFileSync(join(dir, 'legs.json'), 'utf8')) as {
        warps?: Array<{ f: number; x: number; y: number; flag?: string }>;
      }
    ).warps ?? [];
  const clips = (args.clip ?? []).map((c) => {
    const [name, from, to] = c.split(':');
    return { name: name as string, from: Number(from), to: Number(to) };
  });
  const out = resolve(args.out as string);
  mkdirSync(out, { recursive: true });
  const [w = 1280, h = 720] = (args.size as string).split('x').map(Number);
  const browser = await launch();
  try {
    for (const clip of clips) {
      const page = await openGame(browser, args.url as string, { width: w, height: h }, 1, true, args.start);
      page.setDefaultTimeout(0);
      await page.evaluate(
        `(() => { const g = window.__game; g.cam(null); g.debug.labels?.(false); g.load(); g.input(${JSON.stringify(tape)}); })()`,
      );
      let done = 0;
      const stepTo = async (target: number) => {
        while (done < target) {
          for (const wp of warps)
            if (wp.f === done)
              await page.evaluate(
                ([x, y, f]) => {
                  const g = (window as unknown as { __game: G }).__game;
                  if (f) g.flag(f as string);
                  else g.teleport(x as number, y as number);
                },
                [wp.x, wp.y, wp.flag ?? ''] as const,
              );
          const nextWarp = warps.find((wp) => wp.f > done)?.f ?? Number.POSITIVE_INFINITY;
          const n = Math.min(300, target - done, nextWarp - done);
          await page.evaluate((k) => (window as unknown as { __game: G }).__game.step(k).frame, n);
          done += n;
        }
      };
      await stepTo(clip.from);
      const frames = join(out, `.frames-${clip.name}`);
      rmSync(frames, { recursive: true, force: true });
      mkdirSync(frames, { recursive: true });
      await page.evaluate(() => (window as unknown as { __game: G }).__game.audio.record(true));
      const canvas = page.locator('#game');
      let shot = 0;
      if (args.wav) await stepTo(clip.to);
      while (done < clip.to) {
        await stepTo(Math.min(clip.to, done + 2));
        writeFileSync(
          join(frames, `${String(shot++).padStart(5, '0')}.jpg`),
          await canvas.screenshot({ type: 'jpeg', quality: 90 }),
        );
      }
      const takes: Array<{ suffix: string; mute: string[] }> = [{ suffix: '', mute: [] }];
      if (args.ab) takes.push({ suffix: '-noscore', mute: ['score'] });
      if (args.stems)
        takes.push(
          { suffix: '-score', mute: ['world', 'hero', 'combat', 'lantern', 'creatures'] },
          { suffix: '-world', mute: ['score', 'hero', 'combat', 'lantern', 'creatures'] },
          { suffix: '-noscore', mute: ['score'] },
        );
      for (const take of takes) {
        const r = await page.evaluate(
          (mute) => (window as unknown as { __game: G }).__game.audio.render({ mute, tail: 0.5 }),
          take.mute,
        );
        const wav = join(out, `${clip.name}${take.suffix}.wav`);
        writeFileSync(wav, Buffer.from(r.wavBase64, 'base64'));
        if (args.wav) {
          console.log(
            `${clip.name}${take.suffix}: ${r.seconds.toFixed(1)} s rendered in ${(r.renderMs / 1000).toFixed(1)} s`,
          );
          console.log(`  cues ${JSON.stringify(r.cues)}`);
          console.log(formatLevels(measure(wav)));
          continue;
        }
        const mp4 = join(out, `${clip.name}${take.suffix}.mp4`);
        // Picture i shows the state after 2(i+1) steps: the sound starts a picture early (1/30 s) to match.
        ffmpeg([
          '-framerate',
          '30',
          '-i',
          join(frames, '%05d.jpg'),
          '-ss',
          String(1 / 30),
          '-i',
          wav,
          '-c:v',
          'libx264',
          '-preset',
          'slow',
          '-crf',
          args.crf as string,
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '160k',
          '-shortest',
          '-movflags',
          '+faststart',
          mp4,
        ]);
        const mb = statSync(mp4).size / 1e6;
        console.log(
          `${clip.name}${take.suffix}: ${(shot / 30).toFixed(1)} s, ${mb.toFixed(1)} MB, rendered in ${(r.renderMs / 1000).toFixed(1)} s`,
        );
        console.log(`  cues ${JSON.stringify(r.cues)}`);
        console.log(formatLevels(measure(wav)));
      }
      rmSync(frames, { recursive: true, force: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
