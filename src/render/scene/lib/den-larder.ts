/**
 * The Keeper's larder (the Canopy r13, review canopy-r12 #3: "the den's back wall is a flat brown card"): the boss
 * room's back is the wall of a larder, not banks of hills. Pure layout plus painters (duck-typed graphics); the live
 * light and the swing's shadows over it are lantern/keeper.ts.
 *
 *   deep   (0.86)  the far earth, faint vertical folds and the fungus light from below: almost all of it is behind
 *                  the mid wall now.
 *   mid    (0.93)  the larder wall: packed earth hung in folds like a drape (HK's False Knight chamber has drapes),
 *                  stones and pebbles pressed into it in two sizes, root hair across it, the cells the Keeper keeps
 *                  its food in (arched niches, silk-wrapped moths stacked in them), the bars of older cages half
 *                  buried, roots hanging from the roof. Every mark within ~10 luma of the earth it sits on (the air
 *                  mean stays where look:check wants it); the cells and the cages are the only shapes that tell.
 *   near   (1.0, baked)  root ribs lying down the wall from the roof into the floor and thick roots hanging into the
 *                  air: the shapes the great cage's light throws its shadows from (`larderRibs`, read by keeper.ts).
 *
 * The floor's litter (dead wings, gnawed husks, a fallen old cage) is the stage's (keeper.ts `litter`): it sits on
 * the walked line, in front of the bake.
 */
import type { MassRect } from './pf-mass';
import type { Paint } from './pf-paint';
import { blob, chaikin, range, ribbon, rngFor, wander, wobble } from './pf-shape';

export const LARDER = {
  /** The wall's folds: width range (px), value swing either side of the earth (0..1 of the way to dark / lit). */
  fold: { w: [150, 330] as const, swing: 0.3 },
  /** Pebbles: one per this many px² of wall, size range (px half); big stones per 100k px², size range. */
  pebble: { per: 1500, r: [2.2, 7] as const },
  stone: { per: 100_000 * 2.2, r: [12, 30] as const },
  /** Root hair: strands per 100k px², length (px). */
  hair: { per: 7, len: [70, 280] as const },
  /** The cells: how many, their half width (px), the wrapped moths in each. */
  cell: { n: 3, w: [110, 160] as const, wraps: [3, 6] as const },
  /** Old cages buried in the wall: how many, their height (px). */
  cage: { n: 2, h: [110, 160] as const },
  /** Ribs on the near wall: count per 1000 px of floor, width at the roof (px). */
  rib: { per: 1.2, w: [26, 44] as const },
  /** Thick roots hanging into the den's air: count per 1000 px, length (px). */
  hang: { per: 2.2, len: [180, 460] as const, w: [16, 30] as const },
  /** Colours of what is kept: the silk's pale, its wrap lines, the old cages' bronze. */
  silk: 0x5a4c40,
  silkDark: 0x2a2018,
  bronze: 0x4a3626,
  bronzeLit: 0x8a6a46,
};

type G = { poly(pts: number[]): { fill(o: { color: number; alpha?: number }): unknown } };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The larder's frame from the room's masses: the floor's top and the roof's underside at x. */
export interface LarderFrame {
  floor: number;
  x0: number;
  x1: number;
  roof(x: number): number;
}

export function larderFrame(masses: readonly MassRect[], b0: Rect): LarderFrame {
  // The floor: the widest top in the lower half of the back.
  let floor = b0.y + b0.h;
  let wide = 0;
  for (const m of masses)
    if (m.y > b0.y + b0.h * 0.5 && m.w > wide && m.y < b0.y + b0.h) {
      wide = m.w;
      floor = m.y;
    }
  // The walls: the open stretch over the floor between the masses standing on it.
  let x0 = b0.x;
  let x1 = b0.x + b0.w;
  const mid = b0.x + b0.w / 2;
  for (const m of masses) {
    if (m.y + m.h < floor - 200 || m.y >= floor) continue;
    if (m.x + m.w <= mid && m.x + m.w > x0) x0 = m.x + m.w;
    if (m.x >= mid && m.x < x1) x1 = m.x;
  }
  const roof = (x: number): number => {
    let top = b0.y;
    for (const m of masses) {
      const bot = m.y + m.h;
      if (x >= m.x && x <= m.x + m.w && bot <= floor - 300 && bot > top) top = bot;
    }
    return top;
  };
  return { floor, x0, x1, roof };
}

