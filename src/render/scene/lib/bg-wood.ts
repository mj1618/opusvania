/**
 * The wood kit's backdrop: the view from a high branch in an old wood at night (scene 1, the
 * hatching branch; docs/design/scenes/01-look-target.md). Used by far.ts and mid.ts when the room's
 * kit is `wood` (room-look.ts); the test grove keeps its own forest plans.
 *
 *   sky   the moon high on the right, a cool night, a pale haze along the horizon (sky.ts)
 *   far0  the far wood seen from above: rows of small crowns sinking into fog, under the horizon
 *   far1  nearer rows of crowns, bigger, a step darker, fog pooled between the rows
 *   far2  the near crown sea, falling to blue-black at the bottom of the frame, and a few emergent
 *         giants whose crowns stand up out of it against the haze
 *   mid   colossal trunks rising out of the drop past her and out of the top of the frame, with a
 *         few limbs, dark leaf masses and hanging moss
 *
 * Everything is composed at a reference camera (`WOOD.refCamY`): `layerY(screenY, parallax)` turns a
 * height on the 1080-tall safe area into the layer's own y, so the picture lines up with the
 * branch whatever the room's background anchor is. Positions across are in layer x.
 */
import { Container, Graphics } from 'pixi.js';
import type { Scene } from '../../../sim/scene';
import { SAFE_H } from '../../contract';
import type { LayerRect } from '../layer-tree';
import {
  type Atmosphere,
  type FogSpec,
  LightMap,
  type StageSpec,
  type SwayItem,
  type ZoneSpec,
} from './bg-bake';
import {
  type BarkLook,
  blob,
  clump,
  drawTrunk,
  fbm1,
  type LeafLook,
  mossCurtain,
  type Pt,
  quad,
  type Rng,
  ribbon,
  rr,
  Trunk,
  taper,
} from './bg-shapes';
import { mix, prng } from './look';

/** Knobs of the wood's backdrop. Screen heights are fractions of the safe area (0 top, 1 bottom). */
export const WOOD = {
  /**
   * The camera centre y the picture is composed for: the opening frame (feet line 0.62 at the
   * cocoon row, camera ~894; the route runs ~606 on the crown to ~1150 at the end). Move it with the
   * camera's feet line or the horizon slides behind the branch.
   */
  refCamY: 894,
  /** One fog colour for the whole wood (look target: `#1f3550`), and the blue-black of the drop. */
  fog: 0x1f3550,
  /** The fog pooled between rows of crowns: paler than the crowns, so their tops stand dark on it. */
  fogPale: 0x34557a,
  deep: 0x03070d,
  /** Share of the crowns that are fir spires. */
  spires: 0.4,
  /** far0: top of each crown row (screen), crown radius range (layer px), fog pooled under each. */
  far0: {
    rows: [0.8, 0.82, 0.85, 0.89, 0.94, 1.0, 1.08, 1.18],
    r: [34, 56] as const,
    /** Fir spires' height, in crown radii. */
    spireH: [2.2, 3.4] as const,
    fog: 0.62,
  },
  far1: {
    rows: [0.83, 0.87, 0.92, 0.98, 1.06, 1.16, 1.28],
    r: [58, 92] as const,
    spireH: [1.9, 2.9] as const,
    fog: 0.58,
  },
  far2: {
    rows: [0.89, 0.96, 1.04, 1.14, 1.26, 1.4, 1.56, 1.74],
    r: [80, 130] as const,
    // Short: the near firs must not climb over the horizon (and its afterglow) behind the branch.
    spireH: [1.4, 2.1] as const,
    fog: 0.42,
    /**
     * Emergent firs standing out of the crown sea against the haze (layer x, top as a screen
     * height, width). Their tops stay below screen ~0.4, under the moon, so the disc is never covered.
     */
    emergents: [
      { x: 2690, top: 0.47, w: 150 },
      { x: 3480, top: 0.55, w: 120 },
      { x: 4350, top: 0.43, w: 170 },
      { x: 5080, top: 0.52, w: 140 },
    ],
  },
  /**
   * mid: the giants she runs past (layer x, width at the top of the frame, lean). Layer x
   * 1680-2420 stays clear: the moon is behind it at the opening frame and when the camera leans
   * toward the swarm.
   */
  mid: {
    trunks: [
      // Placed so no wide stop has the moon fully behind one (round 2's stops: camera x 1850,
      // 2200, 3250, 3750, 4750, 5900, 6464): a trunk's top crosses the moon at camera x
      // 2560 + (topX - 3020) / 0.68, here at ~2725, ~4250 and ~5325, between stops.
      { x: 520, w: 260, lean: -120 },
      { x: 3020, w: 290, lean: 150 },
      { x: 4290, w: 250, lean: -160 },
      { x: 4825, w: 320, lean: 100 },
    ],
    /** Limbs per trunk and their reach. */
    limbs: 3,
    limbLen: [260, 520] as const,
    /** Layer x kept free of limbs and leaf masses above screen height `clearBelow` (the moon's place). */
    clear: [1640, 2460] as const,
    clearBelow: 0.45,
  },
} as const;

