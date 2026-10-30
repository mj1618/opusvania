/**
 * The figure-ground check (canopy review r6 #2 and #5, r7 #3): every wide stop of the rooms at 16:9, 16:10 and 21:9,
 * each frame scaled to 480 px wide and measured in Rec.709 luma (0-255). The frame bars are measured over the air
 * (outside the solids, the room's box and her box): the ground is meant to be a black cut-out (HK's King's Pass is
 * 50-56% near-black over the whole frame, its flat black 28-50%; Silksong's Tut_03 75%), so it is judged by its own
 * bars below, the air by these:
 *   - near-black (< 16) at most 50% (HK's King's Pass 50%, Crossroads 34%, Ori 24%);
 *   - mid-tones (50-150) at least 20% (HK 23-41%, Ori 22%);
 *   - the largest flat region (4-connected, within one 12-luma bin, bins offset by 0 and 6) at most 35%;
 *   - a few named stops keep a minimum mean (the hub's clearing: 25);
 *   - figure-ground by the collision (review r7 #3): the frame is split by the room's solids. The solid interior
 *     (pixels inside the solids more than `solidDeep` px from their edge) has a mean luma <= `solidMax` (HK and
 *     Silksong's ground 0-5), and the air (outside every solid and her box) has a median >= `airK` x that mean.
 *     Frames with under `solidMinShare` of interior skip both.
 *   - the air (review r8 #6): its mean luma <= `airMax`, its mean HSV saturation >= `airSat`;
 *   - deep solid (review r8 #2): at most 30% of a stop, a room's median <= 20%: reported (`--share-fails` fails).
 *   - sealed air (`marks.sealed`, canopy r9b: a hollow in the wood she cannot enter) is neither air nor solid: left out
 *     of both, and its mean must stay under the air's median (`hollowK` x): a hollow as light as the air reads as a
 *     space she could fall into.
 *
 *   npm run look:check                                  every Canopy room with wide stops (dev server on 5180)
 *   npm run look:check -- --rooms=cn-hub,cn-well --url=http://localhost:5212 [--out=dir] [--sizes=1920x1080] [--masks]
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
    /** Also write each frame's split as a grey PGM beside it (black her box, 80 air, 160 solid interior, 240 the rest). */
    masks: { type: 'boolean', default: false },
    /** Fail on the deep-solid share too (review r8 #2), not only report it. */
    'share-fails': { type: 'boolean', default: false },
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
  /**
   * World px inside a solid's edge before a pixel counts as its deep interior, judged near-black (canopy r9, review r8
   * #3: the core starts 120-200 px in, the outer band mid-dark, carrying the lobes, knuckles and roots).
   */
  solidDeep: 200,
  solidMax: 12,
  airK: 4,
  solidMinShare: 0.02,
  /**
   * How much of the frame is deep solid (inside the solids more than `shareDeep` px; review r8 #2): at most `shareMax`
   * of a wide stop, the room's median at most `shareMedian`. Reported, not failed, until the level builder's hollowed
   * walls land (`--share-fails` fails on it).
   */
  shareDeep: 96,
  shareMax: 0.3,
  shareMedian: 0.2,
  /** The air (review r8 #6): its mean luma at most this (the well's paper fog was 91-113)... */
  airMax: 85,
  /** ... and its mean HSV saturation at least this (the den and the nest were grey). */
  airSat: 0.12,
  /** Sealed air's mean luma at most this share of the air's median (frames with >= `solidMinShare` of it). */
  hollowK: 0.8,
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Frame {
  room: { w: number; h: number };
  cam: { x: number; y: number; zoom: number };
  view: { w: number; h: number };
  solids: Box[];
  hero: Box;
  /** The room's sealed air (`marks.sealed`). */
  sealed?: Box[];
}

/**
 * Per pixel of the 480 px frame: 1 = air, 2 = solid interior, 3 = the rest of the ground (a solid's outer band, the
 * wood beyond the room's box), 4 = sealed air (a hollow in the wood), 0 = her box.
 * Screen to world: the view's centre is the camera, `view.w` logical px across the frame, divided by the zoom.
 */
export function splitByCollision(f: Frame, w: number, h: number, deep: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const inside = (x: number, y: number): boolean => {
    for (const s of f.solids) if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return true;
    return false;
  };
  const k = f.view.w / w / f.cam.zoom;
  const ring: [number, number][] = [];
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    ring.push([Math.cos(t) * deep, Math.sin(t) * deep], [Math.cos(t) * deep * 0.5, Math.sin(t) * deep * 0.5]);
  }
  const hb = f.hero;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = f.cam.x + (i + 0.5 - w / 2) * k;
      const y = f.cam.y + (j + 0.5 - h / 2) * k;
      const pad = 24;
      if (x > hb.x - pad && x < hb.x + hb.w + pad && y > hb.y - pad && y < hb.y + hb.h + pad) {
        out[j * w + i] = 0;
        continue;
      }
      if (x < 0 || y < 0 || x > f.room.w || y > f.room.h) {
        out[j * w + i] = 3;
        continue;
      }
      if ((f.sealed ?? []).some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) {
        out[j * w + i] = 4;
        continue;
      }
      if (!inside(x, y)) {
        out[j * w + i] = 1;
        continue;
      }
      out[j * w + i] = ring.every(([dx, dy]) => inside(x + dx, y + dy)) ? 2 : 3;
    }
  }
  return out;
}

