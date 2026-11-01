// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The jumping spider (`kind: 'jumper'`, src/sim/enemies/jumper.ts): rig and drawing, into the shared enemies
 * painter (behind the hero). Seen from the side, a little turned to us: a compact, furry body (a blocky head-thorax,
 * a round abdomen with pale chevrons), short thick banded legs, pale pedipalps that flick, iridescent green fangs, and
 * the read: **two huge front eyes** (black glass with bright glints that catch the light) plus small side eyes.
 *
 * Acting (all from the sim state, so a load or a re-form just shows): twitchy snaps of the head and of a turn, palps
 * flicking; the notice = the eyes flare and the head snaps to her; the tell = crouched low, rear legs bunched under,
 * front legs raised, a tremble, eyes brightening to a lock; the leap = a stretch, legs thrown wide (front legs
 * reaching); the landing = a squash and a skid; open = splayed, panting, eyes dim; knocked down = on its back, legs
 * kicking; a hit = a warm-white flash (1-2 frames) and a squash along the blow; death = thrown, it flips onto its back
 * in the air, legs curl in, it lies a moment and fades. Knobs: `JUMP` (`__enemies.jump` in the page).
 */
import type { EnemyState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import { approach, clamp, hash1, ik2, ikOut, Spring, sat, smoothstep } from '../character/math';
import type { Painter, Shade } from './paint';

type V3 = [number, number, number];

/** Look and acting knobs (render px at the creature's 1x, seconds). */
export const JUMP = {
  /** Drawn size against the 1x layout (the sim's box is 50 x 34). */
  scale: 1.15,
  color: {
    body: 0x3b302b,
    bodyLow: 0x18131a,
    fur: 0x6a5848,
    pale: 0xeee2c8,
    eye: 0x05060a,
    eyeRing: 0x3f97b0,
    glint: 0xffffff,
    fang: 0x1fa58c,
    fangGlint: 0xb8fff0,
    palp: 0xf1e6cc,
    legNear: 0x30261f,
    legFar: 0x17120f,
    band: 0x8f7c66,
    flash: 0xfff2dc,
    hunt: 0xffd27a,
    shadow: 0x020306,
  },
  /** Body: head-thorax and abdomen half sizes and centres (feet-centre origin, +x forward, y down). */
  head: { x: 7, y: -18, rx: 12.5, ry: 11.5 },
  abd: { x: -13, y: -17, rx: 13, ry: 12 },
  /** The big front eyes (near / far), the small side eyes, their glints. */
  eyes: { r: 6.2, rFar: 5.5, x: 17, y: -20, glint: 0.4 },
  /** Hairs round the outline (count, length, width). */
  fur: { head: 26, abd: 48, len: 1.9, w: 0.7 },
  /** Legs: hips along the head's underside (x), rest feet (x) on the ground, bone lengths, widths. */
  legs: {
    hip: [14, 9, 3, -2],
    foot: [33, 20, -9, -27],
    l1: [13, 12, 12, 15],
    l2: [14, 12, 12, 16],
    w: [4.4, 3.4, 3.3, 3.8],
    farDx: 4,
  },
  /** A head twitch: how often (s), how far it snaps (px), how fast. */
  twitch: { every: 0.55, px: 2.2, rate: 46 },
  /** The tell: crouch depth px, tremble px, how far the rear feet bunch in, front legs raised px. */
  /** The tell (its beats are the sim's `tuning.jumper.tellBeats`: the ticks sound on them). */
  tell: { crouch: 10, tremble: 1.1, bunch: 15, raise: 3, beatFade: 9 },
  /** Hit: flash frames, squash. */
  hit: { flash: 5, squash: 0.28 },
  /** Death: frames to flip, frames it fades over at the end of the sim's body time. */
  death: { flip: 9, fade: 28 },
};

const C = {
  body: [0, 0, 0] as V3,
  bodyLow: [0, 0, 0] as V3,
  fur: [0, 0, 0] as V3,
  pale: [0, 0, 0] as V3,
  eye: [0, 0, 0] as V3,
  eyeRing: [0, 0, 0] as V3,
  glint: [0, 0, 0] as V3,
  fang: [0, 0, 0] as V3,
  fangGlint: [0, 0, 0] as V3,
  palp: [0, 0, 0] as V3,
  legNear: [0, 0, 0] as V3,
  legFar: [0, 0, 0] as V3,
  band: [0, 0, 0] as V3,
  flash: [0, 0, 0] as V3,
  hunt: [0, 0, 0] as V3,
  shadow: [0, 0, 0] as V3,
};
function hex(o: V3, h: number): void {
  o[0] = ((h >> 16) & 255) / 255;
  o[1] = ((h >> 8) & 255) / 255;
  o[2] = (h & 255) / 255;
}
/** Re-reads `JUMP.color` (after a live edit). */
export function loadJumpColors(): void {
  for (const k of Object.keys(C) as Array<keyof typeof C>) hex(C[k], JUMP.color[k]);
}
loadJumpColors();

/** A shade with its own colour slots (mixed per frame toward the flash). */
function shade(rim: number, cool: number, form: number, band: number): Shade & { c0: V3; c1: V3 } {
  return { c0: [0, 0, 0], c1: [0, 0, 0], rim, cool, form, band };
}
const SH_ABD = shade(0.55, 0.35, 0.3, 0.35);
const SH_HEAD = shade(0.6, 0.35, 0.3, 0.3);
const SH_LEG_N = shade(0.5, 0.3, 0.2, 0.4);
const SH_LEG_F = shade(0.2, 0.15, 0.1, 0.4);
const SH_FUR = shade(0.45, 0.3, 0, 0.5);
const SH_PALE = shade(0.25, 0.1, 0.1, 0.4);
/** The abdomen's dashes: pale, but less than the crescent (dots in a row read as polka). */
const SH_MARK = shade(0.2, 0.1, 0.1, 0.4);
const SH_EYE = shade(0.15, 0.55, 0.05, 0.22);
const SH_FANG = shade(0.4, 0.2, 0.25, 0.3);
const SH_PALP = shade(0.3, 0.15, 0.1, 0.4);
const SH_BAND = shade(0.2, 0.1, 0.05, 0.4);

/** Mixes `src` toward the flash by `k` into `out`. */
function lit(out: V3, src: V3, k: number, dim = 1): V3 {
  for (let i = 0; i < 3; i++) out[i] = (src[i]! + (C.flash[i]! - src[i]!) * k) * dim;
  return out;
}

export class JumperRig {
  readonly seed: number;
  private frame = -1;
  private px = 0;
  private py = 0;
  private cx = 0;
  private cy = 0;
  /** Drawn feet centre. */
  x = 0;
  y = 0;
  /** The ground under it (feet y while it stands; the last ground while in the air). */
  ground = 0;
  /** Facing, -1..1 (a quick snap, not a slow swing: it is twitchy). */
  readonly turn = new Spring(1, 38, 0.9);
  /** The head's twitch offset (px) and its target. */
  readonly head = new Spring(0, JUMP.twitch.rate, 0.75);
  private headT = 0;
  private twitchSlot = -1;
  /** Crouch 0..1 (the tell), splay 0..1 (open), flight 0..1, on its back 0..1 (rolled). */
  readonly crouch = new Spring(0, 26, 1);
  readonly splay = new Spring(0, 16, 1);
  readonly flight = new Spring(0, 30, 1);
  readonly roll = new Spring(0, 14, 0.8);
  /** Squash (signed: + = flattened), as a spring that rings on a landing or a blow. */
  readonly squash = new Spring(0, 30, 0.45);
  /** Its eyes' flare 0..1 (aware / the tell's lock), and where they look (world px). */
  flare = 0;
  /** The tell's beat (1 on a beat, falling off). */
  beat = 0;
  lookX = 0;
  lookY = 0;
  /** Body pitch (rad, + = nose up), from its flight. */
  pitch = 0;
  /** Frames into its mode (interpolated), frames since its last hit. */
  mf = 0;
  hitAge = 1e6;
  private hitSeen = -1;
  private mode = '';
  /** Set for one draw: it just left the ground (a leap), just landed, is skidding. For the renderer's dust. */
  leapNew = false;
  landNew = false;
  skid = false;
  landK = 0;
  /** The renderer's dust clock (skid dust). */
  dustT = 0;
  /** The palps' flick phase. */
  palp = 0;
  /** Dead: frames since death; alpha. */
  deadF = 0;
  fade = 1;

  constructor(i: number) {
    this.seed = hash1(i * 7919 + 17);
  }

  update(
    e: EnemyState,
    simFrame: number,
    alpha: number,
    dt: number,
    clock: number,
    herX: number,
    herY: number,
  ) {
    const nx = e.x + e.w / 2;
    const ny = e.y + e.h;
    const fresh =
      this.frame < 0 || Math.abs(nx - this.cx) + Math.abs(ny - this.cy) > 160 || simFrame < this.frame;
    const was = this.mode;
    if (fresh) {
      this.px = this.cx = nx;
      this.py = this.cy = ny;
      this.frame = simFrame;
      this.turn.snap(e.facing);
      this.head.snap(0);
      this.crouch.snap(0);
      this.splay.snap(0);
      this.flight.snap(0);
      this.roll.snap(e.mode === 'dead' ? 1 : 0);
      this.squash.snap(0);
      this.hitSeen = e.hitFrame;
      this.ground = ny;
      this.lookX = e.lookX;
      this.lookY = e.lookY;
      this.deadF = e.mode === 'dead' ? 99 : 0;
    } else if (simFrame !== this.frame) {
      this.px = this.cx;
      this.py = this.cy;
      this.cx = nx;
      this.cy = ny;
      this.frame = simFrame;
    }
    const a = sat(alpha);
    this.x = this.px + (this.cx - this.px) * a;
    this.y = this.py + (this.cy - this.py) * a;
    this.mf = Math.max(0, e.modeFrames + (e.hitstop > 0 ? 0 : a - 1));
    this.hitAge = e.hitFrame < 0 ? 1e6 : Math.max(0, simFrame - e.hitFrame + a - 1);
    const air = !e.landed || e.mode === 'charge' || e.mode === 'back' || e.mode === 'fall';
    if (!air && e.mode !== 'skitter') this.ground = this.y;
    this.leapNew = false;
    this.landNew = false;
    if (!fresh && was !== e.mode) {
      if (e.mode === 'charge' || e.mode === 'back') this.leapNew = true;
      // (Down again: a pounce, a hop back, a fall.)
      if (
        (was === 'charge' || was === 'back' || was === 'fall' || (was === 'hurt' && this.flight.x > 0.3)) &&
        !air
      ) {
        this.landNew = true;
        this.landK = was === 'charge' ? 1 : was === 'back' ? 0.6 : 0.8;
        this.squash.v += 9 * this.landK;
      }
      if (e.mode === 'windup') this.squash.v += 2.5;
    }
    this.mode = e.mode;
    if (e.hitFrame !== this.hitSeen && e.hitFrame >= 0) {
      this.hitSeen = e.hitFrame;
      this.squash.v += 10;
    }

    // --- Facing: a snap. The head twitches on its own beat while it watches.
    this.turn.step(e.facing, dt);
    const dead = e.mode === 'dead';
    const watching = e.mode === 'hunt' || e.mode === 'sit' || e.mode === 'skitter' || e.mode === 'windup';
    const slot = Math.floor((clock + this.seed * 3) / (JUMP.twitch.every * (e.chase > 0 ? 0.7 : 1.3)));
    if (slot !== this.twitchSlot) {
      this.twitchSlot = slot;
      this.headT = watching ? (hash1(slot * 13 + Math.floor(this.seed * 999)) - 0.5) * 2 * JUMP.twitch.px : 0;
    }
    this.head.step(e.mode === 'windup' ? 0 : this.headT, dt);
    this.palp += dt * (e.chase > 0 ? 9 : 4);

    // --- Eyes: on her while it knows her, else wandering ahead; flared while aware, brightest locking in the tell.
    const knows = e.chase > 0 && !dead;
    const tx = knows ? herX : this.x + e.facing * 200;
    const ty = knows ? herY : this.y - 30;
    this.lookX += (tx - this.lookX) * approach(18, dt);
    this.lookY += (ty - this.lookY) * approach(18, dt);
    const tellK = e.mode === 'windup' ? sat(this.mf / Math.max(1, this.mf + e.timer)) : 0;
    // (The tell is counted in the eyes: a flare on each beat, quickening, the last one the lock.)
    let beat = 0;
    if (e.mode === 'windup')
      for (const b of tuning.jumper.tellBeats)
        if (tellK >= b) beat = Math.max(beat, Math.exp(-(tellK - b) * JUMP.tell.beatFade));
    this.beat = beat;
    const flareT =
      dead || e.mode === 'recover' ? 0 : e.mode === 'windup' ? 0.55 + 0.45 * beat : knows ? 0.35 : 0;
    this.flare += (flareT - this.flare) * approach(flareT > this.flare ? 40 : 6, dt);

    // --- Poses.
    this.crouch.step(e.mode === 'windup' ? 0.35 + 0.65 * smoothstep(0, 0.8, tellK) : 0, dt);
    const open = e.mode === 'recover' || (e.mode === 'hurt' && e.landed);
    this.splay.step(open ? 1 : 0, dt);
    this.flight.step(air && !dead ? 1 : 0, dt);
    const back = (e.mode === 'recover' && e.stunned) || (e.mode === 'hurt' && e.stunned && !e.landed);
    if (dead) this.deadF += dt * 60 * (e.hitstop > 0 ? 0 : 1);
    const rollT = dead ? sat(this.deadF / JUMP.death.flip) : back ? 1 : 0;
    if (dead) this.roll.x += (rollT - this.roll.x) * approach(30, dt);
    else this.roll.step(rollT, dt);
    this.squash.step(0, dt);
    // (Pitch along the flight: nose up as it rises, down as it comes in.)
    const vy = e.vy;
    const pt =
      air && !dead && (e.mode === 'charge' || e.mode === 'back') ? clamp(-vy * 0.045, -0.5, 0.45) : 0;
    this.pitch += (pt - this.pitch) * approach(16, dt);
    this.skid = e.mode === 'recover' && Math.abs(e.knockVx) > 0.6 && !e.stunned;
    this.fade = dead ? 1 - smoothstep(0, JUMP.death.fade, JUMP.death.fade - Math.max(0, e.timer - a)) : 1;
  }
}

// Scratch: the body's frame for this draw.
let OX = 0;
let OY = 0;
let FX = 1;
let SX = 1;
let SY = 1;
let ROT = 0;
let PIV = -15;
let LIFT = 0;
const WP = { x: 0, y: 0 };
/** A body-local point (+x forward, y down from the feet) to world, into `WP`. */
function W(lx: number, ly: number): typeof WP {
  const x = lx * SX * FX;
  const y = (ly - PIV) * SY;
  const c = Math.cos(ROT);
  const s = Math.sin(ROT);
  WP.x = OX + x * c - y * s;
  WP.y = OY + LIFT + PIV + x * s + y * c;
  return WP;
}

/** A local ellipse, as a shape (the body frame's squash, turn and roll applied). */
function blob(p: Painter, cx: number, cy: number, rx: number, ry: number, sh: Shade, sq = 2, seg = 22): void {
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    // (A superellipse: `sq` > 2 is boxier: the head.)
    const ex = Math.sign(ct) * Math.abs(ct) ** (2 / sq);
    const ey = Math.sign(st) * Math.abs(st) ** (2 / sq);
    const w = W(cx + ex * rx, cy + ey * ry);
    p.px[i] = w.x;
    p.py[i] = w.y;
  }
  const c = W(cx, cy);
  const ccx = c.x;
  const ccy = c.y;
  const top = W(cx, cy - ry);
  const tx = top.x;
  const ty = top.y;
  const bot = W(cx, cy + ry);
  p.shape(seg, ccx, ccy, sh, tx, ty, bot.x, bot.y);
}

