/**
 * Ember-moths that LEAD (playtest 4: at 150 px/s and 12 px they decorated; a running player had
 * passed them before they left the lamp, and from the summit they flew a sky line off the screen).
 *
 * One tight flight of a few moths, each an ember with a short comet tail, flies the way she would
 * walk to the next dark lantern (or, once all burn, to the heart). It keeps pace with her: its
 * leader holds `lead` px ahead of the point of the way nearest to her (more the faster she comes),
 * waits there circling when she stops, is never behind her, never off screen, and when she heads
 * the wrong way for `wrong` s it comes back, turns a loop round her and leads off again. Where the
 * way ends the flight settles on the dark lantern's hook and waits there, glowing.
 *
 * `pour` is the other thing they do: when the last lantern catches, a stream of them runs from its
 * glass down to the heart.
 *
 * Where the way goes comes from `GOAL.guide.routes`: polylines keyed by the id of the lantern they
 * END at (`heart` for the heart). A flight joins the route that passes nearest to her at that
 * nearest point (`wayTo`). No route = a straight line.
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

const HIST = 9;

interface Flyer {
  view: Moth;
  on: boolean;
  seed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  /** Where it has just been (a ring of points, newest at `hi`): the comet's tail. */
  hx: Float32Array;
  hy: Float32Array;
  hi: number;
  hn: number;
  /** A pouring moth: its own way, px along it, px/s, seconds before it leaves. */
  path: Path | null;
  s: number;
  speed: number;
  wait: number;
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
    // Join it AHEAD of her: as far along from its nearest point as she is from it, so the first leg
    // always makes way (playtest 5: joined at the nearest point, a flight for a runner whose lantern
    // had caught behind her waited 290 px above and 90 px behind her).
    let seg = at[1];
    let k = at[2];
    let ahead = Math.min(GOAL.guide.joinMax, Math.max(GOAL.guide.joinMin, at[0]));
    while (seg + 1 < pick.length) {
      const l = Math.hypot(X(pick[seg + 1]) - X(pick[seg]), Y(pick[seg + 1]) - Y(pick[seg])) || 1;
      const room = l * (1 - k);
      if (ahead <= room) {
        k += ahead / l;
        break;
      }
      ahead -= room;
      if (seg + 2 >= pick.length) {
        k = 1;
        break;
      }
      seg++;
      k = 0;
    }
    const a = pick[seg];
    const b = pick[Math.min(pick.length - 1, seg + 1)];
    const jx = X(a) + (X(b) - X(a)) * k;
    const jy = Y(a) + (Y(b) - Y(a)) * k;
    if (Math.hypot(jx - sx, jy - sy) > 30) path.add(jx, jy);
    for (let i = seg + 1; i < pick.length; i++) {
      const p = pick[i];
      const n = path.xs.length - 1;
      if (Math.hypot(X(p) - (path.xs[n] as number), Y(p) - (path.ys[n] as number)) > 8) path.add(X(p), Y(p));
    }
  }
  const n = path.xs.length - 1;
  if (Math.hypot(tx - (path.xs[n] as number), ty - (path.ys[n] as number)) > 4) path.add(tx, ty);
  return path;
}

/** Px along `path` of its point nearest to (x, y), and how far away that is: written to `out` [s, d]. */
export function progressOn(path: Path, x: number, y: number, out: number[]): void {
  let bs = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < path.xs.length; i++) {
    const ax = path.xs[i] as number;
    const ay = path.ys[i] as number;
    const dx = (path.xs[i + 1] as number) - ax;
    const dy = (path.ys[i + 1] as number) - ay;
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(ax + dx * k - x, ay + dy * k - y);
    // A later stretch wins a near tie: the way doubles back at the shaft and the cliff.
    if (d < bd - 1) {
      bd = d;
      bs = (path.at[i] as number) + Math.sqrt(len2) * k;
    }
  }
  out[0] = bs;
  out[1] = bd;
}

/**
 * How far ahead of her the leader wants to be (pure, tested): `lead[0]` px when she stands,
 * `lead[1]` when she runs at `full` px/s along the way, never past the end.
 */
