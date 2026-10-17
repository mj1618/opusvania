// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * Ruins: human buildings as a painter would block them in at night. No clean rectangles: every
 * outline leans, its roof sags and breaks, its corners are bitten off; the face carries a value
 * gradient and rain streaks; windows are hand-cut quads (bricked, broken, a few lit by the faint
 * breathing glow of a case asleep inside). Root then swallows the outline (`drape`), so the
 * rectangle is interrupted where it matters: the roofline and the corners.
 */
import { Container, type Graphics } from 'pixi.js';
import { mixHex } from './kit';
import { glow, vgrad } from './paint';
import { branchRoot, type Pt, smoothPath, type TissueBatch } from './tissue';

export interface RuinSpec {
  x: number;
  w: number;
  top: number;
  bottom: number;
  /** Body colour (its middle); the top takes `sky` a little, the foot sinks toward `foot`. */
  color: number;
  sky?: number;
  foot?: number;
  /** Top offset sideways (px): the whole thing leans. */
  lean?: number;
  /** Roof sag in the middle (px). */
  sag?: number;
  /** Bites out of the roofline: count, max depth px. */
  breaks?: [number, number];
  /** Storey height px; 0 = no windows. */
  storey?: number;
  /** Window columns (count), window size (w, h). */
  cols?: number;
  win?: [number, number];
  winColor?: number;
  /** Chance per window: missing (bricked / dark), broken (a jagged hole), lit (a case breathing inside). */
  bricked?: number;
  broken?: number;
  lit?: number;
  /** Storey lines and rain streaks: how visible 0..1. */
  weather?: number;
  /** A pitched roof: the ridge rises this many px above `top` in the middle. */
  peak?: number;
  /** Stacks and tanks on the roof (count tried). */
  clutter?: number;
  /** Ground floor: a shop opening (true) or not. */
  shop?: boolean;
}

export interface Ruin {
  /** Roofline points left to right (screen px). */
  roof: Pt[];
  /** Outline (closed). */
  outline: Pt[];
  /** Lit windows (centre, size). */
  lit: { x: number; y: number; w: number; h: number }[];
  /** Roof y at screen x (clamped to the roof's span). */
  roofAt: (x: number) => number;
  /** Left / right wall x at screen y. */
  wallAt: (y: number, side: -1 | 1) => number;
}

