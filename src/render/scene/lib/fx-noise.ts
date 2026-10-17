/**
 * A small tileable noise texture for the air shaders (shafts, mist). Sampling a texture is far
 * cheaper per pixel than hashing noise in GLSL and looks the same on every GPU.
 *   R: broad fbm (4 cells per tile)   G: medium fbm (8 cells)   B: fbm from another seed (6 cells)
 * Repeat-wrapped, bilinear. Built once from a seeded PRNG.
 */
import { BufferImageSource, Texture } from 'pixi.js';
import { prng } from './look';

const SIZE = 256;

function lattice(cells: number, rnd: () => number): Float32Array {
  const a = new Float32Array(cells * cells);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return a;
}

/** Tileable value noise: `cells` lattice cells per tile, smooth interpolation. x, y in 0..1. */
function valueNoise(lat: Float32Array, cells: number, x: number, y: number): number {
  const fx = x * cells;
  const fy = y * cells;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  let tx = fx - x0;
  let ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const xa = ((x0 % cells) + cells) % cells;
  const ya = ((y0 % cells) + cells) % cells;
  const xb = (xa + 1) % cells;
  const yb = (ya + 1) % cells;
  const a = lat[ya * cells + xa] as number;
  const b = lat[ya * cells + xb] as number;
  const c = lat[yb * cells + xa] as number;
  const d = lat[yb * cells + xb] as number;
  return a + (b - a) * tx + (c - a + (a - b - c + d) * tx) * ty;
}

function fbmChannel(out: Uint8Array, channel: number, baseCells: number, seed: number): void {
  const rnd = prng(seed);
  const octaves = [0, 1, 2, 3].map((o) => {
    const cells = baseCells << o;
    return { cells, lat: lattice(cells, rnd), amp: 0.5 ** o };
  });
  const total = octaves.reduce((s, o) => s + o.amp, 0);
  const tmp = new Float32Array(SIZE * SIZE);
  let lo = 1;
  let hi = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let v = 0;
      for (const o of octaves) v += valueNoise(o.lat, o.cells, x / SIZE, y / SIZE) * o.amp;
      v /= total;
      tmp[y * SIZE + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  // Stretch to the full 0..1 range so thresholds in the shaders mean the same for every channel.
  for (let i = 0; i < tmp.length; i++)
    out[i * 4 + channel] = Math.round((((tmp[i] as number) - lo) / (hi - lo)) * 255);
}

let cached: Texture | null = null;

export function noiseTexture(): Texture {
  if (cached) return cached;
  const data = new Uint8Array(SIZE * SIZE * 4).fill(255);
  fbmChannel(data, 0, 4, 0x51ed);
  fbmChannel(data, 1, 8, 0xa11ce);
  fbmChannel(data, 2, 6, 0xbeef);
  cached = new Texture({
    source: new BufferImageSource({
      resource: data,
      width: SIZE,
      height: SIZE,
      format: 'rgba8unorm',
      alphaMode: 'no-premultiply-alpha',
      scaleMode: 'linear',
      addressMode: 'repeat',
    }),
  });
  return cached;
}
