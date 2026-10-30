/**
 * The figure-ground check (canopy review r6 #2 and #5): every wide stop of the rooms at 16:9, 16:10 and 21:9, each
 * frame scaled to 480 px wide and measured in Rec.709 luma (0-255):
 *   - near-black (< 16) at most 50% of the frame (HK's King's Pass 50%, Crossroads 34%, Ori 24%);
 *   - mid-tones (50-150) at least 20% (HK 23-41%, Ori 22%);
 *   - the largest flat region (4-connected, within one 12-luma bin, bins offset by 0 and 6) at most 35%;
 *   - a few named stops keep a minimum mean (the hub's clearing: 25).
 *
 *   npm run look:check                                  every Canopy room with wide stops (dev server on 5180)
 *   npm run look:check -- --rooms=cn-hub,cn-well --url=http://localhost:5212 [--out=dir] [--sizes=1920x1080]
 *
 * Exits 1 if any frame fails. Same code + same flags = same pictures (tools/shots.ts's stepping).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { getRoom, ROOMS } from '../src/scene/index';
import { DEFAULT_URL, launch, openGame } from './lib/browser';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: DEFAULT_URL },
    rooms: { type: 'string' },
    sizes: { type: 'string', default: '1920x1080,1920x1200,2560x1080' },
    out: { type: 'string', default: 'shots/look-check' },
  },
});

export const LOOK_CHECK = {
  dark: 16,
  darkMax: 0.5,
  mid: [50, 150],
  midMin: 0.2,
  flatMax: 0.35,
  bin: 12,
  width: 480,
};
/** Named stops (`room:stop`) that must keep this mean luma. */
const MIN_MEAN: Record<string, number> = { 'cn-hub:clearing': 25 };

function luma480(file: string): { w: number; h: number; y: Float32Array } {
  const W = LOOK_CHECK.width;
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  const [w0 = 1, h0 = 1] = probe.trim().split(',').map(Number);
  const H = Math.round((W * h0) / w0);
  const rgb = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      file,
      '-vf',
      `scale=${W}:${H}:flags=bilinear`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: W * H * 3 + 1024 },
  );
  const y = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++)
    y[i] =
      0.2126 * (rgb[i * 3] as number) +
      0.7152 * (rgb[i * 3 + 1] as number) +
      0.0722 * (rgb[i * 3 + 2] as number);
  return { w: W, h: H, y };
}

/** The largest 4-connected region whose pixels share a bin of `bin` luma (bins offset by 0 and bin / 2), as a share. */
export function largestFlat(y: Float32Array, w: number, h: number, bin: number): number {
  let best = 0;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (const off of [0, bin / 2]) {
    seen.fill(0);
    for (let s = 0; s < w * h; s++) {
      if (seen[s]) continue;
      const b = Math.floor(((y[s] as number) + off) / bin);
      let n = 0;
      let top = 0;
      stack[top++] = s;
      seen[s] = 1;
      while (top) {
        const p = stack[--top] as number;
        n++;
        const x = p % w;
        for (const q of [p - 1, p + 1, p - w, p + w]) {
          if (q < 0 || q >= w * h || seen[q]) continue;
          if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
          if (Math.floor(((y[q] as number) + off) / bin) !== b) continue;
          seen[q] = 1;
          stack[top++] = q;
        }
      }
      best = Math.max(best, n);
    }
  }
  return best / (w * h);
}

async function main(): Promise<void> {
  const rooms = args.rooms
    ? args.rooms.split(',')
    : Object.keys(ROOMS).filter((id) => id.startsWith('cn-') && (ROOMS[id]?.shots?.wide?.length ?? 0) > 0);
  const sizes = (args.sizes ?? '').split(',').map((s) => s.split('x').map(Number) as [number, number]);
  const outDir = resolve(args.out ?? 'shots/look-check');
  const browser = await launch({ gpu: true });
  const fails: string[] = [];
  let frames = 0;
  try {
    for (const [W, H] of sizes) {
      for (const id of rooms) {
        const room = getRoom(id);
        const dir = join(outDir, `${W}x${H}`, id);
        mkdirSync(dir, { recursive: true });
        const page = await openGame(browser, args.url ?? DEFAULT_URL, { width: W, height: H }, 1, true, id);
        for (const [i, stop] of (room.shots?.wide ?? []).entries()) {
          await page.evaluate(
            ([x, y]) => {
              const g = window.__game;
              g.cam(null);
              g.teleport(x, y);
              g.step(20);
              g.tick(60);
            },
            [stop.x, stop.y] as const,
          );
          const file = join(dir, `wide-${i + 1}-${stop.name}.png`);
          writeFileSync(file, await page.locator('#game').screenshot({ type: 'png' }));
          const { w, h, y } = luma480(file);
          let sum = 0;
          let dark = 0;
          let mid = 0;
          for (const v of y) {
            sum += v;
            if (v < LOOK_CHECK.dark) dark++;
            if (v >= (LOOK_CHECK.mid[0] as number) && v <= (LOOK_CHECK.mid[1] as number)) mid++;
          }
          const n = y.length;
          const flat = largestFlat(y, w, h, LOOK_CHECK.bin);
          const mean = sum / n;
          const bad: string[] = [];
          if (dark / n > LOOK_CHECK.darkMax) bad.push(`near-black ${Math.round((100 * dark) / n)}%`);
          if (mid / n < LOOK_CHECK.midMin) bad.push(`mid ${Math.round((100 * mid) / n)}%`);
          if (flat > LOOK_CHECK.flatMax) bad.push(`flat ${Math.round(100 * flat)}%`);
          const want = MIN_MEAN[`${id}:${stop.name}`];
          if (want !== undefined && mean < want) bad.push(`mean ${mean.toFixed(1)} < ${want}`);
          const line = `${W}x${H} ${id} ${stop.name}: mean ${mean.toFixed(1)}, near-black ${Math.round((100 * dark) / n)}%, mid ${Math.round((100 * mid) / n)}%, flat ${Math.round(100 * flat)}%`;
          console.log(bad.length ? `FAIL ${line} (${bad.join(', ')})` : `ok   ${line}`);
          if (bad.length) fails.push(line);
          frames++;
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${frames - fails.length} of ${frames} frames pass.`);
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