/** Draw one ruin into `g`. */
export function ruin(rng: () => number, g: Graphics, s: RuinSpec): Ruin {
  const lean = s.lean ?? 0;
  const sag = s.sag ?? 0;
  const H = s.bottom - s.top;
  const wallAt = (y: number, side: -1 | 1): number => {
    const t = (s.bottom - y) / H; // 0 foot .. 1 top
    const bow = Math.sin(t * Math.PI) * lean * 0.12;
    return (side < 0 ? s.x : s.x + s.w) + lean * t * t + bow;
  };
  // Roofline: a sagging line, small jitter, then bites.
  const n = Math.max(6, Math.round(s.w / 14));
  const roof: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = s.x + lean + s.w * t;
    const peak = (s.peak ?? 0) * (1 - Math.abs(2 * t - 1));
    const y = s.top + sag * Math.sin(Math.PI * t) - peak + (rng() - 0.5) * 3 + (i === 0 || i === n ? -2 : 0);
    roof.push([x, y]);
  }
  const [bc, bd] = s.breaks ?? [0, 0];
  const bites: { c: number; half: number; depth: number }[] = [];
  for (let k = 0; k < bc; k++) {
    // A bite: a jagged notch, wider at the top; sometimes at a corner (the corner has fallen).
    const atCorner = rng() < 0.4;
    const c = atCorner ? (rng() < 0.5 ? 0.04 : 0.96) : 0.15 + rng() * 0.7;
    const half = atCorner ? 0.12 + rng() * 0.12 : 0.05 + rng() * 0.12;
    const depth = bd * (0.4 + 0.6 * rng());
    bites.push({ c, half, depth });
    // Stepped like broken floors, jagged like broken brick.
    const step = Math.max(8, (s.storey ?? 40) * 0.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const d = Math.abs(t - c) / half;
      if (d >= 1) continue;
      const raw = depth * (1 - d * d) ** 0.6;
      const stepped = Math.round(raw / step) * step;
      roof[i]![1] += stepped * 0.7 + raw * 0.3 + (rng() - 0.5) * 7;
    }
  }
  const roofAt = (x: number): number => {
    if (x <= roof[0]![0]) return roof[0]![1];
    for (let i = 1; i < roof.length; i++) {
      const a = roof[i - 1]!;
      const b = roof[i]!;
      if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
    return roof[roof.length - 1]![1];
  };
  // Outline: up the left wall, along the roof, down the right wall; walls bow a little.
  const outline: Pt[] = [];
  const wallSteps = 10;
  for (let i = 0; i <= wallSteps; i++) {
    const y = s.bottom - ((s.bottom - roof[0]![1]) * i) / wallSteps;
    outline.push([wallAt(y, -1) + (i > 0 && i < wallSteps ? (rng() - 0.5) * 2 : 0), y]);
  }
  for (const p of roof.slice(1, -1)) outline.push(p);
  for (let i = wallSteps; i >= 0; i--) {
    const y = s.bottom - ((s.bottom - roof[roof.length - 1]![1]) * i) / wallSteps;
    outline.push([wallAt(y, 1) + (i > 0 && i < wallSteps ? (rng() - 0.5) * 2 : 0), y]);
  }
  const sky = s.sky ?? mixHex(s.color, 0x3a3a5a, 0.5);
  const foot = s.foot ?? mixHex(s.color, 0x000000, 0.45);
  g.poly(outline.flat()).fill(
    vgrad([
      [0, mixHex(s.color, sky, 0.55)],
      [0.18, mixHex(s.color, sky, 0.2)],
      [0.55, s.color],
      [1, foot],
    ]),
  );
  const edgeCol = mixHex(s.color, sky, 0.6);
  // Floor slabs left hanging across the bites, and a few bent rods: the silhouette's small print.
  for (const b of bites) {
    const step = s.storey ?? 40;
    const x0 = s.x + lean + s.w * Math.max(0, b.c - b.half * 0.8);
    const x1 = s.x + lean + s.w * Math.min(1, b.c + b.half * 0.8);
    for (let y = s.top + step * 0.6; y < s.top + b.depth; y += step) {
      if (rng() < 0.35) continue;
      const fromLeft = rng() < 0.5;
      const len = (x1 - x0) * (0.25 + rng() * 0.55);
      const xa = fromLeft ? x0 : x1;
      const xb = fromLeft ? x0 + len : x1 - len;
      const droop = (rng() - 0.2) * 10;
      g.poly([xa, y, xb, y + droop, xb, y + droop + 4, xa, y + 5]).fill(edgeCol);
      if (rng() < 0.6)
        for (let k = 0; k < 3; k++) {
          const rx = xa + (xb - xa) * (0.5 + rng() * 0.5);
          g.moveTo(rx, y + droop * 0.8)
            .quadraticCurveTo(
              rx + (rng() - 0.5) * 10,
              y + 10 + rng() * 10,
              rx + (rng() - 0.5) * 16,
              y + 14 + rng() * 22,
            )
            .stroke({ color: edgeCol, width: 1.2, alpha: 0.8 });
        }
    }
  }
  // Roof clutter: stacks and a tank on legs, where the roof still stands.
  for (let k = 0; k < (s.clutter ?? 0); k++) {
    const t = 0.1 + rng() * 0.8;
    const x = s.x + lean + s.w * t;
    const y = roofAt(x);
    if (y > s.top + sag + 6 - (s.peak ?? 0) * (1 - Math.abs(2 * t - 1))) continue;
    if (rng() < 0.65) {
      const w = 6 + rng() * 10;
      const h = 10 + rng() * 34;
      g.poly([x - w / 2, y + 2, x - w / 2 + 1, y - h, x + w / 2 + 1, y - h - 1, x + w / 2, y + 2]).fill(
        edgeCol,
      );
    } else {
      const w = 26 + rng() * 20;
      const h = 18 + rng() * 10;
      g.rect(x - w / 2, y - h - 14, w, h).fill(edgeCol);
      for (const lx of [x - w / 2 + 3, x + w / 2 - 5]) g.rect(lx, y - 14, 2, 15).fill(edgeCol);
    }
  }
  const weather = s.weather ?? 0.6;
  const lit: Ruin['lit'] = [];
  const storey = s.storey ?? 0;
  if (storey > 0) {
    const cols = s.cols ?? Math.max(2, Math.round(s.w / 60));
    const [ww, wh] = s.win ?? [s.w / cols / 2.4, storey * 0.42];
    const winColor = s.winColor ?? mixHex(s.color, 0x000000, 0.7);
    const shopH = s.shop ? storey * 1.3 : 0;
    // Storeys from the top down; each one sags with the roof a little less than the one above.
    for (let y0 = s.top + storey * 0.55; y0 + wh < s.bottom - shopH - storey * 0.2; y0 += storey) {
      const depthK = 1 - (y0 - s.top) / H;
      if (weather > 0) {
        // The floor line: a faint band, sagging and broken.
        const ly = y0 - storey * 0.18;
        const pts: number[] = [];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          const x = wallAt(ly, -1) + (wallAt(ly, 1) - wallAt(ly, -1)) * t;
          pts.push(x, ly + sag * Math.sin(Math.PI * t) * depthK * 0.8 + (rng() - 0.5) * 1.5);
        }
        for (let i = 0; i < pts.length - 2; i += 2) {
          if (rng() < 0.18) continue;
          g.moveTo(pts[i]!, pts[i + 1]!).lineTo(pts[i + 2]!, pts[i + 3]!);
        }
        g.stroke({ color: mixHex(s.color, sky, 0.35), width: 2, alpha: 0.28 * weather });
      }
      for (let ci = 0; ci < cols; ci++) {
        const t = (ci + 0.5) / cols;
        const xl = wallAt(y0, -1);
        const xr = wallAt(y0, 1);
        const cx = xl + (xr - xl) * t + (rng() - 0.5) * ww * 0.25;
        const cy = y0 + wh / 2 + sag * Math.sin(Math.PI * t) * depthK * 0.8 + (rng() - 0.5) * 3;
        // Below the roof (a bite may have taken this window's storey).
        if (cy - wh * 0.6 < roofAt(cx) + 6) continue;
        const r = rng();
        const w2 = ww * (0.86 + rng() * 0.28);
        const h2 = wh * (0.9 + rng() * 0.2);
        const q = (k: number): number => (rng() - 0.5) * k;
        const quad = [
          cx - w2 / 2 + q(2),
          cy - h2 / 2 + q(2),
          cx + w2 / 2 + q(2),
          cy - h2 / 2 + q(2),
          cx + w2 / 2 + q(2),
          cy + h2 / 2 + q(2),
          cx - w2 / 2 + q(2),
          cy + h2 / 2 + q(2),
        ];
        if (r < (s.bricked ?? 0.15)) {
          g.poly(quad).fill({ color: mixHex(s.color, 0x000000, 0.25), alpha: 0.6 });
          continue;
        }
        if (r < (s.bricked ?? 0.15) + (s.broken ?? 0.12)) {
          // A jagged hole, bigger than the window was.
          const pts: number[] = [];
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const k = 0.65 + rng() * 0.6;
            pts.push(cx + Math.cos(a) * w2 * 0.7 * k, cy + Math.sin(a) * h2 * 0.65 * k);
          }
          g.poly(pts).fill(mixHex(winColor, 0x000000, 0.5));
          continue;
        }
        const isLit = rng() < (s.lit ?? 0);
        g.poly(quad).fill(isLit ? mixHex(winColor, 0x8a7480, 0.55) : winColor);
        // The sill catches a little sky.
        g.rect(cx - w2 / 2 - 2, cy + h2 / 2, w2 + 4, 2).fill({ color: sky, alpha: 0.35 * weather });
        if (isLit) lit.push({ x: cx, y: cy, w: w2, h: h2 });
        else if (rng() < 0.4)
          // A mullion, or a torn blind.
          g.rect(cx - 1, cy - h2 / 2, 2, h2).fill({ color: mixHex(s.color, sky, 0.15), alpha: 0.7 });
        // Rain streak from the sill.
        if (weather > 0 && rng() < 0.5) {
          const len = storey * (0.3 + rng() * 0.9);
          g.poly([
            cx - w2 * 0.3,
            cy + h2 / 2 + 2,
            cx + w2 * 0.2,
            cy + h2 / 2 + 2,
            cx + q(4),
            cy + h2 / 2 + len,
          ]).fill({
            color: 0x000000,
            alpha: 0.12 * weather,
          });
        }
      }
    }
    if (s.shop) {
      // Ground floor: a wide dark opening, its shutter half down, a fascia above.
      const y = s.bottom - shopH;
      const xl = wallAt(y, -1) + s.w * 0.08;
      const xr = wallAt(y, 1) - s.w * 0.08;
      g.rect(xl - 6, y - 8, xr - xl + 12, 12).fill(mixHex(s.color, sky, 0.25));
      g.poly([xl, y + 4, xr, y + 6, xr, s.bottom, xl, s.bottom]).fill(mixHex(winColor, 0x000000, 0.3));
      const shut = shopH * (0.35 + rng() * 0.3);
      for (let yy = y + 6; yy < y + shut; yy += 5)
        g.rect(xl, yy, xr - xl, 2.5).fill({ color: mixHex(s.color, sky, 0.12), alpha: 0.8 });
    }
  }
  return { roof, outline, lit, roofAt, wallAt };
}

