import type { Graphics } from 'pixi.js';
import { DEFAULT_KEYS } from '../input/bindings';
import type { Action } from '../sim/input';
import { PALETTE } from './palette';

/**
 * Code-drawn glyphs (no Text objects: stroked Graphics render the same on every machine, so they
 * are safe in screenshot goldens and can rotate for stamps). A stroke font on a 4x6 grid for
 * stamps, count numbers and keycaps, plus small icons (keycaps, open hand, shield, coin, padlock).
 */

type Poly = readonly number[];
const O = [1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0];
const FONT: Record<string, readonly Poly[]> = {
  A: [
    [0, 6, 0, 2, 2, 0, 4, 2, 4, 6],
    [0, 4, 4, 4],
  ],
  B: [[0, 3, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3, 0, 6, 3, 6, 4, 5, 4, 4, 3, 3]],
  C: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5]],
  D: [[0, 0, 0, 6, 2, 6, 4, 4, 4, 2, 2, 0, 0, 0]],
  E: [
    [4, 0, 0, 0, 0, 6, 4, 6],
    [0, 3, 3, 3],
  ],
  F: [
    [4, 0, 0, 0, 0, 6],
    [0, 3, 3, 3],
  ],
  G: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 3, 2, 3]],
  H: [
    [0, 0, 0, 6],
    [4, 0, 4, 6],
    [0, 3, 4, 3],
  ],
  I: [
    [1, 0, 3, 0],
    [2, 0, 2, 6],
    [1, 6, 3, 6],
  ],
  J: [[4, 0, 4, 5, 3, 6, 1, 6, 0, 5]],
  K: [
    [0, 0, 0, 6],
    [4, 0, 0, 4],
    [1, 3, 4, 6],
  ],
  L: [[0, 0, 0, 6, 4, 6]],
  M: [[0, 6, 0, 0, 2, 3, 4, 0, 4, 6]],
  N: [[0, 6, 0, 0, 4, 6, 4, 0]],
  O: [O],
  P: [[0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3]],
  Q: [O, [2, 4, 4, 6]],
  R: [
    [0, 6, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3],
    [2, 3, 4, 6],
  ],
  S: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 2, 1, 3, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5]],
  T: [
    [0, 0, 4, 0],
    [2, 0, 2, 6],
  ],
  U: [[0, 0, 0, 5, 1, 6, 3, 6, 4, 5, 4, 0]],
  V: [[0, 0, 2, 6, 4, 0]],
  W: [[0, 0, 1, 6, 2, 3, 3, 6, 4, 0]],
  X: [
    [0, 0, 4, 6],
    [4, 0, 0, 6],
  ],
  Y: [
    [0, 0, 2, 3, 4, 0],
    [2, 3, 2, 6],
  ],
  Z: [[0, 0, 4, 0, 0, 6, 4, 6]],
  '0': [O, [4, 1, 0, 5]],
  '1': [
    [1, 1, 2, 0, 2, 6],
    [1, 6, 3, 6],
  ],
  '2': [[0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 0, 6, 4, 6]],
  '3': [
    [0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 4, 4, 4, 5, 3, 6, 1, 6, 0, 5],
    [1, 3, 3, 3],
  ],
  '4': [[3, 6, 3, 0, 0, 4, 4, 4]],
  '5': [[4, 0, 0, 0, 0, 3, 3, 3, 4, 4, 4, 5, 3, 6, 0, 6]],
  '6': [[3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3, 0, 3]],
  '7': [[0, 0, 4, 0, 1, 6]],
  '8': [[1, 3, 0, 2, 0, 1, 1, 0, 3, 0, 4, 1, 4, 2, 3, 3, 1, 3, 0, 4, 0, 5, 1, 6, 3, 6, 4, 5, 4, 4, 3, 3]],
  '9': [[4, 3, 1, 3, 0, 2, 0, 1, 1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6]],
  '+': [
    [2, 1, 2, 5],
    [0, 3, 4, 3],
  ],
  '-': [[0, 3, 4, 3]],
  '!': [
    [2, 0, 2, 4],
    [2, 5.6, 2, 6],
  ],
  '.': [[2, 5.6, 2, 6]],
  "'": [[2, 0, 2, 1.5]],
  '/': [[4, 0, 0, 6]],
};

export interface StrokeTextOpts {
  color: number;
  /** Stroke width in px (default size / 6). */
  width?: number;
  alpha?: number;
  /** Rotation about (cx, cy), radians. */
  angle?: number;
  /** Letter advance in grid units (default 5.6 = 4 + gap). */
  advance?: number;
}

/** Width in px of `text` at cap height `size`. */
export function strokeTextWidth(text: string, size: number, advance = 5.6): number {
  const u = size / 6;
  return Math.max(0, text.length * advance - (advance - 4)) * u;
}

