// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The slash mark: ONE clean, opaque, hard-edged crescent per cut (the Hollow Knight nail slash's
 * principles, in her tones), and the contact flash where a blow lands.
 *
 * The crescent's inner edge is the path the blade's point travels; its outer edge swells from
 * that path out to its reach. It SWEEPS out of the blade: on the first active frame it is drawn
 * only as far as the blade has got, thickest near the blade end; on the next it is whole, with its
 * leading needle on the blade's point. On those two cream frames its body is a filled wedge in the
 * leading part (its weight at play zoom), a hair behind; then it thins to a line and is gone:
 * four frames (five on the finisher). In hitstop it stays where the blade stopped, thins to a dim
 * line within two frames and shivers. About one of her heights tall, never the brightest thing on
 * screen for more than two frames. Every cut is this one shape on a different arc.
 *
 * Flat tones only: a pale cool cream while it is whole, a dim lilac once it is a line, a hair of
 * dusk round it so it keeps its edge on a pale backdrop (wider round the line: on the dark blue and
 * violet sides the dark edge, not more light, is what keeps the line from being a scratch). No glow, no gradient, nothing left in the air.
 */
import { lerp, sat } from '../../hooded/math';
import type { Painter, RGB } from '../paint';
import type { CutInfo, SlashFrame, StrokeAt } from './types';

export const CRESCENT = {
  /** Its tone at its brightest, in the darkest zone and in the amber centre (fractions of the cream). */
  toneDark: 0.68,
  toneLight: 0.88,
  /** Samples along it. */
  n: 44,
  /**
   * Frames it is seen at full belly (a cut, the finisher; the first of them is the sweep-out frame),
   * then frames it takes to thin away.
   */
  full: [2, 3],
  fade: 2,
  /** How fast the belly goes while it thins (higher = a line sooner). */
  thinPow: 2.2,
  /** > 1 draws the two ends out into longer needles. */
  needle: 1.15,
  /** The sweep-out frame: the belly sits this far toward the blade end (see `CutInfo.skew`). */
  sweepSkew: 1.75,
  /** While it thins the tail end is drawn up toward the leading end by this fraction. */
  retreat: 0.5,
  /** Once it is thinner than this (px at the belly) it stays this thick until it is gone: a line that reads at play zoom. */
  linePx: 3.3,
  /**
   * Its weight (playtest 6: at play zoom the whole crescent was a 1-2 px outline): while it is cream
   * (the first two frames it is seen; a hit's frame and the first frame of the freeze) its body is a
   * WEDGE in the leading part, not an even belly: s^tail (1-s)^tip along its length, so thickest
   * tail / (tail + tip) of the way along (~0.62), tapering to the needle on the blade, a hair that
   * thickens slowly behind (one smooth curve: a peak with a corner read as a flag). Peak `wedge` x the
   * stroke's belly (less on the finisher, already a big round mark, and on the pogo's short bowl: at
   * 1.8 both were lids). The same cream, more of it where the eye is: weight, not glare.
   */
  wedge: 1.7,
  wedgeHeavy: 1.3,
  wedgeDown: 1.3,
  wedgeTail: 2,
  wedgeTip: 1.2,
  /** The inner line: px wide at the belly, and never more than this fraction of the thickness. */
  line: 1.6,
  lineMax: 0.2,
  /**
   * The dusk hair round it, px: round the cream wedge, and round the line it thins to (wider: on the
   * blue and violet sides a dim lilac line is near the backdrop's value, a dark edge keeps it apart).
   */
  dusk: 1.1,
  duskLine: 2,
  /**
   * In hitstop it does not stand there whole over what it hit: over `holdIn` frames of the freeze it
   * thins to `holdThin` of its belly (a line that ends on the blade, not a lid on the target), and
   * shivers: `shiver` px along its length, `flutter` of its thickness.
   */
  holdThin: 0.26,
  /** Frames of the freeze it still stands whole (the blow's frame + this = its two cream frames), then frames it takes to thin. */
  holdAt: 1,
  holdIn: 1.6,
  /** Held, the line is never thinner than this (px): the freeze is the longest it is seen. */
  holdPx: 4.6,
  shiver: 1.3,
  flutter: 0.22,
  /** A cut that glanced off: what is left of the crescent, as a fraction of its arc and of its belly. */
  clangArc: 0.62,
  clangThin: 0.6,
  /** Contact flash: frames; half-lengths along / across the cut, px; half-width px. */
  flash: 4,
  long: 38,
  short: 13,
  flashW: 2.8,
  /** Specks thrown along the cut: how many (a cut, the finisher), frames they live. */
  specks: [3, 5],
  speckLife: 4,
} as const;

