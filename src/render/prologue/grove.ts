// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * Shots 3 and 4 in the Grove (42-90 s): the camera's track, and everything the prologue adds to the
 * game's own layers there (so it takes the Grove's post and grade):
 *
 *   the caterpillar on its twig, its spin into a cocoon   (Graphics, 'pickups' layer)
 *   a burrback that walks in, swings its head over it, loses interest, walks on: the game's own
 *     burrback painter (a second EnemyRenderer) driven by a made-up EnemyState, with pale root in
 *     its shell seams and steam off it
 *   two cocoons over the pool, amber breathing in each; they split
 *   Sorrel: Umber's own skin (a second VesperCharacter on a made-up PlayerState) lighter and
 *     quicker, flying straight up to the brood's dance (a ring of small moths in the canopy)
 *   the glint that drifts down to her, and her cues (`vesperLink.cine`): she holds it to her face,
 *     then looks past it
 *
 * Umber herself is the sim's from 66 s (the director drops her out of her cocoon). Render only:
 * the made-up states are this file's own copies; nothing here writes to the sim.
 */
import { ColorMatrixFilter, Container, Graphics, Sprite } from 'pixi.js';
import { createEnemy } from '../../sim/enemies';
import { createPlayer } from '../../sim/player/player';
import type { Scene } from '../../sim/scene';
import type { EnemyState, PlayerState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { CharacterSkin } from '../character/skin';
import { skin as vesperSkin } from '../character/vesper';
import { vesperLink } from '../character/vesper/link';
import type { CameraView, PlayerView, RenderContext, SimView } from '../contract';
import { BURR as BURR_LOOK } from '../enemies/config';
import { EnemyRenderer } from '../enemies/index';
import { LightRegistry, type PointLight } from '../lights';
import type { LayerTree } from '../scene/layer-tree';
import { glowTexture } from '../world/paint';
import { BURR, COCOONS, PROLOGUE_END, SHOT } from './script';
import { envelope, Track, window01 } from './track';

/**
 * The camera in the Grove. Values: x, y, zoom (a world point and zoom), her (0..1: centre on her
 * instead, offset dx, dy), game (0..1: the game's own follow camera instead of all of it).
 */
const CAM = new Track([
  { t: SHOT.burr.start, v: [880, 240, 1, 0, 0, 0, 0] },
  { t: BURR.descend[1], v: [820, 1130, 1.6, 0, 0, 0, 0] },
  { t: BURR.look[0] - 0.4, v: [724, 1226, 5.4, 0, 0, 0, 0] },
  { t: BURR.sniff[1], v: [730, 1228, 5.6, 0, 0, 0, 0] },
  { t: 58.4, v: [1000, 1180, 2.3, 0, 0, 0, 0] },
  { t: 61, v: [1600, 1060, 1.6, 0, 0, 0, 0] },
  { t: COCOONS.sorrelFly[0], v: [1630, 1030, 1.7, 0, 0, 0, 0] },
  { t: 64.8, v: [1720, 660, 1.15, 0, 0, 0, 0] },
  { t: 65.8, v: [1460, 1070, 1.9, 0, 0, 0, 0] },
  { t: COCOONS.umberSplit + 0.8, v: [1440, 1150, 2.2, 0, 0, 0, 0] },
  { t: 68.6, v: [1515, 1150, 2.2, 1, 0, -30, 0] },
  { t: COCOONS.glint[0], v: [1515, 1150, 2.3, 1, 0, -40, 0] },
  { t: COCOONS.raise[0], v: [1515, 1150, 3, 1, 0, -50, 0] },
  { t: COCOONS.look[0], v: [1515, 1150, 6.6, 1, 4, -62, 0], ease: 'linear' },
  { t: COCOONS.outside[0] + 1.2, v: [1515, 1150, 4.2, 1, 200, -80, 0] },
  { t: COCOONS.back[0], v: [1515, 1150, 1.6, 1, 0, -20, 0.4] },
  { t: PROLOGUE_END, v: [1515, 1150, 1, 1, 0, 0, 1] },
]);

const PALE = 0xd9cfc4;
/** The caterpillar, its twig and its silk are drawn this much larger than their world px. */
const CAT_SCALE = 1.7;
const AMBER = 0xffb36b;
const GOLD = 0xffd9a0;

function soft(x: number, y: number, r: number, color: number, alpha: number): Sprite {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.setSize(r * 2, r * 2);
  s.tint = color;
  s.alpha = alpha;
  s.blendMode = 'add';
  return s;
}

/** A made-up PlayerView from a state (for Sorrel and for what the burrback looks at). */
function viewOf(p: PlayerState): PlayerView {
  return { ...p, cx: p.x + p.w / 2 + p.rx, cy: p.y + p.h / 2 + p.ry, feetY: p.y + p.h + p.ry };
}

export class GroveActors {
  private readonly front = new Container({ label: 'prologue-front' });
  private readonly back = new Container({ label: 'prologue-back' });
  private readonly twig = new Graphics();
  private readonly cat = new Graphics();
  private readonly silk = new Graphics();
  private readonly silkGlow: Sprite;
  private readonly seams = new Graphics();
  private readonly cocoons = new Graphics();
  private readonly cocoonGlow: [Sprite, Sprite];
  private readonly dance = new Container();
  private readonly danceMoths: Array<{
    c: Container;
    w: Graphics;
    g: Sprite;
    ph: number;
    sp: number;
    r: number;
  }> = [];
  private readonly glint = new Container();
  private readonly glintLight: PointLight = { x: 0, y: 0, radius: 230, color: AMBER, intensity: 0 };
  private readonly cocoonLights: [PointLight, PointLight];
  private readonly sorrelLight: PointLight = { x: 0, y: 0, radius: 260, color: GOLD, intensity: 0 };
  // The burrback.
  private readonly burrScene: Scene;
  private readonly burr: EnemyRenderer;
  private readonly burrState: EnemyState;
  // Sorrel.
  private readonly sorrelLayer = new Container({ label: 'sorrel' });
  /** His flight: a moth's wings, forewings swept back, hindwings tucked under them, beating. */
  private readonly sorrelWings = new Graphics();
  private readonly sorrelSkin: CharacterSkin;
  private readonly sorrelLights = new LightRegistry();
  private readonly sorrel: PlayerState;
  private readonly cam = { x: 0, y: 0, zoom: 1 };
  private glintX = 0;
  private glintY = 0;
  private glintOn = false;

  constructor(
    private readonly ctx: RenderContext,
    private readonly layers: LayerTree,
  ) {
    const L = layers;
    L.get('playfieldFront').addChild(this.front);
    L.get('goal').addChild(this.back);
    // The twig and the caterpillar, then its silk.
    this.silkGlow = soft(0, 0, 26, PALE, 0);
    this.front.addChild(this.twig, this.cat, this.silkGlow, this.silk);
    this.drawTwig();
    // The caterpillar is drawn at moth scale, and then made a little larger than life so it reads.
    for (const g of [this.twig, this.cat, this.silk]) {
      g.pivot.set(BURR.twig.x, BURR.twig.y);
      g.position.set(BURR.twig.x, BURR.twig.y);
      g.scale.set(CAT_SCALE);
    }
    // The cocoons over the pool (behind her: she drops out of hers in front of it).
    this.cocoonGlow = [soft(0, 0, 60, AMBER, 0), soft(0, 0, 60, AMBER, 0)];
    this.back.addChild(this.cocoons, ...this.cocoonGlow);
    this.cocoonLights = [
      { x: 0, y: 0, radius: 160, color: AMBER, intensity: 0 },
      { x: 0, y: 0, radius: 160, color: AMBER, intensity: 0 },
    ];
    ctx.lights.set('prologue-cocoon-a', this.cocoonLights[0]);
    ctx.lights.set('prologue-cocoon-b', this.cocoonLights[1]);
    ctx.lights.set('prologue-glint', this.glintLight);
    ctx.lights.set('prologue-sorrel', this.sorrelLight);
    // The dance: a glittering ring of moths in the canopy.
    L.get('airBack').addChild(this.dance);
    const D = COCOONS.dance;
    for (let i = 0; i < 18; i++) {
      const c = new Container();
      const w = new Graphics();
      const span = 10 + (i % 4) * 1.5;
      w.poly([0, 0, -span * 0.5, -span * 0.32, -span * 0.42, span * 0.14]).fill({
        color: 0xe8dcc8,
        alpha: 0.9,
      });
      w.poly([0, 0, span * 0.5, -span * 0.32, span * 0.42, span * 0.14]).fill({
        color: 0xe8dcc8,
        alpha: 0.9,
      });
      const g = soft(0, 0, 18, GOLD, 0.5);
      c.addChild(g, w);
      this.dance.addChild(c);
      this.danceMoths.push({
        c,
        w,
        g,
        ph: (i / 18) * Math.PI * 2,
        sp: 0.55 + (i % 5) * 0.06,
        r: 0.8 + (i % 3) * 0.12,
      });
    }
    void D;
    // The glint.
    this.glint.addChild(soft(0, 0, 34, AMBER, 0.55), soft(0, 0, 9, 0xfff1d4, 1));
    this.glint.visible = false;
    L.get('playfieldFront').addChild(this.glint);

    // The burrback: the game's painter, its own renderer, a state of our own.
    const spawn = {
      id: 'prologue-burr',
      kind: 'burrback' as const,
      x: BURR.enterX,
      y: BURR.ground,
      facing: 1 as const,
    };
    this.burrScene = { ...ctx.scene, enemies: [spawn] };
    const keep = (window as unknown as { __enemies?: unknown }).__enemies;
    this.burr = new EnemyRenderer({ ...ctx, scene: this.burrScene }, L.enemies, L.enemiesFront);
    (window as unknown as { __enemies?: unknown }).__enemies = keep;
    this.burrState = createEnemy(spawn, tuning);
    L.enemies.addChild(this.seams);

    // Sorrel: her own skin, lighter and warmer (a lighter plum), on his own light registry.
    const C = COCOONS.sorrel;
    this.sorrel = createPlayer(C.x, C.y + 60, tuning, ctx.scene);
    const lift = new ColorMatrixFilter();
    lift.resolution = 'inherit';
    lift.brightness(1.14, false);
    lift.saturate(-0.28, true);
    this.sorrelLayer.filters = [lift];
    L.get('goal').addChild(this.sorrelWings, this.sorrelLayer);
    this.sorrelSkin = vesperSkin.create({ ...ctx, lights: this.sorrelLights }, this.sorrelLayer);
    this.sorrelLayer.visible = false;
  }

  private drawTwig(): void {
    const g = this.twig;
    const { x, y } = BURR.twig;
    // A thin dead stem out of the grass, bending over, a leaf at its tip.
    // (Drawn about (x, y) at CAT_SCALE: its foot is put where it meets the real ground.)
    g.moveTo(x - 16, y + (BURR.ground + 2 - y) / CAT_SCALE)
      .bezierCurveTo(x - 15, y + 18, x - 8, y + 2, x + 4, y)
      .bezierCurveTo(x + 14, y - 1, x + 22, y + 2, x + 30, y - 4)
      .stroke({ color: 0x0c1418, width: 2.2, cap: 'round' });
    g.moveTo(x - 6, y + 4)
      .quadraticCurveTo(x - 12, y - 6, x - 10, y - 14)
      .stroke({ color: 0x0c1418, width: 1.3, cap: 'round' });
    g.poly([x + 30, y - 4, x + 40, y - 12, x + 46, y - 9, x + 38, y - 2]).fill(0x16302a);
    g.moveTo(x + 31, y - 4)
      .lineTo(x + 44, y - 9)
      .stroke({ color: 0x2a5048, width: 0.6 });
  }

  /** The camera this frame (see CAM), or null before the Grove is on. */
  camera(t: number, follow: CameraView, p: PlayerView): CameraView | null {
    if (t < SHOT.burr.start - 0.5) return null;
    const [x, y, zoom, her, dx, dy, game] = CAM.sample(t) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    // Where she looks: the camera follows her eyes the way she faces.
    const f = p.facing;
    const hx = x + (p.cx + dx * f - x) * her;
    const hy = y + (p.cy + dy - y) * her;
    this.cam.x = hx + (follow.x - hx) * game;
    this.cam.y = hy + (follow.y - hy) * game;
    this.cam.zoom = zoom + (follow.zoom - zoom) * game;
    return this.cam;
  }

  update(t: number, dt: number, clock: number, view: CameraView, sim: SimView): void {
    const inGrove = t >= SHOT.burr.start - 0.5;
    this.front.visible = this.back.visible = this.dance.visible = inGrove;
    this.seams.visible = inGrove && t < SHOT.cocoons.start + 2;
    if (!inGrove) return;
    this.updateCaterpillar(t, clock);
    this.updateBurr(t, dt, clock, view, sim);
    this.updateCocoons(t, clock);
    this.updateDance(t, clock);
    this.updateSorrel(t, dt, clock);
    this.updateGlint(t, clock, sim.player);
  }

  // --- The caterpillar and its spin.
  private updateCaterpillar(t: number, clock: number): void {
    const { x, y } = BURR.twig;
    const [s0, s1] = BURR.spin;
    const u = window01(t, s0, s1);
    const g = this.cat;
    g.clear();
    // Along the stem's top from (x - 2, y) to (x + 22, y - 1): eight segments, inching.
    const body = 1 - window01(t, s0 + 0.5, s1 - 0.2);
    if (body > 0.01) {
      const inch = Math.sin(clock * 3.1);
      for (let i = 0; i < 9; i++) {
        const k = i / 8;
        const px = x - 2 + k * 22 + inch * 1.2 * k;
        const hump = Math.max(0, Math.sin(k * Math.PI * 2 - clock * 3.1)) * 1.6;
        const py = y - 2.4 - hump - k * 0.6;
        const r = (i === 8 ? 2.7 : 2.4 + 0.3 * Math.sin(k * Math.PI)) * (0.7 + 0.3 * body);
        g.circle(px, py, r).fill({ color: i === 8 ? 0x3a3020 : 0x5a6a34, alpha: body });
        if (i < 8 && i % 2 === 0)
          g.circle(px, py - r * 0.55, 0.7).fill({ color: 0xe8dca8, alpha: 0.8 * body });
      }
    }
    // The spin: silk wraps it, fast, a pale blur; then a cocoon hangs under the stem.
    const s = this.silk;
    s.clear();
    const spinning = envelope(t, s0, s0 + 0.2, s1 - 0.5, s1 + 0.2);
    this.silkGlow.position.set(x + 10 * CAT_SCALE, y + 6 * CAT_SCALE);
    this.silkGlow.alpha = 0.7 * spinning * (0.75 + 0.25 * Math.sin(clock * 40));
    const cx = x + 10;
    const cy = y + 4 + 6 * u;
    const sway = Math.sin(clock * 1.2) * 0.06 * u;
    if (u > 0) {
      // The cocoon fills in as the wraps pile up.
      const rx = 4 + 2.2 * u;
      const ry = 6 + 4.5 * u;
      s.ellipse(cx, cy + 2, rx, ry).fill({ color: 0xcfc4b0, alpha: 0.85 * u });
      s.ellipse(cx - 1.2, cy - 1, rx * 0.45, ry * 0.55).fill({ color: 0xf2eadc, alpha: 0.35 * u });
      // Its thread to the stem.
      s.moveTo(cx, cy + 2 - ry)
        .lineTo(x + 10, y - 1)
        .stroke({ color: 0xe8e0d0, width: 0.8, alpha: 0.8 * u });
      // Wraps: a ribbon spiralling round, quick while it spins.
      const wraps = Math.floor(3 + 9 * u);
      for (let i = 0; i < wraps; i++) {
        const k = i / wraps;
        const a = clock * 22 * spinning + i * 2.4;
        const yy = cy + 2 - ry + ry * 2 * k;
        const ww = rx * Math.sqrt(Math.max(0, 1 - (2 * k - 1) ** 2)) * 1.15;
        s.moveTo(cx - ww, yy + Math.sin(a) * 1.5)
          .quadraticCurveTo(cx, yy + Math.cos(a) * 3, cx + ww, yy - Math.sin(a) * 1.5)
          .stroke({ color: 0xf4ecdf, width: 0.7, alpha: 0.35 + 0.4 * spinning });
      }
      // Loose strands thrown off while it spins.
      for (let i = 0; i < 6 * spinning; i++) {
        const a = clock * 9 + i * 1.05;
        const r = 9 + 5 * Math.sin(clock * 13 + i);
        s.moveTo(cx, cy)
          .quadraticCurveTo(
            cx + Math.cos(a) * r * 0.7,
            cy + Math.sin(a) * r * 0.4,
            cx + Math.cos(a + 0.6) * r,
            cy + Math.sin(a + 0.6) * r * 0.7,
          )
          .stroke({ color: 0xf0e8da, width: 0.5, alpha: 0.5 * spinning });
      }
      void sway;
    }
    // The blur of it: silk whirling round the body faster than the eye, a pale spinning ring.
    if (spinning > 0.01) {
      const rcx = x + 10;
      const rcy = y + 1 + 4 * u;
      for (let k = 0; k < 5; k++) {
        const a0 = clock * 26 + k * 1.26;
        const rx = 10 - 2 * u + k * 0.6;
        const ry = 4.5 + 3 * u;
        s.moveTo(rcx + Math.cos(a0) * rx, rcy + Math.sin(a0) * ry);
        for (let j = 1; j <= 10; j++) {
          const a = a0 + j * 0.16;
          s.lineTo(rcx + Math.cos(a) * rx, rcy + Math.sin(a) * ry);
        }
        s.stroke({ color: 0xf6efe2, width: 0.9, alpha: 0.55 * spinning * (1 - k * 0.12) });
      }
    }
  }

  // --- The burrback: walk in, stop over the caterpillar, look, sniff, walk on.
  private updateBurr(t: number, dt: number, clock: number, view: CameraView, sim: SimView): void {
    const B = BURR;
    const e = this.burrState;
    const on = t >= B.walkIn[0] && t < B.walkOn[1];
    if (!on) {
      e.gone = true;
    } else e.gone = false;
    // Where it is: in, stopped, on.
    const inK = window01(t, B.walkIn[0], B.walkIn[1]);
    const onK = (t - B.walkOn[0]) / (B.walkOn[1] - B.walkOn[0]);
    const cx =
      t < B.walkOn[0]
        ? B.enterX + (B.stopX - B.enterX) * inK
        : B.stopX + (B.exitX - B.stopX) * Math.max(0, onK) ** 1.3;
    const walking = (t >= B.walkIn[0] && t < B.walkIn[1] - 0.15) || t >= B.walkOn[0] + 0.1;
    const looking = t >= B.look[0] && t < B.sniff[0];
    const sniffing = t >= B.sniff[0] && t < B.walkOn[0];
    const mode = walking ? 'walk' : 'pause';
    const frame = Math.floor(t * 60);
    if (e.mode !== mode) {
      e.mode = mode;
      this.modeStart = t;
    }
    e.modeFrames = Math.max(0, Math.floor((t - this.modeStart) * 60));
    e.facing = 1;
    const left = cx - e.w / 2;
    e.x = Math.floor(left);
    e.rx = left - e.x;
    e.vx = walking ? 0.9 : 0;
    e.stride = cx - B.enterX;
    e.timer = mode === 'walk' ? 0 : 30;
    // What it attends to: the caterpillar, while it looks at it; ahead, otherwise.
    const { x: tx, y: ty } = B.twig;
    const p = sim.player;
    const look = looking || sniffing;
    const target: PlayerView = {
      ...p,
      cx: look ? tx + 10 * CAT_SCALE : cx + 400,
      cy: look ? ty - 4 : B.ground - 40,
      feetY: look ? B.ground : B.ground,
      faded: look ? 0 : 1,
    };
    const fake: SimView = {
      ...sim,
      frame,
      alpha: t * 60 - frame,
      player: target,
      events: [],
      scene: this.burrScene,
      enemies: [e],
    };
    // The beat: its head swings out over the caterpillar, the brow plate lifting open; it holds
    // there while the silk goes round; the plate shuts, the head comes back, two short sniffs.
    const rig = this.burr.burrRig(0);
    if (rig) {
      const [l0, l1] = B.look;
      const [n0, n1] = B.sniff;
      const sniff =
        t >= n0 && t < n1 ? Math.max(0, Math.sin((t - n0) * 7.5)) ** 2 * (1 - window01(t, n1 - 0.6, n1)) : 0;
      rig.cine = {
        reach: Math.max(envelope(t, l0, l0 + 0.7, l1 - 0.3, l1 + 0.2), 0.55 * sniff),
        open: envelope(t, l0 + 0.25, l0 + 0.9, l1 - 0.5, l1),
        watch: envelope(t, l0 - 0.6, l0, n1 - 0.4, n1),
      };
    }
    this.burr.update(dt, clock, view, fake);
    // Pale root in its shell seams, and steam off it.
    const g = this.seams;
    g.clear();
    if (!on) return;
    const H = BURR_LOOK;
    const bob = walking ? Math.abs(Math.sin((e.stride / 30) * Math.PI)) * 1.2 : 0;
    const base = B.ground - H.rim - bob;
    const breath = 0.5 + 0.5 * Math.sin(clock * 1.4);
    for (let k = 0; k < 3; k++) {
      const off = 5 + k * 6.5;
      g.moveTo(cx - H.halfLen * 0.86, base - 1);
      for (let i = 1; i <= 16; i++) {
        const u = -0.86 + (1.72 * i) / 16;
        const top = H.dome * Math.max(0, 1 - u * u) ** 0.62;
        const wob = Math.sin(i * 1.9 + k * 2.3) * 0.9;
        g.lineTo(cx + u * H.halfLen - H.shear * (top / H.dome), base - Math.max(0, top - off) + wob);
      }
      g.stroke({ color: PALE, width: 1.1 - k * 0.2, alpha: (0.5 - k * 0.1) * (0.8 + 0.2 * breath) });
    }
    // A few rootlets hanging from the rim to the ground.
    for (let i = 0; i < 4; i++) {
      const x0 = cx - 20 + i * 13;
      g.moveTo(x0, base + 1)
        .quadraticCurveTo(x0 + 3, base + 6, x0 + 1 + Math.sin(clock * 2 + i) * 1.5, B.ground - 1)
        .stroke({ color: PALE, width: 0.7, alpha: 0.35 });
    }
  }

  private modeStart = 0;

  // --- The cocoons over the pool.
  private updateCocoons(t: number, clock: number): void {
    const g = this.cocoons;
    g.clear();
    const list = [
      { c: COCOONS.sorrel, split: COCOONS.sorrelSplit, ph: 0.9 },
      { c: COCOONS.umber, split: COCOONS.umberSplit, ph: 0 },
    ];
    for (const [i, it] of list.entries()) {
      const { c, split, ph } = it;
      const open = window01(t, split - 0.15, split + 0.35);
      const sway =
        Math.sin(clock * 0.9 + ph) * 2.2 +
        Math.sin(clock * 2.3 + ph) * 0.6 +
        (t > split ? Math.sin((t - split) * 5) * 5 * Math.exp(-(t - split) * 1.2) : 0);
      const x = c.x + sway;
      const top = c.y - 40;
      // The thread, up out of the frame.
      g.moveTo(c.x, top - 700)
        .quadraticCurveTo(c.x + sway * 0.3, top - 300, x, top)
        .stroke({ color: 0xc8c0b0, width: 0.9, alpha: 0.45 });
      // The case: narrow where it hangs, full below; split open at the bottom once it has broken.
      const pts: number[] = [];
      const N = 22;
      for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2;
        const sy = Math.cos(a);
        const sx = Math.sin(a);
        const w = 19 * (0.5 + 0.45 * (1 - sy) * 0.5 + 0.25 * Math.sin((1 - sy) * 1.6));
        let yy = top + 40 - sy * 40;
        // Torn open: the lower part peels back into ragged flaps.
        if (open > 0 && sy < -0.2) yy -= open * (12 + 6 * Math.sin(k * 2.7)) * (-sy - 0.2);
        pts.push(x + sx * w * (1 + open * 0.15 * (sy < 0 ? -sy : 0)), yy);
      }
      g.poly(pts).fill({ color: open > 0.5 ? 0x6a6458 : 0x9a917f, alpha: 0.96 });
      if (open > 0.02) {
        // The split: a dark mouth of torn silk at the bottom, flaps hanging from its lip.
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
      // Silk: a few fine wraps lit on the moon side.
      for (let k = 1; k < 9; k++) {
        const yy = top + k * 9;
        const w = 17 * Math.sin((k / 9) * Math.PI) * 0.95;
        g.moveTo(x - w, yy + 2)
          .quadraticCurveTo(x, yy - 2, x + w, yy + 3)
          .stroke({ color: 0xe8dcc4, width: 0.8, alpha: 0.4 * (1 - open * 0.6) });
      }
      g.moveTo(x - 9, top + 10)
        .quadraticCurveTo(x - 14, top + 34, x - 7, top + 58)
        .stroke({ color: 0xe8dcc4, width: 1.2, alpha: 0.3 });
      // Amber breathing inside; it goes when the case is empty.
      const b = 0.5 + 0.5 * Math.sin(clock * 1.9 + ph * 2);
      const alive = 1 - window01(t, split, split + 0.6);
      const glow = this.cocoonGlow[i]!;
      glow.position.set(x, top + 46);
      glow.alpha = (0.18 + 0.16 * b) * alive;
      const light = this.cocoonLights[i]!;
      light.x = x;
      light.y = top + 38;
      light.intensity = (0.5 + 0.3 * b) * alive;
      // Inside it, through the skin: a warm core.
      if (alive > 0.01)
        g.ellipse(x, top + 46, 9, 17).fill({ color: 0xffb070, alpha: (0.16 + 0.14 * b) * alive });
    }
  }

  // --- The brood's dance: a ring of moths turning slowly in the canopy, glittering.
  private updateDance(t: number, clock: number): void {
    const D = COCOONS.dance;
    const on = t >= SHOT.cocoons.start - 2;
    this.dance.visible = on;
    if (!on) return;
    for (const [i, m] of this.danceMoths.entries()) {
      const a = clock * m.sp * 0.6 + m.ph;
      m.c.position.set(
        D.x + Math.cos(a) * D.rx * m.r + Math.sin(a * 2.3 + i) * 8,
        D.y + Math.sin(a) * D.ry * m.r + Math.cos(a * 3.1 + i) * 5,
      );
      m.w.scale.y = 0.25 + 0.75 * Math.abs(Math.sin(clock * (12 + (i % 4)) + i));
      m.g.alpha = 0.4 + 0.5 * Math.max(0, Math.sin(clock * 3.3 + i * 1.7));
    }
  }

  // --- Sorrel: out of his cocoon and straight up to the dance. He doesn't look back.
  private updateSorrel(t: number, dt: number, clock: number): void {
    const C = COCOONS;
    const s = this.sorrel;
    const t0 = C.sorrelSplit + 0.1;
    const [f0, f1] = C.sorrelFly;
    const on = t >= t0 && t < f1 + 0.3;
    this.sorrelLayer.visible = on;
    this.sorrelWings.visible = on && t >= f0 - 0.15;
    this.sorrelLight.intensity = 0;
    if (!on) return;
    const top = C.sorrel.y + 24;
    const u = 1 - (1 - Math.min(1, Math.max(0, (t - f0) / (f1 - f0)))) ** 1.6;
    // Out of the case (a short drop), then up: quick, a little weave, straight for the ring.
    const drop = Math.min(1, (t - t0) / 0.4);
    const y = t < f0 ? top + 20 * drop : top + 20 - (top + 20 - C.dance.y - 40) * u ** 1.15;
    const x = C.sorrel.x + Math.sin(t * 5.2) * 4 * u + (C.dance.x - C.sorrel.x) * u * 0.6;
    const vy =
      t < f0 ? 1.2 : -((top - C.dance.y) / (f1 - f0) / 60) * 1.4 * (0.4 + 0.6 * Math.sin(u * Math.PI));
    s.x = Math.floor(x - s.w / 2);
    s.rx = x - s.w / 2 - s.x;
    s.y = Math.floor(y - s.h);
    s.ry = y - s.h - s.y;
    s.vx = Math.cos(t * 5.2) * 0.4;
    s.vy = vy;
    s.grounded = false;
    s.facing = 1;
    s.gliding = false;
    s.motion = t >= f0 ? 'rise' : 'fall';
    s.motionFrames++;
    s.modeFrames++;
    s.contactFrames++;
    this.drawSorrelWings(x, y - 50, clock, window01(t, f0 - 0.15, f0 + 0.2));
    // Quicker: his clock runs fast.
    this.sorrelSkin.update(dt * 1.25, clock * 1.25 + 7, viewOf(s), []);
    const l = this.sorrelLights.get('ember');
    if (l) {
      this.sorrelLight.x = l.x;
      this.sorrelLight.y = l.y;
      this.sorrelLight.intensity = 1.1 * Math.min(1, (t - t0) * 2);
    }
  }

  /** A moth in flight seen from behind and below: delta forewings swept back, hindwings tucked. */
  private drawSorrelWings(x: number, y: number, clock: number, open: number): void {
    const g = this.sorrelWings;
    g.clear();
    if (open <= 0.01) return;
    // The beat: quick, the stroke mostly downward, the wings swept back at the bottom of it.
    const ph = clock * 2 * Math.PI * 7.5;
    const beat = Math.sin(ph);
    const a = -0.35 + 0.75 * beat;
    const k = open * (0.85 + 0.15 * Math.abs(Math.cos(ph)));
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
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const tf = (pts: Array<[number, number]>, sk: number, lag: number): number[] =>
        pts.flatMap(([px, py]) => {
          const c2 = Math.cos(a * lag);
          const s2 = Math.sin(a * lag);
          const rx = px * k * sk;
          return [
            x + side * (rx * c2 - py * s2 * 0.4),
            y + rx * s2 * 0.9 + py * (lag === 1 ? ca : 1) + sa * 2,
          ];
        });
      g.poly(tf(hind, 0.8, 0.6)).fill({ color: 0x2c1f3e, alpha: 0.95 * open });
      const f = tf(fore, 0.85, 1);
      g.poly(f).fill({ color: 0x4e3866, alpha: 0.95 * open });
      g.poly(f).stroke({ color: 0xc4b4aa, width: 1.2, alpha: 0.4 * open });
      // A pale vein and the spot.
      g.moveTo(f[0]!, f[1]!)
        .lineTo(f[6]!, f[7]!)
        .stroke({ color: 0x8a76a0, width: 0.8, alpha: 0.5 * open });
      g.circle(f[4]! * 0.55 + x * 0.45, f[5]! * 0.55 + y * 0.45, 2).fill({
        color: 0xc4b4aa,
        alpha: 0.55 * open,
      });
    }
  }

  // --- The glint: drifts down in front of her, comes to her hand; she holds it up; she looks past it.
  private updateGlint(t: number, clock: number, p: PlayerView): void {
    const C = COCOONS;
    const [g0, g1] = C.glint;
    const hold = window01(t, C.raise[0], C.raise[1]) * (1 - window01(t, C.back[0], C.back[1]));
    const look = window01(t, C.look[0], C.look[1]) * (1 - window01(t, C.back[0], C.back[1]));
    vesperLink.cine.hold = hold;
    vesperLink.cine.look = look;
    vesperLink.cine.shake = envelope(t, C.shake[0], C.shake[0] + 0.12, C.shake[1] - 0.35, C.shake[1]);
    const on = t >= g0 && t < PROLOGUE_END;
    this.glint.visible = on;
    this.glintLight.intensity = 0;
    if (!on) {
      this.glintOn = false;
      return;
    }
    const f = p.facing;
    // Where it drifts to: in front of her face, then her hand once she holds it.
    const restX = p.cx + f * 26;
    const restY = p.feetY - 58;
    const handX = vesperLink.offerX;
    const handY = vesperLink.offerY - 4;
    const tx = hold > 0 ? restX + (handX - restX) * Math.min(1, hold * 1.5) : restX;
    const ty = hold > 0 ? restY + (handY - restY) * Math.min(1, hold * 1.5) : restY;
    const u = window01(t, g0, g1);
    if (!this.glintOn) {
      this.glintX = p.cx + f * 70;
      this.glintY = p.feetY - 300;
      this.glintOn = true;
    }
    // Falling like a seed: swaying side to side, slowing as it comes.
    const sx = p.cx + f * 70 + Math.sin(t * 2.1) * 26 * (1 - u);
    const sy = p.feetY - 300 + 240 * u;
    const k = window01(t, g1 - 1.2, g1 + 0.4);
    this.glintX = sx + (tx - sx) * k;
    this.glintY = sy + (ty - sy) * k;
    const fadeIn = window01(t, g0, g0 + 0.8);
    // It goes into her at the end.
    const gone = window01(t, C.back[0] + 0.3, PROLOGUE_END);
    this.glint.position.set(this.glintX, this.glintY + gone * 22);
    const pulse = 0.85 + 0.15 * Math.sin(clock * 3.4);
    this.glint.alpha = fadeIn * (1 - gone) * pulse;
    this.glint.scale.set(1 - 0.5 * gone);
    this.glintLight.x = this.glintX;
    this.glintLight.y = this.glintY;
    this.glintLight.intensity = 1.25 * fadeIn * (1 - gone) * pulse;
  }

  destroy(): void {
    vesperLink.cine.hold = 0;
    vesperLink.cine.look = 0;
    vesperLink.cine.shake = 0;
    for (const id of ['prologue-cocoon-a', 'prologue-cocoon-b', 'prologue-glint', 'prologue-sorrel'])
      this.ctx.lights.remove(id);
    this.sorrelSkin.destroy();
    this.burr.painter.mesh.destroy();
    this.burr.front.mesh.destroy();
    this.sorrelLayer.destroy({ children: true });
    this.sorrelWings.destroy();
    this.front.destroy({ children: true });
    this.back.destroy({ children: true });
    this.dance.destroy({ children: true });
    this.glint.destroy({ children: true });
    this.seams.destroy();
    void this.layers;
  }
}