/**
 * The wood's mist stage: a pale sheet behind the walk line (and a little below it, where the
 * cocoons hang), drawn in far2's view pass so the giants of mid stand in front of it as solid
 * silhouettes (drawn in mid's pass it washed them into translucent curtains, review round 1).
 * The walk line runs along the branch solids west to east; one that overlaps the line (the far
 * branch) gets its own thinner sheet.
 */
export const WOOD_STAGE = { color: 0x5a7ca0, strength: 0.5, height: 340, below: 230, ledgeK: 0.35 };

export function woodStage(scene: Scene): StageSpec {
  const tops = scene.solids.filter((s) => s.tag !== 'trunk').sort((a, b) => a.x - b.x);
  const first = tops[0];
  const steps: Array<[number, number]> = [];
  const ledges: Array<{ x0: number; x1: number; y: number; k: number }> = [];
  let y = first?.y ?? scene.height;
  let end = first ? first.x + first.w : 0;
  for (const s of tops.slice(1)) {
    if (s.x < end - 4) {
      ledges.push({ x0: s.x, x1: s.x + s.w, y: s.y, k: WOOD_STAGE.ledgeK });
      continue;
    }
    // The step sits halfway across a gap (or at the joint).
    steps.push([Math.round((end + s.x) / 2), s.y - y]);
    y = s.y;
    end = s.x + s.w;
  }
  const S = WOOD_STAGE;
  return {
    strength: [S.strength, S.strength, S.strength],
    color: [S.color, S.color, S.color],
    height: S.height,
    below: S.below,
    baseY: first?.y ?? scene.height,
    steps,
    ease: 150,
    ledges,
    walls: [],
    pools: [],
    wisp: 0.5,
  };
}

/** The layer y of a screen height (fraction of the safe area) for a layer at `parallax`, at the reference camera. */
export function layerY(screen: number, parallax: number, anchorY: number): number {
  const camY = anchorY + (WOOD.refCamY - anchorY) * parallax;
  return camY - SAFE_H / 2 + screen * SAFE_H;
}

// ---------------------------------------------------------------------------------------------
// Looks: local colours (the atmosphere bake fogs and grades them)
// ---------------------------------------------------------------------------------------------

/** Night foliage: slate blue-green, the lit side silvered by the moon. */
function crownLook(size: number, light: number, k: number): LeafLook {
  const c = (hex: number): number => mix(hex, 0x0a1420, k);
  return {
    core: c(0x0b1724),
    dark: c(0x0f1e2e),
    mid: c(0x1a2e42),
    lit: c(0x2e4a64),
    sun: c(0x5a7896),
    size,
    light,
  };
}

const BARK: BarkLook = {
  base: 0x0a131c,
  lit: 0x26384a,
  dark: 0x04080d,
  streaks: 5,
  streakAlpha: 0.4,
  bands: 1.5,
  grooves: 3.2,
};

const MOSS = [0x13262a, 0x1a3234, 0x24403f] as const;

// ---------------------------------------------------------------------------------------------
// Atmosphere per layer (bake), mist in front of it (view), zone spec (the wood is one cool zone)
// ---------------------------------------------------------------------------------------------

const flat = [1, 1, 1] as const;

/** The wood is all one mood: the zone tints are neutral and the "left" values apply everywhere. */
export function woodZone(parallax: number, mist: number): Omit<ZoneSpec, 'anchorX'> {
  return { parallax, tintL: flat, tintR: flat, mistL: mist, mistR: mist };
}