export function leadAt(
  sp: number,
  along: number,
  length: number,
  lead: readonly number[],
  full: number,
): number {
  const k = Math.min(1, Math.max(0, along / full));
  return Math.min(length, sp + X(lead) + (Y(lead) - X(lead)) * k);
}

function flyer(seed: number): Flyer {
  const view = new Moth(seed);
  view.root.tint = GOAL.guide.tint;
  return {
    view,
    on: false,
    seed,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    alpha: 0,
    hx: new Float32Array(HIST),
    hy: new Float32Array(HIST),
    hi: 0,
    hn: 0,
    path: null,
    s: 0,
    speed: 0,
    wait: 0,
  };
}

export class GuideMoths {
  /** The flight (the first `FLIGHT`) and the pouring stream (the rest). */
  readonly moths: Flyer[] = [];
  static readonly FLIGHT = 5;
  /** A flight is out. `key` = where it leads (a lantern's id, `heart`). */
  active = false;
  key = '';
  /** It has reached the end of its way and sits on the hook. 0..1. */
  settled = 0;
  /** She has strayed so far from the way that it is no use: the renderer hands over a new one (`reroute`). */
  stale = false;
  /** Where it settles (the renderer keeps this on the lantern's hook, which bows and turns). */
  perchX = 0;
  perchY = 0;
  /** Leader: px along the way, and where that is. For tools: `s`, `sp` (her progress), `mode`. */
  s = 0;
  sp = 0;
  mode: 'come' | 'lead' | 'wait' | 'fetch' | 'settle' | 'leave' = 'lead';
  /** Coming to her from where it set out: that place, px flown, and 0..1 how much of the flight is still on that line. */
  private fromX = 0;
  private fromY = 0;
  private comeS = 0;
  private comeK = 0;
  /** 0..1: the way between her and the leader runs up or down (the moths stream along it). */
  vert = 0;
  lx = 0;
  ly = 0;
  private path = new Path();
  private n = 0;
  private alpha = 0;
  private age = 0;
  private along = 0;
  private lastSp = 0;
  private away = 0;
  private fetchT = 0;
  private fetchK = 0;
  private still = 0;
  private histIn = 0;
  private rnd = 0x2f6e2b1;

  constructor(pour = 10) {
    for (let i = 0; i < GuideMoths.FLIGHT + pour; i++) this.moths.push(flyer(((i * 0.618) % 1) + 0.05));
  }

