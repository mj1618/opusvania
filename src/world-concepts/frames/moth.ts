// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 5. The kept street at moth scale. The same bus stop as frame 1, seen from Umber's height: the
 * pavement is a plain that runs off to a horizon, the bench a vast ledge overhead on its iron pillar,
 * the case on it as big as a building and breathing; a dropped feed jar lies on its side, its mouth
 * a cave; root crosses the plain like rivers and pours over the kerb, which is a cliff with the road
 * lost in fog far below. Beyond the shelter's glass, the street, and the mountain far off. Umber,
 * small and warm, at the cave's mouth.
 */
import { Container, Graphics } from 'pixi.js';
import { prng } from '../../render/scene/lib/look';
import { CASE, FOG, MOUNTAIN, SKY, STEAM } from '../lib/bodies';
import type { Composer } from '../lib/compose';
import { braid, MOUTH, mixHex, WARM } from '../lib/kit';
import { VIEW_H, VIEW_W } from '../lib/layer';
import { blob, glow, hgrad, vgrad } from '../lib/paint';
import { ruin, windowGlows } from '../lib/ruin';
import { helix, type Pt, smoothPath, taper } from '../lib/tissue';
import type { WorldFrame } from '../types';

/** The plain: far edge (against the glass) and where Umber stands. */
const FAR = 770;
const STAND = 880;
/** The kerb's edge: x at screen y (it runs toward us and a little right). */
const kerbX = (y: number): number => 1500 + (y - FAR) * 0.42;
const HORIZON = 600;
const POD_GLOW = 0xd8b8c0;
/** The jar, lying on its side: mouth (left) ellipse centre, body to the right. */
const JAR = { mx: 640, my: 730, ry: 146, rx: 42, len: 400, base: STAND - 4 };
/** Umber's feet. */
const HX = 560;

