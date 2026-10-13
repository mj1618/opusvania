/**
 * Silhouette plants for the foreground: boughs, vines, ferns, grass, broad leaves, trunks. Each
 * function draws one plant into a Graphics around a local origin (its attachment point: where it
 * hangs from or grows out of), in dark tones with a lighter copy peeking out on the side the key
 * light comes from. They are meant to be blurred after baking, so shapes are bold and simple.
 */
import type { Graphics } from 'pixi.js';
import { KEY_LIGHT, mix, PALETTE } from './look';

export type Rnd = () => number;

/** Tones of one plant: `body` shades are picked per leaf, `rim` is the lit edge. */
export interface Tones {
  body: readonly number[];
  rim: number;
  /** The cool edge on the side away from the light. */
  cool: number;
  rimAlpha: number;
  /** How far the lit copy is pushed toward the light, px. */
  rimShift: number;
}

/** Which depth plane is being drawn: the far one is lighter, greener and keeps more colour. */
let farPlane = false;
export function withPlane<T>(far: boolean, draw: () => T): T {
  farPlane = far;
  try {
    return draw();
  } finally {
    farPlane = false;
  }
}

export function foregroundTones(rnd: Rnd, warmth = 0.5, rimAlpha = 0.5): Tones {
  // Near plane: almost black, but always a teal or indigo black. Far plane: deep forest green.
  const dark = mix(mix(PALETTE.shadowDeep, PALETTE.shadowIndigo, rnd() * 0.5), 0x01060b, 0.5);
  const base = farPlane
    ? mix(mix(PALETTE.foliageDark, PALETTE.shadow, 0.35 + rnd() * 0.3), 0x03131a, 0.3)
    : dark;
  const green = farPlane ? PALETTE.foliage : PALETTE.foliageDark;
  return {
    body: [
      mix(base, 0x01060b, farPlane ? 0.3 : 0.5),
      base,
      mix(base, green, 0.18),
      mix(base, PALETTE.shadow, 0.3),
      mix(base, green, 0.32),
    ],
    rim: mix(mix(PALETTE.foliage, PALETTE.fogMid, 0.5), PALETTE.keyWarm, 0.3 + 0.35 * warmth),
    cool: mix(PALETTE.fogMid, PALETTE.glowCyan, 0.35),
    rimAlpha: rimAlpha * (farPlane ? 1.15 : 1),
    rimShift: farPlane ? 4 : 7,
  };
}

const pick = (rnd: Rnd, a: readonly number[]): number => a[Math.floor(rnd() * a.length)] as number;
/** Unit vector toward the light (up and to the right). */
const LX = -KEY_LIGHT.dirX;
const LY = -KEY_LIGHT.dirY;

function leafPath(g: Graphics, x: number, y: number, len: number, width: number, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tx = x + c * len;
  const ty = y + s * len;
  const mx = x + c * len * 0.42;
  const my = y + s * len * 0.42;
  const nx = -s * width;
  const ny = c * width;
  g.moveTo(x, y)
    .quadraticCurveTo(mx + nx, my + ny, tx, ty)
    .quadraticCurveTo(mx - nx, my - ny, x, y);
}

/** One pointed leaf from (x, y) along `angle`, with its lit edge. */
export function leaf(
  g: Graphics,
  t: Tones,
  rnd: Rnd,
  x: number,
  y: number,
  len: number,
  width: number,
  angle: number,
): void {
  if (rnd() < 0.45) {
    leafPath(g, x - LX * t.rimShift * 0.7, y + 1, len, width, angle);
    g.fill({ color: t.cool, alpha: t.rimAlpha * 0.45 });
  }
  if (rnd() < 0.6) {
    leafPath(g, x + LX * t.rimShift, y + LY * t.rimShift, len, width, angle);
    g.fill({ color: t.rim, alpha: t.rimAlpha * (0.4 + 0.6 * rnd()) });
  }
  leafPath(g, x, y, len, width, angle);
  const body = pick(rnd, t.body);
  g.fill(body);
  // A midrib, so a leaf is a leaf even as a silhouette.
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  g.moveTo(x + c * len * 0.08, y + sn * len * 0.08)
    .lineTo(x + c * len * 0.9, y + sn * len * 0.9)
    .stroke({ color: mix(body, t.rim, 0.35), width: Math.max(1, width * 0.09), alpha: 0.55 });
}

