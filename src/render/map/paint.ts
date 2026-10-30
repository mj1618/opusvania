/**
 * The map in the game's own hand (the Canopy r10, review r9 #4: the map was the debug overlay with room ids): a sheet
 * of dark bark, the rooms she knows as their carved air washed in moonlight and inked at the edge, rock left dark,
 * the rooms a moth-stone drew faint, landmark glyphs (the station's tree, a den's mouth, the moon at a vista), lamps
 * as warm points, freed lamps as cool rings, the saves as small moons. No ids: the region's name is the only text.
 *
 * Baked once per change of what she knows into a 2D canvas (Pixi shows it as a sprite); her mark and anything that
 * moves are drawn live over it by index.ts. Every wobble is a hash of the place, never `Math.random`: the same save
 * draws the same map.
 */
import type { Room } from '../../scene/room';
import type { SaveState } from '../../sim/state';
import type { WorldRoom } from '../../sim/world';
import { type Look, lookOf } from '../scene/lib/looks';

export const INK = {
  /** The sheet: dark bark, a little warmer in the middle. */
  sheet: '#14100c',
  sheetMid: '#211a13',
  grain: 'rgba(70, 54, 38, 0.22)',
  grainLit: 'rgba(120, 100, 76, 0.08)',
  /** Moonlit ink: the edge of air she has walked, the frame, the name. */
  ink: '#dce7e4',
  inkFaint: 'rgba(200, 214, 214, 0.34)',
  /** The air's wash, by look (a hint of the place's hue under the moonlight). */
  wash: {
    heartwood: ['#8d8068', '#4c4234'],
    shaft: ['#7c9ea1', '#34494d'],
    nest: ['#8f8564', '#4c4532'],
    canopy: ['#7f9a8e', '#3d5249'],
    den: ['#8e7462', '#4a3a30'],
    night: ['#8ea2ac', '#43535c'],
  } as Record<Look | 'night', [string, string]>,
  lamp: '#ffc45a',
  lampGlow: 'rgba(255, 186, 90, 0.35)',
  freed: '#a9d8ff',
  husk: 'rgba(150, 140, 126, 0.6)',
  moon: '#e9f0f4',
  patch: '#bcd6ff',
  stone: '#d6dfe8',
  exit: 'rgba(220, 231, 228, 0.75)',
  family: '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
} as const;

/** Bake resolution: canvas px per logical px. */
export const MAP_RES = 1.5;

/** A small stable hash of numbers to 0..1 (the wobble of an edge, a grain line). */
export function h01(...v: number[]): number {
  let h = 2166136261;
  for (const x of v) {
    h ^= Math.round(x * 97) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A trap lamp (the premise, review r9 #2): one whose snuff is kept (no relight). Its own flag if the level gives one. */
export function isTrap(l: { relight?: number; keep?: boolean; kind?: string; trap?: boolean }): boolean {
  if (typeof l.trap === 'boolean') return l.trap;
  return l.relight === undefined && !l.keep && l.kind !== 'moonwick';
}

export interface MapRoom {
  r: WorldRoom;
  /** She has been in it (the walked map); else a moth-stone drew it (faint). */
  known: boolean;
}

export interface MapFrame {
  /** World px to logical px: x' = ox + x * k. */
  k: number;
  ox: number;
  oy: number;
  /** The sheet, logical px. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type C2 = CanvasRenderingContext2D;

/** A rect as a polygon whose edges wobble a little (ink, not a ruler), logical px. */
function wobblyRect(g: C2, x: number, y: number, w: number, h: number, amp: number, step = 7): void {
  const pts: Array<[number, number]> = [];
  const side = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      // (Corners stay put: two rects that meet keep meeting.)
      const a = i === 0 ? 0 : amp * (h01(px, py, 1) - 0.5) * 2;
      pts.push([px + (ay === by ? 0 : a), py + (ax === bx ? 0 : a)]);
    }
  };
  side(x, y, x + w, y);
  side(x + w, y, x + w, y + h);
  side(x + w, y + h, x, y + h);
  side(x, y + h, x, y);
  g.moveTo(pts[0]?.[0] ?? x, pts[0]?.[1] ?? y);
  for (const [px, py] of pts) g.lineTo(px, py);
  g.closePath();
}

function canvas(w: number, h: number): [HTMLCanvasElement, C2] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * MAP_RES));
  c.height = Math.max(1, Math.ceil(h * MAP_RES));
  const g = c.getContext('2d') as C2;
  g.scale(MAP_RES, MAP_RES);
  return [c, g];
}