function build(c: Composer): void {
  const rng = prng(5507);
  const R = c.root;
  c.grade = {
    shadow: 0x0a0a20,
    shadowK: 0.035,
    deep: 0x020310,
    deepK: 0.8,
    saturation: 0.95,
    contrast: 1.05,
    grain: 0.03,
    vignette: 0.3,
    vignetteSoft: 0.55,
    bloom: [0.55, 0.7, 0.65],
  };
  const breathers: ((b: number) => void)[] = [];

  // --- Sky, the street beyond the shelter, the mountain far off: all small, through the gap at right.
  const sky = c.shader('sky', 0, 0, VIEW_W, VIEW_H, SKY, R);
  sky
    .c(0, 0x020308)
    .c(1, 0x080b1c)
    .c(2, 0x1c2038)
    .p(3, HORIZON, 0.5)
    .p(4, 1640, HORIZON, 300)
    .c(5, 0x2c2232)
    .c(6, 0x5a3e48)
    .c(7, 0x50404e, 0.5);
  const mtn = c.shader('mountain', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const lobes: [number, number, number, number][] = [
    [1660, 500, 110, 96],
    [1560, 548, 90, 56],
    [1770, 540, 100, 64],
    [1620, 440, 56, 50],
    [1700, 450, 54, 46],
  ];
  for (const [i, l] of lobes.entries()) mtn.p(i, ...l);
  mtn
    .p(8, 1660, HORIZON, 170, 0.008)
    .c(9, 0xb8a49e)
    .c(10, 0x2a2638)
    .c(11, 0xe8b8a8)
    .c(12, 0x2c2e48, 0.4)
    .p(13, HORIZON + 6, 3, 1.6);
  const core = new Container();
  core.blendMode = 'add';
  R.addChild(core);
  const coreG = glow(1660, HORIZON - 6, 50, 0xffd8c8, 0.4);
  core.addChild(glow(1660, HORIZON - 20, 220, 0xa07080, 0.14), coreG);

  // The far side of the street: tiny houses at the horizon, under haze.
  const far = c.plane('far', {
    fog: 0x2c3050,
    fogK: 0.6,
    ramp: [500, HORIZON, -0.05, 0.15],
    mottle: 0.08,
    blur: 1.6,
    lit: 0.3,
    seed: 1,
    edge: [6, 0.2, 0, 0],
  });
  const farG = new Graphics();
  far.view.addChild(farG);
  const farLit: { x: number; y: number; w: number; h: number }[] = [];
  for (let x = 1340; x < VIEW_W + 20; ) {
    const w = 30 + rng() * 50;
    const r = ruin(rng, farG, {
      x,
      w,
      top: HORIZON - 30 - rng() * 60,
      bottom: HORIZON + 6,
      color: 0x181a32,
      sky: 0x3a3c5c,
      lean: (rng() - 0.5) * 8,
      peak: rng() < 0.4 ? 10 : 0,
      breaks: [Math.floor(rng() * 2), 14],
      storey: 14,
      cols: Math.max(2, Math.round(w / 14)),
      win: [4, 5],
      lit: 0.2,
      bricked: 0.2,
      broken: 0.1,
      weather: 0.2,
    });
    farLit.push(...r.lit);
    x += w + rng() * 10;
  }
  const farWg = windowGlows(rng, farG, farLit, POD_GLOW, 0.4);
  far.view.addChild(farWg.view);
  breathers.push(farWg.update);

  const haze = c.shader('haze', 0, 0, VIEW_W, VIEW_H, FOG, R);
  haze
    .c(0, 0x2c3150, 0.55)
    .p(1, 700, 90, 0.006, 0)
    .p(2, HORIZON - 160, HORIZON - 20, HORIZON + 60, HORIZON + 200)
    .p(3, 0.25, 0.85, 0.3, 0.35)
    .p(5, 1660, HORIZON, 260, 0.9)
    .c(6, 0x8a6670);

  // --- The shelter's glass: a wall of pale haze behind the bench, its steel edge at right, a crack
  // as long as a river. Through it the street is only a blur.
  const wall = c.plane('glass', {
    fog: 0x262a46,
    fogK: 0.2,
    ramp: [0, FAR, 0.1, -0.05],
    mottle: 0.1,
    blur: 2,
    lit: 0.6,
    seed: 6,
    brush: [0.08, 120, 1.4, 10],
  });
  const glassG = new Graphics();
  wall.view.addChild(glassG);
  glassG.rect(-20, -20, 1380, FAR + 30).fill(
    vgrad([
      [0, 0x1a1c34, 0.85],
      [0.6, 0x2a2c48, 0.8],
      [1, 0x343456, 0.85],
    ]),
  );
  // Through the glass, the street beyond is only blurred lights and a breathing pink bloom where the
  // case's glow is mirrored.
  for (let i = 0; i < 14; i++) {
    const x = 60 + rng() * 1240;
    const y = 380 + rng() * 300;
    glassG
      .circle(x, y, 10 + rng() * 26)
      .fill({ color: rng() < 0.5 ? 0x8a7a98 : 0x5a6488, alpha: 0.12 + rng() * 0.12 });
  }
  glassG.ellipse(560, 160, 420, 260).fill({ color: 0x8a6a80, alpha: 0.12 });
  // Condensation running down.
  for (let i = 0; i < 40; i++) {
    const x = rng() * 1340;
    const y = rng() * 500;
    glassG.rect(x, y, 1.5, 30 + rng() * 140).fill({ color: 0xb8b8d8, alpha: 0.05 + rng() * 0.06 });
  }
  // Reflections: long slanted sheens.
  for (let i = 0; i < 4; i++) {
    const x = 120 + i * 300 + rng() * 80;
    glassG.poly([x, -20, x + 60, -20, x - 160, FAR, x - 220, FAR]).fill({ color: 0x8a88b0, alpha: 0.05 });
  }
  // The steel post at the glass's edge.
  glassG.rect(1340, -20, 46, FAR + 30).fill(
    hgrad([
      [0, 0x1a1a2c],
      [0.3, 0x3a3a58],
      [1, 0x101020],
    ]),
  );
  // The crack.
  {
    let x = 200;
    let y = 120;
    glassG.moveTo(x, y);
    for (let i = 0; i < 14; i++) {
      x += 40 + rng() * 60;
      y += (rng() - 0.35) * 70;
      glassG.lineTo(x, y);
    }
    glassG.stroke({ color: 0xc8c6e8, width: 2, alpha: 0.3 });
  }

  // --- The case: its own plane, so its inner light is not dimmed with the bench's steel.
  const casePl = c.plane('case', {
    fog: 0x1a1c34,
    fogK: 0.1,
    mottle: 0.06,
    lit: 0.3,
    seed: 7,
    edge: [10, 0.1, 0, 0],
  });
  // --- The bench: a vast ledge overhead on an iron pillar, the case resting on it like a building.
  const bench = c.plane('bench', {
    fog: 0x14162c,
    fogK: 0.22,
    ramp: [200, 800, 0, 0.12],
    amb: 0x9aa0c8,
    mottle: 0.16,
    mottleScale: 200,
    lit: 0.9,
    seed: 2,
    edge: [12, 0.1, 0.1, 0],
    rim: 0x6a6a98,
    rimK: 0.3,
    rimDir: [0.5, -0.86],
    rimW: 5,
    rimLights: 0.7,
    brush: [0.12, 70, 0.0, 8],
    paint: 3,
  });
  const benchG = new Graphics();
  bench.view.addChild(benchG);
  const benchRoots = c.batch(
    'bench-roots',
    { glow: MOUTH.inner, glowK: 0.55, rim: 0xa8b8e0, rimK: 0.35, swell: 0.04, sss: POD_GLOW, sssK: 0.16 },
    bench.view,
  );
  // The case, resting on the seat like a building on a plateau: the sleeper inside a curled
  // shadow, the membrane lit from within, breathing.
  const caseC: Pt = [470, 90];
  const caseS = c.shader('case', 0, -300, 820, 640, CASE, casePl.view);
  {
    const o = 300; // plane y origin offset: plane px = screen px + 300 in y
    caseS
      .p(0, 470, 40 + o, 300, 282)
      .p(1, 3.4, 0, 0, 0.012)
      .p(2, 480, 110 + o, 104, 150)
      .p(3, 392, -24 + o, 62, 66)
      .p(4, 380, 216 + o, 126, 58)
      .p(5, 318, 276 + o, 56, 44)
      .p(6, 430, 120 + o, 96, 30)
      .p(7, 540, 250 + o, 90, 50)
      .p(8, 0.25, 0.3, -0.2, 0.1)
      .p(9, 0.7, 0)
      .p(10, 520, -60 + o, 400, 1.15)
      .c(11, 0xf0c8c0)
      .c(12, 0xd0c0c4)
      .c(13, 0x6a5060, 0.7)
      .c(14, 0xc8d0f0, 0.25)
      .p(15, 12, 0.8, 1, 0);
  }
  const SEAT = 330;
  // Seat slab: the front lip of steel, the underside in shadow with slat gaps letting the case's light through.
  const SX1 = 1330;
  // The lip: a steel edge as thick as she is tall, chipped paint, bolts the size of boulders.
  benchG.poly([-40, SEAT - 26, SX1, SEAT - 34, SX1 + 10, SEAT + 12, -40, SEAT + 20]).fill(
    vgrad([
      [0, 0x5a5878],
      [0.12, 0x34344e],
      [0.5, 0x1e1e32],
      [1, 0x121224],
    ]),
  );
  for (let i = 0; i < 26; i++) {
    const x = rng() * SX1;
    const w = 6 + rng() * 40;
    benchG
      .poly(blob(rng, x, SEAT - 10 + rng() * 22, w, 3 + rng() * 5, 0.4, 10).flat())
      .fill({ color: rng() < 0.5 ? 0x0a0a14 : 0x4a4660, alpha: 0.6 });
  }
  for (let x = 90; x < SX1; x += 220) {
    benchG.circle(x, SEAT - 4, 9).fill(0x2a2a40);
    benchG.circle(x - 2, SEAT - 6, 5).fill(0x4a4866);
  }
  // The underside, deep in shadow, the slat gaps letting the case's light through.
  benchG.poly([-40, SEAT + 20, SX1 + 10, SEAT + 12, SX1 - 10, SEAT + 96, -40, SEAT + 110]).fill(
    vgrad([
      [0, 0x0c0c18],
      [1, 0x07070e],
    ]),
  );
  // Two slat gaps overhead let the case's light down in soft blades.
  for (const x of [380, 640])
    benchG.poly([x, SEAT + 22, x + 14, SEAT + 22, x + 30, SEAT + 104, x - 10, SEAT + 108]).fill({
      color: 0xb89aa8,
      alpha: 0.16,
    });
  // The pillar: a square iron leg, scuffed paint, a foot plate bolted to the plain.
  const LEG = 1200;
  benchG.poly([LEG - 34, SEAT + 90, LEG + 34, SEAT + 86, LEG + 38, FAR + 14, LEG - 38, FAR + 18]).fill(
    hgrad([
      [0, 0x0c0c16],
      [0.55, 0x1c1c2c],
      [0.8, 0x2e2c44],
      [1, 0x14141f],
    ]),
  );
  benchG.poly([LEG - 70, FAR + 10, LEG + 70, FAR + 6, LEG + 80, FAR + 26, LEG - 80, FAR + 30]).fill(0x18182a);
  for (const bx of [LEG - 54, LEG + 54]) benchG.circle(bx, FAR + 14, 6).fill(0x2a2a40);
  // Root climbs the pillar and spreads under the seat.
  {
    const hx = helix(LEG, SEAT + 60, FAR + 16, 40, 2.4, 0.6);
    for (const s of hx.front) benchRoots.strip(s, () => 9, { color: MOUTH.boneMoon, glow: 0.5, seed: rng() });
    braid(
      rng,
      benchRoots,
      smoothPath(
        [
          [LEG + 10, FAR + 20],
          [LEG + 24, 600],
          [LEG + 6, 470],
          [LEG - 40, SEAT + 70],
          [LEG - 360, SEAT + 64],
          [LEG - 700, SEAT + 76],
        ],
        16,
      ),
      26,
      8,
      [MOUTH.boneMoon, MOUTH.boneShadow, 0xb4a6a4],
      0.5,
      5,
    );
  }
  benchRoots.done();

  // --- Mist low on the plain, and the drop beyond the kerb full of fog.
  const mist = c.shader('mist', 0, 0, VIEW_W, VIEW_H, FOG, R);
  mist
    .c(0, 0x262a46, 0.5)
    .p(1, 600, 60, 0.01, 0)
    .p(2, FAR - 60, FAR, FAR + 40, FAR + 120)
    .p(3, 0.3, 0.8, 0.4, 0.3)
    .p(5, caseC[0], FAR, 400, 0.5)
    .c(6, 0x8a6a78);

  // --- The drop beyond the kerb: fog all the way down, the road lost under it.
  const drop = c.shader('drop', 0, 0, VIEW_W, VIEW_H, FOG, R);
  drop
    .c(0, 0x5e5e80, 0.95)
    .p(1, 500, 140, 0.006, -0.01)
    .p(2, FAR - 40, FAR + 60, VIEW_H + 100, VIEW_H + 200)
    .p(3, 0.25, 0.85, 0.2, 0.55)
    .p(4, 1500, 2400, 140)
    .p(5, 1700, FAR + 100, 300, 0.4)
    .c(6, 0x4a3a52);
  const dropGlow = new Container();
  dropGlow.blendMode = 'add';
  R.addChild(dropGlow);
  dropGlow.addChild(glow(1780, 1020, 420, 0x6a6088, 0.3));
  // --- The plain: the pavement as land. Slab joints are canyons, grit is boulders, root runs across
  // it in rivers and pours over the kerb's edge.
  const plain = c.plane('plain', {
    fog: 0x0e1026,
    fogK: 0.05,
    ramp: [FAR, VIEW_H, 0.35, 0],
    mottle: 0.2,
    mottleScale: 140,
    lit: 1.1,
    seed: 3,
    edge: [6, 0.04, 0.08, 0],
    rim: 0x5a5a88,
    rimK: 0.2,
    rimDir: [0.3, -1],
    rimW: 3,
    rimLights: 0.9,
    brush: [0.14, 40, 0.05, 5],
  });
  const ground = new Graphics();
  plain.view.addChild(ground);
  // The pavement surface, receding: lighter at its far edge (haze), dark toward us.
  const kerbPoly: number[] = [-20, FAR];
  for (let y = FAR; y <= VIEW_H + 20; y += 20) kerbPoly.push(kerbX(y) + (rng() - 0.5) * 8, y);
  kerbPoly.push(-20, VIEW_H + 20);
  ground.poly(kerbPoly).fill(
    vgrad([
      [0, 0x2e2c48],
      [0.15, 0x201f36],
      [0.5, 0x121224],
      [1, 0x06060e],
    ]),
  );
  // The joint between two slabs: a canyon running toward us.
  ground.poly([380, FAR, 396, FAR, 250, VIEW_H + 20, 170, VIEW_H + 20]).fill(
    vgrad([
      [0, 0x0a0a16],
      [1, 0x020205],
    ]),
  );
  // Grit: boulders, bigger nearer.
  for (let i = 0; i < 120; i++) {
    const y = FAR + (VIEW_H - FAR) * rng() ** 1.6;
    const k = (y - FAR) / (VIEW_H - FAR);
    const x = rng() * kerbX(y);
    const r = 1 + k * k * 18 * (0.3 + rng());
    ground
      .poly(blob(rng, x, y, r * 1.3, r * 0.8, 0.3, 10).flat())
      .fill(mixHex(0x1a1a2c, 0x3a3850, rng() * (1 - k * 0.7)));
  }
  // The kerb's lip: the rounded stone edge catches the haze beyond; past it, nothing but fog falling away.
  const lip: number[] = [];
  for (let y = FAR; y <= VIEW_H + 20; y += 20) lip.push(kerbX(y) - 2, y);
  for (let y = VIEW_H + 20; y >= FAR; y -= 20) lip.push(kerbX(y) - 2 - 8 - (y - FAR) * 0.05, y);
  ground.poly(lip).fill({ color: 0x5a5878, alpha: 0.7 });
  const rivers = c.batch(
    'rivers',
    { glow: MOUTH.inner, glowK: 0.55, rim: 0xa8b8e0, rimK: 0.45, swell: 0.045, sss: POD_GLOW, sssK: 0.16 },
    plain.view,
  );
  // Rivers: from the pillar's foot and from off the left, winding over the plain toward the kerb;
  // perspective makes them wide near us and thread-thin at the far edge.
  const persp = (y: number): number => 0.15 + 0.85 * ((y - FAR) / (VIEW_H - FAR));
  const river = (pts: Pt[], w: number, col: number) => {
    const ws = pts.map(([, y]) => w * persp(y));
    rivers.strip(
      pts,
      (t) => {
        const i = Math.min(ws.length - 1, Math.round(t * (ws.length - 1)));
        return Math.max(0.8, ws[i]! * (0.8 + 0.3 * Math.sin(t * 23 + w)));
      },
      { color: col, glow: 0.5, seed: rng() },
    );
  };
  const courses: Pt[][] = [
    [
      [LEG, FAR + 20],
      [LEG + 60, FAR + 50],
      [1330, FAR + 80],
      [1420, FAR + 110],
      [kerbX(FAR + 130) - 10, FAR + 130],
    ],
    [
      [-40, 960],
      [240, 930],
      [520, 960],
      [700, 1020],
      [1000, 1000],
      [1300, 1040],
      [kerbX(1050) - 6, 1050],
    ],
    [
      [-40, FAR + 40],
      [200, FAR + 52],
      [420, FAR + 40],
      [600, FAR + 70],
      [JAR.mx - 60, STAND + 30],
      [JAR.mx + 200, STAND + 50],
      [1300, STAND + 80],
      [kerbX(STAND + 100) - 8, STAND + 100],
    ],
  ];
  for (const [i, course] of courses.entries()) {
    const sp = smoothPath(course, 14);
    river(sp, [24, 44, 30][i]!, i === 2 ? MOUTH.boneMoon : 0x6a6074);
    river(
      sp.map(([x, y], k) => [x + Math.sin(k * 0.2) * 6, y - 6 * persp(y) + Math.cos(k * 0.15) * 4] as Pt),
      [10, 18, 12][i]!,
      MOUTH.boneShadow,
    );
    // Over the edge: it pours down the cliff.
    const [ex, ey] = sp[sp.length - 1]!;
    for (let k = 0; k < 3; k++) {
      const pts = smoothPath(
        [
          [ex, ey],
          [ex + 30 + k * 10, ey + 10],
          [ex + 50 + k * 12, ey + 140 + rng() * 80],
          [ex + 54 + k * 20, VIEW_H + 40],
        ],
        10,
      );
      rivers.strip(pts, taper(([24, 44, 30][i]! * persp(ey)) / (1.5 + k), 2, 0.4, rng()), {
        color: k === 1 ? MOUTH.boneShadow : MOUTH.boneMoon,
        glow: 0.5,
        seed: rng(),
      });
    }
  }
  // Deltas: where a river slows it splits into smaller ones that spread and rejoin.
  for (const course of courses) {
    const sp = smoothPath(course, 14);
    for (let k = 0; k < 4; k++) {
      const i0 = Math.floor(sp.length * (0.1 + rng() * 0.6));
      const i1 = Math.min(sp.length - 1, i0 + 8 + Math.floor(rng() * 20));
      const a0 = sp[i0]!;
      const a1 = sp[i1]!;
      const bow = (rng() < 0.5 ? -1 : 1) * (20 + rng() * 40) * persp(a0[1]);
      const pts = smoothPath([a0, [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2 + bow], a1], 12);
      river(pts, 10 + rng() * 10, rng() < 0.3 ? MOUTH.boneMoon : 0x4a4258);
    }
  }
  rivers.done();

  // --- The jar on its side: glass, a peeling label, the threaded neck; its mouth a cave.
  const jarG = new Graphics();
  plain.view.addChild(jarG);
  const J = JAR;
  const top = J.my - J.ry;
  const bot = J.my + J.ry;
  // Inside, seen through the glass: dark, a crust of dried feed along the bottom.
  jarG.rect(J.mx, top, J.len, bot - top).fill({ color: 0x0a0a16, alpha: 0.75 });
  jarG.ellipse(J.mx + J.len, J.my, J.rx, J.ry).fill({ color: 0x0c0c1a, alpha: 0.8 });
  jarG
    .poly([J.mx, bot - 30, J.mx + J.len, bot - 40, J.mx + J.len, bot - 4, J.mx, bot - 4])
    .fill({ color: 0x3a3028, alpha: 0.7 });
  // The label, half torn: a pale paper band with a bowl and spoon drawn on it.
  const LX0 = J.mx + 130;
  const LX1 = J.mx + 330;
  jarG.poly([LX0, top + 6, LX1, top + 6, LX1, bot - 6, LX0 + 40, bot - 6, LX0 + 10, J.my + 40]).fill({
    color: 0x6a6070,
    alpha: 0.85,
  });
  jarG.ellipse((LX0 + LX1) / 2 + 10, J.my - 10, 48, 18).stroke({ color: 0x2a2632, width: 4, alpha: 0.6 });
  jarG
    .moveTo((LX0 + LX1) / 2 - 50, J.my - 50)
    .lineTo((LX0 + LX1) / 2 + 10, J.my - 18)
    .stroke({ color: 0x2a2632, width: 4, alpha: 0.6 });
  jarG.rect(LX0 + 30, J.my + 30, 120, 6).fill({ color: 0x2a2632, alpha: 0.4 });
  jarG.rect(LX0 + 30, J.my + 48, 80, 5).fill({ color: 0x2a2632, alpha: 0.3 });
  // A curl of torn label hanging off.
  jarG.poly([LX0 + 10, J.my + 40, LX0 + 40, bot - 6, LX0 - 10, bot + 6, LX0 - 30, J.my + 70]).fill({
    color: 0x5a5262,
    alpha: 0.85,
  });
  // The glass: highlights along the top, the far end's rim, the neck's threads, and the mouth's lip.
  jarG
    .moveTo(J.mx + 30, top + 14)
    .lineTo(J.mx + J.len - 10, top + 14)
    .stroke({ color: 0xd8dcf0, width: 5, alpha: 0.35 });
  jarG
    .moveTo(J.mx + 60, top + 30)
    .lineTo(J.mx + J.len - 60, top + 30)
    .stroke({ color: 0xd8dcf0, width: 2, alpha: 0.2 });
  jarG.ellipse(J.mx + J.len, J.my, J.rx, J.ry).stroke({ color: 0xa8acc8, width: 3, alpha: 0.35 });
  jarG
    .moveTo(J.mx, top)
    .lineTo(J.mx + J.len, top)
    .stroke({ color: 0x8a8ea8, width: 2, alpha: 0.5 });
  jarG
    .moveTo(J.mx, bot)
    .lineTo(J.mx + J.len, bot)
    .stroke({ color: 0x5a5e78, width: 2, alpha: 0.5 });
  for (let k = 0; k < 3; k++)
    jarG
      .ellipse(J.mx + 18 + k * 14, J.my, J.rx * 0.95, J.ry * 0.97)
      .stroke({ color: 0xa8acc8, width: 2, alpha: 0.18 });
  // The mouth: a cave. Black inside, a lip of glass catching her light.
  jarG.ellipse(J.mx, J.my, J.rx, J.ry).fill(0x030308);
  jarG.ellipse(J.mx, J.my, J.rx, J.ry).stroke({ color: 0xc8ccdc, width: 4, alpha: 0.55 });
  jarG.ellipse(J.mx - 2, J.my, J.rx - 8, J.ry - 8).stroke({ color: 0x8a8ea8, width: 2, alpha: 0.3 });
  // The lid lies rolled away, on its edge, behind.
  jarG.ellipse(1400, FAR + 40, 26, 96).fill(0x1e1c2c);
  jarG.ellipse(1400, FAR + 40, 26, 96).stroke({ color: 0x5a5872, width: 3, alpha: 0.5 });
  jarG.rect(1392, FAR - 56, 18, 192).fill({ color: 0x2a2838, alpha: 0.9 });

  // --- Umber at the cave's mouth.
  const hero = c.addHero({ x: HX, y: STAND, scale: 0.62, pose: 'stand', facing: 1 }, R);
  const her = new Container();
  her.blendMode = 'add';
  R.addChild(her);
  const herPool = glow(HX, STAND, 110, WARM.gold, 0.2);
  const herHalo = glow(HX, STAND - 40, 70, WARM.key, 0.14);
  // Her light inside the mouth, on the glass.
  const herCave = glow(J.mx + 30, J.my + 40, 120, WARM.gold, 0.08);
  her.addChild(herPool, herHalo, herCave);

  // --- Air: steam off the rivers, spores as big as she is.
  const steam = c.shader('steam', 0, 0, VIEW_W, VIEW_H, STEAM, R);
  steam
    .c(0, 0x6a6080, 0.18)
    .p(1, FAR + 80, 220, 12, 160)
    .p(2, -40, 1500, 80);
  c.mote(
    rng,
    {
      count: 60,
      x: 0,
      y: 80,
      w: VIEW_W,
      h: 900,
      vx: 4,
      vy: -5,
      wobble: 18,
      size: [6, 22],
      alpha: [0.05, 0.22],
      color: [0xd8ccd8, 0xe8d0c8, 0xb8bcd0],
      twinkle: 0.4,
    },
    R,
  );

  // --- Foreground: grit boulders and a fallen leaf the size of a hill, out of focus.
  const fg = c.plane('fg', {
    fog: 0x04040c,
    fogK: 0.25,
    mottle: 0.1,
    blur: 14,
    lit: 0.4,
    seed: 4,
    rimLights: 0.5,
    rimW: 8,
  });
  const fgG = new Graphics();
  fg.view.addChild(fgG);
  for (const [x, y, rx, ry] of [
    [140, 1090, 260, 120],
    [-20, 1000, 130, 140],
  ] as const)
    fgG.poly(blob(rng, x, y, rx, ry, 0.25, 30).flat()).fill(0x06060c);
  // The leaf: a long curled blade with a midrib, top right.
  const leaf = new Graphics();
  leaf
    .moveTo(0, 0)
    .bezierCurveTo(200, -120, 520, -140, 760, -40)
    .bezierCurveTo(520, 20, 220, 60, 0, 0)
    .fill(0x0c0a10);
  leaf.moveTo(10, 0).bezierCurveTo(260, -60, 520, -80, 740, -40).stroke({ color: 0x241e26, width: 6 });
  leaf.position.set(1500, 120);
  leaf.rotation = 0.5;
  fg.view.addChild(leaf);

  // --- Lights: her, the case, the mountain's core.
  const L = c.light({ x: 0, y: 0, radius: 300, color: WARM.gold, intensity: 0.9, scatter: 0.5 });
  const caseL = c.light({
    x: caseC[0],
    y: SEAT - 140,
    radius: 700,
    color: 0xe8c4c0,
    intensity: 0.3,
    scatter: 0.3,
  });
  c.light({ x: 1660, y: HORIZON, radius: 500, color: 0xb89aa8, intensity: 0.3, scatter: 0.3 });
  c.on((t, b) => {
    for (const f of breathers) f(b);
    L.x = hero.light.x;
    L.y = hero.light.y;
    L.intensity = 0.85 * hero.light.k;
    herHalo.position.set(hero.light.x, hero.light.y);
    herHalo.alpha = 0.16 * hero.light.k;
    herPool.alpha = 0.18 + 0.02 * Math.sin(t * 3.1);
    caseL.intensity = 0.22 + 0.14 * b;
    coreG.alpha = 0.3 + 0.25 * b;
  });
}

const frame: WorldFrame = {
  key: 5,
  id: 'moth',
  title: 'The kept street, at moth scale',
  tests:
    'The same bus stop from Umber’s height: a bench as a ledge, a case as big as a building, a jar as a cave, root as rivers, the kerb a cliff. Does smallness read, and is it still the kept street?',
  build,
};
export default frame;
