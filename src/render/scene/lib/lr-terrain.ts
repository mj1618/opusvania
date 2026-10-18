/**
 * Lanternroot's playfield painter (docs/design/levels/proto-1.md §8, memory/lanternroot-art.md): any room's
 * rects, whatever their shape, become one of four materials, then the shared bake (pf-bake.ts) lights them.
 *
 *   night   the fallen giant's outside: dark bark plates running along the log (it lies west to east), a
 *           silver moss crest on every top, roots and torn bark under the overhangs
 *   hall    inside the trunk: umber heartwood, growth rings swirling across the faces, rotten fibre
 *           falling away under lips; a pale fungus skin on the tops so the floor reads in lamplight
 *   roots   the drowned roots: near-black wood and stone, twisted root cords across the faces, wet
 *           moss on the tops that the light glints on
 *   cache   the firefly's workshop: the hall's wood, darker and smoother
 *
 * How: the static solids go onto an 8 px grid; every rect is painted as its own polygon whose edges are
 * pushed out under a neighbour (no seams) and roughened where they face open air (tops barely, so the
 * painted top stays on the collision; faces more; undersides most). The exposed runs (tops, faces,
 * undersides) found on the grid carry the material detail and feed the live rim (lr-rim.ts) and the
 * growth (lr-flora.ts). One-ways are drawn as shelves: bracket fungi in the hall, root rungs below,
 * snapped branch stubs on the night side. Kit solids (bark, gates) are the pieces' (render/lantern).
 */
import type { Room } from '../../../scene/room';
import type { OneWay, SolidRect } from '../../../sim/scene';
import { mix } from './look';
import type { BakeLook } from './pf-bake';
import { Paint } from './pf-paint';
import { blob, chaikin, clamp, range, rngFor, wobble } from './pf-shape';
import type { TerrainInfo } from './pf-terrain';
import type { LanternBand } from './room-look';

/** Grid cell, px (every rect in the rooms is on an 8 px grid). */
const G = 8;

/** A run of exposed edge on the grid: a top or an underside (horizontal), a face (vertical). */
export interface Run {
  /** Horizontal runs: x0..x1 at y. Vertical runs: y0..y1 at x (stored as x0 = x1 = x, y = y0, y1). */
  x0: number;
  x1: number;
  y: number;
  y1: number;
  /** The open side: up (a top), down (an underside), west (-1) or east (+1) for a face. */
  side: 'up' | 'down' | 'w' | 'e';
}

/** What the rim, the growth and the pieces read. */
export interface LanternPlan {
  band: LanternBand;
  tops: Run[];
  unders: Run[];
  faces: Run[];
  shelves: OneWay[];
  /** The painted top at x for a top run (a hair of roll over the collision). */
  topAt: (run: Run, x: number) => number;
  /** The grid's solid test (static terrain only). */
  solid: (x: number, y: number) => boolean;
}

/** Each band's materials (local colours: the bake lights and grades them). */
interface Material {
  body: number;
  bodyDeep: number;
  grain: number;
  grainLit: number;
  top: number;
  topLit: number;
  under: number;
  /** Relief height of the walk plane, and how much of it is bark grain. */
  h: number;
  bark: number;
  /** Displacement: tops, faces, undersides, px. */
  rough: [number, number, number];
  shelf: number;
  shelfLit: number;
}

const MATS: Record<LanternBand, Material> = {
  night: {
    body: 0x161e27,
    bodyDeep: 0x090c11,
    grain: 0x080b0f,
    grainLit: 0x34444f,
    top: 0x22383a,
    topLit: 0x4c6c68,
    under: 0x05080b,
    h: 0.62,
    bark: 0.8,
    rough: [2.2, 12, 16],
    shelf: 0x121a20,
    shelfLit: 0x34484c,
  },
  hall: {
    body: 0x332116,
    bodyDeep: 0x160e0a,
    grain: 0x1a100b,
    grainLit: 0x6a4630,
    top: 0x3e3022,
    topLit: 0x8a6c48,
    under: 0x0d0806,
    h: 0.6,
    bark: 0.55,
    rough: [2, 11, 18],
    shelf: 0x3a2a1e,
    shelfLit: 0x9a7a54,
  },
  roots: {
    body: 0x10151a,
    bodyDeep: 0x06080b,
    grain: 0x05070a,
    grainLit: 0x26343f,
    top: 0x1b3236,
    topLit: 0x467074,
    under: 0x030405,
    h: 0.58,
    bark: 0.7,
    rough: [2.4, 14, 20],
    shelf: 0x111a1e,
    shelfLit: 0x2c4448,
  },
  cache: {
    body: 0x1d130e,
    bodyDeep: 0x0e0907,
    grain: 0x110b08,
    grainLit: 0x3e2a1c,
    top: 0x36291d,
    topLit: 0x7a5e40,
    under: 0x0a0605,
    h: 0.6,
    bark: 0.5,
    rough: [2, 9, 14],
    shelf: 0x33251a,
    shelfLit: 0x8a6c4a,
  },
};

