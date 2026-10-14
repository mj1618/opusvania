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
import { hudLink } from '../hud/link';
import type { PointLight } from '../lights';
import { GlintBatch, K_FLARE, K_GLINT, K_SPARK } from '../pickups/batch';
import { zoneMix, zoneWeights } from '../scene/lib/fx-zones';
import { wind } from '../scene/lib/look';
import { camLink } from './camera';
import { GOAL, MAX_QUADS } from './config';
import { DropsView } from './drops';
import { EmberKey } from './ember';
import { GuideMoths, wayTo } from './guide';
import { HeartView } from './heart';
import { LanternView, Moth, WAY_SCALE, WAY_STYLES } from './lantern';
import { LanternLife } from './life';
import { bezier, Path, priceArc, sleepBreath, smooth, streamCount } from './logic';
import { SurfaceLight } from './surface';
import { Carving, GroveFlies, Veins } from './wake';

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
  /** What it still asks: its price less what she has given it by hand (`LanternState.given`), set every frame. */
  cost: number;
  /** Its whole price (the crown shows this many: the given ones kept lit, then her wallet). */
  base: number;
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
  /** Its id in the scene (the guide's routes are keyed by it). */
  id: string;
  /** A wayside lamp's cold light while it sleeps: a breath behind it and a point in the glass. */
  cold: Sprite | null;
  coldCore: Sprite | null;
  /** Seconds since she re-formed at it (it pays for that with its flame for a moment), and how low that holds it now (0..1). */
  gutterT: number;
  gutter: number;
  /** It wants the ember and she does not have it: no glints will light it (its price is the ember mark). */
  keyless: boolean;
}

