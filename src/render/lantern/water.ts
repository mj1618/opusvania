/**
 * The roots' black water (docs/design/levels/proto-1.md §4 A3, B3, C3): every low floor in the roots band lies under
 * a skin of still water to her shins. Drawn over her (the `playfieldFront` layer: she wades), dark and clear, its
 * surface a thin line of light that glints where a light is near; her steps and landings ring it; a cut through
 * it throws a few drops. Render only, from the room's floors and her feet.
 */
import { Container, Graphics } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { CameraView, SimView } from '../contract';
import { wind } from '../scene/lib/look';
import type { GlowPool } from './glow';

export const WATER_LR = {
  /** How deep it stands over the floor, px; floors lower than the room's height less `low` are flooded. */
  depth: 22,
  low: 280,
  body: 0x020a10,
  bodyAlpha: 0.62,
  line: 0x9fd0dc,
  lineAlpha: 0.38,
  glint: 0xdff4ff,
  /** Rings: speed px/s, life s. */
  ringSpeed: 70,
  ringLife: 1.6,
} as const;

interface Ring {
  x: number;
  y: number;
  t: number;
  k: number;
}

export class RootWater {
  readonly container = new Container({ label: 'lr-water' });
  private readonly g = new Graphics();
  private readonly pools: Array<{ x0: number; x1: number; y: number }> = [];
  private readonly rings: Ring[] = [];
  private stepT = 0;

  constructor(scene: SimView['scene'], floors: ReadonlyArray<{ x0: number; x1: number; y: number }>) {
    this.container.addChild(this.g);
    for (const f of floors) if (f.y >= scene.height - WATER_LR.low && f.x1 - f.x0 > 40) this.pools.push(f);
  }

  get any(): boolean {
    return this.pools.length > 0;
  }

  onEvents(events: readonly SimEvent[], sim: SimView): void {
    const p = sim.player;
    for (const e of events) {
      if (e.type === 'land') this.ring(p.cx, p.feetY, 1.4);
      else if (e.type === 'jump') this.ring(p.cx, p.feetY, 0.8);
    }
  }

  private ring(x: number, feet: number, k: number): void {
    for (const pl of this.pools) {
      if (x < pl.x0 || x > pl.x1 || Math.abs(feet - pl.y) > 6) continue;
      if (this.rings.length > 24) this.rings.shift();
      this.rings.push({ x, y: pl.y - WATER_LR.depth, t: 0, k });
    }
  }

  draw(dt: number, clock: number, sim: SimView, cam: CameraView, glow: GlowPool): void {
    const W = WATER_LR;
    const g = this.g.clear();
    const p = sim.player;
    // Wading: small rings off her shins as she walks.
    if (p.grounded && Math.abs(p.vx) > 1) {
      this.stepT += dt;
      if (this.stepT > 0.28) {
        this.stepT = 0;
        this.ring(p.cx + Math.sign(p.vx) * 10, p.feetY, 0.6);
      }
    }
    const hw = cam.w / 2 / cam.zoom + 100;
    const vx0 = cam.x - hw;
    const vx1 = cam.x + hw;
    const lights = sim.scene.lures ?? [];
    for (const pl of this.pools) {
      if (pl.x1 < vx0 || pl.x0 > vx1) continue;
      const x0 = Math.max(pl.x0, vx0);
      const x1 = Math.min(pl.x1, vx1);
      const top = pl.y - W.depth;
      // The body: clear and dark.
      g.rect(x0, top, x1 - x0, W.depth + 4).fill({ color: W.body, alpha: W.bodyAlpha });
      // The surface: a line that breathes, brighter in patches that drift.
      g.moveTo(x0, top);
      for (let x = x0; x <= x1; x += 12)
        g.lineTo(x, top + Math.sin(x * 0.05 + clock * 1.3) * 0.6 + wind(x, clock, 0.2) * 0.4);
      g.stroke({ color: W.line, width: 1.2, alpha: W.lineAlpha });
      for (let x = x0 - (x0 % 70); x < x1; x += 70) {
        const k = Math.max(0, Math.sin(x * 0.013 + clock * 0.7)) ** 6;
        if (k > 0.05)
          g.moveTo(x - 14, top)
            .lineTo(x + 14, top)
            .stroke({ color: W.glint, width: 1.6, alpha: 0.5 * k });
      }
      // Lights near the water lay a glint on it (moonwicks, lamps).
      for (let i = 0; i < lights.length; i++) {
        const l = lights[i];
        if (!l || (sim.lures.hp[i] ?? 0) <= 0 || l.x < x0 - 200 || l.x > x1 + 200) continue;
        const d = top - l.y;
        if (d < 0 || d > 500) continue;
        const k = 1 - d / 500;
        glow.add(l.x, top + 2, 60 * k + 20, W.glint, 0.18 * k, 5);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i] as Ring;
      r.t += dt;
      const u = r.t / W.ringLife;
      if (u >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const rad = 6 + W.ringSpeed * r.t * r.k;
      g.ellipse(r.x, r.y + 1, rad, rad * 0.14).stroke({
        color: W.line,
        width: 1.2,
        alpha: 0.5 * (1 - u) * r.k,
      });
    }
  }
}