/** A short tapered hair from local (x, y) out along (nx, ny). */
function hair(
  p: Painter,
  x: number,
  y: number,
  nx: number,
  ny: number,
  len: number,
  w: number,
  sh: Shade,
): void {
  const a = W(x, y);
  p.px[0] = a.x;
  p.py[0] = a.y;
  p.pw[0] = w;
  const b = W(x + nx * len * 0.55, y + ny * len * 0.55);
  p.px[1] = b.x;
  p.py[1] = b.y;
  p.pw[1] = w * 0.6;
  const c = W(x + nx * len, y + ny * len);
  p.px[2] = c.x;
  p.py[2] = c.y;
  p.pw[2] = 0.05;
  p.ribbon(3, sh);
}

/** Hairs all round a local ellipse (skipping where `skip` says), jittered by the creature's seed. */
function furRing(
  p: Painter,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  seed: number,
  len: number,
  w: number,
  sh: Shade,
  bristle: number,
): void {
  for (let i = 0; i < n; i++) {
    const t = ((i + hash1(i * 31 + seed) * 0.6) / n) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    // (Not under the belly: legs and ground are there.)
    if (st > 0.55) continue;
    const l = len * (0.7 + 0.6 * hash1(i * 17 + seed + 5)) * (1 + bristle);
    const nx = ct + (hash1(i * 7 + seed) - 0.5) * 0.5;
    const ny = st - 0.15;
    const nl = Math.hypot(nx, ny) || 1;
    hair(p, cx + ct * rx * 0.93, cy + st * ry * 0.93, nx / nl, ny / nl, l, w, sh);
  }
}

