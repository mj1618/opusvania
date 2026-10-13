/**
 * What grows on the playfield and where. Species are small functions that add triangles to a
 * FloraBuilder (pf-flora.ts); `growGarden` walks the terrain's tops, undersides and faces
 * (pf-terrain.ts) and plants them in clumps with breathing room: features (ferns, broad leaves,
 * mushrooms, lantern flowers, flower drifts) spaced apart, grass in patches between, a low dark
 * fringe in front of the walk line, vines, moss and roots hanging underneath, ivy on faces.
 * Everything is deterministic from the terrain coordinates.
 */
import { mix, PALETTE } from './look';
import type { FloraBuilder } from './pf-flora';
import { clamp, lerp, noise1, quad, type Rng, range, rngFor, smoothstep } from './pf-shape';
import type { Face, TerrainInfo, Top, Under } from './pf-terrain';

export const PLANTS = {
  /** Mean gap between plant features on a top, px (smaller = lusher). */
  featureGap: [38, 140] as const,
  /** Grass: 0..1 share of a top that carries any, and blade heights in px. */
  grassCover: 0.68,
  grassHeight: [9, 44] as const,
  tallGrass: [40, 74] as const,
  /** Front fringe (drawn over the character's feet): cover and height. Keep it low. */
  fringeCover: 0.5,
  fringeHeight: [6, 15] as const,
  /** Tip sway in px per px of plant height, and how far the character bends things. */
  windPerPx: 0.15,
  bendPerPx: 0.6,
  /** Glow things: halo radius factor and alpha. */
  haloAlpha: 0.24,
  /** One feature in this many is a glow plant. */
  glowEvery: 5,
} as const;

interface Tone {
  dark: number;
  mid: number;
  lit: number;
  sun: number;
}
const BACK: Tone = { dark: 0x0b3836, mid: 0x1b6d50, lit: 0x58b060, sun: 0xbcd874 };
const FRONT: Tone = { dark: 0x06252a, mid: 0x0f4a3e, lit: 0x23744f, sun: 0x4f9a58 };
const WOOD = 0x4d6b62;
const WOOD_DARK = 0x263f40;

interface Ctx {
  b: FloraBuilder;
  halo: FloraBuilder;
  r: Rng;
}

/** Tone at x: sun-dappled patches drift the lit colour toward yellow-green, shade toward teal. */
function toneAt(base: Tone, x: number, r: Rng): Tone {
  const sun = smoothstep(0.05, 0.75, noise1(x / 230, 5));
  const cool = r() * 0.35;
  return {
    dark: mix(base.dark, 0x0a2f44, cool * 0.6),
    mid: mix(mix(base.mid, 0x17666a, cool), base.lit, sun * 0.25),
    lit: mix(mix(base.lit, 0x3fa78a, cool), base.sun, sun * 0.55),
    sun: base.sun,
  };
}

// ---------------------------------------------------------------------------------------------
// Species

function blade(
  c: Ctx,
  x: number,
  y: number,
  h: number,
  lean: number,
  w0: number,
  t: Tone,
  seedHead = false,
): void {
  const { b, r } = c;
  b.plant(x, y, h, r(), h * PLANTS.windPerPx + 0.8, h * PLANTS.bendPerPx, 0.35);
  const line = quad(x, y + 2, x + lean * 0.25, y - h * 0.62, x + lean, y - h, 4);
  const tip = mix(t.lit, t.sun, r() * 0.5);
  b.strip(
    line,
    (u) => w0 * (1 - u) ** 0.75,
    (u) => mix(mix(t.dark, t.mid, 0.35), t.mid, u ** 0.6),
    (u) => mix(mix(t.dark, t.mid, 0.5), tip, u ** 0.7),
  );
  if (seedHead) {
    const hx = x + lean * 0.9;
    const hy = y - h * 0.96;
    b.leaf(
      hx,
      hy,
      -Math.PI / 2 + lean / h,
      h * 0.16,
      3.2,
      t.mid,
      mix(t.sun, 0xe6d9a0, 0.5),
      0xf2e6b4,
      0,
      1,
      2,
    );
  }
}

function grassTuft(
  c: Ctx,
  x: number,
  y: number,
  n: number,
  h0: number,
  h1: number,
  spread: number,
  t: Tone,
): void {
  const { r } = c;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    const h = range(r, h0, h1) * (1 - Math.abs(u) * 0.5);
    blade(
      c,
      x + u * spread * 2 + range(r, -1.5, 1.5),
      y,
      h,
      u * h * 0.9 + range(r, -0.25, 0.25) * h,
      range(r, 2.2, 3.8),
      t,
    );
  }
}

