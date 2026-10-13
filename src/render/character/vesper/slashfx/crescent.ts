// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The slash mark: ONE clean, opaque, hard-edged crescent per cut (the Hollow Knight nail slash's
 * principles, in her tones), and the contact flash where a blow lands.
 *
 * The crescent's inner edge is the path the blade's point travels; its outer edge swells from
 * that path out to the sim's reach, most at the middle, nothing at the two ends: thickest in the
 * middle, needle points at both ends, and the blade in her hand ends on its leading point. It stands whole in front of her from the first active frame (its
 * leading end drawn back to the blade on that frame, so the blade is its head), holds, then thins
 * from the inside and from its tail and is gone: about five frames, plus the hitstop. It hangs from
 * a fixed offset on her body, so it moves with her and never drifts or stays behind. Every cut
 * (1, 2, finisher, up, down, in the air) is this one shape on a different arc.
 *
 * Flat tones only: a pale cool cream, a thin lilac line along the inner edge, a hair of dusk round
 * it so it keeps its edge on a pale backdrop. No glow, no gradient, nothing left in the air.
 */
import { sat } from '../../hooded/math';
import type { Painter, RGB } from '../paint';
import type { CutInfo, SlashFrame, StrokeAt } from './types';

export const CRESCENT = {
  /** Its tone in the darkest zone, as a fraction of the cream (1 in the amber centre). */
  toneDark: 0.84,
  /** Samples along it. */
  n: 44,
  /** Frames it stands whole (a cut, the finisher), then frames it takes to thin away. */
  full: [2, 3],
  fade: 3,
  /** How the belly is shaped along it: > 1 moves the thickest part toward the leading end. */
  skew: 1.12,
  /** > 1 draws the two ends out into longer needles. */
  needle: 1.15,
  /** While it thins the tail end is drawn up toward the leading end by this fraction. */
  retreat: 0.42,
  /** It stands whole once the cut has got this far (the first active frame shows about 0.83). */
  whole: 0.7,
  /** The inner line: px wide at the belly, and never more than this fraction of the thickness. */
  line: 2.4,
  lineMax: 0.22,
  /** The dusk hair round it, px. */
  dusk: 1.1,
  /**
   * In hitstop it does not stand there whole over what it hit: over `holdIn` frames of the freeze it
   * thins to `holdThin` of its belly (toward the outer edge: a line round the target, not a lid on it).
   */
  holdThin: 0.42,
  holdIn: 2,
  /** A cut that glanced off: what is left of the crescent, as a fraction of its arc and of its belly. */
  clangArc: 0.62,
  clangThin: 0.5,
  /** Contact flash: frames; half-lengths along / across the cut, px; half-width px. */
  flash: 4,
  long: 44,
  short: 15,
  flashW: 3.2,
  /** Specks thrown along the cut: how many (a cut, the finisher), frames they live. */
  specks: [3, 5],
  speckLife: 4,
} as const;

const CREAM: RGB = [0.95, 0.955, 0.9];
const LINE: RGB = [0.6, 0.6, 0.8];
const DUSK: RGB = [0.07, 0.05, 0.14];
const tv = { x: 0, y: 0 };
const MAX_SPECK = 8;

/**
 * Post grades the zones differently (`View.pale`: 0.72 left, 0.94 centre, 0.68 right): the same
 * cream that sits right on the amber centre glares on the dark blue and violet sides.
 */
function toneFor(pale: number): number {
  return CRESCENT.toneDark + (1 - CRESCENT.toneDark) * sat((pale - 0.68) / 0.26);
}

