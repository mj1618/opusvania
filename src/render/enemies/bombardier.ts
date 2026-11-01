// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The bombardier, painted (memory/enemies-render.md "The bombardier"; sim: src/sim/enemies/bombardier.ts, droplets
 * src/sim/shots.ts). A squat ground beetle: a low wide blue-black dome with hot orange bands, a small orange head and
 * pronotum, six splayed legs, and the turret: its abdomen tip, a short stub tucked behind at rest that telescopes up
 * over its back for the lob (its tip glows hot and counts down in quickening flashes, creatures.md rule 4) and whips
 * forward for the spray. A warm near-white flash on a hit (never on her), on its back when its own droplet hits it
 * (legs kicking), and a death that is launched along the blow, tumbles, lands on its back, curls its legs, lies and
 * fades. Droplets are hot glowing beads with a steam trail, splashing in sparks and steam; a deflect is a bright star.
 *
 * Reads only the sim (state, events). Animation on render time (`dt`); its scatter from its own LCG, never Math.random.
 */
import type { SimEvent } from '../../sim/events';
import type { EnemyState, ShotState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import { clamp, sat } from '../character/math';
import type { SimView } from '../contract';
import { mixRGB, type Painter, type RGB, rgb, type Shade } from './paint';

/** Look and motion numbers (render only). */
export const BOMB = {
  color: {
    dome: [rgb(0x1a2238), rgb(0x070a14)] as const,
    belly: rgb(0x0a0a10),
    band: rgb(0x6a2408),
    bandHot: rgb(0xff8a2a),
    thorax: [rgb(0x7a3414), rgb(0x2e1208)] as const,
    head: [rgb(0x9a4418), rgb(0x3a160a)] as const,
    leg: rgb(0x0c0c12),
    tail: [rgb(0x251a22), rgb(0x0c0a10)] as const,
    eye: rgb(0xb8a890),
    hunt: rgb(0xffa040),
    tip: rgb(0xff7a1e),
    tipHot: rgb(0xffe0a0),
    key: rgb(0xb8c8ff),
    gloss: rgb(0x9fb4e8),
    flash: rgb(0xfff0d8),
    drop: rgb(0xffb050),
    dropCore: rgb(0xfff4d0),
    dropGlow: rgb(0xff6a14),
    batted: rgb(0xfff8e8),
    battedGlow: rgb(0xffd890),
    steam: rgb(0x8c96a8),
    spark: rgb(0xffc070),
  },
  /**
   * Readability (r22 pass): drawn size x its 1x layout, how far its legs lift the body off the ground (local px: the
   * belly clears the walk moss, so it reads as a beetle standing, not a strip), and the dome's height (was 19).
   */
  scale: 1.25,
  stand: 7,
  /** The layout's centre is behind its middle (the head is long): shifted back so the body overhangs its box evenly. */
  shiftX: -3,
  domeH: 25,
  /** The wing cases' gloss: a pale streak along the dome's crown (a beetle reads by its shine). */
  gloss: 0.8,
  /** Turret segment lengths at full rise (px; the rest stub is `stub` x these), half-widths. */
  seg: [13, 13, 10] as const,
  segW: [7.6, 6.6, 5.4] as const,
  stub: 0.42,
  /** Springs: rise, forward swing, facing, roll (rad/s), heat. */
  riseK: 16,
  turnK: 12,
  /** Hit flash: frames at full, frames fading after; squash on a hit. */
  flashFrames: 5,
  flashFade: 4,
  squash: [1.14, 0.84] as const,
  /** Death: spin while it flies (rad/s), fade over the last frames of its body. */
  spin: 15,
  fadeFrames: 28,
  /** Droplet look. */
  dropR: 6.5,
  dropGlowR: 20,
  trail: 7,
  steamEvery: 0.035,
};

const C = BOMB.color;
const shade = (
  c0: RGB,
  c1: RGB,
  rim: number,
  cool: number,
  form: number,
  band: number,
): Shade & { alpha: number } => ({
  c0,
  c1,
  rim,
  cool,
  form,
  band,
  ember: 0.6,
  alpha: 1,
});
const SH_DOME = shade(C.dome[0], C.dome[1], 0.55, 0.45, 0.25, 0.32);
const SH_BELLY = shade(C.belly, C.belly, 0.1, 0.2, 0, 0.3);
const SH_BAND = shade(C.band, C.band, 0.25, 0.1, 0.1, 0.4);
const SH_THORAX = shade(C.thorax[0], C.thorax[1], 0.5, 0.3, 0.25, 0.35);
const SH_HEAD = shade(C.head[0], C.head[1], 0.45, 0.3, 0.2, 0.35);
const SH_LEG = shade(C.leg, C.leg, 0.35, 0.3, 0, 0.5);
const SH_TAIL = shade(C.tail[0], C.tail[1], 0.45, 0.35, 0.2, 0.35);
const SH_RING = shade(C.band, C.band, 0.2, 0.1, 0, 0.4);
const SH_GLOSS = shade(C.gloss, C.gloss, 0, 0, 0, 0.5);
const SH_DROP = shade(C.drop, C.dropGlow, 0, 0, 0, 0.5);

const smooth = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** One bombardier's springs and timers (by enemy index). */
export class BombRig {
  x = 0;
  y = 0;
  private cx = 0;
  private cy = 0;
  private px = 0;
  private py = 0;
  private lastF = -1;
  /** Facing as drawn (-1..1: it narrows through a turn). */
  d = 1;
  rise = 0;
  fwd = 0;
  heat = 0;
  /** Countdown flash phase and the flash itself (0..1). */
  ph = 0;
  blink = 0;
  kick = 0;
  kickV = 0;
  roll = 0;
  curl = 0;
  aim = -0.6;
  legPh = 0;
  sq = 0;
  flash = 0;
  alpha = 1;
  deadT = 0;
  live = false;
  spraying = false;

  update(e: Readonly<EnemyState>, sim: SimView, dt: number, clock: number): void {
    const B = tuning.bombardier;
    const fx = e.x + e.w / 2;
    const fy = e.y + e.h;
    if (!this.live || Math.abs(fx - this.cx) > 160 || Math.abs(fy - this.cy) > 160) {
      this.cx = this.px = fx;
      this.cy = this.py = fy;
      this.d = e.facing;
      this.live = true;
    } else if (sim.frame !== this.lastF) {
      this.px = this.cx;
      this.py = this.cy;
      this.cx = fx;
      this.cy = fy;
    }
    this.lastF = sim.frame;
    const a = e.hitstop > 0 ? 1 : sim.alpha;
    this.x = this.px + (this.cx - this.px) * a;
    this.y = this.py + (this.cy - this.py) * a;
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    // Facing: a turn narrows it through its profile over the sim's turn.
    let dT: number = e.facing;
    if (e.turning && e.mode === 'sit') {
      const n = Math.max(1, B.turnFrames);
      dT = e.facing * (2 * (e.walkLeft / n) - 1);
    }
    this.d += (dT - this.d) * k(BOMB.turnK);
    // The turret: up over its back to lob, forward to spray.
    const m = e.mode;
    const of = Math.max(1, e.timer + e.modeFrames);
    const u = m === 'rear' || m === 'windup' ? sat(e.modeFrames / of) : 0;
    const riseT =
      m === 'rear' ? smooth(0, 0.3, u) : m === 'spit' ? 1 : m === 'pause' ? 0.5 : e.aware > 0 ? 0.12 : 0;
    const fwdT = m === 'windup' ? smooth(0, 0.6, u) : m === 'spray' ? 1 : 0;
    this.rise += (riseT - this.rise) * k(BOMB.riseK);
    this.fwd += (fwdT - this.fwd) * k(BOMB.riseK * 1.4);
    // Heat: its hunt colour, from a smoulder while it watches to white-hot as it fires.
    const heatT =
      m === 'rear'
        ? 0.25 + 0.75 * u
        : m === 'windup'
          ? 0.5 + 0.5 * u
          : m === 'spit' || m === 'spray'
            ? 1
            : m === 'pause'
              ? 0.4
              : m === 'dead' || m === 'recover' || m === 'sleep'
                ? 0
                : e.aware > 0
                  ? 0.18
                  : 0.06;
    this.heat += (heatT - this.heat) * k(m === 'spit' || m === 'spray' ? 30 : 6);
    // The count: quickening flashes through the tell, solid over its last frames.
    if (m === 'rear' || m === 'windup') {
      this.ph += dt * (2.2 + 11 * u * u) * Math.PI * 2;
      this.blink = e.timer <= 6 ? 1 : Math.cos(this.ph) > 0.2 ? 1 : 0.25;
    } else {
      this.ph = 0;
      this.blink += ((m === 'spit' || m === 'spray' ? 1 : 0) - this.blink) * k(10);
    }
    // Aim: the tip toward its mark (her centre at the tell).
    if (m === 'rear' || m === 'spit') {
      const dx = (e.targetX - (fx - e.facing * 22)) * e.facing;
      const dy = e.targetY - (fy - 40);
      const want = clamp(Math.atan2(dy - Math.abs(dx) * 0.55, Math.max(20, dx)), -1.35, 0.5);
      this.aim += (want - this.aim) * k(10);
    }
    // Recoil from a shot (`fired`), springing back.
    this.kickV += (-this.kick * 260 - this.kickV * 18) * dt;
    this.kick += this.kickV * dt;
    // Legs: idle shuffle; braced while it fires; kicking on its back.
    this.legPh += dt * (m === 'recover' ? 16 : e.aware > 0 ? 2.2 : 1.1);
    // A hit: the flash and the squash, from the sim's frame of the blow.
    const hf = e.hitFrame >= 0 ? sim.frame - e.hitFrame : 1e9;
    this.flash =
      hf <= BOMB.flashFrames - 1
        ? 1
        : hf < BOMB.flashFrames + BOMB.flashFade
          ? 1 - (hf - BOMB.flashFrames + 1) / (BOMB.flashFade + 1)
          : 0;
    this.sq = hf < e.hitstop + 2 ? 1 : hf < e.hitstop + 8 ? 1 - (hf - e.hitstop - 2) / 6 : 0;
    // On its back (its own droplet; dead): the roll.
    if (m === 'dead') {
      this.deadT += dt;
      const dir = e.hitDir < 0 ? -1 : 1;
      if (!e.landed && e.hitstop === 0) this.roll += dir * BOMB.spin * dt;
      else if (e.landed) {
        // Settle on its back: the nearest odd multiple of pi.
        const n = Math.round((this.roll - Math.PI) / (2 * Math.PI));
        const want = Math.PI + n * 2 * Math.PI;
        this.roll += (want - this.roll) * k(14);
        this.curl += (1 - this.curl) * k(5);
      }
      this.alpha = sat(e.timer / BOMB.fadeFrames);
    } else {
      this.deadT = 0;
      this.alpha = 1;
      const want = m === 'recover' ? Math.PI : 0;
      // (Wrap the roll back near 0 / pi first: a death's spins are not kept.)
      if (Math.abs(this.roll) > 4 * Math.PI) this.roll = this.roll % (2 * Math.PI);
      this.roll += (want - this.roll) * k(m === 'recover' ? 18 : 9);
      this.curl += ((m === 'sleep' ? 0.7 : 0) - this.curl) * k(4);
    }
    void clock;
  }

  /** A droplet left the turret: it bucks. */
  fired(): void {
    this.kickV += 14;
  }
}

// --- Drawing.
const P = { x: 0, y: 0 };

/** Local (facing +1, feet at 0, up negative) to world for this rig: roll about the body, then mirror, squash, place. */
class Frame {
  x = 0;
  y = 0;
  d = 1;
  sx = 1;
  sy = 1;
  cr = 1;
  sr = 0;
  set(r: BombRig): void {
    this.x = r.x;
    this.y = r.y;
    const ad = Math.max(0.3, Math.abs(r.d));
    this.d = r.d < 0 ? -ad : ad;
    this.sx = (1 + (BOMB.squash[0] - 1) * r.sq) * BOMB.scale;
    this.sy = (1 + (BOMB.squash[1] - 1) * r.sq) * (1 - 0.05 * r.kick) * BOMB.scale;
    this.cr = Math.cos(r.roll);
    this.sr = Math.sin(r.roll);
    // (Up on its legs only while upright; curled asleep / dead it sinks.)
    this.lift = BOMB.stand * Math.max(0, this.cr) * (1 - 0.6 * r.curl);
  }
  lift = 0;
  map(lx0: number, ly0: number): typeof P {
    // Up on its legs: everything from the belly line up is lifted, the feet stay on the ground (knees stretch).
    const ly = ly0 - this.lift * sat(-ly0 / 6);
    const lx = lx0 + BOMB.shiftX;
    // Roll about (0, -13): on its back (pi) the dome's top (-26) rests on the ground.
    const ry = ly + 13;
    const x = lx * this.cr - ry * this.sr;
    const y = lx * this.sr + ry * this.cr - 13;
    P.x = this.x + x * this.d * this.sx;
    P.y = this.y + y * this.sy;
    return P;
  }
}
const FR = new Frame();

function put(p: Painter, i: number, lx: number, ly: number): void {
  const q = FR.map(lx, ly);
  p.px[i] = q.x;
  p.py[i] = q.y;
}

/** The dome's outline (local), front to back over the top, then the belly line back to front. */
function domePath(p: Painter): number {
  let n = 0;
  const N = 16;
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * Math.PI;
    const x = -6 + 25 * Math.cos(t);
    // Highest a little behind the middle; a flatter front shoulder.
    const s = Math.sin(t);
    const y = -6 - BOMB.domeH * s ** 0.85 * (1 - 0.12 * Math.cos(t));
    put(p, n++, x, y);
  }
  for (let k = 1; k < 6; k++) {
    const x = -31 + (k / 6) * 50;
    put(p, n++, x, -5 + 1.6 * Math.sin((k / 6) * Math.PI));
  }
  return n;
}

