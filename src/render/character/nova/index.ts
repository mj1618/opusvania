// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Nova, the star-runner: a small acrobat made of night sky, with bands of light at the wrists
 * and ankles and a long comet tail. One of the candidate hero skins (`?char=nova`).
 *
 *   rig.ts        pose generators + springs -> skeleton joints; the double-jump somersault
 *   secondary.ts  the comet tail and the sash tails (verlet chains from ../hooded/chain)
 *   draw.ts       skeleton + chains -> shaded shapes (through ../hooded/paint, one mesh)
 *   fx.ts         the five light trails, star-specks, dust
 *
 * The star at the tail's tip is the point light 'ember'.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import type { PlayerView, RenderContext } from '../../contract';
import type { PointLight } from '../../lights';
import { KEY_LIGHT } from '../../scene/lib/look';
import { clamp, noise1, smoothstep } from '../hooded/math';
import { Painter, rgb } from '../hooded/paint';
import type { CharacterSkin, SkinDef } from '../skin';
import { drawNova } from './draw';
import { Fx } from './fx';
import { J_ANK_A, J_CENTRE, J_HAND_A, Rig } from './rig';
import { Secondary } from './secondary';

const STAR_COLOR = 0xffdf9e;
/** Trail half-widths: wrists, ankles, the star. */
const WIDTHS = [2.3, 2.3, 2.6, 2.6, 3.4] as const;

