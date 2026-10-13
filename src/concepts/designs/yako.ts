/**
 * Yako, the dark fox. A small bipedal fox exile in layered martial robes, drawn as crisp cel animation
 * (flat tones, one hard shadow shape per form, a thin warm rim, a few tapered ink lines) in the spirit
 * of hand-drawn "taopunk" action games. Charcoal-indigo fur, ash-cream mask and tail tip, amber eyes,
 * one crimson accent (the sash and its trailing tails), and a faint ember spirit-light on the tail tip
 * and the charm at his hip.
 *
 * Everything is re-posed and redrawn each frame from a small rig: hip + torso lean, 2-bone IK legs to
 * ankle targets, 2-bone IK arms to hand targets, and sine chains (with phase lag) for tail and cloth.
 */
import { BlurFilter, Container, Graphics } from 'pixi.js';
import type { Concept, ConceptInstance, ConceptPose } from '../types';

const PI = Math.PI;

// Palette. Fur is warm charcoal-indigo, cloth is cooler and darker, so the two darks separate.
const FUR = 0x40384a;
const FUR_SH = 0x231f30;
const FUR_FAR = 0x2a2536;
const RUST = 0x5a3136;
const PALE = 0xefe4cd;
const PALE_SH = 0xaab0bf;
const INK = 0x0d0b13;
const JACKET = 0x1c2030;
const JACKET_SH = 0x0f111b;
const JACKET_FAR = 0x131520;
const SLEEVE = 0x282d42;
const SLEEVE_SH = 0x151827;
const TEAL = 0x25797d;
const TEAL_SH = 0x14474f;
const TROUSER = 0x3c465a;
const TROUSER_SH = 0x232a3a;
const TROUSER_FAR = 0x252b3b;
const WRAP = 0xa59c86;
const WRAP_SH = 0x5f5f6b;
const WRAP_FAR = 0x646169;
const CRIMSON = 0xbd2530;
const CRIMSON_SH = 0x6f1424;
const CRIMSON_HI = 0xec5a44;
const AMBER = 0xffb52e;
const AMBER_HOT = 0xfff1c0;
const EMBER = 0xff8a3a;
const BRONZE = 0xa88555;
const RIM = 0xffd9a2;

const RIM_W = 0.62;
const THIGH = 17;
const SHIN = 16.5;
const UPPER = 11.5;
const FORE = 11;
const HEAD = 0.84;

interface V {
  x: number;
  y: number;
}

const v = (x: number, y: number): V => ({ x, y });
const mix = (a: V, b: V, k: number): V => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const fract = (x: number): number => x - Math.floor(x);
const num = (a: readonly number[], i: number): number => a[i] ?? 0;

type Mat = readonly [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];

/** A path pen with a transform stack and a world-space offset (used for the rim-light pass). */
class Pen {
  private m: Mat = IDENT;
  private readonly stack: Mat[] = [];
  ox = 0;
  oy = 0;
  constructor(public g: Graphics) {}

  push(x: number, y: number, rot = 0, sx = 1, sy = sx): void {
    const [a, b, c, d, tx, ty] = this.m;
    this.stack.push(this.m);
    const co = Math.cos(rot);
    const si = Math.sin(rot);
    const la = co * sx;
    const lb = si * sx;
    const lc = -si * sy;
    const ld = co * sy;
    this.m = [
      a * la + c * lb,
      b * la + d * lb,
      a * lc + c * ld,
      b * lc + d * ld,
      a * x + c * y + tx,
      b * x + d * y + ty,
    ];
  }
  pop(): void {
    this.m = this.stack.pop() ?? IDENT;
  }
  pt(x: number, y: number): V {
    const [a, b, c, d, tx, ty] = this.m;
    return { x: a * x + c * y + tx, y: b * x + d * y + ty };
  }
  M(x: number, y: number): this {
    const p = this.pt(x, y);
    this.g.moveTo(p.x + this.ox, p.y + this.oy);
    return this;
  }
  L(x: number, y: number): this {
    const p = this.pt(x, y);
    this.g.lineTo(p.x + this.ox, p.y + this.oy);
    return this;
  }
  Q(cx: number, cy: number, x: number, y: number): this {
    const c = this.pt(cx, cy);
    const p = this.pt(x, y);
    this.g.quadraticCurveTo(c.x + this.ox, c.y + this.oy, p.x + this.ox, p.y + this.oy);
    return this;
  }
  C(ax: number, ay: number, bx: number, by: number, x: number, y: number): this {
    const a = this.pt(ax, ay);
    const b = this.pt(bx, by);
    const p = this.pt(x, y);
    this.g.bezierCurveTo(
      a.x + this.ox,
      a.y + this.oy,
      b.x + this.ox,
      b.y + this.oy,
      p.x + this.ox,
      p.y + this.oy,
    );
    return this;
  }
  fill(color: number, alpha = 1): void {
    this.g.closePath();
    this.g.fill({ color, alpha });
  }
  /** Flat cel shape; with `rim` it first lays a copy nudged toward the key light (upper right). */
  shape(path: () => void, color: number, rim = 0, rw = RIM_W): void {
    if (rim) {
      this.ox = rw * Math.SQRT1_2;
      this.oy = -rw * Math.SQRT1_2;
      path();
      this.fill(rim);
      this.ox = 0;
      this.oy = 0;
    }
    path();
    this.fill(color);
  }
  dot(x: number, y: number, r: number, color: number, alpha = 1): void {
    const p = this.pt(x, y);
    this.g.circle(p.x, p.y, r);
    this.g.fill({ color, alpha });
  }
}

type Lat = number | ((s: number) => number);
const lat = (l: Lat, s: number): number => (typeof l === 'number' ? l : l(s));

/** A ribbon: a Catmull-Rom centreline with a half-width at each control point. */
class Rib {
  private readonly x: number[] = [];
  private readonly y: number[] = [];
  private readonly nx: number[] = [];
  private readonly ny: number[] = [];
  private readonly w: number[] = [];
  /** Highest valid `s` (control-point units). */
  readonly end: number;

