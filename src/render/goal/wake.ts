/**
 * The heart wakes: the scene's one big moment, said with small lights (memory/goal-render.md,
 * round 7). The parts that have their own geometry live here; the goal renderer times them
 * (`GOAL.wake`) and draws everything else.
 *
 *  - `Veins`: light running out from the heart through the roots in the ground to each lit lantern,
 *    as thin ribbons a little under the surface (the grass fringe covers the ground line itself).
 *    A vein has a head (a bead with a short bright stretch behind it) and a body that glows on
 *    after it; how far the head has come and how bright the body stays is the renderer's to say,
 *    so the same veins serve the wake (they fade) and the second tier of the offering (they stay).
 *  - `Carving`: the moth cut in the shrine's wing-stone (scene/lib/pf-forms.ts paints it; the
 *    strokes here are the same construction), filled with light stroke by stroke.
 *  - `GroveFlies`: fireflies at fixed places round the shrine that flash as the ring passes and of
 *    which a few stay for good.
 *
 * Render only; all light is quads in the goal renderer's batches.
 */
import type { Scene } from '../../sim/scene';
import type { CameraView } from '../contract';
import { VIEW_H, VIEW_W } from '../contract';
import { type GlintBatch, K_FLARE, K_SPARK } from '../pickups/batch';
import { GOAL } from './config';
import { Path, smooth } from './logic';
import type { SurfaceLight } from './surface';

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Vein {
  id: string;
  /** Strands: each a wandering polyline along the same way, with its running length. */
  strands: Path[];
  /** Px of someone else's vein the light runs along before this one begins (a branch). */
  lead: number;
  /** Its own length, px. */
  length: number;
  /** The longest run (lead + length) among the veins that share its first stretch: they keep one pace. */
  span: number;
  /** Where it ends (the lantern's foot). */
  ex: number;
  ey: number;
  /** Rootlets off the main strand: [px along the vein, x0, y0, x1, y1] each. */
  twigs: number[];
}

const tmp = [0, 0, 0, 0];

export class Veins {
  readonly list: Vein[] = [];

