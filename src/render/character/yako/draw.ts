// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Draws Yako from the solved rig and the simulated chains, back to front, as flat cel shapes.
 * Ported from the concept (src/concepts/designs/yako.ts): the same shapes, in the same forward
 * frame, through the rig's base matrix. Limbs, tail and cloth are ribbons built in world space, so
 * their hard shadow and rim always sit on the correct side of the light whichever way he faces.
 */
import { type Cel, type RGB, Rib, rgb } from './cel';
import type { Chain } from './chain';
import {
  BLADE,
  HEAD,
  J_AN_N,
  J_EL_N,
  J_HA_N,
  J_HIP,
  J_HIP_N,
  J_KN_N,
  J_NECK,
  J_SH_N,
  K,
  type Rig,
} from './rig';
import type { Secondary } from './secondary';

// Palette. Fur is warm charcoal-indigo, cloth is cooler and darker, so the two darks separate.
const FUR = rgb(0x40384a);
const FUR_SH = rgb(0x231f30);
const FUR_FAR = rgb(0x2a2536);
const RUST = rgb(0x5a3136);
const PALE = rgb(0xefe4cd);
const PALE_SH = rgb(0xaab0bf);
const INK = rgb(0x0d0b13);
const JACKET = rgb(0x1c2030);
const JACKET_SH = rgb(0x0f111b);
const JACKET_FAR = rgb(0x131520);
const SLEEVE = rgb(0x282d42);
const SLEEVE_SH = rgb(0x151827);
const TEAL = rgb(0x25797d);
const TEAL_SH = rgb(0x14474f);
const TROUSER = rgb(0x3c465a);
const TROUSER_SH = rgb(0x232a3a);
const TROUSER_FAR = rgb(0x252b3b);
const WRAP = rgb(0xa59c86);
const WRAP_SH = rgb(0x5f5f6b);
const WRAP_FAR = rgb(0x646169);
const WRAP_FAR_SH = rgb(0x45444f);
const CRIMSON = rgb(0xbd2530);
const CRIMSON_SH = rgb(0x6f1424);
const CRIMSON_HI = rgb(0xec5a44);
const AMBER = rgb(0xffb52e);
const AMBER_HOT = rgb(0xfff1c0);
const BRONZE = rgb(0xa88555);
const RIM = rgb(0xffd9a2);

const RIM_W = 0.62 * K;

/** Opacity of the authored body shadows: they fade while the somersault has him upside down. */
let shadeA = 1;

const R1 = new Rib();
const RI = new Rib();
const ix = new Float32Array(8);
const iy = new Float32Array(8);
let inN = 0;

/** Ink line scratch: `ib` begins, `ip` adds a local point, `iw` a world point, `ink` draws. */
function ib(): void {
  inN = 0;
}
function ip(p: Cel, x: number, y: number): void {
  p.pt(x, y);
  ix[inN] = p.X;
  iy[inN] = p.Y;
  inN++;
}
function iw(x: number, y: number): void {
  ix[inN] = x;
  iy[inN] = y;
  inN++;
}
/** A tapered ink accent line through the scratch points; `w` in design units. */
function ink(p: Cel, w: number, col: RGB = INK, alpha = 1): void {
  const n = inN;
  RI.clear();
  for (let i = 0; i < n; i++) {
    let ww = w * Math.sin((Math.PI * (i + 0.35)) / (n - 0.3)) ** 0.8;
    if (i === 0) ww = 0.12 * w;
    if (i === n - 1) ww = 0;
    RI.add(ix[i]!, iy[i]!, ww * K);
  }
  RI.build(5);
  RI.band(p, col, alpha);
}
function ink3(r: Rib, s0: number, u0: number, s1: number, u1: number, s2: number, u2: number): void {
  ib();
  r.at(s0, u0);
  iw(r.X, r.Y);
  r.at(s1, u1);
  iw(r.X, r.Y);
  r.at(s2, u2);
  iw(r.X, r.Y);
}

/** What the drawing found out about where things are (world px), for lights and effects. */
export const where = {
  tipX: 0,
  tipY: 0,
  eyeX: 0,
  eyeY: 0,
  charmX: 0,
  charmY: 0,
  headX: 0,
  headY: 0,
  knotX: 0,
  knotY: 0,
};

