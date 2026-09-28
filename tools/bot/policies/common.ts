/**
 * Reactive fight policies for the fairness bots (combat-spec §6.4, L3 brief §6.1). A policy is a
 * function from what it can see to an input mask. It reacts to the world with a fixed delay
 * (combat.reaction, 12 steps): enemies, sounds and levied objects come from the snapshot taken
 * `delay` steps ago; Kid's own body (position, facing, move, bag) is current, as a player knows
 * their own inputs. Policies are seeded with their own RNG (never the sim's). Every run is recorded
 * as an input list, so it can be saved as a tape and replayed exactly.
 */
import { clonePlain, HeadlessSim } from '../../../src/debug/headless';
import { enemyDef } from '../../../src/sim/ai/schema';
import type { SimEvent } from '../../../src/sim/events';
import { ActionBit } from '../../../src/sim/input';
import type { Enemy, GameState } from '../../../src/sim/state';

export interface Ctx {
  now: GameState;
  seen: GameState;
  frame: number;
  rand: () => number;
  /** The mask sent last step (for press edges). */
  prev: number;
  mem: Record<string, number>;
}

export type Policy = (c: Ctx) => number;

export interface PolicyRun {
  policy: string;
  seed: number;
  cleared: boolean;
  /** Steps until the roomClear event (undefined if never). */
  clearFrame?: number;
  /** Steps until Kid reached G. */
  goalFrame?: number;
  deaths: number;
  hurts: number;
  chinLost: number;
  inputs: number[];
  verbs: Record<string, number>;
  /** Per-step events and hitstop flags (only with `record: true`). */
  steps?: SimEvent[][];
  frozen?: boolean[];
}

export function seededRandom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runPolicy(
  name: string,
  policy: Policy,
  opts: { room?: string; seed: number; maxFrames?: number; delay?: number; record?: boolean },
): PolicyRun {
  const steps: SimEvent[][] = [];
  const frozen: boolean[] = [];
  const room = opts.room ?? 'the-pit';
  const maxFrames = opts.maxFrames ?? 3600;
  const delay = opts.delay ?? 12;
  const sim = new HeadlessSim({ room, seed: opts.seed });
  const hist: GameState[] = [];
  const rand = seededRandom(opts.seed);
  const mem: Record<string, number> = {};
  const inputs: number[] = [];
  const verbs: Record<string, number> = {};
  let prev = 0;
  let deaths = 0;
  let hurts = 0;
  let chinLost = 0;
  let clearFrame: number | undefined;
  let goalFrame: number | undefined;
  for (let f = 0; f < maxFrames; f++) {
    hist.push(clonePlain(sim.state));
    if (hist.length > delay + 1) hist.shift();
    const seen = hist[0] as GameState;
    const mask = policy({ now: sim.state, seen, frame: f, rand, prev, mem });
    if (opts.record) frozen.push(sim.state.hitstop > 0);
    const evs = sim.step(mask);
    if (opts.record) steps.push(evs);
    inputs.push(mask);
    prev = mask;
    for (const e of evs) {
      if (e.type === 'death') deaths++;
      if (e.type === 'hurt') {
        hurts++;
        chinLost += e.dmg;
      }
      if (e.type === 'roomClear' && clearFrame === undefined) clearFrame = f + 1;
      if (e.type === 'moveStart') verbs[e.move] = (verbs[e.move] ?? 0) + 1;
      if (e.type === 'goal') goalFrame = f + 1;
    }
    if (goalFrame !== undefined || sim.state.roomId !== room) break;
  }
  const run: PolicyRun = {
    policy: name,
    seed: opts.seed,
    cleared: clearFrame !== undefined,
    deaths,
    hurts,
    chinLost,
    inputs,
    verbs,
  };
  if (clearFrame !== undefined) run.clearFrame = clearFrame;
  if (goalFrame !== undefined) run.goalFrame = goalFrame;
  if (opts.record) Object.assign(run, { steps, frozen });
  return run;
}

// ---------------------------------------------------------------------------------------------
// Helpers shared by the policies.

export const B = ActionBit;

export function alive(s: GameState): Enemy[] {
  return s.local.enemies.filter((e) => e.state !== 'KO' && e.state !== 'REPOSSESSED');
}

