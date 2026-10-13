// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Draws the scene's enemies (`sim.enemies`, one kind so far: the burrback, burrback.ts). One mesh
 * for all of them and their debris (`paint.ts`), refilled on the CPU each frame; creatures off
 * screen are stepped (their springs stay settled) but not drawn. Lives in the `enemies` layer:
 * behind the hero, in front of the playfield, under the grass fringe. It goes through the normal
 * post grade (no hero matte).
 *
 * Reads only: `sim.enemies[i]` (enemies.md "What render gets"), `sim.frame`, `sim.alpha`. No sim
 * events are needed: a hit is seen as a new `hitFrame`, a death as `mode: 'dead'`, so a state jump
 * (`__game.load()`, re-form) just shows. The glints a dead one spills are the pickup renderer's.
 */
import type { Container } from 'pixi.js';
import type { EnemyState } from '../../sim/state';
import { clamp, sat } from '../character/hooded/math';
import { type CameraView, type RenderContext, type SimView, VIEW_H, VIEW_W } from '../contract';
import { ZONE_EDGES } from '../scene/lib/fx-zones';
import { BurrRig, COLORS, drawBurrback, loadColors, stepFeelers } from './burrback';
import { BURR } from './config';
import { Painter, type RGB, type Shade } from './paint';

const MAX_P = 160;
const K_FRAG = 1;
const K_MOTE = 2;
const K_DUST = 3;
const K_PLATE = 4;

const smooth = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const FRAG_C: [number, number, number] = [0, 0, 0];
const IN_C: [number, number, number] = [0, 0, 0];
const SH_IN: Shade & { alpha: number } = {
  c0: IN_C as unknown as RGB,
  c1: IN_C as unknown as RGB,
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.4,
  ember: 0,
  alpha: 1,
};
const SH_FRAG: Shade & { alpha: number } = {
  c0: FRAG_C as unknown as RGB,
  c1: FRAG_C as unknown as RGB,
  rim: 0.2,
  cool: 0.25,
  form: 0.1,
  band: 0.4,
  ember: 0,
  alpha: 1,
};

export class EnemyRenderer {
  readonly painter = new Painter();
  /** Live knobs (`__enemies.cfg`); call `recolor()` after changing `cfg.color`. */
  readonly cfg = BURR;
  /** CPU time of the last update, ms. */
  cpuMs = 0;
  /** Creatures drawn last frame, and vertices used. */
  drawn = 0;
  verts = 0;
  private readonly rigs: BurrRig[] = [];
  private readonly zw: [number, number, number] = [0, 1, 0];
  private rnd = 0x51f15e;
  // Debris: shell fragments (opaque, fall), motes (tiny lights, rise), dust (soft, spreads).
  private readonly pk = new Uint8Array(MAX_P);
  private readonly pl = new Float32Array(MAX_P);
  private readonly pm = new Float32Array(MAX_P);
  private readonly pxx = new Float32Array(MAX_P);
  private readonly pyy = new Float32Array(MAX_P);
  private readonly pvx = new Float32Array(MAX_P);
  private readonly pvy = new Float32Array(MAX_P);
  private readonly pr = new Float32Array(MAX_P);
  private readonly ps = new Float32Array(MAX_P);
  private readonly pz = new Float32Array(MAX_P);
  private readonly pf = new Float32Array(MAX_P);
  private readonly pt = new Float32Array(MAX_P);
  private next = 0;

  constructor(
    private readonly ctx: RenderContext,
    layer: Container,
  ) {
    const n = ctx.scene.enemies?.length ?? 0;
    for (let i = 0; i < n; i++) this.rigs.push(new BurrRig(i));
    layer.addChild(this.painter.mesh);
    // Dev handle, like __pickups: `__enemies.cfg.spots.glow = 0.5; __game.render()`.
    if (typeof window !== 'undefined') (window as unknown as { __enemies?: EnemyRenderer }).__enemies = this;
  }

  recolor(): void {
    loadColors();
  }

