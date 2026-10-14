// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 5. The summit (and the title over it): the world from high as what the two of them see. The v1
 * world-from-high set (world.ts: the land shader, the folded mountain) re-angled: behind them, two
 * small moths on a twig in the bottom-left foreground, out past the crown the whole dark land.
 * Every town is dark. The mountain breathes on the horizon in the breath's rhythm. Pale root fans
 * across the land toward the wood, its front a line of steam just beyond the forest's edge. Down
 * in the dark canopy one small pale point (the fox's case) and a faint pale line from it out to
 * the root's front. Above the twig the dance turns.
 *
 * Sorrel looks up at the dance; Wing looks down at the pale point and out along the line. The
 * silver-edged moth circles him once. She holds the glint out to him; he folds her hands back over
 * it with his wing, taps her wingtip and lifts off into the dance. She stays, the glint lighting her.
 * `bt` is the summit's own clock; the title beat keeps the last frame (`bt` >= 25).
 */
import { Container, Graphics } from 'pixi.js';
import { MOUNTAIN } from '../world/bodies';
import type { Composer } from '../world/compose';
import { VIEW_H, VIEW_W } from '../world/layer';
import { glow } from '../world/paint';
import { SUMMIT } from './script';
import { envelope, window01 } from './track';
import { CURVE, E, F, H, LAND, PAD_X, PAD_Y, project } from './world';

/** The pale point (the case) in the canopy, and where its line meets the root's front. */
const POINT = { x: 1130, y: 965 };
const FRONT = { x: 1230, y: 768 };
/** The twig's tip where they sit (against the glow along the horizon). */
const TWIG = { x: 540, y: 452 };
/** The mountain, far: on the horizon, small. */
const FAR = { x: 0.2, z: 60 };

/** A small moth in silhouette sitting on a branch: feet at (0, 0), facing +x. `up` lifts the head (-1 looks down). */
function sittingMoth(g: Graphics, rim: number, up: number, open: number): void {
  const ink = 0x05060a;
  // Folded wings: a tent over the back; opening (for flight) they spread up.
  const wa = -0.2 - 1.1 * open;
  for (const side of [-1, 1]) {
    const tip = [-14 + 6 * open, -10 - 16 * open * (side < 0 ? 1 : 0.8)] as const;
    g.poly([-2, -16, tip[0], tip[1], -10 + Math.cos(wa) * 4, -2 + side * open * 3, 2, -6]).fill(ink);
  }
  g.ellipse(0, -11, 4, 8).fill(ink);
  // Head and antennae.
  const hx = 4 + 1.5 * up;
  const hy = -21 - 2 * up;
  g.circle(hx, hy, 4).fill(ink);
  g.moveTo(hx + 1, hy - 3)
    .quadraticCurveTo(hx + 4 + 2 * up, hy - 12 - 4 * up, hx + 10 + 3 * up, hy - 14 - 6 * up)
    .stroke({ color: ink, width: 1.2 });
  g.moveTo(hx - 1, hy - 3)
    .quadraticCurveTo(hx + 1, hy - 13 - 4 * up, hx + 5, hy - 17 - 6 * up)
    .stroke({ color: ink, width: 1.2 });
  // A thin rim of light on the edge facing the land (the mountain's pale, or her glint's amber).
  g.moveTo(3, -17).quadraticCurveTo(5, -11, 2, -4).stroke({ color: rim, width: 0.7, alpha: 0.45 });
}

export function buildSummit(c: Composer): (t: number) => void {
  c.grade = {
    shadow: 0x050812,
    shadowK: 0.02,
    deep: 0x010205,
    deepK: 0.82,
    saturation: 1.05,
    contrast: 1.08,
    grain: 0.026,
    vignette: 0.3,
    vignetteSoft: 0.6,
    bloom: [0.42, 0.8, 0.7],
  };
  const R = c.root;
  const view = new Container();
  R.addChild(view);
  const pulse = (t: number): number => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 5);
  const camX = 0.35;
  // --- The land: no towns, the root's front stopped just short of the wood.
  const land = c.shader('land', -PAD_X, -PAD_Y, VIEW_W + 2 * PAD_X, VIEW_H + 2 * PAD_Y, LAND, view);
  land.pulse = pulse;
  const mp = project(FAR.x, FAR.z, camX);
  // The root has come all the way from the mountain and stopped just short of the wood.
  // (The veins are drawn about where it starts: a source past the middle distance keeps them fine.)
  land.p(0, H, CURVE, F, camX).p(1, FAR.x, 26, 20.5, 1.25).p(2, 0, 3, mp.x, E);
  // --- The mountain on the horizon, breathing.
  const MW = 1200;
  const MH = 560;
  const mtn = c.shader('mountain', 0, 0, MW, MH, MOUNTAIN, view);
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
  const MS = 0.24;
  for (const [i, [x, y, rx, ry]] of lobes.entries())
    mtn.p(i, foot.x + x * MS, foot.y + y * MS, rx * MS, ry * MS);
  mtn
    .p(8, foot.x, foot.y - 12, 50, 0.012)
    .c(9, 0x625c64)
    .c(10, 0x0c0e18)
    .c(11, 0xd8d0cc)
    .c(12, 0x121824, 0.22)
    .p(13, foot.y + 6, 3, 1.7);
  mtn.mesh.position.set(mp.x - foot.x, mp.y - foot.y + 8);
  const core = new Container();
  core.blendMode = 'add';
  view.addChild(core);
  const coreA = glow(mp.x, mp.y - 10, 10, 0xe8e2dc, 0.6);
  const coreB = glow(mp.x, mp.y - 10, 70, 0xa8a4b0, 0.2);
  core.addChild(coreB, coreA);
  // --- The wood below them: a dark canopy, the pale point in it, the line out to the front.
  const wood = new Graphics();
  view.addChild(wood);
  const crowns: number[] = [];
  for (let x = -40; x <= VIEW_W + 40; x += 8) {
    const k = x / VIEW_W;
    // Rounded tree crowns: bumps of a few widths, on a slow swell.
    const bump = 30 * Math.abs(Math.sin(x * 0.012)) ** 0.6 + 14 * Math.abs(Math.sin(x * 0.031 + 1)) ** 0.7;
    crowns.push(x, 880 - 60 * Math.sin(k * 3.1 + 0.4) - bump);
  }
  wood.poly([...crowns, VIEW_W + 40, VIEW_H + 20, -40, VIEW_H + 20]).fill(0x03070a);
  wood.moveTo(crowns[0]!, crowns[1]!);
  for (let i = 2; i < crowns.length; i += 2) wood.lineTo(crowns[i]!, crowns[i + 1]!);
  wood.stroke({ color: 0x223040, width: 1.5, alpha: 0.5 });
  const line = new Graphics();
  view.addChild(line);
  const point = new Container();
  point.blendMode = 'add';
  view.addChild(point);
  const pA = glow(POINT.x, POINT.y, 7, 0xe8e2dc, 0.9);
  const pB = glow(POINT.x, POINT.y, 40, 0xb8b0b8, 0.25);
  point.addChild(pB, pA);
  // --- The twig in the foreground, bottom left; the two of them on it.
  const twig = new Graphics();
  view.addChild(twig);
  twig
    .moveTo(-60, VIEW_H + 40)
    .bezierCurveTo(60, 820, 300, 560, TWIG.x + 90, TWIG.y + 6)
    .stroke({ color: 0x020305, width: 30, cap: 'round' });
  twig
    .moveTo(TWIG.x - 160, TWIG.y + 60)
    .quadraticCurveTo(TWIG.x - 60, TWIG.y + 10, TWIG.x + 120, TWIG.y + 2)
    .stroke({ color: 0x020305, width: 6, cap: 'round' });
  for (const [x, y, a] of [
    [TWIG.x - 220, TWIG.y + 90, -0.6],
    [TWIG.x + 60, TWIG.y - 2, -1.2],
  ] as const) {
    twig
      .poly([
        x,
        y,
        x + Math.cos(a) * 60 - 12,
        y + Math.sin(a) * 60,
        x + Math.cos(a) * 70,
        y + Math.sin(a) * 70 - 6,
      ])
      .fill(0x03050a);
  }
  const wing = new Graphics();
  const sorrel = new Graphics();
  view.addChild(wing, sorrel);
  const glint = new Container();
  glint.blendMode = 'add';
  view.addChild(glint);
  const gA = glow(0, 0, 5, 0xfff1d4, 1);
  const gB = glow(0, 0, 40, 0xffb36b, 0.5);
  glint.addChild(gB, gA);
  // --- The dance above the twig, one silver-edged moth in it.
  const D = { x: 640, y: 200, rx: 120, ry: 26 };
  const flecks: Container[] = [];
  for (let i = 0; i < 16; i++) {
    const f = new Container();
    const w = new Graphics();
    const silver = i === 3;
    for (const side of [-1, 1])
      w.poly([0, 0, side * 5, -3, side * 4, 1.5]).fill({ color: silver ? 0x2a2838 : 0xe8dcc8, alpha: 0.95 });
    if (silver)
      for (const side of [-1, 1])
        w.poly([0, 0, side * 5, -3, side * 4, 1.5]).stroke({ color: 0xeef2ff, width: 1 });
    f.addChild(glow(0, 0, 9, silver ? 0xdfe8ff : 0xffd9a0, 0.5), w);
    view.addChild(f);
    flecks.push(f);
  }

  return (t: number) => {
    const S = SUMMIT;
    const b = pulse(t);
    coreA.alpha = 0.35 + 0.45 * b;
    coreB.alpha = 0.12 + 0.12 * b;
    pA.alpha = 0.6 + 0.3 * b;
    // The line from the point out to the root's front, faint, breathing with the mountain.
    line.clear();
    line.moveTo(POINT.x, POINT.y);
    for (let i = 1; i <= 20; i++) {
      const u = i / 20;
      line.lineTo(POINT.x + (FRONT.x - POINT.x) * u + Math.sin(u * 7) * 8, POINT.y + (FRONT.y - POINT.y) * u);
    }
    line.stroke({ color: 0xd9cfc4, width: 1.2, alpha: 0.18 + 0.14 * b });
    // The two of them.
    const bt = Math.min(t, 25);
    const looks = window01(bt, S.looks[0], S.looks[0] + 1.2);
    const lift = window01(bt, S.lift[0], S.lift[1]);
    // She: looks down at the point, then out along the line to the mountain; holds the glint out; it lights her.
    wing.clear();
    const down = looks * (1 - window01(bt, S.looks[0] + 2, S.looks[1]) * 0.6);
    sittingMoth(wing, bt > S.offer[0] ? 0xffb36b : 0xc8c0d0, -down, 0);
    wing.position.set(TWIG.x, TWIG.y);
    wing.scale.set(2.1);
    // He: looks up at the dance; turns to go; lifts off into it and does not look back.
    sorrel.clear();
    const sx = TWIG.x + 70 + 20 * lift + Math.sin(lift * 5) * 6;
    const sy = TWIG.y - 2 - lift * (TWIG.y - D.y - 10);
    sittingMoth(
      sorrel,
      0xd8c8e8,
      lift > 0 ? 0.6 : looks,
      Math.min(1, lift * 3) * (0.5 + 0.5 * Math.abs(Math.sin(t * 30))),
    );
    sorrel.position.set(sx, sy);
    sorrel.scale.set(2.1 * (1 - 0.45 * lift));
    // The glint: in her hands; held out to him; folded back; alone, it lights her.
    const out = envelope(bt, S.offer[0], S.offer[1], S.foldBack[0], S.foldBack[1]);
    glint.position.set(TWIG.x + 18 + 36 * out, TWIG.y - 26 - 4 * out);
    const lit = window01(bt, S.alone[0], S.alone[0] + 1.5);
    glint.alpha = (0.3 + 0.4 * out + 0.6 * lit) * window01(bt, 0.5, 1.5);
    glint.scale.set(0.8 + 0.5 * lit);
    // The dance; the silver one circles him once.
    for (const [i, f] of flecks.entries()) {
      const a = t * (0.4 + (i % 4) * 0.05) + (i / flecks.length) * Math.PI * 2;
      let x = D.x + Math.cos(a) * D.rx * (0.8 + (i % 3) * 0.12);
      let y = D.y + Math.sin(a) * D.ry;
      if (i === 3) {
        const k = envelope(bt, S.silver[0], S.silver[0] + 0.5, S.silver[1] - 0.5, S.silver[1]);
        const u = window01(bt, S.silver[0], S.silver[1]) * Math.PI * 2;
        x += (TWIG.x + 40 + Math.cos(u) * 40 - x) * k;
        y += (TWIG.y - 30 + Math.sin(u) * 22 - y) * k;
      }
      f.position.set(x, y);
      f.scale.y = 0.4 + 0.6 * Math.abs(Math.sin(t * (11 + (i % 3)) + i));
    }
    view.alpha = window01(t, S.fadeIn[0], S.fadeIn[1]);
  };
}