const TAIL_W = [2.8, 5, 6.9, 8.1, 8.5, 7.9, 6.3, 3.9, 0];

function drawTail(p: Cel, c: Chain, smear: number): void {
  const r = R1.clear();
  const thin = 1 - 0.28 * smear;
  for (let i = 0; i < c.n; i++) r.add(c.rx[i]!, c.ry[i]!, (TAIL_W[i] ?? 0) * K * thin);
  r.build(6);
  const sh = r.shade(p);
  const rw = p.rimW(RIM_W);
  r.band(p, RIM, 1, 0, r.end, -1, 1, 0, 0, 0, p.lx * rw, p.ly * rw);
  r.band(p, FUR);
  // Fur tufts breaking the shadow-side edge: sharp, swept toward the tip.
  for (const s of [1.9, 3.1, 4.3, 5.4]) {
    r.at(s - 0.25, sh * 0.8);
    p.mw(r.X, r.Y);
    r.at(s + 1.25, sh * 1.42);
    p.lw(r.X, r.Y);
    r.at(s + 0.75, sh * 0.8);
    p.lw(r.X, r.Y);
    p.fill(FUR_SH);
  }
  for (const s of [2.6, 4.6]) {
    r.at(s - 0.2, -sh * 0.85);
    p.mw(r.X, r.Y);
    r.at(s + 1.0, -sh * 1.25);
    p.lw(r.X, r.Y);
    r.at(s + 0.7, -sh * 0.85);
    p.lw(r.X, r.Y);
    p.cel(FUR, RIM, RIM_W);
  }
  // Hard shadow with a broken, brushy terminator.
  r.band(p, FUR_SH, 1, 0, r.end, sh, sh * 0.02, sh * 0.2, 2.3, 0.6);
  // Zig-zag fur boundary: rust band, then the pale tip.
  zig(p, r, 4.75, RUST, sh);
  zig(p, r, 5.35, PALE, sh);
  r.band(p, PALE_SH, 1, 6.3, r.end, sh, sh * 0.05, sh * 0.25, 3, 0);
  // Two long ink strokes following the flow of the fur.
  ink3(r, 0.6, -sh * 0.15, 2, -sh * 0.3, 3.6, -sh * 0.2);
  ink(p, 0.5, INK, 0.75);
  ink3(r, 2.6, sh * 0.45, 3.8, sh * 0.6, 4.8, sh * 0.5);
  ink(p, 0.45, INK, 0.8);
  r.at(7.3, 0);
  where.tipX = r.X;
  where.tipY = r.Y;
}

const ZIG: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.85, 0.55],
  [0.2, 0.2],
  [1.0, -0.2],
  [0.3, -0.55],
  [0.9, -1],
];

function zig(p: Cel, r: Rib, s0: number, col: RGB, sh: number): void {
  for (let i = 0; i < ZIG.length; i++) {
    const z = ZIG[i]!;
    r.at(s0 + z[0], z[1] * -sh);
    if (i === 0) p.mw(r.X, r.Y);
    else p.lw(r.X, r.Y);
  }
  r.at(s0 + 1.08, sh);
  p.lw(r.X, r.Y);
  r.at(s0 + 1.08, -sh);
  p.lw(r.X, r.Y);
  p.fill(col);
  r.band(p, col, 1, s0 + 1, r.end);
}

function drawSash(p: Cel, c: Chain, far: boolean, smear: number): void {
  const r = R1.clear();
  const n = c.n;
  const thin = 1 - 0.3 * smear;
  for (let i = 0; i < n; i++)
    r.add(c.rx[i]!, c.ry[i]!, (1.25 + 1.5 * (i / (n - 1)) ** 0.7) * K * thin * (i === n - 1 ? 0.8 : 1));
  r.build(6);
  if (far) {
    r.band(p, CRIMSON_SH);
    return;
  }
  const rw = p.rimW(0.4 * K);
  r.band(p, CRIMSON_HI, 1, 0, r.end, -1, 1, 0, 0, 0, p.lx * rw, p.ly * rw);
  r.band(p, CRIMSON);
  const sh = r.shade(p);
  // The shadow swaps sides as the cloth twists.
  r.band(p, CRIMSON_SH, 1, 0, r.end, sh, sh * 0.15, sh * 0.75, 1.5, 0.4);
}