export class NovaCharacter implements CharacterSkin {
  private readonly painter = new Painter();
  private readonly rig = new Rig();
  private readonly sec = new Secondary();
  private readonly fx = new Fx();
  private readonly ember: PointLight = { x: 0, y: 0, radius: 300, color: STAR_COLOR, intensity: 1 };
  private started = false;
  /** Smoothed "how lit up" 0..1: rises in jumps, dashes and the somersault. */
  private heat = 0;
  private shedAcc = 0;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
    layer.addChild(this.painter.mesh);
    ctx.lights.set('ember', this.ember);
    const p = this.painter;
    p.lx = -KEY_LIGHT.dirX;
    p.ly = -KEY_LIGHT.dirY;
    p.keyColor = rgb(KEY_LIGHT.color);
    p.coolColor = rgb(0x8fdcf0);
    // The painter's second light is used as moonlight from below, so with the warm key (upper
    // right) and the cool fill (upper left) every edge of the silhouette carries a rim.
    p.l2c = rgb(0xa8c4ff);
  }

  update(dtIn: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void {
    const dt = clamp(dtIn, 0, 0.05);
    const { rig, sec, fx, painter: p } = this;
    rig.groundDist = this.groundBelow(player);
    rig.update(dt, clock, player, events);
    const sig = rig.sig;
    const fresh = sig.spawned || !this.started;
    if (fresh) {
      sec.reset();
      fx.clear();
      this.heat = 0;
      this.started = true;
    }
    sec.update(dt, clock, rig, rig.frame, player);
    const j = rig.frame.j;
    const tn = sec.tail.n - 1;
    const ex = sec.tail.rx[tn]!;
    const ey = sec.tail.ry[tn]!;

    // --- Light level: calm at rest, brighter in flight, brightest in the somersault and the dash.
    const sp = Math.hypot(player.vx, player.vy);
    const heatT = Math.max(
      Math.max(rig.spinW, Math.min(1, rig.spinVel / 9)),
      rig.wDash,
      0,
      smoothstep(4, 10, sp) * 0.12,
    );
    this.heat += (heatT - this.heat) * (1 - Math.exp(-(heatT > this.heat ? 30 : 8) * dt));
    const heat = this.heat;

    const bvx = player.vx * 60;
    const bvy = player.vy * 60;
    // --- Trails: each point lays down light in proportion to how fast it moves through the world.
    for (let i = 0; i < 4; i++) {
      const joint = i < 2 ? J_HAND_A + i : J_ANK_A + (i - 2);
      const x = j[joint * 2]!;
      const y = j[joint * 2 + 1]!;
      const v = fx.speed(i, x, y, dt, bvx, bvy);
      const k =
        Math.max(smoothstep(120, 520, v), rig.spinW * 0.85) *
        (0.1 + 0.9 * heat + 1.3 * rig.spinW) *
        (i === 1 || i === 3 ? 0.8 : 1);
      fx.trail(i, x, y, k);
    }
    {
      const v = fx.speed(4, ex, ey, dt, bvx * 0.6, bvy * 0.6);
      fx.trail(
        4,
        ex,
        ey,
        Math.max(smoothstep(120, 600, v), rig.spinW * 0.8) * (0.07 + 0.6 * rig.wDash + 0.75 * rig.spinW),
      );
    }

    // --- Effects from this frame's events.
    const feetX = player.cx;
    const feetY = player.feetY;
    const cx = j[J_CENTRE * 2]!;
    const cy = j[J_CENTRE * 2 + 1]!;
    if (sig.landed > 8) fx.dust(feetX, feetY, 0, clamp(sig.landed / 21, 0.15, 1), sig.landHard ? 6 : 3);
    if (sig.skid) fx.dust(feetX, feetY, player.vx > 0 ? 1 : -1, 0.5, 3);
    if (sig.dashStart && player.grounded) fx.dust(feetX, feetY, -player.dashDir, 0.5, 3);
    if (sig.wallJump) fx.dust(feetX - player.facing * 18, feetY - 12, 0, 0.3, 2);
    if (sig.wallJump) fx.shed(feetX - player.facing * 14, feetY - 8, player.vx * 18, -30, 6, 90);
    if (sig.doubleJump) fx.burst(cx, cy, player.vx * 60, player.vy * 60);
    // The star sheds a few specks while dashing.
    this.shedAcc += rig.wDash * 22 * dt;
    while (this.shedAcc >= 1) {
      this.shedAcc -= 1;
      fx.shed(ex, ey, player.vx * 12, 0, 1);
    }
    // While the ball spins the laid-down light rides along with it.
    const carry = fresh ? 0 : 0.9 * Math.min(1, rig.spinW * 1.5);
    fx.update(
      dt,
      cx,
      cy,
      0.7 + 1.6 * heat,
      (player.cx - this.lastX) * carry,
      (player.cy - this.lastY) * carry,
    );
    this.lastX = player.cx;
    this.lastY = player.cy;

    // --- Draw.
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale());
    p.fw = clamp(1 / scale, 0.06, 1.5);
    const flicker = 0.95 + 0.04 * noise1(clock * 5, 21) + 0.03 * Math.sin(clock * 1.7);
    p.l2x = player.cx + 30;
    p.l2y = player.feetY + 260;
    p.l2r = 900;
    p.l2k = 1.5;
    p.begin();
    fx.drawTrails(p, WIDTHS);
    drawNova(p, rig.frame, sec, clock, 1 + 0.5 * heat);
    fx.draw(p, clock);
    p.end(player.cx, player.cy);

    // --- The star is a real light.
    const e = this.ember;
    e.x = ex;
    e.y = ey;
    e.radius = 300 + heat * 80;
    e.intensity = flicker * (1.15 + heat * 0.35);
  }

  /** Px from the feet to the first solid or one-way top below them (Infinity if none). */
  private groundBelow(p: PlayerView): number {
    if (p.grounded) return 0;
    const x0 = p.cx - p.w / 2;
    const x1 = p.cx + p.w / 2;
    const y = p.feetY - 2;
    let best = this.ctx.scene.height - p.feetY;
    for (const r of this.ctx.scene.solids) {
      if (r.x < x1 && r.x + r.w > x0 && r.y >= y && r.y - p.feetY < best) best = r.y - p.feetY;
    }
    for (const r of this.ctx.scene.oneWays) {
      if (r.x < x1 && r.x + r.w > x0 && r.y >= y && r.y - p.feetY < best) best = r.y - p.feetY;
    }
    return Math.max(0, best);
  }

  destroy(): void {
    this.layer.removeChild(this.painter.mesh);
    this.painter.mesh.destroy();
    this.ctx.lights.remove('ember');
  }
}

export const skin: SkinDef = {
  id: 'nova',
  name: 'Nova, the star-runner',
  create: (ctx, layer) => new NovaCharacter(ctx, layer),
};
