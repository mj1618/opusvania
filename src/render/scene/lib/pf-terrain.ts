/**
 * Paints the playfield terrain (the skin of the collision rects) onto a Paint: ground with strata,
 * stones and roots, moss caps on every walkable top, floating islands, ledges, trunks on stilt
 * roots, the root mound, boughs on back-plane saplings and the scene's edge walls. Static: it is
 * baked once by pf-bake.ts. Also returns where the tops, undersides and faces are so pf-plants.ts
 * can grow things on them.
 *
 * Honesty rule: a painted top never strays more than ~6 px from its collision line, and nothing
 * with a lit moss rim exists where there is no collision. Things the character can pass in front
 * of (stilt roots, saplings) are painted in the dark, low-relief "back" tone.
 */
import type { Scene, SceneTag, SolidRect } from '../../../sim/scene';
import { mix, PALETTE } from './look';
import { Paint } from './pf-paint';
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
  sunAt,
  wander,
  wobble,
  zoneAt,
} from './pf-shape';

export const TERRAIN = {
  /** Earth, from topsoil down through the strata (albedo before lighting). */
  earth: [0x1f4b56, 0x1a3f52, 0x17344f, 0x142a49, 0x112141] as const,
  strataDepth: [40, 104, 186, 290] as const,
  stone: [0x4a7884, 0x3a6474, 0x2f5468, 0x55808a, 0x6c7466, 0x486a50, 0x5a5f7a, 0x76705e] as const,
  rootWood: 0x3a5a56,
  /** Bracket fungus: pale rim, flesh, dark band, pore surface. */
  fungus: [0x6e6654, 0x554e42, 0x3e3934, 0x8a8472] as const,
  /** The same in dusty rose-brown, for the second fungus island. */
  fungusRose: [0x64544e, 0x4e4240, 0x3a3234, 0x857874] as const,
  bark: 0x1f3d46,
  barkDark: 0x142a34,
  barkLit: 0x3a5c58,
  /** Things behind the walk plane (stilt roots, saplings): dark, flat, cool. */
  back: 0x143440,
  backDeep: 0x0e2632,
  moss: 0x2c6a40,
  mossDark: 0x174633,
  mossLit: 0x5f9a48,
  mossOlive: 0x55632a,
  mossShade: 0x1d5852,
  /** Fallen leaves on bare ground. */
  litter: [0xb9873a, 0x9a6a34, 0xc9a24a, 0x6f7a34] as const,
  /** 0..1: share of each top where the moss gives way to earth, stones, roots, litter. */
  mossBare: 0.3,
  mossSun: 0x7f8a36,
  /** Moss cap: how far it rises above the collision line and how thick it hangs. */
  mossLift: 2,
  mossMound: 4,
  mossThick: 11,
  /** Ground crown: the moss stands this far above the collision line, plus a slow swell. */
  crownLift: 5,
  crownMound: 8,
  /** Ground below the lip: [depth px, alpha] washes of `abyss` laid over everything painted there. */
  depthShade: [
    [26, 0.3],
    [52, 0.34],
    [80, 0.4],
    [112, 0.46],
    [148, 0.55],
  ] as ReadonlyArray<readonly [number, number]>,
  abyss: 0x040a12,
  mossDrip: 26,
  /** How far the water surface sits above the pool floor (the character wades waist-deep). */
  waterDepth: 50,
  /** How far the edge walls bulge into the scene at most. */
  edgeBulge: 12,
  /** Gap between the baked backdrop pieces (boulders, dead stumps) behind the walk line, px. */
  backdropGap: [260, 560] as const,
  /** 0..1: strength of the lit crest and contact shadow on elevated tops (islands, ledges, boughs, trunks). */
  highRead: 0.8,
  /** How far bank faces cut back under their lip, px. */
  faceUndercut: 9,
} as const;

export type TopKind = SceneTag | 'poolFloor';

/** A walkable top: plants grow up from it. */
export interface Top {
  x0: number;
  x1: number;
  y: number;
  kind: TopKind;
  /** The end is a free edge (things can hang off it) rather than meeting a wall. */
  freeL: boolean;
  freeR: boolean;
}
/** An underside: things hang down from `y(x)`. */
export interface Under {
  x0: number;
  x1: number;
  y: (x: number) => number;
  kind: SceneTag | 'edge';
  /** What trails from it (floating islands choose; default a mix of vines and short roots). */
  trail?: 'mixed' | 'few' | 'roots' | 'longRoots' | 'longVines';
}
/** A vertical face: ivy creeps on it. `dir` is the outward normal. */
export interface Face {
  x: number;
  y0: number;
  y1: number;
  dir: -1 | 1;
  kind: SceneTag | 'edge';
}
export interface TerrainInfo {
  tops: Top[];
  unders: Under[];
  faces: Face[];
  /** Ends of painted limbs: leaf sprays grow here. Dark unless `lit` (limbs in the walk plane). */
  twigs: Array<{ x: number; y: number; angle: number; lit?: boolean }>;
  /** Authored props that hold a small light: a dim halo goes here. */
  lanterns: Array<{ x: number; y: number; violet?: boolean }>;
  /** Sheltered spots beside big terrain where a fern grows. */
  lee: Array<{ x: number; y: number; size: number }>;
  /** x ranges where big plants should stay away so the terrain itself is seen. */
  keepClear: Array<[number, number]>;
  /** Painted vines crossing a trunk face: leaves grow along `line`. */
  ivy: Array<{ line: number[]; dir: number }>;
  /** Hollows in the earth: `y` is the floor, `roof` the ceiling, `w` the usable width. */
  pockets: Array<{ x: number; y: number; w: number; roof: number; kind: 'glow' | 'crystal' }>;
  pool: { x0: number; x1: number; floor: number; surface: number; bank: number } | null;
  /** Collision top of the ground at x. */
  groundY(x: number): number;
}

interface Seg {
  x0: number;
  x1: number;
  y: number;
  pool: boolean;
}

const OUT = 420;

/** Collision top of the ground at x, taking the lower side near a step (so things stay buried). */
function safeTopAt(info: TerrainInfo, x: number, W: number): number {
  return Math.max(
    info.groundY(clamp(x - 40, 0, W - 1)),
    info.groundY(clamp(x, 0, W - 1)),
    info.groundY(clamp(x + 40, 0, W - 1)),
  );
}

export function paintTerrain(scene: Scene): { paint: Paint; info: TerrainInfo } {
  const p = new Paint(scene.width, scene.height);
  const segs: Seg[] = scene.solids
    .filter((s) => s.tag === 'ground' || s.tag === 'pool')
    .sort((a, b) => a.x - b.x)
    .map((s) => ({ x0: s.x, x1: s.x + s.w, y: s.y, pool: s.tag === 'pool' }));
  const groundY = (x: number): number => {
    for (const s of segs) if (x < s.x1) return s.y;
    return (segs[segs.length - 1] as Seg).y;
  };
  const poolSeg = segs.find((s) => s.pool);
  const poolI = poolSeg ? segs.indexOf(poolSeg) : -1;
  const info: TerrainInfo = {
    tops: [],
    unders: [],
    faces: [],
    twigs: [],
    ivy: [],
    keepClear: [],
    lee: [],
    lanterns: [],
    pockets: [],
    pool: poolSeg
      ? {
          x0: poolSeg.x0,
          x1: poolSeg.x1,
          floor: poolSeg.y,
          surface: poolSeg.y - TERRAIN.waterDepth,
          bank: Math.max(segs[poolI - 1]?.y ?? 0, segs[poolI + 1]?.y ?? 0),
        }
      : null,
    groundY,
  };

  const trunks = scene.solids.filter((s) => s.tag === 'trunk');
  const floats = scene.solids.filter((s) => s.tag === 'floating').sort((a, b) => a.x - b.x);
  // Back plane first: everything else overlaps it.
  for (const b of scene.oneWays) paintSapling(p, b.x, b.y, b.w, groundY, scene, info);
  for (const t of trunks) if (t.y + t.h < groundY(t.x + t.w / 2) - 40) paintStiltRoots(p, t, groundY);
  paintBackdrop(p, scene, info);
  paintProps(p, scene, info);
  paintEdgeWalls(p, scene, info);
  paintGround(p, segs, scene, info);

  for (const s of scene.solids) {
    if (s.tag === 'trunk') paintTrunk(p, s, scene, info, trunks.indexOf(s) % 2 === 1);
  }
  for (const s of scene.solids) {
    if (s.tag === 'ledge') paintLedge(p, s, scene, info);
    else if (s.tag === 'floating') paintFloating(p, s, floats.indexOf(s), info);
    else if (s.tag === 'root') paintRootMound(p, s, info);
  }
  for (const b of scene.oneWays) paintBough(p, b.x, b.y, b.w, scene, info);
  return { paint: p, info };
}

// ---------------------------------------------------------------------------------------------
// Moss

interface MossOpts {
  seed: number;
  /** Free ends drape round the corner and down the side this far (0 = flush end). */
  drapeL?: number;
  drapeR?: number;
  thick?: number;
  drip?: number;
  lift?: number;
  /** 0..1 darker, wetter (pool floor, shaded tops). */
  dull?: number;
  /** 0..1 share of the top left bare. */
  bare?: number;
  /** A slow swell of this many px on top of `lift` (the ground's rounded crown). */
  mound?: number;
  /** 0..1: add a clean lit crest and a contact shadow under the lip (elevated tops). */
  read?: number;
}

/** Moss colour at a spot: emerald to olive along the top, yellowed in the light, bluish in shade. */
function mossTone(x: number, y: number, seed: number, dull: number): { dark: number; body: number } {
  const olive = (wobble(x, seed + 90, 170) + 1) * 0.5;
  const sun = sunAt(x, y);
  let body = mix(TERRAIN.moss, TERRAIN.mossOlive, olive * 0.8);
  body = mix(body, sun > 0.5 ? TERRAIN.mossSun : TERRAIN.mossShade, Math.abs(sun - 0.5) * 1.1);
  const z = zoneAt(x);
  body = mix(mix(mix(body, 0x1f6456, z.cool * 0.4), 0x6c8438, z.warm * 0.22), 0x165040, z.deep * 0.45);
  let dark = mix(TERRAIN.mossDark, mix(TERRAIN.mossOlive, TERRAIN.mossDark, 0.6), olive * 0.7);
  if (dull > 0) {
    body = mix(body, 0x10424a, dull);
    dark = mix(dark, 0x0c3440, dull);
  }
  return { dark, body };
}

/**
 * The moss on a walkable top from x0 to x1 at collision height y: cushions of uneven thickness
 * with bare stretches between them where earth, a stone, a surface root or leaf litter shows.
 */