function tallGrass(c: Ctx, x: number, y: number, t: Tone): void {
  const { r } = c;
  const n = 5 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5;
    const h = range(r, PLANTS.tallGrass[0], PLANTS.tallGrass[1]) * (1 - Math.abs(u) * 0.4);
    blade(
      c,
      x + u * 16 + range(r, -2, 2),
      y,
      h,
      u * h * 0.8 + range(r, -0.15, 0.15) * h,
      range(r, 2.6, 4),
      t,
      r() < 0.35,
    );
  }
}

/** A fern: fronds arcing out around `up` (radians; -PI/2 = straight up). */
function fern(c: Ctx, x: number, y: number, size: number, t: Tone, up = -Math.PI / 2, spread = 1.15): void {
  const { b, r } = c;
  const n = 4 + Math.floor(r() * 4);
  const phase = r();
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    const a = up + u * 2 * spread + range(r, -0.12, 0.12);
    const len = size * range(r, 0.7, 1.1) * (1 - Math.abs(u) * 0.25);
    b.plant(x, y, len, phase + r() * 0.15, len * 0.11 + 1, len * 0.5, 0.45);
    // The frond leaves along `a`, then gravity pulls the tip over.
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len + len * 0.3;
    const cx = x + Math.cos(a) * len * 0.55;
    const cy = y + Math.sin(a) * len * 0.75;
    const line = quad(x, y, cx, cy, ex, ey, 10);
    const facingLight = Math.cos(a) > 0;
    const lit = facingLight ? t.lit : mix(t.mid, t.lit, 0.45);
    b.strip(
      line,
      (k) => 2.2 * (1 - k) + 0.4,
      (k) => mix(t.dark, t.mid, k),
    );
    const pairs = Math.max(5, Math.round(len / 5.2));
    for (let j = 1; j <= pairs; j++) {
      const k = j / (pairs + 0.6);
      const q = 1 - k;
      const px = q * q * x + 2 * q * k * cx + k * k * ex;
      const py = q * q * y + 2 * q * k * cy + k * k * ey;
      let tx = 2 * q * (cx - x) + 2 * k * (ex - cx);
      let ty = 2 * q * (cy - y) + 2 * k * (ey - cy);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const pl = len * 0.3 * Math.sin(Math.PI * k ** 0.6) ** 0.8 + 1.5;
      const col = mix(t.dark, lit, clamp(k * 1.3, 0, 1));
      for (const sgn of [-1, 1]) {
        // Pinna: a sliver leaning toward the tip. The upper side catches more light.
        const nx = -ty * sgn;
        const ny = tx * sgn;
        const upper = ny < 0;
        const tipCol = upper ? mix(col, t.sun, 0.25 * k) : mix(col, t.dark, 0.25);
        const a0 = b.v(px - tx * 1.6, py - ty * 1.6, mix(t.dark, t.mid, k));
        const a1 = b.v(px + tx * 1.9, py + ty * 1.9, mix(t.dark, t.mid, k));
        const a2 = b.v(px + nx * pl + tx * pl * 0.5, py + ny * pl + ty * pl * 0.5, tipCol);
        b.tri(a0, a1, a2);
      }
    }
  }
}

function broadleaf(c: Ctx, x: number, y: number, size: number, t: Tone): void {
  const { b, r } = c;
  const n = 3 + Math.floor(r() * 4);
  const phase = r();
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    const a = -Math.PI / 2 + u * 2.3 + range(r, -0.15, 0.15);
    const len = size * range(r, 0.7, 1.1) * (1 - Math.abs(u) * 0.2);
    b.plant(x, y, len * 1.2, phase + r() * 0.1, len * 0.09 + 0.8, len * 0.45, 0.5);
    const sx = x + Math.cos(a) * len * 0.25;
    const sy = y + Math.sin(a) * len * 0.25;
    b.strip(
      [x, y + 1, sx, sy],
      () => 2,
      () => t.dark,
    );
    const light = Math.cos(a) > -0.2;
    const top = mix(t.lit, t.sun, light ? 0.35 : 0);
    const under = mix(t.mid, t.dark, 0.3);
    // Left of growth direction faces up for leaves leaning right, down for leaves leaning left.
    const upIsA = Math.cos(a) >= 0;
    b.leaf(
      sx,
      sy,
      a,
      len,
      len * range(r, 0.38, 0.5),
      t.dark,
      upIsA ? top : under,
      upIsA ? under : top,
      u * 0.5,
      1,
      5,
    );
  }
}

const PETALS = [0xeaf6ff, 0xd9c8ff, 0xffe9b8, 0xbfefff];

