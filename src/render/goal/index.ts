/**
 * The goal made visible (memory/goal-render.md; rules in memory/goal.md): the three moth-lanterns,
 * what kindling one looks like, the heart of the grove and the ending.
 *
 * Reads `sim.goal` every frame (so a restart or a state jump simply shows) and the goal's events
 * for the moments: `lanternRefuse`, `lanternCancel`, `lanternKindle`, `lanternRest`, `heartSleep`,
 * `heartWake`, `gather`. Never changes the sim. All motion runs on render time.
 *
 * Layers (wired in stage.ts): `light` = additive, behind the playfield (the wave through the forest
 * when the heart wakes, the light that climbs the hollow tree at the end); `back` = the objects and
 * their own lights, behind the hero; `front` = what crosses her: the glints streaming out of her
 * chest, the price a lantern asks, the fireflies of the ending.
 *
 * All light is quads in three `GlintBatch` meshes (the glints' shader: spark, flare), plus one more
 * between the heart's rear and front straps, so a shut bud leaks light only through its seams.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { lampCost, lanternCost } from '../../sim/goal';
import { tuning } from '../../sim/tuning';
import { vesperLink } from '../character/vesper/link';
import { type CameraView, type RenderContext, type SimView, VIEW_H, VIEW_W } from '../contract';
import type { PointLight } from '../lights';
import { GlintBatch, K_FLARE, K_GLINT, K_SPARK } from '../pickups/batch';
import { zoneMix, zoneWeights } from '../scene/lib/fx-zones';
import { wind } from '../scene/lib/look';
import { GOAL, MAX_QUADS } from './config';
import { DropsView } from './drops';
import { HeartView } from './heart';
import { LanternView, Moth, WAY_SCALE, WAY_STYLES } from './lantern';
import { LanternLife } from './life';
import { priceArc, sleepBreath, smooth, streamCount } from './logic';
import { SurfaceLight } from './surface';

export interface GoalLayers {
  /** Additive light behind the playfield. */
  light: Container;
  /** The lanterns and the heart: behind the hero. */
  back: Container;
  /** Over the hero, under the grass fringe. */
  front: Container;
}

interface Lamp {
  view: LanternView;
  moth: Moth;
  /** What it wakes once lit: flowers at its foot, moths round the glass, a warm lift of the mist behind. */
  life: LanternLife;
  circlers: Moth[];
  mist: Sprite;
  /** 0..1: how alive the place is (eased after it catches). */
  alive: number;
  cost: number;
  /** A wayside lamp (`scene.lamps`): smaller, and everything it lights is smaller by `k` (1 for a lantern). */
  way: boolean;
  k: number;
  seed: number;
  lit: boolean;
  /** Glints that have left her / reached the glass in this channel. */
  emitted: number;
  arrived: number;
  /** 0..1: how warm the gathering light has made the glass (eased). */
  charge: number;
  /** Seconds since it caught (large = long ago). */
  catchT: number;
  /** A beat of the bead as a mote lands in it. */
  beat: number;
  /** An answering pulse (the heart waking, the ending). */
  pulse: number;
  /** Seconds into a refusal's dry flicker, -1 = none. */
  flicker: number;
  /** 0..1: she is near. */
  near: number;
  /** 0..1: it has noticed the light she carries (eased), and whether it has started at her this visit. */
  notice: number;
  stirred: boolean;
  moteIn: number;
  restIn: number;
  /** She was resting at it last frame. */
  resting: boolean;
  light: PointLight;
  lightOn: boolean;
  /** How far the solid it stands on runs to either side (for the swell along the ground). */
  edgeL: number;
  edgeR: number;
  /** The wave from the waking heart has passed it. */
  waved: boolean;
  /** A creature was turned away at the edge of its safe ground: 0..1, dying, and which side (-1, 1). */
  ward: number;
  wardSide: number;
}

/** A glint on its way from her chest into a lantern's glass (or, resting, light from the glass to her). */
interface Flow {
  on: boolean;
  lamp: number;
  age: number;
  dur: number;
  seed: number;
  out: boolean;
}

interface Spark {
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity px/s² (negative rises) and drag per second. */
  g: number;
  drag: number;
  /** Sideways wander px/s. */
  sway: number;
  size: number;
  e: number;
  heat: number;
  seed: number;
  /** Which batch: 0 back, 1 front. */
  layer: 0 | 1;
  /** Seconds before it appears. */
  wait: number;
  /** Follows her chest (its x, y are offsets) until it appears. */
  chest: boolean;
}

interface Wave {
  t: number;
  x: number;
  y: number;
  l: number;
  r: number;
}

const TAU = Math.PI * 2;

let glowTex: Texture | null = null;
/** A soft round glow (white, alpha falling off like a Gaussian): tinted, stretched and added. */
function glow(tint: number): Sprite {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (let i = 0; i <= 16; i++) {
        const r = i / 16;
        grad.addColorStop(r, `rgba(255,255,255,${(Math.exp(-r * r * 3.4) * (1 - r) ** 0.6).toFixed(4)})`);
      }
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }
    glowTex = Texture.from(c);
  }
  const s = new Sprite(glowTex);
  s.anchor.set(0.5);
  s.blendMode = 'add';
  s.tint = tint;
  s.alpha = 0;
  s.visible = false;
  return s;
}
const LONG_AGO = 1e6;

export class GoalRenderer {
  readonly cfg = GOAL;
  /** CPU ms of the last update (dev). */
  cpuMs = 0;
  private readonly lamps: Lamp[] = [];
  /** How many of `lamps` are the scene's lanterns (the rest are its wayside lamps). */
  private nLanterns = 0;
  private readonly heart: HeartView | null = null;
  private readonly lightBatch = new GlintBatch(48);
  /** Warm light on ground, plants and trunks (masked to the playfield). */
  private readonly surface = new SurfaceLight(24);
  private readonly back = new GlintBatch(MAX_QUADS);
  private readonly core = new GlintBatch(8);
  private readonly front = new GlintBatch(MAX_QUADS);
  private readonly flows: Flow[] = [];
  private readonly sparks: Spark[] = [];
  private sparkAt = 0;
  private readonly waves: Wave[] = [];
  private readonly swell: PointLight = {
    x: 0,
    y: 0,
    radius: 1,
    color: GOAL.lantern.light.color,
    intensity: 0,
  };
  private swellT = -1;
  private swellOn = false;
  private readonly heartLight: PointLight = {
    x: 0,
    y: 0,
    radius: 1,
    color: GOAL.heart.light.color,
    intensity: 0,
  };
  private heartLightOn = false;
  /** The price a lantern asks, shown for a moment after a refusal. */
  private readonly price = new Container();
  private readonly stars: Array<{ root: Container; fill: Graphics }> = [];
  private priceT = -1;
  private priceLamp = -1;
  private priceHold = 0;
  private readonly starPop: number[] = [];
  private priceHave = 0;
  private priceNeed = 0;
  private priceSpots: Array<[number, number]> = [];
  /** The heart: is it awake as far as we have shown, seconds since it woke / since she touched it asleep. */
  private awake = false;
  private wakeT = LONG_AGO;
  private sleepT = -1;
  private level = 0;
  private readonly wickT: number[] = [];
  private heartMote = 0;
  /** Where the sleeping heart is in its breath (0..1), and which breath the last mote left on. */
  private sleepBreathV = 0;
  private breathTurn = -1e9;
  private groveMote = 0;
  /** The glints a fade cost her, waiting where she fell. */
  private readonly drops = new DropsView();
  /** 0..1: how much of the bud's seams glow while it sleeps (a third per lantern), eased. */
  private seam = 0;
  /** The heart's own glows: its cold breath asleep, its golden light awake, the pillar up the hollow
   * tree, the warmth in the mist round it, the glow on the horizon from far away, and (the ending)
   * the light under the canopy and along the mist band. */
  private readonly glows: Record<
    'cold' | 'gold' | 'pillar' | 'shaft' | 'mist' | 'horizon' | 'canopy' | 'band',
    Sprite
  > | null = null;
  /** The ending: seconds since `gather` (-1 = not yet), fireflies still to lift out of her. */
  private endT = -1;
  /** 0..1: the ending has changed the whole grove (pools widen, the mist warms); stays. */
  private grove = 0;
  private answered = false;
  private rnd = 0x9e3779b9;
  private readonly tmp = [0, 0, 0, 0];
  private chestX = 0;
  private chestY = 0;

