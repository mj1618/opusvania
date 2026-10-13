import { FillGradient, Graphics } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../../contract';
import type { EnvModule, SceneContext } from '../index';

/** PLACEHOLDER sky: a flat vertical gradient in screen space. Replace wholesale. */
export class SkyLayer implements EnvModule {
  init(ctx: SceneContext): void {
    const grad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: 0x12233f },
        { offset: 0.55, color: 0x1d5a66 },
        { offset: 1, color: 0x0b2a33 },
      ],
    });
    // Overdraw a little so sub-pixel canvas rounding never shows the clear colour.
    ctx.layers.sky.addChild(new Graphics().rect(-8, -8, VIEW_W + 16, VIEW_H + 16).fill(grad));
  }

  update(): void {}
}
