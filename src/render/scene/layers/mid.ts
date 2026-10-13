/**
 * Mid forest (parallax 0.68): the detailed layer right behind the playfield. Big trunks with bark
 * bands, streaks and moss, bridging roots, fern masses, bushes, hanging vines and moss curtains,
 * and a few clusters of dim bioluminescent caps.
 *
 * Same pipeline as the far layers (compose -> bake -> atmosphere pass), at a crisper scale. Its
 * values are kept compressed and cool so it never competes with the playfield, and nothing in it
 * has a flat top at a height the player could reach. Live per frame: sway sprites, the pulsing
 * glows (plain additive sprites: nothing is registered as a light), a few far fireflies and a
 * thin ground mist.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import {
  type Atmosphere,
  bakeLayer,
  bakeSoft,
  coverRect,
  type FogSpec,
  glowTexture,
  LayerView,
  type LightMap,
  type StageSpec,
  SwaySet,
  type ZoneSpec,
  zoneWeights,
} from '../lib/bg-bake';
import { buildForest, type ForestBuild, type ForestPlan, forestLook, hangers } from '../lib/bg-forest';
import {
  blob,
  fern,
  foliageMass,
  leafPts,
  mushroom,
  quad,
  type Rng,
  ribbon,
  rr,
  TO_LIGHT,
  type Trunk,
  taper,
} from '../lib/bg-shapes';
import { mix, PALETTE, prng } from '../lib/look';

const MID = {
  bakeScale: 1.5,
  /** Canopy rustle amplitude in layer px. */
  rustle: 4,
  pad: 60,
  groundY: 1345,
  canopyY: 585,
  // Right of the high ledge (playfield x ~3000): the hero there stands against dark canopy with
  // the light beside her, over the trunk pair.
  wellX: 3450,
  /** Fern clumps and bushes per 1000 px of ground. */
  ferns: 7,
  fernSize: [90, 190],
  /** Moss patches per trunk. */
  mossPerTrunk: 4,
  /** Bioluminescent clusters: layer x of each, caps per cluster. */
  /**
   * Kept clear of the moth-lanterns and the heart, which must be the lights where they stand: with
   * this layer's parallax a cluster at layer x L sits behind playfield x L + 0.32 * (camX - 2880), so
   * no cluster (spread included) may come within ~350 px of the stone (1448) for any camera that shows
   * it, nor of the heart (5212) / far lantern (5524): layer x 1110..2550 and 4110..5250 stay empty.
   */
  glowClusters: [760, 960, 2700, 3050, 3620, 3960],
  /** How far a cluster's knots spread from its centre (layer px). */
  glowSpread: [40, 140],
  /** Dark plants poking out of the mist bed below the fern line, per 1000 px. */
  bedPlants: 4,
  /** Light seen through the openings of the canopy (sprites behind the bake). */
  skyHole: {
    size: 2.6,
    alpha: 0.5,
    color: 0xe0b060,
    left: 0x8fb4d8,
    right: 0xd08a6a,
    /** Openings above layer y `dimY[0]` keep only `dim` of their light (full again below `dimY[1]`). */
    dim: 0.28,
    dimY: [80, 420],
  },
  /** The canopy route's focal light: a hole in this layer's canopy with moonlight behind it. */
  // (Dim: at alpha 0.6 / 0xa8c8e6 it was a pale wedge, luma 150-190, cut straight by the trunk at 2160 and
  // notched by a clump, behind F4 and the high platform. It is a glow in the leaves now, not a window.)
  moonHole: { x: 2330, y: 470, half: 250, lift: 420, size: 640, alpha: 0.2, color: 0x7fa2c4 },
  /**
   * The pendant of canopy behind the wall-jump shaft (playfield x 3328-3584 is layer x ~3230-3320
   * for the cameras that show it): layer x, half width, how far it hangs below the canopy's edge.
   */
  shaftPendant: { x: 3275, half: 125, drop: 390 },
  /**
   * A narrow tongue of leaves hanging on from the pendant's tip (layer x, half width, extra drop):
   * the backdrop of glint shaft-3 (3455, 850) for cameras inside the shaft (layer x 3240-3300,
   * y 856-1000 as she climbs). Narrow on purpose: the gold light stays open on both sides of it,
   * and from the terrace (stop 4) it stands behind trunk A.
   */
  shaftTongue: { x: 3268, half: 62, drop: 150 },
  /**
   * Quiet backdrops for dormant glints (dim gold motes): no amber leaves, blossoms or lit clumps
   * there. `sky` is the summit glide's line over the right stand (playfield x 3900-5200, y -300..130
   * is layer x ~3350-4700, y < ~470 for the cameras of the glide); `shaft` is the pendant above.
   */
  quiet: {
    sky: { x0: 3250, x1: 4800, ease: 160, y: 470, yEase: 140 },
    shaft: { x0: 3080, x1: 3470, ease: 80, y0: 420, y1: 1100 },
  },
  /** Drifting leaves in the air of this layer. */
  fallingLeaves: 10,
  glowCaps: [4, 9],
  /** Cap size range in layer px, and how far the cap colour sinks toward shadow (they are embers, not lamps). */
  glowCapSize: [8, 17],
  glowCapDim: 0.45,
  glowAlpha: 0.12,
  fireflies: 16,
  /**
   * Layer rect kept free of wide hangers (moss curtains, fronds; vines stay): what shows beside the
   * far bluff's west face (playfield x 5140-5472, y 300-1088) for the clamped camera (x 4800) as its
   * y runs from 850 at the foot to 290 at the top.
   */
  bluffClear: { x: [4500, 4900], y: [380, 1060], w: 70 },
  hang: { seed: 604, vines: 40, moss: 26, fronds: 24, vineLen: [140, 560], amp: 0.06 },
  /**
   * THE MIST STAGE: paler fog pooled just above the walk line, behind the playfield, so the hero,
   * creatures and plants read as silhouettes (memory/reference-study.md). Peak opacity per zone:
   * set all three to 0 to remove it. Live: `__bg.stage(left, centre, right); __game.render()`.
   */
  stage: { left: 0.4, centre: 0.5, right: 0.4 },
  /** Slow life of the layer: sway of the canopy masses (px), shimmer of lit leaves, breathing light. */
  life: { breath: 3.2, shimmer: 0.14, openings: 0.07 },
} as const;