const mixC = (a: number, b: number, t: number): number => {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** An ellipse as a polygon (the graphics here only take polys). */
function oval(x: number, y: number, rx: number, ry: number, a = 0, n = 10): number[] {
  const out: number[] = [];
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const px = Math.cos(t) * rx;
    const py = Math.sin(t) * ry;
    out.push(x + px * ca - py * sa, y + px * sa + py * ca);
  }
  return out;
}

/** A line `w` wide (tapered `taper` at both ends) as a polygon. */
function line(pts: number[], w: number, taper = 0.3): number[] {
  return ribbon(pts, (t) => w * Math.min(1, Math.min(t, 1 - t) / Math.max(0.01, taper) + 0.15));
}

/** The far earth behind the larder wall: faint folds, lit from below (the den branch of drawDeepBack for a larder). */
export function drawLarderDeep(
  g: G,
  b: Rect,
  b0: Rect,
  T: { deep: number; deepLit: number; fog: number; grain: number },
  seed: number,
): void {
  const r = rngFor(seed, b0.x, 1301);
  // A haze of the fog over the lower two thirds (the mid wall stands in front of it).
  for (let x = b.x; x < b.x + b.w; ) {
    const w = range(r, 200, 420);
    const lit = r() < 0.5;
    const pts: number[] = [];
    const y0 = b0.y + b0.h * range(r, 0.1, 0.3);
    for (let k = 0; k <= 10; k++)
      pts.push(x + w * 0.1 + 18 * wobble(k * 90 + x, seed, 160), y0 + (k / 10) * (b.y + b.h - y0));
    for (let k = 10; k >= 0; k--)
      pts.push(x + w * 0.9 + 18 * wobble(k * 90 + x, seed + 7, 160), y0 + (k / 10) * (b.y + b.h - y0));
    g.poly(pts).fill({ color: lit ? T.deepLit : T.grain, alpha: lit ? 0.12 : 0.16 });
    x += w;
  }
}

/**
 * The larder wall (the mid plane of a larder den): see the module comment. `col` is the mid plane's earth, `dark` /
 * `lit` its shade and light (drawMidBack's own), `fung` the fungus light from below.
 */
