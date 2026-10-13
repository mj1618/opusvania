/**
 * Far forest: three parallax layers of colossal trunks fading into fog (far[0] is the farthest).
 *
 * Each layer is composed once from bg-forest / bg-shapes in dark local colours, baked to a render
 * texture at a deliberately low scale (softer with distance) and run through the atmosphere pass
 * (form shading, warm rim, height fog, the light well). Per frame only cheap things move: a
 * drifting fog sheet in front of each layer, sway sprites (vines, moss, canopy fronds) rotated by
 * wind(), and the shimmer of the distant waterfall.
 *
 * Composition (layer coordinates; a layer shows x = 2880 + (camX - 2880) * parallax +- 960):
 *   far0  pale giants, a cliff with a waterfall on the left, the light well right of centre
 *   far1  a backlit stone arch standing in the light well, denser trunks to the right
 *   far2  a 700 px giant on the left, the well, then a dark stand with a huge fallen log leaning in
 */
import {
  Container,
  Graphics,
  Matrix,
  Mesh,
  type MeshGeometry,
  RenderTexture,
  Shader,
  Sprite,
  UniformGroup,
} from 'pixi.js';
import { VIEW_H, VIEW_W } from '../../contract';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import type { LayerName, LayerRect } from '../layer-tree';
import {
  type Atmosphere,
  atmTone,
  type BakedTile,
  BG_VERT,
  bakeLayer,
  coverRect,
  FarPairView,
  type FogSpec,
  LayerView,
  type LifeSpec,
  noiseTexture,
  quadGeometry,
  type SwayItem,
  SwaySet,
  softTexture,
  type ZoneSpec,
} from '../lib/bg-bake';
import { buildForest, type ForestBuild, type ForestPlan, forestLook, hangers } from '../lib/bg-forest';
import {
  blob,
  fbm1,
  foliageMass,
  leafPts,
  mossCurtain,
  quad,
  type Rng,
  ribbon,
  rr,
  TO_LIGHT,
} from '../lib/bg-shapes';
import { mix, PALETTE, prng } from '../lib/look';
import { SKY_OUTPUT } from './sky';

const NAMES = ['far0', 'far1', 'far2'] as const;

/** Texture px per layer px for each layer's bake: lower = softer = farther. */
const BAKE_SCALE = [0.62, 0.9, 1.15] as const;
/** Layer y of the sky bloom when the camera rests on the ground. */
const WELL_Y = 690;
const PAD = 60;
/** Texture px per logical view px of the target all far layers are drawn into (capped by the display). */
const FAR_TARGET_SCALE = 1;
/** Canopy rustle amplitude per layer, in layer px. */
const RUSTLE = [1.6, 2.4, 3.2] as const;
/** Slow life: the far pair (far0 + far1) and far2. Smaller and slower with distance. */
const LIFE: readonly LifeSpec[] = [
  { breath: 1.6, shimmer: 0, openings: 0.065 },
  { breath: 2.4, shimmer: 0.1, openings: 0.065 },
];

/**
 * Low key (memory/reference-study.md): haze colours are dark, the centre family is amber-brown, and
 * the side zones are turned azure / violet by the ZONE tints. Nothing here may exceed luma ~180.
 */
const ATM: readonly Atmosphere[] = [
  {
    fogColor: 0x5e4f28,
    fogTop: 0.6,
    fogGround: 0.8,
    fogY0: 650,
    fogY1: 1230,
    wellX: 3110,
    wellY: WELL_Y,
    wellR: 330,
    wellColor: 0xd9a858,
    wellStrength: 0.4,
    formDist: 26,
    formLit: 0.25,
    formShade: 0.2,
    rimDist: 7,
    rimColor: PALETTE.keyWarm,
    rimStrength: 0,
    mottle: 0.1,
    litGain: 0.9,
    sunMix: 0.3,
    tint: [1.2, 1.0, 0.7],
    lid: 0.45,
    lidY0: 520,
    lidY1: 760,
    blur: 9,
  },
  {
    fogColor: 0x43381d,
    fogTop: 0.44,
    fogGround: 0.66,
    fogY0: 680,
    fogY1: 1290,
    wellX: 3220,
    wellY: WELL_Y,
    wellR: 300,
    wellColor: 0xcf9c50,
    wellStrength: 0.26,
    formDist: 34,
    formLit: 0.3,
    formShade: 0.3,
    rimDist: 6,
    rimColor: PALETTE.keyWarm,
    rimStrength: 0,
    mottle: 0.14,
    litGain: 1.0,
    sunMix: 0.4,
    sunColorL: 0xcde6ff,
    sunColorR: 0xffcfae,
    zoneParallax: 0.25,
    sideBody: 0.3,
    sideLit: 0.7,
    sideRim: 0,
    tint: [1.2, 1.0, 0.7],
    lid: 0.4,
    lidY0: 500,
    lidY1: 770,
    blur: 8,
  },
  {
    fogColor: 0x2b2514,
    fogTop: 0.34,
    fogGround: 0.58,
    fogY0: 700,
    fogY1: 1340,
    wellX: 3330,
    wellY: WELL_Y,
    wellR: 280,
    wellColor: 0xc08f48,
    wellStrength: 0.16,
    formDist: 42,
    formLit: 0.4,
    formShade: 0.4,
    rimDist: 5,
    rimColor: PALETTE.keyWarm,
    rimStrength: 0,
    mottle: 0.18,
    gain: 0.6,
    litGain: 1.0,
    sunMix: 0.5,
    sunColor: 0xd0c050,
    sunColorL: 0xbfdcff,
    sunColorR: 0x8fd6a0,
    zoneParallax: 0.42,
    sideBody: 0.3,
    sideLit: 0.75,
    sideRim: 0,
    tint: [1.4, 1.0, 0.55],
    edgeOnly: 1,
    shadeTint: [0.26, 0.23, 0.18],
    lid: 0.28,
    lidY0: 460,
    lidY1: 780,
    blur: 4.5,
  },
];