  constructor(
    routes: Readonly<Record<string, { via?: string; pts: readonly (readonly number[])[] }>>,
    solids: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
  ) {
    const V = GOAL.wake.veins;
    const inGround = (x: number, y: number): boolean => {
      for (const r of solids)
        if (x > r.x + 5 && x < r.x + r.w - 5 && y > r.y + 9 && y < r.y + r.h) return true;
      return false;
    };
    const base = new Map<string, Path>();
    for (const [id, r] of Object.entries(routes)) {
      // The way, its corners rounded (a root turns, it does not kink).
      const p = new Path();
      const n = r.pts.length;
      for (let i = 0; i < n; i++) {
        const q = r.pts[i] as readonly number[];
        const a = r.pts[i - 1];
        const c = r.pts[i + 1];
        const x = q[0] ?? 0;
        const y = q[1] ?? 0;
        if (!a || !c) {
          p.add(x, y);
          continue;
        }
        const la = Math.hypot((a[0] ?? 0) - x, (a[1] ?? 0) - y) || 1;
        const lc = Math.hypot((c[0] ?? 0) - x, (c[1] ?? 0) - y) || 1;
        const ra = Math.min(V.corner, la * 0.45) / la;
        const rc = Math.min(V.corner, lc * 0.45) / lc;
        const ax = x + ((a[0] ?? 0) - x) * ra;
        const ay = y + ((a[1] ?? 0) - y) * ra;
        const cx = x + ((c[0] ?? 0) - x) * rc;
        const cy = y + ((c[1] ?? 0) - y) * rc;
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const u = 1 - t;
          p.add(u * u * ax + 2 * u * t * x + t * t * cx, u * u * ay + 2 * u * t * y + t * t * cy);
        }
      }
      base.set(id, p);
    }
    let n = 0;
    for (const [id, r] of Object.entries(routes)) {
      const way = base.get(id);
      if (!way || way.xs.length < 2) continue;
      // A branch starts where it leaves the vein it runs along first.
      let lead = 0;
      const via = r.via ? base.get(r.via) : undefined;
      if (via) {
        let bd = Number.POSITIVE_INFINITY;
        for (let i = 0; i < via.xs.length; i++) {
          const d = Math.hypot(
            (via.xs[i] as number) - (way.xs[0] as number),
            (via.ys[i] as number) - (way.ys[0] as number),
          );
          if (d < bd) {
            bd = d;
            lead = via.at[i] as number;
          }
        }
      }
      const strands: Path[] = [];
      for (let k = 0; k < V.strands; k++) {
        // A root, not a wire: it wanders about the way, and the second strand crosses the first.
        const s = new Path();
        const steps = Math.max(2, Math.ceil(way.length / V.step));
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          way.sample(u, tmp);
          const d = u * way.length;
          const ends = smooth(0, 40, d) * smooth(0, 40, way.length - d);
          const w =
            (Math.sin(d * 0.031 + n * 2.3 + k * 2.6) * 0.6 + Math.sin(d * 0.083 + n + k * 4.1) * 0.4) *
            V.wander *
            (k === 0 ? 1 : 1.5) *
            ends;
          s.add((tmp[0] as number) - (tmp[3] as number) * w, (tmp[1] as number) + (tmp[2] as number) * w);
        }
        strands.push(s);
      }
      // Rootlets: short hairs off the main strand, into the ground (never out of it).
      const twigs: number[] = [];
      const main = strands[0] as Path;
      for (let d = V.twigEvery * (0.4 + 0.6 * hash(n * 7 + 3)); d < way.length - 30; ) {
        const h1 = hash(d * 0.37 + n * 11);
        main.sample(d / way.length, tmp);
        const x0 = tmp[0] as number;
        const y0 = tmp[1] as number;
        const tx = tmp[2] as number;
        const ty = tmp[3] as number;
        const t0 = V.twig[0] ?? 10;
        const len = t0 + ((V.twig[1] ?? 20) - t0) * hash(d * 0.91 + n * 5);
        for (const side of h1 > 0.5 ? [1, -1] : [-1, 1]) {
          // Forward and to one side.
          const dx = tx * 0.55 - ty * side * 0.83;
          const dy = ty * 0.55 + tx * side * 0.83;
          if (!inGround(x0 + dx * len, y0 + dy * len) || !inGround(x0 + dx * len * 0.5, y0 + dy * len * 0.5))
            continue;
          twigs.push(d, x0, y0, x0 + dx * len, y0 + dy * len);
          break;
        }
        d += V.twigEvery * (0.55 + 0.9 * h1);
      }
      this.list.push({
        id,
        twigs,
        strands,
        lead,
        length: way.length,
        span: lead + way.length,
        ex: way.xs[way.xs.length - 1] as number,
        ey: way.ys[way.ys.length - 1] as number,
      });
      n++;
    }
    // Veins that share a first stretch run at one pace, so a branch never shows ahead of its trunk.
    const root = (id: string): string => routes[id]?.via ?? id;
    for (const v of this.list)
      for (const o of this.list) if (root(o.id) === root(v.id)) v.span = Math.max(v.span, o.lead + o.length);
  }

  /**
   * How far from the heart vein `v`'s head has come `t` s after it set out (px along lead + length;
   * it runs on past the end, so `head - (lead + length)` says how long ago it arrived).
   */
  head(v: Vein, t: number): number {
    if (t <= 0) return 0;
    const V = GOAL.wake.veins;
    const far = Math.min(1, v.span / 3500);
    const T = (V.seconds[0] as number) + ((V.seconds[1] as number) - (V.seconds[0] as number)) * far;
    // Slow out of the heart, gathering speed as it goes.
    return v.span * (t / T) ** (1 + 0.9 * far);
  }

  /**
   * Draws vein `v` with its head `head` px from the heart (along lead + own length) and its body
   * at `body` (0..1; what stays lit behind the head), `flash` = how bright the head is.
   */
  draw(
    v: Vein,
    b: GlintBatch,
    sf: SurfaceLight,
    cam: CameraView,
    clock: number,
    head: number,
    body: number,
    flash: number,
  ): void {
    const V = GOAL.wake.veins;
    const at = head - v.lead;
    if (at <= 0 || (body <= 0.004 && flash <= 0.004)) return;
    const hw = VIEW_W / 2 / cam.zoom + 60;
    const hh = VIEW_H / 2 / cam.zoom + 60;
    for (let k = 0; k < v.strands.length; k++) {
      const s = v.strands[k] as Path;
      const half = (k === 0 ? V.width : V.width * 0.62) / 2;
      const gain = k === 0 ? 1 : 0.6;
      const n = s.xs.length;
      let px = 0;
      let py = 0;
      let pe = 0;
      let have = false;
      for (let i = 0; i < n; i++) {
        const d = ((s.at[i] as number) / Math.max(1, s.length)) * v.length;
        if (d > at) break;
        const x = s.xs[i] as number;
        const y = s.ys[i] as number;
        // Behind the head a short bright stretch; further back the steady glow, with a slow pulse
        // that keeps travelling outward so a lit vein is never a still line.
        const back = at - d;
        const hot = flash * Math.exp(-back / V.headPx);
        const pulse = 0.82 + 0.18 * Math.sin(d * 0.016 - clock * 2.4 + k);
        const e = (body * pulse + hot) * gain * V.gain * smooth(0, 30, d + v.lead);
        const seen = Math.abs(x - cam.x) < hw && Math.abs(y - cam.y) < hh;
        if (have && seen && (e > 0.004 || pe > 0.004)) {
          const dx = x - px;
          const dy = y - py;
          const l = Math.hypot(dx, dy) || 1;
          const nx = (-dy / l) * half;
          const ny = (dx / l) * half;
          // (u = how far from gold toward deep amber: the head is gold, the body amber.)
          const u = 0.92 - 0.55 * Math.min(1, hot);
          b.segment(px, py, nx, ny, x, y, nx, ny, u, u, pe, e);
        }
        px = x;
        py = y;
        pe = e;
        have = true;
      }
    }
    // Its rootlets, lit a moment after the head has passed their root.
    for (let i = 0; i < v.twigs.length; i += 5) {
      const d = v.twigs[i] as number;
      if (d > at) break;
      const x0 = v.twigs[i + 1] as number;
      const y0 = v.twigs[i + 2] as number;
      if (Math.abs(x0 - cam.x) > hw || Math.abs(y0 - cam.y) > hh) continue;
      const back = at - d;
      const grow = smooth(0, 90, back);
      const e = (body * 0.75 + flash * Math.exp(-back / V.headPx)) * V.gain * smooth(0, 30, d + v.lead);
      if (e <= 0.004) continue;
      const x1 = x0 + ((v.twigs[i + 3] as number) - x0) * grow;
      const y1 = y0 + ((v.twigs[i + 4] as number) - y0) * grow;
      const l = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = (-(y1 - y0) / l) * V.width * 0.3;
      const ny = ((x1 - x0) / l) * V.width * 0.3;
      b.segment(x0, y0, nx, ny, x1, y1, nx * 0.25, ny * 0.25, 0.92, 0.95, e, e * 0.35);
    }
    // The head: a bead running through the ground, and the ground warming as it passes.
    if (flash > 0.01 && at < v.length) {
      const s = v.strands[0] as Path;
      s.sample(at / v.length, tmp);
      const x = tmp[0] as number;
      const y = tmp[1] as number;
      if (Math.abs(x - cam.x) < hw && Math.abs(y - cam.y) < hh) {
        b.quad(K_SPARK, x, y, V.bead, V.bead, 1.1 * flash, 0, 0.8);
        b.quad(K_FLARE, x, y, V.bead * 3.4, V.bead * 3.4, 0.22 * flash, 0, 0);
        sf.light(cam, x, y - 14, 80, 54, V.ground * flash, 0.15);
      }
    }
  }
}

