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
import { Container, Graphics, Mesh, type MeshGeometry, Shader, Sprite, UniformGroup } from 'pixi.js';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import type { LayerName, LayerRect } from '../layer-tree';
import {
  type Atmosphere,
  atmTone,
  BG_VERT,
  bakeLayer,
  type FogSpec,
  LayerView,
  type LightMap,
  noiseTexture,
  quadGeometry,
  type SwayItem,
  SwaySet,
  softTexture,
  type ZoneSpec,
} from '../lib/bg-bake';
import { buildForest, type ForestBuild, type ForestPlan, forestLook, hangers } from '../lib/bg-forest';
import {
  fbm1,
  foliageMass,
  leafPts,
  mossCurtain,
  quad,
  type Rng,
  ribbon,
  rr,
  TO_LIGHT,
  type Trunk,
  taper,
} from '../lib/bg-shapes';
import { mix, PALETTE, prng } from '../lib/look';

const NAMES = ['far0', 'far1', 'far2'] as const;

/** Texture px per layer px for each layer's bake: lower = softer = farther. */
const BAKE_SCALE = [0.62, 0.9, 1.15] as const;
/** Layer y of the sky bloom when the camera rests on the ground. */
const WELL_Y = 690;
const PAD = 60;
/** Canopy rustle amplitude per layer, in layer px. */
const RUSTLE = [1.6, 2.4, 3.2] as const;

const ATM: readonly Atmosphere[] = [
  {
    fogColor: 0xa2dbd0,
    fogTop: 0.6,
    fogGround: 0.82,
    fogY0: 650,
    fogY1: 1230,
    wellX: 2942,
    wellY: WELL_Y,
    wellR: 520,
    wellColor: 0xffe9bd,
    wellStrength: 0.42,
    formDist: 26,
    formLit: 0.3,
    formShade: 0.2,
    rimDist: 7,
    rimColor: PALETTE.keyWarm,
    rimStrength: 0.14,
    mottle: 0.1,
    litGain: 1.3,
    sunMix: 0.4,
  },
  {
    fogColor: 0x7cc0ba,
    fogTop: 0.44,
    fogGround: 0.68,
    fogY0: 680,
    fogY1: 1290,
    wellX: 3010,
    wellY: WELL_Y,
    wellR: 470,
    wellColor: 0xffe2ae,
    wellStrength: 0.32,
    formDist: 34,
    formLit: 0.4,
    formShade: 0.26,
    rimDist: 6,
    rimColor: PALETTE.keyWarm,
    rimStrength: 0.22,
    mottle: 0.14,
    litGain: 1.5,
    sunMix: 0.45,
  },
  {
    fogColor: 0x66b0ac,
    fogTop: 0.36,
    fogGround: 0.6,
    fogY0: 700,
    fogY1: 1340,
    wellX: 3098,
    wellY: WELL_Y,
    wellR: 430,
    wellColor: 0xffdca6,
    wellStrength: 0.22,
    formDist: 42,
    formLit: 0.5,
    formShade: 0.3,
    rimDist: 5,
    rimColor: PALETTE.keyWarm,
    rimStrength: 0.3,
    mottle: 0.18,
    litGain: 1.6,
    sunMix: 0.5,
    sunColor: 0xb9dc62,
  },
];

/** The mist in front of each layer (between it and the next one). */
const FOG: readonly FogSpec[] = [
  {
    color: 0xb4e6da,
    warm: 0xffe6b8,
    yTop: 760,
    yFull: 1210,
    alphaTop: 0.14,
    alpha: 0.5,
    wellX: 2942,
    wellY: WELL_Y + 60,
    wellR: 560,
    wellAlpha: 0.3,
    scale: 1 / 1500,
    speed: 0.006,
    wisp: 0.5,
  },
  {
    color: 0x93d0c8,
    warm: 0xffdfae,
    yTop: 800,
    yFull: 1270,
    alphaTop: 0.08,
    alpha: 0.5,
    wellX: 3010,
    wellY: WELL_Y + 80,
    wellR: 520,
    wellAlpha: 0.22,
    scale: 1 / 1300,
    speed: 0.009,
    wisp: 0.55,
  },
  {
    color: 0x73b8b6,
    warm: 0xf5d7a4,
    yTop: 860,
    yFull: 1340,
    alphaTop: 0.12,
    alpha: 0.5,
    wellX: 3098,
    wellY: WELL_Y + 100,
    wellR: 480,
    wellAlpha: 0.14,
    scale: 1 / 1100,
    speed: 0.012,
    wisp: 0.6,
  },
];

