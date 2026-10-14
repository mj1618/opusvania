// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * 3. The last lamp. A dead city at night, swallowed and dark to the sky, and one old street lamp
 * that still burns. Moths come to it from everywhere; the root has drawn back from its pool of
 * light. Umber glides among the moths. The one permitted neon-ish moment: warm, small, saturated.
 */
import { Container, Graphics } from 'pixi.js';
import { prng } from '../../render/scene/lib/look';
import { BEAM, FOG, MOUNTAIN, SKY, STEAM } from '../lib/bodies';
import type { Composer } from '../lib/compose';
import { curtain, donePods, MOUTH, mixHex, pod, podLayers, WARM } from '../lib/kit';
import { VIEW_H, VIEW_W } from '../lib/layer';
import { glow, ridge, vgrad } from '../lib/paint';
import { type Pt, smoothPath, taper, wander } from '../lib/tissue';
import type { WorldFrame } from '../types';

const GROUND = 902;
/** The lamp: post foot x, lantern centre. */
const LAMP = { x: 1210, head: { x: 1150, y: 470 } };
const SODIUM = 0xffa458;
const SODIUM_HOT = 0xffd6a0;
const SODIUM_PINK = 0xff7a5c;

interface Moth {
  rx: number;
  ry: number;
  speed: number;
  ph: number;
  flap: number;
  size: number;
  tilt: number;
  /** Resting on the glass instead of flying. */
  rest: Pt | null;
}