/** The bake's lighting per band (pf-bake.ts BakeLook: GLSL snippets). */
export const LANTERN_BAKE: Record<LanternBand, BakeLook> = {
  night: {
    key: 'vec3(0.66, 0.8, 0.98)',
    mossKey: 'vec3(0.7, 0.8, 0.84)',
    sun: 'clamp(0.4 + 0.36 * dapple + 0.1 * beam, 0.0, 1.0)',
    zone: 'vec3(0.86, 0.95, 1.06)',
    sky: 'vec3(0.32, 0.5, 0.8)',
    interior: '0.66',
    rimScale: ' * mix(0.18, 1.0, moss)',
    chipScale: ' * 0.2',
    keyScale: ' * mix(0.55, 1.0, moss)',
  },
  hall: {
    key: 'vec3(1.0, 0.7, 0.4)',
    mossKey: 'vec3(1.0, 0.78, 0.48)',
    sun: 'clamp(0.32 + 0.3 * dapple + 0.12 * beam, 0.0, 1.0)',
    zone: 'vec3(1.04, 0.92, 0.8)',
    sky: 'vec3(0.5, 0.36, 0.24)',
    interior: '0.62',
    rimScale: ' * mix(0.3, 1.0, moss)',
    chipScale: ' * 0.35',
    keyScale: ' * mix(0.6, 1.0, moss)',
  },
  roots: {
    key: 'vec3(0.42, 0.58, 0.8)',
    mossKey: 'vec3(0.5, 0.7, 0.78)',
    sun: 'clamp(0.16 + 0.22 * dapple, 0.0, 1.0)',
    zone: 'vec3(0.78, 0.9, 1.04)',
    sky: 'vec3(0.12, 0.2, 0.28)',
    interior: '0.74',
    rimScale: ' * mix(0.25, 1.0, moss)',
    chipScale: ' * 0.4',
    keyScale: ' * mix(0.5, 1.0, moss)',
  },
  cache: {
    key: 'vec3(1.0, 0.74, 0.46)',
    mossKey: 'vec3(1.0, 0.8, 0.52)',
    sun: 'clamp(0.3 + 0.3 * dapple, 0.0, 1.0)',
    zone: 'vec3(1.02, 0.92, 0.82)',
    sky: 'vec3(0.46, 0.34, 0.24)',
    interior: '0.64',
    rimScale: ' * mix(0.3, 1.0, moss)',
    chipScale: ' * 0.3',
    keyScale: ' * mix(0.6, 1.0, moss)',
  },
};

/** The grid of static solids (kit solids are drawn by the pieces). */
class Grid {
  readonly nx: number;
  readonly ny: number;
  private readonly cells: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
    solids: readonly SolidRect[],
  ) {
    this.nx = Math.ceil(width / G);
    this.ny = Math.ceil(height / G);
    this.cells = new Uint8Array(this.nx * this.ny);
    for (const s of solids) {
      const i0 = Math.max(0, Math.floor(s.x / G));
      const i1 = Math.min(this.nx, Math.ceil((s.x + s.w) / G));
      const j0 = Math.max(0, Math.floor(s.y / G));
      const j1 = Math.min(this.ny, Math.ceil((s.y + s.h) / G));
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) this.cells[j * this.nx + i] = 1;
    }
  }
  /** Out of the room counts as solid below its bottom and beside it (the edges are walls), open above. */
  at(i: number, j: number): boolean {
    if (j < 0) return false;
    if (i < 0 || i >= this.nx || j >= this.ny) return true;
    return this.cells[j * this.nx + i] === 1;
  }
  solidAt(x: number, y: number): boolean {
    return this.at(Math.floor(x / G), Math.floor(y / G));
  }
}

