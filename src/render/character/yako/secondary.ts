// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Yako's simulated parts: the tail (a thick chain: a soft travelling S-wave, a tip that lags and
 * curls), the two sash tails (light ribbons), the charm on its cord, and the ears and jacket hem
 * (springs). Chains are verlet with rest shapes (chain.ts); the pose only moves their rest shape
 * and stiffness, the motion itself is simulated.
 */
import type { PlayerView } from '../../contract';
import { clamp, noise1, pulse, Spring, sat } from '../hooded/math';
import { Chain, type ChainSpec } from './chain';
import { J_CHARM, J_KNOT, J_TAIL, K, type Rig } from './rig';

/** Rest: hangs down behind and curls back up at the tip, a soft J. Angles: 0 forward, 90 up, 180 back. */
const TAIL: ChainSpec = {
  len: [6.1, 6.1, 6.1, 6.1, 6.1, 6.1, 6.1, 6.1].map((l) => l * K),
  rest: [243, 234, 223, 211, 199, 187, 176, 166],
  kG: [0.3, 0.012],
  kL: [0.3, 0.13],
  drag: 0.034,
  gravity: 380,
  wind: 260,
};

function ribbon(n: number, seg: number, a0: number, stiff: number): ChainSpec {
  const len: number[] = [];
  const rest: number[] = [];
  for (let i = 0; i < n; i++) {
    len.push(seg * K);
    rest.push(a0 - i * 4.5);
  }
  return {
    len,
    rest,
    kG: [0.14 * stiff, 0.008 * stiff],
    kL: [0.22 * stiff, 0.07 * stiff],
    drag: 0.07,
    gravity: 1500,
    wind: 820,
  };
}

/** The back ribbon is shorter and falls a little forward of the front one. */
const SASH_A = ribbon(4, 6, 274, 1.1);
const SASH_B = ribbon(5, 6.2, 256, 0.9);

const CHARM: ChainSpec = {
  len: [3.1 * K, 3.1 * K],
  rest: [270, 270],
  kG: [0.03, 0.01],
  kL: [0.05, 0.03],
  drag: 0.035,
  gravity: 1700,
  wind: 120,
};

export class Secondary {
  readonly tail = new Chain(TAIL);
  readonly sashA = new Chain(SASH_A);
  readonly sashB = new Chain(SASH_B);
  readonly charm = new Chain(CHARM);
  readonly all: Chain[];
  /** Ear angles (rad, - = laid back), near and far, and the hem. */
  earN = 0;
  earF = 0;
  hem = 0;
  /** Dash smear 0..1: tail and sash drawn out long and thin. */
  smear = 0;

  private readonly earNS = new Spring(0, 31, 0.42);
  private readonly earFS = new Spring(0, 26, 0.46);
  private readonly hemS = new Spring(0, 15, 0.5);
  private readonly landS = new Spring(0, 13, 0.32);

  constructor() {
    this.all = [this.tail, this.sashA, this.sashB, this.charm];
    this.all.forEach((c, i) => {
      c.phase = (i * 0.17) % 1;
    });
  }

  reset(): void {
    for (const c of this.all) c.reset();
    this.earNS.snap(0);
    this.earFS.snap(0);
    this.hemS.snap(0);
    this.landS.snap(0);
    this.smear = 0;
  }

