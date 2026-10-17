// biome-ignore-all lint/style/noNonNullAssertion: arrays indexed in range
/**
 * Set pieces shared by the frames: pods on stalks, root curtains, root mats, buildings.
 */
import { type Container, Graphics } from 'pixi.js';
import type { Composer } from './compose';
import { glow, sleeper } from './paint';
import { branchRoot, type Pt, smoothPath, type TissueBatch, taper, wander } from './tissue';

/** The Mouth's palette (art direction: bone-white, pale flesh-pink, static grey, in cold blue-violet dark). */
export const MOUTH = {
  night: 0x06071a,
  night2: 0x0d0e28,
  haze: 0x2a2848,
  hazePale: 0x4e4a68,
  bone: 0xd9cfc4,
  boneMoon: 0x9c8c88,
  boneShadow: 0x5a5060,
  flesh: 0xd2a3a3,
  fleshDeep: 0x8a5c66,
  static: 0xb8bcc8,
  inner: 0xf2d2c2,
  sleeper: 0x3a3548,
} as const;

export const WARM = { key: 0xffd9a0, gold: 0xffb36b, ember: 0xffb86b, deep: 0xc8642a } as const;

export interface PodSpec {
  /** Where the stalk hangs from. */
  x: number;
  y: number;
  /** Stalk length, pod length, pod half-width. */
  stalk: number;
  len: number;
  w: number;
  /** Sideways lean of the whole thing (px at the pod bottom). */
  lean?: number;
  sway?: number;
  glow?: number;
  color?: number;
  sleeperColor?: number;
  sleeperAlpha?: number;
  /** Seated (the bench) instead of hanging: the pod sits on its bottom. */
  seated?: boolean;
}

export interface PodLayers {
  stalks: TissueBatch;
  back: TissueBatch;
  figures: Graphics;
  front: TissueBatch;
  glows: Container | null;
}

/** A seed-pod case on its stalk with a sleeper inside. Returns the pod centre. */
export function pod(rng: () => number, L: PodLayers, s: PodSpec): Pt {
  const lean = s.lean ?? (rng() - 0.5) * 10;
  const top: Pt = [s.x + lean * 0.4, s.y + s.stalk];
  const stalkPts = smoothPath(
    [[s.x, s.y], [s.x + lean * 0.15 + (rng() - 0.5) * 6, s.y + s.stalk * 0.5], top],
    10,
  );
  L.stalks.strip(stalkPts, taper(Math.max(2, s.w * 0.18), Math.max(1.2, s.w * 0.1)), {
    color: s.color ?? MOUTH.boneMoon,
    kind: 4,
    glow: 0.4,
    seed: rng(),
  });
  const bot: Pt = [s.x + lean, top[1] + s.len * 1.12];
  const body = smoothPath([top, [top[0] + lean * 0.5 + (rng() - 0.5) * 4, top[1] + s.len * 0.5], bot], 14);
  // A cocoon, not an egg: long, fullest a little above the middle, a neck at the stalk, a soft point below.
  const prof = (t: number) => {
    if (s.seated) {
      // Settled on what holds it: fullest low down, a broad rounded base.
      const k = Math.sin(Math.PI * Math.min(1, t ** 1.7 * 0.97 + 0.02)) ** 0.42;
      return Math.max(1, s.w * k);
    }
    const k = Math.sin(Math.PI * Math.min(1, t ** 0.9 * 1.01)) ** 0.8 * (1.04 - 0.16 * t);
    const neck = t < 0.1 ? 0.5 + 0.5 * (t / 0.1) : 1;
    return Math.max(1, s.w * 0.62 * k * neck);
  };
  const col = s.color ?? mixHex(MOUTH.bone, MOUTH.boneShadow, 0.3);
  const seed = rng();
  L.back.strip(body, prof, { color: col, kind: 2, glow: s.glow ?? 0.8, seed });
  const cx = top[0] + lean * 0.5;
  const cy = top[1] + s.len * 0.54;
  sleeper(
    L.figures,
    cx,
    cy,
    s.len * 0.66,
    Math.atan2(lean, s.len) * -1 + (rng() - 0.5) * 0.3,
    s.sleeperColor ?? MOUTH.sleeper,
    s.sleeperAlpha ?? 0.62,
  );
  L.front.strip(body, (t) => prof(t) * 0.98, {
    color: col,
    kind: 2,
    alpha: 0.42,
    glow: 0.25,
    seed: seed + 0.3,
  });
  if (L.glows) L.glows.addChild(glow(cx, cy, s.w * 3.2, MOUTH.inner, 0.07 * (s.glow ?? 0.8)));
  return [cx, cy];
}

