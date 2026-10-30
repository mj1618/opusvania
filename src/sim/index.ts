/**
 * Sim entry point. Pure and deterministic: (state, input, tuning, scene) -> next state + events.
 * No Pixi, DOM, audio, Math.random or Date.now anywhere under src/sim (enforced by
 * tsconfig.sim.json, biome overrides and tests/unit/sim-purity.test.ts).
 */
import { ABILITIES, normalizeAbilities } from './abilities';
import { lureArc } from './arc';
import { lockedScene, resetBoss, updateBoss } from './boss/index';
import { contactDamage, enemyTouched, resetEnemies, updateEnemies } from './enemies';
import type { SimEvent } from './events';
import { markOfferTarget, updateOffer } from './giving';
import { goalHolds, goalReformed, heldInput, restPoint, updateGoal } from './goal';
import { createHatch, updateHatch } from './hatch';
import { ActionBit, type InputFrame, wasPressed } from './input';
import { afterCatch, catchHold, rearmArenas, updateKit } from './kit';
import { dropGlow, updateLight, withMoss } from './light';
import { commitEmbers, hasEmbers, relightEmbers } from './lures';
import { dropGlints, updateDrops, updatePickups } from './pickups';
import { type MoveParams, resolveParams } from './player/params';
import {
  createPlayer,
  freshStart,
  hurtPlayer,
  keepOffer,
  reformPlayer,
  trackSafeGround,
  updatePlayer,
} from './player/player';
import { updatePods } from './pods';
import { updateGlades, updatePatches, updateSeen, updateShortcuts } from './progress';
import { clearOfThorns, returnPoint } from './return';
import { seedRng } from './rng';
import type { RoomDoor, RoomExit, Scene } from './scene';
import { markSeen } from './seen';
import { cloneSave, type GameState, newSave, type SaveState } from './state';
import type { Tuning } from './tuning';
import { upgradeFlag, withUpgrades } from './upgrades';
import { createLocal, enterRoom, remember, type World, withShortcuts } from './world';

export const SIM_HZ = 60;

/**
 * A fresh run in `scene`: she stands at its spawn. `abilities` = what she owns (default: the room's
 * starting kit, `scene.abilities`, or all of them when the room names none). With a `save` (Continue,
 * a test that starts mid-game) she has what it says instead, and `abilities` is ignored. The hatching
 * plays only in a room the save has not been in.
 */
export function createState(
  seed: number,
  t: Tuning,
  scene: Scene,
  events: SimEvent[] = [],
  abilities: readonly string[] = scene.abilities ?? ABILITIES,
  save?: SaveState,
): GameState {
  const sv = save ? cloneSave(save) : newSave(normalizeAbilities(abilities));
  const first = !sv.visited.includes(scene.id);
  remember(sv.visited, scene.id);
  const S = withShortcuts(scene, sv);
  const state: GameState = {
    version: 22,
    room: scene.id,
    frame: 0,
    seed: seed >>> 0,
    rng: seedRng(seed),
    prevInput: 0,
    player: createPlayer(scene.spawn.x, scene.spawn.y, t, S),
    ...createLocal(S, t, sv, first),
    save: sv,
  };
  events.push({ type: 'spawn', x: scene.spawn.x, y: scene.spawn.y });
  return state;
}

/**
 * Continue (memory/save.md): the run `save` left, standing at its moon patch (the world's start room's
 * spawn if she never rested). Pushes `roomEnter {from: 'continue'}` and `spawn`.
 */
