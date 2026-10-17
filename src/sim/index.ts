/**
 * Sim entry point. Pure and deterministic: (state, input, tuning, scene) -> next state + events.
 * No Pixi, DOM, audio, Math.random or Date.now anywhere under src/sim (enforced by
 * tsconfig.sim.json, biome overrides and tests/unit/sim-purity.test.ts).
 */
import { ABILITIES, normalizeAbilities } from './abilities';
import { contactDamage, createEnemies, enemyTouched, resetEnemies, updateEnemies } from './enemies';
import type { SimEvent } from './events';
import { markOfferTarget, updateOffer } from './giving';
import { createGoal, goalHolds, goalReformed, heldInput, restPoint, updateGoal } from './goal';
import { createHatch, updateHatch } from './hatch';
import type { InputFrame } from './input';
import { createLures, freePlayer } from './lures';
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
import type { Scene, SolidRect } from './scene';
import { markSeen } from './seen';
import type { GameState } from './state';
import type { Tuning } from './tuning';

export const SIM_HZ = 60;

/**
 * A fresh run in `scene`: she stands at its spawn. `abilities` = what she owns (default: the room's
 * starting kit, `scene.abilities`, or all of them when the room names none).
 */
export function createState(
  seed: number,
  t: Tuning,
  scene: Scene,
  events: SimEvent[] = [],
  abilities: readonly string[] = scene.abilities ?? ABILITIES,
): GameState {
  const state: GameState = {
    version: 21,
    room: scene.id,
    frame: 0,
    seed: seed >>> 0,
    rng: seedRng(seed),
    prevInput: 0,
    player: createPlayer(scene.spawn.x, scene.spawn.y, t, scene),
    pickups: createPickups(scene),
    pods: createPods(scene),
    lures: createLures(scene, t),
    enemies: createEnemies(scene, t),
    goal: createGoal(scene),
    save: { abilities: normalizeAbilities(abilities) },
    exit: null,
    caught: null,
    hatch: createHatch(scene),
  };
  events.push({ type: 'spawn', x: scene.spawn.x, y: scene.spawn.y });
  return state;
}

/**
 * The room starts again (after an exit, until neighbouring rooms exist): everything that belongs to
 * the room is rebuilt from the scene, as at boot; `save`, the frame count, the seed and the RNG go on.
 */
function restartRoom(state: GameState, t: Tuning, scene: Scene, from: string, events: SimEvent[]): void {
  events.push({ type: 'roomEnter', room: scene.id, from, x: scene.spawn.x, y: scene.spawn.y });
  const fresh = createState(state.seed, t, scene, events, state.save.abilities);
  Object.assign(state, { ...fresh, frame: state.frame, rng: state.rng, save: state.save });
}

/**
 * Where a caught fall puts her back: her last safe ground, moved `room.returnInset` px in from the end
 * of the top she fell from. A rolling top is a run of abutting rects whose tops differ by at most
 * `ground.stepUp`: the run is the top, and she lands on whichever of its rects is under the new x.
 */
function returnPoint(sx: number, sy: number, scene: Scene, t: Tuning): { x: number; y: number } {
  const solids = scene.solids;
  const step = Math.max(0, Math.round(t.ground.stepUp));
  const at = solids.find((q) => q.y === sy && sx >= q.x && sx < q.x + q.w);
  if (!at) return { x: sx, y: sy };
  const next = (q: SolidRect, dir: 1 | -1): SolidRect | undefined =>
    solids.find(
      (o) =>
        o !== q &&
        o.tag !== 'trunk' &&
        Math.abs(o.y - q.y) <= step &&
        (dir > 0 ? o.x === q.x + q.w : o.x + o.w === q.x),
    );
  let x0 = at.x;
  let x1 = at.x + at.w;
  for (let q = next(at, -1); q; q = next(q, -1)) x0 = q.x;
  for (let q = next(at, 1); q; q = next(q, 1)) x1 = q.x + q.w;
  const inset = Math.min(Math.round(t.room.returnInset), Math.floor((x1 - x0) / 2));
  const x = Math.round(Math.max(x0 + inset, Math.min(x1 - inset, sx)));
  const under = solids.find(
    (q) => q.tag !== 'trunk' && x >= q.x && x < q.x + q.w && Math.abs(q.y - sy) <= 4 * step + 1,
  );
  return { x, y: under ? under.y : sy };
}

/** The catch zone her box centre is in, if any. */
function inCatch(state: GameState, scene: Scene): string | null {
  const zones = scene.catches;
  if (!zones) return null;
  const p = state.player;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (const z of zones) if (cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h) return z.id;
  return null;
}