export function drawLarderMid(
  g: G,
  masses: readonly MassRect[],
  b: Rect,
  b0: Rect,
  c: { col: number; dark: number; lit: number; fung: number; grain: number },
  seed: number,
): void {
  const L = LARDER;
  const r = rngFor(seed, b0.x, 1311);
  const F = larderFrame(masses, b0);
  const top = b.y;
  const bot = F.floor + 80;
  // --- The wall: folds of packed earth, roof to floor, each a little lighter in its middle (it bulges) and dark in the
  // creases between (a drape's rhythm; the swing's shadows run across them).
  const folds: Array<{ x: number; w: number }> = [];
  for (let x = b.x - 40; x < b.x + b.w; ) {
    const w = range(r, L.fold.w[0], L.fold.w[1]);
    folds.push({ x, w });
    x += w * range(r, 0.78, 0.95);
  }
  for (const [i, f] of folds.entries()) {
    const v = (i % 3 === 1 ? -0.5 : 0.4) * L.fold.swing + range(r, -0.04, 0.04);
    const base = v > 0 ? mixC(c.col, c.lit, v) : mixC(c.col, c.dark, -v);
    const side = (k: number, s: number): number =>
      f.x +
      (s > 0 ? f.w : 0) +
      22 * wobble(k * 70 + f.x, seed + s * 3, 220) +
      30 * Math.sin((k / 14) * Math.PI) * s;
    const pts: number[] = [];
    for (let k = 0; k <= 14; k++) pts.push(side(k, -1), top + ((bot - top) * k) / 14);
    for (let k = 14; k >= 0; k--) pts.push(side(k, 1), top + ((bot - top) * k) / 14);
    g.poly(pts).fill({ color: base, alpha: 1 });
    // The bulge: a lighter tongue down its middle, fading out toward the roof (where the dark is).
    const mid: number[] = [];
    const y0 = top + (bot - top) * range(r, 0.18, 0.35);
    for (let k = 0; k <= 10; k++)
      mid.push(f.x + f.w * 0.5 + 14 * wobble(k * 90, seed + i, 300), y0 + ((bot - y0) * k) / 10);
    g.poly(ribbon(mid, (t) => f.w * 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.6)) ** 0.7)).fill({
      color: mixC(base, c.lit, 0.16),
      alpha: 0.5,
    });
    // The crease on its left: a dark seam down the fold, broken.
    const seam: number[] = [];
    for (let k = 0; k <= 12; k++) seam.push(side(k * (14 / 12), -1) + 6, top + ((bot - top) * k) / 12);
    g.poly(line(seam, range(r, 8, 16), 0.15)).fill({ color: c.dark, alpha: 0.55 });
  }
  // (The fungus light from below is the deep back's: a wide translucent band here read as fog: den-planes.test.)
  // --- Stones pressed into it: a few big ones (a dark socket, the stone, a dull lit crown) and many pebbles, in
  // clusters (packed earth is not even).
  const area = b.w * (bot - top);
  const nStone = Math.round(area / L.stone.per);
  for (let k = 0; k < nStone; k++) {
    const x = b.x + r() * b.w;
    const y = top + (bot - top) * (0.25 + 0.75 * r() ** 0.7);
    const s = range(r, L.stone.r[0], L.stone.r[1]);
    const a = range(r, -0.6, 0.6);
    const sd = seed + k * 7;
    g.poly(chaikin(blob(x, y + s * 0.12, s * 1.25, s * 0.95, sd, 0.25, 12, a), 1)).fill({
      color: c.dark,
      alpha: 0.75,
    });
    g.poly(chaikin(blob(x, y, s * 1.05, s * 0.8, sd, 0.3, 12, a), 1)).fill({
      color: mixC(c.col, c.lit, 0.22),
      alpha: 0.9,
    });
    g.poly(chaikin(blob(x - s * 0.2, y - s * 0.3, s * 0.6, s * 0.32, sd + 1, 0.3, 10, a), 1)).fill({
      color: mixC(c.col, c.lit, 0.42),
      alpha: 0.45,
    });
  }
  const nPeb = Math.round(area / L.pebble.per);
  for (let k = 0; k < nPeb; k++) {
    let x = b.x + r() * b.w;
    let y = top + (bot - top) * (0.15 + 0.85 * r() ** 0.8);
    // Clustered: a pebble lands where the earth is stony (a slow noise), else is pulled toward one.
    const stony = 0.5 + 0.5 * wobble(x + y * 0.7, seed + 41, 300);
    if (r() > 0.25 + 0.75 * stony) {
      x += range(r, -60, 60);
      y += range(r, -40, 40);
      if (r() < 0.5) continue;
    }
    const s = range(r, L.pebble.r[0], L.pebble.r[1]) * (0.7 + 0.5 * stony);
    const a = range(r, 0, 3.1);
    g.poly(oval(x + s * 0.18, y + s * 0.3, s * 1.1, s * 0.75, a, 8)).fill({ color: c.dark, alpha: 0.5 });
    g.poly(oval(x, y, s, s * 0.72, a, 8)).fill({ color: mixC(c.col, c.lit, range(r, 0.1, 0.3)), alpha: 0.7 });
  }
  // --- Root hair: fine strands wandering across the earth, mostly downhill.
  const nHair = Math.round((area / 100_000) * L.hair.per);
  for (let k = 0; k < nHair; k++) {
    const x = b.x + r() * b.w;
    const y = top + (bot - top) * r() ** 0.9;
    const len = range(r, L.hair.len[0], L.hair.len[1]);
    const ang = Math.PI / 2 + range(r, -0.9, 0.9);
    const pts: number[] = [];
    for (let t = 0; t <= 8; t++)
      pts.push(x + Math.cos(ang) * len * (t / 8), y + Math.sin(ang) * len * (t / 8));
    const w = wander(pts, 14, seed + k, 60);
    const pale = r() < 0.3;
    g.poly(line(w, range(r, 1.2, 2.6), 0.4)).fill({
      color: pale ? mixC(c.col, c.lit, 0.45) : c.grain,
      alpha: pale ? 0.35 : 0.45,
    });
    // A split or two off it.
    if (r() < 0.5) {
      const j = 2 + Math.floor(r() * 4) * 2;
      const sx = w[j] as number;
      const sy = w[j + 1] as number;
      const a2 = ang + range(r, -0.9, 0.9);
      const l2 = len * range(r, 0.2, 0.45);
      g.poly(
        line(
          [
            sx,
            sy,
            sx + Math.cos(a2) * l2 * 0.5,
            sy + Math.sin(a2) * l2 * 0.5 + 4,
            sx + Math.cos(a2) * l2,
            sy + Math.sin(a2) * l2,
          ],
          1.2,
          0.4,
        ),
      ).fill({
        color: c.grain,
        alpha: 0.4,
      });
    }
  }
  // --- The cells and the old cages: the story in the wall, between the floor and the roof's dark.
  for (const cell of larderCells(F, b0, seed)) drawCell(g, cell, c, seed + Math.round(cell.x));
  const rc = rngFor(seed, 1331);
  for (let k = 0; k < L.cage.n; k++) {
    const x = F.x0 + (F.x1 - F.x0) * (k === 0 ? range(rc, 0.08, 0.2) : range(rc, 0.72, 0.86));
    const h = range(rc, L.cage.h[0], L.cage.h[1]);
    const y = k === 0 ? F.roof(x) + range(rc, 180, 300) : F.floor - range(rc, 60, 120);
    oldCage(g, x, y, h, range(rc, -0.7, 0.7) + (k ? 1.4 : 0), k ? 0.45 : 0.3, c, seed + k * 19);
  }
}