function ellipseL(p: Painter, cx: number, cy: number, rx: number, ry: number, rot: number, seg = 14): number {
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    put(p, i, cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot));
  }
  return seg;
}

function centre(lx: number, ly: number): [number, number] {
  const q = FR.map(lx, ly);
  return [q.x, q.y];
}

/** A leg: from its hip on the belly to its foot, a knee raised and out. */
function leg(p: Painter, r: BombRig, hipX: number, footX: number, k: number, far: boolean, s: Shade): void {
  const m = r.legPh + k * 2.1 + (far ? 1.3 : 0);
  const onBack = Math.max(0, -FR.cr);
  // Kicking on its back; curled when dead or asleep.
  const kickY = onBack * (6 * Math.sin(m * 1.7) - 10);
  const curl = r.curl;
  const lift = Math.max(0, Math.sin(m)) * 1.2 * (1 - onBack);
  const fx = footX + (hipX - footX) * curl * 0.7;
  const fy = -lift + kickY + curl * -6;
  const kx = (hipX + fx) / 2 + (footX - hipX) * 0.25;
  const ky = -13 - 2 * r.kick + curl * -2 + onBack * -4;
  put(p, 0, hipX, -6);
  put(p, 1, kx, ky);
  put(p, 2, fx, fy);
  p.pw[0] = far ? 1.8 : 2.2;
  p.pw[1] = far ? 1.5 : 1.8;
  p.pw[2] = 0.8;
  p.ribbon(3, s, true, false);
}

