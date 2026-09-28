import type { Graphics } from 'pixi.js';
import type { Colour } from '../sim/events';
import { colourHex, PALETTE, SIG, VIBRATION } from './palette';

/**
 * The outline renderer (L3 brief §1.1, §5): one draw function per sound-source status, used by
 * humming walls, furnaces, levied objects and enemies alike. Pixi Graphics for now; a GLSL "hum"
 * filter can replace these behind the same functions later.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Vibration offset for a colour at a sim frame (render-side; brief §5). */
export function vibration(colour: Colour, frame: number): { dx: number; dy: number } {
  const v = VIBRATION[colour];
  if (!v || v.amp === 0) return { dx: 0, dy: 0 };
  const ph = (2 * Math.PI * v.hz * frame) / 60;
  return { dx: v.amp * Math.sin(ph), dy: v.amp * 0.6 * Math.sin(ph * 1.5 + 1.7) };
}

/** Adds dashes along a polyline (as sub-paths) to the current path; the caller strokes. */
export function dashPath(
  g: Graphics,
  pts: readonly number[],
  closed: boolean,
  on: number = SIG.dashOn,
  off: number = SIG.dashOff,
  phase = 0,
): void {
  const n = pts.length / 2;
  const segs = closed ? n : n - 1;
  let t = ((phase % (on + off)) + on + off) % (on + off);
  for (let i = 0; i < segs; i++) {
    const x0 = pts[2 * i] as number;
    const y0 = pts[2 * i + 1] as number;
    const j = (i + 1) % n;
    const x1 = pts[2 * j] as number;
    const y1 = pts[2 * j + 1] as number;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    let d = 0;
    while (d < len) {
      const inOn = t < on;
      const step = Math.min(len - d, inOn ? on - t : on + off - t);
      if (inOn) g.moveTo(x0 + ux * d, y0 + uy * d).lineTo(x0 + ux * (d + step), y0 + uy * (d + step));
      d += step;
      t = (t + step) % (on + off);
    }
  }
}

export function dashedRect(
  g: Graphics,
  r: Rect,
  width: number,
  color: number,
  alpha: number,
  inset = width / 2,
): void {
  const x0 = r.x + inset;
  const y0 = r.y + inset;
  const x1 = r.x + r.w - inset;
  const y1 = r.y + r.h - inset;
  dashPath(g, [x0, y0, x1, y0, x1, y1, x0, y1], true);
  g.stroke({ width, color, alpha, cap: 'butt' });
}

/**
 * Hum waves inside a humming source: each colour has its own wave shape (brown: slow square
 * wave, pink: tight zigzag, violet: chevrons), so colour is never the only cue.
 */
export function humWaves(
  g: Graphics,
  r: Rect,
  colour: Colour,
  frame: number,
  alpha: number = SIG.waveAlpha,
): void {
  const v = VIBRATION[colour];
  if (!v || v.amp === 0) return;
  const pad = 10;
  const x0 = r.x + pad;
  const x1 = r.x + r.w - pad;
  if (x1 - x0 < 8 || r.h < 2 * pad) return;
  const A = SIG.waveAmp;
  const lambda = colour === 'brown' ? 32 : colour === 'pink' ? 16 : 20;
  const shift = ((frame * v.hz) / 60) * lambda;
  for (let y = r.y + pad + SIG.waveSpacing / 2; y < r.y + r.h - pad; y += SIG.waveSpacing) {
    const pts: number[] = [];
    for (let x = x0; x <= x1; x += 4) {
      const u = (((x - x0 + shift) % lambda) + lambda) % lambda;
      let off: number;
      if (colour === 'brown') off = u < lambda / 2 ? -A : A;
      else if (colour === 'pink') off = (Math.abs(u / lambda - 0.5) * 4 - 1) * A;
      else off = (u < lambda / 2 ? u / (lambda / 2) : 2 - u / (lambda / 2)) * A * 1.4 - A;
      pts.push(x, y + off);
    }
    g.poly(pts, false).stroke({ width: SIG.waveWidth, color: colourHex(colour), alpha, join: 'miter' });
  }
}

/** Humming (armed): fill α0.35, vibrating 4 px outline, hum waves. */
export function drawHumming(g: Graphics, r: Rect, colour: Colour, frame: number, flash = false): void {
  const c = colourHex(colour);
  g.rect(r.x, r.y, r.w, r.h).fill({ color: flash ? PALETTE.flash : c, alpha: SIG.hummingFillAlpha });
  humWaves(g, r, colour, frame);
  const { dx, dy } = vibration(colour, frame);
  const w = SIG.hummingOutline;
  // A faint echo on the opposite side of the swing: the "vibrating" read survives a still frame.
  g.rect(r.x - dx + w / 2, r.y - dy + w / 2, r.w - w, r.h - w).stroke({ width: 2, color: c, alpha: 0.35 });
  g.rect(r.x + dx + w / 2, r.y + dy + w / 2, r.w - w, r.h - w).stroke({
    width: w,
    color: flash ? PALETTE.flash : c,
    alpha: 1,
  });
}

/** Ghost (seized): fill α <= 0.10, 2 px dashed outline at α0.55, no vibration. */
export function drawGhost(g: Graphics, r: Rect, colour: Colour): void {
  const c = colourHex(colour);
  g.rect(r.x, r.y, r.w, r.h).fill({ color: c, alpha: SIG.ghostFillAlpha });
  dashedRect(g, r, SIG.ghostOutline, c, SIG.ghostOutlineAlpha);
}

/** pendingSolid: a ghost whose dashed outline blinks at 4 Hz (it re-solidifies when clear). */
export function drawPending(g: Graphics, r: Rect, colour: Colour, frame: number): void {
  const c = colourHex(colour);
  g.rect(r.x, r.y, r.w, r.h).fill({ color: c, alpha: SIG.ghostFillAlpha });
  const period = 60 / SIG.pendingHz;
  if (frame % period < period / 2) dashedRect(g, r, 3, c, 0.95);
  else dashedRect(g, r, SIG.ghostOutline, c, 0.3);
}

/** A tiny render-side RNG (mulberry32), seeded per (frame, id): deterministic, never the sim RNG. */
export function rngFor(frame: number, id: number): () => number {
  let a = (Math.imul(frame, 0x9e3779b1) ^ Math.imul(id + 1, 0x85ebca6b) ^ 0x5bd1e995) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** White static: grey fill with per-frame speckle and a jittery 1 px outline. Flashes white on refusal. */
export function drawStatic(g: Graphics, r: Rect, frame: number, id: number, flash: boolean): void {
  const rnd = rngFor(frame, id);
  const c = PALETTE.white;
  g.rect(r.x, r.y, r.w, r.h).fill({ color: flash ? PALETTE.flash : c, alpha: flash ? 0.95 : 0.28 });
  const n = Math.round(((r.w * r.h) / 1000) * SIG.speckleDensity);
  const s = SIG.speckleSize;
  for (let i = 0; i < n; i++) {
    const x = r.x + rnd() * (r.w - s);
    const y = r.y + rnd() * (r.h - s);
    g.rect(Math.round(x), Math.round(y), s, s).fill({
      color: rnd() < 0.5 ? 0xffffff : 0x8a90a0,
      alpha: 0.5 + rnd() * 0.5,
    });
  }
  const jx = Math.round(rnd() * 2 - 1);
  const jy = Math.round(rnd() * 2 - 1);
  g.rect(r.x + jx + 0.5, r.y + jy + 0.5, r.w - 1, r.h - 1).stroke({ width: 1, color: c, alpha: 0.9 });
}
