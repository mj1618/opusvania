/**
 * Sim entry point. Pure and deterministic: (state, input, tuning) -> next state + events.
 * No Pixi, DOM, audio, Math.random or Date.now anywhere under src/sim (enforced by
 * tsconfig.sim.json, biome overrides and tests/unit/sim-purity.test.ts).
 */
import type { SimEvent } from './events';
import type { InputFrame } from './input';
import { BASE_PROFILE, resolveParams } from './player/params';
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
  const roomId = opts.roomId ?? DEFAULT_ROOM;
  const room = getRoom(roomId);
  const sp = room.spawns.default;
  if (!sp) throw new Error(`Room "${roomId}" has no spawn`);
  const state: GameState = {
    version: 2,
    frame: 0,
    seed: opts.seed >>> 0,
    rng: seedRng(opts.seed),
    roomId,
    prevInput: 0,
    player: createPlayer(sp, t, room, { abilities: room.abilities }),
    transition: null,
    roomStats: { deaths: 0, goal: false, optional: false, frames: 0 },
  };
  loadRoom(state, roomId, opts.spawn, t, events);
  return state;
}

/**
 * Puts the player at a spawn in a room. Keeps the frame count, RNG and the player's movement
 * profile. Abilities come from the room (gym semantics: each room declares what it grants).
 */
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
  const profile = state.player?.profile ?? BASE_PROFILE;
  state.roomId = roomId;
  state.player = createPlayer(sp, t, room, { abilities: room.abilities, profile });
  state.prevInput = 0;
  state.transition = null;
  state.roomStats = { deaths: 0, goal: false, optional: false, frames: 0 };
  events.push({
    type: 'roomEnter',
    roomId,
    x: state.player.x + state.player.w / 2,
    y: state.player.y + state.player.h,
  });
}

export function reseed(state: GameState, seed: number): void {
  state.seed = seed >>> 0;
  state.rng = seedRng(seed);
}

/** Advances the sim by exactly one 1/60 s step, mutating `state` and appending to `events`. */
export function step(state: GameState, input: InputFrame, t: Tuning, events: SimEvent[]): void {
  const tr = state.transition;
  if (tr) {
    tr.timer--;
    if (tr.timer <= 0) loadRoom(state, tr.to, tr.spawn, t, events);
  } else {
    const room = getRoom(state.roomId);
    updatePlayer(state, room, input, resolveParams(t, state.player.profile), events);
    state.roomStats.frames++;
  }
  state.prevInput = input;
  state.frame++;
}

export { hashState } from './hash';
export type { GameState, PlayerState } from './state';
export { cloneState } from './state';
