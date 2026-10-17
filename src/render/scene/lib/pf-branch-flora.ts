/**
 * What grows on the hatching branch (wood kit), as live plant meshes (pf-flora.ts: wind, her bend):
 *
 *   on the walk tops   moss fruit (thin stalks with a pale capsule that catches the moon) in patches,
 *                      a low dark tuft now and then in front of her feet
 *   at joints and ends small polypody ferns, the epiphytes of old limbs
 *   under the limb     old man's beard (pale-tipped lichen strands) in clumps, a few silk threads
 *                      that catch the moon, threads strung along the lip between the cocoons
 *   twig ends          leaf sprigs
 *   the end            the dark canopy: leaf clumps, a moon edge on their crowns
 *
 * Night tones only: nothing warm, nothing glows. Placement is seeded from the plan (pf-branch.ts).
 */
import { mix } from './look';
import { type BranchPlan, freeEast } from './pf-branch';
import type { FloraBuilder } from './pf-flora';
import type { Garden } from './pf-plants';
import { clamp, quad, type Rng, range, rngFor, wobble } from './pf-shape';

export const BRANCH_FLORA = {
  /** Moss fruit: share of a walk top that carries patches, stalk height px. */
  fruitCover: 0.55,
  fruitHeight: [4, 11] as readonly number[],
  /** Beards under the limb: gap between clumps px, strand length px. */
  beardGap: [30, 100] as readonly number[],
  beardLen: [20, 130] as readonly number[],
  /** Silk threads hanging from the underside: one every this many px, length px. */
  silkGap: [260, 620] as readonly number[],
  silkLen: [60, 240] as readonly number[],
  /** Ferns: one clump every this many px of walk top (only near ends, joints and the trunk). */
  fernGap: [380, 900] as readonly number[],
  /** Sway px per px of length. */
  windPerPx: 0.12,
} as const;

/** Night tones. */
const T = {
  leafDark: 0x07151a,
  leafMid: 0x10272a,
  leafLit: 0x2c4a4c,
  leafRim: 0x4b6a6e,
  beardBase: 0x0e1718,
  beardMid: 0x1f2c2d,
  beardTip: 0x4a5a5a,
  silk: 0xb6c0c8,
  stalk: 0x16241d,
  capsule: 0x7e968c,
  fern: 0x0e2420,
  fernLit: 0x2d4c43,
  tuft: 0x07120f,
} as const;

/** A leaf sprig at a twig's end: a few small leaves fanning from it. */
function sprig(b: FloraBuilder, r: Rng, x: number, y: number, a: number, size: number, deep: boolean): void {
  const n = 3 + Math.floor(r() * 4 * size + 1);
  const dim = deep ? 0.5 : 1;
  for (let i = 0; i < n; i++) {
    const la = a + range(r, -1.1, 1.1);
    const len = range(r, 7, 14) * (0.6 + 0.5 * size);
    b.plant(x, y, len, r(), len * BRANCH_FLORA.windPerPx * 2 + 1, len * 0.3, 0.2);
    const up = Math.sin(la) < -0.2;
    b.leaf(
      x,
      y,
      la,
      len,
      len * 0.55,
      T.leafDark,
      up ? mix(T.leafDark, T.leafLit, dim) : T.leafMid,
      up ? mix(T.leafDark, T.leafRim, 0.7 * dim) : T.leafDark,
      range(r, -0.2, 0.2),
      1,
      3,
    );
  }
}

/** A leaf clump of the canopy: leaves on short stems round a dome, lit along its crown. */
function clump(b: FloraBuilder, r: Rng, cx: number, cy: number, rx: number, ry: number): void {
  const n = Math.round((rx * ry) / 38);
  for (let i = 0; i < n; i++) {
    const a = range(r, -Math.PI, 0.25);
    const d = Math.sqrt(r());
    const px = cx + Math.cos(a) * rx * d;
    const py = cy + Math.sin(a) * ry * d * (a > 0 ? 0.6 : 1);
    const crown = Math.max(0, -Math.sin(a)) * d;
    const la = a + range(r, -0.7, 0.7);
    const len = range(r, 12, 24) * (1.2 - d * 0.4);
    b.plant(px, py, len * 2, (px * 0.003) % 1, 2.4 + crown * 2, 0, 0.15);
    const lit = crown > 0.7 && r() < 0.6;
    b.leaf(
      px,
      py,
      la,
      len,
      len * 0.6,
      T.leafDark,
      lit ? T.leafLit : mix(T.leafDark, T.leafMid, d),
      lit ? T.leafRim : T.leafDark,
      range(r, -0.25, 0.25),
      1,
      3,
    );
  }
}

