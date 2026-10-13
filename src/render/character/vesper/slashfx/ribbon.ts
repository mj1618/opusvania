// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Slash style 2, "ribbon" (the Ori school): a luminous streamer laid along the blade's path. A
 * narrow, opaque pale-gold core with a short light falloff toward her (gold, then a breath of dusk
 * violet); it lasts a little longer than a brush mark and, as it goes, narrows, slides along its
 * own length and sheds a few motes. The finisher trails a second ribbon from the near wing tip.
 * A blow opens a thin ring that widens and thins. The falloff is light only (additive) and starts
 * clear of her body; nothing here is a veil.
 */
import { sat } from '../../hooded/math';
import type { Painter, RGB } from '../paint';
import { ARC_N, Arc, Bits, Rand } from './common';
import type { CutInfo, SlashFrame, SlashStyle, StrokeAt } from './types';

export const RIBBON = {
  /** Core half-width, px: a cut, the finisher. */
  core: [3.2, 4.6],
  /** Frames it lasts once complete. */
  life: [7, 9],
  /** The falloff inside the core, as a fraction of the reach, and its strength (gold, dusk). */
  fall: [0.26, 0.32],
  gold: 0.85,
  duskK: 0.5,
  /** The light on the core itself (it is what blooms): half-width as a multiple of the core's, strength. */
  halo: 3.4,
  haloK: 0.7,
  tuck: 0.5,
  /** The hit ring: seconds, px radius at the end. */
  ring: 0.085,
  ringR: 15,
  /** The finisher's second ribbon: radius and width relative to the first, frames behind it. */
  echoR: 0.74,
  echoW: 0.62,
  echoLate: 2,
} as const;

const CORE: RGB = [1, 0.95, 0.8];
const GOLD: RGB = [1, 0.8, 0.46];
const VIOLET: RGB = [0.6, 0.42, 0.9];
const HOT: RGB = [1, 0.97, 0.88];

export class RibbonSlash implements SlashStyle {
  readonly id = 'ribbon';
  readonly spot = 0;
  private readonly arc = new Arc();
  private readonly bits = new Bits(64);
  private readonly rnd = new Rand(0x71bb);
  private liveBits = 0;
  private acc = 0;
  private hitX = 0;
  private hitY = 0;
  private hitT = 9;
  private hitPower = 1;

  get live(): boolean {
    return this.arc.head >= 0 || this.liveBits > 0 || this.hitT < RIBBON.ring;
  }

  clear(): void {
    this.arc.clear();
    this.bits.clear();
    this.liveBits = 0;
    this.hitT = 9;
  }

  begin(cut: CutInfo, at: StrokeAt): void {
    this.arc.begin(cut, at, cut.show * 0.8);
  }

  frame(f: SlashFrame): void {
    const a = this.arc;
    a.frame(f);
    if (a.head >= 0 && a.doneT < 0 && f.cutQ < 0) a.doneT = 0;
    this.hitT += f.dt;
    const h = a.cut.heavy ? 1 : 0;
    const life = RIBBON.life[h]! / 60;
    // It sheds a few motes as it goes.
    if (a.doneT >= 0 && a.doneT < life && !f.held && a.n > 4) {
      this.acc += f.dt * (h ? 90 : 55);
      const r = this.rnd;
      while (this.acc >= 1) {
        this.acc -= 1;
        const d = a.doneT / life;
        const i = Math.min(a.n - 1, Math.floor((0.9 * d + (1 - 0.9 * d) * r.next()) * a.n));
        const rr = this.radius(i / (ARC_N - 1)) - 0.03 * r.next();
        this.bits.add(
          0,
          a.x(i, rr),
          a.y(i, rr),
          f.vx * 0.2 + r.sym() * 26,
          f.vy * 0.2 + r.sym() * 26 - 10,
          0.22 + 0.3 * r.next(),
          0.9 + 0.9 * r.next(),
        );
      }
    }
    this.liveBits = this.bits.step(f.dt, 3, -30);
    if (a.doneT > life + (h ? RIBBON.echoLate / 60 : 0)) a.clear();
  }

  hit(x: number, y: number, dx: number, dy: number, power: number): void {
    this.arc.pin();
    this.hitX = x;
    this.hitY = y;
    this.hitT = 0;
    this.hitPower = power;
    const r = this.rnd;
    const a0 = Math.atan2(dy, dx);
    for (let c = 0; c < 6 + 3 * power; c++) {
      const an = a0 + r.sym() * 1.5;
      const sp = 90 + 260 * r.next();
      this.bits.add(0, x, y, Math.cos(an) * sp, Math.sin(an) * sp, 0.2 + 0.25 * r.next(), 1 + r.next());
    }
    this.liveBits = 1;
  }

  /** The ribbon's centre line, as a fraction of the reach. */
  private radius(v: number): number {
    return 0.975 - RIBBON.tuck * (1 - v) ** 3;
  }

