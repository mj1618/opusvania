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
import { getRoom, WORLD } from '../../scene/index';
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
  /** (r2: in sooner, a runner saw it 1.3 s before she left the room.) */
  title: { in: 0.1, full: 0.55, out: 3.4, gone: 4.6, size: 84, spacing: 22, alpha: 0.82 },
  stream: { count: 150, speed: 240, width: 26, thinFrom: 3, thinTo: 8, alpha: 0.55 },
  /** Stragglers: start (s from the vista), stagger between them, flight time along their path. */
  stragglers: { at: 0.7, every: 0.18, fly: 2.4 },
  /** The glimpse (s from its beat): the firefly flies in, hangs, pulses twice, darts away. */
  /** (r2: 3 s in all, so the camera is off her as briefly as it can be with input live.) */
  glimpse: { in0: 0.25, in1: 1.15, pulse0: 1.25, pulse1: 1.95, away0: 2.15, away1: 2.6 },
  /** The bask's rising moonlight motes. */
  bask: { motes: 14, rise: 120 },
  /** The wings-twitch: two flicks in `len` s, then at most once every `every` s while she stands there. */
  twitch: { len: 1.0, every: 6 },
  /** A hawker's snatch from a lamp's swarm: wing scales falling `fall` px over `secs` s. */
  snatch: { secs: 1.1, scales: 3, fall: 70 },
  /** The hatching tree far: drawn below a camera zoom of `from`, in full `over` lower. */
  hatchFar: { from: 0.8, over: 0.15 },
  /** The crowd at the far oak's crown: specks at most (all freed), their size (px at k 1), opacity, spin, ring glow. */
  crowd: { max: 70, dot: 9, alpha: 0.75, spin: 0.25, ring: 0.5 },
  /**
   * The den: the breath's rate (rad/s) and darkness, dust motes and how far they fall; the crack's blade (in, s;
   * alpha); the fall: plug pieces and their seconds, the column's pour (s) and alpha, the walls' wings coming in.
   */
  den: {
    breathRate: 0.9,
    breathAlpha: 0.22,
    dust: 18,
    dustFall: 260,
    crackIn: 0.4,
    bladeAlpha: 0.22,
    pieces: 7,
    fallSecs: 1.4,
    pour: 1.8,
    columnAlpha: 0.14,
    wallsIn: 1.5,
    wallAlpha: 0.6,
  },
  /** The wing carpet: px of floor per wing, a wing's length, how high the middle is piled, its opacity. */
  carpet: { every: 11, len: 30, pile: 18, alpha: 0.7 },
  /**
   * The glide-lip assist (plan r3 item 1; `player.wingsHeld`: the sim opened her wings with no button): the
   * air lifts them: a moonlit cup under her wings rising over `flare` s (`span` px each side, `cupBelow` under her
   * centre), then `streaks` updraft streaks (`streak` px, rising `rise` px/s over `drop` px) at `hold` while they
   * stay open by themselves; in and out over `in` s.
   */
  wingsAssist: {
    flare: 0.6,
    in: 0.2,
    hold: 0.35,
    flareAlpha: 0.85,
    span: 74,
    cupBelow: 46,
    cupDepth: 14,
    streaks: 3,
    streak: 16,
    rise: 90,
    drop: 60,
  },
  /**
   * The oak far off: its size and place shrink by `near` / distance (between `minK` and `maxK`), it is kept `margin`
   * px inside the frame on its side, `widen` x its trunk's width; colours.
   */
  oakFar: {
    /** The crown's top on screen: at least `marginY` under the frame's top, at least `skyK` x its height above the centre. */
    marginY: 70,
    skyK: 0.12,
    near: 2600,
    minK: 0.1,
    maxK: 0.5,
    margin: 140,
    widen: 1.4,
    color: 0x12161e,
    alpha: 0.85,
    ring: 0xc6d4ff,
    ringAlpha: 0.55,
  },
  /** The guide straggler: px ahead of her, px/s at most, moths, alpha; px from the end she must be to send it through, s to go. */
  guide: { ahead: 360, speed: 420, count: 2, alpha: 0.85, through: 260, out: 1.4 },
  /** The moths climbing the oak: per moth freed, at most, px/s up, swirl (share of its width), alpha. */
  oak: { per: 0.25, max: 48, speed: 70, swirl: 0.35, alpha: 0.7 },
  /** The crown cloud: at most this many specks; seconds to lift away, the spread of their starts, the rise (px). */
  cloud: { max: 600, lift: 6, stagger: 2.5, arc: 260, grow: 2.5 },
  /** Far things' parallax when the vista sets none. */
  parallax: 0.25,
};

