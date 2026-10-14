// biome-ignore-all lint/style/noNonNullAssertion: point arrays indexed in range
/**
 * The fox of the prologue (the vixen's mate): a dark fox at moth scale, huge beside two moths.
 * Drawn in code on a simple four-legged body in the Yako skin's colours (src/render/character/yako:
 * the dusk-violet fur, a rust saddle, a pale throat, an ember at the tail's tip). Poses, all 0..1
 * and blended by the caller: `curl` (asleep, curled, the tail round its nose), `walk` (a phase in
 * cycles), `drink` (head down over the water), `shake` (a head shake), `sneeze` (a jerk back),
 * `sink` (down into the ground, eyes closing), `breath` (its flank rising and falling).
 * Feet on y = 0 at x = 0, facing +x; the caller places and flips the container.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture } from '../world/paint';

const FUR = 0x2e2430;
const FUR_SH = 0x1c1620;
const FUR_FAR = 0x120e16;
const RUST = 0x4a2a26;
const PALE = 0x8e857c;
const INK = 0x0b0910;
const EMBER = 0xff8a3a;

export interface FoxPose {
  curl: number;
  walk: number;
  walking: number;
  drink: number;
  shake: number;
  sneeze: number;
  sink: number;
  breath: number;
  /** Eyes 0 shut .. 1 open. */
  eyes: number;
  /** The tail's ember 0 grey .. 1 alight. */
  ember: number;
}

export function foxPose(): FoxPose {
  return {
    curl: 1,
    walk: 0,
    walking: 0,
    drink: 0,
    shake: 0,
    sneeze: 0,
    sink: 0,
    breath: 0,
    eyes: 0,
    ember: 1,
  };
}

type P = [number, number];

const rot = (p: P, o: P, a: number): P => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p[0] - o[0];
  const dy = p[1] - o[1];
  return [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c];
};

/** A smooth closed shape through points (quadratic midpoints). */
function blobPath(g: Graphics, pts: readonly P[]): Graphics {
  const n = pts.length;
  const m = (i: number): P => {
    const a = pts[i % n]!;
    const b = pts[(i + 1) % n]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const s = m(n - 1);
  g.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) {
    const c = pts[i]!;
    const e = m(i);
    g.quadraticCurveTo(c[0], c[1], e[0], e[1]);
  }
  return g.closePath();
}

/** A tapered limb from `a` to `b`, widths `w0` to `w1`. */
function limb(g: Graphics, a: P, k: P, b: P, w0: number, w1: number, color: number): void {
  const seg = (p: P, q: P, wa: number, wb: number): void => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    g.poly([
      p[0] + nx * wa,
      p[1] + ny * wa,
      q[0] + nx * wb,
      q[1] + ny * wb,
      q[0] - nx * wb,
      q[1] - ny * wb,
      p[0] - nx * wa,
      p[1] - ny * wa,
    ]).fill(color);
    g.circle(q[0], q[1], wb).fill(color);
  };
  seg(a, k, w0, (w0 + w1) / 2);
  seg(k, b, (w0 + w1) / 2, w1);
}

/** Fur: small tufts standing out along a run of outline points (outward = to the left of travel). */
function tufts(
  g: Graphics,
  pts: readonly P[],
  size: number,
  color: number,
  alpha: number,
  seed: number,
): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const n = Math.max(1, Math.round(l / (size * 0.9)));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const x = a[0] + dx * u;
      const y = a[1] + dy * u;
      const h = size * (0.7 + 0.6 * Math.abs(Math.sin((i * 7 + k) * 1.7 + seed)));
      const nx = dy / l;
      const ny = -dx / l;
      const lean = 0.5;
      g.poly([
        x - (dx / l) * size * 0.45,
        y - (dy / l) * size * 0.45,
        x + nx * h + (dx / l) * h * lean,
        y + ny * h + (dy / l) * h * lean,
        x + (dx / l) * size * 0.45,
        y + (dy / l) * size * 0.45,
      ]).fill({ color, alpha });
    }
  }
}

