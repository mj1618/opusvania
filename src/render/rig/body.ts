import { BODY, KID } from './look';
import { add, lerpV, scale, sub, type V2, v } from './math';
import type { Pose } from './pose';
import type { Prims } from './prims';
import { type Joints, onHead, onTorso, unit } from './skeleton';

/** What the body needs besides the skeleton: chain points (world) and accent state. */
export interface BodyExtras {
  tail: V2[];
  tailFar: V2[];
  feather: V2[];
  hair: V2[];
  /** Sack root and belly (world). */
  sack: [V2, V2];
  /** Colours of the carried sounds, oldest first (hex). */
  bag: number[];
  bagSlots: number;
  /** Sack glow pulse 0..1 (a take or a throw). */
  sackPulse: number;
  /** Feather colour (dash ready / used / no dash). */
  featherColour: number;
  /** Glove outline override (Counter gold), or null. */
  gloveRim: number | null;
  /** Sound orb held in the throwing hand (levy wind-up), hex or null. */
  heldOrb: number | null;
  frame: number;
}

/** World-space glow shapes (emissive layer). */
export interface Glow {
  circles: { x: number; y: number; r: number; c: number; a: number }[];
  lines: { pts: V2[]; w: number; c: number; a: number }[];
}

function ribbon(pts: readonly V2[], widths: readonly number[]): V2[] {
  const left: V2[] = [];
  const right: V2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)] as V2;
    const b = pts[Math.min(pts.length - 1, i + 1)] as V2;
    const d = unit(a, b);
    const n = v(-d.y, d.x);
    const w = (widths[i] ?? widths[widths.length - 1] ?? 1) / 2;
    const p = pts[i] as V2;
    left.push(add(p, scale(n, w)));
    right.push(add(p, scale(n, -w)));
  }
  return [...left, ...right.reverse()];
}

function ellipsePts(c: V2, d: V2, rx: number, ry: number, n = 12): V2[] {
  const nn = v(-d.y, d.x);
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(add(c, add(scale(d, Math.cos(a) * rx), scale(nn, Math.sin(a) * ry))));
  }
  return out;
}

/** Boxing glove (rig space): a fat mitt along the forearm with a cuff, thumb and highlight. */
function glove(pr: Prims, el: V2, ha: V2, colour: number, far: boolean, rim: number | null): void {
  const d = unit(el, ha);
  const n = v(-d.y, d.x);
  const r = BODY.gloveR * (far ? 0.94 : 1);
  const c = add(ha, scale(d, 2));
  // Wraps (the bandage cuff) at the wrist.
  pr.line([sub(ha, scale(d, 4)), add(ha, scale(d, -1))], BODY.armW + 1.6, far ? 0xcfc3aa : KID.wrap);
  pr.poly(ellipsePts(c, d, r * 1.12, r * 0.98), colour);
  // Thumb bump on the upper side.
  pr.poly(ellipsePts(add(c, add(scale(d, -1.5), scale(n, -r * 0.72))), d, r * 0.55, r * 0.4, 8), colour);
  if (rim !== null) {
    const ring = ellipsePts(c, d, r * 1.12, r * 0.98, 10);
    pr.line([...ring, ring[0] as V2], 1.8, rim, false);
  }
  // Knuckle crease and a hot highlight (reads as leather at 80 px).
  pr.line(
    [add(c, add(scale(d, r * 0.45), scale(n, -r * 0.6))), add(c, add(scale(d, r * 0.5), scale(n, r * 0.5)))],
    1.3,
    KID.gloveDark,
    false,
    0.7,
  );
  pr.circle(
    add(c, add(scale(d, r * 0.2), scale(n, -r * 0.4))),
    r * 0.32,
    KID.gloveHi,
    false,
    far ? 0.45 : 0.8,
  );
}

function arm(pr: Prims, sh: V2, el: V2, ha: V2, far: boolean): void {
  const c = far ? KID.coatFar : KID.coat;
  pr.line([sh, el], BODY.armW + 0.8, c);
  pr.line([el, ha], BODY.armW, c);
}

