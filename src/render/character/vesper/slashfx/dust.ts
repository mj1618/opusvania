// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Slash style 3, "scale-dust" (hers alone: a moth's weapon). The cut itself is only a razor line
 * of light along the arc for two frames. What stays is what the cut tears loose: the scales of
 * her wings, a fan of fine gold and violet flecks thrown along the stroke, tumbling (each one
 * flashes as it turns face on), drifting and gone in a third of a second. Many small crisp
 * particles, no glow. The wings' eye-spots flash once with every cut. The finisher throws a wide
 * crescent and a ring of scales from both wings; a blow bursts them from the contact in a tight spray.
 */
import { sat } from '../../hooded/math';
import type { Painter, RGB } from '../paint';
import { ARC_N, Arc, arcTangent, Bits, Rand } from './common';
import type { CutInfo, SlashFrame, SlashStyle, StrokeAt } from './types';

export const DUST = {
  /** Scales per arc sample: a cut, the finisher. */
  perSample: [2.3, 3.6],
  /** Seconds a scale lasts (shortest, extra). */
  life: [0.2, 0.22],
  /** The cut line: half-width px, frames at full, frames to thin out. */
  line: [1.0, 1.35],
  lineFull: 1.2,
  lineFade: 2.4,
  tuck: 0.5,
  /** The eye-spot flash, seconds. */
  spot: 0.16,
} as const;

const LINE: RGB = [1, 0.97, 0.88];
const TINTS: readonly RGB[] = [
  [1, 0.96, 0.84],
  [1, 0.85, 0.52],
  [0.93, 0.64, 0.3],
  [0.78, 0.66, 0.98],
  [0.52, 0.38, 0.8],
];
const tan = { x: 0, y: 0 };

export class DustSlash implements SlashStyle {
  readonly id = 'scale-dust';
  readonly smear = 'hair';
  private readonly arc = new Arc();
  private readonly bits = new Bits(520);
  private readonly rnd = new Rand(0xd057);
  private liveBits = 0;
  private spotT = 9;
  private hitT = 9;
  private hitX = 0;
  private hitY = 0;
  private hitDx = 1;
  private hitDy = 0;
  private ringed = false;

  get spot(): number {
    const u = this.spotT / DUST.spot;
    return u < 1 ? Math.sin(Math.PI * Math.sqrt(u)) : 0;
  }

  get live(): boolean {
    return this.arc.head >= 0 || this.liveBits > 0 || this.spotT < DUST.spot;
  }

  clear(): void {
    this.arc.clear();
    this.bits.clear();
    this.liveBits = 0;
    this.spotT = 9;
    this.hitT = 9;
  }

  begin(cut: CutInfo, at: StrokeAt): void {
    this.arc.begin(cut, at, cut.show * 0.6);
    this.spotT = 0;
    this.ringed = false;
  }

  private scale(x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    const r = this.rnd;
    const b = this.bits.add(0, x, y, vx, vy, life, size);
    b.rot = r.next() * 6.283;
    b.spin = r.sym() * 26;
    // Mostly gold, a third violet.
    const t = r.next();
    b.tint = t < 0.16 ? 0 : t < 0.46 ? 1 : t < 0.66 ? 2 : t < 0.86 ? 3 : 4;
  }

  frame(f: SlashFrame): void {
    const a = this.arc;
    const first = a.frame(f);
    if (a.head >= 0 && a.doneT < 0 && f.cutQ < 0) a.doneT = 0;
    this.spotT += f.dt;
    this.hitT += f.dt;
    const r = this.rnd;
    const h = a.cut.heavy ? 1 : 0;
    const R = a.cut.reach;
    // The cut tears scales loose all along the part the blade just crossed.
    for (let i = first; i < a.n; i++) {
      const v = i / (ARC_N - 1);
      arcTangent(a, i, tan);
      const belly = Math.sin(Math.PI * v ** 1.2);
      let c = DUST.perSample[h]! * (0.35 + 0.65 * belly);
      while (c > 0) {
        if (c < 1 && r.next() > c) break;
        c--;
        const ro = 1 - DUST.tuck * (1 - v) ** 3;
        const rr = ro - r.next() ** 1.6 * (0.34 + 0.12 * h) * (0.3 + 0.7 * belly);
        const sp = (120 + 460 * r.next() ** 1.5) * (0.5 + 0.6 * belly) * (1 + 0.25 * h);
        const out = (r.next() - 0.25) * 150;
        const ul = Math.hypot(a.ux[i]!, a.uy[i]!) || 1;
        this.scale(
          a.x(i, rr),
          a.y(i, rr),
          tan.x * sp + (a.ux[i]! / ul) * out + f.vx * 0.35,
          tan.y * sp + (a.uy[i]! / ul) * out + f.vy * 0.35,
          DUST.life[0]! + DUST.life[1]! * r.next() + 0.06 * h,
          (0.75 + 1.25 * r.next() ** 1.8) * (1 + 0.15 * h) * (R > 0 ? 1 : 1),
        );
      }
    }
    // The finisher: both wings are thrown wide and a ring of scales leaves their hems.
    if (h && !this.ringed && a.n > 0) {
      this.ringed = true;
      for (let k = 0; k < 10; k++) {
        const x = f.hem[k * 2]!;
        const y = f.hem[k * 2 + 1]!;
        const dx = x - f.chestX;
        const dy = y - f.chestY;
        const dl = Math.hypot(dx, dy) || 1;
        for (let c = 0; c < 5; c++) {
          const sp = 90 + 300 * r.next();
          const an = r.sym() * 0.5;
          const cs = Math.cos(an);
          const sn = Math.sin(an);
          this.scale(
            x + r.sym() * 4,
            y + r.sym() * 4,
            ((dx * cs - dy * sn) / dl) * sp + f.vx * 0.3,
            ((dx * sn + dy * cs) / dl) * sp + f.vy * 0.3 - 20,
            0.24 + 0.26 * r.next(),
            0.8 + 1.1 * r.next(),
          );
        }
      }
    }
    this.liveBits = this.bits.step(f.dt, 5.5, 60);
    if (a.t > (DUST.lineFull + DUST.lineFade) / 60) a.clear();
  }

