/**
 * The floating islands: one family per zone, each explained by what holds it and each with its
 * own proportions (some thin and wide, some deep and heavy).
 *
 *   cool glade   0 a wet boulder wedged in the fork of a dead snag   (deep, stands on the ground)
 *                1 a flake of slate caught in a sling of vines        (thin)
 *                2 a mass of aerial roots gathered round peat and stones (deep, lopsided)
 *   light well   3 a great bracket fungus on a hanging limb           (wedge: thick at the limb)
 *                4 a woven nest of vines and twigs                    (bowl)
 *   old stand    5 the crooked crown limb of an old snag              (thin, stands on the ground)
 *                6 a violet stone clutched by roots from above        (deep)
 *
 * The walkable top is always the collision top (the moss cap paints it); everything that gives
 * the island its character is underneath or behind. Supports that reach the ground or rise above
 * the top are painted in the back plane (dark, low relief) by `paintIslandBacks`, before the
 * ground, so they read as standing behind the walk line.
 */
import type { SolidRect } from '../../../sim/scene';
import { mix } from './look';
import type { Paint } from './pf-paint';
import { dome, fitUnderTop, paintRock, type RockMoss } from './pf-rock';
import {
  blob,
  chaikin,
  clamp,
  cubic,
  lerp,
  quad,
  range,
  ribbon,
  rngFor,
  smoothstep,
  wander,
  wobble,
} from './pf-shape';
import type { MossOpts, TerrainInfo, Under } from './pf-terrain';

/** What pf-terrain.ts lends the islands (passed in, so the two files do not import each other). */
export interface IslandKit {
  mossCap(p: Paint, x0: number, x1: number, y: number, o: MossOpts): void;
  mossTone(x: number, y: number, seed: number, dull: number): { dark: number; body: number };
  back: number;
  backDeep: number;
  abyss: number;
  highRead: number;
}

/** Local colours before the bake's zone tint and light. */
export const ISLES = {
  cool: {
    stone: 0x3d6270,
    stoneLight: 0x587f88,
    stoneDark: 0x122632,
    wood: 0x27434c,
    woodLit: 0x3d6062,
    woodDark: 0x0f2029,
    peat: 0x13262f,
  },
  warm: {
    wood: 0x4a3c28,
    woodLit: 0x6a5838,
    woodDark: 0x1e160e,
    vine: 0x414c24,
    cap: 0x6e4a26,
    capDark: 0x382414,
    capPale: 0x9a7a4a,
    pore: 0x66583e,
  },
  deep: {
    stone: 0x58587c,
    stoneLight: 0x7a7a9c,
    stoneDark: 0x1a1730,
    wood: 0x423c56,
    woodLit: 0x625a76,
    woodDark: 0x1c182a,
  },
  /** How far the deep ones hang below the collision bottom, px. */
  deepDrop: 100,
} as const;

export interface Wood {
  col: number;
  lit: number;
  dark: number;
}

/** A polyline moved by a vector that may change along it. */
function shiftLine(line: number[], dx: (t: number) => number, dy: (t: number) => number): number[] {
  const n = line.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    out.push((line[i * 2] as number) + dx(t), (line[i * 2 + 1] as number) + dy(t));
  }
  return out;
}

function at(line: number[], t: number): [number, number] {
  const n = line.length / 2;
  const f = clamp(t, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const k = f - i;
  return [
    lerp(line[i * 2] as number, line[i * 2 + 2] as number, k),
    lerp(line[i * 2 + 1] as number, line[i * 2 + 3] as number, k),
  ];
}

/**
 * A round limb or root along `line`: a rounded section (three shells of height), a lit strip on
 * the side of the key light, a dark one opposite, and grain lines that wind along it.
 */
export function limb(
  p: Paint,
  line: number[],
  wd: (t: number) => number,
  c: Wood,
  h: number,
  rise: number,
  seed: number,
  o: { bark?: number; grain?: number; alpha?: number; lit?: number } = {},
): void {
  const bark = o.bark ?? 0.5;
  p.solid(ribbon(line, wd), c.col, h, { bark }, o.alpha ?? 1);
  p.bump(
    ribbon(line, (t) => wd(t) * 0.62),
    h + rise * 0.6,
    { bark },
  );
  p.bump(
    ribbon(line, (t) => wd(t) * 0.3),
    h + rise,
    { bark },
  );
  p.tint(
    ribbon(
      shiftLine(
        line,
        (t) => wd(t) * 0.1,
        (t) => -wd(t) * 0.24,
      ),
      (t) => wd(t) * 0.26,
    ),
    c.lit,
    o.lit ?? 0.5,
  );
  p.tint(
    ribbon(
      shiftLine(
        line,
        (t) => -wd(t) * 0.06,
        (t) => wd(t) * 0.27,
      ),
      (t) => wd(t) * 0.34,
    ),
    c.dark,
    0.5,
  );
  const grain = o.grain ?? 0;
  for (let i = 0; i < grain; i++) {
    const ph = seed * 0.37 + i * 2.1;
    const f = 5 + (i % 3) * 2.3;
    const off = (t: number): number => wd(t) * 0.34 * Math.sin(t * f + ph);
    const g = ribbon(
      shiftLine(line, () => 0, off),
      (t) => (1.1 + wd(t) * 0.035) * Math.sin(Math.PI * clamp(t, 0.03, 0.97)) ** 0.5,
    );
    p.tint(g, i % 3 === 0 ? c.lit : c.dark, i % 3 === 0 ? 0.4 : 0.6);
    if (i % 3 !== 0) p.bump(g, Math.max(0, h - 0.04), { bark });
  }
}

/** The island's body outline: the collision top, rounded ends, and `under(u)` px below the bottom. */
function hull(
  s: SolidRect,
  under: (u: number) => number,
  o: { endL?: number; endR?: number; out?: number; seed?: number; step?: number } = {},
): number[] {
  const x1 = s.x + s.w;
  const seed = o.seed ?? s.x;
  const eL = (o.endL ?? 18) / s.w;
  const eR = (o.endR ?? 18) / s.w;
  const out = o.out ?? 3;
  const step = o.step ?? 6;
  const pts: number[] = [];
  for (let x = s.x + 3; x <= x1 - 3; x += step) pts.push(x, s.y + 2 + wobble(x, seed, 50) * 1.1);
  const n = Math.round(s.w / step);
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    const round = Math.min(1, (u / eL) ** 0.55, ((1 - u) / eR) ** 0.55);
    const th = Math.max(5, (s.h + under(u)) * (0.12 + 0.88 * round));
    const bulge = Math.sin(Math.PI * clamp(th / (s.h + 30), 0, 1)) * out * (u < 0.5 ? -1 : 1) * (1 - round);
    pts.push(lerp(s.x, x1, u) + bulge, s.y + 2 + th);
  }
  return chaikin(pts, 1);
}