function flower(c: Ctx, x: number, y: number, h: number, t: Tone, col: number): void {
  const { b, r } = c;
  const lean = range(r, -0.3, 0.3) * h;
  b.plant(x, y, h, r(), h * 0.18 + 0.6, h * 0.8, 0.3);
  b.strip(
    quad(x, y + 1, x + lean * 0.2, y - h * 0.6, x + lean, y - h, 4),
    () => 1.5,
    (u) => mix(t.dark, t.mid, u),
  );
  if (r() < 0.6)
    b.leaf(x + lean * 0.1, y - h * 0.3, r() < 0.5 ? -0.5 : -2.6, h * 0.3, 3.5, t.dark, t.mid, t.lit, 0, 1, 3);
  const fx = x + lean;
  const fy = y - h;
  const pr = range(r, 3.2, 4.8);
  const a0 = r() * 6.28;
  b.fixedH = 1;
  for (let i = 0; i < 5; i++) {
    const a = a0 + (i / 5) * Math.PI * 2;
    b.leaf(fx, fy, a, pr, pr * 0.8, mix(col, 0x7f6fb0, 0.4), col, mix(col, 0xffffff, 0.35), 0, 1, 2);
  }
  b.fan(fx, fy, 1.5, 1.5, 0, Math.PI * 2, 0xffe08a, () => 0xf0b860, 1, 6);
  b.fixedH = null;
}

function mushroom(c: Ctx, x: number, y: number, size: number, glow: 0 | 1 | 2): void {
  const { b, halo, r } = c;
  const h = size * range(r, 0.9, 1.7);
  const lean = range(r, -0.25, 0.25) * h;
  b.plant(x, y, h + size, r(), 0.5 + size * 0.03, 2.5 + size * 0.12, 0.2);
  const cx = x + lean;
  const cy = y - h;
  const stemLit = glow ? mix(0xd8f4f0, glow === 2 ? PALETTE.glowViolet : PALETTE.glowCyan, 0.3) : 0xd9d6bf;
  b.strip(
    quad(x, y + 1, x + lean * 0.3, y - h * 0.5, cx, cy + 1, 3),
    (u) => size * (0.34 - 0.1 * u),
    (u) => mix(0x4c6a70, mix(stemLit, 0x6f8f8c, 0.5), u),
    (u) => mix(0x6d8c88, stemLit, u),
  );
  const rx = size;
  const ry = size * range(r, 0.6, 0.85);
  const tilt = lean / h;
  if (glow) {
    const g = glow === 2 ? PALETTE.glowViolet : PALETTE.glowCyan;
    const deep = glow === 2 ? 0x5a3f9a : 0x1f7f96;
    b.glow = 0.9;
    // Gills glowing underneath, then the cap.
    b.fan(cx, cy, rx * 0.92, ry * 0.3, 0, Math.PI, mix(g, 0xffffff, 0.5), () => g, 1, 6);
    b.fan(
      cx + tilt * 2,
      cy + 0.5,
      rx,
      ry,
      Math.PI,
      Math.PI * 2,
      mix(g, 0xffffff, 0.25),
      (a) => mix(deep, g, 0.5 + 0.5 * Math.cos(a - 5.3)),
      1,
      9,
    );
    b.glow = 0;
    b.sync(halo);
    halo.halo(cx, cy - ry * 0.2, size * 2.6 + 8, g, PLANTS.haloAlpha * 0.8);
  } else {
    const warm = [0xc98a5e, 0xb5694f, 0xd9a86a, 0x9a7aa8][Math.floor(r() * 4)] as number;
    b.fan(cx, cy, rx * 0.9, ry * 0.26, 0, Math.PI, 0x8a8f86, () => 0x5d6a6c, 1, 6);
    b.fan(
      cx + tilt * 2,
      cy + 0.5,
      rx,
      ry,
      Math.PI,
      Math.PI * 2,
      mix(warm, 0xfff0d0, 0.2),
      (a) => mix(mix(warm, 0x3a2f4a, 0.55), mix(warm, PALETTE.keyWarm, 0.45), 0.5 + 0.5 * Math.cos(a - 5.3)),
      1,
      9,
    );
    b.fixedH = 1;
    for (let i = 0; i < Math.floor(size / 4); i++) {
      const a = range(r, 3.5, 5.9);
      const d = range(r, 0.35, 0.75);
      b.fan(
        cx + Math.cos(a) * rx * d,
        cy + Math.sin(a) * ry * d,
        size * 0.11,
        size * 0.09,
        0,
        6.28,
        0xfff3dc,
        () => 0xf2dcc0,
        0.85,
        5,
      );
    }
    b.fixedH = null;
  }
}

