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
import { clamp, lerp, noise1, quad, type Rng, range, rngFor, smoothstep, sunAt, zoneAt } from './pf-shape';
import type { Face, TerrainInfo, Top, Under } from './pf-terrain';

export const PLANTS = {
  /** Mean gap between plant features on a top, px (smaller = lusher). */
  featureGap: [38, 140] as const,
  /** Gap between groups in the rear row (shrubs, tall dark stands), px. */
  rearGap: [150, 420] as const,
  /** Gap between the oversized hazy backdrop plants, and between hero plants, px. */
  backdropGap: [320, 700] as const,
  heroGap: [800, 1300] as const,
  /** Gap between the tall dark front clumps that break the walk line, px. */
  breakGap: [300, 500] as const,
  /** One shrub in this many carries autumn-yellow leaves (counted across the scene, so they spread). */
  autumnEvery: 4,
  /** Grass: 0..1 share of a top that carries any, and blade heights in px. */
  grassCover: 0.58,
  /** Share of grass tufts that also carry a wisp of fine, feather-tipped blades. */
  fineShare: 0.55,
  grassHeight: [10, 50] as const,
  tallGrass: [40, 74] as const,
  /** Front fringe (drawn over the character's feet): cover and height. Keep it low. */
  fringeCover: 0.5,
  fringeHeight: [7, 19] as const,
  /** Tip sway in px per px of plant height, and how far the character bends things. */
  windPerPx: 0.15,
  bendPerPx: 0.6,
  /** Glow things: halo radius factor and alpha. */
  haloAlpha: 0.13,
  /** Share of features that are glow plants, per zone: cool glade, light well, deep stand. */
  glowShare: [0.11, 0.03, 0.11] as const,
} as const;

interface Tone {
  dark: number;
  mid: number;
  lit: number;
  sun: number;
}
const BACK: Tone = { dark: 0x051a1c, mid: 0x0f4234, lit: 0x3f8a4c, sun: 0xbcd874 };
/** The row furthest back: bushes and tall stands, darker and cooler so the walk line sits in front. */
const REAR: Tone = { dark: 0x04161c, mid: 0x0a302e, lit: 0x1f5c46, sun: 0x6fa45e };
/** Far behind the walk line: hazy, cool, low contrast. */
const HAZE: Tone = { dark: 0x0a2430, mid: 0x103440, lit: 0x18484e, sun: 0x24585a };
const AUTUMN = [0xd9a441, 0xc9b24e, 0xe08a3c, 0xb9c45a];
const WARM_PETALS = [0xffc56b, 0xffb59a, 0xfff1dc, 0xffd98a];
const COOL_PETALS = [0xd9c8ff, 0xbfe6ff, 0xe8f4ff, 0xc9a8f0];
const FRONT: Tone = { dark: 0x030e12, mid: 0x08241f, lit: 0x12402e, sun: 0x2f6a40 };
const WOOD = 0x4d6b62;
const WOOD_DARK = 0x263f40;

interface Ctx {
  b: FloraBuilder;
  halo: FloraBuilder;
  r: Rng;
}

/**
 * Tone at a spot: yellow-green where the key light lands (sunAt), cool teal in the dark stands,
 * and shifted by the scene's zone (blue-green glade, golden well, deep emerald stand).
 */
function toneAt(base: Tone, x: number, r: Rng, y = 1200): Tone {
  const sun = sunAt(x, y);
  const z = zoneAt(x);
  const cool = r() * 0.3 + (1 - sun) * 0.3;
  const dim = 0.5 * (1 - sun) + z.deep * 0.12;
  const zone = (c: number, coolC: number, warmC: number, deepC: number, k: number): number =>
    mix(mix(mix(c, coolC, z.cool * k), warmC, z.warm * k), deepC, z.deep * k);
  return {
    dark: zone(mix(base.dark, 0x061c2c, cool * 0.6), 0x05182c, 0x1c1a0c, 0x0e0c26, 0.6),
    mid: zone(
      mix(mix(mix(base.mid, 0x17666a, cool), base.lit, sun * 0.3), base.dark, dim),
      0x0e4a58,
      0x4a4a1c,
      0x1a1c4a,
      0.5,
    ),
    lit: zone(
      mix(mix(mix(base.lit, 0x3fa78a, cool), base.sun, sun * 0.6), base.mid, dim * 1.6),
      0x4aa4a8,
      0xb0a848,
      0x2f8a5a,
      0.4,
    ),
    sun: zone(mix(base.sun, base.lit, 1 - sun), 0x98d8d0, 0xf0d070, 0x7fbf8a, 0.4),
  };
}

