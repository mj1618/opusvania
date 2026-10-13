// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Wick's simulated parts, all verlet chains with rest shapes (../hooded/chain.ts):
 *   scarf      one long tail from the back of the neck
 *   tails      the two split coat tails from the back of the waist
 *   ribbons    two short hat ribbons
 *   skirt      the short coat skirt's centre line (drawn as one flared panel)
 *   lantern    a true pendulum on the glaive's hook: hook -> ring -> lantern body. No rest pull,
 *              only gravity, a little air drag and the hook's motion, so it swings, lags and settles.
 */
import type { PlayerView } from '../../contract';
import { wind } from '../../scene/lib/look';
import { Chain, type ChainSpec } from '../hooded/chain';
import { clamp, smoothstep } from '../hooded/math';
import { type Frame, J_HEAD, J_HOOK, J_NECK, J_PELVIS, type Rig, S_D, S_DH, S_FLARE, S_HATROT } from './rig';

const SCARF: ChainSpec = {
  len: [5.2, 5.4, 5.4, 5.4, 5.4, 5.4, 5.2, 5],
  rest: [246, 242, 236, 229, 222, 215, 208, 202],
  kG: [0.07, 0.0015],
  kL: [0.2, 0.05],
  drag: 0.07,
  gravity: 380,
  wind: 900,
};

function tail(len: number, a0: number, a1: number): ChainSpec {
  const rest: number[] = [];
  const lens: number[] = [];
  for (let i = 0; i < 5; i++) {
    rest.push(a0 + ((a1 - a0) * i) / 4);
    lens.push(len);
  }
  return { len: lens, rest, kG: [0.13, 0.006], kL: [0.28, 0.08], drag: 0.085, gravity: 900, wind: 700 };
}
const TAIL_FAR = tail(4.9, 246, 232);
const TAIL_NEAR = tail(5.3, 256, 244);

function ribbon(len: number, a0: number, a1: number): ChainSpec {
  const rest: number[] = [];
  const lens: number[] = [];
  for (let i = 0; i < 6; i++) {
    rest.push(a0 + ((a1 - a0) * i) / 5);
    lens.push(len);
  }
  return { len: lens, rest, kG: [0.12, 0.004], kL: [0.24, 0.06], drag: 0.085, gravity: 760, wind: 700 };
}

const SKIRT: ChainSpec = {
  len: [4.2, 4.2],
  rest: [268, 266],
  kG: [0.32, 0.16],
  kL: [0.4, 0.28],
  drag: 0.07,
  gravity: 800,
  wind: 200,
};

const LANTERN: ChainSpec = {
  len: [3.2, 9],
  rest: [270, 270],
  kG: [0, 0],
  kL: [0, 0],
  drag: 0.011,
  gravity: 1050,
  wind: 420,
};

export class Secondary {
  readonly scarf = new Chain(SCARF);
  readonly tailFar = new Chain(TAIL_FAR);
  readonly tailNear = new Chain(TAIL_NEAR);
  readonly ribA = new Chain(ribbon(3.7, 204, 256));
  readonly ribB = new Chain(ribbon(3, 222, 266));
  readonly skirt = new Chain(SKIRT);
  readonly lantern = new Chain(LANTERN);
  readonly all: Chain[];
  private readonly cloth: Chain[];

  constructor() {
    this.cloth = [this.scarf, this.tailFar, this.tailNear, this.ribA, this.ribB, this.skirt];
    this.all = [...this.cloth, this.lantern];
    this.all.forEach((c, i) => {
      c.phase = (i * 0.17) % 1;
    });
  }

  reset(): void {
    for (const c of this.all) c.reset();
  }

