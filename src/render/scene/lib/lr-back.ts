/**
 * Lanternroot's backdrops inside the giant (docs/design/levels/proto-1.md §8, review proto-1 r1 §5): composed in
 * layer coordinates, baked and lit by the shared atmosphere pass (bg-bake.ts). Depth by atmosphere, as in the
 * Ginso Tree or the City of Tears: the farther, the paler and hazier (lamp-lit air), the nearer, the darker and
 * sharper, so the hollow has a value structure from the near dark to the glowing distance.
 *
 *   hall   far0  the hollow going on past sight: its ring-ribs pale in the lamp haze, strings of far lamps
 *          far1  nearer ribs, darker, their flanks lit, more strings of lamps sagging between them
 *          far2  the far inner wall: great ribs (the trunk's rings, seen from inside a log lying on its side, loop
 *                from the floor over the vault), ring grain between them, knotholes, cracks of moonlight, the
 *                wall warm where the real lamps hang (data: the room's lures)
 *          mid   near-dark heartwood pillars from floor to vault, the vault's hanging lobes, fibre curtains, webs
 *   roots  far0/1 cold haze with root silhouettes, a band of pale mist behind the play so dark shapes read
 *          far2  root masses out of the dark, rim-lit, glowworm threads, bio-light in their knots
 *          mid   near roots, thick and wet, rim light on one flank, curtains of rootlets
 *   cache  the firefly's hoard inside a knot: growth rings round the centrepiece (a bullseye of warm wood), its
 *          glow-cap garlands strung along the rings, little jars in the ring cells, cracks running out like spokes
 *
 * Every placement that has to line up with the room (the lamps' glow on the wall, the moon's patches) maps the
 * room point into the layer for the chamber camera that shows it (`Placer`), so moved geometry still reads.
 */
import { Container, Graphics } from 'pixi.js';
import type { Room } from '../../../scene/room';
import type { LayerRect } from '../layer-tree';
import type { Atmosphere, FogSpec, ZoneSpec } from './bg-bake';
import { LightMap } from './bg-bake';
import { blob, fbm1, type Rng, rr, TAU } from './bg-shapes';
import { mix, prng } from './look';
import type { LanternBand } from './room-look';

type Band = Exclude<LanternBand, 'night'>;

/** Every knob of the interior backdrops. */
export const LR_BACK = {
  /** The screen-space ground (behind everything): stops down the view per band (top, glow band, bottom). */
  sky: {
    hall: [0x060302, 0x1c0f07, 0x2c190c, 0x150b06, 0x070403],
    roots: [0x03060a, 0x0a1620, 0x10202c, 0x0a141c, 0x04080c],
    cache: [0x0a0504, 0x22120a, 0x2e1a0c, 0x160c06, 0x090504],
  } as Record<Band, number[]>,
  /** Live light behind each burning lamp: radius on far2 / mid (layer px), strength, colour. */
  pool: { far: 420, mid: 280, farAlpha: 0.2, midAlpha: 0.12, warm: 0xffa45a, cool: 0xa8c8f0 },
  /** Moonlight on the backdrop behind each moon-hole's shaft: width scale, alpha on far2 / mid. */
  moon: { far: 0.22, mid: 0.16, color: 0xa8c4ec },
  /** Bake scales (texture px per layer px). */
  scale: { deep: 0.5, far: 0.8, mid: 1.2 },
  /** The roots' mist band behind the play: colour, alpha on far1 / far2, height, how far above the floor. */
  mist: { color: 0x2a4a62, far: 0.22, mid: 0.16, h: 420, lift: 140 },
  /** Far lamps (live sprites on far0 / far1): size range (px), alpha. */
  farLamp: { size: [3, 8] as const, alpha: 0.85 },
} as const;

/** Local colours per band (the atmosphere pass fogs and lights them). */
const C = {
  hall: {
    wall: 0x1e130b,
    wallDeep: 0x0e0805,
    rib: 0x2a190e,
    ribLit: 0x6a4224,
    ribDark: 0x120a06,
    grain: 0x170e08,
    grainLit: 0x4a2e1a,
    hole: 0x060302,
    holeLip: 0x5a3820,
    pillar: 0x150c07,
    pillarLit: 0x5a3418,
    curtain: 0x1a0f08,
    silk: 0x9a8670,
    moth: 0x2a1c12,
    moon: 0xa8c4ec,
    lamp: 0xffb060,
  },
  roots: {
    wall: 0x0a141c,
    wallDeep: 0x04080c,
    rib: 0x0c1820,
    ribLit: 0x3a5a6c,
    ribDark: 0x03070a,
    grain: 0x081016,
    grainLit: 0x2a4250,
    hole: 0x010203,
    holeLip: 0x2a4048,
    pillar: 0x050a0e,
    pillarLit: 0x34586a,
    curtain: 0x070d12,
    silk: 0x5a7a84,
    moth: 0x0a1014,
    moon: 0x9fc0e8,
    lamp: 0x9ff3ff,
  },
};

const flat = [1, 1, 1] as const;

function colorsFor(band: Band): (typeof C)['hall'] {
  return band === 'roots' ? C.roots : C.hall;
}

/** Room points mapped into a layer, for the chamber camera that shows them. */
export interface Placer {
  room: Room;
  anchor: { x: number; y: number };
  /** Warm lamps (room px) and how big. */
  lamps: Array<{ x: number; y: number; size: number }>;
  /** Moon-holes: where the light comes in (room px), the opening's width. */
  holes: Array<{ x: number; y: number; w: number }>;
  /** The room's ceiling (under the vault's solids) and floor (the commonest top), room px. */
  ceil: number;
  floor: number;
}

/** The vault's underside in a layer of parallax `f`: where it lines up with the room's ceiling, the camera highest. */
export function vaultAt(P: Placer, f: number): number {
  return P.ceil - (1 - f) * (540 - P.anchor.y);
}

