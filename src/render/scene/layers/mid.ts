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
import { type Atmosphere, bakeLayer, type FogSpec, glowTexture, LayerView, SwaySet } from '../lib/bg-bake';
import { buildForest, type ForestBuild, type ForestPlan, forestLook, hangers } from '../lib/bg-forest';
import { fern, foliageMass, mushroom, type Rng, rr, TO_LIGHT } from '../lib/bg-shapes';
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
  glowClusters: [820, 1650, 2380, 3050, 3620, 4260, 4980],
  glowCaps: [4, 9],
  glowAlpha: 0.26,
  fireflies: 16,
  hang: { seed: 604, vines: 34, moss: 22, fronds: 20, vineLen: [140, 520], amp: 0.06 },
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

const LOOK = forestLook({ leaf: 23, light: 0.42, streaks: 4.5, bands: 1.5, cool: 0, grooves: 2.6 });

const FERN = { ...LOOK.groundLeaf, light: 0.42 };

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
    drop: (x) => 110 * Math.exp(-(((x - 4700) / 500) ** 2)) + 70 * Math.exp(-(((x - 1900) / 450) ** 2)),
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
    floor: (c, r, b) => undergrowth(c, r, b, spots),
  };
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
    const n = MID.glowCaps[0] + Math.floor(r() * (MID.glowCaps[1] - MID.glowCaps[0]));
    const violet = r() < 0.3;
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

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const cov = ctx.layers.coverage('mid');
    const rect = { x: cov.x - MID.pad, y: cov.y - MID.pad, w: cov.w + MID.pad * 2, h: cov.h + MID.pad * 2 };
    const spots: GlowSpot[] = [];
    const p = plan(rect, spots);
    const b = buildForest(p);
    const layer = ctx.layers.mid;
    this.view = new LayerView(bakeLayer(ctx.renderer, b.content, rect, MID.bakeScale, ATM, TO_LIGHT), FOG, {
      amp: MID.rustle,
      y0: MID.canopyY + 80,
      y1: MID.canopyY + 380,
    });
    layer.addChild(this.view.container);
    b.content.destroy({ children: true });

    this.sway = new SwaySet(ctx.renderer, hangers(p, b, ATM, MID.hang), MID.bakeScale);
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
    this.view.update(t);
    for (const g of this.glows) {
      g.s.alpha =
        g.base * (0.72 + 0.28 * Math.sin(t * 0.9 + g.phase) + 0.08 * Math.sin(t * 2.3 + g.phase * 2));
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
