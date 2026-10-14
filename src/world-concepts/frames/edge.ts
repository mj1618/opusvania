// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 2. The edge. Where pale root meets the amber forest: the left of the frame alive and warm (the
 * Grove's language: teal dusk, moss, ferns in the wind, amber glints and shafts), the right bone-pale
 * and still (sheathed trees, cases on stalks, spores that hang without drifting). The line between
 * them runs down a tree that is half bark, half root. Umber stands on the line.
 */
import { Container, Graphics } from 'pixi.js';
import { prng, wind } from '../../render/scene/lib/look';
import { FOG, MOUNTAIN, SHAFTS, SPLIT_SKY, STEAM } from '../lib/bodies';
import type { Composer } from '../lib/compose';
import {
  type Blade,
  curtain,
  donePods,
  FOREST,
  fern,
  Grass,
  MOUTH,
  mixHex,
  pod,
  podLayers,
  spread,
  WARM,
} from '../lib/kit';
import { VIEW_H, VIEW_W } from '../lib/layer';
import { blob, glow, hgrad, vgrad } from '../lib/paint';
import { helix, type Pt, smoothPath, type TissueBatch, taper, wander } from '../lib/tissue';
import type { WorldFrame } from '../types';

/** The split: screen x of the line at height y. */
const lineX = (y: number): number => 990 - (y - 540) * 0.09 + Math.sin(y * 0.006) * 34;
/** 0 forest .. 1 root, with a soft band either side of the line. */
const side = (x: number, y: number, soft = 60): number => {
  const t = (x - lineX(y) + soft) / (2 * soft);
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};
const groundY = (x: number): number => {
  const live = 884 + Math.sin(x * 0.0068 + 0.4) * 16 + Math.sin(x * 0.019) * 6;
  const kept = 888 + Math.sin(x * 0.004) * 4;
  const k = side(x, 880, 90);
  return live + (kept - live) * k;
};

function trunk(
  rng: () => number,
  b: TissueBatch,
  x: number,
  base: number,
  top: number,
  w: number,
  color: number,
  kind: number,
  glowK = 0,
): Pt[] {
  const pts: Pt[] = [];
  const lean = (rng() - 0.5) * 60;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([x + lean * t * t + Math.sin(t * 5 + x) * 8, base + 30 - (base + 30 - top) * t]);
  }
  b.strip(pts, (t) => w * (1 - t * 0.35) * (1 + 0.5 * Math.max(0, 0.12 - t) * 8), {
    color,
    kind,
    glow: glowK,
    seed: rng(),
  });
  return pts;
}

function branches(
  rng: () => number,
  b: TissueBatch,
  stem: Pt[],
  n: number,
  w: number,
  color: number,
  kind: number,
  glowK = 0,
): Pt[][] {
  const out: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    const t = 0.35 + rng() * 0.55;
    const p = stem[Math.floor(t * (stem.length - 1))]!;
    const dir = rng() < 0.5 ? -1 : 1;
    const pts = wander(rng, {
      x: p[0],
      y: p[1],
      ang: -Math.PI / 2 + dir * (0.7 + rng() * 0.6),
      len: 120 + rng() * 220,
      step: 8,
      curl: 0.12,
      droop: 0.015,
    });
    b.strip(pts, taper(w * (0.5 + rng() * 0.3), 1.2), { color, kind, glow: glowK, seed: rng() });
    out.push(pts);
  }
  return out;
}

