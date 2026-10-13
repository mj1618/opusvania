// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Slash style 1, "brush" (the Hollow Knight school): one flat, hard-edged, near-white mark per
 * cut, shaped like a brush stroke. It grows out of her hand with the blade at its head: a hair at
 * the start, a fat belly where the blade is fastest, a quick point at the end. The outer edge (the
 * blade point's path, at the sim's reach) is clean; the inner edge is torn: seeded notches and a
 * few dry bristle lines, so no two marks are the same. Full for two frames, then it thins and
 * breaks into short streaks and is gone by frame six. Opaque throughout (post's hero matte turns
 * partial alpha into dark glass), a hair of dusk under it so it reads on a bright backdrop.
 */
import { sat, smoothstep } from '../../hooded/math';
import type { Painter, RGB } from '../paint';
import { ARC_N, Arc, arcTangent, Bits, Rand } from './common';
import type { CutInfo, SlashFrame, SlashStyle, StrokeAt } from './types';

export const BRUSH = {
  /** Belly thickness as a fraction of the reach: a cut, the finisher. */
  thick: [0.25, 0.3],
  /** Frames at full strength from the first frame of the cut, and frames it then takes to break up. */
  full: [2.2, 3.2],
  fade: [3.6, 4.4],
  /** How far the start of the mark is tucked in toward her hand (fraction of the reach). */
  tuck: 0.6,
  /** The finisher's echo: radius and thickness relative to the mark, frames late. */
  echoR: 0.68,
  echoThick: 0.3,
  echoLate: 1,
  /** Dusk under-stroke: px it stands proud, alpha. */
  duskW: 1.4,
  dusk: 0.6,
  /** The impact star: seconds, px half-length along / across the cut. */
  star: 0.075,
  starLong: 34,
  starShort: 15,
} as const;

const WHITE: RGB = [1, 0.975, 0.9];
const TAIL: RGB = [0.9, 0.93, 1];
const DUSK: RGB = [0.07, 0.05, 0.14];
const STREAK = 0;
const FLECK = 1;
const NOTCH = 4;
const GAP = 5;
const BRISTLE = 2;
const tan = { x: 0, y: 0 };

export class BrushSlash implements SlashStyle {
  readonly id = 'brush';
  readonly spot = 0;
  private readonly arc = new Arc();
  private readonly bits = new Bits(48);
  private readonly rnd = new Rand(0x51a5);
  private count = 0;
  private liveBits = 0;
  // Seeded per cut: notches in the inner edge, where it breaks, the bristle lines.
  private readonly nPos = new Float32Array(NOTCH * 2);
  private readonly nDepth = new Float32Array(NOTCH * 2);
  private readonly nWide = new Float32Array(NOTCH * 2);
  private readonly gPos = new Float32Array(GAP);
  private readonly bR = new Float32Array(BRISTLE);
  private readonly bV0 = new Float32Array(BRISTLE);
  private readonly bV1 = new Float32Array(BRISTLE);
  /** Where a blow cut the mark (-1 = nowhere). */
  private cutV = -1;
  private hitX = 0;
  private hitY = 0;
  private hitDx = 1;
  private hitDy = 0;
  private hitT = 9;
  private hitPower = 1;
  private flecked = false;

  get live(): boolean {
    return this.arc.head >= 0 || this.liveBits > 0 || this.hitT < BRUSH.star;
  }

  clear(): void {
    this.arc.clear();
    this.bits.clear();
    this.liveBits = 0;
    this.hitT = 9;
    this.cutV = -1;
  }

  begin(cut: CutInfo, at: StrokeAt): void {
    // The mark starts well before the blade clears her: a hair at first, so it grows from the hand.
    this.arc.begin(cut, at, cut.show * (cut.heavy ? 0.75 : 0.45));
    this.cutV = -1;
    this.flecked = false;
    const r = this.rnd;
    r.seed(0x51a5 + 7919 * ++this.count);
    for (let k = 0; k < NOTCH * 2; k++) {
      this.nPos[k] = 0.3 + 0.62 * ((k % NOTCH) + 0.15 + 0.7 * r.next()) * (1 / NOTCH);
      this.nDepth[k] = 0.14 + 0.3 * r.next();
      this.nWide[k] = 0.14 + 0.16 * r.next();
    }
    for (let k = 0; k < GAP; k++) this.gPos[k] = 0.12 + 0.8 * (k + 0.2 + 0.6 * r.next()) * (1 / GAP);
    for (let k = 0; k < BRISTLE; k++) {
      this.bR[k] = 1.25 + 0.4 * k + 0.2 * r.next();
      this.bV0[k] = 0.1 + 0.2 * r.next();
      this.bV1[k] = 0.5 + 0.2 * r.next() - 0.1 * k;
    }
  }

