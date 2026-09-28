/**
 * Sim entry point. Pure and deterministic: (state, input, tuning) -> next state + events.
 * No Pixi, DOM, audio, Math.random or Date.now anywhere under src/sim (enforced by
 * tsconfig.sim.json, biome overrides and tests/unit/sim-purity.test.ts).
 */
import {
  enemyBookkeeping,
  enemyHitsOnKid,
  leviedHitsEnemies,
  spawnEnemy,
  springEnemies,
  updateEnemies,
} from './ai/enemy';
import { applyHitstop, beginHitstopStep } from './combat/hitstop';
import {
  hurtKid,
  kidAction,
  kidBookkeeping,
  kidHits,
  kidInvulnerable,
  kidMovementCancels,
  latchAction,
} from './combat/kid';
import type { SimEvent } from './events';
import { ActionBit, type InputFrame } from './input';
import { springContacts, updateLevied } from './levied';
import { BASE_PROFILE, resolveParams } from './player/params';
import { createPlayer, latchOnly, updatePlayer } from './player/player';
import { updateWeight } from './player/weight';
import { seedRng } from './rng';
import { retryPending } from './sound';
import { buildLocal } from './sources';
import type { GameState } from './state';
import type { Tuning } from './tuning';
import { rebuildSolids } from './world/dynamic';
import { updatePlatesAndGates } from './world/gates';
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
  const local = buildLocal(room, t);
  const state: GameState = {
    version: 4,
    frame: 0,
    seed: opts.seed >>> 0,
    rng: seedRng(opts.seed),
    roomId,
    prevInput: 0,
    player: null as unknown as GameState['player'],
    transition: null,
    roomStats: { deaths: 0, goal: false, optional: false, frames: 0 },
    hitstop: 0,
    local,
  };
  rebuildSolids(state, t.world.tileSize);
  state.player = createPlayer(sp, t, room, { abilities: room.abilities });
  loadRoom(state, roomId, opts.spawn, t, events);
  return state;
}

/**
 * Puts the player at a spawn in a room. Keeps the frame count, RNG and the player's movement
 * profile. Abilities come from the room (gym semantics: each room declares what it grants).
 * Room-local state (sources, sounds, bag, levied objects, enemies, plates, gates) is rebuilt
 * from the room data: leaving a room regenerates it and every sound goes home.
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
  // Carrying the bag: the weight class starts at feather (the bag is empty on entry).
  const profile = room.abilities.seize ? 'feather' : (state.player?.profile ?? BASE_PROFILE);
  state.roomId = roomId;
  state.local = buildLocal(room, t);
  state.hitstop = 0;
  rebuildSolids(state, t.world.tileSize);
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

/** Debug/test: spawns an enemy with its feet at (x, feetY) (a replay op when done via Game). */
export function spawnEnemyAt(state: GameState, type: string, x: number, feetY: number): number {
  return spawnEnemy(state.local, type, x, feetY);
}

const LOCK_MASK = ~(ActionBit.left | ActionBit.right | ActionBit.jump | ActionBit.dash);

/**
 * Advances the sim by exactly one 1/60 s step, mutating `state` and appending to `events`.
 * Per-step order (L3 brief §2.5): transition, hitstop, dynamic solids, Kid action, movement,
 * levied entities, enemies, resolution, hitstop apply, weight, bookkeeping.
 */
export function step(state: GameState, input: InputFrame, t: Tuning, events: SimEvent[]): void {
  const tr = state.transition;
  if (tr) {
    tr.timer--;
    if (tr.timer <= 0) loadRoom(state, tr.to, tr.spawn, t, events);
  } else {
    const room = getRoom(state.roomId);
    const P = resolveParams(t, state.player.profile);
    if (state.hitstop > 0) {
      // 2. Global hitstop: nothing moves and no timers run; presses are latched.
      state.hitstop--;
      latchOnly(state, room, input, P);
      latchAction(state, input, t);
    } else {
      const p = state.player;
      beginHitstopStep();
      // 3. Dynamic solids (pending sources re-solidify first when clear).
      retryPending(state, events);
      rebuildSolids(state, P.tileSize);
      // 4. Kid action.
      kidAction(state, room, input, t, P, events);
      // 5. Movement (the L2 controller). Control lock after a hit; recoil pushes.
      if (p.recoilT > 0) p.vx = p.recoilVx;
      const prevFeet = p.y + p.h;
      const before = events.length;
      updatePlayer(state, room, p.hurtLock > 0 ? input & LOCK_MASK : input, P, events);
      // A reload after Chin ran out (the player respawned with no Chin left).
      if (state.player.chin <= 0 && state.player.state !== 'dead') {
        loadRoom(state, state.roomId, undefined, t, events);
        state.prevInput = input;
        state.frame++;
        return;
      }
      kidMovementCancels(state, events, before);
      // 6. Levied entities. 7. Enemies.
      updateLevied(state, room, t, events);
      updateEnemies(state, room, t, events);
      // 8. Resolution: Kid's hitboxes, enemy hitboxes, levied projectiles, springs, plates/gates.
      kidHits(state, t, events);
      const hurt = enemyHitsOnKid(state, t, events, kidInvulnerable(state, t, P));
      if (hurt) hurtKid(state, hurt.dmg, hurt.enemy, t, P, events);
      leviedHitsEnemies(state, t, events);
      springContacts(state, room, t, P, prevFeet, events);
      springEnemies(state, t, events);
      updatePlatesAndGates(state, t, events);
      // 9. Hitstop. 10. Weight (applies from the next step). 11. Bookkeeping.
      applyHitstop(state, t, events);
      updateWeight(state, t, events);
      kidBookkeeping(state);
      enemyBookkeeping(state, t, events);
      state.roomStats.frames++;
    }
  }
  state.prevInput = input;
  state.frame++;
}

export { hashState } from './hash';
export type { GameState, PlayerState } from './state';
export { cloneState } from './state';
