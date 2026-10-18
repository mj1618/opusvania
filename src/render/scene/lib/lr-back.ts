/**
 * Lanternroot's backdrops inside the giant (docs/design/levels/proto-1.md §8): composed in layer
 * coordinates, then baked and lit by the shared atmosphere pass (bg-bake.ts), like the wood's (bg-wood.ts).
 *
 *   hall   far2  the hollow's far inner wall: long fibres running with the fallen trunk (west to east),
 *                splits, a few cracks where silver moonlight gets in, warm light pooled where lamp rows hang
 *          mid   nearer: columns of rotten heartwood from floor to vault, fibre curtains falling away into
 *                the dark, dead bracket fungi (dark and hazed: never a ledge), old webs with trapped moths
 *   roots  far2  root masses descending out of the dark, mist pooled low
 *          mid   nearer roots, thick and wet, curtains of rootlets, the dark between them
 *   cache  the hall's wall, closer and darker, with the firefly's strung glow-caps
 *
 * Positions across are layer x; heights come from the room (the anchor line is the camera's resting y).
 */
import { Container, Graphics } from 'pixi.js';
import type { LayerRect } from '../layer-tree';
import type { Atmosphere, FogSpec, ZoneSpec } from './bg-bake';
import { LightMap } from './bg-bake';
import { blob, fbm1, type Rng, rr, TAU } from './bg-shapes';
import { mix, prng } from './look';
import type { LanternBand } from './room-look';

type Band = Exclude<LanternBand, 'night'>;

/** Every knob of the interior backdrops. */
export const LR_BACK = {
  /** The screen-space ground (behind everything): top and bottom colours per band. */
  sky: {
    hall: [0x0a0605, 0x120b08],
    roots: [0x020407, 0x05090d],
    cache: [0x090605, 0x100a07],
  } as Record<Band, [number, number]>,
  /** Live light behind each burning lamp: radius on far2 / mid (layer px), strength, colour. */
  pool: { far: 380, mid: 260, farAlpha: 0.16, midAlpha: 0.1, warm: 0xffa45a, cool: 0xa8c8f0 },
  /** Moon cracks in the hall's far wall (layer x share, top, length): silver slits. */
  cracks: 4,
  /** Bake scales (texture px per layer px). */
  scale: { far: 0.9, mid: 1.3 },
} as const;

/** Local colours per band (the atmosphere pass fogs and lights them). */
const C = {
  hall: {
    wall: 0x1c120c,
    wallDeep: 0x0d0806,
    fibre: [0x2a1a11, 0x34221a, 0x221510, 0x3d281b] as readonly number[],
    split: 0x060403,
    column: 0x2a1a11,
    columnLit: 0x4a3020,
    curtain: 0x24160e,
    fungus: 0x2e1f15,
    silk: 0x8a7a68,
    moth: 0x2a2018,
    moon: 0x9fb8d8,
  },
  roots: {
    wall: 0x05080b,
    wallDeep: 0x020305,
    fibre: [0x0a0f13, 0x0d1419, 0x081014, 0x101a20] as readonly number[],
    split: 0x010203,
    column: 0x070b0e,
    columnLit: 0x1a2a34,
    curtain: 0x0a1014,
    fungus: 0x0e1418,
    silk: 0x5a7a84,
    moth: 0x0a1014,
    moon: 0x8fb0d8,
  },
};

const flat = [1, 1, 1] as const;

function colorsFor(band: Band): (typeof C)['hall'] {
  return band === 'roots' ? C.roots : C.hall;
}

