/**
 * Procedural parallax backdrop for a room: a feverish boomtown skyline in silhouette (PLAN §2),
 * code-drawn only. Seeded per room by the render RNG, so every room looks different but the same
 * room always looks the same (screenshot tests rely on it).
 *
 * Layers, back to front (factor = parallax; fog = blend toward the fog colour):
 *   far0 0.08  sky gradient, horizon furnace glow, distant skyline, smokestacks, water towers
 *   far1 0.22  false-front town: windows (some lit), chimneys and smoke, signboards, awnings
 *   far2 0.42  works: scaffolding, cranes, hanging signage, sagging cables
 *   mid  0.68  near structure behind the playfield (pillars, pipes, chains); lit by the light map
 *   fg   1.35  dark out-of-focus occluders in front of everything (drawn live, not baked)
 * Static layers are baked once per room into low-res RenderTextures, blurred by depth.
 */
import { BlurFilter, Container, Graphics, type Renderer, RenderTexture, Sprite } from 'pixi.js';
import type { Room } from '../../sim/world/rooms';
import { VIEW_H, VIEW_W } from '../camera/index';
import { desaturate, mix, RenderRng } from './color';
import type { Dressing } from './dressing';
import type { Palette } from './palette';
import type { QualitySettings } from './quality';

export interface LayerSpec {
  name: string;
  factor: number;
  fog: number;
  desat: number;
  blur: number;
}

export const LAYER_SPECS = {
  far0: { name: 'far0', factor: 0.08, fog: 0.7, desat: 0.5, blur: 2.5 },
  far1: { name: 'far1', factor: 0.22, fog: 0.58, desat: 0.35, blur: 1.2 },
  far2: { name: 'far2', factor: 0.42, fog: 0.5, desat: 0.25, blur: 0.6 },
  mid: { name: 'mid', factor: 0.68, fog: 0.32, desat: 0.15, blur: 0 },
  fg: { name: 'fg', factor: 1.35, fog: 0, desat: 0, blur: 0 },
} satisfies Record<string, LayerSpec>;

/** Extra px around each layer so shake and rounding never show an edge. */
const MARGIN = 96;

/** Size of a layer's content for a room: the view plus the room's scroll range times the factor. */
export function layerSize(room: Room, tileSize: number, factor: number): { w: number; h: number } {
  return layerSizePx(room.width * tileSize, room.height * tileSize, factor);
}

/** Layer content size for a box of `bw` x `bh` world px (a room, or a whole region). */
export function layerSizePx(bw: number, bh: number, factor: number): { w: number; h: number } {
  return {
    w: Math.ceil(VIEW_W + Math.max(0, bw - VIEW_W) * factor + 2 * MARGIN),
    h: Math.ceil(VIEW_H + Math.max(0, bh - VIEW_H) * factor + 2 * MARGIN),
  };
}

/**
 * Where the backdrop lives in the world (memory/camera.md "world-anchored backdrop"). Layer content
 * is generated over `box` (a world room's whole region, so every room of a region shows the same
 * skyline at the same place and seams never pop), and each room bakes only the window its camera
 * can see. A layer point u maps to the screen as `VIEW_W/2 + (q(u) - centreX * factor) * zoom`,
 * with q(u) = u - MARGIN + (VIEW_W/2 + box.x) * factor - VIEW_W/2; for a lone room (box = the
 * room at the origin, zoom 1) that is exactly the old `-camX * factor - MARGIN`.
 */
export interface BackdropFrame {
  /** Generator box, world px. */
  box: { x: number; y: number; w: number; h: number };
  /** The room's tile (0, 0), world px. */
  origin: { x: number; y: number };
  /**
   * Range of the view centre (world px) and the smallest zoom the room uses, for the baked
   * window. Omitted: bake the whole layer (non-world rooms, as before).
   */
  view?: { x0: number; x1: number; y0: number; y1: number; zoomMin: number };
}

/** Screen-px slack around a baked window (shake, kick, rounding). */
const WINDOW_PAD = 64;

export interface BakedLayer {
  spec: LayerSpec;
  sprite: Sprite;
  rt: RenderTexture;
  /** Layer-content coordinate of the texture's top-left, and the bake resolution. */
  u0: number;
  v0: number;
  res: number;
}

