/**
 * Boss fights: the framework every boss shares (memory/bosses.md, docs/design/creatures.md §5 "boss:
 * phase table, arena lock, cue timeline, name card"). One module per kind supplies its rules
 * (`BossRules`: its phase table, cue timelines, what it does each step); the Weaver is
 * src/sim/boss/weaver.ts.
 *
 *  - **Arena lock.** The room's `boss.arena`: once her whole box is inside it, the `lock` doors seal
 *    (solids while `locked`: `lockedScene`) and the intro cue timeline runs (the name card; nothing
 *    attacks). They open on defeat, and on a fade (the fight starts over when she walks back in).
 *  - **Phase table** (`BossRules.phases`): `bossPhase {phase, name, exam}` as each begins.
 *  - **Cue timeline**: a named set of cues at frame offsets (tuning), fired in order (`bossCue`) and
 *    handed to the kind (`BossRules.cue`). Deterministic: a frame count, nothing else.
 *  - **Retry**: the first lock writes `boss.met` into the save; every later attempt is a retry (the
 *    kind makes the first phase short: the Weaver's rings in `retryOut` start as husks).
 *  - **Defeat**: the save gets `boss.flag` (gates open on it), the boss's flames go into
 *    `save.snuffed` with their moths, the doors open, the defeat timeline runs, then `down` for good.
 *  - **The walk back** is the room's business: a moon patch next to the boss door (the fade re-forms
 *    her there: src/sim/index.ts calls `resetBoss`).
 *
 * Pure: plain data, + - * / sqrt floor round min max abs.
 */
import type { SimEvent } from '../events';
import type { Scene, SolidRect } from '../scene';
import type { BossState, EnemyState, GameState, LuresState, SaveState } from '../state';
import type { Tuning } from '../tuning';
import { at, type BossCtx, type BossRules, lureIndex, runCues, startCues } from './core';
import type { BossSpec } from './data';
import { gloamRules } from './gloam';
import { weaverRules } from './weaver';

export type { BossCtx, BossRules, PhaseRow } from './core';
export { defeat, enemyIndex, lureIndex, setPhase, shift, startCues } from './core';

const RULES: Record<BossSpec['kind'], BossRules> = { weaver: weaverRules, gloamweaver: gloamRules };

/** The rules of a kind of boss. */
export function bossRules(kind: BossSpec['kind']): BossRules {
  return RULES[kind];
}

/** A fresh boss record (stage `wait`). */
function freshBoss(spec: BossSpec): BossState {
  return {
    id: spec.id,
    stage: 'wait',
    phase: 0,
    locked: false,
    retry: false,
    attempt: 0,
    time: 0,
    phaseTime: 0,
    cueSet: '',
    cueFrames: 0,
    cueNext: 0,
    drop: 0,
    pivotX: 0,
    pivotY: 0,
    thread: false,
    len: 0,
    reach: 0,
    side: 1,
    tell: '',
    tellFrames: 0,
    tellX0: 0,
    tellX1: 0,
    safeX: -1,
    dir: 1,
    landX: 0,
    heartDy: 0,
    ux: 0,
    uy: -1,
    exposed: 0,
    throws: 0,
    lunge: 0,
  };
}

/** The pieces of the room a boss sets up (a room's local state while it is being built, or the live state). */
interface BossParts {
  lures: LuresState;
  enemies: EnemyState[];
  save: SaveState;
}

/** A scratch context for setting up (no player moves during init). */
function ctxOf(
  parts: BossParts,
  scene: Scene,
  spec: BossSpec,
  boss: BossState,
  t: Tuning,
  events: SimEvent[],
): BossCtx {
  return { rules: RULES[spec.kind], state: parts as unknown as GameState, scene, spec, boss, t, events };
}

/**
 * The room's boss as she finds it (null without one): beaten for good if the save has its flag, a retry
 * if it has `met`. Sets up the boss's lures (`lures.live`: rows, offsets, shields) and creatures in
 * `parts` (the room's fresh local state).
 */
export function createBoss(scene: Scene, t: Tuning, parts: BossParts): BossState | null {
  const spec = scene.boss;
  if (!spec) return null;
  const n = (scene.lures ?? []).length;
  parts.lures.live = {
    row: new Array<string>(n).fill(''),
    dx: new Array<number>(n).fill(0),
    dy: new Array<number>(n).fill(0),
    shield: new Array<number>(n).fill(0),
  };
  const boss = freshBoss(spec);
  const down = parts.save.flags.includes(spec.flag);
  const retry = !down && parts.save.flags.includes(spec.met);
  boss.retry = retry;
  if (down) boss.stage = 'down';
  RULES[spec.kind].init(ctxOf(parts, scene, spec, boss, t, []), retry, down);
  return boss;
}

