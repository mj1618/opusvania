/**
 * World map renderer (`npm run world:render`): draws a region (every room at its world position)
 * to one PNG so agents and the human can judge geography at a glance: collision, entities, room
 * bounds and ids, the 30 x 17 screen grid in world tiles, door links, edge openings (green =
 * meets an opening next door, red = meets solid or nothing) and air sealed off from the spawn.
 * Minimal PNG encoder on node:zlib and a built-in 5 x 7 font: no dependencies.
 */
import { deflateSync } from 'node:zlib';
import type { RoomFile } from '../../src/sim/world/room-schema';
import { flood, type Opening, openings } from './lint';
import type { LevelModel } from './model';

// ---------------------------------------------------------------------------------------------
// PNG.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = (CRC[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Canvas + font.

const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  '-': [0, 0, 0, 31, 0, 0, 0],
  _: [0, 0, 0, 0, 0, 0, 31],
  ':': [0, 12, 12, 0, 12, 12, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8],
  '/': [0, 1, 2, 4, 8, 16, 0],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '>': [8, 4, 2, 1, 2, 4, 8],
  '<': [2, 4, 8, 16, 8, 4, 2],
  '=': [0, 0, 31, 0, 31, 0, 0],
  '?': [14, 17, 1, 2, 4, 0, 4],
  '!': [4, 4, 4, 4, 4, 0, 4],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '#': [10, 10, 31, 10, 31, 10, 10],
  '[': [14, 8, 8, 8, 8, 8, 14],
  ']': [14, 2, 2, 2, 2, 2, 14],
  '*': [0, 4, 21, 14, 21, 4, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

type RGB = readonly [number, number, number];
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

export class Canvas {
  readonly px: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
    bg: RGB,
  ) {
    this.px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) this.px.set([bg[0], bg[1], bg[2], 255], i * 4);
  }
  dot(x: number, y: number, c: RGB, a = 1): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const p = this.px;
    p[i] = Math.round((p[i] as number) * (1 - a) + c[0] * a);
    p[i + 1] = Math.round((p[i + 1] as number) * (1 - a) + c[1] * a);
    p[i + 2] = Math.round((p[i + 2] as number) * (1 - a) + c[2] * a);
  }
  fill(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) this.dot(xx, yy, c, a);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, t = 1, a = 1): void {
    this.fill(x, y, w, t, c, a);
    this.fill(x, y + h - t, w, t, c, a);
    this.fill(x, y + t, t, h - 2 * t, c, a);
    this.fill(x + w - t, y + t, t, h - 2 * t, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1, dash = 0): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let n = 0;
    for (;;) {
      if (!dash || Math.floor(n / dash) % 2 === 0) this.fill(x0 - (t >> 1), y0 - (t >> 1), t, t, c);
      n++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  textWidth(s: string, k: number): number {
    return s.length * 6 * k - k;
  }
  text(x: number, y: number, s: string, c: RGB, k = 1, plate?: RGB): void {
    if (plate) this.fill(x - k, y - k, this.textWidth(s, k) + 2 * k, 9 * k, plate, 0.8);
    [...s.toUpperCase()].forEach((ch, i) => {
      const g = FONT[ch] ?? FONT['?'] ?? [];
      g.forEach((row, ry) => {
        for (let bx = 0; bx < 5; bx++)
          if (row & (16 >> bx)) this.fill(x + (i * 6 + bx) * k, y + ry * k, k, k, c);
      });
    });
  }
}

// ---------------------------------------------------------------------------------------------
// World map.

const C = {
  bg: hex(0x141118),
  grid: hex(0x2c2634),
  gridText: hex(0x6a6078),
  air: hex(0xdfe4ec),
  sealed: hex(0xf0b070),
  solid: hex(0x4a3f52),
  oneWay: hex(0xc8a060),
  spike: hex(0xe03838),
  orb: hex(0x40d8e8),
  border: hex(0xf6f2ff),
  label: hex(0xffffff),
  plate: hex(0x16121c),
  open: hex(0x30e070),
  bad: hex(0xff3030),
  door: hex(0x1aa8e0),
  link: hex(0x40d0ff),
  spawn: hex(0x18b048),
  goal: hex(0xe8b800),
  enemy: hex(0xd01818),
  pickup: hex(0xe040e0),
  rest: hex(0x8a8a8a),
  camera: hex(0x3060ff),
  lock: hex(0xff7010),
  landmark: hex(0xc89600),
  gate: hex(0x5050e0),
} as const;
const COLOUR: Record<string, RGB> = {
  brown: hex(0xc07418),
  pink: hex(0xff5aa8),
  violet: hex(0x8a6cff),
  white: hex(0xb8c4dc),
};

export interface RenderOptions {
  /** Pixels per tile (default: fits the long side in ~2400 px, 2..16). */
  scale?: number;
  title?: string;
}

/** Renders rooms at world positions. `rooms` = compiled RoomFiles by id (for chars and reachability). */
export function renderWorld(
  models: LevelModel[],
  rooms: Map<string, RoomFile>,
  opts: RenderOptions = {},
): { png: Buffer; w: number; h: number; scale: number } {
  if (models.length === 0) throw new Error('nothing to render');
  const x0 = Math.min(...models.map((m) => m.at[0]));
  const y0 = Math.min(...models.map((m) => m.at[1]));
  const x1 = Math.max(...models.map((m) => m.at[0] + m.size[0]));
  const y1 = Math.max(...models.map((m) => m.at[1] + m.size[1]));
  const s = opts.scale ?? Math.max(2, Math.min(16, Math.floor(2400 / Math.max(x1 - x0, y1 - y0))));
  const k = s >= 6 ? 2 : 1;
  const margin = 12 * k + 6;
  const legendH = 12 * k + 8;
  const W = (x1 - x0) * s + 2 * margin;
  const H = (y1 - y0) * s + 2 * margin + legendH;
  const cv = new Canvas(W, H, C.bg);
  const X = (tx: number) => margin + (tx - x0) * s;
  const Y = (ty: number) => margin + (ty - y0) * s;

  // Screen grid (30 x 17 tiles from the world origin) with world-tile coordinates.
  for (let gx = Math.ceil(x0 / 30) * 30; gx <= x1; gx += 30) {
    cv.line(X(gx), margin - 4, X(gx), H - margin - legendH, C.grid);
    cv.text(X(gx) + 2, 2, String(gx), C.gridText, k);
  }
  for (let gy = Math.ceil(y0 / 17) * 17; gy <= y1; gy += 17) {
    cv.line(margin - 4, Y(gy), W - margin, Y(gy), C.grid);
    cv.text(2, Y(gy) + 2, String(gy), C.gridText, k);
  }

  const doorPos = new Map<string, [number, number]>();
  for (const m of models) {
    const [w, h] = m.size;
    const room = rooms.get(m.id);
    const reach = room ? flood(room) : undefined;
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        const v = m.collision[ty * w + tx] as number;
        const px = X(m.at[0] + tx);
        const py = Y(m.at[1] + ty);
        if (v === 1) {
          cv.fill(px, py, s, s, C.solid);
          continue;
        }
        const sealed = reach && !reach.seen[ty * w + tx];
        cv.fill(px, py, s, s, sealed ? C.sealed : C.air);
        if (v === 2) cv.fill(px, py, s, Math.max(1, s >> 2), C.oneWay);
        else if (v >= 3 && v <= 6) {
          const t = Math.max(1, s >> 1);
          if (v === 3) cv.fill(px, py + s - t, s, t, C.spike);
          else if (v === 4) cv.fill(px, py, s, t, C.spike);
          else if (v === 5) cv.fill(px + s - t, py, t, s, C.spike);
          else cv.fill(px, py, t, s, C.spike);
        } else if (v === 7)
          cv.fill(px + (s >> 2), py + (s >> 2), Math.max(1, s >> 1), Math.max(1, s >> 1), C.orb);
      }
    for (const e of m.entities) {
      const [ex, ey, ew, eh] = e.rect;
      const px = X(m.at[0] + ex);
      const py = Y(m.at[1] + ey);
      const pw = ew * s;
      const ph = eh * s;
      const p = e.props;
      switch (e.kind) {
        case 'spawn':
          cv.fill(px, py, s, s, C.spawn);
          if (k > 1 || s >= 8) cv.text(px + 1, py - 9 * k, 'P', C.spawn, k);
          break;
        case 'respawn':
          cv.rect(px, py, s, s, C.spawn, Math.max(1, s >> 3));
          break;
        case 'goal':
          cv.fill(px, py, s, s, C.goal, p.optional ? 0.5 : 1);
          break;
        case 'corner':
          cv.fill(px, py, s, s, C.lock);
          break;
        case 'door':
          cv.fill(px - s, py, 3 * s, s, C.door, 0.35);
          cv.fill(px, py, s, s, C.door);
          doorPos.set(`${m.id}/${p.name}`, [px + (s >> 1), py + (s >> 1)]);
          cv.text(px, py - 9 * k, `${p.name}>${p.to}`, C.link, k, C.plate);
          break;
        case 'source':
          cv.fill(px, py, pw, ph, COLOUR[String(p.colour)] ?? C.label, 0.85);
          break;
        case 'plate':
          cv.fill(px, py, pw, ph, C.rest);
          break;
        case 'gate':
          for (let i = 0; i < pw + ph; i += Math.max(2, s >> 1))
            cv.line(
              px + Math.min(i, pw - 1),
              py + Math.max(0, i - pw + 1),
              px + Math.max(0, i - ph + 1),
              py + Math.min(i, ph - 1),
              C.gate,
            );
          cv.rect(px, py, pw, ph, C.gate);
          break;
        case 'enemy':
          cv.fill(px + (s >> 3), py + (s >> 3), s - (s >> 2), s - (s >> 2), C.enemy);
          break;
        case 'pickup':
          cv.fill(px, py, s, s, C.pickup);
          break;
        case 'rest':
          cv.fill(px, py, s, s, C.label);
          cv.rect(px, py, s, s, C.rest);
          break;
        case 'prompt':
          cv.rect(px, py, s, s, C.rest);
          break;
        case 'camera':
          cv.rect(px, py, pw, ph, C.camera, Math.max(1, s >> 3));
          cv.text(px + 2, py + 2, String(p.mode), C.camera, k);
          break;
        case 'lock':
          cv.rect(px, py, pw, ph, C.lock, Math.max(1, s >> 3));
          cv.text(px + 2, py + ph + 2, `LOCK ${p.name}`, C.lock, k, C.plate);
          break;
        case 'landmark':
          cv.rect(px, py, pw, ph, C.landmark, Math.max(2, s >> 2));
          cv.text(px + 2, py + 2, `* ${p.name}`, C.landmark, k, C.plate);
          break;
      }
    }
  }
  // Door links between rooms on this map.
  for (const m of models)
    for (const e of m.entities) {
      if (e.kind !== 'door') continue;
      const a = doorPos.get(`${m.id}/${e.props.name}`);
      const target = e.props.toDoor ? `${e.props.to}/${e.props.toDoor}` : undefined;
      const b = target ? doorPos.get(target) : undefined;
      if (a && b) cv.line(a[0], a[1], b[0], b[1], C.link, Math.max(1, k), 6 * k);
    }
  // Room bounds and labels.
  for (const m of models) {
    const [w, h] = m.size;
    cv.rect(X(m.at[0]), Y(m.at[1]), w * s, h * s, C.border, Math.max(1, k));
    const scr = `${(w / 30).toFixed(1)}X${(h / 17).toFixed(1)} SCR`;
    const draft = rooms.get(m.id) && m.fields.draft ? ' DRAFT' : '';
    cv.text(X(m.at[0]) + 3 * k, Y(m.at[1]) + 3 * k, `${m.id}${draft}`, C.label, k, C.plate);
    cv.text(
      X(m.at[0]) + 3 * k,
      Y(m.at[1]) + 13 * k,
      `${w}X${h} T (${scr}) @${m.at[0]},${m.at[1]}`,
      C.gridText,
      k,
      C.plate,
    );
  }
  // Edge openings.
  const t = Math.max(3, s >> 1);
  for (const o of openings(models) as Opening[]) {
    const m = models.find((x) => x.id === o.room) as LevelModel;
    const c = o.matched ? C.open : C.bad;
    const n = o.to - o.from + 1;
    if (o.side === 'n') cv.fill(X(m.at[0] + o.from), Y(m.at[1]) - (t >> 1), n * s, t, c);
    else if (o.side === 's') cv.fill(X(m.at[0] + o.from), Y(m.at[1] + m.size[1]) - (t >> 1), n * s, t, c);
    else if (o.side === 'w') cv.fill(X(m.at[0]) - (t >> 1), Y(m.at[1] + o.from), t, n * s, c);
    else cv.fill(X(m.at[0] + m.size[0]) - (t >> 1), Y(m.at[1] + o.from), t, n * s, c);
  }
  // Legend.
  const ly = H - legendH + 2;
  let lx = margin;
  const key = (c: RGB, label: string) => {
    cv.fill(lx, ly, 7 * k, 7 * k, c);
    cv.text(lx + 9 * k, ly, label, C.gridText, k);
    lx += 9 * k + cv.textWidth(label, k) + 10 * k;
  };
  if (opts.title) {
    cv.text(lx, ly, opts.title, C.label, k);
    lx += cv.textWidth(opts.title, k) + 16 * k;
  }
  key(C.spawn, 'spawn');
  key(C.door, 'door');
  key(C.goal, 'goal');
  key(C.enemy, 'enemy');
  key(C.pickup, 'pickup');
  key(C.open, 'edge open');
  key(C.bad, 'edge blocked');
  key(C.sealed, 'sealed air');
  key(C.grid, 'screen 30x17');
  return { png: encodePng(W, H, cv.px), w: W, h: H, scale: s };
}