/**
 * The breathing light of cases asleep behind windows: a dim pale fill already drawn by `ruin`; here a
 * dark curled shape and an additive glow that rises and falls with the breath. Returns the container
 * of glows (add it above the plane, or inside it) and an update for the breath.
 */
export function windowGlows(
  rng: () => number,
  g: Graphics,
  lit: Ruin['lit'],
  color: number,
  k: number,
): { view: Container; update: (breath: number) => void } {
  const view = new Container();
  view.blendMode = 'add';
  const sprites = lit.map((w) => {
    // The case inside: an upright dark bean.
    g.ellipse(w.x + (rng() - 0.5) * w.w * 0.3, w.y + w.h * 0.08, w.w * 0.22, w.h * 0.36).fill({
      color: 0x0a0810,
      alpha: 0.45,
    });
    const s = glow(w.x, w.y, Math.max(w.w, w.h) * 1.6, color, k);
    view.addChild(s);
    return { s, ph: rng() * 0.25 };
  });
  return {
    view,
    update: (b) => {
      for (const { s, ph } of sprites) s.alpha = k * (0.55 + 0.45 * Math.max(0, Math.min(1, b - ph + 0.1)));
    },
  };
}

export interface DrapeSpec {
  color: number;
  shadow: number;
  glow: number;
  /** Heavy fold along the roof: half-width range. */
  fold: [number, number];
  /** Streams that pour down the face: count, length range, start width. */
  pours: number;
  pourLen: [number, number];
  pourW: number;
  /** Fraction of the roofline the fold covers, starting at `from` (0..1). */
  from?: number;
  span?: number;
  /** How many gripping lobes over the edge (1 = default count, 0 = none). */
  lobes?: number;
}