  constructor(
    pts: readonly V[],
    widths: readonly number[],
    private readonly sub = 6,
  ) {
    const n = pts.length;
    const P = (i: number): V => pts[clamp(i, 0, n - 1)] ?? { x: 0, y: 0 };
    const W = (i: number): number => num(widths, clamp(i, 0, n - 1));
    const cr = (a: number, b: number, c: number, d: number, k: number): number =>
      0.5 * (2 * b + (c - a) * k + (2 * a - 5 * b + 4 * c - d) * k * k + (3 * b - a - 3 * c + d) * k * k * k);
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < sub; k++) {
        const f = k / sub;
        this.x.push(cr(P(i - 1).x, P(i).x, P(i + 1).x, P(i + 2).x, f));
        this.y.push(cr(P(i - 1).y, P(i).y, P(i + 1).y, P(i + 2).y, f));
        this.w.push(Math.max(0, cr(W(i - 1), W(i), W(i + 1), W(i + 2), f)));
      }
    }
    this.x.push(P(n - 1).x);
    this.y.push(P(n - 1).y);
    this.w.push(W(n - 1));
    const m = this.x.length;
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(m - 1, i + 1);
      const tx = num(this.x, b) - num(this.x, a);
      const ty = num(this.y, b) - num(this.y, a);
      const l = Math.hypot(tx, ty) || 1;
      this.nx.push(-ty / l);
      this.ny.push(tx / l);
    }
    this.end = n - 1;
  }

  /** Point at `s` along the spine (control-point units) and `u` across it (-1..1). */
  at(s: number, u: number): V {
    const f = clamp(s * this.sub, 0, this.x.length - 1);
    const i = Math.min(Math.floor(f), this.x.length - 2);
    const k = f - i;
    const w = lerp(num(this.w, i), num(this.w, i + 1), k) * u;
    return {
      x: lerp(num(this.x, i), num(this.x, i + 1), k) + lerp(num(this.nx, i), num(this.nx, i + 1), k) * w,
      y: lerp(num(this.y, i), num(this.y, i + 1), k) + lerp(num(this.ny, i), num(this.ny, i + 1), k) * w,
    };
  }

  /** +1 if the +u side faces away from the key light, else -1. */
  shade(): number {
    let d = 0;
    for (let i = 0; i < this.nx.length; i++)
      d += num(this.nx, i) * Math.SQRT1_2 - num(this.ny, i) * Math.SQRT1_2;
    return d < 0 ? 1 : -1;
  }

  /** Emit the outline of the band between lateral positions ua and ub, from s0 to s1. */
  path(pen: Pen, s0 = 0, s1 = this.end, ua: Lat = -1, ub: Lat = 1): void {
    const steps = Math.max(1, Math.ceil((s1 - s0) * this.sub));
    for (let k = 0; k <= steps; k++) {
      const s = lerp(s0, s1, k / steps);
      const p = this.at(s, lat(ua, s));
      if (k === 0) pen.M(p.x, p.y);
      else pen.L(p.x, p.y);
    }
    for (let k = steps; k >= 0; k--) {
      const s = lerp(s0, s1, k / steps);
      const p = this.at(s, lat(ub, s));
      pen.L(p.x, p.y);
    }
  }

  /** Base + hard shadow band (+ optional rim) in one go. `cover` is the lit fraction boundary. */
  cel(pen: Pen, base: number, shadow: number, rim = 0, term: Lat = 0.1, s0 = 0, s1 = this.end): void {
    pen.shape(() => this.path(pen, s0, s1), base, rim);
    const sh = this.shade();
    this.path(pen, s0, s1, sh, (s) => sh * lat(term, s));
    pen.fill(shadow);
  }
}

/** A tapered ink accent line through the given points. */
function ink(pen: Pen, pts: readonly V[], w: number, color = INK, alpha = 1): void {
  const n = pts.length;
  const widths = pts.map((_, i) => w * Math.sin((PI * (i + 0.35)) / (n - 0.3)) ** 0.8);
  widths[0] = 0.12 * w;
  widths[n - 1] = 0;
  const r = new Rib(pts, widths, 5);
  r.path(pen);
  pen.fill(color, alpha);
}

/** Two-bone IK. `bend` +1 puts the joint counter-clockwise (on screen) of the root-to-target line. */
function ik(root: V, target: V, l1: number, l2: number, bend: number): V {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = Math.atan2(dy, dx) - a * bend;
  return { x: root.x + Math.cos(ang) * l1, y: root.y + Math.sin(ang) * l1 };
}

interface Flow {
  /** Direction of the first segment (0 = +x, PI/2 = down). */
  a0: number;
  curl: number;
  amp: number;
  freq: number;
  lag: number;
}

function chain(base: V, n: number, seg: number, f: Flow, t: number, phase = 0): V[] {
  const pts: V[] = [base];
  let x = base.x;
  let y = base.y;
  for (let i = 0; i < n - 1; i++) {
    const k = i / (n - 2);
    const a = f.a0 + f.curl * i + f.amp * (0.25 + 0.75 * k) * Math.sin(t * f.freq - i * f.lag + phase);
    x += Math.cos(a) * seg;
    y += Math.sin(a) * seg;
    pts.push({ x, y });
  }
  return pts;
}

interface Rig {
  hip: V;
  lean: number;
  breath: number;
  headRot: number;
  nearAnkle: V;
  nearFoot: number;
  farAnkle: V;
  farFoot: number;
  /** Hand targets relative to each shoulder. */
  nearHand: V;
  nearBend: number;
  farHand: V;
  farBend: number;
  grip: number;
  tail: Flow;
  sash: Flow;
  hem: number;
  earTwitch: number;
  earBack: number;
  blink: number;
  /** Direction the spirit-light trail and motes drift, and how strongly (0 = idle wisps). */
  trail: V;
  speed: number;
}

/** Ankle target and foot angle for one leg of the sprint; p is the cycle phase 0..1. */
function sprintFoot(p: number): { ankle: V; ang: number } {
  const STANCE = 0.36;
  const REACH = 23;
  if (p < STANCE) {
    const u = p / STANCE;
    const ang = lerp(-0.18, 0.7, u * u * u);
    return { ankle: v(REACH - 2 * REACH * u, -3 - Math.max(0, Math.sin(ang)) * 6.5), ang };
  }
  const u = (p - STANCE) / (1 - STANCE);
  const e = u * u * (3 - 2 * u);
  const yOff = -3 - Math.sin(0.7) * 6.5;
  return {
    ankle: v(
      -REACH + 2 * REACH * e - 4 * Math.sin(PI * u) * (1 - u),
      lerp(yOff, -3, u) - 13 * Math.sin(PI * u) ** 0.8 * (1 - 0.45 * u),
    ),
    ang: lerp(0.7, -0.18, e) + 0.75 * Math.sin(PI * u) * (1 - u),
  };
}