export class Fox {
  readonly view = new Container({ label: 'fox' });
  private readonly g = new Graphics();
  private readonly ember: Sprite;
  private readonly emberHalo: Sprite;
  private readonly mask = new Graphics();
  /** Where the tail's ember is, in the fox's own px (for a light). */
  readonly tip: P = [0, 0];

  constructor() {
    const t = glowTexture();
    this.emberHalo = new Sprite(t);
    this.emberHalo.anchor.set(0.5);
    this.emberHalo.blendMode = 'add';
    this.emberHalo.tint = EMBER;
    this.ember = new Sprite(t);
    this.ember.anchor.set(0.5);
    this.ember.blendMode = 'add';
    this.ember.tint = 0xffd0a0;
    this.view.addChild(this.g, this.emberHalo, this.ember);
    // Nothing of it shows below the ground line (it sinks into the hollow).
    this.mask.rect(-600, -600, 1200, 604).fill(0xffffff);
    this.view.addChild(this.mask);
    this.g.mask = this.mask;
  }

  draw(o: FoxPose, clock: number): void {
    const g = this.g;
    g.clear();
    const down = o.sink * 190;
    const b = 1 + 0.035 * Math.sin(o.breath);
    if (o.curl > 0.01) this.curled(g, down, b, o, clock);
    if (o.curl < 0.99) this.standing(g, down, b, o, clock);
    // The tail's ember (its place set by the pose drawn).
    const e = Math.max(0, Math.min(1, o.ember));
    const k = 0.8 + 0.2 * Math.sin(clock * 1.7);
    this.ember.position.set(this.tip[0], this.tip[1]);
    this.emberHalo.position.set(this.tip[0], this.tip[1]);
    this.ember.setSize(16, 16);
    this.emberHalo.setSize(90, 90);
    this.ember.alpha = (0.15 + 0.85 * e) * k * (1 - o.sink * 0.6);
    this.emberHalo.alpha = 0.32 * e * k * (1 - o.sink);
    this.ember.tint = e > 0.3 ? 0xffd0a0 : 0x9a9aa0;
  }

  /** Asleep: a round mound of fur, head down at the front, the bushy tail brought round over its nose, ears up. */
  private curled(g: Graphics, down: number, b: number, o: FoxPose, clock: number): void {
    const a = o.curl;
    const y0 = down;
    // Body: higher at the haunch (back, left), sloping to the shoulder at the front.
    const back: P[] = [
      [-128, y0 - 4],
      [-142, y0 - 44 * b],
      [-118, y0 - 86 * b],
      [-62, y0 - 108 * b],
      [0, y0 - 104 * b],
      [44, y0 - 90 * b],
      [70, y0 - 70 * b],
      [96, y0 - 30],
      [100, y0 - 4],
    ];
    blobPath(g, back).fill({ color: FUR, alpha: a });
    // The rust saddle and a soft lit ridge along the back.
    blobPath(g, [
      [-120, y0 - 80 * b],
      [-62, y0 - 104 * b],
      [10, y0 - 100 * b],
      [-20, y0 - 86 * b],
      [-90, y0 - 70 * b],
    ]).fill({ color: RUST, alpha: 0.8 * a });
    tufts(g, back.slice(1, 7), 9, FUR, a, 1);
    // The head, laid down at the front, muzzle to the right and down, half under the tail.
    const hx = 76;
    const hy = y0 - 54;
    const head: P[] = [
      [hx - 34, hy + 8],
      [hx - 30, hy - 22],
      [hx - 4, hy - 34],
      [hx + 26, hy - 26],
      [hx + 52, hy - 4],
      [hx + 70, hy + 14],
      [hx + 40, hy + 26],
      [hx, hy + 24],
    ];
    blobPath(g, head).fill({ color: FUR_SH, alpha: a });
    blobPath(g, [
      [hx + 20, hy + 8],
      [hx + 50, hy + 4],
      [hx + 68, hy + 14],
      [hx + 40, hy + 24],
    ]).fill({ color: PALE, alpha: 0.45 * a });
    g.circle(hx + 70, hy + 13, 3.5).fill({ color: INK, alpha: a });
    // Ears, up and pointed (the near one twitches now and then).
    const tw = Math.sin(clock * 0.37) > 0.96 ? 4 : 0;
    g.poly([hx - 20, hy - 24, hx - 16, hy - 74, hx + 2, hy - 30]).fill({ color: FUR_SH, alpha: a });
    g.poly([hx - 2, hy - 32, hx + 10 + tw, hy - 80, hx + 22, hy - 28]).fill({ color: FUR, alpha: a });
    g.poly([hx + 3, hy - 34, hx + 10 + tw, hy - 68, hx + 17, hy - 32]).fill({ color: RUST, alpha: 0.75 * a });
    // The shut eye.
    g.moveTo(hx + 22, hy - 10)
      .quadraticCurveTo(hx + 30, hy - 6, hx + 38, hy - 10)
      .stroke({ color: INK, width: 2, alpha: a });
    // The tail: thick and bushy, from the haunch round the bottom to lie over the muzzle, its tip pale.
    const tail: P[] = [
      [-132, y0 - 30],
      [-120, y0 + 2],
      [-20, y0 + 4],
      [80, y0 + 2],
      [140, y0 - 6],
      [158, y0 - 28],
      [140, y0 - 44],
      [104, y0 - 36],
      [40, y0 - 26],
      [-40, y0 - 24],
      [-110, y0 - 22],
    ];
    blobPath(g, tail).fill({ color: FUR_SH, alpha: a });
    tufts(g, tail.slice(4, 9), 8, FUR_SH, a, 3);
    blobPath(g, [
      [130, y0 - 4],
      [158, y0 - 28],
      [146, y0 - 44],
      [124, y0 - 36],
      [116, y0 - 18],
    ]).fill({ color: PALE, alpha: 0.8 * a });
    if (a >= 0.5) {
      this.tip[0] = 150;
      this.tip[1] = y0 - 26;
    }
  }

