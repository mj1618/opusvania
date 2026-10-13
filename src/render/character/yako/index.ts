/**
 * Yako, the dark fox: a lean bipedal charcoal-indigo fox in a crossed-collar jacket and a crimson
 * sash, drawn as crisp cel animation. See memory/character-yako.md.
 *
 *   rig.ts        pose generators + springs -> skeleton (forward frame) and the base matrix (turn,
 *                 squash, stretch)
 *   chain.ts      verlet chains with rest shapes (fixed 120 Hz sub-steps)
 *   secondary.ts  tail, sash tails, charm (chains); ears and hem (springs)
 *   draw.ts       skeleton + chains -> flat cel shapes
 *   cel.ts        the mesh, the shader, paths / ribbons / light primitives
 *   fx.ts         motes, light streaks, the double-jump burst, dust
 *
 * His light: the ember on the tail tip is the point light 'ember', at its simulated position.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import type { PlayerView, RenderContext } from '../../contract';
import type { PointLight } from '../../lights';
import { clamp, noise1, sat, smoothstep } from '../hooded/math';
import type { CharacterSkin, SkinDef } from '../skin';
import { Cel, rgb } from './cel';
import { drawYako, where } from './draw';
import { Fx } from './fx';
import { Rig } from './rig';
import { Secondary } from './secondary';

const EMBER = rgb(0xff8a3a);
const AMBER = rgb(0xffb52e);
const HOT = rgb(0xfff1c0);
const HALO = rgb(0xffc98a);

export class YakoCharacter implements CharacterSkin {
  private readonly cel = new Cel();
  private readonly rig = new Rig();
  private readonly sec = new Secondary();
  private readonly fx = new Fx();
  private readonly ember: PointLight = { x: 0, y: 0, radius: 250, color: 0xff9a4a, intensity: 1 };
  private started = false;
  private flash = 0;
  private scrapeT = 0;
  private scrapeN = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
    layer.addChild(this.cel.mesh);
    ctx.lights.set('ember', this.ember);
    this.cel.lx = 0.6;
    this.cel.ly = -0.8;
  }

  update(dtIn: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void {
    const dt = clamp(dtIn, 0, 0.05);
    const { rig, sec, fx, cel: p } = this;
    rig.update(dt, clock, player, events);
    const sig = rig.sig;
    const fresh = sig.spawned || !this.started;
    if (fresh) {
      sec.reset();
      fx.clear();
      this.flash = 0;
    }
    sec.update(dt, clock, rig, player);

    // --- Draw. The body first into the buffer's tail would need two passes; instead the light
    // behind the body uses last frame's positions, which is invisible for soft glows.
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale());
    p.fw = clamp(1 / scale, 0.05, 1.5);
    const flicker = 0.94 + 0.05 * noise1(clock * 5.3, 21) + 0.03 * Math.sin(clock * 1.7);
    const dash = rig.wDash;
    if (sig.doubleJump) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    const glow = flicker * (1 + dash * 0.5 + this.flash * 0.9);

    p.begin();
    if (!fresh) {
      // A soft halo lifts the figure off the dark forest.
      p.glow((player.cx + where.headX) * 0.5, (player.cy + where.headY) * 0.5 + 4, 46, HALO, 0.085, 58);
      p.glow(where.tipX, where.tipY, 26, EMBER, 0.2 * glow);
      fx.drawTrail(p);
    }
    drawYako(p, rig, sec);

    // --- Effects from this frame's events (positions are known now).
    const feetX = player.cx;
    const feetY = player.feetY;
    if (fresh) fx.clear();
    if (sig.landed > 8) fx.dust(feetX, feetY, 0, clamp(sig.landed / 21, 0.15, 1), sig.landHard ? 6 : 3);
    if (sig.skid) fx.dust(feetX, feetY, player.vx > 0 ? 1 : -1, 0.5, 3);
    if (sig.dashStart && player.grounded) fx.dust(feetX, feetY, -player.dashDir, 0.5, 3);
    if (sig.wallJump) fx.dust(feetX - player.facing * 18, feetY - 12, 0, 0.3, 2);
    if (player.motion === 'wallSlide' && player.vy > 1.5) {
      this.scrapeT -= dt * (0.6 + player.vy * 0.2);
      if (this.scrapeT <= 0) {
        this.scrapeT += 0.16;
        fx.scrape(player.cx + player.wallDir * 17, feetY - 8 - (this.scrapeN++ % 2) * 12, -player.wallDir);
      }
    }
    if (sig.doubleJump) fx.burst(player.cx, player.cy + 6, where.tipX, where.tipY);
    const flow =
      smoothstep(6, 16, rig.speed) * 0.85 + dash * 0.9 + (rig.spinning ? 1.1 : 0) + rig.wAir * 0.12;
    fx.update(
      dt,
      where.tipX,
      where.tipY,
      where.eyeX,
      where.eyeY,
      where.knotX,
      where.knotY,
      where.charmX,
      where.charmY,
      player.vx * 60,
      player.vy * 60,
      flow,
      rig.spinW,
    );

    // Light on top: the ember on the tail tip, the charm, the eye.
    p.glow(where.tipX, where.tipY, 9, EMBER, 0.5 * glow);
    p.glow(where.tipX, where.tipY, 3.6, HOT, 0.5 * glow);
    p.glow(where.charmX, where.charmY, 6, EMBER, 0.45 * glow);
    p.glow(where.charmX, where.charmY, 1.8, HOT, 0.7 * glow);
    if (rig.eye > 0.3) {
      p.glow(where.eyeX, where.eyeY, 7.5, AMBER, 0.34 * rig.eye);
      p.glow(where.eyeX, where.eyeY, 2.6, AMBER, 0.55 * rig.eye);
    }
    fx.draw(p);
    p.end(player.cx, player.cy);
    this.started = true;

    // --- The ember is a real light.
    const e = this.ember;
    e.x = where.tipX;
    e.y = where.tipY;
    e.radius = 250 + dash * 80 + this.flash * 90;
    e.intensity = glow * (0.9 + 0.1 * sat(rig.speed / 10));
  }

  destroy(): void {
    this.layer.removeChild(this.cel.mesh);
    this.cel.mesh.destroy();
    this.ctx.lights.remove('ember');
  }
}

export const skin: SkinDef = {
  id: 'yako',
  name: 'Yako, the dark fox',
  create: (ctx, layer) => new YakoCharacter(ctx, layer),
};