/** The moth of the shrine's wing-stone, as strokes to fill with light (the same lines pf-forms.ts carves). */
export class Carving {
  private readonly strokes: Path[] = [];
  /** Its centre, world px. */
  readonly x: number;
  readonly y: number;

  constructor(hx: number, hy: number) {
    const C = GOAL.wake.carving;
    const cx = hx + C.dx;
    const cy = hy + C.dy;
    this.x = cx;
    this.y = cy;
    const sz = C.size;
    const rot = C.lean;
    const pt = (x: number, y: number): [number, number] => [
      cx + x * Math.cos(rot) - y * Math.sin(rot),
      cy + x * Math.sin(rot) + y * Math.cos(rot),
    ];
    const stroke = (pts: Array<[number, number]>): void => {
      // Corner-cut twice, as the carving was.
      let q = pts;
      for (let r = 0; r < 2 && q.length > 2; r++) {
        const out: Array<[number, number]> = [q[0] as [number, number]];
        for (let i = 0; i + 1 < q.length; i++) {
          const a = q[i] as [number, number];
          const c = q[i + 1] as [number, number];
          out.push([a[0] * 0.75 + c[0] * 0.25, a[1] * 0.75 + c[1] * 0.25]);
          out.push([a[0] * 0.25 + c[0] * 0.75, a[1] * 0.25 + c[1] * 0.75]);
        }
        out.push(q[q.length - 1] as [number, number]);
        q = out;
      }
      const p = new Path();
      for (const [x, y] of q) p.add(x, y);
      this.strokes.push(p);
    };
    // The body first (bottom to top: the light comes up out of the bud), then the wings outward
    // from it, then the feelers.
    stroke([pt(0, sz * 0.65), pt(0, -sz * 0.7)]);
    for (const sgn of [-1, 1]) {
      stroke([
        pt(0, -sz * 0.2),
        pt(sgn * sz * 0.5, -sz * 0.75),
        pt(sgn * sz * 0.9, -sz * 0.95),
        pt(sgn * sz, 0),
        pt(sgn * sz * 0.2, sz * 0.05),
      ]);
    }
    for (const sgn of [-1, 1])
      stroke([pt(sgn * sz * 0.15, sz * 0.1), pt(sgn * sz, 0), pt(sgn * sz * 0.6, sz * 0.8), pt(0, sz * 0.3)]);
    for (const sgn of [-1, 1])
      stroke([pt(0, -sz * 0.62), pt(sgn * sz * 0.22, -sz * 1.0), pt(sgn * sz * 0.42, -sz * 1.12)]);
  }

