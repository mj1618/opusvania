// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper, the moth: a night-flier who carries her own light. Skin id `vesper`.
 *
 *   rig.ts    pose generators + springs -> skeleton (2.5D, continuous turn, dragged hands)
 *   chain.ts  verlet chains with rest shapes (copy of hooded/chain.ts + per-segment ripple)
 *   wings.ts  the two wing membranes (five strands each) and the two antennae
 *   draw.ts   skeleton + chains -> shaded shapes (through hooded/paint.ts, one mesh)
 *   fx.ts     rising gold dust, light trails, landing dust
 *
 * Her light is the pair of lantern tips on her antennae: their midpoint is the point light 'ember'.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import type { PlayerView, RenderContext } from '../../contract';
import type { PointLight } from '../../lights';
import { KEY_LIGHT } from '../../scene/lib/look';
import { clamp, noise1, Spring, sat } from '../hooded/math';
import { Painter, rgb } from '../hooded/paint';
import type { CharacterSkin, SkinDef } from '../skin';
import { drawVesper, type View } from './draw';
import { FX_GOLD, FX_GOLD_DEEP, FX_GOLD_HOT, Fx, Trail } from './fx';
import { J_HEAD, Rig } from './rig';
import { Secondary } from './wings';

const LIGHT = 0xffe0a0;