  update(dt: number, clock: number, rig: Rig, p: PlayerView): void {
    const floorY = p.grounded ? p.feetY - 1.5 : Number.POSITIVE_INFINITY;
    const wallSide = p.motion === 'wallSlide' ? p.wallDir : 0;
    const wallX = p.cx + wallSide * (p.w / 2 - 2);
    const dash = rig.wDash;
    this.smear += ((p.motion === 'dash' && p.freeze === 0 ? 1 : 0) - this.smear) * (1 - Math.exp(-dt * 20));
    // In the somersault the chains turn with the body but looser, so the tail wraps round it.
    const flip = rig.spinPhi * (rig.yawRaw >= 0 ? 1 : -1);
    const stiff = (1 + dash * 2.2) * (1 + 1.1 * rig.spinW);
    for (const c of this.all) {
      c.floorY = floorY;
      c.wallSide = wallSide;
      c.wallX = wallX;
      c.d = rig.yawRaw;
      c.rot = rig.lean * 0.5 + flip;
      c.pushX = 0;
      c.pushY = 0;
    }

    // --- Tail. The root angle is never still: two slow drifts in idle, the stride in a run. The
    // chain's local-bend pull carries each change down to the tip as a wave.
    const still = rig.wIdle;
    const sway =
      still * (0.17 * Math.sin(clock * 1.05 + 0.6 * Math.sin(clock * 0.37)) + 0.12 * noise1(clock * 0.45, 9));
    const flick = pulse(clock, 6.7, 0.7, 23, 0.7);
    const fl = flick > 0 ? Math.sin(flick * Math.PI * 2) * (1 - flick) * 0.5 * still : 0;
    const tail = this.tail;
    rig.wj(J_TAIL);
    tail.ax = rig.X;
    tail.ay = rig.Y;
    // Air lifts loose things when he falls and presses them down when he rises.
    const airLift = -clamp(p.vy, -12, 22) * rig.wAir;
    // On the wall it sways free; on a landing it drops and springs back up.
    const wallSway = rig.wWall * (0.2 * Math.sin(clock * 2.3) + 0.12 * Math.sin(clock * 3.7 + 1));
    if (rig.sig.landed > 0) this.landS.v += clamp(rig.sig.landed * 0.4, 1.5, 7);
    const drop = this.landS.step(0, dt);
    tail.lift =
      rig.tailLift + sway + fl + wallSway + drop + clamp(rig.dragY * 0.03, -0.25, 0.25) + airLift * 0.034;
    tail.curl = rig.tailCurl + still * 0.03 * Math.sin(clock * 0.71 + 2) + rig.wWall * -0.03;
    tail.stiff = stiff;
    tail.lenScale = 1 + this.smear * 0.3;

    // --- Sash tails: light cloth from the knot at the small of the back.
    rig.wj(J_KNOT);
    const gust = noise1(clock * 0.6, 17);
    for (const c of [this.sashA, this.sashB]) {
      c.ax = rig.X;
      c.ay = rig.Y;
      c.lift = rig.sashLift + 0.06 * gust + airLift * 0.03;
      c.curl = rig.wRun * 0.02 + rig.spinW * 0.32;
      c.stiff = stiff;
      c.lenScale = 1 + this.smear * 0.45;
    }
    this.sashA.lift += 0.08;

    // --- Charm.
    rig.wj(J_CHARM);
    this.charm.ax = rig.X;
    this.charm.ay = rig.Y;
    this.charm.stiff = 1;
    this.charm.lift = 0;

    for (const c of this.all) c.advance(dt, clock);

    // --- Ears: laid back by speed, perked at rest, each on its own spring; now and then one swivels.
    const lay =
      rig.ears * (1 + 0 * still) + sat(Math.abs(rig.vf) / 12) * 0.12 - clamp(rig.dragX * 0.05, -0.3, 0.3);
    const droop = clamp(rig.dragY * 0.035, -0.12, 0.3);
    const sw1 = pulse(clock, 3.1, 0.8, 41, 0.75);
    const sw2 = pulse(clock, 4.3, 0.24, 43, 0.8);
    const sw3 = pulse(clock, 3.7, 0.9, 47, 0.7);
    const sw4 = pulse(clock, 5.9, 0.2, 53, 0.8);
    const bump = (t: number): number => (t > 0 ? Math.sin(Math.PI * t) ** 2 : 0);
    const flickN = still * (-0.3 * bump(sw1) + 0.2 * bump(sw2));
    const flickF = still * (0.3 * bump(sw3) - 0.18 * bump(sw4));
    if (rig.sig.landed > 0) {
      const k = clamp(rig.sig.landed * 0.5, 2, 9);
      this.earNS.v -= k;
      this.earFS.v -= k * 0.8;
    }
    if (rig.sig.turned) {
      this.earNS.v -= 3;
      this.earFS.v -= 4.5;
    }
    this.earN = this.earNS.step(-lay - droop + flickN, dt);
    this.earF = this.earFS.step(-lay * 1.08 - droop * 1.2 + flickF, dt);
    this.hem = this.hemS.step(rig.hem + clamp(rig.dragX * 0.08, -0.4, 0.4), dt);
  }
}
