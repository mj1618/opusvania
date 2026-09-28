/**
 * Sim entry point. Pure and deterministic: (state, input, tuning) -> next state + events.
 * No Pixi, DOM, audio, Math.random or Date.now anywhere under src/sim (enforced by
 * tsconfig.sim.json, biome overrides and tests/unit/sim-purity.test.ts).
 */
import { tickSold } from './ai/boss';
import {
  enemyBookkeeping,
  enemyHitsOnKid,
  leviedHitsEnemies,
  spawnEnemy,
  springEnemies,
  updateEnemies,
} from './ai/enemy';
import { shotsHitKid, updateShots } from './ai/shots';
import { applyHitstop, beginHitstopStep } from './combat/hitstop';
import {
  hurtKid,
  kidAction,
  kidBookkeeping,
  kidCountStep,
  kidDown,
  kidHits,
  kidInputMask,
  kidInvulnerable,
  kidMovementCancels,
  kidRunMult,
  latchAction,
  slipClean,
  staticLeak,
} from './combat/kid';
import type { SimEvent } from './events';
import type { InputFrame } from './input';
import { springContacts, updateLevied } from './levied';
import { BASE_PROFILE, resolveParams } from './player/params';
import { createPlayer, latchOnly, updatePlayer } from './player/player';
import { updateWeight } from './player/weight';
import { seedRng } from './rng';
import { chinMax, newRun } from './run';
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
    version: 5,
    frame: 0,
    seed: opts.seed >>> 0,
    rng: seedRng(opts.seed),
    roomId,
    prevInput: 0,
    player: null as unknown as GameState['player'],
    transition: null,
    roomStats: { deaths: 0, goal: false, optional: false, frames: 0 },
    hitstop: 0,
    hitstopReq: { frames: 0, cls: 'light' },
    run: newRun(),
    local,
  };
  rebuildSolids(state, t.world.tileSize);
  state.player = createPlayer(sp, t, room, { abilities: room.abilities });
  loadRoom(state, roomId, opts.spawn, t, events);
  return state;
}

/**
 * Puts the player at a spawn in a room. Keeps the frame count, RNG, the run (Poundage, Lien,
 * Corner), the player's Chin and movement profile. Abilities come from the room (gym semantics).
 * Room-local state (sources, sounds, bag, levied objects, enemies, shots, plates, gates) is
 * rebuilt from the room data: leaving a room regenerates it and every sound goes home. A Runner
 * holding Kid's Poundage waits in the room where she went down.
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
  const max = chinMax(state, t);
  const old = state.player;
  const chin = old && !old.down ? Math.max(1, Math.min(max, old.chin)) : max;
  state.roomId = roomId;
  state.local = buildLocal(room, t);
  const r = state.run.runner;
  if (r && r.roomId === roomId) spawnEnemy(state.local, 'runner', r.x, r.feetY);
  state.hitstop = 0;
  state.hitstopReq.frames = 0;
  rebuildSolids(state, t.world.tileSize);
  state.player = createPlayer(sp, t, room, { abilities: room.abilities, profile, chin, chinMax: max });
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

/**
 * Advances the sim by exactly one 1/60 s step, mutating `state` and appending to `events`.
 * Per-step order (combat-spec §3.1): transition, hitstop, sold lots + dynamic solids, Kid action
 * (or her Count), movement, levied entities, shots, enemies, resolution (Kid's hits, enemy hits
 * and shots on Kid, levied projectiles, springs, plates/gates), hitstop apply, weight, bookkeeping.
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
      beginHitstopStep(state);
      // 3. Sold lots come back; dynamic solids (pending sources re-solidify first when clear).
      tickSold(state, events);
      retryPending(state, events);
      rebuildSolids(state, P.tileSize);
      let prevFeet = p.y + p.h;
      if (p.down) {
        // Down for her Count: the world keeps moving, Kid doesn't.
        kidCountStep(state, input, t, events);
      } else {
        // 4. Kid action. 5. Movement (the L2 controller) with the hurt lock, a rooting move,
        // the Cross's planted run cap and the punch recoil.
        kidAction(state, room, input, t, P, events);
        P.maxRun *= kidRunMult(state);
        if (p.recoilT > 0) p.vx = p.recoilVx;
        prevFeet = p.y + p.h;
        const before = events.length;
        updatePlayer(state, room, kidInputMask(state, input, t), P, events);
        kidMovementCancels(state, events, before);
      }
      // 6. Levied entities and shots. 7. Enemies.
      updateLevied(state, room, t, events);
      updateShots(state, room, t, events);
      updateEnemies(state, room, t, events);
      // 8. Resolution.
      const kid = state.player;
      if (!kid.down) {
        kidHits(state, t, P, events);
        const inv = kidInvulnerable(state, t, P);
        const slipped = { enemy: 0 };
        const hit = enemyHitsOnKid(state, t, events, inv, slipped) ?? shotsHitKid(state, inv, slipped);
        if (slipped.enemy) slipClean(state, slipped.enemy, t, events);
        if (hit) hurtKid(state, room, hit.dmg, hit.fromX, hit.enemy?.id ?? -1, hit.attack, t, events);
        // A hazard took the last pip: down for the Count instead of the safe-ground respawn.
        if (kid.chin <= 0 && kid.hazardRespawn && !kid.down) kidDown(state, t, events);
      }
      leviedHitsEnemies(state, t, events);
      springContacts(state, room, t, P, prevFeet, events);
      springEnemies(state, t, events);
      updatePlatesAndGates(state, t, events);
      staticLeak(state, t, events);
      // 9. Hitstop. 10. Weight (applies from the next step). 11. Bookkeeping.
      applyHitstop(state, t, events);
      updateWeight(state, t, events);
      kidBookkeeping(state, events);
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