/** Atmosphere of the far wall / mid structures per band. */
export function lanternAtm(band: Band, layer: 'far' | 'mid', rect: LayerRect): Atmosphere {
  const warm = band !== 'roots';
  const far = layer === 'far';
  return {
    fogColor: warm ? (far ? 0x2a1a10 : 0x1e130c) : far ? 0x0a1218 : 0x060b10,
    fogTop: far ? 0.46 : warm ? 0.4 : 0.3,
    fogGround: far ? 0.54 : warm ? 0.46 : 0.36,
    fogY0: rect.y + rect.h * 0.3,
    fogY1: rect.y + rect.h * 0.9,
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellColor: 0,
    wellStrength: 0,
    formDist: far ? 30 : 44,
    formLit: far ? 0.35 : 0.5,
    formShade: far ? 0.35 : 0.5,
    rimDist: far ? 4 : 5,
    rimColor: warm ? 0xffb070 : 0x9fc0e0,
    rimStrength: warm ? (far ? 0.18 : 0.3) : far ? 0.12 : 0.22,
    mottle: 0.22,
    litGain: warm ? 1.1 : 0.7,
    sunMix: warm ? 0.45 : 0.3,
    sunColor: warm ? 0xffa860 : 0x8fb0d8,
    sunColorL: warm ? 0xffa860 : 0x8fb0d8,
    sunColorR: warm ? 0xffa860 : 0x8fb0d8,
    zoneParallax: far ? 0.42 : 0.68,
    sideBody: 0.5,
    sideLit: 0.8,
    sideRim: 1,
    tint: flat,
    shadeTint: warm ? [0.42, 0.34, 0.3] : [0.3, 0.36, 0.44],
    gain: warm ? 1 : 0.9,
    saturation: 1,
    blur: far ? 2.6 : 1.2,
  };
}

/** A thin veil drifting in front of the layer: lamp haze in the hall, cold mist in the roots. */
export function lanternFog(band: Band, layer: 'far' | 'mid', rect: LayerRect): FogSpec {
  const warm = band !== 'roots';
  const far = layer === 'far';
  return {
    color: warm ? (far ? 0x3a2414 : 0x2a1a10) : far ? 0x14222c : 0x0e1820,
    warm: warm ? 0x4a2c16 : 0x16242e,
    yTop: rect.y + rect.h * 0.35,
    yFull: rect.y + rect.h * 0.95,
    alphaTop: 0.08,
    alpha: far ? 0.26 : warm ? 0.3 : 0.2,
    wellX: 0,
    wellY: 0,
    wellR: 1,
    wellAlpha: 0,
    scale: far ? 1 / 1100 : 1 / 700,
    speed: far ? 0.025 : 0.045,
    wisp: 0.8,
  };
}

export function lanternZone(band: Band, parallax: number): Omit<ZoneSpec, 'anchorX'> {
  const mist = band === 'roots' ? 0x0c161e : 0x2a1a10;
  return { parallax, tintL: flat, tintR: flat, mistL: mist, mistR: mist };
}

/** A long lens of fibre running across (the trunk's grain), its ends tapering to nothing. */
function fibre(g: Graphics, x: number, y: number, len: number, th: number, wav: number, r: Rng): void {
  const pts: number[] = [];
  const back: number[] = [];
  const ph = r() * TAU;
  const n = Math.max(4, Math.round(len / 40));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const xx = x + len * t;
    const yy = y + Math.sin(t * 3 + ph) * wav;
    const w = th * Math.sin(Math.PI * t) ** 0.7;
    pts.push(xx, yy - w / 2);
    back.unshift(xx, yy + w / 2);
  }
  for (let i = 0; i < back.length; i += 2) pts.push(back[i] as number, back[i + 1] as number);
  g.poly(pts);
}

/** A tapered, wandering vertical form: a heartwood column, a root. */
function column(
  g: Graphics,
  x: number,
  y0: number,
  y1: number,
  w0: number,
  w1: number,
  r: Rng,
  wander: number,
): number[] {
  const left: number[] = [];
  const right: number[] = [];
  const nz = fbm1(Math.floor(r() * 1000));
  const n = Math.max(6, Math.round((y1 - y0) / 30));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = y0 + (y1 - y0) * t;
    const cx = x + nz(t * 2.3) * wander;
    // Pinched in the middle like a stretched fibre bundle, flared where it meets floor and vault.
    const flare = 1 + 0.5 * (Math.exp(-((t / 0.12) ** 2)) + Math.exp(-(((1 - t) / 0.12) ** 2)));
    const w = (w0 + (w1 - w0) * t) * flare * (0.85 + 0.25 * nz(t * 7 + 3));
    left.push(cx - w / 2, y);
    right.unshift(cx + w / 2, y);
  }
  const pts = [...left, ...right];
  g.poly(pts);
  return pts;
}

