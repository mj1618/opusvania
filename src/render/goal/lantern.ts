/**
 * A moth-lantern: a slender shepherd's crook of dark wood rising from a small knot of roots, with a
 * seed of glass hanging from the curl on a short thread. It is the big sister of the HUD's health
 * lights (the same teardrop on a curled filament) and of the lantern tips of her antennae.
 *
 * Dormant it is cold and a little overgrown: a creeper up the stem, a web across the crook, a dead
 * leaf or a beard of moss. Lit, the glass warms from below and its rim turns gold; the web burns
 * away. The light itself (bead, halo, ember) is drawn by the goal renderer's batch at `beadX/Y`.
 *
 * Drawn once with Graphics (crisp at any zoom); per frame only the glass's swing and two alphas.
 */
import { Container, Graphics } from 'pixi.js';
import { TONES, tone } from '../pickups/holder';
import { zoneWeights } from '../scene/lib/fx-zones';
import { GOAL } from './config';
import { bezier, Path } from './logic';

/** How one lantern differs from its sisters. */
export interface LanternStyle {
  /** Which way the crook curls: the glass hangs on this side of the stem. */
  side: 1 | -1;
  /** Height of the crook's top above the foot, px. */
  height: number;
  /** How far the top leans the way it curls, and how far the curl reaches out, px. */
  lean: number;
  over: number;
  /** The stem stands this far to the glass's side of the sim's point, so she never stands on it, px. */
  shift: number;
  /** What has grown on it. */
  extra: 'web' | 'fern' | 'moss';
}

/** By index in `scene.lanterns`: by the moth-stone, on the trunk's crown, on the far ledge. */
export const STYLES: readonly LanternStyle[] = [
  { side: 1, height: 138, lean: 6, over: 20, shift: 10, extra: 'web' },
  { side: 1, height: 118, lean: 10, over: 24, shift: 12, extra: 'fern' },
  { side: -1, height: 146, lean: 8, over: 22, shift: 10, extra: 'moss' },
];

const WOOD = [0x0b2026, 0x0b1107, 0x121a36] as const;
const WOOD_RIM = [0x3f8a86, 0xa9a860, 0x6274ac] as const;
const GLASS = [0x0d2029, 0x090e07, 0x0b0e22] as const;
const GLASS_RIM = [0x8ab4bd, 0xa8a67a, 0x9096c8] as const;
const WEB = 0xc4dade;

/** The seed of glass, relative to the point it hangs from (y down). */
const THREAD = 5;
const S = 1.62;
const TOP = THREAD;
const R = 7.6 * S;
const BELLY = TOP + 15.5 * S;
const BOTTOM = TOP + 24 * S;
/** Where the light sits in it. */
export const CORE = TOP + 17.6 * S;

function seed(g: Graphics, k = 1): Graphics {
  // Scaled about the bottom, so a smaller seed sits low in the belly.
  const y = (v: number): number => BOTTOM - (BOTTOM - v) * k;
  const r = R * k;
  g.moveTo(0, y(TOP));
  g.bezierCurveTo(1.6 * k, y(TOP + 5.5 * S), r, y(BELLY - 6.5 * S), r, y(BELLY));
  g.bezierCurveTo(r, y(BELLY + 5.2 * S), r * 0.55, y(BOTTOM), 0, y(BOTTOM));
  g.bezierCurveTo(-r * 0.55, y(BOTTOM), -r, y(BELLY + 5.2 * S), -r, y(BELLY));
  g.bezierCurveTo(-r, y(BELLY - 6.5 * S), -1.6 * k, y(TOP + 5.5 * S), 0, y(TOP));
  g.closePath();
  return g;
}

/** A tapered ribbon along a polyline: half-width `w0` at the start to `w1` at the end. */
function ribbon(g: Graphics, xs: readonly number[], ys: readonly number[], w0: number, w1: number): Graphics {
  const n = xs.length;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tx = (xs[b] as number) - (xs[a] as number);
    let ty = (ys[b] as number) - (ys[a] as number);
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const w = w0 + ((w1 - w0) * i) / (n - 1);
    left.push((xs[i] as number) - ty * w, (ys[i] as number) + tx * w);
    right.unshift((xs[i] as number) + ty * w, (ys[i] as number) - tx * w);
  }
  return g.poly([...left, ...right], true);
}