function rigFor(pose: ConceptPose, t: number): Rig {
  if (pose === 'run') {
    const ph = t * 1.7;
    const w = ph * 2 * PI;
    const near = sprintFoot(fract(ph));
    const far = sprintFoot(fract(ph + 0.5));
    return {
      hip: v(-3, -30.5 + 1.5 * Math.cos(2 * w + 0.6)),
      lean: 0.66 + 0.04 * Math.sin(2 * w),
      breath: 0,
      headRot: 0.2 + 0.03 * Math.sin(2 * w + 1),
      nearAnkle: near.ankle,
      nearFoot: near.ang,
      farAnkle: far.ankle,
      farFoot: far.ang,
      nearHand: v(-20 + 1.5 * Math.sin(w), 4 + 2 * Math.cos(w)),
      nearBend: 1,
      farHand: v(-16 - 1.5 * Math.sin(w), 11 - 2 * Math.cos(w)),
      farBend: 1,
      grip: 1,
      tail: { a0: PI + 0.1, curl: -0.04, amp: 0.2, freq: 2 * PI * 3.4, lag: 0.75 },
      sash: { a0: PI + 0.42, curl: -0.05, amp: 0.3, freq: 2 * PI * 3.4, lag: 1.0 },
      hem: 1,
      earTwitch: 0,
      earBack: 0.5,
      blink: 0,
      trail: v(-1, -0.04),
      speed: 1,
    };
  }
  if (pose === 'jump') {
    const s = Math.sin(t * 2.2);
    return {
      hip: v(0, -37 + 0.6 * s),
      lean: 0.2,
      breath: 0,
      headRot: 0.14,
      nearAnkle: v(9 + 0.4 * s, -20),
      nearFoot: 0.6,
      farAnkle: v(-10, -13 + 0.5 * s),
      farFoot: 1.0,
      nearHand: v(12.5, 10 + 0.5 * s),
      nearBend: -1,
      farHand: v(-17, 3 - 0.6 * s),
      farBend: 1,
      grip: 0.4,
      tail: { a0: PI + 0.5, curl: 0.13, amp: 0.1, freq: 3.2, lag: 0.6 },
      sash: { a0: PI + 0.75, curl: 0.12, amp: 0.2, freq: 5, lag: 0.9 },
      hem: -0.8,
      earTwitch: 0,
      earBack: 0.3,
      blink: 0,
      trail: v(-0.25, -1),
      speed: 0.7,
    };
  }
  const b = Math.sin(t * 1.7);
  const tw = fract(t / 5.3);
  const tw2 = fract((t + 1.9) / 7.7);
  const twitch =
    (tw < 0.05 ? Math.sin((tw / 0.05) * PI) : 0) + (tw2 < 0.04 ? Math.sin((tw2 / 0.04) * PI) : 0);
  const bl = fract(t / 4.3);
  return {
    hip: v(-1 + 0.35 * Math.sin(t * 0.55), -33.2 + 0.3 * b),
    lean: 0.1 + 0.008 * b,
    breath: b,
    headRot: 0.05 + 0.035 * Math.sin(t * 0.43),
    nearAnkle: v(-6.5, -3),
    nearFoot: 0,
    farAnkle: v(10, -3.2),
    farFoot: 0.06,
    nearHand: v(3.2, 17.2 - 0.3 * b),
    nearBend: -1,
    farHand: v(0.5, 22),
    farBend: -1,
    grip: 0.5,
    tail: { a0: PI - 1.22, curl: 0.25, amp: 0.2, freq: 1.25, lag: 0.55 },
    sash: { a0: PI - 1.38, curl: 0.07, amp: 0.26, freq: 1.5, lag: 0.75 },
    hem: 0.12 * Math.sin(t * 1.1),
    earTwitch: twitch,
    earBack: 0,
    blink: bl < 0.03 ? 1 : 0,
    trail: v(-0.12, -1),
    speed: 0,
  };
}

function drawTail(pen: Pen, base: V, r: Rig, t: number): V {
  const pts = chain(base, 9, 6.1, r.tail, t);
  const rib = new Rib(pts, [2.8, 5, 6.9, 8.1, 8.5, 7.9, 6.3, 3.9, 0], 6);
  const sh = rib.shade();
  // Fur tufts breaking the lower edge: sharp, swept toward the tip.
  const tufts = (color: number): void => {
    for (const s of [1.9, 3.1, 4.3, 5.4]) {
      const a = rib.at(s - 0.25, sh * 0.8);
      const tip = rib.at(s + 1.25, sh * 1.42);
      const c = rib.at(s + 0.75, sh * 0.8);
      pen.M(a.x, a.y).L(tip.x, tip.y).L(c.x, c.y);
      pen.fill(color);
    }
    for (const s of [2.6, 4.6]) {
      const a = rib.at(s - 0.2, -sh * 0.85);
      const tip = rib.at(s + 1.0, -sh * 1.25);
      const c = rib.at(s + 0.7, -sh * 0.85);
      pen.ox = RIM_W * Math.SQRT1_2;
      pen.oy = -RIM_W * Math.SQRT1_2;
      pen.M(a.x, a.y).L(tip.x, tip.y).L(c.x, c.y);
      pen.fill(RIM);
      pen.ox = 0;
      pen.oy = 0;
      pen.M(a.x, a.y).L(tip.x, tip.y).L(c.x, c.y);
      pen.fill(FUR);
    }
  };
  pen.shape(() => rib.path(pen), FUR, RIM);
  tufts(FUR_SH);
  // Hard shadow with a broken, brushy terminator.
  rib.path(pen, 0, rib.end, sh, (s) => sh * (0.02 + 0.2 * Math.sin(s * 2.3 + 0.6)));
  pen.fill(FUR_SH);
  // Zig-zag fur boundary: rust band, then the pale tip.
  const zig = (s0: number, color: number): void => {
    const z: readonly (readonly [number, number])[] = [
      [0, 1],
      [0.85, 0.55],
      [0.2, 0.2],
      [1.0, -0.2],
      [0.3, -0.55],
      [0.9, -1],
    ];
    z.forEach(([ds, u], i) => {
      const p = rib.at(s0 + ds, u * -sh);
      if (i === 0) pen.M(p.x, p.y);
      else pen.L(p.x, p.y);
    });
    for (let s = s0 + 1; s <= rib.end; s += 0.2) {
      const p = rib.at(s, sh);
      pen.L(p.x, p.y);
    }
    for (let s = rib.end; s >= s0; s -= 0.2) {
      const p = rib.at(s, -sh);
      pen.L(p.x, p.y);
    }
    pen.fill(color);
  };
  zig(4.75, RUST);
  zig(5.35, PALE);
  rib.path(pen, 6.3, rib.end, sh, (s) => sh * (0.05 + 0.25 * Math.sin(s * 3)));
  pen.fill(PALE_SH);
  // Two long ink strokes following the flow of the fur.
  ink(pen, [rib.at(0.6, -sh * 0.15), rib.at(2, -sh * 0.3), rib.at(3.6, -sh * 0.2)], 0.5, INK, 0.75);
  ink(pen, [rib.at(2.6, sh * 0.45), rib.at(3.8, sh * 0.6), rib.at(4.8, sh * 0.5)], 0.45, INK, 0.8);
  return rib.at(7.3, 0);
}