const CREAM: RGB = [0.95, 0.955, 0.9];
/** What it is once it is a line: a dim lilac (x the zone's tone). */
const DIM: RGB = [0.68, 0.67, 0.9];
const LINE: RGB = [0.6, 0.6, 0.8];
const DUSK: RGB = [0.07, 0.05, 0.14];
const tv = { x: 0, y: 0 };
const MAX_SPECK = 8;

/**
 * Post grades the zones differently (`View.pale`: 0.72 left, 0.94 centre, 0.68 right): the same
 * cream that sits right on the amber centre glares on the dark blue and violet sides.
 */
function toneFor(pale: number): number {
  return lerp(CRESCENT.toneDark, CRESCENT.toneLight, sat((pale - 0.68) / 0.26));
}

export class SlashMark {
  private readonly ux = new Float32Array(CRESCENT.n);
  private readonly uy = new Float32Array(CRESCENT.n);
  /** Where each sample of the drawn span lies along it by length, 0..1 (the wedge is laid out on this). */
  private readonly sl = new Float32Array(CRESCENT.n);
  private cut: CutInfo = {
    dir: 'fwd',
    step: 1,
    heavy: false,
    facing: 1,
    reach: 88,
    q0: 0.2,
    q1: 1,
    thick: 0.13,
    wide: 1,
    skew: 1.1,
  };
  private on = false;
  /** A cut's arc is laid (so a late hit can call the crescent back). */
  private laid = false;
  /** Frames it has been seen (stands still in hitstop): 1 on the sweep-out frame. */
  private age = 0;
  /** This frame its leading end is the blade's point (the cut is still crossing, or has just ended on it). */
  private onBlade = false;
  /** Frames it has been held in hitstop, and how much of its arc is left after a clang. */
  private heldFor = 0;
  private arc = 1;
  /** How much of the arc the leading end has reached, 0..1. */
  private head = 0;
  // The contact flash: where, along what, how old (frames; render time, it runs through the hitstop).
  private hx = 0;
  private hy = 0;
  private hdx = 1;
  private hdy = 0;
  private hAge = 99;
  private hPower = 1;
  private hits = 0;
  // Specks: start, unit direction, reach px, half-width.
  private readonly sx = new Float32Array(MAX_SPECK);
  private readonly sy = new Float32Array(MAX_SPECK);
  private readonly sdx = new Float32Array(MAX_SPECK);
  private readonly sdy = new Float32Array(MAX_SPECK);
  private readonly sr = new Float32Array(MAX_SPECK);
  private sn = 0;

  get live(): boolean {
    return this.on || this.hAge < CRESCENT.flash;
  }

  clear(): void {
    this.on = false;
    this.laid = false;
    this.hAge = 99;
    this.sn = 0;
  }

  /** A cut begins: the crescent's arc is fixed now, in the blade frame as it is at this moment. */
  begin(cut: CutInfo, at: StrokeAt): void {
    this.cut = cut;
    const N = CRESCENT.n;
    const vert = cut.dir !== 'fwd';
    for (let i = 0; i < N; i++) {
      at(i / (N - 1), tv);
      this.ux[i] = tv.x * (vert ? cut.wide : 1);
      this.uy[i] = tv.y * (vert ? 1 : cut.wide);
    }
    this.on = true;
    this.laid = true;
    this.age = 0;
    this.head = 0;
    this.heldFor = 0;
    this.arc = 1;
  }

