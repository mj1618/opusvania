// biome-ignore-all lint/style/noNonNullAssertion: typed-array and fixed-table maths; indices are in range by construction
/**
 * The hawkers drawn as dragonflies (Canopy r22: on the lampwing's moth art they read as the friendly moths). Side
 * view: a long thin segmented abdomen with pale bands at its joints, a slanted thorax, a big head that is mostly two
 * huge compound eyes, four long narrow clear wings with dark veins and a dark pterostigma near each tip, legs held
 * forward under the thorax in a basket.
 *
 * Acting (sim: src/sim/enemies/lampwing.ts with the `hawker` row): hovering (hover, perch, rest, return, leave) the
 * wings are a shimmering blur, fore and hind pairs beating in turn; the tell (`curious`): the beat stops dead, all
 * four wings flat and crisp, the abdomen curls under, the body pitches at her and its eyes glow the hunt colour in a
 * quickening count; the dive: straight as a dart along its strike, wings swept back flat, legs reaching; the stall:
 * hanging nose-up, wings flared wide on slow open strokes, eyes dim (her opening); the climb (`pursue`): hard deep
 * strokes; hurt: the flash, one tumble; dead: it falls spinning along the blow (the sim's fall), comes down crumpled
 * with a wing broken and one torn away (Litter), lies, and fades (the renderer keeps the corpse past the sim's).
 *
 * Reads only the sim state. Knobs: `DRAGON` (live: `__enemies.dragons.cfg`).
 */
import type { EnemyState } from '../../sim/state';
import { approach, clamp, hash1, noise1, Spring, sat, smoothstep } from '../character/math';
import type { CameraView, SimView } from '../contract';
import {
  applyTone,
  asRGB,
  Frame,
  groundBelow,
  hexTo,
  hitTone,
  Litter,
  rounded,
  shade,
  toneOut,
  type V3,
} from './insect-kit';
import type { Painter } from './paint';

const TAU = Math.PI * 2;

/** Look and motion knobs of the dragonfly (world px, its own frame: x forward, y down, origin the box centre). */
export const DRAGON = {
  /** Abdomen: length, segments, half-width at the base / waist / club / tip. */
  abd: 44,
  segs: 10,
  abdW: [2.5, 1.55, 1.85, 1.1] as const,
  /** Wing length (fore, hind); far pair's offset (px) and share of alpha. */
  fore: 31,
  hind: 29,
  farOff: [1.4, -1.8] as const,
  farAlpha: 0.65,
  /** Membrane alpha; the hover blur's alpha; the crisp wing's alpha inside the blur. */
  wingAlpha: 0.34,
  blur: 0.11,
  blurWing: 0.45,
  /** Drawn beats per sim beat (an integer keeps the phase continuous), wing angles (rad up from pointing back). */
  beats: 3,
  hover: { mid: 0.78, amp: 0.86, hindLag: 0.5 },
  tell: {
    fore: 0.72,
    hind: 0.4,
    farFore: 0.98,
    farHind: 0.64,
    curl: 1.55,
    beats: 3,
    pow: 1.3,
    low: 0.3,
    peak: 1,
    glow: 0.75,
    glowR: 10,
    back: 4,
    shiver: 0.03,
    /** Share of the body's pitch taken back out of the wings (1 = level in the world). */
    level: 1,
  },
  dive: { fore: 0.12, hind: 0.06, stretch: 0.08, reach: 3, streak: 0.16 },
  stall: { fore: 2.05, hind: 1.72, amp: 0.36, rate: 7, pitch: 0.5, curl: 0.45 },
  climb: { amp: 1.15, pitch: 0.06 },
  /** Drawn this much larger than its frame's px (a 60 px dragonfly was a sliver beside her 80 px). */
  scale: 1.2,
  /** Body pitch per px/f of climb (nose up), and its cap; a bob (px) per beat. */
  pitchV: 0.07,
  pitchMax: 0.5,
  bob: 0.6,
  /** Hit: flash frames, share of the way to the struck dusk. */
  hit: { flash: 5, dark: 0.5 },
  /** Death: spin while it falls (rad/s), gravity after the sim lets the body go (px/s²), lie (s), fade (s). */
  die: { spin: 9, gravity: 1300, lie: 1.9, fade: 0.55, torn: 4.2 },
  color: {
    body: 0x283230,
    bodyLow: 0x0d1312,
    band: 0xd0a248,
    stripe: 0xb89a4e,
    eye: 0x2c6a62,
    eyeLow: 0x0c2624,
    eyeHi: 0xa8e0d0,
    face: 0x8a8a62,
    wing: 0xdbeef3,
    wingTip: 0xb5ced6,
    vein: 0x141a20,
    stigma: 0x120d0a,
    hunt: 0xff4630,
    flash: 0xfff1da,
    dusk: 0x2f2a34,
  },
};