/** The floor in a layer of parallax `f`: where it lines up with the room's floor, the camera lowest. */
export function floorAt(P: Placer, f: number): number {
  return P.floor - (1 - f) * (P.room.height - 540 - P.anchor.y);
}

/** The ceiling and floor of a room: the median underside of solids along the top, the commonest ground top. */
export function ceilFloor(room: Room): { ceil: number; floor: number } {
  const unders = room.solids.filter((s) => s.y <= 0 && s.w >= 200).map((s) => s.y + s.h);
  unders.sort((a, b) => a - b);
  const ceil = unders.length ? (unders[Math.floor(unders.length / 2)] as number) : 0;
  const tops = new Map<number, number>();
  for (const s of room.solids)
    if (s.y > room.height / 2 && s.w >= 200) tops.set(s.y, (tops.get(s.y) ?? 0) + s.w);
  let floor = room.height - 200;
  let best = 0;
  for (const [y, w] of tops)
    if (w > best) {
      best = w;
      floor = y;
    }
  return { ceil, floor };
}

/** The camera centre x that shows room x `px`: its chamber zone's centre (zones lock sideways), else clamped. */
export function chamberCamX(room: Room, px: number): number {
  const z = room.camera?.zones?.find((z) => z.lock && px >= z.x && px < z.x + z.w);
  if (z) return z.x + z.w / 2;
  return Math.max(960, Math.min(room.width - 960, px));
}

/** The camera centre y while she is near room y `py` (its feet a little under the middle), clamped to the room. */
export function chamberCamY(room: Room, py: number): number {
  return Math.max(540, Math.min(room.height - 540, py - 60));
}

/** Room point -> layer point at parallax `f`, for the camera that shows it. */
export function toLayer(P: Placer, px: number, py: number, f: number): { x: number; y: number } {
  return {
    x: px - (1 - f) * (chamberCamX(P.room, px) - P.anchor.x),
    y: py - (1 - f) * (chamberCamY(P.room, py) - P.anchor.y),
  };
}

/** Atmosphere per band and layer (deep0, deep1 = far0, far1; far = far2; mid). */
export function lanternAtm(
  band: Band,
  layer: 'deep0' | 'deep1' | 'far' | 'mid',
  rect: LayerRect,
): Atmosphere {
  const warm = band !== 'roots';
  const depth = layer === 'deep0' ? 3 : layer === 'deep1' ? 2 : layer === 'far' ? 1 : 0;
  // Fog: the farther, the more of the lamp-lit (or cold) air between.
  const fogK = [0.12, 0.34, 0.56, 0.74][depth] as number;
  const fogWarm = [0x160c06, 0x2e1a0c, 0x432614, 0x56331c][depth] as number;
  const fogCold = [0x08121a, 0x14283a, 0x1c3448, 0x24405a][depth] as number;
  return {
    fogColor: warm ? fogWarm : fogCold,
    fogTop: fogK * 0.8,
    fogGround: fogK,
    fogY0: rect.y + rect.h * 0.3,
    fogY1: rect.y + rect.h * 0.9,
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellColor: 0,
    wellStrength: 0,
    formDist: [40, 34, 30, 26][depth] as number,
    formLit: depth === 0 ? 0.6 : 0.45,
    formShade: depth === 0 ? 0.55 : 0.4,
    rimDist: depth === 0 ? 5 : 4,
    rimColor: warm ? 0xffb070 : 0x9fc8ec,
    rimStrength: warm
      ? ([0.45, 0.32, 0.18, 0.1][depth] as number)
      : ([0.22, 0.16, 0.1, 0.06][depth] as number),
    mottle: 0.2,
    litGain: warm ? 1.3 : 1.0,
    sunMix: warm ? 0.5 : 0.4,
    sunColor: warm ? 0xffa860 : 0x8fc0e0,
    sunColorL: warm ? 0xffa860 : 0x8fc0e0,
    sunColorR: warm ? 0xffa860 : 0x8fc0e0,
    zoneParallax: [0.68, 0.42, 0.25, 0.12][depth] as number,
    sideBody: 0.5,
    sideLit: 0.8,
    sideRim: 1,
    tint: flat,
    shadeTint: warm ? [0.45, 0.36, 0.3] : [0.32, 0.4, 0.5],
    gain: 1,
    saturation: 1,
    blur: [1.0, 2.0, 3.2, 4.4][depth] as number,
  };
}

/** A thin veil drifting in front of the layer: lamp haze in the hall, cold mist in the roots. */
export function lanternFog(band: Band, layer: 'deep0' | 'deep1' | 'far' | 'mid', rect: LayerRect): FogSpec {
  const warm = band !== 'roots';
  const depth = layer === 'deep0' ? 3 : layer === 'deep1' ? 2 : layer === 'far' ? 1 : 0;
  return {
    color: warm
      ? ([0x2a1a10, 0x3a2414, 0x4a2c18, 0x5a361c][depth] as number)
      : ([0x122230, 0x1c3242, 0x24405a, 0x2c4c66][depth] as number),
    warm: warm ? 0x5a3418 : 0x22405a,
    yTop: rect.y + rect.h * 0.3,
    yFull: rect.y + rect.h * 0.95,
    alphaTop: 0.1,
    alpha: [0.22, 0.26, 0.3, 0.34][depth] as number,
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellAlpha: 0,
    scale: depth >= 2 ? 1 / 1300 : depth === 1 ? 1 / 1000 : 1 / 700,
    speed: [0.045, 0.03, 0.02, 0.014][depth] as number,
    wisp: 0.8,
  };
}

export function lanternZone(band: Band, parallax: number): Omit<ZoneSpec, 'anchorX'> {
  const mist = band === 'roots' ? 0x0c161e : 0x2a1a10;
  return { parallax, tintL: flat, tintR: flat, mistL: mist, mistR: mist };
}

