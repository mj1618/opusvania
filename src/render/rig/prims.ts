import type { Graphics } from 'pixi.js';
import type { V2 } from './math';
import { toWorld, type Xf } from './skeleton';

/** A world-space drawing primitive. `ol` = part of the silhouette (gets the rim outline). */
export type Prim =
  | { k: 'poly'; pts: number[]; c: number; a: number; ol: boolean }
  | { k: 'line'; pts: number[]; w: number; c: number; a: number; ol: boolean }
  | { k: 'circle'; x: number; y: number; r: number; c: number; a: number; ol: boolean };

/**
 * Collects the body as world-space primitives in paint order. Keeping a list (instead of drawing
 * straight into Graphics) lets the same body be painted normally (rim outline pass, then fills),
 * as a flat silhouette (Slip afterimages, hurt flash, death pop) or stored for a later frame.
 */
export class Prims {
  readonly list: Prim[] = [];
  /** Uniform size factor for widths and radii (from the squash). */
  private readonly k: number;

  constructor(readonly xf: Xf) {
    this.k = Math.sqrt(Math.abs(xf.sx * xf.sy));
  }

  w(p: V2): V2 {
    return toWorld(this.xf, p);
  }

  poly(pts: readonly V2[], c: number, ol = true, a = 1): void {
    const out: number[] = [];
    for (const p of pts) {
      const q = toWorld(this.xf, p);
      out.push(q.x, q.y);
    }
    this.list.push({ k: 'poly', pts: out, c, a, ol });
  }

  line(pts: readonly V2[], w: number, c: number, ol = true, a = 1): void {
    const out: number[] = [];
    for (const p of pts) {
      const q = toWorld(this.xf, p);
      out.push(q.x, q.y);
    }
    this.list.push({ k: 'line', pts: out, w: w * this.k, c, a, ol });
  }

  circle(p: V2, r: number, c: number, ol = true, a = 1): void {
    const q = toWorld(this.xf, p);
    this.list.push({ k: 'circle', x: q.x, y: q.y, r: r * this.k, c, a, ol });
  }

  polyW(pts: readonly V2[], c: number, ol = true, a = 1): void {
    const out: number[] = [];
    for (const p of pts) out.push(p.x, p.y);
    this.list.push({ k: 'poly', pts: out, c, a, ol });
  }

  lineW(pts: readonly V2[], w: number, c: number, ol = true, a = 1): void {
    const out: number[] = [];
    for (const p of pts) out.push(p.x, p.y);
    this.list.push({ k: 'line', pts: out, w: w * this.k, c, a, ol });
  }

  circleW(p: V2, r: number, c: number, ol = true, a = 1): void {
    this.list.push({ k: 'circle', x: p.x, y: p.y, r: r * this.k, c, a, ol });
  }
}

export interface PaintStyle {
  /** Rim outline colour and width (px outside the silhouette); 0 = none. */
  rim: number;
  rimW: number;
  rimAlpha: number;
  /** Paint everything this one colour (afterimages, flashes). */
  flat?: number;
  alpha: number;
  /** Offset (world px) applied to every point (hitstop shake). */
  dx?: number;
  dy?: number;
}

function shift(pts: number[], dx: number, dy: number): number[] {
  if (dx === 0 && dy === 0) return pts;
  const out = pts.slice();
  for (let i = 0; i < out.length; i += 2) {
    out[i] = (out[i] as number) + dx;
    out[i + 1] = (out[i + 1] as number) + dy;
  }
  return out;
}

function strokePath(g: Graphics, pts: number[], w: number, c: number, a: number): void {
  if (pts.length < 4) return;
  g.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] as number, pts[i + 1] as number);
  g.stroke({ width: w, color: c, alpha: a, cap: 'round', join: 'round' });
}

/** Paints a primitive list: one rim pass under the whole silhouette, then the fills in order. */
export function paint(g: Graphics, list: readonly Prim[], st: PaintStyle): void {
  const dx = st.dx ?? 0;
  const dy = st.dy ?? 0;
  if (st.rimW > 0 && st.flat === undefined) {
    const ra = st.rimAlpha * st.alpha;
    const ow = st.rimW;
    for (const p of list) {
      if (!p.ol) continue;
      if (p.k === 'poly') {
        const pts = shift(p.pts, dx, dy);
        g.poly(pts, true).stroke({ width: ow * 2, color: st.rim, alpha: ra, join: 'round' });
      } else if (p.k === 'line') strokePath(g, shift(p.pts, dx, dy), p.w + ow * 2, st.rim, ra);
      else g.circle(p.x + dx, p.y + dy, p.r + ow).fill({ color: st.rim, alpha: ra });
    }
  }
  for (const p of list) {
    if (st.flat !== undefined && !p.ol) continue;
    const c = st.flat ?? p.c;
    const a = p.a * st.alpha;
    if (p.k === 'poly') g.poly(shift(p.pts, dx, dy), true).fill({ color: c, alpha: a });
    else if (p.k === 'line') strokePath(g, shift(p.pts, dx, dy), p.w, c, a);
    else g.circle(p.x + dx, p.y + dy, p.r).fill({ color: c, alpha: a });
  }
}
