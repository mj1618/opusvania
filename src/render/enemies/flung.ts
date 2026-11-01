/**
 * Light fodder killed by a cut is batted away (canopy r22, HK's launched corpses): the body flies along the blow,
 * tumbling, bounces on the room's solids (ground.ts, read only), comes to rest on its back and lies `FLUNG.lie`
 * seconds before it fades. Render-side only: the sim's dead body stays where the sim keeps it and is dropped after
 * its `deadFrames`; this is where it is DRAWN. No Pixi here (tested in tests/unit/hitfx.test.ts).
 */
import type { Scene } from '../../sim/scene';
import { groundBelow, inSolid } from './ground';

export const FLUNG = {
  /** Kinds batted away dead (the rest keep their own deaths: the burrback's plate burst, the moth's dissolve). */
  kinds: ['juvenileBurrback', 'carrier'] as readonly string[],
  /** Launch speed along a forward cut (px/s; the finisher x `fin`), and up; an up cut throws it higher. */
  speed: 370,
  fin: 1.3,
  up: 330,
  upCut: 620,
  /** Spin (rad/s) the way it was struck; gravity (px/s^2); bounce: what is kept of vy, of vx, of the spin. */
  spin: 15,
  g: 1700,
  bounce: 0.38,
  slide: 0.6,
  spinKeep: 0.45,
  /** Under this landing speed (px/s) it stays down and slides to a stop (`friction` /s), rolling onto its back. */
  rest: 140,
  friction: 7,
  /** Seconds it lies still, then fades over `fade`. */
  lie: 2,
  fade: 0.6,
};

export class FlungBody {
  /** Feet point (drawn), velocity, the body's turn (rad: pi = on its back), its spin. */
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  ang = 0;
  va = 0;
  /** On the ground and at rest; seconds since it came to rest; seconds since launch. */
  down = false;
  still = 0;
  t = 0;
  alive = false;
  /** How hard it met the ground this step (px/s; 0 = it did not): the renderer kicks dust. */
  thud = 0;

  launch(x: number, y: number, dir: string, side: number, power: number): void {
    const s = side >= 0 ? 1 : -1;
    const fin = power >= 2 ? FLUNG.fin : 1;
    this.x = x;
    this.y = y;
    if (dir === 'up') {
      this.vx = s * FLUNG.speed * 0.3;
      this.vy = -FLUNG.upCut * fin;
    } else if (dir === 'down') {
      this.vx = s * FLUNG.speed * 0.35;
      this.vy = -FLUNG.up * 0.8;
    } else {
      this.vx = s * FLUNG.speed * fin;
      this.vy = -FLUNG.up * fin;
    }
    this.ang = 0;
    this.va = s * FLUNG.spin * fin;
    this.down = false;
    this.still = 0;
    this.t = 0;
    this.alive = true;
  }

  /** 0..1: how visible it still is. */
  get alpha(): number {
    const u = (this.still - FLUNG.lie) / FLUNG.fade;
    return u <= 0 ? 1 : u >= 1 ? 0 : 1 - u;
  }

  step(dt: number, scene: Scene): void {
    this.thud = 0;
    if (!this.alive || dt <= 0) return;
    this.t += dt;
    if (this.down) {
      // Sliding to a stop on its back.
      this.vx *= Math.max(0, 1 - FLUNG.friction * dt);
      this.x += this.vx * dt;
      if (inSolid(scene, this.x, this.y - 4)) this.vx = 0;
      this.settle(dt, 14);
      if (Math.abs(this.vx) < 4) this.still += dt;
      if (this.still > FLUNG.lie + FLUNG.fade) this.alive = false;
      return;
    }
    const x0 = this.x;
    const y0 = this.y;
    this.vy += FLUNG.g * dt;
    let x1 = x0 + this.vx * dt;
    const y1 = y0 + this.vy * dt;
    // A face in the way: it bounces back off it.
    if (inSolid(scene, x1, y0 - 6)) {
      this.vx = -this.vx * 0.3;
      this.va *= -0.5;
      x1 = x0;
    }
    const floor = groundBelow(scene, x1, y0 - 1);
    this.ang += this.va * dt;
    if (y1 >= floor && this.vy > 0) {
      this.y = floor;
      this.x = x1;
      this.thud = this.vy;
      if (this.vy > FLUNG.rest) {
        this.vy = -this.vy * FLUNG.bounce;
        this.vx *= FLUNG.slide;
        this.va *= FLUNG.spinKeep;
      } else {
        this.vy = 0;
        this.down = true;
      }
      return;
    }
    // Off the room's bottom: gone.
    if (y1 > scene.height + 200) this.alive = false;
    this.x = x1;
    this.y = y1;
  }

  /** Rolls it onto its back (the nearest turn that is): `k` /s. */
  private settle(dt: number, k: number): void {
    const target = Math.round((this.ang - Math.PI) / (2 * Math.PI)) * 2 * Math.PI + Math.PI;
    this.ang += (target - this.ang) * Math.min(1, k * dt);
    this.va = 0;
  }
}
