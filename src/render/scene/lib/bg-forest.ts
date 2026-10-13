/**
 * Composes one background forest layer (far0..2, mid) out of bg-shapes: a canopy bank with ragged
 * leafy edges and punched light holes, colossal trunks with roots and branches, undergrowth
 * mounds along a rolling ground line. Returns Graphics in layer coordinates, ready for
 * bakeLayer(), plus what the caller needs to hang swaying things in sensible places.
 *
 * Colours here are "local" colours (dark, saturated). Distance comes from the atmosphere pass.
 */
import { Container, Graphics } from 'pixi.js';
import type { LayerRect } from '../layer-tree';
import { type Atmosphere, atmTone, LightMap, type SwayItem } from './bg-bake';
import {
  type BarkLook,
  blob,
  clump,
  drawBranch,
  drawRoots,
  drawTrunk,
  fbm1,
  foliageMass,
  type LeafLook,
  leafPts,
  mossCurtain,
  type Pt,
  type Rng,
  rr,
  smooth,
  Trunk,
  vine,
} from './bg-shapes';
import { mix, PALETTE, prng } from './look';

export interface TrunkPlace {
  x: number;
  w: number;
  lean?: number;
  flare?: number;
  /** Branch count (default 2). */
  branches?: number;
  /** Roots per side (default from the plan). */
  roots?: number;
  boughs?: number;
}

export interface ForestLook {
  bark: BarkLook;
  /** Front canopy and branch foliage. */
  leaf: LeafLook;
  /** The paler tier of canopy behind the trunks. */
  backLeaf: LeafLook;
  /** Undergrowth mounds. */
  groundLeaf: LeafLook;
  ground: number;
  vineStem: number;
  moss: readonly number[];
}

export interface ForestPlan {
  seed: number;
  rect: LayerRect;
  groundY: number;
  groundAmp: number;
  /** Nominal bottom edge of the canopy bank, its wobble, and the size of its leaf masses. */
  canopyY: number;
  canopyAmp: number;
  canopyR: number;
  /** The light well: the canopy lifts by wellLift around wellX (gaussian of half-width wellHalf). */
  wellX: number;
  wellHalf: number;
  wellLift: number;
  /** The canopy also opens in big irregular lobes: how far the bottom edge lifts in the open ones. */
  openLift?: number;
  /** Extra canopy drop by x (positive = lower, denser). */
  drop?: (x: number) => number;
  trunks: readonly TrunkPlace[];
  rootsPerSide: number;
  rootArch: number;
  /** Light holes punched through the canopy per 1000 px. */
  holes: number;
  /** Undergrowth mounds per 1000 px and their radius. */
  mounds: number;
  moundR: number;
  /** Static moss curtains under the canopy per 1000 px. */
  moss: number;
  look: ForestLook;
  /** Landmarks: drawn behind the trunks / in front of them (before the ground). */
  behind?: (c: Container, r: Rng, L: LightMap) => void;
  front?: (c: Container, r: Rng, b: ForestBuild) => void;
  /** Called after each trunk is painted (bark detail, hollows). */
  onTrunk?: (c: Container, r: Rng, tr: Trunk, L: LightMap) => void;
  /** Extra painted light, laid down last. */
  lights?: (L: LightMap) => void;
  /** How much of the near canopy is present at x, 0..1 (default 0.72). */
  cover?: (x: number) => number;
  /** No branch-tip foliage inside the light well. */
  clearWell?: boolean;
  /** Canopy boughs per trunk (default 2). */
  boughs?: number;
  /** Share of near clumps that carry autumn leaves or blossoms, and their colours. */
  accentRate?: number;
  amber?: number;
  blossom?: number;
  /** Extra rows of bushes stepping down below the ground line. */
  groundRows?: number;
  /** Drawn last, over the ground. */
  floor?: (c: Container, r: Rng, b: ForestBuild) => void;
}

export interface ForestBuild {
  content: Container;
  lights: LightMap;
  trunks: Trunk[];
  /** Branch tips carrying foliage. */
  tips: Pt[];
  /** Where the near canopy opens (centres and sizes of the clumps left out). */
  openings: Array<{ x: number; y: number; r: number }>;
  canopyBottom(x: number): number;
  groundAt(x: number): number;
}