export interface Backdrop {
  far: BakedLayer[];
  mid: BakedLayer;
  fg: Container;
  /** Positions every layer for a view whose top-left is (camX, camY) room px, at `zoom`. */
  place(camX: number, camY: number, zoom?: number): void;
  /** 0..1: fades the whole backdrop (crossfades a region change at a seam). */
  setAlpha(a: number): void;
  destroy(): void;
}

/** Colour at a layer depth: silhouette base blended toward fog and desaturated. */
function layerColor(p: Palette, spec: LayerSpec, base: number, extraFog = 0): number {
  return desaturate(mix(base, p.fog, Math.min(1, spec.fog + extraFog)), spec.desat);
}

// --- shape helpers -------------------------------------------------------------------------

function catenary(g: Graphics, x0: number, y0: number, x1: number, y1: number, sag: number): Graphics {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2 + sag;
  // Quadratic through the midpoint: control = 2*mid - (p0+p1)/2.
  return g.moveTo(x0, y0).quadraticCurveTo(mx * 2 - (x0 + x1) / 2, my * 2 - (y0 + y1) / 2, x1, y1);
}

function smoke(
  g: Graphics,
  rng: RenderRng,
  x: number,
  y: number,
  color: number,
  amount: number,
  wind: number,
) {
  const n = Math.round(rng.range(6, 11) * amount);
  let cx = x;
  let cy = y;
  let r = rng.range(10, 16);
  for (let i = 0; i < n; i++) {
    g.circle(cx, cy, r).fill({ color, alpha: 0.16 * (1 - i / (n + 2)) });
    cx += wind * r * rng.range(0.5, 1.1) + rng.range(-6, 6);
    cy -= r * rng.range(0.6, 0.9);
    r *= rng.range(1.12, 1.25);
  }
}

function waterTower(g: Graphics, x: number, base: number, w: number, h: number, color: number) {
  const tankH = w * 0.8;
  const legTop = base - h + tankH;
  g.rect(x + w * 0.12, legTop, w * 0.08, h - tankH).fill(color);
  g.rect(x + w * 0.8, legTop, w * 0.08, h - tankH).fill(color);
  g.moveTo(x + w * 0.16, legTop + 10)
    .lineTo(x + w * 0.84, base - 10)
    .moveTo(x + w * 0.84, legTop + 10)
    .lineTo(x + w * 0.16, base - 10)
    .stroke({ width: 3, color });
  g.roundRect(x, base - h, w, tankH, 6).fill(color);
  g.poly([x - 6, base - h + 4, x + w / 2, base - h - w * 0.35, x + w + 6, base - h + 4]).fill(color);
}

function derrick(g: Graphics, x: number, base: number, w: number, h: number, color: number) {
  const top = base - h;
  const cx = x + w / 2;
  g.moveTo(x, base)
    .lineTo(cx - 4, top)
    .lineTo(cx + 4, top)
    .lineTo(x + w, base)
    .stroke({ width: 5, color });
  const n = Math.max(3, Math.floor(h / 60));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const y = base - h * t;
    const half = (w / 2) * (1 - t) + 4;
    g.moveTo(cx - half, y).lineTo(cx + half, y);
    const t2 = (i + 1) / n;
    const half2 = (w / 2) * (1 - t2) + 4;
    g.moveTo(cx - half, y).lineTo(cx + half2, base - h * t2);
  }
  g.stroke({ width: 2, color });
  g.rect(cx - 10, top - 14, 20, 14).fill(color);
}