export function podLayers(
  c: Composer,
  parent: Container,
  glowK: number,
  glowsParent: Container | null,
): PodLayers {
  const stalks = c.batch('pod-stalks', { glow: MOUTH.inner, glowK: glowK * 0.6, swell: 0.02 }, parent);
  const back = c.batch(
    'pod-back',
    { glow: MOUTH.inner, glowK, rim: MOUTH.static, rimK: 0.12, swell: 0.035 },
    parent,
  );
  const figures = new Graphics();
  parent.addChild(figures);
  const front = c.batch(
    'pod-front',
    { glow: MOUTH.inner, glowK: glowK * 0.5, rim: 0xe8e4f0, rimK: 0.2, swell: 0.035 },
    parent,
  );
  return { stalks, back, figures, front, glows: glowsParent };
}

export function donePods(L: PodLayers): void {
  L.stalks.done();
  L.back.done();
  L.front.done();
}

/**
 * Root hanging from an edge (a roof, a ledge, a branch): mostly sagging loops between two points
 * on the edge, with a few strands that hang free, end round, and curl a little. Never spikes.
 */
export function curtain(
  rng: () => number,
  b: TissueBatch,
  x0: number,
  x1: number,
  y: number | ((x: number) => number),
  len: [number, number],
  w: [number, number],
  color: number,
  glowK = 0.5,
  gap: [number, number] = [14, 40],
): void {
  const yAt = (x: number) => (typeof y === 'function' ? y(x) : y);
  for (let x = x0 + rng() * gap[0]; x < x1; x += gap[0] + rng() * (gap[1] - gap[0])) {
    const l = len[0] + (len[1] - len[0]) * rng() ** 1.8;
    const ww = w[0] + (w[1] - w[0]) * rng();
    const style = { color, glow: glowK * (0.4 + 0.6 * rng()), seed: rng() };
    if (rng() < 0.35) {
      // A loop: from here to a point further along, sagging less than it spans.
      const span = Math.min(x1 - x, 40 + rng() * Math.max(40, l * 1.4));
      if (span < 30) continue;
      const xb = x + span;
      const sag = Math.min(l * 0.5, span * 0.45) * (0.35 + rng() * 0.65);
      const ya = yAt(x) - 2;
      const yb = yAt(xb) - 2;
      const pts = smoothPath(
        [
          [x, ya],
          [x + span * 0.2, ya + sag * 0.75],
          [x + span * 0.5 + (rng() - 0.5) * span * 0.2, (ya + yb) / 2 + sag],
          [x + span * 0.8, yb + sag * 0.75],
          [xb, yb],
        ],
        8,
      );
      b.strip(pts, (t) => ww * (0.7 + 0.3 * Math.abs(t * 2 - 1)) + 0.4, style);
    } else {
      // A strand that hangs and ends in a soft round tip, not a point.
      const pts = wander(rng, {
        x,
        y: yAt(x) - 2,
        ang: Math.PI / 2 + (rng() - 0.5) * 0.3,
        len: l,
        step: 6,
        curl: 0.09,
        droop: 0.1,
      });
      const tipK = 1.05 + rng() * 0.4;
      b.strip(
        pts,
        (t) => {
          const body = ww * (1 - 0.45 * t);
          const tip = t > 0.9 ? Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.1) ** 2)) : 1;
          const bulb = t > 0.8 ? 1 + (tipK - 1) * Math.sin(((t - 0.8) / 0.2) * Math.PI) : 1;
          return Math.max(0.5, body * tip * bulb);
        },
        style,
      );
    }
  }
}

/** A mat of roots running along the ground near y, between x0 and x1. */
export function mat(
  rng: () => number,
  b: TissueBatch,
  x0: number,
  x1: number,
  y: number,
  count: number,
  w: [number, number],
  color: number,
  spread = 10,
  glowK = 0.5,
): void {
  for (let i = 0; i < count; i++) {
    const x = x0 + rng() * (x1 - x0);
    const dir = rng() < 0.5 ? 0 : Math.PI;
    const pts = wander(rng, {
      x,
      y: y + (rng() - 0.3) * spread,
      ang: dir + (rng() - 0.5) * 0.3,
      len: 120 + rng() * 380,
      step: 9,
      curl: 0.08,
      toward: 0.08,
      towardAng: dir,
    });
    // Keep it on the ground: flatten toward y.
    for (const p of pts) p[1] = y + (p[1] - y) * 0.25;
    b.strip(pts, taper(w[0] + (w[1] - w[0]) * rng(), 0.6, 0.3, rng()), {
      color,
      glow: glowK * rng(),
      seed: rng(),
    });
  }
}

