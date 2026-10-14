// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * Motes: spores, pollen, ash, embers. Each is a soft sprite whose position is a pure function of
 * render time (drift + wobble, wrapped in its box), so a frozen clock gives the same picture.
 */
import { Container, Sprite } from 'pixi.js';
import { glowTexture } from './paint';

export interface MoteSpec {
  count: number;
  /** Box they live in (screen px). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Drift px/s. */
  vx: number;
  vy: number;
  wobble: number;
  size: [number, number];
  alpha: [number, number];
  color: number | readonly number[];
  add?: boolean;
  twinkle?: number;
  /** 0..1 where along y the motes are densest (they thin away from it), or undefined for even. */
  band?: [number, number];
}

interface Mote {
  s: Sprite;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  ph: number;
  f: number;
  a: number;
  tw: number;
}

export class Motes {
  readonly view = new Container();
  private readonly list: Mote[] = [];

  constructor(
    rng: () => number,
    private readonly spec: MoteSpec,
  ) {
    const tex = glowTexture();
    const cols = Array.isArray(spec.color) ? spec.color : [spec.color as number];
    for (let i = 0; i < spec.count; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      const size = spec.size[0] + (spec.size[1] - spec.size[0]) * rng() ** 2;
      s.width = size;
      s.height = size;
      s.tint = cols[Math.floor(rng() * cols.length)]!;
      if (spec.add !== false) s.blendMode = 'add';
      let y0 = rng();
      if (spec.band) y0 = spec.band[0] + (rng() + rng() - 1) * spec.band[1];
      this.list.push({
        s,
        x0: rng() * spec.w,
        y0: y0 * spec.h,
        vx: spec.vx * (0.6 + 0.8 * rng()),
        vy: spec.vy * (0.6 + 0.8 * rng()),
        ph: rng() * 6.28,
        f: 0.3 + rng() * 0.7,
        a: spec.alpha[0] + (spec.alpha[1] - spec.alpha[0]) * rng(),
        tw: rng() * 6.28,
      });
      this.view.addChild(s);
    }
  }

  update(t: number, alphaK = 1): void {
    const sp = this.spec;
    const tw = sp.twinkle ?? 0.3;
    for (const m of this.list) {
      let x = m.x0 + m.vx * t + Math.sin(t * m.f + m.ph) * sp.wobble;
      let y = m.y0 + m.vy * t + Math.cos(t * m.f * 0.8 + m.ph * 1.3) * sp.wobble * 0.7;
      x = (((x % sp.w) + sp.w) % sp.w) + sp.x;
      y = (((y % sp.h) + sp.h) % sp.h) + sp.y;
      m.s.position.set(x, y);
      // Fade near the box edges so wrapping never pops.
      const ex = Math.min(x - sp.x, sp.x + sp.w - x) / 60;
      const ey = Math.min(y - sp.y, sp.y + sp.h - y) / 60;
      const edge = Math.max(0, Math.min(1, ex, ey));
      m.s.alpha = m.a * edge * alphaK * (1 - tw + tw * (0.5 + 0.5 * Math.sin(t * 1.7 * m.f + m.tw)));
    }
  }
}