const C = {
  body: [0, 0, 0] as V3,
  bodyLow: [0, 0, 0] as V3,
  band: [0, 0, 0] as V3,
  stripe: [0, 0, 0] as V3,
  eye: [0, 0, 0] as V3,
  eyeLow: [0, 0, 0] as V3,
  eyeHi: [0, 0, 0] as V3,
  face: [0, 0, 0] as V3,
  wing: [0, 0, 0] as V3,
  wingTip: [0, 0, 0] as V3,
  vein: [0, 0, 0] as V3,
  stigma: [0, 0, 0] as V3,
  hunt: [0, 0, 0] as V3,
  flash: [0, 0, 0] as V3,
  dusk: [0, 0, 0] as V3,
};

function loadColors(): void {
  const K = DRAGON.color;
  for (const key of Object.keys(C) as Array<keyof typeof C>) hexTo(C[key], K[key]);
}

const SH_BODY = shade(0.5, 0.3, 0.25, 0.32);
const SH_BAND = shade(0, 0, 0, 0.6);
const SH_EYE = shade(0.6, 0.35, 0.35, 0.3);
const SH_HI = shade(0, 0, 0, 0.6);
const SH_WING = shade(0.85, 0.85, 0, 0.3);
const SH_BLUR = shade(0, 0, 0, 0.5);
const SH_VEIN = shade(0, 0, 0, 0.5);
const SH_LEG = shade(0.2, 0.2, 0, 0.5);

/** Wing outlines: u along the span (0 root .. 1 tip), v across (- = the leading edge), scaled by the length. */
const FORE_W = rounded([
  0, -0.02, 0.15, -0.058, 0.5, -0.072, 0.85, -0.06, 1.0, -0.012, 0.97, 0.045, 0.8, 0.078, 0.45, 0.09, 0.18,
  0.09, 0.04, 0.05,
]);
const HIND_W = rounded([
  0, -0.02, 0.15, -0.062, 0.5, -0.072, 0.85, -0.06, 1.0, -0.012, 0.97, 0.055, 0.8, 0.095, 0.45, 0.13, 0.17,
  0.2, 0.05, 0.14,
]);

/** Wing roots (local): fore, hind. */
const ROOT_F = [10.6, -4.2] as const;
const ROOT_H = [6.6, -3.9] as const;

/**
 * One wing in world space: root (rx, ry), span vector (ux, uy) (its full length), chord vector (vx, vy) per unit v
 * (+ = trailing). `crisp` draws the membrane, veins and pterostigma; the blur fan is drawn by the caller.
 */
function paintWing(
  p: Painter,
  hind: boolean,
  rx: number,
  ry: number,
  ux: number,
  uy: number,
  vx: number,
  vy: number,
  alpha: number,
  broken = 0,
): void {
  if (alpha <= 0.01) return;
  const out = hind ? HIND_W : FORE_W;
  const n = out.length / 2;
  for (let k = 0; k < n; k++) {
    let u = out[k * 2]!;
    const v = out[k * 2 + 1]!;
    let bx = 0;
    let by = 0;
    // (Broken at the node: the outer part bent down at right angles to the chord.)
    if (broken > 0 && u > 0.45) {
      const d = u - 0.45;
      u = 0.45 + d * (1 - 0.4 * broken);
      bx = vx * d * 6 * broken;
      by = vy * d * 6 * broken;
    }
    p.px[k] = rx + ux * u + vx * v + bx;
    p.py[k] = ry + uy * u + vy * v + by;
  }
  SH_WING.c0 = C.wing;
  SH_WING.c1 = C.wingTip;
  SH_WING.alpha = alpha;
  p.shape(n, rx + ux * 0.5 + vx * 0.01, ry + uy * 0.5 + vy * 0.01, SH_WING, rx, ry, rx + ux, ry + uy);
  // The leading edge (costa) dark and firm, one fainter vein down the middle, the node.
  SH_VEIN.c0 = SH_VEIN.c1 = C.vein;
  const brk = (u: number): [number, number] => {
    if (broken <= 0 || u <= 0.45) return [0, 0];
    const d = u - 0.45;
    return [vx * d * 6 * broken - ux * d * 0.4 * broken, vy * d * 6 * broken - uy * d * 0.4 * broken];
  };
  for (let line = 0; line < 2; line++) {
    const v = line === 0 ? -0.058 : 0.012;
    for (let k = 0; k < 4; k++) {
      const u = k === 0 ? 0 : k === 1 ? 0.35 : k === 2 ? 0.7 : 0.98;
      const [ox, oy] = brk(u);
      p.px[k] = rx + ux * u + vx * v * (k === 3 ? 0.4 : 1) + ox;
      p.py[k] = ry + uy * u + vy * v * (k === 3 ? 0.4 : 1) + oy;
      p.pw[k] = line === 0 ? 0.42 - 0.08 * k : 0.24 - 0.04 * k;
    }
    SH_VEIN.alpha = (line === 0 ? 0.85 : 0.45) * Math.min(1, alpha * 2.6);
    p.ribbon(4, SH_VEIN);
  }
  // The pterostigma: a small dark cell on the leading edge near the tip.
  const [sx0, sy0] = brk(0.86);
  const sx = rx + ux * 0.86 + vx * -0.04 + sx0;
  const sy = ry + uy * 0.86 + vy * -0.04 + sy0;
  const L = Math.hypot(ux, uy);
  SH_VEIN.c0 = SH_VEIN.c1 = C.stigma;
  SH_VEIN.alpha = Math.min(1, alpha * 3);
  p.ellipse(sx, sy, L * 0.042, L * 0.016, Math.atan2(uy, ux), SH_VEIN, 8);
}

