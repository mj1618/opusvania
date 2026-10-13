/**
 * Sim entry point. Pure and deterministic: (state, input, tuning, scene) -> next state + events.
 * No Pixi, DOM, audio, Math.random or Date.now anywhere under src/sim (enforced by
 * tsconfig.sim.json, biome overrides and tests/unit/sim-purity.test.ts).
 */
import type { SimEvent } from './events';
import type { InputFrame } from './input';
import { createPickups, updatePickups } from './pickups';
import { resolveParams } from './player/params';
import { createPlayer, updatePlayer } from './player/player';
import { createPods, updatePods } from './pods';
import { seedRng } from './rng';
import type { Scene } from './scene';
import type { GameState } from './state';
import type { Tuning } from './tuning';

export const SIM_HZ = 60;

export function createState(seed: number, t: Tuning, scene: Scene, events: SimEvent[] = []): GameState {
  const state: GameState = {
    version: 10,
    frame: 0,
    seed: seed >>> 0,
    rng: seedRng(seed),
    prevInput: 0,
    player: createPlayer(scene.spawn.x, scene.spawn.y, t, scene),
    pickups: createPickups(scene),
    pods: createPods(scene),
  };
  events.push({ type: 'spawn', x: scene.spawn.x, y: scene.spawn.y });
  return state;
}

/**
 * Puts a fresh player with its feet centre at (x, y): at rest, facing right, every timer cleared.
 * The frame count, the RNG and what has been collected are kept.
 */
export function placePlayer(
  state: GameState,
  x: number,
  y: number,
  t: Tuning,
  scene: Scene,
  events: SimEvent[],
): void {
  state.player = createPlayer(x, y, t, scene);
  state.prevInput = 0;
  events.push({ type: 'spawn', x, y });
}

/** Advances the sim by exactly one 1/60 s step, mutating `state` and appending to `events`. */
export function step(state: GameState, input: InputFrame, t: Tuning, scene: Scene, events: SimEvent[]): void {
  updatePlayer(state, scene, input, resolveParams(t), t.pods, events);
  updatePods(state, scene, t.pickups.comboFrames, events);
  updatePickups(state, scene, t.pickups, events);
  state.prevInput = input;
  state.frame++;
}

export type { SimEvent } from './events';
export { hashState } from './hash';
export { slashBox, slashTuning } from './player/attack';
export type { Pickup, PickupKind, Pod, PodMount, Scene } from './scene';
export type {
  AttackDir,
  GameState,
  Motion,
  PickupsState,
  PlayerMode,
  PlayerState,
  PodsState,
} from './state';
export { cloneState } from './state';