/** Exposed runs on the grid. */
function findRuns(g: Grid): { tops: Run[]; unders: Run[]; faces: Run[] } {
  const tops: Run[] = [];
  const unders: Run[] = [];
  const faces: Run[] = [];
  // Horizontal: a filled cell under an empty one is a top; over an empty one an underside.
  for (let j = 0; j < g.ny; j++) {
    let topStart = -1;
    let underStart = -1;
    for (let i = 0; i <= g.nx; i++) {
      const filled = i < g.nx && g.at(i, j);
      const top = filled && !g.at(i, j - 1);
      const under = filled && j + 1 < g.ny && !g.at(i, j + 1);
      if (top && topStart < 0) topStart = i;
      if (!top && topStart >= 0) {
        tops.push({ x0: topStart * G, x1: i * G, y: j * G, y1: j * G, side: 'up' });
        topStart = -1;
      }
      if (under && underStart < 0) underStart = i;
      if (!under && underStart >= 0) {
        unders.push({ x0: underStart * G, x1: i * G, y: (j + 1) * G, y1: (j + 1) * G, side: 'down' });
        underStart = -1;
      }
    }
  }
  // Vertical: a filled cell beside an empty one is a face.
  for (let i = 0; i < g.nx; i++) {
    let wStart = -1;
    let eStart = -1;
    for (let j = 0; j <= g.ny; j++) {
      const filled = j < g.ny && g.at(i, j);
      const w = filled && i > 0 && !g.at(i - 1, j);
      const e = filled && i + 1 < g.nx && !g.at(i + 1, j);
      if (w && wStart < 0) wStart = j;
      if (!w && wStart >= 0) {
        faces.push({ x0: i * G, x1: i * G, y: wStart * G, y1: j * G, side: 'w' });
        wStart = -1;
      }
      if (e && eStart < 0) eStart = j;
      if (!e && eStart >= 0) {
        faces.push({ x0: (i + 1) * G, x1: (i + 1) * G, y: eStart * G, y1: j * G, side: 'e' });
        eStart = -1;
      }
    }
  }
  return { tops, unders, faces };
}

/** How far a rounded corner of radius `r` sits in from the square corner, `t` px along the edge from it. */
function inset(r: number, t: number): number {
  if (r <= 0 || t >= r) return 0;
  const u = r - Math.max(0, t);
  return r - Math.sqrt(Math.max(0, r * r - u * u));
}

/**
 * One rect's outline: its perimeter walked in small steps, each point pushed out by `cover` where a
 * neighbouring solid continues (no seam) and roughened where it faces open air: tops barely (the lit lip
 * stays on the collision, to its very edge), faces in slow bulges with a little tooth, undersides in lumps.
 * Corners open to the air on both sides are rounded: a hair at the top (the lip still reaches the edge),
 * generously underneath.
 */
function rectOutline(s: SolidRect, g: Grid, m: Material, seed: number, W: number, H: number): number[] {
  const [rt, rf, ru] = m.rough;
  const cover = 14;
  const out: number[] = [];
  // Rects that run off the room edge run on past it, so no edge of paint ever shows.
  const x0 = s.x <= 0 ? -200 : s.x;
  const x1 = s.x + s.w >= W ? W + 200 : s.x + s.w;
  const y0 = s.y;
  const y1 = s.y + s.h >= H ? H + 200 : s.y + s.h;
  const open = (x: number, y: number): boolean => !g.solidAt(x, y);
  const step = 6;
  // Corners: rounded where both edges meet open air and the cell off the corner is open too.
  const rT = Math.min(7, s.w / 4, s.h / 4);
  const rB = Math.min(44, s.w / 3, s.h / 2);
  const tl = open(x0 - 2, y0 + 2) && open(x0 + 2, y0 - 2) && open(x0 - 2, y0 - 2) ? rT : 0;
  const tr = open(x1 + 2, y0 + 2) && open(x1 - 2, y0 - 2) && open(x1 + 2, y0 - 2) ? rT : 0;
  const br = open(x1 + 2, y1 - 2) && open(x1 - 2, y1 + 2) && open(x1 + 2, y1 + 2) ? rB : 0;
  const bl = open(x0 - 2, y1 - 2) && open(x0 + 2, y1 + 2) && open(x0 - 2, y1 + 2) ? rB : 0;
  // Faces: a little lip overhang under the top, then slow bulges and tooth, mostly receding (she must never
  // seem to stand inside the paint: -rf .. +4 px).
  const face = (y: number, sd: number): number => {
    const lip = Math.exp(-(((y - y0) / 26) ** 2));
    const wob = 0.7 * wobble(y, sd, 170) + 0.3 * wobble(y, sd + 3, 30);
    return lip * 5 + (1 - lip) * (wob * rf * 0.6 - rf * 0.4);
  };
  // Top edge, west to east.
  for (let x = x0; x < x1; x += step) {
    const o = open(x + 1, y0 - 2);
    const d = o ? -rt * (0.5 + 0.5 * wobble(x, seed, 90)) : -cover;
    out.push(x, y0 + d + inset(tl, x - x0) + inset(tr, x1 - x));
  }
  // East face, top to bottom.
  for (let y = y0; y < y1; y += step) {
    const o = open(x1 + 2, y + 1);
    const d = o ? face(y, seed + 11) : cover;
    out.push(x1 + d - inset(tr, y - y0) - inset(br, y1 - y), y);
  }
  // Underside, east to west: lumps and sags.
  for (let x = x1; x > x0; x -= step) {
    const o = open(x - 1, y1 + 2);
    const d = o ? ru * (0.3 + 0.7 * Math.abs(wobble(x, seed + 23, 70))) : cover;
    out.push(x, y1 + d - inset(br, x1 - x) - inset(bl, x - x0));
  }
  // West face, bottom to top.
  for (let y = y1; y > y0; y -= step) {
    const o = open(x0 - 2, y - 1);
    const d = o ? face(y, seed + 37) : cover;
    out.push(x0 - d + inset(tl, y - y0) + inset(bl, y1 - y), y);
  }
  return chaikin(out, 1);
}