function leg(pr: Prims, hip: V2, kn: V2, an: V2, far: boolean): void {
  const c = far ? KID.legsFar : KID.legs;
  pr.line([hip, kn], BODY.thighW, c);
  pr.line([kn, an], BODY.shinW, c);
  // Boot: toe points forward, tipped with the shin when the foot is off the ground.
  const shin = unit(kn, an);
  const tip = Math.max(-0.9, Math.min(0.9, Math.atan2(shin.x, shin.y) * 0.6));
  const f = v(Math.cos(tip), -Math.sin(tip));
  const u = v(-f.y, f.x);
  const at = (a: number, b: number): V2 => add(an, add(scale(f, a), scale(u, b)));
  pr.poly([at(-3.5, -5), at(3, -5.5), at(8, -2.5), at(9, 0), at(-4, 0.5)], far ? 0x2a1f1a : KID.boot);
  pr.line([at(-4, 0.4), at(9, 0)], 1.8, KID.sole, false);
}

/**
 * Builds Kid Tallow into `pr` (paint order back to front) and her emissive accents into `glow`.
 * Reads like: flat cap with a feather, high-collared plum bailiff's coat with tails, red gloves on
 * bandaged wrists, and a burlap sack on her back that glows with whatever sounds she carries.
 */
export function buildKid(pr: Prims, j: Joints, pose: Pose, x: BodyExtras, glow: Glow): void {
  const f = x.frame;
  // --- the sack (behind everything) ---
  const [sr, sb] = x.sack;
  const n = x.bag.length;
  const full = n / Math.max(1, x.bagSlots);
  const R = 6.5 + 6 * full + 1.2 * x.sackPulse;
  const sd = unit(sr, sb);
  const sn = v(-sd.y, sd.x);
  const belly = add(sb, scale(sd, R * 0.35));
  const neckP = add(sr, scale(sd, 3));
  // Neck of the sack (tied), then the round belly.
  pr.polyW(
    [
      add(neckP, scale(sn, 3)),
      add(belly, scale(sn, R * 0.95)),
      add(belly, scale(sn, -R * 0.95)),
      add(neckP, scale(sn, -3)),
    ],
    KID.sack,
  );
  pr.circleW(belly, R, KID.sack);
  pr.circleW(add(belly, add(scale(sd, R * 0.35), scale(sn, R * 0.25))), R * 0.62, KID.sackDark, false, 0.55);
  // Stitched patch and seam.
  pr.lineW(
    [add(belly, scale(sn, -R * 0.6)), add(belly, add(scale(sn, -R * 0.1), scale(sd, R * 0.5)))],
    1.2,
    KID.sackStitch,
    false,
    0.8,
  );
  for (let i = 0; i < 3; i++) {
    const c = add(belly, add(scale(sn, -R * 0.55 + i * R * 0.22), scale(sd, R * 0.05 + i * R * 0.15)));
    pr.lineW([add(c, scale(sd, -1.5)), add(c, scale(sd, 1.5))], 1, KID.sackStitch, false, 0.8);
  }
  // Tie and ears.
  pr.circleW(neckP, 2.6, KID.sackDark);
  pr.lineW([neckP, add(sr, add(scale(sd, -3), scale(sn, 4)))], 2.2, KID.sack);
  pr.lineW([neckP, add(sr, add(scale(sd, -2), scale(sn, -4.5)))], 2.2, KID.sack);
  // Sounds: glowing through the weave and peeking out of the mouth.
  for (let i = 0; i < n; i++) {
    const c = x.bag[i] as number;
    const bob = Math.sin(f * 0.12 + i * 2.1) * 1.2;
    const at = add(belly, add(scale(sn, (i - (n - 1) / 2) * R * 0.55), scale(sd, -R * 0.1 + bob)));
    pr.circleW(at, 2.6 + full, c, false, 0.95);
    glow.circles.push({ x: at.x, y: at.y, r: 3.5 + full, c, a: 0.6 });
    const peek = add(neckP, add(scale(sn, (i - (n - 1) / 2) * 3), scale(sd, -2.5 - bob * 0.5)));
    pr.circleW(peek, 2, c, false, 1);
    glow.circles.push({ x: peek.x, y: peek.y, r: 3, c, a: 0.8 });
  }
  if (n > 0) {
    const c0 = x.bag[n - 1] as number;
    const pulse = 0.22 + 0.08 * Math.sin(f * 0.15) + 0.4 * x.sackPulse;
    glow.circles.push({ x: belly.x, y: belly.y, r: R * 1.15, c: c0, a: pulse });
  }

  // --- ponytail (behind the head, on its own spring) ---
  if (x.hair.length > 1) {
    pr.polyW(ribbon(x.hair, [5, 6, 5, 3.5, 1.5]), KID.hair);
    pr.lineW(x.hair.slice(0, 3), 1.2, KID.hairHi, false, 0.8);
    pr.circleW(x.hair[0] as V2, 2.2, KID.hairTie, false);
  }

  // --- far coat tail, far arm (lead), far leg (back) ---
  if (x.tailFar.length > 1) pr.polyW(ribbon(x.tailFar, [7, 6, 5, 3.5, 2]), KID.coatFar);
  arm(pr, j.shF, j.elF, j.haF, true);
  glove(pr, j.elF, j.haF, KID.gloveFar, true, x.gloveRim);
  leg(pr, j.hipB, j.knB, j.anB, true);
  leg(pr, j.hipF, j.knF, j.anF, false);

  // --- near coat tail (with the red lining catching the light) ---
  if (x.tail.length > 1) {
    const rib = ribbon(x.tail, [8, 7.5, 6.5, 5, 2.5]);
    pr.polyW(rib, KID.coat);
    pr.lineW(x.tail.slice(1), 1.6, KID.lining, false, 0.9);
  }

  // --- coat body ---
  const T = (a: number, b: number): V2 => onTorso(j, a, b);
  pr.poly(
    [
      T(27, -5),
      T(23, -9),
      T(8, -8.5),
      T(-10, -10.5),
      T(-12, -3),
      T(-10, 7.5),
      T(6, 7.5),
      T(19, 9),
      T(26, 4.5),
    ],
    KID.coat,
  );
  // High collar standing up behind her jaw.
  pr.poly([T(22, -7), T(34, -9.5), T(32.5, -3.5), T(27, 1.5)], KID.collar);
  // Shading down the back, lapel lining, buttons, the empty title belt.
  pr.line([T(22, -6.5), T(-8, -8.5)], 2.2, KID.coatFar, false, 0.8);
  pr.line([T(24, 5.5), T(10, 6.5), T(-8, 6)], 1.4, KID.lining, false, 0.95);
  pr.line([T(20, 1), T(4, 1.5)], 1.2, KID.coatHi, false, 0.7);
  pr.circle(T(16, 5.2), 1.15, KID.button, false);
  pr.circle(T(11, 5.4), 1.15, KID.button, false);
  pr.line([T(1.5, -9.5), T(1.5, 8)], 3, 0x14111c, false);
  pr.poly([T(3.3, 4.2), T(3.3, 8.8), T(-0.3, 8.8), T(-0.3, 4.2)], KID.button, false, 0.95);
  pr.poly([T(2.4, 5.1), T(2.4, 7.9), T(0.6, 7.9), T(0.6, 5.1)], 0x14111c, false);
  // Sack strap across the chest.
  pr.line([T(25, 3), T(12, -2), T(2, -9)], 2.4, KID.strap, false);

  // --- head ---
  const H = (a: number, b: number): V2 => onHead(j, v(a, b));
  pr.circle(j.head, BODY.headR, KID.skinShade);
  pr.circle(H(4.5, 3.5), 6, KID.skin, false);
  pr.circle(H(8.5, 2), 3.2, KID.skin, false);
  // Eyes: two warm sparks in the shadow of the brim.
  const e = pose.eye;
  const eyes: [V2, number, number][] = [
    [H(4, 0.8), 1.1, 1.9],
    [H(9.8, 0.3), 0.85, 1.6],
  ];
  for (const [p, rx, ry] of eyes) {
    if (e < 0) {
      pr.line([add(p, v(-1.6, -1.6)), p, add(p, v(-1.6, 1.6))], 1.2, KID.eye, false);
    } else {
      const h = Math.max(0.35, ry * e);
      pr.poly(ellipsePts(p, v(1, 0), rx, h, 8), KID.eye, false);
      const w = pr.w(p);
      glow.circles.push({ x: w.x, y: w.y, r: 2.6, c: KID.eyeGlow, a: 0.4 + 0.3 * e });
    }
  }
  // Cap: flat, a touch too big, with a stubby brim; lifts off when she's rocked.
  const lift = pose.capLift;
  const C = (a: number, b: number): V2 => H(a, b - lift);
  pr.poly(
    [
      C(-11, -1),
      C(-12, -5.5),
      C(-8, -10.5),
      C(0, -12.8),
      C(8.5, -11.8),
      C(14, -7.8),
      C(14.5, -4.2),
      C(6, -3.4),
      C(-4, -2),
    ],
    KID.cap,
  );
  pr.poly([C(5, -5), C(18, -3.6), C(18.6, -1.8), C(6, -1.4)], KID.capBand);
  pr.line([C(-10.6, -2.8), C(6.5, -3.8)], 2, KID.capBand, false);
  pr.line([C(-6, -9.8), C(2, -11.6), C(8, -11)], 1.6, KID.capHi, false, 0.9);
  pr.line([C(-2, -12.5), C(4, -4)], 0.9, KID.capBand, false, 0.6);

  // Feather tucked in the cap band (chain in world space); the dash-ready light lives in it.
  if (x.feather.length > 1) {
    const rib = ribbon(x.feather, [2, 4.6, 4.2, 1.5]);
    pr.polyW(rib, x.featherColour);
    pr.lineW(x.feather, 0.8, 0x8a7f6a, false, 0.8);
    if (x.featherColour !== KID.feather && x.featherColour !== KID.featherUsed) {
      const tip = x.feather[x.feather.length - 1] as V2;
      const mid = x.feather[1] as V2;
      glow.lines.push({ pts: x.feather, w: 6, c: x.featherColour, a: 0.75 });
      glow.circles.push({ x: tip.x, y: tip.y, r: 5, c: x.featherColour, a: 0.6 });
      glow.circles.push({ x: mid.x, y: mid.y, r: 4, c: x.featherColour, a: 0.4 });
    }
  }

  // --- near arm (rear hand) in front of everything ---
  arm(pr, j.shB, j.elB, j.haB, false);
  if (x.heldOrb !== null) {
    const o = add(j.haB, scale(unit(j.elB, j.haB), 5));
    pr.circle(o, 4.5, x.heldOrb, false);
    const w = pr.w(o);
    glow.circles.push({ x: w.x, y: w.y, r: 6, c: x.heldOrb, a: 0.7 });
  }
  glove(pr, j.elB, j.haB, KID.glove, false, x.gloveRim);
}

/** Rig-space anchors the chains hang from. */
export function anchors(j: Joints): { tail: V2; tailFar: V2; feather: V2; sack: V2; hair: V2 } {
  return {
    tail: onTorso(j, -6, -8),
    tailFar: onTorso(j, -4, -6),
    hair: onHead(j, v(-8.5, -1)),
    feather: onHead(j, v(-9, -6 - 0)),
    sack: lerpV(onTorso(j, 20, -9), onTorso(j, 16, -11), 0.5),
  };
}