/** Where the stage lies (playfield px) and what it is made of. Follows content/scene/grove.json. */
const STAGE: Omit<StageSpec, 'strength'> = {
  // Cool blue-grey, warm amber-grey, violet-grey.
  color: [0x6a88a6, 0x9a8458, 0x8468a8],
  height: 260,
  below: 110,
  // Left bank, ground, the terrace (its step hides behind the bluff), ground, the hollow (96 down
  // and up again: narrow, so a short ease or the sheet never dips into it), the right rise. (The far
  // bluff, 640 px up at 5472, is not a step: its top is a ledge and its face a wall, below.)
  baseY: 1088,
  steps: [
    [384, 192],
    [2528, -128, 100],
    [3200, 128],
    [3744, 96, 60],
    [3968, -96, 60],
    [4608, -192],
  ],
  ease: 150,
  // Raised tops with their own thinner sheet: the bluff (a column of mist as wide as the ground's
  // sheet would stand in the air beside it), then the high ledge with its branch and trunk A's top,
  // trunk B's top with the summit bough, and the far bluff's top.
  ledges: [
    { x0: 2432, x1: 2624, y: 960, k: 0.7 },
    { x0: 2816, x1: 3328, y: 448, k: 1 },
    { x0: 5472, x1: 5900, y: 448, k: 1 },
  ],
  // The faces she kicks up with open air behind her: the far bluff (the last climb, in the darkest
  // corner of the scene: luma 5 behind her without this) and trunk A's bark above the well. Not the
  // shaft: its glints need the dark that MID.shaftPendant puts behind them.
  walls: [
    { x: 5472, y0: 448, y1: 1088, dir: -1, k: 0.85, reach: 330 },
    { x: 3200, y0: 448, y1: 1168, dir: -1, k: 0.4, reach: 240 },
  ],
  wisp: 0.5,
};

const ATM: Atmosphere = {
  fogColor: 0x1b190e,
  fogTop: 0.1,
  fogGround: 0.3,
  fogY0: 760,
  fogY1: 1400,
  wellX: MID.wellX,
  wellY: 640,
  wellR: 300,
  wellColor: 0xb08a48,
  wellStrength: 0.1,
  formDist: 46,
  formLit: 0.55,
  formShade: 0.5,
  rimDist: 4,
  rimColor: PALETTE.keyGold,
  rimStrength: 0.16,
  mottle: 0.2,
  gain: 0.58,
  litGain: 1.15,
  sunMix: 0.7,
  sunColor: 0xe0b040,
  sunColorL: 0xbfdcff,
  sunColorR: 0x7fd89a,
  zoneParallax: 0.68,
  sideBody: 0.22,
  sideLit: 0.8,
  sideRim: 3.4,
  // Warm olive-brown shadows in the centre; the ZONE tints turn them azure / violet at the sides.
  tint: [1.42, 1.0, 0.52],
  // Everywhere: clumps are dark shapes against the light, lit only on edges toward an opening.
  edgeOnly: 1,
  // Zone hue at bake time, sparing lit foliage (emerald on the right, not blue-violet).
  zoneTintL: [0.43, 0.92, 2.45],
  zoneTintR: [1.18, 0.46, 2.4],
  zoneSpare: 0.85,
  shadeTint: [0.24, 0.2, 0.16],
  saturation: 0.9,
  lid: 0.32,
  lidY0: 400,
  lidY1: 760,
  blur: 2.2,
};

const FOG: FogSpec = {
  color: 0x26221a,
  warm: 0x9a7a40,
  yTop: 1020,
  yFull: 1410,
  alphaTop: 0,
  // Thin: the paler mist near the ground is the stage's job; this veil only greys the darks.
  alpha: 0.28,
  wellX: MID.wellX,
  wellY: 760,
  wellR: 320,
  wellAlpha: 0.05,
  scale: 1 / 900,
  speed: 0.016,
  wisp: 0.65,
};

