/**
 * The near-mid ground of an open wood room (canopy r19, review r18 #1 and the director's plan §4 #2-#3: "textured
 * mid-ground masses, not fog cards", "silhouette life"): banks of moss behind the walked floors, in two ranks between
 * the far wood (mid, parallax 0.68) and the play, so the clearing has ground going back into the night instead of a
 * floor edge against fog. Pure painters in layer coordinates; layers/thicket.ts places and bakes them.
 *
 * A bank is a row of rounded moss clumps (a scalloped top, never flat: a flat lit top behind her reads as a ledge),
 * stippled inside at low contrast, moonlit along its crest in broken dabs, and lined with silhouettes standing out of
 * it: fern fronds, fiddleheads, grass blades, small toadstools. The far rank is paler and bluer, the near rank darker;
 * both are lighter than the near-black play ground and darker than the fog behind them.
 */
import { strand } from './pf-branch';
import { lerp, type Rng, range, rngFor, wobble } from './pf-shape';

type Fillable = { fill(o: { color: number; alpha?: number }): unknown };
export interface ThicketG {
  poly(pts: number[]): Fillable;
  circle(x: number, y: number, r: number): Fillable;
}

export interface BankTone {
  body: number;
  /** The clumps' inner shade and the stipple's dark. */
  shade: number;
  /** The moon on the crests. */
  lit: number;
  /** The silhouettes standing out of it. */
  sil: number;
}

export const THICKET = {
  /** Rooms that get the banks (open wood rooms with a floor to stand them behind). */
  rooms: ['cn-hub'] as readonly string[],
  /** Two ranks: parallax, clump height range above the floor line (px), how far up the floor line sits (px, the far
   *  rank stands further back so shows higher), bake scale, tone. */
  ranks: [
    {
      parallax: 0.8,
      h: [30, 170] as const,
      rise: 40,
      scale: 0.5,
      tone: { body: 0x1a3248, shade: 0x152a3e, lit: 0x5a84a0, sil: 0x142a40 },
    },
    {
      parallax: 0.9,
      h: [20, 140] as const,
      rise: 18,
      scale: 0.7,
      tone: { body: 0x0e1c2c, shade: 0x0a1622, lit: 0x45708a, sil: 0x0b1724 },
    },
  ],
  /** A floor top must be this long (px) and this low in the room (share of its height) to get a bank. */
  minRun: 480,
  minY: 0.5,
  /** How far below the floor line a bank's body reaches (hidden by the floor in front; px). */
  depth: 520,
  /** Silhouettes per 100 px of crest. */
  life: 1.6,
};

