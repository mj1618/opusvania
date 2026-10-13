/**
 * The burrback's walk, as pure functions of how far it has walked: a tripod gait (front and rear
 * leg of one side with the middle leg of the other, the two sets half a cycle apart). A planted
 * foot stays exactly where it is in the world: while it is down its offset from the body shrinks
 * by one px per px walked. No state, so any frame can be drawn from the sim state alone.
 */

export interface GaitSpec {
  /** Body travel per full cycle, px. */
  readonly cycle: number;
  /** Share of the cycle a foot is planted (0..1). */
  readonly stance: number;
  /** Swing height, px. */
  readonly lift: number;
}

/** Six legs: index 0-2 = one side (front, middle, rear), 3-5 = the other. Phase offsets of the tripod. */
export const LEG_PHASE: readonly number[] = [0, 0.5, 0.04, 0.54, 0.02, 0.5];
/** Which side of the body: +1 = the side toward the camera when it faces right. */
export const LEG_SIDE: readonly number[] = [1, 1, 1, -1, -1, -1];
/** 0 front, 1 middle, 2 rear. */
export const LEG_ROW: readonly number[] = [0, 1, 2, 0, 1, 2];

/** Result slot of `footAt` (reused: no allocation). */
export const foot = { along: 0, lift: 0, down: false };

function frac(v: number): number {
  return v - Math.floor(v);
}

/** Where leg `i` is in its cycle (0..1; planted while below `stance`) after `dist` px of walking. */
export function legPhase(dist: number, i: number, g: GaitSpec): number {
  return frac(dist / g.cycle + (LEG_PHASE[i] ?? 0));
}

/**
 * Leg `i`'s foot after `dist` px of walking: `foot.along` = its offset from its home, px along the
 * way the creature faces (positive = ahead), `foot.lift` = height off the ground, `foot.down` =
 * planted.
 */
export function footAt(dist: number, i: number, g: GaitSpec): void {
  const ph = legPhase(dist, i, g);
  const reach = g.stance * g.cycle;
  if (ph < g.stance) {
    foot.along = reach / 2 - ph * g.cycle;
    foot.lift = 0;
    foot.down = true;
    return;
  }
  const u = (ph - g.stance) / (1 - g.stance);
  // Ease in and out of the swing so the foot leaves and meets the ground without a kink.
  const s = u * u * (3 - 2 * u);
  foot.along = -reach / 2 + reach * s;
  foot.lift = Math.sin(Math.PI * u) * g.lift;
  foot.down = false;
}

/** How many of the six feet are planted (a tripod gait never has fewer than three). */
export function planted(dist: number, g: GaitSpec): number {
  let n = 0;
  for (let i = 0; i < 6; i++) if (legPhase(dist, i, g) < g.stance) n++;
  return n;
}

/** Shell bob (0..1, twice per cycle: once per tripod) and rock (-1..1, once per cycle). */
export function bobAt(dist: number, g: GaitSpec): number {
  const c = Math.cos((dist / g.cycle) * Math.PI * 4);
  return 0.5 - 0.5 * c;
}

export function rockAt(dist: number, g: GaitSpec): number {
  return Math.sin((dist / g.cycle) * Math.PI * 2);
}