class DragonRig {
  frame = -1;
  private px = 0;
  private py = 0;
  private cx = 0;
  private cy = 0;
  private pf = 0;
  private cf = 0;
  x = 0;
  y = 0;
  flap = 0;
  vx = 0;
  vy = 0;
  readonly turn = new Spring(1, 36, 0.9);
  mf = 0;
  hitAge = 1e6;
  /** Eased weights of the acting: blurred hover, tell, dive, stall, climb, hurt. */
  blurK = 1;
  tellK = 0;
  diveK = 0;
  stallK = 0;
  climbK = 0;
  hurtK = 0;
  curl = 0;
  pitch = 0;
  back = 0;
  /** Dead: seconds since; its own fall once the sim drops it; landed; seconds lying. */
  deadT = -1;
  dx = 0;
  dy = 0;
  dvx = 0;
  dvy = 0;
  rot = 0;
  spin = 0;
  landed = false;
  landT = 0;
  done = false;
  f = 1;
  /** The way it faced as its dive began: held through the dive (straight down, the sim's facing can flip). */
  private diveF = 0;
  readonly seed: number;
  constructor(index: number) {
    this.seed = hash1(index * 613 + 7);
  }

  update(e: EnemyState, simFrame: number, alpha: number, dt: number): boolean {
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
      this.deadT = -1;
      this.done = false;
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
    let df = this.cf - this.pf;
    if (df < -0.5) df += 1;
    else if (df > 0.5) df -= 1;
    this.flap = this.pf + df * a;
    this.vx = this.cx - this.px;
    this.vy = this.cy - this.py;
    this.mf = Math.max(0, e.modeFrames + (e.hitstop > 0 ? 0 : a - 1));
    this.hitAge = e.hitFrame < 0 ? 1e6 : Math.max(0, simFrame - e.hitFrame + a - 1);
    if (e.mode === 'dive') {
      if (this.diveF === 0) this.diveF = this.turn.x >= 0 ? 1 : -1;
    } else this.diveF = 0;
    this.turn.step(this.diveF || e.facing, dt);
    return fresh;
  }
}

const F = new Frame();

/** What a hawker's sim mode is, for the acting. */
function phase(mode: string): 'hover' | 'tell' | 'dive' | 'stall' | 'climb' | 'hurt' | 'dead' {
  switch (mode) {
    case 'curious':
      return 'tell';
    case 'dive':
      return 'dive';
    case 'stall':
      return 'stall';
    case 'pursue':
    case 'leave':
      return 'climb';
    case 'hurt':
      return 'hurt';
    case 'dead':
      return 'dead';
    default:
      return 'hover';
  }
}

/** The hawkers' renderer: rigs by enemy index, the wings torn off. */
export class DragonArt {
  readonly cfg = DRAGON;
  private readonly rigs: (DragonRig | undefined)[] = [];
  readonly litter = new Litter();
  private loaded = false;

  recolor(): void {
    loadColors();
  }

  /** Once a frame, before the creatures: the torn wings on their way down (drawn under the bodies). */
  begin(p: Painter, dt: number): void {
    if (!this.loaded) {
      loadColors();
      this.loaded = true;
    }
    this.litter.update(dt, (x, y, a, len, _k, fade, flat) => {
      const ux = Math.cos(a) * len;
      const uy = Math.sin(a) * len;
      const vx = -Math.sin(a) * len * flat;
      const vy = Math.cos(a) * len * flat;
      loadColors();
      paintWing(p, true, x - ux * 0.5, y - uy * 0.5, ux, uy, vx, vy, DRAGON.wingAlpha * 1.4 * fade);
    });
  }

  /** One hawker. Returns true if it was drawn. */
  draw(
    p: Painter,
    i: number,
    e: Readonly<EnemyState>,
    dt: number,
    clock: number,
    cam: CameraView,
    sim: SimView,
    halfW: number,
    halfH: number,
  ): boolean {
    let rig = this.rigs[i];
    if (!rig) {
      rig = new DragonRig(i);
      this.rigs[i] = rig;
    }
    if (e.gone && rig.deadT < 0) return false;
    if (rig.done && (e.gone || e.mode === 'dead')) return false;
    if (!e.gone) rig.update(e, sim.frame, sim.alpha, dt);
    if (e.mode === 'dead' && rig.deadT < 0) this.die(rig, e, sim);
    if (rig.deadT >= 0) {
      this.fall(rig, e, dt, sim);
      if (rig.done) return false;
    } else this.act(rig, e, dt, clock);
    const ax = rig.deadT >= 0 ? rig.dx : rig.x;
    const ay = rig.deadT >= 0 ? rig.dy : rig.y;
    if (Math.abs(ax - cam.x) > halfW || Math.abs(ay - cam.y) > halfH) return false;
    const alphaWas = p.alphaK;
    const v0 = p.vertexCount;
    this.paint(p, rig, e, clock);
    p.alphaK = alphaWas;
    if (DRAGON.scale !== 1) p.scaleFrom(v0, ax, ay, DRAGON.scale);
    return true;
  }