/** The mist in front of each layer (between it and the next one). */
const FOG: readonly FogSpec[] = [
  {
    color: 0x6a5a30,
    warm: 0xe0b060,
    yTop: 760,
    yFull: 1210,
    alphaTop: 0.1,
    alpha: 0.42,
    wellX: 3110,
    wellY: WELL_Y + 60,
    wellR: 330,
    wellAlpha: 0.34,
    scale: 1 / 1500,
    speed: 0.006,
    wisp: 0.5,
  },
  {
    color: 0x4c4022,
    warm: 0xd0a052,
    yTop: 800,
    yFull: 1270,
    alphaTop: 0.06,
    alpha: 0.42,
    wellX: 3220,
    wellY: WELL_Y + 80,
    wellR: 320,
    wellAlpha: 0.22,
    scale: 1 / 1300,
    speed: 0.009,
    wisp: 0.55,
  },
  {
    color: 0x322b17,
    warm: 0xb88a46,
    yTop: 860,
    yFull: 1340,
    alphaTop: 0.06,
    alpha: 0.42,
    wellX: 3330,
    wellY: WELL_Y + 100,
    wellR: 300,
    wellAlpha: 0.12,
    scale: 1 / 1100,
    speed: 0.012,
    wisp: 0.6,
  },
];

const HANG = [
  // far0 has no sway: it is composited inside the far-pair pass, nothing can be drawn over it alone.
  { seed: 501, vines: 0, moss: 0, fronds: 0, vineLen: [70, 190], amp: 0.03 },
  { seed: 502, vines: 18, moss: 12, fronds: 14, vineLen: [90, 280], amp: 0.04 },
  { seed: 503, vines: 26, moss: 16, fronds: 18, vineLen: [110, 380], amp: 0.05 },
] as const;

/** Birds far away, between far0 and far1. Speed in layer px/s. */
const BIRDS = { seed: 31, count: 5, size: 9, spacing: 34, speed: 26, startX: 1150, y: 800, flap: 7.5 };
/** The moonlit waterfall of the left glade (far1 coordinates). */
const WATERFALL = {
  x: 1960,
  /** The cliff lip the water leaves from, and the pool it ends in (layer y). */
  lip: 600,
  pool: 1258,
  /** The stages: fraction of the drop each covers, sideways step at its top, ribbon width. */
  stages: [
    { part: 0.4, dx: 0, w: 22 },
    { part: 0.32, dx: 44, w: 30 },
    { part: 0.28, dx: -34, w: 40 },
  ],
  color: 0xb8d4ee,
  alpha: 0.3,
  speed: 0.5,
  /** Mist at each landing and the plume over the pool. */
  mist: 0x8fb0cc,
  mistAlpha: 0.3,
};

/** Room around a stage's live quad (layer px) for its soft ends and the spray plume. */
const FALL_PAD = { top: 30, bottom: 100 } as const;

