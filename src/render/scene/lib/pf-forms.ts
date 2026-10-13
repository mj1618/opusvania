/**
 * The big forms that keep the ground from being a ruled line on boxes (all baked, all free at
 * runtime, none of them collision):
 *
 *   paintBackRidge    mounded earth and moss behind the walk line, 5-45 px high in slow swells
 *   paintBanks        behind every step: a root-bound slope with boulders running from the upper
 *                     lip down to the lower ground, so the step hides behind a bank
 *   paintBankFronts   in the walk plane at every step: a stone lip or buttress roots over the
 *                     corner and down the face (never above the walk line)
 *   paintGreatForms   two or three large things per zone that break the line in silhouette:
 *                     fallen logs, half-buried boulders, a low root arch
 *   paintLandmarks    one authored set piece per zone, 250-350 px: the carved moth-stone by the
 *                     pool, the cocoon cluster under the great bough, the shrine in the old stand
 *
 * Everything that stands where the character can walk past it is in the back plane (relief
 * about 0.25-0.33: dark, barely lit), the convention for "behind the walk line".
 */
import type { Scene } from '../../../sim/scene';
import { mix, PALETTE } from './look';
import { limb, type Wood } from './pf-islands';
import type { Paint } from './pf-paint';
import { paintRock, type RockMoss } from './pf-rock';
import {
  blob,
  chaikin,
  clamp,
  cubic,
  lerp,
  noise1,
  quad,
  range,
  ribbon,
  rngFor,
  smoothstep,
  wander,
  wobble,
} from './pf-shape';
import type { TerrainInfo } from './pf-terrain';

export interface FormKit {
  mossTone(x: number, y: number, seed: number, dull: number): { dark: number; body: number };
  back: number;
  backDeep: number;
  abyss: number;
  bark: number;
  rootWood: number;
  earth: readonly number[];
  stone: readonly number[];
}

export interface GroundSeg {
  x0: number;
  x1: number;
  y: number;
  pool: boolean;
}

export const FORMS = {
  /** Back ridge: base height and the height of its slow and quicker swells, px. */
  ridge: [4, 26, 10] as const,
  /** Bank slope length as a multiple of the step height. */
  bankRun: 1.1,
  /**
   * Steps at least this high are cliffs she cannot jump (the bluff's faces): their bank is this much
   * shorter, and the great buttress stands as a column instead of leaning out as far as it is high.
   */
  tallStep: 170,
  tallRun: 0.5,
  /** Water surface above the pool floor (TERRAIN.waterDepth). */
  waterDepth: 50,
} as const;

const haze = (c: number, k: number): number => mix(c, PALETTE.fogMid, k);

/** How high the mound behind the walk line stands at x (before fading toward pool edges). */
export function ridgeHeight(x: number): number {
  const a = (noise1(x / 310, 801) + 1) * 0.5;
  const b = (noise1(x / 120, 802) + 1) * 0.5;
  // The raised centre block swells under the high ledge (its top must not be a ruled line).
  const block = 12 * Math.exp(-(((x - 2900) / 190) ** 2)) + 8 * Math.exp(-(((x - 2660) / 70) ** 2));
  return (
    block +
    FORMS.ridge[0] +
    FORMS.ridge[1] * a ** 1.8 +
    FORMS.ridge[2] * b * a +
    Math.max(0, noise1(x / 37, 803)) * 4
  );
}

function backWood(kit: FormKit): Wood {
  return {
    col: mix(kit.backDeep, kit.back, 0.35),
    lit: mix(kit.back, 0x4a6a6a, 0.25),
    dark: mix(kit.backDeep, kit.abyss, 0.6),
  };
}

function backMoss(kit: FormKit, x: number, y: number, seed: number, amount = 0.8): RockMoss {
  const t = kit.mossTone(x, y, seed, 0);
  return {
    dark: haze(mix(t.dark, kit.back, 0.5), 0.2),
    body: haze(mix(t.body, kit.back, 0.5), 0.2),
    amount,
    flag: 0.6,
  };
}

function backStone(kit: FormKit, k: number): number {
  return haze(mix(kit.backDeep, kit.stone[k % 2 ? 2 : 6] as number, 0.36), 0.06);
}

/** A dim mossy crest along the top of a back-plane form (`line` runs left to right). */
function crest(p: Paint, line: number[], kit: FormKit, seed: number, k = 1, lift = 0): void {
  const mx = line[Math.floor(line.length / 4) * 2] as number;
  const my = line[Math.floor(line.length / 4) * 2 + 1] as number;
  const t = kit.mossTone(mx, my, seed, 0);
  p.solid(
    ribbon(
      line.map((v, i) => (i % 2 ? v + 5 : v)),
      (u) => (9 + wobble(u * 400, seed, 40) * 4) * Math.sin(Math.PI * clamp(u, 0.02, 0.98)) ** 0.4,
    ),
    haze(mix(t.dark, kit.back, 0.55 - lift * 2), 0.15),
    0.3 + lift,
    { moss: 0.5 + lift * 2 },
    0.9 * k,
  );
  p.solid(
    ribbon(
      line.map((v, i) => (i % 2 ? v + 2 : v)),
      (u) => (3.4 + wobble(u * 400, seed + 1, 30)) * Math.sin(Math.PI * clamp(u, 0.02, 0.98)) ** 0.4,
    ),
    haze(mix(t.body, kit.back, 0.4 - lift * 2), 0.15),
    0.33 + lift,
    { moss: 0.6 + lift * 2 },
    0.85 * k,
  );
}

// ---------------------------------------------------------------------------------------------

/** Mounded earth and moss standing behind the walk line of every ground segment. */
export function paintBackRidge(
  p: Paint,
  segs: GroundSeg[],
  kit: FormKit,
  W: number,
  calm: Array<[number, number, number]> = [],
): void {
  segs.forEach((s, i) => {
    if (s.pool) return;
    const prev = segs[i - 1];
    const next = segs[i + 1];
    const xa = prev ? s.x0 : -200;
    const xb = next ? s.x1 : W + 200;
    // Fade toward a pool (the water's edge stays clean) and toward the low side of a step (the
    // bank slope takes over there).
    const fade = (x: number): number =>
      (calm.some(([c0, c1, cy]) => x > c0 - 60 && x < c1 + 60 && Math.abs(cy - s.y) < 40) ? 0.35 : 1) *
      Math.min(
        prev && (prev.pool || prev.y < s.y) ? smoothstep(xa, xa + 90, x) : 1,
        next && (next.pool || next.y < s.y) ? smoothstep(xb, xb - 90, x) : 1,
      );
    const SECT = 190;
    for (let x0 = xa; x0 < xb; x0 += SECT) {
      const x1 = Math.min(xb, x0 + SECT + 12);
      const top: number[] = [];
      for (let x = x0; x <= x1 + 0.01; x += 9) top.push(x, s.y - ridgeHeight(x) * (0.15 + 0.85 * fade(x)));
      const pts = top.slice();
      pts.push(x1, s.y + 26, x0, s.y + 26);
      const t = kit.mossTone((x0 + x1) / 2, s.y, 811, 0);
      p.solid(pts, haze(mix(mix(t.dark, kit.earth[1] as number, 0.5), kit.backDeep, 0.5), 0.12), 0.29, {
        moss: 0.3,
      });
    }
    // Crest in runs, broken where the mound is low.
    let run: number[] = [];
    const flush = (): void => {
      if (run.length >= 10) crest(p, run, kit, 820 + i + run.length);
      run = [];
    };
    for (let x = xa; x <= xb; x += 9) {
      const h = ridgeHeight(x) * (0.15 + 0.85 * fade(x));
      if (h > 9) run.push(x, s.y - h);
      else flush();
    }
    flush();
    // Cushions of height so the light finds lumps on it.
    const r = rngFor(830, s.x0);
    for (let x = xa + range(r, 10, 60); x < xb; x += range(r, 26, 90)) {
      const h = ridgeHeight(x) * (0.15 + 0.85 * fade(x));
      if (h < 12) continue;
      const rad = range(r, 8, 18);
      p.bump(blob(x, s.y - h * range(r, 0.3, 0.8), rad * 1.5, rad * 0.8, x, 0.3, 11), 0.33, {
        moss: 0.4,
        alpha: 0.7,
      });
    }
  });
}