export function continueState(
  seed: number,
  t: Tuning,
  world: World,
  save: SaveState,
  events: SimEvent[] = [],
): GameState {
  const at = save.patch && world.rooms[save.patch.room] ? save.patch : null;
  const room = world.rooms[at ? at.room : world.start];
  if (!room) throw new Error(`continueState: no room "${at ? at.room : world.start}"`);
  const patch = at ? room.scene.patches?.find((p) => p.id === at.id) : undefined;
  const scratch: SimEvent[] = [];
  const state = createState(seed, t, room.scene, scratch, undefined, save);
  // Visited before this boot means no hatching: a Continue never starts in the cocoon.
  if (save.visited.length > 0) state.hatch = null;
  if (patch) {
    placePlayer(state, patch.x, patch.y, t, withShortcuts(room.scene, state.save), scratch);
    state.player.hp = state.player.hpMax;
    state.rest = { at: room.scene.patches?.indexOf(patch) ?? -1, frames: 0, done: true };
  }
  const p = state.player;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  p.safeX = fx;
  p.safeY = fy;
  p.groundX = fx;
  p.groundY = fy;
  events.push({ type: 'roomEnter', room: room.id, from: 'continue', x: fx, y: fy });
  events.push({ type: 'spawn', x: fx, y: fy });
  return state;
}

/**
 * The room starts again (after an exit with nothing beyond it): everything that belongs to the room
 * is rebuilt from the scene, as at boot (the hatching too); `save`, the frame count, the seed and the
 * RNG go on.
 */
function restartRoom(state: GameState, t: Tuning, scene: Scene, from: string, events: SimEvent[]): void {
  events.push({ type: 'roomEnter', room: scene.id, from, x: scene.spawn.x, y: scene.spawn.y });
  const save = state.save;
  const S = withShortcuts(scene, save);
  Object.assign(state, {
    player: createPlayer(scene.spawn.x, scene.spawn.y, t, S),
    ...createLocal(S, t, save, false),
    hatch: createHatch(scene),
    prevInput: 0,
  });
  events.push({ type: 'spawn', x: scene.spawn.x, y: scene.spawn.y });
}

/**
 * Puts her in another room at (x, y) (feet centre), at rest, keeping the save (`__game.goto`, a
 * re-form at a patch in another room). Pushes `roomEnter {from}` and `spawn`.
 */
export function gotoRoom(
  state: GameState,
  t: Tuning,
  world: World,
  to: string,
  x: number,
  y: number,
  from: string,
  events: SimEvent[],
): void {
  state.exit = null;
  state.caught = null;
  enterRoom(state, t, world, to, { kind: 'point', x, y }, from, events);
}

/**
 * The glide-lip assist (a catch zone's `glideAssist`): she is in the air over a zone that has caught her
 * that many times. The wings then open without the button (src/sim/player/player.ts `updateGlide`).
 */
function glideAssistOver(state: GameState, scene: Scene): boolean {
  const zones = scene.catches;
  const p = state.player;
  if (!zones || p.grounded) return false;
  const cx = p.x + p.w / 2;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z?.glideAssist || (state.kit.catchCount[i] ?? 0) < z.glideAssist) continue;
    if (cx >= z.x && cx < z.x + z.w && p.y + p.h <= z.y) return true;
  }
  return false;
}

/**
 * Seam hysteresis (`state.seam`, `room.seamLockFrames`): while the opening she just came in by is shut, an east /
 * west one is a wall just outside the edge (she arrives `entryInset` inside it, clear of it), and no opening of
 * hers carries her back (`crossedExit` skips it: at a top or bottom edge she simply is not carried, as the
 * body that came up through a floor still overlaps its line). Counts the lock down.
 */
function seamScene(scene: Scene, state: GameState, t: Tuning): Scene {
  const seam = state.seam;
  if (!seam) return scene;
  if (++seam.frames > Math.max(0, Math.round(t.room.seamLockFrames))) {
    state.seam = null;
    return scene;
  }
  const e = scene.exits?.find((q) => q.id === seam.exit);
  if (!e || (e.edge !== 'e' && e.edge !== 'w')) return scene;
  const wall = {
    tag: 'ground' as const,
    x: e.edge === 'e' ? scene.width : -64,
    y: e.from,
    w: 64,
    h: e.to - e.from,
  };
  return { ...scene, solids: [...scene.solids, wall] };
}

