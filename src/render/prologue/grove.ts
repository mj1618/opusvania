// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * The prologue's Grove beats (v2): everything it adds to the game's own layers (so it takes the
 * Grove's post and grade), and the camera there. Reads the director's plan (plan.ts) and the sim;
 * writes neither.
 *
 *  - Wing and Sorrel are drawn as two stand-in bodies with her own skin (VesperCharacter, each with
 *    its own acting cues and light registry): hers is fed the sim's player in the played stretches
 *    and a staged pose in the cinematic ones (blended), his is fed his guide body (src/prologue/
 *    guide.ts) or a staged pose. The real character layer is hidden for the whole prologue.
 *  - the cocoons (and the husks they leave), the fox (fox.ts), the frost (feathers here, the grade
 *    in post: POST_CINE), the pale thread of root in the moss, the hollow, the case on its stalk
 *    with the fox asleep inside, the pulse up the stalk, the lampwing whose lamp lights and turns
 *    (the game's lampwing painter on a made-up state, `LampRig.cine`), the coral wash, the ferns,
 *    the glint, the give prompt, the dance with its one silver-edged moth, the leaf she wakes under.
 */
import { ColorMatrixFilter, Container, Graphics, Sprite } from 'pixi.js';
import { createEnemy } from '../../sim/enemies';
import { createPlayer } from '../../sim/player/player';
import type { Scene } from '../../sim/scene';
import type { EnemyState, PlayerState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import { VesperCharacter } from '../character/vesper';
import { type CineCues, newCues } from '../character/vesper/link';
import type { CameraView, PlayerView, RenderContext, SimView } from '../contract';
import { EnemyRenderer } from '../enemies/index';
import { LightRegistry, type PointLight } from '../lights';
import { POST_CINE } from '../post/config';
import type { LayerTree } from '../scene/layer-tree';
import { prng } from '../scene/lib/look';
import { fern } from '../world/kit';
import { glowTexture } from '../world/paint';
import { Fox, foxPose } from './fox';
import type { ProloguePlan } from './plan';
import { COURSE, FOX_DRINK, HATCH, HOLLOW, MOSS, WAKE } from './script';
import { envelope, Track, window01 } from './track';

const PALE = 0xd9cfc4;
const AMBER = 0xffb36b;
const GOLD = 0xffd9a0;
const CORAL = 0xff7a6a;

function soft(r: number, color: number, alpha = 1): Sprite {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.setSize(r * 2, r * 2);
  s.tint = color;
  s.alpha = alpha;
  s.blendMode = 'add';
  return s;
}

/** Camera tracks per beat (x, y, zoom, game: 1 = the game's own follow camera). */
const HATCH_CAM = new Track([
  { t: 0, v: [HATCH.sorrel.x, HATCH.sorrel.y + 2, 4, 0] },
  { t: HATCH.pullOut[0], v: [HATCH.sorrel.x, HATCH.sorrel.y + 2, 4, 0] },
  { t: HATCH.pullOut[1], v: [1325, 1150, 2, 0] },
  { t: HATCH.wait[1], v: [1340, 1170, 2, 0] },
  { t: HATCH.fold[0], v: [1385, 1212, 2.3, 0] },
  { t: HATCH.fold[0] + 3, v: [1394, 1240, 3.6, 0] },
  { t: HATCH.tap[1], v: [1394, 1240, 3.6, 0] },
  { t: HATCH.lookFox[0], v: [1350, 1196, 2.2, 0] },
  { t: HATCH.follow[1], v: [1350, 1196, 1, 1] },
]);

const HOLLOW_CAM = new Track([
  { t: 0, v: [1440, 1206, 2.5, 0] },
  { t: HOLLOW.dim[0], v: [1430, 1200, 2.4, 0] },
  { t: HOLLOW.lampLit[0], v: [1462, 560, 1.8, 0] },
  { t: HOLLOW.play[0] + 0.6, v: [1462, 560, 1.8, 0] },
  { t: HOLLOW.play[0] + 1.6, v: [1320, 1200, 1.5, 0] },
  { t: HOLLOW.play[1], v: [1260, 1200, 1.5, 0] },
  { t: HOLLOW.hide[0] + 0.8, v: [1190, 1238, 2.7, 0] },
  { t: HOLLOW.hide[1], v: [1200, 1236, 2.8, 0] },
]);

const WAKE_CAM = new Track([
  { t: WAKE.fadeUp[0], v: [1350, 1190, 1.9, 0] },
  { t: WAKE.rise[1], v: [1340, 1200, 1.7, 0] },
  { t: WAKE.hud[1], v: [1340, 1200, 1, 1] },
]);

/** A staged body: a player state held in place, with the counters a rig reads. */
class Stand {
  readonly s: PlayerState;
  constructor(scene: Scene) {
    this.s = createPlayer(0, MOSS, tuning, scene);
  }

  /** Feet at (x, y); `air` = hanging in the air (fluttering), else standing. */
  set(x: number, y: number, facing: 1 | -1, air: boolean, vy = 0.6): PlayerView {
    const p = this.s;
    p.x = Math.floor(x - p.w / 2);
    p.rx = x - p.w / 2 - p.x;
    p.y = Math.floor(y - p.h);
    p.ry = y - p.h - p.y;
    p.facing = facing;
    p.vx = 0;
    p.vy = air ? vy : 0;
    if (p.grounded === air) p.contactFrames = 0;
    p.grounded = !air;
    p.gliding = false;
    p.motion = air ? 'fall' : 'idle';
    p.motionFrames++;
    p.modeFrames++;
    p.contactFrames++;
    return viewOf(p, p);
  }
}

/** The interpolated view of a body between two states. */
function viewOf(prev: PlayerState, cur: PlayerState, alpha = 1): PlayerView {
  const x = prev.x + prev.rx + (cur.x + cur.rx - prev.x - prev.rx) * alpha;
  const y = prev.y + prev.ry + (cur.y + cur.ry - prev.y - prev.ry) * alpha;
  return { ...cur, x, y, rx: 0, ry: 0, cx: x + cur.w / 2, cy: y + cur.h / 2, feetY: y + cur.h };
}

export class GroveActors {
  private readonly back = new Container({ label: 'prologue-back' });
  private readonly actors = new Container({ label: 'prologue-actors' });
  private readonly front = new Container({ label: 'prologue-front' });
  private readonly threads = new Graphics();
  private readonly cocoons = new Graphics();
  private readonly cocoonGlow: [Sprite, Sprite];
  private readonly frost = new Graphics();
  private readonly paleThread = new Graphics();
  private readonly steam: Sprite[] = [];
  private readonly hollow = new Graphics();
  private readonly caseG = new Graphics();
  private readonly caseGlow: Sprite;
  private readonly pulse = new Graphics();
  private readonly fox = new Fox();
  private readonly foxP = foxPose();
  /** The fox again, asleep inside the case. */
  private readonly sleeper = new Fox();
  private readonly sleeperP = foxPose();
  private readonly ferns = new Container({ label: 'prologue-ferns' });
  private readonly leaf = new Graphics();
  private readonly glint = new Container();
  private readonly prompt = new Graphics();
  private readonly wash: Sprite;
  private readonly lampGlow: Sprite;
  private readonly dance = new Container();
  private readonly danceMoths: Array<{
    c: Container;
    w: Graphics;
    g: Sprite;
    ph: number;
    sp: number;
    r: number;
    silver: boolean;
  }> = [];
  // Lights in the Grove's registry.
  private readonly lights: Record<string, PointLight> = {};
  // The two moths.
  private readonly wingLayer = new Container({ label: 'wing-standin' });
  private readonly wing: VesperCharacter;
  private readonly wingLights = new LightRegistry();
  readonly wingCue: CineCues = newCues();
  private readonly wingStand: Stand;
  private readonly sorrelLayer = new Container({ label: 'sorrel' });
  private readonly sorrelWings = new Graphics();
  private readonly sorrel: VesperCharacter;
  private readonly sorrelLights = new LightRegistry();
  readonly sorrelCue: CineCues = newCues();
  private readonly sorrelStand: Stand;
  // The lampwing.
  private readonly lampScene: Scene;
  private readonly lamp: EnemyRenderer;
  private readonly lampState: EnemyState;
  private readonly cam = { x: 0, y: 0, zoom: 1 };
  /** Drawn positions of the two moths this frame (feet), and their hands. */
  private readonly wingAt = { x: 0, y: 0, hx: 0, hy: 0, on: false };
  private readonly sorrelAt = { x: 0, y: 0, hx: 0, hy: 0, on: false };

  constructor(
    private readonly ctx: RenderContext,
    private readonly layers: LayerTree,
    private readonly plan: ProloguePlan,
  ) {
    const L = layers;
    L.get('goal').addChild(this.back, this.actors);
    L.get('playfieldFront').addChild(this.front);
    L.get('airBack').addChild(this.dance);
    // Back to front: threads and cocoons, the hollow, the fox, the case, the pulse.
    this.cocoonGlow = [soft(60, AMBER, 0), soft(60, AMBER, 0)];
    this.caseGlow = soft(140, PALE, 0);
    this.back.addChild(
      this.threads,
      this.cocoons,
      ...this.cocoonGlow,
      this.paleThread,
      this.hollow,
      this.fox.view,
      this.sleeper.view,
      this.caseG,
      this.caseGlow,
      this.pulse,
    );
    for (let i = 0; i < 8; i++) {
      const s = soft(26, PALE, 0);
      this.steam.push(s);
      this.back.addChild(s);
    }
    // The moths in front of the fox.
    const lift = new ColorMatrixFilter();
    lift.resolution = 'inherit';
    lift.brightness(1.14, false);
    lift.saturate(-0.28, true);
    this.sorrelLayer.filters = [lift];
    this.actors.addChild(this.sorrelWings, this.sorrelLayer, this.wingLayer);
    this.wing = new VesperCharacter({ ...ctx, lights: this.wingLights }, this.wingLayer, {
      cine: this.wingCue,
      link: false,
    });
    this.sorrel = new VesperCharacter({ ...ctx, lights: this.sorrelLights }, this.sorrelLayer, {
      cine: this.sorrelCue,
      link: false,
    });
    this.wingStand = new Stand(ctx.scene);
    this.sorrelStand = new Stand(ctx.scene);
    // In front: frost, ferns, the leaf, the glint, the prompt, the coral wash.
    this.wash = soft(260, CORAL, 0);
    this.lampGlow = soft(54, CORAL, 0);
    this.wash.scale.y *= 0.45;
    this.glint.addChild(soft(34, AMBER, 0.55), soft(9, 0xfff1d4, 1));
    this.back.addChild(this.wash);
    this.front.addChild(this.frost, this.lampGlow, this.ferns, this.leaf, this.glint, this.prompt);
    this.drawFrost();
    this.drawFerns();
    // The dance ring: small moths turning slowly, one with a silver edge.
    for (let i = 0; i < 18; i++) {
      const c = new Container();
      const w = new Graphics();
      const silver = i === 5;
      const span = silver ? 15 : 10 + (i % 4) * 1.5;
      for (const side of [-1, 1]) {
        const pts = [0, 0, side * span * 0.5, -span * 0.32, side * span * 0.42, span * 0.14];
        w.poly(pts).fill({ color: silver ? 0x3a3448 : 0xe8dcc8, alpha: 0.92 });
        if (silver) w.poly(pts).stroke({ color: 0xe8eef8, width: 1.4, alpha: 0.95 });
      }
      const g = soft(silver ? 22 : 18, silver ? 0xdfe8ff : GOLD, 0.5);
      c.addChild(g, w);
      this.dance.addChild(c);
      this.danceMoths.push({
        c,
        w,
        g,
        ph: (i / 18) * Math.PI * 2,
        sp: 0.55 + (i % 5) * 0.06,
        r: 0.8 + (i % 3) * 0.12,
        silver,
      });
    }
    // The lampwing over the pool: the game's own painter on a state of ours.
    const spawn = {
      id: 'prologue-lamp',
      kind: 'lampwing' as const,
      x: HOLLOW.lamp.x,
      y: HOLLOW.lamp.y,
      facing: -1 as const,
    };
    this.lampScene = { ...ctx.scene, enemies: [spawn] };
    const keep = (window as unknown as { __enemies?: unknown }).__enemies;
    this.lamp = new EnemyRenderer({ ...ctx, scene: this.lampScene }, L.enemies, L.enemiesFront);
    (window as unknown as { __enemies?: unknown }).__enemies = keep;
    this.lampState = createEnemy(spawn, tuning);
    for (const id of ['cocoon-a', 'cocoon-b', 'glint', 'sorrel', 'wing', 'wash', 'lamp', 'case', 'fox']) {
      const l: PointLight = { x: 0, y: 0, radius: 200, color: AMBER, intensity: 0 };
      this.lights[id] = l;
      ctx.lights.set(`prologue-${id}`, l);
    }
    this.lights.wash!.color = CORAL;
    this.lights.wash!.radius = 320;
    this.lights.lamp!.color = CORAL;
    this.lights.case!.color = PALE;
    this.lights.fox!.color = 0xff8a3a;
    this.lights.fox!.radius = 140;
  }

  private drawFrost(): void {
    const g = this.frost;
    const rng = prng(7171);
    // Rime on the moss: fine glints of frost along the blades' tips, denser near the cocoons.
    for (let i = 0; i < 220; i++) {
      const x = 1060 + rng() * 560;
      const y = MOSS - 2 - rng() * rng() * 34;
      const r = 0.5 + rng() * 1.1;
      g.circle(x, y, r).fill({ color: 0xeef4ff, alpha: 0.35 + 0.4 * rng() });
      if (rng() < 0.3) {
        g.moveTo(x - r * 2.5, y)
          .lineTo(x + r * 2.5, y)
          .stroke({ color: 0xeef4ff, width: 0.5, alpha: 0.4 });
      }
    }
  }

  private drawFerns(): void {
    const rng = prng(3131);
    for (let i = 0; i < 6; i++) {
      const f = new Container();
      const g = new Graphics();
      fern(rng, g, 120 + rng() * 80, (rng() - 0.4) * 0.5, 0x04070a, 0x060b0c, 0x0a1210);
      f.addChild(g);
      f.position.set(HOLLOW.ferns - 250 + i * 40 + rng() * 16, MOSS + 8);
      f.rotation = (rng() - 0.5) * 0.7;
      this.ferns.addChild(f);
    }
  }

  /** The camera this frame, or null to leave the game's camera alone. */
  camera(follow: CameraView, p: PlayerView): CameraView | null {
    const P = this.plan;
    let v: readonly number[] | null = null;
    if (P.beat === 'hatch') v = HATCH_CAM.sample(P.bt);
    else if (P.beat === 'hollow') v = HOLLOW_CAM.sample(P.bt);
    else if (P.beat === 'wake') v = WAKE_CAM.sample(P.bt);
    else if (P.beat === 'play') {
      // The follow camera, leaning toward him so he is in frame ahead of her; wider up on F3-F4
      // (the dance at the top of frame, the pool's lip at the bottom); in on her while she holds the glint.
      const s = P.sorrel?.cur;
      const lead = s ? Math.max(-500, Math.min(500, s.x + s.w / 2 - p.cx)) * 0.32 : 0;
      const wide = window01(-p.feetY, -900, -720) * window01(p.cx, 1250, 1450);
      // Close on the two of them for the glint: held, given, kept up.
      const close =
        P.phase === 'hold' || P.phase === 'give' || P.phase === 'his' || P.phase === 'bumps' ? 1 : 0;
      this.holdK += (close - this.holdK) * 0.04;
      const z = 1 - 0.2 * wide;
      const mx = s ? (p.cx + s.x + s.w / 2) / 2 : p.cx;
      const my = p.cy - (P.phase === 'bumps' ? 90 : 40);
      this.cam.x = follow.x + lead + (mx - follow.x - lead) * this.holdK * 0.9;
      this.cam.y = follow.y - 60 * wide + (my - follow.y + 60 * wide) * this.holdK * 0.9;
      this.cam.zoom = z + ((P.phase === 'bumps' ? 1.55 : 1.9) - z) * this.holdK;
      return this.cam;
    }
    if (!v) return null;
    const [x, y, zoom, game] = v as [number, number, number, number];
    this.cam.x = x + (follow.x - x) * game;
    this.cam.y = y + (follow.y - y) * game;
    this.cam.zoom = zoom + (follow.zoom - zoom) * game;
    return this.cam;
  }

  private holdK = 0;

  update(dt: number, clock: number, view: CameraView, sim: SimView): void {
    const P = this.plan;
    const inGrove = P.beat === 'hatch' || P.beat === 'play' || P.beat === 'hollow' || P.beat === 'wake';
    this.back.visible = this.actors.visible = this.front.visible = this.dance.visible = inGrove;
    for (const l of Object.values(this.lights)) l.intensity = 0;
    POST_CINE.frost = P.beat === 'hatch' ? 1 - window01(P.bt, HATCH.frostOut[0], HATCH.frostOut[1]) : 0;
    POST_CINE.dim =
      P.beat === 'hollow'
        ? 0.7 * window01(P.bt, HOLLOW.dim[0], HOLLOW.dim[1]) * (1 - 0.5 * window01(P.bt, 38.5, 40))
        : 0;
    if (!inGrove) {
      this.wingAt.on = this.sorrelAt.on = false;
      return;
    }
    this.updateCocoons(clock);
    this.updateFox(clock);
    this.updateHollow(clock);
    this.updateDance(clock);
    this.updateMoths(dt, clock, sim);
    this.updateGlint(clock);
    this.updateLamp(dt, clock, view, sim);
    this.updateFront(clock);
  }

  // --- The cocoons, and the husks they leave. Frost creeps up hers while she is in it.
  private updateCocoons(clock: number): void {
    const P = this.plan;
    const g = this.cocoons;
    const th = this.threads;
    g.clear();
    th.clear();
    const hatch = P.beat === 'hatch';
    const frost = POST_CINE.frost;
    const list = [
      { c: HATCH.sorrel, split: HATCH.sorrelSplit, ph: 0.9 },
      { c: HATCH.wing, split: HATCH.wingSplit, ph: 0 },
    ];
    for (const [i, it] of list.entries()) {
      const { c, split, ph } = it;
      const st = hatch ? P.bt : 99;
      const open = window01(st, split - 0.15, split + 0.35);
      const sway =
        Math.sin(clock * 0.9 + ph) * 2.2 +
        Math.sin(clock * 2.3 + ph) * 0.6 +
        (st > split && st < split + 4 ? Math.sin((st - split) * 5) * 5 * Math.exp(-(st - split) * 1.2) : 0);
      const x = c.x + sway;
      const top = c.y - 40;
      th.moveTo(c.x, top - 700)
        .quadraticCurveTo(c.x + sway * 0.3, top - 300, x, top)
        .stroke({ color: 0xc8c0b0, width: 0.9, alpha: 0.45 });
      const pts: number[] = [];
      const N = 22;
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2;
        const sy = Math.cos(a);
        const sx = Math.sin(a);
        const w = 19 * (0.5 + 0.45 * (1 - sy) * 0.5 + 0.25 * Math.sin((1 - sy) * 1.6));
        let yy = top + 40 - sy * 40;
        if (open > 0 && sy < -0.2) yy -= open * (12 + 6 * Math.sin(k * 2.7)) * (-sy - 0.2);
        pts.push(x + sx * w * (1 + open * 0.15 * (sy < 0 ? -sy : 0)), yy);
      }
      g.poly(pts).fill({ color: open > 0.5 ? 0x6a6458 : 0x9a917f, alpha: 0.96 });
      for (let k = 1; k < 9; k++) {
        const yy = top + k * 9;
        const w = 17 * Math.sin((k / 9) * Math.PI) * 0.95;
        g.moveTo(x - w, yy + 2)
          .quadraticCurveTo(x, yy - 2, x + w, yy + 3)
          .stroke({ color: 0xe8dcc4, width: 0.8, alpha: 0.4 * (1 - open * 0.6) });
      }
      // Frost on it (hers creeps up from the bottom while she waits inside).
      if (frost > 0.01) {
        const creep = i === 1 ? window01(st, HATCH.wait[0] - 2, HATCH.wingSplit) : 0.5;
        for (let k = 0; k < 7; k++) {
          const yy = top + 80 - k * 11 * (0.3 + creep);
          const xx = x + Math.sin(k * 2.1 + i) * 12;
          g.moveTo(xx, yy)
            .lineTo(xx + 5 * Math.sin(k), yy - 7)
            .lineTo(xx - 3, yy - 12)
            .stroke({ color: 0xf0f6ff, width: 0.9, alpha: 0.6 * frost });
        }
      }
      if (open > 0.02) {
        const lip = top + 80 - 16 * open;
        g.ellipse(x, lip, 12 * open, 5 * open).fill({ color: 0x15120f, alpha: 0.95 });
        for (let k = 0; k < 4; k++) {
          const fx = x - 12 + k * 8;
          const len = (8 + 7 * Math.sin(k * 2.3 + 1)) * open;
          g.moveTo(fx, lip)
            .quadraticCurveTo(fx + (k - 1.5) * 3, lip + len * 0.6, fx + (k - 1.5) * 4 + sway * 0.2, lip + len)
            .stroke({ color: 0xb8ae98, width: 2.2, alpha: 0.7 * open, cap: 'round' });
        }
      }
      // Amber breathing inside, on the breath's own rhythm (5 s: the match cut from the black).
      const b = 0.5 - 0.5 * Math.cos((2 * Math.PI * (hatch ? P.bt : clock)) / 5 + ph * 0.3);
      const alive = 1 - window01(st, split, split + 0.6);
      const glow = this.cocoonGlow[i]!;
      glow.position.set(x, top + 46);
      glow.alpha = (0.18 + 0.2 * b) * alive;
      const light = this.lights[i === 0 ? 'cocoon-a' : 'cocoon-b']!;
      light.x = x;
      light.y = top + 46;
      light.intensity = (0.4 + 0.35 * b) * alive;
      if (alive > 0.01)
        g.ellipse(x, top + 46, 9, 17).fill({ color: 0xffb070, alpha: (0.16 + 0.18 * b) * alive });
    }
  }

  // --- The fox: asleep, then up and to the water (when the race starts), drinking, the sneeze; the hollow takes it.
  private updateFox(clock: number): void {
    const P = this.plan;
    const o = this.foxP;
    let x: number = HATCH.fox;
    o.breath = clock * 1.1;
    o.walking = 0;
    o.drink = 0;
    o.shake = 0;
    o.sneeze = 0;
    o.sink = 0;
    o.curl = 1;
    o.eyes = 0;
    o.ember = 1;
    let shown = true;
    if (P.beat === 'play') {
      const wake = P.raceAt < 0 ? 0 : P.pt - P.raceAt;
      if (wake > 0) {
        o.curl = 1 - window01(wake, 0, 1.2);
        o.eyes = window01(wake, 0.2, 0.8);
        const walk = window01(wake, 1.4, 5);
        x = HATCH.fox + (FOX_DRINK - HATCH.fox) * walk;
        o.walking = envelope(wake, 1.3, 1.7, 4.6, 5.2);
        o.walk = wake * 1.3;
        o.drink = window01(wake, 5.2, 6.2) * (0.85 + 0.15 * Math.sin(clock * 2.2));
      }
      if (P.sneezeAt >= 0) {
        const s = P.pt - P.sneezeAt;
        o.sneeze = envelope(s, 0, 0.1, 0.3, 0.9);
        o.drink *= 1 - envelope(s, 0, 0.1, 0.8, 1.6);
      }
    } else if (P.beat === 'hollow') {
      x = FOX_DRINK;
      const t = P.bt;
      o.curl = 0;
      o.eyes = 1 - window01(t, HOLLOW.sink[0] + 0.5, HOLLOW.sink[1] - 1.5);
      o.shake = envelope(t, HOLLOW.shake[0], 0.2, 0.7, HOLLOW.shake[1]);
      const [d1, d2] = HOLLOW.drinks;
      o.drink = Math.max(
        envelope(t, d1![0], d1![0] + 0.4, d1![1] - 0.3, d1![1]),
        envelope(t, d2![0], d2![0] + 0.4, d2![1] - 0.2, d2![1] + 3),
      );
      o.drink *= 0.9 + 0.1 * Math.sin(clock * 2.6);
      o.sink = window01(t, HOLLOW.sink[0], HOLLOW.sink[1]);
      // Asleep as it goes down: its head comes down onto its paws.
      o.drink = Math.max(o.drink * (1 - o.sink), 0.4 * o.sink);
      shown = t < HOLLOW.sink[1] + 0.2;
    } else if (P.beat === 'wake') shown = false;
    this.fox.view.visible = shown;
    this.fox.view.position.set(x, MOSS);
    this.fox.draw(o, clock);
    this.foxX = x;
    if (shown) {
      const l = this.lights.fox!;
      l.x = x + this.fox.tip[0];
      l.y = MOSS + this.fox.tip[1];
      l.intensity = 0.7 * o.ember * (1 - o.sink);
    }
  }

  private foxX: number = HATCH.fox;

  // --- The pale thread in the moss; the paling, the hollow, the root tip, the case, the pulse.
  private updateHollow(clock: number): void {
    const P = this.plan;
    const g = this.paleThread;
    g.clear();
    const H = HOLLOW;
    const t = P.beat === 'hollow' ? P.bt : P.beat === 'wake' ? 99 : -1;
    // The thread: always there from the hatching on, at the pool's west lip, steaming faintly.
    const stir = t >= 0 && t < 99 ? window01(t, H.paling[0], H.paling[1]) : 0;
    g.moveTo(1470, MOSS - 1);
    for (let i = 1; i <= 12; i++) {
      const u = i / 12;
      g.lineTo(1470 + u * 74, MOSS - 1 - 1.5 * Math.sin(u * 9 + clock * (0.3 + stir)));
    }
    g.stroke({ color: PALE, width: 1.6 + stir, alpha: 0.75 });
    g.moveTo(1490, MOSS)
      .quadraticCurveTo(1460, MOSS - 4, 1420, MOSS - 1)
      .stroke({ color: PALE, width: 1, alpha: 0.5 });
    // The moss round the fox's forepaws turns pale, like frost but softer.
    if (stir > 0.01 && t < H.close[1]) {
      g.ellipse(H.x + 60, MOSS - 1, 90 * stir, 5 * stir).fill({ color: PALE, alpha: 0.3 * stir });
    }
    // Steam off the thread (and the hollow, the case).
    const big = t >= 0 ? window01(t, H.open[0], H.open[1]) * (1 - window01(t, 30, 40) * 0.5) : 0;
    for (const [i, s] of this.steam.entries()) {
      const u = (clock * 0.22 + i / this.steam.length) % 1;
      const sx = (big > 0.2 ? H.x - 60 + i * 18 : 1474 + i * 9) + Math.sin(clock * 0.7 + i) * 6;
      s.position.set(sx, MOSS - 6 - u * (40 + 80 * big));
      s.alpha = (0.05 + 0.12 * big) * Math.sin(u * Math.PI);
      s.setSize(30 + 40 * u + 30 * big, 30 + 40 * u + 30 * big);
    }
    // The hollow: lips of root round a dark mouth; it opens, the fox goes down, it closes.
    const h = this.hollow;
    h.clear();
    const open =
      t >= 0 && t < 99 ? window01(t, H.open[0], H.open[1]) * (1 - window01(t, H.close[0], H.close[1])) : 0;
    if (open > 0.01) {
      const cx = H.x + 30;
      h.ellipse(cx, MOSS + 3, 158 * open, 26 * open).fill({ color: 0x0a0b10, alpha: 0.6 });
      h.ellipse(cx, MOSS + 3, 140 * open, 20 * open).fill({ color: 0x050609, alpha: 0.95 });
      // Lips of root curling over the edge, broken, uneven, pale; they breathe.
      const br = 1 + 0.04 * Math.sin(clock * 0.98);
      for (let i = 0; i < 14; i++) {
        const a0 = (i / 14) * Math.PI * 2 + 0.2 * Math.sin(i * 3.1);
        const lx = cx + Math.cos(a0) * 146 * open * br;
        const ly = MOSS + 3 + Math.sin(a0) * 22 * open;
        const len = (16 + 12 * Math.abs(Math.sin(i * 1.7))) * open;
        const dir = Math.sin(a0) < 0 ? -1 : 1;
        h.moveTo(lx - Math.cos(a0) * 10, ly - dir * 3)
          .quadraticCurveTo(
            lx + Math.cos(a0) * len * 0.4,
            ly - 6 * dir - 6,
            lx + Math.cos(a0) * len * 0.2,
            ly + dir * 2,
          )
          .stroke({ color: i % 3 === 0 ? 0xbfb5aa : PALE, width: 2.2 + (i % 2), alpha: 0.75, cap: 'round' });
      }
    }
    // The root tip: up out of it to her face, a pause, back down. It looked, and did not see.
    if (t >= H.rootTip[0] && t < H.rootTip[1]) {
      const k = envelope(t, H.rootTip[0], H.rootTip[0] + 1.1, H.rootTip[1] - 1.1, H.rootTip[1]);
      const tx = this.wingAt.x + 6;
      const ty = this.wingAt.y - 60;
      const bx = H.x + 10;
      const by = MOSS;
      const ex = bx + (tx - bx) * k;
      const ey = by + (ty + 12 - by) * k;
      h.moveTo(bx - 10, by)
        .bezierCurveTo(bx - 4, by - 50 * k, ex + 20, ey + 40, ex, ey)
        .stroke({ color: PALE, width: 3, alpha: 0.9, cap: 'round' });
      h.circle(ex, ey, 2.4).fill({ color: 0xf4eee8, alpha: 0.9 });
    }
    // The case: up out of the closing hollow on a pale stalk, bone, the fox asleep inside, breathing.
    const c = this.caseG;
    c.clear();
    this.caseGlow.alpha = 0;
    const rise = t >= 0 ? window01(t, H.caseRise[0], H.caseRise[1]) : 0;
    this.sleeper.view.visible = rise > 0.01;
    if (rise > 0.01) {
      const b = 0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / 6.4);
      const rx = H.caseRx * (0.35 + 0.65 * rise);
      const ch = H.caseH * rise * (1 + 0.02 * b);
      const cx = H.x + 30;
      const bottom = MOSS - H.stalk * rise;
      const cy = bottom - ch / 2;
      // Stalk: thick, pale, rooted in the moss.
      c.poly([cx - 16, MOSS + 2, cx - 9, bottom + 6, cx + 9, bottom + 6, cx + 18, MOSS + 2]).fill({
        color: 0x9a9088,
      });
      c.moveTo(cx - 34, MOSS + 1)
        .quadraticCurveTo(cx - 14, MOSS - 6, cx - 10, bottom + 8)
        .stroke({ color: PALE, width: 2, alpha: 0.6 });
      // The fox asleep inside (drawn under the skin), breathing.
      const sp = this.sleeperP;
      sp.curl = 1;
      sp.eyes = 0;
      sp.ember = 0;
      sp.sink = 0;
      sp.breath = clock * 0.9;
      this.sleeper.view.position.set(cx - 4, cy + ch * 0.4);
      this.sleeper.view.scale.set(0.62 * (0.5 + 0.5 * rise));
      this.sleeper.view.alpha = rise;
      this.sleeper.view.tint = 0x58546a;
      this.sleeper.draw(sp, clock);
      // The case: a lens of bone-pale skin, thick at its rim, thin (lit through) in the middle.
      // A cocoon lying on its stalk: full in the middle, drawn to a point at each end.
      const lens = (sc: number): number[] => {
        const pts: number[] = [];
        for (let i = 0; i <= 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          const x = Math.cos(a);
          const y = Math.sin(a) * (0.55 + 0.45 * (1 - Math.abs(Math.cos(a)) ** 3));
          pts.push(cx + x * rx * sc, cy + y * (ch / 2) * sc);
        }
        return pts;
      };
      c.poly(lens(1)).fill({ color: 0x8e867e, alpha: 0.28 });
      c.poly(lens(0.8)).fill({ color: 0xd8d0c6, alpha: 0.06 });
      // Silk wraps round it, and veins.
      for (let i = 1; i < 8; i++) {
        const u = i / 8;
        const xx = cx - rx + 2 * rx * u;
        const hh = (ch / 2) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) * 0.96;
        c.moveTo(xx - 6, cy - hh)
          .quadraticCurveTo(xx + 8, cy, xx - 4, cy + hh)
          .stroke({ color: 0xe8e0d6, width: 1.1, alpha: 0.35 });
      }
      c.poly(lens(1)).stroke({ color: 0xe0d8ce, width: 2.4, alpha: 0.75 });
      c.poly(lens(0.94)).stroke({ color: 0xc8beb4, width: 1.2, alpha: 0.4 });
      this.caseGlow.position.set(cx, cy);
      this.caseGlow.alpha = (0.05 + 0.05 * b) * rise;
      const l = this.lights.case!;
      l.x = cx;
      l.y = cy;
      l.radius = 200;
      l.intensity = (0.18 + 0.12 * b) * rise;
      this.caseTop = { x: cx, y: cy - ch / 2 };
    }
    // The pulse: up the stalk, through the case, on up into the dark to where the lamp hangs.
    const p = this.pulse;
    p.clear();
    if (t >= H.pulse[0] && t < H.lampLit[1] + 1.5) {
      const u = window01(t, H.pulse[0], H.pulse[1]);
      const fade = 1 - window01(t, H.lampLit[1], H.lampLit[1] + 1.5);
      const x0 = this.caseTop.x;
      const y0 = MOSS;
      const y1 = H.lamp.y + 16;
      p.moveTo(x0, y0)
        .lineTo(x0 + (H.lamp.x - x0) * u, y0 + (y1 - y0) * u)
        .stroke({ color: PALE, width: 1.2, alpha: 0.35 * fade });
      const by = y0 + (y1 - y0) * u;
      p.circle(x0 + (H.lamp.x - x0) * u, by, 3.5).fill({
        color: 0xffffff,
        alpha: 0.9 * fade * (u < 1 ? 1 : 0),
      });
    }
  }

  private caseTop = { x: HOLLOW.x + 30, y: MOSS - 150 };

  // --- The dance high above; the silver-edged moth sweeps low past him when he stops racing.
  private updateDance(clock: number): void {
    const P = this.plan;
    const D = COURSE.dance;
    for (const [i, m] of this.danceMoths.entries()) {
      const a = clock * m.sp * 0.6 + m.ph;
      let x = D.x + Math.cos(a) * D.rx * m.r + Math.sin(a * 2.3 + i) * 8;
      let y = D.y + Math.sin(a) * D.ry * m.r + Math.cos(a * 3.1 + i) * 5;
      if (m.silver && P.beat === 'play' && P.stopAt >= 0) {
        const s = P.pt - P.stopAt;
        const k = envelope(
          s,
          COURSE.silverSweep[0],
          COURSE.silverSweep[0] + 0.9,
          COURSE.silverSweep[1] - 0.9,
          COURSE.silverSweep[1],
        );
        const u = window01(s, COURSE.silverSweep[0], COURSE.silverSweep[1]);
        const sx = this.sorrelAt.x - 120 + 240 * u;
        const sy = this.sorrelAt.y - 90 + Math.sin(u * Math.PI) * 30;
        x += (sx - x) * k;
        y += (sy - y) * k;
      }
      m.c.position.set(x, y);
      m.w.scale.y = 0.25 + 0.75 * Math.abs(Math.sin(clock * (12 + (i % 4)) + i));
      m.g.alpha = (m.silver ? 0.55 : 0.4) + 0.45 * Math.max(0, Math.sin(clock * 3.3 + i * 1.7));
    }
  }

  // --- The two moths.
  private updateMoths(dt: number, clock: number, sim: SimView): void {
    const P = this.plan;
    const W = this.wingCue;
    const S = this.sorrelCue;
    for (const c of [W, S]) for (const k of Object.keys(c) as (keyof CineCues)[]) c[k] = 0;
    const her = sim.player;
    const t = P.bt;
    let wv: PlayerView | null = null;
    let sv: PlayerView | null = null;
    const gs = P.sorrel ? viewOf(P.sorrel.prev, P.sorrel.cur, sim.alpha) : null;
    const facing = (from: number, to: number): 1 | -1 => (to >= from ? 1 : -1);
    if (P.beat === 'hatch') {
      if (t >= HATCH.wingSplit + 0.1) {
        wv = { ...her, facing: t >= HATCH.lookFox[0] ? -1 : 1 };
        W.huddle =
          window01(t, HATCH.huddle[0], HATCH.huddle[0] + 0.4) *
          (1 - window01(t, HATCH.fold[1] - 1.6, HATCH.fold[1]));
        W.shake = envelope(
          t,
          HATCH.fold[1] - 1,
          HATCH.fold[1] - 0.6,
          HATCH.fold[1] + 0.2,
          HATCH.fold[1] + 0.6,
        );
        W.look = 0;
      }
      if (gs && t >= HATCH.sorrelSplit + 0.1) {
        const toHer = facing(gs.cx, her.cx);
        let f: 1 | -1 = gs.facing;
        if (t >= HATCH.wait[0] && t < HATCH.ready[0]) f = toHer;
        if (t >= HATCH.ready[0]) f = -1;
        sv = { ...gs, facing: f };
        S.shake = envelope(
          t,
          HATCH.sorrelShake[0],
          HATCH.sorrelShake[0] + 0.15,
          HATCH.sorrelShake[1] - 0.3,
          HATCH.sorrelShake[1],
        );
        S.lookUp = envelope(
          t,
          HATCH.lookUp[0],
          HATCH.lookUp[0] + 0.5,
          HATCH.lookUp[1] - 0.4,
          HATCH.lookUp[1],
        );
        S.fold = envelope(t, HATCH.fold[0], HATCH.fold[0] + 1, HATCH.fold[1] - 0.6, HATCH.fold[1]);
        S.tap = envelope(t, HATCH.tap[0], HATCH.tap[0] + 0.2, HATCH.tap[1] - 0.25, HATCH.tap[1]);
        W.tap = 0.6 * S.tap;
      }
    } else if (P.beat === 'play') {
      wv = her;
      if (gs) {
        sv = gs;
        const toHer = facing(gs.cx, her.cx);
        if (P.phase === 'stop' || P.phase === 'glint') {
          S.lookUp =
            window01(P.pt - P.stopAt, 0, 0.6) *
            (P.phase === 'glint' ? 1 - window01(P.pt - P.phaseAt, 0.8, 1.6) : 1);
        }
        if (P.phase === 'his') {
          const s = P.pt - P.phaseAt;
          S.hold = envelope(
            s,
            COURSE.hisHold[0] + 0.4,
            COURSE.hisHold[0] + 0.9,
            COURSE.hisLook[1],
            COURSE.toss,
          );
          sv = { ...gs, facing: toHer };
        }
        if (P.phase === 'give' || P.phase === 'hold' || P.phase === 'bumps' || P.phase === 'glint')
          sv = { ...gs, facing: toHer };
      }
      if (P.phase === 'hold') W.hold = window01(P.pt - P.phaseAt, 0, 0.6);
      if (P.phase === 'give') W.hold = 0.55;
    } else if (P.beat === 'hollow') {
      ({ wv, sv } = this.hollowMoths(t, her, clock));
    } else if (P.beat === 'wake') {
      if (t >= WAKE.fadeUp[0]) {
        wv = { ...her, facing: 1 };
        W.huddle = 1 - window01(t, WAKE.rise[0], WAKE.rise[1]);
      }
    }
    // In the ferns, against the coral: two silhouettes.
    const sil = P.beat === 'hollow' ? window01(t, HOLLOW.hide[0] - 0.4, HOLLOW.hide[0] + 0.4) : 0;
    const shade = Math.round(255 - 225 * sil);
    const tint = (shade << 16) | (shade << 8) | Math.min(255, shade + 8);
    this.wingLayer.tint = tint;
    this.sorrelLayer.tint = tint;
    // Draw (or hide) each, and lend its light to the Grove.
    this.drawMoth(this.wing, this.wingLayer, wv, dt, clock, this.wingLights, this.lights.wing!, this.wingAt);
    this.drawMoth(
      this.sorrel,
      this.sorrelLayer,
      sv,
      dt * 1.25,
      clock * 1.25 + 7,
      this.sorrelLights,
      this.lights.sorrel!,
      this.sorrelAt,
    );
    this.drawSorrelWings(sv, clock);
  }

  /** The hollow, staged: on the fox's back, up over the hollow, down beside the case; in the escape, hers is the sim's. */
  private hollowMoths(t: number, her: PlayerView, clock: number): { wv: PlayerView; sv: PlayerView } {
    const H = HOLLOW;
    const W = this.wingCue;
    const S = this.sorrelCue;
    const backY = MOSS - 132;
    const hover = { x: H.x + 10, y: MOSS - 118 + 4 * Math.sin(clock * 3) };
    const side = H.x + 30 - H.caseRx - 12;
    // Hers.
    let wv: PlayerView;
    if (t < H.play[0]) {
      const up = window01(t, H.flutter[0], H.flutter[1]);
      const down = window01(t, H.land[0], H.land[1]);
      const x = FOX_DRINK + 10 + (hover.x - FOX_DRINK - 10) * up + (side - hover.x) * down;
      const y = backY + (hover.y - backY) * up + (MOSS - hover.y) * down;
      const air = up > 0.02 && down < 0.98;
      wv = this.wingStand.set(x, y, t > H.land[0] ? 1 : -1, air, air ? 0.4 * Math.sin(clock * 9) : 0);
      W.huddle = t < H.paling[0] ? 0.3 : 0;
      W.fold = window01(t, H.fold[0], H.fold[0] + 0.8);
      W.hold = t < H.flutter[0] ? 0.4 : 0;
    } else {
      const sim = her;
      wv = sim;
      if (this.plan.tackleAt >= 0) {
        const k = window01(t, this.plan.tackleAt, this.plan.tackleAt + 0.9);
        const tk = this.wingStand.set(
          side + (H.ferns - 70 - side) * k,
          MOSS - 30 * Math.sin(k * Math.PI),
          -1,
          k > 0 && k < 1,
        );
        if (t < this.plan.tackleAt + 0.9) wv = tk;
      }
      W.fold = Math.max(
        this.plan.fold,
        t < H.play[0] + 0.5 ? 1 - window01(t, H.play[0], H.play[0] + 0.5) : 0,
      );
    }
    // His.
    let sv: PlayerView;
    if (t < H.play[0]) {
      const up = window01(t, H.flutter[0], H.flutter[1]);
      const x = FOX_DRINK - 40 + (hover.x - 70 - FOX_DRINK + 40) * up;
      const y = backY + 4 + (hover.y - 20 - backY - 4) * up;
      // Half asleep in the fur; then up; he hovers behind her, not landing, looking round.
      sv = this.sorrelStand.set(
        x,
        y,
        up > 0.5 ? (Math.sin(t * 0.9) > 0 ? 1 : -1) : 1,
        up > 0.02,
        0.4 * Math.sin(clock * 9 + 1),
      );
      S.huddle = t < H.flutter[0] ? 0.6 : 0;
    } else {
      // In the ferns, beckoning; then out to tug at her (or to tackle her).
      const fx = H.ferns - 110;
      let x = fx;
      let air = false;
      const tug = envelope(t, 30.6, 31.2, 31.6, 32.4) * (her.cx > H.ferns + 20 ? 1 : 0);
      x += (her.cx - 40 - fx) * tug;
      if (this.plan.tackleAt >= 0) {
        const k = envelope(
          t,
          this.plan.tackleAt - 0.3,
          this.plan.tackleAt + 0.1,
          this.plan.tackleAt + 0.6,
          this.plan.tackleAt + 1,
        );
        x += (her.cx - fx) * k;
        air = k > 0.1 && k < 0.9;
      }
      sv = this.sorrelStand.set(x, MOSS - (air ? 30 : 0), her.cx > x ? 1 : -1, air);
      S.fold = t < H.hide[0] ? 0.8 * Math.max(0, Math.sin((t - H.play[0]) * 1.4)) : 0.6;
      S.tap = t < H.hide[0] ? 0.5 * Math.max(0, Math.sin(t * 4)) : 0;
      S.lookUp = window01(t, H.hide[1] - 1.6, H.hide[1] - 0.8);
    }
    return { wv, sv };
  }

  private drawMoth(
    skin: VesperCharacter,
    layer: Container,
    v: PlayerView | null,
    dt: number,
    clock: number,
    reg: LightRegistry,
    out: PointLight,
    at: { x: number; y: number; hx: number; hy: number; on: boolean },
  ): void {
    layer.visible = !!v;
    at.on = !!v;
    if (!v) return;
    skin.update(dt, clock, v, []);
    at.x = v.cx;
    at.y = v.feetY;
    at.hx = skin.offer.x;
    at.hy = skin.offer.y;
    const l = reg.get('ember');
    if (l) {
      out.x = l.x;
      out.y = l.y;
      out.radius = l.radius;
      out.color = l.color;
      out.intensity = l.intensity;
    }
  }

  /** His flight wings (delta forewings swept back, hindwings tucked), whenever he is in the air. */
  private drawSorrelWings(v: PlayerView | null, clock: number): void {
    const g = this.sorrelWings;
    g.clear();
    if (!v || v.grounded) return;
    const x = v.cx;
    const y = v.feetY - 50;
    const ph = clock * 2 * Math.PI * 7.5;
    const a = -0.35 + 0.75 * Math.sin(ph);
    const k = 0.85 + 0.15 * Math.abs(Math.cos(ph));
    const fore: Array<[number, number]> = [
      [0, -2],
      [20, -12],
      [44, -6],
      [50, 2],
      [34, 14],
      [12, 16],
      [2, 8],
    ];
    const hind: Array<[number, number]> = [
      [0, 6],
      [16, 12],
      [26, 22],
      [18, 32],
      [6, 26],
    ];
    for (const side of [-1, 1]) {
      const tf = (pts: Array<[number, number]>, sk: number, lag: number): number[] =>
        pts.flatMap(([px, py]) => {
          const c2 = Math.cos(a * lag);
          const s2 = Math.sin(a * lag);
          const rx = px * k * sk;
          return [
            x + side * (rx * c2 - py * s2 * 0.4),
            y + rx * s2 * 0.9 + py * (lag === 1 ? Math.cos(a) : 1) + Math.sin(a) * 2,
          ];
        });
      g.poly(tf(hind, 0.8, 0.6)).fill({ color: 0x2c1f3e, alpha: 0.95 });
      const f = tf(fore, 0.85, 1);
      g.poly(f).fill({ color: 0x4e3866, alpha: 0.95 });
      g.poly(f).stroke({ color: 0xc4b4aa, width: 1.2, alpha: 0.4 });
    }
  }

  // --- The glint: where the director has it, or in a hand.
  private updateGlint(clock: number): void {
    const P = this.plan;
    const gl = P.glint;
    let on = false;
    let x = gl.x;
    let y = gl.y;
    if (P.beat === 'play' && gl.on) {
      on = true;
      if (gl.holder === 'wing' && this.wingAt.on) {
        x = this.wingAt.hx;
        y = this.wingAt.hy - 4;
      } else if (gl.holder === 'sorrel' && this.sorrelAt.on) {
        // It streams from her hand to his.
        const k = window01(P.pt - P.phaseAt, 0, 0.6);
        x = this.wingAt.hx + (this.sorrelAt.hx - this.wingAt.hx) * k;
        y = this.wingAt.hy + (this.sorrelAt.hy - this.wingAt.hy) * k - Math.sin(k * Math.PI) * 30;
      }
    } else if (P.beat === 'hollow' && this.wingAt.on) {
      on = true;
      x = this.wingAt.hx;
      y = this.wingAt.hy - 4;
    }
    this.glint.visible = on;
    if (!on) return;
    const pulse = 0.85 + 0.15 * Math.sin(clock * 3.4);
    // Folded under her wing it shows only as a thread of amber.
    const hidden = P.beat === 'hollow' ? 0.85 * P.fold : 0;
    this.glint.position.set(x, y);
    this.glint.alpha = pulse * (1 - hidden);
    const l = this.lights.glint!;
    l.x = x;
    l.y = y;
    l.radius = 230;
    l.intensity = 1.25 * pulse * (1 - hidden);
  }

  // --- The lampwing over the pool: dark, then the Hush looks through it; its lamp turns to her light.
  private updateLamp(dt: number, clock: number, view: CameraView, sim: SimView): void {
    const P = this.plan;
    const H = HOLLOW;
    const e = this.lampState;
    const on = P.beat === 'hollow';
    e.gone = !on;
    const t = P.bt;
    const lit = on
      ? window01(t, H.lampLit[0], H.lampLit[1]) * (1 - window01(t, H.hide[1] - 1, H.hide[1] - 0.3))
      : 0;
    const frame = Math.floor(P.t * 60);
    // Where it looks: at her light (the glint), then (in the ferns) where it was, then the case.
    const tx = this.wingAt.on ? this.wingAt.hx : H.x;
    const ty = this.wingAt.on ? this.wingAt.hy : MOSS - 60;
    const cx = H.lamp.x + Math.sin(clock * 0.6) * 6;
    const cy = H.lamp.y + Math.sin(clock * 0.9) * 4;
    e.x = Math.floor(cx - e.w / 2);
    e.rx = cx - e.w / 2 - e.x;
    e.y = Math.floor(cy - e.h / 2);
    e.ry = cy - e.h / 2 - e.y;
    const dl = Math.hypot(tx - cx, ty - cy) || 1;
    const turn = on ? window01(t, H.lampTurn[0], H.lampTurn[1]) : 0;
    e.lookX = ((tx - cx) / dl) * turn;
    e.lookY = ((ty - cy) / dl) * turn + 0.6 * (1 - turn);
    e.facing = tx < cx ? -1 : 1;
    e.mode = lit > 0.5 ? 'curious' : 'hover';
    e.flap = (clock * 0.9) % 1;
    const rig = this.lamp.lampRig(0);
    if (rig) rig.cine = { lit };
    this.lamp.update(dt, clock, view, {
      ...sim,
      frame,
      alpha: 1,
      events: [],
      scene: this.lampScene,
      enemies: [e],
    });
    this.lampGlow.position.set(cx, cy + 6);
    this.lampGlow.alpha = on ? 0.55 * lit * (0.85 + 0.15 * Math.sin(clock * 2.3)) : 0;
    if (!on) {
      this.wash.alpha = 0;
      return;
    }
    const ll = this.lights.lamp!;
    ll.x = cx;
    ll.y = cy + 6;
    ll.radius = 260;
    ll.intensity = 1.6 * lit;
    // The coral wash: down the bark toward her; over the ferns it slows and stops; on; back to the case; dark.
    const w = this.wash;
    let wx = H.x;
    let wy = H.lamp.y + 200;
    let k = 0;
    if (t >= H.washIn[0]) {
      const u = window01(t, H.washIn[0], H.washIn[1]);
      wx = H.x - 40 + (this.wingAt.x - H.x + 40) * u * 0.9;
      wy = H.lamp.y + 240 + (MOSS - 30 - H.lamp.y - 240) * u;
      k = window01(t, H.washIn[0], H.washIn[0] + 1.5);
      if (t >= H.hide[0]) {
        const s = t - H.hide[0];
        const over = H.ferns - 80;
        const cross = window01(s, 0, 1.6);
        const back = window01(s, 2.6, 4);
        wx = this.wingAt.x + 40 + (over - this.wingAt.x - 40) * cross + (H.x + 30 - over) * back;
        wy = MOSS - 30;
        k = 1 - window01(s, 4, 4.8);
      }
    }
    w.position.set(wx, wy);
    w.alpha = 0.6 * k * lit;
    const wl = this.lights.wash!;
    wl.x = wx;
    wl.y = wy;
    wl.intensity = 1.8 * k * lit;
  }

  // --- Frost, ferns, the leaf she wakes under, the give prompt.
  private updateFront(clock: number): void {
    const P = this.plan;
    this.frost.alpha = POST_CINE.frost;
    this.frost.visible = POST_CINE.frost > 0.01;
    this.ferns.visible = P.beat === 'hollow' || P.beat === 'play';
    for (const [i, f] of this.ferns.children.entries()) f.skew.x = Math.sin(clock * 0.8 + i) * 0.03;
    // The leaf: over her where the fox slept, lifting as she wakes.
    const lf = this.leaf;
    lf.clear();
    if (P.beat === 'wake' && P.bt >= WAKE.fadeUp[0]) {
      const k = window01(P.bt, WAKE.rise[0], WAKE.rise[1]);
      const x = WAKE.at.x - 10;
      const y = MOSS - 30 - 60 * k;
      const a = -0.3 - 0.9 * k;
      const pts: number[] = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        const s = Math.sin(u * Math.PI) * 26;
        pts.push(
          x + Math.cos(a) * (u * 120 - 60) - Math.sin(a) * s,
          y + Math.sin(a) * (u * 120 - 60) + Math.cos(a) * s * 0.4,
        );
      }
      for (let i = 16; i >= 0; i--) {
        const u = i / 16;
        const s = -Math.sin(u * Math.PI) * 18;
        pts.push(
          x + Math.cos(a) * (u * 120 - 60) - Math.sin(a) * s,
          y + Math.sin(a) * (u * 120 - 60) + Math.cos(a) * s * 0.4,
        );
      }
      lf.poly(pts).fill({ color: 0x0c2a22, alpha: 1 - 0.7 * k });
    }
    // The give prompt over him: a key cap held down, a ring filling as it is held.
    const pr = this.prompt;
    pr.clear();
    if (P.beat === 'play' && P.prompt && this.sorrelAt.on) {
      const x = this.sorrelAt.x;
      const y = this.sorrelAt.y - 130 + Math.sin(clock * 2) * 2;
      pr.circle(x, y, 16).fill({ color: 0x0b0d16, alpha: 0.45 });
      pr.roundRect(x - 8, y - 7, 16, 14, 3).stroke({ color: 0xf0e6d8, width: 1.5, alpha: 0.85 });
      pr.moveTo(x, y - 3)
        .lineTo(x, y + 3)
        .stroke({ color: 0xf0e6d8, width: 1.5, alpha: 0.85 });
      if (P.give > 0.01)
        pr.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + P.give * Math.PI * 2).stroke({
          color: GOLD,
          width: 2.5,
          alpha: 0.95,
        });
    }
  }

  destroy(): void {
    POST_CINE.frost = 0;
    POST_CINE.dim = 0;
    for (const id of Object.keys(this.lights)) this.ctx.lights.remove(`prologue-${id}`);
    this.wing.destroy();
    this.sorrel.destroy();
    this.lamp.painter.mesh.destroy();
    this.lamp.front.mesh.destroy();
    this.fox.destroy();
    this.sleeper.destroy();
    this.back.destroy({ children: true });
    this.actors.destroy({ children: true });
    this.front.destroy({ children: true });
    this.dance.destroy({ children: true });
    void this.layers;
    void this.foxX;
  }
}
