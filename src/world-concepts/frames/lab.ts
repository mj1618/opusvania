// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 4. The lab, at the mountain's heart. For the first time, straight lines (shelves, a desk, a door
 * frame, a screen), every edge softened by pale folded tissue that fills the ceiling. Cold light only:
 * the screen's grey glow and the dish's pulse. In the middle, on a pedestal of tissue, the cracked
 * dish with its grey cloud and, on the glass, one maker's handprint in old dust. Her case sits in
 * its chair to the right, joined to the dish by the oldest stalk. Umber, tiny, bottom left.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { prng } from '../../render/scene/lib/look';
import { DISH, FOG, MOUNTAIN, SCREEN } from '../lib/bodies';
import type { Composer } from '../lib/compose';
import { curtain, donePods, MOUTH, mixHex, pod, podLayers, spread, WARM } from '../lib/kit';
import { VIEW_H, VIEW_W } from '../lib/layer';
import { glow, vgrad } from '../lib/paint';
import { branchRoot, type Pt, smoothPath, taper, wander } from '../lib/tissue';
import type { WorldFrame } from '../types';

const FLOOR = 912;
const DISHC = { x: 930, y: 690, rx: 170, ry: 62 };
const COLD = 0xc8d0e0;
const STATIC = 0xb8bcc8;

/** A hand, palm at (0,0), fingers up (-y) and a little splayed, about 90 px wrist to fingertip. */
function hand(g: Graphics, color: number, alpha: number): void {
  g.roundRect(-21, -10, 42, 40, 15).fill({ color, alpha });
  const fingers: [number, number, number, number, number][] = [
    [-15, -8, 10.5, 30, -0.3],
    [-4.5, -12, 11, 38, -0.09],
    [6.5, -12, 10.6, 36, 0.08],
    [16.5, -8, 9.4, 28, 0.27],
  ];
  for (const [x, y, w, h, a] of fingers) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pts: number[] = [];
    // A capsule from (x, y) along angle a (0 = straight up).
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * Math.PI;
      const px = Math.cos(t) * (w / 2);
      const py = -h + Math.sin(-t) * (w / 2);
      pts.push(x + px * ca - py * sa, y + px * sa + py * ca);
    }
    pts.push(
      x + (w / 2) * ca - 4 * sa,
      y + (w / 2) * sa + 4 * ca,
      x - (w / 2) * ca - 4 * sa,
      y - (w / 2) * sa + 4 * ca,
    );
    g.poly(pts).fill({ color, alpha });
  }
  // Thumb, out to the side.
  g.poly([-18, 20, -30, 6, -42, -6, -38, -12, -24, -4, -12, 8]).fill({ color, alpha });
}

