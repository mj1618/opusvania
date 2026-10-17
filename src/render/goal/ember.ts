/**
 * The ember: the great glint the summit lantern will not catch without (`scene.lanterns[].key`,
 * memory/goal.md). Where it hangs it is drawn by the pickup renderer (a coal in a bud's cup); this
 * is everything after and around that:
 *
 *  - carried: from `lanternKey` on a small coal rides at her shoulder, circling slowly (behind her
 *    on the far half of the turn), trailing a faint warm line when she moves;
 *  - given: when the lantern's channel starts the coal leaves her shoulder and goes into the bulb,
 *    sits there while her glints stream in, and is the flame's heart when it catches (a broken
 *    channel sends it back to her);
 *  - wanted: while she does not have it the lantern's bulb holds a cold hollow of the coal's shape,
 *    cold motes drift from it toward where the ember hangs, and its price is one hollow ember mark
 *    (with the ember, the mark is filled and stands over the crown of flames).
 *
 * Render only, render time only. Knobs: `GOAL.ember`.
 */
import { Container, Graphics, type Sprite } from 'pixi.js';
import type { SimView } from '../contract';
import { type GlintBatch, K_COAL, K_FLARE, K_SPARK } from '../pickups/batch';
import { GOAL } from './config';
import { smooth } from './logic';

const HIST = 8;

export class EmberKey {
  /** Which lantern wants it (index in `scene.lanterns`) and which pickup it is. */
  readonly lantern: number;
  readonly pick: number;
  readonly id: string;
  /** Where it hangs. */
  readonly x: number;
  readonly y: number;
  /** The price mark (a hollow ember, warm like the flames of a price): the renderer adds it in front. */
  readonly mark = new Container();
  /** For tools: is a coal on her (or on its way into the bulb), where, and how far into the bulb (0..1). */
  has = false;
  cx = 0;
  cy = 0;
  into = 0;
  /** 0..1: the lantern has told her what it wants (a notice or a refusal carrying the key), fading. */
  call = 0;
  private readonly outline = new Graphics();
  private readonly motes: Sprite[] = [];
  private ang = 0;
  /** Seconds since it reached her (the first beat at her shoulder), and since its lantern caught. */
  private age = 1e6;
  private burn = -1;
  private readonly hx = new Float32Array(HIST);
  private readonly hy = new Float32Array(HIST);
  private hn = 0;
  private histIn = 0;
  private markA = 0;
  private markFill = 0;

  /** The scene's first lantern with a key that names a pickup, or null. */
  static find(scene: SimView['scene']): { lantern: number; pick: number } | null {
    const list = scene.lanterns ?? [];
    for (let i = 0; i < list.length; i++) {
      const key = list[i]?.key;
      if (key === undefined) continue;
      const pick = (scene.pickups ?? []).findIndex((p) => p.id === key);
      if (pick >= 0) return { lantern: i, pick };
    }
    return null;
  }

  /** `cold(tint)` makes one additive glow sprite (the renderer's), added to `layer`. */
  constructor(
    scene: SimView['scene'],
    at: { lantern: number; pick: number },
    layer: Container,
    cold: () => Sprite,
  ) {
    this.lantern = at.lantern;
    this.pick = at.pick;
    const p = scene.pickups?.[at.pick];
    this.id = p?.id ?? '';
    this.x = p?.x ?? 0;
    this.y = p?.y ?? 0;
    for (let i = 0; i < GOAL.ember.thread.n; i++) {
      const s = cold();
      layer.addChild(s);
      this.motes.push(s);
    }
    // The mark: the coal's outline, squat and faceted, with its crack. Hollow.
    const M = GOAL.ember.mark;
    const w = M.w;
    const h = M.h;
    this.outline
      .moveTo(-w, 0.5)
      .quadraticCurveTo(-w * 0.72, -h * 0.82, -w * 0.18, -h)
      .quadraticCurveTo(w * 0.5, -h * 1.02, w * 0.92, -h * 0.3)
      .quadraticCurveTo(w * 1.08, h * 0.4, w * 0.4, h * 0.92)
      .quadraticCurveTo(-w * 0.3, h * 1.1, -w * 0.82, h * 0.62)
      .quadraticCurveTo(-w * 1.04, h * 0.3, -w, 0.5)
      .closePath()
      .fill({ color: 0x100806, alpha: 0.55 })
      .stroke({ width: 1.3, color: GOAL.refuse.mark, alpha: 0.9, join: 'round' });
    this.outline
      .moveTo(-w * 0.55, h * 0.1)
      .quadraticCurveTo(-w * 0.1, -h * 0.25, w * 0.2, h * 0.08)
      .quadraticCurveTo(w * 0.4, h * 0.2, w * 0.56, -h * 0.05)
      .stroke({ width: 0.9, color: GOAL.refuse.mark, alpha: 0.55, cap: 'round' });
    this.mark.addChild(this.outline);
    this.mark.visible = false;
  }

