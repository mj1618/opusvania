import { Container, Graphics } from 'pixi.js';
import type { CameraView, PlayerView } from '../render/contract';
import { placeLayer } from '../render/scene/layer-tree';
import type { Scene } from '../sim/scene';
import type { EnemyState } from '../sim/state';

type Rect = { x: number; y: number; w: number; h: number };
/** What the overlay draws of the goal: `channel` and `rest` are 0..1 (how far along). */
export interface GoalBoxes {
  lanterns: Array<{ box: Rect; lit: boolean; channel: number; rest: number; restPoint: boolean }>;
  heart: { box: Rect; awake: boolean; gathered: boolean } | null;
  /** A lit lantern's sanctuary: how far burrbacks keep (sideways), and lampwings (from its centre). */
  sanctuary: number;
  lampSanctuary: number;
  /** Clusters of dropped glints (their centres). */
  drops: ReadonlyArray<{ x: number; y: number; left: number }>;
}

/**
 * Collision overlay (F2, ?hitboxes, __game.debug.hitboxes): the scene's solid rects and one-ways,
 * the player's true collision box (green grounded, red airborne; white while invulnerable) and
 * velocity, and every enemy's box (magenta; orange while hurt, grey when dead). A lampwing also
 * shows its territory (a faint circle round its home), a line to what it is drawn to (yellow while
 * it has noticed or pursues her, dim otherwise) and its velocity. Lanterns: their trigger box (cyan
 * dormant, gold lit; a bar that fills while she kindles it or rests at it; a tick under the one she
 * re-forms at; once lit, a gold line along the ground burrbacks keep off and the circle lampwings
 * give up at). Dropped glint clusters: a yellow diamond. The heart: its box (dim violet asleep, bright orange awake, white once reached). Drawn above the post stage in
 * playfield space, so it shows the truth regardless of the art.
 */
export class HitboxOverlay {
  readonly layer = new Container({ label: 'debug' });
  private readonly solids = new Graphics();
  private readonly g = new Graphics();
  visible = false;
  /** The live enemies (set by the debug API; the overlay only reads them). */
  enemies: () => readonly EnemyState[] = () => [];
  /** The lanterns' and the heart's trigger boxes and what they are doing (set by the debug API). */
  goal: () => GoalBoxes = () => ({ lanterns: [], heart: null, sanctuary: 0, lampSanctuary: 0, drops: [] });

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
    const goal = this.goal();
    for (const l of goal.lanterns) {
      const b = l.box;
      const color = l.lit ? 0xffc94a : 0x4ce0ff;
      g.rect(b.x, b.y, b.w, b.h).stroke({ color, width: 2, alpha: l.lit ? 1 : 0.7 });
      const fill = l.lit ? l.rest : l.channel;
      if (fill > 0) g.rect(b.x, b.y - 8, b.w * Math.min(1, fill), 4).fill({ color: 0xffffff });
      if (l.restPoint)
        g.moveTo(b.x, b.y + b.h + 5)
          .lineTo(b.x + b.w, b.y + b.h + 5)
          .stroke({ color: 0xffc94a, width: 3 });
    }
    for (const l of goal.lanterns) {
      if (!l.lit) continue;
      // The sanctuary: the stretch of ground burrbacks keep off, and the lampwings' circle.
      const b = l.box;
      const cx = b.x + b.w / 2;
      g.moveTo(cx - goal.sanctuary, b.y + b.h + 2)
        .lineTo(cx + goal.sanctuary, b.y + b.h + 2)
        .stroke({ color: 0xffc94a, width: 2, alpha: 0.6 });
      g.circle(cx, b.y + b.h / 2, goal.lampSanctuary).stroke({ color: 0xffc94a, width: 1, alpha: 0.35 });
    }
    for (const d of goal.drops) {
      g.moveTo(d.x, d.y - 12)
        .lineTo(d.x + 12, d.y)
        .lineTo(d.x, d.y + 12)
        .lineTo(d.x - 12, d.y)
        .closePath()
        .stroke({ color: 0xffe14c, width: 2 });
    }
    if (goal.heart) {
      const b = goal.heart.box;
      const color = goal.heart.gathered ? 0xffffff : goal.heart.awake ? 0xff9a3c : 0x9a70d8;
      g.rect(b.x, b.y, b.w, b.h).stroke({
        color,
        width: goal.heart.awake ? 3 : 2,
        alpha: goal.heart.awake ? 1 : 0.6,
      });
    }
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