/** The solid interior's mean, the air's median and the interior's share of the frame. */
export function figureGround(
  y: Float32Array,
  split: Uint8Array,
): { solid: number; air: number; share: number } {
  let sum = 0;
  let n = 0;
  const air: number[] = [];
  for (let p = 0; p < y.length; p++) {
    if (split[p] === 2) {
      sum += y[p] as number;
      n++;
    } else if (split[p] === 1) air.push(y[p] as number);
  }
  air.sort((a, b) => a - b);
  return {
    solid: n ? sum / n : 0,
    air: air.length ? (air[air.length >> 1] as number) : 0,
    share: n / y.length,
  };
}
/** Named stops (`room:stop`) that must keep this mean luma. */
const MIN_MEAN: Record<string, number> = { 'cn-hub:clearing': 25 };

function luma480(file: string): { w: number; h: number; y: Float32Array; sat: Float32Array } {
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
  const sat = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = rgb[i * 3] as number;
    const g = rgb[i * 3 + 1] as number;
    const b = rgb[i * 3 + 2] as number;
    y[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mx = Math.max(r, g, b);
    sat[i] = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
  }
  return { w: W, h: H, y, sat };
}

/**
 * The largest 4-connected region whose pixels share a bin of `bin` luma (bins offset by 0 and bin / 2), as a share of
 * the pixels not skipped (`skip[p]` non-zero: left out, joins nothing).
 */