// ------------------------------------------------------------------------------------------------------------
// Shapes
// ------------------------------------------------------------------------------------------------------------

/** A ribbon along a polyline: width from `w(t)` (t 0..1 along it). */
function ribbon(line: number[], w: (t: number) => number): number[] {
  const nn = line.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < nn; i++) {
    const t = nn > 1 ? i / (nn - 1) : 0;
    const ww = w(t) / 2;
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
  return [...left, ...right];
}

/**
 * A rib of the giant's insides seen from within a log on its side: a growth ring's exposed band, looping from the
 * floor up over the vault. A bundle of fibres bowing toward us, flared into the floor (roots of it) and fanning into
 * the vault; grooves run along it, and the flank toward the lamps catches warm light.
 */
function rib(
  g: Graphics,
  L: LightMap | null,
  x: number,
  y0: number,
  y1: number,
  w: number,
  bow: number,
  r: Rng,
  col: { rib: number; ribLit: number; ribDark: number },
  litSide: number,
  lit: number,
): void {
  const nz = fbm1(Math.floor(r() * 1000));
  const n = Math.max(10, Math.round((y1 - y0) / 24));
  const line: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    line.push(x + bow * Math.sin(Math.PI * t) + nz(t * 2.1) * w * 0.25, y0 + (y1 - y0) * t);
  }
  const width = (t: number): number =>
    w *
    (0.8 + 0.35 * Math.exp(-((t / 0.13) ** 2)) + 0.9 * Math.exp(-(((1 - t) / 0.1) ** 2))) *
    (0.85 + 0.25 * nz(t * 6 + 4));
  if (L) L.reset(x + bow * 0.6, (y0 + y1) / 2, w * 1.2, (y1 - y0) / 2, 0.85);
  g.poly(ribbon(line, width)).fill(col.rib);
  // The fibres in the bundle: grooves and ridges along it.
  const strands = 3 + Math.floor(r() * 3);
  for (let k = 0; k < strands; k++) {
    const off = (k + 0.5) / strands - 0.5;
    const sl: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      sl.push((line[i * 2] as number) + off * width(t) * 0.8, line[i * 2 + 1] as number);
    }
    g.poly(ribbon(sl, (t) => width(t) * rr(r, 0.04, 0.09))).fill(
      k % 2 ? col.ribDark : mix(col.rib, col.ribLit, 0.25),
    );
  }
  // The lit flank: a band down the side toward the light, broken where the fibres part.
  const fl: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    fl.push((line[i * 2] as number) + litSide * width(t) * 0.42, line[i * 2 + 1] as number);
  }
  g.poly(ribbon(fl, (t) => width(t) * 0.14 * (0.6 + 0.4 * Math.abs(nz(t * 9 + 1))))).fill(col.ribLit);
  // The shadow flank.
  const sh: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    sh.push((line[i * 2] as number) - litSide * width(t) * 0.38, line[i * 2 + 1] as number);
  }
  g.poly(ribbon(sh, (t) => width(t) * 0.22)).fill(col.ribDark);
  if (L && lit > 0) {
    L.lit(x + bow * 0.7 + litSide * w * 0.4, y0 + (y1 - y0) * 0.55, w * 0.5, (y1 - y0) * 0.3, lit);
    L.shade(x + bow * 0.7 - litSide * w * 0.4, y0 + (y1 - y0) * 0.55, w * 0.5, (y1 - y0) * 0.35, 0.35);
  }
}

/** The vault overhead: a dark mass whose lower edge hangs in lobes (fibre bundles sagging), never a ruler. */
function vault(g: Graphics, x0: number, x1: number, y: number, depth: number, color: number, r: Rng): void {
  const nz = fbm1(Math.floor(r() * 1000));
  const pts: number[] = [x0, y - 2000];
  for (let x = x0; x <= x1; x += 24) {
    const lobe = Math.max(0, nz(x / 380)) ** 1.5 * depth + Math.abs(nz(x / 90 + 7)) * depth * 0.25;
    pts.push(x, y + lobe);
  }
  pts.push(x1, y - 2000);
  g.poly(pts).fill(color);
}

/** Fibre strands falling from the vault: tapered, in loose clumps. */
function curtain(g: Graphics, x: number, y: number, len: number, n: number, color: number, r: Rng): void {
  for (let k = 0; k < n; k++) {
    const sx = x + rr(r, -40, 40);
    const l = len * rr(r, 0.35, 1);
    const w = rr(r, 2, 7);
    const lean = rr(r, -14, 14);
    g.poly([sx - w, y - 10, sx + w, y - 10, sx + lean + w * 0.2, y + l, sx + lean - w * 0.2, y + l * 0.97]);
  }
  g.fill(color);
}

/** A root descending from above: a tapered ribbon wandering down, with a fork or two. */
function root(
  g: Graphics,
  x: number,
  y0: number,
  len: number,
  w: number,
  r: Rng,
  color: number,
  depth = 0,
): number[] {
  const line: number[] = [];
  let px = x;
  let py = y0;
  let a = Math.PI / 2 + rr(r, -0.35, 0.35);
  const step = 18;
  for (let s = 0; s < len; s += step) {
    line.push(px, py);
    a += rr(r, -0.18, 0.18);
    a = Math.max(0.6, Math.min(Math.PI - 0.6, a));
    px += Math.cos(a) * step;
    py += Math.sin(a) * step;
  }
  if (line.length < 6) return line;
  // (Each filled on its own: a fork over its root in one fill would cut a hole.)
  g.poly(ribbon(line, (t) => w * (1 - t) ** 0.8 + 2.4)).fill(color);
  if (depth < 2 && w > 14) {
    const nn = line.length / 2;
    const forks = 1 + Math.floor(r() * 2);
    for (let k = 0; k < forks; k++) {
      const i = Math.floor(rr(r, 0.25, 0.7) * nn);
      root(
        g,
        line[i * 2] as number,
        line[i * 2 + 1] as number,
        len * rr(r, 0.3, 0.6),
        w * rr(r, 0.35, 0.6),
        r,
        color,
        depth + 1,
      );
    }
  }
  return line;
}