/** One leg: hip local (hx, hy), foot world (fx, fy) or local; knee up and out; a pale band at the knee. */
function leg(
  p: Painter,
  hx: number,
  hy: number,
  fx: number,
  fy: number,
  l1: number,
  l2: number,
  w: number,
  sh: Shade,
  band: boolean,
  bend: number,
): void {
  const h = W(hx, hy);
  const ax = h.x;
  const ay = h.y;
  // (`bend` = 1: the knee goes up over the hip-to-foot line, whichever way the foot is; -1: under it.)
  const dir = fx >= ax ? 1 : -1;
  ik2(ax, ay, fx, fy, l1 * SY, l2 * SY, -dir * bend * 0.95, 0.25);
  const kx = ikOut.x;
  const ky = ikOut.y;
  const ex = ikOut.ex;
  const ey = ikOut.ey;
  p.px[0] = ax;
  p.py[0] = ay;
  p.pw[0] = w;
  p.px[1] = kx;
  p.py[1] = ky;
  p.pw[1] = w * 0.95;
  p.px[2] = kx + (ex - kx) * 0.5;
  p.py[2] = ky + (ey - ky) * 0.5;
  p.pw[2] = w * 0.72;
  p.px[3] = ex;
  p.py[3] = ey;
  p.pw[3] = w * 0.42;
  p.ribbon(4, sh, true, true);
  if (band) {
    // Pale bands round the leg past the knee and at the tarsus (the legs read banded: Phidippus).
    for (const [u0, u1] of [
      [0.1, 0.24],
      [0.7, 0.8],
    ] as const) {
      p.px[0] = kx + (ex - kx) * u0;
      p.py[0] = ky + (ey - ky) * u0;
      p.pw[0] = w * (0.98 - 0.5 * u0);
      p.px[1] = kx + (ex - kx) * u1;
      p.py[1] = ky + (ey - ky) * u1;
      p.pw[1] = w * (0.98 - 0.5 * u1);
      p.ribbon(2, SH_BAND);
    }
  }
}

