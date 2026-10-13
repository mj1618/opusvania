// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Nova's simulated parts: the comet tail (one long, light chain from the crown, ending in the
 * star) and the two tails of the waist sash. Verlet chains with rest shapes (../hooded/chain).
 */
import type { PlayerView } from '../../contract';
import { Chain, type ChainSpec } from '../hooded/chain';
import { noise1 } from '../hooded/math';
import { type Frame, J_HIP, J_SASH, J_TAIL, type Rig, S_D, S_DH } from './rig';

/** Light as a thread of smoke: little gravity, lots of air drag, a soft rest curve down the back. */
const TAIL: ChainSpec = {
  len: [5, 6, 7, 7.5, 8, 8.5, 8.5, 8.5, 8.5, 8],
  rest: [196, 212, 230, 245, 256, 262, 266, 268, 269, 270],
  kG: [0.22, 0.004],
  kL: [0.4, 0.2],
  drag: 0.075,
  gravity: 260,
  wind: 520,
};

const SASH_LONG: ChainSpec = {
  len: [5, 5.5, 5.5, 5.5, 5],
  rest: [222, 248, 262, 267, 269],
  kG: [0.2, 0.012],
  kL: [0.3, 0.1],
  drag: 0.085,
  gravity: 1000,
  wind: 700,
};

const SASH_SHORT: ChainSpec = {
  len: [4.5, 4.5, 4.5, 4],
  rest: [240, 259, 268, 272],
  kG: [0.24, 0.018],
  kL: [0.32, 0.12],
  drag: 0.075,
  gravity: 1100,
  wind: 620,
};

export class Secondary {
  readonly tail = new Chain(TAIL);
  readonly sashA = new Chain(SASH_LONG);
  readonly sashB = new Chain(SASH_SHORT);
  readonly all: Chain[];

  constructor() {
    this.all = [this.tail, this.sashA, this.sashB];
    this.all.forEach((c, i) => {
      c.phase = (i * 0.37) % 1;
    });
  }

  reset(): void {
    for (const c of this.all) c.reset();
  }

  update(dt: number, clock: number, rig: Rig, frame: Frame, p: PlayerView): void {
    const { j, s } = frame;
    const d = s[S_D]!;
    const dh = s[S_DH]!;
    const floorY = p.grounded ? p.feetY - 1 : Number.POSITIVE_INFINITY;
    const wallSide = p.motion === 'wallSlide' ? p.wallDir : 0;
    const wallX = p.cx + wallSide * (p.w / 2 - 1.5);
    // The somersault turns the rest frame with the body (as a forward lean in the facing frame).
    const flip = rig.spinPhi * (d >= 0 ? 1 : -1);
    // While spinning the chains go soft so they trail round as ribbons; in a dash they pin back.
    const stiff = (1 + rig.wDash * 1.3) * (1 - 0.35 * rig.spinW);
    for (const c of this.all) {
      c.floorY = floorY;
      c.wallSide = wallSide;
      c.wallX = wallX;
      c.stiff = stiff;
    }

    const tail = this.tail;
    tail.ax = j[J_TAIL * 2]!;
    tail.ay = j[J_TAIL * 2 + 1]!;
    tail.d = dh;
    tail.rot = rig.headAng + flip;
    // Lifts off the back when running or sliding down a wall, lies flat in a dash.
    tail.lift = -0.5 * rig.wRun - 1.0 * rig.wWall - 0.25 * rig.wAir + 0.2 * rig.wDash;
    // At rest it is never quite still: a slow drift of its own on top of the wind.
    const calm = Math.max(0, 1 - rig.wRun - rig.wAir - rig.wDash - rig.wWall);
    tail.lift += calm * (0.16 * noise1(clock * 0.31, 71) + 0.07 * noise1(clock * 0.83, 73));
    tail.curl = 0.05 * rig.wWall + calm * 0.035 * noise1(clock * 0.47, 77);

    const sx = j[J_SASH * 2]!;
    const sy = j[J_SASH * 2 + 1]!;
    const a = this.sashA;
    a.ax = sx;
    a.ay = sy;
    a.d = d;
    a.rot = rig.lean * 0.8 + flip;
    a.lift = -0.3 * rig.wRun;
    const b = this.sashB;
    // The short tail hangs a touch nearer the hip.
    b.ax = sx + (j[J_HIP * 2]! - sx) * 0.3;
    b.ay = sy + 0.8;
    b.d = d;
    b.rot = rig.lean * 0.8 + flip;
    b.lift = -0.2 * rig.wRun;

    for (const c of this.all) c.advance(dt, clock);
  }
}