function drawLeg(p: Cel, rig: Rig, side: number, far: boolean): void {
  const j = rig.j;
  const hx = j[(J_HIP_N + side) * 2]!;
  const hy = j[(J_HIP_N + side) * 2 + 1]!;
  const kx = j[(J_KN_N + side) * 2]!;
  const ky = j[(J_KN_N + side) * 2 + 1]!;
  const ax = j[(J_AN_N + side) * 2]!;
  const ay = j[(J_AN_N + side) * 2 + 1]!;
  const pitch = side === 0 ? rig.pitchN : rig.pitchF;
  const cloth = far ? TROUSER_FAR : TROUSER;
  const clothSh = far ? JACKET_SH : TROUSER_SH;
  const wrap = far ? WRAP_FAR : WRAP;
  const wrapSh = far ? WRAP_FAR_SH : WRAP_SH;
  const fur = far ? FUR_SH : FUR;
  const rim = far ? null : RIM;

  // Bound shin.
  const r = R1.clear();
  r.addP(p, kx + (ax - kx) * 0.32, ky + (ay - ky) * 0.32, 2.8 * K);
  r.addP(p, kx + (ax - kx) * 0.7, ky + (ay - ky) * 0.7, 2.4 * K);
  r.addP(p, ax, ay, 2.0 * K);
  r.build(5);
  r.cel(p, wrap, wrapSh, rim, RIM_W, 0);
  for (const s of [0.55, 1.0, 1.45]) {
    ink3(r, s, -1, s + 0.12, 0, s + 0.28, 1);
    ink(p, 0.32, INK, 0.7);
  }

  // Wrapped foot with a dark paw toe.
  p.push(ax, ay, pitch, 0.9);
  p.M(-2.3, -2.6).Q(-3.7, 1.2, -2.7, 3).L(7, 3).Q(9.9, 2.9, 10.6, 1.3).Q(7.2, -0.3, 2.6, -2.9);
  p.cel(wrap, rim, 0.5 * K);
  p.M(-2.9, 1.2).Q(-3.3, 2.2, -2.7, 3).L(7, 3).L(6.5, 1.7).Q(1, 2.2, -2.9, 1.2);
  p.fill(wrapSh);
  p.M(5.2, 3).L(7, 3).Q(9.9, 2.9, 10.6, 1.3).Q(8.2, 0.1, 5.9, -1.1).L(6.4, 0.9);
  p.fill(fur);
  ib();
  ip(p, 1.2, -2.5);
  ip(p, 1.9, -0.4);
  ip(p, 1.6, 1.6);
  ink(p, 0.3, INK, 0.7);
  p.pop();

  // Loose cropped trouser leg, bloused over the binding.
  r.clear();
  r.addP(p, hx, hy, 4.7 * K);
  r.addP(p, (hx + kx) * 0.5, (hy + ky) * 0.5, 4.5 * K);
  r.addP(p, kx, ky, 3.6 * K);
  r.addP(p, kx + (ax - kx) * 0.26, ky + (ay - ky) * 0.26, 3.5 * K);
  r.addP(p, kx + (ax - kx) * 0.44, ky + (ay - ky) * 0.44, 2.3 * K);
  r.build(6);
  r.cel(p, cloth, clothSh, rim, RIM_W, 0.42);
  if (!far) {
    const sh = r.shade(p);
    // Two decisive fold shapes: a dart behind the knee and one where the cloth gathers at the cuff.
    fold(p, r, sh, 1.55, 2.05, 2.5, 0.1, clothSh);
    fold(p, r, sh, 3.05, 3.4, 3.75, 0.25, clothSh);
    ink3(r, 0.5, -sh * 0.75, 1.2, -sh * 0.3, 1.9, -sh * 0.45);
    ink(p, 0.4);
  }
}