function drawSashTails(pen: Pen, knot: V, r: Rig, t: number): void {
  const spec: readonly (readonly [number, number, number, number, number])[] = [
    // n, seg, angle offset, phase, shade
    [5, 5.2, -0.3, 1.7, 1],
    [6, 5.6, 0.06, 0, 0],
  ];
  for (const [n, seg, da, phase, far] of spec) {
    const f: Flow = { ...r.sash, a0: r.sash.a0 + da };
    const pts = chain(knot, n, seg, f, t, phase);
    const widths = pts.map((_, i) => 1.0 + 1.1 * (i / (n - 1)) ** 0.7);
    const rib = new Rib(pts, widths, 6);
    const base = far ? CRIMSON_SH : CRIMSON;
    pen.shape(() => rib.path(pen), base, far ? 0 : CRIMSON_HI, 0.4);
    if (!far) {
      const sh = rib.shade();
      // The shadow swaps sides as the cloth twists.
      rib.path(pen, 0, rib.end, sh, (s) => sh * (0.15 + 0.75 * Math.sin(s * 1.5 + 0.4)));
      pen.fill(CRIMSON_SH);
    }
    // Swallow-tail cut at the end.
    const e = rib.end;
    const a = rib.at(e - 0.02, -1.1);
    const b = rib.at(e - 0.02, 1.1);
    const c = rib.at(e - 0.75, 0);
    const d = rib.at(e + 0.02, 0);
    pen.M(a.x, a.y).L(d.x, d.y).L(b.x, b.y).L(c.x, c.y);
    pen.fill(far ? INK : INK, 0);
  }
}

function drawLeg(pen: Pen, hip: V, ankle: V, footAng: number, far: boolean): void {
  const knee = ik(hip, ankle, THIGH, SHIN, 1);
  const cloth = far ? TROUSER_FAR : TROUSER;
  const clothSh = far ? JACKET_SH : TROUSER_SH;
  const wrap = far ? WRAP_FAR : WRAP;
  const wrapSh = far ? 0x45444f : WRAP_SH;
  const fur = far ? FUR_SH : FUR;

  // Bound shin.
  const shin = new Rib([mix(knee, ankle, 0.32), mix(knee, ankle, 0.7), ankle], [2.8, 2.4, 2.0], 5);
  shin.cel(pen, wrap, wrapSh, far ? 0 : RIM, 0.0);
  for (const s of [0.55, 1.0, 1.45]) {
    ink(pen, [shin.at(s, -1), shin.at(s + 0.12, 0), shin.at(s + 0.28, 1)], 0.32, INK, 0.7);
  }

  // Wrapped foot with a dark paw toe.
  pen.push(ankle.x, ankle.y, footAng, 0.9);
  const foot = (): void => {
    pen.M(-2.3, -2.6).Q(-3.7, 1.2, -2.7, 3).L(7, 3).Q(9.9, 2.9, 10.6, 1.3).Q(7.2, -0.3, 2.6, -2.9);
  };
  pen.shape(foot, wrap, far ? 0 : RIM, 0.5);
  pen.M(-2.9, 1.2).Q(-3.3, 2.2, -2.7, 3).L(7, 3).L(6.5, 1.7).Q(1, 2.2, -2.9, 1.2);
  pen.fill(wrapSh);
  pen.M(5.2, 3).L(7, 3).Q(9.9, 2.9, 10.6, 1.3).Q(8.2, 0.1, 5.9, -1.1).L(6.4, 0.9);
  pen.fill(fur);
  ink(pen, [v(1.2, -2.5), v(1.9, -0.4), v(1.6, 1.6)], 0.3, INK, 0.7);
  pen.pop();

  // Loose cropped trouser leg, bloused over the binding.
  const cuff = mix(knee, ankle, 0.44);
  const tr = new Rib(
    [hip, mix(hip, knee, 0.5), knee, mix(knee, ankle, 0.26), cuff],
    [4.5, 4.9, 4.2, 4.7, 2.5],
    6,
  );
  tr.cel(pen, cloth, clothSh, far ? 0 : RIM, (s) => 0.5 - 0.2 * Math.sin(s * 1.4));
  if (!far) {
    const sh = tr.shade();
    ink(pen, [tr.at(1.5, -sh * 0.7), tr.at(2.3, -sh * 0.1), tr.at(3.2, sh * 0.2)], 0.45);
    ink(pen, [tr.at(3.3, -sh * 0.8), tr.at(3.6, -sh * 0.2), tr.at(3.75, sh * 0.5)], 0.4);
  }
}