function line(g: Graphics, xs: readonly number[], ys: readonly number[], dx = 0, dy = 0): Graphics {
  g.moveTo((xs[0] as number) + dx, (ys[0] as number) + dy);
  for (let i = 1; i < xs.length; i++) g.lineTo((xs[i] as number) + dx, (ys[i] as number) + dy);
  return g;
}

/** A small pointed leaf from (x, y) along `ang`, `len` long. */
function leaf(g: Graphics, x: number, y: number, ang: number, len: number, wide: number): Graphics {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const px = -s * wide;
  const py = c * wide;
  g.moveTo(x, y);
  g.quadraticCurveTo(x + c * len * 0.45 + px, y + s * len * 0.45 + py, x + c * len, y + s * len);
  g.quadraticCurveTo(x + c * len * 0.45 - px, y + s * len * 0.45 - py, x, y);
  g.closePath();
  return g;
}

/** A seed of glass on its thread, hanging from (0, 0): the dark husk and, over it, its lit state (alpha 0). */
export function makeGlass(
  w: readonly [number, number, number],
  wood: number,
  rim: number,
): { root: Container; lit: Graphics } {
  const root = new Container();
  const gl = new Graphics();
  gl.moveTo(0, -1)
    .lineTo(0, TOP + 1)
    .stroke({ width: 1.1, color: wood, cap: 'round' });
  seed(gl).fill({ color: tone(GLASS, w), alpha: 0.93 });
  // Paler toward the shoulder, so the glass has a body against a dark stand.
  seed(gl, 0.97).fill({ color: tone(GLASS_RIM, w), alpha: 0.04 });
  seed(gl, 0.6).fill({ color: tone(GLASS, w), alpha: 0.6 });
  seed(gl).stroke({ width: 1.1, color: tone(GLASS_RIM, w), alpha: 0.6 });
  // A sliver of sheen inside the lit-side shoulder.
  gl.moveTo(-1.9, TOP + 8.5)
    .bezierCurveTo(-4.3, TOP + 11.5, -5.9, BELLY - 4, -5.7, BELLY + 0.8)
    .stroke({ width: 0.9, color: tone(GLASS_RIM, w), alpha: 0.3, cap: 'round' });
  // The calyx: two bracts clasp the shoulder.
  for (const side of [-1, 1]) {
    gl.moveTo(0, TOP - 1.2)
      .quadraticCurveTo(side * 4.6, TOP + 2.6, side * 6.6, TOP + 10.6)
      .quadraticCurveTo(side * 2.6, TOP + 7.4, side * 0.3, TOP + 4)
      .closePath()
      .fill({ color: wood })
      .stroke({ width: 0.6, color: rim, alpha: side < 0 ? 0.5 : 0.25 });
  }
  // Lit: the glass warms from below and its rim turns gold.
  const lit = new Graphics();
  seed(lit, 0.94).fill({ color: 0x5a2408, alpha: 0.34 });
  seed(lit, 0.7).fill({ color: 0x9a4812, alpha: 0.4 });
  seed(lit, 0.46).fill({ color: 0xd07a26, alpha: 0.36 });
  seed(lit).stroke({ width: 1.05, color: 0xf2b468, alpha: 0.72 });
  lit.ellipse(-4.1, BELLY - 5, 0.8, 1.9).fill({ color: 0xfff0d8, alpha: 0.4 });
  lit.alpha = 0;
  root.addChild(gl, lit);
  return { root, lit };
}

export const WOOD_TONES = { wood: WOOD, rim: WOOD_RIM } as const;
export { leaf, line, ribbon };

