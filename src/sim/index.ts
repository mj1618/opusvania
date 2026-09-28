/**
 * Sim entry point. Pure and deterministic: (state, input, tuning) -> next state + events.
 * No Pixi, DOM, audio, Math.random or Date.now anywhere under src/sim (enforced by
 * tsconfig.sim.json, biome overrides and tests/unit/sim-purity.test.ts).
 */
import type { SimEvent } from './events';
import type { InputFrame } from './input';
import { createPlayer, updatePlayer } from './player/player';
import { seedRng } from './rng';
import type { GameState } from './state';
import type { Tuning } from './tuning';
import { DEFAULT_ROOM, getRoom } from './world/rooms';

export const SIM_HZ = 60;

export interface NewGameOptions {
  seed: number;
  roomId?: string;
  spawn?: string;
}

export function createState(opts: NewGameOptions, t: Tuning, events: SimEvent[] = []): GameState {
  const state: GameState = {
    version: 1,
    frame: 0,
    seed: opts.seed >>> 0,
    rng: seedRng(opts.seed),
    roomId: opts.roomId ?? DEFAULT_ROOM,
    prevInput: 0,
    player: createPlayer({ tx: 0, ty: 0 }, t),
  };
  loadRoom(state, state.roomId, opts.spawn, t, events);
  return state;
}

/** Puts the player at a spawn in a room. Keeps frame count and RNG. */
export function loadRoom(
  state: GameState,
  roomId: string,
  spawn: string | undefined,
  t: Tuning,
  events: SimEvent[],
): void {
  const room = getRoom(roomId);
  const key = spawn ?? 'default';
  const sp = room.spawns[key];
  if (!sp)
    throw new Error(`Room "${roomId}" has no spawn "${key}". Known: ${Object.keys(room.spawns).join(', ')}`);
  state.roomId = roomId;
  state.player = createPlayer(sp, t);
  state.prevInput = 0;
  events.push({ type: 'roomEnter', roomId, x: state.player.x, y: state.player.y });
}

export function reseed(state: GameState, seed: number): void {
  state.seed = seed >>> 0;
  state.rng = seedRng(seed);
}

/** Advances the sim by exactly one 1/60s step, mutating `state` and appending to `events`. */
export function step(state: GameState, input: InputFrame, t: Tuning, events: SimEvent[]): void {
  const room = getRoom(state.roomId);
  updatePlayer(state, room, input, t, events);
  state.prevInput = input;
  state.frame++;
}

export { hashState } from './hash';
export type { GameState, PlayerState } from './state';
export { cloneState } from './state';