/** Roots splaying from a foot over flat ground (they hug it: y is pressed toward the ground line). */
export function spread(
  rng: () => number,
  b: TissueBatch,
  x: number,
  y: number,
  count: number,
  len: [number, number],
  w: [number, number],
  color: number,
  glowK = 0.5,
): void {
  for (let i = 0; i < count; i++) {
    const left = i % 2 === 0;
    const pts = wander(rng, {
      x: x + (rng() - 0.5) * 10,
      y,
      ang: left ? Math.PI : 0,
      len: len[0] + (len[1] - len[0]) * rng(),
      step: 7,
      curl: 0.16,
      toward: 0.05,
      towardAng: left ? Math.PI : 0,
    });
    for (const p of pts) p[1] = y + (p[1] - y) * 0.12 + (rng() - 0.5) * 0.6;
    b.strip(pts, taper(w[0] + (w[1] - w[0]) * rng(), 0.6, 0.35, rng()), {
      color,
      glow: glowK * rng(),
      seed: rng(),
    });
  }
}

export interface BuildingSpec {
  x: number;
  w: number;
  top: number;
  bottom: number;
  color: number;
  edge?: number;
  /** Window grid: column width, row height, window w, h; 0 = none. */
  win?: [number, number, number, number];
  winColor?: number;
  /** Chance a window holds a lit pod (pale glow). */
  litChance?: number;
  /** Broken roofline amount (px). */
  broken?: number;
}

/** A building as a flat silhouette with a dark window grid; returns the lit window centres. */
export function building(rng: () => number, g: Graphics, s: BuildingSpec): Pt[] {
  const lit: Pt[] = [];
  const br = s.broken ?? 0;
  const pts: Pt[] = [[s.x, s.bottom]];
  pts.push([s.x, s.top + br * rng()]);
  const steps = Math.max(2, Math.round(s.w / 40));
  for (let i = 1; i < steps; i++)
    pts.push([s.x + (s.w * i) / steps, s.top + br * rng() * (rng() < 0.3 ? 2 : 0.4)]);
  pts.push([s.x + s.w, s.top + br * rng()]);
  pts.push([s.x + s.w, s.bottom]);
  g.poly(pts.flat()).fill(s.color);
  if (s.edge !== undefined) g.rect(s.x, s.top, 3, s.bottom - s.top).fill({ color: s.edge, alpha: 0.5 });
  if (s.win) {
    const [cw, rh, ww, wh] = s.win;
    for (let y = s.top + rh * 0.8; y + wh < s.bottom - rh * 0.3; y += rh)
      for (let x = s.x + (cw - ww) / 2 + 4; x + ww < s.x + s.w - 4; x += cw) {
        if (rng() < 0.08) continue;
        const litW = rng() < (s.litChance ?? 0);
        g.rect(x, y, ww, wh).fill({ color: s.winColor ?? 0x000000, alpha: litW ? 0.95 : 0.55 });
        if (litW) lit.push([x + ww / 2, y + wh / 2]);
      }
  }
  return lit;
}

/** Roots that pour from a point and branch as they go. */
export function pour(
  rng: () => number,
  b: TissueBatch,
  x: number,
  y: number,
  ang: number,
  len: number,
  w0: number,
  color: number,
  glowK: number,
  depth = 2,
  droop = 0.03,
): Pt[] {
  return branchRoot(b, rng, {
    x,
    y,
    ang,
    len,
    step: 7,
    curl: 0.1,
    droop,
    w0,
    w1: 0.8,
    depth,
    kids: 2,
    style: { color, glow: glowK },
  });
}

export function pick<T>(rng: () => number, a: readonly T[]): T {
  return a[Math.floor(rng() * a.length)]!;
}

/** The forest's palette (docs/art-direction.md, the Grove). */
export const FOREST = {
  deep: 0x061a24,
  shadow: 0x0b2a33,
  indigo: 0x12233f,
  fogFar: 0x5fa3a8,
  fogMid: 0x2f6f78,
  leafDark: 0x0f4a3c,
  leaf: 0x1f7a55,
  leafLit: 0x6fbf6a,
  leafSun: 0xc9d977,
  bark: 0x1a2a30,
  barkLit: 0x4a5a4e,
  cyan: 0x9ff3ff,
  violet: 0xc58bff,
} as const;

/**
 * A fern drawn in its own frame (base at 0,0, growing up, -y): a curved stem with leaflets that
 * shrink toward the tip. Put it in a container and rotate the container to sway it.
 */