const mixc = (a: number, b: number, t: number): number => {
  const ch = (sh: number) => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The crest of a bank from x0 to x1 over floor line y: a union of round clumps (px step 6). */
function crest(
  r: Rng,
  x0: number,
  x1: number,
  y: number,
  h: readonly [number, number],
  seed: number,
): number[] {
  // (r19 first try: even round lumps read as cartoon cumulus.) Clumps of very different widths, flattened or tall,
  // swelling in long waves along the bank (a rise, a dip), the crest furred with a fine tooth.
  const lumps: Array<[number, number, number, number]> = [];
  for (let x = x0 - 60; x < x1 + 60; x += range(r, 20, 110)) {
    const rx = range(r, 22, 120);
    const ry = rx * range(r, 0.45, 1);
    const swell = 0.5 + 0.5 * wobble(x, seed, 700);
    lumps.push([x, y - lerp(h[0], h[1], swell * range(r, 0.6, 1)) + ry, rx, ry]);
  }
  const out: number[] = [];
  for (let x = x0; x <= x1 + 0.01; x += 6) {
    let top = y + 20;
    for (const [cx, cy, rx, ry] of lumps) {
      const d = (x - cx) / rx;
      if (Math.abs(d) < 1) top = Math.min(top, cy - ry * Math.sqrt(1 - d * d));
    }
    top += 5 * wobble(x, seed + 3, 22);
    // (Ends ease down into the floor.)
    const e = Math.min(1, (x - x0) / 160, (x1 - x) / 160);
    out.push(x, lerp(y + 20, top, Math.max(0, e) ** 0.7));
  }
  return out;
}

/** A fern frond: a curved stem with leaflets shortening toward its tip. */
function frond(g: ThicketG, r: Rng, x: number, y: number, len: number, dir: number, col: number): void {
  const stem: number[] = [];
  const bend = range(r, 0.5, 1.1) * dir;
  for (let q = 0; q <= 10; q++) {
    const t = q / 10;
    const a = -Math.PI / 2 + bend * t * t;
    stem.push(x + Math.cos(a) * len * t * 0.9 + bend * len * 0.15 * t * t, y + Math.sin(a) * len * t);
  }
  g.poly(strand(stem, 3.2, 0.9)).fill({ color: col });
  for (let q = 2; q < 10; q++) {
    const px = stem[q * 2] as number;
    const py = stem[q * 2 + 1] as number;
    const l = len * 0.22 * (1 - q / 11);
    for (const s of [-1, 1]) {
      const a = -Math.PI / 2 + bend * (q / 10) ** 2 + s * 1.1;
      g.poly([
        px,
        py,
        px + Math.cos(a - 0.25 * s) * l * 0.6,
        py + Math.sin(a - 0.25 * s) * l * 0.6 - 2,
        px + Math.cos(a) * l,
        py + Math.sin(a) * l,
        px + Math.cos(a + 0.3 * s) * l * 0.5,
        py + Math.sin(a + 0.3 * s) * l * 0.5 + 2,
      ]).fill({ color: col });
    }
  }
}

/** A fiddlehead: a stalk ending in a tight curl. */
function fiddle(g: ThicketG, x: number, y: number, len: number, dir: number, col: number): void {
  const pts: number[] = [];
  for (let q = 0; q <= 8; q++) pts.push(x + dir * 4 * (q / 8) ** 2, y - len * (q / 8));
  const cx = x + dir * 4;
  const cy = y - len;
  for (let q = 0; q <= 14; q++) {
    const a = Math.PI + (q / 14) * Math.PI * 1.7;
    const rr = 12 * (1 - (q / 14) * 0.7);
    pts.push(cx + dir * (Math.cos(a) * rr + 12), cy + Math.sin(a) * rr);
  }
  g.poly(strand(pts, 3.4, 0.5)).fill({ color: col });
}

/** One bank behind a floor run, in layer coordinates: floor line `y`, from x0 to x1. */
export function drawBank(g: ThicketG, x0: number, x1: number, y: number, rank: 0 | 1, seed: number): void {
  const R = THICKET.ranks[rank] as (typeof THICKET.ranks)[number];
  const T: BankTone = R.tone;
  const r = rngFor(seed, x0, y, 211 + rank);
  const top = crest(r, x0, x1, y, R.h, seed + rank * 101);
  const n = top.length / 2;
  g.poly([...top, x1, y + THICKET.depth, x0, y + THICKET.depth]).fill({ color: T.body });
  // Each clump's own form: shaded down its lower half (a darker scallop under the crest).
  for (let x = x0; x < x1; x += range(r, 40, 110)) {
    const i = Math.min(n - 1, Math.round((x - x0) / 6));
    const cy = top[i * 2 + 1] as number;
    const rr = range(r, 40, 110);
    g.circle(x, cy + rr * 1.15, rr).fill({ color: T.shade, alpha: 0.55 });
  }
  // Stipple: small marks inside, lighter near the crest, darker low (low contrast: depth, not noise).
  const nd = Math.round(((x1 - x0) * 170) / 380);
  for (let k = 0; k < nd; k++) {
    const i = Math.floor(r() * n);
    const tx = top[i * 2] as number;
    const ty = top[i * 2 + 1] as number;
    const d = r() ** 1.6 * 160;
    const up = d < 50;
    g.circle(tx + range(r, -6, 6), ty + 6 + d, range(r, 1.4, 3.6)).fill({
      color: up && r() < 0.4 ? mixc(T.body, T.lit, 0.3) : T.shade,
      alpha: range(r, 0.35, 0.7),
    });
  }
  // The moon on the crests, in broken dabs on the clumps' upper-left shoulders.
  for (let i = 2; i < n - 2; i++) {
    if (r() < 0.45) continue;
    const x = top[i * 2] as number;
    const yy = top[i * 2 + 1] as number;
    const prev = top[(i - 1) * 2 + 1] as number;
    if (yy > prev + 1) continue;
    g.circle(x + range(r, -2, 2), yy + range(r, 2, 6), range(r, 1.6, 3.4)).fill({
      color: T.lit,
      alpha: range(r, 0.3, 0.65),
    });
  }
  // Silhouettes standing out of it.
  const nl = Math.round(((x1 - x0) / 100) * THICKET.life);
  for (let k = 0; k < nl; k++) {
    const i = 3 + Math.floor(r() * (n - 6));
    const x = top[i * 2] as number;
    const yy = (top[i * 2 + 1] as number) + 8;
    const dir = r() < 0.5 ? -1 : 1;
    const kind = r();
    const s = rank ? 1 : 0.8;
    if (kind < 0.35) frond(g, r, x, yy, range(r, 60, 150) * s, dir, T.sil);
    else if (kind < 0.55) fiddle(g, x, yy, range(r, 34, 80) * s, dir, T.sil);
    else if (kind < 0.85) {
      for (let q = 0; q < 3 + Math.floor(r() * 5); q++) {
        const bx = x + range(r, -14, 14);
        const l = range(r, 24, 90) * s;
        const lean = range(r, -0.5, 0.5);
        g.poly(
          strand(
            [bx, yy, bx + lean * l * 0.4, yy - l * 0.55, bx + lean * l, yy - l],
            range(r, 2.5, 4.5),
            0.8,
          ),
        ).fill({
          color: T.sil,
        });
      }
    } else {
      // Toadstools: a stalk and a cap, the cap's rim catching the moon.
      for (let q = 0; q < 1 + Math.floor(r() * 3); q++) {
        const bx = x + q * range(r, 10, 22) * dir;
        const l = range(r, 16, 46) * s;
        const cw = l * range(r, 0.5, 0.8);
        g.poly(strand([bx, yy, bx + dir * 3, yy - l], 4, 0.2)).fill({ color: T.sil });
        const cap: number[] = [];
        for (let p = 0; p <= 10; p++) {
          const a = Math.PI + (p / 10) * Math.PI;
          cap.push(bx + dir * 3 + Math.cos(a) * cw, yy - l + Math.sin(a) * cw * 0.55);
        }
        g.poly(cap).fill({ color: T.sil });
        g.poly(strand(cap.slice(0, 10), 2.2, 0.4)).fill({ color: T.lit, alpha: 0.5 });
      }
    }
  }
}