function drawArm(pen: Pen, shoulder: V, hand: V, bend: number, grip: number, far: boolean): void {
  const target = v(shoulder.x + hand.x, shoulder.y + hand.y);
  const elbow = ik(shoulder, target, UPPER, FORE, bend);
  const dx = target.x - elbow.x;
  const dy = target.y - elbow.y;
  const l = Math.hypot(dx, dy) || 1;
  const wrist = v(elbow.x + (dx / l) * FORE, elbow.y + (dy / l) * FORE);
  const cloth = far ? JACKET_FAR : SLEEVE;
  const wrap = far ? WRAP_FAR : WRAP;
  const wrapSh = far ? 0x45444f : WRAP_SH;
  const fur = far ? FUR_FAR : FUR;

  // Hand: a compact mitt with three clawed fingers and a thumb; closes to a fist as grip goes to 1.
  pen.push(wrist.x, wrist.y, Math.atan2(dy, dx), 1.08);
  const reach = 1 - 0.3 * grip;
  const hd = (): void => {
    pen
      .M(-0.6, -2.2)
      .Q(2.4, -3.1, 4.6 * reach, -2.2)
      .L(7 * reach, -1.3 + grip)
      .L(5.3 * reach, -0.3)
      .L(7.3 * reach, 0.6 + grip)
      .L(5.2 * reach, 1.3)
      .L(6.2 * reach, 2.6 + 0.5 * grip)
      .Q(3, 3.2, 1.4, 2.5)
      .L(-0.6, 2.1);
  };
  pen.shape(hd, fur, far ? 0 : RIM, 0.45);
  pen
    .M(1.3, -2.6)
    .L(3.9, -4.6 + 1.6 * grip)
    .L(3.7, -2.3);
  pen.fill(fur);
  if (!far) {
    pen
      .M(-0.6, 2.1)
      .L(1.4, 2.5)
      .Q(3, 3.2, 6.2 * reach, 2.6 + 0.5 * grip)
      .L(4.6 * reach, 1.2)
      .Q(2, 1.5, -0.6, 0.6);
    pen.fill(FUR_SH);
  }
  pen.pop();

  // Bound forearm (pale, so the arms read at game size), crimson cord on the near wrist.
  const fore = new Rib([mix(elbow, wrist, 0.15), mix(elbow, wrist, 0.6), wrist], [2.9, 2.6, 2.1], 5);
  fore.cel(pen, wrap, wrapSh, far ? 0 : RIM, 0.05);
  for (const s of [0.75, 1.15]) {
    ink(pen, [fore.at(s, -1), fore.at(s + 0.12, 0), fore.at(s + 0.3, 1)], 0.3, INK, 0.7);
  }
  if (!far) {
    fore.path(pen, 1.55, 1.95, -1.12, 1.12);
    pen.fill(CRIMSON);
  }

  // Short flared sleeve with the teal lining showing at the cuff.
  const cuff = mix(elbow, wrist, 0.32);
  const sl = new Rib([shoulder, mix(shoulder, elbow, 0.55), elbow, cuff], [3.9, 4.4, 4.7, 5.5], 6);
  sl.cel(pen, cloth, far ? JACKET_SH : SLEEVE_SH, far ? 0 : RIM, (s) => 0.15 + 0.2 * Math.sin(s * 2));
  sl.path(pen, 2.72, 3, -1, 1);
  pen.fill(far ? TEAL_SH : TEAL);
  if (!far) {
    const sh = sl.shade();
    ink(pen, [sl.at(0.9, -sh * 0.6), sl.at(1.6, -sh * 0.1), sl.at(2.2, sh * 0.3)], 0.4);
  }
}

function drawEar(pen: Pen, far: boolean): void {
  const outline = (): void => {
    pen
      .M(-4.6, 1)
      .Q(-5.6, -4, -5.4, -7)
      .L(-3.5, -8.4)
      .L(-5.2, -10.2)
      .Q(-5.2, -17, -2.6, -24)
      .Q(2.6, -13, 5.2, 0);
  };
  pen.shape(outline, far ? FUR_FAR : FUR, far ? 0 : RIM);
  if (!far) {
    // Shadow down the back edge.
    pen
      .M(-4.6, 1)
      .Q(-5.6, -4, -5.4, -7)
      .L(-3.5, -8.4)
      .L(-5.2, -10.2)
      .Q(-5.2, -17, -2.6, -24)
      .Q(-3.6, -12, -2.2, 0);
    pen.fill(FUR_SH);
  }
  // Pale inner fur.
  pen.M(-0.8, -1.5).Q(-2.6, -9, -1.9, -17.5).Q(2.3, -9, 3.9, -1.5);
  pen.fill(far ? PALE_SH : PALE);
  if (!far) {
    pen.M(-0.8, -1.5).Q(-2.6, -9, -1.9, -17.5).Q(-0.6, -9, 0.9, -1.5);
    pen.fill(PALE_SH);
  }
  // Dark tip with a ragged lower edge.
  pen
    .M(-5.05, -13.5)
    .Q(-4.6, -19, -2.6, -24)
    .Q(-0.2, -19, 1.35, -14)
    .L(-0.5, -16.2)
    .L(-1.7, -13.6)
    .L(-3.2, -16);
  pen.fill(INK);
}

