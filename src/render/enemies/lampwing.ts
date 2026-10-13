// biome-ignore-all lint/style/noNonNullAssertion: typed-array and fixed-table maths; indices are in range by construction
/**
 * The lampwing: rig and drawing (into the shared enemies painter, behind the hero). A pale
 * moth-wisp seen from the front: a soft body with a small dark face, two pairs of pale wings with
 * dusky margins and veins beating to either side, two feathery antennae, one dim lamp in its
 * abdomen. The wings run on the sim's `flap` phase; everything else is springs on the sim state.
 */
import type { EnemyState } from '../../sim/state';
import { approach, clamp, noise1, Spring, sat, smoothstep } from '../character/hooded/math';
import { LAMP } from './config';
import type { Painter, RGB, Shade } from './paint';

type V3 = [number, number, number];
const TAU = Math.PI * 2;

function hex(o: V3, h: number): void {
  o[0] = ((h >> 16) & 255) / 255;
  o[1] = ((h >> 8) & 255) / 255;
  o[2] = (h & 255) / 255;
}

function zone(o: V3, c: readonly number[], zw: readonly number[]): void {
  for (let k = 0; k < 3; k++) {
    const sh = 16 - k * 8;
    o[k] =
      (((c[0]! >> sh) & 255) * zw[0]! + ((c[1]! >> sh) & 255) * zw[1]! + ((c[2]! >> sh) & 255) * zw[2]!) /
      255;
  }
}

export class LampRig {
  readonly seed: number;
  private frame = -1;
  private px = 0;
  private py = 0;
  private cx = 0;
  private cy = 0;
  private pf = 0;
  private cf = 0;
  /** Drawn centre (world px), wing-beat phase, and the last drawn position (for the dissolve). */
  x = 0;
  y = 0;
  flap = 0;
  /** Which way it is turned, -1..1 (eased facing). */
  readonly turn = new Spring(1, 14, 0.7);
  /** Body lean, rad. */
  readonly lean = new Spring(0, 13, 0.45);
  /** Antennae lag behind the body, px. */
  readonly lagX = new Spring(0, 16, 0.4);
  readonly lagY = new Spring(0, 16, 0.4);
  /** 0..1 weights, eased. */
  keen = 0;
  slack = 0;
  fold = 0;
  tumble = 0;
  /** Frames into the mode and since the last hit (fractional). */
  mf = 0;
  hitAge = 1e6;
  private hitSeen = -1;
  struck = false;
  /** It was alive and on screen last update (so `gone` can dissolve it once). */
  live = false;
  wasDead = false;
  lastDir = 1;
  lastPower = 1;

  constructor(index: number) {
    let h = (index * 2654435761) >>> 0;
    h ^= h >>> 15;
    this.seed = (h % 1000) / 1000;
  }

  update(e: EnemyState, simFrame: number, alpha: number, dt: number): void {
    const nx = e.x + e.w / 2 + e.rx;
    const ny = e.y + e.h / 2 + e.ry;
    const fresh =
      this.frame < 0 || Math.abs(nx - this.cx) + Math.abs(ny - this.cy) > 90 || simFrame < this.frame;
    if (fresh) {
      this.px = this.cx = nx;
      this.py = this.cy = ny;
      this.pf = this.cf = e.flap;
      this.frame = simFrame;
      this.turn.snap(e.facing);
      this.lean.snap(0);
      this.lagX.snap(0);
      this.lagY.snap(0);
      this.keen = this.slack = this.fold = this.tumble = 0;
      this.hitSeen = e.hitFrame;
    } else if (simFrame !== this.frame) {
      this.px = this.cx;
      this.py = this.cy;
      this.pf = this.cf;
      this.cx = nx;
      this.cy = ny;
      this.cf = e.flap;
      this.frame = simFrame;
    }
    const a = sat(alpha);
    this.x = this.px + (this.cx - this.px) * a;
    this.y = this.py + (this.cy - this.py) * a;
    // The phase wraps at 1: go the short way round.
    let df = this.cf - this.pf;
    if (df < -0.5) df += 1;
    else if (df > 0.5) df -= 1;
    this.flap = this.pf + df * a;
    this.mf = Math.max(0, e.modeFrames + (e.hitstop > 0 ? 0 : a - 1));
    this.hitAge = e.hitFrame < 0 ? 1e6 : Math.max(0, simFrame - e.hitFrame + a - 1);
    this.struck = false;
    if (e.hitFrame !== this.hitSeen) {
      this.hitSeen = e.hitFrame;
      if (e.hitFrame >= 0 && !fresh) this.struck = true;
    }
    this.lastDir = e.hitDir || e.facing;
    this.lastPower = e.hitPower;
    this.wasDead = e.mode === 'dead';
    this.live = true;

    const mode = e.mode;
    const keen = mode === 'curious' || mode === 'pursue';
    this.turn.omega = mode === 'curious' ? 30 : 12;
    this.turn.step(e.facing, dt);
    const leanT =
      mode === 'hurt' || mode === 'dead'
        ? 0
        : clamp(e.vx * LAMP.lean, -LAMP.leanMax, LAMP.leanMax) + (mode === 'curious' ? e.lookX * 0.22 : 0);
    this.lean.step(leanT, dt);
    this.lagX.step(e.vx * 0.55, dt);
    this.lagY.step(e.vy * 0.55, dt);
    this.keen += ((keen ? 1 : 0) - this.keen) * approach(keen ? 16 : 4, dt);
    const slack = mode === 'rest' || mode === 'return';
    this.slack += ((slack ? 1 : 0) - this.slack) * approach(5, dt);
    const fold = mode === 'dead' ? 1 : mode === 'hurt' ? 0.7 : 0;
    this.fold += (fold - this.fold) * approach(mode === 'hurt' ? 40 : mode === 'dead' ? 14 : 9, dt);
    this.tumble += ((mode === 'hurt' ? 1 : 0) - this.tumble) * approach(30, dt);
  }
}