  /** `fill` 0..1 = how much of it is drawn (stroke after stroke), `glow` = its steady light, `flash` = the head's. */
  draw(b: GlintBatch, fill: number, glow: number, flash: number): void {
    if (fill <= 0.001 || glow + flash <= 0.004) return;
    const C = GOAL.wake.carving;
    const n = this.strokes.length;
    // Body, then the two wing pairs together, then the feelers: four beats.
    const beat = [0, 1, 1, 2, 2, 3, 3];
    for (let i = 0; i < n; i++) {
      const s = this.strokes[i] as Path;
      const k = Math.min(1, Math.max(0, fill * 4 - (beat[i] ?? 3)));
      if (k <= 0) continue;
      const upto = k * s.length;
      const half = (i === 0 ? C.width * 1.15 : i >= 5 ? C.width * 0.6 : C.width) / 2;
      for (let j = 0; j + 1 < s.xs.length; j++) {
        const d0 = s.at[j] as number;
        if (d0 >= upto) break;
        const d1 = Math.min(upto, s.at[j + 1] as number);
        const seg = (s.at[j + 1] as number) - d0 || 1;
        const x0 = s.xs[j] as number;
        const y0 = s.ys[j] as number;
        const f = (d1 - d0) / seg;
        const x1 = x0 + ((s.xs[j + 1] as number) - x0) * f;
        const y1 = y0 + ((s.ys[j + 1] as number) - y0) * f;
        const l = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = (-(y1 - y0) / l) * half;
        const ny = ((x1 - x0) / l) * half;
        // Thin at both ends, like the cut.
        const t0 = Math.sin(Math.PI * Math.min(0.94, Math.max(0.06, d0 / s.length)));
        const t1 = Math.sin(Math.PI * Math.min(0.94, Math.max(0.06, d1 / s.length)));
        const h0 = k < 1 ? flash * Math.exp(-(upto - d0) / 9) : 0;
        const h1 = k < 1 ? flash * Math.exp(-(upto - d1) / 9) : 0;
        b.segment(
          x0,
          y0,
          nx * t0,
          ny * t0,
          x1,
          y1,
          nx * t1,
          ny * t1,
          0.8 - 0.5 * h0,
          0.8 - 0.5 * h1,
          (glow + h0) * C.gain,
          (glow + h1) * C.gain,
        );
      }
      if (k < 1 && flash > 0.01) {
        s.sample(k, tmp);
        b.quad(K_SPARK, tmp[0] as number, tmp[1] as number, 3.2, 3.2, 0.9 * flash, 0, 0.8);
      }
    }
  }
}