  frame(f: SlashFrame): void {
    const a = this.arc;
    a.frame(f);
    // A cut that was dropped before it finished (a dash, a hurt) still dies away.
    if (a.head >= 0 && a.doneT < 0 && f.cutQ < 0) a.doneT = 0;
    this.hitT += f.dt;
    this.liveBits = this.bits.step(f.dt, 9, 0);
    // The finisher throws a few flecks off its point as it completes.
    if (a.cut.heavy && a.doneT >= 0 && !this.flecked && a.n > 3) {
      this.flecked = true;
      const i = a.n - 1;
      arcTangent(a, i, tan);
      const r = this.rnd;
      for (let k = 0; k < 7; k++) {
        const sp = 260 + 420 * r.next();
        const an = r.sym() * 0.42;
        const c = Math.cos(an);
        const s = Math.sin(an);
        const b = this.bits.add(
          FLECK,
          a.x(i, 0.8 + 0.2 * r.next()),
          a.y(i, 0.8 + 0.2 * r.next()),
          (tan.x * c - tan.y * s) * sp + f.vx * 0.5,
          (tan.x * s + tan.y * c) * sp + f.vy * 0.5,
          0.07 + 0.06 * r.next(),
          1 + 0.8 * r.next(),
        );
        b.tint = r.next();
      }
    }
    const h = a.cut.heavy ? 1 : 0;
    const end = (BRUSH.full[h]! + BRUSH.fade[h]! + (h ? BRUSH.echoLate : 0)) / 60;
    if (a.t > end) a.clear();
  }

  hit(x: number, y: number, dx: number, dy: number, power: number): void {
    const a = this.arc;
    a.pin();
    if (a.n > 2) this.cutV = a.nearest(x, y) / (ARC_N - 1);
    this.hitX = x;
    this.hitY = y;
    this.hitDx = dx;
    this.hitDy = dy;
    this.hitT = 0;
    this.hitPower = power;
    // Hard streaks along the cut, a couple thrown back off the surface.
    const r = this.rnd;
    const count = 5 + 2 * power;
    const a0 = Math.atan2(dy, dx);
    for (let c = 0; c < count; c++) {
      const back = c >= count - 2;
      const an = a0 + (back ? Math.PI + r.sym() * 0.8 : r.sym() * 0.5);
      const sp = (back ? 380 : 620) + r.next() * (back ? 300 : 620) * (0.8 + 0.2 * power);
      const b = this.bits.add(STREAK, x, y, Math.cos(an) * sp, Math.sin(an) * sp, 0.055 + 0.04 * r.next(), 1);
      b.size = 0.9 + 0.7 * r.next();
    }
    this.liveBits = 1;
  }

  draw(p: Painter, f: SlashFrame): void {
    const a = this.arc;
    if (a.n > 2) {
      const h = a.cut.heavy ? 1 : 0;
      if (h) this.mark(p, f, BRUSH.echoR, BRUSH.echoThick, BRUSH.echoLate, NOTCH);
      this.mark(p, f, 1, 1, 0, 0);
    }
    // Sparks and flecks: crisp white slivers along their flight.
    for (const b of this.bits.list) {
      if (!b.live) continue;
      const t = b.age / b.life;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const len = b.kind === STREAK ? 5 + sp * 0.02 : 3 + sp * 0.012;
      const w = b.size * (1 - 0.6 * t);
      p.flake(b.x, b.y, (b.vx / sp) * len, (b.vy / sp) * len, w + 1, DUSK, 0.5);
      p.flake(b.x, b.y, (b.vx / sp) * len, (b.vy / sp) * len, w, WHITE, 1);
    }
    // The impact: a sharp four-point star, long along the cut, that thins as it opens.
    if (this.hitT < BRUSH.star) {
      const k = this.hitT / BRUSH.star;
      const big = 1 + 0.4 * (this.hitPower - 1);
      const open = 0.55 + 0.45 * Math.sqrt(k);
      const w = (3.2 * (1 - k) + 0.5) * big;
      const lx = this.hitDx * BRUSH.starLong * big * open;
      const ly = this.hitDy * BRUSH.starLong * big * open;
      const sx = -this.hitDy * BRUSH.starShort * big * open;
      const sy = this.hitDx * BRUSH.starShort * big * open;
      p.flake(this.hitX, this.hitY, lx * 1.04, ly * 1.04, w + 1.3, DUSK, 0.6);
      p.flake(this.hitX, this.hitY, sx * 1.06, sy * 1.06, w * 0.8 + 1.3, DUSK, 0.6);
      p.flake(this.hitX, this.hitY, lx, ly, w, WHITE, 1);
      p.flake(this.hitX, this.hitY, sx, sy, w * 0.8, WHITE, 1);
    }
  }

