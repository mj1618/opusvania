/**
 * Ember-moths that show the way (playtest 3: after the first lantern nothing led to the next, and a
 * naive player ended at a sleeping heart with a full wallet). A few small moths with an ember in
 * them leave a lit flame, or one of the sleeping heart's dark wicks, and fly toward the nearest
 * lantern that is still dark, along the way she would go: unhurried, stopping to circle so she can
 * catch up, fading after `range` px. The renderer re-issues them while she stays by the light.
 *
 * Where they go comes from the scene (the lanterns' positions) and, for the bends of the way, from
 * `GOAL.guide.routes`: polylines keyed by the id of the lantern they END at. A moth leaves its
 * source, joins the route that passes nearest to it at that nearest point, and follows it on. No
 * route for a lantern = a straight line to it.
 *
 * Render only, render time only; nothing here touches the sim.
 */
import type { CameraView } from '../contract';
import { type GlintBatch, K_FLARE, K_SPARK } from '../pickups/batch';
import { GOAL } from './config';
import { Moth } from './lantern';
import { Path, smooth } from './logic';

type Pt = readonly number[];
const X = (p: Pt | undefined): number => p?.[0] ?? 0;
const Y = (p: Pt | undefined): number => p?.[1] ?? 0;

interface Guide {
  on: boolean;
  view: Moth;
  path: Path;
  /** Px travelled along the path, and where it fades. */
  s: number;
  range: number;
  /** Seconds before it leaves, seconds alive, seconds of the circle it is in (0 = flying on). */
  wait: number;
  age: number;
  pause: number;
  paused: number;
  /** The next stop, px along the path. */
  stopAt: number;
  speed: number;
  seed: number;
  x: number;
  y: number;
  vx: number;
  alpha: number;
  /** Who sent it (the renderer's own key), so one light never has two threads out. */
  source: number;
}

const tmp = [0, 0, 0, 0];

/** Nearest point of the polyline `pts` to (x, y): [distance, segment index, share along it]. */
export function nearestOn(pts: readonly Pt[], x: number, y: number): [number, number, number] {
  let best: [number, number, number] = [Number.POSITIVE_INFINITY, 0, 0];
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = X(pts[i]);
    const ay = Y(pts[i]);
    const dx = X(pts[i + 1]) - ax;
    const dy = Y(pts[i + 1]) - ay;
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(ax + dx * k - x, ay + dy * k - y);
    if (d < best[0]) best = [d, i, k];
  }
  if (pts.length === 1) best = [Math.hypot(X(pts[0]) - x, Y(pts[0]) - y), 0, 0];
  return best;
}

/**
 * The way from (sx, sy) to the lantern `id` whose glass hangs at (tx, ty): out to the nearest
 * point of the nearest of its routes, on along that route, and into the glass.
 */
export function wayTo(
  routes: Readonly<Record<string, readonly (readonly Pt[])[]>>,
  id: string,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): Path {
  const path = new Path();
  path.add(sx, sy);
  let pick: readonly Pt[] | null = null;
  let at: [number, number, number] = [Number.POSITIVE_INFINITY, 0, 0];
  for (const r of routes[id] ?? []) {
    if (r.length === 0) continue;
    const n = nearestOn(r, sx, sy);
    if (n[0] < at[0]) {
      at = n;
      pick = r;
    }
  }
  // A route that passes no nearer than the lantern itself is no help: fly straight.
  if (pick && at[0] < Math.hypot(tx - sx, ty - sy)) {
    const a = pick[at[1]];
    const b = pick[Math.min(pick.length - 1, at[1] + 1)];
    const jx = X(a) + (X(b) - X(a)) * at[2];
    const jy = Y(a) + (Y(b) - Y(a)) * at[2];
    if (Math.hypot(jx - sx, jy - sy) > 30) path.add(jx, jy);
    for (let i = at[1] + 1; i < pick.length; i++) {
      const p = pick[i];
      const n = path.xs.length - 1;
      if (Math.hypot(X(p) - (path.xs[n] as number), Y(p) - (path.ys[n] as number)) > 8) path.add(X(p), Y(p));
    }
  }
  path.add(tx, ty);
  return path;
}

export class GuideMoths {
  readonly moths: Guide[] = [];
  private rnd = 0x2f6e2b1;

  constructor(n = 9) {
    for (let i = 0; i < n; i++) {
      const view = new Moth(((i * 0.618) % 1) + 0.05);
      view.root.tint = GOAL.guide.tint;
      this.moths.push({
        on: false,
        view,
        path: new Path(),
        s: 0,
        range: 0,
        wait: 0,
        age: 0,
        pause: 0,
        paused: 0,
        stopAt: 0,
        speed: 0,
        seed: 0,
        x: 0,
        y: 0,
        vx: 0,
        alpha: 0,
        source: -1,
      });
    }
  }