/** A lantern flower: a stem arching over with a glowing bulb hanging from its tip. */
function lantern(c: Ctx, x: number, y: number, h: number, t: Tone, violet: boolean): void {
  const { b, halo, r } = c;
  const dir = r() < 0.5 ? -1 : 1;
  const reach = h * range(r, 0.35, 0.6);
  b.plant(x, y, h * 1.15, r(), h * 0.1 + 1, h * 0.55, 0.4);
  const tx = x + dir * reach;
  const ty = y - h * 0.82;
  const line = quad(x, y + 1, x + dir * reach * 0.1, y - h * 1.25, tx, ty, 8);
  b.strip(
    line,
    (u) => 2.4 - 1.2 * u,
    (u) => mix(t.dark, t.mid, u),
    (u) => mix(t.dark, t.lit, u),
  );
  b.leaf(x, y, -Math.PI / 2 - dir * 0.9, h * 0.42, h * 0.16, t.dark, t.mid, t.lit, dir * 0.3, 1, 4);
  b.leaf(x, y, -Math.PI / 2 + dir * 0.6, h * 0.3, h * 0.13, t.dark, t.lit, t.mid, -dir * 0.3, 1, 4);
  const g = violet ? PALETTE.glowViolet : PALETTE.glowCyan;
  const by = ty + 7;
  b.strip(
    [tx, ty, tx, by - 4],
    () => 1,
    () => t.mid,
  );
  b.glow = 1;
  b.fixedH = Math.min(1, Math.hypot(tx - x, by - y) / (h * 1.15));
  b.fan(tx, by - 1.5, 3.6, 3.2, Math.PI, Math.PI * 2, mix(g, 0xffffff, 0.6), () => mix(g, t.mid, 0.35), 1, 6);
  b.fan(tx, by - 1.5, 3.6, 6.8, 0, Math.PI, 0xffffff, () => g, 1, 6);
  b.glow = 0;
  b.fixedH = null;
  b.sync(halo);
  halo.halo(tx, by, 30, g, PLANTS.haloAlpha * 1.1);
  halo.halo(tx, by, 8, 0xffffff, 0.3);
}

function clover(c: Ctx, x: number, y: number, n: number, t: Tone): void {
  const { b, r } = c;
  b.plant(x, y, 14, r(), 0.8, 5, 0.2);
  for (let i = 0; i < n; i++) {
    const px = x + range(r, -9, 9);
    const py = y - range(r, 0.5, 5);
    const rad = range(r, 1.8, 3.4);
    const lit = mix(t.mid, t.lit, r());
    b.fan(
      px,
      py,
      rad * 1.25,
      rad,
      0,
      Math.PI * 2,
      lit,
      (a) => mix(t.dark, lit, 0.45 + 0.4 * Math.cos(a - 5.4)),
      1,
      6,
    );
  }
}

/** A vine hanging from (x, y). */
function vine(c: Ctx, x: number, y: number, len: number, t: Tone, leafy = true): void {
  const { b, r } = c;
  b.plant(x, y, len, r(), len * 0.05 + 1.5, len * 0.16 + 4, -0.18);
  const ph = r() * 6;
  const amp = range(r, 1.5, 4);
  const n = Math.max(4, Math.round(len / 9));
  const line: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    line.push(x + Math.sin(u * len * 0.045 + ph) * amp * u, y + u * len);
  }
  b.strip(
    line,
    (u) => 2.2 - 1.3 * u,
    (u) => mix(t.dark, t.mid, 0.3 + 0.5 * u),
  );
  if (!leafy) return;
  let side = r() < 0.5 ? -1 : 1;
  for (let d = range(r, 5, 12); d < len; d += range(r, 7, 15)) {
    const u = d / len;
    const i = Math.min(n - 1, Math.floor(u * n));
    const px = lerp(line[i * 2] as number, line[i * 2 + 2] as number, u * n - i);
    const py = y + d;
    const a = Math.PI / 2 - side * range(r, 0.6, 1.25);
    const ll = range(r, 5.5, 9.5) * (1 - u * 0.25);
    const lit = side > 0 ? mix(t.lit, t.sun, 0.2) : t.mid;
    b.leaf(px, py, a, ll, ll * 0.62, t.dark, side > 0 ? t.mid : lit, side > 0 ? lit : t.dark, 0, 1, 3);
    side = -side;
  }
}

