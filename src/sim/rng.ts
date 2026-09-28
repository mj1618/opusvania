/**
 * Seeded RNG (mulberry32). The 32-bit state lives in GameState.rng so it is serialised,
 * hashed and replayed with everything else. Never use Math.random in src/sim.
 */
export interface RngHolder {
  rng: number;
}

export function seedRng(seed: number): number {
  // Mix the seed so small seeds (0, 1, 2) don't produce correlated first values.
  let s = (seed ^ 0x9e3779b9) >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b) >>> 0;
  s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35) >>> 0;
  return (s ^ (s >>> 16)) >>> 0;
}

/** Next float in [0, 1). Advances holder.rng. */
export function rngFloat(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) >>> 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function rngInt(h: RngHolder, n: number): number {
  return Math.floor(rngFloat(h) * n);
}

/** Float in [min, max). */
export function rngRange(h: RngHolder, min: number, max: number): number {
  return min + rngFloat(h) * (max - min);
}