/** Bake atmosphere of a far layer: fogged toward the wood's fog colour, a deep fall at the bottom. */
function farAtm(i: 0 | 1 | 2, anchorY: number): Atmosphere {
  const p = [0.12, 0.25, 0.42][i] as number;
  const fogTop = [0.42, 0.3, 0.16][i] as number;
  const fogLow = [0.36, 0.24, 0.12][i] as number;
  return {
    fogColor: WOOD.fog,
    fogTop,
    fogGround: fogLow,
    fogY0: layerY(0.8, p, anchorY),
    fogY1: layerY(1.2, p, anchorY),
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellColor: 0,
    wellStrength: 0,
    formDist: [22, 30, 40][i] as number,
    formLit: [0.25, 0.35, 0.45][i] as number,
    formShade: [0.2, 0.3, 0.4][i] as number,
    rimDist: [5, 5, 4][i] as number,
    rimColor: 0xb8cce6,
    // Crown tops silvered by the moon (the review: "no tops lit by the moon").
    rimStrength: [0.22, 0.32, 0.42][i] as number,
    mottle: 0.12,
    litGain: 1.0,
    sunMix: 0.4,
    sunColor: 0x9fb8d6,
    sunColorL: 0x9fb8d6,
    sunColorR: 0x9fb8d6,
    zoneParallax: p,
    sideBody: 0.5,
    sideLit: 0.8,
    sideRim: 1.2,
    tint: flat,
    shadeTint: [0.55, 0.6, 0.72],
    gain: 1,
    saturation: 1,
    blur: [6, 4, 2.2][i] as number,
    deep: {
      color: WOOD.deep,
      y0: layerY([0.9, 0.9, 0.9][i] as number, p, anchorY),
      y1: layerY([1.15, 1.1, 1.06][i] as number, p, anchorY),
      k: [0.7, 0.85, 0.95][i] as number,
    },
  };
}

/** A thin veil in front of a far layer: drifting, thickest in the drop, never a wall. */
function farFog(i: 0 | 1 | 2, anchorY: number): FogSpec {
  const p = [0.12, 0.25, 0.42][i] as number;
  return {
    color: [0x23405e, 0x1d3854, 0x16304a][i] as number,
    warm: WOOD.fog,
    yTop: layerY(0.62, p, anchorY),
    yFull: layerY(1.0, p, anchorY),
    alphaTop: 0.08,
    alpha: [0.22, 0.2, 0.16][i] as number,
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellAlpha: 0,
    scale: [1 / 1500, 1 / 1300, 1 / 1100][i] as number,
    speed: [0.006, 0.009, 0.012][i] as number,
    wisp: 0.6,
  };
}

export function woodFar(
  anchorY: number,
): Array<{ atm: Atmosphere; fog: FogSpec; zone: Omit<ZoneSpec, 'anchorX'> }> {
  return ([0, 1, 2] as const).map((i) => ({
    atm: farAtm(i, anchorY),
    fog: farFog(i, anchorY),
    zone: woodZone([0.12, 0.25, 0.42][i] as number, [0x21405e, 0x1b3753, 0x152e48][i] as number),
  }));
}

export function woodMidAtm(anchorY: number): Atmosphere {
  const p = 0.68;
  return {
    fogColor: WOOD.fog,
    fogTop: 0.08,
    fogGround: 0.26,
    fogY0: layerY(0.5, p, anchorY),
    fogY1: layerY(1.3, p, anchorY),
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellColor: 0,
    wellStrength: 0,
    formDist: 46,
    formLit: 0.5,
    formShade: 0.5,
    rimDist: 4,
    rimColor: 0xb8cce6,
    rimStrength: 0.26,
    mottle: 0.24,
    litGain: 0.6,
    sunMix: 0.25,
    sunColor: 0x9fb8d6,
    sunColorL: 0x9fb8d6,
    sunColorR: 0x9fb8d6,
    zoneParallax: p,
    sideBody: 0.3,
    sideLit: 0.8,
    sideRim: 1.3,
    tint: flat,
    shadeTint: [0.4, 0.45, 0.55],
    gain: 0.95,
    saturation: 1,
    blur: 1.1,
    deep: { color: WOOD.deep, y0: layerY(0.95, p, anchorY), y1: layerY(1.4, p, anchorY), k: 0.8 },
  };
}