type Pt = readonly [number, number, number];

/** A tapered strip through centre points [x, y, width]. */
export function ribbon(g: Graphics, pts: readonly Pt[], color: number, alpha = 1, dx = 0, dy = 0): void {
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as Pt;
    const a = pts[Math.max(0, i - 1)] as Pt;
    const b = pts[Math.min(pts.length - 1, i + 1)] as Pt;
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    const nx = (-ty / l) * p[2] * 0.5;
    const ny = (tx / l) * p[2] * 0.5;
    left.push(p[0] + nx + dx, p[1] + ny + dy);
    right.unshift(p[0] - nx + dx, p[1] - ny + dy);
  }
  g.poly([...left, ...right]).fill({ color, alpha });
}

/** Points along a quadratic curve with widths tapering from w0 to w1. */
export function curve(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
  n = 12,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const m = 1 - k;
    out.push([
      m * m * x0 + 2 * m * k * cx + k * k * x1,
      m * m * y0 + 2 * m * k * cy + k * k * y1,
      w0 + (w1 - w0) * k ** 0.8,
    ]);
  }
  return out;
}

function litRibbon(g: Graphics, t: Tones, pts: readonly Pt[], color: number): void {
  ribbon(g, pts, t.rim, t.rimAlpha * 0.8, LX * t.rimShift * 0.8, LY * t.rimShift * 0.8);
  ribbon(g, pts, color);
}

/** A spray of leaves around a point, fanning about `angle`. */
function cluster(
  g: Graphics,
  t: Tones,
  rnd: Rnd,
  x: number,
  y: number,
  size: number,
  angle: number,
  spread: number,
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = angle + (rnd() - 0.5) * spread;
    const len = size * (0.55 + rnd() * 0.6);
    leaf(
      g,
      t,
      rnd,
      x + (rnd() - 0.5) * size * 0.35,
      y + (rnd() - 0.5) * size * 0.25,
      len,
      len * (0.2 + rnd() * 0.12),
      a,
    );
  }
}

/**
 * A leafy bough hanging in from above: a branch from the origin sweeping `dir` (-1 left, 1 right)
 * and drooping, with sprays of leaves along it. Fits roughly span x drop.
 */
export function bough(g: Graphics, rnd: Rnd, span: number, drop: number, dir: number): void {
  const t = foregroundTones(rnd, 0.7);
  const ex = dir * span;
  const ey = drop * (0.55 + rnd() * 0.25);
  const main = curve(0, -60, dir * span * 0.45, -20 + drop * 0.1, ex, ey, 26 + rnd() * 14, 3, 14);
  // Sprays first where they hang behind the branch, then the branch, then the front sprays.
  const sprays = 7 + Math.floor(rnd() * 4);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < sprays; i++) {
      const p = main[
        Math.min(main.length - 1, 2 + Math.floor(((i + rnd() * 0.8) / sprays) * (main.length - 2)))
      ] as Pt;
      const size = (0.42 + rnd() * 0.3) * Math.max(110, drop) * (1 - 0.3 * (i / sprays));
      const down = Math.PI / 2 + dir * (0.25 + rnd() * 0.5);
      cluster(
        g,
        t,
        rnd,
        p[0],
        p[1] + (pass ? 8 : -6),
        size,
        pass ? down : down - dir * 0.9,
        1.5,
        4 + Math.floor(rnd() * 3),
      );
    }
    if (pass === 0) litRibbon(g, t, main, t.body[0] as number);
  }
  // A side twig or two.
  for (let i = 0; i < 2; i++) {
    const p = main[4 + Math.floor(rnd() * 6)] as Pt;
    const len = 60 + rnd() * 90;
    const twig = curve(
      p[0],
      p[1],
      p[0] + dir * len * 0.3,
      p[1] + len * 0.5,
      p[0] + dir * len * 0.2,
      p[1] + len,
      7,
      2,
      6,
    );
    ribbon(g, twig, t.body[0] as number);
    cluster(g, t, rnd, p[0] + dir * len * 0.2, p[1] + len, 46 + rnd() * 30, Math.PI / 2, 1.9, 6);
  }
}