function fold(p: Cel, r: Rib, sh: number, s0: number, s1: number, s2: number, d: number, col: RGB): void {
  r.at(s0, sh);
  p.mw(r.X, r.Y);
  r.at(s1, -sh * d);
  p.lw(r.X, r.Y);
  r.at(s2, sh);
  p.lw(r.X, r.Y);
  p.fill(col);
}

function drawArm(p: Cel, rig: Rig, side: number, far: boolean): void {
  const j = rig.j;
  const sx = j[(J_SH_N + side) * 2]!;
  const sy = j[(J_SH_N + side) * 2 + 1]!;
  const ex = j[(J_EL_N + side) * 2]!;
  const ey = j[(J_EL_N + side) * 2 + 1]!;
  const wx = j[(J_HA_N + side) * 2]!;
  const wy = j[(J_HA_N + side) * 2 + 1]!;
  const grip = rig.grip;
  const cloth = far ? JACKET_FAR : SLEEVE;
  const wrap = far ? WRAP_FAR : WRAP;
  const wrapSh = far ? WRAP_FAR_SH : WRAP_SH;
  const fur = far ? FUR_FAR : FUR;
  const rim = far ? null : RIM;

  // Hand: a compact mitt with three clawed fingers and a thumb; closes to a fist as grip goes to 1.
  p.push(wx, wy, Math.atan2(wy - ey, wx - ex) + (side === 0 ? rig.wristN : rig.wristF), 1.08);
  const reach = 1 - 0.3 * grip;
  p.M(-0.6, -2.2)
    .Q(2.4, -3.1, 4.6 * reach, -2.2)
    .L(7 * reach, -1.3 + grip)
    .L(5.3 * reach, -0.3)
    .L(7.3 * reach, 0.6 + grip)
    .L(5.2 * reach, 1.3)
    .L(6.2 * reach, 2.6 + 0.5 * grip)
    .Q(3, 3.2, 1.4, 2.5)
    .L(-0.6, 2.1);
  p.cel(fur, rim, 0.45 * K);
  p.M(1.3, -2.6)
    .L(3.9, -4.6 + 1.6 * grip)
    .L(3.7, -2.3);
  p.fill(fur);
  if (!far) {
    p.M(-0.6, 2.1)
      .L(1.4, 2.5)
      .Q(3, 3.2, 6.2 * reach, 2.6 + 0.5 * grip)
      .L(4.6 * reach, 1.2)
      .Q(2, 1.5, -0.6, 0.6);
    p.fill(FUR_SH);
  }
  p.pop();

  // Bound forearm (pale, so the arms read at game size), crimson cord on the near wrist.
  const r = R1.clear();
  r.addP(p, ex + (wx - ex) * 0.15, ey + (wy - ey) * 0.15, 2.9 * K);
  r.addP(p, ex + (wx - ex) * 0.6, ey + (wy - ey) * 0.6, 2.6 * K);
  r.addP(p, wx, wy, 2.1 * K);
  r.build(5);
  r.cel(p, wrap, wrapSh, rim, RIM_W, 0.05);
  for (const s of [0.75, 1.15]) {
    ink3(r, s, -1, s + 0.12, 0, s + 0.3, 1);
    ink(p, 0.3, INK, 0.7);
  }
  if (!far) r.band(p, CRIMSON, 1, 1.55, 1.95, -1.12, 1.12);

  // Short flared sleeve with the teal lining showing at the cuff.
  const cx = ex + (wx - ex) * 0.24;
  const cy = ey + (wy - ey) * 0.24;
  r.clear();
  r.addP(p, sx, sy, 3.9 * K);
  r.addP(p, sx + (ex - sx) * 0.55, sy + (ey - sy) * 0.55, 4.4 * K);
  r.addP(p, ex, ey, 4.7 * K);
  r.addP(p, cx, cy, 5.5 * K);
  r.build(6);
  r.cel(p, cloth, far ? JACKET_SH : SLEEVE_SH, rim, RIM_W, 0.15, 0.2, 2, 0);
  r.band(p, far ? TEAL_SH : TEAL, 1, 2.72, 3, -1, 1);
  if (!far) {
    const sh = r.shade(p);
    ink3(r, 0.9, -sh * 0.6, 1.6, -sh * 0.1, 2.2, sh * 0.3);
    ink(p, 0.4);
  }
}

