// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Wick, the lantern bearer: a young ronin-like wanderer under a low sharp hat, carrying a slender
 * lantern-glaive whose spirit flame is his light. Drawn entirely in code.
 *
 *   rig.ts        pose generators + springs -> skeleton joints and the glaive
 *   secondary.ts  scarf, coat tails, hat ribbons, skirt and the lantern pendulum (verlet chains)
 *   draw.ts       skeleton + chains -> shaded shapes
 *   fx.ts         embers, the flame's light trail, the double-jump ring, dust
 *
 * The flame is registered as the point light 'ember' at its simulated position.
 * See memory/character-wick.md.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import type { PlayerView, RenderContext } from '../../contract';
import type { PointLight } from '../../lights';
import { KEY_LIGHT, PALETTE, wind } from '../../scene/lib/look';
import { approach, clamp, noise1 } from '../hooded/math';
import { Painter, rgb } from '../hooded/paint';
import type { CharacterSkin, SkinDef } from '../skin';
import { drawWick, type Lamp } from './draw';
import { Fx } from './fx';
import { Rig, S_TWIRL } from './rig';
import { Secondary } from './secondary';

/** Flame position along the lantern body, from its top ring. */
const FLAME_AT = 7.6;

export class WickCharacter implements CharacterSkin {
  private readonly painter = new Painter();
  private readonly rig = new Rig();
  private readonly sec = new Secondary();
  private readonly fx = new Fx();
  private readonly light: PointLight = { x: 0, y: 0, radius: 280, color: PALETTE.ember, intensity: 1 };
  private readonly lamp: Lamp = { x: 0, y: 0, tx: 0, ty: -7, k: 1, pulse: 1 };
  private lastX = 0;
  private lastY = 0;
  /** Smoothed flame velocity, px/s. */
  private fvx = 0;
  private fvy = 0;
  private started = false;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
    this.painter.mesh.label = 'wick';
    layer.addChild(this.painter.mesh);
    ctx.lights.set('ember', this.light);
    const p = this.painter;
    p.lx = -KEY_LIGHT.dirX;
    p.ly = -KEY_LIGHT.dirY;
    p.keyColor = rgb(KEY_LIGHT.color);
    p.l2c = rgb(0xffb060);
  }

  update(dtIn: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void {
    const dt = clamp(dtIn, 0, 0.05);
    const { rig, sec, fx, painter: p, lamp } = this;
    rig.update(dt, clock, player, events);
    const sig = rig.sig;
    const fresh = sig.spawned || !this.started;
    if (fresh) {
      sec.reset();
      fx.clear();
    }
    sec.update(dt, clock, rig, rig.frame, player);

    // --- The flame: where it is, how it moves, how it leans and flickers.
    const la = sec.lantern;
    let ax = la.rx[2]! - la.rx[1]!;
    let ay = la.ry[2]! - la.ry[1]!;
    const al = Math.hypot(ax, ay) || 1;
    ax /= al;
    ay /= al;
    const fxp = la.rx[1]! + ax * FLAME_AT;
    const fyp = la.ry[1]! + ay * FLAME_AT;
    if (fresh) {
      this.lastX = fxp;
      this.lastY = fyp;
      this.fvx = this.fvy = 0;
      this.started = true;
    }
    if (dt > 0) {
      const k = approach(14, dt);
      this.fvx += ((fxp - this.lastX) / dt - this.fvx) * k;
      this.fvy += ((fyp - this.lastY) / dt - this.fvy) * k;
    }
    this.lastX = fxp;
    this.lastY = fyp;
    const flick = 1 + 0.15 * noise1(clock * 9.5, 41) + 0.09 * noise1(clock * 23, 43);
    const pulse = 1 + 0.07 * Math.sin(clock * 2.1) + 0.035 * Math.sin(clock * 5.3 + 1);
    const speed = Math.hypot(this.fvx, this.fvy);
    // The tongue streams away from the way the flame is moving, and wavers in still air.
    const waver = 0.9 * noise1(clock * 2.6, 47) + 0.5 * noise1(clock * 7.1, 53) + wind(fxp, clock, 0.3) * 0.8;
    const h = 7.4 * flick * (1 + Math.min(0.5, speed / 900));
    let tx = clamp(-this.fvx * 0.012, -6.5, 6.5) + waver;
    let ty = -h + clamp(-this.fvy * 0.008, -2.5, 4.5);
    const tl = Math.hypot(tx, ty) || 1;
    const want = Math.max(4.5, Math.min(tl, h * 1.25));
    tx *= want / tl;
    ty *= want / tl;
    lamp.x = fxp;
    lamp.y = fyp;
    lamp.tx = tx;
    lamp.ty = ty;
    lamp.pulse = pulse;
    const boost = Math.max(rig.wDash, rig.frame.s[S_TWIRL]!);
    lamp.k = (0.9 + 0.1 * flick) * pulse * (1 + 0.3 * boost);

    // --- Effects from this frame's events.
    const feetX = player.cx;
    const feetY = player.feetY;
    if (sig.landed > 8) fx.dust(feetX, feetY, 0, clamp(sig.landed / 21, 0.15, 1), sig.landHard ? 6 : 3);
    if (sig.skid) fx.dust(feetX, feetY, player.vx > 0 ? 1 : -1, 0.5, 3);
    if (sig.dashStart && player.grounded) fx.dust(feetX, feetY, -player.dashDir, 0.5, 3);
    if (sig.wallJump) fx.dust(feetX - player.facing * 18, feetY - 12, 0, 0.3, 2);
    if (sig.doubleJump) {
      fx.burst(player.cx, player.cy);
    }
    fx.update(dt, clock, fxp, fyp - 1.5, this.fvx, this.fvy, boost);

    // --- Draw.
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale());
    p.fw = clamp(1 / scale, 0.06, 1.5);
    p.l2x = fxp;
    p.l2y = fyp - 2;
    p.l2r = 78;
    p.l2k = 1.25 * lamp.k;
    p.begin();
    fx.drawTrail(p);
    drawWick(p, rig.frame, sec, lamp);
    fx.draw(p);
    p.end(player.cx, player.cy);

    // --- The flame is a real light.
    const e = this.light;
    e.x = fxp;
    e.y = fyp - 2;
    e.radius = 270 + boost * 60;
    e.intensity = 0.8 * lamp.k;
  }

  destroy(): void {
    this.layer.removeChild(this.painter.mesh);
    this.painter.mesh.destroy();
    this.ctx.lights.remove('ember');
  }
}

export const skin: SkinDef = {
  id: 'wick',
  name: 'Wick, the lantern bearer',
  create: (ctx, layer) => new WickCharacter(ctx, layer),
};
