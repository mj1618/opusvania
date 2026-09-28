/**
 * The brush bake (level-toolchain §2.4 item 2): Brushes (in order) -> cleanup -> Paint ->
 * the Collision IntGrid. Deterministic: tile-centre sampling with integer or IEEE-exact
 * arithmetic only (+ - * / and Math.sqrt/floor; no sin/cos/atan2/pow, which can differ across
 * JS engines), and seeded integer hashes for noise. `npm run check` re-bakes every level and
 * fails when the stored Collision differs (tests/unit/world.test.ts).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SLOPE_SHAPES } from '../../src/sim/world/room-schema';
import { type Brush, type LevelModel, PAINT_AIR, SLOPE_VALUE0, tileValue } from './model';

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
    case 'curve':
      return columnsCoverage(curveColumns(b.pts, gradeRun(b.grade, 2)));
    case 'ramp': {
      if (b.grade && b.grade !== 'none') {
        const run = gradeRun(b.grade, 1);
        return columnsCoverage(rampColumns(b.pts as [[number, number], [number, number]], run));
      }
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

// ---------------------------------------------------------------------------------------------
// Slopes (north star §3.2): ramp with a grade, and curve. Both produce, per tile column, the tile
// row of its surface tile (a slope tile, or the top solid tile of a flat run) and fill solid under
// it down to `bottom` (the row of the lowest floor), so the bake output is always continuous.

/** Tiles of run per tile of rise for a grade id (none -> fallback). */
function gradeRun(id: string | undefined, fallback: 1 | 2 | 4): 1 | 2 | 4 {
  return id === 'g1_4' ? 4 : id === 'g1_2' ? 2 : id === 'g1_1' ? 1 : fallback;
}

interface Column {
  x: number;
  /** Row of the surface tile. */
  row: number;
  /** IntGrid value of the surface tile (a slope value, or solid). */
  value: number;
}
interface Columns {
  cols: Column[];
  /** Solid fills every column down to this row (inclusive). */
  bottom: number;
}

function slopeValue(dir: 1 | -1, run: number, k: number): number {
  const i = SLOPE_SHAPES.findIndex((s) => s.dir === dir && s.run === run && s.k === k);
  if (i < 0) throw new Error(`no slope tile dir ${dir} run ${run} k ${k}`);
  return SLOPE_VALUE0 + i;
}

/**
 * A straight slope between two surface CORNERS: |dx| = run * |dy| exactly. Columns run from the
 * low end toward the high end; the floor under the whole ramp reaches the low end's row.
 */
export function rampColumns(pts: [[number, number], [number, number]], run: 1 | 2 | 4): Columns {
  const [p, q] = pts;
  const [low, high] = p[1] >= q[1] ? [p, q] : [q, p];
  const rise = low[1] - high[1];
  const dx = high[0] - low[0];
  if (rise <= 0 || Math.abs(dx) !== run * rise)
    throw new Error(
      `ramp ${JSON.stringify(pts)}: a 1:${run} slope needs |dx| = ${run} x |dy| between its corner points (got dx ${Math.abs(dx)}, dy ${rise})`,
    );
  const dir: 1 | -1 = dx > 0 ? 1 : -1;
  const cols: Column[] = [];
  for (let d = 0; d < Math.abs(dx); d++) {
    const x = dir > 0 ? low[0] + d : low[0] - 1 - d;
    cols.push({ x, row: low[1] - 1 - Math.floor(d / run), value: slopeValue(dir, run, d % run) });
  }
  return { cols, bottom: low[1] };
}

const Q = 16; // quarter tile, px (1:4 rises one quarter per tile)
const T = 64;

/**
 * A floor through corner points, quantised to a chain of flat, 1:4, 1:2 and 1:1 tiles (no steeper
 * than 1:`maxRun`... i.e. `maxRun` = the smallest run allowed). Dynamic programming over the
 * surface height at each tile boundary (multiples of a quarter tile), minimising the distance to
 * the polyline, with hard ends at the first and last points. Rules that keep it tileable: a flat
 * tile sits on a whole tile boundary; a 1:2 tile starts on a half; a 1:1 on a whole.
 */