  private rand(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  /** Everything away at once (a restart). */
  clear(): void {
    for (const m of this.moths) {
      m.on = false;
      m.path = null;
      m.view.root.visible = false;
    }
    this.active = false;
    this.alpha = 0;
    this.settled = 0;
    this.stale = false;
    this.key = '';
  }

  /** The flight turns away and fades (its lantern was kindled, or nobody followed). */
  release(): void {
    if (this.active && this.mode !== 'leave') this.mode = 'leave';
  }

  /**
   * `n` moths leave (fx, fy) and lead along `path` (which starts where she is) toward `key`.
   * Nothing if a flight for the same place is already out.
   */
  lead(key: string, path: Path, n: number, fx: number, fy: number): void {
    if (this.active && this.key === key && this.mode !== 'leave') return;
    this.active = true;
    this.key = key;
    this.path = path;
    this.n = Math.min(GuideMoths.FLIGHT, Math.max(1, n));
    // Set out far from her (the lantern caught behind a runner): to her first, past her, then lead.
    const far = Math.hypot(fx - (path.xs[0] ?? fx), fy - (path.ys[0] ?? fy)) > GOAL.guide.comePx;
    this.mode = far ? 'come' : 'lead';
    this.fromX = fx;
    this.fromY = fy;
    this.comeS = 0;
    this.comeK = far ? 1 : 0;
    this.vert = 0;
    this.s = 0;
    this.sp = 0;
    this.lastSp = -1;
    this.along = 0;
    this.away = 0;
    this.fetchK = 0;
    this.settled = 0;
    this.stale = false;
    this.alpha = 0;
    this.age = 0;
    this.lx = fx;
    this.ly = fy;
    for (let i = 0; i < GuideMoths.FLIGHT; i++) {
      const m = this.moths[i] as Flyer;
      m.on = i < this.n;
      m.path = null;
      m.x = fx + (this.rand() - 0.5) * 10;
      m.y = fy + (this.rand() - 0.5) * 10;
      m.vx = 0;
      m.vy = -30;
      m.hn = 0;
      m.s = 0;
      m.wait = i * GOAL.guide.stagger;
      if (!m.on) m.view.root.visible = false;
    }
  }

  /** A new way for the flight that is out (she strayed): it keeps flying, from where it is. */
  reroute(path: Path): void {
    this.path = path;
    this.s = 0;
    this.lastSp = -1;
    this.away = 0;
    this.stale = false;
    if (this.mode !== 'leave' && this.mode !== 'come') this.mode = 'lead';
  }

  /** `n` moths pour along `path` one after another (the last lantern's light going down to the heart). */
  pour(path: Path, n: number): void {
    const G = GOAL.guide.pour;
    let k = 0;
    for (let i = GuideMoths.FLIGHT; i < this.moths.length && k < n; i++) {
      const m = this.moths[i] as Flyer;
      if (m.on) continue;
      m.on = true;
      m.path = path;
      m.s = 0;
      m.seed = this.rand();
      m.speed = G.speed * (0.88 + 0.24 * m.seed);
      m.wait = G.first + k * G.stagger * (0.8 + 0.4 * this.rand());
      m.x = path.xs[0] ?? 0;
      m.y = path.ys[0] ?? 0;
      m.vx = 0;
      m.vy = 0;
      m.hn = 0;
      m.alpha = 0;
      k++;
    }
  }

  /** (hx, hy) = her body centre. `f` = the batch in front of her. */
  update(dt: number, clock: number, cam: CameraView, hx: number, hy: number, f: GlintBatch): void {
    const G = GOAL.guide;
    this.histIn -= dt;
    const push = this.histIn <= 0;
    if (push) this.histIn = G.tailStep;
    const hw = 960 / cam.zoom;
    const hh = 540 / cam.zoom;

    // --- The flight.
    if (this.active) {
      this.age += dt;
      const path = this.path;
      const len = Math.max(1, path.length);
      progressOn(path, hx, hy, tmp);
      const sp = tmp[0] as number;
      const off = tmp[1] as number;
      if (this.lastSp < 0) this.lastSp = sp;
      const rate = dt > 0 ? (sp - this.lastSp) / dt : 0;
      this.lastSp = sp;
      // (A jump from one stretch of the way to another is not speed.)
      if (Math.abs(rate) < 1400) this.along += (rate - this.along) * Math.min(1, dt * 5);
      this.sp = sp;
      const leaving = this.mode === 'leave';
      this.alpha = Math.min(1, Math.max(0, this.alpha + (leaving ? -dt / G.fadeOut : dt / G.fadeIn)));
      if (leaving && this.alpha <= 0) {
        this.active = false;
        for (let i = 0; i < GuideMoths.FLIGHT; i++) {
          const m = this.moths[i] as Flyer;
          m.on = false;
          m.view.root.visible = false;
        }
      }
      // Where the leader wants to be: ahead of her by more the faster she comes, inside the picture.
      let want = leadAt(sp, this.along, len, G.lead, G.full);
      const insetX = hw - G.inset;
      const insetTop = hh - G.insetTop;
      const insetBot = hh - G.inset;
      for (let k = 0; k < 14 && want > sp + G.leadMin; k++) {
        path.sample(want / len, tmp);
        const dx = (tmp[0] as number) - cam.x;
        const dy = (tmp[1] as number) - cam.y;
        if (Math.abs(dx) < insetX && dy > -insetTop && dy < insetBot) break;
        want -= 30;
      }
      // The wrong way for a while (back along the way, or far off it): come and fetch her.
      const wrong = this.along < -G.wrongSpeed || off > G.offPx;
      this.away = Math.max(0, this.away + (wrong ? dt : -dt * 0.7));
      if (!leaving) {
        if (this.mode !== 'fetch' && this.away > G.wrong) {
          this.mode = 'fetch';
          this.fetchT = 0;
        }
        if (this.mode === 'fetch') {
          this.fetchT += dt;
          if (this.fetchT > G.fetch) {
            this.mode = 'lead';
            this.away = 0;
            // No use leading along a way she has left: ask for one from where she is.
            if (off > G.offPx) this.stale = true;
          }
        }
      }
      // Coming: a straight run from where it set out to her shoulder; there, it goes on ahead.
      let coming = this.mode === 'come';
      const cdx = hx - this.fromX;
      const cdy = hy - 46 - this.fromY;
      const cd = Math.hypot(cdx, cdy) || 1;
      if (coming) {
        this.comeS += G.come * dt;
        if (this.comeS >= cd - 30) {
          this.mode = 'lead';
          coming = false;
        }
      }
      this.comeK += ((coming ? 1 : 0) - this.comeK) * Math.min(1, dt * (coming ? 30 : 5));
      const fetching = this.mode === 'fetch';
      this.fetchK += ((fetching ? 1 : 0) - this.fetchK) * Math.min(1, dt * (fetching ? 3.2 : 2.2));
      // The leader runs to its place: fast enough to pass her at a run, never behind her.
      const gap = want - this.s;
      const v = Math.max(-G.fast, Math.min(G.fast, gap * G.chase));
      this.s = Math.max(sp + Math.min(G.leadMin, len - sp), Math.min(len, this.s + v * dt));
      if (leaving) this.s = Math.min(len, this.s + 60 * dt);
      const there = this.s >= len - 6;
      this.still = Math.abs(gap) < 40 && Math.abs(this.along) < 40 ? this.still + dt : 0;
      if (!leaving && !fetching && !coming)
        this.mode = there ? 'settle' : this.still > 0.35 ? 'wait' : 'lead';
      this.settled += ((this.mode === 'settle' ? 1 : 0) - this.settled) * Math.min(1, dt * 2.4);
      path.sample(this.s / len, tmp);
      const px = tmp[0] as number;
      const py = tmp[1] as number;
      const tx = tmp[2] as number;
      const ty = tmp[3] as number;
      // Fetching, the leader is at her shoulder instead (the flight loops round her).
      const fk = this.fetchK;
      this.lx = px + (hx - px) * fk;
      this.ly = py + (hy - 46 - py) * fk + (leaving ? -(1 - this.alpha) * 70 : 0);
      const set = this.settled;
      // Is the way from her to the leader a climb or a drop? Then the flight streams along it, away
      // from her, one moth after another, instead of hanging in a knot overhead.
      path.sample((sp + this.s) / 2 / len, tmp);
      const steep = Math.abs(tmp[3] as number) > G.steep && !fetching && !coming && !leaving;
      this.vert += ((steep ? 1 - set : 0) - this.vert) * Math.min(1, dt * 4);
      const vert = this.vert;
      const circ = (this.mode === 'wait' && vert < 0.5) || fetching ? 1 : 0;
      const lo = Math.min(len, sp + G.streamFrom);
      // (At least `streamMin` px of it, as far as the picture goes: a short run beside her reads as a knot.)
      let hi = Math.min(len, Math.max(this.s, lo + G.streamMin));
      for (let k = 0; k < 10 && hi > Math.max(this.s, lo + 120); k++) {
        path.sample(hi / len, tmp);
        const dx = (tmp[0] as number) - cam.x;
        const dy = (tmp[1] as number) - cam.y;
        if (Math.abs(dx) < insetX && dy > -insetTop && dy < insetBot) break;
        hi -= 30;
      }

      for (let i = 0; i < this.n; i++) {
        const m = this.moths[i] as Flyer;
        if (!m.on) continue;
        if (m.wait > 0) {
          m.wait -= dt;
          m.view.root.visible = false;
          continue;
        }
        const ph = m.seed * 40;
        // Its place: strung out behind the leader along the way, weaving a little;
        path.sample(Math.max(0, this.s - i * G.spacing) / len, tmp);
        let gx = (tmp[0] as number) + (this.lx - px);
        let gy = (tmp[1] as number) + (this.ly - py);
        const w = G.weave * (1 - set);
        gx += -ty * Math.sin(this.age * 7.1 + ph) * w + Math.sin(this.age * 3.3 + ph * 1.7) * w * 0.5;
        gy += tx * Math.sin(this.age * 7.1 + ph) * w + Math.cos(this.age * 4.1 + ph) * w * 0.6;
        // waiting (or round her), a tight ring that turns as one;
        if (circ) {
          const r = fetching ? G.fetchR : G.ringR;
          const a = this.age * (fetching ? G.fetchTurn : G.ringTurn) + (i / this.n) * Math.PI * 2;
          const k = fetching ? fk : smooth(0.35, 0.9, this.still);
          gx += (this.lx + Math.cos(a) * r - gx) * k;
          gy += (this.ly + Math.sin(a) * r * 0.62 - 6 - gy) * k;
        }
        // on a climb or a drop, a stream along the way: each runs from just past her to the leader
        // and starts again, so the direction is read at a glance;
        let streamA = 1;
        if (vert > 0.01) {
          const u = (this.age * G.streamRate + i / this.n) % 1;
          path.sample((lo + (hi - lo) * u) / len, tmp);
          const wx = Math.sin(this.age * 5.3 + ph) * 5;
          const cx = (tmp[0] as number) - (tmp[3] as number) * wx;
          const cy = (tmp[1] as number) + (tmp[2] as number) * wx;
          if (vert > 0.5 && u < m.s) {
            // Its run starts again: it is simply there, dark, and catches as it goes.
            m.x = cx;
            m.y = cy;
            m.vx = (tmp[2] as number) * 200;
            m.vy = (tmp[3] as number) * 200;
            m.hn = 0;
          }
          m.s = u;
          gx += (cx - gx) * vert;
          gy += (cy - gy) * vert;
          streamA = 1 - vert * (1 - Math.sin(Math.PI * u) ** 0.7);
        }
        // coming to her, strung out along the line from where it set out;
        if (this.comeK > 0.001) {
          const d = Math.max(0, Math.min(cd, this.comeS - i * G.spacing * 1.6));
          gx += (this.fromX + (cdx / cd) * d - gx) * this.comeK;
          gy += (this.fromY + (cdy / cd) * d - Math.sin((Math.PI * d) / cd) * 26 - gy) * this.comeK;
        }
        // settled, along the lantern's hook.
        if (set > 0.001) {
          const o = i - (this.n - 1) / 2;
          const sx = this.perchX + o * G.perch + Math.sin(clock * 1.3 + ph) * 1.2;
          const sy = this.perchY - 5 - Math.abs(o) * -2.4 + Math.sin(clock * 1.7 + ph) * 1.1;
          gx += (sx - gx) * set;
          gy += (sy - gy) * set;
        }
        // A stiff spring to that place: quick, with a little overshoot in the turns.
        const kk = G.spring * (1 + 0.2 * m.seed);
        m.vx += ((gx - m.x) * kk - m.vx * G.damp) * dt;
        m.vy += ((gy - m.y) * kk - m.vy * G.damp) * dt;
        const sp2 = Math.hypot(m.vx, m.vy);
        if (sp2 > G.top) {
          m.vx *= G.top / sp2;
          m.vy *= G.top / sp2;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.alpha = this.alpha * Math.min(1, (this.age - i * G.stagger) / G.fadeIn) * streamA;
        this.drawMoth(m, clock, cam, hw, hh, push, f, set);
      }
      // Settled, the hook itself glows: the brightest invitation in the frame is the lantern.
      if (set > 0.02 && this.alpha > 0.02) {
        const br = 0.82 + 0.18 * Math.sin(clock * 2.1);
        f.quad(
          K_FLARE,
          this.perchX,
          this.perchY + 6,
          G.perchHalo,
          G.perchHalo,
          G.perchGain * set * this.alpha * br,
          0,
          0,
        );
      }
    }

    // --- The pour.
    const P = G.pour;
    for (let i = GuideMoths.FLIGHT; i < this.moths.length; i++) {
      const m = this.moths[i] as Flyer;
      if (!m.on || !m.path) continue;
      if (m.wait > 0) {
        m.wait -= dt;
        m.view.root.visible = false;
        continue;
      }
      const len = Math.max(1, m.path.length);
      m.s += m.speed * dt * (0.45 + 0.55 * smooth(0, 160, m.s));
      if (m.s >= len) {
        m.on = false;
        m.path = null;
        m.view.root.visible = false;
        // It goes into the heart: one small spark.
        f.quad(K_SPARK, m.x, m.y, 7, 7, 1.1, 0, 0.7);
        continue;
      }
      m.path.sample(m.s / len, tmp);
      const ph = m.seed * 40;
      const w = P.weave * Math.sin(Math.PI * Math.min(1, m.s / len));
      const gx = (tmp[0] as number) - (tmp[3] as number) * Math.sin(m.s * 0.021 + ph) * w;
      const gy = (tmp[1] as number) + (tmp[2] as number) * Math.sin(m.s * 0.021 + ph) * w;
      const lx = m.x;
      const ly = m.y;
      m.x += (gx - m.x) * Math.min(1, dt * 14);
      m.y += (gy - m.y) * Math.min(1, dt * 14);
      m.vx = (m.x - lx) / Math.max(dt, 1e-4);
      m.vy = (m.y - ly) / Math.max(dt, 1e-4);
      m.alpha = smooth(0, 60, m.s) * smooth(0, 50, len - m.s + 20);
      this.drawMoth(m, clock, cam, hw, hh, push, f, 0);
    }
  }

  /** One ember-moth with its comet tail. `set` = how settled (wings slow, the ember breathes). */
  private drawMoth(
    m: Flyer,
    clock: number,
    cam: CameraView,
    hw: number,
    hh: number,
    push: boolean,
    f: GlintBatch,
    set: number,
  ): void {
    const G = GOAL.guide;
    if (push) {
      m.hi = (m.hi + 1) % HIST;
      m.hx[m.hi] = m.x;
      m.hy[m.hi] = m.y;
      if (m.hn < HIST) m.hn++;
    }
    const a = m.alpha;
    const seen = Math.abs(m.x - cam.x) < hw + 60 && Math.abs(m.y - cam.y) < hh + 60 && a > 0.01;
    m.view.root.visible = seen;
    if (!seen) return;
    const ph = m.seed * 40;
    m.view.fly(
      clock * (1 - 0.72 * set),
      m.x,
      m.y,
      Math.max(-0.6, Math.min(0.6, m.vx * 0.0022)),
      a * G.wing,
      G.size,
    );
    const tw =
      (0.86 + 0.14 * Math.sin(clock * 6.3 + ph)) * (1 + set * (0.2 + 0.2 * Math.sin(clock * 2.1 + ph * 0.1)));
    f.quad(K_SPARK, m.x, m.y + 1, G.ember, G.ember, G.emberGain * a * tw, 0, 0.9);
    f.quad(K_FLARE, m.x, m.y + 1, G.halo, G.halo, G.haloGain * a, 0, 0);
    // The tail: where it has just been, thinning and cooling (two beads to a step, so it is a streak).
    let qx = m.x;
    let qy = m.y;
    for (let j = 1; j < m.hn; j++) {
      const k = (m.hi - j + HIST) % HIST;
      const nx = m.hx[k] as number;
      const ny = m.hy[k] as number;
      for (let h = 1; h <= 2; h++) {
        const u = 1 - (j - 1 + h / 2) / HIST;
        const size = G.ember * (0.22 + 0.6 * u);
        f.quad(
          K_SPARK,
          qx + ((nx - qx) * h) / 2,
          qy + ((ny - qy) * h) / 2 + 1,
          size,
          size,
          G.tailGain * a * u * u,
          0,
          0.75 * u,
        );
      }
      qx = nx;
      qy = ny;
    }
  }

  /** How many are in the air (flight and pour): for tools. */
  get count(): number {
    let n = 0;
    for (const m of this.moths) if (m.on) n++;
    return n;
  }
}
