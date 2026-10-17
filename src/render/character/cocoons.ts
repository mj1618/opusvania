// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The cocoon row on the hatching branch (memory/hatch-and-tatter.md): the split, empty husks of the
 * others and her own closed cocoon, each hanging UNDER the branch on a few silk threads, against the
 * fog of the drop (the room's `marks.cocoons`; a hang point inside a solid is moved to its underside). Each is a pendulum (swing + a lagging bend) pushed by the scene's wind. Hers
 * twitches when a button stirs it and on its own, harder as time passes; on `hatch` it splits: threads
 * snap, the two halves of the shell swing open on their hinge, husk flakes and silk fall into the drop.
 *
 * Render only: reads the sim's `state.hatch` and its events; everything moves on render time.
 * Drawn through Wing's painter (vesper/paint.ts): `back` behind her (the husks, the inside of hers),
 * `front` in front of her (her shell's halves, threads, flakes, silk), so she rises out of it.
 */
import type { CocoonMark, Room } from '../../scene/room';
import type { SimEvent } from '../../sim/events';
import type { HatchState } from '../../sim/state';
import { KEY_LIGHT, wind } from '../scene/lib/look';
import { clamp, hash1, lerp, Spring, sat, smoothstep } from './math';
import { type Painter, type RGB, rgb, type Shade } from './vesper/paint';
import { BIRTH } from './vesper/rig';

/** Knobs. Lengths in world px, times in seconds, angles in radians. */
export const COCOON = {
  /** The silk threads from the branch's underside to the cocoon's tip: husks (shortest, longest), hers. */
  thread: [20, 56],
  threadHers: 30,
  /** Her cocoon's body is at least this long (she is curled inside it). */
  bodyHers: 82,
  /** Width of a cocoon at its widest, as a fraction of its body's length. */
  wide: 0.37,
  /** How far the wind swings a husk / her (full) cocoon. */
  windHusk: 0.075,
  windHers: 0.035,
  /** The pendulum: angular frequency (rad/s) and damping; the bend that lags the swing. */
  swingW: 3.6,
  swingZ: 0.16,
  bendW: 9,
  bendZ: 0.32,
  bendLag: 0.07,
  /** Twitches on its own: seconds between (calm, late) and strength (calm, late); `late` is reached at `lateFrames` sim frames shut in. */
  every: [2.6, 0.85],
  own: [0.1, 0.42],
  lateFrames: 720,
  /** A press stirs it this hard (first press; each further press adds `pressStep`); an auto stir: `auto` + `autoLate` x late. */
  press: 0.55,
  pressStep: 0.25,
  auto: 0.32,
  autoLate: 0.4,
  /** A stir: swing kick (rad/s), bend kick, the bulge of her pushing (px), the squash kick. */
  kick: 1.5,
  bendKick: 7,
  bulge: 5.5,
  squash: 10,
  /**
   * The break: the shell cracks (the halves kick open, rad/s), then she pushes it wide `push` s later
   * (a second kick); they settle at a gape (rad, left / right); flakes, silk wisps; the flash.
   */
  crack: 1.1,
  push: 0.13,
  pushKick: 2.2,
  gape: [0.24, 0.2],
  flakes: 24,
  wisps: 5,
  flashR: 26,
  flashT: 0.22,
  flash: 0.16,
  /** Falling flakes: gravity, drag (1/s), the wind's push (px/s^2 at wind 1), a steady drift, flutter. */
  gravity: 280,
  drag: 1.5,
  windPush: 80,
  drift: 18,
  flutter: 55,
  /** Silk that drifts off the empty husks: one every this many seconds per husk (randomised x0.6..1.4). */
  husksShed: 5.5,
} as const;

// --- Colours (authored dark: post lifts the character layer).
const HUSK_TOP = rgb(0x2a2531);
const HUSK_LOW = rgb(0x120f18);
// Hers is new silk, paler than the old husks: the eye goes to it first.
const HERS_TOP = rgb(0x433d4c);
const HERS_LOW = rgb(0x1d1825);
// The inside of a husk: its upper hollow catches a little moonlight through the split, the bottom is dark.
const INSIDE = rgb(0x1e1a26);
const INSIDE_LOW = rgb(0x08060b);
/** The shell's cut thickness along a torn edge: paler, the inner surface catching the moon. */
const SHELL_EDGE = rgb(0x5d5868);
const SILK = rgb(0xaab3c0);
const SILK_DIM = rgb(0x5d6470);
const FIBRE = rgb(0x6d7482);
const LEAK = rgb(0xece6d6);
const FLAKE_DARK = rgb(0x2a2431);
const FLAKE_LIT = rgb(0x8590a0);

const SH_HUSK: Shade = {
  c0: HUSK_TOP,
  c1: HUSK_LOW,
  rim: 0.95,
  cool: 0.3,
  form: 0.2,
  band: 0.26,
  ember: 0.6,
};
const SH_HERS: Shade = { c0: HERS_TOP, c1: HERS_LOW, rim: 1, cool: 0.3, form: 0.2, band: 0.26, ember: 0.6 };
const SH_INSIDE: Shade = { c0: INSIDE, c1: INSIDE_LOW, rim: 0.15, cool: 0.1, form: 0, band: 0.4, ember: 1 };
const SH_FIBRE: Shade = { c0: FIBRE, c1: FIBRE, rim: 0.3, cool: 0, form: 0, band: 0.5, alpha: 0.42 };
const SH_SEAM: Shade = {
  c0: rgb(0x120e18),
  c1: rgb(0x120e18),
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.5,
  alpha: 0.7,
};
const SH_THREAD: Shade = { c0: SILK, c1: SILK_DIM, rim: 0.4, cool: 0, form: 0, band: 0.5, alpha: 0.75 };
const SH_SHELL_EDGE: Shade = {
  c0: SHELL_EDGE,
  c1: rgb(0x3a3542),
  rim: 0.6,
  cool: 0.1,
  form: 0,
  band: 0.5,
  alpha: 0.85,
};
/** Silk with a per-sample tone (`silkTone`). */
const SH_SILK: Shade = { c0: SILK_DIM, c1: SILK_DIM, rim: 0.2, cool: 0, form: 0, band: 0.5, alpha: 0.8 };

/** Silk catches the moon only in short segments that slide slowly along it: sample `i` at `d` px along. */
function silkTone(p: Painter, i: number, d: number, clock: number, ph: number): void {
  const g = Math.sin(d * 0.11 + clock * 0.9 + ph);
  const lit = sat((g - 0.55) * 2.6);
  const k = 0.45 + 0.55 * lit;
  p.pc[i * 3] = lerp(SILK_DIM[0] * 0.55, SILK[0], lit) * k;
  p.pc[i * 3 + 1] = lerp(SILK_DIM[1] * 0.55, SILK[1], lit) * k;
  p.pc[i * 3 + 2] = lerp(SILK_DIM[2] * 0.55, SILK[2], lit) * k;
}

const SH_WISP: Shade = { c0: SILK_DIM, c1: SILK_DIM, rim: 0.5, cool: 0, form: 0, band: 0.5, alpha: 0.3 };

/** Body samples along the spine. */
const N = 15;

interface Thread {
  /** Anchor on the branch lip, x offset from the hang point. */
  ax: number;
  /** Where it meets the cocoon's tip, x offset there. */
  tx: number;
  sag: number;
  /** Snapped at the break (hers only): a loose strand (index into `strands`). */
  snaps: boolean;
}

/** A loose silk strand: a little verlet chain (pinned at node 0 when `pinned`). */
interface Strand {
  n: number;
  x: Float32Array;
  y: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  seg: number;
  pinned: boolean;
  life: number;
  age: number;
  ph: number;
  alpha: number;
  /** Gravity (px/s^2) and air drag (1/s): silk pulled out at the break falls into the drop, shed silk drifts. */
  grav: number;
  drag: number;
  on: boolean;
}

interface Flake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  spin: number;
  flip: number;
  flipRate: number;
  size: number;
  aspect: number;
  lit: number;
  age: number;
  life: number;
  ph: number;
  on: boolean;
}

/** What is left of an empty husk: peeled wide, a bell with its mouth torn open, one half torn away, shrivelled. */
type HuskKind = 'closed' | 'peeled' | 'bell' | 'torn' | 'shrivel';
/** Husks in order along the branch (no two alike side by side). */
const KINDS: readonly HuskKind[] = ['peeled', 'bell', 'torn', 'shrivel', 'peeled', 'torn', 'bell'];

/** One cocoon on the branch. */
class Pod {
  readonly x: number;
  readonly y: number;
  /** Its silk's length from the underside to its tip. */
  readonly thread: number;
  readonly kind: HuskKind;
  /** Where the halves end along the body (1 = the tip: whole; less = the bottom torn away, ragged). */
  readonly cut: number;
  /** How far each half curls outward along its length (rad at its end), and how ragged its edges are (px). */
  readonly curlOut: [number, number];
  readonly jag: number;
  /** Shrivelled: the outline crumpled in (0..1). */
  readonly crumple: number;
  /** Body length (the mark's `len` less the threads). */
  readonly body: number;
  readonly w: number;
  readonly hers: boolean;
  readonly seed: number;
  readonly phase: number;
  /** Resting lean (a husk left hanging crooked) and a built-in curve of the body. */
  lean0: number;
  readonly bow: number;
  /** Which halves of the split shell are still there (a husk may have lost one). */
  readonly halves: [boolean, boolean];
  /** Gape at rest of each half (husks: how far they hang open). */
  readonly gape: [number, number];
  readonly threads: Thread[];
  readonly swing = new Spring(0, COCOON.swingW, COCOON.swingZ);
  readonly bend = new Spring(0, COCOON.bendW, COCOON.bendZ);
  readonly squash = new Spring(0, 14, 0.35);
  readonly halfL = new Spring(0, 7.5, 0.34);
  readonly halfR = new Spring(0, 7, 0.36);
  /** Split open (husks always; hers after the break). */
  split: boolean;
  /** The bulge of her pushing from inside: age (s), strength, where (0..1 along), which side. */
  bulgeT = 9;
  bulgeS = 0;
  bulgeAt = 0.5;
  bulgeSide = 1;
  /** Light from inside leaking through the seam (a stir), 0..1. */
  leak = 0;
  /** The threads shiver after a stir. */
  shake = 0;
  /** Spine this frame: points, angles, half-widths (left, right). */
  readonly sx = new Float32Array(N);
  readonly sy = new Float32Array(N);
  readonly sa = new Float32Array(N);
  readonly wl = new Float32Array(N);
  readonly wr = new Float32Array(N);
  tipX = 0;
  tipY = 0;

  constructor(m: CocoonMark, index: number, husk: number, room: Room) {
    this.x = m.x;
    this.hers = m.state === 'closed';
    this.seed = index * 7 + 3;
    const h = (k: number): number => hash1(this.seed * 131 + k * 17);
    // Under the branch: a hang point inside a solid goes to its underside.
    let y = m.y;
    for (const r of room.solids)
      if (m.x >= r.x && m.x <= r.x + r.w && y >= r.y && y < r.y + r.h) y = r.y + r.h - 3;
    this.y = y;
    this.kind = this.hers ? 'closed' : KINDS[husk % KINDS.length]!;
    const k = this.kind;
    this.thread = this.hers ? COCOON.threadHers : lerp(COCOON.thread[0], COCOON.thread[1], h(13));
    const body = m.len - (this.hers ? COCOON.threadHers + 8 : this.thread);
    this.body = this.hers
      ? clamp(body, COCOON.bodyHers, COCOON.bodyHers * 1.15)
      : Math.max(40, body * (k === 'shrivel' ? 0.85 : 0.95 + 0.2 * h(14)));
    this.w =
      this.body *
      COCOON.wide *
      (this.hers ? 1.04 : k === 'shrivel' ? 0.62 : k === 'bell' ? 1.12 : 0.9 + 0.2 * h(1));
    this.phase = h(2);
    this.bow = (h(3) - 0.5) * (this.hers ? 0.06 : 0.2);
    this.split = !this.hers;
    this.crumple = k === 'shrivel' ? 0.3 : 0;
    this.jag = k === 'closed' ? 0 : k === 'shrivel' ? 1.2 : 2 + 1.5 * h(15);
    this.cut =
      k === 'bell' ? 0.72 + 0.08 * h(16) : k === 'torn' ? 0.8 + 0.1 * h(16) : k === 'peeled' ? 0.93 : 1;
    this.curlOut =
      k === 'peeled'
        ? [0.22 + 0.2 * h(17), 0.18 + 0.2 * h(18)]
        : k === 'bell'
          ? [0.38 + 0.2 * h(17), 0.32 + 0.2 * h(18)]
          : k === 'torn'
            ? [0.2, 0.2]
            : [0.04, 0.04];
    // One half torn away from the 'torn' ones; the gapes differ by kind.
    const lostSide = h(5) < 0.5 ? 0 : 1;
    this.halves = [!(k === 'torn' && lostSide === 0), !(k === 'torn' && lostSide === 1)];
    const g = k === 'peeled' ? 0.2 : k === 'bell' ? 0.1 : k === 'torn' ? 0.16 : 0.04;
    this.gape = [-(g + 0.12 * h(6)), g + 0.12 * h(7)];
    const nThreads = this.hers ? 3 : 1 + Math.floor(h(8) * 2.2);
    const crooked = !this.hers && (k === 'torn' || h(9) < 0.2);
    this.lean0 = crooked ? (h(10) < 0.5 ? -1 : 1) * (0.14 + 0.1 * h(11)) : (h(12) - 0.5) * 0.06;
    this.threads = [];
    for (let i = 0; i < (crooked ? 1 : nThreads); i++) {
      const u = nThreads > 1 ? i / (nThreads - 1) - 0.5 : 0;
      this.threads.push({
        ax: crooked ? -this.lean0 * this.thread : u * (12 + 6 * h(20 + i)) + (h(30 + i) - 0.5) * 3,
        tx: u * 2.4,
        sag: 0.6 + 1.2 * h(40 + i),
        snaps: this.hers && i !== 1,
      });
    }
    this.swing.snap(this.lean0);
    this.halfL.snap(this.split ? this.gape[0] : 0);
    this.halfR.snap(this.split ? this.gape[1] : 0);
    this.solve(0);
  }

  /** Back to the closed cocoon (a restart). */
  close(): void {
    this.split = false;
    this.halfL.snap(0);
    this.halfR.snap(0);
    this.lean0 = 0;
    this.swing.snap(0);
    this.bend.snap(0);
    for (const t of this.threads) t.snaps = t !== this.threads[1];
  }

  /** A stir from inside, strength 0..1. */
  stir(s: number, side: number, at: number): void {
    this.swing.v += side * COCOON.kick * s;
    this.bend.v -= side * COCOON.bendKick * s;
    this.squash.v += COCOON.squash * s;
    this.bulgeT = 0;
    this.bulgeS = s;
    this.bulgeAt = at;
    this.bulgeSide = side;
    this.leak = Math.max(this.leak, 0.75 * s);
    this.shake = Math.max(this.shake, s);
  }

  /** The break: the shell cracks along its seam and it swings on the thread left (`push` opens it wide). */
  open(): void {
    this.split = true;
    this.halfL.v -= COCOON.crack;
    this.halfR.v += COCOON.crack * 0.8;
    this.gape[0] = -COCOON.gape[0];
    this.gape[1] = COCOON.gape[1];
    // Hung from the one thread left, it hangs crooked.
    this.lean0 = 0.12;
    this.swing.v += 0.9;
    this.bend.v -= 4;
    this.squash.v -= 5;
    this.leak = 1;
  }

  /** ... and she pushes it wide as she comes out. */
  push(): void {
    this.halfL.v -= COCOON.pushKick;
    this.halfR.v += COCOON.pushKick * 0.85;
    this.swing.v += 1.2;
    this.bend.v -= 5;
  }

  update(dt: number, clock: number): void {
    const windK = this.hers && !this.split ? COCOON.windHers : COCOON.windHusk;
    const target = this.lean0 + wind(this.x, clock, this.phase) * windK;
    this.swing.step(target, dt);
    this.bend.step(clamp(-this.swing.v * COCOON.bendLag, -0.5, 0.5), dt);
    this.squash.step(0, dt);
    if (this.split) {
      // Empty, the halves stir in the wind on their own hinge.
      const w = wind(this.x + 40, clock * 1.3, this.phase + 0.3);
      this.halfL.step(this.gape[0] - 0.06 * w, dt);
      this.halfR.step(this.gape[1] - 0.06 * w, dt);
    }
    this.bulgeT += dt;
    this.leak *= Math.exp(-3.5 * dt);
    this.shake *= Math.exp(-4 * dt);
    this.solve(clock);
  }

  /** The spine from the tip down, and the half-widths each side. */
  private solve(clock: number): void {
    const th = this.swing.x;
    const kb = this.bend.x + this.bow;
    const sq = clamp(this.squash.x * 0.012, -0.08, 0.1);
    const len = this.body * (1 - sq);
    const breathe = this.split ? 0 : 0.012 * Math.sin(clock * 1.7 + this.phase * 6);
    const wid = this.w * (1 + 1.3 * sq + breathe);
    // Tip: the threads' length below the hang point, swung.
    const tl = this.thread;
    this.tipX = this.x + Math.sin(th) * tl;
    this.tipY = this.y + Math.cos(th) * tl;
    let x = this.tipX;
    let y = this.tipY;
    const ds = len / (N - 1);
    const bAge = this.bulgeT;
    const bAmp =
      bAge < 0.45
        ? this.bulgeS * COCOON.bulge * smoothstep(0, 0.06, bAge) * (1 - smoothstep(0.1, 0.45, bAge))
        : 0;
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      const a = th + kb * s;
      if (i > 0) {
        x += Math.sin(a) * ds;
        y += Math.cos(a) * ds;
      }
      this.sx[i] = x;
      this.sy[i] = y;
      this.sa[i] = a;
      // A spindle: a narrow neck at the threads, widest a little above the middle, a fine point below.
      const sp = s ** 0.82;
      let hw = (wid / 2) * Math.sin(Math.PI * sp) ** 0.72;
      hw = Math.max(hw, s < 0.5 ? 1.4 : 0.4);
      const bump = bAmp * Math.exp(-(((s - this.bulgeAt) / 0.14) ** 2));
      // Shrivelled: dented in, unevenly each side.
      const cl = this.crumple
        ? 1 - this.crumple * (0.5 + 0.5 * Math.sin(s * 17 + this.seed)) * Math.sin(Math.PI * s)
        : 1;
      const cr = this.crumple
        ? 1 - this.crumple * (0.5 + 0.5 * Math.sin(s * 13 + this.seed * 2.1)) * Math.sin(Math.PI * s)
        : 1;
      this.wl[i] = hw * cl + (this.bulgeSide < 0 ? bump : bump * 0.25);
      this.wr[i] = hw * cr + (this.bulgeSide > 0 ? bump : bump * 0.25);
    }
  }

  /** Outline of the whole body into p.px/py (down to `cut` of its length); returns the count. `k` scales the widths. */
  outline(p: Painter, k = 1, cut = 1): number {
    if (cut < 0.999) {
      const q = HALF_Q;
      let n = 0;
      const steps = 14;
      for (let side = -1; side <= 1; side += 2)
        for (let j = 0; j <= steps; j++) {
          const i = side < 0 ? j : steps - j;
          const s = (i / steps) * cut;
          this.at(s, side, q);
          const w = q.w * k * (i === steps ? 0.6 : 1);
          p.px[n] = q.x + side * Math.cos(q.a) * w;
          p.py[n] = q.y - side * Math.sin(q.a) * w;
          n++;
        }
      return n;
    }
    let n = 0;
    for (let i = 0; i < N; i++) {
      const c = Math.cos(this.sa[i]!);
      const s = Math.sin(this.sa[i]!);
      p.px[n] = this.sx[i]! - c * this.wl[i]! * k;
      p.py[n] = this.sy[i]! + s * this.wl[i]! * k;
      n++;
    }
    for (let i = N - 1; i >= 0; i--) {
      const c = Math.cos(this.sa[i]!);
      const s = Math.sin(this.sa[i]!);
      p.px[n] = this.sx[i]! + c * this.wr[i]! * k;
      p.py[n] = this.sy[i]! - s * this.wr[i]! * k;
      n++;
    }
    return n;
  }

  /** Spine point, angle and half-width at `s` (0..1 along the body), side -1 / 1. */
  private at(s: number, side: number, out: { x: number; y: number; a: number; w: number }): void {
    const fi = clamp(s, 0, 1) * (N - 1);
    const i0 = Math.min(N - 2, Math.floor(fi));
    const q = fi - i0;
    const ws = side < 0 ? this.wl : this.wr;
    out.x = lerp(this.sx[i0]!, this.sx[i0 + 1]!, q);
    out.y = lerp(this.sy[i0]!, this.sy[i0 + 1]!, q);
    out.a = lerp(this.sa[i0]!, this.sa[i0 + 1]!, q);
    out.w = lerp(ws[i0]!, ws[i0 + 1]!, q);
  }

  /**
   * One half of the split shell as a ribbon (p.px / py / pw; returns the sample count): turned on its
   * hinge at the tip by `ang` and curled outward along its length (`curlOut`), from the tip down to
   * `cut` with a ragged torn end; its inner edge is the torn seam, short of the spine (a dark slit
   * shows between the halves). `seam` gets the seam edge's points (x, y pairs) for its silk edge.
   */
  half(p: Painter, side: number, ang: number, seam?: { n: number; pts: Float32Array }): number {
    const hx = this.tipX;
    const hy = this.tipY;
    const curl = this.curlOut[side < 0 ? 0 : 1] * side;
    const cut = this.split ? this.cut : 1;
    const q = HALF_Q;
    const steps = 18;
    const rot = (x: number, y: number, s: number, out: { x: number; y: number }): void => {
      const dx = x - hx;
      const dy = y - hy;
      // (y is down: a negative angle swings the left half's lower end out to the left)
      const r = -(ang + curl * s ** 1.6);
      const ca = Math.cos(r);
      const sa = Math.sin(r);
      out.x = hx + dx * ca - dy * sa;
      out.y = hy + dx * sa + dy * ca;
    };
    const o = HALF_O;
    const i2 = HALF_I;
    if (seam) seam.n = 0;
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * cut;
      this.at(s, side, q);
      const c = Math.cos(q.a);
      const sn = Math.sin(q.a);
      rot(q.x + side * c * q.w, q.y - side * sn * q.w, s, o);
      const rag = this.split ? 0.08 + 0.2 * hash1(this.seed * 53 + i * 7 + (side > 0 ? 1 : 0)) : 0;
      rot(q.x + side * c * q.w * rag, q.y - side * sn * q.w * rag, s, i2);
      // The torn end: ragged teeth (the last few samples narrow unevenly).
      const end = this.split && cut < 0.99 ? sat((i - (steps - 3)) / 3) : 0;
      const tooth = end > 0 ? 1 - end * (0.35 + 0.65 * hash1(this.seed * 29 + i * 11 + side)) : 1;
      p.px[i] = (o.x + i2.x) / 2;
      p.py[i] = (o.y + i2.y) / 2;
      p.pw[i] = Math.max(0.3, (Math.hypot(o.x - i2.x, o.y - i2.y) / 2) * tooth);
      if (seam && this.split && i > 0 && i < steps) {
        seam.pts[seam.n * 2] = i2.x;
        seam.pts[seam.n * 2 + 1] = i2.y;
        seam.n++;
      }
    }
    return steps + 1;
  }
}