function mossTuft(c: Ctx, x: number, y: number, len: number, t: Tone): void {
  const { b, r } = c;
  const n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const px = x + range(r, -7, 7);
    const l = len * range(r, 0.4, 1);
    b.plant(px, y, l, r(), l * 0.07 + 0.8, l * 0.25 + 2, -0.15);
    const w0 = range(r, 2.5, 4.5);
    b.strip(
      quad(px, y - 1, px + range(r, -2, 2), y + l * 0.5, px + range(r, -3, 3), y + l, 3),
      (u) => w0 * (1 - u) ** 0.8,
      (u) => mix(t.dark, 0x0a2c38, u * 0.5),
      (u) => mix(mix(t.dark, t.mid, 0.7), t.dark, u),
    );
  }
}

function dangleRoot(c: Ctx, x: number, y: number, len: number): void {
  const { b, r } = c;
  b.plant(x, y, len, r(), len * 0.035 + 0.8, len * 0.12 + 3, -0.15);
  const lean = range(r, -0.2, 0.2) * len;
  const line = quad(x, y - 2, x + lean * 0.2 + range(r, -6, 6), y + len * 0.5, x + lean, y + len, 7);
  const w0 = range(r, 3, 4.5);
  b.strip(
    line,
    (u) => w0 * (1 - u) ** 0.7 + 0.5,
    (u) => mix(WOOD_DARK, 0x1a3038, u * 0.5),
    (u) => mix(WOOD, WOOD_DARK, u * 0.6),
  );
  for (let i = 0; i < 2; i++) {
    const u = range(r, 0.3, 0.75);
    const k = Math.floor(u * 7) * 2;
    const sx = line[k] as number;
    const sy = line[k + 1] as number;
    const d = r() < 0.5 ? -1 : 1;
    const l = len * range(r, 0.15, 0.35);
    b.strip(
      quad(sx, sy, sx + d * l * 0.4, sy + l * 0.4, sx + d * l * 0.5, sy + l, 3),
      (v) => 1.6 * (1 - v) + 0.3,
      () => WOOD_DARK,
      () => mix(WOOD, WOOD_DARK, 0.4),
    );
  }
}

function reed(c: Ctx, x: number, y: number, h: number, t: Tone, head: boolean): void {
  const { b, r } = c;
  const lean = range(r, -0.14, 0.14) * h;
  b.plant(x, y, h, r(), h * 0.07 + 1, h * 0.3, 0.25);
  const line = quad(x, y + 2, x + lean * 0.2, y - h * 0.6, x + lean, y - h, 6);
  b.strip(
    line,
    (u) => 3.4 * (1 - u) ** 0.6 + 0.3,
    (u) => mix(mix(t.dark, 0x0a2c40, 0.5), t.mid, u),
    (u) => mix(mix(t.dark, 0x0a2c40, 0.5), t.lit, u),
  );
  if (head) {
    const hx = x + lean * 0.78;
    const hy = y - h * 0.86;
    b.strip(
      [hx, hy + 9, hx + lean * 0.03, hy, hx + lean * 0.06, hy - 9],
      (u) => 5.5 * Math.sin(Math.PI * clamp(u, 0.08, 0.92)),
      () => 0x4a3a34,
      () => 0x8a6648,
    );
  }
}

function lilyPad(c: Ctx, x: number, y: number, rx: number, t: Tone, bloom: boolean): void {
  const { b, r } = c;
  b.plant(x, y, 10, r(), 1.6, 3, 0);
  b.fixedH = 1;
  const notch = range(r, 0, 6.28);
  b.fan(
    x,
    y,
    rx,
    rx * 0.26,
    notch + 0.35,
    notch + Math.PI * 2 - 0.35,
    mix(t.mid, t.lit, 0.4),
    (a) => mix(t.dark, t.lit, 0.5 + 0.5 * Math.cos(a - 5.6)),
    1,
    10,
  );
  if (bloom) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      b.leaf(x + 2, y - 1, a, 6.5, 3.6, 0xc9a8e8, 0xf4eaff, 0xffffff, 0, 1, 2);
    }
    b.fan(x + 2, y - 2.5, 1.4, 1.2, 0, 6.28, 0xffe08a, () => 0xf0b860, 1, 5);
  }
  b.fixedH = null;
}