/** Old man's beard: a clump of fine lichen strands hanging from (x, y), wavy, paler at the tips. */
function beard(b: FloraBuilder, r: Rng, x: number, y: number, len: number, deep: boolean): void {
  const n = 5 + Math.floor(r() * 6);
  const tip = deep ? mix(T.beardMid, T.beardTip, 0.25) : T.beardTip;
  for (let i = 0; i < n; i++) {
    const px = x + range(r, -7, 7);
    const l = len * range(r, 0.35, 1) ** 0.7;
    b.plant(px, y, l, r(), l * BRANCH_FLORA.windPerPx + 1, 0, -0.25);
    const ph = r() * 6.28;
    const amp = range(r, 1, 3.2);
    const lean = range(r, -0.1, 0.1) * l;
    const line: number[] = [];
    const m = Math.max(5, Math.round(l / 6));
    for (let k = 0; k <= m; k++) {
      const u = k / m;
      line.push(px + lean * u + Math.sin(u * l * 0.09 + ph) * amp * u, y - 2 + l * u);
    }
    const w0 = range(r, 0.9, 1.8);
    b.strip(
      line,
      (u) => w0 * (1 - u * 0.6),
      (u) => mix(T.beardBase, T.beardMid, u),
      (u) => mix(T.beardBase, tip, u ** 1.5),
      (u) => 1 - u * 0.35,
    );
  }
}

/** A silk thread hanging from (x, y): barely there, catches the moon. */
function silk(b: FloraBuilder, r: Rng, x: number, y: number, len: number): void {
  b.plant(x, y, len, r(), len * 0.08 + 2, 0, -0.1);
  const line: number[] = [];
  const lean = range(r, -0.08, 0.08) * len;
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    line.push(x + lean * u * u, y + len * u);
  }
  b.strip(
    line,
    () => 1.1,
    () => T.silk,
    () => T.silk,
    (u) => 0.32 * (1 - u * 0.6),
  );
}

/** A thread strung between two points on the lip, sagging. */
function strung(b: FloraBuilder, r: Rng, x0: number, y0: number, x1: number, y1: number): void {
  const sag = Math.abs(x1 - x0) * range(r, 0.08, 0.16);
  const mx = (x0 + x1) / 2;
  // (Both ends are tied: it does not sway; the cocoons under it do.)
  b.plant(mx, (y0 + y1) / 2, sag + 1, r(), 0, 0, 0);
  const line = quad(x0, y0, mx, (y0 + y1) / 2 + sag * 2, x1, y1, 14);
  b.strip(
    line,
    () => 0.9,
    () => T.silk,
    () => T.silk,
    0.22,
  );
}

/** Moss fruit: a patch of thin stalks with a pale capsule each. */
function fruit(b: FloraBuilder, r: Rng, x: number, y: number, w: number): void {
  const [h0, h1] = BRANCH_FLORA.fruitHeight as [number, number];
  const n = Math.max(2, Math.round(w / 3.2));
  for (let i = 0; i < n; i++) {
    const px = x + range(r, -w / 2, w / 2);
    const h = range(r, h0, h1) * (1 - Math.abs(px - x) / w);
    const lean = range(r, -0.35, 0.35) * h;
    b.plant(px, y, h, r(), h * 0.25 + 0.5, h * 0.9, 0.3);
    const line = quad(px, y + 1, px + lean * 0.3, y - h * 0.6, px + lean, y - h, 3);
    b.strip(
      line,
      (u) => 1.1 * (1 - u * 0.5),
      () => T.stalk,
      () => T.stalk,
    );
    b.leaf(
      px + lean,
      y - h,
      -Math.PI / 2 + lean / h,
      2.6,
      1.8,
      T.stalk,
      T.capsule,
      mix(T.capsule, T.stalk, 0.4),
      0,
      1,
      2,
    );
  }
}

/** A small polypody fern: a few arching fronds with paired leaflets. */
function fern(b: FloraBuilder, r: Rng, x: number, y: number, size: number, dim: number): void {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + range(r, -1.1, 1.1);
    const len = size * range(r, 0.6, 1);
    b.plant(x, y, len, r(), len * 0.12 + 1, len * 0.4, 0.3);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len * 0.8 + len * 0.25;
    const line = quad(x, y, x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len * 0.75, ex, ey, 8);
    b.strip(
      line,
      (u) => 1.6 * (1 - u) + 0.4,
      () => T.fern,
      () => T.fern,
    );
    for (let k = 1; k < 8; k++) {
      const px = line[k * 2] as number;
      const py = line[k * 2 + 1] as number;
      const u = k / 8;
      const ll = len * 0.2 * (1 - u * 0.7);
      const ta = Math.atan2((line[k * 2 + 3] as number) - py, (line[k * 2 + 2] as number) - px);
      for (const s of [-1, 1]) {
        const la = ta + s * 1.15;
        const up = Math.sin(la) < 0;
        b.leaf(px, py, la, ll, ll * 0.42, T.fern, up ? mix(T.fern, T.fernLit, dim) : T.fern, T.fern, 0, 1, 2);
      }
    }
  }
}

/** A low dark tuft in front of the walk line (over her feet). */
function tuft(b: FloraBuilder, r: Rng, x: number, y: number): void {
  const n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const h = range(r, 3, 7);
    const px = x + range(r, -6, 6);
    const lean = range(r, -0.6, 0.6) * h;
    b.plant(px, y, h, r(), h * 0.3, h * 0.9, 0.35);
    b.strip(
      quad(px, y + 3, px + lean * 0.3, y - h * 0.6, px + lean, y - h, 3),
      (u) => 2.2 * (1 - u) + 0.3,
      () => T.tuft,
      () => T.tuft,
    );
  }
}