/** A hanging vine: a thin swaying strand with small paired leaves, `length` px long. */
export function vine(g: Graphics, rnd: Rnd, length: number): void {
  const t = foregroundTones(rnd, 0.4);
  const bend = (rnd() - 0.5) * length * 0.3;
  const pts = curve(0, -40, bend, length * 0.5, bend * 0.4, length, 6, 2, 16);
  litRibbon(g, t, pts, t.body[0] as number);
  for (let i = 2; i < pts.length; i++) {
    const p = pts[i] as Pt;
    if (rnd() < 0.25) continue;
    const side = i % 2 ? 1 : -1;
    const size = 16 + rnd() * 20;
    leaf(g, t, rnd, p[0], p[1], size, size * 0.34, Math.PI / 2 + side * (0.7 + rnd() * 0.5));
  }
  // A tuft at the tip.
  const end = pts[pts.length - 1] as Pt;
  cluster(g, t, rnd, end[0], end[1], 30, Math.PI / 2, 1.6, 4);
}

/** A fern: arching fronds from the origin, each a spine with rows of leaflets. Height ~`size`. */
export function fern(g: Graphics, rnd: Rnd, size: number): void {
  const t = foregroundTones(rnd, 0.5, 0.85);
  const fronds = 6 + Math.floor(rnd() * 4);
  for (let f = 0; f < fronds; f++) {
    const k = (f + 0.5) / fronds - 0.5 + (rnd() - 0.5) * 0.12;
    const len = size * (0.75 + rnd() * 0.5) * (1 - Math.abs(k) * 0.3);
    const lean = k * 2.3;
    // The frond rises, then arches over under its own weight.
    const tx = Math.sin(lean) * len * 1.05;
    const ty = -Math.cos(lean) * len * 0.8 + Math.abs(k) * len * 0.5;
    const spine = curve(0, 10, Math.sin(lean) * len * 0.45, -len * 0.95, tx, ty, 6, 1.5, 14);
    litRibbon(g, t, spine, t.body[1] as number);
    for (let i = 2; i < spine.length; i++) {
      const p = spine[i] as Pt;
      const q = spine[i - 1] as Pt;
      const along = Math.atan2(p[1] - q[1], p[0] - q[0]);
      const u = i / (spine.length - 1);
      const l = len * 0.24 * Math.sin(Math.PI * (0.12 + 0.88 * u)) + 5;
      leaf(g, t, rnd, p[0], p[1], l, l * 0.3, along + 1.15);
      leaf(g, t, rnd, p[0], p[1], l, l * 0.3, along - 1.15);
    }
  }
}

/** A tuft of long grass blades, ~`size` tall. */
export function grass(g: Graphics, rnd: Rnd, size: number, width: number): void {
  const t = foregroundTones(rnd, 0.6, 0.85);
  const blades = 12 + Math.floor(rnd() * 10);
  for (let i = 0; i < blades; i++) {
    const x = (rnd() - 0.5) * width;
    const h = size * (0.45 + rnd() * 0.7);
    const lean = (x / width) * 1.1 + (rnd() - 0.5) * 0.7;
    const pts = curve(x, 12, x + lean * h * 0.25, -h * 0.6, x + lean * h * 0.75, -h, 9 + rnd() * 6, 1, 7);
    if (rnd() < 0.5) ribbon(g, pts, t.rim, t.rimAlpha * 0.7, LX * 5, LY * 5);
    ribbon(g, pts, pick(rnd, t.body));
  }
}

