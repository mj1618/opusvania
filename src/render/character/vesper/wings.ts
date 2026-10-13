// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper's simulated parts: two wings and two antennae.
 *
 * A wing is one membrane carried by five strands (leading edge .. trailing edge), each a verlet
 * chain with a rest shape. The rest shape is the folded cape; every other state (streaming in the
 * run, half open in a fall, the dart of a dash, the wingbeat of the double jump...) is a table of
 * lifts per strand, blended by the rig's smoothed weights and then *chased* by the simulation, so
 * the wing lags, overshoots and settles into each shape. A travelling ripple (two incommensurate
 * waves running root to tip and leading to trailing edge) is fed into the rest angles, not the
 * positions, so it too is filtered by the cloth.
 */
import type { PlayerView } from '../../contract';
import { clamp, lerp, noise1, pulse, sat, smoothstep } from '../hooded/math';
import { Chain, type ChainSpec } from './chain';
import { type Frame, J_BROW_A, J_CHEST, J_COLLAR, type Rig, S_CZ, S_D, S_DH } from './rig';

const DEG = Math.PI / 180;
export const STRANDS = 5;

interface StrandSpec {
  /** Root relative to the collar when folded: forward, up. */
  f0: number;
  u0: number;
  /** ... and when spread (the roots line up down the back). */
  f1: number;
  u1: number;
  chain: ChainSpec;
}

function strand(len: number, rest: number[], stiff: number, drag: number): ChainSpec {
  return {
    len: [len, len, len, len],
    rest,
    kG: [0.24 * stiff, 0.034 * stiff],
    kL: [0.32 * stiff, 0.12 * stiff],
    drag,
    gravity: 900,
    wind: 620,
  };
}

/** Leading (back / upper) edge first. Folded they hang as a bell-shaped cape. */
const WING: readonly StrandSpec[] = [
  { f0: -4.2, u0: 0.6, f1: -3.9, u1: 1.6, chain: strand(10.6, [238, 251, 262, 269], 0.8, 0.1) },
  { f0: -2.9, u0: 1.0, f1: -4.1, u1: -0.2, chain: strand(10.3, [247, 257, 265, 270], 0.85, 0.1) },
  { f0: -1.3, u0: 1.0, f1: -4.2, u1: -2.0, chain: strand(9.9, [258, 263, 268, 270], 0.95, 0.095) },
  { f0: 0.4, u0: 0.5, f1: -4.0, u1: -3.8, chain: strand(9.2, [269, 270, 271, 270], 1.1, 0.09) },
  { f0: 1.9, u0: -0.5, f1: -3.6, u1: -5.4, chain: strand(8.5, [280, 275, 272, 270], 1.25, 0.085) },
];

// Lift per strand in degrees relative to the fold (negative = swings back and up).
const STREAM = [-50, -45, -39, -33, -27];
const RISE = [-16, -12, -8, -4, 0];
const APEX = [-72, -58, -44, -29, -14];
const GLIDE = [-100, -82, -62, -42, -21];
const DART = [-73, -75, -78, -83, -88];
const WALL_FREE = [-118, -98, -78, -60, -42];
const BEAT_UP = [-112, -90, -68, -46, -24];
/** Wrapped close while she somersaults. */
const TUCKED = [-58, -68, -80, -90, -100];
/**
 * The glide. The wings unfurl to their full span and open to either side of her on screen, one
 * behind and one ahead: a shallow V. Lift per strand (the leading edge ends ~28 degrees above the
 * horizontal, the trailing edge ~45 below it), how much each strand lengthens, and the bend per
 * segment that straightens the leading edge and lets the hind wing round off.
 */
const SOAR = [-88, -81, -73, -64, -55];
const SOAR_LEN = [2.3, 2.22, 2.02, 1.9, 1.56];
const SOAR_CURL = [-0.13, -0.1, -0.05, 0.0, 0.03];
/** The stoop: swept straight up and back, close together. */
const DIVE = [-128, -131, -135, -140, -146];