export class LanternView {
  readonly root = new Container();
  /** The way light climbs it: from the foot up the stem, over the crook and down into the glass (world px). */
  readonly path = new Path();
  /** Where the light sits this frame, and the top of the crook (world px). */
  beadX: number;
  beadY: number;
  readonly topX: number;
  readonly topY: number;
  /** 0 cold .. 1 lit: the glass's warmth. */
  warmth = 0;
  /** 1 = overgrown with web, 0 = burnt away. */
  web = 1;
  readonly style: LanternStyle;
  private readonly glass: Container;
  private readonly litG: Graphics;
  private readonly webG = new Graphics();
  private readonly hangX: number;
  private readonly hangY: number;
  private angle = 0;
  private spin = 0;
  /** Where the stem stands (world x). */
  readonly ox: number;
  /** 0..1: a cold glint on the dormant glass, and how far the creeper has leafed out. */
  glint = 0;
  life = 0;
  private readonly glintG = new Graphics();
  private readonly lifeG = new Graphics();

  constructor(
    readonly x: number,
    readonly y: number,
    index: number,
  ) {
    const st = STYLES[index % STYLES.length] as LanternStyle;
    this.style = st;
    const w = zoneWeights(x);
    const wood = tone(WOOD, w);
    const rim = tone(WOOD_RIM, w);
    const H = st.height;
    const sx = st.side;
    const ox = x + st.shift * sx;
    this.ox = ox;
    const L = st.lean;
    const O = st.lean + st.over;

    // --- The stem: three curves, foot -> shoulder -> over the top -> the curl.
    const stem = new Path();
    bezier(stem, [-6, 3, -13 - L * 0.3, -0.36 * H, -10 + L * 0.5, -0.78 * H, -2 + L, -0.95 * H], 18);
    const shoulder = stem.xs.length;
    bezier(stem, [-2 + L, -0.95 * H, 1 + L, -1.08 * H, 15 + O, -1.11 * H, 19 + O, -0.99 * H], 12);
    const over = stem.xs.length;
    bezier(stem, [19 + O, -0.99 * H, 21 + O, -0.9 * H, 12 + O, -0.875 * H, 10.5 + O, -0.935 * H], 10);
    const xs = stem.xs.map((v) => v * sx);
    const ys = stem.ys;
    // The glass hangs from the bottom of the curl.
    const hang = over + 4;
    this.hangX = xs[hang] as number;
    this.hangY = (ys[hang] as number) + 1;
    let top = 0;
    for (let i = 0; i < ys.length; i++) if ((ys[i] as number) < (ys[top] as number)) top = i;
    this.topX = ox + (xs[top] as number);
    this.topY = y + (ys[top] as number) - 2;

    const g = new Graphics();
    // The knot of roots it stands in.
    const root = (x1: number, y1: number, bend: number, w0: number): void => {
      const p = new Path();
      bezier(p, [-6, -9, -6 + (x1 + 6) * 0.3, -9 + bend, x1 * 0.8, y1 - 6, x1, y1], 8);
      ribbon(
        g,
        p.xs.map((v) => v * sx),
        p.ys,
        w0,
        0.7,
      ).fill({ color: wood });
    };
    root(-25, 4, -4, 2.6);
    root(11, 5, -5, 2.3);
    root(-1, 6, 2, 2.8);
    root(-15, 5, 1, 2);
    g.ellipse(-6 * sx, 1, 8, 4.5).fill({ color: wood });
    // The stem itself.
    ribbon(g, xs, ys, 4.9, 1.4).fill({ color: wood });
    const tip = xs.length - 1;
    g.circle(xs[tip] as number, ys[tip] as number, 2.2).fill({ color: wood });
    // Two knuckles where old shoots were.
    for (const k of [0.36, 0.62]) {
      const i = Math.round(shoulder * k);
      g.circle((xs[i] as number) - 1.6 * sx, ys[i] as number, 4.2 - k * 1.6).fill({ color: wood });
    }
    // The key light catches its upper left edge.
    line(g, xs.slice(2, over + 3), ys.slice(2, over + 3), -1.9, -0.6).stroke({
      width: 1.2,
      color: rim,
      alpha: 0.42,
      cap: 'round',
      join: 'round',
    });

    // --- A creeper winds up the lower stem (it stays when the lantern is lit).
    const leafTone = tone(TONES.leaf, w);
    const leafLit = tone(TONES.lit, w);
    const vine = new Path();
    const turns = 2.4;
    const upTo = Math.round(shoulder * 0.62);
    for (let i = 1; i <= upTo; i++) {
      const k = i / upTo;
      vine.add((xs[i] as number) + Math.sin(k * turns * 6.283) * 3.4 * (1 - 0.4 * k), ys[i] as number);
    }
    line(g, vine.xs, vine.ys).stroke({ width: 1.1, color: leafTone, alpha: 0.95, cap: 'round' });
    const out = [0, 0, 0, 0];
    for (const [k, dir, len] of [
      [0.24, -1, 8],
      [0.52, 1, 7],
      [0.8, -1, 6.5],
      [0.98, 1, 5.5],
    ] as const) {
      vine.sample(k, out);
      const a = -Math.PI / 2 + dir * sx * 1.05;
      leaf(g, out[0] as number, out[1] as number, a, len, 2.6).fill({ color: leafTone });
      leaf(g, out[0] as number, out[1] as number, a, len * 0.9, 0.5).fill({ color: leafLit, alpha: 0.3 });
    }

    // --- What else has grown on it.
    if (st.extra === 'fern') {
      // Two fronds of the crown's ferns at its foot.
      for (const [dx, lean, len] of [
        [-15, -0.55, 30],
        [9, 0.5, 24],
      ] as const) {
        const p = new Path();
        const ex = dx + Math.sin(lean) * len;
        bezier(p, [dx * 0.4, 2, dx * 0.7, -len * 0.5, ex * 0.9, -len * 0.85, ex * 1.25, -len * 0.74], 8);
        ribbon(
          g,
          p.xs.map((v) => v * sx),
          p.ys,
          2.4,
          0.4,
        ).fill({ color: leafTone });
        for (let i = 2; i < p.xs.length - 1; i++) {
          const fx = (p.xs[i] as number) * sx;
          const fy = p.ys[i] as number;
          const l = 7.5 * (1 - (i / p.xs.length) * 0.7);
          leaf(g, fx, fy, -Math.PI / 2 + lean * sx - 1.1, l, 1.5).fill({ color: leafTone });
          leaf(g, fx, fy, -Math.PI / 2 + lean * sx + 1.1, l, 1.5).fill({ color: leafTone });
        }
      }
    } else if (st.extra === 'moss') {
      // A beard of moss off the crook.
      for (const [i, len] of [
        [shoulder + 4, 15],
        [shoulder + 7, 23],
        [shoulder + 9, 12],
      ] as const) {
        const mx = xs[i] as number;
        const my = (ys[i] as number) + 1;
        g.moveTo(mx, my)
          .quadraticCurveTo(mx - 2.2 * sx, my + len * 0.6, mx + 0.6 * sx, my + len)
          .stroke({ width: 1.5, color: leafTone, alpha: 0.95, cap: 'round' });
      }
    }
    this.root.addChild(g);

    // --- The web across the crook (burns away when the lamp catches), and a dead leaf caught in it.
    const wg = this.webG;
    const a1 = shoulder - 5;
    const b1 = over - 1;
    const web = (i: number, j: number, sag: number): void => {
      const x0 = xs[i] as number;
      const y0 = ys[i] as number;
      const x1 = xs[j] as number;
      const y1 = ys[j] as number;
      wg.moveTo(x0, y0)
        .quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1)
        .stroke({ width: 0.7, color: WEB, alpha: 0.3, cap: 'round' });
    };
    web(a1, b1, 5);
    web(a1 + 3, tip, 3);
    web(a1 - 5, hang, 7);
    web(shoulder + 2, tip, 1.5);
    if (st.extra !== 'fern') {
      const lx = ((xs[a1] as number) + (xs[b1] as number)) / 2;
      const ly = ((ys[a1] as number) + (ys[b1] as number)) / 2 + 4;
      leaf(wg, lx, ly, 1.9 * sx, 7, 2.2).fill({ color: tone(TONES.front, w), alpha: 0.95 });
    }
    this.root.addChild(wg);

