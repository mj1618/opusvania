// biome-ignore-all lint/style/noNonNullAssertion: polyline maths; indices are in range by construction
/**
 * Story staging in greybox (memory/staging.md; data `room.marks.stage`, src/scene/stage.ts): flat stand-ins
 * for the wood's set pieces, read from the sim and the story camera's beats (`STAGE_BEATS`,
 * camera/stage-cam.ts); never changes either. Render time only, seeds from hashes (no Math.random).
 *
 *   far (sky layer, behind the terrain, parallax about the vista's view point):
 *     the moon, the valley's lamps (warm dots far below), the swarm as a dot stream pouring into them,
 *     the title over the moon while the vista holds
 *   back (under her): a dead moth on the ground
 *   front (over her): stragglers diving over the lip, moths circling a burning lure, the firefly's
 *     glimpse (a small warm light on a path, the hang, two slow pulses, the dart away), the bask's rising
 *     moonlight, the wings-twitch cue
 *
 * Subtle and dark on purpose: the stream is pale specks, the lamps are dim warm points, the title is
 * thin and fades.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { StageMarks } from '../../scene/stage';
import type { SimEvent } from '../../sim/events';
import { flameAt } from '../../sim/lures';
import { tuning } from '../../sim/tuning';
import { DONE, STAGE_BEATS } from '../camera/stage-cam';
import type { CameraView, SimView } from '../contract';
import { hash01 } from './moths';
import { GB } from './palette';

/** Knobs (seconds of render time, px). */
export const STAGING = {
  /** The vista: the title's fade in / hold / out (s from the beat's start), the stream's thinning after it. */
  title: { in: 0.6, full: 1.4, out: 3.6, gone: 4.8, size: 84, spacing: 22, alpha: 0.82 },
  stream: { count: 150, speed: 240, width: 26, thinFrom: 3, thinTo: 8, alpha: 0.55 },
  /** Stragglers: start (s from the vista), stagger between them, flight time along their path. */
  stragglers: { at: 0.7, every: 0.18, fly: 2.4 },
  /** The glimpse (s from its beat): the firefly flies in, hangs, pulses twice, darts away. */
  glimpse: { in0: 0.5, in1: 1.9, pulse0: 2.2, pulse1: 2.9, away0: 3.4, away1: 4.0 },
  /** The bask's rising moonlight motes. */
  bask: { motes: 14, rise: 120 },
  /** The wings-twitch: two flicks in `len` s, then at most once every `every` s while she stands there. */
  twitch: { len: 1.0, every: 6 },
  /** Far things' parallax when the vista sets none. */
  parallax: 0.25,
};

const C = {
  moon: 0xd9dfec,
  lamp: 0xffb85a,
  speck: 0xdfe6f2,
  title: 0xdfe6f2,
  firefly: 0xffd27a,
  fireflyHot: 0xfff2c8,
  moonlight: 0xc6d4ff,
  dead: 0x737b8e,
  wing: 0x8a93a8,
};

/** Point and unit tangent at arc length `s` (0..1 of the whole) along a polyline. */
function along(
  pts: ReadonlyArray<readonly [number, number]>,
  u: number,
  out: { x: number; y: number; tx: number; ty: number },
) {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  let d = Math.min(1, Math.max(0, u)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l || i === pts.length - 1) {
      const k = l > 0 ? Math.min(1, d / l) : 0;
      out.x = a[0] + (b[0] - a[0]) * k;
      out.y = a[1] + (b[1] - a[1]) * k;
      out.tx = l > 0 ? (b[0] - a[0]) / l : 1;
      out.ty = l > 0 ? (b[1] - a[1]) / l : 0;
      return out;
    }
    d -= l;
  }
  return out;
}

