import { Graphics } from 'pixi.js';
import type { SceneTag } from '../../../sim/scene';
import type { EnvModule, SceneContext } from '../index';

/**
 * PLACEHOLDER playfield: every collision rect as a flat box coloured by its tag, with a lit strip
 * on top (the "platform tops read" rule), and one-ways as thin bars. Replace wholesale: the final
 * picture must never show the boxes.
 */
const BODY: Record<SceneTag, number> = {
  ground: 0x0b2a33,
  pool: 0x103f5c,
  ledge: 0x0f4a3c,
  trunk: 0x16303a,
  floating: 0x0f4a3c,
  root: 0x1a3a3a,
  branch: 0x1f7a55,
};
const RIM = 0x6fbf6a;

export class PlayfieldLayer implements EnvModule {
  init(ctx: SceneContext): void {
    const g = new Graphics();
    for (const s of ctx.scene.solids) {
      g.rect(s.x, s.y, s.w, s.h).fill(BODY[s.tag]);
      g.rect(s.x, s.y, s.w, 10).fill(s.tag === 'pool' ? 0x9ff3ff : RIM);
    }
    for (const o of ctx.scene.oneWays) g.rect(o.x, o.y, o.w, 14).fill(BODY[o.tag]);
    ctx.layers.playfield.addChild(g);
  }

  update(): void {}
}