    // --- The glass on its thread.
    const glass = makeGlass(w, wood, rim);
    this.litG = glass.lit;
    this.glass = glass.root;
    // A cold glint on the shoulder of the dormant glass: what finds it from a screen away.
    const gg = this.glintG;
    const gh = 6.5;
    gg.poly(
      [0, -gh, 0.9, -0.9, gh * 0.55, 0, 0.9, 0.9, 0, gh, -0.9, 0.9, -gh * 0.55, 0, -0.9, -0.9],
      true,
    ).fill({
      color: 0xd8f0f6,
    });
    gg.position.set(-R * 0.45, BELLY - 7);
    this.glass.addChild(gg);
    this.glass.position.set(this.hangX, this.hangY);
    // Lit, the creeper leafs out and flowers.
    const lf = this.lifeG;
    for (const [k, dir, len] of [
      [0.12, 1, 9],
      [0.38, -1, 10],
      [0.66, 1, 9],
      [0.9, -1, 8],
      [0.99, -1, 7],
    ] as const) {
      vine.sample(k, out);
      const a = -Math.PI / 2 + dir * sx * 0.9;
      leaf(lf, out[0] as number, out[1] as number, a, len, 3).fill({ color: leafLit, alpha: 0.9 });
      const bx = (out[0] as number) + Math.cos(a) * (len + 1.5);
      const by = (out[1] as number) + Math.sin(a) * (len + 1.5);
      lf.circle(bx, by, 1.7).fill({ color: 0xffd9a0 });
    }
    this.root.addChild(lf);
    this.root.addChild(this.glass);
    this.root.position.set(ox, y);

