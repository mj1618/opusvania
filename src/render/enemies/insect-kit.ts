// biome-ignore-all lint/style/noNonNullAssertion: typed-array and fixed-table maths; indices are in range by construction
/**
 * Small shared pieces of the r22 insect rigs (ant.ts, dragonfly.ts): a local-to-world frame (flip, pitch about a
 * pivot), a rounded outline, the ground under a point, the hit tone (a warm flash, then the struck dusk), and the
 * litter: wings let go (a carrier's moth wing, a dragonfly's torn wing) that fall like leaves, lie, and fade.
 * Render only; deterministic (no Math.random: a seeded LCG).
 */
import type { Scene } from '../../sim/scene';
import { sat, smoothstep } from '../character/math';
import type { Painter, RGB, Shade } from './paint';

export type V3 = [number, number, number];

export function hexTo(o: V3, h: number): V3 {
  o[0] = ((h >> 16) & 255) / 255;
  o[1] = ((h >> 8) & 255) / 255;
  o[2] = (h & 255) / 255;
  return o;
}

export const shade = (
  rim: number,
  cool: number,
  form: number,
  band: number,
): Shade & { c0: V3; c1: V3; alpha: number } => ({
  c0: [0, 0, 0],
  c1: [0, 0, 0],
  rim,
  cool,
  form,
  band,
  ember: 0,
  alpha: 1,
});

/**
 * Local frame of a creature: x forward (the way it faces), y down, origin wherever the rig puts it. `set` = origin
 * (world), facing (-1 / 1), pitch (rad, + = nose up) about local pivot (pvx, pvy), and a uniform scale.
 */
export class Frame {
  ox = 0;
  oy = 0;
  f = 1;
  c = 1;
  s = 0;
  pvx = 0;
  pvy = 0;
  k = 1;
  set(ox: number, oy: number, f: number, pitch: number, pvx = 0, pvy = 0, k = 1): void {
    this.ox = ox;
    this.oy = oy;
    this.f = f;
    this.c = Math.cos(pitch);
    this.s = Math.sin(pitch);
    this.pvx = pvx;
    this.pvy = pvy;
    this.k = k;
  }
  x(lx: number, ly: number): number {
    const dx = lx - this.pvx;
    const dy = ly - this.pvy;
    return this.ox + this.f * this.k * (this.pvx + dx * this.c + dy * this.s);
  }
  y(lx: number, ly: number): number {
    const dx = lx - this.pvx;
    const dy = ly - this.pvy;
    return this.oy + this.k * (this.pvy - dx * this.s + dy * this.c);
  }
  /** A world-space angle for a local one (for ellipses: rot is applied in screen space). */
  rot(local: number): number {
    const a = local - Math.atan2(this.s, this.c);
    return this.f > 0 ? a : Math.PI - a;
  }
}

/** A closed outline rounded by a Catmull-Rom pass (three points per corner). */
export function rounded(raw: readonly number[]): number[] {
  const n = raw.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + n - 1) % n) * 2;
    const b = i * 2;
    const c = ((i + 1) % n) * 2;
    const d = ((i + 2) % n) * 2;
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let ax = 0; ax < 2; ax++) {
        const p0 = raw[a + ax]!;
        const p1 = raw[b + ax]!;
        const p2 = raw[c + ax]!;
        const p3 = raw[d + ax]!;
        out.push(
          0.5 *
            (2 * p1 +
              (p2 - p0) * t +
              (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
              (3 * p1 - p0 - 3 * p2 + p3) * t3),
        );
      }
    }
  }
  return out;
}

/** The top of the nearest solid or one-way under (x, y) within `reach` px (y if none). */
export function groundBelow(scene: Scene, x: number, y: number, reach = 600): number {
  let best = y + reach;
  let found = false;
  for (const s of scene.solids) {
    if (x < s.x || x > s.x + s.w || s.y < y - 2 || s.y > best) continue;
    best = s.y;
    found = true;
  }
  for (const o of scene.oneWays) {
    if (x < o.x || x > o.x + o.w || o.y < y - 2 || o.y > best) continue;
    best = o.y;
    found = true;
  }
  return found ? best : y;
}

/**
 * The hit tone, from frames since the hit (`age`) and the hold left: 1-2 frames of a warm near-white flash (on the
 * creature only), then `dark` of the way to the struck dusk through the rest of the hold, easing back after.
 * Writes `toneOut.flash` and `toneOut.dark` (0..1).
 */