/** Top-left x, top y, bottom y and width of each stage of the fall. */
function fallStages(): Array<{ x: number; y0: number; y1: number; w: number }> {
  const w = WATERFALL;
  let x = w.x;
  let y = w.lip;
  return w.stages.map((st) => {
    x += st.dx;
    const y1 = y + (w.pool - w.lip) * st.part;
    const out = { x, y0: y, y1, w: st.w };
    y = y1;
    return out;
  });
}
/** How each layer takes on the zone moods (see ZONES in bg-bake). */
const ZONE: ReadonlyArray<Omit<ZoneSpec, 'anchorX'>> = [
  {
    parallax: 0.12,
    tintL: [0.3, 0.8, 2.3],
    tintR: [1.1, 0.42, 2.0],
    mistL: 0x24506f,
    mistR: 0x4c2868,
    wellL: { x: 2190, y: 650, r: 190, alpha: 0.3, color: 0x9fc4e6 },
    wellR: { x: 3560, y: 730, r: 200, alpha: 0.4, color: 0xe09a70 },
  },
  {
    parallax: 0.25,
    tintL: [0.35, 0.85, 2.2],
    tintR: [1.14, 0.42, 1.95],
    mistL: 0x1a3f5a,
    mistR: 0x401c56,
    wellL: { x: 1960, y: 520, r: 240, alpha: 0.12, color: 0x8fb4d8 },
    wellR: { x: 3900, y: 780, r: 200, alpha: 0.26, color: 0xd08a6a },
  },
  {
    parallax: 0.42,
    tintL: [0.36, 0.88, 2.6],
    tintR: [1.12, 0.43, 2.4],
    mistL: 0x122f45,
    mistR: 0x321446,
    wellR: { x: 4060, y: 820, r: 200, alpha: 0.12, color: 0xc07a70 },
  },
];
const ARCH = { x0: 2770, x1: 3250, baseY: 1255, rise: 440, thick: 56 };
const LOG = { x0: 3930, y0: 1290, x1: 4640, y1: 800, thick: 70 };

const LOOKS = [
  forestLook({ leaf: 11, light: 0.35, streaks: 0.6, bands: 0.5, cool: 0.22 }),
  forestLook({ leaf: 14, light: 0.5, streaks: 1.6, bands: 0.75, cool: 0.12 }),
  forestLook({ leaf: 17, light: 0.65, streaks: 3, bands: 1.1, cool: 0.05, grooves: 1.6 }),
] as const;

function plans(rects: readonly LayerRect[]): ForestPlan[] {
  const [r0, r1, r2] = rects as [LayerRect, LayerRect, LayerRect];
  const [l0, l1, l2] = LOOKS;
  return [
    {
      seed: 1100,
      rect: r0,
      groundY: 1150,
      groundAmp: 26,
      canopyY: 650,
      canopyAmp: 46,
      canopyR: 105,
      wellX: 3110,
      wellHalf: 190,
      wellLift: 240,
      openLift: 150,
      trunks: [
        { x: 1745, w: 180, lean: 30 },
        { x: 2030, w: 90, lean: 26, branches: 1 },
        { x: 2440, w: 400, lean: -50, branches: 3 },
        { x: 2700, w: 46, lean: -18, branches: 1 },
        { x: 3400, w: 230, lean: 56 },
        { x: 3880, w: 330, lean: -36, branches: 3 },
        { x: 4130, w: 120, lean: 22 },
      ],
      rootsPerSide: 2,
      rootArch: 0,
      holes: 14,
      mounds: 5,
      moundR: 80,
      moss: 3,
      look: l0,
      drop: (x) => -260 * Math.exp(-(((x - 2190) / 170) ** 2)) - 260 * Math.exp(-(((x - 3600) / 190) ** 2)),
      groundRows: 1,
    },
    {
      seed: 2200,
      rect: r1,
      groundY: 1212,
      groundAmp: 30,
      canopyY: 655,
      canopyAmp: 64,
      canopyR: 135,
      wellX: 3220,
      wellHalf: 210,
      wellLift: 260,
      openLift: 210,
      drop: (x) => -300 * Math.exp(-(((x - 1960) / 200) ** 2)) - 280 * Math.exp(-(((x - 3880) / 170) ** 2)),
      groundRows: 1,
      accentRate: 0.07,
      amber: 0xd9a04a,
      blossom: 0xd9c2ff,
      trunks: [
        { x: 1500, w: 220, lean: 20 },
        { x: 1720, w: 100, lean: -40, branches: 1 },
        { x: 2300, w: 450, lean: 40, branches: 3 },
        { x: 2660, w: 80, lean: -22, branches: 1 },
        { x: 3640, w: 320, lean: -20, branches: 3 },
        { x: 4070, w: 90, lean: 34, branches: 1 },
        { x: 4280, w: 270, lean: -30 },
      ],
      clearWell: true,
      rootsPerSide: 2,
      rootArch: 0.15,
      holes: 16,
      mounds: 5.5,
      moundR: 95,
      moss: 3,
      look: l1,
      behind: (c, r) => {
        waterfallCliff(c, r, l1);
        stoneArch(c, r, l1);
      },
    },
    {
      seed: 3300,
      rect: r2,
      groundY: 1272,
      groundAmp: 34,
      canopyY: 655,
      canopyAmp: 80,
      canopyR: 165,
      wellX: 3330,
      wellHalf: 230,
      wellLift: 280,
      openLift: 270,
      drop: (x) => 60 * Math.exp(-(((x - 4350) / 400) ** 2)) - 300 * Math.exp(-(((x - 4060) / 150) ** 2)),
      groundRows: 1,
      accentRate: 0.1,
      amber: 0xd9a04a,
      blossom: 0xd9c2ff,
      trunks: [
        { x: 1230, w: 500, lean: 20, branches: 3, roots: 3 },
        // The centre zone's giant, left of the light well.
        { x: 2440, w: 640, lean: -30, branches: 3, roots: 3, boughs: 3 },
        { x: 2860, w: 76, lean: 130, branches: 1, roots: 1 },
        { x: 3700, w: 400, lean: -44, branches: 3, roots: 3, boughs: 3 },
        { x: 4350, w: 330, lean: 30, branches: 2, roots: 3 },
        { x: 4640, w: 150, lean: -20 },
      ],
      rootsPerSide: 2,
      rootArch: 0.2,
      holes: 18,
      mounds: 6,
      moundR: 110,
      moss: 8,
      look: l2,
      front: (c, r) => fallenLog(c, r, l2),
    },
  ];
}