  constructor(
    private readonly ctx: RenderContext,
    layers: GoalLayers,
  ) {
    const scene = ctx.scene;
    // The lanterns, then the wayside lamps (`scene.lamps`): one list, the same life, a lesser look.
    const lanterns = scene.lanterns ?? [];
    this.nLanterns = lanterns.length;
    const list = [...lanterns, ...(lanterns.length > 0 ? (scene.lamps ?? []) : [])];
    if (list.length > 0) layers.back.addChild(this.surface.mesh);
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l) continue;
      const way = i >= this.nLanterns;
      const view = way
        ? new LanternView(l.x, l.y, i, WAY_SCALE, WAY_STYLES[(i - this.nLanterns) % WAY_STYLES.length])
        : new LanternView(l.x, l.y, i);
      const moth = new Moth(((i * 0.618) % 1) + 0.1);
      // The top it stands on: the swell of light along the ground stops at its edges.
      let edgeL = l.x - 400;
      let edgeR = l.x + 400;
      for (const r of scene.solids) {
        if (r.y !== l.y || l.x < r.x || l.x > r.x + r.w) continue;
        edgeL = Math.max(edgeL, r.x);
        edgeR = Math.min(edgeR, r.x + r.w);
      }
      const life = new LanternLife(l.x, l.y, edgeL, edgeR, (i * 0.618 + 0.27) % 1);
      const circlers = [new Moth(0.31 + i * 0.2), new Moth(0.77 + i * 0.13)];
      const mist = glow(GOAL.lantern.mist.color);
      mist.position.set(view.ox, l.y - GOAL.lantern.mist.lift);
      layers.light.addChild(mist);
      layers.back.addChild(life.root, view.root, moth.root);
      for (const c of circlers) layers.back.addChild(c.root);
      this.lamps.push({
        view,
        moth,
        life,
        circlers,
        mist,
        alive: 0,
        cost: way ? lampCost(l, tuning.goal) : lanternCost(l, tuning.goal),
        way,
        k: way ? WAY_SCALE : 1,
        seed: (i * 0.618 + 0.27) % 1,
        lit: false,
        emitted: 0,
        arrived: 0,
        charge: 0,
        catchT: LONG_AGO,
        beat: 0,
        pulse: 0,
        flicker: -1,
        near: 0,
        notice: 0,
        stirred: false,
        moteIn: 0,
        restIn: 0,
        resting: false,
        light: {
          x: l.x,
          y: l.y,
          radius: GOAL.lantern.light.radius,
          color: GOAL.lantern.light.color,
          intensity: 0,
        },
        lightOn: false,
        edgeL,
        edgeR,
        waved: false,
        ward: 0,
        wardSide: 1,
      });
    }
    if (scene.heart && list.length > 0) {
      const h = new HeartView(scene.heart.x, scene.heart.y);
      this.heart = h;
      const G = GOAL.heart.glow;
      const g = {
        cold: glow(G.cold),
        gold: glow(G.gold),
        pillar: glow(G.pillar),
        shaft: glow(G.pillar),
        mist: glow(G.mist),
        horizon: glow(G.pillar),
        canopy: glow(G.mist),
        band: glow(G.band),
      };
      this.glows = g;
      layers.light.addChild(g.mist, g.band, g.canopy, g.pillar, g.shaft, g.horizon);
      layers.back.addChild(h.back, g.cold, this.core.mesh, h.front, g.gold);
      for (let i = 0; i < h.wicks.length; i++) this.wickT.push(LONG_AGO);
    }
    for (let i = 0; i < 40; i++) this.flows.push({ on: false, lamp: 0, age: 0, dur: 1, seed: 0, out: false });
    for (let i = 0; i < 200; i++)
      this.sparks.push({
        life: 0,
        max: 1,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        g: 0,
        drag: 0,
        sway: 0,
        size: 1,
        e: 0,
        heat: 0,
        seed: 0,
        layer: 0,
        wait: 0,
        chest: false,
      });
    if (this.lamps.length > 0 || this.heart) {
      layers.light.addChild(this.lightBatch.mesh);
      layers.back.addChild(this.back.mesh);
      layers.front.addChild(this.front.mesh, this.price);
    }
    this.price.visible = false;
    // Dev handle, like __pickups: `__goal.cfg.lantern.light.intensity = 0; __game.render()`.
    if (typeof window !== 'undefined') (window as unknown as { __goal?: GoalRenderer }).__goal = this;
  }

  private rand(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  private spark(
    layer: 0 | 1,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
  ): Spark {
    const s = this.sparks[this.sparkAt] as Spark;
    this.sparkAt = (this.sparkAt + 1) % this.sparks.length;
    s.layer = layer;
    s.x = x;
    s.y = y;
    s.vx = vx;
    s.vy = vy;
    s.life = life;
    s.max = life;
    s.size = size;
    s.g = 0;
    s.drag = 0;
    s.sway = 0;
    s.e = 0.6;
    s.heat = 0.5;
    s.seed = this.rand();
    s.wait = 0;
    s.chest = false;
    return s;
  }

  /** A slow mote rising from a light. */
  private rise(x: number, y: number, e: number, spread = 5): void {
    const s = this.spark(
      0,
      x + (this.rand() - 0.5) * spread * 2,
      y + (this.rand() - 0.5) * spread,
      (this.rand() - 0.5) * 10,
      -16 - 22 * this.rand(),
      2.2 + 1.6 * this.rand(),
      1.7 + 0.9 * this.rand(),
    );
    s.g = -5;
    s.sway = 9;
    s.e = e;
    s.heat = 0.45;
  }

  /** Where a flow is at `u` (0 leaving .. 1 arrived): x, y in `tmp[0..1]`, its brightness in `tmp[2]`. */
  private flowAt(f: Flow, lamp: Lamp, u: number): void {
    const K = GOAL.kindle;
    const out = this.tmp;
    const v = lamp.view;
    if (f.out) {
      // Resting: light leaves the glass and drifts across to her, a shallow arc.
      const k = u * u * (3 - 2 * u);
      const mx = (v.beadX + this.chestX) / 2 + (f.seed - 0.5) * 22;
      const my = Math.min(v.beadY, this.chestY) - 10 - f.seed * 14;
      const a = (1 - k) * (1 - k);
      const b = 2 * (1 - k) * k;
      out[0] = a * v.beadX + b * mx + k * k * this.chestX;
      out[1] = a * v.beadY + b * my + k * k * this.chestY;
      out[2] = 1;
      return;
    }
    const split = 0.4;
    const foot = 0.1;
    if (u < split) {
      // Out of her chest, dipping toward the lantern's foot.
      const k = u / split;
      const e = k * k * (3 - 2 * k);
      v.path.sample(foot, out);
      const fx = out[0] as number;
      const fy = out[1] as number;
      const mx = (this.chestX + fx) / 2 + (f.seed - 0.5) * 18;
      const my = Math.max(this.chestY, fy) + 6 - f.seed * 22;
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      out[0] = a * this.chestX + b * mx + e * e * fx;
      out[1] = a * this.chestY + b * my + e * e * fy;
      out[2] = 1;
      return;
    }
    // Up the stem, winding round it, into the glass.
    const k = (u - split) / (1 - split);
    v.path.sample(foot + (1 - foot) * k ** 1.2, out);
    const ang = k * K.turns * TAU + f.seed * TAU;
    const r = K.wind * (1 - k) ** 0.7 * Math.min(1, k * 6);
    const nx = -(out[3] as number);
    const ny = out[2] as number;
    out[0] = (out[0] as number) + nx * Math.sin(ang) * r;
    out[1] = (out[1] as number) + ny * Math.sin(ang) * r;
    // Passing behind the stem it dims.
    out[2] = 0.62 + 0.38 * Math.cos(ang);
  }

  private startFlow(lamp: number, out: boolean, dur: number): void {
    for (const f of this.flows) {
      if (f.on) continue;
      f.on = true;
      f.lamp = lamp;
      f.age = 0;
      f.dur = dur;
      f.seed = this.rand();
      f.out = out;
      return;
    }
  }

  /** The channel broke: what was on its way falls and fades, the glass gives its light back. */
  private spill(i: number, lamp: Lamp): void {
    for (const f of this.flows) {
      if (!f.on || f.lamp !== i || f.out) continue;
      f.on = false;
      this.flowAt(f, lamp, Math.min(1, f.age / f.dur));
      const s = this.spark(
        1,
        this.tmp[0] as number,
        this.tmp[1] as number,
        (this.rand() - 0.5) * 30,
        -20,
        0.55,
        2.4,
      );
      s.g = 240;
      s.e = 0.7;
      s.heat = 0.4;
    }
    const n = Math.min(7, lamp.arrived);
    for (let k = 0; k < n; k++) {
      const s = this.spark(
        0,
        lamp.view.beadX + (this.rand() - 0.5) * 6,
        lamp.view.beadY + 3,
        (this.rand() - 0.5) * 46,
        -30 - 30 * this.rand(),
        0.6 + 0.35 * this.rand(),
        2.3,
      );
      s.g = 300;
      s.e = 0.7;
      s.heat = 0.3;
    }
    lamp.emitted = 0;
    lamp.arrived = 0;
  }

  /** The lamp catches. */
  private catch(lamp: Lamp): void {
    const K = GOAL.kindle;
    lamp.lit = true;
    lamp.catchT = 0;
    lamp.view.kick((lamp.seed - 0.5) * 2.4 + 0.9);
    this.swellT = 0;
    this.swell.x = lamp.view.beadX;
    this.swell.y = lamp.view.beadY + 20;
    this.waves.push({ t: 0, x: lamp.view.x, y: lamp.view.y, l: lamp.edgeL, r: lamp.edgeR });
    for (let k = 0; k < K.rise; k++) {
      const s = this.spark(
        0,
        lamp.view.beadX + (this.rand() - 0.5) * 10,
        lamp.view.beadY + (this.rand() - 0.5) * 8,
        (this.rand() - 0.5) * 44,
        -34 - 50 * this.rand(),
        1.6 + 1.5 * this.rand(),
        1.9 + 1.1 * this.rand(),
      );
      s.g = -8;
      s.drag = 1.1;
      s.sway = 12;
      s.e = 0.8;
      s.heat = 0.7;
      s.wait = k * 0.05;
    }
  }

  update(dt: number, clock: number, cam: CameraView, sim: SimView): void {
    if (this.lamps.length === 0 && !this.heart) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const L = GOAL.lantern;
    const K = GOAL.kindle;
    const goal = sim.goal;
    const p = sim.player;
    // Vesper says where the light leaves her (her open palm while she kindles); other skins: the chest.
    this.chestX = vesperLink.live ? vesperLink.offerX : p.cx;
    this.chestY = vesperLink.live ? vesperLink.offerY : p.cy - 8;
    vesperLink.goal = goal;
    const wallet = sim.pickups.count;

    // --- What happened.
    let kindled = -1;
    for (const e of sim.events) {
      if (e.type === 'lanternKindle' || e.type === 'lampKindle') {
        kindled = this.lampOf(e.x, e.y);
        const lamp = this.lamps[kindled];
        if (lamp) this.catch(lamp);
      } else if (e.type === 'lanternCancel' || e.type === 'lampCancel') {
        const i = this.lampOf(e.x, e.y);
        const lamp = this.lamps[i];
        if (lamp) this.spill(i, lamp);
      } else if (e.type === 'lanternRefuse' || e.type === 'lampRefuse') {
        const i = this.lampOf(e.x, e.y);
        const lamp = this.lamps[i];
        if (!lamp) continue;
        lamp.flicker = 0;
        lamp.view.kick(p.cx < lamp.view.x ? -1.7 : 1.7);
        for (let k = 0; k < 4; k++) {
          const s = this.spark(
            0,
            lamp.view.beadX + (this.rand() - 0.5) * 5,
            lamp.view.beadY + 4,
            (this.rand() - 0.5) * 36,
            -8 - 26 * this.rand(),
            0.55 + 0.4 * this.rand(),
            1.9,
          );
          s.g = 250;
          s.e = 0.55;
          s.heat = 0.05;
          s.wait = 0.08 + k * 0.07;
        }
        // The sim says how long the price is worth showing (it fires only once she has stood there).
        this.openPrice(i, e.need, e.show > 0 ? e.show / 60 : GOAL.refuse.hold);
      } else if (e.type === 'lanternRest' || e.type === 'lampRest') {
        const lamp = this.lamps[this.lampOf(e.x, e.y)];
        if (lamp) lamp.beat = 1;
        // The light lands in her: a few motes lift off her shoulders.
        for (let k = 0; k < 5; k++) {
          const s = this.spark(
            1,
            this.chestX + (this.rand() - 0.5) * 22,
            this.chestY + (this.rand() - 0.5) * 26,
            (this.rand() - 0.5) * 20,
            -26 - 26 * this.rand(),
            0.7 + 0.5 * this.rand(),
            1.8,
          );
          s.g = -10;
          s.sway = 8;
          s.e = 0.6;
          s.heat = 0.5;
        }
      } else if (
        (e.type === 'enemyTurn' && e.cause === 'lantern') ||
        (e.type === 'enemyGiveUp' && e.cause === 'calm')
      ) {
        // A creature was turned away at the edge of a lit lantern's ground: the ground answers there.
        const reach = tuning.goal.lampSanctuaryPx + 80;
        for (const lamp of this.lamps) {
          if (!lamp.lit || Math.hypot(e.x - lamp.view.x, e.y - (lamp.view.y - 40)) > reach + 120) continue;
          lamp.ward = 1;
          lamp.wardSide = e.x < lamp.view.x ? -1 : 1;
        }
      } else if (e.type === 'heartSleep') {
        this.sleepT = 0;
      } else if (e.type === 'heartWake') {
        this.awake = true;
        this.wakeT = 0;
        for (const lamp of this.lamps) lamp.waved = false;
        this.drift(cam, e.x, e.y);
      } else if (e.type === 'gather') {
        this.endT = 0;
        this.answered = false;
        this.fireflies(Math.min(GOAL.ending.fireflies, wallet));
      }
    }

    // --- The lanterns.
    const of = Math.max(1, Math.round(tuning.goal.channelFrames));
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i] as Lamp;
      const s = this.stateOf(goal, i);
      if (!s) continue;
      const v = lamp.view;
      // What is true now (a restart, a state jump): no ceremony.
      if (s.lit !== lamp.lit) {
        lamp.lit = s.lit;
        lamp.catchT = LONG_AGO;
        lamp.emitted = 0;
        lamp.arrived = 0;
        lamp.charge = 0;
        v.web = s.lit ? 0 : 1;
        lamp.moth.want(false, true);
      }
      lamp.catchT += dt;
      lamp.beat *= Math.exp(-dt * 9);
      lamp.pulse *= Math.exp(-dt * 1.5);
      lamp.ward *= Math.exp(-dt * 1.6);

      // Kindling: glints leave her as the channel runs.
      if (!s.lit) {
        if (s.channel > 0) {
          const want = streamCount(s.channel, of, lamp.cost, K.by);
          while (lamp.emitted < want) {
            lamp.emitted++;
            this.startFlow(i, false, K.flight * (0.9 + 0.2 * this.rand()));
          }
        } else if (lamp.emitted > 0) this.spill(i, lamp);
      }
      const target = s.lit ? 1 : lamp.cost > 0 ? Math.min(1, lamp.arrived / lamp.cost) : 0;
      lamp.charge += (target - lamp.charge) * Math.min(1, dt * (target > lamp.charge ? 14 : 4));

      // Resting: light flows from the glass to her.
      const resting = s.lit && s.rest > 0;
      if (resting) {
        lamp.restIn -= dt;
        if (lamp.restIn <= 0) {
          lamp.restIn = 0.075;
          this.startFlow(i, true, 0.42 + 0.12 * this.rand());
        }
      } else lamp.restIn = 0;
      lamp.resting = resting;

      if (!lamp.way) {
        vesperLink.beads[i * 2] = v.beadX;
        vesperLink.beads[i * 2 + 1] = v.beadY;
      }
      // Standing at it with too little, the price shows again, softly, for as long as she stays.
      if (!s.lit && s.short > 0 && s.refused && wallet < lamp.cost) this.openPrice(i, lamp.cost, 0.5);

      // She is near: a dormant ember answers.
      const dx = this.chestX - v.x;
      const dy = this.chestY - (v.y - 50);
      const dist = Math.hypot(dx, dy);
      const near = 1 - smooth(L.nearPx * 0.45, L.nearPx, dist);
      lamp.near += (near - lamp.near) * Math.min(1, dt * 4);

      // It notices the light she carries: the crook bows to her, the glass swings her way with a
      // start, and its price stands round the glass (filled as far as her wallet goes).
      const N = L.notice;
      const idle = !s.lit && s.channel === 0;
      const want = idle && wallet > 0 ? 1 - smooth(N.px * 0.55, N.px, dist) : 0;
      lamp.notice += (want - lamp.notice) * Math.min(1, dt * (want > lamp.notice ? 6 : 2.4));
      const side = this.chestX < v.ox ? -1 : 1;
      if (want > 0.3 && !lamp.stirred) {
        lamp.stirred = true;
        v.kick(-N.kick * side);
        lamp.beat = 1;
      } else if (want <= 0 && lamp.notice < 0.05) lamp.stirred = false;
      if (!s.lit && dist < N.marksPx && this.inView(cam, v.x, v.y - 60, 0)) this.openPrice(i, lamp.cost, 0.5);

      // The glass on its thread.
      v.warmth = s.lit ? Math.min(1, 0.75 + lamp.catchT * 2) : lamp.charge * 0.75;
      if (s.lit) v.web = Math.max(0, v.web - dt * 2.2);
      v.update(
        dt,
        wind(v.x, clock, lamp.seed) * L.sway - N.glass * lamp.notice * side,
        N.bow * lamp.notice * side,
      );

      // Her moth comes to the lantern she re-forms at.
      lamp.moth.want(s.lit && this.restsAt(goal, i) && lamp.catchT > 1.1);
      lamp.moth.update(dt, clock, v.topX, v.topY);

      // The place comes alive round a lit one: flowers open, the creeper leafs out, moths come to
      // the glass, the mist behind takes a little warmth. A dormant one only glints, coldly.
      const aliveT = s.lit ? lamp.catchT : -1;
      lamp.alive += ((s.lit ? 1 : 0) - lamp.alive) * Math.min(1, dt * (lamp.catchT > 1e5 ? 60 : 0.9));
      lamp.life.update(dt, clock, aliveT);
      v.life = smooth(0.15, 0.9, lamp.alive);
      const tw = (clock * 0.23 + lamp.seed) % 1;
      v.glint = s.lit ? 0 : (0.16 + 0.84 * Math.sin(Math.PI * smooth(0, 0.22, tw)) ** 2) * (1 - lamp.charge);
      for (let k = 0; k < lamp.circlers.length; k++) {
        const m = lamp.circlers[k] as Moth;
        m.orbit(clock, v.beadX, v.beadY - 6, 30 + k * 16, smooth(0.5 + k * 0.25, 0.9 + k * 0.1, lamp.alive));
      }
      const M = L.mist;
      const mz = zoneMix(L.mistZone as [number, number, number], zoneWeights(v.x));
      const ma =
        M.alpha *
        mz *
        lamp.alive *
        (lamp.way ? 0.4 : 1) *
        (1 + 0.5 * lamp.pulse + GOAL.ending.lampMist * this.grove);
      lamp.mist.visible = ma > 0.003;
      lamp.mist.alpha = ma;
      lamp.mist.width = M.width * lamp.k * (1 + GOAL.ending.wide * this.grove);
      lamp.mist.height = M.height * (1 + 0.5 * GOAL.ending.wide * this.grove);

      // Motes rise from a lit one.
      if (s.lit && this.inView(cam, v.x, v.y, 300)) {
        lamp.moteIn -= dt * L.motes * (1 + 2 * lamp.pulse);
        if (lamp.moteIn <= 0) {
          lamp.moteIn += 0.7 + 0.6 * this.rand();
          this.rise(v.beadX, v.beadY - 4, 0.5);
        }
      }

      // Its light on the place.
      const breath = 1 + L.breathe * Math.sin((clock * TAU) / L.breath + lamp.seed * TAU);
      const lit = s.lit ? smooth(0, 0.5, lamp.catchT) : lamp.charge * 0.3;
      const li = L.light.intensity * lit * (0.94 + 0.06 * breath) * (1 + 0.5 * lamp.pulse + 0.12 * lamp.beat);
      lamp.light.x = v.beadX;
      lamp.light.y = v.beadY + 18;
      lamp.light.radius = L.light.radius * lamp.k * (1 + 0.2 * lamp.pulse);
      lamp.light.color = L.light.color;
      lamp.light.intensity = li;
      this.setLight(`lantern${i}`, lamp.light, li > 0.004, lamp.lightOn);
      lamp.lightOn = li > 0.004;

      if (lamp.flicker >= 0) {
        lamp.flicker += dt;
        if (lamp.flicker > 0.75) lamp.flicker = -1;
      }
    }

    // --- Flows.
    for (const f of this.flows) {
      if (!f.on) continue;
      f.age += dt;
      if (f.age < f.dur) continue;
      f.on = false;
      const lamp = this.lamps[f.lamp];
      if (!lamp) continue;
      if (f.out) continue;
      lamp.arrived++;
      lamp.beat = 1;
    }

    // --- The heart.
    const h = this.heart;
    let bloom = 0;
    if (h) {
      const H = GOAL.heart;
      // A state jump (restart, load): no ceremony.
      let jump = false;
      if (goal.heart.awake !== this.awake) {
        this.awake = goal.heart.awake;
        this.wakeT = LONG_AGO;
        jump = true;
      }
      if (goal.gathered && this.endT < 0) {
        this.endT = LONG_AGO;
        jump = true;
      } else if (!goal.gathered && this.endT >= 0) {
        this.endT = -1;
        jump = true;
      }
      this.wakeT += dt;
      if (this.endT >= 0) this.endT += dt;
      if (this.sleepT >= 0) {
        this.sleepT += dt;
        if (this.sleepT > 2.6 || this.awake) this.sleepT = -1;
      }
      bloom = this.endT >= 0 ? smooth(0.1, 2.6, this.endT) : 0;
      this.grove = this.endT >= 0 ? smooth(0.5, 3.4, this.endT) : 0;
      // Asleep, every lantern kindled anywhere parts the bud a little and lights a third of its seams.
      const share = goal.lanterns.length > 0 ? goal.lit / goal.lanterns.length : 0;
      this.seam += ((this.awake ? 0 : share) - this.seam) * Math.min(1, dt * (jump ? 60 : 1.2));
      const open = this.awake ? H.awake + (H.bloom - H.awake) * bloom : H.ajar * share;
      // Asleep it breathes: slow in, long out, and lets one dim mote go with each breath out.
      const SL = H.sleep;
      const bt = clock / SL.seconds;
      const asleep = this.awake ? 0 : 1 - 0.5 * share;
      const breath = sleepBreath(bt, SL.inhale) * asleep;
      this.sleepBreathV = breath;
      const turn = Math.floor(bt - SL.inhale);
      if (!this.awake && turn !== this.breathTurn) {
        if (this.breathTurn !== -1e9 && this.inView(cam, h.x, h.y, 300)) {
          const s = this.spark(
            0,
            h.x + (this.rand() - 0.5) * 6,
            h.y - 92,
            (this.rand() - 0.5) * 8,
            -15,
            3.4,
            2.3,
          );
          s.g = -1.5;
          s.sway = 7;
          s.e = SL.mote;
          s.heat = 0.1;
        }
        this.breathTurn = turn;
      }
      h.update(dt, clock, open, jump, H.lift * smooth(0.5, 3.2, this.endT), breath);
      if (jump) this.level = this.awake ? 1 : 0;
      // One wick per lantern.
      for (let i = 0; i < h.wicks.length; i++) {
        const wk = h.wicks[i];
        const s = goal.lanterns[i];
        if (!wk || !s) continue;
        // A wick catches a beat after its lantern does; a state jump just shows it lit.
        if (!s.lit) this.wickT[i] = -1;
        else if ((this.wickT[i] as number) < 0) this.wickT[i] = i === kindled ? 0 : LONG_AGO;
        else this.wickT[i] = (this.wickT[i] as number) + dt;
        wk.warmth = s.lit ? smooth(0.5, 0.9, this.wickT[i] as number) : 0;
      }
      const wake = this.awake ? smooth(0.15, 1.8, this.wakeT) : 0;
      this.level += (wake - this.level) * Math.min(1, dt * 6);
      const li =
        H.light.intensity * this.level * (1 + H.light.bloom * bloom) * (0.96 + 0.04 * Math.sin(clock * 1.3));
      this.heartLight.x = h.coreX;
      this.heartLight.y = h.coreY + 8;
      this.heartLight.radius = H.light.radius * (1 + GOAL.ending.wide * bloom);
      this.heartLight.color = H.light.color;
      this.heartLight.intensity = li;
      this.setLight('heart', this.heartLight, li > 0.004, this.heartLightOn);
      this.heartLightOn = li > 0.004;
      if (this.level > 0.3 && this.inView(cam, h.x, h.y, 500)) {
        this.heartMote -= dt * H.motes * (1 + 1.4 * bloom);
        if (this.heartMote <= 0) {
          this.heartMote += 0.7 + 0.6 * this.rand();
          const s = this.spark(
            0,
            h.coreX + (this.rand() - 0.5) * 34,
            h.coreY - 6 - this.rand() * 16,
            (this.rand() - 0.5) * 14,
            -30 - 34 * this.rand(),
            3.6 + 2.6 * this.rand(),
            1.8 + 1.0 * this.rand(),
          );
          s.g = -4;
          s.sway = 13;
          s.e = 0.6;
          s.heat = 0.5;
        }
      }
      // Its glows.
      const g = this.glows;
      if (g) {
        const lvl = this.level;
        const E = GOAL.ending;
        const gr = this.grove;
        const slow = 0.92 + 0.08 * Math.sin(clock * 0.7);
        const put = (sp: Sprite, x: number, y: number, w: number, hgt: number, a: number): void => {
          sp.visible = a > 0.003;
          if (!sp.visible) return;
          sp.position.set(x, y);
          sp.width = w;
          sp.height = hgt;
          sp.alpha = a;
        };
        // Asleep: a slow cold breath in the bud.
        const cold = (1 - lvl) * (0.25 + 0.75 * this.sleepBreathV);
        put(g.cold, h.coreX, h.y - 44, 150, 190, H.glow.coldAlpha * cold * (1 - 0.6 * share));
        // Awake: a flower of deep amber light, a narrow column up the hollow tree, a little warmth in the mist.
        const wide = 1 + E.wide * gr;
        const gs = H.glow.goldSize * (1 + E.wide * bloom);
        put(g.gold, h.coreX, h.coreY, gs, gs, H.glow.goldAlpha * lvl * slow);
        const rise = smooth(0.2, 2.4, this.wakeT);
        const ph = H.glow.pillarHeight * rise;
        put(
          g.pillar,
          h.x,
          h.y - ph * 0.4,
          H.glow.pillarWidth * wide,
          ph,
          H.glow.pillarAlpha * lvl * slow * (1 + E.pillar * gr),
        );
        put(
          g.shaft,
          h.x,
          h.y - ph * 0.4,
          H.glow.pillarWidth * H.glow.shaftWidth,
          ph,
          H.glow.shaftAlpha * lvl * slow * (1 + E.pillar * gr),
        );
        put(
          g.mist,
          h.x,
          h.y - 140,
          H.glow.mistWidth * wide,
          H.glow.mistHeight,
          H.glow.mistAlpha * lvl * (1 + 0.4 * gr),
        );
        // From far away: a glow low at the edge of the view nearest the heart.
        const hw = VIEW_W / 2 / cam.zoom;
        const hh = VIEW_H / 2 / cam.zoom;
        const ex = Math.min(cam.x + hw - 150, Math.max(cam.x - hw + 150, h.x));
        const ey = Math.min(cam.y + hh - 220, Math.max(cam.y - hh + 260, h.y - 160));
        const far = smooth(260, 900, Math.hypot(h.x - ex, h.y - 160 - ey));
        const zone = zoneMix(H.glow.horizonZone as [number, number, number], zoneWeights(cam.x));
        put(
          g.horizon,
          ex,
          ey,
          H.glow.horizonWidth,
          H.glow.horizonHeight,
          H.glow.horizonAlpha * zone * lvl * far * slow,
        );
        // The ending: a breath of light under the canopy and along the mist band.
        put(g.canopy, h.x - 260, h.y - 730, 2600, 360, E.canopy * gr * slow);
        put(g.band, cam.x, h.y - 40, 2400 / cam.zoom, 380, E.band * gr);
      }
      // The ending: fireflies rise all over the view, and go on rising.
      if (this.endT >= 0.8) {
        this.groveMote -= dt * GOAL.ending.motes * this.grove;
        if (this.groveMote <= 0) {
          this.groveMote += 0.6 + 0.8 * this.rand();
          const sp = this.spark(
            0,
            cam.x + (this.rand() - 0.5) * VIEW_W,
            cam.y + 60 + this.rand() * 330,
            (this.rand() - 0.5) * 16,
            -22 - 34 * this.rand(),
            4 + 3 * this.rand(),
            1.7 + 1.1 * this.rand(),
          );
          sp.g = -4;
          sp.sway = 16;
          sp.e = 0.6;
          sp.heat = 0.5;
        }
      }
      // The ending: every lit lantern answers.
      if (this.endT >= 0.9 && this.endT < 2 && !this.answered) {
        this.answered = true;
        for (const lamp of this.lamps) if (lamp.lit) lamp.pulse = 1;
      }
    }

    // --- The swell of light as a lamp catches.
    if (this.swellT >= 0) {
      const S = L.swell;
      this.swellT += dt;
      const k = this.swellT / S.seconds;
      if (k >= 1) this.swellT = -1;
      const out = 1 - (1 - Math.min(1, k)) ** 2.2;
      this.swell.radius = S.from + (S.to - S.from) * out;
      this.swell.intensity = k >= 1 ? 0 : S.intensity * smooth(0, 0.1, k) * (1 - k) ** 1.7;
      this.swell.color = L.light.color;
    }
    const swellOn = this.swellT >= 0 && this.swell.intensity > 0.003;
    this.setLight('lanternSwell', this.swell, swellOn, this.swellOn);
    this.swellOn = swellOn;

    this.draw(dt, clock, cam, sim, bloom);
    if (typeof performance !== 'undefined') this.cpuMs = performance.now() - t0;
  }

  private setLight(id: string, light: PointLight, on: boolean, was: boolean): void {
    if (on && !was) this.ctx.lights.set(id, light);
    else if (!on && was) this.ctx.lights.remove(id);
  }

  /** The sim's record of lamp `i` (a lantern, or after them a wayside lamp). */
  private stateOf(goal: SimView['goal'], i: number): SimView['goal']['lanterns'][number] | undefined {
    return i < this.nLanterns ? goal.lanterns[i] : goal.lamps?.[i - this.nLanterns];
  }

  /** Lamp `i` is where she re-forms. */
  private restsAt(goal: SimView['goal'], i: number): boolean {
    return i < this.nLanterns ? goal.restAt === i : goal.restLamp === i - this.nLanterns;
  }

  private lampOf(x: number, y: number): number {
    for (let i = 0; i < this.lamps.length; i++) {
      const v = (this.lamps[i] as Lamp).view;
      if (v.x === x && v.y === y) return i;
    }
    return -1;
  }

  private inView(cam: CameraView, x: number, y: number, pad: number): boolean {
    return (
      Math.abs(x - cam.x) < VIEW_W / 2 / cam.zoom + pad && Math.abs(y - cam.y) < VIEW_H / 2 / cam.zoom + pad
    );
  }

  /** The heart woke: motes across the view lean toward it for a while. */
  private drift(cam: CameraView, hx: number, hy: number): void {
    const H = GOAL.heart;
    for (let k = 0; k < H.drift; k++) {
      const x = cam.x + (this.rand() - 0.5) * VIEW_W * 1.05;
      const y = cam.y + (this.rand() - 0.5) * VIEW_H * 0.95;
      const d = Math.hypot(hx - x, hy - y) || 1;
      const sp = 46 + 70 * this.rand();
      const s = this.spark(
        0,
        x,
        y,
        ((hx - x) / d) * sp,
        ((hy - y) / d) * sp * 0.45,
        H.driftSeconds * (0.6 + 0.4 * this.rand()),
        1.6 + 1.1 * this.rand(),
      );
      s.sway = 10;
      s.e = 0.5;
      s.heat = 0.45;
      s.wait = 0.25 + this.rand() * 1.1;
    }
  }

  /** The ending: the glints she still carries lift out of her and rise. */
  private fireflies(n: number): void {
    for (let k = 0; k < n; k++) {
      const s = this.spark(
        1,
        (this.rand() - 0.5) * 20,
        (this.rand() - 0.5) * 30,
        (this.rand() - 0.5) * 26,
        -24 - 40 * this.rand(),
        3.6 + 3 * this.rand(),
        1.9 + 0.9 * this.rand(),
      );
      s.g = -7;
      s.drag = 0.25;
      s.sway = 20;
      s.e = 0.8;
      s.heat = 0.6;
      s.wait = 0.5 + (k / Math.max(1, n)) * 2.3 + this.rand() * 0.12;
      s.chest = true;
    }
  }

  /** Shows what lantern `i` asks: `need` stars round its glass (how many are filled follows her wallet). */
  private openPrice(i: number, need: number, seconds: number): void {
    const R = GOAL.refuse;
    const n = Math.max(0, Math.min(24, need));
    while (this.stars.length < n) {
      const root = new Container();
      const h = R.star;
      const w = h * 0.62;
      const q = h * 0.2;
      const pts = [0, -h, q, -q, w, 0, q, q, 0, h, -q, q, -w, 0, -q, -q];
      const outline = new Graphics();
      outline
        .poly(pts, true)
        .fill({ color: 0x0a1218, alpha: 0.45 })
        .stroke({ width: 1.1, color: 0xf0d4a0, alpha: 0.8, join: 'round' });
      const fill = new Graphics();
      fill.poly(pts, true).fill({ color: 0xffd98c }).stroke({ width: 0.9, color: 0xfff2d0, alpha: 0.85 });
      root.addChild(outline, fill);
      this.price.addChild(root);
      this.stars.push({ root, fill });
      this.starPop.push(0);
    }
    this.priceHold = Math.max(this.priceHold, seconds);
    if (this.priceLamp === i && this.priceT >= 0 && this.priceNeed === n) return;
    const pk = this.lamps[i]?.way ? 0.76 : 1;
    this.priceSpots = priceArc(n, R.radius * pk, R.pitch / pk, R.span);
    this.priceNeed = n;
    this.priceLamp = i;
    this.priceT = 0;
    this.priceHave = -1;
    for (let k = 0; k < this.stars.length; k++) {
      const st = this.stars[k] as { root: Container; fill: Graphics };
      const spot = this.priceSpots[k];
      st.root.visible = spot !== undefined;
      if (spot) st.root.position.set(spot[0], spot[1]);
    }
  }

  private draw(dt: number, clock: number, cam: CameraView, sim: SimView, bloom: number): void {
    const L = GOAL.lantern;
    const K = GOAL.kindle;
    const goal = sim.goal;
    const b = this.back;
    const f = this.front;
    b.begin();
    f.begin();
    b.uniform[3] = 1;
    f.uniform[3] = 1;

    // --- What a lit lantern does to its place: a pool of warm light on the surfaces round it,
    // flowers with a light in each, fireflies, and the dormant glints near it stirring.
    const sf = this.surface;
    sf.begin();
    const P = L.pool;
    const picks = sim.scene.pickups ?? [];
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i] as Lamp;
      const v = lamp.view;
      const lit = lamp.lit ? smooth(0, 0.7, lamp.catchT) : lamp.charge * 0.25;
      if (lit <= 0.003) continue;
      const breath = 1 + 0.04 * Math.sin((clock * TAU) / L.breath + lamp.seed * TAU);
      const wide = 1 + GOAL.ending.wide * this.grove + 0.12 * lamp.pulse;
      sf.light(
        cam,
        v.beadX,
        v.y - 70,
        P.rx * wide * lamp.k,
        P.ry * wide * lamp.k,
        P.gain * lit * breath * (1 + 0.5 * lamp.pulse),
        0,
      );
      // A tighter, stronger heart to the pool under the glass.
      sf.light(
        cam,
        v.beadX,
        v.y - 40 * lamp.k,
        P.rx * 0.42 * lamp.k,
        P.ry * 0.5 * lamp.k,
        P.gain * 0.35 * lit * breath,
        0.3,
      );
      if (!this.inView(cam, v.x, v.y - 60, 420)) continue;
      const al = lamp.alive;
      // Safe ground: a slow warm breath lying on the ground as far as creatures keep away. Only the
      // surfaces take it (the air stays dark) and it has no edge: it thins out at the reach.
      const S = L.safe;
      const reach = tuning.goal.sanctuaryPx;
      const sb = 1 - S.depth * (0.5 + 0.5 * Math.cos((clock * TAU) / S.breath + lamp.seed * TAU));
      const safe = al * smooth(1.2, 3.5, lamp.catchT) * sb;
      const cl = Math.max(v.x - reach * 1.45, lamp.edgeL - 30);
      const cr = Math.min(v.x + reach * 1.45, lamp.edgeR + 30);
      sf.light(cam, (cl + cr) / 2, v.y - 6, (cr - cl) / 2, S.height, S.ground * safe, 0.15);
      for (const dir of [-1, 1]) {
        const room = dir < 0 ? v.x - lamp.edgeL : lamp.edgeR - v.x;
        const half = Math.min(reach, room) / 2;
        if (half > 12) b.quad(K_FLARE, v.x + dir * half, v.y - 5, half * 1.15, 7, S.seam * safe, 0, 0);
        // Turned away: the ground at the edge answers once, softly.
        if (lamp.ward > 0.02 && dir === lamp.wardSide && room > reach * 0.6) {
          const k = 1 - lamp.ward;
          const wx = v.x + dir * Math.min(reach, room - 8);
          b.quad(K_FLARE, wx, v.y - 5, 40 + 50 * k, 8, S.turn * lamp.ward * smooth(0, 0.08, k) * al, 0, 0.1);
          sf.light(cam, wx, v.y - 8, 80, 40, S.turn * lamp.ward * al, 0.2);
        }
      }
      const fl = lamp.life.lights;
      for (let k = 0; k < fl.length; k += 3) {
        const o = fl[k + 2] as number;
        if (o <= 0.02) continue;
        const tw = 0.85 + 0.15 * Math.sin(clock * 2.1 + k);
        b.quad(K_SPARK, fl[k] as number, fl[k + 1] as number, 3.4, 3.4, 0.7 * o * tw, 0, 0.7);
        b.quad(K_FLARE, fl[k] as number, fl[k + 1] as number, 12, 12, 0.22 * o * tw, 0, 0);
      }
      // Fireflies: slow loops round the lantern, each on its own clock.
      for (let k = 0; k < (lamp.way ? 3 : L.flies); k++) {
        const ph = (k * 0.618 + lamp.seed) % 1;
        const t = clock * (0.16 + 0.1 * ph) + ph * 40;
        const fx = v.beadX + Math.sin(t * 1.3 + ph * 9) * (70 + 90 * ph) + Math.sin(t * 3.1) * 14;
        const fy = v.y - 50 - 44 * ph + Math.sin(t * 1.9 + ph * 5) * 34 + Math.cos(t * 2.7) * 9;
        const blink = Math.max(0, Math.sin(t * 5.3 + ph * 20)) ** 0.6;
        const a = smooth(0.3 + 0.1 * k, 1, al) * (0.35 + 0.65 * blink);
        b.quad(K_SPARK, fx, fy, 2.8, 2.8, 0.75 * a, 0, 0.55);
        b.quad(K_FLARE, fx, fy, 9, 9, 0.16 * a, 0, 0);
      }
      // The glints that wait near it stir (theirs to draw; this is only its light on them).
      for (let k = 0; k < picks.length; k++) {
        const pk = picks[k];
        if (!pk || sim.pickups.timers[k] !== 0) continue;
        const d = Math.hypot(pk.x - v.beadX, pk.y - v.beadY);
        if (d > L.wakePx) continue;
        const a =
          al * (1 - smooth(L.wakePx * 0.6, L.wakePx, d)) * (0.6 + 0.4 * Math.sin(clock * 1.7 + k * 2.3));
        b.quad(K_FLARE, pk.x, pk.y, 15, 15, 0.3 * a, 0, 0.35);
        b.quad(K_SPARK, pk.x, pk.y, 3.2, 3.2, 0.4 * a, 0, 0.9);
      }
    }
    // The swell as a lamp catches runs over the surfaces too.
    if (this.swellT >= 0) {
      const k = Math.min(1, this.swellT / L.swell.seconds);
      const r = L.swell.from + (L.swell.to - L.swell.from) * (1 - (1 - k) ** 2.2);
      sf.light(
        cam,
        this.swell.x,
        this.swell.y - 30,
        r,
        r * 0.8,
        1.5 * smooth(0, 0.1, k) * (1 - k) ** 1.6,
        0.4,
      );
    }

    // --- The lanterns' own light.
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i] as Lamp;
      const v = lamp.view;
      if (!this.inView(cam, v.x, v.y - 60, 260)) continue;
      const x = v.beadX;
      const y = v.beadY;
      if (!lamp.lit) {
        // A dead ember, so it can be found; warmer as her glints gather in it.
        const c = lamp.charge;
        const canPay = sim.pickups.count >= lamp.cost;
        let ember = L.ember * (0.72 + 0.28 * Math.sin(clock * 1.2 + lamp.seed * 9));
        if (canPay) ember += L.emberNear * lamp.near * (0.85 + 0.15 * Math.sin(clock * 3.1));
        // It has noticed her: an ember wakes in the bulb, stronger the nearer her wallet is to its
        // price, and three of the glints she carries strain toward it and fall back.
        const N = L.notice;
        const nt = lamp.notice;
        if (nt > 0.01) {
          const share = Math.min(1, sim.pickups.count / Math.max(1, lamp.cost));
          const flutter = 0.8 + 0.2 * Math.sin(clock * 5.3 + lamp.seed * 7) * Math.sin(clock * 1.9);
          ember += N.ember * nt * (0.4 + 0.6 * share) * flutter;
          b.quad(K_FLARE, x, y, 17, 17, N.halo * nt * (0.5 + 0.5 * share) * flutter, 0, 0);
          const n = Math.min(N.tug, sim.pickups.count);
          const tx = x - this.chestX;
          const ty = y - this.chestY;
          const len = Math.hypot(tx, ty) || 1;
          for (let k = 0; k < n; k++) {
            const ph = (clock / N.tugSeconds + k / N.tug + lamp.seed) % 1;
            // Out slowly, hang, snap back.
            const out = smooth(0, 0.55, ph) * (1 - smooth(0.72, 1, ph));
            const u = N.reach * out * nt * (0.8 + 0.2 * ((k * 0.618) % 1));
            const wob = Math.sin(clock * 3.1 + k * 2.1) * 7 * out;
            const gx = this.chestX + tx * u - (ty / len) * wob;
            const gy = this.chestY + ty * u + (tx / len) * wob - 10 * Math.sin(Math.PI * u);
            const a = nt * smooth(0, 0.12, ph) * (1 - smooth(0.9, 1, ph));
            f.quad(K_GLINT, gx, gy, 46 * N.tugSize, 46 * N.tugSize, a, (k * 0.37) % 1, 0);
            // A thread of sparks back to her: it is hers, held.
            for (let j = 1; j <= 2; j++)
              f.quad(
                K_SPARK,
                this.chestX + (gx - this.chestX) * (1 - j * 0.3),
                this.chestY + (gy - this.chestY) * (1 - j * 0.3),
                2.2 - 0.5 * j,
                2.2 - 0.5 * j,
                0.5 * a * out,
                0,
                0.4,
              );
          }
        }
        if (lamp.flicker >= 0) {
          // Refused: a dry flicker, two or three catches, and it is out again.
          const k = lamp.flicker / 0.75;
          ember += 1.25 * (1 - k) ** 1.3 * (0.35 + 0.65 * Math.abs(Math.sin(k ** 0.8 * 17)));
        }
        const e = ember * (1 - c) + c * (0.5 + 0.5 * c) + 0.3 * lamp.beat * (c > 0 ? 1 : 0);
        b.quad(K_SPARK, x, y, 4.2 + 2.6 * c, 4.2 + 2.6 * c, e, 0, c * 0.85 + (lamp.flicker >= 0 ? 0.25 : 0));
        if (c > 0.02) b.quad(K_FLARE, x, y, 20 + 10 * c, 20 + 10 * c, 0.22 * c + 0.1 * lamp.beat, 0, 0);
        continue;
      }
      // Lit: a bead with a slow breath in a tight halo; the catch flares it.
      const t = lamp.catchT;
      const flare = t < 3 ? smooth(0, 0.07, t) * Math.exp(-Math.max(0, t - 0.07) / (K.flare * 0.36)) : 0;
      const breath = 1 + L.breathe * Math.sin((clock * TAU) / L.breath + lamp.seed * TAU);
      const rest = this.restsAt(goal, i) ? L.restGain : 1;
      const up = smooth(0, 0.12, t);
      const e =
        L.beadGain * breath * rest * up + (K.flarePeak - 1) * flare + 0.7 * lamp.pulse + 0.25 * lamp.beat;
      const size =
        L.bead *
        (0.4 + 0.6 * lamp.k) *
        (1 + 0.5 * flare + 0.25 * lamp.pulse) *
        (0.96 + 0.04 * breath) *
        (rest > 1 ? 1.06 : 1);
      b.quad(K_SPARK, x, y, size, size, e, 0, 1);
      const hs = (L.halo + (K.flareHalo - L.halo) * flare + 16 * lamp.pulse) * (0.3 + 0.7 * lamp.k);
      b.quad(
        K_FLARE,
        x,
        y,
        hs,
        hs,
        (L.haloGain * breath * rest + 0.55 * flare + 0.3 * lamp.pulse) * up,
        0,
        0.12 * flare,
      );
    }

    // --- The swell that runs out along the ground as a lamp catches.
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i] as Wave;
      const W = K.wave;
      w.t += dt;
      const k = w.t / W.seconds;
      if (k >= 1) {
        this.waves.splice(i, 1);
        continue;
      }
      const reach = W.reach * (1 - (1 - k) ** 2.4);
      for (const dir of [-1, 1]) {
        for (let j = 0; j < 3; j++) {
          const d = reach - j * W.length * 0.8;
          if (d <= 6) continue;
          const x = w.x + dir * d;
          // It stops where the ground does.
          const room = dir < 0 ? x - w.l : w.r - x;
          const e = W.gain * (1 - k) ** 1.5 * smooth(0, 0.12, k) * (1 - j * 0.3) * smooth(-10, 40, room);
          b.quad(K_FLARE, x, w.y - W.height * 0.5, W.length, W.height, e, 0, 0);
        }
      }
    }

    // --- Glints on their way into a lantern (and light on its way to her).
    for (const fl of this.flows) {
      if (!fl.on) continue;
      const lamp = this.lamps[fl.lamp];
      if (!lamp) continue;
      const u = fl.age / fl.dur;
      // A short tail: the same path, a little earlier.
      for (let j = 0; j < 4; j++) {
        const uu = u - j * 0.035;
        if (uu <= 0) break;
        this.flowAt(fl, lamp, uu);
        const dim = (this.tmp[2] as number) * (1 - j * 0.24) * Math.min(1, uu * 9);
        const size = (fl.out ? 2.6 : 3.7) * (1 - j * 0.17);
        // Behind her it would be lost: flows are drawn over the hero.
        f.quad(
          K_SPARK,
          this.tmp[0] as number,
          this.tmp[1] as number,
          size,
          size,
          (fl.out ? 0.6 : 0.95) * dim,
          0,
          j === 0 ? 0.85 : 0.4,
        );
      }
    }

    // --- The price a lantern asks: a crown of stars round its glass, filled as far as her wallet
    // goes. It stays while she stands there short, and for a few seconds after.
    const priceLamp = this.lamps[this.priceLamp];
    if (this.priceT >= 0 && priceLamp) {
      const R = GOAL.refuse;
      this.priceT += dt;
      this.priceHold -= dt;
      if (priceLamp.lit || this.priceHold <= -R.fadeOut) {
        this.priceT = -1;
        this.priceHold = 0;
        this.price.visible = false;
      } else {
        const t = this.priceT;
        const gone = smooth(0, R.fadeOut, -this.priceHold);
        const have = Math.max(0, Math.min(this.priceNeed, sim.pickups.count));
        // A glint gathered while it shows fills the next star.
        if (this.priceHave >= 0) for (let i = this.priceHave; i < have; i++) this.starPop[i] = 1;
        this.priceHave = have;
        this.price.visible = true;
        this.price.position.set(priceLamp.view.beadX, priceLamp.view.beadY - 5);
        for (let i = 0; i < this.priceNeed; i++) {
          const st = this.stars[i];
          const spot = this.priceSpots[i];
          if (!st || !spot) continue;
          const inn = smooth(0, 0.22, t - 0.1 - i * R.step);
          const a = inn * (1 - gone);
          const pop = (this.starPop[i] as number) * Math.exp(-dt * 6);
          this.starPop[i] = pop;
          const filled = i < have;
          st.fill.visible = filled;
          st.root.alpha = a;
          st.root.scale.set((filled ? 1 + 0.45 * (1 - inn) : 0.82 + 0.18 * inn) * (1 + 0.6 * pop));
          if (filled)
            f.quad(
              K_SPARK,
              this.price.x + spot[0],
              this.price.y + spot[1],
              7,
              7,
              (0.4 + 0.8 * pop) * a,
              0,
              0.3 + 0.5 * pop,
            );
        }
      }
    }

    // --- What she dropped when she faded: a huddle of quiet glints waiting where she fell (drops.ts).
    this.drops.update(dt, clock, cam, sim, b, f, sf, this.chestX, this.chestY);

    // --- Sparks and motes.
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait > 0) continue;
        if (s.chest) {
          s.x += this.chestX;
          s.y += this.chestY;
          s.chest = false;
        }
      }
      s.life -= dt;
      const age = s.max - s.life;
      s.vy += s.g * dt;
      if (s.drag > 0) {
        const d = Math.exp(-s.drag * dt);
        s.vx *= d;
        s.vy *= d;
      }
      s.x += (s.vx + Math.sin(age * 2.3 + s.seed * 30) * s.sway) * dt;
      s.y += s.vy * dt;
      const k = s.life / s.max;
      const env = Math.min(1, age * 5) * Math.min(1, k * 2.6);
      const tw = s.sway > 0 ? 0.75 + 0.25 * Math.sin(age * 5.1 + s.seed * 50) : 1;
      const size = s.size * (0.6 + 0.4 * k);
      (s.layer === 1 ? f : b).quad(
        K_SPARK,
        s.x,
        s.y,
        size,
        size,
        s.e * env * tw,
        0,
        s.heat * (0.4 + 0.6 * k),
      );
    }

    // --- The heart's light, between its rear and front straps.
    const h = this.heart;
    const c = this.core;
    const lb = this.lightBatch;
    c.begin();
    lb.begin();
    if (h) {
      const H = GOAL.heart;
      const lvl = this.level;
      if (this.inView(cam, h.x, h.y - 40, 400)) {
        // Asleep and touched: a slow dull pulse deep inside.
        const dull = this.sleepT >= 0 ? Math.sin(Math.PI * Math.min(1, this.sleepT / 2.2)) ** 1.5 : 0;
        const breath = 1 + 0.07 * Math.sin(clock * 1.5);
        const gain = H.coreGain + (H.coreBloom - H.coreGain) * bloom;
        const seam = this.seam * (0.85 + 0.15 * Math.sin(clock * 1.1));
        const e = lvl * gain * breath + 0.7 * dull + 0.55 * seam;
        if (seam > 0.01) c.quad(K_FLARE, h.coreX, h.coreY - 6, 40, 52, 0.75 * seam, 0, 0.1);
        if (seam > 0.01) b.quad(K_FLARE, h.coreX, h.coreY - 12, 30, 46, 0.42 * seam, 0, 0.2);
        // Its light on the shrine and the ground: a little per lantern while it sleeps, a pool awake.
        sf.light(cam, h.x, h.y - 90, 190, 170, 0.5 * seam, 0.2);
        sf.light(
          cam,
          h.x,
          h.y - 130,
          H.poolRx * (1 + GOAL.ending.wide * this.grove),
          H.poolRy * (1 + GOAL.ending.wide * this.grove),
          H.pool * lvl * breath,
          H.poolWhite,
        );
        // Through the seams of the shut bud.
        if (dull > 0.01) b.quad(K_FLARE, h.coreX, h.coreY - 4, 34, 40, 0.3 * dull, 0, 0);
        const size = H.core * (0.8 + 0.2 * lvl + 0.25 * bloom);
        if (e > 0.004) {
          c.quad(
            K_FLARE,
            h.coreX,
            h.coreY,
            H.halo * (0.6 + 0.4 * lvl + 0.35 * bloom),
            H.halo * (0.6 + 0.4 * lvl + 0.35 * bloom),
            (H.haloGain * lvl * (1 + 0.5 * bloom) + 0.3 * dull) * breath,
            0,
            0,
          );
          c.quad(K_SPARK, h.coreX, h.coreY, size, size, e, 0, lvl);
        }
        // The wicks: one per lantern.
        for (let i = 0; i < h.wicks.length; i++) {
          const wk = h.wicks[i];
          if (!wk) continue;
          const t = this.wickT[i] as number;
          const lit = goal.lanterns[i]?.lit === true;
          // Touched asleep, they show one after another which burn.
          const show =
            this.sleepT >= 0 ? Math.sin(Math.PI * smooth(0, 1, (this.sleepT - 0.25 - i * 0.28) / 1.2)) : 0;
          if (lit) {
            const up = smooth(0.5, 0.62, t);
            const flare = t < 3 ? up * Math.exp(-Math.max(0, t - 0.62) / 0.22) : 0;
            const e2 =
              up * (0.8 + 0.07 * Math.sin(clock * 1.9 + i * 2.1)) + 1.1 * flare + 0.5 * show + 0.5 * bloom;
            b.quad(K_SPARK, wk.x, wk.y, 3.6 + 2 * flare, 3.6 + 2 * flare, e2, 0, 1);
            b.quad(
              K_FLARE,
              wk.x,
              wk.y,
              15 + 12 * flare,
              15 + 12 * flare,
              (0.24 + 0.4 * flare + 0.15 * show) * up,
              0,
              0,
            );
          } else {
            b.quad(
              K_SPARK,
              wk.x,
              wk.y,
              3,
              3,
              0.16 + 0.9 * show * (0.4 + 0.6 * Math.abs(Math.sin(this.sleepT * 14))),
              0,
              0,
            );
          }
        }
      }

      // --- Waking: one soft wave of warm light through the forest, away from the heart.
      const W = H.wave;
      const R = this.wakeT * W.speed;
      if (this.awake && R < W.reach + W.width * 2) {
        const fade = (1 - smooth(W.reach * 0.9, W.reach, R)) * smooth(0, 300, R);
        for (const dir of [-1, 1]) {
          const x = h.x + dir * R;
          if (Math.abs(x - cam.x) > VIEW_W / 2 / cam.zoom + W.width) continue;
          // Over every surface in its way, so it cannot be missed.
          sf.light(cam, x, cam.y, W.width, 900, W.surface * fade, 0.25);
          lb.quad(K_FLARE, x, h.y - 330, W.width, W.height, W.gain * fade, 0, 0);
          lb.quad(
            K_FLARE,
            x - dir * W.width * 0.8,
            h.y - 330,
            W.width * 1.3,
            W.height,
            W.gain * 0.5 * fade,
            0,
            0,
          );
        }
        for (const lamp of this.lamps) {
          if (lamp.waved || !lamp.lit || Math.abs(lamp.view.x - h.x) > R) continue;
          lamp.waved = true;
          lamp.pulse = 1;
        }
      }

      // --- The ending: light climbs the hollow tree and spreads under the canopy; the glints left
      // in the forest wake.
      if (this.endT >= 0) {
        const E = this.endT;
        // Warmth on every surface in view, widest at the heart.
        sf.light(
          cam,
          cam.x,
          h.y - 120,
          1700 / cam.zoom,
          900 / cam.zoom,
          GOAL.ending.surface * this.grove,
          GOAL.ending.surfaceWhite,
        );
        const list = sim.scene.pickups ?? [];
        const reach = 620 * (E - 0.7);
        for (let i = 0; i < list.length; i++) {
          const pk = list[i];
          if (!pk || sim.pickups.timers[i] !== 0 || !this.inView(cam, pk.x, pk.y, 40)) continue;
          const d = Math.hypot(pk.x - h.x, pk.y - h.y);
          const a = smooth(0, 380, reach - d);
          if (a <= 0) continue;
          const tw = 0.7 + 0.3 * Math.sin(clock * 2.2 + i * 1.7);
          b.quad(K_FLARE, pk.x, pk.y, 19, 19, 0.36 * a * tw, 0, 0.4);
          // They wake and give off motes that drift up.
          if (this.rand() < dt * 0.9 * a) this.rise(pk.x, pk.y - 4, 0.7, 4);
        }
      }
    }
    sf.end();
    b.end(clock);
    f.end(clock);
    c.end(clock);
    lb.end(clock);
  }
}