/** A strip polygon along a horizontal run: from `y(x) + a` to `y(x) + b`, ragged along its lower edge. */
function strip(
  x0: number,
  x1: number,
  y: (x: number) => number,
  a: number,
  b: (x: number) => number,
  step = 6,
): number[] {
  const up: number[] = [];
  const dn: number[] = [];
  for (let x = x0; x <= x1 + 0.01; x += step) {
    const xx = Math.min(x, x1);
    up.push(xx, y(xx) + a);
    dn.push(xx, y(xx) + b(xx));
  }
  const out = up.slice();
  for (let i = dn.length - 2; i >= 0; i -= 2) out.push(dn[i] as number, dn[i + 1] as number);
  return out;
}

/** Twisted root cords across a face (the roots): long tapered ribbons wandering down and along. */
function cords(p: Paint, m: Material, x0: number, x1: number, y0: number, y1: number, seed: number): void {
  const r = rngFor(seed, 7);
  const w = x1 - x0;
  const n = Math.max(2, Math.round(w / 90));
  for (let k = 0; k < n; k++) {
    let x = x0 + range(r, 0, w);
    let y = y0 + range(r, 10, 60);
    let a = range(r, 1.1, 2.0);
    const line: number[] = [];
    const len = range(r, 180, 520);
    for (let s = 0; s < len; s += 14) {
      line.push(x, y);
      a += range(r, -0.25, 0.25);
      x += Math.cos(a) * 14;
      y += Math.sin(a) * 14;
      if (y > y1 + 20) break;
    }
    if (line.length < 6) continue;
    const width = range(r, 8, 22);
    const left: number[] = [];
    const right: number[] = [];
    const nn = line.length / 2;
    for (let i = 0; i < nn; i++) {
      const t = i / (nn - 1);
      const ww = width * (1 - 0.7 * t) * 0.5;
      const ax = line[Math.max(0, i - 1) * 2] as number;
      const ay = line[Math.max(0, i - 1) * 2 + 1] as number;
      const bx = line[Math.min(nn - 1, i + 1) * 2] as number;
      const by = line[Math.min(nn - 1, i + 1) * 2 + 1] as number;
      const l = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / l;
      const ny = (bx - ax) / l;
      left.push((line[i * 2] as number) + nx * ww, (line[i * 2 + 1] as number) + ny * ww);
      right.unshift((line[i * 2] as number) - nx * ww, (line[i * 2 + 1] as number) - ny * ww);
    }
    p.solid([...left, ...right], r() < 0.4 ? m.grainLit : mix(m.body, m.grainLit, 0.4), m.h + 0.08, {
      bark: m.bark,
    });
  }
}