/** The turret's joints (local), into `out`: base, two joints, tip. */
function turret(r: BombRig, out: Float32Array): void {
  const stub = BOMB.stub + (1 - BOMB.stub) * Math.max(r.rise, r.fwd);
  // Rest: tucked back and down. Up: up-back, up-forward, then at its mark. Forward: whipped over to spray ahead.
  const restA = [Math.PI - 0.45, Math.PI - 0.1, Math.PI + 0.3];
  // (Unwrapped past pi so a rise swings up through the back, never forward through the body.)
  const T2 = Math.PI * 2;
  const upA = [T2 - 2.3, T2 - 1.15, T2 + r.aim];
  const fwA = [4.4, 5.3, T2 + 0.22];
  let x = -27;
  let y = -11;
  out[0] = x;
  out[1] = y;
  for (let i = 0; i < 3; i++) {
    let a = restA[i]! + (upA[i]! - restA[i]!) * r.rise;
    a += (fwA[i]! - a) * r.fwd;
    a -= r.kick * 0.18 * (i + 1);
    const len = BOMB.seg[i]! * stub;
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    out[2 + i * 2] = x;
    out[3 + i * 2] = y;
  }
}
const TJ = new Float32Array(8);

/** The turret: segments with hot rings, base at its rear. */
function tailShape(p: Painter, r: BombRig, bandC: RGB): void {
  turret(r, TJ);
  for (let i = 0; i < 4; i++) put(p, i, TJ[i * 2]!, TJ[i * 2 + 1]!);
  for (let i = 0; i < 4; i++) p.pw[i] = BOMB.segW[Math.min(2, i)]! * (i === 3 ? 0.8 : 1);
  p.ribbon(4, SH_TAIL, true, true);
  // Its rings: thin hot bands across each segment.
  for (let i = 0; i < 3; i++) {
    const ax = (TJ[i * 2]! + TJ[i * 2 + 2]!) / 2;
    const ay = (TJ[i * 2 + 1]! + TJ[i * 2 + 3]!) / 2;
    const n = ellipseL(
      p,
      ax,
      ay,
      1.4,
      BOMB.segW[i]! * 0.9,
      Math.atan2(TJ[i * 2 + 3]! - TJ[i * 2 + 1]!, TJ[i * 2 + 2]! - TJ[i * 2]!),
      8,
    );
    const [qx, qy] = centre(ax, ay);
    SH_RING.c0 = bandC;
    SH_RING.c1 = bandC;
    p.shape(n, qx, qy, SH_RING);
  }
}

