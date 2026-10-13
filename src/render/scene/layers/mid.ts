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
  type FogSpec,
  glowTexture,
  LayerView,
  type LightMap,
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
  wellX: 3234,
  /** Fern clumps and bushes per 1000 px of ground. */
  ferns: 7,
  fernSize: [90, 190],
  /** Moss patches per trunk. */
  mossPerTrunk: 4,
  /** Bioluminescent clusters: layer x of each, caps per cluster. */
  glowClusters: [700, 980, 1240, 1520, 1830, 2150, 2480, 3050, 3620, 4260, 4640, 4980],
  /** Light seen through the openings of the canopy (sprites behind the bake). */
  skyHole: { size: 3.4, alpha: 0.6, color: 0xfff0c4, left: 0xd4ecff, right: 0xffc9c0 },
  /** Drifting leaves in the air of this layer. */
  fallingLeaves: 10,
  glowCaps: [4, 9],
  glowAlpha: 0.2,
  fireflies: 16,
  hang: { seed: 604, vines: 40, moss: 26, fronds: 24, vineLen: [140, 560], amp: 0.06 },
} as const;

const ATM: Atmosphere = {
  fogColor: 0x2f7078,
  fogTop: 0.1,
  fogGround: 0.3,
  fogY0: 760,
  fogY1: 1400,
  wellX: MID.wellX,
  wellY: 640,
  wellR: 420,
  wellColor: 0xe9cf9c,
  wellStrength: 0.13,
  formDist: 46,
  formLit: 0.7,
  formShade: 0.32,
  rimDist: 4,
  rimColor: PALETTE.keyWarm,
  rimStrength: 0.34,
  mottle: 0.2,
  gain: 0.9,
  litGain: 1.7,
  sunMix: 0.7,
  sunColor: 0xc8e25e,
  shadeTint: [0.26, 0.4, 0.54],
  saturation: 0.85,
};

const FOG: FogSpec = {
  color: 0x4f9499,
  warm: 0xd9c79a,
  yTop: 1020,
  yFull: 1410,
  alphaTop: 0,
  alpha: 0.52,
  wellX: MID.wellX,
  wellY: 760,
  wellR: 460,
  wellAlpha: 0.07,
  scale: 1 / 900,
  speed: 0.016,
  wisp: 0.65,
};

/** Zone moods for this layer (see ZONES in bg-bake). */
const ZONE: Omit<ZoneSpec, 'anchorX'> = {
  parallax: 0.68,
  tintL: [0.82, 0.97, 1.16],
  tintR: [0.98, 0.88, 1.08],
  mistL: 0x4a86b8,
  mistR: 0x6c6aa2,
};

const LOOK = forestLook({ leaf: 23, light: 0.42, streaks: 4.5, bands: 1.5, cool: 0, grooves: 2.6 });

const FERN = { ...LOOK.groundLeaf, light: 0.42 };

/** The playfield x a point of this layer sits behind when it is at the centre of the view. */
const playfieldX = (x: number): number => 2880 + (x - 2880) / ZONE.parallax;