/** A shelf for a one-way: a bracket fungus (hall, cache), a root rung (roots), a snapped stub (night). */
function shelf(p: Paint, m: Material, band: LanternBand, o: OneWay, seed: number, solidDepth = 0): void {
  const r = rngFor(seed, 9);
  const x0 = o.x;
  const x1 = o.x + o.w;
  const cx = (x0 + x1) / 2;
  if (band === 'hall' || band === 'cache') {
    // A bracket: a flat cap whose top is the walk line, gills underneath, its edge lit.
    const depth = Math.max(solidDepth + 8, Math.min(46, 18 + o.w * 0.12));
    const pts: number[] = [];
    for (let x = x0 - 6; x <= x1 + 6; x += 6) pts.push(x, o.y - 1.5 * Math.abs(wobble(x, seed, 40)));
    for (let x = x1 + 6; x >= x0 - 6; x -= 6) {
      const t = (x - x0) / (x1 - x0);
      const sag = Math.sin(Math.PI * clamp(t, 0, 1)) ** 0.6;
      pts.push(x, o.y + 6 + depth * sag * (0.55 + 0.1 * wobble(x, seed + 3, 30)));
    }
    p.solid(chaikin(pts, 1), m.shelf, m.h + 0.15, { moss: 0.35 });
    // Growth bands along the cap (concentric arcs of a bracket seen side on).
    for (let k = 1; k <= 3; k++) {
      const yy = o.y + 4 + k * (depth * 0.16);
      p.solid(
        strip(
          x0 + k * 6,
          x1 - k * 6,
          () => yy,
          0,
          () => 2.2,
          8,
        ),
        k === 1 ? m.shelfLit : mix(m.shelf, m.shelfLit, 0.4),
        m.h + 0.18,
        { moss: 0.5 },
        0.8,
      );
    }
    // Gills: fine dark lines on its belly.
    for (let x = x0 + 8; x < x1 - 8; x += range(r, 5, 9)) {
      const t = (x - x0) / (x1 - x0);
      const sag = Math.sin(Math.PI * t) ** 0.6;
      p.tint(
        [x, o.y + depth * 0.4 * sag, x + 1.4, o.y + depth * 0.4 * sag, x + 1, o.y + depth * 0.62 * sag],
        m.under,
        0.7,
      );
    }
    // Where it grows from: a dark stalk back into the wall behind (a knot of wood).
    p.solid(
      blob(cx, o.y + depth * 0.5, o.w * 0.18, depth * 0.35, seed, 0.3),
      m.bodyDeep,
      m.h - 0.25,
      {},
      0.8,
    );
    return;
  }
  if (band === 'roots') {
    // A root rung: a thick root crossing the gap, sagging a little, its top on the walk line.
    const th = Math.max(solidDepth + 4, range(r, 16, 24));
    const pts = strip(
      x0 - 18,
      x1 + 18,
      (x) => o.y - 1 + 1.5 * wobble(x, seed, 50),
      0,
      (x) => th * (0.7 + 0.3 * Math.sin(Math.PI * clamp((x - x0) / (x1 - x0), 0, 1))),
      6,
    );
    p.solid(chaikin(pts, 1), m.shelf, m.h + 0.12, { bark: 0.6 });
    p.solid(
      strip(
        x0 - 10,
        x1 + 10,
        (x) => o.y + 1 + wobble(x, seed + 2, 40),
        0,
        () => 4,
        6,
      ),
      m.shelfLit,
      m.h + 0.15,
      {
        moss: 0.9,
      },
    );
    return;
  }
  // Night: a snapped branch stub standing out of the log's flank; the top is its broken flat.
  const th = Math.max(solidDepth + 4, range(r, 20, 30));
  const pts = strip(
    x0 - 10,
    x1 + 4,
    (x) => o.y + 1.2 * wobble(x, seed, 30),
    0,
    (x) => th * (0.6 + 0.4 * clamp((x1 - x) / (x1 - x0), 0, 1)),
    6,
  );
  p.solid(chaikin(pts, 1), m.shelf, m.h + 0.1, { bark: 0.8 });
  p.solid(
    strip(
      x0,
      x1,
      (x) => o.y + wobble(x, seed + 4, 30),
      0,
      () => 4,
      6,
    ),
    m.shelfLit,
    m.h + 0.14,
    { moss: 0.9 },
  );
}

/**
 * What a shelf hangs from: two or three roots (silk in the hall) from its top up to the solid above it, or up
 * out of sight into the dark. Back plane (little relief: never a ledge).
 */
function hangers(
  p: Paint,
  m: Material,
  band: LanternBand,
  x0: number,
  x1: number,
  y: number,
  solids: readonly SolidRect[],
  seed: number,
): void {
  const r = rngFor(seed, 31);
  const n = x1 - x0 > 160 ? 3 : 2;
  for (let k = 0; k < n; k++) {
    const x = x0 + (x1 - x0) * (n === 2 ? 0.2 + 0.6 * k : 0.15 + 0.35 * k) + range(r, -10, 10);
    let top = y - 900;
    for (const s of solids)
      if (x >= s.x && x <= s.x + s.w && s.y + s.h <= y - 8 && s.y + s.h > top) top = s.y + s.h;
    const w = band === 'hall' || band === 'cache' ? range(r, 1.6, 2.6) : range(r, 3, 6);
    const pts: number[] = [];
    const back: number[] = [];
    const lean = range(r, -30, 30);
    for (let yy = top; yy <= y + 2; yy += 16) {
      const t = (yy - top) / Math.max(1, y - top);
      const xx = x + lean * (1 - t) * (1 - t) + 3 * wobble(yy, seed + k, 60);
      const ww = w * (1 + 0.6 * (1 - t));
      pts.push(xx - ww, yy);
      back.unshift(xx + ww, yy);
    }
    if (pts.length < 4) continue;
    p.solid(
      [...pts, ...back],
      band === 'hall' || band === 'cache' ? mix(m.shelfLit, m.body, 0.55) : m.body,
      0.25,
      {
        bark: 0.5,
      },
      0.9,
    );
  }
}

