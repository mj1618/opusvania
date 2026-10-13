import { Graphics } from 'pixi.js';
import type { EnvModule, SceneContext } from '../index';

/** PLACEHOLDER mid forest: a few big flat trunks behind the playfield. Replace wholesale. */
export class MidLayer implements EnvModule {
  init(ctx: SceneContext): void {
    const area = ctx.layers.coverage('mid');
    const g = new Graphics();
    for (let x = area.x + 200, k = 0; x < area.x + area.w; x += 1100, k++) {
      g.rect(x + (k % 2) * 260, area.y - 200, 420 + (k % 3) * 90, area.h + 400);
    }
    g.fill(0x0f3340);
    ctx.layers.mid.addChild(g);
  }

  update(): void {}
}
