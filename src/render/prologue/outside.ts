// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * The end of shot 4 (83.6-89.2 s): her eyes go past the glint, past the last trunks, and outside
 * the Grove pale root lies in the frost a few metres from the trees, steaming quietly. Far off on
 * the horizon the mountain breathes on shot 1's rhythm. The title, faint, in the sky above it.
 *
 * Depth, back to front: the night sky; the mountain, small; the frosted land to the horizon with
 * fog on it; the root crossing it toward the trees (thin far off, fat near), steam rising off it;
 * the Grove's last trunks on the left, a little warm light at their feet; dark ferns in front.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { prng } from '../scene/lib/look';
import { FOG, MOUNTAIN, SKY, STEAM } from '../world/bodies';
import type { Composer } from '../world/compose';
import { fern, MOUTH, mixHex, WARM } from '../world/kit';
import { VIEW_H, VIEW_W } from '../world/layer';
import { blob, glow, vgrad } from '../world/paint';
import type { Pt } from '../world/tissue';
import { COCOONS } from './script';
import { window01 } from './track';

const HORIZON = 700;
/** The game's title (docs/story/locked.md: "Wing: The Kept World", 2026-10-14). */
export const TITLE = { word: 'WING', sub: 'THE KEPT WORLD' } as const;
/** Where the mountain (and the title over it) stands in the plate, screen x. */
export const MOUNTAIN_X = 1300;

/**
 * The title, faint: two lines of serif in pale bone with a soft glow. Not part of the plate (the
 * plate is mirrored to the way she looks; the words must not be).
 */
export function titleCard(): Container {
  const title = new Container();
  const word = new Text({
    text: TITLE.word,
    style: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 72,
      letterSpacing: 34,
      fill: 0xe0d8d0,
      dropShadow: { color: 0xc8c0d8, alpha: 0.55, blur: 16, distance: 0, angle: 0 },
    },
  });
  word.anchor.set(0.5);
  const sub = new Text({
    text: TITLE.sub,
    style: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: 22,
      letterSpacing: 12,
      fill: 0xc8c0c8,
    },
  });
  sub.anchor.set(0.5);
  sub.position.set(0, 66);
  title.addChild(word, sub);
  return title;
}
/** The edge of the trees, screen x: the root stops short of it. */
const TREES = 560;