/**
 * Root swallowing a ruin's roofline: one heavy fold that rides the roof (thickness varying wildly),
 * gripping over the edge in fat lobes, and streams that pour down the face and branch.
 */
export function drape(rng: () => number, b: TissueBatch, r: Ruin, d: DrapeSpec): void {
  const from = d.from ?? 0;
  const span = d.span ?? 1;
  const n = r.roof.length;
  const i0 = Math.floor(from * (n - 1));
  const i1 = Math.min(n - 1, Math.ceil((from + span) * (n - 1)));
  // The fold rides the roof but does not follow every broken brick: decimate, then smooth.
  const raw = r.roof.slice(i0, i1 + 1);
  const along: Pt[] = raw
    .filter((_, i) => i % 3 === 0 || i === raw.length - 1)
    .map(([x, y]) => [x, y + 3] as Pt);
  if (along.length >= 2) {
    const path = smoothPath(along, 4);
    const ph = rng() * 6.28;
    const [w0, w1] = d.fold;
    const hw = (t: number): number => {
      const k = 0.5 + 0.5 * Math.sin(t * 17 + ph) * Math.sin(t * 5.3 + ph * 2);
      const ends = Math.min(1, t / 0.06, (1 - t) / 0.06);
      return Math.max(1, (w0 + (w1 - w0) * k) * (0.3 + 0.7 * ends));
    };
    b.strip(path, hw, { color: d.color, kind: 1, glow: d.glow, seed: rng() });
    // Lobes gripping over the edge: short fat strips bending down the face.
    for (let k = 0; k < (d.lobes ?? 1) * Math.max(2, Math.round(path.length / 14)); k++) {
      const p = path[Math.floor(rng() * path.length)]!;
      const l = 14 + rng() * 40;
      const pts = smoothPath(
        [
          [p[0], p[1] - 4],
          [p[0] + (rng() - 0.5) * 12, p[1] + l * 0.5],
          [p[0] + (rng() - 0.5) * 18, p[1] + l],
        ],
        6,
      );
      const w = w1 * (0.5 + rng() * 0.6);
      b.strip(
        pts,
        (t) =>
          w * (1 - 0.5 * t) * (t > 0.85 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.85) / 0.15) ** 2)) : 1) + 1,
        {
          color: rng() < 0.5 ? d.color : d.shadow,
          kind: 1,
          glow: d.glow,
          seed: rng(),
        },
      );
    }
  }
  for (let k = 0; k < d.pours; k++) {
    const p = along[Math.floor(rng() * along.length)] ?? r.roof[0]!;
    branchRoot(b, rng, {
      x: p[0],
      y: p[1] + 2,
      ang: Math.PI / 2 + (rng() - 0.5) * 0.4,
      len: d.pourLen[0] + rng() * (d.pourLen[1] - d.pourLen[0]),
      step: 7,
      curl: 0.1,
      droop: 0.06,
      w0: d.pourW * (0.6 + rng() * 0.8),
      w1: 0.8,
      depth: 2,
      kids: 2,
      bulge: 0.35,
      style: { color: rng() < 0.6 ? d.color : d.shadow, glow: d.glow * (0.5 + rng() * 0.5) },
    });
  }
}