  /** She has gathered it and its lantern is still dark. */
  carried(sim: SimView): boolean {
    const s = sim.goal.lanterns[this.lantern];
    return s !== undefined && !s.lit && (sim.pickups.timers[this.pick] ?? 0) < 0;
  }

  /** The lantern still waits for it (it hangs where it hung, or is on its way to her). */
  wanted(sim: SimView): boolean {
    const s = sim.goal.lanterns[this.lantern];
    return s !== undefined && !s.lit && (sim.pickups.timers[this.pick] ?? 0) >= 0;
  }

  /**
   * `bead` = the lantern's glass (x, y); `chest` = where light leaves her; `notice` 0..1 = the lantern
   * has noticed her; `price` 0..1 = how far its price is shown, `crown` = the crown's radius px
   * (the mark stands over it once she carries the ember). `b` is behind her, `f` in front.
   */
  update(
    dt: number,
    clock: number,
    sim: SimView,
    beadX: number,
    beadY: number,
    chestX: number,
    chestY: number,
    notice: number,
    price: number,
    crown: number,
    seen: boolean,
    b: GlintBatch,
    f: GlintBatch,
  ): void {
    const E = GOAL.ember;
    const p = sim.player;
    const s = sim.goal.lanterns[this.lantern];
    const carried = this.carried(sim);
    const wanted = this.wanted(sim);

    // --- What happened.
    let took = false;
    for (const e of sim.events) {
      if (e.type === 'lanternKey' && e.key === this.id) took = true;
      else if ((e.type === 'lanternNotice' || e.type === 'lanternRefuse') && e.key?.id === this.id)
        this.call = 1;
    }
    const far = Math.hypot(p.cx - beadX, p.cy - beadY);
    if (!wanted || far > E.callLeave) this.call = Math.max(0, this.call - dt * 1.2);

    // --- The coal she carries.
    const giving = s !== undefined && (s.channel > 0 || s.lit);
    if (s?.lit && this.has && this.burn < 0) this.burn = 0;
    if (carried && !this.has) {
      this.has = true;
      this.into = 0;
      this.burn = -1;
      this.hn = 0;
      this.age = took ? 0 : 1e6;
      this.cx = took ? chestX : p.cx - p.facing * E.carry.back;
      this.cy = took ? chestY : p.cy - E.carry.up;
    } else if (!carried && this.has && this.burn < 0) this.has = false;
    if (this.burn >= 0) {
      this.burn += dt;
      if (this.burn > E.give.burn) {
        this.burn = -1;
        this.has = false;
      }
    }
    if (this.has) {
      const C = E.carry;
      this.age += dt;
      this.ang += dt * C.turn;
      const sn = Math.sin(this.ang);
      const cs = Math.cos(this.ang);
      // Its place by her shoulder, on the side she has her back to; it lags behind when she moves.
      const ax = p.cx - p.facing * C.back + cs * C.rx;
      const ay = p.cy - C.up + sn * C.ry + Math.sin(clock * 1.3) * 2;
      const lag = Math.min(1, dt * C.follow);
      this.cx += (ax - this.cx) * lag;
      this.cy += (ay - this.cy) * lag;
      this.into = Math.min(1, Math.max(0, this.into + (giving ? dt / E.give.seconds : -dt / E.give.back)));
      const k = smooth(0, 1, this.into);
      const arc = Math.sin(Math.PI * k) * E.give.arc;
      const x = this.cx + (beadX - this.cx) * k;
      const y = this.cy + (beadY + 1 - this.cy) * k - arc;
      // The trail: where it has just been, thin and cooling. Nothing when it hangs still.
      this.histIn -= dt;
      if (this.histIn <= 0) {
        this.histIn = C.trailStep;
        for (let j = Math.min(this.hn, HIST - 1); j > 0; j--) {
          this.hx[j] = this.hx[j - 1] as number;
          this.hy[j] = this.hy[j - 1] as number;
        }
        this.hx[0] = x;
        this.hy[0] = y;
        this.hn = Math.min(HIST, this.hn + 1);
      }
      const gone = this.burn >= 0 ? 1 - smooth(0, E.give.burn, this.burn) : 1;
      // Behind her on the far half of its turn (not once it has left for the bulb).
      const front = sn > -0.15 || k > 0.05;
      const q = front ? f : b;
      const arrive = Math.exp(-this.age * 3.2);
      const size =
        (C.quad + (E.give.quad - C.quad) * k) * (1 + 0.5 * arrive) * (0.9 + 0.1 * (front ? 1 : 0.7));
      let lx = x;
      let ly = y;
      for (let j = 0; j < this.hn; j++) {
        const u = 1 - (j + 1) / (HIST + 1);
        const nx = this.hx[j] as number;
        const ny = this.hy[j] as number;
        const moved = Math.min(1, Math.hypot(nx - lx, ny - ly) / 5);
        q.quad(
          K_SPARK,
          nx,
          ny,
          C.trail * (0.4 + 0.6 * u),
          C.trail * (0.4 + 0.6 * u),
          C.trailGain * u * u * moved * gone,
          0,
          0.15,
        );
        lx = nx;
        ly = ny;
      }
      q.quad(K_FLARE, x, y, size * 1.9, size * 1.9, (C.halo + 0.3 * arrive + 0.25 * k) * gone, 0, 0);
      q.quad(K_COAL, x, y, size, size, gone, 0.37, 1);
      this.outX = x;
      this.outY = y;
    } else this.into = 0;

    // --- The lantern without it: a cold hollow in the bulb, cold motes that drift toward the ember.
    const T = E.thread;
    const want = wanted && seen ? T.idle + (1 - T.idle) * Math.max(this.call, notice) : 0;
    // Every few seconds the hollow (and the mark) remembers the coal: a ghost of it warms and dies.
    const ghost = Math.max(0, Math.sin((clock * Math.PI) / E.ghost)) ** 8;
    if (wanted && seen) {
      const hb = 0.8 + 0.2 * Math.sin(clock * 1.4);
      b.quad(
        K_COAL,
        beadX,
        beadY + 1,
        E.hollow,
        E.hollow,
        (0.7 + 0.3 * Math.max(this.call, notice)) * hb,
        0.37,
        0,
      );
      b.quad(K_COAL, beadX, beadY + 1, E.hollow, E.hollow, 0.85 * ghost, 0.37, 0.75);
    }
    const dx = this.x - beadX;
    const dy = this.y - beadY;
    const dl = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i] as Sprite;
      if (want <= 0.01) {
        m.visible = false;
        continue;
      }
      const u = (((clock / T.seconds + i / this.motes.length) % 1) + 1) % 1;
      const d = T.from + (T.reach - T.from) * u;
      const wob = Math.sin(u * 6.1 + i * 2.3 + clock * 0.6) * T.wander * u;
      // Out of the glass, then a slow fall along the way to it (a little under the straight line).
      m.position.set(
        beadX + (dx / dl) * d - (dy / dl) * wob,
        beadY + (dy / dl) * d + (dx / dl) * wob + T.sag * u * u,
      );
      const a = Math.sin(Math.PI * u ** 0.75) ** 0.9 * want * T.alpha;
      m.visible = a > 0.01;
      m.alpha = a;
      m.width = m.height = T.size * (1 - 0.5 * u);
    }

    // --- The price: one ember mark. Hollow while she lacks it (it stands alone); filled, over the crown.
    const show = s !== undefined && !s.lit && seen ? price : 0;
    this.markA += (show - this.markA) * Math.min(1, dt * 9);
    this.markFill += ((carried ? 1 : 0) - this.markFill) * Math.min(1, dt * 5);
    const M = E.mark;
    if (this.markA > 0.01) {
      const mf = this.markFill;
      const my = beadY - 5 - (M.alone + (crown + M.over - M.alone) * mf);
      const sc = M.scaleAlone + (M.scale - M.scaleAlone) * mf;
      const breath = 1 + 0.05 * Math.sin(clock * 2.2);
      this.mark.visible = true;
      this.mark.position.set(beadX, my);
      this.mark.scale.set(sc * breath);
      this.mark.alpha = this.markA * GOAL.refuse.alpha;
      this.outline.alpha = 1 - 0.6 * mf;
      const mq = M.w * sc * 1.75;
      if (mf > 0.02 && this.into < 0.5 && this.burn < 0)
        f.quad(K_COAL, beadX, my, mq, mq, this.markA * mf, 0.37, 1);
      else if (mf < 0.5) f.quad(K_COAL, beadX, my, mq, mq, this.markA * ghost * 0.9, 0.37, 0.8);
    } else this.mark.visible = false;
  }

  /** Where the carried coal was drawn last (for tools). */
  outX = 0;
  outY = 0;
}
