/**
 * Inside the fallen giant (canopy review r18 #1: "a smooth orange gradient wall with three soft diagonal blobs, a ceiling
 * of dark discs"): the heartwood look's deep back and mid plane, painted as the inside of a hollow trunk. Pure painters
 * (layer coordinates); layers/interior.ts bakes what they draw into one texture per plane (a few thousand small marks,
 * drawn once).
 *
 * The deep back, the trunk's far inner wall (parallax 0.86), back to front:
 * - broad fibre ridges along the giant (it lies diagonal across the frame: `heartAngle`), a step lighter and darker;
 * - pools of light on the wall where the beams through the cracks land;
 * - the grain: hundreds of fine broken strands along the trunk that part round every recess and knot (the wood grew
 *   round them), so the lines lead the eye;
 * - eroded recesses: rot has eaten pockets into the wall in steps, one growth ring at a time. Each step is darker,
 *   its up-facing floor lit from the cracks above, its overhang dark: depth you read at a glance, rings that are not a
 *   target (eccentric, elongated along the grain, broken);
 * - knots: a dark eye, rings round it, the grain wrapping;
 * - beetle galleries engraved in the wood (a brood channel across the grain, larval tunnels fanning off it);
 * - punk rot (stipple) and pale mycelium fans;
 * - cracks through to the night, a cold sliver of moonlight in each and a faint beam of it slanting down the wall.
 *
 * The mid plane (parallax 0.93), darker, nearer: the roof shredded into curtains of fibre, heaps of punk rot with splinters
 * behind the walked tops; bracket
 * fungi in small tiers (the largest shelf ~70 px: nothing in it reads as a ledge); curtains of fibre hanging from the
 * roof. Nothing has a lit flat top.
 */
import { strand } from './pf-branch';
import { blob, chaikin, lerp, type Rng, range, rngFor, wobble } from './pf-shape';

