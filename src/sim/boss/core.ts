/**
 * What every boss shares (memory/bosses.md): the context a kind's rules get, the phase table's rows, the
 * cue timeline runner, phase changes and defeat. The kinds (src/sim/boss/weaver.ts) and the framework
 * (src/sim/boss/index.ts) both use it; it imports neither (no cycle).
 *
 * Pure: plain data, + - * / floor round min max abs.
 */
import type { SimEvent } from '../events';
import type { Scene } from '../scene';
import type { BossState, GameState } from '../state';
import type { Tuning } from '../tuning';
import type { BossSpec } from './data';

/** What a boss's rules are handed each step. */
export interface BossCtx {
  /** The kind's rules (its phase table, cues, update). */
  rules: BossRules;
  state: GameState;
  /** The room as played (closed shortcuts and the lock are solids). */
  scene: Scene;
  spec: BossSpec;
  boss: BossState;
  t: Tuning;
  events: SimEvent[];
}

/** One phase of the table: its name (the label) and what it tests. */
export interface PhaseRow {
  name: string;
  exam: string;
}

/** A kind of boss. */
export interface BossRules {
  phases: readonly PhaseRow[];
  /** Its cue timelines: set name -> cue name -> frame (from the set's start). */
  cues(t: Tuning): Record<string, Record<string, number>>;
  /**
   * Set up its lures and creatures as she finds them (room entry, a reset): `retry` (the save has
   * `met`), `down` (beaten for good). Runs on a fresh `BossState`.
   */
  init(c: BossCtx, retry: boolean, down: boolean): void;
  /** One step while the fight is on (`intro`, `fight`, `shift`, `end`), after the cues fired. */
  update(c: BossCtx): void;
  /** A cue of a timeline fired. */
  cue(c: BossCtx, set: string, cue: string): void;
  /** Debug and tests (`__game.boss({phase})`): set the fight up as phase `n` begins. */
  jump(c: BossCtx, n: number): void;
}

/** Index of a lure by id (-1 = none). */
export function lureIndex(scene: Scene, id: string | undefined): number {
  if (!id) return -1;
  return (scene.lures ?? []).findIndex((l) => l.id === id);
}

/** Index of a creature by id (-1 = none). */
export function enemyIndex(scene: Scene, id: string | undefined): number {
  if (!id) return -1;
  return (scene.enemies ?? []).findIndex((e) => e.id === id);
}

/** The point the boss's events are at: its creature's box centre, else the arena's centre. */
export function at(c: BossCtx): { x: number; y: number } {
  const e = c.state.enemies[enemyIndex(c.scene, c.spec.creature)];
  if (e && !e.gone) return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
  return { x: c.spec.arena.x + c.spec.arena.w / 2, y: c.spec.arena.y + c.spec.arena.h / 2 };
}

/** Starts cue timeline `set` (its cues at frame 0 fire this step). */
export function startCues(c: BossCtx, set: string): void {
  c.boss.cueSet = set;
  c.boss.cueFrames = -1;
  c.boss.cueNext = 0;
  runCues(c);
}

/** Advances the running timeline one frame and fires its cues that are due, in order. */
export function runCues(c: BossCtx): void {
  const b = c.boss;
  if (b.cueSet === '') return;
  b.cueFrames++;
  const set = c.rules.cues(c.t)[b.cueSet];
  if (!set) {
    b.cueSet = '';
    return;
  }
  // The set's cues by frame (ties keep the tuning's order).
  const list = Object.entries(set)
    .map(([cue, f], i) => ({ cue, f: Math.max(0, Math.round(f)), i }))
    .sort((a, z) => a.f - z.f || a.i - z.i);
  while (b.cueNext < list.length) {
    const q = list[b.cueNext];
    if (!q || q.f > b.cueFrames) break;
    b.cueNext++;
    const name = b.cueSet;
    const p = at(c);
    c.events.push({ type: 'bossCue', id: b.id, x: p.x, y: p.y, set: name, cue: q.cue, frame: q.f });
    c.rules.cue(c, name, q.cue);
    // (A cue may start another set: that one runs on from its own frame 0.)
    if (b.cueSet !== name) return;
  }
  if (b.cueNext >= list.length) b.cueSet = '';
}

/** Phase `n` begins (`bossPhase`). */
export function setPhase(c: BossCtx, n: number): void {
  const b = c.boss;
  b.phase = n;
  b.phaseTime = 0;
  b.stage = 'fight';
  const row = c.rules.phases[n - 1];
  const p = at(c);
  c.events.push({
    type: 'bossPhase',
    id: b.id,
    x: p.x,
    y: p.y,
    phase: n,
    name: row?.name ?? '',
    exam: row?.exam ?? '',
  });
}

/** Between phases: nothing attacks while the timeline `set` runs (its last cue starts the next phase). */
export function shift(c: BossCtx, set: string): void {
  c.boss.stage = 'shift';
  c.boss.tell = '';
  startCues(c, set);
}

/**
 * Beaten: the flag into the save, the boss's flames saved as out with their moths, the doors open, the
 * defeat timeline starts (`down` when it ends: the kind's `done` cue calls `finish`).
 */
export function defeat(c: BossCtx): void {
  const { state, scene, spec, boss } = c;
  const save = state.save;
  if (!save.flags.includes(spec.flag)) {
    save.flags.push(spec.flag);
    const p = at(c);
    c.events.push({ type: 'flagSet', flag: spec.flag, by: spec.id, x: p.x, y: p.y });
  }
  let moths = 0;
  for (const id of [spec.heart, ...spec.rings]) {
    const i = lureIndex(scene, id);
    const l = scene.lures?.[i];
    if (!l) continue;
    const key = `${scene.id}:${id}`;
    if (save.snuffed.includes(key)) continue;
    save.snuffed.push(key);
    const r = state.lures.live?.row[i];
    const row = c.t.lures.kinds[(r || l.kind) as keyof Tuning['lures']['kinds']];
    moths += Math.max(0, Math.round(row.moths));
  }
  save.moths += moths;
  const p = at(c);
  if (boss.locked) {
    boss.locked = false;
    c.events.push({ type: 'bossUnlock', id: boss.id, x: p.x, y: p.y, how: 'defeat' });
  }
  c.events.push({ type: 'bossDefeat', id: boss.id, x: p.x, y: p.y, flag: spec.flag, moths, time: boss.time });
  boss.stage = 'end';
  boss.tell = '';
  startCues(c, 'defeat');
}

/** The defeat timeline is over: beaten for good. */
export function finish(c: BossCtx): void {
  c.boss.stage = 'down';
  c.boss.cueSet = '';
}