/** A radial web in a corner: spokes and the spiral between them, a moth or two caught. */
function web(
  g: Graphics,
  cx: number,
  cy: number,
  rad: number,
  a0: number,
  a1: number,
  col: number,
  moth: number,
  r: Rng,
): void {
  const spokes = 6 + Math.floor(r() * 4);
  for (let i = 0; i <= spokes; i++) {
    const a = a0 + ((a1 - a0) * i) / spokes;
    g.moveTo(cx, cy).lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  for (let k = 1; k < 7; k++) {
    const rr0 = (rad * k) / 7;
    for (let i = 0; i < spokes; i++) {
      const a = a0 + ((a1 - a0) * i) / spokes;
      const b = a0 + ((a1 - a0) * (i + 1)) / spokes;
      const sag = rr0 * 0.94;
      g.moveTo(cx + Math.cos(a) * rr0, cy + Math.sin(a) * rr0).quadraticCurveTo(
        cx + Math.cos((a + b) / 2) * sag,
        cy + Math.sin((a + b) / 2) * sag,
        cx + Math.cos(b) * rr0,
        cy + Math.sin(b) * rr0,
      );
    }
  }
  g.stroke({ color: col, width: 1.2, alpha: 0.3 });
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = rr(r, a0, a1);
    const d = rr(r, 0.3, 0.9) * rad;
    const mx = cx + Math.cos(a) * d;
    const my = cy + Math.sin(a) * d;
    const s = rr(r, 6, 11);
    g.poly(blob(mx - s * 0.5, my, s * 0.6, s * 0.45, r, 0.2, 10)).fill(moth);
    g.poly(blob(mx + s * 0.5, my, s * 0.6, s * 0.45, r, 0.2, 10)).fill(moth);
    g.ellipse(mx, my, s * 0.22, s * 0.6).fill(mix(moth, col, 0.3));
  }
}

/** A knothole in the wall: the dark hollow, a lit lower lip, the grain swirling round it. */
function knothole(
  g: Graphics,
  x: number,
  y: number,
  rx: number,
  ry: number,
  col: (typeof C)['hall'],
  r: Rng,
): void {
  for (let k = 3; k >= 1; k--) {
    g.poly(blob(x, y, rx * (1 + k * 0.35), ry * (1 + k * 0.3), r, 0.12, 22)).fill(
      k % 2 ? mix(col.grain, col.wall, 0.3) : mix(col.grainLit, col.wall, 0.55),
    );
  }
  g.poly(blob(x, y, rx, ry, r, 0.15, 20)).fill(col.hole);
  // The lip under it catches the light.
  const lip: number[] = [];
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI * (0.15 + 0.7 * (k / 12));
    lip.push(x + Math.cos(a) * rx * 1.05, y + Math.sin(a) * ry * 1.05);
  }
  for (let k = 12; k >= 0; k--) {
    const a = Math.PI * (0.15 + 0.7 * (k / 12));
    lip.push(x + Math.cos(a) * rx * 1.25, y + Math.sin(a) * ry * 1.35);
  }
  g.poly(lip).fill(col.holeLip);
}

/** Where the moonlight cracks sit (layer coords), so the module can make them shimmer. */
export interface Crack {
  x: number;
  y: number;
  len: number;
  a: number;
}

/** A tiny far lamp (layer coords), drawn live: x, y, size, phase. */
export interface FarLamp {
  x: number;
  y: number;
  s: number;
  ph: number;
}

/**
 * The far inner wall (far0): ring grain looping like the ribs, faint great ribs in it, knotholes, cracks of
 * moonlight (one behind each moon-hole, for its chamber camera), warm where the real lamps hang.
 */
function wall(
  g: Graphics,
  L: LightMap,
  rect: LayerRect,
  vaultY: number,
  floor: number,
  col: (typeof C)['hall'],
  r: Rng,
  P: Placer,
  f: number,
  cracks: Crack[],
): void {
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  g.rect(x0, rect.y, rect.w, rect.h).fill(0x2a190d);
  for (let x = x0; x < x1; x += rr(r, 12, 26)) {
    const bow = rr(r, -40, 40);
    const yA = vaultY + rr(r, -60, 160);
    const yB = floor + rr(r, -40, 40);
    g.moveTo(x, yA).quadraticCurveTo(x + bow, (yA + yB) / 2, x + rr(r, -20, 20), yB);
    g.stroke({ color: r() < 0.35 ? 0x4a2e18 : 0x1e1209, width: rr(r, 1.5, 5), alpha: rr(r, 0.3, 0.7) });
  }
  for (let i = 0; i < Math.round(rect.w / 600); i++) {
    knothole(g, rr(r, x0, x1), rr(r, vaultY + 160, floor - 160), rr(r, 14, 34), rr(r, 24, 54), col, r);
  }
  const crackAt = (cx: number, cy: number, len: number): void => {
    const a = Math.PI / 2 + rr(r, -0.35, 0.35);
    const pts: number[] = [];
    const back: number[] = [];
    let px = cx;
    let py = cy;
    for (let s = 0; s <= len; s += 12) {
      const t = s / len;
      const w = 1 + 4 * Math.sin(Math.PI * t) ** 1.5;
      pts.push(px - w, py);
      back.unshift(px + w, py);
      px += Math.cos(a) * 12 + rr(r, -4, 4);
      py += Math.sin(a) * 12;
    }
    g.poly([...pts, ...back]).fill({ color: col.moon, alpha: 0.6 });
    L.reset(cx, cy + len / 2, 50, len * 0.6, 0.9);
    L.lit(cx, cy + len / 2, 60, len * 0.55, 0.5);
    cracks.push({ x: cx, y: cy, len, a });
  };
  for (const h of P.holes) {
    const at = toLayer(P, h.x + rr(r, -160, 160), vaultY + 200, f);
    crackAt(at.x, rr(r, vaultY + 40, vaultY + 200), rr(r, 120, 220));
  }
  for (const l of P.lamps) {
    const at = toLayer(P, l.x, l.y, f);
    L.lit(at.x, at.y + 30, 200 + l.size * 2, 160 + l.size * 2, 0.4);
  }
}

