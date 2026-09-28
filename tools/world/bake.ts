/**
 * The brush bake (level-toolchain §2.4 item 2): Brushes (in order) -> cleanup -> Paint ->
 * the Collision IntGrid. Deterministic: tile-centre sampling with integer or IEEE-exact
 * arithmetic only (+ - * / and Math.sqrt/floor; no sin/cos/atan2/pow, which can differ across
 * JS engines), and seeded integer hashes for noise. `npm run check` re-bakes every level and
 * fails when the stored Collision differs (tests/unit/world.test.ts).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Brush, type LevelModel, PAINT_AIR, tileValue } from './model';

const ROOT = resolve(import.meta.dirname, '../..');
export const STAMP_DIR = join(ROOT, 'content/stamps');

const STAMP_CHARS: Record<string, number> = { '#': 1, '=': 2, '^': 3, v: 4, '<': 5, '>': 6, o: 7, '.': 0 };
const FLIP: Record<string, string> = { '<': '>', '>': '<' };

export interface Stamp {
  rows: string[];
}
export type StampLoader = (name: string) => Stamp;

export const loadStamp: StampLoader = (name) => {
  const p = join(STAMP_DIR, `${name}.json`);
  if (!existsSync(p)) throw new Error(`unknown stamp "${name}" (no ${p})`);
  return JSON.parse(readFileSync(p, 'utf8')) as Stamp;
};

/** 32-bit integer hash of (seed, i) -> [0, 1). */
export function hash01(seed: number, i: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth periodic 1D value noise in [-1, 1]: K control points around a loop, t in [0, K). */
function loopNoise(seed: number, k: number, t: number): number {
  const i = Math.floor(t);
  const u = t - i;
  const s = u * u * (3 - 2 * u);
  const a = hash01(seed, ((i % k) + k) % k) * 2 - 1;
  const b = hash01(seed, (((i + 1) % k) + k) % k) * 2 - 1;
  return a + (b - a) * s;
}

/** Open (non-periodic) value noise in [-1, 1]. */
function lineNoise(seed: number, t: number): number {
  const i = Math.floor(t);
  const u = t - i;
  const s = u * u * (3 - 2 * u);
  const a = hash01(seed, i) * 2 - 1;
  const b = hash01(seed, i + 1) * 2 - 1;
  return a + (b - a) * s;
}

/** Pseudo-angle in [0, 4) (a "diamond angle"): monotonic in the true angle, rational maths only. */
function diamond(u: number, v: number): number {
  if (u === 0 && v === 0) return 0;
  if (v >= 0) return u >= 0 ? v / (u + v) : 1 - u / (-u + v);
  return u < 0 ? 2 - v / (-u - v) : 3 + u / (u - v);
}

/** Squared distance from (px, py) to segment a-b, and the parameter t of the nearest point. */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return [qx * qx + qy * qy, t];
}

type Cover = (tx: number, ty: number) => boolean;