/** A glint on its way from her chest into a lantern's glass (or, resting, light from the glass to her). */
interface Flow {
  on: boolean;
  lamp: number;
  age: number;
  dur: number;
  seed: number;
  out: boolean;
  /** A broken channel: the glint falls back to her from (bx, by). */
  back: boolean;
  bx: number;
  by: number;
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
/** A creature in one of these modes is minding its own business (the price ring may show near it). */
const CALM: ReadonlySet<string> = new Set(['walk', 'pause', 'hover', 'rest', 'return']);
/** A flame of the price she has given by hand: kept lit, a deeper amber than one her wallet would fill. */
const GIVEN_TINT = 0xff9f5c;

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
  /** Ember-moths that show the way to the nearest dark lantern (guide.ts). */
  readonly guide = new GuideMoths();
  private heartGuideIn = 0;
  /** A flight is due to leave lamp `guideFrom`'s glass in `guideIn` s (-1 = none due). */
  private guideIn = -1;
  private guideFrom = -1;
  /** Where the flight would lead, how near she has come to it, and for how long she has come no nearer. */
  /**
   * Cold motes that fall from the next dark lantern's glass over the nearest long drop (the shaft
   * under the crown, the far bluff's face): from below, something up there is letting light go.
   */
  private readonly falls: Array<{ s: Sprite; t: number; x0: number; y0: number; x1: number; seed: number }> =
    [];
  private fallIn = 0;
  /** The offering: glints on their way from her into the awake heart, and seconds since each tier woke (-1 = not yet). */
  private readonly offers: Array<{ t: number; dur: number; sx: number; sy: number; seed: number }> = [];
  private readonly tierT = [-1, -1, -1];
  private offerBeat = 0;
  /** The wake's own pieces (wake.ts): veins to the lanterns, the wing-stone's moth, the ring's fireflies. */
  private readonly veins: Veins | null = null;
  private readonly carving: Carving | null = null;
  private readonly flies: GroveFlies | null = null;
  /** The shrine's flowers (the offering's first tier opens them). */
  private readonly heartLife: LanternLife | null = null;
  /** Per vein: its lantern has answered this wake. */
  private readonly veinDone: boolean[] = [];
  private readonly ringOut = [0, 0];
  /** The price ring: which light should show its price (-1 none), how far it is in (0..1), seconds since a creature near was alert. */
  private priceWant = -1;
  private priceA = 0;
  private calmT = 10;
  private forceLamp = -1;
  private forceT = 0;
  private guideKey = '';
  private guideBest = 0;
  private guideIdle = 0;
  private guideSp = 0;
  /** The ember a lantern wants (ember.ts), if the scene has one; seconds until a flight leaves that lantern to lead her back to it (-1 = none due). */
  readonly ember: EmberKey | null = null;
  private keyCallIn = -1;
  /** Seconds until, the ember taken, a flight leaves her shoulder for the lantern that wants it (-1 = none due). */
  private keyLeadIn = -1;
  /** The wait in the waking heart: seconds since `heartWait` (-1 = not waiting), since `heartReady` (-1 = not yet), 0..1 shown. */
  private waitT = -1;
  private readyT = -1;
  private waitA = 0;
  /** Cold points on the heart's dark wicks. */
  private readonly wickCold: Sprite[] = [];
  private frame = -1;
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
  private camNow: CameraView = { x: 0, y: 0, zoom: 1 };

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
      // A wayside lamp asleep keeps a cold light, so it can be found from across the screen.
      // (Since playtest 4 the three lanterns too: the far one was a dark blue wire on near-black.)
      const cold: Sprite | null = glow(GOAL.lamp.cold);
      const coldCore: Sprite | null = glow(GOAL.lamp.coldCore);
      if (cold) layers.back.addChild(cold);
      layers.back.addChild(life.root, view.root, moth.root);
      if (coldCore) layers.back.addChild(coldCore);
      for (const c of circlers) layers.back.addChild(c.root);
      this.lamps.push({
        view,
        moth,
        life,
        circlers,
        mist,
        alive: 0,
        cost: way ? lampCost(l, tuning.goal) : lanternCost(l, tuning.goal),
        base: way ? lampCost(l, tuning.goal) : lanternCost(l, tuning.goal),
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
        id: l.id,
        cold,
        coldCore,
        gutterT: LONG_AGO,
        gutter: 0,
        keyless: false,
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
      // The ground the heart stands on, for its flowers.
      let hl = scene.heart.x - 620;
      let hr = scene.heart.x + 620;
      for (const r of scene.solids) {
        if (r.y !== scene.heart.y || scene.heart.x < r.x || scene.heart.x > r.x + r.w) continue;
        hl = Math.max(hl, r.x);
        hr = Math.min(hr, r.x + r.w);
      }
      this.heartLife = new LanternLife(scene.heart.x, scene.heart.y, hl, hr, 0.41, GOAL.offer.flowers, 0.45);
      layers.back.addChild(this.heartLife.root);
      layers.back.addChild(h.back, g.cold, this.core.mesh, h.front, g.gold);
      const routes: Record<string, { via?: string; pts: number[][] }> = {};
      for (const l of lanterns) {
        const r = GOAL.wake.veins.routes[l.id];
        if (r) routes[l.id] = r;
      }
      this.veins = new Veins(routes, scene.solids);
      this.carving = new Carving(scene.heart.x, scene.heart.y);
      this.flies = new GroveFlies(scene, scene.heart.x, scene.heart.y);
      for (let i = 0; i < h.wicks.length; i++) {
        this.wickT.push(LONG_AGO);
        const c = glow(GOAL.lamp.coldCore);
        this.wickCold.push(c);
        layers.back.addChild(c);
      }
    }
    for (let i = 0; i < GOAL.lantern.fall.n; i++) {
      const sp = glow(GOAL.lamp.coldCore);
      layers.front.addChild(sp);
      this.falls.push({ s: sp, t: -1, x0: 0, y0: 0, x1: 0, seed: 0 });
    }
    for (let i = 0; i < 40; i++) this.offers.push({ t: -1, dur: 1, sx: 0, sy: 0, seed: 0 });
    for (let i = 0; i < 48; i++)
      this.flows.push({ on: false, lamp: 0, age: 0, dur: 1, seed: 0, out: false, back: false, bx: 0, by: 0 });
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
      for (const m of this.guide.moths) layers.front.addChild(m.view.root);
      const at = EmberKey.find(scene);
      if (at && this.lamps[at.lantern]) {
        this.ember = new EmberKey(scene, at, layers.front, () => glow(GOAL.lamp.coldCore));
        layers.front.addChild(this.ember.mark);
      }
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
    if (f.back) {
      // A broken channel: it hangs a moment where it was, drops, and falls back into her.
      const k = Math.max(0, u) ** 1.7;
      const mx = (f.bx + this.chestX) / 2 + (f.seed - 0.5) * 30;
      const my = Math.max(f.by, this.chestY) + 22 + f.seed * 16;
      const a = (1 - k) * (1 - k);
      const b = 2 * (1 - k) * k;
      out[0] = a * f.bx + b * mx + k * k * this.chestX;
      out[1] = a * f.by + b * my + k * k * this.chestY;
      out[2] = 1;
      return;
    }
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
      v.samplePath(foot, out);
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
    v.samplePath(foot + (1 - foot) * k ** 1.2, out);
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
      f.back = false;
      return;
    }
  }

  /**
   * The channel broke: what was on its way stops and falls back into her, the glass gives back what
   * had reached it, and it flickers dry. (As a few 2 px sparks dropping it could not be seen at a
   * run: playtest 3 crossed a lamp, started and broke the channel, and saw nothing.)
   */
  private spill(i: number, lamp: Lamp): void {
    let n = 0;
    for (const f of this.flows) {
      if (!f.on || f.lamp !== i || f.out || f.back) continue;
      this.flowAt(f, lamp, Math.min(1, Math.max(0, f.age / f.dur)));
      f.back = true;
      f.bx = this.tmp[0] as number;
      f.by = this.tmp[1] as number;
      f.age = -0.04 * n;
      f.dur = 0.62 + 0.2 * this.rand();
      n++;
    }
    const m = Math.min(6, lamp.arrived);
    for (let k = 0; k < m; k++) {
      for (const f of this.flows) {
        if (f.on) continue;
        f.on = true;
        f.lamp = i;
        f.out = false;
        f.back = true;
        f.seed = this.rand();
        f.bx = lamp.view.beadX + (this.rand() - 0.5) * 8;
        f.by = lamp.view.beadY + 2;
        f.age = -0.05 * (n + k) - 0.06;
        f.dur = 0.7 + 0.2 * this.rand();
        break;
      }
    }
    if (n + m > 0) {
      lamp.flicker = 0;
      lamp.view.kick((lamp.seed - 0.5) * 1.6 + 1.2 * (this.chestX < lamp.view.x ? 1 : -1));
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
    this.camNow = cam;
    // Vesper says where the light leaves her (her open palm while she kindles); other skins: the chest.
    this.chestX = vesperLink.live ? vesperLink.offerX : p.cx;
    this.chestY = vesperLink.live ? vesperLink.offerY : p.cy - 8;
    vesperLink.goal = goal;
    const wallet = sim.pickups.count;
    // The HUD has no camera: tell it where she is on screen.
    hudLink.on = true;
    hudLink.x = VIEW_W / 2 + (p.cx - cam.x) * cam.zoom;
    hudLink.y = VIEW_H / 2 + (p.cy - cam.y) * cam.zoom;
    hudLink.zoom = cam.zoom;
    camLink.on = true;
    camLink.x = p.cx;
    camLink.y = p.cy;
    // A restart: the moths that were out are gone.
    if (sim.frame < this.frame) {
      this.guide.clear();
      this.guideIn = -1;
      this.guideKey = '';
      this.keyCallIn = -1;
      this.keyLeadIn = -1;
      this.waitT = -1;
      this.readyT = -1;
      for (const lamp of this.lamps) lamp.gutterT = LONG_AGO;
    }
    this.frame = sim.frame;

    // --- What happened.
    let kindled = -1;
    for (const e of sim.events) {
      if (e.type === 'lanternKindle' || e.type === 'lampKindle') {
        kindled = this.lampOf(e.x, e.y);
        const lamp = this.lamps[kindled];
        if (lamp) {
          // Caught while she was already on her way (the sim's pledge: the pod's glints landed
          // after she had run on): what was still owed crosses to it from wherever she is.
          if (e.away) {
            const owed = Math.min(8, Math.max(0, e.cost - lamp.arrived));
            for (let k = 0; k < owed; k++) this.startFlow(kindled, false, 0.3 + 0.05 * k);
          }
          this.catch(lamp);
          // The moths that led here have done it; a new flight leaves this glass for the next.
          if (e.type === 'lanternKindle') {
            this.guide.release();
            this.guideFrom = kindled;
            this.guideIn = GOAL.guide.first;
          }
        }
      } else if (e.type === 'lanternCancel' || e.type === 'lampCancel') {
        const i = this.lampOf(e.x, e.y);
        const lamp = this.lamps[i];
        if (lamp) this.spill(i, lamp);
      } else if (e.type === 'lanternRefuse' || e.type === 'lampRefuse') {
        const i = this.lampOf(e.x, e.y);
        const lamp = this.lamps[i];
        if (!lamp) continue;
        lamp.view.kick(p.cx < lamp.view.x ? -1.7 : 1.7);
        this.forceLamp = i;
        this.forceT = e.show > 0 ? e.show / 60 : GOAL.refuse.hold;
        // It wants the ember, not her glints: no dry flicker, the glass only shudders (ember.ts shows what it lacks).
        if (e.type === 'lanternRefuse' && e.key) {
          if (this.keyCallIn < 0) this.keyCallIn = GOAL.ember.callIn;
          continue;
        }
        lamp.flicker = 0;
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
      } else if (e.type === 'lanternNotice' && e.key) {
        // The summit lantern has seen that she comes without the ember: a flight will lead her back.
        if (this.keyCallIn < 0) this.keyCallIn = GOAL.ember.callIn + 0.6;
      } else if (e.type === 'lanternKey') {
        // She has the ember: the moths that waited on it lead on to the lantern it belongs to.
        this.keyLeadIn = 0.9;
      } else if (e.type === 'heartWait') {
        this.waitT = 0;
        this.readyT = -1;
      } else if (e.type === 'heartReady') {
        if (this.waitT >= 0) this.readyT = 0;
      } else if (e.type === 'lanternGift' || e.type === 'lampGift') {
        // A glint she gave it by hand has poured in: the glass beats, its price stands and the flame it paid for lights.
        const i = this.lampOf(e.x, e.y);
        const lamp = this.lamps[i];
        if (lamp) {
          lamp.beat = 1;
          lamp.pulse = Math.max(lamp.pulse, 0.5);
          this.forceLamp = i;
          this.forceT = Math.max(this.forceT, GOAL.refuse.giftHold);
          if (e.given > 0) this.starPop[e.given - 1] = 1;
        }
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
        this.heartGuideIn = 0.7;
      } else if (e.type === 'reform') {
        // She re-forms at a light and it pays for her: its flame gutters low and comes back slowly.
        for (let i = 0; i < this.lamps.length; i++) {
          const lamp = this.lamps[i] as Lamp;
          if (lamp.lit && this.restsAt(goal, i) && Math.abs(lamp.view.x - e.x) < 80) {
            lamp.gutterT = 0;
            lamp.view.kick(1.6);
          }
        }
        // And what light she had left falls off her, dull.
        for (let k = 0; k < GOAL.reform.embers; k++) {
          const s = this.spark(
            1,
            p.cx + (this.rand() - 0.5) * 26,
            p.cy - 18 + (this.rand() - 0.5) * 34,
            (this.rand() - 0.5) * 40,
            -24 - 20 * this.rand(),
            0.9 + 0.7 * this.rand(),
            2.1,
          );
          s.g = 150;
          s.drag = 1.2;
          s.e = 0.55;
          s.heat = 0;
          s.wait = 0.35 + k * 0.07;
        }
      } else if (e.type === 'heartWake') {
        this.awake = true;
        this.wakeT = 0;
        for (const lamp of this.lamps) lamp.waved = false;
        this.veinDone.length = 0;
        this.drift(cam, e.x, e.y);
        // The last lantern's light goes down to the heart: a stream of ember-moths from its glass
        // (only when the two can share a picture), and after the wake a flight leads her there.
        const from = this.lamps[kindled];
        if (from && this.heart && Math.hypot(from.view.beadX - e.x, from.view.beadY - e.y) < 1500) {
          this.guide.pour(
            wayTo(
              GOAL.guide.routes,
              'heart',
              from.view.beadX,
              from.view.beadY,
              this.heart.coreX,
              this.heart.coreY,
            ),
            GOAL.guide.pour.n,
          );
          this.guideFrom = kindled;
          this.guideIn = GOAL.guide.pourLead;
        }
      } else if (e.type === 'gather') {
        this.endT = 0;
        this.answered = false;
        // What she carries goes into the heart (the sim's offering); without one it lifts out of her as fireflies.
        if (!(e.offered > 0)) this.fireflies(Math.min(GOAL.ending.fireflies, wallet));
      } else if (e.type === 'heartOffer') {
        const O = GOAL.offer;
        for (let k = 0; k < Math.min(O.perStep, e.value); k++) {
          const m = this.offers.find((q) => q.t < 0);
          if (!m) break;
          m.dur = O.flight * (0.85 + 0.3 * this.rand());
          m.sx = this.chestX + (this.rand() - 0.5) * 14;
          m.sy = this.chestY + (this.rand() - 0.5) * 14;
          m.seed = this.rand();
          m.t = 0;
        }
      } else if (e.type === 'groveWake') {
        // What the grove answers the offering with (the sim's tiers: flowers, paths, canopy).
        if (e.tier >= 1 && e.tier <= 3) this.tierT[e.tier - 1] = 0;
      }
    }

    // --- The lanterns.
    const of = Math.max(1, Math.round(tuning.goal.channelFrames));
    let cand = -1;
    let candD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i] as Lamp;
      const s = this.stateOf(goal, i);
      if (!s) continue;
      const v = lamp.view;
      // Given by hand (the `offer` action) is paid: it asks only the rest.
      lamp.cost = Math.max(0, lamp.base - (s.given ?? 0));
      lamp.keyless = this.ember !== null && i === this.ember.lantern && this.ember.wanted(sim);
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
          // (Never more than she has: a pledged channel runs while her glints are still landing.)
          const want = Math.min(streamCount(s.channel, of, lamp.cost, K.by), wallet);
          while (lamp.emitted < want) {
            lamp.emitted++;
            this.startFlow(i, false, K.flight * (0.9 + 0.2 * this.rand()));
          }
        } else if (lamp.emitted > 0) this.spill(i, lamp);
      }
      const target = s.lit
        ? 1
        : lamp.base > 0
          ? Math.min(1, (lamp.base - lamp.cost + lamp.arrived) / lamp.base)
          : 0;
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
      // Standing at it with too little, the price shows again for as long as she stays.
      if (!s.lit && s.short > 0 && s.refused && (wallet < lamp.cost || lamp.keyless)) {
        this.forceLamp = i;
        this.forceT = Math.max(this.forceT, 0.5);
      }

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
      // Its price may stand round the glass: only the nearest dormant light in range shows one (a
      // lantern's from much farther: it is the destination).
      if (
        !s.lit &&
        dist < (lamp.way ? N.marksPx : N.crownPx) &&
        dist < candD &&
        this.inView(cam, v.x, v.y - 60, 0)
      ) {
        cand = i;
        candD = dist;
      }

      // It turns its light away from where she stands, so she never covers it (the way light climbs
      // it turns with it: `samplePath`).
      if (dist < L.turnPx && p.faded <= 0) {
        const off = p.cx - v.x;
        if (Math.abs(off) > L.turnSlack) v.turnTo = ((off > 0 ? -1 : 1) * v.style.side) as 1 | -1;
      }

      // She re-formed here: the flame pays for it, guttering low before it finds itself again.
      lamp.gutterT += dt;
      const RF = GOAL.reform;
      const gut = s.lit
        ? (1 - smooth(RF.low, RF.back, lamp.gutterT)) *
          (0.75 + 0.25 * Math.sin(lamp.gutterT * 31) * Math.sin(lamp.gutterT * 7.3))
        : 0;
      lamp.gutter = gut;
      // Asleep, a wayside lamp keeps a cold point of light and a breath of it behind.
      if (lamp.cold && lamp.coldCore) {
        const LP = lamp.way ? GOAL.lamp : GOAL.lantern.cold;
        const c0 = s.lit ? 0 : (1 - lamp.charge) * (0.82 + 0.18 * Math.sin(clock * 0.9 + lamp.seed * 9));
        const tw2 = Math.max(0, Math.sin(clock * 0.55 + lamp.seed * 5)) ** 6;
        lamp.cold.visible = c0 > 0.01;
        lamp.coldCore.visible = c0 > 0.01;
        lamp.cold.position.set(v.beadX, v.beadY - 6);
        lamp.cold.width = lamp.cold.height = LP.coldSize * (1 + 0.12 * tw2);
        lamp.cold.alpha = LP.coldAlpha * c0 * (1 - 0.5 * lamp.notice);
        lamp.coldCore.position.set(v.beadX, v.beadY);
        lamp.coldCore.width = lamp.coldCore.height = LP.coreSize * (1 + 0.35 * tw2);
        // (One that waits for the ember shows a cold hollow of its shape instead of the point.)
        lamp.coldCore.alpha =
          LP.coreAlpha * c0 * (0.8 + 0.2 * tw2) * (1 - 0.7 * lamp.notice) * (lamp.keyless ? 0 : 1);
      }

      // The glass on its thread.
      v.warmth = (s.lit ? Math.min(1, 0.75 + lamp.catchT * 2) : lamp.charge * 0.75) * (1 - 0.55 * gut);
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
      const li =
        L.light.intensity *
        lit *
        (0.94 + 0.06 * breath) *
        (1 + 0.5 * lamp.pulse + 0.12 * lamp.beat) *
        (1 - RF.light * gut);
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

    // --- Whose price shows: the nearest one's, and not while anything near her or it is roused.
    {
      const R = GOAL.refuse;
      const cl = this.lamps[cand];
      let roused = false;
      for (const e of sim.enemies ?? []) {
        if (e.gone || CALM.has(e.mode)) continue;
        if (e.mode === 'dead' && e.timer <= 0) continue;
        const ex = e.x + e.w / 2;
        const ey = e.y + e.h / 2;
        if (
          Math.hypot(ex - p.cx, ey - p.cy) < R.alertPx ||
          (cl && Math.hypot(ex - cl.view.x, ey - (cl.view.y - 40)) < R.alertPx)
        )
          roused = true;
      }
      this.calmT = roused ? 0 : this.calmT + dt;
      this.forceT -= dt;
      const fl = this.lamps[this.forceLamp];
      const forced = this.forceT > 0 && fl !== undefined && !fl.lit;
      this.priceWant = forced ? this.forceLamp : this.calmT > R.calm && !goal.gathered ? cand : -1;
      const shown = this.lamps[this.priceLamp];
      if (shown?.lit) this.priceA = 0;
      if (this.priceLamp !== this.priceWant || !shown) {
        this.priceA = Math.max(0, this.priceA - dt / R.fadeOut);
        if (this.priceA <= 0) {
          const next = this.lamps[this.priceWant];
          if (next) this.openPrice(this.priceWant, next.base);
          else {
            this.priceLamp = -1;
            this.priceT = -1;
          }
        }
      } else this.priceA = Math.min(1, this.priceA + dt / (forced ? 0.25 : R.fadeIn));
    }

    // --- Flows.
    for (const f of this.flows) {
      if (!f.on) continue;
      f.age += dt;
      if (f.age < f.dur) continue;
      f.on = false;
      const lamp = this.lamps[f.lamp];
      if (!lamp) continue;
      if (f.out || f.back) continue;
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
      // Awake it opens in stages (each a lurch on the bud's spring), then stands in bloom at the ending.
      let staged = H.awake;
      if (this.awake)
        for (const st of GOAL.wake.open) if (this.wakeT >= (st[0] as number)) staged = st[1] as number;
      const open = this.awake ? staged + (H.bloom - staged) * bloom : H.ajar * share;
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
      // The shrine's flowers: shut until the offering's first tier.
      const t1 = this.tierT[0] as number;
      this.heartLife?.update(dt, clock, goal.grove?.flowers ? (t1 < 0 ? LONG_AGO : t1) : -1);
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
      // Its light comes up in the same steps.
      let wake = 0;
      if (this.awake)
        for (const st of GOAL.wake.level)
          wake += (st[2] as number) * smooth(st[0] as number, st[1] as number, this.wakeT);
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
        const t3 = goal.grove?.canopy ? smooth(0.4, 3, this.tierT[2] as number) : 0;
        put(g.canopy, h.x - 260, h.y - 730, 2600, 360, (E.canopy * gr + GOAL.offer.canopy * t3) * slow);
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

    this.guideTick(dt, cam, sim);
    this.coldFall(dt, sim);
    this.draw(dt, clock, cam, sim, bloom);
    if (typeof performance !== 'undefined') this.cpuMs = performance.now() - t0;
  }

  /**
   * The ring that travels out from the waking heart: at (x, y) how much it swells a light now
   * (`out[0]`, 0..1) and how much of it has passed (`out[1]`, 0..1; 1 for good once it has).
   */
  private readonly ringAt = (x: number, y: number, out: number[]): void => {
    const h = this.heart;
    if (!h || !this.awake) {
      out[0] = 0;
      out[1] = 0;
      return;
    }
    const R = GOAL.wake.ring;
    const u = ((this.wakeT - R.start) * R.speed - Math.hypot(x - h.x, y - (h.y - 40))) / R.width;
    // Quick up, slow down.
    out[0] = u > 0 && u < 1 ? Math.sin(Math.PI * u ** 0.6) ** 1.4 : 0;
    out[1] = smooth(0, 1, u);
  };

  /** How much brighter a small light at (x, y) burns for the ring: its swell as it passes, then a step higher for good. */
  private ringGain(x: number, y: number): number {
    const R = GOAL.wake.ring;
    this.ringAt(x, y, this.ringOut);
    return 1 + R.swell * (this.ringOut[0] as number) + R.step * (this.ringOut[1] as number);
  }

  private setLight(id: string, light: PointLight, on: boolean, was: boolean): void {
    if (on && !was) this.ctx.lights.set(id, light);
    else if (!on && was) this.ctx.lights.remove(id);
  }

  /** The sim's record of lamp `i` (a lantern, or after them a wayside lamp). */
  /**
   * Where a light's glass hangs now (world px), for the giving renderer: lantern `i` of
   * `scene.lanterns`, or wayside lamp `i` of `scene.lamps`. Null if there is none.
   */
  glass(lamp: boolean, i: number): { x: number; y: number } | null {
    const l = this.lamps[lamp ? this.nLanterns + i : i];
    if (!l || (lamp ? !l.way : l.way)) return null;
    return { x: l.view.beadX, y: l.view.beadY };
  }

  /** The heart's core (world px), or null. */
  heartCore(): { x: number; y: number } | null {
    return this.heart ? { x: this.heart.coreX, y: this.heart.coreY } : null;
  }

  private stateOf(goal: SimView['goal'], i: number): SimView['goal']['lanterns'][number] | undefined {
    return i < this.nLanterns ? goal.lanterns[i] : goal.lamps?.[i - this.nLanterns];
  }

  /** The dark lantern nearest to (x, y): its index, -1 if all burn. */
  private nextDark(goal: SimView['goal'], x: number, y: number): number {
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.nLanterns; i++) {
      const l = this.lamps[i];
      if (!l || goal.lanterns[i]?.lit !== false) continue;
      const d = Math.hypot(l.view.x - x, l.view.y - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * When the ember-moths go out and where to (guide.ts flies them). Out: a beat after a lantern
   * catches; when she has come no nearer to the next dark lantern (the awake heart, once all burn)
   * for `idle` s; at the sleeping heart once it has shown her what is missing. Never before the
   * first lantern burns (except at the heart), never constantly: an unfollowed flight leaves.
   */
  private guideTick(dt: number, cam: CameraView, sim: SimView): void {
    const GD = GOAL.guide;
    const goal = sim.goal;
    const p = sim.player;
    const g = this.guide;
    const h = this.heart;
    if (this.nLanterns === 0) return;
    if (goal.gathered || p.faded > 0) {
      g.release();
      this.guideIn = -1;
      this.guideIdle = 0;
      return;
    }
    // Where to: the dark lantern nearest her, or the awake heart.
    const to = this.nextDark(goal, p.cx, p.cy);
    const tl = this.lamps[to];
    let key = '';
    let ex = 0;
    let ey = 0;
    const em = this.ember;
    if (tl?.keyless && em) {
      // It wants the ember first: that is where they lead (and wait).
      key = em.id;
      ex = em.x;
      ey = em.y - GOAL.ember.perchUp;
    } else if (tl) {
      key = tl.id;
      ex = tl.view.topX;
      ey = tl.view.topY;
    } else if (h && goal.heart.awake) {
      key = 'heart';
      ex = h.coreX;
      ey = h.coreY - 30;
    }
    if (key === '') {
      g.release();
      return;
    }
    g.perchX = ex;
    g.perchY = ey;
    if (g.active && g.key !== key) g.release();
    let called = false;
    if (this.keyCallIn >= 0) {
      this.keyCallIn -= dt;
      called = this.keyCallIn < 0;
    }
    // Has she come nearer?
    const d = Math.hypot(ex - p.cx, ey - p.cy);
    if (key !== this.guideKey) {
      this.guideKey = key;
      this.guideBest = d;
      this.guideIdle = 0;
    }
    if (d < this.guideBest - GD.progress) {
      this.guideBest = d;
      this.guideIdle = Math.min(this.guideIdle, 0);
    } else this.guideIdle += dt;
    // A kindle resets what "nearer" means (she may have to go round).
    const way = (): Path => wayTo(GD.routes, key, p.cx, p.cy - 20, ex, ey);
    if (this.keyLeadIn >= 0) {
      this.keyLeadIn -= dt;
      if (this.keyLeadIn < 0 && em && tl && !tl.keyless && tl === this.lamps[em.lantern]) {
        g.lead(key, way(), GD.moths, em.outX, em.outY - 8);
        this.guideIdle = 0;
        this.guideBest = d;
        this.guideSp = 0;
        return;
      }
    }
    // The lantern has told her it wants the ember: a flight leaves its cold glass and leads her back
    // (unless one is already leading her there, in the picture).
    if (called && tl?.keyless && em) {
      const leading =
        g.active && g.key === key && !g.showing && g.mode !== 'leave' && this.inView(cam, g.lx, g.ly, 0);
      if (!leading) {
        g.drop();
        g.lead(key, way(), GD.moths, tl.view.beadX, tl.view.beadY - 4);
        this.guideIdle = 0;
        this.guideBest = d;
        this.guideSp = 0;
        return;
      }
    }
    if (g.active && g.key === key) {
      if (g.showing) {
        // They wait on the ember. She does not come: they come down and lead her up the way.
        if (g.mode !== 'leave' && this.guideIdle > GD.idle && d > 330) {
          g.reroute(way());
          this.guideIdle = 0;
          this.guideBest = d;
          this.guideSp = 0;
        }
        return;
      }
      // (Following a way that first leads away from it is coming nearer too.)
      if (g.sp > this.guideSp + 60) {
        this.guideSp = g.sp;
        this.guideIdle = Math.min(this.guideIdle, 0);
      } else if (g.sp < this.guideSp - 200) this.guideSp = g.sp;
      if (g.stale) {
        g.reroute(way());
        this.guideBest = d;
        this.guideSp = 0;
      }
      // Nobody follows: they go, and stay away a while.
      if (g.mode !== 'leave' && this.guideIdle > GD.ignore && d > 330) {
        g.release();
        this.guideIdle = -GD.again;
        this.guideBest = d;
      }
      return;
    }
    if (g.active) return;
    let from = -1;
    let n = GD.moths;
    if (this.guideIn >= 0) {
      this.guideIn -= dt;
      if (this.guideIn < 0) from = this.guideFrom;
    } else if (!this.awake && h && goal.heart.hinted) {
      // At the sleeping heart: from the dark wick of the lantern that is missing.
      const by = Math.hypot(p.cx - h.x, p.cy - (h.y - 40)) < GD.heartPx;
      this.heartGuideIn = by ? this.heartGuideIn - dt : Math.min(0.7, this.heartGuideIn + dt);
      if (by && this.heartGuideIn <= 0) {
        this.heartGuideIn = 2;
        const wk = h.wicks[to];
        g.lead(key, way(), GD.heartMoths, wk?.x ?? h.x, (wk?.y ?? h.y - 60) - 4);
        this.guideIdle = 0;
        this.guideBest = d;
        return;
      }
    }
    if (from < 0 && goal.lit >= 1 && this.guideIdle >= GD.idle && d > 330) {
      // Idle or wandering: from the nearest burning light in reach, else in from the frame's edge.
      let bd = GD.fromPx;
      for (let i = 0; i < this.lamps.length; i++) {
        const l = this.lamps[i] as Lamp;
        if (!l.lit) continue;
        const dl = Math.hypot(l.view.beadX - p.cx, l.view.beadY - p.cy);
        if (dl < bd && this.inView(cam, l.view.beadX, l.view.beadY, 0)) {
          bd = dl;
          from = i;
        }
      }
      if (from < 0) {
        const side = ex < p.cx ? 1 : -1;
        g.lead(key, way(), n, p.cx + side * (VIEW_W / 2 / cam.zoom + 30), p.cy - 190);
        this.guideIdle = 0;
        this.guideBest = d;
        return;
      }
    }
    const fl = this.lamps[from];
    if (!fl) return;
    if (fl.way) n = Math.max(2, n - 1);
    this.guideIdle = 0;
    this.guideBest = d;
    this.guideSp = 0;
    const fx = fl.view.beadX;
    const fy = fl.view.beadY - 6;
    if (em && key === em.id && Math.hypot(ex - fx, ey - fy) < GOAL.ember.showPx) {
      // The ember hangs over this light: their first act is to rise to it and wait there.
      // (Round the end of whatever it stands on: they are drawn in front of the island.)
      const up = new Path();
      let turn = Number.NaN;
      let top = 0;
      let bottom = 0;
      for (const r of sim.scene.solids) {
        if (ex < r.x || ex > r.x + r.w || r.y < ey || r.y > ey + 200 || r.y + r.h > fy) continue;
        turn = ex - r.x < r.x + r.w - ex ? r.x - 46 : r.x + r.w + 46;
        top = r.y;
        bottom = r.y + r.h;
      }
      if (Number.isNaN(turn)) {
        const side = ex < fx ? 1 : -1;
        bezier(up, [fx, fy, fx + side * 70, fy - 230, ex - side * 80, ey + 250, ex, ey], 16);
      } else {
        bezier(up, [fx, fy, fx, fy - 160, turn, bottom + 260, turn, bottom + 70], 10);
        bezier(up, [turn, bottom + 70, turn, top - 60, (turn + ex) / 2, ey - 26, ex, ey], 10);
      }
      g.show(key, up, n, fx, fy);
      return;
    }
    g.lead(key, way(), n, fx, fy);
  }

  /**
   * The offering (the sim's `heartOffer` / `heartTier`): her glints wind from her hand into the
   * heart's light, in the kindling's language, and each threshold wakes a few more small lights of
   * the grove round the shrine (they stay: reconciled from `goal.offer.tier`).
   */
  private drawOffer(
    dt: number,
    clock: number,
    sim: SimView,
    b: GlintBatch,
    f: GlintBatch,
    bloom: number,
  ): void {
    const h = this.heart;
    if (!h) return;
    const O = GOAL.offer;
    const tx = h.coreX;
    const ty = h.coreY - GOAL.heart.lift * bloom;
    this.offerBeat *= Math.exp(-dt * 7);
    for (const m of this.offers) {
      if (m.t < 0) continue;
      m.t += dt;
      const u = m.t / m.dur;
      if (u >= 1) {
        m.t = -1;
        this.offerBeat = Math.min(1.6, this.offerBeat + 0.5);
        continue;
      }
      // Up out of her hand, then in a winding arc into the light.
      for (let j = 0; j < 3; j++) {
        const v = Math.max(0, u - j * 0.045);
        const e = v * v * (3 - 2 * v);
        const arc = Math.sin(Math.PI * v);
        const side = m.seed > 0.5 ? 1 : -1;
        const wind = Math.sin(v * Math.PI * 2 * O.turns + m.seed * 6) * O.wind * arc;
        const x = m.sx + (tx - m.sx) * e + wind * side;
        const y = m.sy + (ty - m.sy) * e - arc * O.rise * (0.6 + 0.8 * m.seed);
        const size = (j === 0 ? 5.2 : 3.6 - j * 0.6) * (1 - 0.35 * e);
        f.quad(
          K_SPARK,
          x,
          y,
          size,
          size,
          (j === 0 ? 0.95 : 0.5 - 0.12 * j) * Math.min(1, u * 8),
          0,
          j === 0 ? 0.85 : 0.4,
        );
      }
    }
    if (this.offerBeat > 0.01) {
      f.quad(K_SPARK, tx, ty, 9 + 5 * this.offerBeat, 9 + 5 * this.offerBeat, 0.5 * this.offerBeat, 0, 0.8);
      f.quad(K_FLARE, tx, ty, 40, 40, 0.16 * this.offerBeat, 0, 0);
    }
    // What the tiers woke: small lights at fixed places round the shrine, kindled one after another.
    // What has woken is the sim's to say (`goal.grove`: flowers, paths, canopy = tiers 1, 2, 3).
    const gv = sim.goal.grove;
    const woke = [gv?.flowers === true, gv?.paths === true, gv?.canopy === true];
    // (The first tier's flowers: their lights.)
    const fl = this.heartLife?.lights ?? [];
    for (let k = 0; k < fl.length; k += 3) {
      const o = fl[k + 2] as number;
      if (o <= 0.02) continue;
      const tw = 0.85 + 0.15 * Math.sin(clock * 1.9 + k * 1.3);
      b.quad(
        K_SPARK,
        fl[k] as number,
        fl[k + 1] as number,
        O.flowerBead,
        O.flowerBead,
        O.flowerGain * o * tw,
        0,
        0.7,
      );
      b.quad(K_FLARE, fl[k] as number, fl[k + 1] as number, 13, 13, 0.24 * o * tw, 0, 0);
    }
    let n0 = 0;
    for (let k = 0; k < 3; k++) {
      const n = O.lights[k] as number;
      if (woke[k] && (this.tierT[k] as number) < 0) this.tierT[k] = LONG_AGO;
      if (!woke[k]) this.tierT[k] = -1;
      const t = this.tierT[k] as number;
      if (t >= 0) {
        this.tierT[k] = t + dt;
        for (let i = 0; i < n; i++) {
          const id = n0 + i;
          const r1 = (id * 0.618034 + 0.13) % 1;
          const r2 = (id * 0.381966 + 0.71) % 1;
          const side = id % 2 === 0 ? -1 : 1;
          const band = O.bands[k] as number[];
          const x =
            h.x +
            side * ((band[0] as number) + ((band[1] as number) - (band[0] as number)) * ((i + r1 * 0.6) / n));
          const y = h.y - (band[2] as number) - ((band[3] as number) - (band[2] as number)) * r2;
          // The third tier is the canopy waking across the whole frame: the farther from the heart the
          // later, each light rising to its place.
          const far = k === 2;
          if (far && this.inSolid(sim.scene, x, y)) continue;
          const born = far ? t - Math.hypot(x - h.x, y - h.y) / O.ripple : t - i * O.step;
          if (born <= 0) continue;
          const up = smooth(0, 0.5, born);
          const pop = Math.exp(-born * (far ? 2.2 : 5));
          const br = 0.8 + 0.2 * Math.sin(clock * (1.1 + r1) + id * 2.3);
          const bx = x + Math.sin(clock * 0.6 + id) * (far ? 7 : 3);
          const by =
            y +
            Math.sin(clock * 0.8 + id * 1.7) * 4 +
            (far ? O.riseFrom * (1 - smooth(0, O.riseSeconds, born)) ** 2 : 0);
          b.quad(
            K_SPARK,
            bx,
            by,
            O.bead * (1 + 0.8 * pop),
            O.bead * (1 + 0.8 * pop),
            O.beadGain * up * br + pop,
            0,
            0.45 + 0.4 * pop,
          );
          b.quad(K_FLARE, bx, by, O.halo, O.halo, O.haloGain * up * br + 0.2 * pop, 0, 0);
        }
      }
      n0 += n;
    }
  }

  /**
   * She stands in the heart before its wake has played (`heartWait` .. `heartReady`): the light that
   * is opening reaches for her and holds her, so the wait is a beat of the ceremony. A thread of
   * sparks runs from the heart's core into her chest, a few small lights wind up round her, the
   * ground under her warms a little; when the heart is ready they close into her.
   */
  private drawWait(
    dt: number,
    clock: number,
    sim: SimView,
    b: GlintBatch,
    f: GlintBatch,
    sf: SurfaceLight,
  ): void {
    const h = this.heart;
    const W = GOAL.wait;
    const p = sim.player;
    if (this.waitT >= 0) this.waitT += dt;
    if (this.readyT >= 0) this.readyT += dt;
    // Held while she stays by it, until the heart takes her in (or she walks away).
    const by = h !== null && Math.abs(p.cx - h.x) < 150 && Math.abs(p.feetY - h.y) < 140;
    const on = this.waitT >= 0 && this.awake && by && this.readyT < W.close;
    this.waitA += ((on ? 1 : 0) - this.waitA) * Math.min(1, dt * (on ? 3.5 : 5));
    if (this.waitT >= 0 && (!this.awake || (this.readyT >= W.close && this.waitA < 0.01))) {
      this.waitT = -1;
      this.readyT = -1;
    }
    const a = this.waitA;
    if (!h || a < 0.01) return;
    const close = this.readyT >= 0 ? smooth(0, W.close, this.readyT) : 0;
    const cx = this.chestX;
    const cy = this.chestY;
    // The thread: out of the heart's core, a low arc, into her chest.
    const mx = (h.coreX + cx) / 2;
    const my = Math.min(h.coreY, cy) - W.arc * 2;
    for (let k = 0; k < W.thread; k++) {
      const u = (((clock * W.flow + k / W.thread) % 1) + 1) % 1;
      const q = 1 - u;
      const x =
        q * q * h.coreX +
        2 * q * u * mx +
        u * u * cx +
        Math.sin(u * 9 + k * 1.7 + clock * 2) * 6 * Math.sin(Math.PI * u);
      const y = q * q * h.coreY + 2 * q * u * my + u * u * cy;
      const e = Math.sin(Math.PI * u) ** 0.6 * a;
      f.quad(K_SPARK, x, y, 3.8 - 1.2 * u, 3.8 - 1.2 * u, W.gain * e, 0, 0.75 - 0.4 * u);
    }
    // Lights that wind up round her: behind her on the far half of the turn.
    for (let k = 0; k < W.ring; k++) {
      const ph = k / W.ring;
      const u = (((clock * 0.36 + ph) % 1) + 1) % 1;
      const ang = clock * W.turn + ph * TAU * 2;
      const r = W.rx * (1 - 0.35 * u) * (1 - 0.85 * close);
      const x = p.cx + Math.cos(ang) * r;
      const y = p.feetY - 8 - u * W.rise + (cy - (p.feetY - 8 - u * W.rise)) * close;
      const e = Math.sin(Math.PI * u) ** 0.7 * a * (1 + 0.8 * close);
      const q = Math.sin(ang) > 0 ? f : b;
      q.quad(K_SPARK, x, y, W.bead, W.bead, W.gain * e * (Math.sin(ang) > 0 ? 1 : 0.6), 0, 0.6);
      q.quad(K_FLARE, x, y, 15, 15, 0.22 * e, 0, 0);
    }
    // The ground she stands on takes the light; her chest answers when it is ready.
    sf.light(
      this.camNow,
      p.cx,
      p.feetY - 20,
      110,
      70,
      W.pool * a * (0.85 + 0.15 * Math.sin(clock * 2.4)),
      0.15,
    );
    const held = 0.85 + 0.15 * Math.sin(clock * 2.4);
    f.quad(
      K_FLARE,
      cx,
      cy,
      30 + 16 * close,
      30 + 16 * close,
      (0.24 * held + 0.34 * Math.sin(Math.PI * close)) * a,
      0,
      0.25,
    );
  }

  /** The long drop nearest lantern `l` (over `min` px deep): the x just past that edge, or NaN. */
  private dropBy(l: Lamp, scene: SimView['scene'], min: number): number {
    const depth = (x: number): number => {
      if (x < 8 || x > scene.width - 8) return 0;
      let top = scene.height;
      for (const r of scene.solids)
        if (x >= r.x && x <= r.x + r.w && r.y + r.h > l.view.y) top = Math.min(top, r.y);
      return top - l.view.y;
    };
    const wl = l.edgeL - 16;
    const er = l.edgeR + 16;
    const dl = depth(wl) > min ? l.view.x - wl : Number.POSITIVE_INFINITY;
    const dr = depth(er) > min ? er - l.view.x : Number.POSITIVE_INFINITY;
    if (dl === Number.POSITIVE_INFINITY && dr === Number.POSITIVE_INFINITY) return Number.NaN;
    return dl <= dr * 1.5 ? wl : er;
  }

  private coldFall(dt: number, sim: SimView): void {
    const F = GOAL.lantern.fall;
    const p = sim.player;
    const to = this.nextDark(sim.goal, p.cx, p.cy);
    const l = this.lamps[to];
    this.fallIn -= dt;
    if (l && this.fallIn <= 0 && !sim.goal.gathered && l.charge < 0.05 && !l.keyless) {
      const ex = this.dropBy(l, sim.scene, F.minDrop);
      const m = this.falls.find((q) => q.t < 0);
      if (m && !Number.isNaN(ex)) {
        this.fallIn = F.every * (0.7 + 0.6 * this.rand());
        m.t = 0;
        m.x0 = l.view.beadX;
        m.y0 = l.view.beadY + 6;
        m.x1 = ex + (this.rand() - 0.5) * 18 + (ex < l.view.x ? -8 : 8);
        m.seed = this.rand();
      } else this.fallIn = 0.5;
    }
    for (const m of this.falls) {
      if (m.t < 0) continue;
      m.t += dt;
      const life = F.life * (0.8 + 0.4 * m.seed);
      if (m.t >= life) {
        m.t = -1;
        m.s.visible = false;
        continue;
      }
      // Out to the lip (a moth's reluctant drift), then down, slowly, swaying.
      const out = smooth(0, F.out, m.t);
      const tf = Math.max(0, m.t - F.out * 0.55);
      const x = m.x0 + (m.x1 - m.x0) * out + Math.sin(m.t * 1.7 + m.seed * 20) * 7 * out;
      const y = m.y0 + F.speed * tf + 0.5 * F.gravity * tf * tf + 10 * out;
      const a = smooth(0, 0.5, m.t) * (1 - smooth(life * 0.55, life, m.t));
      m.s.visible = a > 0.01;
      m.s.position.set(x, y);
      m.s.width = m.s.height = F.size * (0.8 + 0.4 * m.seed);
      m.s.alpha = F.alpha * a * (0.75 + 0.25 * Math.sin(m.t * 5 + m.seed * 9));
    }
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

  /** How far the ground the heart stands on runs: [left, right]. */
  private heartGround(scene: SimView['scene']): [number, number] {
    const h = this.heart;
    let l = (h?.x ?? 0) - 900;
    let r = (h?.x ?? 0) + 900;
    if (h)
      for (const q of scene.solids) {
        if (q.y !== h.y || h.x < q.x || h.x > q.x + q.w) continue;
        l = Math.max(l, q.x);
        r = Math.min(r, q.x + q.w);
      }
    return [l, r];
  }

  private inSolid(scene: SimView['scene'], x: number, y: number): boolean {
    for (const r of scene.solids)
      if (x > r.x - 8 && x < r.x + r.w + 8 && y > r.y - 8 && y < r.y + r.h) return true;
    return false;
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
  private openPrice(i: number, need: number): void {
    const R = GOAL.refuse;
    const n = Math.max(0, Math.min(24, need));
    while (this.stars.length < n) {
      const root = new Container();
      // A small hollow flame, warm: it fills when she has the light for it. (They were four-point
      // stars, the same shape as the glints all round the first lantern: playtest 3.)
      const h = R.star;
      const w = h * 0.56;
      const flame = (g: Graphics, k: number): Graphics =>
        g
          .moveTo(0, -h * k)
          .bezierCurveTo(w * 0.3 * k, -h * 0.4 * k, w * k, h * 0.02 * k, w * k, h * 0.42 * k)
          .bezierCurveTo(w * k, h * 0.82 * k, w * 0.5 * k, h * k, 0, h * k)
          .bezierCurveTo(-w * 0.5 * k, h * k, -w * k, h * 0.82 * k, -w * k, h * 0.42 * k)
          .bezierCurveTo(-w * k, h * 0.02 * k, -w * 0.3 * k, -h * 0.4 * k, 0, -h * k)
          .closePath();
      const outline = new Graphics();
      flame(outline, 1)
        .fill({ color: 0x100a06, alpha: 0.5 })
        .stroke({ width: 1.15, color: R.mark, alpha: 0.78, join: 'round' });
      const fill = new Graphics();
      flame(fill, 0.94)
        .fill({ color: R.fill, alpha: 0.9 })
        .stroke({ width: 0.9, color: 0xffd9a0, alpha: 0.8 });
      fill.ellipse(0, h * 0.45, w * 0.36, h * 0.3).fill({ color: 0xffe2b0, alpha: 0.7 });
      root.addChild(outline, fill);
      this.price.addChild(root);
      this.stars.push({ root, fill });
      this.starPop.push(0);
    }
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
      const lit =
        (lamp.lit ? smooth(0, 0.7, lamp.catchT) : lamp.charge * 0.25) * (1 - GOAL.reform.light * lamp.gutter);
      if (lit <= 0.003) continue;
      const breath = 1 + 0.04 * Math.sin((clock * TAU) / L.breath + lamp.seed * TAU);
      // The ring from the waking heart: the pool swells once and stays a little wider.
      this.ringAt(v.beadX, v.y - 40, this.ringOut);
      const rs = this.ringOut[0] as number;
      const rp = this.ringOut[1] as number;
      const wide = 1 + GOAL.ending.wide * this.grove + 0.12 * lamp.pulse + 0.1 * rs + 0.05 * rp;
      const rg = this.ringGain(v.beadX, v.y - 40);
      sf.light(
        cam,
        v.beadX,
        v.y - 70,
        P.rx * wide * lamp.k,
        P.ry * wide * lamp.k,
        P.gain * lit * breath * (1 + 0.5 * lamp.pulse + 0.35 * rs + 0.1 * rp),
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
        const tw = (0.85 + 0.15 * Math.sin(clock * 2.1 + k)) * rg;
        const fs = 1 + 0.3 * rs;
        b.quad(K_SPARK, fl[k] as number, fl[k + 1] as number, 3.4 * fs, 3.4 * fs, 0.7 * o * tw, 0, 0.7);
        b.quad(K_FLARE, fl[k] as number, fl[k + 1] as number, 12 * fs, 12 * fs, 0.22 * o * tw, 0, 0);
      }
      // Fireflies: slow loops round the lantern, each on its own clock.
      for (let k = 0; k < (lamp.way ? 3 : L.flies); k++) {
        const ph = (k * 0.618 + lamp.seed) % 1;
        const t = clock * (0.16 + 0.1 * ph) + ph * 40;
        const fx = v.beadX + Math.sin(t * 1.3 + ph * 9) * (70 + 90 * ph) + Math.sin(t * 3.1) * 14;
        const fy = v.y - 50 - 44 * ph + Math.sin(t * 1.9 + ph * 5) * 34 + Math.cos(t * 2.7) * 9;
        const blink = Math.max(0, Math.sin(t * 5.3 + ph * 20)) ** 0.6;
        const a = smooth(0.3 + 0.1 * k, 1, al) * (0.35 + 0.65 * blink) * rg;
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
          al * (1 - smooth(L.wakePx * 0.6, L.wakePx, d)) * (0.6 + 0.4 * Math.sin(clock * 1.7 + k * 2.3)) * rg;
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
        // (One that waits for the ember answers no glints: its bulb is ember.ts's cold hollow.)
        if (lamp.keyless) continue;
        const canPay = sim.pickups.count >= lamp.cost;
        // (A wayside lamp's sleeping light is its cold point, a sprite: no warm ember until it notices her.)
        let ember = lamp.way ? 0 : L.ember * (0.72 + 0.28 * Math.sin(clock * 1.2 + lamp.seed * 9));
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
      this.ringAt(x, y, this.ringOut);
      const rs = this.ringOut[0] as number;
      const e =
        L.beadGain *
          breath *
          rest *
          up *
          (1 - GOAL.reform.bead * lamp.gutter) *
          (1 + 0.1 * (this.ringOut[1] as number)) +
        (K.flarePeak - 1) * flare +
        0.7 * lamp.pulse +
        0.6 * rs +
        0.25 * lamp.beat;
      const size =
        L.bead *
        (0.4 + 0.6 * lamp.k) *
        (1 + 0.5 * flare + 0.25 * lamp.pulse) *
        (0.96 + 0.04 * breath) *
        (rest > 1 ? 1.06 : 1);
      b.quad(K_SPARK, x, y, size, size, e, 0, 1);
      const hs = (L.halo + (K.flareHalo - L.halo) * flare + 16 * lamp.pulse + 10 * rs) * (0.3 + 0.7 * lamp.k);
      b.quad(
        K_FLARE,
        x,
        y,
        hs,
        hs,
        (L.haloGain * breath * rest * (1 - GOAL.reform.bead * lamp.gutter) +
          0.55 * flare +
          0.3 * lamp.pulse) *
          up,
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
      if (fl.back) {
        // Falling back to her: a glint again (the star she gathered), with a thread of sparks.
        this.flowAt(fl, lamp, u);
        const gone = 1 - smooth(0.8, 1, u);
        const gs = 46 * GOAL.kindle.backSize * (0.75 + 0.25 * gone);
        f.quad(K_GLINT, this.tmp[0] as number, this.tmp[1] as number, gs, gs, 0.95 * gone, fl.seed, 0);
        for (let j = 1; j <= 2; j++) {
          const uu = u - j * 0.06;
          if (uu <= 0) break;
          this.flowAt(fl, lamp, uu);
          f.quad(
            K_SPARK,
            this.tmp[0] as number,
            this.tmp[1] as number,
            2.4 - 0.5 * j,
            2.4 - 0.5 * j,
            0.55 * gone,
            0,
            0.3,
          );
        }
        continue;
      }
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
      if (priceLamp.lit || this.priceA <= 0.002 || priceLamp.keyless) {
        // (Keyless: its price is the one ember mark, ember.ts.)
        this.price.visible = false;
      } else {
        const t = this.priceT;
        // A wayside lamp's price is smaller and dimmer than a lantern's.
        const pk = priceLamp.way ? R.lampScale : 1;
        const pa = (priceLamp.way ? R.lampAlpha : R.alpha) * smooth(0, 1, this.priceA);
        // Given by hand (kept, lit for good) first, then as far as her wallet goes.
        const given = Math.max(0, Math.min(this.priceNeed, this.stateOf(goal, this.priceLamp)?.given ?? 0));
        const have = given + Math.max(0, Math.min(this.priceNeed - given, sim.pickups.count));
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
          const a = inn * pa;
          const pop = (this.starPop[i] as number) * Math.exp(-dt * 6);
          this.starPop[i] = pop;
          const filled = i < have;
          const kept = i < given;
          st.fill.visible = filled;
          st.fill.tint = kept ? GIVEN_TINT : 0xffffff;
          st.root.alpha = a;
          st.root.scale.set(
            (filled ? 1 + 0.45 * (1 - inn) : 0.82 + 0.18 * inn) * (1 + 0.6 * pop) * (kept ? 1.14 : 1) * pk,
          );
          if (filled)
            f.quad(
              K_SPARK,
              this.price.x + spot[0],
              this.price.y + spot[1],
              7 * pk,
              7 * pk,
              (kept ? 0.7 + 0.1 * Math.sin(clock * 2.3 + i) + 0.3 * pop : 0.2 + 0.8 * pop) * a,
              0,
              kept ? 0.55 + 0.4 * pop : 0.3 + 0.5 * pop,
            );
        }
      }
    } else this.price.visible = false;

    // --- The ember: on her shoulder, into the bulb, and what the lantern that lacks it shows.
    const em = this.ember;
    const el = em ? this.lamps[em.lantern] : undefined;
    if (em && el) {
      const shown = this.priceLamp === em.lantern && this.priceT >= 0 ? smooth(0, 1, this.priceA) : 0;
      em.update(
        dt,
        clock,
        sim,
        el.view.beadX,
        el.view.beadY,
        this.chestX,
        this.chestY,
        el.notice,
        shown,
        GOAL.refuse.radius,
        this.inView(cam, el.view.x, el.view.y - 60, 420),
        b,
        f,
      );
    }
    this.drawWait(dt, clock, sim, b, f, sf);

    // --- What she dropped when she faded: a huddle of quiet glints waiting where she fell (drops.ts).
    this.drops.update(dt, clock, cam, sim, b, f, sf, this.chestX, this.chestY);

    // --- The offering at the awake heart, and what each tier of it woke.
    this.drawOffer(dt, clock, sim, b, f, bloom);

    // --- Ember-moths on their way to the nearest dark lantern.
    this.guide.update(dt, clock, cam, sim.player.cx, sim.player.cy, f);

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
          // A dark wick is cold: which of the three still wait is read by temperature, at a glance.
          const cs = this.wickCold[i];
          if (cs) {
            const ca =
              lit || this.awake ? 0 : GOAL.lamp.coreAlpha * (0.78 + 0.22 * Math.sin(clock * 1.3 + i * 2.1));
            cs.visible = ca > 0.01;
            cs.position.set(wk.x, wk.y);
            cs.width = cs.height = GOAL.lamp.coreSize * (1 + 0.5 * show);
            cs.alpha = Math.min(1, ca * (1 + 0.5 * show));
          }
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

      // --- Waking, beat two: light runs out through the roots to every lit lantern, and each answers
      // as it arrives. During the wake the veins glow on a while and fade; the offering's second
      // tier lights them for good.
      const WK = GOAL.wake;
      const vs = this.veins;
      if (vs && this.awake) {
        const V = WK.veins;
        const t2 = goal.grove?.paths ? (this.tierT[1] as number) : -1;
        const wt = this.wakeT - V.start;
        const wBody = V.body * (1 - smooth(V.hold, V.hold + V.fade, this.wakeT)) * (this.wakeT < 1e5 ? 1 : 0);
        for (let k = 0; k < vs.list.length; k++) {
          const v = vs.list[k];
          if (!v) continue;
          const end = v.lead + v.length;
          const h1 = this.wakeT < 1e5 ? vs.head(v, wt) : 0;
          const h2 = t2 >= 0 ? (t2 > 1e5 ? end + 1e6 : vs.head(v, t2)) : 0;
          const head = Math.max(h1, h2);
          const flash = Math.max(
            h1 > 0 && wBody > 0 ? 1 - smooth(end, end + 420, h1) : 0,
            h2 > 0 ? 1 - smooth(end, end + 420, h2) : 0,
          );
          const body = Math.max(h1 > 0 ? wBody : 0, h2 > 0 ? V.lit * smooth(0, 0.5, t2) : 0);
          vs.draw(v, b, sf, cam, clock, head, body, flash);
          // Its lantern answers.
          if (!this.veinDone[k] && h1 >= end) {
            this.veinDone[k] = true;
            for (const lamp of this.lamps) if (lamp.id === v.id && lamp.lit) lamp.pulse = 1;
          }
        }
      }
      // --- Beat three: the moth cut in the wing-stone fills with light, and keeps it.
      if (this.carving && this.awake && this.inView(cam, h.x, h.y - 200, 300)) {
        const C = WK.carving;
        const fill = this.wakeT > 1e5 ? 1 : Math.min(1, Math.max(0, (this.wakeT - C.start) / C.seconds));
        const settle = this.wakeT > 1e5 ? 0 : Math.exp(-Math.max(0, this.wakeT - C.start - C.seconds) * 2.2);
        this.carving.draw(
          b,
          fill,
          C.glow * (0.9 + 0.1 * Math.sin(clock * 1.2)) * (1 + 0.35 * bloom) +
            0.5 * settle * (fill >= 1 ? 1 : 0),
          fill < 1 ? 1 : 0,
        );
      }
      // --- Beat four: the ring. Fireflies round the shrine flash as it passes (some stay), its
      // light runs over every surface in its way and, faintly, through the forest behind.
      if (this.awake) this.flies?.draw(b, cam, clock, this.ringAt);
      const W = H.wave;
      const R = (this.wakeT - WK.ring.start) * WK.ring.speed;
      if (this.awake && R > 0 && R < 2400) {
        // A low swell along the heart's own ground, as far as that ground runs.
        const [gl, gh, gg] = WK.ring.ground as [number, number, number];
        const [el, er] = this.heartGround(sim.scene);
        for (const dir of [-1, 1]) {
          for (let j = 0; j < 3; j++) {
            const x = h.x + dir * (R - j * gl * 0.8);
            if ((x - h.x) * dir < 30) continue;
            const room = dir < 0 ? x - el : er - x;
            b.quad(K_FLARE, x, h.y - gh * 0.5, gl, gh, gg * (1 - j * 0.3) * smooth(-10, 40, room), 0, 0);
          }
        }
        // Every glint still waiting in view answers as it passes, and keeps a little of it.
        const picks = sim.scene.pickups ?? [];
        const [g0, g1] = WK.ring.glint as [number, number];
        for (let i = 0; i < picks.length; i++) {
          const pk = picks[i];
          if (!pk || sim.pickups.timers[i] !== 0 || !this.inView(cam, pk.x, pk.y, 20)) continue;
          this.ringAt(pk.x, pk.y, this.ringOut);
          const e = g0 * (this.ringOut[0] as number) + g1 * (this.ringOut[1] as number);
          if (e <= 0.004) continue;
          b.quad(K_FLARE, pk.x, pk.y, 17, 17, e, 0, 0.3);
          b.quad(K_SPARK, pk.x, pk.y, 3.4, 3.4, e, 0, 0.7);
        }
      }
      if (this.awake && R > 0 && R < W.reach + W.width * 2) {
        const fade = (1 - smooth(W.reach * 0.9, W.reach, R)) * smooth(0, 300, R);
        for (const dir of [-1, 1]) {
          const x = h.x + dir * R;
          if (Math.abs(x - cam.x) > VIEW_W / 2 / cam.zoom + W.width) continue;
          sf.light(cam, x, cam.y, W.width, 900, W.surface * fade, 0.2);
          lb.quad(K_FLARE, x, h.y - 300, W.width, W.height, W.gain * fade, 0, 0);
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