function build(c: Composer): void {
  const rng = prng(5150);
  const R = c.root;
  c.grade = {
    shadow: 0x0a0c18,
    shadowK: 0.03,
    deep: 0x020308,
    deepK: 0.82,
    saturation: 0.95,
    contrast: 1.06,
    grain: 0.04,
    vignette: 0.2,
    vignetteSoft: 0.6,
    bloom: [0.5, 0.6, 0.55],
  };

  // --- The room: back wall, floor, a doorway, shelves, a desk with the screen.
  const room = c.plane('room', {
    fog: 0x10121c,
    fogK: 0.12,
    ramp: [500, 1000, 0, 0.1],
    amb: 0x5a6484,
    sat: 0.6,
    mottle: 0.22,
    mottleScale: 200,
    lit: 1,
    seed: 1,
  });
  const rg = new Graphics();
  room.view.addChild(rg);
  rg.rect(0, 0, VIEW_W, FLOOR).fill(
    vgrad([
      [0, 0x0c0e16],
      [0.6, 0x161a24],
      [1, 0x12141c],
    ]),
  );
  // Wall panels: the room's straight lines.
  for (let x = 0; x < VIEW_W; x += 160) rg.rect(x, 0, 2, FLOOR).fill({ color: 0x05060a, alpha: 0.5 });
  rg.rect(0, 610, VIEW_W, 4).fill({ color: 0x252a36, alpha: 0.8 });
  rg.rect(0, FLOOR - 24, VIEW_W, 24).fill(0x1c202a);
  rg.rect(0, FLOOR, VIEW_W, VIEW_H - FLOOR).fill(
    vgrad([
      [0, 0x14161e],
      [0.25, 0x0a0b10],
      [1, 0x040408],
    ]),
  );
  // Floor tiles: lines only.
  for (let x = -200; x < VIEW_W + 200; x += 120)
    rg.moveTo(x, FLOOR)
      .lineTo(x + (x - 960) * 0.4, VIEW_H)
      .stroke({ color: 0x05060a, width: 2, alpha: 0.6 });
  // A doorway on the left: dark, its frame square.
  rg.rect(60, 470, 170, FLOOR - 470).fill(0x030306);
  rg.rect(52, 462, 186, 10).fill(0x262a36);
  rg.rect(52, 462, 10, FLOOR - 462).fill(0x262a36);
  rg.rect(228, 462, 10, FLOOR - 462).fill(0x262a36);
  // Shelves with jars.
  for (const y of [420, 540]) {
    rg.rect(300, y, 330, 8).fill(0x2a2e3a);
    rg.rect(300, y + 8, 330, 4).fill({ color: 0x000000, alpha: 0.5 });
    for (let x = 316; x < 610; x += 34 + rng() * 14) {
      const h = 34 + rng() * 26;
      const w = 22 + rng() * 8;
      rg.roundRect(x, y - h, w, h, 4).fill({ color: 0x3a4250, alpha: 0.55 });
      rg.rect(x + 2, y - h * 0.55, w - 4, h * 0.5).fill({
        color: rng() < 0.5 ? 0x4a4a46 : 0x2c2e36,
        alpha: 0.8,
      });
      rg.rect(x + 3, y - h + 3, 2, h - 8).fill({ color: 0xc8d0e0, alpha: 0.18 });
      rg.rect(x - 1, y - h - 5, w + 2, 6).fill(0x1c1e26);
    }
  }
  // The sign, half grown over.
  rg.rect(300, 230, 360, 70).fill(0x1e222c);
  rg.rect(306, 236, 348, 58).fill(0x2a2e38);
  const sign = new Text({
    text: 'NO ONE GOES HUNGRY',
    style: {
      fill: 0x8a8e98,
      fontSize: 30,
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: '600',
      letterSpacing: 3,
    },
  });
  sign.anchor.set(0.5);
  sign.position.set(480, 265);
  sign.alpha = 0.5;
  room.view.addChild(sign);
  // The desk on the right with the screen on it.
  const DESK = { x: 1260, y: 760, w: 300 };
  const deskG = new Graphics();
  room.view.addChild(deskG);
  deskG.rect(DESK.x, DESK.y, DESK.w, 14).fill(0x2a2e3a);
  deskG.rect(DESK.x + 10, DESK.y + 14, 12, FLOOR - DESK.y - 14).fill(0x1a1d26);
  deskG.rect(DESK.x + DESK.w - 22, DESK.y + 14, 12, FLOOR - DESK.y - 14).fill(0x1a1d26);
  deskG.rect(DESK.x + 160, DESK.y + 14, 130, 80).fill(0x161922);
  const SCR = { x: DESK.x + 60, y: DESK.y - 150, w: 170, h: 124 };
  deskG.roundRect(SCR.x - 16, SCR.y - 14, SCR.w + 32, SCR.h + 28, 10).fill(0x22252e);
  deskG.rect(SCR.x + SCR.w / 2 - 20, SCR.y + SCR.h + 14, 40, 12).fill(0x22252e);
  const screen = c.shader('screen', SCR.x, SCR.y, SCR.w, SCR.h, SCREEN, room.view);
  screen.c(0, 0xaab4c8, 0.9);

  // The poster: a hand lifts a small light out of a drawn head into a dish. Line drawing only.
  {
    const P = { x: 720, y: 300, w: 170, h: 220 };
    rg.rect(P.x, P.y, P.w, P.h).fill(0x262a34);
    rg.rect(P.x + 6, P.y + 6, P.w - 12, P.h - 12).fill(0x323642);
    const ink = { color: 0x9aa0ac, width: 2.5, alpha: 0.7 };
    // Head in profile.
    rg.moveTo(P.x + 40, P.y + 150)
      .bezierCurveTo(P.x + 20, P.y + 120, P.x + 22, P.y + 60, P.x + 62, P.y + 52)
      .bezierCurveTo(P.x + 96, P.y + 48, P.x + 104, P.y + 84, P.x + 96, P.y + 100)
      .lineTo(P.x + 104, P.y + 112)
      .lineTo(P.x + 94, P.y + 116)
      .lineTo(P.x + 92, P.y + 134)
      .lineTo(P.x + 72, P.y + 136)
      .lineTo(P.x + 70, P.y + 152)
      .stroke(ink);
    // The light lifted out, and the dish it goes to.
    rg.circle(P.x + 70, P.y + 82, 7).fill({ color: 0xe0e4ec, alpha: 0.8 });
    rg.moveTo(P.x + 78, P.y + 76)
      .quadraticCurveTo(P.x + 120, P.y + 50, P.x + 132, P.y + 140)
      .stroke({ color: 0x9aa0ac, width: 1.5, alpha: 0.6 });
    rg.ellipse(P.x + 132, P.y + 160, 26, 7).stroke(ink);
    rg.rect(P.x + 30, P.y + 184, 110, 5).fill({ color: 0x9aa0ac, alpha: 0.4 });
    rg.rect(P.x + 50, P.y + 196, 70, 4).fill({ color: 0x9aa0ac, alpha: 0.3 });
  }
  // Service pipes along the wall, straight and square.
  rg.rect(0, 180, VIEW_W, 10).fill(0x1c202a);
  rg.rect(1100, 180, 10, 430).fill(0x1c202a);
  rg.rect(1100, 600, 160, 10).fill(0x1c202a);

  // Veins of root crawling over the wall panels, up from the floor and down from the ceiling.
  const veins = c.batch('veins', { glow: 0xd8d4dc, glowK: 0.5, swell: 0.03 }, room.view);
  for (let i = 0; i < 16; i++) {
    const up = i % 2 === 0;
    const x = 120 + rng() * 1680;
    branchRoot(veins, rng, {
      x,
      y: up ? FLOOR - 20 : 230,
      ang: up ? -Math.PI / 2 + (rng() - 0.5) * 0.6 : Math.PI / 2 + (rng() - 0.5) * 0.6,
      len: 160 + rng() * 300,
      step: 7,
      curl: 0.22,
      w0: 3 + rng() * 4,
      w1: 0.5,
      depth: 2,
      kids: 2,
      style: { color: 0x6a6268, glow: 0.5 },
    });
  }
  veins.done();

  // --- Tissue: the ceiling is one folded mass, lit from below by the dish.
  const ceil = c.shader('ceiling', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const lobes: [number, number, number, number][] = [
    [960, -60, 760, 250],
    [300, 40, 360, 200],
    [1620, 30, 400, 210],
    [60, 300, 120, 360],
    [1880, 320, 110, 380],
    [700, 150, 220, 110],
    [1220, 150, 240, 120],
    [960, 170, 160, 90],
  ];
  for (const [i, l] of lobes.entries()) ceil.p(i, ...l);
  ceil
    .p(8, DISHC.x, DISHC.y, 520, 0.006)
    .c(9, 0x6a6064)
    .c(10, 0x0a090e)
    .c(11, 0xb8b0b8)
    .c(12, 0x101018, 0.18)
    .p(13, 2000, 3, 1.3);

  // --- The pedestal, tubes, the dish; tissue softening every edge.
  const mid = c.plane('mid', {
    fog: 0x10121c,
    fogK: 0.04,
    amb: 0xc0c8dc,
    sat: 0.7,
    mottle: 0.16,
    mottleScale: 150,
    lit: 1.1,
    seed: 2,
  });
  const tissue = c.batch(
    'tissue',
    { glow: 0xd8d4dc, glowK: 0.45, rim: 0x9aa8c8, rimK: 0.3, swell: 0.04, light: [0, 1] },
    mid.view,
  );
  // Edges softened: tissue along the shelf fronts, over the door frame, along the desk.
  for (const [x0, x1, y] of [
    [296, 640, 418],
    [296, 640, 538],
    [48, 244, 460],
    [1250, 1570, 758],
    [290, 670, 228],
  ] as const) {
    const pts: Pt[] = [];
    for (let k = 0; k <= 16; k++) pts.push([x0 + ((x1 - x0) * k) / 16, y + Math.sin(k * 1.1 + x0) * 3]);
    tissue.strip(pts, taper(9, 7, 0.6, rng()), { color: 0x6a6068, kind: 1, glow: 0.45, seed: rng() });
    curtain(rng, tissue, x0, x1, y + 6, [8, 70], [2.5, 6], MOUTH.boneShadow, 0.4, [30, 80]);
  }
  // Over the sign: two folds cross it, leaving half the words.
  for (const [a, b] of [
    [
      [280, 210],
      [520, 300],
    ],
    [
      [560, 200],
      [700, 320],
    ],
  ] as const)
    tissue.strip(
      smoothPath([a as Pt, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 20], b as Pt], 12),
      taper(16, 10, 0.4, rng()),
      { color: MOUTH.boneShadow, kind: 1, glow: 0.4, seed: rng() },
    );
  // Heavy folds hanging from the ceiling mass, and a few long strands.
  for (const [x, l, w] of [
    [140, 380, 30],
    [250, 200, 22],
    [1180, 300, 26],
    [1320, 160, 20],
    [1560, 420, 34],
    [1840, 520, 30],
  ] as const) {
    const pts = wander(rng, { x, y: 180, ang: Math.PI / 2, len: l, step: 8, curl: 0.08, droop: 0.2 });
    tissue.strip(
      pts,
      (t) => w * (1 - 0.5 * t) * (t > 0.92 ? Math.sqrt(Math.max(0, 1 - ((t - 0.92) / 0.08) ** 2)) : 1) + 1,
      {
        color: MOUTH.boneShadow,
        kind: 1,
        glow: 0.4,
        seed: rng(),
      },
    );
  }
  // The pedestal: tissue grown up from the floor into a column under the dish.
  for (let i = 0; i < 14; i++) {
    const x0 = DISHC.x - 120 + rng() * 240;
    const pts = smoothPath(
      [
        [x0 + (rng() - 0.5) * 260, FLOOR + 4],
        [DISHC.x + (x0 - DISHC.x) * 0.5 + (rng() - 0.5) * 30, FLOOR - 90],
        [DISHC.x + (x0 - DISHC.x) * 0.4, DISHC.y + 70],
        [DISHC.x + (x0 - DISHC.x) * 0.8, DISHC.y + 22],
      ],
      12,
    );
    tissue.strip(pts, taper(22 + rng() * 10, 10, 0.5, rng()), {
      color: mixHex(MOUTH.boneShadow, 0x3a3440, rng() * 0.6),
      kind: 1,
      glow: 0.6,
      seed: rng(),
    });
  }
  for (const sgn of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const pts = smoothPath(
        [
          [DISHC.x + sgn * (30 + k * 20), DISHC.y + 120],
          [DISHC.x + sgn * (DISHC.rx * 0.8 + k * 6), DISHC.y + 70 - k * 8],
          [DISHC.x + sgn * (DISHC.rx + 10), DISHC.y + 30 - k * 6],
          [DISHC.x + sgn * (DISHC.rx * 0.9 - k * 14), DISHC.y + 6 - k * 4],
        ],
        12,
      );
      tissue.strip(pts, taper(18 - k * 4, 4, 0.4, rng()), {
        color: MOUTH.boneMoon,
        kind: 1,
        glow: 0.6,
        seed: rng(),
      });
    }
  spread(rng, tissue, DISHC.x, FLOOR + 4, 10, [120, 420], [5, 12], MOUTH.boneMoon, 0.5);
  // Dry tubes from the dish, to the floor and the wall.
  const tubes = c.batch('tubes', { glow: 0, glowK: 0, rim: 0xc8d0e0, rimK: 0.4, light: [0, -1] }, mid.view);
  for (const [ex, ey, w, side] of [
    [470, FLOOR + 2, 6, -1],
    [640, FLOOR + 2, 5, -1],
    [1180, FLOOR + 2, 5, 1],
  ] as const) {
    const sx = DISHC.x + side * DISHC.rx * 0.92;
    const pts = smoothPath(
      [
        [sx, DISHC.y + 14],
        [sx + side * 40, DISHC.y + 26],
        [ex - side * 60, Math.min(ey, DISHC.y + 60) + (ey - DISHC.y) * 0.5],
        [ex, ey],
      ],
      14,
    );
    tubes.strip(pts, () => w, { color: 0x3a404c, kind: 4, seed: rng() });
  }
  tubes.done();
  // The oldest stalk: worn smooth, from the dish along the floor into her case.
  const CASE = { x: 1700, y: FLOOR };
  const stalk = smoothPath(
    [
      [DISHC.x + 60, DISHC.y + 40],
      [DISHC.x + 160, FLOOR - 30],
      [1300, FLOOR - 6],
      [1560, FLOOR - 10],
      [CASE.x - 40, FLOOR - 60],
    ],
    16,
  );
  tissue.strip(stalk, taper(15, 11, 0.1, 0.3), { color: 0x8a8088, kind: 4, glow: 0.35, seed: 0.3 });
  // Her case: a chair grown round, a seated shadow inside, jars in her lap.
  const chairG = new Graphics();
  mid.view.addChild(chairG);
  chairG.rect(CASE.x - 50, FLOOR - 110, 100, 10).fill(0x22252e);
  chairG.rect(CASE.x + 38, FLOOR - 250, 10, 150).fill(0x22252e);
  chairG.rect(CASE.x - 46, FLOOR - 100, 8, 100).fill(0x22252e);
  chairG.rect(CASE.x + 38, FLOOR - 100, 8, 100).fill(0x22252e);
  const caseGlows = new Container();
  caseGlows.blendMode = 'add';
  const pods = podLayers(c, mid.view, 0.4, caseGlows);
  pod(rng, pods, {
    x: CASE.x + 10,
    y: 616,
    stalk: 4,
    len: 296,
    w: 100,
    lean: -6,
    glow: 0.7,
    sleeperAlpha: 0.0,
  });
  // The seated shadow (drawn into the pod's figure layer so the front membrane covers it).
  const fig = pods.figures;
  const sh = 0x2a2634;
  // Seated, head bowed over her lap, the jars held there: soft shapes only.
  const E = (x: number, y: number, rx: number, ry: number, rot: number, a = 0.5) => {
    const pts: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = (i / 20) * Math.PI * 2;
      const ex = Math.cos(t) * rx;
      const ey = Math.sin(t) * ry;
      pts.push(x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot));
    }
    fig.poly(pts).fill({ color: sh, alpha: a });
  };
  E(CASE.x + 6, FLOOR - 170, 30, 52, 0.35);
  E(CASE.x - 22, FLOOR - 218, 18, 20, 0);
  E(CASE.x - 14, FLOOR - 120, 40, 15, -0.08);
  E(CASE.x - 46, FLOOR - 76, 11, 44, 0.06, 0.45);
  E(CASE.x - 30, FLOOR - 150, 22, 10, 0.5, 0.45);
  fig.roundRect(CASE.x - 46, FLOOR - 150, 15, 21, 4).fill({ color: 0x46424e, alpha: 0.55 });
  fig.roundRect(CASE.x - 28, FLOOR - 146, 13, 19, 4).fill({ color: 0x46424e, alpha: 0.55 });
  tissue.done();
  donePods(pods);
  mid.view.addChild(caseGlows);

  // The ceiling mass over everything hung from it, so folds and strands come out of it.
  R.addChild(ceil.mesh);

  // The dish: dark glass bottom, the cloud, then the glass and its lid, cracks, dust, the hand.
  const dishG = new Graphics();
  R.addChild(dishG);
  const D = DISHC;
  dishG.ellipse(D.x, D.y + 30, D.rx + 6, D.ry + 8).fill(0x1a1c24);
  dishG.rect(D.x - D.rx - 6, D.y + 4, (D.rx + 6) * 2, 26).fill(0x1a1c24);
  dishG.ellipse(D.x, D.y + 4, D.rx + 6, D.ry + 4).fill(0x14161e);
  dishG.ellipse(D.x, D.y + 10, D.rx, D.ry).fill(0x08090e);
  const cloud = c.shader('dish-cloud', D.x - D.rx, D.y - D.ry, D.rx * 2, D.ry * 2 + 20, DISH, R);
  cloud
    .p(0, D.rx, D.ry + 10, D.rx * 0.94, D.ry * 0.9)
    .c(1, 0xc8ccd8, 1.25)
    .p(2, 0.3, 1);
  cloud.mesh.blendMode = 'add';
  const glass = new Graphics();
  R.addChild(glass);
  // The wall of the dish (a band between two ellipses) and the lid.
  glass.ellipse(D.x, D.y + 14, D.rx + 4, D.ry + 4).stroke({ color: 0x9aa4b8, width: 2, alpha: 0.35 });
  // The dish's glass wall, seen side on: a thin pale band with a highlight.
  glass.rect(D.x - D.rx - 6, D.y + 2, 3, 28).fill({ color: 0xc8d0e0, alpha: 0.35 });
  glass.rect(D.x + D.rx + 3, D.y + 2, 3, 28).fill({ color: 0xc8d0e0, alpha: 0.25 });
  glass.ellipse(D.x, D.y + 30, D.rx + 6, D.ry + 8).stroke({ color: 0x8a94a8, width: 1.5, alpha: 0.3 });
  glass.ellipse(D.x, D.y - 4, D.rx + 8, D.ry + 4).fill({ color: 0x8a94a8, alpha: 0.1 });
  glass.ellipse(D.x, D.y - 4, D.rx + 8, D.ry + 4).stroke({ color: 0xc8d0e0, width: 2, alpha: 0.45 });
  glass
    .moveTo(D.x - D.rx * 0.7, D.y - D.ry * 0.7)
    .quadraticCurveTo(D.x - D.rx * 0.2, D.y - D.ry * 1.05, D.x + D.rx * 0.3, D.y - D.ry * 0.95);
  glass.stroke({ color: 0xe8eef8, width: 2.5, alpha: 0.35 });
  // Dust over the lid: soft blotches.
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng());
    glass
      .ellipse(
        D.x + Math.cos(a) * r * D.rx * 0.9,
        D.y - 4 + Math.sin(a) * r * D.ry * 0.85,
        10 + rng() * 26,
        4 + rng() * 8,
      )
      .fill({
        color: 0xa8aab0,
        alpha: 0.035,
      });
  }
  // The handprint: where a palm rested on the dusty lid, fingers toward the far rim.
  // The lid carries a film of old dust; the print is where a palm wiped it clean, so the glass is
  // dark there and the cloud's light shows only round it.
  glass.ellipse(D.x, D.y - 4, D.rx + 2, D.ry).fill({ color: 0xa8acb8, alpha: 0.16 });
  const hp = new Graphics();
  hand(hp, 0x05060c, 0.5);
  const hp2 = new Graphics();
  hand(hp2, 0x05060c, 0.3);
  hp2.scale.set(1.08);
  const handC = new Container();
  handC.addChild(hp2, hp);
  handC.position.set(D.x - 50, D.y + 8);
  handC.scale.set(1.35, 0.5);
  handC.rotation = -0.1;
  R.addChild(handC);
  // Cracks across the lid.
  const cr = new Graphics();
  const crack = (x: number, y: number, a: number, n: number) => {
    let px = x;
    let py = y;
    cr.moveTo(px, py);
    for (let i = 0; i < n; i++) {
      a += (rng() - 0.5) * 0.9;
      px += Math.cos(a) * (8 + rng() * 10);
      py += Math.sin(a) * (3 + rng() * 4);
      cr.lineTo(px, py);
    }
  };
  crack(D.x + 30, D.y - 10, -0.3, 9);
  crack(D.x + 30, D.y - 10, 2.6, 6);
  crack(D.x + 70, D.y - 20, 0.6, 5);
  cr.stroke({ color: 0xe0e8f4, width: 1.3, alpha: 0.55 });
  R.addChild(cr);
  const dishGlow = new Container();
  dishGlow.blendMode = 'add';
  R.addChild(dishGlow);
  const dg1 = glow(D.x, D.y, 300, 0x8a90a8, 0.24);
  const dg2 = glow(D.x, D.y + 4, 150, COLD, 0.2);
  dishGlow.addChild(dg1, dg2);
  const scrGlow = glow(SCR.x + SCR.w / 2, SCR.y + SCR.h / 2, 220, 0x8a96b0, 0.16);
  dishGlow.addChild(scrGlow);

  // --- Umber, tiny, by the pipe she came in through.
  const pipeG = new Graphics();
  R.addChild(pipeG);
  pipeG.rect(0, FLOOR - 70, 120, 70).fill(0x1a1d26);
  pipeG.ellipse(120, FLOOR - 35, 14, 35).fill(0x05050a);
  pipeG.ellipse(120, FLOOR - 35, 14, 35).stroke({ color: 0x2e3240, width: 4 });
  const hero = c.addHero({ x: 220, y: FLOOR + 2, scale: 0.62, pose: 'stand', facing: 1 }, R);
  const her = new Container();
  her.blendMode = 'add';
  R.addChild(her);
  const herPool = glow(220, FLOOR + 2, 80, WARM.gold, 0.16);
  const herHalo = glow(220, FLOOR - 40, 60, WARM.key, 0.12);
  her.addChild(herPool, herHalo);

  // --- Air: dust hanging in the dish's light; a cold haze low on the floor.
  const haze = c.shader('haze', 0, 0, VIEW_W, VIEW_H, FOG, R);
  haze
    .c(0, 0x1a1e2c, 0.4)
    .p(1, 700, 80, 0.004, 0)
    .p(2, 760, 860, 960, 1040)
    .p(3, 0.3, 0.8, 0.3, 0.2)
    .p(5, D.x, D.y + 160, 320, 0.6)
    .c(6, 0x6a7088);
  const halo = c.shader('dish-haze', 0, 0, VIEW_W, VIEW_H, FOG, R);
  halo
    .c(0, 0x10121a, 0.5)
    .p(1, 500, 260, 0.004, 0.002)
    .p(2, 200, 420, 860, 960)
    .p(3, 0.25, 0.9, 0.5, 0.5)
    .p(5, D.x, D.y - 30, 300, 0.7)
    .c(6, 0x8a92a8);
  halo.mesh.blendMode = 'add';
  c.mote(
    rng,
    {
      count: 80,
      x: D.x - 400,
      y: 300,
      w: 800,
      h: 560,
      vx: 1,
      vy: -1.5,
      wobble: 8,
      size: [2, 6],
      alpha: [0.05, 0.3],
      color: [0xc8d0e0, 0xa8b0c4],
      twinkle: 0.5,
    },
    R,
  );

  // --- Foreground: the edge of a bench and tissue in the bottom corners, out of focus.
  const fg = c.plane('fg', { fog: 0x030308, fogK: 0.25, mottle: 0.1, blur: 8, lit: 0.3, seed: 4 });
  const fgT = c.batch(
    'fg-tissue',
    { glow: 0xd8d4dc, glowK: 0.15, rim: 0x6a76a0, rimK: 0.3, swell: 0.05 },
    fg.view,
  );
  const fgG = new Graphics();
  fg.view.addChildAt(fgG, 0);
  fgG.rect(1500, 990, 520, 20).fill(0x0c0d12);
  fgG.rect(1540, 1010, 16, 80).fill(0x0c0d12);
  for (let i = 0; i < 5; i++) {
    const pts = wander(rng, {
      x: -60,
      y: 1000 + rng() * 80,
      ang: -0.15 + rng() * 0.2,
      len: 260 + rng() * 300,
      step: 10,
      curl: 0.12,
    });
    fgT.strip(pts, taper(30 + rng() * 10, 5, 0.3, rng()), {
      color: 0x2c2a32,
      kind: 1,
      glow: 0.2,
      seed: rng(),
    });
  }
  fgT.done();

  // --- Lights: the dish (cold, breathing, with static), the screen, Umber.
  const dl = c.light({ x: D.x, y: D.y, radius: 620, color: COLD, intensity: 0.7, scatter: 0.35 });
  const sl = c.light({
    x: SCR.x + SCR.w / 2,
    y: SCR.y + SCR.h / 2,
    radius: 360,
    color: STATIC,
    intensity: 0.45,
    scatter: 0.3,
  });
  const L = c.light({ x: 0, y: 0, radius: 200, color: WARM.gold, intensity: 0.8, scatter: 0.5 });
  c.on((t, b) => {
    const st = Math.sin(t * 17) * Math.sin(t * 5.3) > 0.9 ? 0.75 : 1;
    dl.intensity = (0.45 + 0.35 * b) * st;
    dg1.alpha = (0.16 + 0.12 * b) * st;
    dg2.alpha = (0.12 + 0.14 * b) * st;
    sl.intensity = 0.42 + 0.04 * Math.sin(t * 40);
    L.x = hero.light.x;
    L.y = hero.light.y;
    L.intensity = 0.8 * hero.light.k;
    herHalo.position.set(hero.light.x, hero.light.y);
    herHalo.alpha = 0.16 * hero.light.k;
  });
}

const frame: WorldFrame = {
  key: 4,
  id: 'lab',
  title: 'The lab',
  tests:
    'The palette breaks on purpose: straight lines softened by tissue, cold light only (the dish, the screen). Can the cracked dish and one handprint on its glass carry the midpoint without words?',
  build,
};
export default frame;