/** The room's exposed tops (static solids), for the pieces that lie on them (the roots' water). */
export function lanternTops(room: Room): Run[] {
  const solids = room.solids.filter((s) => s.tag !== 'pool');
  return findRuns(new Grid(room.width, room.height, solids)).tops;
}

/** Paints the room. Returns the paint for the bake, the playfield's info and the plan the rim / growth / pieces read. */
export function paintLanternTerrain(
  room: Room,
  seed: number,
  band: LanternBand,
): { paint: Paint; info: TerrainInfo; plan: LanternPlan } {
  const m = MATS[band];
  const W = room.width;
  const H = room.height;
  const p = new Paint(W, H);
  const solids = room.solids.filter((s) => s.tag !== 'pool');
  const g = new Grid(W, H, solids);
  const runs = findRuns(g);
  // Long tops roll a hair (render only): never a ruler, always within ~2 px of the collision.
  const topAt = (run: Run, x: number): number => run.y - 1 - 1.2 * Math.abs(wobble(x, seed + run.y, 130));

  // 0. Small rects alone in the air are shelves, not slabs: a bracket fungus in the hall, a root rung below,
  // a snapped stub outside, each hung from what is above it on roots / silk (never a floating brick).
  const touches = (a: SolidRect, b: SolidRect): boolean =>
    a.x <= b.x + b.w + 8 && b.x <= a.x + a.w + 8 && a.y <= b.y + b.h + 8 && b.y <= a.y + a.h + 8;
  const isolated = new Set<SolidRect>();
  for (const s of solids) {
    if (s.h > 72 || s.w > 520 || s.x <= 0 || s.x + s.w >= W) continue;
    if (solids.some((o) => o !== s && touches(s, o))) continue;
    isolated.add(s);
  }
  for (const s of isolated) {
    const sd = seed + s.x * 5 + s.y;
    shelf(p, m, band, { x: s.x, y: s.y, w: s.w, tag: s.tag }, sd, s.h);
    hangers(p, m, band, s.x, s.x + s.w, s.y, solids, sd);
  }
  for (const o of room.oneWays) hangers(p, m, band, o.x, o.x + o.w, o.y, solids, seed + o.x);

  // 1. The bodies: every rect, seams covered by the neighbours.
  solids.forEach((s, i) => {
    if (isolated.has(s)) return;
    const sd = seed + i * 31 + s.x;
    const pts = rectOutline(s, g, m, sd, W, H);
    p.solid(pts, m.body, m.h, { bark: m.bark * 0.6 });
  });

  // 2. Depth: away from the open edges the body sinks into the dark (HK's caves: the silhouette is the
  // shape, the material lives in a band along the edges). Stepped soft insets toward the deep colour.
  for (const s of solids) {
    if (isolated.has(s)) continue;
    for (let k = 1; k <= 4; k++) {
      const inset = 26 * k;
      if (s.w <= inset * 2 + 8 || s.h <= inset * 2 + 8) break;
      const x0 = s.x <= 0 ? -200 : s.x + inset;
      const x1 = s.x + s.w >= W ? W + 200 : s.x + s.w - inset;
      const y0 = s.y + inset;
      const y1 = s.y + s.h >= H ? H + 200 : s.y + s.h - inset;
      p.tint([x0, y0, x1, y0, x1, y1, x0, y1], m.bodyDeep, 0.2);
    }
  }

  // 3. The edge band: the material, along every open edge, fading inward.
  const grainNear = (x: number, y: number, reach: number): boolean => {
    // Within `reach` px of open air (a face, a top, an underside)?
    for (const [dx, dy] of [
      [reach, 0],
      [-reach, 0],
      [0, reach],
      [0, -reach],
    ] as const)
      if (!g.solidAt(x + dx, y + dy)) return true;
    return false;
  };
  const onShelf = (run: Run): boolean =>
    [...isolated].some(
      (s) => run.x0 >= s.x - 1 && run.x1 <= s.x + s.w + 1 && run.y >= s.y - 1 && run.y1 <= s.y + s.h + 1,
    );
  for (const run of runs.faces) {
    const len = run.y1 - run.y;
    if (len < 16 || onShelf(run)) continue;
    const sd = seed + run.x0 * 3 + run.y;
    const r = rngFor(sd, 4);
    const dir = run.side === 'e' ? -1 : 1;
    const lit = run.side === 'e';
    // Bands of value inward from the face, ragged.
    for (let k = 0; k < 3; k++) {
      const depth = 14 + k * 16;
      const pts: number[] = [];
      for (let y = run.y; y <= run.y1; y += 8) pts.push(run.x0 + dir * 1, y);
      for (let y = run.y1; y >= run.y; y -= 8)
        pts.push(run.x0 + dir * depth * (0.7 + 0.3 * Math.abs(wobble(y, sd + k, 50))), y);
      p.tint(pts, lit ? m.grainLit : mix(m.body, m.grainLit, 0.5), lit ? 0.2 : 0.12);
    }
    // Fibres along the face (the grain shows where the wood breaks off): short strokes parallel to it.
    for (let y = run.y + range(r, 4, 20); y < run.y1 - 10; y += range(r, 8, 22)) {
      const d = range(r, 3, 30);
      const l = range(r, 18, 70);
      const xx = run.x0 + dir * d;
      const w = range(r, 1.4, 3);
      p.solid(
        [xx - w, y, xx + w, y, xx + w * 0.4, Math.min(run.y1, y + l), xx - w * 0.4, Math.min(run.y1, y + l)],
        r() < 0.4 ? m.grainLit : m.grain,
        m.h + (r() < 0.5 ? 0.06 : -0.08),
        { bark: m.bark },
        0.7 * (1 - d / 40),
      );
    }
    // Splinters and fibres sticking out of the face a few px (decor: never more than a hair into the air).
    for (let y = run.y + range(r, 20, 60); y < run.y1 - 20; y += range(r, 40, 120)) {
      const l = range(r, 5, 12);
      const a = range(r, -0.5, 0.5);
      const ox = run.x0 - dir * 2;
      p.solid(
        [ox, y - 2, ox - dir * l, y + Math.sin(a) * l, ox, y + 3],
        r() < 0.5 ? m.grainLit : m.body,
        m.h,
        { bark: m.bark },
      );
    }
  }
  // The night log's flank: plates of bark running along it under every top, their upper edges catching the moon,
  // fading into the dark lower down (a fallen giant's bark, not a block).
  if (band === 'night') {
    for (const run of runs.tops) {
      if (run.x1 - run.x0 < 40) continue;
      const sd = seed + run.x0 * 11 + run.y;
      const r = rngFor(sd, 12);
      for (let yy = run.y + 22, row = 0; row < 9; yy += range(r, 14, 22), row++) {
        let x = run.x0 + range(r, -30, 10);
        const fade = 1 - row / 9;
        while (x < run.x1) {
          const len = range(r, 70, 260);
          const x1 = Math.min(run.x1, x + len);
          if (grainNear((x + x1) / 2, yy, 80)) {
            const th = range(r, 6, 13);
            const base = (xx: number): number => yy + 3 * wobble(xx, sd + row, 90);
            // The plate, a dark fissure under it, a moonlit lip on top.
            p.solid(
              strip(x, x1, base, 0, (xx) => th * Math.sin(Math.PI * clamp((xx - x) / len, 0, 1)) ** 0.4, 12),
              m.body,
              m.h + 0.06,
              { bark: 1 },
              0.9,
            );
            p.solid(
              strip(
                x + 6,
                x1 - 6,
                (xx) => base(xx) + th * 0.85,
                0,
                () => 2.2,
                14,
              ),
              m.grain,
              m.h - 0.1,
              { bark: 1 },
              0.8 * fade,
            );
            p.solid(
              strip(x + 4, x1 - 4, base, -0.5, () => 1.8, 14),
              m.grainLit,
              m.h + 0.1,
              { bark: 0.6 },
              0.75 * fade,
            );
          }
          x += len + range(r, 4, 26);
        }
      }
    }
  }
  // Fibre strata along the tops' upper face (the hall's grain runs across), near the edges only.
  if (band !== 'roots' && band !== 'night') {
    for (const run of runs.tops) {
      if (run.x1 - run.x0 < 24) continue;
      const sd = seed + run.x0 * 7 + run.y;
      const r = rngFor(sd, 8);
      for (let k = 0; k < 7; k++) {
        const yy = run.y + 16 + k * range(r, 7, 12);
        let x = run.x0 + range(r, -20, 30);
        while (x < run.x1) {
          const len = range(r, 40, 200);
          const x1 = Math.min(run.x1, x + len);
          if (grainNear((x + x1) / 2, yy, 60)) {
            const th = range(r, 1.6, 4);
            p.solid(
              strip(
                x,
                x1,
                (xx) => yy + 2 * wobble(xx, sd + k, 60),
                0,
                (xx) => th * Math.sin(Math.PI * clamp((xx - x) / len, 0, 1)) ** 0.5,
                10,
              ),
              r() < 0.3 ? m.grainLit : m.grain,
              m.h - 0.06,
              { bark: m.bark },
              0.55 * (1 - k / 8),
            );
          }
          x += len + range(r, 10, 50);
        }
      }
    }
  } else {
    for (const s of solids) {
      const sd = seed + s.x * 3 + s.y;
      cords(
        p,
        m,
        Math.max(s.x, -40),
        Math.min(s.x + s.w, W + 40),
        Math.max(s.y, 0),
        Math.min(s.y + s.h, s.y + 220),
        sd,
      );
    }
  }

  // 3b. The lip band: the upper face under every top is a step lighter (lamp or moon catches it), fading down.
  for (const run of runs.tops) {
    if (run.x1 - run.x0 < 16) continue;
    const sd = seed + run.x0 * 13 + run.y;
    for (let k = 0; k < 4; k++) {
      const depth = 22 + k * 18;
      p.tint(
        strip(
          run.x0 + 2,
          run.x1 - 2,
          (x) => topAt(run, x),
          0,
          (x) => depth * (0.7 + 0.3 * Math.abs(wobble(x, sd + k, 60))),
          8,
        ),
        m.grainLit,
        0.2,
      );
    }
  }

  // 4. The tops: a skin of moss / fungus along every exposed top, its lower edge ragged, lit at the lip.
  for (const run of runs.tops) {
    if (run.x1 - run.x0 < 8) continue;
    const sd = seed + run.x0 + run.y * 7;
    const deep = band === 'night' ? 22 : band === 'roots' ? 14 : 12;
    p.solid(
      strip(
        run.x0 - 4,
        run.x1 + 4,
        (x) => topAt(run, x),
        -1,
        (x) =>
          deep * (0.45 + 0.55 * Math.abs(wobble(x, sd, 34))) + (x - run.x0 < 10 || run.x1 - x < 10 ? -4 : 0),
        5,
      ),
      m.top,
      m.h + 0.12,
      { moss: 1 },
    );
    p.solid(
      strip(
        run.x0 - 2,
        run.x1 + 2,
        (x) => topAt(run, x),
        -0.5,
        (x) => 3 + 2 * Math.abs(wobble(x, sd + 9, 20)),
        5,
      ),
      m.topLit,
      m.h + 0.16,
      { moss: 1 },
    );
    // Cushions of moss / caps of fungus standing a few px over the line here and there.
    const r = rngFor(sd, 1);
    for (let x = run.x0 + range(r, 10, 60); x < run.x1 - 10; x += range(r, 40, 140)) {
      const w = range(r, 8, 22);
      p.solid(
        blob(x, topAt(run, x) + 1, w, range(r, 3, 6), sd + x, 0.3, 12),
        m.topLit,
        m.h + 0.2,
        { moss: 1 },
        0.9,
      );
    }
  }

  // 5. Undersides: darkness tucked under every lip; torn fibre / root tips hang a little.
  for (const run of runs.unders) {
    if (run.x1 - run.x0 < 16) continue;
    const sd = seed + run.x0 * 5 + run.y;
    p.tint(
      strip(
        run.x0 + 6,
        run.x1 - 6,
        () => run.y,
        -38,
        (x) => -4 + 6 * Math.abs(wobble(x, sd, 40)),
        8,
      ),
      m.under,
      0.55,
    );
    const r = rngFor(sd, 2);
    for (let x = run.x0 + range(r, 10, 40); x < run.x1 - 10; x += range(r, 24, 70)) {
      const len = range(r, 10, band === 'roots' ? 60 : 34);
      const w = range(r, 3, 7);
      p.solid(
        [x - w, run.y - 6, x + w, run.y - 6, x + w * 0.2, run.y + len, x - w * 0.3, run.y + len * 0.9],
        m.body,
        m.h - 0.05,
        {
          bark: m.bark,
        },
      );
    }
  }

  // 7. Shelves (one-ways).
  room.oneWays.forEach((o, i) => {
    shelf(p, m, band, o, seed + i * 97 + o.x);
  });

  const allTops = [...room.solids, ...room.oneWays.map((o) => ({ ...o, h: 0 }))];
  const info: TerrainInfo = {
    tops: runs.tops.map((t) => ({
      x0: t.x0,
      x1: t.x1,
      y: t.y,
      kind: 'branch' as const,
      freeL: true,
      freeR: true,
    })),
    unders: runs.unders.map((u) => ({ x0: u.x0, x1: u.x1, y: () => u.y, kind: 'branch' as const })),
    faces: [],
    twigs: [],
    ivy: [],
    keepClear: [],
    clearSpots: [],
    covered: [],
    lee: [],
    lanterns: [],
    noGlow: [],
    calm: [],
    hangers: [],
    pockets: [],
    mist: [],
    pool: null,
    groundY: (x: number): number => {
      let y = H;
      for (const q of allTops) if (x >= q.x && x < q.x + q.w && q.y < y) y = q.y;
      return y;
    },
  };
  const plan: LanternPlan = {
    band,
    tops: runs.tops,
    unders: runs.unders,
    faces: runs.faces,
    shelves: room.oneWays.slice(),
    topAt,
    solid: (x, y) => g.solidAt(x, y),
  };
  return { paint: p, info, plan };
}