type Fillable = { fill(o: { color: number; alpha?: number }): unknown };
export interface PolyG {
  poly(pts: number[]): Fillable;
}
export interface HeartG extends PolyG {
  circle(x: number, y: number, r: number): Fillable;
  rect(x: number, y: number, w: number, h: number): Fillable;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The colours a painter needs (the look's tone, interior.ts `Tone`). */
export interface HeartTone {
  deep: number;
  deepLit: number;
  fog: number;
  nearLit: number;
  grain: number;
}

export const HEART = {
  /** Fibre grain: gap between strands across the grain, a run's length, width, alpha (px). */
  grain: { gap: [7, 20] as const, run: [140, 820] as const, w: [1.2, 3.6] as const, a: [0.1, 0.26] as const },
  /** The far wall's fibre bundles: thickness and the groove between two (px). */
  bundle: { h: [130, 380] as const, groove: [6, 22] as const },
  /** Eroded recesses: one per this much area (px^2); size along / across the grain (px); steps. */
  recess: { per: 420000, u: [220, 760] as const, v: [110, 300] as const, rings: [5, 9] as const },
  /** Knots, beetle galleries, rot patches, mycelium fans: one per this much area. */
  knotPer: 900000,
  cavityPer: 5000000,
  galleryPer: 2600000,
  rotPer: 1500000,
  myceliumPer: 3200000,
  /** Cracks to the night: one per this much back width; their cold light. */
  crackEvery: 1100,
  moon: 0xc8daf0,
  /** The bottom of a recess (warm near-black). */
  black: 0x0a0604,
  /** The beam's warm dust tint where it lands. */
  dust: 0xe8c89a,
  /** Mid plane: the roof's fibre curtains (a band's run and drop, px), heaps behind the tops (spacing), fungus clusters
   *  per area. */
  mid: {
    curtainRun: [260, 900] as const,
    curtainDrop: [90, 320] as const,
    heapEvery: [260, 700] as const,
    fungusPer: 900000,
  },
  /** The fungi's cap and gills. */
  cap: 0xb89468,
  gill: 0x2a1c12,
};

const mixc = (a: number, b: number, t: number): number => {
  const ch = (sh: number) => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** A frame along the grain: u along the giant, v across it, about the back's centre. */
function frame(b: Box, ang: number) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const D = Math.hypot(b.w, b.h) / 2;
  return {
    D,
    ca,
    sa,
    xy: (u: number, v: number): [number, number] => [cx + u * ca - v * sa, cy + u * sa + v * ca],
    uv: (x: number, y: number): [number, number] => [
      (x - cx) * ca + (y - cy) * sa,
      -(x - cx) * sa + (y - cy) * ca,
    ],
  };
}

interface Feature {
  u: number;
  v: number;
  ru: number;
  rv: number;
  /** A great cavity: more steps, a blacker core. */
  great?: boolean;
}

/**
 * Where the grain parts round the features: a line at offset `v` across the grain is pushed away from each feature's
 * centre line, most at its middle. Monotone in v (the push never exceeds the falloff), so lines never cross.
 */
function parted(feats: readonly Feature[], u: number, v: number): number {
  let out = v;
  for (const f of feats) {
    const du = (u - f.u) / (f.ru * 1.5);
    if (du * du > 9) continue;
    const g = Math.exp(-du * du);
    const d = v - f.v;
    const L = f.rv * 1.25;
    out += Math.sign(d || 1) * 0.92 * L * g * Math.exp(-Math.abs(d) / L);
  }
  return out;
}

/** A soft round pool of light: discs from wide and faint to small. */
function pool(
  g: HeartG,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: number,
  a: number,
  seed: number,
): void {
  for (let k = 0; k < 7; k++) {
    const s = 1 - k * 0.13;
    g.poly(chaikin(blob(x, y, rx * s, ry * s, seed + k, 0.18, 16), 1)).fill({ color, alpha: a / 7 });
  }
}

/** The points of a closed polygon whose y is below its centre by more than `k` of its half height (a lower arc). */
function arcs(pts: number[], cy: number, ry: number, lower: boolean, k = 0.15): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i <= n; i++) {
    const x = pts[(i % n) * 2] as number;
    const y = pts[(i % n) * 2 + 1] as number;
    const inArc = lower ? y > cy + k * ry : y < cy - k * ry;
    if (inArc) run.push(x, y);
    else if (run.length) {
      if (run.length >= 6) runs.push(run);
      run = [];
    }
  }
  if (run.length >= 6) runs.push(run);
  return runs;
}