const HALF_O = { x: 0, y: 0 };
const HALF_I = { x: 0, y: 0 };
const HALF_Q = { x: 0, y: 0, a: 0, w: 0 };

function newStrand(n: number): Strand {
  return {
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    seg: 5,
    pinned: false,
    life: 0,
    age: 0,
    ph: 0,
    alpha: 1,
    grav: 26,
    drag: 2.4,
    on: false,
  };
}

export class CocoonRow {
  readonly pods: Pod[];
  private readonly hers: Pod | null;
  private readonly flakes: Flake[] = [];
  private readonly wisps: Strand[] = [];
  /** Hers: the threads that snapped, as strands pinned on the branch (one per thread). */
  private readonly snapped: Strand[] = [];
  /** Render time since the break (large = none seen). */
  private broke = 99;
  private wasInside = false;
  private nextOwn = 1.2;
  private ownCount = 0;
  private shedT: number[];
  private shedCount = 0;
  private readonly bottom: number;

  constructor(room: Room) {
    const marks = room.marks?.cocoons ?? [];
    let husk = 0;
    this.pods = marks.map((m, i) => new Pod(m, i, m.state === 'closed' ? 0 : husk++, room));
    this.hers = this.pods.find((p) => p.hers) ?? null;
    for (let i = 0; i < 40; i++) this.flakes.push(this.blankFlake());
    for (let i = 0; i < 24; i++) this.wisps.push(newStrand(7));
    if (this.hers) for (const _ of this.hers.threads) this.snapped.push(newStrand(6));
    this.shedT = this.pods.map((p, i) => 1 + hash1(i * 97 + 5) * COCOON.husksShed * (p.hers ? 9 : 1));
    this.bottom = room.height + 200;
  }