  private act(rig: DragonRig, e: Readonly<EnemyState>, dt: number, clock: number): void {
    const D = DRAGON;
    const ph = phase(e.mode);
    const ease = (v: number, t: number, rate: number): number => v + (t - v) * approach(rate, dt);
    rig.blurK = ease(rig.blurK, ph === 'hover' || ph === 'climb' ? 1 : 0, ph === 'tell' ? 40 : 16);
    rig.tellK = ease(rig.tellK, ph === 'tell' ? 1 : 0, ph === 'tell' ? 40 : 14);
    rig.diveK = ease(rig.diveK, ph === 'dive' ? 1 : 0, ph === 'dive' ? 34 : 12);
    rig.stallK = ease(rig.stallK, ph === 'stall' ? 1 : 0, 14);
    rig.climbK = ease(rig.climbK, ph === 'climb' ? 1 : 0, 6);
    rig.hurtK = ease(rig.hurtK, ph === 'hurt' ? 1 : 0, 30);
    const n = Math.max(1, e.modeFrames + e.timer);
    const u = sat(rig.mf / n);
    // Body pitch: level on a hover, nose up as it climbs; at her in the tell; along the strike in the dive.
    const f = rig.turn.x >= 0 ? 1 : -1;
    let pitchT = 0.05 + clamp(-rig.vy * D.pitchV, -D.pitchMax, D.pitchMax) * (1 - rig.tellK);
    if (ph === 'tell' || ph === 'dive') {
      const tdx = (e.targetX - rig.x) * f;
      const tdy = e.targetY - rig.y;
      const at = Math.atan2(-tdy, Math.max(4, tdx));
      pitchT = clamp(at, ph === 'dive' ? -1.45 : -0.9, 0.7);
    } else if (ph === 'stall') pitchT = D.stall.pitch;
    else if (ph === 'climb') pitchT += D.climb.pitch;
    rig.pitch = ease(rig.pitch, pitchT, ph === 'dive' ? 30 : 10);
    const curlT =
      ph === 'tell'
        ? D.tell.curl * smoothstep(0, 0.55, u)
        : ph === 'stall'
          ? D.stall.curl
          : ph === 'hurt'
            ? 0.6
            : 0;
    rig.curl = ease(rig.curl, curlT, ph === 'tell' ? 18 : 10);
    rig.back = ease(rig.back, ph === 'tell' ? D.tell.back * smoothstep(0.2, 1, u) : 0, 12);
    void clock;
  }

  private die(rig: DragonRig, e: Readonly<EnemyState>, sim: SimView): void {
    rig.deadT = 0;
    rig.dx = rig.x;
    rig.dy = rig.y;
    rig.rot = rig.pitch;
    rig.f = rig.turn.x >= 0 ? 1 : -1;
    const dir = e.hitDir || e.facing || 1;
    rig.spin = -dir * rig.f * DRAGON.die.spin * (0.8 + 0.4 * rig.seed);
    rig.landed = false;
    rig.landT = 0;
    // The blow tears a hind wing away: it flutters down on its own.
    const kx = e.knockVx * 60;
    const ky = e.knockVy * 60;
    const wx = rig.x + rig.f * 4;
    const wy = rig.y - 6;
    this.litter.add(
      wx,
      wy,
      kx * 0.5 + dir * 40,
      ky * 0.4 - 70,
      -Math.PI / 2 + rig.f * 0.8,
      DRAGON.hind,
      groundBelow(sim.scene, wx, wy, 900),
      1,
      DRAGON.die.torn,
    );
  }

  /** Dead: the sim's fall while it keeps the body, then its own; spinning; crumpled where it lands. */
  private fall(rig: DragonRig, e: Readonly<EnemyState>, dt: number, sim: SimView): void {
    const D = DRAGON.die;
    rig.deadT += dt;
    const held = !e.gone && e.hitstop > 0;
    if (!e.gone) {
      rig.dx = rig.x;
      rig.dy = rig.y;
      rig.dvx = rig.vx * 60;
      rig.dvy = rig.vy * 60;
      if (e.landed && !rig.landed) {
        rig.landed = true;
        rig.dy = e.y + e.h - 6;
      }
      if (rig.landed) rig.dy = e.y + e.h - 6;
    } else if (!rig.landed) {
      rig.dvy += D.gravity * dt;
      rig.dvx *= 1 - Math.min(1, 1.5 * dt);
      rig.dx += rig.dvx * dt;
      rig.dy += rig.dvy * dt;
      const floor = groundBelow(sim.scene, rig.dx, rig.dy - 10, 900) - 6;
      if (rig.dy >= floor) {
        rig.dy = floor;
        rig.landed = true;
      }
    }
    if (!rig.landed && !held) rig.rot += rig.spin * dt;
    if (rig.landed) {
      rig.landT += dt;
      // It comes to rest on its side, nearly level.
      const rest = Math.round(rig.rot / TAU) * TAU - 0.08;
      rig.rot += (rest - rig.rot) * approach(14, dt);
      if (rig.landT > D.lie + D.fade) rig.done = true;
    }
    if (rig.deadT > 7) rig.done = true;
  }