const ANTENNA_A: ChainSpec = {
  len: [7.6, 7.9, 8.2, 8.2, 8, 7.4],
  rest: [78, 100, 124, 146, 163, 174],
  kG: [0.2, 0.016],
  kL: [0.34, 0.14],
  drag: 0.07,
  gravity: 240,
  wind: 560,
};
const ANTENNA_B: ChainSpec = {
  len: [7.1, 7.4, 7.7, 7.7, 7.5, 7],
  rest: [100, 124, 147, 166, 180, 189],
  kG: [0.19, 0.015],
  kL: [0.33, 0.13],
  drag: 0.075,
  gravity: 240,
  wind: 560,
};

export class Wing {
  readonly strands: Chain[] = WING.map((s) => new Chain(s.chain));
  constructor(phase: number) {
    this.strands.forEach((c, i) => {
      c.phase = (phase + i * 0.09) % 1;
    });
  }
}

export class Secondary {
  /** Side A (toward the camera when facing right) and side B. */
  readonly wings: [Wing, Wing] = [new Wing(0), new Wing(0.41)];
  readonly antennae: [Chain, Chain] = [new Chain(ANTENNA_A), new Chain(ANTENNA_B)];
  readonly all: Chain[];
  /** 0 folded cape .. 1 spread: how far the roots have slid down the back, and how lobed the hem is. */
  spread = 0;
  /** 0..1: how wide open (glide, beat). */
  open = 0;
  /** 0..1: spread to both sides in the glide. */
  soar = 0;
  /** ... per wing (a wing beside a wall or trunk folds in). */
  readonly soarW: [number, number] = [0, 0];
  /**
   * Set by the owner each frame: how much each wing should fold for a solid beside her (0..1; index
   * 0 = wing A, screen-left) and the world x of that solid's face (the wing is kept on her side of it).
   */
  readonly foldT: [number, number] = [0, 0];
  readonly faceX: [number, number] = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  private readonly fold: [number, number] = [0, 0];
  private ripple = 0;

  constructor() {
    this.all = [...this.wings[0].strands, ...this.wings[1].strands, ...this.antennae];
    this.antennae[0].phase = 0.2;
    this.antennae[1].phase = 0.63;
  }

  reset(): void {
    for (const c of this.all) c.reset();
    this.ripple = 0;
    this.fold[0] = this.fold[1] = 0;
  }