export function buildOutside(c: Composer): (t: number) => void {
  const rng = prng(9090);
  c.grade = {
    shadow: 0x080a1c,
    shadowK: 0.03,
    deep: 0x020309,
    deepK: 0.8,
    saturation: 1.05,
    contrast: 1.1,
    grain: 0.026,
    vignette: 0.28,
    vignetteSoft: 0.6,
    bloom: [0.5, 0.7, 0.6],
  };
  const R = c.root;
  const view = new Container();
  R.addChild(view);
  const pulse = (t: number): number => 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 5);
  const MX = MOUNTAIN_X;

  // --- Sky: cold violet night, a pale breath on the horizon over the mountain.
  const sky = c.shader('sky', -80, 0, VIEW_W + 160, VIEW_H, SKY, view);
  sky
    .c(0, 0x04050f)
    .c(1, 0x0a0c22)
    .c(2, 0x22223c)
    .p(3, HORIZON, 0.8)
    .p(4, MX + 80, HORIZON - 20, 420)
    .c(5, 0x2a2440)
    .c(6, 0x4a4458)
    .c(7, 0x5a5068, 0.5);
  sky.pulse = pulse;

  // --- The mountain, small and far, its core breathing.
  const mtn = c.shader('mountain', -80, 0, VIEW_W + 160, VIEW_H, MOUNTAIN, view);
  mtn.pulse = pulse;
  const lobes: [number, number, number, number][] = [
    [0, -86, 78, 70],
    [-70, -50, 70, 46],
    [66, -54, 80, 52],
    [-136, -16, 64, 26],
    [140, -16, 78, 28],
    [-26, -136, 42, 40],
    [34, -126, 40, 36],
  ];
  for (const [i, [x, y, rx, ry]] of lobes.entries()) mtn.p(i, MX + 80 + x, HORIZON + y, rx, ry);
  mtn
    .p(7, 0, 0, 0, 0)
    .p(8, MX + 80, HORIZON - 14, 70, 0.012)
    .c(9, 0x6a646c)
    .c(10, 0x0e1020)
    .c(11, 0xd8d0cc)
    .c(12, 0x1a1c30, 0.55)
    .p(13, HORIZON + 4, 2, 0.6);
  const core = new Container();
  core.blendMode = 'add';
  view.addChild(core);
  const coreA = glow(MX, HORIZON - 12, 12, 0xe8e2dc, 0.5);
  const coreB = glow(MX, HORIZON - 14, 70, 0x9894a8, 0.18);
  core.addChild(coreB, coreA);

  // --- The land: frost to the horizon.
  const land = c.plane(
    'land',
    {
      fog: 0x262640,
      fogK: 0.08,
      ramp: [HORIZON, HORIZON + 220, 0.75, 0],
      amb: 0xb8bcd8,
      mottle: 0.12,
      mottleScale: 60,
      seed: 3,
      brush: [0.06, 120, 0.02, 6],
    },
    view,
  );
  const landG = new Graphics();
  land.view.addChild(landG);
  landG.rect(-80, HORIZON - 2, VIEW_W + 160, VIEW_H - HORIZON + 4).fill(
    vgrad([
      [0, 0x2c2c44],
      [0.25, 0x1c1e30],
      [1, 0x0b0d18],
    ]),
  );
  // Frost glitter: small pale grains, smaller and denser toward the horizon.
  for (let i = 0; i < 900; i++) {
    const u = rng() ** 2.2;
    const y = HORIZON + 4 + u * (VIEW_H - HORIZON);
    const x = -60 + rng() * (VIEW_W + 120);
    const r = 0.5 + u * 2.2 * rng();
    landG.circle(x, y, r).fill({ color: 0xc8ccdc, alpha: 0.1 + 0.25 * rng() });
  }
  // Stubble: the frozen stalks of grass at moth scale, in rows that shrink away.
  for (let i = 0; i < 260; i++) {
    const u = rng() ** 1.6;
    const y = HORIZON + 10 + u * (VIEW_H - HORIZON - 10);
    const x = TREES - 80 + rng() * (VIEW_W - TREES + 160);
    const h = 4 + u * 46 * (0.4 + rng());
    const lean = (rng() - 0.5) * h * 0.4;
    landG
      .moveTo(x, y)
      .quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h)
      .stroke({
        color: mixHex(0x2a2a40, 0x8a8ca8, rng() * 0.6 * (1 - u * 0.5)),
        width: 0.6 + u * 1.6,
        alpha: 0.7,
      });
  }
  const fogFar = c.shader('fog-far', -80, 0, VIEW_W + 160, VIEW_H, FOG, view);
  fogFar
    .c(0, 0x3a3858, 0.55)
    .p(1, 700, 60, 3, 0)
    .p(2, HORIZON - 80, HORIZON - 10, HORIZON + 40, HORIZON + 160)
    .p(3, 0.35, 0.8, 0.2, 0.25);

  // --- The root: pale, lying across the frost toward the trees, stopping short of them.
  const roots = c.batch(
    'roots',
    { glow: MOUTH.inner, glowK: 0.4, rim: 0xb8c4e8, rimK: 0.3, swell: 0.06, sss: 0xd8c0c4, sssK: 0.16 },
    view,
  );
  // Laid out on the ground (x across, z away; eye 1 unit up, focal 900) and projected, so each
  // root thins and flattens as it goes off toward the horizon.
  const toScreen = (gx: number, gz: number): Pt => [VIEW_W / 2 + (gx * 900) / gz, HORIZON + 900 / gz];
  const groundRoot = (x0: number, z0: number, x1: number, z1: number, w: number, kids: number): void => {
    const path: Array<[number, number]> = [[x0, z0]];
    let gx = x0;
    let gz = z0;
    let a = Math.atan2(z1 - z0, x1 - x0);
    let da = 0;
    for (let k = 0; k < 400; k++) {
      const want = Math.atan2(z1 - gz, x1 - gx);
      da = da * 0.85 + (rng() - 0.5) * 0.18;
      a += da + (want - a) * 0.08;
      const st = 0.05 * Math.max(0.6, gz * 0.35);
      gx += Math.cos(a) * st;
      gz += Math.sin(a) * st;
      path.push([gx, gz]);
      if (Math.hypot(x1 - gx, z1 - gz) < st * 1.5 || gz < 1.5) break;
    }
    const pts = path.map(([x, z]) => toScreen(x, z));
    const ws = path.map(([, z], i) =>
      Math.max(0.5, ((w * 900) / z) * (0.75 + 0.35 * Math.sin(i * 0.4 + x0))),
    );
    roots.strip(pts, ws, { color: kids > 0 ? 0x7a7078 : 0x5e5868, glow: 0.3, seed: rng() });
    for (let k = 0; k < kids; k++) {
      const i = Math.floor(path.length * (0.25 + rng() * 0.6));
      const [bx, bz] = path[i]!;
      const side = rng() < 0.5 ? -1 : 1;
      groundRoot(bx, bz, bx + side * (0.6 + rng() * 1.6), Math.max(1.8, bz - 0.5 - rng() * 2), w * 0.5, 0);
    }
  };
  for (let i = 0; i < 3; i++) {
    const z0 = 10 + rng() * 14;
    groundRoot(2 + rng() * 8, z0, -1.5 + rng() * 0.8, 2.2 + i * 1.3, 0.024 + rng() * 0.012, 2);
  }
  roots.done();
  const steam = c.shader('steam', -80, 0, VIEW_W + 160, VIEW_H, STEAM, view);
  steam
    .c(0, 0xc8c4d4, 0.3)
    .p(1, 1000, 260, 18, 70)
    .p(2, TREES + 120, VIEW_W + 100, 160);
  const steam2 = c.shader('steam-far', -80, 0, VIEW_W + 160, VIEW_H, STEAM, view);
  steam2
    .c(0, 0xb8b4c8, 0.22)
    .p(1, 820, 150, 12, 40)
    .p(2, TREES + 300, VIEW_W + 100, 200);

  // --- The last trunks of the Grove, on the left, a little warm light at their feet.
  const trees = c.plane(
    'trees',
    {
      fog: 0x10162a,
      fogK: 0.05,
      ramp: [600, 1080, 0, 0.2],
      mottle: 0.18,
      seed: 8,
      edge: [10, 0.3, 0.2, 0],
      rim: 0x6a7aa8,
      rimK: 0.5,
      rimDir: [0.9, -0.3],
      rimW: 3,
      brush: [0.08, 90, 1.57, 8],
    },
    view,
  );
  const treeG = new Graphics();
  trees.view.addChild(treeG);
  const trunk = (x: number, w: number, lean: number, col: number): void => {
    const pts: Pt[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      pts.push([x + lean * t - w * (0.5 + 0.5 * (1 - t) ** 3 * 0.8), VIEW_H + 20 - t * (VIEW_H + 80)]);
    }
    for (let k = 12; k >= 0; k--) {
      const t = k / 12;
      pts.push([x + lean * t + w * (0.5 + 0.5 * (1 - t) ** 3 * 0.9), VIEW_H + 20 - t * (VIEW_H + 80)]);
    }
    treeG.poly(pts.flat()).fill(col);
  };
  trunk(150, 300, -40, 0x08141a);
  trunk(470, 120, 20, 0x0a1a20);
  trunk(-60, 260, 10, 0x061016);
  // Roots of the trees, and moss, on the ground at their feet.
  for (let i = 0; i < 6; i++) {
    treeG
      .poly(blob(rng, 120 + rng() * 460, 1000 + rng() * 60, 60 + rng() * 90, 20 + rng() * 20, 0.3, 20).flat())
      .fill(0x08161a);
  }
  const warm = new Container();
  warm.blendMode = 'add';
  view.addChild(warm);
  warm.addChild(
    glow(330, 1000, 260, WARM.gold, 0.1),
    glow(420, 1012, 6, WARM.key, 0.55),
    glow(250, 1030, 5, WARM.key, 0.4),
  );

  // --- Ferns in front, dark and soft.
  const front = c.plane('front', { fog: 0x05080e, fogK: 0, blur: 3, seed: 2 }, view);
  const fernsC = new Container();
  front.view.addChild(fernsC);
  for (let i = 0; i < 7; i++) {
    const f = new Container();
    const g = new Graphics();
    fern(rng, g, 220 + rng() * 160, (rng() - 0.3) * 0.5, 0x03060a, 0x050a0e, 0x08100f);
    f.addChild(g);
    f.position.set(-40 + i * 120 + rng() * 60, VIEW_H + 30);
    f.rotation = (rng() - 0.5) * 0.6 + 0.2;
    fernsC.addChild(f);
  }

  return (t: number) => {
    const [o0, o1] = COCOONS.outside;
    const u = window01(t, o0, o1);
    // A slow drift right and in: her look going on out.
    view.position.set(-50 * u, -10 * u);
    view.scale.set(1 + 0.03 * u);
    const b = pulse(t);
    coreA.alpha = 0.3 + 0.4 * b;
    coreB.alpha = 0.1 + 0.12 * b;
    for (const [i, f] of fernsC.children.entries()) f.skew.x = Math.sin(t * 0.7 + i) * 0.03;
  };
}
