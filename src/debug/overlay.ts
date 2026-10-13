import { Container, Graphics } from 'pixi.js';
import type { CameraView, PlayerView } from '../render/contract';
import { placeLayer } from '../render/scene/layer-tree';
import type { Scene } from '../sim/scene';
import type { EnemyState } from '../sim/state';

/**
 * Collision overlay (F2, ?hitboxes, __game.debug.hitboxes): the scene's solid rects and one-ways,
 * the player's true collision box (green grounded, red airborne; white while invulnerable) and
 * velocity, and every enemy's box (magenta; orange while hurt, grey when dead). A lampwing also
 * shows its territory (a faint circle round its home), a line to what it is drawn to (yellow while
 * it has noticed or pursues her, dim otherwise) and its velocity. Drawn above the post stage in
 * playfield space, so it shows the truth regardless of the art.
 */
export class HitboxOverlay {
  readonly layer = new Container({ label: 'debug' });
  private readonly solids = new Graphics();
  private readonly g = new Graphics();
  visible = false;
  /** The live enemies (set by the debug API; the overlay only reads them). */
  enemies: () => readonly EnemyState[] = () => [];

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
    const tint = p.invuln > 0 || p.faded > 0 ? 0xffffff : p.grounded ? 0x4cff7a : 0xff4c6a;
    g.rect(x, y, p.w, p.h).stroke({ color: tint, width: 2 });
    // Velocity in px/frame, drawn x6 so it is visible.
    g.moveTo(p.cx, p.cy)
      .lineTo(p.cx + p.vx * 6, p.cy + p.vy * 6)
      .stroke({ color: 0xffd23f, width: 2 });
    for (const e of this.enemies()) {
      if (e.gone) continue;
      const color = e.mode === 'dead' ? 0x8a8a8a : e.mode === 'hurt' ? 0xff9a3c : 0xff4cf0;
      g.rect(e.x, e.y, e.w, e.h).stroke({ color, width: 2 });
      // A tick on the side it faces.
      const fx = e.facing > 0 ? e.x + e.w : e.x;
      g.moveTo(fx, e.y + e.h / 2)
        .lineTo(fx + e.facing * 10, e.y + e.h / 2)
        .stroke({ color, width: 2 });
      if (e.kind !== 'lampwing') continue;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      g.circle(e.homeX, e.homeY, e.radius).stroke({ color: 0xff4cf0, width: 1, alpha: 0.35 });
      if (e.mode === 'dead') continue;
      const hunting = e.mode === 'curious' || e.mode === 'pursue';
      g.moveTo(cx, cy)
        .lineTo(e.targetX, e.targetY)
        .stroke({ color: hunting ? 0xffe14c : 0xff4cf0, width: hunting ? 2 : 1, alpha: hunting ? 0.9 : 0.5 });
      g.moveTo(cx, cy)
        .lineTo(cx + e.vx * 6, cy + e.vy * 6)
        .stroke({ color: 0xffffff, width: 2 });
    }
  }
}