/** Ivy creeping over a face: a stem with small leaves, barely swaying. */
function ivy(c: Ctx, x: number, y0: number, y1: number, dir: -1 | 1, t: Tone): void {
  const { b, r } = c;
  const n = Math.max(3, Math.round(Math.abs(y1 - y0) / 14));
  const ph = r() * 6;
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push(x - dir * (3 + Math.sin(u * 5 + ph) * 3) + dir * 1.5, lerp(y0, y1, u));
  }
  b.plant(x, y0, 4000, 0, 0, 0, 0);
  b.fixedH = 0;
  b.strip(
    pts,
    () => 1.6,
    () => t.dark,
  );
  b.fixedH = null;
  for (let i = 0; i <= n; i++) {
    if (r() < 0.25) continue;
    const px = pts[i * 2] as number;
    const py = pts[i * 2 + 1] as number;
    const out = r() < 0.6;
    const a = out ? (dir > 0 ? range(r, -0.9, 0.7) : Math.PI + range(r, -0.7, 0.9)) : range(r, 0.8, 2.3);
    const ll = range(r, 6, 10.5);
    b.plant(px, py, ll, r(), 1.2, 4, 0.3);
    const lit = Math.cos(a) > 0 ? t.lit : t.mid;
    b.leaf(px, py, a, ll, ll * 0.78, t.dark, lit, mix(lit, t.dark, 0.4), 0, 1, 3);
  }
}

/** A leafy twig (for boughs and edge walls). */
function spray(c: Ctx, x: number, y: number, angle: number, len: number, t: Tone): void {
  const { b, r } = c;
  b.plant(x, y, len, r(), len * 0.08 + 1, len * 0.35, 0.3);
  const ex = x + Math.cos(angle) * len;
  const ey = y + Math.sin(angle) * len + len * 0.15;
  const line = quad(x, y, x + Math.cos(angle) * len * 0.5, y + Math.sin(angle) * len * 0.6, ex, ey, 6);
  b.strip(
    line,
    (u) => 2.6 * (1 - u) + 0.6,
    () => WOOD_DARK,
    () => mix(WOOD, WOOD_DARK, 0.5),
  );
  let side = 1;
  for (let i = 1; i <= 6; i++) {
    const px = line[i * 2] as number;
    const py = line[i * 2 + 1] as number;
    const a = angle + side * range(r, 0.5, 1.1);
    const ll = range(r, 9, 15);
    const up = Math.sin(a) < 0;
    b.leaf(
      px,
      py,
      a,
      ll,
      ll * 0.5,
      t.dark,
      up ? t.lit : t.mid,
      up ? mix(t.lit, t.sun, 0.3) : t.dark,
      side * 0.2,
      1,
      3,
    );
    side = -side;
  }
}

// ---------------------------------------------------------------------------------------------
// Placement

export interface Garden {
  /** Behind the character. */
  back: FloraBuilder;
  /** In front of the character: the low fringe and whatever floats on the pool. */
  front: FloraBuilder;
  /** Additive halos for glow things. */
  halo: FloraBuilder;
}