/** Body parts in one pass (used again as ghosts for the hit flash). */
function bodyShapes(p: Painter, r: BombRig, bandC: RGB): void {
  // The turret behind the dome (over it once swung forward to spray: it must read over the back).
  const over = r.fwd > 0.3;
  if (!over) tailShape(p, r, bandC);
  // Belly, dome, bands.
  let n = ellipseL(p, -6, -6, 26, 4, 0);
  let [qx, qy] = centre(-6, -6);
  p.shape(n, qx, qy, SH_BELLY);
  n = domePath(p);
  [qx, qy] = centre(-6, -14);
  const [tx, ty] = centre(-6, -26);
  const [bx, by] = centre(-6, -5);
  p.shape(n, qx, qy, SH_DOME, tx, ty, bx, by);
  SH_BAND.c0 = bandC;
  SH_BAND.c1 = mixRGB(bandC, C.dome[1], 0.45);
  for (let b = 0; b < 3; b++) {
    const x0 = -22 + b * 13;
    const w = 2.8;
    // Follow the dome's profile at this x, inset a little from its edge.
    const top = (x: number) => {
      const c = clamp((x + 6) / 25, -1, 1);
      const s = Math.sqrt(Math.max(0, 1 - c * c));
      return -6 - BOMB.domeH * s ** 0.85 * (1 - 0.12 * c) + 2.2;
    };
    put(p, 0, x0 - w, -6.5);
    put(p, 1, x0 - w * 0.6, top(x0 - w * 0.6));
    put(p, 2, x0 + w * 0.6, top(x0 + w * 0.6));
    put(p, 3, x0 + w, -6.5);
    [qx, qy] = centre(x0, -12);
    p.shape(4, qx, qy, SH_BAND, p.px[1]!, p.py[1]!, p.px[0]!, p.py[0]!);
  }
  // The gloss: a pale streak along the crown, behind the light's side of the top (skipped in the flash's ghost).
  if (BOMB.gloss > 0 && !p.ghost) {
    const H = BOMB.domeH;
    const N = 9;
    for (let k = 0; k < N; k++) {
      const t = 0.35 + (k / (N - 1)) * 0.45;
      const c = Math.cos(t * Math.PI);
      const sn = Math.sin(t * Math.PI);
      put(p, k, -6 + 25 * c * 0.86, -6 - H * sn ** 0.85 * (1 - 0.12 * c) + 3.2);
      p.pw[k] = 2.6 * Math.sin((k / (N - 1)) * Math.PI) + 0.3;
    }
    SH_GLOSS.c0 = mixRGB(C.gloss, bandC, 0.15);
    SH_GLOSS.c1 = SH_GLOSS.c0;
    SH_GLOSS.alpha = BOMB.gloss;
    p.ribbon(N, SH_GLOSS);
  }
  // Pronotum and the small head.
  n = ellipseL(p, 21, -10.5, 8.5, 7, -0.15);
  [qx, qy] = centre(21, -10.5);
  p.shape(n, qx, qy, SH_THORAX);
  n = ellipseL(p, 31.5, -8.2, 6, 4.6, 0.12);
  [qx, qy] = centre(31.5, -8.2);
  p.shape(n, qx, qy, SH_HEAD);
  if (over) tailShape(p, r, bandC);
}