// --- Drawing.

const sh = (c0: V3, c1: V3, rim: number, cool: number, band: number): Shade & { alpha: number } => ({
  c0: c0 as unknown as RGB,
  c1: c1 as unknown as RGB,
  rim,
  cool,
  form: 0,
  band,
  ember: 0,
  alpha: 1,
});

const W = {
  wing0: [0, 0, 0] as V3,
  wing1: [0, 0, 0] as V3,
  body0: [0, 0, 0] as V3,
  body1: [0, 0, 0] as V3,
  dusk: [0, 0, 0] as V3,
  face: [0, 0, 0] as V3,
  eye: [0, 0, 0] as V3,
  lamp: [0, 0, 0] as V3,
  pop: [0, 0, 0] as V3,
};
// The wings' rim is the dusky margin: the painter's rim colours are set to dusk for them.
const SH_WING = sh(W.wing0, W.wing1, 1, 1, 0.42);
const SH_VEIN = sh(W.dusk, W.dusk, 0, 0, 0.5);
const SH_BODY = sh(W.body0, W.body1, 0.2, 0.25, 0.35);
const SH_FACE = sh(W.face, W.face, 0, 0, 0.5);
const SH_EYE = sh(W.eye, W.eye, 0, 0, 0.5);
const SH_ANT = sh(W.body1, W.dusk, 0, 0, 0.5);
const SH_LAMP = sh(W.lamp, W.lamp, 0, 0, 0.5);

/** Wing outlines in wing space: u along the span (0 root .. 1 tip), v across (- = leading edge). */
const FORE_RAW: readonly number[] = [
  0, -0.05, 0.35, -0.2, 0.75, -0.22, 1, -0.1, 1.02, 0.06, 0.8, 0.3, 0.45, 0.37, 0.12, 0.2,
];
const HIND_RAW: readonly number[] = [
  0, -0.02, 0.4, -0.14, 0.85, -0.06, 1, 0.2, 0.82, 0.5, 0.42, 0.56, 0.1, 0.3,
];
/** A closed outline rounded by a Catmull-Rom pass (three points per corner): no facets at zoom. */
function rounded(raw: readonly number[]): number[] {
  const n = raw.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + n - 1) % n) * 2;
    const b = i * 2;
    const c = ((i + 1) % n) * 2;
    const d = ((i + 2) % n) * 2;
    // The root (first point) stays a corner.
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let ax = 0; ax < 2; ax++) {
        const p0 = raw[a + ax]!;
        const p1 = raw[b + ax]!;
        const p2 = raw[c + ax]!;
        const p3 = raw[d + ax]!;
        out.push(
          0.5 *
            (2 * p1 +
              (p2 - p0) * t +
              (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
              (3 * p1 - p0 - 3 * p2 + p3) * t3),
        );
      }
    }
  }
  return out;
}
const FORE: readonly number[] = rounded(FORE_RAW);
const HIND: readonly number[] = rounded(HIND_RAW);
const FORE_VEINS: readonly number[] = [0.95, -0.06, 0.86, 0.2, 0.5, 0.32];
const HIND_VEINS: readonly number[] = [0.92, 0.12, 0.6, 0.48];

