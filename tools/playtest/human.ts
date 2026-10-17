/**
 * The human-like playtester's body and habits (memory/playtest-harness.md "Human-like runs"). STUDIO.md
 * "Cohesion first": bots that play like a person — reaction times, timing and position errors, hesitation, a
 * first-timer's knowledge, the screen as the only view — so a run on video shows how the chunk feels.
 *
 * - `SKILLS`: casual / average / skilled rows of the numbers below.
 * - `Motor`: between intent and keys. A change of intent reaches the keys after a latency with jitter; right
 *   after a surprise (a hit, a creature's tell, a catch, a new room) it waits a sampled reaction time; holds are
 *   cut or stretched; now and then a stray press or a double tap. Deterministic per seed.
 * - `humanPick`: which line a person tries for a move (no look-ahead: a rule of thumb, and on a failure the next
 *   thing on the list), and `humanTactic`: a fight read from the tells on screen.
 * The brain is the planner in personas.ts with `human` set (no look-ahead, its own patience); perception is
 * delayed by the runner (humanrun.ts). Pure: Node and the page.
 */
import { ActionBit } from '../../src/sim/input';
import { rngFloat, seedRng } from '../../src/sim/rng';
import type { EnemyState } from '../../src/sim/state';
import type { Candidate } from './lines';
import type { Move } from './map';

export type Skill = 'casual' | 'average' | 'skilled';
export const SKILL_NAMES: readonly Skill[] = ['casual', 'average', 'skilled'];

export interface SkillRow {
  /** Reaction time to something unexpected, ms (sampled uniformly); x `surprise` when it comes out of nowhere. */
  reactMs: [number, number];
  /** Latency of a planned press or release, frames, and its jitter (+- frames, uniform). */
  latency: number;
  jitter: number;
  /** A hold comes out this fraction longer or shorter (uniform +-). */
  holdErr: number;
  /** Stray presses a minute; the chance a jump or a cut is double tapped. */
  mispressPerMin: number;
  doubleTap: number;
  /** Frames of standing at an edge before a risky jump (uniform). */
  hesitate: [number, number];
  /** Failures at one move before it is dropped (the player tries something else, or explores elsewhere). */
  patience: number;
  /** Frames between what happens and what the brain knows (the screen, the eye). */
  perception: number;
  /** Frames after the cocoon starts listening before the first press (watching the opening). */
  hatchAfter: number;
}

export const SKILLS: Record<Skill, SkillRow> = {
  casual: {
    reactMs: [240, 330],
    latency: 3,
    jitter: 6,
    holdErr: 0.3,
    mispressPerMin: 2,
    doubleTap: 0.04,
    hesitate: [24, 70],
    patience: 3,
    perception: 6,
    hatchAfter: 90,
  },
  average: {
    reactMs: [200, 280],
    latency: 2,
    jitter: 4,
    holdErr: 0.2,
    mispressPerMin: 1,
    doubleTap: 0.02,
    hesitate: [12, 40],
    patience: 4,
    perception: 5,
    hatchAfter: 50,
  },
  skilled: {
    reactMs: [170, 230],
    latency: 1,
    jitter: 2,
    holdErr: 0.1,
    mispressPerMin: 0.3,
    doubleTap: 0.005,
    hesitate: [0, 16],
    patience: 6,
    perception: 4,
    hatchAfter: 25,
  },
};

const J = ActionBit.jump;
const A = ActionBit.attack;
const L = ActionBit.left;
const R = ActionBit.right;
const BITS = [
  ActionBit.left,
  ActionBit.right,
  ActionBit.up,
  ActionBit.down,
  J,
  ActionBit.dash,
  A,
  ActionBit.offer,
];

/** A key change on its way to the keyboard. */
interface Pending {
  at: number;
  bit: number;
  on: boolean;
}

/**
 * Intent in, keys out, with a person's timing. `surprise(f)` marks the next ~0.5 s as a reaction to something
 * unexpected (key changes then wait a reaction time instead of the planned latency).
 */
export class Motor {
  private readonly rng: { rng: number };
  private intent = 0;
  private out = 0;
  private pending: Pending[] = [];
  private readonly lastAt = new Map<number, number>();
  private readonly downSince = new Map<number, number>();
  /** When each held key really went down (its scheduled press). */
  private readonly pressAt = new Map<number, number>();
  private surpriseUntil = -1;
  private surpriseStrength = 1;
  /** Stray presses and double taps so far (for the report). */
  strays = 0;
  doubles = 0;

  constructor(
    readonly row: SkillRow,
    seed: number,
  ) {
    this.rng = { rng: seedRng(seed * 7919 + 17) };
  }