export function buildForest(plan: ForestPlan): ForestBuild {
  const { rect, look } = plan;
  const content = new Container();
  const L = new LightMap();
  const x0 = rect.x - 120;
  const x1 = rect.x + rect.w + 120;
  const top = rect.y - 80;
  const bottom = rect.y + rect.h + 80;
  const R = plan.canopyR;

  const cn = fbm1(plan.seed + 1);
  const cn2 = fbm1(plan.seed + 2);
  const cn3 = fbm1(plan.seed + 4);
  const gn = fbm1(plan.seed + 3);
  const canopyBottom = (x: number): number => {
    const d = (x - plan.wellX) / plan.wellHalf;
    return (
      plan.canopyY +
      cn(x / (R * 2.6)) * plan.canopyAmp +
      (plan.drop ? plan.drop(x) : 0) -
      (plan.openLift ?? 0) * smooth(0.0, 0.5, cn3(x / (R * 5.5))) -
      plan.wellLift * Math.exp(-d * d)
    );
  };
  const groundAt = (x: number): number => plan.groundY + gn(x / 430) * plan.groundAmp;
  const cover = plan.cover ?? ((): number => 0.72);
  const layer = (): Graphics => content.addChild(new Graphics());
  const opening = fbm1(plan.seed + 5);
  const openings: Array<{ x: number; y: number; r: number }> = [];
  const rows = Math.max(1, Math.min(4, Math.ceil((plan.canopyY + plan.canopyAmp - top) / (R * 0.9))));

  /**
   * One depth tier of canopy: rows of big clumps (top rows first, the hanging edge last), each
   * with medium and small satellites. Clumps drop out in clusters, so the tier has real gaps
   * that show the tier, the layer or the sky behind it. There is no solid fill anywhere.
   */
  const tier = (
    seed: number,
    lk: LeafLook,
    o: {
      offset: (x: number) => number;
      cover: number;
      light: number;
      leaf: number;
      sat: number;
      accents: boolean;
      detail: number;
    },
  ): void => {
    const r = prng(seed);
    const gap = fbm1(seed + 0.5);
    const rate = plan.accentRate ?? 0;
    for (let row = rows; row >= 0; row--) {
      for (let x = x0; x < x1; x += R * rr(r, 0.7, 1.3)) {
        const e = canopyBottom(x) + o.offset(x);
        const y = e - R * (0.45 + row * 0.88) + rr(r, -0.25, 0.25) * R;
        const keep = gap(x / (R * 2.4) + row * 7.3) * 0.5 + 0.5;
        const rad = R * rr(r, 0.55, 1.2);
        const leaf = o.leaf * rr(r, 0.75, 1.35);
        const pick = r();
        const ns = Math.floor(r() * (o.sat + 1));
        const sats: Array<[number, number, number]> = [];
        for (let k = 0; k < ns; k++)
          sats.push([rr(r, 0.05, Math.PI - 0.05), rr(r, 0.8, 1.3), rr(r, 0.2, 0.46)]);
        // Openings shared by every tier (real sky holes), then this tier's own gaps.
        const open = opening(x / (R * 3.6) + row * 1.9) * 0.5 + 0.5;
        const c = cover(x);
        const isOpen = open > c - 0.15;
        if (isOpen && o.accents && y > top) openings.push({ x, y, r: rad });
        if (y < top - R || isOpen || keep > c * o.cover + 0.12) continue;
        const accent = o.accents && pick < rate ? (pick < rate * 0.55 ? 'amber' : 'blossom') : null;
        const accentColor = accent === 'amber' ? plan.amber : plan.blossom;
        const g = layer();
        // Clumps on the brink of an opening catch the light that falls through it.
        const light = o.light * (row === 0 ? 0.85 : 0.7) * (0.55 + 1.3 * smooth(c - 0.5, c - 0.1, open));
        clump(g, L, x, y, rad, lk, r, { leaf, light, accent, accentColor, detail: o.detail });
        for (const [a, d, k] of sats) {
          const sx = x + Math.cos(a) * rad * d * 1.15;
          clump(g, L, sx, y + Math.sin(a) * rad * d * 0.7, rad * k, lk, r, {
            leaf: leaf * 0.8,
            light,
            detail: o.detail,
          });
        }
      }
    }
  };

  // Far canopy: pale and hazy, seen through the gaps of everything nearer.
  tier(plan.seed + 10, look.backLeaf, {
    offset: (x) => R * (0.2 + cn2(x / (R * 1.7)) * 0.5),
    cover: 1.15,
    light: 0.7,
    leaf: 1.25,
    sat: 1,
    accents: false,
    detail: 0.35,
  });

  const rb = prng(plan.seed + 20);
  if (plan.behind) plan.behind(content, rb, L);

  // The shadowed inside of the canopy: what the dark gaps between the front clumps look into.
  const deep: LeafLook = {
    ...look.leaf,
    light: look.leaf.light * 0.4,
    lit: look.leaf.mid,
    sun: look.leaf.lit,
  };
  tier(plan.seed + 15, deep, {
    offset: () => -R * 0.35,
    cover: 0.95,
    light: 0.35,
    leaf: 1.15,
    sat: 0,
    accents: false,
    detail: 0.3,
  });

  // Trunks, far-to-near by width so the giants sit in front; boughs reach out inside the canopy.
  const trunks: Trunk[] = [];
  const tips: Pt[] = [];
  const rt = prng(plan.seed + 30);
  const places = [...plan.trunks].sort((a, b) => a.w - b.w);
  for (const [i, p] of places.entries()) {
    const tr = new Trunk({
      x: p.x,
      baseY: groundAt(p.x) + p.w * 0.12 + 10,
      topY: top,
      w: p.w,
      lean: p.lean ?? 0,
      flare: p.flare ?? rr(rt, 0.2, 0.4),
      flareH: rr(rt, 0.7, 1.2),
      seed: plan.seed * 7 + i * 13.7,
    });
    trunks.push(tr);
    const g = layer();
    // Soft cylinder light along the trunk.
    for (let y = tr.spec.baseY; y > top; y -= p.w * 0.55) {
      const t = (tr.spec.baseY - y) / tr.h;
      const c = tr.center(t);
      const h = tr.half(t, 1);
      L.reset(c.x, c.y, h * 1.25, p.w * 0.75, 0.9);
      L.shade(c.x - h * 0.62, c.y, h * 0.6, p.w * 0.75, 0.38);
      L.lit(c.x + h * 0.5, c.y, h * 0.5, p.w * 0.75, 0.3);
    }
    drawRoots(g, tr, look.bark, rt, p.roots ?? plan.rootsPerSide, 1.1, plan.rootArch, look.moss);
    const nb = p.branches ?? 2;
    const boughs = p.boughs ?? plan.boughs ?? 2;
    for (let k = 0; k < nb + boughs; k++) {
      const bough = k >= nb;
      let dir = rt() < 0.5 ? -1 : 1;
      // Next to the light well, boughs reach away from it (a bare bough across the well is a beam).
      if (plan.clearWell && bough && Math.abs(p.x - plan.wellX) < plan.wellHalf * 2.6)
        dir = p.x < plan.wellX ? -1 : 1;
      const cb = canopyBottom(p.x);
      const yb = bough
        ? Math.max(top + 40, cb - R * rr(rt, 0.1, 1.5))
        : Math.min(tr.spec.baseY - p.w * 1.6, Math.max(top + 60, cb + rr(rt, -40, 360)));
      const t = (tr.spec.baseY - yb) / tr.h;
      const from = tr.at(t, dir * 0.7);
      const ang = dir === 1 ? -rr(rt, 0.15, 0.8) : Math.PI + rr(rt, 0.15, 0.8);
      const len = bough ? R * rr(rt, 1.6, 3.4) : Math.max(110, Math.min(560, p.w * rr(rt, 0.9, 2.1)));
      const wid = Math.max(8, p.w * (bough ? rr(rt, 0.12, 0.22) : rr(rt, 0.1, 0.2)));
      tips.push(...drawBranch(g, from, ang, len, wid, look.bark.base, rt, bough ? 2 : 1));
    }
    drawTrunk(g, tr, look.bark, rt);
    if (plan.onTrunk) plan.onTrunk(content, rt, tr, L);
  }

  // Foliage carried on the branch tips.
  const rf = prng(plan.seed + 40);
  for (const tip of tips) {
    const k = rr(rf, 0.32, 0.75);
    // Keep the light well clear: a lit bush there sits right behind the play space.
    if (plan.clearWell && Math.abs(tip.x - plan.wellX) < plan.wellHalf * 1.2) continue;
    clump(layer(), L, tip.x, tip.y - R * k * 0.25, R * k, look.leaf, rf, {
      leaf: rr(rf, 0.8, 1.2),
      light: 0.6,
    });
  }

  const build: ForestBuild = { content, lights: L, trunks, tips, openings, canopyBottom, groundAt };

  // The near canopy: the hanging edge and the lit clumps in front of the trunks.
  tier(plan.seed + 50, look.leaf, {
    offset: () => 0,
    cover: 1,
    light: 1,
    leaf: 1,
    sat: 3,
    accents: true,
    detail: 1,
  });

  // Static hanging moss under the canopy edge.
  const rm = prng(plan.seed + 60);
  const gm = layer();
  const nMoss = Math.round((plan.moss * (x1 - x0)) / 1000);
  const caps = layer();
  for (let i = 0; i < nMoss; i++) {
    const x = rr(rm, x0, x1);
    const y = canopyBottom(x);
    if (y < top) continue;
    const w = R * rr(rm, 0.25, 0.7);
    mossCurtain(gm, x, y - R * 0.25, w, R * rr(rm, 0.5, 1.6), rm, look.moss, Math.max(1.6, R / 70));
    foliageMass(caps, x, y - R * 0.3, w * 0.75, w * 0.4, rm, look.leaf, 1.1);
  }

  // Light holes: erase leaf-shaped dapples out of the canopy (not out of trunks).
  const rh = prng(plan.seed + 70);
  const holes = layer();
  holes.blendMode = 'erase';
  const nHoles = Math.round((plan.holes * (x1 - x0)) / 1000);
  const onTrunk = (x: number, y: number): boolean =>
    trunks.some((tr) => {
      const t = (tr.spec.baseY - y) / tr.h;
      const c = tr.center(Math.max(0, Math.min(1, t)));
      return Math.abs(x - c.x) < tr.half(t, 1) + R * 0.35;
    });
  for (let i = 0; i < nHoles; i++) {
    const x = rr(rh, x0, x1);
    const e = canopyBottom(x);
    const y = e - R * rr(rh, 0.25, 2.6);
    if (y < top || onTrunk(x, y)) continue;
    const s = R * rr(rh, 0.1, 0.42);
    if (rh() < 0.4) holes.poly(blob(x, y, s * rr(rh, 0.3, 0.6), s * rr(rh, 0.25, 0.5), rh, 0.45, 18));
    const n = 3 + Math.floor(rh() * 7);
    for (let k = 0; k < n; k++) {
      const a = rh() * Math.PI * 2;
      const d = s * rr(rh, 0, 1.3);
      const l = s * rr(rh, 0.3, 1.0);
      holes.poly(
        leafPts(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, rh() * Math.PI * 2, l, l * rr(rh, 0.4, 0.7)),
      );
    }
    // Leaves around a hole are backlit.
    L.lit(x, y, s * 2.6, s * 2.2, 0.55);
  }
  holes.fill(0xffffff);

  if (plan.front) plan.front(content, rb, build);

  // Ground: a rolling body, rows of bushes stepping down into it (far rows first).
  const rg = prng(plan.seed + 80);
  const gg = layer();
  const pts: number[] = [x0, bottom];
  for (let x = x0; x <= x1; x += 30) pts.push(x, groundAt(x));
  pts.push(x1, bottom);
  gg.poly(pts).fill(look.ground);
  const step = 1000 / plan.mounds;
  for (let x = x0; x < x1; x += step * rr(rg, 0.45, 1.55)) {
    const rad = plan.moundR * rr(rg, 0.5, 1.25);
    clump(layer(), L, x, groundAt(x) - rad * rr(rg, 0.05, 0.4), rad, look.groundLeaf, rg, {
      leaf: rr(rg, 0.8, 1.3),
      light: 0.8,
    });
  }
  for (let row = 1; row <= (plan.groundRows ?? 0); row++) {
    for (let x = x0; x < x1; x += step * rr(rg, 0.8, 1.9)) {
      const rad = plan.moundR * rr(rg, 0.8, 1.6);
      clump(layer(), L, x, groundAt(x) + plan.moundR * row * rr(rg, 1.0, 1.5), rad, look.groundLeaf, rg, {
        leaf: 1.3,
        light: 0.55,
      });
    }
  }
  if (plan.floor) plan.floor(content, rg, build);

  // Leaves around every opening are backlit by the sky behind it.
  for (const o of openings) L.lit(o.x, o.y, o.r * 2.0, o.r * 1.7, 0.5);
  // The key light floods the canopy around the well.
  L.lit(plan.wellX + R, plan.canopyY - R * 0.5, plan.wellHalf * 1.6, R * 2.4, 0.2);
  if (plan.lights) plan.lights(L);
  return build;
}

