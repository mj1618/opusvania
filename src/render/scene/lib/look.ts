/**
 * Shared look constants so every layer agrees on colour, light direction and wind.
 * Owned by the orchestrator: read it, don't edit it (ask for a change in your report instead).
 * Source of truth for the intent is docs/art-direction.md.
 */

/** Palette anchors (0xRRGGBB). Mix between them; don't invent new hue families. */
export const PALETTE = {
  shadowDeep: 0x061a24,
  shadow: 0x0b2a33,
  shadowIndigo: 0x12233f,
  fogFar: 0x5fa3a8,
  fogMid: 0x2f6f78,
  foliageDark: 0x0f4a3c,
  foliage: 0x1f7a55,
  foliageLit: 0x6fbf6a,
  foliageSun: 0xc9d977,
  bark: 0x1a2a30,
  barkLit: 0x4a5a4e,
  keyWarm: 0xffd9a0,
  keyGold: 0xffb36b,
  glowCyan: 0x9ff3ff,
  glowViolet: 0xc58bff,
  ember: 0xffb86b,
} as const;

/**
 * The warm key light. It enters above the canopy at ENTRY (world px, playfield space) and travels
 * along DIR (unit vector, y down): down and to the left. Shafts follow DIR; rims sit on the side of
 * a shape that faces -DIR (its upper right).
 */
export const KEY_LIGHT = {
  entryX: 3400,
  entryY: -300,
  dirX: -0.42,
  dirY: 0.91,
  color: PALETTE.keyWarm,
} as const;

/**
 * Wind as a travelling wave. Returns roughly -1..1: how far something at world x leans right now.
 * Multiply by your own amplitude (and by height above the anchor, so tips move and bases don't).
 * `phase` de-syncs neighbours (use a per-instance seed 0..1).
 */
export function wind(x: number, clock: number, phase = 0): number {
  const t = clock * 0.9 - x * 0.0016 + phase * 6.283;
  const gust = 0.5 + 0.5 * Math.sin(clock * 0.23 - x * 0.0005);
  return Math.sin(t) * (0.35 + 0.45 * gust) + Math.sin(t * 2.7 + 1.3) * 0.14 + Math.sin(t * 5.1) * 0.05;
}

/** Seeded PRNG for layout (never Math.random: screenshots must be reproducible). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear mix of two 0xRRGGBB colours. */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