/** Zone moods for this layer (see ZONES in bg-bake). */
const ZONE: Omit<ZoneSpec, 'anchorX'> = {
  parallax: 0.68,
  // Tints for the sway strips only: the baked layer takes its zone hue at bake time (ATM.zoneTint*).
  tintL: [0.43, 0.92, 2.45],
  tintR: [1.18, 0.46, 2.4],
  mistL: 0x0e2a40,
  mistR: 0x2a1040,
};

/**
 * The right stand's landmark: a colossal trunk with a tall arched hollow glowing warm inside,
 * buttress roots, and lantern fungi climbing it. It lives in this layer so nothing nearer but
 * the playfield can stand in front of it. `rise` is the hollow's height (it has to clear the
 * playfield's raised ground, which hides everything below layer y ~1090 on the right).
 */
const HOLLOW = {
  x: 4600,
  w: 640,
  rise: 700,
  half: 0.23,
  /** The woken glow (warm gold), and the dull cold ember it is while the grove sleeps. */
  glow: 0xffb468,
  ember: 0x9a5a78,
  glowAlpha: 0.4,
  lanterns: 7,
  lantern: 0xffb866,
  /**
   * The glow answers the goal (memory/goal.md): its level (x glowAlpha) with 0, 1, 2 lanterns lit,
   * once the heart is awake (it swells there over `wakeSeconds`), and at the end of the ending hold.
   */
  levels: [0.15, 0.3, 0.45] as readonly number[],
  awake: 1.25,
  ended: 1.6,
  wakeSeconds: 2,
  endSeconds: 4,
  /** How fast the level eases between lantern steps (1/s). */
  ease: 1.6,
  /** Woken light spilling up the trunk and onto the canopy above it: peak alpha of those glows. */
  spill: 0.2,
  /** At the ending the openings of every zone warm: colour multiplier on the light behind the canopy. */
  endWarm: [1.3, 1.1, 0.8] as readonly [number, number, number],
};

const LOOK = forestLook({ leaf: 23, light: 0.42, streaks: 4.5, bands: 1.5, cool: 0, grooves: 2.6 });

const FERN = { ...LOOK.groundLeaf, light: 0.42 };

/** The playfield x a point of this layer sits behind when it is at the centre of the view. */
const playfieldX = (x: number): number => 2880 + (x - 2880) / ZONE.parallax;

interface GlowSpot {
  /** Peak alpha (default: MID.glowAlpha, dimmer for the big cluster haze). */
  alpha?: number;
  x: number;
  y: number;
  r: number;
  /** Vertical radius when not round. */
  ry?: number;
  color: number;
  /** Part of the hollow tree: `glow` follows the goal's level, `spill` shows only once the heart is awake. */
  hollow?: 'glow' | 'spill';
}

/** 0..1: how calm the canopy must be at a layer point (MID.quiet). */
function quiet(x: number, y: number): number {
  const st = (a: number, b: number, v: number): number => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const { sky, shaft } = MID.quiet;
  const inSky =
    st(sky.x0 - sky.ease, sky.x0 + sky.ease, x) *
    (1 - st(sky.x1 - sky.ease, sky.x1 + sky.ease, x)) *
    (1 - st(sky.y, sky.y + sky.yEase, y));
  const inShaft =
    st(shaft.x0 - shaft.ease, shaft.x0 + shaft.ease, x) *
    (1 - st(shaft.x1 - shaft.ease, shaft.x1 + shaft.ease, x)) *
    (y > shaft.y0 && y < shaft.y1 ? 1 : 0);
  return Math.max(inSky, inShaft);
}