/** The den's colours: the plug (earth and root), the moonlight, the dust. */
const C_DEN = { plug: 0x2a2620, light: 0xc6d4ff, dust: 0x9aa3b8 };

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
  /** The root ladder (the level kit's bark colours). */
  root: 0x5e4a33,
  rootLight: 0x9c7b52,
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
  /** The assisted wings: seconds since they opened by themselves (big = not lately) and the outline's fade. */
  private assistT = 1e6;
  private assistA = 0;
  private glideStarted = false;
  /** Moths taken from each lamp's swarm by a hawker's pass (`enemySnatch`), by lure id; the snatches' puffs. */
  private readonly snatched = new Map<string, number>();
  private lureIds: string[] = [];
  private readonly puffs: { x: number; y: number; t: number }[] = [];
  /** Each circling lure's moths, once it is out: seconds since (they scatter). */
  private readonly scatter = new Map<string, number>();
  /** The guide's place along its path (arc length, eased) and seconds since it went through the end. */
  private guideS = -1;
  private guideGone = -1;
  /** Seconds since the root was cut (large = not this visit). */
  private rootT = 1e6;
  /** The den: seconds since its crack / its fall this visit (big = before this visit, -1 = not yet). */
  private denCrackT = -1;
  private denFallT = -1;
  /** Seconds since the crown cloud lifted (-1 = waiting; `DONE` = it went before this visit). */
  private cloudT = -1;

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
        this.guideS = -1;
        this.guideGone = -1;
        this.cloudT = -1;
        this.denCrackT = -1;
        this.denFallT = -1;
        this.snatched.clear();
        this.puffs.length = 0;
      } else if (e.type === 'fallCatch') this.catches++;
      else if (e.type === 'glideStart') this.glideStarted = true;
      else if ((e as { type: string }).type === 'enemySnatch') {
        // A hawker's swoop through a lamp took one of its moths (the creatures' rhythm hawker).
        const sn = e as unknown as { lure?: string | number; x: number; y: number };
        const lure = typeof sn.lure === 'number' ? this.lureIds[sn.lure] : sn.lure;
        if (lure !== undefined) this.snatched.set(lure, (this.snatched.get(lure) ?? 0) + 1);
        this.puffs.push({ x: sn.x, y: sn.y, t: 0 });
      } else if (e.type === 'lureSnuff' && this.stage?.circlers?.some((c) => c.lure === e.id))
        this.scatter.set(e.id, 0);
      else if (e.type === 'flagSet' && e.flag === this.stage?.rootFall?.flag) this.rootT = 0;
      else if (e.type === 'flagSet' && e.flag === this.stage?.den?.crack) this.denCrackT = 0;
      else if (e.type === 'flagSet' && e.flag === this.stage?.den?.flag) this.denFallT = 0;
      else if (e.type === 'flagSet' && e.flag === this.stage?.cloud?.flag) this.cloudT = 0;
    }
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView): void {
    const far = this.far.clear();
    const back = this.back.clear();
    const front = this.front.clear();
    this.drawWingsAssist(front, dt, clock, sim);
    const S = this.stage;
    if (!S) return;
    this.drawFar(far, clock, cam, sim);
    this.drawCarpet(back);
    this.drawDen(back, front, dt, clock, sim);
    for (const p of S.props ?? []) this.deadMoth(back, p.x, p.y, p.facing ?? 1);
    for (const l of S.ladders ?? []) if (sim.save.flags.includes(l.flag)) this.ladder(back, l.x, l.y0, l.y1);
    this.drawRootFall(back, dt);
    this.drawOakClimb(back, clock, sim);
    this.drawGuide(front, dt, clock, sim);
    this.drawCloud(front, dt, clock, sim, cam.zoom);
    this.drawStragglers(front, clock);
    this.drawCirclers(front, dt, clock, sim);
    this.drawGlimpse(front, clock);
    this.drawBask(front, clock, sim);
    this.drawTwitch(back, dt, sim);
  }

  /**
   * Her wings opened by the glade lip's assist: the air under her lifts them. A moonlit cup of air under her
   * wings rises and fades as they open, then a few faint streaks of updraft under her while they stay open
   * by themselves (not an outline of the wings: the painted ones are bigger and say it better).
   */
  private drawWingsAssist(g: Graphics, dt: number, clock: number, sim: SimView): void {
    const W = STAGING.wingsAssist;
    const p = sim.player;
    if (this.glideStarted && p.wingsHeld) this.assistT = 0;
    this.glideStarted = false;
    this.assistT += dt;
    const on = p.wingsHeld && p.gliding;
    this.assistA = on ? Math.min(1, this.assistA + dt / W.in) : Math.max(0, this.assistA - dt / W.in);
    if (this.assistA <= 0) return;
    const flare = this.assistT < W.flare ? 1 - this.assistT / W.flare : 0;
    if (flare > 0) {
      // The cup: an arc under her wings, from below her up to her wingline.
      const u = 1 - flare;
      const cy = p.cy + W.cupBelow * (1 - u * 0.7);
      const half = W.span * (0.7 + 0.3 * u);
      g.moveTo(p.cx - half, cy - W.cupDepth)
        .quadraticCurveTo(p.cx, cy + W.cupDepth, p.cx + half, cy - W.cupDepth)
        .stroke({ color: C.moonlight, width: 3, alpha: W.flareAlpha * flare * this.assistA });
    }
    // The updraft: short streaks rising under her (render time; the same for every take).
    for (let k = 0; k < W.streaks; k++) {
      const x = p.cx + (k - (W.streaks - 1) / 2) * (W.span / W.streaks) * 1.4;
      const ph = (clock * W.rise + k * 37) % W.drop;
      const y0 = p.cy + W.drop + 10 - ph;
      const a = Math.sin((ph / W.drop) * Math.PI);
      g.moveTo(x, y0).lineTo(x, y0 - W.streak);
      g.stroke({ color: C.moonlight, width: 1.5, alpha: W.hold * a * this.assistA });
    }
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

  private drawFar(g: Graphics, clock: number, cam: CameraView, sim: SimView): void {
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
    this.drawOakFar(g, clock, cam, sim);
    this.drawHatchFar(g, cam, sim);
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
    this.lureIds = list.map((l) => l.id);
    // A snatch: a few wing scales falling where the moth was taken.
    const P = STAGING.snatch;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i] as { x: number; y: number; t: number };
      q.t += dt;
      if (q.t >= P.secs) {
        this.puffs.splice(i, 1);
        continue;
      }
      const u = q.t / P.secs;
      for (let k = 0; k < P.scales; k++) {
        const sx = q.x + (k - (P.scales - 1) / 2) * 7 + Math.sin(clock * 5 + k * 2.3) * 5 * u;
        const sy = q.y + P.fall * u * (0.6 + 0.2 * k);
        g.circle(sx, sy, 2).fill({ color: C.wing, alpha: 0.8 * (1 - u) });
      }
    }
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
      // (Each snatch takes the last one: the rest keep their paths.)
      const left = Math.max(0, c.count - (this.snatched.get(c.lure) ?? 0));
      for (let k = 0; k < left; k++) {
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

  /**
   * The great oak as a far landmark (plan r3 item 2: no frame before minute 14 said "the tree"), in every room it
   * stands outside of: a dark column taller than anything, its crown a dark mass with a pale ring of moonlight at
   * the top. Projected toward where it really is (`stage.oak`, room coordinates): nearer rooms see it bigger and
   * closer to its true place; a far one is drawn smaller and pulled in to stay inside the frame on its side.
   * Screen space (the sky layer), behind the terrain.
   */
  /**
   * A far landmark's place on screen (the sky layer), or null where it stands in this room or is too small:
   * toward where it really is, compressed by its distance, kept inside the frame's side and its crown in the sky.
   */
  private farPlace(
    m: { x: number; y: number; top: number; w?: number },
    cam: CameraView,
    sim: SimView,
  ): { x: number; topY: number; footY: number; w: number; h: number; k: number } | null {
    const R = sim.scene;
    if (m.x >= 0 && m.x <= R.width && m.y >= 0 && m.top <= R.height) return null;
    const T = STAGING.oakFar;
    const z = cam.zoom;
    const midY = (m.y + m.top) / 2;
    const dist = Math.hypot(m.x - cam.x, midY - cam.y);
    const k = Math.min(T.maxK, Math.max(T.minK, T.near / Math.max(1, dist)));
    const halfW = cam.w / 2 - T.margin;
    let sx = (m.x - cam.x) * k * z;
    if (Math.abs(sx) > halfW) sx = Math.sign(sx) * halfW;
    let footY = 540 + (m.y - cam.y) * k * z;
    let topY = 540 + (m.top - cam.y) * k * z;
    const lo = 540 - cam.h / 2 + T.marginY;
    const hi = 540 - cam.h * T.skyK;
    const shift = topY < lo ? lo - topY : topY > hi ? hi - topY : 0;
    topY += shift;
    footY += shift;
    const h = footY - topY;
    if (h < 4) return null;
    return { x: 960 + sx, topY, footY, w: (m.w ?? 384) * k * z * T.widen, h, k };
  }

  /**
   * The hatching tree, far to the west of the oak (`stage.hatchTree`): its trunk, the long branch she hung from with
   * the empty cocoons under it, a ragged crown. Darker and smaller than the oak; no light of its own.
   */
  private drawHatchFar(g: Graphics, cam: CameraView, sim: SimView): void {
    const m = this.stage?.hatchTree;
    if (!m) return;
    // Only in a wide frame (the finale's, the glimpse's): on the oak's floor at play zoom it would hang in the hollow.
    const wide = Math.min(1, Math.max(0, (STAGING.hatchFar.from - cam.zoom) / STAGING.hatchFar.over));
    if (wide <= 0) return;
    const f = this.farPlace(m, cam, sim);
    if (!f) return;
    const T = STAGING.oakFar;
    const { x, topY, footY, w, h } = f;
    const a = T.alpha * wide;
    g.poly([
      x - w * 0.4,
      topY + h * 0.2,
      x + w * 0.4,
      topY + h * 0.2,
      x + w * 0.8,
      footY,
      x - w * 0.8,
      footY,
    ]).fill({
      color: T.color,
      alpha: a,
    });
    // The branch east, a little up, then the cocoons hanging under it.
    const by = topY + h * 0.36;
    const bl = h * 0.7;
    g.poly([x, by - h * 0.02, x + bl, by - h * 0.05, x + bl, by - h * 0.035, x, by + h * 0.025]).fill({
      color: T.color,
      alpha: a,
    });
    for (let i = 1; i <= 6; i++) {
      const cx = x + (bl * i) / 7;
      const cy = by - (h * (0.05 * i)) / 7 + h * 0.04;
      g.ellipse(cx, cy, Math.max(1, h * 0.008), Math.max(1.5, h * 0.022)).fill({ color: T.color, alpha: a });
    }
    for (let i = 0; i < 4; i++)
      g.ellipse(x + (i - 1.5) * w * 0.9, topY + h * 0.12 + (i % 2) * h * 0.04, w * 1.2, h * 0.1).fill({
        color: T.color,
        alpha: a,
      });
  }

  private drawOakFar(g: Graphics, clock: number, cam: CameraView, sim: SimView): void {
    const oak = this.stage?.oak;
    if (!oak) return;
    const f = this.farPlace(oak, cam, sim);
    if (!f) return;
    const T = STAGING.oakFar;
    const z = cam.zoom;
    const { x, topY, footY, w, h, k } = f;
    const a = T.alpha;
    // The trunk, flaring at its foot.
    g.poly([
      x - w * 0.5,
      topY + h * 0.15,
      x + w * 0.5,
      topY + h * 0.15,
      x + w * 0.9,
      footY,
      x - w * 0.9,
      footY,
    ]).fill({
      color: T.color,
      alpha: a,
    });
    // The crown: a dark mass over the top.
    for (let i = 0; i < 5; i++) {
      const ox = (i - 2) * w * 0.9;
      const oy = topY + h * 0.12 + Math.abs(i - 2) * h * 0.03;
      g.ellipse(x + ox, oy, w * 1.4, h * 0.11).fill({ color: T.color, alpha: a });
    }
    // Its ring of moonlight at the top: the way out.
    const pulse = 0.85 + 0.15 * Math.sin(clock * 0.8);
    g.ellipse(x, topY + h * 0.02, w * 0.7, Math.max(2, h * 0.025)).stroke({
      color: T.ring,
      width: Math.max(1.5, 12 * k * z),
      alpha: T.ringAlpha * pulse,
    });
    g.rect(x - w * 0.18, topY + h * 0.02, w * 0.36, h * 0.6).fill({ color: T.ring, alpha: 0.05 * pulse });
    // The crowd at the crown (first-timer r4: "moths 40/160 is a counter, not a crowd"): her freed moths of the
    // area's, a breathing swarm round the ring, more and brighter as she frees them; the ring brightens too.
    const share = areaShare(sim);
    if (share > 0) {
      const C = STAGING.crowd;
      const n = Math.max(1, Math.round(C.max * share));
      const rx = w * 0.7;
      const ry = Math.max(3, h * 0.05);
      const cy = topY + h * 0.02;
      const dot = Math.max(1.2, C.dot * k * z);
      for (let i = 0; i < n; i++) {
        const a = hash01('crowd', i) * Math.PI * 2 + clock * C.spin * (0.6 + 0.8 * hash01('crowd', i + 50));
        const rr = 0.55 + 0.75 * hash01('crowd', i + 100);
        const lift = (0.5 + Math.sin(clock * 1.3 + i) * 0.5) * ry * 2.5;
        g.circle(x + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr - lift, dot).fill({
          color: T.ring,
          alpha: C.alpha * (0.5 + 0.5 * share),
        });
      }
      g.ellipse(x, cy, rx, ry).stroke({
        color: T.ring,
        width: Math.max(1, 6 * k * z),
        alpha: C.ring * share * pulse,
      });
    }
  }

  /**
   * The straggler that leads: it keeps `ahead` px along the path ahead of where she is (her nearest point on
   * it), waits there wheeling, and goes on through the end once she nears it.
   */
  private drawGuide(g: Graphics, dt: number, clock: number, sim: SimView): void {
    const G = this.stage?.guide;
    if (!G || (G.until && sim.save.flags.includes(G.until))) return;
    const pts = G.path;
    let total = 0;
    for (let i = 1; i < pts.length; i++)
      total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    // Her place along the path: the nearest point on any segment.
    const p = sim.player;
    let best = Number.POSITIVE_INFINITY;
    let her = 0;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!;
      const [bx, by] = pts[i]!;
      const l = Math.hypot(bx - ax, by - ay) || 1;
      const u = Math.max(0, Math.min(1, ((p.cx - ax) * (bx - ax) + (p.cy - ay) * (by - ay)) / (l * l)));
      const d = Math.hypot(ax + (bx - ax) * u - p.cx, ay + (by - ay) * u - p.cy);
      if (d < best) {
        best = d;
        her = acc + u * l;
      }
      acc += l;
    }
    const want = Math.min(total, her + (G.ahead ?? STAGING.guide.ahead));
    // Only ever onward; eased, never faster than a moth flies.
    if (this.guideS < 0) this.guideS = want;
    const step = STAGING.guide.speed * dt;
    this.guideS = Math.max(this.guideS, Math.min(want, this.guideS + step));
    if (this.guideGone < 0 && her > total - STAGING.guide.through) this.guideGone = 0;
    let gone = 0;
    if (this.guideGone >= 0) {
      this.guideGone += dt;
      gone = Math.min(1, this.guideGone / STAGING.guide.out);
      if (gone >= 1) return;
    }
    const n = G.count ?? STAGING.guide.count;
    for (let i = 0; i < n; i++) {
      const lag = i * 40;
      const a = along(pts, Math.max(0, this.guideS - lag) / total, AT);
      const wx = Math.sin(clock * 1.7 + i * 2.1) * 28;
      const wy = Math.cos(clock * 2.3 + i) * 16 - 30;
      // Through the end: on along the last segment and out of sight.
      const on = gone * 260;
      moth(
        g,
        a.x + wx + a.tx * on,
        a.y + wy + a.ty * on,
        Math.sin(clock * 24 + i * 1.3),
        (1 - gone) * STAGING.guide.alpha,
      );
    }
  }

  /**
   * Every moth she has freed, seen climbing the oak's column where it stands in the room (the hub: "up the
   * trunk, moonlight at the top, every freed moth spiralling up and out"). As many as her count (a few per
   * ten, capped), each on its own slow spiral, gone into the crown's light.
   */
  private drawOakClimb(g: Graphics, clock: number, sim: SimView): void {
    const oak = this.stage?.oak;
    if (!oak || sim.save.moths <= 0) return;
    const R = sim.scene;
    if (oak.x < 0 || oak.x > R.width || oak.top > R.height || oak.y < 0) return;
    const T = STAGING.oak;
    const n = Math.min(T.max, Math.ceil(sim.save.moths * T.per));
    const w = oak.w ?? 320;
    const h = oak.y - oak.top;
    for (let i = 0; i < n; i++) {
      const u = (clock * (T.speed / h) * (0.7 + 0.6 * hash01('oak', i)) + hash01('oak', i + 99)) % 1;
      const y = oak.y - u * h;
      const a = clock * (0.8 + hash01('oak', i + 7)) + i * 2.4;
      const x = oak.x + Math.sin(a) * w * T.swirl;
      const fade = Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.15);
      moth(g, x, y, Math.sin(clock * 22 + i), fade * T.alpha, GB.moth);
    }
  }

  /**
   * The crown cloud (the director's finale): every moth she freed, waiting at the crown as a breathing swarm
   * of specks (and a few wings), its size her count; on its flag it lifts off toward the valley.
   */
  private drawCloud(g: Graphics, dt: number, clock: number, sim: SimView, zoom = 1): void {
    const C = this.stage?.cloud;
    if (!C) return;
    if (this.cloudT < 0 && sim.save.flags.includes(C.flag)) return; // it went on an earlier visit
    if (this.cloudT >= 0) this.cloudT += dt;
    const T = STAGING.cloud;
    const t = this.cloudT;
    // The lift lasts the cloud's `secs` (default 9: plan r3 item 7), the starts spread over its first part.
    const lift = Math.max(2, (C.secs ?? 9) - T.stagger - 0.5);
    if (t > lift + T.stagger + 1) return;
    const n = Math.min(T.max, sim.save.moths);
    // Drawn bigger as the view widens (the finale holds a wide frame: specks a pixel across would vanish).
    const k = Math.min(T.grow, Math.max(1, 1 / Math.max(0.05, zoom)));
    for (let i = 0; i < n; i++) {
      const a = hash01('cloud', i) * Math.PI * 2;
      const rr = Math.sqrt(hash01('cloud', i + 500)) * C.r;
      const hx = C.x + Math.cos(a + clock * 0.15 * (0.5 + hash01('cloud', i + 9))) * rr;
      const hy = C.y + Math.sin(a + clock * 0.2) * rr * 0.45 + Math.sin(clock * 2 + i) * 6;
      let x = hx;
      let y = hy;
      let alpha = 0.75;
      if (t >= 0) {
        // Off toward the valley: each a little after the last, along a rising curve, thinning into the dark.
        const u = Math.min(1, Math.max(0, (t - hash01('cloud', i + 77) * T.stagger) / lift));
        const e = u * u * (3 - 2 * u);
        x = hx + (C.to[0] - C.x) * e;
        y = hy + (C.to[1] - C.y) * e - Math.sin(Math.PI * u) * T.arc;
        alpha *= 1 - u * u;
      }
      if (i % 9 === 0) {
        g.setTransform(k, 0, 0, k, x * (1 - k), y * (1 - k));
        moth(g, x, y, Math.sin(clock * 24 + i), alpha, GB.moth);
        g.setTransform(1, 0, 0, 1, 0, 0);
      } else g.rect(x - 1.5 * k, y - k, 3 * k, 2 * k).fill({ color: GB.moth, alpha: alpha * 0.8 });
    }
  }

  /** A root hanging as a ladder: a thick wavering root with short side roots for rungs. */
  private ladder(g: Graphics, x: number, y0: number, y1: number): void {
    const n = Math.max(2, Math.round((y1 - y0) / 24));
    g.moveTo(x, y0);
    for (let i = 1; i <= n; i++) {
      const y = y0 + ((y1 - y0) * i) / n;
      g.lineTo(x + Math.sin(i * 1.3) * 5, y);
    }
    g.stroke({ color: C.root, width: 9, cap: 'round', join: 'round' });
    for (let y = y0 + 30; y < y1 - 10; y += 44) {
      const s = Math.round(y / 44) % 2 === 0 ? 1 : -1;
      g.moveTo(x, y).lineTo(x + s * 22, y + 10);
    }
    g.stroke({ color: C.rootLight, width: 3, cap: 'round' });
  }

  /** The root she cut, falling away down the chute. */
  private drawRootFall(g: Graphics, dt: number): void {
    const R = this.stage?.rootFall;
    if (!R || this.rootT > 1.6) return;
    this.rootT += dt;
    const t = this.rootT;
    const drop = 0.5 * 1800 * t * t;
    const ang = 0.35 * t * t;
    const x0 = R.x + 30 * t;
    const y0 = R.y + drop;
    const x1 = x0 + Math.sin(ang) * R.len;
    const y1 = y0 + Math.cos(ang) * R.len;
    const a = 1 - Math.max(0, (t - 1.2) / 0.4);
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: C.root, width: 11, cap: 'round', alpha: a });
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ color: C.rootLight, width: 2, alpha: 0.6 * a });
  }

  /** A dead moth on its back on the ground: grey, still, wings flat. */
  /**
   * The den under the oak (`stage.den`, plan r5 item 1). Before the fight a slow dark breathes under the mesh and
   * dust sifts through it; at the crack one thin blade of moonlight enters through the plug; at its death the plug
   * falls in pieces, the moon column pours down into the den, and the walls show the wings layered on them.
   * A flag saved before this visit: the after-state (plug gone, column in, walls lit).
   */
  private drawDen(back: Graphics, front: Graphics, dt: number, clock: number, sim: SimView): void {
    const D = this.stage?.den;
    if (!D) return;
    const T = STAGING.den;
    const flags = sim.save.flags;
    if (this.denFallT < 0 && flags.includes(D.flag)) this.denFallT = 1e6;
    if (this.denCrackT < 0 && D.crack && flags.includes(D.crack)) this.denCrackT = 1e6;
    if (this.denFallT >= 0) this.denFallT += dt;
    if (this.denCrackT >= 0) this.denCrackT += dt;
    const fell = this.denFallT >= 0;
    const P = D.plug;
    const col = D.column;
    // The breathing dark (only before the fall): a soft shadow swelling and easing, dust motes sifting down.
    if (!fell && D.breath) {
      const b = D.breath;
      const br = 0.5 + 0.5 * Math.sin(clock * T.breathRate);
      back.ellipse(b.x, b.y, b.r * (0.9 + 0.12 * br), b.r * 0.45 * (0.9 + 0.12 * br)).fill({
        color: 0x020305,
        alpha: T.breathAlpha * (0.6 + 0.4 * br),
      });
      for (let i = 0; i < T.dust; i++) {
        const u = (clock * 0.12 + hash01('dust', i)) % 1;
        const x = P.x + hash01('dust', i + 9) * P.w;
        back.circle(x, P.y + P.h + u * T.dustFall, 1.6).fill({ color: C_DEN.dust, alpha: 0.5 * (1 - u) });
      }
    }
    // The plug: whole (cracked once the crack is in), or falling in pieces.
    if (!fell) {
      back.rect(P.x, P.y, P.w, P.h).fill({ color: C_DEN.plug, alpha: 0.95 });
      if (this.denCrackT >= 0) {
        // One blade of moonlight through a crack in it, down to the den's floor.
        const k = Math.min(1, this.denCrackT / T.crackIn);
        const cx = col.x;
        back
          .moveTo(cx - 3, P.y)
          .lineTo(cx + 9, P.y + P.h)
          .stroke({ color: C_DEN.light, width: 2, alpha: 0.9 * k });
        back
          .poly([cx - 4, P.y + P.h, cx + 10, P.y + P.h, cx + 26, col.foot, cx - 20, col.foot])
          .fill({ color: C_DEN.light, alpha: T.bladeAlpha * k });
      }
    } else {
      const t = this.denFallT;
      if (t < T.fallSecs)
        for (let i = 0; i < T.pieces; i++) {
          const px = P.x + ((i + 0.5) / T.pieces) * P.w;
          const delay = hash01('plug', i) * 0.4;
          const tt = Math.max(0, t - delay);
          const y = P.y + 0.5 * 2200 * tt * tt;
          if (y > col.foot) continue;
          const r = (hash01('plug', i + 5) - 0.5) * 6 * tt;
          const s = P.w / T.pieces;
          back
            .poly(
              [
                [-s / 2, -P.h / 2],
                [s / 2, -P.h / 2],
                [s / 2, P.h / 2],
                [-s / 2, P.h / 2],
              ].flatMap(([dx, dy]) => [
                px + (dx as number) * Math.cos(r) - (dy as number) * Math.sin(r),
                y + P.h / 2 + (dx as number) * Math.sin(r) + (dy as number) * Math.cos(r),
              ]),
            )
            .fill({ color: C_DEN.plug, alpha: 0.95 });
        }
      // The moon column pours down: from a thread to its full width over `pour` s, its foot spreading.
      const k = Math.min(1, t / T.pour);
      const w = col.w * (0.08 + 0.92 * k * k * (3 - 2 * k));
      const reach = col.top + (col.foot - col.top) * Math.min(1, t / (T.pour * 0.6));
      back
        .poly([
          col.x - w / 2,
          col.top,
          col.x + w / 2,
          col.top,
          col.x + w * 0.7,
          reach,
          col.x - w * 0.7,
          reach,
        ])
        .fill({ color: C_DEN.light, alpha: T.columnAlpha });
      back
        .poly([
          col.x - w * 0.25,
          col.top,
          col.x + w * 0.25,
          col.top,
          col.x + w * 0.35,
          reach,
          col.x - w * 0.35,
          reach,
        ])
        .fill({
          color: C_DEN.light,
          alpha: T.columnAlpha,
        });
      // The walls: wings layered on them, coming into the light.
      const lit = Math.min(1, Math.max(0, (t - T.pour * 0.5) / T.wallsIn));
      if (lit > 0)
        for (const wr of D.walls ?? [])
          for (let y = wr.y + 14; y < wr.y + wr.h; y += 18)
            for (let x = wr.x + ((y / 18) % 2) * 12; x < wr.x + wr.w; x += 24) {
              const h = hash01('wall', Math.round(x * 7 + y));
              const len = 14 + 8 * h;
              const a = (h - 0.5) * 1.2;
              front
                .moveTo(x, y)
                .lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.5 - 4)
                .lineTo(x + Math.cos(a) * len * 0.5, y + 4)
                .closePath()
                .fill({ color: h < 0.3 ? C.wing : C.dead, alpha: T.wallAlpha * lit });
            }
    }
  }

  /** The wing carpet (`stage.carpet`): pale chevrons strewn on the floor, denser in the middle, all still. */
  private drawCarpet(g: Graphics): void {
    const c = this.stage?.carpet;
    if (!c) return;
    const W = STAGING.carpet;
    const span = Math.max(1, c.x1 - c.x0);
    const n = c.count ?? Math.round(span / W.every);
    for (let i = 0; i < n; i++) {
      // Hashed, not random: the same carpet every frame and every screenshot.
      const h1 = fract(Math.sin(i * 12.9898 + c.x0 * 0.013) * 43758.5453);
      const h2 = fract(Math.sin(i * 78.233 + c.y * 0.007) * 24634.6345);
      const h3 = fract(Math.sin(i * 37.719) * 12345.678);
      // Bunched toward the middle (two draws averaged), a few lying on top of the others.
      const u = (h1 + h2) / 2;
      const x = c.x0 + u * span;
      const y = c.y - 2 - h3 * W.pile * (1 - Math.abs(u - 0.5) * 2);
      const len = W.len * (0.7 + 0.5 * h2);
      const ang = (h3 - 0.5) * 0.9 + (h1 < 0.5 ? 0 : Math.PI);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      // One wing: a long narrow chevron, a vein down it.
      const pt = (a: number, b: number): [number, number] => [x + ca * a - sa * b, y + sa * a + ca * b];
      const [ax, ay] = pt(0, 0);
      const [bx, by] = pt(len * 0.55, -len * 0.22);
      const [tx, ty] = pt(len, -len * 0.05);
      const [dx, dy] = pt(len * 0.5, len * 0.12);
      g.moveTo(ax, ay).lineTo(bx, by).lineTo(tx, ty).lineTo(dx, dy).closePath();
      g.fill({ color: h2 < 0.3 ? C.wing : C.dead, alpha: W.alpha * (0.6 + 0.4 * h1) });
      g.moveTo(ax, ay).lineTo(tx, ty).stroke({ color: 0x3e4350, width: 1, alpha: 0.5 });
    }
  }

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