const HANG = [
  { seed: 501, vines: 10, moss: 4, fronds: 10, vineLen: [70, 190], amp: 0.03 },
  { seed: 502, vines: 18, moss: 12, fronds: 14, vineLen: [90, 280], amp: 0.04 },
  { seed: 503, vines: 26, moss: 16, fronds: 18, vineLen: [110, 380], amp: 0.05 },
] as const;

/** Birds far away, between far0 and far1. Speed in layer px/s. */
const BIRDS = { seed: 31, count: 5, size: 9, spacing: 34, speed: 26, startX: 1150, y: 800, flap: 7.5 };
/** The moonlit waterfall of the left glade (far1 coordinates). */
const WATERFALL = { x: 1960, top: 600, bottom: 1262, width: 120, color: 0xf2faff, alpha: 0.62, speed: 0.5 };
/** The colossal hollow tree of the right stand: which far2 trunk it is, and the glow inside. */
const HOLLOW = { x: 3700, w: 560, glow: 0xffb48a, glowAlpha: 0.5 };

/** How each layer takes on the zone moods (see ZONES in bg-bake). */
const ZONE: ReadonlyArray<Omit<ZoneSpec, 'anchorX'>> = [
  {
    parallax: 0.12,
    tintL: [0.74, 0.94, 1.22],
    tintR: [1.04, 0.84, 1.1],
    mistL: 0xa9cdea,
    mistR: 0xbba6d2,
    wellL: { x: 2190, y: 650, r: 380, alpha: 0.5, color: 0xdcefff },
    wellR: { x: 3560, y: 730, r: 340, alpha: 0.55, color: 0xffc4a4 },
  },
  {
    parallax: 0.25,
    tintL: [0.76, 0.95, 1.2],
    tintR: [1.02, 0.85, 1.1],
    mistL: 0x86b8de,
    mistR: 0xa290c4,
    wellL: { x: 1960, y: 520, r: 380, alpha: 0.26, color: 0xcfe6ff },
    wellR: { x: 3900, y: 780, r: 340, alpha: 0.42, color: 0xf7b3ae },
  },
  {
    parallax: 0.42,
    tintL: [0.8, 0.96, 1.16],
    tintR: [0.98, 0.87, 1.08],
    mistL: 0x5f9ccb,
    mistR: 0x8078b0,
    wellR: { x: 4060, y: 820, r: 360, alpha: 0.26, color: 0xe9a8c0 },
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
      wellX: 2942,
      wellHalf: 250,
      wellLift: 300,
      openLift: 150,
      trunks: [
        { x: 1745, w: 180, lean: 30 },
        { x: 2030, w: 90, lean: 26, branches: 1 },
        { x: 2440, w: 400, lean: -50, branches: 3 },
        { x: 2700, w: 46, lean: -18, branches: 1 },
        { x: 3250, w: 230, lean: 56 },
        { x: 3420, w: 70, lean: -14, branches: 1 },
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
      wellX: 3010,
      wellHalf: 300,
      wellLift: 330,
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
        { x: 3400, w: 160, lean: -90, branches: 2 },
        { x: 3640, w: 320, lean: -20, branches: 3 },
        { x: 4070, w: 90, lean: 34, branches: 1 },
        { x: 4280, w: 270, lean: -30 },
      ],
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
      wellX: 3098,
      wellHalf: 340,
      wellLift: 380,
      openLift: 270,
      drop: (x) => 60 * Math.exp(-(((x - 4350) / 400) ** 2)) - 300 * Math.exp(-(((x - 4060) / 150) ** 2)),
      groundRows: 1,
      accentRate: 0.1,
      amber: 0xd9a04a,
      blossom: 0xd9c2ff,
      onTrunk: (c, r, tr, L) => {
        if (tr.spec.x === HOLLOW.x) hollow(c, r, tr, l2, L);
      },
      trunks: [
        { x: 1230, w: 500, lean: 20, branches: 3, roots: 3 },
        { x: 2040, w: 120, lean: -30, branches: 1 },
        { x: 2480, w: 160, lean: -56, branches: 2 },
        { x: 2860, w: 76, lean: 130, branches: 1, roots: 1 },
        { x: HOLLOW.x, w: HOLLOW.w, lean: -44, branches: 3, roots: 3, boughs: 3 },
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

/** far1: the left glade's landmark, a mossy bluff with a tall moonlit waterfall (live shimmer on top). */
function waterfallCliff(c: Container, r: Rng, look: (typeof LOOKS)[number]): void {
  const g = c.addChild(new Graphics());
  const n = fbm1(77);
  const w = WATERFALL;
  const stone = mix(0x040d18, PALETTE.shadowIndigo, 0.3);
  const face = (t: number): { x: number; y: number } => ({
    x: w.x + 26 * Math.sin(t * 5),
    y: 1300 - (1300 - w.top + 90) * t,
  });
  g.poly(
    ribbon(face, (t, side) => (270 - 120 * t) * (1 + n(t * 7 + side * 3) * 0.28) + (side === 1 ? 30 : 0), 30),
  ).fill(stone);
  // A dark cleft the water falls through, and lighter ledges stepping down the face.
  g.poly(ribbon(face, (t) => w.width * (0.55 + 0.2 * t) * (1 + n(t * 9) * 0.2), 20, 0.02, 0.9)).fill({
    color: look.bark.dark,
    alpha: 0.55,
  });
  for (let i = 0; i < 12; i++) {
    const y = w.top + 30 + i * rr(r, 40, 62);
    const side = i % 2 === 0 ? 1 : -1;
    const x = w.x + side * rr(r, 90, 210);
    g.poly(
      ribbon(
        quad(
          { x: x - rr(r, 40, 90), y: y + rr(r, -8, 8) },
          { x, y: y - 12 },
          { x: x + rr(r, 40, 90), y: y + rr(r, -6, 14) },
        ),
        (t) => 3 + 8 * Math.sin(Math.PI * t),
        8,
      ),
    ).fill({ color: look.bark.lit, alpha: 0.4 });
  }
  const fall = ribbon(
    (t) => ({ x: w.x + 6 * Math.sin(t * 9), y: w.top + (w.bottom - w.top) * t }),
    (t) => (w.width / 2) * (0.34 + 0.34 * t) * (1 + n(t * 11) * 0.16),
    24,
  );
  g.poly(fall).fill({ color: w.color, alpha: 0.8 });
  for (let i = 0; i < 6; i++) {
    const x = w.x + rr(r, -230, 230);
    const y = w.top - 70 + Math.abs(x - w.x) * 0.25;
    foliageMass(c.addChild(new Graphics()), x, y, rr(r, 70, 130), rr(r, 40, 70), r, look.leaf);
  }
}

/** far2: the right stand's landmark, a colossal tree hollowed out at the base, lit from inside. */
function hollow(c: Container, r: Rng, tr: Trunk, look: (typeof LOOKS)[number], L: LightMap): void {
  const g = c.addChild(new Graphics());
  const w = tr.spec.w;
  const base = tr.at(0.02, -0.05);
  const h = w * 1.05;
  const hw = w * 0.3;
  const n = fbm1(42);
  // A pointed, lopsided arch.
  const pts: number[] = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const a = Math.PI * t;
    const k = 1 + n(t * 6) * 0.12;
    pts.push(
      base.x - Math.cos(a) * hw * k * (1 - 0.25 * Math.sin(a) ** 3),
      base.y + 10 - Math.sin(a) ** 0.8 * h * k,
    );
  }
  g.poly(pts).fill(mix(look.bark.dark, 0x000000, 0.35));
  // The warm inside, set back from the lip.
  const inner = pts.map((v, i) =>
    i % 2 === 0 ? base.x + (v - base.x) * 0.8 + hw * 0.1 : base.y + 10 + (v - base.y - 10) * 0.88,
  );
  g.poly(inner).fill({ color: 0x3a1f2c, alpha: 0.9 });
  // Aerial roots hanging across the opening.
  for (let i = 0; i < 7; i++) {
    const x = base.x + rr(r, -0.8, 0.8) * hw;
    const top = base.y - h * (0.55 + 0.35 * (1 - ((x - base.x) / hw) ** 2));
    const mid = { x: x + rr(r, -14, 14), y: top + 60 };
    const end = { x: x + rr(r, -22, 22), y: top + rr(r, 80, 190) };
    g.poly(taper(quad({ x, y: top }, mid, end), 9, 1.5, 7)).fill(look.bark.base);
  }
  L.reset(base.x, base.y - h * 0.4, hw * 1.3, h * 0.7, 0.95);
  L.lit(base.x, base.y - h * 0.15, hw * 1.0, h * 0.45, 0.75);
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
uniform vec3 uWater;
void main() {
  float t = uFall.x;
  float across = abs(vUV.x - 0.5) * 2.0;
  float width = mix(0.36, 0.7, vUV.y);
  float body = 1.0 - smoothstep(width * 0.35, width, across);
  float n = texture(uNoise, vec2(vUV.x * 0.9, vUV.y * 0.55 - t * uFall.z)).r;
  float m = texture(uNoise, vec2(vUV.x * 2.3 + 0.37, vUV.y * 1.3 - t * uFall.z * 1.7)).g;
  float streak = smoothstep(0.35, 0.8, n * 0.6 + m * 0.55);
  float ends = smoothstep(0.0, 0.12, vUV.y) * (1.0 - smoothstep(0.9, 1.0, vUV.y));
  float a = body * streak * ends * uFall.y;
  // Spray where it lands.
  vec2 d = (vUV - vec2(0.5, 0.92)) * vec2(3.4, 13.0);
  a += exp(-dot(d, d)) * uFall.y * (0.5 + 0.3 * m) * (1.0 - smoothstep(0.94, 1.0, vUV.y));
  fragColor = vec4(uWater * a, a);
}`;

class LiveFall {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly u: UniformGroup;
  constructor(color: number) {
    const w = WATERFALL;
    this.u = new UniformGroup({
      uFall: { value: new Float32Array([0, w.alpha, w.speed, 0]), type: 'vec4<f32>' },
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
      geometry: quadGeometry(w.x - w.width, w.top - 10, w.width * 2, w.bottom - w.top + 40),
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
  view: LayerView;
  sway: SwaySet;
  fall: LiveFall | null;
}

export class FarLayers implements EnvModule {
  private ctx!: SceneContext;
  private readonly built: FarLayer[] = [];
  private flock: Flock | null = null;
  private readonly hollowGlow: Array<{ s: Sprite; base: number }> = [];

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const rects = NAMES.map((n) => {
      const c = ctx.layers.coverage(n);
      return { x: c.x - PAD, y: c.y - PAD, w: c.w + PAD * 2, h: c.h + PAD * 2 };
    });
    plans(rects).forEach((plan, i) => {
      const name = NAMES[i] ?? 'far0';
      const layer = ctx.layers.far[i];
      const atm = ATM[i];
      const fogSpec = FOG[i];
      const hang = HANG[i];
      if (!layer || !atm || !fogSpec || !hang) return;
      const scale = BAKE_SCALE[i] ?? 1;
      if (i === 1) {
        // Behind far1's trunks, in front of far0 and its mist.
        this.flock = new Flock(plan.rect, atmTone(atm, 0x1b3b47, plan.wellX - 600, BIRDS.y));
        layer.addChild(this.flock.container);
      }
      const b: ForestBuild = buildForest(plan);
      const view = new LayerView(
        bakeLayer(ctx.renderer, b.content, plan.rect, scale, atm, TO_LIGHT, b.lights),
        fogSpec,
        { amp: RUSTLE[i] ?? 0, y0: plan.canopyY + 60, y1: plan.canopyY + 320 },
        { ...(ZONE[i] ?? ZONE[0]), anchorX: ctx.layers.anchor.x } as ZoneSpec,
      );
      layer.addChild(view.container);
      b.content.destroy({ children: true });

      let fall: LiveFall | null = null;
      if (i === 1) {
        fall = new LiveFall(WATERFALL.color);
        layer.addChild(fall.mesh);
      }
      if (i === 2) {
        // The warm glow inside the hollow tree (plain additive sprites, breathing slowly).
        const gy = plan.groundY - HOLLOW.w * 0.3;
        for (const [k, size] of [
          [1, HOLLOW.w * 0.9],
          [0.6, HOLLOW.w * 1.9],
        ] as const) {
          const s = new Sprite(softTexture());
          s.anchor.set(0.5);
          s.position.set(HOLLOW.x - 14, gy);
          s.setSize(size * 0.8, size);
          s.tint = HOLLOW.glow;
          s.blendMode = 'add';
          s.alpha = HOLLOW.glowAlpha * k;
          layer.addChild(s);
          this.hollowGlow.push({ s, base: HOLLOW.glowAlpha * k });
        }
      }
      const items = [...hangers(plan, b, atm, hang), ...landmarkHangers(i, atm)];
      const sway = new SwaySet(ctx.renderer, items, Math.max(1, scale * 1.2));
      layer.addChild(sway.container);
      this.built.push({ name, view, sway, fall });
    });
  }

  update(frame: SceneFrame): void {
    for (const l of this.built) {
      l.view.update(frame.clock, frame.camera.x);
      l.sway.update(frame.clock, this.ctx.layers.visible(l.name, frame.camera));
      l.fall?.update(frame.clock);
    }
    this.flock?.update(frame.clock);
    for (const g of this.hollowGlow) g.s.alpha = g.base * (0.82 + 0.18 * Math.sin(frame.clock * 0.6));
  }
}