/**
 * Bays of the nave: ribs every `gap` px from floor to vault, and between each pair a pointed arch springing from
 * them up into the vault (the rings looping overhead), so the hollow reads as the inside of a great tree, not
 * curtains. The ribs root into the floor in two or three prongs.
 */
function bays(
  g: Graphics,
  L: LightMap,
  x0: number,
  x1: number,
  vaultY: number,
  floor: number,
  gap: number,
  w: number,
  r: Rng,
  col: { rib: number; ribLit: number; ribDark: number },
  lit: number,
): void {
  const xs: number[] = [];
  for (let x = x0 - rr(r, 0, gap); x < x1 + gap; x += gap * rr(r, 0.8, 1.2)) xs.push(x);
  const spring = vaultY + (floor - vaultY) * 0.3;
  // Arches first (behind the ribs' tops).
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i] as number;
    const b = xs[i + 1] as number;
    const line: number[] = [];
    const apex = vaultY - rr(r, 10, 60);
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      // A pointed arch: two arcs meeting at the apex.
      const u = t < 0.5 ? t * 2 : (1 - t) * 2;
      const y = spring - (spring - apex) * Math.sin((u * Math.PI) / 2) ** 0.8;
      line.push(a + (b - a) * t, y);
    }
    const aw = w * rr(r, 0.4, 0.6);
    g.poly(ribbon(line, (t) => aw * (0.75 + 0.5 * Math.abs(t - 0.5)))).fill(col.rib);
    // Its underside catches the lamp light from below.
    const under = line.map((v, j) => (j % 2 ? v + aw * 0.36 : v));
    g.poly(ribbon(under, () => aw * 0.12)).fill(col.ribLit);
  }
  for (const x of xs) {
    const ww = w * rr(r, 0.8, 1.25);
    const side = r() < 0.5 ? -1 : 1;
    rib(g, L, x, spring - 40, floor + 30, ww, rr(r, -1, 1) * ww * 0.25, r, col, side, lit);
    // Roots of it: prongs spreading over the floor.
    const prongs = 2 + Math.floor(r() * 2);
    for (let k = 0; k < prongs; k++) {
      const dir = k % 2 ? 1 : -1;
      const line: number[] = [];
      const len = rr(r, ww * 0.8, ww * 1.8);
      for (let j = 0; j <= 10; j++) {
        const t = j / 10;
        line.push(x + dir * (ww * 0.3 + len * t), floor - ww * 0.9 * (1 - t) ** 1.6 + 20 * t);
      }
      g.poly(ribbon(line, (t) => ww * 0.32 * (1 - t) + 3)).fill(col.rib);
    }
  }
}

// ------------------------------------------------------------------------------------------------------------
// The deep layers (far0, far1)
// ------------------------------------------------------------------------------------------------------------

/**
 * far0 / far1: the hollow going on beyond sight. Ribs looping floor to vault in the haze (paler the farther), a far
 * floor, the vault's lobes, and strings of small lamps sagging between the ribs (returned, drawn live).
 */
export function buildLanternDeep(
  band: Band,
  depth: 0 | 1,
  rect: LayerRect,
  floorY: number,
  seed: number,
  P: Placer,
): { content: Container; lights: LightMap; lamps: FarLamp[]; cracks: Crack[] } {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const L = new LightMap();
  const col = colorsFor(band);
  const r = prng(seed * 17 + 11 + depth * 101);
  const lamps: FarLamp[] = [];
  const cracks: Crack[] = [];
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  const top = rect.y;
  const far = depth === 0;
  // How tall the hollow stands at this depth (farther: the ribs smaller, the vault lower in the frame).
  const f = far ? 0.12 : 0.25;
  const vaultY = vaultAt(P, f);
  const floor = floorAt(P, f) + (far ? 30 : 50);
  void floorY;
  if (band === 'roots') {
    // Root silhouettes in cold haze, the floor a pale mist bank behind the play.
    const n = Math.round(rect.w / (far ? 200 : 300));
    for (let i = 0; i < n; i++) {
      root(
        g,
        rr(r, x0, x1),
        top - 40,
        rr(r, rect.h * 0.4, rect.h * 0.95),
        rr(r, 30, 80) * (far ? 0.6 : 1),
        r,
        far ? 0x0e1c26 : 0x0a141c,
      );
    }
    // Far glowworm threads and bio-light: specks of cyan.
    for (let i = 0; i < Math.round(rect.w / (far ? 90 : 140)); i++) {
      lamps.push({
        x: rr(r, x0, x1),
        y: rr(r, top + rect.h * 0.1, floor - 80),
        s: rr(r, 1.5, far ? 3 : 4.5),
        ph: r() * TAU,
      });
    }
    L.lit((x0 + x1) / 2, floor - 120, rect.w, 220, 0.35);
    return { content: c, lights: L, lamps, cracks };
  }
  if (far) wall(g, L, rect, vaultY, floor, col, r, P, f, cracks);
  // The far floor of the hollow: a dark bank curving up into the ribs.
  const nzF = fbm1(Math.floor(r() * 1000));
  const fl: number[] = [x0, floor + 2000];
  for (let x = x0; x <= x1; x += 30) fl.push(x, floor + nzF(x / 500) * 30);
  fl.push(x1, floor + 2000);
  g.poly(fl).fill(far ? 0x24150b : 0x1c1009);
  // Ribs and the arches between them: a steady rhythm (a nave), each a little different.
  bays(
    g,
    L,
    x0,
    x1,
    vaultY,
    floor,
    far ? 420 : 560,
    far ? 54 : 84,
    r,
    far
      ? { rib: 0x2e1b0e, ribLit: 0x5a3820, ribDark: 0x1c1008 }
      : { rib: 0x24150b, ribLit: 0x6a4224, ribDark: 0x140b06 },
    far ? 0.3 : 0.45,
  );
  vault(g, x0, x1, vaultY, far ? 70 : 120, far ? 0x1e1209 : 0x150c07, r);
  // Strings of the firefly's lamps going on into the distance: a sagging silk with lamps along it.
  const strings = Math.round(rect.w / (far ? 500 : 700));
  for (let k = 0; k < strings; k++) {
    const sx = rr(r, x0, x1 - 300);
    const span = rr(r, 260, far ? 520 : 720);
    const sy = rr(r, vaultY + 60, vaultY + (floor - vaultY) * 0.55);
    const sag = rr(r, 40, 120);
    g.moveTo(sx, sy).quadraticCurveTo(sx + span / 2, sy + sag * 2, sx + span, sy + rr(r, -30, 30));
    g.stroke({ color: far ? 0x4a3220 : 0x5a3c26, width: far ? 1 : 1.4, alpha: 0.5 });
    const each = far ? rr(r, 50, 80) : rr(r, 70, 110);
    for (let t = rr(r, 0.05, 0.15); t < 0.95; t += each / span) {
      const lx = sx + span * t;
      const ly = sy + 4 * t * (1 - t) * sag + rr(r, 6, 14);
      lamps.push({
        x: lx,
        y: ly,
        s: rr(r, LR_BACK.farLamp.size[0], LR_BACK.farLamp.size[1]) * (far ? 0.6 : 1),
        ph: r() * TAU,
      });
      L.lit(lx, ly, far ? 90 : 130, far ? 70 : 100, 0.35);
    }
  }
  // The glow of the whole display hangs in the middle of the hollow.
  L.lit((x0 + x1) / 2, vaultY + (floor - vaultY) * 0.45, rect.w, (floor - vaultY) * 0.35, far ? 0.4 : 0.3);
  L.shade((x0 + x1) / 2, vaultY - 100, rect.w, 240, 0.5);
  return { content: c, lights: L, lamps, cracks };
}

