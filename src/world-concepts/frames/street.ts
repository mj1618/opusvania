// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 1. The kept street. A human street under pale warm root: a bus shelter and a lamp post wrapped
 * in it, sleepers in seed-pod cases on stalks, and on the far horizon the mountain of folded tissue,
 * faintly lit from its core. Everything the Mouth owns breathes on one slow shared rhythm. Umber,
 * small and warm, is the only other light.
 */
import { Container, Graphics } from 'pixi.js';
import { prng } from '../../render/scene/lib/look';
import { FOG, MOUNTAIN, REFLECT, SKY, STEAM } from '../../render/world/bodies';
import type { Composer } from '../../render/world/compose';
import {
  braid,
  curtain,
  donePods,
  MOUTH,
  mat,
  mixHex,
  pod,
  podLayers,
  spread,
  WARM,
} from '../../render/world/kit';
import { VIEW_H, VIEW_W } from '../../render/world/layer';
import { moths } from '../../render/world/moths';
import { blob, glow, ridge, sleeper, vgrad } from '../../render/world/paint';
import { drape, grip, ruin, windowGlows } from '../../render/world/ruin';
import { helix, type Pt, smoothPath, taper, wander } from '../../render/world/tissue';
import { beads, rust, streaks } from '../../render/world/wear';
import type { WorldFrame } from '../types';

const GROUND = 905;
const HORIZON = 640;