function drawEar(p: Cel, far: boolean): void {
  p.M(-4.6, 1).Q(-5.6, -4, -5.4, -7).L(-3.5, -8.4).L(-5.2, -10.2).Q(-5.2, -17, -2.6, -24).Q(2.6, -13, 5.2, 0);
  p.cel(far ? FUR_FAR : FUR, far ? null : RIM, RIM_W);
  if (!far) {
    // Shadow down the back edge.
    p.M(-4.6, 1)
      .Q(-5.6, -4, -5.4, -7)
      .L(-3.5, -8.4)
      .L(-5.2, -10.2)
      .Q(-5.2, -17, -2.6, -24)
      .Q(-3.6, -12, -2.2, 0);
    p.fill(FUR_SH);
  }
  // Pale inner fur.
  p.M(-0.8, -1.5).Q(-2.6, -9, -1.9, -17.5).Q(2.3, -9, 3.9, -1.5);
  p.fill(far ? PALE_SH : PALE);
  if (!far) {
    p.M(-0.8, -1.5).Q(-2.6, -9, -1.9, -17.5).Q(-0.6, -9, 0.9, -1.5);
    p.fill(PALE_SH);
  }
  // Dark tip with a ragged lower edge.
  p.M(-5.05, -13.5)
    .Q(-4.6, -19, -2.6, -24)
    .Q(-0.2, -19, 1.35, -14)
    .L(-0.5, -16.2)
    .L(-1.7, -13.6)
    .L(-3.2, -16);
  p.fill(INK);
}

