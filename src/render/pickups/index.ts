/**
 * Glints: the light Vesper gathers. This draws the scene's pickups (`scene.pickups`) in world
 * space and plays what the sim decides: a glint wakes (`pickupWake`), flies to her in the frames
 * the sim gives it, and is absorbed (`pickup`). Nothing here changes the sim; which glints still
 * hang is read from `sim.pickups.timers` every frame, so a restart or a state jump just shows.
 *
 * Everything luminous is one mesh (batch.ts): the glints, their trails, motes and soft flares.
 * The buds that hold great glints are a few Graphics (holder.ts): the plant behind the hero, the
 * three sepals that cup the light in front of it.
 * Look knobs: config.ts. See memory/pickups.md.
 */
import { Container } from 'pixi.js';
import type { Pickup } from '../../sim/scene';
import { type CameraView, type RenderContext, type SimView, VIEW_H, VIEW_W } from '../contract';
import type { PointLight } from '../lights';
import { wind } from '../scene/lib/look';
import { GlintBatch, K_FLARE, K_GLINT, K_GREAT, K_SPARK } from './batch';
import { GLINTS, MAX_QUADS } from './config';
import { findRoot, groundBelow, Holder } from './holder';

const TRAIL_MAX = 20;
const MAX_FLIGHTS = 24;
const MAX_SPARKS = 260;
const MAX_FLARES = 24;

/** Mote behaviours. */
const M_BURST = 0;
const M_RISE = 1;
const M_SPIRAL = 2;
const M_GATHER = 3;

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
  /** Great glints: the ground under it (for the wave of light), or null. */
  ground: number | null;
  /** Great glints: 0..1 strength of the light it lends (eases out when taken). */
  lit: number;
}

interface Flight {
  on: boolean;
  item: Item | null;
  t: number;
  dur: number;
  fly: number;
  /** Sim frame it woke on: the flight never runs ahead of the sim (frozen mode holds it). */
  frame0: number;
  /** Start, and the unit vector away from her at the moment it woke. */
  sx: number;
  sy: number;
  ax: number;
  ay: number;
  side: number;
  left: boolean;
  waved: boolean;
  /** Absorbed: the trail is closing up. */
  done: boolean;
  x: number;
  y: number;
  hx: Float32Array;
  hy: Float32Array;
  hn: number;
  /** Fractional trail samples still to drop (after absorption). */
  shed: number;
}

interface Spark {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  mode: number;
  /** M_SPIRAL: how fast its heading turns, rad/s. */
  spin: number;
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
  /** Follows the hero's chest by this offset instead of staying put. */
  follow: boolean;
  /** Travels sideways at this speed (px/s) and is this flat (height / width). */
  vx: number;
  flat: number;
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
  private readonly flares: Flare[] = [];
  private readonly lights: PointLight[] = [];
  private readonly lightOn: boolean[] = [];
  private sparkAt = 0;
  private flareAt = 0;
  /** A tiny LCG for spark scatter (render only; never the sim's RNG). */
  private rnd = 0x9e3779b9;
  private chestX = 0;
  private chestY = 0;