function drawHead(pen: Pen, r: Rig): void {
  const earRot = -0.2 - 0.3 * r.earBack;
  // Far ear, behind the skull.
  pen.push(5.2, -23.2, 0.2 - 0.3 * r.earBack + 0.1 * r.earTwitch, 0.9);
  drawEar(pen, true);
  pen.pop();

  const outline = (): void => {
    pen
      .M(20.6, -8.8)
      .Q(14.5, -6.2, 8.5, -4.6)
      .Q(4.5, -2.8, 1.5, -1)
      .L(-2.4, 1.9)
      .L(-4.2, -2)
      .L(-10, 0.6)
      .L(-9.2, -4.6)
      .L(-15.8, -4.8)
      .Q(-11.4, -8, -11.6, -11.5)
      .C(-13.4, -19.5, -8, -26.2, 0, -26.2)
      .C(5, -26.2, 9, -23.4, 10.6, -19.6)
      .Q(11.6, -17.6, 13.8, -16.2)
      .Q(18, -14.6, 21.6, -12.4)
      .Q(23.2, -11.4, 22.5, -9.8)
      .Q(21.8, -8.6, 20.6, -8.8);
  };
  pen.shape(outline, FUR, RIM);
  // Shadow shape on the back of the skull.
  pen
    .M(-15.8, -4.8)
    .Q(-11.4, -8, -11.6, -11.5)
    .C(-13.4, -19.5, -8, -26.2, -1.5, -26.2)
    .Q(-7.2, -21, -6.4, -15)
    .L(-3.6, -12.6)
    .L(-7, -8.4);
  pen.fill(FUR_SH);

  // Pale mask: lower muzzle, cheek and the cheek tufts, with a sharp graphic upper edge.
  pen
    .M(21, -10.6)
    .Q(16.5, -11.6, 12.6, -11.2)
    .Q(8.5, -10.6, 5, -13.2)
    .L(2, -10.8)
    .L(-2.8, -13)
    .L(-6.4, -8.6)
    .L(-15.8, -4.8)
    .L(-9.2, -4.6)
    .L(-10, 0.6)
    .L(-4.2, -2)
    .L(-2.4, 1.9)
    .L(1.5, -1)
    .Q(4.5, -2.8, 8.5, -4.6)
    .Q(14.5, -6.2, 20.6, -8.8);
  pen.fill(PALE);
  // Cool shadow under the jaw and on the lower tufts.
  pen
    .M(20.6, -8.8)
    .Q(14.5, -7.5, 9, -6.6)
    .Q(4, -5.6, 0.5, -4.6)
    .L(-3, -6.2)
    .L(-7.4, -5.6)
    .L(-15.8, -4.8)
    .L(-9.2, -4.6)
    .L(-10, 0.6)
    .L(-4.2, -2)
    .L(-2.4, 1.9)
    .L(1.5, -1)
    .Q(4.5, -2.8, 8.5, -4.6)
    .Q(14.5, -6.2, 20.6, -8.8);
  pen.fill(PALE_SH);

  // Nose and the stern line of the mouth.
  pen.M(20.3, -12.6).Q(23.3, -11.9, 22.6, -9.9).Q(21.4, -9.2, 20.3, -10.2).Q(19.8, -11.4, 20.3, -12.6);
  pen.fill(INK);
  pen.dot(21.8, -11.5, 0.35, PALE, 0.8);
  ink(pen, [v(20.8, -9.5), v(17, -8.5), v(13.4, -7.4), v(11.8, -6.4)], 0.42);

  // Eye: a narrow amber blade under a heavy lid.
  const open = 1 - r.blink;
  if (open > 0.1) {
    pen.M(12.2, -14.1).Q(9.2, -17.9, 5.3, -17.3).Q(8.2, -13.6, 12.2, -14.1);
    pen.fill(AMBER);
    pen.M(9.6, -16.9).Q(8.5, -15.6, 9.1, -14.2).Q(10, -15.5, 9.6, -16.9);
    pen.fill(INK);
    pen.dot(10.6, -15.4, 0.42, AMBER_HOT);
  }
  // Heavy upper lid / brow, and the dark tear line toward the muzzle.
  pen.M(13.3, -13.3).Q(10, -17.2, 4, -18.6).Q(8, -19.4, 11.2, -17.6).Q(12.8, -16, 13.3, -13.3);
  pen.fill(INK);
  ink(pen, [v(12.6, -14), v(14.6, -12.6), v(17, -11.9)], 0.45);
  ink(pen, [v(5.6, -17.2), v(3.6, -16.6), v(2, -15)], 0.4);
  // Cheek fur accents.
  ink(pen, [v(-1.2, -9.6), v(-4, -6.4), v(-8.4, -5)], 0.36, INK, 0.6);

  // Near ear, in front of the skull, with a notch in its back edge and a crimson cord at the base.
  pen.push(-4.4, -22.6, earRot + 0.22 * r.earTwitch);
  drawEar(pen, false);
  pen.M(-5.3, -2.2).L(5.2, -1.6).L(5.4, 0.1).L(-5, -0.4);
  pen.fill(CRIMSON);
  pen.pop();
  // Forelock overlapping the ear base: two sharp tufts.
  pen.M(-7.6, -21.4).L(-1.5, -27.6).L(-0.6, -24.4).L(4.4, -27.2).L(4.2, -22.4).Q(-1, -24.6, -7.6, -21.4);
  pen.fill(FUR);
}