  /** Up: standing, walking, drinking, shaking its head, sneezing, sinking. */
  private standing(g: Graphics, down: number, b: number, o: FoxPose, clock: number): void {
    const a = 1 - o.curl;
    const y0 = down;
    const ph = o.walk * Math.PI * 2;
    const w = o.walking;
    // Legs: far pair first (darker), a trot when walking.
    const legs: Array<[number, number, number]> = [
      [-80, 0.5, 1],
      [60, 0, 1],
      [-70, 0, 0],
      [70, 0.5, 0],
    ];
    const legPts = (hipX: number, off: number): [P, P, P] => {
      const s = Math.sin(ph + off * Math.PI * 2) * w;
      const lift = Math.max(0, Math.cos(ph + off * Math.PI * 2)) * 14 * w;
      const hip: P = [hipX, y0 - 92];
      const knee: P = [hipX + 6 + s * 16, y0 - 48 - lift * 0.5];
      const foot: P = [hipX + s * 30, y0 - lift];
      return [hip, knee, foot];
    };
    for (const [x, off, far] of legs) {
      if (!far) continue;
      const [h, k, f] = legPts(x, off);
      limb(g, h, k, f, 9, 3.5, FUR_FAR);
    }
    // The tail: long, low, swaying; its tip pale, the ember at the end.
    const sway = Math.sin(clock * 1.3) * 10 + Math.sin(ph) * 6 * w;
    const tail: P[] = [
      [-110, y0 - 110],
      [-170, y0 - 124 + sway * 0.3],
      [-240, y0 - 106 + sway],
      [-290, y0 - 70 + sway],
      [-268, y0 - 44 + sway],
      [-200, y0 - 58 + sway * 0.6],
      [-120, y0 - 80],
    ];
    blobPath(g, tail).fill({ color: FUR_SH, alpha: a });
    tufts(g, tail.slice(1, 4), 10, FUR_SH, a, 2);
    blobPath(g, [
      [-246, y0 - 86 + sway],
      [-282, y0 - 64 + sway],
      [-262, y0 - 52 + sway],
      [-238, y0 - 66 + sway],
    ]).fill({ color: PALE, alpha: 0.75 * a });
    if (a > 0.5) {
      this.tip[0] = -280;
      this.tip[1] = y0 - 60 + sway;
    }
    // Body: deep chest, tucked belly; breathing.
    const body: P[] = [
      [-128, y0 - 96],
      [-112, y0 - 128 * b],
      [-30, y0 - 136 * b],
      [60, y0 - 130 * b],
      [104, y0 - 116],
      [104, y0 - 80],
      [60, y0 - 70],
      [-40, y0 - 76],
      [-118, y0 - 80],
    ];
    blobPath(g, body).fill({ color: FUR, alpha: a });
    tufts(g, body.slice(0, 5), 8, FUR, a, 4);
    blobPath(g, [
      [-100, y0 - 122 * b],
      [-20, y0 - 136 * b],
      [60, y0 - 130 * b],
      [0, y0 - 120 * b],
    ]).fill({ color: RUST, alpha: 0.4 * a });
    // A paler belly.
    blobPath(g, [
      [-60, y0 - 80],
      [0, y0 - 74],
      [70, y0 - 74],
      [96, y0 - 84],
      [40, y0 - 92],
    ]).fill({ color: PALE, alpha: 0.25 * a });
    // Near legs.
    for (const [x, off, far] of legs) {
      if (far) continue;
      const [h, k, f] = legPts(x, off);
      limb(g, h, k, f, 10, 4, FUR_SH);
      limb(g, [(k[0] + f[0]) / 2, (k[1] + f[1]) / 2], [f[0] - 1, f[1] - 6], f, 4.5, 4.5, INK);
    }
    // Neck and head: pitched down to drink, shaken, jerked back by the sneeze.
    const neck: P = [90, y0 - 112];
    let pitch = 1.05 * o.drink - 0.35 * o.sneeze + 0.08 * Math.sin(clock * 0.5) * (1 - o.drink);
    pitch += Math.sin(clock * 18) * 0.12 * o.shake;
    const R = (p: P): P => rot([p[0], y0 + p[1]], neck, pitch);
    const head: P[] = [
      [96, -150],
      [122, -172],
      [154, -166],
      [184, -150],
      [212, -138],
      [208, -132],
      [168, -124],
      [120, -116],
      [92, -112],
    ].map((p) => R(p as P));
    // The neck joins chest to head.
    blobPath(g, [
      [70, y0 - 126],
      ...[
        [100, -156],
        [126, -150],
        [118, -112],
      ].map((p) => R(p as P)),
      [96, y0 - 84],
    ]).fill({ color: FUR, alpha: a });
    blobPath(g, head).fill({ color: FUR, alpha: a });
    // Pale throat and cheek.
    blobPath(
      g,
      [
        [98, -118],
        [140, -126],
        [176, -128],
        [150, -116],
        [108, -104],
      ].map((p) => R(p as P)),
    ).fill({ color: PALE, alpha: 0.55 * a });
    // Nose.
    const nose = R([210, -136]);
    g.circle(nose[0], nose[1], 4.5).fill({ color: INK, alpha: a });
    // Ears: tall, the near one rust inside; they flick.
    const flick = Math.sin(clock * 0.9) > 0.97 ? 0.2 : 0;
    const e1 = [R([110, -160]), R([104, -222 + 6 * o.sink]), R([134, -168])];
    const e2 = [R([124, -168]), R([132 + 8 * flick, -230]), R([152, -166])];
    g.poly(e1.flat()).fill({ color: FUR_SH, alpha: a });
    g.poly(e2.flat()).fill({ color: FUR, alpha: a });
    g.poly([R([131, -168]), R([135, -204]), R([145, -166])].flat()).fill({ color: RUST, alpha: 0.7 * a });
    // The eye: a dim gleam, closing as it sinks.
    const eye = R([160, -150]);
    const open = Math.max(0, Math.min(1, o.eyes));
    g.ellipse(eye[0], eye[1], 5, 4.2 * open + 0.6).fill({ color: INK, alpha: a });
    if (open > 0.2)
      g.circle(eye[0] + 1.2, eye[1] - 0.8, 1.2).fill({ color: 0xd9b070, alpha: 0.7 * open * a });
  }

  /** The nose tip in the fox's own px for the current pose (for the glint's landing and steam). */
  nose(o: FoxPose): P {
    const neck: P = [90, o.sink * 190 - 112];
    const pitch = 1.05 * o.drink - 0.35 * o.sneeze;
    return rot([199, o.sink * 190 - 138], neck, pitch);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
