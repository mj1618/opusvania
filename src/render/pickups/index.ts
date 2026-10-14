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
import { zoneWeights } from '../scene/lib/fx-zones';
import { wind } from '../scene/lib/look';
import { GlintBatch, K_CHIP, K_FLARE, K_GLINT, K_GREAT, K_SPARK, K_STAR } from './batch';
import { GLINTS, MAX_QUADS } from './config';
import { findRoot, groundBelow, Holder } from './holder';
import { POD, PodView } from './pod';

const TRAIL_MAX = 20;
const MAX_FLIGHTS = 24;
const MAX_SPARKS = 260;
const MAX_FLARES = 24;
const MAX_CHIPS = 48;
/** Stand-in items per pod for spilled glints (more than any pod has in the air at once). */
const SPILL = 12;

/**
 * How many hits a pod takes. The scene says (`hp`, or `hpMax`); failing that, what the sim state
 * holds for it the first time we look.
 */
function podTier(p: object, hpNow: number): number {
  const q = p as { hp?: number; hpMax?: number };
  return Math.min(3, Math.max(1, Math.round(q.hpMax ?? q.hp ?? hpNow ?? 1)));
}

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
  /** 0 dormant (she is far) .. 1 awake. */
  wake: number;
  /** Its trail's twinkle: seconds per round, and when in the round its turn comes. */
  round: number;
  turn: number;
  /** The other glints of its trail (itself included), and how much of a star it is now: `seedLevel` .. 1 (eased). */
  trail: Item[];
  lead: boolean;
  level: number;
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
  /**
   * Spilled from a lumen pod: instead of noticing, it pops out of the pod at (sx, sy) to hang at
   * (px, py) before it flies. `pod` is the pod's index, -1 for an ordinary flight.
   */
  pod: number;
  px: number;
  py: number;
  /** Exponent of the catch-up for this flight. */
  lag: number;
  /** A spilled glint: seconds it stays hidden (the hit's freeze), then seconds it takes to pop out. */
  hold: number;
  pop: number;
}

