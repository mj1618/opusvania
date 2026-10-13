// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Ember's simulated parts: the hood's long crest and the mantle. The mantle is one piece of
 * cloth: five strands hanging from the collar, back edge to front edge, drawn as a single sheet
 * (draw.ts). Each strand is a chain with its own rest shape, so the cloth holds a bell silhouette
 * at rest, streams behind in a run, and opens like a wing when the pose asks for flare.
 */
import type { PlayerView } from '../../contract';
import { Chain, type ChainSpec } from './chain';
import { type Frame, J_CHEST, J_COLLAR, J_CREST, type Rig, S_D, S_DH, S_FLARE } from './rig';

/**
 * The hood's veil: the back of the hood falls in one long soft tail down the back, lying against
 * the mantle at rest and lifting into a second flowing line when the body moves.
 */
const CREST: ChainSpec = {
  len: [7, 7.5, 7.5, 7.5, 7],
  rest: [214, 245, 262, 268, 271],
  kG: [0.25, 0.02],
  kL: [0.35, 0.12],
  drag: 0.085,
  gravity: 700,
  wind: 380,
};

export interface StrandSpec {
  /** Anchor relative to the collar: forward and up (world px). */
  f: number;
  u: number;
  chain: ChainSpec;
  /** Radians of lift at flare 1 (- = swings back and up, + = forward and up). */
  flare: number;
}

function strand(len: number[], rest: number[], stiff: number, drag: number): ChainSpec {
  return {
    len,
    rest,
    kG: [0.2 * stiff, 0.014 * stiff],
    kL: [0.3 * stiff, 0.1 * stiff],
    drag,
    gravity: 1300,
    wind: 760,
  };
}

/** Back edge first, front edge last. The back is longer, softer and catches more air. */
export const STRANDS: readonly StrandSpec[] = [
  { f: -4.4, u: 0.3, chain: strand([9.5, 10.5, 10.5, 10], [238, 257, 266, 268], 0.6, 0.11), flare: -0.9 },
  { f: -3.4, u: 0.8, chain: strand([9, 10, 10, 9.5], [246, 261, 268, 269], 0.7, 0.1), flare: -0.65 },
  { f: -1.2, u: 1.2, chain: strand([8.5, 9.5, 9.5, 8.5], [264, 268, 270, 270], 0.95, 0.09), flare: -0.25 },
  { f: 1.8, u: 0.6, chain: strand([8, 8.5, 8, 7], [284, 275, 271, 270], 1.3, 0.08), flare: 0.12 },
  { f: 4, u: -0.6, chain: strand([7.5, 8, 7.5, 6], [297, 280, 273, 271], 1.6, 0.07), flare: 0.28 },
];

export class Secondary {
  readonly crest = new Chain(CREST);
  readonly mantle: Chain[] = STRANDS.map((s) => new Chain(s.chain));
  readonly all: Chain[];

  constructor() {
    this.all = [this.crest, ...this.mantle];
    this.all.forEach((c, i) => {
      c.phase = (i * 0.11) % 1;
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
    const floorY = p.grounded ? p.feetY - 1 : Number.POSITIVE_INFINITY;
    const wallSide = p.motion === 'wallSlide' ? p.wallDir : 0;
    const wallX = p.cx + wallSide * (p.w / 2 - 1);
    const stiff = 1 + rig.wDash * 1.4;
    for (const c of this.all) {
      c.floorY = floorY;
      c.wallSide = wallSide;
      c.wallX = wallX;
      c.stiff = stiff;
    }

    const crest = this.crest;
    crest.ax = j[J_CREST * 2]!;
    crest.ay = j[J_CREST * 2 + 1]!;
    crest.d = dh;
    crest.rot = rig.headAng;
    crest.lift = -rig.crestLift * 0.7;
    crest.curl = 0;

    const cx = j[J_COLLAR * 2]!;
    const cy = j[J_COLLAR * 2 + 1]!;
    // The collar's own axes on screen: up along the spine, forward a quarter turn toward the facing.
    let ux = cx - j[J_CHEST * 2]!;
    let uy = cy - j[J_CHEST * 2 + 1]!;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    const fx = -uy * d;
    const fy = ux * d;
    for (let i = 0; i < this.mantle.length; i++) {
      const c = this.mantle[i]!;
      const spec = STRANDS[i]!;
      c.ax = cx + fx * spec.f + ux * spec.u;
      c.ay = cy + fy * spec.f + uy * spec.u;
      c.d = d;
      c.rot = rig.upper * 0.8;
      c.lift = spec.flare * flare;
      c.curl = spec.flare * flare * 0.22;
    }

    for (const c of this.all) c.advance(dt, clock);
  }
}