/** A LeafLook with every colour run through the layer's fog / well tint at (x, y). */
export function toneLeaf(lk: LeafLook, atm: Atmosphere, x: number, y: number): LeafLook {
  return {
    ...lk,
    core: atmTone(atm, lk.core, x, y),
    dark: atmTone(atm, lk.dark, x, y),
    mid: atmTone(atm, lk.mid, x, y),
    lit: atmTone(atm, lk.lit, x, y),
    sun: atmTone(atm, lk.sun, x, y),
  };
}

export interface HangerSpec {
  seed: number;
  vines: number;
  moss: number;
  fronds: number;
  /** Vine length range in layer px. */
  vineLen: readonly [number, number];
  /** Swing in radians at full wind. */
  amp: number;
  /** Relative density by x, 0..1 (default 1 everywhere). */
  weight?: (x: number) => number;
}

/** Vines, moss curtains and canopy fronds that hang from the canopy edge and branch tips and sway. */
export function hangers(plan: ForestPlan, b: ForestBuild, atm: Atmosphere, spec: HangerSpec): SwayItem[] {
  const r = prng(spec.seed);
  const { rect, look } = plan;
  const R = plan.canopyR;
  const items: SwayItem[] = [];
  const top = rect.y - 60;
  const anchor = (): Pt | null => {
    for (let tries = 0; tries < 8; tries++) {
      if (b.tips.length > 0 && r() < 0.3) {
        const tip = b.tips[Math.floor(r() * b.tips.length)] as Pt;
        return { x: tip.x + rr(r, -0.4, 0.4) * R, y: tip.y + R * 0.1 };
      }
      const x = rr(r, rect.x, rect.x + rect.w);
      const y = b.canopyBottom(x) - R * 0.3;
      if (spec.weight && r() > spec.weight(x)) continue;
      if (y > top) return { x, y };
    }
    return null;
  };
  for (let i = 0; i < spec.vines; i++) {
    const a = anchor();
    if (!a) continue;
    const len = rr(r, spec.vineLen[0], spec.vineLen[1]);
    const seed = Math.floor(r() * 1e9);
    const lk = toneLeaf(look.leaf, atm, a.x, a.y + len * 0.5);
    const stem = atmTone(atm, look.vineStem, a.x, a.y + len * 0.5);
    const ls = look.leaf.size * 0.8;
    items.push({
      x: a.x,
      y: a.y,
      // Narrow strips: transparent texels still cost fill, and the bend comes from the mesh.
      w: len * 0.16 + ls * 3,
      h: len + ls,
      amp: spec.amp * rr(r, 0.7, 1.3),
      phase: r(),
      draw: (g) =>
        vine(
          g,
          0,
          0,
          len,
          prng(seed),
          stem,
          [lk.dark, lk.mid, lk.mid, lk.lit],
          ls,
          Math.max(1.6, R / 60),
          0.4,
        ),
    });
  }
  for (let i = 0; i < spec.moss; i++) {
    const a = anchor();
    if (!a) continue;
    const w = R * rr(r, 0.25, 0.8);
    const len = R * rr(r, 0.6, 1.9);
    const seed = Math.floor(r() * 1e9);
    const cols = look.moss.map((c) => atmTone(atm, c, a.x, a.y + len * 0.5));
    const cap = toneLeaf(look.leaf, atm, a.x, a.y);
    const up = w * 0.4 + look.leaf.size * 1.6;
    items.push({
      x: a.x,
      y: a.y,
      w: w * 1.5 + len * 0.18 + look.leaf.size * 3,
      h: len + 4,
      up,
      amp: spec.amp * rr(r, 0.5, 1),
      phase: r(),
      draw: (g) => {
        const pr = prng(seed);
        mossCurtain(g, 0, 0, w, len, pr, cols, Math.max(1.6, R / 70));
        foliageMass(g, 0, -w * 0.05, w * 0.75, w * 0.4, pr, cap, 1.1);
      },
    });
  }
  for (let i = 0; i < spec.fronds; i++) {
    const x = rr(r, rect.x, rect.x + rect.w);
    const y = b.canopyBottom(x) - R * 0.15;
    if (y < top) continue;
    const rx = R * rr(r, 0.35, 0.7);
    const ry = R * rr(r, 0.3, 0.55);
    const seed = Math.floor(r() * 1e9);
    const lk = toneLeaf(look.leaf, atm, x, y + ry);
    const pad = look.leaf.size * 1.8;
    items.push({
      x,
      y,
      w: rx * 2 + pad * 2,
      h: ry * 1.9 + pad,
      up: ry * 0.5 + pad,
      amp: spec.amp * 0.75 * rr(r, 0.6, 1.2),
      flutter: 2.2,
      phase: r(),
      draw: (g) => foliageMass(g, 0, ry * 0.55, rx, ry, prng(seed), lk, 1.1),
    });
  }
  return items;
}

