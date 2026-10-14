// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 5. The summit (and the title over it), the emotional peak: Sorrel chooses the dance and leaves her;
 * she stays with the one glint. Close on the two of them, standing on a twig at the top of the wood
 * (their own skin, the size they are in the hatching), moonlit; below and beyond them the world from
 * high (world.ts: the land, its towns all dark, the root fanned across it to the wood's edge, the
 * folded mountain breathing on the horizon; the pale point of the fox's case in the canopy below);
 * above them the dance, close and glittering, one moth in it edged silver.
 *
 * Acted (SUMMIT in script.ts): he looks up at the dance, she looks out over the world; the silver
 * moth circles him; he turns to her and offers (a hand to her, then up at the dance: come); she
 * hesitates and folds her wing over the glint (her flaw: she hides); he taps her wingtip and goes up
 * into the dance; she watches him there, alone, the glint's light leaking from under her wing.
 * `t` is the summit's own clock; the title beat keeps the last frame (`t` > SUMMIT end).
 */
import { ColorMatrixFilter, Container, Graphics } from 'pixi.js';
import { createPlayer } from '../../sim/player/player';
import type { Scene } from '../../sim/scene';
import type { PlayerState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import { VesperCharacter } from '../character/vesper';
import { type CineCues, newCues } from '../character/vesper/link';
import type { PlayerView, RenderContext } from '../contract';
import { LightRegistry } from '../lights';
import { MOUNTAIN } from '../world/bodies';
import type { Composer } from '../world/compose';
import { VIEW_H, VIEW_W } from '../world/layer';
import { glow } from '../world/paint';
import { SUMMIT } from './script';
import { drawFlightWings } from './sorrel';
import { envelope, window01 } from './track';
import { CURVE, E, F, H, LAND, PAD_X, PAD_Y, project } from './world';

/** The twig they stand on (screen px), and how big they are drawn (screen px per world px). */
const TWIG = { x: 760, y: 820 };
const SCALE = 2.3;
/** Where the two stand on it (screen x of their feet). */
const WING_X = 690;
const SORREL_X = 840;
/** The dance, above and to the right (screen px). */
const DANCE = { x: 1320, y: 250, rx: 250, ry: 56 };
/** The pale point (the case) in the canopy below, and the root's front it joins. */
const POINT = { x: 1260, y: 1000 };
const FRONT = { x: 1390, y: 850 };
/** The mountain, far: on the horizon, small. */
const FAR = { x: 0.2, z: 60 };
/** World px where the stand-ins live (a floor of their own). */
const WX = 3000;
const FLOOR = 1600;

/** A body of hers or his, held where it is staged. */
class Figure {
  readonly layer = new Container();
  readonly skin: VesperCharacter;
  readonly cue: CineCues = newCues();
  private readonly s: PlayerState;

  constructor(renderer: RenderContext['renderer'], scene: Scene, sx: number) {
    const ctx: RenderContext = { renderer, scene, lights: new LightRegistry(), viewScale: () => SCALE };
    this.layer.scale.set(SCALE);
    this.layer.position.set(sx - WX * SCALE, TWIG.y - FLOOR * SCALE);
    this.skin = new VesperCharacter(ctx, this.layer, { cine: this.cue, link: false });
    this.s = createPlayer(WX, FLOOR, tuning, scene);
  }

  /** Feet at world (WX + dx, FLOOR - up); `air` hanging in the air (fluttering). */
  pose(dx: number, up: number, facing: 1 | -1, air: boolean): PlayerView {
    const p = this.s;
    const x = WX + dx;
    const y = FLOOR - up;
    p.x = Math.floor(x - p.w / 2);
    p.rx = x - p.w / 2 - p.x;
    p.y = Math.floor(y - p.h);
    p.ry = y - p.h - p.y;
    p.facing = facing;
    p.vx = 0;
    p.vy = air ? -0.8 : 0;
    if (p.grounded === air) p.contactFrames = 0;
    p.grounded = !air;
    p.motion = air ? 'rise' : 'idle';
    p.motionFrames++;
    p.modeFrames++;
    p.contactFrames++;
    const fx = p.x + p.rx;
    const fy = p.y + p.ry;
    return { ...p, x: fx, y: fy, rx: 0, ry: 0, cx: fx + p.w / 2, cy: fy + p.h / 2, feetY: fy + p.h };
  }
}

export function buildSummit(c: Composer): (t: number, dt: number) => void {
  c.grade = {
    shadow: 0x0c1428,
    shadowK: 0.05,
    deep: 0x03050c,
    deepK: 0.6,
    exposure: 1.35,
    saturation: 1.1,
    contrast: 1.04,
    grain: 0.024,
    vignette: 0.36,
    vignetteSoft: 0.6,
    bloom: [0.4, 0.85, 0.75],
  };
  const R = c.root;
  const pulse = (t: number): number => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 5);
  const camX = 0.35;
  // --- The land below: no towns, the root fanned across it and stopped just short of the wood.
  const land = c.shader('land', -PAD_X, -PAD_Y, VIEW_W + 2 * PAD_X, VIEW_H + 2 * PAD_Y, LAND, R);
  land.pulse = pulse;
  const mp = project(FAR.x, FAR.z, camX);
  land.p(0, H, CURVE, F, camX).p(1, FAR.x, 26, 20.5, 1.4).p(2, 0, 3, mp.x, E);
  // Moonlight over it all: a cool wash from high on the left.
  const moon = new Container();
  moon.blendMode = 'add';
  R.addChild(moon);
  moon.addChild(glow(260, 120, 900, 0x4a6a9a, 0.22), glow(260, 120, 160, 0xaac4e8, 0.18));
  // --- The mountain on the horizon, breathing.
  const MW = 1200;
  const MH = 560;
  const mtn = c.shader('mountain', 0, 0, MW, MH, MOUNTAIN, R);
  mtn.pulse = pulse;
  const foot = { x: MW / 2, y: MH - 30 };
  const lobes: [number, number, number, number][] = [
    [0, -190, 170, 150],
    [-150, -110, 150, 100],
    [140, -120, 170, 115],
    [-290, -40, 140, 60],
    [300, -40, 170, 64],
    [-60, -300, 92, 86],
    [70, -280, 86, 80],
    [-430, 0, 120, 34],
  ];
  const MS = 0.3;
  for (const [i, [x, y, rx, ry]] of lobes.entries())
    mtn.p(i, foot.x + x * MS, foot.y + y * MS, rx * MS, ry * MS);
  mtn
    .p(8, foot.x, foot.y - 12, 60, 0.012)
    .c(9, 0x8a8490)
    .c(10, 0x12141e)
    .c(11, 0xd8d0cc)
    .c(12, 0x1a2234, 0.25)
    .p(13, foot.y + 6, 3, 1.7);
  mtn.mesh.position.set(mp.x - foot.x, mp.y - foot.y + 8);
  const core = new Container();
  core.blendMode = 'add';
  R.addChild(core);
  const coreA = glow(mp.x, mp.y - 10, 12, 0xe8e2dc, 0.6);
  const coreB = glow(mp.x, mp.y - 10, 90, 0xa8a4b0, 0.2);
  core.addChild(coreB, coreA);
  // --- The wood below them: rounded crowns in moonlight, the pale point in it, its line out to the root's front.
  const wood = new Graphics();
  R.addChild(wood);
  const crowns: number[] = [];
  for (let x = -40; x <= VIEW_W + 40; x += 8) {
    const k = x / VIEW_W;
    const bump = 34 * Math.abs(Math.sin(x * 0.011)) ** 0.6 + 16 * Math.abs(Math.sin(x * 0.029 + 1)) ** 0.7;
    crowns.push(x, 900 - 50 * Math.sin(k * 3.1 + 0.4) - bump);
  }
  wood.poly([...crowns, VIEW_W + 40, VIEW_H + 20, -40, VIEW_H + 20]).fill(0x060c12);
  wood.moveTo(crowns[0]!, crowns[1]!);
  for (let i = 2; i < crowns.length; i += 2) wood.lineTo(crowns[i]!, crowns[i + 1]!);
  wood.stroke({ color: 0x5a7090, width: 2, alpha: 0.45 });
  const line = new Graphics();
  R.addChild(line);
  const point = new Container();
  point.blendMode = 'add';
  R.addChild(point);
  const pA = glow(POINT.x, POINT.y, 9, 0xe8e2dc, 0.9);
  const pB = glow(POINT.x, POINT.y, 50, 0xb8b0b8, 0.25);
  point.addChild(pB, pA);
  // --- The dance above: close enough to see the moths; one edged silver.
  type Dancer = { c: Container; w: Graphics; silver: boolean; ph: number; r: number; sp: number };
  const dancers: Dancer[] = [];
  for (let i = 0; i < 22; i++) {
    const cc = new Container();
    const w = new Graphics();
    const silver = i === 4;
    const span = silver ? 26 : 16 + (i % 4) * 2;
    for (const side of [-1, 1]) {
      const pts = [0, 0, side * span * 0.5, -span * 0.32, side * span * 0.42, span * 0.16];
      w.poly(pts).fill({ color: silver ? 0x2c2a3c : 0xead8b8, alpha: 0.95 });
      if (silver) w.poly(pts).stroke({ color: 0xf2f6ff, width: 2, alpha: 1 });
    }
    cc.addChild(glow(0, 0, silver ? 34 : 24, silver ? 0xdfe8ff : 0xffd9a0, 0.5), w);
    R.addChild(cc);
    dancers.push({
      c: cc,
      w,
      silver,
      ph: (i / 22) * Math.PI * 2,
      r: 0.75 + (i % 3) * 0.14,
      sp: 0.5 + (i % 5) * 0.05,
    });
  }
  // --- The twig they stand on, dark against the moonlit world, coming in from the left.
  const twig = new Graphics();
  R.addChild(twig);
  twig
    .moveTo(-80, VIEW_H + 40)
    .bezierCurveTo(140, 980, 400, TWIG.y + 30, TWIG.x + 300, TWIG.y + 8)
    .stroke({ color: 0x05070c, width: 44, cap: 'round' });
  twig
    .moveTo(TWIG.x - 200, TWIG.y + 26)
    .quadraticCurveTo(TWIG.x, TWIG.y + 6, TWIG.x + 300, TWIG.y + 8)
    .stroke({ color: 0x05070c, width: 26, cap: 'round' });
  twig
    .moveTo(TWIG.x - 200, TWIG.y + 14)
    .quadraticCurveTo(TWIG.x, TWIG.y - 4, TWIG.x + 290, TWIG.y - 2)
    .stroke({ color: 0x9ab4d8, width: 3, alpha: 0.6 });
  for (const [x, y, a] of [
    [TWIG.x + 300, TWIG.y + 6, -0.2],
    [TWIG.x - 120, TWIG.y + 22, -1.9],
  ] as const) {
    twig
      .poly([
        x,
        y,
        x + Math.cos(a) * 110 - 20,
        y + Math.sin(a) * 110,
        x + Math.cos(a) * 130,
        y + Math.sin(a) * 130 - 10,
      ])
      .fill(0x070a10);
  }
  // --- The two of them.
  const scene: Scene = {
    id: 'summit',
    width: 6000,
    height: 4000,
    spawn: { x: WX, y: FLOOR },
    solids: [{ x: 0, y: FLOOR, w: 6000, h: 200, tag: 'ground' }],
    oneWays: [],
  };
  const her = new Figure(c.renderer, scene, WING_X);
  const him = new Figure(c.renderer, scene, WING_X);
  const lift = new ColorMatrixFilter();
  lift.brightness(1.14, false);
  lift.saturate(-0.28, true);
  him.layer.filters = [lift];
  const hisWings = new Graphics();
  R.addChild(hisWings, him.layer, her.layer);
  const glint = new Container();
  glint.blendMode = 'add';
  R.addChild(glint);
  const gA = glow(0, 0, 9, 0xfff1d4, 1);
  const gB = glow(0, 0, 70, 0xffb36b, 0.5);
  glint.addChild(gB, gA);
  // Settle their chains before the first picture.
  const gap = (SORREL_X - WING_X) / SCALE;
  for (let i = 0; i < 90; i++) {
    her.skin.update(1 / 60, i / 60, her.pose(0, 0, 1, false), []);
    him.skin.update(1 / 60, i / 60, him.pose(gap, 0, -1, false), []);
  }

  return (t: number, dt: number) => {
    const S = SUMMIT;
    const bt = Math.min(t, S.end);
    const b = pulse(t);
    coreA.alpha = 0.35 + 0.45 * b;
    coreB.alpha = 0.12 + 0.12 * b;
    pA.alpha = 0.6 + 0.3 * b;
    line.clear();
    line.moveTo(POINT.x, POINT.y);
    for (let i = 1; i <= 20; i++) {
      const u = i / 20;
      line.lineTo(POINT.x + (FRONT.x - POINT.x) * u + Math.sin(u * 7) * 8, POINT.y + (FRONT.y - POINT.y) * u);
    }
    line.stroke({ color: 0xd9cfc4, width: 1.6, alpha: 0.22 + 0.16 * b });
    // His and her cues.
    const H2 = him.cue;
    const W = her.cue;
    for (const cc of [H2, W]) for (const k of Object.keys(cc) as (keyof CineCues)[]) cc[k] = 0;
    // He looks up at the dance; she looks out over the world.
    H2.lookUp =
      envelope(bt, S.looks[0], S.looks[0] + 0.8, S.offer[0] - 0.2, S.offer[0]) +
      window01(bt, S.offer[0] + 0.9, S.offer[0] + 1.4) * (1 - window01(bt, S.offer[1] - 0.2, S.offer[1]));
    W.look = envelope(bt, S.looks[0] + 0.4, S.looks[0] + 1.4, S.fold[0] - 0.4, S.fold[0]);
    W.hold = 0.5 * (1 - window01(bt, S.fold[0], S.fold[0] + 0.6));
    // He turns to her and offers: a hand out to her, then up at the dance.
    const turned = bt >= S.offer[0] && bt < S.lift[0] + 0.3;
    H2.tap =
      envelope(bt, S.offer[0] + 0.2, S.offer[0] + 0.6, S.offer[0] + 0.9, S.offer[0] + 1.3) +
      envelope(bt, S.tap[0], S.tap[0] + 0.2, S.tap[1] - 0.2, S.tap[1]);
    // She hesitates, and folds her wing over the glint.
    W.fold = window01(bt, S.fold[0], S.fold[0] + 0.9);
    W.tap = 0.4 * envelope(bt, S.tap[0], S.tap[0] + 0.2, S.tap[1] - 0.2, S.tap[1]);
    // She watches him go.
    W.lookUp = window01(bt, S.lift[0] + 0.4, S.lift[0] + 1.4);
    // He goes: up off the twig, beating, into the dance; smaller as he goes.
    const up = window01(bt, S.lift[0], S.lift[1]);
    const ux = (up * (DANCE.x - 120 - SORREL_X)) / SCALE;
    const uy = (up * (TWIG.y - DANCE.y - 30)) / SCALE;
    const air = up > 0.01;
    const hv = him.pose(gap + ux, uy, turned && !air ? -1 : 1, air);
    him.skin.hideWings = air;
    him.layer.alpha = 1 - window01(bt, S.lift[1] - 0.6, S.lift[1]);
    him.skin.update(dt * 1.25, t * 1.25 + 7, hv, []);
    her.skin.update(dt, t, her.pose(0, 0, 1, false), []);
    hisWings.clear();
    if (air) {
      const sx = WING_X + (hv.cx - WX) * SCALE;
      const sy = TWIG.y + (hv.feetY - 50 - FLOOR) * SCALE;
      hisWings.scale.set(1);
      drawFlightWings(
        hisWings,
        sx,
        sy,
        t * 7.5,
        Math.min(1, up * 6) * (1 - window01(bt, S.lift[1] - 0.6, S.lift[1])),
      );
      hisWings.scale.set(1);
    }
    // The glint: in her hands; folded over, it only leaks amber from under her wing.
    const hx = WING_X + (her.skin.offer.x - WX) * SCALE;
    const hy = TWIG.y + (her.skin.offer.y - FLOOR) * SCALE;
    glint.position.set(hx, hy);
    const hidden = 0.8 * W.fold;
    glint.alpha =
      (0.75 + 0.25 * Math.sin(t * 3)) * (1 - hidden) + 0.15 * W.fold * (0.6 + 0.4 * Math.sin(t * 2.3));
    // The dance; the silver one leaves it and circles him, once.
    for (const [i, d] of dancers.entries()) {
      const a = t * d.sp * 0.7 + d.ph;
      let x = DANCE.x + Math.cos(a) * DANCE.rx * d.r + Math.sin(a * 2.1 + i) * 12;
      let y = DANCE.y + Math.sin(a) * DANCE.ry * d.r + Math.cos(a * 2.9 + i) * 8;
      if (d.silver) {
        const k = envelope(bt, S.silver[0], S.silver[0] + 0.6, S.silver[1] - 0.6, S.silver[1]);
        const u = window01(bt, S.silver[0], S.silver[1]) * Math.PI * 2;
        x += (SORREL_X + Math.cos(u) * 110 - x) * k;
        y += (TWIG.y - 170 + Math.sin(u) * 50 - y) * k;
      }
      d.c.position.set(x, y);
      d.w.scale.y = 0.3 + 0.7 * Math.abs(Math.sin(t * (11 + (i % 3)) + i));
      d.c.alpha = 0.85 + 0.15 * Math.sin(t * 3 + i);
    }
    R.alpha = window01(t, S.fadeIn[0], S.fadeIn[1]);
  };
}