export function kidCx(s: GameState): number {
  return s.player.x + s.player.w / 2;
}

export function cx(e: Enemy): number {
  return e.x + e.w / 2;
}

/** Horizontal gap between Kid's body and the enemy's (negative = overlapping). */
export function gap(s: GameState, e: Enemy): number {
  return Math.abs(cx(e) - kidCx(s)) - (e.w + s.player.w) / 2;
}

export function dirTo(s: GameState, e: Enemy): number {
  return cx(e) >= kidCx(s) ? 1 : -1;
}

const ROOM_MIN_X = 64;
const ROOM_MAX_X = 27 * 64;

/**
 * Where a SEEN enemy probably is now: its delayed snapshot extrapolated by what can be read from
 * it (the known motion of a telegraphed/active attack, otherwise its last velocity). Returns a
 * copy with the predicted x.
 */
export function predict(c: Ctx, e: Enemy): Enemy {
  const age = c.now.frame - c.seen.frame;
  let x = e.x;
  const a = e.attackId ? enemyDef(e.type).attacks[e.attackId] : undefined;
  if (a && (e.state === 'TELEGRAPH' || e.state === 'ACTIVE')) {
    const teleLeft = e.state === 'TELEGRAPH' ? e.timer - e.stateFrame - age : -(e.stateFrame + age);
    const activeFor = Math.min(a.active, Math.max(0, -teleLeft));
    x += e.facing * a.vx * activeFor;
  } else if (e.state === 'CHASE' || e.state === 'PATROL' || e.state === 'RETRIEVE') {
    x += e.vx * age;
  }
  // Knockback slides decay by 1 px/f: sum it over the delay.
  const k = Math.abs(e.kb);
  const n = Math.min(age, Math.ceil(k));
  x += Math.sign(e.kb) * (k * n - (n * (n - 1)) / 2);
  x = Math.max(ROOM_MIN_X, Math.min(ROOM_MAX_X - e.w, x));
  return { ...e, x };
}

export function lr(dir: number): number {
  return dir > 0 ? B.right : dir < 0 ? B.left : 0;
}

/** A press of `bit` this step (a press needs the button up on the previous step). */
export function press(c: Ctx, bit: number): number {
  return (c.prev & bit) !== 0 ? 0 : bit;
}

/** Is Kid (current body) in the vertical band of this enemy's attacks? */
export function sameLevel(s: GameState, e: Enemy): boolean {
  const p = s.player;
  return p.y + p.h > e.y + 4 && p.y + 8 < e.y + e.h;
}

/**
 * Frames from now until a telegraphed or active attack (as SEEN, `delay` steps ago) reaches Kid's
 * current position, or null if it won't (facing away, out of reach, different level). Uses only
 * the delayed snapshot plus the attack data, extrapolated: a reader of telegraphs.
 */
export function threatEta(c: Ctx, e: Enemy): number | null {
  if (e.state !== 'TELEGRAPH' && e.state !== 'ACTIVE') return null;
  const a = enemyDef(e.type).attacks[e.attackId];
  if (!a || a.dmg === 0) return null;
  // Airborne Kid will come down: treat her as on the enemy's level.
  if (c.now.player.grounded && !sameLevel(c.now, e)) return null;
  const age = c.now.frame - c.seen.frame;
  // Frames until the active phase starts, as of now (negative: already active that long).
  const teleLeft = e.state === 'TELEGRAPH' ? e.timer - e.stateFrame - age : -(e.stateFrame + age);
  if (-teleLeft > a.active) return null;
  const moved = teleLeft < 0 ? a.vx * -teleLeft : 0;
  const ex = e.x + e.facing * moved;
  const ecx = ex + e.w / 2;
  if ((kidCx(c.now) - ecx) * e.facing <= -e.w / 2) return null;
  const g = Math.abs(ecx - kidCx(c.now)) - (e.w + c.now.player.w) / 2;
  const box = a.hitboxes[0]?.box;
  const reachBeyond = box ? box[0] + box[2] - e.w : 0;
  const left = a.active - Math.max(0, -teleLeft);
  if (g > a.vx * left + reachBeyond + 8) return null;
  const dist = Math.max(0, g - reachBeyond);
  return Math.max(0, teleLeft) + (a.vx > 0 ? dist / a.vx : 0);
}