function build(c: Composer): void {
  const rng = prng(2207);
  const R = c.root;
  c.grade = {
    shadow: 0x081420,
    shadowK: 0.03,
    deep: 0x02060c,
    deepK: 0.78,
    saturation: 1.0,
    contrast: 1.05,
    grain: 0.026,
    vignette: 0.3,
    vignetteSoft: 0.55,
    bloom: [0.55, 0.75, 0.65],
  };
  const SPLIT = { x0: 900, x1: 1080 };

  // --- Sky: the forest's dusk on the left, the Mouth's cold night on the right.
  const sky = c.shader('sky', 0, 0, VIEW_W, VIEW_H, SPLIT_SKY, R);
  sky
    .c(0, 0x020c10)
    .c(1, 0x0a2228)
    .c(2, 0x123030)
    .p(3, 360, 360, 300, 1.0)
    .c(4, 0x9a5418)
    .c(5, 0x0c0c20)
    .c(6, 0x2a283e)
    .c(7, 0x4a4558)
    .p(8, 1660, 620, 420, 1)
    .c(9, 0x5a4a52)
    .p(10, 1000, -0.09, 30, 120)
    .p(11, 640);

  // --- The mountain, small and far on the right.
  const mtn = c.shader('mountain', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const lobes: [number, number, number, number][] = [
    [1660, 560, 120, 90],
    [1560, 600, 90, 50],
    [1770, 600, 110, 55],
    [1640, 500, 60, 60],
  ];
  for (const [i, l] of lobes.entries()) mtn.p(i, ...l);
  mtn
    .p(8, 1660, 640, 160, 0.01)
    .c(9, 0xa89490)
    .c(10, 0x4a4458)
    .c(11, 0xe0b0a0)
    .c(12, 0x6a6478, 0.45)
    .p(13, 650, 3, 1.6);

  // --- Far: trunks in warm teal fog on the left, bone-white husks in violet fog on the right; two depths.
  const farLayer = (
    name: string,
    fogK: number,
    fogL: number,
    fogR: number,
    gap: number,
    wr: [number, number],
    seed: number,
    blur = 1.6 - seed * 0.4,
  ) => {
    const pl = c.plane(name, {
      fog: fogL,
      fogK,
      ramp: [480, 900, -0.08, 0.12],
      mottle: 0.12,
      blur,
      lit: 0.5,
      seed,
      edge: [8, 0.2, 0, 0],
      brush: [0.06, 70, 1.57, 8],
      split: { x0: SPLIT.x0, x1: SPLIT.x1, fog: fogR, sat: 0.6 },
    });
    const bb = c.batch(`${name}-trunks`, { glow: MOUTH.inner, glowK: 0.3, light: [-0.5, -0.86] }, pl.view);
    const gg = new Graphics();
    pl.view.addChildAt(gg, 0);
    for (let x = -40 + rng() * gap; x < VIEW_W + 40; x += gap * (0.6 + rng() * 0.9)) {
      const pale = side(x, 500, 80);
      const w = wr[0] + rng() * (wr[1] - wr[0]);
      const st = trunk(rng, bb, x, 780, -60, w, mixHex(0x0e2226, 0x9a8e92, pale), pale > 0.5 ? 0 : 3, 0.3);
      if (pale > 0.5) branches(rng, bb, st, 2, w * 0.5, 0x9a8e92, 0, 0.3);
    }
    // Canopy over the forest half: a dark mass whose underside hangs in lobes (not on the farthest rank:
    // the amber glow must show through there).
    if (seed < 2) {
      const under: Pt[] = [[-40, -20]];
      for (let x = -40; x <= 1000; x += 18) {
        const fade = Math.max(0, (x - 760) / 240);
        under.push([
          x,
          120 + seed * 30 + Math.sin(x * 0.011 + seed) * 40 + Math.sin(x * 0.037) * 18 - fade * 260,
        ]);
      }
      under.push([1000, -20]);
      gg.poly(under.flat()).fill(0x0a1c1e);
      for (let i = 0; i < 26; i++) {
        const x = rng() * 940;
        const y = 120 + seed * 30 + Math.sin(x * 0.011 + seed) * 40 + (rng() - 0.3) * 50;
        gg.poly(blob(rng, x, y, 26 + rng() * 40, 16 + rng() * 22, 0.25, 32).flat()).fill(0x0a1c1e);
      }
    }
    gg.rect(-20, 700, VIEW_W + 40, 220).fill(
      vgrad([
        [0, 0x0c1c1e, 0],
        [0.35, 0x0c1c1e, 1],
        [1, 0x081214, 1],
      ]),
    );
    bb.done();
    return pl;
  };
  farLayer('far3', 0.84, 0x3a5a56, 0x8a849a, 80, [5, 9], 5, 2.6);
  const fogFar3 = c.shader('fog-far3', 0, 0, VIEW_W, VIEW_H, FOG, R);
  fogFar3
    .c(0, 0x2a4a48, 0.4)
    .p(1, 900, 220, 0.004, 0)
    .p(2, 100, 400, 760, 900)
    .p(3, 0.3, 0.85, 0, 0.2)
    .p(4, -400, 990, 200)
    .p(5, 330, 330, 420, 0.7)
    .c(6, 0x9a6a30);
  const fogFar3R = c.shader('fog-far3-r', 0, 0, VIEW_W, VIEW_H, FOG, R);
  fogFar3R
    .c(0, 0x6a6680, 0.45)
    .p(1, 900, 220, 0, 0)
    .p(2, 100, 400, 760, 900)
    .p(3, 0.3, 0.85, 0.2, 0.25)
    .p(4, 990, 2400, 200);
  farLayer('far2', 0.74, 0x2c4a48, 0x7a7488, 110, [8, 14], 0);
  const fogMid = c.shader('fog-far', 0, 0, VIEW_W, VIEW_H, FOG, R);
  fogMid
    .c(0, 0x1e3a3c, 0.35)
    .p(1, 700, 200, 0.005, 0)
    .p(2, 200, 420, 700, 860)
    .p(3, 0.35, 0.85, 0, 0.1)
    .p(4, -400, 990, 160)
    .p(5, 330, 330, 360, 0.6)
    .c(6, 0x8a5a2a);
  farLayer('far1', 0.5, 0x163032, 0x5a5670, 170, [14, 24], 1);

  // --- Light: amber shafts through the forest half only.
  const shafts = c.shader('shafts', 0, 0, VIEW_W, VIEW_H, SHAFTS, R);
  shafts.c(0, 0xffc480, 0.22).p(1, -0.42, 0.91, 90, 0.02).p(2, 760, 980).p(3, 0, 120, 700, 900);
  shafts.mesh.blendMode = 'add';

  const haze = c.shader('haze', 0, 0, VIEW_W, VIEW_H, FOG, R);
  haze
    .c(0, 0x1e4048, 0.4)
    .p(1, 800, 140, 0.008, 0)
    .p(2, 440, 620, 760, 900)
    .p(3, 0.3, 0.85, 0.0, 0.15)
    .p(4, -400, 1000, 160);
  const hazeR = c.shader('haze-r', 0, 0, VIEW_W, VIEW_H, FOG, R);
  hazeR
    .c(0, 0x5a566e, 0.5)
    .p(1, 800, 140, 0, 0)
    .p(2, 440, 620, 760, 900)
    .p(3, 0.3, 0.85, 0.3, 0.2)
    .p(4, 1000, 2400, 160)
    .p(5, 1660, 640, 260, 0.7)
    .c(6, 0x6a5462);

  // --- Mid: two great trunks in the forest, two sheathed husks in the root, one tree on the line.
  const mid = c.plane('mid', {
    fog: 0x10303a,
    fogK: 0.28,
    ramp: [600, 900, 0, 0.12],
    mottle: 0.16,
    lit: 0.9,
    blur: 0.4,
    seed: 2,
    split: { x0: SPLIT.x0 - 40, x1: SPLIT.x1 + 40, fog: 0x4a4660, sat: 0.7 },
    edge: [10, 0.08, 0.1, 0],
    rim: 0xffb870,
    rimK: 0.22,
    rimDir: [-0.55, -0.83],
    rimW: 4,
    rimLights: 0.7,
    brush: [0.1, 60, 1.57, 7],
    paint: 3,
  });
  const bark = c.batch(
    'bark',
    { glow: 0, glowK: 0, light: [-0.5, -0.86], rim: WARM.gold, rimK: 0.25 },
    mid.view,
  );
  const moss = new Graphics();
  const sheath = c.batch(
    'sheath',
    { glow: MOUTH.inner, glowK: 0.55, rim: 0xa8b8e0, rimK: 0.35, swell: 0.05, light: [0.4, -0.9] },
    mid.view,
  );
  mid.view.addChild(moss);
  const midGlows = new Container();
  midGlows.blendMode = 'add';
  const pods = podLayers(c, mid.view, 0.55, midGlows);
  // Forest trunks.
  for (const [x, w] of [
    [170, 58],
    [560, 44],
  ] as const) {
    const st = trunk(rng, bark, x, groundY(x), -80, w, FOREST.bark, 3);
    const br = branches(rng, bark, st, 3, w * 0.5, FOREST.bark, 3);
    // Moss along the top of each branch and down the trunk's lit side; hanging strands.
    for (const p of br) {
      for (let k = 2; k < p.length - 2; k += 1 + Math.floor(rng() * 3)) {
        const [px, py] = p[k]!;
        if (rng() < 0.35) continue;
        moss
          .ellipse(px + (rng() - 0.5) * 6, py - 3 - rng() * 3, 5 + rng() * 9, 2.5 + rng() * 3)
          .fill({ color: mixHex(FOREST.leafDark, FOREST.leaf, rng() * 0.8), alpha: 0.75 + rng() * 0.25 });
      }
      for (let k = 4; k < p.length; k += 5) {
        const [px, py] = p[k]!;
        const len = 30 + rng() * 120;
        moss.moveTo(px, py).quadraticCurveTo(px + 6, py + len * 0.6, px + 2, py + len);
        moss.stroke({ color: mixHex(FOREST.leafDark, FOREST.leaf, 0.5), width: 1.6, alpha: 0.85 });
      }
    }
  }
  // The tree on the line: bark on its forest side, sheathed in root on the other.
  const LT = 860;
  const lineTree = trunk(rng, bark, LT, groundY(LT), -80, 52, FOREST.bark, 3);
  const lineBr = branches(rng, bark, lineTree, 3, 22, FOREST.bark, 3);
  // Root creeping up its right flank in wandering strands.
  const trunkAt = (y: number): number => {
    let best = lineTree[0]!;
    for (const p of lineTree) if (Math.abs(p[1] - y) < Math.abs(best[1] - y)) best = p;
    return best[0];
  };
  const g0 = groundY(LT);
  for (let i = 0; i < 11; i++) {
    const o0 = 0.05 + rng() * 0.85;
    const top = 80 + rng() * 600;
    const ph = rng() * 6.28;
    const amp = 0.15 + rng() * 0.3;
    const pts: Pt[] = [];
    for (let y = g0 + 20; y >= top; y -= 8) {
      const t = (g0 - y) / (g0 + 80);
      const hw = 52 * (1 - t * 0.35);
      const o = Math.min(1, Math.max(-0.1, o0 + amp * Math.sin(y * 0.012 + ph) * (1 - o0 * 0.5)));
      pts.push([trunkAt(y) + hw * o, y]);
    }
    if (pts.length > 2)
      sheath.strip(pts, taper(4 + rng() * 6, 0.8, 0.5, rng()), {
        color: MOUTH.boneMoon,
        glow: 0.55,
        seed: rng(),
      });
  }
  {
    const hx = helix(LT + 8, 380, groundY(LT), 40, 1.6, 0.8);
    for (const s of hx.front)
      if (s[0]![0] > LT + 6) sheath.strip(s, () => 6, { color: MOUTH.boneMoon, glow: 0.5, seed: rng() });
  }
  // The right-hand branch is already bone.
  for (const p of lineBr)
    if (p[p.length - 1]![0] > LT)
      sheath.strip(p, taper(9, 1.6), { color: MOUTH.boneMoon, glow: 0.5, seed: rng() });
  // Moss on the forest side of the line tree.
  for (let k = 3; k < lineTree.length - 6; k += 2) {
    const [px, py] = lineTree[k]!;
    if (rng() < 0.85 || py < 500) continue;
    moss
      .ellipse(px - 34 - rng() * 10, py, 4 + rng() * 4, 12 + rng() * 16)
      .fill({ color: mixHex(FOREST.leafDark, FOREST.leaf, rng()), alpha: 0.55 });
  }
  // Sheathed husks in the root: bone white, wound, pods hanging from their limbs.
  for (const [x, w] of [
    [1330, 50],
    [1720, 40],
  ] as const) {
    const st = trunk(rng, sheath, x, groundY(x), -80, w, MOUTH.boneMoon, 0, 0.5);
    const hx = helix(x, 60, groundY(x), w * 0.9, 3, rng() * 6);
    for (const s of hx.front) sheath.strip(s, () => 5, { color: MOUTH.bone, glow: 0.6, seed: rng() });
    const br = branches(rng, sheath, st, 4, w * 0.36, MOUTH.boneMoon, 0, 0.5);
    for (const p of br) branches(rng, sheath, p, 1, 5, MOUTH.boneMoon, 0, 0.4);
    for (const p of br) {
      curtain(
        rng,
        sheath,
        Math.min(p[0]![0], p[p.length - 1]![0]),
        Math.max(p[0]![0], p[p.length - 1]![0]),
        (xx) => {
          let best = p[0]!;
          for (const q of p) if (Math.abs(q[0] - xx) < Math.abs(best[0] - xx)) best = q;
          return best[1];
        },
        [10, 80],
        [1.5, 3.5],
        MOUTH.boneShadow,
        0.4,
        [24, 60],
      );
      const q = p[Math.floor(p.length * (0.4 + rng() * 0.5))]!;
      pod(rng, pods, {
        x: q[0],
        y: q[1] + 4,
        stalk: 20 + rng() * 120,
        len: 50 + rng() * 16,
        w: 16,
        glow: 0.7,
      });
    }
  }
  bark.done();
  sheath.done();
  donePods(pods);
  mid.view.addChild(midGlows);

  // --- Low mist, warm in the forest, cold over the root.
  const mist = c.shader('mist', 0, 0, VIEW_W, VIEW_H, FOG, R);
  mist
    .c(0, 0x1c3a40, 0.45)
    .p(1, 600, 60, 0.012, 0)
    .p(2, 760, 840, 900, 960)
    .p(3, 0.3, 0.8, 0, 0.2)
    .p(4, -400, 980, 120)
    .p(5, 420, 860, 300, 0.5)
    .c(6, 0x6a5430);
  const mistR = c.shader('mist-r', 0, 0, VIEW_W, VIEW_H, FOG, R);
  mistR
    .c(0, 0x6a6478, 0.5)
    .p(1, 600, 60, 0, 0)
    .p(2, 760, 840, 900, 960)
    .p(3, 0.3, 0.8, 0.4, 0.25)
    .p(4, 980, 2400, 120);

  // --- Near: moss and ferns on the left, a smooth floor of root on the right.
  const near = c.plane('near', {
    fog: 0x061a24,
    fogK: 0.04,
    mottle: 0.16,
    mottleScale: 150,
    lit: 1,
    seed: 3,
    split: { x0: SPLIT.x0, x1: SPLIT.x1, fog: 0x0e1026 },
    edge: [6, 0.03, 0.06, 0],
    rimLights: 0.9,
    rimW: 3,
    brush: [0.08, 30, 0.1, 5],
  });
  const ground = new Graphics();
  near.view.addChild(ground);
  const prof: Pt[] = [];
  for (let x = -20; x <= VIEW_W + 20; x += 8) prof.push([x, groundY(x)]);
  // One dark body under both; only the surface differs: moss on the left, a pale skin of root on the right.
  const lx = lineX(880);
  const body = [...prof, [VIEW_W + 20, VIEW_H + 10] as Pt, [-20, VIEW_H + 10] as Pt];
  ground.poly(body.flat()).fill(
    vgrad([
      [0, 0x0c1a1e],
      [0.2, 0x070f14],
      [1, 0x020508],
    ]),
  );
  const skin = prof.filter(([x]) => x >= lx - 30);
  const skinPoly = [...skin, ...skin.map(([x, y]) => [x, y + 70 + Math.sin(x * 0.03) * 6] as Pt).reverse()];
  ground.poly(skinPoly.flat()).fill(
    vgrad([
      [0, 0x8a7e86],
      [0.12, 0x5a5262],
      [0.5, 0x221e2c],
      [1, 0x0c0a14, 0],
    ]),
  );
  // Feather the skin's start: the moss's dark fades over it across the line.
  ground.rect(lx - 32, 860, 240, 140).fill(
    hgrad([
      [0, 0x070f14, 1],
      [0.3, 0x070f14, 0.75],
      [1, 0x070f14, 0],
    ]),
  );
  // Moss rim along the forest floor.
  const mossTop = prof.filter(([x]) => x <= lx + 10);
  for (let i = 0; i < mossTop.length - 1; i++) {
    const [x, y] = mossTop[i]!;
    const k = side(x, 880, 120);
    ground
      .ellipse(x, y + 2, 7 + rng() * 4, 4 + rng() * 2)
      .fill(mixHex(mixHex(FOREST.leaf, FOREST.leafLit, rng() * 0.5), 0x6a6670, k));
  }
  const nearRoots = c.batch(
    'near-roots',
    { glow: MOUTH.inner, glowK: 0.55, rim: 0xa8b8e0, rimK: 0.4, swell: 0.05 },
    near.view,
  );
  // The root floor's mat, and its front: fingers reaching over the line into the moss.
  for (let i = 0; i < 30; i++) {
    const x = lx + 20 + rng() * (VIEW_W - lx);
    const pts = wander(rng, {
      x,
      y: groundY(x) + 2,
      ang: rng() < 0.5 ? 0 : Math.PI,
      len: 100 + rng() * 300,
      step: 8,
      curl: 0.1,
    });
    for (const p of pts) p[1] = groundY(p[0]) + 2 + (p[1] - groundY(p[0])) * 0.15;
    nearRoots.strip(pts, taper(3 + rng() * 6, 0.6, 0.3, rng()), {
      color: MOUTH.boneMoon,
      glow: 0.5 * rng(),
      seed: rng(),
    });
  }
  for (let i = 0; i < 9; i++) {
    const x = lx + 30 + rng() * 60;
    const pts = wander(rng, {
      x,
      y: groundY(x) + 2,
      ang: Math.PI + (rng() - 0.5) * 0.4,
      len: 120 + rng() * 260,
      step: 6,
      curl: 0.22,
    });
    for (const p of pts) p[1] = groundY(p[0]) + 1 + (p[1] - groundY(p[0])) * 0.25;
    nearRoots.strip(pts, taper(5 + rng() * 3, 0.5, 0.35, rng()), {
      color: MOUTH.boneMoon,
      glow: 0.7,
      seed: rng(),
    });
  }
  spread(rng, nearRoots, LT + 30, groundY(LT + 30) + 2, 4, [80, 200], [4, 8], MOUTH.boneMoon, 0.6);
  const nearGlows = new Container();
  nearGlows.blendMode = 'add';
  const nearPods = podLayers(c, near.view, 0.6, nearGlows);
  // Cases on short stalks out of the root floor, and one hung at the line.
  for (const [x, len] of [
    [1180, 58],
    [1460, 70],
    [1600, 52],
    [1870, 64],
  ] as const) {
    const gy = groundY(x);
    pod(rng, nearPods, { x, y: gy - len - 30, stalk: 26, len, w: 18, lean: (rng() - 0.5) * 6, glow: 0.7 });
    nearRoots.strip(
      smoothPath(
        [
          [x - 14, gy + 2],
          [x - 4, gy - 16],
          [x, gy - 30],
        ],
        6,
      ),
      taper(5, 2),
      { color: MOUTH.boneMoon, glow: 0.4, seed: rng() },
    );
  }
  nearRoots.done();
  donePods(nearPods);
  near.view.addChild(nearGlows);
  // Ferns: alive and swaying on the left; grey and still where the root has reached.
  const ferns: { v: Container; x: number; ph: number; live: number; base: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const x = -20 + rng() * (lx + 60);
    const k = side(x, 880, 110);
    const v = new Container();
    const g = new Graphics();
    const leaf = mixHex(mixHex(0x0a2a26, FOREST.leafDark, rng()), 0x4a4652, k);
    const tip = mixHex(mixHex(FOREST.leaf, 0x9aa060, rng() * 0.6), 0x77727e, k);
    fern(rng, g, 60 + rng() * 90, (rng() - 0.5) * 0.6, mixHex(FOREST.leafDark, 0x3a3644, k), leaf, tip);
    v.addChild(g);
    v.position.set(x, groundY(x) + 4);
    const base = (rng() - 0.5) * 0.5 + (k > 0.5 ? 0.35 : 0);
    v.rotation = base;
    near.view.addChild(v);
    ferns.push({ v, x, ph: rng(), live: 1 - k, base });
  }
  // Grass along the floor: wind in it on the forest side, none beyond the line.
  const blades: Blade[] = [];
  for (let i = 0; i < 420; i++) {
    const x = -20 + rng() * (VIEW_W + 40);
    const k = side(x, 880, 70);
    if (k > 0.9 && rng() < 0.85) continue;
    blades.push({
      x,
      y: groundY(x) + 4,
      h: (10 + rng() * 26) * (1 - 0.5 * k),
      w: 1.4 + rng(),
      lean: (rng() - 0.5) * 0.5 + k * 0.4,
      color: mixHex(mixHex(FOREST.leafDark, FOREST.leafLit, rng() * 0.7), 0x6a6672, k),
      live: 1 - k,
      ph: rng(),
    });
  }
  const grass = new Grass(blades, (x, t, ph) => wind(x * 2, t, ph));
  near.view.addChild(grass.g);
  // Amber flower bulbs and cyan caps: the forest's small lights.
  const nearG = new Graphics();
  near.view.addChild(nearG);
  const warmGlows = new Container();
  warmGlows.blendMode = 'add';
  const bulbs: Pt[] = [];
  for (const x of [110, 300, 460, 640, 720]) {
    const y = groundY(x) + 2;
    const h = 30 + rng() * 40;
    const tx = x + (rng() - 0.5) * 30;
    nearG.moveTo(x, y).quadraticCurveTo(x, y - h * 0.7, tx, y - h);
    nearG.stroke({ color: FOREST.leafDark, width: 2 });
    nearG.ellipse(tx, y - h + 4, 5, 7).fill(0xffc070);
    bulbs.push([tx, y - h + 4]);
    warmGlows.addChild(glow(tx, y - h + 4, 46, WARM.gold, 0.5));
  }
  for (const x of [240, 520, 690]) {
    const y = groundY(x) + 2;
    for (let k = 0; k < 3; k++) {
      const mx = x + k * 9 - 9;
      const mh = 6 + rng() * 8;
      nearG.rect(mx - 1, y - mh, 2, mh).fill(0x9ab8b8);
      nearG.ellipse(mx, y - mh, 5, 3).fill(0x8ff0f8);
      warmGlows.addChild(glow(mx, y - mh, 14, FOREST.cyan, 0.35));
    }
  }
  near.view.addChild(warmGlows);

  // --- Umber on the line, facing the root.
  const HX = lineX(870) + 30;
  const hero = c.addHero({ x: HX, y: groundY(HX) + 2, scale: 0.92, pose: 'stand', facing: 1 }, R);
  const her = new Container();
  her.blendMode = 'add';
  R.addChild(her);
  const herPool = glow(HX, groundY(HX), 110, WARM.gold, 0.16);
  const herHalo = glow(HX, groundY(HX) - 60, 80, WARM.key, 0.12);
  her.addChild(herPool, herHalo);

  // --- The ground below the surface: roots running toward us in perspective on the kept side,
  // moss mounds and a few small lights on the wild side; a low mist over both.
  const low = c.plane('low', {
    fog: 0x061418,
    fogK: 0.1,
    blur: 1.2,
    edge: [10, 0.2, 0, 0],
    ramp: [880, VIEW_H, 0.0, 0.25],
    mottle: 0.16,
    lit: 1,
    seed: 6,
    split: { x0: SPLIT.x0, x1: SPLIT.x1, fog: 0x14142c },
    rimLights: 0.8,
    rimW: 3,
  });
  const lowG = new Graphics();
  low.view.addChild(lowG);
  for (let i = 0; i < 16; i++) {
    const x = -40 + rng() * (lx - 40);
    const y = groundY(x) + 30 + rng() * 140;
    lowG
      .poly(blob(rng, x, y, 40 + rng() * 90, 14 + rng() * 20, 0.3, 24).flat())
      .fill(mixHex(0x04100e, 0x0a2420, rng()));
  }
  const lowRoots = c.batch(
    'low-roots',
    { glow: MOUTH.inner, glowK: 0.5, rim: 0xa8b8e0, rimK: 0.35, swell: 0.05, sss: 0xd8b8c0, sssK: 0.14 },
    low.view,
  );
  for (let i = 0; i < 16; i++) {
    const x0 = lx + 20 + rng() * (VIEW_W - lx);
    const x1 = x0 + (x0 - 1200) * (0.3 + rng() * 0.7) + (rng() - 0.5) * 200;
    const ph = rng() * 6;
    const pts: Pt[] = [];
    const y0 = groundY(x0) + 6;
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      pts.push([x0 + (x1 - x0) * t * t + Math.sin(t * 7 + ph) * 16 * t, y0 + (VIEW_H + 40 - y0) * t * t]);
    }
    const w = 0.5 + rng();
    lowRoots.strip(pts, (t) => (1 + t * t * 14 * w) * (0.8 + 0.3 * Math.sin(t * 11 + ph)), {
      color: rng() < 0.5 ? MOUTH.boneShadow : 0x5a5266,
      glow: 0.35,
      seed: rng(),
    });
  }
  // The root's front, reaching under the line into the forest's soil.
  for (let i = 0; i < 6; i++) {
    const pts = wander(rng, {
      x: lx + 20,
      y: groundY(lx) + 30 + rng() * 80,
      ang: Math.PI + (rng() - 0.5) * 0.6,
      len: 120 + rng() * 200,
      step: 7,
      curl: 0.2,
    });
    lowRoots.strip(pts, taper(3 + rng() * 4, 0.6, 0.4, rng()), {
      color: MOUTH.boneShadow,
      glow: 0.5,
      seed: rng(),
    });
  }
  lowRoots.done();
  const lowGlows = new Container();
  lowGlows.blendMode = 'add';
  low.view.addChild(lowGlows);
  for (let i = 0; i < 7; i++) {
    const x = 40 + rng() * (lx - 120);
    const y = groundY(x) + 40 + rng() * 120;
    lowG.circle(x, y, 2.5).fill(0x8ff0f8);
    lowGlows.addChild(glow(x, y, 16, FOREST.cyan, 0.3));
  }
  const groundMist = c.shader('ground-mist', 0, 0, VIEW_W, VIEW_H, FOG, R);
  groundMist
    .c(0, 0x1a3a3a, 0.4)
    .p(1, 500, 80, 0.01, 0)
    .p(2, 900, 980, VIEW_H, VIEW_H + 100)
    .p(3, 0.3, 0.85, 0, 0.25)
    .p(4, -400, 990, 160)
    .p(5, 600, 960, 300, 0.4)
    .c(6, 0x5a4a28);
  const groundMistR = c.shader('ground-mist-r', 0, 0, VIEW_W, VIEW_H, FOG, R);
  groundMistR
    .c(0, 0x4a4660, 0.45)
    .p(1, 500, 80, 0, 0)
    .p(2, 900, 980, VIEW_H, VIEW_H + 100)
    .p(3, 0.3, 0.85, 0.3, 0.3)
    .p(4, 990, 2400, 160);

  // --- Air: fireflies and glints drift in the forest; over the root the spores hang dead still.
  const steam = c.shader('steam', 0, 0, VIEW_W, VIEW_H, STEAM, R);
  steam
    .c(0, 0x6a6080, 0.2)
    .p(1, 892, 200, 14, 120)
    .p(2, lx + 40, VIEW_W + 40, 120);
  c.mote(
    rng,
    {
      count: 70,
      x: 0,
      y: 200,
      w: lx - 40,
      h: 700,
      vx: 6,
      vy: -4,
      wobble: 26,
      size: [5, 16],
      alpha: [0.15, 0.55],
      color: [WARM.gold, WARM.key, 0xffc890],
      twinkle: 0.7,
    },
    R,
  );
  c.mote(
    rng,
    {
      count: 90,
      x: lx + 40,
      y: 150,
      w: VIEW_W - lx - 40,
      h: 760,
      vx: 0,
      vy: 0,
      wobble: 0,
      size: [3, 8],
      alpha: [0.08, 0.3],
      color: [0xd8ccd8, 0xb8bcd0],
      twinkle: 0,
    },
    R,
  );

  // --- Foreground: dark fronds at the left edge, a dark lip of root at the right.
  const fg = c.plane('fg', {
    fog: 0x02080c,
    fogK: 0.2,
    mottle: 0.1,
    blur: 12,
    lit: 0.4,
    seed: 4,
    rimLights: 0.6,
    rimW: 8,
  });
  const fgG = new Graphics();
  fg.view.addChild(fgG);
  for (let i = 0; i < 6; i++) {
    const f = new Graphics();
    fern(rng, f, 260 + rng() * 160, (rng() - 0.5) * 0.8, 0x061a14, 0x0a2a20, 0x12382a);
    f.position.set(-30 + rng() * 260, 1100);
    f.rotation = 0.2 + rng() * 0.6;
    fg.view.addChild(f);
  }
  const fgRoots = c.batch(
    'fg-roots',
    { glow: MOUTH.inner, glowK: 0.2, rim: 0x8090c0, rimK: 0.4, swell: 0.05 },
    fg.view,
  );
  for (let i = 0; i < 5; i++) {
    const pts = wander(rng, {
      x: 1990,
      y: 980 + rng() * 100,
      ang: Math.PI + 0.2 - rng() * 0.3,
      len: 300 + rng() * 260,
      step: 10,
      curl: 0.1,
    });
    fgRoots.strip(pts, taper(30 + rng() * 12, 4, 0.3, rng()), { color: 0x3a3440, glow: 0.3, seed: rng() });
  }
  fgRoots.done();

  // --- Lights.
  const L = c.light({ x: 0, y: 0, radius: 280, color: WARM.gold, intensity: 0.9, scatter: 0.5 });
  const bl = bulbs.map(([x, y]) =>
    c.light({ x, y, radius: 150, color: WARM.gold, intensity: 0.4, scatter: 0.4 }),
  );
  c.light({ x: 300, y: 260, radius: 700, color: 0xffb070, intensity: 0.35, scatter: 0.2 });
  c.light({ x: 1500, y: 760, radius: 500, color: 0xb8a0b0, intensity: 0.2, scatter: 0.2 });
  c.on((t, _b) => {
    L.x = hero.light.x;
    L.y = hero.light.y;
    L.intensity = 0.85 * hero.light.k;
    herHalo.position.set(hero.light.x, hero.light.y);
    herHalo.alpha = 0.16 * hero.light.k;
    herPool.alpha = 0.14 + 0.02 * Math.sin(t * 3.1);
    bl.forEach((l, i) => {
      l.intensity = 0.36 + 0.06 * Math.sin(t * 1.3 + i * 2);
    });
    for (const f of ferns) f.v.rotation = f.base + f.live * wind(f.x * 2, t, f.ph) * 0.12;
    grass.update(t);
  });
}

const frame: WorldFrame = {
  key: 2,
  id: 'edge',
  title: 'The edge',
  tests:
    'Does the signature transition read in one look? Half the frame amber and alive (wind, glints, shafts), half bone-pale and still; the line runs down one tree.',
  build,
};
export default frame;