/**
 * Health from moth milestones (core.md §6, area 1 plan r5): `lights` = milestones in `health.mothMilestones` her
 * freed moths (`save.moths`) have reached; `prev` = the last one reached (0 = none), `next` = the one ahead (0 =
 * all reached). The HUD's "x / 60" is `moths / next`.
 */
export function mothMilestone(t: Tuning, moths: number): { lights: number; prev: number; next: number } {
  let lights = 0;
  let prev = 0;
  let next = 0;
  for (const m of t.health.mothMilestones) {
    if (moths >= m) {
      lights++;
      prev = m;
    } else if (next === 0) next = m;
  }
  return { lights, prev, next };
}

/** `t` with her earned lights on top of `health.max` (`t` itself with none). */
function withMothLights(t: Tuning, moths: number): Tuning {
  const n = mothMilestone(t, moths).lights;
  return n > 0 ? { ...t, health: { ...t.health, max: t.health.max + n } } : t;
}

/**
 * The room's moon patch nearest to her (feet) **at or below** where she lies, if it has one (area 1 r4: a fade
 * near the crown re-forms her at the rest ledge, never past the climb, never above where she was).
 */
function nearestPatch(scene: Scene, p: { x: number; y: number; w: number; h: number }) {
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  let best: NonNullable<Scene['patches']>[number] | undefined;
  let bd = Number.POSITIVE_INFINITY;
  for (const q of scene.patches ?? []) {
    if (q.y < fy) continue;
    const d = (q.x - fx) * (q.x - fx) + (q.y - fy) * (q.y - fy);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
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
function crossedExit(state: GameState, scene: Scene): RoomExit | null {
  const exits = scene.exits;
  if (!exits) return null;
  const p = state.player;
  // (The opening she just came in by does not carry her back yet: seam hysteresis, `seamScene`.)
  const shut = state.seam?.exit;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (const e of exits) {
    if (e.id === shut) continue;
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
  state.player.groundX = old.groundX;
  state.player.groundY = old.groundY;
  // Slashes stay numbered on: targets remember the last slash that hit them (`hitBy`), so a
  // number used again would pass through whatever it hit before.
  state.player.attackSeq = old.attackSeq;
  // (Her glow goes where she goes: Lanternroot.)
  state.player.glow = old.glow;
  keepOffer(state.player, old);
  state.prevInput = 0;
  // Placed back in the room: whatever exit she was leaving by, or fall she was caught in, is
  // forgotten, and a hatching still under way is over (she is out, silently: no `hatch` event).
  state.exit = null;
  state.caught = null;
  if (state.hatch) state.hatch.done = true;
  events.push({ type: 'spawn', x, y });
}

/** The door (`scene.doors`) her feet stand in, grounded, if any. */
function doorAt(state: GameState, scene: Scene, t: Tuning): RoomDoor | null {
  const doors = scene.doors;
  if (!doors) return null;
  const p = state.player;
  if (!p.grounded) return null;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  const hw = Math.round(t.room.doorWidth) >> 1;
  const h = Math.round(t.room.doorHeight);
  for (const d of doors) if (fx >= d.x - hw && fx < d.x + hw && fy > d.y - h && fy <= d.y + 1) return d;
  return null;
}

/** Held through an exit's hold: directions and jump (her run, her glide). No presses can start there. */
const CARRY = ActionBit.left | ActionBit.right | ActionBit.up | ActionBit.down | ActionBit.jump;

/**
 * Advances the sim by exactly one 1/60 s step, mutating `state` and appending to `events`.
 *
 * `world` (memory/world.md): the rooms and their links. Given, an exit leads to its neighbour (or a
 * door to its target) and a fade re-forms her at her last moon patch in whatever room it is in; the
 * room then changes inside the step (`state.room`), and the caller passes that room's scene from the
 * next step on. Without it (tests on one scene, test rooms), an exit restarts the room.
 */
export function step(
  state: GameState,
  input: InputFrame,
  base: Tuning,
  scene: Scene,
  events: SimEvent[],
  world?: World,
): void {
  // The moonlit hollows' upgrades she owns, applied to the numbers (src/sim/upgrades.ts), and the lights her
  // freed moths have earned (`health.mothMilestones`).
  const moths0 = state.save.moths;
  const t = withMothLights(withUpgrades(base, state.save), moths0);
  const P = resolveParams(t, state.save.abilities);
  // (A loaded or placed player made from the bare numbers takes the earned lights silently.)
  if (state.player.hpMax < P.hpMax) state.player.hpMax = P.hpMax;
  const first = events.length;
  state.save.time++;
  // The scene as played: closed shortcuts are solids (memory/world.md), and a boss's doors while sealed.
  // (And Lanternroot's moonmoss that is lit: src/sim/light.ts.)
  const S = withMoss(
    seamScene(lockedScene(withShortcuts(scene, state.save), state.boss), state, t),
    state.light,
  );
  // Leaving the room: no new input reaches her while the room holds her; then the next room, or the
  // room again when nothing is there.
  const ex = state.exit;
  if (ex) {
    ++ex.frames;
    const here = world?.rooms[scene.id];
    const there = ex.to ? world?.rooms[ex.to] : undefined;
    if (there && here) {
      if (ex.frames >= ex.of) {
        const from = `${scene.id}#${ex.id}`;
        const toExit = there.scene.exits?.find((e) => e.id === ex.toExit);
        if (ex.door || !toExit) {
          const d = there.scene.doors?.find((o) => o.id === ex.toExit);
          const at = d ?? there.scene.spawn;
          state.player.vx = 0;
          state.player.vy = 0;
          enterRoom(state, t, world as World, there.id, { kind: 'point', x: at.x, y: at.y }, from, events);
        } else {
          enterRoom(
            state,
            t,
            world as World,
            there.id,
            { kind: 'edge', dx: here.x - there.x, dy: here.y - there.y, exit: toExit },
            from,
            events,
          );
          // (Up through a top edge: the rise she had as she crossed, not what the hold left of it.)
          if (scene.exits?.find((e) => e.id === ex.id)?.edge === 'n')
            state.player.vy = Math.min(state.player.vy, ex.vy);
        }
        remember(state.save.crossed, `${there.id}:${ex.toExit}`);
        state.frame++;
        return;
      }
      // The dip: she goes on as she was (the input she held as she crossed), the room stands still.
      updatePlayer(state, S, ex.input, P, t.pods, events);
      state.prevInput = ex.input;
      state.frame++;
      return;
    }
    if (ex.frames >= ex.of) {
      restartRoom(state, t, scene, ex.id, events);
      state.frame++;
      return;
    }
  }
  // Caught after a fall: held a moment, then back on her last safe ground (it costs nothing).
  if (state.caught && ++state.caught.frames >= catchHold(state, t)) {
    const id = state.caught.id;
    // The last ground she stood on (any length of time), inset from its lip: a fall costs the gap. A zone
    // may name its own return point (`back`: the glade's lip top).
    const zoneBack = S.catches?.find((z) => z.id === id)?.back;
    const safe = zoneBack ?? returnPoint(state.player.groundX, state.player.groundY, S, t);
    // (Not where her natural next jump carries her straight back into thorns.)
    const back = clearOfThorns(state, safe.x, safe.y, state.player.groundX, S, t, P);
    const x = back.x;
    const y = back.y;
    const from = state.player;
    events.push({
      type: 'fallReturn',
      id,
      x,
      y,
      fromX: from.x + from.w / 2,
      fromY: from.y + from.h,
      fadeIn: Math.max(0, Math.round(t.room.returnFadeIn)),
    });
    placePlayer(state, x, y, t, S, events);
    // (No free double jump for one who does not own it: the fresh player carries the tuning's, and the Canopy's first
    // fling (r8) was crossed after a miss by a walk-off and an air jump.)
    state.player.dj = Math.min(state.player.dj, P.doubleJumps);
    afterCatch(state, t);
    // A fade-in, and what she held waits to be pressed again (no chain back into the hazard).
    freshStart(state.player, t);
  }
  // Shut in the cocoon: presses stir it, no input moves her.
  const shut = updateHatch(state, S, input, state.prevInput, t, events);
  // A held story beat (a trigger's `hold`, src/sim/kit.ts): no input while it lasts; a button still held as
  // it ends is not a press (she would jump the moment it let go).
  const story = state.kit.story > 0;
  const storyEnd = story && --state.kit.story === 0;
  if (storyEnd) {
    const sp = state.player;
    events.push({ type: 'storyHoldEnd', id: state.kit.storyBy, x: sp.x + sp.w / 2, y: sp.y + sp.h });
    // Its `endSets` flag (the finale's east gate opens on the cloud's lift).
    const tr = S.triggers?.find((q) => q.id === state.kit.storyBy);
    if (tr?.endSets && !state.save.flags.includes(tr.endSets)) {
      state.save.flags.push(tr.endSets);
      events.push({ type: 'flagSet', flag: tr.endSets, by: tr.id, x: tr.x + tr.w / 2, y: tr.y + tr.h / 2 });
    }
  }
  const live = state.exit || state.caught || shut || story ? 0 : input;
  // The end of a fade: she re-forms at her last moon patch (any room: everything earned is kept),
  // else at the last light / safe ground, and the living enemies go home.
  if (state.player.faded > 0 && --state.player.faded === 0) {
    // (An arena's door shut behind her opens again: the lock-in re-arms, as HK's does on a death.)
    rearmArenas(scene, state.save, state.enemies);
    // (In a glow room all her glow lies where she fell instead: src/sim/light.ts.)
    if (S.glow) dropGlow(state, S, events);
    else dropGlints(state, S, t.health.fadeDrop, events);
    const patch = state.save.patch;
    const pr = patch && world ? world.rooms[patch.room] : undefined;
    const pp = pr && patch ? pr.scene.patches?.find((q) => q.id === patch.id) : undefined;
    // A room that keeps its fades (`reformPatch`, the oak): its own moon patch nearest to where she lay, at
    // or below her; with none there, the rules below (the saved patch, the room's `reform`, her door).
    const near = S.reformPatch ? nearestPatch(S, state.player) : undefined;
    if (near) {
      reformPlayer(state, S, P, events, near);
      state.player.hp = state.player.hpMax;
      state.rest = { at: S.patches?.indexOf(near) ?? -1, frames: 0, done: true };
      resetEnemies(state, S, t, events);
      resetBoss(state, scene, t, events);
    }
    // A death re-forms her in the room she died in (area 1 plan r5, item 5): in lamp rooms the saved patch
    // counts only when it is in this room; else the room's `reform` point, else her door (below). (The test
    // grove's rule: a patch anywhere unless the room names its own `reform`.)
    // (A glow room, Lanternroot: HK's bench, the last patch rested at anywhere in the world: the boss's retry is
    // the hall's patch over the seal.)
    else if (
      pr &&
      pp &&
      world &&
      (pr.id === scene.id || S.glow === true || (S.senses !== 'lamp' && !S.reform))
    ) {
      if (pr.id !== scene.id) {
        // Another room: she re-forms there (the room's creatures are fresh anyway).
        gotoRoom(state, t, world, pr.id, pp.x, pp.y, 'reform', events);
        const there = withShortcuts(pr.scene, state.save);
        reformPlayer(state, there, P, events, pp);
        state.player.hp = state.player.hpMax;
        const i = pr.scene.patches?.indexOf(pp) ?? -1;
        state.rest = { at: i, frames: 0, done: true };
        events.push({ type: 'spawn', x: pp.x, y: pp.y });
        state.prevInput = 0;
        state.frame++;
        return;
      }
      reformPlayer(state, S, P, events, pp);
      state.player.hp = state.player.hpMax;
      const i = scene.patches?.indexOf(pp) ?? -1;
      state.rest = { at: i, frames: 0, done: true };
      resetEnemies(state, S, t, events);
      resetBoss(state, scene, t, events);
    } else {
      const light = restPoint(state, S, t);
      // (No light: the room's own re-form point, if it names one, else her door into this room: never
      // beside what faded her (feel review round 2, problem 7); her safe ground only if she never stood here.)
      // (The test grove and scenes built in code, `senses` wallet, keep the old rule: her safe ground.)
      const door = S.senses === 'lamp' ? (state.entry ?? undefined) : undefined;
      reformPlayer(state, S, P, events, light ?? S.reform ?? door);
      goalReformed(state.goal, light);
      resetEnemies(state, S, t, events);
      resetBoss(state, scene, t, events);
    }
  }
  // From the end of the run on she is held (no input reaches her; she walks into the heart and
  // stops) and nothing can hurt her.
  const held = goalHolds(state.goal, t.goal);
  state.player.wingsAssist = glideAssistOver(state, S);
  const ran = updatePlayer(state, S, held ? heldInput(state, S, t.goal) : live, P, t.pods, events);
  // (After its last held step: whatever she still holds is not a press when input comes back.)
  if (storyEnd) state.player.inputLock = 0xffff;
  // Her offer (memory/giving.md): a glint given this step, one arriving.
  // (Giving is the test grove's: in lamp rooms there is no offer, no wallet to give from; the key does nothing.)
  if (S.senses !== 'lamp') updateOffer(state, S, t, held ? 0 : live, held, events);
  // The level kit (memory/level-kit.md): triggers set flags, gates open, thorns hurt and send her back.
  updateKit(
    state,
    S,
    t,
    (dir, damage, id, hitX, hitY) => {
      hurtPlayer(state, P, dir, damage, { kind: 'thorns', id }, hitX, hitY, events);
      // Thorns end a fling chain: its embers burn again.
      relightEmbers(state, S, t, events);
    },
    events,
    (live & ActionBit.jump) !== 0,
  );
  // While she aims a fling the world slows: the boss and the creatures move one step in `flingSlowEvery`, and
  // nothing touches her (memory/lures.md).
  const aiming = state.player.fling >= 0;
  const slowed = aiming && state.frame % Math.max(1, Math.round(t.lures.flingSlowEvery)) !== 0;
  // A boss fight (memory/bosses.md): the lock, its phases and cues, before its creature moves.
  if (!slowed) updateBoss(state, S, t, events);
  const touch = slowed ? -1 : updateEnemies(state, S, t, events, first);
  const p = state.player;
  const e0 = touch >= 0 && !aiming ? state.enemies[touch] : undefined;
  // (The Moonstep: her dash goes through a creature's touch unhurt.)
  const e =
    e0 && p.invuln === 0 && p.hp > 0 && moonstepped(state, t, e0.x + e0.w / 2, e0.y + e0.h / 2, events)
      ? undefined
      : e0;
  if (e && p.invuln === 0 && p.hp > 0 && !state.goal.gathered) {
    // (The way she was gliding as it met her: a hawker's blow keeps her on it, canopy r9b.)
    const glide = p.gliding ? (p.vx > 0 ? 1 : p.vx < 0 ? -1 : p.facing) : 0;
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
      // The creature that hit her holds as long as she does (the blow lands: `health.hurtHitstop`).
      e.hitstop = Math.max(e.hitstop, state.player.hitstop);
    }
    enemyTouched(state, S, touch, dir, t, events, glide);
  }
  // A boss's blade (the Mantis: its strike, its cuts, a ripple): its own box, not its body.
  bossBlade(state, S, P, t, slowed || aiming, events);
  // On safe ground after a fling chain: its embers go out for good, or burn again if she landed back where the
  // chain began (a miss); faded, they burn again.
  if (ran && trackSafeGround(state, S, P) && hasEmbers(state)) {
    const q = state.player;
    const back =
      Math.abs(q.groundY - q.chainY) <= t.ground.stepUp &&
      Math.abs(q.groundX - q.chainX) <= t.lures.chainBackPx;
    if (back) relightEmbers(state, S, t, events);
    else commitEmbers(state, S, t, events);
  }
  if (state.player.faded > 0 && hasEmbers(state)) relightEmbers(state, S, t, events);
  // Progress (memory/world.md): shortcuts she pushes open, glades, the moon patch she stands in.
  updateShortcuts(state, scene, events);
  updateGlades(state, scene, events);
  updatePatches(state, scene, live, state.prevInput, t, events);
  if (!state.exit && !state.caught) {
    const id = inCatch(state, S);
    if (id) {
      // (Counted per zone: a zone's `glideAssist` opens her wings after that many.)
      const zi = S.catches?.findIndex((z) => z.id === id) ?? -1;
      if (zi >= 0) state.kit.catchCount[zi] = (state.kit.catchCount[zi] ?? 0) + 1;
      const frames = Math.max(1, Math.round(t.room.catchFrames));
      state.caught = { id, frames: 0 };
      events.push({ type: 'fallCatch', id, x: p.x + p.w / 2, y: p.y + p.h, frames });
      // A fall ends a fling chain: its embers burn again.
      relightEmbers(state, S, t, events);
    }
  }
  if (!state.exit && !state.caught) {
    const out = crossedExit(state, S);
    // (Out of the room in flight: the chain carried her; its embers go out for good.)
    if (out && hasEmbers(state)) commitEmbers(state, S, t, events);
    // An exit the other side of a one-way drop is arrival only: crossing it does nothing.
    const link = out && world ? world.links[`${scene.id}#${out.id}`] : undefined;
    if (out && link !== null) {
      const to = link?.to ?? '';
      const frames = Math.max(1, Math.round(to ? t.room.transitionFrames : t.room.exitFrames));
      state.exit = {
        id: out.id,
        frames: 0,
        of: frames,
        input: live & CARRY,
        to,
        toExit: link?.exit ?? '',
        door: false,
        vy: p.vy,
      };
      if (to) remember(state.save.crossed, `${scene.id}:${out.id}`);
      events.push({
        type: 'roomExit',
        id: out.id,
        edge: out.edge,
        x: p.x + p.w / 2,
        y: p.y + p.h,
        frames,
        to,
      });
    }
  }
  if (!state.exit && !state.caught && world && wasPressed(live, state.prevInput, 'up')) {
    const d = doorAt(state, S, t);
    const link = d ? world.doors[`${scene.id}#${d.id}`] : undefined;
    if (d && link) {
      const frames = Math.max(1, Math.round(t.room.transitionFrames));
      state.exit = {
        id: d.id,
        frames: 0,
        of: frames,
        input: 0,
        to: link.to,
        toExit: link.exit,
        door: true,
        vy: 0,
      };
      remember(state.save.crossed, `${scene.id}:${d.id}`);
      events.push({
        type: 'roomExit',
        id: d.id,
        edge: 'door',
        x: p.x + p.w / 2,
        y: p.y + p.h,
        frames,
        to: link.to,
      });
    }
  }
  updatePods(state, S, t.pickups.comboFrames, events);
  updatePickups(state, S, t.pickups, events);
  updateDrops(state, t.pickups, events);
  updateGoal(state, S, t, live, events, first);
  // Lanternroot's light (src/sim/light.ts): the gust, moonwicks, moss, pods, respawns, heartwood, the glow paid.
  updateLight(state, S, t, events, first);
  markSeen(state, t);
  if (S.senses !== 'lamp') markOfferTarget(state, S, t, goalHolds(state.goal, t.goal));
  else if (state.player.offerTarget) state.player.offerTarget = null;
  updateSeen(state, scene, t);
  // A moth milestone crossed this step (a snuff's moths): one more light, and that light filled.
  const gained = mothMilestone(base, state.save.moths).lights - mothMilestone(base, moths0).lights;
  if (gained > 0) {
    const hp = state.player;
    hp.hpMax += gained;
    hp.hp = Math.min(hp.hpMax, hp.hp + gained);
    events.push({
      type: 'healthUp',
      x: hp.x + hp.w / 2,
      y: hp.y + hp.h,
      hpMax: hp.hpMax,
      hp: hp.hp,
      moths: state.save.moths,
      milestone: mothMilestone(base, state.save.moths).prev,
    });
  }
  // Aiming a fling: the flight a release now gives, for render (src/sim/arc.ts). Last in the step.
  if (state.player.fling >= 0) state.player.lureArc = lureArc(state, S, t, P, live);
  else if (state.player.lureArc.length > 0) state.player.lureArc = [];
  // Presses are edges of the real input (the hatching counts them while `live` is 0).
  state.prevInput = shut ? input : live;
  state.frame++;
}

export type { AbilityId } from './abilities';
export { ABILITIES, isAbility, normalizeAbilities } from './abilities';
export type { SimEvent } from './events';
export { goalHolds, heartBox, lampCost, lanternBox, lanternCost } from './goal';
export { hashState } from './hash';
export type { KitState } from './kit';
export { barkHpMax } from './kit';
export type { Bark, FlagGate, FlagTrigger, SeedCase, Swing, Thorns } from './kit-data';
export { lureAt, lureHpMax, lureRow } from './lures';
export { cycleSine, swingOffset } from './paths';
export { slashBox, slashTuning } from './player/attack';
export { patchBox, restAt } from './progress';
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
export { cloneSave, cloneState, newSave } from './state';
export { isUpgrade, UPGRADE_IDS, type UpgradeId, upgradeFlag, upgradesOwned, withUpgrades } from './upgrades';
export type { Entry, ExitLink, World, WorldRoom } from './world';
export { enterRoom, exitSegment, linkWorld, mirrorOf, withShortcuts } from './world';

/**
 * The Moonstep (the boss rush's upgrade): in a dash she goes through a blow unhurt. True = this blow is dodged
 * (`bossDodge`, once in `bossRush.dodgeGap` frames, at `x`, `y`).
 */
function moonstepped(state: GameState, t: Tuning, x: number, y: number, events: SimEvent[]): boolean {
  const p = state.player;
  if (p.mode !== 'dash' || !state.save.flags.includes(upgradeFlag('moonstep'))) return false;
  const b = state.boss;
  if (b && state.frame - b.dodged > Math.max(1, Math.round(t.bossRush.dodgeGap))) {
    b.dodged = state.frame;
    events.push({ type: 'bossDodge', id: b.id, x: Math.round(x), y: Math.round(y) });
  }
  return true;
}

/** A boss's live blade box (`boss.hit*`, src/sim/boss/mantis.ts) meets her: a hurt, unless she Moonsteps through. */
function bossBlade(
  state: GameState,
  S: Scene,
  P: MoveParams,
  t: Tuning,
  held: boolean,
  events: SimEvent[],
): void {
  const b = state.boss;
  const p = state.player;
  if (!b || b.hitW <= 0 || held || b.stage !== 'fight') return;
  if (p.invuln > 0 || p.hp <= 0 || p.faded > 0 || state.goal.gathered) return;
  if (!(p.x < b.hitX + b.hitW && b.hitX < p.x + p.w && p.y < b.hitY + b.hitH && b.hitY < p.y + p.h)) return;
  const hitX = (Math.max(p.x, b.hitX) + Math.min(p.x + p.w, b.hitX + b.hitW)) / 2;
  const hitY = (Math.max(p.y, b.hitY) + Math.min(p.y + p.h, b.hitY + b.hitH)) / 2;
  if (moonstepped(state, t, hitX, hitY, events)) return;
  const id = S.boss?.creature ?? b.id;
  const e = state.enemies.find((q) => q.id === id);
  const ec = e ? e.x + e.w / 2 : b.hitX + b.hitW / 2;
  const pc = p.x + p.w / 2;
  const dir = pc < ec ? -1 : pc > ec ? 1 : -p.facing;
  hurtPlayer(state, P, dir, 1, { kind: e?.kind ?? 'mantis', id }, hitX, hitY, events);
  if (e) e.hitstop = Math.max(e.hitstop, state.player.hitstop);
}