/** A root descending from above: a tapered ribbon wandering down, with a fork or two. */
function root(g: Graphics, x: number, y0: number, len: number, w: number, r: Rng, depth = 0): void {
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
  const nn = line.length / 2;
  if (nn < 3) return;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < nn; i++) {
    const t = i / (nn - 1);
    const ww = (w * (1 - t) ** 0.8 + 1.2) / 2;
    const ax = line[Math.max(0, i - 1) * 2] as number;
    const ay = line[Math.max(0, i - 1) * 2 + 1] as number;
    const bx = line[Math.min(nn - 1, i + 1) * 2] as number;
    const by = line[Math.min(nn - 1, i + 1) * 2 + 1] as number;
    const l = Math.hypot(bx - ax, by - ay) || 1;
    left.push(
      (line[i * 2] as number) - ((by - ay) / l) * ww,
      (line[i * 2 + 1] as number) + ((bx - ax) / l) * ww,
    );
    right.unshift(
      (line[i * 2] as number) + ((by - ay) / l) * ww,
      (line[i * 2 + 1] as number) - ((bx - ax) / l) * ww,
    );
  }
  g.poly([...left, ...right]);
  if (depth < 2 && w > 14) {
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
        depth + 1,
      );
    }
  }
}

/** A radial web in a corner: a few spokes and the spiral between them, a moth or two caught. */
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
  g.stroke({ color: col, width: 1.2, alpha: 0.32 });
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = rr(r, a0, a1);
    const d = rr(r, 0.3, 0.9) * rad;
    const mx = cx + Math.cos(a) * d;
    const my = cy + Math.sin(a) * d;
    const s = rr(r, 6, 11);
    // A moth wrapped where it was caught: two wing lobes and a body, dull.
    g.poly(blob(mx - s * 0.5, my, s * 0.6, s * 0.45, r, 0.2, 10)).fill(moth);
    g.poly(blob(mx + s * 0.5, my, s * 0.6, s * 0.45, r, 0.2, 10)).fill(moth);
    g.ellipse(mx, my, s * 0.22, s * 0.6).fill(mix(moth, col, 0.3));
  }
}

/** Where the moonlight cracks sit (layer coords), so the module can make them shimmer. */
export interface Crack {
  x: number;
  y: number;
  len: number;
  a: number;
}