/**
 * The local colours of a forest layer. `cool` (0..1) pulls everything toward indigo for distance,
 * `light` is how much of the foliage catches the key, `streaks` / `bands` are bark detail.
 */
export function forestLook(o: {
  leaf: number;
  light: number;
  streaks: number;
  bands: number;
  cool: number;
  grooves?: number;
}): ForestLook {
  const c = (hex: number): number => mix(hex, PALETTE.shadowIndigo, o.cool);
  const leaf: LeafLook = {
    core: c(0x09302f),
    dark: c(0x0b3a34),
    mid: c(0x13573f),
    lit: c(PALETTE.foliage),
    sun: c(mix(PALETTE.foliageLit, PALETTE.foliageSun, 0.35)),
    size: o.leaf,
    light: o.light,
  };
  // The far tier of a canopy sinks into dark haze (never paler than the light behind it).
  const back = (hex: number): number => mix(hex, 0x0c1612, 0.4);
  return {
    bark: {
      base: c(0x14303a),
      lit: c(mix(PALETTE.barkLit, PALETTE.foliage, 0.25)),
      dark: c(0x07141d),
      streaks: o.streaks,
      streakAlpha: 0.3,
      bands: o.bands,
      grooves: o.grooves ?? 0,
    },
    leaf,
    backLeaf: {
      ...leaf,
      core: back(leaf.core),
      dark: back(leaf.dark),
      mid: back(leaf.mid),
      lit: back(leaf.lit),
      sun: back(leaf.lit),
      light: o.light * 0.6,
    },
    groundLeaf: { ...leaf, core: c(0x061f26), light: o.light * 0.75 },
    ground: c(0x061d25),
    vineStem: c(0x0b3a34),
    moss: [c(0x0f4a3c), c(0x1a5c47), c(0x2a7355)],
  };
}