export const toneOut = { flash: 0, dark: 0 };
export function hitTone(age: number, hitstop: number, flashFrames: number, dark: number): void {
  if (age > 40) {
    toneOut.flash = 0;
    toneOut.dark = 0;
    return;
  }
  toneOut.flash = 1 - smoothstep(flashFrames - 0.5, flashFrames + 1.2, age);
  const hold = hitstop > 0 ? age + hitstop : flashFrames + 3;
  toneOut.dark =
    dark * smoothstep(flashFrames - 0.3, flashFrames + 1, age) * (1 - smoothstep(hold, hold + 4, age));
}

/** Mixes `o` toward the flash colour and the struck dusk by the current `toneOut`. */
export function applyTone(o: V3, flash: V3, dusk: V3): void {
  for (let k = 0; k < 3; k++) {
    const d = o[k]! + (dusk[k]! - o[k]!) * toneOut.dark;
    o[k] = d + (flash[k]! - d) * toneOut.flash;
  }
}

/** One loose wing on its way down (or lying). */
interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  t: number;
  life: number;
  len: number;
  floor: number;
  down: boolean;
  /** Which outline (0 = a moth's wing, 1 = a dragonfly's), its tint. */
  kind: number;
  seed: number;
}

/** Wings let go: they fall rocking like a leaf, settle where the ground is, lie, and fade. Back painter. */
export class Litter {
  private readonly list: Piece[] = [];
  private rnd = 0x2d1b9;
  rand(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }
  clear(): void {
    this.list.length = 0;
  }
  get count(): number {
    return this.list.length;
  }
  add(
    x: number,
    y: number,
    vx: number,
    vy: number,
    a: number,
    len: number,
    floor: number,
    kind: number,
    life: number,
  ): void {
    if (this.list.length > 24) this.list.shift();
    this.list.push({
      x,
      y,
      vx,
      vy,
      a,
      va: (this.rand() - 0.5) * 6,
      t: 0,
      life,
      len,
      floor,
      down: false,
      kind,
      seed: this.rand() * 6.28,
    });
  }
  /** Steps and draws them all. `draw(p, piece, fade, flat)` paints one in world space. */
  update(
    dt: number,
    draw: (x: number, y: number, a: number, len: number, kind: number, fade: number, flat: number) => void,
  ): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i]!;
      w.t += dt;
      if (w.t > w.life) {
        this.list.splice(i, 1);
        continue;
      }
      let flat = 1;
      if (!w.down) {
        // A leaf's fall: braked hard, then a slow rocking sink.
        w.vx *= 1 - Math.min(1, 2.4 * dt);
        w.vy = Math.min(70, w.vy + 260 * dt);
        const sw = Math.sin(w.t * 5.2 + w.seed);
        w.x += (w.vx + sw * 34 * sat(w.t * 3)) * dt;
        w.y += w.vy * dt;
        w.a += (w.va + Math.cos(w.t * 5.2 + w.seed) * 2.6) * dt;
        flat = 0.4 + 0.6 * Math.abs(Math.cos(w.t * 5.2 + w.seed));
        if (w.y >= w.floor - 1) {
          w.y = w.floor - 1;
          w.down = true;
          // (It settles flat on the ground: nearly level.)
          w.a = Math.round(w.a / Math.PI) * Math.PI + (this.rand() - 0.5) * 0.3;
        }
      } else flat = 0.5;
      const fade = sat(w.t / 0.06) * (1 - smoothstep(w.life - 0.7, w.life, w.t));
      draw(w.x, w.y, w.a, w.len, w.kind, fade, flat);
    }
  }
}

/** Paints a closed outline given in (u, v) wing space onto px/py: root (rx, ry), span vector (ux, uy), chord (vx, vy). */
export function wingPath(
  p: Painter,
  outline: readonly number[],
  rx: number,
  ry: number,
  ux: number,
  uy: number,
  vx: number,
  vy: number,
): number {
  const n = outline.length / 2;
  for (let k = 0; k < n; k++) {
    const u = outline[k * 2]!;
    const v = outline[k * 2 + 1]!;
    p.px[k] = rx + ux * u + vx * v;
    p.py[k] = ry + uy * u + vy * v;
  }
  return n;
}

export const asRGB = (v: V3): RGB => v as unknown as RGB;