/** Draws one bombardier into `p` (its body, under her). Returns false if nothing was drawn. */
export function drawBombardier(p: Painter, r: BombRig, e: Readonly<EnemyState>, clock: number): boolean {
  if (r.alpha <= 0.01) return false;
  FR.set(r);
  p.keyColor = C.key;
  p.alphaK = r.alpha;
  const bandC = mixRGB(C.band, C.bandHot, sat(r.heat * 0.85));
  // Contact shadow.
  p.soft(r.x, r.y - 2, 40, 7, [0.005, 0.01, 0.02], 0.55 * r.alpha);
  // Far legs, behind everything.
  const legs: Array<[number, number]> = [
    [18, 34],
    [6, 14],
    [-8, -26],
  ];
  for (let k = 0; k < 3; k++) leg(p, r, legs[k]![0] + 2, legs[k]![1] + 3, k, true, SH_LEG);
  bodyShapes(p, r, bandC);
  // Antennae: forward and up, a slow sway (they twitch toward her while it watches).
  const sway = Math.sin(clock * 2.3 + e.salt * 1e-9) * 2;
  for (const s of [0, 1]) {
    put(p, 0, 35, -10);
    put(p, 1, 44 + s * 2, -17 + sway - s * 3);
    put(p, 2, 54 + s * 3, -20 + sway * 1.5 - s * 5);
    p.pw[0] = 0.9;
    p.pw[1] = 0.7;
    p.pw[2] = 0.35;
    p.ribbon(3, SH_LEG);
  }
  // Mandibles.
  put(p, 0, 36, -9);
  put(p, 1, 40.5, -6.5);
  put(p, 2, 36.5, -5.5);
  {
    const [qx, qy] = centre(37, -7);
    p.shape(3, qx, qy, SH_LEG);
  }
  // Near legs, in front of the body.
  for (let k = 0; k < 3; k++) leg(p, r, legs[k]![0], legs[k]![1], k, false, SH_LEG);
  // The eyes: a dim glint that goes to its hunt colour as it watches her.
  {
    const [ex, ey] = centre(33.5, -10);
    const hunt = sat(r.heat * 2.2);
    const ec = mixRGB(C.eye, C.hunt, hunt);
    p.glow(ex, ey, 2.2, ec, 0.5 + 0.6 * hunt, 2.2, 0, 8);
  }
  // The turret's tip: its hunt colour, counting down.
  turret(r, TJ);
  const [tipX, tipY] = centre(TJ[6]!, TJ[7]!);
  const hot = r.heat * (0.45 + 0.55 * r.blink);
  if (hot > 0.02) {
    p.glow(tipX, tipY, 8 + 20 * hot, C.tip, 0.55 * hot, 8 + 20 * hot, 0, 16);
    p.glow(tipX, tipY, 3 + 4 * hot, mixRGB(C.tip, C.tipHot, hot), 0.9 * hot, 3 + 4 * hot, 0, 10);
    // The bands breathe with the count.
    if (r.heat > 0.4) {
      const [bx, by] = centre(-8, -15);
      p.glow(bx, by, 30, C.bandHot, 0.12 * (r.heat - 0.4) * r.blink, 14, 0, 16);
    }
  }
  // The hit: a warm near-white flash over its whole silhouette for a frame or two.
  if (r.flash > 0.01) {
    p.ghost = C.flash;
    p.ghostAlpha = 0.9 * r.flash * r.alpha;
    bodyShapes(p, r, C.flash);
    for (let k = 0; k < 3; k++) leg(p, r, legs[k]![0], legs[k]![1], k, false, SH_LEG);
    p.ghost = null;
    p.glow(r.x, r.y - 14, 46, C.flash, 0.35 * r.flash, 26, 0, 16);
  }
  p.alphaK = 1;
  return true;
}