  private r(): number {
    return rngFloat(this.rng);
  }

  /** Something happened she did not plan for: the next changes wait a reaction time (more when `out of nowhere`). */
  surprise(f: number, outOfNowhere = false): void {
    this.surpriseUntil = f + 30;
    this.surpriseStrength = outOfNowhere ? 1.25 : 1;
  }

  private reaction(): number {
    const [a, b] = this.row.reactMs;
    const ms = (a + (b - a) * this.r()) * this.surpriseStrength;
    // The eye's share is already in the brain's perception delay.
    return Math.max(2, Math.round((ms / 1000) * 60) - this.row.perception);
  }

  private schedule(f: number, bit: number, on: boolean, delay: number): void {
    const at = Math.max(f + Math.max(0, Math.round(delay)), (this.lastAt.get(bit) ?? -1) + 1);
    this.lastAt.set(bit, at);
    this.pending.push({ at, bit, on });
  }

  /** The keys held this frame for the brain's `intent`. */
  step(f: number, intent: number): number {
    const changed = intent ^ this.intent;
    const reacting = f < this.surpriseUntil;
    // A press lands after the hands' latency (with jitter), or a reaction time after a surprise. Keys
    // pressed together (down + cut: the pogo) land together: one delay for the chord.
    const chord =
      changed & intent
        ? reacting
          ? this.reaction()
          : this.row.latency + (this.r() * 2 - 1) * this.row.jitter
        : 0;
    for (const bit of BITS) {
      if (!(changed & bit)) continue;
      const on = (intent & bit) !== 0;
      if (on) {
        const delay = chord;
        this.downSince.set(bit, f);
        this.schedule(f, bit, true, delay);
        this.pressAt.set(bit, this.lastAt.get(bit) ?? f);
      } else {
        // A release ends a hold of about the meant length, counted from the real press: a long jump is held
        // "all the way" (if anything too long), any other hold comes out longer or shorter.
        const meant = f - (this.downSince.get(bit) ?? f);
        const err = bit === J && meant >= 12 ? this.r() : this.r() * 2 - 1;
        const held = Math.max(1, Math.round(meant * (1 + err * this.row.holdErr)));
        const at = (this.pressAt.get(bit) ?? f) + held;
        this.schedule(f, bit, false, at - f);
      }
      // Now and then a jump or a cut is tapped twice.
      if (on && (bit === J || bit === A) && this.r() < this.row.doubleTap) {
        const at = (this.lastAt.get(bit) ?? f) + 3;
        this.pending.push({ at, bit, on: false }, { at: at + 3, bit, on: true });
        this.lastAt.set(bit, at + 3);
        this.doubles++;
      }
    }
    this.intent = intent;
    // A stray press: a jump, a cut or the wrong way, for a few frames.
    if (this.r() < this.row.mispressPerMin / 3600) {
      const bit = [J, A, L, R][Math.floor(this.r() * 4)] ?? J;
      if (!(this.out & bit)) {
        const len = 3 + Math.floor(this.r() * 6);
        this.pending.push({ at: f, bit, on: true }, { at: f + len, bit, on: !!(this.intent & bit) });
        this.lastAt.set(bit, Math.max(this.lastAt.get(bit) ?? 0, f + len));
        this.strays++;
      }
    }
    // Apply what is due, in order.
    this.pending.sort((a, b) => a.at - b.at);
    while (this.pending.length && (this.pending[0]?.at ?? Number.POSITIVE_INFINITY) <= f) {
      const p = this.pending.shift() as Pending;
      this.out = p.on ? this.out | p.bit : this.out & ~p.bit;
    }
    return this.out;
  }
}

/** Uniform frames in `[a, b]` from a seeded holder. */
export function sample(rng: { rng: number }, [a, b]: [number, number]): number {
  return Math.round(a + (b - a) * rngFloat(rng));
}

/**
 * The line a person tries for a move: a rule of thumb (under a roof, walk off; a gap past a plain jump, a
 * jump-glide; else a full jump), and after each failure the next thing on the list. `tries` = failures so far.
 */