export function curveColumns(pts: [number, number][], minRun: 1 | 2 | 4): Columns {
  for (let i = 1; i < pts.length; i++)
    if ((pts[i] as [number, number])[0] <= (pts[i - 1] as [number, number])[0])
      throw new Error(`curve ${JSON.stringify(pts)}: points must go strictly left to right`);
  const x0 = (pts[0] as [number, number])[0];
  const xN = (pts[pts.length - 1] as [number, number])[0];
  const N = xN - x0;
  // Target surface y (px) at each boundary: the polyline through the corner points.
  const target: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + i;
    let s = 1;
    while (s < pts.length - 1 && (pts[s] as [number, number])[0] < x) s++;
    const [ax, ay] = pts[s - 1] as [number, number];
    const [bx, by] = pts[s] as [number, number];
    target.push(((ay + ((by - ay) * (x - ax)) / (bx - ax)) * T) as number);
  }
  const ys = pts.map((p) => p[1] * T);
  const lo = Math.min(...ys) - T;
  const hi = Math.max(...ys) + T;
  const levels = (hi - lo) / Q + 1;
  const INF = Number.POSITIVE_INFINITY;
  const cost = new Float64Array((N + 1) * levels).fill(INF);
  const from = new Int32Array((N + 1) * levels).fill(-1);
  const start = (ys[0] as number) - lo;
  cost[start / Q] = 0;
  const steps: number[] = [0];
  for (const run of [4, 2, 1] as const) if (run >= minRun) steps.push(T / run, -T / run);
  for (let i = 0; i < N; i++)
    for (let l = 0; l < levels; l++) {
      const c = cost[i * levels + l] as number;
      if (c === INF) continue;
      const a = lo + l * Q;
      for (const st of steps) {
        const b = a + st;
        if (b < lo || b > hi) continue;
        const d = Math.abs(st);
        // Tileability: flats on whole tiles, 1:2 from half tiles, 1:1 from whole tiles.
        if (d === 0 && a % T !== 0) continue;
        if (d === T / 2 && a % (T / 2) !== 0) continue;
        if (d === T && a % T !== 0) continue;
        // Prefer the target, then fewer grade changes (a tiny tie-break keeps runs straight).
        const nc = c + Math.abs(b - (target[i + 1] as number)) + (d === 0 ? 0 : 0.001 * d);
        const j = (i + 1) * levels + (b - lo) / Q;
        if (nc < (cost[j] as number)) {
          cost[j] = nc;
          from[j] = l;
        }
      }
    }
  const endL = ((ys[ys.length - 1] as number) - lo) / Q;
  if (cost[N * levels + endL] === INF)
    throw new Error(
      `curve ${JSON.stringify(pts)}: no 1:${minRun}-or-gentler tile chain reaches the last point`,
    );
  const E: number[] = new Array(N + 1);
  let l = endL;
  for (let i = N; i >= 0; i--) {
    E[i] = lo + l * Q;
    if (i > 0) l = from[i * levels + l] as number;
  }
  const cols: Column[] = [];
  const bottom = Math.ceil(Math.max(...E) / T);
  for (let i = 0; i < N; i++) {
    const a = E[i] as number;
    const b = E[i + 1] as number;
    const x = x0 + i;
    if (a === b) {
      cols.push({ x, row: a / T, value: 1 });
      continue;
    }
    const d = Math.abs(a - b);
    const run = T / d;
    const dir: 1 | -1 = b < a ? 1 : -1;
    const lowY = Math.max(a, b);
    const row = Math.ceil(lowY / T) - 1;
    // Height of the low edge above the tile's bottom, in steps of this grade.
    const k = ((row + 1) * T - lowY) / d;
    cols.push({ x, row, value: slopeValue(dir, run, k) });
  }
  return { cols, bottom };
}

function columnsCoverage(c: Columns): {
  box: [number, number, number, number];
  test: Cover;
  value: (tx: number, ty: number) => number;
} {
  const byX = new Map(c.cols.map((k) => [k.x, k]));
  const xs = c.cols.map((k) => k.x);
  const top = Math.min(...c.cols.map((k) => k.row));
  const x0 = Math.min(...xs);
  return {
    box: [x0, top, Math.max(...xs) - x0 + 1, c.bottom - top + 1],
    test: (tx, ty) => {
      const k = byX.get(tx);
      return k !== undefined && ty >= k.row && ty <= c.bottom;
    },
    value: (tx, ty) => {
      const k = byX.get(tx) as Column;
      return ty === k.row ? k.value : 1;
    },
  };
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