function scaffold(
  g: Graphics,
  rng: RenderRng,
  x: number,
  base: number,
  w: number,
  h: number,
  color: number,
  plank: number,
) {
  const cols = Math.max(2, Math.round(w / 64));
  const rows = Math.max(2, Math.round(h / 84));
  const cw = w / cols;
  const rh = h / rows;
  for (let c = 0; c <= cols; c++) g.rect(x + c * cw - 3, base - h, 6, h);
  for (let r = 0; r <= rows; r++) g.rect(x - 8, base - r * rh - 3, w + 16, 5);
  g.fill(color);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!rng.chance(0.55)) continue;
      const x0 = x + c * cw;
      const y0 = base - r * rh;
      if ((r + c) % 2 === 0) g.moveTo(x0, y0).lineTo(x0 + cw, y0 - rh);
      else g.moveTo(x0 + cw, y0).lineTo(x0, y0 - rh);
    }
  }
  g.stroke({ width: 3, color });
  for (let r = 1; r < rows; r++)
    if (rng.chance(0.35)) g.rect(x - 4, base - r * rh - 12, w + 8, 9).fill(plank);
}

function hangingSign(
  g: Graphics,
  rng: RenderRng,
  x: number,
  y: number,
  color: number,
  trim: number,
  chain: number,
) {
  const w = rng.range(80, 150);
  const h = rng.range(34, 56);
  const drop = rng.range(20, 70);
  g.moveTo(x + 10, y)
    .lineTo(x + 10, y + drop)
    .moveTo(x + w - 10, y)
    .lineTo(x + w - 10, y + drop);
  g.stroke({ width: 3, color: chain });
  g.rect(x, y + drop, w, h).fill(color);
  g.rect(x + 5, y + drop + 5, w - 10, h - 10).stroke({ width: 2, color: trim });
  // A few "lettering" strokes: title-deed signs.
  const lines = rng.int(1, 2);
  for (let i = 0; i < lines; i++) {
    const ly = y + drop + (h * (i + 1)) / (lines + 1);
    g.rect(x + 14, ly - 2, (w - 28) * rng.range(0.5, 0.95), 4).fill(trim);
  }
}

// --- layers --------------------------------------------------------------------------------

function drawSky(g: Graphics, p: Palette, w: number, h: number, rng: RenderRng) {
  const bands = 48;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c =
      t < 0.7
        ? mix(p.skyTop, p.skyBottom, t / 0.7)
        : mix(p.skyBottom, mix(p.skyBottom, p.glow, 0.35), (t - 0.7) / 0.3);
    g.rect(0, (h * i) / bands, w, h / bands + 1).fill(c);
  }
  // Furnace glow on the horizon, and a couple of distant hazy light domes.
  const gx = rng.range(0.25, 0.75) * w;
  for (let i = 0; i < 14; i++) {
    const r = 900 - i * 55;
    g.ellipse(gx, h + 60, r * 1.6, r).fill({ color: p.glow, alpha: 0.035 });
  }
  const domes = rng.int(1, 3);
  for (let d = 0; d < domes; d++) {
    const dx = rng.range(0, w);
    for (let i = 0; i < 6; i++)
      g.ellipse(dx, h - rng.range(40, 120), 300 - i * 40, 160 - i * 22).fill({ color: p.glow, alpha: 0.03 });
  }
}

function drawFar0(g: Graphics, rng: RenderRng, p: Palette, d: Dressing, w: number, h: number) {
  const spec = LAYER_SPECS.far0;
  drawSky(g, p, w, h, rng);
  const col = layerColor(p, spec, p.silhouette);
  const smokeCol = mix(p.fog, p.glow, 0.25);
  const win = mix(p.window, p.fog, 0.5);
  const density = d.backdrop.skyline;
  if (density <= 0) return;
  let x = -40;
  while (x < w) {
    const bw = rng.range(80, 240) / Math.max(0.4, density);
    const bh = rng.range(0.18, 0.46) * VIEW_H;
    const base = h - MARGIN * 0.5;
    const r = rng.next();
    if (r < 0.12 * d.backdrop.chimneys) {
      const sw = rng.range(16, 28);
      const sh = bh + rng.range(160, 360);
      g.rect(x + bw / 2 - sw / 2, base - sh, sw, sh).fill(col);
      g.rect(x + bw / 2 - sw / 2 - 4, base - sh, sw + 8, 10).fill(col);
      if (d.backdrop.smoke > 0) smoke(g, rng, x + bw / 2, base - sh - 10, smokeCol, d.backdrop.smoke, 1);
    } else if (r < 0.2) {
      waterTower(g, x + 10, base - bh * 0.6, rng.range(60, 90), rng.range(120, 180), col);
    } else if (r < 0.27) {
      derrick(g, x, base, rng.range(70, 120), bh + rng.range(80, 200), col);
    }
    g.rect(x, base - bh, bw, bh + MARGIN).fill(col);
    // Stepped or domed tops.
    if (rng.chance(0.3)) g.rect(x + bw * 0.2, base - bh - 24, bw * 0.6, 26).fill(col);
    else if (rng.chance(0.15)) g.ellipse(x + bw / 2, base - bh, bw * 0.4, bw * 0.25).fill(col);
    const lit = 0.05 * d.backdrop.windows;
    for (let wy = base - bh + 22; wy < base - 16; wy += 30)
      for (let wx = x + 12; wx < x + bw - 12; wx += 22)
        if (rng.chance(lit)) g.rect(wx, wy, 6, 9).fill({ color: win, alpha: 0.8 });
    x += bw + rng.range(-20, 30);
  }
  // Ground haze band.
  for (let i = 0; i < 8; i++) g.rect(0, h - MARGIN - 40 * i, w, 44).fill({ color: p.fog, alpha: 0.06 });
}

