// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 4. The lab, at the mountain's heart. For the first time, straight lines (shelves, a partition, a
 * door frame, a desk), every edge softened by pale folded tissue that fills the ceiling. One cold
 * light only: the dish, in the middle, under a dome of tissue grown over it, its glow coming through
 * the membrane and out of a torn opening at the top, where the lid shows its one handprint in old
 * dust. On the wall, half grown over, the sign: HEARTH, and under it, NO ONE GOES HUNGRY. To the
 * right the maker sits in her chair under a fall of silk, head bowed toward the dish; her coat on
 * the floor, her torch dead beside it, the jars she brought standing unopened at her feet. Umber,
 * tiny and warm, bottom left, where she came in.
 *
 * Depth, back to front: the far bay through the glass partition (pale, cold, still); the room's wall
 * with its sign, shelves and door; the ceiling's folded mass; the dish on its pedestal under the dome;
 * the maker, her things, the floor; out-of-focus tissue and a bench edge at the frame's edges.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { prng } from '../../render/scene/lib/look';
import { BEAM, DISH, DOME, FOG, MOUNTAIN, REFLECT } from '../../render/world/bodies';
import type { Composer } from '../../render/world/compose';
import { curtain, donePods, MOUTH, mixHex, pod, podLayers, spread, WARM } from '../../render/world/kit';
import { VIEW_H, VIEW_W } from '../../render/world/layer';
import { moths } from '../../render/world/moths';
import { blob, glow, hgrad, vgrad } from '../../render/world/paint';
import { branchRoot, type Pt, smoothPath, taper } from '../../render/world/tissue';
import type { WorldFrame } from '../types';

const FLOOR = 912;
const DISHC = { x: 880, y: 676, rx: 150, ry: 50 };
const COLD = 0xc8d4e8;
/** The maker's chair: seat front x, seat y. */
const CHAIR = { x: 1430, y: 760 };

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