export function woodMidFog(anchorY: number): FogSpec {
  const p = 0.68;
  return {
    color: 0x172c42,
    warm: WOOD.fog,
    yTop: layerY(0.7, p, anchorY),
    yFull: layerY(1.15, p, anchorY),
    alphaTop: 0.03,
    alpha: 0.14,
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellAlpha: 0,
    scale: 1 / 900,
    speed: 0.016,
    wisp: 0.65,
  };
}

// ---------------------------------------------------------------------------------------------
// Painters
// ---------------------------------------------------------------------------------------------

/** Fog pooled under a row of crowns: thin at `y`, thickening down to `y + depth`, in steps the bake's blur melts. */
function fogPool(
  g: Graphics,
  L: LightMap,
  x0: number,
  x1: number,
  y: number,
  depth: number,
  bottom: number,
  color: number,
  alpha: number,
  seed: number,
): void {
  const n = 12;
  const wob = fbm1(seed);
  const per = 1 - (1 - alpha) ** (1 / n);
  for (let k = 0; k < n; k++) {
    const yk = y + depth * (k / n) ** 1.3;
    const pts: number[] = [];
    for (let x = x0; x <= x1 + 60; x += 60) pts.push(x, yk + wob(x / 300 + k * 0.37) * depth * 0.18);
    pts.push(x1 + 60, bottom, x0, bottom);
    g.poly(pts).fill({ color, alpha: per });
  }
  // The fog is not lit by the crowns' light blobs.
  for (let x = x0; x <= x1; x += 300) L.reset(x, y + depth * 0.6, 340, depth * 0.9, 0.9);
}

/**
 * A fir's top seen from the side and a little above: a ragged spire of drooping tiers, the moon
 * catching the right edge of each tier. Spires among the round crowns are what make the sea read
 * as treetops at a glance and not as cloud.
 */
function spire(
  g: Graphics,
  L: LightMap,
  r: Rng,
  x: number,
  base: number,
  h: number,
  w: number,
  look: LeafLook,
): void {
  const tiers = 6 + Math.floor(r() * 4);
  const top = base - h;
  const lean = rr(r, -0.06, 0.06) * h;
  const left: number[] = [];
  const right: number[] = [];
  for (let k = 0; k <= tiers; k++) {
    const t = k / tiers;
    const y = top + h * t;
    const cx = x + lean * (1 - t);
    const half = (w / 2) * t ** 0.85 * rr(r, 0.8, 1.15);
    // Each tier droops: out and down to a tip, then back in a little higher up the next.
    left.push(cx - half, y + h * 0.04, cx - half * 0.55, y + h * 0.02);
    right.push(cx + half, y + h * 0.04, cx + half * 0.55, y + h * 0.02);
  }
  const pts = [x + lean, top - h * 0.03];
  for (let i = 0; i < right.length; i += 2) pts.push(right[i] as number, right[i + 1] as number);
  const lp: number[] = [];
  for (let i = left.length - 2; i >= 0; i -= 2) lp.push(left[i] as number, left[i + 1] as number);
  g.poly(pts.concat(lp)).fill(look.core);
  // The moon side of every tier, a hair lighter.
  const lit: number[] = [x + lean, top];
  for (let i = 0; i < right.length; i += 2) lit.push(right[i] as number, right[i + 1] as number);
  lit.push(x, base);
  g.poly(lit).fill({ color: look.mid, alpha: 0.35 });
  L.reset(x, base - h / 2, w, h * 0.7);
  L.lit(x + w * 0.2, top + h * 0.3, w * 0.4, h * 0.4, 0.25);
  L.shade(x - w * 0.25, base - h * 0.3, w * 0.5, h * 0.5, 0.4);
}

/**
 * One row of treetops seen from above: broad crowns (a dome with knobbly satellites, lit from the
 * moon's side) and fir spires, over a dark body that runs down to `bottom` so nothing behind shows
 * between them.
 */