interface Fly {
  x: number;
  y: number;
  seed: number;
  stays: boolean;
}

/** Fireflies at fixed places round the heart: each flashes once as the ring passes; some stay. */
export class GroveFlies {
  private readonly flies: Fly[] = [];

  constructor(scene: Scene, hx: number, hy: number) {
    const F = GOAL.wake.flies;
    for (let i = 0; i < F.n * 3 && this.flies.length < F.n; i++) {
      const x = hx + (hash(i * 3.1 + 1) * 2 - 1) * F.spread;
      const y = hy - F.low - hash(i * 7.7 + 2) ** 1.4 * (F.high - F.low);
      if (x < 40 || x > scene.width - 40 || y < 30) continue;
      // Not inside a solid, and not right where the heart's own light is.
      let inside = Math.hypot(x - hx, y - (hy - 60)) < 90;
      for (const r of scene.solids)
        if (x > r.x - 6 && x < r.x + r.w + 6 && y > r.y - 6 && y < r.y + r.h) inside = true;
      if (inside) continue;
      this.flies.push({ x, y, seed: hash(i * 1.7 + 5), stays: this.flies.length % F.stay === 0 });
    }
  }

  /**
   * `ring(x, y)` says what the travelling ring is doing at a place: [how much it swells there now
   * (0..1), how much of it has passed (0..1)].
   */
  draw(
    b: GlintBatch,
    cam: CameraView,
    clock: number,
    ring: (x: number, y: number, out: number[]) => void,
  ): void {
    const F = GOAL.wake.flies;
    const hw = VIEW_W / 2 / cam.zoom + 30;
    const hh = VIEW_H / 2 / cam.zoom + 30;
    for (const f of this.flies) {
      if (Math.abs(f.x - cam.x) > hw || Math.abs(f.y - cam.y) > hh) continue;
      ring(f.x, f.y, tmp);
      const swell = tmp[0] as number;
      const passed = tmp[1] as number;
      if (passed <= 0.001 && swell <= 0.001) continue;
      const t = clock * (0.2 + 0.12 * f.seed) + f.seed * 40;
      const x = f.x + Math.sin(t * 1.3 + f.seed * 9) * 26 + Math.sin(t * 3.1) * 7;
      const y = f.y + Math.sin(t * 1.9 + f.seed * 5) * 18 + Math.cos(t * 2.7) * 5;
      const blink = 0.45 + 0.55 * Math.max(0, Math.sin(t * 5.3 + f.seed * 20)) ** 0.6;
      const e = F.flash * swell + (f.stays ? F.rest * passed * blink : 0);
      if (e <= 0.004) continue;
      const size = F.bead * (0.75 + 0.5 * swell);
      b.quad(K_SPARK, x, y, size, size, e, 0, 0.5 + 0.3 * swell);
      b.quad(K_FLARE, x, y, F.halo, F.halo, 0.2 * e, 0, 0);
    }
  }
}