function mossCap(p: Paint, x0: number, x1: number, y: number, o: MossOpts): void {
  const r = rngFor(o.seed, x0, y);
  const thick0 = o.thick ?? TERRAIN.mossThick;
  const dripMax = o.drip ?? TERRAIN.mossDrip;
  const lift0 = o.lift ?? TERRAIN.mossLift;
  const dull = o.dull ?? 0;
  const bare = o.bare ?? TERRAIN.mossBare;
  const xa = x0 - (o.drapeL ? 5 : 0);
  const xb = x1 + (o.drapeR ? 5 : 0);
  const drips: Array<{ x: number; w: number; d: number }> = [];
  for (let x = xa + range(r, 6, 40); x < xb - 6; x += range(r, 16, 74)) {
    drips.push({ x, w: range(r, 4, 10), d: dripMax * range(r, 0.25, 1) ** 1.6 });
  }
  // 0 where the top is bare, 1 under a cushion. Free ends always carry moss (it drapes there).
  const cover = (x: number): number => {
    const n = wobble(x, o.seed + 70, 130) * 0.7 + wobble(x, o.seed + 71, 33) * 0.3;
    const c = smoothstep(bare * 1.3 - 0.75, bare * 1.3 - 0.45, n);
    const endL = o.drapeL ? smoothstep(xa + 46, xa + 14, x) : 0;
    const endR = o.drapeR ? smoothstep(xb - 46, xb - 14, x) : 0;
    return Math.max(c, endL, endR);
  };
  const edgeFade = (x: number): number =>
    Math.min(o.drapeL ? 1 : smoothstep(xa, xa + 22, x), o.drapeR ? 1 : smoothstep(xb, xb - 22, x));
  const lift = (x: number): number => {
    const mound = o.mound
      ? ((wobble(x, o.seed + 3, 210) + 1) * 0.5) ** 1.3 * o.mound
      : Math.max(0, wobble(x, o.seed + 3, 64)) ** 1.5 * TERRAIN.mossMound;
    return (lift0 + mound + (wobble(x, o.seed + 9, 11) + 1) * 0.6) * (0.35 + 0.65 * edgeFade(x));
  };
  const thick = (x: number): number => {
    // Thin skins and fat cushions.
    const cushion = ((wobble(x, o.seed + 21, 86) + 1) * 0.5) ** 1.7;
    let t = thick0 * (0.18 + 1.75 * cushion) + (wobble(x, o.seed + 22, 13) + 1) * 1.2;
    for (const d of drips) {
      const u = (x - d.x) / d.w;
      if (u > -3 && u < 3) t += d.d * Math.exp(-u * u);
    }
    return 2 + t * edgeFade(x);
  };

  // Drapes down free sides.
  const drape = (x: number, dir: -1 | 1, len: number): void => {
    const tone = mossTone(x, y, o.seed, dull);
    const n = 1 + Math.floor(r() * 2.4);
    for (let i = 0; i < n; i++) {
      const l = len * range(r, 0.45, 1);
      const off = range(r, -3, 3);
      const line = wander(
        quad(x + dir * (1 + off), y + 2, x + dir * (4 + off), y + l * 0.5, x + dir * off, y + l, 9),
        2.5,
        o.seed + i * 7 + (dir > 0 ? 100 : 0),
        24,
      );
      const w0 = range(r, 9, 15);
      p.solid(
        ribbon(line, (t) => w0 * (1 - t) ** 0.7 + 1.5),
        tone.dark,
        0.74,
        { moss: 1 },
      );
      p.solid(
        ribbon(line, (t) => w0 * 0.5 * (1 - t) ** 0.9 + 0.6),
        tone.body,
        0.82,
        { moss: 1 },
      );
    }
    p.solid(blob(x + dir * 1.5, y + 4, 8.5, 8, o.seed + dir * 31, 0.18, 12), tone.body, 0.86, { moss: 1 });
  };
  if (o.drapeL) drape(x0, -1, o.drapeL);
  if (o.drapeR) drape(x1, 1, o.drapeR);

  // Cushions: runs of covered ground, painted in short sections so the colour can drift.
  const S = 3;
  const SECTION = 8;
  const mossy = { moss: 1 - dull * 0.65 };
  const rise = 1 - dull * 0.3;
  type Col = { x: number; yt: number; yb: number; ym: number };
  let run: Col[] = [];
  const flushRun = (): void => {
    if (run.length >= 3) {
      for (let i = 0; i < run.length - 1; i += SECTION) {
        const part = run.slice(i, Math.min(run.length, i + SECTION + 1));
        if (part.length < 2) break;
        const midX = (part[Math.floor(part.length / 2)] as Col).x;
        const tone = mossTone(midX, y, o.seed, dull);
        const outline = (lower: (c: Col) => number): number[] => {
          const pts: number[] = [];
          for (const c of part) pts.push(c.x, c.yt);
          for (let k = part.length - 1; k >= 0; k--) pts.push((part[k] as Col).x, lower(part[k] as Col));
          return pts;
        };
        p.solid(
          outline((c) => c.yb),
          tone.dark,
          0.76 * rise,
          mossy,
        );
        p.solid(
          outline((c) => c.ym),
          tone.body,
          0.87 * rise,
          mossy,
        );
      }
    }
    run = [];
  };
  const bareRuns: Array<[number, number]> = [];
  let bareFrom = Number.NaN;
  for (let x = xa; x <= xb + 0.01; x += S) {
    const cv = cover(x);
    if (cv > 0.04) {
      if (!Number.isNaN(bareFrom)) {
        bareRuns.push([bareFrom, x]);
        bareFrom = Number.NaN;
      }
      const th = thick(x) * cv;
      const yt = y - lift(x) * cv;
      run.push({
        x,
        yt,
        yb: y + Math.max(1.5, th),
        ym: yt + Math.min(th + 1, (5 + (wobble(x, o.seed + 40, 30) + 1) * 2.6) * cv),
      });
    } else {
      flushRun();
      if (Number.isNaN(bareFrom)) bareFrom = x;
    }
  }
  flushRun();
  if (!Number.isNaN(bareFrom)) bareRuns.push([bareFrom, xb]);

  // Elevated tops sit against busy canopy: give them a clean lit crest the whole way along and
  // a soft band of shadow tucked under the lip, so the walkable line separates from what is behind.
  const read = o.read ?? 0;
  if (read > 0) {
    const crestT: number[] = [];
    const under: number[] = [];
    for (let x = x0 + 3; x <= x1 - 3; x += 6) {
      const cv = cover(x);
      crestT.push(x, y - lift(x) * cv + 1.2);
      under.push(x, y + Math.max(2, thick(x) * cv) + 5);
    }
    p.tint(
      ribbon(
        under,
        (t) => (11 + wobble(t * 300, o.seed + 60, 40) * 3) * Math.sin(Math.PI * clamp(t, 0.02, 0.98)) ** 0.35,
      ),
      TERRAIN.backDeep,
      0.42 * read,
    );
    p.solid(
      ribbon(
        crestT,
        (t) => (3 + wobble(t * 300, o.seed + 61, 30) * 0.9) * Math.sin(Math.PI * clamp(t, 0.01, 0.99)) ** 0.3,
      ),
      mix(mossTone((x0 + x1) / 2, y, o.seed, 0).body, TERRAIN.mossLit, 0.75),
      0.98,
      { moss: 1 },
      0.5 + 0.4 * read,
    );
  }
  // Puffs: little cushions of height only, so the light finds something to model.
  for (let x = xa + range(r, 4, 20); x < xb - 4; x += range(r, 9, 34)) {
    if (cover(x) < 0.6) continue;
    const th = thick(x);
    const py = y - lift(x) * 0.5 + range(r, 2, Math.max(3, th * 0.6));
    const rad = range(r, 3, 7.5);
    p.bump(blob(x, py, rad * 1.3, rad, o.seed + x, 0.2, 9), 0.94, { moss: 1, alpha: 0.6 });
  }

  // What shows in the bare stretches: a flat stone, a surface root, or drifted leaves.
  if (dull > 0.5) return;
  const E = TERRAIN.earth;
  for (const [bx0, bx1] of bareRuns) {
    const w = bx1 - bx0;
    if (w < 14) continue;
    for (let x = bx0 + range(r, 4, 16); x < bx1 - 6; x += range(r, 22, 60)) {
      const roll = r();
      if (roll < 0.4) {
        // A stone set in the ground: its flat top is the walk line.
        const sw = Math.min(w * 0.6, range(r, 12, 30));
        const sh = range(r, 8, 15);
        const pts: number[] = [];
        for (let i = 0; i <= 8; i++)
          pts.push(x - sw / 2 + (sw * i) / 8, y + 0.5 - Math.sin((Math.PI * i) / 8) ** 0.4 * 2);
        for (let i = 0; i <= 6; i++) {
          const a = (Math.PI * i) / 6;
          pts.push(x + (Math.cos(a) * sw) / 2, y + 1 + Math.sin(a) * sh + wobble(x + i * 9, o.seed, 7) * 1.2);
        }
        const c = TERRAIN.stone[Math.floor(r() * TERRAIN.stone.length)] as number;
        p.solid(chaikin(pts, 1), mix(c, E[1], range(r, 0.1, 0.4)), range(r, 0.64, 0.72));
      } else if (roll < 0.7) {
        // A root surfacing and diving again.
        const len = Math.min(w * 0.8, range(r, 26, 60));
        const line = quad(x - len / 2, y + 9, x + range(r, -6, 6), y - 3, x + len / 2, y + 10, 10);
        const flat = line.map((v, i) => (i % 2 ? Math.max(v, y + 2.5) : v));
        const w0 = range(r, 5, 8);
        p.solid(
          ribbon(flat, (t) => w0 * (0.5 + 0.5 * Math.sin(Math.PI * t))),
          mix(TERRAIN.rootWood, E[0], range(r, 0, 0.3)),
          0.66,
          { bark: 0.2 },
        );
      } else {
        // Leaf litter: a few fallen leaves lying flat, the only warm notes on the ground.
        const n = 3 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) {
          const lx = x + range(r, -14, 14);
          const ly = y + range(r, 1.5, 4.5);
          const ll = range(r, 4, 7.5);
          const col = TERRAIN.litter[Math.floor(r() * TERRAIN.litter.length)] as number;
          p.solid(blob(lx, ly, ll, ll * 0.36, lx, 0.15, 7, range(r, -0.5, 0.5)), col, 0.62);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Ground

function paintGround(p: Paint, segs: Seg[], scene: Scene, info: TerrainInfo): void {
  const W = scene.width;
  const H = scene.height;
  const E = TERRAIN.earth;
  const S = 8;
  const seed = 11;
  const topW = (x: number): number => 2 + wobble(x, seed, 70) * 1.6;
  const outline: number[] = [-OUT, H + OUT, -OUT, (segs[0] as Seg).y + 2];
  segs.forEach((s, i) => {
    const prev = segs[i - 1];
    const next = segs[i + 1];
    const xa = prev ? s.x0 + 5 : -OUT + S;
    const xb = next ? s.x1 - 5 : W + OUT;
    for (let x = xa; x < xb; x += S) outline.push(x, s.y + topW(x));
    outline.push(xb, s.y + topW(xb));
    if (next) {
      const down = next.y > s.y;
      const ya = s.y + 9;
      const yb = next.y - 4;
      const n = Math.max(2, Math.round(Math.abs(yb - ya) / S));
      for (let k = 0; k <= n; k++) {
        const y = lerp(ya, yb, k / n);
        const hi = Math.min(s.y, next.y);
        const lo = Math.max(s.y, next.y);
        // Outward is toward the lower side. A small lip at the top, a root-toe at the bottom.
        const outward = down ? 1 : -1;
        // An overhanging lip, an undercut belly, a toe: never a straight cut.
        const lip = smoothstep(hi + 40, hi + 8, y) * 6;
        const belly = Math.sin(Math.PI * clamp((y - hi) / (lo - hi), 0, 1)) ** 1.5 * TERRAIN.faceUndercut;
        const toe = smoothstep(lo - 30, lo - 2, y) * 7;
        const lumps = wobble(y, seed + i * 13, 44) * 4 + wobble(y, seed + i * 17, 15) * 2;
        outline.push(s.x1 + lumps + outward * (lip + toe - belly), y);
      }
    }
  });
  outline.push(W + OUT, H + OUT);
  const body = chaikin(outline, 2);
  p.solid(body, E[0], 0.5);

  // Strata: each layer follows the surface from deeper down, and dives before a bank face so
  // the face itself stays topsoil.
  const step = 16;
  const n = Math.ceil((W + OUT * 2) / step) + 1;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = -OUT + i * step;
    let y = 0;
    for (let k = -7; k <= 7; k++) y = Math.max(y, info.groundY(clamp(x + k * step, 0, W - 1)));
    raw[i] = y;
  }
  const smooth = new Float32Array(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let k = -4; k <= 4; k++) {
        const j = clamp(i + k, 0, n - 1);
        s += (pass === 0 ? raw : smooth)[j] as number;
        c++;
      }
      smooth[i] = s / c;
    }
    if (pass === 0) raw.set(smooth);
  }
  TERRAIN.strataDepth.forEach((d, k) => {
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = -OUT + i * step;
      const y =
        (smooth[i] as number) + d + wobble(x, seed + 60 + k * 9, 210) * (14 + k * 7) + wobble(x, k, 37) * 4;
      pts.push(x, Math.max(y, info.groundY(clamp(x, 0, W - 1)) + 14));
    }
    pts.push(W + OUT, H + OUT, -OUT, H + OUT);
    p.solid(pts, E[k + 1] ?? E[4], 0.48 - k * 0.025);
  });

  // Deep structure, all of it quiet: big buried boulders, pale seams, old roots, hollows.
  const dr = rngFor(seed, 41);
  const deepTop = (x: number): number => {
    const i = clamp(Math.round((x + OUT) / step), 0, n - 1);
    return smooth[i] as number;
  };
  for (let x = range(dr, -100, 200); x < W + 100; x += range(dr, 150, 420)) {
    const depth = range(dr, 120, 300);
    const cy = deepTop(x) + depth;
    const k = 1 + Math.floor(dr() * 2.5);
    for (let j = 0; j < k; j++) {
      const rx = range(dr, 60, 150) * (j ? 0.6 : 1);
      const ry = rx * range(dr, 0.45, 0.75);
      const bx = x + j * range(dr, -90, 90);
      const by = cy + j * range(dr, -40, 50);
      const tone = E[clamp(Math.floor(depth / 90), 1, 4)] as number;
      const pts = chaikin(blob(bx, by, rx, ry, bx, 0.3, 9, range(dr, -0.3, 0.3)), 2);
      p.solid(pts, mix(tone, TERRAIN.stone[2], range(dr, 0.16, 0.3)), 0.53);
      // A lit shoulder and a crack, so it reads as rock rather than a blob.
      p.solid(
        chaikin(blob(bx + rx * 0.18, by - ry * 0.3, rx * 0.62, ry * 0.45, bx + 1, 0.3, 8), 2),
        mix(tone, TERRAIN.stone[1], range(dr, 0.25, 0.4)),
        0.57,
      );
      const crack = wander(
        quad(bx - rx * 0.3, by - ry * 0.7, bx + range(dr, -20, 20), by, bx + rx * 0.2, by + ry * 0.7, 8),
        6,
        bx,
        20,
      );
      p.solid(
        ribbon(crack, (t) => 3 * Math.sin(Math.PI * clamp(t, 0.05, 0.95)) + 0.6),
        E[4],
        0.4,
      );
    }
  }
  // Pale seams: thin broken bands riding the strata.
  for (let k = 0; k < 5; k++) {
    const depth = 70 + k * 58 + range(dr, -12, 12);
    let run: number[] = [];
    const flush = (): void => {
      if (run.length >= 8) {
        const wd = range(dr, 4, 11);
        p.solid(
          ribbon(run, (t) => wd * Math.sin(Math.PI * clamp(t, 0.02, 0.98)) ** 0.7 + 0.5),
          mix(E[Math.min(4, 1 + Math.floor(k / 1.5))] as number, k % 2 ? TERRAIN.stone[1] : E[0], 0.4),
          0.5,
          {},
          0.7,
        );
      }
      run = [];
    };
    for (let x = -OUT; x < W + OUT; x += 14) {
      if (wobble(x, seed + 200 + k, 260) > -0.1) {
        run.push(
          x,
          Math.max(
            deepTop(x) + depth + wobble(x, seed + 210 + k, 190) * 22,
            info.groundY(clamp(x, 0, W - 1)) + 22,
          ),
        );
      } else flush();
    }
    flush();
  }
  // Old roots running through the deep earth, forking as they go.
  const deepRoot = (x: number, y: number, dir: number, len: number, w0: number, lvl: number): void => {
    const ex = x + dir * len;
    const ey = y + len * range(dr, 0.12, 0.42);
    const line = wander(
      cubic(x, y, x + dir * len * 0.2, y + len * 0.3, ex - dir * len * 0.35, ey - len * 0.06, ex, ey, 22),
      len * 0.05,
      x + lvl,
      90,
    );
    p.tint(
      ribbon(line, (t) => (w0 + 8) * (1 - t * 0.8) + 2),
      E[4],
      0.4,
    );
    p.solid(
      ribbon(line, (t) => w0 * (1 - t) ** 0.8 + 1.2),
      mix(E[3], TERRAIN.rootWood, 0.34),
      0.58,
      { bark: 0.15 },
    );
    p.solid(
      ribbon(line, (t) => w0 * 0.3 * (1 - t) ** 0.8 + 0.4),
      mix(E[2], TERRAIN.rootWood, 0.55),
      0.63,
      { bark: 0.15 },
    );
    if (lvl < 2) {
      for (let j = 0; j < 2; j++) {
        const t = range(dr, 0.3, 0.7);
        const kk = Math.floor(t * 22) * 2;
        deepRoot(
          line[kk] as number,
          line[kk + 1] as number,
          dr() < 0.7 ? dir : -dir,
          len * range(dr, 0.35, 0.6),
          w0 * 0.55,
          lvl + 1,
        );
      }
    }
  };
  for (let x = range(dr, 100, 400); x < W; x += range(dr, 380, 760)) {
    const y = safeTopAt(info, x, W) + range(dr, 26, 60);
    deepRoot(x, y, dr() < 0.5 ? -1 : 1, range(dr, 320, 620), range(dr, 18, 30), 0);
  }
  // Hollows where something glows (pf-plants.ts fills them): slots, tall cracks, kidneys, rounds.
  const HOLLOWS: ReadonlyArray<[number, number, number]> = [
    [52, 19, 0.25],
    [24, 40, 0.3],
    [44, 27, 0.55],
    [33, 31, 0.2],
    [60, 24, 0.45],
  ];
  let hk = 0;
  for (let x = range(dr, 200, 500); x < W - 100; x += range(dr, 1500, 2100)) {
    // Well clear of any bank face, so a hollow never opens into the air.
    const top = Math.max(safeTopAt(info, x - 80, W), safeTopAt(info, x + 80, W));
    const [rx, ry, rough] = HOLLOWS[hk % HOLLOWS.length] as [number, number, number];
    hk++;
    const cy = top + range(dr, 60, 120) + ry;
    const rot = range(dr, -0.25, 0.25);
    const shape = (grow: number): number[] =>
      chaikin(blob(x, cy, rx + grow, ry + grow, x, rough, 12, rot), 2);
    p.solid(shape(7), mix(E[0], TERRAIN.stone[2], 0.3), 0.6);
    p.solid(shape(0), 0x0a1a30, 0.26);
    p.solid(chaikin(blob(x, cy + ry * 0.55, rx * 0.8, ry * 0.4, x + 3, 0.3, 8, rot), 1), 0x10283c, 0.3);
    info.pockets.push({
      x,
      y: cy + ry * 0.62,
      w: rx * 1.3,
      roof: cy - ry * 0.8,
      kind: hk % 3 === 0 ? 'crystal' : 'glow',
    });
  }
  // A warmer band of topsoil just under the surface, only along level runs (it stops short of
  // every step and bank so it never swoops across a cross-section).
  {
    let band: number[] = [];
    const flushBand = (): void => {
      if (band.length >= 12) {
        p.tint(
          ribbon(
            band,
            (t) =>
              (18 + wobble(t * 900, seed + 301, 200) * 6) * Math.sin(Math.PI * clamp(t, 0.02, 0.98)) ** 0.4,
          ),
          0x4e4a36,
          0.3,
        );
      }
      band = [];
    };
    for (let x = 0; x < W; x += step) {
      const g0 = info.groundY(clamp(x - 110, 0, W - 1));
      const g1 = info.groundY(clamp(x + 110, 0, W - 1));
      const g = info.groundY(x);
      if (g0 === g && g1 === g) band.push(x, g + 34 + wobble(x, seed + 300, 160) * 7);
      else flushBand();
    }
    flushBand();
  }
  // Two giant buried roots arching through the cross-section under the long runs.
  for (const gx of [W * 0.16, W * 0.63, W * 0.9]) {
    const top = Math.max(safeTopAt(info, gx - 200, W), safeTopAt(info, gx + 200, W));
    const span = range(dr, 340, 440);
    const line = wander(
      cubic(
        gx - span,
        top + 330,
        gx - span * 0.45,
        top + 60,
        gx + span * 0.4,
        top + 70,
        gx + span,
        top + 340,
        30,
      ),
      10,
      gx,
      120,
    );
    const w0 = range(dr, 50, 64);
    const girth = (t: number): number =>
      w0 * (0.75 + 0.25 * Math.sin(Math.PI * t)) + Math.max(0, Math.sin(t * 21 + gx)) * 4;
    p.tint(
      ribbon(line, (t) => girth(t) + 14),
      E[4],
      0.5,
    );
    p.solid(ribbon(line, girth), mix(E[3], TERRAIN.rootWood, 0.4), 0.6, { bark: 0.15 });
    p.solid(
      ribbon(
        line.map((v, i) => (i % 2 ? v - w0 * 0.18 : v)),
        (t) => girth(t) * 0.3,
      ),
      mix(E[2], TERRAIN.rootWood, 0.62),
      0.66,
      { bark: 0.15 },
    );
    p.solid(
      ribbon(
        line.map((v, i) => (i % 2 ? v + w0 * 0.22 : v)),
        (t) => girth(t) * 0.12,
      ),
      E[4],
      0.46,
      { bark: 0.15 },
    );
  }
  // A hint of something older: a coiled fossil in the rock, barely lighter than its bed.
  for (const fx of [W * 0.33, W * 0.78]) {
    const top = Math.max(safeTopAt(info, fx - 80, W), safeTopAt(info, fx + 80, W));
    const fy = top + range(dr, 150, 210);
    const coil: number[] = [];
    for (let i = 0; i <= 44; i++) {
      const a = i * 0.34;
      const rad = 4 + i * 0.95;
      coil.push(fx + Math.cos(a) * rad, fy + Math.sin(a) * rad * 0.9);
    }
    p.solid(chaikin(blob(fx, fy, 52, 46, fx, 0.15, 12), 2), mix(E[3], TERRAIN.stone[2], 0.3), 0.53);
    p.solid(
      ribbon(coil, (t) => 2 + t * 6),
      mix(E[2], TERRAIN.stone[7], 0.4),
      0.6,
    );
  }

  // Embedded stones in clusters, thinning with depth.
  const r = rngFor(seed, 5);
  const stoneAt = (cx: number, cy: number, size: number, sd: number): void => {
    const rx = size * range(r, 0.8, 1.5);
    const ry = size * range(r, 0.55, 0.9);
    const pts = chaikin(blob(cx, cy, rx, ry, sd, 0.3, 8, range(r, -0.4, 0.4)), 1);
    const c = TERRAIN.stone[Math.floor(r() * TERRAIN.stone.length)] as number;
    p.tint(blob(cx - 1.5, cy + 2.5, rx + 2, ry + 2, sd, 0.3, 10), E[4], 0.55);
    p.solid(pts, mix(c, E[2], range(r, 0.2, 0.6)), range(r, 0.6, 0.72));
    // A lighter cap on the lit side.
    p.tint(blob(cx + rx * 0.2, cy - ry * 0.3, rx * 0.55, ry * 0.42, sd + 1, 0.3, 7), c, 0.5);
  };
  const safeTop = (x: number): number =>
    Math.max(
      info.groundY(clamp(x - 30, 0, W - 1)),
      info.groundY(clamp(x, 0, W - 1)),
      info.groundY(clamp(x + 30, 0, W - 1)),
    );
  for (let x = range(r, 20, 120); x < W; x += range(r, 40, 190)) {
    const depth = 20 + r() ** 2.4 * 170;
    const cy = safeTop(x) + depth;
    const k = 1 + Math.floor(r() * 4.5);
    const big = range(r, 7, 20) * (depth < 60 ? 0.8 : 1);
    for (let j = 0; j < k; j++) {
      stoneAt(x + range(r, -34, 34), cy + range(r, -8, 20), big * range(r, 0.35, 1), x + j);
    }
  }

  // Root tendrils working down from the surface.
  const rootDown = (x: number, y: number, len: number, w0: number, lean: number, sd: number): void => {
    const line = wander(
      cubic(
        x,
        y,
        x + lean * 0.2,
        y + len * 0.35,
        x + lean * 1.1,
        y + len * 0.6,
        x + lean,
        y + len,
        Math.max(6, Math.round(len / 9)),
      ),
      len * 0.09,
      sd,
      32,
    );
    p.tint(
      ribbon(line, (t) => (w0 + 3) * (1 - t) ** 0.8 + 1),
      E[4],
      0.4,
    );
    p.solid(
      ribbon(line, (t) => w0 * (1 - t) ** 0.8 + 0.8),
      mix(TERRAIN.rootWood, E[1], range(r, 0, 0.5)),
      0.63,
    );
  };
  for (let x = range(r, 10, 60); x < W; x += range(r, 22, 130)) {
    const y = safeTop(x) + 5;
    rootDown(x, y, range(r, 30, 150), range(r, 2.5, 7), range(r, -40, 40), x);
    if (r() < 0.4)
      rootDown(x + range(r, -8, 8), y, range(r, 20, 70), range(r, 1.5, 3.5), range(r, -50, 50), x + 3);
  }

  // Bank faces: root-bound earth. Fat roots snake down just inside the face, stones wedge between.
  segs.forEach((s, i) => {
    const next = segs[i + 1];
    if (!next) return;
    const hi = Math.min(s.y, next.y);
    const lo = Math.max(s.y, next.y);
    const inward: -1 | 1 = next.y > s.y ? -1 : 1;
    const fx = s.x1;
    const fr = rngFor(seed, fx);
    const count = 3 + Math.floor(fr() * 3);
    // Dark hollows between the roots.
    for (let k = 0; k < 5; k++) {
      const cy = lerp(hi + 20, lo - 14, fr());
      const cx = fx + inward * range(fr, 10, 26);
      const pts = blob(cx, cy, range(fr, 7, 14), range(fr, 10, 22), fx + k, 0.35, 10);
      p.solid(pts, E[4], 0.36);
    }
    for (let k = 0; k < 3 + Math.floor(fr() * 3); k++) {
      stoneAt(fx + inward * range(fr, 9, 34), lerp(hi + 16, lo - 8, fr()), range(fr, 6, 15), fx + k * 3);
    }
    for (let k = 0; k < count; k++) {
      const x0 = fx + inward * range(fr, 6, 46);
      const x1 = fx + inward * range(fr, 4, 22);
      const y0 = hi + range(fr, 3, 10);
      const len = (lo - hi) * range(fr, 0.55, 1.15);
      const line = wander(
        cubic(
          x0,
          y0,
          x0,
          y0 + len * 0.3,
          x1 - inward * 4,
          y0 + len * 0.6,
          x1 + inward * range(fr, 0, 30),
          y0 + len,
          14,
        ),
        7,
        fx + k * 11,
        36,
      );
      const w0 = range(fr, 7, 14);
      p.tint(
        ribbon(line, (t) => (w0 + 5) * (1 - t * 0.7) + 1),
        E[4],
        0.45,
      );
      p.solid(
        ribbon(line, (t) => w0 * (1 - t * 0.75) + 1.5),
        mix(TERRAIN.rootWood, E[0], range(fr, 0, 0.4)),
        range(fr, 0.62, 0.7),
      );
    }
    info.faces.push({ x: fx, y0: hi, y1: lo, dir: inward > 0 ? -1 : 1, kind: 'ground' });
  });

  // The ground is a form, not a cross-section: below the lit lip everything sinks into darkness
  // within ~150 px, and the detail painted above (roots, boulders, seams) goes with it.
  for (const [d, alpha] of TERRAIN.depthShade) {
    const pts: number[] = [];
    segs.forEach((sg, i) => {
      const xa = i === 0 ? -OUT : sg.x0;
      const xb = i === segs.length - 1 ? W + OUT : sg.x1;
      for (let x = xa; x <= xb; x += 24)
        pts.push(Math.min(x, xb), sg.y + d + wobble(x, seed + 400 + d, 150) * d * 0.14);
      pts.push(xb, sg.y + d);
    });
    pts.push(W + OUT, H + OUT, -OUT, H + OUT);
    p.tint(pts, TERRAIN.abyss, alpha);
    p.bump(pts, 0.47, { alpha: alpha * 0.8 });
  }

  // Moss caps and the walkable tops.
  segs.forEach((s, i) => {
    const prev = segs[i - 1];
    const next = segs[i + 1];
    const freeL = !!prev && prev.y > s.y;
    const freeR = !!next && next.y > s.y;
    const x0 = prev ? s.x0 : -OUT;
    const x1 = next ? s.x1 : W + OUT;
    mossCap(p, x0, x1, s.y, {
      seed: 70 + i,
      drapeL: freeL ? range(r, 34, 70) : 0,
      drapeR: freeR ? range(r, 34, 70) : 0,
      thick: s.pool ? 7 : TERRAIN.mossThick,
      drip: s.pool ? 8 : TERRAIN.mossDrip,
      lift: s.pool ? 1 : TERRAIN.crownLift,
      mound: s.pool ? 0 : TERRAIN.crownMound,
      dull: s.pool ? 1 : 0,
    });
    info.tops.push({
      x0: Math.max(0, s.x0),
      x1: Math.min(W, s.x1),
      y: s.y,
      kind: s.pool ? 'poolFloor' : 'ground',
      freeL,
      freeR,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Backdrop: big simple shapes standing behind the walk line, all in the back plane (dark, low
// relief, a little hazed) and none of them flat-topped: mossy boulders, leaning dead stumps. They
// are baked, so they cost nothing per frame. pf-plants.ts adds shrubs and reed stands between.

function paintBackdrop(p: Paint, scene: Scene, info: TerrainInfo): void {
  const W = scene.width;
  const r = rngFor(404, 7);
  const haze = (c: number, k = 0.3): number => mix(c, PALETTE.fogMid, k);
  const avoid: Array<[number, number]> = [];
  for (const s of scene.solids) {
    if (s.tag === 'root') avoid.push([s.x - 110, s.x + s.w + 110]);
    if (s.tag === 'trunk') avoid.push([s.x - 170, s.x + s.w + 170]);
    if (s.tag === 'pool') avoid.push([s.x - 60, s.x + s.w + 60]);
  }
  for (const o of scene.oneWays) avoid.push([o.x + o.w - 20, o.x + o.w + 110]);
  let k = 0;
  for (
    let x = range(r, 120, 300);
    x < W - 120;
    x += range(r, TERRAIN.backdropGap[0], TERRAIN.backdropGap[1])
  ) {
    if (avoid.some(([a, b]) => x > a && x < b)) continue;
    // Stand clear of steps: the shape must sit on one level.
    const gy = info.groundY(x);
    if (info.groundY(clamp(x - 90, 0, W - 1)) !== gy || info.groundY(clamp(x + 90, 0, W - 1)) !== gy)
      continue;
    k++;
    const base = gy + 14;
    if (k % 3 !== 0) {
      // A cluster of boulders, big, medium, small, shouldering into each other along the ground.
      // Each is an uneven faceted lump with a heavy base sunk in the earth: never round, never stacked.
      const hero = k % 4 === 1;
      const dirn = r() < 0.5 ? -1 : 1;
      const sizes = hero ? [1.35, 0.7, 0.45] : r() < 0.5 ? [1, 0.6, 0.38] : [0.9, 0.5];
      let cx = x;
      const rocks: Array<{ cx: number; w: number; h: number; tilt: number }> = [];
      sizes.forEach((sz, i) => {
        const w = range(r, 62, 92) * sz;
        const h = w * range(r, 0.55, 0.95);
        if (i > 0) cx += dirn * ((rocks[i - 1] as { w: number }).w * 0.62 + w * 0.5);
        rocks.push({ cx, w, h, tilt: range(r, -0.3, 0.3) + dirn * (i ? -0.25 : 0) });
      });
      // Smallest first so the big one overlaps its neighbours.
      for (const rock of rocks.slice().reverse()) {
        const { w, h, tilt } = rock;
        const stoneBase = haze(mix(TERRAIN.back, TERRAIN.stone[r() < 0.5 ? 2 : 6] as number, 0.45), 0.28);
        // Outline: a lopsided run of corners over the top, wide straight base below ground.
        const nTop = 5 + Math.floor(r() * 2);
        const crown: Array<[number, number]> = [];
        const lop = range(r, 0.3, 0.7);
        for (let i = 0; i <= nTop; i++) {
          const u = i / nTop;
          const px = (u - 0.5) * 2 * w * (1 + (i === 0 || i === nTop ? 0.06 : range(r, -0.07, 0.07)));
          const arch = Math.min(u / lop, (1 - u) / (1 - lop)) ** range(r, 0.45, 0.7);
          const py = -h * (i === 0 || i === nTop ? 0.12 : arch * range(r, 0.82, 1.08));
          crown.push([
            rock.cx + px * Math.cos(tilt) - py * Math.sin(tilt) * 0.4,
            base + py + px * Math.sin(tilt) * 0.5,
          ]);
        }
        const outline: number[] = [];
        for (const [px, py] of crown) outline.push(px, py);
        outline.push(rock.cx + w * 1.08, base + 14, rock.cx - w * 1.08, base + 14);
        p.solid(chaikin(outline, 1), stoneBase, 0.3);
        // Facets: planes between an inner ridge point and neighbouring corners, alternately lit and dark.
        const ridge: [number, number] = [rock.cx + range(r, -0.2, 0.2) * w, base - h * range(r, 0.35, 0.55)];
        for (let i = 0; i < nTop; i++) {
          const a0 = crown[i] as [number, number];
          const a1 = crown[i + 1] as [number, number];
          const facing = (a0[0] + a1[0]) / 2 > ridge[0];
          const tone = facing
            ? mix(stoneBase, TERRAIN.stone[1], range(r, 0.15, 0.4))
            : mix(stoneBase, TERRAIN.backDeep, range(r, 0.1, 0.45));
          p.solid([a0[0], a0[1], a1[0], a1[1], ridge[0], ridge[1]], tone, facing ? 0.34 : 0.27, {}, 0.8);
        }
        p.solid(
          [
            crown[0]?.[0] ?? 0,
            crown[0]?.[1] ?? 0,
            ridge[0],
            ridge[1],
            rock.cx - w * 0.3,
            base + 12,
            rock.cx - w,
            base + 12,
          ],
          mix(stoneBase, TERRAIN.backDeep, 0.4),
          0.26,
          {},
          0.8,
        );
        const crack = wander(
          [
            ridge[0],
            ridge[1],
            ridge[0] + range(r, -12, 12),
            base - h * 0.15,
            ridge[0] + range(r, -20, 20),
            base + 6,
          ],
          3,
          rock.cx,
          16,
        );
        p.solid(
          ribbon(crack, (t) => 2.6 * (1 - t) + 0.6),
          TERRAIN.backDeep,
          0.18,
        );
        // Moss draped over the upper corners, hanging further on one side.
        const cap: number[] = [];
        for (let i = 1; i < nTop; i++)
          cap.push((crown[i] as [number, number])[0], (crown[i] as [number, number])[1] + 3);
        const tone = mossTone(rock.cx, gy, 404 + k, 0);
        const side = r() < 0.5 ? 0.25 : 0.75;
        const thickAt = (t: number): number =>
          (9 + 16 * Math.exp(-(((t - side) / 0.3) ** 2))) * w * 0.012 +
          Math.max(0, wobble(t * 200, rock.cx, 26)) * 5;
        p.solid(
          ribbon(cap, (t) => thickAt(t) * 1.5 + 2),
          haze(mix(tone.dark, TERRAIN.back, 0.55), 0.25),
          0.31,
          { moss: 0.6 },
        );
        p.solid(
          ribbon(
            cap.map((v, j) => (j % 2 ? v - 2 : v)),
            (t) => thickAt(t) * 0.7 + 1,
          ),
          haze(mix(tone.body, TERRAIN.back, 0.55), 0.25),
          0.33,
          { moss: 0.6 },
        );
      }
      if (hero) {
        // The landmark: a sapling rooted in the crack between the two biggest stones.
        const a = rocks[0] as { cx: number; w: number; h: number };
        const sx = a.cx + dirn * a.w * 0.7;
        const sy = base - a.h * 0.45;
        const lean = range(r, -40, 40);
        const stem = wander(
          quad(sx, sy + 20, sx + lean * 0.2, sy - 70, sx + lean, sy - range(r, 130, 170), 12),
          5,
          sx,
          50,
        );
        p.solid(
          ribbon(stem, (t) => 11 * (1 - t) ** 0.8 + 2),
          TERRAIN.backDeep,
          0.27,
          { bark: 0.7 },
        );
        const top = stem.length - 2;
        info.twigs.push({ x: stem[top] as number, y: stem[top + 1] as number, angle: -Math.PI / 2 });
        info.twigs.push({ x: stem[14] as number, y: stem[15] as number, angle: -Math.PI / 2 + 0.9 });
        info.twigs.push({ x: stem[10] as number, y: stem[11] as number, angle: -Math.PI / 2 - 0.9 });
      }
    } else {
      // A dead stump leaning out of true, its top torn to a slant.
      const h = range(r, 110, 180);
      const w0 = range(r, 44, 62);
      const lean = range(r, 0.12, 0.3) * (r() < 0.5 ? -1 : 1);
      const tx = x + Math.sin(lean) * h;
      const ty = base - Math.cos(lean) * h;
      const line = wander(quad(x, base, lerp(x, tx, 0.4), lerp(base, ty, 0.55), tx, ty, 12), 5, x, 60);
      const wood = haze(TERRAIN.back, 0.22);
      p.solid(
        ribbon(line, (t) => w0 * (1 - 0.3 * t) + smoothstep(0.2, 0, t) * 26),
        wood,
        0.28,
        { bark: 0.7 },
      );
      p.solid(
        ribbon(line, (t) => w0 * 0.3 * (1 - 0.3 * t)),
        mix(wood, TERRAIN.bark, 0.3),
        0.33,
        { bark: 0.7 },
      );
      // Shards at the break, of uneven height.
      for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * w0 * 0.18;
        const sh = range(r, 14, 46);
        p.solid(
          [
            tx + off - 6,
            ty + 6,
            tx + off + Math.sin(lean) * sh,
            ty - Math.cos(lean) * sh,
            tx + off + 6,
            ty + 6,
          ],
          wood,
          0.28,
          { bark: 0.7 },
        );
      }
      p.solid(blob(lerp(x, tx, 0.5) - 6, lerp(base, ty, 0.5), 9, 14, x, 0.2, 10), TERRAIN.backDeep, 0.18);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// One authored thing per zone: old, mossy, made by someone. None is a platform: each is tall and
// narrow or hangs, sits behind the walk plane, and has no level top.

function paintProps(p: Paint, scene: Scene, info: TerrainInfo): void {
  const stoneCol = mix(mix(TERRAIN.back, TERRAIN.stone[1], 0.55), PALETTE.fogMid, 0.12);
  const carve = (line: number[], w: number): void => {
    p.solid(
      ribbon(line, (t) => w * Math.sin(Math.PI * clamp(t, 0.06, 0.94)) + 0.6),
      TERRAIN.backDeep,
      0.22,
    );
  };
  // A moth's wings, cut as two pairs of curved strokes about a centre line.
  const mothMotif = (cx: number, cy: number, sz: number, rot: number): void => {
    const pt = (x: number, y: number): [number, number] => [
      cx + x * Math.cos(rot) - y * Math.sin(rot),
      cy + x * Math.sin(rot) + y * Math.cos(rot),
    ];
    for (const sgn of [-1, 1]) {
      const a = pt(0, -sz * 0.2);
      const b = pt(sgn * sz * 0.9, -sz * 0.95);
      const c = pt(sgn * sz, 0);
      const d = pt(sgn * sz * 0.6, sz * 0.8);
      const e = pt(0, sz * 0.3);
      carve([...a, ...b, ...c, ...pt(sgn * sz * 0.2, sz * 0.05)], 3);
      carve([...pt(sgn * sz * 0.15, sz * 0.1), ...c, ...d, ...e], 2.6);
    }
    carve([...pt(0, -sz * 0.6), ...pt(0, sz * 0.6)], 3.4);
  };
  const pool = info.pool;
  if (pool) {
    // Left: a standing stone half sunk beside the pool, leaning, a moth cut into its face.
    const x = pool.x0 - 150;
    const gy = info.groundY(x) + 16;
    const lean = -0.13;
    const h = 176;
    const w = 58;
    const pts: number[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI + (Math.PI * i) / 20;
      const u = i / 20;
      const px = Math.cos(a) * (w / 2) * (1 + 0.08 * Math.sin(u * 9));
      const py = -h + (1 + Math.sin(a)) * 30 + wobble(u * 200, 71, 30) * 3;
      pts.push(x + px + -py * Math.sin(lean) * -1, gy + py);
    }
    pts.push(x + w / 2 + 6, gy, x - w / 2 - 6, gy);
    p.solid(chaikin(pts, 1), stoneCol, 0.4);
    const edge: number[] = [];
    for (let i = 0; i <= 8; i++)
      edge.push(
        x + w / 2 - 9 + (h - i * 20) * Math.sin(lean) * -1 * 0.0 + Math.sin(i) * 2 + i * 20 * 0.13,
        gy - 8 - i * 20,
      );
    p.solid(
      ribbon(edge, () => 9),
      mix(stoneCol, TERRAIN.stone[0], 0.4),
      0.46,
    );
    mothMotif(x + h * 0.55 * 0.13, gy - h * 0.6, 17, lean);
    carve([x - 12 + 9, gy - h * 0.32, x + 14 + 9, gy - h * 0.32], 2.4);
    carve([x - 10 + 7, gy - h * 0.25, x + 12 + 7, gy - h * 0.25], 2);
    const tone = mossTone(x, gy, 71, 0);
    p.solid(blob(x - 6, gy - 16, 40, 20, 72, 0.4, 12), mix(tone.dark, TERRAIN.back, 0.5), 0.42, {
      moss: 0.7,
    });
    p.solid(blob(x + 20, gy - h + 34, 16, 26, 73, 0.4, 10, 0.3), mix(tone.dark, TERRAIN.back, 0.4), 0.44, {
      moss: 0.7,
    });
    info.keepClear.push([x - 60, x + 70]);
  }
  // Centre: a silk cocoon lantern hung under the great bough, faintly warm.
  const bough = scene.solids.find(
    (s) => s.tag === 'ledge' && scene.solids.some((o) => o.tag === 'trunk' && o.x === s.x + s.w),
  );
  if (bough) {
    const x = bough.x + bough.w * 0.36;
    const y0 = bough.y + bough.h + 20;
    const len = 150;
    p.solid(
      ribbon(wander([x, y0 - 30, x + 3, y0 + len * 0.5, x, y0 + len], 2, 81, 60), () => 2.2),
      0x8a8468,
      0.5,
    );
    const cy = y0 + len + 30;
    const body: number[] = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const taper = Math.sin(a) < 0 ? 0.62 : 1;
      body.push(
        x + Math.cos(a) * 19 * (0.75 + 0.25 * taper),
        cy + Math.sin(a) * 34 * (Math.sin(a) < 0 ? 1.1 : 0.9),
      );
    }
    p.solid(chaikin(body, 1), 0x9c8a5e, 0.6);
    p.solid(blob(x + 2, cy + 4, 11, 20, 82, 0.15, 12), 0xe0b468, 0.66);
    p.solid(blob(x + 2, cy + 8, 5.5, 10, 83, 0.15, 10), 0xffe2a0, 0.7);
    for (let k = 0; k < 5; k++) {
      const yy = cy - 26 + k * 12;
      const hw = 17 * Math.sin(Math.PI * clamp((k + 0.7) / 5.6, 0.1, 0.9)) + 3;
      p.solid(
        ribbon(quad(x - hw, yy, x, yy + 5, x + hw, yy - 1, 6), () => 1.8),
        0x5e563e,
        0.66,
        {},
        0.8,
      );
    }
    for (const d of [-1, 1]) {
      p.solid(
        ribbon(
          quad(x + d * 4, cy + 30, x + d * 9, cy + 44, x + d * 5, cy + 58, 5),
          (t) => 2.4 * (1 - t) + 0.5,
        ),
        0x8a8468,
        0.5,
      );
    }
    info.lanterns.push({ x: x + 2, y: cy + 6 });
  }
  // Right: a small moth shrine: a cairn with a carved wing-stone set upright on it, and a bowl.
  {
    const x = scene.width - 520;
    const gy = info.groundY(x) + 14;
    const sizes = [44, 34, 25];
    let y = gy;
    sizes.forEach((sz, i) => {
      const cx = x + (i % 2 ? 7 : -5);
      p.solid(
        chaikin(blob(cx, y - sz * 0.34, sz, sz * 0.42, 90 + i, 0.3, 9, i % 2 ? 0.08 : -0.06), 2),
        mix(stoneCol, TERRAIN.backDeep, i * 0.12),
        0.38 + i * 0.01,
      );
      y -= sz * 0.58;
    });
    const top: number[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI + (Math.PI * i) / 14;
      top.push(x + 2 + Math.cos(a) * 17, y - 50 + (1 + Math.sin(a)) * 16);
    }
    top.push(x + 21, y + 4, x - 17, y + 4);
    p.solid(chaikin(top, 1), mix(stoneCol, TERRAIN.stone[6], 0.3), 0.42);
    mothMotif(x + 2, y - 26, 11, 0);
    p.solid(
      chaikin([x + 44, gy - 18, x + 52, gy - 6, x + 70, gy - 5, x + 78, gy - 18, x + 61, gy - 13], 1),
      mix(stoneCol, TERRAIN.backDeep, 0.2),
      0.4,
    );
    const tone = mossTone(x, gy, 91, 0);
    p.solid(blob(x - 26, gy - 12, 26, 13, 92, 0.4, 10), mix(tone.dark, TERRAIN.back, 0.5), 0.42, {
      moss: 0.7,
    });
    info.lanterns.push({ x: x + 61, y: gy - 19, violet: true });
    info.keepClear.push([x - 70, x + 100]);
  }
}

// ---------------------------------------------------------------------------------------------
// Edge walls: the scene's invisible solid left and right bounds, dressed as living rock and an
// enormous trunk. Only a sliver is ever on screen; plants (pf-plants.ts) do the rest.

function paintEdgeWalls(p: Paint, scene: Scene, info: TerrainInfo): void {
  const W = scene.width;
  const bulge = TERRAIN.edgeBulge;
  for (const side of [-1, 1] as const) {
    const xe = side < 0 ? 0 : W;
    const inward = -side as -1 | 1;
    const yBottom = info.groundY(side < 0 ? 1 : W - 1) + 30;
    const pts: number[] = [xe + side * OUT, -OUT];
    for (let y = -OUT; y <= yBottom; y += 10) {
      const b =
        (wobble(y, 300 + side, 120) * 0.5 + 0.5) * bulge * 0.7 + (wobble(y, 310 + side, 27) + 1) * 1.6;
      pts.push(xe + inward * b, y);
    }
    pts.push(xe + side * OUT, yBottom);
    const outline = chaikin(pts, 1);
    if (side < 0) {
      p.solid(outline, TERRAIN.stone[2], 0.55);
      const r = rngFor(301);
      for (let y = -100; y < yBottom; y += range(r, 26, 90)) {
        const h = range(r, 24, 80);
        const pts2 = chaikin(blob(xe - 20, y, 34 + range(r, 0, bulge), h * 0.6, y, 0.3, 8), 1);
        p.solid(
          pts2,
          mix(TERRAIN.stone[r() < 0.5 ? 0 : 1] as number, TERRAIN.earth[2], range(r, 0.1, 0.5)),
          0.62,
        );
      }
    } else {
      p.solid(outline, TERRAIN.bark, 0.55, { bark: 1 });
      barkDetail(p, xe - 40, -100, xe + 20, yBottom, 320);
    }
    // Moss patches spilling over the face.
    const r = rngFor(330 + side);
    for (let y = -60; y < yBottom - 60; y += range(r, 60, 240)) {
      const h = range(r, 30, 110);
      const line = wander(
        quad(xe + inward * 3, y, xe + inward * 8, y + h * 0.5, xe + inward * 2, y + h, 10),
        3,
        y,
        30,
      );
      p.solid(
        ribbon(line, (t) => 18 * Math.sin(Math.PI * clamp(t * 0.9 + 0.05, 0, 1)) + 2),
        TERRAIN.mossDark,
        0.72,
        { moss: 1 },
      );
      p.solid(
        ribbon(line, (t) => 9 * Math.sin(Math.PI * clamp(t * 0.9 + 0.05, 0, 1)) + 1),
        TERRAIN.moss,
        0.8,
        { moss: 1 },
      );
    }
    // What the sliver belongs to: something colossal standing just off-screen.
    const gy = yBottom - 30;
    if (side < 0) {
      // The foot of a cliff: fallen slabs leaning on it (back plane), and a thread of water
      // running down the face into a wet stain.
      const er = rngFor(311);
      for (let i = 0; i < 4; i++) {
        const cx = xe + range(er, 6, 80);
        const rx = range(er, 34, 66);
        const ry = range(er, 46, 110);
        const stone = mix(mix(TERRAIN.back, TERRAIN.stone[2], 0.5), PALETTE.fogMid, 0.2);
        p.solid(
          chaikin(blob(cx, gy - ry * 0.5 + 10, rx, ry, cx, 0.35, 8, range(er, -0.5, 0.2)), 1),
          stone,
          0.3,
        );
        p.solid(
          chaikin(blob(cx + 8, gy - ry * 0.8, rx * 0.55, ry * 0.4, cx + 1, 0.3, 7, -0.3), 1),
          mix(stone, TERRAIN.stone[1], 0.3),
          0.34,
        );
      }
      const fall = wander([xe + 11, -80, xe + 15, gy * 0.35, xe + 9, gy * 0.7, xe + 14, gy + 4], 5, 312, 90);
      p.solid(
        ribbon(fall, () => 9),
        mix(TERRAIN.stone[2], 0x1a3a4a, 0.5),
        0.6,
      );
      p.solid(
        ribbon(fall, (t) => 3.2 + Math.sin(t * 40) * 0.8),
        0x9fdbe6,
        0.82,
      );
      p.solid(blob(xe + 16, gy + 2, 24, 7, 313, 0.3, 10), 0xbfeaf0, 0.8, {}, 0.8);
      p.tint(blob(xe + 30, gy + 16, 60, 16, 314, 0.3, 12), 0x163a4c, 0.5);
    } else {
      // A root buttress as thick as a house wall, flaring off-screen, with a hollow at its foot.
      const er = rngFor(321);
      for (let i = 0; i < 3; i++) {
        const fromY = gy - range(er, 240, 420) - i * 60;
        const toX = xe - range(er, 90, 170) - i * 26;
        const line = wander(
          cubic(xe + 30, fromY, xe - 10, lerp(fromY, gy, 0.5), toX + 60, gy - 60, toX, gy + 12, 18),
          7,
          322 + i,
          70,
        );
        const w0 = range(er, 70, 96) - i * 14;
        const tone = i === 0 ? TERRAIN.back : TERRAIN.backDeep;
        p.solid(
          ribbon(line, (t) => w0 * (1 - 0.55 * t) + smoothstep(0.8, 1, t) * 24),
          tone,
          0.29 - i * 0.03,
          { bark: 0.7 },
        );
        p.solid(
          ribbon(line, (t) => w0 * (1 - 0.55 * t) * 0.3),
          mix(tone, TERRAIN.bark, 0.35),
          0.34 - i * 0.03,
          { bark: 0.7 },
        );
      }
      p.solid(
        chaikin(blob(xe - 34, gy - 50, 40, 64, 323, 0.25, 10), 2),
        mix(TERRAIN.back, TERRAIN.bark, 0.4),
        0.31,
        { bark: 0.6 },
      );
      p.solid(chaikin(blob(xe - 34, gy - 44, 30, 52, 323, 0.25, 10), 2), 0x081622, 0.16);
    }
    info.faces.push({ x: xe, y0: 0, y1: yBottom - 30, dir: inward, kind: 'edge' });
  }
}

// ---------------------------------------------------------------------------------------------
// Bark

/** Ridges, furrows and knots over an already-filled bark body. */
function barkDetail(p: Paint, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const r = rngFor(seed, x0);
  const w = x1 - x0;
  const count = Math.round((w / 11) * ((y1 - y0) / 190));
  for (let i = 0; i < count; i++) {
    const x = x0 + 5 + r() * (w - 10);
    const ya = lerp(y0, y1, r()) - 40;
    const len = range(r, 70, 260);
    const lean = range(r, -7, 7);
    const line = wander(quad(x, ya, x + lean * 0.3, ya + len / 2, x + lean, ya + len, 10), 3.5, seed + i, 50);
    const clip = line.map((v, k) => (k % 2 ? clamp(v, y0 + 4, y1 - 3) : clamp(v, x0 - 2, x1 + 2)));
    const wd = range(r, 4, 9);
    const shape = (t: number): number => wd * Math.sin(Math.PI * clamp(t, 0.02, 0.98)) ** 0.6 + 0.6;
    if (r() < 0.55) {
      p.solid(
        ribbon(clip, shape),
        mix(TERRAIN.bark, TERRAIN.barkLit, range(r, 0.2, 0.75)),
        range(r, 0.6, 0.7),
        {
          bark: 1,
        },
      );
    } else {
      p.solid(
        ribbon(clip, (t) => shape(t) * 0.6),
        TERRAIN.barkDark,
        range(r, 0.3, 0.4),
        { bark: 1 },
      );
    }
  }
  const knots = Math.round(((y1 - y0) * w) / 120000 + r() * 0.8);
  for (let i = 0; i < knots; i++) {
    const cx = x0 + w * range(r, 0.25, 0.75);
    const cy = lerp(y0 + 40, y1 - 40, r());
    const s = range(r, 9, 17);
    p.solid(blob(cx, cy, s * 1.25, s * 1.7, seed + i, 0.15, 14), TERRAIN.barkLit, 0.74, { bark: 1 });
    p.solid(blob(cx, cy, s * 0.8, s * 1.15, seed + i, 0.15, 12), TERRAIN.bark, 0.6, { bark: 1 });
    p.solid(blob(cx, cy + 1, s * 0.4, s * 0.62, seed + i, 0.15, 10), TERRAIN.backDeep, 0.3);
  }
}

/** A wobbly box outline. `amp`: top, side, bottom wobble in px. `sag(t)` adds depth under it. */
function boxOutline(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  amp: { top: number; side: number; bottom: number },
  sag: (t: number) => number = () => 0,
  step = 8,
): number[] {
  const pts: number[] = [];
  for (let x = x0 + 4; x <= x1 - 4; x += step) pts.push(x, y0 + 2 + wobble(x, seed, 60) * amp.top);
  for (let y = y0 + 8; y <= y1 - 6; y += step) pts.push(x1 + wobble(y, seed + 1, 44) * amp.side, y);
  for (let x = x1 - 4; x >= x0 + 4; x -= step) {
    pts.push(x, y1 + sag((x - x0) / (x1 - x0)) + wobble(x, seed + 2, 38) * amp.bottom);
  }
  for (let y = y1 - 6; y >= y0 + 8; y -= step) pts.push(x0 + wobble(y, seed + 3, 44) * amp.side, y);
  return chaikin(pts, 2);
}

// ---------------------------------------------------------------------------------------------
// Trunks. The two in the middle stop above the ground: they stand on stilt roots in the back
// plane so the walk-under reads as an arch.

interface StiltRoot {
  line: number[];
  width: (u: number) => number;
  deep: boolean;
}

/** The arch of roots a hanging trunk stands on. Deterministic, so two passes can share it. */
function stiltRoots(t: SolidRect, groundY: (x: number) => number): StiltRoot[] {
  const yb = t.y + t.h;
  const r = rngFor(t.x, 77);
  const out: StiltRoot[] = [];
  const add = (fromX: number, fromY: number, toX: number, w0: number, deep: boolean, lvl: number): void => {
    const sgn = toX < fromX ? -1 : 1;
    const gy = groundY(toX) + 14;
    const line = wander(
      cubic(
        fromX,
        fromY,
        lerp(fromX, toX, 0.72),
        fromY + (lvl ? 10 : range(r, 22, 44)),
        toX - sgn * range(r, 0, 12),
        lerp(fromY, gy, 0.42),
        toX + sgn * range(r, 6, 20),
        gy,
        20,
      ),
      lvl ? 5 : 8,
      fromX + toX,
      48,
    );
    const lump = range(r, 0, 6.28);
    // Fat where it leaves the trunk, waisted, flaring again into the ground; knuckled all along.
    const width = (u: number): number =>
      w0 * (1 - 0.5 * smoothstep(0, 0.75, u)) +
      smoothstep(0.8, 1, u) * w0 * 0.42 +
      Math.max(0, Math.sin(u * 15 + lump)) * w0 * 0.08;
    out.push({ line, width, deep });
    if (lvl === 0) {
      // Each main root forks on the way down.
      const k = Math.floor(range(r, 0.4, 0.58) * 20) * 2;
      add(
        line[k] as number,
        line[k + 1] as number,
        (line[k] as number) - sgn * range(r, 24, 64),
        w0 * 0.42,
        true,
        1,
      );
      if (r() < 0.7) {
        const k2 = Math.floor(range(r, 0.6, 0.75) * 20) * 2;
        add(line[k2] as number, line[k2 + 1] as number, toX + sgn * range(r, 34, 70), w0 * 0.34, deep, 1);
      }
    }
  };
  add(t.x + t.w * 0.2, yb - 46, t.x - range(r, 96, 136), range(r, 58, 68), false, 0);
  add(t.x + t.w * 0.8, yb - 46, t.x + t.w + range(r, 96, 136), range(r, 58, 68), false, 0);
  add(t.x + t.w * 0.42, yb - 30, t.x + t.w * 0.42 - range(r, 16, 44), range(r, 34, 42), true, 0);
  add(t.x + t.w * 0.62, yb - 30, t.x + t.w * 0.62 + range(r, 16, 44), range(r, 30, 38), true, 0);
  return out;
}

/** Back-plane pass: the whole arch, dark, before the ground is painted. */
function paintStiltRoots(p: Paint, t: SolidRect, groundY: (x: number) => number): void {
  const roots = stiltRoots(t, groundY).sort((a, b) => Number(b.deep) - Number(a.deep));
  for (const root of roots) {
    const tone = root.deep ? TERRAIN.backDeep : TERRAIN.back;
    const h = root.deep ? 0.2 : 0.28;
    p.solid(ribbon(root.line, root.width), tone, h, { bark: 0.6 });
    p.solid(
      ribbon(root.line, (u) => root.width(u) * 0.34),
      mix(tone, TERRAIN.bark, 0.3),
      h + 0.06,
      { bark: 0.6 },
    );
  }
}

/**
 * Front pass: where each root leaves the trunk it is still trunk (same bark, same plane), and it
 * sinks into the back plane over its first stretch, so there is no cut line under the trunk.
 */
function paintRootShoulders(p: Paint, t: SolidRect, groundY: (x: number) => number): void {
  const roots = stiltRoots(t, groundY).sort((a, b) => Number(b.deep) - Number(a.deep));
  const n = 21;
  for (const root of roots) {
    const reachT = root.deep ? 0.3 : 0.46;
    const last = Math.floor(reachT * (n - 1));
    for (let i = last - 1; i >= 0; i--) {
      const u0 = i / (n - 1);
      const k = smoothstep(0.04, reachT, u0);
      const seg = root.line.slice(i * 2, i * 2 + 6);
      if (seg.length < 4) continue;
      const m = seg.length / 2 - 1;
      const wAt = (v: number): number => root.width(u0 + (v * m) / (n - 1));
      const back = root.deep ? TERRAIN.backDeep : TERRAIN.back;
      const h = lerp(0.55, root.deep ? 0.2 : 0.28, k);
      p.solid(ribbon(seg, wAt), mix(TERRAIN.bark, back, k), h, { bark: lerp(1, 0.6, k) });
      p.solid(
        ribbon(seg, (v) => wAt(v) * 0.34),
        mix(mix(TERRAIN.bark, TERRAIN.barkLit, 0.5), mix(back, TERRAIN.bark, 0.3), k),
        h + 0.06,
        { bark: lerp(1, 0.6, k) },
      );
    }
  }
}

/**
 * `ivied` picks the trunk's character: false = a hollow old snag studded with bracket fungi, true =
 * vine-wrapped with a fern garden and a nest in its crown. Neighbours alternate.
 */
function paintTrunk(p: Paint, t: SolidRect, scene: Scene, info: TerrainInfo, ivied: boolean): void {
  const x1 = t.x + t.w;
  const joinedL = scene.solids.some((o) => o.tag === 'ledge' && o.y === t.y && o.x + o.w === t.x);
  const y1 = t.y + t.h;
  const hanging = y1 < info.groundY(t.x + t.w / 2) - 40;
  const r = rngFor(t.x, 31);
  // Underside: arches between the knees where the roots leave, never a straight cut.
  const sag = (u: number): number =>
    hanging ? 12 - 26 * Math.abs(Math.sin(Math.PI * u * 1.5 + 0.4)) ** 0.8 : 0;
  // A living silhouette: slow swells, burls, a flare toward the base, a ragged broken crown.
  const side = (y: number, sd: number): number =>
    wobble(y, t.x + sd, 190) * 7 +
    wobble(y, t.x + sd + 1, 46) * 3 +
    (hanging ? smoothstep(y1 - 130, y1, y) * 9 : 0);
  const pts: number[] = [];
  for (let x = t.x + 4; x <= x1 - 4; x += 6) {
    pts.push(x, t.y + 2 + wobble(x, t.x, 40) * 1.3 + Math.max(0, wobble(x, t.x + 5, 9) - 0.55) * 7);
  }
  for (let y = t.y + 8; y <= y1 - 6; y += 7) pts.push(x1 + side(y, 11), y);
  for (let x = x1 - 4; x >= t.x + 4; x -= 6)
    pts.push(x, y1 + sag((x - t.x) / t.w) + wobble(x, t.x + 2, 30) * 2);
  for (let y = y1 - 6; y >= t.y + 8; y -= 7) pts.push(t.x - side(y, 23), y);
  p.solid(chaikin(pts, 2), TERRAIN.bark, 0.55, { bark: 1 });
  // Burls on the flanks.
  for (let i = 0; i < 3; i++) {
    const left = r() < 0.5;
    const by = lerp(t.y + 60, y1 - 90, r());
    const bx = left ? t.x - side(by, 23) + 4 : x1 + side(by, 11) - 4;
    const rad = range(r, 12, 20);
    p.solid(blob(bx, by, rad, rad * range(r, 1.1, 1.6), by, 0.25, 12), TERRAIN.bark, 0.6, { bark: 0.8 });
    p.solid(blob(bx + 2, by - 3, rad * 0.5, rad * 0.7, by + 1, 0.25, 10), TERRAIN.barkLit, 0.66, {
      bark: 0.8,
    });
  }
  barkDetail(p, t.x, t.y + 8, x1, y1 - (hanging ? 20 : 0), t.x + 5);
  // Big bark plates, some lapping a few px past the flanks so the sides are never ruled lines.
  for (let i = 0; i < Math.round(t.h / 62); i++) {
    const py = lerp(t.y + 40, y1 - (hanging ? 80 : 30), (i + r()) / Math.round(t.h / 62));
    const edge = r();
    const px =
      edge < 0.3
        ? t.x - side(py, 23) + range(r, -2, 8)
        : edge > 0.7
          ? x1 + side(py, 11) - range(r, -2, 8)
          : lerp(t.x + 24, x1 - 24, r());
    const pw = range(r, 15, 26);
    const ph = range(r, 34, 70);
    const plate = chaikin(blob(px, py, pw, ph, py, 0.35, 9, range(r, -0.12, 0.12)), 1);
    p.tint(
      plate.map((v, k) => (k % 2 ? v + 3 : v - 2)),
      TERRAIN.backDeep,
      0.5,
    );
    p.solid(
      plate,
      mix(TERRAIN.bark, r() < 0.5 ? TERRAIN.barkLit : 0x2f4a3e, range(r, 0.15, 0.55)),
      range(r, 0.6, 0.68),
      { bark: 1 },
    );
  }
  // Thick old vines winding round the trunk: each visible pass crosses the face on a slant.
  let vy = t.y + range(r, 60, 130);
  let vdir = r() < 0.5 ? -1 : 1;
  while (ivied && vy < y1 - (hanging ? 150 : 60)) {
    const rise = range(r, 70, 130);
    const xa = vdir > 0 ? t.x - side(vy + rise, 23) - 3 : x1 + side(vy + rise, 11) + 3;
    const xb = vdir > 0 ? x1 + side(vy, 11) + 3 : t.x - side(vy, 23) - 3;
    const line = wander(
      cubic(
        xa,
        vy + rise,
        lerp(xa, xb, 0.3),
        vy + rise * 0.95,
        lerp(xa, xb, 0.7),
        vy + rise * 0.1,
        xb,
        vy,
        14,
      ),
      4,
      vy,
      40,
    );
    const vw = range(r, 7, 11);
    p.tint(
      ribbon(
        line.map((v, k) => (k % 2 ? v + 5 : v)),
        () => vw + 5,
      ),
      TERRAIN.backDeep,
      0.45,
    );
    p.solid(
      ribbon(line, (u) => vw * (0.8 + 0.2 * Math.sin(u * 9))),
      mix(TERRAIN.rootWood, TERRAIN.mossDark, 0.45),
      0.72,
      { bark: 0.2 },
    );
    p.solid(
      ribbon(line, () => vw * 0.3),
      mix(TERRAIN.rootWood, TERRAIN.moss, 0.5),
      0.8,
      { moss: 0.4 },
    );
    info.ivy.push({ line, dir: vdir });
    vy += rise + range(r, 30, 150);
    vdir = -vdir;
  }
  if (!ivied) {
    // A big rot hollow part-way up, with a rolled lip of healed bark. Something glows inside.
    const hcx = t.x + t.w * range(r, 0.42, 0.56);
    const hcy = lerp(t.y, y1, range(r, 0.3, 0.42));
    const hrx = t.w * range(r, 0.2, 0.25);
    const hry = range(r, 52, 70);
    p.solid(
      chaikin(blob(hcx, hcy, hrx + 11, hry + 13, t.x, 0.2, 14), 2),
      mix(TERRAIN.bark, TERRAIN.barkLit, 0.7),
      0.72,
      { bark: 0.5 },
    );
    p.solid(chaikin(blob(hcx, hcy, hrx + 4, hry + 5, t.x, 0.2, 14), 2), TERRAIN.barkDark, 0.5, { bark: 0.5 });
    p.solid(chaikin(blob(hcx, hcy + 2, hrx, hry, t.x, 0.22, 14), 2), 0x0a1a2a, 0.24);
    p.solid(
      chaikin(blob(hcx - 2, hcy + hry * 0.2, hrx * 0.6, hry * 0.6, t.x + 1, 0.2, 10), 2),
      0x06121e,
      0.18,
    );
    info.pockets.push({ x: hcx, y: hcy + hry * 0.72, w: hrx * 1.3, roof: hcy - hry * 0.8, kind: 'glow' });
  } else {
    // A nest wedged in the crown: a shallow bowl of twigs, lower than the grass around it.
    const nx = t.x + t.w * range(r, 0.6, 0.72);
    for (let i = 0; i < 9; i++) {
      const w0 = range(r, 13, 20);
      const dy = range(r, 0, 7);
      const line = quad(
        nx - w0,
        t.y + 1 + dy * 0.3,
        nx + range(r, -3, 3),
        t.y + 9 + dy,
        nx + w0,
        t.y + 1 + dy * 0.3,
        6,
      );
      p.solid(
        ribbon(line, () => 2.2),
        mix(0x6a5a44, TERRAIN.bark, range(r, 0, 0.6)),
        0.7,
      );
    }
  }
  // Shards of the snapped rim at the very edges (a hand's width, nothing to stand on).
  for (const [sx, d] of [
    [t.x + 3, -1],
    [x1 - 3, 1],
  ] as const) {
    if (d < 0 && joinedL) continue;
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const bx = sx - d * i * range(r, 5, 9);
      const hgt = range(r, 5, 11) * (1 - i * 0.25);
      p.solid(
        [bx - 4, t.y + 14, bx - d * 1.5, t.y - hgt, bx + 4, t.y + 14],
        mix(TERRAIN.bark, TERRAIN.barkLit, 0.4),
        0.6,
        { bark: 1 },
      );
    }
  }
  if (hanging) paintRootShoulders(p, t, info.groundY);
  // Shade the side away from the key, in two soft passes.
  for (const [off, wd] of [
    [10, 22],
    [20, 40],
  ] as const) {
    const line = wander(
      [t.x + off, t.y + 10, t.x + off + 4, (t.y + y1) / 2, t.x + off, y1 - 6],
      8,
      t.x + wd,
      120,
    );
    p.tint(
      ribbon(line, () => wd),
      TERRAIN.barkDark,
      0.22,
    );
  }
  // Moss patches, mostly up the shaded side.
  for (let y = t.y + 40; y < y1 - 40; y += range(r, 50, 190)) {
    const left = r() < 0.7;
    const cx = left ? t.x + range(r, 6, 22) : x1 - range(r, 6, 18);
    const h = range(r, 22, 70);
    p.solid(
      blob(cx, y, range(r, 10, 20), h * 0.55, y, 0.5, 14),
      mix(TERRAIN.mossDark, TERRAIN.bark, 0.35),
      0.62,
      { moss: 0.7, bark: 0.3 },
    );
    p.solid(blob(cx + 1, y - 3, range(r, 5, 10), h * 0.3, y + 1, 0.5, 10), TERRAIN.mossDark, 0.68, {
      moss: 1,
    });
  }
  // Bracket fungi: small shelves, far too small to stand on.
  for (let y = t.y + range(r, 90, 200); y < y1 - 80; y += ivied ? range(r, 260, 420) : range(r, 70, 170)) {
    const right = r() < 0.6;
    const k = 1 + Math.floor(r() * 2.6);
    for (let j = 0; j < k; j++) {
      const w = range(r, 12, 22);
      const cy = y + j * range(r, 12, 18);
      const cx = right ? x1 + w * 0.3 : t.x - w * 0.3;
      const cap = [
        cx - w,
        cy + 2,
        cx - w * 0.6,
        cy - 4,
        cx,
        cy - 6,
        cx + w * 0.6,
        cy - 4,
        cx + w,
        cy + 2,
        cx,
        cy + 5,
      ];
      p.solid(chaikin(cap, 2), mix(0xc98a4a, TERRAIN.bark, 0.25), 0.72);
      p.tint(
        chaikin([cx - w * 0.8, cy + 1, cx, cy - 4.5, cx + w * 0.8, cy + 1, cx, cy - 1], 2),
        0xe6b872,
        0.7,
      );
    }
  }
  mossCap(p, t.x, x1, t.y, {
    seed: t.x + 9,
    read: TERRAIN.highRead,
    drapeL: joinedL ? 0 : range(r, 30, 80),
    drapeR: range(r, 30, 80),
    thick: 10,
    drip: 20,
  });
  info.tops.push({ x0: t.x, x1, y: t.y, kind: 'trunk', freeL: !joinedL, freeR: true });
  info.unders.push({ x0: t.x + 6, x1: x1 - 6, y: (x) => y1 + sag((x - t.x) / t.w) - 2, kind: 'trunk' });
  info.faces.push(
    { x: t.x, y0: t.y, y1, dir: -1, kind: 'trunk' },
    { x: x1, y0: t.y, y1, dir: 1, kind: 'trunk' },
  );
}

// ---------------------------------------------------------------------------------------------
// Ledges: a burl shelf growing out of whatever is beside them (a trunk or the scene edge).

function paintLedge(p: Paint, s: SolidRect, scene: Scene, info: TerrainInfo): void {
  const x1 = s.x + s.w;
  const onTrunk = scene.solids.some(
    (o) => o.tag === 'trunk' && (o.x === x1 || o.x + o.w === s.x) && o.y <= s.y,
  );
  const anchoredRight = x1 >= scene.width - 1 || scene.solids.some((o) => o.tag === 'trunk' && o.x === x1);
  if (onTrunk) paintLivingBough(p, s, anchoredRight, info);
  else paintCrookShelf(p, s, anchoredRight, info);
}

/**
 * A ledge beside a trunk: one enormous living bough. It swells out of the trunk through a fat
 * collar, bellies down, tapers, and ends in a knuckled, forking tip that carries leaves.
 */
function paintLivingBough(p: Paint, s: SolidRect, anchoredRight: boolean, info: TerrainInfo): void {
  const x1 = s.x + s.w;
  const y1 = s.y + s.h;
  const r = rngFor(s.x, 51);
  const rootX = anchoredRight ? x1 : s.x;
  const tipX = anchoredRight ? s.x : x1;
  const dir = anchoredRight ? -1 : 1;
  // a: 0 at the trunk, 1 at the tip. Depth of the underside below the collision bottom.
  const sag = (u: number): number => {
    const a = anchoredRight ? 1 - u : u;
    const collar = 92 * (1 - smoothstep(0, 0.34, a)) ** 1.6;
    const belly = 26 * Math.sin(Math.PI * clamp((a - 0.12) / 0.7, 0, 1)) ** 1.3;
    const taper = -30 * smoothstep(0.6, 1, a) ** 1.2;
    return (
      collar +
      belly +
      taper +
      wobble(u * s.w, s.x + 3, 46) * 4 +
      Math.max(0, wobble(u * s.w, s.x + 4, 21)) * 5
    );
  };
  // Outline: flat top, knuckled tip that droops, bellying underside, and it runs on into the trunk.
  const top: number[] = [];
  const bot: number[] = [];
  const n = 44;
  const over = 34;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(rootX - dir * over, tipX + dir * 10, t);
    const u = clamp((x - s.x) / s.w, 0, 1);
    const a = anchoredRight ? 1 - u : u;
    const tipDrop = smoothstep(0.93, 1.03, a + (t > 0.97 ? 0.04 : 0)) * 9;
    top.push(x, s.y + 2 + wobble(x, s.x, 60) * 1.2 + tipDrop);
    bot.push(x, y1 + sag(u) - tipDrop * 0.5);
  }
  const outline = top.slice();
  // A rounded knuckle closes the tip.
  const ty0 = top[top.length - 1] as number;
  const by0 = bot[bot.length - 1] as number;
  for (let k = 1; k < 6; k++) {
    const ang = (Math.PI * k) / 6;
    outline.push(
      tipX + dir * (10 + Math.sin(ang) * 16),
      lerp(ty0, by0, k / 6) + wobble(k * 9, s.x + 8, 3) * 2,
    );
  }
  for (let i = bot.length - 2; i >= 0; i -= 2) outline.push(bot[i] as number, bot[i + 1] as number);
  const wood = mix(TERRAIN.bark, TERRAIN.rootWood, 0.3);
  p.solid(chaikin(outline, 2), wood, 0.57, { bark: 0.2 });
  // Grain that flows with the limb: it follows the underside near the bottom, the top near the top.
  for (let i = 0; i < 12; i++) {
    const f = (i + 0.5) / 12;
    const line: number[] = [];
    const t0 = range(r, 0, 0.35);
    const t1 = range(r, 0.6, 1);
    for (let k = 0; k <= 16; k++) {
      const t = lerp(t0, t1, k / 16);
      const j = Math.round(t * n) * 2;
      line.push(
        top[j] as number,
        lerp((top[j + 1] as number) + 8, (bot[j + 1] as number) - 5, f) + wobble(k * 20, s.x + i, 30) * 2.5,
      );
    }
    const light = i % 3 !== 1;
    const wd = range(r, 3, 6);
    p.solid(
      ribbon(line, (t) => wd * Math.sin(Math.PI * clamp(t, 0.03, 0.97)) ** 0.7 + 0.6),
      light ? mix(wood, TERRAIN.barkLit, range(r, 0.35, 0.8)) : TERRAIN.barkDark,
      light ? range(r, 0.62, 0.7) : 0.42,
      { bark: 0.2 },
    );
  }
  // The collar: rolls of bark where the limb leaves the trunk, wrapping well below the join.
  for (let k = 0; k < 4; k++) {
    const cx = rootX + dir * (16 + k * 15);
    const cyTop = s.y + 16;
    const cyBot = y1 + sag(clamp((cx - s.x) / s.w, 0, 1)) - 6;
    const line = wander(
      quad(cx, cyTop, cx + dir * (12 - k * 2), (cyTop + cyBot) / 2, cx - dir * 8, cyBot, 10),
      3,
      s.x + k,
      30,
    );
    p.solid(
      ribbon(line, (t) => (11 - k * 1.5) * Math.sin(Math.PI * clamp(t, 0.05, 0.95)) ** 0.6 + 1),
      k % 2 ? TERRAIN.barkDark : mix(wood, TERRAIN.barkLit, 0.55),
      k % 2 ? 0.44 : 0.68,
      { bark: 0.4 },
    );
  }
  // Burls and old limb scars along the belly.
  for (let i = 0; i < 4; i++) {
    const u = range(r, 0.12, 0.85);
    const bx = s.x + s.w * u;
    const by = y1 + sag(u) - range(r, 6, 22);
    const rad = range(r, 9, 16);
    p.solid(blob(bx, by, rad * 1.2, rad, bx, 0.25, 12), mix(wood, TERRAIN.barkLit, 0.45), 0.7, { bark: 0.2 });
    if (r() < 0.6) {
      p.solid(blob(bx, by, rad * 0.6, rad * 0.5, bx, 0.2, 10), wood, 0.58, { bark: 0.2 });
      p.solid(blob(bx, by + 0.5, rad * 0.28, rad * 0.22, bx, 0.2, 8), TERRAIN.backDeep, 0.34);
    }
  }
  // Twist: seams that wind round the limb on a slant, so the grain is not a set of parallel rails.
  for (let i = 5; i < n - 5; i += 6) {
    const xa = top[i * 2] as number;
    const xb = top[(i + 2) * 2] as number;
    const ya = (top[i * 2 + 1] as number) + 9;
    const yb = (bot[(i + 2) * 2 + 1] as number) - 5;
    const light = i % 2 === 0;
    p.solid(
      ribbon(
        quad(xa, ya, lerp(xa, xb, 0.3), lerp(ya, yb, 0.6), xb, yb, 6),
        (t) => (light ? 4 : 2.6) * Math.sin(Math.PI * clamp(t, 0.06, 0.94)) + 0.5,
      ),
      light ? mix(wood, TERRAIN.barkLit, 0.25) : mix(wood, TERRAIN.barkDark, 0.6),
      light ? 0.61 : 0.5,
      { bark: 0.2 },
      0.7,
    );
  }
  // Side limbs: from the tip and from under the belly, thin, each ending in leaves.
  const limb = (x: number, y: number, ang: number, len: number, w0: number): void => {
    const ex = x + Math.cos(ang) * len;
    const ey = y + Math.sin(ang) * len;
    const line = wander(
      quad(x, y, x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + len * 0.12, ex, ey, 10),
      4,
      x + len,
      40,
    );
    p.solid(
      ribbon(line, (t) => w0 * (1 - t) ** 0.8 + 1.4),
      wood,
      0.56,
      { bark: 0.2 },
    );
    info.twigs.push({ x: ex, y: ey, angle: ang, lit: true });
    info.twigs.push({
      x: lerp(x, ex, 0.55),
      y: lerp(y, ey, 0.55) + len * 0.05,
      angle: ang + (r() < 0.5 ? -0.9 : 0.9),
      lit: true,
    });
  };
  const tipMidY = (ty0 + by0) / 2;
  limb(tipX + dir * 14, tipMidY, dir < 0 ? Math.PI + 0.35 : -0.35, range(r, 60, 90), 11);
  limb(tipX + dir * 10, tipMidY + 8, dir < 0 ? Math.PI - 0.7 : 0.7, range(r, 44, 70), 9);
  // A real second fork: a stout limb leaving the belly and forking again.
  {
    const fx = s.x + s.w * (anchoredRight ? 0.52 : 0.48);
    const fy = y1 + sag(clamp((fx - s.x) / s.w, 0, 1)) - 10;
    const ang = Math.PI / 2 + dir * 0.75;
    limb(fx, fy, ang, 120, 20);
    limb(fx + Math.cos(ang) * 66, fy + Math.sin(ang) * 66 + 8, ang + dir * 0.7, 70, 10);
  }
  for (const u of [0.24, 0.74]) {
    const lx = s.x + s.w * (anchoredRight ? 1 - u : u);
    limb(
      lx,
      y1 + sag(clamp((lx - s.x) / s.w, 0, 1)) - 6,
      Math.PI / 2 + dir * range(r, 0.3, 0.9),
      range(r, 40, 70),
      8,
    );
  }
  mossCap(p, s.x, x1, s.y, {
    seed: s.x + 4,
    read: TERRAIN.highRead,
    drapeL: anchoredRight ? range(r, 24, 44) : 0,
    drapeR: anchoredRight ? 0 : range(r, 24, 44),
    thick: 13,
    drip: 34,
    bare: 0.22,
  });
  // Moss saddles slumping over the shoulder of the limb.
  for (let i = 0; i < 4; i++) {
    const mx = lerp(s.x + 30, x1 - 30, (i + r()) / 4);
    const len = range(r, 24, 50);
    const line = wander(
      quad(mx, s.y + 6, mx + range(r, -8, 8), s.y + len * 0.5, mx + range(r, -10, 10), s.y + len, 8),
      3,
      mx,
      20,
    );
    const tone = mossTone(mx, s.y, s.x, 0);
    p.solid(
      ribbon(line, (t) => 20 * (1 - t) ** 0.6 + 2),
      tone.dark,
      0.76,
      { moss: 1 },
    );
    p.solid(
      ribbon(line, (t) => 11 * (1 - t) ** 0.8 + 1),
      tone.body,
      0.84,
      { moss: 1 },
    );
  }
  info.tops.push({ x0: s.x, x1, y: s.y, kind: 'ledge', freeL: anchoredRight, freeR: !anchoredRight });
  info.unders.push({
    x0: s.x + 8,
    x1: x1 - 8,
    y: (x) => y1 + sag((x - s.x) / s.w) - 3,
    kind: 'ledge',
    trail: 'longVines',
  });
}

/**
 * A ledge at the scene edge: a shelf of root-bound earth and stones cradled in the crook of two
 * limbs that reach in from the edge wall.
 */
function paintCrookShelf(p: Paint, s: SolidRect, anchoredRight: boolean, info: TerrainInfo): void {
  const x1 = s.x + s.w;
  const y1 = s.y + s.h;
  const r = rngFor(s.x, 52);
  const E = TERRAIN.earth;
  const wallX = anchoredRight ? x1 : s.x;
  const freeX = anchoredRight ? s.x : x1;
  const dir = anchoredRight ? -1 : 1;
  const sag = (u: number): number => {
    const a = anchoredRight ? 1 - u : u;
    return (
      14 +
      30 * Math.sin(Math.PI * clamp(a * 0.9 + 0.08, 0, 1)) ** 0.7 +
      wobble(u * s.w, s.x + 2, 38) * 9 -
      smoothstep(0.8, 1, a) * 26
    );
  };
  const wood = mix(TERRAIN.bark, TERRAIN.rootWood, 0.25);
  const limb = (line: number[], w: (t: number) => number, h: number): void => {
    p.tint(
      ribbon(line, (t) => w(t) + 8),
      TERRAIN.backDeep,
      0.4,
    );
    p.solid(ribbon(line, w), wood, h, { bark: 0.3 });
    p.solid(
      ribbon(line, (t) => w(t) * 0.34),
      mix(wood, TERRAIN.barkLit, 0.6),
      h + 0.08,
      { bark: 0.3 },
    );
  };
  // The far limb (behind the shelf) first.
  const backLimb = wander(
    cubic(
      wallX - dir * 60,
      y1 + 150,
      wallX + dir * 40,
      y1 + 120,
      wallX + dir * s.w * 0.5,
      y1 + 96,
      wallX + dir * s.w * 0.72,
      y1 + 28,
      18,
    ),
    6,
    s.x + 1,
    60,
  );
  limb(backLimb, (t) => 40 * (1 - t * 0.6) + 4, 0.46);
  // The earth it holds.
  const body = boxOutline(
    Math.min(wallX, freeX) - (anchoredRight ? 0 : 30),
    s.y,
    Math.max(wallX, freeX) + (anchoredRight ? 30 : 0),
    y1,
    s.x,
    { top: 1.5, side: 5, bottom: 4 },
    (u) => {
      const xx = Math.min(wallX, freeX) - (anchoredRight ? 0 : 30) + u * (s.w + 30);
      return sag(clamp((xx - s.x) / s.w, 0, 1));
    },
    7,
  );
  p.solid(body, E[0], 0.52);
  const lower: number[] = [];
  for (let x = s.x - 6; x <= x1 + 36; x += 8) lower.push(x, s.y + 30 + wobble(x, s.x, 50) * 7);
  for (let x = x1 + 36; x >= s.x - 6; x -= 8) lower.push(x, y1 + 120);
  p.tint(lower, E[2], 0.8);
  for (let i = 0; i < 9; i++) {
    const cx = lerp(s.x + 14, x1 - 10, (i + r()) / 9);
    const u = (cx - s.x) / s.w;
    const cy = s.y + 20 + r() * Math.max(8, s.h - 22 + sag(u) * 0.7);
    const size = range(r, 8, 20);
    const c = TERRAIN.stone[Math.floor(r() * TERRAIN.stone.length)] as number;
    p.tint(blob(cx - 1.5, cy + 2.5, size * 1.3 + 2, size * 0.8 + 2, cx, 0.3, 10), E[4], 0.5);
    p.solid(
      chaikin(blob(cx, cy, size * 1.3, size * 0.8, cx, 0.3, 8, range(r, -0.4, 0.4)), 1),
      mix(c, E[1], range(r, 0.1, 0.45)),
      range(r, 0.62, 0.72),
    );
  }
  for (let i = 0; i < 8; i++) {
    const cx = lerp(s.x + 12, x1 - 6, (i + r()) / 8);
    const u = (cx - s.x) / s.w;
    const len = (s.h - 8 + sag(u)) * range(r, 0.6, 1.05);
    const line = wander(
      quad(cx, s.y + 8, cx + range(r, -14, 14), s.y + len * 0.5, cx + range(r, -22, 22), s.y + 8 + len, 10),
      6,
      s.x + i,
      26,
    );
    const w0 = range(r, 4, 8);
    p.tint(
      ribbon(line, (t) => (w0 + 5) * (1 - t * 0.5) + 1),
      E[4],
      0.4,
    );
    p.solid(
      ribbon(line, (t) => w0 * (1 - t * 0.6) + 1),
      mix(TERRAIN.rootWood, E[0], r() * 0.4),
      0.65,
      { bark: 0.1 },
    );
  }
  // The near limb: up from the wall, under the belly, and curling round the free end.
  const endU = anchoredRight ? 0 : 1;
  const nearLimb = wander(
    cubic(
      wallX - dir * 50,
      y1 + 96,
      wallX + dir * s.w * 0.3,
      y1 + 108,
      freeX - dir * 30,
      y1 + sag(endU) + 54,
      freeX + dir * 8,
      y1 + sag(endU) - 4,
      22,
    ),
    5,
    s.x + 2,
    70,
  );
  limb(nearLimb, (t) => 46 * (1 - t * 0.72) + 5 + Math.max(0, Math.sin(t * 13)) * 3, 0.62);
  const tipX = nearLimb[nearLimb.length - 2] as number;
  const tipY = nearLimb[nearLimb.length - 1] as number;
  // It forks at the end: one finger hooks up beside the shelf (below the walk line), one reaches out.
  limb(
    quad(tipX, tipY, tipX + dir * 14, tipY - 20, tipX + dir * 9, Math.max(s.y + 14, tipY - 44), 8),
    (t) => 13 * (1 - t) + 3,
    0.6,
  );
  const out = quad(tipX, tipY, tipX + dir * 40, tipY + 4, tipX + dir * 76, tipY - 22, 8);
  limb(out, (t) => 12 * (1 - t) + 2, 0.58);
  info.twigs.push({ x: tipX + dir * 76, y: tipY - 22, angle: dir < 0 ? Math.PI + 0.4 : -0.4, lit: true });
  info.twigs.push({ x: tipX + dir * 44, y: tipY, angle: -Math.PI / 2 + dir * 0.6, lit: true });
  mossCap(p, s.x, x1, s.y, {
    seed: s.x + 4,
    read: TERRAIN.highRead,
    drapeL: anchoredRight ? range(r, 30, 60) : 0,
    drapeR: anchoredRight ? 0 : range(r, 30, 60),
    thick: 12,
    drip: 30,
    bare: 0.35,
  });
  info.tops.push({ x0: s.x, x1, y: s.y, kind: 'ledge', freeL: anchoredRight, freeR: !anchoredRight });
  info.unders.push({
    x0: s.x + 8,
    x1: x1 - 8,
    y: (x) => y1 + sag((x - s.x) / s.w) - 3,
    kind: 'ledge',
    trail: 'roots',
  });
}

// ---------------------------------------------------------------------------------------------
// Floating islands. Each kind has its own silhouette and its own things trailing underneath.

type FloatKind = 'stump' | 'boulder' | 'fungus' | 'rootball' | 'slab';
/** Left to right across the scene, so neighbours never match. */
const FLOAT_ORDER: readonly FloatKind[] = [
  'stump',
  'boulder',
  'fungus',
  'rootball',
  'slab',
  'boulder',
  'fungus',
];

function paintFloating(p: Paint, s: SolidRect, index: number, info: TerrainInfo): void {
  const x1 = s.x + s.w;
  const y1 = s.y + s.h;
  const r = rngFor(s.x, s.y);
  const kind = FLOAT_ORDER[index % FLOAT_ORDER.length] as FloatKind;
  const E = TERRAIN.earth;
  // The second island of a kind is a mirror of the first, with its own proportions and dressing.
  const second = FLOAT_ORDER.indexOf(kind) !== index % FLOAT_ORDER.length;
  const flip = second;
  let sag: (u: number) => number = () => 0;
  let trail: Under['trail'] = 'mixed';
  let bare = 0.2;

  if (kind === 'boulder') {
    // A great rounded stone held by roots that wrap right over it.
    const peak = second ? range(r, 0.62, 0.72) : range(r, 0.3, 0.42);
    const depth = second ? range(r, 60, 76) : range(r, 88, 108);
    sag = (u) => {
      const a = u < peak ? u / peak : (1 - u) / (1 - peak);
      return (
        -12 +
        depth * Math.sin((Math.PI / 2) * clamp(a, 0, 1)) ** 0.75 +
        Math.round(noise1(u * 6, s.x) * 2) * 5
      );
    };
    p.solid(
      boxOutline(s.x, s.y, x1, y1, s.x, { top: 1.5, side: 5, bottom: 4 }, sag, 7),
      TERRAIN.stone[2],
      0.52,
    );
    for (let i = 0; i < 11; i++) {
      const u = (i + range(r, 0.1, 0.9)) / 11;
      const cx = lerp(s.x + 16, x1 - 16, u);
      const cy = s.y + 16 + r() * (s.h - 20 + sag(u) * 0.8);
      const pts = chaikin(
        blob(cx, cy, range(r, 14, 30), range(r, 10, 20), s.x + i, 0.35, 6, range(r, -0.5, 0.5)),
        1,
      );
      const light = r() < 0.55;
      p.solid(pts, light ? TERRAIN.stone[r() < 0.5 ? 0 : 3] : TERRAIN.stone[2], light ? 0.6 : 0.45, {}, 0.7);
    }
    for (let i = 0; i < 4; i++) {
      const xa = lerp(s.x + 10, x1 - 10, (i + r()) / 4);
      const u = clamp((xa - s.x) / s.w + range(r, -0.3, 0.3), 0.08, 0.92);
      const xb = s.x + s.w * u;
      const yb = y1 + sag(u) + range(r, 4, 22);
      const line = wander(
        cubic(xa, s.y + 6, xa + range(r, -20, 20), s.y + 40, xb + range(r, -30, 30), yb - 40, xb, yb, 16),
        6,
        s.x + i,
        40,
      );
      const w0 = range(r, 9, 15);
      p.tint(
        ribbon(line, (t) => (w0 + 6) * (1 - t * 0.6) + 1),
        E[4],
        0.45,
      );
      p.solid(
        ribbon(line, (t) => w0 * (1 - t * 0.7) + 1.5),
        mix(TERRAIN.rootWood, TERRAIN.bark, range(r, 0.2, 0.6)),
        0.68,
        { bark: 0.15 },
      );
    }
    trail = 'roots';
    bare = 0.35;
  } else if (kind === 'stump') {
    // The top of a snapped trunk: bark sides, and underneath a torn mess of shards of every size.
    const shards: Array<{ c: number; w: number; len: number; lean: number }> = [];
    for (let c = range(r, 0.02, 0.1); c < 0.98; ) {
      const w = range(r, 0.04, 0.2);
      shards.push({ c: c + w / 2, w, len: range(r, 0.08, 1) ** 1.5 * 112 + 8, lean: range(r, -0.5, 0.5) });
      c += w * range(r, 0.55, 1.05);
    }
    sag = (u) => {
      let d = -4;
      for (const sh of shards) {
        const t = 1 - Math.abs((u - sh.c) / (sh.w / 2));
        if (t > 0) d = Math.max(d, sh.len * t ** 0.75);
      }
      return d * Math.sin(Math.PI * clamp(u, 0.03, 0.97)) ** 0.25;
    };
    const body = boxOutline(s.x - 3, s.y, x1 + 3, y1, s.x, { top: 1.5, side: 6, bottom: 1.5 }, sag, 3);
    p.solid(chaikin(body, 0), TERRAIN.bark, 0.54, { bark: 1 });
    barkDetail(p, s.x, s.y + 8, x1, y1 + 30, s.x + 5);
    // Torn heartwood showing on some shards, in strips.
    for (const sh of shards) {
      if (sh.len < 26 || r() < 0.35) continue;
      const cx = s.x + s.w * sh.c;
      const tip = y1 + sag(sh.c) - 5;
      const strips = 1 + Math.floor(r() * 2);
      for (let k = 0; k < strips; k++) {
        const ox = range(r, -0.25, 0.25) * sh.w * s.w;
        const sw = range(r, 3, 6);
        p.solid(
          ribbon(
            wander(
              [cx + ox, y1 - range(r, 4, 20), cx + ox * 0.6, (y1 + tip) / 2, cx + ox * 0.2, tip],
              2,
              cx + k,
              12,
            ),
            (t) => sw * (1 - t) + 0.8,
          ),
          mix(TERRAIN.barkLit, 0x8f8266, range(r, 0.2, 0.5)),
          0.62,
          { bark: 0.6 },
        );
      }
    }
    // Bark peeling away at the flanks.
    for (const [px, d] of [
      [s.x - 2, -1],
      [x1 + 2, 1],
    ] as const) {
      for (let k = 0; k < 2; k++) {
        const sy = s.y + range(r, 20, 40);
        const len = range(r, 30, 64);
        const line = quad(
          px,
          sy,
          px + d * range(r, 6, 14),
          sy + len * 0.6,
          px + d * range(r, -2, 10),
          sy + len,
          8,
        );
        p.solid(
          ribbon(line, (t) => 7 * (1 - t) ** 0.7 + 1),
          TERRAIN.barkDark,
          0.5,
          { bark: 0.8 },
        );
      }
    }
    trail = 'few';
    bare = 0.25;
  } else if (kind === 'fungus') {
    // Shelf fungi (chicken-of-the-woods): soft overlapping lobes with wavy rims, on a rotten limb.
    const tones = second ? TERRAIN.fungusRose : TERRAIN.fungus;
    interface Lobe {
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      tilt: number;
      top: boolean;
      seed: number;
    }
    const lobes: Lobe[] = [];
    // The walkway: three or four broad lobes side by side, their crowns levelled by long use.
    const nTop = second ? 3 : 4;
    let lx = s.x - 6;
    for (let i = 0; i < nTop; i++) {
      const wLobe = ((s.w + 12) / nTop) * range(r, 0.95, 1.3);
      const rx = wLobe * 0.62;
      lobes.push({
        cx: lx + wLobe * 0.5,
        cy: s.y + range(r, 20, 30),
        rx,
        ry: range(r, 24, 34),
        tilt: range(r, -0.08, 0.08),
        top: true,
        seed: s.x + i,
      });
      lx += (s.w + 12) / nTop;
    }
    // Lobes cascading below, smaller as they go, drifting to one side.
    const drift = (flip ? -1 : 1) * range(r, 0.1, 0.3);
    const nLow = second ? 6 : 5;
    for (let i = 0; i < nLow; i++) {
      const k = i / (nLow - 1);
      const rx = lerp(72, 30, k) * range(r, 0.8, 1.2);
      lobes.push({
        cx: lerp(
          s.x + 40,
          x1 - 40,
          clamp(0.5 + drift * (k * 2) + range(r, -0.34, 0.34) * (1 - k * 0.5), 0, 1),
        ),
        cy: s.y + 46 + k * (second ? 78 : 62) + range(r, -6, 6),
        rx,
        ry: rx * range(r, 0.3, 0.42),
        tilt: range(r, -0.25, 0.25),
        top: false,
        seed: s.x + 20 + i,
      });
    }
    const outlineOf = (l: Lobe, scale: number): number[] => {
      const pts: number[] = [];
      const N = 26;
      const cs = Math.cos(l.tilt);
      const sn = Math.sin(l.tilt);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        // Wavy, ruffled rim; fuller underneath than on top.
        const ruffle = 1 + 0.07 * Math.sin(a * 5 + l.seed) + 0.04 * Math.sin(a * 11 + l.seed * 1.7);
        const px = Math.cos(a) * l.rx * ruffle * scale;
        const py = Math.sin(a) * l.ry * ruffle * scale * (Math.sin(a) > 0 ? 1.15 : 0.85);
        const x = l.cx + px * cs - py * sn;
        const y = l.cy - l.ry * 0.25 * (1 - scale) + px * sn + py * cs;
        pts.push(x, l.top ? Math.max(y, s.y + 2 + wobble(x, s.x, 50) * 1.2) : y);
      }
      return pts;
    };
    sag = (u) => {
      const x = s.x + u * s.w;
      let y = y1 - 8;
      for (const l of lobes) {
        const q = (x - l.cx) / l.rx;
        if (Math.abs(q) < 1) y = Math.max(y, l.cy + l.ry * 1.1 * Math.sqrt(1 - q * q));
      }
      return y - y1;
    };
    // The rotten limb they grow on shows through between lobes.
    const host: number[] = [];
    for (let x = s.x + 14; x <= x1 - 14; x += 10) host.push(x, s.y + 30 + wobble(x, s.x + 3, 40) * 4);
    for (let x = x1 - 14; x >= s.x + 14; x -= 10) {
      const u = (x - s.x) / s.w;
      host.push(x, y1 + Math.max(4, sag(u) * 0.6) * Math.sin(Math.PI * clamp(u, 0.05, 0.95)) ** 0.5);
    }
    p.solid(chaikin(host, 2), TERRAIN.barkDark, 0.46, { bark: 0.6 });
    // Lowest first, the walkway lobes last.
    const ordered = lobes.slice().sort((a, b) => Number(a.top) - Number(b.top) || b.cy - a.cy);
    for (const l of ordered) {
      const base = outlineOf(l, 1);
      p.tint(
        base.map((v, i) => (i % 2 ? v + 6 : v)),
        TERRAIN.backDeep,
        0.45,
      );
      // Velvet rim, then flesh; the zoning inside is broken arcs of slightly different flesh,
      // never closed rings.
      p.solid(chaikin(base, 1), tones[3], 0.64 + (l.top ? 0.02 : 0));
      p.solid(chaikin(outlineOf(l, 0.9), 1), mix(tones[0], tones[1], range(r, 0.1, 0.5)), 0.6);
      p.solid(chaikin(outlineOf(l, 0.5), 1), mix(tones[1], tones[0], range(r, 0.2, 0.6)), 0.57, {}, 0.6);
      for (const sc of [0.78, 0.64, 0.4, 0.26]) {
        const ring = outlineOf(l, sc + range(r, -0.04, 0.04));
        const nR = ring.length / 2;
        let i = Math.floor(r() * nR);
        const arcs = 2 + Math.floor(r() * 2);
        for (let k = 0; k < arcs; k++) {
          const len = 3 + Math.floor(r() * 6);
          const arc: number[] = [];
          for (let j = 0; j <= len; j++)
            arc.push(ring[((i + j) % nR) * 2] as number, ring[((i + j) % nR) * 2 + 1] as number);
          const wd = range(r, 2.5, 5.5) * sc;
          p.solid(
            ribbon(arc, (t) => wd * Math.sin(Math.PI * clamp(t, 0.04, 0.96)) + 0.5),
            mix(tones[1], r() < 0.5 ? tones[2] : tones[0], range(r, 0.3, 0.6)),
            0.55 + range(r, -0.03, 0.04),
            {},
            0.7,
          );
          i += len + 2 + Math.floor(r() * 6);
        }
      }
    }
    trail = 'few';
    bare = 0.55;
  } else if (kind === 'rootball') {
    // A ball of earth torn out with its roots, which trail far below.
    const depth = range(r, 84, 110);
    const peak = range(r, 0.42, 0.58);
    sag = (u) => {
      const a = u < peak ? u / peak : (1 - u) / (1 - peak);
      return -14 + depth * clamp(a, 0, 1) ** 0.5 + wobble(u * 300, s.x, 40) * 5;
    };
    p.solid(boxOutline(s.x, s.y, x1, y1, s.x, { top: 1.5, side: 4, bottom: 4 }, sag, 7), E[0], 0.52);
    const lower: number[] = [];
    for (let x = s.x - 6; x <= x1 + 6; x += 8) lower.push(x, s.y + 30 + wobble(x, s.x, 50) * 7);
    for (let x = x1 + 6; x >= s.x - 6; x -= 8) lower.push(x, y1 + depth + 20);
    p.tint(lower, E[2], 0.8);
    for (let i = 0; i < 14; i++) {
      const cx = lerp(s.x + 12, x1 - 12, (i + r()) / 14);
      const u = (cx - s.x) / s.w;
      const len = (s.h - 6 + sag(u)) * range(r, 0.6, 1.02);
      const line = wander(
        quad(
          cx,
          s.y + 8,
          cx + range(r, -16, 16),
          s.y + len * 0.5,
          lerp(cx, s.x + s.w * peak, 0.35) + range(r, -10, 10),
          s.y + 8 + len,
          10,
        ),
        6,
        s.x + i,
        26,
      );
      const w0 = range(r, 5, 10);
      p.tint(
        ribbon(line, (t) => (w0 + 5) * (1 - t * 0.5) + 1),
        E[4],
        0.45,
      );
      p.solid(
        ribbon(line, (t) => w0 * (1 - t * 0.6) + 1.2),
        mix(TERRAIN.rootWood, E[0], r() * 0.4),
        0.66,
        { bark: 0.1 },
      );
    }
    for (let i = 0; i < 6; i++) {
      const cx = lerp(s.x + 20, x1 - 20, r());
      const u = (cx - s.x) / s.w;
      const cy = s.y + 18 + r() * Math.max(6, s.h - 20 + sag(u) * 0.6);
      p.solid(
        chaikin(blob(cx, cy, range(r, 6, 13), range(r, 5, 9), i + s.x, 0.3, 8), 1),
        TERRAIN.stone[1],
        0.68,
      );
    }
    trail = 'longRoots';
    bare = 0.3;
  } else {
    // A broken stone slab, thin and angular, slung in loops of vine.
    const steps = Array.from({ length: 5 }, () => range(r, -6, 16));
    const tilt = range(r, -10, 10);
    sag = (u) =>
      (steps[clamp(Math.floor(u * steps.length), 0, steps.length - 1)] as number) + (u - 0.5) * tilt;
    const body = boxOutline(s.x - 4, s.y, x1 + 4, y1, s.x, { top: 1.2, side: 2.5, bottom: 1.5 }, sag, 5);
    p.solid(chaikin(body, 0), TERRAIN.stone[1], 0.54);
    for (let i = 0; i < 6; i++) {
      const cx = lerp(s.x + 20, x1 - 20, (i + r()) / 6);
      const pts = blob(
        cx,
        s.y + range(r, 20, 44),
        range(r, 18, 34),
        range(r, 8, 14),
        s.x + i,
        0.3,
        5,
        range(r, -0.2, 0.2),
      );
      p.solid(pts, r() < 0.5 ? TERRAIN.stone[0] : TERRAIN.stone[2], r() < 0.5 ? 0.6 : 0.47, {}, 0.7);
    }
    for (let i = 0; i < 3; i++) {
      const cx = lerp(s.x + 40, x1 - 40, (i + r()) / 3);
      const line = wander(
        [cx, s.y + 10, cx + range(r, -8, 8), s.y + 34, cx + range(r, -16, 16), y1 + 10],
        3,
        s.x + i,
        14,
      );
      p.solid(
        ribbon(line, (t) => 2.6 * (1 - t) + 0.7),
        E[4],
        0.3,
      );
    }
    // Vine slings: down one side, under, up the other.
    for (let i = 0; i < 3; i++) {
      const xa = lerp(s.x - 2, s.x + s.w * 0.4, r());
      const xb = xa + range(r, 70, 130);
      const drop = range(r, 22, 54);
      const line = cubic(
        xa,
        s.y + 6,
        xa - 6,
        y1 + drop,
        Math.min(xb, x1 + 2) + 6,
        y1 + drop,
        Math.min(xb, x1 + 2),
        s.y + 6,
        18,
      );
      p.solid(
        ribbon(line, () => 4.4),
        TERRAIN.mossDark,
        0.66,
        { moss: 0.5 },
      );
      p.solid(
        ribbon(line, () => 1.8),
        TERRAIN.moss,
        0.72,
        { moss: 0.6 },
      );
    }
    trail = 'longVines';
    bare = 0.3;
  }

  // What holds it up: a bundle of old vines coming down out of the canopy, lashed round each end.
  // Dark and thin (the back plane), so they read as rigging, not as something to climb.
  {
    const vr = rngFor(s.x, 61);
    for (const [ex, lean] of [
      [s.x + range(vr, 14, 34), range(vr, -60, 20)],
      [x1 - range(vr, 14, 34), range(vr, -20, 60)],
    ] as const) {
      const n = 2 + Math.floor(vr() * 2);
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * range(vr, 5, 9);
        // Each strand takes its own slack curve up into the canopy and they cross each other.
        const bow = range(vr, -70, 70);
        const line = wander(
          cubic(
            ex + ox,
            s.y + 26,
            ex + ox + bow,
            s.y - 220,
            ex + lean * 0.6 - bow * 0.6,
            s.y - 520,
            ex + lean * 1.8 + ox * 6,
            -OUT,
            26,
          ),
          16,
          s.x + ex + i,
          120,
        );
        const w0 = range(vr, 3, 6.5);
        p.solid(
          ribbon(line, () => w0),
          i % 2 ? TERRAIN.backDeep : TERRAIN.back,
          0.27,
          { bark: 0.4 },
        );
      }
      // The lashing: a few turns round the rim.
      for (let k = 0; k < 3; k++) {
        const ly = s.y + 12 + k * 7;
        p.solid(
          ribbon(quad(ex - 13, ly, ex, ly + 5, ex + 13, ly - 1, 6), () => 4.2),
          mix(TERRAIN.back, TERRAIN.rootWood, 0.4),
          0.6,
          { bark: 0.3 },
        );
      }
    }
  }
  // Belly shadow: the underside falls away from the light.
  if (kind !== 'fungus') {
    const belly: number[] = [];
    for (let x = s.x - 6; x <= x1 + 6; x += 8) belly.push(x, s.y + s.h * 0.72 + sag((x - s.x) / s.w) * 0.35);
    for (let x = x1 + 6; x >= s.x - 6; x -= 8) belly.push(x, y1 + 140);
    p.tint(belly, TERRAIN.backDeep, 0.32);
  }
  mossCap(p, s.x, x1, s.y, {
    seed: s.x + 2,
    read: TERRAIN.highRead,
    drapeL: range(r, 22, 52),
    drapeR: range(r, 22, 52),
    thick: range(r, 9, 13),
    drip: range(r, 18, 30),
    bare,
  });
  info.tops.push({ x0: s.x, x1, y: s.y, kind: 'floating', freeL: true, freeR: true });
  info.unders.push({
    x0: s.x + 10,
    x1: x1 - 10,
    y: (x) => y1 + sag((x - s.x) / s.w) - 3,
    kind: 'floating',
    trail,
  });
}

// ---------------------------------------------------------------------------------------------
// The root: a mound of root-bound earth with one fat root arching over it.

function paintRootMound(p: Paint, s: SolidRect, info: TerrainInfo): void {
  const x1 = s.x + s.w;
  const y1 = s.y + s.h;
  const r = rngFor(s.x, 13);
  const E = TERRAIN.earth;
  const wood = mix(TERRAIN.bark, TERRAIN.rootWood, 0.45);
  const strand = (line: number[], w: (t: number) => number, h: number, light: number): void => {
    p.tint(
      ribbon(line, (t) => w(t) + 8),
      E[4],
      0.5,
    );
    p.solid(ribbon(line, w), mix(wood, TERRAIN.barkDark, 1 - light), h, { bark: 0.12 });
    p.solid(
      ribbon(
        line.map((v, i) => (i % 2 ? v - 2 : v)),
        (t) => w(t) * 0.34,
      ),
      mix(wood, TERRAIN.barkLit, 0.35 + light * 0.4),
      h + 0.08,
      { bark: 0.12 },
    );
  };
  // Behind it, in the back plane: the same root running on into the ground both ways, so the
  // silhouette is a root heaving out of the earth and not a block set on it.
  for (const [fromX, d] of [
    [s.x + 30, -1],
    [x1 - 30, 1],
  ] as const) {
    for (let i = 0; i < 2; i++) {
      const reach = range(r, 120, 180) - i * 50;
      const line = wander(
        cubic(
          fromX,
          s.y + 26 + i * 22,
          fromX + d * reach * 0.5,
          s.y + 20 + i * 30,
          fromX + d * reach * 0.8,
          y1 - 30,
          fromX + d * reach,
          y1 + 14,
          14,
        ),
        5,
        fromX + i,
        50,
      );
      const w0 = 46 - i * 14;
      p.solid(
        ribbon(line, (t) => w0 * (1 - t * 0.6) + 4),
        i ? TERRAIN.backDeep : TERRAIN.back,
        0.29 - i * 0.04,
        { bark: 0.6 },
      );
      p.solid(
        ribbon(line, (t) => (w0 * (1 - t * 0.6) + 4) * 0.3),
        mix(TERRAIN.back, TERRAIN.bark, 0.35),
        0.34 - i * 0.04,
        { bark: 0.6 },
      );
    }
  }
  // Under the arch: packed earth on the right, a dark gap on the left where the root lifts clear.
  const gapX0 = s.x + 34;
  const gapX1 = s.x + s.w * 0.56;
  const fill = boxOutline(s.x + 14, s.y + 30, x1 - 12, y1 + 12, s.x, { top: 3, side: 4, bottom: 0 });
  p.solid(fill, E[3], 0.4);
  const gap: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    gap.push(lerp(gapX0, gapX1, u), y1 + 6 - Math.sin(Math.PI * u) ** 0.6 * (s.h - 44));
  }
  p.solid(chaikin(gap, 1), 0x07131f, 0.16);
  // Rootlets hanging in the gap, and stones wedged at the packed end.
  for (let i = 0; i < 4; i++) {
    const gx = lerp(gapX0 + 10, gapX1 - 10, (i + r()) / 4);
    p.solid(
      ribbon(
        wander(
          [gx, s.y + 40, gx + range(r, -5, 5), s.y + 58, gx + range(r, -8, 8), s.y + range(r, 66, 84)],
          2,
          gx,
          12,
        ),
        (t) => 3 * (1 - t) + 0.6,
      ),
      mix(wood, TERRAIN.backDeep, 0.5),
      0.3,
    );
  }
  for (let i = 0; i < 4; i++) {
    const cx = lerp(gapX1 + 12, x1 - 22, r());
    const cy = lerp(s.y + 60, y1 - 2, r());
    const size = range(r, 7, 13);
    p.solid(
      chaikin(blob(cx, cy, size * 1.3, size * 0.85, cx, 0.3, 8), 1),
      mix(TERRAIN.stone[i % 4] as number, E[2], 0.4),
      0.6,
    );
  }
  // The great root. Its upper edge is the walk line; everything else about it is uneven: girth
  // swells at two knuckles, the underside rises over the gap and sags at the packed end.
  const girth = (u: number): number =>
    40 +
    16 * Math.exp(-(((u - 0.14) / 0.12) ** 2)) +
    20 * Math.exp(-(((u - 0.82) / 0.15) ** 2)) -
    9 * Math.exp(-(((u - 0.42) / 0.16) ** 2)) +
    wobble(u * 300, s.x + 4, 34) * 3;
  const top: number[] = [];
  const bot: number[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // Outside the box it dives into the ground on a tight curve; over the box the crest is level.
    const x = lerp(s.x - 34, x1 + 38, t);
    const u = (x - s.x) / s.w;
    const fall =
      u < 0.05 ? smoothstep(0.05, -0.17, u) ** 1.6 : u > 0.96 ? smoothstep(0.96, 1.2, u) ** 1.6 : 0;
    const ridge = Math.max(0, wobble(x, s.x + 8, 13) - 0.45) * 4.5;
    const yt = s.y + 2 + wobble(x, s.x + 9, 50) * 1.1 - (fall > 0 ? 0 : ridge) + fall * (s.h + 14);
    top.push(x, yt);
    bot.push(x + (u < 0.5 ? 10 : -10) * fall, yt + girth(clamp(u, 0, 1)) * (1 - fall * 0.35));
  }
  const body = top.slice();
  for (let i = bot.length - 2; i >= 0; i -= 2) body.push(bot[i] as number, bot[i + 1] as number);
  p.tint(
    body.map((v, i) => (i % 2 ? v + 7 : v)),
    E[4],
    0.55,
  );
  p.solid(chaikin(body, 1), wood, 0.68, { bark: 0.12 });
  const at = (t: number, f: number): [number, number] => {
    const i = clamp(Math.round(t * N), 0, N) * 2;
    return [top[i] as number, lerp(top[i + 1] as number, bot[i + 1] as number, f)];
  };
  // Twist: long seams that spiral round the root, each drifting from crest to belly along its run.
  for (let k = 0; k < 6; k++) {
    const t0 = -0.1 + k * 0.19 + range(r, -0.03, 0.03);
    const line: number[] = [];
    for (let j = 0; j <= 10; j++) {
      const q = j / 10;
      const [px, py] = at(clamp(t0 + q * 0.42, 0.02, 0.98), 0.12 + q * 0.8);
      line.push(px, py + wobble(px, s.x + k, 22) * 1.6);
    }
    const light = k % 2 === 0;
    p.solid(
      ribbon(line, (t) => (light ? 6.5 : 3.4) * Math.sin(Math.PI * clamp(t, 0.05, 0.95)) ** 0.7 + 0.6),
      light ? mix(wood, TERRAIN.barkLit, range(r, 0.4, 0.7)) : TERRAIN.barkDark,
      light ? 0.76 : 0.5,
      { bark: 0.12 },
    );
  }
  // Knuckles and burls: at the two swellings and under the belly.
  for (const [t, f, rad] of [
    [0.2, 0.55, 17],
    [0.78, 0.6, 21],
    [0.88, 0.25, 12],
    [0.5, 0.92, 11],
    [0.33, 0.85, 9],
    [0.66, 0.95, 13],
  ] as const) {
    const [bx, by] = at(t, f);
    p.tint(blob(bx, by + 4, rad * 1.2 + 3, rad + 3, bx, 0.25, 10), E[4], 0.45);
    p.solid(
      blob(bx, by, rad * 1.2, rad, bx, 0.3, 11, range(r, -0.4, 0.4)),
      mix(wood, TERRAIN.barkDark, range(r, 0, 0.4)),
      0.74,
      { bark: 0.12 },
    );
    p.solid(
      blob(bx + rad * 0.2, by - rad * 0.3, rad * 0.55, rad * 0.4, bx + 1, 0.3, 8),
      mix(wood, TERRAIN.barkLit, 0.6),
      0.82,
      { bark: 0.12 },
    );
    if (rad > 15) {
      p.solid(blob(bx - 1, by + 2, rad * 0.34, rad * 0.28, bx, 0.2, 8), TERRAIN.backDeep, 0.36);
    }
  }
  // Lesser roots braided over it: each climbs the face, crosses the crest line just below the
  // walk surface, and dives into the earth on the far side.
  const braid = (xa: number, xb: number, hump: number, w0: number, sd: number, light: number): void => {
    const line = wander(
      cubic(xa, y1 + 14, lerp(xa, xb, 0.2), s.y + hump, lerp(xa, xb, 0.75), s.y + hump + 8, xb, y1 + 14, 20),
      4,
      sd,
      36,
    ).map((v, i) => (i % 2 ? Math.max(v, s.y + 9) : v));
    strand(line, (t) => w0 * (0.7 + 0.5 * Math.sin(Math.PI * t)) * (1 - 0.25 * t), 0.78, light);
  };
  braid(s.x - 58, s.x + s.w * 0.62, -18, 15, s.x + 31, 0.9);
  braid(s.x + s.w * 0.3, x1 + 66, -6, 18, s.x + 32, 0.7);
  braid(s.x + s.w * 0.5, x1 + 26, 24, 10, s.x + 33, 0.5);
  // Feeders running out along the ground.
  for (const [fx, d] of [
    [s.x - 40, -1],
    [x1 + 44, 1],
  ] as const) {
    const feeder = wander(
      quad(fx, y1 - 2, fx + d * 40, y1 - 9, fx + d * range(r, 70, 100), y1 + 8, 10),
      3,
      fx,
      30,
    );
    strand(
      feeder.map((v, i) => (i % 2 ? Math.max(v, y1 - 7) : v)),
      (t) => 12 * (1 - t) + 2,
      0.62,
      0.5,
    );
  }
  mossCap(p, s.x + 10, x1 - 10, s.y, { seed: s.x + 6, thick: 7, drip: 10, bare: 0.45 });
  // Moss saddles slumped over the front of the root in two places.
  for (const t of [0.3, 0.68]) {
    const [mx, my] = at(t + range(r, -0.04, 0.04), 0);
    const len = range(r, 26, 40);
    const line = wander(
      quad(mx, my + 3, mx + range(r, -6, 6), my + len * 0.5, mx + range(r, -8, 8), my + len, 8),
      3,
      mx,
      16,
    );
    const tone = mossTone(mx, s.y, s.x, 0);
    p.solid(
      ribbon(line, (q) => 26 * (1 - q) ** 0.7 + 3),
      mix(tone.dark, TERRAIN.bark, 0.2),
      0.8,
      { moss: 1 },
    );
    p.solid(
      ribbon(line, (q) => 14 * (1 - q) ** 0.9 + 1.5),
      tone.dark,
      0.86,
      { moss: 1 },
    );
  }
  info.tops.push({ x0: s.x, x1, y: s.y, kind: 'root', freeL: true, freeR: true });
  info.keepClear.push([s.x - 80, x1 + 80]);
  info.lee.push(
    { x: s.x - 44, y: y1, size: 52 },
    { x: x1 + 52, y: y1, size: 64 },
    { x: x1 + 96, y: y1, size: 40 },
  );
}

// ---------------------------------------------------------------------------------------------
// One-way boughs, each growing from a slender back-plane sapling.

/** Which side of its bough the sapling stands. */
function saplingSide(_x: number, _w: number, _scene: Scene): -1 | 1 {
  return 1;
}

function paintSapling(
  p: Paint,
  x: number,
  y: number,
  w: number,
  groundY: (x: number) => number,
  scene: Scene,
  info: TerrainInfo,
): void {
  const side = saplingSide(x, w, scene);
  const r = rngFor(x, 91);
  const bx = side > 0 ? x + w + 34 : x - 34;
  const gy = groundY(bx) + 12;
  const topY = y - range(r, 420, 520);
  // A young tree that has grown toward the light: it bows one way, then back, and forks.
  const bow = range(r, 50, 90) * (r() < 0.5 ? -1 : 1);
  const line = wander(
    cubic(bx + 14, gy, bx - bow * 0.5, lerp(gy, y, 0.7), bx + bow * 0.25, y - 20, bx + bow, topY, 30),
    14,
    x,
    150,
  );
  // Pin it to the bough so the collar still meets it.
  const nL = line.length / 2;
  let at = 0;
  for (let i = 0; i < nL; i++)
    if (Math.abs((line[i * 2 + 1] as number) - (y + 12)) < Math.abs((line[at * 2 + 1] as number) - (y + 12)))
      at = i;
  const shift = bx - (line[at * 2] as number);
  for (let i = 0; i < nL; i++)
    line[i * 2] = (line[i * 2] as number) + shift * Math.exp(-(((i - at) / 7) ** 2));
  const shape = (t: number): number =>
    52 * (1 - t) ** 0.9 + 5 + smoothstep(0.12, 0, t) * 34 + Math.max(0, Math.sin(t * 23 + x)) * 2.5;
  const trunkLine = line.slice(0, Math.floor(nL * 0.78) * 2);
  const stem = (pts: number[], wd: (t: number) => number, h: number): void => {
    p.solid(ribbon(pts, wd), TERRAIN.backDeep, h, { bark: 0.7 });
    p.solid(
      ribbon(pts, (t) => wd(t) * 0.3),
      mix(TERRAIN.backDeep, TERRAIN.bark, 0.45),
      h + 0.05,
      { bark: 0.7 },
    );
  };
  stem(trunkLine, (t) => shape(t * 0.78), 0.26);
  // Root flare: two toes gripping the ground.
  for (const d of [-1, 1]) {
    stem(
      quad(bx + 14, gy - 40, bx + 14 + d * 22, gy - 12, bx + 14 + d * range(r, 44, 70), gy + 6, 8),
      (t) => 22 * (1 - t) + 4,
      0.25,
    );
  }
  // The fork, and limbs at uneven heights: long low ones that sag, short high ones that reach.
  const limb = (sx: number, sy: number, ang: number, len: number, w0: number, lvl: number): void => {
    const ex = sx + Math.cos(ang) * len;
    const ey = sy + Math.sin(ang) * len;
    const droop = len * range(r, -0.12, 0.22);
    const pts = wander(
      quad(sx, sy, lerp(sx, ex, 0.5), lerp(sy, ey, 0.5) + droop, ex, ey, 12),
      len * 0.04,
      sx + len,
      50,
    );
    stem(pts, (u) => w0 * (1 - u) ** 0.85 + 1.4, 0.25);
    info.twigs.push({ x: ex, y: ey, angle: ang });
    info.twigs.push({ x: pts[12] as number, y: pts[13] as number, angle: ang + (r() < 0.5 ? -0.8 : 0.8) });
    if (lvl < 1 && len > 70) {
      limb(
        pts[14] as number,
        pts[15] as number,
        ang + (r() < 0.5 ? -1 : 1) * range(r, 0.5, 0.9),
        len * range(r, 0.4, 0.6),
        w0 * 0.5,
        lvl + 1,
      );
    }
  };
  const fk = trunkLine.length - 2;
  const fx = trunkLine[fk] as number;
  const fy = trunkLine[fk + 1] as number;
  const fw = shape(0.78);
  limb(fx, fy, -Math.PI / 2 - range(r, 0.25, 0.5), range(r, 110, 170), fw * 0.85, 0);
  limb(fx, fy, -Math.PI / 2 + range(r, 0.3, 0.6), range(r, 90, 150), fw * 0.7, 0);
  let t = range(r, 0.34, 0.42);
  let d = r() < 0.5 ? -1 : 1;
  while (t < 0.74) {
    const k = Math.floor(t * (nL - 1)) * 2;
    const sx = line[k] as number;
    const sy = line[k + 1] as number;
    // Keep limbs off the walk line of the bough itself.
    if (Math.abs(sy - y) > 50 || d === side) {
      limb(
        sx,
        sy,
        d < 0 ? Math.PI + range(r, 0.15, 0.6) : -range(r, 0.15, 0.6),
        range(r, 60, 150) * (1.1 - t * 0.5),
        shape(t) * range(r, 0.3, 0.5),
        0,
      );
    }
    t += range(r, 0.05, 0.17);
    if (r() < 0.7) d = -d;
  }
}

function paintBough(p: Paint, x: number, y: number, w: number, scene: Scene, info: TerrainInfo): void {
  const side = saplingSide(x, w, scene);
  const r = rngFor(x, 92);
  const rootX = side > 0 ? x + w + 34 : x - 34;
  const tipX = side > 0 ? x : x + w;
  // Upper edge is the walk line; the taper is all underneath.
  const n = 26;
  const top: number[] = [];
  const bot: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = lerp(rootX, tipX, t);
    const yy = y + 2 + wobble(px, x, 60) * 1.2 + smoothstep(0.92, 1, t) * 3;
    top.push(px, yy);
    bot.push(px, yy + lerp(24, 7, t ** 0.7) + wobble(px, x + 5, 30) * 1.5);
  }
  const pts = top.slice();
  for (let i = bot.length - 2; i >= 0; i -= 2) pts.push(bot[i] as number, bot[i + 1] as number);
  p.solid(chaikin(pts, 1), TERRAIN.rootWood, 0.6, { bark: 0.1 });
  const under: number[] = [];
  for (let i = 0; i < top.length; i += 2) {
    under.push(top[i] as number, lerp(top[i + 1] as number, bot[i + 1] as number, 0.72));
  }
  p.tint(
    ribbon(under, (t) => lerp(9, 3, t)),
    TERRAIN.barkDark,
    0.55,
  );
  // Collar where it leaves the sapling, and a couple of stub twigs below.
  p.solid(blob(rootX, y + 14, 20, 24, x, 0.2, 12), TERRAIN.back, 0.4, { bark: 0.5 });
  for (let i = 0; i < 2; i++) {
    const sx = lerp(x + 30, x + w - 30, r());
    const len = range(r, 24, 50);
    const d = r() < 0.5 ? -1 : 1;
    p.solid(
      ribbon(
        quad(sx, y + 12, sx + d * len * 0.5, y + 16 + len * 0.3, sx + d * len, y + 14 + len * 0.7, 6),
        (t) => 5 * (1 - t) + 1,
      ),
      TERRAIN.rootWood,
      0.56,
    );
  }
  mossCap(p, x, x + w, y, {
    seed: x + 7,
    read: TERRAIN.highRead,
    drapeL: side > 0 ? 14 : 0,
    drapeR: side > 0 ? 0 : 14,
    thick: 6,
    drip: 16,
    lift: 1.5,
  });
  info.tops.push({ x0: x, x1: x + w, y, kind: 'branch', freeL: side > 0, freeR: side < 0 });
  info.unders.push({
    x0: x + 8,
    x1: x + w - 8,
    y: (px) => y + lerp(24, 7, clamp(Math.abs(px - rootX) / Math.abs(tipX - rootX), 0, 1) ** 0.7),
    kind: 'branch',
  });
}