let mA = 1;
let mB = 0;
let mC = 0;
let mD = 1;
let mE = 0;
let mF = 0;
function bx(x: number, y: number): number {
  return mA * x + mB * y + mE;
}
function by(x: number, y: number): number {
  return mC * x + mD * y + mF;
}

let toneDark = 0;
let toneLight = 0;
function tone(o: V3): void {
  for (let k = 0; k < 3; k++) {
    const d = o[k]! + (W.dusk[k]! - o[k]!) * toneDark;
    o[k] = d + (W.pop[k]! - d) * toneLight;
  }
}

function wing(
  p: Painter,
  outline: readonly number[],
  veins: readonly number[],
  rootX: number,
  rootY: number,
  side: number,
  ang: number,
  len: number,
  chord: number,
  alpha: number,
  spot: boolean,
): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  // Span points outward and up by `ang`; the chord hangs at right angles to it.
  const ux = side * c * len;
  const uy = -s * len;
  const vx = side * s * len * chord;
  const vy = c * len * chord;
  const n = outline.length / 2;
  let cxl = 0;
  let cyl = 0;
  for (let k = 0; k < n; k++) {
    const u = outline[k * 2]!;
    const v = outline[k * 2 + 1]!;
    const lx = rootX + ux * u + vx * v;
    const ly = rootY + uy * u + vy * v;
    p.px[k] = bx(lx, ly);
    p.py[k] = by(lx, ly);
    cxl += p.px[k]!;
    cyl += p.py[k]!;
  }
  SH_WING.alpha = alpha;
  const tx = rootX + ux;
  const ty = rootY + uy;
  p.shape(n, cxl / n, cyl / n, SH_WING, bx(rootX, rootY), by(rootX, rootY), bx(tx, ty), by(tx, ty));
  SH_VEIN.alpha = alpha * 0.5;
  for (let k = 0; k < veins.length / 2; k++) {
    const u = veins[k * 2]!;
    const v = veins[k * 2 + 1]!;
    const ex = rootX + ux * u * 0.9 + vx * v * 0.9;
    const ey = rootY + uy * u * 0.9 + vy * v * 0.9;
    const mx = rootX + ux * u * 0.5 + vx * v * 0.38;
    const my = rootY + uy * u * 0.5 + vy * v * 0.38;
    p.px[0] = bx(rootX, rootY);
    p.py[0] = by(rootX, rootY);
    p.px[1] = bx(mx, my);
    p.py[1] = by(mx, my);
    p.px[2] = bx(ex, ey);
    p.py[2] = by(ex, ey);
    p.pw[0] = 0.42;
    p.pw[1] = 0.34;
    p.pw[2] = 0.14;
    p.ribbon(3, SH_VEIN, false, false);
  }
  if (spot) {
    // One dusky mark on the fore wing: the family likeness with the hero's eye-spots.
    const lx = rootX + ux * 0.62 + vx * 0.08;
    const ly = rootY + uy * 0.62 + vy * 0.08;
    SH_VEIN.alpha = alpha * 0.7;
    p.ellipse(bx(lx, ly), by(lx, ly), len * 0.075, len * 0.075 * (0.5 + 0.5 * chord), 0, SH_VEIN, 8);
  }
}