/** Where the larder's cells are cut (x centre, sill y, half width): spread along the wall, at two heights. */
export function larderCells(
  F: LarderFrame,
  b0: Rect,
  seed: number,
): Array<{ x: number; y: number; w: number }> {
  const L = LARDER;
  const r = rngFor(seed, b0.x, 1321);
  const out: Array<{ x: number; y: number; w: number }> = [];
  const span = F.x1 - F.x0;
  for (let k = 0; k < L.cell.n; k++) {
    const x = F.x0 + span * ((k + 0.5) / L.cell.n + range(r, -0.07, 0.07));
    const roof = F.roof(x);
    const high = k % 2 === 0;
    const y = high ? roof + (F.floor - roof) * range(r, 0.34, 0.44) : F.floor - range(r, 150, 230);
    out.push({ x, y, w: range(r, L.cell.w[0], L.cell.w[1]) });
  }
  return out;
}

/** One cell: an arched niche, its lip packed and lit, its floor stacked with silk-wrapped moths and loose wings. */
function drawCell(
  g: G,
  cell: { x: number; y: number; w: number },
  c: { col: number; dark: number; lit: number; fung: number; grain: number },
  seed: number,
): void {
  const L = LARDER;
  const r = rngFor(seed, 1341);
  const { x, y, w } = cell;
  const h = w * range(r, 1.15, 1.5);
  const arch = (ww: number, hh: number, oy: number): number[] => {
    const pts: number[] = [];
    for (let q = 0; q <= 16; q++) {
      const a = Math.PI + (Math.PI * q) / 16;
      const j = 1 + 0.07 * wobble(q * 37 + x, seed, 50);
      pts.push(x + Math.cos(a) * ww * j, y + oy + Math.sin(a) * hh * j);
    }
    pts.push(x + ww * 0.95, y + oy + 10, x - ww * 0.95, y + oy + 10);
    return chaikin(pts, 1);
  };
  // The lip (packed earth, lighter), the hollow, the deep inside.
  g.poly(arch(w * 1.22, h * 1.12, 6)).fill({ color: mixC(c.col, c.lit, 0.3), alpha: 1 });
  g.poly(arch(w, h, 0)).fill({ color: c.dark, alpha: 1 });
  g.poly(arch(w * 0.8, h * 0.86, 0)).fill({ color: mixC(c.dark, 0x000000, 0.45), alpha: 1 });
  // What it keeps: moths wrapped in silk. Some hung from the arch on threads (a larder's hung meat), the rest
  // stacked on the sill, leaning; a wing showing out of one now and then.
  const n = Math.round(range(r, L.cell.wraps[0], L.cell.wraps[1]));
  const hung = Math.min(n - 1, 1 + Math.floor(r() * 2));
  for (let k = 0; k < n; k++) {
    const len = range(r, 0.3, 0.42) * h;
    const wd = len * range(r, 0.42, 0.55);
    if (k < hung) {
      const u = hung > 1 ? (k / (hung - 1) - 0.5) * 0.9 : range(r, -0.3, 0.3);
      const hx = x + u * w;
      const ty = y - h * 0.93 + Math.abs(u) * h * 0.25;
      const cy = ty + range(r, 0.12, 0.28) * h + len * 0.5;
      g.poly(line([hx, ty, hx + 1, (ty + cy - len * 0.5) / 2, hx, cy - len * 0.45], 1.4, 0.05)).fill({
        color: L.silk,
        alpha: 0.6,
      });
      wrapped(g, hx, cy, len, wd, Math.PI / 2 + range(r, -0.12, 0.12), seed + k * 13, r() < 0.3, c.grain);
    } else {
      const m = n - hung > 1 ? (k - hung) / (n - hung - 1) - 0.5 : 0;
      const lean = m * 1.1 + range(r, -0.15, 0.15);
      const cx = x + m * w * 1.25;
      const cy = y - len * 0.48 * Math.cos(lean) + 2;
      wrapped(g, cx, cy, len, wd, Math.PI / 2 + lean, seed + k * 13, r() < 0.4, c.grain);
    }
  }
  // A drift of loose wings on the sill, and the fungus light on its lip.
  for (let k = 0; k < 7; k++) {
    const wx = x + range(r, -w * 0.9, w * 0.9);
    g.poly(wingPts(wx, y + range(r, -2, 6), range(r, 7, 13), range(r, 0, 6.28))).fill({
      color: mixC(L.silk, c.col, range(r, 0.2, 0.5)),
      alpha: 0.8,
    });
  }
  g.poly(line([x - w * 1.1, y + 8, x, y + 12, x + w * 1.1, y + 7], 4, 0.4)).fill({
    color: c.fung,
    alpha: 0.35,
  });
}