function plan(rect: ForestPlan['rect'], spots: GlowSpot[]): ForestPlan {
  return {
    seed: 4400,
    rect,
    groundY: MID.groundY,
    groundAmp: 40,
    canopyY: MID.canopyY,
    canopyAmp: 90,
    canopyR: 200,
    wellX: MID.wellX,
    wellHalf: 300,
    wellLift: 260,
    openLift: 330,
    drop: (x) =>
      60 * Math.exp(-(((x - 4700) / 500) ** 2)) +
      50 * Math.exp(-(((x - 1900) / 450) ** 2)) +
      // A heavy bough of canopy hanging behind the high ledge.
      330 * Math.exp(-(((x - 2940) / 300) ** 2)) +
      // And a pendant of it behind the wall-jump shaft, so the glints that zigzag up it hang
      // against dark leaves, not against the well's glow.
      MID.shaftPendant.drop * Math.exp(-(((x - MID.shaftPendant.x) / MID.shaftPendant.half) ** 2)) +
      MID.shaftTongue.drop * Math.exp(-(((x - MID.shaftTongue.x) / MID.shaftTongue.half) ** 4)) -
      // The canopy route's focal opening: a hole the moonlight falls through.
      MID.moonHole.lift * Math.exp(-(((x - MID.moonHole.x) / MID.moonHole.half) ** 2)),
    trunks: [
      // The left glade's giant: 720 px wide, cropped by the frame top and bottom.
      { x: 1090, w: 720, lean: 40, branches: 3, roots: 4, boughs: 3 },
      { x: 2160, w: 300, lean: 60, branches: 2, roots: 2 },
      { x: 3800, w: 370, lean: -80, branches: 3, roots: 3 },
      { x: HOLLOW.x, w: HOLLOW.w, lean: -24, branches: 2, roots: 4, boughs: 3 },
      { x: 5150, w: 230, lean: 30, branches: 2 },
    ],
    rootsPerSide: 2,
    rootArch: 0.15,
    holes: 0,
    mounds: 6,
    moundR: 130,
    moss: 4,
    look: LOOK,
    front: (c, r, b) => trunkMoss(c, r, b),
    onTrunk: (c, r, tr, L) => {
      barkDetail(c, r, tr, L);
      if (tr.spec.x === HOLLOW.x) hollow(c, r, tr, L, spots);
    },
    groundRows: 2,
    accentRate: 0.17,
    amber: 0xd9a04a,
    blossom: 0xd9c2ff,
    boughs: 3,
    clearWell: true,
    crownOpen: 0.16,
    cover: (x) =>
      0.8 +
      0.08 * Math.sin(x / 700) +
      0.5 * Math.exp(-(((x - 2940) / 320) ** 2)) +
      0.4 * Math.exp(-(((x - MID.shaftPendant.x) / (MID.shaftPendant.half * 1.4)) ** 2)),
    quiet,
    floor: (c, r, b) => undergrowth(c, r, b, spots),
  };
}

/** The hollow: nested arches from dark lip to warm heart, aerial roots across it, lantern fungi around it. */
function hollow(c: Container, r: Rng, tr: Trunk, L: LightMap, spots: GlowSpot[]): void {
  const g = c.addChild(new Graphics());
  const w = tr.spec.w;
  const base = tr.at(0.01, -0.04);
  const h = HOLLOW.rise;
  const hw = w * HOLLOW.half;
  const wob = [r() * 6.28, r() * 6.28];
  const arch = (k: number, lift: number): number[] => {
    const pts: number[] = [];
    for (let i = 0; i <= 30; i++) {
      const a = (Math.PI * i) / 30;
      const n = 1 + 0.07 * Math.sin(a * 5 + (wob[0] ?? 0)) + 0.04 * Math.sin(a * 11 + (wob[1] ?? 0));
      // Pointed and a little lopsided, wider at the foot.
      const sx = Math.cos(a) * hw * k * n * (1 - 0.3 * Math.sin(a) ** 3) * (1 + 0.25 * (1 - Math.sin(a)));
      pts.push(
        base.x - sx + Math.sin(a) ** 2 * hw * 0.12,
        base.y + 20 - Math.sin(a) ** 0.75 * h * k * n - lift,
      );
    }
    return pts;
  };
  // A swollen lip of bark around the opening, lit on the side facing the key.
  g.poly(arch(1.16, 0)).fill({ color: LOOK.bark.dark, alpha: 0.55 });
  g.poly(arch(1.0, 0)).fill(0x04090f);
  g.poly(arch(0.86, 0)).fill(0x1c0f1c);
  // Baked dark: a dull ember deep inside. All of its light is live (it answers the goal).
  g.poly(arch(0.68, 0)).fill(0x24121c);
  g.poly(arch(0.48, 0)).fill(0x331a22);
  g.poly(arch(0.28, 0)).fill(0x4a2828);
  L.reset(base.x, base.y - h * 0.45, hw * 1.5, h * 0.75, 0.97);
  // Aerial roots and moss hanging across the mouth.
  for (let i = 0; i < 9; i++) {
    const u = rr(r, -0.85, 0.85);
    const x = base.x + u * hw;
    const top = base.y - h * (0.5 + 0.42 * (1 - u * u)) * rr(r, 0.9, 1);
    const len = rr(r, 90, 300);
    const mid = { x: x + rr(r, -16, 16), y: top + len * 0.5 };
    g.poly(
      taper(quad({ x, y: top }, mid, { x: x + rr(r, -26, 26), y: top + len }), rr(r, 6, 12), 1.5, 8),
    ).fill(i % 3 === 0 ? LOOK.bark.dark : 0x0a141a);
  }
  // Lantern fungi climbing both edges and up the trunk: small warm bulbs (their glow is live).
  const lg = c.addChild(new Graphics());
  for (let i = 0; i < HOLLOW.lanterns; i++) {
    // Low on the trunk only: higher up they sat right behind the far ledge's moth-lantern.
    const t = 0.03 + (i / HOLLOW.lanterns) * 0.27 + rr(r, -0.015, 0.015);
    const side = i % 2 === 0 ? 1 : -1;
    const p = tr.at(t, side * rr(r, 0.42, 0.86));
    const size = rr(r, 5, 9);
    lg.poly(
      taper(
        quad(p, { x: p.x + side * 4, y: p.y + size }, { x: p.x + side * 6, y: p.y + size * 2.2 }),
        3,
        2,
        4,
      ),
    ).fill(LOOK.bark.dark);
    lg.poly(blob(p.x, p.y, size * 0.8, size, r, 0.2, 12)).fill(mix(HOLLOW.lantern, LOOK.bark.dark, 0.7));
    spots.push({ x: p.x, y: p.y, r: size * 4.5, color: HOLLOW.lantern, alpha: 0.5, hollow: 'glow' });
  }
  // The heart of the hollow: two soft glows, the big one spilling onto the lip.
  const a = HOLLOW.glowAlpha;
  spots.push({ x: base.x, y: base.y - h * 0.3, r: hw * 1.5, color: HOLLOW.glow, alpha: a, hollow: 'glow' });
  spots.push({
    x: base.x,
    y: base.y - h * 0.42,
    r: h * 0.62,
    color: HOLLOW.glow,
    alpha: a * 0.5,
    hollow: 'glow',
  });
  // High in the mouth too: the playfield's raised ground hides the foot of the tree from below.
  spots.push({
    x: base.x + hw * 0.1,
    y: base.y - h * 0.62,
    r: hw * 1.2,
    color: HOLLOW.glow,
    alpha: a * 0.8,
    hollow: 'glow',
  });
  // Woken only: the light climbs the trunk above the mouth and reaches the canopy over the tree.
  const top = tr.at(Math.min(0.9, (h * 1.25) / tr.h), 0);
  const s = HOLLOW.spill;
  spots.push({
    x: top.x,
    y: top.y,
    r: hw * 1.7,
    ry: h * 0.55,
    color: HOLLOW.glow,
    alpha: s,
    hollow: 'spill',
  });
  spots.push({
    x: top.x - 40,
    y: MID.canopyY + 40,
    r: w * 1.5,
    ry: 260,
    color: HOLLOW.glow,
    alpha: s * 0.45,
    hollow: 'spill',
  });
}

