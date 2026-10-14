/**
 * Sim entry point. Pure and deterministic: (state, input, tuning, scene) -> next state + events.
 * No Pixi, DOM, audio, Math.random or Date.now anywhere under src/sim (enforced by
 * tsconfig.sim.json, biome overrides and tests/unit/sim-purity.test.ts).
 */
import { contactDamage, createEnemies, enemyTouched, resetEnemies, updateEnemies } from './enemies';
import type { SimEvent } from './events';
import { updateOffer } from './giving';
import { createGoal, goalHolds, goalReformed, heldInput, restPoint, updateGoal } from './goal';
import type { InputFrame } from './input';
import { createPickups, dropGlints, updateDrops, updatePickups } from './pickups';
import { resolveParams } from './player/params';
import {
  createPlayer,
  hurtPlayer,
  keepOffer,
  reformPlayer,
  trackSafeGround,
  updatePlayer,
} from './player/player';
import { createPods, updatePods } from './pods';
import { seedRng } from './rng';
import type { Scene } from './scene';
import { markSeen } from './seen';
import type { GameState } from './state';
import type { Tuning } from './tuning';

export const SIM_HZ = 60;

export function createState(seed: number, t: Tuning, scene: Scene, events: SimEvent[] = []): GameState {
  const state: GameState = {
    version: 20,
    frame: 0,
    seed: seed >>> 0,
    rng: seedRng(seed),
    prevInput: 0,
    player: createPlayer(scene.spawn.x, scene.spawn.y, t, scene),
    pickups: createPickups(scene),
    pods: createPods(scene),
    enemies: createEnemies(scene, t),
    goal: createGoal(scene),
  };
  events.push({ type: 'spawn', x: scene.spawn.x, y: scene.spawn.y });
  return state;
}

/**
 * Puts a fresh player with its feet centre at (x, y): at rest, facing right, every timer cleared.
 * The frame count, the RNG, what has been collected, the enemies, the lanterns, her health, her
 * last safe ground and the slash count are kept (a player placed while faded is whole again).
 */
export function placePlayer(
  state: GameState,
  x: number,
  y: number,
  t: Tuning,
  scene: Scene,
  events: SimEvent[],
): void {
  const old = state.player;
  state.player = createPlayer(x, y, t, scene);
  if (old.hp > 0) state.player.hp = Math.min(old.hp, state.player.hpMax);
  // Being placed somewhere does not make it safe ground: the last safe spot stands until she earns a new one.
  state.player.safeX = old.safeX;
  state.player.safeY = old.safeY;
  // Slashes stay numbered on: targets remember the last slash that hit them (`hitBy`), so a
  // number used again would pass through whatever it hit before.
  state.player.attackSeq = old.attackSeq;
  keepOffer(state.player, old);
  state.prevInput = 0;
  events.push({ type: 'spawn', x, y });
}

/** Advances the sim by exactly one 1/60 s step, mutating `state` and appending to `events`. */
export function step(state: GameState, input: InputFrame, t: Tuning, scene: Scene, events: SimEvent[]): void {
  const P = resolveParams(t);
  const first = events.length;
  // The end of a fade: she re-forms at the last safe ground and the living enemies go home.
  if (state.player.faded > 0 && --state.player.faded === 0) {
    dropGlints(state, scene, t.health.fadeDrop, events);
    const light = restPoint(state, scene, t);
    reformPlayer(state, scene, P, events, light);
    goalReformed(state.goal, light);
    resetEnemies(state, scene, t, events);
  }
  // From the end of the run on she is held (no input reaches her; she walks into the heart and
  // stops) and nothing can hurt her.
  const held = goalHolds(state.goal, t.goal);
  const ran = updatePlayer(state, scene, held ? heldInput(state, scene, t.goal) : input, P, t.pods, events);
  // Her offer (memory/giving.md): a glint given this step, one arriving.
  updateOffer(state, scene, t, held ? 0 : input, held, events);
  const touch = updateEnemies(state, scene, t, events, first);
  const p = state.player;
  const e = touch >= 0 ? state.enemies[touch] : undefined;
  if (e && p.invuln === 0 && p.hp > 0 && !state.goal.gathered) {
    const pc = p.x + p.w / 2;
    const ec = e.x + e.w / 2;
    const dir = pc < ec ? -1 : pc > ec ? 1 : -p.facing;
    // Kindling a lantern or a lamp (`kindling` is last step's: she was in the channel) nothing can hurt her:
    // what touches her is turned away as if it had, and she is not.
    if (p.kindling < 0 && p.kindlingLamp < 0) {
      const hitX = (Math.max(p.x, e.x) + Math.min(p.x + p.w, e.x + e.w)) / 2;
      const hitY = (Math.max(p.y, e.y) + Math.min(p.y + p.h, e.y + e.h)) / 2;
      hurtPlayer(
        state,
        P,
        dir,
        contactDamage(state, touch, t),
        { kind: e.kind, id: e.id },
        hitX,
        hitY,
        events,
      );
    }
    enemyTouched(state, scene, touch, dir, t, events);
  }
  if (ran) trackSafeGround(state, scene, P);
  updatePods(state, scene, t.pickups.comboFrames, events);
  updatePickups(state, scene, t.pickups, events);
  updateDrops(state, t.pickups, events);
  updateGoal(state, scene, t, input, events, first);
  markSeen(state, t);
  state.prevInput = input;
  state.frame++;
}

export type { SimEvent } from './events';
export { goalHolds, heartBox, lampCost, lanternBox, lanternCost } from './goal';
export { hashState } from './hash';
export { slashBox, slashTuning } from './player/attack';
export type { EnemyKind, EnemySpawn, Lantern, Pickup, PickupKind, Pod, PodMount, Scene } from './scene';
export type {
  AttackDir,
  EnemyMode,
  EnemyState,
  GameState,
  GlintDrop,
  GoalState,
  LanternState,
  Motion,
  PickupsState,
  PlayerMode,
  PlayerState,
  PodsState,
} from './state';
export { cloneState } from './state';