/** Her box centre has crossed an open edge of the room: she is leaving by that exit. */
function crossedExit(state: GameState, scene: Scene): { id: string; edge: 'n' | 's' | 'e' | 'w' } | null {
  const exits = scene.exits;
  if (!exits) return null;
  const p = state.player;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (const e of exits) {
    const along = e.edge === 'n' || e.edge === 's' ? cx : cy;
    if (along < e.from || along > e.to) continue;
    const out =
      e.edge === 's'
        ? cy > (e.at ?? scene.height)
        : e.edge === 'n'
          ? cy < (e.at ?? 0)
          : e.edge === 'e'
            ? cx > (e.at ?? scene.width)
            : cx < (e.at ?? 0);
    if (out) return e;
  }
  return null;
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
  // Placed back in the room: whatever exit she was leaving by, or fall she was caught in, is
  // forgotten, and a hatching still under way is over (she is out, silently: no `hatch` event).
  state.exit = null;
  state.caught = null;
  if (state.hatch) state.hatch.done = true;
  events.push({ type: 'spawn', x, y });
}

/** Advances the sim by exactly one 1/60 s step, mutating `state` and appending to `events`. */
export function step(state: GameState, input: InputFrame, t: Tuning, scene: Scene, events: SimEvent[]): void {
  const P = resolveParams(t, state.save.abilities);
  const first = events.length;
  // Leaving the room: no input reaches her while the room holds her, then it starts again.
  if (state.exit) {
    if (++state.exit.frames >= Math.max(1, Math.round(t.room.exitFrames))) {
      restartRoom(state, t, scene, state.exit.id, events);
      state.frame++;
      return;
    }
  }
  // Caught after a fall: held a moment, then back on her last safe ground (it costs nothing).
  if (state.caught && ++state.caught.frames >= Math.max(1, Math.round(t.room.catchFrames))) {
    const id = state.caught.id;
    const back = returnPoint(state.player.safeX, state.player.safeY, scene, t);
    const x = back.x;
    const y = back.y;
    events.push({ type: 'fallReturn', id, x, y });
    placePlayer(state, x, y, t, scene, events);
  }
  // Shut in the cocoon: presses stir it, no input moves her.
  const shut = updateHatch(state, scene, input, state.prevInput, t, events);
  const live = state.exit || state.caught || shut ? 0 : input;
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
  const ran = updatePlayer(state, scene, held ? heldInput(state, scene, t.goal) : live, P, t.pods, events);
  // Her offer (memory/giving.md): a glint given this step, one arriving.
  updateOffer(state, scene, t, held ? 0 : live, held, events);
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
      // A blow knocks her out of a lure's hold (memory/lures.md).
      if (state.player.lure >= 0) freePlayer(state, scene, t, 'hurt', events);
    }
    enemyTouched(state, scene, touch, dir, t, events);
  }
  if (ran) trackSafeGround(state, scene, P);
  if (!state.exit && !state.caught) {
    const id = inCatch(state, scene);
    if (id) {
      const frames = Math.max(1, Math.round(t.room.catchFrames));
      state.caught = { id, frames: 0 };
      events.push({ type: 'fallCatch', id, x: p.x + p.w / 2, y: p.y + p.h, frames });
    }
  }
  if (!state.exit && !state.caught) {
    const out = crossedExit(state, scene);
    if (out) {
      const frames = Math.max(1, Math.round(t.room.exitFrames));
      state.exit = { id: out.id, frames: 0 };
      events.push({ type: 'roomExit', id: out.id, edge: out.edge, x: p.x + p.w / 2, y: p.y + p.h, frames });
    }
  }
  updatePods(state, scene, t.pickups.comboFrames, events);
  updatePickups(state, scene, t.pickups, events);
  updateDrops(state, t.pickups, events);
  updateGoal(state, scene, t, live, events, first);
  markSeen(state, t);
  markOfferTarget(state, scene, t, goalHolds(state.goal, t.goal));
  // Presses are edges of the real input (the hatching counts them while `live` is 0).
  state.prevInput = shut ? input : live;
  state.frame++;
}

export type { AbilityId } from './abilities';
export { ABILITIES, isAbility, normalizeAbilities } from './abilities';
export type { SimEvent } from './events';
export { goalHolds, heartBox, lampCost, lanternBox, lanternCost } from './goal';
export { hashState } from './hash';
export { lureHpMax, lureRow } from './lures';
export { slashBox, slashTuning } from './player/attack';
export type {
  EnemyKind,
  EnemySpawn,
  Lantern,
  Lure,
  LureKind,
  Pickup,
  PickupKind,
  Pod,
  PodMount,
  Scene,
} from './scene';
export type {
  AttackDir,
  EnemyMode,
  EnemyState,
  GameState,
  GlintDrop,
  GoalState,
  LanternState,
  LuresState,
  Motion,
  PickupsState,
  PlayerMode,
  PlayerState,
  PodsState,
  SaveState,
} from './state';
export { cloneState } from './state';