export function humanPick(
  cands: readonly Candidate[],
  m: Move | null,
  tries: number,
  ctx: { roof: boolean; glide: boolean; plainReach: number; hold: number },
): Candidate | null {
  if (cands.length === 0) return null;
  const first = (re: RegExp) => cands.find((c) => re.test(c.name));
  let prefs: RegExp[] = [];
  const full = new RegExp(`^jump \\(\\d+ px, ${ctx.hold}f\\)`);
  if (!m)
    prefs = ctx.glide
      ? [/^leap: jump-glide/, /^leap: walk-off glide/, /^leap: jump/]
      : [/^leap: jump/, /^leap: hop/];
  else if (m.kind === 'jump' && (m as { lure?: unknown }).lure) {
    // A lamp in the gap: into it and aim the throw (under a roof: off the end, a down cut on its flame).
    prefs = ctx.roof
      ? [/^walk off, cut down on the lamp/, /^walk off into the lamp/, /^hop, cut down/]
      : [/^jump into the lamp/, /^walk off into the lamp/, /cut down on the lamp/];
  } else if (m.kind === 'jump') {
    if (ctx.roof) prefs = [/^walk-off glide/, /^walk off/, /^hop off|^standing hop/, /^jump-glide/, full];
    else if (m.gap > ctx.plainReach && ctx.glide)
      prefs = [/^jump-glide \(/, /^jump \+ double/, /^walk-off glide/];
    else prefs = [full, /^standing hop/, /^jump-glide \(/, /^walk off/];
  } else if (m.kind === 'walk' || m.kind === 'drop')
    prefs = ctx.glide && m.rise > 300 ? [/^walk-off glide/, /^walk off/] : [/^walk off/, /^hop off/];
  const order: Candidate[] = [];
  for (const re of prefs) {
    const c = first(re);
    if (c && !order.includes(c)) order.push(c);
  }
  for (const c of cands) if (!order.includes(c)) order.push(c);
  return order[tries % order.length] ?? null;
}

/** Plans a person moves on to, in order, for a creature that keeps hitting them ('' = read the tells). */
const BAITS: Record<string, readonly string[]> = {
  oldBurrback: ['', 'bait into a wall', 'bait into the far wall'],
  burrback: ['', 'bait into a wall'],
};

/**
 * A fight read from the screen: what the creature is doing now (its tell, its open moment) picks the
 * answer. Names are fight.ts tactics.
 */
export function humanTactic(
  e: EnemyState,
  dist: number,
  hitsTaken = 0,
  patience = 3,
  lampLit = false,
  /** She stands on a ledge well above its ground. */
  above = false,
): string {
  const mode = e.mode as string;
  // The boss (round 5's three phases): its own plan (fight.ts `the den`), its tells read through it.
  if ((e.kind as string) === 'oldBurrback' && (e as unknown as { phase?: number }).phase) return 'the den';
  // It guards a lamp still burning: put the lamp out and it gives up (taught from R3: "snuff and it sleeps").
  // (Not a flyer's: its lamp hangs in the air it hunts, often the throw she needs.)
  const flyer = ['hawker', 'lampwing'].includes(e.kind as string);
  if (lampLit && !flyer && !['windup', 'charge', 'dive'].includes(mode)) return 'snuff its lamp';
  // Learnt the hard way: after `patience` hits from this kind, another plan for it (a person tries
  // something else: a ram that only stops at a wall, so bait it into one).
  const plans = BAITS[e.kind as string];
  const plan = plans ? (plans[Math.floor(hitsTaken / Math.max(1, patience)) % plans.length] ?? '') : '';
  if (plan) return plan;
  const stunned = !!(e as unknown as { stunned?: boolean }).stunned;
  // (The old burrback is open only on its back: stunned. Up from a ram that hit, it is not.)
  const open = stunned || (e.kind !== 'oldBurrback' && ['recover', 'stall', 'hurt'].includes(mode));
  if (open) return 'press and cut';
  switch (e.kind as string) {
    case 'oldBurrback':
      // The ram's tell: jump in it (it carries the ram past or short of her); braced and close: pogo the shell.
      if (mode === 'windup' || mode === 'charge') return 'hop over';
      // (Round 5, its phase 2: a rolling ball; a person jumps it as it comes.)
      if (mode === 'roll') return 'hop over';
      // Safe up on a ledge over its ground: a person comes down to bait it (it does not climb to her).
      if (above) return 'come down';
      if ((e.braced || mode === 'feint') && dist < 160) return 'pogo';
      return dist < 220 ? 'back off' : 'wait';
    case 'burrback':
      if (mode === 'windup' || mode === 'charge') return 'hop over';
      // A small one: walk up and cut it (a person does not stand and wait for it).
      return 'press and cut';
    case 'lampwing':
    case 'hawker':
      if (mode === 'curious' || mode === 'dive') return 'back off';
      return dist < 140 ? 'press and cut' : 'run past';
    default:
      return dist < 200 ? 'press and cut' : 'run past';
  }
}