  /** Once per frame, before `draw`. */
  frame(f: SlashFrame): void {
    const frames = f.dt * 60;
    this.hAge += frames;
    this.onBlade = false;
    if (!this.on) return;
    const c = this.cut;
    const full = CRESCENT.full[c.heavy ? 1 : 0]!;
    if (f.held) {
      this.heldFor += frames;
      return;
    }
    // A cut that glanced off leaves nothing once the freeze lets go.
    if (this.arc < 1 && this.heldFor > 0) {
      this.on = false;
      return;
    }
    if (frames <= 0) return;
    if (f.cutQ >= 0) {
      // It reaches exactly as far as the blade's point has got (nothing until the blade moves);
      // once it has been seen for a frame, the next completes it.
      const h = this.age >= 1 || f.cutQ >= 1 ? 1 : f.cutQ > 0.02 ? sat((f.cutQ - c.q0) / (c.q1 - c.q0)) : 0;
      // (Only while it sweeps: the frame that completes it keeps the origin, or the arc would jump
      // with the blade's overshoot and her roll.)
      this.onBlade = h > this.head && h < 1;
      if (h > this.head) this.head = h;
    } else if (this.head < 1) {
      // The cut was dropped (a dash, a blow): what is there thins away.
      this.head = Math.max(this.head, 0.5);
      this.age = Math.max(this.age, full);
    }
    if (this.head > 0.08) this.age += frames;
    if (this.age >= full + CRESCENT.fade + 0.99) this.on = false;
  }

  /** Its leading end is the blade's point this frame: `leadAt` says where that end is, px from the origin. */
  get tracking(): boolean {
    return this.on && this.onBlade && this.arc >= 1;
  }

  leadAt(out: { x: number; y: number }): void {
    const N = CRESCENT.n;
    const v = this.head * (N - 1);
    const i0 = Math.min(N - 2, Math.floor(v));
    const fr = v - i0;
    const k = this.cut.reach * (1 - this.cut.thick);
    out.x = (this.ux[i0]! + (this.ux[i0 + 1]! - this.ux[i0]!) * fr) * k;
    out.y = (this.uy[i0]! + (this.uy[i0 + 1]! - this.uy[i0]!) * fr) * k;
  }

  /**
   * A blow landed at (x, y); (dx, dy) = the way the blade's point is travelling, (ax, ay) = the
   * way from her to the target (the specks fly on between the two). `power` 1 or 2; 0 = the cut
   * glanced off (a clang): a smaller cross, turned across the cut, and the specks come back at her.
   * The crescent is not touched: it belongs to her, not to what it hit.
   */
  hit(x: number, y: number, dx: number, dy: number, ax: number, ay: number, power: number): void {
    this.hx = x;
    this.hy = y;
    this.hdx = dx;
    this.hdy = dy;
    this.hAge = 0;
    this.hPower = power;
    this.hits++;
    if (this.laid) {
      const full = CRESCENT.full[this.cut.heavy ? 1 : 0]!;
      if (power > 0) {
        // The blow is always marked: a hit late in the active window (a pogo from height) finds the
        // crescent thin or gone, so it is called back whole for the freeze and thins away after it.
        if (!this.on || this.age > full) {
          this.on = true;
          this.head = 1;
          this.age = full;
          this.heldFor = 0;
        }
      } else {
        // Glanced off: it never got through. What is left is the near part, thin, and it goes fast.
        this.arc = CRESCENT.clangArc;
        this.age = Math.max(this.age, full);
      }
    }
    // A few sharp specks thrown on along the cut, fanned a little: fixed angles turned by a
    // count, so two blows in a row do not throw the same fan (no randomness needed).
    const clang = power <= 0;
    const n = clang ? 3 : CRESCENT.specks[power > 1 ? 1 : 0]!;
    let fx = clang ? -ax : dx * 0.55 + ax;
    let fy = clang ? -ay - 0.7 : dy * 0.55 + ay;
    const fl = Math.hypot(fx, fy) || 1;
    fx /= fl;
    fy /= fl;
    this.sn = n;
    for (let k = 0; k < n; k++) {
      const u = n > 1 ? k / (n - 1) - 0.5 : 0;
      const wob = Math.sin((this.hits * 2.4 + k * 1.7) * 1.3);
      const an = u * 0.8 + 0.12 * wob;
      const c = Math.cos(an);
      const s = Math.sin(an);
      this.sdx[k] = fx * c - fy * s;
      this.sdy[k] = fx * s + fy * c;
      this.sx[k] = x;
      this.sy[k] = y;
      this.sr[k] = (46 + 26 * (0.5 + 0.5 * wob) - 30 * Math.abs(u)) * (power > 1 ? 1.3 : 1);
    }
  }

  /** For capture tools: draw the crescent without the contact flash (to measure the crescent alone). */
  flashHidden = false;