/** What makes a trunk old: knots and hollows, broken stubs, shelf fungi, lichen. */
function barkDetail(c: Container, r: Rng, tr: Trunk, L: LightMap): void {
  const g = c.addChild(new Graphics());
  const w = tr.spec.w;
  const bark = LOOK.bark;
  // Lichen: pale blotches, mostly on the lit side.
  for (let i = 0; i < 9; i++) {
    const p = tr.at(rr(r, 0.05, 0.7), rr(r, -0.3, 0.85));
    const s = w * rr(r, 0.015, 0.045);
    g.poly(blob(p.x, p.y, s, s * rr(r, 1.2, 2.4), r, 0.6, 22)).fill({
      color: 0x6fae9c,
      alpha: rr(r, 0.06, 0.13),
    });
  }
  // Knots: a swollen lip lit from the upper right around a dark eye.
  const knots = Math.floor(r() * 2.6);
  for (let i = 0; i < knots; i++) {
    const p = tr.at(rr(r, 0.08, 0.6), rr(r, -0.6, 0.6));
    const s = w * rr(r, 0.035, 0.07);
    g.poly(blob(p.x + s * 0.12, p.y - s * 0.16, s * 1.25, s * 1.7, r, 0.2, 16)).fill({
      color: bark.lit,
      alpha: 0.4,
    });
    g.poly(blob(p.x - s * 0.1, p.y + s * 0.12, s * 1.15, s * 1.6, r, 0.2, 16)).fill({
      color: bark.dark,
      alpha: 0.5,
    });
    g.poly(blob(p.x, p.y, s * 0.8, s * 1.25, r, 0.25, 14)).fill(bark.base);
    g.poly(blob(p.x - s * 0.05, p.y + s * 0.05, s * 0.45, s * 0.8, r, 0.3, 12)).fill(bark.dark);
    L.shade(p.x, p.y, s * 1.6, s * 2, 0.35);
  }
  // Broken stubs: short limbs snapped off, pale splintered ends.
  const stubs = r() < 0.5 ? 1 : 0;
  for (let i = 0; i < stubs; i++) {
    const dir = r() < 0.5 ? -1 : 1;
    const from = tr.at(rr(r, 0.15, 0.6), dir * 0.8);
    const len = w * rr(r, 0.16, 0.32);
    // Steep, so a stub never reads as a step.
    const ang = dir === 1 ? -rr(r, 0.75, 1.15) : Math.PI + rr(r, 0.75, 1.15);
    const end = { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
    const mid = { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2 + len * 0.1 };
    const cv = quad(from, mid, end);
    const w0 = w * rr(r, 0.05, 0.085);
    g.poly(taper(cv, w0, w0 * 0.55, 8)).fill(bark.base);
    g.poly(
      ribbon(cv, (t, side) => (side === (dir === 1 ? -1 : 1) ? (w0 / 2) * (1 - 0.45 * t) : 0), 8, 0.15, 1),
    ).fill({
      color: bark.lit,
      alpha: 0.3,
    });
    // The snapped end: a pale ragged face.
    g.poly(blob(end.x, end.y, w0 * 0.2, w0 * 0.34, r, 0.5, 9)).fill({ color: bark.lit, alpha: 0.7 });
  }
  // Shelf fungi stepping up one edge: small pale half-discs.
  const shelves = 1 + Math.floor(r() * 3);
  for (let i = 0; i < shelves; i++) {
    const dir = r() < 0.6 ? 1 : -1;
    let t = rr(r, 0.1, 0.5);
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const p = tr.at(t, dir * rr(r, 0.8, 0.98));
      const s = w * rr(r, 0.02, 0.055);
      const pts: number[] = [];
      for (let j = 0; j <= 10; j++) {
        const a = Math.PI + (j / 10) * Math.PI;
        pts.push(p.x + dir * s * 0.5 + Math.cos(a) * s, p.y + Math.sin(a) * s * 0.42);
      }
      pts.push(p.x + dir * s * 1.3, p.y + s * 0.16, p.x - dir * s * 0.4, p.y + s * 0.2);
      g.poly(pts).fill(k % 2 === 0 ? 0x5f6f60 : 0x4c5d52);
      t += rr(r, 0.015, 0.07);
    }
  }
}