/** The far wall of the hall / cache, or the roots' far masses. */
export function buildLanternFar(
  band: Band,
  rect: LayerRect,
  floorY: number,
  seed: number,
): { content: Container; lights: LightMap; cracks: Crack[] } {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const L = new LightMap();
  const col = colorsFor(band);
  const r = prng(seed * 7 + 3);
  const cracks: Crack[] = [];
  const x0 = rect.x;
  const x1 = rect.x + rect.w;
  const y0 = rect.y;
  const y1 = rect.y + rect.h;
  // The wall itself: dark everywhere, deepest under the vault and at the floor.
  g.rect(x0, y0, rect.w, rect.h).fill(col.wall);
  if (band === 'roots') {
    // Root masses out of the dark above, the furthest first and faintest.
    for (let k = 0; k < 3; k++) {
      const n = Math.round(rect.w / (260 - k * 50));
      for (let i = 0; i < n; i++) {
        g.fill(mix(col.fibre[k] as number, col.wall, 0.15));
        root(g, rr(r, x0, x1), y0 - 40, rr(r, 500, rect.h * 0.95), rr(r, 30, 90) * (1 + k * 0.3), r);
        g.fill(mix(col.fibre[k] as number, col.wall, 0.1));
      }
    }
    // Faint light low down where water is (the pool's cold sheen far off).
    for (let x = x0; x < x1; x += 400) L.lit(x + rr(r, 0, 300), floorY - 60, 380, 120, 0.25);
    L.shade(rect.x + rect.w / 2, y0 + rect.h * 0.2, rect.w, rect.h * 0.35, 0.6);
  } else {
    // Fibres with the grain, in rows, a little wavy, overlapping: the hollow's rotten inner wall.
    for (let y = y0; y < y1; y += rr(r, 10, 20)) {
      let x = x0 - rr(r, 0, 300);
      while (x < x1) {
        const len = rr(r, 120, 520);
        fibre(g, x, y, len, rr(r, 5, 16), rr(r, 1, 6), r);
        g.fill(col.fibre[Math.floor(r() * col.fibre.length)] as number);
        x += len * rr(r, 0.55, 1.05);
      }
    }
    // Long splits along the grain.
    for (let i = 0; i < Math.round(rect.w / 260); i++) {
      fibre(
        g,
        rr(r, x0, x1),
        rr(r, y0 + rect.h * 0.15, floorY),
        rr(r, 120, 400),
        rr(r, 3, 7),
        rr(r, 1, 4),
        r,
      );
      g.fill(col.split);
    }
    // Under the vault and toward the floor the wall sinks into the dark.
    for (let k = 0; k < 6; k++) {
      g.rect(x0, y0, rect.w, (rect.h * 0.28 * (k + 1)) / 6).fill({ color: col.wallDeep, alpha: 0.16 });
    }
    // Cracks where silver moonlight gets in: jagged diagonal slits, their light a soft halo.
    for (let i = 0; i < LR_BACK.cracks; i++) {
      const cx = x0 + (rect.w * (i + 0.3 + rr(r, -0.15, 0.15))) / LR_BACK.cracks;
      const cy = y0 + rect.h * rr(r, 0.12, 0.3);
      const len = rr(r, 140, 300);
      const a = Math.PI / 2 + rr(r, -0.4, 0.4);
      const pts: number[] = [];
      const back: number[] = [];
      let px = cx;
      let py = cy;
      for (let s = 0; s <= len; s += 14) {
        const t = s / len;
        const w = 1 + 5 * Math.sin(Math.PI * t) ** 1.5;
        pts.push(px - w, py);
        back.unshift(px + w, py);
        px += Math.cos(a) * 14 + rr(r, -5, 5);
        py += Math.sin(a) * 14;
      }
      g.poly([...pts, ...back]).fill(col.moon);
      L.reset(cx, cy + len / 2, 60, len * 0.6, 0.9);
      L.lit(cx, cy + len / 2, 70, len * 0.55, 0.6);
      cracks.push({ x: cx, y: cy, len, a });
    }
    // Warm light pooled along the middle band where lamps hang (static base; live pools ride on it).
    for (let x = x0; x < x1; x += 600) L.lit(x + rr(r, 0, 400), floorY - rect.h * 0.3, 520, 300, 0.4);
    L.shade(rect.x + rect.w / 2, y0, rect.w, rect.h * 0.3, 0.7);
    if (band === 'cache') {
      // The firefly's strung glow-caps: garlands looping across the wall, little warm buds.
      for (let k = 0; k < 4; k++) {
        const gy = y0 + rect.h * rr(r, 0.2, 0.5);
        const gx = rr(r, x0, x1 - 600);
        const span = rr(r, 400, 800);
        g.moveTo(gx, gy).quadraticCurveTo(gx + span / 2, gy + rr(r, 60, 140), gx + span, gy);
        g.stroke({ color: col.silk, width: 1.4, alpha: 0.5 });
        for (let t = 0.1; t < 0.95; t += rr(r, 0.07, 0.12)) {
          const bx = gx + span * t;
          const by = gy + 4 * t * (1 - t) * 100;
          g.ellipse(bx, by + 6, 5, 7).fill(0x9a6a3a);
          L.lit(bx, by + 6, 30, 30, 0.5);
        }
      }
    }
  }
  return { content: c, lights: L, cracks };
}