/** Strokes `text` (upper case, digits, a few signs) centred on (cx, cy) with cap height `size`. */
export function strokeText(
  g: Graphics,
  text: string,
  cx: number,
  cy: number,
  size: number,
  o: StrokeTextOpts,
): void {
  const u = size / 6;
  const adv = o.advance ?? 5.6;
  const w = strokeTextWidth(text, size, adv);
  const a = o.angle ?? 0;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const x0 = -w / 2;
  const y0 = -size / 2;
  let any = false;
  for (let i = 0; i < text.length; i++) {
    const polys = FONT[text[i] as string];
    if (!polys) continue;
    for (const p of polys) {
      for (let j = 0; j < p.length; j += 2) {
        const lx = x0 + (i * adv + (p[j] as number)) * u;
        const ly = y0 + (p[j + 1] as number) * u;
        const X = cx + lx * ca - ly * sa;
        const Y = cy + lx * sa + ly * ca;
        if (j === 0) g.moveTo(X, Y);
        else g.lineTo(X, Y);
      }
      // A single-point poly (a dot) still needs a visible stroke.
      any = true;
    }
  }
  if (any)
    g.stroke({
      width: o.width ?? size / 6,
      color: o.color,
      alpha: o.alpha ?? 1,
      cap: 'round',
      join: 'round',
    });
}

/** Rotated rectangle outline/fill helper: returns the 4 corners (for g.poly). */
export function rotRect(cx: number, cy: number, w: number, h: number, a: number): number[] {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const out: number[] = [];
  for (const [x, y] of [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ] as const)
    out.push(cx + x * ca - y * sa, cy + x * sa + y * ca);
  return out;
}

/**
 * An ink stamp: a rotated double-bordered box with a word inside (REPOSSESSED, SOLD, CLEARED).
 * `k` scales it about its centre (the slam overshoot).
 */
export function drawStamp(
  g: Graphics,
  word: string,
  cx: number,
  cy: number,
  size: number,
  angle: number,
  color: number,
  alpha: number,
  k = 1,
): void {
  const s = size * k;
  const w = strokeTextWidth(word, s) + s * 1.1;
  const h = s * 1.9;
  g.poly(rotRect(cx, cy, w, h, angle)).fill({ color: PALETTE.stampPaper, alpha: alpha * 0.35 });
  g.poly(rotRect(cx, cy, w, h, angle)).stroke({ width: Math.max(2, s / 7), color, alpha });
  g.poly(rotRect(cx, cy, w - s * 0.4, h - s * 0.4, angle)).stroke({
    width: Math.max(1, s / 14),
    color,
    alpha: alpha * 0.8,
  });
  strokeText(g, word, cx, cy, s, { color, alpha, angle, width: Math.max(2, s / 5.5) });
}

// --- keycaps (prompt glyphs) ---

export type KeyName = 'left' | 'right' | 'up' | 'down' | Action;

/** The keycap label for an action: its first letter key in the default bindings (Z, X, C, V, B, Q). */
export function keyLetter(key: KeyName): string {
  const codes = (DEFAULT_KEYS as Record<string, string[]>)[key] ?? [];
  for (const c of codes) if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  return '?';
}

const ARROW: Record<string, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

/** A keycap (rounded key with a lip) showing an arrow or the key letter, centred on (cx, cy). */
export function drawKeycap(g: Graphics, key: KeyName, cx: number, cy: number, s: number, alpha = 1): void {
  const r = s * 0.18;
  const lip = s * 0.12;
  g.roundRect(cx - s / 2, cy - s / 2 + lip, s, s, r).fill({ color: PALETTE.keyLip, alpha });
  g.roundRect(cx - s / 2, cy - s / 2, s, s, r).fill({ color: PALETTE.keyFace, alpha });
  g.roundRect(cx - s / 2, cy - s / 2, s, s, r).stroke({ width: 2, color: PALETTE.keyEdge, alpha });
  const a = ARROW[key];
  if (a !== undefined) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pt = (x: number, y: number): [number, number] => [
      cx + (x * ca - y * sa) * s,
      cy + (x * sa + y * ca) * s,
    ];
    const p = [
      pt(0.26, 0),
      pt(-0.02, -0.24),
      pt(-0.02, -0.09),
      pt(-0.26, -0.09),
      pt(-0.26, 0.09),
      pt(-0.02, 0.09),
      pt(-0.02, 0.24),
    ];
    g.poly(p.flat()).fill({ color: PALETTE.keyInk, alpha });
  } else {
    strokeText(g, keyLetter(key), cx, cy, s * 0.5, { color: PALETTE.keyInk, alpha, width: s * 0.11 });
  }
}

/** A "+" between keycaps. */
export function drawPlus(g: Graphics, cx: number, cy: number, s: number, alpha = 1): void {
  g.rect(cx - s / 2, cy - s * 0.1, s, s * 0.2).fill({ color: PALETTE.keyFace, alpha });
  g.rect(cx - s * 0.1, cy - s / 2, s * 0.2, s).fill({ color: PALETTE.keyFace, alpha });
}

// --- icons ---

/**
 * An open hand (the Seize) pointing along `angle` (0 = right), or a closed fist. `open` 0..1
 * spreads the fingers.
 */