/** A feed jar standing, lid on: glass, a pale label with a bowl drawn on it. */
function jar(g: Graphics, x: number, y: number, h: number, lit: number): void {
  const w = h * 0.68;
  g.roundRect(x - w / 2, y - h, w, h, w * 0.18).fill({ color: 0x1a1e2a, alpha: 0.85 });
  g.rect(x - w / 2 + 2, y - h * 0.62, w - 4, h * 0.42).fill(mixHex(0x4a4652, 0x8a8a98, lit));
  g.ellipse(x, y - h * 0.44, w * 0.22, h * 0.07).stroke({ color: 0x1a1820, width: 1.5, alpha: 0.6 });
  g.rect(x - w / 2 - 2, y - h - 6, w + 4, 9).fill(mixHex(0x2a2a34, 0x6a6a78, lit));
  g.rect(x - w / 2 + 3, y - h + 6, 2.5, h - 12).fill({ color: 0xdde4f4, alpha: 0.25 + 0.3 * lit });
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
    grain: 0.035,
    vignette: 0.24,
    vignetteSoft: 0.6,
    bloom: [0.5, 0.6, 0.6],
  };
  const D = DISHC;

  // --- The far bay, through the partition: another room the same, benches and cases in the cold
  // haze, very still.
  const bay = c.plane('bay', {
    fog: 0x3a4458,
    fogK: 0.6,
    ramp: [300, 900, -0.1, 0.18],
    amb: 0x8a96b0,
    mottle: 0.1,
    blur: 3,
    lit: 0.6,
    seed: 0,
    edge: [10, 0.25, 0, 0],
    brush: [0.06, 80, 1.5, 9],
  });
  const bayG = new Graphics();
  bay.view.addChild(bayG);
  bayG.rect(980, 0, 960, FLOOR).fill(
    vgrad([
      [0, 0x10141c],
      [0.7, 0x1a2030],
      [1, 0x141822],
    ]),
  );
  for (let x = 1020; x < 1940; x += 220 + rng() * 60) {
    // A bench, a stool, a case on a chair: blocked in.
    bayG.rect(x, 720, 160, 10).fill(0x0c0e14);
    bayG.rect(x + 8, 730, 8, 140).fill(0x0c0e14);
    bayG.rect(x + 144, 730, 8, 140).fill(0x0c0e14);
  }
  const bayPods = podLayers(c, bay.view, 0.4, null);
  for (const [x, len] of [
    [1100, 120],
    [1330, 140],
    [1600, 110],
    [1830, 130],
  ] as const)
    pod(rng, bayPods, {
      x,
      y: 380 + rng() * 60,
      stalk: 200 + rng() * 80,
      len,
      w: 34,
      glow: 0.4,
      color: 0x6a6670,
    });
  donePods(bayPods);
  const bayRoots = c.batch('bay-roots', { glow: MOUTH.inner, glowK: 0.3, swell: 0.03 }, bay.view);
  curtain(rng, bayRoots, 980, 1940, 140, [80, 420], [4, 12], 0x5a5462, 0.3, [30, 80]);
  bayRoots.done();

  // --- The room's wall: a door, shelves, the sign, the poster; the partition's glass on the right.
  const room = c.plane('room', {
    fog: 0x10121c,
    fogK: 0.14,
    ramp: [400, 1000, 0, 0.12],
    amb: 0x5a6484,
    sat: 0.6,
    mottle: 0.24,
    mottleScale: 200,
    lit: 1,
    seed: 1,
    edge: [10, 0.06, 0.1, 0],
    rimLights: 0.6,
    rimW: 4,
    brush: [0.14, 60, 1.57, 8],
    paint: 3,
  });
  const rg = new Graphics();
  room.view.addChild(rg);
  // The wall, left of the partition.
  rg.rect(0, 0, 1000, FLOOR).fill(
    vgrad([
      [0, 0x0c0e16],
      [0.6, 0x181c26],
      [1, 0x12141c],
    ]),
  );
  for (let x = 0; x < 1000; x += 160) rg.rect(x, 0, 2, FLOOR).fill({ color: 0x05060a, alpha: 0.5 });
  rg.rect(0, 610, 1000, 4).fill({ color: 0x252a36, alpha: 0.8 });
  rg.rect(0, FLOOR - 24, 1000, 24).fill(0x1c202a);
  // The partition: steel mullions, glass with a sheen, the lower panel solid.
  rg.rect(1000, FLOOR - 220, 940, 220).fill(
    vgrad([
      [0, 0x1e222c],
      [1, 0x12141a],
    ]),
  );
  for (let x = 1000; x < 1940; x += 236) rg.rect(x - 6, 0, 14, FLOOR).fill(0x1c202a);
  rg.rect(1000, FLOOR - 228, 940, 10).fill(0x262a36);
  rg.rect(1000, 240, 940, 8).fill(0x1c202a);
  for (let i = 0; i < 5; i++) {
    const x = 1060 + i * 190;
    rg.poly([x, 248, x + 40, 248, x - 90, FLOOR - 228, x - 130, FLOOR - 228]).fill({
      color: 0x9aa8c8,
      alpha: 0.04,
    });
  }
  // A crack across one pane.
  {
    let x = 1250;
    let y = 300;
    rg.moveTo(x, y);
    for (let i = 0; i < 8; i++) {
      x += 14 + rng() * 26;
      y += (rng() - 0.3) * 36;
      rg.lineTo(x, y);
    }
    rg.stroke({ color: 0xc8d0e0, width: 1.2, alpha: 0.3 });
  }
  // The floor: tiles in perspective, a film of dust.
  rg.rect(0, FLOOR, VIEW_W, VIEW_H - FLOOR).fill(
    vgrad([
      [0, 0x30343e],
      [0.3, 0x1c1e26],
      [1, 0x0a0a10],
    ]),
  );
  for (let x = -400; x < VIEW_W + 400; x += 120)
    rg.moveTo(x, FLOOR)
      .lineTo(x + (x - 900) * 0.5, VIEW_H)
      .stroke({ color: 0x05060a, width: 2, alpha: 0.6 });
  for (const y of [940, 985, 1050]) rg.rect(0, y, VIEW_W, 2).fill({ color: 0x05060a, alpha: 0.5 });
  // The doorway on the left: dark, square, a pipe beside it.
  rg.rect(70, 470, 170, FLOOR - 470).fill(0x030306);
  rg.rect(62, 462, 186, 10).fill(0x262a36);
  rg.rect(62, 462, 10, FLOOR - 462).fill(0x262a36);
  rg.rect(238, 462, 10, FLOOR - 462).fill(0x262a36);
  // Shelves with jars and bottles, some fallen.
  for (const y of [430, 550]) {
    rg.rect(300, y, 330, 8).fill(0x2a2e3a);
    rg.rect(300, y + 8, 330, 4).fill({ color: 0x000000, alpha: 0.5 });
    for (let x = 316; x < 610; x += 34 + rng() * 14) {
      if (rng() < 0.2) {
        rg.roundRect(x, y - 16, 34, 16, 5).fill({ color: 0x3a4250, alpha: 0.55 });
        continue;
      }
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
  // The sign: HEARTH, and under it the promise, half grown over.
  rg.rect(270, 214, 470, 120).fill(0x1e222c);
  rg.rect(278, 222, 454, 104).fill(0x2a2e38);
  const sign = new Text({
    text: 'HEARTH',
    style: {
      fill: 0x9aa0ac,
      fontSize: 62,
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: '700',
      letterSpacing: 14,
    },
  });
  sign.anchor.set(0.5);
  sign.position.set(505, 262);
  sign.alpha = 0.62;
  const motto = new Text({
    text: 'NO ONE GOES HUNGRY',
    style: {
      fill: 0x8a8e98,
      fontSize: 19,
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: '600',
      letterSpacing: 5,
    },
  });
  motto.anchor.set(0.5);
  motto.position.set(505, 308);
  motto.alpha = 0.5;
  room.view.addChild(sign, motto);
  // The poster: a hand lifts a small light out of a drawn head into a dish. Line drawing only.
  {
    const P = { x: 760, y: 340, w: 150, h: 196 };
    rg.rect(P.x, P.y, P.w, P.h).fill(0x262a34);
    rg.rect(P.x + 6, P.y + 6, P.w - 12, P.h - 12).fill(0x323642);
    const ink = { color: 0x9aa0ac, width: 2.5, alpha: 0.7 };
    rg.moveTo(P.x + 36, P.y + 134)
      .bezierCurveTo(P.x + 18, P.y + 106, P.x + 20, P.y + 54, P.x + 56, P.y + 46)
      .bezierCurveTo(P.x + 86, P.y + 42, P.x + 94, P.y + 74, P.x + 86, P.y + 90)
      .lineTo(P.x + 94, P.y + 100)
      .lineTo(P.x + 84, P.y + 104)
      .lineTo(P.x + 82, P.y + 120)
      .lineTo(P.x + 64, P.y + 122)
      .lineTo(P.x + 62, P.y + 136)
      .stroke(ink);
    rg.circle(P.x + 62, P.y + 74, 6).fill({ color: 0xe0e4ec, alpha: 0.8 });
    rg.moveTo(P.x + 70, P.y + 68)
      .quadraticCurveTo(P.x + 106, P.y + 44, P.x + 116, P.y + 124)
      .stroke({ color: 0x9aa0ac, width: 1.5, alpha: 0.6 });
    rg.ellipse(P.x + 116, P.y + 142, 22, 6).stroke(ink);
    rg.rect(P.x + 26, P.y + 164, 96, 5).fill({ color: 0x9aa0ac, alpha: 0.4 });
  }
  // Service pipes along the wall, straight and square; the one she came through at floor level.
  rg.rect(0, 170, 1000, 10).fill(0x1c202a);
  rg.rect(0, FLOOR - 70, 130, 70).fill(0x1a1d26);
  rg.ellipse(130, FLOOR - 35, 14, 35).fill(0x05050a);
  rg.ellipse(130, FLOOR - 35, 14, 35).stroke({ color: 0x2e3240, width: 4 });
  // The desk against the partition, its screen dead.
  const DESK = { x: 1600, y: 770, w: 300 };
  rg.rect(DESK.x, DESK.y, DESK.w, 14).fill(0x2a2e3a);
  rg.rect(DESK.x + 10, DESK.y + 14, 12, FLOOR - DESK.y - 14).fill(0x1a1d26);
  rg.rect(DESK.x + DESK.w - 22, DESK.y + 14, 12, FLOOR - DESK.y - 14).fill(0x1a1d26);
  rg.roundRect(DESK.x + 100, DESK.y - 160, 190, 150, 10).fill(0x22252e);
  rg.rect(DESK.x + 116, DESK.y - 146, 158, 116).fill(0x0a0c10);
  rg.poly([
    DESK.x + 120,
    DESK.y - 142,
    DESK.x + 170,
    DESK.y - 142,
    DESK.x + 130,
    DESK.y - 40,
    DESK.x + 120,
    DESK.y - 40,
  ]).fill({
    color: 0x8a96b0,
    alpha: 0.06,
  });
  rg.rect(DESK.x + 175, DESK.y - 10, 40, 10).fill(0x22252e);
  // Veins of root over the wall.
  const veins = c.batch(
    'veins',
    { glow: 0xd8d4dc, glowK: 0.4, swell: 0.03, sss: 0xd8c8d0, sssK: 0.1 },
    room.view,
  );
  for (let i = 0; i < 16; i++) {
    const up = i % 2 === 0;
    const x = 40 + rng() * 1860;
    branchRoot(veins, rng, {
      x,
      y: up ? FLOOR - 20 : 200,
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
  // Tissue softening the room's edges: the shelf fronts, the door frame, the sign (two folds over it).
  const soft = c.batch(
    'soft',
    {
      glow: 0xd8d4dc,
      glowK: 0.4,
      rim: 0x9aa8c8,
      rimK: 0.3,
      swell: 0.04,
      light: [0.7, 0.7],
      sss: 0xd8c8d0,
      sssK: 0.12,
    },
    room.view,
  );
  for (const [x0, x1, y] of [
    [296, 640, 428],
    [296, 640, 548],
    [56, 254, 460],
    [1000, 1940, 236],
    [1596, 1906, 768],
  ] as const) {
    const pts: Pt[] = [];
    for (let k = 0; k <= 16; k++) pts.push([x0 + ((x1 - x0) * k) / 16, y + Math.sin(k * 1.1 + x0) * 3]);
    soft.strip(pts, taper(9, 7, 0.6, rng()), { color: 0x6a6068, kind: 1, glow: 0.45, seed: rng() });
    curtain(rng, soft, x0, x1, y + 6, [8, 70], [2.5, 6], MOUTH.boneShadow, 0.4, [30, 80]);
  }
  for (const [a, b] of [
    [
      [250, 190],
      [430, 330],
    ],
    [
      [600, 196],
      [760, 300],
    ],
  ] as const)
    soft.strip(
      smoothPath([a as Pt, [(a[0] + b[0]) / 2 + 10, (a[1] + b[1]) / 2 + 26], b as Pt], 12),
      taper(18, 11, 0.5, rng()),
      {
        color: MOUTH.boneShadow,
        kind: 1,
        glow: 0.4,
        seed: rng(),
      },
    );
  soft.done();

  // --- The ceiling: one folded mass, lit from below by the dish.
  const ceil = c.shader('ceiling', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const lobes: [number, number, number, number][] = [
    [960, -60, 760, 250],
    [300, 40, 360, 200],
    [1620, 30, 400, 210],
    [40, 300, 110, 380],
    [1900, 300, 100, 360],
    [700, 150, 220, 110],
    [1220, 150, 240, 120],
    [960, 170, 160, 90],
  ];
  for (const [i, l] of lobes.entries()) ceil.p(i, ...l);
  ceil
    .p(8, D.x, D.y, 560, 0.006)
    .c(9, 0x6a6064)
    .c(10, 0x0a090e)
    .c(11, 0xb8b4c0)
    .c(12, 0x101018, 0.16)
    .p(13, 2000, 3, 1.3);

  // Lobes of the mass hang lower in places: folded tissue sagging into the room.
  const sag = c.shader('ceiling-sag', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const sags: [number, number, number, number][] = [
    [150, 260, 70, 200],
    [250, 230, 50, 110],
    [1180, 250, 60, 120],
    [1560, 270, 70, 230],
    [1640, 230, 50, 120],
    [1830, 280, 60, 270],
    [560, 220, 70, 70],
    [1360, 220, 60, 70],
  ];
  for (const [i, l] of sags.entries()) sag.p(i, ...l);
  sag
    .p(8, D.x, D.y, 560, 0.006)
    .c(9, 0x6a6064)
    .c(10, 0x0a090e)
    .c(11, 0xb8b4c0)
    .c(12, 0x101018, 0.16)
    .p(13, 2000, 3, 1.3);
  // --- Cold haze through the room, brightest round the dish.
  const haze = c.shader('haze', 0, 0, VIEW_W, VIEW_H, FOG, R);
  haze
    .c(0, 0x161a26, 0.45)
    .p(1, 700, 160, 0.004, 0.001)
    .p(2, 200, 480, 860, 980)
    .p(3, 0.3, 0.85, 0.3, 0.3)
    .p(5, D.x, D.y - 40, 380, 0.9)
    .c(6, 0x5a6478);

  // --- The dish on its pedestal of tissue, under its dome.
  const mid = c.plane('mid', {
    fog: 0x10121c,
    fogK: 0.04,
    amb: 0xc0c8dc,
    sat: 0.7,
    mottle: 0.16,
    mottleScale: 150,
    lit: 1.1,
    seed: 2,
    edge: [8, 0.04, 0.1, 0],
    rimLights: 0.8,
    rimW: 3,
    brush: [0.08, 30, 1.57, 5],
  });
  const tissue = c.batch(
    'tissue',
    {
      glow: 0xd8d4dc,
      glowK: 0.45,
      rim: 0x9aa8c8,
      rimK: 0.3,
      swell: 0.04,
      light: [0, -1],
      sss: 0xd8d0e0,
      sssK: 0.14,
    },
    mid.view,
  );
  spread(rng, tissue, D.x, FLOOR + 4, 12, [140, 460], [5, 12], MOUTH.boneMoon, 0.5);
  tissue.done();
  // The pedestal: folded tissue heaped up from the floor into a column under the dish, the same
  // flesh as the ceiling, lit from above.
  const ped = c.shader('pedestal', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, mid.view);
  const pl: [number, number, number, number][] = [
    [D.x, FLOOR - 16, 230, 46],
    [D.x - 70, FLOOR - 70, 130, 70],
    [D.x + 60, FLOOR - 96, 120, 84],
    [D.x - 10, D.y + 140, 110, 90],
    [D.x + 10, D.y + 92, 170, 40],
    [D.x + 170, FLOOR - 24, 130, 34],
    [D.x - 180, FLOOR - 18, 120, 30],
    [D.x - 20, FLOOR - 170, 96, 70],
  ];
  for (const [i, l] of pl.entries()) ped.p(i, ...l);
  ped
    .p(8, D.x, D.y + 20, 260, 0.008)
    .c(9, 0x8a7e86)
    .c(10, 0x0c0b10)
    .c(11, 0xc8ccdc)
    .c(12, 0x14141c, 0.1)
    .p(13, FLOOR + 30, 3, 2.2);
  // The dome: tissue grown over the dish, lit through from inside. Its back half first (behind the
  // dish, its inside lit), then its front, torn open at the top where the lid and its hand show.
  const domeAt = (name: string, front: boolean) => {
    const ox = D.x - 320;
    const oy = D.y - 350;
    const d = c.shader(name, ox, oy, 640, 480, DOME, R);
    d.p(0, D.x - ox, D.y + 70 - oy, 256, 300)
      .p(1, 46, 3.4, 2.9, 1)
      .p(2, D.x - 30 - ox, D.y - 22 - oy, front ? 84 : 0, 0.9)
      .p(3, D.x - ox, D.y - 10 - oy, front ? 220 : 240, front ? 0.8 : 0.85)
      .c(4, 0xd8e0f0)
      .c(5, front ? 0x8a8090 : 0x5a5466)
      .c(6, 0xb07888, 0.75)
      .c(7, 0xc8d4ec, front ? 0.3 : 0)
      .p(8, D.y + 100 - oy, 46, 0.7)
      .p(9, front ? 1 : 0);
    return d;
  };
  // The dish: dark glass bottom, the cloud, the glass and its dusty lid, the cracks, the hand.
  const dishG = new Graphics();
  mid.view.addChild(dishG);
  dishG.ellipse(D.x, D.y + 30, D.rx + 6, D.ry + 8).fill(0x1a1c24);
  dishG.rect(D.x - D.rx - 6, D.y + 4, (D.rx + 6) * 2, 26).fill(0x1a1c24);
  dishG.ellipse(D.x, D.y + 4, D.rx + 6, D.ry + 4).fill(0x14161e);
  dishG.ellipse(D.x, D.y + 10, D.rx, D.ry).fill(0x08090e);

  // Lit things above the plane filter (their light must not be dimmed with the room).
  domeAt('dome-back', false);
  const cloud = c.shader('dish-cloud', D.x - D.rx, D.y - D.ry, D.rx * 2, D.ry * 2 + 20, DISH, R);
  cloud
    .p(0, D.rx, D.ry + 10, D.rx * 0.94, D.ry * 0.9)
    .c(1, 0xc8ccd8, 1.25)
    .p(2, 0.3, 1);
  cloud.mesh.blendMode = 'add';
  const glass = new Graphics();
  R.addChild(glass);
  glass.ellipse(D.x, D.y + 14, D.rx + 4, D.ry + 4).stroke({ color: 0x9aa4b8, width: 2, alpha: 0.35 });
  glass.rect(D.x - D.rx - 6, D.y + 2, 3, 28).fill({ color: 0xc8d0e0, alpha: 0.35 });
  glass.rect(D.x + D.rx + 3, D.y + 2, 3, 28).fill({ color: 0xc8d0e0, alpha: 0.25 });
  glass.ellipse(D.x, D.y - 4, D.rx + 8, D.ry + 4).fill({ color: 0x8a94a8, alpha: 0.1 });
  glass.ellipse(D.x, D.y - 4, D.rx + 8, D.ry + 4).stroke({ color: 0xc8d0e0, width: 2, alpha: 0.45 });
  glass.ellipse(D.x, D.y - 4, D.rx + 2, D.ry).fill({ color: 0xa8acb8, alpha: 0.16 });
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
      .fill({ color: 0xa8aab0, alpha: 0.035 });
  }
  const hp = new Graphics();
  hand(hp, 0x05060c, 0.5);
  const hp2 = new Graphics();
  hand(hp2, 0x05060c, 0.3);
  hp2.scale.set(1.08);
  const handC = new Container();
  handC.addChild(hp2, hp);
  handC.position.set(D.x - 40, D.y + 6);
  handC.scale.set(1.2, 0.46);
  handC.rotation = -0.1;
  R.addChild(handC);
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
  crack(D.x + 30, D.y - 10, -0.3, 8);
  crack(D.x + 30, D.y - 10, 2.6, 5);
  crack(D.x + 66, D.y - 18, 0.6, 4);
  cr.stroke({ color: 0xe0e8f4, width: 1.3, alpha: 0.55 });
  R.addChild(cr);
  domeAt('dome', true);
  // Fibres the tear left spanning it: thin strands, sagging, lit by the dish.
  const fibres = c.batch(
    'tear-fibres',
    { glow: 0xd8e0f0, glowK: 0.6, rim: 0xc8d4ec, rimK: 0.4, swell: 0.02 },
    R,
  );
  for (let k = 0; k < 4; k++) {
    const a0 = Math.PI * (0.65 + rng() * 0.7);
    const a1 = a0 + Math.PI * (0.6 + rng() * 0.5);
    const hx = D.x - 30;
    const hy = D.y - 22;
    const p0: Pt = [hx + Math.cos(a0) * 126, hy + Math.sin(a0) * 78];
    const p1: Pt = [hx + Math.cos(a1) * 126, hy + Math.sin(a1) * 78];
    const sag = 30 + rng() * 40;
    fibres.strip(
      smoothPath([p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + sag], p1], 10),
      (t) => 0.8 + 1.4 * Math.abs(t - 0.5) * 2,
      { color: 0x6a6670, kind: 4, glow: 0.3, seed: rng() },
    );
  }
  fibres.done();
  // Light out of the tear, up into the dust; the glow round the whole dome.
  const up = c.shader('up-beam', 0, 0, VIEW_W, VIEW_H, BEAM, R);
  up.c(0, COLD, 0.07)
    .p(1, D.x - 30, VIEW_H - (D.y - 30), 0.75, 900)
    .p(2, 0.7, 0.03);
  up.mesh.blendMode = 'add';
  up.mesh.scale.y = -1;
  up.mesh.position.y = VIEW_H;
  const dishGlow = new Container();
  dishGlow.blendMode = 'add';
  R.addChild(dishGlow);
  const dg1 = glow(D.x, D.y - 60, 420, 0x7a86a0, 0.22);
  const dg2 = glow(D.x - 20, D.y - 40, 180, COLD, 0.24);
  dishGlow.addChild(dg1, dg2);
  // The floor holds a little of it.
  const wet = c.shader('floor-sheen', 0, 0, VIEW_W, VIEW_H, REFLECT, R);
  wet
    .p(0, D.x, 260, 0.14, 160)
    .p(1, CHAIR.x + 60, 120, 0.05, 90)
    .c(7, 0x9aa0b8)
    .c(6, COLD)
    .p(12, FLOOR + 6, 0.3, 0.2)
    .c(13, 0x30384a);
  wet.mesh.blendMode = 'add';

  // --- The maker: in her chair, head bowed toward the dish, under silk; her coat, her torch, the jars.
  const near = c.plane('near', {
    fog: 0x0c0e18,
    fogK: 0.03,
    mottle: 0.12,
    mottleScale: 140,
    lit: 1,
    seed: 3,
    edge: [6, 0.03, 0.06, 0],
    rimLights: 0.9,
    rimW: 3,
    brush: [0.06, 24, 1.57, 4],
  });
  const chairG = new Graphics();
  near.view.addChild(chairG);
  const steel = 0x1c1f28;
  // Chair: the legs show below the hem; the back's top shows behind her shoulders.
  for (const x of [CHAIR.x + 20, CHAIR.x + 170])
    chairG.rect(x, CHAIR.y + 10, 9, FLOOR - CHAIR.y - 10).fill(steel);
  chairG.rect(CHAIR.x + 186, CHAIR.y - 260, 10, 270).fill(steel);
  chairG.rect(CHAIR.x + 150, CHAIR.y - 268, 70, 14).fill(steel);
  // Her: a seated figure under a fall of silk, head bowed toward the dish. Painted, not modelled:
  // one silhouette lit from the dish's side, folds falling from the shoulders and knees to the floor.
  const maker = c.plane('maker', {
    fog: 0x0c0e18,
    fogK: 0.04,
    mottle: 0.14,
    mottleScale: 120,
    lit: 0.5,
    seed: 8,
    edge: [10, 0.05, 0.12, 0],
    rimLights: 2.2,
    rimW: 5,
    blur: 0.5,
    brush: [0.1, 40, 1.57, 6],
    paint: 3,
  });
  const silk = new Graphics();
  maker.view.addChild(silk);
  const X = CHAIR.x;
  // Seated, facing the dish: the back rounded, the head bowed below the shoulders, the knees forward,
  // the silk falling from the head and back to the floor behind the chair and from the knees in front.
  const fig: Pt[] = smoothPath(
    [
      [X + 186, 806],
      [X + 198, 760],
      [X + 192, 700],
      [X + 180, 640],
      [X + 166, 590],
      [X + 128, 560],
      [X + 92, 566],
      [X + 68, 594],
      [X + 50, 590],
      [X + 26, 586],
      [X + 2, 596],
      [X - 18, 618],
      [X - 26, 642],
      [X - 16, 662],
      [X - 2, 674],
      [X - 6, 696],
      [X - 24, 712],
      [X - 62, 718],
      [X - 92, 738],
      [X - 90, 790],
      [X - 84, 860],
      [X - 104, FLOOR + 3],
      [X - 18, FLOOR + 3],
      [X - 26, 860],
      [X - 16, 806],
      [X + 30, 796],
      [X + 110, 808],
    ],
    7,
  );
  silk.poly(fig.flat()).fill(
    hgrad([
      [0, 0x464856],
      [0.25, 0x2c2e3a],
      [0.6, 0x1a1c24],
      [1, 0x0e0f14],
    ]),
  );
  // The hood over the bowed head: its crown catching the dish, the shadow where her face is.
  silk.poly(blob(rng, X - 12, 648, 11, 16, 0.3, 12).flat()).fill({ color: 0x08090e, alpha: 0.5 });
  // The shoulder's line and the curve of her back under the silk.
  silk
    .moveTo(X + 150, 590)
    .quadraticCurveTo(X + 110, 610, X + 50, 646)
    .stroke({ color: 0x0e0f16, width: 6, alpha: 0.35, cap: 'round' });
  // Folds: from the back and the knees to the floor.
  const fold = (x0: number, y0: number, x1: number, y1: number, w: number, color: number, a: number) => {
    const mx = (x0 + x1) / 2 + (rng() - 0.5) * 16;
    silk
      .moveTo(x0, y0)
      .quadraticCurveTo(mx, (y0 + y1) / 2, x1, y1)
      .stroke({ color, width: w, alpha: a, cap: 'round' });
  };
  for (let i = 0; i < 4; i++) {
    const x0 = X - 84 + i * 18 + rng() * 8;
    fold(
      x0,
      744 + rng() * 20,
      x0 - 10 + rng() * 8,
      FLOOR,
      4 + rng() * 7,
      i % 2 ? 0x8a8ea0 : 0x0e0f14,
      0.14 + rng() * 0.1,
    );
  }
  for (let i = 0; i < 5; i++) {
    const x0 = X + 110 + i * 16 + rng() * 8;
    fold(
      x0,
      612 + i * 14,
      x0 + 8 + i * 3,
      800,
      5 + rng() * 8,
      i % 2 ? 0x7a7e92 : 0x0e0f14,
      0.12 + rng() * 0.1,
    );
  }
  // The hem pooled at her feet.
  silk.poly(blob(rng, X - 60, FLOOR + 4, 60, 8, 0.3, 20).flat()).fill({ color: 0x2a2c36, alpha: 0.9 });
  // Her arm, out of the silk: the sleeve from the shoulder to the elbow on her knee, the forearm
  // reaching toward the dish, the silk hanging from it in one fold.
  const arm = smoothPath(
    [
      [X + 40, 646],
      [X - 10, 684],
      [X - 60, 700],
      [X - 120, 680],
      [X - 170, 664],
    ],
    10,
  );
  {
    const L: number[] = [];
    const Rt: number[] = [];
    for (let k = 0; k < arm.length; k++) {
      const p = arm[k]!;
      const q = arm[Math.min(arm.length - 1, k + 1)]!;
      const o = arm[Math.max(0, k - 1)]!;
      const tx = q[0] - o[0];
      const ty = q[1] - o[1];
      const tl = Math.hypot(tx, ty) || 1;
      const w = 22 - 12 * (k / (arm.length - 1));
      L.push(p[0] - (ty / tl) * w, p[1] + (tx / tl) * w);
      Rt.push(p[0] + (ty / tl) * w, p[1] - (tx / tl) * w);
    }
    const pts = [...L];
    for (let k = Rt.length - 2; k >= 0; k -= 2) pts.push(Rt[k]!, Rt[k + 1]!);
    // The fold of silk hanging from the forearm toward her knees.
    silk.poly([X - 150, 676, X - 70, 712, X - 66, 756, X - 112, 736]).fill({ color: 0x2a2c38, alpha: 0.85 });
    silk.poly(pts).fill(
      hgrad([
        [0, 0x6a6c7c],
        [1, 0x2a2c38],
      ]),
    );
  }
  // The hand: bare, open, reaching for the dish; the same hand as the print on its lid.
  const reach = new Graphics();
  hand(reach, 0x787c8e, 1);
  reach.position.set(X - 186, 662);
  reach.rotation = -Math.PI / 2 - 0.12;
  reach.scale.set(0.42, 0.5);
  maker.view.addChild(reach);
  const reachShade = new Graphics();
  hand(reachShade, 0x2a2c38, 0.5);
  reachShade.position.set(X - 184, 668);
  reachShade.rotation = -Math.PI / 2 - 0.12;
  reachShade.scale.set(0.42, 0.42);
  maker.view.addChildAt(reachShade, maker.view.children.length - 1);
  // Her coat on the floor at her feet: fallen in folds, one sleeve out toward the dish.
  const coatG = new Graphics();
  maker.view.addChild(coatG);
  const cx0 = X - 170;
  coatG
    .poly(
      blob(rng, cx0, FLOOR - 10, 110, 22, 0.25, 30).flatMap(([x, y]) => [x, Math.min(y, FLOOR + 6)] as Pt),
    )
    .fill(
      hgrad([
        [0, 0x5e6270],
        [1, 0x262834],
      ]),
    );
  coatG
    .poly([cx0 - 70, FLOOR - 8, cx0 - 150, FLOOR - 2, cx0 - 160, FLOOR + 6, cx0 - 60, FLOOR + 4])
    .fill(0x4a4e5a);
  coatG
    .poly([cx0 + 20, FLOOR - 22, cx0 + 60, FLOOR - 26, cx0 + 50, FLOOR - 12])
    .fill({ color: 0x3a3e4a, alpha: 0.6 });
  for (let i = 0; i < 6; i++) {
    const x = cx0 - 70 + i * 26 + rng() * 10;
    coatG
      .moveTo(x, FLOOR - 16 + rng() * 6)
      .quadraticCurveTo(x + 10, FLOOR - 6, x + 4, FLOOR + 4)
      .stroke({ color: 0x2a2c36, width: 2, alpha: 0.4 });
  }
  // Her torch, dead, rolled against the coat; the jars she brought, lids on, never opened.
  const things = new Graphics();
  maker.view.addChild(things);
  {
    const tx = CHAIR.x - 420;
    const ty = FLOOR - 9;
    things.roundRect(tx, ty - 9, 64, 18, 6).fill(0x2a2c36);
    things.rect(tx + 10, ty - 9, 3, 18).fill({ color: 0x4a4e5c, alpha: 0.8 });
    things.poly([tx + 64, ty - 12, tx + 84, ty - 14, tx + 84, ty + 14, tx + 64, ty + 12]).fill(0x343846);
    things.ellipse(tx + 84, ty, 4, 14).fill(0x1a1e28);
    things.ellipse(tx + 84, ty, 3, 10).fill({ color: 0x8a96b0, alpha: 0.25 });
    things.rect(tx + 4, ty - 8, 56, 2).fill({ color: 0xc8d0e0, alpha: 0.2 });
  }
  jar(things, CHAIR.x - 150, FLOOR, 58, 0.7);
  jar(things, CHAIR.x - 108, FLOOR + 2, 52, 0.6);
  jar(things, CHAIR.x - 128, FLOOR + 10, 50, 0.8);
  // The oldest stalk: worn smooth, from the dish's pedestal along the floor to her chair.
  const stalk = c.batch(
    'stalk',
    { glow: 0xd8d4dc, glowK: 0.35, rim: 0x9aa8c8, rimK: 0.3, light: [-0.8, -0.5] },
    near.view,
  );
  stalk.strip(
    smoothPath(
      [
        [D.x + 90, FLOOR - 40],
        [D.x + 200, FLOOR - 4],
        [1180, FLOOR + 4],
        [1340, FLOOR + 2],
        [CHAIR.x + 20, CHAIR.y + 40],
      ],
      16,
    ),
    taper(12, 8, 0.15, 0.3),
    { color: 0x4a4450, kind: 4, glow: 0.3, seed: 0.3 },
  );
  stalk.done();

  // --- Umber, tiny, by the pipe she came in through.
  const HX = 230;
  const hero = c.addHero({ x: HX, y: FLOOR + 2, scale: 0.72, pose: 'stand', facing: 1 }, R);
  const her = new Container();
  her.blendMode = 'add';
  R.addChild(her);
  const herPool = glow(HX, FLOOR + 2, 130, WARM.gold, 0.24);
  const herHalo = glow(HX, FLOOR - 40, 60, WARM.key, 0.12);
  her.addChild(herPool, herHalo);

  // Moths at the dish: pale, slow, circling the only light in the room.
  moths(c, rng, R, {
    x: D.x - 20,
    y: D.y - 150,
    rx: 240,
    ry: 110,
    count: 5,
    size: [10, 18],
    color: 0xc8d0e0,
    alpha: 0.7,
  });

  // --- Air: dust hanging in the dish's light.
  c.mote(
    rng,
    {
      count: 110,
      x: D.x - 420,
      y: 120,
      w: 840,
      h: 720,
      vx: 1,
      vy: -1.5,
      wobble: 8,
      size: [2, 6],
      alpha: [0.05, 0.32],
      color: [0xc8d0e0, 0xa8b0c4],
      twinkle: 0.5,
    },
    R,
  );

  // --- Foreground: a hanging fold of tissue at the left edge and a bench corner at the right, out of focus.
  const fg = c.plane('fg', {
    fog: 0x030308,
    fogK: 0.25,
    mottle: 0.1,
    blur: 12,
    lit: 0.35,
    seed: 4,
    rimLights: 0.5,
    rimW: 8,
  });
  const fgG = new Graphics();
  fg.view.addChild(fgG);
  fgG.poly([1560, 980, 1980, 960, 1980, 1000, 1560, 1012]).fill(0x0c0d12);
  fgG.rect(1610, 1010, 24, 90).fill(0x0c0d12);
  fgG.poly(blob(rng, 40, 1100, 300, 120, 0.2, 30).flat()).fill(0x05050a);
  const fgT = c.batch(
    'fg-tissue',
    { glow: 0xd8d4dc, glowK: 0.15, rim: 0x6a76a0, rimK: 0.3, swell: 0.05 },
    fg.view,
  );
  fgT.strip(
    smoothPath(
      [
        [40, -40],
        [70, 200],
        [50, 420],
        [90, 600],
      ],
      14,
    ),
    (t) => 60 * (1 - 0.5 * t) * (t > 0.9 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.9) / 0.1) ** 2)) : 1) + 2,
    { color: 0x2c2a32, kind: 1, glow: 0.2, seed: 0.3 },
  );
  fgT.strip(
    smoothPath(
      [
        [-30, -20],
        [-10, 260],
        [-20, 760],
      ],
      14,
    ),
    () => 50,
    { color: 0x221f28, kind: 1, glow: 0.15, seed: 0.6 },
  );
  fgT.done();

  // --- Light: the dish, cold, breathing, a catch of static now and then; and Umber.
  const dl = c.light({ x: D.x - 20, y: D.y - 40, radius: 900, color: COLD, intensity: 0.7, scatter: 0.35 });
  const L = c.light({ x: 0, y: 0, radius: 200, color: WARM.gold, intensity: 0.8, scatter: 0.5 });
  c.on((t, b) => {
    const st = Math.sin(t * 17) * Math.sin(t * 5.3) > 0.9 ? 0.8 : 1;
    dl.intensity = (0.5 + 0.3 * b) * st;
    dg1.alpha = (0.16 + 0.1 * b) * st;
    dg2.alpha = (0.14 + 0.12 * b) * st;
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
    'The palette breaks on purpose: straight lines softened by tissue, one cold light (the dish under its dome). HEARTH on the sign; the maker under silk with her coat, torch and unopened jars. Can it carry the midpoint without words?',
  build,
};
export default frame;