function build(c: Composer): void {
  const rng = prng(4101);
  const R = c.root;
  c.grade = {
    shadow: 0x080a20,
    shadowK: 0.035,
    deep: 0x020310,
    deepK: 0.78,
    saturation: 1.22,
    contrast: 1.14,
    grain: 0.028,
    vignette: 0.3,
    vignetteSoft: 0.55,
    bloom: [0.56, 0.7, 0.6],
  };

  // --- Sky.
  const sky = c.shader('sky', 0, 0, VIEW_W, VIEW_H, SKY, R);
  sky
    .c(0, 0x020308)
    .c(1, 0x060916)
    .c(2, 0x22183a)
    .p(3, HORIZON, 0.4)
    .p(4, 1210, 600, 420)
    .c(5, 0x3a2044)
    .c(6, 0x7a3e5a)
    .c(7, 0x50404e, 0.6);

  // --- The mountain of folded tissue (far, hazed).
  const mtn = c.shader('mountain', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const lobes: [number, number, number, number][] = [
    [1210, 430, 230, 190],
    [1030, 520, 190, 130],
    [1400, 500, 210, 150],
    [880, 590, 170, 80],
    [1580, 585, 190, 90],
    [1130, 330, 120, 110],
    [1290, 360, 110, 100],
    [760, 630, 140, 50],
  ];
  // Scaled about its foot: far enough that it sits on the horizon, not over the street.
  for (const [i, [x, y, rx, ry]] of lobes.entries())
    mtn.p(i, 1210 + (x - 1210) * 0.86, HORIZON + (y - HORIZON) * 0.84, rx * 0.86, ry * 0.84);
  mtn
    .p(8, 1210, 640, 300, 0.008)
    .c(9, 0xc8a8a4)
    .c(10, 0x1e1a2c)
    .c(11, 0xf4b4a8)
    .c(12, 0x272a44, 0.32)
    .p(13, HORIZON + 10, 3, 1);
  // Its core: the small pale light at its foot.
  const core = new Container();
  core.blendMode = 'add';
  R.addChild(core);
  const coreG = glow(1210, 630, 70, 0xffd8c8, 0.4);
  const coreG2 = glow(1210, 615, 360, 0xb07080, 0.2);
  core.addChild(coreG2, coreG);
  c.on((_t, b) => {
    coreG.alpha = 0.3 + 0.25 * b;
    coreG2.alpha = 0.12 + 0.08 * b;
  });

  const breathers: ((b: number) => void)[] = [];
  const POD_GLOW = 0xd8b8c0;

  // --- Far city: blocks swallowed at the mountain's foot, roots running out over the land like frost.
  const far = c.plane('far', {
    fog: 0x342c58,
    fogK: 0.64,
    ramp: [440, 720, -0.05, 0.25],
    mottle: 0.1,
    blur: 2.2,
    lit: 0.5,
    seed: 1,
    edge: [8, 0.2, 0, 0],
    brush: [0.06, 60, 1.57, 7],
  });
  const farG = new Graphics();
  far.view.addChild(farG);
  const farRoots = c.batch('far-roots', { glow: MOUTH.inner, glowK: 0.5, swell: 0.03 }, far.view);
  const farLit: { x: number; y: number; w: number; h: number }[] = [];
  for (const [x0, x1] of [
    [220, 820],
    [1540, 1980],
  ] as const)
    for (let x = x0 + rng() * 20; x < x1; ) {
      const w = 60 + rng() * 90;
      const r = ruin(rng, farG, {
        x,
        w,
        top: 420 + rng() * 150,
        bottom: HORIZON + 50,
        color: 0x161830,
        sky: 0x3a3c5c,
        lean: (rng() - 0.5) * 24,
        sag: rng() * 8,
        breaks: [1 + Math.floor(rng() * 2), 30 + rng() * 40],
        storey: 22,
        cols: Math.max(2, Math.round(w / 22)),
        win: [6, 9],
        bricked: 0.3,
        broken: 0.1,
        lit: 0.05,
        weather: 0.3,
        clutter: 2,
      });
      farLit.push(...r.lit);
      if (rng() < 0.7)
        drape(rng, farRoots, r, {
          color: MOUTH.boneMoon,
          shadow: MOUTH.boneShadow,
          glow: 0.4,
          fold: [1.5, 5],
          pours: 2,
          pourLen: [30, 140],
          pourW: 2.5,
          lobes: 0.4,
          from: rng() * 0.5,
          span: 0.5,
        });
      x += w + rng() * 30 - 8;
    }
  // The land at the mountain's foot: low swells of root, paler toward the horizon.
  farG.poly(ridge(rng, -20, VIEW_W + 20, HORIZON + 6, 14, 820, 16).flat()).fill(
    vgrad([
      [0, 0x2a2840],
      [0.5, 0x121124],
      [1, 0x0b0b18],
    ]),
  );
  for (let i = 0; i < 14; i++) {
    const x = rng() * VIEW_W;
    farG
      .poly(blob(rng, x, HORIZON + 16 + rng() * 40, 40 + rng() * 90, 10 + rng() * 14, 0.25).flat())
      .fill(0x1a1828);
  }
  // Frost-lines: from the mountain's foot out across the land toward us.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = 1210 + side * (80 + rng() * 420);
    const pts = wander(rng, {
      x,
      y: HORIZON + 4,
      ang: side < 0 ? Math.PI - 0.05 : 0.05,
      len: 200 + rng() * 520,
      step: 10,
      curl: 0.14,
    });
    for (const p of pts) p[1] = HORIZON + 2 + Math.abs(p[0] - 1210) * 0.05 + (p[1] - HORIZON) * 0.15;
    farRoots.strip(pts, taper(3.2, 0.5), { color: MOUTH.boneMoon, glow: 0.6, seed: rng() });
  }
  farRoots.done();
  const farWg = windowGlows(rng, farG, farLit, POD_GLOW, 0.3);
  far.view.addChild(farWg.view);
  breathers.push(farWg.update);

  // --- Haze between far and the far side of the street, lit by the mountain's core.
  const haze = c.shader('haze', 0, 0, VIEW_W, VIEW_H, FOG, R);
  haze
    .c(0, 0x302858, 0.5)
    .p(1, 900, 120, 0.006, 0)
    .p(2, HORIZON - 220, HORIZON - 30, HORIZON + 120, HORIZON + 260)
    .p(3, 0.25, 0.85, 0.3, 0.3)
    .p(5, 1210, 640, 340, 0.9)
    .c(6, 0xb06a88);

  // --- The town behind the shops: roofs, gables, chimneys and aerials against the mountain's glow.
  const roofs = c.plane('roofs', {
    fog: 0x2c2650,
    fogK: 0.5,
    ramp: [540, 720, -0.05, 0.2],
    mottle: 0.1,
    blur: 1.4,
    lit: 0.5,
    seed: 11,
    edge: [7, 0.18, 0.04, 0],
    rim: 0xc890a8,
    rimK: 0.3,
    rimDir: [0.3, -1],
    rimW: 3,
  });
  const roofsG = new Graphics();
  roofs.view.addChild(roofsG);
  const roofsLit: { x: number; y: number; w: number; h: number }[] = [];
  for (let x = 180 + rng() * 30; x < 1800; ) {
    const w = 70 + rng() * 110;
    const gable = rng() < 0.6;
    const r = ruin(rng, roofsG, {
      x,
      w,
      top: 600 + rng() * 40,
      bottom: 740,
      color: 0x18162e,
      sky: 0x3c3460,
      lean: (rng() - 0.5) * 10,
      sag: gable ? 0 : rng() * 8,
      peak: gable ? 24 + rng() * 34 : 0,
      breaks: [Math.floor(rng() * 2), 20],
      storey: 30,
      cols: Math.max(2, Math.round(w / 34)),
      win: [9, 12],
      bricked: 0.3,
      broken: 0.1,
      lit: 0.18,
      weather: 0.3,
      clutter: 3,
    });
    roofsLit.push(...r.lit);
    // Chimney pots and a bent aerial or two.
    if (rng() < 0.7) {
      const cx = x + w * (0.2 + rng() * 0.6);
      const cy = r.roofAt(cx);
      roofsG.rect(cx - 7, cy - 26, 14, 28).fill(0x18162e);
      for (let k = 0; k < 2; k++) roofsG.rect(cx - 6 + k * 7, cy - 34, 5, 9).fill(0x18162e);
    }
    if (rng() < 0.5) {
      const ax = x + w * rng();
      const ay = r.roofAt(ax);
      roofsG
        .moveTo(ax, ay)
        .lineTo(ax + 3, ay - 44)
        .stroke({ color: 0x18162e, width: 2 });
      roofsG
        .moveTo(ax - 16, ay - 34)
        .lineTo(ax + 20, ay - 40)
        .stroke({ color: 0x18162e, width: 2 });
      roofsG
        .moveTo(ax - 10, ay - 24)
        .lineTo(ax + 14, ay - 27)
        .stroke({ color: 0x18162e, width: 1.5 });
    }
    x += w + rng() * 16 - 4;
  }
  const roofsWg = windowGlows(rng, roofsG, roofsLit, 0xe8b0c0, 0.4);
  roofs.view.addChild(roofsWg.view);
  breathers.push(roofsWg.update);

  // --- The far side of the street: a row of small shops and houses, gables and flat roofs, all
  // swallowed; the queue of cases waits on its pavement.
  const row = c.plane('row', {
    fog: 0x261f4a,
    fogK: 0.4,
    ramp: [560, 800, -0.05, 0.18],
    amb: 0xa090c8,
    sat: 1.15,
    mottle: 0.16,
    blur: 1,
    lit: 0.7,
    seed: 5,
    edge: [9, 0.16, 0.06, 0],
    rim: 0x6a6488,
    rimK: 0.22,
    rimDir: [0.2, -1],
    rimW: 4,
    brush: [0.1, 40, 1.57, 6],
  });
  const rowG = new Graphics();
  row.view.addChild(rowG);
  const rowRoots = c.batch(
    'row-roots',
    { glow: MOUTH.inner, glowK: 0.5, rim: MOUTH.static, rimK: 0.15, swell: 0.04, sss: POD_GLOW, sssK: 0.12 },
    row.view,
  );
  const rowLit: { x: number; y: number; w: number; h: number }[] = [];
  for (let x = 300 + rng() * 20; x < 1700; ) {
    const w = 110 + rng() * 120;
    const gable = rng() < 0.5;
    const r = ruin(rng, rowG, {
      x,
      w,
      top: 640 + rng() * 50,
      bottom: 784,
      color: 0x14142a,
      sky: 0x34385a,
      lean: (rng() - 0.5) * 14,
      sag: gable ? 0 : rng() * 10,
      peak: gable ? 30 + rng() * 40 : 0,
      breaks: [Math.floor(rng() * 2), 30],
      storey: 46,
      cols: Math.max(2, Math.round(w / 50)),
      win: [16, 20],
      bricked: 0.15,
      broken: 0.1,
      lit: 0.3,
      weather: 0.5,
      clutter: 2,
      shop: true,
    });
    rowLit.push(...r.lit);
    drape(rng, rowRoots, r, {
      color: MOUTH.boneMoon,
      shadow: MOUTH.boneShadow,
      glow: 0.5,
      fold: [2, 9],
      pours: 2,
      pourLen: [30, 120],
      pourW: 4,
      lobes: 0.6,
      from: rng() * 0.3,
      span: 0.4 + rng() * 0.6,
    });
    x += w + rng() * 26 - 6;
  }
  // The far pavement, and the dead lamps along it.
  rowG.rect(0, 780, VIEW_W, 10).fill(0x262640);
  for (const x of [330, 930, 1580]) {
    rowG.rect(x - 2, 640, 4, 142).fill(0x15152a);
    rowG.poly([x - 2, 642, x - 30, 636, x - 34, 642, x - 2, 650]).fill(0x15152a);
  }
  const rowGlows = new Container();
  rowGlows.blendMode = 'add';
  const rowPods = podLayers(c, row.view, 0.55, rowGlows);
  // A queue of cases standing on the far pavement, where people waited for a bus.
  for (let i = 0; i < 9; i++) {
    const x = 980 + i * 34 + rng() * 10;
    const len = 32 + rng() * 9;
    pod(rng, rowPods, {
      x,
      y: 782 - len - 4,
      stalk: 2,
      len,
      w: 9.5 + rng() * 2,
      lean: (rng() - 0.5) * 4,
      glow: 0.4 + rng() * 0.3,
    });
  }
  mat(rng, rowRoots, 300, 1700, 784, 14, [1.5, 3.5], MOUTH.boneMoon, 4, 0.5);
  rowRoots.done();
  donePods(rowPods);
  row.view.addChild(rowGlows);
  const rowWg = windowGlows(rng, rowG, rowLit, POD_GLOW, 0.32);
  row.view.addChild(rowWg.view);
  breathers.push(rowWg.update);

  const haze2 = c.shader('haze2', 0, 0, VIEW_W, VIEW_H, FOG, R);
  haze2.c(0, 0x262a46, 0.4).p(1, 700, 90, 0.008, 0).p(2, 600, 760, 800, 880).p(3, 0.3, 0.85, 0.3, 0.2);

  // --- Mid: the street's tall buildings framing the view, the road, the slung root with its cases.
  const mid = c.plane('mid', {
    fog: 0x1a1c34,
    fogK: 0.3,
    amb: 0x7a80a8,
    ramp: [420, 900, 0, 0.22],
    mottle: 0.2,
    mottleScale: 180,
    blur: 0.4,
    lit: 0.75,
    seed: 2,
    edge: [12, 0.12, 0.12, 0],
    rim: 0x5a5a88,
    rimK: 0.3,
    rimDir: [0.6, -0.8],
    rimW: 5,
    rimLights: 0.6,
    brush: [0.15, 50, 1.5, 7],
    paint: 3,
  });
  const midG = new Graphics();
  mid.view.addChild(midG);
  // The road between the pavements.
  midG.rect(0, 788, VIEW_W, 122).fill(
    vgrad([
      [0, 0x121226],
      [1, 0x0a0a17],
    ]),
  );
  for (let x = 30; x < VIEW_W; x += 150) midG.rect(x, 850, 70, 3).fill({ color: 0x3c3a52, alpha: 0.4 });
  const midRoots = c.batch(
    'mid-roots',
    { glow: MOUTH.inner, glowK: 0.55, rim: MOUTH.static, rimK: 0.15, swell: 0.04, sss: POD_GLOW, sssK: 0.14 },
    mid.view,
  );
  const midLit: { x: number; y: number; w: number; h: number }[] = [];
  const left = ruin(rng, midG, {
    x: -60,
    w: 360,
    top: 40,
    bottom: 800,
    color: 0x111024,
    sky: 0x2c2c4c,
    lean: 26,
    sag: 8,
    breaks: [2, 80],
    storey: 64,
    cols: 4,
    win: [24, 32],
    bricked: 0.25,
    broken: 0.15,
    lit: 0.08,
    weather: 0.8,
    clutter: 2,
    shop: true,
  });
  const right = ruin(rng, midG, {
    x: 1650,
    w: 330,
    top: 120,
    bottom: 800,
    color: 0x100f22,
    sky: 0x2c2c4c,
    lean: -30,
    sag: 6,
    breaks: [2, 90],
    storey: 64,
    cols: 4,
    win: [24, 32],
    bricked: 0.25,
    broken: 0.15,
    lit: 0.08,
    weather: 0.8,
    clutter: 2,
    shop: true,
  });
  midLit.push(...left.lit, ...right.lit);
  for (const [r, side] of [
    [left, 1],
    [right, -1],
  ] as const) {
    drape(rng, midRoots, r, {
      color: MOUTH.boneMoon,
      shadow: MOUTH.boneShadow,
      glow: 0.5,
      fold: [6, 22],
      pours: 5,
      pourLen: [200, 560],
      pourW: 10,
    });
    grip(rng, midRoots, r, side, {
      color: MOUTH.boneMoon,
      shadow: MOUTH.boneShadow,
      glow: 0.5,
      w: 24,
      arms: 5,
      bottom: 800,
    });
  }
  curtain(
    rng,
    midRoots,
    1650,
    1950,
    (x) => right.roofAt(x) + 8,
    [40, 260],
    [2, 5],
    MOUTH.boneShadow,
    0.5,
    [16, 44],
  );
  curtain(
    rng,
    midRoots,
    -20,
    320,
    (x) => left.roofAt(x) + 8,
    [40, 260],
    [2, 5],
    MOUTH.boneShadow,
    0.5,
    [16, 44],
  );
  // Roots crossing the road toward us.
  mat(rng, midRoots, 0, VIEW_W, 792, 16, [2, 5], MOUTH.boneMoon, 6, 0.5);
  mat(rng, midRoots, 0, VIEW_W, 860, 10, [2, 4], MOUTH.boneShadow, 30, 0.4);
  // A root slung high across the street from building to building, braided from several strands that
  // twist round each other and sag; the cases hang from it like fruit.
  const sling = smoothPath(
    [
      [200, 100],
      [520, 214],
      [900, 258],
      [1260, 240],
      [1560, 180],
      [1700, 150],
    ],
    24,
  );
  for (let k = 0; k < 5; k++) {
    const ph = k * 1.3;
    const amp = 5 + k * 2.2;
    const sl = sling.map(
      ([x, y], i) => [x + Math.cos(i * 0.09 + ph) * 2, y + Math.sin(i * 0.09 + ph) * amp + k * 1.5] as Pt,
    );
    const w0 = [15, 9, 7, 5, 4][k]!;
    sl.reverse();
    midRoots.strip(sl, (t) => w0 * (0.75 + 0.4 * Math.sin(t * 19 + ph) * Math.sin(t * 6 + k)) + 1, {
      color: k % 2 ? MOUTH.boneShadow : MOUTH.boneMoon,
      glow: 0.4,
      seed: 0.37 + k * 0.11,
    });
  }
  curtain(
    rng,
    midRoots,
    300,
    1650,
    (x) =>
      sling[
        Math.min(sling.length - 1, Math.max(0, Math.round(((x - 200) / 1500) * (sling.length - 1))))
      ]![1] + 10,
    [6, 60],
    [1.5, 4],
    MOUTH.boneShadow,
    0.4,
    [26, 80],
  );
  const midGlows = new Container();
  midGlows.blendMode = 'add';
  const midPods = podLayers(c, mid.view, 0.55, midGlows);
  for (let k = 10; k < sling.length - 6; k += 6 + Math.floor(rng() * 7)) {
    const [x, y] = sling[k]!;
    const big = rng();
    pod(rng, midPods, {
      x,
      y: y + 12,
      stalk: 8 + rng() ** 3 * 140,
      len: 36 + big * 22,
      w: 12 + big * 6,
      glow: 0.7 + rng() * 0.3,
      color: mixHex(0xe0b4ac, 0xa88c98, rng()),
    });
  }
  donePods(midPods);
  midRoots.done();
  mid.view.addChild(midGlows);
  // The cases are the street's warm points: their glow pinker and fuller than the root's.
  for (const g of midGlows.children) {
    g.alpha *= 3;
    (g as ReturnType<typeof glow>).tint = 0xf8b0a8;
  }
  const midWg = windowGlows(rng, midG, midLit, POD_GLOW, 0.24);
  mid.view.addChild(midWg.view);
  breathers.push(midWg.update);

  // --- On the road: the traffic as it was when everyone fell asleep. Cars swallowed where they
  // stopped, a sleeper at each wheel, root over the roofs; bollards along the far kerb.
  const traffic = c.plane('traffic', {
    fog: 0x1e1a3c,
    fogK: 0.22,
    amb: 0x9088c0,
    sat: 1.15,
    ramp: [700, 900, 0, 0.1],
    mottle: 0.18,
    mottleScale: 120,
    blur: 0.6,
    lit: 0.8,
    seed: 12,
    edge: [8, 0.12, 0.1, 0],
    rim: 0x8a78b0,
    rimK: 0.3,
    rimDir: [0.4, -0.9],
    rimW: 4,
    rimLights: 0.6,
    brush: [0.12, 40, 0.1, 6],
    paint: 2,
  });
  const carG = new Graphics();
  traffic.view.addChild(carG);
  const carRoots = c.batch(
    'car-roots',
    { glow: MOUTH.inner, glowK: 0.55, rim: MOUTH.static, rimK: 0.2, swell: 0.045, sss: POD_GLOW, sssK: 0.16 },
    traffic.view,
  );
  const carGlows = new Container();
  carGlows.blendMode = 'add';
  const carBreath: { s: ReturnType<typeof glow>; a: number }[] = [];
  /** A saloon car in side view, facing `dir`, sunk on flat tyres, a sleeper at the wheel. */
  const car = (x0: number, bottom: number, len: number, h: number, dir: 1 | -1, col: number) => {
    const P = (u: number, v: number): Pt => [dir > 0 ? x0 + u * len : x0 + (1 - u) * len, bottom - v * h];
    const prof: [number, number][] = [
      [0.02, 0.1],
      [0, 0.2],
      [0.0, 0.42],
      [0.05, 0.5],
      [0.22, 0.53],
      [0.3, 0.6],
      [0.38, 0.95],
      [0.62, 1],
      [0.74, 0.62],
      [0.9, 0.55],
      [1, 0.46],
      [1, 0.18],
      [0.97, 0.1],
    ];
    const body: Pt[] = prof.map(([u, v]) => P(u, v));
    // Wheel arches bitten out of the sill.
    for (const wu of [0.8, 0.2])
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * (k / 8);
        body.push(P(wu + Math.cos(a) * 0.1 * (dir > 0 ? 1 : 1), 0.1 + Math.sin(a) * 0.22));
      }
    carG.poly(body.flat()).fill(
      vgrad([
        [0, 0x3a3456],
        [0.08, col],
        [0.45, mixHex(col, 0x4a4468, 0.5)],
        [0.5, col],
        [1, 0x0c0a18],
      ]),
    );
    // The shoulder's crease catching the sky, dust on the bonnet, rust low on the sill.
    carG
      .poly([...P(0.02, 0.47), ...P(0.98, 0.47), ...P(0.98, 0.44), ...P(0.02, 0.43)])
      .fill({ color: 0x7a70a0, alpha: 0.45 });
    carG
      .poly([...P(0.74, 0.62), ...P(0.9, 0.56), ...P(0.99, 0.48), ...P(0.74, 0.58)])
      .fill({ color: 0x8a80a8, alpha: 0.3 });
    for (let k = 0; k < 4; k++) {
      const [rx, ry] = P(0.05 + rng() * 0.9, 0.12 + rng() * 0.1);
      rust(rng, carG, rx, ry, 4 + rng() * 9, 2 + rng() * 3, 0.4);
    }
    // A cracked headlamp.
    {
      const [hx, hy] = P(0.985, 0.36);
      carG.ellipse(hx, hy, 5, 9).fill({ color: 0xb8b4d0, alpha: 0.5 });
      carG
        .moveTo(hx - 3, hy - 6)
        .lineTo(hx + 2, hy + 4)
        .stroke({ color: 0x1a1830, width: 1 });
    }
    // Flat tyres, sunk.
    for (const wu of [0.2, 0.8]) {
      const [wx, wy] = P(wu, 0.08);
      carG.ellipse(wx, wy, len * 0.085, h * 0.12).fill(0x07070e);
      carG.ellipse(wx, wy - h * 0.03, len * 0.04, h * 0.07).fill(0x2a2838);
    }
    // Windows: dark, a sleeper's case in the driver's seat, glowing.
    const win: Pt[] = [P(0.33, 0.6), P(0.4, 0.9), P(0.61, 0.93), P(0.71, 0.62)];
    carG.poly(win.flat()).fill(0x6a3a56);
    const [sx, sy] = P(0.56, 0.72);
    sleeper(carG, sx, sy, h * 0.42, -0.1 * dir, 0x1a1024, 0.85);
    const g1 = glow(sx, sy, h * 0.7, 0xf8b0c0, 0.4);
    carGlows.addChild(g1);
    carBreath.push({ s: g1, a: 0.4 });
    carG
      .moveTo(...P(0.5, 0.6))
      .lineTo(...P(0.5, 0.93))
      .stroke({ color: col, width: 4 });
    // A pink pool on the road beneath it.
    carGlows.addChild(glow(sx, bottom + 4, len * 0.4, 0xc87898, 0.08));
    // Root over its roof and pouring down its flanks; a mound of it at the wheels.
    const top = prof.slice(3, 11).map(([u, v]) => P(u, v + 0.02));
    if (dir < 0) top.reverse();
    const r = {
      roof: top,
      outline: body,
      lit: [],
      roofAt: (x: number) => {
        for (let i = 0; i < top.length - 1; i++) {
          const a = top[i]!;
          const b = top[i + 1]!;
          if (x >= a[0] && x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1, b[0] - a[0]);
        }
        return top[0]![1];
      },
      wallAt: (_y: number, side: -1 | 1) => (side < 0 ? x0 : x0 + len),
    };
    drape(rng, carRoots, r, {
      color: MOUTH.boneMoon,
      shadow: MOUTH.boneShadow,
      glow: 0.5,
      fold: [3, 11],
      pours: 4,
      pourLen: [20, h * 0.8],
      pourW: 4,
      lobes: 0.8,
      from: 0.1,
      span: 0.8,
    });
    spread(rng, carRoots, P(0.2, 0)[0], bottom + 2, 4, [60, 160], [3, 6], MOUTH.boneMoon, 0.5);
    spread(rng, carRoots, P(0.8, 0)[0], bottom + 2, 4, [60, 160], [3, 6], MOUTH.boneMoon, 0.5);
  };
  car(1100, 842, 420, 150, -1, 0x1c1834);
  car(60, 830, 380, 136, 1, 0x1a1a30);
  // Bollards along the far kerb, a bin, a case sat on the kerb as if waiting to cross.
  for (let x = 560; x < 1060; x += 86) {
    carG.roundRect(x - 7, 742, 14, 46, 6).fill(0x16142a);
    carG.rect(x - 7, 752, 14, 5).fill({ color: 0x8a6a70, alpha: 0.5 });
  }
  carG.roundRect(1020, 730, 36, 56, 5).fill(0x1a1830);
  carG.rect(1016, 728, 44, 8).fill(0x24223a);
  rust(rng, carG, 1036, 770, 10, 6, 0.6);
  carRoots.done();
  traffic.view.addChild(carGlows);
  breathers.push((b) => {
    for (const cb of carBreath) cb.s.alpha = cb.a * (0.6 + 0.6 * b);
  });

  // --- Low mist on the road.
  const mist = c.shader('mist', 0, 0, VIEW_W, VIEW_H, FOG, R);
  mist
    .c(0, 0x262a46, 0.55)
    .p(1, 620, 70, 0.01, 0)
    .p(2, 730, 800, 890, 960)
    .p(3, 0.3, 0.8, 0.4, 0.2)
    .p(5, 1040, 880, 220, 0.5)
    .c(6, 0x8a6a58);

  // --- Near: the bus shelter and the lamp post, wrapped; the pavement she stands on.
  const near = c.plane('near', {
    fog: 0x0e1026,
    fogK: 0.06,
    amb: 0x8a8cb0,
    ramp: [700, 1080, 0, 0.12],
    mottle: 0.14,
    mottleScale: 160,
    lit: 1,
    seed: 3,
    edge: [6, 0.04, 0.08, 0],
    rim: 0x5a5a88,
    rimK: 0.18,
    rimDir: [0.4, -0.9],
    rimW: 3,
    rimLights: 0.7,
    brush: [0.08, 30, 0.2, 5],
  });
  const nearBack = c.batch('near-back', { glow: MOUTH.inner, glowK: 0.45, swell: 0.045 }, near.view);
  const shelter = new Graphics();
  near.view.addChild(shelter);
  const nearRoots = c.batch(
    'near-roots',
    { glow: MOUTH.inner, glowK: 0.6, rim: 0xa8b8e0, rimK: 0.45, swell: 0.05 },
    near.view,
  );
  const nearGlows = new Container();
  nearGlows.blendMode = 'add';
  const nearPods = podLayers(c, near.view, 0.5, nearGlows);
  const lampG = new Graphics();

  // Shelter: x 370..790, roof at 596..616.
  const SX0 = 370;
  const SX1 = 790;
  const ROOF = 600;
  const metal = 0x1a1b2e;
  const metalLit = 0x3a3a58;
  /** The roof sags in the middle under the root on it. */
  const SAG = 18;
  const roofY = (x: number): number =>
    ROOF +
    SAG * Math.sin(Math.PI * Math.min(1, Math.max(0, (x - SX0 + 18) / (SX1 - SX0 + 36)))) ** 1.3 -
    (x - SX0) * 0.01;
  // Back glass panel (seen through): grimy low down, beaded, a faint reflection, a crack.
  shelter
    .rect(SX0 + 14, ROOF + 26, SX1 - SX0 - 120, GROUND - ROOF - 64)
    .fill({ color: 0x2a2c48, alpha: 0.28 });
  shelter.rect(SX0 + 14, GROUND - 160, SX1 - SX0 - 120, 122).fill(
    vgrad([
      [0, 0x3a3048, 0],
      [1, 0x3a3048, 0.55],
    ]),
  );
  for (let i = 0; i < 40; i++) {
    const x = SX0 + 14 + rng() * (SX1 - SX0 - 120);
    const h = 20 + rng() ** 2 * 90;
    shelter.poly([x, GROUND - 38, x + 3 + rng() * 8, GROUND - 38, x + 2, GROUND - 38 - h]).fill({
      color: rng() < 0.6 ? 0x24202e : 0x5a5068,
      alpha: 0.25,
    });
  }
  beads(rng, shelter, SX0 + 16, SX1 - 108, ROOF + 60, GROUND - 50, 160, 3.5, 0.2);
  for (let i = 0; i < 3; i++) {
    const x = SX0 + 60 + i * 90;
    shelter.poly([x, ROOF + 28, x + 30, ROOF + 28, x - 40, GROUND - 40, x - 70, GROUND - 40]).fill({
      color: 0x8a88b0,
      alpha: 0.05,
    });
  }
  {
    const pts: Pt[] = [[SX0 + 160, ROOF + 90]];
    for (let i = 0; i < 6; i++) pts.push([pts[i]![0] + 14 + rng() * 22, pts[i]![1] + (rng() - 0.3) * 30]);
    shelter.moveTo(...pts[0]!);
    for (const p of pts.slice(1)) shelter.lineTo(...p);
    shelter.stroke({ color: 0xb8b6d8, alpha: 0.25, width: 1.2 });
  }
  // Bench: slats sagging, paint gone to rust at the ends.
  {
    const bx0 = SX0 + 40;
    const bx1 = SX0 + 290;
    const seat: number[] = [];
    for (let k = 0; k <= 12; k++)
      seat.push(bx0 + ((bx1 - bx0) * k) / 12, 822 + 6 * Math.sin((Math.PI * k) / 12));
    for (let k = 12; k >= 0; k--)
      seat.push(bx0 + ((bx1 - bx0) * k) / 12, 836 + 6 * Math.sin((Math.PI * k) / 12));
    shelter.poly(seat).fill(metalLit);
    shelter.rect(SX0 + 56, 837, 6, GROUND - 837).fill(metal);
    shelter.rect(SX0 + 268, 837, 6, GROUND - 837).fill(metal);
    rust(rng, shelter, bx0 + 10, 828, 12, 5);
    rust(rng, shelter, bx1 - 14, 828, 14, 5);
  }
  // Under the bench, the same feed jar she finds at moth scale: on its side, its mouth to the left,
  // a red band on its label; and the leaf beside it.
  {
    const jx = SX0 + 150;
    const jy = GROUND - 11;
    shelter.roundRect(jx, jy - 10, 40, 20, 4).fill({ color: 0x2a4440, alpha: 0.9 });
    shelter.rect(jx + 14, jy - 10, 15, 20).fill({ color: 0x4a4458, alpha: 0.95 });
    shelter.rect(jx + 14, jy - 10, 15, 4).fill({ color: 0x8a3440, alpha: 0.9 });
    shelter.ellipse(jx, jy, 4, 10).fill(0x05060c);
    shelter.ellipse(jx, jy, 4, 10).stroke({ color: 0xa8c8c0, width: 1.2, alpha: 0.6 });
    shelter.rect(jx + 4, jy - 8, 32, 2).fill({ color: 0xf0c8d0, alpha: 0.5 });
    shelter
      .moveTo(jx - 56, jy + 9)
      .quadraticCurveTo(jx - 36, jy - 4, jx - 10, jy + 8)
      .quadraticCurveTo(jx - 32, jy + 13, jx - 56, jy + 9)
      .fill(0x7a5434);
  }
  // The ad lightbox at the right end: dead glass, but tissue has grown inside and glows.
  const AD = { x: SX1 - 106, y: ROOF + 40, w: 92, h: 200 };
  shelter.roundRect(AD.x - 6, AD.y - 6, AD.w + 12, AD.h + 12, 3).fill(metal);
  shelter.rect(AD.x, AD.y, AD.w, AD.h).fill(0x3a3446);
  // Folded tissue packed inside the dead lightbox, pressing on the glass and bulging out of its
  // broken foot: the mountain's own folds, at the scale of a poster.
  const adT = c.shader('ad-tissue', AD.x - 8, AD.y - 6, AD.w + 16, AD.h + 60, MOUNTAIN, near.view);
  const adLobes: [number, number, number, number][] = [
    [30, 40, 34, 44],
    [72, 70, 32, 50],
    [40, 120, 38, 40],
    [80, 150, 30, 36],
    [44, 190, 34, 30],
    [70, 222, 30, 26],
    [50, 246, 26, 18],
    [90, 30, 20, 30],
  ];
  for (const [i, l] of adLobes.entries()) adT.p(i, ...l);
  adT
    .p(8, 54, 130, 140, 0.03)
    .c(9, 0xc8b0ac)
    .c(10, 0x2a2230)
    .c(11, 0xf0c8b8)
    .c(12, 0x3a3046, 0.1)
    .p(13, 2000, 2, 3.2);
  nearGlows.addChild(glow(AD.x + AD.w / 2, AD.y + AD.h / 2, 150, 0xe6c2b6, 0.18));
  const adGlow = nearGlows.children[nearGlows.children.length - 1]!;
  // Frame: posts leaning a little, rust climbing from their feet; the roof slab sagging, dented,
  // its fascia streaked with rust; the stop's sign, its roundel faded to pink.
  const frame = new Graphics();
  for (const [px, lean] of [
    [SX0 + 4, 5],
    [SX1 - 16, -3],
  ] as const) {
    const top = roofY(px) + 10;
    frame.poly([px + lean, top, px + 12 + lean, top, px + 12, GROUND, px, GROUND]).fill(
      vgrad([
        [0, metalLit],
        [0.2, metal],
        [0.75, 0x14142a],
        [1, 0x3a2018],
      ]),
    );
    streaks(rng, frame, px + 1, px + 11, GROUND - 120, [20, 110], 6, 0.45);
    rust(rng, frame, px + 6, GROUND - 30 - rng() * 40, 6, 10);
  }
  const fascia: number[] = [];
  for (let x = SX0 - 18; x <= SX1 + 18; x += 12) fascia.push(x, roofY(x));
  for (let x = SX1 + 18; x >= SX0 - 18; x -= 12) fascia.push(x, roofY(x) + 18);
  frame.poly(fascia).fill(metal);
  const lip: number[] = [];
  for (let x = SX0 - 18; x <= SX1 + 18; x += 12) lip.push(x, roofY(x));
  for (let x = SX1 + 18; x >= SX0 - 18; x -= 12) lip.push(x, roofY(x) + 3);
  frame.poly(lip).fill(metalLit);
  for (let i = 0; i < 9; i++) {
    const x = SX0 - 10 + rng() * (SX1 - SX0 + 20);
    rust(rng, frame, x, roofY(x) + 9, 6 + rng() * 14, 3 + rng() * 3, 0.9);
  }
  for (let i = 0; i < 4; i++) {
    const x = SX0 + rng() * (SX1 - SX0);
    frame.poly(blob(rng, x, roofY(x) + 8, 10, 4, 0.4, 10).flat()).fill({ color: 0x08080f, alpha: 0.6 });
  }
  frame.poly([SX0 - 72, 640, SX0 - 64, 640, SX0 - 63, GROUND, SX0 - 71, GROUND]).fill(metal);
  streaks(rng, frame, SX0 - 71, SX0 - 64, GROUND - 90, [20, 80], 3, 0.4);
  frame.circle(SX0 - 68, 640, 20).fill(metal);
  frame.circle(SX0 - 68, 640, 16).fill(0x8a5a6a);
  frame.circle(SX0 - 68, 640, 11).fill(0xb8b0c0);
  frame.rect(SX0 - 82, 637, 28, 6).fill(0x4a4a6a);
  rust(rng, frame, SX0 - 60, 648, 6, 4);
  near.view.addChild(frame);

  // Root: a great one comes in from the upper left, runs over the roof, pours down both posts.
  const main = smoothPath(
    [
      [-60, 380],
      [120, 470],
      [260, 560],
      [380, 590],
      [560, 588],
      [720, 584],
      [800, 610],
      [812, 700],
      [800, 820],
      [812, GROUND + 6],
    ],
    14,
  );
  braid(
    rng,
    nearRoots,
    main,
    30,
    12,
    [MOUTH.boneMoon, MOUTH.boneShadow, 0xb4a6a4, MOUTH.boneMoon, 0x6a6070],
    0.7,
    6,
  );
  // Down the left post as a winding root.
  {
    const hx = helix(SX0 + 10, ROOF + 6, GROUND, 13, 3.2, 0.4);
    for (const s of hx.back)
      nearBack.strip(s, () => 5.5, { color: MOUTH.boneShadow, glow: 0.3, seed: rng() });
    for (const s of hx.front) nearRoots.strip(s, () => 7, { color: MOUTH.boneMoon, glow: 0.6, seed: rng() });
  }
  // Curtains of aerial root off the roof's front edge.
  curtain(rng, nearRoots, SX0 - 16, SX1 + 16, ROOF + 12, [6, 90], [3, 7], MOUTH.boneMoon, 0.6, [26, 70]);
  // The roots' foot: splayed over the pavement.
  spread(rng, nearRoots, 808, GROUND + 3, 7, [120, 380], [5, 10], MOUTH.boneMoon, 0.6);
  spread(rng, nearRoots, SX0 + 10, GROUND + 3, 5, [90, 260], [4, 7], MOUTH.boneMoon, 0.6);
  // The pavement: a mat of root over it.
  mat(rng, nearRoots, -40, VIEW_W + 40, GROUND + 4, 26, [3, 8], MOUTH.boneMoon, 8, 0.5);

  // A sleeper waits on the bench in its case, grown down from the roof.
  pod(rng, nearPods, { x: SX0 + 150, y: ROOF + 16, stalk: 104, len: 98, w: 30, lean: 4, glow: 1 });
  // Two more hang from the roof's edge outside.
  pod(rng, nearPods, { x: SX0 - 4, y: ROOF + 14, stalk: 40, len: 70, w: 21, lean: -6, glow: 0.8 });
  pod(rng, nearPods, { x: SX0 + 280, y: ROOF + 16, stalk: 22, len: 56, w: 17, lean: 3, glow: 0.7 });

  // The lamp post: pole and arm, wound with root; a sleeper hangs where its light was.
  const LX = 1490;
  const LTOP = 372;
  const LEAN = 10;
  lampG.poly([LX - 6 + LEAN, LTOP, LX + 6 + LEAN, LTOP, LX + 7, GROUND, LX - 7, GROUND]).fill(
    vgrad([
      [0, metalLit],
      [0.3, metal],
      [0.85, 0x14142a],
      [1, 0x2a1810],
    ]),
  );
  // The base: wider, a service door, bolts, a collar; paint flaking to rust.
  lampG.poly([LX - 14, GROUND - 120, LX + 14, GROUND - 120, LX + 16, GROUND, LX - 16, GROUND]).fill(
    vgrad([
      [0, 0x2a2a44],
      [0.6, 0x1a1a30],
      [1, 0x2a1810],
    ]),
  );
  lampG.rect(LX - 15, GROUND - 124, 30, 6).fill(metalLit);
  lampG.roundRect(LX - 8, GROUND - 100, 16, 46, 2).stroke({ color: 0x0a0a14, width: 2 });
  lampG.circle(LX, GROUND - 92, 2).fill(0x5a5a7a);
  for (let i = 0; i < 6; i++)
    rust(rng, lampG, LX - 10 + rng() * 20, GROUND - 20 - rng() * 220, 3 + rng() * 6, 3 + rng() * 8);
  streaks(rng, lampG, LX - 6, LX + 6, LTOP + 40, [40, 200], 5, 0.35);
  streaks(rng, lampG, LX - 13, LX + 13, GROUND - 118, [30, 100], 6, 0.4);
  for (let i = 0; i < 8; i++) {
    const y = LTOP + 60 + rng() * (GROUND - LTOP - 200);
    lampG
      .poly(blob(rng, LX + LEAN * (1 - (y - LTOP) / (GROUND - LTOP)) - 2 + rng() * 4, y, 4, 7, 0.4, 8).flat())
      .fill({
        color: 0x4a5a5c,
        alpha: 0.6,
      });
  }
  const arm = smoothPath(
    [
      [LX + LEAN, LTOP + 8],
      [LX + LEAN - 30, LTOP - 16],
      [LX + LEAN - 90, LTOP - 14],
      [LX - 132, LTOP + 6],
    ],
    12,
  );
  {
    const pts = arm.flat();
    lampG.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) lampG.lineTo(pts[i]!, pts[i + 1]!);
    lampG.stroke({ color: metal, width: 9, cap: 'round' });
  }
  lampG.poly([LX - 160, LTOP + 4, LX - 104, LTOP + 4, LX - 112, LTOP + 20, LX - 152, LTOP + 20]).fill(metal);
  const lampBack = c.batch('lamp-back', { glow: MOUTH.inner, glowK: 0.4, swell: 0.045 }, near.view);
  near.view.addChild(lampG);
  const lampRoots = c.batch(
    'lamp-roots',
    { glow: MOUTH.inner, glowK: 0.6, rim: 0xa8b8e0, rimK: 0.45, swell: 0.05 },
    near.view,
  );
  {
    const hx = helix(LX, LTOP + 30, GROUND, 15, 2.3, 1.1);
    for (const s of hx.back) lampBack.strip(s, () => 6, { color: MOUTH.boneShadow, glow: 0.3, seed: rng() });
    for (const s of hx.front) lampRoots.strip(s, () => 8, { color: MOUTH.boneMoon, glow: 0.6, seed: rng() });
    const hx2 = helix(LX, LTOP + 220, GROUND, 12, 1.4, 2.9);
    for (const dx of [-5, 6]) {
      const pts = wander(rng, {
        x: LX + dx,
        y: GROUND,
        ang: -Math.PI / 2,
        len: 260 + rng() * 200,
        step: 8,
        curl: 0.04,
        toward: 0.3,
        towardAng: -Math.PI / 2,
      });
      for (const p of pts) p[0] = LX + dx + (p[0] - LX - dx) * 0.15;
      lampRoots.strip(pts, taper(5, 1.5, 0.3, rng()), { color: MOUTH.boneMoon, glow: 0.5, seed: rng() });
    }
    for (const s of hx2.back) lampBack.strip(s, () => 4, { color: MOUTH.boneShadow, glow: 0.3, seed: rng() });
    for (const s of hx2.front) lampRoots.strip(s, () => 5, { color: MOUTH.boneMoon, glow: 0.6, seed: rng() });
  }
  // Root over the arm and bunched on the head like a closed hand.
  lampRoots.strip(
    arm.map(([x, y]) => [x, y - 3] as Pt),
    taper(9, 7, 0.4, 0.3),
    {
      color: MOUTH.boneMoon,
      glow: 0.6,
      seed: 0.2,
    },
  );
  for (let i = 0; i < 5; i++) {
    const pts = wander(rng, {
      x: LX - 132 + (rng() - 0.5) * 30,
      y: LTOP,
      ang: Math.PI / 2 + (rng() - 0.5) * 2.4,
      len: 30 + rng() * 40,
      step: 5,
      curl: 0.3,
    });
    lampRoots.strip(pts, taper(8, 2, 0.3, rng()), { color: MOUTH.boneMoon, glow: 0.7, seed: rng() });
  }
  curtain(rng, lampRoots, LX - 160, LX - 100, LTOP + 18, [20, 70], [2, 4], MOUTH.boneMoon, 0.6, [10, 18]);
  spread(rng, lampRoots, LX, GROUND + 3, 6, [120, 320], [5, 8], MOUTH.boneMoon, 0.6);
  pod(rng, nearPods, { x: LX - 132, y: LTOP + 18, stalk: 18, len: 62, w: 19, lean: 2, glow: 0.55 });

  // The ground she stands on: the pavement slab, its kerb, and the near half of the road below.
  const ground = new Graphics();
  ground.rect(-20, GROUND - 3, VIEW_W + 40, 22).fill(
    vgrad([
      [0, 0x2e2c48],
      [0.3, 0x1c1b32],
      [1, 0x121224],
    ]),
  );
  for (let x = -20; x < VIEW_W; x += 96 + rng() * 20)
    ground.rect(x, GROUND - 1, 2, 18).fill({ color: 0x07070f, alpha: 0.6 });
  ground.rect(-20, GROUND + 19, VIEW_W + 40, 8).fill({ color: 0x3a3854, alpha: 0.5 });
  ground.rect(-20, GROUND + 27, VIEW_W + 40, VIEW_H - GROUND).fill(
    vgrad([
      [0, 0x0c0c1a],
      [0.3, 0x07070f],
      [1, 0x030307],
    ]),
  );
  // Root crossing the near road toward us, in perspective: thin at the kerb, fat at the frame's foot.
  for (let i = 0; i < 18; i++) {
    const x0 = -100 + rng() * (VIEW_W + 200);
    if (Math.abs(x0 - 1040) < 120) continue;
    const x1 = x0 + (x0 - 1100) * (0.4 + rng() * 0.8);
    const ph = rng() * 6;
    const pts: Pt[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      pts.push([
        x0 + (x1 - x0) * t * t + Math.sin(t * 7 + ph) * 16 * t,
        GROUND + 24 + (VIEW_H + 40 - GROUND - 24) * t * t,
      ]);
    }
    const w = 0.5 + rng();
    nearRoots.strip(pts, (t) => (1 + t * t * 14 * w) * (0.8 + 0.3 * Math.sin(t * 11 + ph)), {
      color: rng() < 0.5 ? MOUTH.boneShadow : 0x4a4258,
      glow: 0.3,
      seed: rng(),
    });
  }
  near.view.addChildAt(ground, 0);

  nearBack.done();
  nearRoots.done();
  lampBack.done();
  lampRoots.done();
  donePods(nearPods);
  near.view.addChild(nearGlows);
  for (const g of nearGlows.children) {
    g.alpha *= 2;
    (g as ReturnType<typeof glow>).tint = 0xf8b8a8;
  }

  // --- Umber, on the pavement, looking toward the mountain.
  const heroLayer = new Container();
  R.addChild(heroLayer);
  const hero = c.addHero({ x: 1040, y: GROUND, scale: 0.92, pose: 'stand', facing: 1 }, heroLayer);
  const her = new Container();
  her.blendMode = 'add';
  R.addChild(her);
  const herPool = glow(1040, GROUND, 120, WARM.gold, 0.16);
  const herHalo = glow(1040, GROUND - 60, 90, WARM.key, 0.12);
  her.addChild(herPool, herHalo);

  // Moths at the cases' glow: the shelter's sleeper, the lamp's, the car's window.
  moths(c, rng, R, {
    x: SX0 + 150,
    y: 770,
    rx: 90,
    ry: 60,
    count: 4,
    size: [8, 13],
    color: 0xd8c8d8,
    alpha: 0.75,
  });
  moths(c, rng, R, {
    x: LX - 132,
    y: LTOP + 90,
    rx: 60,
    ry: 50,
    count: 3,
    size: [6, 10],
    color: 0xd8c8d8,
    alpha: 0.7,
  });
  moths(c, rng, R, { x: 1290, y: 760, rx: 70, ry: 34, count: 3, size: [6, 9], color: 0xc8b8d0, alpha: 0.6 });
  // Pink pools on the pavement under the shelter's case and the lamp's.
  const pools = new Container();
  pools.blendMode = 'add';
  R.addChild(pools);
  pools.addChild(
    glow(SX0 + 150, GROUND + 2, 160, 0xd87898, 0.12),
    glow(LX - 132, GROUND + 2, 110, 0xd87898, 0.08),
  );

  // --- Steam off the root, and spores in the air.
  const steam = c.shader('steam', 0, 0, VIEW_W, VIEW_H, STEAM, R);
  steam
    .c(0, 0x6a6080, 0.22)
    .p(1, GROUND + 4, 220, 16, 140)
    .p(2, -40, VIEW_W + 40, 80);
  c.mote(
    rng,
    {
      count: 140,
      x: 0,
      y: 120,
      w: VIEW_W,
      h: 860,
      vx: 3,
      vy: -6,
      wobble: 14,
      size: [3, 9],
      alpha: [0.08, 0.32],
      color: [0xd8ccd8, 0xe8d0c8, 0xb8bcd0],
      twinkle: 0.4,
    },
    R,
  );

  // --- Foreground: out-of-focus root and a hanging case at the frame's edges.
  // Wet road: the cases' breath and her light lie on it in soft streaks.
  const wet = c.shader('wet', 0, 0, VIEW_W, VIEW_H, REFLECT, R);
  wet
    .p(0, 1040, 22, 0.35, 120)
    .p(1, SX0 + 152, 40, 0.14, 120)
    .p(2, AD.x + 46, 40, 0.12, 110)
    .p(3, LX - 130, 30, 0.12, 120)
    .p(4, 1210, 300, 0.06, 140)
    .p(5, 1290, 50, 0.14, 90)
    .c(11, 0xe890b0)
    .c(6, WARM.gold)
    .c(7, 0xd8b8c0)
    .c(8, 0xd8b8c0)
    .c(9, 0xd8b8c0)
    .c(10, 0x8a6a80)
    .p(12, GROUND + 30, 1, 0.45)
    .c(13, 0x24263e);
  wet.mesh.blendMode = 'add';

  const fg = c.plane('fg', {
    fog: 0x04040c,
    fogK: 0.25,
    mottle: 0.1,
    blur: 12,
    lit: 0.3,
    seed: 4,
    rimLights: 0.4,
    rimW: 6,
  });
  const fgRoots = c.batch(
    'fg-roots',
    { glow: MOUTH.inner, glowK: 0.25, rim: 0x8090c0, rimK: 0.4, swell: 0.05 },
    fg.view,
  );
  const fgG = new Graphics();
  fg.view.addChildAt(fgG, 0);
  for (const [x, y, rx, ry] of [
    [120, 1090, 420, 120],
    [-40, 980, 150, 170],
    [1820, 1080, 320, 150],
    [1990, 930, 130, 220],
  ] as const)
    fgG.poly(blob(rng, x, y, rx, ry, 0.2, 40).flat()).fill(0x05050b);
  for (let i = 0; i < 7; i++) {
    const pts = wander(rng, {
      x: -60,
      y: 930 + rng() * 120,
      ang: -0.15 + rng() * 0.2,
      len: 300 + rng() * 400,
      step: 10,
      curl: 0.12,
    });
    fgRoots.strip(pts, taper(30 + rng() * 16, 4, 0.3, rng()), { color: 0x3a3440, glow: 0.3, seed: rng() });
  }
  for (let i = 0; i < 5; i++) {
    const pts = wander(rng, {
      x: 1990,
      y: 940 + rng() * 120,
      ang: Math.PI + 0.25 - rng() * 0.3,
      len: 260 + rng() * 300,
      step: 10,
      curl: 0.12,
    });
    fgRoots.strip(pts, taper(28 + rng() * 12, 4, 0.3, rng()), { color: 0x3a3440, glow: 0.3, seed: rng() });
  }
  // A great root hanging into the top right corner with a case on it, dark and soft.
  const fgPods = podLayers(c, fg.view, 0.25, null);
  const hang = smoothPath(
    [
      [1700, -40],
      [1790, 60],
      [1880, 90],
      [1990, 70],
    ],
    14,
  );
  fgRoots.strip(hang, taper(30, 22), { color: 0x2a2636, glow: 0.2, seed: 0.5 });
  pod(rng, fgPods, {
    x: 1800,
    y: 70,
    stalk: 60,
    len: 170,
    w: 52,
    color: 0x3a3444,
    sleeperColor: 0x0c0a14,
    sleeperAlpha: 0.7,
    glow: 0.35,
  });
  fgRoots.done();
  donePods(fgPods);

  // --- Lights: her lanterns, the cases, the lightbox, the mountain's core.
  const L = c.light({ x: 0, y: 0, radius: 300, color: WARM.gold, intensity: 0.9, scatter: 0.5 });
  const podLights = [
    c.light({ x: SX0 + 152, y: 770, radius: 200, color: 0xe8c4b8, intensity: 0.1, scatter: 0.15 }),
    c.light({ x: LX - 130, y: LTOP + 60, radius: 200, color: 0xe8c4b8, intensity: 0.1, scatter: 0.15 }),
    c.light({ x: AD.x + 46, y: AD.y + 100, radius: 230, color: 0xe8c4b8, intensity: 0.1, scatter: 0.15 }),
  ];
  c.light({ x: 1210, y: 630, radius: 650, color: 0xb89aa8, intensity: 0.35, scatter: 0.4 });
  c.on((t, b) => {
    for (const f of breathers) f(b);
    L.x = hero.light.x;
    L.y = hero.light.y;
    L.intensity = 0.85 * hero.light.k;
    herHalo.position.set(hero.light.x, hero.light.y);
    herHalo.alpha = 0.16 * hero.light.k;
    for (const p of podLights) p.intensity = 0.1 + 0.07 * b;
    adGlow.alpha = 0.08 + 0.05 * b;
    herPool.alpha = 0.14 + 0.02 * Math.sin(t * 3.1);
  });
}

const frame: WorldFrame = {
  key: 1,
  id: 'street',
  title: 'The kept street',
  tests:
    'Can a human street read as swallowed but cared for? Pale warm root, sleepers on stalks, the folded mountain on the horizon, all breathing on one rhythm; Umber the one warm thing.',
  build,
};
export default frame;
