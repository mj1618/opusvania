/**
 * Lumen pods: closed seed-pods of light (`scene.pods`), the first thing the slash can hit.
 *
 *  - A pod is a static box `2 x radius` across, centred on its (x, y). It never touches the player:
 *    she passes through it. Only the slash's hit area does anything to it.
 *  - A pod has 1 to 3 hit points (`hp` in the scene). A slash takes its `power` (1, or 2 for the
 *    finisher) once per slash however many frames they overlap. While it holds: `podHit`. At 0 it
 *    bursts (`podBurst`) and stays open until the scene restarts.
 *  - A pod is worth `value1/2/3` glints by toughness. Each hit that does not burst it knocks
 *    `hitGlints` loose; the burst spills the rest, so the total is always exactly its worth. They go
 *    into the one collectible counter (`state.pickups.count`), one at a time: the first
 *    `releaseFrames` after the hit, the rest a stagger apart, each as an ordinary `pickup` event
 *    carrying the pod's id and `pod: true`, continuing the pickup combo. A new hit restarts the
 *    queue of what is still in flight; its event always says exactly what is coming and when.
 */
import type { SimEvent } from './events';
import type { Box } from './player/attack';
import type { Pod, Scene } from './scene';
import type { AttackDir, GameState, PodsState } from './state';
import type { Tuning } from './tuning';

/** A pod's toughness: its `hp` in the scene, 1 to 3 (default 1). */
export function podHpMax(p: Pod): number {
  return Math.max(1, Math.min(3, Math.round(p.hp ?? 1)));
}

/** What a pod of that toughness is worth in all. */
export function podValue(hpMax: number, t: Tuning['pods']): number {
  return Math.max(0, Math.round(hpMax >= 3 ? t.value3 : hpMax === 2 ? t.value2 : t.value1));
}

export function createPods(scene: Scene): PodsState {
  const hp: number[] = [];
  const hitBy: number[] = [];
  const left: number[] = [];
  const timer: number[] = [];
  const gap: number[] = [];
  const paid: number[] = [];
  for (const p of scene.pods ?? []) {
    hp.push(podHpMax(p));
    hitBy.push(0);
    left.push(0);
    timer.push(0);
    gap.push(0);
    paid.push(0);
  }
  return { hp, hitBy, left, timer, gap, paid, burst: 0 };
}

/** Total value of every pod in the scene. */
export function podsWorth(scene: Scene, t: Tuning['pods']): number {
  let sum = 0;
  for (const p of scene.pods ?? []) sum += podValue(podHpMax(p), t);
  return sum;
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
  step: number,
  power: number,
  knockback: number,
  hitstop: number,
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
  let hits = 0;
  for (let i = 0; i < list.length; i++) {
    const hp = s.hp[i] as number;
    if (hp <= 0 || s.hitBy[i] === seq) continue;
    const p = list[i];
    if (!p) continue;
    if (p.x + r <= box.x || p.x - r >= box.x + box.w || p.y + r <= box.y || p.y - r >= box.y + box.h)
      continue;
    s.hitBy[i] = seq;
    const hpMax = podHpMax(p);
    const hpLeft = Math.max(0, hp - Math.max(1, Math.round(power)));
    s.hp[i] = hpLeft;
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
      step,
      power,
      knockback,
    });
    // Glints set loose by this hit: one or so if it held, all the rest of its worth if it burst.
    const total = podValue(hpMax, t);
    const paid = s.paid[i] as number;
    const loose =
      hpLeft > 0 ? Math.min(Math.max(0, Math.round(t.hitGlints)), total - paid - 1) : total - paid;
    const give = Math.max(0, loose);
    const value = (s.left[i] as number) + give;
    const frames = Math.max(1, Math.round(t.releaseFrames));
    const stagger = Math.max(1, Math.round(value >= t.bigRelease ? t.releaseStaggerBig : t.releaseStagger));
    s.paid[i] = paid + give;
    s.left[i] = value;
    s.gap[i] = stagger;
    // +1: updatePods still runs this step, so the first glint lands exactly `frames` steps from now.
    s.timer[i] = value > 0 ? frames + 1 : 0;
    if (hpLeft > 0) {
      events.push({
        type: 'podHit',
        id: p.id,
        mount: p.mount,
        x: p.x,
        y: p.y,
        dir,
        facing,
        power,
        hpLeft,
        hpMax,
        value,
        frames,
        stagger,
      });
      continue;
    }
    s.burst++;
    events.push({
      type: 'podBurst',
      id: p.id,
      mount: p.mount,
      x: p.x,
      y: p.y,
      dir,
      facing,
      power,
      hpMax,
      total,
      value,
      frames,
      stagger,
    });
  }
  return hits;
}

/** Counts down the glints of burst pods and adds each to the collectible count as it arrives. */
export function updatePods(state: GameState, scene: Scene, comboFrames: number, events: SimEvent[]): void {
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
    s.timer[i] = left > 1 ? Math.max(1, s.gap[i] as number) : 0;
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