  update(dt: number, clock: number, rig: Rig, frame: Frame, p: PlayerView): void {
    const { j, s } = frame;
    const d = s[S_D]!;
    const cz = s[S_CZ]!;
    const dh = s[S_DH]!;
    const floorY = p.grounded ? p.feetY - 1 : Number.POSITIVE_INFINITY;
    const wallSide = p.motion === 'wallSlide' ? p.wallDir : 0;
    const wallX = p.cx + wallSide * (p.w / 2 - 1);

    // --- Blend of states.
    const run = rig.wRun * (0.3 + 0.7 * rig.speedK);
    const rise = rig.wAir * rig.airRise;
    const apex = rig.wAir * rig.airApex;
    const glide = rig.wAir * rig.airFall;
    const dash = rig.wDash;
    const wall = rig.wWall;
    // The somersault: folded tight round her while she turns, thrown wide as she opens out.
    const tuck = rig.spinW;
    const soar = rig.soar * (1 - tuck);
    const dive = rig.dive * (1 - soar) * (1 - tuck);
    const ck = rig.catchK;
    const flare = rig.flare;
    // Coming out of the ball straight into a glide, the throw-wide becomes the opening itself.
    const up = rig.openK * (1 - 0.75 * soar);
    const hold = rig.openHold * (1 - up) * (1 - tuck) * (1 - soar);
    const spread = sat(run * 1.2 + rig.wAir + dash + wall + up + soar) * (1 - tuck);
    this.spread += (spread - this.spread) * (1 - Math.exp(-14 * dt));
    this.open = Math.max(soar, sat((glide + apex * 0.6 + wall * 0.5) * (1 - tuck) + up + 0.5 * hold));
    this.soar = soar;
    const stiff =
      0.9 +
      0.4 * this.spread +
      1.7 * dash +
      0.5 * up +
      8 * tuck +
      0.4 * rig.wAir +
      0.8 * hold +
      soar * (1.5 + 1.6 * Math.max(0, ck)) +
      1.2 * dive +
      0.5 * Math.min(1, Math.abs(rig.slashWing));
    const dragK =
      (1 - rig.wAir * (0.45 + 0.3 * rig.airRise) - 0.55 * dash - 0.3 * wall) *
      (1 - 0.5 * hold) *
      (1 - 0.5 * soar);
    // The lope: a soft half-beat of the wings each stride, up through the float, down at the push.
    const stride = Math.sin(4 * Math.PI * (rig.phase - 0.2)) * run * 1.6;
    const dragT = dragK * (1 - 0.85 * tuck);

    // --- Ripple: runs faster and deeper with speed.
    const sp = pulse(clock, 7.3, 1.1, 77, 0.85);
    const settle = sp > 0 ? Math.sin(Math.PI * sp) ** 2 * rig.wIdle : 0;
    const rate = 2.6 + 9 * settle + 15 * run + 5 * glide + 3 * wall + 8 * dash + 2.6 * soar;
    this.ripple += rate * dt;
    const amp =
      (0.045 * (1 - soar) +
        0.1 * settle +
        0.26 * run +
        0.15 * glide * (1 - soar) +
        0.07 * wall +
        0.05 * apex * (1 - soar) +
        0.03 * dash +
        0.1 * soar) *
      (1 - tuck);
    const airspeed = sat(Math.hypot(p.vx, p.vy) / 11);
    // In the glide the wings breathe together, slowly...
    const breath = Math.sin(clock * 2.3) * 3.8 + Math.sin(clock * 0.83 + 1.3) * 2.2;

    // The collar's own axes on screen: up along the spine, forward a quarter turn toward the facing.
    const cx = j[J_COLLAR * 2]!;
    const cy = j[J_COLLAR * 2 + 1]!;
    let ux = cx - j[J_CHEST * 2]!;
    let uy = cy - j[J_CHEST * 2 + 1]!;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    const fx = -uy * d;
    const fy = ux * d;
    // Mid-turn the wings part to either side instead of collapsing to a line.
    const mid = sat((cz - 0.42) / 0.58);
    // The wing frame's tilt on screen (clockwise +): the spine's lean, the somersault, the bank.
    const rotScreen =
      rig.upper * 0.75 * (1 - rig.wDash) * (1 - tuck) * (1 - soar) * d + rig.spinPhi + rig.bank * soar;
    // How far each wing has swung out to its own side of her (glide): early in the opening.
    const side = smoothstep(0.03, 0.4, soar);
    // The span grows late and shrinks early, so a folding wing is already short when it swings in.
    const soarAll = soar;
    const beat = rig.beat;
    const reach = rig.reach;

    for (let w = 0; w < 2; w++) {
      const sd = w === 0 ? 1 : -1;
      // A wall or trunk beside her: that wing folds in and lies against it.
      this.fold[w]! +=
        (this.foldT[w]! - this.fold[w]!) * (1 - Math.exp(-(this.foldT[w]! > this.fold[w]! ? 16 : 7) * dt));
      const fold = this.fold[w]!;
      const soar = soarAll * (1 - 0.7 * fold);
      const span = soar * soar;
      this.soarW[w] = soar;
      const pressed = soarAll > 0.15 && fold > 0.02;
      // The wing on the far side sits a little higher and further back; pressed flat on a wall.
      const far = sat(0.5 - 0.5 * sd * d);
      const wing = this.wings[w]!;
      const ph = this.ripple + w * 2.1;
      // Folded and in every other state both wings trail behind her (direction = the body's turn);
      // gliding, wing A lies to screen-left and wing B to screen-right whichever way she faces, so
      // a turn in the air swivels her under wings that stay spread.
      const cd = lerp(lerp(d, sd, side), -rig.hurtDir, rig.hurtBlow * (1 - soarAll));
      const cdS = clamp(cd * 4, -1, 1);
      // ... and each makes its own small corrections, on times that never line up.
      const fix = 4.6 * noise1(clock * 0.47, 91 + w * 5) + 2.6 * noise1(clock * 1.13, 95 + w * 5);
      const tipFix = 0.035 * noise1(clock * 0.71, 99 + w * 5);
      for (let k = 0; k < STRANDS; k++) {
        const c = wing.strands[k]!;
        const spec = WING[k]!;
        const rf = lerp(spec.f0, spec.f1, this.spread) - far * 1.2;
        const ru = lerp(spec.u0, spec.u1, this.spread) + far * 0.6;
        const ax0 = cx + fx * rf + ux * ru - sd * cz * 2.2;
        const ay0 = cy + fy * rf + uy * ru;
        // Spread, the roots sit on the shoulder blades, either side of the spine.
        c.ax = lerp(ax0, cx - sd * (3.0 - 0.25 * k) - d * 1.2, soar);
        c.ay = lerp(ay0, cy + 1.6 + 1.5 * k - far * 0.8, soar);
        c.d = cd;
        c.rot = rotScreen * cdS;
        c.lat = -sd * mid * 0.55 * (1 - soar);
        // In the ball the wings draw in with everything else: a close shell.
        c.scale =
          lerp(1, SOAR_LEN[k]! * (1 + 0.05 * Math.max(0, ck)) * (1 - 0.04 * far), span) * (1 - 0.04 * tuck);
        let lift =
          STREAM[k]! * run +
          RISE[k]! * rise +
          APEX[k]! * apex +
          GLIDE[k]! * glide +
          DART[k]! * dash +
          lerp(WALL_FREE[k]!, 3, far) * wall;
        lift -= stride * (15 - 2 * k);
        // After the somersault the wings stay half spread while she is still rising.
        lift = lerp(lift, APEX[k]! * 0.85, hold);
        lift = lerp(lift, DIVE[k]! - 6 * far, dive);
        // Gliding: wide open. They balloon up past the shape as they catch the air (the fore wing
        // most), breathe, correct, and rise into a brake as she touches down.
        const lead = 1 - k * 0.14;
        lift = lerp(
          lift,
          SOAR[k]! -
            (27 * ck + 20 * flare + 14 * rig.flourish + breath + fix - 58 * beat + 15 * reach + 14 * wall) *
              lead -
            4 * far -
            3.5 * airspeed * (1 - lead) +
            22 * fold * (1 - lead),
          soar,
        );
        // In the ball both wings wrap back over her spine and under: one shell.
        lift = lerp(lift, TUCKED[k]! - 10 * far, tuck);
        lift = lerp(lift, BEAT_UP[k]!, up);
        // The far wing rides higher when open, so both read: fore and hind.
        lift += far * (-6 - 30 * (glide + apex * 0.6) * (1 - dive) + 9 * run) * (1 - soar);
        // At rest she resettles her wings now and then: a small lift and shiver.
        lift -= settle * (13 - k * 1.5) * (far > 0.5 ? 0.7 : 1);
        // A glint: a tiny flick; a great one opens them.
        lift -= rig.joy * 20 * (1 - k * 0.12) * (1 - 0.6 * soar);
        // A cut: the wings are her cloak. They close in as she gathers, flare with the stroke (the
        // wing opposite the leading shoulder first: a counterweight), and lift to hold an air hang.
        const sw = rig.slashWing;
        lift *= 1 - 0.75 * Math.max(0, -sw) * (1 - soar);
        lift -=
          (Math.max(0, sw) * (24 + 9 * far) + rig.slashTwist * 32 * (2 * far - 1) + rig.hangK * 15) *
          (1 - k * 0.12) *
          (1 - soar);
        // A landing or a skid throws the hem out for a moment.
        lift -= clamp(rig.crouchPx, 0, 8) * 1.6 * (1 - k / STRANDS) * (1 - soar);
        // Hurt: they are thrown open by the blow.
        lift -= (rig.hurtK * (34 + 12 * far) + rig.hurtBlow * 30) * (1 - k * 0.1) * (1 - soar);
        c.lift = lift * DEG;
        const curl =
          (0.05 * run - 0.07 * glide - 0.03 * up + 0.02 * dash) * (1 - k * 0.12) * (1 - tuck) +
          (0.7 + 0.07 * k) * tuck;
        // The billow cups the membrane: roots up, tips held down by the air.
        c.curl = lerp(
          curl,
          SOAR_CURL[k]! + (0.1 * ck + 0.05 * flare + 0.06 * reach - 0.05 * beat) * lead + tipFix,
          soar * (1 - tuck),
        );
        c.stiff = stiff;
        c.dragK = dragT;
        c.floorY = floorY;
        c.wallSide = wallSide !== 0 ? wallSide : pressed ? -sd : 0;
        c.wallX = wallSide !== 0 ? wallX : this.faceX[w]! + sd * 1.5;
        for (let i = 1; i < c.n; i++) {
          const t = (i / (c.n - 1)) ** 1.3;
          c.extra[i] =
            amp * t * (Math.sin(ph - 1.25 * i - 0.8 * k) + 0.5 * Math.sin(ph * 1.73 - 2.1 * i + 1.3 * k + w));
        }
        // The hem flutters in the air stream.
        c.extra[c.n - 1]! +=
          soar *
          (0.03 + 0.05 * airspeed) *
          Math.sin(clock * 15.5 + k * 2.3 + w * 1.7 + 0.6 * Math.sin(clock * 3.1 + k));
        c.advance(dt, clock);
      }
    }

    // --- Antennae: from the brow, sweeping back; they hear things.
    for (let a = 0; a < 2; a++) {
      const c = this.antennae[a]!;
      c.ax = j[(J_BROW_A + a) * 2]!;
      c.ay = j[(J_BROW_A + a) * 2 + 1]!;
      c.d = dh;
      c.rot = rig.headAng + rig.spinPhi * (d >= 0 ? 1 : -1);
      const flick = pulse(clock, a === 0 ? 6.7 : 9.1, 0.55, 31 + a * 7, 0.8);
      const fl = flick > 0 ? Math.sin(Math.PI * flick) ** 2 * rig.wIdle : 0;
      // In the glide they stream back level; the catch whips them down first; a stoop blows them up.
      c.lift =
        (13 * run +
          30 * dash -
          16 * glide * (1 - rig.soar) +
          8 * rise -
          10 * up +
          34 * tuck -
          20 * fl +
          rig.soar * (9 + 30 * rig.catchK + 5 * noise1(clock * 0.9, 83 + a)) -
          16 * rig.joy -
          18 * rig.dive +
          38 * rig.hurtK +
          15 * rig.slashWing) *
        DEG;
      c.curl = 0.04 * run - 0.05 * glide + 0.07 * fl + 0.46 * tuck;
      c.scale = 1 - 0.04 * tuck;
      c.stiff = 1 + 1.2 * dash + 7 * tuck;
      c.dragK = (1 - 0.3 * dash) * (1 - 0.7 * tuck);
      c.floorY = Number.POSITIVE_INFINITY;
      c.wallSide = wallSide;
      c.wallX = wallX;
      c.advance(dt, clock);
    }
  }
}