function drawFar1(g: Graphics, rng: RenderRng, p: Palette, d: Dressing, w: number, h: number) {
  const spec = LAYER_SPECS.far1;
  const col = layerColor(p, spec, p.silhouette);
  const dark = layerColor(p, spec, p.silhouette, -0.12);
  const trim = layerColor(p, spec, p.rimSide, 0.1);
  const win = mix(p.window, p.fog, 0.2);
  const smokeCol = mix(p.fog, p.glow, 0.2);
  const base = h - MARGIN * 0.6;
  let x = rng.range(-120, 0);
  const density = d.backdrop.skyline;
  if (density <= 0) return;
  while (x < w) {
    const bw = rng.range(150, 320);
    const bh = rng.range(0.22, 0.5) * VIEW_H;
    const top = base - bh;
    const gap = rng.range(20, 140) / Math.max(0.4, density);
    // Body.
    g.rect(x, top, bw, bh + MARGIN).fill(col);
    // False front (boomtown facade) or a pitched roof.
    if (rng.chance(0.6)) {
      const steps = rng.int(1, 3);
      let fw = bw;
      let fy = top;
      for (let s = 0; s < steps; s++) {
        const sh = rng.range(16, 34);
        fw *= rng.range(0.55, 0.8);
        fy -= sh;
        g.rect(x + (bw - fw) / 2, fy, fw, sh + 1).fill(col);
      }
      g.rect(x - 6, top - 6, bw + 12, 8).fill(col);
    } else {
      g.poly([x - 10, top + 2, x + bw / 2, top - bw * rng.range(0.25, 0.4), x + bw + 10, top + 2]).fill(col);
    }
    // Chimneys and smoke.
    if (rng.chance(0.55 * d.backdrop.chimneys)) {
      const cx = x + rng.range(0.15, 0.75) * bw;
      const ch = rng.range(50, 110);
      g.rect(cx, top - ch, 20, ch).fill(col);
      g.rect(cx - 4, top - ch, 28, 8).fill(col);
      if (d.backdrop.smoke > 0) smoke(g, rng, cx + 10, top - ch - 8, smokeCol, d.backdrop.smoke, 0.8);
    }
    // Window grid: most dark, some lit.
    const lit = 0.16 * d.backdrop.windows;
    for (let wy = top + 30; wy < base - 30; wy += 52) {
      for (let wx = x + 20; wx < x + bw - 30; wx += 40) {
        if (rng.chance(lit)) {
          g.rect(wx - 3, wy - 3, 20, 30).fill({ color: win, alpha: 0.18 });
          g.rect(wx, wy, 14, 24).fill({ color: win, alpha: 0.95 });
          g.rect(wx + 6, wy, 2, 24).fill({ color: dark, alpha: 0.6 });
        } else g.rect(wx, wy, 14, 24).fill(dark);
      }
    }
    // Signboard on the facade and an awning.
    if (rng.chance(0.4 * d.backdrop.signs)) {
      const sw = bw * rng.range(0.5, 0.8);
      g.rect(x + (bw - sw) / 2, top + 6, sw, 30).fill(dark);
      g.rect(x + (bw - sw) / 2 + 4, top + 10, sw - 8, 22).stroke({ width: 2, color: trim });
    }
    if (rng.chance(0.35)) {
      const ay = base - rng.range(60, 120);
      g.poly([x - 8, ay, x + bw + 8, ay, x + bw - 4, ay + 26, x + 4, ay + 26]).fill(dark);
    }
    // Pole and cables to the next building.
    if (rng.chance(0.5 * d.backdrop.cables)) {
      const px = x + bw + gap / 2;
      const ph = bh + rng.range(40, 160);
      g.rect(px - 4, base - ph, 8, ph).fill(col);
      g.rect(px - 24, base - ph + 12, 48, 5).fill(col);
      for (let k = 0; k < 2; k++)
        catenary(
          g,
          px - 22 + k * 44,
          base - ph + 14,
          px + rng.range(300, 600),
          base - ph + rng.range(-40, 60),
          60,
        );
      g.stroke({ width: 2, color: col });
    }
    x += bw + gap;
  }
}