// ---------------------------------------------------------------------------------------------
// Species

/** One grass blade: a curved strip that rises, arcs over and tapers to a point. */
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
  // The more it leans, the more the tip hangs below the crest of the arc.
  const sag = Math.min(0.4, Math.abs(lean) / h) * 0.45;
  const segs = h < 26 ? 4 : 6;
  const line = quad(x, y + 2, x + lean * 0.12, y - h * (1.12 + sag), x + lean, y - h * (1 - sag), segs);
  const tip = mix(t.lit, t.sun, r() * 0.6);
  const body = mix(t.dark, t.mid, 0.55);
  b.strip(
    line,
    (u) => w0 * Math.sin(Math.PI * (0.22 + 0.78 * u)) ** 0.7,
    (u) => mix(mix(t.dark, t.mid, 0.3), mix(t.mid, t.lit, 0.35), u ** 0.6),
    (u) => (u < 0.5 ? mix(body, t.lit, u * 2) : mix(t.lit, tip, u * 2 - 1)),
  );
  if (seedHead) {
    const hx = line[segs * 2 - 2] as number;
    const hy = line[segs * 2 - 1] as number;
    const a = Math.atan2((line[segs * 2 + 1] as number) - hy, (line[segs * 2] as number) - hx);
    b.leaf(hx, hy, a, h * 0.17, 3.6, t.mid, mix(t.sun, 0xe6d9a0, 0.5), 0xf2e6b4, 0, 1, 2);
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
    const u = n > 1 ? i / (n - 1) - 0.5 : range(r, -0.3, 0.3);
    const h = range(r, h0, h1) * (1 - Math.abs(u) * 0.4);
    blade(
      c,
      x + u * spread * 2 + range(r, -1.5, 1.5),
      y,
      h,
      (u * 1.1 + range(r, -0.3, 0.3)) * h,
      range(r, 2.2, 3.6) + h * 0.02,
      t,
    );
  }
}

/** A soft dark pool on the ground under something: what makes it sit instead of float. */
function contact(c: Ctx, x: number, y: number, w: number): void {
  const { b } = c;
  b.plant(x, y, 4000, 0, 0, 0, 0);
  b.fixedH = 0;
  b.fan(x, y + 2, w, Math.max(5, w * 0.16), 0, Math.PI * 2, 0x020a10, () => 0x020a10, 0.62, 12, 0);
  b.fixedH = null;
}

/** A wisp of fine grass: hair-thin blades that fade out toward their tips. */
function fineTuft(c: Ctx, x: number, y: number, n: number, h0: number, h1: number, t: Tone): void {
  const { b, r } = c;
  for (let i = 0; i < n; i++) {
    const u = (i + r()) / n - 0.5;
    const h = range(r, h0, h1) * (1 - Math.abs(u) * 0.3);
    const lean = (u * 1.5 + range(r, -0.25, 0.25)) * h;
    const bx = x + u * 9 + range(r, -2, 2);
    b.plant(bx, y, h, r(), h * PLANTS.windPerPx * 1.3 + 0.8, h * PLANTS.bendPerPx, 0.4);
    const sag = Math.min(0.4, Math.abs(lean) / h) * 0.5;
    const line = quad(bx, y + 2, bx + lean * 0.1, y - h * (1.1 + sag), bx + lean, y - h * (1 - sag), 4);
    const w0 = range(r, 1.1, 1.9);
    const tip = mix(t.lit, t.sun, 0.3 + r() * 0.6);
    b.strip(
      line,
      (k) => w0 * (1 - k * 0.55),
      (k) => mix(mix(t.dark, t.mid, 0.5), t.lit, k),
      (k) => mix(t.mid, tip, k ** 0.7),
      (k) => 0.95 - 0.85 * k ** 1.6,
    );
  }
}

/** A stand of tall reeds, drawn simply: a handful of long plain blades, for the far back. */
function reedStand(c: Ctx, x: number, y: number, h: number, t: Tone): void {
  const { b, r } = c;
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const u = (i + r()) / n - 0.5;
    const hh = h * range(r, 0.6, 1);
    const lean = (u * 0.7 + range(r, -0.08, 0.08)) * hh;
    const bx = x + u * 22;
    b.plant(bx, y, hh, r(), hh * 0.06 + 1, hh * 0.25, 0.3);
    b.strip(
      quad(bx, y + 2, bx + lean * 0.15, y - hh * 0.6, bx + lean, y - hh, 3),
      (k) => 6.5 * (1 - k) ** 0.7 + 0.4,
      (k) => mix(t.dark, t.mid, k),
      (k) => mix(t.dark, t.lit, k),
    );
  }
}