function drawHead(p: Cel, rig: Rig, sec: Secondary): void {
  // Far ear, behind the skull.
  p.push(5.2, -23.2, 0.2 + sec.earF, 0.9);
  drawEar(p, true);
  p.pop();

  p.M(20.6, -8.8)
    .Q(14.5, -6.2, 8.5, -4.6)
    .Q(4.5, -2.8, 1.5, -1)
    .L(-2.4, 1.9)
    .L(-4.2, -2)
    .L(-10, 0.6)
    .L(-9.2, -4.6)
    .L(-15.8, -4.8)
    .Q(-11.4, -8, -11.6, -11.5)
    .C(-13.4, -19.5, -8, -26.2, 0, -26.2)
    .C(5, -26.2, 9, -23.4, 10.6, -19.6)
    .Q(11.6, -17.6, 13.8, -16.2)
    .Q(18, -14.6, 21.6, -12.4)
    .Q(23.2, -11.4, 22.5, -9.8)
    .Q(21.8, -8.6, 20.6, -8.8);
  p.cel(FUR, RIM, RIM_W);
  // Shadow shape on the back of the skull.
  p.M(-15.8, -4.8)
    .Q(-11.4, -8, -11.6, -11.5)
    .C(-13.4, -19.5, -8, -26.2, -1.5, -26.2)
    .Q(-7.2, -21, -6.4, -15)
    .L(-3.6, -12.6)
    .L(-7, -8.4);
  p.fill(FUR_SH, shadeA);

  // Pale mask: lower muzzle, cheek and the cheek tufts, with a sharp graphic upper edge.
  p.M(21, -10.6)
    .Q(16.5, -11.6, 12.6, -11.2)
    .Q(8.5, -10.6, 5, -13.2)
    .L(2, -10.8)
    .L(-2.8, -13)
    .L(-6.4, -8.6)
    .L(-15.8, -4.8)
    .L(-9.2, -4.6)
    .L(-10, 0.6)
    .L(-4.2, -2)
    .L(-2.4, 1.9)
    .L(1.5, -1)
    .Q(4.5, -2.8, 8.5, -4.6)
    .Q(14.5, -6.2, 20.6, -8.8);
  p.fill(PALE);
  // Cool shadow under the jaw and on the lower tufts.
  p.M(20.6, -8.8)
    .Q(14.5, -7.5, 9, -6.6)
    .Q(4, -5.6, 0.5, -4.6)
    .L(-3, -6.2)
    .L(-7.4, -5.6)
    .L(-15.8, -4.8)
    .L(-9.2, -4.6)
    .L(-10, 0.6)
    .L(-4.2, -2)
    .L(-2.4, 1.9)
    .L(1.5, -1)
    .Q(4.5, -2.8, 8.5, -4.6)
    .Q(14.5, -6.2, 20.6, -8.8);
  p.fill(PALE_SH, shadeA);

  // Nose and the stern line of the mouth.
  p.M(20.3, -12.6).Q(23.3, -11.9, 22.6, -9.9).Q(21.4, -9.2, 20.3, -10.2).Q(19.8, -11.4, 20.3, -12.6);
  p.fill(INK);
  p.dot(21.8, -11.5, 0.35 * K * HEAD, PALE, 0.8);
  ib();
  ip(p, 20.8, -9.5);
  ip(p, 17, -8.5);
  ip(p, 13.4, -7.4);
  ip(p, 11.8, -6.4);
  ink(p, 0.42);

  // Eye: a narrow amber blade under a heavy lid; the lower edge rises to meet the lid in a blink.
  const open = rig.eye;
  if (open > 0.12) {
    const ly = -13.6 + (1 - open) * -3.6;
    p.M(12.2, -14.1).Q(9.2, -17.9, 5.3, -17.3).Q(8.2, ly, 12.2, -14.1);
    p.fill(AMBER);
    p.M(9.6, -16.9).Q(8.5, -15.6, 9.1, -14.2).Q(10, -15.5, 9.6, -16.9);
    p.fill(INK, open);
    p.dot(10.6, -15.4, 0.42 * K * HEAD, AMBER_HOT);
  }
  // Heavy upper lid / brow, and the dark tear line toward the muzzle.
  p.M(13.3, -13.3).Q(10, -17.2, 4, -18.6).Q(8, -19.4, 11.2, -17.6).Q(12.8, -16, 13.3, -13.3);
  p.fill(INK);
  ib();
  ip(p, 12.6, -14);
  ip(p, 14.6, -12.6);
  ip(p, 17, -11.9);
  ink(p, 0.45);
  ib();
  ip(p, 5.6, -17.2);
  ip(p, 3.6, -16.6);
  ip(p, 2, -15);
  ink(p, 0.4);
  // Cheek fur accents.
  ib();
  ip(p, -1.2, -9.6);
  ip(p, -4, -6.4);
  ip(p, -8.4, -5);
  ink(p, 0.36, INK, 0.6);

  // Near ear, in front of the skull, with a notch in its back edge and a crimson cord at the base.
  p.push(-4.4, -22.6, -0.2 + sec.earN);
  drawEar(p, false);
  p.M(-5.3, -2.2).L(5.2, -1.6).L(5.4, 0.1).L(-5, -0.4);
  p.fill(CRIMSON);
  p.pop();
  // Forelock overlapping the ear base: two sharp tufts.
  p.M(-7.6, -21.4).L(-1.5, -27.6).L(-0.6, -24.4).L(4.4, -27.2).L(4.2, -22.4).Q(-1, -24.6, -7.6, -21.4);
  p.fill(FUR);
}