/** Dark washes under the widest part of a body: the belly falls away from the light. */
function bellyShade(p: Paint, s: SolidRect, under: (u: number) => number, kit: IslandKit, k = 1): void {
  const x1 = s.x + s.w;
  for (let j = 0; j < 3; j++) {
    const band: number[] = [];
    for (let x = s.x - 40; x <= x1 + 40; x += 8) {
      const u = clamp((x - s.x) / s.w, 0, 1);
      band.push(x, s.y + 20 + (s.h - 20 + under(u)) * (0.3 + j * 0.22) + wobble(x, s.x + j * 9, 44) * 5);
    }
    band.push(x1 + 40, s.y + s.h + 260, s.x - 40, s.y + s.h + 260);
    p.tint(band, kit.abyss, (0.3 + j * 0.06) * k);
  }
}

/** A root with a soft shadow under it. */
function root(
  p: Paint,
  line: number[],
  w0: number,
  c: Wood,
  h: number,
  seed: number,
  taper = 0.75,
  shadow?: number,
): void {
  const wd = (t: number): number =>
    w0 * (1 - t * taper) * (1 + 0.12 * Math.sin(t * 17 + seed)) + 1.2 + smoothstep(0.1, 0, t) * w0 * 0.2;
  p.tint(
    ribbon(
      shiftLine(
        line,
        () => -1.5,
        () => 3.5,
      ),
      (t) => wd(t) + 5,
    ),
    shadow ?? c.dark,
    0.5,
  );
  limb(p, line, wd, c, h, 0.07, seed, { bark: 0.3, grain: w0 > 11 ? 1 : 0, lit: 0.28 });
}

// ---------------------------------------------------------------------------------------------

/** Back-plane supports (the snags two of the islands stand on). Call before the ground is painted. */
export function paintIslandBacks(p: Paint, floats: SolidRect[], info: TerrainInfo, kit: IslandKit): void {
  floats.forEach((s, index) => {
    const x1 = s.x + s.w;
    const y1 = s.y + s.h;
    const r = rngFor(s.x, s.y, 33);
    const back: Wood = {
      col: mix(kit.backDeep, kit.back, 0.35),
      lit: mix(kit.back, 0x4a6a6a, 0.25),
      dark: mix(kit.backDeep, kit.abyss, 0.6),
    };
    if (index % 7 === 0) {
      // A dead snag leaning across behind the stone: the stone is lodged in the crotch between
      // the trunk and one great side limb. The trunk goes on above as a broken spar.
      const gx = x1 - range(r, 22, 40);
      const gy = info.groundY(gx) + 16;
      const tip: [number, number] = [s.x + s.w * 0.2, s.y - range(r, 130, 160)];
      const trunk = wander(
        cubic(gx, gy, gx + 34, gy - 150, s.x + s.w * 0.5, s.y + 90, tip[0], tip[1], 26),
        6,
        s.x,
        70,
      );
      limb(
        p,
        trunk,
        (t) =>
          84 * (1 - t) ** 0.75 +
          7 +
          smoothstep(0.16, 0, t) * 56 +
          Math.max(0, Math.sin(t * 14 + 1)) * 5 +
          12 * Math.exp(-(((t - 0.4) / 0.07) ** 2)),
        back,
        0.25,
        0.07,
        s.x + 3,
        { bark: 0.8, grain: 8 },
      );
      for (const d of [-1, 1]) {
        limb(
          p,
          quad(gx + d * 20, gy - 50, gx + d * 60, gy - 22, gx + d * range(r, 90, 124), gy + 6, 8),
          (t) => 30 * (1 - t) + 5,
          back,
          0.24,
          0.05,
          s.x + d,
          { bark: 0.8 },
        );
      }
      // Splinters at the spar's tip.
      for (let i = 0; i < 3; i++) {
        const sx = tip[0] + (i - 1) * 5;
        p.solid(
          ribbon(
            [sx + 4, tip[1] + 22, sx - range(r, -2, 8), tip[1] - range(r, 4, 26)],
            (t) => 7 * (1 - t) + 0.8,
          ),
          back.col,
          0.26,
          { bark: 0.8 },
        );
      }
      info.twigs.push({ x: tip[0] + 6, y: tip[1] + 44, angle: -0.5 });
      info.twigs.push({ x: tip[0], y: tip[1] + 80, angle: -2.6 });
      // The side limb: out from under the stone, up round its right flank to a stub.
      const [jx, jy] = at(trunk, 0.36);
      const armEnd: [number, number] = [x1 + 30, s.y + 24];
      const arm = wander(
        cubic(jx, jy, jx + 40, jy + 30, armEnd[0] + 16, armEnd[1] + 90, armEnd[0], armEnd[1], 16),
        4,
        s.x + 5,
        50,
      );
      limb(p, arm, (t) => 54 * (1 - t * 0.5) + Math.max(0, Math.sin(t * 13)) * 4, back, 0.25, 0.07, s.x + 9, {
        bark: 0.8,
        grain: 5,
      });
      const st: [number, number] = [x1 + 52, s.y - range(r, 26, 44)];
      limb(
        p,
        wander(
          quad(armEnd[0], armEnd[1] + 4, armEnd[0] + 16, lerp(armEnd[1], st[1], 0.5), st[0], st[1], 8),
          3,
          s.x,
          30,
        ),
        (t) => 26 * (1 - t) ** 0.8 + 3,
        back,
        0.25,
        0.06,
        s.x + 13,
        { bark: 0.8, grain: 2 },
      );
      info.twigs.push({ x: st[0], y: st[1], angle: -Math.PI / 2 + 0.5 });
      // A short broken stub on the other side, low.
      const [lx, ly] = at(trunk, 0.5);
      limb(
        p,
        wander(quad(lx, ly, lx - 40, ly + 30, lx - range(r, 66, 84), ly + 44, 8), 3, s.x + 2, 30),
        (t) => 34 * (1 - t) ** 0.7 + 4,
        back,
        0.25,
        0.06,
        s.x + 15,
        { bark: 0.8, grain: 2 },
      );
      // A rot hollow low on the trunk.
      const [kx, ky] = at(trunk, 0.16);
      p.solid(blob(kx - 4, ky, 14, 21, s.x + 21, 0.2, 14), back.lit, 0.31, { bark: 0.8 }, 0.6);
      p.solid(blob(kx - 4, ky + 1, 9, 15, s.x + 22, 0.2, 12), back.dark, 0.18);
      info.keepClear.push([gx - 70, gx + 70]);
    } else if (index % 7 === 5) {
      // An old snag whose crown bent over long ago: the bent limb is the island.
      const gx = x1 - range(r, 28, 44);
      const gy = info.groundY(gx) + 16;
      const jx = x1 - 34;
      const jy = y1 + 6;
      const trunk = wander(
        cubic(gx, gy, gx - 70, lerp(gy, jy, 0.35), gx + 64, lerp(gy, jy, 0.7), jx, jy, 22),
        7,
        s.x,
        70,
      );
      limb(
        p,
        trunk,
        (t) =>
          78 * (1 - t * 0.3) +
          smoothstep(0.22, 0, t) * 60 +
          Math.max(0, Math.sin(t * 11 + 2)) * 7 +
          14 * Math.exp(-(((t - 0.55) / 0.08) ** 2)),
        back,
        0.25,
        0.07,
        s.x + 3,
        { bark: 0.8, grain: 8 },
      );
      for (const d of [-1, 1]) {
        limb(
          p,
          quad(gx + d * 22, gy - 52, gx + d * 64, gy - 24, gx + d * range(r, 96, 130), gy + 6, 8),
          (t) => 30 * (1 - t) + 5,
          back,
          0.24,
          0.05,
          s.x + d,
          { bark: 0.8 },
        );
      }
      // The second leader, broken off above; and a dead side limb lower down.
      const stub = wander(quad(jx + 12, jy + 8, x1 + 26, s.y - 20, x1 + 8, s.y - 128, 10), 4, s.x + 7, 40);
      limb(p, stub, (t) => 44 * (1 - t) ** 0.7 + 4, back, 0.25, 0.06, s.x + 14, { bark: 0.8, grain: 3 });
      info.twigs.push({ x: x1 + 8, y: s.y - 128, angle: -Math.PI / 2 - 0.3 });
      info.twigs.push({ x: x1 + 24, y: s.y - 60, angle: -0.4 });
      const [bx, by] = at(trunk, 0.5);
      const side = wander(quad(bx, by, bx - 60, by - 10, bx - 104, by - 58, 8), 4, s.x + 9, 30);
      limb(p, side, (t) => 24 * (1 - t) ** 0.8 + 2.5, back, 0.24, 0.05, s.x + 15, { bark: 0.8 });
      info.twigs.push({ x: bx - 104, y: by - 58, angle: -2.2 });
      // A rot hollow.
      const [kx, ky] = at(trunk, 0.28);
      p.solid(blob(kx, ky, 17, 27, s.x + 21, 0.2, 14), back.lit, 0.31, { bark: 0.8 }, 0.6);
      p.solid(blob(kx, ky + 2, 11, 20, s.x + 22, 0.2, 12), back.dark, 0.16);
      info.keepClear.push([gx - 80, gx + 80]);
    }
  });
}

