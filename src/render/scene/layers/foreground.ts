import { Graphics } from 'pixi.js';
import type { EnvModule, SceneContext } from '../index';

/** PLACEHOLDER foreground: a few near-black blobs along the bottom edge. Replace wholesale. */
export class ForegroundLayer implements EnvModule {
  init(ctx: SceneContext): void {
    const area = ctx.layers.coverage('foreground');
    const bottom = area.y + area.h;
    const g = new Graphics();
    for (let x = area.x, k = 0; x < area.x + area.w; x += 760, k++) {
      g.ellipse(x + (k % 3) * 140, bottom + 30, 300 + (k % 2) * 120, 150);
    }
    g.fill(0x061a24);
    ctx.layers.foreground.addChild(g);
  }

  update(): void {}
}