/** Where the drawn turret's tip is now (world). */
export function tipOf(r: BombRig): { x: number; y: number } {
  FR.set(r);
  turret(r, TJ);
  const q = FR.map(TJ[6]!, TJ[7]!);
  return { x: q.x, y: q.y };
}

// --- Droplets, sparks, steam: one small pool.
const MAX = 260;
const K_SPARK = 1;
const K_STEAM = 2;
const K_FLASH = 3;
const K_RING = 4;
const K_JET = 5;

/** The droplets in flight and what they throw off: drawn into the front painter (over the grass, her too). */
export class BombFx {
  private readonly k = new Uint8Array(MAX);
  private readonly x = new Float32Array(MAX);
  private readonly y = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly max = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly hot = new Float32Array(MAX);
  private next = 0;
  private rnd = 0x9e3779b9;
  private readonly trails = new Map<number, { xs: number[]; ys: number[]; f: number }>();
  private steamT = 0;
  /** This frame's sprays: tip x, y, facing (drawn as a hot cone of light, then cleared). */
  private readonly cone: number[] = [];
  private lastF = -1;
  /** For sound / tests: how many sparks a deflect threw last. */
  lastDeflect = 0;

  private rand(): number {
    this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0;
    return this.rnd / 4294967296;
  }

  private emit(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    hot = 1,
  ): void {
    const i = this.next;
    this.next = (i + 1) % MAX;
    this.k[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = 0;
    this.max[i] = life;
    this.size[i] = size;
    this.hot[i] = hot;
  }

  private sparks(
    x: number,
    y: number,
    n: number,
    dx: number,
    dy: number,
    spread: number,
    sp: number,
    life: number,
    hot = 1,
  ): void {
    const a0 = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = a0 + (this.rand() - 0.5) * spread;
      const s = sp * (0.45 + 0.75 * this.rand());
      this.emit(
        K_SPARK,
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        life * (0.6 + 0.6 * this.rand()),
        1 + this.rand() * 1.4,
        hot,
      );
    }
  }

  private steam(x: number, y: number, n: number, size: number, life = 0.7): void {
    for (let i = 0; i < n; i++)
      this.emit(
        K_STEAM,
        x + (this.rand() - 0.5) * size,
        y + (this.rand() - 0.5) * size * 0.5,
        (this.rand() - 0.5) * 40,
        -30 - this.rand() * 40,
        life * (0.7 + 0.6 * this.rand()),
        size * (0.6 + 0.6 * this.rand()),
      );
  }

