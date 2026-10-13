import { Graphics } from 'pixi.js';
import type { EnvModule, SceneContext } from '../index';

/** PLACEHOLDER far forest: a row of flat trunks per layer, paler with distance. Replace wholesale. */
const TINTS = [0x2b6672, 0x1f505c, 0x153d49];
const SPACING = [520, 430, 360];
const WIDTH = [150, 190, 240];

export class FarLayers implements EnvModule {
  init(ctx: SceneContext): void {
    ctx.layers.far.forEach((layer, i) => {
      const name = (['far0', 'far1', 'far2'] as const)[i] ?? 'far0';
      const area = ctx.layers.coverage(name);
      const g = new Graphics();
      const step = SPACING[i] ?? 400;
      const w = WIDTH[i] ?? 200;
      for (let x = area.x - step, k = 0; x < area.x + area.w + step; x += step, k++) {
        // Deterministic jitter from the index (no Math.random: shots must be reproducible).
        const jitter = ((k * 7919 + i * 104729) % 97) / 97;
        g.rect(x + jitter * step * 0.5, area.y - 200, w * (0.7 + jitter * 0.6), area.h + 400);
      }
      g.fill(TINTS[i] ?? 0x153d49);
      layer.addChild(g);
    });
  }

  update(): void {}
}
