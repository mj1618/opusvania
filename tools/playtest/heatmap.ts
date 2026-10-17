/**
 * A room's greybox with a run drawn over it (Node, png.ts): where she spent time (heat), the path
 * (cyan early -> magenta late, a tick and its second every 5 s), deaths, fall catches, hits taken,
 * stretches lost, lights seen / lit. The legend is in report.md (no text on the picture besides the ticks).
 */
import type { Scene } from '../../src/sim/scene';
import { exitRect, sceneLights } from './observe';
import { Raster, type RGBA } from './png';
import type { RunTrace } from './recorder';

export const COLORS = {
  bg: [18, 20, 24, 255] as RGBA,
  solid: [104, 106, 114, 255] as RGBA,
  solidEdge: [150, 152, 160, 255] as RGBA,
  oneWay: [170, 170, 140, 255] as RGBA,
  catch: [120, 30, 30, 70] as RGBA,
  exit: [40, 170, 80, 90] as RGBA,
  spawn: [255, 255, 255, 255] as RGBA,
  death: [255, 50, 50, 255] as RGBA,
  catchMark: [255, 150, 40, 255] as RGBA,
  hurt: [255, 230, 60, 255] as RGBA,
  lost: [255, 220, 0, 200] as RGBA,
  lightSeen: [120, 190, 255, 255] as RGBA,
  lightLit: [255, 200, 80, 255] as RGBA,
  lightSnuffed: [190, 90, 255, 255] as RGBA,
  lightUnseen: [90, 90, 110, 255] as RGBA,
  tick: [235, 235, 235, 255] as RGBA,
};

/** 3x5 digits for the time ticks. */
const DIGITS: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001010010010',
  '8': '111101111101111',
  '9': '111101111001111',
};

function text(r: Raster, x: number, y: number, s: string, c: RGBA, px = 2): void {
  let cx = x;
  for (const ch of s) {
    const g = DIGITS[ch];
    if (g)
      for (let i = 0; i < 15; i++)
        if (g[i] === '1') r.rect(cx + (i % 3) * px, y + Math.floor(i / 3) * px, px, px, c);
    cx += 4 * px;
  }
}

function ramp(t: number): [number, number, number] {
  // Heat: dark blue -> red -> yellow -> white.
  const stops: Array<[number, number, number]> = [
    [30, 40, 140],
    [200, 40, 60],
    [255, 190, 40],
    [255, 255, 220],
  ];
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const k = u - i;
  const a = stops[i] ?? [0, 0, 0];
  const b = stops[i + 1] ?? [0, 0, 0];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** The scale a room is drawn at: at most `maxW` px wide (and never above 1:1). */
export function scaleFor(scene: Scene, maxW = 1600): number {
  return Math.min(1, maxW / scene.width);
}

/** Draws one room and the part of the run spent in it. */
export function drawRoom(scene: Scene, run: RunTrace, maxW = 1600): Buffer {
  const s = scaleFor(scene, maxW);
  const W = Math.ceil(scene.width * s);
  const H = Math.ceil(scene.height * s);
  const r = new Raster(W, H, COLORS.bg);
  const room = scene.id;

  for (const c of scene.catches ?? []) r.rect(c.x * s, c.y * s, c.w * s, c.h * s, COLORS.catch);
  for (const e of scene.exits ?? []) {
    const q = exitRect(scene, e, 160);
    r.rect(q.x * s, q.y * s, q.w * s, q.h * s, COLORS.exit);
  }

  // Heat: dwell per 8 px picture cell (each trace point stands for the frames until the next).
  const cell = 8;
  const gw = Math.ceil(W / cell);
  const gh = Math.ceil(H / cell);
  const heat = new Float32Array(gw * gh);
  const pts = run.path.filter((p) => p.room === room);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    const next = pts[i + 1];
    const dt = next ? Math.min(30, next.f - p.f) : 1;
    const gx = Math.floor((p.x * s) / cell);
    const gy = Math.floor(((p.y - 48) * s) / cell);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = gx + dx;
        const y = gy + dy;
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        heat[y * gw + x] = (heat[y * gw + x] ?? 0) + dt * (dx === 0 && dy === 0 ? 1 : 0.5);
      }
  }
  let max = 0;
  for (const v of heat) max = Math.max(max, v);
  if (max > 0)
    for (let y = 0; y < gh; y++)
      for (let x = 0; x < gw; x++) {
        const v = heat[y * gw + x] ?? 0;
        if (v <= 0) continue;
        const t = Math.sqrt(v / max);
        const [cr, cg, cb] = ramp(t);
        r.rect(x * cell, y * cell, cell, cell, [cr, cg, cb, 70 + 140 * t]);
      }

  for (const q of scene.solids) {
    r.rect(q.x * s, q.y * s, Math.max(1, q.w * s), Math.max(1, q.h * s), COLORS.solid);
    r.rect(q.x * s, q.y * s, Math.max(1, q.w * s), Math.max(1, 2), COLORS.solidEdge);
  }
  for (const o of scene.oneWays) r.rect(o.x * s, o.y * s, o.w * s, 2, COLORS.oneWay);

  // Lost stretches: the box she wandered in.
  for (const l of run.lost.filter((q) => q.room === room)) {
    const pad = 24;
    r.frame(
      (l.x0 - pad) * s,
      (l.y0 - 96 - pad) * s,
      (l.x1 - l.x0 + 2 * pad) * s,
      (l.y1 - l.y0 + 96 + 2 * pad) * s,
      COLORS.lost,
      2,
    );
  }

  // The path: cyan -> magenta over the run; broken where she was placed (a jump of > 400 px).
  const f0 = run.path[0]?.f ?? 0;
  const f1 = Math.max(f0 + 1, run.frames);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a || !b) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 400) continue;
    const k = (b.f - f0) / (f1 - f0);
    const c: RGBA = [Math.round(40 + 215 * k), Math.round(230 - 180 * k), 255, 230];
    r.line(a.x * s, (a.y - 48) * s, b.x * s, (b.y - 48) * s, c, 2);
  }
  // Ticks every 5 s.
  let nextTick = 300;
  for (const p of pts) {
    if (p.f < nextTick) continue;
    const x = p.x * s;
    const y = (p.y - 48) * s;
    r.disc(x, y, 3, COLORS.tick);
    text(r, x + 4, y - 14, String(Math.round(p.f / 60)), COLORS.tick);
    while (nextTick <= p.f) nextTick += 300;
  }

  r.disc(scene.spawn.x * s, (scene.spawn.y - 48) * s, 5, COLORS.spawn);
  for (const l of sceneLights(scene)) {
    const rec = run.lights[`${room}/${l.id}`];
    const x = l.x * s;
    const y = (l.y - 48) * s;
    if (rec?.snuffed !== null && rec?.snuffed !== undefined) r.disc(x, y, 6, COLORS.lightSnuffed);
    else if (rec?.lit !== null && rec?.lit !== undefined) r.disc(x, y, 6, COLORS.lightLit);
    else
      r.ring(
        x,
        y,
        6,
        rec?.seen !== null && rec?.seen !== undefined ? COLORS.lightSeen : COLORS.lightUnseen,
        2,
      );
  }
  for (const h of run.hurts.filter((q) => q.room === room)) r.disc(h.x * s, (h.y - 48) * s, 3, COLORS.hurt);
  for (const c of run.catches.filter((q) => q.room === room))
    r.ring(c.x * s, (c.y - 48) * s, 7, COLORS.catchMark, 3);
  for (const d of run.deaths.filter((q) => q.room === room))
    r.cross(d.x * s, (d.y - 48) * s, 6, COLORS.death, 3);
  return r.png();
}