/** The deep back of a heartwood room's back `b` (padded; `b0` the back itself). */
export function drawHeartDeep(g: HeartG, T: HeartTone, b: Box, b0: Box, ang: number, seed: number): void {
  const r = rngFor(seed, b0.x, b0.y, 131);
  const F = frame(b, ang);
  const area = b.w * b.h;
  // (The base fill is the caller's: interior.ts `drawDeepBack`.)

  // Features first (the bundles and the grain part round them).
  const feats: Feature[] = [];
  const nR = Math.round(area / HEART.recess.per);
  const recesses: Feature[] = [];
  for (let k = 0, guard = 0; k < nR && guard < nR * 8; guard++) {
    const u = range(r, -F.D * 0.95, F.D * 0.95);
    const v = range(r, -F.D * 0.8, F.D * 0.8);
    const [x, y] = F.xy(u, v);
    if (x < b.x + 40 || x > b.x + b.w - 40 || y < b.y + 40 || y > b.y + b.h - 40) continue;
    // (Rot eats in patches: a recess near another is likelier.)
    const near = recesses.some((f) => Math.hypot((f.u - u) / 900, (f.v - v) / 600) < 1);
    if (recesses.length && !near && r() < 0.45) continue;
    if (recesses.some((f) => Math.abs(f.u - u) < f.ru + 120 && Math.abs(f.v - v) < f.rv + 80)) continue;
    const f = { u, v, ru: range(r, ...HEART.recess.u) / 2, rv: range(r, ...HEART.recess.v) / 2 };
    recesses.push(f);
    k++;
  }
  // A few great cavities, where the rot has gone deepest.
  for (let k = 0; k < Math.max(1, Math.round(area / HEART.cavityPer)); k++) {
    const u = range(r, -F.D * 0.5, F.D * 0.5);
    const v = range(r, -F.D * 0.4, F.D * 0.4);
    if (recesses.some((f) => Math.abs(f.u - u) < f.ru + 400 && Math.abs(f.v - v) < f.rv + 200)) continue;
    recesses.push({ u, v, ru: range(r, 360, 700), rv: range(r, 160, 300), great: true });
  }
  const knots: Feature[] = [];
  for (let k = 0; k < Math.round(area / HEART.knotPer); k++) {
    const u = range(r, -F.D, F.D);
    const v = range(r, -F.D, F.D);
    if (recesses.some((f) => Math.abs(f.u - u) < f.ru + 80 && Math.abs(f.v - v) < f.rv + 60)) continue;
    knots.push({ u, v, ru: range(r, 26, 60), rv: range(r, 18, 40) });
  }
  feats.push(...recesses, ...knots);

  // The far wall's fibre bundles: rounded ridges along the giant, each lit along its top and shadowed under it, dark
  // grooves between them that run out and start again (the bundles merge and split).
  const along = (v: number, u0: number, u1: number, step: number, off: (u: number) => number): number[] => {
    const out: number[] = [];
    for (let u = u0; u <= u1 + 0.01; u += step) out.push(...F.xy(u, parted(feats, u, v + off(u))));
    return out;
  };
  for (let v = -F.D; v < F.D; ) {
    const h = range(r, ...HEART.bundle.h);
    const sd = seed + Math.round(v * 3);
    const wav = (k: number) => (u: number) =>
      0.18 * h * wobble(u, sd + k, 900) + 0.06 * h * wobble(u, sd + k + 5, 230);
    const top = along(v, -F.D - 300, F.D + 300, 80, wav(0));
    const bot = along(v + h, -F.D - 300, F.D + 300, 80, wav(1));
    const body = [...top];
    for (let q = bot.length / 2 - 1; q >= 0; q--) body.push(bot[q * 2] as number, bot[q * 2 + 1] as number);
    g.poly(body).fill({ color: r() < 0.5 ? T.deepLit : T.grain, alpha: range(r, 0.04, 0.12) });
    // Form: its lower third falls into shadow, its top catches the light (two soft steps each).
    for (const [k0, k1, col, a] of [
      [0.55, 1, T.grain, 0.22],
      [0.75, 1, T.grain, 0.22],
      [0, 0.32, T.deepLit, 0.18],
      [0, 0.14, T.nearLit, 0.12],
    ] as Array<[number, number, number, number]>) {
      const s0 = along(v + h * k0, -F.D - 300, F.D + 300, 80, (u) => lerp(wav(0)(u), wav(1)(u), k0));
      const s1 = along(v + h * k1, -F.D - 300, F.D + 300, 80, (u) => lerp(wav(0)(u), wav(1)(u), k1));
      for (let q = s1.length / 2 - 1; q >= 0; q--) s0.push(s1[q * 2] as number, s1[q * 2 + 1] as number);
      g.poly(s0).fill({ color: col, alpha: a });
    }
    // The groove under it: dark, broken into runs.
    let u = -F.D - range(r, 0, 600);
    while (u < F.D + 300) {
      const len = range(r, 500, 2200);
      const line = along(v + h, u, u + len, 60, wav(1));
      if (line.length >= 6)
        g.poly(strand(line, range(r, ...HEART.bundle.groove), 0.12)).fill({ color: T.grain, alpha: 0.75 });
      u += len + range(r, 80, 500);
    }
    v += h;
  }
  // The wall darkens to the bottom (the light comes in at the top): wavering bands, never a ruled edge.
  for (let k = 0; k < 10; k++) {
    const y0 = b0.y + b0.h * (0.5 + k * 0.05);
    const edge: number[] = [];
    for (let x = b.x; x <= b.x + b.w + 0.01; x += 80) edge.push(x, y0 + 40 * wobble(x, seed + k * 7, 500));
    g.poly([...edge, b.x + b.w, b.y + b.h, b.x, b.y + b.h]).fill({ color: T.grain, alpha: 0.035 });
  }

  // Cracks to the night: where they are decides where the light falls.
  const cracks: Array<{ x: number; y: number; len: number }> = [];
  const nC = Math.max(2, Math.round(b0.w / HEART.crackEvery));
  for (let k = 0; k < nC; k++) {
    const x = b0.x + b0.w * ((k + 0.2 + 0.6 * r()) / nC);
    const y = b0.y + b0.h * range(r, 0.05, 0.24);
    cracks.push({ x, y, len: range(r, 180, 380) });
  }
  // Pools of light on the wall under each crack (the beam's slant: down and a little east).
  for (const c of cracks) {
    const px = c.x + 0.3 * b0.h * 0.45;
    const py = c.y + b0.h * 0.45;
    pool(g, px, py, range(r, 420, 640), range(r, 300, 420), T.deepLit, 0.5, seed + Math.round(c.x));
    pool(
      g,
      c.x + 60,
      c.y + 120,
      260,
      200,
      mixc(T.deepLit, HEART.dust, 0.3),
      0.32,
      seed + Math.round(c.x) + 3,
    );
  }

  // The grain: fine broken strands along the trunk, parting round the features.
  const G = HEART.grain;
  for (let v = -F.D; v < F.D; v += range(r, ...G.gap)) {
    let u = -F.D - range(r, 0, 400);
    while (u < F.D) {
      const len = range(r, ...G.run);
      const line: number[] = [];
      const n = Math.max(3, Math.round(len / 40));
      for (let q = 0; q <= n; q++) {
        const uu = u + (len * q) / n;
        const vv = parted(feats, uu, v + 3 * wobble(uu, seed + Math.round(v), 120));
        line.push(...F.xy(uu, vv));
      }
      const [x0, y0] = [line[0] as number, line[1] as number];
      const inside = x0 > b.x - 900 && x0 < b.x + b.w + 900 && y0 > b.y - 900 && y0 < b.y + b.h + 900;
      if (inside) {
        const lit = r() < 0.42;
        g.poly(strand(line, range(r, ...G.w), 0.25)).fill({
          color: lit ? T.deepLit : T.grain,
          alpha: range(r, ...G.a) * (lit ? 1.1 : 1),
        });
      }
      u += len + range(r, 20, 220);
    }
  }

  // Eroded recesses, ring by ring.
  for (const f of recesses) {
    const [cx, cy] = F.xy(f.u, f.v);
    const rs = Math.round(f.u * 7 + f.v);
    const n = Math.round(range(r, ...HEART.recess.rings)) + (f.great ? 4 : 0);
    // Uneven ring widths (good years and bad).
    const steps: number[] = [];
    let acc = 0;
    for (let k = 0; k < n; k++) {
      const s = range(r, 0.6, 1.4);
      steps.push(s);
      acc += s;
    }
    let t = 0;
    for (let k = 0; k < n; k++) {
      const s = 1 - (t / acc) * 0.86;
      t += steps[k] as number;
      // Each step sits a little higher (the overhang thin, the lit floor below it wide).
      const ox = -F.sa * f.rv * 0.3 * (1 - s);
      const oy = -F.ca * f.rv * 0.3 * (1 - s);
      const rx = f.ru * s;
      const ry = f.rv * s;
      const pts = chaikin(blob(cx + ox, cy + oy, rx, ry, rs + (k % 2), 0.22, 22, ang), 1);
      // Each step down is darker; its floor (the lower crescent) catches the light from the cracks above, its overhang
      // throws a wide crease. (r19: lit contour lines on dark read as a map; a lit fill as a raised plateau.)
      const dk = 0.3 + 0.7 * (k / n) ** 0.7;
      g.poly(pts).fill({ color: mixc(T.deep, HEART.black, dk), alpha: 0.9 });
      const hy = Math.abs(ry * F.ca) + Math.abs(rx * F.sa) * 0.3;
      const stepPx = f.rv * ((steps[k] as number) / acc) * 0.86;
      for (const arc of arcs(pts, cy + oy, hy, true, 0.1)) {
        g.poly(strand(arc, stepPx * 0.9, 0.35)).fill({ color: T.deepLit, alpha: 0.3 * (1 - 0.6 * (k / n)) });
        if (r() < 0.6)
          g.poly(strand(arc, 2, 0.3)).fill({
            color: mixc(T.deepLit, T.nearLit, 0.4),
            alpha: 0.2 * (1 - k / n),
          });
      }
      for (const arc of arcs(pts, cy + oy, hy, false, -0.1)) {
        g.poly(strand(arc, range(r, 6, 12) * (0.6 + 0.4 * s), 0.3)).fill({
          color: mixc(T.grain, HEART.black, dk),
          alpha: 0.5,
        });
      }
    }
    // The core: the deepest dark, a few fibres hanging over it.
    g.poly(
      chaikin(
        blob(cx - F.sa * f.rv * 0.28, cy - F.ca * f.rv * 0.28, f.ru * 0.24, f.rv * 0.2, rs + 7, 0.3, 12, ang),
        1,
      ),
    ).fill({
      color: HEART.black,
      alpha: 0.9,
    });
  }

  // Knots: a dark eye with rings, the grain already wrapping round them.
  for (const f of knots) {
    const [cx, cy] = F.xy(f.u, f.v);
    const rs = Math.round(f.u * 3 + f.v * 5);
    for (let k = 3; k >= 0; k--) {
      const s = 0.35 + k * 0.22;
      const pts = chaikin(blob(cx, cy, f.ru * s, f.rv * s, rs + k, 0.15, 16, ang), 1);
      if (k === 0) g.poly(pts).fill({ color: T.grain, alpha: 0.7 });
      else
        g.poly(strand([...pts, pts[0] as number, pts[1] as number], 2, 0)).fill({
          color: k % 2 ? T.deepLit : T.grain,
          alpha: 0.22,
        });
    }
    // Sap weeping out of the eye, down.
    if (r() < 0.4) {
      const line: number[] = [];
      for (let q = 0; q <= 6; q++)
        line.push(cx + 3 * wobble(q, rs, 3), cy + f.rv * 0.4 + q * range(r, 8, 18));
      g.poly(strand(line, 4, 0.5)).fill({ color: 0xc87a30, alpha: 0.35 });
    }
  }

  // Beetle galleries: a brood channel across the grain, larval tunnels fanning off it along the grain, widening.
  for (let k = 0; k < Math.max(2, Math.round(area / HEART.galleryPer)); k++) {
    const u = range(r, -F.D * 0.7, F.D * 0.7);
    const v = range(r, -F.D * 0.6, F.D * 0.6);
    const [gx, gy] = F.xy(u, v);
    if (gx < b0.x || gx > b0.x + b0.w || gy < b0.y || gy > b0.y + b0.h) continue;
    const len = range(r, 90, 220);
    const main: number[] = [];
    for (let q = 0; q <= 8; q++)
      main.push(...F.xy(u + 6 * wobble(q, k + seed, 2), v - len / 2 + (len * q) / 8));
    const engrave = (line: number[], w: number): void => {
      // A lit lip under the cut (light from above), then the cut.
      g.poly(
        strand(
          line.map((c, i) => (i % 2 ? c + 1.5 : c)),
          w + 1,
          0.2,
        ),
      ).fill({ color: T.deepLit, alpha: 0.22 });
      g.poly(strand(line, w, 0.2)).fill({ color: T.grain, alpha: 0.55 });
    };
    engrave(main, 4);
    const nT = 10 + Math.floor(r() * 14);
    for (let q = 0; q < nT; q++) {
      const vv = v - len / 2 + len * ((q + 0.5) / nT);
      const side = q % 2 ? 1 : -1;
      const tl = range(r, 30, 110);
      const line: number[] = [];
      for (let p = 0; p <= 6; p++) {
        const uu = u + side * (6 + (tl * p) / 6);
        line.push(...F.xy(uu, vv + (p / 6) * side * range(r, -10, 10) + 4 * wobble(uu, q + seed, 20)));
      }
      g.poly(ribbonOut(line, 1.4, 4.5)).fill({ color: T.grain, alpha: 0.45 });
    }
  }

  // Punk rot: soft stipple in patches; pale mycelium fanning through some of them.
  for (let k = 0; k < Math.round(area / HEART.rotPer); k++) {
    const x = b.x + r() * b.w;
    const y = b.y + r() * b.h;
    const rx = range(r, 140, 360);
    const ry = rx * range(r, 0.45, 0.8);
    const nd = Math.round((rx * ry) / 260);
    for (let q = 0; q < nd; q++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      const dx = Math.cos(a) * rx * d;
      const dy = Math.sin(a) * ry * d;
      const lit = r() < 0.35;
      g.circle(x + dx, y + dy, range(r, 1.2, 4.2) * (1 - 0.5 * d)).fill({
        color: lit ? T.deepLit : T.grain,
        alpha: range(r, 0.15, 0.35) * (1 - 0.6 * d),
      });
    }
  }
  for (let k = 0; k < Math.max(1, Math.round(area / HEART.myceliumPer)); k++) {
    const x = b0.x + r() * b0.w;
    const y = b0.y + b0.h * range(r, 0.3, 0.95);
    fan(g, r, x, y, range(r, -Math.PI, 0), range(r, 80, 200), 4, mixc(T.deepLit, 0xf0e6d0, 0.5), 0.14);
  }

  // The cracks themselves: a dark split, a cold sliver of moonlight in it, its glow on the wood round it. (r19: a
  // painted beam down the wall read as a pale post; the beams are live light, layers/interior.ts.)
  for (const c of cracks) {
    const line: number[] = [];
    const [u0, v0] = F.uv(c.x, c.y);
    for (let q = 0; q <= 10; q++) {
      const uu = u0 + (q / 10 - 0.5) * c.len;
      line.push(...F.xy(uu, v0 + 6 * wobble(uu, seed + Math.round(c.x), 60)));
    }
    pool(g, c.x, c.y + 10, c.len * 0.5, 70, mixc(HEART.moon, T.deepLit, 0.5), 0.35, seed + Math.round(c.y));
    g.poly(strand(line, range(r, 16, 26), 0.35)).fill({ color: mixc(T.grain, 0x000000, 0.4), alpha: 0.95 });
    g.poly(strand(line, range(r, 5, 9), 0.4)).fill({ color: HEART.moon, alpha: 0.8 });
    g.poly(strand(line, 2, 0.4)).fill({ color: 0xffffff, alpha: 0.45 });
  }
}