  get any(): boolean {
    return this.pods.length > 0;
  }

  /** Where her cocoon hangs (world px), or null. */
  get hersAt(): { x: number; y: number } | null {
    return this.hers ? { x: this.hers.x, y: this.hers.y } : null;
  }

  /** Her cocoon now: where its silk is tied (x, y), its tip and its bottom (world y), or null. */
  get hersGeom(): { x: number; y: number; tipY: number; botY: number } | null {
    const h = this.hers;
    if (!h) return null;
    const g = this.geom;
    g.x = h.x;
    g.y = h.y;
    g.tipY = h.tipY;
    g.botY = h.sy[N - 1]!;
    return g;
  }

  private readonly geom = { x: 0, y: 0, tipY: 0, botY: 0 };

  /** Seconds since the break (large = none seen). */
  get sinceBreak(): number {
    return this.broke;
  }

  update(dt: number, clock: number, hatch: Readonly<HatchState> | null, events: readonly SimEvent[]): void {
    const hers = this.hers;
    const inside = !!hatch && !hatch.done;
    if (hers) {
      if (inside && !this.wasInside) {
        // Shut in (again: a restart): the closed cocoon, nothing falling.
        hers.close();
        this.broke = 99;
        for (const f of this.flakes) f.on = false;
        for (const s of this.snapped) s.on = false;
      }
      if (!inside && !hers.split) {
        // Out without a break we saw (a teleport, a page loaded after): just an open husk.
        hers.split = true;
        hers.gape[0] = -COCOON.gape[0];
        hers.gape[1] = COCOON.gape[1];
        hers.halfL.snap(hers.gape[0]);
        hers.halfR.snap(hers.gape[1]);
        hers.lean0 = 0.12;
      }
      const late = hatch ? sat(hatch.frames / COCOON.lateFrames) : 0;
      for (const e of events) {
        if (e.type === 'hatchStir') {
          const s = e.auto
            ? COCOON.auto + COCOON.autoLate * late
            : COCOON.press + COCOON.pressStep * (e.presses - 1);
          this.stirHers(Math.min(1, s));
        } else if (e.type === 'hatch') {
          this.breakHers();
        }
      }
      // On its own: small twitches, sooner and harder the longer she is shut in.
      if (inside) {
        this.nextOwn -= dt;
        if (this.nextOwn <= 0) {
          this.ownCount++;
          const r = hash1(this.ownCount * 211 + 9);
          this.nextOwn = lerp(COCOON.every[0], COCOON.every[1], late) * (0.65 + 0.7 * r);
          this.stirHers(lerp(COCOON.own[0], COCOON.own[1], late) * (0.7 + 0.6 * hash1(this.ownCount * 37)));
        }
      }
    }
    this.wasInside = inside;
    if (hers && this.broke < COCOON.push && this.broke + dt >= COCOON.push) hers.push();
    // Her climb hauls on its silk: the empty husk jerks with each pull and with the scramble off it.
    if (hers)
      for (const at of [BIRTH.silk[0][0], BIRTH.silk[1][0], BIRTH.bark[0][0]])
        if (this.broke < at && this.broke + dt >= at) {
          hers.swing.v += 0.9;
          hers.bend.v -= 4;
          hers.shake = 1;
        }
    this.broke += dt;
    for (const p of this.pods) p.update(dt, clock);
    // Silk drifts off the empty husks now and then.
    for (let i = 0; i < this.pods.length; i++) {
      const p = this.pods[i]!;
      if (!p.split) continue;
      this.shedT[i]! -= dt;
      if (this.shedT[i]! <= 0) {
        this.shedCount++;
        this.shedT[i] = COCOON.husksShed * (0.6 + 0.8 * hash1(this.shedCount * 61 + i));
        const k = p.sx.length - 1;
        this.spawnWisp(p.sx[k]!, p.sy[k]!, 0, 10, 6 + 3 * hash1(this.shedCount * 13), 0.22);
      }
    }
    this.updateFlakes(dt, clock);
    this.updateStrands(dt, clock);
  }