/** Grows the branch's plants into the garden's meshes. */
export function growBranch(g: Garden, plan: BranchPlan): void {
  const F = BRANCH_FLORA;
  const clearAt = (x: number, y: number, pad = 0): boolean =>
    plan.clear.some((c) => Math.abs(c.x - x) < c.r + pad && Math.abs(c.y - y) < 80);

  // Walk tops: moss fruit in patches; a dark tuft in front now and then; ferns at joints and ends.
  for (const st of plan.stretches) {
    // (The far branch carries no moss life: it is another tree, a plane back.)
    if (st.far) continue;
    const r = rngFor(st.x0, st.y, 31);
    for (let x = st.x0 + range(r, 4, 20); x < st.x1 - 4; x += range(r, 10, 34)) {
      if (wobble(x, st.x0 + 5, 110) < 1 - 2 * F.fruitCover) continue;
      const w = range(r, 8, 22);
      g.back.mute = clearAt(x, st.y);
      fruit(g.back, r, x, st.top(x) - 1, w);
      g.back.mute = false;
    }
    for (let x = st.x0 + range(r, 40, 200); x < st.x1 - 20; x += range(r, 120, 320)) {
      tuft(g.front, r, x, st.top(x));
    }
    const spots: number[] = [];
    if (st.west !== 'under') spots.push(st.x0 + range(r, 24, 70));
    if (freeEast(st)) spots.push(st.x1 - range(r, 30, 80));
    if (st.east === 'burl') spots.push(st.x1 + range(r, 30, 60));
    for (
      let x = st.x0 + range(r, 300, 700);
      x < st.x1 - 300;
      x += range(r, F.fernGap[0] as number, F.fernGap[1] as number)
    )
      spots.push(x);
    for (const x of spots) {
      if (clearAt(x, st.y, 30)) continue;
      fern(g.back, r, x, st.top(x) + 3, range(r, 18, 30), 1);
    }
  }

  // Undersides: beards in clumps, silk threads, nothing in front of the cocoons' threads.
  for (const h of plan.hangs) {
    const r = rngFor(h.x0, h.x1, 17);
    const [g0, g1] = F.beardGap as [number, number];
    for (let x = h.x0 + range(r, 0, g1); x < h.x1; x += range(r, g0, g1) * (h.deep ? 1.6 : 1)) {
      const y = h.y(x);
      if (clearAt(x, y - 60, 6)) continue;
      const k = 1 + Math.floor(r() * 3);
      for (let j = 0; j < k; j++) {
        const len =
          Math.min(h.reach, range(r, F.beardLen[0] as number, F.beardLen[1] as number)) * (j ? 0.6 : 1);
        beard(g.back, r, x + range(r, -10, 10), y + range(r, -2, 3), len, h.deep);
      }
    }
    if (h.deep) continue;
    for (
      let x = h.x0 + range(r, 40, 300);
      x < h.x1;
      x += range(r, F.silkGap[0] as number, F.silkGap[1] as number)
    ) {
      if (clearAt(x, h.y(x) - 60, 10)) continue;
      silk(g.back, r, x, h.y(x) - 2, range(r, F.silkLen[0] as number, F.silkLen[1] as number));
    }
  }
  // Each cocoon hangs on silk from the underside down to its hang point.
  for (const c of plan.cocoons) {
    const st = plan.stretches.find((o) => !o.far && c.x >= o.x0 && c.x <= o.x1);
    if (!st) continue;
    const uy = st.under(c.x) - 3;
    if (c.y - uy < 4) continue;
    const r = rngFor(c.x, c.y, 9);
    for (let k = 0; k < 3; k++) {
      const ox = range(r, -7, 7);
      g.back.plant(c.x, uy, c.y - uy, r(), 0, 0, 0);
      g.back.strip(
        [c.x + ox, uy, c.x + ox * 0.4, (uy + c.y) / 2, c.x, c.y],
        () => 0.9,
        () => T.silk,
        () => T.silk,
        0.4,
      );
    }
  }
  // Silk strung along the lip between neighbouring cocoons (their row is a nursery).
  const cs = [...plan.cocoons].sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < cs.length; i++) {
    const a = cs[i] as { x: number; y: number };
    const c = cs[i + 1] as { x: number; y: number };
    const r = rngFor(a.x, c.x, 5);
    if (c.x - a.x < 160) strung(g.back, r, a.x + 6, a.y + 4, c.x - 6, c.y + 4);
  }

  // Twig ends.
  for (const s of plan.sprigs) {
    const r = rngFor(s.x, s.y, 13);
    sprig(g.back, r, s.x, s.y, s.a, clamp(s.size, 0.3, 1), !!s.deep);
  }
  // The canopy at the end, back to front.
  for (const c of plan.clumps) {
    const r = rngFor(c.x, c.y, 23);
    clump(g.back, r, c.x, c.y, c.rx, c.ry);
  }
}
