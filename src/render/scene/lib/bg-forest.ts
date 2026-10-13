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
import { type Atmosphere, atmTone, type SwayItem } from './bg-bake';
import {
  type BarkLook,
  blob,
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
  behind?: (c: Container, r: Rng) => void;
  front?: (c: Container, r: Rng, b: ForestBuild) => void;
  /** Drawn last, over the ground. */
  floor?: (c: Container, r: Rng, b: ForestBuild) => void;
}

export interface ForestBuild {
  content: Container;
  trunks: Trunk[];
  /** Branch tips carrying foliage. */
  tips: Pt[];
  canopyBottom(x: number): number;
  groundAt(x: number): number;
}

export function buildForest(plan: ForestPlan): ForestBuild {
  const { rect, look } = plan;
  const content = new Container();
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

  const layer = (): Graphics => content.addChild(new Graphics());

  // A bank of canopy: a solid fill above the bottom edge with leaf masses along the edge.
  const bank = (seed: number, lk: LeafLook, offset: (x: number) => number, skip: number): void => {
    const r = prng(seed);
    const g = layer();
    const edge = (x: number): number => canopyBottom(x) + offset(x);
    const pts: number[] = [x0, top];
    for (let x = x0; x <= x1; x += 36) pts.push(x, Math.max(top, edge(x) - R * 0.5));
    pts.push(x1, top);
    g.poly(pts).fill(lk.core);
    // Shadowed masses deeper in, so the body of the canopy is never a flat fill.
    const deep = { ...lk, light: lk.light * 0.45 };
    for (let row = 2; row >= 1; row--) {
      for (let x = x0; x < x1; x += R * rr(r, 0.8, 1.5)) {
        const y = edge(x) - R * (0.9 + row * 1.0) + rr(r, -0.3, 0.3) * R;
        if (y < top - R) continue;
        foliageMass(layer(), x, y, R * rr(r, 0.9, 1.5), R * rr(r, 0.6, 0.95), r, deep, 0.7);
      }
    }
    for (let x = x0; x < x1; x += R * rr(r, 0.5, 0.95)) {
      const e = edge(x);
      if (e < top - R * 0.3 || r() < skip) continue;
      const rx = R * rr(r, 0.75, 1.5);
      const ry = R * rr(r, 0.55, 1.0);
      foliageMass(layer(), x, e - ry * rr(r, 0.45, 0.8), rx, ry, r, lk);
      // Smaller clumps drooping below the edge.
      if (r() < 0.5) {
        const k = rr(r, 0.3, 0.55);
        foliageMass(layer(), x + rr(r, -R, R) * 0.6, e + ry * rr(r, -0.1, 0.3), rx * k, ry * k, r, lk, 1.2);
      }
    }
  };

  bank(plan.seed + 10, look.backLeaf, (x) => R * (0.25 + cn2(x / (R * 1.7)) * 0.55), 0);

  const rb = prng(plan.seed + 20);
  if (plan.behind) plan.behind(content, rb);

  // Trunks, far-to-near by width so the giants sit in front.
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
    drawRoots(g, tr, look.bark, rt, p.roots ?? plan.rootsPerSide, 1.1, plan.rootArch);
    const nb = p.branches ?? 2;
    for (let k = 0; k < nb; k++) {
      const dir = rt() < 0.5 ? -1 : 1;
      const cb = canopyBottom(p.x);
      const yb = Math.min(tr.spec.baseY - p.w * 1.6, Math.max(top + 60, cb + rr(rt, -40, 360)));
      const t = (tr.spec.baseY - yb) / tr.h;
      const from = tr.at(t, dir * 0.7);
      const ang = dir === 1 ? -rr(rt, 0.2, 0.85) : Math.PI + rr(rt, 0.2, 0.85);
      const len = Math.max(110, Math.min(560, p.w * rr(rt, 0.9, 2.1)));
      const got = drawBranch(g, from, ang, len, Math.max(8, p.w * rr(rt, 0.1, 0.2)), look.bark.base, rt, 1);
      tips.push(...got);
    }
    drawTrunk(g, tr, look.bark, rt);
  }

  // Foliage on the branch tips.
  const rf = prng(plan.seed + 40);
  for (const tip of tips) {
    const k = rr(rf, 0.38, 0.8);
    foliageMass(
      layer(),
      tip.x,
      tip.y - R * k * 0.2,
      R * k * rr(rf, 0.9, 1.4),
      R * k * rr(rf, 0.6, 0.9),
      rf,
      look.leaf,
    );
  }

  const build: ForestBuild = { content, trunks, tips, canopyBottom, groundAt };

  bank(plan.seed + 50, look.leaf, () => 0, 0);

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
    const y = e - R * rr(rh, 0.25, 2.6) ** 1.0;
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
  }
  holes.fill(0xffffff);

  if (plan.front) plan.front(content, rb, build);

  // Ground: a rolling body with undergrowth mounds along its edge.
  const rg = prng(plan.seed + 80);
  const gg = layer();
  const pts: number[] = [x0, bottom];
  for (let x = x0; x <= x1; x += 30) pts.push(x, groundAt(x));
  pts.push(x1, bottom);
  gg.poly(pts).fill(look.ground);
  const step = 1000 / plan.mounds;
  for (let x = x0; x < x1; x += step * rr(rg, 0.45, 1.55)) {
    const rx = plan.moundR * rr(rg, 0.6, 1.7);
    const ry = plan.moundR * rr(rg, 0.35, 0.85);
    foliageMass(layer(), x, groundAt(x) - ry * rr(rg, 0.0, 0.45), rx, ry, rg, look.groundLeaf);
  }
  if (plan.floor) plan.floor(content, rg, build);
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
      w: len * 0.4 + ls * 3,
      h: len + ls,
      amp: spec.amp * rr(r, 0.7, 1.3),
      phase: r(),
      draw: (g) =>
        vine(g, 0, 0, len, prng(seed), stem, [lk.dark, lk.mid, lk.mid, lk.lit], ls, Math.max(1.6, R / 60)),
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
      w: w * 1.6 + len * 0.3 + look.leaf.size * 3,
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
      amp: spec.amp * 0.45 * rr(r, 0.6, 1.2),
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
  const back = (hex: number): number => mix(hex, PALETTE.fogMid, 0.3);
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
