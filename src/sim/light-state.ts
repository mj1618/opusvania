/**
 * Lanternroot's room-local light state (src/sim/light.ts, memory/glow.md): plain JSON, rebuilt on every room
 * entry (`createLight` in `createLocal`). Its own file so `state.ts` can hold it without a cycle.
 */
import type { Scene } from './scene';
import type { Tuning } from './tuning';

/** How long a kindled moonwick burns: its own `burn`, else `moonwick.burn`. */
export function wickBurn(l: { burn?: number | undefined }, t: Tuning): number {
  return Math.max(1, Math.round(l.burn ?? t.moonwick.burn));
}

/** A gust in flight: its box centre, unit direction, frames left, and the ids it has already met (once each). */
export interface GustState {
  x: number;
  y: number;
  dx: number;
  dy: number;
  frames: number;
  hits: string[];
}

/**
 * A bell-cap's count (`scene.bells`): `n` strikes counted so far in the dark (each lights a ring of its gills),
 * `last` = the frame of the last one, `seq` = the gaps read so far (`.` short, `-` long), `hitBy` = the slash
 * that last struck it (one strike a slash).
 */
export interface BellState {
  n: number;
  last: number;
  seq: string;
  hitBy: number;
}

export interface LightState {
  gust: GustState | null;
  /** Per `scene.moonmoss`: 1 while it is solid. */
  moss: number[];
  bells: BellState[];
  /** Per `scene.pods`: frames until a burst glow pod's bud is back (0 = none pending). */
  regrow: number[];
  /** Per `scene.enemies`: frames until a dead `respawn` creature is back (0 = none pending). */
  respawn: number[];
  /** Per `scene.enemies`: 1 while a `fight` creature is held out of the room (no fight on). */
  hidden: number[];
  /** Per `scene.wickSets`: 1 once it has burned whole (its flag is in the save). */
  sets: number[];
}

export function createLight(
  scene: Scene,
  save: { flags: readonly string[]; abilities?: readonly string[] },
): LightState {
  // (A creature that waits for a flag starts held out: one set on the first step then arrives, Canopy r8.)
  const has = (w: string) => save.flags.includes(w) || (save.abilities ?? []).includes(w);
  return {
    gust: null,
    moss: (scene.moonmoss ?? []).map(() => 0),
    bells: (scene.bells ?? []).map(() => ({ n: 0, last: 0, seq: '', hitBy: 0 })),
    regrow: (scene.pods ?? []).map(() => 0),
    respawn: (scene.enemies ?? []).map(() => 0),
    hidden: (scene.enemies ?? []).map((e) => (e.wakes && !has(e.wakes) ? 1 : 0)),
    sets: (scene.wickSets ?? []).map((w) => (save.flags.includes(w.sets) ? 1 : 0)),
  };
}

export function cloneLight(l: LightState): LightState {
  return {
    gust: l.gust ? { ...l.gust, hits: l.gust.hits.slice() } : null,
    moss: l.moss.slice(),
    bells: l.bells.map((b) => ({ ...b })),
    regrow: l.regrow.slice(),
    respawn: l.respawn.slice(),
    hidden: l.hidden.slice(),
    sets: l.sets.slice(),
  };
}