export class SlashMark {
  private readonly ux = new Float32Array(CRESCENT.n);
  private readonly uy = new Float32Array(CRESCENT.n);
  private cut: CutInfo = {
    dir: 'fwd',
    step: 1,
    heavy: false,
    facing: 1,
    reach: 110,
    show: 0.2,
    thick: 0.27,
    wide: 1,
  };
  private on = false;
  /** A cut's arc is laid (so a late hit can call the crescent back). */
  private laid = false;
  /** Frames since the crescent appeared (stands still in hitstop). */
  private age = 0;
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
    if (!this.on) return;
    const c = this.cut;
    if (f.cutQ >= 0) {
      // Whole as soon as the blade is most of the way round: that is the first active frame.
      const h = f.cutQ > CRESCENT.whole ? 1 : sat((f.cutQ - c.show) / (1 - c.show) + 0.06);
      if (h > this.head) this.head = h;
    } else if (this.head < 1) {
      // The cut was dropped (a dash, a blow): what is there thins away.
      this.head = Math.max(this.head, 0.5);
    }
    if (f.held) this.heldFor += frames;
    else this.age += frames;
    if (this.age > CRESCENT.full[c.heavy ? 1 : 0]! + CRESCENT.fade + 0.5) this.on = false;
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
        }
      } else {
        // Glanced off: it never got through. What is left is the near part, thin, and it goes fast.
        this.arc = CRESCENT.clangArc;
        this.age = Math.max(this.age, full + 1);
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

  draw(p: Painter, f: SlashFrame): void {
    if (this.on) this.crescent(p, f);
    if (this.hAge < CRESCENT.flash) this.contact(p, f);
  }

  private crescent(p: Painter, f: SlashFrame): void {
    const c = this.cut;
    const N = CRESCENT.n;
    const R = c.reach;
    const full = CRESCENT.full[c.heavy ? 1 : 0]!;
    // `age` is 1 on the frame it appears: whole for `full` frames, then it thins over `fade`.
    const d = sat((this.age - full) / (CRESCENT.fade + 1));
    if (d >= 1) return;
    const hold = 1 - (1 - CRESCENT.holdThin) * sat(this.heldFor / CRESCENT.holdIn);
    const thin = Math.min((1 - d) ** 1.35, hold) * (this.arc < 1 ? CRESCENT.clangThin : 1);
    const v0 = CRESCENT.retreat * d * this.arc;
    const v1 = this.head * this.arc;
    const gy0 = f.groundY ?? Number.POSITIVE_INFINITY;
    if (v1 - v0 < 0.08) return;
    const tone = toneFor(f.pale);
    const { px, py, gx, gy, gc } = p;
    const ux = this.ux;
    const uy = this.uy;
    // pass 0: the dusk hair; 1: the cream body; 2: the inner line.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < N; i++) {
        // The whole shape (needle, belly, needle) lies between v0 and v1 of the arc.
        const w = i / (N - 1);
        const v = (v0 + (v1 - v0) * w) * (N - 1);
        const i0 = Math.min(N - 2, Math.floor(v));
        const fr = v - i0;
        const x = ux[i0]! + (ux[i0 + 1]! - ux[i0]!) * fr;
        const y = uy[i0]! + (uy[i0 + 1]! - uy[i0]!) * fr;
        const belly = Math.sin(Math.PI * w ** CRESCENT.skew) ** CRESCENT.needle;
        // The two needle ends lie on the blade point's own path (`1 - thick` of the reach); the
        // belly swells out from it to the full reach. Thinning, the outer edge stays.
        let ro = 1 - c.thick * (1 - belly);
        const th = c.thick * belly * thin;
        let ri = ro - th;
        let col = CREAM;
        let k = tone;
        if (pass === 0) {
          const g = (CRESCENT.dusk / R) * Math.min(1, th * R * 0.4);
          ro += g;
          ri -= g;
          col = DUSK;
          k = 1;
        } else if (pass === 2) {
          const lw = Math.min(CRESCENT.line / R, th * CRESCENT.lineMax) * sat((th * R - 4) / 6);
          ro = ri + lw;
          col = LINE;
        }
        px[i] = f.ox + x * R * ro;
        py[i] = Math.min(gy0, f.oy + y * R * ro);
        gx[i] = f.ox + x * R * ri;
        gy[i] = Math.min(gy0, f.oy + y * R * ri);
        gc[i * 3] = col[0]! * k;
        gc[i * 3 + 1] = col[1]! * k;
        gc[i * 3 + 2] = col[2]! * k;
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