function drawFar2(g: Graphics, rng: RenderRng, p: Palette, d: Dressing, w: number, h: number) {
  const spec = LAYER_SPECS.far2;
  const col = layerColor(p, spec, p.silhouette);
  const plank = layerColor(p, spec, mix(p.silhouette, p.rimSide, 0.35));
  // Signs get extra fog: a dark plank floating mid-air reads as a platform (gym-11 golden).
  const sign = layerColor(p, spec, mix(p.silhouette, p.rimSide, 0.35), 0.22);
  const trim = layerColor(p, spec, p.rimSide, 0.25);
  const base = h - MARGIN * 0.4;
  const anchors: Array<[number, number]> = [];
  let x = rng.range(-60, 200);
  while (x < w) {
    const r = rng.next();
    if (r < 0.5 * d.backdrop.scaffolding) {
      const sw = rng.range(120, 260);
      const sh = rng.range(0.35, 0.8) * VIEW_H;
      scaffold(g, rng, x, base, sw, sh, col, plank);
      anchors.push([x + sw / 2, base - sh]);
      if (rng.chance(0.6 * d.backdrop.signs))
        hangingSign(g, rng, x + rng.range(0, sw - 100), base - sh * rng.range(0.4, 0.8), sign, trim, col);
      x += sw + rng.range(200, 520);
    } else if (r < 0.7) {
      // Crane: mast, jib, hook line.
      const mh = rng.range(0.55, 0.9) * VIEW_H;
      const jib = rng.range(240, 460) * (rng.chance(0.5) ? 1 : -1);
      g.rect(x - 8, base - mh, 16, mh).fill(col);
      // Jib as an open truss (a solid bar reads as a platform).
      const j0 = Math.min(x, x + jib);
      const jl = Math.abs(jib);
      g.rect(j0, base - mh, jl, 3).fill(col);
      g.rect(j0, base - mh + 14, jl, 3).fill(col);
      for (let k = 0; k + 20 <= jl; k += 20)
        g.moveTo(j0 + k, base - mh + 15).lineTo(j0 + k + 10, base - mh + 1);
      g.stroke({ width: 2, color: col });
      g.moveTo(x, base - mh - 50)
        .lineTo(x + jib, base - mh)
        .moveTo(x, base - mh - 50)
        .lineTo(x - jib * 0.25, base - mh);
      g.rect(x - 6, base - mh - 50, 12, 50).fill(col);
      const hy = base - mh + rng.range(120, 380);
      g.moveTo(x + jib * 0.8, base - mh + 12)
        .lineTo(x + jib * 0.8, hy)
        .stroke({ width: 2, color: col });
      g.rect(x + jib * 0.8 - 12, hy, 24, 18).fill(col);
      anchors.push([x, base - mh]);
      x += Math.abs(jib) + rng.range(200, 400);
    } else {
      // Plain pole with a signpost.
      const ph = rng.range(0.3, 0.6) * VIEW_H;
      g.rect(x - 5, base - ph, 10, ph).fill(col);
      g.rect(x - 30, base - ph + 10, 60, 6).fill(col);
      anchors.push([x, base - ph + 12]);
      x += rng.range(260, 520);
    }
  }
  if (d.backdrop.cables > 0) {
    for (let i = 0; i + 1 < anchors.length; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (!a || !b || !rng.chance(0.8 * d.backdrop.cables)) continue;
      const sag = rng.range(40, 140);
      catenary(g, a[0], a[1], b[0], b[1], sag);
      if (rng.chance(0.5)) catenary(g, a[0], a[1] + 16, b[0], b[1] + 16, sag * 1.2);
      g.stroke({ width: 3, color: col });
      // Pennants or hanging lamps along some cables.
      if (rng.chance(0.4 * d.backdrop.signs)) {
        const n = rng.int(3, 7);
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const px = a[0] + (b[0] - a[0]) * t;
          const py = a[1] + (b[1] - a[1]) * t + sag * 2 * t * (1 - t) * 2 * 0.5;
          g.poly([px - 9, py, px + 9, py, px, py + 22]).fill(plank);
        }
      }
    }
  }
}

