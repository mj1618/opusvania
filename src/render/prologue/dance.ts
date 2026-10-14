// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * The brood's dance: a ring of moths turning in the canopy, soft pale-gold wings beating, each
 * drawing a fading trail of light behind it, one of them edged silver (Sorrel's love). Drawn to be
 * wanted: warm, moving, open wings, never anything that reads as a face (no dark marks between the
 * wings: at a distance a pair of them read as eyes).
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { glowTexture } from '../world/paint';

interface Dancer {
  c: Container;
  w: Graphics;
  g: Sprite;
  ph: number;
  r: number;
  sp: number;
  silver: boolean;
  trail: number[];
}

export class DanceRing {
  readonly view = new Container({ label: 'dance' });
  private readonly trails = new Graphics();
  private readonly moths: Dancer[] = [];
  /** Where the silver one is (after `update`). */
  readonly silverAt = { x: 0, y: 0 };

  constructor(
    count: number,
    /** Wingspan of an ordinary dancer, px. */
    private readonly span: number,
    silverIndex = 4,
  ) {
    this.trails.blendMode = 'add';
    this.view.addChild(this.trails);
    for (let i = 0; i < count; i++) {
      const silver = i === silverIndex;
      const s = span * (silver ? 1.5 : 0.85 + 0.3 * ((i * 7) % 5) * 0.25);
      const c = new Container();
      const g = new Sprite(glowTexture());
      g.anchor.set(0.5);
      g.setSize(s * 3, s * 3);
      g.tint = silver ? 0xdfe8ff : 0xffd49a;
      g.blendMode = 'add';
      const w = new Graphics();
      for (const side of [-1, 1]) {
        // Fore and hind wing: soft rounded lobes, pale gold (the silver one a dusk wing with a silver edge).
        w.ellipse(side * s * 0.3, -s * 0.06, s * 0.3, s * 0.2).fill({
          color: silver ? 0x3a3650 : 0xf4e2b8,
          alpha: 0.95,
        });
        w.ellipse(side * s * 0.2, s * 0.14, s * 0.18, s * 0.13).fill({
          color: silver ? 0x2e2a40 : 0xe8cf9c,
          alpha: 0.9,
        });
        if (silver) {
          w.ellipse(side * s * 0.3, -s * 0.06, s * 0.3, s * 0.2).stroke({
            color: 0xf4f8ff,
            width: Math.max(1.2, s * 0.06),
          });
          w.ellipse(side * s * 0.2, s * 0.14, s * 0.18, s * 0.13).stroke({
            color: 0xe8eef8,
            width: Math.max(1, s * 0.04),
          });
        }
      }
      w.ellipse(0, s * 0.04, s * 0.05, s * 0.18).fill({ color: silver ? 0xe8eef8 : 0xfff2d8, alpha: 0.9 });
      c.addChild(g, w);
      this.view.addChild(c);
      this.moths.push({
        c,
        w,
        g,
        ph: (i / count) * Math.PI * 2,
        r: 0.78 + (i % 3) * 0.12,
        sp: 0.55 + (i % 5) * 0.05,
        silver,
        trail: [],
      });
    }
  }

  /**
   * The ring at (x, y), radii (rx, ry), at time `clock`. The silver one leaves it toward
   * `silverTo` by `silverK` (0..1).
   */
  update(
    clock: number,
    x: number,
    y: number,
    rx: number,
    ry: number,
    silverTo?: { x: number; y: number },
    silverK = 0,
  ): void {
    const tg = this.trails;
    tg.clear();
    for (const [i, m] of this.moths.entries()) {
      const a = clock * m.sp * 0.7 + m.ph;
      let px = x + Math.cos(a) * rx * m.r + Math.sin(a * 2.1 + i) * rx * 0.05;
      let py = y + Math.sin(a) * ry * m.r + Math.cos(a * 2.9 + i) * ry * 0.15;
      if (m.silver && silverTo && silverK > 0) {
        px += (silverTo.x - px) * silverK;
        py += (silverTo.y - py) * silverK;
      }
      if (m.silver) {
        this.silverAt.x = px;
        this.silverAt.y = py;
      }
      m.c.position.set(px, py);
      m.c.rotation = Math.cos(a) * 0.25;
      m.w.scale.y = 0.35 + 0.65 * Math.abs(Math.sin(clock * (11 + (i % 3)) + i));
      m.g.alpha = (m.silver ? 0.6 : 0.42) + 0.3 * Math.max(0, Math.sin(clock * 2.7 + i * 1.3));
      // A trail of light behind it, fading.
      const t = m.trail;
      t.push(px, py);
      if (t.length > 28) t.splice(0, 2);
      for (let k = 2; k < t.length; k += 2) {
        const u = k / t.length;
        tg.moveTo(t[k - 2]!, t[k - 1]!)
          .lineTo(t[k]!, t[k + 1]!)
          .stroke({ color: m.silver ? 0xdfe8ff : 0xffcf88, width: this.span * 0.12 * u, alpha: 0.35 * u });
      }
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