  private paint(p: Painter, rig: DragonRig, e: Readonly<EnemyState>, clock: number): void {
    const D = DRAGON;
    loadColors();
    const dead = rig.deadT >= 0;
    const ph = dead ? 'dead' : phase(e.mode);
    hitTone(rig.hitAge, e.gone ? 0 : e.hitstop, D.hit.flash, D.hit.dark);
    const flash = toneOut.flash;
    for (const c of [C.body, C.bodyLow, C.band, C.stripe, C.eye, C.eyeLow, C.face, C.vein, C.stigma])
      applyTone(c, C.flash, C.dusk);
    // (The membrane's edge and tint lift toward the flash too: the whole creature lights.)
    for (let k = 0; k < 3; k++) {
      C.wing[k] = C.wing[k]! + (C.flash[k]! - C.wing[k]!) * flash;
      C.vein[k] = C.vein[k]! + (C.flash[k]! - C.vein[k]!) * flash * 0.7;
    }
    if (dead) {
      const g = 0.35 * sat(rig.deadT / 0.4);
      for (const c of [C.body, C.eye, C.band])
        for (let k = 0; k < 3; k++) c[k] = c[k]! + (C.dusk[k]! - c[k]!) * g;
      p.alphaK *= 1 - smoothstep(D.die.lie, D.die.lie + D.die.fade, rig.landT);
    }
    // The tell's count (and a keen glow while it hunts).
    const n = Math.max(1, e.modeFrames + e.timer);
    const u = sat(rig.mf / n);
    let tellP = 0;
    if (ph === 'tell') {
      const tb = D.tell.beats * u ** D.tell.pow;
      const tf = 1 - (tb - Math.floor(tb));
      tellP = D.tell.low + (D.tell.peak - D.tell.low) * tf * tf;
    } else if (ph === 'dive' || ph === 'climb') tellP = e.mode === 'pursue' || ph === 'dive' ? 0.35 : 0;
    const huntK = tellP * (1 - toneOut.dark);
    for (let k = 0; k < 3; k++) {
      C.eye[k] = C.eye[k]! + (C.hunt[k]! - C.eye[k]!) * 0.75 * huntK;
      C.eyeLow[k] = C.eyeLow[k]! + (C.hunt[k]! * 0.45 - C.eyeLow[k]!) * 0.6 * huntK;
    }

    // --- Frame.
    const f0 = dead ? rig.f : rig.turn.x;
    const fs = f0 >= 0 ? 1 : -1;
    const fk = Math.max(0.45, Math.min(1, Math.abs(f0)));
    let ox = dead ? rig.dx : rig.x - fs * rig.back;
    let oy = dead ? rig.dy : rig.y;
    const beatPh = (rig.flap * D.beats - Math.floor(rig.flap * D.beats)) * TAU;
    if (!dead) oy += Math.sin(beatPh) * D.bob * rig.blurK;
    if (ph === 'tell') {
      ox += noise1(clock * 30 + rig.seed * 7, 2) * 0.6;
      oy += noise1(clock * 33 + rig.seed * 5, 3) * 0.5;
    }
    let pitch = dead ? rig.rot : rig.pitch;
    if (ph === 'hurt') {
      const tu = sat(rig.mf / Math.max(1, e.modeFrames + e.timer));
      pitch += -(e.hitDir || 1) * fs * TAU * (1 - (1 - tu) * (1 - tu));
    }
    F.set(ox, oy, fs * fk, pitch, 8.5, 0, 1);
    const stretch = 1 + D.dive.stretch * rig.diveK;

    // --- Wing angles per pair (fore, hind) x (near, far), mixed by the acting weights.
    const H = D.hover;
    const amp = H.amp * (1 + (D.climb.amp - 1) * rig.climbK);
    const sF = Math.sin(beatPh);
    const sH = Math.sin(beatPh + H.hindLag * TAU);
    const T = D.tell;
    const S = D.stall;
    const stl = clock * S.rate + rig.seed * 9;
    const shiver = Math.sin(clock * 60 + rig.seed * 4) * T.shiver;
    // (The tell's wings are held flat in the world, whatever the body's pitch at her.)
    const lvl = rig.pitch * T.level;
    const mixA = (hover: number, tell: number, dive: number, stall: number): number => {
      const w0 = rig.blurK;
      const w1 = rig.tellK;
      const w2 = rig.diveK;
      const w3 = rig.stallK;
      const sum = w0 + w1 + w2 + w3;
      if (sum < 1e-3) return hover;
      return (hover * w0 + tell * w1 + dive * w2 + stall * w3) / sum;
    };
    const ang = [
      mixA(H.mid + amp * sF, T.fore + lvl + shiver, D.dive.fore, S.fore + S.amp * Math.sin(stl)),
      mixA(H.mid - 0.12 + amp * sH, T.hind + lvl - shiver, D.dive.hind, S.hind + S.amp * Math.sin(stl - 0.9)),
      mixA(
        H.mid + 0.12 + amp * sF,
        T.farFore + lvl + shiver,
        D.dive.fore + 0.08,
        S.fore + 0.18 + S.amp * Math.sin(stl),
      ),
      mixA(
        H.mid + amp * sH,
        T.farHind + lvl - shiver,
        D.dive.hind + 0.06,
        S.hind + 0.2 + S.amp * Math.sin(stl - 0.9),
      ),
    ];
    if (ph === 'hurt') {
      ang[0] = 1.5 + 0.4 * Math.sin(clock * 20);
      ang[1] = 0.9;
      ang[2] = 1.7;
      ang[3] = 1.1;
    }
    let broken = 0;
    let tornHind = false;
    if (dead) {
      const limp = rig.landed ? 0 : Math.sin(rig.deadT * 9 + rig.seed * 6) * 0.35;
      const lie = sat(rig.landT / 0.25);
      ang[0] = (0.95 + limp) * (1 - lie) + -0.32 * lie;
      ang[1] = 0.6 + limp * 0.7 - 0.45 * lie;
      ang[2] = 1.25 + limp * 0.5 - 0.6 * lie;
      ang[3] = 0;
      broken = sat(rig.deadT / 0.12);
      tornHind = true;
    }
    const blurA = rig.blurK * (dead ? 0 : 1);

    // Wing frame helpers: span and chord vectors in world for local angle θ at local root.
    const wing = (hind: boolean, far: boolean, theta: number, idx: number): void => {
      const root = hind ? ROOT_H : ROOT_F;
      const rlx = root[0] + (far ? D.farOff[0] : 0);
      const rly = root[1] + (far ? D.farOff[1] : 0);
      const len = (hind ? D.hind : D.fore) * (far ? 0.94 : 1);
      const wx = F.x(rlx, rly);
      const wy = F.y(rlx, rly);
      const alpha = D.wingAlpha * (far ? D.farAlpha : 1);
      // The hover's blur: a pale fan over the whole stroke, and the wing itself, fainter, where it is now.
      if (blurA > 0.02) {
        // (Two layers, the inner one narrower: the blur is densest mid-stroke and thins at its ends.)
        for (let layer = 0; layer < 2; layer++) {
          const span = layer === 0 ? 1 : 0.62;
          const c0 = H.mid + (hind ? -0.12 : 0) + (far ? 0.1 : 0);
          const lo = c0 - amp * span;
          const hi = c0 + amp * span;
          p.px[0] = wx;
          p.py[0] = wy;
          const m = 7;
          for (let k = 0; k < m; k++) {
            const t = lo + ((hi - lo) * k) / (m - 1);
            const lx = rlx - Math.cos(t) * len * 0.96;
            const ly = rly - Math.sin(t) * len * 0.96;
            p.px[k + 1] = F.x(lx, ly);
            p.py[k + 1] = F.y(lx, ly);
          }
          const clx = rlx - Math.cos(c0) * len * 0.55;
          const cly = rly - Math.sin(c0) * len * 0.55;
          SH_BLUR.c0 = C.wing;
          SH_BLUR.c1 = C.wingTip;
          SH_BLUR.alpha = D.blur * 0.62 * blurA * (far ? D.farAlpha : 1);
          p.shape(m + 1, F.x(clx, cly), F.y(clx, cly), SH_BLUR, wx, wy, F.x(clx, cly), F.y(clx, cly));
        }
      }
      const sx = -Math.cos(theta);
      const sy = -Math.sin(theta);
      const cxl = -Math.sin(theta);
      const cyl = Math.cos(theta);
      const ux = F.x(rlx + sx * len, rly + sy * len) - wx;
      const uy = F.y(rlx + sx * len, rly + sy * len) - wy;
      const vx = F.x(rlx + cxl * len, rly + cyl * len) - wx;
      const vy = F.y(rlx + cxl * len, rly + cyl * len) - wy;
      const crispA = alpha * (1 - blurA * (1 - D.blurWing));
      paintWing(p, hind, wx, wy, ux, uy, vx, vy, crispA, idx === 0 ? broken : 0);
    };

    const keyC = p.keyColor;
    const coolC = p.coolColor;
    const wrap = p.coolWrap;
    const setWingLight = (on: boolean): void => {
      if (on) {
        p.keyColor = asRGB(C.wing);
        p.coolColor = asRGB(C.wing);
        p.coolWrap = 1;
      } else {
        p.keyColor = keyC;
        p.coolColor = coolC;
        p.coolWrap = wrap;
      }
    };
    // Far pair behind the body.
    setWingLight(true);
    if (!tornHind) wing(true, true, ang[3]!, 3);
    wing(false, true, ang[2]!, 2);
    setWingLight(false);

    // --- Abdomen: long and thin, segment by segment; curled under in the tell; banded pale at each joint.
    const segs = D.segs;
    const sl = (D.abd / segs) * stretch;
    let hx = 3.2;
    let hy = 0.9;
    let head = Math.PI;
    const ax: number[] = AX;
    const ay: number[] = AY;
    ax[0] = hx;
    ay[0] = hy;
    const kink = dead && rig.landed ? 0.5 : 0;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      head -= (rig.curl / segs) * (0.6 + 0.8 * t);
      head -= Math.sin(clock * 2.6 - k * 0.55 + rig.seed * 6) * 0.018 * rig.blurK;
      if (kink > 0 && k === 5) head -= kink;
      hx += Math.cos(head) * sl;
      hy += Math.sin(head) * sl;
      ax[k] = hx;
      ay[k] = hy;
    }
    const W = D.abdW;
    for (let k = 0; k <= segs; k++) {
      p.px[k] = F.x(ax[k]!, ay[k]!);
      p.py[k] = F.y(ax[k]!, ay[k]!);
      const t = k / segs;
      p.pw[k] =
        t < 0.2
          ? W[0] + (W[1] - W[0]) * (t / 0.2)
          : t < 0.8
            ? W[1] + (W[2] - W[1]) * ((t - 0.2) / 0.6)
            : W[2] + (W[3] - W[2]) * ((t - 0.8) / 0.2);
    }
    SH_BODY.c0 = C.body;
    SH_BODY.c1 = C.bodyLow;
    SH_BODY.alpha = 1;
    p.ribbon(segs + 1, SH_BODY, true, true);
    // Bands at the joints: short bars across the abdomen.
    SH_BAND.c0 = SH_BAND.c1 = C.band;
    SH_BAND.alpha = 0.9;
    for (let k = 2; k < segs; k++) {
      const x0 = ax[k]!;
      const y0 = ay[k]!;
      const tx = ax[k + 1]! - ax[k - 1]!;
      const ty = ay[k + 1]! - ay[k - 1]!;
      const tl = Math.hypot(tx, ty) || 1;
      const w = (k < 2 ? W[0] : W[1] + (W[2] - W[1]) * ((k / segs - 0.2) / 0.6)) * 1.02;
      const nx = (-ty / tl) * w;
      const ny = (tx / tl) * w;
      const bx = (tx / tl) * 0.9;
      const by = (ty / tl) * 0.9;
      p.px[0] = F.x(x0 + nx + bx * 0.2, y0 + ny + by * 0.2);
      p.py[0] = F.y(x0 + nx + bx * 0.2, y0 + ny + by * 0.2);
      p.px[1] = F.x(x0 - nx * 0.4 + bx * 0.2, y0 - ny * 0.4 + by * 0.2);
      p.py[1] = F.y(x0 - nx * 0.4 + bx * 0.2, y0 - ny * 0.4 + by * 0.2);
      p.pw[0] = 0.85;
      p.pw[1] = 0.6;
      p.ribbon(2, SH_BAND);
    }
    // Cerci: a small fork at the tip.
    const tx = ax[segs]! - ax[segs - 1]!;
    const ty = ay[segs]! - ay[segs - 1]!;
    const tl = Math.hypot(tx, ty) || 1;
    SH_LEG.c0 = SH_LEG.c1 = C.bodyLow;
    SH_LEG.alpha = 1;
    for (let j = -1; j <= 1; j += 2) {
      const ex = ax[segs]! + (tx / tl) * 3 + (-ty / tl) * j * 1.3;
      const ey = ay[segs]! + (ty / tl) * 3 + (tx / tl) * j * 1.3;
      p.px[0] = F.x(ax[segs]!, ay[segs]!);
      p.py[0] = F.y(ax[segs]!, ay[segs]!);
      p.px[1] = F.x(ex, ey);
      p.py[1] = F.y(ex, ey);
      p.pw[0] = 0.55;
      p.pw[1] = 0.2;
      p.ribbon(2, SH_LEG);
    }

