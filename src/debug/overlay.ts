import { Graphics } from 'pixi.js';
import type { Game } from '../game';
import { hurtRect } from '../sim/ai/enemy';
import { enemyDef } from '../sim/ai/schema';
import { boxAt } from '../sim/combat/boxes';
import { isActiveFrame, moveHitbox } from '../sim/player/moves';
import { tuning } from '../sim/tuning';
import { playerView, roomInfo } from './sim-adapter';

/**
 * Hitbox / collision overlay: solid tile outlines, the player's true integer AABB and velocity, Kid's
 * move hitbox (orange; thick while active), enemy hurtboxes (cyan), attack boxes and shots (red).
 * Other debug layers (the clip motion trail) register in `extras` so they draw on the same call.
 */
export class HitboxOverlay {
  readonly g = new Graphics();
  visible = false;
  readonly extras: { draw(): void }[] = [];

  constructor(private readonly game: Game) {
    this.g.visible = false;
  }

  toggle(on = !this.visible): boolean {
    this.visible = on;
    this.g.visible = on;
    return on;
  }

  draw(): void {
    for (const x of this.extras) x.draw();
    if (!this.visible) return;
    const { state } = this.game;
    const room = roomInfo(state.roomId);
    const ts = room.tileSize;
    const g = this.g.clear();
    for (let ty = 0; ty < room.height; ty++) {
      for (let tx = 0; tx < room.width; tx++) {
        if (room.solidAt(tx, ty)) g.rect(tx * ts + 0.5, ty * ts + 0.5, ts - 1, ts - 1);
      }
    }
    g.stroke({ color: 0x3fa7ff, width: 1, alpha: 0.6 });
    const p = playerView(state);
    g.rect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1).stroke({
      color: p.grounded ? 0x4cff7a : 0xff4c6a,
      width: 2,
    });
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    // Velocity in px/frame, drawn ×6 so it is visible.
    g.moveTo(cx, cy)
      .lineTo(cx + p.vx * 6, cy + p.vy * 6)
      .stroke({ color: 0xffd23f, width: 2 });
    // L4 combat: Kid's move hitbox (solid while active), enemy hurtboxes and live attack boxes.
    const m = state.player.move;
    const mb = m ? moveHitbox(state.player, m, tuning.kid.counterBoxScale) : null;
    if (m && mb) g.rect(mb.x, mb.y, mb.w, mb.h).stroke({ color: 0xff8a3d, width: isActiveFrame(m) ? 3 : 1 });
    for (const e of state.local.enemies) {
      if (e.state === 'KO' || e.state === 'REPOSSESSED') continue;
      const h = hurtRect(e);
      g.rect(h.x, h.y, h.w, h.h).stroke({ color: 0x4cc9ff, width: 1 });
      const a = e.attackId ? enemyDef(e.type).attacks[e.attackId] : undefined;
      if (!a || (e.state !== 'ACTIVE' && e.state !== 'TELEGRAPH')) continue;
      for (const hb of a.hitboxes) {
        const r = boxAt(e.x, e.y, e.w, e.facing, hb.box);
        const live = e.state === 'ACTIVE' && e.stateFrame >= hb.fromFrame && e.stateFrame <= hb.toFrame;
        g.rect(r.x, r.y, r.w, r.h).stroke({ color: 0xff3b6b, width: live ? 3 : 1, alpha: live ? 1 : 0.5 });
      }
    }
    for (const sh of state.local.shots) g.rect(sh.x, sh.y, sh.w, sh.h).stroke({ color: 0xff3b6b, width: 1 });
  }
}
