/**
 * The Canopy r15: the kin's sit acted on a timeline (review r14 #3) and the area's quiet moments (review r14 #10).
 *
 *  - **The sit** (`scene.sits`, after `kinSit`): the sim keys the kin's acting, beat by beat, so render and audio play
 *    the same scene (`state.kit.kinSit`, a `kinBeat` event as each beat begins). The sim never moves the kin or her.
 *    Beats and their lengths: `t.kit.kinSit` (`KIN_PHASES` order). She keeps control: walked off past `r + leave`
 *    before the lean, it goes to `stay` (it stays on the limb, looking at the moon).
 *  - **Quiet** (`state.kit.quiet`, `quietMoment` on each change): `column` (the great release until the roof gives:
 *    the den's boss `collapse` count under `collapseRubble`), `sit` (from `kinSit` until the kin stays), `vista`
 *    (`scene.quiet`: `frames` after its flag is saved on this visit, and while she is in the air inside `air` once it
 *    is saved: the glide off the cliff). Render fades the HUD and holds the prompts while it is on.
 *
 * Pure (memory/sim-architecture.md).
 */
import type { SimEvent } from './events';
import type { Scene } from './scene';
import type { GameState, SaveState } from './state';
import type { Tuning } from './tuning';

/** The sit's beats in order (`stay` is the end and open-ended). */
export const KIN_PHASES = [
  'come',
  'look',
  'open',
  'try',
  'fail',
  'turn',
  'answer',
  'fold',
  'lean',
  'stay',
] as const;
export type KinPhase = (typeof KIN_PHASES)[number];

export type QuietWhy = 'column' | 'sit' | 'vista';

/** The sit's live state (room-local). `phase` '' = no sit this visit. */
export interface KinSitState {
  phase: KinPhase | '';
  /** Frames into this beat, and its length (0 for `stay`). */
  t: number;
  frames: number;
  /** The sit's spot (the sim's `scene.sits` entry: where the kin comes to sit by her). */
  x: number;
  y: number;
  /** The answer: 1 if she was still by it as the beat began (render plays her wings opening once). */
  her: number;
}

/** The quiet moment now ('' none) and frames since it began; the vista's frames left (this visit). */
export interface QuietState {
  why: QuietWhy | '';
  t: number;
  vista: number;
}

export function createKinSit(scene: Scene, save: SaveState): KinSitState {
  // (Sat on an earlier visit: it is where it stayed.)
  const s = (scene.sits ?? []).find((q) => save.flags.includes(q.sets));
  return { phase: s ? 'stay' : '', t: 0, frames: 0, x: s?.x ?? 0, y: s?.y ?? 0, her: 0 };
}

export function createQuiet(): QuietState {
  return { why: '', t: 0, vista: 0 };
}

/** A beat's length (frames) from the tuning. */
function beatFrames(t: Tuning, phase: KinPhase): number {
  if (phase === 'stay') return 0;
  return Math.max(1, Math.round(t.kit.kinSit[phase]));
}

function begin(state: GameState, id: string, phase: KinPhase, t: Tuning, events: SimEvent[]): void {
  const k = state.kit.kinSit;
  k.phase = phase;
  k.t = 0;
  k.frames = beatFrames(t, phase);
  if (phase === 'answer') k.her = near(state, k.x, k.y, t.kit.kinSit.answerPx) && still(state) ? 1 : 0;
  events.push({ type: 'kinBeat', id, phase, frames: k.frames, x: k.x, y: k.y, her: k.her });
}

function near(state: GameState, x: number, y: number, r: number): boolean {
  const p = state.player;
  const dx = p.x + p.w / 2 - x;
  const dy = p.y + p.h - y;
  return dx * dx + dy * dy <= r * r;
}

function still(state: GameState): boolean {
  const p = state.player;
  return p.grounded && p.vx === 0 && p.hp > 0 && p.faded === 0;
}

/** One step of the sit's timeline (after `updateSits`, which sends `kinSit`). */
export function updateKinSit(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const k = state.kit.kinSit;
  const sits = scene.sits ?? [];
  // (It begins on this step's `kinSit`.)
  for (const e of events) {
    if (e.type !== 'kinSit') continue;
    const s = sits.find((q) => q.id === e.id);
    k.x = s?.x ?? e.x;
    k.y = s?.y ?? e.y;
    begin(state, e.id, 'come', t, events);
    return;
  }
  if (k.phase === '' || k.phase === 'stay') return;
  const s = sits[0];
  const id = s?.id ?? 'sit';
  k.t++;
  // (She walked off before the lean: it stays, looking at the moon.)
  const r = (s?.r ?? 160) + t.kit.kinSit.leavePx;
  const leanAt = KIN_PHASES.indexOf('lean');
  if (KIN_PHASES.indexOf(k.phase) < leanAt && !near(state, k.x, k.y, r)) {
    begin(state, id, 'stay', t, events);
    return;
  }
  if (k.t < k.frames) return;
  const next = KIN_PHASES[KIN_PHASES.indexOf(k.phase) + 1] ?? 'stay';
  begin(state, id, next, t, events);
}

/** Which quiet moment is on now ('' none). */
function quietNow(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): QuietWhy | '' {
  const q = state.kit.quiet;
  // The column: the great release until the roof gives.
  const b = state.boss;
  if (b && b.stage === 'end' && b.collapse >= 0 && b.collapse < Math.round(t.keeper.collapseRubble))
    return 'column';
  // The sit.
  const k = state.kit.kinSit;
  if (k.phase !== '' && k.phase !== 'stay') return 'sit';
  // The vista: frames after its flag is saved here, and her glide over the valley after it.
  for (const v of scene.quiet ?? []) {
    for (const e of events)
      if (e.type === 'flagSet' && e.flag === v.flag) q.vista = Math.max(1, Math.round(v.frames));
  }
  if (q.vista > 0) {
    q.vista--;
    return 'vista';
  }
  // (Her glide off the cliff, in the air over the valley.)
  const p = state.player;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (const v of scene.quiet ?? []) {
    const a = v.air;
    if (!a || p.grounded || p.faded > 0 || !state.save.flags.includes(v.flag)) continue;
    if (cx >= a.x && cx < a.x + a.w && cy >= a.y && cy < a.y + a.h) return 'vista';
  }
  return '';
}

/** One step of the quiet flag (after the boss and the kit). */
export function updateQuiet(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const q = state.kit.quiet;
  const why = quietNow(state, scene, t, events);
  if (why === q.why) {
    if (why) q.t++;
    return;
  }
  const p = state.player;
  const x = Math.round(p.x + p.w / 2);
  const y = Math.round(p.y + p.h);
  if (q.why) events.push({ type: 'quietMoment', why: q.why, on: 0, x, y });
  q.why = why;
  q.t = 0;
  if (why) events.push({ type: 'quietMoment', why, on: 1, x, y });
}