    // --- Legs: a basket held forward under the thorax; reaching out in the dive; curled dead.
    const reach = D.dive.reach * rig.diveK;
    const LEGS = [
      [11.8, 3.6, 14.8, 7.2, 17.4, 5.0],
      [9.8, 4.2, 12.9, 8.3, 15.8, 6.9],
      [7.6, 4.2, 10.4, 8.8, 14.0, 8.0],
    ] as const;
    for (let pass = 0; pass < 2; pass++) {
      const far = pass === 0;
      for (const L of LEGS) {
        const off = far ? 1.1 : 0;
        const cur = dead ? 0.7 : 0;
        const kx = L[2] + reach * 0.5 - cur * 2;
        const ky = L[3] + reach * 0.2 - cur * 2.5;
        const fx = L[4] + reach - cur * 3.5;
        const fy = L[5] + reach * 0.4 - cur * 3;
        p.px[0] = F.x(L[0] + off, L[1] - off * 0.5);
        p.py[0] = F.y(L[0] + off, L[1] - off * 0.5);
        p.px[1] = F.x(kx + off, ky - off * 0.5);
        p.py[1] = F.y(kx + off, ky - off * 0.5);
        p.px[2] = F.x(fx + off, fy - off * 0.5);
        p.py[2] = F.y(fx + off, fy - off * 0.5);
        p.pw[0] = 0.55;
        p.pw[1] = 0.38;
        p.pw[2] = 0.2;
        SH_LEG.c0 = SH_LEG.c1 = C.bodyLow;
        SH_LEG.alpha = far ? 0.6 : 0.95;
        p.ribbon(3, SH_LEG);
      }
    }