/** Moss patches clinging to the trunks, thicker on the shaded side and near the roots. */
function trunkMoss(c: Container, r: Rng, b: ForestBuild): void {
  const moss = { ...LOOK.leaf, size: 9, light: 0.62 };
  for (const tr of b.trunks) {
    for (let i = 0; i < MID.mossPerTrunk; i++) {
      const t = rr(r, 0.04, 0.55) ** 1.4;
      const u = rr(r, -0.85, 0.5);
      const p = tr.at(t, u);
      const s = tr.spec.w * rr(r, 0.06, 0.14);
      foliageMass(c.addChild(new Graphics()), p.x, p.y, s, s * rr(r, 1.1, 2.2), r, moss, 0.55, false);
    }
  }
}

/** Ferns and bushes along the ground, and the glow-cap clusters. */
function undergrowth(c: Container, r: Rng, b: ForestBuild, spots: GlowSpot[]): void {
  const x0 = 500;
  const x1 = 5300;
  const step = 1000 / MID.ferns;
  for (let x = x0; x < x1; x += step * rr(r, 0.4, 1.6)) {
    const y = b.groundAt(x) + rr(r, -10, 40);
    const size = rr(r, MID.fernSize[0], MID.fernSize[1]);
    fern(c.addChild(new Graphics()), x, y, size, r, FERN, 8 + Math.floor(r() * 6));
  }
  const g = c.addChild(new Graphics());
  for (const cx of MID.glowClusters) {
    // Cyan in the left glade, violet in the old stand on the right. Each cluster is a few uneven
    // knots at different heights and depths, never a row.
    const z = zoneWeights(playfieldX(cx));
    const violet = r() < 0.08 + 0.8 * z.r;
    const cap = mix(violet ? PALETTE.glowViolet : PALETTE.glowCyan, PALETTE.shadow, MID.glowCapDim);
    const knots = 1 + Math.floor(r() * 3);
    for (let k = 0; k < knots; k++) {
      const kx = cx + rr(r, -1, 1) * rr(r, MID.glowSpread[0], MID.glowSpread[1]);
      // 0 = on the ground line, 1 = up on a mound or root, 2 = sunk back into the mist bed.
      const tier = Math.floor(r() * 3);
      const ky =
        b.groundAt(kx) + (tier === 0 ? -rr(r, 10, 40) : tier === 1 ? -rr(r, 70, 170) : rr(r, 40, 130));
      const scale = tier === 2 ? 0.6 : 1;
      const n = Math.round(rr(r, MID.glowCaps[0], MID.glowCaps[1]) * 0.45);
      for (let i = 0; i < n; i++) {
        const x = kx + rr(r, -1, 1) ** 3 * 70;
        const y = ky + rr(r, -14, 14);
        const size = rr(r, MID.glowCapSize[0], MID.glowCapSize[1]) * scale;
        mushroom(g, x, y, size, r, cap, mix(cap, PALETTE.shadow, 0.6));
        spots.push({
          x,
          y: y - size * 1.2,
          r: size * 2.4,
          color: cap,
          alpha: MID.glowAlpha * (tier === 2 ? 0.5 : 0.9),
        });
      }
      spots.push({ x: kx, y: ky - 30, r: 80 * scale, color: cap, alpha: MID.glowAlpha * 0.35 });
    }
  }
  // The mist bed below the fern line: dark fronds and saplings poking through, in receding rows.
  const dark = { ...FERN, light: 0.1 };
  const bed = 1000 / MID.bedPlants;
  for (let row = 2; row >= 1; row--) {
    for (let x = x0; x < x1; x += bed * rr(r, 0.5, 1.6)) {
      const y = b.groundAt(x) + row * rr(r, 90, 150);
      const gg = c.addChild(new Graphics());
      if (r() < 0.6) {
        fern(gg, x, y, rr(r, 150, 260), r, dark, 7 + Math.floor(r() * 5));
      } else {
        // A tuft of tall blades fanning out of the mist.
        const blades = 3 + Math.floor(r() * 4);
        for (let k = 0; k < blades; k++) {
          const hgt = rr(r, 110, 250);
          const lean = rr(r, -0.5, 0.5) * hgt;
          const tip = { x: x + lean, y: y - hgt };
          gg.poly(taper(quad({ x, y }, { x: x + lean * 0.25, y: y - hgt * 0.6 }, tip), rr(r, 7, 12), 1, 8));
        }
        gg.fill(mix(LOOK.bark.dark, dark.dark, 0.5));
      }
    }
  }
}