  hit(x: number, y: number, dx: number, dy: number, power: number): void {
    this.arc.pin();
    this.hitT = 0;
    this.hitX = x;
    this.hitY = y;
    this.hitDx = dx;
    this.hitDy = dy;
    const r = this.rnd;
    const a0 = Math.atan2(dy, dx);
    const count = 22 + 16 * power;
    for (let c = 0; c < count; c++) {
      const an = a0 + r.sym() * r.next() * 0.75;
      const sp = 220 + 760 * r.next() ** 1.4;
      this.scale(
        x + r.sym() * 3,
        y + r.sym() * 3,
        Math.cos(an) * sp,
        Math.sin(an) * sp,
        0.16 + 0.24 * r.next(),
        0.8 + 1.3 * r.next() ** 1.6,
      );
    }
    this.liveBits = 1;
  }

  /** The cut line's strength along the arc: the finisher's only shows in front of her (a whole arch over her head reads as a dome). */
  private lineShape(v: number, h: number): number {
    return Math.sin(Math.PI * v ** 1.1) ** 0.6 * (h ? sat((v - 0.3) / 0.3) : 1);
  }

  draw(p: Painter, f: SlashFrame): void {
    const a = this.arc;
    const { px, py, gx, gy, gc, pw, pc } = p;
    const tone = 0.5 + 0.5 * sat(f.pale * 1.2);
    for (const b of this.bits.list) {
      if (!b.live) continue;
      const t = b.age / b.life;
      // Tumbling: seen edge on it is a hair, face on a small bright lozenge.
      const face = Math.abs(Math.cos(b.rot * 1.7 + b.age * 9));
      const s = b.size * (1 - t * t * t) * Math.min(1, 0.4 + t * 9);
      const c = TINTS[b.tint | 0]!;
      const sp = Math.hypot(b.vx, b.vy);
      // Fast, it is drawn along its flight; slow, along its own turn.
      const k = sat(sp / 260);
      const ax = Math.cos(b.rot) * (1 - k) + (b.vx / (sp || 1)) * k;
      const ay = Math.sin(b.rot) * (1 - k) + (b.vy / (sp || 1)) * k;
      const len = s * (1.5 + sp * 0.006);
      const lit = (0.62 + 0.38 * face) * tone;
      LIT[0] = c[0]! * lit;
      LIT[1] = c[1]! * lit;
      LIT[2] = c[2]! * lit;
      p.flake(b.x, b.y, ax * len, ay * len, s * (0.28 + 0.6 * face), LIT, 1);
    }
    if (a.n > 3) {
      const h = a.cut.heavy ? 1 : 0;
      const R = a.cut.reach;
      const af = a.t * 60;
      const d = sat((af - DUST.lineFull) / DUST.lineFade);
      const head = a.doneT >= 0 ? 2 : a.head;
      const n = a.n;
      const W = DUST.line[h]! * (1 - d);
      for (let i = 0; i < n; i++) {
        const v = i / (ARC_N - 1);
        const sh = this.lineShape(v, h) * sat((head - v) / 0.06 + 0.1) * sat((v - 0.7 * d) / 0.1);
        const ro = 1 - DUST.tuck * (1 - v) ** 3;
        const hw = (W * sh) / R;
        px[i] = a.x(i, ro + hw);
        py[i] = a.y(i, ro + hw);
        gx[i] = a.x(i, ro - hw);
        gy[i] = a.y(i, ro - hw);
        gc[i * 3] = LINE[0]! * tone;
        gc[i * 3 + 1] = LINE[1]! * tone;
        gc[i * 3 + 2] = LINE[2]! * tone;
      }
      p.strip(n, 1);
      // A breath of light on the line so it carries on a dark backdrop.
      for (let i = 0; i < n; i++) {
        const v = i / (ARC_N - 1);
        const ro = 1 - DUST.tuck * (1 - v) ** 3;
        const sh = this.lineShape(v, h) * sat((head - v) / 0.06 + 0.1);
        px[i] = a.x(i, ro);
        py[i] = a.y(i, ro);
        pw[i] = 2.6 + 1.2 * h;
        pc[i * 3] = 0.5 * tone * sh * (1 - d) ** 2;
      }
      p.streak(n, LINE);
    }
    // The blow: a hard white sliver across the cut for two frames.
    if (this.hitT < 0.045) {
      const k = this.hitT / 0.045;
      const l = 22 + 16 * k;
      p.flake(this.hitX, this.hitY, this.hitDx * l, this.hitDy * l, 2.4 * (1 - k) + 0.4, LINE, 1);
      p.flake(
        this.hitX,
        this.hitY,
        -this.hitDy * l * 0.4,
        this.hitDx * l * 0.4,
        1.8 * (1 - k) + 0.3,
        LINE,
        1,
      );
    }
  }
}

const LIT: [number, number, number] = [0, 0, 0];