/** A moth wrapped in silk: a spindle, wrap lines across it, a dark gap at its head; `wing` shows a wingtip out of it. */
function wrapped(
  g: G,
  cx: number,
  cy: number,
  len: number,
  wd: number,
  a: number,
  seed: number,
  wing: boolean,
  edge: number,
): void {
  const L = LARDER;
  const r = rngFor(seed, 1351);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (u: number, v: number): [number, number] => [cx + u * ca - v * sa, cy + u * sa + v * ca];
  const pts: number[] = [];
  for (let q = 0; q <= 12; q++) {
    const t = q / 12;
    const half = wd * 0.5 * Math.sin(Math.PI * t) ** 0.65 * (1 + 0.12 * Math.sin(t * 9 + seed));
    pts.push(...P((t - 0.5) * len, -half));
  }
  for (let q = 12; q >= 0; q--) {
    const t = q / 12;
    const half = wd * 0.5 * Math.sin(Math.PI * t) ** 0.65 * (1 + 0.12 * Math.sin(t * 7 + seed + 2));
    pts.push(...P((t - 0.5) * len, half));
  }
  const silk = mixC(L.silk, L.silkDark, range(r, 0, 0.35));
  // (A dark edge first, so it holds against the hollow's dark and the earth both.)
  const cxx = cx;
  const cyy = cy;
  g.poly(pts.map((v, j) => (j % 2 ? cyy + (v - cyy) * 1.12 : cxx + (v - cxx) * 1.12))).fill({
    color: edge,
    alpha: 0.7,
  });
  g.poly(pts).fill({ color: silk, alpha: 0.95 });
  // Its shade side.
  const sh: number[] = [];
  for (let q = 1; q < 12; q++) {
    const t = q / 12;
    sh.push(...P((t - 0.5) * len, wd * 0.5 * Math.sin(Math.PI * t) ** 0.65 * 0.15));
  }
  for (let q = 11; q > 0; q--) {
    const t = q / 12;
    sh.push(...P((t - 0.5) * len, wd * 0.5 * Math.sin(Math.PI * t) ** 0.65));
  }
  g.poly(sh).fill({ color: L.silkDark, alpha: 0.45 });
  // Wrap lines: diagonal threads across it.
  const nw = 5 + Math.floor(r() * 4);
  for (let k = 0; k < nw; k++) {
    const t = 0.12 + (0.76 * (k + r() * 0.5)) / nw;
    const half = wd * 0.5 * Math.sin(Math.PI * t) ** 0.65;
    const [x0, y0] = P((t - 0.5) * len - 6, -half);
    const [x1, y1] = P((t - 0.5) * len + 6, half);
    g.poly(line([x0, y0, (x0 + x1) / 2, (y0 + y1) / 2 + 2, x1, y1], 2, 0.2)).fill({
      color: L.silkDark,
      alpha: 0.75,
    });
  }
  if (wing) {
    const [wx, wy] = P(-len * 0.15, wd * 0.45);
    g.poly(wingPts(wx, wy, wd * 0.9, a + 1.2)).fill({ color: mixC(L.silk, 0xb8a888, 0.4), alpha: 0.85 });
  }
}

