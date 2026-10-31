/**
 * The escape's perches as torn roots (the Canopy r15, review r14 #1: "flat slabs with clean white top edges, like UI
 * platforms"). A thin `rubble-*` gate in the den is drawn as a tangle of roots torn out of the roof: thick strands
 * twisted along its walk with frayed tips past its ends, clods of earth caught in it, rootlets dangling under it, hung
 * from the roof by the roots it tore from. Its walk is a broken lit edge along the top strand, never a line. It sags and
 * sways when she lands on it (`PerchSprings`, render time only).
 */
import type { Graphics } from 'pixi.js';
import { mix } from '../scene/lib/look';
import { hash01 } from './config';
import type { GlowPool } from './glow';

export const PERCH = {
  /** Strands twisted along the walk, their thickness (px), how far the frayed tips run past its ends (px). */
  strands: 4,
  thick: [9, 16] as const,
  tips: [22, 56] as const,
  /** Rootlets dangling under it (px long). */
  dangle: [24, 84] as const,
  /** Colours: the strands' body and bark edge; the walk's lit edge (moonlit once the roof is open, else dim warm). */
  body: 0x0d0907,
  bark: 0x3a2c20,
  litMoon: 0xa9bad2,
  litDim: 0x7a6a56,
  /** The spring: sag (px) while she stands, the kick a landing gives (px/s), stiffness, damping. */
  sag: 3,
  kick: 140,
  k: 170,
  damp: 9,
};

/** A perch's sag and sway: one spring per gate, kicked as she lands, pulled down a little while she stands. */
export class PerchSprings {
  private readonly s = new Map<string, { y: number; v: number; on: boolean; t: number }>();

  update(dt: number, id: string, on: boolean, vy: number): { sag: number; sway: number } {
    let q = this.s.get(id);
    if (!q) {
      q = { y: 0, v: 0, on: false, t: 0 };
      this.s.set(id, q);
    }
    if (on && !q.on) q.v += PERCH.kick * Math.min(1.6, 0.5 + Math.abs(vy) / 600);
    q.on = on;
    const want = on ? PERCH.sag : 0;
    const d = Math.min(dt, 1 / 30);
    q.v += (-(q.y - want) * PERCH.k - q.v * PERCH.damp) * d;
    q.y += q.v * d;
    q.t += d * (1 + Math.min(1, Math.abs(q.v) / 60));
    return {
      sag: q.y,
      sway: Math.sin(q.t * 5.2) * Math.min(8, Math.abs(q.y - want) * 1.4 + Math.abs(q.v) * 0.03),
    };
  }
}

/**
 * Paints one torn-root perch whose walk is (x..x+w, y); `roof` is the underside it hangs from, `fall` 0 standing to 1
 * gone, `lit` once the roof's shaft lets the moon in.
 */