function crownRow(
  g: Graphics,
  L: LightMap,
  r: Rng,
  x0: number,
  x1: number,
  y: number,
  rad: readonly [number, number],
  look: LeafLook,
  bottom: number,
  light: number,
  detail: number,
  seed: number,
  spireH: readonly [number, number],
): void {
  const swell = fbm1(seed);
  const crowns: Array<{ x: number; y: number; r: number; spire: boolean }> = [];
  for (let x = x0 - rad[1]; x < x1 + rad[1]; ) {
    const cr = rr(r, rad[0], rad[1]);
    // Tops of a canopy: rolling, a crown now and then standing above its neighbours.
    const up = r() < 0.15 ? cr * rr(r, 0.3, 0.9) : 0;
    crowns.push({
      x,
      y: y + cr * 0.7 + swell(x / (rad[1] * 6)) * rad[1] * 0.7 - up,
      r: cr,
      spire: r() < WOOD.spires,
    });
    x += cr * rr(r, 0.9, 1.5);
  }
  // The body under the tops.
  const body: number[] = [];
  for (const c of crowns) body.push(c.x, c.y + c.r * 0.3);
  const last = crowns[crowns.length - 1];
  const first = crowns[0];
  if (last && first) {
    body.push(last.x + last.r, bottom, first.x - first.r, bottom);
    g.poly(body).fill(look.core);
  }
  for (const c of crowns) {
    if (c.spire) {
      spire(g, L, r, c.x, c.y + c.r * 0.6, c.r * rr(r, spireH[0], spireH[1]), c.r * rr(r, 1.1, 1.5), look);
      continue;
    }
    L.reset(c.x, c.y + c.r, c.r * 1.4, c.r * 1.4);
    clump(g, L, c.x, c.y, c.r * 0.8, look, r, { light, detail, leaf: rr(r, 0.8, 1.2) });
    // Knobbly satellites on the top and sides: a crown, not a puff.
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI * rr(r, 0.05, 0.95);
      const d = c.r * rr(r, 0.55, 0.85);
      clump(g, L, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 0.7, c.r * rr(r, 0.28, 0.45), look, r, {
        light,
        detail,
        leaf: rr(r, 0.7, 1),
      });
    }
  }
  // Shadow falls under the tops into the body.
  for (const c of crowns) L.shade(c.x, c.y + c.r * 1.3, c.r * 1.3, c.r * 0.9, 0.55);
}

/** A crown sea: rows back to front, fog pooled between them. */
function crownSea(
  c: Container,
  L: LightMap,
  rect: LayerRect,
  rows: readonly number[],
  rad: readonly [number, number],
  look: LeafLook,
  parallax: number,
  anchorY: number,
  fog: number,
  seed: number,
  spireH: readonly [number, number],
  before?: (row: number, g: Graphics) => void,
): void {
  const r = prng(seed);
  const x0 = rect.x - 100;
  const x1 = rect.x + rect.w + 100;
  const bottom = rect.y + rect.h + 100;
  rows.forEach((s, i) => {
    const g = c.addChild(new Graphics());
    before?.(i, g);
    const y = layerY(s, parallax, anchorY);
    // Nearer rows (lower in the frame) are bigger and darker.
    const grow = 1 + i * 0.12;
    const lk = { ...look, light: look.light * (1 - i * 0.1) };
    crownRow(
      g,
      L,
      r,
      x0,
      x1,
      y,
      [rad[0] * grow, rad[1] * grow],
      lk,
      bottom,
      0.9 - i * 0.08,
      0.5,
      seed + i * 17,
      spireH,
    );
    const next = rows[i + 1];
    if (next !== undefined) {
      const ny = layerY(next, parallax, anchorY);
      const fg = c.addChild(new Graphics());
      const top = y + rad[1] * grow * 0.4;
      fogPool(
        fg,
        L,
        x0,
        x1,
        top,
        Math.max(60, ny - top + rad[1] * 0.6),
        bottom,
        WOOD.fogPale,
        fog,
        seed + i * 31,
      );
    }
  });
}

/** Builds a far layer of the wood (i = 0 farthest). */
export function buildWoodFar(
  i: 0 | 1 | 2,
  rect: LayerRect,
  anchorY: number,
): { content: Container; lights: LightMap } {
  return withLightMap((c, L) => {
    const p = [0.12, 0.25, 0.42][i] as number;
    const spec = [WOOD.far0, WOOD.far1, WOOD.far2][i] as (typeof WOOD)['far0'];
    const look = crownLook(
      [9, 12, 15][i] as number,
      [0.45, 0.55, 0.65][i] as number,
      [0.5, 0.35, 0.2][i] as number,
    );
    crownSea(
      c,
      L,
      rect,
      spec.rows,
      spec.r,
      look,
      p,
      anchorY,
      spec.fog,
      9100 + i * 1000,
      spec.spireH,
      (row, g) => {
        // far2's giants stand behind its first row: their trunks sink into the crowns.
        if (i !== 2 || row !== 0) return;
        const r = prng(9900);
        const base = layerY(1.0, p, anchorY);
        for (const e of WOOD.far2.emergents) {
          const top = layerY(e.top, p, anchorY);
          spire(g, L, r, e.x, base, base - top, e.w, look);
        }
      },
    );
  });
}