/**
 * far1: the left glade's landmark. A dark bluff stepping down in shelves, and a thin moonlit
 * ribbon of water that leaves the lip, lands on each shelf in a puff of mist and ends in a soft
 * plume over the pool. The live shimmer is added on top (LiveFall).
 */
function waterfallCliff(c: Container, r: Rng, look: (typeof LOOKS)[number]): void {
  const g = c.addChild(new Graphics());
  const n = fbm1(77);
  const w = WATERFALL;
  const stages = fallStages();
  const stone = mix(0x040d18, PALETTE.shadowIndigo, 0.3);
  // The bluff: narrow at the lip, a wider step under every landing.
  const face = (t: number): { x: number; y: number } => ({
    x: w.x + 18 * Math.sin(t * 5),
    y: 1310 - (1310 - w.lip + 40) * t,
  });
  // It widens gradually under every landing (an abrupt step drew the bluff as stacked boxes).
  const step = (y: number): number =>
    stages.reduce((acc, st) => {
      const k = Math.max(0, Math.min(1, (y - st.y1 + 70) / 160));
      return acc + 46 * k * k * (3 - 2 * k);
    }, 0);
  g.poly(
    ribbon(
      face,
      (t, side) =>
        (130 + step(face(t).y) + 60 * (1 - t)) * (1 + n(t * 5 + side * 3) * 0.28 + n(t * 17 + side) * 0.07) +
        (side === 1 ? 26 : 0),
      64,
    ),
  ).fill(stone);
  // Overhanging lip and the shelves the water lands on.
  g.poly(blob(w.x - 20, w.lip + 6, 150, 34, r, 0.25, 18)).fill(stone);
  for (const st of stages.slice(0, -1)) {
    // A lumpy boss of rock under the landing (a wide flat blob read as a slab).
    for (let k = 0; k < 3; k++)
      g.poly(
        blob(st.x + rr(r, -70, 70), st.y1 + 18 + rr(r, -6, 22), rr(r, 40, 80), rr(r, 22, 40), r, 0.35, 20),
      ).fill(stone);
  }
  // Cracks and lighter ledges on the face.
  for (let i = 0; i < 12; i++) {
    const y = w.lip + 40 + i * rr(r, 40, 58);
    const side = i % 2 === 0 ? 1 : -1;
    const x = w.x + side * rr(r, 70, 190);
    const path = quad(
      { x: x - rr(r, 30, 70), y: y + rr(r, -8, 8) },
      { x, y: y - 10 },
      { x: x + rr(r, 30, 70), y: y + rr(r, -6, 14) },
    );
    g.poly(ribbon(path, (t) => 2 + 6 * Math.sin(Math.PI * t), 8)).fill({ color: look.bark.lit, alpha: 0.3 });
  }
  // The water: a thin ribbon per stage, a little wider as it falls.
  for (const st of stages) {
    const fall = ribbon(
      (t) => ({ x: st.x + 3 * Math.sin(t * 7 + st.y0), y: st.y0 - 6 + (st.y1 - st.y0 + 12) * t }),
      (t) => (st.w / 2) * (0.7 + 0.3 * t) * (1 + n(t * 9 + st.y0) * 0.14),
      16,
    );
    g.poly(fall).fill({ color: w.color, alpha: 0.3 });
  }
  // Mist: a puff at every landing, a plume over the pool (soft sprites, baked with the layer).
  const puff = (x: number, y: number, rx: number, ry: number, a: number): void => {
    const s = new Sprite(softTexture());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.setSize(rx * 2, ry * 2);
    s.tint = w.mist;
    s.alpha = a;
    c.addChild(s);
  };
  for (const st of stages.slice(0, -1)) puff(st.x, st.y1 + 4, 90, 44, w.mistAlpha);
  const last = stages[stages.length - 1];
  if (last) {
    puff(last.x, last.y1, 190, 90, w.mistAlpha * 1.2);
    puff(last.x + 30, last.y1 - 70, 120, 110, w.mistAlpha * 0.7);
  }
  // Growth along the top of the bluff.
  for (let i = 0; i < 6; i++) {
    const x = w.x + rr(r, -200, 200);
    const y = w.lip - 50 + Math.abs(x - w.x) * 0.3;
    foliageMass(c.addChild(new Graphics()), x, y, rr(r, 60, 110), rr(r, 36, 60), r, look.leaf);
  }
}