/** Draws one lampwing. */
export function drawLampwing(
  p: Painter,
  rig: LampRig,
  e: EnemyState,
  clock: number,
  zw: readonly number[],
): void {
  const L = LAMP;
  const dead = e.mode === 'dead';
  const t = rig.mf;
  const ph = rig.seed * 50;
  const d = clamp(rig.turn.x, -1, 1);
  const ad = Math.abs(d);

  // --- Colours for this zone, then the tone of a hit (dark for the hold, a pale pop after).
  zone(W.wing0, L.wingColor, zw);
  zone(W.wing1, L.wingTip, zw);
  zone(W.body0, L.bodyColor, zw);
  zone(W.lamp, L.lampColor, zw);
  hex(W.dusk, L.color.dusk);
  hex(W.face, L.color.face);
  hex(W.eye, L.color.eye);
  hex(W.pop, L.color.pop);
  for (let k = 0; k < 3; k++) W.body1[k] = W.body0[k]! * 0.62 + W.dusk[k]! * 0.2;
  const age = rig.hitAge;
  toneDark = L.hit.dark * (1 - smoothstep(1.2, 2.8, age));
  toneLight = L.hit.pop * smoothstep(1.4, 3, age) * (1 - smoothstep(3.2, 5.4, age));
  // A dead one greys as it falls.
  if (dead) toneDark = Math.max(toneDark, 0.28 * sat(t / 14));
  tone(W.wing0);
  tone(W.wing1);
  tone(W.body0);
  tone(W.body1);

  // --- Body frame: bob against the stroke, lean into the flight, tumble when struck, spiral when dead.
  const beat = Math.sin(rig.flap * TAU);
  const flying = 1 - rig.fold;
  let ox = rig.x;
  let oy = rig.y + beat * L.bob * flying;
  let rot = rig.lean.x;
  if (e.mode === 'pursue' || e.mode === 'curious') {
    const k = rig.keen * L.wobble;
    ox += noise1(clock * 4.3 + ph, 3) * k;
    oy += noise1(clock * 5.1 + ph, 4) * k * 0.8;
  }
  const dir = e.hitDir || 1;
  if (e.mode === 'hurt') {
    // End over end along the blow, one turn through the tumble, easing out upright.
    const total = Math.max(1, e.modeFrames + e.timer);
    const u = sat(t / total);
    rot += dir * TAU * (1 - (1 - u) * (1 - u));
  } else if (dead) {
    if (e.landed) rot = dir * 1.45;
    else {
      // A falling leaf: it rocks from side to side and slips sideways with each rock.
      const sway = Math.sin(t * 0.36 + ph);
      rot = dir * (0.5 + 0.25 * sat(t / 10)) + sway * 0.75;
      ox += Math.cos(t * 0.36 + ph) * 3.2 * sat(t / 8);
    }
  }
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const sqy = dead && e.landed ? 0.7 : 1;
  mA = cr;
  mB = -sr * sqy;
  mC = sr;
  mD = cr * sqy;
  mE = ox;
  mF = oy + (dead && e.landed ? 9 : 0);

  // --- Wings. The stroke: up and down with `flap`; the hind pair lags; the chord narrows on the
  // upstroke and opens on the downstroke (the figure of eight, seen from the front).
  const slack = 1 - L.slack * rig.slack;
  const mid = (L.up + L.down) / 2;
  const amp = ((L.up - L.down) / 2) * slack * flying;
  const fa = mid + amp * beat + rig.fold * (1.25 - mid) - rig.slack * 0.12;
  const hb = Math.sin((rig.flap - L.hindLag) * TAU);
  const ha = mid - L.hindDrop + amp * 0.85 * hb + rig.fold * (1.0 - mid + L.hindDrop);
  const chordF = 1 - L.twist * Math.cos(rig.flap * TAU) * flying - 0.35 * rig.fold;
  const chordH = 1 - L.twist * Math.cos((rig.flap - L.hindLag) * TAU) * flying - 0.35 * rig.fold;
  const crumple = 1 - 0.3 * rig.fold;
  const keyC = p.keyColor;
  const coolC = p.coolColor;
  const wrap = p.coolWrap;
  p.keyColor = W.dusk as unknown as RGB;
  p.coolColor = W.dusk as unknown as RGB;
  p.coolWrap = 1;
  const shoulderY = -2.5;
  for (let pass = 0; pass < 2; pass++) {
    // Far side first (the side it is turned away from).
    const side = (pass === 0 ? -1 : 1) * (d >= 0 ? 1 : -1) * -1;
    const far = pass === 0;
    const k = far ? 1 - L.farShrink * ad : 1 + 0.06 * ad;
    const alpha = far ? L.farAlpha + (L.wingAlpha - L.farAlpha) * (1 - ad) : L.wingAlpha;
    const rx0 = side * 2.6 + d * 1.2;
    wing(p, HIND, HIND_VEINS, rx0, shoulderY + 2.2, side, ha, L.hind * k * crumple, chordH, alpha, false);
    wing(p, FORE, FORE_VEINS, rx0, shoulderY, side, fa, L.fore * k * crumple, chordF, alpha, true);
  }
  p.keyColor = keyC;
  p.coolColor = coolC;
  p.coolWrap = wrap;

  // --- Body: abdomen with its lamp, thorax, head with a small dark face.
  const B = L.body;
  const droop = 0.25 + 0.3 * rig.slack + 0.4 * rig.fold;
  const abx = -d * (1.2 + droop * 2);
  const aby = 6.2;
  SH_BODY.alpha = 1;
  p.ellipse(bx(abx, aby), by(abx, aby), B.abdomenW, B.abdomenH, rot - d * droop * 0.5, SH_BODY, 12);
  p.ellipse(bx(d * 0.6, -0.6), by(d * 0.6, -0.6), B.thoraxW, B.thoraxH, rot, SH_BODY, 12);
  const hxl = d * 2.2 + e.lookX * 0.8 * rig.keen;
  const hyl = -7.2 + e.lookY * 0.9 * rig.keen;
  p.ellipse(bx(hxl, hyl), by(hxl, hyl), B.head, B.head * 0.94, rot, SH_BODY, 12);

  // --- Antennae: two short feathery plumes, forward when keen, trailing the flight.
  const A = L.antenna;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const spread = 0.55 - 0.25 * rig.keen + 0.35 * rig.slack + 0.5 * rig.fold;
    const ang = -Math.PI / 2 + side * spread + d * 0.3;
    const rx = hxl + side * 1.6;
    const ry = hyl - B.head * 0.7;
    const tx = rx + Math.cos(ang) * A.len - rig.lagX.x + e.lookX * 2.2 * rig.keen;
    const ty = ry + Math.sin(ang) * A.len - rig.lagY.x + e.lookY * 1.5 * rig.keen + 2.5 * rig.slack;
    const mx = (rx + tx) / 2 + side * 1.6;
    const my = (ry + ty) / 2 - 1;
    for (let k = 0; k < 5; k++) {
      const u = k / 4;
      const a0 = (1 - u) * (1 - u);
      const a1 = 2 * u * (1 - u);
      const a2 = u * u;
      const lx = a0 * rx + a1 * mx + a2 * tx;
      const ly = a0 * ry + a1 * my + a2 * ty;
      p.px[k] = bx(lx, ly);
      p.py[k] = by(lx, ly);
      // A feather: thin at the root, widest two thirds along, a point at the tip.
      p.pw[k] = A.w * (0.45 + 1.1 * u * (1 - u) * 2) * (k === 4 ? 0.25 : 1);
    }
    SH_ANT.alpha = 0.95;
    p.ribbon(5, SH_ANT, false, false);
  }

  // --- Face: a small dark mask and two tiny eyes that fix on what draws it.
  const fx = hxl + d * 0.7;
  const fy = hyl + 0.5;
  SH_FACE.alpha = 1;
  p.ellipse(bx(fx, fy), by(fx, fy), B.head * 0.62, B.head * 0.74, rot, SH_FACE, 10);
  const shut = dead ? sat(t / 5) : 0;
  if (shut < 0.9) {
    const lx = e.lookX * 0.75;
    const ly = e.lookY * 0.6;
    SH_EYE.alpha = 1 - shut;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const ex = fx + side * 0.95 + lx * 0.7;
      const ey = fy + 0.35 + ly * 0.8;
      const r = L.eye * (1 + 0.2 * rig.keen);
      p.ellipse(bx(ex, ey), by(ex, ey), r, r * (1 - shut), 0, SH_EYE, 8);
    }
  }

  // --- The lamp: one small dim light low in the abdomen. Brighter when it has seen her; out when it dies.
  const Lm = L.lamp;
  let br = 1 - Lm.pulse * (0.5 + 0.5 * Math.sin(clock * Lm.rate + ph));
  br *= 1 + (Lm.keen - 1) * rig.keen;
  if (e.hp <= 1 && !dead) br *= 0.6 + 0.4 * (noise1(clock * 12 + ph, 7) > -0.2 ? 1 : 0.3);
  if (dead) br *= sat(1 - t / 12) * (0.5 + 0.5 * noise1(clock * 16 + ph, 8));
  br *= 1 - toneDark * 0.7;
  if (br > 0.02) {
    const lx = abx - d * 0.3;
    const ly = aby + 2.2;
    SH_LAMP.alpha = Lm.core * sat(br);
    p.ellipse(bx(lx, ly), by(lx, ly), Lm.r * 0.9, Lm.r, rot, SH_LAMP, 10);
    p.glow(
      bx(lx, ly),
      by(lx, ly),
      Lm.r * Lm.halo,
      W.lamp as unknown as RGB,
      Lm.glow * br,
      Lm.r * Lm.halo,
      0,
      12,
    );
  }
}