  /** `layer` is over the character (lights, cupping sepals); `backLayer` under it (the buds). */
  constructor(
    private readonly ctx: RenderContext,
    layer: Container,
    backLayer: Container,
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
        ground: great ? groundBelow(scene, p.x, p.y) : null,
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
        frame0: 0,
        sx: 0,
        sy: 0,
        ax: 0,
        ay: 0,
        side: 1,
        left: false,
        waved: false,
        done: false,
        x: 0,
        y: 0,
        hx: new Float32Array(TRAIL_MAX),
        hy: new Float32Array(TRAIL_MAX),
        hn: 0,
        shed: 0,
      });
    for (let i = 0; i < MAX_SPARKS; i++)
      this.sparks.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, size: 1, mode: 0, spin: 0 });
    for (let i = 0; i < MAX_FLARES; i++)
      this.flares.push({
        life: 0,
        max: 1,
        x: 0,
        y: 0,
        r0: 0,
        r1: 0,
        gain: 1,
        heart: 0,
        follow: false,
        vx: 0,
        flat: 1,
      });
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
    backLayer.addChild(this.back);
    layer.addChild(this.batch.mesh, this.front);
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
        if (it) this.wake(it, e.frames / 60, sim.frame);
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
        this.wake(it, timer / 60, sim.frame);
      }
    }

    const b = this.batch;
    b.begin();
    b.uniform[1] = G.glint.quad;
    b.uniform[2] = G.great.quad;
    b.uniform[3] = G.gain;
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
          it.holder.update(dt, sway, it.stage !== 0);
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
        // The trail closes up into her over a few frames.
        f.shed += dt * G.flight.trailFade;
        const drop = Math.floor(f.shed);
        f.shed -= drop;
        f.hn = Math.max(0, f.hn - drop);
        f.hx[0] = this.chestX;
        f.hy[0] = this.chestY;
        if (f.hn <= 1) {
          f.on = false;
          f.item = null;
          continue;
        }
        this.ribbon(f, it.great, 0.85);
        continue;
      }
      f.t = Math.min(f.dur, f.t + dt, (sim.frame - f.frame0 + 1) / 60);
      const notice = f.dur - f.fly;
      const recoil = it.great ? G.flight.greatRecoil : G.flight.recoil;
      let e: number;
      let scale: number;
      let open = 0;
      if (f.t < notice) {
        // It notices: brightens, swells, leans away from her. A great one lifts out of its bud
        // while a corolla of light unfolds round it and motes wind up and away.
        const k = notice > 0 ? f.t / notice : 1;
        const out = 1 - (1 - k) * (1 - k) * (1 - k);
        const hx = it.holder ? it.holder.seatX : f.sx;
        const hy = it.holder ? it.holder.seatY : f.sy;
        if (it.great) {
          const lift = smooth(0.15, 1, k);
          const up = it.holder ? -it.holder.dir : -1;
          f.x = hx + f.ax * recoil * lift;
          f.y = hy + up * G.great.lift * lift;
          e = 1 + 0.35 * out;
          scale = 1;
          open = smooth(0, 0.85, k);
          this.corolla(f, it, open, 1);
          if (this.rand() < dt * 30) this.mote(f.x, f.y, up);
          if (!f.waved && k > 0.3) {
            f.waved = true;
            this.wave(it);
          }
        } else {
          f.x = hx + f.ax * recoil * out + Math.sin(clock * 38 + it.seed * 9) * 0.5 * k;
          f.y = hy + f.ay * recoil * out - 3 * out;
          e = 1 + 1.2 * out;
          scale = 1 + 0.2 * Math.sin(out * Math.PI * 0.5);
        }
      } else {
        if (!f.left) {
          f.left = true;
          f.sx = f.x;
          f.sy = f.y;
          // Swing over the top when she is off to one side; otherwise to its own side.
          const dx0 = this.chestX - f.sx;
          const dy0 = this.chestY - f.sy;
          f.side = Math.abs(dx0) > Math.abs(dy0) * 0.5 ? (dx0 > 0 ? -1 : 1) : it.seed > 0.5 ? 1 : -1;
          this.shimmer(it);
        }
        // Lag, then slingshot: it hangs back while she runs on, then catches her up in a rush.
        const s = f.fly > 0 ? (f.t - notice) / f.fly : 1;
        const es = s ** G.flight.lag;
        const tx = this.chestX;
        const ty = this.chestY;
        const dx = tx - f.sx;
        const dy = ty - f.sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        // The swing peaks as the catch-up begins, so it comes round in an arc and not along a rail.
        const swing = Math.sin(Math.PI * s ** 1.6);
        const bulge = Math.min(len * G.flight.curve, G.flight.curveMax) * swing * f.side;
        f.x = f.sx + dx * es - (dy / len) * bulge;
        f.y = f.sy + dy * es + (dx / len) * bulge;
        e = (it.great ? 1.35 : 2.1) + 0.4 * s;
        scale = 1.2 - 0.45 * es;
        open = 1;
        if (it.great) {
          this.corolla(f, it, 1, 1 - s);
          // Light gathers into her from all round as it comes.
          if (this.rand() < dt * 46) this.gather();
        }
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

    // --- Flares and motes.
    for (const fl of this.flares) {
      if (fl.life <= 0) continue;
      fl.life -= dt;
      const k = 1 - Math.max(0, fl.life) / fl.max;
      const out = 1 - (1 - k) * (1 - k);
      const rad = fl.r0 + (fl.r1 - fl.r0) * out;
      // A travelling flare slows as it goes.
      fl.x += fl.vx * (1 - k) * 2 * dt;
      const x = fl.follow ? this.chestX + fl.x : fl.x;
      const y = fl.follow ? this.chestY + fl.y : fl.y;
      const rise = fl.vx !== 0 ? Math.min(1, k * 6) : 1;
      b.quad(
        K_FLARE,
        x,
        y,
        rad,
        rad * fl.flat,
        fl.gain * rise * (1 - k) * (1 - k * 0.5),
        0,
        fl.heart * (1 - k),
      );
    }
    const drag = Math.exp(-G.absorb.drag * dt);
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = Math.max(0, s.life) / s.max;
      if (s.mode === M_GATHER) {
        // Drawn in to her chest, faster the closer its time.
        const pull = Math.min(1, dt * (3 + 22 * (1 - k)));
        s.x += (this.chestX - s.x) * pull + s.vx * dt * k;
        s.y += (this.chestY - s.y) * pull + s.vy * dt * k;
      } else {
        if (s.mode === M_SPIRAL) {
          // Its heading turns as it rises: a loose helix.
          const c = Math.cos(s.spin * dt);
          const sn = Math.sin(s.spin * dt);
          const vx = s.vx * c - s.vy * sn;
          s.vy = s.vx * sn + s.vy * c - 30 * dt;
          s.vx = vx * Math.exp(-0.9 * dt);
        } else if (s.mode === M_RISE) {
          s.vy -= 26 * dt;
          s.vx *= Math.exp(-2 * dt);
        } else {
          s.vx *= drag;
          s.vy = s.vy * drag - G.absorb.lift * dt;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      // Twinkle as they die.
      const tw = 0.75 + 0.25 * Math.sin(clock * 31 + s.size * 57 + s.x);
      const size = s.size * (0.55 + 0.45 * k);
      const fadeIn = Math.min(1, (1 - k) * 8);
      b.quad(K_SPARK, s.x, s.y, size, size, Math.min(1, k * 2.2) * fadeIn * tw * 1.25, 0, k * k);
    }
    b.end(clock);

    this.updateLights(cam, clock);
    this.cpuMs = performance.now() - t0;
  }

  /** A glint woke: give it a flight that lasts exactly as long as the sim says. */
  private wake(it: Item, seconds: number, frame: number): void {
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
    const fly = Math.min(it.great ? G.greatSeconds : G.seconds, seconds * 0.8);
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
    f.frame0 = frame;
    f.dur = seconds;
    f.fly = fly;
    f.sx = it.x;
    f.sy = it.y;
    f.ax = ax;
    f.ay = ay;
    f.side = 1;
    f.left = false;
    f.waved = false;
    f.done = false;
    f.x = it.x;
    f.y = it.y;
    f.hn = 0;
    f.shed = 0;
    // The ceremony begins where it hangs: light wells up in the bud.
    if (it.great) this.flare(it.x, it.y, 18, 64, 0.7, 0.3, 0.5, false, 0, 1);
  }

  /**
   * The corolla of a great glint: soft petals of light that unfold from pointing along the stem to
   * a wide flower. `open` 0..1 is how far, `fade` its brightness.
   */
  private corolla(f: Flight, it: Item, open: number, fade: number): void {
    if (fade <= 0.01 || open <= 0.01) return;
    const G = GLINTS.great;
    const up = it.holder ? -it.holder.dir : -1;
    const hx = f.left ? f.sx : f.x;
    const hy = f.left ? f.sy : f.y;
    const n = G.petals;
    const len = G.petalLength * (0.3 + 0.7 * open);
    for (let i = 0; i < n; i++) {
      // Fanned evenly either side of straight up; the outer ones droop furthest and are shorter.
      const u = (i + 0.5) / n - 0.5;
      const a = u * 2 * (0.25 + 1.2 * open) + Math.sin(it.seed * 30 + i * 2.4) * 0.07;
      const l = len * (1 - Math.abs(u) * 0.5);
      const dx = Math.sin(a);
      const dy = Math.cos(a) * up;
      this.batch.quadRot(
        K_FLARE,
        hx + dx * l * 0.8,
        hy + dy * l * 0.8,
        l,
        l * 0.3,
        Math.atan2(dy, dx),
        G.petalGain * fade * open,
        0,
        0.25,
      );
    }
  }

  /** A mote that winds up and away from an opening great glint. */
  private mote(x: number, y: number, up: number): void {
    const s = this.sparks[this.sparkAt] as Spark;
    this.sparkAt = (this.sparkAt + 1) % this.sparks.length;
    const a = this.rand() * 6.283;
    s.x = x + Math.cos(a) * 6;
    s.y = y + Math.sin(a) * 6;
    s.vx = Math.cos(a) * (40 + 60 * this.rand());
    s.vy = up * (30 + 50 * this.rand());
    s.max = 0.7 + 0.7 * this.rand();
    s.life = s.max;
    s.size = 1.7 + 1.6 * this.rand();
    s.mode = M_SPIRAL;
    s.spin = (this.rand() > 0.5 ? 1 : -1) * (2.5 + 3 * this.rand());
  }

  /** A mote that starts somewhere round her and is drawn in to her chest. */
  private gather(): void {
    const s = this.sparks[this.sparkAt] as Spark;
    this.sparkAt = (this.sparkAt + 1) % this.sparks.length;
    const a = this.rand() * 6.283;
    const r = 46 + 60 * this.rand();
    s.x = this.chestX + Math.cos(a) * r;
    s.y = this.chestY + Math.sin(a) * r * 0.8;
    // A little sideways drift so they curl in rather than fall straight.
    s.vx = -Math.sin(a) * 90;
    s.vy = Math.cos(a) * 90;
    s.max = 0.3 + 0.2 * this.rand();
    s.life = s.max;
    s.size = 1.6 + 1.4 * this.rand();
    s.mode = M_GATHER;
    s.spin = 0;
  }

  /** One soft swell of light that runs out along the ground from under a great glint and fades. */
  private wave(it: Item): void {
    if (it.ground === null) return;
    const W = GLINTS.wave;
    const y = it.ground - W.height * 0.45;
    const speed = W.reach / W.seconds;
    for (const dir of [-1, 1])
      this.flare(
        it.p.x + dir * 10,
        y,
        W.length * 0.5,
        W.length,
        W.seconds,
        W.gain,
        0.2,
        false,
        dir * speed,
        W.height / W.length,
      );
  }

  /** Where it hung: a small shimmer left behind as it goes. */
  private shimmer(it: Item): void {
    const n = it.great ? 7 : 3;
    const x = it.holder ? it.holder.seatX : it.p.x;
    const y = it.holder ? it.holder.seatY : it.p.y;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.283;
      const r = (it.great ? 14 : 6) * this.rand();
      this.spark(
        x + Math.cos(a) * r,
        y + Math.sin(a) * r,
        (this.rand() - 0.5) * 14,
        -6 - this.rand() * 14,
        0,
        0,
        0.45,
        0.95,
        it.great ? 2.2 : 1.7,
        M_RISE,
      );
    }
  }

  /** It went in: light blooms softly at her chest and scatters. */
  private absorb(it: Item, combo: number, pvx: number, pvy: number): void {
    const A = GLINTS.absorb;
    let vx = 0;
    let vy = 0;
    for (const f of this.flights) {
      if (f.on && f.item === it && !f.done) {
        f.done = true;
        f.shed = 0;
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
      this.flare(0, 0, 30, A.greatFlare, 0.6, 0.6, 0.9, true, 0, 1);
      // Motes wind up and outward round her, like seeds let go.
      for (let i = 0; i < A.greatSparks; i++) {
        const s = this.sparks[this.sparkAt] as Spark;
        this.sparkAt = (this.sparkAt + 1) % this.sparks.length;
        const a = (i / A.greatSparks) * 6.283 + this.rand() * 0.5;
        const sp = 50 + 120 * this.rand();
        s.x = cx + Math.cos(a) * 8;
        s.y = cy + Math.sin(a) * 8;
        s.vx = pvx * 0.4 + Math.cos(a) * sp;
        s.vy = pvy * 0.4 + Math.sin(a) * sp * 0.7 - 40;
        s.max = 0.7 + 0.8 * this.rand();
        s.life = s.max;
        s.size = 1.8 + 2 * this.rand();
        s.mode = M_SPIRAL;
        s.spin = (i % 2 === 0 ? 1 : -1) * (1.6 + 2.4 * this.rand());
      }
    } else {
      this.flare(0, 0, 12, A.flare * (1 + 0.25 * step), 0.2, 0.5 + 0.3 * step, 0.8, true, 0, 1);
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
          2.5,
          M_BURST,
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
    mode: number,
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
    s.mode = mode;
    s.spin = 0;
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
    vx: number,
    flat: number,
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
    f.vx = vx;
    f.flat = flat;
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
      let bestD: number = L.reachPx;
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