export function tornPerch(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fall: number,
  lit: boolean,
  id: string,
  roof: number,
  clock: number,
  load: { sag: number; sway: number },
): void {
  const a = 1 - fall;
  if (a <= 0.01) return;
  const P = PERCH;
  const r = (k: number): number => hash01(id, k);
  const dy = -fall * fall * 320 + load.sag;
  const top = y + dy;
  const sw = load.sway;
  // The roots it hangs in: two or three from the roof down into it, wound, ragged.
  for (let k = 0; k < 3; k++) {
    const u = k === 0 ? 0.14 : k === 1 ? 0.86 : 0.35 + 0.3 * r(300);
    if (k === 2 && r(301) < 0.4) continue;
    const rx = x + w * u;
    const top0 = roof - 10;
    const bot = top + h * 0.4;
    const L: number[] = [];
    const R: number[] = [];
    for (let q = 0; q <= 12; q++) {
      const v = q / 12;
      const yy = top0 + (bot - top0) * v;
      const xx =
        rx +
        Math.sin(v * 4.2 + r(310 + k) * 6) * 14 * (1 - v * 0.6) +
        (k === 0 ? -1 : 1) * 18 * (1 - v) +
        sw * v * v;
      const wd = (14 + 10 * r(320 + k)) * (1 - 0.5 * v);
      L.push(xx - wd / 2, yy);
      R.unshift(xx + wd / 2, yy);
    }
    g.poly([...L, ...R]).fill({ color: 0x110c08, alpha: a });
    g.poly(L, false).stroke({ color: P.bark, width: 1.5, alpha: 0.5 * a });
  }
  // The strands along the walk, back to front; the first is the walk's own (its top on the collision).
  const tl = P.tips[0] + (P.tips[1] - P.tips[0]) * r(1);
  const tr = P.tips[0] + (P.tips[1] - P.tips[0]) * r(2);
  let walk: number[] = [];
  for (let s = P.strands - 1; s >= 0; s--) {
    const th = P.thick[0] + (P.thick[1] - P.thick[0]) * r(10 + s);
    const x0 = x - tl * (0.4 + 0.6 * r(20 + s));
    const x1 = x + w + tr * (0.4 + 0.6 * r(30 + s));
    const base = s === 0 ? top + th / 2 : top + 6 + s * 5 + 8 * r(40 + s);
    const amp = s === 0 ? 1.5 : 4 + 5 * r(50 + s);
    const n = Math.max(8, Math.round((x1 - x0) / 18));
    const U: number[] = [];
    const D: number[] = [];
    for (let q = 0; q <= n; q++) {
      const v = q / n;
      const xx = x0 + (x1 - x0) * v;
      // Inside the walk it lies level; past the ends it droops (torn tips hang).
      const past = xx < x ? (x - xx) / tl : xx > x + w ? (xx - x - w) / tr : 0;
      const droop = past * past * (18 + 20 * r(60 + s)) + past * sw * 0.6;
      const cy = base + Math.sin(v * (5 + 3 * r(70 + s)) + r(80 + s) * 9) * amp + droop;
      // Tapered at both ends, frayed thinner at the torn tips.
      const taper = Math.min(1, v * 6, (1 - v) * 6) * (1 - 0.5 * Math.min(1, past));
      const t = th * (0.25 + 0.75 * taper);
      U.push(xx, cy - t / 2);
      D.unshift(xx, cy + t / 2);
    }
    g.poly([...U, ...D]).fill({ color: mix(P.body, 0x1c140e, s / P.strands), alpha: a });
    g.poly(U, false).stroke({ color: P.bark, width: 1.4, alpha: 0.55 * a });
    // (Bark splits along it.)
    for (let k = 0; k < 3; k++) {
      const q = Math.floor((0.15 + 0.7 * r(90 + s * 3 + k)) * n) * 2;
      const qx = U[q] as number;
      const qy = (U[q + 1] as number) + th * 0.35;
      g.moveTo(qx, qy)
        .lineTo(qx + 14 + 10 * r(95 + k), qy + 1)
        .stroke({ color: 0x050302, width: 1.6, alpha: 0.8 * a });
    }
    // Frayed fibres off each torn end.
    for (const end of [0, 1]) {
      const ex = end ? x1 : x0;
      const ey = end ? (U[U.length - 1] as number) : (U[1] as number);
      for (let k = 0; k < 3; k++) {
        const ang = (end ? 0 : Math.PI) + (r(100 + s * 6 + end * 3 + k) - 0.3) * 1.1;
        const len = 10 + 16 * r(110 + s * 6 + end * 3 + k);
        g.moveTo(ex, ey + th / 2)
          .lineTo(ex + Math.cos(ang) * len, ey + th / 2 + Math.abs(Math.sin(ang)) * len + 4)
          .stroke({ color: 0x1e150e, width: 1.8, cap: 'round', alpha: a });
      }
    }
    if (s === 0) walk = U;
  }
  // Clods of earth caught in the tangle.
  for (let k = 0; k < Math.max(2, Math.round(w / 70)); k++) {
    const cx = x + w * (0.1 + 0.8 * r(130 + k));
    const rr = 7 + 9 * r(140 + k);
    const cy = top + 14 + rr * 0.5 + 6 * r(150 + k);
    g.ellipse(cx, cy, rr, rr * 0.72).fill({ color: mix(0x16110c, 0x2e231a, r(160 + k)), alpha: a });
  }
  // Rootlets dangling under it, swaying.
  for (let k = 0; k < 6 + Math.round(w / 64); k++) {
    const rx = x + w * (-0.05 + 1.1 * r(170 + k));
    const ry = top + 14 + 10 * r(180 + k);
    const len = P.dangle[0] + (P.dangle[1] - P.dangle[0]) * r(190 + k) ** 1.5;
    const swing = Math.sin(clock * (1.1 + r(200 + k)) + k) * 5 + sw * 1.4;
    g.moveTo(rx, ry)
      .quadraticCurveTo(rx + swing * 0.4 + (r(210 + k) - 0.5) * 16, ry + len * 0.55, rx + swing, ry + len)
      .stroke({ color: 0x150f0a, width: 3.2 - 1.8 * r(220 + k), cap: 'round', alpha: a });
  }
  // The walk: a broken lit edge along the top strand where it lies level (never one line end to end).
  const lc = lit ? P.litMoon : P.litDim;
  let q = 0;
  while (q < walk.length - 2) {
    const xa = walk[q] as number;
    if (xa < x - 4 || xa > x + w + 4) {
      q += 2;
      continue;
    }
    const segs = 2 + Math.floor(r(240 + q) * 3);
    const pts: number[] = [];
    for (let k = 0; k <= segs && q + k * 2 + 1 < walk.length; k++) {
      const px = walk[q + k * 2] as number;
      if (px > x + w + 4) break;
      pts.push(px, (walk[q + k * 2 + 1] as number) + 0.5);
    }
    if (pts.length >= 4)
      g.poly(pts, false).stroke({
        color: lc,
        width: 2.2 + 1.2 * r(250 + q),
        alpha: (lit ? 0.75 : 0.6) * a * (0.7 + 0.3 * r(260 + q)),
        cap: 'round',
      });
    q += segs * 2 + 2;
  }
}