  private rand(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  private emit(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    floor: number,
  ): void {
    const i = this.next;
    this.next = (i + 1) % MAX_P;
    this.pk[i] = kind;
    this.pl[i] = 0;
    this.pm[i] = life;
    this.pxx[i] = x;
    this.pyy[i] = y;
    this.pvx[i] = vx;
    this.pvy[i] = vy;
    this.pr[i] = this.rand() * 6.28;
    this.ps[i] = (this.rand() - 0.5) * (kind === K_PLATE ? 30 : 22);
    this.pz[i] = size;
    this.pf[i] = floor;
    this.pt[i] = this.rand();
  }

  /** Shell chips from a blow that cracks it. */
  private chips(rig: BurrRig, e: EnemyState, n: number): void {
    const dir = e.hitDir || 1;
    for (let k = 0; k < n; k++) {
      this.emit(
        K_FRAG,
        rig.x + dir * (2 + this.rand() * 10),
        rig.y - 20 - this.rand() * 12,
        dir * (50 + this.rand() * 130),
        -70 - this.rand() * 120,
        0.38 + this.rand() * 0.22,
        1.1 + this.rand() * 1.3,
        rig.y,
      );
    }
  }

  /**
   * The burst: shell plates thrown along the cut (spinning, one bounce), a soft puff of spore dust
   * and a few small motes that lift away. A finisher throws everything further.
   */
  private burst(rig: BurrRig, e: EnemyState): void {
    const D = BURR.death;
    const dir = e.hitDir || 1;
    const fin = e.hitPower >= 2;
    const far = fin ? D.finisher : 1;
    const n = fin ? D.platesFinisher : D.plates;
    const cy = rig.y - 12;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n - 0.5;
      const sp = D.speed[0] + this.rand() * (D.speed[1] - D.speed[0]);
      this.emit(
        K_PLATE,
        rig.x + u * 34,
        cy - this.rand() * 10,
        (dir * sp + u * 190) * far,
        -(D.up[0] + this.rand() * (D.up[1] - D.up[0])) * (0.8 + 0.2 * far),
        0.85 + this.rand() * 0.35,
        5 + this.rand() * 3.5,
        rig.y,
      );
    }
    for (let k = 0; k < 7; k++) {
      const u = k / 6 - 0.5;
      this.emit(
        K_DUST,
        rig.x + u * 40,
        rig.y - 4 - this.rand() * 14,
        u * 90 + dir * 40 * far,
        -18 - this.rand() * 30,
        0.42 + this.rand() * 0.2,
        BURR.dust.size * (1.3 + 0.8 * this.rand()),
        rig.y,
      );
    }
    for (let k = 0; k < D.motes; k++) {
      this.emit(
        K_MOTE,
        rig.x + (this.rand() - 0.5) * 36,
        rig.y - 6 - this.rand() * 16,
        (this.rand() - 0.5) * 30 + dir * 14,
        -30 - this.rand() * 46,
        0.55 + this.rand() * 0.45,
        1.3 + this.rand() * 1,
        rig.y,
      );
    }
  }

  private dust(x: number, y: number, vx: number): void {
    this.emit(
      K_DUST,
      x,
      y - 1.5,
      vx,
      -10 - this.rand() * 14,
      0.3 + this.rand() * 0.16,
      BURR.dust.size * (0.7 + 0.6 * this.rand()),
      y,
    );
  }

  update(dt: number, clock: number, cam: CameraView, sim: SimView): void {
    const t0 = performance.now();
    const p = this.painter;
    const list = sim.enemies;
    p.fw = clamp(1 / Math.max(1e-3, cam.zoom * this.ctx.viewScale()), 0.06, 1.5);
    p.begin();
    const halfW = VIEW_W / 2 / cam.zoom + 90;
    const halfH = VIEW_H / 2 / cam.zoom + 90;
    const D = BURR.death;
    let drawn = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e) continue;
      let rig = this.rigs[i];
      if (!rig) {
        rig = new BurrRig(i);
        this.rigs[i] = rig;
      }
      if (e.gone) {
        rig.deadStage = 3;
        continue;
      }
      rig.update(e, sim.frame, sim.alpha, dt, sim.player.cx, sim.player.cy - 20, clock);
      stepFeelers(rig, e, clock, dt);