  update(dt: number, clock: number, rig: Rig, frame: Frame, p: PlayerView): void {
    const { j, s } = frame;
    const d = s[S_D]!;
    const dh = s[S_DH]!;
    const flare = s[S_FLARE]!;
    const floorY = p.grounded ? p.feetY - 0.5 : Number.POSITIVE_INFINITY;
    const wallSide = p.motion === 'wallSlide' ? p.wallDir : 0;
    const wallX = p.cx + wallSide * (p.w / 2 - 1);
    // Cloth goes soft in a fall (it opens and streams up) and is pinned back hard in a dash.
    const fallK = p.grounded ? 0 : smoothstep(3, 16, p.vy);
    // In the somersault it is held to a rest shape that wraps the ball in the trailing direction.
    const ball = Math.abs(rig.spin);
    const wrap = rig.spin;
    const stiff =
      (1 + rig.wDash * 1.2) * (1 - 0.72 * fallK * (1 - ball)) * (1 - 0.4 * rig.wWall) * (1 + 2.4 * ball);
    for (const c of this.all) {
      c.floorY = floorY;
      c.wallSide = wallSide;
      c.wallX = wallX;
    }
    const speed = clamp(Math.hypot(p.vx, p.vy) / 9.6, 0, 2);
    for (const c of this.cloth) {
      c.stiff = stiff;
      c.d = d;
      c.rot = rig.lean * 0.7 + rig.flip;
    }

    // Torso frame at the neck, pelvis frame at the hips (x forward, y down, leaning with the spine).
    const cl = Math.cos(rig.lean + rig.flip);
    const sl = Math.sin(rig.lean + rig.flip);
    const nx = j[J_NECK * 2]!;
    const ny = j[J_NECK * 2 + 1]!;
    const px = j[J_PELVIS * 2]!;
    const py = j[J_PELVIS * 2 + 1]!;

    // A flutter fed in at the roots while moving: it travels down the cloth as a wave.
    const fl = speed * (0.55 + 0.45 * Math.sin(clock * 5.3)) * (1 - ball);
    const f1 = Math.sin(clock * 21) * fl;
    const f2 = Math.sin(clock * 17.3 + 1.7) * fl;

    const sc = this.scarf;
    sc.ax = nx + (-4.6 * cl - 0.4 * sl) * d;
    sc.ay = ny + -4.6 * sl + 0.4 * cl + f1 * 1.3;
    // Ambient wind sways the rest shapes themselves, so standing still is never rigid.
    const calm = 1 - 0.6 * clamp(speed, 0, 1);
    const w1 = wind(p.cx, clock, 0.1) * calm;
    const w2 = wind(p.cx, clock * 1.37, 0.55) * calm;
    sc.lift = -flare * 0.25 + f2 * 0.05 + w1 * 0.2 - 0.05 - rig.wWall * 0.55 - wrap * 0.35;
    sc.curl = w2 * 0.06 + wrap * 0.3;

    const cw = Math.cos(rig.lean * 0.7 + rig.flip);
    const sw = Math.sin(rig.lean * 0.7 + rig.flip);
    const tf = this.tailFar;
    tf.ax = px + (-4.6 * cw + 3.2 * sw) * d;
    tf.ay = py + -4.6 * sw - 3.2 * cw + f2 * 0.8;
    tf.lift = -flare * 0.75 + w2 * 0.1 + wrap * 0.85;
    tf.curl = -flare * 0.1 + w1 * 0.03 + wrap * 0.34;
    const tn = this.tailNear;
    tn.ax = px + (-3.4 * cw + 3 * sw) * d;
    tn.ay = py + -3.4 * sw - 3 * cw + f1 * 0.8;
    tn.lift = -flare * 0.55 + w1 * 0.1 + wrap * 0.8;
    tn.curl = -flare * 0.08 + w2 * 0.03 + wrap * 0.34;

    const sk = this.skirt;
    sk.ax = px;
    sk.ay = py + 1.2;
    // Tucked, the skirt lies forward over the thighs instead of hanging on down the spine's line.
    sk.lift = ball * 1.55;
    sk.curl = 0;

    // Hat frame at the head centre.
    const hr = s[S_HATROT]!;
    const ch = Math.cos(hr);
    const sh = Math.sin(hr);
    const hx = j[J_HEAD * 2]!;
    const hy = j[J_HEAD * 2 + 1]!;
    const ra = this.ribA;
    ra.d = dh;
    ra.ax = hx + (-13 * dh * ch + 2.6 * sh);
    ra.ay = hy + -13 * dh * sh - 2.6 * ch + f2 * 0.5;
    ra.lift = -flare * 0.2 + w2 * 0.25;
    ra.curl = w1 * 0.08 + wrap * 0.22;
    const rb = this.ribB;
    rb.d = dh;
    rb.ax = hx + (-11 * dh * ch + 2.7 * sh);
    rb.ay = hy + -11 * dh * sh - 2.7 * ch + f1 * 0.5;
    rb.lift = -flare * 0.2 + w1 * 0.25;
    rb.curl = w2 * 0.08 + wrap * 0.22;

    const la = this.lantern;
    la.ax = j[J_HOOK * 2]!;
    la.ay = j[J_HOOK * 2 + 1]!;
    la.d = d;
    la.rot = 0;
    la.stiff = 1;

    for (const c of this.all) c.advance(dt, clock);
  }
}
