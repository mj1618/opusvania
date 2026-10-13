/**
 * The character renderer. THIS WHOLE DIRECTORY IS A PLACEHOLDER and will be replaced by the
 * character work; only the class name, the constructor and `update` below are the contract.
 *
 *   new CharacterRenderer(ctx, layer)   `layer` is the character layer container: world px,
 *                                       parallax 1, drawn between playfield and foreground. Add
 *                                       your display objects to it; never move the layer itself.
 *   update(dt, clock, player, events)   once per render frame.
 *       dt      seconds of render time since the last update (1/60 per step when stepped manually)
 *       clock   seconds of render time since boot (keeps running while the sim is frozen)
 *       player  PlayerView (src/render/contract.ts): the sim's PlayerState with interpolated
 *               position. Useful fields: cx / cy / feetY, vx / vy (px per sim frame), facing,
 *               grounded, contactFrames, wallDir, mode + modeFrames, motion + motionFrames
 *               (idle | run | skid | rise | fall | wallSlide | dash), inputX, dashDir, freeze.
 *       events  the sim events since the last update (src/sim/events.ts): spawn (snap everything,
 *               do not interpolate from the old place), jump{kind}, fall, apex, land{vy, fallPx,
 *               hard}, step, turn, skid, wallSlideStart/End, dashStart/End, headBump,
 *               cornerCorrect, dropThrough.
 *
 * The collision box is player.w x player.h (40 x 80); the drawing may overhang it. Register glow
 * as point lights through `ctx.lights` (the ember below) so the environment can react to it.
 */
import { type Container, Graphics } from 'pixi.js';
import type { SimEvent } from '../../sim/events';
import type { PlayerView, RenderContext } from '../contract';
import type { PointLight } from '../lights';

export class CharacterRenderer {
  private readonly g = new Graphics();
  private readonly ember: PointLight = { x: 0, y: 0, radius: 260, color: 0xffb36b, intensity: 1 };

  constructor(ctx: RenderContext, layer: Container) {
    layer.addChild(this.g);
    ctx.lights.set('ember', this.ember);
  }

  update(_dt: number, clock: number, player: PlayerView, _events: readonly SimEvent[]): void {
    const { cx, feetY, w, h, facing } = player;
    const g = this.g.clear();
    // Capsule the size of the collision box, a facing dot for the eye, a dot for the ember.
    g.roundRect(cx - w / 2, feetY - h, w, h, w / 2).fill(0x2a1f4a);
    g.circle(cx + facing * 9, feetY - h + 22, 6).fill(0xffd9a0);
    const ex = cx - facing * 30;
    const ey = feetY - 26 + Math.sin(clock * 3) * 3;
    g.circle(ex, ey, 7).fill(0xffb36b);
    this.ember.x = ex;
    this.ember.y = ey;
  }
}