/** A few big broad leaves on arching stalks, ~`size` tall. */
export function broadLeaves(g: Graphics, rnd: Rnd, size: number): void {
  const t = foregroundTones(rnd, 0.8, 0.85);
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n - 0.5 + (rnd() - 0.5) * 0.2;
    const h = size * (0.6 + rnd() * 0.45);
    const bx = k * size * 0.5;
    const tx = bx + k * size * 1.3;
    const ty = -h * (0.75 - Math.abs(k) * 0.4);
    const stalk = curve(bx, 12, bx + k * size * 0.4, -h * 0.9, tx, ty, 8, 4, 8);
    litRibbon(g, t, stalk, t.body[0] as number);
    const droop = k * 1.5 + (rnd() - 0.5) * 0.4;
    const len = size * (0.55 + rnd() * 0.35);
    dripLeaf(g, t, rnd, tx, ty, len, len * 0.3, -Math.PI / 2 + droop + Math.sign(k || 1) * 0.9);
  }
}

/**
 * A trunk standing right in front of the lens: from y = 0 down to `height`, `width` wide, leaning
 * by `lean` px over its height, flaring into roots at the bottom, with a lit flank.
 */
export function trunk(g: Graphics, rnd: Rnd, width: number, height: number, lean: number): void {
  const t = foregroundTones(rnd, 0.9);
  const pts: Pt[] = [];
  const n = 26;
  const wob = rnd() * 6.283;
  const bow = (rnd() - 0.5) * width * 1.6;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    // Roots flare at the bottom, the bole swells here and there, nothing is ruler-straight.
    const flare = 1 + 34 * Math.max(0, k - 0.82) ** 2 + 4 * Math.max(0, 0.1 - k);
    const swell = 1 + 0.16 * Math.sin(k * 7 + wob * 2) + 0.1 * Math.sin(k * 17 + wob);
    pts.push([
      lean * (k - 0.5) + Math.sin(k * Math.PI) * bow + Math.sin(k * 6 + wob) * width * 0.16,
      k * height,
      width * flare * swell,
    ]);
  }
  ribbon(g, pts, t.rim, 0.5, LX * 14, 0);
  ribbon(g, pts, t.body[1] as number);
  // Bark furrows: slightly lighter and darker stripes so the mass is not a flat cut-out.
  for (let s = 0; s < 4; s++) {
    const off = (s / 3 - 0.5) * 0.7;
    const stripe = pts.map((p) => [p[0] + off * p[2], p[1], p[2] * (0.08 + 0.06 * rnd())] as Pt);
    ribbon(g, stripe, s % 2 ? (t.body[0] as number) : (t.body[2] as number), 0.8);
  }
  // Moss and a few leaves clinging to the lit side.
  for (let i = 0; i < 7; i++) {
    const p = pts[2 + Math.floor(rnd() * (n - 5))] as Pt;
    cluster(g, t, rnd, p[0] + p[2] * 0.45, p[1], 34 + rnd() * 30, 0.4 + rnd() * 1.2, 1.6, 4);
  }
}

/**
 * Lianas hanging right in front of the lens from y = 0 to `height`: two or three thin ropes that
 * wander around each other, with the odd leaf. Thin enough to pass over the character unnoticed.
 */
export function lianas(g: Graphics, rnd: Rnd, height: number, lean: number): void {
  const t = foregroundTones(rnd, 0.6);
  const strands = 2 + Math.floor(rnd() * 2);
  for (let j = 0; j < strands; j++) {
    const ph = rnd() * 6.283;
    const amp = 26 + rnd() * 40;
    const freq = 3 + rnd() * 4;
    const w = 12 + rnd() * 10;
    const off = (rnd() - 0.5) * 60;
    const pts: Pt[] = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      pts.push([
        off +
          lean * (k - 0.5) +
          Math.sin(k * freq + ph) * amp +
          Math.sin(k * freq * 2.7 + ph * 2) * amp * 0.25,
        k * height,
        w * (0.8 + 0.3 * Math.sin(k * 23 + ph)),
      ]);
    }
    litRibbon(g, t, pts, t.body[j % 2] as number);
    for (let i = 2; i < n; i++) {
      if (rnd() > 0.2) continue;
      const p = pts[i] as Pt;
      const side = rnd() < 0.5 ? -1 : 1;
      const size = 22 + rnd() * 26;
      leaf(g, t, rnd, p[0], p[1], size, size * 0.36, Math.PI / 2 + side * (0.6 + rnd() * 0.7));
      if (rnd() < 0.5)
        leaf(g, t, rnd, p[0], p[1], size * 0.8, size * 0.3, Math.PI / 2 - side * (0.5 + rnd() * 0.6));
    }
  }
}