  draw(p: Painter, f: SlashFrame): void {
    const a = this.arc;
    if (a.n > 3) {
      if (a.cut.heavy) this.streamer(p, f, RIBBON.echoR, RIBBON.echoW, RIBBON.echoLate);
      this.streamer(p, f, 1, 1, 0);
    }
    for (const b of this.bits.list) {
      if (!b.live) continue;
      const t = b.age / b.life;
      const k = Math.min(1, t * 8) * (1 - t) ** 1.3;
      p.glow(b.x, b.y, b.size * 2.6, GOLD, 0.5 * k, b.size * 2.6, 0, 8);
      p.glow(b.x, b.y, b.size, HOT, 1.1 * k, b.size, 0, 8);
    }
    if (this.hitT < RIBBON.ring) {
      const k = this.hitT / RIBBON.ring;
      const big = 1 + 0.35 * (this.hitPower - 1);
      const r = (7 + (RIBBON.ringR - 7) * (1 - (1 - k) ** 2.2)) * big;
      p.ring(this.hitX, this.hitY, r, 2.6 * (1 - k) + 0.4, HOT, 1.2 * (1 - k) ** 1.5);
      p.glow(this.hitX, this.hitY, 5 * big * (1 - k), HOT, 1.2 * (1 - k));
    }
  }

  /** One streamer at `rk` x the radius and `wk` x the width, `late` frames behind the cut. */
  private streamer(p: Painter, f: SlashFrame, rk: number, wk: number, late: number): void {
    const a = this.arc;
    const { px, py, gx, gy, gc, pw, pc } = p;
    if (late > 0 && a.t * 60 < late) return;
    {
      const h = a.cut.heavy ? 1 : 0;
      const R = a.cut.reach;
      const life = RIBBON.life[h]! / 60;
      const d = a.doneT < 0 ? 0 : sat((a.doneT - late / 60) / life);
      if (d >= 1) return;
      const head = a.doneT >= 0 ? 2 : a.head;
      const tone = 0.5 + 0.5 * sat(f.pale * 1.2);
      // It slides along its own length: the tail runs up toward the head.
      const tail = 0.92 * d ** 1.15;
      const narrow = (1 - d) ** 0.9;
      const n = a.n;
      const W = RIBBON.core[h]! * wk;
      // The light falling off inside it: wide and violet, then close and gold.
      for (let pass = 0; pass < 2; pass++) {
        const depth = RIBBON.fall[h]! * (pass === 0 ? 1 : 0.42) * wk;
        const c = pass === 0 ? VIOLET : GOLD;
        const k = (pass === 0 ? RIBBON.duskK : RIBBON.gold) * tone;
        for (let i = 0; i < n; i++) {
          const v = i / (ARC_N - 1);
          const u = sat((v - tail) / (1 - tail + 1e-4));
          const sh = shape(u) * sat((head - v) / 0.12 + 0.04);
          const r = rk * this.radius(v) + this.wave(u, d, a.t) / R;
          px[i] = a.x(i, r);
          py[i] = a.y(i, r);
          gx[i] = a.x(i, r - depth * sh * (0.5 + 0.5 * narrow));
          gy[i] = a.y(i, r - depth * sh * (0.5 + 0.5 * narrow));
          gc[i * 3] = c[0]!;
          gc[i * 3 + 1] = c[1]!;
          gc[i * 3 + 2] = c[2]!;
          pw[i] = k * sh * narrow * smooth(v, tail);
        }
        p.sweep(n, true);
      }
      // The core: opaque, narrow, pointed at both ends.
      let m = 0;
      for (let i = 0; i < n; i++) {
        const v = i / (ARC_N - 1);
        if (v < tail - 0.02) continue;
        const u = sat((v - tail) / (1 - tail + 1e-4));
        const sh = shape(u) * sat((head - v) / 0.1 + 0.05) ** 0.7;
        const hw = (W * sh * narrow) / R;
        const r = rk * this.radius(v) + this.wave(u, d, a.t) / R;
        px[m] = a.x(i, r + hw);
        py[m] = a.y(i, r + hw);
        gx[m] = a.x(i, r - hw);
        gy[m] = a.y(i, r - hw);
        const w = 0.82 + 0.18 * u;
        gc[m * 3] = CORE[0]! * tone * w;
        gc[m * 3 + 1] = CORE[1]! * tone * w;
        gc[m * 3 + 2] = CORE[2]! * tone;
        m++;
      }
      p.strip(m, 1);
      // Light on the core: this is the part post lets bloom.
      for (let i = 0; i < n; i++) {
        const v = i / (ARC_N - 1);
        const u = sat((v - tail) / (1 - tail + 1e-4));
        const sh = shape(u) * sat((head - v) / 0.1 + 0.05);
        const r = rk * this.radius(v) + this.wave(u, d, a.t) / R;
        px[i] = a.x(i, r);
        py[i] = a.y(i, r);
        pw[i] = W * RIBBON.halo * (0.4 + 0.6 * sh) * (0.5 + 0.5 * narrow);
        pc[i * 3] = RIBBON.haloK * tone * sh * narrow * smooth(v, tail);
      }
      p.streak(n, GOLD);
    }
  }

  /** As it ages the streamer lifts into a slow wave, px. */
  private wave(u: number, d: number, t: number): number {
    return Math.sin(u * 7 - t * 26) * 9 * d * (1 - u) ** 0.7;
  }
}

/** A streamer: a long fine tail swelling to a full head with a quick point. */
function shape(u: number): number {
  return u ** 0.75 * sat((1 - u) / 0.16) ** 0.6;
}

function smooth(v: number, tail: number): number {
  return sat((v - tail) / 0.08 + 0.2);
}