/** A fountain of long arching blades from one crown, some carrying seed heads. */
function tallGrass(c: Ctx, x: number, y: number, t: Tone, size = 1): void {
  const { r } = c;
  const n = 8 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const u = (i + r() * 0.8) / n - 0.5;
    const h = range(r, PLANTS.tallGrass[0], PLANTS.tallGrass[1]) * size * (1 - Math.abs(u) * 0.5);
    blade(
      c,
      x + u * 12 + range(r, -2, 2),
      y,
      h,
      (u * 1.7 + range(r, -0.12, 0.12)) * h,
      range(r, 3.2, 5.2),
      t,
      r() < 0.3,
    );
  }
}

/**
 * A shrub: dark lobes carrying a crowd of small leaves, lighter up and toward the key light.
 * `autumn` 0..1 turns that share of the leaves yellow and amber.
 */
function bush(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  t: Tone,
  autumn: number,
  form: 'round' | 'tall' | 'low' = 'round',
  bloom: readonly number[] | null = null,
  density = 1,
): void {
  const { b, r } = c;
  contact(c, x, y, w * 0.75);
  const lobes = form === 'low' ? 4 + Math.floor(r() * 3) : 3 + Math.floor(r() * 3);
  const phase = r();
  const lean = form === 'tall' ? range(r, -0.45, 0.45) : 0;
  const centres: Array<[number, number, number]> = [];
  for (let i = 0; i < lobes; i++) {
    const u = lobes > 1 ? i / (lobes - 1) - 0.5 : 0;
    if (form === 'tall') {
      // Stacked and leaning: a young tree more than a bush.
      const k = i / (lobes - 1);
      const rad = h * range(r, 0.2, 0.3) * (1.1 - k * 0.4);
      centres.push([x + lean * h * k + range(r, -w * 0.14, w * 0.14), y - rad * 0.8 - k * h * 0.72, rad]);
    } else if (form === 'low') {
      // Spreading: wide, uneven, hugging the ground.
      const rad = h * range(r, 0.26, 0.42);
      centres.push([x + u * w * 1.15, y - rad * range(r, 0.6, 1.0), rad]);
    } else {
      const rad = h * range(r, 0.34, 0.5) * (1 - Math.abs(u) * 0.35);
      centres.push([x + u * w * 0.8, y - rad * range(r, 0.75, 1.5) - (0.5 - Math.abs(u)) * h * 0.5, rad]);
    }
  }
  b.plant(x, y, h * 1.1, phase, h * 0.035 + 1, h * 0.22, 0.2);
  // Mass: each lobe a lumpy cloud (never a disc), with a skirt widening to the ground.
  const cloud = (cx: number, cy: number, rx: number, ry: number, seed: number): void => {
    const N = 22;
    const c0 = b.v(cx, cy, mix(t.dark, t.mid, 0.6));
    let prev = -1;
    let first = -1;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const lump =
        1 +
        0.14 * Math.sin(a * 3 + seed) +
        0.09 * Math.sin(a * 5 + seed * 2.3) +
        0.05 * Math.sin(a * 9 + seed);
      const v =
        i === N
          ? first
          : b.v(
              cx + Math.cos(a) * rx * lump,
              Math.min(y + 2, cy + Math.sin(a) * ry * lump),
              mix(t.dark, t.mid, 0.25 + 0.25 * Math.cos(a - 5.3)),
            );
      if (i === 0) first = v;
      if (prev >= 0) b.tri(c0, prev, v);
      prev = v;
    }
  };
  centres.forEach(([cx, cy, rad], i) => {
    cloud(cx, cy, rad * 1.15, rad, cx + i * 1.7);
    cloud(
      cx + range(r, -rad * 0.3, rad * 0.3),
      (cy + y) / 2 + rad * 0.2,
      rad * range(r, 0.9, 1.3),
      (y - cy) / 2 + rad * 0.45,
      cx + 5,
    );
  });
  // Leaves poking out all round the rim break the outline.
  for (const [cx, cy, rad] of centres) {
    const n = Math.round(rad * 0.3) + 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + range(r, -0.2, 0.2);
      const lx = cx + Math.cos(a) * rad * 1.1;
      const ly = cy + Math.sin(a) * rad * 0.95;
      if (ly > y - 4) continue;
      const ll = range(r, 9, 15);
      b.plant(lx, ly, ll * 2, phase + r() * 0.2, 1.6 + h * 0.02, 5 + h * 0.08, 0.3);
      b.leaf(
        lx,
        ly,
        a + range(r, -0.6, 0.6),
        ll,
        ll * 0.55,
        t.dark,
        mix(t.dark, t.mid, 0.6),
        t.dark,
        0,
        1,
        3,
      );
    }
  }
  for (const [cx, cy, rad] of centres) {
    const leaves = Math.round(rad * 1.1 * density);
    for (let i = 0; i < leaves; i++) {
      const a = r() * Math.PI * 2;
      const d = r() ** 0.35 * rad * 1.05;
      const lx = cx + Math.cos(a) * d * 1.15;
      const ly = cy + Math.sin(a) * d;
      if (ly > y - 2) continue;
      // Light comes from the upper right: leaves there are lit, the far side stays dark.
      const facing = clamp(0.5 + (Math.cos(a) * 0.42 - Math.sin(a) * 0.91) * (d / rad) * 0.6, 0, 1);
      const turn = r() < autumn * (0.4 + facing);
      const lit = turn
        ? (AUTUMN[Math.floor(r() * AUTUMN.length)] as number)
        : mix(t.mid, mix(t.lit, t.sun, 0.4), facing);
      const la = a * 0.55 + range(r, -0.5, 0.5) + 0.25;
      const ll = ([6.5, 9.5, 13.5][Math.floor(r() * 3)] as number) * range(r, 0.9, 1.1);
      b.plant(lx, ly, ll * 2, phase + r() * 0.2, 1.6 + h * 0.02, 5 + h * 0.08, 0.3);
      b.leaf(lx, ly, la, ll, ll * 0.55, mix(t.dark, lit, 0.3), lit, mix(lit, t.dark, 0.45), 0, 1, 3);
    }
  }
  if (!bloom) return;
  // Blossom, thickest on the lit shoulder.
  for (const [cx, cy, rad] of centres) {
    for (let i = 0; i < Math.round(rad * 0.45); i++) {
      const a = range(r, -2.6, 0.4);
      const d = Math.sqrt(r()) * rad;
      const fx = cx + Math.cos(a) * d * 1.15;
      const fy = cy + Math.sin(a) * d;
      const col = bloom[Math.floor(r() * bloom.length)] as number;
      const pr = range(r, 2.4, 3.8);
      b.plant(fx, fy, 12, phase + r() * 0.2, 1.6 + h * 0.02, 5 + h * 0.08, 0.3);
      b.fixedH = 1;
      for (let q = 0; q < 5; q++)
        b.leaf(
          fx,
          fy,
          (q / 5) * 6.283 + fx,
          pr,
          pr * 0.8,
          mix(col, 0x8a6a4a, 0.3),
          col,
          mix(col, 0xffffff, 0.4),
          0,
          1,
          2,
        );
      b.fan(fx, fy, pr * 0.3, pr * 0.3, 0, Math.PI * 2, 0xffe08a, () => 0xf0b860, 1, 5);
      b.fixedH = null;
    }
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
    const pairs = Math.max(5, Math.round(len / (len > 90 ? 8 : 5.6)));
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
      const pw = Math.max(1.6, (len / pairs) * 0.42);
      const col = mix(t.dark, lit, clamp(k * 1.3, 0, 1));
      for (const sgn of [-1, 1]) {
        // Pinna: a sliver leaning toward the tip. The upper side catches more light.
        const nx = -ty * sgn;
        const ny = tx * sgn;
        const upper = ny < 0;
        const tipCol = upper ? mix(col, t.sun, 0.25 * k) : mix(col, t.dark, 0.25);
        const a0 = b.v(px - tx * pw, py - ty * pw, mix(t.dark, t.mid, k));
        const a1 = b.v(px + tx * pw * 1.2, py + ty * pw * 1.2, mix(t.dark, t.mid, k));
        const a2 = b.v(px + nx * pl + tx * pl * 0.5, py + ny * pl + ty * pl * 0.5, tipCol);
        b.tri(a0, a1, a2);
      }
    }
  }
}