/** A moth's forewing at (x, y) from its root, `l` long, turned `a`. */
export function wingPts(x: number, y: number, l: number, a: number, flip = 1): number[] {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (u: number, v: number): [number, number] => [
    x + u * ca - v * flip * sa,
    y + u * sa + v * flip * ca,
  ];
  return [
    ...P(0, 0),
    ...P(l * 0.5, -l * 0.14),
    ...P(l, -l * 0.07),
    ...P(l * 0.95, l * 0.14),
    ...P(l * 0.55, l * 0.3),
    ...P(l * 0.15, l * 0.2),
  ];
}

/**
 * An old cage, empty and half buried (`sink` of its height under the earth or the floor): the onion of bent bars the
 * firefly's cages are, tipped `tilt`, some bars snapped, the ring at its top; dull bronze, dark between.
 */
export function oldCage(
  g: G,
  x: number,
  y: number,
  h: number,
  tilt: number,
  sink: number,
  c: { col: number; dark: number; lit: number },
  seed: number,
  /** The earth heaped where it goes in (off for one hung in the air). */
  heap = true,
): void {
  const L = LARDER;
  const r = rngFor(seed, 1361);
  const ca = Math.cos(tilt);
  const sa = Math.sin(tilt);
  const W = h * 0.36;
  // Local (u across, v down from the top ring) -> world, (x, y) the cage's middle.
  const P = (u: number, v: number): [number, number] => {
    const lx = u;
    const ly = v - h / 2;
    return [x + lx * ca - ly * sa, y + lx * sa + ly * ca];
  };
  const prof = (v: number): number =>
    W * Math.sin(Math.PI * Math.min(1, v / h)) ** 0.8 * (v < h * 0.15 ? 0.7 : 1);
  const cutV = h * (1 - sink);
  // Earth heaped where it goes in.
  const [ex, ey] = P(0, cutV);
  if (heap)
    g.poly(chaikin(blob(ex, ey + 10, W * 1.5, h * 0.12, seed, 0.3, 14), 1)).fill({
      color: c.dark,
      alpha: 0.7,
    });
  const bars = 7;
  for (let k = 0; k < bars; k++) {
    const m = (k / (bars - 1)) * 2 - 1;
    const snapped = r() < 0.25;
    const end = snapped ? cutV * range(r, 0.35, 0.7) : cutV;
    const pts: number[] = [];
    for (let q = 0; q <= 12; q++) {
      const v = (q / 12) * end;
      const bend = snapped ? 0 : 6 * Math.sin((v / h) * 7 + k) * (k % 3 === 0 ? 1 : 0);
      pts.push(...P(prof(v) * m + bend, v));
    }
    if (snapped) {
      // The snapped end bent out.
      const [bx, by] = P(prof(end) * m * 1.25 + 10 * m, end + 14);
      pts.push(bx, by);
    }
    g.poly(line(pts, 4.2, 0.08)).fill({ color: L.bronze, alpha: 0.95 });
    if (m < 0.3)
      g.poly(
        line(
          pts.map((v, j) => (j % 2 ? v : v - 1.4)),
          1.4,
          0.1,
        ),
      ).fill({ color: L.bronzeLit, alpha: 0.45 });
  }
  // Rings across it (one bent), the hanging loop at the top.
  for (const v of [h * 0.3, h * 0.62]) {
    if (v > cutV) continue;
    const pts: number[] = [];
    for (let q = 0; q <= 10; q++) {
      const m = (q / 10) * 2 - 1;
      pts.push(...P(prof(v) * m, v + Math.sin(m * 3 + seed) * 4));
    }
    g.poly(line(pts, 3.4, 0.05)).fill({ color: L.bronze, alpha: 0.9 });
  }
  const loop: number[] = [];
  for (let q = 0; q <= 10; q++) {
    const a = Math.PI + (Math.PI * q) / 10;
    loop.push(...P(Math.cos(a) * W * 0.22, h * 0.02 + Math.sin(a) * W * 0.3));
  }
  g.poly(line(loop, 3.4, 0.1)).fill({ color: L.bronze, alpha: 0.9 });
}