// ------------------------------------------------------------------------------------------------------------
// far2
// ------------------------------------------------------------------------------------------------------------

/** The far inner wall of the hall / the cache's rings, or the roots' far masses. */
export function buildLanternFar(
  band: Band,
  rect: LayerRect,
  floorY: number,
  seed: number,
  P: Placer,
): { content: Container; lights: LightMap; cracks: Crack[]; lamps: FarLamp[] } {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const L = new LightMap();
  const col = colorsFor(band);
  const r = prng(seed * 7 + 3);
  const cracks: Crack[] = [];
  const lamps: FarLamp[] = [];
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  const y0 = rect.y;
  const f = 0.42;
  if (band === 'roots') {
    g.rect(x0, y0, rect.w, rect.h).fill({ color: col.wall, alpha: 0 });
    // Root masses out of the dark above, rim-lit on one flank.
    for (let k = 0; k < 3; k++) {
      const n = Math.round(rect.w / (300 - k * 60));
      for (let i = 0; i < n; i++) {
        const x = rr(r, x0, x1);
        const w = rr(r, 30, 90) * (1 + k * 0.3);
        const line = root(g, x, y0 - 40, rr(r, 500, rect.h * 0.95), w, r, mix(0x0c1820, 0x050a0e, k * 0.4));
        if (line.length > 8 && k === 2) {
          // A thin cold rim down its lit flank.
          const rim: number[] = [];
          for (let j = 0; j < line.length; j += 2)
            rim.push((line[j] as number) + w * 0.38 * (1 - j / line.length), line[j + 1] as number);
          g.poly(ribbon(rim, (t) => 2.2 * (1 - t) + 0.5)).fill({ color: col.ribLit, alpha: 0.6 });
        }
      }
    }
    // Glowworm beads and bio-light in the knots: drawn live.
    for (let i = 0; i < Math.round(rect.w / 120); i++)
      lamps.push({ x: rr(r, x0, x1), y: rr(r, y0 + 80, floorY - 100), s: rr(r, 2, 5), ph: r() * TAU });
    // Mist pooled low where the water is, a pale bank behind the play: dark shapes read against it.
    for (let x = x0; x < x1; x += 360) L.lit(x + rr(r, 0, 260), floorY - 120, 420, 200, 0.55);
    L.shade(rect.x + rect.w / 2, y0 + rect.h * 0.15, rect.w, rect.h * 0.3, 0.5);
    return { content: c, lights: L, cracks, lamps };
  }
  if (band === 'cache') return buildCacheFar(g, c, L, rect, floorY, r, P, cracks, lamps);
  // --- The hall at far2: the great ribs standing out from the far wall, their arches, the floor bank, the vault.
  const vaultY = vaultAt(P, f);
  bays(g, L, x0, x1, vaultY, floorY + 60, 600, 130, r, col, 0.4);
  const nzF = fbm1(Math.floor(r() * 1000));
  const fl: number[] = [x0, floorY + 2000];
  for (let x = x0; x <= x1; x += 24) fl.push(x, floorY + 20 + nzF(x / 300) * 40);
  fl.push(x1, floorY + 2000);
  g.poly(fl).fill(col.wallDeep);
  vault(g, x0, x1, vaultY, 140, col.wallDeep, r);
  // The ribs are warm where the real lamps hang (their glow, for the camera that shows them).
  for (const l of P.lamps) {
    const at = toLayer(P, l.x, l.y, f);
    L.lit(at.x, at.y + 40, 260 + l.size * 3, 220 + l.size * 2, 0.45);
  }
  L.shade(rect.x + rect.w / 2, y0, rect.w, rect.h * 0.22, 0.7);
  return { content: c, lights: L, cracks, lamps };
}