  private rand(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  /** How many of `source`'s moths are still out. */
  out(source: number): number {
    let n = 0;
    for (const m of this.moths) if (m.on && m.source === source) n++;
    return n;
  }

  /** Where they were going has been kindled (or the way has changed): those in the air turn and fade. */
  release(): void {
    for (const m of this.moths) {
      if (!m.on) continue;
      if (m.wait > 0) {
        m.on = false;
        m.view.root.visible = false;
      } else m.range = Math.min(m.range, m.s);
    }
  }

  /** Everything away (a restart). */
  clear(): void {
    for (const m of this.moths) {
      m.on = false;
      m.view.root.visible = false;
    }
  }

  /** `n` moths leave (sx, sy) along `path`, one after another; `far` stretches how far they go. */
  issue(source: number, path: Path, n: number, delay = 0, far = 1): void {
    const G = GOAL.guide;
    let k = 0;
    for (const m of this.moths) {
      if (k >= n) break;
      if (m.on) continue;
      m.on = true;
      m.source = source;
      m.path = path;
      m.seed = this.rand();
      m.s = 0;
      const r0 = G.range[0] as number;
      const r1 = G.range[1] as number;
      m.range = Math.min(path.length, (r0 + (r1 - r0) * (1 - k / Math.max(1, n))) * far);
      m.wait = delay + k * G.stagger * (0.85 + 0.3 * m.seed);
      m.age = 0;
      m.pause = 0;
      m.paused = 0;
      m.stopAt = G.stopEvery * (0.55 + 0.35 * m.seed) + k * 26;
      m.speed = G.speed * (0.92 + 0.16 * m.seed);
      m.x = path.xs[0] ?? 0;
      m.y = path.ys[0] ?? 0;
      m.vx = 0;
      m.alpha = 0;
      k++;
    }
  }

  /** (hx, hy) = her body centre: a moth that has got far ahead of her circles until she comes. */
  update(dt: number, clock: number, cam: CameraView, hx: number, hy: number, f: GlintBatch): void {
    const G = GOAL.guide;
    for (const m of this.moths) {
      if (!m.on) continue;
      if (m.wait > 0) {
        m.wait -= dt;
        m.view.root.visible = false;
        continue;
      }
      m.age += dt;
      const ahead = Math.hypot(m.x - hx, m.y - hy);
      if (m.pause > 0) {
        // Circling: it waits for her (for a while), then goes on.
        m.paused += dt;
        if (ahead < G.waitPx || m.paused > G.stopWait) m.pause -= dt;
      } else {
        m.s += m.speed * dt;
        if (m.s >= m.stopAt && m.s < m.range - 60) {
          m.pause = G.stopSeconds * (0.8 + 0.4 * m.seed);
          m.paused = 0;
          m.stopAt += G.stopEvery * (0.8 + 0.4 * this.rand());
        }
      }
      const done = m.s >= m.range;
      // At the end of its way it turns once and is gone.
      const end = done ? Math.max(0, 1 - (m.s - m.range) / (G.speed * 0.9)) : 1;
      if (done) m.s += m.speed * dt * 0.35;
      m.path.sample(Math.min(1, m.s / Math.max(1, m.path.length)), tmp);
      const px = tmp[0] as number;
      const py = tmp[1] as number;
      const tx = tmp[2] as number;
      const ty = tmp[3] as number;
      // A moth's flight: it weaves about its line, and circles where it stops.
      const w = G.wander;
      const ph = m.seed * 40;
      let ox = (Math.sin(m.age * 2.3 + ph) * 0.6 + Math.sin(m.age * 5.1 + ph * 1.7) * 0.4) * w;
      let oy = (Math.cos(m.age * 1.9 + ph * 0.6) * 0.6 + Math.sin(m.age * 4.3 + ph) * 0.4) * w * 0.8;
      const circ = m.pause > 0 || done ? 1 : 0;
      if (circ) {
        const a = m.age * G.stopTurn * (m.seed > 0.5 ? 1 : -1) + ph;
        ox = Math.cos(a) * G.stopR;
        oy = Math.sin(a) * G.stopR * 0.6 - 8;
      }
      const gx = px + ox;
      const gy = py + oy;
      const ease = Math.min(1, dt * (circ ? 3.2 : 5));
      const lx = m.x;
      m.x += (gx - m.x) * ease;
      m.y += (gy - m.y) * ease;
      m.vx += ((m.x - lx) / Math.max(dt, 1e-4) - m.vx) * Math.min(1, dt * 6);
      const a = Math.min(1, m.age / G.fadeIn) * end * smooth(0, 90, m.range + 90 - m.s);
      m.alpha = a;
      if (end <= 0.004 || (done && a <= 0.004)) {
        m.on = false;
        m.view.root.visible = false;
        continue;
      }
      const seen = Math.abs(m.x - cam.x) < 960 / cam.zoom + 60 && Math.abs(m.y - cam.y) < 540 / cam.zoom + 60;
      m.view.root.visible = seen;
      if (!seen) continue;
      m.view.fly(clock, m.x, m.y, Math.max(-0.5, Math.min(0.5, m.vx * 0.004)), a, G.size);
      // The ember it carries, a breath of light round it, and two sparks strung out behind.
      const tw = 0.82 + 0.18 * Math.sin(clock * 6.3 + ph);
      f.quad(K_SPARK, m.x, m.y + 1, G.ember, G.ember, G.emberGain * a * tw, 0, 0.55);
      f.quad(K_FLARE, m.x, m.y + 1, G.halo, G.halo, G.haloGain * a, 0, 0);
      if (!circ)
        for (let j = 1; j <= 2; j++)
          f.quad(
            K_SPARK,
            m.x - tx * j * 9 + Math.sin(m.age * 7 + j) * 1.5,
            m.y - ty * j * 9 + 2 * j,
            1.9 - 0.4 * j,
            1.9 - 0.4 * j,
            0.4 * a * (1 - j * 0.3),
            0,
            0.2,
          );
    }
  }

  /** A moth is in the air (anywhere): for tools. */
  get count(): number {
    let n = 0;
    for (const m of this.moths) if (m.on) n++;
    return n;
  }
}
