/**
 * What grows in Lanternroot's rooms, as live plant meshes (pf-flora.ts: they sway in the wind, part
 * round her, whip away from a cut; tufts throw clippings: playfield.ts `turf`):
 *
 *   night   sedge and moss fruit on the log's crest, small ferns, old man's beard under the overhangs
 *   hall    hair-fine rotten fibre on the floor, pale fungus caps in clusters (a faint warm glow), dry
 *           fibre strands hanging from every lip
 *   roots   wet sedge, sparse cyan glow caps in root knots, long rootlets hanging into the dark, and
 *           glowworm threads: silk with glowing beads (Animal Well's), swaying
 *   cache   the hall's caps, fewer
 *
 * Placement is seeded from the plan (lr-terrain.ts); nothing grows on the fight spots' backdrop beyond a
 * low fringe (`marks.calm` is honoured by keeping tall things off short tops).
 */
import { mix } from './look';
import type { LanternPlan, Run } from './lr-terrain';
import type { FloraBuilder } from './pf-flora';
import type { Garden } from './pf-plants';
import { quad, type Rng, range, rngFor } from './pf-shape';

export const LR_FLORA = {
  /** Px of top per tuft (lower = denser). */
  tuftGap: { night: 22, hall: 26, roots: 30, cache: 40 },
  /** Fungus / glow cap clusters: px between clusters. */
  capGap: { night: 9999, hall: 420, roots: 520, cache: 520 },
  /** Hanging things under undersides: px between them. */
  hangGap: { night: 70, hall: 90, roots: 60, cache: 140 },
  /** Glowworm threads (roots): px between them, length range. */
  wormGap: 210,
  wormLen: [80, 320] as readonly number[],
} as const;

type Band = LanternPlan['band'];

const TONES = {
  night: {
    tuft: 0x0b1714,
    tuftLit: 0x2a4640,
    fern: 0x0e2420,
    fernLit: 0x2d4c43,
    hang: 0x1f2c2d,
    hangTip: 0x4a5a5a,
  },
  hall: {
    tuft: 0x2a1a10,
    tuftLit: 0x7a5a38,
    fern: 0x2a1c12,
    fernLit: 0x6a4c30,
    hang: 0x2a1c14,
    hangTip: 0x6a4c34,
  },
  roots: {
    tuft: 0x08110f,
    tuftLit: 0x22403c,
    fern: 0x0a1614,
    fernLit: 0x1e3a36,
    hang: 0x0c1112,
    hangTip: 0x2a3a3c,
  },
  cache: {
    tuft: 0x231610,
    tuftLit: 0x6a4a30,
    fern: 0x24180f,
    fernLit: 0x5a4028,
    hang: 0x24180f,
    hangTip: 0x5a4030,
  },
} as const;

/** Glow caps: warm in the hall and the cache (the firefly's lamps' cousins), cyan in the roots. */
const CAPS = {
  hall: { cap: 0xd8a868, gill: 0x6a4428, stem: 0x8a6a4a, glow: 0xffb066 },
  cache: { cap: 0xe0b070, gill: 0x6a4428, stem: 0x8a6a4a, glow: 0xffb870 },
  roots: { cap: 0x9fe6ee, gill: 0x2a5a60, stem: 0x5a8a8e, glow: 0x9ff3ff },
  night: { cap: 0xb8c8d8, gill: 0x3a4a5a, stem: 0x6a7a8a, glow: 0xb8d8ff },
} as const;

function tuft(b: FloraBuilder, r: Rng, x: number, y: number, band: Band, turf: number[]): void {
  const T = TONES[band];
  const n = 3 + Math.floor(r() * 5);
  const tall = band === 'night' ? 12 : band === 'roots' ? 14 : 7;
  for (let i = 0; i < n; i++) {
    const h = range(r, 3, tall);
    const px = x + range(r, -7, 7);
    const lean = range(r, -0.6, 0.6) * h;
    b.plant(px, y, h, r(), h * 0.3, h * 0.9, 0.35);
    const lit = r() < 0.35;
    b.strip(
      quad(px, y + 3, px + lean * 0.3, y - h * 0.6, px + lean, y - h, 3),
      (u) => (band === 'hall' || band === 'cache' ? 1.2 : 2.2) * (1 - u) + 0.3,
      (u) => mix(T.tuft, lit ? T.tuftLit : T.tuft, u),
      () => T.tuft,
    );
  }
  turf.push(x, y, T.tuftLit);
}

function fern(b: FloraBuilder, r: Rng, x: number, y: number, size: number, band: Band): void {
  const T = TONES[band];
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
        b.leaf(px, py, la, ll, ll * 0.42, T.fern, up ? T.fernLit : T.fern, T.fern, 0, 1, 2);
      }
    }
  }
}

/** A cluster of glow caps on a top: stems, caps lit from inside, a faint halo each. */
function caps(g: Garden, r: Rng, x: number, y: number, band: Band): void {
  const C = CAPS[band];
  const n = 2 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const px = x + range(r, -18, 18);
    const h = range(r, 6, band === 'roots' ? 18 : 14);
    const w = range(r, 4, 9);
    const lean = range(r, -0.3, 0.3) * h;
    g.back.plant(px, y, h, r(), h * 0.15 + 0.5, h * 0.5, 0.2);
    g.back.strip(
      quad(px, y + 2, px + lean * 0.3, y - h * 0.5, px + lean, y - h, 3),
      (u) => 2.2 * (1 - u * 0.4),
      () => mix(C.stem, 0x000000, 0.4),
      () => C.stem,
    );
    g.back.glow = 0.6;
    g.back.fan(
      px + lean,
      y - h,
      w,
      w * 0.55,
      Math.PI,
      Math.PI * 2,
      mix(C.cap, 0xffffff, 0.15),
      () => C.cap,
      1,
      8,
    );
    g.back.fan(px + lean, y - h, w, w * 0.25, 0, Math.PI, C.gill, () => C.gill, 1, 6);
    g.back.glow = 0;
    g.back.sync(g.halo);
    g.halo.halo(px + lean, y - h - 1, w * 3.2, C.glow, band === 'roots' ? 0.22 : 0.16, 1);
  }
}