  /** One brush mark at `rk` x the reach, `tk` x the thickness, `late` frames behind; `ns` = notch seed offset. */
  private mark(p: Painter, f: SlashFrame, rk: number, tk: number, late: number, ns: number): void {
    const a = this.arc;
    const { px, py, gx, gy, gc } = p;
    const h = a.cut.heavy ? 1 : 0;
    const echo = rk < 1;
    const R = a.cut.reach;
    const T = BRUSH.thick[h]! * tk;
    // Frames since the cut began.
    const af = a.t * 60 - late;
    if (late > 0 && a.t * 60 < late) return;
    const full = BRUSH.full[h]!;
    const fade = BRUSH.fade[h]!;
    const d = sat((af - full) / fade);
    if (d >= 1) return;
    const thin = (1 - d) ** 2.2 * (1 - 0.35 * sat(af - full + 1));
    const gapW = d > 0 ? 0.01 + 0.07 * d : 0;
    const head = a.doneT >= 0 ? 2 : a.head;
    const tone = 0.42 + 0.58 * sat(f.pale * 1.25);
    const n = a.n;
    // The echo is only the later part of the arc.
    const v0 = echo ? 0.3 : 0;
    for (let pass = 0; pass < 2; pass++) {
      let m = 0;
      for (let i = 0; i < n; i++) {
        const v = i / (ARC_N - 1);
        if (v < v0) continue;
        const vv = (v - v0) / (1 - v0);
        const belly = Math.sin(Math.PI * vv ** (h ? 2.5 : 1.9)) ** 0.9;
        // While the cut runs the head is a short blunt point at the blade.
        const hk = sat((head - v) / 0.1 + 0.06) ** 0.6;
        // It dies from the tail and breaks where the gaps open.
        let brk = sat((vv - 0.3 * d) / 0.08);
        if (gapW > 0)
          for (let k = 0; k < GAP; k++)
            brk *= sat((Math.abs(v - this.gPos[k]!) - gapW * (0.6 + 0.2 * k)) / 0.02);
        // Where a blow landed the mark is cut through.
        if (this.cutV >= 0 && !echo) brk *= sat((Math.abs(v - this.cutV) - 0.022) / 0.012);
        let notch = 0;
        for (let k = 0; k < NOTCH; k++) {
          // A barb: torn open sharply on the blade's side, closing slowly back toward the tail.
          const dv = this.nPos[ns + k]! - v;
          const q = dv >= 0 ? 1 - dv / this.nWide[ns + k]! : 1 + dv / 0.006;
          if (q > 0) notch = Math.max(notch, this.nDepth[ns + k]! * q);
        }
        const th = T * belly * hk * thin * brk * (1 - notch);
        const ro = rk * (1 - BRUSH.tuck * (1 - vv) ** 2.6) + (pass === 0 ? BRUSH.duskW / R : 0);
        const ri = ro - th - (pass === 0 ? (2 * BRUSH.duskW * Math.min(1, th * R * 0.5)) / R : 0);
        px[m] = a.x(i, ro);
        py[m] = a.y(i, ro);
        gx[m] = a.x(i, th <= 0 ? ro : ri);
        gy[m] = a.y(i, th <= 0 ? ro : ri);
        if (pass === 0) {
          gc[m * 3] = DUSK[0]!;
          gc[m * 3 + 1] = DUSK[1]!;
          gc[m * 3 + 2] = DUSK[2]!;
        } else {
          const c = smoothstep(0, 0.5, vv);
          gc[m * 3] = (TAIL[0]! + (WHITE[0]! - TAIL[0]!) * c) * tone;
          gc[m * 3 + 1] = (TAIL[1]! + (WHITE[1]! - TAIL[1]!) * c) * tone;
          gc[m * 3 + 2] = (TAIL[2]! + (WHITE[2]! - TAIL[2]!) * c) * tone;
        }
        m++;
      }
      p.strip(m, pass === 0 ? BRUSH.dusk * (echo ? 0.6 : 1) : 1);
    }
    if (echo) return;
    // Dry bristle lines inside the torn edge: hair-thin, each its own length.
    for (let k = 0; k < BRISTLE; k++) {
      let m = 0;
      for (let i = 0; i < n; i++) {
        const v = i / (ARC_N - 1);
        if (v < this.bV0[k]! || v > this.bV1[k]! || v > head) continue;
        const u = (v - this.bV0[k]!) / (this.bV1[k]! - this.bV0[k]!);
        const belly = Math.sin(Math.PI * v ** 1.9) ** 0.9;
        const ro = 1 - BRUSH.tuck * (1 - v) ** 2.6 - T * (0.25 + belly) * this.bR[k]!;
        const w = (Math.sin(Math.PI * u) ** 0.7 * (1.3 - 0.3 * k) * thin * sat(1.4 - 2.2 * d - u * d)) / R;
        px[m] = a.x(i, ro);
        py[m] = a.y(i, ro);
        gx[m] = a.x(i, ro - w);
        gy[m] = a.y(i, ro - w);
        gc[m * 3] = WHITE[0]! * tone;
        gc[m * 3 + 1] = WHITE[1]! * tone;
        gc[m * 3 + 2] = WHITE[2]! * tone;
        m++;
      }
      p.strip(m, 1);
    }
  }
}