export function fern(
  rng: () => number,
  g: Graphics,
  len: number,
  bend: number,
  stem: number,
  leaf: number,
  leafTip: number,
): void {
  const n = 14;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([Math.sin(t * 1.6) * bend * len, -t * len + t * t * Math.abs(bend) * len * 0.3]);
  }
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const [x, y] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const a = Math.atan2(y1 - y, x1 - x);
    const size = len * 0.24 * (1 - t) ** 0.7 + 3;
    const col = mixHex(leaf, leafTip, t);
    for (const side of [-1, 1]) {
      const la = a + side * (1.25 + rng() * 0.25) + 0.45 * side * side;
      const ex = x + Math.cos(la) * size;
      const ey = y + Math.sin(la) * size;
      const w = size * 0.16;
      const nx = -Math.sin(la) * w;
      const ny = Math.cos(la) * w;
      g.poly([x, y, (x + ex) / 2 + nx, (y + ey) / 2 + ny, ex, ey, (x + ex) / 2 - nx, (y + ey) / 2 - ny]).fill(
        col,
      );
    }
  }
  const flat = pts.flat();
  g.moveTo(flat[0]!, flat[1]!);
  for (let i = 2; i < flat.length; i += 2) g.lineTo(flat[i]!, flat[i + 1]!);
  g.stroke({ color: stem, width: 2.2, cap: 'round' });
}

export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  return (
    (Math.round(ar + (((b >> 16) & 255) - ar) * t) << 16) |
    (Math.round(ag + (((b >> 8) & 255) - ag) * t) << 8) |
    Math.round(ab + ((b & 255) - ab) * t)
  );
}

export interface Blade {
  x: number;
  y: number;
  h: number;
  w: number;
  lean: number;
  color: number;
  /** 0 = still (the Mouth's side), 1 = moves in the wind. */
  live: number;
  ph: number;
}

/** Grass redrawn each frame: live blades lean with the travelling wind; dead ones stand still. */
export class Grass {
  readonly g = new Graphics();
  constructor(
    readonly blades: Blade[],
    private readonly wind: (x: number, t: number, ph: number) => number,
  ) {}
  update(t: number): void {
    const g = this.g;
    g.clear();
    for (const b of this.blades) {
      const sway = b.live * this.wind(b.x, t, b.ph) * b.h * 0.28;
      const tx = b.x + b.lean * b.h + sway;
      const ty = b.y - b.h + Math.abs(sway) * 0.2;
      const mx = b.x + (b.lean * b.h + sway) * 0.45;
      const my = b.y - b.h * 0.55;
      g.poly([b.x - b.w, b.y, mx - b.w * 0.5, my, tx, ty, mx + b.w * 0.5, my, b.x + b.w, b.y]).fill(b.color);
    }
  }
}

/**
 * A rope of root: several strands of different weights that twist round one spine, part and rejoin,
 * each with its own knots, so a big root never reads as one smooth pipe. `w` is the whole rope's
 * half-width at its start; it thins to `w1` at its end.
 */
export function braid(
  rng: () => number,
  b: TissueBatch,
  spine: readonly Pt[],
  w: number,
  w1: number,
  colors: readonly number[],
  glowK: number,
  strands = 5,
  kind = 0,
): void {
  const n = spine.length;
  // Normals along the spine.
  const nrm: Pt[] = spine.map((_p, i) => {
    const a = spine[Math.max(0, i - 1)]!;
    const c = spine[Math.min(n - 1, i + 1)]!;
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  let len = 0;
  const along: number[] = spine.map((p, i) => {
    if (i > 0) len += Math.hypot(p[0] - spine[i - 1]![0], p[1] - spine[i - 1]![1]);
    return len;
  });
  for (let k = 0; k < strands; k++) {
    const weight = k === 0 ? 0.62 : 0.22 + rng() * 0.32;
    const ph = rng() * 6.28;
    const freq = (0.008 + rng() * 0.012) * (rng() < 0.5 ? 1 : -1);
    const reach = k === 0 ? 0.2 : 0.55 + rng() * 0.35;
    // Some strands only run part of the way.
    const s0 = k === 0 ? 0 : Math.floor(rng() * 0.3 * n);
    const s1 = k === 0 ? n : n - Math.floor(rng() * 0.35 * n);
    const pts: Pt[] = [];
    for (let i = s0; i < s1; i++) {
      const t = i / (n - 1);
      const ww = w + (w1 - w) * t;
      const off = Math.sin(along[i]! * freq + ph) * ww * reach;
      pts.push([spine[i]![0] + nrm[i]![0] * off, spine[i]![1] + nrm[i]![1] * off]);
    }
    if (pts.length < 2) continue;
    const t0 = s0 / (n - 1);
    const t1 = (s1 - 1) / (n - 1);
    b.strip(
      pts,
      (u) => {
        const t = t0 + (t1 - t0) * u;
        const ww = w + (w1 - w) * t;
        const knot = 0.8 + 0.3 * Math.sin(t * 31 + ph) * Math.sin(t * 7 + ph * 2);
        const ends = k === 0 ? 1 : Math.min(1, u / 0.08, (1 - u) / 0.08);
        return Math.max(0.6, ww * weight * knot * (0.25 + 0.75 * ends));
      },
      { color: colors[k % colors.length]!, glow: glowK * (0.6 + 0.4 * rng()), seed: rng(), kind },
    );
  }
}
