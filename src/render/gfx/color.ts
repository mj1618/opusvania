/**
 * Colour helpers and the render-side RNG. Render code only: trig and floats are fine here, but
 * nothing may read the wall clock or Math.random (clips and screenshot tests must be deterministic).
 */

export type RGB = [number, number, number];

export function hexToRgb(c: number): RGB {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): number {
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (k(r) << 16) | (k(g) << 8) | k(b);
}

/** Linear mix of two hex colours (t = 0 -> a, 1 -> b). */
export function mix(a: number, b: number, t: number): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Scales a hex colour's brightness. */
export function scale(c: number, k: number): number {
  const [r, g, b] = hexToRgb(c);
  return rgbToHex([r * k, g * k, b * k]);
}

/** Moves a colour toward its own luma (t = 1 -> grey). */
export function desaturate(c: number, t: number): number {
  const [r, g, b] = hexToRgb(c);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return rgbToHex([r + (l - r) * t, g + (l - g) * t, b + (l - b) * t]);
}

export function luma(c: number): number {
  const [r, g, b] = hexToRgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** cyrb53-style 32-bit string hash, for seeding per-room generators from the room id. */
export function hashString(s: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

/** mulberry32: the render-side RNG (never the sim's). */
export class RenderRng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    const x = xs[Math.floor(this.next() * xs.length)];
    if (x === undefined) throw new Error('pick from empty list');
    return x;
  }
}

/** Cheap deterministic 1D value noise in [0, 1] (for flicker keyed to the sim frame). */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const v = Math.sin((n + seed * 17.13) * 127.1) * 43758.5453;
    return v - Math.floor(v);
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
