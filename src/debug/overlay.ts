import { Graphics } from 'pixi.js';
import type { Game } from '../game';
import { tuning } from '../sim/tuning';
import { getRoom, isSolidTile } from '../sim/world/rooms';

/** Hitbox / collision overlay: solid tile outlines, the player's true integer AABB and velocity. */
export class HitboxOverlay {
  readonly g = new Graphics();
  visible = false;

  constructor(private readonly game: Game) {
    this.g.visible = false;
  }

  toggle(on = !this.visible): boolean {
    this.visible = on;
    this.g.visible = on;
    return on;
  }

  draw(): void {
    if (!this.visible) return;
    const { state } = this.game;
    const room = getRoom(state.roomId);
    const ts = tuning.world.tileSize;
    const g = this.g.clear();
    for (let ty = 0; ty < room.height; ty++) {
      for (let tx = 0; tx < room.width; tx++) {
        if (isSolidTile(room, tx, ty)) g.rect(tx * ts + 0.5, ty * ts + 0.5, ts - 1, ts - 1);
      }
    }
    g.stroke({ color: 0x3fa7ff, width: 1, alpha: 0.6 });
    const p = state.player;
    g.rect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1).stroke({
      color: p.grounded ? 0x4cff7a : 0xff4c6a,
      width: 2,
    });
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    g.moveTo(cx, cy)
      .lineTo(cx + p.vx * 0.1, cy + p.vy * 0.1)
      .stroke({ color: 0xffd23f, width: 2 });
  }
}