/**
 * A wildflower or two on arching stalks, ~`size` tall: a drooping bell with a touch of colour
 * (`color`), the only thing in the foreground that is not green.
 */
export function flowers(g: Graphics, rnd: Rnd, size: number, color: number): void {
  const t = foregroundTones(rnd, 0.7, 0.8);
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n - 0.5 + (rnd() - 0.5) * 0.3;
    const h = size * (0.7 + rnd() * 0.4);
    const bx = k * size * 0.5;
    const tx = bx + k * size * 0.9 + (rnd() - 0.5) * 20;
    const stalk = curve(bx, 12, bx + k * size * 0.2, -h * 1.05, tx, -h * 0.82, 4.5, 2, 9);
    litRibbon(g, t, stalk, t.body[1] as number);
    // A couple of leaves low on the stalk.
    const low = stalk[2] as Pt;
    leaf(g, t, rnd, low[0], low[1], size * 0.3, size * 0.09, -Math.PI / 2 + 0.9);
    leaf(g, t, rnd, low[0], low[1], size * 0.26, size * 0.08, -Math.PI / 2 - 1);
    // The bell: five petals hanging from the tip, dusky outside, a glowing heart.
    const r = size * (0.11 + rnd() * 0.05);
    const petal = mix(color, t.body[1] as number, 0.5);
    for (let pth = 0; pth < 5; pth++) {
      const a = Math.PI / 2 + (pth - 2) * 0.42;
      leafPath(g, tx, -h * 0.82, r * 1.9, r * 0.75, a);
      g.fill(pth % 2 ? petal : mix(petal, color, 0.35));
    }
    g.circle(tx, -h * 0.82 + r * 0.9, r * 0.32).fill({ color: mix(color, 0xffffff, 0.4), alpha: 0.9 });
  }
}

function dripPath(g: Graphics, x: number, y: number, len: number, width: number, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const at = (along: number, side: number): [number, number] => [
    x + c * len * along - s * width * side,
    y + s * len * along + c * width * side,
  ];
  const tip = at(1, 0);
  const [a1x, a1y] = at(0.2, 1.45);
  const [a2x, a2y] = at(0.74, 0.3);
  const [b1x, b1y] = at(0.74, -0.3);
  const [b2x, b2y] = at(0.2, -1.45);
  g.moveTo(x, y).bezierCurveTo(a1x, a1y, a2x, a2y, tip[0], tip[1]).bezierCurveTo(b1x, b1y, b2x, b2y, x, y);
}

/**
 * A big broad leaf with a drip tip: full belly near the stalk, drawn out to a long point, with a
 * midrib and side veins. `width` is the half width of the belly.
 */