/** The fractional part (hashing). */
function fract(v: number): number {
  return v - Math.floor(v);
}

/** Cache for `areaShare`: the save's snuffed count and the room it was worked out for. */
const SHARE = { key: '', share: 0 };

/**
 * The share of her area's moths she has freed (0..1): the lamps she has put out in every room of the area she is
 * in, weighted by the moths each frees (the HUD's tally, hud/moths.ts, without needing the moth-stone read).
 */
export function areaShare(sim: SimView): number {
  const key = `${sim.scene.id}:${sim.save.snuffed.length}`;
  if (key === SHARE.key) return SHARE.share;
  const a = WORLD.areas.find((x) => x.rooms.includes(sim.scene.id));
  let all = 0;
  let freed = 0;
  for (const id of a?.rooms ?? []) {
    let room: ReturnType<typeof getRoom>;
    try {
      room = getRoom(id);
    } catch {
      continue;
    }
    for (const l of room.lures ?? []) {
      const m = Math.round(tuning.lures.kinds[l.kind]?.moths ?? 0);
      all += m;
      if (sim.save.snuffed.includes(`${id}:${l.id}`)) freed += m;
    }
  }
  SHARE.key = key;
  SHARE.share = all > 0 ? freed / all : 0;
  return SHARE.share;
}