  draw(p: Painter, f: SlashFrame): void {
    if (this.on) this.crescent(p, f);
    if (this.hAge < CRESCENT.flash && !this.flashHidden) this.contact(p, f);
  }

  private crescent(p: Painter, f: SlashFrame): void {
    const c = this.cut;
    const N = CRESCENT.n;
    const R = c.reach;
    const full = CRESCENT.full[c.heavy ? 1 : 0]!;
    // `age` is 1 on the frame it appears: full belly for `full` frames, then it thins over `fade`.
    const d = sat((this.age - full) / (CRESCENT.fade + 1));
    if (d >= 1) return;
    const clang = this.arc < 1;
    const hold = 1 - (1 - CRESCENT.holdThin) * sat((this.heldFor - CRESCENT.holdAt) / CRESCENT.holdIn);
    let thin = Math.min((1 - d) ** CRESCENT.thinPow, hold) * (clang ? CRESCENT.clangThin : 1);
    // Held, it shivers: a small wave runs along it and its thickness flutters. Never a frozen sticker.
    const shv = f.held ? CRESCENT.shiver : 0;
    const ph = this.heldFor * 2.7;
    if (f.held) thin *= 1 + CRESCENT.flutter * Math.sin(this.heldFor * 4.3 + 1);
    const v0 = CRESCENT.retreat * d * Math.min(this.arc, this.head);
    const v1 = Math.min(this.head, this.arc);
    const gy0 = f.groundY ?? Number.POSITIVE_INFINITY;
    if (v1 - v0 < 0.08) return;
    // Sweeping out (the blade has not got to the end yet) the belly sits at the blade end.
    const skew = this.head < 0.995 && !clang ? CRESCENT.sweepSkew : c.skew;
    // Cream while it has a belly, a dim lilac once it is a line.
    const bright = sat((thin - 0.3) / 0.45);
    const tone = toneFor(f.pale);
    const cr = lerp(DIM[0]!, CREAM[0]!, bright) * tone;
    const cg = lerp(DIM[1]!, CREAM[1]!, bright) * tone;
    const cb = lerp(DIM[2]!, CREAM[2]!, bright) * tone;
    // The wedge while it is cream (never on a cut that glanced off: that is the near part, thin).
    const wk = clang ? 0 : bright;
    const floor = (this.heldFor > 0 && !clang ? CRESCENT.holdPx : CRESCENT.linePx) / R;
    const dusk = lerp(CRESCENT.duskLine, CRESCENT.dusk, wk) / R;
    const wa = CRESCENT.wedgeTail;
    const wb = CRESCENT.wedgeTip;
    const wp = wa / (wa + wb);
    const wpk = c.dir === 'down' ? CRESCENT.wedgeDown : c.heavy ? CRESCENT.wedgeHeavy : CRESCENT.wedge;
    const wn = wpk / (wp ** wa * (1 - wp) ** wb);
    const { px, py, gx, gy, gc } = p;
    const ux = this.ux;
    const uy = this.uy;
    const sl = this.sl;
    // The wedge is laid out by length along the drawn span (the samples bunch up where the blade
    // turns slowest, at its ends: laid out on them the tip came out blunt).
    {
      let lx = 0;
      let ly = 0;
      let acc = 0;
      for (let i = 0; i < N; i++) {
        const v = (v0 + ((v1 - v0) * i) / (N - 1)) * (N - 1);
        const i0 = Math.min(N - 2, Math.floor(v));
        const fr = v - i0;
        const x = ux[i0]! + (ux[i0 + 1]! - ux[i0]!) * fr;
        const y = uy[i0]! + (uy[i0 + 1]! - uy[i0]!) * fr;
        if (i > 0) acc += Math.hypot(x - lx, y - ly);
        sl[i] = acc;
        lx = x;
        ly = y;
      }
      for (let i = 0; i < N; i++) sl[i] = acc > 0 ? sl[i]! / acc : i / (N - 1);
    }
    // pass 0: the dusk hair; 1: the body; 2: the inner line.
    for (let pass = 0; pass < 3; pass++) {
      if (pass === 2 && bright < 0.05) break;
      for (let i = 0; i < N; i++) {
        // The whole shape (needle, belly, needle) lies between v0 and v1 of the arc.
        const w = i / (N - 1);
        const v = (v0 + (v1 - v0) * w) * (N - 1);
        const i0 = Math.min(N - 2, Math.floor(v));
        const fr = v - i0;
        const x = ux[i0]! + (ux[i0 + 1]! - ux[i0]!) * fr;
        const y = uy[i0]! + (uy[i0 + 1]! - uy[i0]!) * fr;
        const even = Math.sin(Math.PI * w ** skew) ** CRESCENT.needle;
        const s = sl[i]!;
        const belly = lerp(even, s ** wa * (1 - s) ** wb * wn, wk);
        // Both ends lie on the blade point's own path (`1 - thick` of the reach); the belly swells
        // out from it. Thinning, it draws in toward that path: the line that is left is the blade's.
        const th = Math.max(c.thick * belly * thin, floor * Math.min(1, even * 2.2));
        const wob = (shv / R) * Math.sin(ph + w * 8) * Math.min(1, belly * 3);
        let ri = 1 - c.thick + wob;
        let ro = ri + th;
        let r = cr;
        let g = cg;
        let b = cb;
        if (pass === 0) {
          const dg = dusk * Math.min(1, th * R * 0.5);
          ro += dg;
          ri -= dg;
          r = DUSK[0]!;
          g = DUSK[1]!;
          b = DUSK[2]!;
        } else if (pass === 2) {
          const lw = Math.min(CRESCENT.line / R, th * CRESCENT.lineMax) * sat((th * R - 4) / 5);
          ro = ri + lw;
          r = LINE[0]! * tone;
          g = LINE[1]! * tone;
          b = LINE[2]! * tone;
        }
        px[i] = f.ox + x * R * ro;
        py[i] = Math.min(gy0, f.oy + y * R * ro);
        gx[i] = f.ox + x * R * ri;
        gy[i] = Math.min(gy0, f.oy + y * R * ri);
        gc[i * 3] = r;
        gc[i * 3 + 1] = g;
        gc[i * 3 + 2] = b;
      }
      p.strip(N, 1);
    }
  }