/**
 * The rooms' rock and air as two masks (opaque white), device px of a `w` x `h` bake whose origin is (left, top).
 * Rock rects grow by their wobble so two that touch never open a sliver of air between them.
 */
function masks(
  rooms: MapRoom[],
  f: MapFrame,
  save: Readonly<SaveState>,
  w: number,
  h: number,
  left: number,
  top: number,
): { air: HTMLCanvasElement; rock: HTMLCanvasElement } {
  const [rock, rg] = canvas(w, h);
  rg.translate(-left, -top);
  rg.fillStyle = '#fff';
  rg.beginPath();
  const amp = Math.min(1.4, Math.max(0.5, 900 * f.k * 0.02));
  for (const { r } of rooms) {
    const s = r.scene as Room;
    const list = [
      ...s.solids,
      ...(s.marks?.sealed ?? []),
      ...(s.bark ?? []).filter((b) => !save.opened.includes(`${r.id}:${b.id}`)),
      ...(s.shortcuts ?? []).filter((c) => !save.opened.includes(`${r.id}:${c.id}`)),
    ];
    for (const q of list) {
      const qw = q.w * f.k;
      const qh = q.h * f.k;
      if (qw < 0.6 && qh < 0.6) continue;
      const a = Math.min(amp, qw / 4, qh / 4);
      wobblyRect(rg, f.ox + (r.x + q.x) * f.k - a, f.oy + (r.y + q.y) * f.k - a, qw + 2 * a, qh + 2 * a, a);
    }
  }
  rg.fill();
  const [air, ag] = canvas(w, h);
  ag.translate(-left, -top);
  ag.fillStyle = '#fff';
  for (const { r } of rooms) {
    const s = r.scene as Room;
    ag.fillRect(f.ox + r.x * f.k, f.oy + r.y * f.k, s.width * f.k, s.height * f.k);
  }
  // A room's side open to nothing (the sky over the hatch, the hub's crown): the air fades out there instead of
  // ending on a ruled line, so an open room is not a box.
  const FADE = 26;
  ag.globalCompositeOperation = 'destination-out';
  for (const { r } of rooms) {
    const s = r.scene as Room;
    const rx0 = r.x;
    const rx1 = r.x + s.width;
    const ry0 = r.y;
    const ry1 = r.y + s.height;
    const touches = (side: 'n' | 's' | 'w' | 'e') =>
      rooms.some(({ r: o }) => {
        if (o === r) return false;
        const ox0 = o.x;
        const ox1 = o.x + o.scene.width;
        const oy0 = o.y;
        const oy1 = o.y + o.scene.height;
        if (side === 'n' || side === 's') {
          const y = side === 'n' ? ry0 : ry1;
          return (side === 'n' ? oy1 : oy0) === y && ox0 < rx1 && ox1 > rx0;
        }
        const x = side === 'w' ? rx0 : rx1;
        return (side === 'w' ? ox1 : ox0) === x && oy0 < ry1 && oy1 > ry0;
      });
    const X0 = f.ox + rx0 * f.k;
    const X1 = f.ox + rx1 * f.k;
    const Y0 = f.oy + ry0 * f.k;
    const Y1 = f.oy + ry1 * f.k;
    for (const side of ['n', 's', 'w', 'e'] as const) {
      if (touches(side)) continue;
      const [ax, ay, bx, by] =
        side === 'n'
          ? [0, Y0, 0, Y0 + FADE]
          : side === 's'
            ? [0, Y1, 0, Y1 - FADE]
            : side === 'w'
              ? [X0, 0, X0 + FADE, 0]
              : [X1, 0, X1 - FADE, 0];
      const gr = ag.createLinearGradient(ax, ay, bx, by);
      gr.addColorStop(0, 'rgba(0, 0, 0, 1)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ag.fillStyle = gr;
      if (side === 'n' || side === 's') ag.fillRect(X0, Math.min(ay, by), X1 - X0, FADE);
      else ag.fillRect(Math.min(ax, bx), Y0, FADE, Y1 - Y0);
    }
  }
  ag.setTransform(1, 0, 0, 1, 0, 0);
  ag.drawImage(rock, 0, 0);
  return { air, rock };
}

/** The ink line round a mask: the mask dilated by `r` px, less the mask itself. */
function edgeOf(mask: HTMLCanvasElement, w: number, h: number, r: number, color: string): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const R = r * MAP_RES;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.drawImage(mask, Math.cos(a) * R, Math.sin(a) * R);
  }
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The sheet: a torn-edged slab of dark bark with grain, lit a little from the top (the moon). */
function paintSheet(g: C2, f: MapFrame): void {
  const { x0, y0, x1, y1 } = f;
  g.save();
  g.beginPath();
  const pts: Array<[number, number]> = [];
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 14));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const d = (h01(px, py, 7) - 0.35) * 7 + (h01(Math.floor(i / 5), px * 0.01, 3) - 0.5) * 6;
      pts.push([px + nx * d, py + ny * d]);
    }
  };
  edge(x0, y0, x1, y0, 0, -1);
  edge(x1, y0, x1, y1, 1, 0);
  edge(x1, y1, x0, y1, 0, 1);
  edge(x0, y1, x0, y0, -1, 0);
  g.moveTo(pts[0]?.[0] ?? x0, pts[0]?.[1] ?? y0);
  for (const [px, py] of pts) g.lineTo(px, py);
  g.closePath();
  g.shadowColor = 'rgba(0, 0, 0, 0.8)';
  g.shadowBlur = 40;
  g.fillStyle = INK.sheet;
  g.fill();
  g.shadowBlur = 0;
  g.clip();
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const mid = g.createRadialGradient(cx, cy - (y1 - y0) * 0.2, 10, cx, cy, Math.max(x1 - x0, y1 - y0) * 0.65);
  mid.addColorStop(0, INK.sheetMid);
  mid.addColorStop(1, 'rgba(10, 8, 6, 0)');
  g.fillStyle = mid;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Grain: long wavering fibres across the slab, broken into runs.
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const y = y0 + (y1 - y0) * h01(i, 11);
    let x = x0 - 20 + (x1 - x0) * 0.3 * h01(i, 12);
    const lit = h01(i, 13) > 0.75;
    g.strokeStyle = lit ? INK.grainLit : INK.grain;
    g.lineWidth = 0.6 + 1.6 * h01(i, 14);
    while (x < x1) {
      const len = 60 + 260 * h01(i, x, 15);
      g.beginPath();
      g.moveTo(x, y);
      const amp = 3 * (h01(i, x, 16) - 0.5);
      g.bezierCurveTo(x + len * 0.33, y + amp, x + len * 0.66, y - amp, x + len, y + amp * 0.5);
      g.stroke();
      x += len + 30 + 120 * h01(i, x, 17);
    }
  }
  // A knot or two.
  for (let i = 0; i < 3; i++) {
    const kx = x0 + (x1 - x0) * (0.15 + 0.7 * h01(i, 21));
    const ky = y0 + (y1 - y0) * (0.15 + 0.7 * h01(i, 22));
    g.strokeStyle = INK.grain;
    for (let j = 0; j < 4; j++) {
      g.beginPath();
      g.ellipse(kx, ky, 8 + j * 7, 3 + j * 3, 0.1, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // The edge darkens in.
  const v = g.createRadialGradient(
    cx,
    cy,
    Math.min(x1 - x0, y1 - y0) * 0.35,
    cx,
    cy,
    Math.max(x1 - x0, y1 - y0) * 0.62,
  );
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(4, 3, 2, 0.6)');
  g.fillStyle = v;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.restore();
  // A thin inked border inside the torn edge.
  g.strokeStyle = 'rgba(214, 226, 222, 0.16)';
  g.lineWidth = 1;
  g.strokeRect(x0 + 14, y0 + 14, x1 - x0 - 28, y1 - y0 - 28);
}

/** A crescent moon glyph (a save; the moon at a vista is a full disc). */
function crescent(g: C2, x: number, y: number, r: number, color: string): void {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(x + r * 0.45, y - r * 0.25, r * 0.85, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A small moth glyph (a moth-stone she has read; her own mark is drawn live). */
export function mothPath(x: number, y: number, s: number): number[][] {
  return [
    [x, y, x - s * 1.5, y - s * 0.9, x - s * 1.25, y + s * 0.35],
    [x, y, x + s * 1.5, y - s * 0.9, x + s * 1.25, y + s * 0.35],
    [x, y + 0.5, x - s * 0.9, y + s * 1.1, x - s * 0.25, y + s * 0.45],
    [x, y + 0.5, x + s * 0.9, y + s * 1.1, x + s * 0.25, y + s * 0.45],
  ];
}

function moth(g: C2, x: number, y: number, s: number, color: string): void {
  g.fillStyle = color;
  for (const p of mothPath(x, y, s)) {
    g.beginPath();
    g.moveTo(p[0] as number, p[1] as number);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] as number, p[i + 1] as number);
    g.closePath();
    g.fill();
  }
}

/** A tree glyph (the hub's station): a trunk flaring into roots and a crown of strokes. */
function tree(g: C2, x: number, y: number, s: number): void {
  g.strokeStyle = INK.ink;
  g.lineCap = 'round';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - s * 1.6);
  for (const d of [-1, 1]) {
    g.moveTo(x, y - s * 0.1);
    g.quadraticCurveTo(x + d * s * 0.3, y, x + d * s * 0.7, y + s * 0.15);
    g.moveTo(x, y - s * 1.1);
    g.quadraticCurveTo(x + d * s * 0.4, y - s * 1.5, x + d * s * 0.95, y - s * 1.55);
    g.moveTo(x, y - s * 1.55);
    g.quadraticCurveTo(x + d * s * 0.25, y - s * 2.0, x + d * s * 0.6, y - s * 2.1);
  }
  g.stroke();
}

/** A den's mouth: a dark arch with a warm inner lip. */
function mouth(g: C2, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - s, y);
  g.quadraticCurveTo(x - s, y - s * 1.3, x, y - s * 1.35);
  g.quadraticCurveTo(x + s, y - s * 1.3, x + s, y);
  g.closePath();
  g.fillStyle = '#0a0705';
  g.fill();
  g.strokeStyle = 'rgba(230, 150, 90, 0.7)';
  g.lineWidth = 1.2;
  g.stroke();
}

