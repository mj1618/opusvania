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
import { Container, Graphics, Sprite } from 'pixi.js';
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
import { CaseView } from './case';
import { DanceRing } from './dance';
import { Fox, foxPose } from './fox';
import { LOOK, setWingLook, sorrelFilter, wingFilter } from './looks';
import type { ProloguePlan } from './plan';
import { COURSE, FOX_DRINK, HATCH, HOLLOW, MOSS, WAKE, WATER } from './script';
import { drawFlightWings } from './sorrel';
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
  { t: HATCH.pullOut[1], v: [1275, 1175, 3, 0] },
  { t: HATCH.sorrelShake[1], v: [1255, 1222, 3.2, 0] },
  { t: HATCH.lookUp[1], v: [1255, 1175, 2.8, 0] },
  { t: HATCH.wait[1], v: [1365, 1185, 2.8, 0] },
  { t: HATCH.tryOpen[1], v: [1396, 1236, 3.5, 0] },
  { t: HATCH.fold[0] + 1, v: [1392, 1240, 3.9, 0] },
  { t: HATCH.tap[1], v: [1392, 1240, 3.9, 0] },
  { t: HATCH.ready[1], v: [1360, 1222, 3, 0] },
  { t: HATCH.lookFox[1], v: [1360, 1218, 3, 0] },
  { t: HATCH.follow[1], v: [1360, 1218, 1.4, 1] },
]);