/** Something hanging from an underside: beard (night), dry fibre (hall), a long rootlet with a drip (roots). */
function hang(b: FloraBuilder, r: Rng, x: number, y: number, band: Band): void {
  const T = TONES[band];
  const n = band === 'roots' ? 1 + Math.floor(r() * 2) : 3 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const px = x + range(r, -8, 8);
    const len = band === 'roots' ? range(r, 24, 140) : range(r, 12, band === 'night' ? 90 : 60);
    b.plant(px, y, len, r(), len * 0.1 + 1, 0, -0.25);
    const ph = r() * 6.28;
    const amp = range(r, 0.6, 2.4);
    const line: number[] = [];
    const m = Math.max(5, Math.round(len / 6));
    for (let k = 0; k <= m; k++) {
      const u = k / m;
      line.push(px + Math.sin(u * len * 0.09 + ph) * amp * u, y - 2 + len * u);
    }
    const w0 = band === 'roots' ? range(r, 1.6, 3.4) : range(r, 0.9, 1.7);
    b.strip(
      line,
      (u) => w0 * (1 - u * 0.65),
      (u) => mix(T.hang, T.hang, u),
      (u) => mix(T.hang, T.hangTip, u ** 1.5),
      (u) => 1 - u * 0.35,
    );
  }
}

/** A glowworm thread: fine silk with glowing beads along its lower half (the roots' small lights). */
function worm(g: Garden, r: Rng, x: number, y: number, len: number): void {
  g.back.plant(x, y, len, r(), len * 0.07 + 2, 0, -0.1);
  const line: number[] = [];
  const lean = range(r, -0.06, 0.06) * len;
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    line.push(x + lean * u * u, y + len * u);
  }
  g.back.strip(
    line,
    () => 1.1,
    () => 0x6a9aa4,
    () => 0x6a9aa4,
    (u) => 0.28 * (1 - u * 0.4),
  );
  const beads = 3 + Math.floor(r() * 6);
  for (let k = 0; k < beads; k++) {
    const u = range(r, 0.35, 1);
    const bx = x + lean * u * u;
    const by = y + len * u;
    const s = range(r, 1.3, 2.6);
    g.back.glow = 1;
    g.back.fan(bx, by, s, s * 1.3, 0, Math.PI * 2, 0xe8ffff, () => 0x9ff3ff, 1, 6);
    g.back.glow = 0;
    g.back.sync(g.halo);
    g.halo.halo(bx, by, s * 6, 0x9ff3ff, 0.2, 1);
  }
}

/** Grows a Lanternroot room's plants. */
export function growLantern(g: Garden, plan: LanternPlan, seed: number): void {
  const band = plan.band;
  if (!g.turf) g.turf = [];
  const turf = g.turf;
  const F = LR_FLORA;
  const shelfTops: Run[] = plan.shelves.map((o) => ({ x0: o.x, x1: o.x + o.w, y: o.y, y1: o.y, side: 'up' }));
  for (const run of [...plan.tops, ...shelfTops]) {
    const w = run.x1 - run.x0;
    if (w < 24) continue;
    const r = rngFor(seed, run.x0, run.y, 41);
    const top = (x: number): number => (plan.tops.includes(run) ? plan.topAt(run, x) : run.y);
    // A low fringe of tufts along the top (cuts throw them).
    for (
      let x = run.x0 + range(r, 4, 20);
      x < run.x1 - 6;
      x += range(r, F.tuftGap[band] * 0.5, F.tuftGap[band] * 1.6)
    ) {
      tuft(g.back, r, x, top(x) + 1, band, turf);
    }
    // Ferns near the ends of tops (night, roots), never in the middle of a long floor.
    if ((band === 'night' || band === 'roots') && w > 160) {
      for (const x of [run.x0 + range(r, 20, 70), run.x1 - range(r, 20, 70)]) {
        if (r() < 0.6) fern(g.back, r, x, top(x) + 2, range(r, 18, 34), band);
      }
    }
    // Glow cap clusters.
    if (F.capGap[band] < 9000 && w > 120) {
      for (
        let x = run.x0 + range(r, 60, F.capGap[band]);
        x < run.x1 - 40;
        x += range(r, F.capGap[band] * 0.7, F.capGap[band] * 1.5)
      ) {
        caps(g, r, x, top(x) + 2, band);
      }
    }
  }
  for (const run of plan.unders) {
    const w = run.x1 - run.x0;
    if (w < 24) continue;
    const r = rngFor(seed, run.x0, run.y, 43);
    for (
      let x = run.x0 + range(r, 10, 40);
      x < run.x1 - 10;
      x += range(r, F.hangGap[band] * 0.5, F.hangGap[band] * 1.5)
    ) {
      hang(g.back, r, x, run.y, band);
    }
    if (band === 'roots') {
      for (
        let x = run.x0 + range(r, 40, F.wormGap);
        x < run.x1 - 30;
        x += range(r, F.wormGap * 0.6, F.wormGap * 1.6)
      ) {
        worm(g, r, x, run.y - 2, range(r, F.wormLen[0] as number, F.wormLen[1] as number));
      }
    }
  }
}