/** A root lying down the larder's near wall (`kind: 'rib'`) or hanging into its air (`'hang'`): a line and its width. */
export interface LarderRoot {
  kind: 'rib' | 'hang';
  pts: number[];
  w0: number;
  w1: number;
}

/**
 * The near wall's ribs and hanging roots (pure: the same plan and seed give the same roots). The painter bakes them;
 * keeper.ts throws the great cage's shadows from them (a rib lies on the wall: its shadow stays close; a hanging root
 * is out in the air: its shadow swings wide).
 */
export function larderRoots(
  masses: readonly MassRect[],
  b0: Rect,
  avoid: readonly number[],
  seed: number,
): LarderRoot[] {
  const L = LARDER;
  const F = larderFrame(masses, b0);
  const r = rngFor(seed, b0.x, 1371);
  const out: LarderRoot[] = [];
  const span = F.x1 - F.x0;
  const nRib = Math.max(2, Math.round((span / 1000) * L.rib.per));
  for (let k = 0; k < nRib; k++) {
    let x = F.x0 + span * ((k + 0.5) / nRib) + range(r, -90, 90);
    // Not on a column (they stand in front of the wall already).
    for (const a of avoid) if (Math.abs(x - a) < 160) x += x < a ? -170 : 170;
    const roof = F.roof(x);
    if (F.floor - roof < 400) continue;
    const drift = range(r, -260, 260);
    const bow = range(r, 60, 140) * (r() < 0.5 ? -1 : 1);
    const pts: number[] = [];
    for (let t = 0; t <= 16; t++) {
      const u = t / 16;
      pts.push(x + drift * u + Math.sin(Math.PI * u) * bow, roof - 20 + (F.floor + 10 - roof + 20) * u);
    }
    out.push({
      kind: 'rib',
      pts: wander(pts, 18, seed + k * 5, 140),
      w0: range(r, L.rib.w[0], L.rib.w[1]),
      w1: range(r, 22, 34),
    });
  }
  const nHang = Math.round((span / 1000) * L.hang.per);
  for (let k = 0; k < nHang; k++) {
    const x = F.x0 + 120 + r() * (span - 240);
    const roof = F.roof(x);
    if (roof <= b0.y + 8) continue;
    const len = range(r, L.hang.len[0], L.hang.len[1]);
    const sw = range(r, -40, 40);
    const pts: number[] = [];
    for (let t = 0; t <= 10; t++) {
      const u = t / 10;
      pts.push(x + sw * u * u + Math.sin(u * 4 + k) * 10 * u, roof - 16 + len * u);
    }
    out.push({
      kind: 'hang',
      pts: wander(pts, 10, seed + 300 + k, 100),
      w0: range(r, L.hang.w[0], L.hang.w[1]),
      w1: 2,
    });
  }
  return out;
}