  private stirHers(s: number): void {
    const h = this.hers;
    if (!h || h.split) return;
    const n = ++this.ownCount;
    const side = hash1(n * 19 + 1) < 0.5 ? -1 : 1;
    h.stir(s, side, 0.3 + 0.4 * hash1(n * 23 + 2));
  }

  private breakHers(): void {
    const h = this.hers;
    if (!h) return;
    h.open();
    this.broke = 0;
    // The snapped threads recoil up toward the branch.
    for (let i = 0; i < h.threads.length; i++) {
      const t = h.threads[i]!;
      const s = this.snapped[i]!;
      if (!t.snaps) continue;
      s.on = true;
      s.pinned = true;
      s.age = 0;
      s.life = 1e9;
      s.alpha = 0.7;
      s.ph = hash1(i * 7 + 2);
      s.seg = h.thread / (s.n - 1) + 1.2;
      for (let k = 0; k < s.n; k++) {
        const u = k / (s.n - 1);
        s.x[k] = lerp(h.x + t.ax, h.tipX + t.tx, u);
        s.y[k] = lerp(h.y, h.tipY, u);
        // Recoil: the free end is flung up and out.
        s.ox[k] = s.x[k]! - (t.ax >= 0 ? 1 : -1) * 2.2 * u;
        s.oy[k] = s.y[k]! + 3.4 * u;
      }
    }
    // Husk flakes off the seam and the edges, thrown out and down.
    for (let i = 0; i < COCOON.flakes; i++) {
      const r = (k: number): number => hash1(i * 101 + k * 13 + 7);
      const s = 0.1 + 0.8 * r(1);
      const k = Math.min(h.sx.length - 1, Math.round(s * (h.sx.length - 1)));
      const side = r(2) < 0.5 ? -1 : 1;
      const w = (side < 0 ? h.wl[k]! : h.wr[k]!) * (0.2 + 0.8 * r(3));
      const f = this.freeFlake();
      if (!f) break;
      f.on = true;
      f.x = h.sx[k]! + side * w;
      f.y = h.sy[k]!;
      f.vx = side * (40 + 130 * r(4));
      f.vy = -70 + 120 * r(5);
      f.a = r(6) * 6.28;
      f.spin = (r(7) - 0.5) * 14;
      f.flip = r(8) * 6.28;
      f.flipRate = 4 + 9 * r(9);
      f.size = 2.2 + 4.2 * r(10) ** 1.4;
      f.aspect = 0.35 + 0.4 * r(11);
      f.lit = r(12) < 0.5 ? 1 : 0.4;
      f.age = 0;
      f.life = 7 + 4 * r(13);
      f.ph = r(14);
    }
    // Silk pulled out with her.
    for (let i = 0; i < COCOON.wisps; i++) {
      const r = (k: number): number => hash1(i * 71 + k * 29 + 3);
      const k = Math.round((0.15 + 0.7 * r(1)) * (h.sx.length - 1));
      this.spawnWisp(
        h.sx[k]!,
        h.sy[k]!,
        (r(2) - 0.5) * 90,
        -30 - 40 * r(3),
        7 + 5 * r(4),
        0.6,
        150 + 80 * r(5),
        1.3,
      );
    }
  }