/** A tunnel that widens as it goes (a larva grew along it). */
function ribbonOut(line: number[], w0: number, w1: number): number[] {
  const n = line.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const c = Math.min(n - 1, i + 1);
    let dx = (line[c * 2] as number) - (line[a * 2] as number);
    let dy = (line[c * 2 + 1] as number) - (line[a * 2 + 1] as number);
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = lerp(w0, w1, i / Math.max(1, n - 1)) / 2;
    const x = line[i * 2] as number;
    const y = line[i * 2 + 1] as number;
    left.push(x - dy * w, y + dx * w);
    right.push(x + dy * w, y - dx * w);
  }
  for (let i = n - 1; i >= 0; i--) left.push(right[i * 2] as number, right[i * 2 + 1] as number);
  return left;
}

/** A fan of fine branching threads (mycelium), `depth` forks deep. */
function fan(
  g: PolyG,
  r: Rng,
  x: number,
  y: number,
  a: number,
  len: number,
  depth: number,
  color: number,
  alpha: number,
): void {
  const line: number[] = [x, y];
  let px = x;
  let py = y;
  let aa = a;
  for (let q = 0; q < 6; q++) {
    aa += range(r, -0.3, 0.3);
    px += Math.cos(aa) * (len / 6);
    py += Math.sin(aa) * (len / 6);
    line.push(px, py);
  }
  g.poly(strand(line, 0.6 + depth * 0.4, 0.6)).fill({ color, alpha });
  if (depth > 0)
    for (let k = 0; k < 2; k++) {
      const t = range(r, 0.4, 1);
      const i = Math.min(6, Math.round(t * 6));
      fan(
        g,
        r,
        line[i * 2] as number,
        line[i * 2 + 1] as number,
        aa + (k ? 0.5 : -0.5) + range(r, -0.2, 0.2),
        len * 0.6,
        depth - 1,
        color,
        alpha,
      );
    }
}