function smooth(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/** A moth: a chevron whose wings beat (the freed moths' look, greybox/moths.ts). */
function moth(g: Graphics, x: number, y: number, beat: number, alpha: number, color: number = GB.moth): void {
  const span = 6 + 1.5 * Math.abs(beat);
  const lift = 2 + 5 * beat;
  g.moveTo(x - span, y - lift)
    .lineTo(x, y + 2)
    .lineTo(x + span, y - lift)
    .stroke({ color, width: 3, alpha: 0.9 * alpha, join: 'round', cap: 'round' });
  g.circle(x, y + 1, 2.5).fill({ color, alpha: 0.95 * alpha });
}

const AT = { x: 0, y: 0, tx: 1, ty: 0 };
const FLAME = { x: 0, y: 0 };

export class StagingView {
  /** Screen space, under the terrain (the sky layer). */
  readonly far = new Graphics();
  readonly back = new Graphics();
  readonly front = new Graphics();
  /** The title (screen space, with the far layer). */
  readonly farText = new Container({ label: 'greybox-staging-far' });
  private title: Text | null = null;
  private catches = 0;
  /** Seconds she has stood at the twitch spot; seconds since the last twitch started. */
  private twitchStand = 0;
  private twitchT = 1e6;
  /** Each circling lure's moths, once it is out: seconds since (they scatter). */
  private readonly scatter = new Map<string, number>();

  constructor(private readonly stage: StageMarks | undefined) {
    const v = stage?.vista;
    if (v?.title) {
      this.title = new Text({
        text: v.title,
        style: {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: STAGING.title.size,
          fill: C.title,
          letterSpacing: STAGING.title.spacing,
        },
        resolution: 2,
      });
      this.title.anchor.set(0.5, 0.5);
      this.title.alpha = 0;
      this.farText.addChild(this.title);
    }
  }

  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'roomEnter') {
        this.catches = 0;
        this.scatter.clear();
      } else if (e.type === 'fallCatch') this.catches++;
      else if (e.type === 'lureSnuff' && this.stage?.circlers?.some((c) => c.lure === e.id))
        this.scatter.set(e.id, 0);
    }
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView): void {
    const far = this.far.clear();
    const back = this.back.clear();
    const front = this.front.clear();
    const S = this.stage;
    if (!S) return;
    this.drawFar(far, clock, cam);
    for (const p of S.props ?? []) this.deadMoth(back, p.x, p.y, p.facing ?? 1);
    this.drawStragglers(front, clock);
    this.drawCirclers(front, dt, clock, sim);
    this.drawGlimpse(front, clock);
    this.drawBask(front, clock, sim);
    this.drawTwitch(back, dt, sim);
  }

  /** World point -> screen (the sky layer's logical units) at parallax `par` about the anchor. */
  private toScreen(
    cam: CameraView,
    ax: number,
    ay: number,
    par: number,
    wx: number,
    wy: number,
    out: { x: number; y: number },
  ) {
    out.x = 960 + (wx - ax - (cam.x - ax) * par) * cam.zoom;
    out.y = 540 + (wy - ay - (cam.y - ay) * par) * cam.zoom;
    return out;
  }

  private drawFar(g: Graphics, clock: number, cam: CameraView): void {
    const S = this.stage as StageMarks;
    const v = S.vista;
    const ax = v?.x ?? cam.x;
    const ay = v?.y ?? cam.y;
    const par = v?.parallax ?? STAGING.parallax;
    const z = cam.zoom;
    const P = { x: 0, y: 0 };
    const vt = STAGE_BEATS.vista;
    // The moon: a pale disc with a softer rim.
    if (S.moon) {
      const m = this.toScreen(cam, ax, ay, par, S.moon.x, S.moon.y, P);
      g.circle(m.x, m.y, S.moon.r * z * 1.9).fill({ color: C.moon, alpha: 0.04 });
      g.circle(m.x, m.y, S.moon.r * z * 1.35).fill({ color: C.moon, alpha: 0.06 });
      g.circle(m.x, m.y, S.moon.r * z).fill({ color: C.moon, alpha: 0.5 });
    }
    // The valley's lamps: dim warm points far below that flicker, one by one.
    const L = S.lights;
    if (L) {
      for (let i = 0; i < L.count; i++) {
        const wx = L.x + hash01('lamps', i * 2) * L.w;
        const wy = L.y + hash01('lamps', i * 2 + 1) ** 0.7 * L.h;
        const p = this.toScreen(cam, ax, ay, par, wx, wy, P);
        const fl = 0.75 + 0.25 * Math.sin(clock * (1.3 + hash01('lamps', i + 77) * 2) + i);
        const far = (wy - L.y) / L.h;
        const r = (1.6 + 1.6 * far) * z;
        g.circle(p.x, p.y, r * 3.2).fill({ color: C.lamp, alpha: 0.06 * fl });
        g.circle(p.x, p.y, r).fill({ color: C.lamp, alpha: (0.45 + 0.3 * far) * fl });
      }
    }
    // The swarm: a stream of pale specks pouring along its path into the lamps; it thins out after the vista.
    const St = S.stream;
    if (St && vt < DONE) {
      const T = STAGING.stream;
      const thin = vt < 0 ? 1 : 1 - smooth(T.thinFrom, T.thinTo, vt);
      if (thin > 0.01) {
        let len = 0;
        for (let i = 1; i < St.points.length; i++)
          len += Math.hypot(St.points[i]![0] - St.points[i - 1]![0], St.points[i]![1] - St.points[i - 1]![1]);
        const n = St.count ?? T.count;
        const speed = St.speed ?? T.speed;
        for (let i = 0; i < n; i++) {
          if (hash01('stream', i * 5 + 4) > thin) continue;
          const u =
            ((clock * speed * (0.8 + 0.4 * hash01('stream', i * 5))) / len + hash01('stream', i * 5 + 1)) % 1;
          const a = along(St.points, u, AT);
          const side = (hash01('stream', i * 5 + 2) - 0.5) * 2 * T.width * (1 - 0.6 * u);
          const wob = Math.sin(clock * 3 + i) * 6;
          const p = this.toScreen(cam, ax, ay, par, a.x - a.ty * (side + wob), a.y + a.tx * (side + wob), P);
          // Into the lamps at the end: they go warm and out.
          const end = smooth(0.82, 1, u);
          const fade = smooth(0, 0.05, u) * (1 - end);
          const color = end > 0.3 ? C.lamp : C.speck;
          const flick = 0.6 + 0.4 * Math.abs(Math.sin(clock * 20 + i * 1.7));
          g.rect(p.x - 1.5 * z, p.y - 1 * z, 3 * z * flick + 1, 2 * z).fill({
            color,
            alpha: T.alpha * fade * thin,
          });
        }
      }
    }
    // The title over the moon while the vista holds.
    const t = this.title;
    if (t && S.moon) {
      const T = STAGING.title;
      const a = vt < 0 || vt >= DONE ? 0 : smooth(T.in, T.full, vt) * (1 - smooth(T.out, T.gone, vt));
      t.visible = a > 0.003;
      t.alpha = T.alpha * a;
      const m = this.toScreen(cam, ax, ay, par, S.moon.x, S.moon.y + S.moon.r + 80, P);
      t.position.set(m.x, m.y);
      t.scale.set(Math.min(1.2, cam.zoom));
    }
  }

  private drawStragglers(g: Graphics, clock: number): void {
    const S = this.stage as StageMarks;
    const st = S.stragglers;
    const vt = STAGE_BEATS.vista;
    if (!st || vt < 0 || vt >= DONE) return;
    const T = STAGING.stragglers;
    for (let i = 0; i < st.count; i++) {
      const t0 = T.at + i * T.every;
      const u = (vt - t0) / (T.fly * (0.85 + 0.3 * hash01('strag', i)));
      if (u <= 0 || u >= 1) continue;
      const a = along(st.path, u * u * (1.6 - 0.6 * u), AT);
      const side = (hash01('strag', i + 40) - 0.5) * 120 * (1 - u * 0.5);
      const x = a.x - a.ty * side + Math.sin(clock * 5 + i) * 8;
      const y = a.y + a.tx * side;
      const fade = smooth(0, 0.08, u) * (1 - smooth(0.85, 1, u));
      moth(g, x, y, Math.sin(clock * 24 + i * 2.3), fade);
    }
  }

  private drawCirclers(g: Graphics, dt: number, clock: number, sim: SimView): void {
    const S = this.stage as StageMarks;
    const list = sim.scene.lures ?? [];
    for (const c of S.circlers ?? []) {
      const i = list.findIndex((l) => l.id === c.lure);
      const l = list[i];
      if (!l) continue;
      const out = (sim.lures.hp[i] ?? 0) <= 0;
      let sc = this.scatter.get(c.lure);
      if (out && sc === undefined) sc = 3; // out before she came: they are gone
      if (sc !== undefined) {
        sc += dt;
        this.scatter.set(c.lure, sc);
        if (sc > 2.5) continue;
      }
      const f = flameAt(sim.lures, i, l, sim.frame - 2 + sim.alpha, tuning, FLAME);
      for (let k = 0; k < c.count; k++) {
        const ph = hash01(c.lure, k) * Math.PI * 2;
        const w = (1.4 + 0.9 * hash01(c.lure, k + 20)) * (k % 2 === 0 ? 1 : -1);
        const r = c.r * (0.7 + 0.5 * hash01(c.lure, k + 40)) + Math.sin(clock * 2.1 + k) * 10;
        const a = ph + clock * w;
        let x = f.x + Math.cos(a) * r;
        let y = f.y + Math.sin(a) * r * 0.75;
        let alpha = 1;
        if (sc !== undefined) {
          // Freed: up and away, scattering.
          const s = sc;
          x += Math.cos(ph) * 160 * s;
          y -= (120 + 80 * hash01(c.lure, k + 60)) * s * s;
          alpha = 1 - smooth(1.2, 2.5, s);
        }
        moth(g, x, y, Math.sin(clock * 26 + k * 1.9), alpha * 0.9);
      }
    }
  }

  private drawGlimpse(g: Graphics, clock: number): void {
    const S = this.stage as StageMarks;
    const gl = S.glimpse;
    const t = STAGE_BEATS.glimpse;
    if (!gl || t < 0 || t >= DONE) return;
    const T = STAGING.glimpse;
    let x: number;
    let y: number;
    let pulse = 0;
    const hang = gl.path[gl.path.length - 1]!;
    if (t < T.in0) return;
    if (t < T.in1) {
      const u = smooth(T.in0, T.in1, t);
      const a = along(gl.path, u, AT);
      x = a.x + Math.sin(t * 7) * 10 * (1 - u);
      y = a.y + Math.cos(t * 5) * 8 * (1 - u);
    } else if (t < T.away0) {
      x = hang[0];
      y = hang[1] - 18;
      // Two slow pulses while it hangs the cap.
      const half = (T.pulse1 - T.pulse0) / 2;
      for (const s of [T.pulse0, T.pulse0 + half])
        pulse = Math.max(pulse, Math.sin(Math.PI * smooth(s, s + half, t)));
    } else if (t < T.away1) {
      const u = smooth(T.away0, T.away1, t);
      const a = along(gl.away, u * u, AT);
      x = a.x;
      y = a.y;
    } else return;
    const fl = 0.85 + 0.15 * Math.sin(clock * 13);
    // It is seen from far below (the look-up zooms out): a light, not a speck.
    g.circle(x, y, (40 + 40 * pulse) * fl).fill({ color: C.firefly, alpha: 0.08 + 0.14 * pulse });
    g.circle(x, y, (18 + 8 * pulse) * fl).fill({ color: C.firefly, alpha: 0.25 });
    g.circle(x, y, (9 + 4 * pulse) * fl).fill({ color: C.firefly, alpha: 0.9 });
    g.circle(x, y, 4).fill({ color: C.fireflyHot, alpha: 1 });
  }

  private drawBask(g: Graphics, clock: number, sim: SimView): void {
    const S = this.stage as StageMarks;
    const b = S.bask;
    const t = STAGE_BEATS.bask;
    if (!b || t < 0 || t > b.secs + 1.5) return;
    const T = STAGING.bask;
    const k = smooth(0, 0.6, t) * (1 - smooth(b.secs, b.secs + 1.5, t));
    const p = sim.player;
    for (let i = 0; i < T.motes; i++) {
      const u = (clock * 0.35 + hash01('bask', i)) % 1;
      const x = p.cx + (hash01('bask', i + 30) - 0.5) * 160 + Math.sin(clock * 1.3 + i) * 10;
      const y = p.feetY - u * T.rise * 2;
      g.circle(x, y, 2).fill({ color: C.moonlight, alpha: 0.6 * k * Math.sin(Math.PI * u) });
    }
  }

  private drawTwitch(g: Graphics, dt: number, sim: SimView): void {
    const S = this.stage as StageMarks;
    const tw = S.twitch;
    if (!tw) return;
    const T = STAGING.twitch;
    const p = sim.player;
    const at = this.catches >= tw.catches && p.grounded && Math.hypot(p.cx - tw.x, p.feetY - tw.y) < tw.r;
    this.twitchStand = at && Math.abs(p.vx) < 0.5 ? this.twitchStand + dt : 0;
    this.twitchT += dt;
    if (this.twitchStand > 0.5 && this.twitchT > T.every) this.twitchT = 0;
    if (this.twitchT >= T.len) return;
    // Two flicks: her wings jerk half open off her back and fold again.
    const u = this.twitchT / T.len;
    const open = Math.max(0, Math.sin(u * Math.PI * 4)) ** 0.7;
    const sx = p.cx - p.facing * 6;
    const sy = p.cy - 6;
    for (const s of [-1, 1]) {
      const ang = -Math.PI / 2 + s * (0.25 + 0.9 * open);
      const len = 26 + 22 * open;
      g.moveTo(sx, sy)
        .lineTo(sx + Math.cos(ang - 0.3 * s) * len * 0.7, sy + Math.sin(ang - 0.3 * s) * len * 0.7)
        .lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len)
        .lineTo(sx + Math.cos(ang + 0.35 * s) * len * 0.55, sy + Math.sin(ang + 0.35 * s) * len * 0.55)
        .closePath()
        .fill({ color: C.wing, alpha: 0.55 * open });
    }
  }

  /** A dead moth on its back on the ground: grey, still, wings flat. */
  private deadMoth(g: Graphics, x0: number, y: number, facing: number): void {
    // Drawn about its feet point at 1.3x (it has to read at play zoom, on a grey floor).
    const k = 1.3;
    const x = x0;
    const by = y - 4;
    g.setTransform(k, 0, 0, k, x0 * (1 - k), y * (1 - k));
    g.ellipse(x - 13 * facing, by - 1, 14, 5).fill({ color: C.dead, alpha: 0.9 });
    g.ellipse(x + 11 * facing, by + 1, 12, 4).fill({ color: C.dead, alpha: 0.75 });
    g.ellipse(x, by - 1, 8, 4).fill({ color: 0x3e4350 });
    // Legs curled up, one antenna.
    g.moveTo(x - 3, by - 4)
      .lineTo(x - 5, by - 10)
      .moveTo(x + 2, by - 4)
      .lineTo(x + 3, by - 9)
      .moveTo(x + 8 * facing, by - 2)
      .lineTo(x + 20 * facing, by - 8)
      .stroke({ color: C.dead, width: 1.5, alpha: 0.9 });
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}