/** The cache: the firefly's hoard inside a knot. Growth rings round the centrepiece, garlands, jars, spokes. */
function buildCacheFar(
  g: Graphics,
  c: Container,
  L: LightMap,
  rect: LayerRect,
  floorY: number,
  r: Rng,
  P: Placer,
  cracks: Crack[],
  lamps: FarLamp[],
): { content: Container; lights: LightMap; cracks: Crack[]; lamps: FarLamp[] } {
  const col = C.hall;
  const x0 = rect.x;
  const y0 = rect.y;
  const marks = P.room.marks as { landmarks?: Array<{ kind: string; x: number; y: number }> } | undefined;
  const centre = marks?.landmarks?.find((l) => l.kind === 'centrepiece') ?? {
    x: P.room.width / 2,
    y: P.room.height / 2,
  };
  const ctr = toLayer(P, centre.x, centre.y, 0.42);
  g.rect(x0, y0, rect.w, rect.h).fill(col.wallDeep);
  // Rings out from the knot's heart: alternating early and late wood, each ring a little wobbly, warmer inward.
  const maxR = Math.hypot(rect.w, rect.h);
  const rings: number[] = [];
  for (let rad = maxR; rad > 30; rad -= rr(r, 26, 64)) rings.push(rad);
  rings.forEach((rad, i) => {
    const t = 1 - rad / maxR;
    const base = mix(0x140b06, 0x4a2c16, t ** 1.4);
    const pts: number[] = [];
    const nz = fbm1(i * 13 + 5);
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * TAU;
      const rr0 = rad * (1 + 0.04 * nz(a * 2) + 0.015 * nz(a * 9 + 3));
      pts.push(ctr.x + Math.cos(a) * rr0 * 1.1, ctr.y + Math.sin(a) * rr0 * 0.92);
    }
    g.poly(pts).fill(i % 2 ? base : mix(base, 0x0a0604, 0.35));
  });
  // Spokes: radial checks out from the heart (the knot dried and split), dark with a lit edge.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + rr(r, -0.2, 0.2);
    const len = rr(r, 300, 800);
    const pts: number[] = [];
    const back: number[] = [];
    for (let s = 60; s <= len; s += 20) {
      const w = 1 + 6 * (1 - s / len);
      const px = ctr.x + Math.cos(a) * s * 1.1 + rr(r, -3, 3);
      const py = ctr.y + Math.sin(a) * s * 0.92 + rr(r, -3, 3);
      pts.push(px - Math.sin(a) * w, py + Math.cos(a) * w);
      back.unshift(px + Math.sin(a) * w, py - Math.cos(a) * w);
    }
    g.poly([...pts, ...back]).fill(col.hole);
  }
  // Ring cells: little hollows along the rings, each with a jar (a warm glow) the firefly keeps.
  rings.forEach((rad, i) => {
    if (rad > 900 || rad < 200 || i % 2) return;
    const n = Math.round((rad * TAU) / 260);
    for (let k = 0; k < n; k++) {
      if (r() < 0.45) continue;
      const a = (k / n) * TAU + rr(r, -0.1, 0.1);
      const px = ctr.x + Math.cos(a) * rad * 1.1;
      const py = ctr.y + Math.sin(a) * rad * 0.92;
      if (py > floorY - 40) continue;
      g.poly(blob(px, py, rr(r, 14, 22), rr(r, 16, 26), r, 0.15, 14)).fill(col.hole);
      g.roundRect(px - 5, py - 4, 10, 14, 3).fill(0x8a5a2a);
      lamps.push({ x: px, y: py + 3, s: rr(r, 3, 6), ph: r() * TAU });
      L.lit(px, py, 60, 60, 0.4);
    }
  });
  // Garlands of glow-caps strung along the rings.
  for (const rad of [380, 560, 760]) {
    const a0 = rr(r, Math.PI * 1.05, Math.PI * 1.3);
    const a1 = rr(r, Math.PI * 1.7, Math.PI * 1.95);
    const pts: number[] = [];
    for (let k = 0; k <= 40; k++) {
      const a = a0 + ((a1 - a0) * k) / 40;
      const sag = Math.sin((Math.PI * k) / 40) * 30;
      pts.push(ctr.x + Math.cos(a) * rad * 1.1, ctr.y + Math.sin(a) * rad * 0.92 + sag);
    }
    for (let k = 0; k < pts.length - 2; k += 2)
      g.moveTo(pts[k] as number, pts[k + 1] as number).lineTo(pts[k + 2] as number, pts[k + 3] as number);
    g.stroke({ color: col.silk, width: 1.3, alpha: 0.5 });
    for (let k = 2; k < pts.length - 2; k += 6) {
      lamps.push({ x: pts[k] as number, y: (pts[k + 1] as number) + 6, s: rr(r, 4, 7), ph: r() * TAU });
      L.lit(pts[k] as number, pts[k + 1] as number, 50, 50, 0.4);
    }
  }
  // The heart glows: warm all round the centrepiece, dark toward the edges (a vignette to the jar).
  L.lit(ctr.x, ctr.y, 700, 600, 0.6);
  L.shade(ctr.x, y0, rect.w, 260, 0.6);
  // The moon-hole above: a crack of silver.
  for (const h of P.holes) {
    const at = toLayer(P, h.x, h.y + 60, 0.42);
    cracks.push({ x: at.x, y: at.y, len: 180, a: Math.PI / 2 });
  }
  return { content: c, lights: L, cracks, lamps };
}

// ------------------------------------------------------------------------------------------------------------
// mid
// ------------------------------------------------------------------------------------------------------------