export class VesperCharacter implements CharacterSkin {
  private readonly painter = new Painter();
  private readonly rig = new Rig();
  private readonly sec = new Secondary();
  private readonly fx = new Fx();
  private readonly trails = [new Trail(20, 0.13, 3.4), new Trail(20, 0.11, 3), new Trail(24, 0.17, 5)];
  private readonly light: PointLight = { x: 0, y: 0, radius: 250, color: LIGHT, intensity: 1 };
  private readonly hairX = new Spring(0, 17, 0.42);
  private readonly hairY = new Spring(0, 15, 0.4);
  private readonly view: View;
  private readonly pts = new Float32Array(6);
  private readonly lastX = new Float32Array(3);
  private readonly lastY = new Float32Array(3);
  private started = false;
  private flash = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layer: Container,
  ) {
    this.painter.mesh.label = 'vesper';
    layer.addChild(this.painter.mesh);
    ctx.lights.set('ember', this.light);
    const p = this.painter;
    p.lx = -KEY_LIGHT.dirX;
    p.ly = -KEY_LIGHT.dirY;
    p.keyColor = rgb(KEY_LIGHT.color);
    p.l2c = rgb(LIGHT);
    this.view = {
      wings: this.sec.wings,
      antennae: this.sec.antennae,
      open: 0,
      hairX: 0,
      hairY: 0,
      glow: 1,
      tuck: 0,
      wall: 0,
      wallDir: 1,
    };
  }

  update(dtIn: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void {
    const dt = clamp(dtIn, 0, 0.05);
    const { rig, sec, fx, painter: p, view } = this;
    rig.update(dt, clock, player, events);
    const sig = rig.sig;
    const fresh = sig.spawned || !this.started;
    if (fresh) {
      sec.reset();
      fx.clear();
      for (const t of this.trails) t.clear();
    }
    sec.update(dt, clock, rig, rig.frame, player);

    // --- Head fur lags the head.
    const hx = rig.frame.j[J_HEAD * 2]!;
    const hy = rig.frame.j[J_HEAD * 2 + 1]!;
    if (fresh) {
      this.hairX.snap(hx);
      this.hairY.snap(hy);
    }
    let lx = (this.hairX.step(hx, dt) - hx) * 0.22;
    let ly = (this.hairY.step(hy, dt) - hy) * 0.22;
    const lk = 1 / (1 + Math.hypot(lx, ly) / 3.6);
    lx *= lk;
    ly *= lk;
    view.hairX = lx + noise1(clock * 0.7, 51) * 0.35;
    view.hairY = ly + noise1(clock * 0.9, 53) * 0.25;
    view.open = sec.open;
    view.tuck = rig.spinW;
    view.wall = rig.wWall;
    view.wallDir = rig.frame.s[0]! >= 0 ? 1 : -1;

    // --- Her light: the two lantern tips.
    const a0 = sec.antennae[0];
    const a1 = sec.antennae[1];
    const nearWing = sec.wings[rig.frame.s[0]! >= 0 ? 0 : 1].strands;
    const hem = nearWing[0]!;
    const mid = nearWing[2]!;
    const pts = this.pts;
    pts[0] = a0.rx[a0.n - 1]!;
    pts[1] = a0.ry[a0.n - 1]!;
    pts[2] = a1.rx[a1.n - 1]!;
    pts[3] = a1.ry[a1.n - 1]!;
    pts[4] = hem.rx[hem.n - 1]!;
    pts[5] = hem.ry[hem.n - 1]!;
    const ex = (pts[0]! + pts[2]!) * 0.5;
    const ey = (pts[1]! + pts[3]!) * 0.5;

    // --- Events.
    const feetX = player.cx;
    const feetY = player.feetY;
    if (sig.landed > 8) fx.dust(feetX, feetY, 0, clamp(sig.landed / 21, 0.15, 1), sig.landHard ? 6 : 3);
    if (sig.skid) fx.dust(feetX, feetY, player.vx > 0 ? 1 : -1, 0.45, 3);
    if (sig.dashStart && player.grounded) fx.dust(feetX, feetY, -player.dashDir, 0.45, 3);
    if (sig.wallJump) fx.dust(feetX - player.facing * 18, feetY - 12, 0, 0.3, 2);
    if (sig.doubleJump) this.flash = 0.6;
    // The burst leaves the wings as she opens out of the somersault.
    if (sig.opened) {
      this.flash = 1;
      for (let w = 0; w < 2; w++) {
        const c = sec.wings[w]!.strands[1 + w]!;
        fx.burst(c.rx[3]!, c.ry[3]!, player.vx * 12, 60, 14);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 1.9);

    // --- Dust rises off the wings; more of it when she moves.
    const moving = sat(Math.hypot(player.vx, player.vy) / 10);
    const rate = fresh ? 0 : 2.2 + 9 * moving + 22 * rig.wDash + 8 * this.flash;
    fx.shed(dt, rate, mid.rx[2]!, mid.ry[2]!, 13, player.vx * 9, player.vy * 9);
    fx.update(dt, clock);

    // --- Trails: lit by how fast each point is really moving.
    for (let i = 0; i < 3; i++) {
      const x = pts[i * 2]!;
      const y = pts[i * 2 + 1]!;
      const v = fresh || dt <= 0 ? 0 : Math.hypot(x - this.lastX[i]!, y - this.lastY[i]!) / dt;
      this.lastX[i] = x;
      this.lastY[i] = y;
      const k = sat((v - 330) / 600) * (i === 2 ? 0.75 : 1) + 0.3 * rig.spinW;
      this.trails[i]!.push(dt, x, y, k);
    }
    this.started = true;

    // --- Draw.
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale());
    p.fw = clamp(1 / scale, 0.06, 1.5);
    const flicker = 0.95 + 0.045 * noise1(clock * 4.3, 21) + 0.03 * Math.sin(clock * 1.3);
    const glow = flicker * (1 + 0.3 * rig.wDash + 0.55 * this.flash);
    view.glow = glow;
    p.l2x = ex;
    p.l2y = ey;
    p.l2r = 60;
    p.l2k = 0.7 * glow;
    p.begin();
    this.trails[2]!.draw(p, FX_GOLD_DEEP, FX_GOLD, 0.22);
    drawVesper(p, rig.frame, view, clock);
    this.trails[0]!.draw(p, FX_GOLD, FX_GOLD_HOT, 0.4);
    this.trails[1]!.draw(p, FX_GOLD, FX_GOLD_HOT, 0.32);
    fx.draw(p, clock);
    p.end(player.cx, player.cy);

    const e = this.light;
    e.x = ex;
    e.y = ey;
    e.radius = 250 + 70 * rig.wDash + 90 * this.flash;
    e.intensity = glow;
  }

  destroy(): void {
    this.layer.removeChild(this.painter.mesh);
    this.painter.mesh.destroy();
    if (this.ctx.lights.get('ember') === this.light) this.ctx.lights.remove('ember');
  }
}

export const skin: SkinDef = {
  id: 'vesper',
  name: 'Vesper, the moth',
  create: (ctx, layer) => new VesperCharacter(ctx, layer),
};