  /** The sim's events since the last frame: fire, splash, deflect, hit. `kick(i)` bucks owner `i`'s rig. */
  react(events: readonly SimEvent[], kick: (owner: string) => void): void {
    for (const ev of events) {
      if (ev.type === 'shotFire') {
        kick(ev.owner);
        const l = Math.hypot(ev.vx, ev.vy) || 1;
        this.emit(K_FLASH, ev.x, ev.y, 0, 0, 0.14, 22, 1);
        this.sparks(ev.x, ev.y, 5, ev.vx / l, ev.vy / l, 0.9, 320, 0.22);
        this.steam(ev.x, ev.y, 3, 12, 0.6);
      } else if (ev.type === 'shotSplash') {
        if (ev.on === 'out') {
          this.steam(ev.x, ev.y, 2, 10, 0.5);
          continue;
        }
        const ground = ev.on === 'ground';
        const l = Math.hypot(ev.vx, ev.vy) || 1;
        // On the ground the splash fans up and back off the surface; on a body it bursts along the flight.
        this.sparks(
          ev.x,
          ev.y,
          ground ? 9 : 7,
          ground ? (-ev.vx / l) * 0.3 : ev.vx / l,
          ground ? -1 : ev.vy / l,
          ground ? 2.2 : 1.6,
          360,
          0.32,
          ev.reflected ? 1.4 : 1,
        );
        this.emit(K_FLASH, ev.x, ev.y, 0, 0, 0.18, 26, 1);
        this.emit(K_RING, ev.x, ev.y, 0, 0, 0.25, 10, 1);
        this.steam(ev.x, ev.y - 4, ground ? 5 : 3, 16, 0.9);
      } else if (ev.type === 'shotDeflect') {
        // The best hit there is: a bright star, a ring, sparks thrown the way it is batted.
        const l = Math.hypot(ev.vx, ev.vy) || 1;
        this.emit(K_FLASH, ev.x, ev.y, 0, 0, 0.2, 64, 1.6);
        this.emit(K_RING, ev.x, ev.y, 0, 0, 0.3, 18, 1.5);
        this.sparks(ev.x, ev.y, 14, ev.vx / l, ev.vy / l, 1.4, 620, 0.3, 1.6);
        this.sparks(ev.x, ev.y, 6, -ev.vx / l, -ev.vy / l, 2.4, 300, 0.22, 1.3);
        this.lastDeflect = 20;
      } else if (ev.type === 'shotHit') {
        this.emit(K_FLASH, ev.x, ev.y, 0, 0, 0.24, 70, 1.4);
        this.emit(K_RING, ev.x, ev.y, 0, 0, 0.35, 24, 1.2);
        this.sparks(ev.x, ev.y, 16, ev.dir, -0.6, 2.6, 480, 0.4, 1.4);
        this.steam(ev.x, ev.y - 8, 6, 22, 1.1);
      } else if (ev.type === 'enemyDie' && ev.kind === 'bombardier') {
        // Its last boil: a hiss of steam off the body and a few hot drops.
        this.steam(ev.x, ev.y - 6, 7, 24, 1.3);
        this.sparks(ev.x, ev.y, 8, ev.dir, -1, 2, 300, 0.4, 0.9);
      }
    }
  }

  /** While it sprays: the jet from its tip, forward in a cone. */
  jet(tx: number, ty: number, facing: number, dt: number): void {
    this.cone.push(tx, ty, facing);
    const n = Math.max(1, Math.round(dt * 60 * 7));
    for (let i = 0; i < n; i++) {
      const a = (this.rand() - 0.35) * 0.55;
      const s = 950 + 450 * this.rand();
      this.emit(
        K_JET,
        tx,
        ty,
        Math.cos(a) * s * facing,
        Math.sin(a) * s + 60,
        0.16 + 0.08 * this.rand(),
        2 + 2 * this.rand(),
      );
    }
    if (this.rand() < 0.5) this.steam(tx + facing * (40 + 70 * this.rand()), ty + 4, 1, 14, 0.6);
  }

  /** Draws the droplets in flight and every particle; `dt` advances them. */
  draw(p: Painter, sim: SimView, dt: number): void {
    const shots = sim.shots ?? [];
    const alpha = sim.alpha;
    // Trails: the last few drawn positions of each droplet (on sim frames).
    const fresh = sim.frame !== this.lastF;
    this.lastF = sim.frame;
    for (const t of this.trails.values()) t.f = 0;
    this.steamT += dt;
    const puff = this.steamT >= BOMB.steamEvery;
    if (puff) this.steamT = 0;
    for (let i = 0; i + 2 < this.cone.length; i += 3) {
      const x = this.cone[i]!;
      const y = this.cone[i + 1]!;
      const f = this.cone[i + 2]!;
      const fl = 0.85 + 0.15 * this.rand();
      // The spray's reach: a hot fan from the tip forward and down over its head, brightest near the tip.
      p.glow(x + f * 90, y + 16, 110, C.dropGlow, 0.9 * fl, 30, f * 0.18, 20);
      p.glow(x + f * 50, y + 8, 60, C.drop, 0.9 * fl, 15, f * 0.22, 16);
      p.glow(x, y, 12, C.dropCore, 0.9 * fl, 12, 0, 10);
    }
    this.cone.length = 0;
    for (const q of shots) this.drop(p, q, alpha, fresh, puff);
    for (const [id, t] of this.trails) if (t.f === 0) this.trails.delete(id);
    // Particles.
    for (let i = 0; i < MAX; i++) {
      const kind = this.k[i]!;
      if (kind === 0) continue;
      const life = this.life[i]! + dt;
      const max = this.max[i]!;
      if (life >= max) {
        this.k[i] = 0;
        continue;
      }
      this.life[i] = life;
      const u = life / max;
      const x = this.x[i]! + this.vx[i]! * dt;
      const y = this.y[i]! + this.vy[i]! * dt;
      const h = this.hot[i]!;
      if (kind === K_SPARK || kind === K_JET) {
        const drag = kind === K_JET ? 3 : 2.6;
        this.vx[i] = this.vx[i]! * Math.exp(-drag * dt);
        this.vy[i] = this.vy[i]! * Math.exp(-drag * dt) + (kind === K_JET ? 500 : 900) * dt;
        const l = Math.hypot(this.vx[i]!, this.vy[i]!) || 1;
        const len = Math.min(16, l * 0.022) * (kind === K_JET ? 1.4 : 1);
        p.px[0] = x - (this.vx[i]! / l) * len;
        p.py[0] = y - (this.vy[i]! / l) * len;
        p.px[1] = x;
        p.py[1] = y;
        const s = this.size[i]!;
        p.pw[0] = s * 0.4;
        p.pw[1] = s * 0.6;
        const b = (1 - u) * (1 - u) * Math.min(1.6, h);
        p.pc[0] = b * 0.5;
        p.pc[3] = b;
        const c =
          h > 1.2
            ? C.batted
            : kind === K_JET
              ? mixRGB(C.drop, C.dropGlow, u)
              : mixRGB(C.spark, C.dropGlow, u);
        p.streak(2, c);
        if (kind === K_JET) p.glow(x, y, s * 3, C.dropGlow, 0.18 * (1 - u), s * 3, 0, 8);
      } else if (kind === K_STEAM) {
        this.vx[i] = this.vx[i]! * Math.exp(-1.5 * dt);
        this.vy[i] = this.vy[i]! * Math.exp(-0.8 * dt);
        const s = this.size[i]! * (1 + 1.6 * u);
        p.soft(x, y, s, s * 0.75, C.steam, 0.22 * sat(u / 0.15) * (1 - u));
      } else if (kind === K_FLASH) {
        const s = this.size[i]! * (0.7 + 0.5 * u);
        const c = h > 1.2 ? C.battedGlow : C.dropGlow;
        p.glow(x, y, s, c, 0.9 * h * (1 - u) * (1 - u), s, 0, 20);
        p.glow(x, y, s * 0.35, C.dropCore, 1.1 * h * (1 - u) ** 3, s * 0.35, 0, 12);
      } else if (kind === K_RING) {
        const r = this.size[i]! * (1 + 3.2 * u);
        p.ring(x, y, r, 2.2 * (1 - u) + 0.6, h > 1.2 ? C.batted : C.spark, 0.7 * (1 - u) * Math.min(1.4, h));
      }
      this.x[i] = x;
      this.y[i] = y;
    }
    if (this.lastDeflect > 0) this.lastDeflect--;
  }

