/**
 * The bombardier's sounds (memory/audio.md "The bombardier"; sim src/sim/enemies/bombardier.ts): its tell is a boil
 * coming up (bubbles quickening and rising under a low simmer, a tick on each), each droplet a wet pop, a splash a
 * hiss of steam with a sizzle, and a deflect a bright struck ping (the best hit there is: it rings). Same rules as
 * bake.ts: organic, from zero to zero, nothing harsh above ~7 kHz.
 */
import { at, click, exp, len, type Recipe } from './bake-lib';
import { arEnv, biquad, mixInto, modes, normalize, pink, shape, white } from './dsp';

export const BOMB_SOUNDS = {
  bombBoil: 3,
  bombPop: 4,
  bombHiss: 4,
  bombPing: 3,
} as const;
export type BombSoundId = keyof typeof BOMB_SOUNDS;

/** A bubble: a sine whose pitch rises as it closes (a real bubble's chirp), `d` s. */
function bubble(sr: number, f0: number, f1: number, d: number): Float32Array {
  const n = len(sr, d);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * exp(f0, f1, t / d)) / sr;
    x[i] = Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / (d * 0.35));
  }
  return x;
}

function sum(parts: Array<[Float32Array, number, number?]>): Float32Array[] {
  const n = Math.max(...parts.map(([x, , o]) => x.length + (o ?? 0)));
  const out = new Float32Array(n);
  for (const [x, g, o] of parts) {
    normalize([x]);
    mixInto(out, x, g, o ?? 0);
  }
  return normalize([out]);
}

export const BOMB_RECIPES: Record<BombSoundId, Recipe> = {
  /** The tell (~0.75 s, its tell's length): a simmer swelling, bubbles quickening and rising, a dry tick on each. */
  bombBoil(sr, r) {
    const d = 0.78;
    const n = len(sr, d);
    const simmer = pink(n, r);
    biquad(simmer, sr, 'lowpass', 520);
    biquad(simmer, sr, 'lowpass', 900);
    shape(simmer, sr, arEnv(0.5, 0.2, 0.05, d));
    const bubbles = new Float32Array(n);
    const ticks = new Float32Array(n);
    let t = 0.03;
    let k = 0;
    while (t < d - 0.05) {
      const u = t / d;
      const f = 180 + 520 * u + r() * 120;
      mixInto(bubbles, bubble(sr, f, f * 1.9, 0.02 + 0.02 * r()), 0.4 + 0.6 * u, at(sr, t));
      if (k % 2 === 0) mixInto(ticks, click(sr, r, len(sr, 0.02), 2600, 0.0015), 0.3 + 0.7 * u, at(sr, t));
      // Quickening: the gaps shrink toward the end of the tell.
      t += (0.11 - 0.085 * u) * (0.7 + 0.6 * r());
      k++;
    }
    return sum([
      [simmer, 0.55],
      [bubbles, 1],
      [ticks, 0.35],
    ]);
  },
  /** A droplet leaving the turret: a wet pop (a falling chirp), a soft click, a puff of air. */
  bombPop(sr, r) {
    const d = 0.16;
    const f = 700 + r() * 220;
    const pop = bubble(sr, f, f * 0.42, 0.05);
    const puff = white(len(sr, d), r);
    biquad(puff, sr, 'bandpass', 1400 + r() * 300, 0.9);
    shape(puff, sr, arEnv(0.003, 0.004, 0.03, d));
    return sum([
      [pop, 1],
      [click(sr, r, len(sr, 0.03), 3000, 0.0012), 0.35],
      [puff, 0.45],
    ]);
  },
  /** A splash: steam hissing off (a band of noise, falling a little) and a crackle of sizzle in it. */
  bombHiss(sr, r) {
    const d = 0.42;
    const n = len(sr, d);
    const hiss = white(n, r);
    biquad(hiss, sr, 'bandpass', (i) => exp(4200, 2600, i / sr / d), 1.1);
    biquad(hiss, sr, 'lowpass', 5200);
    biquad(hiss, sr, 'lowpass', 6500);
    shape(hiss, sr, arEnv(0.004, 0.02, 0.11, d));
    const sizzle = new Float32Array(n);
    const g = 8 + Math.floor(r() * 6);
    for (let i = 0; i < g; i++)
      mixInto(
        sizzle,
        click(sr, r, len(sr, 0.01), 3600, 0.0008),
        0.3 + 0.7 * r(),
        at(sr, 0.01 + 0.25 * r() ** 1.6),
      );
    const slap = bubble(sr, 420 + r() * 80, 160, 0.04);
    return sum([
      [hiss, 1],
      [sizzle, 0.35],
      [slap, 0.4],
    ]);
  },
  /** The deflect: a bright struck ping (inharmonic partials, a short ring) on a hard click, a little rising zing. */
  bombPing(sr, r) {
    const d = 0.55;
    const n = len(sr, d);
    const f = 1650 + r() * 160;
    const ring = new Float32Array(n);
    modes(ring, sr, [
      { f, tau: 0.22, amp: 1, beat: 3 },
      { f: f * 2.76, tau: 0.09, amp: 0.45 },
      { f: f * 0.5, tau: 0.12, amp: 0.3 },
    ]);
    shape(ring, sr, arEnv(0.0005, 0, 1e3, d));
    const zing = white(len(sr, 0.12), r);
    biquad(zing, sr, 'bandpass', (i) => exp(1500, 5200, i / sr / 0.08), 6);
    shape(zing, sr, arEnv(0.002, 0, 0.03, 0.12));
    return sum([
      [ring, 1],
      [click(sr, r, len(sr, 0.03), 5500, 0.001), 0.55],
      [zing, 0.3],
    ]);
  },
};