/** far1: a natural stone arch standing in the light well, mossed on top. */
function stoneArch(c: Container, r: Rng, look: (typeof LOOKS)[number]): void {
  const g = c.addChild(new Graphics());
  const a = ARCH;
  const n = fbm1(91);
  const stone = mix(look.bark.base, PALETTE.shadowIndigo, 0.3);
  const curve = (t: number): { x: number; y: number } => ({
    x: a.x0 + (a.x1 - a.x0) * (t + 0.035 * Math.sin(t * Math.PI * 2)),
    y: a.baseY + 60 - (a.rise + 60) * Math.sin(Math.PI * t) ** 0.72 + 26 * Math.sin(t * 7),
  });
  const half = (t: number, side: 1 | -1): number =>
    (a.thick + 60 * Math.abs(Math.cos(Math.PI * t)) ** 2.2) * (1 + n(t * 9 + side * 5) * 0.24);
  g.poly(ribbon(curve, half, 44)).fill(stone);
  // Top light (the -normal side of a left-to-right curve is its upper side).
  g.poly(
    ribbon(curve, (t, side) => (side === -1 ? half(t, -1) * 0.97 : -half(t, -1) * 0.5), 44, 0.06, 0.94),
  ).fill({
    color: look.bark.lit,
    alpha: 0.3,
  });
  g.poly(ribbon(curve, (t, side) => (side === 1 ? half(t, 1) * 0.97 : -half(t, 1) * 0.4), 44, 0.1, 0.9)).fill(
    {
      color: look.bark.dark,
      alpha: 0.4,
    },
  );
  for (let i = 0; i < 9; i++) {
    const t = rr(r, 0.2, 0.8);
    const p = curve(t);
    const rx = rr(r, 36, 80);
    foliageMass(c.addChild(new Graphics()), p.x, p.y - half(t, -1) * 0.9, rx, rx * 0.5, r, look.leaf, 1.1);
  }
  const m = c.addChild(new Graphics());
  for (let i = 0; i < 9; i++) {
    const t = rr(r, 0.22, 0.78);
    const p = curve(t);
    mossCurtain(m, p.x, p.y + half(t, 1) * 0.7, rr(r, 24, 60), rr(r, 50, 150), r, look.moss, 2);
  }
}

function logCurve(): (t: number) => { x: number; y: number } {
  const l = LOG;
  return quad(
    { x: l.x0, y: l.y0 },
    { x: (l.x0 + l.x1) / 2, y: (l.y0 + l.y1) / 2 + 46 },
    { x: l.x1, y: l.y1 },
  );
}

/** far2: a huge fallen trunk leaning up into the dark stand on the right. */
function fallenLog(c: Container, r: Rng, look: (typeof LOOKS)[number]): void {
  const g = c.addChild(new Graphics());
  const n = fbm1(55);
  const curve = logCurve();
  const half = (t: number, side: 1 | -1): number => (LOG.thick - 24 * t) * (1 + n(t * 8 + side * 4) * 0.12);
  g.poly(ribbon(curve, half, 40)).fill(look.bark.base);
  g.poly(
    ribbon(curve, (t, side) => (side === -1 ? half(t, -1) * 0.97 : -half(t, -1) * 0.35), 40, 0.02, 0.98),
  ).fill({
    color: look.bark.lit,
    alpha: 0.3,
  });
  g.poly(
    ribbon(curve, (t, side) => (side === -1 ? half(t, -1) * 0.97 : -half(t, -1) * 0.72), 40, 0.02, 0.98),
  ).fill({
    color: look.bark.lit,
    alpha: 0.26,
  });
  g.poly(ribbon(curve, (t, side) => (side === 1 ? half(t, 1) * 0.97 : -half(t, 1) * 0.3), 40)).fill({
    color: look.bark.dark,
    alpha: 0.42,
  });
  // Bark streaks along the log.
  for (let i = 0; i < 26; i++) {
    const t0 = rr(r, 0, 0.8);
    const len = rr(r, 0.05, 0.18);
    const u = rr(r, -0.8, 0.8);
    const off = (t: number): { x: number; y: number } => {
      const p = curve(t0 + len * t);
      return { x: p.x + u * 30, y: p.y + u * 55 };
    };
    g.poly(ribbon(off, (t) => 1 + 3 * Math.sin(Math.PI * t), 6)).fill({
      color: u < 0 ? look.bark.lit : look.bark.dark,
      alpha: 0.28,
    });
  }
  for (let i = 0; i < 12; i++) {
    const t = rr(r, 0.05, 0.98);
    const p = curve(t);
    const rx = rr(r, 40, 110);
    foliageMass(
      c.addChild(new Graphics()),
      p.x - 18,
      p.y - half(t, -1) * 0.95,
      rx,
      rx * 0.45,
      r,
      look.leaf,
      1.1,
    );
  }
  // Its top end disappears into leaves.
  foliageMass(c.addChild(new Graphics()), LOG.x1 - 20, LOG.y1 - 10, 210, 150, r, look.leaf);
}