function drawTorso(p: Cel, rig: Rig, h: number): void {
  const sy = 1 + 0.012 * rig.breath;
  // Jacket.
  p.M(-6.5, 1)
    .Q(-7.6, -5, -6, -9)
    .Q(-9.8, -17, -8.6, -24.5 * sy)
    .Q(-8, -29 * sy, -3, -29.5 * sy)
    .L(4.5, -29 * sy)
    .Q(9, -28 * sy, 9.6, -22 * sy)
    .Q(10, -15, 6.2, -9)
    .Q(7.6, -4, 7, 1);
  p.cel(JACKET, RIM, RIM_W);
  p.M(-6.5, 1)
    .Q(-7.6, -5, -6, -9)
    .Q(-9.8, -17, -8.6, -24.5 * sy)
    .Q(-8, -29 * sy, -3, -29.5 * sy)
    .Q(-5.4, -20, -1.6, -11)
    .Q(-2.4, -4, -1.4, 1);
  p.fill(JACKET_SH, shadeA);
  // Chest blaze in the V of the crossed collar.
  p.M(0.8, -29.6 * sy)
    .L(8, -27.8 * sy)
    .L(5.6, -19.8);
  p.fill(PALE);
  p.M(0.8, -29.6 * sy)
    .L(3.4, -29 * sy)
    .L(5.6, -19.8);
  p.fill(PALE_SH);
  // Teal lining: the overlapping collar edge runs diagonally down into the sash.
  p.M(0, -29.9 * sy)
    .L(1.9, -29.6 * sy)
    .L(6.5, -20.6)
    .L(5.2, -19.2);
  p.fill(TEAL_SH);
  p.M(8.9, -27.4 * sy)
    .L(7, -28.2 * sy)
    .L(-1.6, -10.5)
    .L(0.8, -10.5);
  p.fill(TEAL);
  ib();
  ip(p, 6.8, -27.6 * sy);
  ip(p, 2.6, -19);
  ip(p, -1.8, -10.5);
  ink(p, 0.4);
  // Stand collar at the nape.
  p.M(-5.2, -28.6 * sy)
    .Q(-6.4, -33 * sy, -2.4, -33.4 * sy)
    .L(2.6, -31 * sy)
    .L(1.6, -28.6 * sy);
  p.fill(JACKET);
  p.M(-5.2, -28.6 * sy)
    .Q(-6.4, -33 * sy, -2.4, -33.4 * sy)
    .L(-2.4, -28.6 * sy);
  p.fill(JACKET_SH);
  ib();
  ip(p, 8.6, -21);
  ip(p, 7.6, -15.5);
  ip(p, 5, -11.5);
  ink(p, 0.4, INK, 0.7);

  // Jacket skirt below the sash: asymmetric, longer and pointed at the front, split at the hip.
  const ah = Math.abs(h);
  p.M(-7, -6.4)
    .Q(-9.6 - 1.2 * h, -1, -10.6 - 3.2 * h, 5.4 - 1.2 * ah)
    .L(-3.2 - 1.5 * h, 3.6)
    .L(-0.4, -5);
  p.fill(JACKET_SH);
  p.M(-0.4, -5)
    .L(-3.2 - 1.5 * h, 3.6)
    .L(1.2 - 2 * h, 6.2)
    .L(2.4, -5);
  p.fill(TEAL_SH);
  p.M(7.3, -6.6)
    .Q(9.8 - 0.6 * h, 0, 8.4 - 4.2 * h, 9.6 - 1.6 * ah)
    .L(1.6 - 2.4 * h, 6)
    .L(0.6, -5);
  p.cel(JACKET, RIM, RIM_W);
  p.M(0.6, -5)
    .L(1.6 - 2.4 * h, 6)
    .L(4.2 - 3 * h, 7.6)
    .Q(3.4, 0, 3.6, -5.2);
  p.fill(JACKET_SH);
  p.M(8.4 - 4.2 * h, 9.6 - 1.6 * ah)
    .L(1.6 - 2.4 * h, 6)
    .L(2 - 2.4 * h, 4.9)
    .L(8.3 - 3.8 * h, 8.2 - 1.6 * ah);
  p.fill(TEAL);

  // Wide crimson sash.
  p.M(-7.4, -12.6).Q(0, -10.6, 7.8, -13.2).L(7.5, -6).Q(0, -3.8, -7.2, -5.8);
  p.cel(CRIMSON, CRIMSON_HI, 0.4 * K);
  p.M(-7.4, -12.6).L(-2.6, -11.6).Q(-3.6, -8, -1.2, -4.6).Q(-4, -4.9, -7.2, -5.8);
  p.fill(CRIMSON_SH);
  p.M(-1.2, -4.6).Q(3.5, -4.4, 7.5, -6).L(7.6, -7.4).Q(3, -5.9, -2, -6.2);
  p.fill(CRIMSON_SH);
  ib();
  ip(p, -6.6, -9.4);
  ip(p, 0, -7.8);
  ip(p, 6.8, -9.8);
  ink(p, 0.36, INK, 0.65);
  // Knot at the back.
  p.M(-6.2, -11.4).Q(-10.6, -12.2, -10.2, -8.6).Q(-9.6, -5.6, -6.2, -6.6);
  p.fill(CRIMSON);
  p.M(-10.2, -8.6).Q(-9.6, -5.6, -6.2, -6.6).L(-6.4, -8.4);
  p.fill(CRIMSON_SH);
}