export function dripLeaf(
  g: Graphics,
  t: Tones,
  rnd: Rnd,
  x: number,
  y: number,
  len: number,
  width: number,
  angle: number,
): void {
  dripPath(g, x - LX * t.rimShift * 0.8, y + 1.5, len, width, angle);
  g.fill({ color: t.cool, alpha: t.rimAlpha * 0.4 });
  dripPath(g, x + LX * t.rimShift, y + LY * t.rimShift, len, width, angle);
  g.fill({ color: t.rim, alpha: t.rimAlpha * (0.5 + 0.4 * rnd()) });
  dripPath(g, x, y, len, width, angle);
  const body = pick(rnd, t.body);
  g.fill(body);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const vein = { color: mix(body, t.rim, 0.4), alpha: 0.5 };
  g.moveTo(x, y)
    .lineTo(x + c * len * 0.93, y + s * len * 0.93)
    .stroke({ ...vein, width: Math.max(1.2, width * 0.07) });
  for (let i = 1; i <= 4; i++) {
    const k = 0.1 + i * 0.13;
    const reach = width * (0.95 - i * 0.14);
    for (const side of [-1, 1]) {
      g.moveTo(x + c * len * k, y + s * len * k)
        .lineTo(x + c * len * (k + 0.16) - s * reach * side, y + s * len * (k + 0.16) + c * reach * side)
        .stroke({ ...vein, width: Math.max(0.8, width * 0.035), alpha: 0.35 });
    }
  }
}

/**
 * A bough of few, big, separate leaves (near plane): a stem from the origin sweeping `dir` and
 * drooping to `drop`, with drip-tip leaves alternating along it. Every leaf reads on its own.
 */
export function leafBranch(g: Graphics, rnd: Rnd, span: number, drop: number, dir: number): void {
  const t = foregroundTones(rnd, 0.8, 0.6);
  const stem = curve(
    0,
    -70,
    dir * span * 0.5,
    -30 + drop * 0.15,
    dir * span,
    drop * 0.7,
    20 + rnd() * 8,
    4,
    12,
  );
  const leaves = 5 + Math.floor(rnd() * 3);
  const draw = (i: number): void => {
    const u = (i + 0.6) / (leaves + 0.2);
    const idx = Math.min(stem.length - 2, 1 + Math.floor(u * (stem.length - 2)));
    const p = stem[idx] as Pt;
    const q = stem[idx + 1] as Pt;
    const along = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const side = i % 2 ? 1 : -1;
    const len = (0.5 + rnd() * 0.22) * Math.max(drop, 200) * (1 - 0.25 * u);
    // Leaves hang: whatever side they leave the stem on, they turn toward the ground.
    const a = along + side * dir * (0.75 + rnd() * 0.3);
    const hang = a + (Math.PI / 2 - a) * 0.45;
    dripLeaf(g, t, rnd, p[0], p[1], len, len * (0.2 + rnd() * 0.05), hang);
  };
  for (let i = 0; i < leaves; i += 2) draw(i);
  litRibbon(g, t, stem, t.body[0] as number);
  for (let i = 1; i < leaves; i += 2) draw(i);
  const end = stem[stem.length - 1] as Pt;
  const len = Math.max(drop, 200) * 0.42;
  dripLeaf(g, t, rnd, end[0], end[1], len, len * 0.22, Math.PI / 2 + dir * 0.35);
}

/**
 * A hanging cluster of blossom (near plane): a thin stem with pairs of small petals getting
 * smaller toward the tip, in a dusky `color`.
 */
export function flowerCluster(g: Graphics, rnd: Rnd, length: number, color: number): void {
  const t = foregroundTones(rnd, 0.7, 0.6);
  const bend = (rnd() - 0.5) * length * 0.25;
  const stem = curve(0, -50, bend, length * 0.4, bend * 0.5, length, 5, 1.5, 18);
  litRibbon(g, t, stem, t.body[0] as number);
  for (let i = 5; i < stem.length; i++) {
    const p = stem[i] as Pt;
    const u = (i - 5) / (stem.length - 6);
    const size = (26 - 14 * u) * (0.85 + rnd() * 0.3);
    const tone = mix(color, t.body[1] as number, 0.3 + 0.3 * rnd());
    for (const side of [-1, 1]) {
      leafPath(g, p[0], p[1], size, size * 0.5, Math.PI / 2 + side * (0.75 + rnd() * 0.3));
      g.fill(tone);
    }
    g.circle(p[0], p[1] + size * 0.3, size * 0.16).fill({ color: mix(color, 0xffffff, 0.35), alpha: 0.8 });
  }
}