  /** The blow: a short hard cross at the contact point, long along the cut, and the specks. */
  private contact(p: Painter, f: SlashFrame): void {
    const t = this.hAge / CRESCENT.flash;
    const tone = toneFor(f.pale);
    const col: RGB = [CREAM[0]! * tone, CREAM[1]! * tone, CREAM[2]! * tone];
    const clang = this.hPower <= 0;
    const big = this.hPower > 1 ? 1.35 : clang ? 0.72 : 1;
    // It is largest on its first frame and only thins and lengthens a little: a flash, not a bloom.
    const open = 0.8 + 0.2 * Math.sqrt(t);
    const w = CRESCENT.flashW * big * (1 - t) ** 1.5 + 0.3;
    // (A clang's long arm lies across the cut: the blade skidding off.)
    const ux = clang ? -this.hdy : this.hdx;
    const uy = clang ? this.hdx : this.hdy;
    const lx = ux * CRESCENT.long * big * open;
    const ly = uy * CRESCENT.long * big * open;
    const sx = -uy * CRESCENT.short * big * open;
    const sy = ux * CRESCENT.short * big * open;
    p.flake(this.hx, this.hy, lx * 1.03, ly * 1.03, w + 1.1, DUSK, 1);
    p.flake(this.hx, this.hy, sx * 1.06, sy * 1.06, w * 0.7 + 1.1, DUSK, 1);
    p.flake(this.hx, this.hy, lx, ly, w, col, 1);
    p.flake(this.hx, this.hy, sx, sy, w * 0.7, col, 1);
    // Specks: short slivers that fly out along the cut and are gone with the flash.
    const st = this.hAge / CRESCENT.speckLife;
    if (st >= 1) return;
    const out = 1 - (1 - st) ** 2.2;
    for (let k = 0; k < this.sn; k++) {
      const r = 30 + this.sr[k]! * out;
      const len = (9 + 0.12 * this.sr[k]!) * (1 - st) + 1.5;
      const x = this.sx[k]! + this.sdx[k]! * r;
      const y = this.sy[k]! + this.sdy[k]! * r;
      const sw = 1.5 * (1 - st) + 0.4;
      p.flake(x, y, this.sdx[k]! * len, this.sdy[k]! * len, sw + 0.9, DUSK, 1);
      p.flake(x, y, this.sdx[k]! * len, this.sdy[k]! * len, sw, col, 1);
    }
  }
}
