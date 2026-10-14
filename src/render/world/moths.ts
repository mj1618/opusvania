/**
 * Small moths drawn to a light: each circles its light on its own loose orbit, wings beating, a
 * pure function of render time (a frozen clock gives the same picture). Life in the air, and the
 * hero's kin: they gather at the Hush's glow the way she would.
 */
import { Container, Graphics } from 'pixi.js';
import type { Composer } from './compose';

export interface MothSpec {
  /** The light they circle (screen px) and how far out they roam. */
  x: number;
  y: number;
  rx: number;
  ry: number;
  count: number;
  /** Wingspan px. */
  size: [number, number];
  color: number;
  alpha?: number;
}

export function moths(c: Composer, rng: () => number, parent: Container, s: MothSpec): Container {
  const view = new Container();
  parent.addChild(view);
  const list: { g: Container; w: Graphics; ph: number; sp: number; r: number; tilt: number; f: number }[] =
    [];
  for (let i = 0; i < s.count; i++) {
    const span = s.size[0] + rng() * (s.size[1] - s.size[0]);
    const g = new Container();
    const w = new Graphics();
    // Wings: two soft triangles either side of a short body.
    w.poly([0, 0, -span * 0.5, -span * 0.32, -span * 0.42, span * 0.12]).fill({
      color: s.color,
      alpha: s.alpha ?? 0.8,
    });
    w.poly([0, 0, span * 0.5, -span * 0.32, span * 0.42, span * 0.12]).fill({
      color: s.color,
      alpha: s.alpha ?? 0.8,
    });
    g.addChild(w);
    const body = new Graphics();
    body.ellipse(0, 0, span * 0.06, span * 0.2).fill({ color: 0x14121c, alpha: 0.9 });
    g.addChild(body);
    view.addChild(g);
    list.push({
      g,
      w,
      ph: rng() * 6.28,
      sp: 0.5 + rng() * 0.9,
      r: 0.4 + rng() * 0.6,
      tilt: (rng() - 0.5) * 0.8,
      f: 14 + rng() * 10,
    });
  }
  c.on((t) => {
    for (const m of list) {
      const a = t * m.sp + m.ph;
      m.g.position.set(
        s.x + Math.cos(a) * s.rx * m.r + Math.sin(a * 2.3) * 10,
        s.y + Math.sin(a * 1.3) * s.ry * m.r + Math.cos(a * 3.1) * 6,
      );
      m.g.rotation = m.tilt + Math.sin(a) * 0.4;
      m.w.scale.y = 0.25 + 0.75 * Math.abs(Math.sin(t * m.f + m.ph));
    }
  });
  return view;
}
