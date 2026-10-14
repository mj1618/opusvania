// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Giving, drawn (memory/giving.md for the rules, memory/giving-render.md for the look): the glint
 * she gives in flight from her hand to what she gives it to, it being received (a creature, a
 * dormant light's glass, the heart), the warmth a calmed creature keeps inside for its calm, a glint
 * that comes back, and the glints a rest costs going from her into the light. Her own side (the
 * hold-out pose, the open empty hands, her light by how seen she is) is the character's
 * (src/render/character/vesper); the price crown's given flames are the goal renderer's.
 *
 * Reads only sim state and events; render time only; no Math.random (a seeded generator).
 * One `GlintBatch` in the pickups layer (in front of her and the creatures).
 */
import type { Container } from 'pixi.js';
import { tuning } from '../../sim/tuning';
import { vesperLink } from '../character/vesper/link';
import type { CameraView, RenderContext, SimView } from '../contract';
import type { GoalRenderer } from '../goal/index';
import { SurfaceLight } from '../goal/surface';
import { GlintBatch, K_FLARE, K_GLINT, K_SPARK } from '../pickups/batch';
import { GIVING } from './config';

const MAX_QUADS = 320;
const MAX_FLIGHTS = 24;
const MAX_SPARKS = 96;

enum Fl {
  Return = 0,
  Rest = 1,
}

interface Flight {
  on: boolean;
  kind: Fl;
  /** Seconds in (negative = still waiting to leave). */
  t: number;
  dur: number;
  sx: number;
  sy: number;
  /** Where it goes: a fixed point, or her chest (`toHer`), or a light's glass (`lamp`, `index`). */
  ex: number;
  ey: number;
  toHer: boolean;
  lamp: boolean;
  index: number;
  lift: number;
  e: number;
  heat: number;
}

interface Bloom {
  t: number;
  life: number;
  x: number;
  y: number;
  size: number;
  e: number;
  /** A creature it stays on (index into `sim.enemies`), or -1. */
  enemy: number;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class GivingRenderer {
  readonly cfg = GIVING;
  private readonly batch = new GlintBatch(MAX_QUADS);
  /** Warm light on the surfaces round her (how seen she is) and round a calmed creature (behind her). */
  private readonly surface = new SurfaceLight(16);
  /** Her level of being seen, eased (0..4). */
  private seenK = -1;
  /** Carried glints shown (eased count) and where their ring is centred (lags her). */
  private carriedN = 0;
  private lagX: number | null = null;
  private lagY = 0;
  /** A pour into a light (held V): what to (`kind`, id), glints so far in this run of them, seconds since the last, its weight. */
  private pourKind = '';
  private pourId = '';
  private pourN = 0;
  private pourLast = 9;
  private pourK = 0;
  /** Seconds since she held a glint out (the light on her face). */
  private faceT = 9;
  private readonly flights: Flight[] = [];
  private readonly blooms: Bloom[] = [];
  // Sparks: position, velocity, age, life, size, energy, heat, pull target (x, y; NaN = none).
  private readonly sx = new Float32Array(MAX_SPARKS);
  private readonly sy = new Float32Array(MAX_SPARKS);
  private readonly svx = new Float32Array(MAX_SPARKS);
  private readonly svy = new Float32Array(MAX_SPARKS);
  private readonly sage = new Float32Array(MAX_SPARKS);
  private readonly slife = new Float32Array(MAX_SPARKS);
  private readonly ssize = new Float32Array(MAX_SPARKS);
  private readonly se = new Float32Array(MAX_SPARKS);
  private readonly sheat = new Float32Array(MAX_SPARKS);
  private readonly spx = new Float32Array(MAX_SPARKS);
  private readonly spy = new Float32Array(MAX_SPARKS);
  private next = 0;
  private seed = 0x2f6b1d;
  /** The glint in flight as last drawn (its tail runs on a moment after it lands). */
  private lastU = -1;
  private lastSx = 0;
  private lastSy = 0;
  private lastEx = 0;
  private lastEy = 0;
  private lastLift = 0;
  private tailT = 9;
  /** Per creature: seconds to its next warm mote. */
  private readonly moteIn: number[] = [];
  private frame = -1;
  /** Dev: CPU ms of the last update. */
  cpuMs = 0;

  constructor(
    private readonly ctx: RenderContext,
    layer: Container,
    back: Container,
    private readonly goal: GoalRenderer,
  ) {
    this.batch.mesh.label = 'giving';
    layer.addChild(this.batch.mesh);
    this.surface.mesh.label = 'giving-surface';
    back.addChildAt(this.surface.mesh, 0);
    for (let i = 0; i < MAX_FLIGHTS; i++)
      this.flights.push({
        on: false,
        kind: Fl.Return,
        t: 0,
        dur: 1,
        sx: 0,
        sy: 0,
        ex: 0,
        ey: 0,
        toHer: false,
        lamp: false,
        index: -1,
        lift: 0,
        e: 1,
        heat: 1,
      });
    this.slife.fill(0);
    if (typeof window !== 'undefined') (window as unknown as { __giving?: unknown }).__giving = this;
  }

  private rand(): number {
    // xorshift32: deterministic, no Math.random (render must be reproducible).
    let x = this.seed | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x;
    return ((x >>> 0) % 100000) / 100000;
  }

  /** Where her glints leave her: the near hand while she gives, else her chest (Vesper fills it). */
  private handX(sim: SimView): number {
    return vesperLink.live ? vesperLink.offerX : sim.player.cx;
  }
  private handY(sim: SimView): number {
    return vesperLink.live ? vesperLink.offerY : sim.player.cy - 8;
  }

  /** The point a gift goes to now (it follows a creature that moves, and the glass as it sways). */
  private giftEnd(sim: SimView, out: { x: number; y: number }): void {
    const p = sim.player;
    out.x = p.giftX;
    out.y = p.giftY;
    if (p.giftTo === 'enemy') {
      const e = sim.enemies[p.giftIndex];
      if (e && !e.gone) {
        out.x = e.x + e.w / 2 + e.rx;
        out.y = e.y + e.h / 2 + e.ry - (e.kind === 'burrback' ? GIVING.warm.lift : 0);
      }
    } else if (p.giftTo === 'lantern' || p.giftTo === 'lamp') {
      const g = this.goal.glass(p.giftTo === 'lamp', p.giftIndex);
      if (g) {
        out.x = g.x;
        out.y = g.y;
      }
    } else if (p.giftTo === 'heart') {
      const h = this.goal.heartCore();
      if (h) {
        out.x = h.x;
        out.y = h.y;
      }
    }
  }

  private readonly end = { x: 0, y: 0 };

  private spark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    e: number,
    heat: number,
  ) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_SPARKS;
    this.sx[i] = x;
    this.sy[i] = y;
    this.svx[i] = vx;
    this.svy[i] = vy;
    this.sage[i] = 0;
    this.slife[i] = life;
    this.ssize[i] = size;
    this.se[i] = e;
    this.sheat[i] = heat;
    this.spx[i] = Number.NaN;
    this.spy[i] = Number.NaN;
    return i;
  }

  private flight(kind: Fl, wait: number, dur: number): Flight | null {
    const f = this.flights.find((q) => !q.on);
    if (!f) return null;
    f.on = true;
    f.kind = kind;
    f.t = -wait;
    f.dur = dur;
    f.toHer = false;
    f.lamp = false;
    f.index = -1;
    return f;
  }

  /** A glint received at (x, y): a bloom, and motes drawn in from round it. */
  private land(x: number, y: number, k: number, enemy: number): void {
    const L = GIVING.land;
    const b = this.blooms.find((q) => q.t >= q.life);
    const bloom = b ?? (this.blooms.length < 12 ? ({} as Bloom) : null);
    if (bloom) {
      bloom.t = 0;
      bloom.life = L.bloomLife;
      bloom.x = x;
      bloom.y = y;
      bloom.size = L.bloom * k;
      bloom.e = L.bloomE;
      bloom.enemy = enemy;
      if (!b) this.blooms.push(bloom);
    }
    const n = Math.round(L.sparks * k);
    for (let s = 0; s < n; s++) {
      const a = (s / n) * Math.PI * 2 + this.rand() * 0.6;
      const r = L.spread * k * (0.7 + 0.5 * this.rand());
      const i = this.spark(
        x + Math.cos(a) * r,
        y + Math.sin(a) * r * 0.75,
        -Math.sin(a) * 30,
        Math.cos(a) * 20,
        L.sparkLife * (0.8 + 0.4 * this.rand()),
        3.2 + 1.6 * this.rand(),
        0.85,
        0.7,
      );
      this.spx[i] = x;
      this.spy[i] = y;
    }
  }

  private enemyIndex(sim: SimView, id: string): number {
    for (let i = 0; i < sim.enemies.length; i++) if (sim.enemies[i]?.id === id) return i;
    return -1;
  }

  /** Arc point: a quadratic from (sx, sy) to (ex, ey) lifted `lift` px at its middle. */
  private static at(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    lift: number,
    u: number,
    out: number[],
  ): void {
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2 - lift;
    const a = (1 - u) * (1 - u);
    const b = 2 * u * (1 - u);
    const c = u * u;
    out[0] = a * sx + b * mx + c * ex;
    out[1] = a * sy + b * my + c * ey;
  }
  private readonly pa = [0, 0];
  private readonly pb = [0, 0];

  /** A trail along the arc from u0 to u1 (head), brightness e at the head. */
  private trail(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    lift: number,
    u0: number,
    u1: number,
    e: number,
    width: number,
  ): void {
    if (u1 - u0 < 0.01) return;
    const n = 7;
    const pa = this.pa;
    const pb = this.pb;
    GivingRenderer.at(sx, sy, ex, ey, lift, u0, pa);
    for (let k = 1; k <= n; k++) {
      const u = u0 + ((u1 - u0) * k) / n;
      GivingRenderer.at(sx, sy, ex, ey, lift, u, pb);
      const dx = pb[0]! - pa[0]!;
      const dy = pb[1]! - pa[1]!;
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l;
      const ny = dx / l;
      const w0 = width * ((k - 1) / n) ** 1.3;
      const w1 = width * (k / n) ** 1.3;
      // (head = uv 0: the ribbon's hot end)
      this.batch.segment(
        pb[0]!,
        pb[1]!,
        nx * w1,
        ny * w1,
        pa[0]!,
        pa[1]!,
        nx * w0,
        ny * w0,
        1 - k / n,
        1 - (k - 1) / n,
        e * (k / n),
        e * ((k - 1) / n),
      );
      pa[0] = pb[0]!;
      pa[1] = pb[1]!;
    }
  }

  update(dt: number, clock: number, cam: CameraView, sim: SimView): void {
    const t0 = performance.now();
    const p = sim.player;
    const b = this.batch;
    const F = GIVING.flight;
    // A restart: nothing in the air.
    if (sim.frame < this.frame) {
      for (const f of this.flights) f.on = false;
      for (const bl of this.blooms) bl.t = bl.life;
      this.slife.fill(0);
      this.lastU = -1;
      this.tailT = 9;
    }
    this.frame = sim.frame;

    // --- What happened.
    for (const ev of sim.events) {
      if (ev.type === 'offer') {
        this.faceT = 0;
        // Held V into a light: glints one after another (`offerStreamFrames` apart) are a pour.
        const k = ev.target.kind;
        if (k === 'lantern' || k === 'lamp' || k === 'heart') {
          const same = this.pourKind === k && this.pourId === ev.target.id && this.pourLast < GIVING.pour.gap;
          this.pourN = same ? this.pourN + 1 : 1;
          this.pourKind = k;
          this.pourId = ev.target.id;
          this.pourLast = 0;
        } else this.pourN = 0;
      } else if (ev.type === 'enemyGift') {
        const i = this.enemyIndex(sim, ev.id);
        const e = sim.enemies[i];
        const y = e ? e.y + e.h / 2 - (e.kind === 'burrback' ? GIVING.warm.lift : 0) : ev.y;
        this.land(e ? e.x + e.w / 2 + e.rx : ev.x, y, 1, i);
        this.moteIn[i] = 0.5;
        this.tailT = 0;
      } else if (ev.type === 'lanternGift' || ev.type === 'lampGift') {
        const lamp = ev.type === 'lampGift';
        const list = (lamp ? this.ctx.scene.lamps : this.ctx.scene.lanterns) ?? [];
        const i = list.findIndex((l) => l.id === ev.id);
        const g = this.goal.glass(lamp, i);
        this.land(g?.x ?? ev.x, g?.y ?? ev.y - 60, (lamp ? 0.6 : 0.8) * (this.pourK > 0.5 ? 0.5 : 1), -1);
        this.tailT = 0;
      } else if (ev.type === 'heartGift') {
        const h = this.goal.heartCore();
        this.land(h?.x ?? ev.x, h?.y ?? ev.y, this.pourK > 0.5 ? 0.45 : 0.9, -1);
        this.tailT = 0;
      } else if (ev.type === 'giftReturn') {
        const B = GIVING.back;
        const f = this.flight(Fl.Return, 0, B.dur);
        if (f) {
          f.sx = ev.x;
          f.sy = ev.y;
          f.toHer = true;
          f.lift = B.lift;
          f.e = B.e;
          f.heat = B.heat;
        }
        this.tailT = 9;
      } else if (ev.type === 'lanternRest' || ev.type === 'lampRest') {
        if (!(ev.cost > 0)) continue;
        const R = GIVING.rest;
        const lamp = ev.type === 'lampRest';
        const list = (lamp ? this.ctx.scene.lamps : this.ctx.scene.lanterns) ?? [];
        const idx = list.findIndex((l) => l.id === ev.id);
        const n = Math.min(R.max, ev.cost);
        for (let k = 0; k < n; k++) {
          const f = this.flight(Fl.Rest, k * R.gap, R.dur * (0.92 + 0.16 * this.rand()));
          if (!f) break;
          f.sx = this.handX(sim) + (this.rand() - 0.5) * 10;
          f.sy = this.handY(sim) + (this.rand() - 0.5) * 10;
          f.lamp = lamp;
          f.index = idx;
          f.ex = ev.x;
          f.ey = ev.y - 60;
          f.lift = R.lift * (0.8 + 0.4 * this.rand());
          f.e = R.e;
          f.heat = 0.6;
        }
      } else if (ev.type === 'offerMiss' && ev.reason === 'empty') {
        // Nothing in her hands: a few dull specks fall from where they open.
        const E = GIVING.empty;
        for (let k = 0; k < E.specks; k++)
          this.spark(
            this.handX(sim) + (this.rand() - 0.5) * 12,
            this.handY(sim) + 6,
            (this.rand() - 0.5) * 14,
            E.fall * (0.6 + 0.6 * this.rand()),
            E.life * (0.8 + 0.4 * this.rand()),
            2.6,
            E.e,
            0,
          );
      }
    }

    b.begin();
    const sf = this.surface;
    sf.begin();

    // --- How seen she is: a warm pool on what is round her, by the light she carries.
    {
      const P = GIVING.pool;
      const carry = (this.ctx.scene.pickups?.length ?? 0) > 0;
      const lvl = Math.min(4, Math.max(0, carry && Number.isFinite(p.seenLevel) ? p.seenLevel : 2));
      this.seenK = this.seenK < 0 ? lvl : this.seenK + (lvl - this.seenK) * (1 - Math.exp(-P.rate * dt));
      const k = this.seenK;
      const i = Math.min(3, Math.floor(k));
      const f = k - i;
      const at = (t: readonly number[]) => t[i]! + (t[i + 1]! - t[i]!) * f;
      const e = at(P.e) * (p.faded > 0 ? 0 : 1) * (0.92 + 0.08 * Math.sin(clock * 2.3));
      if (e > 0.003) sf.light(cam, p.cx, p.feetY - P.lift, at(P.rx), at(P.ry), e, 0.15);
      const live = p.faded > 0 || p.hp <= 0 ? 0 : 1;
      const he = at(P.halo.e) * live;
      if (he > 0.003) b.quad(K_FLARE, p.cx, p.cy - 14, P.halo.size, P.halo.size * 1.15, he, 0, 0.15);

      // The glints she carries, visible round her.
      const C = GIVING.carried;
      const w = carry ? Math.max(0, sim.pickups.count) : 0;
      const want = w > 0 ? Math.min(C.max, Math.max(1, Math.round(C.k * Math.sqrt(w)))) : 0;
      this.carriedN += (want * live - this.carriedN) * (1 - Math.exp(-dt * 4));
      const cx = p.cx;
      const cy = p.cy - C.lift;
      if (this.lagX === null || Math.abs(this.lagX - cx) > 200 || Math.abs(this.lagY - cy) > 200) {
        this.lagX = cx;
        this.lagY = cy;
      } else {
        const lk = 1 - Math.exp(-dt * C.lag);
        this.lagX += (cx - this.lagX) * lk;
        this.lagY += (cy - this.lagY) * lk;
      }
      const n = Math.ceil(this.carriedN - 0.02);
      for (let j = 0; j < n; j++) {
        const fade = Math.min(1, this.carriedN - j);
        const ph = j * 2.399;
        const a = clock * C.speed * (0.8 + 0.4 * ((j * 0.618) % 1)) + ph;
        const r = C.r + C.spread * ((j * 0.381) % 1);
        // Each on its own tilted ring; the far half behind her, dimmer.
        const tilt = 0.35 + 0.3 * ((j * 0.73) % 1);
        const front = Math.sin(a);
        const mx = this.lagX + Math.cos(a) * r;
        const my = this.lagY + front * r * tilt + Math.sin(clock * 1.3 + ph) * 3;
        const k = fade * (0.55 + 0.45 * (0.5 + 0.5 * front));
        b.quad(K_SPARK, mx, my, C.size, C.size, C.e * k, 0, 0.5 + 0.3 * front);
        b.quad(K_FLARE, mx, my, C.size * 2.4, C.size * 2.4, 0.12 * k, 0, 0);
      }
    }

    // --- The offer: the glint in her hands lights her face before it goes.
    if (this.faceT < GIVING.face.life) {
      const F2 = GIVING.face;
      const q = this.faceT / F2.life;
      const k = Math.sin(Math.PI * Math.min(1, q * 1.6)) * (1 - q);
      b.quad(K_FLARE, this.handX(sim), this.handY(sim) - 4, F2.size, F2.size, F2.e * k, 0, 0.5);
      this.faceT += dt;
    }

    // --- Warmth kept inside a creature she gave a glint to, fading with its calm.
    const W = GIVING.warm;
    const calmFrames = Math.max(1, tuning.giving.giftCalmFrames);
    const halfW = 960 / cam.zoom + 120;
    const halfH = 540 / cam.zoom + 120;
    for (let i = 0; i < sim.enemies.length; i++) {
      const e = sim.enemies[i];
      if (!e || e.gone || e.mode === 'dead' || !(e.gift > 0)) {
        this.moteIn[i] = W.every * 0.5;
        continue;
      }
      const x = e.x + e.w / 2 + e.rx;
      const y = e.y + e.h / 2 + e.ry - (e.kind === 'burrback' ? W.lift : W.lampLift);
      if (Math.abs(x - cam.x) > halfW || Math.abs(y - cam.y) > halfH) continue;
      const share = Math.min(1, e.gift / calmFrames);
      const k = share ** W.pow;
      const breath = 0.78 + 0.22 * Math.sin(clock * W.rate + i * 1.7);
      const big = e.kind === 'burrback' ? 1 : 0.7;
      b.quad(K_FLARE, x, y, W.size * big, W.size * big * 0.8, W.e * k * breath, 0, 0.1);
      b.quad(K_SPARK, x, y + 2, 5 * big, 5 * big, 0.35 * k * breath, 0, 0.35);
      const C = GIVING.pool.creature;
      sf.light(cam, x, e.y + e.h - 10, C.rx * big, C.ry * big, C.e * k * breath, 0);
      this.moteIn[i] = (this.moteIn[i] ?? W.every) - dt;
      if ((this.moteIn[i] ?? 0) <= 0) {
        this.moteIn[i] = W.every * (0.8 + 0.4 * this.rand()) * (1.4 - 0.4 * share);
        this.spark(
          x + (this.rand() - 0.5) * 16 * big,
          y - 6,
          (this.rand() - 0.5) * 6,
          -W.rise * (0.8 + 0.4 * this.rand()),
          W.life * (0.8 + 0.4 * this.rand()),
          W.mote,
          0.6 * (0.5 + 0.5 * share),
          0.45,
        );
      }
    }

    // --- The glint in flight (the sim's own clock: it lands on the step the gift takes).
    // (Its own length: 3 frames to a lampwing after her, 8 to a light, 10 to a creature: `giftFrames`.)
    const n = Math.max(1, Math.round(p.giftFrames > 0 ? p.giftFrames : tuning.giving.offerFlightFrames));
    // A fast one is a streak from her hands: the trail covers more of the arc the shorter the flight.
    const trailU = Math.min(1, F.trail * Math.max(1, F.streakAt / n));
    if (p.giftTo !== '' && p.giftTimer > 0) {
      const u = Math.min(1, Math.max(0, (n - p.giftTimer - 1 + sim.alpha) / Math.max(1, n - 1)));
      const end = this.end;
      this.giftEnd(sim, end);
      const sx = this.handX(sim);
      const sy = this.handY(sim);
      const dist = Math.hypot(end.x - sx, end.y - sy);
      const lift = F.lift + F.liftK * dist;
      // Eased: it leaves the hand gently and is drawn in at the end.
      const ue = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
      const pt = this.pa;
      GivingRenderer.at(sx, sy, end.x, end.y, lift, ue, pt);
      const hx = pt[0]!;
      const hy = pt[1]!;
      this.trail(
        sx,
        sy,
        end.x,
        end.y,
        lift,
        Math.max(0, ue - trailU),
        ue,
        n < F.streakAt ? 1 : 0.75,
        F.width,
      );
      b.quad(K_FLARE, hx, hy, F.halo, F.halo, F.haloE, 0, 0.4);
      b.quad(K_GLINT, hx, hy, 46, 46, F.size, (clock * 0.37) % 1, 0);
      this.lastU = ue;
      this.lastSx = sx;
      this.lastSy = sy;
      this.lastEx = end.x;
      this.lastEy = end.y;
      this.lastLift = lift;
      this.tailT = 9;
    } else if (this.lastU >= 0) {
      // Landed (or a state jump): the tail runs into what took it and is gone.
      if (this.tailT > 1) this.tailT = 0;
      this.lastU = -1;
    }
    if (this.tailT < F.tailLife) {
      const q = this.tailT / F.tailLife;
      this.trail(
        this.lastSx,
        this.lastSy,
        this.lastEx,
        this.lastEy,
        this.lastLift,
        Math.min(1, 1 - trailU + trailU * q),
        1,
        0.75 * (1 - q),
        F.width * (1 - 0.5 * q),
      );
      this.tailT += dt;
    }

    // --- A pour: held V into a light is one continuous ribbon of glints from her hands to the glass.
    {
      const P = GIVING.pour;
      this.pourLast += dt;
      const on = this.pourN >= 2 && this.pourLast < P.gap ? 1 : 0;
      this.pourK += (on - this.pourK) * (1 - Math.exp(-dt * (on ? P.in : P.out)));
      if (this.pourK > 0.01) {
        let ex = Number.NaN;
        let ey = 0;
        if (this.pourKind === 'heart') {
          const h = this.goal.heartCore();
          if (h) {
            ex = h.x;
            ey = h.y;
          }
        } else {
          const lamp = this.pourKind === 'lamp';
          const list = (lamp ? this.ctx.scene.lamps : this.ctx.scene.lanterns) ?? [];
          const g = this.goal.glass(
            lamp,
            list.findIndex((l) => l.id === this.pourId),
          );
          if (g) {
            ex = g.x;
            ey = g.y;
          }
        }
        if (!Number.isNaN(ex)) {
          const sx = this.handX(sim);
          const sy = this.handY(sim);
          const lift = F.lift + F.liftK * Math.hypot(ex - sx, ey - sy);
          const k = this.pourK;
          this.trail(sx, sy, ex, ey, lift, 0, 1, P.ribbon * k, P.width);
          for (let j = 0; j < P.beads; j++) {
            const u = (clock * P.speed + j / P.beads) % 1;
            const ue = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
            const pt = this.pa;
            GivingRenderer.at(sx, sy, ex, ey, lift, ue, pt);
            const e = P.bead * k * Math.sin(Math.PI * u) ** 0.6;
            b.quad(K_SPARK, pt[0]!, pt[1]!, P.size, P.size, e, 0, 0.7);
          }
          // The glass takes it: a steady glow while it pours.
          b.quad(
            K_FLARE,
            ex,
            ey,
            P.glass,
            P.glass,
            P.glassE * k * (0.85 + 0.15 * Math.sin(clock * 9)),
            0,
            0.45,
          );
          b.quad(K_FLARE, sx, sy, P.hands, P.hands, P.handsE * k, 0, 0.4);
        }
      }
    }

    // --- Flights: a glint coming back to her; the glints a rest costs going into the light.
    for (const f of this.flights) {
      if (!f.on) continue;
      f.t += dt;
      if (f.t < 0) continue;
      let ex = f.ex;
      let ey = f.ey;
      if (f.toHer) {
        ex = this.handX(sim);
        ey = this.handY(sim);
      } else if (f.index >= 0) {
        const g = this.goal.glass(f.lamp, f.index);
        if (g) {
          ex = g.x;
          ey = g.y;
        }
      }
      const u = Math.min(1, f.t / f.dur);
      const ue = u * u * (3 - 2 * u);
      const pt = this.pa;
      GivingRenderer.at(f.sx, f.sy, ex, ey, f.lift, ue, pt);
      this.trail(f.sx, f.sy, ex, ey, f.lift, Math.max(0, ue - 0.3), ue, 0.5 * f.e, 1.6);
      b.quad(K_SPARK, pt[0]!, pt[1]!, 6, 6, f.e, 0, f.heat);
      b.quad(K_FLARE, pt[0]!, pt[1]!, 10, 10, 0.18 * f.e, 0, 0.2);
      if (u >= 1) {
        f.on = false;
        if (f.kind === Fl.Rest) this.land(ex, ey, 0.35, -1);
        else this.spark(ex, ey, 0, -10, 0.25, 9, 0.35, 0.2);
      }
    }

    // --- Blooms where a glint was received.
    for (const bl of this.blooms) {
      if (bl.t >= bl.life) continue;
      bl.t += dt;
      const q = Math.min(1, bl.t / bl.life);
      let x = bl.x;
      let y = bl.y;
      const e = sim.enemies[bl.enemy];
      if (e && !e.gone) {
        x = e.x + e.w / 2 + e.rx;
        y = e.y + e.h / 2 + e.ry - (e.kind === 'burrback' ? W.lift : 0);
      }
      const s = bl.size * (0.55 + 0.45 * smooth(0, 0.5, q));
      const k = smooth(0, 0.08, q) * (1 - smooth(0.25, 1, q));
      b.quad(K_FLARE, x, y, s, s, bl.e * k, 0, 0.55 * (1 - q));
    }

    // --- Sparks.
    for (let i = 0; i < MAX_SPARKS; i++) {
      const life = this.slife[i]!;
      if (life <= 0) continue;
      const age = this.sage[i]! + dt;
      this.sage[i] = age;
      if (age >= life) {
        this.slife[i] = 0;
        continue;
      }
      const q = age / life;
      if (!Number.isNaN(this.spx[i]!)) {
        // Drawn in to what took it: a spring toward the point, so they gather and vanish into it.
        const ax = (this.spx[i]! - this.sx[i]!) * 60;
        const ay = (this.spy[i]! - this.sy[i]!) * 60;
        this.svx[i] = (this.svx[i]! + ax * dt) * Math.exp(-dt * 6);
        this.svy[i] = (this.svy[i]! + ay * dt) * Math.exp(-dt * 6);
      } else {
        this.svx[i] = this.svx[i]! * Math.exp(-dt * 1.5);
        this.svy[i] = this.svy[i]! * Math.exp(-dt * 1.2);
      }
      this.sx[i] = this.sx[i]! + this.svx[i]! * dt;
      this.sy[i] = this.sy[i]! + this.svy[i]! * dt;
      const k = smooth(0, 0.12, q) * (1 - smooth(0.55, 1, q));
      const s = this.ssize[i]!;
      b.quad(K_SPARK, this.sx[i]!, this.sy[i]!, s, s, this.se[i]! * k, 0, this.sheat[i]!);
    }

    b.end(clock);
    sf.end();
    this.cpuMs = performance.now() - t0;
  }

  destroy(): void {
    this.batch.destroy();
    this.surface.mesh.destroy();
  }
}