/** The nearer structures: heartwood columns, fibre curtains, dead brackets and webs; or near roots. */
export function buildLanternMid(
  band: Band,
  rect: LayerRect,
  floorY: number,
  seed: number,
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
  if (band === 'roots') {
    // Big wet roots, a few per screen, out of the vault into the water.
    const n = Math.round(rect.w / 520);
    for (let i = 0; i < n; i++) {
      const x = x0 + (rect.w * (i + rr(r, 0.1, 0.9))) / n;
      L.reset(x, (y0 + y1) / 2, 160, rect.h / 2, 0.9);
      g.fill(col.column);
      root(g, x, y0 - 60, rr(r, rect.h * 0.6, rect.h * 1.1), rr(r, 60, 130), r);
      g.fill(col.column);
      L.lit(x + 30, floorY - rect.h * 0.4, 50, 300, 0.25);
    }
    // Curtains of rootlets.
    for (let i = 0; i < Math.round(rect.w / 180); i++) {
      const x = rr(r, x0, x1);
      for (let k = 0; k < 8; k++) {
        root(g, x + rr(r, -40, 40), y0 - 20, rr(r, 200, 600), rr(r, 3, 8), r, 2);
      }
      g.fill(col.curtain);
    }
    return { content: c, lights: L };
  }
  // Heartwood columns: a few across, wide, flared into floor and vault, pinched between.
  const n = Math.max(2, Math.round(rect.w / 1100));
  for (let i = 0; i < n; i++) {
    const x = x0 + (rect.w * (i + rr(r, 0.2, 0.8))) / n;
    const w = rr(r, 70, 150);
    L.reset(x, (y0 + y1) / 2, w, rect.h / 2, 0.9);
    const pts = column(g, x, y0 - 40, y1 + 40, w, w * rr(r, 0.8, 1.2), r, 40);
    g.fill(col.column);
    void pts;
    // Fibre lines down the column, and a lit flank toward the lamps.
    for (let k = 0; k < 10; k++) {
      const fx = x + rr(r, -w * 0.4, w * 0.4);
      g.moveTo(fx, y0).bezierCurveTo(
        fx + rr(r, -20, 20),
        y0 + rect.h * 0.33,
        fx + rr(r, -20, 20),
        y0 + rect.h * 0.66,
        fx + rr(r, -10, 10),
        y1,
      );
    }
    g.stroke({ color: mix(col.column, col.columnLit, 0.4), width: 2, alpha: 0.5 });
    L.lit(x + w * 0.35, floorY - rect.h * 0.35, w * 0.3, rect.h * 0.3, 0.45);
    L.shade(x - w * 0.3, floorY - rect.h * 0.3, w * 0.3, rect.h * 0.4, 0.4);
    // Dead brackets on its flank: small, dark, flush, in clusters (never a ledge in the walk plane).
    for (let k = 0; k < 2; k++) {
      const by = y0 + rect.h * rr(r, 0.25, 0.75);
      const side = r() < 0.5 ? -1 : 1;
      for (let j = 0; j < 3; j++) {
        const bx = x + side * (w * 0.42 + j * 4);
        const yy = by + j * 9;
        const bw = rr(r, 10, 18) - j * 3;
        g.poly([bx, yy - 3, bx + side * bw, yy, bx + side * bw * 0.8, yy + 4, bx, yy + 3]).fill(col.fungus);
      }
    }
  }
  // Fibre curtains: rotten strands falling away from the vault.
  for (let i = 0; i < Math.round(rect.w / 140); i++) {
    const x = rr(r, x0, x1);
    const len = rr(r, 120, rect.h * 0.45);
    for (let k = 0; k < 6; k++) {
      const sx = x + rr(r, -30, 30);
      const l = len * rr(r, 0.4, 1);
      const w = rr(r, 2, 6);
      g.poly([sx - w, y0 - 10, sx + w, y0 - 10, sx + rr(r, -8, 8), y0 + l]);
    }
    g.fill(col.curtain);
  }
  // Old webs between the columns and the vault, moths caught in them.
  for (let i = 0; i < Math.round(rect.w / 1100); i++) {
    const cx = rr(r, x0, x1);
    web(g, cx, y0 + rr(r, 60, 200), rr(r, 120, 220), rr(r, 0.2, 0.8), rr(r, 1.8, 2.8), col.silk, col.moth, r);
  }
  return { content: c, lights: L };
}