export function growGarden(g: Garden, info: TerrainInfo, sceneW: number): void {
  let features = 0;
  for (const top of info.tops) {
    if (top.kind === 'poolFloor') {
      growPool(g, top, info);
      continue;
    }
    const r = rngFor(top.x0, top.y, 3);
    const c: Ctx = { b: g.back, halo: g.halo, r };
    const narrow = top.kind === 'branch' || top.kind === 'trunk';
    const scale = top.kind === 'ground' ? 1 : top.kind === 'branch' ? 0.6 : 0.82;
    const y = top.y + 1;
    const inset = top.kind === 'root' ? 14 : 6;
    const a = Math.max(4, top.x0 + (top.freeL ? inset : 2));
    const b = Math.min(sceneW - 4, top.x1 - (top.freeR ? inset : 2));

    // Features, spaced.
    const spots: number[] = [];
    for (
      let x = a + range(r, 8, 50);
      x < b - 8;
      x += range(r, PLANTS.featureGap[0], PLANTS.featureGap[1]) / scale
    ) {
      spots.push(x);
      const t = toneAt(BACK, x, r);
      features++;
      const glowTurn = features % PLANTS.glowEvery === 0;
      const roll = r();
      if (glowTurn && !narrow) {
        if (roll < 0.55) {
          lantern(c, x, y, range(r, 40, 68) * scale, t, r() < 0.25);
          if (r() < 0.5) lantern(c, x + range(r, 14, 26), y, range(r, 26, 40) * scale, t, false);
        } else {
          const violet = r() < 0.3;
          const n = 2 + Math.floor(r() * 4);
          for (let i = 0; i < n; i++)
            mushroom(c, x + (i - n / 2) * range(r, 7, 12), y, range(r, 4, 9.5), violet ? 2 : 1);
        }
        clover(c, x, y, 8, t);
      } else if (roll < 0.3) {
        const n = narrow ? 1 : 1 + Math.floor(r() * 2.5);
        for (let i = 0; i < n; i++)
          fern(c, x + i * range(r, 18, 34), y, range(r, 40, 92) * scale, toneAt(BACK, x + i * 40, r));
      } else if (roll < 0.5) {
        broadleaf(c, x, y, range(r, 32, 70) * scale, t);
        if (r() < 0.5) broadleaf(c, x + range(r, 18, 30), y, range(r, 16, 28) * scale, t);
      } else if (roll < 0.66) {
        tallGrass(c, x, y, t);
        if (r() < 0.6) tallGrass(c, x + range(r, 14, 26), y, t);
      } else if (roll < 0.8) {
        const col = PETALS[Math.floor(r() * PETALS.length)] as number;
        const n = 3 + Math.floor(r() * 5);
        for (let i = 0; i < n; i++) flower(c, x + range(r, -28, 28), y, range(r, 10, 26) * scale, t, col);
        clover(c, x, y, 10, t);
      } else if (roll < 0.92) {
        const n = 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++)
          mushroom(c, x + (i - n / 2) * range(r, 8, 14), y, range(r, 4.5, 11) * scale, 0);
      } else {
        clover(c, x, y, 14, t);
        clover(c, x + 16, y, 9, t);
      }
    }

    // Grass in patches between and around them.
    const seed = top.x0 * 0.37 + top.y;
    for (let x = a; x < b; x += range(r, 3, 9)) {
      const patch = noise1(x / 70, seed) * 0.65 + noise1(x / 15, seed + 9) * 0.35;
      if (patch < 1 - PLANTS.grassCover * 2) continue;
      // Height swells in drifts: mostly low, here and there a tall stand.
      const k = smoothstep(1 - PLANTS.grassCover * 2, 0.75, patch);
      const tall = smoothstep(0.1, 0.8, noise1(x / 95, seed + 31)) * k;
      const h0 = lerp(PLANTS.grassHeight[0] * 0.6, PLANTS.grassHeight[0] * 1.6, k) * scale;
      const h1 = lerp(PLANTS.grassHeight[0] + 3, PLANTS.grassHeight[1], tall) * scale * range(r, 0.8, 1.25);
      grassTuft(
        c,
        x,
        y,
        1 + Math.floor(r() * 3.4),
        h0,
        Math.max(h0 + 2, h1),
        range(r, 2, 6),
        toneAt(BACK, x, r),
      );
    }

    // Front fringe: low, dark, in clumps, never on thin boughs.
    if (top.kind !== 'branch') {
      const fc: Ctx = { b: g.front, halo: g.halo, r };
      for (let x = a + 2; x < b - 2; x += range(r, 4, 10)) {
        const patch = noise1(x / 60, seed + 77) * 0.65 + noise1(x / 19, seed + 78) * 0.35;
        if (patch < 1 - PLANTS.fringeCover * 2) continue;
        const k = smoothstep(1 - PLANTS.fringeCover * 2, 0.6, patch);
        const t = toneAt(FRONT, x, r);
        grassTuft(
          fc,
          x,
          top.y + 4,
          2 + Math.floor(r() * 2),
          PLANTS.fringeHeight[0],
          lerp(PLANTS.fringeHeight[0] + 2, PLANTS.fringeHeight[1], k),
          range(r, 2, 5),
          t,
        );
        if (r() < 0.12) clover(fc, x, top.y + 5, 6, t);
      }
    }

    // Things trailing off free edges.
    for (const [free, ex, dir] of [
      [top.freeL, top.x0, -1],
      [top.freeR, top.x1, 1],
    ] as const) {
      if (!free || top.kind === 'branch') continue;
      const t = toneAt(BACK, ex, r);
      const n = 1 + Math.floor(r() * 2.5);
      for (let i = 0; i < n; i++)
        vine(
          c,
          ex + dir * range(r, -1, 4),
          top.y + range(r, 4, 9),
          range(r, 26, 90) * (top.kind === 'ground' ? 1 : 0.8),
          t,
        );
      mossTuft(c, ex + dir * 2, top.y + 8, range(r, 12, 26), t);
    }
  }

  // Leaves on the back-plane saplings: dark, so they stay behind the walk plane.
  const tr = rngFor(17, 4);
  const tc: Ctx = { b: g.back, halo: g.halo, r: tr };
  for (const tw of info.twigs) {
    const t = toneAt(FRONT, tw.x, tr);
    const n = 2 + Math.floor(tr() * 2);
    for (let i = 0; i < n; i++) spray(tc, tw.x, tw.y, tw.angle + range(tr, -0.9, 0.9), range(tr, 30, 56), t);
  }
  for (const u of info.unders) growUnder(g, u);
  for (const f of info.faces) growFace(g, f, info);
}