function build(c: Composer): void {
  const rng = prng(9113);
  const R = c.root;
  c.grade = {
    shadow: 0x070816,
    shadowK: 0.03,
    deep: 0x010208,
    deepK: 0.85,
    saturation: 1.05,
    contrast: 1.08,
    grain: 0.03,
    vignette: 0.26,
    vignetteSoft: 0.6,
    bloom: [0.6, 0.55, 0.6],
  };
  const H = LAMP.head;

  // --- Sky: a dead night; the mountain only a pale smudge on the far left horizon.
  const sky = c.shader('sky', 0, 0, VIEW_W, VIEW_H, SKY, R);
  sky
    .c(0, 0x010207)
    .c(1, 0x080c22)
    .c(2, 0x18203e)
    .p(3, 760, 0.8)
    .p(4, 260, 700, 260)
    .c(5, 0x1a1626)
    .c(6, 0x2a2030)
    .c(7, 0x30283c, 0.5);
  const mtn = c.shader('mountain', 0, 0, VIEW_W, VIEW_H, MOUNTAIN, R);
  const lobes: [number, number, number, number][] = [
    [260, 650, 110, 70],
    [170, 680, 80, 40],
    [350, 680, 90, 36],
  ];
  for (const [i, l] of lobes.entries()) mtn.p(i, ...l);
  mtn
    .p(8, 260, 700, 120, 0.01)
    .c(9, 0x8a7a80)
    .c(10, 0x2a2638)
    .c(11, 0xc89a90)
    .c(12, 0x1c1c30, 0.55)
    .p(13, 710, 3, 1.8);

  // --- Far towers: the dead skyline in two depths, setbacks and broken crowns, root hanging off them.
  const towers = (
    name: string,
    fog: number,
    fogK: number,
    col: number,
    gap: number,
    hRange: [number, number],
    seed: number,
  ) => {
    const pl = c.plane(name, {
      fog,
      fogK,
      ramp: [300, 860, -0.1, 0.25],
      mottle: 0.14,
      blur: 1.6 - seed * 0.5,
      lit: 0.3,
      seed,
    });
    const g = new Graphics();
    pl.view.addChild(g);
    const roots = c.batch(`${name}-roots`, { glow: MOUTH.inner, glowK: 0.25, swell: 0.03 }, pl.view);
    for (let x = -30 + rng() * 40; x < VIEW_W; ) {
      const w = 60 + rng() * 120;
      let top = hRange[0] + rng() * (hRange[1] - hRange[0]);
      if (x > 120 && x < 420 && seed === 1) {
        x += 60;
        continue;
      }
      // Body, then up to two setbacks, then a broken crown.
      g.rect(x, top, w, 900 - top).fill(col);
      let wx = x;
      let ww = w;
      for (let k = 0; k < 2 && rng() < 0.6; k++) {
        const nw = ww * (0.55 + rng() * 0.25);
        wx += (ww - nw) * (0.3 + rng() * 0.4);
        ww = nw;
        const nt = top - 30 - rng() * 70;
        g.rect(wx, nt, ww, top - nt + 2).fill(col);
        top = nt;
      }
      const crown: number[] = [wx, top + 1];
      for (let k = 0; k <= 5; k++) crown.push(wx + (ww * k) / 5, top - rng() * 18 * (k % 2 ? 1 : 0.3));
      crown.push(wx + ww, top + 1);
      g.poly(crown).fill(col);
      // A few dead windows, in rows, mostly gone in the fog.
      for (let y = top + 30; y < 820; y += 28)
        for (let qx = wx + 8; qx < wx + ww - 10; qx += 18)
          if (rng() < 0.5) g.rect(qx, y, 7, 11).fill({ color: 0x000000, alpha: 0.35 });
      if (rng() < 0.6)
        curtain(rng, roots, wx + 6, wx + ww - 6, top + 6, [40, 260], [3, 7], MOUTH.boneShadow, 0.3, [30, 90]);
      x += w + rng() * gap;
    }
    roots.done();
  };
  towers('far2', 0x141a32, 0.78, 0x0a0c18, 20, [60, 300], 0);
  const between = c.shader('haze-far', 0, 0, VIEW_W, VIEW_H, FOG, R);
  between.c(0, 0x141a32, 0.45).p(1, 1000, 200, 0.003, 0).p(2, 200, 600, 860, 940).p(3, 0.3, 0.85, 0.1, 0.35);
  towers('far', 0x0e1226, 0.6, 0x090a14, 40, [140, 480], 1);

  const haze = c.shader('haze', 0, 0, VIEW_W, VIEW_H, FOG, R);
  haze
    .c(0, 0x1a1c34, 0.5)
    .p(1, 900, 160, 0.004, 0)
    .p(2, 380, 640, 820, 940)
    .p(3, 0.3, 0.85, 0.2, 0.25)
    .p(5, H.x, H.y + 200, 380, 0.5)
    .c(6, 0x5a3424);

  // --- Mid: the street's buildings. The one behind the lamp catches its light.
  const mid = c.plane('mid', {
    fog: 0x0a0c1e,
    fogK: 0.22,
    ramp: [600, 950, 0, 0.15],
    amb: 0x6a74a8,
    sat: 0.9,
    mottle: 0.22,
    mottleScale: 170,
    lit: 0.8,
    seed: 2,
  });
  const midG = new Graphics();
  mid.view.addChild(midG);
  const midRoots = c.batch(
    'mid-roots',
    { glow: MOUTH.inner, glowK: 0.35, rim: 0x8a96c0, rimK: 0.25, swell: 0.04 },
    mid.view,
  );
  const midGlows = new Container();
  midGlows.blendMode = 'add';
  const trim = (col: number, k: number) => mixHex(col, 0x8a7a70, k);
  const facade = (x: number, w: number, top: number, col: number, drape: boolean) => {
    midG.rect(x, top, w, GROUND - top).fill(col);
    // Pilasters, storey cornices, a heavy cornice on top.
    for (const px of [x, x + w - 10]) midG.rect(px, top, 10, GROUND - top).fill(trim(col, 0.08));
    for (let y = top + 70; y < GROUND - 150; y += 76) {
      midG.rect(x - 2, y, w + 4, 5).fill(trim(col, 0.2));
      midG.rect(x - 2, y + 5, w + 4, 3).fill({ color: 0x000000, alpha: 0.35 });
    }
    midG.rect(x - 10, top - 4, w + 20, 14).fill(trim(col, 0.18));
    midG.rect(x - 10, top + 10, w + 20, 5).fill({ color: 0x000000, alpha: 0.4 });
    // Windows: tall, some broken through, a few with a case asleep behind the glass.
    for (let y = top + 22; y < GROUND - 190; y += 76)
      for (let wx = x + 24; wx + 26 < x + w - 14; wx += 54) {
        const r = rng();
        midG.rect(wx - 3, y + 38, 32, 4).fill(trim(col, 0.22));
        if (r < 0.12) continue;
        midG.rect(wx, y, 26, 38).fill(r < 0.3 ? 0x020208 : mixHex(col, 0x000000, 0.55));
        if (r > 0.3) midG.rect(wx + 12, y, 2, 38).fill({ color: trim(col, 0.1), alpha: 0.8 });
        if (r > 0.94) {
          midG.ellipse(wx + 13, y + 22, 7, 13).fill({ color: 0x6a5e66, alpha: 0.8 });
          midGlows.addChild(glow(wx + 13, y + 20, 22, MOUTH.inner, 0.18));
        }
      }
    // Street level: a shopfront with a half-down shutter and a blank sign board.
    midG.rect(x + 16, GROUND - 160, w - 32, 26).fill(trim(col, 0.12));
    midG.rect(x + 24, GROUND - 128, w * 0.55, 128).fill(0x030308);
    for (let y = GROUND - 128; y < GROUND - 70; y += 6)
      midG.rect(x + 24, y, w * 0.55, 3).fill(trim(col, 0.05));
    midG.rect(x + w * 0.7, GROUND - 110, 30, 110).fill(0x05050c);
    if (drape) {
      // Root takes the roofline as one heavy fold and runs down in a few thick ropes.
      const edge: Pt[] = [];
      for (let k = 0; k <= 20; k++)
        edge.push([x - 14 + ((w + 28) * k) / 20, top + 4 + Math.sin(k * 1.3 + x) * 5]);
      midRoots.strip(edge, taper(13, 10, 0.5, rng()), {
        color: MOUTH.boneShadow,
        kind: 1,
        glow: 0.4,
        seed: rng(),
      });
      curtain(rng, midRoots, x, x + w, top + 10, [40, 520], [5, 12], MOUTH.boneShadow, 0.4, [30, 90]);
    }
  };
  facade(-40, 380, 120, 0x161216, true);
  facade(360, 260, 300, 0x120f14, true);
  facade(840, 480, 230, 0x1c1618, false);
  facade(1500, 300, 260, 0x141116, true);
  facade(1800, 200, 90, 0x161216, true);
  const pods = podLayers(c, mid.view, 0.3, midGlows);
  for (const [x, y, st] of [
    [80, 124, 260],
    [190, 124, 140],
    [470, 304, 90],
    [1600, 264, 200],
    [1700, 264, 320],
    [1860, 94, 400],
  ] as const)
    pod(rng, pods, { x, y: y + 6, stalk: st, len: 48 + rng() * 14, w: 15, glow: 0.35, color: 0x8a7e86 });
  midRoots.done();
  donePods(pods);
  mid.view.addChild(midGlows);

  // --- The light: a cone down from the lantern, lit dust in it, a halo.
  const beam = c.shader('beam', 0, 0, VIEW_W, VIEW_H, BEAM, R);
  beam
    .c(0, SODIUM, 0.36)
    .p(1, H.x, H.y + 20, 0.62, 520)
    .p(2, 0.6, 0.04);
  beam.mesh.blendMode = 'add';

  // --- Near: the pavement, the lamp, a railing; root carpets everything outside the light.
  const near = c.plane('near', {
    fog: 0x07081a,
    fogK: 0.05,
    mottle: 0.18,
    mottleScale: 140,
    lit: 1.2,
    seed: 3,
  });
  const ground = new Graphics();
  near.view.addChild(ground);
  ground.rect(-20, GROUND - 4, VIEW_W + 40, 20).fill(
    vgrad([
      [0, 0x2a2a40],
      [0.3, 0x16162a],
      [1, 0x0e0e1e],
    ]),
  );
  for (let x = -20; x < VIEW_W; x += 80 + rng() * 30)
    ground.rect(x, GROUND - 2, 2, 16).fill({ color: 0x05050c, alpha: 0.7 });
  ground.rect(-20, GROUND + 16, VIEW_W + 40, VIEW_H - GROUND).fill(
    vgrad([
      [0, 0x0a0a16],
      [0.3, 0x050510],
      [1, 0x020206],
    ]),
  );
  const nearRoots = c.batch(
    'near-roots',
    { glow: MOUTH.inner, glowK: 0.4, rim: 0x8a96c0, rimK: 0.35, swell: 0.05 },
    near.view,
  );
  const clear = 250;
  for (let i = 0; i < 40; i++) {
    const left = rng() < 0.5;
    const x0 = left
      ? -40 + rng() * (LAMP.x - clear - 100)
      : LAMP.x + clear + 100 + rng() * (VIEW_W - LAMP.x - clear);
    const pts = wander(rng, {
      x: x0,
      y: GROUND + 3,
      ang: left ? 0 : Math.PI,
      len: 120 + rng() * 300,
      step: 8,
      curl: 0.12,
    });
    // It reaches toward the light and stops at its edge.
    const keep = pts.filter(([x]) => Math.abs(x - LAMP.x) > clear - 40 + rng() * 30);
    for (const p of keep) p[1] = GROUND + 3 + (p[1] - GROUND - 3) * 0.12;
    if (keep.length > 2)
      nearRoots.strip(keep, taper(4 + rng() * 7, 0.5, 0.3, rng()), {
        color: MOUTH.boneMoon,
        glow: 0.4 * rng(),
        seed: rng(),
      });
  }
  nearRoots.done();
  // The lamp: an old cast-iron post with a crook and a lantern.
  const lampG = new Graphics();
  near.view.addChild(lampG);
  const iron = 0x0c0c16;
  const ironLit = 0x3a2a2a;
  lampG
    .poly([LAMP.x - 22, GROUND, LAMP.x - 14, GROUND - 60, LAMP.x + 14, GROUND - 60, LAMP.x + 22, GROUND])
    .fill(iron);
  lampG.rect(LAMP.x - 16, GROUND - 70, 32, 10).fill(iron);
  lampG.poly([LAMP.x - 8, GROUND - 70, LAMP.x - 5, 520, LAMP.x + 5, 520, LAMP.x + 8, GROUND - 70]).fill(
    vgrad([
      [0, ironLit],
      [0.3, iron],
      [1, iron],
    ]),
  );
  for (const y of [GROUND - 180, 640, 540]) lampG.rect(LAMP.x - 9, y, 18, 6).fill(iron);
  const crook = smoothPath(
    [
      [LAMP.x, 528],
      [LAMP.x - 4, 450],
      [LAMP.x - 30, 412],
      [H.x + 6, 414],
      [H.x - 2, 436],
    ],
    12,
  );
  {
    const f = crook.flat();
    lampG.moveTo(f[0]!, f[1]!);
    for (let i = 2; i < f.length; i += 2) lampG.lineTo(f[i]!, f[i + 1]!);
    lampG.stroke({ color: iron, width: 8, cap: 'round' });
    lampG
      .moveTo(LAMP.x - 4, 470)
      .quadraticCurveTo(LAMP.x - 34, 470, LAMP.x - 28, 440)
      .stroke({ color: iron, width: 3 });
  }
  // The lantern: cap, glass, base.
  lampG.poly([H.x - 26, H.y - 30, H.x + 26, H.y - 30, H.x + 12, H.y - 46, H.x - 12, H.y - 46]).fill(iron);
  lampG.rect(H.x - 3, H.y - 54, 6, 10).fill(iron);
  lampG.poly([H.x - 22, H.y - 30, H.x + 22, H.y - 30, H.x + 16, H.y + 22, H.x - 16, H.y + 22]).fill(0xffc890);
  lampG.poly([H.x - 12, H.y - 28, H.x + 12, H.y - 28, H.x + 9, H.y + 20, H.x - 9, H.y + 20]).fill(0xfff0d8);
  lampG.rect(H.x - 1.5, H.y - 30, 3, 52).fill({ color: iron, alpha: 0.8 });
  lampG.poly([H.x - 18, H.y + 22, H.x + 18, H.y + 22, H.x + 8, H.y + 34, H.x - 8, H.y + 34]).fill(iron);
  // A railing along the pavement on the left, bent; a fallen sign.
  for (let x = 120; x < 640; x += 28)
    lampG.rect(x, GROUND - 46 + Math.max(0, x - 460) * 0.12, 3, 46 - Math.max(0, x - 460) * 0.12).fill(iron);
  lampG
    .poly([
      110,
      GROUND - 48,
      470,
      GROUND - 48,
      640,
      GROUND - 28,
      640,
      GROUND - 24,
      470,
      GROUND - 43,
      110,
      GROUND - 43,
    ])
    .fill(iron);
  lampG.poly([1560, GROUND, 1566, GROUND - 4, 1700, GROUND - 40, 1696, GROUND - 32]).fill(iron);
  lampG.rect(1690, GROUND - 74, 64, 40).fill(0x14141f);

  // --- The glow of the lantern itself (additive, under the moths).
  const lampGlow = new Container();
  lampGlow.blendMode = 'add';
  R.addChild(lampGlow);
  const g1 = glow(H.x, H.y - 4, 30, SODIUM_HOT, 0.55);
  const g2 = glow(H.x, H.y, 110, SODIUM, 0.3);
  const g3 = glow(H.x, H.y + 20, 380, SODIUM_PINK, 0.12);
  const g4 = glow(H.x + 10, GROUND + 4, 300, SODIUM, 0.35);
  g4.scale.y *= 0.18;
  lampGlow.addChild(g3, g2, g1, g4);

  // --- Moths: a swarm on orbits round the lantern; a few rest on the glass.
  const moths: Moth[] = [];
  for (let i = 0; i < 46; i++) {
    const r = 30 + rng() ** 1.6 * 300;
    moths.push({
      rx: r,
      ry: r * (0.45 + rng() * 0.5),
      speed: (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 1.6) * (80 / (r + 40)),
      ph: rng() * 6.28,
      flap: 14 + rng() * 10,
      size: 6 + rng() * 6,
      tilt: (rng() - 0.5) * 0.8,
      rest: null,
    });
  }
  for (const [dx, dy] of [
    [-10, -8],
    [8, 6],
    [-4, 14],
  ] as const)
    moths.push({
      rx: 0,
      ry: 0,
      speed: 0,
      ph: rng() * 6,
      flap: 3,
      size: 5,
      tilt: 0,
      rest: [H.x + dx, H.y + dy],
    });
  const mothG = new Graphics();
  R.addChild(mothG);
  const mothGlow = new Container();
  mothGlow.blendMode = 'add';
  R.addChild(mothGlow);
  const specks = moths.map(() => {
    const s = glow(0, 0, 10, SODIUM, 0.2);
    mothGlow.addChild(s);
    return s;
  });

  // --- Umber, gliding in among them.
  const hero = c.addHero({ x: H.x - 250, y: H.y + 110, scale: 0.62, pose: 'glide', facing: 1 }, R);

  // --- Air: dust in the light, a little steam off the root.
  const steam = c.shader('steam', 0, 0, VIEW_W, VIEW_H, STEAM, R);
  steam
    .c(0, 0x3a3450, 0.16)
    .p(1, GROUND, 160, 10, 110)
    .p(2, -40, VIEW_W + 40, 80);
  const dust = c.mote(
    rng,
    {
      count: 90,
      x: H.x - 300,
      y: H.y,
      w: 600,
      h: GROUND - H.y,
      vx: 2,
      vy: 5,
      wobble: 10,
      size: [2, 6],
      alpha: [0.1, 0.5],
      color: [SODIUM_HOT, SODIUM],
      twinkle: 0.5,
    },
    R,
  );
  dust.view.alpha = 0.9;

  // --- Foreground: a dark kerb lip and root at the bottom corners, a hanging case top left.
  const fg = c.plane('fg', { fog: 0x020208, fogK: 0.25, mottle: 0.1, blur: 8, lit: 0.3, seed: 4 });
  const fgRoots = c.batch(
    'fg-roots',
    { glow: MOUTH.inner, glowK: 0.15, rim: 0x6a76a0, rimK: 0.3, swell: 0.05 },
    fg.view,
  );
  const fgG = new Graphics();
  fg.view.addChildAt(fgG, 0);
  fgG.poly(ridge(rng, -40, 700, 1010, 30, 1100, 20).flat()).fill(0x05050a);
  fgG.poly(ridge(rng, 1500, 1980, 1000, 40, 1100, 20).flat()).fill(0x05050a);
  for (let i = 0; i < 5; i++) {
    const pts = wander(rng, {
      x: -60,
      y: 980 + rng() * 80,
      ang: -0.1 + rng() * 0.2,
      len: 300 + rng() * 300,
      step: 10,
      curl: 0.12,
    });
    fgRoots.strip(pts, taper(26 + rng() * 10, 4, 0.3, rng()), { color: 0x28242e, glow: 0.2, seed: rng() });
  }
  const fgPods = podLayers(c, fg.view, 0.2, null);
  const hang = smoothPath(
    [
      [-40, 60],
      [120, 40],
      [260, -20],
    ],
    10,
  );
  fgRoots.strip(hang, taper(26, 18), { color: 0x28242e, glow: 0.2, seed: 0.4 });
  pod(rng, fgPods, {
    x: 90,
    y: 50,
    stalk: 80,
    len: 160,
    w: 48,
    color: 0x2e2a36,
    sleeperColor: 0x08070c,
    sleeperAlpha: 0.7,
    glow: 0.2,
  });
  fgRoots.done();
  donePods(fgPods);

  // --- Lights: the lamp (strong, warm, a little pink), Umber.
  const lampL = c.light({ x: H.x, y: H.y, radius: 470, color: SODIUM, intensity: 1.0, scatter: 0.9 });
  const poolL = c.light({
    x: H.x + 10,
    y: GROUND - 10,
    radius: 280,
    color: SODIUM,
    intensity: 0.9,
    scatter: 0.8,
  });
  const L = c.light({ x: 0, y: 0, radius: 220, color: WARM.gold, intensity: 0.6, scatter: 0.4 });
  c.on((t) => {
    // It buzzes: a sodium lamp at the end of its life, steady with the odd catch.
    const catchK = Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 2.3)) > 0.82 ? 0.85 : 1;
    const fl = (0.97 + 0.03 * Math.sin(t * 31)) * catchK;
    lampL.intensity = 1.0 * fl;
    poolL.intensity = 0.9 * fl;
    g1.alpha = 0.55 * fl;
    g2.alpha = 0.3 * fl;
    g3.alpha = 0.12 * fl;
    L.x = hero.light.x;
    L.y = hero.light.y;
    L.intensity = 0.6 * hero.light.k;
    mothG.clear();
    moths.forEach((m, i) => {
      let x: number;
      let y: number;
      let open: number;
      let dir = 1;
      if (m.rest) {
        [x, y] = m.rest;
        open = 0.4 + 0.2 * Math.sin(t * m.flap + m.ph);
      } else {
        const a = m.ph + t * m.speed;
        const wob = Math.sin(t * 2.3 + m.ph * 3) * 12;
        x = H.x + Math.cos(a) * m.rx + wob;
        y =
          H.y +
          10 +
          Math.sin(a) * m.ry * Math.cos(m.tilt) +
          Math.cos(a) * m.rx * Math.sin(m.tilt) +
          Math.sin(t * 3.1 + m.ph) * 8;
        dir = -Math.sin(a) * m.speed >= 0 ? 1 : -1;
        open = Math.abs(Math.sin(t * m.flap + m.ph));
      }
      const d = Math.hypot(x - H.x, y - H.y);
      const lit = Math.max(0, 1 - d / 420);
      const wing = mixHex(0x3a2e30, 0xffe0b8, Math.min(1, lit * 1.3));
      const wing2 = mixHex(0x261c20, 0xd8a070, lit);
      const sz = m.size;
      const k = 0.25 + 0.75 * open;
      // Fore and hind wing each side, swept back, as the flap opens and closes them.
      for (const sgn of [-1, 1]) {
        const ax = x + sgn * sz * 0.15;
        mothG
          .poly([
            ax,
            y - sz * 0.15,
            ax + sgn * sz * 1.15 * k - dir * sz * 0.25,
            y - sz * 0.75,
            ax + sgn * sz * 1.25 * k,
            y - sz * 0.05,
          ])
          .fill(wing);
        mothG
          .poly([
            ax,
            y + sz * 0.05,
            ax + sgn * sz * 0.8 * k,
            y + sz * 0.15,
            ax + sgn * sz * 0.45 * k,
            y + sz * 0.55,
          ])
          .fill(wing2);
      }
      mothG.ellipse(x, y, sz * 0.18, sz * 0.5).fill(mixHex(0x120c10, 0x6a4a3a, lit));
      const s = specks[i]!;
      s.position.set(x, y);
      s.alpha = 0.04 + 0.35 * lit * lit;
    });
  });
}

const frame: WorldFrame = {
  key: 3,
  id: 'lamp',
  title: 'The last lamp',
  tests:
    'The one permitted neon-ish moment: a dead city dark to the sky, one warm lamp, moths from everywhere, root drawn back from its light. Does it stay warm and small, not cyberpunk?',
  build,
};
export default frame;