interface GlowSpot {
  x: number;
  y: number;
  r: number;
  color: number;
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
    wellHalf: 420,
    wellLift: 420,
    openLift: 330,
    drop: (x) => 60 * Math.exp(-(((x - 4700) / 500) ** 2)) + 50 * Math.exp(-(((x - 1900) / 450) ** 2)),
    trunks: [
      { x: 770, w: 330, lean: 50, branches: 2, roots: 2 },
      { x: 1390, w: 180, lean: -40, branches: 2 },
      { x: 2090, w: 420, lean: 70, branches: 3, roots: 3 },
      { x: 2650, w: 150, lean: -30, branches: 1 },
      { x: 3800, w: 370, lean: -80, branches: 3, roots: 3 },
      { x: 4390, w: 190, lean: 36, branches: 2 },
      { x: 4950, w: 460, lean: -30, branches: 3, roots: 3 },
    ],
    rootsPerSide: 2,
    rootArch: 0.3,
    holes: 0,
    mounds: 6,
    moundR: 130,
    moss: 4,
    look: LOOK,
    front: (c, r, b) => trunkMoss(c, r, b),
    onTrunk: (c, r, tr, L) => barkDetail(c, r, tr, L),
    groundRows: 2,
    accentRate: 0.12,
    amber: 0xd9a04a,
    blossom: 0xd9c2ff,
    boughs: 3,
    clearWell: true,
    cover: (x) => 0.66 + 0.1 * Math.sin(x / 700),
    floor: (c, r, b) => undergrowth(c, r, b, spots),
  };
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
  const stubs = Math.floor(r() * 3);
  for (let i = 0; i < stubs; i++) {
    const dir = r() < 0.5 ? -1 : 1;
    const from = tr.at(rr(r, 0.15, 0.6), dir * 0.8);
    const len = w * rr(r, 0.16, 0.32);
    const ang = dir === 1 ? -rr(r, 0.2, 0.7) : Math.PI + rr(r, 0.2, 0.7);
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
    // Cyan and plentiful in the left glade, violet in the old stand on the right.
    const z = zoneWeights(playfieldX(cx));
    const n = Math.round((MID.glowCaps[0] + r() * (MID.glowCaps[1] - MID.glowCaps[0])) * (0.6 + 0.5 * z.l));
    const violet = r() < 0.08 + 0.8 * z.r;
    const cap = violet ? mix(PALETTE.glowViolet, 0xffffff, 0.15) : PALETTE.glowCyan;
    for (let i = 0; i < n; i++) {
      const x = cx + rr(r, -110, 110);
      const y = b.groundAt(x) - rr(r, 10, 50);
      const size = rr(r, 12, 30);
      mushroom(g, x, y, size, r, cap, mix(cap, PALETTE.shadow, 0.6));
      spots.push({ x, y: y - size * 1.2, r: size * 2.6, color: cap });
    }
    spots.push({ x: cx, y: b.groundAt(cx) - 50, r: 170, color: cap });
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
  private readonly glows: Array<{ s: Sprite; phase: number; base: number }> = [];
  private readonly flies: Fly[] = [];
  private readonly leaves: Array<{ g: Graphics; x: number; y: number; phase: number; fall: number }> = [];

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const cov = ctx.layers.coverage('mid');
    const rect = { x: cov.x - MID.pad, y: cov.y - MID.pad, w: cov.w + MID.pad * 2, h: cov.h + MID.pad * 2 };
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
      s.alpha = MID.skyHole.alpha;
      sky.addChild(s);
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
      { ...ZONE, anchorX: ctx.layers.anchor.x },
      back,
    );
    layer.addChild(this.view.container);
    b.content.destroy({ children: true });

    this.sway = new SwaySet(
      ctx.renderer,
      hangers(p, b, ATM, {
        ...MID.hang,
        // Hanging gardens: the right stand drips with vines and moss.
        weight: (x) => 0.45 + 0.55 * zoneWeights(playfieldX(x)).r,
      }),
      MID.bakeScale,
    );
    layer.addChild(this.sway.container);

    const glowTex = glowTexture(ctx.renderer);
    const glowLayer = layer.addChild(new Container({ label: 'glow' }));
    const r = prng(717);
    for (const sp of spots) {
      const s = new Sprite(glowTex);
      s.anchor.set(0.5);
      s.position.set(sp.x, sp.y);
      s.setSize(sp.r * 2, sp.r * 2);
      s.tint = sp.color;
      s.blendMode = 'add';
      glowLayer.addChild(s);
      this.glows.push({ s, phase: r() * 6.283, base: MID.glowAlpha * (sp.r > 100 ? 0.55 : 1) });
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
    this.sway.update(t, this.ctx.layers.visible('mid', frame.camera));
    this.view.update(t, frame.camera.x);
    for (const g of this.glows) {
      g.s.alpha =
        g.base * (0.72 + 0.28 * Math.sin(t * 0.9 + g.phase) + 0.08 * Math.sin(t * 2.3 + g.phase * 2));
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