/** Tiles a brush covers, as a predicate plus the bounding box to scan. */
function coverage(
  b: Brush,
  W: number,
  H: number,
  stamps: StampLoader,
): { box: [number, number, number, number]; test: Cover; value?: (tx: number, ty: number) => number } {
  const all: [number, number, number, number] = [0, 0, W, H];
  const r = b.rect ?? [0, 0, 0, 0];
  const [x, y, w, h] = r;
  switch (b.shape) {
    case 'fill':
      return { box: all, test: () => true };
    case 'rect':
    case 'shaft':
      return { box: r, test: () => true };
    case 'blob': {
      const meanR = (w + h) / 4;
      const K = Math.max(6, Math.floor(((w + h) * 3) / 8));
      return {
        box: [x - b.rough, y - b.rough, w + 2 * b.rough, h + 2 * b.rough],
        test: (tx, ty) => {
          const dx = 2 * tx + 1 - (2 * x + w);
          const dy = 2 * ty + 1 - (2 * y + h);
          const q = dx * dx * h * h + dy * dy * w * w;
          const R2 = w * w * h * h;
          if (b.rough === 0) return q <= R2;
          const n = loopNoise(b.seed, K, (diamond(dx * h, dy * w) * K) / 4);
          const f = 1 + (b.rough * n) / meanR;
          return f > 0 && q <= R2 * f * f;
        },
      };
    }
    case 'arch': {
      // Half-ellipse on the rect's bottom edge (doubled coordinates: centre (2x+w, 2(y+h)), radii w and 2h).
      const t = b.thick;
      return {
        box: r,
        test: (tx, ty) => {
          const dx = 2 * tx + 1 - (2 * x + w);
          const dy = 2 * ty + 1 - 2 * (y + h);
          const outer = dx * dx * (4 * h * h) + dy * dy * w * w <= w * w * (4 * h * h);
          if (!outer || t <= 0) return outer;
          const iw = w - 2 * t;
          const ih = 2 * h - 2 * t;
          if (iw <= 0 || ih <= 0) return true;
          return dx * dx * ih * ih + dy * dy * iw * iw > iw * iw * ih * ih;
        },
      };
    }
    case 'tunnel': {
      const W = b.width;
      const off = W % 2 === 1 ? 0.5 : 0;
      const pts = b.pts.map(([px, py]) => [px + off, py + off] as const);
      const cum: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] as readonly [number, number];
        const c = pts[i] as readonly [number, number];
        cum.push(
          (cum[i - 1] as number) + Math.sqrt((c[0] - a[0]) * (c[0] - a[0]) + (c[1] - a[1]) * (c[1] - a[1])),
        );
      }
      const pad = Math.ceil(W / 2) + b.rough + 1;
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const bx0 = Math.floor(Math.min(...xs)) - pad;
      const by0 = Math.floor(Math.min(...ys)) - pad;
      return {
        box: [
          bx0,
          by0,
          Math.ceil(Math.max(...xs)) + pad - bx0 + 1,
          Math.ceil(Math.max(...ys)) + pad - by0 + 1,
        ],
        test: (tx, ty) => {
          const cx = tx + 0.5;
          const cy = ty + 0.5;
          let best = Infinity;
          let s = 0;
          if (pts.length === 1) {
            const p = pts[0] as readonly [number, number];
            best = (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy);
          }
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1] as readonly [number, number];
            const c = pts[i] as readonly [number, number];
            const [d2, t] = segDist2(cx, cy, a[0], a[1], c[0], c[1]);
            if (d2 < best) {
              best = d2;
              s = (cum[i - 1] as number) + t * ((cum[i] as number) - (cum[i - 1] as number));
            }
          }
          const rad = W / 2 + (b.rough ? b.rough * lineNoise(b.seed, s / 6) : 0);
          return rad > 0 && best < rad * rad;
        },
      };
    }
    case 'ledges': {
      const thick = Math.max(1, b.thick);
      return {
        box: all,
        test: (tx, ty) =>
          b.pts.some(([px, py]) => tx >= px && tx < px + b.width && ty >= py && ty < py + thick),
      };
    }
    case 'poly': {
      const pts = b.pts;
      return {
        box: all,
        test: (tx, ty) => {
          const cx = tx + 0.5;
          const cy = ty + 0.5;
          let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const [xi, yi] = pts[i] as [number, number];
            const [xj, yj] = pts[j] as [number, number];
            if (yi > cy !== yj > cy && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) inside = !inside;
          }
          return inside;
        },
      };
    }
    case 'ramp': {
      const [a, c] = b.pts as [[number, number], [number, number]];
      const [x0, y0] = a[0] <= c[0] ? a : c;
      const [x1, y1] = a[0] <= c[0] ? c : a;
      const bottom = Math.max(y0, y1);
      const dx = x1 - x0;
      return {
        box: [x0, Math.min(y0, y1), dx + 1, Math.abs(y1 - y0) + 1],
        test: (tx, ty) => {
          const top =
            dx === 0 ? Math.min(y0, y1) : y0 + Math.floor((2 * (y1 - y0) * (tx - x0) + dx) / (2 * dx));
          return ty >= top && ty <= bottom;
        },
      };
    }
    case 'stamp': {
      const st = stamps(b.name ?? '');
      const rows = st.rows.map((row) =>
        b.flipX
          ? [...row]
              .reverse()
              .map((ch) => FLIP[ch] ?? ch)
              .join('')
          : row,
      );
      const sw = Math.max(...rows.map((row) => row.length));
      const at = (tx: number, ty: number) => rows[ty - y]?.[tx - x] ?? ' ';
      return {
        box: [x, y, sw, rows.length],
        test: (tx, ty) => at(tx, ty) in STAMP_CHARS,
        value: (tx, ty) => STAMP_CHARS[at(tx, ty)] as number,
      };
    }
  }
}

export interface BakeResult {
  collision: Uint8Array;
  warnings: string[];
}

/** Bakes a level's brushes and paint into collision values (row-major). */
export function bake(m: LevelModel, stamps: StampLoader = loadStamp): BakeResult {
  const [W, H] = m.size;
  const grid = new Uint8Array(W * H);
  const rough = new Uint8Array(W * H);
  const warnings: string[] = [];
  m.brushes.forEach((b, i) => {
    const cov = coverage(b, W, H, stamps);
    const v = b.op === 'carve' ? 0 : tileValue(b.tile);
    const [bx, by, bw, bh] = cov.box;
    let hit = 0;
    for (let ty = Math.max(0, by); ty < Math.min(H, by + bh); ty++)
      for (let tx = Math.max(0, bx); tx < Math.min(W, bx + bw); tx++) {
        if (!cov.test(tx, ty)) continue;
        grid[ty * W + tx] = cov.value ? cov.value(tx, ty) : v;
        rough[ty * W + tx] = b.rough > 0 ? 1 : 0;
        hit++;
      }
    if (hit === 0) warnings.push(`brush ${i} (${b.shape}) covers no tile of the room`);
  });
  // Cleanup: single-tile specks left by rough brushes (never touches exact brushes' tiles).
  const src = grid.slice();
  const solidAt = (tx: number, ty: number) =>
    tx < 0 || ty < 0 || tx >= W || ty >= H ? true : src[ty * W + tx] === 1;
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const i = ty * W + tx;
      if (!rough[i]) continue;
      const n = +solidAt(tx - 1, ty) + +solidAt(tx + 1, ty) + +solidAt(tx, ty - 1) + +solidAt(tx, ty + 1);
      if (src[i] === 1 && n === 0) grid[i] = 0;
      else if (src[i] === 0 && n === 4) grid[i] = 1;
    }
  for (let i = 0; i < W * H; i++) {
    const p = m.paint[i] as number;
    if (p) grid[i] = p === PAINT_AIR ? 0 : p;
  }
  return { collision: grid, warnings };
}