export function drawHand(
  g: Graphics,
  cx: number,
  cy: number,
  s: number,
  angle: number,
  color: number,
  alpha: number,
  open: number,
  ink: number = PALETTE.bg,
): void {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const P = (x: number, y: number): [number, number] => [
    cx + (x * ca - y * sa) * s,
    cy + (x * sa + y * ca) * s,
  ];
  // Fingers first (under the palm edge), then the palm.
  const spread = 0.12 + 0.5 * open;
  const len = 0.35 + 0.55 * open;
  for (let i = 0; i < 4; i++) {
    const fa = (i - 1.5) * spread * 0.55;
    const [x0, y0] = P(0.25, (i - 1.5) * 0.18);
    const [x1, y1] = P(0.25 + Math.cos(fa) * len, (i - 1.5) * 0.18 + Math.sin(fa) * len);
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ width: s * 0.27, color: ink, alpha: alpha * 0.8, cap: 'round' });
    g.moveTo(x0, y0)
      .lineTo(x1, y1)
      .stroke({ width: s * 0.18, color, alpha, cap: 'round' });
  }
  // Thumb.
  const [t0x, t0y] = P(0, -0.3);
  const [t1x, t1y] = P(0.2 + 0.3 * open, -0.45 - 0.3 * open);
  g.moveTo(t0x, t0y)
    .lineTo(t1x, t1y)
    .stroke({ width: s * 0.27, color: ink, alpha: alpha * 0.8, cap: 'round' });
  g.moveTo(t0x, t0y)
    .lineTo(t1x, t1y)
    .stroke({ width: s * 0.19, color, alpha, cap: 'round' });
  const [px, py] = P(0.02, 0);
  g.circle(px, py, s * 0.4).fill({ color, alpha });
  g.circle(px, py, s * 0.4).stroke({ width: s * 0.07, color: ink, alpha: alpha * 0.8 });
}

/** A heater shield with a cross bar: "guarded". */
export function drawShield(
  g: Graphics,
  cx: number,
  cy: number,
  s: number,
  color: number,
  alpha: number,
): void {
  const pts = [
    cx - s * 0.5,
    cy - s * 0.55,
    cx + s * 0.5,
    cy - s * 0.55,
    cx + s * 0.5,
    cy - s * 0.05,
    cx,
    cy + s * 0.6,
    cx - s * 0.5,
    cy - s * 0.05,
  ];
  g.poly(pts).fill({ color: PALETTE.bg, alpha: alpha * 0.75 });
  g.poly(pts).stroke({ width: Math.max(2, s * 0.12), color, alpha, join: 'round' });
  g.moveTo(cx - s * 0.28, cy - s * 0.3)
    .lineTo(cx + s * 0.28, cy + s * 0.2)
    .moveTo(cx + s * 0.28, cy - s * 0.3)
    .lineTo(cx - s * 0.28, cy + s * 0.2)
    .stroke({ width: Math.max(2, s * 0.12), color, alpha, cap: 'round' });
}

/** A Poundage coin. */
export function drawCoin(g: Graphics, cx: number, cy: number, r: number, alpha = 1, squeeze = 1): void {
  g.ellipse(cx, cy, r * squeeze, r).fill({ color: PALETTE.coin, alpha });
  g.ellipse(cx, cy, r * squeeze, r).stroke({
    width: Math.max(1.5, r * 0.18),
    color: PALETTE.coinDark,
    alpha,
  });
  if (squeeze > 0.4)
    g.ellipse(cx, cy, r * 0.5 * squeeze, r * 0.5).stroke({
      width: Math.max(1, r * 0.12),
      color: PALETTE.coinDark,
      alpha: alpha * 0.7,
    });
}

/** A small padlock (locked lots: "under the hammer"). */
export function drawPadlock(
  g: Graphics,
  cx: number,
  cy: number,
  s: number,
  color: number,
  alpha: number,
): void {
  g.moveTo(cx - s * 0.28, cy)
    .lineTo(cx - s * 0.28, cy - s * 0.25)
    .arc(cx, cy - s * 0.25, s * 0.28, Math.PI, 0)
    .lineTo(cx + s * 0.28, cy)
    .stroke({ width: Math.max(2, s * 0.13), color, alpha });
  g.roundRect(cx - s * 0.45, cy - s * 0.05, s * 0.9, s * 0.6, s * 0.1).fill({ color, alpha });
  g.circle(cx, cy + s * 0.22, s * 0.09).fill({ color: PALETTE.bg, alpha });
}

/** A red wax seal (a Lien on a Chin pip). */
export function drawWaxSeal(g: Graphics, cx: number, cy: number, r: number, alpha = 1): void {
  const pts: number[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (i % 2 === 0 ? 1 : 0.86);
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.poly(pts).fill({ color: PALETTE.wax, alpha });
  g.circle(cx, cy, r * 0.55).stroke({ width: Math.max(1, r * 0.16), color: PALETTE.waxDark, alpha });
}