function broadleaf(c: Ctx, x: number, y: number, size: number, t: Tone): void {
  const { b, r } = c;
  contact(c, x, y, size * 0.8);
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

function mushroom(c: Ctx, x: number, y: number, size: number, glow: 0 | 1 | 2, tall = 1): void {
  const { b, halo, r } = c;
  if (size > 7) contact(c, x, y, size * 1.4);
  const h = size * range(r, 0.9, 1.7) * tall;
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
  /** Where small fliers live: butterflies over warm flower drifts, moths by glow plants. [x, y] each. */
  butterflies: number[][];
  moths: number[][];
}

export function growGarden(g: Garden, info: TerrainInfo, sceneW: number): void {
  let shrubs = 0;
  let heroes = 0;
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

    const sunHere = (x: number): number => sunAt(x, top.y);
    // Keep big plants off whatever the terrain wants seen (the root mound).
    const blocked = (x: number): boolean => info.keepClear.some(([k0, k1]) => x > k0 && x < k1);

    const isGround = top.kind === 'ground';

    // Backdrop (drawn first, so behind everything): tall reed stands in haze tones, between
    // the baked boulders and stumps. (Hazy shrubs here read as pale paper cut-outs in the fog: removed.)
    if (isGround) {
      for (
        let x = a + range(r, 60, 260);
        x < b - 60;
        x += range(r, PLANTS.backdropGap[0], PLANTS.backdropGap[1])
      ) {
        if (blocked(x)) continue;
        const t = toneAt(HAZE, x, r, top.y);
        for (let i = 0; i < 3; i++) reedStand(c, x + i * range(r, 16, 30), y + 4, range(r, 110, 190), t);
      }
    }

    // Rear row: shrubs and tall dark stands, in groups.
    if (!narrow) {
      for (
        let x = a + range(r, 30, 160);
        x < b - 30;
        x += range(r, PLANTS.rearGap[0], PLANTS.rearGap[1]) / scale
      ) {
        if (blocked(x)) continue;
        const t = toneAt(REAR, x, r, top.y);
        const roll = r();
        if (roll < 0.6) {
          const n = isGround ? 1 + Math.floor(r() * 2.2) : 1;
          for (let i = 0; i < n; i++) {
            // Every few shrubs across the whole scene turns, so autumn is spread, not bunched.
            shrubs++;
            const autumn = shrubs % PLANTS.autumnEvery === 1 ? range(r, 0.35, 0.7) : 0;
            const form =
              (['round', 'tall', 'low', 'round', 'low'] as const)[(shrubs + Math.floor(r() * 2)) % 5] ??
              'round';
            const h =
              range(r, 50, 96) * scale * (i ? 0.75 : 1) * (form === 'tall' ? 1.5 : form === 'low' ? 0.7 : 1);
            const wd = h * range(r, 1.2, 1.7) * (form === 'tall' ? 0.5 : form === 'low' ? 1.6 : 1);
            bush(c, x + i * range(r, 50, 80), y + 2, wd, h, t, autumn, form);
          }
        } else {
          const n = 2 + Math.floor(r() * 3);
          for (let i = 0; i < n; i++)
            tallGrass(c, x + i * range(r, 12, 24), y + 1, t, range(r, 1, 1.35) * scale);
        }
      }
    }

    // Heroes: one landmark plant every screen or so, chosen by the zone it stands in.
    if (isGround) {
      for (let x = a + range(r, 260, 620); x < b - 120; x += range(r, PLANTS.heroGap[0], PLANTS.heroGap[1])) {
        if (blocked(x)) continue;
        const z = zoneAt(x);
        const t = toneAt(BACK, x, r, top.y);
        heroes++;
        if (z.warm > 0.5) {
          if (heroes % 2)
            bush(
              c,
              x,
              y + 2,
              range(r, 120, 150),
              range(r, 92, 112),
              toneAt(REAR, x, r, top.y),
              0,
              'round',
              WARM_PETALS,
            );
          else for (let i = 0; i < 3; i++) tallGrass(c, x + i * 26, y + 1, t, range(r, 1.5, 1.9));
        } else if (heroes % 2) {
          // Glow mushrooms as tall as the character, in a family of sizes.
          const kind = z.deep > 0.5 ? 2 : 1;
          const sizes = [range(r, 15, 19), range(r, 9, 12), range(r, 6, 8)];
          let mx = x - 40;
          for (const sz of sizes) {
            mushroom(c, mx, y, sz, kind, 1.25);
            mx += sz * range(r, 1.5, 2.1);
          }
          clover(c, x, y, 14, t);
        } else {
          fern(c, x, y, range(r, 120, 150), t);
          fern(c, x + range(r, 36, 60), y, range(r, 60, 84), t);
        }
      }
    }

    // Features, spaced. What grows depends on the zone.
    for (
      let x = a + range(r, 8, 50);
      x < b - 8;
      x += range(r, PLANTS.featureGap[0], PLANTS.featureGap[1]) / scale
    ) {
      if (top.kind === 'root' || blocked(x)) continue;
      const t = toneAt(BACK, x, r, top.y);
      const sun = sunHere(x);
      const z = zoneAt(x);
      const glowChance =
        z.cool * PLANTS.glowShare[0] + z.warm * PLANTS.glowShare[1] + z.deep * PLANTS.glowShare[2];
      const roll = r();
      if (r() < glowChance && !narrow) {
        // Cyan in the glade, violet and magenta in the deep stand.
        const violet = r() < z.deep * 0.88 + z.warm * 0.2;
        if (roll < 0.5) {
          lantern(c, x, y, range(r, 40, 68) * scale, t, violet);
          if (r() < 0.6) lantern(c, x + range(r, 14, 26), y, range(r, 26, 40) * scale, t, violet);
        } else {
          const n = 3 + Math.floor(r() * 4);
          for (let i = 0; i < n; i++)
            mushroom(c, x + (i - n / 2) * range(r, 7, 12), y, range(r, 4, 10.5), violet ? 2 : 1);
        }
        clover(c, x, y, 8, t);
        if (g.moths.length < 40 && r() < 0.6) g.moths.push([x, y - range(r, 40, 80), violet ? 1 : 0]);
        continue;
      }
      // Cumulative shares: fern, broadleaf, tall grass, flowers, mushrooms, (rest) clover.
      const share = (cool: number, warm: number, deep: number): number =>
        z.cool * cool + z.warm * warm + z.deep * deep;
      const wFern = share(0.36, 0.12, 0.2);
      const wLeaf = wFern + share(0.12, 0.1, 0.36);
      const wTall = wLeaf + share(0.14, 0.3, 0.07);
      const wFlower = wTall + share(0.1, 0.38, 0.07);
      const wShroom = wFlower + share(0.2, 0.05, 0.25);
      if (roll < wFern) {
        const n = narrow ? 1 : 1 + Math.floor(r() * 2.5);
        for (let i = 0; i < n; i++)
          fern(c, x + i * range(r, 18, 34), y, range(r, 40, 92) * scale, toneAt(BACK, x + i * 40, r, top.y));
      } else if (roll < wLeaf) {
        const big = 1 + z.deep * 0.35;
        broadleaf(c, x, y, range(r, 32, 70) * scale * big, t);
        if (r() < 0.5) broadleaf(c, x + range(r, 18, 30), y, range(r, 16, 28) * scale * big, t);
      } else if (roll < wTall) {
        tallGrass(c, x, y, t, scale);
        if (r() < 0.6) tallGrass(c, x + range(r, 14, 26), y, t, scale * 0.8);
      } else if (roll < wFlower) {
        // A drift of one kind of flower: warm where the light lands, pale and cool in shade.
        const set = sun > 0.45 || z.warm > 0.5 ? WARM_PETALS : COOL_PETALS;
        const col = set[Math.floor(r() * set.length)] as number;
        const n = 5 + Math.floor(r() * 8) + Math.round(z.warm * 6);
        const wide = range(r, 24, 54) * (1 + z.warm * 0.6);
        for (let i = 0; i < n; i++) {
          const fx = x + (r() + r() - 1) * wide;
          flower(c, fx, y, range(r, 12, 34) * scale, t, col);
        }
        clover(c, x, y, 10, t);
        if (z.warm > 0.5 && g.butterflies.length < 24) g.butterflies.push([x, y - range(r, 30, 70), r()]);
      } else if (roll < wShroom) {
        const n = 2 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++)
          mushroom(c, x + (i - n / 2) * range(r, 8, 14), y, range(r, 4.5, 11) * scale, 0);
      } else {
        clover(c, x, y, 14, t);
        clover(c, x + 16, y, 9, t);
      }
    }

    // Grass in drifts between and around them: low skirts, knee-high swells, bare gaps.
    const seed = top.x0 * 0.37 + top.y;
    for (let x = a; x < b; x += range(r, 3, 8)) {
      const patch = noise1(x / 80, seed) * 0.65 + noise1(x / 17, seed + 9) * 0.35;
      if (patch < 1 - PLANTS.grassCover * 2) continue;
      const k = smoothstep(1 - PLANTS.grassCover * 2, 0.7, patch);
      const tall = smoothstep(-0.1, 0.75, noise1(x / 110, seed + 31)) * k;
      const h0 = lerp(PLANTS.grassHeight[0] * 0.7, PLANTS.grassHeight[0] * 1.8, k) * scale;
      const h1 = lerp(PLANTS.grassHeight[0] + 5, PLANTS.grassHeight[1], tall) * scale * range(r, 0.75, 1.25);
      grassTuft(
        c,
        x,
        y,
        2 + Math.floor(r() * 3),
        h0,
        Math.max(h0 + 3, h1),
        range(r, 2, 7),
        toneAt(BACK, x, r, top.y),
      );
      // Fine wisps through and above the broad blades soften the whole stand.
      if (r() < PLANTS.fineShare) {
        fineTuft(
          c,
          x + range(r, -4, 4),
          y,
          4 + Math.floor(r() * 5),
          h0 * 1.1,
          Math.max(h0 + 6, h1 * 1.25),
          toneAt(BACK, x, r, top.y),
        );
      }
    }
    // A snapped trunk's crown: ferns in the rot, moss over the rim.
    if (top.kind === 'trunk') {
      for (const u of [0.28, 0.7]) {
        const fx = lerp(top.x0, top.x1, u + range(r, -0.06, 0.06));
        fern(c, fx, y, range(r, 30, 46), toneAt(BACK, fx, r, top.y));
      }
    }

    // Break the horizon: every few hundred px a tall dark clump stands in front of the walk line.
    if (isGround) {
      const fc: Ctx = { b: g.front, halo: g.halo, r };
      for (
        let x = a + range(r, 120, 380);
        x < b - 60;
        x += range(r, PLANTS.breakGap[0], PLANTS.breakGap[1])
      ) {
        if (blocked(x)) continue;
        const t = toneAt(FRONT, x, r, top.y);
        for (let i = 0; i < 2 + Math.floor(r() * 2); i++)
          tallGrass(fc, x + i * range(r, 10, 20), top.y + 6, t, range(r, 0.6, 0.85));
        if (r() < 0.5) fern(fc, x + range(r, 24, 44), top.y + 6, range(r, 34, 48), t);
      }
    }
    // Front fringe: low, dark, in clumps, never on thin boughs.
    if (top.kind !== 'branch') {
      const fc: Ctx = { b: g.front, halo: g.halo, r };
      for (let x = a + 2; x < b - 2; x += range(r, 4, 10)) {
        const patch = noise1(x / 60, seed + 77) * 0.65 + noise1(x / 19, seed + 78) * 0.35;
        if (patch < 1 - PLANTS.fringeCover * 2) continue;
        const k = smoothstep(1 - PLANTS.fringeCover * 2, 0.6, patch);
        const t = toneAt(FRONT, x, r, top.y);
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
        if (r() < PLANTS.fineShare * 0.6) fineTuft(fc, x, top.y + 4, 3 + Math.floor(r() * 3), 8, 22, t);
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
    const t = toneAt(tw.lit ? BACK : FRONT, tw.x, tr, tw.y);
    const n = 2 + Math.floor(tr() * 2);
    for (let i = 0; i < n; i++) spray(tc, tw.x, tw.y, tw.angle + range(tr, -0.9, 0.9), range(tr, 30, 56), t);
  }
  for (const l of info.lanterns) {
    g.halo.plant(l.x, l.y, 10, tr(), 0, 0, 0);
    g.halo.halo(l.x, l.y, 46, l.violet ? PALETTE.glowViolet : PALETTE.ember, PLANTS.haloAlpha * 1.3, 0.5);
  }
  for (const l of info.lee) fern(tc, l.x, l.y + 1, l.size, toneAt(BACK, l.x, tr, l.y));
  // Leaves along the thick vines that wind round the trunks.
  const ir = rngFor(31, 7);
  for (const v of info.ivy) {
    for (let i = 0; i < v.line.length / 2; i++) {
      if (ir() < 0.25) continue;
      const px = v.line[i * 2] as number;
      const py = v.line[i * 2 + 1] as number;
      const t = toneAt(BACK, px, ir, py);
      const a = ir() < 0.5 ? range(ir, -2.4, -0.7) : range(ir, 0.6, 2.4);
      const ll = range(ir, 8, 14);
      g.back.plant(px, py, ll, ir(), 1.4, 4, 0.3);
      const lit = Math.sin(a) < 0 ? t.lit : t.mid;
      g.back.leaf(px, py, a, ll, ll * 0.75, t.dark, lit, mix(lit, t.dark, 0.4), 0, 1, 3);
    }
  }
  // Hollows in the earth: a dim violet or cyan cluster and rootlets from the roof.
  const pr = rngFor(23, 9);
  const pc: Ctx = { b: g.back, halo: g.halo, r: pr };
  for (const k of info.pockets) {
    if (k.kind === 'crystal') {
      // A spray of crystal shards, cool and faint.
      const g = pr() < 0.5 ? PALETTE.glowViolet : PALETTE.glowCyan;
      for (let i = 0; i < 5; i++) {
        const cx = k.x + (i - 2) * range(pr, 6, 10);
        const len = range(pr, 9, 22) * (1 - Math.abs(i - 2) * 0.18);
        pc.b.plant(cx, k.y, 400, pr(), 0, 0, 0);
        pc.b.glow = 0.7;
        pc.b.leaf(
          cx,
          k.y + 2,
          -Math.PI / 2 + (i - 2) * 0.28 + range(pr, -0.1, 0.1),
          len,
          len * 0.34,
          mix(g, 0x1a2a4a, 0.7),
          mix(g, 0x1a2a4a, 0.35),
          mix(g, 0xffffff, 0.35),
          0,
          1,
          2,
        );
        pc.b.glow = 0;
      }
      pc.b.sync(pc.halo);
      pc.halo.halo(k.x, k.y - 8, 40, g, PLANTS.haloAlpha * 0.7);
      continue;
    }
    const violet = pr() < 0.6;
    const n = 2 + Math.floor(pr() * 3);
    for (let i = 0; i < n; i++)
      mushroom(pc, k.x + (i - (n - 1) / 2) * range(pr, 9, 14), k.y, range(pr, 4, 7.5), violet ? 2 : 1);
    for (let i = 0; i < 3; i++)
      dangleRoot(pc, k.x + range(pr, -k.w * 0.4, k.w * 0.4), k.roof, range(pr, 10, 24));
  }
  for (const u of info.unders) growUnder(g, u);
  for (const f of info.faces) growFace(g, f, info);
}

function growUnder(g: Garden, u: Under): void {
  const r = rngFor(u.x0, u.y(u.x0), 8);
  const c: Ctx = { b: g.back, halo: g.halo, r };
  const trail = u.trail ?? 'mixed';
  const long = u.kind === 'floating' ? 1 : u.kind === 'branch' ? 0.7 : 1.25;
  for (let x = u.x0 + range(r, 0, 14); x < u.x1; x += range(r, 9, 30)) {
    mossTuft(c, x, u.y(x), range(r, 8, 24), toneAt(BACK, x, r, u.y(x)));
  }
  const gap: [number, number] = trail === 'few' ? [70, 150] : trail === 'longRoots' ? [14, 34] : [28, 90];
  for (let x = u.x0 + range(r, 6, 40); x < u.x1; x += range(r, gap[0], gap[1])) {
    const y = u.y(x);
    const t = toneAt(BACK, x, r, y);
    if (trail === 'longRoots')
      dangleRoot(c, x, y, range(r, 60, 230) * (0.5 + 0.5 * Math.sin((Math.PI * (x - u.x0)) / (u.x1 - u.x0))));
    else if (trail === 'roots') {
      if (r() < 0.7) dangleRoot(c, x, y, range(r, 40, 130));
      else vine(c, x, y, range(r, 40, 120), t);
    } else if (trail === 'longVines') vine(c, x, y, range(r, 90, 240), t);
    else if (u.kind === 'floating' && r() < 0.5) dangleRoot(c, x, y, range(r, 30, 96));
    else vine(c, x, y, range(r, 30, 120) * long, t, u.kind !== 'trunk' || r() < 0.7);
  }
  if (u.kind === 'branch') {
    for (let x = u.x0 + 20; x < u.x1; x += range(r, 40, 80)) {
      spray(c, x, u.y(x) - 6, range(r, 0.5, 2.6), range(r, 26, 44), toneAt(BACK, x, r, u.y(x)));
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
  // A few fallen leaves adrift on the surface.
  for (let i = 0; i < 5; i++) {
    const lx = pool.x0 + 40 + r() * (pool.x1 - pool.x0 - 80);
    const col = AUTUMN[Math.floor(r() * AUTUMN.length)] as number;
    fc.b.plant(lx, pool.surface, 10, r(), 2.2, 3, 0);
    fc.b.fixedH = 1;
    fc.b.leaf(
      lx,
      pool.surface + 0.5,
      range(r, -0.3, 0.3) + (r() < 0.5 ? Math.PI : 0),
      range(r, 8, 12),
      3.4,
      mix(col, 0x5a4a2a, 0.4),
      col,
      mix(col, 0xffffff, 0.25),
      0,
      1,
      3,
    );
    fc.b.fixedH = null;
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
