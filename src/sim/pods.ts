/**
 * Lumen pods: closed seed-pods of light (`scene.pods`), the first thing the slash can hit.
 *
 *  - A pod is a static box `2 x radius` across, centred on its (x, y). It never touches the player:
 *    she passes through it. Only the slash's hit area does anything to it.
 *  - A slash takes one `hp` per pod, once per slash however many frames they overlap. At 0 the pod
 *    bursts (`podBurst`) and stays open until the scene restarts.
 *  - A burst pod spills `value` glints. They go into the one collectible counter
 *    (`state.pickups.count`), one at a time: the first `releaseFrames` after the burst, the rest
 *    `releaseStagger` apart, each as an ordinary `pickup` event carrying the pod's id and
 *    `pod: true`, continuing the pickup combo. Render uses the gap for the flight to her.
 */
import type { SimEvent } from './events';
import type { Box } from './player/attack';
import type { Scene } from './scene';
import type { AttackDir, GameState, PodsState } from './state';
import type { Tuning } from './tuning';

export function createPods(scene: Scene, t: Tuning['pods']): PodsState {
  const n = scene.pods?.length ?? 0;
  const hp: number[] = [];
  const hitBy: number[] = [];
  const left: number[] = [];
  const timer: number[] = [];
  for (let i = 0; i < n; i++) {
    hp.push(Math.max(1, Math.round(t.hp)));
    hitBy.push(0);
    left.push(0);
    timer.push(0);
  }
  return { hp, hitBy, left, timer, burst: 0 };
}

/** Total value of every pod in the scene. */
export function podsWorth(scene: Scene, t: Tuning['pods']): number {
  return (scene.pods?.length ?? 0) * Math.max(0, Math.round(t.value));
}

/**
 * Applies slash number `seq` (hit area `box`) to every closed pod it overlaps and has not hit yet.
 * Pushes `slashHit` (and `podBurst`) events; returns how many pods it hit this step.
 */
export function slashPods(
  state: GameState,
  scene: Scene,
  box: Box,
  seq: number,
  dir: Exclude<AttackDir, 'none'>,
  facing: number,
  pogo: boolean,
  t: Tuning['pods'],
  events: SimEvent[],
): number {
  const list = scene.pods;
  if (!list || list.length === 0) return 0;
  const s = state.pods;
  const b = state.player;
  const px = b.x + (b.w >> 1);
  const py = b.y + (b.h >> 1);
  const r = t.radius;
  const hitstop = Math.max(0, Math.round(t.hitstopFrames));
  let hits = 0;
  for (let i = 0; i < list.length; i++) {
    const hp = s.hp[i] as number;
    if (hp <= 0 || s.hitBy[i] === seq) continue;
    const p = list[i];
    if (!p) continue;
    if (p.x + r <= box.x || p.x - r >= box.x + box.w || p.y + r <= box.y || p.y - r >= box.y + box.h)
      continue;
    s.hitBy[i] = seq;
    s.hp[i] = hp - 1;
    hits++;
    events.push({
      type: 'slashHit',
      x: p.x,
      y: p.y,
      dir,
      facing,
      target: { kind: 'pod', id: p.id },
      px,
      py,
      pogo,
      hitstop,
    });
    if (hp > 1) continue;
    const value = Math.max(0, Math.round(t.value));
    const frames = Math.max(1, Math.round(t.releaseFrames));
    const stagger = Math.max(1, Math.round(t.releaseStagger));
    s.left[i] = value;
    // +1: updatePods still runs this step, so the first glint lands exactly `frames` steps from now.
    s.timer[i] = value > 0 ? frames + 1 : 0;
    s.burst++;
    events.push({
      type: 'podBurst',
      id: p.id,
      mount: p.mount,
      x: p.x,
      y: p.y,
      dir,
      facing,
      value,
      frames,
      stagger,
    });
  }
  return hits;
}

/** Counts down the glints of burst pods and adds each to the collectible count as it arrives. */
export function updatePods(
  state: GameState,
  scene: Scene,
  t: Tuning['pods'],
  comboFrames: number,
  events: SimEvent[],
): void {
  const list = scene.pods;
  if (!list || list.length === 0) return;
  const s = state.pods;
  const c = state.pickups;
  const b = state.player;
  for (let i = 0; i < list.length; i++) {
    const left = s.left[i] as number;
    if (left <= 0) continue;
    const timer = (s.timer[i] as number) - 1;
    if (timer > 0) {
      s.timer[i] = timer;
      continue;
    }
    const p = list[i];
    if (!p) continue;
    s.left[i] = left - 1;
    s.timer[i] = left > 1 ? Math.max(1, Math.round(t.releaseStagger)) : 0;
    c.combo = c.comboTimer > 0 ? c.combo + 1 : 0;
    c.comboTimer = comboFrames;
    c.count += 1;
    events.push({
      type: 'pickup',
      id: p.id,
      kind: 'glint',
      value: 1,
      x: p.x,
      y: p.y,
      px: b.x + (b.w >> 1),
      py: b.y + (b.h >> 1),
      combo: c.combo,
      total: c.count,
      pod: true,
    });
  }
}