function drawBlade(p: Cel): void {
  // Short blade across the lower back, drawn in torso space: wrapped hilt up and back.
  p.push(BLADE.x, BLADE.y, BLADE.rot);
  p.M(2, -1.5).L(-13, -1.3).Q(-14.6, 0, -13, 1.3).L(2, 1.5);
  p.fill(INK);
  p.M(-7.4, -2.3).L(-6, -2.3).L(-6, 2.3).L(-7.4, 2.3);
  p.fill(BRONZE);
  p.M(-14.4, -1.5).Q(-16.4, 0, -14.4, 1.5).L(-13.2, 1.3).L(-13.2, -1.3);
  p.fill(BRONZE);
  for (const x of [-12, -10.2, -8.6]) {
    p.M(x, -1.3)
      .L(x + 0.8, -1.3)
      .L(x + 0.2, 1.3)
      .L(x - 0.6, 1.3);
    p.fill(TEAL_SH);
  }
  p.pop();
}

function body(p: Cel, rig: Rig): void {
  p.base(rig.ma, rig.mb, rig.mc, rig.md, rig.mtx, rig.mty);
}

function torsoFrame(p: Cel, rig: Rig): void {
  p.push(rig.j[J_HIP * 2]!, rig.j[J_HIP * 2 + 1]!, rig.lean);
  p.warp = rig.curl;
}

/** The whole figure. Fills `where`. */
export function drawYako(p: Cel, rig: Rig, sec: Secondary): void {
  const j = rig.j;
  const up = Math.cos(rig.spinPhi);
  shadeA = up > 0.6 ? 1 : up < -0.2 ? 0 : (up + 0.2) / 0.8;
  drawTail(p, sec.tail, sec.smear);

  body(p, rig);
  torsoFrame(p, rig);
  drawBlade(p);
  p.pop();
  p.pop();

  drawSash(p, sec.sashA, true, sec.smear);
  drawSash(p, sec.sashB, false, sec.smear);
  where.knotX = sec.sashB.rx[0]!;
  where.knotY = sec.sashB.ry[0]!;

  body(p, rig);
  drawArm(p, rig, 1, true);
  drawLeg(p, rig, 1, true);
  drawLeg(p, rig, 0, false);

  torsoFrame(p, rig);
  drawTorso(p, rig, sec.hem);
  p.pop();

  // Charm on a cord from the sash: bronze ring, ember bead, a short crimson tassel.
  const ch = sec.charm;
  const cx = ch.rx[2]!;
  const cy = ch.ry[2]!;
  ib();
  iw(ch.rx[0]!, ch.ry[0]!);
  iw(ch.rx[1]!, ch.ry[1]!);
  iw(cx, cy);
  ink(p, 0.5);
  const swing = Math.atan2(cx - ch.rx[1]!, cy - ch.ry[1]!);
  p.base(1, 0, 0, 1, 0, 0);
  p.push(cx, cy, -swing, K);
  p.M(-0.9, 1).L(0.9, 1).L(1.5, 5.4).L(0.1, 4.4).L(-1.3, 5.6);
  p.fill(CRIMSON);
  p.pop();
  p.dotw(cx, cy, 1.5 * K, BRONZE);
  p.dotw(cx, cy, 0.85 * K, AMBER);
  where.charmX = cx;
  where.charmY = cy;

  body(p, rig);
  const hf = rig.headFlip;
  p.push(j[J_NECK * 2]!, j[J_NECK * 2 + 1]!, rig.headRot * (hf < 0 ? -1 : 1), HEAD * hf, HEAD);
  drawHead(p, rig, sec);
  p.pt(9.4, -15.6);
  where.eyeX = p.X;
  where.eyeY = p.Y;
  p.pt(2, -14);
  where.headX = p.X;
  where.headY = p.Y;
  p.pop();

  drawArm(p, rig, 0, false);
  p.base(1, 0, 0, 1, 0, 0);
}

export const LIGHT = { AMBER, AMBER_HOT, CRIMSON_HI };