export function largestFlat(y: Float32Array, w: number, h: number, bin: number, skip?: Uint8Array): number {
  let best = 0;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let total = w * h;
  if (skip) for (const v of skip) if (v) total--;
  for (const off of [0, bin / 2]) {
    if (skip) seen.set(skip);
    else seen.fill(0);
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
  return best / Math.max(1, total);
}

async function main(): Promise<void> {
  const rooms = args.rooms
    ? args.rooms.split(',')
    : Object.keys(ROOMS).filter((id) => id.startsWith('cn-') && (ROOMS[id]?.shots?.wide?.length ?? 0) > 0);
  const sizes = (args.sizes ?? '').split(',').map((s) => s.split('x').map(Number) as [number, number]);
  const outDir = resolve(args.out ?? 'shots/look-check');
  const browser = await launch({ gpu: true });
  const fails: string[] = [];
  const shares = new Map<string, number[]>();
  let frames = 0;
  try {
    for (const [W, H] of sizes) {
      for (const id of rooms) {
        const room = getRoom(id);
        const dir = join(outDir, `${W}x${H}`, id);
        mkdirSync(dir, { recursive: true });
        const page = await openGame(browser, args.url ?? DEFAULT_URL, { width: W, height: H }, 1, true, id);
        for (const [i, stop] of (room.shots?.wide ?? []).entries()) {
          const frame: Frame = await page.evaluate(
            ([x, y]) => {
              const g = window.__game;
              g.cam(null);
              g.teleport(x, y);
              g.step(20);
              g.tick(60);
              const c = g.cam();
              const v = g.info().view;
              const p = g.state().player;
              const sc = g.scene();
              return {
                room: { w: sc.width, h: sc.height },
                cam: { x: c.x, y: c.y, zoom: c.zoom },
                view: { w: v.w, h: v.h },
                solids: sc.solids.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
                sealed: ((sc as { marks?: { sealed?: Box[] } }).marks?.sealed ?? []).map((s) => ({
                  x: s.x,
                  y: s.y,
                  w: s.w,
                  h: s.h,
                })),
                hero: { x: p.x, y: p.y, w: p.w, h: p.h },
              };
            },
            [stop.x, stop.y] as const,
          );
          const file = join(dir, `wide-${i + 1}-${stop.name}.png`);
          writeFileSync(file, await page.locator('#game').screenshot({ type: 'png' }));
          const { w, h, y, sat } = luma480(file);
          const split = splitByCollision(frame, w, h, LOOK_CHECK.solidDeep);
          const fg = figureGround(y, split);
          // How much of the frame is ground deeper than `shareDeep` (review r8 #2).
          const deepSplit = splitByCollision(frame, w, h, LOOK_CHECK.shareDeep);
          let deepN = 0;
          for (const v of deepSplit) if (v === 2) deepN++;
          const share = deepN / deepSplit.length;
          const key = `${W}x${H} ${id}`;
          shares.set(key, [...(shares.get(key) ?? []), share]);
          if (args.masks)
            writeFileSync(
              file.replace(/\.png$/, '-split.pgm'),
              Buffer.concat([Buffer.from(`P5 ${w} ${h} 255\n`), Buffer.from(split.map((v) => v * 80))]),
            );
          // The frame bars over the air (the header).
          const ground = split.map((v) => (v === 1 ? 0 : 1));
          let sum = 0;
          let all = 0;
          let n = 0;
          let dark = 0;
          let mid = 0;
          let satSum = 0;
          for (let p = 0; p < y.length; p++) {
            const v = y[p] as number;
            all += v;
            if (ground[p]) continue;
            n++;
            sum += v;
            satSum += sat[p] as number;
            if (v < LOOK_CHECK.dark) dark++;
            if (v >= (LOOK_CHECK.mid[0] as number) && v <= (LOOK_CHECK.mid[1] as number)) mid++;
          }
          n = Math.max(1, n);
          const flat = largestFlat(y, w, h, LOOK_CHECK.bin, ground);
          const mean = all / y.length;
          const bad: string[] = [];
          if (dark / n > LOOK_CHECK.darkMax) bad.push(`near-black ${Math.round((100 * dark) / n)}%`);
          if (mid / n < LOOK_CHECK.midMin) bad.push(`mid ${Math.round((100 * mid) / n)}%`);
          if (flat > LOOK_CHECK.flatMax) bad.push(`flat ${Math.round(100 * flat)}%`);
          const airMean = sum / n;
          const airSat = satSum / n;
          if (airMean > LOOK_CHECK.airMax) bad.push(`air mean ${airMean.toFixed(0)} > ${LOOK_CHECK.airMax}`);
          if (airSat < LOOK_CHECK.airSat) bad.push(`air sat ${airSat.toFixed(2)} < ${LOOK_CHECK.airSat}`);
          const shareBad = share > LOOK_CHECK.shareMax;
          if (shareBad && args['share-fails']) bad.push(`deep solid ${Math.round(100 * share)}%`);
          const want = MIN_MEAN[`${id}:${stop.name}`];
          if (want !== undefined && mean < want) bad.push(`mean ${mean.toFixed(1)} < ${want}`);
          let hollowSum = 0;
          let hollowN = 0;
          for (let p = 0; p < y.length; p++)
            if (split[p] === 4) {
              hollowSum += y[p] as number;
              hollowN++;
            }
          let hollowText = '';
          if (hollowN / y.length >= LOOK_CHECK.solidMinShare) {
            const hm = hollowSum / hollowN;
            hollowText = `, hollow ${hm.toFixed(1)} (${Math.round((100 * hollowN) / y.length)}%)`;
            if (hm > LOOK_CHECK.hollowK * fg.air)
              bad.push(`hollow ${hm.toFixed(0)} > ${LOOK_CHECK.hollowK} x air ${fg.air.toFixed(0)}`);
          }
          let fgText = 'solid -';
          if (fg.share >= LOOK_CHECK.solidMinShare) {
            const ratio = fg.air / Math.max(1, fg.solid);
            fgText = `solid ${fg.solid.toFixed(1)} (${Math.round(100 * fg.share)}%), air ${fg.air.toFixed(0)}, x${ratio.toFixed(1)}`;
            if (fg.solid > LOOK_CHECK.solidMax)
              bad.push(`solid ${fg.solid.toFixed(1)} > ${LOOK_CHECK.solidMax}`);
            if (fg.air < LOOK_CHECK.airK * Math.max(1, fg.solid))
              bad.push(`air ${fg.air.toFixed(0)} < ${LOOK_CHECK.airK}x solid`);
          }
          const line = `${W}x${H} ${id} ${stop.name}: mean ${mean.toFixed(1)}, air: mean ${airMean.toFixed(1)} sat ${airSat.toFixed(2)}, deep ${Math.round(100 * share)}%${shareBad ? ' (over 30%)' : ''}, near-black ${Math.round((100 * dark) / n)}%, mid ${Math.round((100 * mid) / n)}%, flat ${Math.round(100 * flat)}%, ${fgText}${hollowText}`;
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
  // The deep-solid share by room (review r8 #2): reported (failed with --share-fails).
  const over: string[] = [];
  for (const [key, list] of shares) {
    const sorted = [...list].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    if (max > LOOK_CHECK.shareMax || med > LOOK_CHECK.shareMedian)
      over.push(`${key}: deep solid median ${Math.round(100 * med)}%, max ${Math.round(100 * max)}%`);
  }
  if (over.length) {
    console.log(
      `\nDeep solid over the bar (<= 30% a stop, median <= 20%; reported${args['share-fails'] ? ', failing' : ''}):`,
    );
    for (const o of over) console.log(`  ${o}`);
  }
  console.log(`\n${frames - fails.length} of ${frames} frames pass.`);
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