/** The nearer structures: heartwood pillars, the vault's lobes, fibre curtains and webs; or near roots. */
export function buildLanternMid(
  band: Band,
  rect: LayerRect,
  _floorY: number,
  seed: number,
  P: Placer,
): { content: Container; lights: LightMap } {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const L = new LightMap();
  const col = colorsFor(band);
  const r = prng(seed * 11 + 5);
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  const y0 = rect.y;
  const y1 = rect.y + rect.h;
  const f = 0.68;
  if (band === 'roots') {
    // Big wet roots, a few per screen, out of the vault into the water, rim-lit down one flank.
    const n = Math.round(rect.w / 560);
    for (let i = 0; i < n; i++) {
      const x = x0 + (rect.w * (i + rr(r, 0.1, 0.9))) / n;
      const w = rr(r, 60, 130);
      L.reset(x, (y0 + y1) / 2, 160, rect.h / 2, 0.9);
      const line = root(g, x, y0 - 60, rr(r, rect.h * 0.6, rect.h * 1.1), w, r, col.pillar);
      if (line.length > 8) {
        const side = r() < 0.5 ? -1 : 1;
        const rim: number[] = [];
        for (let j = 0; j < line.length; j += 2)
          rim.push(
            (line[j] as number) + side * (w * 0.45 * (1 - j / line.length) + 0.8),
            line[j + 1] as number,
          );
        g.poly(ribbon(rim, (t) => 4 * (1 - t) + 1)).fill(col.pillarLit);
      }
    }
    // Curtains of rootlets.
    for (let i = 0; i < Math.round(rect.w / 200); i++) {
      const x = rr(r, x0, x1);
      for (let k = 0; k < 8; k++)
        root(g, x + rr(r, -40, 40), y0 - 20, rr(r, 200, 600), rr(r, 3, 8), r, col.curtain, 2);
    }
    return { content: c, lights: L };
  }
  // The vault's lobes overhead: fibre bundles sagging from the ceiling, the darkest thing up there.
  const vaultY = vaultAt(P, f);
  vault(g, x0, x1, vaultY, 200, col.pillar, r);
  // Heartwood pillars: near-dark, flared into floor and vault, twisted from two or three bundles.
  const n = Math.max(2, Math.round(rect.w / 1000));
  // (The cache keeps its middle clear: nothing stands in front of the firefly-lamp and its rings.)
  const marks = P.room.marks as { landmarks?: Array<{ kind: string; x: number; y: number }> } | undefined;
  const centre = marks?.landmarks?.find((l) => l.kind === 'centrepiece');
  const keep = centre ? toLayer(P, centre.x, centre.y, f).x : Number.NaN;
  for (let i = 0; i < n; i++) {
    const x = x0 + (rect.w * (i + rr(r, 0.2, 0.8))) / n;
    const w = rr(r, 80, 150);
    const side = r() < 0.5 ? -1 : 1;
    if (Math.abs(x - keep) < 620) continue;
    for (let k = 0; k < 2; k++) {
      rib(
        g,
        k === 0 ? L : null,
        x + (k - 0.5) * w * 0.35,
        vaultY - 80,
        y1 + 40,
        w * (k === 0 ? 0.75 : 0.55),
        (k ? -1 : 1) * rr(r, 20, 50),
        r,
        { rib: col.pillar, ribLit: col.pillarLit, ribDark: 0x080402 },
        side,
        0.4,
      );
    }
    // Brackets of dead fungus on its flank (small, dark, flush: never a ledge).
    for (let k = 0; k < 2; k++) {
      const by = y0 + rect.h * rr(r, 0.3, 0.7);
      for (let j = 0; j < 3; j++) {
        const bx = x + side * (w * 0.4 + j * 4);
        const yy = by + j * 9;
        const bw = rr(r, 10, 18) - j * 3;
        g.poly([bx, yy - 3, bx + side * bw, yy, bx + side * bw * 0.8, yy + 4, bx, yy + 3]).fill(0x24160c);
      }
    }
  }
  // Fibre curtains falling away from the vault.
  for (let i = 0; i < Math.round(rect.w / 160); i++)
    curtain(g, rr(r, x0, x1), vaultY + 40, rr(r, 100, rect.h * 0.35), 6, col.curtain, r);
  // Old webs up under the vault, moths caught in them.
  for (let i = 0; i < Math.round(rect.w / 1100); i++) {
    web(
      g,
      rr(r, x0, x1),
      vaultY + rr(r, 60, 160),
      rr(r, 120, 220),
      rr(r, 0.2, 0.8),
      rr(r, 1.8, 2.8),
      col.silk,
      col.moth,
      r,
    );
  }
  // Lamp-side warmth on the pillars near the real lamps.
  for (const l of P.lamps) {
    const at = toLayer(P, l.x, l.y, f);
    L.lit(at.x, at.y, 200 + l.size * 2, 200 + l.size * 2, 0.35);
  }
  return { content: c, lights: L };
}

/**
 * The room's moon-holes (`marks.moonholes`) with the width of the opening each is in: a ceiling exit's span when
 * the hole is in one (the split, the chimney), else a crack (`crack` px).
 */
export function moonHoles(room: Room, crack = 80): Array<{ x: number; y: number; w: number }> {
  const holes = (room.marks as { moonholes?: Array<{ x: number; y: number }> } | undefined)?.moonholes ?? [];
  return holes.map((h) => {
    const ex = (room.exits ?? []).find((e) => e.edge === 'n' && h.x >= e.from && h.x <= e.to && h.y < 40);
    return ex ? { x: (ex.from + ex.to) / 2, y: h.y, w: ex.to - ex.from } : { x: h.x, y: h.y, w: crack };
  });
}

/**
 * Where light falling straight down from (x, y) lands: the first solid top under it that is ground (thin shelves
 * and one-ways stand in the light, they do not stop it), or the room's bottom.
 */
export function landingY(room: Room, x: number, y: number): number {
  let best = room.height;
  for (const s of room.solids)
    if (s.h >= 48 && x >= s.x && x <= s.x + s.w && s.y > y + 8 && s.y < best) best = s.y;
  return best;
}