function growUnder(g: Garden, u: Under): void {
  const r = rngFor(u.x0, u.y(u.x0), 8);
  const c: Ctx = { b: g.back, halo: g.halo, r };
  const long = u.kind === 'floating' ? 1 : u.kind === 'branch' ? 0.7 : 1.25;
  for (let x = u.x0 + range(r, 0, 14); x < u.x1; x += range(r, 9, 30)) {
    mossTuft(c, x, u.y(x), range(r, 8, 24), toneAt(BACK, x, r));
  }
  for (let x = u.x0 + range(r, 6, 40); x < u.x1; x += range(r, 28, 90)) {
    const t = toneAt(BACK, x, r);
    if (u.kind === 'floating' && r() < 0.55) dangleRoot(c, x, u.y(x), range(r, 30, 96));
    else vine(c, x, u.y(x), range(r, 30, 120) * long, t, u.kind !== 'trunk' || r() < 0.7);
  }
  if (u.kind === 'branch') {
    for (let x = u.x0 + 20; x < u.x1; x += range(r, 40, 80)) {
      spray(c, x, u.y(x) - 6, range(r, 0.5, 2.6), range(r, 26, 44), toneAt(BACK, x, r));
    }
  }
}

function growFace(g: Garden, f: Face, info: TerrainInfo): void {
  const r = rngFor(f.x, f.y0, 4);
  const c: Ctx = { b: g.back, halo: g.halo, r };
  const h = f.y1 - f.y0;
  if (f.kind === 'edge') {
    // The scene's edge walls: ferns and leafy sprays reaching in, thicker with height.
    for (let y = f.y0 + range(r, 20, 80); y < f.y1 - 30; y += range(r, 46, 150)) {
      const t = toneAt(BACK, f.x + y, r);
      const up = f.dir > 0 ? -0.55 : Math.PI + 0.55;
      const roll = r();
      if (roll < 0.5) fern(c, f.x + f.dir * 6, y, range(r, 36, 64), t, up, 0.8);
      else if (roll < 0.8)
        spray(c, f.x + f.dir * 4, y, up + range(r, -0.3, 0.5) * f.dir, range(r, 40, 70), t);
      else mossTuft(c, f.x + f.dir * 8, y, range(r, 16, 34), t);
      if (r() < 0.5) ivy(c, f.x + f.dir * 9, y, y + range(r, 50, 140), f.dir, t);
    }
    return;
  }
  const count = Math.max(1, Math.round(h / (f.kind === 'trunk' ? 260 : 150)));
  for (let i = 0; i < count; i++) {
    const y0 = lerp(f.y0 + 16, f.y1 - 40, r());
    const len = Math.min(f.y1 - 8 - y0, range(r, 50, 150));
    if (len < 24) continue;
    // Keep ivy out of the pool water.
    const y1 =
      info.pool && f.x >= info.pool.x0 - 1 && f.x <= info.pool.x1 + 1
        ? Math.min(y0 + len, info.pool.surface - 8)
        : y0 + len;
    if (y1 - y0 < 24) continue;
    ivy(c, f.x, y0, y1, f.dir, toneAt(BACK, f.x + y0, r));
  }
}

function growPool(g: Garden, floor: Top, info: TerrainInfo): void {
  const pool = info.pool;
  if (!pool) return;
  const r = rngFor(floor.x0, 55);
  const c: Ctx = { b: g.back, halo: g.halo, r };
  const fc: Ctx = { b: g.front, halo: g.halo, r };
  const depth = pool.floor - pool.surface;
  // Reeds crowd the two banks and thin toward the middle.
  for (const [edge, dir] of [
    [pool.x0, 1],
    [pool.x1, -1],
  ] as const) {
    const n = 7 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const d = 6 + r() ** 1.7 * 78;
      reed(
        c,
        edge + dir * d,
        pool.floor,
        depth + range(r, 26, 78) * (1 - d / 140),
        toneAt(BACK, edge, r),
        r() < 0.3,
      );
    }
  }
  // Water weed on the floor.
  for (let x = pool.x0 + 12; x < pool.x1 - 12; x += range(r, 10, 26)) {
    if (noise1(x / 40, 9) < -0.1) continue;
    const t = toneAt(FRONT, x, r);
    grassTuft(c, x, pool.floor + 1, 2 + Math.floor(r() * 2), 8, range(r, 12, 30), 4, {
      ...t,
      lit: mix(t.lit, 0x2f8f9a, 0.5),
    });
  }
  // Lily pads floating in loose groups, clear of the very middle.
  const w = pool.x1 - pool.x0;
  for (const centre of [0.24, 0.72]) {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const x = pool.x0 + w * centre + range(r, -42, 42);
      lilyPad(
        fc,
        x,
        pool.surface + range(r, -0.5, 1),
        range(r, 9, 17),
        toneAt(BACK, x, r),
        i === 0 && r() < 0.8,
      );
    }
  }
}