const FALL_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uNoise;
uniform vec4 uFall;
uniform vec4 uDim;
uniform vec3 uWater;
void main() {
  float t = uFall.x;
  // Layer px: x from the stream's axis, y from the lip of this stage.
  vec2 q = vec2((vUV.x - 0.5) * uDim.x, vUV.y * uDim.y - ${FALL_PAD.top}.0);
  float len = uDim.w;
  float tt = clamp(q.y / len, 0.0, 1.0);
  float n = texture(uNoise, vec2(q.x / 110.0 + uFall.w, q.y / 460.0 - t * uFall.z)).r;
  float m = texture(uNoise, vec2(q.x / 46.0 + 0.37, q.y / 190.0 - t * uFall.z * 1.7)).g;
  // The stream wanders a little and spreads as it falls; its sides are a soft falloff, never an edge.
  float axis = sin(q.y * 0.019 + uFall.w * 9.0) * 4.0 + (n - 0.5) * 7.0 * tt;
  float hw = uDim.z * (0.55 + 0.75 * tt);
  float ax = (q.x - axis) / hw;
  float body = exp(-ax * ax * 1.3);
  float streak = 0.3 + 0.7 * smoothstep(0.3, 0.8, n * 0.6 + m * 0.55);
  float ends = smoothstep(-16.0, 14.0, q.y) * (1.0 - smoothstep(len - 46.0, len + 10.0, q.y));
  float a = body * streak * ends * uFall.y;
  // Spray where it lands: a round, breathing plume wider than the stream.
  vec2 d = vec2(q.x / (hw * 1.5 + 18.0), (q.y - len + 6.0) / 30.0);
  a += exp(-dot(d, d)) * uFall.y * (0.4 + 0.35 * m) * (0.9 + 0.1 * sin(t * 1.3 + uFall.w * 20.0));
  // Nothing may reach the quad's border.
  a *= 1.0 - smoothstep(0.7, 1.0, abs(vUV.x - 0.5) * 2.0);
  a *= smoothstep(0.0, 0.06, vUV.y) * (1.0 - smoothstep(0.9, 1.0, vUV.y));
  fragColor = vec4(uWater * a, a);
}`;

/** The moving water over one stage of the fall: streaks sliding down a soft column. */
class LiveFall {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly u: UniformGroup;
  constructor(st: { x: number; y0: number; y1: number; w: number }) {
    const w = WATERFALL;
    const color = w.color;
    const half = 50 + st.w * 2.6;
    const h = st.y1 - st.y0 + FALL_PAD.top + FALL_PAD.bottom;
    this.u = new UniformGroup({
      uFall: { value: new Float32Array([0, w.alpha, w.speed, st.y0 * 0.01]), type: 'vec4<f32>' },
      uDim: { value: new Float32Array([half * 2, h, st.w / 2, st.y1 - st.y0]), type: 'vec4<f32>' },
      uWater: {
        value: new Float32Array([
          ((color >> 16) & 255) / 255,
          ((color >> 8) & 255) / 255,
          (color & 255) / 255,
        ]),
        type: 'vec3<f32>',
      },
    });
    const shader = Shader.from({
      gl: { vertex: BG_VERT, fragment: FALL_FRAG },
      resources: { uNoise: noiseTexture().source, fall: this.u },
    });
    this.mesh = new Mesh({
      geometry: quadGeometry(st.x - half, st.y0 - FALL_PAD.top, half * 2, h),
      shader,
    });
    this.mesh.label = 'waterfall';
  }
  update(clock: number): void {
    (this.u.uniforms.uFall as Float32Array)[0] = clock;
  }
}

/** Moss hanging from the fallen log (far2). */
function landmarkHangers(i: number, atm: Atmosphere): SwayItem[] {
  const r = prng(900 + i);
  const look = LOOKS[i] ?? LOOKS[0];
  const items: SwayItem[] = [];
  const add = (x: number, y: number): void => {
    const w = rr(r, 30, 80);
    const len = rr(r, 80, 230);
    const seed = Math.floor(r() * 1e9);
    const cols = look.moss.map((c) => atmTone(atm, c, x, y + len / 2));
    items.push({
      x,
      y,
      w: w + len * 0.3,
      h: len + 4,
      amp: 0.05 * rr(r, 0.6, 1.2),
      phase: r(),
      draw: (g) => mossCurtain(g, 0, 0, w, len, prng(seed), cols, 2.2),
    });
  };
  if (i === 2) {
    const curve = logCurve();
    for (let k = 0; k < 12; k++) {
      const t = rr(r, 0.08, 0.92);
      const p = curve(t);
      add(p.x + 20, p.y + (LOG.thick - 24 * t) * 0.6);
    }
  }
  return items;
}

/** A loose flock crossing far in the distance: each bird is two flapping wing shapes. */
class Flock {
  readonly container = new Container({ label: 'birds' });
  private readonly birds: Array<{
    c: Container;
    l: Graphics;
    r: Graphics;
    dx: number;
    dy: number;
    phase: number;
  }> = [];

  constructor(
    private readonly rect: LayerRect,
    color: number,
  ) {
    const r = prng(BIRDS.seed);
    for (let i = 0; i < BIRDS.count; i++) {
      const c = new Container();
      const size = BIRDS.size * rr(r, 0.75, 1.2);
      const wing = (dir: 1 | -1): Graphics =>
        new Graphics()
          .poly([
            0,
            0,
            dir * size * 0.45,
            -size * 0.2,
            dir * size,
            size * 0.05,
            dir * size * 0.5,
            size * 0.12,
          ])
          .fill(color);
      const l = wing(-1);
      const rw = wing(1);
      c.addChild(l, rw, new Graphics().poly(leafPts(-size * 0.3, 0, 0, size * 0.6, size * 0.2)).fill(color));
      this.container.addChild(c);
      const row = Math.ceil(i / 2);
      this.birds.push({
        c,
        l,
        r: rw,
        dx: -row * BIRDS.spacing * rr(r, 0.8, 1.3),
        dy: (i % 2 === 0 ? 1 : -1) * row * BIRDS.spacing * 0.42 + rr(r, -8, 8),
        phase: r() * 6.283,
      });
    }
  }

  update(clock: number): void {
    const span = this.rect.w + 600;
    const x = this.rect.x - 300 + ((clock * BIRDS.speed + BIRDS.startX) % span);
    const y = BIRDS.y + Math.sin(clock * 0.21) * 40;
    for (const b of this.birds) {
      const glide = 0.55 + 0.45 * Math.sin(clock * 0.5 + b.phase);
      const flap = Math.sin(clock * BIRDS.flap + b.phase) * 0.75 * glide - 0.12;
      b.l.rotation = -flap;
      b.r.rotation = flap;
      b.c.position.set(
        x + b.dx + Math.sin(clock * 0.7 + b.phase) * 6,
        y + b.dy + Math.cos(clock * 0.9 + b.phase) * 5,
      );
    }
  }
}

interface FarLayer {
  name: LayerName;
  view: LayerView | FarPairView | null;
  sway: SwaySet;
  falls: LiveFall[];
}

export class FarLayers implements EnvModule {
  private readonly built: FarLayer[] = [];
  private flock: Flock | null = null;
  private ctx!: SceneContext;
  /** Off-tree copies of the three far layers (same transforms), rendered to `target` each frame. */
  private readonly scene = new Container({ label: 'far-scene' });
  private readonly groups = [new Container(), new Container(), new Container()];
  private target!: RenderTexture;
  private readonly toTarget = new Matrix();
  private output!: Sprite;

  init(ctx: SceneContext): void {
    const rects = NAMES.map((n) => coverRect(ctx.layers, n, PAD));
    this.ctx = ctx;
    this.scene.addChild(...this.groups);
    this.target = RenderTexture.create({ width: VIEW_W + 16, height: VIEW_H + 16, resolution: 1 });
    this.output = new Sprite(this.target);
    this.output.label = 'far-composite';
    this.output.blendMode = 'none';
    ctx.layers.far[2]?.addChild(this.output);
    let far0: { tiles: BakedTile[]; plan: ForestPlan } | null = null;
    plans(rects).forEach((plan, i) => {
      const name = NAMES[i] ?? 'far0';
      const layer = this.groups[i];
      const atm = ATM[i];
      const fogSpec = FOG[i];
      const hang = HANG[i];
      if (!layer || !atm || !fogSpec || !hang) return;
      const scale = BAKE_SCALE[i] ?? 1;
      const zone = { ...(ZONE[i] ?? ZONE[0]), anchorX: ctx.layers.anchor.x } as ZoneSpec;
      if (i === 2) {
        // Birds: in front of far1 (which is drawn in the far-pair pass), behind far2's trunks.
        const a1 = ATM[1] ?? atm;
        this.flock = new Flock(rects[1] ?? plan.rect, atmTone(a1, 0x1b3b47, plan.wellX - 600, BIRDS.y));
        layer.addChild(this.flock.container);
      }
      const b: ForestBuild = buildForest(plan);
      const tiles = bakeLayer(ctx.renderer, b.content, plan.rect, scale, atm, TO_LIGHT, b.lights);
      b.content.destroy({ children: true });
      const rustle = { amp: RUSTLE[i] ?? 0, y0: plan.canopyY + 60, y1: plan.canopyY + 320 };
      let view: LayerView | FarPairView | null = null;
      const sky = SKY_OUTPUT.texture;
      const t0 = far0?.tiles[0];
      if (i === 0) {
        far0 = { tiles, plan };
        // Shown alone only if the pair pass cannot be built (see below).
        if (tiles.length !== 1 || !sky) {
          view = new LayerView(tiles, fogSpec, rustle, zone);
          far0 = null;
        }
      } else if (i === 1 && far0 && t0 && sky) {
        const z0 = { ...(ZONE[0] as Omit<ZoneSpec, 'anchorX'>), anchorX: ctx.layers.anchor.x };
        view = new FarPairView(
          t0,
          tiles,
          { fog: FOG[0] as FogSpec, zone: z0 },
          { fog: fogSpec, zone },
          rustle,
          { texture: sky, x: -8, y: -8, w: VIEW_W + 16, h: VIEW_H + 16 },
          ctx.layers.anchor,
          LIFE[0],
        );
        if (SKY_OUTPUT.sprite) SKY_OUTPUT.sprite.visible = false;
      } else {
        view = new LayerView(tiles, fogSpec, rustle, zone, undefined, LIFE[1]);
      }
      if (view) layer.addChild(view.container);

      const falls: LiveFall[] = [];
      if (i === 1) {
        for (const st of fallStages()) {
          const f = new LiveFall(st);
          falls.push(f);
          layer.addChild(f.mesh);
        }
      }
      const items = [...hangers(plan, b, atm, hang), ...landmarkHangers(i, atm)];
      // A soft atlas: far vines must not be crisper than the blurred layer they hang from.
      const sway = new SwaySet(ctx.renderer, items, scale * 0.45, zone);
      layer.addChild(sway.container);
      this.built.push({ name, view, sway, falls });
    });
  }

  update(frame: SceneFrame): void {
    for (const l of this.built) {
      if (l.view instanceof FarPairView) l.view.update(frame.clock, frame.camera);
      else l.view?.update(frame.clock, frame.camera.x);
      l.sway.update(frame.clock, frame.camera.x);
      for (const f of l.falls) f.update(frame.clock);
    }
    this.flock?.update(frame.clock);
    // Everything far is drawn into a target at logical-view resolution (the bakes hold no more
    // detail than that) and shown by one opaque sprite: a quarter of the pixels on a 2x display.
    const far = this.ctx.layers.far;
    // Hidden for debugging (far2 hosts the composite): skip the work too.
    if (far[2] && !far[2].visible) return;
    this.groups.forEach((g, i) => {
      g.visible = far[i]?.visible ?? true;
      const L = far[i];
      if (!L) return;
      g.position.copyFrom(L.position);
      g.scale.copyFrom(L.scale);
    });
    const k = Math.min(FAR_TARGET_SCALE, this.ctx.viewScale());
    const w = Math.ceil((VIEW_W + 16) * k);
    const h = Math.ceil((VIEW_H + 16) * k);
    if (this.target.width !== w || this.target.height !== h) {
      // A resized render texture kept drawing into its old area (black beyond it): replace it.
      const old = this.target;
      this.target = RenderTexture.create({ width: w, height: h, resolution: 1 });
      this.output.texture = this.target;
      old.destroy(true);
    }
    this.toTarget.set(k, 0, 0, k, 8 * k, 8 * k);
    this.ctx.renderer.render({
      container: this.scene,
      target: this.target,
      clear: true,
      transform: this.toTarget,
    });
    const host = far[2];
    if (host) {
      const sx = host.scale.x || 1;
      this.output.position.set((-8 - host.position.x) / sx, (-8 - host.position.y) / sx);
      this.output.setSize((VIEW_W + 16) / sx, (VIEW_H + 16) / sx);
    }
  }
}
