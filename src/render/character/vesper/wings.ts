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
import { clamp, lerp, pulse, sat, smoothstep } from '../hooded/math';
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
const BEAT_DOWN = [-58, -46, -34, -22, -10];

const ANTENNA_A: ChainSpec = {
  len: [6.2, 6.4, 6.6, 6.6, 6.6, 6.2],
  rest: [74, 94, 117, 140, 160, 175],
  kG: [0.2, 0.016],
  kL: [0.34, 0.14],
  drag: 0.07,
  gravity: 240,
  wind: 560,
};
const ANTENNA_B: ChainSpec = {
  len: [5.8, 6, 6.2, 6.2, 6.2, 5.8],
  rest: [96, 120, 144, 164, 180, 192],
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
  private ripple = 0;

  constructor() {
    this.all = [...this.wings[0].strands, ...this.wings[1].strands, ...this.antennae];
    this.antennae[0].phase = 0.2;
    this.antennae[1].phase = 0.63;
  }

  reset(): void {
    for (const c of this.all) c.reset();
    this.ripple = 0;
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
    const b = rig.beat;
    const up = b < 1 ? smoothstep(0, 0.12, b) * (1 - smoothstep(0.16, 0.3, b)) : 0;
    const down = b < 1 ? smoothstep(0.16, 0.3, b) * (1 - smoothstep(0.38, 0.66, b)) : 0;
    const spread = sat(run * 1.2 + rig.wAir + dash + wall + up + down);
    this.spread += (spread - this.spread) * (1 - Math.exp(-14 * dt));
    this.open = sat(glide + apex * 0.6 + up + down * 0.7 + wall * 0.5);
    const stiff = 0.9 + 0.4 * this.spread + 1.7 * dash + 0.5 * (up + down) + 0.4 * rig.wAir;
    const dragK = 1 - rig.wAir * (0.45 + 0.3 * rig.airRise) - 0.55 * dash - 0.3 * wall;

    // --- Ripple: runs faster and deeper with speed.
    const sp = pulse(clock, 7.3, 1.1, 77, 0.85);
    const settle = sp > 0 ? Math.sin(Math.PI * sp) ** 2 * rig.wIdle : 0;
    const rate = 2.6 + 9 * settle + 15 * run + 5 * glide + 3 * wall + 8 * dash;
    this.ripple += rate * dt;
    const amp = 0.045 + 0.1 * settle + 0.26 * run + 0.15 * glide + 0.07 * wall + 0.05 * apex + 0.03 * dash;

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

    for (let w = 0; w < 2; w++) {
      const sd = w === 0 ? 1 : -1;
      // The wing on the far side sits a little higher and further back; pressed flat on a wall.
      const far = sat(0.5 - 0.5 * sd * d);
      const wing = this.wings[w]!;
      const ph = this.ripple + w * 2.1;
      for (let k = 0; k < STRANDS; k++) {
        const c = wing.strands[k]!;
        const spec = WING[k]!;
        const rf = lerp(spec.f0, spec.f1, this.spread) - far * 1.2;
        const ru = lerp(spec.u0, spec.u1, this.spread) + far * 0.6;
        c.ax = cx + fx * rf + ux * ru - sd * cz * 2.2;
        c.ay = cy + fy * rf + uy * ru;
        c.d = d;
        c.rot = rig.upper * 0.75 * (1 - rig.wDash);
        c.lat = -sd * mid * 0.55;
        let lift =
          STREAM[k]! * run +
          RISE[k]! * rise +
          APEX[k]! * apex +
          GLIDE[k]! * glide +
          DART[k]! * dash +
          lerp(WALL_FREE[k]!, 3, far) * wall;
        lift = lerp(lift, BEAT_UP[k]!, up);
        lift = lerp(lift, BEAT_DOWN[k]!, down);
        // The far wing rides higher when open, so both read: fore and hind.
        lift += far * (-6 - 30 * (glide + apex * 0.6) + 9 * run);
        // At rest she resettles her wings now and then: a small lift and shiver.
        lift -= settle * (13 - k * 1.5) * (far > 0.5 ? 0.7 : 1);
        // A landing or a skid throws the hem out for a moment.
        lift -= clamp(rig.crouchPx, 0, 8) * 1.6 * (1 - k / STRANDS);
        c.lift = lift * DEG;
        c.curl = (0.05 * run - 0.07 * glide - 0.03 * up + 0.04 * down + 0.02 * dash) * (1 - k * 0.12);
        c.stiff = stiff;
        c.dragK = dragK;
        c.floorY = floorY;
        c.wallSide = wallSide;
        c.wallX = wallX;
        for (let i = 1; i < c.n; i++) {
          const t = (i / (c.n - 1)) ** 1.3;
          c.extra[i] =
            amp * t * (Math.sin(ph - 1.25 * i - 0.8 * k) + 0.5 * Math.sin(ph * 1.73 - 2.1 * i + 1.3 * k + w));
        }
        c.advance(dt, clock);
      }
    }

    // --- Antennae: from the brow, sweeping back; they hear things.
    for (let a = 0; a < 2; a++) {
      const c = this.antennae[a]!;
      c.ax = j[(J_BROW_A + a) * 2]!;
      c.ay = j[(J_BROW_A + a) * 2 + 1]!;
      c.d = dh;
      c.rot = rig.headAng;
      const flick = pulse(clock, a === 0 ? 6.7 : 9.1, 0.55, 31 + a * 7, 0.8);
      const fl = flick > 0 ? Math.sin(Math.PI * flick) ** 2 * rig.wIdle : 0;
      c.lift = (13 * run + 30 * dash - 16 * glide + 8 * rise - 10 * up + 12 * down - 20 * fl) * DEG;
      c.curl = (0.04 * run - 0.05 * glide + 0.07 * fl) * 1;
      c.stiff = 1 + 1.2 * dash;
      c.dragK = 1 - 0.3 * dash;
      c.floorY = Number.POSITIVE_INFINITY;
      c.wallSide = wallSide;
      c.wallX = wallX;
      c.advance(dt, clock);
    }
  }
}
