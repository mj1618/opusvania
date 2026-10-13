import { Container, Graphics } from 'pixi.js';
import type { CameraView, PlayerView } from '../render/contract';
import { placeLayer } from '../render/scene/layer-tree';
import type { Scene } from '../sim/scene';

/**
 * Collision overlay (F2, ?hitboxes, __game.debug.hitboxes): the scene's solid rects and one-ways,
 * the player's true collision box (green grounded, red airborne) and velocity. Drawn above the
 * post stage in playfield space, so it shows the truth regardless of the art.
 */
export class HitboxOverlay {
  readonly layer = new Container({ label: 'debug' });
  private readonly solids = new Graphics();
  private readonly g = new Graphics();
  visible = false;

  constructor(scene: Scene) {
    for (const s of scene.solids) this.solids.rect(s.x, s.y, s.w, s.h);
    this.solids.stroke({ color: 0x3fa7ff, width: 2, alpha: 0.8 });
    for (const o of scene.oneWays) this.solids.moveTo(o.x, o.y).lineTo(o.x + o.w, o.y);
    this.solids.stroke({ color: 0xffd23f, width: 2, alpha: 0.9 });
    this.layer.addChild(this.solids, this.g);
    this.layer.visible = false;
  }

  toggle(on = !this.visible): boolean {
    this.visible = on;
    this.layer.visible = on;
    return on;
  }

  draw(cam: CameraView, p: PlayerView): void {
    if (!this.visible) return;
    placeLayer(this.layer, cam, 1, { x: 0, y: 0 });
    const x = p.cx - p.w / 2;
    const y = p.feetY - p.h;
    const g = this.g.clear();
    g.rect(x, y, p.w, p.h).stroke({ color: p.grounded ? 0x4cff7a : 0xff4c6a, width: 2 });
    // Velocity in px/frame, drawn x6 so it is visible.
    g.moveTo(p.cx, p.cy)
      .lineTo(p.cx + p.vx * 6, p.cy + p.vy * 6)
      .stroke({ color: 0xffd23f, width: 2 });
  }
}