function drawTorso(pen: Pen, r: Rig): void {
  const sy = 1 + 0.012 * r.breath;
  // Jacket.
  const body = (): void => {
    pen
      .M(-6.5, 1)
      .Q(-7.6, -5, -6, -9)
      .Q(-9.8, -17, -8.6, -24.5 * sy)
      .Q(-8, -29 * sy, -3, -29.5 * sy)
      .L(4.5, -29 * sy)
      .Q(9, -28 * sy, 9.6, -22 * sy)
      .Q(10, -15, 6.2, -9)
      .Q(7.6, -4, 7, 1);
  };
  pen.shape(body, JACKET, RIM);
  pen
    .M(-6.5, 1)
    .Q(-7.6, -5, -6, -9)
    .Q(-9.8, -17, -8.6, -24.5 * sy)
    .Q(-8, -29 * sy, -3, -29.5 * sy)
    .Q(-5.4, -20, -1.6, -11)
    .Q(-2.4, -4, -1.4, 1);
  pen.fill(JACKET_SH);
  // Chest blaze in the V of the crossed collar.
  pen
    .M(0.8, -29.6 * sy)
    .L(8, -27.8 * sy)
    .L(5.6, -19.8);
  pen.fill(PALE);
  pen
    .M(0.8, -29.6 * sy)
    .L(3.4, -29 * sy)
    .L(5.6, -19.8);
  pen.fill(PALE_SH);
  // Teal lining: the overlapping collar edge runs diagonally down into the sash.
  pen
    .M(0, -29.9 * sy)
    .L(1.9, -29.6 * sy)
    .L(6.5, -20.6)
    .L(5.2, -19.2);
  pen.fill(TEAL_SH);
  pen
    .M(8.9, -27.4 * sy)
    .L(7, -28.2 * sy)
    .L(-1.6, -10.5)
    .L(0.8, -10.5);
  pen.fill(TEAL);
  ink(pen, [v(6.8, -27.6 * sy), v(2.6, -19), v(-1.8, -10.5)], 0.4);
  // Stand collar at the nape.
  pen.shape(
    () => {
      pen
        .M(-5.2, -28.6 * sy)
        .Q(-6.4, -33 * sy, -2.4, -33.4 * sy)
        .L(2.6, -31 * sy)
        .L(1.6, -28.6 * sy);
    },
    JACKET,
    0,
  );
  pen
    .M(-5.2, -28.6 * sy)
    .Q(-6.4, -33 * sy, -2.4, -33.4 * sy)
    .L(-2.4, -28.6 * sy);
  pen.fill(JACKET_SH);
  ink(pen, [v(8.6, -21), v(7.6, -15.5), v(5, -11.5)], 0.4, INK, 0.7);

  // Jacket skirt below the sash: asymmetric, longer and pointed at the front, split at the hip.
  const h = r.hem;
  pen.shape(
    () => {
      pen
        .M(-7, -6.4)
        .Q(-9.6 - 1.2 * h, -1, -10.6 - 3.2 * h, 5.4 - 1.2 * Math.abs(h))
        .L(-3.2 - 1.5 * h, 3.6)
        .L(-0.4, -5);
    },
    JACKET_SH,
    0,
  );
  pen
    .M(-0.4, -5)
    .L(-3.2 - 1.5 * h, 3.6)
    .L(1.2 - 2 * h, 6.2)
    .L(2.4, -5);
  pen.fill(TEAL_SH);
  pen.shape(
    () => {
      pen
        .M(7.3, -6.6)
        .Q(9.8 - 0.6 * h, 0, 8.4 - 4.2 * h, 9.6 - 1.6 * Math.abs(h))
        .L(1.6 - 2.4 * h, 6)
        .L(0.6, -5);
    },
    JACKET,
    RIM,
  );
  pen
    .M(0.6, -5)
    .L(1.6 - 2.4 * h, 6)
    .L(4.2 - 3 * h, 7.6)
    .Q(3.4, 0, 3.6, -5.2);
  pen.fill(JACKET_SH);
  pen
    .M(8.4 - 4.2 * h, 9.6 - 1.6 * Math.abs(h))
    .L(1.6 - 2.4 * h, 6)
    .L(2 - 2.4 * h, 4.9)
    .L(8.3 - 3.8 * h, 8.2 - 1.6 * Math.abs(h));
  pen.fill(TEAL);

  // Wide crimson sash.
  pen.shape(
    () => {
      pen.M(-7.4, -12.6).Q(0, -10.6, 7.8, -13.2).L(7.5, -6).Q(0, -3.8, -7.2, -5.8);
    },
    CRIMSON,
    CRIMSON_HI,
    0.4,
  );
  pen.M(-7.4, -12.6).L(-2.6, -11.6).Q(-3.6, -8, -1.2, -4.6).Q(-4, -4.9, -7.2, -5.8);
  pen.fill(CRIMSON_SH);
  pen.M(-1.2, -4.6).Q(3.5, -4.4, 7.5, -6).L(7.6, -7.4).Q(3, -5.9, -2, -6.2);
  pen.fill(CRIMSON_SH);
  ink(pen, [v(-6.6, -9.4), v(0, -7.8), v(6.8, -9.8)], 0.36, INK, 0.65);
  // Knot at the back.
  pen.M(-6.2, -11.4).Q(-10.6, -12.2, -10.2, -8.6).Q(-9.6, -5.6, -6.2, -6.6);
  pen.fill(CRIMSON);
  pen.M(-10.2, -8.6).Q(-9.6, -5.6, -6.2, -6.6).L(-6.4, -8.4);
  pen.fill(CRIMSON_SH);
}

function drawBlade(pen: Pen): void {
  // Short blade across the lower back, drawn in torso space: wrapped hilt up and back.
  pen.push(-5.5, -9, -0.62);
  pen.M(2, -1.5).L(-13, -1.3).Q(-14.6, 0, -13, 1.3).L(2, 1.5);
  pen.fill(INK);
  pen.M(-7.4, -2.3).L(-6, -2.3).L(-6, 2.3).L(-7.4, 2.3);
  pen.fill(BRONZE);
  pen.M(-14.4, -1.5).Q(-16.4, 0, -14.4, 1.5).L(-13.2, 1.3).L(-13.2, -1.3);
  pen.fill(BRONZE);
  for (const x of [-12, -10.2, -8.6]) {
    pen
      .M(x, -1.3)
      .L(x + 0.8, -1.3)
      .L(x + 0.2, 1.3)
      .L(x - 0.6, 1.3);
    pen.fill(TEAL_SH);
  }
  pen.pop();
}

/** Deterministic drifting motes from an emitter: no state, each one loops on its own phase. */
function motes(g: Graphics, from: V, r: Rig, t: number, count: number, seed: number): void {
  for (let k = 0; k < count; k++) {
    const h = fract(Math.sin((k + 1) * 12.9898 + seed * 78.233) * 43758.5453);
    const u = fract(t * (0.22 + 0.5 * r.speed + 0.1 * h) + h * 7.3);
    const dist = (18 + 46 * r.speed) * u * (0.6 + 0.8 * h);
    const wob = Math.sin(u * 6 + h * 20 + t) * (2.5 + 2 * h) * (1 - 0.6 * r.speed);
    const x = from.x + r.trail.x * dist + wob * (1 - Math.abs(r.trail.x)) + (h - 0.5) * 5;
    const y = from.y + r.trail.y * dist + wob * Math.abs(r.trail.x) * 0.6 + (h - 0.5) * 4 * r.speed;
    const a = Math.sin(PI * u) ** 1.5;
    const rad = (0.38 + 0.4 * h) * (1 - 0.5 * u);
    g.circle(x, y, rad * 2.6);
    g.fill({ color: EMBER, alpha: 0.16 * a });
    g.circle(x, y, rad);
    g.fill({ color: AMBER_HOT, alpha: 0.9 * a });
  }
}

/** A tapered streak of light from p along the trail direction. */
function streak(
  pen: Pen,
  p: V,
  r: Rig,
  len: number,
  w: number,
  color: number,
  alpha: number,
  t: number,
): void {
  const n = 6;
  const pts: V[] = [];
  const px = -r.trail.y;
  const py = r.trail.x;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const wv = Math.sin(t * 9 - k * 4) * 1.6 * k;
    pts.push(v(p.x + r.trail.x * len * k + px * wv, p.y + r.trail.y * len * k + py * wv));
  }
  const rib = new Rib(
    pts,
    pts.map((_, i) => w * (1 - i / (n - 1)) ** 1.3),
    5,
  );
  rib.path(pen);
  pen.fill(color, alpha);
}