    // --- The way light climbs: stem to the bottom of the curl, down the thread into the belly.
    for (let i = 1; i <= hang; i++) this.path.add(ox + (xs[i] as number), y + (ys[i] as number));
    this.path.add(ox + this.hangX, y + this.hangY + TOP + 3);
    this.path.add(ox + this.hangX, y + this.hangY + CORE);
    this.beadX = ox + this.hangX;
    this.beadY = y + this.hangY + CORE;
  }

  /** A push on the glass (rad/s). */
  kick(v: number): void {
    this.spin += v;
  }

  /** `rest` = the angle the wind (and her nearness) holds the glass at. */
  update(dt: number, rest: number): void {
    const L = GOAL.lantern;
    const step = Math.min(dt, 1 / 30);
    this.spin += (-L.swingK * (this.angle - rest) - L.swingC * this.spin) * step;
    this.angle += this.spin * step;
    this.glass.rotation = this.angle;
    this.beadX = this.ox + this.hangX - Math.sin(this.angle) * CORE;
    this.beadY = this.y + this.hangY + Math.cos(this.angle) * CORE;
    this.litG.alpha = this.warmth;
    this.litG.visible = this.warmth > 0.004;
    this.glintG.alpha = this.glint;
    this.glintG.visible = this.glint > 0.01;
    this.lifeG.alpha = this.life;
    this.lifeG.visible = this.life > 0.01;
    this.lifeG.scale.set(1, 0.6 + 0.4 * this.life);
    this.webG.alpha = this.web;
    this.webG.visible = this.web > 0.004;
  }
}

/**
 * The small moth that rests on the lantern she re-forms at: it comes to the light when she makes it
 * hers and leaves when another takes its place.
 */
export class Moth {
  readonly root = new Container();
  /** 0 away, 1 coming, 2 resting, 3 leaving. */
  state: 0 | 1 | 2 | 3 = 0;
  private t = 0;
  private readonly left = new Graphics();
  private readonly right = new Graphics();