/** Bakes the near wall's ribs and hanging roots (`larderRoots`) into the room's near back. */
export function paintLarderRoots(
  p: Paint,
  roots: readonly LarderRoot[],
  T: { near: number; nearLit: number; grain: number; root: number; rootLit: number },
  h: number,
  seed: number,
): void {
  // (A rib lies on the wall: a step off the earth, not the near-black of a column standing in front of it.)
  const body = mixC(T.near, T.nearLit, 0.16);
  for (const [i, rt] of roots.entries()) {
    const r = rngFor(seed, i, 1381);
    const rib = rt.kind === 'rib';
    const width = (t: number): number =>
      rib
        ? Math.max(rt.w1, rt.w0 * (1 - t) ** 0.6, rt.w0 * 1.3 * Math.max(0, (t - 0.85) / 0.15) ** 1.5)
        : Math.max(rt.w1, rt.w0 * (1 - t) ** 0.8);
    p.solid(ribbon(rt.pts, width), rib ? body : T.root, h + (rib ? 0.14 : 0.18), { bark: 0.6 });
    // Its grain (two dark lines along it) and a dim edge where the fungus light from the floor catches it.
    for (let q = 0; q < 2; q++) {
      const off = (q ? 0.22 : -0.18) * rt.w0;
      p.tint(
        line(
          rt.pts.map((v, j) => (j % 2 ? v : v + off)),
          range(r, 2, 4),
          0.3,
        ),
        T.grain,
        0.45,
      );
    }
    p.tint(
      line(
        rt.pts.slice(rib ? 8 : 4).map((v, j) => (j % 2 ? v : v + rt.w0 * 0.32)),
        rt.w0 * 0.14,
        0.4,
      ),
      rib ? T.nearLit : T.rootLit,
      0.22,
    );
    if (rib) {
      // Rootlets off it into the earth, and its foot splaying over the floor.
      for (let k = 0; k < 4; k++) {
        const j = (2 + Math.floor(r() * 10)) * 2;
        const sx = rt.pts[j] as number;
        const sy = rt.pts[j + 1] as number;
        const d = r() < 0.5 ? -1 : 1;
        const l = range(r, 40, 110);
        p.solid(
          line([sx, sy, sx + d * l * 0.5, sy + l * 0.3, sx + d * l, sy + l * 0.75], range(r, 5, 10), 0.5),
          body,
          h + 0.12,
          {
            bark: 0.4,
          },
        );
      }
      const n = rt.pts.length;
      const fx = rt.pts[n - 2] as number;
      const fy = rt.pts[n - 1] as number;
      for (let k = 0; k < 3; k++) {
        const d = (k - 1) * range(r, 50, 100);
        p.solid(
          line([fx, fy - 40, fx + d * 0.6, fy - 10, fx + d * 1.5, fy + 4], range(r, 9, 16), 0.6),
          body,
          h + 0.12,
          {
            bark: 0.4,
          },
        );
      }
    }
  }
}