interface Fly {
  s: Sprite;
  x: number;
  y: number;
  phase: number;
  speed: number;
}

export class MidLayer implements EnvModule {
  private ctx!: SceneContext;
  private sway!: SwaySet;
  private view!: LayerView;
  private readonly glows: Array<{ s: Sprite; phase: number; base: number; hollow?: 'glow' | 'spill' }> = [];
  /** The hollow's glow level (1 = the full pre-goal glow), eased; -1 = not set yet. */
  private hollowLevel = -1;
  private readonly flies: Fly[] = [];
  private readonly leaves: Array<{ g: Graphics; x: number; y: number; phase: number; fall: number }> = [];

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const rect = coverRect(ctx.layers, 'mid', MID.pad);
    const spots: GlowSpot[] = [];
    const p = plan(rect, spots);
    const b = buildForest(p);
    const layer = ctx.layers.mid;
    // Sky seen through the canopy's openings: soft light behind the bake, coloured by zone.
    const skyTex = glowTexture(ctx.renderer);
    const sky = new Container();
    for (const o of b.openings) {
      const z = zoneWeights(playfieldX(o.x));
      const s = new Sprite(skyTex);
      s.anchor.set(0.5);
      s.position.set(o.x, o.y);
      s.setSize(o.r * MID.skyHole.size, o.r * MID.skyHole.size);
      s.tint = mix(mix(MID.skyHole.color, MID.skyHole.left, z.l), MID.skyHole.right, z.r);
      // Under the dark lid high in the crown an opening is a dim glimmer, not a pale tab on the frame edge.
      const up = Math.max(
        0,
        Math.min(1, (o.y - MID.skyHole.dimY[0]) / (MID.skyHole.dimY[1] - MID.skyHole.dimY[0])),
      );
      s.alpha = MID.skyHole.alpha * (MID.skyHole.dim + (1 - MID.skyHole.dim) * up * up * (3 - 2 * up));
      sky.addChild(s);
    }
    {
      const h = MID.moonHole;
      for (const [k, a] of [
        [1, h.alpha],
        [0.5, h.alpha * 0.8],
      ] as const) {
        const s = new Sprite(skyTex);
        s.anchor.set(0.5);
        s.position.set(h.x, h.y);
        s.setSize(h.size * k, h.size * k * 1.2);
        s.tint = h.color;
        s.alpha = a;
        sky.addChild(s);
      }
    }
    const back = { texture: bakeSoft(ctx.renderer, sky, rect, 0.2), rect };
    this.view = new LayerView(
      bakeLayer(ctx.renderer, b.content, rect, MID.bakeScale, ATM, TO_LIGHT, b.lights),
      FOG,
      {
        amp: MID.rustle,
        y0: MID.canopyY + 80,
        y1: MID.canopyY + 380,
      },
      { ...ZONE, tintL: [1, 1, 1], tintR: [1, 1, 1], anchorX: ctx.layers.anchor.x },
      back,
      MID.life,
      { ...STAGE, strength: [MID.stage.left, MID.stage.centre, MID.stage.right] },
    );
    if (import.meta.env.DEV) {
      const g = globalThis as { __bg?: Record<string, unknown> };
      g.__bg = Object.assign(g.__bg ?? {}, {
        stage: (l: number, c = l, r = l) => this.view.setStage([l, c, r]),
      });
    }
    layer.addChild(this.view.container);
    b.content.destroy({ children: true });

    this.sway = new SwaySet(
      ctx.renderer,
      hangers(p, b, ATM, {
        ...MID.hang,
        // Hanging gardens: the right stand drips with vines and moss.
        weight: (x) => 0.45 + 0.55 * zoneWeights(playfieldX(x)).r,
        // No moss curtain or frond mass beside the far bluff's face: sway items are drawn over the
        // mist stage, and one hung black (luma 9) behind the top third of the scene's last climb.
        skip: (x, y, w) =>
          w > MID.bluffClear.w &&
          x > MID.bluffClear.x[0] &&
          x < MID.bluffClear.x[1] &&
          y > MID.bluffClear.y[0] &&
          y < MID.bluffClear.y[1],
      }),
      MID.bakeScale * 0.5,
      { ...ZONE, anchorX: ctx.layers.anchor.x },
    );
    layer.addChild(this.sway.container);