/** One floating island. `index` is its place left to right. */
export function paintFloating(
  p: Paint,
  s: SolidRect,
  index: number,
  info: TerrainInfo,
  kit: IslandKit,
): void {
  const x1 = s.x + s.w;
  const y1 = s.y + s.h;
  const r = rngFor(s.x, s.y);
  const kind = index % 7;
  const mid = (s.x + x1) / 2;
  const tone = kit.mossTone(mid, s.y, s.x, 0);
  const moss: RockMoss = { dark: tone.dark, body: tone.body, amount: 0.8 };
  let under: (u: number) => number = () => 0;
  let trail: Under['trail'] = 'few';
  let bare = 0.2;
  let belly = 1;
  const ropes: TerrainInfo['hangers'][number]['ropes'] = [];
  let yoke: { x: number; y: number } | undefined;

  if (kind === 0) {
    // ---- Wet boulders lodged in the crotch of a snag (the snag is in paintIslandBacks): a great
    // round one, and a lesser one jammed between it and the snag's limb.
    const C = ISLES.cool;
    const split = s.x + s.w * 0.7;
    const stones = [
      { x0: split - 20, x1: x1 - 4, ry: 44, squat: 0.95, boxy: 2.5, seed: s.x + 6, tilt: -0.1, dim: 0.25 },
      { x0: s.x + 4, x1: split + 18, ry: 82, squat: 1.12, boxy: 2.15, seed: s.x + 1, tilt: 0.05, dim: 0 },
    ];
    const lows: Array<{ y: number; x0: number; x1: number }> = [];
    for (const st of stones) {
      const rock = fitUnderTop(
        {
          cx: (st.x0 + st.x1) / 2,
          cy: s.y + 2 + st.ry * 0.5,
          rx: (st.x1 - st.x0) * 0.56,
          ry: st.ry,
          seed: st.seed,
          color: mix(C.stone, C.stoneDark, st.dim),
          dark: C.stoneDark,
          light: C.stoneLight,
          h: 0.5 - st.dim * 0.1,
          rise: 0.22,
          topY: s.y + 2,
          squat: st.squat,
          boxy: st.boxy,
          rough: 1.2,
          tilt: st.tilt,
          spanX: [st.x0 - 9, st.x1 + 9],
          moss,
          cracks: 2,
          ground: 0,
        },
        st.x0,
        st.x1,
      );
      const outline = paintRock(p, rock);
      let ly = y1;
      for (let i = 1; i < outline.length; i += 2) ly = Math.max(ly, outline[i] as number);
      lows.push({ y: ly, x0: st.x0, x1: st.x1 });
    }
    under = (u) => {
      const x = s.x + u * s.w;
      let d = -10;
      for (const l of lows) {
        const q = clamp((x - l.x0) / (l.x1 - l.x0), 0, 1);
        d = Math.max(d, (l.y - y1) * Math.sin(Math.PI * q) ** 0.6 - 4);
      }
      return d;
    };
    // The seam where they touch, packed with moss.
    const cleft = ribbon(
      wander([split - 2, s.y + 8, split + 5, s.y + 30, split - 4, s.y + 54], 3, s.x, 14),
      (t) => 6 * (1 - t) ** 0.6 + 1,
    );
    p.tint(cleft, C.stoneDark, 0.85);
    p.bump(cleft, 0.34);
    p.solid(blob(split, s.y + 15, 12, 8, s.x + 3, 0.4, 11), tone.dark, 0.72, { moss: 1 }, 0.9);
    // Runs of wet down the face.
    for (let i = 0; i < 5; i++) {
      const sx = lerp(s.x + 30, x1 - 30, (i + r()) / 5);
      const len = range(r, 40, 90);
      const w0 = range(r, 4, 7);
      p.tint(
        ribbon(
          wander(
            [sx, s.y + 16, sx + range(r, -4, 4), s.y + 16 + len * 0.5, sx + range(r, -8, 8), s.y + 16 + len],
            3,
            sx,
            20,
          ),
          (t) => w0 * Math.sin(Math.PI * clamp(t, 0.05, 0.95)) ** 0.6 + 0.6,
        ),
        C.stoneDark,
        0.3,
      );
    }
    bellyShade(p, s, under, kit, 0.8);
    // Creepers from the spar lie over the stone's shoulder.
    const vineC: Wood = {
      col: mix(C.wood, 0x2a5a40, 0.5),
      lit: mix(C.woodLit, 0x4a8a50, 0.5),
      dark: C.woodDark,
    };
    for (let i = 0; i < 3; i++) {
      const sx = s.x + s.w * 0.2 + i * 13;
      const ex = sx - 30 + i * 46 + range(r, -10, 10);
      const ey = s.y + range(r, 60, 108);
      limb(
        p,
        wander(cubic(sx, s.y + 6, sx - 12, s.y + 34, ex + 12, ey - 34, ex, ey, 12), 3, s.x + i * 5, 26),
        (t) => (5.5 - i) * (1 - t * 0.6) + 1,
        vineC,
        0.76,
        0.04,
        s.x + i,
        { bark: 0.2 },
      );
    }
    trail = 'few';
    bare = 0.3;
    belly = 0;
  } else if (kind === 1) {
    // ---- A flake of slate in a sling of vines: thin, thicker at one end, its beds showing.
    const C = ISLES.cool;
    const thick = (u: number): number => lerp(64, 30, u ** 0.8) + wobble(u * 260, s.x, 46) * 4;
    under = (u) => thick(u) - s.h;
    const body = hull(s, under, { endL: 26, endR: 34, out: 2 });
    p.solid(body, mix(C.stone, C.stoneDark, 0.35), 0.5);
    dome(p, body, mid, s.y + 26, 0.5, 0.1, 3, { inner: 0.5 });
    // Beds: three lenses stacked, each broken off short of the one above, each a rounded step.
    const beds = [
      { f0: 0.0, f1: 0.42, a: 0.02, b: 0.99, col: mix(C.stoneLight, 0x8fb0b0, 0.3), h: 0.66 },
      { f0: 0.4, f1: 0.74, a: 0.0, b: 0.84, col: C.stone, h: 0.59 },
      { f0: 0.72, f1: 1.0, a: 0.05, b: 0.62, col: mix(C.stone, C.stoneDark, 0.3), h: 0.54 },
    ];
    for (const [bi, bed] of beds.entries()) {
      const pts: number[] = [];
      const lower: number[] = [];
      for (let u = bed.a; u <= bed.b + 0.001; u += 0.03) {
        const x = lerp(s.x + 2, x1 - 2, u);
        const th = thick(u) - 6;
        const edge = Math.min(1, ((u - bed.a) / 0.06) ** 0.6, ((bed.b - u) / 0.06) ** 0.6);
        const ya = s.y + 4 + th * bed.f0 + wobble(x, s.x + bi * 7, 40) * 1.6;
        const yb = s.y + 4 + th * bed.f1 + wobble(x, s.x + bi * 7 + 1, 40) * 1.6;
        const ym = (ya + yb) / 2;
        pts.push(x, lerp(ym, ya, edge));
        lower.push(x, lerp(ym, yb, edge));
      }
      for (let i = lower.length - 2; i >= 0; i -= 2) pts.push(lower[i] as number, lower[i + 1] as number);
      const shape = chaikin(pts, 1);
      p.solid(shape, mix(bed.col, C.stoneDark, range(r, 0, 0.2)), bed.h, {}, 0.9);
      // Lit upper lip of the bed, dark seam under it.
      const lipL: number[] = [];
      for (let u = bed.a + 0.03; u <= bed.b - 0.02; u += 0.04) {
        const x = lerp(s.x + 2, x1 - 2, u);
        lipL.push(x, s.y + 4 + (thick(u) - 6) * bed.f1 + wobble(x, s.x + bi * 7 + 1, 40) * 1.6 + 1);
      }
      const seam = ribbon(lipL, (t) => 3.2 * Math.sin(Math.PI * clamp(t, 0.03, 0.97)) ** 0.4 + 0.5);
      p.tint(seam, C.stoneDark, 0.8);
      p.bump(seam, 0.4);
      // Moss creeping along part of the seam.
      const m0 = range(r, 0.05, 0.5);
      const part = lipL.slice(
        Math.floor((lipL.length / 2) * m0) * 2,
        Math.floor((lipL.length / 2) * (m0 + 0.35)) * 2,
      );
      if (part.length >= 6)
        p.solid(
          ribbon(part, (t) => 5.5 * Math.sin(Math.PI * clamp(t, 0.03, 0.97)) + 1),
          tone.dark,
          bed.h + 0.03,
          { moss: 1 },
          0.9,
        );
    }
    // Lichen and a crack right through the beds.
    for (let i = 0; i < 9; i++) {
      const u = r();
      const lx = lerp(s.x + 10, x1 - 10, u);
      const lr = range(r, 2, 5);
      p.tint(blob(lx, s.y + 8 + r() * (thick(u) - 16), lr * 1.4, lr, s.x + i, 0.4, 9), 0x9ab0a0, 0.2);
    }
    for (const cu of [0.3, 0.67]) {
      const cx = lerp(s.x, x1, cu);
      const crack = ribbon(
        wander([cx, s.y + 6, cx + 5, s.y + thick(cu) * 0.5, cx - 3, s.y + thick(cu) - 2], 3, cx, 12),
        (t) => 2.6 * (1 - t * 0.6) + 0.5,
      );
      p.tint(crack, C.stoneDark, 0.85);
      p.bump(crack, 0.38);
    }
    // The sling: loops of vine under each end (the middle is left clear for what hangs there).
    const vineC: Wood = {
      col: mix(C.wood, 0x2a5a40, 0.4),
      lit: mix(C.woodLit, 0x4a8a50, 0.4),
      dark: C.woodDark,
    };
    for (const [u0, n] of [
      [0.13, 3],
      [0.8, 2],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const u = u0 + i * 0.045;
        const x = lerp(s.x, x1, u);
        const dep = thick(u) + range(r, 3, 9);
        const loop = cubic(
          x - 4,
          s.y + 6,
          x - 13,
          s.y + dep * 0.8,
          x + 9,
          s.y + dep + 6,
          x + 22 + i * 4,
          s.y + 5,
          14,
        );
        limb(p, loop, () => 5.5 - i, vineC, 0.72, 0.05, s.x + i, { bark: 0.2 });
      }
      ropes.push({ x: lerp(s.x, x1, u0) - 2, y: s.y + 8, w: 10, lean: u0 < 0.5 ? -50 : 60 });
      ropes.push({ x: lerp(s.x, x1, u0 + 0.07) + 14, y: s.y + 8, w: 7, lean: u0 < 0.5 ? -20 : 40 });
    }
    trail = 'few';
    bare = 0.45;
    belly = 0.3;
  } else if (kind === 2) {
    // ---- A mass of aerial roots gathered round peat and wet stones; deep on one side.
    const C = ISLES.cool;
    const peak = 0.34;
    const drop = ISLES.deepDrop + 4;
    under = (u) => {
      const a = u < peak ? u / peak : (1 - u) / (1 - peak);
      return -12 + drop * clamp(a, 0, 1) ** (u < peak ? 0.6 : 0.95) + wobble(u * 300, s.x, 36) * 5;
    };
    const body = hull(s, (u) => under(u) * 0.8 - 8, { endL: 22, endR: 16 });
    p.solid(body, C.peat, 0.44);
    dome(p, body, lerp(s.x, x1, peak + 0.06), s.y + 50, 0.44, 0.1, 4, { inner: 0.35 });
    for (let i = 0; i < 2; i++) {
      const u = lerp(0.2, 0.6, (i + r()) / 2);
      const depth = s.h + under(u);
      const sz = range(r, 17, 26);
      paintRock(p, {
        cx: lerp(s.x, x1, u),
        cy: s.y + depth * range(r, 0.36, 0.6),
        rx: sz * 1.25,
        ry: sz,
        seed: s.x + i * 13,
        color: mix(C.stone, C.stoneDark, range(r, 0.1, 0.35)),
        dark: C.stoneDark,
        light: C.stoneLight,
        h: 0.52,
        rise: 0.1,
        tilt: range(r, -0.4, 0.4),
        moss: { ...moss, amount: 0.5 },
        ground: 0.5,
        cracks: 1,
      });
    }
    bellyShade(p, s, under, kit, 0.9);
    const px = lerp(s.x, x1, peak);
    const py = y1 + drop - 12;
    // Roots from both ends sweep down across it and gather at the lowest point; the body's outline
    // is theirs. The ones laid last lie in front and catch what light there is.
    const nR = 14;
    for (let i = 0; i < nR; i++) {
      const fromLeft = i % 3 !== 2;
      const f = i / (nR - 1);
      const sx = fromLeft ? s.x + 2 + range(r, 0, 76) : x1 - 2 - range(r, 0, 120);
      const ex = px + range(r, -52, 56);
      const ey = py + range(r, -34, 30);
      const belly2 = fromLeft ? -range(r, 10, 30) : range(r, 6, 22);
      const line = wander(
        cubic(
          sx,
          s.y + 7,
          sx + belly2,
          lerp(s.y, ey, 0.5),
          lerp(sx, ex, 0.5) + belly2 * 0.5,
          ey - range(r, 0, 34),
          ex,
          ey,
          16,
        ),
        5,
        s.x + i * 3,
        32,
      );
      const col = mix(mix(C.wood, C.peat, 0.6), mix(C.wood, C.woodLit, 0.35), f * f);
      root(
        p,
        line,
        range(r, 6, 13) + (i % 4 === 1 ? 9 : 0),
        { col, lit: mix(col, C.woodLit, 0.5), dark: C.woodDark },
        0.58 + f * 0.2,
        s.x + i,
        0.7,
      );
    }
    ropes.push({ x: s.x + 18, y: s.y + 10, w: 19, stout: true, lean: -150 });
    ropes.push({ x: s.x + 40, y: s.y + 10, w: 9, lean: -90 });
    ropes.push({ x: x1 - 26, y: s.y + 10, w: 12, stout: true, lean: 70 });
    trail = 'longRoots';
    bare = 0.3;
    belly = 0;
  } else if (kind === 3) {
    // ---- Bracket fungi on a dead limb that hangs in the vines: one great cap is the walkway,
    // smaller ones step down the limb beneath it.
    const C = ISLES.warm;
    const lx = s.x + s.w * 0.58;
    const thick = (u: number): number =>
      20 +
      32 * Math.exp(-(((u - 0.58) / 0.34) ** 2)) +
      12 * Math.abs(Math.sin(Math.PI * (u * 3.6 + 0.35))) ** 0.6 +
      wobble(u * 300, s.x, 30) * 2;
    under = (u) => thick(u) - s.h;
    const limbLine = wander(
      cubic(lx + 62, s.y - 250, lx + 34, s.y - 120, lx + 4, s.y + 40, lx - 24, y1 + 124, 26),
      5,
      s.x,
      60,
    );
    const nL = limbLine.length / 2;
    let cut = 0;
    for (let i = 0; i < nL; i++) if ((limbLine[i * 2 + 1] as number) < s.y + 14) cut = i;
    const upper = limbLine.slice(0, (cut + 2) * 2);
    const lower = limbLine.slice(cut * 2);
    const backWood: Wood = {
      col: mix(kit.backDeep, C.wood, 0.3),
      lit: mix(kit.back, C.woodLit, 0.4),
      dark: mix(kit.backDeep, kit.abyss, 0.6),
    };
    limb(p, upper, (t) => lerp(26, 52, t) + Math.max(0, Math.sin(t * 12)) * 3, backWood, 0.26, 0.06, s.x, {
      bark: 0.8,
      grain: 4,
    });
    // The underside of the great cap, falling back to the limb.
    const pore: number[] = [];
    for (let u = 0.06; u <= 0.94; u += 0.04) pore.push(lerp(s.x, x1, u), s.y + thick(u) - 6);
    pore.push(lx + 34, y1 + 30, lx + 14, y1 + 52, lx - 22, y1 + 56, lx - 44, y1 + 30);
    p.solid(chaikin(pore, 1), mix(C.pore, C.capDark, 0.4), 0.42);
    const wood: Wood = { col: mix(C.wood, C.woodDark, 0.25), lit: C.woodLit, dark: C.woodDark };
    limb(
      p,
      lower,
      (t) => 54 * (1 - t * 0.35) * (1 - smoothstep(0.86, 1, t) * 0.6) + Math.max(0, Math.sin(t * 11 + 2)) * 4,
      wood,
      0.44,
      0.1,
      s.x + 1,
      { bark: 0.9, grain: 6 },
    );
    // Splinters at the break.
    const [ex, ey] = at(lower, 1);
    for (let i = 0; i < 4; i++) {
      const sx = ex + (i - 1.5) * 7;
      p.solid(
        ribbon([sx + 2, ey - 14, sx + range(r, -6, 6), ey + range(r, 6, 30)], (t) => 8 * (1 - t) + 0.8),
        i % 2 ? C.woodLit : C.wood,
        0.46,
        { bark: 0.8 },
      );
    }
    const bracket = (
      cx: number,
      cy: number,
      half: number,
      th: number,
      tilt: number,
      seed: number,
      h: number,
    ): void => {
      const pts: number[] = [];
      const N = 24;
      const cs = Math.cos(tilt);
      const sn = Math.sin(tilt);
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI;
        const k = 1 + 0.07 * Math.sin(a * 6 + seed) + 0.04 * Math.sin(a * 13 + seed * 2);
        const px = -Math.cos(a) * half * k;
        const py = Math.sin(a) ** 0.8 * th * k;
        pts.push(cx + px * cs - py * sn, cy + px * sn + py * cs);
      }
      // Slightly domed back.
      for (let i = N - 1; i > 0; i--) {
        const a = (i / N) * Math.PI;
        const px = -Math.cos(a) * half;
        const py = -Math.sin(a) * th * 0.3;
        pts.push(cx + px * cs - py * sn, cy + px * sn + py * cs);
      }
      const shape = chaikin(pts, 1);
      p.tint(
        shape.map((v, i) => (i % 2 ? v + 6 : v)),
        kit.abyss,
        0.5,
      );
      p.solid(shape, C.pore, h);
      const sc = (k: number, dy: number): number[] =>
        shape.map((v, i) => (i % 2 ? cy + dy + (v - cy) * k : cx + (v - cx) * (0.5 + 0.5 * k)));
      p.solid(sc(0.8, -1.5), mix(C.cap, C.capPale, 0.3), h + 0.02);
      p.solid(sc(0.58, -2), C.cap, h + 0.04, {}, 0.9);
      p.solid(sc(0.3, -2.5), C.capDark, h + 0.05, {}, 0.9);
    };
    const smalls: Array<[number, number, number, number]> = [
      [0.42, -1, 46, -0.16],
      [0.6, 1, 38, 0.2],
      [0.8, -1, 27, -0.24],
    ];
    for (const [t, side, half, tilt] of smalls) {
      const [bx, by] = at(lower, t);
      bracket(bx + side * half * 0.62, by, half, half * 0.38, tilt, s.x + t * 40, 0.52);
    }
    bellyShade(p, s, under, kit, 0.75);
    // The great cap. Its face shows the growth zones as bands that follow the scalloped rim.
    const body = hull(s, under, { endL: 34, endR: 34, out: 7 });
    p.solid(body, C.cap, 0.58);
    dome(p, body, lerp(s.x, x1, 0.56), s.y + 18, 0.58, 0.1, 4, { inner: 0.45 });
    const band = (f0: number, f1: number, col: number, alpha: number, h?: number): void => {
      const pts: number[] = [];
      const lower2: number[] = [];
      for (let u = 0.03; u <= 0.975; u += 0.02) {
        const x = lerp(s.x, x1, u);
        const th = (thick(u) - 3) * Math.min(1, (u / 0.1) ** 0.5, ((1 - u) / 0.1) ** 0.5);
        const wv = wobble(x, s.x + f0 * 90, 22) * 1.8;
        pts.push(x, s.y + 3 + th * f0 + wv);
        lower2.push(x, s.y + 3 + th * f1 + wv * 0.6);
      }
      for (let i = lower2.length - 2; i >= 0; i -= 2) pts.push(lower2[i] as number, lower2[i + 1] as number);
      p.tint(pts, col, alpha);
      if (h !== undefined) p.bump(pts, h);
    };
    band(0, 0.28, C.capDark, 0.85);
    band(0.26, 0.4, mix(C.cap, C.capDark, 0.5), 0.8, 0.62);
    band(0.4, 0.58, C.cap, 0.7);
    band(0.56, 0.68, mix(C.cap, C.capDark, 0.4), 0.75, 0.62);
    band(0.68, 0.9, mix(C.cap, C.capPale, 0.6), 0.85, 0.66);
    band(0.9, 1.0, mix(C.pore, C.capDark, 0.3), 0.9, 0.54);
    // Creases between the lobes, from the back to the notches in the rim.
    for (let k = 0; k < 4; k++) {
      const cu = (k + 1 - 0.35) / 3.6;
      if (cu > 0.95) continue;
      const cx = lerp(s.x, x1, cu);
      const crease = ribbon(
        wander([cx - 3, s.y + 9, cx + 2, s.y + thick(cu) * 0.5, cx, s.y + thick(cu) - 2], 2.5, cx, 16),
        (t) => 4 * Math.sin(Math.PI * clamp(t, 0.04, 0.9)) + 0.8,
      );
      p.tint(crease, C.capDark, 0.55);
      p.bump(crease, 0.5, { alpha: 0.8 });
    }
    const [tx, ty] = at(upper, 0);
    ropes.push({ x: tx, y: ty + 8, w: 24, stout: true, lean: 70 });
    ropes.push({ x: tx - 10, y: ty + 40, w: 8, lean: 20 });
    ropes.push({ x: s.x + 26, y: s.y + 10, w: 6, lean: -70 });
    trail = 'few';
    bare = 0.5;
    belly = 0;
  } else if (kind === 4) {
    // ---- A nest woven of vines and twigs: a ragged bowl.
    const C = ISLES.warm;
    const drop = 44;
    const bowl = (u: number): number => Math.sin(Math.PI * clamp(u, 0.02, 0.98)) ** 0.55;
    under = (u) => -8 + drop * bowl(u) + wobble(u * 280, s.x, 30) * 4;
    const body = hull(s, under, { endL: 26, endR: 26, out: 9 });
    p.solid(body, C.woodDark, 0.46);
    dome(p, body, mid, s.y + 36, 0.46, 0.12, 4, { inner: 0.3 });
    const strandC = [C.wood, C.woodLit, C.vine, mix(C.wood, C.woodDark, 0.4), mix(C.vine, C.woodLit, 0.4)];
    // Strands that follow the bowl from rim to rim.
    const nA = 9;
    for (let i = 0; i < nA; i++) {
      const f = (i + 0.6) / nA;
      const a = range(r, 0.0, 0.1);
      const b = range(r, 0.9, 1.0);
      const pts: number[] = [];
      for (let u = a; u <= b + 0.001; u += 0.035) {
        const x = lerp(s.x - 4, x1 + 4, u);
        const depth = (s.h + under(clamp(u, 0, 1))) * (0.2 + 0.8 * bowl(u));
        pts.push(x, s.y + 7 + (depth - 9) * f + wobble(x, s.x + i * 5, 34) * 3.2);
      }
      const col = strandC[i % strandC.length] as number;
      const w0 = range(r, 5, 9.5);
      limb(
        p,
        pts,
        (t) => w0 * (0.55 + 0.45 * Math.sin(Math.PI * clamp(t, 0.02, 0.98)) ** 0.5),
        { col, lit: mix(col, C.woodLit, 0.5), dark: C.woodDark },
        0.56 + (i % 3) * 0.04,
        0.06,
        s.x + i,
        { bark: 0.3 },
      );
    }
    // Strands that cross them on the slant, in and out of the weave.
    for (let i = 0; i < 15; i++) {
      const u = (i + r()) / 15;
      const x = lerp(s.x + 6, x1 - 6, u);
      const depth = s.h + under(u);
      const d = i % 2 ? 1 : -1;
      const y0 = s.y + 5 + depth * range(r, 0, 0.35);
      const len = depth * range(r, 0.45, 0.8);
      const line = wander(
        quad(x, y0, x + d * len * 0.5, y0 + len * 0.45, x + d * len * 0.7, y0 + len, 8),
        3,
        x,
        20,
      );
      const col = strandC[(i + 2) % strandC.length] as number;
      limb(
        p,
        line,
        (t) => range(r, 4, 6.5) * Math.sin(Math.PI * clamp(t, 0.06, 0.94)) ** 0.6 + 1,
        { col, lit: mix(col, C.woodLit, 0.6), dark: C.woodDark },
        0.68,
        0.05,
        s.x + i,
        { bark: 0.3 },
      );
    }
    // Twig ends bristle out of it, most round the rim and underneath.
    for (let i = 0; i < 22; i++) {
      const u = i < 8 ? (i % 2 ? range(r, 0, 0.07) : range(r, 0.93, 1)) : r();
      const x = lerp(s.x, x1, u);
      const depth = s.h + under(u);
      const rim = i < 8;
      const y = rim ? s.y + range(r, 12, 30) : s.y + depth * bowl(u) - range(r, 2, 10);
      const out = u < 0.5 ? -1 : 1;
      const a = rim
        ? out > 0
          ? range(r, -0.5, 0.7)
          : Math.PI + range(r, -0.7, 0.5)
        : Math.PI / 2 + range(r, -1.1, 1.1);
      const len = range(r, 14, rim ? 40 : 30);
      const ex = x + Math.cos(a) * len;
      const ey = Math.max(s.y + 5, y + Math.sin(a) * len);
      p.solid(
        ribbon(
          wander(
            [x - Math.cos(a) * 8, y - Math.sin(a) * 8, (x + ex) / 2, (y + ey) / 2 + 2, ex, ey],
            1.5,
            x,
            10,
          ),
          (t) => 4.2 * (1 - t) ** 0.7 + 0.7,
        ),
        i % 3 ? C.wood : C.woodLit,
        0.6,
        { bark: 0.4 },
      );
    }
    const yk = { x: mid + range(r, -24, 24), y: s.y - range(r, 170, 215) };
    yoke = yk;
    ropes.push({ x: s.x + 16, y: s.y + 12, w: 8, to: yk });
    ropes.push({ x: x1 - 16, y: s.y + 12, w: 8, to: yk });
    ropes.push({ x: mid + 46, y: s.y + 8, w: 5, to: yk });
    trail = 'longVines';
    bare = 0.25;
    belly = 0.8;
  } else if (kind === 5) {
    // ---- The crooked crown limb of an old snag (the trunk is in paintIslandBacks): thin, knuckled.
    const C = ISLES.deep;
    const wood: Wood = { col: C.wood, lit: C.woodLit, dark: C.woodDark };
    const thick = (u: number): number =>
      46 +
      20 * u ** 1.6 +
      17 * Math.exp(-(((u - 0.74) / 0.09) ** 2)) +
      30 * Math.exp(-((u / 0.085) ** 2)) +
      3 * Math.sin(u * 21) +
      wobble(u * 300, s.x, 40) * 2;
    under = (u) => thick(u) - s.h;
    const body = hull(s, under, { endL: 12, endR: 8, out: 5 });
    p.solid(body, C.wood, 0.54, { bark: 0.8 });
    dome(p, body, mid, s.y + 26, 0.54, 0.12, 4, { inner: 0.45, bark: 0.8 });
    // Grain: long fibres that twist along the limb and wrap round the burl.
    for (let i = 0; i < 12; i++) {
      const f = (i + 0.5) / 12;
      const a = range(r, 0, 0.3);
      const b = range(r, 0.6, 1);
      const pts: number[] = [];
      for (let u = a; u <= b; u += 0.03) {
        const x = lerp(s.x, x1, u);
        const th = thick(u) - 8;
        const swirl = 6 * Math.exp(-(((u - 0.74) / 0.1) ** 2)) * Math.sin(f * 6.283 + 1);
        pts.push(x, s.y + 6 + th * clamp(f + 0.1 * Math.sin(u * 9 + i * 1.7), 0.02, 0.98) + swirl);
      }
      if (pts.length < 6) continue;
      const g = ribbon(
        pts,
        (t) => (i % 3 === 0 ? 3.4 : 2.2) * Math.sin(Math.PI * clamp(t, 0.03, 0.97)) ** 0.5 + 0.4,
      );
      if (i % 3 === 0) p.solid(g, C.woodLit, 0.66, { bark: 0.9 }, 0.55);
      else {
        p.tint(g, C.woodDark, 0.7);
        p.bump(g, 0.46, { bark: 0.9 });
      }
    }
    // The burl with its knot hole.
    const bx = lerp(s.x, x1, 0.74);
    const by = s.y + thick(0.74) * 0.6;
    const burl = chaikin(blob(bx, by, 30, 24, s.x + 5, 0.3, 16), 1);
    p.solid(burl, mix(C.wood, C.woodLit, 0.4), 0.62, { bark: 0.6 }, 0.85);
    dome(p, burl, bx, by, 0.62, 0.1, 3, { bark: 0.6 });
    p.solid(blob(bx + 2, by + 1, 12, 9, s.x + 6, 0.25, 12), C.wood, 0.6, { bark: 0.6 });
    p.solid(blob(bx + 2, by + 2, 7, 5.5, s.x + 7, 0.25, 10), C.woodDark, 0.3);
    // The far end: a knuckle where it snapped, hooked down, with a few torn fibres.
    const kx = s.x + 12;
    const hook = wander(quad(kx + 26, s.y + 30, kx - 6, s.y + 52, kx + 4, y1 + 42, 9), 2.5, s.x + 8, 20);
    limb(p, hook, (t) => 30 * (1 - t) ** 0.7 + 3, wood, 0.6, 0.08, s.x + 8, { bark: 0.8, grain: 3 });
    for (let i = 0; i < 3; i++) {
      const sx = s.x + 6 + i * 9;
      p.solid(
        ribbon(
          [sx + 6, s.y + 24 + i * 6, sx - range(r, 10, 22), s.y + 30 + i * 9 + range(r, -4, 8)],
          (t) => 5 * (1 - t) + 0.7,
        ),
        i % 2 ? C.woodLit : C.wood,
        0.56,
        { bark: 0.8 },
      );
    }
    // Emerald moss in the lee of the burl.
    p.solid(blob(bx - 34, by + 12, 17, 8, s.x + 9, 0.4, 12), tone.dark, 0.64, { moss: 1 }, 0.9);
    trail = 'few';
    bare = 0.4;
    belly = 0.5;
  } else {
    // ---- Two violet stones clutched by roots that come down from above: a great one hanging
    // deep, a lesser one shouldered against it.
    const C = ISLES.deep;
    const split = s.x + s.w * 0.4;
    const stones = [
      { x0: s.x + 4, x1: split + 26, ry: 46, squat: 1.0, seed: s.x + 9, tilt: 0.06, lift: 0.0 },
      { x0: split - 22, x1: x1 - 4, ry: 80, squat: 1.25, seed: s.x + 4, tilt: -0.05, lift: 0.04 },
    ];
    const lows: Array<{ x: number; y: number; x0: number; x1: number }> = [];
    for (const st of stones) {
      const rock = fitUnderTop(
        {
          cx: (st.x0 + st.x1) / 2,
          cy: s.y + 2 + st.ry * 0.5,
          rx: (st.x1 - st.x0) * 0.56,
          ry: st.ry,
          seed: st.seed,
          color: mix(C.stone, C.stoneDark, st.lift ? 0 : 0.2),
          dark: C.stoneDark,
          light: C.stoneLight,
          h: 0.48 + st.lift,
          rise: 0.2,
          topY: s.y + 2,
          squat: st.squat,
          boxy: 2.3,
          rough: 1.15,
          tilt: st.tilt,
          spanX: [st.x0 - 9, st.x1 + 9],
          moss,
          cracks: 1,
          ground: 0,
        },
        st.x0,
        st.x1,
      );
      const outline = paintRock(p, rock);
      let ly = y1;
      let lx = (st.x0 + st.x1) / 2;
      for (let i = 1; i < outline.length; i += 2) {
        if ((outline[i] as number) > ly) {
          ly = outline[i] as number;
          lx = outline[i - 1] as number;
        }
      }
      lows.push({ x: lx, y: ly, x0: st.x0, x1: st.x1 });
    }
    under = (u) => {
      const x = s.x + u * s.w;
      let d = -10;
      for (const l of lows) {
        const q = clamp((x - l.x0) / (l.x1 - l.x0), 0, 1);
        d = Math.max(d, (l.y - y1) * Math.sin(Math.PI * q) ** 0.6 - 4);
      }
      return d;
    };
    // The cleft between the two stones, dark, with moss in its mouth.
    const cleft = ribbon(
      wander([split + 2, s.y + 8, split - 4, s.y + 34, split + 6, s.y + 62], 3, s.x, 14),
      (t) => 7 * (1 - t) ** 0.6 + 1,
    );
    p.tint(cleft, C.stoneDark, 0.85);
    p.bump(cleft, 0.34);
    p.solid(blob(split, s.y + 16, 11, 8, s.x + 3, 0.4, 11), tone.dark, 0.7, { moss: 1 }, 0.9);
    bellyShade(p, s, under, kit, 0.8);
    // Roots: over the rims, down the faces, into the cleft; the longest hang on below the stones.
    const fingers: Array<[number, number, number, number]> = [
      [0.42, 0.44, 1.5, 9],
      [0.7, 0.62, 0.9, 8],
      [0.2, 0.26, 1.25, 8],
      [0.88, 0.76, 1.12, 11],
      [0.05, 0.13, 1.5, 14],
      [0.97, 0.9, 0.8, 13],
    ];
    for (const [i, [u0, u1, f, w0]] of fingers.entries()) {
      const sx = lerp(s.x, x1, u0);
      const exx = lerp(s.x, x1, u1) + range(r, -8, 8);
      const depth = s.h + under(u1);
      const eyy = s.y + depth * f + range(r, -6, 10);
      const out = u0 < 0.5 ? -1 : 1;
      const line = wander(
        cubic(
          sx,
          s.y + 6,
          sx + out * 12,
          lerp(s.y, eyy, 0.35),
          lerp(sx, exx, 0.3) + out * 9,
          lerp(s.y, eyy, 0.75),
          exx,
          eyy,
          16,
        ),
        5,
        s.x + i * 7,
        30,
      );
      const col = mix(C.wood, C.woodLit, i >= 4 ? 0.4 : 0.1);
      root(
        p,
        line,
        w0,
        { col, lit: mix(col, C.woodLit, 0.5), dark: C.woodDark },
        0.74 + (i % 3) * 0.03,
        s.x + i * 3,
        0.85,
        C.stoneDark,
      );
    }
    ropes.push({ x: s.x + 12, y: s.y + 10, w: 17, stout: true, lean: -80 });
    ropes.push({ x: s.x + 30, y: s.y + 10, w: 9, lean: -40 });
    ropes.push({ x: x1 - 10, y: s.y + 10, w: 15, stout: true, lean: 90 });
    ropes.push({ x: x1 - 30, y: s.y + 10, w: 7, lean: 30 });
    trail = 'roots';
    bare = 0.3;
    belly = 0;
  }

  if (ropes.length > 0) info.hangers.push({ ropes, ...(yoke ? { yoke } : {}) });
  if (belly > 0) bellyShade(p, s, under, kit, belly);
  kit.mossCap(p, s.x, x1, s.y, {
    seed: s.x + 2,
    read: kit.highRead,
    lipShade: 0.35,
    drapeL: range(r, 20, 46),
    drapeR: range(r, 20, 46),
    thick: range(r, 9, 13),
    drip: range(r, 16, 28),
    mound: 5,
    bare,
  });
  info.tops.push({ x0: s.x, x1, y: s.y, kind: 'floating', freeL: true, freeR: true });
  info.unders.push({
    x0: s.x + 12,
    x1: x1 - 12,
    y: (x) => y1 + under((x - s.x) / s.w) - 4,
    kind: 'floating',
    trail,
  });
}
