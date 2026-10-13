/**
 * Glints: the light Vesper gathers. This draws the scene's pickups (`scene.pickups`) in world
 * space and plays what the sim decides: a glint wakes (`pickupWake`), flies to her in the frames
 * the sim gives it, and is absorbed (`pickup`). Nothing here changes the sim; which glints still
 * hang is read from `sim.pickups.timers` every frame, so a restart or a state jump just shows.
 *
 * Everything luminous is one mesh (batch.ts): the glints, their trails, sparks, rings and flares.
 * The buds that hold great glints are a few Graphics (holder.ts), behind and in front of it.
 * Look knobs: config.ts. See memory/pickups.md.
 */
import { Container } from 'pixi.js';
import type { Pickup } from '../../sim/scene';
import { type CameraView, type RenderContext, type SimView, VIEW_H, VIEW_W } from '../contract';
import type { PointLight } from '../lights';
import { wind } from '../scene/lib/look';
import { GlintBatch, K_FLARE, K_GLINT, K_GREAT, K_RING, K_SPARK } from './batch';
import { GLINTS, MAX_QUADS } from './config';
import { findRoot, Holder } from './holder';

const TRAIL_MAX = 16;
const MAX_FLIGHTS = 24;
const MAX_SPARKS = 260;
const MAX_RINGS = 24;
const MAX_FLARES = 24;

/** What the renderer remembers about one pickup. */
interface Item {
  p: Pickup;
  great: boolean;
  /** 0..1, fixed per pickup: de-syncs pulses and motes. */
  seed: number;
  /** Pulse phase: runs along x so a line of glints pulses as a travelling wave. */
  phase: number;
  /** 0 hanging, 1 on its way (a flight owns it), 2 gone. */
  stage: 0 | 1 | 2;
  /** Fades in after a restart. */
  appear: number;
  /** Where it is drawn this frame. */
  x: number;
  y: number;
  holder: Holder | null;
  /** Great glints: 0..1 strength of the light it lends (eases out when taken). */
  lit: number;
}

interface Flight {
  on: boolean;
  item: Item | null;
  t: number;
  dur: number;
  fly: number;
  /** Start, and the unit vector away from her at the moment it woke. */
  sx: number;
  sy: number;
  ax: number;
  ay: number;
  side: number;
  left: boolean;
  /** Absorbed: the trail is closing up. */
  done: boolean;
  x: number;
  y: number;
  hx: Float32Array;
  hy: Float32Array;
  hn: number;
}

interface Spark {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** 1 = rises and lingers (shimmer), 0 = burst. */
  drift: number;
}

interface Ring {
  life: number;
  max: number;
  x: number;
  y: number;
  r0: number;
  r1: number;
  width: number;
  gain: number;
  /** Follows the hero's chest by this offset instead of staying put. */
  follow: boolean;
}