/**
 * Root gripping a ruin's corner: a fat column that climbs the wall edge (half on the wall, half off
 * it, so the corner's straight line is lost), with arms that reach across the face and hold on.
 */
export function grip(
  rng: () => number,
  b: TissueBatch,
  r: Ruin,
  side: -1 | 1,
  o: { color: number; shadow: number; glow: number; w: number; arms: number; bottom: number; top?: number },
): void {
  const top = o.top ?? r.roofAt(side < 0 ? r.roof[0]![0] : r.roof[r.roof.length - 1]![0]) - 10;
  const pts: Pt[] = [];
  for (let y = o.bottom + 10; y >= top; y -= 10) {
    const t = (o.bottom - y) / (o.bottom - top);
    pts.push([r.wallAt(y, side) + Math.sin(y * 0.013 + o.w) * o.w * 0.5 - side * o.w * 0.15, y]);
    if (t >= 1) break;
  }
  const ph = rng() * 6;
  b.strip(
    pts,
    (t) => o.w * (1 - 0.45 * t) * (0.75 + 0.35 * Math.sin(t * 13 + ph) * Math.sin(t * 4.1 + ph)) + 2,
    { color: o.color, kind: 0, glow: o.glow, seed: rng() },
  );
  // A second, thinner strand twisting round it.
  b.strip(
    pts.map(([x, y], i) => [x + Math.sin(i * 0.5 + ph) * o.w * 0.7, y] as Pt),
    (t) => o.w * 0.3 * (1 - 0.5 * t) + 1,
    { color: o.shadow, kind: 0, glow: o.glow * 0.7, seed: rng() },
  );
  for (let k = 0; k < o.arms; k++) {
    const p = pts[Math.floor(rng() * pts.length * 0.9)]!;
    branchRoot(b, rng, {
      x: p[0],
      y: p[1],
      ang: (side < 0 ? 0 : Math.PI) + (rng() - 0.5) * 1.2,
      len: 80 + rng() * 260,
      step: 7,
      curl: 0.16,
      droop: 0.04,
      w0: o.w * (0.25 + rng() * 0.3),
      w1: 0.7,
      depth: 1,
      kids: 2,
      bulge: 0.4,
      style: { color: rng() < 0.6 ? o.color : o.shadow, glow: o.glow },
    });
  }
}