      // --- Debris, from the state alone.
      const dir = e.hitDir || 1;
      if (rig.struck && e.mode !== 'dead') this.chips(rig, e, e.hitPower >= 2 ? 5 : 3);
      if (rig.struck && e.mode === 'dead') this.chips(rig, e, 4);
      if ((e.mode === 'hurt' || e.mode === 'dead') && e.hitstop === 0 && Math.abs(e.knockVx) > 1.5) {
        rig.dustT += dt;
        while (rig.dustT > 0.05) {
          rig.dustT -= 0.05;
          this.dust(rig.x - dir * (10 + this.rand() * 16), rig.y, -dir * (10 + this.rand() * 30));
        }
      }
      if (e.mode === 'dead') {
        if ((rig.deadStage & 4) === 0 && rig.mf >= D.roll) {
          rig.deadStage |= 4;
          for (let k = 0; k < 3; k++) this.dust(rig.x + (k - 1) * 14, rig.y, (k - 1) * 26 + dir * 12);
        }
        if ((rig.deadStage & 1) === 0 && rig.mf >= D.burst) {
          rig.deadStage |= 1;
          this.burst(rig, e);
        }
      }

      if (Math.abs(rig.x - cam.x) > halfW || Math.abs(rig.y - 20 - cam.y) > halfH) continue;
      const zw = this.zw;
      const l = 1 - smooth(ZONE_EDGES.left[0], ZONE_EDGES.left[1], rig.x);
      const r = smooth(ZONE_EDGES.right[0], ZONE_EDGES.right[1], rig.x);
      zw[0] = l;
      zw[1] = 1 - l - r;
      zw[2] = r;
      // Her light lifts whatever is near her (the creature is not in her matte): a step darker there.
      const hd = Math.hypot(sim.player.cx - rig.x, sim.player.cy - (rig.y - 17));
      const nearK = sim.player.faded > 0 ? 0 : sat(1 - hd / BURR.nearHero.reach);
      if (drawBurrback(p, rig, e, clock, zw, nearK * nearK * (3 - 2 * nearK)) > 0) drawn++;
    }

    // --- Debris.
    const C = COLORS;
    for (let i = 0; i < MAX_P; i++) {
      const kind = this.pk[i]!;
      if (kind === 0) continue;
      const life = this.pl[i]! + dt;
      const max = this.pm[i]!;
      if (life >= max) {
        this.pk[i] = 0;
        continue;
      }
      this.pl[i] = life;
      const u = life / max;
      let x = this.pxx[i]!;
      let y = this.pyy[i]!;
      if (kind === K_FRAG) {
        this.pvy[i] = this.pvy[i]! + 640 * dt;
        x += this.pvx[i]! * dt;
        y += this.pvy[i]! * dt;
        const floor = this.pf[i]! - 1;
        if (y > floor && this.pvy[i]! > 0) {
          y = floor;
          this.pvy[i] = -this.pvy[i]! * 0.28;
          this.pvx[i] = this.pvx[i]! * 0.5;
          this.ps[i] = this.ps[i]! * 0.4;
        }
        this.pr[i] = this.pr[i]! + this.ps[i]! * dt;
        const s = this.pz[i]!;
        const rot = this.pr[i]!;
        const tn = this.pt[i]!;
        const c = Math.cos(rot);
        const sn = Math.sin(rot);
        // An irregular sliver of shell.
        p.px[0] = x + c * s * 1.3;
        p.py[0] = y + sn * s * 1.3;
        p.px[1] = x - sn * s * 0.75;
        p.py[1] = y + c * s * 0.75;
        p.px[2] = x - c * s * (0.7 + tn * 0.5);
        p.py[2] = y - sn * s * (0.7 + tn * 0.5);
        p.px[3] = x + sn * s * 0.55;
        p.py[3] = y - c * s * 0.55;
        const mixK = 0.35 + tn * 0.65;
        for (let k = 0; k < 3; k++) FRAG_C[k] = C.shellTop[k]! + (C.sheen[k]! - C.shellTop[k]!) * mixK;
        SH_FRAG.alpha = sat((1 - u) / 0.35);
        p.shape(4, x, y, SH_FRAG);
      } else if (kind === K_PLATE) {
        this.pvy[i] = this.pvy[i]! + 980 * dt;
        x += this.pvx[i]! * dt;
        y += this.pvy[i]! * dt;
        const floor = this.pf[i]! - 2;
        if (y > floor && this.pvy[i]! > 0) {
          y = floor;
          // One bounce, then it lies where it fell.
          if (this.pvy[i]! > 150) {
            this.pvy[i] = -this.pvy[i]! * 0.36;
            this.pvx[i] = this.pvx[i]! * 0.55;
            this.ps[i] = this.ps[i]! * 0.5;
          } else {
            this.pvy[i] = 0;
            this.pvx[i] = 0;
            this.ps[i] = 0;
          }
        }
        this.pr[i] = this.pr[i]! + this.ps[i]! * dt;
        const s = this.pz[i]!;
        const rot = this.pr[i]!;
        const tn = this.pt[i]!;
        const c = Math.cos(rot);
        const sn = Math.sin(rot);
        // A curved shard of shell: dark outer face, a paler inner face along one side.
        const a = sat((1 - u) / 0.25);
        const w = s * (0.55 + 0.25 * tn);
        p.px[0] = x + c * s * 1.25;
        p.py[0] = y + sn * s * 1.25;
        p.px[1] = x + c * s * 0.2 - sn * w;
        p.py[1] = y + sn * s * 0.2 + c * w;
        p.px[2] = x - c * s * 1.1 - sn * w * 0.5;
        p.py[2] = y - sn * s * 1.1 + c * w * 0.5;
        p.px[3] = x - c * s * 0.9 + sn * w * 0.7;
        p.py[3] = y - sn * s * 0.9 - c * w * 0.7;
        p.px[4] = x + c * s * 0.4 + sn * w;
        p.py[4] = y + sn * s * 0.4 - c * w;
        for (let k = 0; k < 3; k++) FRAG_C[k] = C.shellTop[k]! + (C.sheen[k]! - C.shellTop[k]!) * 0.7;
        SH_FRAG.alpha = a;
        p.shape(5, x, y, SH_FRAG);
        for (let k = 0; k < 3; k++) IN_C[k] = C.plateIn[k]!;
        SH_IN.alpha = a;
        p.px[0] = x + c * s * 1.25;
        p.py[0] = y + sn * s * 1.25;
        p.px[1] = x + c * s * 0.2 - sn * w;
        p.py[1] = y + sn * s * 0.2 + c * w;
        p.px[2] = x - c * s * 1.1 - sn * w * 0.5;
        p.py[2] = y - sn * s * 1.1 + c * w * 0.5;
        p.px[3] = x - c * s * 0.3 - sn * w * 0.1;
        p.py[3] = y - sn * s * 0.3 + c * w * 0.1;
        p.shape(4, x + c * s * 0.1 - sn * w * 0.45, y + sn * s * 0.1 + c * w * 0.45, SH_IN);
      } else if (kind === K_MOTE) {
        this.pvy[i] = this.pvy[i]! * (1 - 0.9 * dt);
        x += (this.pvx[i]! + Math.sin(clock * 5 + this.pr[i]!) * 10) * dt;
        y += this.pvy[i]! * dt;
        const k = sat(u / 0.12) * (1 - u) * (1 - u);
        const s = this.pz[i]!;
        p.glow(x, y, s * 2.6, C.mote as unknown as RGB, 0.5 * k, s * 2.6, 0, 10);
        p.glow(x, y, s * 0.9, C.mote as unknown as RGB, 0.55 * k, s * 0.9, 0, 8);
      } else {
        this.pvx[i] = this.pvx[i]! * (1 - 3 * dt);
        x += this.pvx[i]! * dt;
        y += this.pvy[i]! * dt;
        const s = this.pz[i]! * (1 + 1.5 * u);
        p.soft(x, y, s, s * 0.62, C.dust as unknown as RGB, BURR.dust.alpha * sat(u / 0.15) * (1 - u));
      }
      this.pxx[i] = x;
      this.pyy[i] = y;
    }

    p.end(cam.x - halfW, cam.y - halfH, halfW * 2, halfH * 2);
    this.drawn = drawn;
    this.verts = p.vertexCount;
    this.cpuMs = performance.now() - t0;
  }
}
