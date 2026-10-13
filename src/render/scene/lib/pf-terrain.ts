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
  wander,
  wobble,
} from './pf-shape';

export const TERRAIN = {
  /** Earth, from topsoil down through the strata (albedo before lighting). */
  earth: [0x1f4b56, 0x1a3f52, 0x17344f, 0x142a49, 0x112141] as const,
  strataDepth: [40, 104, 186, 290] as const,
  stone: [0x4a7884, 0x3a6474, 0x2f5468, 0x55808a] as const,
  rootWood: 0x3a5a56,
  bark: 0x1f3d46,
  barkDark: 0x142a34,
  barkLit: 0x3a5c58,
  /** Things behind the walk plane (stilt roots, saplings): dark, flat, cool. */
  back: 0x143440,
  backDeep: 0x0e2632,
  moss: 0x347238,
  mossDark: 0x184a34,
  mossLit: 0x5f9a48,
  mossSun: 0xa9cf6c,
  /** Moss cap: how far it rises above the collision line and how thick it hangs. */
  mossLift: 2,
  mossMound: 4,
  mossThick: 11,
  mossDrip: 26,
  /** How far the water surface sits above the pool floor (the character wades waist-deep). */
  waterDepth: 38,
  /** How far the edge walls bulge into the scene at most. */
  edgeBulge: 12,
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
  /** Ends of back-plane limbs: leaf sprays grow here (dark, behind the walk plane). */
  twigs: Array<{ x: number; y: number; angle: number }>;
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
  // Back plane first: everything else overlaps it.
  for (const b of scene.oneWays) paintSapling(p, b.x, b.y, b.w, groundY, scene, info);
  for (const t of trunks) if (t.y + t.h < groundY(t.x + t.w / 2) - 40) paintStiltRoots(p, t, groundY);
  paintEdgeWalls(p, scene, info);
  paintGround(p, segs, scene, info);

  for (const s of scene.solids) {
    if (s.tag === 'trunk') paintTrunk(p, s, scene, info);
  }
  for (const s of scene.solids) {
    if (s.tag === 'ledge') paintLedge(p, s, scene, info);
    else if (s.tag === 'floating') paintFloating(p, s, info);
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
}

/** The lit moss lip on a walkable top from x0 to x1 at collision height y. */
function mossCap(p: Paint, x0: number, x1: number, y: number, o: MossOpts): void {
  const r = rngFor(o.seed, x0, y);
  const thick0 = o.thick ?? TERRAIN.mossThick;
  const dripMax = o.drip ?? TERRAIN.mossDrip;
  const lift0 = o.lift ?? TERRAIN.mossLift;
  const dull = o.dull ?? 0;
  const xa = x0 - (o.drapeL ? 5 : 0);
  const xb = x1 + (o.drapeR ? 5 : 0);
  // Hanging tufts at uneven spacing.
  const drips: Array<{ x: number; w: number; d: number }> = [];
  for (let x = xa + range(r, 6, 40); x < xb - 6; x += range(r, 16, 74)) {
    drips.push({ x, w: range(r, 4, 10), d: dripMax * range(r, 0.25, 1) ** 1.6 });
  }
  const lift = (x: number): number => {
    const mound = Math.max(0, wobble(x, o.seed + 3, 64)) ** 1.5 * TERRAIN.mossMound;
    return lift0 + mound + (wobble(x, o.seed + 9, 11) + 1) * 0.6;
  };
  const edgeFade = (x: number): number =>
    Math.min(o.drapeL ? 1 : smoothstep(xa, xa + 22, x), o.drapeR ? 1 : smoothstep(xb, xb - 22, x));
  const thick = (x: number): number => {
    let t = thick0 * (0.3 + 1.25 * ((wobble(x, o.seed + 21, 74) + 1) * 0.5) ** 1.4);
    for (const d of drips) {
      const u = (x - d.x) / d.w;
      if (u > -3 && u < 3) t += d.d * Math.exp(-u * u);
    }
    return 3 + t * edgeFade(x);
  };
  const S = 3;
  const top: number[] = [];
  const bot: number[] = [];
  const mid: number[] = [];
  const hi: number[] = [];
  for (let x = xa; x <= xb + 0.01; x += S) {
    const yt = y - lift(x) * (0.35 + 0.65 * edgeFade(x));
    const th = thick(x);
    top.push(x, yt);
    bot.push(x, y + th);
    mid.push(x, yt + Math.min(th + 2, 6 + (wobble(x, o.seed + 40, 30) + 1) * 2.4));
    hi.push(x, yt + 1.6 + (wobble(x, o.seed + 41, 19) + 1) * 0.9);
  }
  const strip = (a: number[], b: number[]): number[] => {
    const out = a.slice();
    for (let i = b.length - 2; i >= 0; i -= 2) out.push(b[i] as number, b[i + 1] as number);
    return out;
  };
  const dark = mix(TERRAIN.mossDark, 0x0c3440, dull);
  const body = mix(TERRAIN.moss, 0x10424a, dull);
  const lit = mix(TERRAIN.mossLit, 0x175250, dull);
  const mossy = { moss: 1 - dull * 0.65 };
  const rise = 1 - dull * 0.3;

  // Drapes down free sides, under the cap so the cap's shoulder covers their top.
  const drape = (x: number, dir: -1 | 1, len: number): void => {
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
      const pts = ribbon(line, (t) => w0 * (1 - t) ** 0.7 + 1.5);
      p.solid(pts, dark, 0.74, { moss: 1 });
      p.solid(
        ribbon(line, (t) => w0 * 0.5 * (1 - t) ** 0.9 + 0.6),
        body,
        0.82,
        { moss: 1 },
      );
    }
    p.solid(blob(x + dir * 1.5, y + 4, 8.5, 8, o.seed + dir * 31, 0.18, 12), body, 0.86, { moss: 1 });
  };
  if (o.drapeL) drape(x0, -1, o.drapeL);
  if (o.drapeR) drape(x1, 1, o.drapeR);

  p.solid(strip(top, bot), dark, 0.78 * rise, mossy);
  p.solid(strip(top, mid), body, 0.88 * rise, mossy);
  // Clumped highlights along the crest: brighter where the cap mounds up.
  let run: number[] = [];
  let runB: number[] = [];
  const flush = (): void => {
    if (run.length >= 8) p.solid(strip(run, runB), lit, 0.95 * rise, mossy);
    run = [];
    runB = [];
  };
  for (let i = 0; i < top.length; i += 2) {
    const x = top[i] as number;
    if (wobble(x, o.seed + 55, 46) > -0.25 - (1 - dull) * 0.2) {
      run.push(x, top[i + 1] as number);
      runB.push(x, hi[i + 1] as number);
    } else flush();
  }
  flush();
  // Puffs: little cushions that break the stripe.
  for (let x = xa + range(r, 4, 20); x < xb - 4; x += range(r, 9, 34)) {
    const th = thick(x);
    const py = y - lift(x) * 0.5 + range(r, 2, Math.max(3, th * 0.6));
    const rad = range(r, 3, 7.5);
    p.bump(blob(x, py, rad * 1.3, rad, o.seed + x, 0.2, 9), 0.94, { moss: 1, alpha: 0.6 });
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
        const lip = smoothstep(hi + 34, hi + 6, y) * 2.5;
        const toe = smoothstep(lo - 26, lo - 2, y) * 5;
        outline.push(s.x1 + wobble(y, seed + i * 13, 42) * 3.5 + outward * (lip + toe - 1), y);
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
      lift: s.pool ? 1 : TERRAIN.mossLift,
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
  const knots = Math.round(((y1 - y0) * w) / 60000 + r());
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

function paintStiltRoots(p: Paint, t: SolidRect, groundY: (x: number) => number): void {
  const yb = t.y + t.h;
  const r = rngFor(t.x, 77);
  // Arching roots: each leaves the base sideways and drops to the ground like a rib. Outer pair
  // fat, inner pair thin and darker (further back).
  const roots = [
    { u: 0.14, out: -range(r, 92, 128), w: range(r, 40, 50), deep: false },
    { u: 0.86, out: range(r, 92, 128), w: range(r, 40, 50), deep: false },
    { u: 0.36, out: -range(r, 20, 44), w: range(r, 24, 30), deep: true },
    { u: 0.66, out: range(r, 20, 44), w: range(r, 24, 30), deep: true },
  ];
  // Deep ones first.
  roots.sort((a, b) => Number(b.deep) - Number(a.deep));
  roots.forEach((root, i) => {
    const from = t.x + t.w * root.u;
    const to = root.out < 0 ? t.x + root.out : t.x + t.w + root.out;
    const sgn = root.out < 0 ? -1 : 1;
    const gy = groundY(to) + 12;
    const line = wander(
      cubic(
        from,
        yb - 36,
        lerp(from, to, 0.7),
        yb - range(r, 0, 16),
        to - sgn * range(r, 0, 10),
        lerp(yb, gy, 0.3),
        to + sgn * range(r, 6, 18),
        gy,
        18,
      ),
      root.deep ? 7 : 5,
      t.x + i,
      60,
    );
    const shape = (u: number): number =>
      root.w * (1 - 0.34 * Math.sin(Math.PI * u ** 0.8)) +
      smoothstep(0.78, 1, u) * 22 +
      smoothstep(0.25, 0, u) * 16;
    const tone = root.deep ? TERRAIN.backDeep : TERRAIN.back;
    const h = root.deep ? 0.2 : 0.28;
    p.solid(ribbon(line, shape), tone, h, { bark: 0.6 });
    p.solid(
      ribbon(line, (u) => shape(u) * 0.34),
      mix(tone, TERRAIN.bark, 0.3),
      h + 0.06,
      { bark: 0.6 },
    );
    // A rootlet splitting off toward the ground.
    const k = Math.floor(range(r, 0.45, 0.65) * 18) * 2;
    const sx = line[k] as number;
    const sy = line[k + 1] as number;
    const ex = sx - sgn * range(r, 14, 44);
    const egy = groundY(ex) + 10;
    p.solid(
      ribbon(
        wander(quad(sx, sy, lerp(sx, ex, 0.2), lerp(sy, egy, 0.6), ex, egy, 10), 4, t.x + i + 9, 40),
        (u) => root.w * 0.3 * (1 - u * 0.5) + 2,
      ),
      TERRAIN.backDeep,
      0.2,
      { bark: 0.6 },
    );
  });
}

function paintTrunk(p: Paint, t: SolidRect, scene: Scene, info: TerrainInfo): void {
  const x1 = t.x + t.w;
  const joinedL = scene.solids.some((o) => o.tag === 'ledge' && o.y === t.y && o.x + o.w === t.x);
  const y1 = t.y + t.h;
  const hanging = y1 < info.groundY(t.x + t.w / 2) - 40;
  // Underside: an arch, lowest at the two sides where the stilt roots leave.
  const sag = (u: number): number => (hanging ? 10 * Math.abs(u - 0.5) ** 1.5 * 2.8 - 5 : 0);
  const body = boxOutline(t.x, t.y, x1, y1, t.x, { top: 1.6, side: 5, bottom: 3 }, sag, 7);
  p.solid(body, TERRAIN.bark, 0.55, { bark: 1 });
  if (hanging) {
    // The root crown: knuckles where the stilt roots leave, hanging a little below the cut.
    const kr = rngFor(t.x, 78);
    for (const u of [0.1, 0.34, 0.62, 0.9]) {
      const kx = t.x + t.w * u + range(kr, -6, 6);
      p.solid(
        blob(kx, y1 + sag(u) - 4, range(kr, 15, 22), range(kr, 12, 17), kx, 0.25, 12),
        TERRAIN.bark,
        0.6,
        { bark: 0.6 },
      );
    }
  }
  barkDetail(p, t.x, t.y + 8, x1, y1, t.x + 5);
  const r = rngFor(t.x, 31);
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
  for (let y = t.y + range(r, 90, 200); y < y1 - 80; y += range(r, 130, 300)) {
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
      p.solid(chaikin(cap, 2), mix(PALETTE.keyGold, TERRAIN.bark, 0.55), 0.72);
      p.tint(
        chaikin([cx - w * 0.8, cy + 1, cx, cy - 4.5, cx + w * 0.8, cy + 1, cx, cy - 1], 2),
        0xe9d2a4,
        0.55,
      );
    }
  }
  mossCap(p, t.x, x1, t.y, {
    seed: t.x + 9,
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
  const y1 = s.y + s.h;
  const anchoredRight =
    x1 >= scene.width - 1 || scene.solids.some((o) => o.tag === 'trunk' && o.x === x1 && o.y <= s.y);
  const anchoredLeft = !anchoredRight;
  const r = rngFor(s.x, 51);
  // Thicker where it joins, thinner and rounder at the tip.
  const sag = (u: number): number => {
    const a = anchoredRight ? u : 1 - u;
    return -9 + 26 * a ** 2.2 + 5 * Math.sin(u * 9 + s.x);
  };
  const xa = anchoredLeft ? s.x - 30 : s.x;
  const xb = anchoredRight ? x1 + 30 : x1;
  const body = boxOutline(xa, s.y, xb, y1, s.x, { top: 1.4, side: 3, bottom: 3 }, (u) => {
    const uu = (xa + u * (xb - xa) - s.x) / s.w;
    return sag(clamp(uu, 0, 1));
  });
  p.solid(body, TERRAIN.bark, 0.56, { bark: 0.25 });
  // Long grain following the shelf, and growth rings at the tip.
  const lines = 7;
  for (let i = 0; i < lines; i++) {
    const yy = s.y + 12 + (i / lines) * (s.h - 10);
    const line = wander(
      quad(xa + 10, yy, (xa + xb) / 2, yy + range(r, -4, 6), xb - 10, yy + range(r, -3, 8), 16),
      3,
      s.x + i,
      60,
    );
    const light = r() < 0.5;
    p.solid(
      ribbon(line, (t) => range(r, 3, 4) * Math.sin(Math.PI * clamp(t, 0.03, 0.97)) + 0.8),
      light ? mix(TERRAIN.bark, TERRAIN.barkLit, 0.6) : TERRAIN.barkDark,
      light ? 0.66 : 0.4,
    );
  }
  const tipX = anchoredRight ? s.x + 16 : x1 - 16;
  for (let k = 0; k < 3; k++) {
    p.solid(
      blob(tipX, s.y + s.h * 0.52, 13 - k * 4, 20 - k * 6, s.x + k, 0.12, 12),
      k % 2 ? TERRAIN.bark : mix(TERRAIN.bark, TERRAIN.barkLit, 0.5),
      0.62 - k * 0.04,
    );
  }
  // Shadow where it joins.
  const jx = anchoredRight ? x1 - 14 : s.x + 14;
  p.tint(
    ribbon([jx, s.y + 12, jx, y1 + 22], () => 34),
    TERRAIN.backDeep,
    0.35,
  );
  mossCap(p, s.x, x1, s.y, {
    seed: s.x + 4,
    drapeL: anchoredLeft ? 0 : range(r, 30, 60),
    drapeR: anchoredRight ? 0 : range(r, 30, 60),
    thick: 12,
    drip: 30,
  });
  info.tops.push({ x0: s.x, x1, y: s.y, kind: 'ledge', freeL: !anchoredLeft, freeR: !anchoredRight });
  info.unders.push({ x0: s.x + 8, x1: x1 - 8, y: (x) => y1 + sag((x - s.x) / s.w) - 3, kind: 'ledge' });
}

// ---------------------------------------------------------------------------------------------
// Floating islands: stone, root-bound earth, or a knot of old wood. Tapered underneath.

function paintFloating(p: Paint, s: SolidRect, info: TerrainInfo): void {
  const x1 = s.x + s.w;
  const y1 = s.y + s.h;
  const r = rngFor(s.x, s.y);
  const kind = (['stone', 'earth', 'wood'] as const)[Math.floor(hashKind(s.x) * 3)] ?? 'stone';
  const peak = range(r, 0.3, 0.7);
  const depth = kind === 'stone' ? range(r, 44, 92) : kind === 'earth' ? range(r, 30, 58) : range(r, 38, 80);
  const pow = kind === 'earth' ? 0.55 : 0.85;
  const chunk = kind === 'stone' ? 9 : 4;
  const sag = (u: number): number => {
    const a = u < peak ? u / peak : (1 - u) / (1 - peak);
    const facets = Math.round(noise1(u * 5.5, s.x) * 2) * chunk * 0.5;
    return -10 + depth * clamp(a, 0, 1) ** pow + facets * smoothstep(0, 0.2, a);
  };
  const body = boxOutline(
    s.x,
    s.y,
    x1,
    y1,
    s.x,
    { top: 1.5, side: kind === 'stone' ? 4 : 3, bottom: 3.5 },
    sag,
    7,
  );
  const E = TERRAIN.earth;
  if (kind === 'stone') {
    p.solid(body, TERRAIN.stone[2], 0.52);
    const facetsN = 9;
    for (let i = 0; i < facetsN; i++) {
      const u = (i + range(r, 0.1, 0.9)) / facetsN;
      const cx = lerp(s.x + 14, x1 - 14, u);
      const cy = s.y + 16 + r() * (s.h - 22 + sag(u) * 0.75);
      const pts = chaikin(
        blob(cx, cy, range(r, 12, 26), range(r, 9, 18), s.x + i, 0.35, 6, range(r, -0.5, 0.5)),
        1,
      );
      const light = r() < 0.55;
      p.solid(pts, light ? TERRAIN.stone[r() < 0.5 ? 0 : 3] : TERRAIN.stone[2], light ? 0.6 : 0.46, {}, 0.7);
    }
    for (let i = 0; i < 3; i++) {
      const cx = lerp(s.x + 30, x1 - 30, r());
      const line = wander(
        quad(
          cx,
          s.y + 12,
          cx + range(r, -14, 14),
          s.y + 40,
          cx + range(r, -24, 24),
          y1 + sag((cx - s.x) / s.w) * 0.7,
          8,
        ),
        4,
        i + s.x,
        18,
      );
      p.solid(
        ribbon(line, (t) => 2.6 * (1 - t) + 0.6),
        E[4],
        0.3,
      );
    }
  } else if (kind === 'earth') {
    p.solid(body, E[0], 0.52);
    const lower: number[] = [];
    for (let x = s.x - 6; x <= x1 + 6; x += 8) lower.push(x, s.y + 26 + wobble(x, s.x, 50) * 6);
    for (let x = x1 + 6; x >= s.x - 6; x -= 8) lower.push(x, y1 + depth + 20);
    p.tint(clipToBody(lower, s, sag), E[2], 0.75);
    for (let i = 0; i < 9; i++) {
      const cx = lerp(s.x + 14, x1 - 14, r());
      const u = (cx - s.x) / s.w;
      const len = (s.h - 10 + sag(u)) * range(r, 0.5, 0.95);
      const line = wander(
        quad(cx, s.y + 8, cx + range(r, -10, 10), s.y + len * 0.5, cx + range(r, -18, 18), s.y + 8 + len, 9),
        5,
        s.x + i,
        24,
      );
      p.tint(
        ribbon(line, (t) => 8 * (1 - t * 0.6) + 1),
        E[4],
        0.4,
      );
      p.solid(
        ribbon(line, (t) => range(r, 4, 6) * (1 - t * 0.7) + 1),
        mix(TERRAIN.rootWood, E[0], r() * 0.4),
        0.64,
      );
    }
    for (let i = 0; i < 5; i++) {
      const cx = lerp(s.x + 20, x1 - 20, r());
      const u = (cx - s.x) / s.w;
      const cy = s.y + 18 + r() * Math.max(6, s.h - 26 + sag(u) * 0.6);
      p.solid(
        chaikin(blob(cx, cy, range(r, 5, 11), range(r, 4, 8), i + s.x, 0.3, 8), 1),
        TERRAIN.stone[1],
        0.66,
      );
    }
  } else {
    p.solid(body, TERRAIN.bark, 0.54, { bark: 0.2 });
    // Twisted grain: fat strands sweeping across and down to the point.
    for (let i = 0; i < 10; i++) {
      const xs = lerp(s.x + 6, x1 - 6, r());
      const tipX = s.x + s.w * peak + range(r, -30, 30);
      const tipY = y1 + sag(clamp((tipX - s.x) / s.w, 0, 1)) * range(r, 0.3, 0.85);
      const line = wander(quad(xs, s.y + 10, lerp(xs, tipX, 0.3), s.y + 34, tipX, tipY, 12), 5, s.x + i, 30);
      const light = r() < 0.5;
      p.solid(
        ribbon(line, (t) => range(r, 6, 9) * (1 - t * 0.65) + 1),
        light ? mix(TERRAIN.bark, TERRAIN.barkLit, range(r, 0.3, 0.8)) : TERRAIN.barkDark,
        light ? 0.66 : 0.42,
      );
    }
    const kx = lerp(s.x + 50, x1 - 50, r());
    p.solid(blob(kx, s.y + 30, 11, 9, s.x, 0.15, 12), TERRAIN.barkLit, 0.7);
    p.solid(blob(kx, s.y + 30, 6, 5, s.x, 0.15, 10), TERRAIN.backDeep, 0.34);
  }
  // Belly shadow: the underside falls away from the light.
  const belly: number[] = [];
  for (let x = s.x - 6; x <= x1 + 6; x += 8) belly.push(x, s.y + s.h * 0.75 + sag((x - s.x) / s.w) * 0.35);
  for (let x = x1 + 6; x >= s.x - 6; x -= 8) belly.push(x, y1 + depth + 20);
  p.tint(belly, TERRAIN.backDeep, 0.3);
  mossCap(p, s.x, x1, s.y, {
    seed: s.x + 2,
    drapeL: range(r, 22, 52),
    drapeR: range(r, 22, 52),
    thick: range(r, 9, 13),
    drip: range(r, 18, 30),
  });
  info.tops.push({ x0: s.x, x1, y: s.y, kind: 'floating', freeL: true, freeR: true });
  info.unders.push({ x0: s.x + 10, x1: x1 - 10, y: (x) => y1 + sag((x - s.x) / s.w) - 3, kind: 'floating' });
}

function hashKind(x: number): number {
  // Spread the three island kinds so neighbours differ.
  return noise1(x * 0.731 + 0.37, 99) * 0.5 + 0.5;
}

/** Keeps the lower points of a band inside a sagging body (cheap: clamps y to the belly line). */
function clipToBody(pts: number[], s: SolidRect, sag: (u: number) => number): number[] {
  const out = pts.slice();
  for (let i = 0; i < out.length; i += 2) {
    const x = clamp(out[i] as number, s.x + 3, s.x + s.w - 3);
    const u = (x - s.x) / s.w;
    out[i] = x;
    out[i + 1] = Math.min(out[i + 1] as number, s.y + s.h + sag(u) - 2);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The root: a mound of root-bound earth with one fat root arching over it.

function paintRootMound(p: Paint, s: SolidRect, info: TerrainInfo): void {
  const x1 = s.x + s.w;
  const y1 = s.y + s.h;
  const r = rngFor(s.x, 13);
  const E = TERRAIN.earth;
  // The packed earth and old wood under the arch (it is solid: no daylight through it).
  const body = boxOutline(s.x + 10, s.y + 14, x1 - 10, y1 + 12, s.x, { top: 2, side: 3, bottom: 0 });
  p.solid(body, E[3], 0.4);
  for (let i = 0; i < 5; i++) {
    p.solid(
      blob(
        lerp(s.x + 34, x1 - 34, r()),
        lerp(s.y + 50, y1 - 4, r()),
        range(r, 9, 18),
        range(r, 8, 14),
        s.x + i,
        0.3,
        10,
      ),
      E[4],
      0.3,
    );
  }
  const wood = mix(TERRAIN.bark, TERRAIN.rootWood, 0.45);
  const strand = (line: number[], w: (t: number) => number, h: number, light: number): void => {
    p.tint(
      ribbon(line, (t) => w(t) + 8),
      E[4],
      0.5,
    );
    p.solid(ribbon(line, w), mix(wood, TERRAIN.barkDark, 1 - light), h, { bark: 0.12 });
    p.solid(
      ribbon(line, (t) => w(t) * 0.36),
      mix(wood, TERRAIN.barkLit, 0.35 + light * 0.4),
      h + 0.08,
      { bark: 0.12 },
    );
  };
  // Lesser roots woven through underneath.
  for (let i = 0; i < 4; i++) {
    const xa = lerp(s.x + 26, x1 - 26, r());
    const xb = lerp(s.x + 10, x1 - 10, r());
    const line = wander(
      quad(xa, s.y + 30, lerp(xa, xb, 0.5) + range(r, -20, 20), s.y + 62, xb, y1 + 8, 12),
      5,
      s.x + i,
      40,
    );
    const w0 = range(r, 9, 16);
    strand(line, (t) => w0 * (1 - 0.3 * t), 0.52, 0.3);
  }
  // The great root: out of the ground, over, and back in. Its upper edge is the walk line.
  const W0 = 44;
  const cy = s.y + 2 + W0 / 2;
  const up = cubic(s.x - 20, y1 + 16, s.x - 2, y1 - 30, s.x - 4, cy + 4, s.x + 34, cy, 12);
  const down = cubic(x1 - 34, cy, x1 + 4, cy + 4, x1 + 2, y1 - 30, x1 + 22, y1 + 16, 12);
  const across: number[] = [];
  for (let x = s.x + 46; x < x1 - 40; x += 12) across.push(x, cy + wobble(x, s.x + 8, 50) * 1.2);
  const arch = [...up, ...across, ...down];
  const girth = (t: number): number =>
    W0 * (1 + 0.3 * Math.abs(t - 0.5) ** 1.5 * 2) +
    wobble(t * 300, s.x + 4, 60) * 3 +
    Math.max(0, wobble(t * 300, s.x + 5, 26)) * 5;
  // Keep the crest flat where it is walked on: only the underside varies.
  strand(arch, girth, 0.68, 1);
  // Bark seams along it.
  for (const off of [-9, 4, 13]) {
    const seam = arch.map((v, i) =>
      i % 2 ? v + off + wobble(arch[i - 1] as number, s.x + off, 40) * 2.5 : v,
    );
    p.solid(
      ribbon(seam, (t) => 2.4 * Math.sin(Math.PI * clamp(t, 0.03, 0.97)) + 0.5),
      off < 0 ? mix(wood, TERRAIN.barkLit, 0.7) : TERRAIN.barkDark,
      off < 0 ? 0.78 : 0.5,
      { bark: 0.12 },
    );
  }
  // Knuckles where it meets the ground.
  for (const [kx, dir] of [
    [s.x - 14, -1],
    [x1 + 16, 1],
  ] as const) {
    const toe = quad(kx, y1 - 6, kx + dir * 16, y1 + 2, kx + dir * 34, y1 + 10, 6);
    strand(toe, (t) => 16 * (1 - t) + 3, 0.6, 0.6);
  }
  mossCap(p, s.x + 14, x1 - 14, s.y, {
    seed: s.x + 6,
    thick: 7,
    drip: 12,
  });
  // Moss creeping down the two shoulders.
  for (const [mx, dir] of [
    [s.x + 8, -1],
    [x1 - 8, 1],
  ] as const) {
    const line = wander(
      quad(mx + dir * -8, s.y + 4, mx + dir * 4, s.y + 12, mx + dir * 10, s.y + range(r, 34, 56), 8),
      2,
      mx,
      20,
    );
    p.solid(
      ribbon(line, (t) => 13 * (1 - t) ** 0.6 + 2),
      TERRAIN.mossDark,
      0.78,
      { moss: 1 },
    );
    p.solid(
      ribbon(line, (t) => 7 * (1 - t) ** 0.8 + 1),
      TERRAIN.moss,
      0.86,
      { moss: 1 },
    );
  }
  info.tops.push({ x0: s.x, x1, y: s.y, kind: 'root', freeL: true, freeR: true });
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
  const topY = y - range(r, 440, 560);
  const lean = range(r, -50, 50);
  const line = wander(
    cubic(bx + 10, gy, bx - 8, lerp(gy, y, 0.6), bx + 8, y - 60, bx + lean, topY, 28),
    12,
    x,
    170,
  );
  const shape = (t: number): number => 50 * (1 - t) ** 0.75 + 6 + smoothstep(0.1, 0, t) * 30;
  p.solid(ribbon(line, shape), TERRAIN.backDeep, 0.26, { bark: 0.7 });
  p.solid(
    ribbon(line, (t) => shape(t) * 0.3),
    mix(TERRAIN.backDeep, TERRAIN.bark, 0.45),
    0.31,
    { bark: 0.7 },
  );
  // Side limbs higher up, each ending in leaves (pf-plants.ts grows them from info.twigs).
  for (let i = 0; i < 5; i++) {
    const t = 0.42 + i * 0.12 + range(r, -0.03, 0.03);
    const k = Math.min(line.length / 2 - 1, Math.floor(t * (line.length / 2 - 1))) * 2;
    const sx = line[k] as number;
    const sy = line[k + 1] as number;
    const d = i % 2 ? -1 : 1;
    const len = range(r, 70, 150) * (1.15 - t * 0.5);
    const ex = sx + d * len;
    const ey = sy - len * range(r, 0.25, 0.55);
    const tw = wander(quad(sx, sy, sx + d * len * 0.55, sy - len * 0.02, ex, ey, 10), 4, x + i, 50);
    p.solid(
      ribbon(tw, (u) => shape(t) * 0.5 * (1 - u) ** 0.8 + 1.5),
      TERRAIN.backDeep,
      0.25,
      { bark: 0.7 },
    );
    info.twigs.push({ x: ex, y: ey, angle: Math.atan2(ey - sy, ex - sx) });
    const mx = lerp(sx, ex, 0.6);
    const my = lerp(sy, ey, 0.5) - len * 0.06;
    info.twigs.push({ x: mx, y: my, angle: -Math.PI / 2 + d * 0.5 });
  }
  info.twigs.push({ x: bx + lean, y: topY, angle: -Math.PI / 2 });
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