function drawMid(g: Graphics, rng: RenderRng, p: Palette, d: Dressing, w: number, h: number) {
  const spec = LAYER_SPECS.mid;
  const density = d.backdrop.mid;
  if (density <= 0) return;
  const col = layerColor(p, spec, mix(p.silhouette, p.terrain, 0.5));
  const edge = layerColor(p, spec, mix(p.terrain, p.rimSide, 0.3));
  const dark = layerColor(p, spec, p.silhouette, -0.1);
  // Vertical girder pillars with rivets and X-bracing (vertical: never mistaken for platforms).
  let x = rng.range(100, 500);
  while (x < w) {
    const pw = rng.range(44, 80);
    g.rect(x, 0, pw, h).fill(col);
    g.rect(x, 0, 5, h).fill(edge);
    g.rect(x + pw - 5, 0, 5, h).fill(dark);
    for (let y = rng.range(0, 90); y < h; y += 90) {
      g.circle(x + 12, y, 3).fill(edge);
      g.circle(x + pw - 12, y, 3).fill(edge);
    }
    if (rng.chance(0.5)) {
      const bx = x + pw;
      const bw = rng.range(90, 180);
      for (let y = rng.range(0, 200); y < h; y += 220)
        g.moveTo(bx, y)
          .lineTo(bx + bw, y + 200)
          .moveTo(bx + bw, y)
          .lineTo(bx, y + 200);
      g.stroke({ width: 5, color: dark, alpha: 0.8 });
      g.rect(bx + bw, 0, 14, h).fill(dark);
    }
    x += rng.range(700, 1300) / density;
  }
  // Hanging chains from the top.
  const chains = Math.round(rng.range(3, 7) * density * (w / 3000));
  for (let i = 0; i < chains; i++) {
    const cx = rng.range(0, w);
    const len = rng.range(120, 420);
    for (let y = 0; y < len; y += 16) g.roundRect(cx - 4, y, 8, 14, 4).stroke({ width: 2, color: edge });
    g.poly([cx - 8, len, cx + 8, len, cx + 12, len + 16, cx, len + 30, cx - 12, len + 16]).fill(dark);
  }
  // No signs or horizontal beams here: at this depth they read as platforms (gym-09 playtest).
}