/** Is her whole box inside the rect? */
function inside(p: GameState['player'], r: BossSpec['arena']): boolean {
  return p.x >= r.x && p.y >= r.y && p.x + p.w <= r.x + r.w && p.y + p.h <= r.y + r.h;
}

/**
 * One step of the room's boss (src/sim/index.ts: after her move and the level kit, before the creatures
 * move, so a phase that changes this step changes what they do).
 */
export function updateBoss(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const boss = state.boss;
  const spec = scene.boss;
  if (!boss || !spec) return;
  if (boss.stage === 'down') return;
  const c: BossCtx = { rules: RULES[spec.kind], state, scene, spec, boss, t, events };
  const p = state.player;
  if (boss.stage === 'wait') {
    if (p.hp <= 0 || p.faded > 0 || state.exit || state.caught || !inside(p, spec.arena)) return;
    boss.locked = true;
    boss.attempt++;
    boss.time = 0;
    if (!state.save.flags.includes(spec.met)) state.save.flags.push(spec.met);
    const q = at(c);
    events.push({ type: 'bossLock', id: boss.id, x: q.x, y: q.y, retry: boss.retry, attempt: boss.attempt });
    boss.stage = 'intro';
    startCues(c, 'intro');
    RULES[spec.kind].update(c);
    return;
  }
  boss.time++;
  boss.phaseTime++;
  runCues(c);
  if ((boss.stage as BossState['stage']) !== 'down') RULES[spec.kind].update(c);
}

/**
 * She faded in the fight and re-formed in this room (src/sim/index.ts, after `resetEnemies`): the doors
 * open and the boss starts over as on a fresh entry (a retry now: the save has `met`). Its lures and
 * creatures are set up again from the scene. Nothing changes once it is beaten.
 */
export function resetBoss(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const old = state.boss;
  const spec = scene.boss;
  if (!old || !spec || old.stage === 'down' || old.stage === 'end') return;
  if (old.stage === 'wait' && old.phase === 0) return;
  const was = old.locked;
  const fresh = createBoss(scene, t, state);
  if (!fresh) return;
  fresh.attempt = old.attempt;
  state.boss = fresh;
  const c: BossCtx = { rules: RULES[spec.kind], state, scene, spec, boss: fresh, t, events };
  const p = at(c);
  if (was) events.push({ type: 'bossUnlock', id: fresh.id, x: p.x, y: p.y, how: 'reset' });
  let rings = 0;
  for (const id of spec.rings) if ((state.lures.hp[lureIndex(scene, id)] ?? 0) > 0) rings++;
  events.push({ type: 'bossReset', id: fresh.id, x: p.x, y: p.y, retry: fresh.retry, rings });
}

/**
 * Debug and tests (`__game.boss({phase})`, never the sim itself): the fight as phase `n` begins (the
 * doors sealed, the save's `met` set, what earlier phases took already gone).
 */
export function jumpBoss(state: GameState, scene: Scene, t: Tuning, n: number, events: SimEvent[]): void {
  const boss = state.boss;
  const spec = scene.boss;
  if (!boss || !spec || boss.stage === 'down') return;
  if (!state.save.flags.includes(spec.met)) state.save.flags.push(spec.met);
  boss.locked = true;
  boss.cueSet = '';
  const c: BossCtx = { rules: RULES[spec.kind], state, scene, spec, boss, t, events };
  RULES[spec.kind].jump(c, n);
}

/**
 * The scene with the boss's doors as solids while they are sealed (cached per scene: the same object
 * comes back while nothing changes). Tagged `kit: 'gate'`: never safe ground.
 */
const LOCKED = new WeakMap<Scene, Scene>();
export function lockedScene(scene: Scene, boss: BossState | null): Scene {
  const spec = scene.boss;
  if (!boss?.locked || !spec || spec.lock.length === 0) return scene;
  const hit = LOCKED.get(scene);
  if (hit) return hit;
  const doors: SolidRect[] = spec.lock.map((d) => ({
    x: d.x,
    y: d.y,
    w: d.w,
    h: d.h,
    tag: 'trunk',
    kit: 'gate',
  }));
  const eff: Scene = { ...scene, solids: [...scene.solids, ...doors] };
  LOCKED.set(scene, eff);
  return eff;
}