interface Flare {
  life: number;
  max: number;
  x: number;
  y: number;
  r0: number;
  r1: number;
  gain: number;
  heart: number;
  follow: boolean;
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export class PickupRenderer {
  readonly cfg = GLINTS;
  readonly batch = new GlintBatch(MAX_QUADS);
  /** CPU time of the last update, ms (dev aid). */
  cpuMs = 0;
  private readonly back = new Container({ label: 'glint-buds-back' });
  private readonly front = new Container({ label: 'glint-buds-front' });
  private readonly items: Item[] = [];
  private readonly byId = new Map<string, Item>();
  private readonly flights: Flight[] = [];
  private readonly sparks: Spark[] = [];
  private readonly rings: Ring[] = [];
  private readonly flares: Flare[] = [];
  private readonly lights: PointLight[] = [];
  private readonly lightOn: boolean[] = [];
  private sparkAt = 0;
  private ringAt = 0;
  private flareAt = 0;
  /** A tiny LCG for spark scatter (render only; never the sim's RNG). */
  private rnd = 0x9e3779b9;
  private chestX = 0;
  private chestY = 0;

  constructor(
    private readonly ctx: RenderContext,
    layer: Container,
  ) {
    const scene = ctx.scene;
    for (const p of scene.pickups ?? []) {
      const great = p.kind === 'great';
      const seed = hash01(p.id);
      let holder: Holder | null = null;
      if (great) {
        const root = findRoot(scene, p.x, p.y);
        if (root) {
          holder = new Holder(root, p.x, p.y, GLINTS.great.seat, seed);
          this.back.addChild(holder.back);
          this.front.addChild(holder.front);
        }
      }
      const item: Item = {
        p,
        great,
        seed,
        phase: (((p.x * 0.0023 - p.y * 0.0011) % 1) + 1) % 1,
        stage: 0,
        appear: 1,
        x: p.x,
        y: p.y,
        holder,
        lit: 1,
      };
      this.items.push(item);
      this.byId.set(p.id, item);
    }
    for (let i = 0; i < MAX_FLIGHTS; i++)
      this.flights.push({
        on: false,
        item: null,
        t: 0,
        dur: 0,
        fly: 0,
        sx: 0,
        sy: 0,
        ax: 0,
        ay: 0,
        side: 1,
        left: false,
        done: false,
        x: 0,
        y: 0,
        hx: new Float32Array(TRAIL_MAX),
        hy: new Float32Array(TRAIL_MAX),
        hn: 0,
      });
    for (let i = 0; i < MAX_SPARKS; i++)
      this.sparks.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, size: 1, drift: 0 });
    for (let i = 0; i < MAX_RINGS; i++)
      this.rings.push({ life: 0, max: 1, x: 0, y: 0, r0: 0, r1: 0, width: 0.05, gain: 1, follow: false });
    for (let i = 0; i < MAX_FLARES; i++)
      this.flares.push({ life: 0, max: 1, x: 0, y: 0, r0: 0, r1: 0, gain: 1, heart: 0, follow: false });
    for (let i = 0; i < GLINTS.lights.max; i++) {
      this.lights.push({
        x: 0,
        y: 0,
        radius: GLINTS.lights.radius,
        color: GLINTS.lights.color,
        intensity: 0,
      });
      this.lightOn.push(false);
    }
    layer.addChild(this.back, this.batch.mesh, this.front);
    // Dev handle, like __pf and __fx: `__pickups.cfg.lights.intensity = 0; __game.render()`.
    if (typeof window !== 'undefined') (window as unknown as { __pickups?: PickupRenderer }).__pickups = this;
  }

  private rand(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  update(dt: number, clock: number, cam: CameraView, sim: SimView): void {
    const t0 = performance.now();
    const G = GLINTS;
    const player = sim.player;
    const timers = sim.pickups.timers;
    this.chestX = player.cx;
    this.chestY = player.cy - 8;
    const pvx = player.vx * 60;
    const pvy = player.vy * 60;

    // --- What the sim says happened.
    for (const e of sim.events) {
      if (e.type === 'pickupWake') {
        const it = this.byId.get(e.id);
        if (it) this.wake(it, e.frames / 60);
      } else if (e.type === 'pickup') {
        const it = this.byId.get(e.id);
        if (it) this.absorb(it, e.combo, pvx, pvy);
      }
    }
    // --- And what it says is true now (restart, or a state that jumped without events).
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i] as Item;
      const timer = timers[i] ?? 0;
      if (timer === 0 && it.stage !== 0) {
        it.stage = 0;
        it.appear = 0;
        it.lit = 1;
        it.holder?.set(false);
        this.drop(it);
      } else if (timer < 0 && it.stage !== 2) {
        it.stage = 2;
        it.holder?.set(true);
        this.drop(it);
      } else if (timer > 0 && it.stage === 0) {
        this.wake(it, timer / 60);
      }
    }

    const b = this.batch;
    b.begin();
    b.uniform[1] = G.glint.quad;
    b.uniform[2] = G.great.quad;
    const halfW = VIEW_W / 2 / cam.zoom + 160;
    const halfH = VIEW_H / 2 / cam.zoom + 160;

    // --- The glints that hang.
    for (const it of this.items) {
      const p = it.p;
      if (it.appear < 1) it.appear = Math.min(1, it.appear + dt * 2.2);
      if (it.great) {
        const want = it.stage === 2 ? 0 : 1;
        it.lit += (want - it.lit) * Math.min(1, dt * 5);
      }
      const seen = Math.abs(p.x - cam.x) < halfW && Math.abs(p.y - cam.y) < halfH;
      if (it.holder) {
        it.holder.back.visible = seen;
        it.holder.front.visible = seen;
        if (seen) {
          const sway = wind(p.x, clock, it.seed) * G.great.sway;
          it.holder.update(dt, sway, it.stage !== 0, p.y - it.holder.back.y);
        }
      }
      if (it.stage !== 0) continue;
      const tt = clock * G.glint.bobRate;
      if (it.holder) {
        it.x = it.holder.seatX;
        it.y = it.holder.seatY;
      } else {
        const k = it.great ? 1.6 : 1;
        it.x = p.x + Math.sin(tt * 0.8 + it.seed * 40) * G.glint.bobX * k;
        it.y = p.y + Math.sin(tt * 1.3 + it.phase * 6.283) * G.glint.bobY * k;
      }
      if (!seen) continue;
      // It feels her coming.
      const dx = it.x - this.chestX;
      const dy = it.y - this.chestY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const near = 1 - smooth(G.glint.nearPx * 0.35, G.glint.nearPx, d);
      const e = (1 + near * G.glint.nearGain) * it.appear;
      if (it.great) b.quad(K_GREAT, it.x, it.y, G.great.quad, G.great.quad, e, it.phase, 0);
      else b.quad(K_GLINT, it.x, it.y, G.glint.quad, G.glint.quad, e, it.phase, it.seed);
    }

    // --- Those on their way to her.
    for (const f of this.flights) {
      if (!f.on) continue;
      const it = f.item;
      if (!it) continue;
      if (f.done) {
        // The trail closes up into her.
        f.hn = Math.max(0, f.hn - Math.max(1, Math.round(dt * 150)));
        f.x += (this.chestX - f.x) * Math.min(1, dt * 30);
        f.y += (this.chestY - f.y) * Math.min(1, dt * 30);
        if (f.hn <= 1) {
          f.on = false;
          f.item = null;
          continue;
        }
        this.ribbon(f, it.great, 0.8);
        continue;
      }
      f.t = Math.min(f.dur, f.t + dt);
      const notice = f.dur - f.fly;
      const recoil = it.great ? G.flight.greatRecoil : G.flight.recoil;
      let e: number;
      let scale: number;
      let open = 0;
      if (f.t < notice) {
        // It notices: brightens, swells, leans away from her.
        const k = notice > 0 ? f.t / notice : 1;
        const out = 1 - (1 - k) * (1 - k) * (1 - k);
        const hx = it.holder ? it.holder.seatX : f.sx;
        const hy = it.holder ? it.holder.seatY : f.sy;
        const lift = it.great ? smooth(0.35, 1, k) : out;
        f.x = hx + f.ax * recoil * lift + Math.sin(clock * 38 + it.seed * 9) * 0.5 * k;
        f.y = hy + f.ay * recoil * lift - (it.great ? 26 : 4) * lift;
        e = 1 + (it.great ? 0.3 : 1.25) * out;
        scale = 1 + 0.22 * Math.sin(out * Math.PI * 0.5);
        open = smooth(0, 0.8, k);
        if (it.great && this.rand() < dt * 34) this.spark(f.x, f.y, 0, 0, 14, 60, 0.5, 0.9, 2.6, 1);
      } else {
        if (!f.left) {
          f.left = true;
          f.sx = f.x;
          f.sy = f.y;
          this.shimmer(it);
        }
        const s = f.fly > 0 ? (f.t - notice) / f.fly : 1;
        const es = s * s * (0.55 + 0.45 * s);
        const tx = this.chestX;
        const ty = this.chestY;
        const dx = tx - f.sx;
        const dy = ty - f.sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const bulge = Math.min(len * G.flight.curve, G.flight.curveMax) * Math.sin(Math.PI * es) * f.side;
        f.x = f.sx + dx * es - (dy / len) * bulge;
        f.y = f.sy + dy * es + (dx / len) * bulge;
        e = (it.great ? 1.3 : 2.25) + (it.great ? 0.2 : 0.4) * s;
        scale = 1.22 - 0.5 * es;
        open = 1;
      }
      // Trail: newest first.
      const n = Math.min(G.flight.trail, TRAIL_MAX);
      for (let j = Math.min(f.hn, n - 1); j > 0; j--) {
        f.hx[j] = f.hx[j - 1] as number;
        f.hy[j] = f.hy[j - 1] as number;
      }
      f.hx[0] = f.x;
      f.hy[0] = f.y;
      f.hn = Math.min(n, f.hn + 1);
      if (f.left) this.ribbon(f, it.great, 1);
      if (it.great) {
        const q = G.great.quad * (0.9 + 0.1 * scale);
        b.quad(K_GREAT, f.x, f.y, q, q, e, it.phase, open);
      } else {
        const q = G.glint.quad * scale;
        b.quad(K_GLINT, f.x, f.y, q, q, e, it.phase, it.seed);
      }
    }

    // --- Rings, flares, sparks.
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life) / r.max;
      const out = 1 - (1 - k) * (1 - k) * (1 - k);
      const rad = r.r0 + (r.r1 - r.r0) * out;
      const x = r.follow ? this.chestX + r.x : r.x;
      const y = r.follow ? this.chestY + r.y : r.y;
      b.quad(K_RING, x, y, rad / 0.84, rad / 0.84, r.gain * (1 - k) * (1 - k), 0, r.width / rad);
    }
    for (const fl of this.flares) {
      if (fl.life <= 0) continue;
      fl.life -= dt;
      const k = 1 - Math.max(0, fl.life) / fl.max;
      const out = 1 - (1 - k) * (1 - k);
      const rad = fl.r0 + (fl.r1 - fl.r0) * out;
      const x = fl.follow ? this.chestX + fl.x : fl.x;
      const y = fl.follow ? this.chestY + fl.y : fl.y;
      b.quad(K_FLARE, x, y, rad, rad, fl.gain * (1 - k) * (1 - k * 0.5), 0, fl.heart * (1 - k));
    }
    const drag = Math.exp(-G.absorb.drag * dt);
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.drift > 0) {
        s.vy -= 26 * dt;
        s.vx *= Math.exp(-2 * dt);
      } else {
        s.vx *= drag;
        s.vy = s.vy * drag - G.absorb.lift * dt;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = Math.max(0, s.life) / s.max;
      // Twinkle as they die.
      const tw = 0.75 + 0.25 * Math.sin(clock * 31 + s.size * 57 + s.x);
      const size = s.size * (0.55 + 0.45 * k);
      b.quad(K_SPARK, s.x, s.y, size, size, Math.min(1, k * 2.2) * tw * 1.25, 0, k * k);
    }
    b.end(clock);

    this.updateLights(cam, clock);
    this.cpuMs = performance.now() - t0;
  }

  /** A glint woke: give it a flight that lasts exactly as long as the sim says. */
  private wake(it: Item, seconds: number): void {
    if (it.stage === 1) return;
    let f: Flight | undefined;
    for (const c of this.flights) {
      if (!c.on) {
        f = c;
        break;
      }
    }
    it.stage = 1;
    if (!f) return;
    const G = GLINTS.flight;
    const fly = Math.min(it.great ? G.greatSeconds : G.seconds, seconds * 0.7);
    let ax = it.x - this.chestX;
    let ay = it.y - this.chestY;
    const l = Math.sqrt(ax * ax + ay * ay);
    if (l > 1) {
      ax /= l;
      ay /= l;
    } else {
      ax = 0;
      ay = -1;
    }
    f.on = true;
    f.item = it;
    f.t = 0;
    f.dur = seconds;
    f.fly = fly;
    f.sx = it.x;
    f.sy = it.y;
    f.ax = ax;
    f.ay = ay;
    // Curve over the top when it comes from the side, and alternate otherwise.
    f.side = Math.abs(ax) > 0.35 ? (ax > 0 ? -1 : 1) : it.seed > 0.5 ? 1 : -1;
    f.left = false;
    f.done = false;
    f.x = it.x;
    f.y = it.y;
    f.hn = 0;
    if (it.great) {
      // The ceremony begins where it hangs: a ring opens through the leaves, light wells up.
      this.ring(it.x, it.y, 14, 110, 0.7, 1.6, 0.55, false);
      this.flare(it.x, it.y, 30, 100, 0.5, 0.28, 0.4, false);
    }
  }

  /** Where it hung: a small shimmer left behind as it goes. */
  private shimmer(it: Item): void {
    const n = it.great ? 9 : 3;
    const x = it.holder ? it.holder.seatX : it.p.x;
    const y = it.holder ? it.holder.seatY : it.p.y;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.283;
      const r = (it.great ? 16 : 7) * this.rand();
      this.spark(
        x + Math.cos(a) * r,
        y + Math.sin(a) * r,
        (this.rand() - 0.5) * 14,
        -6 - this.rand() * 14,
        0,
        0,
        0.45,
        0.95,
        it.great ? 2.6 : 2,
        1,
      );
    }
    if (it.great) this.ring(x, y, 12, 60, 0.5, 1.1, 0.4, false);
  }

  /** It went in: burst at her chest. */
  private absorb(it: Item, combo: number, pvx: number, pvy: number): void {
    const A = GLINTS.absorb;
    let vx = 0;
    let vy = 0;
    for (const f of this.flights) {
      if (f.on && f.item === it && !f.done) {
        f.done = true;
        // Arrival direction, from the last two trail points.
        if (f.hn > 1) {
          vx = (f.hx[0] as number) - (f.hx[1] as number);
          vy = (f.hy[0] as number) - (f.hy[1] as number);
          const l = Math.sqrt(vx * vx + vy * vy) || 1;
          vx /= l;
          vy /= l;
        }
      }
    }
    it.stage = 2;
    const cx = this.chestX;
    const cy = this.chestY;
    const step = Math.min(combo, 6) / 6;
    if (it.great) {
      this.flare(0, 0, 40, A.greatFlare, 0.5, 0.7, 0.9, true);
      this.ring(cx, cy, 10, A.greatRing, 0.9, 1.8, 0.6, false);
      this.ring(cx, cy, 6, A.greatRing * 1.7, 1.4, 1.6, 0.22, false);
      for (let i = 0; i < A.greatSparks; i++) {
        const a = (i / A.greatSparks) * 6.283 + this.rand() * 0.4;
        const sp = A.speedMin + (A.speedMax * 1.7 - A.speedMin) * this.rand();
        this.spark(
          cx,
          cy,
          pvx * A.carry + Math.cos(a) * sp,
          pvy * A.carry + Math.sin(a) * sp,
          0,
          0,
          0.5,
          1.15,
          3.6,
          0,
        );
      }
    } else {
      this.flare(0, 0, 14, A.flare * (1 + 0.25 * step), 0.2, 0.55 + 0.3 * step, 0.8, true);
      const n = A.sparks + Math.min(combo, A.comboSparks);
      const base = this.rand() * 6.283;
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * 6.283 + (this.rand() - 0.5) * 0.7;
        const sp = A.speedMin + (A.speedMax - A.speedMin) * this.rand();
        this.spark(
          cx,
          cy,
          pvx * A.carry + Math.cos(a) * sp + vx * 70,
          pvy * A.carry + Math.sin(a) * sp + vy * 70,
          0,
          0,
          0.26,
          0.55,
          2.9,
          0,
        );
      }
    }
  }

  /** Forget any flight for this item (restart). */
  private drop(it: Item): void {
    for (const f of this.flights) {
      if (f.item === it) {
        f.on = false;
        f.item = null;
      }
    }
  }

  private spark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    spread: number,
    speed: number,
    lifeMin: number,
    lifeMax: number,
    size: number,
    drift: number,
  ): void {
    const s = this.sparks[this.sparkAt] as Spark;
    this.sparkAt = (this.sparkAt + 1) % this.sparks.length;
    const a = this.rand() * 6.283;
    const r = this.rand();
    s.x = x + Math.cos(a) * spread * r;
    s.y = y + Math.sin(a) * spread * r;
    s.vx = vx + Math.cos(a) * speed * r;
    s.vy = vy + Math.sin(a) * speed * r;
    s.max = lifeMin + (lifeMax - lifeMin) * this.rand();
    s.life = s.max;
    s.size = size * (0.7 + 0.6 * this.rand());
    s.drift = drift;
  }

  private ring(
    x: number,
    y: number,
    r0: number,
    r1: number,
    life: number,
    width: number,
    gain: number,
    follow: boolean,
  ): void {
    const r = this.rings[this.ringAt] as Ring;
    this.ringAt = (this.ringAt + 1) % this.rings.length;
    r.x = x;
    r.y = y;
    r.r0 = r0;
    r.r1 = r1;
    r.max = life;
    r.life = life;
    r.width = width;
    r.gain = gain;
    r.follow = follow;
  }

  private flare(
    x: number,
    y: number,
    r0: number,
    r1: number,
    life: number,
    gain: number,
    heart: number,
    follow: boolean,
  ): void {
    const f = this.flares[this.flareAt] as Flare;
    this.flareAt = (this.flareAt + 1) % this.flares.length;
    f.x = x;
    f.y = y;
    f.r0 = r0;
    f.r1 = r1;
    f.max = life;
    f.life = life;
    f.gain = gain;
    f.heart = heart;
    f.follow = follow;
  }

  /** The trail behind a flying glint: a tapered strip through its last positions. */
  private ribbon(f: Flight, great: boolean, gain: number): void {
    const n = f.hn;
    if (n < 2) return;
    const w0 = great ? GLINTS.flight.greatTrailWidth : GLINTS.flight.trailWidth;
    let pnx = 0;
    let pny = 0;
    let have = false;
    for (let j = 0; j < n - 1; j++) {
      const ax = f.hx[j] as number;
      const ay = f.hy[j] as number;
      const bx = f.hx[j + 1] as number;
      const by = f.hy[j + 1] as number;
      const dx = bx - ax;
      const dy = by - ay;
      const l = Math.sqrt(dx * dx + dy * dy);
      if (l < 0.01) continue;
      const u0 = j / (n - 1);
      const u1 = (j + 1) / (n - 1);
      const wa = w0 * (1 - u0 * 0.85);
      const wb = w0 * (1 - u1 * 0.85);
      const nx = -dy / l;
      const ny = dx / l;
      if (!have) {
        pnx = nx;
        pny = ny;
        have = true;
      }
      this.batch.segment(
        ax,
        ay,
        pnx * wa,
        pny * wa,
        bx,
        by,
        nx * wb,
        ny * wb,
        u0,
        u1,
        gain * (1 - u0) * 1.1,
        gain * (1 - u1) * 1.1,
      );
      pnx = nx;
      pny = ny;
    }
  }

  /** The nearest great glints lend real light to the place (post stage, plant glow). */
  private updateLights(cam: CameraView, clock: number): void {
    const L = GLINTS.lights;
    for (let s = 0; s < this.lights.length; s++) {
      const light = this.lights[s] as PointLight;
      let best: Item | null = null;
      let bestD = L.reachPx;
      for (const it of this.items) {
        if (!it.great || it.lit < 0.02) continue;
        if (s > 0 && this.lights[0]?.x === it.p.x && this.lights[0]?.y === it.p.y && this.lightOn[0])
          continue;
        const d = Math.abs(it.p.x - cam.x) + Math.abs(it.p.y - cam.y) * 0.6;
        if (d < bestD) {
          best = it;
          bestD = d;
        }
      }
      const id = `glint${s}`;
      if (!best) {
        if (this.lightOn[s]) {
          this.ctx.lights.remove(id);
          this.lightOn[s] = false;
        }
        continue;
      }
      light.x = best.p.x;
      light.y = best.p.y;
      light.radius = L.radius;
      light.color = L.color;
      // Fades to nothing at the edge of reach, so a light never pops when the nearest one changes.
      const edge = 1 - smooth(L.reachPx * 0.7, L.reachPx, bestD);
      light.intensity =
        L.intensity * best.lit * edge * (0.9 + 0.1 * Math.sin(clock * 1.5 + best.phase * 6.283));
      if (!this.lightOn[s]) {
        this.ctx.lights.set(id, light);
        this.lightOn[s] = true;
      }
    }
  }

  /** For tools: where each pickup is drawn and what the renderer thinks of it. */
  debug(): Array<{ id: string; stage: number; x: number; y: number }> {
    return this.items.map((it) => ({ id: it.p.id, stage: it.stage, x: it.x, y: it.y }));
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