export interface MapBakeInput {
  rooms: MapRoom[];
  frame: MapFrame;
  save: Readonly<SaveState>;
  here: string;
  /** Logical px of the bake (the view), and its top-left in logical coordinates. */
  w: number;
  h: number;
  left: number;
  top: number;
  name: string;
  /** Lamps she has not seen in each area a moth-stone drew: where to put the count (logical px). */
  unseen: Array<{ x: number; y: number; n: number }>;
}

/** The whole static map, logical px with (left, top) at the canvas's origin. */
export function bakeMap(b: MapBakeInput): HTMLCanvasElement {
  const { frame: f, save } = b;
  const [out, g] = canvas(b.w, b.h);
  g.translate(-b.left, -b.top);
  paintSheet(g, f);
  const seen = (r: WorldRoom, id: string) => save.seen.includes(`${r.id}:${id}`);
  const X = (r: WorldRoom, x: number) => f.ox + (r.x + x) * f.k;
  const Y = (r: WorldRoom, y: number) => f.oy + (r.y + y) * f.k;

  for (const known of [false, true]) {
    const set = b.rooms.filter((m) => m.known === known);
    if (set.length === 0) continue;
    // The air as a mask, then washed by look, then its inked edge.
    const { air: mask, rock } = masks(set, f, save, b.w, b.h, b.left, b.top);
    const [wash, wg] = canvas(b.w, b.h);
    wg.translate(-b.left, -b.top);
    for (const { r } of set) {
      const s = r.scene as Room;
      const look: Look | 'night' = s.art?.kit === 'wood' || s.id.startsWith('cn-') ? lookOf(s) : 'night';
      const [top, bottom] = INK.wash[look] ?? INK.wash.night;
      const y0 = Y(r, 0);
      const grad = wg.createLinearGradient(0, y0, 0, y0 + s.height * f.k);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      wg.fillStyle = grad;
      wg.fillRect(X(r, 0), y0, s.width * f.k, s.height * f.k);
    }
    // Mottle: soft lighter and darker blooms, an ink wash not a flat fill.
    for (let i = 0; i < 70; i++) {
      const x = f.x0 + (f.x1 - f.x0) * h01(i, 31);
      const y = f.y0 + (f.y1 - f.y0) * h01(i, 32);
      const r = 20 + 70 * h01(i, 33);
      const dark = h01(i, 34) > 0.5;
      const gr = wg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, dark ? 'rgba(10, 14, 16, 0.22)' : 'rgba(230, 240, 240, 0.1)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      wg.fillStyle = gr;
      wg.fillRect(x - r, y - r, r * 2, r * 2);
    }
    wg.setTransform(1, 0, 0, 1, 0, 0);
    wg.globalCompositeOperation = 'destination-in';
    wg.drawImage(mask, 0, 0);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = known ? 0.5 : 0.16;
    g.drawImage(wash, 0, 0);
    // Moonlight along the carved edges, inside the air: the rock blurred, kept where the air is.
    const [lit, lg] = canvas(b.w, b.h);
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.filter = `blur(${3 * MAP_RES}px)`;
    lg.drawImage(rock, 0, 0);
    lg.filter = 'none';
    lg.globalCompositeOperation = 'destination-in';
    lg.drawImage(mask, 0, 0);
    lg.globalCompositeOperation = 'source-in';
    lg.fillStyle = '#e6f0f2';
    lg.fillRect(0, 0, lit.width, lit.height);
    g.globalAlpha = known ? 0.32 : 0.1;
    g.drawImage(lit, 0, 0);
    // The ink line on the rock's side of the air (an open room edge, sky or a way on, is left unlined).
    const edge = edgeOf(mask, b.w, b.h, known ? 1.5 : 1.1, known ? INK.ink : INK.inkFaint);
    const eg = edge.getContext('2d') as C2;
    eg.globalCompositeOperation = 'destination-in';
    eg.drawImage(rock, 0, 0);
    g.globalAlpha = known ? 0.9 : 0.45;
    g.drawImage(edge, 0, 0);
    g.restore();
  }

  // What is in the rooms she knows.
  g.lineCap = 'round';
  for (const { r, known } of b.rooms) {
    const s = r.scene as Room;
    if (known) {
      // One-ways: a thin pale stroke.
      g.strokeStyle = 'rgba(220, 231, 228, 0.55)';
      g.lineWidth = 1;
      g.beginPath();
      for (const o of s.oneWays) {
        g.moveTo(X(r, o.x), Y(r, o.y));
        g.lineTo(X(r, o.x + o.w), Y(r, o.y));
      }
      g.stroke();
      // Gates still shut: a dark bar with a pale tick.
      for (const q of s.gates ?? [])
        if (!save.flags.includes(q.flag)) {
          g.fillStyle = 'rgba(8, 6, 4, 0.9)';
          g.fillRect(X(r, q.x), Y(r, q.y), Math.max(2, q.w * f.k), Math.max(2, q.h * f.k));
        }
      // Exits seen, not gone through: a small open chevron pointing out (the way on).
      g.strokeStyle = INK.exit;
      g.lineWidth = 1.3;
      for (const e of s.exits ?? []) {
        if (!seen(r, e.id) || save.crossed.includes(`${r.id}:${e.id}`)) continue;
        const mid = (e.from + e.to) / 2;
        const [ex, ey, dx, dy] =
          e.edge === 'n'
            ? [X(r, mid), Y(r, 0), 0, -1]
            : e.edge === 's'
              ? [X(r, mid), Y(r, s.height), 0, 1]
              : e.edge === 'w'
                ? [X(r, 0), Y(r, mid), -1, 0]
                : [X(r, s.width), Y(r, mid), 1, 0];
        const c = 4;
        g.beginPath();
        g.moveTo(ex - dy * c - dx * c * 0.4, ey - dx * c - dy * c * 0.4);
        g.lineTo(ex + dx * c * 0.8, ey + dy * c * 0.8);
        g.lineTo(ex + dy * c - dx * c * 0.4, ey + dx * c - dy * c * 0.4);
        g.stroke();
      }
    }
    if (!known) continue;
    // Landmarks: the station's tree, the den's mouth, the moon at a vista.
    for (const p of s.patches ?? []) {
      if (!seen(r, p.id)) continue;
      if ((p as { map?: boolean }).map) tree(g, X(r, p.x) + 9, Y(r, p.y) - 2, 6);
      crescent(g, X(r, p.x), Y(r, p.y - 50), 3.6, INK.patch);
      if (save.patch?.room === r.id && save.patch.id === p.id) {
        g.strokeStyle = 'rgba(188, 214, 255, 0.8)';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(X(r, p.x), Y(r, p.y - 50), 7.5, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if ((s as { boss?: unknown }).boss) {
      const gate = s.marks?.landmarks?.find((m) => m.kind === 'gate' || m.kind === 'arena');
      const mx = gate ? gate.x : s.width / 2;
      const my = gate ? gate.y : s.height * 0.8;
      mouth(g, X(r, mx), Y(r, my), 5);
    }
    for (const m of s.marks?.landmarks ?? []) {
      if (m.kind !== 'vista') continue;
      const mx = X(r, m.x);
      const my = Y(r, m.y) - 26;
      const glow = g.createRadialGradient(mx, my, 0, mx, my, 16);
      glow.addColorStop(0, 'rgba(233, 240, 244, 0.35)');
      glow.addColorStop(1, 'rgba(233, 240, 244, 0)');
      g.fillStyle = glow;
      g.fillRect(mx - 16, my - 16, 32, 32);
      g.fillStyle = INK.moon;
      g.beginPath();
      g.arc(mx, my, 4.2, 0, Math.PI * 2);
      g.fill();
    }
    for (const gl of s.glades ?? []) {
      if (!seen(r, gl.id) || save.taken.includes(`${r.id}:${gl.id}`)) continue;
      const cx = X(r, gl.x + gl.w / 2);
      const cy = Y(r, gl.y + gl.h / 2);
      g.fillStyle = INK.moon;
      g.beginPath();
      g.moveTo(cx, cy - 5);
      g.lineTo(cx + 3, cy);
      g.lineTo(cx, cy + 5);
      g.lineTo(cx - 3, cy);
      g.closePath();
      g.fill();
    }
    for (const l of s.lures ?? []) {
      if (!seen(r, l.id)) continue;
      const lx = X(r, l.x);
      const ly = Y(r, l.y);
      if (save.snuffed.includes(`${r.id}:${l.id}`)) {
        // Put out: a freed lamp is a cool ring, a spent springboard a husk.
        const trap = isTrap(l);
        g.strokeStyle = trap ? INK.freed : INK.husk;
        g.lineWidth = trap ? 1.4 : 1;
        g.beginPath();
        g.arc(lx, ly, trap ? 4.5 : 3, 0, Math.PI * 2);
        g.stroke();
        continue;
      }
      const glow = g.createRadialGradient(lx, ly, 0, lx, ly, 11);
      glow.addColorStop(0, INK.lampGlow);
      glow.addColorStop(1, 'rgba(255, 186, 90, 0)');
      g.fillStyle = glow;
      g.fillRect(lx - 11, ly - 11, 22, 22);
      g.fillStyle = INK.lamp;
      g.beginPath();
      g.arc(lx, ly, isTrap(l) ? 3.2 : 2.2, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of s.mothStones ?? []) {
      if (!save.taken.includes(`${r.id}:${m.id}`)) continue;
      moth(g, X(r, m.x), Y(r, m.y) - 4, 3, INK.stone);
    }
  }
  // An area a stone drew: its lamps she has not seen as faint warm rings in a row.
  for (const u of b.unseen) {
    for (let i = 0; i < u.n; i++) {
      g.strokeStyle = 'rgba(255, 196, 90, 0.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(u.x + i * 9, u.y, 2.6, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // The region's name, over the sheet's top edge, with a rule either side.
  if (b.name) {
    const cx = (f.x0 + f.x1) / 2;
    const ty = f.y0 + 46;
    g.font = `italic 500 30px ${INK.family}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = INK.ink;
    g.globalAlpha = 0.86;
    g.fillText(b.name, cx, ty);
    const tw = g.measureText(b.name).width / 2;
    g.strokeStyle = INK.ink;
    g.lineWidth = 1;
    g.globalAlpha = 0.4;
    for (const d of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + d * (tw + 16), ty - 9);
      g.lineTo(cx + d * (tw + 96), ty - 9);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  return out;
}
