/**
 * A tiny RGBA raster with a PNG encoder (node:zlib), enough for greybox heatmaps: filled rects,
 * lines, discs, crosses, alpha blending. No dependency (memory/toolchain.md).
 */
import { deflateSync } from 'node:zlib';

export type RGBA = [number, number, number, number];

export class Raster {
  readonly data: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
    bg: RGBA = [0, 0, 0, 255],
  ) {
    this.data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) this.data.set(bg, i * 4);
  }

  /** Blends one pixel (alpha 0-255 in the colour). */
  plot(x: number, y: number, c: RGBA): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 4;
    const a = c[3] / 255;
    const d = this.data;
    d[i] = Math.round((d[i] ?? 0) * (1 - a) + c[0] * a);
    d[i + 1] = Math.round((d[i + 1] ?? 0) * (1 - a) + c[1] * a);
    d[i + 2] = Math.round((d[i + 2] ?? 0) * (1 - a) + c[2] * a);
    d[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.plot(xx, yy, c);
  }

  /** Outline of a rect, `t` px thick. */
  frame(x: number, y: number, w: number, h: number, c: RGBA, t = 1): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }

  /** A line `t` px thick (stamped discs along it). */
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA, t = 1): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      if (t <= 1) this.plot(x, y, c);
      else this.disc(x, y, t / 2, c, false);
    }
  }

  /** A filled disc; `blend` false overwrites instead of stacking alpha (for thick lines). */
  disc(cx: number, cy: number, r: number, c: RGBA, blend = true): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        if (blend) this.plot(x, y, c);
        else this.plot(x, y, [c[0], c[1], c[2], 255]);
      }
  }

  ring(cx: number, cy: number, r: number, c: RGBA, t = 2): void {
    for (let y = Math.floor(cy - r - t); y <= Math.ceil(cy + r + t); y++)
      for (let x = Math.floor(cx - r - t); x <= Math.ceil(cx + r + t); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= r - t / 2 && d <= r + t / 2) this.plot(x, y, c);
      }
  }

  cross(cx: number, cy: number, r: number, c: RGBA, t = 3): void {
    this.line(cx - r, cy - r, cx + r, cy + r, c, t);
    this.line(cx - r, cy + r, cx + r, cy - r, c, t);
  }

  png(): Buffer {
    return encodePng(this.w, this.h, this.data);
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(body)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** RGBA8 pixels (row-major) to a PNG file. */
export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
