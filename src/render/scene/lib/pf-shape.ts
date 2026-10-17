/**
 * Playfield shape helpers: seeded noise and the organic outlines (blobs, wobbly edges, tapered
 * ribbons) that every painted thing is cut from. Pure maths, no Pixi. All polygons are flat
 * `[x0, y0, x1, y1, ...]` arrays.
 */
import { KEY_LIGHT, prng } from './look';

export type Rng = () => number;

/** Integer hash to 0..1. */
export function hash1(n: number, seed = 0): number {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise, -1..1, period-free. `x` in lattice units. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i, seed);
  const b = hash1(i + 1, seed);
  return (a + (b - a) * u) * 2 - 1;
}

/** Two octaves of noise1: a lazy line with some tooth. -1..1 (roughly). */
export function wobble(x: number, seed: number, scale: number): number {
  return noise1(x / scale, seed) * 0.68 + noise1(x / (scale * 0.37), seed + 17) * 0.32;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function range(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * r();
}

export function pick<T>(r: Rng, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(r() * list.length))] as T;
}

export function rngFor(...parts: number[]): Rng {
  let s = 0x9e3779b9;
  for (const p of parts) s = Math.imul(s ^ Math.round(p * 16), 0x85ebca6b) + 0x27d4eb2f;
  return prng(s >>> 0);
}

/** An irregular closed blob around (cx, cy). `rough` 0..1 = how lumpy. */
export function blob(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  rough = 0.25,
  n = 18,
  rot = 0,
): number[] {
  const out: number[] = [];
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Periodic noise: sample a circle in noise space.
    const k =
      1 +
      rough * (noise1(Math.cos(a) * 1.3 + 7.1, seed) * 0.7 + noise1(Math.sin(a) * 2.9 + 3.3, seed + 5) * 0.5);
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    out.push(cx + x * cs - y * sn, cy + x * sn + y * cs);
  }
  return out;
}

/** One round of Chaikin corner cutting on a closed polygon. */
export function chaikin(pts: number[], rounds = 1): number[] {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const n = p.length / 2;
    const q: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2] as number;
      const ay = p[i * 2 + 1] as number;
      const bx = p[j * 2] as number;
      const by = p[j * 2 + 1] as number;
      q.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    p = q;
  }
  return p;
}

/** Points along a quadratic curve a -> c -> b (c is the control point), `n` segments. */
export function quad(
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  bx: number,
  by: number,
  n: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
  }
  return out;
}

/** Points along a cubic bezier. */
export function cubic(
  ax: number,
  ay: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  bx: number,
  by: number,
  n: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push(a * ax + b * c1x + c * c2x + d * bx, a * ay + b * c1y + c * c2y + d * by);
  }
  return out;
}

/**
 * A tapered ribbon around a centre line: the polygon you get by walking down one side and back up
 * the other. `width(t)` is the full width at t = 0..1 along the line.
 */
export function ribbon(line: number[], width: (t: number) => number): number[] {
  const n = line.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = (line[b * 2] as number) - (line[a * 2] as number);
    let dy = (line[b * 2 + 1] as number) - (line[a * 2 + 1] as number);
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const w = width(n > 1 ? i / (n - 1) : 0) / 2;
    const x = line[i * 2] as number;
    const y = line[i * 2 + 1] as number;
    left.push(x - dy * w, y + dx * w);
    right.push(x + dy * w, y - dx * w);
  }
  const out = left.slice();
  for (let i = n - 1; i >= 0; i--) out.push(right[i * 2] as number, right[i * 2 + 1] as number);
  return out;
}

/** Adds a wandering offset to a polyline (perpendicular wobble), keeping the ends put. */
export function wander(line: number[], amp: number, seed: number, scale = 40): number[] {
  const n = line.length / 2;
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = (line[b * 2] as number) - (line[a * 2] as number);
    const dy = (line[b * 2 + 1] as number) - (line[a * 2 + 1] as number);
    const len = Math.hypot(dx, dy) || 1;
    if (i > 0) {
      run += Math.hypot(
        (line[i * 2] as number) - (line[i * 2 - 2] as number),
        (line[i * 2 + 1] as number) - (line[i * 2 - 1] as number),
      );
    }
    const t = n > 1 ? i / (n - 1) : 0;
    const k = Math.sin(t * Math.PI) ** 0.6 * amp * wobble(run, seed, scale);
    out.push((line[i * 2] as number) - (dy / len) * k, (line[i * 2 + 1] as number) + (dx / len) * k);
  }
  return out;
}

export function bounds(pts: number[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] as number;
    const y = pts[i + 1] as number;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/**
 * How much of the key light lands at a world point, 0..1: a broad beam along the light's path plus
 * dapples. The bake shader has an identical copy (pf-bake.ts, `sun`): change both together.
 */
export function sunAt(x: number, y: number, beamWidth = 760): number {
  const beamX = KEY_LIGHT.entryX + ((y - KEY_LIGHT.entryY) * KEY_LIGHT.dirX) / KEY_LIGHT.dirY;
  const beam = Math.exp(-(((x - beamX) / beamWidth) ** 2));
  const dp =
    0.5 +
    0.25 * Math.sin(x * 0.0131 + 1.7 * Math.sin(y * 0.004)) +
    0.25 * Math.sin(x * 0.0057 - y * 0.0031 + 2.1);
  // Discrete pools of light on a dark floor: most ground gets none.
  const dapple = smoothstep(0.5, 0.72, dp);
  return clamp(beam * 0.28 + dapple * (0.45 + 0.4 * beam), 0, 1);
}

/** Where each third of the scene's mood begins and ends (world x): pool glade | light well | deep stand. */
export const ZONES = { coolEnd: 1650, warmStart: 2150, warmEnd: 3650, deepStart: 4150 } as const;

/**
 * The scene's three moods as weights that sum to 1: `cool` (the moonlit pool glade on the left),
 * `warm` (the golden light well in the middle), `deep` (the old dark stand on the right). The bake
 * shader tints by the same edges (pf-bake.ts, uZone).
 */
export function zoneAt(x: number): { cool: number; warm: number; deep: number } {
  const a = smoothstep(ZONES.coolEnd, ZONES.warmStart, x);
  const b = smoothstep(ZONES.warmEnd, ZONES.deepStart, x);
  return { cool: 1 - a, warm: a * (1 - b), deep: b };
}