/** The mid plane of a heartwood back (padded `b`; `col` / `dark` / `lit` its values between the mass and the fog). */
export function drawHeartMid(
  g: HeartG,
  b: Box,
  tops: ReadonlyArray<readonly [number, number, number]>,
  ceils: ReadonlyArray<readonly [number, number, number]>,
  seed: number,
  col: number,
  dark: number,
  lit: number,
): void {
  const r = rngFor(seed, b.x, b.y, 151);
  const area = b.w * b.h;
  // (r19 first tries: torn slabs floating free read as shadows on the wall, flaps hanging alone as pale posts.) Two
  // things that hang from or stand on the wood, so they read as its own body, a step nearer than the far wall:
  // - the hollow's roof shredded into a curtain of fibre: a ragged band from the top, its lower edge all drips;
  // - heaps of punk rot behind the walked tops, splinters standing out of them at a slant.
  // (Each ceiling over the back, and the back's own top: a curtain hung from the room's top alone was hidden under
  // the roof's mass.)
  const roofs: Array<readonly [number, number, number]> = [[b.x - 100, b.x + b.w + 100, b.y - 40], ...ceils];
  for (const [rx0, rx1, ry] of roofs)
    for (let x0 = rx0 + range(r, -40, 120); x0 < rx1 - 60; ) {
      const run = Math.min(range(r, ...HEART.mid.curtainRun), rx1 + 40 - x0);
      const sd = seed + Math.round(x0);
      const base = range(r, ...HEART.mid.curtainDrop);
      const yTop = ry - 30;
      const edge: number[] = [];
      for (let x = x0; x <= x0 + run; x += range(r, 8, 18)) {
        const t = (x - x0) / run;
        const env = Math.sin(Math.PI * t) ** 0.5;
        const drip = r() < 0.25 ? range(r, 60, 260) : range(r, 0, 40);
        edge.push(x, yTop + (base * (0.55 + 0.45 * wobble(x, sd, 260)) + drip) * env);
      }
      const body = [x0, yTop, ...edge, x0 + run, yTop];
      g.poly(body).fill({ color: col, alpha: 0.96 });
      // Fibres down it: lit on their west edges, dark between.
      for (let k = 2; k < edge.length / 2 - 2; k += 1 + Math.floor(r() * 3)) {
        const x = edge[k * 2] as number;
        const y1 = edge[k * 2 + 1] as number;
        const line = [x, yTop, x + range(r, -6, 6), (yTop + y1) / 2, x + range(r, -10, 10), y1 - 4];
        g.poly(strand(line, range(r, 1.5, 4), 0.4)).fill({
          color: r() < 0.45 ? lit : dark,
          alpha: range(r, 0.3, 0.55),
        });
      }
      // The band's top is in shadow (under the roof); its lower part catches the light from the cracks.
      g.poly([x0, yTop, x0 + run, yTop, x0 + run, yTop + base * 0.35, x0, yTop + base * 0.35]).fill({
        color: dark,
        alpha: 0.5,
      });
      x0 += run + range(r, -60, 260);
    }
  for (const [tx0, tx1, ty] of tops) {
    for (let x = tx0 + range(r, 0, 200); x < tx1; x += range(r, ...HEART.mid.heapEvery)) {
      const w = Math.min(range(r, 160, 420), (tx1 - x) * 1.4);
      if (w < 80) continue;
      const h = range(r, 50, 150);
      const sd = seed + Math.round(x * 7);
      const top: number[] = [];
      for (let q = 0; q <= 20; q++) {
        const t = q / 20;
        const lump = 0.75 + 0.25 * wobble(t * 900, sd, 90);
        top.push(x + w * t, ty - h * Math.sin(Math.PI * t) ** 0.8 * lump);
      }
      g.poly([...top, x + w, ty + 400, x, ty + 400]).fill({ color: col, alpha: 0.96 });
      // Its top catches the light, broken (crumbs, not a rim: a lit line on top would read as a ledge).
      for (let q = 0; q < Math.round(w / 6); q++) {
        const t = r();
        const i = Math.min(20, Math.round(t * 20));
        g.circle(top[i * 2] as number, (top[i * 2 + 1] as number) + range(r, 2, 26), range(r, 1.2, 3.6)).fill(
          {
            color: r() < 0.6 ? lit : dark,
            alpha: range(r, 0.25, 0.6),
          },
        );
      }
      // Splinters standing out of it at a slant (wide and dark: never thorns).
      for (let q = 0; q < 1 + Math.floor(r() * 3); q++) {
        const t = range(r, 0.15, 0.85);
        const i = Math.round(t * 20);
        const bx = top[i * 2] as number;
        const by = (top[i * 2 + 1] as number) + 10;
        const a = -Math.PI / 2 + range(r, -0.6, 0.6);
        const L = range(r, 30, 80);
        const bw = range(r, 14, 28);
        g.poly([
          bx - bw / 2,
          by,
          bx + Math.cos(a) * L * 0.6 - bw * 0.2,
          by + Math.sin(a) * L * 0.6,
          bx + Math.cos(a) * L,
          by + Math.sin(a) * L,
          bx + Math.cos(a) * L * 0.55 + bw * 0.25,
          by + Math.sin(a) * L * 0.55,
          bx + bw / 2,
          by,
        ]).fill({ color: r() < 0.5 ? dark : col, alpha: 0.95 });
      }
    }
  }

  // Bracket fungi: tiers of small shelves out of the wall, each a dome of cap (zoned, a lit rim at its edge) over a
  // dark crescent of gills; small (the largest ~70 px across), so none reads as a ledge.
  for (let k = 0; k < Math.round(area / HEART.mid.fungusPer); k++) {
    const x = b.x + r() * b.w;
    const y = b.y + b.h * range(r, 0.15, 0.9);
    const n = 2 + Math.floor(r() * 3);
    const dir = r() < 0.5 ? -1 : 1;
    for (let q = 0; q < n; q++) {
      const w = range(r, 26, 70) * (1 - q * 0.15);
      const sx = x + dir * q * range(r, 4, 14);
      const sy = y + q * range(r, 22, 40);
      const h = w * 0.34;
      // The cap: from the wall at sx out to sx + dir * w, domed on top, a shallow curve under.
      const top: number[] = [];
      const under: number[] = [];
      for (let p = 0; p <= 12; p++) {
        const t = p / 12;
        const px = sx + dir * w * t;
        top.push(px, sy - h * Math.sqrt(Math.max(0, 1 - t * t)) * 0.9 + h * 0.15 * t);
        under.push(px, sy + h * 0.35 * Math.sqrt(Math.max(0, 1 - t * t)));
      }
      const capPts = [...top];
      for (let p = 12; p >= 0; p--) capPts.push(under[p * 2] as number, under[p * 2 + 1] as number);
      g.poly(capPts).fill({ color: mixc(HEART.cap, col, 0.55), alpha: 0.96 });
      const gill = [...under, ...top.slice(-2)];
      g.poly(gill).fill({ color: HEART.gill, alpha: 0.9 });
      // Zones of growth on the cap, and the lit rim out at its edge.
      for (let z = 1; z <= 2; z++) {
        const zl = top.map((c, i) => (i % 2 ? c + z * h * 0.22 : sx + (c - sx) * (1 - z * 0.12)));
        g.poly(strand(zl.slice(4), 1.4, 0.3)).fill({ color: dark, alpha: 0.35 });
      }
      g.poly(strand(top.slice(10), 2.6, 0.4)).fill({ color: HEART.cap, alpha: 0.7 });
    }
  }
}