/**
 * A breach in a wall (the Canopy r15, the den's `den-breach`): standing, earth like the wall round it with cracks that
 * glow faintly; opening (`fall` 0..1), it falls out as clods tumbling down and away, leaving the hole.
 */
export function breachPlug(
  g: Graphics,
  glow: GlowPool,
  x: number,
  y: number,
  w: number,
  h: number,
  fall: number,
  clock: number,
  id: string,
): void {
  const r = (k: number): number => hash01(id, k);
  const cols = Math.max(2, Math.round(w / 44));
  const rows = Math.max(2, Math.round(h / 44));
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const k = i * 31 + j;
      // Each clod lets go at its own moment (its foot first) and drops, turning.
      const at = 0.5 * r(400 + k) * (1 - j / rows);
      const u = Math.max(0, Math.min(1, (fall - at) / 0.5));
      if (u >= 1) continue;
      const cx = x + (i + 0.5) * (w / cols) + (r(410 + k) - 0.5) * 14 + u * (r(420 + k) - 0.3) * 120;
      const cy = y + (j + 0.5) * (h / rows) + u * u * 420;
      const rr = (Math.max(w / cols, h / rows) / 2) * (1.15 + 0.3 * r(430 + k));
      const rot = u * (r(440 + k) - 0.5) * 6;
      const pts: number[] = [];
      for (let q = 0; q < 7; q++) {
        const a = rot + (q / 7) * Math.PI * 2;
        const rad = rr * (0.75 + 0.35 * r(450 + k * 7 + q));
        pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.85);
      }
      g.poly(pts).fill({ color: u > 0 ? 0x1c140e : 0x0b0806, alpha: 1 - u * u });
    }
  if (fall > 0) return;
  // Standing: cracks across it, warm light leaking faintly through (the corridor behind).
  for (let k = 0; k < 4; k++) {
    let cx = x + w * (0.2 + 0.6 * r(500 + k));
    let cy = y + h * (0.1 + 0.2 * k);
    const pts = [cx, cy];
    for (let q = 0; q < 4; q++) {
      cx += (r(510 + k * 5 + q) - 0.5) * 30;
      cy += h * 0.08;
      pts.push(cx, cy);
    }
    g.poly(pts, false).stroke({ color: 0x050302, width: 3 });
    g.poly(pts, false).stroke({ color: 0x8a6a48, width: 1, alpha: 0.35 + 0.1 * Math.sin(clock * 1.3 + k) });
  }
  glow.add(x + w / 2, y + h / 2, Math.max(w, h) * 0.5, 0x8a6a48, 0.05, h * 0.4);
}