function drawForeground(
  g: Graphics,
  rng: RenderRng,
  p: Palette,
  d: Dressing,
  w: number,
  h: number,
  soft: boolean,
) {
  const density = d.foreground.density;
  if (density <= 0) return;
  const col = mix(p.terrainDeep, 0x000000, 0.35);
  const halo = (draw: (grow: number) => void) => {
    if (soft) {
      draw(10);
      g.fill({ color: col, alpha: 0.25 });
      draw(4);
      g.fill({ color: col, alpha: 0.5 });
    }
    draw(0);
    g.fill({ color: col, alpha: 0.94 });
  };
  // Foreground beams hang from the top only, never across the middle band where play happens or
  // over floor hazards (readability beats mood).
  let x = rng.range(500, 1300);
  while (x < w) {
    const pw = rng.range(46, 80);
    const len = rng.range(0.16, 0.28) * VIEW_H;
    halo((k) => g.poly([x - k, -10, x + pw + k, -10, x + pw + k, len + k, x - k, len - 30 - k]));
    x += rng.range(1500, 2600) / density;
  }
  // Swagged cables and hanging chains across the top.
  let cx = rng.range(-200, 200);
  while (cx < w) {
    const span = rng.range(500, 900);
    const y0 = rng.range(-20, 60);
    const sag = rng.range(60, 160);
    const cable = () => catenary(g, cx, y0, cx + span, y0 + rng.range(-30, 30), sag);
    if (soft) {
      cable();
      g.stroke({ width: 22, color: col, alpha: 0.2 });
    }
    cable();
    g.stroke({ width: 9, color: col, alpha: 0.95 });
    if (rng.chance(0.5)) {
      const hx = cx + span * rng.range(0.3, 0.7);
      const len = rng.range(120, 260);
      halo((k) => g.rect(hx - 3 - k / 2, y0 + sag * 0.8, 6 + k, len));
      halo((k) => g.circle(hx, y0 + sag * 0.8 + len, 14 + k));
    }
    cx += span + rng.range(300, 900) / density;
  }
  // Clutter along the bottom: crates, barrels, broken posts.
  let bx = rng.range(-100, 300);
  while (bx < w) {
    const kind = rng.next();
    const by = h + 6;
    if (kind < 0.4) {
      const s = rng.range(60, 110);
      halo((k) => g.rect(bx - k, by - s - k, s + 2 * k, s + 2 * k));
    } else if (kind < 0.7) {
      const bw = rng.range(60, 90);
      const bh = bw * 1.2;
      halo((k) => g.roundRect(bx - k, by - bh - k, bw + 2 * k, bh + 2 * k, 18));
    } else {
      const pw = rng.range(24, 40);
      const ph = rng.range(90, 150);
      halo((k) => g.poly([bx - k, by, bx + pw + k, by, bx + pw + k, by - ph * 0.8, bx - k, by - ph - k]));
    }
    bx += rng.range(500, 1100) / density;
  }
}

// --- baking --------------------------------------------------------------------------------

function bake(
  renderer: Renderer,
  spec: LayerSpec,
  win: { u0: number; v0: number; w: number; h: number },
  q: QualitySettings,
  draw: (g: Graphics) => void,
): BakedLayer {
  const res = bakeRes(q, win.w, win.h);
  const g = new Graphics();
  draw(g);
  g.position.set(-win.u0, -win.v0);
  const holder = new Container();
  holder.addChild(g);
  holder.scale.set(res);
  if (q.bakeBlur && spec.blur > 0) {
    const f = new BlurFilter({ strength: spec.blur * res * 2, quality: 3 });
    f.padding = 0;
    g.filters = [f];
  }
  const rt = RenderTexture.create({
    width: Math.ceil(win.w * res),
    height: Math.ceil(win.h * res),
    antialias: false,
  });
  renderer.render({ container: holder, target: rt, clear: true, clearColor: [0, 0, 0, 0] });
  holder.destroy({ children: true });
  const sprite = new Sprite(rt);
  sprite.scale.set(1 / res);
  sprite.label = spec.name;
  return { spec, sprite, rt, u0: win.u0, v0: win.v0, res };
}

/** Keep under 4096 px (max texture size on older GPUs) for very large rooms. */
function bakeRes(q: QualitySettings, w: number, h: number): number {
  return Math.min(q.bakeRes, 4096 / w, 4096 / h);
}