interface Step {
  fx: number;
  hi: number;
  lo: number;
  /** Outward: toward the lower side. */
  d: -1 | 1;
  pool: boolean;
  index: number;
}

function steps(segs: GroundSeg[]): Step[] {
  const out: Step[] = [];
  segs.forEach((s, i) => {
    const next = segs[i + 1];
    if (!next || next.y === s.y) return;
    out.push({
      fx: s.x1,
      hi: Math.min(s.y, next.y),
      lo: Math.max(s.y, next.y),
      d: next.y > s.y ? 1 : -1,
      pool: s.pool || next.pool,
      index: i,
    });
  });
  return out;
}

/** Back plane: the slope each step hides behind. Call before the ground is painted. */
export function paintBanks(
  p: Paint,
  segs: GroundSeg[],
  info: TerrainInfo,
  kit: FormKit,
  trunkXs: number[] = [],
): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const st of steps(segs)) {
    const r = rngFor(840, st.fx);
    const { fx, hi, lo, d } = st;
    const H = lo - hi;
    if (st.pool) {
      // At the pool only an outcrop standing behind the bank's edge: the water stays open.
      for (let k = 0; k < 2; k++) {
        const w = range(r, 34, 56) * (k ? 0.6 : 1);
        const cx = fx - d * (30 + k * 62 + range(r, 0, 16));
        paintRock(p, {
          cx,
          cy: hi - w * 0.3,
          rx: w,
          ry: w * range(r, 0.6, 0.8),
          seed: 841 + st.index * 7 + k,
          color: backStone(kit, k),
          dark: mix(kit.backDeep, kit.abyss, 0.5),
          h: 0.25,
          rise: 0.07,
          baseY: hi + 16,
          tilt: range(r, -0.3, 0.3),
          rough: 1.15,
          moss: backMoss(kit, cx, hi, 842 + k),
          ground: 0.9,
        });
      }
      continue;
    }
    const underTrunk = trunkXs.some((tx) => Math.abs(tx - fx) < 40);
    // A tall face (the bluff) gets a steep shoulder of earth: at the usual run it was a 45 degree
    // slope from the lower ground to the lip, which is a ramp however dark it is painted.
    const tall = H >= FORMS.tallStep;
    const L = H * FORMS.bankRun * range(r, 0.9, 1.15) * (underTrunk ? 0.6 : tall ? FORMS.tallRun : 1);
    const xs = fx - d * 54;
    const xe = fx + d * L;
    spans.push([Math.min(xs, xe) - 40, Math.max(xs, xe) + 40]);
    const tc = 54 / (54 + L);
    const shoulder = range(r, 10, 18);
    const yAt = (t: number): number => {
      const x = lerp(xs, xe, t);
      if (t <= tc) {
        const q = t / tc;
        return hi - ridgeHeight(x) * (1 - q) * 0.6 - shoulder * q ** 1.5 - 4;
      }
      const u = (t - tc) / (1 - tc);
      // Steep and bulging under the lip, easing out into talus on the lower ground.
      const fall = 1 - (1 - u) ** 3.2;
      return (
        hi -
        shoulder * (1 - u) ** 3 -
        4 +
        (lo + 10 - hi + shoulder) * fall +
        wobble(x, 843 + st.index, 46) * 9 * Math.sin(Math.PI * u) +
        Math.max(0, wobble(x, 844 + st.index, 19)) * 5 * Math.sin(Math.PI * u)
      );
    };
    const n = Math.max(12, Math.round((54 + L) / 10));
    const top: number[] = [];
    for (let k = 0; k <= n; k++) top.push(lerp(xs, xe, k / n), yAt(k / n));
    const body = top.slice();
    body.push(xe, lo + 30, xs, lo + 30);
    const t0 = kit.mossTone(fx, hi, 845, 0);
    // Clearly behind the walk line (she cannot climb it): back-plane dark, overgrown, steep at
    // the top. The face's corner is hidden by the roots and stones of paintBankFronts instead.
    const earth = haze(mix(mix(t0.dark, kit.earth[1] as number, 0.5), kit.backDeep, 0.45), 0.08);
    p.solid(body, earth, 0.3, { moss: 0.25 });
    // Soft relief so the slope has a belly.
    for (let k = 1; k <= 2; k++) {
      const inner = top.map((v, j) => (j % 2 ? v + k * 13 : v));
      inner.push(xe - d * k * 20, lo + 30, xs, lo + 30);
      p.bump(inner, 0.3 + k * 0.012, { moss: 0.25 });
    }
    crest(p, top, kit, 846 + st.index, 1, 0.03);
    // Buttress roots running down it from under the lip.
    const slopeWood: Wood = {
      col: mix(kit.backDeep, kit.rootWood, 0.4),
      lit: mix(kit.back, 0x4a6a6a, 0.3),
      dark: mix(kit.backDeep, kit.abyss, 0.6),
    };
    for (let k = 0; k < 3; k++) {
      const t1 = clamp(tc + (1 - tc) * range(r, 0.55, 1.02), 0, 1);
      const sx = fx - d * range(r, 6, 30);
      const ex = lerp(xs, xe, t1);
      const ey = yAt(t1) + 8;
      const lift = k === 1 ? range(r, 16, 30) : range(r, -2, 8);
      const mt = lerp(tc, t1, 0.5);
      const line = wander(
        cubic(
          sx,
          hi + 4,
          fx + d * 16,
          yAt(tc + 0.04) - lift * 0.4,
          lerp(xs, xe, mt),
          yAt(mt) - lift,
          ex,
          ey,
          16,
        ),
        4,
        847 + st.index * 5 + k,
        40,
      );
      const w0 = range(r, 22, 34) - k * 4;
      limb(
        p,
        line,
        (t) => w0 * (1 - t * 0.72) + 4 + Math.max(0, Math.sin(t * 12 + k)) * 3,
        slopeWood,
        0.3,
        0.05,
        fx + k,
        {
          bark: 0.8,
          grain: 3,
          lit: tall ? 0.16 : 0.35,
        },
      );
    }
    // Boulders slumped on it.
    for (const [k, u] of [range(r, 0.26, 0.4), range(r, 0.62, 0.8)].entries()) {
      const t = tc + (1 - tc) * u;
      const w = range(r, 30, 46) * (k ? 0.75 : 1);
      // Under a trunk the stilt roots own the corner: no boulders there.
      if (underTrunk) continue;
      const cx = lerp(xs, xe, t);
      const cy = yAt(t);
      paintRock(p, {
        cx,
        cy: cy - w * 0.22,
        rx: w,
        ry: w * range(r, 0.62, 0.82),
        seed: 848 + st.index * 3 + k,
        color: backStone(kit, k + st.index),
        dark: mix(kit.backDeep, kit.abyss, 0.5),
        h: 0.27,
        rise: 0.07,
        baseY: cy + w * 0.5,
        tilt: d * range(r, 0.1, 0.35),
        rough: 1.15,
        moss: backMoss(kit, cx, cy, 849 + k),
        ground: 0.9,
      });
    }
    info.lee.push(
      { x: lerp(xs, xe, tc + (1 - tc) * 0.5), y: yAt(tc + (1 - tc) * 0.5) + 4, size: range(r, 40, 56) },
      { x: lerp(xs, xe, tc + (1 - tc) * 0.9), y: lo + 2, size: range(r, 34, 46) },
    );
  }
  return spans;
}