const HOLLOW_CAM = new Track([
  { t: 0, v: [1500, 1220, 2.6, 0] },
  { t: HOLLOW.drinks[1]![1], v: [1505, 1230, 2.7, 0] },
  { t: HOLLOW.rootTip[0], v: [1460, 1170, 2.9, 0] },
  { t: HOLLOW.rootTip[0] + 1.4, v: [1458, 1150, 3.4, 0] },
  { t: HOLLOW.rootTip[1], v: [1458, 1150, 3.4, 0] },
  { t: HOLLOW.caseRise[1], v: [1460, 1180, 2.7, 0] },
  { t: HOLLOW.fold[0] + 0.8, v: [1452, 1160, 3.3, 0] },
  { t: HOLLOW.dim[0], v: [1455, 1165, 3.2, 0] },
  // Up the stalk with the pulse, to the lamp as it lights: one thing, the Hush's eye.
  { t: HOLLOW.pulse[0], v: [1470, 1160, 2.4, 0] },
  { t: HOLLOW.pulse[1], v: [1470, 470, 1.9, 0] },
  { t: HOLLOW.play[0] + 0.6, v: [1468, 480, 1.9, 0] },
  { t: HOLLOW.play[0] + 2.2, v: [1330, 1190, 1.6, 0] },
  { t: HOLLOW.play[1], v: [1260, 1200, 1.6, 0] },
  { t: HOLLOW.hide[0] + 0.8, v: [1172, 1232, 3, 0] },
  { t: HOLLOW.hide[1], v: [1176, 1230, 3.1, 0] },
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

/** Between two views by `k` (positions; the pose fields of the nearer). */
function blend(a: PlayerView, b: PlayerView, k: number): PlayerView {
  const base = k < 0.5 ? a : b;
  const x = a.x + (b.x - a.x) * k;
  const y = a.y + (b.y - a.y) * k;
  return { ...base, x, y, cx: x + a.w / 2, cy: y + a.h / 2, feetY: y + a.h };
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
  private readonly caseV = new CaseView();
  private readonly pulse = new Graphics();
  private readonly fox = new Fox();
  private readonly foxP = foxPose();
  /** Rings on the water where the fox's muzzle is in it. */
  private readonly ripples = new Graphics();
  private readonly ferns = new Container({ label: 'prologue-ferns' });
  private readonly leaf = new Graphics();
  private readonly glint = new Container();
  private readonly prompt = new Graphics();
  private readonly wash: Sprite;
  private readonly lampGlow: Sprite;
  private readonly dance = new DanceRing(18, 16);
  private readonly wingLook = wingFilter();
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
    L.get('airBack').addChild(this.dance.view);
    // Back to front: threads and cocoons, the hollow, the fox, the case, the pulse.
    this.cocoonGlow = [soft(60, AMBER, 0), soft(60, AMBER, 0)];
    this.back.addChild(
      this.threads,
      this.cocoons,
      ...this.cocoonGlow,
      this.paleThread,
      this.hollow,
      this.fox.view,
      this.ripples,
      this.caseV.view,
      this.pulse,
    );
    for (let i = 0; i < 8; i++) {
      const s = soft(26, PALE, 0);
      this.steam.push(s);
      this.back.addChild(s);
    }
    // The moths in front of the fox.
    // Two different people: he lighter and bigger, wings half open; she darker, smaller, wings shut.
    this.sorrelLayer.filters = [sorrelFilter()];
    this.wingLayer.filters = [this.wingLook];
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
    // Fronds either side of where the two of them hide (a gap round 1120-1210 so they show).
    const xs = [-250, -200, -160, -24, 14];
    for (let i = 0; i < xs.length; i++) {
      const f = new Container();
      const g = new Graphics();
      fern(rng, g, 120 + rng() * 80, (rng() - 0.4) * 0.5, 0x04070a, 0x060b0c, 0x0a1210);
      f.addChild(g);
      f.position.set(HOLLOW.ferns + xs[i]! + rng() * 10, MOSS + 8);
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
      // Closer than play framing (the glint and the sneeze must read): the follow camera at ~1.4x
      // leaning toward him ahead of her; wider up on F3-F4 (the dance at the top); in on her for the
      // glint; on the two of them and the dance when he stops; on her and the fox for the dive and the sneeze.
      const s = P.sorrel?.cur;
      const sx = s ? s.x + s.w / 2 : p.cx;
      const sy = s ? s.y + s.h / 2 : p.cy;
      const lead = Math.max(-420, Math.min(420, sx - p.cx)) * 0.4;
      const wide = window01(-p.feetY, -900, -720) * window01(p.cx, 1250, 1450);
      let tx = follow.x + lead;
      let ty = follow.y - 70 * wide;
      let tz = 1.4 - 0.15 * wide;
      const ph = P.phase;
      if (ph === 'hold' || ph === 'give' || ph === 'his') {
        tx = (p.cx * 2 + sx) / 3;
        ty = p.cy - 40;
        tz = 1.9;
      } else if (ph === 'bumps') {
        tx = (p.cx + sx) / 2;
        ty = p.cy - 100;
        tz = 1.6;
      } else if (ph === 'stop' || ph === 'glint') {
        tx = (p.cx + sx) / 2;
        ty = sy - 120;
        tz = 1.55;
      } else if (ph === 'sail' || ph === 'nose' || ph === 'end') {
        tx = (p.cx + COURSE.nose.x) / 2;
        ty = Math.min(p.cy, COURSE.nose.y) + 40;
        tz = 1.35;
      }
      if (!this.playCam) this.playCam = { x: tx, y: ty, zoom: tz };
      const c = this.playCam;
      c.x += (tx - c.x) * 0.06;
      c.y += (ty - c.y) * 0.06;
      c.zoom += (tz - c.zoom) * 0.05;
      this.cam.x = c.x;
      this.cam.y = c.y;
      this.cam.zoom = c.zoom;
      return this.cam;
    }
    if (!v) return null;
    const [x, y, zoom, game] = v as [number, number, number, number];
    this.cam.x = x + (follow.x - x) * game;
    this.cam.y = y + (follow.y - y) * game;
    // (`game` takes the follow camera's position only; the zoom is the key's.)
    this.cam.zoom = zoom;
    return this.cam;
  }

  private playCam: { x: number; y: number; zoom: number } | null = null;

  private wingSize: number = LOOK.wing.scale;

  update(dt: number, clock: number, view: CameraView, sim: SimView): void {
    const P = this.plan;
    const inGrove = P.beat === 'hatch' || P.beat === 'play' || P.beat === 'hollow' || P.beat === 'wake';
    this.back.visible = this.actors.visible = this.front.visible = this.dance.view.visible = inGrove;
    for (const l of Object.values(this.lights)) l.intensity = 0;
    POST_CINE.frost = P.beat === 'hatch' ? 1 - window01(P.bt, HATCH.frostOut[0], HATCH.frostOut[1]) : 0;
    POST_CINE.dim =
      P.beat === 'hollow'
        ? 0.7 *
          window01(P.bt, HOLLOW.dim[0], HOLLOW.dim[1]) *
          (1 - 0.5 * window01(P.bt, HOLLOW.hide[1] - 1.5, HOLLOW.hide[1]))
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
    // Its muzzle in the water: rings spread from where it drinks.
    const rp = this.ripples;
    rp.clear();
    if (shown && o.drink > 0.55 && o.sink < 0.3) {
      const n = this.fox.nose(o);
      const nx = x + n[0];
      for (let i = 0; i < 3; i++) {
        const u = (clock * 0.7 + i / 3) % 1;
        rp.ellipse(nx, WATER, 6 + 46 * u, 2 + 7 * u).stroke({
          color: 0xd8f0f4,
          width: 1.4,
          alpha: 0.5 * (1 - u),
        });
      }
    }
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
      // Its rim: a soft lip of pale root lying round it (never anything like teeth), breathing,
      // a few long tendrils curling away flat over the moss, steam off them.
      const br = 1 + 0.04 * Math.sin(clock * 0.98);
      for (let k = 0; k < 3; k++) {
        const rr = (150 - k * 5) * open * br;
        const rh = (24 - k * 2) * open;
        h.moveTo(cx - rr, MOSS + 3);
        for (let i = 1; i <= 24; i++) {
          const a0 = Math.PI + (i / 24) * Math.PI;
          h.lineTo(cx + Math.cos(a0) * rr, MOSS + 3 + Math.sin(a0) * rh + Math.sin(i * 1.3 + k) * 1.2);
        }
        h.stroke({
          color: k === 1 ? 0xf0e8e0 : PALE,
          width: 5 - k * 1.4,
          alpha: 0.8 - k * 0.2,
          cap: 'round',
        });
      }
      h.ellipse(cx, MOSS + 3, 150 * open * br, 22 * open).stroke({ color: 0xbfb5aa, width: 3, alpha: 0.55 });
      for (let i = 0; i < 5; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x0 = cx + side * (120 + 10 * i) * open;
        const len = (40 + 20 * i) * open;
        const curl = Math.sin(clock * 0.6 + i) * 6;
        h.moveTo(x0, MOSS + 2)
          .bezierCurveTo(
            x0 + side * len * 0.4,
            MOSS - 6 + curl,
            x0 + side * len * 0.8,
            MOSS + 6,
            x0 + side * len,
            MOSS + 1 - curl * 0.5,
          )
          .stroke({ color: PALE, width: 2.2, alpha: 0.6, cap: 'round' });
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
      // A tapered tendril, swaying as it feels the air in front of her face; it pauses there.
      const sway = Math.sin(clock * 3.1) * 6 * k;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        const a = 1 - u;
        // Cubic from the hollow's middle up to the tip.
        const x =
          a * a * a * (bx - 10) +
          3 * a * a * u * (bx - 4) +
          3 * a * u * u * (ex + 26 + sway) +
          u * u * u * (ex + sway * 0.5);
        const y = a * a * a * by + 3 * a * a * u * (by - 60 * k) + 3 * a * u * u * (ey + 46) + u * u * u * ey;
        pts.push([x, y]);
      }
      const left: number[] = [];
      const right: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i]!;
        const [nx0, ny0] = pts[Math.min(pts.length - 1, i + 1)]!;
        const [px0, py0] = pts[Math.max(0, i - 1)]!;
        const dx = nx0 - px0;
        const dy = ny0 - py0;
        const l = Math.hypot(dx, dy) || 1;
        const w = 4.5 * (1 - i / pts.length) + 1;
        left.push(x - (dy / l) * w, y + (dx / l) * w);
        right.unshift(x + (dy / l) * w, y - (dx / l) * w);
      }
      h.poly([...left, ...right]).fill({ color: PALE, alpha: 0.95 });
      h.circle(ex + sway * 0.5, ey, 2.4).fill({ color: 0xf8f4ee, alpha: 0.95 });
    }
    // The case: up out of the closing hollow on a pale stalk, bone, the fox asleep inside, breathing.
    const rise = t >= 0 ? window01(t, H.caseRise[0], H.caseRise[1]) : 0;
    const grey = t >= 99 ? 1 : window01(t, H.caseRise[1], H.caseRise[1] + 8);
    this.caseV.draw(rise, grey, clock);
    if (rise > 0.01) {
      const l = this.lights.case!;
      l.x = this.caseV.mid.x;
      l.y = this.caseV.mid.y;
      l.radius = 200;
      l.intensity = (0.18 + 0.12 * this.caseV.breath) * rise;
      this.caseTop = { x: this.caseV.top.x, y: this.caseV.top.y };
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
        .stroke({ color: PALE, width: 2.2, alpha: 0.55 * fade });
      const by = y0 + (y1 - y0) * u;
      p.circle(x0 + (H.lamp.x - x0) * u, by, 3.5).fill({
        color: 0xffffff,
        alpha: 0.9 * fade * (u < 1 ? 1 : 0),
      });
    }
  }

  private caseTop = { x: HOLLOW.x + 30, y: MOSS - 150 };

  // --- The dance high above; the silver-edged moth swoops close past him when he stops racing.
  private updateDance(clock: number): void {
    const P = this.plan;
    const D = COURSE.dance;
    let k = 0;
    let to: { x: number; y: number } | undefined;
    if (P.beat === 'play' && P.stopAt >= 0) {
      const s = P.pt - P.stopAt;
      const [s0, s1] = COURSE.silverSweep;
      k = envelope(s, s0, s0 + 0.7, s1 - 0.7, s1);
      const u = window01(s, s0, s1);
      // Down from the ring, across in front of his face within a wing's length, and back up.
      to = { x: this.sorrelAt.x - 90 + 180 * u, y: this.sorrelAt.y - 110 + Math.sin(u * Math.PI) * 50 };
    }
    this.dance.update(clock, D.x, D.y, D.rx, D.ry, to, k);
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
        // Down in the frost, wings stuck shut, eyes dim; she tries to open them and can't; warmed,
        // her eyes brighten and they open; then she looks back at the fox.
        wv = { ...her, facing: t >= HATCH.lookFox[0] ? -1 : 1 };
        W.huddle =
          window01(t, HATCH.huddle[0], HATCH.huddle[0] + 0.4) *
          (1 - window01(t, HATCH.brighten[0], HATCH.brighten[1]));
        W.shake =
          0.55 *
            envelope(t, HATCH.tryOpen[0], HATCH.tryOpen[0] + 0.2, HATCH.tryOpen[1] - 0.3, HATCH.tryOpen[1]) +
          envelope(t, HATCH.opens[0], HATCH.opens[0] + 0.2, HATCH.opens[1] - 0.2, HATCH.opens[1]);
        W.look = envelope(
          t,
          HATCH.lookFox[0] + 0.3,
          HATCH.lookFox[0] + 0.9,
          HATCH.lookFox[1] - 0.4,
          HATCH.lookFox[1],
        );
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
        S.fold = envelope(t, HATCH.fold[0], HATCH.fold[0] + 0.7, HATCH.fold[1] - 0.5, HATCH.fold[1]);
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
    // Their habits: his wings half open, hers shut (unless the moment says otherwise).
    if (S.fold < 0.5 && S.huddle < 0.5) S.wings = LOOK.sorrel.wings;
    if (W.fold < 0.5 && W.huddle < 0.5 && W.shake < 0.3) W.wings = LOOK.wing.wings;
    // She eases back to the game's own look as she wakes (the hand-over is seamless).
    const ease = P.beat === 'wake' ? 1 - window01(t, WAKE.rise[0], WAKE.hud[1]) : 1;
    setWingLook(this.wingLook, ease);
    this.wingSize = 1 + (LOOK.wing.scale - 1) * ease;
    // In the ferns, against the coral: two silhouettes.
    const sil = P.beat === 'hollow' ? window01(t, HOLLOW.hide[0] - 0.4, HOLLOW.hide[0] + 0.4) : 0;
    const shade = Math.round(255 - 225 * sil);
    const tint = (shade << 16) | (shade << 8) | Math.min(255, shade + 8);
    this.wingLayer.tint = tint;
    this.sorrelLayer.tint = tint;
    // Draw (or hide) each, and lend its light to the Grove.
    this.drawMoth(
      this.wing,
      this.wingLayer,
      wv,
      dt,
      clock,
      this.wingLights,
      this.lights.wing!,
      this.wingAt,
      this.wingSize,
    );
    this.sorrel.hideWings = !!sv && !sv.grounded;
    this.drawMoth(
      this.sorrel,
      this.sorrelLayer,
      sv,
      dt * 1.25,
      clock * 1.25 + 7,
      this.sorrelLights,
      this.lights.sorrel!,
      this.sorrelAt,
      LOOK.sorrel.scale,
    );
    this.drawSorrelWings(sv, clock);
  }

  /**
   * The hollow, staged: on the fox's back; up over the hollow; she lands ON the case and folds her
   * wing over it, his fold from the hatching (and it does not warm it); in the escape hers is the
   * sim's (a hop down off the case first); he pulls her into the ferns and folds over her there.
   */
  private hollowMoths(t: number, her: PlayerView, clock: number): { wv: PlayerView; sv: PlayerView } {
    const H = HOLLOW;
    const W = this.wingCue;
    const S = this.sorrelCue;
    const backY = MOSS - 132;
    const hover = { x: H.x + 10, y: MOSS - 118 + 4 * Math.sin(clock * 3) };
    const onCase = { x: H.x + 4, y: MOSS - H.stalk - H.caseH + 6 };
    // Hers.
    let wv: PlayerView;
    if (t < H.play[0]) {
      const up = window01(t, H.flutter[0], H.flutter[1]);
      const down = window01(t, H.land[0], H.land[1]);
      const x = FOX_DRINK + 10 + (hover.x - FOX_DRINK - 10) * up + (onCase.x - hover.x) * down;
      const y = backY + (hover.y - backY) * up + (onCase.y - hover.y) * down;
      const air = up > 0.02 && down < 0.98;
      wv = this.wingStand.set(x, y, 1, air, air ? 0.4 * Math.sin(clock * 9) : 0);
      W.huddle = t < H.paling[0] ? 0.3 : 0.35 * window01(t, H.land[1], H.land[1] + 0.6);
      W.fold = window01(t, H.fold[0], H.fold[0] + 0.8);
      W.hold = t < H.flutter[0] ? 0.4 : 0;
    } else {
      wv = her;
      // Off the case: a hop down to where she stands.
      const hop = window01(t, H.play[0], H.play[0] + 0.5);
      if (hop < 1) wv = blend(this.wingStand.set(onCase.x, onCase.y, 1, false), her, hop);
      if (this.plan.tackleAt >= 0) {
        const k = window01(t, this.plan.tackleAt, this.plan.tackleAt + 0.9);
        if (t < this.plan.tackleAt + 0.9)
          wv = this.wingStand.set(
            her.cx + (H.ferns - 70 - her.cx) * k,
            MOSS - 30 * Math.sin(k * Math.PI),
            -1,
            k > 0 && k < 1,
          );
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
    } else if (t < H.hide[0]) {
      // In the ferns, beckoning; out to tug at her; when she comes near, he pulls her in with him.
      const fx = H.ferns - 110;
      let x = fx;
      let air = false;
      const tug =
        envelope(t, H.play[0] + 2.6, H.play[0] + 3.2, H.play[0] + 3.6, H.play[0] + 4.4) *
        (her.cx > H.ferns + 20 ? 1 : 0);
      x += (her.cx - 40 - fx) * tug;
      const pull = window01(H.ferns + 160 - her.cx, 0, 60);
      x += (her.cx - 36 - x) * pull;
      if (this.plan.tackleAt >= 0) {
        const k = envelope(
          t,
          this.plan.tackleAt - 0.3,
          this.plan.tackleAt + 0.1,
          this.plan.tackleAt + 0.6,
          this.plan.tackleAt + 1,
        );
        x += (her.cx - x) * k;
        air = k > 0.1 && k < 0.9;
      }
      sv = this.sorrelStand.set(x, MOSS - (air ? 30 : 0), her.cx > x ? 1 : -1, air);
      S.fold = Math.max(0.8 * Math.max(0, Math.sin((t - H.play[0]) * 1.4)) * (1 - pull), 0.9 * pull);
      S.tap = 0.5 * Math.max(0, Math.sin(t * 4)) * (1 - pull);
    } else {
      // The hide: at her side, his wing over her while hers is over the light.
      sv = this.sorrelStand.set(her.cx - 34, MOSS, 1, false);
      S.fold = 1;
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
    size = 1,
  ): void {
    layer.visible = !!v;
    at.on = !!v;
    if (!v) return;
    skin.update(dt, clock, v, []);
    // Drawn at `size` about the feet.
    layer.pivot.set(v.cx, v.feetY);
    layer.position.set(v.cx, v.feetY);
    layer.scale.set(size);
    at.x = v.cx;
    at.y = v.feetY;
    at.hx = v.cx + (skin.offer.x - v.cx) * size;
    at.hy = v.feetY + (skin.offer.y - v.feetY) * size;
    const l = reg.get('ember');
    if (l) {
      out.x = l.x;
      out.y = l.y;
      out.radius = l.radius;
      out.color = l.color;
      // (In the hollow their warm lights are kept low: the case must read bone-cold.)
      out.intensity = l.intensity * (this.plan.beat === 'hollow' ? 0.35 : 1);
    }
  }

  /** His flight wings (sorrel.ts), whenever he is in the air. */
  private drawSorrelWings(v: PlayerView | null, clock: number): void {
    const g = this.sorrelWings;
    g.clear();
    if (!v || v.grounded) return;
    drawFlightWings(g, v.cx, v.feetY - 50 * LOOK.sorrel.scale, clock * 7.5, LOOK.sorrel.scale);
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
    const hidden = P.beat === 'hollow' ? 0.85 * Math.max(P.fold, this.wingCue.fold) : 0;
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
        const Wb = H.wash;
        const over = H.ferns - 80;
        const cross = window01(s, 0, Wb.cross);
        // Over the ferns it slows and stops, searching (a slow drift), then goes back to the case.
        const search = Math.sin(s * 1.7) * 18 * (s > Wb.cross ? 1 - window01(s, Wb.hold - 0.6, Wb.hold) : 0);
        const back = window01(s, Wb.hold, Wb.back);
        wx = H.x + 30 + (over - H.x - 30) * cross + (H.x + 30 - over) * back + search;
        wy = MOSS - 30;
        k = 1 - window01(s, Wb.back + 0.2, Wb.dark);
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
    this.caseV.destroy();
    this.back.destroy({ children: true });
    this.actors.destroy({ children: true });
    this.front.destroy({ children: true });
    this.dance.destroy();
    void this.layers;
    void this.foxX;
  }
}