  private blankFlake(): Flake {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      a: 0,
      spin: 0,
      flip: 0,
      flipRate: 0,
      size: 0,
      aspect: 0,
      lit: 0,
      age: 0,
      life: 0,
      ph: 0,
      on: false,
    };
  }

  private freeFlake(): Flake | undefined {
    return this.flakes.find((f) => !f.on);
  }

  private spawnWisp(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    alpha: number,
    grav = 26,
    drag = 2.4,
  ): void {
    const s = this.wisps.find((w) => !w.on);
    if (!s) return;
    s.grav = grav;
    s.drag = drag;
    s.on = true;
    s.pinned = false;
    s.age = 0;
    s.life = life;
    s.alpha = alpha;
    s.seg = 4.5;
    s.ph = hash1(Math.floor(x * 13 + y * 7));
    for (let k = 0; k < s.n; k++) {
      s.x[k] = x + k * 0.8;
      s.y[k] = y + k * s.seg * 0.8;
      s.ox[k] = s.x[k]! - (vx / 60) * (1 - k * 0.15);
      s.oy[k] = s.y[k]! - (vy / 60) * (1 - k * 0.15);
    }
  }

  private updateFlakes(dt: number, clock: number): void {
    const C = COCOON;
    for (const f of this.flakes) {
      if (!f.on) continue;
      f.age += dt;
      const w = wind(f.x, clock, f.ph);
      f.vx += (w * C.windPush + C.drift + Math.sin(f.flip) * C.flutter * sat(f.age * 2)) * dt;
      f.vy += C.gravity * dt;
      const dk = Math.exp(-C.drag * (1 + 0.6 * f.aspect) * dt);
      f.vx *= dk;
      f.vy *= dk;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.a += f.spin * dt;
      f.flip += f.flipRate * dt;
      if (f.age > f.life || f.y > this.bottom) f.on = false;
    }
  }

  private updateStrands(dt: number, clock: number): void {
    const h = this.hers;
    const step = (s: Strand, grav: number, drag: number): void => {
      const w = wind(s.x[0]!, clock, s.ph);
      const keep = Math.exp(-drag * dt);
      for (let k = s.pinned ? 1 : 0; k < s.n; k++) {
        const vx = (s.x[k]! - s.ox[k]!) * keep;
        const vy = (s.y[k]! - s.oy[k]!) * keep;
        s.ox[k] = s.x[k]!;
        s.oy[k] = s.y[k]!;
        s.x[k]! += vx + (w * 40 + 10) * dt * dt * (0.5 + k * 0.3);
        s.y[k]! += vy + grav * dt * dt;
      }
      for (let it = 0; it < 3; it++)
        for (let k = 1; k < s.n; k++) {
          const dx = s.x[k]! - s.x[k - 1]!;
          const dy = s.y[k]! - s.y[k - 1]!;
          const d = Math.hypot(dx, dy) || 1e-3;
          const e = (d - s.seg) / d;
          if (s.pinned && k === 1) {
            s.x[k]! -= dx * e;
            s.y[k]! -= dy * e;
          } else {
            s.x[k - 1]! += dx * e * 0.5;
            s.y[k - 1]! += dy * e * 0.5;
            s.x[k]! -= dx * e * 0.5;
            s.y[k]! -= dy * e * 0.5;
          }
        }
    };
    for (let i = 0; i < this.snapped.length; i++) {
      const s = this.snapped[i]!;
      if (!s.on || !h) continue;
      s.age += dt;
      const t = h.threads[i]!;
      s.x[0] = h.x + t.ax;
      s.y[0] = h.y;
      step(s, 160, 3);
    }
    for (const s of this.wisps) {
      if (!s.on) continue;
      s.age += dt;
      step(s, s.grav, s.drag);
      if (s.age > s.life || s.y[0]! > this.bottom) s.on = false;
    }
  }

  /** Behind her: every empty husk, and the inside of hers once it is open. */
  drawBack(p: Painter, clock: number): void {
    for (const pod of this.pods) {
      if (pod.hers) {
        if (pod.split) this.drawInside(p, pod);
        continue;
      }
      this.drawThreads(p, pod, clock);
      this.drawInside(p, pod);
      this.drawHalves(p, pod);
      this.drawTail(p, pod, clock);
    }
  }

  /** In front of her: her cocoon (closed, or its open halves), its threads, what falls from it. */
  drawFront(p: Painter, clock: number): void {
    const h = this.hers;
    if (h) {
      this.drawThreads(p, h, clock);
      if (h.split) {
        this.drawHalves(p, h);
        this.drawTail(p, h, clock);
      } else this.drawClosed(p, h);
      for (const s of this.snapped) if (s.on) this.drawStrand(p, s, SH_THREAD, 0.42);
      // The break: a small flash of her light at the split, gone in a moment.
      const t = this.broke;
      if (t < COCOON.flashT) {
        const k = (1 - t / COCOON.flashT) ** 2;
        const m = Math.floor(h.sx.length * 0.45);
        p.glow(h.sx[m]!, h.sy[m]!, COCOON.flashR, LEAK, COCOON.flash * k, COCOON.flashR * 1.3);
        p.glow(h.sx[m]!, h.sy[m]!, COCOON.flashR * 0.3, LEAK, 0.35 * k, COCOON.flashR * 0.55);
      }
    }
    this.drawFlakes(p);
    for (const s of this.wisps) if (s.on) this.drawStrand(p, s, SH_WISP, 0.32);
  }

  /**
   * Silk (round 3, review: "ruler-straight white lines"): fine, bowed by its own sag and the wind, dark
   * along most of its length and catching the moon only in short segments that slide along it.
   */
  private drawThreads(p: Painter, pod: Pod, clock: number): void {
    const shake = pod.shake;
    const w = wind(pod.x, clock - 0.25, pod.phase + 0.5);
    for (let k = 0; k < pod.threads.length; k++) {
      const t = pod.threads[k]!;
      if (pod.split && pod.hers && t.snaps) continue;
      const x0 = pod.x + t.ax;
      const y0 = pod.y - 1.5;
      const x1 = pod.tipX + t.tx;
      const y1 = pod.tipY + 1;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      // Bowed sideways: its own lie, the wind, and the swing (the silk lags the cocoon).
      const bow = (t.sag * 2.2 + w * 3.5 - pod.swing.v * 6) * (k % 2 === 0 ? 1 : 0.8);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const b =
          bow * Math.sin(Math.PI * u) +
          0.6 * Math.sin(Math.PI * 2 * u + clock * 1.3 + k) * Math.sin(Math.PI * u);
        const sh = shake * 1.2 * Math.sin(clock * 40 + i * 2 + t.ax) * Math.sin(Math.PI * u);
        p.px[i] = x0 + dx * u + nx * (b + sh);
        p.py[i] = y0 + dy * u + ny * (b + sh);
        p.pw[i] = 0.34;
        silkTone(p, i, u * len, clock, pod.phase * 7 + k * 2.3);
      }
      p.ribbon(n, SH_SILK, false, false, true);
    }
  }

  private drawClosed(p: Painter, pod: Pod): void {
    const n = pod.outline(p);
    const m = Math.floor(N * 0.45);
    const top = 0;
    const bot = N - 1;
    p.shape(n, pod.sx[m]!, pod.sy[m]!, SH_HERS, pod.sx[top]!, pod.sy[top]!, pod.sx[bot]!, pod.sy[bot]!);
    // The silk is wound round it: a few fine fibres across the front, each a shallow arc.
    for (let f = 0; f < 7; f++) {
      const s0 = 0.1 + f * 0.115 + 0.03 * Math.sin(f * 2.3);
      const s1 = s0 + 0.09 + 0.03 * Math.cos(f * 1.7);
      const k = 7;
      for (let i = 0; i < k; i++) {
        const u = i / (k - 1);
        const s = lerp(s0, s1, u) + 0.025 * Math.sin(Math.PI * u);
        const fi = clamp(s * (N - 1), 0, N - 1.001);
        const i0 = Math.floor(fi);
        const q = fi - i0;
        const sx = lerp(pod.sx[i0]!, pod.sx[i0 + 1]!, q);
        const sy = lerp(pod.sy[i0]!, pod.sy[i0 + 1]!, q);
        const a = lerp(pod.sa[i0]!, pod.sa[i0 + 1]!, q);
        const wl = lerp(pod.wl[i0]!, pod.wl[i0 + 1]!, q) * 0.92;
        const wr = lerp(pod.wr[i0]!, pod.wr[i0 + 1]!, q) * 0.92;
        // Across the body, as if round it: x by the sine of the angle round.
        const o = -Math.cos(Math.PI * u) * (u < 0.5 ? wl : wr);
        p.px[i] = sx + Math.cos(a) * o;
        p.py[i] = sy - Math.sin(a) * o;
        p.pw[i] = 0.42 * Math.sin(Math.PI * (0.1 + 0.8 * u));
      }
      p.ribbon(k, SH_FIBRE, false, false);
    }
    // The seam where it will split: a dark line, lit from inside when she stirs.
    const k = 9;
    for (let i = 0; i < k; i++) {
      const s = 0.14 + 0.72 * (i / (k - 1));
      const fi = s * (N - 1);
      const i0 = Math.min(N - 2, Math.floor(fi));
      const q = fi - i0;
      const a = lerp(pod.sa[i0]!, pod.sa[i0 + 1]!, q);
      const off = 0.18 * lerp(pod.wr[i0]!, pod.wr[i0 + 1]!, q);
      p.px[i] = lerp(pod.sx[i0]!, pod.sx[i0 + 1]!, q) + Math.cos(a) * off;
      p.py[i] = lerp(pod.sy[i0]!, pod.sy[i0 + 1]!, q) - Math.sin(a) * off;
      p.pw[i] = 0.55 * Math.sin(Math.PI * (i / (k - 1)));
    }
    p.ribbon(k, SH_SEAM, false, false);
    if (pod.leak > 0.02) {
      for (let i = 1; i < k - 1; i += 2) p.glow(p.px[i]!, p.py[i]!, 5, LEAK, 0.22 * pod.leak, 9);
    }
  }

  private drawInside(p: Painter, pod: Pod): void {
    const n = pod.outline(
      p,
      pod.kind === 'shrivel' ? 0.7 : 0.86,
      pod.split ? Math.min(1, pod.cut + 0.06) : 1,
    );
    const m = Math.floor(N * 0.45);
    p.shape(n, pod.sx[m]!, pod.sy[m]!, SH_INSIDE, pod.sx[0]!, pod.sy[0]!, pod.sx[N - 1]!, pod.sy[N - 1]!);
  }

  private readonly seam = { n: 0, pts: new Float32Array(64) };

  private drawHalves(p: Painter, pod: Pod): void {
    const sh = pod.hers ? SH_HERS : SH_HUSK;
    for (let side = -1; side <= 1; side += 2) {
      if (!pod.halves[side < 0 ? 0 : 1]) continue;
      const ang = side < 0 ? pod.halfL.x : pod.halfR.x;
      const n = pod.half(p, side, ang, this.seam);
      p.ribbon(n, sh, true, false);
      // The shell's thickness: a pale band just inside the torn seam (the inner surface, lit through the split).
      const sm0 = this.seam;
      if (sm0.n > 2) {
        const mx = pod.sx[Math.floor(N * 0.5)]!;
        for (let i = 0; i < sm0.n; i++) {
          const x = sm0.pts[i * 2]!;
          const y = sm0.pts[i * 2 + 1]!;
          // Toward the half's own side: the band lies on the shell, not in the slit.
          const o = (x >= mx ? 1 : -1) * 1.1;
          p.px[i] = x + o;
          p.py[i] = y;
          p.pw[i] = 1.1 * Math.sin((Math.PI * (i + 0.5)) / sm0.n);
        }
        p.ribbon(sm0.n, SH_SHELL_EDGE, false, false);
      }
      // The torn seam's edge is silk: it catches the moon.
      const sm = this.seam;
      if (sm.n > 1) {
        for (let i = 0; i < sm.n; i++) {
          p.px[i] = sm.pts[i * 2]!;
          p.py[i] = sm.pts[i * 2 + 1]!;
          p.pw[i] = 0.5 * Math.sin((Math.PI * (i + 0.5)) / sm.n);
          silkTone(p, i, i * 5, 0, pod.phase * 9 + side * 2);
        }
        p.ribbon(sm.n, SH_SILK, false, false, true);
      }
    }
  }

  /** A loose silk end hanging from the open bottom, swaying. */
  private drawTail(p: Painter, pod: Pod, clock: number): void {
    const len = 10 + 14 * hash1(pod.seed * 3 + 1);
    const x0 = pod.sx[N - 1]!;
    const y0 = pod.sy[N - 1]!;
    const k = 6;
    const w = wind(pod.x, clock - 0.4, pod.phase + 0.2);
    for (let i = 0; i < k; i++) {
      const u = i / (k - 1);
      p.px[i] = x0 + (w * 6 + 2 * Math.sin(clock * 1.9 + pod.phase * 6 + u * 2)) * u * u;
      p.py[i] = y0 + len * u;
      p.pw[i] = 0.32 * (1 - 0.5 * u);
      silkTone(p, i, u * len, clock, pod.phase * 5 + 1.7);
    }
    p.ribbon(k, SH_SILK, false, false, true);
  }

  private drawStrand(p: Painter, s: Strand, sh: Shade, w: number): void {
    const fade = s.life < 1e8 ? sat((s.life - s.age) / 1.5) * sat(s.age * 4) : 1;
    if (fade <= 0.01) return;
    for (let k = 0; k < s.n; k++) {
      p.px[k] = s.x[k]!;
      p.py[k] = s.y[k]!;
      p.pw[k] = w * (1 - 0.4 * (k / (s.n - 1)));
    }
    const a = sh.alpha;
    sh.alpha = (a ?? 1) * s.alpha * fade * 2;
    p.ribbon(s.n, sh, false, false);
    sh.alpha = a;
  }

  private drawFlakes(p: Painter): void {
    const tmp: [number, number, number] = [0, 0, 0];
    for (const f of this.flakes) {
      if (!f.on) continue;
      const face = Math.cos(f.flip);
      // A flake turning its face to the moon catches it.
      const lit = sat(face) * (0.35 + 0.65 * f.lit);
      mixInto(tmp, FLAKE_DARK, FLAKE_LIT, lit);
      const fade = sat((f.life - f.age) / 1.2) * sat(f.age * 10);
      const ux = Math.cos(f.a) * f.size;
      const uy = Math.sin(f.a) * f.size;
      p.flake(f.x, f.y, ux, uy, f.size * f.aspect * (0.25 + 0.75 * Math.abs(face)), tmp, 0.95 * fade);
    }
  }
}

function mixInto(out: [number, number, number], a: RGB, b: RGB, t: number): void {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

/** Sets a painter up for the props: the moon as a crisp rim from the upper right, a faint cool fill. */
export function propLight(p: Painter): void {
  p.lx = -KEY_LIGHT.dirX;
  p.ly = -KEY_LIGHT.dirY;
  p.keyColor = rgb(KEY_LIGHT.color);
  p.coolColor = [0.32, 0.42, 0.58];
  p.keyK = 1;
  p.coolK = 0.35;
  p.outline = 0;
  p.grade = null;
  p.dimK = 0;
  p.alphaK = 1;
  p.glowK = 1;
}