/** Layer-content window a room needs: [u0, u0 + w] x [v0, v0 + h] (whole layer without `view`). */
function layerWindow(
  frame: BackdropFrame,
  factor: number,
  size: { w: number; h: number },
  q: QualitySettings,
) {
  const v = frame.view;
  if (!v) return { u0: 0, v0: 0, w: size.w, h: size.h };
  const { box } = frame;
  const toU = (qx: number) => qx + MARGIN - (VIEW_W / 2 + box.x) * factor + VIEW_W / 2;
  const toV = (qy: number) => qy + MARGIN - (VIEW_H / 2 + box.y) * factor + VIEW_H / 2;
  const hw = VIEW_W / (2 * v.zoomMin) + WINDOW_PAD;
  const hh = VIEW_H / (2 * v.zoomMin) + WINDOW_PAD;
  const u1 = Math.min(size.w, toU(v.x1 * factor + hw));
  const v1 = Math.min(size.h, toV(v.y1 * factor + hh));
  let u0 = Math.max(0, toU(v.x0 * factor - hw));
  let v0 = Math.max(0, toV(v.y0 * factor - hh));
  // Snap to the bake's texel grid so neighbouring rooms sample the layer identically.
  const res = bakeRes(q, u1 - u0, v1 - v0);
  u0 = Math.floor(u0 * res) / res;
  v0 = Math.floor(v0 * res) / res;
  return { u0, v0, w: Math.max(1, u1 - u0), h: Math.max(1, v1 - v0) };
}

export function buildBackdrop(
  renderer: Renderer,
  room: Room,
  tileSize: number,
  d: Dressing,
  q: QualitySettings,
  frame: BackdropFrame = {
    box: { x: 0, y: 0, w: room.width * tileSize, h: room.height * tileSize },
    origin: { x: 0, y: 0 },
  },
): Backdrop {
  const p = d.palette;
  const seed = d.seed;
  const { box } = frame;
  const layer = (spec: LayerSpec, salt: number, fn: typeof drawFar0) => {
    const size = layerSizePx(box.w, box.h, spec.factor);
    const rng = new RenderRng(seed ^ Math.imul(salt, 0x9e3779b1));
    return bake(renderer, spec, layerWindow(frame, spec.factor, size, q), q, (g) =>
      fn(g, rng, p, d, size.w, size.h),
    );
  };
  const far = [
    layer(LAYER_SPECS.far0, 1, drawFar0),
    layer(LAYER_SPECS.far1, 2, drawFar1),
    layer(LAYER_SPECS.far2, 3, drawFar2),
  ];
  const mid = layer(LAYER_SPECS.mid, 4, drawMid);
  const fg = new Container({ label: 'fg' });
  const fgG = new Graphics();
  const fgSize = layerSizePx(box.w, box.h, LAYER_SPECS.fg.factor);
  drawForeground(fgG, new RenderRng(seed ^ 0x5bd1e995), p, d, fgSize.w, fgSize.h, q.softForeground);
  fg.addChild(fgG);
  const all: Array<{ node: Container; factor: number; u0: number; v0: number; res: number }> = [
    ...far.map((l) => ({
      node: l.sprite as Container,
      factor: l.spec.factor,
      u0: l.u0,
      v0: l.v0,
      res: l.res,
    })),
    { node: mid.sprite, factor: mid.spec.factor, u0: mid.u0, v0: mid.v0, res: mid.res },
    { node: fg, factor: LAYER_SPECS.fg.factor, u0: 0, v0: 0, res: 1 },
  ];
  return {
    far,
    mid,
    fg,
    place(camX, camY, zoom = 1) {
      // View centre in world px; each layer point u lands at VIEW_W/2 + (q(u) - cx * f) * zoom.
      const cx = camX + VIEW_W / (2 * zoom) + frame.origin.x;
      const cy = camY + VIEW_H / (2 * zoom) + frame.origin.y;
      for (const { node, factor, u0, v0, res } of all) {
        const qx = u0 - MARGIN + (VIEW_W / 2 + box.x) * factor - VIEW_W / 2;
        const qy = v0 - MARGIN + (VIEW_H / 2 + box.y) * factor - VIEW_H / 2;
        node.position.set(
          Math.round(VIEW_W / 2 + (qx - cx * factor) * zoom),
          Math.round(VIEW_H / 2 + (qy - cy * factor) * zoom),
        );
        node.scale.set(zoom / res);
      }
    },
    setAlpha(a) {
      for (const { node } of all) node.alpha = a;
    },
    destroy() {
      for (const l of [...far, mid]) {
        l.sprite.destroy();
        l.rt.destroy(true);
      }
      fg.destroy({ children: true });
    },
  };
}