function build(pose: ConceptPose): ConceptInstance {
  const view = new Container();
  const halo = new Graphics();
  halo.blendMode = 'add';
  halo.filters = [new BlurFilter({ strength: 7, quality: 3 })];
  const body = new Graphics();
  const light = new Graphics();
  light.blendMode = 'add';
  const lightSoft = new Graphics();
  lightSoft.blendMode = 'add';
  lightSoft.filters = [new BlurFilter({ strength: 1.6, quality: 2 })];
  view.addChild(halo, body, lightSoft, light);
  const pen = new Pen(body);

  const update = (t: number): void => {
    const r = rigFor(pose, t);
    // The gallery's silhouette test blackens the holder with a filter: show the body only there.
    const lit = !view.parent?.filters;
    halo.visible = lit;
    light.visible = lit;
    lightSoft.visible = lit;
    body.clear();
    halo.clear();
    light.clear();
    lightSoft.clear();
    pen.g = body;

    // Torso frame.
    pen.push(r.hip.x, r.hip.y, r.lean);
    const sy = 1 + 0.012 * r.breath;
    const tailBase = pen.pt(-5.4, -3.4);
    const knot = pen.pt(-8.6, -8.8);
    const neck = pen.pt(1.6, -30.2 * sy);
    const nearShoulder = pen.pt(-0.4, -24.6 * sy);
    const farShoulder = pen.pt(4.6, -25.2 * sy);
    const nearHip = pen.pt(-1.2, -0.5);
    const farHip = pen.pt(2.6, -0.8);
    const charmTop = pen.pt(5.2, -5.4);
    pen.pop();

    const tailTip = drawTail(pen, tailBase, r, t);
    pen.push(r.hip.x, r.hip.y, r.lean);
    drawBlade(pen);
    pen.pop();
    drawSashTails(pen, knot, r, t);

    drawArm(pen, farShoulder, r.farHand, r.farBend, r.grip, true);
    drawLeg(pen, farHip, r.farAnkle, r.farFoot, true);
    drawLeg(pen, nearHip, r.nearAnkle, r.nearFoot, false);

    pen.push(r.hip.x, r.hip.y, r.lean);
    drawTorso(pen, r);
    pen.pop();

    // Charm on a cord from the sash: bronze ring, ember bead, a short crimson tassel.
    const swing =
      r.speed > 0.9 ? -0.9 + 0.2 * Math.sin(t * 21) : r.speed > 0 ? 0.5 : 0.12 * Math.sin(t * 1.3);
    const charm = v(charmTop.x + Math.sin(swing) * 6.2, charmTop.y + Math.cos(swing) * 6.2);
    ink(pen, [charmTop, mix(charmTop, charm, 0.5), charm], 0.5);
    pen.push(charm.x, charm.y, -swing);
    pen.M(-0.9, 1).L(0.9, 1).L(1.5, 5.4).L(0.1, 4.4).L(-1.3, 5.6);
    pen.fill(CRIMSON);
    pen.pop();
    pen.dot(charm.x, charm.y, 1.5, BRONZE);
    pen.dot(charm.x, charm.y, 0.85, AMBER);

    pen.push(neck.x, neck.y, r.headRot, HEAD);
    drawHead(pen, r);
    const eye = pen.pt(9.4, -15.6);
    const headC = pen.pt(2, -14);
    pen.pop();

    drawArm(pen, nearShoulder, r.nearHand, r.nearBend, r.grip, false);

    // Spirit light. A soft halo lifts the figure off the forest; the eye, the charm and the tail
    // tip burn; motes shed from the tail tip and charm; streaks trail when he moves.
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.3);
    halo.ellipse(lerp(r.hip.x, headC.x, 0.55), lerp(r.hip.y, headC.y, 0.5), 30, 40);
    halo.fill({ color: 0xffc98a, alpha: 0.06 });
    halo.circle(tailTip.x, tailTip.y, 11);
    halo.fill({ color: EMBER, alpha: 0.3 * pulse });
    halo.circle(charm.x, charm.y, 5);
    halo.fill({ color: EMBER, alpha: 0.25 * pulse });
    halo.circle(eye.x, eye.y, 5);
    halo.fill({ color: AMBER, alpha: 0.22 });
    if (r.speed > 0) {
      pen.g = halo;
      streak(pen, tailTip, r, 34 * r.speed, 5, EMBER, 0.4, t);
      streak(pen, knot, r, 30 * r.speed, 3, CRIMSON_HI, 0.25, t + 1);
    }
    pen.g = lightSoft;
    if (r.blink < 0.5) {
      pen.push(neck.x, neck.y, r.headRot, HEAD);
      pen.M(12.6, -14).Q(9.2, -18.4, 4.8, -17.5).Q(8.2, -13.2, 12.6, -14);
      pen.fill(AMBER, 0.55);
      pen.pop();
      if (r.speed > 0)
        streak(
          pen,
          v(eye.x + r.trail.x * 4, eye.y + r.trail.y * 4 - 1),
          r,
          18 * r.speed,
          0.8,
          AMBER,
          0.5,
          t + 2,
        );
    }
    lightSoft.circle(charm.x, charm.y, 1.6);
    lightSoft.fill({ color: AMBER, alpha: 0.45 * pulse });
    lightSoft.circle(tailTip.x, tailTip.y, 3.6);
    lightSoft.fill({ color: EMBER, alpha: 0.28 * pulse });
    if (r.speed > 0) streak(pen, tailTip, r, 24 * r.speed, 1.3, AMBER_HOT, 0.5, t);
    pen.g = body;
    motes(light, tailTip, r, t, 7, 1);
    motes(light, charm, r, t, 4, 2);
  };
  update(0);
  return { view, update };
}

const yako: Concept = {
  id: 'yako',
  name: 'Yako, the dark fox',
  blurb:
    'A small exiled fox warrior in layered martial robes, cel-shaded like hand-drawn animation. Tall notched ears, a long pale muzzle, a big ash-tipped tail and crimson sash tails make the silhouette; amber eyes and an ember charm give him his light.',
  create: build,
};

export default yako;