    // --- Thorax: slanted, with a pale stripe on its side.
    SH_BODY.c0 = C.body;
    SH_BODY.c1 = C.bodyLow;
    p.ellipse(F.x(8.6, -0.2), F.y(8.6, -0.2), 6.8 * fk, 5.3, F.rot(-0.42), SH_BODY, 18);
    SH_BAND.c0 = SH_BAND.c1 = C.stripe;
    SH_BAND.alpha = 0.6;
    p.px[0] = F.x(6.2, -4);
    p.py[0] = F.y(6.2, -4);
    p.px[1] = F.x(8.4, -0.4);
    p.py[1] = F.y(8.4, -0.4);
    p.px[2] = F.x(10.6, 3.2);
    p.py[2] = F.y(10.6, 3.2);
    p.pw[0] = 0.4;
    p.pw[1] = 0.75;
    p.pw[2] = 0.4;
    p.ribbon(3, SH_BAND);

    // --- Head: two huge compound eyes (the far one peeking over), a small pale face low at the front.
    SH_EYE.c0 = C.eye;
    SH_EYE.c1 = C.eyeLow;
    SH_EYE.alpha = 1;
    p.ellipse(F.x(18.6, -3.5), F.y(18.6, -3.5), 4.3 * fk, 4.1, F.rot(0.2), SH_EYE, 16);
    SH_HI.c0 = SH_HI.c1 = C.face;
    SH_HI.alpha = 0.95;
    p.ellipse(F.x(22.8, 2.6), F.y(22.8, 2.6), 1.9 * fk, 2.3, F.rot(0.3), SH_HI, 10);
    p.ellipse(F.x(18.3, 0.3), F.y(18.3, 0.3), 5.5 * fk, 5.7, F.rot(0.1), SH_EYE, 20);
    // The eye's sheen: a pale crescent and a few faint facet glints.
    SH_HI.c0 = SH_HI.c1 = C.eyeHi;
    SH_HI.alpha = 0.55 * (1 - toneOut.dark) * (1 - 0.6 * huntK);
    p.ellipse(F.x(17.4, -2.8), F.y(17.4, -2.8), 2.2 * fk, 0.95, F.rot(0.35), SH_HI, 10);
    SH_HI.alpha *= 0.6;
    for (let k = 0; k < 3; k++) {
      const gx = 19.4 + k * 1.1;
      const gy = 0.6 + (k % 2) * 1.3;
      p.ellipse(F.x(gx, gy), F.y(gx, gy), 0.42, 0.42, 0, SH_HI, 6);
    }
    if (huntK > 0.01) {
      const r = T.glowR;
      p.glow(F.x(18.6, -1), F.y(18.6, -1), r, asRGB(C.hunt), T.glow * huntK, r, 0, 16);
      p.glow(F.x(18.6, -1), F.y(18.6, -1), r * 0.45, asRGB(C.hunt), 0.5 * huntK, r * 0.45, 0, 12);
    }

    // Near pair over the body.
    setWingLight(true);
    wing(true, false, ang[1]!, 1);
    wing(false, false, ang[0]!, 0);
    setWingLight(false);

    // The dive: a thin pale streak of air dragged off it.
    if (rig.diveK > 0.3 && !dead && e.hitstop === 0) {
      const sp = Math.hypot(rig.vx, rig.vy);
      if (sp > 2) {
        const l = Math.min(70, sp * 4.5) * rig.diveK;
        const dx = rig.vx / sp;
        const dy = rig.vy / sp;
        p.glow(
          rig.x - dx * l * 0.6,
          rig.y - dy * l * 0.6,
          l * 0.6,
          asRGB(C.wing),
          D.dive.streak * rig.diveK,
          1.4,
          Math.atan2(dy, dx),
          10,
        );
      }
    }
  }
}

const AX: number[] = new Array(16).fill(0);
const AY: number[] = new Array(16).fill(0);