function withLightMap(draw: (c: Container, L: LightMap) => void): { content: Container; lights: LightMap } {
  const content = new Container();
  const lights = new LightMap();
  draw(content, lights);
  return { content, lights };
}

/**
 * A bough out of a giant's flank: it rises, elbows and droops at the tip, tapering to a point,
 * with a twig or two going up off its back. Returns the tips (where leaf pads and moss go).
 */
function limb(g: Graphics, L: LightMap, from: Pt, side: 1 | -1, len: number, w: number, r: Rng): Pt[] {
  const rise = rr(r, 0.18, 0.45);
  const p1 = { x: from.x + side * len * rr(r, 0.35, 0.5), y: from.y - len * rise };
  const p2 = { x: from.x + side * len, y: from.y - len * rise * rr(r, 0.2, 0.9) + len * rr(r, -0.05, 0.12) };
  const c = quad(from, p1, p2);
  // A swelling where it leaves the trunk, then a long taper.
  const half = (t: number): number => (w / 2) * ((1 - t) ** 0.8 * (1 + 0.6 * Math.exp(-t * 9)) + 0.04);
  g.poly(ribbon(c, half, 18)).fill(BARK.base);
  // The moon catches the top of it.
  g.poly(
    ribbon(
      (t) => ({ x: c(t).x, y: c(t).y - half(t) * 0.55 }),
      (t) => half(t) * 0.35,
      18,
    ),
  ).fill({
    color: BARK.lit,
    alpha: 0.35,
  });
  for (let k = 0; k <= 6; k++) {
    const q = c(k / 6);
    L.reset(q.x, q.y, w * 1.2, w * 1.2, 0.7);
  }
  const tips: Pt[] = [p2];
  const twigs = 1 + Math.floor(r() * 2);
  for (let k = 0; k < twigs; k++) {
    const t = rr(r, 0.45, 0.8);
    const o = c(t);
    const tl = len * rr(r, 0.22, 0.38);
    const e = { x: o.x + side * tl * rr(r, 0.3, 0.8), y: o.y - tl * rr(r, 0.5, 0.9) };
    const m = { x: (o.x + e.x) / 2 + side * tl * 0.15, y: (o.y + e.y) / 2 };
    g.poly(taper(quad(o, m, e), half(t) * 1.1, 1.5, 10)).fill(BARK.base);
    tips.push(e);
  }
  return tips;
}

/**
 * Relief that survives distance on a giant's bark (review round 1: "smeared translucent curtains"):
 * irregular plates between deep fissures, lit on the moon side and lost on the shadow side, a burl
 * or two, and a hard silver rim down the moon-side flank so the silhouette is a solid edge.
 */
function barkRelief(g: Graphics, L: LightMap, tr: Trunk, w: number, r: Rng): void {
  const plates = Math.round((tr.h / w) * 9);
  for (let i = 0; i < plates; i++) {
    const t = r();
    const u = rr(r, -0.85, 0.92);
    const lit = Math.max(0, (u + 0.4) / 1.3);
    const ph = w * rr(r, 0.18, 0.5);
    const pw = w * rr(r, 0.07, 0.16);
    const c = tr.at(t, u);
    // The fissure under the plate: dark, a little longer.
    g.poly(blob(c.x, c.y + ph * 0.1, pw * 0.35, ph * 0.62, r, 0.25, 12)).fill({
      color: BARK.dark,
      alpha: 0.75,
    });
    if (lit < 0.15) continue;
    g.poly(blob(c.x + pw * 0.15, c.y, pw * 0.5, ph * 0.5, r, 0.3, 12)).fill({
      color: mix(BARK.base, BARK.lit, 0.35 + 0.65 * lit),
      alpha: 0.35 + 0.45 * lit,
    });
  }
  // Burls: a swelling with a dark eye, on the lit half.
  for (let i = 0; i < 2; i++) {
    const c = tr.at(rr(r, 0.2, 0.8), rr(r, -0.2, 0.6));
    const rad = w * rr(r, 0.12, 0.2);
    g.poly(blob(c.x, c.y, rad, rad * 1.3, r, 0.25)).fill({
      color: mix(BARK.base, BARK.lit, 0.55),
      alpha: 0.7,
    });
    g.poly(blob(c.x - rad * 0.15, c.y + rad * 0.1, rad * 0.45, rad * 0.6, r, 0.3)).fill({
      color: BARK.dark,
      alpha: 0.9,
    });
    L.lit(c.x + rad * 0.3, c.y - rad * 0.3, rad, rad, 0.3);
  }
  // The moon-side rim: a faint pale band hugging the right flank, swelling and fading with the
  // bark (a full-strength even stripe read as a neon outline).
  const gap = fbm1(w * 1.3 + 2);
  const edge = (t: number): Pt => tr.at(t, 0.96);
  for (let k = 0; k < 40; k++) {
    const t0 = k / 40;
    const v = gap(t0 * 9);
    if (v < -0.1) continue;
    g.poly(
      ribbon(
        (t) => edge(t0 + t / 40),
        (t) => w * 0.014 * Math.sin(Math.PI * t) + 0.5,
        4,
      ),
    ).fill({
      color: 0x6f88a6,
      alpha: 0.18 + 0.22 * Math.min(1, v + 0.1),
    });
  }
}