/** A fleck of husk thrown off a struck pod. */
interface Chip {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  tone: number;
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
  /** Glints grouped by trail (ids that differ only in their last number), in that order. */
  private readonly trails: Item[][] = [];
  private readonly byId = new Map<string, Item>();
  private readonly flights: Flight[] = [];
  private readonly sparks: Spark[] = [];
  private readonly flares: Flare[] = [];
  private readonly lights: PointLight[] = [];
  private readonly lightOn: boolean[] = [];
  /** One per `scene.pods`, drawn the first time it comes near the view (null until then). */
  private readonly pods: Array<PodView | null> = [];
  private readonly podIndex = new Map<string, number>();
  private readonly podBack = new Container({ label: 'lumen-pods' });
  /** Per pod: 0 cool .. 1 warm, for the colour of its husk flecks. */
  private readonly podTone: number[] = [];
  /** Per pod: frames between its spilled glints (from its last burst), and how many it has spilled. */
  private readonly requeue: boolean[] = [];
  private readonly spillN: number[] = [];
  /**
   * Stand-in items for spilled glints, `SPILL` per source. A source is a pod (its index) or, after
   * the pods, an enemy (`foeBase` + its index): `Flight.pod`, `spillN` and `requeue` all count so.
   */
  private readonly spill: Item[] = [];
  private foeBase = 0;
  /** Per enemy: the cut that killed it (1 up, -1 down, 0 forward), for the shape of its glint fan. */
  private readonly foeCut: number[] = [];
  private readonly chips: Chip[] = [];
  private chipAt = 0;
  private sparkAt = 0;
  private flareAt = 0;
  /** A tiny LCG for spark scatter (render only; never the sim's RNG). */
  private rnd = 0x9e3779b9;
  private heroSpeed = 0;
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
        wake: 0,
        round: 4,
        turn: seed * 4,
        trail: [],
        lead: true,
        level: -1,
      };
      this.items.push(item);
      this.byId.set(p.id, item);
    }
    // Trails: glints whose ids differ only in the last number twinkle one after another, in that
    // order, so a line of them reads as a path (config: `twinkleStep`).
    const trails = new Map<string, Item[]>();
    for (const it of this.items) {
      if (it.great) continue;
      const m = /^(.*?)-?(\d+)$/.exec(it.p.id);
      const key = m ? (m[1] as string) : it.p.id;
      const list = trails.get(key) ?? [];
      list.push(it);
      trails.set(key, list);
    }
    const num = (it: Item): number => Number(/(\d+)$/.exec(it.p.id)?.[1] ?? 0);
    for (const [key, list] of trails) {
      list.sort((a, b) => num(a) - num(b));
      const g = GLINTS.glint;
      const round = (list.length - 1) * g.twinkleStep + g.twinkleSeconds + g.twinkleRest;
      const off = hash01(key) * round;
      list.forEach((it, k) => {
        it.round = round;
        it.turn = off + k * g.twinkleStep;
        it.trail = list;
      });
      this.trails.push(list);
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
        pod: -1,
        px: 0,
        py: 0,
        lag: 2.5,
        hold: 0,
        pop: 0,
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
    // Lumen pods are built on the first update: how tough each is comes with the sim state.
    (scene.pods ?? []).forEach((p, i) => {
      this.podIndex.set(p.id, i);
      this.podTone.push(zoneWeights(p.x)[1]);
      this.requeue.push(false);
      this.pods.push(null);
      this.spillN.push(0);
      // Stand-in items for the glints it spills (they are not scene pickups).
      for (let k = 0; k < SPILL; k++)
        this.spill.push({
          p: { id: p.id, kind: 'glint', x: p.x, y: p.y },
          great: false,
          seed: hash01(`${p.id}/${k}`),
          phase: (k * 0.31 + hash01(p.id)) % 1,
          stage: 2,
          appear: 1,
          x: p.x,
          y: p.y,
          holder: null,
          ground: null,
          lit: 0,
          wake: 1,
          round: 4,
          turn: 0,
          trail: [],
          lead: true,
          level: 1,
        });
    });
    // Enemies spill glints when they die: more sources, after the pods.
    this.foeBase = this.pods.length;
    for (const q of scene.enemies ?? []) {
      this.requeue.push(false);
      this.spillN.push(0);
      for (let k = 0; k < SPILL; k++)
        this.spill.push({
          p: { id: q.id, kind: 'glint', x: q.x, y: q.y },
          great: false,
          seed: hash01(`${q.id}/${k}`),
          phase: (k * 0.31 + hash01(q.id)) % 1,
          stage: 2,
          appear: 1,
          x: q.x,
          y: q.y,
          holder: null,
          ground: null,
          lit: 0,
          wake: 1,
          round: 4,
          turn: 0,
          trail: [],
          lead: true,
          level: 1,
        });
    }
    for (let i = 0; i < MAX_CHIPS; i++)
      this.chips.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, size: 1, tone: 0 });
    backLayer.addChild(this.podBack, this.back);
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
    this.heroSpeed = Math.sqrt(pvx * pvx + pvy * pvy);

    // --- What the sim says happened.
    for (const e of sim.events) {
      if (e.type === 'pickupWake') {
        const it = this.byId.get(e.id);
        if (it) this.wake(it, e.frames / 60, sim.frame);
      } else if (e.type === 'pickup') {
        if (e.pod) {
          const i = this.podIndex.get(e.id);
          if (i !== undefined) this.spillAbsorb(i, e.combo, pvx, pvy);
        } else if (e.enemy) {
          const j = (sim.scene.enemies ?? []).findIndex((q) => q.id === e.id);
          if (j >= 0) this.spillAbsorb(this.foeBase + j, e.combo, pvx, pvy);
        } else {
          const it = this.byId.get(e.id);
          if (it) this.absorb(it, e.combo, pvx, pvy);
        }
      } else if (e.type === 'enemyDie') {
        const j = (sim.scene.enemies ?? []).findIndex((q) => q.id === e.id);
        if (j >= 0) this.foeCut[j] = e.slash === 'up' ? 1 : e.slash === 'down' ? -1 : 0;
      } else if (e.type === 'podBurst') {
        this.burst(e.id, e.dir, e.facing, e.power);
      } else if (e.type === 'slashHit' && e.target.kind === 'pod') {
        // A hit that did not open it (a tough pod): the sim state already shows what is left.
        const i = this.podIndex.get(e.target.id);
        if (i !== undefined && (sim.pods.hp[i] ?? 0) > 0)
          this.podHit(i, e.dir, e.facing, e.power, sim.pods.hp[i] ?? 1);
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
    this.updatePods(dt, clock, cam, sim);
    this.updateFoes(sim);
    b.uniform[1] = G.glint.quad;
    b.uniform[2] = G.great.quad;
    b.uniform[3] = G.gain;
    const halfW = VIEW_W / 2 / cam.zoom + 160;
    const halfH = VIEW_H / 2 / cam.zoom + 160;

    // --- Which stars lead: of each trail, the few untaken ones nearest to her. The rest are seeds.
    for (const list of this.trails) {
      for (const it of list) it.lead = false;
      for (let n = 0; n < G.glint.lead; n++) {
        let best: Item | null = null;
        let bd = Number.POSITIVE_INFINITY;
        for (const it of list) {
          if (it.stage !== 0 || it.lead) continue;
          const d = (it.p.x - this.chestX) ** 2 + (it.p.y - this.chestY) ** 2;
          if (d < bd) {
            bd = d;
            best = it;
          }
        }
        if (!best) break;
        best.lead = true;
      }
    }

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
      // Dormant until it feels her coming (a small cut star, cool, twinkling in its turn along its
      // trail), then, as she nears, the gold glint at full size, leaning her way.
      const dx = it.x - this.chestX;
      const dy = it.y - this.chestY;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const D = it.great ? G.great : G.glint;
      const wake = 1 - smooth(D.wakeFull, D.wakePx, d);
      it.wake = wake;
      if (!seen) continue;
      if (it.great) {
        const size = G.great.dormScale + (1 - G.great.dormScale) * wake;
        const e = (G.great.dormGain + (1 + 0.2 * wake - G.great.dormGain) * wake) * it.appear;
        b.quad(K_GREAT, it.x, it.y, G.great.quad * size, G.great.quad * size, e, it.phase, 0);
        continue;
      }
      const g = G.glint;
      // Asleep: the cut star, twinkling in its turn along its trail. As she nears it warms and the
      // gold glint takes its place.
      const tt2 = (((clock - it.turn) % it.round) + it.round) % it.round;
      const tw = tt2 < g.twinkleSeconds ? Math.sin((Math.PI * tt2) / g.twinkleSeconds) ** 2 : 0;
      const lean = g.lean * wake;
      it.x -= (dx / d) * lean;
      it.y -= (dy / d) * lean;
      const asleep = 1 - smooth(0.15, 0.75, wake);
      // A leading star near her is the whole star; a far one is fainter; the rest of the trail are seeds.
      const want = it.lead
        ? g.leadFarLevel + (1 - g.leadFarLevel) * (1 - smooth(g.leadNear, g.leadFar, d))
        : g.seedLevel;
      it.level = it.level < 0 ? want : it.level + (want - it.level) * Math.min(1, dt * g.levelRate);
      const big = smooth(g.seedLevel, 1, it.level);
      if (asleep > 0.004) {
        const size = g.star * (g.seedScale + (1 - g.seedScale) * big);
        const presence = it.level + g.seedSwell * tw * (1 - big);
        b.quad(
          K_STAR,
          it.x,
          it.y,
          size,
          size,
          g.starGain * presence * asleep * it.appear,
          tw * (0.25 + 0.75 * big),
          smooth(0, 0.6, wake),
        );
      }
      if (wake > 0.004) {
        const size = 0.5 + 0.5 * wake;
        b.quad(
          K_GLINT,
          it.x,
          it.y,
          g.quad * size,
          g.quad * size,
          (1 + g.nearGain) * wake * it.appear,
          it.phase,
          0,
        );
      }
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
        this.ribbon(f, it.great, 0.85, f.pod >= 0);
        continue;
      }
      f.t = Math.min(f.dur, f.t + dt, (sim.frame - f.frame0 + 1) / 60);
      const notice = f.dur - f.fly;
      const recoil = it.great ? G.flight.greatRecoil : G.flight.recoil;
      let e: number;
      let scale: number;
      let open = 0;
      const SP = G.spill;
      // A spilled glint waits out the hit's freeze unseen (playtest 5: stars moving in a held world).
      if (f.pod >= 0 && f.t < f.hold) continue;
      if (f.pod >= 0 && f.t < notice) {
        // Spilled: it bursts out low and small, and hangs there for a beat.
        const k = Math.min(1, (f.t - f.hold) / Math.max(1e-3, f.pop));
        const out = 1 - (1 - k) ** 3;
        f.x = f.sx + (f.px - f.sx) * out;
        f.y =
          f.sy + (f.py - f.sy) * out - Math.sin(k * Math.PI) * 3 + Math.sin(clock * 9 + it.seed * 20) * 0.8;
        e = (SP.gain[0] as number) + ((SP.gain[1] as number) - (SP.gain[0] as number)) * out;
        scale = (SP.size[0] as number) + ((SP.size[1] as number) - (SP.size[0] as number)) * out;
      } else if (f.t < notice) {
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
          if (f.pod >= 0) f.hn = 0;
          // Swing over the top when she is off to one side; otherwise to its own side.
          const dx0 = this.chestX - f.sx;
          const dy0 = this.chestY - f.sy;
          f.side = Math.abs(dx0) > Math.abs(dy0) * 0.5 ? (dx0 > 0 ? -1 : 1) : it.seed > 0.5 ? 1 : -1;
          if (f.pod < 0) this.shimmer(it);
        }
        // Lag, then slingshot: it hangs back while she runs on, then catches her up in a rush.
        const s = f.fly > 0 ? (f.t - notice) / f.fly : 1;
        const es = s ** f.lag;
        const tx = this.chestX;
        const ty = this.chestY;
        const dx = tx - f.sx;
        const dy = ty - f.sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        // The swing peaks as the catch-up begins, so it comes round in an arc and not along a rail.
        const swing = Math.sin(Math.PI * s ** 1.6);
        const small = f.pod >= 0;
        const bulge =
          Math.min(len * (small ? SP.curve : G.flight.curve), small ? SP.curveMax : G.flight.curveMax) *
          swing *
          f.side;
        f.x = f.sx + dx * es - (dy / len) * bulge;
        f.y = f.sy + dy * es + (dx / len) * bulge;
        e = small ? SP.flyGain : (it.great ? 1.35 : 2.1) + 0.4 * s;
        scale = small
          ? (SP.flySize[0] as number) + ((SP.flySize[1] as number) - (SP.flySize[0] as number)) * es
          : 1.2 - 0.45 * es;
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
      if (f.left) this.ribbon(f, it.great, 1, f.pod >= 0);
      if (it.great) {
        const q = G.great.quad * (0.9 + 0.1 * scale);
        b.quad(K_GREAT, f.x, f.y, q, q, e, it.phase, open);
      } else if (f.pod >= 0) {
        // A spilled glint is the small cut star, gold, with a point of light in it: the world glint's
        // shader shrunk this far loses its arms and is a round spark (a firefly).
        b.quad(K_STAR, f.x, f.y, scale, scale, 1, 0.1, 1);
        b.quad(K_SPARK, f.x, f.y, scale * 0.9, scale * 0.9, e, 0, 0.05);
      } else {
        const q = G.glint.quad * scale;
        b.quad(K_GLINT, f.x, f.y, q, q, e, it.phase, 0);
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
    f.pod = -1;
    f.lag = G.lag;
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
  private absorb(it: Item, combo: number, pvx: number, pvy: number, small = false): void {
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
    } else if (small) {
      // A spilled glint just goes in at her chest: a point of light and a mote or two.
      const SP = GLINTS.spill;
      this.flare(0, 0, 5, SP.flare, 0.13, 0.3, 0.5, true, 0, 1);
      for (let i = 0; i < SP.sparks; i++)
        this.spark(
          cx,
          cy,
          pvx * A.carry + vx * 40,
          pvy * A.carry + vy * 40 - 20,
          2,
          50,
          0.16,
          0.3,
          1.8,
          M_BURST,
        );
    } else {
      this.flare(0, 0, 10, A.flare * (1 + 0.2 * step), 0.18, 0.3 + 0.15 * step, 0.6, true, 0, 1);
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

  /** Pods: springs, wind, the glow in the seam, husk flecks; and what the sim says is true now. */
  private updatePods(dt: number, clock: number, cam: CameraView, sim: SimView): void {
    const hp = sim.pods.hp;
    const b = this.batch;
    const halfW = VIEW_W / 2 / cam.zoom + 120;
    const halfH = VIEW_H / 2 / cam.zoom + 120;
    const player = sim.player;
    const list = sim.scene.pods ?? [];
    for (let i = 0; i < this.pods.length; i++) {
      const left = hp[i] ?? 0;
      let v = this.pods[i] ?? null;
      if (!v) {
        // Drawn only once it comes near the view: a dozen pods' worth of shapes is not free at boot.
        const q = list[i];
        if (!q || Math.abs(q.x - cam.x) > halfW || Math.abs(q.y - cam.y) > halfH) continue;
        v = new PodView(q, sim.scene, hash01(q.id), podTier(q, left));
        v.set(left <= 0, Math.max(0, v.tier - left));
        this.pods[i] = v;
        this.podBack.addChild(v.root);
      }
      if (left > v.tier) {
        // It is tougher than we drew it (the tuning changed and the scene restarted): redraw it.
        const again = new PodView(v.pod, sim.scene, hash01(v.pod.id), Math.min(3, left));
        this.podBack.addChildAt(again.root, this.podBack.getChildIndex(v.root));
        v.root.destroy({ children: true });
        this.pods[i] = again;
        continue;
      }
      const closed = left > 0;
      const damage = Math.max(0, v.tier - left);
      if (closed && (v.spent || damage < v.damage)) {
        // Restart: shut again, whole, and its spilled glints are forgotten.
        v.set(false, damage);
        this.spillN[i] = 0;
        for (const f of this.flights) {
          if (f.pod === i) {
            f.on = false;
            f.item = null;
            f.pod = -1;
          }
        }
      } else if (!closed && !v.spent) {
        v.set(true);
      } else if (closed && damage > v.damage) {
        // Damaged without our seeing the blow (a state jump): just show it.
        v.set(false, damage);
      }
      // Glints the sim has let go of that are not in the air yet: after a burst, or knocked loose.
      const owed = sim.pods.left[i] ?? 0;
      if (owed > 0) {
        const first = sim.pods.timer[i] ?? 1;
        const gap = sim.pods.gap[i] ?? 5;
        let flying = 0;
        for (const f of this.flights) {
          if (!f.on || f.done || f.pod !== i) continue;
          // A new hit restarts the sim's queue: glints still waiting by the pod take their new
          // times (in the order they were going to leave); ones already flying carry on.
          if (this.requeue[i] && !f.left) {
            let ahead = 0;
            for (const o of this.flights)
              if (o.on && !o.done && o.pod === i && o !== f && o.dur - o.t < f.dur - f.t) ahead++;
            f.dur = f.t + (first + ahead * gap) / 60;
          }
          flying++;
        }
        for (let j = flying; j < owed; j++)
          this.spillOne(
            i,
            v.cx,
            v.cy,
            0,
            0.9 + 0.1 * v.tier,
            (first + j * gap) / 60,
            sim.frame,
            player.hitstop / 60,
          );
      }
      this.requeue[i] = false;
      const p = v.pod;
      const seen = Math.abs(p.x - cam.x) < halfW && Math.abs(p.y - cam.y) < halfH;
      v.root.visible = seen;
      if (!seen) continue;
      // She brushes it as she passes through.
      if (Math.abs(player.cx - p.x) < 30 && Math.abs(player.cy - p.y) < 62) v.nudge(player.vx * dt * 1.3);
      v.update(dt, clock, wind(p.x, clock, (i * 0.37) % 1) * POD.sway);
      // A breath of light over the seam, so the bloom finds it: small, and gone once it is spent.
      const breathe = 1 + POD.breathe * Math.sin(clock * POD.breatheRate + v.pod.x * 0.01);
      const e = v.spent ? 0.16 * v.glow * v.glow : 0.15 * breathe;
      b.quad(K_FLARE, v.cx, v.cy, 22 * v.size, 28 * v.size, e, 0, 0.1);
      // Now and then a mote lets go of the tip and drifts up: what catches the eye from across the screen.
      if (!v.spent && this.rand() < dt * POD.motes)
        this.spark(v.tipX, v.tipY, (this.rand() - 0.5) * 8, -10, 2, 0, 1.1, 1.9, 1.5, M_RISE);
    }
    for (const c of this.chips) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vy += 900 * dt;
      c.vx *= Math.exp(-1.6 * dt);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.spin * dt;
      const k = Math.max(0, c.life) / c.max;
      b.quadRot(K_CHIP, c.x, c.y, c.size, c.size * 0.62, c.rot, Math.min(1, k * 3), c.tone, k);
    }
  }

  /**
   * Glints a dead enemy lets go of, from the state like a pod's (`spill` still owed, the next in
   * `spillTimer` steps, then `spillGap` apart): they pop out of the body the way the blow went, hang
   * a beat and fly, each landing on its `pickup {enemy: true}` event. Only the glints are drawn
   * here; the creature and what it crumbles into belong to src/render/enemies.
   */
  private updateFoes(sim: SimView): void {
    const list = sim.enemies ?? [];
    for (let j = 0; j < list.length; j++) {
      const e = list[j];
      const src = this.foeBase + j;
      if (!e || src >= this.spillN.length) continue;
      let flying = 0;
      for (const f of this.flights) if (f.on && !f.done && f.pod === src) flying++;
      if (flying > e.spill) {
        // The state went back (restart): what was in the air is forgotten.
        for (const f of this.flights) {
          if (f.on && !f.done && f.pod === src) {
            f.on = false;
            f.item = null;
            f.pod = -1;
          }
        }
        this.spillN[src] = 0;
        flying = 0;
      }
      const x = e.x + e.w / 2;
      const y = e.y + e.h / 2;
      // An up cut throws them high in a narrow plume; a down cut (she is above it) spreads them low
      // and wide to either side, clear of her; a forward cut leans them along the blow.
      const cut = this.foeCut[j] ?? 0;
      const fan = cut > 0 ? 0.55 : cut < 0 ? 1.5 : 1;
      const tall = cut > 0 ? 1.6 : cut < 0 ? 0.55 : 1;
      for (let k = flying; k < e.spill; k++)
        this.spillOne(
          src,
          x,
          y,
          cut === 0 ? e.hitDir : 0,
          1,
          (e.spillTimer + k * Math.max(1, e.spillGap)) / 60,
          sim.frame,
          Math.max(sim.player.hitstop, e.hitstop) / 60,
          fan,
          tall,
        );
    }
  }

  /** A slash opened a pod: it splits, throws flecks and motes the way the blow went, spills its light. */
  private burst(id: string, dir: 'fwd' | 'up' | 'down', facing: number, power: number): void {
    const i = this.podIndex.get(id);
    if (i === undefined) return;
    const v = this.pods[i];
    if (!v) return;
    const sx = dir === 'fwd' ? facing : 0;
    const sy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    this.requeue[i] = true;
    v.strike(sx, sy, power);
    // Bigger pods throw more, a finisher throws it further; the flash stays a few pixels.
    this.debris(i, v, sx, sy, 7 + 4 * (v.tier - 1), 6 + 3 * (v.tier - 1), power, 1 + 0.12 * (v.tier - 1));
  }

  /** A slash hit a tough pod without opening it: a ring of armour peels, a little flies off. */
  private podHit(i: number, dir: 'fwd' | 'up' | 'down', facing: number, power: number, hpLeft: number): void {
    const v = this.pods[i];
    if (!v) return;
    const sx = dir === 'fwd' ? facing : 0;
    const sy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    this.requeue[i] = true;
    v.hit(sx, sy, power, v.tier - hpLeft);
    this.debris(i, v, sx, sy, 4, 3, power, 0.75);
  }

  /** The contact flash, husk flecks and gold motes of a blow, thrown along it. */
  private debris(
    i: number,
    v: PodView,
    sx: number,
    sy: number,
    flecks: number,
    motes: number,
    power: number,
    size: number,
  ): void {
    const x = v.cx;
    const y = v.cy;
    const far = power >= 2 ? 1.4 : 1;
    // The contact: a few bright pixels, gone in a tenth of a second.
    this.flare(x, y, 4, 15 * size * (power >= 2 ? 1.2 : 1), 0.1, 0.36, 0.8, false, 0, 1);
    const tone = this.podTone[i] ?? 0;
    const n = Math.round(flecks * (power >= 2 ? 1.4 : 1));
    for (let k = 0; k < n; k++) {
      const c = this.chips[this.chipAt] as Chip;
      this.chipAt = (this.chipAt + 1) % this.chips.length;
      const spread = (this.rand() - 0.5) * 1.5;
      const sp = (150 + 230 * this.rand()) * far;
      // A down blow scatters sideways off the ground.
      const ax = sy > 0 ? (k % 2 === 0 ? 1 : -1) * 0.9 : sx + spread * (sx === 0 ? 1 : 0.5);
      const ay = sy > 0 ? -0.5 : sy * 0.9 - 0.45 + spread * (sx === 0 ? 0.2 : 0.5);
      c.x = x + (this.rand() - 0.5) * 20 * size * v.size;
      c.y = y + (this.rand() - 0.5) * 26 * size * v.size;
      c.vx = ax * sp;
      c.vy = ay * sp;
      c.rot = this.rand() * 6.283;
      c.spin = (this.rand() - 0.5) * 26;
      c.size = (2 + 2.4 * this.rand()) * (0.85 + 0.15 * v.tier);
      c.max = 0.45 + 0.35 * this.rand();
      c.life = c.max;
      c.tone = tone;
    }
    for (let k = 0; k < motes; k++)
      this.spark(
        x,
        y,
        sx * 150 * far + (this.rand() - 0.5) * 60,
        sy * 120 * far - 60,
        5,
        110,
        0.22,
        0.5,
        2.1,
        M_BURST,
      );
  }

  /**
   * One spilled glint: out of the husk (or the body) at (x, y) on a small arc to its own spot in a
   * loose scatter above it, then to her, landing `seconds` from now (the sim's time for it).
   */
  private spillOne(
    i: number,
    x: number,
    y: number,
    lean: number,
    size: number,
    seconds: number,
    frame: number,
    held: number,
    fan = 1,
    tall = 1,
  ): void {
    const n = this.spillN[i] ?? 0;
    this.spillN[i] = n + 1;
    const it = this.spill[i * SPILL + (n % SPILL)];
    let f: Flight | undefined;
    for (const c of this.flights) {
      if (!c.on) {
        f = c;
        break;
      }
    }
    if (!it || !f) return;
    // If she is already leaving (a pogo, a jump past it), or this one has a long wait (a big pod's
    // later glints), it sets off sooner and curves in steadily; otherwise it hangs for a beat first.
    const SP = GLINTS.spill;
    const fast = this.heroSpeed > 260 || Math.abs(this.chestX - x) + Math.abs(this.chestY - y) > 170;
    // A scatter, not a row: golden-ratio steps round a fan, near and far by turns.
    const a = ((((n * 0.618) % 1) - 0.5) * 2.5 + (this.rand() - 0.5) * 0.2) * fan;
    const r0 = SP.reach[0] as number;
    const reach = (r0 + ((SP.reach[1] as number) - r0) * ((n * 0.37) % 1)) * size;
    // Hidden for as long as the hit holds the world; what is left of its time is pop, hang, flight.
    const hold = Math.min(seconds * 0.5, held);
    const avail = Math.max(0.02, seconds - hold);
    it.stage = 1;
    f.on = true;
    f.item = it;
    f.t = 0;
    f.frame0 = frame;
    f.dur = seconds;
    f.fly = fast ? avail * 0.7 : Math.min(SP.fly, avail * 0.5);
    f.lag = fast ? 1.55 : GLINTS.flight.lag;
    f.hold = hold;
    f.pop = Math.min(SP.pop, (avail - f.fly) * 0.7);
    f.sx = x;
    f.sy = y;
    // `lean`: the side the blow threw them to (an enemy's glints leave along it).
    f.px = x + Math.sin(a) * reach + lean * SP.lean;
    f.py = y - Math.max(0.12, Math.cos(a)) * reach * SP.up * tall - SP.lift;
    f.ax = 0;
    f.ay = -1;
    f.side = 1;
    f.left = false;
    f.waved = false;
    f.done = false;
    f.x = x;
    f.y = y;
    f.hn = 0;
    f.shed = 0;
    f.pod = i;
  }

  /** One of a source's spilled glints reached her: the oldest still in the air. */
  private spillAbsorb(i: number, combo: number, pvx: number, pvy: number): void {
    let best: Flight | null = null;
    for (const f of this.flights) {
      if (f.on && !f.done && f.pod === i && (!best || f.dur - f.t < best.dur - best.t)) best = f;
    }
    if (best?.item) this.absorb(best.item, combo, pvx, pvy, true);
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
  private ribbon(f: Flight, great: boolean, gain: number, small = false): void {
    const n = f.hn;
    if (n < 2) return;
    const w0 =
      (great ? GLINTS.flight.greatTrailWidth : GLINTS.flight.trailWidth) * (small ? GLINTS.spill.trail : 1);
    const trailMax = small ? GLINTS.spill.trailMax : GLINTS.flight.trailMax;
    // The ribbon is never longer than `trailMax`, however fast the glint or she is going.
    let total = 0;
    for (let j = 0; j < n - 1; j++) {
      const dx = (f.hx[j + 1] as number) - (f.hx[j] as number);
      const dy = (f.hy[j + 1] as number) - (f.hy[j] as number);
      total += Math.sqrt(dx * dx + dy * dy);
    }
    const cap = Math.min(total, trailMax) || 1;
    let run = 0;
    let pnx = 0;
    let pny = 0;
    let have = false;
    for (let j = 0; j < n - 1 && run < cap; j++) {
      const ax = f.hx[j] as number;
      const ay = f.hy[j] as number;
      const bx = f.hx[j + 1] as number;
      const by = f.hy[j + 1] as number;
      const dx = bx - ax;
      const dy = by - ay;
      const l = Math.sqrt(dx * dx + dy * dy);
      if (l < 0.01) continue;
      const u0 = run / cap;
      const u1 = Math.min(1, (run + l) / cap);
      run += l;
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
        L.intensity *
        best.lit *
        edge *
        (0.5 + 0.5 * best.wake) *
        (0.9 + 0.1 * Math.sin(clock * 1.5 + best.phase * 6.283));
      if (!this.lightOn[s]) {
        this.ctx.lights.set(id, light);
        this.lightOn[s] = true;
      }
    }
  }

  /** For tools: where each pickup is drawn and what the renderer thinks of it. */
  debug(): Array<{ id: string; stage: number; x: number; y: number; level: number; wake: number }> {
    return this.items.map((it) => ({
      id: it.p.id,
      stage: it.stage,
      x: it.x,
      y: it.y,
      level: it.great ? 1 : Math.max(0, it.level),
      wake: it.wake,
    }));
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