    const glowTex = glowTexture(ctx.renderer);
    const glowLayer = layer.addChild(new Container({ label: 'glow' }));
    const r = prng(717);
    for (const sp of spots) {
      const s = new Sprite(glowTex);
      s.anchor.set(0.5);
      s.position.set(sp.x, sp.y);
      s.setSize(sp.r * 2, (sp.ry ?? sp.r) * 2);
      s.tint = sp.color;
      s.blendMode = 'add';
      glowLayer.addChild(s);
      this.glows.push({ s, phase: r() * 6.283, base: sp.alpha ?? MID.glowAlpha, hollow: sp.hollow });
    }
    for (let i = 0; i < MID.fallingLeaves; i++) {
      const size = rr(r, 9, 16);
      const g = new Graphics()
        .poly(leafPts(-size / 2, 0, 0, size, size * 0.5))
        .fill(r() < 0.4 ? 0x8a7a3a : 0x1f5a44);
      g.alpha = 0.8;
      layer.addChild(g);
      this.leaves.push({ g, x: rr(r, 0, 1), y: rr(r, 0, 1), phase: r() * 6.283, fall: rr(r, 22, 46) });
    }
    for (let i = 0; i < MID.fireflies; i++) {
      const s = new Sprite(glowTex);
      s.anchor.set(0.5);
      const size = rr(r, 10, 20);
      s.setSize(size, size);
      s.tint = r() < 0.75 ? 0xd8ffd0 : PALETTE.glowCyan;
      s.blendMode = 'add';
      glowLayer.addChild(s);
      this.flies.push({
        s,
        x: rr(r, rect.x, rect.x + rect.w),
        y: rr(r, 820, 1300),
        phase: r() * 100,
        speed: rr(r, 0.25, 0.6),
      });
    }
  }

  update(frame: SceneFrame): void {
    const t = frame.clock;
    this.sway.update(t, frame.camera.x);
    this.view.update(t, frame.camera.x, frame.camera.y, this.ctx.layers.anchor.y);
    // The hollow tree answers the goal: a dull cold ember while the grove sleeps, a step warmer with
    // each lantern, swelling to full gold when the heart wakes and further through the ending.
    // Dev: `__bg.goal = {lit, heart: {awake, frames}, gathered, ending: {frames}}` previews a goal state.
    const preview = import.meta.env.DEV
      ? (globalThis as { __bg?: { goal?: typeof frame.sim.goal } }).__bg?.goal
      : undefined;
    const goal = preview ?? frame.sim.goal;
    const ease = (v: number): number => {
      const k = Math.max(0, Math.min(1, v));
      return k * k * (3 - 2 * k);
    };
    const H = HOLLOW;
    const wake = goal.heart.awake ? ease(goal.heart.frames / (H.wakeSeconds * 60)) : 0;
    const end = goal.gathered ? ease(goal.ending.frames / (H.endSeconds * 60)) : 0;
    const step = H.levels[Math.min(goal.lit, H.levels.length - 1)] ?? 0;
    const target = step + (H.awake - step) * wake + (H.ended - H.awake) * end;
    this.hollowLevel =
      this.hollowLevel < 0
        ? target
        : this.hollowLevel +
          (target - this.hollowLevel) * (1 - Math.exp(-frame.dt * H.ease * (wake > 0 ? 6 : 1)));
    const level = this.hollowLevel;
    // Cold ember -> gold as it rises through the lantern steps.
    const low = H.levels[0] ?? 0;
    const warmth = ease((level - low) / (H.awake - low));
    const hollowTint = mix(H.ember, H.glow, warmth);
    this.view.setWarm(end, H.endWarm);
    for (const g of this.glows) {
      const pulse = 0.72 + 0.28 * Math.sin(t * 0.9 + g.phase) + 0.08 * Math.sin(t * 2.3 + g.phase * 2);
      if (g.hollow === 'glow') {
        g.s.tint = hollowTint;
        // The ember barely stirs; the woken glow breathes.
        g.s.alpha = g.base * level * (1 - (1 - pulse) * (0.3 + 0.7 * wake));
      } else if (g.hollow === 'spill') {
        g.s.alpha = g.base * (wake + 0.5 * end) * (0.85 + 0.15 * Math.sin(t * 0.7 + g.phase));
      } else g.s.alpha = g.base * pulse;
    }
    // Leaves drift down through whatever part of the layer is in view, and wrap.
    const vis = this.ctx.layers.visible('mid', frame.camera);
    for (const l of this.leaves) {
      const fy = (((l.y + (t * l.fall) / vis.h) % 1) + 1) % 1;
      const sway = Math.sin(t * 0.9 + l.phase);
      const wx =
        ((((l.x * 1.3 * vis.w + t * 14 + sway * 40 - vis.x) % (vis.w * 1.3)) + vis.w * 1.3) % (vis.w * 1.3)) -
        vis.w * 0.15;
      l.g.position.set(vis.x + wx, vis.y - 30 + fy * (vis.h + 60));
      l.g.rotation = sway * 0.9 + t * 0.4 + l.phase;
      l.g.scale.y = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.7 + l.phase));
    }
    for (const f of this.flies) {
      const a = t * f.speed + f.phase;
      f.s.position.set(
        f.x + Math.sin(a) * 90 + Math.sin(a * 2.3 + 1) * 30,
        f.y + Math.cos(a * 1.3) * 50 + Math.sin(a * 3.1) * 14,
      );
      f.s.alpha = 0.35 + 0.45 * Math.max(0, Math.sin(a * 2.7 + f.phase));
    }
  }
}
