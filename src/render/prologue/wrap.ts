// biome-ignore-all lint/style/noNonNullAssertion: point arrays indexed in range
/**
 * The wing-fold: one moth's wing laid round something beside it (his round her in the frost; hers
 * round the fox's case), drawn as one big readable shape so the rhyme reads at phone size. The same
 * function draws both, so the two silhouettes match: a broad moth wing from the shoulder, its leading
 * edge arching up and over the thing and its tip coming down to rest on the far side, hugging it like
 * a cloak; a pale hem band along its edge; one eye-spot; a few veins from the shoulder.
 */
import type { Graphics } from 'pixi.js';

export interface WrapSpec {
  /** The folder's shoulder (world px). */
  sx: number;
  sy: number;
  /** What it folds over: its centre and size (world px). */
  tx: number;
  ty: number;
  r: number;
  /** 0..1 how far the wing has closed round it. */
  k: number;
  /** Wing colours: the membrane and its darker root. */
  color: number;
  dark: number;
  /** A slow shiver (0..1) and the clock. */
  shiver: number;
  clock: number;
}

type P = [number, number];

function bez(a: P, b: P, c: P, d: P, u: number): P {
  const v = 1 - u;
  return [
    v * v * v * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u * u * u * d[0],
    v * v * v * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u * u * u * d[1],
  ];
}

export function drawWrap(g: Graphics, w: WrapSpec): void {
  if (w.k <= 0.01) return;
  const k = w.k;
  const side = w.tx >= w.sx ? 1 : -1;
  const q = Math.sin(w.clock * 28) * 1.1 * w.shiver;
  const S: P = [w.sx, w.sy];
  // Where the tip comes to rest: down the far side of the thing (opening: it swings over from above).
  const restTip: P = [w.tx + side * w.r * 1.05, w.ty + w.r * 0.75];
  const upTip: P = [w.sx + side * w.r * 0.4, w.sy - w.r * 1.6];
  const T: P = [upTip[0] + (restTip[0] - upTip[0]) * k, upTip[1] + (restTip[1] - upTip[1]) * k];
  // Leading edge: up from the shoulder, arching over the thing, down to the tip.
  const top = w.ty - w.r * (1.25 + 0.15 * k) + q;
  const L1: P = [w.sx + side * w.r * 0.2, top - w.r * 0.15];
  const L2: P = [T[0] + side * w.r * 0.35, top];
  // Trailing edge: back from the tip under the arch, close over the thing, to the shoulder (lower).
  const T1: P = [T[0] - side * w.r * 0.15, w.ty - w.r * 0.15];
  const T2: P = [w.sx + side * w.r * 0.45, w.ty - w.r * 0.5];
  const n = 18;
  const pts: number[] = [];
  const lead: P[] = [];
  for (let i = 0; i <= n; i++) {
    const p = bez(S, L1, L2, T, i / n);
    lead.push(p);
    pts.push(p[0], p[1]);
  }
  const trail: P[] = [];
  for (let i = 1; i <= n; i++) {
    const p = bez(T, T1, T2, [w.sx, w.sy + w.r * 0.25], i / n);
    trail.push(p);
    pts.push(p[0], p[1]);
  }
  g.poly(pts).fill({ color: w.dark, alpha: 0.97 });
  // The lighter membrane: the outer two thirds.
  const mem: number[] = [];
  for (let i = 4; i <= n; i++) mem.push(lead[i]![0], lead[i]![1]);
  for (let i = 0; i < n - 4; i++) {
    const a = lead[n - i]!;
    const b = trail[i]!;
    mem.push(a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55);
  }
  g.poly(mem).fill({ color: w.color, alpha: 0.95 });
  // Veins from the shoulder.
  for (const f of [0.35, 0.6, 0.85]) {
    const a = lead[Math.round(n * f)]!;
    g.moveTo(w.sx, w.sy).lineTo(a[0] + (w.tx - a[0]) * 0.1, a[1] + (w.ty - a[1]) * 0.1);
  }
  g.stroke({ color: w.dark, width: Math.max(1, w.r * 0.04), alpha: 0.6 });
  // The pale hem along the leading edge.
  g.moveTo(lead[2]![0], lead[2]![1]);
  for (let i = 3; i <= n; i++) g.lineTo(lead[i]![0], lead[i]![1]);
  g.stroke({ color: 0xc4b4aa, width: Math.max(1.6, w.r * 0.08), alpha: 0.85 });
  // One eye-spot.
  if (k > 0.35) {
    const a = lead[Math.round(n * 0.62)]!;
    const ex = a[0] + (w.tx - a[0]) * 0.3;
    const ey = a[1] + (w.ty - a[1]) * 0.3;
    g.circle(ex, ey, w.r * 0.16).stroke({ color: 0xc4b4aa, width: Math.max(1, w.r * 0.05), alpha: 0.9 });
    g.circle(ex, ey, w.r * 0.06).fill({ color: 0xc4b4aa, alpha: 0.9 });
  }
}