const LEGS_FX = [0, 0, 0, 0];
const LEGS_FY = [0, 0, 0, 0];

/** Draws one jumping spider. Returns 1 if drawn. */
export function drawJumper(p: Painter, rig: JumperRig, e: EnemyState, clock: number): number {
  const J = JUMP;
  const dead = e.mode === 'dead';
  const seed = Math.floor(rig.seed * 1000);
  const roll = clamp(rig.roll.x, 0, 1);
  const fl = sat(rig.flight.x);
  const cr = sat(rig.crouch.x);
  const sp = sat(rig.splay.x);
  const curl = dead ? sat(rig.deadF / 14) : 0;

  // --- The hit flash: warm white for the first frames of the hold, gone fast.
  const age = rig.hitAge;
  const fk = age < 40 ? 1 - smoothstep(J.hit.flash - 0.5, J.hit.flash + 1.2, age) : 0;
  const flash = fk * 0.88;
  const dim = dead ? 0.85 : e.mode === 'recover' ? 0.92 : 1;
  lit(SH_ABD.c0, C.body, flash, dim);
  lit(SH_ABD.c1, C.bodyLow, flash, dim);
  lit(SH_HEAD.c0, C.body, flash, dim);
  lit(SH_HEAD.c1, C.bodyLow, flash, dim);
  lit(SH_LEG_N.c0, C.legNear, flash * 0.8, dim);
  lit(SH_LEG_N.c1, C.legNear, flash * 0.8, dim * 0.8);
  lit(SH_LEG_F.c0, C.legFar, flash * 0.5, dim);
  lit(SH_LEG_F.c1, C.legFar, flash * 0.5, dim * 0.8);
  lit(SH_FUR.c0, C.fur, flash, dim);
  lit(SH_FUR.c1, C.fur, flash, dim * 0.7);
  lit(SH_PALE.c0, C.pale, flash, dim);
  lit(SH_PALE.c1, C.pale, flash, dim * 0.8);
  lit(SH_MARK.c0, C.pale, flash, dim * 0.62);
  lit(SH_MARK.c1, C.pale, flash, dim * 0.5);
  lit(SH_EYE.c0, C.eye, flash * 0.3, 1);
  lit(SH_EYE.c1, C.eye, flash * 0.3, 1);
  lit(SH_FANG.c0, C.fang, flash, dim);
  lit(SH_FANG.c1, C.fang, flash, dim * 0.55);
  lit(SH_PALP.c0, C.palp, flash, dim);
  lit(SH_PALP.c1, C.palp, flash, dim * 0.75);
  lit(SH_BAND.c0, C.band, flash, dim);
  lit(SH_BAND.c1, C.band, flash, dim * 0.8);
  const coolK = p.coolK;
  p.alphaK = rig.fade;
  p.glowK = rig.fade;

  // --- The body frame.
  const d = clamp(rig.turn.x, -1, 1);
  FX = d >= 0 ? 1 : -1;
  // (Mid-turn the side view narrows: a quick snap round.)
  const turnW = 0.55 + 0.45 * Math.abs(d);
  const sq = clamp(rig.squash.x * 0.035, -0.25, 0.4) + (fk > 0 ? J.hit.squash * fk : 0);
  SX = turnW * (1 + sq * 0.8) * (1 + fl * 0.1);
  SY = (1 - sq) * (1 - fl * 0.06);
  OX = rig.x;
  OY = rig.y;
  // (Crouched low for the tell; splayed low when open; a tremble on the last beats.)
  const trem = cr > 0.5 ? Math.sin(clock * 70 + seed) * J.tell.tremble * (cr - 0.5) * 2 : 0;
  LIFT = cr * J.tell.crouch + sp * 4 + (roll > 0.5 ? -2 : 0) + trem * 0.4;
  OX += trem;
  PIV = -15;
  // Pitch: the flight's, the crouch's (rear bunched lower: the nose up a touch), the roll onto its back.
  const rollA = roll * Math.PI * (dead ? (e.hitDir || 1) * FX : 1);
  ROT = (rig.pitch - cr * 0.12) * FX + rollA;
  // Open after a miss: dazed, reared back on its rear legs, swaying (its eyes dim: below).
  const daze = e.mode === 'recover' && !e.stunned ? sp : 0;
  ROT -= FX * daze * (0.16 + 0.07 * Math.sin(clock * 6.5 + seed));

  // --- A contact shadow on the ground under it.
  const airH = Math.max(0, rig.ground - rig.y);
  p.soft(
    rig.x,
    rig.ground - 2,
    30 * (1 - sat(airH / 220) * 0.5),
    6,
    C.shadow,
    0.5 * (1 - sat(airH / 260)) * rig.fade,
  );

  // --- Feet: planted on the ground when it stands; thrown wide in a leap; kicking in the air on its back; curled dead.
  const L = J.legs;
  const kick = clock * 13 + seed;
  for (let k = 0; k < 4; k++) {
    // Rest on the ground: front legs reach ahead, rear legs behind. The tell bunches the rear in, raises the front.
    let gx = L.foot[k]!;
    let gy = 0;
    if (k >= 2) gx += J.tell.bunch * cr * (k === 3 ? 1 : 0.6);
    if (k === 0) gy -= J.tell.raise * cr + 2.5 * (1 - cr) * (e.chase > 0 ? 1 : 0.4);
    gx *= 1 + sp * 0.35;
    // In flight: front pair reaching forward-down, rear pair streaming back.
    const fxl = [36, 30, -26, -38][k]!;
    const fyl = [-4, 2, 4, 8][k]!;
    let lx = gx + (fxl - gx) * fl;
    let ly = gy + (fyl - gy) * fl;
    // Upside down: legs up in the air (local +y), kicking, or curled in dead.
    if (roll > 0.01) {
      const kx = L.hip[k]! + [10, 5, -4, -10][k]! + Math.sin(kick + k * 1.7) * 4 * (1 - curl);
      const ky = -8 + 12 * (1 - curl) + Math.cos(kick * 1.3 + k) * 3 * (1 - curl);
      lx = lx + (kx * (1 - curl * 0.6) - lx) * roll;
      ly = ly + (ky - ly) * roll;
    }
    // (Standing: the foot is a ground point under the body; else body-local.)
    const planted = (1 - fl) * (1 - roll);
    const wl = W(lx, ly + 0);
    LEGS_FX[k] = wl.x + (OX + lx * SX * FX - wl.x) * planted;
    LEGS_FY[k] = wl.y + (rig.ground + ly - wl.y) * planted;
  }
  // (Knees up, a spider's; on its back they point up from the body, i.e. down on screen.)
  const bend = roll > 0.5 ? -1 : 1;

  // Far legs (behind the body, darker, a little behind).
  for (let k = 0; k < 4; k++)
    leg(
      p,
      L.hip[k]! - L.farDx,
      -9,
      LEGS_FX[k]! - FX * L.farDx * SX - FX * 3,
      LEGS_FY[k]! - 1,
      L.l1[k]!,
      L.l2[k]!,
      L.w[k]! * 0.9,
      SH_LEG_F,
      false,
      bend,
    );

  // --- Abdomen: round, fuzzy, pale chevrons; it breathes (fast while open: panting).
  const breath = Math.sin(clock * (sp > 0.5 ? 11 : 3.2) + seed) * (sp > 0.5 ? 0.09 : 0.03);
  const A = J.abd;
  furRing(
    p,
    A.x,
    A.y,
    A.rx * (1 + breath),
    A.ry * (1 + breath),
    J.fur.abd,
    seed,
    J.fur.len,
    J.fur.w,
    SH_FUR,
    cr * 0.4,
  );
  blob(p, A.x, A.y, A.rx * (1 + breath), A.ry * (1 + breath), SH_ABD, 2.1, 24);
  // The pattern (Phidippus): a pale crescent across its front, a central triangle, then a pair of dashes, smaller
  // toward the spinnerets.
  blob(p, A.x + 10, A.y - 2.5, 1.4, 5.8, SH_PALE, 2, 12);
  blob(p, A.x + 1.5, A.y - 9.2, 2.6, 1.3, SH_MARK, 2, 12);
  blob(p, A.x - 5, A.y - 8, 1.6, 0.9, SH_MARK, 2, 10);
  blob(p, A.x - 9.5, A.y - 5.4, 1.1, 0.7, SH_MARK, 2, 10);

  // --- Head-thorax: blocky, a little tall at the front; the twitch moves the face.
  const H = J.head;
  const hx = H.x + rig.head.x * 0.4;
  furRing(p, hx, H.y, H.rx, H.ry, J.fur.head, seed + 3, J.fur.len * 0.8, J.fur.w, SH_FUR, cr * 0.3);
  blob(p, hx, H.y, H.rx, H.ry, SH_HEAD, 2.8, 24);

  // --- Near legs, in front of the body (under the face); banded.
  for (let k = 3; k >= 0; k--)
    leg(p, L.hip[k]!, -8, LEGS_FX[k]!, LEGS_FY[k]!, L.l1[k]!, L.l2[k]!, L.w[k]!, SH_LEG_N, true, bend);

  // --- The face, turned a little to us: two huge front eyes side by side, bulging past the head's front (black glass in
  // a dark socket, a teal sheen, glints that catch the light), fangs and pale palps under them, small side eyes on top.
  const E = J.eyes;
  const fx = H.x + rig.head.x;
  const ldx = clamp((rig.lookX - OX) / 200, -1, 1) * FX;
  const ldy = clamp((rig.lookY - (OY - 20)) / 200, -1, 1);
  const flare = rig.flare;
  const beat = rig.beat;
  const sees = dead ? 0 : e.mode === 'recover' ? 0.3 : 1;
  // Fangs: iridescent green under the eyes.
  for (let k = 1; k >= 0; k--) {
    const fx0 = fx + E.x - 2 - k * 4.5;
    blob(p, fx0, E.y + 10.5, 2.3, 3.4, SH_FANG, 2, 12);
    const g = W(fx0 + 0.6, E.y + 9);
    if (!dead) p.glow(g.x, g.y, 1.2, C.fangGlint, 0.5 * (1 - flash));
  }
  // Palps: small pale clubs in front of the fangs that flick (fast while it hunts; still when open or dead).
  const flick = dead || sp > 0.5 ? 0 : Math.sin(rig.palp) * (e.chase > 0 ? 1.5 : 0.7);
  for (let k = 1; k >= 0; k--) {
    const pxl = fx + E.x + 2.5 - k * 4;
    const pyl = E.y + 9.5 + (k === 0 ? flick : -flick * 0.7);
    blob(p, pxl, pyl, 1.9, 2.3, SH_PALP, 2, 12);
  }
  // The eyes: far one first (behind, toward the body), then the near one bulging past the front.
  for (let k = 1; k >= 0; k--) {
    const r = (k === 0 ? E.r : E.rFar) * (1 - sq * 0.25);
    const ex = fx + E.x - (k === 0 ? 0 : E.r * 1.05);
    const ey = E.y + (k === 0 ? 0.4 : -0.6);
    blob(p, ex - 1, ey, r * 1.22, r * 1.2, SH_HEAD, 2, 18);
    blob(p, ex, ey, r, r, SH_EYE, 2, 20);
    const c = W(ex, ey);
    // (A teal sheen round the lens: the black eye stays apart from the dark body.)
    p.ring(c.x, c.y, r * 0.86, 0.7, C.eyeRing, 0.28 + 0.2 * flare, r * 0.86);
    // Hunting, a warm light comes up inside the lens; on each beat of the tell it flares (the count).
    const warm = sees * (flare * 0.35 + beat * 0.65);
    if (warm > 0.02) {
      p.ring(c.x, c.y, r * 0.62, r * 0.32, C.hunt, 0.55 * warm, r * 0.62);
      // (On each beat a flash wide enough to read at play zoom, where the eye is a few pixels: the count you see.)
      p.glow(c.x, c.y, r * (1.6 + 3.2 * beat), C.hunt, (0.18 + 0.5 * beat) * warm, r * (1.5 + 2.8 * beat));
    }
    // Glints: one big, one small; they slide a little toward what it watches; dim when dazed, out when dead.
    if (sees > 0.01) {
      const gr = r * E.glint * (1 + 0.35 * flare + 0.9 * beat);
      const gx = c.x + (0.22 + 0.22 * ldx) * r;
      const gy = c.y - (0.36 - 0.18 * ldy) * r;
      p.glow(gx, gy, gr, C.glint, 0.95 * sees, gr * 0.85);
      p.glow(gx - 0.5 * r, gy + 0.62 * r, r * 0.14, C.glint, 0.55 * sees);
    }
  }
  // A short pale brow of hairs over the eyes (Phidippus's white "eyebrows").
  for (let k = 0; k < 5; k++) {
    const u = k / 4;
    hair(
      p,
      fx + E.x - E.r * 1.6 + u * E.r * 2.2,
      E.y - E.r * 0.9,
      0.35,
      -1,
      1.5 + 0.8 * Math.sin(u * 3),
      0.6,
      SH_MARK,
    );
  }
  // Small side eyes up on the head (dark beads with a pin of light).
  for (let k = 0; k < 2; k++) {
    const s2 = W(H.x + 1 - k * 7, H.y - H.ry * 0.82);
    p.ellipse(s2.x, s2.y, 1.6, 1.4, 0, SH_EYE, 10);
    if (!dead) p.glow(s2.x + 0.4, s2.y - 0.5, 0.6, C.glint, 0.55);
  }

  p.alphaK = 1;
  p.glowK = 1;
  p.coolK = coolK;
  return 1;
}