/** Walk plane: a stone lip or buttress roots over each step's corner and down its face. */
export function paintBankFronts(p: Paint, segs: GroundSeg[], kit: FormKit, trunkXs: number[] = []): void {
  const backRoot = backWood(kit);
  for (const st of steps(segs)) {
    const r = rngFor(860, st.fx);
    const { fx, hi, lo, d } = st;
    const E = kit.earth;
    const stony = st.index % 2 === 0;
    if (stony || st.pool) {
      // A stone outcrop set in the corner: its worn top is flush with the walk line, its nose
      // bulges out past the face.
      const c = kit.stone[(st.index * 3) % kit.stone.length] as number;
      for (let k = 0; k < (st.pool ? 1 : 2); k++) {
        const w = k ? range(r, 20, 28) : range(r, 34, 46);
        const cx = fx - d * (k ? -4 : 20) + (k ? d * 6 : 0);
        const cy = k ? hi + 52 + range(r, 0, 16) : hi + 22;
        paintRock(p, {
          cx,
          cy,
          rx: w,
          ry: w * (k ? 0.7 : 0.78),
          seed: 861 + st.index * 5 + k,
          color: mix(c, E[2] as number, k ? 0.5 : 0.3),
          dark: E[4] as number,
          light: mix(c, 0xa8c0b8, 0.25),
          h: 0.62,
          rise: 0.12,
          topY: hi + 2,
          tilt: d * range(r, 0.05, 0.25),
          rough: 1.1,
          boxy: 2.4,
          ground: 0.6,
          cracks: k ? 0 : 2,
        });
      }
    }
    if (st.pool) {
      // The basin must not be a rectangle: stones bulge into the water at the waterline, half way
      // down and in the floor corner, and a root comes over the lip and dips in.
      const surface = lo - FORMS.waterDepth;
      const c = kit.stone[(st.index * 5 + 1) % kit.stone.length] as number;
      const stones: Array<[number, number, number, number]> = [
        [fx + d * range(r, 8, 16), surface + 4, 30, 22],
        [fx + d * range(r, 44, 58), surface + 10, 15, 11],
        [fx + d * range(r, 4, 10), lerp(surface, lo, 0.6), 22, 17],
        [fx + d * range(r, 20, 30), lo - 10, 50, 26],
        [fx + d * range(r, 74, 92), lo - 2, 24, 13],
      ];
      for (const [k, [cx, cy, rx, ry]] of stones.entries()) {
        paintRock(p, {
          cx,
          cy,
          rx,
          ry,
          seed: 874 + st.index * 7 + k,
          color: mix(c, E[2] as number, 0.4 + (k % 2) * 0.15),
          dark: E[4] as number,
          h: 0.6,
          rise: 0.12,
          ...(k >= 3 ? { baseY: lo + 8 } : {}),
          tilt: d * range(r, -0.2, 0.3),
          rough: 1.15,
          moss: { ...kit.mossTone(cx, cy, 875 + k, 0.4), amount: k < 2 ? 0.9 : 0.4 },
          ground: 0.7,
        });
      }
      const poolWood: Wood = {
        col: mix(kit.rootWood, E[0] as number, 0.3),
        lit: mix(kit.rootWood, 0x6a8a80, 0.4),
        dark: E[4] as number,
      };
      for (let k = 0; k < 2; k++) {
        const sx = fx - d * range(r, 20, 60);
        const ex = fx + d * range(r, 34, 70);
        const line = wander(
          cubic(
            sx,
            hi + 9,
            fx + d * 10,
            hi + 8,
            fx + d * 26,
            lerp(hi, surface, 0.7),
            ex,
            surface + range(r, 16, 60),
            14,
          ),
          3,
          876 + st.index * 3 + k,
          30,
        ).map((v, j) => (j % 2 ? Math.max(v, hi + 6) : v));
        limb(p, line, (t) => (13 - k * 4) * (1 - t * 0.7) + 2, poolWood, 0.66, 0.07, fx + 30 + k, {
          bark: 0.3,
          lit: 0.3,
        });
      }
      continue;
    }
    // Roots that come over the lip, stand off the face and go to ground with a toe.
    const wood: Wood = {
      col: mix(kit.rootWood, E[0] as number, 0.3),
      lit: mix(kit.rootWood, 0x6a8a80, 0.4),
      dark: E[4] as number,
    };
    const count = stony ? 1 : 3;
    for (let k = 0; k < count; k++) {
      const sx = fx - d * range(r, 16, 58);
      const off = range(r, 10, 24);
      const toe = range(r, 34, 70);
      const line = wander(
        cubic(
          sx,
          hi + 9,
          fx + d * off,
          hi + 16,
          fx + d * (off + 4),
          lerp(hi, lo, 0.8),
          fx + d * toe,
          lo + 5,
          16,
        ),
        4,
        862 + st.index * 7 + k,
        36,
      );
      const flat = line.map((v, j) => (j % 2 ? Math.max(v, hi + 6) : v));
      const w0 = range(r, 13, 21) - k * 2;
      p.tint(
        ribbon(
          flat.map((v, j) => (j % 2 ? v + 4 : v - d * 2)),
          (t) => (w0 + 8) * (1 - t * 0.6) + 2,
        ),
        E[4] as number,
        0.5,
      );
      limb(
        p,
        flat,
        (t) => w0 * (1 - t * 0.6) + 2 + Math.max(0, Math.sin(t * 13 + k)) * 2,
        wood,
        0.66,
        0.08,
        fx + k,
        {
          bark: 0.3,
          grain: 2,
          lit: 0.35,
        },
      );
    }
    // The great buttress: over the lip, standing well off the face (the square corner is lost in
    // the dark behind it), near-vertical down the face, its toe sweeping out along the lower ground.
    const H = lo - hi;
    const underTrunk = trunkXs.some((tx) => Math.abs(tx - fx) < 40);
    const tall = H >= FORMS.tallStep;
    {
      // On a tall face it stands as a column with a short toe: leaning out as far as the face is
      // high it was a lit 45 degree ramp from the lower ground to the lip (the bluff's east side).
      const off = tall ? range(r, 14, 22) : range(r, 26, 36);
      const toe = tall ? range(r, 50, 74) : H * range(r, 0.85, 1.1);
      const line = wander(
        cubic(
          fx - d * range(r, 60, 90),
          hi + 12,
          fx + d * off,
          hi + 6,
          fx + d * (off + 2),
          lo - 16,
          fx + d * toe,
          lo + 6,
          20,
        ),
        3,
        866 + st.index,
        40,
      ).map((v, j) => (j % 2 ? Math.max(v, hi + 7) : v));
      const w0 = range(r, 30, 36);
      // The hollow between root and face.
      const gap: number[] = [fx - d * 6, hi + 14];
      for (let j = 6; j < line.length / 2; j++) gap.push(line[j * 2] as number, line[j * 2 + 1] as number);
      gap.push(fx - d * 6, lo + 8);
      p.tint(gap, kit.abyss, 0.75);
      p.tint(
        ribbon(
          line.map((v, j) => (j % 2 ? v + 5 : v - d * 3)),
          (t) => (w0 + 10) * (1 - t * 0.55) + 2,
        ),
        E[4] as number,
        0.55,
      );
      limb(
        p,
        line,
        (t) =>
          w0 * (1 - t * 0.62) +
          3 +
          Math.max(0, Math.sin(t * 11 + st.index)) * 3 +
          smoothstep(0.5, 0.75, t) * 5,
        wood,
        tall ? 0.6 : 0.68,
        tall ? 0.07 : 0.1,
        fx + 9,
        { bark: tall ? 0.5 : 0.3, grain: 4, lit: tall ? 0.14 : 0.3 },
      );
      // A lesser root forking off it half way down.
      const [bx, by] = [line[20] as number, line[21] as number];
      const fork = wander(
        quad(bx, by, bx + d * 26, lerp(by, lo, 0.6), bx + d * range(r, 50, 80), lo + 6, 9),
        2,
        867,
        20,
      );
      limb(p, fork, (t) => 12 * (1 - t * 0.6) + 2, wood, 0.66, 0.06, fx + 10, { bark: 0.3, lit: 0.3 });
    }
    if (tall) {
      // A cliff of root-bound earth, not a cut block: stones bedded in the face at uneven heights
      // (flush, their noses a few px proud of it), a second root clinging to it lower down, and
      // rootlets hanging under the lip.
      const n = Math.round(H / 64);
      for (let k = 0; k < n; k++) {
        const w = range(r, 13, 24);
        const cy = lerp(hi + 44, lo - 40, (k + range(r, 0.15, 0.85)) / n);
        const cx = fx - d * range(r, 4, 12);
        const c = kit.stone[(st.index * 2 + k * 3) % kit.stone.length] as number;
        paintRock(p, {
          cx,
          cy,
          rx: w,
          ry: w * range(r, 0.6, 0.85),
          seed: 880 + st.index * 9 + k,
          color: mix(c, E[2] as number, 0.55),
          dark: E[4] as number,
          h: 0.58,
          rise: 0.09,
          tilt: d * range(r, -0.3, 0.3),
          rough: 1.2,
          moss: { ...kit.mossTone(cx, cy, 881 + k, 0.3), amount: k % 2 ? 0.7 : 0.25 },
          ground: 0.8,
        });
      }
      const y0 = lerp(hi, lo, range(r, 0.3, 0.42));
      const cling = wander(
        cubic(
          fx - d * 14,
          y0,
          fx + d * range(r, 8, 16),
          lerp(y0, lo, 0.3),
          fx + d * 6,
          lerp(y0, lo, 0.75),
          fx + d * range(r, 26, 44),
          lo + 5,
          14,
        ),
        4,
        882 + st.index,
        44,
      );
      p.tint(
        ribbon(cling, (t) => 20 * (1 - t * 0.5) + 2),
        E[4] as number,
        0.5,
      );
      limb(
        p,
        cling,
        (t) => 15 * (1 - t * 0.45) + 2 + Math.max(0, Math.sin(t * 9 + 1)) * 3,
        wood,
        0.6,
        0.06,
        fx + 12,
        {
          bark: 0.5,
          grain: 2,
          lit: 0.14,
        },
      );
      for (let k = 0; k < 5; k++) {
        const gx = fx + d * range(r, -8, 6);
        const len = range(r, 26, 78);
        p.solid(
          ribbon(
            wander(
              [
                gx,
                hi + 12,
                gx + d * range(r, 0, 6),
                hi + 12 + len * 0.5,
                gx + d * range(r, -4, 8),
                hi + 12 + len,
              ],
              2,
              gx,
              14,
            ),
            (t) => 2.6 * (1 - t) + 0.6,
          ),
          mix(kit.rootWood, E[4] as number, 0.45),
          0.5,
        );
      }
    }
    // Stones slumped at the foot, low (ankle to shin), half in the moss.
    for (let k = 0; k < (underTrunk ? 1 : 3); k++) {
      const w = range(r, 16, 30) * (k === 0 ? 1.2 : 0.8);
      const cx = fx + d * (range(r, 22, 46) + k * range(r, 40, 62));
      const c = kit.stone[(st.index + k * 3) % kit.stone.length] as number;
      paintRock(p, {
        cx,
        cy: lo - w * 0.12,
        rx: w,
        ry: w * range(r, 0.55, 0.7),
        seed: 868 + st.index * 5 + k,
        color: mix(c, E[2] as number, 0.45),
        dark: E[4] as number,
        h: 0.6,
        rise: 0.1,
        baseY: lo + 8,
        tilt: d * range(r, -0.1, 0.3),
        rough: 1.1,
        moss: { ...kit.mossTone(cx, lo, 869 + k, 0), amount: 0.7 },
        ground: 0.8,
      });
    }
    if (underTrunk) {
      // The corner goes into the stilt-root tangle: shadow over the face, and roots leaning down
      // from the trunk's foot onto the block's top.
      const shade: number[] = [];
      for (let y = hi + 8; y <= lo + 4; y += 12) shade.push(fx - d * (46 + wobble(y, 870, 30) * 12), y);
      shade.push(fx + d * 30, lo + 4, fx + d * 30, hi + 8);
      p.tint(shade, kit.abyss, 0.6);
      for (let k = 0; k < 3; k++) {
        const sx = fx + d * range(r, 20, 70);
        const ex = fx - d * range(r, 20, 110);
        const line = wander(
          quad(sx, hi - range(r, 90, 130), lerp(sx, ex, 0.7), hi - range(r, 40, 80), ex, hi + 8, 12),
          4,
          871 + k,
          40,
        );
        limb(p, line, (t) => (20 - k * 4) * (1 - t * 0.5) + 3, backRoot, 0.3, 0.06, fx + 20 + k, {
          bark: 0.8,
          grain: 2,
          lit: 0.3,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------

type Form = { kind: 'log' | 'boulder' | 'arch'; x: number; size: number; flip?: boolean };

/** Where the big forms stand (world x of their middle), a few per zone, clear of the routes' props. */
const GREAT: readonly Form[] = [
  { kind: 'boulder', x: 610, size: 0.8 },
  { kind: 'log', x: 1150, size: 1 },
  // (None in the fight spots: x 1880-2300, the centre block, 4160-4600. Creatures read against mist there.)
  { kind: 'boulder', x: 2440, size: 0.7, flip: true },
  { kind: 'arch', x: 5290, size: 0.75 },
  { kind: 'boulder', x: 4790, size: 0.72 },
  { kind: 'log', x: 5580, size: 0.9 },
];

/** Back plane: fallen logs, half-buried boulders, a root arch. Returns the x spans they occupy. */
export function paintGreatForms(p: Paint, info: TerrainInfo, kit: FormKit): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const wood = backWood(kit);
  GREAT.forEach((f, index) => {
    const r = rngFor(870, f.x);
    const gy = info.groundY(f.x) + 14;
    const dir = f.flip ? -1 : 1;
    if (f.kind === 'boulder') {
      const w = 104 * f.size;
      const h = 138 * f.size;
      // A great one leaning, a lesser one shouldered against it, a small one in front.
      const parts = [
        { dx: dir * w * 1.05, w: w * 0.55, h: h * 0.5, tilt: -dir * 0.3 },
        { dx: 0, w, h, tilt: dir * 0.16 },
        { dx: -dir * w * 0.9, w: w * 0.34, h: h * 0.3, tilt: dir * 0.2 },
      ];
      parts.forEach((q, k) => {
        const cx = f.x + q.dx;
        paintRock(p, {
          cx,
          cy: gy - q.h * 0.42,
          rx: q.w,
          ry: q.h * 0.6,
          seed: 871 + index * 9 + k,
          color: backStone(kit, k + index),
          dark: mix(kit.backDeep, kit.abyss, 0.5),
          light: mix(backStone(kit, k), kit.stone[1] as number, 0.3),
          h: 0.25,
          rise: 0.08,
          baseY: gy + 12,
          tilt: q.tilt,
          rough: 1.2,
          boxy: 2.4,
          moss: backMoss(kit, cx, gy, 872 + k, 0.9),
          cracks: k === 1 ? 3 : 1,
          ground: 0.9,
        });
      });
      // A root over its shoulder and a fern in its lee.
      const line = wander(
        cubic(
          f.x - dir * w * 0.5,
          gy - h * 0.86,
          f.x + dir * w * 0.2,
          gy - h * 0.98,
          f.x + dir * w * 0.8,
          gy - h * 0.5,
          f.x + dir * w * 1.1,
          gy + 4,
          14,
        ),
        4,
        873 + index,
        40,
      );
      limb(p, line, (t) => 17 * (1 - t * 0.6) + 3, wood, 0.3, 0.05, f.x, { bark: 0.8, grain: 2, lit: 0.3 });
      info.lee.push({ x: f.x - dir * w * 1.25, y: gy - 12, size: range(r, 44, 60) });
      spans.push([f.x - w * 1.7, f.x + w * 1.7]);
    } else if (f.kind === 'log') {
      // A fallen trunk lying along the ground: the butt end propped on its own root plate, the
      // far end broken and sunk in the moss.
      const len = 300 * f.size;
      // It lies LOW (below her waist): mist must show above it, or she is lost against it.
      const girth = 44 * f.size;
      const xa = f.x - (dir * len) / 2;
      const xb = f.x + (dir * len) / 2;
      const line = wander(
        quad(xa, gy - girth * 0.5, f.x, gy - girth * 0.4, xb, gy - girth * 0.12, 16),
        4,
        874 + index,
        90,
      );
      limb(
        p,
        line,
        (t) =>
          girth * (1 - t * 0.34) +
          Math.max(0, Math.sin(t * 9 + index)) * 5 +
          10 * Math.exp(-(((t - 0.4) / 0.07) ** 2)) -
          smoothstep(0.9, 1, t) * girth * 0.25,
        wood,
        0.25,
        0.08,
        f.x,
        { bark: 0.85, grain: 9, lit: 0.4 },
      );
      // The root plate: a fan of torn roots at the butt.
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.42 + range(r, -0.12, 0.12);
        const rl = girth * range(r, 0.6, 1.0);
        const ex = xa - dir * Math.abs(Math.cos(a)) * rl * 0.45 - dir * 8;
        const ey = Math.min(gy + 6, gy - girth * 0.55 + Math.sin(a) * rl);
        limb(
          p,
          wander(
            quad(
              xa + dir * 10,
              gy - girth * 0.58,
              xa - dir * 10,
              lerp(gy - girth * 0.55, ey, 0.4),
              ex,
              ey,
              7,
            ),
            3,
            875 + k,
            20,
          ),
          (t) => girth * 0.3 * (1 - t) ** 0.8 + 2.5,
          wood,
          0.26,
          0.05,
          f.x + k,
          { bark: 0.8, lit: 0.3 },
        );
      }
      p.solid(
        blob(xa - dir * 4, gy - girth * 0.5, girth * 0.3, girth * 0.4, 876 + index, 0.3, 14),
        wood.dark,
        0.2,
      );
      // A limb stub standing up from it, and the splintered far end.
      const [sx, sy] = [lerp(xa, xb, 0.62), gy - girth * 0.72];
      const stub = wander(
        quad(sx, sy + 12, sx + dir * 14, sy - 50, sx + dir * 46, sy - range(r, 50, 70), 9),
        3,
        877 + index,
        30,
      );
      limb(p, stub, (t) => 24 * (1 - t) ** 0.8 + 3, wood, 0.26, 0.06, f.x + 3, {
        bark: 0.8,
        grain: 2,
        lit: 0.35,
      });
      info.twigs.push({
        x: stub[stub.length - 2] as number,
        y: stub[stub.length - 1] as number,
        angle: -Math.PI / 2 + dir * 0.4,
      });
      for (let k = 0; k < 3; k++) {
        const oy = gy - girth * 0.34 + k * 9;
        p.solid(
          ribbon(
            [xb - dir * 8, oy, xb + dir * range(r, 10, 34), oy + range(r, -8, 8)],
            (t) => 9 * (1 - t) + 1,
          ),
          wood.col,
          0.26,
          { bark: 0.8 },
        );
      }
      // Moss saddles over the top, and shelf fungi on the flank.
      const topLine: number[] = [];
      for (let k = 2; k <= 13; k++) {
        const t = k / 16;
        topLine.push(line[k * 2] as number, (line[k * 2 + 1] as number) - (girth * (1 - t * 0.34)) / 2 + 1);
      }
      crest(p, topLine, kit, 878 + index, 1);
      for (let k = 0; k < 3; k++) {
        const t = range(r, 0.2, 0.75);
        const bx = lerp(xa, xb, t);
        const by = gy - girth * range(r, 0.25, 0.45);
        const bw = range(r, 9, 16);
        p.solid(
          chaikin(
            [
              bx - bw,
              by,
              bx - bw * 0.5,
              by - 3,
              bx + bw * 0.6,
              by - 3,
              bx + bw,
              by,
              bx + bw * 0.4,
              by + 5,
              bx - bw * 0.5,
              by + 5,
            ],
            2,
          ),
          haze(mix(kit.backDeep, 0x8a7a5a, 0.4), 0.1),
          0.32,
        );
      }
      info.lee.push({ x: xb + dir * 30, y: gy - 12, size: range(r, 40, 54) });
      spans.push([Math.min(xa, xb) - 80, Math.max(xa, xb) + 60]);
    } else {
      // A low arch of root heaving out of the ground and diving back, lesser roots under it.
      const span = 250 * f.size;
      const rise = 96 * f.size;
      const xa = f.x - span / 2;
      const xb = f.x + span / 2;
      const main = wander(
        cubic(
          xa,
          gy + 8,
          xa + span * 0.2,
          gy - rise * 1.4,
          xb - span * 0.3,
          gy - rise * 1.25,
          xb,
          gy + 8,
          20,
        ),
        5,
        880 + index,
        70,
      );
      for (let k = 0; k < 2; k++) {
        const u0 = k ? 0.62 : 0.3;
        const [bx, by] = [
          main[Math.round(u0 * 20) * 2] as number,
          main[Math.round(u0 * 20) * 2 + 1] as number,
        ];
        const ex = bx + (k ? 1 : -1) * range(r, 20, 60);
        limb(
          p,
          wander(quad(bx, by, lerp(bx, ex, 0.3), lerp(by, gy, 0.5), ex, gy + 8, 9), 3, 881 + k, 30),
          (t) => 18 * (1 - t * 0.5) + 3,
          { ...wood, col: wood.dark },
          0.24,
          0.05,
          f.x + k,
          { bark: 0.8, lit: 0.25 },
        );
      }
      limb(
        p,
        main,
        (t) =>
          40 * (1 - 0.35 * Math.sin(Math.PI * t)) +
          smoothstep(0.2, 0, t) * 16 +
          smoothstep(0.8, 1, t) * 12 +
          Math.max(0, Math.sin(t * 15)) * 4,
        wood,
        0.25,
        0.08,
        f.x,
        { bark: 0.85, grain: 6, lit: 0.4 },
      );
      const topLine: number[] = [];
      for (let k = 5; k <= 13; k++) topLine.push(main[k * 2] as number, (main[k * 2 + 1] as number) - 15);
      crest(p, topLine, kit, 882 + index, 0.9);
      spans.push([xa - 60, xb + 60]);
    }
  });
  return spans;
}

// ---------------------------------------------------------------------------------------------

/** One authored set piece per zone: old, overgrown, made by someone, each with one small light. */
export function paintLandmarks(p: Paint, scene: Scene, info: TerrainInfo, kit: FormKit): void {
  const stoneCol = mix(mix(kit.back, kit.stone[1] as number, 0.5), PALETTE.fogMid, 0.1);
  const dark = kit.backDeep;
  const wood = backWood(kit);
  // A line cut into stone; `glow` lays a thread of lichen in the cut.
  const carve = (line: number[], w: number, glow?: number): void => {
    const shape = ribbon(line, (t) => w * Math.sin(Math.PI * clamp(t, 0.06, 0.94)) + 0.6);
    p.tint(shape, dark, 0.9);
    p.bump(shape, 0.2);
    if (glow !== undefined)
      p.tint(
        ribbon(line, (t) => w * 0.5 * Math.sin(Math.PI * clamp(t, 0.1, 0.9)) + 0.4),
        glow,
        0.8,
      );
  };
  // A moth's wings, cut as two pairs of curved strokes about a centre line.
  const mothMotif = (cx: number, cy: number, sz: number, rot: number, glow?: number): void => {
    const pt = (x: number, y: number): [number, number] => [
      cx + x * Math.cos(rot) - y * Math.sin(rot),
      cy + x * Math.sin(rot) + y * Math.cos(rot),
    ];
    const w = sz * 0.17;
    for (const sgn of [-1, 1]) {
      const a = pt(0, -sz * 0.2);
      const b = pt(sgn * sz * 0.9, -sz * 0.95);
      const c = pt(sgn * sz, 0);
      const d = pt(sgn * sz * 0.6, sz * 0.8);
      const e = pt(0, sz * 0.3);
      carve(
        chaikinOpen([...a, ...pt(sgn * sz * 0.5, -sz * 0.75), ...b, ...c, ...pt(sgn * sz * 0.2, sz * 0.05)]),
        w,
        glow,
      );
      carve(chaikinOpen([...pt(sgn * sz * 0.15, sz * 0.1), ...c, ...d, ...e]), w * 0.85, glow);
    }
    carve([...pt(0, -sz * 0.7), ...pt(0, sz * 0.65)], w * 1.15, glow);
    for (const sgn of [-1, 1])
      carve(
        chaikinOpen([
          ...pt(0, -sz * 0.62),
          ...pt(sgn * sz * 0.22, -sz * 1.0),
          ...pt(sgn * sz * 0.42, -sz * 1.12),
        ]),
        w * 0.6,
      );
  };

  const pool = info.pool;
  if (pool) {
    // ---- Left: a tall carved moth-stone leaning beside the pool, half swallowed by roots and
    // moss, a fallen piece of it lying at its foot; lichen glows faintly in the carving.
    const x = pool.x0 - 176;
    const gy = info.groundY(x) + 16;
    const lean = 0.11;
    const h = 350;
    const w = 122;
    const cx = x + Math.sin(lean) * h * 0.5;
    const lichen = 0x58c8c0;
    const r = rngFor(890, 1);
    // The fallen piece first (behind the roots).
    paintRock(p, {
      cx: x + 156,
      cy: gy - 34,
      rx: 74,
      ry: 50,
      seed: 891,
      color: mix(stoneCol, dark, 0.15),
      dark,
      h: 0.27,
      rise: 0.07,
      baseY: gy + 8,
      tilt: 0.3,
      boxy: 3,
      rough: 0.9,
      moss: backMoss(kit, x + 150, gy, 892, 0.9),
      cracks: 2,
      ground: 0.9,
    });
    carve(chaikinOpen([x + 116, gy - 40, x + 146, gy - 64, x + 186, gy - 46, x + 158, gy - 26]), 3.2);
    paintRock(p, {
      cx,
      cy: gy - h * 0.5 + 10,
      rx: w / 2,
      ry: h * 0.5 + 6,
      seed: 893,
      color: stoneCol,
      dark,
      light: mix(stoneCol, kit.stone[0] as number, 0.35),
      h: 0.29,
      rise: 0.1,
      baseY: gy + 6,
      tilt: lean,
      boxy: 3.4,
      rough: 0.8,
      squat: 1,
      moss: backMoss(kit, x, gy - h, 894, 1),
      cracks: 3,
      ground: 1,
    });
    const at = (f: number, off = 0): [number, number] => [
      x + Math.sin(lean) * h * f + off * Math.cos(lean),
      gy - h * f + off * Math.sin(lean),
    ];
    // The carving: the great moth, a row of marks under it, a ring above.
    const [mx, my] = at(0.6);
    mothMotif(mx, my, 40, lean, lichen);
    for (let k = 0; k < 3; k++) {
      const [ax, ay] = at(0.43 - k * 0.04, -30 + k * 4);
      const [bx, by] = at(0.43 - k * 0.04, 30 - k * 4);
      carve([ax, ay, (ax + bx) / 2, (ay + by) / 2 + 2, bx, by], 3 - k * 0.4, k === 0 ? lichen : undefined);
    }
    const ring: number[] = [];
    const [rx0, ry0] = at(0.84);
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 1.7 + 0.6;
      ring.push(rx0 + Math.cos(a) * 15, ry0 + Math.sin(a) * 15);
    }
    carve(ring, 2.8, lichen);
    // Moss sheets down the weather side.
    const tone = kit.mossTone(x, gy, 895, 0);
    for (const [f, off, len, wd] of [
      [0.93, -30, 120, 34],
      [0.7, 46, 80, 22],
    ] as const) {
      const [sx, sy] = at(f, off);
      const line = wander(
        quad(sx, sy, sx + range(r, -8, 8), sy + len * 0.5, sx + range(r, -12, 12), sy + len, 9),
        4,
        sx,
        30,
      );
      p.solid(
        ribbon(line, (t) => wd * (1 - t) ** 0.7 + 3),
        haze(mix(tone.dark, kit.back, 0.5), 0.15),
        0.34,
        { moss: 0.6 },
      );
      p.solid(
        ribbon(line, (t) => wd * 0.5 * (1 - t) ** 0.9 + 1.5),
        haze(mix(tone.body, kit.back, 0.45), 0.15),
        0.36,
        {
          moss: 0.6,
        },
      );
    }
    // Roots climbing it from both sides.
    for (const [k, [side, f1, w0]] of (
      [
        [-1, 0.2, 30],
        [1, 0.12, 24],
      ] as const
    ).entries()) {
      const sx = x + side * range(r, 120, 180);
      // Up the near edge of the stone, the tip curling a little way onto its face.
      const [ex, ey] = at(f1, side * (w * 0.5 - 16));
      const [c1x, c1y] = at(f1 * 0.2, side * (w * 0.5 + 34));
      const line = wander(cubic(sx, gy + 8, sx - side * 40, gy - 30, c1x, c1y, ex, ey, 18), 4, 896 + k, 50);
      limb(
        p,
        line,
        (t) => w0 * (1 - t * 0.8) + 3 + Math.max(0, Math.sin(t * 14 + k)) * 3,
        wood,
        0.3,
        0.06,
        896 + k,
        { bark: 0.8, grain: 3, lit: 0.35 },
      );
    }
    // Its lower 110 px is kept calm, dark and mist-touched (a figure and the goal's lantern stand
    // in front of it): three soft washes of mist tone that fade upward, no carving, no moss.
    for (let k = 0; k < 3; k++) {
      const top = gy - 110 + k * 34;
      const wash: number[] = [];
      for (let xx = x - 70; xx <= x + 100; xx += 14) wash.push(xx, top + wobble(xx, 897 + k, 40) * 8);
      wash.push(x + 100, gy + 10, x - 70, gy + 10);
      p.tint(wash, mix(kit.backDeep, PALETTE.fogMid, 0.3), 0.3);
    }
    // The fallen piece stands tall enough to hide whatever glows behind it in the mid layer.
    info.lanterns.push({ x: mx, y: my, cyan: true, size: 70 });
    info.keepClear.push([x - 110, x + 230]);
    info.lee.push({ x: x - 86, y: gy - 12, size: 52 });
  }

  // ---- Centre: cocoons hung under the great bough on silk, one great one faintly warm, the
  // lesser ones dark, one long empty and torn.
  const bough = scene.solids.find(
    (s) => s.tag === 'ledge' && scene.solids.some((o) => o.tag === 'trunk' && o.x === s.x + s.w),
  );
  if (bough) {
    const x = bough.x + bough.w * 0.36;
    const y0 = bough.y + bough.h + 14;
    const silk = 0x8a8468;
    const cocoon = (
      cx: number,
      len: number,
      sc: number,
      kind: 'lit' | 'dark' | 'torn',
      seed: number,
    ): [number, number] => {
      const thread = wander(
        [cx + range(rngFor(seed), -10, 10), y0 - 30, cx + 3, y0 + len * 0.5, cx, y0 + len],
        2.5,
        seed,
        60,
      );
      p.solid(
        ribbon(thread, () => 1.4 + sc * 0.8),
        mix(silk, dark, kind === 'lit' ? 0.2 : 0.5),
        0.46,
      );
      const cy = y0 + len + 34 * sc * 0.9;
      const body: number[] = [];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const taper = Math.sin(a) < 0 ? 0.62 : 1;
        body.push(
          cx + Math.cos(a) * 19 * sc * (0.75 + 0.25 * taper) * (1 + 0.05 * Math.sin(a * 5 + seed)),
          cy + Math.sin(a) * 34 * sc * (Math.sin(a) < 0 ? 1.1 : 0.9),
        );
      }
      const shell = kind === 'lit' ? 0x6e6246 : kind === 'dark' ? 0x4a4434 : 0x38352a;
      p.tint(
        body.map((v, i) => (i % 2 ? v + 5 : v - 2)),
        kit.abyss,
        0.4,
      );
      p.solid(chaikin(body, 1), shell, 0.46);
      for (let k = 1; k <= 3; k++) {
        const s2 = 1 - k * 0.22;
        p.bump(
          body.map((v, i) => (i % 2 ? cy + (v - cy) * s2 : cx + (v - cx) * s2)),
          0.46 + k * 0.04,
        );
      }
      if (kind === 'lit') {
        p.solid(blob(cx + 2 * sc, cy + 4 * sc, 10 * sc, 19 * sc, seed + 1, 0.15, 14), 0xa87e48, 0.56);
        p.solid(blob(cx + 2 * sc, cy + 8 * sc, 4.6 * sc, 9 * sc, seed + 2, 0.15, 12), 0xe0b878, 0.6);
      } else if (kind === 'torn') {
        p.solid(blob(cx - 3 * sc, cy + 8 * sc, 9 * sc, 17 * sc, seed + 1, 0.4, 12), 0x0a0c0c, 0.2);
        for (const sgn of [-1, 1])
          p.solid(
            ribbon(
              quad(
                cx + sgn * 6 * sc,
                cy + 20 * sc,
                cx + sgn * 14 * sc,
                cy + 34 * sc,
                cx + sgn * 9 * sc,
                cy + 48 * sc,
                5,
              ),
              (t) => 5 * sc * (1 - t) + 0.6,
            ),
            shell,
            0.44,
          );
      }
      // Silk bands.
      for (let k = 0; k < 5; k++) {
        const yy = cy - 26 * sc + k * 12 * sc;
        const hw = (17 * Math.sin(Math.PI * clamp((k + 0.7) / 5.6, 0.1, 0.9)) + 3) * sc;
        p.solid(
          ribbon(quad(cx - hw, yy, cx, yy + 5 * sc, cx + hw, yy - 1, 6), () => 1.2 + sc * 0.6),
          mix(shell, dark, 0.45),
          0.58,
          {},
          0.8,
        );
      }
      // Loose threads from the tip.
      for (const sgn of [-1, 1]) {
        p.solid(
          ribbon(
            quad(
              cx + sgn * 4 * sc,
              cy + 30 * sc,
              cx + sgn * 9 * sc,
              cy + 46 * sc,
              cx + sgn * 5 * sc,
              cy + 62 * sc,
              5,
            ),
            (t) => 2.4 * sc * (1 - t) + 0.5,
          ),
          mix(silk, dark, 0.3),
          0.46,
        );
      }
      return [cx, cy];
    };
    const list: Array<[number, number, number, 'lit' | 'dark' | 'torn']> = [
      [-96, 54, 0.75, 'dark'],
      [92, 76, 0.85, 'torn'],
      [-52, 128, 1.05, 'dark'],
      [50, 168, 1.2, 'dark'],
      [0, 196, 2.0, 'lit'],
    ];
    const hung: Array<[number, number]> = [];
    for (const [dx, len] of list) hung.push([x + dx, y0 + len * 0.55]);
    // Webs slung between the threads.
    for (let k = 0; k < hung.length - 1; k++) {
      const a = hung[k] as [number, number];
      const b = hung[(k + 2) % hung.length] as [number, number];
      p.solid(
        ribbon(
          quad(a[0], a[1] - 20, (a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 22, b[0], b[1] - 30, 10),
          () => 1.3,
        ),
        mix(silk, dark, 0.45),
        0.44,
        {},
        0.8,
      );
    }
    let great: [number, number] = [x, y0 + 260];
    for (const [k, [dx, len, sc, kind]] of list.entries()) {
      const c = cocoon(x + dx, len, sc, kind, 900 + k * 3);
      if (kind === 'lit') great = c;
    }
    info.lanterns.push({ x: great[0] + 3, y: great[1] + 10, size: 60 });
  }

  // ---- Right: a moth shrine. A tall carved wing-stone on a plinth, a cairn either side, cords
  // of seed charms strung between them, a bowl with a violet light, glow moss in the joints.
  {
    const x = scene.width - 548;
    const gy = info.groundY(x) + 14;
    const r = rngFor(910, 2);
    const glow = 0x9a70d8;
    const stack = (cx: number, sizes: number[], seed: number): number => {
      let y = gy;
      sizes.forEach((sz, i) => {
        const sx = cx + (i % 2 ? 7 : -5) * (sz / 40);
        paintRock(p, {
          cx: sx,
          cy: y - sz * 0.36,
          rx: sz,
          ry: sz * 0.46,
          seed: seed + i,
          color: mix(stoneCol, dark, 0.1 + (i % 3) * 0.1),
          dark,
          h: 0.28 + i * 0.006,
          rise: 0.08,
          tilt: (i % 2 ? 0.08 : -0.06) + range(r, -0.05, 0.05),
          rough: 1,
          moss: backMoss(kit, sx, y, seed + 20 + i, i === 0 ? 0.9 : 0.4),
          ground: 0.6,
          cracks: i === 0 ? 1 : 0,
        });
        if (i > 0 && i % 2 === 1)
          p.tint(
            blob(sx + range(r, -sz * 0.5, sz * 0.5), y - 2, sz * 0.3, 4, seed + 40 + i, 0.4, 10),
            glow,
            0.5,
          );
        y -= sz * 0.6;
      });
      return y;
    };
    const topL = stack(x - 122, [58, 48, 40, 33, 26, 19], 911);
    const topR = stack(x + 116, [50, 40, 30], 921);
    const plinth = stack(x, [92, 74], 931);
    // The wing-stone.
    const sh = 214;
    const lean = -0.04;
    paintRock(p, {
      cx: x + Math.sin(lean) * sh * 0.5,
      cy: plinth - sh * 0.5 + 14,
      rx: 50,
      ry: sh * 0.5 + 4,
      seed: 941,
      color: mix(stoneCol, kit.stone[6] as number, 0.3),
      dark,
      light: mix(stoneCol, kit.stone[0] as number, 0.3),
      h: 0.3,
      rise: 0.1,
      baseY: plinth + 12,
      tilt: lean,
      boxy: 3.1,
      rough: 0.8,
      squat: 1,
      moss: backMoss(kit, x, plinth - sh, 942, 0.9),
      cracks: 2,
      ground: 0.8,
    });
    const my = plinth - sh * 0.62;
    mothMotif(x - 4, my, 30, lean, glow);
    for (let k = 0; k < 2; k++)
      carve(
        [
          x - 26 + k * 4,
          plinth - sh * 0.3 + k * 16,
          x,
          plinth - sh * 0.3 + k * 16 + 2,
          x + 24 - k * 4,
          plinth - sh * 0.3 + k * 16,
        ],
        2.6,
      );
    // Cords with charms.
    const cord = (ax: number, ay: number, bx: number, by: number, sag: number, seed: number): void => {
      const line = quad(ax, ay, (ax + bx) / 2, Math.max(ay, by) + sag, bx, by, 14);
      p.solid(
        ribbon(line, () => 1.8),
        0x5e563e,
        0.4,
      );
      for (let k = 2; k < 13; k += 2) {
        const cx = line[k * 2] as number;
        const cy = line[k * 2 + 1] as number;
        const dl = 8 + ((k * 7 + seed) % 5) * 4;
        p.solid(
          ribbon([cx, cy, cx + 1, cy + dl], () => 1.1),
          0x5e563e,
          0.4,
        );
        p.solid(blob(cx + 1, cy + dl + 4, 3.4, 5, seed + k, 0.2, 9), k % 4 === 0 ? 0x8a7a4a : 0x6a5a6a, 0.42);
      }
    };
    cord(x - 30, plinth - sh + 26, x - 124, topL + 8, 46, 951);
    cord(x + 28, plinth - sh + 40, x + 118, topR + 8, 60, 952);
    // The bowl on the lower cairn, and offerings at the plinth's foot.
    const bx = x + 116;
    const bowl: number[] = [];
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI;
      bowl.push(bx - Math.cos(a) * 20, topR - 2 + Math.sin(a) * 12);
    }
    p.solid(chaikin(bowl, 1), mix(stoneCol, dark, 0.2), 0.34);
    p.solid(blob(bx, topR - 2, 12, 3.4, 953, 0.2, 10), glow, 0.4, {}, 0.85);
    for (let k = 0; k < 5; k++) {
      const ox = x - 70 + k * 34 + range(r, -8, 8);
      p.solid(
        blob(ox, gy - 18, range(r, 5, 9), range(r, 4, 6), 954 + k, 0.3, 10),
        k % 2 ? 0x7a6a4a : 0x5a5266,
        0.34,
      );
    }
    p.tint(blob(x - 40, plinth + 4, 22, 5, 955, 0.4, 10), glow, 0.5);
    p.tint(blob(x + 46, gy - 50, 16, 5, 956, 0.4, 10), glow, 0.45);
    info.lanterns.push({ x: bx, y: topR - 6, violet: true, size: 46 });
    info.lanterns.push({ x: x - 4, y: my, violet: true, size: 60 });
    info.keepClear.push([x - 190, x + 180]);
  }
}

/** Corner-cut smoothing for an open polyline (ends kept). */
function chaikinOpen(pts: number[], rounds = 2): number[] {
  let q = pts;
  for (let k = 0; k < rounds; k++) {
    const n = q.length / 2;
    const out: number[] = [q[0] as number, q[1] as number];
    for (let i = 0; i < n - 1; i++) {
      const ax = q[i * 2] as number;
      const ay = q[i * 2 + 1] as number;
      const bx = q[i * 2 + 2] as number;
      const by = q[i * 2 + 3] as number;
      out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    out.push(q[q.length - 2] as number, q[q.length - 1] as number);
    q = out;
  }
  return q;
}
