// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 1. The kept street. A human street under pale warm root: a bus shelter and a lamp post wrapped
 * in it, sleepers in seed-pod cases on stalks, and on the far horizon the mountain of folded tissue,
 * faintly lit from its core. Everything the Mouth owns breathes on one slow shared rhythm. Umber,
 * small and warm, is the only other light.
 */
import { Container, Graphics } from 'pixi.js';
import { prng } from '../../render/scene/lib/look';
import { FOG, MOUNTAIN, REFLECT, SKY, STEAM } from '../lib/bodies';
import type { Composer } from '../lib/compose';
import { braid, curtain, donePods, MOUTH, mat, pod, podLayers, spread, WARM } from '../lib/kit';
import { VIEW_H, VIEW_W } from '../lib/layer';
import { blob, glow, ridge, vgrad } from '../lib/paint';
import { drape, grip, ruin, windowGlows } from '../lib/ruin';
import { helix, type Pt, smoothPath, taper, wander } from '../lib/tissue';
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
    saturation: 1.05,
    contrast: 1.08,
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
    .c(2, 0x151a2e)
    .p(3, HORIZON, 0.4)
    .p(4, 1210, 600, 400)
    .c(5, 0x2c2230)
    .c(6, 0x5a3e46)
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
    fog: 0x30344e,
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
    .c(0, 0x2c3150, 0.5)
    .p(1, 900, 120, 0.006, 0)
    .p(2, HORIZON - 220, HORIZON - 30, HORIZON + 120, HORIZON + 260)
    .p(3, 0.25, 0.85, 0.3, 0.3)
    .p(5, 1210, 640, 320, 0.9)
    .c(6, 0x8a6670);

  // --- The far side of the street: a row of small shops and houses, gables and flat roofs, all
  // swallowed; the queue of cases waits on its pavement.
  const row = c.plane('row', {
    fog: 0x22243e,
    fogK: 0.42,
    ramp: [560, 800, -0.05, 0.18],
    amb: 0x9098c0,
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
      glow: 0.45 + rng() * 0.4,
    });
  }
  donePods(midPods);
  midRoots.done();
  mid.view.addChild(midGlows);
  const midWg = windowGlows(rng, midG, midLit, POD_GLOW, 0.24);
  mid.view.addChild(midWg.view);
  breathers.push(midWg.update);

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
  // Back glass panel (seen through) with a faint reflection.
  shelter
    .rect(SX0 + 14, ROOF + 22, SX1 - SX0 - 120, GROUND - ROOF - 60)
    .fill({ color: 0x2a2c48, alpha: 0.28 });
  for (let i = 0; i < 3; i++) {
    const x = SX0 + 60 + i * 90;
    shelter.poly([x, ROOF + 24, x + 30, ROOF + 24, x - 40, GROUND - 40, x - 70, GROUND - 40]).fill({
      color: 0x8a88b0,
      alpha: 0.05,
    });
  }
  // A crack across the glass.
  {
    const cr = new Graphics();
    const pts: Pt[] = [[SX0 + 160, ROOF + 90]];
    for (let i = 0; i < 6; i++) pts.push([pts[i]![0] + 14 + rng() * 22, pts[i]![1] + (rng() - 0.3) * 30]);
    cr.moveTo(...pts[0]!);
    for (const p of pts.slice(1)) cr.lineTo(...p);
    cr.stroke({ color: 0xb8b6d8, alpha: 0.25, width: 1.2 });
    shelter.addChild(cr);
  }
  // Bench.
  shelter.rect(SX0 + 40, 822, 250, 9).fill(metalLit);
  shelter.rect(SX0 + 40, 831, 250, 6).fill(metal);
  shelter.rect(SX0 + 56, 837, 6, GROUND - 837).fill(metal);
  shelter.rect(SX0 + 268, 837, 6, GROUND - 837).fill(metal);
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
  // Frame: posts, roof slab, ad frame front edge.
  const frame = new Graphics();
  frame.rect(SX0 + 4, ROOF + 10, 12, GROUND - ROOF - 10).fill(
    vgrad([
      [0, metalLit],
      [0.2, metal],
      [1, 0x101020],
    ]),
  );
  frame.rect(SX1 - 16, ROOF + 10, 12, GROUND - ROOF - 10).fill(
    vgrad([
      [0, metalLit],
      [0.2, metal],
      [1, 0x101020],
    ]),
  );
  frame.poly([SX0 - 18, ROOF, SX1 + 18, ROOF - 4, SX1 + 18, ROOF + 14, SX0 - 18, ROOF + 18]).fill(metal);
  frame.poly([SX0 - 18, ROOF, SX1 + 18, ROOF - 4, SX1 + 18, ROOF - 1, SX0 - 18, ROOF + 3]).fill(metalLit);
  // The stop's sign on its pole, left of the shelter.
  frame.rect(SX0 - 70, 640, 5, GROUND - 640).fill(metal);
  frame.circle(SX0 - 67.5, 640, 20).fill(metal);
  frame.circle(SX0 - 67.5, 640, 15).fill(0x2c2c48);
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
  lampG.rect(LX - 6, LTOP, 12, GROUND - LTOP).fill(
    vgrad([
      [0, metalLit],
      [0.3, metal],
      [1, 0x101020],
    ]),
  );
  lampG.rect(LX - 10, GROUND - 40, 20, 40).fill(metal);
  const arm = smoothPath(
    [
      [LX, LTOP + 8],
      [LX - 30, LTOP - 18],
      [LX - 90, LTOP - 22],
      [LX - 132, LTOP - 8],
    ],
    12,
  );
  {
    const pts = arm.flat();
    lampG.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) lampG.lineTo(pts[i]!, pts[i + 1]!);
    lampG.stroke({ color: metal, width: 9, cap: 'round' });
  }
  lampG.poly([LX - 160, LTOP - 10, LX - 104, LTOP - 10, LX - 112, LTOP + 6, LX - 152, LTOP + 6]).fill(metal);
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
      y: LTOP - 14,
      ang: Math.PI / 2 + (rng() - 0.5) * 2.4,
      len: 30 + rng() * 40,
      step: 5,
      curl: 0.3,
    });
    lampRoots.strip(pts, taper(8, 2, 0.3, rng()), { color: MOUTH.boneMoon, glow: 0.7, seed: rng() });
  }
  curtain(rng, lampRoots, LX - 160, LX - 100, LTOP + 4, [20, 70], [2, 4], MOUTH.boneMoon, 0.6, [10, 18]);
  spread(rng, lampRoots, LX, GROUND + 3, 6, [120, 320], [5, 8], MOUTH.boneMoon, 0.6);
  pod(rng, nearPods, { x: LX - 132, y: LTOP + 4, stalk: 18, len: 62, w: 19, lean: 2, glow: 0.55 });

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