  /** One droplet: its glow, a streak of its last positions, its hot bead, steam off it. */
  private drop(p: Painter, q: Readonly<ShotState>, alpha: number, fresh: boolean, puff: boolean): void {
    const a = q.hold > 0 ? 1 : alpha;
    const x = q.x - q.vx * (1 - a);
    const y = q.y - q.vy * (1 - a);
    let t = this.trails.get(q.id);
    if (!t) {
      t = { xs: [], ys: [], f: 1 };
      this.trails.set(q.id, t);
    }
    t.f = 1;
    if (fresh && q.hold === 0) {
      t.xs.push(q.x);
      t.ys.push(q.y);
      if (t.xs.length > BOMB.trail) {
        t.xs.shift();
        t.ys.shift();
      }
    }
    const bat = q.reflected;
    const glow = bat ? C.battedGlow : C.dropGlow;
    // The streak behind it.
    const n = t.xs.length;
    if (n >= 2) {
      for (let i = 0; i < n; i++) {
        p.px[i] = t.xs[i]!;
        p.py[i] = t.ys[i]!;
        const k = (i + 1) / n;
        p.pw[i] = BOMB.dropR * (bat ? 0.9 : 0.6) * k;
        p.pc[i * 3] = (bat ? 0.9 : 0.55) * k * k;
      }
      p.px[n - 1] = x;
      p.py[n - 1] = y;
      p.streak(n, bat ? C.batted : C.drop);
    }
    // Steam boiling off it.
    if (puff && !bat) this.steam(x, y, 1, 7, 0.55);
    if (puff && bat) this.sparks(x, y, 1, -q.vx, -q.vy, 0.6, 120, 0.15, 1.5);
    const r = BOMB.dropR * (bat ? 1.15 : 1);
    p.glow(
      x,
      y,
      BOMB.dropGlowR * (bat ? 1.4 : 1),
      glow,
      bat ? 0.75 : 0.55,
      BOMB.dropGlowR * (bat ? 1.4 : 1),
      0,
      18,
    );
    // The bead, stretched a little along its flight.
    const l = Math.hypot(q.vx, q.vy) || 1;
    const st = 1 + Math.min(0.5, l * 0.04);
    const rot = Math.atan2(q.vy, q.vx);
    SH_DROP.c0 = bat ? C.batted : C.drop;
    SH_DROP.c1 = bat ? C.battedGlow : C.dropGlow;
    p.ellipse(x, y, r * st, r / Math.sqrt(st), rot, SH_DROP, 14);
    p.glow(x, y, r * 0.7, C.dropCore, 1.1, r * 0.7, 0, 10);
  }
}