  constructor(private readonly seed: number) {
    for (const [g, s] of [
      [this.left, -1],
      [this.right, 1],
    ] as const) {
      g.moveTo(0, 0.4)
        .bezierCurveTo(s * 3.5, -3.4, s * 9.4, -4.6, s * 11, -1.6)
        .bezierCurveTo(s * 10.4, 0.6, s * 6, 1.6, s * 5, 1.8)
        .bezierCurveTo(s * 6.4, 3.8, s * 3.8, 5.2, s * 1.3, 3.2)
        .closePath()
        .fill({ color: 0xcfa878, alpha: 0.92 });
      g.moveTo(s * 1.2, -0.4)
        .quadraticCurveTo(s * 5.6, -2.6, s * 9.2, -2.2)
        .stroke({ width: 0.6, color: 0x5a3a20, alpha: 0.55 });
      this.root.addChild(g);
    }
    const body = new Graphics();
    body.ellipse(0, 0.6, 1.25, 3.3).fill({ color: 0x2a1c14 });
    this.root.addChild(body);
    this.root.visible = false;
  }

  /** Have it be there (or not): it flies in or away by itself. `now` = no flight (a state jump). */
  want(on: boolean, now = false): void {
    if (on && (this.state === 0 || this.state === 3)) {
      this.state = now ? 2 : 1;
      this.t = 0;
    } else if (!on && (this.state === 1 || this.state === 2)) {
      this.state = now ? 0 : 3;
      this.t = 0;
    }
  }

  /** One of the moths that circle a lit glass: no state, a tilted loop round (cx, cy). `a` = how present. */
  orbit(clock: number, cx: number, cy: number, r: number, a: number): void {
    this.root.visible = a > 0.01;
    if (a <= 0.01) return;
    const sp = 1.1 + this.seed * 0.9;
    const ang = clock * sp + this.seed * 20;
    const wob = Math.sin(clock * 0.7 + this.seed * 9);
    this.root.position.set(cx + Math.cos(ang) * r * (1 + 0.25 * wob), cy + Math.sin(ang) * r * 0.5 + wob * 7);
    this.root.rotation = -Math.sin(ang) * 0.5;
    this.root.alpha = a * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(ang)));
    this.root.scale.set(0.8);
    const flap = Math.abs(Math.sin(clock * 27 + this.seed * 5));
    this.left.scale.x = flap;
    this.right.scale.x = flap;
  }

  update(dt: number, clock: number, px: number, py: number): void {
    if (this.state === 0) {
      this.root.visible = false;
      return;
    }
    this.t += dt;
    let x = px;
    let y = py;
    let flap = 0.74 + 0.24 * Math.sin(clock * 1.25 + this.seed * 9);
    // Now and then a resting moth shivers its wings.
    const shiver = (clock * 0.21 + this.seed) % 1;
    if (shiver < 0.07) flap = 0.55 + 0.4 * Math.abs(Math.sin(shiver * 190));
    let alpha = 1;
    let tilt = 0;
    if (this.state === 1 || this.state === 3) {
      const dur = this.state === 1 ? 1.7 : 1.2;
      const k = Math.min(1, this.t / dur);
      // In: a closing spiral down onto the crook. Out: up and away.
      const far = this.state === 1 ? (1 - k) ** 1.6 : k ** 1.5;
      const ang = this.seed * 6 + (this.state === 1 ? 1 - k : k) * 7.5;
      x = px + Math.cos(ang) * 46 * far + (this.seed - 0.5) * 60 * far;
      y = py - 96 * far + Math.sin(ang) * 16 * far;
      flap =
        Math.abs(Math.sin(clock * 34 + this.seed * 5)) * (far > 0.04 ? 1 : 0) + (far > 0.04 ? 0.08 : flap);
      tilt = Math.cos(ang) * 0.5 * far;
      alpha = this.state === 1 ? Math.min(1, k * 5) : 1 - k * k;
      if (k >= 1) this.state = this.state === 1 ? 2 : 0;
    }
    this.root.visible = this.state !== 0;
    this.root.position.set(x, y - 2.5);
    this.root.rotation = tilt;
    this.root.alpha = alpha;
    this.left.scale.x = flap;
    this.right.scale.x = flap;
  }
}