/** A stable 0..1 per number (phase of a trunk's bends). */
function lrand(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** True where mid must stay open: the moon's place (WOOD.mid.clear) above `clearBelow`. */
function blocked(x: number, y: number, p: number, anchorY: number): boolean {
  const [a, b] = WOOD.mid.clear;
  return x > a && x < b && y < layerY(WOOD.mid.clearBelow, p, anchorY);
}

/** What mid hangs moss from: points under its limbs (layer coords). */
export interface WoodMidBuild {
  content: Container;
  lights: LightMap;
  hooks: Pt[];
}

/** Builds the mid layer of the wood: colossal trunks out of the drop, limbs, leaf masses up high. */
export function buildWoodMid(rect: LayerRect, anchorY: number): WoodMidBuild {
  const p = 0.68;
  const hooks: Pt[] = [];
  const top = rect.y - 200;
  const base = rect.y + rect.h + 200;
  // Dark leaf pads: silhouettes against the sky, not lit puffs (lit, they read as cloud).
  const look = crownLook(22, 0.3, 0.55);
  const { content, lights } = withLightMap((c, L) => {
    const r = prng(7300);
    for (const spec of WOOD.mid.trunks) {
      // Limbs go behind the trunk: they grow out of its silhouette, their roots hidden in it.
      const gl = c.addChild(new Graphics());
      const g = c.addChild(new Graphics());
      const tr = new Trunk({
        x: spec.x,
        baseY: base,
        topY: top,
        w: spec.w,
        lean: spec.lean,
        flare: 0,
        taper: 0.12,
        seed: Math.floor(spec.x),
      });
      // An old giant is never a column: its axis wanders in two slow bends and its flanks swell
      // and pinch (no long parallel edges, look target R13).
      {
        const ph = lrand(spec.x);
        const span = base - top;
        const sway = (t: number): number =>
          Math.sin(t * Math.PI * 1.15 + ph * 6.28) * spec.w * 0.55 +
          Math.sin(t * Math.PI * 3.4 + ph * 17) * spec.w * 0.18 +
          Math.sin(t * Math.PI * 7.3 + ph * 29) * spec.w * 0.07;
        tr.center = (t: number): Pt => ({ x: spec.x + spec.lean * t ** 1.3 + sway(t), y: base - span * t });
        const e1 = fbm1(spec.x * 0.37 + 5);
        const e2 = fbm1(spec.x * 0.53 + 9);
        tr.half = (t: number, side: 1 | -1): number => {
          const y = t * span;
          const e = side === 1 ? e1 : e2;
          return (
            (spec.w / 2) *
            (1 - 0.12 * t) *
            (1 + e(y / (spec.w * 1.2)) * 0.22 + e(y / (spec.w * 0.35) + 3) * 0.06)
          );
        };
      }
      drawTrunk(g, tr, BARK, r);
      barkRelief(g, L, tr, spec.w, prng(spec.x * 3 + 1));
      L.reset(spec.x, (top + base) / 2, spec.w, (base - top) / 2);
      // Moon on the right flank, shadow on the left.
      for (let t = 0.05; t < 1; t += 0.12) {
        const q = tr.at(t, 0.55);
        L.lit(q.x, q.y, spec.w * 0.3, spec.w * 0.9, 0.35);
        const s = tr.at(t, -0.6);
        L.shade(s.x, s.y, spec.w * 0.35, spec.w * 0.9, 0.5);
      }
      // Limbs at and above her height, each with a dark leaf mass and moss hanging under it.
      const lr = prng(spec.x * 7 + 3);
      for (let k = 0; k < WOOD.mid.limbs; k++) {
        const ty = layerY(rr(lr, -0.05, 0.55), p, anchorY);
        const t = (base - ty) / (base - top);
        let side: 1 | -1 = (k + Math.floor(spec.x / 100)) % 2 === 0 ? 1 : -1;
        let from = tr.at(t, side * 0.3);
        const len = rr(lr, WOOD.mid.limbLen[0], WOOD.mid.limbLen[1]);
        // No limb reaches into the moon's place: it grows the other way.
        const reach = (x: number): boolean =>
          blocked(x, ty - len * 0.6, p, anchorY) || blocked(x, ty, p, anchorY);
        if (reach(from.x + side * len) || reach(from.x + side * len * 0.5)) {
          side = side === 1 ? -1 : 1;
          from = tr.at(t, side * 0.3);
        }
        const tips = limb(gl, L, from, side, len, spec.w * rr(lr, 0.12, 0.17), lr);
        for (const tip of tips) {
          // Pads of leaves strung out toward the tip, flatter than tall.
          const n = 2 + Math.floor(lr() * 2);
          for (let q = 0; q < n; q++) {
            const u = 1 - q * 0.28;
            const px = from.x + (tip.x - from.x) * u + rr(lr, -20, 20);
            const py = from.y + (tip.y - from.y) * u - rr(lr, 10, 30);
            if (blocked(px, py, p, anchorY)) continue;
            clump(gl, L, px, py, rr(lr, 40, 70) * (1 - q * 0.15), look, lr, { light: 0.12, detail: 0.8 });
          }
          hooks.push({ x: tip.x + rr(lr, -40, 40), y: tip.y + 10 });
        }
        hooks.push({ x: from.x + side * len * 0.35, y: from.y + 10 });
      }
      // Leaf masses at the top of the frame: the giants' own crowns overhead.
      const crownY = layerY(-0.02, p, anchorY);
      for (let k = 0; k < 4; k++) {
        const q = tr.center((base - crownY) / (base - top));
        const cx = q.x + rr(lr, -1.4, 1.4) * spec.w;
        const cy = crownY + rr(lr, -260, -40);
        if (blocked(cx, cy, p, anchorY)) continue;
        clump(g, L, cx, cy, rr(lr, 120, 190), look, lr, { light: 0.12, detail: 0.6 });
      }
      // Moss on the bark, in tufts down the trunk's moon side.
      for (let k = 0; k < 4; k++) {
        const q = tr.at(rr(lr, 0.15, 0.85), rr(lr, -0.9, -0.3));
        g.poly(blob(q.x, q.y, spec.w * rr(lr, 0.06, 0.12), spec.w * rr(lr, 0.15, 0.35), lr, 0.35)).fill({
          color: MOSS[0],
          alpha: 0.5,
        });
      }
    }
  });
  return { content, lights, hooks };
}

/** Moss and silk hanging from mid's limbs: they swing with the same wind as the plants. */
export function woodMidHangers(
  hooks: readonly Pt[],
  tone: (color: number, x: number, y: number) => number,
): SwayItem[] {
  const r = prng(7311);
  const items: SwayItem[] = [];
  for (const h of hooks) {
    const n = r() < 0.3 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const x = h.x + rr(r, -50, 50);
      const len = rr(r, 140, 300);
      const w = rr(r, 18, 34);
      const seed = Math.floor(r() * 1e9);
      const cols = MOSS.map((c) => tone(c, x, h.y + len * 0.5));
      items.push({
        x,
        y: h.y,
        w: w + 20,
        h: len + 10,
        up: 6,
        amp: 0.07,
        phase: r(),
        draw: (g) => mossCurtain(g, 0, 0, w, len, prng(seed), cols, 2.2),
      });
    }
    // (No hanging silk threads: static 1 px lines read as render seams, review round 1. Silk drifts in air.ts.)
  }
  return items;
}
