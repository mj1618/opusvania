// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The character renderer: Ember, a small forest spirit drawn entirely in code.
 *
 *   new CharacterRenderer(ctx, layer)   `layer` is the character layer container (world px,
 *                                       parallax 1). One mesh is added to it; the layer itself is
 *                                       never moved.
 *   update(dt, clock, player, events)   once per render frame, with the interpolated PlayerView
 *                                       and the sim events since the last update.
 *
 * Pieces (see memory/character.md):
 *   rig.ts        pose generators + springs -> skeleton joints (2.5D, continuous turn)
 *   chain.ts      verlet chains with rest shapes (fixed 120 Hz sub-steps)
 *   secondary.ts  the hood's crest and the mantle's strands: chains anchored to the skeleton
 *   draw.ts       skeleton + chains -> shaded shapes
 *   paint.ts      the mesh, the shader and the shape primitives (rim light, feathered edges, glows)
 *   fx.ts         a little dust, the double-jump ring, dash motes
 *
 * The ember (the clasp at the throat) is registered as the point light 'ember' at its simulated position.
 */
import type { Container } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { PlayerView, RenderContext } from '../contract';
import type { PointLight } from '../lights';
import { KEY_LIGHT, PALETTE } from '../scene/lib/look';
import { type ChainPts, drawEmber, type SecView } from './draw';
import { Fx } from './fx';
import { clamp, noise1 } from './math';
import { Painter, type RGB, rgb } from './paint';
import { type Frame, J_CLASP, newFrame, Rig } from './rig';
import { Secondary } from './secondary';

const GHOSTS = 3;
const GHOST_LIFE = 0.24;
const GHOST_EVERY = 1 / 15;
const GHOST_A: RGB = rgb(0x5a6cff);
const GHOST_B: RGB = rgb(0x8f9cff);

interface Ghost {
  frame: Frame;
  sec: SecView;
  age: number;
  live: boolean;
}

function copyPts(n: number): ChainPts {
  return { n, rx: new Float32Array(n), ry: new Float32Array(n) };
}

export class CharacterRenderer {
  private readonly painter = new Painter();
  private readonly rig = new Rig();
  private readonly sec = new Secondary();
  private readonly fx = new Fx();
  private readonly ember: PointLight = { x: 0, y: 0, radius: 260, color: PALETTE.ember, intensity: 1 };
  private readonly ghosts: Ghost[] = [];
  private ghostTimer = 0;
  private lastEx = 0;
  private lastEy = 0;
  private started = false;

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
    p.l2c = rgb(PALETTE.ember);
    for (let i = 0; i < GHOSTS; i++) {
      this.ghosts.push({
        frame: newFrame(),
        sec: {
          crest: copyPts(this.sec.crest.n),
          mantle: this.sec.mantle.map((l) => copyPts(l.n)),
        },
        age: 0,
        live: false,
      });
    }
  }

  update(dtIn: number, clock: number, player: PlayerView, events: readonly SimEvent[]): void {
    const dt = clamp(dtIn, 0, 0.05);
    const { rig, sec, fx, painter: p } = this;
    rig.update(dt, clock, player, events);
    const sig = rig.sig;
    if (sig.spawned || !this.started) {
      sec.reset();
      fx.clear();
      for (const g of this.ghosts) g.live = false;
    }
    sec.update(dt, clock, rig, rig.frame, player);

    const ex = rig.frame.j[J_CLASP * 2] ?? player.cx;
    const ey = rig.frame.j[J_CLASP * 2 + 1] ?? player.cy;
    if (sig.spawned || !this.started) {
      this.lastEx = ex;
      this.lastEy = ey;
      this.started = true;
    }
    const evx = dt > 0 ? (ex - this.lastEx) / dt : 0;
    const evy = dt > 0 ? (ey - this.lastEy) / dt : 0;
    this.lastEx = ex;
    this.lastEy = ey;

    // --- Effects from this frame's events.
    const feetX = player.cx;
    const feetY = player.feetY;
    if (sig.landed > 7) fx.dust(feetX, feetY, 0, clamp(sig.landed / 21, 0.15, 1), sig.landHard ? 6 : 3);
    if (sig.skid) fx.dust(feetX, feetY, player.vx > 0 ? 1 : -1, 0.5, 3);
    if (sig.dashStart && player.grounded) fx.dust(feetX, feetY, -player.dashDir, 0.5, 3);
    if (sig.wallJump) fx.dust(feetX - player.facing * 18, feetY - 12, 0, 0.3, 2);
    if (sig.doubleJump) fx.burst(player.cx, player.cy + 10);
    fx.update(dt, ex, ey, evx, evy, rig.wDash);

    // --- Dash afterimages.
    for (const g of this.ghosts) {
      if (!g.live) continue;
      g.age += dt;
      if (g.age >= GHOST_LIFE) g.live = false;
    }
    if (rig.wDash > 0.55 && player.freeze === 0 && player.motion === 'dash') {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer += GHOST_EVERY;
        if (this.ghostTimer < 0) this.ghostTimer = 0;
        this.capture();
      }
    } else this.ghostTimer = 0;

    // --- Draw.
    const scale = Math.max(1e-3, Math.abs(this.layer.scale.x) * this.ctx.viewScale());
    p.fw = clamp(1 / scale, 0.06, 1.5);
    const flicker = 0.95 + 0.04 * noise1(clock * 5, 21) + 0.03 * Math.sin(clock * 1.7);
    const emberK = 1 + rig.wDash * 0.35;
    p.l2x = ex;
    p.l2y = ey;
    p.l2r = 46;
    p.l2k = 0.8 * flicker;
    p.begin();
    for (const g of this.ghosts) {
      if (!g.live) continue;
      const t = g.age / GHOST_LIFE;
      const k = 1 - t;
      p.ghost = [
        GHOST_A[0]! + (GHOST_B[0]! - GHOST_A[0]!) * k,
        GHOST_A[1]! + (GHOST_B[1]! - GHOST_A[1]!) * k,
        GHOST_A[2]! + (GHOST_B[2]! - GHOST_A[2]!) * k,
      ];
      p.ghostAlpha = 0.13 * k * k;
      drawEmber(p, g.frame, g.sec, clock);
    }
    p.ghost = null;
    fx.drawTrail(p);
    drawEmber(p, rig.frame, sec, clock);
    fx.draw(p);
    p.end(player.cx, player.cy);

    // --- The ember is a real light.
    const e = this.ember;
    e.x = ex;
    e.y = ey;
    e.radius = 260 + rig.wDash * 90;
    e.intensity = flicker * emberK;
  }

  private capture(): void {
    let g = this.ghosts.find((q) => !q.live);
    if (!g) {
      g = this.ghosts.reduce((a, b) => (a.age > b.age ? a : b));
    }
    g.frame.j.set(this.rig.frame.j);
    g.frame.s.set(this.rig.frame.s);
    copy(g.sec.crest, this.sec.crest);
    for (let i = 0; i < g.sec.mantle.length; i++) {
      const dst = g.sec.mantle[i];
      const src = this.sec.mantle[i];
      if (dst && src) copy(dst, src);
    }
    g.age = 0;
    g.live = true;
  }
}

function copy(dst: ChainPts, src: ChainPts): void {
  dst.rx.set(src.rx);
  dst.ry.set(src.ry);
}
